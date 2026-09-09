"""Read-only public-page audit, with reusable snapshots for UI regression checks."""
import concurrent.futures
import argparse
import json
import re
from collections import Counter
from datetime import datetime, timezone
from pathlib import Path
from urllib.parse import unquote, urljoin, urlparse
from urllib.request import Request, urlopen
from bs4 import BeautifulSoup

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "tmp" / "navigation-audit-20260907"
BASE = "https://semicon-circuit.tistory.com"

def fetch(path):
    req = Request(urljoin(BASE, path), headers={"User-Agent": "Mozilla/5.0 (compatible; blog-public-audit/1.0)"})
    with urlopen(req, timeout=30) as response:
        return response.read().decode("utf-8")

def category_rows(soup, selector):
    rows = []
    for a in soup.select(selector):
        count = a.select_one(".c_cnt, .cat_cnt")
        if count is None:
            continue
        num = re.search(r"\d+", count.get_text())
        rows.append({"path": unquote(urlparse(a.get("href", "")).path).rstrip("/"),
                     "count": int(num[0]) if num else None,
                     "label": a.get_text(" ", strip=True)})
    return rows

def inspect(url):
    pid = int(url.rstrip("/").split("/")[-1])
    try:
        html = fetch(url)
        (OUT / f"post-{pid}.html").write_text(html, encoding="utf-8")
        s = BeautifulSoup(html, "html.parser")
        body = s.select_one(".tt_article_useless_p_margin, .contents_style")
        title = s.select_one('meta[property="og:title"]')
        category = s.select_one('.current-category-name a, .category a, a.category, .category_label')
        links = sorted(set(urljoin(BASE, a.get("href", "")).split("#")[0].split("?")[0]
                           for a in (body.select("a[href]") if body else [])
                           if urlparse(urljoin(BASE, a.get("href", ""))).netloc == urlparse(BASE).netloc))
        imgs = body.select("img") if body else []
        return {"id": pid, "title": title.get("content", "") if title else "", "url": url,
                "body_found": body is not None,
                "category": category.get_text(" ", strip=True) if category else "",
                "category_path": unquote(urlparse(category.get("href", "")).path) if category else "",
                "descriptions": len(s.select('meta[name="description"]')),
                "canonical": [a.get("href") for a in s.select('link[rel="canonical"]')],
                "images": len(imgs), "missing_alt": sum(not im.get("alt", "").strip() for im in imgs),
                "internal_links": links,
                "native_categories": category_rows(s, ".header_category a"),
                "sidebar_categories": category_rows(s, ".custom_cat_tree a")}
    except Exception as e:
        return {"id": pid, "url": url, "error": str(e)}

def main():
    global OUT
    parser = argparse.ArgumentParser()
    parser.add_argument('--output', type=Path, default=OUT)
    args = parser.parse_args()
    OUT = args.output.resolve()
    OUT.mkdir(parents=True, exist_ok=True)
    homepage = fetch("/")
    (OUT / "home.html").write_text(homepage, encoding="utf-8")
    sm = BeautifulSoup(fetch("/sitemap.xml"), "xml")
    urls = sorted({n.text for n in sm.find_all("loc") if re.fullmatch(r"/\d+", urlparse(n.text).path)})
    with concurrent.futures.ThreadPoolExecutor(max_workers=4) as pool:
        rows = list(pool.map(inspect, urls))
    rows.sort(key=lambda x: x["id"], reverse=True)
    native = category_rows(BeautifulSoup(homepage, "html.parser"), ".header_category a")
    custom = category_rows(BeautifulSoup(homepage, "html.parser"), ".custom_cat_tree a")
    counts = {n["path"]: n["count"] for n in native}
    mismatches = [{**n, "actual": counts.get(n["path"])} for n in custom if n["count"] != counts.get(n["path"])]
    public = set(urls)
    report = {"checked_at": datetime.now(timezone.utc).isoformat(), "public_posts": len(urls),
              "sidebar_mismatches": mismatches, "native_categories": native,
              "category_histogram": dict(Counter(r.get("category", "") for r in rows)),
              "crawl_failures": [r for r in rows if r.get("error")],
              "multiple_description_posts": [r["id"] for r in rows if r.get("descriptions", 0)>1],
              "internal_targets_outside_sitemap": sorted({u for r in rows for u in r.get("internal_links", [])
                  if re.fullmatch(r"/\d+", urlparse(u).path) and u not in public}), "posts": rows}
    (OUT / "audit.json").write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8")
    print(json.dumps({k:v for k,v in report.items() if k!="posts"},ensure_ascii=False,indent=2))

if __name__ == "__main__":
    main()
