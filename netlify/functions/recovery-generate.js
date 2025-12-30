const { query } = require('./db');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const { requireUser, json } = require('./lib/auth');

/**
 * POST /.netlify/functions/recovery-generate
 * Requires JWT.
 * Generates a new Recovery Key (shown once), stores only a bcrypt hash.
 * Regenerating invalidates the previous key.
 */
exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return json(405, { ok: false, error: 'Método no permitido' });
  }

  try {
    const { user } = await requireUser(event);

    // 24 chars base64url-ish (easy to copy)
    const rawKey = crypto.randomBytes(18).toString('base64url');

    const keyHash = await bcrypt.hash(rawKey, 10);

    await query(
      `INSERT INTO fhm_recovery_keys (user_id, key_hash)
       VALUES ($1, $2)
       ON CONFLICT (user_id) DO UPDATE
         SET key_hash = EXCLUDED.key_hash,
             updated_at = NOW()`,
      [user.id, keyHash]
    );

    return json(200, {
      ok: true,
      recoveryKey: rawKey,
      note: 'Guárdala en un lugar seguro. Se muestra una sola vez. Si la regeneras, la anterior deja de funcionar.'
    });
  } catch (err) {
    console.error('recovery-generate error', err);
    const status = err?.statusCode || 500;
    return json(status, { ok: false, error: err?.message || 'Error interno' });
  }
};
