// sinergias.view.js — viewer compacto y estable
(() => {
  const MOUNT = '#tb-links-summary';
  let mounted = false;
  let raf = 0;

  const LS_KEY = 'FHM_SIN_COLLAPSE_V3';
  const readMap = () => {
    try { return JSON.parse(localStorage.getItem(LS_KEY) || '{}') || {}; }
    catch (_e) { return {}; }
  };
  const writeMap = (m) => {
    try { localStorage.setItem(LS_KEY, JSON.stringify(m)); } catch (_e) {}
  };
  const isCollapsed = (id) => {
    const m = readMap();
    return (id in m) ? !!m[id] : true;
  };
  const setCollapsed = (id, v) => {
    const m = readMap(); m[id] = !!v; writeMap(m);
  };

  function chip(id, ch, present){
    const label = (ch && ch.name) ? ch.name : id;
    return `<span class="sinergia-chip ${present?'is-present':''}" title="${label}">${label}</span>`;
  }

  function levelText(x){
    try {
      if (!x.levels || !x.levels.length) return x.effect || '';
      const max = x.levels.length;
      const lvl = (window.FHM_TB && window.FHM_TB.getUserLevel
                   ? window.FHM_TB.getUserLevel(x.id, max) : 1) || 1;
      const eff = x.levels[lvl-1] && x.levels[lvl-1].effect ? x.levels[lvl-1].effect : (x.effect || '');
      return eff;
    } catch (_e) {
      return x.effect || '';
    }
  }

  function levelSelector(x){
    if (!x.levels || !x.levels.length) return '';
    const max = x.levels.length;
    const sel = (window.FHM_TB && window.FHM_TB.getUserLevel
                 ? window.FHM_TB.getUserLevel(x.id, max) : 1) || 1;
    const opts = Array.from({length:max}, (_,i) => {
      const v = i+1;
      return `<option value="${v}" ${v===sel?'selected':''}>Lv.${v}</option>`;
    }).join('');
    return `<select class="sinergia-level-select" data-synergy="${x.id}">${opts}</select>`;
  }

  function getCh(dict, id){
    if (dict instanceof Map) return dict.get(id);
    if (Array.isArray(dict)) return dict.find(c => c && c.id === id);
    if (dict && typeof dict === 'object'){
      if (dict[id]) return dict[id];
      const list = Object.values(dict);
      return list.find(c => c && c.id === id);
    }
    return undefined;
  }

  function row(x, dict){
    const avatars = x.allIds.map(id => {
      const ch = getCh(dict, id);
      const src = ch && ch.avatar;
      const alt = (ch && ch.name) || id;
      return src ? `<img class="sinergia-ava" src="${src}" alt="${alt}">`
                 : `<span class="sinergia-ava is-fallback" title="${alt}">🏐</span>`;
    }).join('');

    const chips = x.allIds.map(id => chip(id, getCh(dict, id), !x.missing.includes(id))).join('');
    const badge = x.active ? `<span class="badge ok">Activo</span>` : `<span class="badge miss">Falta</span>`;
    const detail = levelText(x);
    const lvlSel = levelSelector(x);
    const collapsed = isCollapsed(x.id);
    const aria = collapsed ? 'false' : 'true';

    return `<div class="sinergia-row ${x.active?'is-active':'is-missing'} ${collapsed?'is-collapsed':''}" data-synergy="${x.id}">
      <button class="sinergia-header" aria-expanded="${aria}" aria-controls="sy-body-${x.id}" data-toggle="${x.id}">
        <div class="sinergia-ava-group">${avatars}</div>
        <div class="sinergia-title">${x.title}</div>
        <div class="sinergia-head-right">
          ${badge}
          ${lvlSel}
          <span class="sinergia-chev" aria-hidden="true">▶</span>
        </div>
      </button>
      <div id="sy-body-${x.id}" class="sinergia-body">
        <div class="sinergia-effect">${detail}</div>
        <div class="sinergia-chiplist">${chips}</div>
      </div>
    </div>`;
  }

  function skeleton(){
    return `<div class="sinergias-panel"><div class="sinergias-list"></div></div>`;
  }

  function render(){
    try {
      if (raf) { cancelAnimationFrame(raf); raf = 0; }
      const mount = document.querySelector(MOUNT);
      if(!mount || !window.FHM_TB) return;

      const rawList = (window.FHM_TB.getSynergies ? window.FHM_TB.getSynergies() : []);
      const list = Array.isArray(rawList) ? rawList : (rawList && rawList.list ? rawList.list : []);

      const rawChars = (window.FHM_TB.state ? window.FHM_TB.state.chars : null);
      const dict = (rawChars instanceof Map) ? rawChars
                 : Array.isArray(rawChars) ? new Map(rawChars.map(ch => [ch.id, ch]))
                 : (rawChars && typeof rawChars === 'object') ? new Map(Object.values(rawChars).map(ch => [ch.id, ch]))
                 : new Map();

      let panel = mount.querySelector('.sinergias-panel');
      if(!panel){
        mount.insertAdjacentHTML('beforeend', skeleton());
        panel = mount.querySelector('.sinergias-panel');
      }
      const listEl = panel.querySelector('.sinergias-list');
      const html = list.map(x => row(x, dict)).join('') || '<div class="empty">Ningún vínculo aplicable con la alineación actual.</div>';
      if(listEl) listEl.innerHTML = html;

      const nodes = panel.querySelectorAll('.sinergia-row.is-collapsed .sinergia-body');
      nodes.forEach(el => { el.style.display = 'none'; });
    } catch (e) {
      console.error('[sinergias.view] render error:', e);
    }
  }

  function scheduleRender(){
    if (raf) return; raf = requestAnimationFrame(render);
  }

  function observeFieldAndBench(){
    const mo = new MutationObserver(scheduleRender);
    const f = document.querySelector('#tb-field');
    const b = document.querySelector('#tb-bench');
    if (f) mo.observe(f, {childList:true, subtree:true, attributes:true});
    if (b) mo.observe(b, {childList:true, subtree:true, attributes:true});
  }

  async function init(){
    if (mounted) return; mounted = true;
    if (!window.FHM_TB) await new Promise(res => document.addEventListener('DOMContentLoaded', res));
    if (window.FHM_TB.ready && typeof window.FHM_TB.ready.then === 'function') await window.FHM_TB.ready;

    render();
    if (window.FHM_TB && typeof window.FHM_TB.subscribe === 'function') {
      window.FHM_TB.subscribe(scheduleRender);
    }

    document.addEventListener('change', (ev)=>{
      const sel = ev.target.closest('.sinergia-level-select');
      if(!sel) return;
      const id = sel.getAttribute('data-synergy');
      const lvl = Number(sel.value) || 1;
      try{ if (window.FHM_TB && window.FHM_TB.setUserLevel) window.FHM_TB.setUserLevel(id, lvl); }catch(_e){}
      scheduleRender();
    });

    document.addEventListener('click', (ev)=>{
      const btn = ev.target.closest('[data-toggle]');
      if(!btn) return;
      const id = btn.getAttribute('data-toggle');
      const row = btn.closest('.sinergia-row');
      const body = row ? row.querySelector('.sinergia-body') : null;
      const chev = row ? row.querySelector('.sinergia-chev') : null;
      const expanded = btn.getAttribute('aria-expanded') === 'true';
      const next = !expanded;
      btn.setAttribute('aria-expanded', String(next));
      if (row) row.classList.toggle('is-collapsed', !next);
      if (body) body.style.display = next ? '' : 'none';
      if (chev) chev.style.transform = next ? 'rotate(90deg)' : '';
      setCollapsed(id, !next);
    });

    observeFieldAndBench();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init, { once: true });
  } else {
    init();
  }
})();
