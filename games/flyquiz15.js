
// /games/flyquiz15.js  (v2) — soporta cargar preguntas desde JSON externo
// Coloca /games/flyquiz15.questions.json para usar banco externo.
// Si no existe o falla, usa el banco embebido (fallback).

import { social } from '/src/modules/social/social-sdk.js';

const GAME_ID = 'flyquiz15';

// --- Fallback embebido (por si no hay JSON) ---
const FALLBACK_QUESTIONS = [
  { id: 1, q: '¿Quién es el colocador titular de Karasuno?', options: ['Kageyama', 'Daichi', 'Tanaka', 'Asahi'], a: 0, time_sec: 20 },
  { id: 2, q: '¿Cómo se llama el líbero de Nekoma?', options: ['Yaku', 'Kai', 'Kenma', 'Lev'], a: 0, time_sec: 20 },
];

// --- Estado ---
let state = {
  idx: 0,
  score: 0,
  timePerQ: 20, // por pregunta (si el banco trae time_sec, se respeta)
  timerId: null,
  remaining: 0,
  match: null, // {matchId, nonce}
  startedAt: 0,
  questions: FALLBACK_QUESTIONS,
};

// --- DOM helpers ---
const $ = (sel, root=document) => root.querySelector(sel);
const $$ = (sel, root=document) => Array.from(root.querySelectorAll(sel));

function mount() {
  const root = document.getElementById('games-flyquiz15');
  if (!root) return;

  root.innerHTML = `
    <div class="flyquiz card">
      <div class="flyquiz__head">
        <h2>15× FlyQuiz</h2>
        <div class="flyquiz__meta">
          <span class="flyquiz__greet" data-nick-greet data-section="Juegos — FlyQuiz"></span>
          <span class="flyquiz__score">Puntaje: <b id="fq-score">0</b></span>
          <span class="flyquiz__timer">⏱ <b id="fq-time">—</b>s</span>
        </div>
      </div>
      <div class="flyquiz__body" id="fq-body">
        <p class="muted">Cargando banco de preguntas…</p>
      </div>
      <div class="flyquiz__actions">
        <button id="fq-start" class="btn primary" style="display:none">Comenzar</button>
        <button id="fq-retry" class="btn" style="display:none">Reintentar</button>
      </div>
      <div class="flyquiz__board">
        <h3>Leaderboard (Global)</h3>
        <ol id="fq-lb"></ol>
      </div>
    </div>
  `;

  if (window.NICK && typeof window.NICK.paint === 'function') window.NICK.paint();

  $('#fq-start').addEventListener('click', startGame);
  $('#fq-retry').addEventListener('click', startGame);

  // Cargar banco externo (si existe)
  loadQuestions().then(() => {
    setBody('<p class="muted">Pulsa “Comenzar” para iniciar.</p>');
    $('#fq-start').style.display = 'inline-block';
  }).catch(() => {
    // Si falla, ya tenemos FALLBACK_QUESTIONS
    setBody('<p class="muted">Pulsa “Comenzar” para iniciar.</p>');
    $('#fq-start').style.display = 'inline-block';
  });

  refreshLeaderboard();
}

async function loadQuestions() {
  try {
    const res = await fetch('/games/flyquiz15.questions.json', { cache: 'no-store' });
    if (!res.ok) throw new Error('NO_JSON');
    const data = await res.json();
    // Espera formato: { gameId, version, updatedAt, questions:[{ id,q,options[],a, time_sec? }] }
    if (!data || !Array.isArray(data.questions) || data.questions.length === 0) throw new Error('BAD_JSON');
    // Normaliza claves (por si vienen de Excel transformado)
    state.questions = data.questions.map((q, i) => ({
      id: q.id ?? (i+1),
      q: q.q ?? q.question ?? '',
      options: q.options ?? [q.option_1, q.option_2, q.option_3, q.option_4].filter(Boolean),
      a: typeof q.a === 'number' ? q.a : (typeof q.correct_index === 'number' ? q.correct_index : 0),
      time_sec: typeof q.time_sec === 'number' ? q.time_sec : 20,
      category: q.category ?? '',
      difficulty: q.difficulty ?? '',
    })).filter(x => x.q && Array.isArray(x.options) && x.options.length === 4);
  } catch (e) {
    console.warn('[FlyQuiz] usando FALLBACK_QUESTIONS. Motivo:', e.message || e);
    state.questions = FALLBACK_QUESTIONS;
  }
}

