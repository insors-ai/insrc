<!-- insrc:artifact BUILD-315d510cb28100e2-s2 -->

# Build (plan-driven) — Story s2

**Standalone:** no  ·  **Created:** 2026-10-17T06:22:44.508Z  ·  **Updated:** 2026-10-17T07:07:34.262Z

**Commit:** 9fdc7452

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

- `.insrc/artifacts/PLAN-315d510cb28100e2-s2.json` — **insrc-build** (2026-10-17T07:07:34.262Z)
