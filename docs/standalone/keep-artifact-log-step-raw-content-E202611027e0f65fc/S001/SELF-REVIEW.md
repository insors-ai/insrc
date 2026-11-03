# Controller self-review: LLD-7e0f65fc1a518722-s1 (keep the artifact log in step with raw content writes)

Reviewer: the controller, who also wrote the LLD (the daemon design review is unavailable), so approval needs an override.

## Checked against the code
- The defect and its mechanism: reproduced on 2026-11-02 (store write, raw `writeArtifact` content change, `LifecycleService.apply` approve refused with `head-ahead-of-log`, nothing written). `prepareArtifactWrite` mints the revision and `writeArtifact` appends no history; `checkIntegrity` ignores a log with no revision-bearing entry, so the state arises only after a first revision-bearing entry (a first approval or review, or any store write).
- The place of the fix: `LifecycleService.apply` runs `checkIntegrity` inside `store.updateAndLog`, which holds the artifact's queue, so an append through `store.history` there is atomic with the operation. `ArtifactStore.history` is exposed for exactly this kind of append (task-set does the same under `exclusive`).
- The existing hand-edited-number test (`lifecycle-service.test.ts`, `revision.number = 5` with unchanged content) stays refused, because the rule adopts only when the head's content hash differs from the last logged one.
- Alternatives a2 to a4 were read against the code: `writeArtifact` has no repository, history or actor; the writers are synchronous; the store's queue and journal would be bypassed by a3.

## Findings in the LLD (to settle in the plan, none blocking)
1. **Failed operation after an adoption.** The LLD says every refusal leaves the log as before. If the adoption is appended and a later step of the same `apply` then fails (an illegal transition, a failed evidence check), the adopted entry stays. That is harmless (the log is then in step with the head) but is not "as before". The plan should either run the adoption after the transition is validated or state this in the tests.
2. **The "retry adopts again" claim** holds only when the append itself failed; after a failure past the adoption the head is already in step. The plan's test should cover both.
3. **A hand edit of the content that also recomputes the hash** is indistinguishable from a raw writer's change; the rule trusts a head whose own hash holds. This is the accepted limit of a1 and is in the open questions.
4. The s4 text had a typo ('hash-hash-mismatch'); corrected in the LLD.

## Verdict
Pass. The design is the smallest that meets the issue and keeps the refusals that must stay. Approval needs `overrideReview` naming this file.
