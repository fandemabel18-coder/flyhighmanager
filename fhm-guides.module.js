/*! FHMGuides v1.1.0 – módulo independiente */
(function(global){'use strict';const FHMGuides={_loaded:false,_guides:[],_creators:new Map(),_opts:{creatorsUrl:['/data/creators.json','data/creators.json','/creators.json','creators.json'],guidesUrl:['/data/guides.json','data/guides.json','/guides.json','guides.json'],selectors:{homeFeatured:'#recommended-videos',gridVideo:'#video-guides-grid',gridWritten:'#written-guides-grid'},useAutoYouTubeThumb:true,overwriteExisting:true},mergeOptions(o){if(!o)return;if(o.selectors){this._opts.selectors=Object.assign({},this._opts.selectors,o.selectors);delete o.selectors}this._opts=Object.assign({},this._opts,o)},async init(o){if(this._loaded)return;this.mergeOptions(o);await this._loadAll();this.renderAll();this._loaded=true},async _loadAll(){this._creators=await this._loadCreators();this._guides=await this._loadGuides()},async _fetchJSON(u){const r=await fetch(u,{cache:'no-cache'});if(!r.ok)throw new Error('HTTP '+r.status+' fetching '+u);return await r.json()},async _tryMany(arr){for(const u of arr){try{return await this._fetchJSON(u)}catch(e){}}throw new Error('No se pudo cargar desde '+arr.join(', '))},async _loadCreators(){try{const a=await this._tryMany(this._opts.creatorsUrl);return new Map((Array.isArray(a)?a:[]).map(c=>[String(c.id),c]))}catch(e){console.warn('[FHMGuides] creators.json no disponible',e);return new Map()}},async _loadGuides(){try{const a=await this._tryMany(this._opts.guidesUrl);return Array.isArray(a)?a:[]}catch(e){console.warn('[FHMGuides] guides.json no disponible',e);return[]}},youtubeIdFromURL(url){if(!url)return null;try{const u=new URL(url);if(u.hostname.includes('youtu.be')){const id=u.pathname.replace('/','').trim();return id||null}if((u.hostname.includes('youtube.com')||u.hostname.includes('m.youtube.com'))){if(u.searchParams.get('v'))return u.searchParams.get('v');const p=u.pathname.split('/').filter(Boolean);const i=p.indexOf('embed');if(i!==-1&&p[i+1])return p[i+1]}return null}catch(e){return null}},youtubeThumbURL(id,q='hqdefault'){if(!id)return null;return`https://img.youtube.com/vi/${id}/${q}.jpg`},creatorBadgeHTML(id){const c=this._creators.get(String(id));if(!c)return'';const check=c.verified?'✅':'';const name=c.name||id;return`<span class="creator-badge">${name} ${check}</span>`},renderAll(){this.renderHomeFeatured();this.renderGuidesVideo();this.renderGuidesWritten()},_maybeOverwrite(el){if(!el)return false;if(this._opts.overwriteExisting){el.innerHTML='';return true}return el.children.length===0},renderHomeFeatured(){const sel=this._opts.selectors.homeFeatured;const box=typeof sel==='string'?document.querySelector(sel):sel;if(!box)return;const list=this._guides.filter(g=>g.type==='video'&&g.featured);if(!list.length)return;if(!this._maybeOverwrite(box))return;box.innerHTML=list.map(g=>{const y=this.youtubeIdFromURL(g.source_url||'');const auto=(this._opts.useAutoYouTubeThumb&&y)?this.youtubeThumbURL(y,'hqdefault'):null;const thumb=(g.thumbnail&&g.thumbnail.trim())?g.thumbnail:(auto||'assets/placeholder.png');const cr=this.creatorBadgeHTML(g.creator_id);return`<article class="video-card" data-rare="${(rareOf(g)||'').toUpperCase()}"><div class="video-embed"><img src="${thumb}" alt="${g.title}" loading="lazy" decoding="async"></div><div class="video-meta"><div><b>Creador:</b> ${cr||'—'}</div><div><b>Título:</b> ${g.title||''}</div><div style="margin-top:8px"><a class="btn" href="${g.source_url}" target="_blank" rel="noopener">Ver en YouTube</a></div></div></article>`}).join('')},renderGuidesVideo(){const sel=this._opts.selectors.gridVideo;const host=typeof sel==='string'?document.querySelector(sel):sel;if(!host)return;const list=this._guides.filter(g=>g.type==='video');if(!list.length){if(this._maybeOverwrite(host))host.innerHTML='<p class="banner-meta">Aún no hay guías en esta categoría.</p>';return}if(!this._maybeOverwrite(host))return;host.innerHTML=`<div class="video-grid">${list.map(g=>this._cardHTML(g,'video')).join('')}</div>`},renderGuidesWritten(){const sel=this._opts.selectors.gridWritten;const host=typeof sel==='string'?document.querySelector(sel):sel;if(!host)return;const list=this._guides.filter(g=>g.type==='written');if(!list.length){if(this._maybeOverwrite(host))host.innerHTML='<p class="banner-meta">Aún no hay guías en esta categoría.</p>';return}if(!this._maybeOverwrite(host))return;host.innerHTML=`<div class="cards-list">${list.map(g=>this._cardHTML(g,'written')).join('')}</div>`},_cardHTML(g,type){const c=this._creators.get(String(g.creator_id));const cr=c?(c.name+(c.verified?' ✅':'')):(g.creator_id||'');const y=this.youtubeIdFromURL(g.source_url||'');const auto=(this._opts.useAutoYouTubeThumb&&y)?this.youtubeThumbURL(y,'hqdefault'):null;const thumb=(g.thumbnail&&g.thumbnail.trim())?g.thumbnail:(auto||'assets/placeholder.png');const btn=type==='video'?'Ver en YouTube':'Abrir guía';const school=g.school?` · <span>${g.school}</span>`:'';const chips=(g.tags||[]).map(t=>`<span class="chip">#${t}</span>`).join(' ');return`<article class="card"><div class="tile-thumb"><img src="${thumb}" alt="${g.title}" onerror="this.onerror=null;this.src='assets/placeholder.png';" loading="lazy" decoding="async"></div><div class="tile-body"><h4 class="tile-name">${g.title}</h4><div class="tile-meta"><span>${cr}</span>${school}</div><div class="banner-meta">${chips}</div><div style="margin-top:8px"><a class="btn" href="${g.source_url}" target="_blank" rel="noopener">${btn}</a></div></div></article>`}};global.FHMGuides=FHMGuides})(window);


