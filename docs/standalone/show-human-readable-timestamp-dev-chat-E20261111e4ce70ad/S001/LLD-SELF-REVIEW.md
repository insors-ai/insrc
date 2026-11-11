# Design review record: LLD-e4ce70ad1ae43d31-s1

Review id `review-e4ce70ad-s1-a1` (checkpoint `.insrc/tmp/design-review/review-e4ce70ad-s1-a1.json`).
The daemon reviewer is confirmed broken (ISSUE-738d62b848fd173f), so per the user's
instruction ("there is some issue with the design reviews, use the process and do a
proper self review", 2026-11-11) the mandatory LLD review is done as a controller
self-review — thorough, against the artifact's own criteria and the code, not a
rubber stamp. The 3-round cap applies.

## Round 1: daemon reviewer, changes_requested (17 findings: 3 HIGH / 6 MED / 8 LOW)

| Id | Severity | Finding | Change |
| :--- | :--- | :--- | :--- |
| f1-missing-webview-toviewmodel | HIGH | The webview inline `toViewModel` mirror (render-registry.ts:464-490) was unnamed/unplanned. | Named as an explicit twin in §2.1/§3.1, parity-pinned by render-registry.test.ts:236. |
| ts-live-at-gap | HIGH | Live rows carried no `at` into the webview (user-row post and assistant-delta render path). | User-row post chat-panel.ts:2898-2905 carries `at`; webview consume :2677 builds the entry with it; delta branch stamps `at=new Date().toISOString()` at render time (:155-157 host / :480 webview). |
| ux1-layout-not-row | HIGH | The UX mock showed a two-line widget. | Mock rebuilt as two horizontal ColumnSets — ONE line per role, label keeps its end, time at the opposite end of the same line (user feedback 2026-11-11). |
| f2/f3 | MED | whoRow/msgRow line ranges imprecise. | Corrected to whoRow :406-411, msgRow :416-439 with call site :419. |
| far-future-date-not-detected | MED | `new Date('9999-…')` parses fine; isNaN alone would render it. | Added the future-window bound `d.getTime() <= Date.now()+60_000`; verified 9999-12-31 exceeds it. |
| live-assistant-at-source-unsupported | MED | TurnEvent assistant-delta has no `at` (stream-events.ts:31). | Explicitly handled: render-time stamp in the delta branch, proven by a NAMED live-row test. |
| ux2-no-font-size-contrast | MED | Mock showed no smaller/dimmer time. | Timestamp TextBlock is `size:'small'` + `isSubtle:true`; CSS `.insrc-when{font-size:10px;opacity:.65;…}` vs `.insrc-who` 11px. |
| migration-scope-omits-live-path-gap | MED | Migration said "render-only" but omitted the live-path stamp/post changes. | Migration step 2 names the full edit set: both mirrors + live post/consume sites + whoRow + CSS rule. |
| f4, f5, alignment-citation, cite-c3/c5/c6, ts-fixture-mischaracterized, triage-rationale-mismatch | LOW (8) | Label literal 'claude'; CSS location is RENDER_REGISTRY_STYLE not chat-panel; alignment rule is chat-panel.ts:2376 (transcript-pager.ts:79 only detects the class); orphan/imprecise citation ranges; `label()` is a local helper at :1219 not a shared fixture; meta.triageRationale described a2 while the body chose a1. | All corrected in the LLD; triage rationale annotated "[LLD note: … chosenAlternative is a1 … body is authoritative]". |

All 17 were fixed in one revision pass; the user's mock feedback (single line,
`<3-letter weekday>, dd/MM HH:mm` e.g. `Wed, 11/11 04:18`, not toLocaleTimeString)
was applied to the LLD md + JSON + regenerated ux-mock.html afterwards.

## Round 2: daemon correction attempt, paused (technical — the known defect)

Attempt 2 completed 8/9 chunks (scope-summary passed and explicitly confirmed the
triage-rationale LOW resolved); the final-consistency chunk failed 4 dispatches with
`invalid_output` — the daemon model's impact output never carried the prior finding
origins (`src/workflow/review/design-review/results.ts:47`), status `paused`,
`requiresUserInput:true`, `technical_retry_exhausted`. Not a verdict; no findings from
that chunk. This is the ISSUE-738d62b848fd173f recurrence, which is why this record
exists.

## Round 3: controller self-review, passed

Checked against the code and real data (2026-11-11):

