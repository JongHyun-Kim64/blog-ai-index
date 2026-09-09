/* Editorial discovery and reading tools. Public catalog only; no AI requests. */
(function (root, factory) {
  "use strict";
  var api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.SemiconductorEditorial = api;
})(typeof window !== "undefined" ? window : this, function () {
  "use strict";
  var BASE = "https://semicon-circuit.tistory.com";
  var LABELS = {
    "반도체 시사": "AI · 반도체", "Verilog & 디지털 설계": "RTL · FPGA",
    "전자회로 & 아날로그": "아날로그", "임베디드 SW & MCU": "임베디드",
    "Full Custom IC 설계": "Full Custom", "ARM & RTOS": "ARM · RTOS",
    "SoC & Peripheral 설계": "SoC", "취업준비": "취업준비"
  };
  function text(value) { return String(value || "").replace(/[\u200b-\u200d\ufeff]/g, "").replace(/\s+/g, " ").trim(); }
  function normalize(value) { return text(value).normalize("NFKC").toLowerCase(); }
  function publicPosts(catalog) {
    var seen = new Set();
    return ((catalog && catalog.posts) || []).filter(function (p) {
      if (!p || !Number.isInteger(p.id) || p.id < 1 || !text(p.title) || p.url !== BASE + "/" + p.id || seen.has(p.id)) return false;
      seen.add(p.id); return true;
    });
  }
  function topic(post) {
    try { return decodeURIComponent(post.categoryPath || "").replace(/^\/category\//, "").split("/")[0] || post.category || "기타"; }
    catch (e) { return post.category || "기타"; }
  }
  function selectPosts(posts, category, query, order) {
    var terms = normalize(query).split(/\s+/).filter(Boolean);
    return posts.filter(function (p) {
      if (category && topic(p) !== category) return false;
      var haystack = normalize(p.title + " " + p.category + " " + (p.tags || []).join(" ") + " " + (p.excerpt || ""));
      return terms.every(function (t) { return haystack.indexOf(t) >= 0; });
    }).sort(function (a, b) {
      if (order === "title") return a.title.localeCompare(b.title, "ko") || b.id - a.id;
      return String(b.date || "").localeCompare(String(a.date || "")) || b.id - a.id;
    });
  }
  function progressRatio(top, height, scroll, viewport) {
    var distance = Math.max(1, height - viewport);
    return Math.max(0, Math.min(1, (scroll - top) / distance));
  }
  function create(doc, tag, cls, value) {
    var e = doc.createElement(tag); if (cls) e.className = cls;
    if (value !== undefined) e.textContent = value; return e;
  }
  function emit(name, values) {
    if (typeof window.gtag === "function") window.gtag("event", name, values);
  }
  function articleLink(doc, post, cls, label, placement) {
    var a = create(doc, "a", cls, label); a.href = post.url;
    a.addEventListener("click", function () { emit("internal_article_click", { placement: placement, from_post: "home", to_post: String(post.id) }); });
    return a;
  }
  function minutes(post) { return Math.max(1, Number(post.minutes) || 1) + "분 읽기"; }
  function pictureFromHome(doc, id) {
    var anchors = doc.querySelectorAll(".area_cover a[href]");
    for (var i = 0; i < anchors.length; i++) {
      var a = anchors[i], url;
      try { url = new URL(a.href); } catch (e) { continue; }
      if (url.pathname !== "/" + id) continue;
      var thumbnail = a.querySelector(".item-thumbnail, .thumnail, img");
      if (!thumbnail) continue;
      var match = (thumbnail.style.backgroundImage || "").match(/url\(["']?(.*?)["']?\)/);
      var src = thumbnail.tagName === "IMG" ? thumbnail.getAttribute("src") : match && match[1];
      try { if (src && new URL(src).protocol === "https:") return src; } catch (e) {}
    }
    return "";
  }
  function buildHome(doc, catalog) {
    var cover = doc.querySelector(".area_cover"), posts = publicPosts(catalog);
    if (doc.body.id !== "tt-body-index" || location.pathname !== "/" || new URLSearchParams(location.search).has("page") || !cover ||
        !cover.querySelector(".type_featured") || !posts.length || doc.querySelector(".sd-home")) return;
    var latest = selectPosts(posts, "", "", "latest"), lead = latest[0], byId = {};
    posts.forEach(function (p) { byId[p.id] = p; });
    var image = pictureFromHome(doc, lead.id), root = create(doc, "div", "sd-home");
    var mast = create(doc, "header", "sd-mast");
    mast.appendChild(create(doc, "p", "sd-eyebrow", "SEMICONDUCTOR DESIGN LAB"));
    mast.appendChild(create(doc, "h1", "", "회로에서 아키텍처까지."));
    mast.appendChild(create(doc, "p", "sd-intro", "반도체의 동작 원리와 RTL 구현, AI 가속기 설계를 연결하는 기술 노트."));
    root.appendChild(mast);
    var hero = articleLink(doc, lead, "sd-lead", undefined, "home_lead");
    var info = create(doc, "div", "sd-lead-info");
    info.appendChild(create(doc, "p", "sd-eyebrow", "LATEST  /  " + (LABELS[topic(lead)] || topic(lead))));
    info.appendChild(create(doc, "h2", "", lead.title));
    info.appendChild(create(doc, "p", "sd-lead-desc", text(lead.excerpt)));
    info.appendChild(create(doc, "p", "sd-meta", text(lead.date).replace(/-/g, ".") + " · " + minutes(lead)));
    info.appendChild(create(doc, "span", "sd-read", "글 읽기 ↗"));
    hero.appendChild(info);
    if (image) {
      var visual = create(doc, "div", "sd-lead-visual"), img = create(doc, "img");
      img.src = image; img.alt = ""; img.width = 800; img.height = 500;
      img.decoding = "async"; visual.appendChild(img); hero.appendChild(visual);
    } else hero.classList.add("sd-lead-text-only");
    root.appendChild(hero);
    var start = create(doc, "section", "sd-start"); start.setAttribute("aria-label", "처음 읽는 분을 위한 대표 글");
    var startLabel = create(doc, "div", "sd-start-label");
    startLabel.appendChild(create(doc, "h2", "", "Start here"));
    startLabel.appendChild(create(doc, "p", "", "처음이라면 이 글부터"));
    start.appendChild(startLabel);
    [[113, "01", "AI 가속기 이해", "Systolic Array의 구조와 연산"],
     [98, "02", "RTL 구현 시작", "UART 통신부터 TX·RX 설계까지"],
     [80, "03", "설계 포트폴리오", "Cadence Virtuoso Full Custom IC"]].forEach(function (entry) {
      if (!byId[entry[0]]) return;
      var a = articleLink(doc, byId[entry[0]], "sd-start-link", undefined, "home_start");
      a.appendChild(create(doc, "span", "sd-index", entry[1]));
      var body = create(doc, "span"); body.appendChild(create(doc, "strong", "", entry[2]));
      body.appendChild(create(doc, "small", "", entry[3])); a.appendChild(body);
      a.appendChild(create(doc, "span", "sd-arrow", "↗")); start.appendChild(a);
    });
    root.appendChild(start);
    var archive = create(doc, "section", "sd-archive"); archive.id = "sd-explore";
    var heading = create(doc, "div", "sd-section-head");
    heading.appendChild(create(doc, "h2", "", "Explore"));
    var archiveLink = create(doc, "a", "sd-subtle-link", "전체 아카이브 ↗"); archiveLink.href = "/category";
    heading.appendChild(archiveLink); archive.appendChild(heading);
    var form = create(doc, "form", "sd-search"); form.setAttribute("role", "search");
    var label = create(doc, "label", "sd-search-label", "글 검색"); label.htmlFor = "sd-search-input";
    var input = create(doc, "input"); input.id = "sd-search-input"; input.type = "search";
    input.placeholder = "예: HBM, UART, Scan Chain"; input.autocomplete = "off";
    var sortLabel = create(doc, "label", "sd-sort-label", "정렬"); sortLabel.htmlFor = "sd-sort";
    var sort = create(doc, "select"); sort.id = "sd-sort";
    [["latest", "최신순"], ["title", "제목순"]].forEach(function (item) {
      var o = create(doc, "option", "", item[1]); o.value = item[0]; sort.appendChild(o);
    });
    form.appendChild(label); form.appendChild(input); form.appendChild(sortLabel); form.appendChild(sort);
    archive.appendChild(form);
    var filters = create(doc, "div", "sd-filters"); filters.setAttribute("role", "group"); filters.setAttribute("aria-label", "글 주제");
    var categories = Array.from(new Set(posts.map(topic)));
    categories.sort(function (a, b) {
      var keys = Object.keys(LABELS), ai = keys.indexOf(a), bi = keys.indexOf(b);
      return (ai < 0 ? 99 : ai) - (bi < 0 ? 99 : bi) || a.localeCompare(b, "ko");
    });
    var selected = "", limit = 6, controls = [];
    [""].concat(categories).forEach(function (cat) {
      var button = create(doc, "button", "", cat ? LABELS[cat] || cat : "전체");
      button.type = "button"; button.setAttribute("aria-pressed", String(!cat));
      button.addEventListener("click", function () {
        selected = cat; limit = 6;
        controls.forEach(function (c) { c.button.setAttribute("aria-pressed", String(c.category === selected)); });
        update();
      });
      controls.push({ button: button, category: cat }); filters.appendChild(button);
    });
    archive.appendChild(filters);
    var status = create(doc, "p", "sd-result-count"); status.setAttribute("role", "status"); status.setAttribute("aria-live", "polite");
    archive.appendChild(status);
    var grid = create(doc, "div", "sd-post-grid"); archive.appendChild(grid);
    var more = create(doc, "button", "sd-more", "글 더 보기"); more.type = "button"; archive.appendChild(more);
    var empty = create(doc, "div", "sd-empty");
    empty.appendChild(create(doc, "p", "", "일치하는 글이 없습니다. 다른 키워드나 주제를 선택해 주세요."));
    var reset = create(doc, "button", "sd-more", "검색 초기화"); reset.type = "button"; empty.appendChild(reset); archive.appendChild(empty);
    function update() {
      var results = selectPosts(posts, selected, input.value, sort.value), visible = results.slice(0, limit);
      grid.replaceChildren();
      visible.forEach(function (p) {
        var a = articleLink(doc, p, "sd-post", undefined, "home_archive");
        a.appendChild(create(doc, "span", "sd-post-topic", LABELS[topic(p)] || topic(p)));
        a.appendChild(create(doc, "h3", "", p.title));
        a.appendChild(create(doc, "p", "sd-post-desc", text(p.excerpt)));
        var meta = create(doc, "div", "sd-card-meta");
        meta.appendChild(create(doc, "span", "", text(p.date).replace(/-/g, ".") + " · " + minutes(p)));
        meta.appendChild(create(doc, "span", "", "↗")); a.appendChild(meta); grid.appendChild(a);
      });
      status.textContent = (selected ? LABELS[selected] || selected : "전체") + " · " + results.length + "편" + (results.length ? " / " + visible.length + "편 표시" : "");
      more.hidden = results.length <= limit; empty.hidden = results.length !== 0;
    }
    var searchTimer;
    input.addEventListener("input", function () { clearTimeout(searchTimer); searchTimer = setTimeout(function () { limit = 6; update(); }, 120); });
    form.addEventListener("submit", function (e) { e.preventDefault(); clearTimeout(searchTimer); limit = 6; update(); });
    sort.addEventListener("change", function () { limit = 6; update(); });
    more.addEventListener("click", function () { limit += 6; update(); });
    reset.addEventListener("click", function () {
      input.value = ""; selected = ""; limit = 6; sort.value = "latest";
      controls.forEach(function (c) { c.button.setAttribute("aria-pressed", String(!c.category)); }); update(); input.focus();
    });
    update(); root.appendChild(archive);
    var footer = create(doc, "aside", "sd-follow");
    footer.appendChild(create(doc, "p", "", "새 글은 RSS로 받아볼 수 있습니다."));
    var rss = create(doc, "a", "", "RSS 피드 ↗"); rss.href = "/rss"; footer.appendChild(rss); root.appendChild(footer);
    // Keep the server-rendered homepage intact as a fallback. Reveal only after a complete build.
    cover.insertBefore(root, cover.firstChild); doc.documentElement.classList.add("sd-home-active");
    try {
      var slider = cover.querySelector(".slide_zone.slick-initialized");
      if (slider && window.jQuery && window.jQuery.fn.slick) window.jQuery(slider).slick("slickPause");
    } catch (e) {}
  }
  function readingTools(doc, current) {
    var body = doc.querySelector(".tt_article_useless_p_margin, .contents_style");
    if (!body || doc.body.id !== "tt-body-page" || doc.querySelector(".sd-reader-tools")) return;
    var canonical = doc.querySelector('link[rel="canonical"]'), url = canonical && canonical.href;
    if (!/^https:\/\/semicon-circuit\.tistory\.com\/\d+$/.test(url || "")) return;
    var first = Array.from(body.children).find(function (e) { return !e.matches("script,style,.aiblog-box,.tech-breadcrumb,.tech-post-meta"); });
    if (!first) return;
    if (!first.id) first.id = "sd-article-start";
    var tools = create(doc, "div", "sd-reader-tools");
    var jump = create(doc, "a", "", "본문 바로 읽기 ↓"); jump.href = "#" + first.id; tools.appendChild(jump);
    var copy = create(doc, "button", "", "링크 복사"); copy.type = "button"; tools.appendChild(copy);
    var status = create(doc, "span", "sd-copy-status"); status.setAttribute("role", "status"); tools.appendChild(status);
    copy.addEventListener("click", function () {
      if (!navigator.clipboard || !navigator.clipboard.writeText) { status.textContent = "주소창의 링크를 복사해 주세요."; return; }
      navigator.clipboard.writeText(url).then(function () {
        status.textContent = "링크를 복사했습니다.";
      }).catch(function () { status.textContent = "주소창의 링크를 복사해 주세요."; });
    });
    body.parentNode.insertBefore(tools, body.parentNode.firstChild);
    function compactToc() {
      var toc = doc.querySelector(".toc-container"), list = toc && toc.querySelector(".toc-list");
      if (toc && list && !toc.querySelector("details")) {
        var details = create(doc, "details", "sd-toc"), label = create(doc, "summary", "", "목차 · " + list.querySelectorAll("a").length + "개 섹션");
        details.appendChild(label); details.appendChild(list); toc.replaceChildren(details); toc.classList.add("sd-compact-toc");
      }
      if (current) {
        var meta = doc.querySelector(".tech-post-meta");
        if (meta) Array.from(meta.children).forEach(function (e) {
          if (/^\s*\d+분 읽기\s*$/.test(e.textContent)) e.textContent = minutes(current);
        });
      }
    }
    compactToc(); [400, 1500, 3500].forEach(function (delay) { setTimeout(compactToc, delay); });
    var bar = create(doc, "progress", "sd-reading-progress"); bar.max = 100; bar.value = 0; bar.setAttribute("aria-label", "본문 스크롤 진행률"); doc.body.appendChild(bar);
    var queued = false, lastValue = -1;
    function updateProgress() {
      queued = false;
      var r = body.getBoundingClientRect(), value = Math.round(progressRatio(r.top + window.scrollY, r.height, window.scrollY, window.innerHeight) * 100);
      if (value !== lastValue) { bar.value = value; lastValue = value; }
    }
    function queue() { if (!queued) { queued = true; requestAnimationFrame(updateProgress); } }
    window.addEventListener("scroll", queue, { passive: true }); window.addEventListener("resize", queue);
    updateProgress();
  }
  function start(doc, catalog) {
    try { buildHome(doc, catalog); } catch (e) { console.warn("[editorial] Home fallback retained", e); }
    var canonical = doc.querySelector('link[rel="canonical"]'), posts = publicPosts(catalog);
    var current = posts.find(function (p) { return canonical && p.url === canonical.href; });
    if (current) readingTools(doc, current);
  }
  return { start: start, publicPosts: publicPosts, selectPosts: selectPosts, topic: topic, progressRatio: progressRatio };
});
