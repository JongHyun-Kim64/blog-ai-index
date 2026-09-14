/* Local-only preview using the saved public skin. No analytics or AI calls. */
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const base = 'https://jonghyun-kim64.github.io/blog-ai-index/';
const rewrite = source => source.split(base).join('/docs/').replaceAll('https://blog-ai-qa.jong060479.workers.dev', '/__ai-disabled');
function home(url) {
  let html = fs.readFileSync(path.join(root, 'tmp/navigation-audit-20260907/home.html'), 'utf8');
  if (url.searchParams.has('physical')) {
    html = html.replaceAll('<ul class="category_list">', '<ul class="category_list"><li><a class="link_item" href="https://semicon-circuit.tistory.com/category/Physical%20Design">Physical Design <span class="c_cnt">(0)</span></a></li>');
  }
  html = html.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, tag => /googletagmanager|googlesyndication|tistory_admin\/userblog|tiara|adsbygoogle|adsense|analytics|gtag\(|blog-navigation\.js|ai-features\.js|root\.classList\.add\('sd-home-loading'\)/i.test(tag) ? '' : tag);
  html = html.replace(/<link\b[^>]*(?:blog-editorial\.css|blog-navigation\.css)[^>]*>/gi, '');
  const head = rewrite(fs.readFileSync(path.join(root, 'skin/editorial-head.html'), 'utf8'));
  html = html.replace('</head>', head + '<link rel="stylesheet" href="/docs/blog-navigation.css"></head>');
  let setup = '';
  if (url.searchParams.has('dark')) setup += "document.documentElement.setAttribute('data-theme','dark');";
  if (url.searchParams.has('failure')) setup += "const nativeFetch=window.fetch;window.fetch=(u,o)=>String(u).includes('catalog.json')?Promise.reject(new Error('Preview outage')):nativeFetch(u,o);";
  if (url.searchParams.has('count')) {
    const count = Math.max(0, Math.min(5, Number(url.searchParams.get('count')) || 0));
    setup += `const nativeFetch=window.fetch;window.fetch=(u,o)=>String(u).includes('catalog.json')?nativeFetch(u,o).then(r=>r.json()).then(c=>({ok:true,json:()=>Promise.resolve({...c,posts:c.posts.slice(0,${count})})})):nativeFetch(u,o);`;
  }
  return rewrite(html.replace('</body>', `<script>${setup}</script><script src="/docs/blog-navigation.js"></script></body>`));
}
http.createServer((req, res) => {
  const url = new URL(req.url, 'http://127.0.0.1');
  try {
    let content, type;
    if (url.pathname === '/') { content = home(url); type = 'text/html;charset=utf-8'; }
    else {
      const file = path.resolve(root, '.' + decodeURIComponent(url.pathname));
      if (!file.startsWith(root + path.sep)) { res.writeHead(403).end(); return; }
      type = ({'.css':'text/css','.js':'application/javascript','.json':'application/json','.html':'text/html'})[path.extname(file)];
      if (type) content = rewrite(fs.readFileSync(file, 'utf8')); else content = fs.readFileSync(file);
    }
    res.writeHead(200, {'Content-Type': type || 'application/octet-stream', 'Cache-Control':'no-store'}); res.end(content);
  } catch (e) { res.writeHead(404).end('Not found'); }
}).listen(8772, '127.0.0.1', () => console.log('LATEST preview: http://127.0.0.1:8772/'));
