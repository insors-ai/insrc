<!-- insrc:artifact BUILD-ce99b72065d03b1b-s3 -->

# Build (plan-driven) — Story s3

**Standalone:** no  ·  **Created:** 2026-10-25T19:57:09.103Z  ·  **Updated:** 2026-10-25T20:07:53.406Z

**Commit:** 2968540e2

## Summary

The daemon reconciles config.json with buildConfigCatalog(validateModelCatalog()) and warns per removed per-repo tier (tasks and coreFloor kept, ollamaNumCtx pruned); main() drops the local and analyze settings caches right after the boot reconcile through the new production resets; the embedder's model, dim, keep-alive and Ollama client are read on first use, with lifecycle.ts and IndexerService.reembed on the getters.

## Tasks validated

- ✓ `t1`
- ✓ `t2`

**Tests:** [TESTS.md](TESTS.md) — what the gate ran for each Task, and what each test case did.

## Changes

- `package.json` — **insrc-build** (2026-10-25T20:07:53.406Z)
- `scripts/check-model-definitions.mjs` — **insrc-build** (2026-10-25T20:07:53.406Z)
- `src/assets/models/cloud-model-catalog.json` — **insrc-build** (2026-10-25T20:07:53.406Z)
- `src/cli/__tests__/model-tiers.test.ts` — **insrc-build** (2026-10-25T20:07:53.406Z)
- `src/config/__tests__/analyze-tiering.test.ts` — **insrc-build** (2026-10-25T20:07:53.406Z)
- `src/config/__tests__/check-model-definitions.test.ts` — **insrc-build** (2026-10-25T20:07:53.406Z)
- `src/config/__tests__/config-catalog-contract.test.ts` — **insrc-build** (2026-10-25T20:07:53.406Z)
- `src/config/__tests__/config-catalog-defs.test.ts` — **insrc-build** (2026-10-25T20:07:53.406Z)
- `src/config/__tests__/fixtures/legacy-config.baseline.json` — **insrc-build** (2026-10-25T20:07:53.406Z)
- `src/config/analyze.ts` — **insrc-build** (2026-10-25T20:07:53.406Z)
- `src/config/config-catalog.ts` — **insrc-build** (2026-10-25T20:07:53.406Z)
- `src/config/local.ts` — **insrc-build** (2026-10-25T20:07:53.406Z)
- `src/config/model-defaults.ts` — **insrc-build** (2026-10-25T20:07:53.406Z)
- `src/daemon/__tests__/model-catalog-asset.test.ts` — **insrc-build** (2026-10-25T20:07:53.406Z)
- `tsconfig.json` — **insrc-build** (2026-10-25T20:07:53.406Z)
- `vscode-plugin/tsconfig.json` — **insrc-build** (2026-10-25T20:07:53.406Z)
- `src/config/__tests__/config-reconcile.test.ts` — **insrc-build** (2026-10-25T20:07:53.406Z)
- `src/config/__tests__/reconcile-defs.test.ts` — **insrc-build** (2026-10-25T20:07:53.406Z)
- `src/config/__tests__/settings-cache-reset.test.ts` — **insrc-build** (2026-10-25T20:07:53.406Z)
- `src/config/reconcile.ts` — **insrc-build** (2026-10-25T20:07:53.406Z)
- `src/daemon/__tests__/boot-cold-import.test.ts` — **insrc-build** (2026-10-25T20:07:53.406Z)
- `src/daemon/__tests__/config-boot-reconcile.test.ts` — **insrc-build** (2026-10-25T20:07:53.406Z)
- `src/daemon/index.ts` — **insrc-build** (2026-10-25T20:07:53.406Z)
- `src/daemon/lifecycle.ts` — **insrc-build** (2026-10-25T20:07:53.406Z)
- `src/indexer/__tests__/embedder-keepalive.test.ts` — **insrc-build** (2026-10-25T20:07:53.406Z)
- `src/indexer/__tests__/embedder-lazy.test.ts` — **insrc-build** (2026-10-25T20:07:53.406Z)
- `src/indexer/embedder.ts` — **insrc-build** (2026-10-25T20:07:53.406Z)
- `src/indexer/index.ts` — **insrc-build** (2026-10-25T20:07:53.406Z)
