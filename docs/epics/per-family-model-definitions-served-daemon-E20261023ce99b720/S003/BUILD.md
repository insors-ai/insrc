<!-- insrc:artifact BUILD-ce99b72065d03b1b-s3 -->

# Build (plan-driven) — Story s3

**Standalone:** no  ·  **Created:** 2026-10-25T19:57:09.103Z  ·  **Updated:** 2026-10-25T21:04:58.907Z

**Commit:** 6abec29e1

## Summary

The daemon maps a forwarded client identity to the family whose cliKind it is (familyForClient in model-registry.ts) in the step host (which validates the client against the definitions' CLI kinds), one-shot analyze, code-review-rpc and workflow-rpc; step-context drops clientProviderKind/stepClientOf and the MCP server forwards only the client identity (detectClient). Attribution decodes labels by the shipped families' ids and CLI kinds before a model lookup. providers.listModels admits the registry's family ids, and its invalid-params text is the same whatever order the file lists the families in. claude.models answers from the Claude-kind family via claudeModels() (no Anthropic SDK REST call). OutputModelStamp.runner is FamilyId. The model-catalog-asset.test.ts repair that first landed in 165317970 is reverted for t6 (82c28bc22) and re-applied as t5's own fix (6abec29e1), so t6's net change no longer touches that file. The other session's concurrent edits to host.ts and step-context.ts were kept out of the commit.

## Tasks validated

- ✓ `t1`
- ✓ `t2`
- ✓ `t3`
- ✓ `t4`
- ✓ `t5`
- ✓ `t6`

**Tests:** [TESTS.md](TESTS.md) — what the gate ran for each Task, and what each test case did.

## Changes

- `package.json` — **insrc-build** (2026-10-25T21:04:58.907Z)
- `scripts/check-model-definitions.mjs` — **insrc-build** (2026-10-25T21:04:58.907Z)
- `src/assets/models/cloud-model-catalog.json` — **insrc-build** (2026-10-25T21:04:58.907Z)
- `src/cli/__tests__/model-tiers.test.ts` — **insrc-build** (2026-10-25T21:04:58.907Z)
- `src/config/__tests__/analyze-tiering.test.ts` — **insrc-build** (2026-10-25T21:04:58.907Z)
- `src/config/__tests__/check-model-definitions.test.ts` — **insrc-build** (2026-10-25T21:04:58.907Z)
- `src/config/__tests__/config-catalog-contract.test.ts` — **insrc-build** (2026-10-25T21:04:58.907Z)
- `src/config/__tests__/config-catalog-defs.test.ts` — **insrc-build** (2026-10-25T21:04:58.907Z)
- `src/config/__tests__/fixtures/legacy-config.baseline.json` — **insrc-build** (2026-10-25T21:04:58.907Z)
- `src/config/analyze.ts` — **insrc-build** (2026-10-25T21:04:58.907Z)
- `src/config/config-catalog.ts` — **insrc-build** (2026-10-25T21:04:58.907Z)
- `src/config/local.ts` — **insrc-build** (2026-10-25T21:04:58.907Z)
- `src/config/model-defaults.ts` — **insrc-build** (2026-10-25T21:04:58.907Z)
- `src/daemon/__tests__/model-catalog-asset.test.ts` — **insrc-build** (2026-10-25T21:04:58.907Z)
- `tsconfig.json` — **insrc-build** (2026-10-25T21:04:58.907Z)
- `vscode-plugin/tsconfig.json` — **insrc-build** (2026-10-25T21:04:58.907Z)
- `src/config/__tests__/config-reconcile.test.ts` — **insrc-build** (2026-10-25T21:04:58.907Z)
- `src/config/__tests__/reconcile-defs.test.ts` — **insrc-build** (2026-10-25T21:04:58.907Z)
- `src/config/__tests__/settings-cache-reset.test.ts` — **insrc-build** (2026-10-25T21:04:58.907Z)
- `src/config/reconcile.ts` — **insrc-build** (2026-10-25T21:04:58.907Z)
- `src/daemon/__tests__/boot-cold-import.test.ts` — **insrc-build** (2026-10-25T21:04:58.907Z)
- `src/daemon/__tests__/config-boot-reconcile.test.ts` — **insrc-build** (2026-10-25T21:04:58.907Z)
- `src/daemon/index.ts` — **insrc-build** (2026-10-25T21:04:58.907Z)
- `src/daemon/lifecycle.ts` — **insrc-build** (2026-10-25T21:04:58.907Z)
- `src/indexer/__tests__/embedder-keepalive.test.ts` — **insrc-build** (2026-10-25T21:04:58.907Z)
- `src/indexer/__tests__/embedder-lazy.test.ts` — **insrc-build** (2026-10-25T21:04:58.907Z)
- `src/indexer/embedder.ts` — **insrc-build** (2026-10-25T21:04:58.907Z)
- `src/indexer/index.ts` — **insrc-build** (2026-10-25T21:04:58.907Z)
- `src/analyze/context/__tests__/tier-effort-routing.test.ts` — **insrc-build** (2026-10-25T21:04:58.907Z)
- `src/cli/__tests__/tui.test.ts` — **insrc-build** (2026-10-25T21:04:58.907Z)
- `src/config/__tests__/tier-defaults.test.ts` — **insrc-build** (2026-10-25T21:04:58.907Z)
- `src/config/__tests__/tier-resolution.test.ts` — **insrc-build** (2026-10-25T21:04:58.907Z)
- `src/daemon/db/__tests__/fixtures/session-source-inventory.json` — **insrc-build** (2026-10-25T21:04:58.907Z)
- `src/analyze/context/__tests__/provider-bypass-audit.test.ts` — **insrc-build** (2026-10-25T21:04:58.907Z)
- `src/analyze/context/__tests__/role-router-global-tiers.test.ts` — **insrc-build** (2026-10-25T21:04:58.907Z)
- `src/analyze/context/__tests__/role-router.test.ts` — **insrc-build** (2026-10-25T21:04:58.907Z)
- `src/analyze/context/__tests__/shaper-provider.test.ts` — **insrc-build** (2026-10-25T21:04:58.907Z)
- `src/analyze/context/role-router.ts` — **insrc-build** (2026-10-25T21:04:58.907Z)
- `src/analyze/context/shaper-provider.ts` — **insrc-build** (2026-10-25T21:04:58.907Z)
- `src/config/__tests__/fixtures/PROVENANCE.md` — **insrc-build** (2026-10-25T21:04:58.907Z)
- `src/config/__tests__/repo-shaper-override.test.ts` — **insrc-build** (2026-10-25T21:04:58.907Z)
- `src/daemon/code-review-rpc.ts` — **insrc-build** (2026-10-25T21:04:58.907Z)
- `src/daemon/workflow-rpc.ts` — **insrc-build** (2026-10-25T21:04:58.907Z)
- `src/agent/providers/__tests__/input-budget.test.ts` — **insrc-build** (2026-10-25T21:04:58.907Z)
- `src/agent/providers/cli-provider.ts` — **insrc-build** (2026-10-25T21:04:58.907Z)
- `src/analyze/context/__tests__/provider-from-registry.test.ts` — **insrc-build** (2026-10-25T21:04:58.907Z)
- `src/analyze/context/__tests__/summariser-provider.test.ts` — **insrc-build** (2026-10-25T21:04:58.907Z)
- `src/analyze/context/driver.ts` — **insrc-build** (2026-10-25T21:04:58.907Z)
- `src/daemon/steps/build-step/phases/validate.ts` — **insrc-build** (2026-10-25T21:04:58.907Z)
- `src/daemon/__tests__/claude-models.test.ts` — **insrc-build** (2026-10-25T21:04:58.907Z)
- `src/daemon/__tests__/client-family.test.ts` — **insrc-build** (2026-10-25T21:04:58.907Z)
- `src/daemon/__tests__/list-models.test.ts` — **insrc-build** (2026-10-25T21:04:58.907Z)
- `src/daemon/handler-runtime.ts` — **insrc-build** (2026-10-25T21:04:58.907Z)
- `src/daemon/list-models.ts` — **insrc-build** (2026-10-25T21:04:58.907Z)
- `src/daemon/model-definitions.ts` — **insrc-build** (2026-10-25T21:04:58.907Z)
- `src/daemon/model-registry.ts` — **insrc-build** (2026-10-25T21:04:58.907Z)
- `src/daemon/steps/__tests__/step-context.test.ts` — **insrc-build** (2026-10-25T21:04:58.907Z)
- `src/daemon/steps/analyze-oneshot.ts` — **insrc-build** (2026-10-25T21:04:58.907Z)
- `src/daemon/steps/host.ts` — **insrc-build** (2026-10-25T21:04:58.907Z)
- `src/mcp/server.ts` — **insrc-build** (2026-10-25T21:04:58.907Z)
- `src/shared/step-context.ts` — **insrc-build** (2026-10-25T21:04:58.907Z)
- `src/workflow/__tests__/attribution.test.ts` — **insrc-build** (2026-10-25T21:04:58.907Z)
- `src/workflow/attribution.ts` — **insrc-build** (2026-10-25T21:04:58.907Z)
- `src/workflow/types.ts` — **insrc-build** (2026-10-25T21:04:58.907Z)
