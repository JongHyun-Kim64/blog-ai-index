# Public article audit — 2026-09-09

Status: IN PROGRESS. Do not interpret the collection audit as completed prose review.

## Preservation and scope

- Public sitemap: 100 posts; fresh source backups and SHA-256 inventory in `tmp/content-audit-20260909`.
- No failed downloads, category-count mismatches, or internal post links outside the public sitemap in the collection audit.
- 77 posts contain authored inline text colors; none contains inline `color: ... !important`.
- Images, code, publication date, privacy and technical meaning must be preserved.
- Dark prose normalization is a common skin fix, not an edit to all original posts.

## Prose review ledger

Each listed post has been read in full prose form. Items below are proposals, NOT saved edits. Technical corrections require primary-source checks.

| Post | Review finding / next action | Saved |
| --- | --- | --- |
| 124 | Previous HBM title is outdated; several main sections are not semantic headings. Update navigation title and section structure. | No |
| 123 | Previous /112 title is outdated; now-published /124 is still described as future. Check heading hierarchy. | No |
| 122 | Coherent project framing; parity limitations and bypass boundaries explicit. No confirmed prose change needed. | Unchanged |
| 121 | Column Weight Swapping says entire row, likely column; check STRAIT original. Intro is repetitive; `Register이` and `재활용(…)할` grammar. Avoid absolute recovery claims. | No |
| 120 | Explain fault propagation in the specific scan-test context, not universally for functional MAC operation; verify DLC topology before revision. | No |
| 119 | `신호가 … 전송합니다` grammar; repeated Scan Chain possessive; quantitative/absolute benefit claims need explicit experimental scope. | No |
| 118 | Missing period; real-time mapping/pre-saved fault-map and comparison claims need source check. Improve terminology consistency. | No |
| 117 | `유후` → `유휴` caption; CONV does not universally require explicit im2col. Main sections are styled text instead of headings. | No |
| 116 | Tiling example confuses output elements with total MAC count; define M,N,K and tile counts. On-chip buffer is on chip, not necessarily inside the PE array. | No |
| 115 | Unrolling reduces ideal cycles, not MAC count; WS/IS step 4 says right while following paragraph says down. IS text incorrectly reuses Weight Register/stored weight. | No |
| 114 | DNN definition says one hidden layer; clarify multiple hidden layers. Mini-batch powers-of-two are not a requirement. FC can connect intermediate layers, not only model input/output. | No |
| 113 | Parallelism does not reduce arithmetic operation count. Qualify OS/WS accumulation behavior; remove universal all-metrics superiority inferred from heterogeneous comparison figure. Update old future navigation label. | No |

## Partial observations, not full prose review

- /27: nested list spans retain #333333. Dark-mode local regression now resolves these to #dedede. Resistance approximations and `Ioc` spelling need a full text/source check.

## Visual verification

- Local /27 dark mode: nested Rdum / RT list items and all inner spans are rgb(222,222,222), no horizontal overflow.
- All 100 public posts loaded in local browser dark mode; 7,076 prose/caption text segments checked for computed contrast, excluding code/math/interactive widgets. No horizontal overflow. One failing orphan span inside /11 OpenGraph figure (1.41:1) identified and separately fixed; retest pending.
- Code highlighting and light-mode regression checks pending.
