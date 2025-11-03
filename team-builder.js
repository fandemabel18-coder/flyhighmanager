// team-builder.js (namespace seguro: FHM_TB) — incluye niveles (persistencia)
(() => {
  const DEBUG = /[?&]debug=1\b/.test(location.search);
  const log = (...a)=>{ if(DEBUG) console.debug('[FHM_TB]', ...a); };

  function normId(id){
    let x = String(id||'').trim().toLowerCase();
    x = x.split('::')[0].split('#')[0].split('?')[0];
    x = x.split('__')[0];
    x = x.replace(/_+$/g,'');
    x = x.replace(/[^a-z0-9-]/g,'');
    return x;
  }

  async function loadFirst(paths){
    for (const p of paths){
      try { const r = await fetch(p, {cache:'no-store'}); if (r.ok) return await r.json(); } catch(e){}
    }
    throw new Error('No se pudo cargar: ' + paths.join(' | '));
  }

  const FHM_TB = {
    ready: null,
    state: { chars:new Map(), rules:[], lineup:new Set(), bench:new Set() },

    // niveles (persistencia)
    getUserLevel, setUserLevel,

    // API pública
    getStartingSixIds(){ return [...FHM_TB.state.lineup]; },
    getBenchIds(){ return [...FHM_TB.state.bench]; },
    getSynergies,
    subscribe, emitChange
  };

  // --- Persistencia de niveles por sinergia ---
  const LEVELS_KEY = 'tb:synergy-levels';
  const _levelsCacheObj = (() => { try { return JSON.parse(localStorage.getItem(LEVELS_KEY)||'{}'); } catch(e){ return {}; } })();
  const userLevels = new Map(Object.entries(_levelsCacheObj));
  function setUserLevel(id, lvl){
    userLevels.set(String(id), Number(lvl)||1);
    try { localStorage.setItem(LEVELS_KEY, JSON.stringify(Object.fromEntries(userLevels))); } catch(e){}
    emitChange();
  }
  function getUserLevel(id, max=5){
    const v = Number(userLevels.get(String(id)) || 1);
    return Math.max(1, Math.min(max||5, v));
  }

  const listeners = new Set();
  function subscribe(fn){ listeners.add(fn); return ()=>listeners.delete(fn); }
  function emitChange(){ listeners.forEach(fn=>{ try{ fn(); }catch(e){ console.error(e);} }); }

  function normalizeRule(r){
    const title  = (r.name && (r.name.es||r.name.en)) || r.name || r.id;
    const effect = (r.effect && (r.effect.es||r.effect.en)) || r.effect || '';
    const requires = (r.members ? r.members.map(m=>normId(m.characterId)) : (r.requires||[]).map(normId));
    const pairs = Array.isArray(r.pairs) ? r.pairs.map(p => p.map(normId)) : [];
    const allIds = [...new Set([...(requires||[]), ...(pairs.flat())])];
    const levels = Array.isArray(r.levels) ? r.levels.map(l=>({
      lvl:Number(l.lvl)||1,
      bono:l.bono||{},
      text:(l.text&&(l.text.es||l.text.en||l.text))||''
    })) : [];
    return { id:r.id, title, effect, requires, pairs, allIds, priority:r.priority||0, levels };
  }

  async function boot(){
    ensurePanel();
    const [chars, synRaw] = await Promise.all([
      loadFirst(['/data/characters.json','/characters.json','characters.json']),
      loadFirst(['/data/sinergias.json','/sinergias.json','sinergias.json'])
    ]);
    chars.forEach(c => FHM_TB.state.chars.set(c.id, c));
    const rules = Array.isArray(synRaw) ? synRaw : (synRaw.synergies||[]);
    FHM_TB.state.rules = rules.map(normalizeRule).sort((a,b)=>(b.priority-a.priority));

    refreshFromAnywhere();
    mountObservers();
    log('listo', {chars:FHM_TB.state.chars.size, rules:FHM_TB.state.rules.length});
    emitChange();
  }

  function collectIdsFromDOM(){
    const pick = el => el.getAttribute('data-id') || el.getAttribute('data-character-id') || el.getAttribute('data-varid');

    const roots = ['#tb-field','.tb-field','#team-field','.team-field','.team-board','[data-role="field"]','#field']
      .map(q=>document.querySelector(q)).filter(Boolean);
    const root = roots[0] || document;

    const EXCLUDE = ['#tb-pool','.pool','.gallery','#sidebar','.right-col'].join(',');
    const inScope = el => !el.closest(EXCLUDE);

    const cards = [...root.querySelectorAll('[data-id],[data-character-id],[data-varid], .character-card[data-id]')].filter(inScope);
    const field = cards.map(pick).map(normId).filter(Boolean);

    const benchRoot = document.querySelector('#tb-bench') || document.querySelector('.tb-bench') || document.querySelector('[data-role="bench"]');
    const bench = benchRoot
      ? [...benchRoot.querySelectorAll('[data-id],[data-character-id],[data-varid], .character-card[data-id]')].map(pick).map(normId).filter(Boolean)
      : [];

    return { field:new Set(field), bench:new Set(bench) };
  }

  function refreshFromAnywhere(){
    try {
      if (typeof window.getStartingSixIds === 'function') {
        const ids = (window.getStartingSixIds()||[]).map(normId).filter(Boolean);
        FHM_TB.state.lineup = new Set(ids); return;
      }
    } catch(e){}
    try {
      const cand = window.FHM?.team?.startingSixIds || window.teamIds;
      if (Array.isArray(cand) && cand.length) {
        FHM_TB.state.lineup = new Set(cand.map(normId).filter(Boolean)); return;
      }
    } catch(e){}
    const {field, bench} = collectIdsFromDOM();
    FHM_TB.state.lineup = field; FHM_TB.state.bench = bench;
  }

  function mountObservers(){
    window.addEventListener('tb:state-changed', ()=>{ refreshFromAnywhere(); emitChange(); });
    const mo = new MutationObserver(()=>{ refreshFromAnywhere(); emitChange(); });
    const f = document.querySelector('#tb-field'); const b = document.querySelector('#tb-bench');
    if (f) mo.observe(f,{childList:true,subtree:true,attributes:true});
    if (b) mo.observe(b,{childList:true,subtree:true,attributes:true});
  }

  function getSynergies(){
    const have = new Set(FHM_TB.state.lineup);
    return FHM_TB.state.rules
      .map(r=>{
        const reqOK  = !r.requires.length || r.requires.every(x=>have.has(x));
        const pairOK = !r.pairs.length || r.pairs.some(([a,b])=>have.has(a)&&have.has(b));
        const active = reqOK && pairOK;
        const relevant = r.allIds.some(id=>have.has(id));
        const missing = (()=> {
          if (active) return [];
          const ms = new Set();
          r.requires.forEach(id => { if(!have.has(id)) ms.add(id); });
          if (r.pairs.length && !r.pairs.some(([a,b])=>have.has(a)&&have.has(b))){
            const [a,b] = r.pairs[0];
            if(!have.has(a)) ms.add(a);
            if(!have.has(b)) ms.add(b);
          }
          return [...ms];
        })();
        return { ...r, active, relevant, missing };
      })
      .filter(x => x.active || x.relevant);
  }

  function ensurePanel(){
    if (!document.querySelector('#tb-links-summary')) {
      const col = document.querySelector('#left-col, .left-col, .links-panel') || document.body;
      const div = document.createElement('div'); div.id = 'tb-links-summary';
      col.prepend(div);
    }
  }

  window.FHM_TB = FHM_TB;
  FHM_TB.ready = (document.readyState === 'loading')
    ? new Promise(res => document.addEventListener('DOMContentLoaded', ()=>boot().then(res)))
    : boot();
})();
