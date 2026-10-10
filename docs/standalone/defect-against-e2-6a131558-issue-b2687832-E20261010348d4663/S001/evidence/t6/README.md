# t6 evidence — stylesheet for screens, accordions and minimum widths

## Screenshots

Headless Chrome (`google-chrome --headless=new --window-size=<w>,1100`) over the real board document and webview
script, fed the screen messages the real host posts for a fixture snapshot. The `--vscode-*` theme variables are set
to VS Code's dark defaults for the capture only.

| Sheet | Pane width | Screens, left to right, top to bottom |
|---|---|---|
| [screens-1200.jpg](screens-1200.jpg) | 1200 px | All work, Epics, one epic's board, Standalone, Issues, Needs attention, story overview, story evidence, story linked work, completion conflict, issue, refresh failed over a story |
| [screens-600.jpg](screens-600.jpg) | 600 px | the same twelve |
| [screens-360.jpg](screens-360.jpg) | 360 px | the same twelve |

What they show:
- Nothing overlaps or is squeezed at any width. The card grid drops to fewer columns, and the story's two columns
  stack below 760 px with the stage explanation and chain first.
- At 360 px the breadcrumb is only the back step and the current place, empty stages fold into "Other stages · 0
  matching", and the tab labels are short.
- At narrow widths the records table keeps its 620 px minimum and scrolls sideways inside its wrapper rather than
  squeezing; the right edge of the evidence screen at 360 px is the scroll region.

## Full plugin suite

[full-plugin-suite.txt](full-plugin-suite.txt): `npx tsx --test 'src/**/__tests__/*.test.ts'` in `vscode-plugin`
with the t6 changes (a85aa7db and the density test that follows it). 940 tests: 935 pass, 4 live tests skipped, and 1 failure, the known manifest-catalog baseline
("each declared key's type/enum/default matches its ConfigOption"). The typecheck (`npx tsc -p tsconfig.json
--noEmit`) is clean.
