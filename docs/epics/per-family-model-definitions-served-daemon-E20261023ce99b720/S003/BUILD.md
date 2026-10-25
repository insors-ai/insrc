<!-- insrc:artifact BUILD-ce99b72065d03b1b-s3 -->

# Build (plan-driven) — Story s3

**Standalone:** no  ·  **Created:** 2026-10-25T19:57:09.103Z  ·  **Updated:** 2026-10-25T21:25:26.276Z

**Commit:** 1abd94451

## Summary

src/cli/shipped-model-registry.ts builds a registry over the shipped definitions and no approved profiles (model-registry.ts exports its pure builder as buildModelRegistry); computeEffectiveTiers and reviewArtifact resolve through it (loadAnalyzeConfig(registry), createRoleRouter({ registry })), so the TUI never reads the user's store. The router now passes its registry to resolveShaperKind as well (found by the new test, which makes getModelRegistry throw). The pane render shows the definitions' tier defaults.

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

- `package.json` — **insrc-build** (2026-10-25T21:25:26.276Z)
- `scripts/check-model-definitions.mjs` — **insrc-build** (2026-10-25T21:25:26.276Z)
- `src/assets/models/cloud-model-catalog.json` — **insrc-build** (2026-10-25T21:25:26.276Z)
- `src/cli/__tests__/model-tiers.test.ts` — **insrc-build** (2026-10-25T21:25:26.276Z)
- `src/config/__tests__/analyze-tiering.test.ts` — **insrc-build** (2026-10-25T21:25:26.276Z)
- `src/config/__tests__/check-model-definitions.test.ts` — **insrc-build** (2026-10-25T21:25:26.276Z)
- `src/config/__tests__/config-catalog-contract.test.ts` — **insrc-build** (2026-10-25T21:25:26.276Z)
- `src/config/__tests__/config-catalog-defs.test.ts` — **insrc-build** (2026-10-25T21:25:26.276Z)
- `src/config/__tests__/fixtures/legacy-config.baseline.json` — **insrc-build** (2026-10-25T21:25:26.276Z)
- `src/config/analyze.ts` — **insrc-build** (2026-10-25T21:25:26.276Z)
- `src/config/config-catalog.ts` — **insrc-build** (2026-10-25T21:25:26.276Z)
- `src/config/local.ts` — **insrc-build** (2026-10-25T21:25:26.276Z)
- `src/config/model-defaults.ts` — **insrc-build** (2026-10-25T21:25:26.276Z)
- `src/daemon/__tests__/model-catalog-asset.test.ts` — **insrc-build** (2026-10-25T21:25:26.276Z)
- `tsconfig.json` — **insrc-build** (2026-10-25T21:25:26.276Z)
- `vscode-plugin/tsconfig.json` — **insrc-build** (2026-10-25T21:25:26.276Z)
- `src/config/__tests__/config-reconcile.test.ts` — **insrc-build** (2026-10-25T21:25:26.276Z)
- `src/config/__tests__/reconcile-defs.test.ts` — **insrc-build** (2026-10-25T21:25:26.276Z)
- `src/config/__tests__/settings-cache-reset.test.ts` — **insrc-build** (2026-10-25T21:25:26.276Z)
- `src/config/reconcile.ts` — **insrc-build** (2026-10-25T21:25:26.276Z)
- `src/daemon/__tests__/boot-cold-import.test.ts` — **insrc-build** (2026-10-25T21:25:26.276Z)
- `src/daemon/__tests__/config-boot-reconcile.test.ts` — **insrc-build** (2026-10-25T21:25:26.276Z)
- `src/daemon/index.ts` — **insrc-build** (2026-10-25T21:25:26.276Z)
- `src/daemon/lifecycle.ts` — **insrc-build** (2026-10-25T21:25:26.276Z)
- `src/indexer/__tests__/embedder-keepalive.test.ts` — **insrc-build** (2026-10-25T21:25:26.276Z)
- `src/indexer/__tests__/embedder-lazy.test.ts` — **insrc-build** (2026-10-25T21:25:26.276Z)
- `src/indexer/embedder.ts` — **insrc-build** (2026-10-25T21:25:26.276Z)
- `src/indexer/index.ts` — **insrc-build** (2026-10-25T21:25:26.276Z)
- `src/analyze/context/__tests__/tier-effort-routing.test.ts` — **insrc-build** (2026-10-25T21:25:26.276Z)
- `src/cli/__tests__/tui.test.ts` — **insrc-build** (2026-10-25T21:25:26.276Z)
- `src/config/__tests__/tier-defaults.test.ts` — **insrc-build** (2026-10-25T21:25:26.276Z)
- `src/config/__tests__/tier-resolution.test.ts` — **insrc-build** (2026-10-25T21:25:26.276Z)
- `src/daemon/db/__tests__/fixtures/session-source-inventory.json` — **insrc-build** (2026-10-25T21:25:26.276Z)
- `src/analyze/context/__tests__/provider-bypass-audit.test.ts` — **insrc-build** (2026-10-25T21:25:26.276Z)
- `src/analyze/context/__tests__/role-router-global-tiers.test.ts` — **insrc-build** (2026-10-25T21:25:26.276Z)
- `src/analyze/context/__tests__/role-router.test.ts` — **insrc-build** (2026-10-25T21:25:26.276Z)
- `src/analyze/context/__tests__/shaper-provider.test.ts` — **insrc-build** (2026-10-25T21:25:26.276Z)
- `src/analyze/context/role-router.ts` — **insrc-build** (2026-10-25T21:25:26.276Z)
- `src/analyze/context/shaper-provider.ts` — **insrc-build** (2026-10-25T21:25:26.276Z)
- `src/config/__tests__/fixtures/PROVENANCE.md` — **insrc-build** (2026-10-25T21:25:26.276Z)
- `src/config/__tests__/repo-shaper-override.test.ts` — **insrc-build** (2026-10-25T21:25:26.276Z)
- `src/daemon/code-review-rpc.ts` — **insrc-build** (2026-10-25T21:25:26.276Z)
- `src/daemon/workflow-rpc.ts` — **insrc-build** (2026-10-25T21:25:26.276Z)
- `src/agent/providers/__tests__/input-budget.test.ts` — **insrc-build** (2026-10-25T21:25:26.276Z)
- `src/agent/providers/cli-provider.ts` — **insrc-build** (2026-10-25T21:25:26.276Z)
- `src/analyze/context/__tests__/provider-from-registry.test.ts` — **insrc-build** (2026-10-25T21:25:26.276Z)
- `src/analyze/context/__tests__/summariser-provider.test.ts` — **insrc-build** (2026-10-25T21:25:26.276Z)
- `src/analyze/context/driver.ts` — **insrc-build** (2026-10-25T21:25:26.276Z)
- `src/daemon/steps/build-step/phases/validate.ts` — **insrc-build** (2026-10-25T21:25:26.276Z)
- `src/daemon/__tests__/claude-models.test.ts` — **insrc-build** (2026-10-25T21:25:26.276Z)
- `src/daemon/__tests__/client-family.test.ts` — **insrc-build** (2026-10-25T21:25:26.276Z)
- `src/daemon/__tests__/list-models.test.ts` — **insrc-build** (2026-10-25T21:25:26.276Z)
- `src/daemon/handler-runtime.ts` — **insrc-build** (2026-10-25T21:25:26.276Z)
- `src/daemon/list-models.ts` — **insrc-build** (2026-10-25T21:25:26.276Z)
- `src/daemon/model-definitions.ts` — **insrc-build** (2026-10-25T21:25:26.276Z)
- `src/daemon/model-registry.ts` — **insrc-build** (2026-10-25T21:25:26.276Z)
- `src/daemon/steps/__tests__/step-context.test.ts` — **insrc-build** (2026-10-25T21:25:26.276Z)
- `src/daemon/steps/analyze-oneshot.ts` — **insrc-build** (2026-10-25T21:25:26.276Z)
- `src/daemon/steps/host.ts` — **insrc-build** (2026-10-25T21:25:26.276Z)
- `src/mcp/server.ts` — **insrc-build** (2026-10-25T21:25:26.276Z)
- `src/shared/step-context.ts` — **insrc-build** (2026-10-25T21:25:26.276Z)
- `src/workflow/__tests__/attribution.test.ts` — **insrc-build** (2026-10-25T21:25:26.276Z)
- `src/workflow/attribution.ts` — **insrc-build** (2026-10-25T21:25:26.276Z)
- `src/workflow/types.ts` — **insrc-build** (2026-10-25T21:25:26.276Z)
- `src/daemon/__tests__/config-write-models.test.ts` — **insrc-build** (2026-10-25T21:25:26.276Z)
- `src/daemon/__tests__/handler-runtime.test.ts` — **insrc-build** (2026-10-25T21:25:26.276Z)
- `src/daemon/__tests__/models-resolve-role.test.ts` — **insrc-build** (2026-10-25T21:25:26.276Z)
- `src/daemon/config-write.ts` — **insrc-build** (2026-10-25T21:25:26.276Z)
- `src/daemon/threads/method-class.ts` — **insrc-build** (2026-10-25T21:25:26.276Z)
- `src/cli/__tests__/tui-shipped-registry.test.ts` — **insrc-build** (2026-10-25T21:25:26.276Z)
- `src/cli/panes/model-tiers.ts` — **insrc-build** (2026-10-25T21:25:26.276Z)
- `src/cli/services/workflow.ts` — **insrc-build** (2026-10-25T21:25:26.276Z)
- `src/cli/shipped-model-registry.ts` — **insrc-build** (2026-10-25T21:25:26.276Z)
