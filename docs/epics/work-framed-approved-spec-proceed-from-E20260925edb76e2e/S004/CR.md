<!-- insrc:artifact CR-edb76e2e4d41217d-s4 -->

# Code review: edb76e2e4d41217d:s4

⚠️ **WARN** — HIGH 0 · MED 0 · LOW 1 · model `client`

**Changed files:** 2

## adherence — 0 finding(s)

_No findings._

## conventions — 0 finding(s)

_No findings._

## coverage — 0 finding(s)

_No findings._

## quality — 1 finding(s)

| Severity | Location | Message |
| --- | --- | --- |
| LOW | vscode-plugin/src/chat/chat-panel.ts:94 | Restore render draws persisted role:'marker' rows via line(x.text) with no cssClass, so restored markers show only their (now bare, un-prefixed) label and are not visually distinguished from assistant text after a reload. The proper fix (persist cssClass on TranscriptEntry, sc4-owned, or a base marker CSS, sc1-owned) is out of S004's boundary; the LLD accepted the reduced-restore-styling con and this is deferred to S005 (owns session restore/resume + sc4). Live rendering is unaffected (full glyph+tone). |

