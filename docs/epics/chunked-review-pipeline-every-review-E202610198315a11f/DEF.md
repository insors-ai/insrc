<!-- insrc:artifact DEF-8315a11f29fd2812 -->

# Epic: chunked-review-pipeline-every-review

## Summary

**Flavor:** enhancement

Every review in insrc, of code or of a design document, completes for work of any size and is judged on coherent material. Large reviews are divided into parts that keep related material together, each part fits comfortably in the reviewing model, and the parts' results are gathered into the one verdict the review gives today. Small reviews behave exactly as they do now.

## Contents

1. [Problem](#1-problem)
2. [Functional requirements](#2-functional-requirements)
3. [Non-goals](#3-non-goals)
4. [Assumptions](#4-assumptions)
5. [Constraints](#5-constraints)
6. [Stories](#6-stories)
7. [References](#7-references)

## 1. Problem

Every review insrc runs, whether the post-build code review of a Story or the review of a design document before approval, sends all of its material to the reviewing model at once. Nothing measures that material against what a model can take in or review well, so a large Story or a long design either cannot be reviewed at all or is reviewed with the model's attention spread thin over far more than it can weigh. On 2026-10-18 the code review of Epic c2ba6fa6's first Story built a prompt of about 1.25 million characters; the reviewing model refused it and the review ended with no record, so the Story was approved without one. The partial remedy built for code review alone splits material only when it would be refused, groups it by size rather than by how the code relates, so related functions can be judged in separate calls that never see each other, and leaves the design-document review untouched. When a review is done in several calls, nothing ties each answer to the call that asked for it, and an identical prompt can be sent again on a retry. The result is that the reviews meant to guard every approval are least reliable exactly where the change is largest.

## 2. Functional requirements

- **E202610198315a11f:FR001** — Every review (code review and design-document review, daemon and controller paths) passes through the same prepare, review and gather stages.
- **E202610198315a11f:FR002** — A review whose material is at or under the chunk limit is reviewed in one call and gives the same result as today.
- **E202610198315a11f:FR003** — A review whose material exceeds the chunk limit is divided into chunks that each fit and that keep related material together: for code, changed code with the changed code it calls or is called by, then by file and module; for documents, sections with the sections they reference.
- **E202610198315a11f:FR004** — Where related material falls into different chunks, each chunk carries a short summary of the related material it does not hold.
- **E202610198315a11f:FR005** — Every changed symbol and every document section is reviewed whole in some chunk; nothing is cut or dropped, and an item too large for a chunk on its own is reported by name.
- **E202610198315a11f:FR006** — The gather stage gives each review one result: the chunks' findings merged, every obligation (an approved clause, a requirement, a promised test, a module's conventions) judged on the evidence from every chunk, every relationship that crosses chunks judged, and duplicated logic across chunks found, each judged as one review over the whole material would judge it, with no new review criteria; every gather call also fits the chunk limit.
- **E202610198315a11f:FR007** — Every model call carries a unique identifier its answer must return; an answer with a missing or different identifier is rejected and the call retried under a new identifier, so no prompt is ever sent twice.
- **E202610198315a11f:FR008** — The chunk limit is one setting expressed in tokens, with a default of 128K.
- **E202610198315a11f:FR009** — A provider's refusal of a prompt for its size divides that call's material further instead of resending it.
- **E202610198315a11f:FR010** — Epic c2ba6fa6 Story s1's code review completes on the installed daemon.

**s1:**

- **E202610198315a11f:S001:FR001** — Code review and design-document review both run every review through prepare, review and gather, whether or not it is split.
- **E202610198315a11f:S001:FR002** — A review at or under the chunk limit is one call and gives today's result.
- **E202610198315a11f:S001:FR003** — Every model call carries a unique identifier its answer must return; a mismatched answer is retried under a new identifier.
- **E202610198315a11f:S001:FR004** — The chunk limit is one setting in tokens, default 128K, counted at three characters per token.
- **E202610198315a11f:S001:FR005** — A size refusal divides the call's material further and is never resent.

**s2:**

- **E202610198315a11f:S002:FR001** — Changed code over the chunk limit is divided into chunks that keep related changed code together: call relationships first, then file, then module.
- **E202610198315a11f:S002:FR002** — Each chunk carries a short summary of related changed code held in another chunk.
- **E202610198315a11f:S002:FR003** — Every changed symbol is reviewed whole in some chunk; one too large on its own is named, never cut.

**s3:**

- **E202610198315a11f:S003:FR001** — A divided code review gives one result with merged findings and every obligation judged on all chunks' evidence.
- **E202610198315a11f:S003:FR002** — Relationships between changed code in different chunks are judged.
- **E202610198315a11f:S003:FR003** — Duplicated logic across chunks is found.
- **E202610198315a11f:S003:FR004** — Epic c2ba6fa6 Story s1's code review completes on the installed daemon.

**s4:**

- **E202610198315a11f:S004:FR001** — A design document over the chunk limit is divided into chunks that keep each section with the sections it references.
- **E202610198315a11f:S004:FR002** — Each chunk carries a short summary of referenced sections held elsewhere.
- **E202610198315a11f:S004:FR003** — A divided design-document review gives one result under today's verdict rules.

**s5:**

- **E202610198315a11f:S005:FR001** — Controller-side code and design-document reviews walk the same chunks as the daemon, one call at a time.
- **E202610198315a11f:S005:FR002** — Each controller answer is matched to its call by identifier.
- **E202610198315a11f:S005:FR003** — A controller-side review at or under the limit proceeds as today.

## 3. Non-goals

- **Changing what a review judges: the code-review dimensions, the design-review checks, and how a verdict is folded stay as they are.** — The Epic is about how review material is prepared and gathered, not about the review criteria.
- **Counting tokens exactly with each model's own tokenizer.** — The CLI providers do not expose their tokenizers; a fixed characters-per-token rule was chosen instead [[c4]].
- **A different chunk size per provider or per model.** — The stakeholder asked to keep the pipeline simple with one limit that fits every review-capable model [[c3]].
- **Chunking the analyzer or other non-review model calls.** — Large analyzer results are the subject of analyzer Epic b9d5c5c4 Story S003 [[c8]].
- **Sending a review's model calls in parallel.** — Model calls are made one after another by project rule [[c10]].
- **Finishing ISSUE-aef82b03 tasks t5 to t14 as designed.** — The stakeholder folded that issue into this Epic; its delivered t1 to t4 are reused and the rest is superseded [[c12]].

## 4. Assumptions

- `med` Review-capable models served through Ollama have context windows of at least 256K tokens, so a 128K-token chunk fits them comfortably. [[c3]]
- `high` The codex and claude CLIs accept a chunk of 384K characters: codex states a limit of 1,048,576 characters. [[c5]]
- `med` Three characters per token is expected to be conservative for code and JSON, so a 384K-character chunk should stay at or under 128K tokens; the daemon already uses 3 as its characters-to-tokens heuristic for the local provider [[c14]]. This is an estimate, not a guarantee: a provider's refusal of a chunk for its size remains the safety net. [[c4]]
- `med` The code graph's caller and callee names for each changed symbol are enough to group related changed code, though the graph can miss some call edges. [[c7]]
- `high` ISSUE-aef82b03's delivered size-refusal detection, provider input budgets, batch packing and review-job loop can be reused as building blocks. [[c9]]

## 5. Constraints

| ID | Type | Text | Source |
| :--- | :--- | :--- | :--- |
| `k1` | stakeholder | Review material is divided by coherence, not by text length alone: the reviewer must see related material together. | [[c1]] |
| `k2` | stakeholder | Every review, of code and of design documents, on the daemon and the controller paths, runs the same three stages (prepare, review, gather), whether it is split or not. [[c17]] | [[c3]] |
| `k3` | stakeholder | A chunk holds at most 128K tokens, measured as 3 characters per token [[c4]] (384K characters), the same for every provider. | [[c2]] |
| `k4` | stakeholder | Every model call carries a unique identifier that its answer must return, so no answer is taken for another call's. | [[c15]] |
| `k5` | invariant | Accuracy is primary; cost is the least priority. | [[c6]] |
| `k6` | convention | Model calls are never made in parallel; always serially. | [[c10]] |
| `k7` | contract | Cloud models are reached only through the installed claude and codex CLIs; no direct REST calls. | [[c11]] |
| `k8` | stakeholder | No review material is capped or truncated to make it fit. | [[c13]] |
| `k9` | stakeholder | Ollama may run reviews when it is configured with a high-end model. | [[c16]] |
| `k10` | invariant | A review whose material is at or under the chunk limit gives exactly today's findings and verdict, and the review criteria and verdict rules of both review kinds are unchanged; dividing a review changes how its material is read, never what it is judged against. | [[c3]] |

## 6. Stories

### 6.1 E202610198315a11f:S001 — Every review runs through one prepare, review and gather pipeline

**User value:** `size: L`

Whoever runs a code review or a design-document review gets the same result as today for ordinary work, while every model call in the review is tied to the answer that comes back for it and is never sent twice.

**Extends:** [[c7]] [[c9]]

**Acceptance criteria:**

- **ac1:** Given a code review or a design-document review whose material is at or under the chunk limit, when the review runs on the daemon, then it passes through the prepare, review and gather stages as one chunk and gives the same findings and verdict as the review gives today. _(operationalizes `k2`)_
- **ac2:** Given a review in progress, when a model answer returns no identifier, or an identifier other than the one its call carried, then the answer is rejected, the call is retried under a new identifier, and no prompt is sent twice. _(operationalizes `k4`)_
- **ac3:** Given the chunk-limit setting at its default, when a review's material is measured, then the limit is 128K tokens counted at three characters per token, the same for every provider. _(operationalizes `k3`)_
- **ac4:** Given a review call that the provider refuses for its size, when the refusal comes back, then the call's material is divided further and the smaller calls are sent; the refused prompt is never resent. _(operationalizes `k8`, `k5`)_
- **ac5:** Given reviews configured to run on a high-end Ollama model, when a review runs, then it completes through the same pipeline. _(operationalizes `k9`, `k7`)_

### 6.2 E202610198315a11f:S002 — A large code review is divided into chunks of related code

**User value:** `size: L`

A reviewer judging a large Story sees each changed function together with the changed code it calls and is called by, so problems between related functions are not missed because they landed in different calls.

**Depends on:** `s1`

**Extends:** [[c7]]

**Acceptance criteria:**

- **ac1:** Given a code review whose material exceeds the chunk limit, when it is prepared, then its changed code is divided into chunks that each fit, keeping changed code with the changed code it calls or is called by, then by file and module. _(operationalizes `k1`, `k3`)_
- **ac2:** Given two related changed functions that fall into different chunks, when either chunk is reviewed, then the chunk carries a short summary of the related function it does not hold. _(operationalizes `k1`)_
- **ac3:** Given a large code review, when it is prepared, then every changed symbol is reviewed whole in some chunk and none is cut or dropped; a symbol too large for a chunk on its own is reported by name. _(operationalizes `k8`, `k5`)_

### 6.3 E202610198315a11f:S003 — A divided code review gives one complete result

**User value:** `size: L`

A Story reviewed in several chunks gets one verdict that is as complete as a single review: every design clause, requirement and promised test is judged on all the evidence, and problems that span chunks are found.

**Depends on:** `s2`

**Acceptance criteria:**

- **ac1:** Given a code review divided into several chunks, when its chunks have been reviewed, then the gather stage gives one result in which the chunks' findings are merged and every approved clause, requirement, promised test and module's conventions is judged on the evidence from every chunk. _(operationalizes `k2`, `k5`)_
- **ac2:** Given related changed functions held in different chunks, when the review is gathered, then the relationship between them is judged and a mismatch between them is reported. _(operationalizes `k1`)_
- **ac3:** Given duplicated logic in changed code held in different chunks, when the review is gathered, then the duplication is reported. _(operationalizes `k5`)_
- **ac4:** Given Epic c2ba6fa6 Story s1, whose code review was refused for size on 2026-10-18, when its code review runs on the installed daemon, then the review completes and records a verdict. _(operationalizes `k3`, `k5`)_

### 6.4 E202610198315a11f:S004 — A long design document is reviewed in coherent parts and gives one result

**User value:** `size: M`

A reviewer checking a long design document before approval judges each part with the sections it depends on, and the document still gets one verdict covering all of it.

**Depends on:** `s1`

**Extends:** [[c7]]

**Acceptance criteria:**

- **ac1:** Given a design-document review whose material exceeds the chunk limit, when it is prepared, then the document is divided into chunks that each fit and keep each section with the sections it references, and every section is reviewed whole in some chunk. _(operationalizes `k1`, `k3`, `k8`)_
- **ac2:** Given a section that references a section held in another chunk, when its chunk is reviewed, then the chunk carries a short summary of the referenced section. _(operationalizes `k1`)_
- **ac3:** Given a design-document review divided into several chunks, when its chunks have been reviewed, then the gather stage gives one review result for the document, with the same verdict rules as today. _(operationalizes `k2`, `k5`)_

### 6.5 E202610198315a11f:S005 — The controller's reviews walk the same chunks call by call

**User value:** `size: M`

When the other party reviews from the controller side, a large code review or design-document review completes there too, one call at a time, with each answer matched to its call.

**Depends on:** `s3`, `s4`

**Acceptance criteria:**

- **ac1:** Given a code review or design-document review run from the controller side whose material exceeds the chunk limit, when the controller steps through it, then it is handed the same chunks the daemon would review, one call at a time, and the review records the same kind of result as the daemon path. _(operationalizes `k2`)_
- **ac2:** Given the controller answering a call, when its answer carries a missing or different identifier, then the answer is rejected and the call is offered again under a new identifier. _(operationalizes `k4`)_
- **ac3:** Given a controller-side review at or under the chunk limit, when the controller steps through it, then it proceeds as it does today. _(operationalizes `k2`)_

## 7. References

- **[[c1]]** `stakeholder` `user, 2026-10-19` — "the split can't be just based on text length chunking, the reviewer need coherent context to review"
- **[[c2]]** `stakeholder` `user, 2026-10-19` — "a comfortable limit would be 128K tokens (equivalent in words)"
- **[[c3]]** `stakeholder` `user, 2026-10-19` — "pre->review->post is a standard pipeline, split or no split, keep things simple. models capable of review in ollama typically have a context windown >= 256K token, hence i selected a value that would "
- **[[c4]]** `stakeholder` `user, 2026-10-19` — "A (recommended): 3 characters per token"
- **[[c5]]** `doc` `docs/standalone/review-every-changed-symbol-story-too-E20261018aef82b03/ISSUE.md#reproduction` — "the daemon built a 1,247,701-character review prompt; the codex CLI refused it with 'Input exceeds the maximum length of 1048576 characters' (input_too_large)"
- **[[c6]]** `doc` `CLAUDE.md` — "Accuracy is primary; cost is the least priority."
- **[[c7]]** `analyze-bundle` `s1: insrc_analyze_step structural-map of 2026-10-19 over src/workflow/code-review, src/daemon/steps/code-review-step and src/workflow/review`
- **[[c8]]** `analyze-bundle` `s1: insrc_analyze_step prose-retrieval of 2026-10-19 over review chunking in docs (ISSUE-aef82b03 LLD; analyzer Epic b9d5c5c4 HLD S003)`
- **[[c9]]** `code` `src/workflow/code-review/review-job.ts`
- **[[c10]]** `doc` `CLAUDE.md` — "Never `Promise.all` anything that reaches an LLM provider (cloud or local Ollama embed / complete); always serial `for...of` with sequential awaits."
- **[[c11]]** `doc` `CLAUDE.md` — "No direct cloud REST calls from our process."
- **[[c12]]** `stakeholder` `user, 2026-10-19` — "A (recommended): track the pipeline as new work and fold ISSUE-aef82b03 into it."
- **[[c13]]** `stakeholder` `user, 2026-10-08` — "we have run into issues due to capping"
- **[[c14]]** `code` `src/config/config-catalog.ts:130` — "{ path: 'models.local.charsPerToken',  type: 'number', default: 3,                          desc: 'chars→tokens heuristic (local provider)'"
- **[[c15]]** `stakeholder` `user, 2026-10-19` — "each LLM call should have a UUID atttached and the LLM asked to include the UUID in the response so that there is no cross talk"
- **[[c16]]** `stakeholder` `user, 2026-10-19` — "ollama can run reviews if configured with a higher-end model"
- **[[c17]]** `stakeholder` `user, 2026-10-19` — "there should be a review pre-processor that is invoked prior to any review that creates coherent chunks if the input size is > than this limit and a post-processor that does the gather if the review w"
