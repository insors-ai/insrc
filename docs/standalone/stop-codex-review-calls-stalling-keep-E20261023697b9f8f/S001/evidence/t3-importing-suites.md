# t3: suites that import VERIFY_SCHEMA or VERDICTS_SCHEMA

Run on 2026-10-24T07:31Z at commit a3cb5640 (t3 = a3cb5640), Node v22.23.2.

Files found by `grep -rln 'VERIFY_SCHEMA\|VERDICTS_SCHEMA' src --include='*.test.ts'`:

- src/daemon/steps/review-step/__tests__/review-step.test.ts
- src/workflow/review-pipeline/__tests__/single-chunk-parity.test.ts
- src/workflow/review-pipeline/__tests__/envelope.live.test.ts
- src/workflow/review/__tests__/verify-answer.test.ts
- src/analyze/__tests__/model-schemas-draft-2020.test.ts

`envelope.live.test.ts` is a live suite gated by INSRC_LIVE_TESTS and is listed but skips here.

## src/daemon/steps/review-step/__tests__/review-step.test.ts

```
ok 1 - review-step drives the full loop and stamps meta.review with model=client
ok 2 - review-step verdicts with an unknown state token returns an error envelope
ok 3 - buildExtractPrompt / EXTRACT_SCHEMA export the expected shape
ok 4 - buildVerifyPrompt / VERIFY_SCHEMA export the expected shape
# tests 4
# pass 4
# fail 0
# skipped 0
```

## src/workflow/review-pipeline/__tests__/envelope.live.test.ts

```
ok 1 - claude and codex accept the envelope around every review answer schema and echo the callId # SKIP INSRC_LIVE_TESTS is not 1
ok 2 - a configured high-end Ollama model completes a template review and a code-review dimension through the pipeline # SKIP INSRC_LIVE_TESTS is not 1
# tests 2
# pass 0
# fail 0
# skipped 2
```

## src/workflow/review-pipeline/__tests__/single-chunk-parity.test.ts

```
ok 1 - an under-limit code review makes today's calls per dimension, with the repo as cwd, and gives today's findings and verdict, diagram and ux included
ok 2 - adherence makes no call without an approved LLD or plan
ok 3 - a mock added or removed after prepare does not change the ux result
ok 4 - an under-limit DEF review makes one extract call, a probe and one verify call per premise with the 3-minute limit; extraction failing fails the review, a verify call failing twice records the premise as not judged
ok 5 - an under-limit HLD review makes one reviewer-session call and gives today's report
ok 6 - the controller premise stage plan under the limit offers one batched verify call holding every premise, with today's buildBatchedVerifyPrompt prompt and schema
ok 7 - an HLD answer that breaks the checklist is re-issued once by the pipeline with today's correction text under a new callId; a second break fails the review; the stage never re-asks
# tests 7
# pass 7
# fail 0
# skipped 0
```

## src/workflow/review/__tests__/verify-answer.test.ts

```
ok 1 - VERIFY_SCHEMA and VERDICTS_SCHEMA bound evidence, action, rationale, edits and options, and an answer over a bound fails validation
ok 2 - the verify SYSTEM rules ask for an always-present proposedFix with empty fields when there is no fix and no longer tell the model to omit fields, in both the single and batched prompts
ok 3 - a no-fix answer with an empty rationale normalises to a finding without proposedFix, and one with a rationale keeps a rationale-only proposedFix
# tests 3
# pass 3
# fail 0
# skipped 0
```

## src/analyze/__tests__/model-schemas-draft-2020.test.ts

```
ok 1 - every schema handed to a model is valid under JSON Schema draft 2020-12
ok 2 - a schema's identifier has no fragment and still carries the schema's version
ok 3 - a failed model call for planning or classification names the call and no provider
# tests 3
# pass 3
# fail 0
# skipped 0
```

