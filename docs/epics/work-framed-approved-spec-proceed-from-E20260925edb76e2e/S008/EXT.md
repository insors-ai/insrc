<!-- insrc:artifact EXT-edb76e2e4d41217d-s8 -->

# Extend: work-framed-approved-spec-proceed-from — Persist marker style so restored chats keep their glyph + tone

> **Extends Epic `work-framed-approved-spec-proceed-from`** — this builds on existing docs + code; no new Epic was created.

**Scope:** S   ·   **New Story:** `s8`

Extends Epic `work-framed-approved-spec-proceed-from` (edb76e2e4d41217d) — builds on the shipped sc4 store (session-store.ts), S004 markers (markers.ts) and the S003 chat-panel restore path; adds ONE small story that amends sc4 (TranscriptEntry gains an optional cssClass) so restored chats reproduce each marker's glyph + tone. No new Epic.

## Added Story

### s8: Persist marker style so restored chats keep their glyph + tone

**User value:** As a developer, when I reopen a past chat from the history dropdown, its tool-call / edit / done / error markers show with the same terminal glyph and phosphor colour as the live turn — so a restored transcript reads exactly like the live one and markers stay distinguishable from assistant text.

**Acceptance criteria:**
- **ac1:** Given a chat whose transcript contains marker rows (tool-call / file-edit / done / error), when the chat is restored from the history dropdown, then each marker row renders with its sc1 glyph + phosphor tone (the insrc-term__marker--* class), not plain text.
- **ac2:** Given a marker row is written during a live turn, when it is persisted to the extension-local transcript (k3), then the row also stores the sc1 cssClass computed by markerFor, so the style survives a reload.
- **ac3:** Given an older stored chat whose marker rows predate this change (no cssClass field), when it is restored, then it renders without error — those rows fall back to plain text — with no data migration required.

## Next

Proposed HLD amendment `AMD-edb76e2e4d41217d-2` (pending approval — it adds the new Story's boundary).

Approve the HLD amendment (`AMD-edb76e2e4d41217d-2`) and the updated Epic, then run `design.story` for the new Story `s8` to produce its LLD.

```
insrc_workflow_step phase=start workflow=design.story params={"epicHash":"edb76e2e4d41217d","storyId":"s8"}
```
