<!-- insrc:artifact LLD-dd277f9cddd6d879-s1 -->

# LLD: E20261013dd277f9c:S001

## Summary

**Epic:** `list-pending-build-records-review`
**HLD base run:** `wf-1791918007889-ixl2il`
**HLD effective hash:** `ad5992896bf9...`

A Story's build record now appears in the list of documents awaiting approval once the Story's code review has run. From then on it is in the review pane's table, opens there like any document (and by itself when a chat turn produces the code review), and can be approved or rejected from the pane; approving it completes the Story, under the same code-review rule as today. A build record rejected from the pane leaves the list for good: after the fixes the Story is completed by approving it in the chat, as today, since a later build run keeps the rejection on the record. A build record of a Story that is still being built, or whose code review has not run, is not listed. Acceptance: ac1, a build record that is neither approved nor rejected and whose Story has a code review record is in the pending list with kind BUILD, its work item id and the path of its BUILD.md; ac2, a build record without a code review record, and an approved or rejected one, is not listed, and EXTEND, STUB and AMD records stay out; ac3, the review pane opens and decides a build record through the existing calls, an approval the approve call withholds being relayed with its reason.

## Contents

1. [HLD context](#1-hld-context)
2. [Contract details](#2-contract-details)
3. [Data model changes](#3-data-model-changes)
4. [Error paths](#4-error-paths)
5. [Test strategy](#5-test-strategy)
6. [Migration](#6-migration)
7. [Alternatives considered](#7-alternatives-considered)
8. [References](#8-references)

## 1. HLD context

**Framework:** Standalone Story — no parent HLD. Designed directly against the repo, grounded on the s1 analyze passes. There are no HLD shared contracts to honour.
**Rollout phase:** standalone

## 2. Contract details

**Surface level:** internal

### 2.1 `listPendingArtifacts`

```typescript
listPendingArtifacts(repoPath: string): readonly PendingArtifact[]
```

**Parameters:**
- `repoPath: string` — The repository whose .insrc/artifacts directory is scanned.

**Returns:** `readonly PendingArtifact[]` — As today, plus BUILD records. PENDING_KINDS becomes ['SPEC','DEF','HLD','LLD','PLAN','ISSUE','BUILD','CR'] and its comment says BUILD is listed once the Story's code review has run, with EXTEND, STUB and AMD still excluded. In the scan, a file BUILD-<x>.json passes the kind check and is then skipped unless the directory also holds CR-<x>.json (same suffix; the names come from the one readdirSync the scan already makes, held in a Set). The approved/rejected rule applies as to every kind. The descriptor is built by the existing toDescriptor: kind 'BUILD', title 'BUILD <work item id>' (a build record's body has no title), mdPath from deriveMdPath (which already resolves a BUILD record's BUILD.md), workItemId, openQuestionCount 0. One addition for a BUILD record only: its mdPath is the derived path only when that file exists AND its first 512 characters contain the marker '<!-- insrc:artifact <this record's artifact id> -->'; otherwise mdPath is ''. Two older shapes fail that test: a record without epicCreatedAt whose build began on a later day than its work item derives a folder that does not exist, and a BUILD.md written before the marker was introduced has none, so the content and decision calls could not resolve it. Such a record is listed by its id with no path, as a pathless record of any kind is today, and nothing is offered a path that cannot be opened or decided. This is one existsSync and one bounded read per listed BUILD record. The scan also sorts the directory's file names before walking them, so the list's order is the names' order on every platform (BUILD-<x> before CR-<x>).

**Errors:**
- `as today` when An unreadable store directory throws (mapped to { error } by handleWorkflowPending); one malformed file is skipped and logged. The code review record is checked by name only, so a malformed CR file does not hide or fail the build record.

**Preconditions:**
- None beyond today's

**Postconditions:**
- Every record listed before this Story is still listed, in the same form
- A BUILD record is listed exactly when it is neither approved nor rejected and its Story's CR record exists
- handleWorkflowPending's result shape is unchanged; only a new value of kind can appear
- A listed BUILD record's mdPath is either an existing BUILD.md that carries this record's marker, or ''
- The list is in file-name order

### 2.2 `PendingKind`

```typescript
type PendingKind = 'SPEC' | 'DEF' | 'HLD' | 'LLD' | 'PLAN' | 'ISSUE' | 'BUILD' | 'CR'
```

**Returns:** `type` — Derived from PENDING_KINDS. The plugin's client passes kind through as a string and its table already ranks BUILD, so no plugin source changes; a plugin test pins that a BUILD row is listed, counted and opened like any other.

**Errors:**
- `none` when Type only.

**Postconditions:**
- No other consumer of PendingKind exists outside pending.ts

## 3. Data model changes

### 3.1 `PendingArtifact.kind` — field-modify

One more value, 'BUILD'. No field is added and nothing stored changes; the list is computed on each call. Existing tests touched: pending.test.ts:94 ('excludes a non-union KIND even when unapproved (BUILD)') is replaced by the 'no code review record' case of this Story's second unit subject, since BUILD is now a listed kind; artifact-kinds.test.ts seeds an unapproved BUILD with a CR record and a marker-carrying BUILD.md, so its pending result gains that BUILD row: its before/after comparisons and its lower bound still hold and are re-read in this Story, with the expected row stated where the test names rows. The two integration subjects on the read and decision calls are added to artifact-content.test.ts and review-decision.test.ts.

```
PendingKind: + 'BUILD'
```

**Call sites:**
- `src/workflow/pending.ts`
- `src/workflow/__tests__/pending.test.ts`
- `src/workflow/__tests__/artifact-kinds.test.ts`
- `src/workflow/__tests__/artifact-content.test.ts`
- `src/workflow/__tests__/review-decision.test.ts`
- `vscode-plugin/src/chat/__tests__/docs-review-panel.test.ts`

## 4. Error paths

**Error cases**

- **The build record's BUILD.md cannot be resolved (a legacy record without the identity fields)** (recoverable)
  - Detection: deriveMdPath returns ''
  - Response: As for any kind today: the record is listed with an empty path
  - User impact: It shows in the table by its id; the plugin's presenter skips it and opening it fails with the daemon's message, as for any pathless record
- **The derived BUILD.md does not exist, or exists without this record's artifact marker (an older build record)** (recoverable)
  - Detection: existsSync and a read of the file's first 512 characters, for a BUILD record only
  - Response: mdPath is ''
  - User impact: As for a pathless record: listed by its id, not auto-opened, no path that cannot be read is offered
- **Approving a build record from the pane when its Story's code review is missing, unreadable or by the same party as the build** (recoverable)
  - Detection: approveWorkflowTarget returns the record in skipped with a reason, under any configuration
  - Response: handleReviewDecision returns outcome 'withheld' with the reason, as for a review-blocked design
  - User impact: The pane says why it was not approved; nothing is stamped
- **Approving a build record whose code review verdict is block** (recoverable)
  - Detection: The code-review gate
  - Response: With codeReview.enforce on, withheld with the reason. With it off (the default) the verdict is advisory and the approval goes through, exactly as approving the same record in the chat does today
  - User impact: Under the default setting the pane can complete a Story whose code review blocks; the pane shows the code review record beside it in the table
- **The code review record's file is malformed** (recoverable)
  - Detection: Not read by the scan: its presence by name is the condition
  - Response: The build record is listed; approving it is withheld by the gate (an unreadable code review)
  - User impact: The pane relays the reason

**Edge cases**

| Input | Expected |
| :--- | :--- |
| A Story still being built: its BUILD record exists, no CR record yet | Not listed |
| The code review runs in a chat turn | The CR record and the BUILD record both become pending in that turn; the plugin's presenter opens both at the turn's end in the list's order, which the scan now fixes as file-name order: the BUILD record first, the CR record last, so the code review is on show and the build record is in the table |
| The code review is run again after fixes | The BUILD record was already listed and stays listed; nothing is opened again by the list (its id was pending before the turn) |
| A build record with a CR record whose verdict is block | Listed: it awaits a decision. Approving it is withheld only when codeReview.enforce is on; otherwise it is approved as advisory |
| An approved build record | Not listed, as before |
| A rejected build record | Not listed, and it stays out: the build writer keeps rejectedAt on every later validate, and the pane's decision call refuses a record that is already rejected. After the fixes the Story is completed through insrc_workflow_approve in the chat, which clears the rejection, as today |
| A CR record with no BUILD record | The CR is listed as today; nothing else changes |
| An epic Story with a lower-case story id (BUILD-<hash>-s5, CR-<hash>-s5) | Matched by the identical suffix |
| EXT, STUB, AMD, TESTS records | Not listed, as before |
| A trivial standalone build (a BUILD record with no LLD) | Listed once its code review record exists, like any other |
| A BUILD.md that carries another record's marker | Treated as having no marker for this record: the path is '' |

**Invariants to preserve**

- Pending means neither approvedAt nor rejectedAt is stamped: the same fields approve and reject write [[c1]]
- One malformed file never drops the rest of the list [[c1]]
- A BUILD record's approval enforces the code-review rule in approveWorkflowTarget, whoever asks [[c3]]
- The workflow.pending result shape is unchanged [[c1]]
- A completed or rejected build record's stamp is never clobbered by a later validate [[c7]]
- The scan is pure over the filesystem and reads the directory's names once [[c1]]

## 5. Test strategy

**Test framework:** `node:test run with tsx (npx tsx --test); the daemon tests use a temporary .insrc/artifacts store as pending.test.ts does, the plugin test the review shell's harness`

**Test levels**

- **unit** — The scan's rule for a BUILD record.
  - Subjects: `listPendingArtifacts lists a pending BUILD record whose Story has a code review record, with kind BUILD, its work item id and the path of its BUILD.md`, `listPendingArtifacts leaves out a BUILD record with no code review record, an approved or a rejected one, and EXT, STUB and AMD records as before`, `listPendingArtifacts gives a BUILD record an empty path when the BUILD.md its fields derive does not exist or does not carry this record's artifact marker, and lists the records in file-name order`
- **integration** — The read and decision calls on a BUILD record (the withheld case through the decision handler's approve seam, which holds under any configuration), and the plugin's table with a BUILD row.
  - Subjects: `handleArtifactContent serves a BUILD record's markdown by the path the pending list gives, with kind BUILD`, `handleReviewDecision on a BUILD record: approve goes through the same approve call as any record and a result that call withholds is returned with its reason; reject stamps the record, after which it is not listed and the pane's call refuses a further decision on it`, `docs review shell: a BUILD row is listed between ISSUE and CR, counted in the type select, and opens like any other row`
- **smoke** — The suites and a hand check.
  - Subjects: `The daemon's workflow and MCP suites and the plugin's suite pass apart from failures that exist before this Story`, `By hand in VS Code: after a Story's code review runs in the chat, its build record is in the review pane's table and can be opened and approved there; a build record of a Story still being built is not listed; a build record rejected in the pane leaves the table and is completed by approval in the chat`

**Acceptance mapping**

| Criterion | Proving tests |
| :--- | :--- |
| `ac1` | `listPendingArtifacts lists a pending BUILD record whose Story has a code review record, with kind BUILD, its work item id and the path of its BUILD.md`, `docs review shell: a BUILD row is listed between ISSUE and CR, counted in the type select, and opens like any other row`, `By hand in VS Code: after a Story's code review runs in the chat, its build record is in the review pane's table and can be opened and approved there; a build record of a Story still being built is not listed; a build record rejected in the pane leaves the table and is completed by approval in the chat`, `listPendingArtifacts gives a BUILD record an empty path when the BUILD.md its fields derive does not exist or does not carry this record's artifact marker, and lists the records in file-name order` |
| `ac2` | `listPendingArtifacts leaves out a BUILD record with no code review record, an approved or a rejected one, and EXT, STUB and AMD records as before`, `By hand in VS Code: after a Story's code review runs in the chat, its build record is in the review pane's table and can be opened and approved there; a build record of a Story still being built is not listed; a build record rejected in the pane leaves the table and is completed by approval in the chat` |
| `ac3` | `handleArtifactContent serves a BUILD record's markdown by the path the pending list gives, with kind BUILD`, `handleReviewDecision on a BUILD record: approve goes through the same approve call as any record and a result that call withholds is returned with its reason; reject stamps the record, after which it is not listed and the pane's call refuses a further decision on it`, `The daemon's workflow and MCP suites and the plugin's suite pass apart from failures that exist before this Story` |

## 6. Migration

**State before:** The pending list carries SPEC, DEF, HLD, LLD, PLAN, ISSUE and CR records. A build record is never listed, so it cannot be seen or approved in the review pane and is not opened when a chat turn produces it.

**State after:** A build record that is neither approved nor rejected is listed once its Story's code review record exists.

**Zero downtime:** yes — **Data rewrite:** no

**Steps**

1. Add BUILD to PENDING_KINDS with the code-review-record condition, the marker check and the sorted scan, and its tests; replace pending.test.ts's 'excludes BUILD' case and re-read artifact-kinds.test.ts — ↩ rollbackable
2. Pin the read and decision calls for a BUILD record, and the plugin's table with a BUILD row, by tests — ↩ rollbackable
3. Run the suites; push; update and restart the daemon; check by hand — ↩ rollbackable

**Backward compat:** The workflow.pending result keeps its shape and gains one kind value; its order becomes file-name order. The VS Code plugin passes kind through as a string and already ranks BUILD. The JetBrains plugin also reads this list (DaemonGateway.pendingArtifacts) and approves through workflow.approve, which runs the same gate; it has no enumeration of pending kinds, so a BUILD row is carried by its kind text; this Story changes nothing there and its hand check does not cover it. Nothing stored changes. In this repository the list grows by the unapproved build records that have a code review record (at most 7 today).

## 7. Alternatives considered

### 7.1 a1: List a BUILD record once its Story has a code review record — **CHOSEN**

BUILD joins the pending kinds, but a build record is listed only when the Story's code review has run

Add 'BUILD' to PENDING_KINDS. In listPendingArtifacts a BUILD-<x>.json that is neither approved nor rejected is listed only when CR-<x>.json exists in the same directory (whatever its verdict). The names of the directory's files are already read once per scan, so the check is a set lookup. Everything else (title, path, work item id) uses the existing descriptor code; the content and decision calls already serve a BUILD record.

### 7.2 a2: List every unapproved BUILD record

BUILD joins the pending kinds with no further condition

Add 'BUILD' to PENDING_KINDS only.

**Rejected because:** Puts unfinished builds in a list of documents awaiting approval.

### 7.3 a3: List a BUILD record when every planned task has passed

Readiness computed from the plan and the recorded task results

Build the Story's validation counts as the delivery read model does (plan tasks against recorded results) and list the BUILD record when none is failed or unrecorded.

**Rejected because:** More exact about 'built' but costlier and still offers an approval that is withheld.

## 8. References

- **[[c1]]** `code` `src/workflow/pending.ts`
- **[[c2]]** `code` `src/workflow/artifact-content.ts`
- **[[c3]]** `code` `src/workflow/review-decision.ts`
- **[[c4]]** `code` `src/workflow/path-scheme.ts`
- **[[c5]]** `code` `vscode-plugin/src/chat/docs-review-list.ts`
- **[[c6]]** `code` `src/workflow/gates.ts`
- **[[c7]]** `code` `src/workflow/runners/build/standalone-record.ts`
- **[[c8]]** `code` `src/workflow/code-review/gate.ts`
- **[[c9]]** `prior-artifact` `The daemon review of revision 1 of this LLD, 2026-10-14: block, 3 medium (a rejected build record never returns to pending; a blocking code review withholds only under codeReview.enforce; a record without epicCreatedAt can derive a path that does not exist)`
- **[[c10]]** `prior-artifact` `The daemon review of revision 2 of this LLD, 2026-10-14: block, 1 medium (a BUILD.md without the artifact marker cannot be opened or decided; 68 of 146 here have none), and two points not verified (the JetBrains plugin reads the same list; the scan's order is not fixed)`
- **[[c11]]** `code` `src/workflow/__tests__/artifact-kinds.test.ts`
- **[[c12]]** `prior-artifact` `The daemon review of revision 3 of this LLD, 2026-10-14: block, 1 medium (the call-site inventory omitted artifact-kinds.test.ts, the content and decision suites, and the pending test whose title becomes false)`

<!-- insrc:review -->

## Review

### ⚠️ Review `WARN` — design.story (design.story)

**0 do not hold · 1 could not be verified · 13 hold** · template `design-spec` · model `cli-claude:opus` · reviewed 2026-10-13T19:00:08.290Z

Only a premise that does not hold blocks approval. One that could not be verified is listed for the reader and does not block.

#### Does not hold (blocks approval)

_None._

#### Could not verify (does not block)

| Check item | Premise | What was tried and what was missing | Action |
| --- | --- | --- | --- |
| change-sites | At the end of a chat turn that runs the code review the presenter opens the BUILD record first and the CR record last, so the code review is the document on show. | review-presenter.ts:142-147 opens every newly pending document in the list's order, so with a sorted scan BUILD-<x> is opened before CR-<x>; that part is true. I did not read docsReviewHost.openArtifact to confirm the last quiet open is the one left on show, and review-presenter.ts:128-135 opens a document at once when a tool result carries pendingApproval.artifactPath: if the code review's result presents the CR that way, the CR is opened mid-turn and the BUILD record is opened last at the turn's end. [files: vscode-plugin/src/chat/review-presenter.ts, vscode-plugin/src/extension.ts] | Confirm which document is left on show when the CR is presented by a tool result during the turn, and state it in the edge case (or pin it in the plugin test). |
