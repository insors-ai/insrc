# S010 — manual code review (2026-11-05)

Code reviews are manual for now (user rule, 2026-10-29). The reviewer was an independent agent that did not write the code. It read every commit carrying `Insrc-Story: c2ba6fa62a148ed1/s10` (68 code files) against `LLD.md`, on four dimensions: adherence, correctness, conventions and tests. Two rounds.

## Round 1 — verdict: block (1 MED, 7 LOW)

| # | Severity | Finding | Outcome |
|---|---|---|---|
| 1 | MED | `src/indexer/doc-relations-pass.ts:214-215` dropped a `path#symbol` proposal whenever the document already linked the symbol's file. LLD 2.7 and 6 drop only an exact duplicate of a written link. The link stayed in the implied denominator, so recall was pushed down by construction. | **Fixed** 5c5bc0cf1: only `written.has(to)` is a repeat. Test case `docs/c.md` in "s10 t7: proposal validation, resolution and dedupe against extracted links"; it fails under the old rule. The live measurement was re-run on the fix (`t11-evidence.md`). |
| 2 | LOW | `src/indexer/doc-relations-measure.ts:106,117` `extractedRecovery` is a tautology and is always 1; the t8 assertion on it is vacuous. | Open. Informational; nothing switches on it. |
| 3 | LOW | `src/db/doc-relations.ts:302-309` a bare-name reference could link a document to itself (LLD edge case: "A document links to itself — Not written"). | **Fixed** 5c5bc0cf1: guarded in both directions. New case `docs/self.md` in "s10 t5: name references resolve across full-index order…"; each guard is mutation-checked. |
| 4 | LOW | The status does not report the generation the last pass ran at (LLD 5, sc1). `computedAtGeneration` is persisted but not shown. | Open. Display gap. |
| 5 | LOW | `src/daemon/queue.ts` dedupe ignored `setHash`: a second `docRelations.measure` request was dropped while one was queued. | **Fixed** 5c5bc0cf1: a later request replaces the queued one in place. New test "s10 t6: a second measurement request replaces the queued one with its set hash"; mutation-checked. |
| 6 | LOW | `src/indexer/doc-relations-measure.ts:176,180,182` a changed or broken checked set is recorded as extraction `unavailable`. | Open. Wording only; it clears on the next successful pass. |
| 7 | LOW | `src/indexer/index.ts:646-651` the re-read of citing documents after a target is removed lives only in the in-memory queue. A daemon stop in that window leaves the repository incomplete until a full index. | Open. Worth a follow-up ticket (reviewer). |
| 8 | LOW | `src/indexer/doc-relations-pass.ts:264-273` the prune write has no reset-counter guard. | Open. A row written there fails the hash check at read, so nothing wrong is ever served. |

## Round 2 — verdict: warn

- All three fixes resolve their findings, with no regressions, and each new test fails against the old code.
- After the fix to finding 1, admitted proposals and the implied denominator cover the same link population.
- The reviewer keeps findings 2, 4, 6, 7 and 8 at LOW; none blocks.
