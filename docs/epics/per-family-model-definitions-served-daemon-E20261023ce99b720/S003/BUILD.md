<!-- insrc:artifact BUILD-ce99b72065d03b1b-s3 -->

# Build (plan-driven) — Story s3

**Standalone:** no  ·  **Created:** 2026-10-25T19:57:09.103Z  ·  **Updated:** 2026-10-26T07:01:18.660Z

**Commit:** cb8d2f4f1

## Summary

model-literal-scan.test.ts scans daemon code (src/cli excluded until s5) for model-name literals, CLI family ids outside the definitions' owners and the CLI family implementation, runner 'ollama' literals outside named non-runner uses, reads of models.shaper.ollamaNumCtx and DEFAULT_TIERS/TIER_EFFORTS imports; each exclusion names its owner, and each rule fails on an injected literal. The four remaining runner uses now read the definitions (cliKind, CliFamilyId) and the num_ctx helper is renamed ollamaContextWindow. main() logs the local tool-loop model after the boot reconcile so the cold-start choice is observable; models-daemon-s3.test.ts checks per-repo tier removal with warnings, models.resolveRole over the socket for a repo-chosen tier, and a cold start with an alternate definitions file (it fails when the cache reset is removed).

## Tasks validated

- ✓ `t1`
- ✓ `t2`
- ✓ `t3`
- ✓ `t4`
- ✓ `t5`
- ✓ `t6`
- ✓ `t7`
- ✓ `t8`
- ✓ `t9`
- ✓ `t10`

**Tests:** [TESTS.md](TESTS.md) — what the gate ran for each Task, and what each test case did.

## Changes

