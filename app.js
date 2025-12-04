/* ===========================
   Helpers & Core Utilities
   =========================== */
const $  = (sel, root=document) => root.querySelector(sel);
const $$ = (sel, root=document) => Array.from(root.querySelectorAll(sel));

async function loadJSON(path){
  const res = await fetch(path, { cache: 'no-store' });
  if(!res.ok) throw new Error(`No pude cargar ${path}`);
  const raw = await res.text();
  const cleaned = raw
    .replace(/^\uFEFF/, '')         // BOM
    .replace(/\/\/.*$/gm, '')       // // comentarios
    .replace(/\/\*[\s\S]*?\*\//g,'')// /* */ comentarios
    .trim();
  return JSON.parse(cleaned);
}

function normalizeStr(s=''){
  try {
    return String(s).toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g,'');
  } catch {
    return String(s).toLowerCase();
  }
}
/* ===========================
   Potentials (global lookup)
   =========================== */
let POTENTIALS = [];
let POT_BY_ID  = new Map();
let POT_BY_NAME = new Map(); // normalized name -> obj
let _potsLoaded = false;

async function loadPotentialsOnce(){
  if(_potsLoaded) return;
  try{
    const raw = await loadJSON('data/potentials.json');
    POTENTIALS = Array.isArray(raw) ? raw : [];
  }catch(e){
    console.warn('[potentials] No pude leer data/potentials.json', e);
    POTENTIALS = [];
  }
  POT_BY_ID  = new Map(POTENTIALS.map(p => [String(p.id||''), p]));
  POT_BY_NAME= new Map(POTENTIALS.map(p => [normalizeStr(p.name||''), p]));
  _potsLoaded = true;
}

// Canonical getter for character potentials:
function getCharacterPotentials(c){
  // 1) Prefer explicit IDs
  const ids = Array.isArray(c.potentialsIds) ? c.potentialsIds : [];
  if(ids.length){
    return ids.map(id => POT_BY_ID.get(String(id))).filter(Boolean);
  }
  // 2) Fallback: embedded objects or strings => reconcile by NAME
  const embedded = Array.isArray(c.potencial) ? c.potencial : (Array.isArray(c.potentials) ? c.potentials : []);
  if(!embedded.length) return [];
  return embedded.map(p=>{
    const nm = (p && (p.name || p.id)) ? (p.name || p.id) : (typeof p === 'string' ? p : '');
    const hit = POT_BY_ID.get(String(nm)) || POT_BY_NAME.get(normalizeStr(nm));
    return hit || (p && typeof p === 'object' ? p : null);
  }).filter(Boolean);
}



/* ===========================
   Tabs
   =========================== */
function initTabs(){
  $$('.tab-btn').forEach(btn=>{
    btn.addEventListener('click', ()=>{
      $$('.tab-btn').forEach(b=>b.classList.remove('active'));
      btn.classList.add('active');

      const name = btn.dataset.tab;
      $$('.tab').forEach(t => t.classList.remove('active'));
      const target = $('#tab-'+name);
      if(target) target.classList.add('active');

      if(name === 'team' && typeof TB !== 'undefined' && TB.initOnce){
        TB.initOnce();
      }
      if(name === 'tier' && typeof TIER !== 'undefined' && TIER.initOnce){
        TIER.initOnce();
      }
      if(name === 'calendar' && typeof CAL !== 'undefined' && CAL.initOnce){
        CAL.initOnce();
      }
    });
  });

  document.addEventListener('click', (e)=>{
    const a = e.target.closest('.tab-link');
    if(!a) return;
    e.preventDefault();
    const tab = a.dataset.tab;
    if(!tab) return;
    const btn = $(`.tab-btn[data-tab="${tab}"]`);
    if(btn) btn.click();
  });
}

/* ===========================
   Home: Banners
   =========================== */

/* ===========================
   Announcements (modal, no redirects)
   =========================== */
const ANN = (()=>{
  const LS_PREFIX = 'ann.seen.';

  function stripLinks(html=''){
    try{ return String(html).replace(/<a\b[^>]*>(.*?)<\/a>/gi, '$1'); }catch{ return html||''; }
  }

  async function fetchAnnouncementsList(){
    const candidates = ['data/announcements.json', 'announcements.json']
      .map(u => u + '?ts=' + Date.now());
    for (const url of candidates) {
      try {
        const data = await loadJSON(url);
        if (Array.isArray(data)) return data;
      } catch (e) {
        console.warn('[ANN] tried', url, e);
      }
    }
    return [];
  }

  function buildModal(a){
    const backdrop = document.createElement('div');
    backdrop.id = 'ann-backdrop';
    backdrop.innerHTML = `
      <div id="ann-modal" role="dialog" aria-modal="true" aria-labelledby="ann-title">
        <button class="ann-x" aria-label="Cerrar">×</button>
        <header class="ann-hd">
          <div class="pill">¡Anuncio del sistema!</div>
          <h2 id="ann-title">${a.title||'Actualización'}</h2>
          <small class="ann-date">${(a.date||'').toString()}</small>
        </header>
        <div class="ann-body">${stripLinks(a.contentHtml||'')}</div>
        <footer class="ann-ft">
          <label class="ann-chk"><input type="checkbox" id="ann-no-show"> No volver a mostrar</label>
          <div class="ann-actions">
            <button class="ann-ok">Entendido</button>
          </div>
        </footer>
      </div>`;
    document.body.appendChild(backdrop);
    document.body.style.overflow = 'hidden';

    const close = ()=>{
      if (document.getElementById('ann-no-show')?.checked) {
        try{ localStorage.setItem(LS_PREFIX + a.id, '1'); }catch{}
      }
      backdrop.remove();
      document.body.style.overflow = '';
    };
    backdrop.addEventListener('click', (e)=>{ if(e.target===backdrop) close(); });
    backdrop.querySelector('.ann-x')?.addEventListener('click', close);
    backdrop.querySelector('.ann-ok')?.addEventListener('click', close);
    document.addEventListener('keydown', function onEsc(ev){
      if(ev.key==='Escape'){ document.removeEventListener('keydown', onEsc); close(); }
    });
  }

  async function initOnce(){
    const list = await fetchAnnouncementsList();
    if(!Array.isArray(list) || !list.length) return;

    const activeTab = document.querySelector('.tab.active');
    const onHome =
      location.pathname === '/' ||
      location.pathname.endsWith('/index.html') ||
      (activeTab && activeTab.id==='tab-home') ||
      !activeTab;

    const item = list.find(a=>{
      if (a.onlyOnHome && !onHome) return false;
      try { if (localStorage.getItem(LS_PREFIX + a.id)) return false; } catch {}
      return true;
    });
    if(item) buildModal(item);
  }
  return { initOnce };
})();

async function renderHomeBanners(){
  const ul = $('#home-banners');
  if(!ul) return;
  ul.innerHTML = '<li style="color:#9fb0c3">Cargando banners…</li>';

  try{
    const banners = await loadJSON('data/banners.json');
    if(!Array.isArray(banners) || banners.length===0){
      ul.innerHTML = '<li style="color:#9fb0c3">No hay banners por ahora.</li>';
      return;
    }

    ul.classList.add('banners-grid');
    ul.innerHTML = banners.slice(0,2).map(b=>{
      const dates = [b.start?.slice(0,10), b.end?.slice(0,10)].filter(Boolean).join(' → ');
      const img = (b.image && typeof b.image === 'string')
        ? `<img src="${b.image}" alt="${b.title||'Banner'}" onerror="this.style.display='none'">`
        : '';
      const chars = Array.isArray(b.characters) && b.characters.length
        ? `<div class="banner-meta">Incluye: ${b.characters.join(', ')}</div>` : '';
      const notes = b.notes ? `<div class="banner-meta"><small>${b.notes}</small></div>` : '';

      return `
        <li class="banner-tile">
          <div class="banner-thumb">${img}</div>
          <div class="banner-body">
            <div class="tile-head">
              <b>${b.title || 'Sin título'}</b>
              <small class="pill">${b.type || 'banner'}</small>
            </div>
            <div class="banner-meta">${dates || ''}</div>
            ${chars}
            ${notes}
          </div>
        </li>
      `;
    }).join('');
  }catch(e){
    console.error('[BANNERS] Error cargando data/banners.json', e);
    ul.innerHTML = '<li style="color:#ffb4a3">No pude cargar <code>data/banners.json</code>.</li>';
  }
}

/* ===========================
   Home: Videos (slider simple)
   =========================== */
function ytToEmbed(url){
  try{
    const u = new URL(url);
    const list = u.searchParams.get('list');
    if(list) return `https://www.youtube.com/embed/videoseries?list=${list}`;
    if(u.hostname.includes('youtu.be')){
      const id = u.pathname.replace('/','');
      return `https://www.youtube.com/embed/${id}`;
    }
    if(u.pathname === '/watch' && u.searchParams.get('v')){
      return `https://www.youtube.com/embed/${u.searchParams.get('v')}`;
    }
    return null;
  }catch{ return null; }
}

const VC = { idx:0, perView:2, slides:[], track:null, prevBtn:null, nextBtn:null, viewport:null };

function vcUpdate(){
  if(!VC.viewport || !VC.track) return;
  const W = VC.viewport.clientWidth || 0;
  VC.perView = window.innerWidth < 900 ? 1 : 2;
  const slideW = Math.max(260, Math.floor(W / Math.max(1, VC.perView)));
  VC.slides.forEach(s => s.style.width = `${slideW}px`);
  const maxIdx = Math.max(0, VC.slides.length - VC.perView);
  if(VC.idx > maxIdx) VC.idx = maxIdx;
  VC.track.style.transform = `translateX(-${VC.idx * slideW}px)`;
  if(VC.prevBtn) VC.prevBtn.disabled = VC.idx <= 0;
  if(VC.nextBtn) VC.nextBtn.disabled = VC.idx >= maxIdx;
}
function vcGo(delta){ VC.idx += delta; vcUpdate(); }

async function initVideos(){
  VC.track    = $('#videos-track');
  VC.prevBtn  = $('#videos-section .vc-prev');
  VC.nextBtn  = $('#videos-section .vc-next');
  VC.viewport = $('#videos-section .vc-viewport');
  if(!VC.track || !VC.viewport) return;

  if(VC.prevBtn) VC.prevBtn.addEventListener('click', ()=>vcGo(-1));
  if(VC.nextBtn) VC.nextBtn.addEventListener('click', ()=>vcGo(+1));
  window.addEventListener('resize', vcUpdate);

  let videos = [];
  try{ videos = await loadJSON('data/videos.json'); }
  catch(e){ console.warn('No pude leer data/videos.json', e); }

  const enabled = (videos||[]).filter(v => v && v.enabled && v.url);
  const empty = $('#videos-empty');
  if(!enabled.length){
    if(empty) empty.style.display = '';
    if(VC.prevBtn && VC.nextBtn){
      VC.prevBtn.style.display = 'none';
      VC.nextBtn.style.display = 'none';
    }
    return;
  }
  if(empty) empty.style.display = 'none';

  VC.track.innerHTML = enabled.map(v=>{
    const embed = ytToEmbed(v.url);
    if(!embed) return '';
    const title   = v.title   || '';
    const creator = v.creator || '';
    return `
      <div class="video-card">
        <div class="video-embed">
          <iframe src="${embed}" title="${title || 'YouTube'}" frameborder="0"
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowfullscreen></iframe>
        </div>
        ${(title || creator) ? `
        <div style="margin-top:8px">
          ${creator ? `<div class="banner-meta"><b>Creador:</b> ${creator}</div>`:''}
          ${title   ? `<div class="banner-meta"><b>Título:</b> ${title}</div>`:''}
        </div>`:''}
      </div>`;
  }).join('');

  VC.slides = $$('.video-card', VC.track);
  vcUpdate();
}

/* ===========================
   Tier List
   =========================== */
async function loadTier(){
  const el = $('#tierlist'); if(!el) return;
  try{
    const data = await loadJSON('data/tierlist.json');
    const renderTable = (rows)=>`
      <table class="tier-table">
        <thead><tr><th>Tier</th><th>Personajes</th><th>Notas</th></tr></thead>
        <tbody>${rows.map(r=>`
          <tr class="tier-row">
            <td><b>${r.tier}</b></td>
            <td>${(r.characters||[]).join(', ')}</td>
            <td><small>${r.notes||''}</small></td>
          </tr>`).join('')}
        </tbody>
      </table>`;
    el.innerHTML = `
      <h3>PvE</h3>${renderTable(data.PvE||[])}
      <h3 style="margin-top:16px">PvP</h3>${renderTable(data.PvP||[])}
    `;
  }catch(e){
    el.innerHTML = '<p class="banner-meta">No pude cargar <code>data/tierlist.json</code>.</p>';
  }
}

/* ===========================
   Calendar (simple cards)
   =========================== */
