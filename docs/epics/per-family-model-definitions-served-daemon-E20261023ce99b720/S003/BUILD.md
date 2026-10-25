<!-- insrc:artifact BUILD-ce99b72065d03b1b-s3 -->

# Build (plan-driven) — Story s3

**Standalone:** no  ·  **Created:** 2026-10-25T19:57:09.103Z  ·  **Updated:** 2026-10-25T20:01:03.859Z

**Commit:** 253fe7452

## Summary

Settings catalog model rows, local.ts's coreModel default and the temporary DEFAULT_TIERS/TIER_EFFORTS exports now derive from the shipped definitions (JSON module import, never-throwing derivation in src/config/model-defaults.ts); models.shaper.ollamaNumCtx is retired; Codex models carry a 1048576-char inputLimit; npm run build validates the definitions with scripts/check-model-definitions.mjs after tsc. The loader test compiles the catalog with tsc and loads it through the compiled loader in plain node. The VS Code manifest pins (manifest-catalog, tier-effort) are left to t9, which regenerates the manifest.

## Tasks validated

- ✓ `t1`

**Tests:** [TESTS.md](TESTS.md) — what the gate ran for each Task, and what each test case did.

## Changes

- `package.json` — **insrc-build** (2026-10-25T20:01:03.859Z)
- `scripts/check-model-definitions.mjs` — **insrc-build** (2026-10-25T20:01:03.859Z)
- `src/assets/models/cloud-model-catalog.json` — **insrc-build** (2026-10-25T20:01:03.859Z)
- `src/cli/__tests__/model-tiers.test.ts` — **insrc-build** (2026-10-25T20:01:03.859Z)
- `src/config/__tests__/analyze-tiering.test.ts` — **insrc-build** (2026-10-25T20:01:03.859Z)
- `src/config/__tests__/check-model-definitions.test.ts` — **insrc-build** (2026-10-25T20:01:03.859Z)
- `src/config/__tests__/config-catalog-contract.test.ts` — **insrc-build** (2026-10-25T20:01:03.859Z)
- `src/config/__tests__/config-catalog-defs.test.ts` — **insrc-build** (2026-10-25T20:01:03.859Z)
- `src/config/__tests__/fixtures/legacy-config.baseline.json` — **insrc-build** (2026-10-25T20:01:03.859Z)
- `src/config/analyze.ts` — **insrc-build** (2026-10-25T20:01:03.859Z)
- `src/config/config-catalog.ts` — **insrc-build** (2026-10-25T20:01:03.859Z)
- `src/config/local.ts` — **insrc-build** (2026-10-25T20:01:03.859Z)
- `src/config/model-defaults.ts` — **insrc-build** (2026-10-25T20:01:03.859Z)
- `src/daemon/__tests__/model-catalog-asset.test.ts` — **insrc-build** (2026-10-25T20:01:03.859Z)
- `tsconfig.json` — **insrc-build** (2026-10-25T20:01:03.859Z)
- `vscode-plugin/tsconfig.json` — **insrc-build** (2026-10-25T20:01:03.859Z)
