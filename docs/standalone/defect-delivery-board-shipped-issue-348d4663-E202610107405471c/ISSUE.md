<!-- insrc:artifact ISSUE-7405471c72bd3e88 -->

# Style the delivery board's screens as the approved mocks, and group Issues by stage

## Reproduction

1. Install insrc-vscode 0.5.13 (built from af68be3e), reload the window and run "insrc: Open delivery board".
2. Compare each screen with the approved mocks in docs/plans/delivery-board-screen-mocks.html at the same pane width.

Observed:
- Stages are flat sections divided by a top border; the count sits next to the label and a closed Complete shows its hint as a yellow pill. A large focused title ("All work", "Epics", …) heads every screen, and the search box follows the attention chip on the left.
- Epics rows stack the counts, completion label, meter and attention pill in one column beside the title.
- On a story or issue screen the section headings are ordinary h2 text, the stage chip looks like every other chip, chain rows stack the pill and the record id under the kind, and "Open what it corrects →" is a link under the chips.
- The live announcement ("Board refreshed: …", "Opened: …") shows as a line of text under the app bar, and density is two full-size Compact/Comfortable buttons.
- The Issues screen is one flat list in stage order, with no stage sections.

Expected (mocks 1, 2, 3, 5, 7 and 11):
- Each stage is its own bordered, rounded box whose summary carries the label on the left and the count chip at the right, with "· nothing at this stage" or "· N needs attention" as muted text.
- The four list screens have no large title; the filter bar sits under the app bar with the search box at the right. An epic's board opens with a kicker, a large title, count and attention chips, and its completion meter at the top right.
- Epics rows run on one line: link-coloured title with its counts below, then the completion label over the meter, then the attention pill at the far right.
- Story and issue screens use small uppercase section labels, a highlighted stage chip, chain rows laid out as kind | description | pill at the right, and "Open what it corrects →" as a button at the top right.
- The announcement line and the density control are visible but unobtrusive.
- Issues are grouped by stage in the same collapsible sections as the board screens.

## Root cause

The approved mocks were used as a layout and behaviour reference but not as a styling reference.

- ISSUE-348d4663's t6 wrote BOARD_STYLE in vscode-plugin/src/delivery/board-host.ts from scratch to the LLD's layout rules (minimum widths, container queries, accordions). It did not port the mocks' own stylesheet: the .acc/.acc>summary stage boxes, .filterbar/.seg/.search, .head, .row, .label, .chain and .warnbox rules in docs/plans/delivery-board-screen-mocks.html.
- BOARD_WEBVIEW_SCRIPT in the same file builds its own markup and class names (details.stage with a flat summary, an h1.screen-title on every screen, .epic-row with a stacked .epic-summary, h2 section headings, chain rows with the pill under the kind). Its structure does not follow the mocks' markup, so even the right stylesheet would not produce the mocks' look.
- renderBoardDocument keeps #announce as a visible paragraph under the app bar, and the density group as two full buttons; neither appears in the mocks.
- The flat Issues list was a deliberate choice in ISSUE-348d4663's LLD (open question q1099e950, resolved "keep stage-sorted list"). buildIssueView in board-views.ts returns IssuesBody with a single issues array, so the screen has no stage sections to render. The reader now asks for issues grouped by stage, reversing that choice.

The tests pin today's markup and the flat list (board-host.test.ts, board-views.test.ts), so they passed while the look departed from the mocks.

## Fix intent

Make every screen of the delivery board look like its approved mock, and group the Issues screen by stage, within vscode-plugin/src/delivery:
- port the mocks' stylesheet into BOARD_STYLE, mapping its colours onto --vscode-* theme variables, and align the webview script's markup and classes to the mocks, screen by screen;
- give the Issues screen the same collapsible stage sections as the board screens, holding the issue rows, with the same open/closed defaults;
- keep the live announcement region and the density control visible but unobtrusive, as the mocks place them;
- compare each screen with its mock in headless-Chrome screenshots at 1200, 600 and 360 px.

What stays: the screens, navigation and messages from ISSUE-348d4663; the CSP; text-only rendering; theme colours only; no CSS hiding rules; keyboard and focus behaviour; the single live region; both densities; the 1 s first-render and 150 ms filter targets; the daemon read model. Badge wording is out of scope.

## Citations

- **[[c1]]** `doc` `docs/plans/delivery-board-screen-mocks.html` — "Approved mocks, screens 1-14, with their stylesheet (.acc, .filterbar, .seg, .head, .row, .label, .chain, .warnbox)"
- **[[c2]]** `code` `vscode-plugin/src/delivery/board-host.ts` — "BOARD_STYLE, BOARD_WEBVIEW_SCRIPT and renderBoardDocument (#announce paragraph, density buttons)"
- **[[c3]]** `code` `vscode-plugin/src/delivery/board-views.ts` — "buildIssueView returns IssuesBody with one issues array in stage order"
- **[[c4]]** `code` `vscode-plugin/src/delivery/board-protocol.ts` — "IssuesBody { kind: 'issues'; totalsLabel; issues; emptyPanel }"
- **[[c5]]** `prior-artifact` `docs/standalone/defect-against-e2-6a131558-issue-b2687832-E20261010348d4663/S001/LLD.md` — "Open question q1099e950: The Issues view is a list sorted by stage, not a stage-grouped issue board; resolved: keep stage-sorted list"
- **[[c6]]** `stakeholder` `user, 2026-10-10` — "the styling seems to be completely different compared to the approved mocks … also issues aren't grouped by state"
- **[[c7]]** `code` `vscode-plugin/src/delivery/__tests__/board-host.test.ts` — "tests pin today's markup and the flat Issues list"
