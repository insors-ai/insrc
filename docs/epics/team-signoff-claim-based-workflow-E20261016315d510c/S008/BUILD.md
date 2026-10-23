<!-- insrc:artifact BUILD-315d510cb28100e2-s8 -->

# Build (plan-driven) — Story s8

**Standalone:** no  ·  **Created:** 2026-10-23T04:21:33.718Z  ·  **Updated:** 2026-10-23T06:17:21.891Z

**Commit:** fc52f990

## Summary

Nine tasks: the lifecycle step open-signoff from changes-requested, the port reads readSignoffRequest and readSignoffState(since) with the GitHub implementation, the content write keeping the Signoff history, submission prerequisites on the current review, finding and resubmitting to the earlier request, settle passing the last submission time as since, the revise gate on the design.epic and design.story runs, and the end-to-end test with a smoke test on a sandbox repo.

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

**Tests:** [TESTS.md](TESTS.md) — what the gate ran for each Task, and what each test case did.

## Changes

- `src/workflow/artifact-core/__tests__/lifecycle-resignoff.test.ts` — **insrc-build** (2026-10-23T06:17:21.891Z)
- `src/workflow/artifact-core/lifecycle.ts` — **insrc-build** (2026-10-23T06:17:21.891Z)
- `src/workflow/tracker/__tests__/github-signoff-revise.test.ts` — **insrc-build** (2026-10-23T06:17:21.891Z)
- `src/workflow/tracker/github-adapter.ts` — **insrc-build** (2026-10-23T06:17:21.891Z)
- `src/workflow/tracker/port.ts` — **insrc-build** (2026-10-23T06:17:21.891Z)
- `src/workflow/__tests__/storage-signoff-history.test.ts` — **insrc-build** (2026-10-23T06:17:21.891Z)
- `src/workflow/storage.ts` — **insrc-build** (2026-10-23T06:17:21.891Z)
- `src/workflow/team/__tests__/signoff-revise.test.ts` — **insrc-build** (2026-10-23T06:17:21.891Z)
- `src/workflow/team/signoff.ts` — **insrc-build** (2026-10-23T06:17:21.891Z)
- `src/workflow/team/__tests__/author-gate-revise.test.ts` — **insrc-build** (2026-10-23T06:17:21.891Z)
- `src/workflow/team/author-gate.ts` — **insrc-build** (2026-10-23T06:17:21.891Z)
- `src/workflow/team/__tests__/signoff-revise-e2e.test.ts` — **insrc-build** (2026-10-23T06:17:21.891Z)
