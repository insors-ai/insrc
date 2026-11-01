<!-- insrc:artifact PLAN-64703b708590bd68-s1 -->

# Plan: STORY-64703b708590bd68-s1

## Summary

**Epic:** `reject-file-modifying-daemon-calls-do`
**LLD run:** `wf-1793560988617-vu6v8b`
**LLD effective hash:** `4a3b2b227144...`

The build first records, from the code, which daemon methods and step phases modify files. It then adds one gate and its table with unit tests, makes the MCP server and the terminal client send an absolute repo, and wires the gate in two steps: the approval family first, which is the defect that was hit, then every other modifying method and the modifying step phases. It ends with the documentation, a check that the installed daemon checkout is clean, and one full test sweep.

## Contents

1. [Tasks](#1-tasks)
2. [Test-strategy coverage](#2-test-strategy-coverage)
3. [References](#3-references)

## 1. Tasks

| # | Task | Size | Status | Depends on | Tests | Derived from |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| 1 | **`t1`** Audit which RPC methods and step phases modify files | M | — | — | unit: repo-call-audit.test.ts: every method of the handler registry and every step phase has an audit entry marked modifying, read-only or daemon-store | [[c1]] [[c3]] |
| 2 | **`t2`** Add the repo gate, the table and their unit tests | M | — | `t1` | unit: repo-call-gate.test.ts: a missing, empty, relative, non-directory and unregistered repo are each refused with their code and nothing is touched; unit: repo-call-gate.test.ts: a relative path is joined to the repo, and a path with .., an absolute path elsewhere and a symlink that leaves the repo are refused; unit: repo-call-gate.test.ts: the gate never reads the daemon's INSRC_REPO or working directory, a run-token phase takes the recorded repo and a registry failure refuses; unit: repo-call-table.test.ts: every registered RPC method and step phase is a table row or on the reviewed read-only list, and every row names a registered method | [[c1]] [[c2]] [[c3]] [[c4]] |
| 3 | **`t3`** Make the MCP server and the terminal client send an absolute repo and paths | M | — | `t1` | unit: approve-absolute-repo.test.ts: insrc_workflow_approve sends an absolute repo and an absolute artifactPath, and refuses when it cannot resolve an absolute repo; integration: cli-sends-repo.test.ts: the terminal client's approve, tracker sync and attach calls send repo | [[c1]] [[c5]] |
| 4 | **`t4`** Gate the approval family and close the 2026-11-01 case | M | — | `t2`, `t3` | integration: approve-repo-gate.test.ts: a daemon started with INSRC_REPO set and its working directory inside a registered repo refuses workflow.approve with a relative artifactPath and no repo and writes nothing in either repository; integration: approve-repo-gate.test.ts: workflow.approve with an absolute registered repo and a relative path approves the artifact in that repo's store only | [[c1]] [[c2]] [[c3]] [[c4]] [[c5]] |
| 5 | **`t5`** Gate the remaining file-modifying RPC methods | M | — | `t4` | integration: repo-gate-dispatch.test.ts: each method in the table called with no repo is refused and leaves the file system unchanged | [[c1]] [[c2]] [[c3]] [[c4]] |
| 6 | **`t6`** Apply the gate to the modifying step phases | M | — | `t5` | integration: step-repo-gate.test.ts: a modifying step phase with no repo and no token is refused, and a later phase cannot be redirected to another repository by a different repo | [[c1]] [[c3]] [[c5]] |
| 7 | **`t7`** Update the documentation and verify the installed daemon checkout | S | — | `t6` | unit: daemon-doc-repo-table.test.ts: docs/daemon.md lists the methods of the table and the refusal codes | [[c5]] |
| 8 | **`t8`** Run the full sweep once and write the outcome | S | — | `t7` | integration: repo-gate-sweep-record.test.ts: the full sweep compared by test name with the tree before the fix shows no new failure and no new skipped test, and the outcome section is written | [[c4]] [[c5]] |

### 1.1 TASK-64703b708590bd68-s1-t1 — Audit which RPC methods and step phases modify files

For every method in the handler registry (src/daemon/handler-runtime.ts) and every phase of the workflow, build, review, code-review, analyze and triage steps, trace the handler with the analyzer's call closure and a read of its body, and record whether it writes under a user repository, which param holds the repo and which params hold paths. The output is a machine-readable module (the table rows and the reviewed read-only list, one entry per method or phase with its evidence) that t2 imports, plus a short document in docs/plans stating the scope decision for the daemon-store writers (config.*, keys.*, session.*, todos.*, db.*): outside the rule, as they write under ~/.insrc and not a user repository.

**Acceptance checks:**
- every method of the registry and every step phase has an entry marked modifying, read-only or daemon-store, each with evidence
- each modifying entry names its repo param and its path params
- the entries are importable by code and the scope decision for the daemon-store writers is written down for the user

### 1.2 TASK-64703b708590bd68-s1-t2 — Add the repo gate, the table and their unit tests

Add a module in src/daemon with FILE_MODIFYING_METHODS (the rows of t1), RepoCallRule, RepoCallCheck and requireRepoForCall(method, params, registered), with the refusal codes repo-missing, repo-not-absolute, repo-not-registered, repo-not-directory and path-outside-repo, path rewriting against the repo, symlink containment and the run-token rule; the dispatcher does not call it yet. Add the test that every registered RPC method and step phase is a table row or on the reviewed read-only list.

**Acceptance checks:**
- each refusal code is produced by its case and no handler-side effect happens
- a relative path is joined to the repo and the daemon's cwd and INSRC_REPO are never read
- the registry-versus-table test fails when a registered method is in neither list

### 1.3 TASK-64703b708590bd68-s1-t3 — Make the MCP server and the terminal client send an absolute repo and paths

For every method in the table, the MCP handlers and forwards (src/mcp/server.ts, daemon-stream.ts, forward-step.ts) and the terminal client services (src/cli/services) resolve the session workspace as today, then send an absolute repo and absolute artifact paths, and refuse before calling when they cannot resolve an absolute repo. Update the MCP tool descriptions that say repo falls back to the session workspace or INSRC_REPO.

**Acceptance checks:**
- insrc_workflow_approve with a relative artifactPath sends an absolute path inside the resolved repo
- the handler refuses when no absolute repo can be resolved
- each terminal client call of a table method sends repo

### 1.4 TASK-64703b708590bd68-s1-t4 — Gate the approval family and close the 2026-11-01 case

Call the gate in the dispatcher for workflow.approve and workflow.approvePipeline, hand the handlers the checked repo and rewritten params, remove process.env['INSRC_REPO'] from them, and make handleWorkflowApprove write the store of the named repo instead of the repository found from the path (src/daemon/handler-runtime.ts, src/daemon/workflow-approve.ts, src/daemon/lifecycle-registry.ts use). Update the tests that pin the fallback and add the integration test for the 2026-11-01 case: a daemon whose cwd and INSRC_REPO are a registered repo refuses a relative path with no repo and writes nothing in either repository.

**Acceptance checks:**
- workflow.approve and workflow.approvePipeline called with no repo are refused and the file system is unchanged
- workflow.approve with an absolute registered repo and a relative path approves in that repo only
- no use of the daemon's INSRC_REPO remains in the approval family

### 1.5 TASK-64703b708590bd68-s1-t5 — Gate the remaining file-modifying RPC methods

Call the gate for every other modifying method of the table (workflow.resolveComment, workflow.reviewDecision, workflow.reviewArtifact, workflow.resolveFinding, tracker.sync, tracker.setup, tracker.attach, tracker.syncComments, repo.convert, team.refresh, team.claim, team.release, artifact.feedback.append, artifact.feedback.add and any other t1 marked), and remove process.env['INSRC_REPO'] and their own no-repo checks (repo-convert.ts, tracker-attach.ts, tracker-sync-comments.ts, workflow-rpc.ts, feedback, resolve-comment and review-decision handlers). Update the tests that pin the fallback.

**Acceptance checks:**
- each table method called with no repo is refused and the file system is unchanged
- no remaining use of the daemon's INSRC_REPO for a table method
- the tests of the changed handlers pass with an absolute registered repo

### 1.6 TASK-64703b708590bd68-s1-t6 — Apply the gate to the modifying step phases

Apply the gate to the phases of the workflow, build, review and code-review steps that t1 marked modifying: the first phase names its repo, a later phase takes the repo its run token recorded and the gate checks it is registered, and a token with no repo is refused. Update the tests of the step handlers.

**Acceptance checks:**
- a modifying step phase with no repo and no token is refused
- a later phase cannot be redirected to another repository by a repo param that differs from the token's
- read-only step phases keep the session-aware resolution

### 1.7 TASK-64703b708590bd68-s1-t7 — Update the documentation and verify the installed daemon checkout

Update docs/daemon.md and the MCP tool descriptions to say that file-modifying calls require an absolute registered repo, with the table of methods checked against the code by a test, and record in the plan outcome that the installed daemon checkout at ~/.insrc/daemon holds no uncommitted artifact files.

**Acceptance checks:**
- docs/daemon.md lists the methods of the table and the refusal codes
- a test checks the documented list against the table

### 1.8 TASK-64703b708590bd68-s1-t8 — Run the full sweep once and write the outcome

Run the full test sweep once in foreground chunks and compare by test name with the tree before the fix; write the outcome section (deviations, scope decision, open items) in docs/plans.

**Acceptance checks:**
- no new failure and no new skipped test against the tree before the fix, with the pre-existing failures listed
- the outcome section is written

## 2. Test-strategy coverage

| LLD strategy item | Covered by |
| :--- | :--- |
| requireRepoForCall: a missing, empty, relative, non-directory and unregistered repo are each refused with their code; a relative path is joined to the repo; a path with .. or an absolute path elsewhere and a symlink that leaves the repo are refused; a run-token phase takes the recorded repo; a registry failure refuses | `t2` |
| FILE_MODIFYING_METHODS against the registered RPC methods and step phases: every registered method is either a row or on a reviewed read-only list, and every row names a registered method | `t1`, `t2` |
| a daemon started with INSRC_REPO set and its working directory inside a registered repo: workflow.approve with a relative artifactPath and no repo is refused and writes nothing in either repository (the 2026-11-01 case) | `t4` |
| workflow.approve with an absolute registered repo and a relative path approves the artifact in that repo's store only | `t4` |
| each method in the table called with no repo is refused and leaves the file system unchanged | `t5`, `t6` |
| insrc_workflow_approve through the MCP handler sends an absolute repo and an absolute artifactPath, and refuses when it cannot resolve one | `t3` |
| the terminal client's approve, tracker sync and attach calls send repo | `t3` |

## 3. References

- **[[c1]]** `prior-artifact` `LLD s1 contractDetails: requireRepoForCall, FILE_MODIFYING_METHODS, handleWorkflowApprove, approveWorkflow`
- **[[c2]]** `prior-artifact` `LLD s1 dataModelChanges: RepoCallRule, RepoCallCheck and the changed invariant of the file-modifying methods`
- **[[c3]]** `prior-artifact` `LLD s1 errorPaths: the refusal codes, the run-token phase and the registry failure`
- **[[c4]]** `prior-artifact` `LLD s1 testStrategy: the unit and integration subjects and the acceptance mapping ac1 to ac4`
- **[[c5]]** `prior-artifact` `LLD s1 migration: the five ordered steps and the backward-compatibility note`
