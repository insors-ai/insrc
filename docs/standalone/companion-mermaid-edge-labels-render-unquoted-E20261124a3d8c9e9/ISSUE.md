<!-- insrc:artifact ISSUE-a3d8c9e9f195e620 -->

# Companion mermaid edge labels render unquoted and companion links resolve against the wrong base

## Reproduction

1. Generate a component-dependency companion whose definition carries an edge label containing parentheses (e.g. 'one subprocess per turn (k6)' or 'REMOVED by s1 (mechanical re-home) / s3 (full migration)') — as the HLD-639cd2159a87aedb component-dependency definition does.
2. Open the generated page in Chrome. Observed: mermaid reports 'Syntax error in text' and renders zero component nodes — the whole diagram is missing (live observation on docs/epics/unify-vibe-one-plain-cli-adapter-E20261124639cd215/component-dependency.html, 11 components, 13 edges). Expected: all components and edges render. Quoting the edge labels in a hand-edited copy of the page made all 11 components render, confirming the diagnosis.
3. Separately, open the artifact markdown that links the companion. Observed: HLD.md line 36 links 'docs/epics/unify-vibe-one-plain-cli-adapter-E20261124639cd215/component-dependency.html', which resolves relative to the artifact's own directory to docs/epics/<epic>/docs/epics/<epic>/component-dependency.html — a 404. Expected: './component-dependency.html', the companion being a sibling file of the .md.

## Root cause

Two independent defects in the companion rendering layer. (1) componentDependencyDefinitionToPage emits edge labels as `|${mermaidFlowText(d.label)}|` — an UNQUOTED label token. mermaidFlowText prepares text for a QUOTED label context (it strips pipes and encodes angle brackets but leaves parentheses untouched), and mermaid's unquoted `|...|` edge-label form fails to parse when the label contains parentheses. The node labels on the same page are correctly double-quoted, which is why the boxes' text was safe while the edges broke the whole chart. (2) companionRef computes the ref's relPath with toRepoRelative — a path relative to the repository root — but the only markdown consumer (companionBodyLines) embeds it verbatim in a link inside the artifact .md, which sits in the SAME directory as the companion file (the renderer always writes companions beside the source markdown). A repo-relative path inside a document-relative link resolves incorrectly and 404s.

## Fix intent

Quote edge labels in the component companion's mermaid output — the same double-quoted form the node labels already use — so labels containing parentheses and other special characters parse. Compute the companion ref's link path relative to the artifact's own directory (the companion is a sibling file), so markdown links resolve correctly. Cover both with regression tests: a parenthesized edge label produces a parseable flowchart, and the emitted link resolves from the artifact's directory. Regenerate the affected companions so the reviewed HLD's diagram renders and its link works.

## Citations

- **[[c1]]** `code` `src/workflow/artifacts/companion/component.ts:156-160` — "const label = d.label !== undefined && d.label.length > 0 ? `|${mermaidFlowText(d.label)}|` : '';"
- **[[c2]]** `code` `src/workflow/artifacts/companion/mermaid-text.ts:43-47` — "mermaidFlowText: text for a quoted flowchart node label or an edge label"
- **[[c3]]** `code` `src/workflow/artifacts/companion/render.ts:86-91` — "relPath: toRepoRelative(destPath, opts.repoPath)"
- **[[c4]]** `code` `src/workflow/artifacts/format/bindings.ts:46-55` — "companionBodyLines embeds relPath verbatim as a markdown link"
- **[[c5]]** `doc` `docs/epics/unify-vibe-one-plain-cli-adapter-E20261124639cd215/component-dependency.html` — "the observed live failure: 11 components, 13 edges, Chrome renders 'Syntax error in text' with zero component nodes"
- **[[c6]]** `doc` `docs/epics/unify-vibe-one-plain-cli-adapter-E20261124639cd215/HLD.md:36` — "line 36 links the companion with a repo-relative path that 404s from the artifact's directory"
- **[[c7]]** `stakeholder` `user review verdict on HLD-639cd2159a87aedb, 2026-11-24` — "HLD review finding: the component companion fails to render; correct the generation/escaping, regenerate the companion, and change the link to ./component-dependency.html"
