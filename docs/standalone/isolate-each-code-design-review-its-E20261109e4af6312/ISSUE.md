<!-- insrc:artifact ISSUE-e4af63128c7cbec2 -->

# Isolate each code and design review in its own worker thread

## Reproduction

Start a long code or design review from one chat session. From another session, submit a committed code-review packet whose historical scope needs substantial admission verification. Expected: each review, including admission, runs in its own worker; acknowledgment and progress stay responsive. Observed: analyzer-s3-r4 was active from 2026-11-08T19:36:34.352Z during TU1 S1 admission. S1 start timed out at the MCP 300-second boundary before any checkpoint existed; Git checks continued after timeout. Retrying the same review ID returned already-running. Admission later failed with projection_limit: Projection decoded byte limit. The overlap is confirmed; a causal concurrency slowdown has not been measured separately from expensive projection.

## Root cause

Both code and design review routes explicitly execute on the main daemon instead of owning dedicated review workers. The per-session worker architecture does not isolate these paths. In src/workflow/code-review/task-review/coordinator.ts, start awaits admit before scheduling background run; admit awaits prepareReviewAdmission and saves the checkpoint only after verification succeeds. Consequently expensive admission remains on the request path, shares the main event loop with other review coordination, lacks a durable admission-progress checkpoint, and can outlive the MCP timeout. The coordinator reserves by review path, so a retry is refused while that admission remains active. The observed 64MiB projection failure is an additional deterministic scope-validation limit; thread isolation must not weaken or silently bypass it.

## Fix intent

Give every code review and every design review a dedicated daemon-owned worker thread, independent of originating chat-session threads. Include expensive admission, review execution and review-specific recovery/publication work in that worker. Keep the main daemon responsible for routing, trusted connection authority and worker lifecycle coordination. Acknowledge durable background submission before expensive admission; expose admission progress and terminal errors. Reuse existing worker transport/status/lifecycle infrastructure; preserve review identities, pinned inputs, same-review exclusion, controller-versus-daemon reviewer selection, explicit recovery, checkpoint history and human approval gates. Worker failure, cancellation and cleanup must affect only the target review. Verify overlapping code/code, design/design and code/design reviews, responsive progress and worker-failure recovery. No activation flags or review-engine redesign. Keep TU1 S1 pending; separately establish a bounded valid projection before its review can complete.

## Citations

- **[[c1]]** `code` `src/workflow/code-review/task-review/coordinator.ts` — "start awaits admission before scheduling run; admit reserves review identity and saves only after prepareReviewAdmission."
- **[[c2]]** `analyze-bundle` `Review concurrency analysis: coordinator imports admission.ts, sources.ts, execution.ts and progress.ts; src/daemon/task-review-rpc.ts is a coordinator importer. Graph coverage incomplete; main-thread routing independently verified from source.`
- **[[c3]]** `stakeholder` `User instruction: each chat session has its own thread; all reviews, design and code, should be spawned as a thread.`
- **[[c4]]** `step-output` `Observed daemon log /tmp/.insrc/daemon.38.log and checkpoint .insrc/tmp/code-review/analyzer-s3-r4.json: concurrent activity, MCP 300s timeout, already-running refusal and projection decoded-byte failure; no S1 checkpoint admitted.`
