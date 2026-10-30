<!-- insrc:artifact CR-486751c3411ceef9-S001 -->

# Code review: 486751c3411ceef9:S001

⛔ **BLOCK** — HIGH 2 · MED 2 · LOW 0 · model `claude:claude-sonnet-5`

**Changed files:** 25

## adherence — 2 finding(s)

| Severity | Location | Message |
| --- | --- | --- |
| HIGH | src/artifact-theme/theme.ts:736699 | legendHtml has zero callers (not invoked from src/workflow/artifacts/companion/shell.ts's bootScript/renderCompanionPage nor from src/docgen/render/shell.ts's buildHtml) and zero testsReaching. R4 ('role palette + legend only when roles exist') and the LLD's dataModelChanges entry ('ROLE_PALETTE+legend iff roles') require the legend to be wired into both shells' rendered output, but no call site injects it into either shell. |
| HIGH | src/artifact-theme/theme.ts:736705 | exportableSvg has zero callers (not used by companion/shell.ts, docgen/render/shell.ts, or docgen/render/fallback.ts) and zero testsReaching, despite R12 ('export full svg + font style + background rect') being an explicit acceptance criterion mapped to viewer-script/theme tests and to viewerBootScript's export control. |

## conventions — 0 finding(s)

_No findings._

## coverage — 2 finding(s)

| Severity | Location | Message |
| --- | --- | --- |
| MED | src/docgen/render/fallback.ts | assembleFallbackShell is reached only by src/workflow/artifacts/companion/__tests__/code-ref-script.test.ts, but that test file does not appear in the gate's test-record results at all, so its pass-state cannot be confirmed — present but unverified, not confirmed passing. |
| MED | src/docgen/render/shell.ts | assembleShell is reached only by src/workflow/artifacts/companion/__tests__/code-ref-script.test.ts, but that test file does not appear in the gate's test-record results at all, so its pass-state cannot be confirmed — present but unverified, not confirmed passing. |

## quality — 0 finding(s)

_No findings._

