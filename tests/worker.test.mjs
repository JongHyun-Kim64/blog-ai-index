import assert from "node:assert/strict";
import {
  default as worker,
  cleanLogEvent,
  cosineQuantized,
  pickChunks,
  pickPosts,
  redactFeedbackQuestion,
  safeTokenEqual,
  tokenize,
} from "../worker/worker.js";

assert.deepEqual(tokenize("Systolic Array 오류율"), [
  "systolic", "array", "오류율", "오류", "류율",
]);

assert.ok(cosineQuantized([1, 0], [127, 0]) > 0.999);
assert.ok(cosineQuantized([1, 0], [0, 127]) < 0.001);
assert.deepEqual(cleanLogEvent({
  t: "feedback",
  q: "q".repeat(250),
  from: 121,
  ui: "helpful",
  path: "/121",
}), {
  t: "feedback",
  q: "q".repeat(200),
  from: "121",
  to: "",
  ui: "helpful",
  path: "/121",
});
assert.equal(safeTokenEqual("report-secret", "report-secret"), true);
assert.equal(safeTokenEqual("wrong", "report-secret"), false);
assert.equal(
  redactFeedbackQuestion("연락처 test@example.com, 010-1234-5678입니다"),
  "연락처 [이메일], [전화번호]입니다",
);

const index = {
  posts: [
    {
      id: 1,
      title: "Clock Domain Crossing 기초",
      keywords: ["CDC"],
      summary: "Metastability와 Synchronizer를 설명합니다.",
      excerpt: "",
      embq: [127, 0],
    },
    {
      id: 2,
      title: "Systolic Array Timing Analysis",
      keywords: ["STA", "Timing"],
      summary: "Timing Violation 분석과 개선 방법을 설명합니다.",
      excerpt: "",
      embq: [0, 127],
      chunks: [{ heading: "본문 심화", text: "본문 뒤쪽에서 Hold Margin을 설명합니다." }],
    },
  ],
};

const semantic = pickPosts(index, "동기화 문제", {
  queryEmbedding: [1, 0],
  k: 2,
});
assert.equal(semantic[0].id, 1, "semantic similarity should affect ranking");

const current = pickPosts(index, "Timing", {
  currentPostId: 1,
  k: 2,
});
assert.ok(current.some((post) => post.id === 1), "current post should remain retrievable");

const currentOnly = pickPosts(index, "완전히 무관한 질문", {
  currentPostId: 1,
  k: 1,
});
assert.equal(currentOnly[0].id, 1, "current post should provide context when keywords do not match");

const deepKeyword = pickPosts(index, "Hold Margin", { k: 1 });
assert.equal(deepKeyword[0].id, 2, "lexical retrieval should include full chunk text");

const chunks = pickChunks([
  {
    id: 2,
    title: "Systolic Array Timing Analysis",
    chunks: [
      { heading: "설계 배경", text: "행렬 연산 구조를 설명합니다." },
      { heading: "Timing Violation 분석", text: "Critical Path와 Slack을 측정합니다." },
      { heading: "참고문헌", text: "Critical Path와 Slack 관련 논문 목록입니다." },
    ],
  },
], "Critical Path가 무엇인가요?", 0, 1);
assert.equal(chunks[0].heading, "Timing Violation 분석");
const rankedChunks = pickChunks([
  {
    id: 2,
    title: "Systolic Array Timing Analysis",
    chunks: [
      { heading: "Timing Violation 분석", text: "Critical Path와 Slack을 측정합니다." },
      { heading: "참고문헌", text: "Critical Path와 Slack 관련 논문 목록입니다." },
    ],
  },
], "Critical Path가 무엇인가요?", 0, 3);
assert.ok(!rankedChunks.some((chunk) => chunk.heading === "참고문헌"), "bibliography should not displace answer chunks");

const cacheStore = new Map();
globalThis.caches = {
  default: {
    async match(request) {
      const stored = cacheStore.get(request.url);
      return stored ? stored.clone() : undefined;
    },
    async put(request, response) {
      cacheStore.set(request.url, response.clone());
    },
  },
};

let fetchCalls = 0;
globalThis.fetch = async function (input) {
  fetchCalls += 1;
  const url = String(input);
  if (url === "https://example.test/index.json")
    return Response.json({ ...index, generated: "2026-08-21", count: index.posts.length });
  if (url.includes(":embedContent"))
    return Response.json({ embedding: { values: [0, 1] } });
  if (url.includes(":generateContent"))
    return Response.json({
      candidates: [{ content: { parts: [{ text: "Timing Violation은 Slack을 통해 확인합니다. [1]" }] } }],
    });
  throw new Error(`unexpected fetch: ${url}`);
};

