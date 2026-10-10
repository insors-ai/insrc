<!-- insrc:artifact ISSUE-348d4663a4bc17af -->

# Rework the delivery board into the PRD's screens with breadcrumb navigation

## Reproduction

1. In VS Code with insrc-vscode 0.5.12 (built from fc32bf47), reload the window and run "insrc: Open delivery board" on this repo.
2. Click any story card.

Observed:
- The story's details open as a pane beside the board (wide) or above it (narrow), and the whole board stays on screen under it, listing stories and issues that have nothing to do with that story's epic. There is no breadcrumb and no Back.
- Switching tab, changing scope, searching or toggling Needs attention leaves the story's details open, even when the story is no longer in what the board shows.
- Every epic in the workspace appears as its own scope chip in the toolbar (30+ chips on this repo).
- The six stages are side-by-side columns; in a narrow pane they stack, and no stage can be collapsed.

Expected (PRD mocks A–F, as drawn in the approved screen mocks docs/plans/delivery-board-screen-mocks.html):
- Separate screens, each holding one context, with a breadcrumb and Back: All work, the Epics portfolio, one epic's board, Standalone, the Issues list, a story screen (Overview & tasks, Workflow evidence, Linked work) and an issue screen.
- Exactly five filters: All work, Epics, Standalone and Issues as one single-choice control, and Needs attention as a toggle on top of any of them. An epic is chosen on the Epics screen, never as a chip.
- Stages as vertical collapsible sections: non-empty ones open, empty ones closed but listed, Complete closed with an attention hint, and empty stages folded into "Other stages · 0 matching" under Needs attention and in narrow panes.
- Opening a card replaces the screen with that item's own screen; changing the view, scope or epic leaves it; Back returns to the previous screen with its filters and scroll kept.
- Layouts keep minimum widths and follow the board's own width, so nothing becomes jumbled in a narrow pane.

## Root cause

Both E2 and ISSUE-b2687832 implemented a single composite page, not the PRD's screens. The PRD's §04 allowed "a detail panel above the board" and the earlier designs took that literally, so the state was never given a notion of a screen or of where the reader came from.

In the code:
- BoardSelection (board-state.ts) holds one view, one scope, the search, the attention flag, the selectedItemId and the density. There is no screen, no breadcrumb and no history; the details are simply whatever selectedItemId names.
- reduceBoardState changes that selection field by field. The host's handler in createDeliveryBoardHost (board-host.ts) keeps selectedItemId across set-view, set-scope, set-search, set-attention and clear-filters; only close-details, Escape, or a refresh that removes the item clears it. So the details outlive every context change.
- The document renderBoardDocument builds (board-host.ts) has one layout region holding the details aside and the board together, and the webview script renders both at once, so opening an item adds a pane instead of changing the screen.
- The script's renderScope builds one chip per epic in the board's scopeOptions, which is why every epic becomes a chip.
- BOARD_STYLE lays the six stages out as grid columns, and the E2 no-hiding rule ruled out collapsing them.
- The up-message contract (parseBoardUpMessage in board-protocol.ts) has no message for navigating to a screen or going back, and createDetailsMemory (details-memory.ts) holds the selected item's reads for as long as the selection lasts.

The tests pin this model: about 66 view and details lines in board-host.test.ts, plus the protocol, views, state and wiring tests.

## Fix intent

Present the delivery board as the PRD's screens, as drawn in docs/plans/delivery-board-screen-mocks.html (screens 1–14), within the board module:
- each screen holds one context and carries a breadcrumb and Back;
- the five filters only (four views and the Needs attention toggle), with an epic chosen from the Epics screen;
- stages as vertical collapsible sections with the default open/closed rules in the mocks;
- opening a card shows the item's own screen (story with its three tabs, or issue), nothing else; changing the view, scope or epic leaves it; Back restores the previous screen's filters and scroll;
- the four state situations in the places the mocks give them;
- minimum widths, with layouts that follow the board's own width.

What stays: the daemon read model and the delivery client are unchanged; the CSP, text-only rendering, theme-only colours, keyboard and focus behaviour, the single live region, both densities and the 1 s first-render and 150 ms filter targets all hold. Parts that need ISSUE-7224d0d4's read-model fields (purpose, size, an issue's observed and expected behaviour, recorded feedback) stay absent until it lands. The tests are rewritten to pin the screens and navigation.

## Citations

- **[[c1]]** `doc` `docs/plans/delivery-board-screen-mocks.html` — "Mocks for the screen-based rework (screens 1-14: All work, Epics, one epic's board, Standalone, Issues, Needs attention, story overview/evidence/linked, completion conflict, issue, narrow board and st"
- **[[c2]]** `doc` `docs/plans/delivery-board-ux-feedback.md` — "The screen shows more than the current context: opening a story leaves unrelated work on screen."
- **[[c3]]** `doc` `docs/insrc-delivery-board-prd.html` — "Start with the portfolio; drill into evidence. ... Selecting an epic opens its scoped board. ... Closing details preserves scope, query, and board position."
- **[[c4]]** `code` `vscode-plugin/src/delivery/board-state.ts` — "BoardSelection (line 43); reduceBoardState (line 106); boardDownMessages (line 210)"
- **[[c5]]** `code` `vscode-plugin/src/delivery/board-host.ts` — "createDeliveryBoardHost (line 388); renderBoardDocument's layout region holds <aside id="details"> and <div id="board"> together"
- **[[c6]]** `code` `vscode-plugin/src/delivery/board-protocol.ts` — "parseBoardUpMessage (line 273)"
- **[[c7]]** `code` `vscode-plugin/src/delivery/details-memory.ts` — "createDetailsMemory (line 77)"
- **[[c8]]** `analyze-bundle` `insrc_analyze_step structural map of vscode-plugin/src/delivery navigation state: selection reads/writes 80+ hits, 61 in board-host.test.ts; view/details test lines 66 in board-host.test.ts`
- **[[c9]]** `prior-artifact` `docs/standalone/defect-against-epic-e2-6a131558-vs-E20261009b2687832/ISSUE.md` — "Bring the board's presentation and the interactions shown in mocks A–F in line with the PRD, within the board module"
