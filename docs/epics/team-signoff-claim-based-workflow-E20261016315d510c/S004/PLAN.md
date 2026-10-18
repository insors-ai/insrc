<!-- insrc:artifact PLAN-315d510cb28100e2-s4 -->

# Plan: E20261018315d510c:S004

## Summary

**Epic:** `team-signoff-claim-based-workflow`
**LLD run:** `wf-1792297318763-1dp38i`
**LLD effective hash:** `3738518e4be6...`

The build lays the foundation first: one artifact writer with revisions, then the routing of every existing writer, including the code-review and TESTS records, then the inventory test that locks it in. In parallel it builds the unit issue module for team mode, the per-step extras runner, the legacy and team split of the three approve-time pushes, the draft hook that carries readiness to the author, and finally the lowest-number tie-break, which waits for the findIssues amendment and runs against a fake port until then. The solo regression suite, tracker-auto.test.ts, is never edited.

## Contents

1. [Tasks](#1-tasks)
2. [Test-strategy coverage](#2-test-strategy-coverage)
3. [References](#3-references)

## 1. Tasks

| # | Task | Size | Depends on | Tests | Derived from |
| :--- | :--- | :--- | :--- | :--- | :--- |
| 1 | **`t1`** Add the single artifact writer, the revision field and the widened tracker record | M | — | unit: src/workflow/__tests__/artifact-writer.test.ts: writeArtifact mints and keeps revisions, carries the whole tracker block, and rejects a value without meta; unit: src/workflow/__tests__/artifact-writer.test.ts: readRevision reads 0 for bad values; patchTrackerMeta keeps every field, merges units and preserves the tracker kind | [[c3]] [[c4]] [[c6]] |
| 2 | **`t2`** Route the meta-only writers and gates.ts through writeArtifact | M | `t1` | unit: src/workflow/__tests__/gates-revision.test.ts: appendStoryToDefine mints a revision, approve reject and ack-stale leave revision and body unchanged; unit: src/workflow/__tests__/meta-only-body-unchanged.test.ts: every meta-only writer leaves the body byte-identical and the revision unchanged | [[c6]] [[c10]] |
| 3 | **`t3`** Route the content writers and the review paths through writeArtifact | M | `t1` | unit: src/workflow/review/__tests__/review-revision.test.ts: auto-fix review and apply resolution bump the revision, report-only review and accept override defer do not, through run-artifact and resolve; integration: src/daemon/steps/review-step/__tests__/verdicts-revision.test.ts: the verdicts path bumps the revision only when auto-fixes change the body; integration: src/workflow/__tests__/draft-write-revision.test.ts: a first draft has revision 1 and a re-draft keeps the whole prior tracker block | [[c6]] [[c5]] |
| 4 | **`t4`** Mint revisions on the code-review and TESTS records, with a stated rollback | M | `t1` | unit: src/workflow/code-review/__tests__/record-revision.test.ts: a second code review bumps the record revision through the default and the injected writer; unit: src/workflow/runners/build/__tests__/test-record-revision.test.ts: a second persisted mapping bumps the revision, a rollback restores bytes and revision, and a failed restore is reported as inconsistent | [[c6]] [[c13]] |
| 5 | **`t5`** Add the artifact write inventory and the bypass test | M | `t2`, `t3`, `t4` | unit: src/workflow/__tests__/artifact-write-inventory.test.ts: every writer file is inventoried, annotated and classified as the design says; unit: src/workflow/__tests__/artifact-write-inventory.test.ts: the detector flags raw, aliased and injected writers and accepts the positive controls | [[c6]] [[c10]] [[c13]] |
| 6 | **`t6`** Build the unit issue module in team mode | L | `t1` | unit: src/workflow/tracker/__tests__/unit-issue.test.ts: ensureUnitIssue takes a unit and a port and returns a PortResult without a phase; unit: src/workflow/tracker/__tests__/unit-issue.test.ts: resolveUnitIssueLocal resolves from records and legacy refs, reconciles locally and runs no command; unit: src/workflow/tracker/__tests__/unit-issue.test.ts: a legacy LLD with only storyRef creates no second Story issue; unit: src/workflow/tracker/__tests__/unit-issue.test.ts: team mode creates only when everything misses and reports phase before-create or create on failure; unit: src/workflow/tracker/__tests__/unit-issue.test.ts: a create that times out after the remote committed is adopted by its label on the next call; unit: src/workflow/tracker/__tests__/unit-issue.test.ts: unitLabel gives the three forms, lower-cases ids, stays within 50 characters and rejects a malformed id | [[c3]] [[c7]] [[c11]] [[c12]] |
| 7 | **`t7`** Add the team-only extras runner | M | `t6` | unit: src/workflow/tracker/__tests__/unit-extras.test.ts: runUnitExtras marks, skips, reports failures, retries only missing steps and repeats only after a marker failure | [[c3]] |
| 8 | **`t8`** Split tracker-auto into legacy and team mode | L | `t6`, `t7` | integration: src/workflow/__tests__/approve-fallback-issues.test.ts: in team mode the three pushes adopt, force Task issues, fail on lookup or unreadable policy, and run extras once; integration: src/workflow/__tests__/approve-fallback-issues.test.ts: with no policy the three pushes behave exactly as before; integration: src/workflow/__tests__/tracker-auto.test.ts: the existing solo regression suite passes unedited | [[c3]] [[c8]] |
| 9 | **`t9`** Add the draft hook and carry readiness through the result types | L | `t6` | unit: src/workflow/__tests__/draft-issues.test.ts: not-applicable without a team policy, policy-unreadable and sc1 failure kinds map to messages; integration: src/workflow/__tests__/draft-issues.test.ts: Define, LLD and plan drafts create one issue per unit, a second write creates none, and failures stop and report; integration: src/workflow/__tests__/draft-issues.test.ts: outcomeKnown wording for a failed lookup and for a create that times out; integration: src/workflow/__tests__/redraft-preserves-tracker.test.ts: a re-draft keeps epicRef and storyRefs for sync, chain report and Task approval; integration: src/daemon/__tests__/draft-issues-synthesize.test.ts: the synthesize result and the whole workflow.run path carry readiness at every hop | [[c5]] [[c14]] [[c15]] |
| 10 | **`t10`** Show the readiness notice to the author on the terminal path | S | `t9` | integration: src/cli/__tests__/run-readiness-notice.test.ts: runWorkflowStreaming preserves the fields and the run command prints the notice only when not ready | [[c14]] [[c15]] |
| 11 | **`t11`** Add the lowest-number duplicate tie-break, gated on the findIssues amendment | M | `t6` | unit: src/workflow/tracker/__tests__/unit-issue.test.ts: a lower-numbered issue is adopted and the call's own is commented on and closed, even when the close fails; unit: src/workflow/tracker/__tests__/unit-issue.test.ts: two simulated daemons that both create converge on the lowest issue; unit: src/workflow/tracker/__tests__/unit-issue.test.ts: a failed findIssues listing keeps the recorded issue and a following call makes no tracker call | [[c3]] [[c7]] |

### 1.1 E20261018315d510c:S004:T001 — Add the single artifact writer, the revision field and the widened tracker record

Add writeArtifact(path, next, kind) and readRevision beside writeAtomic in src/workflow/storage.ts: a content write mints meta.revision (prior + 1, first draft 1) and carries the whole prior meta.tracker block (legacy fields, units, extrasDone) with next winning per key; a meta-only write keeps the on-disk revision; a value without meta throws TypeError. Add the optional revision to ArtifactMetaBase, the optional units to TrackerMeta, UnitRef and UnitIssue types, and widen TrackerMeta.adapter from 'github' to the port's TrackerKind with patchTrackerMeta preserving the actual kind. patchTrackerMeta writes through writeArtifact as meta-only and merges units key by key.

**Acceptance checks:**
- writeArtifact mints revision 1 then +1 on content writes, keeps the revision on meta-only writes, and throws TypeError (file untouched) for a value without meta.
- A content write over an existing file keeps every prior tracker field, units and extrasDone, does not carry approvedAt or review, and an artifact with no revision reads as 0.
- TrackerMeta.adapter accepts the port's TrackerKind and patchTrackerMeta preserves the kind it is given; every existing tracker field is unchanged.
- npx tsc --noEmit passes.

### 1.2 E20261018315d510c:S004:T002 — Route the meta-only writers and gates.ts through writeArtifact

Move the artifact JSON writes of gates.ts (approveArtifact, rejectArtifact and ackStaleArtifact as meta-only; appendStoryToDefine as content), questions.ts, review-step findings.ts, tracker/refs.ts, bugfix/stamp.ts and the orchestrator tracker push and sync writes onto writeArtifact with the right kind, keeping markdown renders as annotated raw writes. Do not change any artifact body.

**Acceptance checks:**
- appendStoryToDefine mints a revision and keeps the tracker block; approve, reject and ack-stale leave the revision and the body byte-identical.
- For each meta-only writer (questions resolution, findings review stamp, refs patch, bugfix stamp, orchestrator tracker push and sync) the body is byte-identical before and after and the revision is unchanged.
- The existing tests of these modules pass without edits.

### 1.3 E20261018315d510c:S004:T003 — Route the content writers and the review paths through writeArtifact

Move the draft pair JSON writes in synthesize.ts and workflow-rpc.ts, resolve-comment.ts, provenance/writer.ts, the BUILD standalone-record.ts, review/resolve.ts (apply is content; accept, override and defer are meta-only), review/run-artifact.ts and review-step verdicts.ts (auto-fix is content; report-only is meta-only) onto writeArtifact, so each real body change mints a revision.

**Acceptance checks:**
- A review that applies auto-fixes bumps the revision and a report-only review does not, through both verdicts.ts and run-artifact.ts.
- Resolving a finding with apply bumps the revision and accept, override or defer do not.
- A first draft written by synthesize or workflow.run has revision 1 and a re-draft keeps the whole prior tracker block.
- The existing tests of these modules pass without edits.

### 1.4 E20261018315d510c:S004:T004 — Mint revisions on the code-review and TESTS records, with a stated rollback

Route the code-review json (code-review/runner.ts and the injected writer in code-review-step/handler.ts) and the TESTS json (runners/build/test-record.ts persistTestRecordTask) through writeArtifact as content; their markdown stays an annotated render. Keep the TESTS rollback: restore the prior json bytes (and with them the prior revision) if the document write fails, and when the restore itself also fails, report the possibly inconsistent record state to the caller instead of promising restoration.

**Acceptance checks:**
- A second code review of the same Story and a second persisted test mapping each bump the record's revision, through the runner default writer and the handler's injected writer.
- A rolled-back test record (document write fails, restore succeeds) leaves the json bytes and the revision as before.
- When both the document write and the json restore fail, the caller is told the record may be inconsistent and a test covers it.
- The existing code-review and test-record tests pass without edits.

### 1.5 E20261018315d510c:S004:T005 — Add the artifact write inventory and the bypass test

Add ARTIFACT_WRITE_INVENTORY (class and via per file; mixed entries name each site and its kind) and the artifact-write-inventory test with a detector that follows direct calls, aliases and injected writers (default parameters and object properties such as write: writeAtomic), with negative and positive controls. Classify every current write site as the LLD states: content, meta-only, mixed, render, record (amendments/store.ts only), migration.

**Acceptance checks:**
- Every production file that calls or passes writeArtifact, writeAtomic, writeFileSync or renameSync has an entry, and a fully migrated file keeps a valid entry.
- The detector flags raw writeFileSync, an unannotated raw writeAtomic, 'write: writeAtomic', an alias and a passed writer when none has an entry, and accepts the positive controls.
- The classification matches the LLD, including the two code-review files and test-record.ts as content and amendments/store.ts as record.

### 1.6 E20261018315d510c:S004:T006 — Build the unit issue module in team mode

Add src/workflow/tracker/unit-issue.ts: unitLabel, resolveUnitIssueLocal (record then legacy refs with local reconcile), the module-local EnsureResult with phase, ensureUnitIssueDetailed in team mode (local resolve, per-unit label lookup, labels, create with the unit label, link to parent, record at once) with the pre-create and create-phase failure semantics, and ensureUnitIssue as the two-argument PortResult<IssueRef> wrapper. Legacy mode is not built here; tracker-auto keeps its code.

**Acceptance checks:**
- A recorded unit makes no tracker call; a legacy LLD with only storyRef, no units and no unit label creates no second Story issue; a closed issue is adopted.
- A failed lookup or label creates nothing and reports phase before-create; a failed create reports phase create and the next call finds the issue by its unit label and creates nothing.
- ensureUnitIssue returns PortResult<IssueRef> without a phase and unitLabel gives the three forms, lower-cased, within 50 characters.

### 1.7 E20261018315d510c:S004:T007 — Add the team-only extras runner

Add runUnitExtras and ExtrasOutcome: each approve-time extra (milestone, Epic task-list splice, design comment, review comment) runs as its own step that reports success or failure, its completion is recorded per extra in UnitIssue.extrasDone through patchTrackerMeta, a marked step is skipped, a failed step stays unmarked and is reported, and the stated residual repeat is a marker-write failure after a successful post.

**Acceptance checks:**
- A step with a mark is skipped; a failed step is reported and unmarked; a second run after a partial success posts only the missing extras.
- When the marker write fails after a successful post the next run posts that step again, as the LLD states.
- No step goes through bestEffort.

### 1.8 E20261018315d510c:S004:T008 — Split tracker-auto into legacy and team mode

Make autoPushEpicOnHld, autoPushStoryOnLld and autoPushTasksOnPlan read the policy and pick the mode: legacy (policy none or teamMode false) runs today's code exactly, including the per-entry-point extras (the Epic and plan review comments on every push); team mode adopts through ensureUnitIssueDetailed, runs the extras through runUnitExtras, forces Task issues on, and an unreadable policy returns failed. The signatures and the terminal approve call sites stay unchanged.

**Acceptance checks:**
- The existing tracker-auto.test.ts passes with no edit.
- In team mode the three pushes adopt draft-created issues and create none, Task issues are created with pushTasks off, a failed Epic lookup returns failed, and an unreadable policy makes all three return failed.
- After a draft-created Story issue the first approve runs the Epic task-list splice, the design comment and the review comment once and a second approve posts nothing.
- With policy none the gh command sequence and tracker block equal the pre-change ones and pushTasks off still returns skipped.

### 1.9 E20261018315d510c:S004:T009 — Add the draft hook and carry readiness through the result types

Add ensureDraftIssues and IssueReadiness (not-applicable, ready, not-ready with outcomeKnown and the author's message; local-record fast path before loadTracker; Define, HLD, LLD and plan unit lists; Task issues forced; stop at the first failure). Call it right after the draft pair is written in synthesize.ts and in workflow-rpc.ts, and carry issueReadiness and notice on WorkflowStepDone, on RunWorkflowResult (return at line 352) and on the done frame (line 475).

**Acceptance checks:**
- A Define, LLD or plan draft in team mode creates one issue per unit and a second write creates none and runs no command, even with sign-in lost.
- An unreachable tracker leaves the draft files, returns not-ready with the reason, and a failed create is worded as unconfirmed, never as no issue.
- The emitted workflow.run done frame, RunWorkflowResult and the step result all carry the fields for a team repo and none for a repo without a policy.
- A re-draft keeps epicRef, storyRefs and the units, so sync, the chain report and Task approval still work.

### 1.10 E20261018315d510c:S004:T010 — Show the readiness notice to the author on the terminal path

Add issueReadiness and notice to the streaming client and its result type (src/mcp/daemon-stream.ts, RunWorkflowStreamResult), the CLI service (src/cli/services/workflow.ts runWorkflowStreaming) and print the failure notice in the run handler of src/cli/command.ts.

**Acceptance checks:**
- runWorkflowStreaming preserves issueReadiness and notice from the done frame.
- The run command prints the notice when the draft is not ready and prints nothing extra otherwise, proven by a test of the printed output.

### 1.11 E20261018315d510c:S004:T011 — Add the lowest-number duplicate tie-break, gated on the findIssues amendment

Add step 5 of ensureUnitIssueDetailed: after recording, list every issue carrying the unit label through port.findIssues, adopt the lowest-numbered issue, record it in place of its own, comment on and close its own as a duplicate, and keep the created issue when the listing fails. The build starts this task only after the sc1 findIssues amendment (AMD-315d510cb28100e2-10) is agreed with s1; until then it is exercised against a fake port that implements findIssues.

**Acceptance checks:**
- A listing with a lower-numbered issue makes the call adopt it, comment on and close its own; a failing close still adopts.
- Two simulated daemons that both create before either lists end with one open issue, the lowest, and both records name it.
- A failed listing keeps the created issue and returns ok with duplicateCheck not-run.

## 2. Test-strategy coverage

| LLD strategy item | Covered by |
| :--- | :--- |
| src/workflow/tracker/__tests__/unit-issue.test.ts: ensureUnitIssue(unit, port) takes only a unit and a port, derives the title, body, labels and parent from the Define, LLD or plan, and returns a PortResult<IssueRef> without a phase; this is the call s5 will make for its no-issue outcome | `t6` |
| src/workflow/tracker/__tests__/unit-issue.test.ts: resolveUnitIssueLocal resolves a Story from its units record, from the LLD's own storyRef when there is no units record and no unit label, and from the Define's storyRefs entry; resolves the Epic from the Define epicRef or the HLD epicRef and a Task from the plan taskRefs; reconciles the missing units record and sibling refs locally in team mode; makes no tracker command | `t6` |
| src/workflow/tracker/__tests__/unit-issue.test.ts: a legacy LLD with only meta.tracker.storyRef, no units and an issue with no unit label creates no second Story issue | `t6` |
| src/workflow/tracker/__tests__/unit-issue.test.ts: in team mode ensureUnitIssueDetailed returns a recorded unit with no tracker call; adopts an issue found by the per-unit label and records it; creates only when record, legacy ref and lookup all miss, with the kind, epic membership and per-unit labels; returns an EnsureResult failure with phase before-create when findIssue fails; creates nothing when a label cannot be created; adopts a closed issue; links a Story or Task to its parent and ignores a link failure; still returns the issue when recording fails | `t6` |
| src/workflow/tracker/__tests__/unit-issue.test.ts: after creating, a listing in which a lower-numbered issue carries the same per-unit label makes the function adopt it, comment on and close its own, and log both refs; a failing close still adopts; a listing whose first entry is its own issue keeps it | `t11` |
| src/workflow/tracker/__tests__/unit-issue.test.ts: two simulated daemons that both create before either lists end with one open issue, the lowest, and both records name it | `t11` |
| src/workflow/tracker/__tests__/unit-issue.test.ts: create succeeds and then the findIssues listing fails: the issue is recorded, the result is ok with created true and duplicateCheck not-run, and a following call makes no second create and no tracker call | `t11` |
| src/workflow/tracker/__tests__/unit-issue.test.ts: the create call times out after the fake remote committed the issue: the result is a failure with phase create; the next call finds the issue by its per-unit label, records it and creates nothing | `t6` |
| src/workflow/tracker/__tests__/unit-issue.test.ts: unitLabel gives the three label forms, lower-cases ids, stays within 50 characters and throws for a malformed id | `t6` |
| src/workflow/tracker/__tests__/unit-extras.test.ts: runUnitExtras runs each step on its own and records its mark in extrasDone; skips a step that already has a mark; reports a failed step in ExtrasOutcome.failed and leaves it unmarked; with the design comment succeeding and the task-list splice failing, a second run posts only the task-list splice; when the marker write fails after a successful post, the next run posts that step again (the stated residual); no step goes through bestEffort | `t7` |
| src/workflow/__tests__/artifact-writer.test.ts: writeArtifact mints revision 1 on a first content write and +1 on each later one, carries the whole prior meta.tracker block (every legacy field, units and extrasDone) into a replaced file with next winning per key, does not carry approvedAt or review, leaves a missing revision absent on a meta-only write, forces the on-disk revision back when a meta-only next differs, throws TypeError for a value without meta and leaves the file untouched | `t1` |
| src/workflow/__tests__/artifact-writer.test.ts: readRevision reads 0 for absent, negative, fractional or non-numeric values; patchTrackerMeta keeps every existing field, merges units key by key and does not change the revision | `t1` |
| src/workflow/__tests__/draft-issues.test.ts: ensureDraftIssues returns not-applicable and makes no tracker call for a policy of none and for teamMode false; reports policy-unreadable; maps each sc1 failure kind into a not-ready message with outcomeKnown true | `t9` |
| src/workflow/__tests__/draft-issues.test.ts: a Define draft in team mode creates one Epic issue and a second write of the draft creates none (ac15) | `t9` |
| src/workflow/__tests__/draft-issues.test.ts: an LLD draft creates the Epic first when needed and then one Story issue under it; a re-draft that replaced the file and a re-draft that lost the record both create nothing (ac16) | `t9` |
| src/workflow/__tests__/draft-issues.test.ts: a plan with three Tasks and pushTasks false in the github config creates three Task issues in plan order, each linked to the Story; a second write creates none; a failure on the second Task stops, keeps the first and reports the second (ac17) | `t9` |
| src/workflow/__tests__/draft-issues.test.ts: after a first successful draft, a second write with sign-in lost (the fake gh fails every command) returns ready, does not call loadTracker and runs no command | `t9` |
| src/workflow/__tests__/draft-issues.test.ts: a failed lookup before create reports outcomeKnown true and says nothing was created; a create that times out reports outcomeKnown false and says readiness could not be confirmed and the issue may or may not exist, and never says that no issue exists | `t9` |
| src/workflow/__tests__/redraft-preserves-tracker.test.ts: re-drafting a Define after its Stories have issues keeps epicRef and storyRefs, so syncTracker does not skip, buildChainReport still reports the Epic as pushed, and autoPushTasksOnPlan still finds the Story ref | `t9` |
| src/daemon/__tests__/draft-issues-synthesize.test.ts: the synthesize phase writes the draft, runs the hook and returns issueReadiness ready on the WorkflowStepDone result; with a tracker that cannot be reached the draft files still exist and the result carries issueReadiness not-ready with a notice that says the stage cannot yet be claimed and gives the reason (ac18); in a repo with no policy the result has no new field and no tracker command ran | `t9` |
| src/daemon/__tests__/draft-issues-synthesize.test.ts: the whole workflow.run path carries readiness at every hop: the value returned by runWorkflowServerSide (RunWorkflowResult), the frame emitted by runStart (captured from the send callback at src/daemon/workflow-rpc.ts line 475), each carrying issueReadiness and notice for a team repo and neither field for a repo without a policy | `t9`, `t10` |
| src/workflow/__tests__/approve-fallback-issues.test.ts: in team mode autoPushEpicOnHld, autoPushStoryOnLld and autoPushTasksOnPlan adopt issues that the draft hook already created and create none; autoPushEpicOnHld returns failed when its lookup fails instead of creating an Epic; autoPushTasksOnPlan creates Task issues with pushTasks off; an unreadable policy makes all three return failed | `t8` |
| src/workflow/__tests__/approve-fallback-issues.test.ts: after the draft hook created the Story issue, the first approve runs the Epic task-list splice, the design comment and the review comment once and marks each; a second approve posts nothing; with one extra failing the push reports a partial result and the next approve retries only that extra | `t7`, `t8` |
| src/workflow/__tests__/tracker-auto.test.ts (unedited): the existing tests, including the exact gh command sequence of the three pushes, the deep-equal tracker block without units, 'a failing adoption lookup still leads to a create and does not throw' and 'a failing create is reported as a failed result, not thrown', are the solo regression suite; they pass without any edit because a repo without a policy runs in legacy mode, and the file is not changed by this Story | `t8` |
| src/workflow/__tests__/approve-fallback-issues.test.ts: with policy none and with teamMode false the three pushes run in legacy mode, produce the same gh command sequence and tracker block as before, post the extras only when the push created the issue, and pushTasks off still returns skipped | `t8` |
| src/workflow/__tests__/artifact-write-inventory.test.ts: every production file that calls writeArtifact, writeAtomic, writeFileSync or renameSync, or passes one of them as a value, appears in ARTIFACT_WRITE_INVENTORY, and every entry has a writeArtifact call, a raw write or an injected writer | `t5` |
| src/workflow/__tests__/artifact-write-inventory.test.ts: a content, meta-only or mixed entry calls writeArtifact, every raw write in such a file carries a raw-write annotation, and every site named by a mixed entry (gates.ts, review/resolve.ts, run-artifact.ts, verdicts.ts) calls writeArtifact with the kind its entry gives | `t5` |
| src/workflow/__tests__/artifact-write-inventory.test.ts: the detector flags a temporary file that writes artifact JSON with raw writeFileSync, one that uses raw writeAtomic without an annotation, one with the injected default 'write: writeAtomic', one with an alias 'const w = writeAtomic' and one that passes writeFileSync as an argument, when none has an entry (negative controls); it accepts a file that only calls writeArtifact (positive control), a file that writes only markdown with an annotation, and the same injected-writer file once it has an entry; it flags a mixed entry whose site uses the wrong kind and an entry that has none of the three | `t5` |
| src/workflow/__tests__/artifact-write-inventory.test.ts: the real code-review/runner.ts, code-review-step/handler.ts and runners/build/test-record.ts are found by the detector and classified content, and amendments/store.ts is classified record with its stated reason | `t5`, `t4` |
| src/workflow/__tests__/artifact-write-inventory.test.ts: the classification matches the design: questions.ts, findings.ts, refs.ts, bugfix/stamp.ts and orchestrator.ts are meta-only; synthesize.ts, workflow-rpc.ts, resolve-comment.ts, provenance/writer.ts, the BUILD record, the code-review record and the TESTS record are content; gates.ts, review/resolve.ts, run-artifact.ts and verdicts.ts are mixed | `t5` |
| src/workflow/__tests__/gates-revision.test.ts: appendStoryToDefine mints a revision and keeps the tracker block, while approveArtifact, rejectArtifact and ackStaleArtifact leave the revision and the body byte-identical | `t2` |
| src/workflow/__tests__/meta-only-body-unchanged.test.ts: for each meta-only writer (questions resolution, findings review stamp, refs patch, bugfix stamp, orchestrator tracker push and sync) the artifact body is byte-identical before and after and the revision is unchanged | `t2` |
| src/workflow/code-review/__tests__/record-revision.test.ts: a second code review of the same Story bumps the code-review record's revision, through the runner's default writer and through the step handler's injected writer | `t4` |
| src/workflow/runners/build/__tests__/test-record-revision.test.ts: a second persisted test mapping for the same Task bumps the TESTS record's revision, and a rolled-back record (the document write fails) leaves the json bytes and the revision as they were | `t4` |
| src/workflow/review/__tests__ and src/daemon/steps/review-step: a review that applies auto-fixes bumps the revision and a report-only review does not, through both verdicts.ts and run-artifact.ts; resolving a finding with apply bumps it and with accept, override or defer does not | `t3` |

## 3. References

- **[[c3]]** `prior-artifact` `LLD s4 contractDetails: ensureUnitIssue, ensureUnitIssueDetailed, resolveUnitIssueLocal, runUnitExtras, unitLabel and the three autoPush functions`
- **[[c4]]** `prior-artifact` `LLD s4 dataModelChanges: UnitRef, UnitIssue, TrackerMeta units and the adapter widening`
- **[[c5]]** `prior-artifact` `LLD s4 contractDetails: ensureDraftIssues and the synthesize phase result`
- **[[c6]]** `prior-artifact` `LLD s4 contractDetails and dataModelChanges: writeArtifact, readRevision, patchTrackerMeta and the ARTIFACT_WRITE_INVENTORY`
- **[[c7]]** `prior-artifact` `LLD s4 interactionWithShared: sc1 port use and the findIssues amendment AMD-315d510cb28100e2-10`
- **[[c8]]** `prior-artifact` `LLD s4 errorPaths and invariantsToPreserve: legacy mode for a repo without a policy`
- **[[c10]]** `prior-artifact` `LLD s4 dataModelChanges: gates.ts mixed classification and appendStoryToDefine`
- **[[c11]]** `code` `src/workflow/tracker/github-adapter.ts:173-181`
- **[[c12]]** `code` `src/workflow/tracker/github.ts:233-242`
- **[[c13]]** `prior-artifact` `LLD s4 dataModelChanges: code-review and TESTS records classified content`
- **[[c14]]** `code` `src/daemon/workflow-rpc.ts:154`
- **[[c15]]** `code` `src/daemon/workflow-rpc.ts:475`
