<!-- insrc:artifact PLAN-2f27754d4ad00b8e-s4 -->

# Plan: E202610212f27754d:S004

## Summary

**Epic:** `one-common-model-every-artifact`
**LLD run:** `wf-1792573425917-mpgdhm`
**LLD effective hash:** `aea12dd76292...`

Story s4 makes the history of every artifact durable and mergeable. Each artifact gets framed line files for its change log and feedback, a durable journal that finishes a half-done write exactly once, and git rules that union the line files when two clones merge. The daemon then runs approval, review and the BUILD, TESTS and code-review rounds through one per-repository lifecycle service, so every round is logged by the same staged write that stores it.

## Contents

1. [Tasks](#1-tasks)
2. [Test-strategy coverage](#2-test-strategy-coverage)
3. [References](#3-references)

## 1. Tasks

| # | Task | Size | Depends on | Tests | Derived from |
| :--- | :--- | :--- | :--- | :--- | :--- |
| 1 | **`t1`** Frame the sidecar line and guard a torn append | S | — | unit: sidecar-append.test.ts: appendRecord writes one framed line, counts bytes for multi-byte text, starts a new line after a torn one, and refuses an oversize entry | [[c1]] |
| 2 | **`t2`** Add the file-backed sidecar store and its reader | L | `t1` | unit: sidecar-files.test.ts: filesOf maps an id to its head, log and feedback files and a TASK id to its Story's Tasks files, and mergeAttributes returns the two union rules; unit: sidecar-read.test.ts: readRecords filters by artifact id, collapses repeated entries, orders by timestamp then id, skips an abandoned fragment and merge debris, and refuses a complete frame with bad json and a conflicting duplicate; unit: sidecar-append.test.ts: a torn append, a later append, a re-read and a journal retry leave the entry once and the file readable | [[c1]] |
| 3 | **`t3`** Add the durable journal and stage the head a write started from | M | `t1` | unit: journal-durable.test.ts: the journal stages, reports and clears one file per artifact and refuses an invalid file; unit: journal-recovery-durable.test.ts: a staged write is finished at each crash point and refused with LifecycleConflictError when the head moved on, and the head is never overwritten; unit: journal-recovery-durable.test.ts: an oversized entry is rejected before it is staged and a later valid write of the artifact goes through | [[c2]] |
| 4 | **`t4`** Order open feedback, finish a staged write on inspect and refuse a write on a log ahead of its head | M | `t2`, `t3` | unit: history-order.test.ts: openFeedback orders a feedback entry and a log entry with the same timestamp by the shared rule; unit: journal-recovery-durable.test.ts: LifecycleService.inspect finishes a staged write before it reads; unit: journal-recovery-durable.test.ts: an ordinary write on an artifact whose log is ahead of its head is refused and a conflict-resolved write is accepted | [[c3]] |
| 5 | **`t5`** Ensure the merge rules and the journal ignore entry | S | `t2` | unit: sidecar-files.test.ts: the ensure step adds only the missing lines to .gitattributes and .gitignore, is idempotent, and an unwritable file is a warning | [[c4]] |
| 6 | **`t6`** Prove the merge with real git clones | M | `t2`, `t5` | integration: sidecar-merge.test.ts: two clones that append different log and feedback entries to one artifact merge with no conflict and a reader sees every entry once, in timestamp then id order; integration: sidecar-merge.test.ts: a head changed in two clones conflicts in git and the line files of the same merge still union | [[c4]] |
| 7 | **`t7`** Let updateContent carry an outcome and name the round writer shape | S | `t3` | unit: lifecycle-update-outcome.test.ts: updateContent with an outcome and references logs them with the new revision, an update without behaves as before, and an identical rewrite logs nothing | [[c7]] |
| 8 | **`t8`** Create the per-repository registry and wire the approval and daemon review paths | L | `t2`, `t3`, `t4`, `t5` | integration: lifecycle-wiring.test.ts: the daemon approve handler, the review-decision step and workflowReviewStart use the repository's durable LifecycleService, refuse a head ahead of its log, use the request's person actor or insrc:approval, and a repository whose registry entry cannot be created is refused | [[c5]] |
| 9 | **`t9`** Make the controller's verdicts phase use the service | M | `t8` | integration: verdicts-lifecycle.test.ts: handleVerdicts with a service stores an applied fix through the service, stamps the review and records it on the lifecycle, and refuses a head that is ahead of its log | [[c6]] |
| 10 | **`t10`** Store the BUILD and TESTS rounds through the service | L | `t7`, `t8` | integration: round-recording.test.ts: persistBuildRecord and persistTestRecordTask with a RoundWriter store the content through the service and log the round, and the earlier round stays readable in the log; integration: round-recording.test.ts: a TESTS persist whose markdown fails after the content was stored keeps the committed content and entry, and the next persist renders the markdown; integration: round-recording.test.ts: a failed round log fails the persist, leaves the staged write in the journal, and the next update finishes it so the next approval is not refused | [[c7]] |
| 11 | **`t11`** Store the code-review round through the service on both routes | M | `t7`, `t8` | integration: round-recording.test.ts: runCodeReview with a RoundWriter stores the content through the service and logs the round on the daemon route and the controller route, and a failed store replaces no record | [[c7]] |
| 12 | **`t12`** Classify the new writers and record the s9 inputs | S | `t9`, `t10`, `t11` | integration: artifact-write-inventory.test.ts: the sidecar files, the journal folder and the changed round writers are classified and appendSidecarLine remains the one raw append for history | [[c8]] |

### 1.1 E202610212f27754d:S004:T001 — Frame the sidecar line and guard a torn append

In src/workflow/artifact-core/sidecar.ts make appendSidecarLine write one line of the form <byte length of the json> TAB <json> NEWLINE with one append-mode write, begin with a newline when the file does not end in one, and refuse an entry larger than 256 KiB with HistoryEntryError; export the line framer and the size check so the journal step can use the same check. The in-memory sidecar is unchanged.

**Acceptance checks:**
- a record is appended as one framed line whose length counts bytes, including multi-byte text and escaped newlines
- an append after a file whose last line has no newline starts on a new line, so a torn fragment stays a line of its own
- an entry over 256 KiB is refused with HistoryEntryError and nothing is appended
- appendSidecarLine is still the only function that writes a line file

### 1.2 E202610212f27754d:S004:T002 — Add the file-backed sidecar store and its reader

Add the file SidecarIo and SidecarStore: filesOf (a TASK id maps to its Story's TASKS files), appendRecord through appendSidecarLine, and readRecords that keeps the lines of the requested artifact, skips an abandoned fragment and merge debris with a log line, refuses a complete frame with bad json or a repeated (artifactId, entry id) with different content with HistoryReadError, collapses identical repeats and orders by timestamp then entry id; mergeAttributes returns the two union rules.

**Acceptance checks:**
- filesOf names the head, log and feedback files of an id and gives every Task of a Story the same Tasks files
- readRecords skips a torn fragment and later records are still read, and a complete frame with bad json raises HistoryReadError naming the file and line
- repeated identical frames count once and a conflicting duplicate raises
- entries are ordered by timestamp then entry id, and lines of other artifacts in the file are ignored
- a torn append, a later append, a re-read and a journal retry leave the entry once

### 1.3 E202610212f27754d:S004:T003 — Add the durable journal and stage the head a write started from

Add the file WriteJournal (.insrc/journal/<id>.json, atomic replace, clear removes it, an invalid file is an error) and add priorHeadHash to StagedOperation. In ArtifactStore.write stage priorHeadHash, validate the serialised entry size before staging, and make completePending finish an operation only when the head still hashes to priorHeadHash or already equals the staged bytes, otherwise throw LifecycleConflictError, keep the journal file and log the three hashes; discard a staged entry that is invalid.

**Acceptance checks:**
- the journal stages, reports and clears one file per artifact and refuses a file that is not a staged operation
- a staged write is finished at each crash point (before the append, after the append, after the replace) exactly once
- a head that moved on after the stage is never overwritten and the write is refused with LifecycleConflictError
- an oversized entry is rejected before it is staged and a later valid write of the artifact goes through
- the existing store, journal and recovery tests pass unchanged against the memory journal

### 1.4 E202610212f27754d:S004:T004 — Order open feedback, finish a staged write on inspect and refuse a write on a log ahead of its head

Give History.openFeedback the shared (timestamp, id) order; make LifecycleService.inspect finish a staged write under the artifact's queue before it reads; make ArtifactStore.write refuse an ordinary write when the log tail is ahead of the head's revision unless options.outcome.result is conflict-resolved.

**Acceptance checks:**
- a feedback entry and a log entry with the same timestamp are ordered by the shared rule whichever file is read first
- inspect after a crash between the log append and the head replace reports an agreeing head and log
- an ordinary write on an artifact whose log is ahead of its head is refused with LifecycleConflictError and a conflict-resolved write is accepted
- the s2 and s3 store, lifecycle and recovery tests pass unchanged

### 1.5 E202610212f27754d:S004:T005 — Ensure the merge rules and the journal ignore entry

Add the idempotent ensure step that adds the two merge=union rules from mergeAttributes to the repository's .gitattributes and the .insrc/journal/ entry to its ignore file, adding only missing lines and logging a warning when a file cannot be written; call it when the file sidecar store is created; commit the two files for this repository.

**Acceptance checks:**
- a repository with no .gitattributes gets the two rules, one with other rules keeps them and gains only the missing lines, and a second call writes nothing
- an unwritable file is a warning and the store still works
- this repository's .gitattributes and .gitignore carry the new lines

### 1.6 E202610212f27754d:S004:T006 — Prove the merge with real git clones

Add the real-git tests: two clones that append different log and feedback entries to one artifact merge with no conflict and a reader sees every entry once in order, and two clones that change the same head conflict in git while the line files of the same merge still union.

**Acceptance checks:**
- a merge of two branches that appended different log and feedback entries completes with no conflict and the reader returns every entry once, in timestamp then id order
- a head changed on both branches makes git report a conflict, and the sidecar files of that merge are still unioned
- the tests skip cleanly when git is not available

### 1.7 E202610212f27754d:S004:T007 — Let updateContent carry an outcome and name the round writer shape

Give LifecycleService.updateContent an optional outcome and references that ride on the staged ChangeLogEntry through the queued mutation, and define the shared RoundWriter shape ({ writer, actor }) next to ensureBuildRecordOnCompletion's existing one so the round persisters can take it.

**Acceptance checks:**
- an update with an outcome logs that outcome and the new revision, and an update without one behaves as before
- the first round of a record can be created through the store, so a later replacement keeps it readable in the log
- an identical rewrite logs nothing and moves no revision

### 1.8 E202610212f27754d:S004:T008 — Create the per-repository registry and wire the approval and daemon review paths

Add the daemon's per-repository registry (file sidecar store, file journal, History, ArtifactStore, LifecycleService with createCompletionEvidence as its per-call factory) and pass its service and the request's person actor, falling back to insrc:approval, to the workflow.approve handler in src/daemon/index.ts, the review-decision step and workflowReviewStart; a registry entry that cannot be created refuses the request with that error.

**Acceptance checks:**
- workflow.approve, the review-decision step and workflow.review each use the repository's durable service and refuse a head that is ahead of its log
- the actor is the request's person actor when supplied and insrc:approval otherwise
- a repository whose registry entry cannot be created is refused and the head-only path is not used inside the daemon
- the existing gates, review-decision and daemon workflow tests pass unchanged

### 1.9 E202610212f27754d:S004:T009 — Make the controller's verdicts phase use the service

Make handleVerdicts async and give it the repository's LifecycleService; the review-step handler awaits it with the registry's service for the run's repository. An applied fix goes through updateContent, the meta.review stamp stays a meta-only write, and the review is applied on the lifecycle when the status allows one; migrate gate-review-fix.test.ts and the other tests of handleVerdicts with it.

**Acceptance checks:**
- handleVerdicts with a service stores an applied fix through the service, stamps the review and records it on the lifecycle
- a head that is ahead of its log is refused before anything is stamped
- without a service handleVerdicts writes as before
- the tests of handleVerdicts pass in their async forms

### 1.10 E202610212f27754d:S004:T010 — Store the BUILD and TESTS rounds through the service

Make persistBuildRecord, persistStandaloneBuildRecord and persistTestRecordTask async with an optional RoundWriter that stores the content through updateContent before the raw writers refresh meta and markdown; await them in the validate and implement phases and in ensureBuildRecordOnCompletion with the registry's RoundWriter; a TESTS markdown failure after the content was stored is not rolled back; a failed store fails the persist; migrate the tests of these writers and their callers with them.

**Acceptance checks:**
- a BUILD and a TESTS round are logged with their outcome by the staged write that replaces the record, and the earlier round stays readable in the log
- a TESTS persist whose markdown fails after the content was stored keeps the committed content and entry, and the next persist renders the markdown
- a failed round log fails the persist, leaves the staged write in the journal, and the next update finishes it so approval is not refused
- without a RoundWriter the writers behave as before, including the TESTS json-then-markdown rollback

### 1.11 E202610212f27754d:S004:T011 — Store the code-review round through the service on both routes

Add through to the code-review runner dependencies and store the record's body through updateContent before deps.write refreshes the json and markdown; supply the registry's RoundWriter from the code-review step handler and in every branch of codeReviewRunStart (degraded, injected write, default); migrate the tests of runCodeReview and the code-review step.

**Acceptance checks:**
- the daemon route (codeReviewRunStart) and the controller route (the step handler) both log the code-review round through the service
- a failed store fails the run's finalize and replaces no record
- without through the finalize is unchanged

### 1.12 E202610212f27754d:S004:T012 — Classify the new writers and record the s9 inputs

Add the inventory entries for the file sidecar store, the file journal, the ensure step and the changed round writers, and record the s9 inputs in docs/plans/core-data-model.md (existing artifacts have no line files; the conversion back-fills history and writes the first entries).

**Acceptance checks:**
- the write inventory test passes with the new files classified and appendSidecarLine still the one raw append for history
- the plans doc lists the s9 inputs from this Story

## 2. Test-strategy coverage

| LLD strategy item | Covered by |
| :--- | :--- |
| SidecarStore.filesOf maps an id to its head, log and feedback files and a TASK id to its Story's Tasks files | `t2` |
| SidecarIo.readRecords filters by artifact id, collapses repeated entries, orders by timestamp then id, skips an abandoned fragment and merge debris, and refuses a complete frame with bad json and a conflicting duplicate | `t2` |
| SidecarIo.appendRecord writes one framed line, starts a new line after a torn one, counts bytes for multi-byte text, and refuses an oversize entry | `t1` |
| a torn append, a later append, a re-read and a journal retry as one sequence | `t2` |
| SidecarStore.mergeAttributes and the ensure step add only the missing lines to .gitattributes and .gitignore and are idempotent | `t5`, `t2` |
| WriteJournal stage, pending and clear over files, including an invalid journal file | `t3` |
| completePending decisions for each crash point and for a head that moved on, using priorHeadHash | `t3` |
| LifecycleService.inspect finishes a staged write before it reads | `t4` |
| History.openFeedback ordering when a feedback entry and a log entry share a timestamp | `t4` |
| two real clones of a temporary git repository append different log and feedback entries to one artifact and merge with no conflict | `t6` |
| two clones change the same head and git reports a conflict | `t6` |
| persistBuildRecord, persistTestRecordTask and runCodeReview with a RoundWriter each store the content through the LifecycleService, log the round and refresh the meta and markdown, and the earlier round stays readable | `t10`, `t11` |
| a TESTS persist whose markdown fails after the content was stored keeps the committed content and entry and the next persist renders the markdown | `t10` |
| a failed round log fails the persist, leaves the staged write in the journal, and the next update finishes it so approval is not blocked | `t10` |
| the daemon workflow.approve handler, the review-decision step, workflowReviewStart and the review step's verdicts phase each use the repository's durable LifecycleService and refuse a head that is ahead of its log | `t8`, `t9` |
| controller verdict persistence: handleVerdicts with an auto-fix stores the content through the service, stamps the review and records it on the lifecycle | `t9` |
| a restart between each step of a write leaves the repository in the state the recovery decisions expect and the next write completes it once | `t3`, `t4` |
| the write inventory test classifies the new files and the changed writers and still finds one raw append for history | `t12` |

## 3. References

- **[[c1]]** `prior-artifact` `LLD s4 handoff: framed per-head line files and the file-backed sidecar store and reader`
- **[[c2]]** `prior-artifact` `LLD s4 handoff: durable journal with priorHeadHash and size-before-stage`
- **[[c3]]** `prior-artifact` `LLD s4 handoff: shared feedback order, inspect finishing a staged write, log-ahead-of-head refusal`
- **[[c4]]** `prior-artifact` `LLD s4 handoff: merge=union attributes, journal ignore entry and the real-git merge proof`
- **[[c5]]** `prior-artifact` `LLD s4 handoff: per-repository registry and the approval, review-decision and workflow.review wiring`
- **[[c6]]** `prior-artifact` `LLD s4 handoff: async handleVerdicts using the lifecycle service`
- **[[c7]]** `prior-artifact` `LLD s4 handoff: round writers storing BUILD, TESTS and code-review content through updateContent with outcomes`
- **[[c8]]** `prior-artifact` `LLD s4 handoff: write inventory classification and the s9 inputs`
