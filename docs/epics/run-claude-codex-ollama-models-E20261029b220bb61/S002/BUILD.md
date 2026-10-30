<!-- insrc:artifact BUILD-b220bb6174a2f5ed-s2 -->

# Build (plan-driven) — Story s2

**Standalone:** no  ·  **Created:** 2026-10-30T05:35:31.740Z  ·  **Updated:** 2026-10-30T05:37:12.338Z

**Commit:** e7074cb44

## Summary

CliProvider gained an optional Ollama target (claude with a model only); every claude run on such a provider gets ANTHROPIC_BASE_URL/AUTH_TOKEN/API_KEY in a per-run environment copy without the vendor OAuth token, on both spawn sites; providers without a target are unchanged.

## Tasks validated

- ✓ `t1`

**Tests:** [TESTS.md](TESTS.md) — what the gate ran for each Task, and what each test case did.

## Changes

- `src/agent/providers/__tests__/cli-ollama.test.ts` — **insrc-build** (2026-10-30T05:37:12.338Z)
- `src/agent/providers/cli-provider.ts` — **insrc-build** (2026-10-30T05:37:12.338Z)
- `src/daemon/db/__tests__/fixtures/session-source-inventory.json` — **insrc-build** (2026-10-30T05:37:12.338Z)
