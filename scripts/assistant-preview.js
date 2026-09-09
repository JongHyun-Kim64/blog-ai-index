/* Local-only UI fixtures. No AI requests or usage events leave this preview. */
(function () {
  var original = window.fetch.bind(window);
  var scenarios = ['answer', 'slow', 'timeout', '429', '403', 'broken', 'notice'];
  var toolbar;
  document.addEventListener('DOMContentLoaded', function () {
    toolbar = document.createElement('aside');
    toolbar.id = 'assistant-qa';
    toolbar.style.cssText = 'position:fixed;right:8px;top:70px;z-index:99999;padding:8px;background:white;color:black;border:1px solid #555;font:12px sans-serif';
    toolbar.innerHTML = '<label>AI 테스트 <select aria-label="AI 테스트 응답">' + scenarios.map(function (s) { return '<option>' + s + '</option>'; }).join('') + '</select></label> <output aria-label="테스트 호출 수">0</output><pre aria-label="테스트 요청" style="max-width:240px;white-space:pre-wrap"></pre>';
    document.body.appendChild(toolbar);
  });
  window.fetch = function (u, options) {
    if (String(u).indexOf('/__ai-disabled') < 0) return original(u, options);
    if (String(u).endsWith('/log')) return Promise.resolve(new Response('{"ok":true}', {status:200}));
    var count = toolbar.querySelector('output'); count.textContent = Number(count.textContent) + 1;
    var req = JSON.parse(options.body);
    toolbar.querySelector('pre').textContent = JSON.stringify({question:req.question, postId:req.postId, history:req.history.length, context:req.context_ids});
    var scenario = toolbar.querySelector('select').value;
    return new Promise(function (resolve, reject) {
      var timer;
      if (scenario !== 'timeout') timer = setTimeout(function () {
        if (scenario === '429' || scenario === '403') return resolve(new Response('{}', {status:Number(scenario)}));
        if (scenario === 'broken') return resolve(new Response('invalid JSON'));
        if (scenario === 'notice') return resolve(new Response(JSON.stringify({answer:'오늘의 AI 질문 한도를 모두 사용했어요.', sources:[]})));
        resolve(new Response(JSON.stringify({answer:'**테스트 답변**입니다. `MAC` 연산을 확인합니다. [1]\n\n- Matrix Multiplication\n- KV Cache\n\n```text\nY = X × W\n```',sources:[{id:124,title:'오래된 제목',url:'https://semicon-circuit.tistory.com/124',headings:['MatMul','KV Cache']}]})));
      }, scenario === 'slow' ? 8000 : 500);
      if (options.signal) options.signal.addEventListener('abort', function () { clearTimeout(timer); reject(new DOMException('Aborted', 'AbortError')); });
    });
  };
  var realBeacon = navigator.sendBeacon && navigator.sendBeacon.bind(navigator);
  navigator.sendBeacon = function (u, b) { return String(u).indexOf('/__ai-disabled') >= 0 ? true : (realBeacon ? realBeacon(u,b) : false); };
  var seed = new URLSearchParams(location.search).get('seed');
  if (seed === 'invalid') sessionStorage.setItem('aiblog_hist', '{"bad":true}');
  if (seed === 'markup') sessionStorage.setItem('aiblog_chat', JSON.stringify([{c:'aiblog-ma',h:'<p>복원 테스트</p><img src=x onerror="alert(1)"><a href="javascript:alert(1)">잘못된 링크</a><button class="aiblog-schip" data-q="최근 글 보여줘" onclick="alert(1)">최근 글</button>'}]));
})();
