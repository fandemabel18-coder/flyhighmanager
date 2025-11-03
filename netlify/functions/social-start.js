
/**
 * Netlify Function: social-start (DB)
 * Requires Authorization: Bearer <sessionToken>
 * Request: { gameId }
 * Response: { matchId, nonce, issuedAt }
 */
const { query } = require('./lib/db');

exports.handler = async (event) => {
  if (event.httpMethod === "OPTIONS") return { statusCode: 204, headers: cors() };
  if (event.httpMethod !== "POST") return json(405, { error: "METHOD_NOT_ALLOWED" });
  try {
    const auth = event.headers?.authorization || event.headers?.Authorization || "";
    if (!auth.startsWith("Bearer ")) return json(401, { error: "NO_TOKEN" });
    const token = auth.substring(7);
    const playerId = parseToken(token);
    if (!playerId) return json(401, { error: "BAD_TOKEN" });

    const { gameId } = JSON.parse(event.body || "{}");
    if (!gameId || typeof gameId !== "string") return json(400, { error: "GAME_UNKNOWN" });

    const matchId = uuid();
    const nonce = uuid().replace(/-/g,'').slice(0,16);
    const issuedAt = new Date();

    await query(
      `INSERT INTO social.matches (id, player_id, game_id, nonce, issued_at, used)
       VALUES ($1, $2, $3, $4, NOW(), FALSE)`,
      [matchId, playerId, gameId, nonce]
    );

    return json(200, { matchId, nonce, issuedAt: issuedAt.getTime() });
  } catch (e) {
    return json(500, { error: "SERVER_ERROR", detail: String(e.message || e) });
  }
};

function parseToken(t){
  try { return Buffer.from(t, "base64url").toString("utf8").split(":")[0] || null; } catch { return null; }
}
function uuid(){ return (require('crypto').randomUUID ? require('crypto').randomUUID() : require('crypto').randomBytes(16).toString('hex')); }
function cors(){ return { "Access-Control-Allow-Origin":"*", "Access-Control-Allow-Headers":"Content-Type, Authorization", "Access-Control-Allow-Methods":"GET, POST, OPTIONS" }; }
function json(status, body){ return { statusCode: status, headers: { "Content-Type":"application/json", ...cors() }, body: JSON.stringify(body) }; }
