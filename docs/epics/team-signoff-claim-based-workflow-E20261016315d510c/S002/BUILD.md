<!-- insrc:artifact BUILD-315d510cb28100e2-s2 -->

# Build (plan-driven) — Story s2

**Standalone:** no  ·  **Created:** 2026-10-17T06:22:44.508Z  ·  **Updated:** 2026-10-17T08:32:20.192Z

**Commit:** ff302377

## Summary

Added the team commands: src/cli/services/team.ts (teamInit and teamRefresh return one result line and throw a plain Error on failure), the team entry in the Services interface and makeServices, two help lines, and the team dispatch case with runTeam in src/cli/command.ts (sub words init and refresh, optional path defaulting to the selected repo, --branch name flag with usage errors for a missing name, a stray argument or --branch on init). Both test facades gained the team entry; command.test.ts covers dispatch, help, --branch pass-through, the rendered refusal asking for it and cross-prefixed errors. An extra end-to-end file (team-service.test.ts, HOME pointed at a scratch dir so the real ~/.insrc is untouched) runs the real commands against real git: team refresh --branch fixes a dangling remote HEAD and the reader then returns the policy; team init writes a starter the reader accepts once on the default branch. Left out: nothing beyond the plan; gates.ts is untouched.

## Tasks validated

- ✓ `t1`
- ✓ `t2`
- ✓ `t3`
- ✓ `t4`
- ✓ `t5`
- ✓ `t6`
- ✓ `t7`
- ✓ `t8`

**Tests:** [TESTS.md](TESTS.md) — what the gate ran for each Task, and what each test case did.

## Changes

- `.insrc/artifacts/CR-315d510cb28100e2-s2.json` — **insrc-build** (2026-10-17T08:32:20.192Z)
- `.insrc/artifacts/LLD-315d510cb28100e2-s2.json` — **insrc-build** (2026-10-17T08:32:20.192Z)
- `.insrc/artifacts/PLAN-315d510cb28100e2-s2.json` — **insrc-build** (2026-10-17T08:32:20.192Z)
- `docs/epics/team-signoff-claim-based-workflow-E20261016315d510c/S002/CR.md` — **insrc-build** (2026-10-17T08:32:20.192Z)
- `docs/epics/team-signoff-claim-based-workflow-E20261016315d510c/S002/PLAN.md` — **insrc-build** (2026-10-17T08:32:20.192Z)
- `src/cli/__tests__/command.test.ts` — **insrc-build** (2026-10-17T08:32:20.192Z)
- `src/cli/__tests__/team-service.test.ts` — **insrc-build** (2026-10-17T08:32:20.192Z)
- `src/cli/__tests__/tui.test.ts` — **insrc-build** (2026-10-17T08:32:20.192Z)
- `src/cli/command.ts` — **insrc-build** (2026-10-17T08:32:20.192Z)
- `src/cli/services/index.ts` — **insrc-build** (2026-10-17T08:32:20.192Z)
- `src/cli/services/team.ts` — **insrc-build** (2026-10-17T08:32:20.192Z)
- `src/shared/paths.ts` — **insrc-build** (2026-10-17T08:32:20.192Z)
- `src/workflow/team/__tests__/anchor-finder.test.ts` — **insrc-build** (2026-10-17T08:32:20.192Z)
- `src/workflow/team/__tests__/branch-resolution.test.ts` — **insrc-build** (2026-10-17T08:32:20.192Z)
- `src/workflow/team/__tests__/git-fixture.ts` — **insrc-build** (2026-10-17T08:32:20.192Z)
- `src/workflow/team/__tests__/policy-parser.test.ts` — **insrc-build** (2026-10-17T08:32:20.192Z)
- `src/workflow/team/__tests__/policy-reader.test.ts` — **insrc-build** (2026-10-17T08:32:20.192Z)
- `src/workflow/team/__tests__/policy-refresh.test.ts` — **insrc-build** (2026-10-17T08:32:20.192Z)
- `src/workflow/team/__tests__/sighting-store.test.ts` — **insrc-build** (2026-10-17T08:32:20.192Z)
- `src/workflow/team/__tests__/starter-policy.test.ts` — **insrc-build** (2026-10-17T08:32:20.192Z)
- `src/workflow/team/anchor-finder.ts` — **insrc-build** (2026-10-17T08:32:20.192Z)
- `src/workflow/team/branch-resolution.ts` — **insrc-build** (2026-10-17T08:32:20.192Z)
- `src/workflow/team/create-only.ts` — **insrc-build** (2026-10-17T08:32:20.192Z)
- `src/workflow/team/git-async.ts` — **insrc-build** (2026-10-17T08:32:20.192Z)
- `src/workflow/team/git.ts` — **insrc-build** (2026-10-17T08:32:20.192Z)
- `src/workflow/team/policy-parser.ts` — **insrc-build** (2026-10-17T08:32:20.192Z)
- `src/workflow/team/policy-reader.ts` — **insrc-build** (2026-10-17T08:32:20.192Z)
- `src/workflow/team/policy-refresh.ts` — **insrc-build** (2026-10-17T08:32:20.192Z)
- `src/workflow/team/sighting-store.ts` — **insrc-build** (2026-10-17T08:32:20.192Z)
- `src/workflow/team/starter-policy.ts` — **insrc-build** (2026-10-17T08:32:20.192Z)
- `src/workflow/team/types.ts` — **insrc-build** (2026-10-17T08:32:20.192Z)
