<!-- insrc:artifact BUILD-5f9d4ab4c90c0b4c-s1 -->

# Build (standalone) — Story s1

**Standalone:** yes  ·  **Created:** 2026-11-24T08:56:06.826Z  ·  **Updated:** 2026-11-24T13:03:44.021Z

**Commit:** 6c0d3a0af

## Summary

t8 sweep with persisted evidence (6c0d3a0af): tsc clean; docs/standalone/.../S001/t8-sweep-evidence.txt holds the per-file results — all 408 src/workflow files run individually under Node 22.22.1 (2505 pass / 5 fail; the 5 failures reproduce at clean HEAD via git stash, pre-existing baseline) and all 27 src/mcp files (105 pass / 0 fail). All t1-t7 test files pass.

## Tasks validated

- ✓ `t1`
- ✓ `t2`
- ✓ `t3`
- ✓ `t4`
- ✓ `t5`
- ✗ `t6`
- ✓ `t7`
- ✗ `t8`

**Tests:** [TESTS.md](TESTS.md) — what the gate ran for each Task, and what each test case did.

## Changes

- `src/workflow/__tests__/gates.test.ts` — **insrc-build** (2026-11-24T13:03:44.021Z)
- `src/workflow/gates.ts` — **insrc-build** (2026-11-24T13:03:44.021Z)
- `src/workflow/runners/tracker/__tests__/context-head-kind.test.ts` — **insrc-build** (2026-11-24T13:03:44.021Z)
- `src/workflow/runners/tracker/context.ts` — **insrc-build** (2026-11-24T13:03:44.021Z)
- `src/workflow/runners/tracker/schemas.ts` — **insrc-build** (2026-11-24T13:03:44.021Z)
- `src/workflow/tracker/__tests__/render-issue-epic-body.test.ts` — **insrc-build** (2026-11-24T13:03:44.021Z)
- `src/workflow/tracker/conventions.ts` — **insrc-build** (2026-11-24T13:03:44.021Z)
- `src/workflow/runners/tracker/__tests__/gh-issue-edit-add-label.test.ts` — **insrc-build** (2026-11-24T13:03:44.021Z)
- `src/workflow/runners/tracker/__tests__/push-prompt-issue.test.ts` — **insrc-build** (2026-11-24T13:03:44.021Z)
- `src/workflow/runners/tracker/index.ts` — **insrc-build** (2026-11-24T13:03:44.021Z)
- `src/workflow/__tests__/tracker-issue-persistence.test.ts` — **insrc-build** (2026-11-24T13:03:44.021Z)
- `src/workflow/orchestrator.ts` — **insrc-build** (2026-11-24T13:03:44.021Z)
- `src/workflow/tracker/link.ts` — **insrc-build** (2026-11-24T13:03:44.021Z)
- `src/workflow/tracker/sync.ts` — **insrc-build** (2026-11-24T13:03:44.021Z)
- `src/workflow/tracker/unit-issue.ts` — **insrc-build** (2026-11-24T13:03:44.021Z)
- `src/workflow/__tests__/chain-issue-anchored.test.ts` — **insrc-build** (2026-11-24T13:03:44.021Z)
- `src/workflow/__tests__/chain-issue-tracker.test.ts` — **insrc-build** (2026-11-24T13:03:44.021Z)
- `src/workflow/chain.ts` — **insrc-build** (2026-11-24T13:03:44.021Z)
- `src/workflow/tracker/__tests__/pending-create-claim.test.ts` — **insrc-build** (2026-11-24T13:03:44.021Z)
- `src/workflow/tracker/pending-create-claim.ts` — **insrc-build** (2026-11-24T13:03:44.021Z)
- `src/workflow/artifacts/issue.ts` — **insrc-build** (2026-11-24T13:03:44.021Z)
- `src/workflow/tracker/__tests__/link-issue-docs.test.ts` — **insrc-build** (2026-11-24T13:03:44.021Z)
- `src/workflow/__tests__/issue-anchored-route.test.ts` — **insrc-build** (2026-11-24T13:03:44.021Z)
- `docs/standalone/make-tracker-push-sync-post-stages-E202611165f9d4ab4/S001/t8-sweep-evidence.txt` — **insrc-build** (2026-11-24T13:03:44.021Z)
