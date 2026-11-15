<!-- insrc:artifact ISSUE-470a1f61b26b12c6 -->

# Rework review preparation and context lifecycle end to end

## Reproduction

1. Submit whole-story review worker-isolation-e4af6312-whole-story attempt4 for BUILD-e4af63128c7cbec2-s1 with committed packet design/review-worker-isolation-e4af6312.packet.json:171 distinct files across40 selected origin commits, source pin059411264eff73ca871a39ebe8406bead4389cf1 and three saved earlier attempts. 2. Observe scope_preparation from2026-11-14T06:56:56Z until cancellation at approximately08:01Z, with zero task assessments and progress sequence0 despite more than10700 native operations. 3. On a stopped-review copy, reconstruct each submitted packet read-only:13031 source queries,5052 distinct,7979 duplicates(61.2%),78.06seconds without worker lease persistence. The second packet repeats all3129 first-packet source queries. Five disposable-copy measurements of the2083189-byte checkpoint give49.39ms median full durable update, including validation, serialization and synchronization. These are isolated measurements, not a complete live-hour timing attribution. Expected: complete and correct context preparation with bounded work and visible progress, responsive cancellation and explicit failure/recovery; history growth must not multiply unchanged source qualification or large-history writes per native operation. No model assessment should be reported until it actually starts. The canceled checkpoint remains preserved with a recovery fence; no automatic resume is authorized.

## Root cause

prepareReviewAdmission reconstructs each saved attempt using prepareReviewPacket, then prepares the current packet. prepareReviewPacket creates its own bounded source cache, so verified immutable queries are discarded between packet reconstructions. Publication reconstructs saved/current scope again; cleanup calls full admission qualification. Separately, runReviewWorker routes lease open/close through updateReviewWorkerResource and the family-wide checkpoint writers: even a small lease mutation reads and validates the whole history, serializes the complete checkpoint, writes a replacement, synchronizes the file, renames and synchronizes the directory. Preparation has no meaningful operation-level progress even though this expensive native work is active. Immutable source evidence, mutable workflow authority/freshness and hot operational metadata lack a coherent lifecycle-wide preparation boundary. The live slowdown was measured for code review; design review uses different latest-content preparation and shared operational persistence, so its behavior must be assessed independently rather than assuming the same Git-query defect.

## Fix intent

Correct preparation/context building as one holistic, prerequisite change to the existing review lifecycle. Produce an LLD and build plan covering submission/admission, task/chunk context delivery, re-review and resume, publication, approval and cleanup for both families, with an explicit matrix for story/task scope and epic/standalone/issue routes. Establish when immutable evidence is qualified, how prepared context is identified, safely reused and invalidated, which current author/route/content/approval checks must rerun, and how source work is bounded and scheduled without duplicate reconstruction. Design durable persistence so hot lease/progress transitions do not scale with immutable history size; specify ownership, atomicity, crash recovery, compaction/retention and historical-format handling where applicable. Include concurrent reviews, effective targeted cancellation through a supported interface, resource fencing and honest incremental preparation progress. Preserve code's pinned revision/selected-change scope and design's latest-artifact capture/change invalidation, all existing provenance/coverage/independence/human approval guarantees and existing worker/coordinator responsibilities. Define and measure stage-specific performance/operation-count/write-amplification budgets using the171-file/four-attempt workload and growing-history, cold/warm, concurrent and failure cases; require evidence equivalence and full native-pipeline timings rather than microbenchmark-only claims. A local memoization patch, increased timeout, reduced scope, skipped validation or new trust/activation machinery alone does not satisfy this fix. Prioritize this before resuming the unfinished worker-isolation BUILD; do not silently restart or rewrite the stopped attempt. Storage layout, cache lifetime and batching strategy are design decisions to resolve in the LLD, not predetermined by this issue.

## Citations

- **[[c1]]** `code` `src/workflow/code-review/task-review/admission.ts`
- **[[c2]]** `code` `src/workflow/code-review/task-review/packet.ts`
- **[[c3]]** `code` `src/workflow/code-review/task-review/publication.ts`
- **[[c4]]** `code` `src/workflow/code-review/task-review/cleanup.ts`
- **[[c5]]** `code` `src/workflow/code-review/task-review/checkpoint.ts`
- **[[c6]]** `code` `src/workflow/review/design-review/subject.ts`
- **[[c7]]** `code` `src/workflow/review/design-review/checkpoint.ts`
- **[[c8]]** `code` `src/daemon/threads/review-worker-resources.ts`
- **[[c9]]** `code` `src/daemon/threads/review-worker-runtime.ts`
- **[[c10]]** `code` `src/daemon/threads/review-workers.ts`
- **[[c11]]** `doc` `/tmp/review-preparation-profile.json`
- **[[c12]]** `doc` `/tmp/profile-review-admission.mts`
- **[[c13]]** `prior-artifact` `.insrc/artifacts/BUILD-e4af63128c7cbec2-s1.json`
- **[[c14]]** `prior-artifact` `.insrc/artifacts/LLD-e4af63128c7cbec2-s1.json`
- **[[c15]]** `stakeholder` `User instruction,2026-11-14: preparation/context building must be fixed first with a holistic design, not a short-term correction.`
