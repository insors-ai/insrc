<!-- insrc:artifact BUILD-66d4d41d99f805af-s1 -->

# Build (standalone) — Story s1

**Standalone:** yes  ·  **Created:** 2026-11-11T12:12:10.791Z  ·  **Updated:** 2026-11-11T12:28:52.211Z

**Commit:** e99aadce4

## Summary

pathContinuity now checks only the edges of commits listed by pathChanges (full history of the selected path), keeping the exemption, message and limits; pinned identity still matches (commit e99aadce4). Story commits: t1 441cd725e, t2 6946957d1, t3 f42060471, t4 e99aadce4. Smoke: the eedc4519199b24b4/s1 correction packet is admitted (1088 reads, 10.9 MiB) and saved attempts 1-3 re-prepare to their stored identities, run offline with admission's own check because the installed daemon is not yet updated (SMOKE.md).

## Tasks validated

- ✓ `t1`
- ✓ `t2`
- ✓ `t3`
- ✓ `t4`

**Tests:** [TESTS.md](TESTS.md) — what the gate ran for each Task, and what each test case did.

## Changes

- `src/workflow/code-review/task-review/__tests__/projection-lineage.test.ts` — **insrc-build** (2026-11-11T12:28:52.211Z)
- `src/daemon/tools/builtins/git/__tests__/git-path-history-full.test.ts` — **insrc-build** (2026-11-11T12:28:52.211Z)
- `src/daemon/tools/builtins/git/path-history.ts` — **insrc-build** (2026-11-11T12:28:52.211Z)
- `src/workflow/code-review/task-review/__tests__/admission-checkpoint.test.ts` — **insrc-build** (2026-11-11T12:28:52.211Z)
- `src/workflow/code-review/task-review/__tests__/admission.test.ts` — **insrc-build** (2026-11-11T12:28:52.211Z)
- `src/workflow/code-review/task-review/__tests__/contracts.test.ts` — **insrc-build** (2026-11-11T12:28:52.211Z)
- `src/workflow/code-review/task-review/__tests__/coordinator.test.ts` — **insrc-build** (2026-11-11T12:28:52.211Z)
- `src/workflow/code-review/task-review/__tests__/history.test.ts` — **insrc-build** (2026-11-11T12:28:52.211Z)
- `src/workflow/code-review/task-review/__tests__/ownership.test.ts` — **insrc-build** (2026-11-11T12:28:52.211Z)
- `src/workflow/code-review/task-review/__tests__/projection-intervals.test.ts` — **insrc-build** (2026-11-11T12:28:52.211Z)
- `src/workflow/code-review/task-review/__tests__/projection.test.ts` — **insrc-build** (2026-11-11T12:28:52.211Z)
- `src/workflow/code-review/task-review/__tests__/selected-code.test.ts` — **insrc-build** (2026-11-11T12:28:52.211Z)
- `src/workflow/code-review/task-review/projection.ts` — **insrc-build** (2026-11-11T12:28:52.211Z)
- `src/workflow/code-review/task-review/sources.ts` — **insrc-build** (2026-11-11T12:28:52.211Z)
- `docs/standalone/code-review-refuses-correction-packet-because-E2026111166d4d41d/S001/SMOKE.md` — **insrc-build** (2026-11-11T12:28:52.211Z)
