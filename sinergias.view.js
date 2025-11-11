// sinergias.view.js — niveles + vista segura (sin loops)
(() => {
  const MOUNT = '#tb-links-summary';
  let mounted = false;
  let raf = 0;
  const LS_KEY = 'FHM_SIN_COLLAPSE_V1';

  function readCollapseMap(){
    try{ return JSON.parse(localStorage.getItem(LS_KEY)||'{}')||{}; }catch(e){ return {}; }
  }
  function writeCollapseMap(map){
    try{ localStorage.setItem(LS_KEY, JSON.stringify(map)); }catch(e){}
  }
  function isCollapsed(id){
    const map = readCollapseMap(); return !!map[id];
  }
  function setCollapsed(id, val){
    const map = readCollapseMap(); map[id]=!!val; writeCollapseMap(map);
  }

  function chip(id, ch, present){
    const label = ch?.name || id;
    return `<span class="sinergia-chip ${present?'is-present':''}" title="${label}">${label}</span>`;
  }

  function levelText(x){
    try{
      if (!x.levels || !x.levels.length) return x.effect || '';
      const max = x.levels.length;
      const lvl = (window.FHM_TB?.getUserLevel?.(x.id, max)) || 1;
      const entry = x.levels.find(l => Number(l.lvl)===Number(lvl)) || x.levels[0];
      if (entry && entry.text) return (entry.text.es||entry.text.en||entry.text) || '';
      const parts = Object.entries(entry?.bono||{}).map(([k,v]) => `${k.replace(/_/g,' ')} +${v}%`);
      return parts.join(' · ') || (x.effect || '');
    }catch(e){ return x.effect||''; }
  }

  function levelSelector(x){
    if (!x.active || !x.levels || !x.levels.length) return '';
    const max = x.levels.length;
    const cur = (window.FHM_TB?.getUserLevel?.(x.id, max)) || 1;
    const opts = x.levels.map(l => `<option value="${l.lvl}" ${Number(l.lvl)===Number(cur)?'selected':''}>Lv.${l.lvl}</option>`).join('');
    return `<label class="sinergia-level"><span>Lvl</span><select data-synergy="${x.id}" class="sinergia-level-select">${opts}</select></label>`;
  }

  function row(x, dict){
    const first = dict.get(x.allIds[0]);
    const thumb = first?.avatar
      ? `<div class=\"sinergia-thumb\"><img src=\"${first.avatar}\" alt=\"${first.name||''}\"></div>`
      : `<div class=\"sinergia-thumb\">🏐</div>`;
    const chips = x.allIds.map(id => chip(id, dict.get(id), !x.missing.includes(id))).join('');
    const badge = x.active ? `<span class=\"badge ok\">Activo</span>` : `<span class=\"badge miss\">Falta</span>`;
    const detail = levelText(x);
    const lvlSel = levelSelector(x);
    const collapsed = isCollapsed(x.id);
    const aria = collapsed ? 'false' : 'true';

    return `<div class=\"sinergia-row ${x.active?'is-active':'is-missing'} ${collapsed?'is-collapsed':''}\" data-synergy=\"${x.id}\">
      <button class=\"sinergia-header\" aria-expanded=\"${aria}\" aria-controls=\"sy-body-${x.id}\" data-toggle=\"${x.id}\">
        ${thumb}
        <div class=\"sinergia-head-text\">
          <div class=\"sinergia-title\">${x.title}</div>
          <div class=\"sinergia-head-meta\">
            ${badge}
            ${lvlSel}
          </div>
        </div>
        <span class=\"sinergia-chev\" aria-hidden=\"true\">▶</span>
      </button>
      <div id=\"sy-body-${x.id}\" class=\"sinergia-body\">
        <div class=\"sinergia-effect\">${detail}</div>
        <div class=\"sinergia-chiplist\">${chips}</div>
      </div>
    </div>`;
  }
      <div>
        <div class="sinergia-title">${x.title}</div>
        <div class="sinergia-effect">${detail}</div>
        <div class="sinergia-chiplist">${chips}</div>
      </div>
      <div class="sinergia-actions">
        ${lvlSel}
        ${badge}
      </div>
    </div>`;
  }

  function scheduleRender(){
    if (raf) return;
    raf = requestAnimationFrame(()=>{ raf=0; render(); });
  }

  function render(){
    const panel = document.querySelector(MOUNT);
    if (!panel || !window.FHM_TB) return;
    const list = FHM_TB.getSynergies();
    if (!list.length) { panel.innerHTML = ''; return; }
    panel.innerHTML = `<div class="sinergias-panel"><div class="sinergias-group">${
      list.map(x => row(x, FHM_TB.state.chars)).join('')
    }</div></div>`;
  }

  function observeFieldAndBench(){
    const field = document.querySelector('#tb-field');
    const bench = document.querySelector('#tb-bench');
    if (!field && !bench) return;
    const mo = new MutationObserver(()=>scheduleRender());
    const opts = { childList:true, subtree:true, attributes:true, attributeFilter:['data-id','data-character-id','data-varid'] };
    if (field) mo.observe(field, opts);
    if (bench) mo.observe(bench, opts);
  }

  async function init(){
    if (mounted) return; mounted = true;
    if (!window.FHM_TB) await new Promise(res => document.addEventListener('DOMContentLoaded', res));
    await FHM_TB.ready;

    render();
    FHM_TB.subscribe(scheduleRender);

    document.addEventListener('change', (ev)=>{
      const sel = ev.target.closest('.sinergia-level-select');
      if(!sel) return;
      const id = sel.getAttribute('data-synergy');
      const lvl = Number(sel.value)||1;
      try{ window.FHM_TB?.setUserLevel?.(id, lvl); }catch(e){}
    });

    document.addEventListener('click', (ev)=>{
      const btn = ev.target.closest('[data-toggle]');
      if(!btn) return;
      const id = btn.getAttribute('data-toggle');
      const row = btn.closest('.sinergia-row');
      const body = row?.querySelector('.sinergia-body');
      const chev = row?.querySelector('.sinergia-chev');
      const expanded = btn.getAttribute('aria-expanded') === 'true';
      const next = !expanded;
      btn.setAttribute('aria-expanded', String(next));
      row?.classList.toggle('is-collapsed', !next);
      if (body) body.hidden = !next;
      if (chev) chev.classList.toggle('rot', next);
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
