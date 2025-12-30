const { query } = require('./db');
const { requireUser, json } = require('./lib/auth');

function safeJsonParse(s) {
  try { return JSON.parse(s || '{}'); } catch { return null; }
}

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return json(405, { ok: false, error: 'Método no permitido' });
  }

  try {
    const { user } = await requireUser(event);

    const body = safeJsonParse(event.body);
    if (!body) return json(400, { ok: false, error: 'JSON inválido.' });

    const amountReq = Number(body.amount);
    const reason = String(body.reason || '').trim();
    const refId = String(body.refId || '').trim();
    const meta = body.meta ?? null;

    if (!Number.isFinite(amountReq) || amountReq <= 0 || amountReq > 1_000_000) {
      return json(400, { ok: false, error: 'amount inválido.' });
    }
    if (!reason || reason.length > 120) {
      return json(400, { ok: false, error: 'reason inválido.' });
    }
    if (!refId || refId.length > 180) {
      return json(400, { ok: false, error: 'refId inválido.' });
    }

    const amount = Math.floor(amountReq);

    const sql = `
      WITH
      lock AS (
        SELECT pg_advisory_xact_lock(hashtext($1::text))
      ),
      ensure_wallet AS (
        INSERT INTO fhm_wallets (user_id, balance)
        VALUES ($1, 0)
        ON CONFLICT (user_id) DO NOTHING
      ),
      existing AS (
        SELECT 1 AS exists
        FROM fhm_coin_ledger
        WHERE user_id = $1 AND ref_id = $4
        LIMIT 1
      ),
      deduct AS (
        UPDATE fhm_wallets
        SET balance = balance - $2::int,
            updated_at = now()
        WHERE user_id = $1
          AND balance >= $2::int
          AND NOT EXISTS (SELECT 1 FROM existing)
        RETURNING balance
      ),
      ins AS (
        INSERT INTO fhm_coin_ledger (user_id, amount, entry_type, reason, ref_id, meta)
        SELECT $1, -$2::int, 'SPEND', $3, $4, $5::jsonb
        WHERE EXISTS (SELECT 1 FROM deduct)
        ON CONFLICT (user_id, ref_id) DO NOTHING
        RETURNING 1
      )
      SELECT
        COALESCE((SELECT balance FROM deduct), (SELECT balance FROM fhm_wallets WHERE user_id = $1)) AS balance,
        EXISTS(SELECT 1 FROM existing) AS duplicate,
        EXISTS(SELECT 1 FROM deduct) AS spent;
    `;

    const res = await query(sql, [
      user.id,
      amount,
      reason,
      refId,
      JSON.stringify(meta || {})
    ]);

    const row = res.rows[0];
    const balance = Number(row.balance) || 0;
    const duplicate = !!row.duplicate;
    const spent = !!row.spent;

    if (duplicate) {
      return json(200, { ok: true, duplicate: true, spent: false, balance });
    }

    if (!spent) {
      return json(409, { ok: false, error: 'Saldo insuficiente.', balance });
    }

    return json(200, { ok: true, spent: true, balance });
  } catch (err) {
    console.error('coins-spend error', err);
    const status = err?.statusCode || 500;
    return json(status, { ok: false, error: err?.message || 'Error interno' });
  }
};
