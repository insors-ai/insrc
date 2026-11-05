<!-- insrc:artifact CR-76b6e6635afe5530-s1 -->

# Code review: s1

Status: **passed** · task-based schema version 2

## code-review-76b6e6635afe5530-s1-r1 — attempt 1

Scope: whole story · reviewer: daemon · 2026-11-05T04:34:45.698Z

1 selected task assessment(s): passed.

### Submitted scope

- `13dce397db82bd020f635b1ffbb689d1b7f37ed8:src/workflow/review/design-review/__tests__/recovery-contracts.test.ts` — [{"after":[56,64]}]
- `13dce397db82bd020f635b1ffbb689d1b7f37ed8:src/workflow/review/design-review/contracts.ts` — [{"after":[258,265]},{"after":[268,270]}]

### s1: passed

refuseUnmatchedRequest in contracts.ts correctly derives the schema from the request's phase, falls back to the fixed valid-phases message when the phase is missing/unknown/non-string, and otherwise re-runs Value.Errors against the phase-specific schema to report the first offending field prefixed with the phase name. parseDesignRequest's catch wiring only invokes this helper for invalid_schema failures, preserving the code and DesignReviewInputError class, and leaves the valid-request fast path (decodeDesign succeeding) completely untouched. The new test and the full 82-test design-review suite pass against the current checkout, which is byte-identical to the pinned commit for both changed files.

Coverage: **verified** — The new test (recovery-contracts.test.ts:56-64) covers: (1) a known phase ('result') with a missing required field, asserting the message is prefixed 'result request: /executionId: ...'; (2) a known phase ('recover') with a missing required field, asserting the prefix 'recover request: /actionId: ...'; (3) four variants of unknown/missing phase (bad literal, absent phase, null, bare string) all asserting the fixed enumeration message; (4) a valid 'start' request still parses successfully. This exercises every branch added in refuseUnmatchedRequest: schema-found-with-error, schema-not-found (covering both the 'object with bad/absent phase' and 'non-object input' sub-cases of the ternary), and the unaffected valid-path. I traced the TypeBox schema property order for both 'result' (phase,...identity,executionId,sequence,result) and 'recover' (phase,...identity,actionId,operation,userDecision) against the asserted first-error field, and confirmed by execution that the ordering/first-error semantics the test asserts actually hold. I also ran the full 82-test design-review suite to confirm no regression elsewhere (e.g., decodeDesign's non-request callers, and the pre-existing recovery/failure envelope test using generic DesignReviewInputError assertions).


Optional verification and advice (nonblocking):

- Optional execution: ran `npx tsx --test src/workflow/review/design-review/__tests__/recovery-contracts.test.ts` (3/3 pass) and the full `src/workflow/review/design-review/**/*.test.ts` sweep (82/82 pass) on the current checkout, verified byte-identical to the pinned commit for both changed files via `git diff 13dce397d HEAD -- <files>` (no output).
- Minor stylistic nit (non-blocking): refuseUnmatchedRequest uses `error?.path || 'input'` while decodeDesign uses `error?.path ?? 'input'` elsewhere for the same fallback intent — harmless since path is either a non-empty string or absent here, but worth aligning operators for consistency if touched again.

Inspected references:

- `13dce397db82bd020f635b1ffbb689d1b7f37ed8:docs/standalone/name-phase-field-when-design-review-E2026110576b6e663/ISSUE.md`
- `13dce397db82bd020f635b1ffbb689d1b7f37ed8:src/workflow/review/design-review/__tests__/recovery-contracts.test.ts`
- `13dce397db82bd020f635b1ffbb689d1b7f37ed8:src/workflow/review/design-review/contracts.ts`

Test: `npx tsx --test src/workflow/review/design-review/__tests__/recovery-contracts.test.ts` — pass
Ran directly against the current checkout, confirmed byte-identical to commit 13dce397d for both contracts.ts and the test file via git diff (empty). 3/3 pass.
