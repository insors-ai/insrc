<!-- insrc:artifact CR-c32aa60534232f36-s2 -->

# Code review: c32aa60534232f36:s2

⚠️ **WARN** — HIGH 0 · MED 1 · LOW 1 · model `claude:claude-sonnet-5`

**Changed files:** 12

## adherence — 0 finding(s)

_No findings._

## conventions — 0 finding(s)

_No findings._

## coverage — 0 finding(s)

_No findings._

## quality — 2 finding(s)

| Severity | Location | Message |
| --- | --- | --- |
| MED | src/workflow/code-review/investigation/ledger.ts:1 | `same(a: unknown, b: unknown)` in ledger.ts duplicates the identically-named, identically-signatured `same(a: unknown, b: unknown)` in ledger-evidence.ts — both call `ledgerDigest` to implement structural equality. Having two independent copies of the evidence/state equality check means a future correctness fix to the comparison semantics (e.g. handling of NaN, undefined vs missing keys, or digest collisions) can be applied to one copy and missed in the other, silently diverging ledger validation behavior between `evidenceFromReceipt`/`admitLedgerEvidence` and `inspectionMap`/`validateState`/`applyReviewLedgerDelta`. |
| LOW | src/workflow/code-review/investigation/ledger-catalog.ts:1 | `add(category, requirementRef, text, needs = 'inspection', allowNotApplicable = false)` takes five positional parameters, the last two with defaults including a trailing bare boolean flag. Call sites that omit or transpose the trailing args are easy to get wrong and hard to read without checking the signature (e.g. `add(cat, ref, text, 'inspection', true)` reads ambiguously at the call site). Not a functional break, but worth tightening to an options object if `buildLedgerBasis`'s call sites grow. |

