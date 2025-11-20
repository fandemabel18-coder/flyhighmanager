/* ========================================================
   FHM Characters module (grid, modal, comparator)
   Extraído desde app.js para separar la sección Personajes.
   NOTA: Asegúrate de cargar este archivo ANTES de app.js.
   ======================================================== */

/* ===========================
   Characters (grid simple + modal)
   =========================== */
let CHARACTERS = [];

function ensureModalStyles(){
  if($('#char-modal-styles')) return;
  const style = document.createElement('style');
  style.id = 'char-modal-styles';
  style.textContent = `
  #char-modal-backdrop{position:fixed;inset:0;background:#0008;display:flex;align-items:center;justify-content:center;z-index:9999;padding:16px;overscroll-behavior:contain}
  #char-modal{width:min(940px,96vw);background:#0b1220;border:1px solid #1e293b;border-radius:14px;box-shadow:0 20px 60px #000b;color:#e5e7eb;max-height:92vh;display:flex;flex-direction:column}
  #char-modal header{display:flex;gap:12px;padding:16px 16px 0;align-items:center}
  #char-modal .meta{color:#9ca3af}
  #char-modal .tabs{display:flex;gap:8px;flex-wrap:wrap;padding:12px 16px}
  #char-modal .tabs button{background:#0f172a;border:1px solid #1f2a40;padding:6px 10px;border-radius:8px;color:#cbd5e1;cursor:pointer}
  #char-modal .tabs button.active{background:#1f2937;border-color:#334155;color:#fff}
  #char-modal .content{padding:12px 16px 16px;flex:1 1 auto;min-height:0;overflow-y:auto;-webkit-overflow-scrolling:touch;overscroll-behavior:contain}
  #char-modal .panel{background:#0f172a;border:1px solid #1f2a40;border-radius:10px;padding:12px;min-height:180px}
  #char-modal .close{margin:12px 16px 16px auto;display:block;background:#1f2937;border:1px solid #334155;color:#fff;border-radius:10px;padding:8px 14px;cursor:pointer}
  .char-badge{padding:2px 8px;border-radius:8px;font-size:12px;border:1px solid #475569}
  .char-badge.ur{background:#3b0764;color:#f0abfc;border-color:#9333ea}
  .char-badge.ssr{background:#0f766e;color:#99f6e4;border-color:#14b8a6}
  .char-badge.sr{background:#1e3a8a;color:#93c5fd;border-color:#3b82f6}
  `;
  document.head.appendChild(style);
}

