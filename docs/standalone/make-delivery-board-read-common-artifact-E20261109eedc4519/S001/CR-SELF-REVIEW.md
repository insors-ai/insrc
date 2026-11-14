# Code review self-review: Story eedc4519199b24b4/s1

Recorded 2026-11-14 by the controller, the party that wrote the code. The user asked for it after the daemon review's second cycle (review `board-common-model-s1`, attempts 4-6) ended without a usable whole-story verdict. It is not an independent review.

## Why a self-review

| Attempt | Result |
| :--- | :--- |
| 4 | Refused at admission by the storage-capacity check. The Story's CR record holds three earlier rounds. `review.maxJsonBytes` was raised from 4 MiB to 8 MiB. |
| 5 | Admitted. t1-t3 and t5-t10 passed. t4 changes requested: one MED, repository-rule writes reported under the `rename` step. |
| 6 | Failed before any Task was reviewed. The reviewer's attribution was rejected three times ("Task scope omits a required replacement witness"). |

The t4 correction (`8521b3819`) has had no independent review. Since attempt 5 reviewed the source at pin `92491bba9`, the Story's code has changed only by that commit and the fixes below.

## Scope

- The t4 correction `8521b3819`: `RepairStep` gains `repo-rules`, set before the repair opens the store, and the tests assert the step.
- The whole Story at HEAD, by running every test the review packet names.
- Repository checks the daemon review does not run: the session-source inventory pins of the files this Story changed.

## Checks

- **Which writes take the new step.** `repairDeps` records `repo-rules` writes only for rule files that were missing before `createRepoLifecycle` and are present after it. Building the store, history and Task sets writes nothing else: journal recovery runs at per-artifact write time, inside the steps. So no other write is relabelled. The loop sets `current` before each step, as before.
- **Consumers of `RepairStep`.** Nothing outside `src/workflow/convert` names `RepairStep` or `RepairWrite`, including the daemon handler and both plugins. The report travels through `repo.convert` as data, and adding a member widens it. `ApplyStep`, the conversion's own step type, is unchanged.
- **Preview contract.** `repoRulesRule` already lists these writes as `repo-rules` changes. With the step corrected, the test helper `belongs()` maps `repo-rules` writes to `repo-rules` changes only. Before, it had accepted `repo-rules` changes under `rename`, the mislabelling the finding described.
- **Tests.** With `current` starting at `'rename'` again, three cases fail, so the new assertions are not vacuous.
- **Inventory pins.** `settle.ts` is pinned in `src/daemon/db/__tests__/fixtures/session-source-inventory.json`, and its pin did not match the source (see F2).
- **Tests at HEAD.** `completion-evidence.test.ts` failed 3 of 11 at HEAD (see F3).

## Findings

| Id | Severity | Finding | Resolution |
| :--- | :--- | :--- | :--- |
| F1 | LOW | The LLD's RepairReport contract says "RepairStep is every conversion step except the marker, plus 'settle'". The t4 correction adds a tenth member, `repo-rules`, which is not recorded as a deviation. | Recorded here as the deviation: repository-rule writes happen when the store opens, before any conversion step, so they get their own step. The alternative, labelling them with the first conversion step, is the defect attempt 5 found. The LLD is not edited after approval. |
| F2 | MED | `92491bba9` changed `settle.ts` without refreshing its inventory pin. `session-source-inventory.test.ts` fails today on an earlier check (new files from other work), which hides this. Once that is fixed it would fail on this digest. | Refreshed with the test's own extractor (`e30a0e038`). The site list is unchanged: one diagnostic site. |
| F3 | MED | Three `completion-evidence.test.ts` cases (`storyCodeReview maps the gate…`, and two `rollUp over real records` subtests) failed at HEAD. Bisected to `8ebc81c96` (Story e4af6312, 2026-11-13). That commit blocks completion when the BUILD author is unknown or is the reviewing party. The fixture's BUILD had no `authoredBy`. The Story's code is correct. Its tests, written before that rule, were not updated. | The fixture BUILD is now controller-authored against the daemon review (`d73c4fb0d`). 11 of 11 pass. Before the change the file passed at `cdb65e9fd` and failed from `8ebc81c96` on. |

## Verification

- Run at HEAD:
  - every daemon test file in the review packet (Node 22): 16 files, all pass after F3;
  - the four plugin test files (default node): 80 of 80 pass;
  - `repair.test.ts`, `repair-settle.test.ts`, `repair-tasks.test.ts`, `convert-apply.test.ts` and `convert-repeat.test.ts`: 32 of 32 pass.
- `tsc --noEmit` is clean.
- Not verified: `session-source-inventory.test.ts` as a whole. It fails at HEAD on files added by other work, before it reaches the digest comparison. The full test sweep was not run.

No open MED or HIGH findings from this self-review. F1 is recorded above.
