# Build (LLD-driven) — Story s8

**Standalone:** no  ·  **Epic:** edb76e2e4d41217d  ·  **Commit:** c55210e

Implements the approved S008 LLD: persist a marker row's sc1 `cssClass` on the sc4 `TranscriptEntry` and replay it on restore, so a reopened chat reproduces each marker's glyph + phosphor tone (the S004 MED-1 restore-fidelity regression). Consumes sc1/sc2/sc3/sc4 — no new contract; additive `sharedContract.fieldAdd` on sc4. Triage sized this `small` (no plan). Behind flag `insrc.chat.enabled`.

## Tasks validated

- ✓ `t1` — session-store.ts (sc4): add optional `readonly cssClass?: string` to `TranscriptEntry` (additive; memento round-trip + `isSession()` unchanged — no per-row check, so old sessions validate with no migration)
- ✓ `t2` — chat-panel.ts `appendEvent`: persist `cssClass: marker.cssClass` on the `role:'marker'` row (assistant-delta/status/unmapped paths unchanged)
- ✓ `t3` — chat-panel.ts webview session-restored replay: `line(x.text, x.cssClass)` instead of `line(x.text)`; rows without a class (old data, user/assistant) render as plain text. Rides the existing sc3 `session-restored` payload (no protocol change); markers.ts + design-tokens.ts untouched
- ✓ `t4` — node:test suites: session-store (cssClass round-trip; legacy no-cssClass session validates + restores as plain text; user/assistant rows carry none) + chat-panel (persist `cssClass===markerFor(ev).cssClass`; open-chat restore posts the class + legacy plain-text; shell replays `line(x.text,x.cssClass)` with CSP/one-script/no-innerHTML/no-remote intact)

## Validation

- `tsc --noEmit` clean.
- Chat suites (session-store + chat-panel): **38 pass / 0 fail**.
- Design review (insrc_review_step on LLD): **PASS**, 0 HIGH / 0 MED / 8 LOW (confirmations; line anchors verified against real source).
- Opposite-actor cold review: **CLEAN** — 0 HIGH / 0 MED / 0 LOW. All three acceptance criteria (ac1 restored glyph+tone, ac2 live persist, ac3 legacy plain-text no-migration) met and test-covered; XSS-safe (`cssClass` sourced only from `markerFor`'s frozen `MARKER_CLASS`, applied via `className`).
- Code review (CR-edb76e2e4d41217d-s8): **warn**, 0 HIGH / 0 MED / 4 LOW (positive observations, advisory; diff-fallback grounding — coverage judged by the green suite).

## Notes

- Includes the sc4 restore-fidelity UX mock at `followups/marker-restore-mock.html` (reviewed + approved before the build).
- Live render path unchanged, so restored == live for durable markers; transient `status` ticks remain live-only (the S004 MED-2 decision), out of S008's scope.
