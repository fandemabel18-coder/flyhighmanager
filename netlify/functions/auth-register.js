const { query } = require('./db');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { randomUUID } = require('crypto');

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

  if (!nickname || nickname.length < 3 || nickname.length > 20) {
    return json(400, { ok: false, error: 'El nickname debe tener entre 3 y 20 caracteres.' });
  }

  if (!password || password.length < 4) {
    return json(400, { ok: false, error: 'La contraseña debe tener al menos 4 caracteres.' });
  }

  try {
    const exists = await query('SELECT id FROM fhm_users WHERE nickname = $1', [nickname]);
    if (exists.rowCount > 0) {
      return json(409, { ok: false, error: 'Ya existe una cuenta con ese nickname.' });
    }

    const passwordHash = await bcrypt.hash(password, 10);
    const userId = randomUUID();

    const result = await query(
      'INSERT INTO fhm_users (id, nickname, password_hash) VALUES ($1, $2, $3) RETURNING id, nickname, created_at',
      [userId, nickname, passwordHash]
    );

    const user = result.rows[0];

    const token = jwt.sign(
      { sub: user.id, nickname: user.nickname },
      JWT_SECRET,
      { expiresIn: '30d' }
    );

    return json(200, {
      ok: true,
      user: { id: user.id, nickname: user.nickname, createdAt: user.created_at },
      token
    });
  } catch (err) {
    console.error('auth-register error', err);
    return json(500, { ok: false, error: 'Error interno al registrar.' });
  }
};
