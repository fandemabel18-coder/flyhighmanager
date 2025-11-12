// sinergias.view.js — niveles + vista segura (sin loops)
(() => {
  const MOUNT = '#tb-links-summary';
  let mounted = false;
  let raf = 0;

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
      ? `<div class="sinergia-thumb"><img src="${first.avatar}" alt="${first.name||''}"></div>`
      : `<div class="sinergia-thumb">🏐</div>`;
    const chips = x.allIds.map(id => chip(id, dict.get(id), !x.missing.includes(id))).join('');
    const badge = x.active ? `<span class="badge ok">Activo</span>` : `<span class="badge miss">Falta</span>`;
    const detail = levelText(x);
    const lvlSel = levelSelector(x);

    return `<div class="sinergia-row ${x.active?'is-active':'is-missing'}">
      ${thumb}
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
  try {
    cancelAnimationFrame(raf); raf = 0;

    const mount = document.querySelector(MOUNT);
    if(!mount || !window.FHM_TB) return;

    // Puede devolver [] o { list: [] }
    const rawList = window.FHM_TB?.getSynergies?.();
    const list = Array.isArray(rawList) ? rawList : (rawList && rawList.list ? rawList.list : []);

    // chars puede ser Map / Array / Object
    const rawChars = window.FHM_TB?.state?.chars;
    const dict = (rawChars instanceof Map) ? rawChars
               : (Array.isArray(rawChars)) ? new Map(rawChars.map(ch=>[ch.id, ch]))
               : (rawChars && typeof rawChars==='object') ? new Map(Object.values(rawChars).map(ch=>[ch.id, ch]))
               : new Map();

    // panel/lista
    let panel = mount.querySelector('.sinergias-panel');
    if(!panel){
      mount.insertAdjacentHTML('beforeend', '<div class="sinergias-panel"><div class="sinergias-list"></div></div>');
      panel = mount.querySelector('.sinergias-panel');
    }

    const listEl = panel.querySelector('.sinergias-list');
    const html = list.map(x => row(x, dict)).join('') || '<div class="empty">Ningún vínculo aplicable con la alineación actual.</div>';
    if(listEl) listEl.innerHTML = html;

    // aplicar estado colapsado inmediatamente
    for (const el of panel.querySelectorAll('.sinergia-row.is-collapsed .sinergia-body')) {
      el.style.display = 'none';
    }
  } catch (e) {
    console.error('[sinergias.view] render error:', e);
  }
}
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

    observeFieldAndBench();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init, { once: true });
  } else {
    init();
  }
})();
