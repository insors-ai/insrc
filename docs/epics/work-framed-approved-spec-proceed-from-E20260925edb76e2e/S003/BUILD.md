# Build (plan-driven) — Story s3

**Standalone:** no  ·  **Epic:** edb76e2e4d41217d  ·  **Commit:** 7133b7d

Implements the approved S003 LLD + PLAN: the terminal chat panel (sc3 protocol + sc4 store + host + flag-gated wiring).

## Tasks validated

- ✓ `t1` — session-store.ts (sc4): memento-backed ChatSessionStore + in-memory double (k3, corruption-tolerant)
- ✓ `t2` — protocol.ts (sc3): Envelope + HostToWebview/WebviewToHost unions + DocsArtifactSummary
- ✓ `t3` — chat-panel.ts: createChatPanelHost (incremental turn loop, single-in-flight, dispose/cancel, passthrough, nonce'd CSP shell over sc1)
- ✓ `t4` — extension.ts flag-gated wiring (insrc.chat.enabled, default off) + package.json contributes (command + config)
- ✓ `t5` — node:test suites: host unit + store + shell contract + extension-wiring scan

## Validation

- `tsc --noEmit` clean.
- Full plugin sweep: **331 pass / 0 fail / 2 live-skip** (new S003 tests; 3 pre-existing manifest tests updated for the added command/flag).
- Code review (CR-edb76e2e4d41217d-s3): **pass**, 0 HIGH / 0 MED / 0 LOW.
- Opposite-actor cold review: confirmed security shell / passthrough / k3 store / same-session single-in-flight correct; findings (missing single-in-flight test; cancel-by-wrong-provider; session-switch interleave; unchecked-cast unhandled rejection; errored transcript not persisted; weak dispose/incremental tests) all fixed before completion. Pre-first-event cancel = documented sc5 limitation (LOW).
