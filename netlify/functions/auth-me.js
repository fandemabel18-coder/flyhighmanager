const { query } = require('./db');
const jwt = require('jsonwebtoken');

const JWT_SECRET = process.env.JWT_SECRET || 'CHANGE_ME_IN_PRODUCTION';

function json(status, data) {
  return {
    statusCode: status,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data)
  };
}

exports.handler = async (event) => {
  if (event.httpMethod !== 'GET') {
    return json(405, { ok: false, error: 'Método no permitido' });
  }

  const authHeader = event.headers.authorization || '';
  const token = authHeader.startsWith('Bearer ')
    ? authHeader.slice(7)
    : null;

  if (!token) {
    return json(401, { ok: false, error: 'Token no enviado.' });
  }

  try {
    const payload = jwt.verify(token, JWT_SECRET);
    const result = await query(
      'SELECT id, nickname, created_at, last_login_at FROM fhm_users WHERE id = $1',
      [payload.sub]
    );

    if (result.rowCount === 0) {
      return json(404, { ok: false, error: 'Usuario no encontrado.' });
    }

    return json(200, { ok: true, user: result.rows[0] });
  } catch (err) {
    console.error('auth-me error', err);
    return json(401, { ok: false, error: 'Token inválido o expirado.' });
  }
};
