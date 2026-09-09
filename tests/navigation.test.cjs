const assert = require('node:assert/strict');
const fs = require('node:fs');
const nav = require('../skin/blog-navigation.js');
const catalog = JSON.parse(fs.readFileSync('docs/catalog.json', 'utf8'));
const posts = catalog.posts;
const byId = Object.fromEntries(posts.map(p => [p.id, p]));
assert(posts.length > 0);
assert.equal(new Set(posts.map(p => p.id)).size, posts.length);
assert(posts.every(p => p.category && p.categoryPath.startsWith('/category/')));
assert.equal(nav.pathKey('/category/ARM%20%26%20RTOS/'), '/category/ARM & RTOS');
for (const post of posts) {
  const selected = nav.recommend(post, posts, 3);
  assert.equal(selected.length, 3);
  assert.equal(new Set(selected.map(r => r.post.id)).size, 3);
  for (const r of selected) {
    assert.notEqual(r.post.id, post.id);
    assert(byId[r.post.id]);
    assert.equal(r.post.url, 'https://semicon-circuit.tistory.com/' + r.post.id);
  }
}
for (const [from,to] of [[112,123],[123,124],[124,113],[95,96],[96,97],[118,119],[121,122]]) {
  assert.equal(nav.recommend(byId[from], posts)[0].post.id, to);
}
const malicious = {id:900,title:'LLM Inference',url:'javascript:alert(1)',categoryPath:byId[124].categoryPath};
assert(!nav.recommend(byId[124],[...posts,malicious]).some(r=>r.post.id===900));
assert(!nav.seriesFor(121,Object.fromEntries(posts.filter(p=>p.id!==122).map(p=>[p.id,p]))).entries.some(e=>e.post.id===122));
const nativePopular=[{url:'/103',title:'old title'},{url:'/119?category=1',title:'old'},{url:'/80',title:'self'},{url:'/103',title:'duplicate'},{url:'https://evil.example/27',title:'external'},{url:'javascript:alert(1)',title:'script'},{url:'/manage/80',title:'private'}];
assert.deepEqual(nav.popularPosts(nativePopular,80,posts).map(p=>p.id),[103,119]);
assert.equal(nav.popularPosts(nativePopular,80,posts)[0].title,byId[103].title);
assert.deepEqual(nav.popularPosts([],80,posts),[]);
assert.equal(nav.popularPosts([{url:'/999',title:'New public post'}],80,posts)[0].title,'New public post');
assert.deepEqual(nav.popularPosts([{url:'/999',title:''}],80,posts),[]);
assert.equal(fs.readFileSync('skin/blog-navigation.js','utf8'),fs.readFileSync('docs/blog-navigation.js','utf8'));
assert.equal(fs.readFileSync('skin/blog-navigation.css','utf8'),fs.readFileSync('docs/blog-navigation.css','utf8'));
console.log(`PASS: ${posts.length} public articles: unique non-self recommendations, series order, safe URLs`);
