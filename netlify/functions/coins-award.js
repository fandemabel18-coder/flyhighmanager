const { query } = require('./db');
const { requireUser, json } = require('./lib/auth');

const EARN_CAP = 100;

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
    const entryType = String(body.type || '').toUpperCase();
    const reason = String(body.reason || '').trim();
    const refId = String(body.refId || '').trim();
    const meta = body.meta ?? null;

    if (!Number.isFinite(amountReq) || amountReq <= 0 || amountReq > 1_000_000) {
      return json(400, { ok: false, error: 'amount inválido.' });
    }
    if (!['EARN', 'BONUS'].includes(entryType)) {
      return json(400, { ok: false, error: 'type inválido (EARN|BONUS).' });
    }
    if (!reason || reason.length > 120) {
      return json(400, { ok: false, error: 'reason inválido.' });
    }
    if (!refId || refId.length > 180) {
      return json(400, { ok: false, error: 'refId inválido.' });
    }

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
      ensure_cap AS (
        INSERT INTO fhm_coin_daily_caps (user_id, day, earned_today)
        VALUES ($1, CURRENT_DATE, 0)
        ON CONFLICT (user_id, day) DO NOTHING
      ),
      existing AS (
        SELECT amount AS already_amount, entry_type AS already_type
        FROM fhm_coin_ledger
        WHERE user_id = $1 AND ref_id = $5
        LIMIT 1
      ),
      cap AS (
        SELECT earned_today
        FROM fhm_coin_daily_caps
        WHERE user_id = $1 AND day = CURRENT_DATE
      ),
      calc AS (
        SELECT
          CASE
            WHEN $2 = 'EARN' THEN GREATEST(0, LEAST($3::int, ${EARN_CAP} - cap.earned_today))
            ELSE $3::int
          END AS award_amount,
          cap.earned_today AS earned_before
        FROM cap
      ),
      ins AS (
        INSERT INTO fhm_coin_ledger (user_id, amount, entry_type, reason, ref_id, meta)
        SELECT $1, calc.award_amount, $2, $4, $5, $6::jsonb
        FROM calc
        WHERE calc.award_amount > 0
          AND NOT EXISTS (SELECT 1 FROM existing)
        ON CONFLICT (user_id, ref_id) DO NOTHING
        RETURNING amount
      ),
      upd_wallet AS (
        UPDATE fhm_wallets
        SET balance = balance + (SELECT COALESCE((SELECT amount FROM ins), 0)),
            updated_at = now()
        WHERE user_id = $1
          AND EXISTS (SELECT 1 FROM ins)
        RETURNING balance
      ),
      upd_cap AS (
        UPDATE fhm_coin_daily_caps
        SET earned_today = earned_today + (SELECT COALESCE((SELECT amount FROM ins), 0)),
            updated_at = now()
        WHERE user_id = $1 AND day = CURRENT_DATE AND $2 = 'EARN'
          AND EXISTS (SELECT 1 FROM ins)
        RETURNING earned_today
      )
      SELECT
        COALESCE((SELECT balance FROM upd_wallet), (SELECT balance FROM fhm_wallets WHERE user_id = $1)) AS balance,
        COALESCE((SELECT amount FROM ins), 0) AS awarded,
        EXISTS(SELECT 1 FROM existing) AS duplicate,
        COALESCE((SELECT earned_today FROM fhm_coin_daily_caps WHERE user_id = $1 AND day = CURRENT_DATE), 0) AS earned_today;
    `;

    const res = await query(sql, [
      user.id,
      entryType,
      Math.floor(amountReq),
      reason,
      refId,
      JSON.stringify(meta || {})
    ]);

    const row = res.rows[0];
    const awarded = Number(row.awarded) || 0;
    const duplicate = !!row.duplicate;
    const earnedToday = Number(row.earned_today) || 0;
    const balance = Number(row.balance) || 0;

    const capped = (!duplicate && entryType === 'EARN' && awarded < Math.floor(amountReq));

    return json(200, {
      ok: true,
      awarded,
      requested: Math.floor(amountReq),
      type: entryType,
      capped,
      duplicate,
      balance,
      earnedToday,
      earnCap: EARN_CAP
    });
  } catch (err) {
    console.error('coins-award error', err);
    const status = err?.statusCode || 500;
    return json(status, { ok: false, error: err?.message || 'Error interno' });
  }
};