const env = {
  ALLOWED_ORIGIN: "https://semicon-circuit.tistory.com",
  INDEX_URL: "https://example.test/index.json",
  GEMINI_API_KEY: "test-key",
};

const feedbackRows = [];
const feedbackDb = {
  prepare(sql) {
    let args = [];
    return {
      bind(...values) { args = values; return this; },
      async run() {
        if (/INSERT INTO feedback/.test(sql)) {
          feedbackRows.push({
            question: args[0], rating: args[1], post_id: args[2], path: args[3],
          });
        }
        return { success: true };
      },
      async first() {
        assert.match(sql, /COUNT\(\*\)/);
        return { total: 3, helpful: 2, not_helpful: 1 };
      },
      async all() {
        if (/GROUP BY post_id/.test(sql))
          return { results: [{ post_id: "121", total: 3, helpful: 2, not_helpful: 1 }] };
        return { results: [{ created_at: "2026-08-21 01:00:00", question: "보충 설명이 필요해요", post_id: "121", path: "/121" }] };
      },
    };
  },
  async batch(statements) {
    return Promise.all(statements.map((statement) => statement.run()));
  },
};

const feedbackPending = [];
const feedbackResponse = await worker.fetch(new Request("https://worker.example/log", {
  method: "POST",
  headers: { Origin: env.ALLOWED_ORIGIN },
  body: JSON.stringify({ t: "feedback", q: "Weight Allocation 설명", from: "121", ui: "helpful", path: "/121" }),
}), { ...env, FEEDBACK_DB: feedbackDb }, {
  waitUntil(promise) { feedbackPending.push(promise); },
});
await Promise.all(feedbackPending);
assert.equal(feedbackResponse.status, 200);
assert.deepEqual(feedbackRows, [{
  question: "Weight Allocation 설명", rating: "helpful", post_id: "121", path: "/121",
}]);

const unauthorizedReport = await worker.fetch(new Request("https://worker.example/feedback-report", {
  method: "POST",
}), { ...env, FEEDBACK_DB: feedbackDb, REPORT_TOKEN: "report-secret" }, {});
assert.equal(unauthorizedReport.status, 401);
assert.equal((await unauthorizedReport.json()).error, "Unauthorized");

const reportResponse = await worker.fetch(new Request("https://worker.example/feedback-report", {
  method: "POST",
  headers: { "Content-Type": "application/json", Authorization: "Bearer report-secret" },
  body: JSON.stringify({ days: 7 }),
}), { ...env, FEEDBACK_DB: feedbackDb, REPORT_TOKEN: "report-secret" }, {});
const report = await reportResponse.json();
assert.deepEqual(report.totals, { total: 3, helpful: 2, notHelpful: 1, helpfulRate: 66.7 });
assert.equal(report.byPost[0].post_id, "121");
assert.equal(report.notHelpfulQuestions[0].question, "보충 설명이 필요해요");

const publicSummaryResponse = await worker.fetch(new Request("https://worker.example/feedback-summary?days=7"), {
  ...env, FEEDBACK_DB: feedbackDb,
}, {});
const publicSummary = await publicSummaryResponse.json();
assert.equal(publicSummaryResponse.status, 200);
assert.deepEqual(publicSummary.totals, { total: 3, helpful: 2, notHelpful: 1, helpfulRate: 66.7 });
assert.equal("notHelpfulQuestions" in publicSummary, false, "public summary must not expose questions");
const makeRequest = () => new Request("https://worker.example/", {
  method: "POST",
  headers: {
    "Content-Type": "application/json",
    Origin: env.ALLOWED_ORIGIN,
  },
  body: JSON.stringify({ question: "Timing Violation은 어떻게 확인하나요?", postId: 2 }),
});

const pending = [];
const firstResponse = await worker.fetch(makeRequest(), env, {
  waitUntil(promise) { pending.push(promise); },
});
await Promise.all(pending);
const firstBody = await firstResponse.json();
assert.equal(firstResponse.status, 200);
assert.equal(firstResponse.headers.get("X-AI-Cache"), "MISS");
assert.equal(firstBody.cached, false);
assert.equal(firstBody.sources[0].id, 2);
assert.match(firstBody.answer, /\[1\]/);
assert.equal(cacheStore.size, 1, "first answer should be cached");
assert.equal(fetchCalls, 3, "index, embedding, and generation should each run once");

const secondResponse = await worker.fetch(makeRequest(), env, { waitUntil() {} });
const secondBody = await secondResponse.json();
assert.equal(secondResponse.headers.get("X-AI-Cache"), "HIT");
assert.equal(secondBody.cached, true);
assert.equal(secondBody.answer, firstBody.answer);
assert.deepEqual(secondBody.sources, firstBody.sources);
assert.equal(fetchCalls, 3, "identical first-turn question should use edge cache");

console.log("worker retrieval tests passed");
