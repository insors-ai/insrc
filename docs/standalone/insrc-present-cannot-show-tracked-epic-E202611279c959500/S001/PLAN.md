<!-- insrc:artifact PLAN-9c95950064e4b916-s1 -->

# Plan: STORY-9c95950064e4b916-s1

## Summary

**Epic:** `insrc-present-cannot-show-tracked-epic`
**LLD run:** `wf-1795781226716-e61wgy`
**LLD effective hash:** `4aa2b6f12b0f...`

Building this Story is a four-task change: t1 (already built) added the status-independent artifact scanner; t2 registers its daemon-side IPC handler in every completeness table the daemon enforces; t3 adds the client-side forward and re-points insrc_present at it; t4 extends the two affected test files and confirms the daemon's own four completeness suites pass. Nothing outside pending.ts, handler-runtime.ts, repo-call-audit.ts, method-class.ts, daemon-stream.ts, server.ts and their four test files changes.

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
| 1 | **`t1`** Add resolveOpenableArtifacts to src/workflow/pending.ts | S | approved r1 | — | unit: resolveOpenableArtifacts returns a draft (never-decided) artifact; unit: resolveOpenableArtifacts returns an approved artifact; unit: resolveOpenableArtifacts returns a rejected artifact; unit: resolveOpenableArtifacts returns a non-standalone BUILD with no CR sibling; unit: resolveOpenableArtifacts excludes a non-PENDING_KINDS file (e.g. an EPIC/STORY/TASK record); unit: resolveOpenableArtifacts skips a malformed JSON file without dropping the rest of the scan | [[c1]] [[c4]] |
| 2 | **`t2`** Register the daemon-side 'workflow.openable' handler and every completeness registry it requires | M | approved r1 | `t1` | unit: handleWorkflowOpenable returns { artifacts } from a fixture repo via resolveOpenableArtifacts; unit: handleWorkflowOpenable returns { error } when repo cannot be resolved from params or repoEnv; integration: repo-call-audit.test.ts: every method of the handler registry has an audit entry, now including workflow.openable; integration: method-class.test.ts: the method set equals the keys of the constructed rpcHandlers and streamHandlers, now including workflow.openable; integration: handler-runtime.test.ts: RECORDED_RPC + ADDED_RPC equals the registered method set, now including workflow.openable in ADDED_RPC | [[c1]] [[c2]] [[c4]] |
| 3 | **`t3`** Add openableWorkflow and wire handleInsrcPresent to it | S | approved r1 | `t2` | unit: handleInsrcPresent presents a tracked-epic BUILD by artifact id with no CR sibling (the reported defect's exact case); unit: handleInsrcPresent presents the same BUILD by its repo-relative doc path; unit: handleInsrcPresent presents an already-approved artifact by name; unit: handleInsrcPresent reports notPending for a name matching zero artifacts; unit: handleInsrcPresent reports notPending for a bare filename matching more than one document (ambiguity preserved); unit: handleInsrcPresent's external response shape stays { presented: string[], notPending: string[] }; unit: handleInsrcPresent calls the daemon's 'workflow.openable' method, not 'workflow.pending'; unit: handleInsrcPresent answers a daemon error or an unreachable daemon as an explicit error, never as presented | [[c1]] [[c2]] [[c4]] |
| 4 | **`t4`** Add/extend tests for handleWorkflowOpenable and handleInsrcPresent, and confirm every completeness suite passes | M | — | `t1`, `t2`, `t3` | integration: repo-call-table.test.ts: every registered method is a table row or on the reviewed read-only list -- workflow.openable satisfies this via its RPC_AUDIT kind:'read-only' entry with no separate edit; smoke: all t1/t2/t3 proving tests exist as real, passing test cases across pending.test.ts, present-dispatch.test.ts and the three completeness-test files | [[c3]] |

### 2.1 TASK-9c95950064e4b916-s1-t1 — Add resolveOpenableArtifacts to src/workflow/pending.ts

Add the new exported function resolveOpenableArtifacts(repoPath): readonly {artifactId, mdPath}[], copying listPendingArtifacts' file-scan loop but keeping only the kind-filter (PENDING_KINDS) and the malformed-JSON try/catch guards; drop the approvalStateOf/AMD-status pending check and the BUILD/CR-sibling check entirely. Derive mdPath via the existing, already-exported deriveMdPath. (Already implemented and validated; unchanged by this revision.)

**Acceptance checks:**
- resolveOpenableArtifacts returns an entry for a PENDING_KINDS artifact file regardless of its lifecycle status (draft, approved or rejected)
- resolveOpenableArtifacts returns an entry for a non-standalone BUILD with no CR sibling
- resolveOpenableArtifacts excludes a non-PENDING_KINDS file
- resolveOpenableArtifacts skips a malformed JSON file (logged) without dropping the rest of the scan
- listPendingArtifacts itself is untouched -- no change to its own exported behavior

### 2.2 TASK-9c95950064e4b916-s1-t2 — Register the daemon-side 'workflow.openable' handler and every completeness registry it requires

Add handleWorkflowOpenable (plus WorkflowOpenableResult/WorkflowOpenableError interfaces) to src/workflow/pending.ts, mirroring handleWorkflowPending's repo-resolution rule exactly. Register a new 'workflow.openable' entry in src/daemon/handler-runtime.ts's method table (mirroring 'workflow.pending'). Add the matching entry to src/daemon/repo-call-audit.ts's RPC_AUDIT (kind: 'read-only'), to src/daemon/threads/method-class.ts's TABLE (['workflow.openable', 'session', false]), and to src/daemon/__tests__/handler-runtime.test.ts's ADDED_RPC array. These five edits must land together: the daemon's own completeness tests (repo-call-audit.test.ts, method-class.test.ts, handler-runtime.test.ts) fail if any one is missing.

**Acceptance checks:**
- handleWorkflowOpenable returns { artifacts } from a fixture repo via resolveOpenableArtifacts
- handleWorkflowOpenable returns { error } when repo cannot be resolved from params or repoEnv
- repo-call-audit.test.ts passes with 'workflow.openable' present in RPC_AUDIT
- method-class.test.ts's coverage test passes with 'workflow.openable' present in the TABLE
- handler-runtime.test.ts passes with 'workflow.openable' present in ADDED_RPC
- repo-call-table.test.ts passes with no separate edit (workflow.openable's read-only RPC_AUDIT kind satisfies it)

### 2.3 TASK-9c95950064e4b916-s1-t3 — Add openableWorkflow and wire handleInsrcPresent to it

Add openableWorkflow to src/mcp/daemon-stream.ts, mirroring pendingWorkflow's unaryRpc forward but naming 'workflow.openable'. Change handleInsrcPresent in src/mcp/server.ts to call openableWorkflow instead of pendingWorkflow; remove the now-unused pendingWorkflow import from server.ts if nothing else there needs it. Keep namesPending and the ambiguity-filter unchanged.

**Acceptance checks:**
- handleInsrcPresent presents a tracked-epic BUILD by artifact id with no CR sibling (the reported defect's exact case)
- handleInsrcPresent presents the same BUILD by its repo-relative doc path
- handleInsrcPresent presents an already-approved or already-rejected artifact by name
- handleInsrcPresent still reports notPending for a name matching zero artifacts
- handleInsrcPresent still reports notPending for a bare filename matching more than one document
- handleInsrcPresent still answers a daemon error or an unreachable daemon as an explicit error
- handleInsrcPresent's external response shape stays { presented: string[], notPending: string[] }

### 2.4 TASK-9c95950064e4b916-s1-t4 — Add/extend tests for handleWorkflowOpenable and handleInsrcPresent, and confirm every completeness suite passes

Extend src/workflow/__tests__/pending.test.ts with handleWorkflowOpenable unit tests. Update src/mcp/__tests__/present-dispatch.test.ts: every fakeDaemon() assertion of the called method name changes from 'workflow.pending' to 'workflow.openable', and every fixture object is trimmed to the minimal {artifactId, mdPath} shape. Run repo-call-audit.test.ts, method-class.test.ts, handler-runtime.test.ts and repo-call-table.test.ts to confirm their completeness checks pass with no further edits.

**Acceptance checks:**
- Every subject named in the LLD's testStrategy.testLevels has a corresponding real test case
- Every criterionId in testStrategy.acceptanceMapping (ac1-ac4) has its provingTests present and passing
- No existing test in pending.test.ts, present-dispatch.test.ts or the three completeness-test files needs to change beyond the planned method-name/fixture-shape updates

## 3. Test-strategy coverage

| LLD strategy item | Covered by |
| :--- | :--- |
| resolveOpenableArtifacts returns a draft (never-decided) artifact | `t1`, `t4` |
| resolveOpenableArtifacts returns an approved artifact | `t1`, `t4` |
| resolveOpenableArtifacts returns a rejected artifact | `t1`, `t4` |
| resolveOpenableArtifacts returns a non-standalone BUILD with no CR sibling | `t1`, `t4` |
| resolveOpenableArtifacts excludes a non-PENDING_KINDS file (e.g. an EPIC/STORY/TASK record) | `t1`, `t4` |
| resolveOpenableArtifacts skips a malformed JSON file without dropping the rest of the scan | `t1`, `t4` |
| handleWorkflowOpenable returns { artifacts } from a fixture repo via resolveOpenableArtifacts | `t2`, `t4` |
| handleWorkflowOpenable returns { error } when repo cannot be resolved from params or repoEnv | `t2`, `t4` |
| handleInsrcPresent presents a tracked-epic BUILD by artifact id with no CR sibling (the reported defect's exact case) | `t3`, `t4` |
| handleInsrcPresent presents the same BUILD by its repo-relative doc path | `t3`, `t4` |
| handleInsrcPresent presents an already-approved artifact by name | `t3`, `t4` |
| handleInsrcPresent reports notPending for a name matching zero artifacts | `t3`, `t4` |
| handleInsrcPresent reports notPending for a bare filename matching more than one document (ambiguity preserved) | `t3`, `t4` |
| handleInsrcPresent's external response shape stays { presented: string[], notPending: string[] } | `t3`, `t4` |
| handleInsrcPresent calls the daemon's 'workflow.openable' method, not 'workflow.pending' | `t3`, `t4` |
| handleInsrcPresent answers a daemon error or an unreachable daemon as an explicit error, never as presented | `t3`, `t4` |
| repo-call-audit.test.ts: every method of the handler registry has an audit entry, now including workflow.openable | `t2`, `t4` |
| method-class.test.ts: the method set equals the keys of the constructed rpcHandlers and streamHandlers, now including workflow.openable | `t2`, `t4` |
| handler-runtime.test.ts: RECORDED_RPC + ADDED_RPC equals the registered method set, now including workflow.openable in ADDED_RPC | `t2`, `t4` |
| repo-call-table.test.ts: every registered method is a table row or on the reviewed read-only list -- workflow.openable satisfies this via its RPC_AUDIT kind:'read-only' entry with no separate edit | `t4` |

## 4. References

- **[[c1]]** `prior-artifact` `LLD-9c95950064e4b916-s1 contractDetails`
- **[[c2]]** `prior-artifact` `LLD-9c95950064e4b916-s1 errorPaths`
- **[[c3]]** `prior-artifact` `LLD-9c95950064e4b916-s1 testStrategy`
- **[[c4]]** `prior-artifact` `LLD-9c95950064e4b916-s1 migration`
