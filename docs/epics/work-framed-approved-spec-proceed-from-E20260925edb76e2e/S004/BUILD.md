# Build (plan-driven) — Story s4

**Standalone:** no  ·  **Epic:** edb76e2e4d41217d  ·  **Commit:** 70d1727

Implements the approved S004 LLD + PLAN: per-turn lifecycle markers rendered as sc1-styled terminal lines in the S003 chat panel (passthrough, k8).

## Tasks validated

- ✓ `t1` — markers.ts (new, pure, vscode-free): MarkerLine + markerFor (total over the sc2 union, null for assistant-delta/unknown) + markerWebviewSource; both derive cssClass from one MARKER_CLASS table (single source, no host↔webview drift)
- ✓ `t2` — chat-panel.ts webview: widened line(text, markerClass?) + embedded markerWebviewSource() inside the one nonce'd script; non-delta fall-through routes through the mapper (sc1 glyph+tone, not the bare [kind]); restore replay unchanged
- ✓ `t3` — chat-panel.ts host appendEvent: marker labels single-sourced via markerFor; tool-call/file-edit/done/error persist; status is transient (live-only, not persisted); assistant-delta → role:'assistant'
- ✓ `t4` — node:test suites: markers.test.ts (markerFor totality + mcp enrichment + host↔webview parity via eval + CSP-safe scan); chat-panel.test.ts (shell marker-routing + integration turn persists durable markers, status transient)

## Validation

- `tsc --noEmit` clean.
- Chat sweep: **77 pass / 2 live-skip**; full plugin sweep: **340 pass / 0 fail / 2 live-skip**.
- Design review (insrc_review_step on LLD): **PASS**, 0 HIGH / 0 MED / 8 LOW (all confirmations).
- Opposite-actor cold review: **PASS**, 0 HIGH / 2 MED. MED-2 (persisting transient status ticks → ledger/restore bloat) **fixed** here (status is now live-only). MED-1 (restored markers lose per-kind tone + text prefix → indistinguishable from assistant text) deferred to **S005** — the proper fix (persist cssClass on TranscriptEntry, sc4-owned, or a base marker CSS, sc1-owned) is outside S004's boundary; the LLD accepted the reduced-restore-styling con.
- Code review (CR-edb76e2e4d41217d-s4): **warn**, 0 HIGH / 0 MED / 1 LOW (the deferred MED-1 restore residual, advisory).

## Follow-up (S005)

Persist a marker's cssClass on the transcript row (sc4) so the restore render reproduces the per-kind glyph/tone (or add a base marker CSS in sc1). S005 owns session restore/resume + the sc4 index.
