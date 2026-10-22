<!-- insrc:artifact BUILD-8ecb7abacb70be55-s1 -->

# Build (standalone trivial) — Story S001

**Size class:** trivial  ·  **Standalone:** yes  ·  **Created:** 2026-10-11T07:51:17.300Z  ·  **Updated:** 2026-10-11T08:17:49.600Z

**Commit:** 7fae3a83

## Scope

Give the Delivery board its own icon: add the chosen light/dark SVG pair (the insrc spiral at 60% opacity behind a curved four-node progress path: two done, one current, one ahead) as vscode-plugin/media/insrc-delivery-icon.svg and insrc-delivery-icon-dark.svg, set it as the icon of the insrc.delivery.openBoard command in package.json, and as the board's editor-tab icon (panel.iconPath) where extension.ts creates the board's webview panel, the same way the chat panel sets its tab icon.

## Triage rationale

Mechanical asset wiring with the design already chosen by the user: two new SVG files in vscode-plugin/media, one icon field on the insrc.delivery.openBoard command in vscode-plugin/package.json, and one panel.iconPath assignment in the createWebviewPanel lambda passed to registerDeliveryBoard in vscode-plugin/src/extension.ts, mirroring the chat panel's existing iconPath at extension.ts:521. No new contract or design choice. Grounding is a text lookup (grep of package.json and extension.ts), which is enough because the answer is where two existing patterns live.

## Summary

Added the Delivery board icon pair (insrc spiral at 60% behind a four-node progress path) as media/insrc-delivery-icon.svg and -dark.svg; it is the insrc.delivery.openBoard command icon and, through registerDeliveryBoard's new tabIcon dep, the board's editor-tab icon. Behaviour-tested over a fake panel; board-icon.test.ts pins the assets and wiring.

## Tasks validated

- ✓ `S001`

**Tests:** [TESTS.md](TESTS.md) — what the gate ran for each Task, and what each test case did.

## Changes

- `vscode-plugin/media/insrc-delivery-icon-dark.svg` — **insrc-build** (2026-10-11T08:17:49.600Z)
- `vscode-plugin/media/insrc-delivery-icon.svg` — **insrc-build** (2026-10-11T08:17:49.600Z)
- `vscode-plugin/package.json` — **insrc-build** (2026-10-11T08:17:49.600Z)
- `vscode-plugin/src/delivery/__tests__/board-icon.test.ts` — **insrc-build** (2026-10-11T08:17:49.600Z)
- `vscode-plugin/src/delivery/__tests__/board-wiring.test.ts` — **insrc-build** (2026-10-11T08:17:49.600Z)
- `vscode-plugin/src/delivery/board-wiring.ts` — **insrc-build** (2026-10-11T08:17:49.600Z)
- `vscode-plugin/src/extension.ts` — **insrc-build** (2026-10-11T08:17:49.600Z)
