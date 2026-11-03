<!-- insrc:artifact CR-486751c3411ceef9-S001 -->

# Code review: 486751c3411ceef9:S001

⚠️ **WARN** — HIGH 0 · MED 5 · LOW 2 · model `claude:claude-sonnet-5`

**Changed files:** 28

## adherence — 0 finding(s)

_No findings._

## conventions — 0 finding(s)

_No findings._

## coverage — 4 finding(s)

| Severity | Location | Message |
| --- | --- | --- |
| MED | src/docgen/render/fallback.ts | oversized() has a testsReaching edge to src/docgen/render/__tests__/fallback.test.ts, but that file does not appear in the build gate's test-record results, so its pass-state is unverified for this run (present but unverified, not confirmed passing). |
| MED | src/docgen/render/fallback.ts | toGraphvizDot() has a testsReaching edge to src/docgen/render/__tests__/fallback.test.ts, but that file does not appear in the build gate's test-record results, so its pass-state is unverified for this run (present but unverified, not confirmed passing). |
| MED | src/docgen/render/fallback.ts | assembleFallbackShell() reaches tests in fallback.test.ts, narrative-band.test.ts and code-ref-script.test.ts, none of which appear in the build gate's test-record results, so its pass-state is unverified for this run (present but unverified, not confirmed passing). |
| MED | src/docgen/render/shell.ts | docgenAssetDir() has a testsReaching edge to src/docgen/__tests__/asset-validator.test.ts, but that file does not appear in the build gate's test-record results, so its pass-state is unverified for this run (present but unverified, not confirmed passing). |

## quality — 3 finding(s)

| Severity | Location | Message |
| --- | --- | --- |
| MED | src/docgen/render/shell.ts:1 | shell.ts defines its own escapeHtml(s: string): string (used by buildHtml) while src/docgen/render/fallback.ts already defines an escapeHtml(s: string): string with the identical signature/purpose (used by assembleFallbackShell). Both live under src/docgen/render/ and should share one implementation instead of two independently-maintained HTML-escaping routines that can drift (e.g. one gets a bugfix/extra-entity escaped and the other doesn't). |
| LOW | src/artifact-theme/theme.ts:1 | diagramRoles calls asDiagramRole directly and also calls isRole, which itself only wraps asDiagramRole. Having diagramRoles reach asDiagramRole through two different paths (direct and via isRole) for what looks like the same role-validity check is avoidable indirection that makes the role-filtering logic harder to follow than a single consistent path. |
| LOW | src/docgen/render/shell.ts:1 | buildHtml composes the mermaid boot sequence inline by calling mermaidConfigFor, fontFaceCssForArtifacts and viewerBootScript directly, while src/workflow/artifacts/companion/shell.ts factors the equivalent composition (mermaidConfigFor + viewerBootScript) into a dedicated bootScript() helper. The same 'assemble theme config + boot script' logic is expressed two different ways across the two render pipelines instead of sharing one helper. |

