# Design review record: LLD-7d2422c8f57fa483-s1

Review id `lld-7d2422c8f57fa483-s1`.

## Round 1: daemon reviewer, changes requested

2 HIGH, 6 MED and 5 LOW findings. The design was revised to cover every one.

| Id | Severity | Finding | Change |
| :--- | :--- | :--- | :--- |
| f1-format-mismatch-recurs-per-task | HIGH | The format refusal threw at the first task, so moving from the old format would use up the three-submission budget one task at a time, the same failure as the bug. | `bindTaskFinalIdentities` checks every reuse assignment and raises one rejection that names every refused task. A single refusal keeps today's field and text. |
| ts-ac5-redundant | HIGH | ac5 had no test of its own. | New test: three tasks reused after their evidence references are removed are accepted in one submission. |
| f1-format-resolution-gap | MED | The reuse check resolved the current format from the header, which is written only after the check. | `requireReuseIdentity` takes an optional `format`. The bind passes its own format. |
| f2-fingerprint-format-mismatch | MED | An always-v2 fingerprint would hide a provenance change between two v1 attempts. | Fingerprint test entries carry `identity` (v2) and `provenance` (whole row). `reuseMismatch` compares provenance only under v1. |
| ts-edgecases-untested | MED | Reordered cases and a task with no tests had no test. | Tests added for both. |
| ts-record76-reuse-row-untested | MED | The `record.ts` reuse check on a v2 row was untested. | Test added through `validateTaskBody`. |
| a2-con-inaccurate | MED | a2's rejection blamed `record.ts`, which compares stored strings in both a1 and a2. | Rejection now rests on trial inference and the unrecorded one-format rule. |
| fc1-migration-repeats-unreconciled-reassess-once-claim | MED | §6 repeated the "reassessed once" claim. | §4 and §6 now state that the transition costs one submission in total. |
| rollback-prereq-unguarded | LOW | Rollback precondition had no check. | Names the check: search the code-review checkpoints under `.insrc/tmp` for `taskIdentityFormat`. |
| f2-budget-citation-wrong-location, c2-citation-bundling-imprecise | LOW | Budget and schema facts cited at `record.ts:76`. | Separate citations for `record.ts:73-77`, `attribution-repair.ts:6` and `contracts.ts:130`. |
| missing-reduce-scope-alternative | LOW | Narrowing the identity in place was not considered. | Added as a4, rejected because it breaks ac3. |
| ts-no-scale-repro | LOW | No test at the reported scale. | Covered by the three-task ac5 and transition tests. |

## Round 2: controller self-review, changes requested

The daemon reviewer paused attempt 2 with `technical_retry_exhausted` in the impact phase ("Unit /body/summary lacks matching substantive coverage", three retries) before reviewing any chunk. This is the same correction-round defect seen on LLD-66d4d41d99f805af-s1. On that LLD the user directed: "design review is broken, use the process defined to do a manual self-review". The same process is used here.

Checked against the code:

- **Bind order.** In `src/workflow/code-review/task-review/attribution-binding.ts:121-140` the candidate is built, compared with an accepted header, validated, then reuse is checked (line 136) before `Object.assign` (line 138). Passing the bind format to the reuse check is therefore required and enough.
- **Candidate keys.** A re-bound v1 attempt's candidate must not carry `taskIdentityFormat`, or the per-key deep-equality against a header without it would fail. The LLD writes the field only for a pending attempt, which is correct.
- **Fingerprint.** The v1 `provenance` digest covers file, cases and result as well as provenance text, so comparing `identity` or `provenance` under v1 finds every change it found before.
- **Callers.** `src/workflow/code-review/task-review/assessment.ts:78` calls `requireReuseIdentity` after acceptance, when the header already carries the format, so the default is right. `admission.ts:50` calls `taskInputFingerprint` unchanged.
- **Existing tests.** The `attribution-binding.test.ts` reuse tests change a source or a test file's content, so they still refuse under v2. The single-refusal text they assert is kept.

| Id | Severity | Finding | Change |
| :--- | :--- | :--- | :--- |
| ac3-proof-not-cross-version | MED | ac3 relies on tests that compute and check identities with the same code. No existing test pins an identity literal, so a change to the v1 input would go unnoticed. | Add a test that pins v1 identities computed with the pre-change code on a hand-built prepared packet: `7b854ad9e2e64cb264d9d32e5f9680c201e002faec9a15f59a7c58a0f141ab95` with one test row, `93a44cddf3b97cb48249894b044e9bd0672bc7d12787ab0472f94ea974c7a489` with no tests. |
| source-check-collection-unstated | LOW | The LLD does not say whether the existing source checks (missing, later or foreign-party source) are collected with the refusals. | State that they still throw at once, unchanged. They reject a malformed decision, not changed inputs. |
| format-on-unaccepted-attempt | LOW | `validateSavedAttribution` does not say that `taskIdentityFormat` must be absent unless the attempt is accepted. | Require it absent on unpinned, pending and failed attempts, as for the other accepted-only fields. |

## Round 3: controller self-review, passed

Checked the regenerated LLD against the round-2 findings and the code:

- **Pinned identities.** §5 names both v1 identities computed with the unmodified `attribution-binding.ts` (`git diff` was empty when they were computed), and ac3 maps to the test that asserts them.
- **Source checks.** §2.2, §2.3 and §4 state that the existing source checks throw at once and are not collected. Only format and identity refusals are combined.
- **Accepted-only field.** §2.6 and §4 require `taskIdentityFormat` absent on unpinned, pending and failed attempts, with a mapped test. The migration step 1 includes it.
- **Consistency.** No section still claims "reassessed once"; §4, §6 and the summary all state one rejection per submission.

No open MED or HIGH findings. Three rounds used, the limit for this cycle.
