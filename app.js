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

function normalizeStr(s='') {
  try {
    return String(s)
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '');
  } catch (e) {
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
compareSave();
}

function clearCompare() {
  COMPARE = { A: null, B: null };
renderComparePanel();
renderCompareStatsTable();
compareSave();
}
function swapCompare() {
 const tmp = COMPARE.A;
COMPARE.A = COMPARE.B;
COMPARE.B = tmp;
renderComparePanel();
renderCompareStatsTable();
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

/* ===========================
   Filters (characters)
   =========================== */
['#search','#filter-rarity','#filter-role','#filter-school'].forEach(sel=>{
  document.addEventListener('input', ev=>{
    if(ev.target.matches(sel)) loadCharacters();
  });
});

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
    layoutIdx: 0,
    slots: Array(7).fill(null),
    bench: [],
    undoStack: [],
    linksLevels: {},
    accordion: { schools: {}, links: {} },
  };

  // Para feedback de drop
  let draggingVarId = null;

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

  const LS_KEY = 'tb_state_v1';
  function saveState(){
    localStorage.setItem(LS_KEY, JSON.stringify({
      layoutIdx: state.layoutIdx,
      slots: state.slots,
      bench: state.bench
    }));
  }
  function loadState(){
    try{
      const raw = localStorage.getItem(LS_KEY);
      if(!raw) return;
      const obj = JSON.parse(raw);
      state.layoutIdx = obj.layoutIdx ?? 0;
      state.slots = Array.isArray(obj.slots) && obj.slots.length===7 ? obj.slots : Array(7).fill(null);
      state.bench = Array.isArray(obj.bench) ? obj.bench : [];
    }catch{}
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
    state.undoStack.push(JSON.stringify({layoutIdx:state.layoutIdx, slots:[...state.slots], bench:[...state.bench]}));
    if(state.undoStack.length>25) state.undoStack.shift();
  }
  function undo(){
    const last = state.undoStack.pop();
    if(!last) return toast('Nada para deshacer');
    const snap = JSON.parse(last);
    state.layoutIdx = snap.layoutIdx;
    state.slots = snap.slots;
    state.bench = snap.bench;
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
        alias
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

  function isDuplicate(varId){
    const base = state.byVar.get(varId)?.baseId;
    if(!base) return false;
    const exists = [...state.slots, ...state.bench]
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
    const layout = SLOT_LAYOUTS[state.layoutIdx];

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

      const varId = state.slots[logicalIdx];
      if(varId){
        const card = makeCard(varId);
        host.appendChild(card);
        host.classList.add('filled');
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
    const counter = $('#tb-bench-count');
    if(counter) counter.textContent = `${state.bench.length}/6`;
    state.bench.forEach(varId => el.appendChild(makeCard(varId)));
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

  function makeCard(varId){
    const p = state.byVar.get(varId);
    const el = document.createElement('div');
    el.className = 'tb-card-item';
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
    const idx = state.slots.findIndex((v, i) => !v && SLOT_LAYOUTS[state.layoutIdx][i].pos === p.posicion);
    if(idx>=0){ tryPlaceInSlot(p.varianteId, idx); return; }
    if(p.posicion==='L'){ toast('No se permiten Líberos en la banca.'); return; }
    if(state.bench.length>=6){ toast('Banca llena (máximo 6).'); return; }
    if(isDuplicate(p.varianteId)){ toast('Personaje ya en uso (no se permiten variantes duplicadas en el equipo).'); return; }
    pushUndo();
    state.bench.push(p.varianteId);
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
        e.dataTransfer.dropEffect='move';

        target.classList.remove('drop-valid','drop-invalid');
        if(!draggingVarId) return;
        const p = state.byVar.get(draggingVarId);
        if(!p) return;

        const posTarget = target.dataset.pos;
        let ok = true;
        if(posTarget === 'BENCH'){
          ok = p.posicion !== 'L' && state.bench.length < 6 && !isDuplicate(draggingVarId);
        }else{
          const logicalIdx = Number(target.dataset.slotIndex);
          const needPos = SLOT_LAYOUTS[state.layoutIdx][logicalIdx].pos;
          ok = (p.posicion === needPos) && !isDuplicate(draggingVarId);
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
        const posTarget = target.dataset.pos;
        if(posTarget === 'BENCH'){ handleDropBench(varId); return; }
        const logicalIdx = Number(target.dataset.slotIndex);
        handleDropSlot(varId, logicalIdx);
      });
    });
  }

  function handleDropSlot(varId, logicalIdx){
    const p = state.byVar.get(varId);
    if(!p) return;
    const needPos = SLOT_LAYOUTS[state.layoutIdx][logicalIdx].pos;
    if(p.posicion !== needPos){ toast('Posición incorrecta del jugador.'); return; }
    if(isDuplicate(varId)){ toast('Personaje ya en uso (no se permiten variantes duplicadas en el equipo).'); return; }

    pushUndo();
    const iBench = state.bench.indexOf(varId);
    if(iBench>=0) state.bench.splice(iBench,1);

    const prev = state.slots[logicalIdx];
    if(prev){
      const prevP = state.byVar.get(prev);
      if(prevP.posicion!=='L' && state.bench.length<6) state.bench.push(prev);
    }

    state.slots[logicalIdx] = varId;
    renderAll(); saveState();
  }

  function handleDropBench(varId){
    const p = state.byVar.get(varId); if(!p) return;
    if(p.posicion==='L'){ toast('No se permiten Líberos en la banca.'); return; }
    if(state.bench.length>=6){ toast('Banca llena (máximo 6).'); return; }
    if(isDuplicate(varId)){ toast('Personaje ya en uso (no se permiten variantes duplicadas en el equipo).'); return; }

    pushUndo();
    const idx = state.slots.findIndex(v=>v===varId);
    if(idx>=0) state.slots[idx]=null;

    state.bench.push(varId);
    renderAll(); saveState();
  }

  function tryPlaceInSlot(varId, logicalIdx){
    const p = state.byVar.get(varId); if(!p) return;
    const needPos = SLOT_LAYOUTS[state.layoutIdx][logicalIdx].pos;
    if(p.posicion !== needPos){ toast('Posición incorrecta del jugador.'); return; }
    if(isDuplicate(varId)){ toast('Personaje ya en uso (no se permiten variantes duplicadas en el equipo).'); return; }
    pushUndo();
    state.slots[logicalIdx] = varId;
    renderAll(); saveState();
  }

  function rotateFormation(){
  // ciclo de índices en el campo (sin contar L): 0 → 1 → 2 → 5 → 4 → 3 → 0
  const GRID_CYCLE = [0, 1, 2, 5, 4, 3];
  const N = GRID_CYCLE.length;

  // layout actual y siguiente (solo cambia el "dibujo" de posiciones)
  const prevLayout = SLOT_LAYOUTS[state.layoutIdx];
  state.layoutIdx = (state.layoutIdx + 1) % SLOT_LAYOUTS.length;
  const nextLayout = SLOT_LAYOUTS[state.layoutIdx];

  // mapa: idx_grid_anterior -> varId en esa celda
  const prevGridToVar = new Map();
  prevLayout.forEach((conf, logicalIdx)=> {
    prevGridToVar.set(conf.idx, state.slots[logicalIdx]);
  });

  // rotamos las cartas en el ciclo de 6 celdas; el L (6) se mantiene fijo
  const newGridToVar = new Map(prevGridToVar); // copiamos todo (incluye L en 6)
  for (let i = 0; i < N; i++) {
    const dst = GRID_CYCLE[i];
    const src = GRID_CYCLE[(i - 1 + N) % N];
    newGridToVar.set(dst, prevGridToVar.get(src) || null);
  }
  // L se queda donde está (idx 6); nada que hacer

  // construimos los nuevos 7 slots lógicos para el nuevo layout
  const newSlots = Array(7).fill(null);
  nextLayout.forEach((conf, logicalIdx) => {
    newSlots[logicalIdx] = newGridToVar.get(conf.idx) || null;
  });

  // aplicar y render
  pushUndo();
  state.slots = newSlots;
  renderAll();
  saveState();
}

  function clearAll(){
    pushUndo();
    state.slots = Array(7).fill(null);
    state.bench = [];
    renderAll(); saveState();
  }

  function renderAll(){
    renderField();
    renderBench();
    renderList();
    renderLinks();
  }

  /* ---------- Vínculos ---------- */
  function getTitulares(){
    return state.slots.map(v=> v ? state.byVar.get(v) : null).filter(Boolean);
  }

  function renderLinks(){
    renderSchoolLink();
    renderSpecificLinks();
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

  async function exportImage(){
    toast('Exportar imagen: lo activamos en un paso extra 👍');
  }

  async function initOnce(){
    const screen = $('#tab-team'); if(!screen) return;

    if(!state._inited){
      ensureTBStyles();
      await loadData();
      loadState();
      loadLinksLevels();
      loadAccordion();  // <- NUEVO

      const undoBtn = $('#tb-undo'); if(undoBtn) undoBtn.addEventListener('click', undo);
      const clearBtn= $('#tb-clear'); if(clearBtn) clearBtn.addEventListener('click', clearAll);
      const rotBtn  = $('#tb-rotate'); if(rotBtn) rotBtn.addEventListener('click', rotateFormation);
      const expBtn  = $('#tb-export'); if(expBtn) expBtn.addEventListener('click', exportImage);

      const s = $('#tb-search'); if(s) s.addEventListener('input', renderList);
      const fr= $('#tb-filter-rareza'); if(fr) fr.addEventListener('change', renderList);
      const fe= $('#tb-filter-escuela'); if(fe) fe.addEventListener('change', renderList);

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
  try { const gbtn = document.querySelector('.tab-btn[data-tab="games"]'); if (gbtn && gbtn.classList.contains('active')) loadFlyQuizOnce(); } catch(e){}
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
  function paint(){
    document.querySelectorAll('[data-nick-greet]').forEach(el=>{
      const sec = el.getAttribute('data-section') || '';
      el.textContent = greet(sec);
    });
    document.querySelectorAll('[data-nick-target]').forEach(el=>{
      el.textContent = get() || '';
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


;(() => {
  const isGamesPage = () => !!document.getElementById('games-root');
  function ensureFlyQuizLoaded() {
    if (window._flyquizLoaded) return Promise.resolve();
    return new Promise((resolve, reject) => {
      const s = document.createElement('script');
      s.src = '/games/flyquiz15.js?v=' + Date.now();
      s.onload = () => { window._flyquizLoaded = true; resolve(); };
      s.onerror = reject;
      document.head.appendChild(s);
    });
  }
  document.addEventListener('click', async (ev) => {
    const btn = ev.target.closest('[data-play="flyquiz"]');
    if (!btn) return;
    if (!isGamesPage()) return;
    ev.preventDefault();
    try {
      await ensureFlyQuizLoaded();
      if (typeof window.mountFlyQuiz === 'function') {
        window.mountFlyQuiz('#games-root');
      } else {
        console.warn('[FlyQuiz] mountFlyQuiz no está disponible');
      }
    } catch (e) {
      console.error('[FlyQuiz] Error cargando:', e);
    }
  });
})();
