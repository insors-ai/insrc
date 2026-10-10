# t7 evidence: the board beside the approved mocks, speed and the full suite

## Screenshots: board beside mock

I captured each screen with headless Chrome (`google-chrome --headless=new --window-size=<w>,1400`). The board side is the real board document and webview script. It was fed the screen messages that the real host posts for a fixture snapshot, and its `--vscode-*` theme variables were set to VS Code's dark defaults for the capture only. The mock side is `docs/plans/delivery-board-screen-mocks.html#<screen>`. Its window is 300 px wider because the gallery's index takes that space, and below 900 px the gallery stacks the index above the screen.

| Sheet | Board pane | Pairs, top to bottom |
|---|---|---|
| [pairs-1200.jpg](pairs-1200.jpg) | 1200 px | All work, Epics, one epic's board, Issues, story overview, issue |
| [pairs-600.jpg](pairs-600.jpg) | 600 px | the same six |
| [pairs-360.jpg](pairs-360.jpg) | 360 px | the same six |

What the sheets show:
- **Structure matches the mocks.** Every screen uses the mocks' structure:
  - The app bar with the wordmark and breadcrumb.
  - The filter bar with segmented views, the Needs attention toggle and the search, and no heading on the list screens.
  - The count line.
  - Bordered stage boxes with the count on the right.
  - Cards with a monospace kicker.
  - Epic rows with completion over a meter and the attention pill on one line.
  - The epic board's header with its meter.
  - On story and issue screens: the ghost Back link, the stage pill first, small uppercase section labels, chain rows and the "Open what it corrects →" button.
- **Issues are grouped by stage.** The Issues screen groups issues in the same collapsible stage boxes as the board screens: open when they hold work, empty ones closed and marked.
- **Footer.** The announcement line and a small density control sit in the footer.
- **Narrow panes.** At 360 px:
  - The breadcrumb is the back step and the current place, without the wordmark.
  - The epic header wraps.
  - Empty stages fold into "Other stages · 0 matching".
- **Remaining differences are data, not styling:**
  - Badge wording, e.g. "Pending decision" where the mock says "Approval due". This is out of scope for ISSUE-7405471c.
  - Fields the read model does not publish yet (size, purpose and issue body; ISSUE-7224d0d4).
  - The fixture's own titles and counts.

## Speed

[perf-exact-targets.txt](perf-exact-targets.txt) is `INSRC_PERF=1 npx tsx --test src/delivery/__tests__/board-perf.test.ts`, which asserts the exact targets on the 500-item, 1,000-record board, best of three:

| Measure | Result | Target |
|---|---|---|
| First board | 3.7 ms | 1 s |
| Each filter change and drill-down | 2.1 ms or less | 150 ms |
| Switch to the Issues screen (new test) | 3.6 ms | 150 ms |

## Full plugin suite

[full-plugin-suite.txt](full-plugin-suite.txt) is `npx tsx --test 'src/**/__tests__/*.test.ts'` in `vscode-plugin`. Of 962 tests, 957 pass and 4 live tests are skipped. The 1 failure is the known manifest-catalog baseline ("each declared key's type/enum/default matches its ConfigOption"). The typecheck (`npx tsc -p tsconfig.json --noEmit`) is clean.
