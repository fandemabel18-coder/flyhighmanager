
/**
 * Netlify Function: social-identify (DB)
 * Upserts a player and returns a session token (simple Base64 for MVP).
 */
const { query } = require('./lib/db');

exports.handler = async (event) => {
  if (event.httpMethod === "OPTIONS") return { statusCode: 204, headers: cors() };
  if (event.httpMethod !== "POST") return json(405, { error: "METHOD_NOT_ALLOWED" });
  try {
    const { playerId, nickname } = JSON.parse(event.body || "{}");
    if (!playerId || typeof playerId !== "string") return json(400, { error: "INVALID_PLAYER" });
    if (!isValidNick(nickname)) return json(400, { error: "INVALID_NICK" });

    await query(
      `INSERT INTO social.players (id, nickname)
       VALUES ($1, $2)
       ON CONFLICT (id) DO UPDATE SET nickname = EXCLUDED.nickname, last_seen = NOW()`, 
      [playerId, nickname]
    );

    const sessionToken = Buffer.from(`${playerId}:${Date.now()}`).toString("base64url");
    return json(200, { sessionToken, nickname, isClaimed: false });
  } catch (e) {
    return json(500, { error: "SERVER_ERROR", detail: String(e.message || e) });
  }
};

function isValidNick(n) { return typeof n === 'string' && /^[A-Za-z0-9 _\.\-]{2,20}$/.test(n.trim()); }
function cors(){ return { "Access-Control-Allow-Origin":"*", "Access-Control-Allow-Headers":"Content-Type, Authorization", "Access-Control-Allow-Methods":"GET, POST, OPTIONS" }; }
function json(status, body){ return { statusCode: status, headers: { "Content-Type":"application/json", ...cors() }, body: JSON.stringify(body) }; }
