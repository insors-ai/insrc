<!-- insrc:artifact BUILD-787434000fa22691-s1 -->

# Build (standalone) — Story s1

**Standalone:** yes  ·  **Created:** 2026-11-19T18:39:05.994Z  ·  **Updated:** 2026-11-20T05:48:04.883Z

**Commit:** 3acdac40a

## Summary

The build commands are per registered repository (rows of the repo settings table, group Build), not global catalog rows; the config.catalog payload carries them as repoFields, which the catalog contract test now checks.

## Tasks validated

- ✓ `t1`
- ✓ `t2`
- ✓ `t3`
- ✓ `t4`
- ✓ `t5`
- ✓ `t6`
- ✓ `t7`

**Tests:** [TESTS.md](TESTS.md) — what the gate ran for each Task, and what each test case did.

## Changes

- `src/daemon/steps/build-step/__tests__/validation-checks.test.ts` — **insrc-build** (2026-11-20T05:48:04.883Z)
- `src/daemon/steps/build-step/validation-checks.ts` — **insrc-build** (2026-11-20T05:48:04.883Z)
- `src/daemon/steps/build-step/__tests__/build-step.test.ts` — **insrc-build** (2026-11-20T05:48:04.883Z)
- `src/daemon/steps/build-step/__tests__/validation-checks-registry.test.ts` — **insrc-build** (2026-11-20T05:48:04.883Z)
- `src/workflow/runners/build/__tests__/test-record.test.ts` — **insrc-build** (2026-11-20T05:48:04.883Z)
- `src/workflow/runners/build/test-record.ts` — **insrc-build** (2026-11-20T05:48:04.883Z)
- `src/daemon/steps/build-step/__tests__/render.test.ts` — **insrc-build** (2026-11-20T05:48:04.883Z)
- `src/daemon/steps/build-step/phases/implement.ts` — **insrc-build** (2026-11-20T05:48:04.883Z)
- `src/daemon/steps/build-step/phases/validate.ts` — **insrc-build** (2026-11-20T05:48:04.883Z)
- `src/daemon/steps/build-step/render.ts` — **insrc-build** (2026-11-20T05:48:04.883Z)
- `src/prompts/build/implement-task.md` — **insrc-build** (2026-11-20T05:48:04.883Z)
- `src/prompts/build/validate-task.md` — **insrc-build** (2026-11-20T05:48:04.883Z)
- `src/daemon/steps/build-step/__tests__/validate-task-round.test.ts` — **insrc-build** (2026-11-20T05:48:04.883Z)
- `src/daemon/steps/build-step/command-setting.ts` — **insrc-build** (2026-11-20T05:48:04.883Z)
- `docs/daemon.md` — **insrc-build** (2026-11-20T05:48:04.883Z)
- `src/config/config-catalog.ts` — **insrc-build** (2026-11-20T05:48:04.883Z)
- `src/daemon/steps/build-step/__tests__/command-setting.test.ts` — **insrc-build** (2026-11-20T05:48:04.883Z)
- `src/config/__tests__/config-catalog-contract.test.ts` — **insrc-build** (2026-11-20T05:48:04.883Z)
- `src/daemon/steps/build-step/__tests__/test-mapping.test.ts` — **insrc-build** (2026-11-20T05:48:04.883Z)
- `src/daemon/steps/build-step/test-mapping.ts` — **insrc-build** (2026-11-20T05:48:04.883Z)
- `src/cli/__tests__/settings-modal.test.ts` — **insrc-build** (2026-11-20T05:48:04.883Z)
- `src/config/__tests__/fixtures/repo-fields-catalog.json` — **insrc-build** (2026-11-20T05:48:04.883Z)
- `src/config/__tests__/repo-fields.test.ts` — **insrc-build** (2026-11-20T05:48:04.883Z)
- `src/config/repo-fields.ts` — **insrc-build** (2026-11-20T05:48:04.883Z)
- `src/workflow/config/github.ts` — **insrc-build** (2026-11-20T05:48:04.883Z)
- `vscode-plugin/src/panels/repo-config.ts` — **insrc-build** (2026-11-20T05:48:04.883Z)