async function startGame() {
  clearTimer();
  state.idx = 0;
  state.score = 0;
  setText('#fq-score', '0');
  setText('#fq-time', '—');
  setBody(`<p class="muted">Preparando la partida…</p>`);

  try {
    await social.identify();
    state.match = await social.startMatch(GAME_ID);
    state.startedAt = Date.now();
  } catch (err) {
    setBody(`<p class="error">No se pudo iniciar la partida. Intenta de nuevo.</p>`);
    console.error('[FlyQuiz] startMatch error', err);
    return;
  }

  $('#fq-start').style.display = 'none';
  $('#fq-retry').style.display = 'none';
  nextQuestion();
}

function nextQuestion() {
  if (state.idx >= state.questions.length || state.idx >= 15) {
    return endGame();
  }

  const q = state.questions[state.idx];
  setBody(renderQuestion(q, state.idx + 1));

  state.remaining = Number(q.time_sec || state.timePerQ) || 20;
  tick();
  state.timerId = setInterval(tick, 1000);

  $$('#fq-body .opt').forEach((btn, i) => {
    btn.addEventListener('click', () => choose(i));
  });
}

function choose(i) {
  const q = state.questions[state.idx];
  const correct = i === q.a;
  clearTimer();

  if (correct) {
    state.score += 1;
    setText('#fq-score', String(state.score));
    state.idx += 1;
    nextQuestion();
  } else {
    endGame();
  }
}

function tick() {
  setText('#fq-time', String(state.remaining));
  if (state.remaining <= 0) {
    clearTimer();
    endGame();
    return;
  }
  state.remaining -= 1;
}

function clearTimer() {
  if (state.timerId) {
    clearInterval(state.timerId);
    state.timerId = null;
  }
}

async function endGame() {
  clearTimer();
  const finishedHtml = `
    <div class="center">
      <h3>¡Fin de la partida!</h3>
      <p>Puntaje final: <b>${state.score}</b> / 15</p>
    </div>
  `;
  setBody(finishedHtml);
  $('#fq-retry').style.display = 'inline-block';

  try {
    if (state.match) {
      await social.finishMatch({
        matchId: state.match.matchId,
        nonce: state.match.nonce,
        score: state.score
      });
    }
  } catch (err) {
    console.warn('[FlyQuiz] finishMatch error', err);
  }

  refreshLeaderboard();
}

async function refreshLeaderboard() {
  try {
    const lb = await social.getLeaderboard({ gameId: GAME_ID, range: 'global', limit: 10 });
    const html = lb.items.map((r, i) => `<li>#${i+1} — ${escapeHtml(r.nickname)} <small>(${r.shortid || r.shortId || '—'})</small> <b>${r.score}</b></li>`).join('');
    $('#fq-lb').innerHTML = html || '<li class="muted">Aún no hay puntajes.</li>';
  } catch (e) {
    $('#fq-lb').innerHTML = '<li class="muted">No disponible.</li>';
  }
}

function renderQuestion(q, n) {
  const opts = q.options.map((t, i) => `<button class="btn opt" data-i="${i}">${escapeHtml(t)}</button>`).join('');
  return `
    <div class="q">
      <div class="q__n">Pregunta ${n} de 15</div>
      <div class="q__t">${escapeHtml(q.q)}</div>
      <div class="q__opts">${opts}</div>
    </div>
  `;
}

// --- helpers UI ---
function setBody(html) { $('#fq-body').innerHTML = html; }
function setText(sel, txt) { const el = $(sel); if (el) el.textContent = txt; }
function escapeHtml(s){ return String(s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }

document.addEventListener('DOMContentLoaded', mount);
