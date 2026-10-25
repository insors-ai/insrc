<!-- insrc:artifact BUILD-ce99b72065d03b1b-s3 -->

# Build (plan-driven) — Story s3

**Standalone:** no  ·  **Created:** 2026-10-25T19:57:09.103Z  ·  **Updated:** 2026-10-25T20:25:26.517Z

**Commit:** 0fc29d4df

## Summary

The role router takes a role's tier from byRepo/global tasks with the core-floor clamp and its runner, model and effort only from the registry-resolved global tier (no byRepo.tiers layer, no DEFAULT_TIERS fallback); RoleResolution keeps its fields and gains fallback; RoleRouterDeps.registry is passed to buildShaperProvider/buildSummariserProvider (consumed in t5). readRepoOverride, resolveRepoShaperProvider, resolveRepoShaperModel and the repoOverride signal are removed with their callers in code-review-rpc.ts and workflow-rpc.ts, and their test file.

## Tasks validated

- ✓ `t1`
- ✓ `t2`
- ✓ `t3`
- ✓ `t4`

**Tests:** [TESTS.md](TESTS.md) — what the gate ran for each Task, and what each test case did.

## Changes

- `package.json` — **insrc-build** (2026-10-25T20:25:26.517Z)
- `scripts/check-model-definitions.mjs` — **insrc-build** (2026-10-25T20:25:26.517Z)
- `src/assets/models/cloud-model-catalog.json` — **insrc-build** (2026-10-25T20:25:26.517Z)
- `src/cli/__tests__/model-tiers.test.ts` — **insrc-build** (2026-10-25T20:25:26.517Z)
- `src/config/__tests__/analyze-tiering.test.ts` — **insrc-build** (2026-10-25T20:25:26.517Z)
- `src/config/__tests__/check-model-definitions.test.ts` — **insrc-build** (2026-10-25T20:25:26.517Z)
- `src/config/__tests__/config-catalog-contract.test.ts` — **insrc-build** (2026-10-25T20:25:26.517Z)
- `src/config/__tests__/config-catalog-defs.test.ts` — **insrc-build** (2026-10-25T20:25:26.517Z)
- `src/config/__tests__/fixtures/legacy-config.baseline.json` — **insrc-build** (2026-10-25T20:25:26.517Z)
- `src/config/analyze.ts` — **insrc-build** (2026-10-25T20:25:26.517Z)
- `src/config/config-catalog.ts` — **insrc-build** (2026-10-25T20:25:26.517Z)
- `src/config/local.ts` — **insrc-build** (2026-10-25T20:25:26.517Z)
- `src/config/model-defaults.ts` — **insrc-build** (2026-10-25T20:25:26.517Z)
- `src/daemon/__tests__/model-catalog-asset.test.ts` — **insrc-build** (2026-10-25T20:25:26.517Z)
- `tsconfig.json` — **insrc-build** (2026-10-25T20:25:26.517Z)
- `vscode-plugin/tsconfig.json` — **insrc-build** (2026-10-25T20:25:26.517Z)
- `src/config/__tests__/config-reconcile.test.ts` — **insrc-build** (2026-10-25T20:25:26.517Z)
- `src/config/__tests__/reconcile-defs.test.ts` — **insrc-build** (2026-10-25T20:25:26.517Z)
- `src/config/__tests__/settings-cache-reset.test.ts` — **insrc-build** (2026-10-25T20:25:26.517Z)
- `src/config/reconcile.ts` — **insrc-build** (2026-10-25T20:25:26.517Z)
- `src/daemon/__tests__/boot-cold-import.test.ts` — **insrc-build** (2026-10-25T20:25:26.517Z)
- `src/daemon/__tests__/config-boot-reconcile.test.ts` — **insrc-build** (2026-10-25T20:25:26.517Z)
- `src/daemon/index.ts` — **insrc-build** (2026-10-25T20:25:26.517Z)
- `src/daemon/lifecycle.ts` — **insrc-build** (2026-10-25T20:25:26.517Z)
- `src/indexer/__tests__/embedder-keepalive.test.ts` — **insrc-build** (2026-10-25T20:25:26.517Z)
- `src/indexer/__tests__/embedder-lazy.test.ts` — **insrc-build** (2026-10-25T20:25:26.517Z)
- `src/indexer/embedder.ts` — **insrc-build** (2026-10-25T20:25:26.517Z)
- `src/indexer/index.ts` — **insrc-build** (2026-10-25T20:25:26.517Z)
- `src/analyze/context/__tests__/tier-effort-routing.test.ts` — **insrc-build** (2026-10-25T20:25:26.517Z)
- `src/cli/__tests__/tui.test.ts` — **insrc-build** (2026-10-25T20:25:26.517Z)
- `src/config/__tests__/tier-defaults.test.ts` — **insrc-build** (2026-10-25T20:25:26.517Z)
- `src/config/__tests__/tier-resolution.test.ts` — **insrc-build** (2026-10-25T20:25:26.517Z)
- `src/daemon/db/__tests__/fixtures/session-source-inventory.json` — **insrc-build** (2026-10-25T20:25:26.517Z)
- `src/analyze/context/__tests__/provider-bypass-audit.test.ts` — **insrc-build** (2026-10-25T20:25:26.517Z)
- `src/analyze/context/__tests__/role-router-global-tiers.test.ts` — **insrc-build** (2026-10-25T20:25:26.517Z)
- `src/analyze/context/__tests__/role-router.test.ts` — **insrc-build** (2026-10-25T20:25:26.517Z)
- `src/analyze/context/__tests__/shaper-provider.test.ts` — **insrc-build** (2026-10-25T20:25:26.517Z)
- `src/analyze/context/role-router.ts` — **insrc-build** (2026-10-25T20:25:26.517Z)
- `src/analyze/context/shaper-provider.ts` — **insrc-build** (2026-10-25T20:25:26.517Z)
- `src/config/__tests__/fixtures/PROVENANCE.md` — **insrc-build** (2026-10-25T20:25:26.517Z)
- `src/config/__tests__/repo-shaper-override.test.ts` — **insrc-build** (2026-10-25T20:25:26.517Z)
- `src/daemon/code-review-rpc.ts` — **insrc-build** (2026-10-25T20:25:26.517Z)
- `src/daemon/workflow-rpc.ts` — **insrc-build** (2026-10-25T20:25:26.517Z)