function openCharacterModal(c){
  ensureModalStyles();
  const prev = $('#char-modal-backdrop');
  if(prev) prev.remove();

  const backdrop = document.createElement('div');
  backdrop.id = 'char-modal-backdrop';

  const modal = document.createElement('div');
  modal.id = 'char-modal';

  const rarityCls = String(c.rarity||'').toLowerCase();
  const TABS = [
    { k:'summary',   label:'Resumen' },
    { k:'skills',    label:'Habilidades' },
    { k:'links',     label:'Vínculos' },
    { k:'builds',    label:'Builds' },
    { k:'potential', label:'Potencial' },
    { k:'memories',  label:'Recuerdos' },
    { k:'teams',     label:'Equipos' },
    { k:'notes',     label:'Notas' }
  ];

  modal.innerHTML = `
    <header>
      <img src="${c.avatar || 'assets/placeholder.png'}" alt="" width="56" height="56"
           style="border-radius:12px;border:1px solid #334155;object-fit:cover;">
      <div style="flex:1 1 auto">
        <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap">
          <h2 style="margin:0">${c.name||'Sin nombre'}</h2>
          ${c.rarity ? `<span class="char-badge ${rarityCls}">${c.rarity}</span>`:''}
        </div>
        <div class="meta">
          ${(c.tags||[]).map(t=>`<span class="chip">#${t}</span>`).join(' ')}
        </div>
      </div>
    </header>

    <nav class="tabs" aria-label="Pestañas de personaje">
      ${TABS.map((t,i)=> `<button class="${i===0?'active':''}" data-key="${t.k}">${t.label}</button>`).join('')}
    </nav>

    <section class="content">
      <div class="panel" id="char-panel"></div>
    </section>

    <button class="close" type="button" aria-label="Cerrar">Cerrar</button>
  `;

  backdrop.appendChild(modal);
  document.body.appendChild(backdrop);
  document.body.style.overflow = 'hidden';

  const close = ()=>{ backdrop.remove(); document.body.style.overflow=''; };
  backdrop.addEventListener('click', (e)=>{ if(e.target===backdrop) close(); });
  modal.querySelector('.close').addEventListener('click', close);
  document.addEventListener('keydown', function onEsc(ev){
    if(ev.key==='Escape'){ document.removeEventListener('keydown', onEsc); close(); }
  });

  const panel = $('#char-panel', modal);

  async function renderTab(key){
    const fmt = (v)=> v ?? '';
    const p = (html)=> panel.innerHTML = html;

    if (key === 'summary' || key === 'resumen') {
  const s = c.statsMax || {};
  const rows = [
    ['atqRapido',   'Ataque Rápido'],
    ['atqPoderoso', 'Ataque Poderoso'],
    ['colocacion',  'Colocación'],
    ['saque',       'Saque'],
    ['recepcion',   'Recepción'],
    ['bloqueo',     'Bloqueo'],
    ['recuperacion','Recuperación'],
  ];

  // Tabla (máx)
  const statRows = rows.map(([k,label])=>{
    const vRaw = s[k];
    const v = (typeof vRaw === 'number') ? vRaw : (vRaw ?? '—');
    return `<tr><td>${label}</td><td class="num">${v}</td></tr>`;
  }).join('');

  // 1) calcular el máximo del propio personaje para escalar barras
  const vals = rows.map(([k]) => (typeof s[k] === 'number' ? s[k] : 0));
  const maxV = Math.max(...vals, 1);

  // Barras
  const barsHtml = rows.map(([k,label])=>{
    const val = (typeof s[k] === 'number') ? s[k] : 0;
    const pct = Math.max(0, Math.min(100, Math.round((val / maxV) * 100)));
    const valTxt = (typeof s[k] === 'number') ? s[k] : '—';
    return `
      <div class="char-stat-row">
        <div class="label">${label}</div>
        <div class="val">${valTxt}</div>
        <div class="bar"><i style="width:${pct}%"></i></div>
      </div>
    `;
  }).join('');

  // Meta + tabla + barras (todo en un solo innerHTML)
  p(`
    <div style="display:grid;grid-template-columns:130px 1fr;gap:8px 16px;margin-bottom:12px">
      <div class="meta">Escuela</div><div>${(c.school ?? '') || '—'}</div>
      <div class="meta">Rol</div><div>${(c.role ?? '') || '—'}</div>
      <div class="meta">Rareza</div><div>${(c.rarity ?? '') || '—'}</div>
      <div class="meta">Tags</div><div>${(c.tags||[]).map(t=>`<span class="chip">#${t}</span>`).join(' ')||'—'}</div>
      <div class="meta">Actualizado</div><div>${(c.updated ?? '') || '—'}</div>
    </div>

    <table class="char-stats-table">
      <thead><tr><th>Atributo</th><th>Valor (máx)</th></tr></thead>
      <tbody>${statRows}</tbody>
    </table>

    <div class="char-stats-bars" style="margin-top:10px">
      ${barsHtml}
    </div>
  `);
  return;
}

    if(key==='skills'){
      const skills = c.skills || [];
      const html = skills.map(s=>{
        if(typeof s === 'string') return `<li>${s}</li>`;
        const icon = s.icon || 'assets/placeholder.png';
        const name = s.name || 'Habilidad';
        const eff  = s.effect || '';
        return `
          <li style="display:flex;gap:10px;align-items:flex-start;margin:8px 0">
            <img src="${icon}" alt="${name}" width="36" height="36"
                 onerror="this.onerror=null;this.src='assets/placeholder.png';"
                 style="border-radius:8px;border:1px solid #1f2a40;object-fit:cover">
            <div>
              <div style="font-weight:600">${name}</div>
              ${eff ? `<div class="banner-meta">${eff}</div>`:''}
            </div>
          </li>`;
      }).join('');
      p(skills.length ? `<ul style="margin:0;padding-left:0;list-style:none">${html}</ul>` : `<p class="meta">Sin datos de habilidades.</p>`);
      return;
    }

    if(key==='links'){
      const links = c.links || [];
      p(links.length ? `<ul style="margin:0;padding-left:18px">${links.map(s=>`<li>${s}</li>`).join('')}</ul>`
                     : `<p class="meta">Sin datos de vínculos.</p>`);
      return;
    }

    if(key==='builds'){
      const builds = c.builds || [];
      p(builds.length ? `<ul style="margin:0;padding-left:18px">${builds.map(s=>`<li>${s}</li>`).join('')}</ul>`
                      : `<p class="meta">Sin recomendaciones de build.</p>`);
      return;
    }

    
if(key==='potential'){
  // Ensure potentials loaded once before rendering
  if (typeof loadPotentialsOnce === 'function') { try { await loadPotentialsOnce(); } catch(e){} }

  const list = (typeof getCharacterPotentials === 'function')
    ? getCharacterPotentials(c)
    : (Array.isArray(c.potencial) ? c.potencial : []);

  if(Array.isArray(list) && list.length){
    p(`
      <div style="display:flex;flex-direction:column;gap:10px">
        ${list.map(item=>`
          <div style="display:grid;grid-template-columns:42px 1fr;gap:10px;background:#0f172a;border:1px solid #1f2a40;border-radius:10px;padding:10px">
            <img src="${item.icon || item.image || item.img || 'assets/placeholder.png'}" alt="${item.name||'Set'}" width="42" height="42"
                 onerror="this.onerror=null;this.src='assets/placeholder.png';"
                 style="border-radius:8px;border:1px solid #1f2a40;object-fit:cover">
            <div>
              <div style="font-weight:700;margin-bottom:4px">${item.name || 'Set'}</div>
              <div class="banner-meta"><b>2 piezas:</b> ${item.set2 || '—'}</div>
              <div class="banner-meta"><b>4 piezas:</b> ${item.set4 || '—'}</div>
              ${item.notas ? `<div class="banner-meta" style="margin-top:6px">${item.notas}</div>` : ''}
            </div>
          </div>
        `).join('')}
        <div class="banner-meta" style="margin-top:4px">Puedes combinar 2+2+2, 4+2 o 6 piezas según convenga al equipo.</div>
      </div>
    `);
  } else {
    p(`<p class="meta">Sin datos de potencial.</p>`);
  }
  return;
}


   if(key==='memories'){
  // unir recuerdos embebidos + globales por índice
  const fromChar = (c.recuerdos || c.memories || []);
  const fromGlobal = MEMORIES_BY_CHAR.get(String(c.id)) || [];

  // Normaliza ambos a objetos (si vienen strings)
  const normalizeMem = (r)=> {
    if(typeof r === 'string'){
      return { name: r, image: '', rarity: '', effect: '' };
    }
    return r || {};
  };

  const recs = [...fromChar.map(normalizeMem), ...fromGlobal.map(normalizeMem)];

  if(!recs.length){ p('<p class="meta">Sin recuerdos sugeridos.</p>'); return; }

  const html = recs.map(r=>{
    const img = r.image || r.icon || ''; // si tu JSON ya trae ruta completa, úsala
    const name = r.name || 'Recuerdo';
    const rarity = r.rarity ? ` <span class="chip">${r.rarity}</span>` : '';
    const effect = r.effect || '';
    // fallback visual si no hay imagen
    const src = img && typeof img === 'string' ? img : 'assets/memories/placeholder.png';
    return `
      <li style="display:flex;gap:10px;align-items:flex-start;margin:8px 0">
        <img src="${src}" alt="${name}" width="56" height="56"
             onerror="this.onerror=null;this.src='assets/memories/placeholder.png';"
             style="border-radius:10px;border:1px solid #1f2a40;object-fit:cover">
        <div>
          <div style="font-weight:600">${name}${rarity}</div>
          ${effect ? `<div class="banner-meta">${effect}</div>`:''}
          ${r.notes ? `<div class="banner-meta"><em>${r.notes}</em></div>`:''}
        </div>
      </li>`;
  }).join('');

  p(`<ul style="margin:0;padding-left:0;list-style:none">${html}</ul>`);
  return;
}

    if(key==='teams'){
      const teams = c.teams || [];
      p(teams.length ? `<ul style="margin:0;padding-left:18px">${teams.map(s=>`<li>${s}</li>`).join('')}</ul>`
                     : `<p class="meta">Sin propuestas de equipos.</p>`);
      return;
    }

    if(key==='notes'){
      const txt = c.notes || '';
      p(txt ? `<p>${txt}</p>` : `<p class="meta">Sin notas adicionales.</p>`);
      return;
    }

    p('<p class="meta">Pestaña no disponible.</p>');
  }

  $$('.tabs button', modal).forEach(btn=>{
    btn.addEventListener('click', ()=>{
      $$('.tabs button', modal).forEach(b=>b.classList.remove('active'));
      btn.classList.add('active');
      renderTab(btn.dataset.key);
    });
  });

  renderTab('summary');
}

async function loadCharacters(){
  try{ CHARACTERS = await loadJSON('data/characters.json'); }
  catch(e){ console.warn('characters.json', e); CHARACTERS=[]; }

  const container = $('#characters-list');
  if(!container) return;

  container.classList.add('char-grid');

  const q = normalizeStr($('#search')?.value || '');
  const rarity = $('#filter-rarity')?.value || '';
  const role   = $('#filter-role')?.value || '';
  const school = $('#filter-school')?.value || '';

  const list = CHARACTERS
    .filter(c => !q || normalizeStr(c.name).includes(q))
    .filter(c => !rarity || c.rarity === rarity)
    .filter(c => !role   || c.role   === role)
    .filter(c => !school || c.school === school);

  container.innerHTML = list.map(c=>{
    const rarityCls = String(c.rarity||'').toLowerCase();
    return `
      <article class="char-tile" role="button" tabindex="0" aria-label="${c.name}">
        <div class="tile-thumb">
          <img src="${c.avatar || 'assets/placeholder.png'}"
               alt="${c.name}" onerror="this.onerror=null;this.src='assets/placeholder.png';">
          <span class="char-badge ${rarityCls}">${c.rarity||''}</span>
        </div>
        <div class="tile-body">
          <h4 class="tile-name">${c.name}</h4>
          <div class="tile-meta">
            <span>${c.school||''}</span> · <span>${c.role||''}</span>
          </div>
        </div>
      </article>
    `;
return `
  <article class="char-tile character-card" data-id="${c.id || ''}" role="button" tabindex="0" aria-label="${c.name}">
    <div class="tile-thumb">
      <img src="${c.avatar || 'assets/placeholder.png'}"
           alt="${c.name}" onerror="this.onerror=null;this.src='assets/placeholder.png';">
      <span class="char-badge ${rarityCls}">${c.rarity||''}</span>
    </div>
    <div class="tile-body">
      <h4 class="tile-name">${c.name}</h4>
      <div class="tile-meta">
        <span>${c.school||''}</span> · <span>${c.role||''}</span>
      </div>
    </div>
  </article>
`;
  }).join('');

  $$('.char-tile', container).forEach((el, i)=>{
  const c = list[i];
  el.addEventListener('click', (ev)=> openCharacterActionPrompt(c, ev));
  el.addEventListener('keydown', (ev)=>{
    if(ev.key==='Enter' || ev.key===' '){ openCharacterActionPrompt(c, ev); }
  });
});
}

// ===== Recuerdos: carga global + índice por personaje =====
let MEMORIES = [];
let MEMORIES_BY_CHAR = new Map(); // charId(string) -> array de recuerdos

function _slug(s=''){
  try {
    return String(s).toLowerCase()
      .normalize('NFD').replace(/[\u0300-\u036f]/g,'') // sin acentos
      .replace(/[^a-z0-9]+/g,' ')                      // no alfanum
      .trim().replace(/\s+/g,' ');
  } catch { return String(s).toLowerCase(); }
}

let _memoriesLoaded = false;
async function loadMemoriesOnce(){
  if(_memoriesLoaded) return;
  try{
    const res = await fetch('data/memories.json', { cache: 'no-store' });
    if(!res.ok) throw new Error('fetch memories failed');
    MEMORIES = await res.json(); // se espera un array
  }catch(e){
    console.warn('[memories] No pude leer data/memories.json', e);
    MEMORIES = [];
  }
  _memoriesLoaded = true;
}

// Construye índice charId -> recuerdos
// Reglas:
// 1) Si el recuerdo trae m.charId => asignar directo.
// 2) Si trae m.bind (array de ids/variantes) => asignar a esos ids.
// 3) Si no trae nada, fallback: coincidir por nombre (contiene nombre del personaje).
function buildMemoriesIndex(){
  MEMORIES_BY_CHAR = new Map();
  if(!Array.isArray(CHARACTERS) || !Array.isArray(MEMORIES)) return;

  const charById = new Map(CHARACTERS.map(c => [String(c.id), c]));
  const nameToId = new Map(
    CHARACTERS.map(c=>{
      const nm = _slug(c.name || c.nombre || '');
      return [nm, String(c.id)];
    })
  );

  for(const m of MEMORIES){
    let boundIds = [];

    if(m.charId){
      boundIds = [String(m.charId)];
    } else if (Array.isArray(m.bind) && m.bind.length){
      boundIds = m.bind.map(x => String(x));
    } else {
      // Fallback por nombre
      const nm = _slug(m.name || '');
      for(const [charName, cid] of nameToId){
        if(nm.includes(charName)) boundIds.push(cid);
      }
    }

    for(const cid of boundIds){
      if(!charById.has(cid)) continue;
      const arr = MEMORIES_BY_CHAR.get(cid) || [];
      arr.push(m);
      MEMORIES_BY_CHAR.set(cid, arr);
    }
  }
}


// ====== COMPARADOR: estado + utilidades ======
const COMPARE_LS_KEY = 'compare_state_v1';
let CHAR_BY_ID = new Map(); // se llena con CHARACTERS
let COMPARE = { A: null, B: null };

function buildCharIndex() {
  if (Array.isArray(CHARACTERS)) {
    CHAR_BY_ID = new Map(CHARACTERS.map(c => [String(c.id), c]));
  }
}

function compareSave() {
  try { localStorage.setItem(COMPARE_LS_KEY, JSON.stringify(COMPARE)); } catch {}
}
function compareLoad() {
  try {
    const raw = localStorage.getItem(COMPARE_LS_KEY);
    if(!raw) return;
    const st = JSON.parse(raw);
    if (st && ('A' in st) && ('B' in st)) COMPARE = st;
  } catch {}
}

function setCompareSlot(slot, id) {
  if (!CHAR_BY_ID.has(String(id))) return;
  if (slot !== 'A' && slot !== 'B') return;
  if (COMPARE.A === id && slot === 'B') COMPARE.A = null;
  if (COMPARE.B === id && slot === 'A') COMPARE.B = null;
  COMPARE[slot] = id;
  renderComparePanel();
  renderCompareStatsTable();
  renderCompareSkills();
  compareSave();
}

function clearCompare() {
  COMPARE = { A: null, B: null };
  renderComparePanel();
  renderCompareStatsTable();
  renderCompareSkills();
  compareSave();
}
function swapCompare() {
  const tmp = COMPARE.A;
  COMPARE.A = COMPARE.B;
  COMPARE.B = tmp;
  renderComparePanel();
  renderCompareStatsTable();
  renderCompareSkills();
  compareSave();
}

function renderComparePanel() {
  const aBox = document.getElementById('compare-slot-a');
  const bBox = document.getElementById('compare-slot-b');
  if (!aBox || !bBox) return;

  function slotHTML(id) {
    if (!id) return `<div class="compare-placeholder">Selecciona Personaje</div>`;
    const c = CHAR_BY_ID.get(String(id));
    if (!c)   return `<div class="compare-placeholder">Selecciona Personaje</div>`;
    const rare   = (c.rarity || c.rareza || '').toUpperCase();
    const role   = c.role || c.posicion || '';
    const school = c.school || c.escuela || '';
    const avatar = c.avatar || c.avatarPath || 'assets/placeholder.png';
    return `
      <div class="cmp-card">
        <img class="cmp-avatar" src="${avatar}" alt="${c.name || c.nombre}" loading="lazy" decoding="async" width="88" height="118">\n        <div class="cmp-meta">
          <div class="cmp-name">${c.name || c.nombre}</div>
          <div class="cmp-tags">
            <span class="tag">${rare}</span>
            <span class="tag">${role}</span>
            <span class="tag">${school}</span>
          </div>
        </div>
      </div>`;
  }

  aBox.innerHTML = slotHTML(COMPARE.A);
  bBox.innerHTML = slotHTML(COMPARE.B);

  const clr = document.getElementById('compare-clear');
  const swp = document.getElementById('compare-swap');
  if (clr && !clr._bound){ clr._bound = true; clr.addEventListener('click', clearCompare); }
  if (swp && !swp._bound){ swp._bound = true; swp.addEventListener('click', swapCompare); }
}

function compareBootOnce() {
  buildCharIndex();
  compareLoad();
  renderComparePanel();
  renderCompareStatsTable();
  renderCompareSkills();
}
function renderCompareStatsTable(){
  const tBody = document.querySelector('.compare-table tbody');
  if(!tBody) return;

  const getStats = (id)=>{
    if(!id) return {};
    const ch = CHAR_BY_ID.get(String(id));
    if(!ch) return {};
    return ch.statsMax || {};
  };

  const sA = getStats(COMPARE.A);
  const sB = getStats(COMPARE.B);

  const rows = [
    ['atqRapido',   'Ataque Rápido'],
    ['atqPoderoso', 'Ataque Poderoso'],
    ['colocacion',  'Colocación'],
    ['saque',       'Saque'],
    ['recepcion',   'Recepción'],
    ['bloqueo',     'Bloqueo'],
    ['recuperacion','Recuperación'],
  ];

  const fmt = (v)=>{
    if(v === null || v === undefined || v === '') return '—';
    if(typeof v === 'number') return v;
    const n = Number(v); return Number.isFinite(n) ? n : '—';
  };

    const html = rows.map(([k,label])=>{
    const aVal = fmt(sA[k]);
    const bVal = fmt(sB[k]);

    let diff = '—';
    let diffCls  = 'tie';
    let aCls = 'tie';
    let bCls = 'tie';

    if (typeof aVal === 'number' && typeof bVal === 'number') {
      const d = aVal - bVal;
      if (d === 0) {
        diff = '0';
        diffCls = 'tie';
        aCls = bCls = 'tie';
      } else if (d > 0) {
        diff = `▲ ${d}`;
        diffCls = 'win';
        aCls = 'win';
        bCls = 'lose';
      } else {
        diff = `▼ ${Math.abs(d)}`;
        diffCls = 'lose';
        aCls = 'lose';
        bCls = 'win';
      }
    }

    return `
      <tr>
        <td>${label}</td>
        <td class="num ${aCls}">${aVal}</td>
        <td class="num ${bCls}">${bVal}</td>
        <td class="num ${diffCls}">${diff}</td>
      </tr>`;
  }).join('');

  tBody.innerHTML = html;

}

function renderCompareSkills(){
  const colA = document.getElementById('compare-skills-a');
  const colB = document.getElementById('compare-skills-b');
  if (!colA || !colB) return;

  const renderFor = (id, slotLabel) => {
    if (!id) {
      return `<p class="banner-meta">Selecciona un personaje para ver sus habilidades.</p>`;
    }
    const ch = CHAR_BY_ID.get(String(id));
    if (!ch) {
      return `<p class="banner-meta">No encontré datos para este personaje.</p>`;
    }

    const skills = Array.isArray(ch.skills) ? ch.skills : [];
    if (!skills.length) {
      return `<p class="banner-meta">Sin datos de habilidades.</p>`;
    }

    const items = skills.map((s, i) => {
      if (typeof s === 'string') {
        return `<li><div class="cmp-skill-name">${s}</div></li>`;
      }
      const name = s.name || `Habilidad ${i+1}`;
      const effect = s.effect || '';
      return `
        <li class="cmp-skill-item">
          <div class="cmp-skill-name">${name}</div>
          ${effect ? `<div class=\"cmp-skill-text\">${effect}</div>` : ''}
        </li>`;
    }).join('');

    return `
      <div class="cmp-slot-title">Slot ${slotLabel}</div>
      <ul class="cmp-skill-list">${items}</ul>`;
  };

  colA.innerHTML = renderFor(COMPARE.A, 'A');
  colB.innerHTML = renderFor(COMPARE.B, 'B');
}

// ====== Overlay anclado a la card: "Ver ficha" o "Comparar" ======
// Cierra cualquier overlay abierto en cualquier card
function closeActionOverlay() {
  document.querySelectorAll('.card-action-pop').forEach(el => el.remove());
}

function openCharacterActionPrompt(char, ev) {
  // cierra overlays previos
  closeActionOverlay();

  // card clickada (article.char-tile)
  const cardEl = ev?.currentTarget?.closest('.char-tile') || ev?.target?.closest('.char-tile');
  if (!cardEl) return;

  // crea overlay dentro de la card
  const pop = document.createElement('div');
  pop.className = 'card-action-pop';
  pop.innerHTML = `
    <button class="cap-close" aria-label="Cerrar">X</button>
    <div class="cap-content">
      <button class="cap-btn cap-primary" data-act="view">VER FICHA</button>
      <button class="cap-btn" data-act="compare">COMPARAR</button>
    </div>
  `;
  cardEl.appendChild(pop);

  // Evitar que el click dentro del overlay vuelva a disparar el click de la card
  pop.addEventListener('click', (e)=> e.stopPropagation());

  // Cerrar con X
  pop.querySelector('.cap-close')?.addEventListener('click', (e)=>{
    e.stopPropagation();
    pop.remove();
  });

  // Acciones
  pop.querySelector('[data-act="view"]')?.addEventListener('click', (e)=>{
    e.stopPropagation();
    pop.remove();
    openCharacterModal(char); // tu modal existente
  });

  pop.querySelector('[data-act="compare"]')?.addEventListener('click', (e)=>{
    e.stopPropagation();
    pop.remove();
    if (!COMPARE.A) { setCompareSlot('A', char.id); return; }
    if (!COMPARE.B) { setCompareSlot('B', char.id); return; }
    const choice = window.confirm('A y B ya están ocupados.\n\nAceptar = Reemplazar A\nCancelar = Reemplazar B');
    setCompareSlot(choice ? 'A' : 'B', char.id);
  });

  // Cerrar con ESC
  function onEsc(evt){
    if (evt.key === 'Escape') {
      closeActionOverlay();
      document.removeEventListener('keydown', onEsc);
    }
  }
  document.addEventListener('keydown', onEsc, { once: true });
}



/* ===========================
   Filters (characters)
   =========================== */
['#search','#filter-rarity','#filter-role','#filter-school'].forEach(sel=>{
  document.addEventListener('input', ev=>{
    if(ev.target.matches(sel)) loadCharacters();
  });
});

