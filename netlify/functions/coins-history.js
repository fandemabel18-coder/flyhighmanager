const { query } = require('./db');
const { requireUser, json } = require('./lib/auth');

function decodeCursor(cursor) {
  try {
    const raw = Buffer.from(cursor, 'base64url').toString('utf8');
    const obj = JSON.parse(raw);
    if (!obj || !obj.created_at || !obj.id) return null;
    return obj;
  } catch {
    return null;
  }
}

function encodeCursor(row) {
  const payload = JSON.stringify({ created_at: row.created_at, id: row.id });
  return Buffer.from(payload, 'utf8').toString('base64url');
}

exports.handler = async (event) => {
  if (event.httpMethod !== 'GET') {
    return json(405, { ok: false, error: 'Método no permitido' });
  }

  try {
    const { user } = await requireUser(event);

    const qs = event.queryStringParameters || {};
    const limit = Math.min(Math.max(parseInt(qs.limit || '50', 10) || 50, 1), 100);
    const cursor = qs.cursor ? decodeCursor(qs.cursor) : null;

    let sql = `
      SELECT id, amount, entry_type, reason, ref_id, meta, created_at
      FROM fhm_coin_ledger
      WHERE user_id = $1
    `;
    const params = [user.id];

    if (cursor) {
      sql += ` AND (created_at, id) < ($2::timestamptz, $3::bigint) `;
      params.push(cursor.created_at, cursor.id);
    }

    sql += ` ORDER BY created_at DESC, id DESC LIMIT ${limit + 1}`;

    const res = await query(sql, params);
    const rows = res.rows || [];

    const hasMore = rows.length > limit;
    const page = hasMore ? rows.slice(0, limit) : rows;
    const nextCursor = hasMore ? encodeCursor(page[page.length - 1]) : null;

    return json(200, {
      ok: true,
      items: page.map(r => ({
        id: r.id,
        amount: Number(r.amount),
        type: r.entry_type,
        reason: r.reason,
        refId: r.ref_id,
        meta: r.meta,
        createdAt: r.created_at
      })),
      nextCursor
    });
  } catch (err) {
    console.error('coins-history error', err);
    const status = err?.statusCode || 500;
    return json(status, { ok: false, error: err?.message || 'Error interno' });
  }
};
