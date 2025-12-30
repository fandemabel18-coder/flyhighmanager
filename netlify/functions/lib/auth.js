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

function httpError(statusCode, message) {
  const err = new Error(message || 'Error');
  err.statusCode = statusCode;
  return err;
}

async function requireUser(event) {
  const authHeader = event.headers?.authorization || event.headers?.Authorization || '';
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;

  if (!token) throw httpError(401, 'Token no enviado.');

  let payload;
  try {
    payload = jwt.verify(token, JWT_SECRET);
  } catch (e) {
    throw httpError(401, 'Token inválido o expirado.');
  }

  const res = await query(
    'SELECT id, nickname, created_at, last_login_at FROM fhm_users WHERE id = $1',
    [payload.sub]
  );

  if (res.rowCount === 0) throw httpError(404, 'Usuario no encontrado.');
  return { user: res.rows[0], payload };
}

module.exports = { json, requireUser };
