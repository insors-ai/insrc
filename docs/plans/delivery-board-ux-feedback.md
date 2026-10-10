# Delivery board — UX feedback log

Running notes from reviewing the installed board (insrc-vscode 0.5.12, built from
`fc32bf47`, after ISSUE-b2687832's restyle) against the PRD,
[`docs/insrc-delivery-board-prd.html`](../insrc-delivery-board-prd.html) (mocks A–F).
Notes only: nothing here is filed or fixed yet.

## 2026-10-09

1. **The board UX still doesn't match the PRD.** Reported after the ISSUE-b2687832
   restyle was installed. Main cause, from item 5: the PRD shows separate screens with
   breadcrumb and back navigation (portfolio → epic board → story or issue), and the build
   is one composite page that adds panes. Items 2–4 are part of the same gap.
2. **Too many filter chips: every epic shows up as its own scope chip.** The toolbar
   should hold only these clickable filters: **All work**, **Epics**, **Standalone**,
   **Issues**, **Needs attention**. Individual epics should not be chips.
   - Today: `renderScope` builds one chip per epic in the snapshot (`scopeOptions`),
     after All work and Standalone. With 30+ epics the toolbar becomes a wall of chips.
   - Open: how a single epic gets chosen without a chip (presumably from the Epics
     rollup rows, whose titles already open the epic's board), and what "Epics" and
     "Issues" filter to as chips, since Epics and Issues are also tabs.
3. **Stages should be vertical accordions, not columns.** The six stages should stack
   vertically, each a collapsible section (accordion) with its cards inside, rather than
   six side-by-side columns. Columns don't work in narrow layouts.
   - Today: six equal grid columns when the pane is wider than 600 px, and a stacked list
     below 600 px. Stages never collapse, because the no-CSS-hiding rule from E2 S005 and
     this LLD ruled it out.
   - This reverses two earlier decisions: the PRD's six-column board (§04), and the
     accepted Mock E deviation (empty stages wrapped onto one line instead of folded).
     Accordions would also supply mock E's "Other stages · 0 matching" fold.
   - Open: the default expanded state (non-empty stages open, empty ones closed?), whether
     the open/closed state survives a refresh, the keyboard behaviour of the accordion
     headers, and whether wide panes also use accordions (implied: one layout everywhere).
4. **The story details stay open after the context changes.** Once a story's details are
   open, they stay on screen when the reader switches tab, changes scope, searches or
   toggles a filter, even when the story is no longer in what the board shows.
   - Today: the host keeps `selectedItemId` across every selection change (set-view,
     set-scope, set-search, set-attention, clear-filters). Only close-details, Escape, or
     a refresh that removes the item from the snapshot clears it. This matches E2 S1's
     "selection kept across refreshes" and the PRD's "closing details preserves scope,
     query and board position", but not what the reader expects when the context moves.
   - Open: which changes close the details. Candidates: any tab switch; a scope change; a
     search or filter that leaves the item out of the current view (the safest rule:
     close when the item is no longer among the view's matches). Focus then returns to
     the view's tab.
5. **The screen shows more than the current context: opening a story leaves unrelated work
   on screen.** Clicking a story opened its details, but below them the full board was
   still there, listing issues and stories with no relation to that story's epic. At any
   point the screen should show only what is relevant to the current context, with a
   breadcrumb back to where the reader came from. (Confirmed after a window reload.)
   - Clarified cause: this is not the DOM stacking up. The build is one composite page:
     app bar, tabs, chips, and then the details pane and the whole board side by side
     (wide) or one above the other (narrow). Opening a story adds a pane; it never changes
     the screen. That is the single-page layout E2 and ISSUE-b2687832 kept, and the "detail
     panel above the board" placement the PRD allowed in §04.
   - What the PRD shows instead (mocks A–F): separate screens with navigation. A is an
     epic portfolio. B is a story screen with its own breadcrumb ("Delivery / VS Code
     integration / S001") and a "← Back to epic" action, and nothing else on it. D is an
     issue screen with "Open parent story →". The board is scoped by the epic chosen in A.
     Each screen holds one context; moving between them is drill-down and back, not panes
     added to one page.
   - This is the main finding behind item 1: the build matches the mocks' styling but not
     their screen structure and navigation.
