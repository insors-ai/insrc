<!-- insrc:artifact CR-bd1c6c9005ff6390-s1 -->

# Code review: bd1c6c9005ff6390:S001

⛔ **BLOCK** — HIGH 1 · MED 0 · LOW 0 · model `codex:gpt-6-astra`

**Changed files:** 41

## adherence — 0 finding(s)

_No findings._

## conventions — 0 finding(s)

_No findings._

## coverage — 1 finding(s)

| Severity | Location | Message |
| --- | --- | --- |
| HIGH | src/indexer/parser/typescript.ts | The parser symbols implementing caller attribution have empty testsReaching edges, so the supplied grounding marks this changed behaviour as not exercised. All four promised tests are present and passing, but passing test files do not establish reachability to these symbols under the required coverage rule. |

## quality — 0 finding(s)

_No findings._

