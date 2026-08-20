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
    // Q&A 챗봇용 Cloudflare Worker 주소 (비우면 인덱스 기반 응답만)
    WORKER_URL: "https://blog-ai-qa.jong060479.workers.dev",
    MERMAID_URL: "https://cdn.jsdelivr.net/npm/mermaid@11.17.0/dist/mermaid.esm.min.mjs",
    WAVEDROM_SKIN_URL: "https://cdn.jsdelivr.net/npm/wavedrom@3.6.2/skins/default.js",
    WAVEDROM_URL: "https://cdn.jsdelivr.net/npm/wavedrom@3.6.2/wavedrom.min.js",
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

  /* ---- 익명 사용 기록: Worker /log → Cloudflare 대시보드 Logs에서 열람.
     방문자 신원·IP는 기록하지 않고 이벤트 종류/검색어/글 번호만 보냄. ---- */
  function logEvt(t, data) {
    if (!CONFIG.WORKER_URL) return;
    try {
      var pid = postIdFromUrl();
      var payload = { t: t, path: location.pathname, from: pid ? String(pid) : "" };
      if (data) for (var k in data) payload[k] = data[k];
      var body = JSON.stringify(payload);
      // text/plain이라 CORS preflight 없이 전송됨 (Worker가 JSON으로 파싱)
      if (navigator.sendBeacon) {
        navigator.sendBeacon(CONFIG.WORKER_URL + "/log",
          new Blob([body], { type: "text/plain" }));
      } else {
        fetch(CONFIG.WORKER_URL + "/log", { method: "POST", body: body, keepalive: true });
      }
    } catch (e) {}
  }

  var openAssistant = null; // buildAssistant가 채움 — 요약 박스 CTA가 사용

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
".aiblog-more{display:block;margin-top:12px;border:none;background:none;padding:0;color:var(--aiblog-chiptx,#4e5968);font-size:12.5px;font-family:inherit;cursor:pointer;text-decoration:underline;text-underline-offset:3px}" +
".aiblog-more:hover{color:var(--text,#191f28)}" +
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
".aiblog-head .c{font-size:11.5px;color:var(--aiblog-sub,#6b7684);margin-left:auto;margin-right:6px}" +
".aiblog-kbd{font:700 10px/1.5 ui-monospace,SFMono-Regular,Consolas,monospace;color:var(--aiblog-sub,#6b7684);border:1px solid var(--border,#e5e8eb);border-bottom-width:2px;border-radius:5px;padding:1px 5px;background:var(--aiblog-soft,#f7f8fa);white-space:nowrap}" +
".aiblog-x{border:none;background:none;color:var(--aiblog-sub,#6b7684);font-size:20px;line-height:1;cursor:pointer;padding:2px 4px;border-radius:8px}" +
".aiblog-x:hover{background:var(--aiblog-hover,#eef1f4)}" +
".aiblog-chat{flex:1;overflow-y:auto;overscroll-behavior:contain;padding:14px;display:flex;flex-direction:column;gap:10px}" +
".aiblog-mu{align-self:flex-end;background:var(--accent,#2b2f36);color:#fff;padding:9px 13px;border-radius:16px 16px 4px 16px;font-size:13.5px;line-height:1.55;max-width:85%;word-break:break-word}" +
".aiblog-ma{align-self:flex-start;background:var(--aiblog-soft,#f2f4f6);color:var(--text,#191f28);padding:11px 13px;border-radius:16px 16px 16px 4px;font-size:13.5px;line-height:1.65;max-width:94%;word-break:break-word}" +
".aiblog-ma b{font-weight:800}" +
".aiblog-cite{font-size:10px;line-height:0;margin-left:2px;vertical-align:super}" +
".aiblog-cite a{color:var(--text,#191f28);font-weight:800;text-decoration:none;border-bottom:1px solid var(--aiblog-sub,#6b7684)}" +
".aiblog-cite a:hover{border-bottom-color:var(--text,#191f28)}" +
".aiblog-cards a{display:block;background:var(--bg,#fff);border:1px solid var(--border,#e5e8eb);border-radius:12px;padding:10px 12px;margin-top:8px;text-decoration:none}" +
".aiblog-cards a:hover{border-color:var(--accent,#2b2f36)}" +
".aiblog-cards .ct{font-weight:700;font-size:13.5px;color:var(--text,#191f28)}" +
".aiblog-cards .cs{font-size:12px;color:var(--aiblog-sub,#6b7684);margin-top:3px;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden}" +
".aiblog-feedback{display:flex;align-items:center;gap:6px;margin-top:9px;padding-top:8px;border-top:1px solid var(--border,#e5e8eb);color:var(--aiblog-sub,#6b7684);font-size:11.5px}" +
".aiblog-fb{border:1px solid var(--border,#e5e8eb);background:var(--bg,#fff);color:var(--aiblog-sub,#6b7684);border-radius:12px;padding:3px 8px;font:inherit;cursor:pointer}" +
".aiblog-fb:hover,.aiblog-fb.on{border-color:var(--text,#191f28);color:var(--text,#191f28)}" +
".aiblog-fb:disabled{cursor:default;opacity:.62}" +
".aiblog-kwrow{margin-top:8px}" +
".aiblog-kwrow span{display:inline-block;background:var(--aiblog-chipbg,#e8ebee);color:var(--aiblog-chiptx,#4e5968);border-radius:14px;padding:2px 9px;font-size:11.5px;margin:2px 4px 0 0}" +
".aiblog-chips{padding:4px 14px 8px;display:flex;flex-wrap:wrap;gap:6px}" +
".aiblog-chip{border:1px solid var(--border,#e5e8eb);background:var(--bg,#fff);color:var(--text,#191f28);border-radius:16px;padding:6px 12px;font-size:12.5px;font-family:inherit;cursor:pointer;transition:border-color .12s}" +
".aiblog-chip:hover{border-color:var(--accent,#2b2f36)}" +
".aiblog-inputarea{border-top:1px solid var(--border,#e5e8eb);padding:8px 12px 10px}" +
".aiblog-inrow{display:flex;gap:8px;padding:0}" +
".aiblog-privacy{margin:7px 2px 0;color:var(--aiblog-sub,#6b7684);font-size:9.5px;line-height:1.45;word-break:keep-all}" +
".aiblog-in{flex:1;height:40px;border-radius:12px;border:1px solid var(--border,#e5e8eb);background:var(--aiblog-soft,#f7f8fa);color:var(--text,#191f28);padding:0 12px;font-size:13.5px;font-family:inherit;outline:none;box-sizing:border-box}" +
".aiblog-in:focus{border-color:var(--accent,#2b2f36);background:var(--bg,#fff)}" +
".aiblog-send{width:40px;height:40px;flex:none;border:none;border-radius:12px;background:var(--accent,#2b2f36);color:#fff;cursor:pointer;display:flex;align-items:center;justify-content:center}" +
".aiblog-send:disabled{opacity:.45;cursor:default}" +
".aiblog-typing{align-self:flex-start;color:var(--aiblog-sub,#6b7684);font-size:12.5px;padding:2px 4px}" +
".aiblog-sugg{margin-top:8px}" +
".aiblog-schip{border:1px solid var(--border,#e5e8eb);background:var(--bg,#fff);color:var(--text,#191f28);border-radius:14px;padding:4px 10px;font-size:12px;font-family:inherit;cursor:pointer;margin:2px 4px 0 0}" +
".aiblog-schip:hover{border-color:var(--accent,#2b2f36)}" +
/* --- 다크 모드: 스킨의 data-theme 및 OS 설정 모두 대응 --- */
"html[data-theme=dark] .aiblog-box,html[data-theme=dark] .aiblog-ma{--aiblog-soft:#20242b}" +
"html[data-theme=dark] .aiblog-in{--aiblog-soft:#20242b}" +
"html[data-theme=dark] .aiblog-fab,html[data-theme=dark] .aiblog-send,html[data-theme=dark] .aiblog-mu{background:#f2f4f6;color:#191f28}" +
"html[data-theme=dark] .aiblog-badge{background:#f2f4f6;color:#191f28}" +
"html[data-theme=dark] .aiblog-keywords span,html[data-theme=dark] .aiblog-kwrow span{--aiblog-chipbg:#262b33;--aiblog-chiptx:#aab2bd}" +
"html[data-theme=dark] .aiblog-x:hover{--aiblog-hover:#262b33}" +
"html[data-theme=dark] .aiblog-panel{box-shadow:0 20px 60px rgba(0,0,0,.5)}" +
// 다크에서는 보조 텍스트를 살짝 밝게 (라이트 기본 #6b7684는 어두운 배경에서 침침함)
"html[data-theme=dark] .aiblog-wrap,html[data-theme=dark] .aiblog-box{--aiblog-sub:#9aa4af}" +
// 최신 브라우저: 모바일 URL바 변동에 흔들리지 않는 dvh 사용
"@supports (height:100dvh){.aiblog-panel{max-height:min(560px,calc(100dvh - 170px))}}" +
"@media (max-width:768px){" +
// iPhone 홈 인디케이터(safe-area) 회피
".aiblog-fab{left:16px;bottom:calc(20px + env(safe-area-inset-bottom,0px))}" +
".aiblog-wrap{right:12px;left:12px;bottom:calc(76px + env(safe-area-inset-bottom,0px));width:auto}" +
".aiblog-in{font-size:16px}" + /* iOS 자동 줌 방지 */
".aiblog-kbd{display:none}" +
"}" +
/* 짧은 화면(가로 모드 폰 등): 패널을 화면에 꽉 채워 채팅 영역 확보 */
"@media (max-height:520px){" +
".aiblog-wrap{bottom:60px}" +
".aiblog-panel{max-height:calc(100vh - 70px)}" +
"@supports (height:100dvh){.aiblog-panel{max-height:calc(100dvh - 70px)}}" +
"}" +
"@media (prefers-reduced-motion:reduce){.aiblog-fab,.aiblog-wrap,.aiblog-chip{transition:none}}" +
/* --- 기술 문서 공통 UI: Breadcrumb, 메타데이터, 코드, 다이어그램 --- */
".tech-breadcrumb{display:flex;align-items:center;gap:7px;margin:2px 0 10px;font-size:12px;line-height:1.5;color:var(--aiblog-sub,#6b7684);white-space:nowrap;overflow:hidden}" +
".tech-breadcrumb a{color:inherit;text-decoration:none}" +
".tech-breadcrumb a:hover{color:var(--text,#191f28);text-decoration:underline;text-underline-offset:3px}" +
".tech-breadcrumb .sep{opacity:.55}" +
".tech-breadcrumb .current{overflow:hidden;text-overflow:ellipsis}" +
".tech-post-meta{display:flex;align-items:center;flex-wrap:wrap;gap:6px 9px;margin:0 0 20px;padding-bottom:14px;border-bottom:1px solid var(--border,#e5e8eb);font-size:12px;color:var(--aiblog-sub,#6b7684)}" +
".tech-post-meta span+span:before{content:'·';margin-right:9px;color:var(--border,#c8cdd3)}" +
".tech-code-shell{margin:24px 0;border:1px solid var(--border,#dfe3e8);border-radius:14px;overflow:hidden;background:#111318;box-shadow:0 6px 18px rgba(0,0,0,.08)}" +
".tech-code-head{min-height:40px;padding:7px 9px 7px 14px;display:flex;align-items:center;gap:8px;background:#20232a;border-bottom:1px solid #343943;color:#d7dce3;box-sizing:border-box}" +
".tech-code-name{min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font:700 11.5px/1.4 ui-monospace,SFMono-Regular,Consolas,monospace}" +
".tech-code-lang{margin-right:auto;color:#929ba8;font:700 10px/1.4 ui-monospace,SFMono-Regular,Consolas,monospace;text-transform:uppercase;letter-spacing:.35px}" +
".tech-code-actions{display:flex;align-items:center;gap:5px;flex:none}" +
".tech-code-btn,.tech-code-link{height:27px;display:inline-flex;align-items:center;justify-content:center;border:1px solid #454b56;border-radius:7px;padding:0 8px;background:#292d35;color:#e5e8ec;text-decoration:none;font:700 10.5px/1 ui-sans-serif,system-ui,sans-serif;cursor:pointer;box-sizing:border-box}" +
".tech-code-btn:hover,.tech-code-link:hover{background:#353a44;border-color:#68707d;color:#fff}" +
".tech-code-body{display:grid;grid-template-columns:auto minmax(0,1fr);overflow:auto;background:#111318}" +
".tech-code-lines{position:sticky;left:0;z-index:1;padding:16px 10px 16px 12px;background:#171a20;border-right:1px solid #2b3039;color:#657080;text-align:right;user-select:none;font:12px/1.65 ui-monospace,SFMono-Regular,Consolas,monospace;white-space:pre}" +
".tech-code-shell pre{grid-column:2!important;margin:0!important;padding:16px!important;min-width:max-content!important;border:0!important;border-radius:0!important;background:#111318!important;color:#e5e8ec!important;box-shadow:none!important;overflow:visible!important;font:12px/1.65 ui-monospace,SFMono-Regular,Consolas,monospace!important;tab-size:2}" +
".tech-code-shell pre code{font:inherit!important;background:transparent!important;color:inherit!important}" +
".tech-diagram{margin:24px 0;padding:18px;border:1px solid var(--border,#e5e8eb);border-radius:14px;background:#fff;color:#191f28;overflow:auto;box-sizing:border-box}" +
".tech-diagram svg{display:block;max-width:100%;height:auto;margin:auto}" +
".tech-diagram-error{font-size:12px;color:#8b2c2c}" +
"html[data-theme=dark] .tech-breadcrumb,html[data-theme=dark] .tech-post-meta{--aiblog-sub:#a8b0ba}" +
"html[data-theme=dark] .article_view img,html[data-theme=dark] .tt_article_useless_p_margin img,html[data-theme=dark] .contents_style img{background:#fff;border-radius:4px}" +
"@media (max-width:640px){.tech-code-head{align-items:flex-start;flex-wrap:wrap}.tech-code-name{max-width:60%}.tech-code-lang{order:3;width:100%}.tech-code-link{display:none}.tech-code-shell pre{font-size:11px!important}.tech-code-lines{font-size:11px}.tech-post-meta{gap:5px 7px}.tech-post-meta span+span:before{margin-right:7px}}" +
"@media print{.aiblog-fab,.aiblog-wrap,.tech-code-actions{display:none!important}.tech-code-shell{box-shadow:none}.tech-code-body{overflow:visible}.tech-code-shell pre{white-space:pre-wrap!important;min-width:0!important}}" +
/* --- 홈 섹션: 주제별 허브 --- */
/* 폭은 스킨 섹션(콘텐츠 1180px, 내부 패딩 18px)과 정렬 — 실측 기준 */
/* 상하 리듬은 스킨 섹션과 동일(위 72/모바일 48, 아래 0) — 정확한 값은 alignHomeSections가 스킨에서 복사 */
".aihome-sec{max-width:1216px;margin:72px auto 0;padding:0 18px;box-sizing:border-box;color:#191f28}" +
".aihome-tit{display:block;font-size:22px;font-weight:800;margin:0 0 14px;color:#191f28}" +
".aihome-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(220px,1fr));gap:10px}" +
".aihome-topic{display:flex;flex-direction:column;gap:4px;border:1px solid #e5e8eb;border-radius:14px;padding:14px 16px;text-decoration:none;background:#fff;transition:border-color .15s,transform .15s}" +
".aihome-topic:hover{border-color:#2b2f36;transform:translateY(-2px)}" +
".aihome-topic .tl{font-weight:800;font-size:14.5px;color:#191f28}" +
".aihome-topic .tn{font-weight:700;font-size:11.5px;color:#4e5968;background:#eef1f4;border-radius:10px;padding:1px 7px;margin-left:4px}" +
".aihome-topic .td{font-size:12.5px;color:#6b7684}" +
"html[data-theme=dark] .aihome-sec{color:#ecf0f3}" +
"html[data-theme=dark] .aihome-tit{color:#ecf0f3}" +
"html[data-theme=dark] .aihome-topic{background:#202027;border-color:#34343e}" +
"html[data-theme=dark] .aihome-topic:hover{background:#292931;border-color:#555563}" +
"html[data-theme=dark] .aihome-topic .tl{color:#ecf0f3}" +
"html[data-theme=dark] .aihome-topic .tn{color:#c5ccd4;background:#31313a}" +
"html[data-theme=dark] .aihome-topic .td{color:#9ea7b2}" +
"@media (max-width:768px){.aihome-sec{padding:0 16px;margin-top:48px}}" +
/* 허브는 상단 카테고리 메뉴가 보이는 폭(>1560px)에선 중복이라 숨김 —
   메뉴가 햄버거로 숨는 폭(≤1560px, 아래 헤더 보정 참고)에서만 표시 */
