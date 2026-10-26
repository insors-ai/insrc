<!-- insrc:artifact PLAN-a20c9d2b51002bec-s1 -->

# Plan: STORY-a20c9d2b51002bec-s1

## Summary

**Epic:** `fix-23-failing-tests-workflow-gate`
**LLD run:** `wf-1793001444573-acy973`
**LLD effective hash:** `f5d6ef446651...`

A test-only Story in three parts. First a shared builder of valid code review records with its own test. Then the four gate test files move onto it one at a time. Last five independent tests are corrected at their own causes, and the workflow and db sweeps run once at the end to compare with the base.

## Contents

1. [Tasks](#1-tasks)
2. [Test-strategy coverage](#2-test-strategy-coverage)
3. [References](#3-references)

## 1. Tasks

| # | Task | Size | Status | Depends on | Tests | Derived from |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| 1 | **`t1`** Add the shared builder of valid code review records and its test | M | — | — | unit: review-record-builder.test.ts: the builder's record passes reviewBuildGap for a BUILD with a two-file changeLog; unit: review-record-builder.test.ts: reviewBuildGap still refuses a review with no verdict, no changedFiles, no buildFingerprint, a stale fingerprint or an uncovered changeLog file | [[c1]] [[c2]] |
| 2 | **`t2`** Move approve-codereview-gate.test.ts onto the builder | M | — | `t1` | integration: approve-codereview-gate.test.ts: all ten tests pass through the real approve path | [[c1]] [[c2]] |
| 3 | **`t3`** Move approve-build-completion.test.ts onto the builder | M | — | `t1` | integration: approve-build-completion.test.ts: every test of the file passes through the real approve path | [[c1]] [[c2]] |
| 4 | **`t4`** Move bugfix-orchestration.test.ts onto the builder | S | — | `t1` | integration: bugfix-orchestration.test.ts: every test of the file passes, including the two ac3 completion tests | [[c1]] [[c2]] |
| 5 | **`t5`** Move other-party-review-gate.test.ts onto the builder | M | — | `t1` | integration: other-party-review-gate.test.ts: every test of the file passes, including the eight T7 tests | [[c1]] [[c2]] |
| 6 | **`t6`** Bring the artifact write inventory in line with the daemon | S | — | — | unit: artifact-write-inventory.test.ts: every writer file is inventoried, annotated and classified as the design says | [[c1]] [[c2]] |
| 7 | **`t7`** Make convert-repeat independent of the clock | S | — | — | unit: convert-repeat.test.ts: a second apply and an apply crashed at each step then rerun write nothing more | [[c1]] [[c3]] |
| 8 | **`t8`** Make call-limits independent of the user's config | S | — | — | unit: call-limits.test.ts: REVIEW_CALL_LIMITS holds the five call-type rows and every silence limit is below its call's limit | [[c1]] [[c3]] |
| 9 | **`t9`** Point build-record t7 at the converted records | S | — | — | unit: build-record.test.ts: t7 the three hand-filled records prove the gap was real | [[c1]] [[c3]] |
| 10 | **`t10`** Make the LMDB lock-loss test describe the installed library | M | — | — | unit: lock-loss-reproduction.test.ts: reproduction against the real library | [[c1]] [[c3]] |
| 11 | **`t11`** Run the workflow and db sweeps once and compare with the base | S | — | `t1`, `t2`, `t3`, `t4`, `t5`, `t6`, `t7`, `t8`, `t9`, `t10` | integration: the workflow and db sweeps report no failing test and no new skipped test | [[c1]] [[c2]] |

### 1.1 TASK-a20c9d2b51002bec-s1-t1 — Add the shared builder of valid code review records and its test

Add a non-test helper file under src/workflow/__tests__/helpers that builds a code review record (verdict, counts, subject.changedFiles covering every BUILD changeLog file, subject.buildFingerprint from reviewedBuildFingerprint, and optional meta so a test can set the author and reviewer parties) for a given BUILD record. Add a separate .test.ts file that checks reviewBuildGap accepts the builder's record and still refuses each invalid variant: no verdict, no changedFiles, no buildFingerprint, a stale fingerprint, an uncovered changeLog file.

**Acceptance checks:**
- The builder's record gives reviewBuildGap undefined for a BUILD with a two-file changeLog
- Each of the five invalid variants is refused with the gate's own message
- The builder file is not named .test.ts and the builder has its own test file
- No production file is changed

### 1.2 TASK-a20c9d2b51002bec-s1-t2 — Move approve-codereview-gate.test.ts onto the builder

Make writeCR of approve-codereview-gate.test.ts build its body through the shared builder, and give its BUILD fixtures a changeLog the review covers. Keep the corrupt-record case as it is.

**Acceptance checks:**
- The five failing tests of the file (ac1, ac3 twice, ac5, ac6) pass
- The five passing tests still pass
- No test is skipped or deleted

### 1.3 TASK-a20c9d2b51002bec-s1-t3 — Move approve-build-completion.test.ts onto the builder

Make writeCR of approve-build-completion.test.ts build its body through the shared builder, with BUILD fixtures whose changeLog the review covers.

**Acceptance checks:**
- The four failing tests (ac1, ac2, ac5, ac6) pass
- The other tests of the file still pass
- No test is skipped or deleted

### 1.4 TASK-a20c9d2b51002bec-s1-t4 — Move bugfix-orchestration.test.ts onto the builder

Make writeCR of bugfix-orchestration.test.ts build its body through the shared builder.

**Acceptance checks:**
- The two failing ac3 tests pass
- The rest of the file still passes
- No test is skipped or deleted

### 1.5 TASK-a20c9d2b51002bec-s1-t5 — Move other-party-review-gate.test.ts onto the builder

Make the code review record the file writes come from the shared builder, passing the author and reviewer parties the test already sets through the builder's optional meta; keep the corrupt-record write.

**Acceptance checks:**
- The eight failing T7 tests pass
- The rest of the file still passes
- No test is skipped or deleted

### 1.6 TASK-a20c9d2b51002bec-s1-t6 — Bring the artifact write inventory in line with the daemon

Read src/daemon/handler-runtime.ts and src/daemon/index.ts, add the inventory entry the scanner needs for the first and correct or remove the stale entry for the second.

**Acceptance checks:**
- artifact-write-inventory.test.ts passes
- The entries say what each file really does
- The scanner and its controls are unchanged

### 1.7 TASK-a20c9d2b51002bec-s1-t7 — Make convert-repeat independent of the clock

Mask the 'at' timestamps when the test compares an uninterrupted apply with a crashed-and-rerun apply.

**Acceptance checks:**
- convert-repeat.test.ts passes on repeated runs
- A real difference other than the timestamp still fails the comparison

### 1.8 TASK-a20c9d2b51002bec-s1-t8 — Make call-limits independent of the user's config

Give the deadline assertions DEFAULT_DESIGN_REVIEW_SETTINGS so the test does not read ~/.insrc/config.json.

**Acceptance checks:**
- call-limits.test.ts passes with this machine's config
- It would also pass with no config file

### 1.9 TASK-a20c9d2b51002bec-s1-t9 — Point build-record t7 at the converted records

Read the lowercase s1 records the repository conversion produced for the three hashes; if a hash has no record, fail with a clear message instead of skipping.

**Acceptance checks:**
- build-record.test.ts t7 passes
- The three hashes are all checked

### 1.10 TASK-a20c9d2b51002bec-s1-t10 — Make the LMDB lock-loss test describe the installed library

Run the reproduction first and record the code and message the installed library gives for the raw case and the store-backed case separately, then assert them and keep the transaction and healthy-control assertions.

**Acceptance checks:**
- lock-loss-reproduction.test.ts passes
- Each case states the code it observed, taken from a run before any assertion changed
- The transaction and healthy-control assertions are unchanged

### 1.11 TASK-a20c9d2b51002bec-s1-t11 — Run the workflow and db sweeps once and compare with the base

After all tasks, run the workflow and db test sweeps in foreground chunks and compare failing and skipped counts with the base commit.

**Acceptance checks:**
- No test fails in the workflow and db sweeps
- No test is skipped that was not skipped on the base

## 2. Test-strategy coverage

| LLD strategy item | Covered by |
| :--- | :--- |
| the builder of valid review records used by the gate tests | `t1` |
| reviewBuildGap in src/workflow/code-review/build-freshness.ts | `t1` |
| src/workflow/__tests__/approve-build-completion.test.ts | `t3` |
| src/workflow/__tests__/approve-codereview-gate.test.ts | `t2` |
| src/workflow/__tests__/bugfix-orchestration.test.ts | `t4` |
| src/workflow/__tests__/other-party-review-gate.test.ts | `t5` |
| src/workflow/__tests__/artifact-write-inventory.test.ts | `t6` |
| src/workflow/convert/__tests__/convert-repeat.test.ts | `t7` |
| src/workflow/review/__tests__/call-limits.test.ts | `t8` |
| src/workflow/runners/build/__tests__/build-record.test.ts | `t9` |
| src/db/graph/__tests__/lock-loss-reproduction.test.ts | `t10` |

## 3. References

- **[[c1]]** `prior-artifact` `LLD-a20c9d2b51002bec-s1 contract details and test strategy`
- **[[c2]]** `prior-artifact` `LLD-a20c9d2b51002bec-s1 migration steps 1, 2 and 6`
- **[[c3]]** `prior-artifact` `LLD-a20c9d2b51002bec-s1 error paths and migration steps 3 to 5`
