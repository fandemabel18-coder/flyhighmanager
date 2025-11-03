
// sinergias.js (root) — robust team ID detection + only show relevant/active
(() => {
  const DEBUG = /[?&]debug=1\b/.test(location.search); // cambia a true si quieres ver logs en consola
  const STATE = { charDict: new Map(), rules: [], mountEl: null };
  const SEL = { field:'#tb-field', bench:'#tb-bench', panel:'#tb-links-summary' };

  const log = (...args) => { if (DEBUG) console.debug('[Sinergias]', ...args); };

  async function loadFirst(paths){
    for (const p of paths){
      try{
        const res = await fetch(p, { cache:'no-store' });
        if (res.ok) return await res.json();
      }catch(e){}
    }
    throw new Error("No se pudo cargar " + paths.join(" | "));
  }

  async function bootstrap(){
    STATE.mountEl = document.querySelector(SEL.panel);
    if (!STATE.mountEl) return;

    const chars = await loadFirst(['/data/characters.json','/characters.json','characters.json']);
    chars.forEach(c => STATE.charDict.set(c.id, c));

    const raw = await loadFirst(['/data/sinergias.json','/sinergias.json','sinergias.json']);
    const rules = Array.isArray(raw) ? raw : (raw.synergies || []);
    STATE.rules = rules.map(r => normalizeRule(r)).sort((a,b)=>(b.priority||0)-(a.priority||0));

    renderNow();

    window.addEventListener('tb:state-changed', renderNow);
    const mo = new MutationObserver(renderNow);
    const f = document.querySelector(SEL.field);
    const b = document.querySelector(SEL.bench);
    if (f) mo.observe(f, {childList:true, subtree:true, attributes:true});
    if (b) mo.observe(b, {childList:true, subtree:true, attributes:true});
  }

  function normalizeId(id){
    if (!id) return '';
    let x = String(id).trim();
    x = x.split('::')[0].split('#')[0];
    x = x.replace(/\s+/g, '');
    return x;
  }

  function normalizeRule(r){
    const title  = (r.name && (r.name.es || r.name.en)) || r.name || r.id;
    const effect = (r.effect && (r.effect.es || r.effect.en)) || r.effect || '';
    const requires = (r.members ? r.members.map(m=>normalizeId(m.characterId)) : (r.requires || []).map(normalizeId));
    const pairs = Array.isArray(r.pairs) ? r.pairs.map(p => p.map(normalizeId)) : [];

    const allPairIds = pairs.flatMap(p => p).filter(Boolean);
    const allIds = Array.from(new Set([...(requires||[]), ...allPairIds]));

    return { id:r.id, title, effect, requires, pairs, priority:r.priority||0, allIds };
  }

  function getTeamIds(){
    try {
      if (typeof window.getStartingSixIds === 'function') {
        const a = (window.getStartingSixIds() || []).map(normalizeId);
        log('team from getStartingSixIds()', a); if (a.length) return a;
      }
    } catch(e){}
    try {
      const cand = window.FHM?.team?.startingSixIds || window.TB?.team?.ids || window.teamIds;
      if (Array.isArray(cand) && cand.length) {
        const a = cand.map(normalizeId);
        log('team from global state', a); if (a.length) return a;
      }
    } catch(e){}
    const roots = [document.querySelector(SEL.field), document.querySelector(SEL.bench)].filter(Boolean);
    const ids = new Set();
    roots.forEach(r => r.querySelectorAll('[data-id],[data-character-id],[data-varid]').forEach(el => {
      const raw = el.getAttribute('data-id') || el.getAttribute('data-character-id') || el.getAttribute('data-varid');
      const id = normalizeId(raw);
      if (id) ids.add(id);
    }));
    const a = [...ids];
    log('team from DOM', a);
    return a;
  }

  function isActive(rule, ids){
    const have = new Set(ids);
    if (rule.requires && rule.requires.length && !rule.requires.every(x => have.has(x))) return false;
    if (rule.pairs && rule.pairs.length && !rule.pairs.some(([a,b]) => have.has(a)&&have.has(b))) return false;
    return true;
  }

  function isRelevant(rule, ids){
    const have = new Set(ids);
    return rule.allIds.some(id => have.has(id));
  }

  function getMissing(rule, ids){
    const have = new Set(ids);
    const miss = new Set();
    if (Array.isArray(rule.requires) && rule.requires.length){
      rule.requires.forEach(id => { if(!have.has(id)) miss.add(id) });
    }
    if (Array.isArray(rule.pairs) && rule.pairs.length){
      const anyPair = rule.pairs.find(([a,b]) => have.has(a) && have.has(b));
      if (!anyPair){
        const [a,b] = rule.pairs[0];
        if(!have.has(a)) miss.add(a);
        if(!have.has(b)) miss.add(b);
      }
    }
    return [...miss];
  }

  function renderNow(){
    const ids = getTeamIds();
    const present = new Set(ids);

    const rows = STATE.rules.map(rule => {
      const ok = isActive(rule, ids);
      const rel = isRelevant(rule, ids);
      if (!ok && !rel) return null;
      const miss = ok ? [] : getMissing(rule, ids);
      return { rule, ok, miss, present };
    }).filter(Boolean);

    const m = STATE.mountEl;
    if (!rows.length){ m.innerHTML = ``; return; }

    m.innerHTML = `<div class="sinergias-panel"><div class="sinergias-group">${
      rows.map(({rule, ok, miss, present}) => {
        const badge = ok ? `<span class="badge ok">Activo</span>` : `<span class="badge miss">Falta</span>`;
        const chips = rule.allIds.map(id => {
          const ch = STATE.charDict.get(id);
          const name = ch?.name || id;
          return `<span class="sinergia-chip ${present.has(id)?'is-present':''}" title="${name}">${name}</span>`;
        }).join('');
        const first = STATE.charDict.get(rule.allIds[0]);
        const t = first?.avatar ? `<div class="sinergia-thumb"><img src="${first.avatar}" alt="${first.name||''}"></div>` : `<div class="sinergia-thumb">🏐</div>`;
        return `<div class="sinergia-row ${ok?'is-active':'is-missing'}">${t}
          <div><div class="sinergia-title">${rule.title}</div><div class="sinergia-effect">${rule.effect||''}</div><div class="sinergia-chiplist">${chips}</div></div>${badge}</div>`;
      }).join('')
    }</div></div>`;
  }

  document.addEventListener('DOMContentLoaded', bootstrap);
})();
