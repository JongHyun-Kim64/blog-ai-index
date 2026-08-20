# blog-ai-index

티스토리 블로그 **[Semiconductor Design Lab](https://semicon-circuit.tistory.com)** 에 AI 요약·관련 글 추천·Q&A 챗봇을 붙이는 파이프라인입니다.

반도체 회로 설계, DFT(BIST/BISR/Scan Chain), AI 가속기 아키텍처, Verilog/FPGA 실습을 다루는 블로그로, 글 97편이 인덱싱되어 있습니다.

글 요약·관련 글·검색은 미리 계산한 JSON만 사용하므로 방문자가 글을 읽을 때 API 호출이 없습니다. 자유 질문 Q&A만 Gemini API를 사용하며, 동일한 첫 질문은 Cloudflare Edge Cache에서 6시간 재사용합니다.

---

## 왜 이런 구조인가

티스토리는 스킨 HTML/CSS/JS만 편집할 수 있고 서버 코드를 돌릴 수 없습니다. [Open API도 2024년 2월에 종료](https://tistory.github.io/document-tistory-apis/)되어 글 목록을 API로 가져올 수도 없습니다.

그래서 **사이트맵을 크롤링해 외부에서 인덱스를 만들어두고, 스킨 JS는 그 JSON만 읽는** 구조로 우회했습니다.

```
GitHub Actions (주 2회, 월·목 05시 KST)
   │
   ├─ sitemap.xml 크롤링 → 본문 추출 (requests + BeautifulSoup)
   ├─ Heading 기준 본문 Chunk 생성
   ├─ Gemini API로 요약·키워드·임베딩 생성   ← 키 없으면 TF-IDF 폴백
   ├─ 임베딩 코사인 유사도로 관련 글 top-5 계산
   └─ int8 양자화 Embedding + Chunk를 docs/index.json에 커밋
              │
              ▼
     GitHub Pages (정적 서빙)
              │
              ▼
   티스토리 스킨 ai-features.js  ─── 요약 박스 / 관련 글 / 검색
              │
              ▼ (자유 질문일 때만)
   Cloudflare Worker
      ├─ Keyword + Embedding Hybrid Retrieval
      ├─ 현재 글·직전 출처 Context Boost
      └─ Gemini 근거 답변 + 문장별 Citation + Edge Cache
```

인덱스: https://jonghyun-kim64.github.io/blog-ai-index/index.json

---

## 구성

| 경로 | 역할 |
|---|---|
| `scripts/build_index.py` | 사이트맵 크롤링 → 요약·임베딩 → `index.json` 생성 (증분 처리) |
| `.github/workflows/update-index.yml` | 주 2회 자동 실행 + 수동 트리거 |
| `docs/index.json` | 스킨이 읽는 인덱스 (GitHub Pages로 서빙) |
| `docs/index.cache.json` | 임베딩 캐시 — 이게 있어야 증분 인덱싱이 동작 |
| `skin/ai-features.js` | 티스토리 스킨에 업로드하는 클라이언트 (채팅형 AI 패널) |
| `worker/worker.js` | Cloudflare Worker — Q&A 프록시 + 익명 사용 로그 |
| `skin-backup/` | 티스토리 원본 스킨 파일 백업 (`common.js`, `slick.js`, `style.css` 등) |
| `tests/` | Index Chunk/양자화 및 Worker Retrieval 회귀 테스트 |

---

## 클라이언트 기능

블로그 좌측 하단의 **✦AI** 버튼을 누르면 열리는 채팅 패널입니다.

- **AI 세 줄 요약** — 글 상단에 자동 표시 (인덱스에서 읽음, 호출 0회)
- **관련 글 추천** — 임베딩 유사도 기반. 카테고리·태그 매칭보다 정확합니다
- **블로그 내 검색** — 제목·키워드·본문 대상, 클라이언트에서 처리
- **자유 질문 Q&A** — Keyword와 Embedding을 결합해 관련 Chunk를 찾고 Gemini가 근거 기반으로 답합니다
- **문장별 Citation** — 답변의 `[1]` 표시가 실제 근거 글과 해당 Section 정보로 연결됩니다
- **현재 글 Context** — 질문한 페이지의 글과 직전 답변의 근거 글에 검색 우선순위를 부여합니다
- **대화 지속** — 다른 글로 이동해도 sessionStorage로 대화가 복원됩니다
- **후속 질문 맥락** — 직전 3턴과 근거 글을 함께 넘겨 "그럼 그건 왜?"가 통합니다
- **답변 Feedback** — 도움됨/부족함을 익명 로그로 남겨 개선할 질문을 찾습니다
- **Edge Cache** — 동일한 첫 질문은 6시간 재사용해 지연과 API 사용량을 줄입니다

### 입력 라우팅 기준

| 입력 | 처리 | 비용 |
|---|---|---|
| 고정 명령 (요약 / 관련 글 / 인기 글 / 최근 글) | 즉답 | 0원 |
| 1~2단어 키워드, "~찾아줘 / 검색 / 목록" | 글 목록 검색 | 0원 |
| 그 외 문장형 전부 | Hybrid Retrieval + Gemini 실시간 답변 | Worker 경유 |

AI 답변에는 근거 글 링크가 따라붙으므로 검색의 상위호환입니다. 그래서 **문장처럼 생겼으면 기본 AI**로 보냅니다.

---

## 설치

### 1. 인덱스 파이프라인

```bash
pip install -r scripts/requirements.txt
python scripts/build_index.py --blog https://your-blog.tistory.com --out docs/index.json
```

| 옵션 | 설명 |
|---|---|
| `--limit N` | 최대 N개만 처리 (테스트용) |
| `--force` | 기존 인덱스 무시하고 전체 재생성 |

- `GEMINI_API_KEY`를 저장소 Secret으로 등록하면 Gemini 품질 요약, 없으면 TF-IDF 폴백으로 동작합니다
- GitHub Pages는 `main` 브랜치 + `/docs` 로 설정
- 모델이 죽어도 계속 돌도록 후보 목록 자동 폴백이 들어 있습니다 (`GEMINI_TEXT_MODELS` / `GEMINI_EMBED_MODEL` 환경변수로 재정의 가능)

### 2. 티스토리 스킨

1. `skin/ai-features.js`의 `INDEX_URL`(+ 챗봇 쓸 경우 `WORKER_URL`)을 실제 주소로 수정
2. 티스토리 관리자 → 꾸미기 → 스킨 편집 → html 편집 → **파일업로드** 탭에 업로드
3. HTML 탭에서 `</body>` 바로 위에 추가 후 저장:

```html
<script src="./images/ai-features.js"></script>
```

> ⚠️ 파일을 재업로드한 뒤에는 **스킨 HTML을 한 번 더 저장**해야 합니다. 그래야 `_version_`이 갱신되어 CDN 엣지가 새 파일을 가져갑니다.

### 3. Cloudflare Worker (선택 — 실시간 Q&A용)

`worker/worker.js`를 Worker에 붙여넣고 Settings → Variables에 등록합니다.

| 변수 | 값 |
|---|---|
| `GEMINI_API_KEY` | Secret으로 등록 |
| `INDEX_URL` | GitHub Pages의 `index.json` 주소 |
| `ALLOWED_ORIGIN` | 블로그 주소 (다른 사이트의 도용 차단) |

무료 티어 보호를 위해 하루 답변 수가 `DAILY_LIMIT`(기본 200)로 제한됩니다.

### Q&A 처리 순서

1. 질문을 Gemini Embedding으로 변환합니다.
2. 공개 Index의 int8 양자화 Embedding과 Keyword 점수를 결합합니다.
3. 현재 글과 직전 답변의 출처 글을 가중하고, 관련 Heading Chunk 최대 6개를 선택합니다.
4. Gemini는 선택된 Chunk만 근거로 최대 6문장 답변과 `[N]` Citation을 생성합니다.
5. 첫 질문의 결과는 Index 생성 시각과 현재 글 번호를 포함한 Key로 6시간 Cache합니다.

Embedding API가 일시적으로 실패하거나 구형 Index에 `embq`가 없으면 Keyword Retrieval로 자동 폴백합니다.

---

## 검증

```bash
python -m unittest discover -s tests -p "test_*.py" -v
node --check docs/ai-features.js
node --check skin/ai-features.js
node --check worker/worker.js
node tests/worker.test.mjs
```

`validate-ai.yml`은 WIP 브랜치와 Pull Request에서 위 검사에 더해 실제 블로그 2개 글을 크롤링하는 Smoke Test를 수행합니다.

---

## 라이선스 / 참고

개인 블로그 운영용으로 만든 것이라 별도 라이선스는 두지 않았습니다. 같은 문제(티스토리 + 무료 AI 기능)를 겪는 분이 참고하셔도 좋습니다.

블로그: https://semicon-circuit.tistory.com
