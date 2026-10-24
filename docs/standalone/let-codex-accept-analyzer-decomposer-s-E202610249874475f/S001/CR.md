<!-- insrc:artifact CR-9874475f902756f6-S001 -->

# Code review: 9874475f902756f6:S001

⛔ **BLOCK** — HIGH 1 · MED 0 · LOW 0 · model `codex:gpt-6.1-sol`

**Changed files:** 15

## adherence — 0 finding(s)

_No findings._

## conventions — 0 finding(s)

_No findings._

## coverage — 1 finding(s)

| Severity | Location | Message |
| --- | --- | --- |
| HIGH | src/analyze/planner/wire-schema.ts:1 | Missing promised coverage for preserving nulls inside slot contents and whole-params. The related test is present and passing, but covers nested null removal and the adherence rule; no listed test establishes the promised preservation cases. |

## quality — 0 finding(s)

_No findings._

