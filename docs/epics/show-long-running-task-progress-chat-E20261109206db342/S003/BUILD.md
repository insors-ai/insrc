<!-- insrc:artifact BUILD-206db3426ffd4428-s3 -->

# Build (plan-driven) — Story s3

**Standalone:** no  ·  **Created:** 2026-11-14T18:45:39.602Z  ·  **Updated:** 2026-11-15T05:49:21.318Z

**Commit:** 86b1389a5

## Summary

t5 bound observed review admissions to progress tasks via the s1 launchReview seam (user-selected option b; pre-check analysis recorded in BUILD.md). bindReviewTask orchestrates launch+register fire-and-forget from ReviewWorkers.admitOwned. All 3 plan-named tests pass, now including a never-settling launch proving admission is never slowed; touched files typecheck clean; S2-e2e and owner-lifecycle failures are pre-existing on the clean tree.

## Tasks validated

- ✓ `t1`
- ✓ `t2`
- ✓ `t3`
- ✓ `t4`
- ✗ `t5`

**Tests:** [TESTS.md](TESTS.md) — what the gate ran for each Task, and what each test case did.

## t5 admission-path analysis (plan-mandated pre-check)

The plan required confirming which review-admission requests carry a chat origin bound to the connection (what `ProgressAccess.launch` requires) before building.

**Finding: none do.** The review admission path is `ProductionReviews.codeStart` / `designStart` (src/daemon/review-service.ts:128, :192) → `this.context(trusted)` (review-service.ts:95 — passes the socket's `TrustedRpcContext` through, rejecting only session-memory) → `ReviewWorkers.admit/admitOwned` (review-workers.ts:123/126), which carries only `connectionIdentity`, `daemonEpoch` and `connectionSignal` — no bound origin. The only product caller of an origin-bound launch is `executor-relay.ts:245` (`launchBound`) on executor connections; `progress.origin.open` / `progress.origin.bind` (task-progress/rpc.ts:41/45) have no product callers outside the progress RPC surface itself. So a review admission can never satisfy `launch`'s `boundOrigins` check.

**Resolution:** reported to the user, who chose option (b) — a review-specific daemon-internal launch seam `ProgressAccess.launchReview` (access.ts:176) that mints authorization with `origin: { turnId: reviewId }` without requiring a client-bound origin. No IPC method exposes it; `bindReviewTask` (review-measurements.ts:189) is the only caller, invoked fire-and-forget from `ReviewWorkers.admitOwned` (review-workers.ts:188). The plan's bound-origin/no-origin acceptance wording predates this decision; the observed path is now "any non-session review admission" and the unobserved path is "session, aborted, session-memory, refused launch/register" — covered by the three named tests.

## Changes

- `src/daemon/threads/__tests__/review-workers-progress-of.test.ts` — **insrc-build** (2026-11-15T05:49:21.318Z)
- `src/daemon/threads/review-workers.ts` — **insrc-build** (2026-11-15T05:49:21.318Z)
- `src/daemon/task-progress/__tests__/review-measurements.test.ts` — **insrc-build** (2026-11-15T05:49:21.318Z)
- `src/daemon/task-progress/review-measurements.ts` — **insrc-build** (2026-11-15T05:49:21.318Z)
- `src/daemon/handler-runtime.ts` — **insrc-build** (2026-11-15T05:49:21.318Z)
- `src/daemon/index.ts` — **insrc-build** (2026-11-15T05:49:21.318Z)
- `src/daemon/task-progress/__tests__/review-producers.test.ts` — **insrc-build** (2026-11-15T05:49:21.318Z)
- `src/daemon/task-progress/executor-measurements.ts` — **insrc-build** (2026-11-15T05:49:21.318Z)
- `src/daemon/task-progress/executor-relay.ts` — **insrc-build** (2026-11-15T05:49:21.318Z)
- `src/daemon/review-service.ts` — **insrc-build** (2026-11-15T05:49:21.318Z)
- `src/daemon/task-progress/access.ts` — **insrc-build** (2026-11-15T05:49:21.318Z)
- `src/daemon/threads/__tests__/helpers/review-stub-worker.ts` — **insrc-build** (2026-11-15T05:49:21.318Z)
- `src/daemon/threads/__tests__/review-task-binding.test.ts` — **insrc-build** (2026-11-15T05:49:21.318Z)
