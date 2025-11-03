
// /games/flyquiz15.js  (v3) — progreso, aviso lateral, selección por dificultad y comodines
import { social } from '/src/modules/social/social-sdk.js';

const GAME_ID = 'flyquiz15';
const TOTAL = 15;
const BUCKET_SIZE = 5;

const FALLBACK_QUESTIONS = [
  { id: 1, q: '¿Quién es el colocador titular de Karasuno?', options: ['Kageyama', 'Daichi', 'Tanaka', 'Asahi'], a: 0, time_sec: 20, difficulty: 'Fácil' },
  { id: 2, q: '¿Cómo se llama el líbero de Nekoma?', options: ['Yaku', 'Kai', 'Kenma', 'Lev'], a: 0, time_sec: 20, difficulty: 'Fácil' },
];

let state = {
  idx: 0, score: 0, timePerQ: 20, timerId: null, remaining: 0, paused: false,
  match: null, startedAt: 0,
  questionsAll: FALLBACK_QUESTIONS, questions: [], usedIds: new Set(),
  lifelines: { fifty:false, chat:false, google:false, hint:false, swap:false, libero:false },
  liberoArmed: false,
};

const $ = (sel, root=document) => root.querySelector(sel);
const $$ = (sel, root=document) => Array.from(root.querySelectorAll(sel));