- `package.json` — **insrc-build** (2026-10-26T07:01:18.660Z)
- `scripts/check-model-definitions.mjs` — **insrc-build** (2026-10-26T07:01:18.660Z)
- `src/assets/models/cloud-model-catalog.json` — **insrc-build** (2026-10-26T07:01:18.660Z)
- `src/cli/__tests__/model-tiers.test.ts` — **insrc-build** (2026-10-26T07:01:18.660Z)
- `src/config/__tests__/analyze-tiering.test.ts` — **insrc-build** (2026-10-26T07:01:18.660Z)
- `src/config/__tests__/check-model-definitions.test.ts` — **insrc-build** (2026-10-26T07:01:18.660Z)
- `src/config/__tests__/config-catalog-contract.test.ts` — **insrc-build** (2026-10-26T07:01:18.660Z)
- `src/config/__tests__/config-catalog-defs.test.ts` — **insrc-build** (2026-10-26T07:01:18.660Z)
- `src/config/__tests__/fixtures/legacy-config.baseline.json` — **insrc-build** (2026-10-26T07:01:18.660Z)
- `src/config/analyze.ts` — **insrc-build** (2026-10-26T07:01:18.660Z)
- `src/config/config-catalog.ts` — **insrc-build** (2026-10-26T07:01:18.660Z)
- `src/config/local.ts` — **insrc-build** (2026-10-26T07:01:18.660Z)
- `src/config/model-defaults.ts` — **insrc-build** (2026-10-26T07:01:18.660Z)
- `src/daemon/__tests__/model-catalog-asset.test.ts` — **insrc-build** (2026-10-26T07:01:18.660Z)
- `tsconfig.json` — **insrc-build** (2026-10-26T07:01:18.660Z)
- `vscode-plugin/tsconfig.json` — **insrc-build** (2026-10-26T07:01:18.660Z)
- `src/config/__tests__/config-reconcile.test.ts` — **insrc-build** (2026-10-26T07:01:18.660Z)
- `src/config/__tests__/reconcile-defs.test.ts` — **insrc-build** (2026-10-26T07:01:18.660Z)
- `src/config/__tests__/settings-cache-reset.test.ts` — **insrc-build** (2026-10-26T07:01:18.660Z)
- `src/config/reconcile.ts` — **insrc-build** (2026-10-26T07:01:18.660Z)
- `src/daemon/__tests__/boot-cold-import.test.ts` — **insrc-build** (2026-10-26T07:01:18.660Z)
- `src/daemon/__tests__/config-boot-reconcile.test.ts` — **insrc-build** (2026-10-26T07:01:18.660Z)
- `src/daemon/index.ts` — **insrc-build** (2026-10-26T07:01:18.660Z)
- `src/daemon/lifecycle.ts` — **insrc-build** (2026-10-26T07:01:18.660Z)
- `src/indexer/__tests__/embedder-keepalive.test.ts` — **insrc-build** (2026-10-26T07:01:18.660Z)
- `src/indexer/__tests__/embedder-lazy.test.ts` — **insrc-build** (2026-10-26T07:01:18.660Z)
- `src/indexer/embedder.ts` — **insrc-build** (2026-10-26T07:01:18.660Z)
- `src/indexer/index.ts` — **insrc-build** (2026-10-26T07:01:18.660Z)
- `src/analyze/context/__tests__/tier-effort-routing.test.ts` — **insrc-build** (2026-10-26T07:01:18.660Z)
- `src/cli/__tests__/tui.test.ts` — **insrc-build** (2026-10-26T07:01:18.660Z)
- `src/config/__tests__/tier-defaults.test.ts` — **insrc-build** (2026-10-26T07:01:18.660Z)
- `src/config/__tests__/tier-resolution.test.ts` — **insrc-build** (2026-10-26T07:01:18.660Z)
- `src/daemon/db/__tests__/fixtures/session-source-inventory.json` — **insrc-build** (2026-10-26T07:01:18.660Z)
- `src/analyze/context/__tests__/provider-bypass-audit.test.ts` — **insrc-build** (2026-10-26T07:01:18.660Z)
- `src/analyze/context/__tests__/role-router-global-tiers.test.ts` — **insrc-build** (2026-10-26T07:01:18.660Z)
- `src/analyze/context/__tests__/role-router.test.ts` — **insrc-build** (2026-10-26T07:01:18.660Z)
- `src/analyze/context/__tests__/shaper-provider.test.ts` — **insrc-build** (2026-10-26T07:01:18.660Z)
- `src/analyze/context/role-router.ts` — **insrc-build** (2026-10-26T07:01:18.660Z)
- `src/analyze/context/shaper-provider.ts` — **insrc-build** (2026-10-26T07:01:18.660Z)
- `src/config/__tests__/fixtures/PROVENANCE.md` — **insrc-build** (2026-10-26T07:01:18.660Z)
- `src/config/__tests__/repo-shaper-override.test.ts` — **insrc-build** (2026-10-26T07:01:18.660Z)
- `src/daemon/code-review-rpc.ts` — **insrc-build** (2026-10-26T07:01:18.660Z)
- `src/daemon/workflow-rpc.ts` — **insrc-build** (2026-10-26T07:01:18.660Z)
- `src/agent/providers/__tests__/input-budget.test.ts` — **insrc-build** (2026-10-26T07:01:18.660Z)
- `src/agent/providers/cli-provider.ts` — **insrc-build** (2026-10-26T07:01:18.660Z)
- `src/analyze/context/__tests__/provider-from-registry.test.ts` — **insrc-build** (2026-10-26T07:01:18.660Z)
- `src/analyze/context/__tests__/summariser-provider.test.ts` — **insrc-build** (2026-10-26T07:01:18.660Z)
- `src/analyze/context/driver.ts` — **insrc-build** (2026-10-26T07:01:18.660Z)
- `src/daemon/steps/build-step/phases/validate.ts` — **insrc-build** (2026-10-26T07:01:18.660Z)
- `src/daemon/__tests__/claude-models.test.ts` — **insrc-build** (2026-10-26T07:01:18.660Z)
- `src/daemon/__tests__/client-family.test.ts` — **insrc-build** (2026-10-26T07:01:18.660Z)
- `src/daemon/__tests__/list-models.test.ts` — **insrc-build** (2026-10-26T07:01:18.660Z)
- `src/daemon/handler-runtime.ts` — **insrc-build** (2026-10-26T07:01:18.660Z)
- `src/daemon/list-models.ts` — **insrc-build** (2026-10-26T07:01:18.660Z)
- `src/daemon/model-definitions.ts` — **insrc-build** (2026-10-26T07:01:18.660Z)
- `src/daemon/model-registry.ts` — **insrc-build** (2026-10-26T07:01:18.660Z)
- `src/daemon/steps/__tests__/step-context.test.ts` — **insrc-build** (2026-10-26T07:01:18.660Z)
- `src/daemon/steps/analyze-oneshot.ts` — **insrc-build** (2026-10-26T07:01:18.660Z)
- `src/daemon/steps/host.ts` — **insrc-build** (2026-10-26T07:01:18.660Z)
- `src/mcp/server.ts` — **insrc-build** (2026-10-26T07:01:18.660Z)
- `src/shared/step-context.ts` — **insrc-build** (2026-10-26T07:01:18.660Z)
- `src/workflow/__tests__/attribution.test.ts` — **insrc-build** (2026-10-26T07:01:18.660Z)
- `src/workflow/attribution.ts` — **insrc-build** (2026-10-26T07:01:18.660Z)
- `src/workflow/types.ts` — **insrc-build** (2026-10-26T07:01:18.660Z)
- `src/daemon/__tests__/config-write-models.test.ts` — **insrc-build** (2026-10-26T07:01:18.660Z)
- `src/daemon/__tests__/handler-runtime.test.ts` — **insrc-build** (2026-10-26T07:01:18.660Z)
- `src/daemon/__tests__/models-resolve-role.test.ts` — **insrc-build** (2026-10-26T07:01:18.660Z)
- `src/daemon/config-write.ts` — **insrc-build** (2026-10-26T07:01:18.660Z)
- `src/daemon/threads/method-class.ts` — **insrc-build** (2026-10-26T07:01:18.660Z)
- `src/cli/__tests__/tui-shipped-registry.test.ts` — **insrc-build** (2026-10-26T07:01:18.660Z)
- `src/cli/panes/model-tiers.ts` — **insrc-build** (2026-10-26T07:01:18.660Z)
- `src/cli/services/workflow.ts` — **insrc-build** (2026-10-26T07:01:18.660Z)
- `src/cli/shipped-model-registry.ts` — **insrc-build** (2026-10-26T07:01:18.660Z)
- `jetbrains-plugin/__tests__/model-tiers-unset-gradle.test.ts` — **insrc-build** (2026-10-26T07:01:18.660Z)
- `jetbrains-plugin/src/test/kotlin/ai/insors/insrc/jetbrains/settings/ModelTiersModelTest.kt` — **insrc-build** (2026-10-26T07:01:18.660Z)
- `jetbrains-plugin/src/test/resources/fixtures/model-tiers-catalog.json` — **insrc-build** (2026-10-26T07:01:18.660Z)
- `scripts/insrc-daemon-install.sh` — **insrc-build** (2026-10-26T07:01:18.660Z)
- `src/config/__tests__/installer-defs.test.ts` — **insrc-build** (2026-10-26T07:01:18.660Z)
- `src/config/__tests__/jetbrains-catalog-fixture.test.ts` — **insrc-build** (2026-10-26T07:01:18.660Z)
- `vscode-plugin/assets/insrc-daemon-install.sh` — **insrc-build** (2026-10-26T07:01:18.660Z)
- `vscode-plugin/package.json` — **insrc-build** (2026-10-26T07:01:18.660Z)
- `vscode-plugin/scripts/sync-manifest-catalog.mjs` — **insrc-build** (2026-10-26T07:01:18.660Z)
- `vscode-plugin/src/config/__tests__/sync-manifest-catalog.test.ts` — **insrc-build** (2026-10-26T07:01:18.660Z)
- `vscode-plugin/src/config/__tests__/vscode-bundle-catalog.test.ts` — **insrc-build** (2026-10-26T07:01:18.660Z)
- `vscode-plugin/src/models/__tests__/tier-effort.test.ts` — **insrc-build** (2026-10-26T07:01:18.660Z)
- `src/daemon/__tests__/model-literal-scan.test.ts` — **insrc-build** (2026-10-26T07:01:18.660Z)
- `src/daemon/__tests__/models-daemon-s3.test.ts` — **insrc-build** (2026-10-26T07:01:18.660Z)
- `.insrc/artifacts/CR-ce99b72065d03b1b-s3.json` — **insrc-build** (2026-10-26T07:01:18.660Z)
- `docs/epics/per-family-model-definitions-served-daemon-E20261023ce99b720/S003/CR.md` — **insrc-build** (2026-10-26T07:01:18.660Z)
