<!-- insrc:artifact BUILD-a9ae072ce3b7b794-s1 -->

# Build (standalone) — Story s1

**Standalone:** yes  ·  **Created:** 2026-11-24T08:57:29.722Z  ·  **Updated:** 2026-11-24T15:14:36.641Z

**Commit:** 16bbb6800

## Summary

Added discoverCodexMcpServers (codex -C cwd mcp list --json) and replaced codexReadOnlySessionArgs with a 4-argument builder that constructs a native per-server allowlist from the discovered servers, throwing CodexMcpServerNotRegisteredError when insrc is absent. The sole call site (readOnlySessionOnce) passes a placeholder single-entry servers list for now; the Task that rewires that orchestration end to end replaces it outright.

## Tasks validated

- ✗ `t1`
- ✗ `t2`
- ✗ `t3`
- ✗ `t5`

**Tests:** [TESTS.md](TESTS.md) — what the gate ran for each Task, and what each test case did.

## Changes

- `src/agent/providers/__tests__/cli-readonly-session.live.test.ts` — **insrc-build** (2026-11-24T15:14:36.641Z)
- `src/agent/providers/__tests__/cli-vibe.test.ts` — **insrc-build** (2026-11-24T15:14:36.641Z)
- `src/agent/providers/cli-provider.ts` — **insrc-build** (2026-11-24T15:14:36.641Z)
- `package-lock.json` — **insrc-build** (2026-11-24T15:14:36.641Z)
- `package.json` — **insrc-build** (2026-11-24T15:14:36.641Z)
- `src/agent/providers/__tests__/cli-codex-mcp-config-layers.test.ts` — **insrc-build** (2026-11-24T15:14:36.641Z)
- `src/agent/providers/__tests__/cli-codex-mcp-discovery.test.ts` — **insrc-build** (2026-11-24T15:14:36.641Z)
- `src/agent/providers/__tests__/cli-readonly-session.test.ts` — **insrc-build** (2026-11-24T15:14:36.641Z)
- `src/agent/providers/__tests__/cli-codex-strict-schema.test.ts` — **insrc-build** (2026-11-24T15:14:36.641Z)
