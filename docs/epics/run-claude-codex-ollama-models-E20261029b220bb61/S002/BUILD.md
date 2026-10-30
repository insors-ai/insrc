<!-- insrc:artifact BUILD-b220bb6174a2f5ed-s2 -->

# Build (plan-driven) — Story s2

**Standalone:** no  ·  **Created:** 2026-10-30T05:35:31.740Z  ·  **Updated:** 2026-10-30T05:41:21.989Z

**Commit:** 15155ec65

## Summary

New checkOllamaTarget pre-run check with four named causes (ollama-unreachable, model-unavailable, not-signed-in, account-unavailable per Ollama's WhoamiHandler); verified against the local Ollama (glm-5.3:cloud and qwen3.8:27b pass, a missing model gives model-unavailable).

## Tasks validated

- ✓ `t1`
- ✓ `t2`

**Tests:** [TESTS.md](TESTS.md) — what the gate ran for each Task, and what each test case did.

## Changes

- `src/agent/providers/__tests__/cli-ollama.test.ts` — **insrc-build** (2026-10-30T05:41:21.989Z)
- `src/agent/providers/cli-provider.ts` — **insrc-build** (2026-10-30T05:41:21.989Z)
- `src/daemon/db/__tests__/fixtures/session-source-inventory.json` — **insrc-build** (2026-10-30T05:41:21.989Z)
- `src/agent/providers/__tests__/ollama-target.test.ts` — **insrc-build** (2026-10-30T05:41:21.989Z)
- `src/agent/providers/ollama-target.ts` — **insrc-build** (2026-10-30T05:41:21.989Z)
- `src/agent/providers/ollama.ts` — **insrc-build** (2026-10-30T05:41:21.989Z)
