<!-- insrc:artifact PLAN-9c95950064e4b916-s1 -->

# Plan: STORY-9c95950064e4b916-s1

## Summary

**Epic:** `insrc-present-cannot-show-tracked-epic`
**LLD run:** `wf-1795794420060-78gc0h`
**LLD effective hash:** `110cc3052e0c...`

Building this correction is one small, self-contained edit: a new cache-seeding method on the VS Code review client, and a one-branch change to the panel function that was still resolving content off the narrower pending-only cache. No daemon, no new RPC, no new UI.

## Contents

1. [Epic impact analysis](#1-epic-impact-analysis)
2. [Tasks](#2-tasks)
3. [Test-strategy coverage](#3-test-strategy-coverage)
4. [References](#4-references)

## 1. Epic impact analysis

**Does not apply**: Standalone, ISSUE-anchored bugfix Story with no sibling Stories; third correction round on this same Story's own already-approved LLD/PLAN/BUILD.

## 2. Tasks

| # | Task | Size | Status | Depends on | Tests | Derived from |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| 1 | **`t1`** Add noteKnownPath and wire openArtifactFrom's not-found branch to it | S | draft r3 | — | unit: noteKnownPath seeds noDocIds for an empty mdPath, so content(id) takes the evidence-read branch without a prior pending() call; unit: noteKnownPath seeds mdPathById for a real mdPath, so content(id) takes the markdown-read branch with that exact path without a prior pending() call; integration: openArtifactFrom's 'not found in pending()' branch calls noteKnownPath then opens with no path option, and the resulting pane body loads for a document-less target (reproducing the reviewer's CR-less-BUILD-with-no-BUILD.md and approved-AMD cases); integration: openArtifactFrom's 'not found in pending()' branch opens correctly for a document-backed, not-pending target (reproducing the reviewer's CR-less-BUILD-with-valid-BUILD.md case); integration: openArtifactFrom's 'found in pending()' branch is unchanged: it still opens via { kind: summary.kind, reveal: true } with no call to noteKnownPath (reproducing the reviewer's pending-AMD control case) | [[c1]] [[c2]] |

### 2.1 TASK-9c95950064e4b916-s1-t1 — Add noteKnownPath and wire openArtifactFrom's not-found branch to it

Add noteKnownPath(artifactId, mdPath) to DocsReviewClient (vscode-plugin/src/chat/docs-review-client.ts), writing directly into the existing mdPathById/noDocIds maps. Change openArtifactFrom's 'not found in pending()' branch (docs-review-panel.ts) to call deps.client.noteKnownPath(target.artifactId, target.mdPath) then openDoc(ctx, target.artifactId, { readOnly: true, reveal: true }) with no path option, replacing the previous { path: target.mdPath, readOnly: true, reveal: true }.

**Acceptance checks:**
- noteKnownPath seeds noDocIds for an empty mdPath, so content(id) takes the evidence-read branch without a prior pending() call
- noteKnownPath seeds mdPathById for a real mdPath, so content(id) takes the markdown-read branch with that exact path without a prior pending() call
- openArtifactFrom's 'not found in pending()' branch calls noteKnownPath then opens with no path option, and the resulting pane body loads for a document-less target (reproducing the reviewer's CR-less-BUILD-with-no-BUILD.md and approved-AMD cases)
- openArtifactFrom's 'not found in pending()' branch opens correctly for a document-backed, not-pending target (reproducing the reviewer's CR-less-BUILD-with-valid-BUILD.md case)
- openArtifactFrom's 'found in pending()' branch is unchanged: it still opens via { kind: summary.kind, reveal: true } with no call to noteKnownPath (reproducing the reviewer's pending-AMD control case)

## 3. Test-strategy coverage

| LLD strategy item | Covered by |
| :--- | :--- |
| DocsReviewClient.noteKnownPath | `t1` |
| DocsReviewClient.content (regression: existing pending()-sourced behavior unchanged) | `t1` |
| openArtifactFrom (docs-review-panel.ts) | `t1` |
| openDoc (docs-review-panel.ts) | `t1` |

## 4. References

- **[[c1]]** `prior-artifact` `LLD s1 invariantsToPreserve[0] -- openArtifactFrom's line 1476 is the sole call site needing correction (docs-review-panel.ts:1456-1479)`
- **[[c2]]** `prior-artifact` `LLD s1 invariantsToPreserve[1] -- content()'s branching logic stays unchanged, only seeded earlier (docs-review-client.ts:181-204)`