async function loadCalendar(){
  const grid = $('#calendar-grid'); if(!grid) return;
  try{
    const banners = await loadJSON('data/banners.json');
    grid.innerHTML = (banners||[]).slice(0,6).map(b=>`
      <article class="card">
        <h3>${b.title||'Sin título'}</h3>
        ${b.image ? `<img class="banner-img" src="${b.image}" alt="${b.title||'Banner'}">` : ''}
        <p class="banner-meta"><b>${b.start?.slice(0,10)||''}</b> → <b>${b.end?.slice(0,10)||''}</b></p>
        ${(b.characters||[]).length ? `<p>${b.characters.join(', ')}</p>`:''}
        ${b.notes ? `<p><small>${b.notes}</small></p>`:''}
      </article>`).join('');
  }catch(e){
    grid.innerHTML = '<p class="banner-meta">No pude cargar <code>data/banners.json</code>.</p>';
  }
}

/* ===========================
   Calculator
   =========================== */
const CALC_LS_KEY = 'calc.v1';
let   CALC_CFG    = null;

async function loadCalcConfig(){
  try {
    CALC_CFG = await loadJSON('data/calc.json');
  } catch(e){
    console.warn('calc.json no disponible, uso fallback', e);
    CALC_CFG = {
      bannerTypes:{UR:{pull_cost:150,pity:140}, SSR:{pull_cost:150,pity:80}},
      daily:{f2p:406.67, passes:[
        {id:'pass_normal',label:'Pass mensual (Normal)',diamonds_per_day:90},
        {id:'pass_elite', label:'Pass mensual (Élite)', diamonds_per_day:100}
      ]},
      milestones:{UR:[{at_pulls:10,bonus_tickets:2},{at_pulls:50,bonus_tickets:5}], SSR:[{at_pulls:10,bonus_tickets:2},{at_pulls:50,bonus_tickets:5}]},
      presets:[
        {id:'f2p',label:'F2P',pass_normal:false,pass_elite:false},
        {id:'normal',label:'Pass Normal',pass_normal:true,pass_elite:false},
        {id:'elite',label:'Pass Élite',pass_normal:false,pass_elite:true}
      ]
    };
  }
}

function calcState(load=true){
  if(load){
    try { return JSON.parse(localStorage.getItem(CALC_LS_KEY)) || {}; }
    catch{ return {}; }
  }
  return {};
}
function saveCalcState(s){
  try { localStorage.setItem(CALC_LS_KEY, JSON.stringify(s)); } catch{}
}

function applyPreset(id){
  const p = (CALC_CFG.presets||[]).find(x=>x.id===id);
  if(!p) return;
  const n = $('#calc-pass-normal'), e = $('#calc-pass-elite');
  if(n) n.checked = !!p.pass_normal;
  if(e) e.checked = !!p.pass_elite;
  renderCalc();
}

function getMilestoneBonusTickets(bannerType, baseTickets){
  const ms = (CALC_CFG.milestones||{})[bannerType] || [];
  let bonus = 0;
  const has10 = ms.some(m=>m.at_pulls===10);
  const has50 = ms.some(m=>m.at_pulls===50);
  if (has10 && baseTickets >= 10) bonus += 2;
  if (has50 && (baseTickets + bonus) >= 50) bonus += 5;
  return bonus;
}

function computeCalc(){
  const bannerType = $('#calc-banner')?.value || 'UR';
  const pullCost = CALC_CFG.bannerTypes[bannerType]?.pull_cost ?? 150;
  const pity     = CALC_CFG.bannerTypes[bannerType]?.pity ?? 140;

  const diamondsNow = Math.max(0, Number($('#calc-diamonds')?.value)||0);
  const ticketsNow  = Math.max(0, Number($('#calc-tickets')?.value)||0);
  const days        = Math.max(0, Number($('#calc-days')?.value)||0);

  const passNormal = !!$('#calc-pass-normal')?.checked;
  const passElite  = !!$('#calc-pass-elite')?.checked;

  const dailyBase = Number(CALC_CFG.daily?.f2p)||0;
  const dPassN = CALC_CFG.daily?.passes?.find(p=>p.id==='pass_normal')?.diamonds_per_day || 0;
  const dPassE = CALC_CFG.daily?.passes?.find(p=>p.id==='pass_elite')?.diamonds_per_day  || 0;

  const dailyIncome = dailyBase + (passNormal?dPassN:0) + (passElite?dPassE:0);
  const earnedDiamonds = dailyIncome * days;
  const totalDiamonds  = diamondsNow + earnedDiamonds;

  const ticketsFromDiamonds = Math.floor(totalDiamonds / pullCost);
  const baseTickets = ticketsNow + ticketsFromDiamonds;

  const bonusTickets = getMilestoneBonusTickets(bannerType, baseTickets);
  const totalTickets = baseTickets + bonusTickets;

  const pullsToPity = Math.max(0, pity - totalTickets);
  const diamondsNeededForDeficit = pullsToPity * pullCost;

  return {
    bannerType, pullCost, pity,
    diamondsNow, ticketsNow, days,
    passNormal, passElite,
    dailyIncome, earnedDiamonds, totalDiamonds,
    ticketsFromDiamonds, bonusTickets, totalTickets,
    pullsToPity, diamondsNeededForDeficit
  };
}

function renderCalc(){
  const s = computeCalc();

  saveCalcState({
    bannerType: s.bannerType,
    diamonds: $('#calc-diamonds')?.value,
    tickets:  $('#calc-tickets')?.value,
    days:     $('#calc-days')?.value,
    passNormal: s.passNormal,
    passElite:  s.passElite
  });

  const fmt = (n)=> (Math.round(n*100)/100).toLocaleString();

  const out = $('#calc-out');
  if(out){
    out.innerHTML = `
      <div><b>Ingreso diario</b>: ${fmt(s.dailyIncome)} diamantes/día</div>
      <div><b>Diamantes a conseguir</b>: ${fmt(s.earnedDiamonds)}</div>
      <div><b>Total de diamantes</b>: ${fmt(s.totalDiamonds)}</div>
      <hr>
      <div><b>Tickets por diamantes</b>: ${s.ticketsFromDiamonds}</div>
      <div><b>Tickets actuales</b>: ${s.ticketsNow}</div>
      <div><b>Bonus por hitos</b>: +${s.bonusTickets} tickets</div>
      <div><b>Total de tiradas estimadas</b>: ${s.totalTickets}</div>
      <hr>
      <div><b>Pity (${s.pity})</b>: te faltan <b>${s.pullsToPity}</b> tiradas</div>
      <div><b>Diamantes necesarios</b>: ${fmt(s.diamondsNeededForDeficit)}</div>
    `;
  }

  const note = $('#calc-note');
  if(note){
    note.textContent =
      s.bonusTickets > 0
        ? 'Nota: se aplicaron recompensas del banner (2 tickets al llegar a 10 tiradas y +5 al llegar a 50).'
        : 'Nota: las recompensas del banner se sumarán automáticamente si alcanzas 10/50 tiradas.';
  }
}

async function initCalc(){
  const tab = $('#tab-calc');
  if(!tab) return;
  await loadCalcConfig();

  const st = calcState(true);
  if(st.bannerType && $('#calc-banner')) $('#calc-banner').value = st.bannerType;
  if(st.diamonds   && $('#calc-diamonds')) $('#calc-diamonds').value = st.diamonds;
  if(st.tickets    && $('#calc-tickets'))  $('#calc-tickets').value  = st.tickets;
  if(st.days       && $('#calc-days'))     $('#calc-days').value     = st.days;
  if(typeof st.passNormal==='boolean' && $('#calc-pass-normal')) $('#calc-pass-normal').checked = st.passNormal;
  if(typeof st.passElite ==='boolean' && $('#calc-pass-elite'))  $('#calc-pass-elite').checked  = st.passElite;

  ['#calc-banner','#calc-diamonds','#calc-tickets','#calc-days','#calc-pass-normal','#calc-pass-elite']
    .forEach(sel=>{
      document.addEventListener('input', ev=>{
        if(ev.target.matches(sel)) renderCalc();
      });
    });

  $('#calc-preset-f2p')?.addEventListener('click', ()=>applyPreset('f2p'));
  $('#calc-preset-normal')?.addEventListener('click', ()=>applyPreset('normal'));
  $('#calc-preset-elite')?.addEventListener('click', ()=>applyPreset('elite'));

  renderCalc();
}

/* =====================================================================
   TEAM BUILDER (incluye vínculos escuela + específicos)
   ===================================================================== */
