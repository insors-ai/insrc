<!-- insrc:artifact BUILD-9a3432dcf930ade8-s1 -->

# Build (standalone trivial) — Story s1

**Size class:** trivial  ·  **Standalone:** yes  ·  **Created:** 2026-11-01T18:58:40.353Z  ·  **Updated:** 2026-11-01T19:04:04.716Z

**Commit:** c0daf832a

## Scope

Supply selected reviewed-version code blocks to reviewers

Start a multi-task review with selected source changes. attributionPrompt sends commit/path/segment descriptors without code. taskReviewPrompt also removes loaded before/after blobs. Submitted segments may contain before-only or paired before/after ranges, contrary to the agreed reviewed-version-only scope. Reviewer must fetch even the selected code before it can attribute or assess it.

The packet contract in src/workflow/code-review/task-review/contracts.ts accepts both before and after ranges. src/workflow/code-review/task-review/packet.ts loads both versions and validates both selections. src/workflow/code-review/task-review/assessment.ts serializes only change descriptors, while src/workflow/code-review/task-review/policy.ts strips the loaded source blobs from task input. Consequently neither prompt embeds selected reviewed-version code.

Restore the agreed contract for new submissions: only reviewed-version selected blocks, with actual selected code content delivered consistently to attribution and assessment. Resolve and verify content against pinned Git sources, include explicit file/line identity, and fetch old code only when needed. Represent deletions explicitly without inventing after content or supplying removed blocks. Keep commit pointers, strict scope and attribution coverage checks; preserve immutable historical attempts. Add focused regressions covering additions, modifications, deletions, source fidelity, both reviewer routes and recovery. This does not weaken coverage validation or automatically start a costly live review.

## Summary

Restored after-only review selections and embedded exact pinned selected code in attribution and assessment. Added verified deletion markers, explicit attribution indices, and immutable historical replay. Passed 78 focused task-review regressions plus 14 final scope/compatibility checks; typecheck/build and author self-review completed. No hosted S2 re-review started.

## Tasks validated

- ✓ `s1`

**Tests:** [TESTS.md](TESTS.md) — what the gate ran for each Task, and what each test case did.

## Changes

- `docs/task-review-execution.md` — **insrc-build** (2026-11-01T19:04:04.716Z)
- `src/daemon/task-review-rpc.ts` — **insrc-build** (2026-11-01T19:04:04.716Z)
- `src/workflow/code-review/task-review/__tests__/contracts.test.ts` — **insrc-build** (2026-11-01T19:04:04.716Z)
- `src/workflow/code-review/task-review/__tests__/coordinator.test.ts` — **insrc-build** (2026-11-01T19:04:04.716Z)
- `src/workflow/code-review/task-review/__tests__/history-fixture.ts` — **insrc-build** (2026-11-01T19:04:04.716Z)
- `src/workflow/code-review/task-review/__tests__/history.test.ts` — **insrc-build** (2026-11-01T19:04:04.716Z)
- `src/workflow/code-review/task-review/__tests__/policy.test.ts` — **insrc-build** (2026-11-01T19:04:04.716Z)
- `src/workflow/code-review/task-review/__tests__/publication-fixture.ts` — **insrc-build** (2026-11-01T19:04:04.716Z)
- `src/workflow/code-review/task-review/__tests__/selected-code.test.ts` — **insrc-build** (2026-11-01T19:04:04.716Z)
- `src/workflow/code-review/task-review/admission.ts` — **insrc-build** (2026-11-01T19:04:04.716Z)
- `src/workflow/code-review/task-review/assessment.ts` — **insrc-build** (2026-11-01T19:04:04.716Z)
- `src/workflow/code-review/task-review/contracts.ts` — **insrc-build** (2026-11-01T19:04:04.716Z)
- `src/workflow/code-review/task-review/packet.ts` — **insrc-build** (2026-11-01T19:04:04.716Z)
- `src/workflow/code-review/task-review/policy.ts` — **insrc-build** (2026-11-01T19:04:04.716Z)
- `src/workflow/code-review/task-review/publication.ts` — **insrc-build** (2026-11-01T19:04:04.716Z)
- `src/workflow/code-review/task-review/record.ts` — **insrc-build** (2026-11-01T19:04:04.716Z)
- `src/workflow/code-review/task-review/results.ts` — **insrc-build** (2026-11-01T19:04:04.716Z)
- `src/workflow/code-review/task-review/sources.ts` — **insrc-build** (2026-11-01T19:04:04.716Z)
