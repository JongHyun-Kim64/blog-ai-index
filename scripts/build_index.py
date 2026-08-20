#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
티스토리 블로그 AI 인덱스 생성기
================================
사이트맵에서 글 목록을 수집하고, 각 글의 요약/키워드/관련 글을 계산해
정적 JSON 인덱스(docs/index.json)를 만듭니다.

- GEMINI_API_KEY 환경변수가 있으면: Gemini 무료 티어로 요약 + 임베딩 생성 (권장, 품질 높음)
- 없으면: 추출식 요약 + TF-IDF 유사도로 동작 (완전 오프라인, 품질 보통)

이미 인덱싱된 글은 건너뛰므로(증분 업데이트) 재실행 비용이 거의 없습니다.

사용법:
    export GEMINI_API_KEY=...   # 선택사항
    python3 build_index.py --blog https://semicon-circuit.tistory.com --out ../docs/index.json
"""

import argparse
import json
import math
import os
import re
import sys
import time
import unicodedata
from collections import Counter
from urllib.parse import urlparse

import requests
from bs4 import BeautifulSoup

UA = {"User-Agent": "Mozilla/5.0 (compatible; blog-ai-indexer/1.0)"}
GEMINI_KEY = os.environ.get("GEMINI_API_KEY", "").strip()
# 모델은 후보 목록(쉼표 구분) — 404(미제공/폐기)면 다음 후보로 자동 폴백.
# '-latest' 별칭을 앞에 둬서 구글이 세대 교체해도 코드 수정 없이 따라가게 함.
GEMINI_TEXT_MODELS = [m.strip() for m in os.environ.get(
    "GEMINI_TEXT_MODEL",
    "gemini-flash-lite-latest,gemini-flash-latest,gemini-2.5-flash,gemini-3-flash-preview"
).split(",") if m.strip()]
GEMINI_EMBED_MODELS = [m.strip() for m in os.environ.get(
    "GEMINI_EMBED_MODEL",
    "gemini-embedding-001,text-embedding-004"
).split(",") if m.strip()]
GEMINI_BASE = "https://generativelanguage.googleapis.com/v1beta"

# 무료 티어 보호용: 호출 간 대기 (초). 429가 나면 자동으로 더 기다립니다.
API_DELAY = float(os.environ.get("API_DELAY", "4.5"))
CHUNK_TARGET_CHARS = int(os.environ.get("CHUNK_TARGET_CHARS", "900"))
MAX_CHUNKS_PER_POST = int(os.environ.get("MAX_CHUNKS_PER_POST", "12"))


# ---------------------------------------------------------------- 수집

def get_post_urls(blog_url):
    """사이트맵에서 글 URL(숫자 ID) 목록을 수집. 모바일/카테고리/태그 페이지는 제외."""
    sm_url = blog_url.rstrip("/") + "/sitemap.xml"
    r = requests.get(sm_url, headers=UA, timeout=20)
    r.raise_for_status()
    soup = BeautifulSoup(r.text, "xml")
    urls = set()
    host = urlparse(blog_url).netloc
    for loc in soup.find_all("loc"):
        u = loc.get_text(strip=True)
        p = urlparse(u)
        if p.netloc != host:
            continue
        m = re.fullmatch(r"/(\d+)", p.path)
        if m:
            urls.add((int(m.group(1)), f"https://{host}/{m.group(1)}"))
    return [u for _, u in sorted(urls, reverse=True)]


CONTENT_SELECTORS = [
    "div.tt_article_useless_p_margin",   # 티스토리 에디터 공통 래퍼 (스킨 무관)
    "div.contents_style",
    ".entry-content",
    ".article_view",
    "#article",
    "article",
]


def clean_text(value):
    """HTML에서 추출한 텍스트를 검색용 단일 공백 문자열로 정규화."""
    return unicodedata.normalize("NFC", re.sub(r"\s+", " ", value or "").strip())


def extract_chunks(body, fallback_text, target_chars=CHUNK_TARGET_CHARS,
                   max_chunks=MAX_CHUNKS_PER_POST):
    """본문을 heading 경계와 길이를 기준으로 작은 검색 Chunk로 분할."""
    chunks = []
    heading = "본문"
    parts = []
    part_len = 0

    def flush():
        nonlocal parts, part_len
        text = clean_text(" ".join(parts))
        parts, part_len = [], 0
        if len(text) < 40:
            return
        chunks.append({"heading": heading[:120], "text": text[:1400]})

    selected = {"h1", "h2", "h3", "h4", "p", "li", "pre"}
    for node in body.find_all(list(selected)):
        # li 안의 p처럼 부모/자식이 모두 선택된 경우 중복 수집하지 않음.
        if node.find_parent(list(selected)):
            continue
        text = clean_text(node.get_text(" ", strip=True))
        if not text:
            continue
        if node.name in {"h1", "h2", "h3", "h4"}:
            flush()
            heading = text
            continue
        if len(text) < 12:
            continue
        if parts and part_len + len(text) + 1 > target_chars:
            flush()
        parts.append(text)
        part_len += len(text) + 1
        if len(chunks) >= max_chunks:
            break
    if len(chunks) < max_chunks:
        flush()

    if not chunks:
        text = clean_text(fallback_text)
        for start in range(0, min(len(text), target_chars * max_chunks), target_chars):
            piece = text[start:start + target_chars].strip()
            if len(piece) >= 40:
                chunks.append({"heading": "본문", "text": piece})
    return chunks[:max_chunks]


def fetch_post(url):
    """글 한 편에서 제목/날짜/카테고리/태그/본문 텍스트를 추출."""
    r = requests.get(url, headers=UA, timeout=20)
    if r.status_code != 200:
        return None
    soup = BeautifulSoup(r.text, "html.parser")

    def meta(prop):
        m = soup.find("meta", {"property": prop}) or soup.find("meta", {"name": prop})
        return m.get("content", "").strip() if m and m.get("content") else ""

    title = meta("og:title") or (soup.title.get_text(strip=True) if soup.title else url)

    # 날짜: JSON-LD → og → 없음
    date = ""
    for s in soup.find_all("script", {"type": "application/ld+json"}):
        try:
            data = json.loads(s.string or "")
            items = data if isinstance(data, list) else [data]
            for it in items:
                if isinstance(it, dict) and it.get("datePublished"):
                    date = it["datePublished"][:10]
                    break
        except Exception:
            pass
        if date:
            break
    if not date:
        date = meta("article:published_time")[:10]

    # 본문
    body = None
    for sel in CONTENT_SELECTORS:
        el = soup.select_one(sel)
        if el and len(el.get_text(strip=True)) > 100:
            body = el
            break
    if body is None:
        # 최후 수단: 페이지에서 가장 텍스트가 많은 div
        divs = sorted(soup.find_all("div"), key=lambda d: len(d.get_text(strip=True)), reverse=True)
        body = divs[0] if divs else soup

    for bad in body.select("script, style, .revenue_unit_wrap, .container_postbtn, .another_category"):
        bad.decompose()
    text = clean_text(body.get_text(" ", strip=True))
    chunks = extract_chunks(body, text)

    # 카테고리/태그 (스킨별 편차가 커서 실패해도 무방)
    cat_el = soup.select_one(".category, .link_cate, .txt_category, .category_label, a[href*='/category/']")
    category = cat_el.get_text(strip=True) if cat_el else ""
    tags = list(dict.fromkeys(
        a.get_text(strip=True) for a in soup.select(".tags a, .area_tag a, .list_tag a, a[href*='/tag/']")
    ))[:10]

    return {
        "id": int(url.rstrip("/").rsplit("/", 1)[-1]),
        "url": url,
        "title": unicodedata.normalize("NFC", title),
        "date": date,
        "category": category,
        "tags": tags,
        "chunks": chunks,
        "_text": text,   # 인덱스 파일에는 저장하지 않음 (요약/임베딩 계산용)
    }


# ---------------------------------------------------------------- Gemini

def _gemini_post(path, payload, max_retry=4):
    """(json, http상태) 반환. 429는 재시도, 그 외 오류는 즉시 반환."""
    url = f"{GEMINI_BASE}/{path}?key={GEMINI_KEY}"
    last = None
    for i in range(max_retry):
        resp = requests.post(url, json=payload, timeout=60)
        last = resp.status_code
        if resp.status_code == 200:
            time.sleep(API_DELAY)
            return resp.json(), 200
        if resp.status_code == 429:          # 무료 티어 rate limit
            wait = 15 * (i + 1)
            print(f"    [rate limit] {wait}s 대기...", flush=True)
            time.sleep(wait)
            continue
        print(f"    [Gemini 오류 {resp.status_code}] {resp.text[:160]}", flush=True)
        return None, resp.status_code
    return None, last


_working_model = {}  # {"text": ..., "embed": ...} — 이번 실행에서 확인된 사용 가능 모델


def _gemini_fallback(kind, candidates, make_path, payload):
    """후보 모델을 순서대로 시도, 404(미제공)면 다음 후보. 성공 모델은 기억."""
    first = _working_model.get(kind)
    order = ([first] + [m for m in candidates if m != first]) if first else candidates
    for model in order:
        out, status = _gemini_post(make_path(model), payload)
        if out is not None:
            if _working_model.get(kind) != model:
                _working_model[kind] = model
                print(f"    [{kind} 모델] {model} 사용", flush=True)
            return out
        if status != 404:      # 404 외 실패는 모델을 바꿔도 소용없음
            return None
        print(f"    [모델 교체] {model} 미제공(404) → 다음 후보", flush=True)
    return None


def gemini_summarize(post):
    prompt = (
        "다음은 반도체/회로설계 기술 블로그 글입니다. 아래 형식의 JSON만 출력하세요.\n"
        '{"summary": "글의 핵심 내용을 담은 한국어 요약 3문장 (TL;DR 스타일, 존댓말)", '
        '"keywords": ["핵심 기술용어 5개"]}\n\n'
        f"제목: {post['title']}\n본문: {post['_text'][:8000]}"
    )
    out = _gemini_fallback(
        "text", GEMINI_TEXT_MODELS,
        lambda m: f"models/{m}:generateContent",
        {"contents": [{"parts": [{"text": prompt}]}],
         "generationConfig": {"responseMimeType": "application/json"}},
    )
    if not out:
        return None
    try:
        txt = out["candidates"][0]["content"]["parts"][0]["text"]
        data = json.loads(txt)
        return {"summary": data.get("summary", "").strip(),
                "keywords": [k.strip() for k in data.get("keywords", [])][:5]}
    except Exception as e:
        print(f"    [요약 파싱 실패] {e}", flush=True)
        return None


def gemini_embed(text):
    out = _gemini_fallback(
        "embed", GEMINI_EMBED_MODELS,
        lambda m: f"models/{m}:embedContent",
        {"content": {"parts": [{"text": text[:6000]}]},
         "taskType": "SEMANTIC_SIMILARITY",
         "outputDimensionality": 256},
    )
    if not out:
        return None
    try:
        return out["embedding"]["values"]
    except Exception:
        return None


# ------------------------------------------------- 오프라인 폴백 (API 키 없음)

def extractive_summary(text, n_sent=3):
    """간단한 빈도 기반 추출식 요약."""
    sents = re.split(r"(?<=[.다요\?!])\s+", text)
    sents = [s.strip() for s in sents if 20 < len(s.strip()) < 300][:60]
    if not sents:
        return text[:200]
    words = Counter(re.findall(r"[가-힣A-Za-z0-9]{2,}", text.lower()))
    scored = sorted(
        ((sum(words[w] for w in re.findall(r"[가-힣A-Za-z0-9]{2,}", s.lower())) / (len(s) ** 0.5), i, s)
         for i, s in enumerate(sents)),
        reverse=True,
    )[:n_sent]
    return " ".join(s for _, _, s in sorted(scored, key=lambda x: x[1]))


def tokenize(text):
    """한국어 친화 토크나이저: 단어 + 한글 2-gram."""
    words = re.findall(r"[가-힣]+|[A-Za-z0-9]{2,}", text.lower())
    toks = []
    for w in words:
        toks.append(w)
        if re.match(r"[가-힣]", w) and len(w) >= 2:
            toks.extend(w[i:i + 2] for i in range(len(w) - 1))
    return toks


def tfidf_vectors(texts):
    docs = [Counter(tokenize(t)) for t in texts]
    df = Counter()
    for d in docs:
        df.update(d.keys())
    n = len(docs)
    vecs = []
    for d in docs:
        v = {t: (1 + math.log(c)) * math.log(n / (1 + df[t])) for t, c in d.items()}
        norm = math.sqrt(sum(x * x for x in v.values())) or 1.0
        vecs.append({t: x / norm for t, x in v.items()})
    return vecs


def cosine_sparse(a, b):
    if len(a) > len(b):
        a, b = b, a
    return sum(x * b.get(t, 0.0) for t, x in a.items())


def cosine_dense(a, b):
    num = sum(x * y for x, y in zip(a, b))
    na = math.sqrt(sum(x * x for x in a)) or 1.0
    nb = math.sqrt(sum(x * x for x in b)) or 1.0
    return num / (na * nb)


def quantize_embedding(vec):
    """정규화된 256차원 Embedding을 int8로 줄여 공개 Index 크기를 절약."""
    if not vec:
        return None
    norm = math.sqrt(sum(float(x) * float(x) for x in vec)) or 1.0
    return [max(-127, min(127, int(round(float(x) / norm * 127)))) for x in vec]


def compute_related(posts, dense_vecs=None, sparse_vecs=None, top_k=5):
    """각 글의 관련 글 top-k를 계산해 posts[i]['related']에 id 리스트로 저장."""
    n = len(posts)
    for i in range(n):
        sims = []
        for j in range(n):
            if i == j:
                continue
            if dense_vecs and dense_vecs[i] and dense_vecs[j]:
                s = cosine_dense(dense_vecs[i], dense_vecs[j])
            elif sparse_vecs:
                s = cosine_sparse(sparse_vecs[i], sparse_vecs[j])
            else:
                s = 0.0
            sims.append((s, posts[j]["id"]))
        sims.sort(reverse=True)
        posts[i]["related"] = [pid for s, pid in sims[:top_k] if s > 0.05]
    return posts


# ---------------------------------------------------------------- 메인

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--blog", required=True, help="블로그 URL (예: https://xxx.tistory.com)")
    ap.add_argument("--out", default="docs/index.json")
    ap.add_argument("--limit", type=int, default=0, help="처리할 최대 글 수 (테스트용)")
    ap.add_argument("--force", action="store_true", help="기존 인덱스 무시하고 전체 재생성")
    args = ap.parse_args()

    mode = "Gemini" if GEMINI_KEY else "오프라인(TF-IDF)"
    print(f"[모드] {mode}")

    # 기존 인덱스 로드 (증분 업데이트) — 임베딩이 포함된 캐시 파일 우선
    old = {}
    cache_src = args.out.replace(".json", ".cache.json")
    src = cache_src if os.path.exists(cache_src) else args.out
    if os.path.exists(src) and not args.force:
        with open(src, encoding="utf-8") as f:
            old = {p["id"]: p for p in json.load(f).get("posts", [])}
        print(f"[기존 인덱스] {len(old)}개 글")

    urls = get_post_urls(args.blog)
    if args.limit:
        urls = urls[: args.limit]
    print(f"[사이트맵] 글 {len(urls)}개 발견")

    posts, texts, embeds = [], [], []
    for k, url in enumerate(urls, 1):
        pid = int(url.rstrip("/").rsplit("/", 1)[-1])
        cached = old.get(pid)
        if cached and cached.get("summary") and (not GEMINI_KEY or cached.get("_emb")):
            # 구형 Cache에는 Chunk가 없으므로 글만 다시 읽고 기존 요약/Embedding은 보존.
            if not cached.get("chunks"):
                try:
                    fresh = fetch_post(url)
                except Exception as e:
                    fresh = None
                    print(f"    [Chunk 수집 실패] {e}", flush=True)
                if fresh:
                    cached = dict(cached)
                    for key in ("url", "title", "date", "category", "tags", "chunks"):
                        cached[key] = fresh.get(key, cached.get(key))
                    cached["excerpt"] = fresh.get("_text", "")[:500]
                    print(f"[{k}/{len(urls)}] {url} — Chunk {len(cached['chunks'])}개 보강", flush=True)
                    time.sleep(0.35)
            if not cached.get("chunks"):
                fallback = cached.get("summary", "") + " " + cached.get("excerpt", "")
                cached["chunks"] = [{"heading": "본문", "text": fallback[:900]}]
            posts.append(cached)
            texts.append(cached["title"] + " " + cached.get("summary", "") + " " +
                         " ".join(cached.get("keywords", [])) + " " + cached.get("excerpt", ""))
            embeds.append(cached.get("_emb"))
            continue

        print(f"[{k}/{len(urls)}] {url}", flush=True)
        try:
            p = fetch_post(url)
        except Exception as e:
            print(f"    [수집 실패] {e}", flush=True)
            continue
        if not p or len(p["_text"]) < 50:
            continue

        # 요약
        summ = gemini_summarize(p) if GEMINI_KEY else None
        if summ:
            p["summary"], p["keywords"] = summ["summary"], summ["keywords"]
        else:
            p["summary"] = extractive_summary(p["_text"])
            p["keywords"] = [w for w, _ in Counter(
                t for t in tokenize(p["title"] + " " + p["_text"]) if len(t) >= 3
            ).most_common(5)]

        p["excerpt"] = p["_text"][:500]
        emb = gemini_embed(p["title"] + "\n" + p["summary"] + "\n" + p["_text"][:3000]) if GEMINI_KEY else None
        p["_emb"] = emb

        texts.append(p["title"] + " " + p["summary"] + " " + " ".join(p["keywords"]) + " " + p["excerpt"])
        embeds.append(emb)
        p.pop("_text", None)
        posts.append(p)
        time.sleep(0.8)  # 블로그 서버 배려

    # 관련 글 계산
    use_dense = GEMINI_KEY and all(e for e in embeds)
    sparse = None if use_dense else tfidf_vectors(texts)
    compute_related(posts, dense_vecs=embeds if use_dense else None, sparse_vecs=sparse)

    # 원본 float Embedding은 Cache에만 유지하고, 공개 Index에는 int8 양자화본만 포함.
    cache_path = args.out.replace(".json", ".cache.json")
    os.makedirs(os.path.dirname(os.path.abspath(args.out)), exist_ok=True)
    with open(cache_path, "w", encoding="utf-8") as f:
        json.dump({"posts": posts}, f, ensure_ascii=False)

    slim = []
    for p in posts:
        q = {k: v for k, v in p.items() if k != "_emb"}
        embq = quantize_embedding(p.get("_emb"))
        if embq:
            q["embq"] = embq
        slim.append(q)
    out_data = {
        "blog": args.blog,
        "generated": time.strftime("%Y-%m-%dT%H:%M:%S%z"),
        "mode": mode,
        "count": len(slim),
        "posts": slim,
    }
    with open(args.out, "w", encoding="utf-8") as f:
        json.dump(out_data, f, ensure_ascii=False, indent=1)
    size_kb = os.path.getsize(args.out) / 1024
    print(f"\n[완료] {len(slim)}개 글 → {args.out} ({size_kb:.0f} KB)")


if __name__ == "__main__":
    main()