const TB = (() => {
  const RAREZA_ORDER = {SP:6, UR:5, SSR:4, SR:3, R:2, N:1};
  const MAP_ROLE = {
    "Opposite":"OP","Wing Spiker":"WS","Middle Blocker":"MB","Setter":"S","Libero":"L",
    "OP":"OP","WS":"WS","MB":"MB","S":"S","L":"L"
  };
  const SCHOOL_THRESHOLD_DEFAULT = 4;
  const LINKS_LS_KEY = 'tb_links_levels_v1';
  const ACC_LS_KEY = 'tb_acc_v1';

  // Líbero SIEMPRE en idx 6. Todos los layouts usan exactamente los mismos 6 idx: 0,1,2,3,4,5 (sin 7/8)
// Los layouts ya vienen ROTADOS (posiciones) para que coincidan con la rotación real.
const SLOT_LAYOUTS = [
  // Layout 0
  [
    { idx: 0, pos: "OP" },
    { idx: 1, pos: "MB" },
    { idx: 2, pos: "WS" },
    { idx: 3, pos: "WS" },
    { idx: 4, pos: "MB" },
    { idx: 5, pos: "S"  },
    { idx: 6, pos: "L"  }
  ],
  // Layout 1 (rotación 1 paso)
  [
    { idx: 0, pos: "WS" },
    { idx: 1, pos: "OP" },
    { idx: 2, pos: "MB" },
    { idx: 3, pos: "MB" },
    { idx: 4, pos: "S"  },
    { idx: 5, pos: "WS" },
    { idx: 6, pos: "L"  }
  ],
  // Layout 2 (rotación 2 pasos)
  [
    { idx: 0, pos: "MB" },
    { idx: 1, pos: "WS" },
    { idx: 2, pos: "OP" },
    { idx: 3, pos: "S"  },
    { idx: 4, pos: "WS" },
    { idx: 5, pos: "MB" },
    { idx: 6, pos: "L"  }
  ],
  // Layout 3 (rotación 3 pasos)
  [
    { idx: 0, pos: "S"  },
    { idx: 1, pos: "MB" },
    { idx: 2, pos: "WS" },
    { idx: 3, pos: "WS" },
    { idx: 4, pos: "MB" },
    { idx: 5, pos: "OP" },
    { idx: 6, pos: "L"  }
  ]
];

   const state = {
    characters: [],
    byVar: new Map(),
    byBase: new Map(),
    schools: [],
    links: [],
    // Estado legacy (lo usaremos solo para inicializar el primer equipo)
    layoutIdx: 0,
    slots: Array(7).fill(null),
    bench: [],
    undoStack: [],
    // Nuevo: estructura para múltiples equipos (por ahora solo 1)
    teams: [],
    currentTeamIndex: 0,
    linksLevels: {},
    accordion: { schools: {}, links: {} },
    // Datos para sistema de bonificaciones del Team Builder
    bonusTags: [],
    bonusTagIndex: {},
    specialtyBonuses: [],
    positionBonuses: [],
    currentSpecialtyCounts: {},
    currentPositionCounts: {},
    currentSpecialtyStatus: {},
    currentPositionStatus: {},
  };

  // Para feedback de drop
  let draggingVarId = null;

     function getCurrentTeam(){
    // Garantiza que siempre haya al menos un equipo
    if(!Array.isArray(state.teams) || !state.teams.length){
      const initialSlots = Array.isArray(state.slots) && state.slots.length === 7
        ? state.slots
        : Array(7).fill(null);
      const initialBench = Array.isArray(state.bench) ? state.bench : [];
      const initialLayout = typeof state.layoutIdx === 'number' ? state.layoutIdx : 0;
      const initialUndo = Array.isArray(state.undoStack) ? state.undoStack : [];

      state.teams = [{
        id: 'team_1',
        name: 'Equipo 1',
        layoutIdx: initialLayout,
        slots: initialSlots,
        bench: initialBench,
        undoStack: initialUndo
      }];
      state.currentTeamIndex = 0;
    }

    const idx = Math.min(
      Math.max(0, state.currentTeamIndex | 0),
      state.teams.length - 1
    );
    return state.teams[idx];
  }

  function createNewTeam(name){
    const idx = Array.isArray(state.teams) ? state.teams.length + 1 : 1;
    return {
      id: `team_${Date.now()}_${Math.random().toString(36).slice(2,7)}`,
      name: name || `Equipo ${idx}`,
      layoutIdx: 0,
      slots: Array(7).fill(null),
      bench: [],
      undoStack: []
    };
  }
   
  // Inyectar estilos drop-valid/invalid
  function ensureTBStyles(){
    if($('#tb-drop-styles')) return;
    const style = document.createElement('style');
    style.id = 'tb-drop-styles';
    style.textContent = `
      .droptarget.drop-valid{outline:2px solid #22c55e !important; box-shadow:0 0 0 3px rgba(34,197,94,.25) inset}
      .droptarget.drop-invalid{outline:2px solid #ef4444 !important; box-shadow:0 0 0 3px rgba(239,68,68,.25) inset}
    `;
    document.head.appendChild(style);
  }

      const LS_KEY       = 'tb_teams_v1';
  const LS_KEY_LEGACY = 'tb_state_v1';

  function saveState(){
    try{
      // Aseguramos que haya al menos un equipo
      const current = getCurrentTeam();
      const teams = Array.isArray(state.teams) && state.teams.length
        ? state.teams
        : [current];

      const safeTeams = teams.map((t, idx)=>({
        id: t.id || `team_${idx+1}`,
        name: t.name || `Equipo ${idx+1}`,
        layoutIdx: (typeof t.layoutIdx === 'number') ? t.layoutIdx : 0,
        slots: (Array.isArray(t.slots) && t.slots.length === 7) ? t.slots : Array(7).fill(null),
        bench: Array.isArray(t.bench) ? t.bench : []
      }));

      const payload = {
        schemaVersion: 'teams.v1',
        currentTeamIndex: Math.min(
          Math.max(0, state.currentTeamIndex | 0),
          safeTeams.length - 1
        ),
        teams: safeTeams
      };

      localStorage.setItem(LS_KEY, JSON.stringify(payload));
    }catch(e){
      console.warn('No pude guardar estado del Team Builder', e);
    }
  }

  function loadState(){
    // 1) Intentar formato nuevo (múltiples equipos)
    try{
      const raw = localStorage.getItem(LS_KEY);
      if(raw){
        const obj = JSON.parse(raw);
        if(obj && Array.isArray(obj.teams) && obj.teams.length){
          state.teams = obj.teams.map((t, idx)=>({
            id: t.id || `team_${idx+1}`,
            name: t.name || `Equipo ${idx+1}`,
            layoutIdx: (typeof t.layoutIdx === 'number') ? t.layoutIdx : 0,
            slots: (Array.isArray(t.slots) && t.slots.length === 7) ? t.slots : Array(7).fill(null),
            bench: Array.isArray(t.bench) ? t.bench : [],
            undoStack: []
          }));
          state.currentTeamIndex = Math.min(
            Math.max(0, obj.currentTeamIndex | 0),
            state.teams.length - 1
          );
          return;
        }
      }
    }catch(e){
      console.warn('No pude leer tb_teams_v1, intento formato legacy', e);
    }

    // 2) Fallback: formato antiguo (un solo equipo)
    try{
      const rawLegacy = localStorage.getItem(LS_KEY_LEGACY);
      if(!rawLegacy) return;
      const obj = JSON.parse(rawLegacy);
      const team = {
        id: 'team_1',
        name: 'Equipo 1',
        layoutIdx: obj.layoutIdx ?? 0,
        slots: Array.isArray(obj.slots) && obj.slots.length===7 ? obj.slots : Array(7).fill(null),
        bench: Array.isArray(obj.bench) ? obj.bench : [],
        undoStack: []
      };
      state.teams = [team];
      state.currentTeamIndex = 0;
    }catch(e){
      console.warn('No pude leer tb_state_v1 legacy', e);
    }
  }

  function loadLinksLevels(){
    try{ state.linksLevels = JSON.parse(localStorage.getItem(LINKS_LS_KEY)) || {}; }
    catch{ state.linksLevels = {}; }
  }
  function saveLinksLevels(){
    try{ localStorage.setItem(LINKS_LS_KEY, JSON.stringify(state.linksLevels)); }
    catch{}
  }
function loadAccordion(){
  try { state.accordion = JSON.parse(localStorage.getItem(ACC_LS_KEY)) || {schools:{},links:{}}; }
  catch { state.accordion = {schools:{},links:{}}; }
}
function saveAccordion(){
  try { localStorage.setItem(ACC_LS_KEY, JSON.stringify(state.accordion)); } catch {}
}
    function pushUndo(){
    const team = getCurrentTeam();
    team.undoStack = team.undoStack || [];
    team.undoStack.push(JSON.stringify({
      layoutIdx: team.layoutIdx,
      slots: [...team.slots],
      bench: [...team.bench]
    }));
    if(team.undoStack.length > 25) team.undoStack.shift();
  }
  function undo(){
    const team = getCurrentTeam();
    team.undoStack = team.undoStack || [];
    const last = team.undoStack.pop();
    if(!last) return toast('Nada para deshacer');
    const snap = JSON.parse(last);
    team.layoutIdx = snap.layoutIdx;
    team.slots = snap.slots;
    team.bench = snap.bench;
    renderAll();
    saveState();
  }

  function toBaseId(name){
    return String(name||'').toLowerCase().replace(/[^a-z0-9]+/g,' ').trim().replace(/\s+/g,'_');
  }
  function makeVarId(baseId, rareza, rawId){
    if(rawId && !/^\s*$/.test(rawId)) return rawId;
    return `${baseId}__${(rareza||'').toLowerCase()}`;
  }

  async function loadData(){
    const chars = await loadJSON('data/characters.json');
    const normalized = chars.map(c => {
      const baseId = c.baseId || c.id || toBaseId(c.name || c.nombre || '');
      const posicion = MAP_ROLE[c.role] || MAP_ROLE[c.posicion] || "WS";
      const rareza   = (c.rarity || c.rareza || 'SSR').toUpperCase();
      const varianteId = makeVarId(baseId, rareza, c.varianteId);
      const escuelaId = (c.schoolId || c.escuelaId || toBaseId(c.school || c.escuela || '')).replace(/_high_school|_hs/g,'');
      const alias = [c.nameEN,c.nameJP,c.nombreJP,c.nombreEN].filter(Boolean);
      return {
        baseId, varianteId,
        nombreES: c.nombre || c.name || baseId,
        nombreJP: c.nombreJP || c.nameJP || '',
        nombreEN: c.nombreEN || c.nameEN || '',
        escuelaId, posicion, rareza,
        avatarPath: c.avatar || c.avatarPath || `assets/characters/${varianteId}.png`,
        alias,
        // Tags crudos tal como vienen de characters.json
        tagsRaw: Array.isArray(c.tags) ? c.tags.filter(Boolean) : [],
        // Tags de especialidad canónicos (se recalculan tras cargar bonos)
        specialtyTags: []
      };
    });
    state.characters = normalized;
    state.byVar = new Map(normalized.map(p => [p.varianteId, p]));
    state.byBase = new Map();
    normalized.forEach(p=>{
      const arr = state.byBase.get(p.baseId) || [];
      arr.push(p);
      state.byBase.set(p.baseId, arr);
    });

    try{ state.schools = await loadJSON('data/schools.json'); }
    catch(e){ console.warn('No se pudo cargar data/schools.json', e); state.schools = []; }

    try{ state.links = await loadJSON('data/links.json'); }
    catch(e){ console.warn('No se pudo cargar data/links.json', e); state.links = []; }
  }
  async function loadBonusTags(){
    try{
      const data = await loadJSON('data/tb-bonos-tags.json');
      const tags = Array.isArray(data && data.tags) ? data.tags : (Array.isArray(data) ? data : []);
      state.bonusTags = tags;
      const index = {};
      tags.forEach(t=>{
        const key = t.key || t.tagKey;
        if(!key) return;
        const normKey = normalizeStr(key);
        if(normKey) index[normKey] = key;
        if(t.name){
          const normName = normalizeStr(t.name);
          if(normName) index[normName] = key;
        }
        if(Array.isArray(t.synonyms)){
          t.synonyms.forEach(s=>{
            const norm = normalizeStr(s);
            if(norm) index[norm] = key;
          });
        }
      });
      state.bonusTagIndex = index;
    }catch(e){
      console.warn('No se pudo cargar data/tb-bonos-tags.json', e);
      state.bonusTags = [];
      state.bonusTagIndex = {};
    }
  }

  async function loadSpecialtyBonuses(){
    try{
      const data = await loadJSON('data/tb-bonos-especialidad.json');
      const list = Array.isArray(data && data.specialtyBonuses) ? data.specialtyBonuses : (Array.isArray(data) ? data : []);
      state.specialtyBonuses = list;
    }catch(e){
      console.warn('No se pudo cargar data/tb-bonos-especialidad.json', e);
      state.specialtyBonuses = [];
    }
  }

  async function loadPositionBonuses(){
    try{
      const data = await loadJSON('data/tb-bonos-posicion.json');
      const list = Array.isArray(data && data.positionBonuses) ? data.positionBonuses : (Array.isArray(data) ? data : []);
      state.positionBonuses = list;
    }catch(e){
      console.warn('No se pudo cargar data/tb-bonos-posicion.json', e);
      state.positionBonuses = [];
    }
  }

  async function loadBonuses(){
    try{
      await Promise.all([
        loadBonusTags(),
        loadSpecialtyBonuses(),
        loadPositionBonuses(),
      ]);
    }catch(e){
      console.warn('Error al cargar bonificaciones del Team Builder', e);
    }
    // Una vez cargados los datos de bonus, recalculamos tags canónicos
    recomputeSpecialtyTagsForAll();
  }

  function recomputeSpecialtyTagsForAll(){
    const index = state.bonusTagIndex || {};
    if(!Array.isArray(state.characters)) return;
    state.characters.forEach(ch=>{
      const raw = Array.isArray(ch.tagsRaw) ? ch.tagsRaw : [];
      const seen = new Set();
      const canonical = [];
      raw.forEach(tag=>{
        const norm = normalizeStr(tag);
        const key = index[norm];
        if(key && !seen.has(key)){
          seen.add(key);
          canonical.push(key);
        }
      });
      ch.specialtyTags = canonical;
    });
  }



    function isDuplicate(varId){
    const base = state.byVar.get(varId)?.baseId;
    if(!base) return false;
    const team = getCurrentTeam();
    const slots = Array.isArray(team.slots) ? team.slots : [];
    const bench = Array.isArray(team.bench) ? team.bench : [];
    const exists = [...slots, ...bench]
      .filter(Boolean)
      .some(v => state.byVar.get(v)?.baseId === base);
    return exists;
  }

  function toast(msg){
    const el = document.createElement('div');
    el.className = 'tb-toast';
    el.textContent = msg;
    document.body.appendChild(el);
    setTimeout(()=>{ el.remove(); }, 1800);
  }
  function fmtTitle(s){
    return String(s||'').replace(/_/g,' ').replace(/\b\w/g,m=>m.toUpperCase());
  }


    function renderField(){
    const field = $('#tb-field'); if(!field) return;
    field.innerHTML = '';

    const team = getCurrentTeam();
    const layout = SLOT_LAYOUTS[team.layoutIdx];

    // Crear grilla básica 3x3
    for(let i=0;i<9;i++){
      const slotEl = document.createElement('div');
      slotEl.className = 'tb-slot';
      slotEl.dataset.grid = String(i);
      field.appendChild(slotEl);
    }

    layout.forEach((conf, logicalIdx) => {
      const host = field.children[conf.idx];
      host.classList.add('droptarget');
      host.dataset.slotIndex = String(logicalIdx);
      host.dataset.pos = conf.pos;
      const lab = document.createElement('span');
      lab.className = 'slot-label';
      lab.textContent = conf.pos;
      host.appendChild(lab);

      const inner = document.createElement('div');
      inner.className = 'tb-slot-inner';
      host.appendChild(inner);

            const varId = team.slots[logicalIdx];

      if (varId) {
        const card = makeCard(varId);
        inner.appendChild(card);
        host.classList.add('filled');

        // NUEVO: controles minimalistas superpuestos (solo iconos)
        const controls = document.createElement('div');
        controls.className = 'tb-slot-controls';
        controls.innerHTML = `
          <button
            type="button"
            class="tb-slot-icon tb-slot-clear tb-slot-icon-remove"
            data-slot-index="${logicalIdx}"
            aria-label="Quitar jugador"
          >
            ×
          </button>
          <button
            type="button"
            class="tb-slot-icon tb-slot-choose tb-slot-icon-swap"
            data-slot-index="${logicalIdx}"
            aria-label="Cambiar jugador"
          >
            ⟳
          </button>
        `;
        inner.appendChild(controls);
      } else {
        // NUEVO: slot vacío = toda la ficha es el botón de selección
        inner.innerHTML = `
          <button
            type="button"
            class="tb-slot-choose tb-slot-empty-btn"
            data-slot-index="${logicalIdx}"
          >
            <span class="tb-slot-empty-label">Seleccionar jugador</span>
          </button>
        `;
      }
    });

    // Ocultar celdas que no pertenecen al layout activo
    $$('.tb-slot', field).forEach(cell=>{
      if(!cell.classList.contains('droptarget')) cell.style.display = 'none';
      else cell.style.display = '';
    });

    bindDnD(field);
  }

    function renderBench(){
    const el = $('#tb-bench'); if(!el) return;
    el.innerHTML = '';

    const team = getCurrentTeam();
    const bench = Array.isArray(team.bench) ? team.bench : [];

    const counter = $('#tb-bench-count');
    if(counter) counter.textContent = `${bench.length}/6`;
    bench.forEach(varId => el.appendChild(makeCard(varId)));
    bindDnD(el);
  }

  function renderList(){
    const root = $('#tb-list'); if(!root) return;
    root.innerHTML = '';

    const q = normalizeStr($('#tb-search').value||'');
    const esc = $('#tb-filter-escuela').value;
    const rar = $('#tb-filter-rareza').value;

    const filtered = state.characters.filter(p => {
      if(esc && p.escuelaId!==esc) return false;
      if(rar && p.rareza!==rar) return false;
      if(q){
        const items = [p.nombreES, p.nombreEN, p.nombreJP, p.baseId, ...(p.alias||[])].filter(Boolean);
        const hit = items.some(txt => normalizeStr(txt).includes(q));
        if(!hit) return false;
      }
      return true;
    });

    const sections = [["OP","Opuesto"],["WS","Wing Spiker"],["MB","Middle Blocker"],["S","Setter"],["L","Líbero"]];
    sections.forEach(([code,label])=>{
      const sec = document.createElement('div');
      sec.className = 'section tb-card';
      sec.innerHTML = `<h4>${label}</h4><div class="tb-grid"></div>`;
      const grid = sec.querySelector('.tb-grid');

      filtered
        .filter(p=>p.posicion===code)
        .sort((a,b)=> (RAREZA_ORDER[b.rareza]-RAREZA_ORDER[a.rareza]) || a.nombreES.localeCompare(b.nombreES))
        .forEach(p => grid.appendChild(makeCard(p.varianteId)));

      root.appendChild(sec);
    });

    const selEs = $('#tb-filter-escuela');
    if(selEs && selEs.childElementCount<=1){
      const set = new Set(state.characters.map(p=>p.escuelaId));
      Array.from(set).sort().forEach(id=>{
        const opt = document.createElement('option');
        opt.value = id; opt.textContent = fmtTitle(id);
        selEs.appendChild(opt);
      });
    }

    // Habilitar DnD desde la lista
    bindDnD(root);
  }


  // === Fase 2: selector por casilla ===
  let pickerSlotIndex = null;

    function openPicker(slotIdx){
    pickerSlotIndex = slotIdx;
    const backdrop = $('#tb-picker-backdrop');
    if(!backdrop) return;
    backdrop.hidden = false;
    document.body.style.overflow = 'hidden';

    const team = getCurrentTeam();
    const layout = SLOT_LAYOUTS[team.layoutIdx] || [];
    const conf = layout[slotIdx] || null;
    const titleEl = $('#tb-picker-title');
    if(titleEl){
      const posLabel = conf ? conf.pos : '';
      titleEl.textContent = posLabel ? `Elegir personaje para ${posLabel}` : 'Elegir personaje';
    }

    renderPickerList();
  }

  function closePicker(){
    const backdrop = $('#tb-picker-backdrop');
    if(!backdrop) return;
    backdrop.hidden = true;
    document.body.style.overflow = '';
    pickerSlotIndex = null;
  }

  function renderPickerList(){
    const listEl = $('#tb-picker-list'); if(!listEl) return;
    if(pickerSlotIndex == null){
      listEl.innerHTML = '<p class="banner-meta">Selecciona primero una casilla.</p>';
      return;
    }

        const team = getCurrentTeam();
    const layout = SLOT_LAYOUTS[team.layoutIdx] || [];
    const conf = layout[pickerSlotIndex] || null;
    const needPos = conf ? conf.pos : null;

    const qInput = $('#tbp-search');
    const roleSel = $('#tbp-role');
    const rarSel = $('#tbp-rareza');
    const schoolSel = $('#tbp-school');

    const q = normalizeStr(qInput && qInput.value || '');
    const role = roleSel && roleSel.value || '';
    const rar = rarSel && rarSel.value || '';
    const sch = schoolSel && schoolSel.value || '';

    // Rellenar escuelas si hace falta
    if(schoolSel && schoolSel.childElementCount<=1 && state.characters.length){
      const set = new Set(state.characters.map(p=>p.escuelaId).filter(Boolean));
      Array.from(set).sort().forEach(id=>{
        const opt = document.createElement('option');
        opt.value = id;
        opt.textContent = fmtTitle(id);
        schoolSel.appendChild(opt);
      });
    }

    let list = state.characters.slice();

    // Restricción de líbero en casilla de L
    if(needPos === 'L'){
      list = list.filter(p=>p.posicion === 'L');
    }

    if(role){
      list = list.filter(p=>p.posicion === role);
    }
    if(rar){
      list = list.filter(p=>p.rareza === rar);
    }
    if(sch){
      list = list.filter(p=>p.escuelaId === sch);
    }
    if(q){
      list = list.filter(p=>{
        const items = [p.nombreES, p.nombreEN, p.nombreJP, p.baseId, ...(p.alias||[])].filter(Boolean);
        return items.some(txt => normalizeStr(txt).includes(q));
      });
    }

    if(!list.length){
      listEl.innerHTML = '<p class="banner-meta">No hay personajes que cumplan los filtros seleccionados.</p>';
      return;
    }

    list.sort((a,b)=> (RAREZA_ORDER[b.rareza]-RAREZA_ORDER[a.rareza]) || a.nombreES.localeCompare(b.nombreES));

    listEl.innerHTML = list.map(p=>`
      <article class="tb-picker-item" data-varid="${p.varianteId}">
        <img loading="lazy" src="${p.avatarPath}" alt="${p.nombreES}"
             onerror="this.onerror=null;this.src='assets/placeholder.png'">
        <div class="tb-picker-meta">
          <div class="tb-picker-name">${p.nombreES}</div>
          <div class="tb-picker-tags">
            <span class="chip">${p.posicion}</span>
            <span class="chip">${p.rareza}</span>
            ${p.escuelaId ? `<span class="chip">${fmtTitle(p.escuelaId)}</span>` : ''}
          </div>
          <button type="button" class="tb-picker-select" data-varid="${p.varianteId}">Elegir</button>
        </div>
      </article>
    `).join('');

    $$('.tb-picker-select', listEl).forEach(btn=>{
      btn.addEventListener('click', ()=>{
        const varId = btn.getAttribute('data-varid');
        if(!varId || pickerSlotIndex==null) return;
        handleDropSlot(varId, pickerSlotIndex);
        closePicker();
      });
    });
  }
  function makeCard(varId){
  const p = state.byVar.get(varId);
  const el = document.createElement('div');
  el.className = 'tb-card-item';

  // === NUEVO: info de rareza para estilos ===
  const rarity = (p.rareza || '').toUpperCase();
  el.dataset.rareza = rarity;
  if (rarity) {
    el.classList.add('tb-rarity-' + rarity.toLowerCase()); // sp, ur, ssr, sr, r, n
  }
  // ==========================================

  el.draggable = true;
  el.dataset.varid = p.varianteId;
  el.dataset.pos = p.posicion;
  el.title = `${p.nombreES} [${p.posicion}] (${p.rareza})`;
  el.innerHTML = `
      <img loading="lazy" src="${p.avatarPath}" alt="${p.nombreES}"
           onerror="this.onerror=null;this.src='assets/placeholder.png'">
      <span class="tb-pos-tag">${p.posicion}</span>
      <span class="tb-badge">${p.rareza}</span>
    `;
  el.addEventListener('click', () => quickPlace(p));
  return el;
}

   function quickPlace(p){
    const team = getCurrentTeam();
    const layout = SLOT_LAYOUTS[team.layoutIdx];
    const liberoIdx = layout.findIndex(conf => conf.pos === 'L');
    const isLibero = p.posicion === 'L';

    let targetIdx = -1;

    if (isLibero) {
      // 1) Intentar primero la casilla de Líbero
      if (liberoIdx >= 0 && !team.slots[liberoIdx]) {
        targetIdx = liberoIdx;
      } else {
        // 2) Cualquier otra casilla titular libre (no-L)
        targetIdx = team.slots.findIndex((v, i) => !v && layout[i].pos !== 'L');
      }
    } else {
      // No-Líbero: cualquier casilla titular libre que no sea la de Líbero
      targetIdx = team.slots.findIndex((v, i) => !v && layout[i].pos !== 'L');
    }

    if (targetIdx >= 0) {
      tryPlaceInSlot(p.varianteId, targetIdx);
      return;
    }

    // Si no hay espacio en titulares, aplican reglas de banca actuales
    if(isLibero){ toast('No se permiten Líberos en la banca.'); return; }
    if(team.bench.length>=6){ toast('Banca llena (máximo 6).'); return; }
    if(isDuplicate(p.varianteId)){ toast('Personaje ya en uso (no se permiten variantes duplicadas en el equipo).'); return; }
    pushUndo();
    team.bench.push(p.varianteId);
    renderBench(); saveState(); renderLinks();
  }

  function bindDnD(scope){
    $$('.tb-card-item', scope).forEach(card=>{
      card.addEventListener('dragstart', e=>{
        draggingVarId = card.dataset.varid;
        e.dataTransfer.setData('text/plain', draggingVarId);
        e.dataTransfer.effectAllowed = 'move';
      });
      card.addEventListener('dragend', ()=>{ draggingVarId = null; });
    });

    $$('.droptarget', scope).forEach(target=>{
            target.addEventListener('dragover', e=>{
        e.preventDefault();
        target.classList.remove('drop-valid','drop-invalid');
        if(!draggingVarId) return;
        const p = state.byVar.get(draggingVarId);
        if(!p) return;

        const team = getCurrentTeam();
        const posTarget = target.dataset.pos;
        let ok = true;

        if(posTarget === 'BENCH'){
          ok = p.posicion !== 'L'
            && Array.isArray(team.bench)
            && team.bench.length < 6
            && !isDuplicate(draggingVarId);
        }else{
          const logicalIdx = Number(target.dataset.slotIndex);
          const layout = SLOT_LAYOUTS[team.layoutIdx] || [];
          const conf = layout[logicalIdx];
          const needPos = conf ? conf.pos : null;

          if(needPos === 'L' && p.posicion !== 'L'){
            ok = false;
          }else{
            ok = !isDuplicate(draggingVarId);
          }
        }

        target.classList.add(ok ? 'drop-valid' : 'drop-invalid');
      });

      target.addEventListener('dragleave', ()=>{
        target.classList.remove('drop-valid','drop-invalid');
      });

      target.addEventListener('drop', e=>{
        e.preventDefault();
        target.classList.remove('drop-valid','drop-invalid');
        const varId = e.dataTransfer.getData('text/plain');
        
        if(posTarget === 'BENCH'){ handleDropBench(varId); return; }
        const logicalIdx = Number(target.dataset.slotIndex);
        handleDropSlot(varId, logicalIdx);
      });
    });
  }

    function handleDropSlot(varId, logicalIdx){
    const p = state.byVar.get(varId);
    if(!p) return;

    const team = getCurrentTeam();
    const layout = SLOT_LAYOUTS[team.layoutIdx];
    const needPos = layout[logicalIdx].pos;

    // Única restricción de posición: la casilla de Líbero solo acepta Líberos
    if(needPos === 'L' && p.posicion !== 'L'){
      toast('Solo Líberos pueden ocupar esta casilla.');
      return;
    }

    if(isDuplicate(varId)){
      toast('Personaje ya en uso (no se permiten variantes duplicadas en el equipo).');
      return;
    }

    pushUndo();
    const iBench = team.bench.indexOf(varId);
    if(iBench>=0) team.bench.splice(iBench,1);

    const prev = team.slots[logicalIdx];
    if(prev){
      const prevP = state.byVar.get(prev);
      if(prevP.posicion!=='L' && team.bench.length<6) team.bench.push(prev);
    }

    team.slots[logicalIdx] = varId;
    renderAll(); saveState();
  }

    function handleDropBench(varId){
    const p = state.byVar.get(varId); if(!p) return;
    const team = getCurrentTeam();

    if(p.posicion==='L'){ toast('No se permiten Líberos en la banca.'); return; }
    if(team.bench.length>=6){ toast('Banca llena (máximo 6).'); return; }
    if(isDuplicate(varId)){ toast('Personaje ya en uso (no se permiten variantes duplicadas en el equipo).'); return; }

    pushUndo();
    const idx = team.slots.findIndex(v=>v===varId);
    if(idx>=0) team.slots[idx]=null;

    team.bench.push(varId);
    renderAll(); saveState();
  }

    function tryPlaceInSlot(varId, logicalIdx){
    const p = state.byVar.get(varId); if(!p) return;
    const team = getCurrentTeam();
    const layout = SLOT_LAYOUTS[team.layoutIdx];
    const needPos = layout[logicalIdx].pos;

    // Única restricción: esta casilla es de Líbero y el personaje no lo es
    if(needPos === 'L' && p.posicion !== 'L'){
      toast('Solo Líberos pueden ocupar esta casilla.');
      return;
    }

    if(isDuplicate(varId)){
      toast('Personaje ya en uso (no se permiten variantes duplicadas en el equipo).');
      return;
    }

    pushUndo();
    team.slots[logicalIdx] = varId;
    renderAll(); saveState();
  }

    function rotateFormation(){
    const team = getCurrentTeam();

    // ciclo de índices en el campo (sin contar L): 0 → 1 → 2 → 5 → 4 → 3 → 0
    const GRID_CYCLE = [0, 1, 2, 5, 4, 3];
    const N = GRID_CYCLE.length;

    const prevLayout = SLOT_LAYOUTS[team.layoutIdx];
    team.layoutIdx = (team.layoutIdx + 1) % SLOT_LAYOUTS.length;
    const nextLayout = SLOT_LAYOUTS[team.layoutIdx];

    const prevGridToVar = new Map();
    prevLayout.forEach((conf, logicalIdx)=> {
      prevGridToVar.set(conf.idx, team.slots[logicalIdx]);
    });

    const newGridToVar = new Map(prevGridToVar);
    for (let i = 0; i < N; i++) {
      const dst = GRID_CYCLE[i];
      const src = GRID_CYCLE[(i - 1 + N) % N];
      newGridToVar.set(dst, prevGridToVar.get(src) || null);
    }

    const newSlots = Array(7).fill(null);
    nextLayout.forEach((conf, logicalIdx) => {
      newSlots[logicalIdx] = newGridToVar.get(conf.idx) || null;
    });

    pushUndo();
    team.slots = newSlots;
    renderAll();
    saveState();
  }

    function clearAll(){
    const team = getCurrentTeam();
    pushUndo();
    team.slots = Array(7).fill(null);
    team.bench = [];
    renderAll(); saveState();
  }

    function recomputeBonusCounts(){
    const titulares = getTitulares();
    const specCounts = {};
    const posCounts = {};

    titulares.forEach(ch=>{
      if(!ch) return;
      if(Array.isArray(ch.specialtyTags)){
        ch.specialtyTags.forEach(key=>{
          if(!key) return;
          specCounts[key] = (specCounts[key] || 0) + 1;
        });
      }
      const pos = ch.posicion;
      if(pos){
        posCounts[pos] = (posCounts[pos] || 0) + 1;
      }
    });

    state.currentSpecialtyCounts = specCounts;
    state.currentPositionCounts = posCounts;
  }
  function getThresholdPlayers(tier){
  if(!tier || typeof tier !== 'object') return 0;
  if(typeof tier.minPlayers === 'number') return tier.minPlayers;
  const s = tier.minPlayers || tier.min || tier.minCount || 0;
  const n = parseInt(s, 10);
  return isNaN(n) ? 0 : n;
}

function recomputeBonusStatus(){
  const specCounts = state.currentSpecialtyCounts || {};
  const posCounts  = state.currentPositionCounts || {};

  // ---- Especialidades: agrupar filas por tagKey ----
  const specList = Array.isArray(state.specialtyBonuses) ? state.specialtyBonuses : [];
  const specByTag = {};
  specList.forEach(row=>{
    const key = row.tagKey;
    if(!key) return;
    if(!specByTag[key]) specByTag[key] = [];
    specByTag[key].push(row);
  });

  const specStatus = {};
  Object.entries(specCounts).forEach(([tagKey, count])=>{
    const levels = specByTag[tagKey];
    if(!levels || !levels.length) return;

    const sorted = levels.slice().sort(
      (a,b)=> getThresholdPlayers(a) - getThresholdPlayers(b)
    );

    let activeTier = null;
    let nextTier = null;

    sorted.forEach(row=>{
      const thr = getThresholdPlayers(row);
      if(count >= thr){
        activeTier = { ...row, _thresholdPlayers: thr };
      }else if(!nextTier){
        nextTier = { ...row, _thresholdPlayers: thr };
      }
    });

    const missing = nextTier ? Math.max(0, nextTier._thresholdPlayers - count) : 0;

    specStatus[tagKey] = { key: tagKey, count, activeTier, nextTier, missing };
  });

  // ---- Posiciones: agrupar filas por position ----
  const posList = Array.isArray(state.positionBonuses) ? state.positionBonuses : [];
  const posByKey = {};
  posList.forEach(row=>{
    const key = row.position || row.tagKey;
    if(!key) return;
    if(!posByKey[key]) posByKey[key] = [];
    posByKey[key].push(row);
  });

  const posStatus = {};
  Object.entries(posCounts).forEach(([posKey, count])=>{
    const levels = posByKey[posKey];
    if(!levels || !levels.length) return;

    const sorted = levels.slice().sort(
      (a,b)=> getThresholdPlayers(a) - getThresholdPlayers(b)
    );

    let activeTier = null;
    let nextTier = null;

    sorted.forEach(row=>{
      const thr = getThresholdPlayers(row);
      if(count >= thr){
        activeTier = { ...row, _thresholdPlayers: thr };
      }else if(!nextTier){
        nextTier = { ...row, _thresholdPlayers: thr };
      }
    });

    const missing = nextTier ? Math.max(0, nextTier._thresholdPlayers - count) : 0;

    posStatus[posKey] = { key: posKey, count, activeTier, nextTier, missing };
  });

  state.currentSpecialtyStatus = specStatus;
  state.currentPositionStatus  = posStatus;
}
  // ========= Pestañas de equipos =========
    function renderTeamTabs(){
    const host = $('#tb-team-tabs');
    if(!host) return;

    // Aseguramos que haya al menos un equipo
    const current = getCurrentTeam();
    const teams = Array.isArray(state.teams) && state.teams.length
      ? state.teams
      : [current];

    const currentIdx = Math.min(
      Math.max(0, state.currentTeamIndex | 0),
      teams.length - 1
    );

    const tabsHtml = teams.map((team, i)=>{
      const activeClass = (i === currentIdx) ? ' active' : '';
      const label = team.name || `Equipo ${i+1}`;
      return `
        <button type="button"
                class="tb-team-tab${activeClass}"
                data-team-index="${i}">
          <span class="tb-team-name">${label}</span>
          <span class="tb-team-action tb-team-dup"
                data-team-dup="${i}"
                title="Duplicar equipo">⧉</span>
          <span class="tb-team-action tb-team-del"
                data-team-del="${i}"
                title="Eliminar equipo">×</span>
        </button>
      `;
    }).join('');

    const addHtml = `
      <button type="button"
              class="tb-team-tab tb-team-tab-add"
              data-team-add="1">
        +
      </button>
    `;

    host.innerHTML = tabsHtml + addHtml;

    // Click en pestañas → cambiar de equipo
    host.querySelectorAll('[data-team-index]').forEach(btn=>{
      btn.addEventListener('click', ()=>{
        const idx = parseInt(btn.dataset.teamIndex, 10);
        if(isNaN(idx)) return;
        switchTeam(idx);
      });
    });

    // Doble click en nombre → renombrar
    host.querySelectorAll('.tb-team-name').forEach(span=>{
      span.addEventListener('dblclick', e=>{
        e.stopPropagation();
        const btn = span.closest('[data-team-index]');
        if(!btn) return;
        const idx = parseInt(btn.dataset.teamIndex, 10);
        if(isNaN(idx)) return;
        renameTeam(idx);
      });
    });

    // Click en ⧉ → duplicar equipo
    host.querySelectorAll('.tb-team-dup').forEach(span=>{
      span.addEventListener('click', e=>{
        e.stopPropagation();
        const idx = parseInt(span.dataset.teamDup, 10);
        if(isNaN(idx)) return;
        duplicateTeam(idx);
      });
    });

    // Click en × → borrar equipo
    host.querySelectorAll('.tb-team-del').forEach(span=>{
      span.addEventListener('click', e=>{
        e.stopPropagation();
        const idx = parseInt(span.dataset.teamDel, 10);
        if(isNaN(idx)) return;
        deleteTeam(idx);
      });
    });

    // Botón de añadir equipo
    const addBtn = host.querySelector('[data-team-add]');
    if(addBtn){
      addBtn.addEventListener('click', addTeamFromUI);
    }
  }

    function switchTeam(newIndex){
    if(!Array.isArray(state.teams) || !state.teams.length) return;
    if(newIndex < 0 || newIndex >= state.teams.length) return;
    if(newIndex === state.currentTeamIndex) return;

    state.currentTeamIndex = newIndex;
    // Garantizamos que el equipo existe y redibujamos todo
    getCurrentTeam();
    renderAll();
    saveState();
  }

  function addTeamFromUI(){
    state.teams = Array.isArray(state.teams) ? state.teams : [];
    const name = `Equipo ${state.teams.length + 1}`;
    const team = createNewTeam(name);
    state.teams.push(team);
    state.currentTeamIndex = state.teams.length - 1;
    renderAll();
    saveState();
  }

  function renameTeam(index){
    if(!Array.isArray(state.teams) || !state.teams[index]) return;
    const team = state.teams[index];
    const currentName = team.name || `Equipo ${index+1}`;
    const next = prompt('Nuevo nombre para el equipo:', currentName);
    if(!next) return;
    const trimmed = next.trim();
    if(!trimmed) return;
    team.name = trimmed.slice(0, 40); // límite de caracteres
    renderTeamTabs();
    saveState();
  }

  function duplicateTeam(index){
    if(!Array.isArray(state.teams) || !state.teams[index]) return;
    const base = state.teams[index];
    const copy = createNewTeam(
      (base.name ? `${base.name} (copia)` : `Equipo ${state.teams.length+1}`)
    );

    // Copiamos composición (no el historial de deshacer)
    copy.layoutIdx = base.layoutIdx;
    copy.slots = Array.isArray(base.slots) ? [...base.slots] : Array(7).fill(null);
    copy.bench = Array.isArray(base.bench) ? [...base.bench] : [];
    copy.undoStack = [];

    state.teams.push(copy);
    state.currentTeamIndex = state.teams.length - 1;
    renderAll();
    saveState();
  }

  function deleteTeam(index){
    if(!Array.isArray(state.teams) || !state.teams[index]) return;
    if(state.teams.length <= 1){
      toast('Debe existir al menos un equipo.');
      return;
    }
    const team = state.teams[index];
    const name = team.name || `Equipo ${index+1}`;
    const ok = confirm(`¿Eliminar "${name}"? Esta acción no se puede deshacer.`);
    if(!ok) return;

    state.teams.splice(index, 1);

    // Ajustar índice actual
    if(state.currentTeamIndex >= state.teams.length){
      state.currentTeamIndex = state.teams.length - 1;
    }

    renderAll();
    saveState();
  }

  function renderAll(){
    // Aseguramos que haya un equipo y pintamos pestañas
    getCurrentTeam();
    renderTeamTabs();

    recomputeBonusCounts();
    recomputeBonusStatus();
    renderField();
    renderBench();
    renderList();
    renderLinks();
    renderBonuses();
  }

  /* ---------- Vínculos ---------- */
    function getTitulares(){
    const team = getCurrentTeam();
    const slots = Array.isArray(team.slots) ? team.slots : [];
    return slots.map(v=> v ? state.byVar.get(v) : null).filter(Boolean);
  }

  function renderLinks(){
    renderSchoolLink();
    renderSpecificLinks();
  }
  function renderBonuses(){
    const specHost = $('#tb-bonus-specialty');
    const posHost  = $('#tb-bonus-position');
    const titulares = getTitulares();

    // Si no están los contenedores en el HTML, no hacemos nada
    if(!specHost && !posHost) return;

    // -------- Especialidades --------
    if(specHost){
      const status = state.currentSpecialtyStatus || {};
      const keys = Object.keys(status);

      if(!titulares.length){
        specHost.innerHTML = `
          <div class="banner-meta">
            Coloca titulares para ver bonificaciones de especialidad.
          </div>`;
      }else if(!keys.length){
        specHost.innerHTML = `
          <div class="banner-meta">
            No hay bonificaciones de especialidad configuradas.
          </div>`;
      }else{
        const tagsMeta = Array.isArray(state.bonusTags) ? state.bonusTags : [];
        const getName = (key)=>{
          const m = tagsMeta.find(t =>
            t.key === key || t.tagKey === key || t.id === key
          );
          return (m && (m.nameES || m.name || m.label)) || fmtTitle(key);
        };
               const tierLabel = (tier)=>{
          if(!tier) return '';
          const thr = tier._thresholdPlayers || getThresholdPlayers(tier);
          const stat = tier.stat || '';
          const value = tier.value;
          const type = tier.type;
          let valText = '';
          if(value != null && value !== ''){
            valText = (type === 'porcentaje')
              ? `+${value}%`
              : `+${value}`;
          }
          const core = (stat ? `${stat} ${valText}` : valText).trim();
          if(thr){
            return core ? `${core} (con ${thr} jugadores)` : `Con ${thr} jugadores`;
          }
          return core || '';
        };

        const html = keys.sort().map(key=>{
          const st = status[key];
          const name = getName(key);
          const total = st.count || 0;

          const activeText = st.activeTier ? `Activo: ${tierLabel(st.activeTier)}` : '';
          let nextText = '';
          if(st.nextTier){
            nextText = st.activeTier
              ? `Siguiente: ${tierLabel(st.nextTier)}`
              : `Próximo: ${tierLabel(st.nextTier)}`;
          }

          const estado =
            st.activeTier
              ? `Estado: ACTIVO`
              : (st.nextTier
                  ? `Te falta ${st.missing || 0} jugador(es) para el próximo tramo`
                  : `Sin tramo configurado`);

          return `
            <div class="banner-meta">
              <b>${name}</b> — Jugadores: <b>${total}</b><br>
              ${estado}${activeText ? `<br>${activeText}` : ''}${nextText ? `<br>${nextText}` : ''}
            </div>
          `;
        }).join('');

        specHost.innerHTML = html;
      }
    }

    // -------- Posiciones --------
    if(posHost){
      const status = state.currentPositionStatus || {};
      const keys = Object.keys(status);
      const POS_LABELS = {
        WS: 'Wing Spiker (WS)',
        MB: 'Middle Blocker (MB)',
        OP: 'Opuesto (OP)',
        S:  'Setter (S)',
        L:  'Líbero (L)',
      };

      if(!titulares.length){
        posHost.innerHTML = `
          <div class="banner-meta">
            Coloca titulares para ver bonificaciones de posición.
          </div>`;
      }else if(!keys.length){
        posHost.innerHTML = `
          <div class="banner-meta">
            No hay bonificaciones de posición configuradas.
          </div>`;
      }else{
        const tierLabel = (tier)=>{
  if(!tier) return '';
  const thr = tier._thresholdPlayers || getThresholdPlayers(tier);
  const stat = tier.stat || '';
  const value = tier.value;
  const type = tier.type;

  let valText = '';
  if(value !== undefined && value !== null && value !== ''){
    valText = (type === 'porcentaje')
      ? `+${value}%`
      : `+${value}`;
  }

  const core = (stat ? `${stat} ${valText}` : valText).trim();

  if(thr){
    return core
      ? `${core} (con ${thr} jugadores)`
      : `Con ${thr} jugadores`;
  }
  return core || '';
};

        const html = keys.sort().map(posKey=>{
          const st = status[posKey];
          const name = POS_LABELS[posKey] || posKey;
          const total = st.count || 0;

          const activeText = st.activeTier ? `Activo: ${tierLabel(st.activeTier)}` : '';
          let nextText = '';
          if(st.nextTier){
            nextText = st.activeTier
              ? `Siguiente: ${tierLabel(st.nextTier)}`
              : `Próximo: ${tierLabel(st.nextTier)}`;
          }

          const estado =
            st.activeTier
              ? `Estado: ACTIVO`
              : (st.nextTier
                  ? `Te falta ${st.missing || 0} jugador(es) para el próximo tramo`
                  : `Sin tramo configurado`);

          return `
            <div class="banner-meta">
              <b>${name}</b> — Jugadores: <b>${total}</b><br>
              ${estado}${activeText ? `<br>${activeText}` : ''}${nextText ? `<br>${nextText}` : ''}
            </div>
          `;
        }).join('');

        posHost.innerHTML = html;
      }
    }
  }

  function renderSchoolLink(){
  const host = $('#tb-school-links'); if(!host) return;
  const titulares = getTitulares();

  // asegurar estado de acordeón
  if(!state.accordion?.schools) state.accordion.schools = {};

  if(!titulares.length){
    host.innerHTML = `<div class="banner-meta">Coloca titulares para evaluar vínculos de escuela.</div>`;
    return;
  }
  const counts = {};
  titulares.forEach(p => { counts[p.escuelaId] = (counts[p.escuelaId]||0) + 1; });

  const visiblesSch = state.schools.filter(s=> (counts[s.id]||0) > 0);
  const rows = visiblesSch.map(sch=>{
    const need = Number(sch.threshold || SCHOOL_THRESHOLD_DEFAULT);
    const have = counts[sch.id] || 0;
    const active = have >= need;
    const bonos = (sch.bonos||[]).map(b=>{
      const val = b.tipo==='porc' ? `+${b.valor}%` : `+${b.valor}`;
      return `<span class="chip">${fmtTitle(b.stat)} ${val}</span>`;
    }).join(' ');

    const accId = `sch__${sch.id}`;
    const expanded = state.accordion.schools[accId] ?? false;

    return `
      <div class="tb-acc ${expanded?'expanded':''}" data-acc="${accId}">
        <div class="tb-acc-hd">
          <div class="tb-acc-ttl">${sch.nombre}</div>
          <div class="tb-acc-rt">
            <small>${have}/${need}</small>
            <span class="chev">▶</span>
          </div>
        </div>
        <div class="tb-acc-body" style="display:${expanded?'block':'none'}">
          ${bonos ? `<div class="chips" style="margin-bottom:8px">${bonos}</div>`:''}
          ${active
            ? `<div class="banner-meta">Bono <b>activo</b> para ${sch.nombre}.</div>`
            : `<div class="banner-meta">Te faltan <b>${Math.max(0,need-have)}</b> titulares de ${sch.nombre} para activar.</div>`
          }
        </div>
      </div>
    `;
  }).join('');

  host.innerHTML = rows || '<div class="banner-meta">Aún no hay escuelas relevantes en cancha.</div>';

  // Delegación: toggle acordeón + persistencia (solo la conectamos 1 vez)
if (!host._accBound) {
  host.addEventListener('click', (e)=>{
    const hd = e.target.closest('.tb-acc-hd');
    if(!hd) return;
    const acc  = hd.parentElement;
    const id   = acc.getAttribute('data-acc');
    const body = acc.querySelector('.tb-acc-body');

    const isOpen = acc.classList.toggle('expanded');
    if (body) body.style.display = isOpen ? 'block' : 'none';

    state.accordion.schools[id] = isOpen;
    saveAccordion();
  });
  host._accBound = true;
}

}

// --- Helpers para matching de vínculos (base vs variante) ---
function normReqId(id){
  const s = String(id||'').trim().toLowerCase();
  if(!s) return {type:'base', value:''};
  if(s.includes('-')){
    const [b, r] = s.split('-');
    return {type:'var', value:`${b}__${(r||'').toUpperCase()}`};
  }
  if(s.includes('__')){
    const [b, r] = s.split('__');
    return {type:'var', value:`${b}__${(r||'').toUpperCase()}`};
  }
  return {type:'base', value:s};
}
function renderSpecificLinks(){
  const host = $('#tb-links-summary'); if(!host) return;

  // estado acordeón
  if(!state.accordion?.links) state.accordion.links = {};

  const titulares = getTitulares();
  const basesOnField = new Set(titulares.map(p=>p.baseId));
  const varsOnField = new Set(titulares.map(p=> (p.varianteId||'').toLowerCase()));

  // Filtra: mostrar solo vínculos con al menos 1 integrante en cancha
  const visibles = state.links.filter(link => {
    const raw = Array.isArray(link.miembros) ? link.miembros : (Array.isArray(link.conjunto)?link.conjunto:[]);
    const set = raw.map(x=>String(x));
    return raw.some(req => { const n=normReqId(req); return n.type==='var' ? varsOnField.has(n.value) : basesOnField.has(n.value); });
  });

  if(!visibles.length){
    host.innerHTML = `<div class="banner-meta">Ningún vínculo aplicable con la alineación actual.</div>`;
    return;
  }

  const totals = {};
  const blocks = visibles.map(link=>{
    const raw = Array.isArray(link.miembros) ? link.miembros : (Array.isArray(link.conjunto)?link.conjunto:[]);
    const set = raw.map(x=>String(x));
    const have = set.filter(bid => basesOnField.has(bid)).length;
    const need = set.length;
    const complete = have >= need && need>0;

    const maxLvl = Array.isArray(link.niveles) ? link.niveles.length : 0;
    const sel = Math.max(1, Math.min(maxLvl || 1, Number(state.linksLevels[link.id]||1)));

    let bonosHtml = '<div class="banner-meta">Sin niveles definidos.</div>';
    if(maxLvl){
      const current = link.niveles[sel-1]?.bono || {};
      const items = Object.entries(current).map(([k,v])=>{
        const parts = String(k).split('.');
        const who = parts[0] || '';
        const statRaw = parts[1] || '';
        const isPct = /_pct$/.test(statRaw);
        const stat = statRaw.replace(/_(pct|flat)$/,'').replace(/_/g,' ');
        const val = Number(v)||0;
        const globalKey = `${stat}|${isPct?'porc':'flat'}`;
        if(complete){ totals[globalKey] = (totals[globalKey]||0) + val; }
        return `<li><b>${fmtTitle(who)}</b> — ${fmtTitle(stat)}: <b>${isPct?`+${val}%`:`+${val}`}</b></li>`;
      }).join('');
      bonosHtml = `<ul style="margin:6px 0 0 18px">${items}</ul>`;
    }

    const missing = set.filter(req => { const n=normReqId(req); return n.type==='var' ? !varsOnField.has(n.value) : !basesOnField.has(n.value); });
    const missingHtml = missing.length
      ? `<div class="banner-meta">Te falta: ${missing.map(b=>`<b>${fmtTitle(b)}</b>`).join(', ')}</div>`
      : '';

    const levelSelect = maxLvl ? `
      <label class="banner-meta" style="display:flex;align-items:center;gap:6px;margin-top:6px">
        Nivel:
        <select data-link-level="${link.id}">
          ${Array.from({length:maxLvl}, (_,i)=>`<option value="${i+1}" ${sel===(i+1)?'selected':''}>${i+1}</option>`).join('')}
        </select>
        ${!complete ? `<span class="chip">Incompleto ${have}/${need}</span>` : `<span class="chip" style="background:#0f3;color:#061">Activo ${have}/${need}</span>`}
      </label>
    ` : '<div class="banner-meta">Este vínculo no define niveles.</div>';

    const accId = `lnk__${link.id}`;
    const expanded = state.accordion.links[accId] ?? false;

    return `
      <div class="tb-acc ${expanded?'expanded':''}" data-acc="${accId}">
        <div class="tb-acc-hd">
          <div class="tb-acc-ttl">${link.nombre || fmtTitle(link.id)}</div>
          <div class="tb-acc-rt">
            <small>${have}/${need}</small>
            <span class="chev">▶</span>
          </div>
        </div>
        <div class="tb-acc-body" style="display:${expanded?'block':'none'}">
          ${levelSelect}
          ${bonosHtml}
          ${missingHtml}
        </div>
      </div>
    `;
  }).join('');

  const totalsHtml = Object.entries(totals).map(([k,v])=>{
    const [stat,tipo] = k.split('|');
    return `<li>${fmtTitle(stat)}: <b>${tipo==='porc' ? `+${v}%` : `+${v}`}</b></li>`;
  }).join('');

  host.innerHTML = `
    ${blocks}
    <div class="tb-card small" style="margin-top:8px">
      <b>Bonos totales de vínculos (específicos)</b>
      ${totalsHtml ? `<ul style="margin:6px 0 0 18px">${totalsHtml}</ul>` : `<div class="banner-meta">Ninguno activo.</div>`}
    </div>
  `;

  // Delegación: toggle acordeón + persistencia (solo la conectamos 1 vez)
if (!host._accBound) {
  host.addEventListener('click', (e)=>{
    const hd = e.target.closest('.tb-acc-hd');
    if(!hd) return;
    const acc  = hd.parentElement;
    const id   = acc.getAttribute('data-acc');
    const body = acc.querySelector('.tb-acc-body');

    const isOpen = acc.classList.toggle('expanded');
    if (body) body.style.display = isOpen ? 'block' : 'none';

    state.accordion.links[id] = isOpen;
    saveAccordion();
  });
  host._accBound = true;
}

  // change nivel
  $$('select[data-link-level]', host).forEach(sel=>{
    sel.addEventListener('change', ()=>{
      const id = sel.getAttribute('data-link-level');
      const val = Number(sel.value)||1;
      state.linksLevels[id] = val;
      saveLinksLevels();
      renderSpecificLinks();
    });
  });
}
  const TEAM_EXPORT_SCHEMA = 'fhm.teambuilder.1.0.0';

  function buildTeamExportPayload(teamIndex){
    // Aseguramos que exista al menos un equipo
    const current = getCurrentTeam();
    const teams = Array.isArray(state.teams) && state.teams.length
      ? state.teams
      : [current];

    let idx = (typeof teamIndex === 'number') ? teamIndex : (state.currentTeamIndex | 0);
    if(idx < 0 || idx >= teams.length) idx = 0;

    const team = teams[idx];
    const slots = Array.isArray(team.slots) ? team.slots : [];
    const bench = Array.isArray(team.bench) ? team.bench : [];

    // Slots: solo guardamos los ocupados
    const slotEntries = slots.map((varId, slotIndex)=>{
      if(!varId) return null;
      const p = state.byVar.get(varId);
      return {
        slotIndex,
        varId,
        baseId: p ? p.baseId : null,
        posicion: p ? p.posicion : null
      };
    }).filter(Boolean);

    // Banca: mismo concepto, con el índice como "order"
    const benchEntries = bench.map((varId, order)=>{
      if(!varId) return null;
      const p = state.byVar.get(varId);
      return {
        order,
        varId,
        baseId: p ? p.baseId : null,
        posicion: p ? p.posicion : null
      };
    }).filter(Boolean);

    return {
      schemaVersion: TEAM_EXPORT_SCHEMA,
      app: 'FlyHighManager-TeamBuilder',
      exportedAt: new Date().toISOString(),
      teamIndex: idx,
      team: {
        name: team.name || `Equipo ${idx+1}`,
        layoutIdx: (typeof team.layoutIdx === 'number') ? team.layoutIdx : 0,
        slots: slotEntries,
        bench: benchEntries
      }
    };
  }

    function exportImage(){
    try{
      const payload = buildTeamExportPayload();
      const json = JSON.stringify(payload, null, 2);

      // Nombre de archivo amigable a partir del nombre del equipo
      const rawName = (payload.team && payload.team.name) ? payload.team.name : 'equipo';
      const safeName = rawName
        .toLowerCase()
        .replace(/[^a-z0-9]+/gi, '-')
        .replace(/^-+|-+$/g, '') || 'equipo';

      const filename = `fhm-${safeName}.fhteam`;

      const blob = new Blob([json], { type: 'application/json' });
      const url = URL.createObjectURL(blob);

      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      toast('Equipo exportado correctamente.');
    }catch(err){
      console.error('Error al exportar equipo', err);
      toast('No se pudo exportar el equipo.');
    }
  }
  function importTeamFromFile(file){
    if(!file) return;
    const reader = new FileReader();

    reader.onload = e=>{
      try{
        const text = String(e.target.result || '');
        const raw = JSON.parse(text);
        const normalized = normalizeImportedTeam(raw);
        if(!normalized){
          toast('El archivo no contiene un equipo válido para este Team Builder.');
          return;
        }

        const { name, layoutIdx, slots, bench } = normalized;

        state.teams = Array.isArray(state.teams) ? state.teams : [];
        const team = createNewTeam(name);
        team.layoutIdx = layoutIdx;
        team.slots = slots;
        team.bench = bench;
        team.undoStack = [];

        state.teams.push(team);
        state.currentTeamIndex = state.teams.length - 1;

        renderAll();
        saveState();
        toast('Equipo importado correctamente.');
      }catch(err){
        console.error('Error al importar equipo', err);
        toast('No se pudo importar el archivo.');
      }
    };

    reader.readAsText(file);
  }

  function normalizeImportedTeam(raw){
    if(!raw || typeof raw !== 'object') return null;

    const schema = raw.schemaVersion || raw.schema || '';
    if(!schema || schema.indexOf('fhm.teambuilder.') !== 0){
      // No es nuestro formato
      return null;
    }
    if(raw.app && raw.app !== 'FlyHighManager-TeamBuilder'){
      return null;
    }

    const t = raw.team || {};
    const layoutIdx = (typeof t.layoutIdx === 'number') ? t.layoutIdx : 0;

    const slots = Array(7).fill(null);

    function resolveImportedVar(entry){
      if(!entry || typeof entry !== 'object') return null;

      const directId = entry.varId || entry.variantId || entry.id;
      if(directId && state.byVar.has(directId)) return directId;

      const baseId = entry.baseId || entry.characterId;
      const pos = entry.posicion || entry.position;
      if(baseId){
        for(const [varId, p] of state.byVar.entries()){
          if(p.baseId === baseId && (!pos || p.posicion === pos)){
            return varId;
          }
        }
      }
      return null;
    }

    if(Array.isArray(t.slots)){
      t.slots.forEach(entry=>{
        const idx = entry.slotIndex;
        if(typeof idx !== 'number') return;
        if(idx < 0 || idx >= slots.length) return;
        const varId = resolveImportedVar(entry);
        if(varId) slots[idx] = varId;
      });
    }

    const bench = [];
    if(Array.isArray(t.bench)){
      const sorted = [...t.bench].sort((a,b)=>
        (a.order || 0) - (b.order || 0)
      );
      sorted.forEach(entry=>{
        const varId = resolveImportedVar(entry);
        if(!varId) return;
        if(slots.includes(varId)) return;
        if(bench.includes(varId)) return;
        if(bench.length >= 6) return;
        bench.push(varId);
      });
    }

    return {
      name: t.name || 'Equipo importado',
      layoutIdx,
      slots,
      bench
    };
  }

  async function initOnce(){
    const screen = $('#tab-team'); if(!screen) return;

    if(!state._inited){
      ensureTBStyles();
      await loadData();
      await loadBonuses();
      loadState();
      loadLinksLevels();
      loadAccordion();  // <- NUEVO

      const undoBtn = $('#tb-undo'); if(undoBtn) undoBtn.addEventListener('click', undo);
      const clearBtn= $('#tb-clear'); if(clearBtn) clearBtn.addEventListener('click', clearAll);
      const rotBtn  = $('#tb-rotate'); if(rotBtn) rotBtn.addEventListener('click', rotateFormation);
      const expBtn  = $('#tb-export'); if(expBtn) expBtn.addEventListener('click', exportImage);
      const btnImport  = $('#tb-import');
      const inputImport = $('#tb-import-input');

      if(btnImport && inputImport){
        // Al hacer clic en el botón, abrimos el selector de archivo
        btnImport.addEventListener('click', ()=>{
          inputImport.click();
        });

        // Cuando el usuario elige un archivo, lo leemos e importamos
        inputImport.addEventListener('change', ()=>{
          const file = inputImport.files && inputImport.files[0];
          if(file){
            importTeamFromFile(file);
          }
          // limpiar para poder volver a seleccionar el mismo archivo luego
          inputImport.value = '';
        });
      }

      const s = $('#tb-search'); if(s) s.addEventListener('input', renderList);
      const fr= $('#tb-filter-rareza'); if(fr) fr.addEventListener('change', renderList);
      const fe= $('#tb-filter-escuela'); if(fe) fe.addEventListener('change', renderList);


      // Fase 2: delegar clicks en casillas (Elegir/Cambiar/Quitar)
      const fieldWrap = $('#tb-field');
      if(fieldWrap){
        fieldWrap.addEventListener('click', ev=>{
          const chooseBtn = ev.target.closest && ev.target.closest('.tb-slot-choose');
          if(chooseBtn){
            const idx = Number(chooseBtn.dataset.slotIndex||'-1');
            if(idx>=0) openPicker(idx);
            return;
          }
                const clearBtn = ev.target.closest && ev.target.closest('.tb-slot-clear');
      if(clearBtn){
        const idx = Number(clearBtn.dataset.slotIndex||'-1');
        if(idx>=0){
          const team = getCurrentTeam();
          const slots = Array.isArray(team.slots) ? team.slots : [];
          if(slots[idx]){
            pushUndo();
            team.slots[idx] = null;
            renderAll();
            saveState();
          }
        }
      }
        });
      }

      // Fase 2: eventos del selector modal
      const pickerBackdrop = $('#tb-picker-backdrop');
      if(pickerBackdrop){
        const closeBtn = pickerBackdrop.querySelector('.tb-picker-close');
        if(closeBtn) closeBtn.addEventListener('click', closePicker);
        pickerBackdrop.addEventListener('click', ev=>{
          if(ev.target === pickerBackdrop) closePicker();
        });
      }
      const ps = $('#tbp-search');
      const pr = $('#tbp-role');
      const pz = $('#tbp-rareza');
      const pe = $('#tbp-school');
      if(ps) ps.addEventListener('input', renderPickerList);
      if(pr) pr.addEventListener('change', renderPickerList);
      if(pz) pz.addEventListener('change', renderPickerList);
      if(pe) pe.addEventListener('change', renderPickerList);

      document.addEventListener('keydown', ev=>{
        if(ev.key === 'Escape'){
          const backdrop = $('#tb-picker-backdrop');
          if(backdrop && !backdrop.hidden) closePicker();
        }
      });
      state._inited = true;
    }

    renderAll();
  }

  return { initOnce };
})();


