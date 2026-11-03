<!-- insrc:artifact BUILD-a84e610b0a910d49-s1 -->

# Build (standalone) — Story s1

**Standalone:** yes  ·  **Created:** 2026-11-03T09:17:31.517Z  ·  **Updated:** 2026-11-03T09:43:33.478Z

**Commit:** c2b737bf9

## Summary

Added derived-completion.test.ts and the sweep record docs/standalone/make-code-review-s-documents-review-E20261103a84e610b/S001/SWEEP.md. The record lists the foreground runs by area and the failing titles compared with a clean checkout of the commit before this Story: task-review 115/115; the three daemon code-review files, 17 workflow-gate tests and 22 MCP tests that fail do so identically on the base (the base fails one more MCP test); no new failure.

## Tasks validated

- ✓ `t1`
- ✓ `t2`
- ✓ `t3`
- ✓ `t4`
- ✓ `t5`
- ✓ `t6`

**Tests:** [TESTS.md](TESTS.md) — what the gate ran for each Task, and what each test case did.

## Changes

- `src/daemon/task-review-rpc.ts` — **insrc-build** (2026-11-03T09:43:33.478Z)
- `src/workflow/code-review/task-review/__tests__/packet-documents.test.ts` — **insrc-build** (2026-11-03T09:43:33.478Z)
- `src/workflow/code-review/task-review/contracts.ts` — **insrc-build** (2026-11-03T09:43:33.478Z)
- `src/workflow/code-review/task-review/packet.ts` — **insrc-build** (2026-11-03T09:43:33.478Z)
- `src/workflow/code-review/task-review/__tests__/route-documents.test.ts` — **insrc-build** (2026-11-03T09:43:33.478Z)
- `src/workflow/code-review/task-review/route.ts` — **insrc-build** (2026-11-03T09:43:33.478Z)
- `src/workflow/code-review/task-review/__tests__/derived-unit.test.ts` — **insrc-build** (2026-11-03T09:43:33.478Z)
- `src/workflow/code-review/task-review/assessment.ts` — **insrc-build** (2026-11-03T09:43:33.478Z)
- `src/daemon/__tests__/task-review-plan-path.test.ts` — **insrc-build** (2026-11-03T09:43:33.478Z)
- `src/workflow/code-review/task-review/__tests__/route-admission.test.ts` — **insrc-build** (2026-11-03T09:43:33.478Z)
- `src/workflow/code-review/task-review/admission.ts` — **insrc-build** (2026-11-03T09:43:33.478Z)
- `src/workflow/code-review/task-review/publication.ts` — **insrc-build** (2026-11-03T09:43:33.478Z)
- `src/workflow/code-review/task-review/route-source.ts` — **insrc-build** (2026-11-03T09:43:33.478Z)
- `src/prompts/steering-block.md` — **insrc-build** (2026-11-03T09:43:33.478Z)
- `src/workflow/code-review/task-review/__tests__/documents-contract.test.ts` — **insrc-build** (2026-11-03T09:43:33.478Z)
- `src/workflow/code-review/task-review/__tests__/derived-completion.test.ts` — **insrc-build** (2026-11-03T09:43:33.478Z)
- `docs/standalone/make-code-review-s-documents-review-E20261103a84e610b/S001/SWEEP.md` — **insrc-build** (2026-11-03T09:43:33.478Z)
