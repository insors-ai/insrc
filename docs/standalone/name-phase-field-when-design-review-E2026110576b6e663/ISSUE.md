<!-- insrc:artifact ISSUE-76b6e6635afe5530 -->

# Name the phase and field when a design review request is malformed

## Reproduction

Call insrc_review_step with a request that does not carry everything its phase needs. 1. phase 'result' with only repo, reviewId and attempt (no executionId, sequence or result). 2. phase 'recover' with operation 'resume' and no actionId. 3. an unknown phase such as 'nope'. Observed: each is refused with code invalid_schema and the message ": Expected union value" (an empty path), which names neither the phase nor the missing field. Expected: the message names the phase and the first offending field (for example that a result request needs executionId), and for an unknown or missing phase lists the valid phases. A valid request, such as a start with an attempt of 2, is accepted.

## Root cause

parseDesignRequest validates every request against DesignRequestSchema, a Type.Union of the nine per-phase schemas, through decodeDesign, which reports only the first TypeBox error. When a request fits none of the union members, that first error is the union-level one, with an empty path and the message 'Expected union value', so it carries nothing about which phase the caller meant or which field is missing. The per-phase schemas already exist keyed by phase (DesignRequestSchemas) and the valid phase names are listed (DESIGN_REVIEW_PHASES), but the validation does not use them to choose the schema. The only production caller is the daemon RPC entry designReviewStep, so every malformed request a caller sends reaches the user with this message.

## Fix intent

A malformed design review request is refused with a message that names its phase and the first offending field. A request with an unknown or missing phase is refused with a message listing the valid phases. The refusal keeps its code (invalid_schema) and error class (DesignReviewInputError), and requests that are valid today stay valid. The stored review format and the request shapes do not change. Parts 1 and 3 of issue #101 (retrying a failed reviewer attempt, and placeholder findings stored as findings) are separate stories and not part of this fix.

## Citations

- **[[c1]]** `code` `src/workflow/review/design-review/contracts.ts:196-208`
- **[[c2]]** `code` `src/workflow/review/design-review/contracts.ts:244-257`
- **[[c3]]** `code` `src/workflow/review/design-review/contracts.ts:258-262`
- **[[c4]]** `code` `src/daemon/design-review-rpc.ts:15-16`
- **[[c5]]** `code` `src/workflow/review/design-review/__tests__/recovery-contracts.test.ts:10-24`
