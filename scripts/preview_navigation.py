"""Local preview of the existing skin with navigation changes; no external writes."""
import re
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import unquote
from bs4 import BeautifulSoup

ROOT=Path(__file__).resolve().parents[1]
SNAPSHOTS=ROOT/'tmp'/'navigation-audit-20260907'

def preview(html, request_path=''):
    soup=BeautifulSoup(html,'html.parser')
    if 'assistantTest=1' in request_path:
        fixture=soup.new_tag('script',src='/scripts/assistant-preview.js')
        soup.head.insert(0,fixture)
    if 'catalogFailure=1' in request_path:
        failure=soup.new_tag('script')
        failure.string="var realFetch=window.fetch;window.fetch=function(u,o){if(String(u).indexOf('catalog.json')>=0)return Promise.reject(new Error('Simulated catalog outage'));return realFetch.call(this,u,o);};"
        soup.head.insert(0,failure)
    nav=soup.select_one('.custom_cat_tree')
    native=soup.select_one('.header_category .tt_category')
    if nav and native:
        nav.clear()
        label=soup.new_tag('div',attrs={'class':'cat_tree_title'})
        label.string='CATEGORY'
        nav.append(label)
        source=soup.new_tag('div',attrs={'class':'cat_live_source'})
        source.append(BeautifulSoup(str(native),'html.parser'))
        nav.append(source)
    for s in soup.select('script[src]'):
        src=s.get('src','')
        if any(t in src for t in ('googletagmanager','googlesyndication','tistory_admin/userblog','tiara','adsbygoogle','adsense','analytics')):
            s.decompose()
        elif 'blog-ai-index/ai-features.js' in src:
            s['src']='/docs/ai-features.js'
        elif 'blog-ai-index/blog-navigation.js' in src:
            s.decompose()
    for link in soup.select('link[href]'):
        if 'blog-ai-index/blog-navigation.css' in link.get('href',''):link.decompose()
    for s in soup.select('script:not([src])'):
        if any(t in s.get_text() for t in ('adsbygoogle','gtag(', 'window.tiara', "root.classList.add('sd-home-loading')")):s.decompose()
    for link in soup.select('#sd-editorial-css'):link.decompose()
    css=soup.new_tag('link',rel='stylesheet',href='/docs/blog-navigation.css');soup.head.append(css)
    early=(ROOT/'skin'/'editorial-head.html').read_text(encoding='utf-8').replace('https://jonghyun-kim64.github.io/blog-ai-index/','/docs/')
    for element in list(BeautifulSoup(early,'html.parser').contents):soup.head.append(element)
    js=soup.new_tag('script',src='/docs/blog-navigation.js');soup.body.append(js)
    if 'dark=1' in request_path:
        dark=soup.new_tag('script');dark.string="document.documentElement.setAttribute('data-theme','dark');"
        soup.body.append(dark)
    return str(soup)

class Handler(SimpleHTTPRequestHandler):
    def __init__(self,*args,**kwargs):super().__init__(*args,directory=str(ROOT),**kwargs)
    def do_GET(self):
        path=self.path.split('?')[0]
        categories={'/category/반도체 시사':'category-news.html','/category/Verilog & 디지털 설계':'category-rtl.html'}
        fresh=ROOT/'tmp'/'content-audit-20260909'/f'post-{path[1:]}.html'
        numeric = re.fullmatch(r'/[0-9]+', path) and (fresh.exists() or (SNAPSHOTS/f'post-{path[1:]}.html').exists())
        if unquote(path) in categories or path=='/' or numeric:
            src=SNAPSHOTS/(categories.get(unquote(path)) or ('home.html' if path=='/' else f'post-{path[1:]}.html'))
            if path=='/122' and (SNAPSHOTS/'post-122-editorial.html').exists():src=SNAPSHOTS/'post-122-editorial.html'
            if numeric and fresh.exists():src=fresh
            data=preview(src.read_text(encoding='utf-8'), self.path).encode('utf-8')
            self.send_response(200);self.send_header('Content-Type','text/html;charset=utf-8');self.end_headers();self.wfile.write(data)
        elif path in ('/docs/blog-navigation.js','/docs/ai-features.js'):
            data=(ROOT/path.lstrip('/')).read_text(encoding='utf-8').replace('https://jonghyun-kim64.github.io/blog-ai-index/','/docs/').replace('https://blog-ai-qa.jong060479.workers.dev','/__ai-disabled').encode('utf-8')
            self.send_response(200);self.send_header('Content-Type','application/javascript;charset=utf-8');self.end_headers();self.wfile.write(data)
        else:super().do_GET()
    def log_message(self,*args):pass

if __name__=='__main__':
    print('Navigation preview ready: http://127.0.0.1:8768',flush=True)
    ThreadingHTTPServer(('127.0.0.1',8768),Handler).serve_forever()
