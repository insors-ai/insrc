<!-- insrc:artifact BUILD-a27df0280289e6c6-S001 -->

# Build (standalone) — Story S001

**Standalone:** yes  ·  **Created:** 2026-10-23T06:20:58.215Z  ·  **Updated:** 2026-10-23T07:00:48.894Z

**Commit:** 3c7e94e1

## Summary

Live checks show both CLIs honour the effort flag; the full sweep passed (the one contention failure passes with the live daemon stopped); the config sets core high and mid medium and the one updated daemon (108a8579) runs with it.

## Tasks validated

- ✓ `t1`
- ✓ `t2`
- ✓ `t3`
- ✓ `t4`
- ✓ `t5`
- ✓ `t6`
- ✓ `t7`
- ✗ `t8`

**Tests:** [TESTS.md](TESTS.md) — what the gate ran for each Task, and what each test case did.

## Changes

- `src/config/__tests__/analyze-tiering.test.ts` — **insrc-build** (2026-10-23T07:00:48.894Z)
- `src/config/__tests__/tier-defaults.test.ts` — **insrc-build** (2026-10-23T07:00:48.894Z)
- `src/config/analyze.ts` — **insrc-build** (2026-10-23T07:00:48.894Z)
- `src/config/__tests__/config-catalog-contract.test.ts` — **insrc-build** (2026-10-23T07:00:48.894Z)
- `src/config/__tests__/fixtures/legacy-config.baseline.json` — **insrc-build** (2026-10-23T07:00:48.894Z)
- `src/config/config-catalog.ts` — **insrc-build** (2026-10-23T07:00:48.894Z)
- `src/agent/providers/__tests__/cli-review-session.test.ts` — **insrc-build** (2026-10-23T07:00:48.894Z)
- `src/agent/providers/cli-provider.ts` — **insrc-build** (2026-10-23T07:00:48.894Z)
- `src/analyze/context/__tests__/tier-effort-routing.test.ts` — **insrc-build** (2026-10-23T07:00:48.894Z)
- `src/analyze/context/role-router.ts` — **insrc-build** (2026-10-23T07:00:48.894Z)
- `src/analyze/context/shaper-provider.ts` — **insrc-build** (2026-10-23T07:00:48.894Z)
- `src/daemon/steps/build-step/phases/validate.ts` — **insrc-build** (2026-10-23T07:00:48.894Z)
- `src/cli/__tests__/model-tiers.test.ts` — **insrc-build** (2026-10-23T07:00:48.894Z)
- `src/cli/__tests__/tui.test.ts` — **insrc-build** (2026-10-23T07:00:48.894Z)
- `src/cli/panes/ModelTiersPane.tsx` — **insrc-build** (2026-10-23T07:00:48.894Z)
- `src/cli/panes/model-tiers.ts` — **insrc-build** (2026-10-23T07:00:48.894Z)
- `vscode-plugin/package.json` — **insrc-build** (2026-10-23T07:00:48.894Z)
- `vscode-plugin/src/models/__tests__/tier-effort.test.ts` — **insrc-build** (2026-10-23T07:00:48.894Z)
- `vscode-plugin/src/models/model-tier-picker.ts` — **insrc-build** (2026-10-23T07:00:48.894Z)
- `docs/standalone/add-per-tier-reasoning-effort-setting-E20261023a27df028/S001/evidence/t7-jetbrains-gradle.md` — **insrc-build** (2026-10-23T07:00:48.894Z)
- `jetbrains-plugin/src/main/kotlin/ai/insors/insrc/jetbrains/settings/ModelTiersModel.kt` — **insrc-build** (2026-10-23T07:00:48.894Z)
- `jetbrains-plugin/src/main/kotlin/ai/insors/insrc/jetbrains/settings/ModelTiersSection.kt` — **insrc-build** (2026-10-23T07:00:48.894Z)
- `jetbrains-plugin/src/test/kotlin/ai/insors/insrc/jetbrains/settings/ModelTiersModelTest.kt` — **insrc-build** (2026-10-23T07:00:48.894Z)
- `jetbrains-plugin/__tests__/model-tiers-effort-gradle.test.ts` — **insrc-build** (2026-10-23T07:00:48.894Z)
- `docs/standalone/add-per-tier-reasoning-effort-setting-E20261023a27df028/S001/evidence/t8-live-effort.md` — **insrc-build** (2026-10-23T07:00:48.894Z)
- `src/agent/providers/__tests__/cli-effort.live.test.ts` — **insrc-build** (2026-10-23T07:00:48.894Z)
- `docs/standalone/add-per-tier-reasoning-effort-setting-E20261023a27df028/S001/evidence/t8-full-sweep.md` — **insrc-build** (2026-10-23T07:00:48.894Z)
