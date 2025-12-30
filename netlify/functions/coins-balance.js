const { query } = require('./db');
const { requireUser, json } = require('./lib/auth');

const EARN_CAP = 100;

exports.handler = async (event) => {
  if (event.httpMethod !== 'GET') {
    return json(405, { ok: false, error: 'Método no permitido' });
  }

  try {
    const { user } = await requireUser(event);

    // Ensure wallet row exists
    await query(
      'INSERT INTO fhm_wallets (user_id, balance) VALUES ($1, 0) ON CONFLICT (user_id) DO NOTHING',
      [user.id]
    );

    const res = await query(
      `SELECT
         w.balance,
         COALESCE(c.earned_today, 0) AS earned_today
       FROM fhm_wallets w
       LEFT JOIN fhm_coin_daily_caps c
         ON c.user_id = w.user_id AND c.day = CURRENT_DATE
       WHERE w.user_id = $1`,
      [user.id]
    );

    const row = res.rows[0] || { balance: 0, earned_today: 0 };

    return json(200, {
      ok: true,
      balance: Number(row.balance) || 0,
      earnedToday: Number(row.earned_today) || 0,
      earnCap: EARN_CAP,
      user: { id: user.id, nickname: user.nickname }
    });
  } catch (err) {
    console.error('coins-balance error', err);
    const status = err?.statusCode || 500;
    return json(status, { ok: false, error: err?.message || 'Error interno' });
  }
};
