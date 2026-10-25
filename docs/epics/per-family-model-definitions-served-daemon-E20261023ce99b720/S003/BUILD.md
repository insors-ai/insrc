<!-- insrc:artifact BUILD-ce99b72065d03b1b-s3 -->

# Build (plan-driven) — Story s3

**Standalone:** no  ·  **Created:** 2026-10-25T19:57:09.103Z  ·  **Updated:** 2026-10-25T20:16:58.847Z

**Commit:** 1658a515d

## Summary

loadAnalyzeConfig/resolveTier resolve each global tier through an injectable registry (default getModelRegistry()): an unset or '' tier takes the default family's tier default with its effort, aliases become canonical ids, an unaccepted effort is dropped and a rejected or unlisted model falls back (decision A), each logged with a warning; AnalyzeConfig.tierResolutions keeps each tier's resolution. TierEffort is EffortLevel, runners are FamilyId, per-repo entries keep only tasks and coreFloor. A '' model stays an unset tier (as before), so shaperProviderExplicit keeps its client auto-pick behaviour for configs whose core model is ''.

## Tasks validated

- ✓ `t1`
- ✓ `t2`
- ✓ `t3`

**Tests:** [TESTS.md](TESTS.md) — what the gate ran for each Task, and what each test case did.

## Changes

- `package.json` — **insrc-build** (2026-10-25T20:16:58.847Z)
- `scripts/check-model-definitions.mjs` — **insrc-build** (2026-10-25T20:16:58.847Z)
- `src/assets/models/cloud-model-catalog.json` — **insrc-build** (2026-10-25T20:16:58.847Z)
- `src/cli/__tests__/model-tiers.test.ts` — **insrc-build** (2026-10-25T20:16:58.847Z)
- `src/config/__tests__/analyze-tiering.test.ts` — **insrc-build** (2026-10-25T20:16:58.847Z)
- `src/config/__tests__/check-model-definitions.test.ts` — **insrc-build** (2026-10-25T20:16:58.847Z)
- `src/config/__tests__/config-catalog-contract.test.ts` — **insrc-build** (2026-10-25T20:16:58.847Z)
- `src/config/__tests__/config-catalog-defs.test.ts` — **insrc-build** (2026-10-25T20:16:58.847Z)
- `src/config/__tests__/fixtures/legacy-config.baseline.json` — **insrc-build** (2026-10-25T20:16:58.847Z)
- `src/config/analyze.ts` — **insrc-build** (2026-10-25T20:16:58.847Z)
- `src/config/config-catalog.ts` — **insrc-build** (2026-10-25T20:16:58.847Z)
- `src/config/local.ts` — **insrc-build** (2026-10-25T20:16:58.847Z)
- `src/config/model-defaults.ts` — **insrc-build** (2026-10-25T20:16:58.847Z)
- `src/daemon/__tests__/model-catalog-asset.test.ts` — **insrc-build** (2026-10-25T20:16:58.847Z)
- `tsconfig.json` — **insrc-build** (2026-10-25T20:16:58.847Z)
- `vscode-plugin/tsconfig.json` — **insrc-build** (2026-10-25T20:16:58.847Z)
- `src/config/__tests__/config-reconcile.test.ts` — **insrc-build** (2026-10-25T20:16:58.847Z)
- `src/config/__tests__/reconcile-defs.test.ts` — **insrc-build** (2026-10-25T20:16:58.847Z)
- `src/config/__tests__/settings-cache-reset.test.ts` — **insrc-build** (2026-10-25T20:16:58.847Z)
- `src/config/reconcile.ts` — **insrc-build** (2026-10-25T20:16:58.847Z)
- `src/daemon/__tests__/boot-cold-import.test.ts` — **insrc-build** (2026-10-25T20:16:58.847Z)
- `src/daemon/__tests__/config-boot-reconcile.test.ts` — **insrc-build** (2026-10-25T20:16:58.847Z)
- `src/daemon/index.ts` — **insrc-build** (2026-10-25T20:16:58.847Z)
- `src/daemon/lifecycle.ts` — **insrc-build** (2026-10-25T20:16:58.847Z)
- `src/indexer/__tests__/embedder-keepalive.test.ts` — **insrc-build** (2026-10-25T20:16:58.847Z)
- `src/indexer/__tests__/embedder-lazy.test.ts` — **insrc-build** (2026-10-25T20:16:58.847Z)
- `src/indexer/embedder.ts` — **insrc-build** (2026-10-25T20:16:58.847Z)
- `src/indexer/index.ts` — **insrc-build** (2026-10-25T20:16:58.847Z)
- `src/analyze/context/__tests__/tier-effort-routing.test.ts` — **insrc-build** (2026-10-25T20:16:58.847Z)
- `src/cli/__tests__/tui.test.ts` — **insrc-build** (2026-10-25T20:16:58.847Z)
- `src/config/__tests__/tier-defaults.test.ts` — **insrc-build** (2026-10-25T20:16:58.847Z)
- `src/config/__tests__/tier-resolution.test.ts` — **insrc-build** (2026-10-25T20:16:58.847Z)
- `src/daemon/db/__tests__/fixtures/session-source-inventory.json` — **insrc-build** (2026-10-25T20:16:58.847Z)
