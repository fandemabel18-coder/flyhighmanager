const { query } = require('./db');
const { requireUser, json } = require('./lib/auth');

/**
 * POST /.netlify/functions/promo-redeem
 * Body: { code: string }
 * Rules:
 * - Requires JWT (userId = payload.sub)
 * - 1 redemption per user per code (enforced by UNIQUE)
 * - Optional global limit (max_global_redemptions)
 * - Awards BONUS coins (does NOT count toward daily earn cap)
 */

function normalizeCode(code) {
  return String(code || '')
    .trim()
    .toUpperCase()
    .replace(/\s+/g, '');
}

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return json(405, { ok: false, error: 'Método no permitido' });
  }

  let user;
  try {
    ({ user } = await requireUser(event)); // ✅ IMPORTANTE: await
  } catch (err) {
    console.error('promo-redeem auth error', err);
    return json(err?.statusCode || 401, { ok: false, error: err?.message || 'No autorizado' });
  }

  let body;
  try {
    body = JSON.parse(event.body || '{}');
  } catch {
    return json(400, { ok: false, error: 'JSON inválido' });
  }

  const code = normalizeCode(body.code);
  if (!code || code.length < 3 || code.length > 64) {
    return json(400, { ok: false, error: 'Código inválido' });
  }

  try {
    await query('BEGIN');

    // Lock row para evitar condiciones de carrera
    const promoRes = await query(
      `
      SELECT id, code, amount, is_active, starts_at, ends_at, max_global_redemptions, redeemed_count
      FROM public.fhm_promo_codes
      WHERE code = $1
      FOR UPDATE
      `,
      [code]
    );

    if (promoRes.rowCount === 0) {
      await query('ROLLBACK');
      return json(404, { ok: false, error: 'Código no encontrado' });
    }

    const promo = promoRes.rows[0];

    if (!promo.is_active) {
      await query('ROLLBACK');
      return json(400, { ok: false, error: 'Código inactivo' });
    }

    const nowRes = await query('SELECT now() AS now');
    const now = nowRes.rows[0].now;

    if (promo.starts_at && now < promo.starts_at) {
      await query('ROLLBACK');
      return json(400, { ok: false, error: 'Código aún no disponible' });
    }
    if (promo.ends_at && now > promo.ends_at) {
      await query('ROLLBACK');
      return json(400, { ok: false, error: 'Código expirado' });
    }

    const amount = Number(promo.amount || 0);
    if (!Number.isFinite(amount) || amount <= 0) {
      await query('ROLLBACK');
      return json(500, { ok: false, error: 'Código mal configurado' });
    }

    // 1 por cuenta: intenta insertar redención primero
    const redRes = await query(
      `
      INSERT INTO public.fhm_promo_redemptions (code_id, user_id)
      VALUES ($1, $2)
      ON CONFLICT (code_id, user_id) DO NOTHING
      RETURNING id
      `,
      [promo.id, user.id]
    );

    if (redRes.rowCount === 0) {
      await query('ROLLBACK');
      return json(409, { ok: false, error: 'Ya canjeaste este código' });
    }

    // Límite global (si existe): lo aplicamos después de asegurar que este user no lo había canjeado
    if (promo.max_global_redemptions !== null) {
      const upd = await query(
        `
        UPDATE public.fhm_promo_codes
        SET redeemed_count = redeemed_count + 1
        WHERE id = $1
          AND redeemed_count < max_global_redemptions
        RETURNING redeemed_count
        `,
        [promo.id]
      );

      if (upd.rowCount === 0) {
        await query('ROLLBACK');
        return json(400, { ok: false, error: 'Código agotado' });
      }
    } else {
      await query(
        `UPDATE public.fhm_promo_codes SET redeemed_count = redeemed_count + 1 WHERE id = $1`,
        [promo.id]
      );
    }

    // Ledger BONUS (no toca cap diario)
    const refId = `promo:${promo.id}:${user.id}`;
    await query(
      `
      INSERT INTO public.fhm_coin_ledger (user_id, amount, entry_type, reason, ref_id, meta)
      VALUES ($1, $2, 'BONUS', 'PROMO_REDEEM', $3, $4)
      ON CONFLICT (user_id, ref_id) DO NOTHING
      `,
      [user.id, amount, refId, JSON.stringify({ code: promo.code, codeId: promo.id })]
    );

    // Wallet upsert
    const walletRes = await query(
      `
      INSERT INTO public.fhm_wallets (user_id, balance)
      VALUES ($1, $2)
      ON CONFLICT (user_id) DO UPDATE
        SET balance = public.fhm_wallets.balance + EXCLUDED.balance,
            updated_at = now()
      RETURNING balance
      `,
      [user.id, amount]
    );

    await query('COMMIT');

    return json(200, {
      ok: true,
      code: promo.code,
      codeId: promo.id,
      amount,
      balance: walletRes.rows[0].balance
    });
  } catch (err) {
    console.error('promo-redeem error', err);
    try { await query('ROLLBACK'); } catch {}
    return json(500, { ok: false, error: 'Error interno' });
  }
};
