<!-- insrc:artifact BUILD-315d510cb28100e2-s5 -->

# Build (plan-driven) — Story s5

**Standalone:** no  ·  **Created:** 2026-10-18T14:16:36.004Z  ·  **Updated:** 2026-10-18T14:16:36.004Z

**Commit:** 0bf2fab3

## Summary

Added addAssignee(issue, who): PortResult<string[]> to TrackerPort (port.ts) and implemented it in the GitHub adapter beside setAssignee: it reads the assignees, makes a single gh issue edit --add-assignee call only when who is not already assigned (case-insensitive), re-reads, returns the assignees read back, and reports a re-read without who as rejected; a failed or timed-out step is a classified PortResult failure with no retry and no re-read. It never removes anyone. setAssignee is untouched. The method is the additive sc1 amendment AMD-315d510cb28100e2-12, still pending with s1. One test in github-adapter.test.ts covers adding from none and beside another assignee (no remove call), the already-assigned case, a sticky add (rejected), a timeout (unreachable, no retry, no re-read) and a malformed reference (no gh call).

## Tasks validated

- ✗ `t1`

**Tests:** [TESTS.md](TESTS.md) — what the gate ran for each Task, and what each test case did.

## Changes

- `.insrc/artifacts/PLAN-315d510cb28100e2-s5.json` — **insrc-build** (2026-10-18T14:16:36.004Z)
- `docs/epics/team-signoff-claim-based-workflow-E20261016315d510c/S005/PLAN.md` — **insrc-build** (2026-10-18T14:16:36.004Z)
- `src/workflow/tracker/__tests__/github-adapter.test.ts` — **insrc-build** (2026-10-18T14:16:36.004Z)
- `src/workflow/tracker/github-adapter.ts` — **insrc-build** (2026-10-18T14:16:36.004Z)
- `src/workflow/tracker/port.ts` — **insrc-build** (2026-10-18T14:16:36.004Z)
