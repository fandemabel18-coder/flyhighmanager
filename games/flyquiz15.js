// /games/flyquiz15.js — versión segura sin imports duros
// Si existe window.social (tu SDK), se usa. Si no, usa un stub para que el juego corra igual.

const social = (typeof window !== 'undefined' && window.social) ? window.social : {
  async identify(){ return { sessionToken: null }; },
  async startMatch(){ return null; },
  async finishMatch(){ },
  async getLeaderboard(){ return { items: [] }; }
};

const GAME_ID = 'flyquiz15';
const TOTAL = 15;
const BUCKET = 5;

const $ = (s, r=document) => r.querySelector(s);
const $$ = (s, r=document) => Array.from(r.querySelectorAll(s));
const setHtml = (sel, html) => { const el = $(sel); if (el) el.innerHTML = html; };

function escapeHtml(s){return String(s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&gt;','>':'&gt;','"':'&quot;',\"'\":'&#39;'}[c]));}
function shuffle(a){ for(let i=a.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1)); [a[i],a[j]]=[a[j],a[i]];} return a; }
function normalizeDiff(d){ const x=String(d||'').toLowerCase(); if(x.startsWith('f')) return 'Fácil'; if(x.startsWith('m')) return 'Medio'; if(x.startsWith('d')) return 'Difícil'; return 'Medio'; }

const FALLBACK_QUESTIONS = [
  { id:'q1', q:'¿Quién es el colocador titular de Karasuno?', options:['Kageyama','Daichi','Tanaka','Asahi'], a:0, time_sec:20, difficulty:'Fácil', category:'Anime', hint:'Es conocido como el Rey de la Cancha.'},
  { id:'q2', q:'¿Cómo se llama el líbero de Nekoma?', options:['Yaku','Kai','Kenma','Lev'], a:0, time_sec:20, difficulty:'Fácil', category:'Anime', hint:'Su apellido es Morisuke.'},
];

const state = {
  idx: 0, score: 0, timer: null, remaining: 0, startedAt: 0, match: null,
  questionsAll: FALLBACK_QUESTIONS, questions: [], usedIds: new Set(),
  lifelines: { fifty:false, chat:false, google:false, hint:false, swap:false, libero:false },
  liberoArmed: false, paused:false,
};

export function mountFlyQuiz(rootSel='#games-root'){
  const root = typeof rootSel==='string' ? $(rootSel) : rootSel;
  if(!root) return;
  renderLanding(root);
}

function renderLanding(root){
  root.innerHTML = `
  <section class="card hero hero--landing">
    <h2 class="hero__title">15× FlyQuiz</h2>
    <p class="hero__desc">15 preguntas, 20s c/u. 1 fallo = fin. Tu puntaje va al ranking global.</p>
    <button id="fq-play" class="btn">Jugar ahora</button>
  </section>`;
  $('#fq-play', root).addEventListener('click', ()=>renderPreStart(root));
}

function renderPreStart(root){
  root.innerHTML = `
  <section class="card hero hero--prestart">
    <h2 class="hero__title">15× FlyQuiz</h2>
    <p class="hero__desc">Confirma para comenzar la partida.</p>
    <button id="fq-start" class="btn primary">Comenzar juego</button>
  </section>`;
  $('#fq-start', root).addEventListener('click', ()=>{ renderGameShell(root); startGame(); });
}

function renderGameShell(root){
  root.innerHTML = `
  <div class="flyquiz">
    <div class="flyquiz__header">
      <div id="fq-progress"></div>
      <div class="scorebox">Puntaje: <b id="fq-score">0</b> &nbsp; ⏱ <b id="fq-time">—</b></div>
    </div>
    <div class="flyquiz__grid">
      <main class="flyquiz__main">
        <div id="fq-body" class="card"><p class="muted">Cargando…</p></div>
        <section class="card" id="fq-lifelines" style="display:none">
          <h4>Comodines (1 uso c/u)</h4>
          <div class="lifelines__row">
            <button class="btn ll" data-ll="fifty">50% <small>Quita 2</small></button>
            <button class="btn ll" data-ll="chat">Chat <small>Encuesta 1 min</small></button>
            <button class="btn ll" data-ll="google">Googlear <small>30 s</small></button>
            <button class="btn ll" data-ll="hint">Ayúdame FanDeMabel <small>Pista</small></button>
            <button class="btn ll" data-ll="swap">Cambio de Jugador <small>Mismo rango</small></button>
            <button class="btn ll" data-ll="libero">Recuperación del Líbero <small>2ª oportunidad</small></button>
          </div>
          <div class="muted">Nota: el “Líbero” no aplica en la #15. La pista no está disponible en preguntas difíciles.</div>
        </section>
        <div class="flyquiz__actions">
          <button id="fq-retry" class="btn" style="display:none">Reintentar</button>
        </div>
      </main>
      <aside class="flyquiz__aside">
        <div class="card">
          <h4>Nota</h4>
          <p>⚠️ Puede haber algún error en una pregunta. Muchas se revisan, pero siempre puede haber error humano.</p>
          <p>👉 Si ves algo raro, escríbeme por Discord: <b>FanDeMabel#4438</b>.</p>
          <div id="fq-aside-dynamic"></div>
        </div>
      </aside>
    </div>
    <section class="flyquiz__board">
      <h3>Leaderboard (Global)</h3>
      <ul id="fq-lb" class="board"></ul>
    </section>
  </div>`;
  renderProgress();
  bindLifelines();
  $('#fq-retry').addEventListener('click', ()=>startGame());
}

