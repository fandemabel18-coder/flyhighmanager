
/**
 * Netlify Function: social-leaderboard (DB)
 * Query: ?gameId=...&range=global|weekly&limit=100
 * Response: { items:[{ nickname, shortId, score, at }], generatedAt }
 */
const { query } = require('./lib/db');

exports.handler = async (event) => {
  if (event.httpMethod === "OPTIONS") return { statusCode: 204, headers: cors() };
  if (event.httpMethod !== "GET") return json(405, { error: "METHOD_NOT_ALLOWED" });
  try {
    const url = new URL(event.rawUrl);
    const gameId = url.searchParams.get("gameId") || "flyquiz15";
    const range = url.searchParams.get("range") || "global";
    const limit = Math.min(parseInt(url.searchParams.get("limit") || "100", 10), 200);

    let filter = "";
    if (range === "weekly") {
      filter = "AND created_at >= (NOW() - INTERVAL '7 days')";
    } else if (range !== "global") {
      return json(400, { error: "BAD_RANGE" });
    }

    const { rows } = await query(
      `SELECT p.nickname, LEFT(encode(digest(p.id::text, 'sha1'), 'hex'), 3) AS shortId,
              s.value AS score, EXTRACT(EPOCH FROM s.created_at)::bigint*1000 AS at
       FROM social.scores s
       JOIN social.players p ON p.id = s.player_id
       WHERE s.game_id = $1 ${filter}
       ORDER BY s.value DESC, s.created_at ASC
       LIMIT $2`,
      [gameId, limit]
    );

    return json(200, { items: rows, generatedAt: Date.now() });
  } catch (e) {
    return json(500, { error: "SERVER_ERROR", detail: String(e.message || e) });
  }
};

function cors(){ return { "Access-Control-Allow-Origin":"*", "Access-Control-Allow-Headers":"Content-Type, Authorization", "Access-Control-Allow-Methods":"GET, POST, OPTIONS" }; }
function json(status, body){ return { statusCode: status, headers: { "Content-Type":"application/json", ...cors() }, body: JSON.stringify(body) }; }
