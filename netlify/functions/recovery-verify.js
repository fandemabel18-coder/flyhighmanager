const { query } = require('./db');
const bcrypt = require('bcryptjs');
const { requireUser, json } = require('./lib/auth');

/**
 * POST /.netlify/functions/recovery-verify
 * Requires JWT.
 * Body: { recoveryKey }
 * Verifies the provided key against stored hash.
 * (Useful for future "recover account" flows or gated actions.)
 */
exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return json(405, { ok: false, error: 'Método no permitido' });
  }

  try {
    const { user } = await requireUser(event);

    let body = {};
    try { body = JSON.parse(event.body || '{}'); } catch {}
    const recoveryKey = String(body.recoveryKey || '').trim();
    if (!recoveryKey) return json(400, { ok: false, error: 'Recovery Key requerida.' });

    const res = await query(
      'SELECT key_hash FROM fhm_recovery_keys WHERE user_id = $1',
      [user.id]
    );
    if (res.rowCount === 0) return json(200, { ok: true, valid: false });

    const valid = await bcrypt.compare(recoveryKey, res.rows[0].key_hash);
    return json(200, { ok: true, valid });
  } catch (err) {
    console.error('recovery-verify error', err);
    const status = err?.statusCode || 500;
    return json(status, { ok: false, error: err?.message || 'Error interno' });
  }
};
