<!-- insrc:artifact PLAN-7d2422c8f57fa483-s1 -->

# Plan: STORY-7d2422c8f57fa483-s1

## Summary

**Epic:** `code-review-reuse-refused-when-only`
**LLD run:** `wf-1794410314395-9seizo`
**LLD effective hash:** `8d914e774975...`

Building this Story changes two files in the code-review task-review module: the attempt header gains an optional identity-format field, and the attribution binding learns a second task identity format that ignores test-row provenance, carries a provenance digest for accurate rejection text, and reports every refused reuse task in one rejection. The work lands in three steps, header first, then the identity, then the format-aware bind, each with tests in a new reuse-identity test file; existing reuse tests must keep passing unchanged.

## Contents

1. [Tasks](#1-tasks)
2. [Test-strategy coverage](#2-test-strategy-coverage)
3. [References](#3-references)

## 1. Tasks

| # | Task | Size | Status | Depends on | Tests | Derived from |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| 1 | **`t1`** Record the task identity format on the attempt header | S | — | — | unit: src/workflow/code-review/task-review/__tests__/reuse-identity.test.ts: the attempt header schema accepts only the v2 identity format; unit: src/workflow/code-review/task-review/__tests__/reuse-identity.test.ts: an identity format on an unaccepted attempt is refused | [[c1]] [[c5]] [[c7]] |
| 2 | **`t2`** Add the v2 task identity and a provenance-aware fingerprint | M | — | `t1` | unit: src/workflow/code-review/task-review/__tests__/reuse-identity.test.ts: the v1 task identity equals the identity pinned from the pre-change code; unit: src/workflow/code-review/task-review/__tests__/reuse-identity.test.ts: the v2 task identity ignores command, execution details and evidence references; unit: src/workflow/code-review/task-review/__tests__/reuse-identity.test.ts: the v2 task identity changes with the test file, cases or result; unit: src/workflow/code-review/task-review/__tests__/reuse-identity.test.ts: a task with no assigned tests keeps a v2 identity over requirements, changes and documents; integration: src/workflow/code-review/task-review/__tests__/reuse-identity.test.ts: the rejection names a provenance-only change between two v1 attempts | [[c2]] [[c3]] [[c5]] [[c6]] |
| 3 | **`t3`** Bind in the attempt's format and report all reuse refusals at once | M | — | `t2` | integration: src/workflow/code-review/task-review/__tests__/reuse-identity.test.ts: a correction attempt reuses a task when only provenance text in its test rows changed; integration: src/workflow/code-review/task-review/__tests__/reuse-identity.test.ts: three tasks reused after their evidence references are removed are accepted in one submission; integration: src/workflow/code-review/task-review/__tests__/reuse-identity.test.ts: reuse is still refused with reassess feedback when a test's cases changed; integration: src/workflow/code-review/task-review/__tests__/reuse-identity.test.ts: reordered test cases refuse reuse; integration: src/workflow/code-review/task-review/__tests__/reuse-identity.test.ts: reuse from an attempt recorded under the earlier identity format is refused with reassess feedback; integration: src/workflow/code-review/task-review/__tests__/reuse-identity.test.ts: three tasks whose source used the earlier identity format are refused in one rejection naming all three; integration: src/workflow/code-review/task-review/__tests__/reuse-identity.test.ts: a saved attempt without an identity format re-binds with its stored v1 identities; integration: src/workflow/code-review/task-review/__tests__/reuse-identity.test.ts: a saved v1 attempt that reused a v1 attempt still re-binds; integration: src/workflow/code-review/task-review/__tests__/reuse-identity.test.ts: a published v2 reuse row passes the record reuse-identity check; integration: src/workflow/code-review/task-review/__tests__/attribution-binding.test.ts: existing tests pass unchanged; integration: src/workflow/code-review/task-review/__tests__/compatibility.test.ts: existing tests pass unchanged | [[c4]] [[c5]] [[c6]] [[c7]] |

### 1.1 TASK-7d2422c8f57fa483-s1-t1 — Record the task identity format on the attempt header

Add the optional taskIdentityFormat: 'final-task-v2' field to the attempt header interface and its strict schema in src/workflow/code-review/task-review/contracts.ts, export the TaskIdentityFormat type, and extend validateSavedAttribution so the field must be absent on unpinned, pending and failed attempts.

**Acceptance checks:**
- A header with taskIdentityFormat 'final-task-v2' passes the strict schema; any other value is refused.
- An unpinned, pending or failed attempt carrying taskIdentityFormat is refused with the existing messages.
- Saved attempts without the field validate exactly as before.

### 1.2 TASK-7d2422c8f57fa483-s1-t2 — Add the v2 task identity and a provenance-aware fingerprint

Give taskFinalInput and taskFinalIdentity an optional format: 'final-task-v1' (default) stays byte-identical; 'final-task-v2' hashes each test as { file, cases, result, blobOid }. Fingerprint test entries carry identity (v2 digest) and provenance (whole-row digest), and reuseMismatch takes the comparison format and compares provenance only under v1. Until t3, requireReuseIdentity passes 'final-task-v1' so behaviour is unchanged.

**Acceptance checks:**
- v1 identities equal the constants pinned from the pre-change code.
- v2 identity ignores command, executionDetails and evidenceReferences and changes with test file blob, cases (including order) and result.
- A task with no tests has a v2 identity over requirements, changes and documents.
- Under v1 the rejection text names a provenance-only test change; under v2 it does not.
- After t2 alone, existing reuse behaviour and rejection text are unchanged.

### 1.3 TASK-7d2422c8f57fa483-s1-t3 — Bind in the attempt's format and report all reuse refusals at once

bindTaskFinalIdentities resolves its format (header field, else v1 for accepted, v2 for pending), records taskIdentityFormat on a newly accepted candidate, and passes the format to the reuse check. requireReuseIdentity gains the optional format parameter and refuses a cross-format source. Source checks still throw at once; format and identity refusals are collected and raised as one TaskReviewInputError (single refusal unchanged).

**Acceptance checks:**
- Provenance-only edits keep reuse of a v2 source, for one task and for three tasks in one submission.
- A real test change still refuses reuse with the existing reassess text.
- Three tasks whose source is v1 are refused in one rejection naming all three, costing one attribution submission.
- Malformed reuse decisions (not earlier, foreign-party) still fail at once with the existing origins error.
- Saved v1 attempts, including a v1 attempt that reused a v1 attempt, re-bind unchanged.
- A published v2 reuse row passes validateTaskBody's reuse-identity check.
- Existing attribution-binding and compatibility tests pass unchanged.

## 2. Test-strategy coverage

| LLD strategy item | Covered by |
| :--- | :--- |
| taskFinalIdentity | `t2` |
| taskInputFingerprint | `t2` |
| reuseMismatch | `t2` |
| bindTaskFinalIdentities | `t3` |
| requireReuseIdentity | `t3` |
| restoreAcceptedAssignments | `t3` |
| recordAttributionRejection | `t3` |
| validateTaskBody | `t3` |

## 3. References

- **[[c1]]** `prior-artifact` `LLD s1 dataModelChanges: ReviewAttempt.header taskIdentityFormat and validateSavedAttribution`
- **[[c2]]** `prior-artifact` `LLD s1 contractDetails: taskFinalIdentity format parameter`
- **[[c3]]** `prior-artifact` `LLD s1 contractDetails: taskInputFingerprint provenance and reuseMismatch format`
- **[[c4]]** `prior-artifact` `LLD s1 contractDetails: bindTaskFinalIdentities and requireReuseIdentity`
- **[[c5]]** `prior-artifact` `LLD s1 errorPaths`
- **[[c6]]** `prior-artifact` `LLD s1 testStrategy`
- **[[c7]]** `prior-artifact` `LLD s1 migration`