function mount() {
  const root = document.getElementById('games-flyquiz15');
  if (!root) return;
  root.innerHTML = `
    <div class="flyquiz card">
      <div class="flyquiz__head">
        <div class="flyquiz__head-left">
          <h2>15× FlyQuiz</h2>
          <div class="flyquiz__meta">
            <span class="flyquiz__greet" data-nick-greet data-section="Juegos — FlyQuiz"></span>
            <span class="flyquiz__score">Puntaje: <b id="fq-score">0</b></span>
            <span class="flyquiz__timer">⏱ <b id="fq-time">—</b>s</span>
          </div>
        </div>
        <div class="flyquiz__progress" id="fq-progress"></div>
      </div>
      <div class="flyquiz__grid">
        <div class="flyquiz__main">
          <div class="flyquiz__body" id="fq-body">
            <p class="muted">Pulsa “Comenzar” para iniciar.</p>
          </div>
          <div class="flyquiz__lifelines" id="fq-lifelines" style="display:none">
            <h4>Comodines (1 uso c/u)</h4>
            <div class="lifelines__row">
              <button class="btn ll" data-ll="fifty">50% <small>Quita 2 erróneas</small></button>
              <button class="btn ll" data-ll="chat">Chat <small>Encuesta 1 min</small></button>
              <button class="btn ll" data-ll="google">Googlear <small>30 s</small></button>
              <button class="btn ll" data-ll="hint">Ayúdame FanDeMabel <small>Pista breve</small></button>
              <button class="btn ll" data-ll="swap">Cambio de Jugador <small>Otra del mismo rango</small></button>
              <button class="btn ll" data-ll="libero">Recuperación del Líbero <small>2ª oportunidad</small></button>
            </div>
            <div class="lifelines__note muted">No válido el “Líbero” en la #15.</div>
          </div>
          <div class="flyquiz__actions">
            <button id="fq-start" class="btn primary">Comenzar</button>
            <button id="fq-retry" class="btn" style="display:none">Reintentar</button>
          </div>
        </div>
        <aside class="flyquiz__aside">
          <div class="aside__card">
            <h4>Nota</h4>
            <p>⚠️ Existe la posibilidad de que alguna pregunta contenga un error. Actualmente contamos con más de 100 preguntas (cifra en crecimiento): muchas se revisan manualmente, pero siempre puede haber un error humano.</p>
            <p>👉 Si detectas una respuesta errada, redacción confusa o una opción poco precisa, escríbeme por Discord: <b>FanDeMabel#4438</b>.</p>
            <div id="fq-aside-dynamic"></div>
          </div>
        </aside>
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
  $('#fq-lifelines').addEventListener('click', onLifelineClick);
  renderProgress();
  refreshLeaderboard();
}

function renderProgress(active=-1){
  const host = $('#fq-progress');
  const nums = Array.from({length:15}, (_,i)=>i+1).map((n,i)=>`<span class="step ${i===active?'active':''}" data-step="${n}">${n}</span>`).join('');
  host.innerHTML = `
    <div class="segments">
      <div class="seg seg--easy"><span>Fácil</span></div>
      <div class="seg seg--medium"><span>Medio</span></div>
      <div class="seg seg--hard"><span>Difícil</span></div>
    </div>
    <div class="bullets">${nums}</div>`;
}
function setActiveStep(i){ $$('.bullets .step', $('#fq-progress')).forEach(s=>s.classList.remove('active')); const el = $(`.bullets .step:nth-child(${i+1})`, $('#fq-progress')); if (el) el.classList.add('active'); }
function markProgressDone(i, ok=true){ const el = $(`.bullets .step:nth-child(${i+1})`, $('#fq-progress')); if (!el) return; el.classList.remove('active'); el.classList.add(ok?'done':'fail'); }

async function loadQuestions(){
  try{
    const res = await fetch('/games/flyquiz15.questions.json', { cache:'no-store' });
    if(!res.ok) throw new Error();
    const data = await res.json();
    if(!data || !Array.isArray(data.questions) || data.questions.length===0) throw new Error();
    state.questionsAll = data.questions.map((q,i)=>({
      id:q.id ?? (i+1),
      q:q.q ?? q.question ?? '',
      options:q.options ?? [q.option_1,q.option_2,q.option_3,q.option_4].filter(Boolean),
      a: typeof q.a==='number'? q.a : (typeof q.correct_index==='number'? q.correct_index : 0),
      time_sec: typeof q.time_sec==='number'? q.time_sec : 20,
      category:q.category ?? '',
      difficulty: normalizeDiff(q.difficulty ?? 'Fácil')
    })).filter(x=>x.q && Array.isArray(x.options) && x.options.length===4);
  }catch(_){
    state.questionsAll = FALLBACK_QUESTIONS.map(q=>({...q, difficulty: normalizeDiff(q.difficulty||'Fácil')}));
  }
}
function normalizeDiff(d){ const s=String(d||'').toLowerCase(); if(s.startsWith('f'))return'facil'; if(s.startsWith('m'))return'medio'; return'dificil'; }
function shuffle(a){ return a.map(v=>[Math.random(),v]).sort((x,y)=>x[0]-y[0]).map(p=>p[1]); }
function pickSetByDifficulty(all){
  const easy=all.filter(q=>normalizeDiff(q.difficulty)==='facil');
  const mid =all.filter(q=>normalizeDiff(q.difficulty)==='medio');
  const hard=all.filter(q=>normalizeDiff(q.difficulty)==='dificil');
  const take=(arr,n)=>shuffle(arr).slice(0,Math.min(n,arr.length));
  let e=take(easy,5), m=take(mid,5), h=take(hard,5);
  const shortageE=5-e.length, shortageM=5-m.length, shortageH=5-h.length;
  let rest=shuffle(all.filter(q=>!e.includes(q)&&!m.includes(q)&&!h.includes(q)));
  if(shortageE>0) e=e.concat(rest.splice(0,shortageE));
  if(shortageM>0) m=m.concat(rest.splice(0,shortageM));
  if(shortageH>0) h=h.concat(rest.splice(0,shortageH));
  e=e.slice(0,5); m=m.slice(0,5); h=h.slice(0,5);
  return [...e,...m,...h];
}

async function startGame(){
  clearTimer();
  state.idx=0; state.score=0; state.usedIds=new Set();
  state.lifelines={fifty:false,chat:false,google:false,hint:false,swap:false,libero:false};
  state.liberoArmed=false;
  $('#fq-lifelines').style.display='none';
  setText('#fq-score','0'); setText('#fq-time','—'); setBody('<p class="muted">Preparando la partida…</p>'); renderProgress();
  try{
    await social.identify();
    await loadQuestions();
    state.questions = pickSetByDifficulty(state.questionsAll);
    state.match = await social.startMatch(GAME_ID);
    state.startedAt = Date.now();
  }catch(err){ setBody('<p class="error">No se pudo iniciar la partida. Intenta de nuevo.</p>'); console.error(err); return; }
  $('#fq-start').style.display='none'; $('#fq-retry').style.display='none'; $('#fq-lifelines').style.display='block';
  nextQuestion();
}

function nextQuestion(){
  if(state.idx>=state.questions.length || state.idx>=TOTAL) return endGame();
  const q = state.questions[state.idx];
  state.usedIds.add(q.id);
  setBody(renderQuestion(q, state.idx+1));
  state.remaining = Number(q.time_sec||state.timePerQ)||20;
  state.paused=false; tick(); clearTimer(); state.timerId=setInterval(tick,1000);
  setActiveStep(state.idx);
  $$('#fq-body .opt').forEach((btn,i)=>btn.addEventListener('click',()=>choose(i)));
}

function choose(i){
  const q = state.questions[state.idx];
  const correct = i===q.a;
  if(!correct){
    if(state.lifelines.libero && state.liberoArmed && state.idx<(TOTAL-1)){
      state.liberoArmed=false;
      const btn = $$('#fq-body .opt')[i]; if(btn){btn.disabled=true;btn.classList.add('opt--disabled');}
      flashAside('Recuperación del Líbero usada. ¡Sigue intentando!',2500);
      return;
    }
    clearTimer(); markProgressDone(state.idx,false); return endGame();
  }
  state.score+=1; setText('#fq-score', String(state.score)); markProgressDone(state.idx,true);
  state.idx+=1; clearTimer(); nextQuestion();
}

function tick(){ if(state.paused) return; setText('#fq-time', String(state.remaining)); if(state.remaining<=0){ clearTimer(); markProgressDone(state.idx,false); endGame(); return; } state.remaining-=1; }
function clearTimer(){ if(state.timerId){ clearInterval(state.timerId); state.timerId=null; } }

async function endGame(){
  clearTimer();
  setBody(`<div class="center"><h3>¡Fin de la partida!</h3><p>Puntaje final: <b>${state.score}</b> / ${TOTAL}</p></div>`);
  $('#fq-retry').style.display='inline-block';
  try{ if(state.match){ await social.finishMatch({ matchId:state.match.matchId, nonce:state.match.nonce, score:state.score }); } }catch(e){ console.warn(e); }
  refreshLeaderboard();
}

function onLifelineClick(e){
  const btn = e.target.closest('.btn.ll'); if(!btn) return;
  const type = btn.dataset.ll; if(!type || state.lifelines[type]) return;
  switch(type){
    case 'fifty': useFifty(btn); break;
    case 'chat': useChat(btn); break;
    case 'google': useGoogle(btn); break;
    case 'hint': useHint(btn); break;
    case 'swap': useSwap(btn); break;
    case 'libero': useLibero(btn); break;
  }
}
function markLLUsed(btn){ state.lifelines[btn.dataset.ll]=true; btn.classList.add('used'); btn.disabled=true; }
function useFifty(btn){ const q=state.questions[state.idx]; const wrong=[0,1,2,3].filter(i=>i!==q.a); shuffle(wrong).slice(0,2).forEach(i=>{ const el=$(`#fq-body .opt[data-i="${i}"]`); if(el){ el.disabled=true; el.classList.add('opt--hidden'); } }); markLLUsed(btn); }
function useChat(btn){ markLLUsed(btn); pauseForSeconds(60,'Encuesta de chat: 60 s'); }
function useGoogle(btn){ markLLUsed(btn); const q=state.questions[state.idx]; const url=`https://www.google.com/search?q=${encodeURIComponent(q.q)}`; const anchor=`<a href="${url}" target="_blank" rel="noopener">Abrir Google</a>`; pauseForSeconds(30, `Tiempo para buscar (30 s). ${anchor}`); }
function useHint(btn){ markLLUsed(btn); const q=state.questions[state.idx]; const ans=q.options[q.a]; const first=ans?ans[0]:''; const pista=q.category?`Categoría: <b>${escapeHtml(q.category)}</b>`:`La respuesta empieza con <b>${escapeHtml(first)}</b>.`; flashAside(`Pista: ${pista}`,8000); }
function useSwap(btn){ markLLUsed(btn); const cur=state.questions[state.idx]; const diff=normalizeDiff(cur.difficulty||'medio'); const pool=shuffle(state.questionsAll.filter(q=>normalizeDiff(q.difficulty)===diff && !state.usedIds.has(q.id) && q.id!==cur.id)); if(pool.length===0){ flashAside('No hay más preguntas de este rango. Se mantiene la actual.',4000); return; } state.questions[state.idx]=pool[0]; clearTimer(); nextQuestion(); }
function useLibero(btn){ markLLUsed(btn); state.liberoArmed=true; flashAside('Líbero listo: si fallas, tendrás otra oportunidad (no aplica en #15).',5000); }

function pauseForSeconds(sec,msg){ state.paused=true; const end=Date.now()+sec*1000; const box=$('#fq-aside-dynamic'); const tick=()=>{ const left=Math.max(0,Math.ceil((end-Date.now())/1000)); box.innerHTML=`<div class="aside__timer">${msg}<div class="count">${left}s</div></div>`; if(left<=0){ state.paused=false; box.innerHTML=''; clearInterval(tid); } }; tick(); const tid=setInterval(tick,200); }

function renderQuestion(q,n){ const opts=q.options.map((t,i)=>`<button class="btn opt" data-i="${i}">${escapeHtml(t)}</button>`).join(''); return `<div class="q"><div class="q__n">Pregunta ${n} de ${TOTAL}</div><div class="q__t">${escapeHtml(q.q)}</div><div class="q__opts">${opts}</div></div>`; }
async function refreshLeaderboard(){ try{ const lb=await social.getLeaderboard({ gameId:GAME_ID, range:'global', limit:10 }); const html=lb.items.map((r,i)=>`<li>#${i+1} — ${escapeHtml(r.nickname)} <small>(${r.shortid||r.shortId||'—'})</small> <b>${r.score}</b></li>`).join(''); $('#fq-lb').innerHTML=html||'<li class="muted">Aún no hay puntajes.</li>'; }catch(_){ $('#fq-lb').innerHTML='<li class="muted">No disponible.</li>'; } }

function setBody(h){ $('#fq-body').innerHTML=h; }
function setText(sel, txt){ const el=$(sel); if(el) el.textContent=txt; }
function escapeHtml(s){ return String(s).replace(/[&<>"']/g, c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }

document.addEventListener('DOMContentLoaded', mount);
