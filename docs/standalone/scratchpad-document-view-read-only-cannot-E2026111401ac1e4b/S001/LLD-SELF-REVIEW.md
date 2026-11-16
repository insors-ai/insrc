# LLD-SELF-REVIEW — LLD-01ac1e4b6a6c9c2f-s1 (round 1 of current cycle)

Daemon-side design review is broken (ISSUE-738d62b8; further technical failures this
cycle: reviewId `review-lld-01ac1e4b6a6c9c2f-s1` attempt 4 fenced on a stale lease from
a dead daemon instance; fresh reviewId `...-r5` planning unit exhausted its 3 native
retries with `invalid_output` — `/body/companions` and `/body/chosenAlternative`
"lacks matching substantive coverage", then "Unknown/duplicate selectors in
store-update"). Per the user-approved fallback (2026-11-10/11), the controller performs
a proper self-review against the artifact's own acceptance criteria — not a rubber
stamp. Source-verified on 2026-11-14 against `vscode-plugin/src/`.

## Findings (round 1) and their resolution

| # | Severity | Finding | Resolution |
|---|----------|---------|------------|
| 1 | HIGH | No document-panel→host seam: `scratch-save` posted on the document webview's raw channel would never reach `createScratchHost.onMessage`; the chat-channel `SCRATCH_INTENT_TYPES` interception (extension.ts:790) only sees the CHAT panel's messages. The document panel's `onMessage` (scratch-panels.ts:381-408) handled only send-to-chat + scratch-ready. | FIXED in canonical JSON + LLD.md: new `ScratchPanelsDeps.onScratchSave` seam, wired in extension.ts exactly like `onSendToChat` (extension.ts:1026); route added to `onMessage` but NOT to `SCRATCH_INTENT_TYPES`. |
| 2 | MED | LLD put `scratch-save`/`scratch-saved` into the chat-channel `protocol.ts` unions — wrong channel; verified protocol.ts:390-448 unions carry neither `scratch-content`/`scratch-ready` nor save messages, and adding them would break the compile-time union/array equality assertion. | FIXED: new document-channel unions `ScratchDocWebviewToHost`/`ScratchDocHostToWebview` + `SCRATCH_DOC_*_TYPES` arrays in scratch-panels.ts; protocol.ts untouched. |
| 3 | MED | gen missing from the reply / LLD.md↔JSON drift on gen guard and `replySaved`. | FIXED: `gen: number` carried on BOTH `scratch-save` and `scratch-saved`; `documentBootstrap(gen, id)`; `ScratchPanels.replySaved(gen, msg)`; LLD.md re-synced (final grep clean). |
| 4 | MED | `scratch-host.test.ts` referenced as existing — it does not exist yet. | FIXED: LLD.md/JSON now mark it "(NEW in this change)". |
| 5 | LOW | `documentBootstrap` called without id. | FIXED: `documentBootstrap(gen, id)`. |
| 6 | LOW | "atomic" overstatement for the publish step. | FIXED: wording is now "no partial content exposed; temp write + unlink/link no-clobber publish, never rename (verified scratch-store.ts:11,47,244-258)". |

## Verification evidence (source, 2026-11-14)

- `chat/protocol.ts:390-448` — chat-channel `HOST_TO_WEBVIEW_TYPES`/`WEBVIEW_TO_HOST_TYPES` contain no scratch doc/save messages; union/array equality assertions at :450+ describe only the chat channel. LLD claim correct.
- `chat/scratch-store.ts:11,47,244-258` — publication is `link(temp, final)` + `unlink(temp)` ONLY, "never rename"; temp `.tmp-${pid}-${random}` never `*.md`. `updateScratch` does not exist yet (correct — this story adds it).
- `extension.ts:790` — `SCRATCH_INTENT_TYPES.has(p.type)` gate on the chat panel only; `:1015-1039` — `createScratchPanels({... onSendToChat: (text) => scratchHost.onMessage({type:'send-to-chat', text})})` and `createScratchHost(...)`; the new `onScratchSave` seam slots beside `onSendToChat`.
- `panels/scratch-panels.ts:146-148` — `<pre id="insrc-scratchdoc">` (the read-only root cause); `:164-205` `documentBootstrap(gen)` single-arg today (LLD adds `id`); `:175,200` raw `{v:1,payload}` scratch-ready / send-to-chat posts; `:381-408` document-panel `onMessage` (send-to-chat + scratch-ready only — the gap finding #1); `:364-455` `openDocument` with generation guard `:433` and pendingContent replay `:440-441`.
- `chat/scratch-host.ts:19-26,91-169` — six `SCRATCH_INTENT_TYPES`, per-case string validation; the `scratch-save` case is added here without joining the chat set.
- Canonical JSON `.insrc/artifacts/LLD-01ac1e4b6a6c9c2f-s1.json` validates; rendered `S001/LLD.md` greps clean for stale `atomic`/old-seam wording.
- Companions exist on disk: `S001/ux-mock.html`, `S001/sequence-diagram.html` (body.companions matches); `chosenAlternative: "a1"` with a1–a4 in `alternativesConsidered`.

## Verdict

changes_requested → resolved in-artifact: all six findings fixed in the canonical JSON
and the rendered doc before this record was written; re-verification above found no new
HIGH/MED. Remaining known limits: the daemon reviewer never produced a content verdict
this cycle (technical failures only), so this self-review is the round-1 evidence;
approval should cite this record via `overrideReview`.
