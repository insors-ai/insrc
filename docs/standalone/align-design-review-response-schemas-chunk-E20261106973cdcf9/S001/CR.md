<!-- insrc:artifact CR-973cdcf99760c5c6-s1 -->

# Code review: s1

Status: **passed** · task-based schema version 2

## code-review-973cdcf99760c5c6-s1-r1 — attempt 1

Scope: whole story · reviewer: daemon · 2026-11-06T18:11:00.758Z

1 selected task assessment(s): passed.

### Submitted scope

- `48fb93a7f6a265ef02b6142221dcbdcae6cd85ad:src/workflow/review/design-review/__tests__/assignment-schema.test.ts` — [{"after":[1,49]}]
- `48fb93a7f6a265ef02b6142221dcbdcae6cd85ad:src/workflow/review/design-review/__tests__/controller.test.ts` — [{"after":[58,58]}]
- `48fb93a7f6a265ef02b6142221dcbdcae6cd85ad:src/workflow/review/design-review/__tests__/coordinator.test.ts` — [{"after":[18,18]}]
- `48fb93a7f6a265ef02b6142221dcbdcae6cd85ad:src/workflow/review/design-review/__tests__/impact-consolidation.test.ts` — [{"after":[53,54]}]
- `48fb93a7f6a265ef02b6142221dcbdcae6cd85ad:src/workflow/review/design-review/__tests__/impact-execution.test.ts` — [{"after":[21,21]},{"after":[44,44]},{"after":[46,46]}]
- `48fb93a7f6a265ef02b6142221dcbdcae6cd85ad:src/workflow/review/design-review/contracts.ts` — [{"after":[136,143]}]
- `48fb93a7f6a265ef02b6142221dcbdcae6cd85ad:src/workflow/review/design-review/coordinator.ts` — [{"after":[11,11]},{"after":[287,287]},{"after":[289,289]}]
- `48fb93a7f6a265ef02b6142221dcbdcae6cd85ad:src/workflow/review/design-review/policy.ts` — [{"after":[2,3]},{"after":[24,26]},{"after":[28,28]},{"after":[31,31]}]
- `48fb93a7f6a265ef02b6142221dcbdcae6cd85ad:src/workflow/review/design-review/results.ts` — [{"after":[2,2]},{"after":[85,85]},{"after":[103,103]}]

### s1: passed

The fix correctly restricts `findingDecisions` to only the designated final-consistency chunk of an actual impact attempt. `allowsDesignFindingDecisions` requires `attempt.impact` to be set AND `chunk.purpose==='consistency'` AND `chunk.id===attempt.plan.finalConsistencyChunkId`, so ordinary chunks, non-final consistency chunks, and even the initial attempt's final chunk (no impact set) are excluded. `designChunkResultSchema` returns `OrdinaryDesignResultSchema` (Type.Omit of `findingDecisions`, additionalProperties:false preserved) for all non-permitted chunks, and the full `DesignResultSchema` only for the permitted one. This schema selection is used consistently in exactly one place in the native coordinator (`coordinator.ts:289`), in the prompt's trailing structural-reference JSON (`policy.ts`), and in the live decode path (`results.ts: assessDesignResult` → `reconcileDesignFindings`, which independently re-asserts `result.findingDecisions===undefined||final`). The broad `DesignResultSchema` is correctly retained for historical/stored paths (checkpoint `DesignAttemptSchema.completedChunks`/`report`, the transport-level `DesignRequestSchemas.result` envelope decode, and `consolidateDesignReview`), so stored final decisions from past impact attempts still decode. All 5 submitted test files were executed against the current checkout and passed (25 test cases total across controller/coordinator/impact-consolidation/impact-execution/assignment-schema), and `tsc --noEmit` reported no errors.

Coverage: **verified** — Inspected the bodies/assertions of all three new tests in assignment-schema.test.ts plus the modified assertions in controller/coordinator/impact-consolidation/impact-execution tests. They cover: (1) the full permission matrix (no attempt, impact-less attempt, impact attempt) crossed with every chunk, verifying allowsDesignFindingDecisions/designChunkResultSchema/prompt schema/Codex strict schema all agree, plus a forged non-final consistency-purpose chunk is still denied; (2) that an ordinary chunk's schema rejects the field whether empty array, null, or populated, via both decodeDesign and the Codex transport validator and assessDesignResult, while a result without the field still passes; (3) that the permitted impact-final schema still accepts historical nullable transport decoding without mutating the broad DesignResultSchema (byte-for-byte snapshot check), and that decoding under DesignResultSchema (no chunk context) still succeeds for historical data while assessDesignResult without impactContext rejects the same decisions. Ran all 5 submitted test files against the actual committed code (git show confirmed the committed source matches the current checkout) — 25/25 cases passed. Also ran tsc --noEmit with zero errors.


Optional verification and advice (nonblocking):

- Optional execution: ran the five submitted test files individually (25/25 pass) and tsc --noEmit (clean); did not run the full repo-wide test sweep or the remaining design-review test files not in scope.

Inspected references:

- `48fb93a7f6a265ef02b6142221dcbdcae6cd85ad:src/workflow/review/design-review/contracts.ts`
- `48fb93a7f6a265ef02b6142221dcbdcae6cd85ad:src/workflow/review/design-review/coordinator.ts`
- `48fb93a7f6a265ef02b6142221dcbdcae6cd85ad:src/workflow/review/design-review/policy.ts`
- `48fb93a7f6a265ef02b6142221dcbdcae6cd85ad:src/workflow/review/design-review/results.ts`
- `48fb93a7f6a265ef02b6142221dcbdcae6cd85ad:src/workflow/review/design-review/__tests__/assignment-schema.test.ts`
- `48fb93a7f6a265ef02b6142221dcbdcae6cd85ad:src/workflow/review/design-review/__tests__/controller.test.ts`
- `48fb93a7f6a265ef02b6142221dcbdcae6cd85ad:src/workflow/review/design-review/__tests__/coordinator.test.ts`
- `48fb93a7f6a265ef02b6142221dcbdcae6cd85ad:src/workflow/review/design-review/__tests__/impact-consolidation.test.ts`
- `48fb93a7f6a265ef02b6142221dcbdcae6cd85ad:src/workflow/review/design-review/__tests__/impact-execution.test.ts`
- `48fb93a7f6a265ef02b6142221dcbdcae6cd85ad:.insrc/artifacts/ISSUE-973cdcf99760c5c6.json`

Test: `node --import tsx --test --test-force-exit src/workflow/review/design-review/__tests__/assignment-schema.test.ts` — pass
Ran directly against current checkout (matches commit 48fb93a7f). All 3 cases passed in 637ms.

Test: `node --import tsx --test --test-force-exit src/workflow/review/design-review/__tests__/controller.test.ts` — pass
Ran directly against current checkout. All 5 cases passed in 685ms.

Test: `node --import tsx --test --test-force-exit src/workflow/review/design-review/__tests__/coordinator.test.ts` — pass
Ran directly against current checkout. All 8 cases passed in 1863ms.

Test: `node --import tsx --test --test-force-exit src/workflow/review/design-review/__tests__/impact-consolidation.test.ts` — pass
Ran directly against current checkout. All 6 cases passed in 506ms.

Test: `node --import tsx --test --test-force-exit src/workflow/review/design-review/__tests__/impact-execution.test.ts` — pass
Ran directly against current checkout. All 3 cases passed in 545ms.
