<!-- insrc:artifact ISSUE-b2687832a8c75877 -->

# Make the VS Code delivery board match the PRD's UX mocks A–F

## Reproduction

1. In VS Code with insrc-vscode 0.5.12, run "insrc: Open delivery board" on a workspace with epics, stories and issues (this repo: ~1,360 items).
2. Compare each view with the mocks in docs/insrc-delivery-board-prd.html (§04, mocks A–F).

Observed vs expected:
- Chrome: a plain "Delivery board" heading, toggle-button tabs, a raw status line ("Snapshot taken at 2026-10-09T…Z"), a <select> for scope and a checkbox for Needs attention. Expected: an app bar with the insrc wordmark, breadcrumb and a readable freshness line ("Updated just now · Read-only"), underline tabs, and chip filters.
- Badges are 1px outlined boxes, and the success tone sets only the border colour. Expected: tinted tone pills (good, warning, neutral).
- Board: cards show "Story · title" plus the epic. Expected: the compact stable identifier and the task-validation count as well. Columns wrap onto several rows in a medium-width tab. Expected: six columns.
- Mock A (Epics tab): every epic repeats its whole stage board with all its cards, and the epic title cannot be clicked. Expected: one rollup row per epic ("EPIC · HASH" label, title link, story count, "n / N complete" with a progress bar, task count, attention chip), and selecting the epic opens its scoped board.
- Mock B (details): the details pane is added after the whole board, so it opens off-screen. It holds flat text lines ("Stage: …", the reason with IDs in parentheses, "title · Passed"). Expected: stage and task-count chips, expandable task rows with acceptance-check lists and dependency chips, a highlighted "Why this stage?" box, and an artifact chain (DEF/HLD/LLD/PLAN/BUILD) that shows "Not recorded" for a missing record.
- Mock C: a validation conflict is an unstyled paragraph. Expected: a prominent warning box ("Two records disagree") above the tasks.
- Mock E (narrow): group headings carry no count chip, and empty stages are listed as bare headings. Expected: count chips, and empty stages folded into "Other stages · 0 matching".
- Mock F: empty workspace, no matches, refresh failed and partial data each show one line of text. Expected: titled panels with an explanation, a clear-filters or retry action, and an "Inspect affected records" disclosure for partial data.

## Root cause

E2 implemented the PRD's behaviour (stage derivation, gate signals, filters, keyboard, density) but none of its stories turned the PRD's mocks into presentation requirements. The only styling story, S005, limited the stylesheet to the narrow layout, density and the focus ring, and allowed only VS Code theme variables. So BOARD_STYLE in vscode-plugin/src/delivery/board-host.ts is about 20 rules: no app bar, chips, tone pills, rollup rows, details layout or state panels, and no rule at all for classes such as details-conflict.

The webview script (BOARD_WEBVIEW_SCRIPT) builds plain text nodes:
- renderGroup draws each epic as an h2 followed by every stage's cards, with nothing to click.
- renderDetails writes one line per field into an <aside> that renderBoardDocument places after #board.
- The empty, unavailable, failed and partial states go into single #empty, #status and #notice paragraphs.

The view models match this flat rendering. buildEpicRollup (board-views.ts) returns per-epic stage groups of cards rather than rollup counts (task count, attention count). CardView carries no stable identifier or task-validation count. buildItemDetails (board-details.ts) returns evidence only for the records that exist, so the chain cannot show "Not recorded" rows.

The board's tests pin the current stylesheet and DOM (board-host.test.ts asserts the grid rule, the 600px query, the theme-variable-only colours and density), so nothing flagged the gap.

## Fix intent

Bring the board's presentation and the interactions shown in mocks A–F in line with the PRD, within the board module, while keeping what S005 and the earlier stories guaranteed:
- the CSP and textContent-only rendering;
- colours only from VS Code theme variables, with the PRD's tones mapped onto them;
- no content hidden by CSS;
- keyboard, focus return and the single live region;
- both densities;
- the 1 s first-render and 150 ms filter targets.

Concretely, the board should present:
- the app bar with a readable freshness line, underline tabs and chip filters;
- tone pills;
- cards with their compact identifier and task-validation count, laid out in six columns when the tab is wide;
- an Epics tab of rollup rows whose epic opens its scoped board;
- a details view the reader sees on opening: stage and count chips, expandable task rows with their checks and dependencies, a "Why this stage?" highlight, and the full artifact chain with "Not recorded" rows;
- a prominent conflict warning;
- narrow-pane count chips with folded empty stages;
- four distinct state panels with their actions.

Where the view models lack a value the mocks show and the snapshot already carries (rollup counts, identifiers, missing chain kinds), the plugin's models supply it. Values the daemon does not publish (purpose, size, an issue's observed and expected behaviour, recorded feedback) stay out of scope and are left to a separate read-model issue. The tests are updated to pin the new presentation.

## Citations

- **[[c1]]** `doc` `docs/insrc-delivery-board-prd.html` — "These screens expand the proposed experience beyond the board. ... A · Epic portfolio ... B · Story & tasks ... C · Completion conflict ... D · Issue & feedback ... E · Narrow IDE pane ... F · Empty &"
- **[[c2]]** `doc` `docs/insrc-delivery-board-prd.html` — "Cards show type, human title, compact stable identifier, epic context, recorded size when present, and task-validation count."
- **[[c3]]** `doc` `docs/insrc-delivery-board-prd.html` — "List epics with story counts, approved-build completion counts, task counts, and attention counts. Selecting an epic opens its scoped board."
- **[[c4]]** `prior-artifact` `docs/epics/e2-delivery-board-vs-code-goal-E202610086a131558/S005/LLD.md` — "The one <style> uses only VS Code theme variables (--vscode-*). Wide panes lay the board view's six columns out side by side. Below 600 px, a media query stacks them as one list grouped by stage"
- **[[c5]]** `code` `/home/subho/work/dev/insors/insrc/vscode-plugin/src/delivery/board-host.ts` — "renderBoardDocument(nonce: string): string — emits <style>${BOARD_STYLE}</style> ... <div id="board" class="board"></div><aside id="details" aria-label="Item details" hidden></aside>"
- **[[c6]]** `code` `/home/subho/work/dev/insors/insrc/vscode-plugin/src/delivery/board-views.ts` — "buildEpicRollup(snapshot: DeliverySnapshot, selection: BoardSelection, labels: DisplayLabels): EpicRollupViewModel"
- **[[c7]]** `code` `/home/subho/work/dev/insors/insrc/vscode-plugin/src/delivery/board-details.ts` — "buildItemDetails(snapshot, itemId, plan, opened, labels, byId?): ItemDetailsViewModel | null"
- **[[c8]]** `code` `/home/subho/work/dev/insors/insrc/vscode-plugin/src/delivery/__tests__/board-host.test.ts` — "assert.match(BOARD_STYLE, /\.board\{display:grid;/); ... assert.doesNotMatch(BOARD_STYLE, /#[0-9a-fA-F]{3,8}\b|rgb\(|hsl\(/, 'no literal colour');"
- **[[c9]]** `analyze-bundle` `insrc_analyze_step structural map of vscode-plugin/src/delivery (leaf module, one importer extension.ts; renderers in board-host.ts, view models in board-views.ts / board-details.ts / board-state.ts)`
