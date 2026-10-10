<!-- insrc:artifact LLD-7405471c72bd3e88-s1 -->

# LLD: E202610107405471c:S001

## Summary

**Epic:** `defect-delivery-board-shipped-issue-348d4663`
**HLD base run:** `wf-1791616689463-hu88u5`
**HLD effective hash:** `78f14a8f5f70...`

The delivery board takes its look from the approved mocks: their stylesheet becomes the board's, with every colour drawn from the VS Code theme, and each screen is built with the mocks' structure. Stages become bordered boxes with the count at the right, the four list screens lead with their filters, epic rows sit on one line, and story and issue screens use the mocks' section labels, chain rows and buttons. The Issues screen is grouped by stage in the same collapsible boxes as the board screens. The announcement line and density control move to a small footer so they stay available without crowding the screen.

## Contents

1. [HLD context](#1-hld-context)
2. [Contract details](#2-contract-details)
3. [Data model changes](#3-data-model-changes)
4. [Error paths](#4-error-paths)
5. [Test strategy](#5-test-strategy)
6. [Migration](#6-migration)
7. [Alternatives considered](#7-alternatives-considered)
8. [References](#8-references)

## 1. HLD context

**Framework:** Standalone feature — no parent HLD. Design directly against the repo, grounded on the s1 analyze passes. There are no HLD shared contracts to honour.
**Rollout phase:** standalone

## 2. Contract details

**Surface level:** internal

### 2.1 `buildIssueView`

```typescript
function buildIssueView(snapshot: DeliverySnapshot, filter: MatchFilter, labels: DisplayLabels): IssuesBody
```

**Parameters:**
- `filter: MatchFilter` — Scope all, plus the Issues screen's search and attention flag (unchanged).

**Returns:** `IssuesBody` — The issues grouped into six IssueSectionView in STAGE_ORDER, each holding its IssueEntryView rows in snapshot order, with the totals label, showAll, fold and the no-matches or no-issues panel. The flat issues array is replaced by sections.

**Postconditions:**
- Each section's defaultOpen, emptyText and hint follow the same rule as the board screens' StageSectionView (open when it holds issues, except Complete, which starts closed unless Needs attention is on; an empty section is closed with 'nothing at this stage'; a closed section with issues needing attention carries attentionLabel(n)).
- fold.always is true exactly when Needs attention is on and fold.text names the empty stages, as on the board screens.
- Every matching issue appears in exactly one section, the section of its stage; counts and totals are unchanged from today.

### 2.2 `buildBoardViewModel`

```typescript
function buildBoardViewModel(snapshot: DeliverySnapshot, filter: MatchFilter, paging: BoardPaging, labels: DisplayLabels): StagesBody
```

**Parameters:**
- `filter: MatchFilter` — Unchanged.

**Returns:** `StagesBody` — Unchanged output; its section-default and fold rules move into shared helpers (sectionDefaults, foldOf in board-model.ts) that buildIssueView also uses.

**Postconditions:**
- Board screens produce equal models before and after the refactor.

### 2.3 `renderBoardDocument`

```typescript
function renderBoardDocument(nonce: string): string
```

**Parameters:**
- `nonce: string` — Script nonce.

**Returns:** `string` — The same CSP. Shell in the mocks' structure: header.appbar with nav#crumbs.crumbs (the wordmark is rendered by the script as the breadcrumb's first element) and div.appbar-tools (#status, Read-only, #refresh); #banner; main#main.body; then footer.foot holding p#announce (the only aria-live region, muted, small) and the density control as a small segmented group (#density-compact, #density-comfortable).

**Postconditions:**
- Exactly one aria-live region; one nonce'd script; no element is hidden by CSS.

### 2.4 `BOARD_STYLE`

```typescript
const BOARD_STYLE: string
```

**Returns:** `string` — The mocks' product rules (docs/plans/delivery-board-screen-mocks.html, from '.appbar' to '.center', excluding the gallery chrome, .tab and .tabstrip) with the same selectors and values, plus the board's own page rules: body background var(--vscode-editor-background), font from --vscode-font-family/--vscode-font-size, min-width 320px; a div.page wrapper (around header, banner, main.body and footer) as the inline-size container, matching the mocks, where the gallery's .tab is the container and .body sits inside it, so the mocks' '@container (max-width:480px){ .body{padding:12px} }' applies; density custom properties (--gap, --pad, --small) applied to card and section spacing; tone rules keyed on data-tone (success = .ok, warning = .warn, danger = .bad, neutral = the plain pill); .stage-pill for the stage chip; the footer's small muted line and segmented density control. Three mock rules are replaced so nothing is hidden: the details marker is removed with list-style:none on the summary only (no ::-webkit-details-marker{display:none}); the mocks' '.seg a' rules are retargeted to '.seg button' (the board's view group holds buttons, not anchors); the segmented group's rounded ends come from radii on its first and last buttons instead of overflow:hidden; the wordmark is not hidden below 480 px (the script leaves it out of the narrow breadcrumb).

**Postconditions:**
- Only var(--vscode-*) colours (plus transparent); no display:none, visibility:hidden, clip, overflow:hidden, height:0 or text-overflow.
- The minimums stay: body 320px, cards minmax(min(240px,100%),1fr), rows minmax(220px,1fr), cols minmax(340px,1.45fr) minmax(280px,1fr), records table 620px inside .table-wrap{overflow-x:auto}; the two container rules at 760 and 480 px follow the mocks (cols stack; rows drop to two then one column; the search box takes a full line).

### 2.5 `BOARD_WEBVIEW_SCRIPT`

```typescript
const BOARD_WEBVIEW_SCRIPT: string
```

**Returns:** `string` — Renders each screen in the mocks' markup and classes. Breadcrumb: span.wordmark (left out when narrow), crumbs as button links, span.sep '/', span.here for the current place. List screens: no heading; div.filterbar with nav.seg (four buttons, aria-current='page' on the chosen view), button.toggle (aria-pressed; '×' when on), input.search (placeholder from the model); p.count-line (with Show all); then the body. Board screens: details.acc per stage (data-empty when empty; summary = label, span.hint.muted '· nothing at this stage' or '· N needs attention', span.pill.count with the total at the right), div.cards of li.card (div.kicker, div.t, div.muted with the epic line and task summary joined by ' · ', div.pills of tone pills). Epic board: div.between.head (div.kicker 'EPIC · id', h1, div.pills with 'N stories', 'N tasks' and the attention pill; on the right the completion label over div.meter), then div.filterbar with a ghost '← Epics' button, the toggle and the search. Epics: div.rows of button.row (div with kicker, div.name, div.muted counts | div with the completion label over the meter | the attention pill) and the Standalone link. Issues: the same details.acc sections holding div.rows of button.row.issue-row (div with kicker, div.name, div.muted 'Corrects … · fix story …' | div.pills with the badges). Story: a ghost back button, div.head (kicker, h1, div.pills with span.pill.stage-pill first, then the task-summary and badge pills), the conflict as div.warnbox, nav.subtabs of button role=tab, then div.cols with div.label headings (Planned tasks; Why this stage?; Artifact chain), details.task rows, ul.checks, div.why, ul.chain of li (b kind | span.muted record id and review | tone pill). Evidence: table.records in div.table-wrap with Record | Approval | Review | open, the override shown in the Review cell. Linked: div.label headings with div.item rows. Issue: div.between with the ghost back button and button.btn 'Open what it corrects →' (or the Unresolved parent pill), div.head with the stage-pill, then div.cols (Fix stories, records; Why this stage?, chain). State panels: div.panel (h3 title) with .warnp for refresh-failed, unavailable and partial.

**Postconditions:**
- Text only through textContent; only BoardUpMessage envelopes are posted; the same messages as today.
- A new list screen focuses its chosen view button (it has no heading); a new epic, story or issue screen focuses its h1. A restored screen restores scroll and focuses its opener, as today; when the opener is no longer shown, focus falls back to the screen's first focus target: the chosen view button on a list screen, the h1 on the others. Title updates no longer key on h1.screen-title, so no path focuses a missing element.
- Every control keeps its keyboard behaviour: Enter/Space and the arrows on cards and rows, Left/Right on the view group and story tabs, Escape for Back.

## 3. Data model changes

### 3.1 `IssueSectionView (board-protocol.ts)` — new

{ stage: DeliveryStage; label: string; total: number; attentionCount: number; defaultOpen: boolean; emptyText: string | null; hint: string | null; issues: readonly IssueEntryView[] }.

**Call sites:**
- `vscode-plugin/src/delivery/board-views.ts`
- `vscode-plugin/src/delivery/board-host.ts`

### 3.2 `IssuesBody (board-protocol.ts)` — field-modify

Becomes { kind: 'issues'; totalsLabel; showAll: boolean; sections: readonly IssueSectionView[]; fold: { always: boolean; text: string }; emptyPanel }. The flat issues array is removed; the issue screen's entry is looked up across the sections.

```
- issues: IssueEntryView[]
+ showAll, sections: IssueSectionView[], fold
```

**Call sites:**
- `vscode-plugin/src/delivery/board-views.ts`
- `vscode-plugin/src/delivery/board-state.ts`
- `vscode-plugin/src/delivery/board-host.ts`

### 3.3 `section defaults (board-model.ts)` — invariant-change

The open/empty/hint rule and the fold text, today inside buildBoardViewModel, become shared helpers used by both board screens and the Issues screen, so the two group by the same rule.

**Call sites:**
- `vscode-plugin/src/delivery/board-model.ts`
- `vscode-plugin/src/delivery/board-views.ts`

## 4. Error paths

**Error cases**

- **An issue's stage is not one of the six (a newer daemon).** (recoverable)
  - Detection: buildIssueView only takes placeable matches (isPlaceable checks the stage against STAGE_ORDER), so the issue never reaches a section.
  - Response: It is left off the Issues screen, as it is left off the board screens, and the host's once-per-refresh unknown-stage log names it.
  - User impact: The issue is missing from the list, with a log line explaining why; nothing breaks.
- **Building the Issues body throws on a malformed snapshot.** (recoverable)
  - Detection: apply() derives the screen message before keeping state; the throw reaches the message handler or refresh fallback.
  - Response: Unchanged: the previous screen stays and the failure is logged, or the refresh shows as failed over the previous board.
  - User impact: The previous screen stays.
- **A stylesheet rule ported from the mocks would hide content (display:none, overflow:hidden).** (recoverable)
  - Detection: The style test scans BOARD_STYLE for display:none, visibility:hidden, clip, overflow:hidden, height:0 and text-overflow.
  - Response: The test fails the build; the three known cases are ported with non-hiding equivalents.
  - User impact: None in the shipped board.
- **The webview state cannot be read (density).** (recoverable)
  - Detection: savedState() wraps vs.getState in try/catch (unchanged).
  - Response: Comfortable density; the footer control shows it.
  - User impact: Default density.

**Edge cases**

| Input | Expected |
| :--- | :--- |
| Issues screen under Needs attention with issues needing attention in only one stage. | That stage's section opens; the other stages fold into one line, as on the board screens; the totals read 'M of N issues need attention' with Show all. |
| Issues screen with no issues at all. | The no-issues panel replaces the sections; no empty boxes. |
| Issues screen with a search matching nothing. | The no-matches panel with Clear filters replaces the sections. |
| A list screen opened fresh (set-view). | Focus goes to the chosen view button in the segmented group, since list screens have no heading. |
| A narrow pane (<= 480 px). | The breadcrumb shows only the back step and the current place (no wordmark); rows drop to one column; the search box takes a full line; empty stages fold, on the Issues screen too. |
| The reader opens or closes an issue stage section, then a refresh arrives. | The section keeps the reader's choice, as board sections do (remembered per trail entry and stage). |
| A story with no task plan and no records. | Planned tasks says 'No task plan recorded yet.' and Records says 'No records yet.', in the mocks' layout. |

**Invariants to preserve**

- Every screen is built from the host's screen message; navigation and messages are those of ISSUE-348d4663. [[c1]]
- The stage sections follow one rule for defaults, hints and folding, computed in the host. [[c2]]
- The board takes its look from the approved mocks, with colours only from --vscode-* variables. [[c3]]
- No CSS rule hides content (no display:none, visibility:hidden, clip, overflow:hidden, height:0 or text-overflow). [[c4]]
- The webview tests boot the real script on the fake DOM; the perf test's 1 s and 150 ms targets hold. [[c5]]

## 5. Test strategy

**Test framework:** `node:test via tsx (npx tsx --test 'src/**/__tests__/*.test.ts' in vscode-plugin), node:assert/strict; webview behaviour through the fake-DOM harness board-webview-harness.ts booting the real BOARD_WEBVIEW_SCRIPT; visual comparison with headless Chrome`

**Test levels**

- **unit** — The Issues screen's stage sections and the shared section rule.
  - Subjects: `board-views.ts buildIssueView: six sections in stage order, each issue in its stage's section, defaults/hints/fold as the board screens, panels`, `board-model.ts sectionDefaults/foldOf shared by both builders; buildBoardViewModel output unchanged`
- **integration** — The webview builds the mocks' markup and classes on every screen.
  - Subjects: `board-host.test.ts: list screens (no heading, filterbar with seg/toggle/search, count-line, acc stage boxes with right-hand count and muted hint, cards)`, `board-host.test.ts: epic board head (kicker, h1, pills, meter) and ghost back in the filterbar`, `board-host.test.ts: Epics rows (row with name, completion over meter, attention pill) and Issues grouped in acc sections of issue rows`, `board-host.test.ts: story and issue screens (ghost back, head with stage-pill, warnbox, subtabs, label headings, chain rows b | muted | pill, records table, 'Open what it corrects' button)`, `board-host.test.ts: document shell (appbar, crumbs with wordmark rendered by the script, footer with the live region and density), focus on new list screens, BOARD_STYLE carries the mocks' rules with no hiding rule`, `board-host.test.ts: Back to a list screen whose opener no longer matches the filter focuses the chosen view button and does not throw`, `board-host.test.ts: the container is a wrapper around main.body, and BOARD_STYLE has no '.seg a' selector`
  - Fixtures: `board-host.test.ts screensSnapshot/itemsSnapshot fixtures (existing)`
- **smoke** — Performance and the visual comparison.
  - Subjects: `board-perf.test.ts: extended to switch to the Issues view (set-view issues) on the 500-item board and assert the 150 ms target for that change, alongside the existing 1 s first screen and 150 ms filter/drill-down`, `headless-Chrome screenshots of each screen beside its mock at 1200, 600 and 360 px, saved as evidence`

**Acceptance mapping**

| Criterion | Proving tests |
| :--- | :--- |
| `ac1` | `board-host.test.ts: 'list screens use the mocks' filter bar, count line and stage boxes, with no heading'`, `board-host.test.ts: 'BOARD_STYLE carries the mocks' product rules with theme colours and no hiding rule'`, `board-host.test.ts: 'the narrow layout applies the mocks' container rules to the body'` |
| `ac2` | `board-host.test.ts: 'the epic board and Epics rows follow the mocks: head with meter, rows with completion and attention on one line'` |
| `ac3` | `board-host.test.ts: 'story and issue screens follow the mocks: stage pill, section labels, chain rows and the Open what it corrects button'` |
| `ac4` | `board-views.test.ts: 'the Issues body groups issues into stage sections with the board screens' defaults and fold'`, `board-host.test.ts: 'the Issues screen shows its issues in collapsible stage boxes'` |
| `ac5` | `board-host.test.ts: 'the live region and density control sit in a small footer, and a new list screen focuses its chosen view'`, `board-host.test.ts: 'Back to a list screen whose opener is gone focuses the chosen view'` |
| `ac6` | `board-perf.test.ts: 'a 500-item, 1,000-record board renders within one second and each filter change or drill-down within 150 ms, best of three'`, `board-perf.test.ts: 'switching the 500-item board to the Issues screen renders within 150 ms, best of three'` |

## 6. Migration

**State before:** Per s1: BOARD_STYLE is a stylesheet written to the LLD's layout rules, BOARD_WEBVIEW_SCRIPT builds its own markup (h1 on every screen, flat stage sections, stacked epic summaries, h2 headings, chain pill under the kind), the live region and density sit under and in the app bar, and IssuesBody carries one flat issues array.

**State after:** BOARD_STYLE is the mocks' product stylesheet with theme colours and non-hiding replacements; the webview builds the mocks' markup on every screen; IssuesBody carries stage sections built by the same rule as the board screens; the live region and density sit in a small footer.

**Zero downtime:** yes — **Data rewrite:** no

**Steps**

1. Move the section-default and fold rules into shared helpers in board-model.ts; give IssuesBody stage sections and build them in buildIssueView; look the issue screen's entry up across the sections. — ↩ rollbackable
2. Replace BOARD_STYLE with the mocks' product rules, mapped to theme variables, with the three non-hiding replacements. — ↩ rollbackable
3. Rewrite the document shell and the webview script's markup screen by screen to the mocks' structure, including the Issues stage boxes and the footer. — ↩ rollbackable
4. Rewrite the markup and style tests; run the full suite, typecheck and perf test; capture each screen beside its mock at three widths; package and install the extension. — ↩ rollbackable

**Backward compat:** The webview protocol is private to one extension build (host and script ship together), so the IssuesBody change cannot meet an old webview. The command, the delivery client and the daemon read model are unchanged; the webview's saved density keeps its shape.

## 7. Alternatives considered

### 7.1 a1: Port the mocks' stylesheet and class names; issues as stage sections in the body — **CHOSEN**

BOARD_STYLE becomes the mocks' product rules (with non-hiding replacements), the webview builds the mocks' markup and classes, and IssuesBody carries stage sections of issue rows.

Take the mocks' product rules verbatim as the new BOARD_STYLE (app bar, crumbs, buttons, filterbar/seg/toggle/search, count-line, pills with tone and stage-pill, kicker, meter, acc boxes, cards, rows, head, subtabs, cols, label, task, checks, why, chain, warnbox, item, between, records table, panel, the two container rules), keeping the page-level rules the board needs (min-width 320px, density custom properties, tone rules on data-tone). Replace the mocks' three hiding rules with equivalents that hide nothing: list-style:none on the summary (no ::-webkit-details-marker display:none), per-child corner radii on the segmented group instead of overflow:hidden, and the wordmark simply left out of the narrow breadcrumb the script already builds. The webview script emits the mocks' structure and class names screen by screen (no heading on list screens, .between.head on the epic board, ghost back links, .subtabs, .cols with .label headings, chain rows b | muted | pill, .row grids for epics and issues). IssuesBody gains sections: one IssueSectionView per stage with the same defaults as StageSectionView (open, emptyText, hint, attentionCount) and the same fold, holding IssueEntryView rows; the screen renders them in the same .acc boxes as the board screens. The live region and density move into a small footer under the screen.

### 7.2 a2: Restyle the existing markup to look like the mocks; issues grouped in the webview

Keep today's class names and markup, rewrite BOARD_STYLE until it looks like the mocks, and group the flat issue list by stage in the webview script.

Leave BOARD_WEBVIEW_SCRIPT's structure as it is and tune BOARD_STYLE selectors (details.stage, .epic-row, .item-cols, h1.screen-title) to approximate the mocks. Group the issues in the script by reading each entry's stageLabel and building sections client-side; IssuesBody stays a flat list.

**Rejected because:** Cheaper but repeats the root cause: the markup stays unlike the mocks.

### 7.3 a3: Load the mocks' stylesheet file into the webview

Ship the mocks' CSS as a separate asset loaded by the webview, and change only the markup.

Extract the mocks' style block into an asset file served to the webview through a local resource root, and adapt the markup. Group issues in IssuesBody as in a1.

**Rejected because:** Breaks the CSP invariant.

## 8. References

- **[[c1]]** `prior-artifact` `docs/standalone/defect-against-e2-6a131558-issue-b2687832-E20261010348d4663/S001/LLD.md` — "Screens, trail and messages of ISSUE-348d4663"
- **[[c2]]** `code` `vscode-plugin/src/delivery/board-model.ts` — "buildBoardViewModel section defaults and fold"
- **[[c3]]** `doc` `docs/plans/delivery-board-screen-mocks.html` — "the mocks' product stylesheet and markup"
- **[[c4]]** `code` `vscode-plugin/src/delivery/__tests__/board-host.test.ts` — "BOARD_STYLE no-hiding regexes"
- **[[c5]]** `code` `vscode-plugin/src/delivery/__tests__/board-perf.test.ts` — "1 s first screen, 150 ms per change"
- **[[c6]]** `prior-artifact` `docs/standalone/defect-delivery-board-shipped-issue-348d4663-E202610107405471c/ISSUE.md` — "ISSUE-7405471c fix intent"
- **[[c7]]** `step-output` `s1..s8 of this run`

<!-- insrc:review -->

## Review

### ⛔ Review `BLOCK` — design.story (design.story)

**3 do not hold · 0 could not be verified · 5 hold** · template `design-issue` · model `cli-claude:opus` · reviewed 2026-10-10T07:23:43.996Z

Only a premise that does not hold blocks approval. One that could not be verified is listed for the reader and does not block.

#### Does not hold (blocks approval)

| Check item | Severity | Premise | Evidence | Action |
| --- | --- | --- | --- | --- |
| preserved-behaviour | MED | Removing the h1 from list screens keeps the restore-focus behaviour 'as today' ('a restored screen restores scroll and focuses its opener'). | board-host.ts:260-262: `const h=head.querySelectorAll('h1.screen-title')[0]; if(m.restored){...const o=...findKey(bodyEl,'item-'+m.focusItemId)\|\|findKey(bodyEl,'epic-'+m.focusItemId);(o\|\|h).focus();} else{...h.focus();}`. Today a restored screen whose opener is no longer shown (for example, after a refresh the opened item no longer matches the filter) falls back to the h1. The design removes the h1 from the four list screens and only names a new focus target for fresh screens (the chosen view button). It does not name the fallback for a restored list screen with no opener. Built as written, `h` is undefined there, and `(o\|\|h).focus()` throws a TypeError, so the rest of render is skipped. The title-update branch at line 254 also keys on h1.screen-title. [files: vscode-plugin/src/delivery/board-host.ts] | State the restore fallback for list screens (the chosen view button, as for a fresh list screen) in §2.5's postconditions, and add a test: Back to a list screen whose opener no longer matches. |
| preserved-behaviour | MED | Porting the mocks' rules 'with the same selectors and values', with #main as the inline-size container, reproduces the mocks' narrow layouts. | In the mocks the container is the gallery's .tab (line 53 `container-type:inline-size`), and .body is a descendant of it. The design makes #main (which is also `main#main.body`) the container. A container query cannot style the container element itself, so `@container (max-width:480px){ .body{padding:12px} }` (mocks line 160) would never apply. Also, `.seg a{padding:4px 9px}` (line 159) targets anchors, while the design's nav.seg holds four buttons, so a verbatim copy of that rule matches nothing. The narrow layout would then differ from mock 11/360 px. [files: docs/plans/delivery-board-screen-mocks.html] | Make the container a wrapper around main.body (or the body element), or restate the .body padding rule outside the container query. Retarget `.seg a` to `.seg button` in the port. |
| tests | MED | ac6's proving test, the existing perf test, covers the Issues screen, as §5 states ('including the Issues screen'). | board-perf.test.ts:56 is the test the design maps to ac6 ('a 500-item, 1,000-record board renders within one second…'). A search of board-perf.test.ts for 'issues' finds no match, so the test never opens the Issues screen today. The acceptance mapping cites this existing title unchanged, so the new sectioned Issues render would not be timed unless the test is extended. [files: vscode-plugin/src/delivery/__tests__/board-perf.test.ts] | In §5, name the extension explicitly: board-perf.test.ts switches to the Issues view and asserts the 150 ms target. |

#### Could not verify (does not block)

_None._
