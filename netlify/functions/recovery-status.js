const { query } = require('./db');
const { requireUser, json } = require('./lib/auth');

/**
 * GET /.netlify/functions/recovery-status
 * Requires JWT.
 * Returns whether the user has a recovery key configured.
 */
exports.handler = async (event) => {
  if (event.httpMethod !== 'GET') {
    return json(405, { ok: false, error: 'Método no permitido' });
  }

  try {
    const { user } = await requireUser(event);

    const res = await query(
      'SELECT 1 FROM fhm_recovery_keys WHERE user_id = $1',
      [user.id]
    );

    return json(200, { ok: true, hasRecoveryKey: res.rowCount > 0 });
  } catch (err) {
    console.error('recovery-status error', err);
    const status = err?.statusCode || 500;
    return json(status, { ok: false, error: err?.message || 'Error interno' });
  }
};
