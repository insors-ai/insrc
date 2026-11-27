<!-- insrc:artifact PLAN-9c95950064e4b916-s1 -->

# Plan: STORY-9c95950064e4b916-s1

## Summary

**Epic:** `insrc-present-cannot-show-tracked-epic`
**LLD run:** `wf-1795791735075-nr6b7e`
**LLD effective hash:** `0ace2ee99a7e...`

Building this correction is three small, independent edits: a shared path-derivation helper in the daemon's workflow module so the new openable scanner can't drift from the existing pending scanner's safety checks; a client-side mirror method in the VS Code extension so its own auto-open logic reads the same openable list the MCP tool already reads; and a one-paragraph wording fix to a tool description. None of the three depend on each other, and none change any existing method's behavior.

## Contents

1. [Epic impact analysis](#1-epic-impact-analysis)
2. [Tasks](#2-tasks)
3. [Test-strategy coverage](#3-test-strategy-coverage)
4. [References](#4-references)

## 1. Epic impact analysis

**Does not apply**: Standalone, ISSUE-anchored bugfix Story with no sibling Stories; this is a correction round on this same Story's own already-approved LLD/PLAN/BUILD, not a later Story of a multi-Story Epic.

## 2. Tasks

| # | Task | Size | Status | Depends on | Tests | Derived from |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| 1 | **`t1`** Extract mdPathForKind and wire toDescriptor + resolveOpenableArtifacts to it | S | draft r2 | — | unit: mdPathForKind returns '' for a BUILD record whose BUILD.md is missing; unit: mdPathForKind returns '' for a BUILD record whose BUILD.md exists but carries a different record's marker; unit: mdPathForKind returns the derived path for a BUILD record whose BUILD.md exists and carries its own marker; unit: mdPathForKind returns '' for every AMD record, unconditionally; unit: resolveOpenableArtifacts returns '' for a BUILD record with no matching BUILD.md; unit: resolveOpenableArtifacts returns '' for an AMD record; unit: toDescriptor's existing listPendingArtifacts tests still pass unmodified after the mdPathForKind extraction | [[c2]] [[c4]] [[c5]] |
| 2 | **`t2`** Add openableDocuments() to DocsReviewClient and wire the VS Code auto-open path to it | S | draft r2 | — | unit: DocsReviewClient.openableDocuments calls the daemon's 'workflow.openable' method, not 'workflow.pending'; unit: review-presenter declared() opens a document that is approved/rejected/has no CR sibling when its source list is openable-shaped, where the old pending-only fixture would have refused it; unit: docs-review-client.test.ts source-scan completeness test passes with 'workflow.openable' added to its expected method list | [[c1]] [[c6]] [[c7]] |
| 3 | **`t3`** Correct the insrc_present tool description's stale lifecycle-gated wording | S | draft r2 | — | integration: the registered insrc_present description no longer contains the phrase 'pending approval and openable' or lists an approved artifact under notPending's examples, and instead states presentation is independent of lifecycle status | [[c3]] |

### 2.1 TASK-9c95950064e4b916-s1-t1 — Extract mdPathForKind and wire toDescriptor + resolveOpenableArtifacts to it

Add mdPathForKind(repoPath, kind, artifactId, meta) to src/workflow/pending.ts, extracting toDescriptor's existing BUILD (buildRecordMdPath existence+marker check) and AMD (always '') path rules verbatim. Change toDescriptor's inline ternary and resolveOpenableArtifacts' direct deriveMdPath call to both call the new helper instead.

**Acceptance checks:**
- mdPathForKind returns '' for a BUILD record whose BUILD.md is missing
- mdPathForKind returns '' for a BUILD record whose BUILD.md exists but carries a different record's marker
- mdPathForKind returns the derived path for a BUILD record whose BUILD.md exists and carries its own marker
- mdPathForKind returns '' for every AMD record, unconditionally
- resolveOpenableArtifacts returns '' for a BUILD record with no matching BUILD.md (regression test for the reviewer's fabricated-path finding)
- resolveOpenableArtifacts returns '' for an AMD record (regression test for the reviewer's fabricated-AMD.md-path finding)
- toDescriptor's existing listPendingArtifacts tests (pending/approved/rejected filtering, BUILD/CR-sibling gate) still pass unmodified

### 2.2 TASK-9c95950064e4b916-s1-t2 — Add openableDocuments() to DocsReviewClient and wire the VS Code auto-open path to it

Add openableDocuments() to vscode-plugin/src/chat/docs-review-client.ts, mirroring pendingDocuments()'s shape but calling workflow.openable. Change vscode-plugin/src/extension.ts:732's reviewPresenter pendingDocuments dependency to call reviewClient.openableDocuments() instead of reviewClient.pendingDocuments(). Update docs-review-client.test.ts's source-scan completeness test (t2: source-scan, lines 277-288) to include 'workflow.openable' in its expected method list -- it currently hard-fails on any new daemon-method string literal in the file.

**Acceptance checks:**
- DocsReviewClient.openableDocuments calls the daemon's 'workflow.openable' method, not 'workflow.pending'
- review-presenter declared() opens a document that is approved/rejected/has no CR sibling when its source list is openable-shaped, where the old pending-only fixture would have refused it
- docs-review-client.test.ts's source-scan completeness test passes with 'workflow.openable' added to its expected method list
- pendingDocuments() and workflow.pending are untouched -- the JetBrains review panel's narrower semantics keep working

### 2.3 TASK-9c95950064e4b916-s1-t3 — Correct the insrc_present tool description's stale lifecycle-gated wording

Reword the registered insrc_present tool description in src/mcp/server.ts to state presentation is independent of lifecycle status, removing the 'already approved' notPending example and the 'pending approval and openable' phrase.

**Acceptance checks:**
- the registered insrc_present description no longer contains the phrase 'pending approval and openable' or lists an approved artifact under notPending's examples, and instead states presentation is independent of lifecycle status

## 3. Test-strategy coverage

| LLD strategy item | Covered by |
| :--- | :--- |
| DocsReviewClient.openableDocuments | `t2` |
| review-presenter.ts declared() via createReviewPresenter | `t2` |
| mdPathForKind | `t1` |
| toDescriptor (regression: unchanged output) | `t1` |
| resolveOpenableArtifacts | `t1` |
| insrc_present tool registration description (server.ts) | `t3` |

## 4. References

- **[[c1]]** `prior-artifact` `LLD s1 invariantsToPreserve[0] -- createReviewPresenter's sole production wiring point (extension.ts:730-734)`
- **[[c2]]** `prior-artifact` `LLD s1 invariantsToPreserve[1] -- toDescriptor's BUILD marker check (pending.ts:259-276)`
- **[[c3]]** `prior-artifact` `LLD s1 invariantsToPreserve[3] -- insrc_present tool description must state status-independent presentation (server.ts:870-895)`
- **[[c4]]** `prior-artifact` `LLD s1 contractDetails.api -- toDescriptor (pending.ts:222-246)`
- **[[c5]]** `prior-artifact` `LLD s1 contractDetails.api -- resolveOpenableArtifacts (pending.ts:175-198)`
- **[[c6]]** `code` `vscode-plugin/src/chat/docs-review-client.ts:154-162`
- **[[c7]]** `code` `vscode-plugin/src/chat/review-presenter.ts:72-73`
