
/**
 * Netlify Function: social-finish (DB)
 * Validates match and records score.
 * Request: { matchId, nonce, score }
 */
const { query } = require('./lib/db');
const MIN_SECONDS = 6; // duración mínima de una partida para ser válida (ajusta por juego)

exports.handler = async (event) => {
  if (event.httpMethod === "OPTIONS") return { statusCode: 204, headers: cors() };
  if (event.httpMethod !== "POST") return json(405, { error: "METHOD_NOT_ALLOWED" });
  try {
    const auth = event.headers?.authorization || event.headers?.Authorization || "";
    if (!auth.startsWith("Bearer ")) return json(401, { error: "NO_TOKEN" });
    const token = auth.substring(7);
    const playerId = parseToken(token);
    if (!playerId) return json(401, { error: "BAD_TOKEN" });

    const { matchId, nonce, score } = JSON.parse(event.body || "{}");
    if (!matchId || typeof matchId !== "string") return json(400, { error: "INVALID_MATCH" });
    if (typeof score !== "number" || !isFinite(score) || score < 0) return json(400, { error: "BAD_SCORE" });

    // Load match
    const res = await query(`SELECT id, player_id, game_id, nonce, issued_at, used FROM social.matches WHERE id = $1`, [matchId]);
    if (!res.rows.length) return json(400, { error: "MATCH_NOT_FOUND" });
    const m = res.rows[0];
    if (m.player_id !== playerId) return json(401, { error: "NOT_OWNER" });
    if (m.used) return json(409, { error: "MATCH_REUSED" });
    if (m.nonce !== nonce) return json(400, { error: "NONCE_MISMATCH" });

    // Validate duration
    const elapsedSec = (Date.now() - new Date(m.issued_at).getTime()) / 1000;
    if (elapsedSec < MIN_SECONDS) return json(400, { error: "TOO_FAST" });

    // Mark used and insert score
    await query(`UPDATE social.matches SET used = TRUE WHERE id = $1`, [matchId]);

    const scoreId = uuid();
    await query(
      `INSERT INTO social.scores (id, player_id, game_id, value) VALUES ($1, $2, $3, $4)`,
      [scoreId, playerId, m.game_id, score]
    );

    // Compute ranks (simple, may be optimized later)
    const { rows: r1 } = await query(`SELECT COUNT(*)::int AS higher FROM social.scores WHERE game_id = $1 AND value > $2`, [m.game_id, score]);
    const rankGlobal = r1[0].higher + 1;

    const { rows: r2 } = await query(
      `SELECT COUNT(*)::int AS higher
       FROM social.scores
       WHERE game_id = $1 AND value > $2 AND created_at >= (NOW() - INTERVAL '7 days')`,
      [m.game_id, score]
    );
    const rankWeekly = r2[0].higher + 1;

    return json(200, { accepted: true, rankGlobal, rankWeekly });
  } catch (e) {
    return json(500, { error: "SERVER_ERROR", detail: String(e.message || e) });
  }
};

function parseToken(t){ try { return Buffer.from(t, "base64url").toString("utf8").split(":")[0] || null; } catch { return null; } }
function uuid(){ return (require('crypto').randomUUID ? require('crypto').randomUUID() : require('crypto').randomBytes(16).toString('hex')); }
function cors(){ return { "Access-Control-Allow-Origin":"*", "Access-Control-Allow-Headers":"Content-Type, Authorization", "Access-Control-Allow-Methods":"GET, POST, OPTIONS" }; }
function json(status, body){ return { statusCode: status, headers: { "Content-Type":"application/json", ...cors() }, body: JSON.stringify(body) }; }
