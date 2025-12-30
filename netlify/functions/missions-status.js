const { query } = require('./db');
const { requireUser, json } = require('./lib/auth');

function tzDateParts(tz) {
  const fmt = new Intl.DateTimeFormat('en-CA', {
    timeZone: tz,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  });
  const parts = fmt.formatToParts(new Date());
  const map = Object.fromEntries(parts.map(p => [p.type, p.value]));
  return { y: Number(map.year), m: Number(map.month), d: Number(map.day) };
}
function formatYYYYMMDD({ y, m, d }) {
  return `${y}-${String(m).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
}
function isoWeekKeyInTZ(tz) {
  const { y, m, d } = tzDateParts(tz);
  const dateUtc = new Date(Date.UTC(y, m - 1, d, 12, 0, 0));
  const day = (dateUtc.getUTCDay() + 6) % 7;
  dateUtc.setUTCDate(dateUtc.getUTCDate() - day + 3);
  const firstThu = new Date(Date.UTC(dateUtc.getUTCFullYear(), 0, 4, 12, 0, 0));
  const firstDay = (firstThu.getUTCDay() + 6) % 7;
  firstThu.setUTCDate(firstThu.getUTCDate() - firstDay + 3);
  const weekNo = 1 + Math.round((dateUtc - firstThu) / (7 * 24 * 3600 * 1000));
  const weekYear = dateUtc.getUTCFullYear();
  return `${weekYear}-W${String(weekNo).padStart(2, '0')}`;
}
function periodKeyFor(cooldown) {
  const tz = 'America/Santiago';
  if (cooldown === 'DAILY') return formatYYYYMMDD(tzDateParts(tz));
  if (cooldown === 'WEEKLY') return isoWeekKeyInTZ(tz);
  return 'ONCE';
}

exports.handler = async (event) => {
  if (event.httpMethod !== 'GET') {
    return json(405, { ok: false, error: 'Método no permitido' });
  }

  let user;
  try {
    ({ user } = await requireUser(event));
  } catch (err) {
    console.error('missions-status auth error', err);
    return json(err?.statusCode || 401, { ok: false, error: err?.message || 'No autorizado' });
  }

  try {
    const defsRes = await query(
      `
      SELECT mission_id, title, category, cooldown, reward, counts_toward_cap, requirements
      FROM public.fhm_mission_defs
      WHERE is_active = TRUE
        AND (start_at IS NULL OR now() >= start_at)
        AND (end_at IS NULL OR now() <= end_at)
      ORDER BY category, mission_id
      `
    );

    const missions = [];

    for (const def of defsRes.rows) {
      const pKey = periodKeyFor(def.cooldown);
      const progRes = await query(
        `SELECT progress, is_completed, completed_at
         FROM public.fhm_mission_progress
         WHERE user_id=$1 AND mission_id=$2 AND period_key=$3`,
        [user.id, def.mission_id, pKey]
      );

      let progress = { count: 0 };
      let isCompleted = false;
      let completedAt = null;

      if (progRes.rowCount > 0) {
        progress = progRes.rows[0].progress || progress;
        isCompleted = !!progRes.rows[0].is_completed;
        completedAt = progRes.rows[0].completed_at;
      }

      missions.push({
        missionId: def.mission_id,
        title: def.title,
        category: def.category,
        cooldown: def.cooldown,
        periodKey: pKey,
        reward: Number(def.reward),
        countsTowardCap: !!def.counts_toward_cap,
        requirements: def.requirements,
        progress,
        isCompleted,
        completedAt
      });
    }

    return json(200, { ok: true, missions });
  } catch (err) {
    console.error('missions-status error', err);
    return json(500, { ok: false, error: 'Error interno' });
  }
};