/* =====================================================================
   TIER LIST BUILDER (esqueleto – sin drag&drop aún)
   ===================================================================== */
const TIER = (()=>{
    const state = {
    rows: [
      { id:'tier_s', name:'S', color:'#ef4444', items:[] },
      { id:'tier_a', name:'A', color:'#f59e0b', items:[] },
      { id:'tier_b', name:'B', color:'#fbbf24', items:[] },
      { id:'tier_c', name:'C', color:'#fef08a', items:[] },
      { id:'tier_d', name:'D', color:'#a7f3d0', items:[] },
    ],
    inited:false
  };
// --- Persistencia + pool (nuevos) ---
const LS_KEY_TIER = 'tier_state_v1';
// Guardamos solo filas (id, name, color, items)
function tierSave(){
  try{
    const snap = { rows: state.rows.map(r=>({id:r.id, name:r.name, color:r.color, items:[...r.items]})) };
    localStorage.setItem(LS_KEY_TIER, JSON.stringify(snap));
  }catch{}
}
function tierLoad(){
  try{
    const raw = localStorage.getItem(LS_KEY_TIER);
    if(!raw) return;
    const obj = JSON.parse(raw);
    if(Array.isArray(obj.rows)){
      state.rows = obj.rows.map(r=>({
        id: r.id,
        name: r.name ?? 'Nueva',
        color: r.color || '#334155',
        items: Array.isArray(r.items) ? r.items : []
      }));
    }
  }catch{}
}

// Construimos un "pool" con ID único por carta para DnD.
// Usamos el varianteId si existe (del team builder), si no, normalizamos el nombre.
const ORDER_RAR = {SP:6, UR:5, SSR:4, SR:3, R:2, N:1};  // lo reusamos aquí
const MAP_POS   = {"Opposite":"OP","Wing Spiker":"WS","Middle Blocker":"MB","Setter":"S","Libero":"L","OP":"OP","WS":"WS","MB":"MB","S":"S","L":"L"};

const tierPool = {
  items: [],      // [{id, nombre, avatar, rareza, posicion}]
  byId: new Map() // id -> item
};

function tierBuildPoolFromCharacters(){
  if(!Array.isArray(CHARACTERS) || !CHARACTERS.length) return;
  const seen = new Set();
  tierPool.items = (CHARACTERS||[]).map(c=>{
    const base = (c.varianteId || c.id || (c.name||c.nombre||'').toLowerCase().replace(/[^a-z0-9]+/g,'_'));
    let id = base;
    // Evitar colisiones raras
    if(seen.has(id)){ id = base + '_' + Math.random().toString(36).slice(2,6); }
    seen.add(id);
    return {
      id,
      nombre: c.nombre || c.name || c.nombreES || id,
      avatar: c.avatar || c.avatarPath || 'assets/placeholder.png',
      rareza: (c.rareza || c.rarity || '').toUpperCase(),
      posicion: MAP_POS[c.posicion] || MAP_POS[c.role] || 'WS'
    };
  });
  tierPool.byId = new Map(tierPool.items.map(x=>[x.id,x]));
}

function tierCardHTML(item){
  return `<div class="tl-card" draggable="true" data-id="${item.id}">
    <img loading="lazy" src="${item.avatar}" alt="${item.nombre}"
         onerror="this.src='assets/placeholder.png'">
  </div>`;
}

  function ensureAccords(root){
    root.querySelectorAll('.tl-acc').forEach(acc=>{
      const hd = acc.querySelector('.tl-acc-hd');
      if(!hd || acc._bound) return;
      hd.addEventListener('click', ()=>acc.classList.toggle('expanded'));
      acc._bound = true;
    });
  }

function populatePool(){
  const pool = document.getElementById('tl-pool'); if(!pool) return;

  // Construimos pool una vez (CHARACTERS ya viene de la app)
  if(!tierPool.items.length) tierBuildPoolFromCharacters();

  // Los usados son los que están en filas
  const used = new Set(state.rows.flatMap(r=>r.items));

  pool.querySelectorAll('.tl-grid').forEach(grid=>{
    const pos = grid.getAttribute('data-pos');
    const rar = grid.getAttribute('data-rarity');

    const group = tierPool.items
      .filter(p => p.posicion===pos && p.rareza===rar && !used.has(p.id))
      .sort((a,b)=> (ORDER_RAR[b.rareza]-ORDER_RAR[a.rareza]) || (a.nombre||'').localeCompare(b.nombre||''));

    grid.innerHTML = group.map(tierCardHTML).join('');
  });

  ensureAccords(pool);
  bindDnDPool(pool);
}
function bindDnDPool(root){
  root.querySelectorAll('.tl-card').forEach(card=>{
    if(card._bound) return;
    card._bound = true;
    card.addEventListener('dragstart', e=>{
      e.dataTransfer.setData('text/plain', card.getAttribute('data-id'));
      e.dataTransfer.effectAllowed = 'move';
    });
  });

  // permitir soltar de vuelta al pool (devuelve la carta desde una fila)
  if(!root._dropBound){
    root.addEventListener('dragover', e=>{ e.preventDefault(); });
    root.addEventListener('drop', e=>{
      e.preventDefault();
      const id = e.dataTransfer.getData('text/plain');
      removeFromRows(id); // (la definimos más abajo)
    });
    root._dropBound = true;
  }
}

function renderRows(){
  const host = document.getElementById('tl-rows'); if(!host) return;

  host.innerHTML = state.rows.map(r=>`
    <section class="tl-row" data-row="${r.id}">
      <header class="tl-row-head" style="--row-color:${r.color}">
        <span class="tl-row-color" style="background:${r.color}" title="Color de la fila"></span>
        <input class="tl-row-name" value="${r.name}" aria-label="Nombre de fila">
        <div class="tl-row-actions">
          <button class="btn xs" data-act="up">↑</button>
          <button class="btn xs" data-act="down">↓</button>
          <button class="btn xs" data-act="add_above">+↑</button>
          <button class="btn xs" data-act="add_below">+↓</button>
          <button class="btn xs danger" data-act="remove">Eliminar</button>
        </div>
      </header>
      <div class="tl-row-drop" aria-label="Zona para arrastrar cartas">
        ${(r.items||[]).map(id=>{
          const item = tierPool.byId.get(id);
          return item ? tierCardHTML(item) : '';
        }).join('')}
      </div>
    </section>
  `).join('');

  // listeners (nombre/color/acciones)
  host.querySelectorAll('.tl-row').forEach(sec=>{
    const nameInput = sec.querySelector('.tl-row-name');
    const colorEl   = sec.querySelector('.tl-row-color');
    const id        = sec.getAttribute('data-row');

    nameInput.addEventListener('input', ()=>{
      const row = state.rows.find(r=>r.id===id); if(row){ row.name = nameInput.value; tierSave(); }
    });
    colorEl.addEventListener('click', ()=>{
      const row = state.rows.find(r=>r.id===id); if(!row) return;
      const next = prompt('Color hex (ej: #ef4444):', row.color) || row.color;
      row.color = next;
      colorEl.style.background = next;
      tierSave();
    });

    sec.querySelectorAll('[data-act]').forEach(btn=>{
      btn.addEventListener('click', ()=>{
        const act = btn.getAttribute('data-act');
        const idx = state.rows.findIndex(r=>r.id===id);
        if(idx<0) return;

        if(act==='up' && idx>0){ [state.rows[idx-1], state.rows[idx]] = [state.rows[idx], state.rows[idx-1]]; renderRows(); tierSave(); }
        if(act==='down' && idx<state.rows.length-1){ [state.rows[idx+1], state.rows[idx]] = [state.rows[idx], state.rows[idx+1]]; renderRows(); tierSave(); }
        if(act==='add_above'){ const nid='row_'+Math.random().toString(36).slice(2,7); state.rows.splice(idx,0,{id:nid,name:'Nueva',color:'#334155',items:[]}); renderRows(); tierSave(); }
        if(act==='add_below'){ const nid='row_'+Math.random().toString(36).slice(2,7); state.rows.splice(idx+1,0,{id:nid,name:'Nueva',color:'#334155',items:[]}); renderRows(); tierSave(); }
        if(act==='remove'){ if(confirm('¿Eliminar fila?')){ state.rows.splice(idx,1); renderRows(); tierSave(); } }
      });
    });
  });

  bindDnDRows(host);
}
function bindDnDRows(host){
  // tarjetas ya en filas: permitir arrastrar
  host.querySelectorAll('.tl-card').forEach(card=>{
    if(card._bound) return;
    card._bound = true;
    card.addEventListener('dragstart', e=>{
      e.dataTransfer.setData('text/plain', card.getAttribute('data-id'));
      e.dataTransfer.effectAllowed = 'move';
    });
  });

  // calcular el índice de inserción según la posición del cursor
  function computeInsertIndex(container, clientX, clientY){
    const cards = Array.from(container.querySelectorAll('.tl-card'));
    if(cards.length === 0) return 0;
    let bestIdx = cards.length;
    let bestDist = Infinity;
    cards.forEach((c, idx)=>{
      const r = c.getBoundingClientRect();
      const cx = r.left + r.width/2;
      const cy = r.top + r.height/2;
      const dx = clientX - cx;
      const dy = clientY - cy;
      const d2 = dx*dx + dy*dy;
      if(d2 < bestDist){
        bestDist = d2;
        bestIdx = (clientX < cx || clientY < cy) ? idx : idx+1;
      }
    });
    return Math.max(0, Math.min(bestIdx, cards.length));
  }

  host.querySelectorAll('.tl-row-drop').forEach(drop=>{
    drop.addEventListener('dragover', e=>{
      e.preventDefault(); e.dataTransfer.dropEffect='move';
      const idx = computeInsertIndex(drop, e.clientX, e.clientY);
      drop.dataset.insertIndex = String(idx);
    });
    drop.addEventListener('drop', e=>{
      e.preventDefault();
      const id = e.dataTransfer.getData('text/plain');
      const rowEl = drop.closest('.tl-row');
      if(!rowEl) return;
      const rowId = rowEl.getAttribute('data-row');
      const idx = Number(drop.dataset.insertIndex || '9999');
      placeInRowAt(id, rowId, isFinite(idx) ? idx : undefined);
      delete drop.dataset.insertIndex;
    });
  });

  // devolver al pool arrastrando sobre el panel izquierdo
  const pool = document.getElementById('tl-pool');
  if(pool && !pool._dropBound){
    pool.addEventListener('dragover', e=>{ e.preventDefault(); });
    pool.addEventListener('drop', e=>{
      e.preventDefault();
      const id = e.dataTransfer.getData('text/plain');
      removeFromRows(id);
    });
    pool._dropBound = true;
  }
}

function placeInRow(id, rowId){
  placeInRowAt(id, rowId);
}
function placeInRowAt(id, rowId, insertIndex){
  // 1) Quitar de cualquier otra fila
  state.rows.forEach(r=>{
    const i = r.items.indexOf(id);
    if(i>=0) r.items.splice(i,1);
  });
  // 2) Insertar en la fila destino
  const row = state.rows.find(r=>r.id===rowId);
  if(!row) return;
  if(!row.items.includes(id)){
    if(typeof insertIndex==='number'){
      row.items.splice(Math.min(Math.max(0, insertIndex), row.items.length), 0, id);
    }else{
      row.items.push(id);
    }
  }
  renderRows();
  populatePool(); // para ocultar del pool las cartas ya usadas
  tierSave();
}

function removeFromRows(id){
  let changed = false;
  state.rows.forEach(r=>{
    const i = r.items.indexOf(id);
    if(i>=0){ r.items.splice(i,1); changed = true; }
  });
  if(changed){
    renderRows();
    populatePool();
    tierSave();
  }
}

  function bindTopbar(){
    document.getElementById('tl-reset')?.addEventListener('click', ()=>{
  if(!confirm('¿Resetear la tier list?')) return;
  state.rows.forEach(r=> r.items = []);
  renderRows();
  populatePool();
  tierSave();
});

    document.getElementById('tl-export-img')?.addEventListener('click', ()=> alert('Exportar imagen llegará en el siguiente paso.'));
    document.getElementById('tl-export-json')?.addEventListener('click', ()=> alert('Exportar JSON llegará en el siguiente paso.'));
    document.getElementById('tl-import-json')?.addEventListener('click', ()=> alert('Importar JSON llegará en el siguiente paso.'));
    document.getElementById('tl-add-row')?.addEventListener('click', ()=>{
      const nid='row_'+Math.random().toString(36).slice(2,7);
      state.rows.push({id:nid,name:'Nueva',color:'#334155',items:[]});
      renderRows();
    });
  }

 async function initOnce(){
  if(state.inited){ populatePool(); renderRows(); return; }
  state.inited = true;
  tierLoad();                // ← cargar lo guardado
  bindTopbar();
  populatePool();
  renderRows();
}

  return { initOnce };
})();


