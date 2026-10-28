<!-- insrc:artifact ISSUE-ecf8440c29a6aa99 -->

<!-- chunk-scaled-time-v1 -->
> **User-approved scope addition, 2026-10-27:** total review time is10 minutes × current planned chunks, updated on subdivision; no fixed20-minute total. Existing per-attempt caps are retained and clamped by the remaining total; retries do not restart the clock. Code-review defaults are10 minutes; design-review defaults differ. Canonical provenance: `.insrc/artifacts/ISSUE-ecf8440c29a6aa99.feedback.jsonl`, entry `user-decision-chunk-scaled-time-v1`. This governs contrary earlier wording about unchanged total timeouts below.


# Enforce all-inclusive review budgets and exclude generated history

## Reproduction

1. Set review.chunkTokens to 128000 and review a Story whose rendered review material exceeds the limit. 2. Include tracked flat .insrc/artifacts/*.log.jsonl and *.feedback.jsonl files. 3. Observe the failed TU1 adherence run db3c4715-db9e-4d29-a509-ba049ea43f79: the planner split requests at a 384000-character limit into 371253- and 225429-character prompts (596682 rendered characters combined, including repeated context). The four JSONL files contributed 67233 raw bytes. 4. Planning admits these prompts based on serialized message text, without an inclusive allowance for the output schema, native CLI/tool context and completion/source-inspection growth. Expected: each actual review call is admitted only against one inclusive 128K budget, shared and hidden costs explicitly qualified/reserved, with safe subdivision or explicit inability to fit. Observed: the run eventually failed its 1200-second review deadline, but logs retain only the prepared plan and terminal failure, not completed chunk identities. The timeout is evidence of the failed run, not proof that context size alone caused its latency.

## Root cause

The shared job planner's sentChars and issued-call chars measure promptChars(envelopeMessages(...)): they include serialized message text and call-id instructions, but not the separate enveloped output schema, CLI/native tool framing, reserved completion or source-inspection session growth. Planning and retry/gather admission therefore enforce a prompt-text ceiling rather than an inclusive request budget. modelDimensionAdapter can execute these requests as source-inspecting reviewer sessions, whose additional native context is not exactly observable by this process. Separately, LEDGER_EXCLUDE_GLOBS excludes flat generated artifact .json but not .jsonl sidecars, allowing history into changed-file/freshness review inputs. runDimensionJob logs prepared/finished plans without persistent per-call completion/failure metadata, obscuring which chunk consumed the deadline. The existing splitter is installed and active; absence of splitting is not the defect.

## Fix intent

Make review.chunkTokens the all-inclusive per-model-call budget across single, chunk, retry, gather/reduce, relation and comparison paths. Account for shared prompts/context, call envelope, separate output schema, provider/native/tool overhead, reserved completion and source-inspection growth using one consistent policy and an execution-time guard. Treat the current 3-characters-per-token method as an estimate, not native measured token usage; distinguish qualified bounded execution from CLI-internal context that cannot be observed or bounded, and fail explicitly rather than assert a false hard guarantee. Reduce chunk payload to fit the remainder, preserve all required evidence across chunks, and fail clearly if mandatory context cannot fit. Exclude generated flat JSONL sidecars while preserving nested user-authored templates/formats. Persist content-free per-call/chunk identifiers, stage/role/attempt, budget breakdown, timing and outcome so stalls can be traced. Keep the 128K limit and existing timeouts; do not change global configuration, add cloud REST, retain prompts/transcripts, or modify TU1 usage-domain behavior. Complete this dependency fix and update/restart the daemon before retrying the pending TU1 review.

## Citations

- **[[c1]]** `code` `src/workflow/review-pipeline/job.ts:174-195` — "sentChars measures promptChars(envelopeMessages(...)); issue stores the separate envelope schema."
- **[[c2]]** `code` `src/workflow/review-pipeline/driver.ts:78-96` — "Reviewer sessions and structured calls receive output schema separately from serialized messages."
- **[[c3]]** `code` `src/workflow/review-pipeline/code-review.ts:255-280` — "runDimensionJob prepares the shared job and logs plans at prepared and finished."
- **[[c4]]** `analyze-bundle` `insrc_analyze_step: UoQNS4qD-rHZ8Db5Q4Pzww` — "Indexed createReviewJob, runReviewJob, modelDimensionAdapter and withDeadline; runDimensionJob caller confirmed. Graph coverage has stated limits."
- **[[c5]]** `doc` `/tmp/review-splitting-investigation.json` — "Recorded installed splitter match, 384000-character limit, two chunk sizes, JSONL input and 1200-second failure; all 46 targeted pipeline tests passed."
- **[[c6]]** `stakeholder` `user instruction, 2026-10-27` — "ok, this needs to be fixed first. the 128K budget should be all inclusive"
