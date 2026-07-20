# insrc — documentation site

A static, self-contained documentation site for the insrc daemon, styled as a
terminal user interface: monospace everything, box-drawing chrome, phosphor
accents, dark-first with a warm "paper terminal" light mode.

## Preview

No build step and no dependencies. Open the front page directly:

```bash
open site/index.html            # macOS — or just double-click it
```

…or serve the folder with any static server (nicer for relative links):

```bash
npx serve site                  # or: python3 -m http.server -d site 8080
```

## Structure

```
site/
  index.html            front page — banner, feature grid, architecture diagram
  getting-started.html  install → build → TUI → index a repo → first question → MCP
  architecture.html     daemon · storage (LMDB/Lance/DuckDB) · IPC · graph layer · rules
  workflow.html         define→design→plan→build · tracker · open-questions · IDs · build
  analyze.html          the exploration recipes · 7-layer context bundle · step loop
  tools.html            ~110 built-in tools by category · providers · structured output
  cli.html              the ink TUI panes (Daemon / Repos / Workflows / Setup)
  css/tui.css           the whole theme (design tokens + components)
  js/tui.js             progressive enhancement: theme toggle · active-nav · copy · type-in
```

## Design system

- **Self-contained.** No web fonts, no CDNs, no external requests — the system
  monospace stack (`ui-monospace, "SF Mono", "JetBrains Mono", …`) means it
  renders offline and from `file://`. Consistent with the project's
  no-external-dependency ethos.
- **Theme-aware.** Dark by default; the `[◐ light]` button toggles a paper
  theme and persists the choice to `localStorage`. Respects
  `prefers-reduced-motion` (kills the cursor blink + type-in).
- **One shell, many pages.** Every page shares the same `<nav>`/`<footer>` and
  the `css/tui.css` vocabulary. To add a page, copy any existing file, swap the
  `<title>` + `<main>`, and add a `<nav>` link. `js/tui.js` marks the active nav
  item, wires copy buttons, and injects heading anchors automatically.
- **Accuracy.** Every symbol, path, tool and recipe name on the feature pages
  was verified against the real `src/` tree, not the prose docs.

## Deploy

It's plain static files — host `site/` on GitHub Pages, Netlify, S3, or any
static host. For GitHub Pages, point Pages at the `site/` folder (or copy it to
`docs/` / a `gh-pages` branch).