/* ===========================
   Guides & Creators (removed)
   =========================== */
let GUIDES = [];
let CREATORS = new Map();
async function loadCreatorsAndGuidesOnce(){};
function renderHomeFeaturedVideos(){}
function renderGuidesList(){};

/* ===========================
   Init All
   =========================== */

(async function init(){
initTabs();
  renderHomeBanners();
  await loadPotentialsOnce();
  await initVideos();
  if (typeof ANN !== 'undefined' && ANN.initOnce) { try { await ANN.initOnce(); } catch(e){} }
  await loadCharacters();
if (typeof compareBootOnce === 'function') compareBootOnce();
await loadMemoriesOnce();
buildMemoriesIndex();
  await loadTier();
  await loadCalendar();
  await initCalc();

    // Guides & Creators
  const activeTab = document.querySelector('.tab.active');
  if(activeTab && activeTab.id === 'tab-team' && typeof TB !== 'undefined' && TB.initOnce){
    TB.initOnce();
  }
  if(activeTab && activeTab.id === 'tab-tier' && typeof TIER !== 'undefined' && TIER.initOnce){
    TIER.initOnce();
  }

  document.addEventListener('keydown', (e)=>{
    if((e.key==='t' || e.key==='T') && e.ctrlKey){
      const btn = $('.tab-btn[data-tab="team"]');
      if(btn) btn.click();
    }
  });
})();