// === FHM PATCH: premium en Home y separación premium/free en pestaña ===
(function(){
  if (!window.FHMGuides) return;
  const M = window.FHMGuides;

  

function rareOf(g){
  // 1) explicit rarity field if present
  if (g && typeof g.rarity === 'string') {
    const r = g.rarity.toUpperCase().trim();
    if (r === 'SP' || r === 'UR') return r;
  }
  // 2) tags array, accept 'SP' or 'UR'
  if (Array.isArray(g?.tags)){
    const t = g.tags.map(x=>String(x).toUpperCase());
    if (t.includes('SP')) return 'SP';
    if (t.includes('UR')) return 'UR';
  }
  // 3) heuristic from title
  const t = (g?.title || '').toUpperCase();
  if (/SP/.test(t)) return 'SP';
  if (/UR/.test(t)) return 'UR';
  return '';
}
function rarityBadgeHTML(r){
  if (!r) return '';
  const icon = r === 'SP' ? '👑' : '✦';
  const cls  = r.toLowerCase();
  return `<span class="rare-badge ${cls}" title="Rareza ${r}">${icon}&nbsp;${r}</span>`;
}
function youtubeIdFromURL(url){
    if(!url) return null;
    try{
      const u = new URL(url);
      if(u.hostname.includes('youtu.be')) return u.pathname.replace('/','').trim() || null;
      const v = u.searchParams.get('v'); if(v) return v;
      const path = u.pathname.split('/').filter(Boolean);
      const i = path.indexOf('embed'); if(i !== -1 && path[i+1]) return path[i+1];
      return null;
    }catch{ return null; }
  }
  function ytThumb(url){
    const id = youtubeIdFromURL(url);
    return id ? `https://img.youtube.com/vi/${id}/hqdefault.jpg` : 'assets/placeholder.png';
  }
  const _thumbOf = (g)=> (g.thumbnail && g.thumbnail.trim()) ? g.thumbnail : ytThumb(g.source_url);

  M.renderHomeFeatured = function(){
    const sel = (M._opts && M._opts.selectors && M._opts.selectors.homeFeatured) || '#recommended-videos';
    const host = typeof sel==='string' ? document.querySelector(sel) : sel;
    if(!host) return;
    const list = (M._guides || []).filter(g => g.type==='video' && g.featured===true);
    if(!list.length){ if(M._maybeOverwrite) M._maybeOverwrite(host); host.innerHTML=''; return; }
    list.sort((a,b)=> String(b.published_at||'').localeCompare(String(a.published_at||'')) );
    const top3 = list.slice(0,3);
    if(M._maybeOverwrite && !M._maybeOverwrite(host)) return;
    host.innerHTML = top3.map(g => {
      const c=(M._creators && M._creators.get)? M._creators.get(String(g.creator_id)) : null;
      const creatorName = c ? c.name + (c.verified ? ' ✅' : '') : (g.creator_id||'Creador');
      const thumb=_thumbOf(g);
      return `<article class="video-card" data-rare="${(rareOf(g)||'').toUpperCase()}">
        <div style="position:relative"><span class="badge">Destacado</span>${rarityBadgeHTML(rareOf(g))}
          <img class="video-thumb" src="${thumb}" alt="${(g.title||'').replace(/"/g,'&quot;')}"
               onerror="this.onerror=null;this.src='assets/placeholder.png'">
        </div>
        <div class="video-body">
          <div class="video-author">${creatorName}</div>
          <h3 class="video-title">${g.title||''}</h3>
          <a class="btn" href="${g.source_url}" target="_blank" rel="noopener">Ver en YouTube</a>
        </div>
      </article>`;
    }).join('');
  };

  M.renderGuidesVideo = function(){
    const sel = (M._opts && M._opts.selectors) || {};
    const hostFeat = document.querySelector(sel.gridVideoFeatured || '#video-guides-featured');
    const hostFree = document.querySelector(sel.gridVideoFree || '#video-guides-free');
    const list = (M._guides || []).filter(g => g.type==='video');

    if(hostFeat){
      const featured = list.filter(v => v.featured===true).slice(0,3);
      if(M._maybeOverwrite && !M._maybeOverwrite(hostFeat)){} else {
        hostFeat.innerHTML = featured.length
          ? featured.map(v=>{
              const c=(M._creators && M._creators.get)? M._creators.get(String(v.creator_id)) : null;
              const creatorName = c ? c.name + (c.verified ? ' ✅' : '') : (v.creator_id||'Creador');
              return `<article class="video-card" data-rare="${(rareOf(v)||'').toUpperCase()}">
                <div style="position:relative"><span class="badge">Destacado</span>${rarityBadgeHTML(rareOf(v))}
                  <img class="video-thumb" src="${_thumbOf(v)}" alt="${(v.title||'').replace(/"/g,'&quot;')}"
                       onerror="this.onerror=null;this.src='assets/placeholder.png'">
                </div>
                <div class="video-body">
                  <div class="video-author">${creatorName}</div>
                  <h3 class="video-title">${v.title||''}</h3>
                  <a class="btn" href="${v.source_url}" target="_blank" rel="noopener">Ver en YouTube</a>
                </div>
              </article>`;
            }).join('')
          : '<p class="banner-meta">Pronto verás aquí Guías Destacadas.</p>';
      }
    }
    if(hostFree){
      const free = list.filter(v => !v.featured);
      if(M._maybeOverwrite && !M._maybeOverwrite(hostFree)){} else {
        hostFree.innerHTML = free.map(v=>{
          const c=(M._creators && M._creators.get)? M._creators.get(String(v.creator_id)) : null;
          const creatorName = c ? c.name + (c.verified ? ' ✅' : '') : (v.creator_id||'Creador');
          return `<article class="video-card small">
            <img class="video-thumb" src="${_thumbOf(v)}" alt="${(v.title||'').replace(/"/g,'&quot;')}"
                 onerror="this.onerror=null;this.src='assets/placeholder.png'">
            <div class="video-body">
              <div class="video-author">${creatorName}</div>
              <h4 class="video-title">${v.title||''}</h4>
              <a class="btn" href="${v.source_url}" target="_blank" rel="noopener">Ver en YouTube</a>
            </div>
          </article>`;
        }).join('');
      }
    }
  };

  const rerender = ()=>{ try{ M.renderHomeFeatured(); M.renderGuidesVideo(); }catch(e){} };
  if (document.readyState === 'complete' || document.readyState === 'interactive') setTimeout(rerender,0);
  else document.addEventListener('DOMContentLoaded', rerender);
})();
// === /FHM PATCH ===
