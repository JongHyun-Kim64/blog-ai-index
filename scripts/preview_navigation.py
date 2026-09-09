"""Local preview of the existing skin with navigation changes; no external writes."""
import re
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from bs4 import BeautifulSoup

ROOT=Path(__file__).resolve().parents[1]
SNAPSHOTS=ROOT/'tmp'/'navigation-audit-20260907'

def preview(html):
    soup=BeautifulSoup(html,'html.parser')
    if 'catalogFailure=1' in CURRENT_PATH[0]:
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
    for s in soup.select('script:not([src])'):
        if any(t in s.get_text() for t in ('adsbygoogle','gtag(', 'window.tiara')):s.decompose()
    css=soup.new_tag('link',rel='stylesheet',href='/docs/blog-navigation.css');soup.head.append(css)
    js=soup.new_tag('script',src='/docs/blog-navigation.js');soup.body.append(js)
    if 'dark=1' in CURRENT_PATH[0]:
        dark=soup.new_tag('script');dark.string="document.documentElement.setAttribute('data-theme','dark');"
        soup.body.append(dark)
    return str(soup)

CURRENT_PATH=['']
class Handler(SimpleHTTPRequestHandler):
    def __init__(self,*args,**kwargs):super().__init__(*args,directory=str(ROOT),**kwargs)
    def do_GET(self):
        path=self.path.split('?')[0]
        if path in ('/','/124','/123','/122','/96','/113','/103','/12','/2','/71','/119'):
            CURRENT_PATH[0]=self.path
            src=SNAPSHOTS/('home.html' if path=='/' else f'post-{path[1:]}.html')
            data=preview(src.read_text(encoding='utf-8')).encode('utf-8')
            self.send_response(200);self.send_header('Content-Type','text/html;charset=utf-8');self.end_headers();self.wfile.write(data)
        elif path in ('/docs/blog-navigation.js','/docs/ai-features.js'):
            data=(ROOT/path.lstrip('/')).read_text(encoding='utf-8').replace('https://jonghyun-kim64.github.io/blog-ai-index/','/docs/').encode('utf-8')
            self.send_response(200);self.send_header('Content-Type','application/javascript;charset=utf-8');self.end_headers();self.wfile.write(data)
        else:super().do_GET()
    def log_message(self,*args):pass

if __name__=='__main__':
    print('Navigation preview ready: http://127.0.0.1:8768',flush=True)
    ThreadingHTTPServer(('127.0.0.1',8768),Handler).serve_forever()
