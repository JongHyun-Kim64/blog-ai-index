const assert = require('node:assert/strict');
const fs = require('node:fs');
const api = require('../skin/blog-editorial.js');
const catalog = require('../docs/catalog.json');
const latest = api.latestPosts(catalog);
assert.deepEqual(latest.map(p=>p.id),[124,123,122,121,120]);
assert.equal(api.latestPosts({posts:[...catalog.posts].reverse()})[0].id,124);
assert.deepEqual(api.latestPosts({posts:[]}),[]);
assert.equal(api.latestPosts({posts:[latest[0],latest[0],{...latest[1],url:'javascript:alert(1)'}]}).length,1);
assert.equal(api.latestPosts({posts:latest.slice(0,2)}).length,2);
assert.equal(api.latestPosts({posts:[{...latest[0],id:125,url:'https://semicon-circuit.tistory.com/125',date:'2026-09-14'},...latest]})[0].id,125);
assert.equal(api.slideIndex(-1,5),4);assert.equal(api.slideIndex(5,5),0);assert.equal(api.slideIndex(0,0),0);
function fixture(posts=latest,reduce=false) {
  const timers=new Map();let seq=0,resize;
  const doc={activeElement:null,querySelectorAll:()=>[]};
  class Node {
    constructor(tag){this.tagName=tag.toUpperCase();this.children=[];this.attrs={};this.events={};this.clientWidth=800;this.scrollLeft=0;this.classList={add:()=>{}};}
    appendChild(e){this.children.push(e);e.parentNode=this;return e;}
    setAttribute(k,v){this.attrs[k]=String(v);}
    removeAttribute(k){delete this.attrs[k];}
    addEventListener(k,f){this.events[k]=f;}
    contains(e){return e===this || this.children.some(c=>c.contains(e));}
    focus(){doc.activeElement=this;}
    scrollTo(o){this.lastScroll=o;this.scrollLeft=o.left;this.events.scroll?.();}
  }
  doc.createElement=tag=>new Node(tag);
  const view={matchMedia:()=>({matches:reduce}),setTimeout:f=>{timers.set(++seq,f);return seq;},clearTimeout:id=>timers.delete(id),ResizeObserver:class{constructor(f){resize=f;}observe(){}}};
  doc.defaultView=view;
  const root=api.buildLatest(doc,posts),all=[];
  function visit(e){all.push(e);e.children.forEach(visit);}if(root)visit(root);
  const nodes=cls=>all.filter(e=>e.className===cls);
  const track=nodes('sd-latest-track')[0],slides=nodes('sd-latest-slide'),pages=nodes('sd-latest-page'),links=nodes('sd-lead');
  const click=label=>all.find(e=>e.attrs['aria-label']===label).events.click();
  const key=value=>root.events.keydown({key:value,preventDefault(){}});
  const flush=()=>{const pending=[...timers.values()];timers.clear();pending.forEach(f=>f());};
  return {root,doc,track,slides,pages,links,nodes,click,key,flush,resize:()=>resize(),counter:()=>nodes('sd-latest-count')[0].textContent};
}
assert.equal(fixture([]).root,null);
const f=fixture();assert.equal(f.slides.length,5);assert.equal(f.counter(),'01 / 05');
assert.equal(f.slides.filter(s=>!s.inert).length,1);assert.equal(f.links.filter(a=>a.tabIndex===0).length,1);
assert.equal(f.nodes('sd-latest-status')[0].textContent,undefined);
f.click('다음 최신 글');f.flush();assert.equal(f.counter(),'02 / 05');assert.equal(f.track.lastScroll.behavior,'smooth');
f.key('End');f.flush();assert.equal(f.counter(),'05 / 05');
f.click('다음 최신 글');f.flush();assert.equal(f.counter(),'01 / 05');
f.click('이전 최신 글');f.flush();assert.equal(f.counter(),'05 / 05');
f.pages[2].events.click();f.flush();assert.equal(f.counter(),'03 / 05');
assert.equal(f.pages.filter(b=>b.attrs['aria-current']==='true').length,1);
f.doc.activeElement=f.links[2];f.key('ArrowRight');f.flush();assert.equal(f.doc.activeElement,f.links[3]);
assert.equal(f.links[2].tabIndex,-1);assert.equal(f.slides[2].attrs['aria-hidden'],'true');
f.track.scrollLeft=800;f.track.events.scroll();f.flush();assert.equal(f.counter(),'02 / 05');
f.track.clientWidth=335;f.resize();f.flush();assert.equal(f.track.scrollLeft,335);assert.equal(f.counter(),'02 / 05');
const reduced=fixture(latest,true);reduced.click('다음 최신 글');assert.equal(reduced.track.lastScroll.behavior,'auto');
const single=fixture(latest.slice(0,1));assert.equal(single.nodes('sd-latest-controls')[0].hidden,true);assert.equal(single.counter(),'01 / 01');
const css=fs.readFileSync('skin/blog-editorial.css','utf8');assert(css.includes('scroll-snap-type:x mandatory'));assert(css.includes('.sd-latest .sd-lead{height:100%;border:0}'));
for(const name of ['blog-editorial.js','blog-editorial.css','blog-navigation.js'])assert.equal(fs.readFileSync('skin/'+name,'utf8'),fs.readFileSync('docs/'+name,'utf8'));
console.log('PASS: latest five, public/deduped/sorted posts, wraparound, buttons, keyboard, focus, native scroll, resize, reduced motion, single/empty fallback and mirrored assets');
