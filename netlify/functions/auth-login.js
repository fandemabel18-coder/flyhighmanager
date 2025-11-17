const { query } = require('./db');
const bcrypt = require('bcryptjs');
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
  if (event.httpMethod !== 'POST') {
    return json(405, { ok: false, error: 'Método no permitido' });
  }

  let body = {};
  try { body = JSON.parse(event.body || '{}'); } catch {}

  const nickname = String(body.nickname || '').trim();
  const password = String(body.password || '').trim();

  if (!nickname || !password) {
    return json(400, { ok: false, error: 'Nickname y contraseña son obligatorios.' });
  }

  try {
    const result = await query(
      'SELECT id, nickname, password_hash FROM fhm_users WHERE nickname = $1',
      [nickname]
    );

    if (result.rowCount === 0) {
      return json(401, { ok: false, error: 'Nickname o contraseña incorrectos.' });
    }

    const user = result.rows[0];
    const match = await bcrypt.compare(password, user.password_hash);

    if (!match) {
      return json(401, { ok: false, error: 'Nickname o contraseña incorrectos.' });
    }

    await query('UPDATE fhm_users SET last_login_at = now() WHERE id = $1', [user.id]);

    const token = jwt.sign(
      { sub: user.id, nickname: user.nickname },
      JWT_SECRET,
      { expiresIn: '30d' }
    );

    return json(200, {
      ok: true,
      user: { id: user.id, nickname: user.nickname },
      token
    });
  } catch (err) {
    console.error('auth-login error', err);
    return json(500, { ok: false, error: 'Error interno al iniciar sesión.' });
  }
};
