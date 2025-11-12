// sinergias.view.js — clean render + acordeón seguro
(() => {
  const MOUNT = '#tb-links-summary';
  let mounted = false;
  let raf = 0;

  const LS_KEY = 'FHM_SIN_COLLAPSE_V2';
  const readMap = () => { try { return JSON.parse(localStorage.getItem(LS_KEY)||'{}')||{}; } catch(e){ return {}; } };
  const writeMap = (m) => { try { localStorage.setItem(LS_KEY, JSON.stringify(m)); } catch(e){} };
  const isCollapsed = (id) => !!readMap()[id];
  const setCollapsed = (id, v) => { const m = readMap(); m[id]=!!v; writeMap(m); };

  function chip(id, ch, present){
    const label = ch?.name || id;
    return `<span class="sinergia-chip ${present?'is-present':''}" title="${label}">${label}</span>`;
  }

  function levelText(x){
    try{
      if (!x.levels || !x.levels.length) return x.effect || '';
      const max = x.levels.length;
      const lvl = (window.FHM_TB?.getUserLevel?.(x.id, max)) || 1;
      const eff = x.levels[lvl-1]?.effect || x.effect || '';
      return eff;
    }catch(e){ return x.effect || ''; }
  }

  function levelSelector(x){
    if (!x.levels || !x.levels.length) return '';
    const max = x.levels.length;
    const sel = (window.FHM_TB?.getUserLevel?.(x.id, max)) || 1;
    const opts = Array.from({length:max},(_,i)=>`<option value="${i+1}" ${i+1===sel?'selected':''}>Lv.${i+1}</option>`).join('');
    return `<select class="sinergia-level-select" data-synergy="${x.id}">${opts}</select>`;
  }

  function row(x, dict){
    const first = dict.get(x.allIds[0]);
    const thumb = first?.avatar
      ? `<div class="sinergia-thumb"><img src="${first.avatar}" alt="${first.name||''}"></div>`
      : `<div class="sinergia-thumb">🏐</div>`;
    const chips = x.allIds.map(id => chip(id, dict.get(id), !x.missing.includes(id))).join('');
    const badge = x.active ? `<span class="badge ok">Activo</span>` : `<span class="badge miss">Falta</span>`;
    const detail = levelText(x);
    const lvlSel = levelSelector(x);
    const collapsed = isCollapsed(x.id);
    const aria = collapsed ? 'false' : 'true';

    return `<div class="sinergia-row ${x.active?'is-active':'is-missing'} ${collapsed?'is-collapsed':''}" data-synergy="${x.id}">
      <button class="sinergia-header" aria-expanded="${aria}" aria-controls="sy-body-${x.id}" data-toggle="${x.id}">
        ${thumb}
        <div class="sinergia-head-text">
          <div class="sinergia-title">${x.title}</div>
          <div class="sinergia-head-meta">
            ${badge}
            ${lvlSel}
          </div>
        </div>
        <span class="sinergia-chev" aria-hidden="true">▶</span>
      </button>
      <div id="sy-body-${x.id}" class="sinergia-body">
        <div class="sinergia-effect">${detail}</div>
        <div class="sinergia-chiplist">${chips}</div>
      </div>
    </div>`;
  }

  function skeleton(){ return `<div class="sinergias-panel"><div class="sinergias-list"></div></div>`; }

  function render(){
    cancelAnimationFrame(raf);
    raf = 0;
    const mount = document.querySelector(MOUNT);
    if(!mount) return;
    const list = window.FHM_TB?.getSynergies?.() || [];
    const dict = new Map((window.FHM_TB?.state?.chars||[]).map(ch => [ch.id, ch]));
    const html = list.map(x => row(x, dict)).join('') || `<div class="empty">Ningún vínculo aplicable con la alineación actual.</div>`;
    // mount inner
    let panel = mount.querySelector('.sinergias-panel');
    if(!panel){ mount.insertAdjacentHTML('beforeend', skeleton()); panel = mount.querySelector('.sinergias-panel'); }
    const listEl = panel.querySelector('.sinergias-list');
    if(listEl) listEl.innerHTML = html;
    // hide body for collapsed
    for (const el of panel.querySelectorAll('.sinergia-row.is-collapsed .sinergia-body')) el.style.display='none';
  }

  function scheduleRender(){ if (raf) return; raf = requestAnimationFrame(render); }

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
    await window.FHM_TB.ready;

    render();
    window.FHM_TB.subscribe?.(scheduleRender);

    document.addEventListener('change', (ev)=>{
      const sel = ev.target.closest('.sinergia-level-select');
      if(!sel) return;
      const id = sel.getAttribute('data-synergy');
      const lvl = Number(sel.value)||1;
      try{ window.FHM_TB?.setUserLevel?.(id, lvl); }catch(e){}
      scheduleRender();
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