// === Calendario de banners (carrusel de imágenes) ===
const CAL = (()=>{
  let list = [];
  let idx = 0;
  let inited = false;

  const els = {
    box:   ()=>$('#cal-carousel'),
    img:   ()=>$('#cal-image'),
    title: ()=>$('#cal-title'),
    prev:  ()=>$('.cal-prev'),
    next:  ()=>$('.cal-next'),
    thumbs:()=>$('#cal-thumbs')
  };

  async function loadList(){
    try{
      const res = await fetch('data/calendars.json');
      const json = await res.json();
      list = Array.isArray(json) ? json : [];
    }catch(e){
      console.warn('[calendar] No se pudo cargar data/calendars.json', e);
      list = [];
    }
  }

  function render(){
    if(!list.length) return;
    const item = list[idx];
    const img = els.img();
    const cap = els.title();
    if(!img || !cap) return;

    img.src = item.src;
    img.alt = item.alt || item.title || '';
    cap.textContent = item.title || item.id;

    const next = list[(idx+1)%list.length];
    if(next){ const pre = new Image(); pre.src = next.src; }

    const t = els.thumbs();
    if(t && !t._made){
      t.innerHTML = list.map((m,i)=>(`<button data-i="${i}" ${i===idx?'class="active"':''}>${m.id}</button>`)).join('');
      t.addEventListener('click', e=>{
        const b = e.target.closest('button[data-i]');
        if(!b) return;
        idx = Number(b.dataset.i)||0;
        updateThumbs();
        render();
      });
      t._made = true;
    }
    updateThumbs();
  }

  function updateThumbs(){
    const t = els.thumbs();
    if(!t) return;
    $$('.active', t).forEach(b=>b.classList.remove('active'));
    const b = t.querySelector(`button[data-i="${idx}"]`);
    if(b) b.classList.add('active');
  }

  function nav(delta){
    if(!list.length) return;
    idx = (idx + delta + list.length) % list.length;
    render();
  }

  function bind(){
    els.prev()?.addEventListener('click', ()=>nav(-1));
    els.next()?.addEventListener('click', ()=>nav(1));
    document.addEventListener('keydown', (e)=>{
      if(!els.box()) return;
      if(e.key === 'ArrowLeft') nav(-1);
      if(e.key === 'ArrowRight') nav(1);
    });
  }

  return {
    async initOnce(){
      if(inited) return;
      inited = true;
      await loadList();
      if(!list.length) return;
      const url = new URL(location.href);
      const wanted = url.searchParams.get('month');
      if(wanted){
        const i = list.findIndex(m=>m.id === wanted);
        if(i>=0) idx = i;
      }
      bind();
      render();
    }
  };
})();


