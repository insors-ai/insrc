<!-- insrc:artifact BUILD-1485159578d9c257-S001 -->

# Build (standalone small) — Story S001

**Size class:** small  ·  **Standalone:** yes  ·  **Created:** 2026-10-16T07:07:06.830Z  ·  **Updated:** 2026-10-16T07:15:28.323Z

**Commit:** 06ab246e

## Summary

Added SMALLEST_CHANGE_RULE (the build ladder, with the insrc analyzer for the 'already in the codebase' rung and insrc's limits: the Task or LLD is the spec, named tests stay required, validation, error handling, security and accessibility are never cut) and SMALLEST_SHAPE_RULE (the design counterpart) to scope-prompts.ts, with a Ponytail (MIT) credit comment. The build rule is a new 'The smallest complete change' section in the implement template (via a smallestChangeRule placeholder) and in renderStandaloneImplementPrompt; the design rule is in the alternatives.enumerate prompt before ANTI_OVERREACH_RULE. THIRD_PARTY_NOTICES.md at the repository root credits Ponytail with its link and its MIT licence text copied from upstream. Tests extend the render and adjacent-scope tests and add a notice test.

## Tasks validated

- ✓ `S001`

**Tests:** [TESTS.md](TESTS.md) — what the gate ran for each Task, and what each test case did.

## Changes

- `THIRD_PARTY_NOTICES.md` — **insrc-build** (2026-10-16T07:15:28.323Z)
- `src/daemon/steps/build-step/__tests__/render.test.ts` — **insrc-build** (2026-10-16T07:15:28.323Z)
- `src/daemon/steps/build-step/render.ts` — **insrc-build** (2026-10-16T07:15:28.323Z)
- `src/prompts/build/implement-task.md` — **insrc-build** (2026-10-16T07:15:28.323Z)
- `src/workflow/__tests__/adjacent-scope-gate.test.ts` — **insrc-build** (2026-10-16T07:15:28.323Z)
- `src/workflow/__tests__/third-party-notice.test.ts` — **insrc-build** (2026-10-16T07:15:28.323Z)
- `src/workflow/runners/design-story/index.ts` — **insrc-build** (2026-10-16T07:15:28.323Z)
- `src/workflow/runners/scope-prompts.ts` — **insrc-build** (2026-10-16T07:15:28.323Z)
