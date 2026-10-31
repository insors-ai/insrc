<!-- insrc:artifact CR-486751c3411ceef9-S001 -->

# Code review: 486751c3411ceef9:S001

⛔ **BLOCK** — HIGH 1 · MED 4 · LOW 3 · model `claude:claude-sonnet-5`

**Changed files:** 27

## adherence — 2 finding(s)

| Severity | Location | Message |
| --- | --- | --- |
| HIGH | src/daemon/threads/__tests__/admin-worker.test.ts:1 | The Story's changed set includes src/daemon/threads/__tests__/admin-worker.test.ts, src/daemon/threads/__tests__/indexing-worker.test.ts, and src/cli/services/__tests__/debug-mcp.test.ts — all concerning daemon worker-thread lifecycle and CLI MCP debug status, with no corresponding source-file changes and no theme/shell/viewer symbols touched. None of the six approved PLAN tasks (t1 fonts, t2 theme module, t3 companion shell, t4 docgen shell/fallback, t5 viewer tests, t6 sweep/build/regen-smoke) or any LLD contract/dataModelChange entry calls for changes to daemon worker threading or CLI debug tooling. This looks like unrelated/leftover work bundled into a Story whose approved scope is the shared Mermaid theme policy. |
| LOW | .vibe/config.toml:1 | .vibe/config.toml is part of the Story's changed set but is not named or implied by any approved PLAN task or LLD data-model/contract entry — it appears to be an unplanned, out-of-scope config edit riding along with this Story's commit. |

## conventions — 0 finding(s)

_No findings._

## coverage — 4 finding(s)

| Severity | Location | Message |
| --- | --- | --- |
| MED | src/docgen/render/fallback.ts:1 | assembleFallbackShell is reached by fallback.test.ts, narrative-band.test.ts and code-ref-script.test.ts, but none of those three test files appear in the test-record's files list for this run, so its pass state is unverified rather than confirmed passing. |
| LOW | src/docgen/render/fallback.ts:1 | oversized is reached only by fallback.test.ts, which is not present in the test-record's files list for this run — present but unverified, not confirmed passing. |
| LOW | src/docgen/render/fallback.ts:1 | toGraphvizDot is reached only by fallback.test.ts, which is not present in the test-record's files list for this run — present but unverified, not confirmed passing. |
| MED | src/docgen/render/shell.ts:1 | docgenAssetDir is reached only by asset-validator.test.ts, which is not present in the test-record's files list for this run — present but unverified, not confirmed passing. |

## quality — 2 finding(s)

| Severity | Location | Message |
| --- | --- | --- |
| MED | src/workflow/artifacts/companion/shell.ts:1 | pageStyle() has the exact same callee pair (pageCssFor + fontFaceCssForArtifacts) as docgenPageStyle() in src/docgen/render/shell.ts. The Story's stated goal is a *shared* theme policy across the companion and docgen shells, but the page-style composition itself was re-written per-shell instead of being lifted into one shared helper (e.g. in src/artifact-theme/theme.ts) that both renderCompanionPage and buildHtml call. This is exactly the kind of drift that produced the prior 'wire legendHtml + exportableSvg into both shells' fix — the next time pageCssFor's output changes, one of the two copies is likely to be missed. |
| MED | src/docgen/render/fallback.ts:1 | assembleFallbackShell(ir, svg, svgPanZoom, svgPanZoomVersion) calls pageCssFor and fontFaceCssForArtifacts directly rather than going through docgenPageStyle (used by the primary buildHtml path) or pageStyle (used by the companion path). Because assembleFallbackShell takes no ThemeMode parameter, it is calling pageCssFor with a single hardcoded mode rather than composing both the light and dark variants the way docgenPageStyle does — so the Graphviz degraded-fallback shell risks rendering without the light/dark theme switch that this Story exists to guarantee, while the primary mermaid shell gets it correctly. |