/* ===== FHM PATCH: disable legacy specific links (handled by sinergias.js) ===== */
try {
  if (typeof renderSpecificLinks === 'function') {
    renderSpecificLinks = function(){ /* legacy disabled */ };
  } else {
    window.renderSpecificLinks = function(){ /* legacy disabled */ };
  }
} catch(e) {
  window.renderSpecificLinks = function(){ /* legacy disabled */ };
}
/* ===== END PATCH ===== */

/* ===== Nickname (localStorage) ===== */
const NICK = (() => {
  const KEY = 'fhm.nick';

  function get(){ try{ return localStorage.getItem(KEY) || ''; }catch{ return ''; } }
  function set(v){
    const s = String(v||'').trim().slice(0,20);
    if(!s) return;
    try{ localStorage.setItem(KEY, s); }catch{}
    paint();
    document.dispatchEvent(new CustomEvent('fhm:nick:changed', { detail: { nickname: s } }));
  }
  function ensure(){
    let n = get();
    if(n) return n;
    n = (typeof prompt === 'function' ? (prompt('¿Cómo te llamas en FHM? (nickname)')||'').trim() : '');
    if(n){ set(n); }
    return get();
  }
  function greet(sectionName=''){
    const n = get() || ensure();
    return n ? `Hola ${n}, bienvenido a la sección ${sectionName}.` : '';
  }
  // Pinta sólo los saludos contextuales. El estado de la cuenta
  // (span[data-nick-target] en la cabecera) ahora lo controla fhm-auth.js
  // para que al cerrar sesión vuelva a mostrarse "Invitado".
  function paint(){
    document.querySelectorAll('[data-nick-greet]').forEach(el=>{
      const sec = el.getAttribute('data-section') || '';
      el.textContent = greet(sec);
    });
  }

  document.addEventListener('click', (e)=>{
    const btn = e.target.closest('[data-action="change-nick"]');
    if(!btn) return;
    const current = get();
    const next = (typeof prompt === 'function' ? (prompt('Nuevo nickname:', current)||'').trim() : '');
    if(next && next !== current) set(next);
  });

  return { get, set, ensure, greet, paint };
})();

document.addEventListener('DOMContentLoaded', ()=> { try{ NICK.paint(); }catch{} });

