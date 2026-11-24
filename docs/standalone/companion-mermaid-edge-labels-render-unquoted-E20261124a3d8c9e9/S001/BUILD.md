<!-- insrc:artifact BUILD-a3d8c9e9f195e620-s1 -->

# Build (standalone trivial) — Story s1

**Size class:** trivial  ·  **Standalone:** yes  ·  **Created:** 2026-11-24T15:06:36.371Z

**Commit:** 5b06d0e50

## Scope

Companion mermaid edge labels render unquoted and companion links resolve against the wrong base. Root cause: (1) componentDependencyDefinitionToPage emits edge labels as `|${mermaidFlowText(d.label)}|` — an unquoted token; mermaidFlowText is safe only inside a quoted label context, so labels containing parentheses (e.g. 'one subprocess per turn (k6)') break flowchart parsing — observed live as 'Syntax error in text' with zero rendered components; node labels on the same page are correctly double-quoted. (2) companionRef computes relPath as toRepoRelative(destPath, repoPath) — repo-relative — but companionBodyLines embeds it verbatim as a markdown link inside the artifact .md, which sits in the SAME directory as the companion; the link resolves to a doubled path and 404s. Fix intent: quote edge labels in the mermaid output (the same double-quoted form the node labels already use), compute the companion ref's link path relative to the artifact's own directory (the companion is a sibling file), cover both with regression tests (a parenthesized edge label produces a parseable flowchart; the emitted link resolves from the artifact's directory), and regenerate the affected companions so the reviewed HLD's diagram renders and its link works.
