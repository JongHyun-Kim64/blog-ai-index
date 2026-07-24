/**
 * 티스토리 AI 어시스턴트 (요약 · 관련 글 추천 · 검색 · Q&A)
 * ----------------------------------------------------------------
 * 사용법: 스킨 편집 → 파일업로드에 이 파일 업로드 후, html의 </body> 위에
 *   <script src="./images/ai-features.js"></script>
 *
 * 화면 구성:
 *  - 글 상단 "AI 세 줄 요약" 박스, 글 하단 "함께 보면 좋은 글" (자동 삽입)
 *  - 우하단 ✦AI 버튼 → 채팅형 어시스턴트 패널
 *    ("이 글 요약해줘" / "관련 글 찾아줘" / "최근 글" / 검색어 입력)
 *
 * 디자인은 스킨의 CSS 변수(--bg/--text/--accent/--border)를 그대로 사용해
 * 라이트/다크 모드를 자동으로 따라갑니다.
 */
(function () {
  "use strict";

  var CONFIG = {
    // 필수: GitHub Pages 등에 올린 index.json 주소
    INDEX_URL: "https://jonghyun-kim64.github.io/blog-ai-index/index.json",
    // 선택: Q&A 챗봇용 Cloudflare Worker 주소 (비우면 인덱스 기반 응답만)
    WORKER_URL: "",
    RELATED_COUNT: 5,
    // 사이트 왼쪽 아래 구석에 배치 (우하단 "맨 위로" 버튼과 반대편)
    FAB_BOTTOM: 24,
    FAB_LEFT: 24
  };

  /* ---------------------------------------------------- 유틸 */

  function postIdFromUrl() {
    var m = location.pathname.match(/^\/(?:m\/)?(\d+)\/?$/);
    if (m) return parseInt(m[1], 10);
    var og = document.querySelector('meta[property="og:url"]');
    if (og) {
      m = (og.getAttribute("content") || "").match(/\/(\d+)\/?$/);
      if (m) return parseInt(m[1], 10);
    }
    return null;
  }

  function findArticleEl() {
    var sels = [
      ".tt_article_useless_p_margin", ".contents_style",
      ".entry-content", ".article_view", "#article", "article"
    ];
    for (var i = 0; i < sels.length; i++) {
      var el = document.querySelector(sels[i]);
      if (el && el.textContent.trim().length > 100) return el;
    }
    return null;
  }

  function el(tag, cls, html) {
    var e = document.createElement(tag);
    if (cls) e.className = cls;
    if (html !== undefined) e.innerHTML = html;
    return e;
  }

  function esc(s) {
    return String(s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }

  var SPARK = '<svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M12 1.8l2.6 7.6 7.6 2.6-7.6 2.6L12 22.2l-2.6-7.6L1.8 12l7.6-2.6z"/></svg>';
  var SEND = '<svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M3.4 20.4l17.8-8.4L3.4 3.6l-.01 6.53L15 12 3.39 13.87z"/></svg>';

  /* ---------------------------------------------------- 스타일 */

  var CSS = "" +
".aiblog-box{border:1px solid var(--border,#e5e8eb);border-radius:16px;padding:18px 20px;margin:24px 0;font-size:15px;line-height:1.75;background:var(--aiblog-soft,#f8f9fb);color:var(--text,#191f28)}" +
".aiblog-box h4{margin:0 0 10px;font-size:14px;font-weight:800;color:var(--text,#191f28);display:flex;align-items:center;gap:7px}" +
".aiblog-box h4 svg{color:var(--accent,#2b2f36)}" +
".aiblog-badge{font-size:10px;background:var(--accent,#2b2f36);color:var(--bg,#fff);border-radius:5px;padding:2px 6px;font-weight:700;letter-spacing:.3px}" +
".aiblog-keywords{margin-top:12px}" +
".aiblog-keywords span{display:inline-block;background:var(--aiblog-chipbg,#eef1f4);color:var(--aiblog-chiptx,#4e5968);border-radius:20px;padding:3px 11px;font-size:12px;margin:2px 5px 2px 0;font-weight:500}" +
".aiblog-related a{display:block;padding:10px 12px;border-radius:10px;text-decoration:none;color:var(--text,#191f28)}" +
".aiblog-related a:hover{background:var(--aiblog-hover,#eef1f4)}" +
".aiblog-related .aiblog-rel-title{font-weight:700;font-size:14px}" +
".aiblog-related .aiblog-rel-sum{font-size:12.5px;color:var(--aiblog-sub,#8b95a1);margin-top:2px;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden}" +
/* --- 플로팅 AI 버튼 (맨위로 버튼 위에 정렬) --- */
".aiblog-fab{position:fixed;left:" + CONFIG.FAB_LEFT + "px;bottom:" + CONFIG.FAB_BOTTOM + "px;z-index:9998;height:44px;padding:0 15px 0 13px;display:flex;align-items:center;gap:7px;border-radius:22px;border:none;background:var(--accent,#2b2f36);color:#fff;font-size:13.5px;font-weight:800;letter-spacing:.4px;font-family:inherit;cursor:pointer;box-shadow:0 8px 24px rgba(0,23,51,.18);transition:transform .16s ease,box-shadow .16s ease}" +
".aiblog-fab:hover{transform:translateY(-2px);box-shadow:0 12px 28px rgba(0,23,51,.24)}" +
".aiblog-fab:active{transform:translateY(0)}" +
/* --- 어시스턴트 패널 --- */
".aiblog-wrap{position:fixed;left:24px;bottom:84px;z-index:9999;width:376px;max-width:calc(100vw - 32px);opacity:0;pointer-events:none;transform:translateY(10px) scale(.98);transition:opacity .18s ease,transform .18s ease}" +
".aiblog-wrap.open{opacity:1;pointer-events:auto;transform:none}" +
".aiblog-panel{background:var(--bg,#fff);border:1px solid var(--border,#e5e8eb);border-radius:20px;box-shadow:0 20px 60px rgba(0,23,51,.18);display:flex;flex-direction:column;max-height:min(560px,calc(100vh - 170px));overflow:hidden;color:var(--text,#191f28)}" +
".aiblog-head{display:flex;align-items:center;gap:9px;padding:14px 16px;border-bottom:1px solid var(--border,#e5e8eb)}" +
".aiblog-head svg{color:var(--accent,#2b2f36);flex:none}" +
".aiblog-head .t{font-weight:800;font-size:15px}" +
".aiblog-head .c{font-size:11.5px;color:var(--aiblog-sub,#8b95a1);margin-left:auto;margin-right:6px}" +
".aiblog-x{border:none;background:none;color:var(--aiblog-sub,#8b95a1);font-size:20px;line-height:1;cursor:pointer;padding:2px 4px;border-radius:8px}" +
".aiblog-x:hover{background:var(--aiblog-hover,#eef1f4)}" +
".aiblog-chat{flex:1;overflow-y:auto;padding:14px;display:flex;flex-direction:column;gap:10px}" +
".aiblog-mu{align-self:flex-end;background:var(--accent,#2b2f36);color:#fff;padding:9px 13px;border-radius:16px 16px 4px 16px;font-size:13.5px;line-height:1.55;max-width:85%;word-break:break-word}" +
".aiblog-ma{align-self:flex-start;background:var(--aiblog-soft,#f2f4f6);color:var(--text,#191f28);padding:11px 13px;border-radius:16px 16px 16px 4px;font-size:13.5px;line-height:1.65;max-width:94%;word-break:break-word}" +
".aiblog-ma b{font-weight:800}" +
".aiblog-cards a{display:block;background:var(--bg,#fff);border:1px solid var(--border,#e5e8eb);border-radius:12px;padding:10px 12px;margin-top:8px;text-decoration:none}" +
".aiblog-cards a:hover{border-color:var(--accent,#2b2f36)}" +
".aiblog-cards .ct{font-weight:700;font-size:13.5px;color:var(--text,#191f28)}" +
".aiblog-cards .cs{font-size:12px;color:var(--aiblog-sub,#8b95a1);margin-top:3px;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden}" +
".aiblog-kwrow{margin-top:8px}" +
".aiblog-kwrow span{display:inline-block;background:var(--aiblog-chipbg,#e8ebee);color:var(--aiblog-chiptx,#4e5968);border-radius:14px;padding:2px 9px;font-size:11.5px;margin:2px 4px 0 0}" +
".aiblog-chips{padding:4px 14px 8px;display:flex;flex-wrap:wrap;gap:6px}" +
".aiblog-chip{border:1px solid var(--border,#e5e8eb);background:var(--bg,#fff);color:var(--text,#191f28);border-radius:16px;padding:6px 12px;font-size:12.5px;font-family:inherit;cursor:pointer;transition:border-color .12s}" +
".aiblog-chip:hover{border-color:var(--accent,#2b2f36)}" +
".aiblog-inrow{display:flex;gap:8px;padding:10px 12px 12px;border-top:1px solid var(--border,#e5e8eb)}" +
".aiblog-in{flex:1;height:40px;border-radius:12px;border:1px solid var(--border,#e5e8eb);background:var(--aiblog-soft,#f7f8fa);color:var(--text,#191f28);padding:0 12px;font-size:13.5px;font-family:inherit;outline:none;box-sizing:border-box}" +
".aiblog-in:focus{border-color:var(--accent,#2b2f36);background:var(--bg,#fff)}" +
".aiblog-send{width:40px;height:40px;flex:none;border:none;border-radius:12px;background:var(--accent,#2b2f36);color:#fff;cursor:pointer;display:flex;align-items:center;justify-content:center}" +
".aiblog-send:disabled{opacity:.45;cursor:default}" +
".aiblog-typing{align-self:flex-start;color:var(--aiblog-sub,#8b95a1);font-size:12.5px;padding:2px 4px}" +
".aiblog-sugg{margin-top:8px}" +
".aiblog-schip{border:1px solid var(--border,#e5e8eb);background:var(--bg,#fff);color:var(--text,#191f28);border-radius:14px;padding:4px 10px;font-size:12px;font-family:inherit;cursor:pointer;margin:2px 4px 0 0}" +
".aiblog-schip:hover{border-color:var(--accent,#2b2f36)}" +
/* --- 다크 모드: 스킨의 data-theme 및 OS 설정 모두 대응 --- */
"html[data-theme=dark] .aiblog-box,html[data-theme=dark] .aiblog-ma{--aiblog-soft:#20242b}" +
"html[data-theme=dark] .aiblog-in{--aiblog-soft:#20242b}" +
"html[data-theme=dark] .aiblog-fab,html[data-theme=dark] .aiblog-send,html[data-theme=dark] .aiblog-mu{background:#f2f4f6;color:#191f28}" +
"html[data-theme=dark] .aiblog-badge{background:#f2f4f6;color:#191f28}" +
"html[data-theme=dark] .aiblog-keywords span,html[data-theme=dark] .aiblog-kwrow span{--aiblog-chipbg:#262b33;--aiblog-chiptx:#aab2bd}" +
"html[data-theme=dark] .aiblog-related a:hover,html[data-theme=dark] .aiblog-x:hover{--aiblog-hover:#262b33}" +
"html[data-theme=dark] .aiblog-panel{box-shadow:0 20px 60px rgba(0,0,0,.5)}" +
"@media (max-width:768px){" +
".aiblog-fab{left:16px;bottom:20px}" +
".aiblog-wrap{right:12px;left:12px;bottom:76px;width:auto}" +
".aiblog-in{font-size:16px}" + /* iOS 자동 줌 방지 */
"}";

  function injectCss() {
    var s = document.createElement("style");
    s.id = "aiblog-style";
    s.textContent = CSS;
    document.head.appendChild(s);
  }

  /* ---------------------------------------------------- 검색 스코어링 */

  function tokenize(q) {
    var words = (q.toLowerCase().match(/[가-힣]+|[a-z0-9]{2,}/g) || []);
    var toks = [];
    words.forEach(function (w) {
      toks.push(w);
      if (/[가-힣]/.test(w) && w.length >= 2)
        for (var i = 0; i < w.length - 1; i++) toks.push(w.slice(i, i + 2));
    });
    return toks;
  }

  function scorePost(tokens, p) {
    var title = p.title.toLowerCase();
    var kw = (p.keywords || []).concat(p.tags || []).join(" ").toLowerCase();
    var body = ((p.summary || "") + " " + (p.excerpt || "")).toLowerCase();
    var score = 0;
    tokens.forEach(function (t) {
      if (title.indexOf(t) >= 0) score += 5 * t.length;
      if (kw.indexOf(t) >= 0) score += 3 * t.length;
      if (body.indexOf(t) >= 0) score += 1 * t.length;
    });
    return score;
  }

  function searchPosts(posts, q, n) {
    var tokens = tokenize(q);
    return posts
      .map(function (p) { return { p: p, s: scorePost(tokens, p) }; })
      .filter(function (x) { return x.s > 0; })
      .sort(function (a, b) { return b.s - a.s; })
      .slice(0, n || 5)
      .map(function (x) { return x.p; });
  }

  /* ---------------------------------------------------- 본문 위젯 (요약/관련 글) */

  function renderSummary(article, post) {
    if (!post.summary) return;
    var box = el("div", "aiblog-box aiblog-summary");
    box.appendChild(el("h4", "", SPARK + ' AI 세 줄 요약 <span class="aiblog-badge">AI</span>'));
    box.appendChild(el("div", "", esc(post.summary)));
    if (post.keywords && post.keywords.length) {
      var kws = el("div", "aiblog-keywords");
      post.keywords.forEach(function (k) { kws.appendChild(el("span", "", esc(k))); });
      box.appendChild(kws);
    }
    article.insertBefore(box, article.firstChild);
  }

  function renderRelated(article, post, byId) {
    var ids = (post.related || []).slice(0, CONFIG.RELATED_COUNT);
    var items = ids.map(function (id) { return byId[id]; }).filter(Boolean);
    if (!items.length) return;
    var box = el("div", "aiblog-box aiblog-related");
    box.appendChild(el("h4", "", SPARK + ' 함께 보면 좋은 글'));
    items.forEach(function (p) {
      var a = el("a", "");
      a.href = p.url;
      a.appendChild(el("div", "aiblog-rel-title", esc(p.title)));
      if (p.summary) a.appendChild(el("div", "aiblog-rel-sum", esc(p.summary)));
      box.appendChild(a);
    });
    article.appendChild(box);
  }

  /* ---------------------------------------------------- AI 어시스턴트 패널 */

  function buildAssistant(index, curPost, byId) {
    var posts = index.posts;

    var fab = el("button", "aiblog-fab", SPARK + "<span>AI</span>");
    fab.type = "button";
    fab.setAttribute("aria-label", "AI 어시스턴트 열기");

    var wrap = el("div", "aiblog-wrap");
    var panel = el("div", "aiblog-panel");
    var head = el("div", "aiblog-head",
      SPARK + '<span class="t">AI 어시스턴트</span><span class="c">글 ' + posts.length + '개 학습</span>');
    var xBtn = el("button", "aiblog-x", "&times;");
    xBtn.type = "button";
    xBtn.setAttribute("aria-label", "닫기");
    head.appendChild(xBtn);

    var chat = el("div", "aiblog-chat");
    var chips = el("div", "aiblog-chips");
    var inrow = el("div", "aiblog-inrow");
    var input = el("input", "aiblog-in");
    input.placeholder = "요약, 관련 글, 검색어를 입력해보세요";
    var send = el("button", "aiblog-send", SEND);
    send.type = "button";
    send.setAttribute("aria-label", "보내기");
    inrow.appendChild(input); inrow.appendChild(send);

    panel.appendChild(head); panel.appendChild(chat);
    panel.appendChild(chips); panel.appendChild(inrow);
    wrap.appendChild(panel);
    document.body.appendChild(fab);
    document.body.appendChild(wrap);

    // 티스토리 기본 툴바(왼쪽 아래 .menu_toolbar)와 겹치면 그 위로 자동 회피
    function dodgeTistoryToolbar() {
      var tb = document.querySelector(".menu_toolbar, .toolbar_lb");
      var tr = tb && tb.offsetWidth ? tb.getBoundingClientRect() : null;
      var fabW = fab.offsetWidth || 76;
      var overlapX = tr && tr.width > 0 &&
        CONFIG.FAB_LEFT < tr.right && (CONFIG.FAB_LEFT + fabW) > tr.left;
      if (overlapX) {
        var clear = Math.round(window.innerHeight - tr.top) + 10;
        if (clear > 0 && clear < 220) {
          fab.style.bottom = clear + "px";
          wrap.style.bottom = (clear + 56) + "px";
          return;
        }
      }
      fab.style.bottom = "";
      wrap.style.bottom = "";
    }
    dodgeTistoryToolbar();
    window.addEventListener("resize", dodgeTistoryToolbar);

    /* ---- 말풍선 헬퍼 ---- */

    function scrollDown() { chat.scrollTop = chat.scrollHeight; }

    function userBubble(text) {
      chat.appendChild(el("div", "aiblog-mu", esc(text)));
      scrollDown();
    }

    function aiBubble(html) {
      var b = el("div", "aiblog-ma", html);
      chat.appendChild(b);
      scrollDown();
      return b;
    }

    function cardList(items, withSummary) {
      var box = el("div", "aiblog-cards");
      items.forEach(function (p) {
        var a = el("a", "");
        a.href = p.url;
        a.appendChild(el("div", "ct", esc(p.title)));
        if (withSummary !== false && p.summary)
          a.appendChild(el("div", "cs", esc(p.summary)));
        box.appendChild(a);
      });
      return box;
    }

    /* ---- 의도 파악 ---- */

    var FILLER = /이\s*글|현재\s*글|지금\s*글|요약|정리|세\s*줄|3\s*줄|줄여|관련|비슷|연관|추천|함께|볼만한|볼\s*만한|최근|최신|새로운|새\s*글|글|포스트|포스팅|검색|찾아줘|찾아봐|찾아|알려줘|알려|보여줘|해줘|해주세요|해봐|주세요|좀|의|된|한/g;

    function residualTopic(q) {
      return q.replace(FILLER, " ").replace(/\s+/g, " ").trim();
    }

    function parseIntent(q) {
      var t = q.replace(/\s+/g, "");
      var topic = residualTopic(q);
      if (/^(안녕|하이|헬로|ㅎㅇ|반가)/.test(t)) return { kind: "greet" };
      if (/고마워|고맙|감사|땡큐/.test(t)) return { kind: "thanks" };
      if (/도움말|사용법|뭐할수|뭘할수|무엇을할수|어떻게(써|사용)|기능(이|을)?(뭐|알려)/.test(t)) return { kind: "help" };
      if (/인기|많이본|유명|잘나가|조회수|베스트/.test(t)) return { kind: "popular" };
      if (/주제|카테고리|무슨글|어떤글|뭐있|뭐가있|뭐다[루뤄]|뭐올|뭐쓰|소개/.test(t)) return { kind: "topics" };
      if (/몇개|몇편|몇건|개수/.test(t)) return { kind: "count" };
      if (/요약|정리|세줄|3줄|줄여/.test(t)) return { kind: "summary", topic: topic };
      if (/관련|비슷|연관|추천|함께볼|볼만한/.test(t)) return { kind: "related", topic: topic };
      if (/최근|최신|새글|새로운글/.test(t) && topic.length < 2) return { kind: "recent" };
      return { kind: "search", topic: topic.length >= 2 ? topic : q };
    }

    /* ---- 블로그 전체 통계 헬퍼 ---- */

    function topKeywords(n) {
      var cnt = {};
      posts.forEach(function (p) {
        (p.keywords || []).forEach(function (k) { cnt[k] = (cnt[k] || 0) + 1; });
      });
      return Object.keys(cnt)
        .sort(function (a, b) { return cnt[b] - cnt[a]; })
        .slice(0, n);
    }

    function suggestChips(words) {
      var box = el("div", "aiblog-sugg");
      words.forEach(function (w) {
        var s = el("button", "aiblog-schip", esc(w));
        s.type = "button";
        s.onclick = function () { submit(w); };
        box.appendChild(s);
      });
      return box;
    }

    /* ---- 응답 로직 ---- */

    function replySummary(topic) {
      var target = null, prefix = "";
      if (topic && topic.length >= 2) {
        var hits = searchPosts(posts, topic, 1);
        if (hits.length) { target = hits[0]; prefix = "<b>" + esc(target.title) + "</b> 글의 요약이에요.<br><br>"; }
      }
      if (!target && curPost) target = curPost;
      if (!target) {
        aiBubble("어떤 글을 요약할지 못 찾았어요. 글 제목이나 키워드를 함께 입력해보세요. (예: \"BIST 글 요약해줘\")");
        return;
      }
      if (!target.summary) {
        aiBubble("이 글은 아직 인덱싱 전이에요. 새 글은 다음 자동 업데이트(월·목 새벽) 후 반영됩니다.");
        return;
      }
      var b = aiBubble(prefix + esc(target.summary));
      if (target.keywords && target.keywords.length) {
        var kw = el("div", "aiblog-kwrow");
        target.keywords.forEach(function (k) { kw.appendChild(el("span", "", esc(k))); });
        b.appendChild(kw);
      }
      if (target !== curPost) {
        b.appendChild(cardList([target], false));
      }
    }

    function replyRelated(topic) {
      var base = null, intro;
      if (topic && topic.length >= 2) {
        var hits = searchPosts(posts, topic, 1);
        if (hits.length) base = hits[0];
      }
      if (!base && curPost) base = curPost;
      if (base) {
        var ids = (base.related || []).slice(0, CONFIG.RELATED_COUNT);
        var items = ids.map(function (id) { return byId[id]; }).filter(Boolean);
        if (items.length) {
          intro = (base === curPost)
            ? "지금 보시는 글과 함께 읽기 좋은 글이에요."
            : "<b>" + esc(base.title) + "</b> 글과 관련된 글이에요.";
          aiBubble(intro).appendChild(cardList(items));
          return;
        }
      }
      // 글 기준이 없으면 최신 글 추천
      replyRecent("기준 글이 없어서 최신 글을 추천해드려요.");
    }

    function replyRecent(introText) {
      var items = posts.slice()
        .filter(function (p) { return p.date; })
        .sort(function (a, b) { return a.date < b.date ? 1 : -1; })
        .slice(0, 5);
      if (!items.length) items = posts.slice(0, 5);
      aiBubble(introText || "가장 최근에 올라온 글이에요.").appendChild(cardList(items));
    }

    function replySearch(q) {
      var items = searchPosts(posts, q, 5);
      if (!items.length) {
        var b = aiBubble("“" + esc(q) + "”에 대한 글을 찾지 못했어요. 이런 주제는 어떠세요?");
        b.appendChild(suggestChips(topKeywords(6)));
        return;
      }
      aiBubble("“" + esc(q) + "” 관련해서 이런 글이 있어요.").appendChild(cardList(items));
    }

    function replyGreet() {
      aiBubble("안녕하세요! 궁금한 주제를 입력하시거나 아래 버튼을 눌러보세요.");
    }

    function replyThanks() {
      aiBubble("도움이 됐다니 기뻐요! 더 궁금한 게 있으면 언제든 물어보세요.");
    }

    function replyHelp() {
      aiBubble("제가 할 수 있는 일이에요.<br>" +
        "· <b>이 글 요약해줘</b> — 지금 보는 글 3줄 요약<br>" +
        "· <b>BIST 글 요약해줘</b> — 특정 주제 글 요약<br>" +
        "· <b>관련 글 찾아줘</b> — 함께 읽을 글 추천<br>" +
        "· <b>인기 글</b> / <b>최근 글</b> / <b>주제 알려줘</b><br>" +
        "· 아무 키워드나 입력하면 블로그 검색");
    }

    function replyCount() {
      aiBubble("지금까지 글 " + posts.length + "개를 학습하고 있어요. 새 글은 매주 자동으로 추가됩니다.");
    }

    function replyPopular() {
      var cnt = {};
      posts.forEach(function (p) {
        (p.related || []).forEach(function (id) { cnt[id] = (cnt[id] || 0) + 1; });
      });
      var items = posts.slice()
        .sort(function (a, b) { return (cnt[b.id] || 0) - (cnt[a.id] || 0); })
        .slice(0, 5);
      aiBubble("조회수 통계까지는 볼 수 없어서, 다른 글들과 가장 많이 연결되는 <b>핵심 글</b>을 골라봤어요.")
        .appendChild(cardList(items));
    }

    function replyTopics() {
      var catCnt = {};
      posts.forEach(function (p) {
        if (p.category) catCnt[p.category] = (catCnt[p.category] || 0) + 1;
      });
      var cats = Object.keys(catCnt)
        .sort(function (a, b) { return catCnt[b] - catCnt[a]; })
        .slice(0, 6);
      var html = "이 블로그(글 " + posts.length + "개)는 이런 주제를 다뤄요.";
      if (cats.length) {
        html += "<br><br><b>카테고리</b><br>" + cats.map(function (c) {
          return "· " + esc(c) + " (" + catCnt[c] + ")";
        }).join("<br>");
      }
      var b = aiBubble(html);
      var kws = topKeywords(8);
      if (kws.length) {
        b.appendChild(el("div", "", "<br><b>자주 나오는 키워드</b> — 눌러서 검색해보세요"));
        b.appendChild(suggestChips(kws));
      }
    }

    function replyWorker(q) {
      var typing = el("div", "aiblog-typing", "AI가 답변을 생각하는 중…");
      chat.appendChild(typing); scrollDown();
      fetch(CONFIG.WORKER_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question: q })
      }).then(function (r) { return r.json(); }).then(function (data) {
        typing.remove();
        var b = aiBubble(esc(data.answer || "답변을 생성하지 못했어요."));
        if (data.sources && data.sources.length) {
          b.appendChild(cardList(data.sources.map(function (s) {
            return { url: s.url, title: s.title };
          }), false));
        }
      }).catch(function () {
        typing.remove();
        aiBubble("답변 생성 중 오류가 났어요. 잠시 후 다시 시도해주세요.");
      });
    }

    function isQuestion(q) {
      return /\?|뭐|무엇|어떻|어떤가|왜|언제|어디|누구|차이|비교|인가요|일까|건가요|맞나/.test(q);
    }

    function route(q) {
      if (CONFIG.WORKER_URL && isQuestion(q)) { replyWorker(q); return; }
      var it = parseIntent(q);
      if (it.kind === "greet") replyGreet();
      else if (it.kind === "thanks") replyThanks();
      else if (it.kind === "help") replyHelp();
      else if (it.kind === "popular") replyPopular();
      else if (it.kind === "topics") replyTopics();
      else if (it.kind === "count") replyCount();
      else if (it.kind === "summary") replySummary(it.topic);
      else if (it.kind === "related") replyRelated(it.topic);
      else if (it.kind === "recent") replyRecent();
      else replySearch(it.topic);
    }

    function submit(text) {
      var q = (text !== undefined ? text : input.value).trim();
      if (!q) return;
      input.value = "";
      userBubble(q);
      setTimeout(function () { route(q); }, 180);
    }

    /* ---- 퀵칩 ---- */

    var chipDefs = [];
    if (curPost) {
      chipDefs.push({ label: "이 글 3줄 요약", q: "이 글 요약해줘" });
      chipDefs.push({ label: "관련 글 추천", q: "관련 글 찾아줘" });
      chipDefs.push({ label: "최근 글", q: "최근 글 보여줘" });
    } else {
      chipDefs.push({ label: "인기 글", q: "인기 글 보여줘" });
      chipDefs.push({ label: "최근 글", q: "최근 글 보여줘" });
      chipDefs.push({ label: "주제 보기", q: "주제 알려줘" });
    }
    if (CONFIG.WORKER_URL) chipDefs.push({ label: "AI에게 질문", q: null });
    chipDefs.forEach(function (d) {
      var c = el("button", "aiblog-chip", esc(d.label));
      c.type = "button";
      c.onclick = function () {
        if (d.q) submit(d.q);
        else { input.placeholder = "블로그 내용에 대해 질문해보세요"; input.focus(); }
      };
      chips.appendChild(c);
    });

    /* ---- 이벤트 ---- */

    var greeted = false;
    function openPanel() {
      wrap.classList.add("open");
      if (!greeted) {
        greeted = true;
        var hello = curPost
          ? "안녕하세요! 이 블로그의 글 " + posts.length + "개를 학습했어요.<br>아래 버튼을 누르거나 “이 글 요약해줘”, “관련 글 찾아줘”처럼 입력해보세요."
          : "안녕하세요! 이 블로그의 글 " + posts.length + "개를 학습했어요.<br>궁금한 주제를 검색하거나 “인기 글”, “주제 보기”를 눌러보세요.";
        aiBubble(hello);
      }
      setTimeout(function () { input.focus(); }, 120);
    }
    function closePanel() { wrap.classList.remove("open"); }

    fab.onclick = function () {
      if (wrap.classList.contains("open")) closePanel(); else openPanel();
    };
    xBtn.onclick = closePanel;
    document.addEventListener("keydown", function (e) {
      if (e.key === "Escape") closePanel();
    });
    document.addEventListener("click", function (e) {
      if (wrap.classList.contains("open") &&
          !wrap.contains(e.target) && !fab.contains(e.target)) closePanel();
    });

    send.onclick = function () { submit(); };
    input.addEventListener("keydown", function (e) {
      if (e.key === "Enter") submit();
    });
  }

  /* ---------------------------------------------------- 초기화 */

  function cleanup() {
    ["#aiblog-style", ".aiblog-fab", ".aiblog-wrap", ".aiblog-box", ".aiblog-modal"]
      .forEach(function (sel) {
        document.querySelectorAll(sel).forEach(function (n) { n.remove(); });
      });
  }

  function init() {
    cleanup();
    injectCss();
    fetch(CONFIG.INDEX_URL, { cache: "default" })
      .then(function (r) { if (!r.ok) throw new Error(r.status); return r.json(); })
      .then(function (index) {
        var byId = {};
        index.posts.forEach(function (p) { byId[p.id] = p; });

        var pid = postIdFromUrl();
        var curPost = (pid && byId[pid]) ? byId[pid] : null;

        buildAssistant(index, curPost, byId);

        if (curPost) {
          var article = findArticleEl();
          if (article) {
            renderSummary(article, curPost);
            renderRelated(article, curPost, byId);
          }
        }
      })
      .catch(function (e) { console.warn("[ai-features] 인덱스 로드 실패:", e); });
  }

  if (document.readyState === "loading")
    document.addEventListener("DOMContentLoaded", init);
  else init();
})();
