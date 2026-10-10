<!-- insrc:artifact PLAN-7405471c72bd3e88-s1 -->

# Plan: E202610107405471c:S001

## Summary

**Epic:** `defect-delivery-board-shipped-issue-348d4663`
**LLD run:** `wf-1791616689463-hu88u5`
**LLD effective hash:** `78f14a8f5f70...`

Building this Story gives the delivery board the approved mocks' look: their stylesheet, in theme colours, and their screen structure, with the Issues screen grouped by stage like the board screens. The work starts with the Issues data and the stylesheet, then rebuilds the page shell and each screen in turn, and ends with a speed check on the Issues screen and screenshots of every screen beside its mock.

## Contents

1. [Tasks](#1-tasks)
2. [Test-strategy coverage](#2-test-strategy-coverage)
3. [References](#3-references)

## 1. Tasks

| # | Task | Size | Depends on | Tests | Derived from |
| :--- | :--- | :--- | :--- | :--- | :--- |
| 1 | **`t1`** Issues body in stage sections, built by the board screens' section rule | M | — | unit: board-views.test.ts: the Issues body groups issues into stage sections with the board screens' defaults and fold; unit: board-model.test.ts: sectionDefaults and foldOf give the board screens' existing section models | [[c1]] |
| 2 | **`t2`** Port the mocks' stylesheet into BOARD_STYLE | M | — | integration: board-host.test.ts: BOARD_STYLE carries the mocks' product rules with theme colours and no hiding rule; integration: board-host.test.ts: the narrow layout applies the mocks' container rules to the body | [[c2]] [[c6]] |
| 3 | **`t3`** Document shell, footer, breadcrumb and focus rules | M | `t2` | integration: board-host.test.ts: the live region and density control sit in a small footer, and a new list screen focuses its chosen view; integration: board-host.test.ts: the breadcrumb renders the wordmark, crumbs and current place, without the wordmark when narrow | [[c3]] [[c4]] |
| 4 | **`t4`** List screens: filter bar, count line and stage boxes | M | `t1`, `t3` | integration: board-host.test.ts: list screens use the mocks' filter bar, count line and stage boxes, with no heading; integration: board-host.test.ts: Back to a list screen whose opener is gone focuses the chosen view | [[c4]] |
| 5 | **`t5`** Epic board head, Epics rows and the Issues stage boxes | M | `t4` | integration: board-host.test.ts: the epic board and Epics rows follow the mocks: head with meter, rows with completion and attention on one line; integration: board-host.test.ts: the Issues screen shows its issues in collapsible stage boxes | [[c1]] [[c4]] |
| 6 | **`t6`** Story and issue screens, tabs and state panels in the mocks' markup | M | `t3` | integration: board-host.test.ts: story and issue screens follow the mocks: stage pill, section labels, chain rows and the Open what it corrects button; integration: board-host.test.ts: state panels use the mocks' panel and warning styles | [[c4]] |
| 7 | **`t7`** Perf on the Issues screen, full verification and screenshots beside the mocks | S | `t5`, `t6` | smoke: board-perf.test.ts: switching the 500-item board to the Issues screen renders within 150 ms, best of three; smoke: evidence: headless-Chrome screenshots of each screen beside its mock at 1200, 600 and 360 px | [[c5]] [[c6]] |

### 1.1 E202610107405471c:S001:T001 — Issues body in stage sections, built by the board screens' section rule

Lift the section-default rule (defaultOpen, emptyText, hint, attentionCount) and the fold text out of buildBoardViewModel into shared helpers sectionDefaults/foldOf in board-model.ts. Add IssueSectionView to board-protocol.ts and change IssuesBody to { kind, totalsLabel, showAll, sections, fold, emptyPanel }. buildIssueView groups placeable matches into six sections in STAGE_ORDER using the helpers. board-state.ts looks the issue screen's entry up across the sections. The webview's issues renderer iterates the sections as a flat list until t5 rewrites it, so the suite stays green.

**Acceptance checks:**
- buildBoardViewModel produces equal StagesBody models before and after the refactor (existing board-model tests pass unchanged).
- buildIssueView returns six sections in stage order; each matching issue is in exactly one section, its stage's; defaultOpen/emptyText/hint and fold follow the board screens' rule; totals and panels are unchanged.
- The issue screen still finds its entry; the full delivery suite passes after this task, with the webview iterating the sections as a flat list; typecheck is clean.

### 1.2 E202610107405471c:S001:T002 — Port the mocks' stylesheet into BOARD_STYLE

Replace BOARD_STYLE with the mocks' product rules (.appbar to .center, without the gallery chrome) mapped to --vscode-* colours, plus the board's page rules (body min-width 320px, a div.page wrapper as the inline-size container, density custom properties, data-tone pill tones, .stage-pill, the footer). Replace the three hiding rules: list-style:none on the summary, '.seg a' retargeted to '.seg button' with first/last child radii instead of overflow:hidden, and no wordmark hiding rule.

**Acceptance checks:**
- BOARD_STYLE carries the mocks' selectors (.acc, .cards, .row, .issue-row, .seg, .toggle, .search, .count-line, .pill, .stage-pill, .head, .subtabs, .cols, .label, .chain, .warnbox, .item, .between, table.records, .panel) and the 760/480 container rules.
- No colour other than var(--vscode-*) or transparent; no display:none, visibility:hidden, clip, overflow:hidden, height:0 or text-overflow; no '.seg a' selector.
- The minimums hold: body 320px, cards minmax(min(240px,100%),1fr), rows minmax(220px,1fr), cols minmax(340px,1.45fr) minmax(280px,1fr), records 620px in .table-wrap.

### 1.3 E202610107405471c:S001:T003 — Document shell, footer, breadcrumb and focus rules

renderBoardDocument emits div.page > header.appbar (nav#crumbs.crumbs, div.appbar-tools with #status, Read-only, #refresh), #banner, main#main.body, footer.foot (p#announce, the small segmented density control #density-compact/#density-comfortable). The script renders the breadcrumb (span.wordmark left out when narrow, crumb buttons, span.sep, span.here). Focus: a new list screen focuses its chosen view button; a new epic/story/issue screen focuses its h1; a restored screen whose opener is gone falls back to the screen's first focus target; title updates no longer key on h1.screen-title.

**Acceptance checks:**
- Exactly one aria-live region (#announce, in the footer) and one nonce'd script; the CSP is unchanged.
- The breadcrumb renders the wordmark, crumbs, separators and the current place, and leaves the wordmark out when narrow.
- A restored screen with no opener focuses the fallback target and does not throw; density switching still works from the footer.

### 1.4 E202610107405471c:S001:T004 — List screens: filter bar, count line and stage boxes

List screens render with no heading: div.filterbar (nav.seg buttons with aria-current, button.toggle with aria-pressed, input.search), p.count-line with Show all, details.acc stage boxes (data-empty, span.hint.muted, span.pill.count at the right) with div.cards of cards (div.kicker, div.t, div.muted line, div.pills of tone pills), and the fold line.

**Acceptance checks:**
- List screens have no h1; they show the filterbar, count line and acc stage boxes with the count on the right and the muted hint.
- A fresh list screen focuses the chosen view button; Back to a list screen whose opener no longer matches focuses it too.
- Keyboard behaviour holds: arrows and Enter/Space on cards, Left/Right on the view group, Escape for Back.

### 1.5 E202610107405471c:S001:T005 — Epic board head, Epics rows and the Issues stage boxes

Epic board: div.between.head (kicker 'EPIC · id', h1, pills; completion label over div.meter on the right) and a filterbar starting with a ghost '← Epics' button. Epics: div.rows of button.row (kicker, name, muted counts | completion over meter | attention pill) plus the Standalone link. Issues: the same details.acc sections as the board screens, each holding div.rows of button.row.issue-row (kicker, name, muted 'Corrects … · fix story …' | pills), remembering open/closed per trail entry and stage.

**Acceptance checks:**
- The epic board shows the head with the meter and the ghost back in its filterbar; a new epic board focuses its h1.
- Epics rows put the name, completion and attention on one line.
- The Issues screen shows collapsible stage boxes with the board screens' defaults and fold; a section's open state survives a refresh.

### 1.6 E202610107405471c:S001:T006 — Story and issue screens, tabs and state panels in the mocks' markup

Story: ghost back button, div.head (kicker, h1, pills with span.pill.stage-pill first), the conflict as div.warnbox, nav.subtabs of tab buttons, div.cols with div.label headings, details.task rows, ul.checks, div.why, ul.chain rows (b kind | muted id and review | tone pill). Evidence: table.records in div.table-wrap. Linked: div.label headings with div.item rows. Issue: div.between with the ghost back and button.btn 'Open what it corrects →' (or the Unresolved parent pill), div.head with the stage pill, div.cols. State panels: div.panel with h3 and .warnp where needed.

**Acceptance checks:**
- The story screen shows the stage pill first, label headings, chain rows b | muted | pill and the subtabs; Left/Right moves between tabs.
- The issue screen shows the 'Open what it corrects →' button and the stage pill; empty plans and records show the mocks' empty lines.
- Refresh-failed, unavailable and partial panels use .panel.warnp.

### 1.7 E202610107405471c:S001:T007 — Perf on the Issues screen, full verification and screenshots beside the mocks

Extend board-perf.test.ts to switch the 500-item board to the Issues view and assert 150 ms (best of three). Run the full plugin suite and typecheck. Capture every screen beside its mock with headless Chrome at 1200, 600 and 360 px and save them as evidence. Packaging and installing the extension (migration step 4) is a release step after BUILD approval, confirmed with the user, not a build task.

**Acceptance checks:**
- board-perf.test.ts times the Issues switch within 150 ms, alongside the 1 s first screen and 150 ms filter/drill-down.
- The full suite passes apart from the known manifest-catalog baseline failure; typecheck is clean.
- Screenshot pairs (board vs mock) for all-work, epic board, Epics, Issues, story and issue at 1200/600/360 px are saved under the story's evidence folder.

## 2. Test-strategy coverage

| LLD strategy item | Covered by |
| :--- | :--- |
| board-views.ts buildIssueView: six sections in stage order, each issue in its stage's section, defaults/hints/fold as the board screens, panels | `t1` |
| board-model.ts sectionDefaults/foldOf shared by both builders; buildBoardViewModel output unchanged | `t1` |
| board-host.test.ts: list screens (no heading, filterbar with seg/toggle/search, count-line, acc stage boxes with right-hand count and muted hint, cards) | `t4` |
| board-host.test.ts: epic board head (kicker, h1, pills, meter) and ghost back in the filterbar | `t5` |
| board-host.test.ts: Epics rows (row with name, completion over meter, attention pill) and Issues grouped in acc sections of issue rows | `t5` |
| board-host.test.ts: story and issue screens (ghost back, head with stage-pill, warnbox, subtabs, label headings, chain rows b \| muted \| pill, records table, 'Open what it corrects' button) | `t6` |
| board-host.test.ts: document shell (appbar, crumbs with wordmark rendered by the script, footer with the live region and density), focus on new list screens, BOARD_STYLE carries the mocks' rules with no hiding rule | `t2`, `t3` |
| board-host.test.ts: Back to a list screen whose opener no longer matches the filter focuses the chosen view button and does not throw | `t4` |
| board-host.test.ts: the container is a wrapper around main.body, and BOARD_STYLE has no '.seg a' selector | `t2` |
| board-perf.test.ts: extended to switch to the Issues view (set-view issues) on the 500-item board and assert the 150 ms target for that change, alongside the existing 1 s first screen and 150 ms filter/drill-down | `t7` |
| headless-Chrome screenshots of each screen beside its mock at 1200, 600 and 360 px, saved as evidence | `t7` |

## 3. References

- **[[c1]]** `prior-artifact` `LLD s1 contractDetails.buildIssueView + dataModelChanges (IssueSectionView, IssuesBody, section defaults)`
- **[[c2]]** `prior-artifact` `LLD s1 contractDetails.BOARD_STYLE`
- **[[c3]]** `prior-artifact` `LLD s1 contractDetails.renderBoardDocument`
- **[[c4]]** `prior-artifact` `LLD s1 contractDetails.BOARD_WEBVIEW_SCRIPT`
- **[[c5]]** `prior-artifact` `LLD s1 testStrategy`
- **[[c6]]** `prior-artifact` `LLD s1 migration (steps 2 and 4) and docs/plans/delivery-board-screen-mocks.html`
