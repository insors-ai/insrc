<!-- insrc:artifact BUILD-6a1315585c38c41c-s1 -->

# Build (plan-driven) — Story s1

**Standalone:** no  ·  **Created:** 2026-10-09T05:31:55.478Z  ·  **Updated:** 2026-10-09T06:17:22.401Z

**Commit:** 85c867aa

## Summary

s1 adds the read-only delivery board as an editor tab: labels, a repo-scoped delivery client with 30 s / 15 s deadlines, the board message protocol, a pure board-state reducer, the panel host with a CSP-locked document, and the insrc.delivery.openBoard command, which is wired outside the chat gate. Placement (lc1): I compared the editor tab with a sidebar webview view and kept the editor tab. The six-column board (s2) and the details pane (s4) need editor width, but a sidebar view is capped at the side bar's width. The existing review pane, which the board opens evidence in (k10), is also an editor tab, so the two sit side by side. A sidebar would also need a new viewsContainers contribution and a WebviewViewProvider lifecycle, and nothing in the DEF or the PRD requires that. Mock E's narrow grouped list (s5) covers a narrow editor group. The editor tab therefore stays, and a sidebar entry is not added. Verification: `npx tsc -p vscode-plugin` exits 0, and the plugin suite `(cd vscode-plugin && npx tsx --test 'src/**/__tests__/*.test.ts')` gives 851 pass, 2 fail. Both failures are pre-existing and fail on the tree without s1 too: docs-review-panel.test.ts 't1: NO file under src/ is modified…' and manifest-catalog.test.ts 'each declared key's type/enum/default…'.

## Tasks validated

- ✓ `t1`
- ✓ `t2`
- ✓ `t3`
- ✓ `t4`
- ✓ `t5`
- ✓ `t6`

## Changes

- `vscode-plugin/package.json` — **insrc-build** (2026-10-09T06:17:22.401Z)
- `vscode-plugin/src/__tests__/packaging.test.ts` — **insrc-build** (2026-10-09T06:17:22.401Z)
- `vscode-plugin/src/chat/__tests__/extension-chat-wiring.test.ts` — **insrc-build** (2026-10-09T06:17:22.401Z)
- `vscode-plugin/src/chat/webview-channel.ts` — **insrc-build** (2026-10-09T06:17:22.401Z)
- `vscode-plugin/src/config/__tests__/truthful-sync.test.ts` — **insrc-build** (2026-10-09T06:17:22.401Z)
- `vscode-plugin/src/delivery/__tests__/board-host.test.ts` — **insrc-build** (2026-10-09T06:17:22.401Z)
- `vscode-plugin/src/delivery/__tests__/board-protocol.test.ts` — **insrc-build** (2026-10-09T06:17:22.401Z)
- `vscode-plugin/src/delivery/__tests__/board-state.test.ts` — **insrc-build** (2026-10-09T06:17:22.401Z)
- `vscode-plugin/src/delivery/__tests__/board-wiring.test.ts` — **insrc-build** (2026-10-09T06:17:22.401Z)
- `vscode-plugin/src/delivery/__tests__/delivery-client.test.ts` — **insrc-build** (2026-10-09T06:17:22.401Z)
- `vscode-plugin/src/delivery/__tests__/flush.ts` — **insrc-build** (2026-10-09T06:17:22.401Z)
- `vscode-plugin/src/delivery/__tests__/labels.test.ts` — **insrc-build** (2026-10-09T06:17:22.401Z)
- `vscode-plugin/src/delivery/board-host.ts` — **insrc-build** (2026-10-09T06:17:22.401Z)
- `vscode-plugin/src/delivery/board-protocol.ts` — **insrc-build** (2026-10-09T06:17:22.401Z)
- `vscode-plugin/src/delivery/board-state.ts` — **insrc-build** (2026-10-09T06:17:22.401Z)
- `vscode-plugin/src/delivery/board-wiring.ts` — **insrc-build** (2026-10-09T06:17:22.401Z)
- `vscode-plugin/src/delivery/delivery-client.ts` — **insrc-build** (2026-10-09T06:17:22.401Z)
- `vscode-plugin/src/delivery/delivery-contract.ts` — **insrc-build** (2026-10-09T06:17:22.401Z)
- `vscode-plugin/src/delivery/guards.ts` — **insrc-build** (2026-10-09T06:17:22.401Z)
- `vscode-plugin/src/delivery/labels.ts` — **insrc-build** (2026-10-09T06:17:22.401Z)
- `vscode-plugin/src/extension.ts` — **insrc-build** (2026-10-09T06:17:22.401Z)
- `vscode-plugin/src/surfaces/command-registry.ts` — **insrc-build** (2026-10-09T06:17:22.401Z)