function renderProgress(){
  const rows = [
    {label:'Fácil', from:1, to:5},
    {label:'Medio', from:6, to:10},
    {label:'Difícil', from:11, to:15},
  ];
  const bullets = Array.from({length: TOTAL}, (_,i)=>`<span class="step" data-step="${i+1}">${i+1}</span>`).join('');
  const html = rows.map(r => `<div class="track"><span class="track__label">${r.label}</span></div>`).join('')
    + `<div class="bullets">${bullets}</div>`;
  setHtml('#fq-progress', html);
}
function markProgressDone(i, ok){
  const el = $(`.bullets .step:nth-child(${i+1})`);
  if(!el) return; el.classList.add(ok? 'ok':'fail');
}
function setActiveStep(i){
  $$('.bullets .step').forEach(s=>s.classList.remove('active'));
  const el = $(`.bullets .step:nth-child(${i+1})`); if(el) el.classList.add('active');
}

async function fetchJson(url){
  const res = await fetch(url + `?v=${Date.now()}`, {cache:'no-store'});
  if(!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}
async function loadQuestions(){
  try {
    let data;
    try { data = await fetchJson('/games/flyquiz_questions.json'); }
    catch { data = await fetchJson('/games/flyquiz15.questions.json'); }
    const arr = Array.isArray(data) ? data : (Array.isArray(data?.questions) ? data.questions : []);
    if(!arr.length) throw new Error('EMPTY_JSON');
    state.questionsAll = arr.map((q,i)=>{
      const questionText = q.q ?? q.question ?? '';
      const options = q.options ?? [q.option_1, q.option_2, q.option_3, q.option_4].filter(Boolean);
      const a = (typeof q.a==='number') ? q.a :
                (typeof q.correct_index==='number') ? q.correct_index :
                (typeof q.correctIndex==='number') ? q.correctIndex : 0;
      const time = (typeof q.time_sec==='number') ? q.time_sec :
                   (typeof q.timeSec==='number') ? q.timeSec : 20;
      return {
        id: q.id ?? (i+1),
        q: questionText,
        options,
        a,
        time_sec: time,
        category: q.category ?? '',
        difficulty: normalizeDiff(q.difficulty ?? 'Fácil'),
        hint: q.hint ?? ''
      };
    }).filter(x => x.q && Array.isArray(x.options) && x.options.length===4);
  } catch (e){
    console.warn('[FlyQuiz] loadQuestions fallback:', e);
    state.questionsAll = FALLBACK_QUESTIONS;
  }
}
function pickSet(){
  const E = shuffle(state.questionsAll.filter(q=>normalizeDiff(q.difficulty)==='Fácil')).slice(0,BUCKET);
  const M = shuffle(state.questionsAll.filter(q=>normalizeDiff(q.difficulty)==='Medio')).slice(0,BUCKET);
  const D = shuffle(state.questionsAll.filter(q=>normalizeDiff(q.difficulty)==='Difícil')).slice(0,BUCKET);
  return [...E,...M,...D];
}

async function startGame(){
  clearTimer();
  state.idx=0; state.score=0; state.usedIds=new Set();
  state.lifelines = { fifty:false, chat:false, google:false, hint:false, swap:false, libero:false };
  state.liberoArmed=false;
  $('#fq-lifelines').style.display='none';
  setHtml('#fq-body','<p class="muted">Preparando la partida…</p>');
  setHtml('#fq-score','0');
  setHtml('#fq-time','—');
  renderProgress();
  try{
    await social.identify();
    await loadQuestions();
    state.questions = pickSet();
    state.match = await social.startMatch(GAME_ID);
    state.startedAt = Date.now();
    nextQuestion();
  }catch(err){
    console.error(err);
    setHtml('#fq-body','<p class="error">No se pudo iniciar la partida. Intenta de nuevo.</p>');
  }
}

function nextQuestion(){
  if(state.idx >= TOTAL){ endGame(); return; }
  const q = state.questions[state.idx];
  state.usedIds.add(q.id);
  state.remaining = q.time_sec || 20;
  const opts = q.options.map((t,i)=>`
    <button class="opt" data-i="${i}">${String.fromCharCode(97+i)}) ${escapeHtml(t)}</button>
  `).join('');
  const body = `
    <div class="qhead"><span class="badge">${normalizeDiff(q.difficulty)}</span></div>
    <h3 class="qtext">${escapeHtml(q.q)}</h3>
    <div class="opts">${opts}</div>`;
  setHtml('#fq-body', body);
  $('#fq-lifelines').style.display='block';
  $$('.opt', $('#fq-body')).forEach(btn=>btn.addEventListener('click', ()=>{
    const i = Number(btn.getAttribute('data-i')); checkAnswer(i);
  }));
  setActiveStep(state.idx);
  tickStart();
}
function checkAnswer(i){
  const q = state.questions[state.idx];
  const ok = i === q.a;
  clearTimer();
  markProgressDone(state.idx, ok);
  if(ok){
    state.score += 1; setHtml('#fq-score', String(state.score));
    state.idx += 1; nextQuestion();
  }else{
    endGame();
  }
}
function endGame(){
  clearTimer();
  setHtml('#fq-body', `<div class="center"><h3>¡Fin de la partida!</h3><p>Puntaje final: <b>${state.score}</b> / ${TOTAL}</p></div>`);
  $('#fq-retry').style.display='inline-block';
  try{
    if(state.match){ social.finishMatch({ matchId: state.match.matchId, nonce: state.match.nonce, score: state.score }); }
    updateLeaderboard();
  }catch{}
}
function tickStart(){
  clearTimer();
  $('#fq-time').textContent = String(state.remaining);
  state.timer = setInterval(()=>{
    if(state.remaining<=0){
      clearTimer(); markProgressDone(state.idx,false); endGame(); return;
    }
    state.remaining -= 1; $('#fq-time').textContent = String(state.remaining);
  },1000);
}
function clearTimer(){ if(state.timer){ clearInterval(state.timer); state.timer=null; }}

async function updateLeaderboard(){
  try{
    const lb = await social.getLeaderboard({ gameId: GAME_ID, range:'global', limit:10 });
    const html = (lb.items||[]).map((r,i)=>`<li>#${i+1} — <b>${escapeHtml(r.nickname||r.shortId||'—')}</b> <small>(${escapeHtml(r.shortId||'')})</small> — <b>${r.score}</b></li>`).join('');
    setHtml('#fq-lb', html || '<li class="muted">Aún no hay puntajes.</li>');
  }catch{
    setHtml('#fq-lb','<li class="muted">No disponible.</li>');
  }
}

function bindLifelines(){
  $('#fq-lifelines').addEventListener('click', e=>{
    const btn = e.target.closest('button.ll'); if(!btn) return;
    const type = btn.getAttribute('data-ll');
    if(state.lifelines[type]) return;
    if(type==='fifty') return useFifty(btn);
    if(type==='chat') return useChat(btn);
    if(type==='google') return useGoogle(btn);
    if(type==='hint') return useHint(btn);
    if(type==='swap') return useSwap(btn);
    if(type==='libero') return useLibero(btn);
  });
}
function markLLUsed(btn){ btn.disabled=true; state.lifelines[btn.getAttribute('data-ll')]=true; }
function flashAside(html, ms=3000){
  const box = $('#fq-aside-dynamic'); if(!box) return;
  const el = document.createElement('div'); el.className='aside__flash'; el.innerHTML=html;
  box.appendChild(el); setTimeout(()=>el.remove(), ms);
}
function useFifty(btn){
  const q = state.questions[state.idx];
  const wrongs = [0,1,2,3].filter(i=>i!==q.a); shuffle(wrongs).slice(0,2).forEach(i=>{
    const b = $(`.opt[data-i="${i}"]`, $('#fq-body')); if(b){ b.disabled=true; b.classList.add('disabled'); }
  }); markLLUsed(btn);
}
function useChat(btn){ markLLUsed(btn); flashAside('Abre una encuesta en tu stream durante 1 minuto y vota la opción popular.', 4000); }
function useGoogle(btn){ markLLUsed(btn); flashAside('Puedes buscar en Google durante 30 segundos (¡honor system!).', 4000); }
function useHint(btn){
  const n = state.idx + 1; const q = state.questions[state.idx];
  if(n>10 || normalizeDiff(q.difficulty)==='Difícil'){ flashAside('La pista no está disponible en preguntas difíciles ni del tramo 11–15.', 4000); return; }
  markLLUsed(btn);
  const ans = q.options[q.a]||'';
  const pista = q.hint?.trim() ? escapeHtml(q.hint.trim())
    : (q.category ? `Categoría: <b>${escapeHtml(q.category)}</b>` : `Empieza con <b>${escapeHtml(ans.slice(0,1))}</b>`);
  flashAside(`Pista: ${pista}`, 7000);
}
function useSwap(btn){
  markLLUsed(btn);
  const current = state.questions[state.idx];
  const d = normalizeDiff(current.difficulty);
  const pool = shuffle(state.questionsAll.filter(x=> normalizeDiff(x.difficulty)===d && !state.usedIds.has(x.id) && x.id!==current.id ));
  if(!pool.length){ flashAside('No hay más preguntas del mismo rango.', 3000); return; }
  state.questions[state.idx] = pool[0]; clearTimer(); nextQuestion();
}
function useLibero(btn){
  if(state.idx===TOTAL-1){ flashAside('El “Líbero” no aplica en la #15.', 3000); return; }
  markLLUsed(btn); state.liberoArmed=true; flashAside('Líbero preparado: si fallas esta pregunta tendrás otra oportunidad.', 3000);
}

try { window.mountFlyQuiz = mountFlyQuiz; } catch {}
