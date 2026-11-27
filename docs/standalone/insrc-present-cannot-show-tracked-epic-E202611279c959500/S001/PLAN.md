<!-- insrc:artifact PLAN-9c95950064e4b916-s1 -->

# Plan: STORY-9c95950064e4b916-s1

## Summary

**Epic:** `insrc-present-cannot-show-tracked-epic`
**LLD run:** `wf-1795776322035-75xiwb`
**LLD effective hash:** `3a4bff303fb3...`

Building this Story is a small, three-step change: add one new function to pending.ts that enumerates the same artifact files listPendingArtifacts already scans but without its pending/CR-sibling business rules, re-point insrc_present's existing handler at that new function instead, then extend the existing test files for both modules to prove the new presentability and the preserved error-path/ambiguity behavior. Nothing outside src/workflow/pending.ts, src/mcp/server.ts and their two existing test files changes.

## Contents

1. [Epic impact analysis](#1-epic-impact-analysis)
2. [Tasks](#2-tasks)
3. [Test-strategy coverage](#3-test-strategy-coverage)
4. [References](#4-references)

## 1. Epic impact analysis

**Does not apply**: Standalone bugfix Story with no prior Story of this Epic; there is nothing already built to analyse.

## 2. Tasks

| # | Task | Size | Status | Depends on | Tests | Derived from |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| 1 | **`t1`** Add resolveOpenableArtifacts to src/workflow/pending.ts | S | — | — | unit: resolveOpenableArtifacts returns a draft (never-decided) artifact; unit: resolveOpenableArtifacts returns an approved artifact; unit: resolveOpenableArtifacts returns a rejected artifact; unit: resolveOpenableArtifacts returns a non-standalone BUILD with no CR sibling; unit: resolveOpenableArtifacts excludes a non-PENDING_KINDS file (e.g. an EPIC/STORY/TASK record); unit: resolveOpenableArtifacts skips a malformed JSON file without dropping the rest of the scan | [[c1]] [[c4]] |
| 2 | **`t2`** Wire handleInsrcPresent to resolveOpenableArtifacts | S | — | `t1` | unit: handleInsrcPresent presents a tracked-epic BUILD by artifact id with no CR sibling (the reported defect's exact case); unit: handleInsrcPresent presents the same BUILD by its repo-relative doc path; unit: handleInsrcPresent presents an already-approved artifact by name; unit: handleInsrcPresent reports notPending for a name matching zero artifacts; unit: handleInsrcPresent reports notPending for a bare filename matching more than one document (ambiguity preserved); unit: handleInsrcPresent's external response shape stays { presented: string[], notPending: string[] } | [[c1]] [[c2]] [[c4]] |
| 3 | **`t3`** Add/extend tests for resolveOpenableArtifacts and handleInsrcPresent per the test strategy | M | — | `t1`, `t2` | smoke: all t1/t2 proving tests exist as real, passing test cases across pending.test.ts and the handleInsrcPresent test file | [[c3]] |

### 2.1 TASK-9c95950064e4b916-s1-t1 — Add resolveOpenableArtifacts to src/workflow/pending.ts

Add the new exported function resolveOpenableArtifacts(repoPath): readonly {artifactId, mdPath}[], copying listPendingArtifacts' file-scan loop but keeping only the kind-filter (PENDING_KINDS) and the malformed-JSON try/catch guards; drop the approvalStateOf/AMD-status pending check and the BUILD/CR-sibling check entirely. Derive mdPath via the existing, already-exported deriveMdPath.

**Acceptance checks:**
- resolveOpenableArtifacts returns an entry for a PENDING_KINDS artifact file regardless of its lifecycle status (draft, approved or rejected)
- resolveOpenableArtifacts returns an entry for a non-standalone BUILD with no CR sibling
- resolveOpenableArtifacts excludes a non-PENDING_KINDS file
- resolveOpenableArtifacts skips a malformed JSON file (logged) without dropping the rest of the scan
- listPendingArtifacts itself is untouched -- no change to its own exported behavior

### 2.2 TASK-9c95950064e4b916-s1-t2 — Wire handleInsrcPresent to resolveOpenableArtifacts

Change handleInsrcPresent (src/mcp/server.ts) to read its openable set from resolveOpenableArtifacts instead of pending.artifacts (the listPendingArtifacts/pendingWorkflow call); keep namesPending and the ambiguity-filter (names matching more than one document stay notPending) unchanged. Remove the now-unused pendingWorkflow call/import if nothing else in the function needs it.

**Acceptance checks:**
- handleInsrcPresent presents a tracked-epic BUILD by artifact id with no CR sibling (the reported defect's exact case)
- handleInsrcPresent presents the same BUILD by its repo-relative doc path
- handleInsrcPresent presents an already-approved or already-rejected artifact by name
- handleInsrcPresent still reports notPending for a name matching zero artifacts
- handleInsrcPresent still reports notPending for a bare filename matching more than one document
- handleInsrcPresent's external response shape stays { presented: string[], notPending: string[] }

### 2.3 TASK-9c95950064e4b916-s1-t3 — Add/extend tests for resolveOpenableArtifacts and handleInsrcPresent per the test strategy

Extend src/workflow/__tests__/pending.test.ts with resolveOpenableArtifacts unit tests (draft/approved/rejected artifact, non-standalone BUILD with no CR sibling, non-PENDING_KINDS exclusion, malformed-file skip), following that file's existing temp-repo fixture style, and extend handleInsrcPresent's own test file with the new presentability cases named in the test strategy.

**Acceptance checks:**
- Every subject named in the LLD's testStrategy.testLevels has a corresponding real test case
- Every criterionId in testStrategy.acceptanceMapping (ac1, ac2, ac3) has its provingTests present and passing
- No existing test in pending.test.ts or the handleInsrcPresent test file needs to change to accommodate the new tests

## 3. Test-strategy coverage

| LLD strategy item | Covered by |
| :--- | :--- |
| resolveOpenableArtifacts returns a draft (never-decided) artifact | `t1`, `t3` |
| resolveOpenableArtifacts returns an approved artifact | `t1`, `t3` |
| resolveOpenableArtifacts returns a rejected artifact | `t1`, `t3` |
| resolveOpenableArtifacts returns a non-standalone BUILD with no CR sibling | `t1`, `t3` |
| resolveOpenableArtifacts excludes a non-PENDING_KINDS file (e.g. an EPIC/STORY/TASK record) | `t1`, `t3` |
| resolveOpenableArtifacts skips a malformed JSON file without dropping the rest of the scan | `t1`, `t3` |
| handleInsrcPresent presents a tracked-epic BUILD by artifact id with no CR sibling (the reported defect's exact case) | `t2`, `t3` |
| handleInsrcPresent presents the same BUILD by its repo-relative doc path | `t2`, `t3` |
| handleInsrcPresent presents an already-approved artifact by name | `t2`, `t3` |
| handleInsrcPresent reports notPending for a name matching zero artifacts | `t2`, `t3` |
| handleInsrcPresent reports notPending for a bare filename matching more than one document (ambiguity preserved) | `t2`, `t3` |
| handleInsrcPresent's external response shape stays { presented: string[], notPending: string[] } | `t2`, `t3` |

## 4. References

- **[[c1]]** `prior-artifact` `LLD-9c95950064e4b916-s1 contractDetails`
- **[[c2]]** `prior-artifact` `LLD-9c95950064e4b916-s1 errorPaths`
- **[[c3]]** `prior-artifact` `LLD-9c95950064e4b916-s1 testStrategy`
- **[[c4]]** `prior-artifact` `LLD-9c95950064e4b916-s1 migration`
