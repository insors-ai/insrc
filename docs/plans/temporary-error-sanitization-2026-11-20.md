# Batch 02 — temporary error sanitization

Tracked scope: `ISSUE-939c138296f56a8f` (approved 2026-11-20). The original audit remains historical; this record describes the focused remediation.

## Change

Structured retries revalidate connection authority, then project session-memory failures through the existing identity-only `connectionExecutionErrorCode` before inspecting provider error prototypes. Saved requests retain the original Vibe identity, cancellation, input-size refusal and retry diagnostics.

Temporary exploration failures use `lookupAnswerStepReason`, following the existing WeakMap projection pattern. Each owned `LookupFailedError` with a terminal reason registers one error-instance → reason association at construction. The module owns the WeakMap; keys do not keep error instances alive. The projection reads neither thrown-object properties nor prototypes. Unknown objects, proxies and revoked proxies have no entry and receive `temporary-failure`. All four known answer-step reasons retain their terminal code, so this fix does not trigger another answer attempt. Saved failures retain detailed messages, partial findings, handling and part failures. IPC payload shapes and persistent entities are unchanged; no ERD or UI artifact is needed.

## Reproduction and regression checks

- Before: owned run `29f77fe1-322f-4686-88d0-953a7a311eb4` reproduced all three named provider/RPC diagnostic failures on Node v22.23.2. Actual TAP reports three failures, no cancellations/skips, complete coverage and confirmed cleanup.
- First corrected run `ec526419-654d-4dbb-89c5-8b311746a5ae`: provider, Vibe refusal, input-size and model-call controls passed (13 tests). RPC reached a later stale fixture assertion (`emit_bundle` expected, `emit_part` returned). The current analyzer uses a partitioned answer continuation here. The fixture now requires that exact continuation and its `temporary-failure` payload, and still rejects private canaries in the complete response.
- Final run `699b7ba3-6dc9-4b09-9892-a72850feaf19`: **14 pass, zero failures, cancellations or skips**, complete TAP coverage, confirmed cleanup. Files ran serially with the supported harness and fresh full build. [Retained results](temporary-error-evidence-2026-11-20/final-results.json) include runtime, counts, log hashes and cleanup; adjacent TAP files preserve all cases. [Baseline results](temporary-error-evidence-2026-11-20/before-results.json) preserve the original failures.

The RPC fixture runs source and freshly compiled modules against actual temporary execution ownership, sockets and the daemon log sink. Added controls exercise poisoned terminal-error getters, all four terminal reasons, a hostile raw proxy, a revoked proxy, and saved lookup details. Existing provider controls require zero private getter reads, one attempt for sanitized/typed failures, post-await authority checks and saved diagnostics. A dedicated saved Vibe test checks exact refusal identity and one call for all three dispatch states. No live provider was enabled; provider tests use local fixtures.

## Limits

No broad sweep or release qualification was run. Batch 15 evidence digests were not refreshed. Other remediation batches, including native lifecycle failures, remain open. The analyzer located the existing error types/projector but reported incomplete inferred caller coverage; implementation decisions were checked against source. No new dependency or general error-handling rewrite was introduced.
