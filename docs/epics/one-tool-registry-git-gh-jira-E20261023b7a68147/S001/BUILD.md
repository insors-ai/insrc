<!-- insrc:artifact BUILD-b7a68147dcf72034-s1 -->

# Build (plan-driven) — Story s1

**Standalone:** no  ·  **Created:** 2026-10-24T14:28:01.568Z  ·  **Updated:** 2026-10-24T14:34:20.880Z

**Commit:** 397c98cde

## Summary

callTool copies hookFailures from the executor result onto the typed success result, only when a rule failed. The existing call-tool tests are mapped as an extra case so the gate runs them unchanged.

## Tasks validated

- ✓ `t1`
- ✓ `t2`
- ✓ `t3`
- ✓ `t4`

**Tests:** [TESTS.md](TESTS.md) — what the gate ran for each Task, and what each test case did.

## Changes

- `src/daemon/tools/__tests__/tool-hooks.test.ts` — **insrc-build** (2026-10-24T14:34:20.880Z)
- `src/daemon/tools/call-tool.ts` — **insrc-build** (2026-10-24T14:34:20.880Z)
- `src/daemon/tools/types.ts` — **insrc-build** (2026-10-24T14:34:20.880Z)
- `src/daemon/tools/hooks.ts` — **insrc-build** (2026-10-24T14:34:20.880Z)
- `src/daemon/tools/index.ts` — **insrc-build** (2026-10-24T14:34:20.880Z)
- `src/daemon/tools/executor.ts` — **insrc-build** (2026-10-24T14:34:20.880Z)
