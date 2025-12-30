const { query } = require('./db');
const { requireUser, json } = require('./lib/auth');

const EARN_CAP_DAILY = 100;

// -------- helpers --------
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
  const mm = String(m).padStart(2, '0');
  const dd = String(d).padStart(2, '0');
  return `${y}-${mm}-${dd}`;
}

// ISO week (Monday-based) computed from the date in the chosen TZ.
function isoWeekKeyInTZ(tz) {
  const { y, m, d } = tzDateParts(tz);
  // Use noon UTC to avoid DST edges
  const dateUtc = new Date(Date.UTC(y, m - 1, d, 12, 0, 0));
  const day = (dateUtc.getUTCDay() + 6) % 7; // Mon=0..Sun=6
  dateUtc.setUTCDate(dateUtc.getUTCDate() - day + 3); // Thu
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

function normalizeEventName(s) {
  return String(s || '').trim().toUpperCase().replace(/\s+/g, '_');
}

function safeParseJson(str) {
  try { return JSON.parse(str || '{}'); } catch { return {}; }
}

// Awards coins with daily cap for EARN. BONUS bypasses cap.
async function awardCoins({ userId, amount, entryType, reason, refId, meta }) {
  const amt = Number(amount);
  if (!Number.isFinite(amt) || amt <= 0) return { awarded: 0, capped: false };

  if (entryType !== 'EARN' && entryType !== 'BONUS') {
    throw Object.assign(new Error('entryType inválido'), { statusCode: 400 });
  }

  // Ensure wallet exists
  await query(
    `INSERT INTO public.fhm_wallets (user_id, balance)
     VALUES ($1, 0)
     ON CONFLICT (user_id) DO NOTHING`,
    [userId]
  );

  let awardAmount = amt;
  let capped = false;

  if (entryType === 'EARN') {
    const dayKey = periodKeyFor('DAILY'); // Chile day
    await query(
      `INSERT INTO public.fhm_coin_daily_caps (user_id, day, earned_today)
       VALUES ($1, $2::date, 0)
       ON CONFLICT (user_id, day) DO NOTHING`,
      [userId, dayKey]
    );

    const curRes = await query(
      `SELECT earned_today FROM public.fhm_coin_daily_caps WHERE user_id=$1 AND day=$2::date`,
      [userId, dayKey]
    );
    const earnedToday = Number(curRes.rows[0]?.earned_today || 0);
    const remaining = Math.max(0, EARN_CAP_DAILY - earnedToday);

    awardAmount = Math.min(awardAmount, remaining);
    capped = awardAmount < amt;

    if (awardAmount <= 0) return { awarded: 0, capped: true };

    await query(
      `UPDATE public.fhm_coin_daily_caps
       SET earned_today = earned_today + $3, updated_at = now()
       WHERE user_id=$1 AND day=$2::date`,
      [userId, dayKey, awardAmount]
    );
  }

  // Ledger insert idempotent
  const ins = await query(
    `INSERT INTO public.fhm_coin_ledger (user_id, amount, entry_type, reason, ref_id, meta)
     VALUES ($1, $2, $3, $4, $5, $6)
     ON CONFLICT (user_id, ref_id) DO NOTHING
     RETURNING id`,
    [userId, awardAmount, entryType, reason, refId, meta ? JSON.stringify(meta) : null]
  );

  // Only update wallet if we actually inserted ledger row now
  if (ins.rowCount === 1) {
    await query(
      `UPDATE public.fhm_wallets SET balance = balance + $2, updated_at = now() WHERE user_id=$1`,
      [userId, awardAmount]
    );
    return { awarded: awardAmount, capped };
  }

  // Already awarded previously
  return { awarded: 0, capped: false };
}

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return json(405, { ok: false, error: 'Método no permitido' });
  }

  let user;
  try {
    ({ user } = await requireUser(event));
  } catch (err) {
    console.error('missions-event auth error', err);
    return json(err?.statusCode || 401, { ok: false, error: err?.message || 'No autorizado' });
  }

  const body = safeParseJson(event.body);
  const eventName = normalizeEventName(body.eventName);
  const refId = String(body.refId || '').trim();
  const payload = body.payload || null;

  if (!eventName || eventName.length > 64) return json(400, { ok: false, error: 'eventName inválido' });
  if (!refId || refId.length > 128) return json(400, { ok: false, error: 'refId inválido' });

  try {
    await query('BEGIN');

    // 1) Save event (idempotent)
    await query(
      `INSERT INTO public.fhm_mission_events (user_id, event_name, ref_id, payload)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (user_id, ref_id) DO NOTHING`,
      [user.id, eventName, refId, payload ? JSON.stringify(payload) : null]
    );

    // 2) Load active mission defs matching this event (simple requirement: {event, target})
    const defsRes = await query(
      `
      SELECT mission_id, cooldown, reward, counts_toward_cap, requirements
      FROM public.fhm_mission_defs
      WHERE is_active = TRUE
        AND (start_at IS NULL OR now() >= start_at)
        AND (end_at IS NULL OR now() <= end_at)
        AND (requirements->>'event') = $1
      `,
      [eventName]
    );

    const completed = [];
    let awardedTotal = 0;
    let cappedAny = false;

    for (const def of defsRes.rows) {
      const req = def.requirements || {};
      const target = Number(req.target || 1);
      const pKey = periodKeyFor(def.cooldown);

      const progRes = await query(
        `SELECT progress, is_completed
         FROM public.fhm_mission_progress
         WHERE user_id=$1 AND mission_id=$2 AND period_key=$3`,
        [user.id, def.mission_id, pKey]
      );

      let progressCount = 0;
      let isCompleted = false;

      if (progRes.rowCount === 0) {
        await query(
          `INSERT INTO public.fhm_mission_progress (user_id, mission_id, period_key, progress, is_completed)
           VALUES ($1, $2, $3, $4, FALSE)`,
          [user.id, def.mission_id, pKey, JSON.stringify({ count: 0, target })]
        );
      } else {
        const prog = progRes.rows[0].progress || {};
        progressCount = Number(prog.count || 0);
        isCompleted = !!progRes.rows[0].is_completed;
      }

      if (isCompleted) continue;

      const newCount = Math.min(target, progressCount + 1);

      await query(
        `UPDATE public.fhm_mission_progress
         SET progress = $4
         WHERE user_id=$1 AND mission_id=$2 AND period_key=$3`,
        [user.id, def.mission_id, pKey, JSON.stringify({ count: newCount, target })]
      );

      if (newCount >= target) {
        const rewardRefId = `mission:${def.mission_id}:${pKey}`;

        await query(
          `UPDATE public.fhm_mission_progress
           SET is_completed = TRUE, completed_at = now(), reward_ref_id = $4
           WHERE user_id=$1 AND mission_id=$2 AND period_key=$3`,
          [user.id, def.mission_id, pKey, rewardRefId]
        );

        const entryType = def.counts_toward_cap ? 'EARN' : 'BONUS';
        const award = await awardCoins({
          userId: user.id,
          amount: def.reward,
          entryType,
          reason: 'MISSION_COMPLETE',
          refId: rewardRefId,
          meta: { missionId: def.mission_id, event: eventName, periodKey: pKey }
        });

        awardedTotal += award.awarded;
        cappedAny = cappedAny || award.capped;
        completed.push(def.mission_id);
      }
    }

    const balRes = await query(`SELECT balance FROM public.fhm_wallets WHERE user_id=$1`, [user.id]);
    await query('COMMIT');

    return json(200, {
      ok: true,
      event: { eventName, refId },
      completed,
      awardedTotal,
      capped: cappedAny,
      balance: Number(balRes.rows[0]?.balance || 0)
    });
  } catch (err) {
    console.error('missions-event error', err);
    try { await query('ROLLBACK'); } catch {}
    return json(500, { ok: false, error: 'Error interno' });
  }
};
