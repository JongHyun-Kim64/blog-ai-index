"""Public article metadata for navigation. No AI API calls or private endpoints."""
import argparse
import concurrent.futures
import json
import math
import re
from datetime import datetime, timezone
from pathlib import Path
from urllib.parse import urlparse, unquote
from urllib.request import Request, urlopen
from bs4 import BeautifulSoup

BLOG = "https://semicon-circuit.tistory.com"
CATALOG_VERSION = 3

def download(url):
    with urlopen(Request(url, headers={"User-Agent": "Mozilla/5.0 (compatible; blog-navigation/1.0)"}), timeout=30) as r:
        return r.read().decode("utf-8")

def parse_post(html, pid, lastmod=""):
    soup = BeautifulSoup(html, "html.parser")
    body = soup.select_one(".tt_article_useless_p_margin, .contents_style")
    if body is None:
        return None
    def meta(name):
        node = soup.find("meta", property=name) or soup.find("meta", attrs={"name": name})
        return node.get("content", "").strip() if node else ""
    category = soup.select_one(".current-category-name a, .category a, a.category, .category_label")
    for node in body.select("script, style, .revenue_unit_wrap, .container_postbtn, .another_category, pre, figure"):
        node.decompose()
    text = re.sub(r"\s+", " ", body.get_text(" ", strip=True))
    paragraphs = []
    for paragraph in body.select("p"):
        # An introductory paragraph may also contain an adjacent "previous post" link.
        # Removing that link must not discard the entire introduction.
        clean = BeautifulSoup(str(paragraph), "html.parser")
        for link in clean.select("a"):
            link.decompose()
        candidate = re.sub(r"[\u200b-\u200d\ufeff]", "", clean.get_text(" ", strip=True))
        candidate = re.split(r"(?:이전 글|다음 글|관련 글)\s*[:：]", candidate)[0].strip()
        if candidate.startswith("이전 글에서는") and "이번 글에서는" in candidate:
            candidate = candidate[candidate.index("이번 글에서는"):]
        if len(candidate) > 45:
            paragraphs.append(candidate)
    excerpt = re.sub(r"\s+", " ", paragraphs[0] if paragraphs else text)
    if len(excerpt) > 160:
        head = excerpt[:160]
        excerpt = (head.rsplit(" ", 1)[0] if " " in head else head).rstrip(" ,;:") + "…"
    return {"id": int(pid), "url": BLOG + "/" + str(pid), "title": meta("og:title"),
            "category": category.get_text(" ", strip=True) if category else "",
            "categoryPath": unquote(urlparse(category.get("href", "")).path) if category else "",
            "date": meta("article:published_time")[:10], "lastmod": lastmod,
            "minutes": max(1, math.ceil(len(text) / 650)), "excerpt": excerpt,
            "tags": list(dict.fromkeys(a.get_text(strip=True) for a in soup.select(".area_tag a[href*='/tag/']")))[:12]}

def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--out", default="docs/catalog.json")
    parser.add_argument("--snapshots", type=Path)
    args = parser.parse_args()
    target = Path(args.out)
    old = json.loads(target.read_text(encoding="utf-8")) if target.exists() else {}
    cached = {p["id"]: p for p in old.get("posts", [])}
    sitemap = BeautifulSoup(download(BLOG + "/sitemap.xml"), "xml")
    entries = []
    for node in sitemap.find_all("url"):
        loc = node.find("loc")
        if not loc or urlparse(loc.text).netloc != urlparse(BLOG).netloc:
            continue
        match = re.fullmatch(r"/(\d+)", urlparse(loc.text).path)
        if match:
            modified = node.find("lastmod")
            entries.append((int(match[1]), modified.text if modified else ""))
    if not entries:
        raise RuntimeError("No public article URLs in sitemap; previous catalog retained")
    def get(entry):
        pid, modified = entry
        if old.get("version") == CATALOG_VERSION and not args.snapshots and modified and cached.get(pid, {}).get("lastmod") == modified:
            return cached[pid]
        snapshot = args.snapshots / f"post-{pid}.html" if args.snapshots else None
        html = snapshot.read_text(encoding="utf-8") if snapshot and snapshot.exists() else download(BLOG + "/" + str(pid))
        return parse_post(html, pid, modified)
    # Fail the whole build on a network error, retaining the previous complete file.
    with concurrent.futures.ThreadPoolExecutor(max_workers=4) as pool:
        posts = [p for p in pool.map(get, entries) if p]
    posts.sort(key=lambda p: p["id"], reverse=True)
    if old.get("version") == CATALOG_VERSION and posts == old.get("posts"):
        print(f"Navigation catalog unchanged ({len(posts)} public articles)")
        return
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_text(json.dumps({"version": CATALOG_VERSION, "generated": datetime.now(timezone.utc).isoformat(), "posts": posts},
                                 ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    print(f"Navigation catalog: {len(posts)} public articles")

if __name__ == "__main__":
    main()
