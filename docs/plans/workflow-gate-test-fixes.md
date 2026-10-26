# The 23 failing tests: causes, decisions and results (Story a20c9d2b51002bec/s1)

ISSUE-a20c9d2b51002bec, LLD-a20c9d2b51002bec-s1, PLAN-a20c9d2b51002bec-s1; built 2026-10-26.
Rule of the Story: for each test decide whether the code or the test is wrong; do not loosen the
completion gate, skip or delete a test. Result: every one of the 23 was a stale or machine-dependent
test; no production behaviour changed, and one production inventory file was corrected.

| Tests | Cause | Decision |
|---|---|---|
| 20 gate tests (`approve-build-completion`, `approve-codereview-gate`, `bugfix-orchestration`, `other-party-review-gate`) | `reviewBuildGap` (`src/workflow/code-review/build-freshness.ts`) was tightened on 2026-10-24 (`1ed200db1`, `e0c3e97d5`, `d7db76538`): a code review needs a verdict, `subject.changedFiles` covering every BUILD changeLog file, and a `subject.buildFingerprint` that matches the BUILD. The fixtures wrote bare `{ verdict, counts }` bodies. | Test wrong. One shared builder, `src/workflow/__tests__/helpers/valid-code-review.ts`, with its own test `review-record-builder.test.ts` (the gate still refuses each invalid variant). The four files build their records through it over BUILD fixtures with a two-file changeLog. |
| `artifact-write-inventory` | The scanner finds a `writeFileSync` in `src/daemon/handler-runtime.ts` (the `config.write` handler, `~/.insrc/config.json`) that had no entry, and no writer in `src/daemon/index.ts`, whose entry said it wrote pid and status files. | Inventory wrong (production file `src/workflow/artifact-write-inventory.ts`): entry added, stale entry removed. Scanner and controls unchanged. |
| `convert-repeat` | The wall-clock mask only matched dates of 2026-10-22 (a lookbehind), so the comparison failed on any other day. | Test wrong: the mask takes any wall-clock timestamp. |
| `call-limits` | `reviewDeadlineMs('issue')` reads `designReview.timeLimitMs` from `~/.insrc/config.json`; this machine sets 240000 ms, below the 300000 ms design-session silence limit. | Test wrong: it passes `DEFAULT_DESIGN_REVIEW_SETTINGS`. See the note below. |
| `build-record` t7 | The repository conversion (`66758e6e9`) renamed `BUILD-<hash>-S001.json` to `-s1.json`. | Test wrong: reads the lowercase records and asserts they exist. |
| `lock-loss-reproduction` | The raw case expected code -30775 / `MDB_LOCK_FAILURE`, recorded on macOS (System V semaphores). On Linux with the installed lmdb-js the read gives code 22, message `Invalid argument`. | Test wrong for this platform: the expectation is per platform, with the observed codes of both cases dated in a comment. The darwin branch keeps the old values and was not run here. |

## Sweep (task t11)

Foreground, `--test-force-exit`, on the Story's last commit:

| Sweep | Before | After |
|---|---|---|
| `src/workflow/**` | 2387 tests, 22 failed, 6 skipped | 2389 tests, 0 failed, 6 skipped |
| `src/db/**` | 598 tests, 1 failed, 0 skipped | 598 tests, 0 failed, 0 skipped |

The two extra workflow tests are those of `review-record-builder.test.ts`.

## Deviations from the approved LLD and PLAN

- t1: the builder's test file is `review-record-builder.test.ts` as the PLAN names it, the helper is `helpers/valid-code-review.ts`.
- t6 changed a production file (the inventory), which the LLD allowed only where a root cause is a code defect: here the inventory was the defect.
- t10: the fix is platform-aware, not a single replaced code, because the cause is the platform.
- t11 names an integration test that is a sweep, which the build gate cannot map to a case (`reported` is allowed only for live and smoke tests); the gate could not validate it, so its evidence is this table.

## A finding that is not a test defect

The machine's `~/.insrc/config.json` sets `designReview.timeLimitMs.issue` to 240000 and `feature` to 360000. The design-session silence limit is 300000 ms (`REVIEW_CALL_LIMITS`), so for an ISSUE review the whole-review deadline is shorter than the silence limit of one call. The defaults (720000 and 1080000) are above it. Whether that setting is intended is the owner's decision; nothing here changes it.