"@media (min-width:1561px){.aihome-hub{display:none}}" +
"@media (prefers-reduced-motion:reduce){.aihome-topic{transition:none}}" +
/* 스킨 헤더 보정: 중간 폭에서 상단 카테고리 메뉴가 우측 아이콘(테마/검색/메뉴)과
   겹치는 문제 — 1800px 이하는 메뉴 글자 축소, 1560px 이하는 메뉴를 숨겨
   스킨의 햄버거(≡) 메뉴로 대체 (실측: 메뉴 폭 ~985px, 원래 1800px 밑에서 충돌) */
"@media (max-width:1800px){nav.header_category ul.tt_category a{font-size:13px !important;letter-spacing:-.2px}}" +
"@media (max-width:1560px){nav.header_category{display:none !important}}";

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
    var more = el("button", "aiblog-more", "이 글이 궁금하면 AI에게 질문하기 →");
    more.type = "button";
    more.onclick = function (e) {
      e.stopPropagation(); // 패널의 "바깥 클릭 시 닫기"에 걸리지 않게
      if (openAssistant) openAssistant();
    };
    box.appendChild(more);
    article.insertBefore(box, article.firstChild);
  }

  /* ---------------------------------------------------- 기술 문서 UI */

  function metaContent(property) {
    var m = document.querySelector('meta[property="' + property + '"]');
    return m ? (m.getAttribute("content") || "") : "";
  }

  function compactDate(value) {
    var m = String(value || "").match(/^(\d{4})-(\d{2})-(\d{2})/);
    return m ? m[1] + "." + m[2] + "." + m[3] : "";
  }

  function articleReadingMinutes(article) {
    var clone = article.cloneNode(true);
    clone.querySelectorAll("pre,script,style,.aiblog-box,.tech-breadcrumb,.tech-post-meta,.tech-code-head,.tech-code-lines")
      .forEach(function (n) { n.remove(); });
    var text = (clone.textContent || "").replace(/\s+/g, " ").trim();
    // 한글 기술 문서는 수식·영문 용어가 섞이므로 분당 약 500자를 보수적으로 적용.
    return Math.max(1, Math.ceil(text.length / 500));
  }

  function currentCategory(post) {
    var link = document.querySelector('.current-category-name a[href*="/category/"]');
    if (!link) {
      var wanted = String((post && post.category) || "").replace(/\(\d+\)$/, "").trim();
      var links = document.querySelectorAll('a[href*="/category/"]');
      for (var i = links.length - 1; i >= 0; i--) {
        var label = (links[i].textContent || "").replace(/\d+$/, "").trim();
        if (wanted && label === wanted) { link = links[i]; break; }
      }
    }
    if (link) {
      return {
        name: (link.textContent || "").trim().replace(/\d+$/, ""),
        url: new URL(link.getAttribute("href"), location.origin).href
      };
    }
    var fallback = String((post && post.category) || "").replace(/\(\d+\)$/, "").trim();
    return fallback ? { name: fallback, url: location.origin + "/category/" + encodeURIComponent(fallback) } : null;
  }

  function renderArticleMeta(article, post) {
    var category = currentCategory(post);
    var breadcrumb = el("nav", "tech-breadcrumb");
    breadcrumb.setAttribute("aria-label", "Breadcrumb");

    var home = el("a", "", "Home");
    home.href = location.origin + "/";
    breadcrumb.appendChild(home);
    if (category) {
      breadcrumb.appendChild(el("span", "sep", "›"));
      var cat = el("a", "", esc(category.name));
      cat.href = category.url;
      breadcrumb.appendChild(cat);
    }
    breadcrumb.appendChild(el("span", "sep", "›"));
    var current = el("span", "current", esc(post.title));
    current.setAttribute("aria-current", "page");
    breadcrumb.appendChild(current);

    var publishedRaw = metaContent("article:published_time") || post.date;
    var modifiedRaw = metaContent("article:modified_time");
    var published = compactDate(publishedRaw);
    var modified = compactDate(modifiedRaw);
    var meta = el("div", "tech-post-meta");
    if (published) {
      var pub = el("span", "", "작성 " + published);
      pub.setAttribute("title", publishedRaw);
      meta.appendChild(pub);
    }
    if (modified && modified !== published) {
      var mod = el("span", "", "최종 수정 " + modified);
      mod.setAttribute("title", modifiedRaw);
      meta.appendChild(mod);
    }
    meta.appendChild(el("span", "", articleReadingMinutes(article) + "분 읽기"));

    var frag = document.createDocumentFragment();
    frag.appendChild(breadcrumb);
    frag.appendChild(meta);
    article.insertBefore(frag, article.firstChild);

    var items = [{
      "@type": "ListItem", position: 1, name: "Home", item: location.origin + "/"
    }];
    if (category) items.push({
      "@type": "ListItem", position: 2, name: category.name, item: category.url
    });
    items.push({
      "@type": "ListItem", position: items.length + 1, name: post.title, item: post.url || location.href.split("?")[0]
    });
    var json = document.createElement("script");
    json.id = "tech-breadcrumb-jsonld";
    json.type = "application/ld+json";
    json.textContent = JSON.stringify({
      "@context": "https://schema.org", "@type": "BreadcrumbList", itemListElement: items
    });
    document.head.appendChild(json);
  }

  function codeText(pre) {
    var code = pre.querySelector("code");
    return ((code && code.textContent) || pre.textContent || "").replace(/^\n/, "");
  }

  function blockLanguage(pre) {
    var code = pre.querySelector("code");
    return [pre.getAttribute("data-ke-language"), pre.className,
      code && code.className].filter(Boolean).join(" ").toLowerCase();
  }

  function detectCodeLanguage(source, pre) {
    var s = source || "";
    var hint = blockLanguage(pre);
    if (/\b(always_ff|always_comb|always_latch|logic|typedef\s+enum|interface)\b/.test(s))
      return { key: "systemverilog", label: "SystemVerilog", ext: ".sv" };
    if (/`timescale|\bmodule\s+[a-zA-Z_]\w*|\bendmodule\b|\balways\s*@|\bassign\s+/.test(s))
      return { key: "verilog", label: "Verilog", ext: ".v" };
    if (/\b(entity\s+\w+\s+is|architecture\s+\w+\s+of|std_logic)\b/i.test(s))
      return { key: "vhdl", label: "VHDL", ext: ".vhd" };
    if (/\b(set_property|create_clock|get_ports|get_pins|set_input_delay|set_output_delay)\b/.test(s))
      return { key: "xdc", label: "Tcl / XDC", ext: ".xdc" };
    if (/^\s*(#include\s*[<"]|int\s+main\s*\(|void\s+\w+\s*\()/m.test(s))
      return { key: /\b(std::|cout\s*<<|class\s+\w+)/.test(s) ? "cpp" : "c", label: /\b(std::|cout\s*<<|class\s+\w+)/.test(s) ? "C++" : "C", ext: /\b(std::|cout\s*<<|class\s+\w+)/.test(s) ? ".cpp" : ".c" };
    if (/^\s*(def\s+\w+\s*\(|from\s+\w+\s+import|import\s+\w+)/m.test(s))
      return { key: "python", label: "Python", ext: ".py" };
    if (/^\s*(#!.*\b(?:sh|bash)|(?:npm|pnpm|yarn|git|curl|wget)\s+)/m.test(s))
      return { key: "shell", label: "Shell", ext: ".sh" };
    if (/\b(SELECT|INSERT\s+INTO|CREATE\s+TABLE|UPDATE\s+\w+\s+SET)\b/i.test(s))
      return { key: "sql", label: "SQL", ext: ".sql" };
    if (/(^|\s)(json|javascript|js)(\s|$)/.test(hint))
      return { key: hint.indexOf("json") >= 0 ? "json" : "javascript", label: hint.indexOf("json") >= 0 ? "JSON" : "JavaScript", ext: hint.indexOf("json") >= 0 ? ".json" : ".js" };
    return { key: "text", label: "Code", ext: ".txt" };
  }

  function inferredFilename(pre, source, lang, index) {
    var fileRe = /(?:\[\s*)?([\w.-]+\.(?:sv|v|vhd|vhdl|c|cpp|h|hpp|py|tcl|xdc|sdc|sh|json|js))(?:\s*\])?/i;
    var node = pre, nearby = "";
    for (var depth = 0; depth < 3 && node; depth++, node = node.parentElement) {
      var prev = node.previousElementSibling, count = 0;
      while (prev && count < 3) {
        nearby = (prev.textContent || "") + "\n" + nearby;
        prev = prev.previousElementSibling; count++;
      }
      var match = nearby.match(fileRe);
      if (match) return match[1];
    }
    var named = source.match(/(?:Module\s+Name\s*:\s*|\bmodule\s+)([a-zA-Z_]\w*)/i);
    if (named && /^(?:verilog|systemverilog)$/.test(lang.key)) return named[1] + lang.ext;
    return "snippet-" + (index + 1) + lang.ext;
  }

  function copyPlainText(value, done) {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(value).then(done).catch(function () { copyFallback(value, done); });
    } else copyFallback(value, done);
  }

  function copyFallback(value, done) {
    var area = document.createElement("textarea");
    area.value = value; area.setAttribute("readonly", "");
    area.style.cssText = "position:fixed;opacity:0;pointer-events:none";
    document.body.appendChild(area); area.select();
    try { document.execCommand("copy"); } catch (e) {}
    area.remove(); done();
  }

  function enhanceCodeBlocks(article) {
    var blocks = article.querySelectorAll("pre");
    blocks.forEach(function (pre, index) {
      if (pre.closest(".tech-code-shell,.tech-diagram") || /\b(?:mermaid|wavedrom)\b/.test(blockLanguage(pre))) return;
      var source = codeText(pre);
      if (!source.trim()) return;
      var lang = detectCodeLanguage(source, pre);
      var filename = inferredFilename(pre, source, lang, index);

      var shell = el("div", "tech-code-shell");
      var head = el("div", "tech-code-head");
      var name = el("span", "tech-code-name"); name.textContent = filename;
      var label = el("span", "tech-code-lang"); label.textContent = lang.label;
      var actions = el("span", "tech-code-actions");
      var copy = el("button", "tech-code-btn", "복사"); copy.type = "button";
      copy.setAttribute("aria-label", filename + " 코드 복사");
      copy.onclick = function () {
        copyPlainText(source, function () {
          copy.textContent = "복사됨";
          setTimeout(function () { copy.textContent = "복사"; }, 1400);
        });
      };
      var download = el("button", "tech-code-btn", "다운로드"); download.type = "button";
      download.setAttribute("aria-label", filename + " 다운로드");
      download.onclick = function () {
        var blob = new Blob([source], { type: "text/plain;charset=utf-8" });
        var url = URL.createObjectURL(blob), a = document.createElement("a");
        a.href = url; a.download = filename; document.body.appendChild(a); a.click(); a.remove();
        setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
      };
      actions.appendChild(copy); actions.appendChild(download);
      if (/^(?:verilog|systemverilog|vhdl)$/.test(lang.key)) {
        var eda = el("a", "tech-code-link", "EDA Playground ↗");
        eda.href = "https://www.edaplayground.com/"; eda.target = "_blank"; eda.rel = "noopener noreferrer";
        eda.setAttribute("aria-label", "EDA Playground에서 코드 실행하기");
        actions.appendChild(eda);
      }
      head.appendChild(name); head.appendChild(label); head.appendChild(actions);

      var body = el("div", "tech-code-body");
      var lines = el("span", "tech-code-lines");
      lines.setAttribute("aria-hidden", "true");
      var count = source.replace(/\n$/, "").split("\n").length;
      var nums = []; for (var i = 1; i <= count; i++) nums.push(i);
      lines.textContent = nums.join("\n");
      pre.parentNode.insertBefore(shell, pre);
      body.appendChild(lines); body.appendChild(pre);
      shell.appendChild(head); shell.appendChild(body);
    });
  }

  function loadClassicScript(src, id) {
    return new Promise(function (resolve, reject) {
      var old = document.getElementById(id);
      if (old) {
        if (old.getAttribute("data-loaded") === "1") return resolve();
        old.addEventListener("load", resolve, { once: true });
        old.addEventListener("error", reject, { once: true });
        return;
      }
      var s = document.createElement("script");
      s.id = id; s.src = src; s.async = true;
      s.onload = function () { s.setAttribute("data-loaded", "1"); resolve(); };
      s.onerror = reject; document.head.appendChild(s);
    });
  }

  function renderDiagrams(article) {
    var pres = Array.prototype.slice.call(article.querySelectorAll("pre"));
    var mermaidNodes = [], waveHosts = [];
    pres.forEach(function (pre) {
      var hint = blockLanguage(pre), source = codeText(pre);
      if (/\bmermaid\b/.test(hint)) {
        var host = el("div", "tech-diagram tech-mermaid");
        var diagram = el("div", "mermaid"); diagram.textContent = source;
        host.__techSource = source; host.__techLanguage = "mermaid";
        host.appendChild(diagram); pre.replaceWith(host); mermaidNodes.push(diagram);
      } else if (/\bwavedrom\b/.test(hint)) {
        var waveHost = el("div", "tech-diagram tech-wavedrom");
        var wave = document.createElement("script"); wave.type = "WaveDrom"; wave.textContent = source;
        waveHost.__techSource = source; waveHost.__techLanguage = "wavedrom";
        waveHost.appendChild(wave); pre.replaceWith(waveHost); waveHosts.push(waveHost);
      }
    });

    if (mermaidNodes.length) {
      import(CONFIG.MERMAID_URL).then(function (mod) {
        var mermaid = mod.default || mod;
        mermaid.initialize({ startOnLoad: false, securityLevel: "strict", theme: "neutral" });
        return mermaid.run({ nodes: mermaidNodes, suppressErrors: true });
      }).catch(function () {
        mermaidNodes.forEach(function (node) {
          var host = node.parentElement, fallback = el("pre", "tech-diagram-error");
          fallback.textContent = host.__techSource || "Mermaid diagram";
          host.replaceChildren(el("div", "tech-diagram-error", "다이어그램을 불러오지 못했습니다."), fallback);
        });
      });
    }
    if (waveHosts.length) {
      loadClassicScript(CONFIG.WAVEDROM_SKIN_URL, "tech-wavedrom-skin")
        .then(function () { return loadClassicScript(CONFIG.WAVEDROM_URL, "tech-wavedrom-lib"); })
        .then(function () {
        if (window.WaveDrom && window.WaveDrom.ProcessAll) window.WaveDrom.ProcessAll();
      }).catch(function () {
        waveHosts.forEach(function (host) {
          var fallback = el("pre", "tech-diagram-error"); fallback.textContent = host.__techSource || "WaveDrom diagram";
          host.replaceChildren(el("div", "tech-diagram-error", "타이밍 다이어그램을 불러오지 못했습니다."), fallback);
        });
      });
    }
  }

  function optimizeMedia(root) {
    function apply(scope) {
      var nodes = [];
      if (scope.matches && scope.matches("img,iframe")) nodes.push(scope);
      if (scope.querySelectorAll) nodes = nodes.concat(Array.prototype.slice.call(scope.querySelectorAll("img,iframe")));
      nodes.forEach(function (node) {
        if (node.closest(".aiblog-wrap,.tech-diagram") || node.hasAttribute("loading")) return;
        var rect = node.getBoundingClientRect();
        if (rect.top > Math.max(window.innerHeight * 1.25, 900)) {
          node.setAttribute("loading", "lazy");
          if (node.tagName === "IMG") node.setAttribute("decoding", "async");
        }
      });
    }
    apply(root || document);
    if (window.MutationObserver) {
      if (window.__aiblogMediaObserver) window.__aiblogMediaObserver.disconnect();
      var observer = new MutationObserver(function (records) {
        records.forEach(function (record) {
          record.addedNodes.forEach(function (node) { if (node.nodeType === 1) apply(node); });
        });
      });
      observer.observe(document.body, { childList: true, subtree: true });
      window.__aiblogMediaObserver = observer;
      setTimeout(function () { observer.disconnect(); }, 15000);
    }
  }

  /* ---------------------------------------------------- 홈 화면 주제 허브 */

  var TOPIC_DESC = [
    [/^Verilog/, "RTL 설계·문법·FPGA 프로젝트"],
    [/^Full Custom/, "Virtuoso 레이아웃·DRC/LVS"],
    [/^전자회로/, "회로 해석·전력 반도체"],
    [/^임베디드/, "STM32·ATmega128 실습"],
    [/^반도체 시사/, "NPU·자가복구 아키텍처 논문 정리"],
    [/^ARM/, "ARM 아키텍처·RTOS"],
    [/^SoC/, "버스·페리페럴 설계"]
  ];

  function isHomeCover() {
    return /^\/(m\/?)?$/.test(location.pathname) &&
      !/[?&]page=/.test(location.search) &&
      !!document.querySelector(".type_featured");
  }

  // 주제 카드는 사이드바 카테고리에서 런타임에 읽음 — 글 수가 항상 최신
  function topicsFromSidebar() {
    var seen = {}, out = [];
    var links = document.querySelectorAll('a[href^="/category/"]');
    for (var i = 0; i < links.length; i++) {
      var href = links[i].getAttribute("href");
      if (seen[href]) continue;
      seen[href] = 1;
      var dec;
      try { dec = decodeURIComponent(href.slice(10)); } catch (e) { continue; }
      if (dec.indexOf("/") >= 0) continue; // 하위 카테고리 제외 (상위만)
      var m = links[i].textContent.match(/(.+?)\s*\((\d+)\)\s*$/);
      if (!m) continue;
      var n = parseInt(m[2], 10);
      if (n < 3) continue; // 글이 너무 적은 주제는 생략
      var label = m[1].trim(), desc = "";
      for (var j = 0; j < TOPIC_DESC.length; j++)
        if (TOPIC_DESC[j][0].test(label)) { desc = TOPIC_DESC[j][1]; break; }
      out.push({ label: label, n: n, href: href, desc: desc });
    }
    out.sort(function (a, b) { return b.n - a.n; });
    return out.slice(0, 8);
  }

  // 스킨 섹션의 실제 콘텐츠 좌우 여백에 런타임 정렬 (스킨 업데이트에도 안전).
  // ⚠ 넓은 화면에서 스킨 카드는 여러 칼럼 그리드가 되므로 카드 "하나"가 아니라
  //   같은 종류 카드 전체의 유니언(min left ~ max right)을 콘텐츠 폭으로 삼는다.
  function alignHomeSections() {
    var groups = [".link_notice", ".type_card .item", ".txt_section"];
    var rr = null;
    for (var gi = 0; gi < groups.length && !rr; gi++) {
      var els = document.querySelectorAll(groups[gi]);
      if (!els.length) continue;
      var L = Infinity, R = -Infinity;
      for (var i = 0; i < els.length; i++) {
        var b = els[i].getBoundingClientRect();
        if (!b.width) continue;
        if (b.left < L) L = b.left;
        if (b.right > R) R = b.right;
      }
      if (R - L >= 320) rr = { left: L, right: R }; // 지나치게 좁으면 다음 후보로
    }
    if (!rr) return; // 신뢰할 기준 없음 — CSS 기본 폭 유지
    // 상하 리듬도 스킨 섹션의 marginTop을 그대로 복사 (폭마다 72/48 등 스킨이 결정)
    var skinSec = document.querySelector(".type_card") || document.querySelector(".type_notice");
    var mt = skinSec ? getComputedStyle(skinSec).marginTop : "";
    document.querySelectorAll(".aihome-sec").forEach(function (sec) {
      sec.style.maxWidth = "none";
      sec.style.paddingLeft = "0";
      sec.style.paddingRight = "0";
      var sr = sec.getBoundingClientRect();
      sec.style.paddingLeft = Math.max(0, Math.round(rr.left - sr.left)) + "px";
      sec.style.paddingRight = Math.max(0, Math.round(sr.right - rr.right)) + "px";
      if (mt) { sec.style.marginTop = mt; sec.style.marginBottom = "0"; }
    });
  }

  function injectHome(byId) {
    if (!isHomeCover()) return;
    var featured = document.querySelector(".type_featured");

    // Category hub (캐러셀 바로 아래)
    var topics = topicsFromSidebar();
    var hub = null;
    if (topics.length >= 3) {
      hub = el("div", "aihome-sec aihome-hub");
      hub.appendChild(el("strong", "aihome-tit", "Category"));
      var grid = el("div", "aihome-grid");
      topics.forEach(function (t) {
        var a = el("a", "aihome-topic");
        a.href = t.href;
        a.appendChild(el("span", "tl", esc(t.label) + ' <span class="tn">' + t.n + "편</span>"));
        if (t.desc) a.appendChild(el("span", "td", esc(t.desc)));
        grid.appendChild(a);
      });
      hub.appendChild(grid);
      featured.insertAdjacentElement("afterend", hub);
    }

    // 스킨 콘텐츠 폭에 정렬 — 폰트 로드 등으로 늦게 흔들릴 수 있어 재시도.
    // 뷰포트 변화는 resize 이벤트가 유실될 수 있어(실측) ResizeObserver로 감시.
    alignHomeSections();
    [400, 1500].forEach(function (t) { setTimeout(alignHomeSections, t); });
    var alignTimer = null;
    function queueAlign() {
      clearTimeout(alignTimer);
      alignTimer = setTimeout(alignHomeSections, 120);
    }
    // 둘 다 등록: 스킨 재배치(resize 이벤트 기반)가 끝난 뒤에도 한 번 더 정렬되도록
    if (window.ResizeObserver) {
      var ro = new ResizeObserver(queueAlign);
      ro.observe(document.body);
    }
    window.addEventListener("resize", queueAlign);
  }

  /* ---------------------------------------------------- AI 어시스턴트 패널 */

  function buildAssistant(index, curPost, byId) {
    var posts = index.posts;

    var fab = el("button", "aiblog-fab", SPARK + "<span>AI</span>");
    fab.type = "button";
    fab.setAttribute("aria-label", "AI 어시스턴트 열기");
    fab.setAttribute("aria-expanded", "false");

    var wrap = el("div", "aiblog-wrap");
    var panel = el("div", "aiblog-panel");
    panel.setAttribute("role", "dialog");
    panel.setAttribute("aria-label", "AI 어시스턴트");
    var head = el("div", "aiblog-head",
      SPARK + '<span class="t">AI 어시스턴트</span><span class="c">글 ' + posts.length + '개 검색</span>');
    var shortcut = el("kbd", "aiblog-kbd", "Ctrl K");
    shortcut.setAttribute("aria-label", "Ctrl K로 검색 열기");
    head.appendChild(shortcut);
    var xBtn = el("button", "aiblog-x", "&times;");
    xBtn.type = "button";
    xBtn.setAttribute("aria-label", "닫기");
    head.appendChild(xBtn);

    var chat = el("div", "aiblog-chat");
    var chips = el("div", "aiblog-chips");
    var inrow = el("div", "aiblog-inrow");
    var input = el("input", "aiblog-in");
    input.placeholder = "요약, 관련 글, 검색어를 입력해보세요";
    input.setAttribute("aria-label", "AI에게 질문 입력");
    var send = el("button", "aiblog-send", SEND);
    send.type = "button";
    send.setAttribute("aria-label", "보내기");
    inrow.appendChild(input); inrow.appendChild(send);
    var inputArea = el("div", "aiblog-inputarea");
    var privacy = el("div", "aiblog-privacy",
      "질문은 답변 제공·오류 분석에 처리되며, 피드백 선택 시 질문과 평가를 최대 90일 저장합니다. 개인정보·기밀정보는 입력하지 마세요.");
    inputArea.appendChild(inrow); inputArea.appendChild(privacy);

    panel.appendChild(head); panel.appendChild(chat);
    panel.appendChild(chips); panel.appendChild(inputArea);
    wrap.appendChild(panel);
    document.body.appendChild(fab);
    document.body.appendChild(wrap);

    chat.setAttribute("role", "log");
    chat.setAttribute("aria-live", "polite");

    /* ---- 대화 지속: 같은 탭에서 글을 이동해도 대화가 유지됨 ---- */

    var hist = [];
    try { hist = JSON.parse(sessionStorage.getItem("aiblog_hist") || "[]"); } catch (e) {}

    function saveHist() {
      try { sessionStorage.setItem("aiblog_hist", JSON.stringify(hist.slice(-3))); } catch (e) {}
    }

    function saveChat() {
      try {
        var items = [], kids = chat.children;
        for (var i = Math.max(0, kids.length - 40); i < kids.length; i++) {
          // 로딩 표시("생각 중…")는 저장하지 않음 — 이동 시 유령 말풍선 방지
          if ((kids[i].className || "").indexOf("aiblog-typing") >= 0) continue;
          items.push({ c: kids[i].className, h: kids[i].innerHTML });
        }
        sessionStorage.setItem("aiblog_chat", JSON.stringify(items));
      } catch (e) {}
    }

    function restoreChat() {
      try {
        var items = JSON.parse(sessionStorage.getItem("aiblog_chat") || "[]");
        if (!items.length) return false;
        items.forEach(function (it) {
          if ((it.c || "").indexOf("aiblog-typing") >= 0) return; // 과거 저장분 방어
          var d = document.createElement("div");
          d.className = it.c;
          d.innerHTML = it.h; // 우리가 직접 만들어 저장한 마크업(동일 출처)만 복원
          chat.appendChild(d);
        });
        return chat.children.length > 0;
      } catch (e) { return false; }
    }

    var saveTimer = null;
    new MutationObserver(function () {
      clearTimeout(saveTimer);
      saveTimer = setTimeout(saveChat, 400);
    }).observe(chat, { childList: true, subtree: true });

    // 칩/카드 클릭은 위임으로 처리 — 복원된 대화의 칩도 그대로 동작
    chat.addEventListener("click", function (e) {
      if (!e.target || !e.target.closest) return;
      var fb = e.target.closest(".aiblog-fb");
      if (fb) {
        var feedback = fb.closest(".aiblog-feedback");
        if (!feedback || feedback.getAttribute("data-done") === "1") return;
        feedback.setAttribute("data-done", "1");
        var buttons = feedback.querySelectorAll(".aiblog-fb");
        for (var i = 0; i < buttons.length; i++) buttons[i].disabled = true;
        fb.classList.add("on");
        logEvt("feedback", { q: fb.getAttribute("data-q") || "", ui: fb.getAttribute("data-value") || "" });
        feedback.appendChild(el("span", "", "감사합니다"));
        return;
      }
      var s = e.target.closest(".aiblog-schip");
      if (s) { submit(s.getAttribute("data-q") || s.textContent); return; }
      var a = e.target.closest(".aiblog-cards a, .aiblog-cite a");
      if (a) logEvt("click", { to: (a.href.match(/(\d+)\/?$/) || [])[1] || "", ui: "chat" });
    });

    // 티스토리 기본 툴바(왼쪽 아래 .menu_toolbar)와 겹치면 그 위로 자동 회피
    var kbLift = false; // 모바일 키보드 보정 중에는 dodge가 wrap을 건드리지 않음
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
          // 패널까지 같이 올리는 건 화면이 충분히 클 때만 —
          // 짧은 화면(가로 모드)에서 올리면 패널 위가 화면 밖으로 나감 (실측)
          if (!kbLift)
            wrap.style.bottom = (window.innerHeight - (clear + 56) >= 280)
              ? (clear + 56) + "px" : "";
          return;
        }
      }
      fab.style.bottom = "";
      if (!kbLift) wrap.style.bottom = "";
    }
    dodgeTistoryToolbar();
    window.addEventListener("resize", dodgeTistoryToolbar);
    // 툴바는 우리 스크립트보다 늦게 렌더될 수 있음(콜드 캐시에서 실측) — 재시도
    window.addEventListener("load", dodgeTistoryToolbar);
    [700, 2000, 4500].forEach(function (t) { setTimeout(dodgeTistoryToolbar, t); });

    // 모바일 키보드가 입력줄을 가리는 문제: visualViewport로 패널을 키보드 위로 올림
    if (window.visualViewport) {
      var vvFix = function () {
        if (!wrap.classList.contains("open")) return;
        var vv = window.visualViewport;
        var covered = window.innerHeight - vv.height - vv.offsetTop;
        if (covered > 60) { // 키보드가 올라온 것으로 판단
          kbLift = true;
          wrap.style.bottom = (covered + 10) + "px";
        } else if (kbLift) {
          kbLift = false;
          wrap.style.bottom = "";
          dodgeTistoryToolbar();
        }
      };
      window.visualViewport.addEventListener("resize", vvFix);
      window.visualViewport.addEventListener("scroll", vvFix);
    }

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
        var prefix = p.sourceNo ? "[" + p.sourceNo + "] " : "";
        a.appendChild(el("div", "ct", esc(prefix + p.title)));
        if (withSummary !== false && p.summary)
          a.appendChild(el("div", "cs", esc(p.summary)));
        else if (p.headings && p.headings.length)
          a.appendChild(el("div", "cs", esc(p.headings.join(" · "))));
        box.appendChild(a);
      });
      return box;
    }

    function feedbackBox(question) {
      var box = el("div", "aiblog-feedback");
      box.appendChild(el("span", "", "이 답변은 어땠나요?"));
      [
        { label: "도움됨", value: "helpful" },
        { label: "부족함", value: "not_helpful" }
      ].forEach(function (item) {
        var button = el("button", "aiblog-fb", item.label);
        button.type = "button";
        button.setAttribute("data-value", item.value);
        button.setAttribute("data-q", question);
        box.appendChild(button);
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
      if (/도움말|사용법|뭐할수|뭘할수|무엇을할수|어떻게(써|사용)|(너|네|니)(의|가)?기능/.test(t)) return { kind: "help" };
      // 챗봇 자신에 대한 메타 질문 ("너 누구야", "무슨 AI야", "어떻게 만들어졌어")
      if (/(너|넌|니가|네가|당신)(는|의|가|를|도)?(누구|뭐|무슨|어떤|어떻게|기능)|누구(세요|야|니|입니까)|어떻게만들|누가만들|기반이(야|니|뭐)|(무슨|어떤)(ai|인공지능|모델|엔진|챗봇)(이야|야|이니|냐|기반)/i.test(t))
        return { kind: "help" };
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
      // 문자열 또는 {label, q} — 클릭 처리는 chat 위임 핸들러가 담당(data-q).
      // 대화 복원 후에도 칩이 동작하도록 개별 onclick을 쓰지 않는다.
      var box = el("div", "aiblog-sugg");
      words.forEach(function (w) {
        var label = typeof w === "string" ? w : w.label;
        var q = typeof w === "string" ? w : w.q;
        var s = el("button", "aiblog-schip", esc(label));
        s.type = "button";
        s.setAttribute("data-q", q);
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
      // 칩에 대상 글 제목을 담아, 페이지를 이동했거나 다른 글 요약이어도
      // 항상 "그 글"에 대해 이어가게 함
      var follow = [{ label: "관련 글 추천", q: target.title + " 관련 글 찾아줘" }];
      if (CONFIG.WORKER_URL)
        follow.push({ label: "더 자세히 듣기", q: target.title + " 더 자세히 설명해줘" });
      b.appendChild(suggestChips(follow));
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
        // 못 찾은 검색어 = "방문자가 원했지만 없는 콘텐츠" — 가장 값진 기록
        logEvt("search_empty", { q: q });
        if (CONFIG.WORKER_URL) {
          // 인덱스 검색으로 못 찾으면 실시간 AI에게 넘겨서 답변 시도
          askWorker(q);
          return;
        }
        var b = aiBubble("“" + esc(q) + "”에 대한 글을 찾지 못했어요. 이런 주제는 어떠세요?");
        b.appendChild(suggestChips(topKeywords(6)));
        return;
      }
      var sb = aiBubble("“" + esc(q) + "” 관련해서 이런 글이 있어요.");
      sb.appendChild(cardList(items));
      if (CONFIG.WORKER_URL)
        sb.appendChild(suggestChips([{ label: "AI 답변으로 듣기", q: q + " 설명해줘" }]));
    }

    function replyGreet() {
      aiBubble("안녕하세요! 궁금한 주제를 입력하시거나 아래 버튼을 눌러보세요.");
    }

    function replyThanks() {
      aiBubble("도움이 됐다니 기뻐요! 더 궁금한 게 있으면 언제든 물어보세요.");
    }

    function replyHelp() {
      var b = aiBubble(
        "저는 이 블로그 주인장이 만든 <b>AI 어시스턴트</b>예요. " +
        "블로그 글 " + posts.length + "개를 검색할 수 있도록 인덱싱해두었고, 자유로운 질문은 " +
        "구글 Gemini AI가 글 내용을 근거로 실시간 답변해요.<br><br>" +
        "<b>할 수 있는 일</b><br>" +
        "· <b>이 글 요약해줘</b> — 지금 보는 글 3줄 요약<br>" +
        "· <b>BIST 글 요약해줘</b> — 특정 주제 글 요약<br>" +
        "· <b>관련 글 / 인기 글 / 최근 글 / 주제 보기</b><br>" +
        "· 아무 키워드나 입력하면 블로그 검색" +
        (CONFIG.WORKER_URL ? "<br>· 글 내용에 대한 자유 질문 — 이어지는 대화도 기억해요" : "") +
        "<br><br>단, 블로그에 없는 내용은 지어내지 않아요 🙂");
      var s = [];
      if (curPost) s.push({ label: "이 글 3줄 요약", q: "이 글 요약해줘" });
      s.push({ label: "인기 글", q: "인기 글 보여줘" });
      s.push({ label: "주제 보기", q: "주제 알려줘" });
      b.appendChild(suggestChips(s));
    }

    function replyCount() {
      aiBubble("현재 글 " + posts.length + "개가 검색 Index에 포함되어 있어요. 새 글은 매주 자동으로 추가됩니다.");
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

    var pendingAsk = false;

    function replyWorker(sendText, displayQ) {
      if (pendingAsk) return;
      pendingAsk = true;
      send.disabled = true;
      var typing = el("div", "aiblog-typing", "AI가 답변을 생각하는 중…");
      chat.appendChild(typing); scrollDown();
      var ctxIds = hist.length ? (hist[hist.length - 1].ids || []) : [];
      // 25초 타임아웃 — 없으면 네트워크가 멈췄을 때 입력이 영영 잠김
      var ctrl = ("AbortController" in window) ? new AbortController() : null;
      var tmo = ctrl ? setTimeout(function () { ctrl.abort(); }, 25000) : null;
      fetch(CONFIG.WORKER_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        signal: ctrl ? ctrl.signal : undefined,
        body: JSON.stringify({
          question: sendText,
          history: hist.slice(-3).map(function (h) { return { q: h.q, a: h.a }; }),
          context_ids: ctxIds,
          postId: curPost ? curPost.id : 0
        })
      }).then(function (r) { return r.json(); }).then(function (data) {
        if (tmo) clearTimeout(tmo);
        typing.remove();
        pendingAsk = false; send.disabled = false;
        var answer = data.answer || "답변을 생성하지 못했어요.";
        var sources = Array.isArray(data.sources) ? data.sources : [];
        // 개행·**강조**·출처 번호만 최소 렌더 (esc 이후 처리라 안전)
        var html = esc(answer)
          .replace(/\*\*([^*]+)\*\*/g, "<b>$1</b>")
          .replace(/\[(\d{1,2})\]/g, function (all, rawNo) {
            var no = Number(rawNo);
            var source = sources[no - 1];
            if (!source || !source.url) return all;
            return '<sup class="aiblog-cite"><a href="' + esc(source.url) + '" aria-label="출처 ' + no + ': ' + esc(source.title || "") + '">[' + no + ']</a></sup>';
          })
          .replace(/\n/g, "<br>");
        var b = aiBubble(html);
        var ids = [];
        if (sources.length) {
          ids = sources.map(function (s) { return s.id; }).filter(Boolean);
          b.appendChild(cardList(sources.map(function (s, i) {
            return { url: s.url, title: s.title, sourceNo: i + 1, headings: s.headings || [] };
          }), false));
        }
        b.appendChild(feedbackBox(displayQ || sendText));
        hist.push({ q: displayQ || sendText, a: answer.slice(0, 400), ids: ids });
        saveHist();
        if (ids.length && CONFIG.WORKER_URL)
          b.appendChild(suggestChips([{ label: "더 자세히", q: "더 자세히 설명해줘" }]));
      }).catch(function (err) {
        if (tmo) clearTimeout(tmo);
        typing.remove();
        pendingAsk = false; send.disabled = false;
        var msg = (err && err.name === "AbortError")
          ? "답변이 너무 오래 걸려서 중단했어요. 네트워크 상태를 확인하고 다시 시도해주세요."
          : "답변 생성 중 오류가 났어요.";
        var b = aiBubble(msg);
        b.appendChild(suggestChips([{ label: "다시 시도", q: displayQ || sendText }]));
      });
    }

    function isQuestion(q) {
      return /\?|뭐|무엇|어떻|어떤가|왜|언제|어디|누구|차이|비교|인가요|일까|건가요|맞나|설명해|말해줘|궁금/.test(q);
    }

    // "이 글/이 페이지" = 지금 보는 글을 콕 집는 표현 / "더 자세히" = 대화 이어가기
    var THIS_PAGE_RE = /이\s*(글|페이지|내용|포스트)|지금\s*(글|보는)|현재\s*글|본문/;
    var MORE_RE = /더\s*자세|자세히|부연|추가\s*설명|쉽게\s*설명|풀어서/;
    var CONTEXTUAL_RE = new RegExp(THIS_PAGE_RE.source + "|" + MORE_RE.source);

    function askWorker(q) {
      var sendText = q;
      if (curPost && THIS_PAGE_RE.test(q)) {
        // "이 글"을 지목하면 항상 현재 글을 맥락으로
        sendText = "“" + curPost.title + "” 글을 읽다가 나온 질문입니다: " + q;
      } else if (curPost && !hist.length && residualTopic(q).length < 2) {
        // 질문에 주제가 전혀 없고 이어갈 대화도 없을 때만 현재 글로 추정
        // (질문에 글 제목 등 주제가 있으면 그대로 — 다른 글 이야기일 수 있음)
        sendText = "“" + curPost.title + "” 글을 읽다가 나온 질문입니다: " + q;
      }
      replyWorker(sendText, q);
    }

    function route(q) {
      var it = parseIntent(q);
      if (it.kind === "greet") { replyGreet(); return; }
      if (it.kind === "thanks") { replyThanks(); return; }
      if (it.kind === "help") { replyHelp(); return; }
      if (it.kind === "popular") { replyPopular(); return; }
      if (it.kind === "topics") { replyTopics(); return; }
      if (it.kind === "count") { replyCount(); return; }
      if (it.kind === "summary") { replySummary(it.topic); return; }
      if (it.kind === "related") { replyRelated(it.topic); return; }
      if (it.kind === "recent") { replyRecent(); return; }
      // 여기부터는 자유 입력 — 라우팅 기준:
      //  · "찾아줘/검색" 명시 → 글 목록 검색
      //  · 질문형·맥락 요청·문장형(3단어 이상 or 요청 어미) → 실시간 AI
      //    (AI 답변에는 근거 글 링크가 붙으므로 검색의 상위호환)
      //  · 1~2단어 키워드 → 글 목록 검색
      var t = q.replace(/\s+/g, "");
      var wantsList = /찾아|검색|목록|리스트/.test(t);
      var sentenceLike = q.split(/\s+/).filter(Boolean).length >= 3 ||
        /(해줘|해봐|주세요|알려|설명|정리|비교|추천해|어때|할까|좋을까|하는법)/.test(t);
      if (CONFIG.WORKER_URL && !wantsList &&
          ((curPost && CONTEXTUAL_RE.test(q)) || isQuestion(q) || sentenceLike)) {
        askWorker(q);
        return;
      }
      replySearch(it.topic);
    }

    function submit(text) {
      if (pendingAsk) return; // AI 응답 대기 중에는 새 입력 보류
      var q = (text !== undefined ? text : input.value).trim();
      if (!q) return;
      input.value = "";
      userBubble(q);
      logEvt("input", { q: q });
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

    var greeted = restoreChat();
    function openPanel(forceFocus) {
      wrap.classList.add("open");
      fab.setAttribute("aria-expanded", "true");
      logEvt("open", {});
      if (!greeted) {
        greeted = true;
        var hello = curPost
          ? "안녕하세요! 이 블로그의 글 " + posts.length + "개를 바탕으로 안내해드려요.<br>아래 버튼을 누르거나 “이 글 요약해줘”, “관련 글 찾아줘”처럼 입력해보세요."
          : "안녕하세요! 이 블로그의 글 " + posts.length + "개를 바탕으로 안내해드려요.<br>궁금한 주제를 검색하거나 “인기 글”, “주제 보기”를 눌러보세요.";
        aiBubble(hello);
      }
      scrollDown();
      // 모바일에서는 자동 포커스 생략 — 열자마자 키보드가 올라오는 것 방지
      var touch = ("ontouchstart" in window) ||
        (window.matchMedia && matchMedia("(max-width:768px)").matches);
      if (forceFocus || !touch) setTimeout(function () { input.focus(); }, 120);
    }
    function closePanel() {
      wrap.classList.remove("open");
      fab.setAttribute("aria-expanded", "false");
    }
    openAssistant = function (query) {
      openPanel(typeof query === "string");
      if (typeof query === "string") input.value = query;
    };

    fab.onclick = function () {
      if (wrap.classList.contains("open")) closePanel(); else openPanel();
    };
    xBtn.onclick = function () { closePanel(); fab.focus(); };
    if (window.__aiblogKeydown) document.removeEventListener("keydown", window.__aiblogKeydown);
    window.__aiblogKeydown = function (e) {
      if ((e.ctrlKey || e.metaKey) && String(e.key).toLowerCase() === "k") {
        e.preventDefault();
        openPanel(true);
        return;
      }
      // 키보드로 닫으면 포커스를 버튼으로 되돌림 (접근성)
      if (e.key === "Escape" && wrap.classList.contains("open")) {
        closePanel();
        fab.focus();
      }
    };
    document.addEventListener("keydown", window.__aiblogKeydown);
    document.addEventListener("click", function (e) {
      if (wrap.classList.contains("open") &&
          !wrap.contains(e.target) && !fab.contains(e.target)) closePanel();
    });

    send.onclick = function () { submit(); };
    input.addEventListener("keydown", function (e) {
      // 한글 IME 조합 중 Enter는 조합 확정용 — 이중 전송/글자 잘림 방지
      if (e.isComposing || e.keyCode === 229) return;
      if (e.key === "Enter") submit();
    });
  }

  /* ---------------------------------------------------- 초기화 */

  function cleanup() {
    if (window.__aiblogKeydown) {
      document.removeEventListener("keydown", window.__aiblogKeydown);
      window.__aiblogKeydown = null;
    }
    if (window.__aiblogMediaObserver) {
      window.__aiblogMediaObserver.disconnect();
      window.__aiblogMediaObserver = null;
    }
    document.querySelectorAll(".tech-code-shell").forEach(function (shell) {
      var pre = shell.querySelector("pre");
      if (pre) shell.replaceWith(pre); else shell.remove();
    });
    document.querySelectorAll(".tech-diagram").forEach(function (host) {
      if (!host.__techSource) { host.remove(); return; }
      var pre = document.createElement("pre");
      pre.setAttribute("data-ke-language", host.__techLanguage || "text");
      pre.textContent = host.__techSource;
      host.replaceWith(pre);
    });
    ["#aiblog-style", "#tech-breadcrumb-jsonld", ".aiblog-fab", ".aiblog-wrap", ".aiblog-box", ".aiblog-modal", ".aihome-sec", ".tech-breadcrumb", ".tech-post-meta"]
      .forEach(function (sel) {
        document.querySelectorAll(sel).forEach(function (n) { n.remove(); });
      });
  }

  function init() {
    cleanup();
    injectCss();
    optimizeMedia(document);
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
            renderArticleMeta(article, curPost);
            renderDiagrams(article);
            enhanceCodeBlocks(article);
          }
        }

        // 홈 커버에 주제 허브·시리즈 선반 삽입 (실패해도 어시스턴트에 영향 없게)
        try { injectHome(byId); } catch (e) {}
      })
      .catch(function (e) { console.warn("[ai-features] 인덱스 로드 실패:", e); });
  }

  if (document.readyState === "loading")
    document.addEventListener("DOMContentLoaded", init);
  else init();
})();
