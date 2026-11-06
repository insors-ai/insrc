<!-- insrc:artifact ISSUE-d4cf0037bc85680a -->

# Decode nullable Codex replies through the shared response handler

## Reproduction

Review code-review-7386983710e0c464-s1-r1 attempt 1 runs code inspection and returns a passed assessment with no findings, but the host marks it failed after about 95 seconds because /error must be string. The saved raw feedback contains error:null. The installed nullable formatter legitimately permits this transport representation for the optional error field. [c3]

## Root cause

The strict schema formatter wraps optional properties in nullable unions, but validateCodexReply validates the raw reply directly against the original schema without decoding synthetic null values. In addition, ReviewActivityStream validates both candidate submissions and final responses through generic validateAgainstSchema rather than the existing Codex-specific response handler, so it bypasses Codex-specific validation semantics. [c1][c2]

## Fix intent

Use one shared Codex response boundary to decode transport-only nulls to omitted optional fields and then validate the decoded value against the unchanged original host schema. Route Codex activity-stream candidate and final response handling through that boundary, alongside existing structured and bounded reviewer responses; keep Claude behavior unchanged. Handle nested objects, arrays and applicable schema branches/references; preserve explicit null allowed by the original schema, reject required nonnullable nulls, and retain all original bounds and validation errors. Preserve raw diagnostics, avoid caller schema/reply mutation, and cover the actual error:null rejection plus acceptance and rejection cases across affected paths. [c1][c2][c3]

## Citations

- **[[c1]]** `code` `src/agent/providers/structured-schema.ts`
- **[[c2]]** `code` `src/agent/providers/review-activity-stream.ts`
- **[[c3]]** `doc` `.insrc/tmp/code-review/code-review-7386983710e0c464-s1-r1.json`
- **[[c4]]** `stakeholder` `User request: also route responses through the Codex response handler.`
