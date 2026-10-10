<!-- insrc:artifact ISSUE-7bc6e47643234665 -->

# Group the delivery board's Epics screen by stage, and make Refresh icon-only

## Reproduction

Open the delivery board in VS Code and choose Epics. Observed: the epics are one flat list of rows, while All work, Standalone, an epic's board and Issues all group their work into six collapsible stage boxes (Scoped, Design & plan, Ready · design approved, Ready · plan approved, Build recorded, Complete). Expected: the Epics screen groups its epic rows into the same six stage boxes, with the same rules for which boxes start open, the attention hint on a closed box, and folding the empty stages. Also observed: the app bar's Refresh is a text button; expected: an icon-only button that still has the accessible name 'Refresh'.

## Root cause

The Epics screen's body has no stage grouping to show. EpicsBody (vscode-plugin/src/delivery/board-protocol.ts) carries a flat rows array, built by buildEpicRollup (vscode-plugin/src/delivery/board-views.ts) in snapshot order, and the webview's renderEpics (BOARD_WEBVIEW_SCRIPT in vscode-plugin/src/delivery/board-host.ts) renders those rows as one list. An epic has no stage of its own in the read model, so no screen placed epics in stages; the board screens and the Issues screen group through the shared section rule (sectionDefaults and foldOf in vscode-plugin/src/delivery/board-model.ts), which the Epics screen never used. The Refresh button is written as a text button in renderBoardDocument (board-host.ts).

## Fix intent

Place each epic in the stage of its least-advanced story: the earliest stage among its stories, so an epic reaches Complete only when every story is complete. The Epics screen shows its rows inside the same six collapsible stage boxes as the board and Issues screens, opened, hinted and folded by the same rule, and remembering the reader's open or closed choice across a refresh. Epics with no stories sit in a 'No stories yet' note after the boxes instead of a stage box. The rows themselves, the search, Needs attention, the counts and each row opening its epic's board stay as they are. The app bar's Refresh becomes an icon-only button with the accessible name 'Refresh' and a tooltip; the CSP, text-only rendering and theme colours are unchanged.

## Citations

- **[[c1]]** `code` `vscode-plugin/src/delivery/board-protocol.ts` — "export interface EpicsBody { readonly kind: 'epics'; readonly totalsLabel: string; readonly rows: readonly EpicRollupRowView[]; readonly emptyPanel: StatePanelView | null; }"
- **[[c2]]** `code` `vscode-plugin/src/delivery/board-views.ts` — "export function buildEpicRollup(snapshot: DeliverySnapshot, filter: Pick<MatchFilter, 'search' | 'needsAttentionOnly'>, labels: DisplayLabels): EpicsBody"
- **[[c3]]** `code` `vscode-plugin/src/delivery/board-host.ts` — "function renderEpics(b){renderTotals(b.totalsLabel,false);... <button id="refresh" type="button">Refresh</button>"
- **[[c4]]** `code` `vscode-plugin/src/delivery/board-model.ts` — "sectionDefaults / foldOf: the stage-section rule shared by the board screens and the Issues screen"
- **[[c5]]** `stakeholder` `user, 2026-10-10` — "the epics view is not grouped by state ... yes 1 [the six stage boxes, by each epic's least-advanced story], also the refresh button on top, make it icon only"