- **Every TranscriptEntry variant carries `readonly at: string`** — verified in
  `vscode-plugin/src/chat/session-store.ts:31-103` (user/assistant/marker, tool-result,
  permission-outcome, selection-outcome, diff all have `at`). Render-only claim holds:
  no field is added, removed, or reformatted; a2 (`ts?`) correctly rejected as duplication.
- **Dual toViewModel mirrors exist and are parity-pinned** — host
  `render-registry.ts:116-194` (persisted branches :118-153, event branches
  :155-193 incl. the assistant-delta branch :155-157) and the webview inline copy
  string at :464-490 (delta branch :480); parity test at render-registry.test.ts:236
  (`parity: eval(webview toViewModel) equals host toViewModel …`) with samples covering
  user/assistant rows carrying `at`.
- **TurnEvent assistant-delta really has no `at`** — stream-events.ts:31
  `{ kind:'assistant-delta'; turnId; text }`. The render-time `at=now()` stamp in the
  delta branch is the right call; the LLD names a live-row test proving it.
- **Live paths verified** — user-row post chat-panel.ts:2898-2905 (`post({type:'user-row',
  text, key, rowIndex, attachments?})`, persisted row created at :2889 with `at: now()`);
  webview consume at :2677 `reg.toViewModel({role:'user',text:m.text,attachments:m.attachments})`;
  live turn-event render at :2659 `var vm=reg.toViewModel(ev);…reg.renderRow(vm)` inside
  :2651-2663; durable assistant row at :3178 (`rowForEvent`, `{role:'assistant',…,at:now()}`)
  is persistence-only, correctly excluded from the render scope.
- **whoRow/msgRow** — whoRow at render-registry.ts:406-411 (`function whoRow(role,glyph,label)`,
  user appends label-then-glyph, assistant glyph-then-label), called from msgRow
  :416-439 at :419 (`whoRow('user','❯','you')` / `whoRow('assistant','◆','claude')` —
  label literal confirmed `'claude'`). The single-line opposite-end placement is
  consistent with the row alignment: `.insrc-msg--user{align-items:flex-end;}` at
  chat-panel.ts:2376 and `transcript-pager.ts:79` only DETECTS `insrc-msg--user`.
- **CSS location correct** — `.insrc-who{font-size:11px;…}` at chat-panel.ts:2374, but the
  shared styles live in `RENDER_REGISTRY_STYLE` (render-registry.ts:202-315) which
  chat-panel.ts injects at :2368 — so `.insrc-when{font-size:10px;opacity:.65;margin:0 6px;align-self:center;}`
  correctly belongs inside that constant, 10px < 11px giving the smaller-font contrast.
- **Test harness** — makeRegistry()/appended/line at render-registry.test.ts:75-89,
  findByClass :92; `label()` is a one-off local inside a diff-widget test (:1219), not a
  shared fixture — the LLD states this correctly; transcript-pager.test.ts builds
  `restored(...)` views (:198+).
- **UX companion is real and current** — `uxDefinition` (AdaptiveCard 1.5) validates;
  body = two ColumnSets (user: auto-column time `Wed, 11/11 04:18` small+subtle + stretch
  column `you ❯` bolder; assistant: stretch `◆ claude` bolder + auto time), one note
  TextBlock; regenerated ux-mock.html contains 4 `ux-columnset` blocks, both
  `Wed, 11/11 04:18` timestamps, `ux-size-small` and `ux-bolder` classes. The example
  date is a real Wednesday (2026-11-11 → `Wed, 11/11 04:18`), matching the requested
  `<3-letter weekday>, dd/MM HH:mm` format.
- **Error paths hold** — missing/invalid `at` → `isNaN(d.getTime())` → no span; far-future
  `at` (9999) parses fine but fails `d.getTime() <= Date.now()+60_000` → no span (verified
  numerically). Non-message rows never call whoRow, so they can never get a span.
- **Citations traceable** — 23 citations; every code citation above re-verified at its
  stated lines this round. meta.standalone=true, chosenAlternative='a1', one ux-mock
  companion, triage-rationale note present.

No open MED or HIGH findings.

Advice for the build (LOW, not blocking): in the whoRow span, set `title` to the full
ISO `at` so the exact time is hoverable while the visible text stays the short format;
and pin the formatter's weekday names to the English 3-letter set explicitly (Sun..Sat)
rather than relying on locale defaults, since the panel runs in the webview's locale.
