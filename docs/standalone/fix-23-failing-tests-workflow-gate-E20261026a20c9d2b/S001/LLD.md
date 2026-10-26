<!-- insrc:artifact LLD-a20c9d2b51002bec-s1 -->

# LLD: STORY-a20c9d2b51002bec-s1

## Summary

**Epic:** `fix-23-failing-tests-workflow-gate`
**HLD base run:** `wf-1793001444573-acy973`
**HLD effective hash:** `f5d6ef446651...`

No production contract changes. The Story corrects 23 tests whose expectations are out of date with code that is right. The gate tests get one shared builder of valid code review records, so they satisfy the current freshness rule instead of the rule being relaxed; the inventory, convert-repeat, call-limits, build-record and LMDB tests are each corrected at their own cause.

## Contents

1. [HLD context](#1-hld-context)
2. [Contract details](#2-contract-details)
3. [Error paths](#3-error-paths)
4. [Test strategy](#4-test-strategy)
5. [Migration](#5-migration)
6. [Alternatives considered](#6-alternatives-considered)
7. [References](#7-references)

## 1. HLD context

**Framework:** Standalone feature — no parent HLD. Design directly against the repo, grounded on the s1 analyze passes. There are no HLD shared contracts to honour.
**Rollout phase:** standalone

## 2. Contract details

**Surface level:** internal

### 2.1 `reviewBuildGap`

```typescript
reviewBuildGap(build: unknown, review: unknown, repoPath: string): string | undefined
```

**Parameters:**
- `build: unknown` — the BUILD record being approved
- `review: unknown` — its code review record
- `repoPath: string` — root for resolving changed files

**Returns:** `string | undefined` — the reason the review cannot satisfy completion, or undefined when it is fresh and complete

**Preconditions:**
- unchanged by this Story

**Postconditions:**
- a review without a verdict, a changedFiles list or a matching buildFingerprint is still refused

### 2.2 `reviewedBuildFingerprint`

```typescript
reviewedBuildFingerprint(build: unknown): string
```

**Parameters:**
- `build: unknown` — the BUILD record

**Returns:** `string` — the content hash a valid review carries as subject.buildFingerprint

**Preconditions:**
- unchanged by this Story

**Postconditions:**
- the shared test builder of valid review records calls it, so fixtures follow the rule

### 2.3 `reviewDeadlineMs`

```typescript
reviewDeadlineMs(complexity: DesignComplexity, settings?: DesignReviewSettings): number
```

**Parameters:**
- `complexity: DesignComplexity` — issue, feature or epic
- `settings: DesignReviewSettings` _(optional)_ — defaults to the settings read from the user's config

**Returns:** `number` — the whole-review deadline in ms, capped at HARD_REVIEW_DEADLINE_MS

**Preconditions:**
- unchanged by this Story

**Postconditions:**
- the call-limits test passes DEFAULT_DESIGN_REVIEW_SETTINGS so it does not read the user's config

## 3. Error paths

**Error cases**

- **A rebuilt gate fixture is still incomplete (a missing changedFiles entry for a changeLog file, or a stale fingerprint) so the gate refuses it again** (recoverable)
  - Detection: the test asserts the specific outcome (completed, withheld, blocked) and fails with the gate's own message, e.g. 'the code review does not cover BUILD file'
  - Response: the shared builder derives changedFiles from the BUILD's changeLog and the fingerprint from reviewedBuildFingerprint, so the fixture is valid by construction
  - User impact: none; tests only
- **The build-record t7 test cannot find a hand-filled record because a record is missing after the repository conversion** (recoverable)
  - Detection: readFileSync throws ENOENT for the path
  - Response: read the lowercase s1 record the conversion produced; if one of the three hashes has no record, say so in the test rather than skipping it
  - User impact: none; tests only
- **The LMDB behaviour differs between library versions** (recoverable)
  - Detection: the read throws a different code than the test pins
  - Response: the test asserts what the installed library does for each case and states the code observed, so a library upgrade changes the test on purpose
  - User impact: none; tests only

**Edge cases**

| Input | Expected |
| :--- | :--- |
| The call-limits test runs on a machine whose ~/.insrc/config.json sets designReview limits | the test passes the default settings explicitly and gives the same result on every machine |
| The convert-repeat comparison between an uninterrupted run and a crashed-and-rerun run | equal except for the 'at' timestamps, which the comparison masks |
| The inventory scanner finds a file with an entry that no longer matches, and a file with no entry | the stale entry is corrected or removed and the new file is inventoried with the class and way it writes |

**Invariants to preserve**

- reviewBuildGap still refuses a code review with no readable verdict, no changedFiles list, no buildFingerprint, a fingerprint that differs from the BUILD, or one that does not cover a changeLog file [[c1]]
- Production code is not changed to make a test pass; any production edit must be justified by a root cause that is a code defect [[c1]]
- No test is skipped, deleted or weakened to make the sweep green [[c1]]

## 4. Test strategy

**Test framework:** `node:test run with npx tsx --test`

**Test levels**

- **unit** — The shared builder of valid code review records satisfies reviewBuildGap, and each way of making it invalid is still refused
  - Subjects: `the builder of valid review records used by the gate tests`, `reviewBuildGap in src/workflow/code-review/build-freshness.ts`
  - Fixtures: `a BUILD record with a changeLog of two files`
- **integration** — The 20 gate tests complete, withhold and block as their names say, through the real approve path
  - Subjects: `src/workflow/__tests__/approve-build-completion.test.ts`, `src/workflow/__tests__/approve-codereview-gate.test.ts`, `src/workflow/__tests__/bugfix-orchestration.test.ts`, `src/workflow/__tests__/other-party-review-gate.test.ts`
  - Fixtures: `temporary repository with BUILD and CR records written through the shared builder`
- **unit** — The five corrected tests describe the current code and are independent of the machine
  - Subjects: `src/workflow/__tests__/artifact-write-inventory.test.ts`, `src/workflow/convert/__tests__/convert-repeat.test.ts`, `src/workflow/review/__tests__/call-limits.test.ts`, `src/workflow/runners/build/__tests__/build-record.test.ts`, `src/db/graph/__tests__/lock-loss-reproduction.test.ts`

**Acceptance mapping**

| Criterion | Proving tests |
| :--- | :--- |
| `ac1` | `approve-build-completion.test.ts: ac1 epic-batch sweep includes a pending BUILD`, `approve-codereview-gate.test.ts: ac1 enforce on + CR block + no override`, `other-party-review-gate.test.ts: T7 a BUILD record written AND code-reviewed by the controller is withheld`, `bugfix-orchestration.test.ts: ac3 a bugfix BUILD + enforce + CR pass -> completes` |
| `ac2` | `artifact-write-inventory.test.ts: every writer file is inventoried`, `convert-repeat.test.ts: a second apply and an apply crashed at each step then rerun write nothing more`, `call-limits.test.ts: REVIEW_CALL_LIMITS holds the five call-type rows`, `build-record.test.ts: t7`, `lock-loss-reproduction.test.ts: reproduction against the real library` |
| `ac3` | `the builder test: a review without a verdict, changedFiles or buildFingerprint, or with a stale fingerprint or an uncovered changeLog file, is still refused by reviewBuildGap` |
| `ac4` | `the full workflow and db sweeps report no failing test and no skipped test that was not skipped before` |

## 5. Migration

**State before:** 23 tests fail on the base commit: 20 gate tests write code review records the tightened freshness rule refuses (src/workflow/code-review/build-freshness.ts), and 3 + 3 others are out of date with the code, the repository conversion, the user's config or the installed LMDB library.

**State after:** All 23 tests pass and describe current behaviour; the freshness rule is unchanged; the gate tests build their review records through one shared builder; no test is skipped or deleted; no production file changes unless a root cause turns out to be a code defect.

**Zero downtime:** yes — **Data rewrite:** no

**Steps**

1. Add the shared builder of valid code review records and its own test that the gate still refuses each way of making a record invalid — ↩ rollbackable
2. Move the four gate test files onto the builder, one file at a time, running each file after the change — ↩ rollbackable
3. Correct the artifact write inventory entries for src/daemon/handler-runtime.ts and src/daemon/index.ts after reading what each file does — ↩ rollbackable
4. Make the convert-repeat comparison ignore the clock, the call-limits test use the default settings, and the build-record t7 test read the lowercase s1 records — ↩ rollbackable
5. Make the LMDB lock-loss test assert what the installed library does, stating the code it observes — ↩ rollbackable
6. Run the workflow and db sweeps and compare the failing and skipped counts with the base — ↩ rollbackable

**Backward compat:** No public API changes; only test files and, if one is found to be a real defect, the named production file.

## 6. Alternatives considered

### 6.1 a1: One shared valid-review fixture builder — **CHOSEN**

The four gate test files build their code review records through one helper that fills verdict, changedFiles and the BUILD fingerprint from reviewedBuildFingerprint; the other seven tests are fixed in place.

Add a test helper that, given the BUILD record a test writes, produces a code review record whose body carries the verdict, subject.changedFiles covering every changeLog file, and subject.buildFingerprint computed by reviewedBuildFingerprint. The four gate files call it instead of hand-writing CR bodies. The gate code is not touched. The other seven tests are corrected one by one: the inventory entries, the clock-free convert-repeat comparison, the call-limits test using DEFAULT_DESIGN_REVIEW_SETTINGS, the build-record t7 path, and the LMDB expectation.

### 6.2 a2: Edit each gate fixture inline

Add the three missing fields by hand to every CR fixture in the four gate files.

Without a helper, extend each hand-written CR record in the four gate test files with changedFiles and a buildFingerprint computed in place. The other seven tests are fixed as in a1.

**Rejected because:** Correct but repeats the fixture logic across about twenty tests and drifts when the rule changes.

### 6.3 a3: Relax the gate to accept bare reviews

Make reviewBuildGap accept a review without a fingerprint or changedFiles so the old fixtures pass.

Weaken reviewBuildGap so a missing buildFingerprint or changedFiles is treated as fresh. Rejected by the Story: it removes the 2026-10-24 protection against approving a BUILD with a stale or unbound review.

**Rejected because:** Violates the Story's rule that the gate is not loosened.

## 7. References

- **[[c1]]** `code` `src/workflow/code-review/build-freshness.ts` — "return 'the code review structure cannot be verified'"
- **[[c2]]** `code` `src/workflow/review/template.ts`
- **[[c3]]** `code` `src/workflow/review/call-limits.ts`
- **[[c4]]** `code` `src/workflow/runners/build/__tests__/build-record.test.ts`
- **[[c5]]** `code` `src/workflow/artifact-write-inventory.ts`
- **[[c6]]** `code` `src/workflow/convert/__tests__/convert-repeat.test.ts`
- **[[c7]]** `code` `src/db/graph/__tests__/lock-loss-reproduction.test.ts`

<!-- insrc:review -->

## Review

### ⚠️ Review `WARN` — design.story (design.story)

**0 do not hold · 1 could not be verified · 5 hold** · template `design-issue` · model `cli-codex:gpt-6.1-sol` · reviewed 2026-10-26T08:00:13.056Z

Only a premise that does not hold blocks approval. One that could not be verified is listed for the reader and does not block.

#### Does not hold (blocks approval)

_None._

#### Could not verify (does not block)

| Check item | Premise | What was tried and what was missing | Action |
| --- | --- | --- | --- |
| current-behaviour | The installed LMDB library's lock-loss behavior justifies changing the pinned read error expectation. | Read both reproduction cases and runLockLossSequence. The raw case expects -30775/MDB_LOCK_FAILURE; the store-backed case expects 22/MDB_BAD_RSLOT. Confirming the installed library requires executing child processes that create temporary stores, which this read-only environment does not permit. The analyzer returned an off-topic, incomplete bundle and supplied no runtime evidence. [files: src/db/graph/__tests__/lock-loss-reproduction.test.ts, src/db/graph/__tests__/helpers/store-child-driver.ts] | Before changing assertions, record the observed code and message separately for raw and store-backed cases; retain transaction and healthy-control assertions. |
