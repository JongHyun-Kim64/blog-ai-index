/* Public-page navigation; no model requests, page overlays, or automatic navigation. */
(function (root, factory) {
  "use strict";
  var api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  else api.start(root.document);
})(typeof window !== "undefined" ? window : this, function () {
  "use strict";
  var BASE = "https://semicon-circuit.tistory.com";
  var CATALOG = "https://jonghyun-kim64.github.io/blog-ai-index/catalog.json";
  var PATHS = [
    {name:"AI 반도체 · 연산과 메모리", primary:[112,123,124], ids:[112,123,124,113,116], labels:["AI 반도체 개요","HBM과 Memory Wall","LLM Inference","Systolic Array","Tiling과 Buffer"]},
    {name:"Systolic Array · 구조와 신뢰성", ids:[113,114,115,116,117,118,119,120,121,122], labels:["구조","Workload","Dataflow","메모리 최적화","설계 과제","STRAIT","BIST","Diagnosis","BISR","XOR Parity"]},
    {name:"UART · 개념에서 RTL 구현까지", ids:[98,95,96,97], labels:["UART 개요","Baud Rate","TX 설계","RX 설계"]},
    {name:"FPGA 프로젝트 · 하드웨어에서 게임 구현까지", ids:[104,105,106,107,108,109,110,111], labels:["환경 구축","7-Segment","Stopwatch","Keypad","Calculator","게임 구조","OLED","게임 로직"]}
  ];
  function pathKey(value) { try { return decodeURIComponent(new URL(value, BASE).pathname).replace(/\/$/, ""); } catch (e) { return ""; } }
  function tokens(value) { return String(value || "").toLowerCase().match(/[a-z][a-z0-9]+|[가-힣]{2,}/g) || []; }
  function seriesFor(id, byId) {
    var path = PATHS.find(function(p){ return (p.primary || p.ids).indexOf(id) >= 0; });
    if (!path) return null;
    return {name:path.name, entries:path.ids.map(function(pid,i){return byId[pid] ? {post:byId[pid], label:path.labels[i]} : null;}).filter(Boolean)};
  }
  function recommend(current, posts, limit) {
    var byId = {}; posts.forEach(function(p){byId[p.id]=p;});
    var series = seriesFor(current.id, byId);
    var next = null, currentPosition = -1;
    if (series) { currentPosition=series.entries.findIndex(function(e){return e.post.id===current.id;}); next=series.entries[currentPosition+1]; }
    var wanted = new Set(tokens(current.title+" "+(current.tags || []).join(" ")));
    return posts.filter(function(p){return p.id!==current.id && p.title && /^https:\/\/semicon-circuit\.tistory\.com\/\d+$/.test(p.url);})
      .map(function(p){
        var overlap=new Set(tokens(p.title+" "+(p.tags || []).join(" ")));
        var score=0; overlap.forEach(function(t){if(wanted.has(t)) score+=2;});
        var same=p.categoryPath && p.categoryPath===current.categoryPath;
        if(same) score+=4;
        var inSeries=series && series.entries.some(function(e){return e.post.id===p.id;});
        if(inSeries) score+=6;
        if(inSeries){var position=series.entries.findIndex(function(e){return e.post.id===p.id;});score+=12/Math.max(1,Math.abs(position-currentPosition));if(position>currentPosition)score+=10;}
        var isNext=next && next.post.id===p.id;
        if(isNext) score+=100;
        return {post:p,score:score,label:isNext?"다음 단계":inSeries?"같은 읽기 흐름":same?"같은 주제 더 보기":"연결해서 읽기"};
      }).sort(function(a,b){return b.score-a.score || b.post.id-a.post.id;}).slice(0,limit || 3);
  }
  function node(tag, cls, text) { var e=document.createElement(tag); if(cls)e.className=cls; if(text)e.textContent=text; return e; }
  function categoryLink(source) {
    var a=node("a"); a.href=source.getAttribute("href");
    var count=source.querySelector(".c_cnt");
    var copy=source.cloneNode(true); copy.querySelectorAll(".c_cnt,img").forEach(function(n){n.remove();});
    a.appendChild(node("span","cat_name",copy.textContent.trim()));
    if(count) a.appendChild(node("span","cat_cnt",count.textContent.replace(/[()]/g,"").trim()));
    if(pathKey(a.href)===pathKey(location.href))a.setAttribute("aria-current","page");
    return a;
  }
  function syncCategories(doc) {
    doc.querySelectorAll(".custom_cat_tree").forEach(function(nav){
      var source=nav.querySelector(".cat_live_source");
      if(source){
        var parents=source.querySelectorAll(".category_list > li");
        if(!parents.length)return;
        var list=node("ul","cat_root");
        var home=node("li","cat_home"); var homeLink=node("a","","홈");homeLink.href="/";home.appendChild(homeLink);list.appendChild(home);
        var all=source.querySelector(".link_tit");
        if(all){var allLi=node("li","cat_home");var allLink=categoryLink(all);allLink.querySelector('.cat_name').textContent="전체보기";allLi.appendChild(allLink);list.appendChild(allLi);}
        Array.from(parents).forEach(function(parent){
          var src=parent.querySelector(":scope > .link_item");if(!src)return;
          var li=node("li");var a=categoryLink(src);var children=parent.querySelectorAll(".sub_category_list > li > a");
          if(children.length){
            li.className="has_children";a.className="cat_parent_link";
            var details=node("details"), summary=node("summary");
            summary.appendChild(a); var arrow=node("span","cat_toggle");arrow.setAttribute("aria-hidden","true");arrow.appendChild(node("span","cat_chevron"));summary.appendChild(arrow);
            var sub=node("ul","cat_children");children.forEach(function(c){var child=node("li");var link=categoryLink(c);if(link.hasAttribute('aria-current'))details.open=true;child.appendChild(link);sub.appendChild(child);});
            if(a.hasAttribute('aria-current'))details.open=true;
            details.appendChild(summary);details.appendChild(sub);li.appendChild(details);
          }else li.appendChild(a);
          list.appendChild(li);
        });
        var old=nav.querySelector(":scope > .cat_root");if(old)old.remove();nav.appendChild(list);source.hidden=true;
      }else{
        // Compatibility for a previously saved skin while the HTML update propagates.
        var counts={};doc.querySelectorAll(".header_category a").forEach(function(a){var c=a.querySelector('.c_cnt');if(c)counts[pathKey(a.href)]=c.textContent.replace(/[()]/g,"").trim();});
        nav.querySelectorAll("a .cat_cnt").forEach(function(c){var n=counts[pathKey(c.parentElement.href)];if(n!==undefined)c.textContent=n;else c.hidden=true;});
      }
    });
  }
  function track(link, placement, from, to) {
    link.addEventListener("click",function(){
      if(typeof window.gtag==="function")window.gtag("event","internal_article_click",{placement:placement,from_post:String(from),to_post:String(to)});
    });
  }
  function render(doc, catalog) {
    var posts=(catalog.posts || []).filter(function(p){return p && Number.isInteger(p.id) && p.title && p.url===BASE+"/"+p.id;});
    var byId={};posts.forEach(function(p){byId[p.id]=p;});
    var canonical=doc.querySelector('link[rel="canonical"]');
    var match=pathKey(canonical ? canonical.href : location.href).match(/^\/(\d+)$/);
    if(!match)return;
    var id=Number(match[1]),current=byId[id];
    var article=doc.querySelector(".tt_article_useless_p_margin, .contents_style");
    if(!current || !article)return;
    var series=seriesFor(id,byId);
    if(series && series.entries.length>1 && !doc.querySelector('.reading-path')){
      var nav=node('nav','reading-navigation reading-path');nav.setAttribute('aria-label','시리즈 읽는 순서');
      var details=node('details'),summary=node('summary');
      var step=series.entries.findIndex(function(e){return e.post.id===id;})+1;
      summary.appendChild(node('span','reading-path-title',series.name+' · '+step+'/'+series.entries.length));
      details.appendChild(summary);var ol=node('ol');
      series.entries.forEach(function(e,i){
        var li=node('li'),a=node(e.post.id===id?'span':'a',e.post.id===id?'reading-current':'',(i+1)+'. '+e.label);
        if(e.post.id===id)a.setAttribute('aria-current','step');else{a.href=e.post.url;a.title=e.post.title;track(a,'reading_path',id,e.post.id);}
        li.appendChild(a);ol.appendChild(li);
      });details.appendChild(ol);nav.appendChild(details);article.parentNode.insertBefore(nav,article);
    }
    var panel=doc.querySelector('#tab-related');var picks=recommend(current,posts,3);
    if(!panel || !picks.length || panel.querySelector('.reading-next'))return;
    var section=node('section','reading-navigation reading-next');section.setAttribute('aria-label','이어서 읽기');
    var head=node('div','reading-next-head');head.appendChild(node('h3','','이어서 읽기'));
    if(current.categoryPath && current.categoryPath.indexOf('/category/')===0){var more=node('a','','주제 전체 보기 →');more.href=BASE+current.categoryPath;head.appendChild(more);}
    section.appendChild(head);var grid=node('div','reading-next-grid');
    picks.forEach(function(r){var p=r.post,a=node('a','reading-next-card');a.href=p.url;a.title=p.title;
      a.appendChild(node('span','reading-next-label',r.label));a.appendChild(node('strong','',p.title));
      a.appendChild(node('span','reading-next-desc',p.excerpt));
      var meta=node('span','reading-next-meta');meta.appendChild(node('span','',p.minutes+'분 읽기'));meta.appendChild(node('span','','읽어보기 →'));a.appendChild(meta);
      track(a,'article_end',id,p.id);grid.appendChild(a);
    });section.appendChild(grid);
    var original=panel.querySelector('.related-list');if(original)original.hidden=true;
    var category=panel.querySelector('.current-category-name');if(category)category.hidden=true;
    var empty=panel.querySelector('.empty-notice');if(empty)empty.hidden=true;
    panel.appendChild(section);
    var wrap=panel.closest('.post-recommend-wrap'),tab=wrap && wrap.querySelector('[data-tab="related"]');
    if(tab){
      tab.textContent='추천 글';tab.classList.remove('tab-disabled');
      wrap.querySelectorAll('.tab-btn,.tab-panel').forEach(function(e){e.classList.remove('active');});
      tab.classList.add('active');panel.classList.add('active');
    }
    doc.querySelectorAll('#tab-popular .related-list li').forEach(function(li){var a=li.querySelector('a');if(a && pathKey(a.href)==='/'+id)li.remove();});
  }
  function start(doc) {
    function init(){
      syncCategories(doc);
      var isArticle=!!doc.querySelector('.tt_article_useless_p_margin, .contents_style');
      var isHome=doc.body.id==='tt-body-index' && location.pathname==='/' && !new URLSearchParams(location.search).has('page');
      if(!isArticle && !isHome)return;
      fetch(CATALOG,{cache:'no-cache'}).then(function(r){if(!r.ok)throw new Error(r.status);return r.json();})
        .then(function(data){
          if(isArticle)render(doc,data);
          if(!doc.getElementById('sd-editorial-loader')){
            var css=doc.createElement('link');css.rel='stylesheet';css.href='https://jonghyun-kim64.github.io/blog-ai-index/blog-editorial.css?v=20260909-1';
            var cssReady=new Promise(function(resolve,reject){css.onload=resolve;css.onerror=reject;});
            doc.head.appendChild(css);
            var script=doc.createElement('script');script.id='sd-editorial-loader';script.src='https://jonghyun-kim64.github.io/blog-ai-index/blog-editorial.js?v=20260909-1';
            var jsReady=new Promise(function(resolve,reject){script.onload=resolve;script.onerror=reject;});
            doc.body.appendChild(script);
            Promise.all([cssReady,jsReady]).then(function(){if(window.SemiconductorEditorial)window.SemiconductorEditorial.start(doc,data);}).catch(function(){/* Preserve the original homepage if either asset fails. */});
          }
        }).catch(function(){/* Native related links remain available. */});
    }
    if(doc.readyState==='loading')doc.addEventListener('DOMContentLoaded',init);else init();
  }
  return {start:start,render:render,syncCategories:syncCategories,recommend:recommend,seriesFor:seriesFor,pathKey:pathKey};
});
