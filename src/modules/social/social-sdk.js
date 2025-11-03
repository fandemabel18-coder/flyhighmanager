
// /src/modules/social/social-sdk.js
// SDK Social mínimo para FHM (nickname + endpoints Netlify).
// Guarda sessionToken en localStorage. Usa 'nickname' también desde localStorage.

const STORAGE_KEY = 'fhm_social_session';
const NICK_KEY = 'fhm_nickname';

function getNickname(){
  const nick = localStorage.getItem(NICK_KEY) || 'Jugador';
  return nick.trim().slice(0, 20) || 'Jugador';
}

async function identify() {
  // reusa token si existe
  try {
    const cached = JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null');
    if (cached && cached.sessionToken && cached.nickname) return cached;
  } catch {}
  const playerId = (crypto.randomUUID && crypto.randomUUID()) || Math.random().toString(36).slice(2);
  const nickname = getNickname();
  const res = await fetch('/.netlify/functions/social-identify', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ playerId, nickname })
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data?.error || 'identify_failed');
  const session = { sessionToken: data.sessionToken, nickname };
  localStorage.setItem(STORAGE_KEY, JSON.stringify(session));
  return session;
}

async function startMatch(gameId){
  const { sessionToken } = await identify();
  const res = await fetch('/.netlify/functions/social-start', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${sessionToken}`
    },
    body: JSON.stringify({ gameId })
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data?.error || 'start_failed');
  return data; // { matchId, nonce, issuedAt }
}

async function finishMatch({ matchId, nonce, score }){
  const { sessionToken } = await identify();
  const res = await fetch('/.netlify/functions/social-finish', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${sessionToken}`
    },
    body: JSON.stringify({ matchId, nonce, score })
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data?.error || 'finish_failed');
  return data; // { accepted, rankGlobal, rankWeekly }
}

async function getLeaderboard({ gameId, range = 'global', limit = 10 }){
  const url = `/.netlify/functions/social-leaderboard?gameId=${encodeURIComponent(gameId)}&range=${encodeURIComponent(range)}&limit=${limit}`;
  const res = await fetch(url, { cache: 'no-store' });
  const data = await res.json();
  if (!res.ok) throw new Error(data?.error || 'lb_failed');
  return data; // { items:[], generatedAt }
}

// Saludo (opcional): pinta [data-nick-greet]
function paintGreeting(){
  const el = document.querySelector('[data-nick-greet]');
  if (!el) return;
  const section = el.getAttribute('data-section') || 'sección';
  const nick = getNickname();
  el.textContent = `Hola ${nick}, bienvenido(a) a ${section}.`;
}

export const social = { identify, startMatch, finishMatch, getLeaderboard, paintGreeting };
export default social;

// Autopinta saludo si está cargado
document.addEventListener('DOMContentLoaded', paintGreeting);
