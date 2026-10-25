<!-- insrc:artifact BUILD-ce99b72065d03b1b-s3 -->

# Build (plan-driven) — Story s3

**Standalone:** no  ·  **Created:** 2026-10-25T19:57:09.103Z  ·  **Updated:** 2026-10-25T20:41:44.108Z

**Commit:** b0b37ecbe

## Summary

Every shaper and summariser provider is built from the registry through familyProvider: CLI kind from registry.cliKind, canonical model, effort only when accepted, a chars inputLimit as the CLI input budget (a token limit such as haiku's gives none), an Ollama model's token limit as num_ctx; the summariser falls back to the family's summariserModel; resolveShaperKind's floor is the default family. CliProvider takes inputBudgetChars from options (CODEX_INPUT_BUDGET_CHARS removed) and models.shaper.ollamaNumCtx is no longer read. localToolLoopModel keeps its precedence (ollama cheap tier, listed coreModel, toolLoopModel with a warning). resolveValidateProvider reuses the router's CLI provider, else builds the default family's tier default through the same factory.

## Tasks validated

- ✓ `t1`
- ✓ `t2`
- ✓ `t3`
- ✓ `t4`
- ✓ `t5`

**Tests:** [TESTS.md](TESTS.md) — what the gate ran for each Task, and what each test case did.

## Changes

- `package.json` — **insrc-build** (2026-10-25T20:41:44.108Z)
- `scripts/check-model-definitions.mjs` — **insrc-build** (2026-10-25T20:41:44.108Z)
- `src/assets/models/cloud-model-catalog.json` — **insrc-build** (2026-10-25T20:41:44.108Z)
- `src/cli/__tests__/model-tiers.test.ts` — **insrc-build** (2026-10-25T20:41:44.108Z)
- `src/config/__tests__/analyze-tiering.test.ts` — **insrc-build** (2026-10-25T20:41:44.108Z)
- `src/config/__tests__/check-model-definitions.test.ts` — **insrc-build** (2026-10-25T20:41:44.108Z)
- `src/config/__tests__/config-catalog-contract.test.ts` — **insrc-build** (2026-10-25T20:41:44.108Z)
- `src/config/__tests__/config-catalog-defs.test.ts` — **insrc-build** (2026-10-25T20:41:44.108Z)
- `src/config/__tests__/fixtures/legacy-config.baseline.json` — **insrc-build** (2026-10-25T20:41:44.108Z)
- `src/config/analyze.ts` — **insrc-build** (2026-10-25T20:41:44.108Z)
- `src/config/config-catalog.ts` — **insrc-build** (2026-10-25T20:41:44.108Z)
- `src/config/local.ts` — **insrc-build** (2026-10-25T20:41:44.108Z)
- `src/config/model-defaults.ts` — **insrc-build** (2026-10-25T20:41:44.108Z)
- `src/daemon/__tests__/model-catalog-asset.test.ts` — **insrc-build** (2026-10-25T20:41:44.108Z)
- `tsconfig.json` — **insrc-build** (2026-10-25T20:41:44.108Z)
- `vscode-plugin/tsconfig.json` — **insrc-build** (2026-10-25T20:41:44.108Z)
- `src/config/__tests__/config-reconcile.test.ts` — **insrc-build** (2026-10-25T20:41:44.108Z)
- `src/config/__tests__/reconcile-defs.test.ts` — **insrc-build** (2026-10-25T20:41:44.108Z)
- `src/config/__tests__/settings-cache-reset.test.ts` — **insrc-build** (2026-10-25T20:41:44.108Z)
- `src/config/reconcile.ts` — **insrc-build** (2026-10-25T20:41:44.108Z)
- `src/daemon/__tests__/boot-cold-import.test.ts` — **insrc-build** (2026-10-25T20:41:44.108Z)
- `src/daemon/__tests__/config-boot-reconcile.test.ts` — **insrc-build** (2026-10-25T20:41:44.108Z)
- `src/daemon/index.ts` — **insrc-build** (2026-10-25T20:41:44.108Z)
- `src/daemon/lifecycle.ts` — **insrc-build** (2026-10-25T20:41:44.108Z)
- `src/indexer/__tests__/embedder-keepalive.test.ts` — **insrc-build** (2026-10-25T20:41:44.108Z)
- `src/indexer/__tests__/embedder-lazy.test.ts` — **insrc-build** (2026-10-25T20:41:44.108Z)
- `src/indexer/embedder.ts` — **insrc-build** (2026-10-25T20:41:44.108Z)
- `src/indexer/index.ts` — **insrc-build** (2026-10-25T20:41:44.108Z)
- `src/analyze/context/__tests__/tier-effort-routing.test.ts` — **insrc-build** (2026-10-25T20:41:44.108Z)
- `src/cli/__tests__/tui.test.ts` — **insrc-build** (2026-10-25T20:41:44.108Z)
- `src/config/__tests__/tier-defaults.test.ts` — **insrc-build** (2026-10-25T20:41:44.108Z)
- `src/config/__tests__/tier-resolution.test.ts` — **insrc-build** (2026-10-25T20:41:44.108Z)
- `src/daemon/db/__tests__/fixtures/session-source-inventory.json` — **insrc-build** (2026-10-25T20:41:44.108Z)
- `src/analyze/context/__tests__/provider-bypass-audit.test.ts` — **insrc-build** (2026-10-25T20:41:44.108Z)
- `src/analyze/context/__tests__/role-router-global-tiers.test.ts` — **insrc-build** (2026-10-25T20:41:44.108Z)
- `src/analyze/context/__tests__/role-router.test.ts` — **insrc-build** (2026-10-25T20:41:44.108Z)
- `src/analyze/context/__tests__/shaper-provider.test.ts` — **insrc-build** (2026-10-25T20:41:44.108Z)
- `src/analyze/context/role-router.ts` — **insrc-build** (2026-10-25T20:41:44.108Z)
- `src/analyze/context/shaper-provider.ts` — **insrc-build** (2026-10-25T20:41:44.108Z)
- `src/config/__tests__/fixtures/PROVENANCE.md` — **insrc-build** (2026-10-25T20:41:44.108Z)
- `src/config/__tests__/repo-shaper-override.test.ts` — **insrc-build** (2026-10-25T20:41:44.108Z)
- `src/daemon/code-review-rpc.ts` — **insrc-build** (2026-10-25T20:41:44.108Z)
- `src/daemon/workflow-rpc.ts` — **insrc-build** (2026-10-25T20:41:44.108Z)
- `src/agent/providers/__tests__/input-budget.test.ts` — **insrc-build** (2026-10-25T20:41:44.108Z)
- `src/agent/providers/cli-provider.ts` — **insrc-build** (2026-10-25T20:41:44.108Z)
- `src/analyze/context/__tests__/provider-from-registry.test.ts` — **insrc-build** (2026-10-25T20:41:44.108Z)
- `src/analyze/context/__tests__/summariser-provider.test.ts` — **insrc-build** (2026-10-25T20:41:44.108Z)
- `src/analyze/context/driver.ts` — **insrc-build** (2026-10-25T20:41:44.108Z)
- `src/daemon/steps/build-step/phases/validate.ts` — **insrc-build** (2026-10-25T20:41:44.108Z)
