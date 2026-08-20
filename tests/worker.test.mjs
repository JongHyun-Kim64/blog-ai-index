import assert from "node:assert/strict";
import {
  default as worker,
  cosineQuantized,
  pickChunks,
  pickPosts,
  tokenize,
} from "../worker/worker.js";

assert.deepEqual(tokenize("Systolic Array 오류율"), [
  "systolic", "array", "오류율", "오류", "류율",
]);

assert.ok(cosineQuantized([1, 0], [127, 0]) > 0.999);
assert.ok(cosineQuantized([1, 0], [0, 127]) < 0.001);

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
assert.equal(firstBody.sources[0].id, 2);
assert.match(firstBody.answer, /\[1\]/);
assert.equal(cacheStore.size, 1, "first answer should be cached");
assert.equal(fetchCalls, 3, "index, embedding, and generation should each run once");

const secondResponse = await worker.fetch(makeRequest(), env, { waitUntil() {} });
const secondBody = await secondResponse.json();
assert.deepEqual(secondBody, firstBody);
assert.equal(fetchCalls, 3, "identical first-turn question should use edge cache");

console.log("worker retrieval tests passed");
