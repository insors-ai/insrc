<!-- insrc:artifact BUILD-315d510cb28100e2-s1 -->

# Build (plan-driven) — Story s1

**Standalone:** no  ·  **Created:** 2026-10-17T10:31:31.023Z  ·  **Updated:** 2026-10-17T12:13:10.497Z

**Commit:** b14bd83a

## Summary

The named regression test is carried by one case from each affected suite file, so the gate runs each of those files in full: tracker, tasks, setup, port, github-adapter, legacy-exec, tracker-auto, tracker-tasks, bugfix-tracker, questions, config/github and two MCP files. My own full run (npx tsx --test 'src/workflow/**/*.test.ts' 'src/mcp/**/*.test.ts' = 2035 tests, 2032 pass, 0 fail, 3 live-gated skipped; tsc --noEmit clean) and the legacy-exec search output are recorded in docs/epics/team-signoff-claim-based-workflow-E20261016315d510c/S001/T010-REGRESSION.md.

## Tasks validated

- ✓ `t1`
- ✓ `t2`
- ✓ `t3`
- ✓ `t4`
- ✓ `t5`
- ✓ `t6`
- ✓ `t7`
- ✓ `t8`
- ✓ `t9`
- ✗ `t10`

**Tests:** [TESTS.md](TESTS.md) — what the gate ran for each Task, and what each test case did.

## Changes

- `docs/epics/team-signoff-claim-based-workflow-E20261016315d510c/S001/T010-REGRESSION.md` — **insrc-build** (2026-10-17T12:13:10.497Z)
- `src/workflow/__tests__/bugfix-tracker.test.ts` — **insrc-build** (2026-10-17T12:13:10.497Z)
- `src/workflow/__tests__/questions.test.ts` — **insrc-build** (2026-10-17T12:13:10.497Z)
- `src/workflow/__tests__/tracker-auto.test.ts` — **insrc-build** (2026-10-17T12:13:10.497Z)
- `src/workflow/bugfix/tracker.ts` — **insrc-build** (2026-10-17T12:13:10.497Z)
- `src/workflow/config/__tests__/github.test.ts` — **insrc-build** (2026-10-17T12:13:10.497Z)
- `src/workflow/config/github.ts` — **insrc-build** (2026-10-17T12:13:10.497Z)
- `src/workflow/questions.ts` — **insrc-build** (2026-10-17T12:13:10.497Z)
- `src/workflow/tracker-auto.ts` — **insrc-build** (2026-10-17T12:13:10.497Z)
- `src/workflow/tracker/__tests__/fixtures/issue-ops-signatures-broken.ts` — **insrc-build** (2026-10-17T12:13:10.497Z)
- `src/workflow/tracker/__tests__/fixtures/issue-ops-signatures.ts` — **insrc-build** (2026-10-17T12:13:10.497Z)
- `src/workflow/tracker/__tests__/github-adapter.test.ts` — **insrc-build** (2026-10-17T12:13:10.497Z)
- `src/workflow/tracker/__tests__/legacy-exec.test.ts` — **insrc-build** (2026-10-17T12:13:10.497Z)
- `src/workflow/tracker/__tests__/port.test.ts` — **insrc-build** (2026-10-17T12:13:10.497Z)
- `src/workflow/tracker/__tests__/setup.test.ts` — **insrc-build** (2026-10-17T12:13:10.497Z)
- `src/workflow/tracker/__tests__/tasks.test.ts` — **insrc-build** (2026-10-17T12:13:10.497Z)
- `src/workflow/tracker/__tests__/tracker.test.ts` — **insrc-build** (2026-10-17T12:13:10.497Z)
- `src/workflow/tracker/github-adapter.ts` — **insrc-build** (2026-10-17T12:13:10.497Z)
- `src/workflow/tracker/github.ts` — **insrc-build** (2026-10-17T12:13:10.497Z)
- `src/workflow/tracker/port.ts` — **insrc-build** (2026-10-17T12:13:10.497Z)
