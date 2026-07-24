/**
 * 블로그 Q&A 챗봇 프록시 (Cloudflare Worker) — 선택 기능
 * ------------------------------------------------------
 * 방문자 질문 → 인덱스에서 관련 글 검색 → Gemini 무료 티어로 답변 생성.
 * API 키는 Worker 환경변수에만 있으므로 방문자에게 노출되지 않습니다.
 *
 * 배포 (무료 플랜, 하루 10만 요청):
 *   1. https://dash.cloudflare.com → Workers & Pages → Create Worker
 *   2. 이 코드를 붙여넣고 Deploy
 *   3. Settings → Variables 에서 아래 3개 설정
 *      - GEMINI_API_KEY : Google AI Studio에서 발급한 키 (Secret으로)
 *      - INDEX_URL      : index.json 주소
 *      - ALLOWED_ORIGIN : https://semicon-circuit.tistory.com
 *   4. Worker URL을 스킨 JS의 CONFIG.WORKER_URL에 입력
 */

// 모델 후보 — 404(미제공/폐기)면 다음 후보로 자동 폴백 ('-latest' 별칭 우선)
const GEMINI_MODELS = [
  "gemini-flash-lite-latest",
  "gemini-flash-latest",
  "gemini-2.5-flash",
  "gemini-3-flash-preview",
];
const DAILY_LIMIT = 200; // 하루 최대 답변 수 (무료 티어 보호)
let workingModel = null; // 이 인스턴스에서 확인된 사용 가능 모델

let cachedIndex = null;
let cachedAt = 0;
let dayKey = "";
let dayCount = 0;

function cors(env) {
  return {
    "Access-Control-Allow-Origin": env.ALLOWED_ORIGIN || "*",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
  };
}

function tokenize(q) {
  const words = q.toLowerCase().match(/[가-힣]+|[a-z0-9]{2,}/g) || [];
  const toks = [];
  for (const w of words) {
    toks.push(w);
    if (/[가-힣]/.test(w) && w.length >= 2)
      for (let i = 0; i < w.length - 1; i++) toks.push(w.slice(i, i + 2));
  }
  return toks;
}

function pickPosts(index, question, k = 4) {
  const tokens = tokenize(question);
  return index.posts
    .map((p) => {
      const title = p.title.toLowerCase();
      const kw = (p.keywords || []).concat(p.tags || []).join(" ").toLowerCase();
      const body = ((p.summary || "") + " " + (p.excerpt || "")).toLowerCase();
      let s = 0;
      for (const t of tokens) {
        if (title.includes(t)) s += 5 * t.length;
        if (kw.includes(t)) s += 3 * t.length;
        if (body.includes(t)) s += t.length;
      }
      return { p, s };
    })
    .filter((x) => x.s > 0)
    .sort((a, b) => b.s - a.s)
    .slice(0, k)
    .map((x) => x.p);
}

export default {
  async fetch(request, env) {
    if (request.method === "OPTIONS")
      return new Response(null, { headers: cors(env) });
    if (request.method !== "POST")
      return new Response("POST only", { status: 405, headers: cors(env) });

    // 일일 사용량 보호 (인스턴스 단위의 러프한 제한)
    const today = new Date().toISOString().slice(0, 10);
    if (dayKey !== today) { dayKey = today; dayCount = 0; }
    if (++dayCount > DAILY_LIMIT)
      return json({ answer: "오늘의 AI 질문 한도를 모두 사용했어요. 내일 다시 시도해주세요!", sources: [] }, env);

    let question = "";
    try {
      question = ((await request.json()).question || "").slice(0, 300).trim();
    } catch (_) {}
    if (question.length < 2)
      return json({ answer: "질문을 입력해주세요.", sources: [] }, env);

    // 인덱스 로드 (10분 캐시)
    if (!cachedIndex || Date.now() - cachedAt > 600_000) {
      const r = await fetch(env.INDEX_URL);
      if (!r.ok) return json({ answer: "인덱스를 불러오지 못했습니다.", sources: [] }, env);
      cachedIndex = await r.json();
      cachedAt = Date.now();
    }

    const picked = pickPosts(cachedIndex, question);
    if (!picked.length)
      return json({ answer: "블로그에서 관련된 글을 찾지 못했어요. 다른 키워드로 질문해보세요.", sources: [] }, env);

    const context = picked
      .map((p, i) => `[글 ${i + 1}] ${p.title}\n요약: ${p.summary}\n본문 일부: ${p.excerpt}`)
      .join("\n\n");

    const prompt =
      `당신은 반도체 설계 기술 블로그 "Semiconductor Design Lab"의 안내 챗봇입니다.\n` +
      `아래 블로그 글 내용만 근거로 방문자의 질문에 한국어 존댓말로 간결하게(4문장 이내) 답하세요.\n` +
      `글에 없는 내용은 지어내지 말고, 관련 글을 읽어보라고 안내하세요.\n\n` +
      `${context}\n\n방문자 질문: ${question}`;

    const models = workingModel
      ? [workingModel, ...GEMINI_MODELS.filter((m) => m !== workingModel)]
      : GEMINI_MODELS;
    let g = null;
    for (const model of models) {
      g = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${env.GEMINI_API_KEY}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] }),
        }
      );
      if (g.ok) { workingModel = model; break; }
      if (g.status !== 404) break; // 404(모델 미제공)만 다음 후보 시도
    }
    if (!g || !g.ok)
      return json({ answer: "AI 응답 생성에 실패했어요. 잠시 후 다시 시도해주세요.", sources: [] }, env);

    const data = await g.json();
    const answer =
      data?.candidates?.[0]?.content?.parts?.[0]?.text?.trim() ||
      "답변을 생성하지 못했습니다.";

    return json(
      { answer, sources: picked.map((p) => ({ title: p.title, url: p.url })) },
      env
    );

    function json(obj, env2) {
      return new Response(JSON.stringify(obj), {
        headers: { "Content-Type": "application/json; charset=utf-8", ...cors(env2) },
      });
    }
  },
};
