<!-- insrc:artifact BUILD-a84e610b0a910d49-s1 -->

# Build (standalone) — Story s1

**Standalone:** yes  ·  **Created:** 2026-11-03T09:17:31.517Z  ·  **Updated:** 2026-11-03T10:35:11.596Z

**Commit:** b1e1d3f03

## Summary

Closed the one gap the daemon code review raised on t4 (attempt 2, MED): route-admission.test.ts now also admits a Story with only a BUILD through the real readStoryRoute and admission (the no-document route, check = BUILD focus), and requires the story role for a Story whose epic has a DEF (admitted with story, lld and plan; refused without story; refused with a story for a Story with no DEF). route-source.ts and the rest are unchanged; breaking the DEF detection makes the test fail. Otherwise as before: admission builds the route from the Story's stored artifacts and keeps the derived epic and unit in header.derived; startTaskReview runs the plan-path identity check only when the packet carries a plan document.

## Tasks validated

- ✓ `t1`
- ✓ `t2`
- ✓ `t3`
- ✓ `t4`
- ✓ `t5`
- ✓ `t6`

**Tests:** [TESTS.md](TESTS.md) — what the gate ran for each Task, and what each test case did.

## Changes

- `src/daemon/task-review-rpc.ts` — **insrc-build** (2026-11-03T10:35:11.596Z)
- `src/workflow/code-review/task-review/__tests__/packet-documents.test.ts` — **insrc-build** (2026-11-03T10:35:11.596Z)
- `src/workflow/code-review/task-review/contracts.ts` — **insrc-build** (2026-11-03T10:35:11.596Z)
- `src/workflow/code-review/task-review/packet.ts` — **insrc-build** (2026-11-03T10:35:11.596Z)
- `src/workflow/code-review/task-review/__tests__/route-documents.test.ts` — **insrc-build** (2026-11-03T10:35:11.596Z)
- `src/workflow/code-review/task-review/route.ts` — **insrc-build** (2026-11-03T10:35:11.596Z)
- `src/workflow/code-review/task-review/__tests__/derived-unit.test.ts` — **insrc-build** (2026-11-03T10:35:11.596Z)
- `src/workflow/code-review/task-review/assessment.ts` — **insrc-build** (2026-11-03T10:35:11.596Z)
- `src/daemon/__tests__/task-review-plan-path.test.ts` — **insrc-build** (2026-11-03T10:35:11.596Z)
- `src/workflow/code-review/task-review/__tests__/route-admission.test.ts` — **insrc-build** (2026-11-03T10:35:11.596Z)
- `src/workflow/code-review/task-review/admission.ts` — **insrc-build** (2026-11-03T10:35:11.596Z)
- `src/workflow/code-review/task-review/publication.ts` — **insrc-build** (2026-11-03T10:35:11.596Z)
- `src/workflow/code-review/task-review/route-source.ts` — **insrc-build** (2026-11-03T10:35:11.596Z)
- `src/prompts/steering-block.md` — **insrc-build** (2026-11-03T10:35:11.596Z)
- `src/workflow/code-review/task-review/__tests__/documents-contract.test.ts` — **insrc-build** (2026-11-03T10:35:11.596Z)
- `src/workflow/code-review/task-review/__tests__/derived-completion.test.ts` — **insrc-build** (2026-11-03T10:35:11.596Z)
- `docs/standalone/make-code-review-s-documents-review-E20261103a84e610b/S001/SWEEP.md` — **insrc-build** (2026-11-03T10:35:11.596Z)
- `.insrc/artifacts/ISSUE-a84e610b0a910d49.json` — **insrc-build** (2026-11-03T10:35:11.596Z)
- `.insrc/artifacts/ISSUE-a84e610b0a910d49.log.jsonl` — **insrc-build** (2026-11-03T10:35:11.596Z)
- `.insrc/artifacts/LLD-a84e610b0a910d49-s1.json` — **insrc-build** (2026-11-03T10:35:11.596Z)
- `.insrc/artifacts/LLD-a84e610b0a910d49-s1.log.jsonl` — **insrc-build** (2026-11-03T10:35:11.596Z)
- `.insrc/artifacts/PLAN-a84e610b0a910d49-s1.json` — **insrc-build** (2026-11-03T10:35:11.596Z)
- `.insrc/artifacts/PLAN-a84e610b0a910d49-s1.log.jsonl` — **insrc-build** (2026-11-03T10:35:11.596Z)
- `.insrc/artifacts/TASK-a84e610b0a910d49-s1-t1.json` — **insrc-build** (2026-11-03T10:35:11.596Z)
- `.insrc/artifacts/TASK-a84e610b0a910d49-s1-t2.json` — **insrc-build** (2026-11-03T10:35:11.596Z)
- `.insrc/artifacts/TASK-a84e610b0a910d49-s1-t3.json` — **insrc-build** (2026-11-03T10:35:11.596Z)
- `.insrc/artifacts/TASK-a84e610b0a910d49-s1-t4.json` — **insrc-build** (2026-11-03T10:35:11.596Z)
- `.insrc/artifacts/TASK-a84e610b0a910d49-s1-t5.json` — **insrc-build** (2026-11-03T10:35:11.596Z)
- `.insrc/artifacts/TASK-a84e610b0a910d49-s1-t6.json` — **insrc-build** (2026-11-03T10:35:11.596Z)
- `.insrc/artifacts/TASKS-a84e610b0a910d49-s1.json` — **insrc-build** (2026-11-03T10:35:11.596Z)
- `.insrc/artifacts/TASKS-a84e610b0a910d49-s1.log.jsonl` — **insrc-build** (2026-11-03T10:35:11.596Z)
- `docs/standalone/make-code-review-s-documents-review-E20261103a84e610b/ISSUE.md` — **insrc-build** (2026-11-03T10:35:11.596Z)
- `docs/standalone/make-code-review-s-documents-review-E20261103a84e610b/S001/PLAN.md` — **insrc-build** (2026-11-03T10:35:11.596Z)
- `docs/standalone/make-code-review-s-documents-review-E20261103a84e610b/S001/SELF-REVIEW.md` — **insrc-build** (2026-11-03T10:35:11.596Z)
