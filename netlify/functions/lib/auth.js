const jwt = require('jsonwebtoken');
const { query } = require('../db');

const JWT_SECRET = process.env.JWT_SECRET || 'CHANGE_ME_IN_PRODUCTION';

function json(status, data) {
  return {
    statusCode: status,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data)
  };
}

function getBearerToken(event) {
  const h = event.headers || {};
  const authHeader = h.authorization || h.Authorization || '';
  return authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;
}

/**
 * Verifies JWT and returns the user row from fhm_users.
 * Throws { statusCode, message } on errors.
 */
async function requireUser(event) {
  const token = getBearerToken(event);
  if (!token) {
    throw { statusCode: 401, message: 'Token no enviado.' };
  }

  let payload;
  try {
    payload = jwt.verify(token, JWT_SECRET);
  } catch (err) {
    throw { statusCode: 401, message: 'Token inválido o expirado.' };
  }

  const userId = payload.sub;
  const result = await query(
    'SELECT id, nickname, created_at, last_login_at FROM fhm_users WHERE id = $1',
    [userId]
  );

  if (result.rowCount === 0) {
    throw { statusCode: 404, message: 'Usuario no encontrado.' };
  }

  return { user: result.rows[0], payload };
}

module.exports = { requireUser, json };
