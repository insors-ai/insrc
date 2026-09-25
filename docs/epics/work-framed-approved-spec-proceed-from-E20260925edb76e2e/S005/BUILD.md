# Build (plan-driven) — Story s5

**Standalone:** no  ·  **Epic:** edb76e2e4d41217d  ·  **Commit:** b328955

Implements the approved S005 LLD + PLAN: provider selector + history dropdown + native session resume, consuming existing sc1/sc3/sc4/sc5 (no new contract). Behind flag insrc.chat.enabled.

## Tasks validated

- ✓ `t1` — session-store.ts (sc4 impl): optional `maxSessions` cap in save() (LRU-order + evict oldest non-active ids + blobs; non-positive cap → unbounded); interface-compatible (no shape change)
- ✓ `t2` — chat-panel.ts renderShell: sc1-styled provider-selector (options from providers.available) + history-dropdown inside the one nonce'd script; provider→new-chat, history→open-chat, history-list handler (textContent), session-restored clears+replays + tracks active id
- ✓ `t3` — chat-panel.ts host + extension.ts: open() posts history-list; handleMessage re-posts after new-chat/open-chat + validates provider ∈ available; runTurn sets title-from-first-prompt + re-posts history after done/error; extension.ts wires maxSessions:200; single-in-flight + native-resume unchanged
- ✓ `t4` — node:test suites: session-store (eviction active-safe/no-orphan, unset+non-positive unbounded, title round-trip) + chat-panel (selector/dropdown shell + CSP, history-list on open/after turns, open-chat restore + corrupt drop, provider validation, two-turn native resume, single-in-flight, first-turn-error refresh)

## Validation

- `tsc --noEmit` clean.
- Full vscode-plugin sweep: **353 pass / 0 fail / 2 live-skip**.
- Design review (insrc_review_step on LLD): **PASS**, 0 HIGH / 0 MED / 9 LOW (confirmations).
- Opposite-actor cold review: **0 HIGH / 1 MED / 2 LOW**, all fixed here with regression tests:
  - **MED-1** — the `maxSessions` cap was unwired in production (`extension.ts` built the store without it), so "bounded history" was not delivered → wired `maxSessions: 200`.
  - **LOW-1** — a non-positive `maxSessions` would wipe the active session on save → clamped (`<1` degrades to unbounded).
  - **LOW-2** — a first-turn error skipped `postHistory()`, leaving a stale "new chat" dropdown label → re-post history on the error path.
- Code review (CR-edb76e2e4d41217d-s5): **warn**, 0 HIGH / 0 MED / 0 LOW (diff-fallback grounding; coverage judged by the green suite).

## Follow-up

The S004 MED-1 marker restore-fidelity fix (persist `cssClass` on `TranscriptEntry`, sc4) is still OUT of scope — tracked as a new epic story to file after S005 (open question `qb5e33325` resolved 2026-09-26).
