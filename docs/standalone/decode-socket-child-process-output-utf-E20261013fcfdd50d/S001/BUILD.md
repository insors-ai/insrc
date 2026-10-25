<!-- insrc:artifact BUILD-fcfdd50de84fb31a-s1 -->

# Build (standalone trivial) — Story s1

**Size class:** trivial  ·  **Standalone:** yes  ·  **Created:** 2026-10-24T13:25:59.688Z  ·  **Updated:** 2026-10-24T14:37:30.630Z

**Commit:** 3251877d3

## Scope

Implement approved ISSUE-fcfdd50de84fb31a: decode socket and child-process output as UTF-8 streams so multibyte characters split across reads survive intact. Preserve framing and byte-based limits. Reuse the established streaming decoder in src/mcp/forward-step.ts; cover each corrected reader with split-chunk regressions.

## Triage rationale

Existing approved small bugfix routed directly from ISSUE to build.

## Summary

Added a shared StringDecoder-based reader preserving raw byte counts and applied it to daemon/shared/MCP sockets, subprocess tool output, Graphviz and editor CLI stderr; workflow streaming preserves its named listener and uses StringDecoder directly, and CLI stdout uses Node UTF-8 stream decoding. Split-byte regressions cover all corrected reader families. Backend and editor TypeScript passed; expanded compatibility suite: 150 pass, 0 fail.

## Tasks validated

- ✓ `s1`

**Tests:** [TESTS.md](TESTS.md) — what the gate ran for each Task, and what each test case did.

## Changes

- `.insrc/artifacts/ISSUE-fcfdd50de84fb31a.json` — **insrc-build** (2026-10-24T14:37:30.630Z)
- `.insrc/artifacts/ISSUE-fcfdd50de84fb31a.log.jsonl` — **insrc-build** (2026-10-24T14:37:30.630Z)
- `src/daemon/__tests__/server-utf8.test.ts` — **insrc-build** (2026-10-24T14:37:30.630Z)
- `src/daemon/server.ts` — **insrc-build** (2026-10-24T14:37:30.630Z)
- `src/daemon/tools/builtins/cloud/aws/logs.ts` — **insrc-build** (2026-10-24T14:37:30.630Z)
- `src/daemon/tools/builtins/k8s/index.ts` — **insrc-build** (2026-10-24T14:37:30.630Z)
- `src/daemon/tools/builtins/shell/exec-detached.ts` — **insrc-build** (2026-10-24T14:37:30.630Z)
- `src/daemon/tools/builtins/ssh/index.ts` — **insrc-build** (2026-10-24T14:37:30.630Z)
- `src/daemon/tools/builtins/test/index.ts` — **insrc-build** (2026-10-24T14:37:30.630Z)
- `src/daemon/tools/shell-helper.ts` — **insrc-build** (2026-10-24T14:37:30.630Z)
- `src/docgen/render/fallback.ts` — **insrc-build** (2026-10-24T14:37:30.630Z)
- `src/mcp/__tests__/daemon-stream-utf8.test.ts` — **insrc-build** (2026-10-24T14:37:30.630Z)
- `src/mcp/daemon-stream.ts` — **insrc-build** (2026-10-24T14:37:30.630Z)
- `src/shared/__tests__/ipc-client-timeout.test.ts` — **insrc-build** (2026-10-24T14:37:30.630Z)
- `src/shared/__tests__/ipc-client.test.ts` — **insrc-build** (2026-10-24T14:37:30.630Z)
- `src/shared/__tests__/utf8-stream.test.ts` — **insrc-build** (2026-10-24T14:37:30.630Z)
- `src/shared/ipc-client.ts` — **insrc-build** (2026-10-24T14:37:30.630Z)
- `src/shared/utf8-stream.ts` — **insrc-build** (2026-10-24T14:37:30.630Z)
- `vscode-plugin/src/chat/__tests__/cli-adapter-utf8.test.ts` — **insrc-build** (2026-10-24T14:37:30.630Z)
- `vscode-plugin/src/chat/cli-adapter.ts` — **insrc-build** (2026-10-24T14:37:30.630Z)
