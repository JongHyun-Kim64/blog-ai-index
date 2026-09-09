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
  function categoryUrl(value) {
    try {
      var url = new URL(value, BASE);
      if (url.origin !== BASE || !/^\/category(?:\/|$)/.test(url.pathname)) return "";
      return url.origin + url.pathname;
    } catch (e) { return ""; }
  }
  function path(value) { try { return decodeURIComponent(new URL(value, BASE).pathname).replace(/\/$/, ""); } catch (e) { return ""; } }
  function contextNav(doc, label, href) {
    var nav = create(doc, "nav", "sd-context"); nav.setAttribute("aria-label", "현재 위치");
    var home = create(doc, "a", "", "Home"); home.href = "/"; nav.appendChild(home);
    nav.appendChild(create(doc, "span", "sd-separator", "/"));
    var item = create(doc, href ? "a" : "span", "", label);
    if (href) item.href = href; else item.setAttribute("aria-current", "page");
    nav.appendChild(item); return nav;
  }
  function archiveLayout(doc, posts) {
    var area = doc.querySelector(".area_category"), title = area && area.querySelector(".title_section");
    if (!/^tt-body-(category|search|tag|archive)$/.test(doc.body.id) || !title || area.classList.contains("sd-archive-page")) return;
    var context = contextNav(doc, "Archive"); area.insertBefore(context, title);
    var topics = create(doc, "nav", "sd-topic-links"); topics.setAttribute("aria-label", "다른 주제 탐색");
    var all = create(doc, "a", "", "전체"); all.href = "/category";
    if (path(location.href) === "/category") all.setAttribute("aria-current", "page"); topics.appendChild(all);
    doc.querySelectorAll(".header_category .category_list > li > a").forEach(function (source) {
      var href = categoryUrl(source.href); if (!href) return;
      var name = path(href).replace(/^\/category\//, "").split("/")[0];
      var a = create(doc, "a", "", LABELS[name] || name); a.href = href; a.title = name;
      if (path(location.href) === path(href) || path(location.href).indexOf(path(href) + "/") === 0) a.setAttribute("aria-current", "page");
      topics.appendChild(a);
    });
    if (topics.children.length === 1) {
      Array.from(new Set(posts.map(topic))).sort(function (a, b) { return Object.keys(LABELS).indexOf(a) - Object.keys(LABELS).indexOf(b); }).forEach(function (name) {
        var href = categoryUrl("/category/" + encodeURIComponent(name)); if (!href) return;
        var a = create(doc, "a", "", LABELS[name] || name); a.href = href; a.title = name;
        if (path(location.href) === path(href) || path(location.href).indexOf(path(href) + "/") === 0) a.setAttribute("aria-current", "page");
        topics.appendChild(a);
      });
    }
    title.insertAdjacentElement("afterend", topics);
    var searchLink = create(doc, "a", "sd-archive-search", "전체 글 검색 ↗"); searchLink.href = "/#sd-explore"; topics.appendChild(searchLink);
    var byId = {}; posts.forEach(function (p) { byId[p.id] = p; });
    area.querySelectorAll(".list_category .link_category").forEach(function (a) {
      var match = path(a.href).match(/^\/(\d+)$/), p = match && byId[Number(match[1])];
      if (!p) return; // Keep newly published or uncatalogued native entries intact.
      var desc = a.querySelector(".summary"), date = a.querySelector(".date");
      if (desc && text(p.excerpt)) desc.textContent = text(p.excerpt);
      if (date) date.appendChild(create(doc, "span", "sd-list-time", " · " + minutes(p)));
      var info = a.querySelector(".info"); if (info) info.appendChild(create(doc, "span", "sd-list-read", "글 읽기 ↗"));
    });
    area.classList.add("sd-archive-page"); doc.documentElement.classList.add("sd-editorial", "sd-archive-active");
  }
  function articleLayout(doc, current) {
    var header = doc.querySelector(".article_header .info_text");
    if (!header || header.querySelector(".sd-context")) return;
    var href = categoryUrl(current.categoryPath);
    header.insertBefore(contextNav(doc, current.category || "Article", href), header.firstChild);
    doc.documentElement.classList.add("sd-editorial", "sd-article-active");
    function headerHeight() {
      var siteHeader = doc.querySelector(".box_header");
      var height = siteHeader ? Math.min(120, Math.ceil(siteHeader.getBoundingClientRect().height)) : 64;
      doc.documentElement.style.setProperty("--sd-header-height", height + "px");
    }
    headerHeight(); window.addEventListener("resize", headerHeight, { passive: true });
  }
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
    if (doc.body.id !== "tt-body-index" || location.pathname !== "/" || new URLSearchParams(location.search).has("page") || doc.documentElement.classList.contains("sd-home-fallback") || !cover ||
        !cover.querySelector(".type_featured") || !posts.length || doc.querySelector(".sd-home")) return;
    var latest = selectPosts(posts, "", "", "latest"), lead = latest[0], byId = {};
    posts.forEach(function (p) { byId[p.id] = p; });
    var image = pictureFromHome(doc, lead.id), root = create(doc, "div", "sd-home");
    var hero = articleLink(doc, lead, "sd-lead", undefined, "home_lead");
    var info = create(doc, "div", "sd-lead-info");
    info.appendChild(create(doc, "p", "sd-eyebrow", "LATEST  /  " + (LABELS[topic(lead)] || topic(lead))));
    info.appendChild(create(doc, "h1", "", lead.title));
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
    cover.insertBefore(root, cover.firstChild); doc.documentElement.classList.add("sd-home-active", "sd-editorial");
    doc.documentElement.classList.remove("sd-home-loading");
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
    var first = Array.from(body.children).find(function (e) { return !e.matches("script,style,.aiblog-box,.tech-breadcrumb,.tech-post-meta") && (text(e.textContent) || e.querySelector("img,video,iframe")); });
    if (!first) return;
    if (!first.id) first.id = "sd-article-start";
    var tools = create(doc, "div", "sd-reader-tools");
    var jump = create(doc, "a", "", "본문 바로 읽기 ↓"); jump.href = "#" + first.id; tools.appendChild(jump);
    var category = current && categoryUrl(current.categoryPath);
    if (category) { var back = create(doc, "a", "sd-back-to-topic", "주제 목록"); back.href = category; tools.appendChild(back); }
    var tocButton = create(doc, "button", "", "목차"); tocButton.type = "button";
    tocButton.addEventListener("click", function () {
      var toc = doc.querySelector(".toc-container"); if (!toc) return;
      var detail = toc.querySelector("details"); if (detail) detail.open = true;
      toc.scrollIntoView({ block: "start", behavior: "auto" });
      var firstLink = toc.querySelector("a"); if (firstLink) firstLink.focus({ preventScroll: true });
    });
    if (doc.querySelector(".toc-container")) tools.appendChild(tocButton);
    var next = doc.querySelector(".reading-next");
    if (next) {
      if (!next.id) next.id = "sd-read-next";
      var nextLink = create(doc, "a", "sd-next-jump", "이어서 읽기 ↓"); nextLink.href = "#" + next.id; tools.appendChild(nextLink);
    }
    var copy = create(doc, "button", "", "링크 복사"); copy.type = "button"; tools.appendChild(copy);
    var status = create(doc, "span", "sd-copy-status"); status.setAttribute("role", "status"); tools.appendChild(status);
    copy.addEventListener("click", function () {
      if (!navigator.clipboard || !navigator.clipboard.writeText) { status.textContent = "주소창의 링크를 복사해 주세요."; return; }
      navigator.clipboard.writeText(url).then(function () {
        status.textContent = "링크를 복사했습니다.";
      }).catch(function () { status.textContent = "주소창의 링크를 복사해 주세요."; });
    });
    body.parentNode.insertBefore(tools, body.parentNode.firstChild);
    var seriesCurrent = doc.querySelector(".reading-path .reading-current");
    if (seriesCurrent) {
      var item = seriesCurrent.closest("li"), neighbors = [[item.previousElementSibling, "이전 단계"], [item.nextElementSibling, "다음 단계"]];
      var steps = create(doc, "nav", "sd-step-links"); steps.setAttribute("aria-label", "시리즈 앞뒤 글");
      neighbors.forEach(function (entry) {
        var original = entry[0] && entry[0].querySelector("a[href]"); if (!original) return;
        var a = create(doc, "a"); a.href = original.href;
        a.appendChild(create(doc, "span", "", entry[1])); a.appendChild(create(doc, "strong", "", original.title || original.textContent)); steps.appendChild(a);
      });
      if (steps.children.length) body.insertAdjacentElement("beforebegin", steps);
    }
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
    var toggle = doc.querySelector(".box_header .btn_theme");
    if (toggle && !toggle.hasAttribute("data-sd-toggle")) {
      toggle.setAttribute("data-sd-toggle", "true"); toggle.setAttribute("aria-label", "다크/라이트 모드 전환");
      function syncToggle() { toggle.setAttribute("aria-pressed", String(doc.documentElement.getAttribute("data-theme") === "dark")); }
      syncToggle(); new MutationObserver(syncToggle).observe(doc.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
    }
    try { buildHome(doc, catalog); } catch (e) { console.warn("[editorial] Home fallback retained", e); }
    var canonical = doc.querySelector('link[rel="canonical"]'), posts = publicPosts(catalog);
    try { archiveLayout(doc, posts); } catch (e) { console.warn("[editorial] Native archive retained", e); }
    var current = posts.find(function (p) { return canonical && p.url === canonical.href; });
    if (current) { articleLayout(doc, current); readingTools(doc, current); }
  }
  return { start: start, publicPosts: publicPosts, selectPosts: selectPosts, topic: topic, categoryUrl: categoryUrl, progressRatio: progressRatio };
});
