<!-- insrc:artifact BUILD-315d510cb28100e2-s5 -->

# Build (plan-driven) — Story s5

**Standalone:** no  ·  **Created:** 2026-10-18T14:16:36.004Z  ·  **Updated:** 2026-10-18T14:32:06.718Z

**Commit:** cf59ff21

## Summary

In gate.ts: CompletionHook and registerCompletionHook; consultHook is called after the tracker is loaded and before the holder is read for author, build, open-signoff, revise and release (a returned outcome is the answer, 'continue' lets the gate decide, none registered continues, a throw of any value refuses with 'the completion hook failed: ...'); a module-level insideHook flag makes a gate call made by the hook itself (its release) skip the hook, and it is reset in a finally. A stage with no recorded issue now tries ensureUnitIssue (seam: ensureIssue) with the loaded port: if it creates or finds one the gate then decides on the live assignee; if not it returns no-issue with creationFailure, and allowFirstAuthor is true only for action author when the unit's own artifact (Define, LLD or plan) does not exist yet (seam: artifactExists), false for every other action. Three new tests in gate.test.ts carry the named tests; the earlier t2 test's missing-issue assertion now expects no-issue.

## Tasks validated

- ✓ `t1`
- ✓ `t2`
- ✓ `t3`

**Tests:** [TESTS.md](TESTS.md) — what the gate ran for each Task, and what each test case did.

## Changes

- `.insrc/artifacts/AMD-315d510cb28100e2-12.json` — **insrc-build** (2026-10-18T14:32:06.718Z)
- `.insrc/artifacts/PLAN-315d510cb28100e2-s5.json` — **insrc-build** (2026-10-18T14:32:06.718Z)
- `docs/epics/team-signoff-claim-based-workflow-E20261016315d510c/S005/PLAN.md` — **insrc-build** (2026-10-18T14:32:06.718Z)
- `src/workflow/team/__tests__/gate.test.ts` — **insrc-build** (2026-10-18T14:32:06.718Z)
- `src/workflow/team/gate.ts` — **insrc-build** (2026-10-18T14:32:06.718Z)
- `src/workflow/tracker/__tests__/github-adapter.test.ts` — **insrc-build** (2026-10-18T14:32:06.718Z)
- `src/workflow/tracker/github-adapter.ts` — **insrc-build** (2026-10-18T14:32:06.718Z)
- `src/workflow/tracker/port.ts` — **insrc-build** (2026-10-18T14:32:06.718Z)
