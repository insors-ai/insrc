<!-- insrc:artifact BUILD-b268706068c7a342-S001 -->

# Build (standalone trivial) — Story S001

**Size class:** trivial  ·  **Standalone:** yes  ·  **Created:** 2026-10-27T06:28:52.033Z  ·  **Updated:** 2026-10-27T07:37:38.351Z

**Commit:** 9bf7fecf5

## Scope

Add the local Ollama model qwen3.8:27b to the shipped model definitions (src/assets/models/cloud-model-catalog.json, the ollama family's models), next to qwen3.6:27b, with displayName 'Qwen 3.8 27B', efforts [], inputLimit {unit:'tokens', max:32768} (the same context window the shipped local model uses) and memoryMb sized for its 17 GB Q4_K_M weights. The user's cheap tier is configured to ollama/qwen3.8:27b, which is installed but not listed, so the daemon currently falls back to the default family's cheap tier. The toolLoopModel stays qwen3.6:27b.

## Triage rationale

One data entry added to one shipped file (src/assets/models/cloud-model-catalog.json).

## Summary

The shipped definitions list qwen3.8:27b in the Ollama family (no efforts, 32768-token window, 18000 MB); the asset test checks it.

## Tasks validated

- ✓ `S001`

**Tests:** [TESTS.md](TESTS.md) — what the gate ran for each Task, and what each test case did.

## Changes

- `src/assets/models/cloud-model-catalog.json` — **insrc-build** (2026-10-27T07:37:38.351Z)
- `src/daemon/__tests__/model-catalog-asset.test.ts` — **insrc-build** (2026-10-27T07:37:38.351Z)
