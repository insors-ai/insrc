<!-- insrc:artifact PLAN-2f27754d4ad00b8e-s9 -->

# Plan: E202610222f27754d:S009

## Summary

**Epic:** `one-common-model-every-artifact`
**LLD run:** `wf-1792648664385-274vcg`
**LLD effective hash:** `bd468fd6cd6c...`

Building this Story means writing the conversion engine first and exercising it on legacy fixtures, then moving the rest of the code off the old approval, review, feedback and tracker fields in ordered groups: readers first, then writers and gates, then the feedback and tracker fallbacks, then the entry-point guards. The conversion is run on this repository by hand after the BUILD is approved. Each task names the files and tests it may change, so the work lands in small steps that keep the typecheck and its own tests green.

## Contents

1. [Tasks](#1-tasks)
2. [Test-strategy coverage](#2-test-strategy-coverage)
3. [References](#3-references)

## 1. Tasks

| # | Task | Size | Depends on | Tests | Derived from |
| :--- | :--- | :--- | :--- | :--- | :--- |
| 1 | **`t1`** Change convertLegacyFeedback to the s5 mapping | S | — | unit: convert-feedback.test.ts: each mapping of convertLegacyFeedback from the s5 hand-off (actor, kind, anchor section, kept fields) | [[c1]] [[c6]] |
| 2 | **`t2`** Store the review report in the review log entry and read it back | M | — | unit: report-log.test.ts: the review report and its resolutions are read back from the review entry and give the verdict the old stamp gave | [[c1]] [[c2]] |
| 3 | **`t3`** Conversion types, migrated entry ids and legacyDeliveryView | M | — | unit: entry-ids.test.ts: migrated entry ids are stable and distinct per part; unit: legacy-view.test.ts: legacyDeliveryView reproduces the old delivery reader's approval, review and blocking | [[c1]] [[c2]] |
| 4 | **`t4`** Lifecycle back-fill and the migrated log entries | M | `t2`, `t3` | unit: convert-lifecycle-backfill.test.ts: the lifecycle and the migrated entries are computed from the legacy fields | [[c2]] [[c4]] [[c6]] |
| 5 | **`t5`** The migration write | M | `t4` | unit: migrated-head.test.ts: an approved head keeps its revision number, status and approval and a crash at each step then a rerun leaves one entry per id | [[c1]] [[c2]] [[c3]] [[c6]] |
| 6 | **`t6`** Planner core | M | `t3` | integration: convert-preview.test.ts: a preview writes nothing, refuses a dirty tree and lists unreadable files as problems | [[c1]] [[c3]] |
| 7 | **`t7`** Rename rule for uppercase story ids | M | `t6` | unit: convert-ids.test.ts: uppercase story ids are renamed once with references rewritten and none left as an alias | [[c1]] [[c3]] |
| 8 | **`t8`** Stamp and amendment rules | S | `t4`, `t6` | unit: convert-stamps.test.ts: epicCreatedAt is taken from the head of the work item; unit: convert-amendments.test.ts: a flat amendment becomes a head with a lifecycle from its stamps | [[c2]] [[c3]] |
| 9 | **`t9`** Feedback rule and its order | M | `t1`, `t5` | integration: convert-feedback-rule.test.ts: feedback lines are appended before the head is replaced and a crash loses no feedback | [[c1]] [[c3]] [[c6]] |
| 10 | **`t10`** EPIC and STORY heads with move-binding | M | `t5`, `t6` | integration: convert-units.test.ts: EPIC and STORY heads hold the bindings and attachments moved from the Define and the LLD | [[c2]] [[c3]] |
| 11 | **`t11`** move-story-history and the pre-s8 comment listing | M | `t10` | integration: convert-story-history.test.ts: tracker feedback lines and receipts move to the STORY head and attach comments are listed | [[c2]] [[c3]] |
| 12 | **`t12`** Task heads for Stories planned before s7 | M | `t5`, `t6` | integration: convert-tasks.test.ts: Task heads and passed build rounds are created and createFromPlan alone moves the Task record | [[c2]] [[c3]] |
| 13 | **`t13`** Apply: the rules in order | M | `t7`, `t8`, `t9`, `t10`, `t11`, `t12` | integration: convert-apply.test.ts: apply converts every artifact in the stated order and refuses while the delivery reader reads legacy stamps | [[c1]] [[c3]] [[c5]] |
| 14 | **`t14`** Post-apply sweep and the marker | M | `t13` | integration: convert-marker.test.ts: the marker is written last and only when every head is clean | [[c1]] [[c3]] [[c5]] |
| 15 | **`t17`** persistReview, the one review persist helper | M | `t2` | unit: persist-review.test.ts: a failure at each step names the step and a rerun repairs the state | [[c1]] [[c2]] [[c3]] |
| 16 | **`t18`** Shared test helper for lifecycle fixtures | S | `t2` | unit: lifecycle-fixtures.test.ts: each helper produces a head the lifecycle readers see in that state | [[c4]] |
| 17 | **`t19`** Delivery reader: load and types read the lifecycle | M | `t18` | integration: load.test.ts: approval state comes from the lifecycle | [[c2]] [[c5]] |
| 18 | **`t20`** Delivery gate reads the review through readReviewReport | M | `t19` | integration: gate.test.ts: blocking comes from the lifecycle review and the review log entry | [[c2]] [[c5]] |
| 19 | **`t21`** Delivery currency and snapshot read the lifecycle | M | `t20` | integration: snapshot.test.ts: the delivery snapshot of a lifecycle fixture equals the old snapshot of the same unit | [[c2]] [[c5]] |
| 20 | **`t15`** Verification inside apply | M | `t14`, `t21` | integration: convert-verify.test.ts: an approved legacy head verifies with no difference and a planted difference is reported | [[c1]] [[c3]] [[c6]] |
| 21 | **`t16`** runConversion with preview and apply | M | `t15` | integration: convert-repeat.test.ts: a second apply and an apply crashed at each step then rerun write nothing more | [[c1]] [[c3]] [[c4]] |
| 22 | **`t22`** Pending, admit, chain and artifact-content read the lifecycle | M | `t18` | integration: pending.test.ts: pending approvals read the lifecycle | [[c2]] [[c5]] |
| 23 | **`t23`** Completion evidence, tracker readers and workflow types | M | `t18` | integration: completion-evidence.test.ts: completion evidence reads the lifecycle | [[c2]] [[c5]] |
| 24 | **`t24`** Review readers: tracker-auto, party and resolve | M | `t2`, `t18` | integration: resolve.test.ts: the review report is read from the review log entry | [[c2]] [[c5]] |
| 25 | **`t25`** Access, MCP server, CLI service and workflow-rpc readers | M | `t18` | integration: workflow-approve-dispatch.test.ts: the MCP approve dispatch reads the lifecycle | [[c2]] [[c5]] |
| 26 | **`t26`** Approve gate writes only the lifecycle | M | `t19`, `t20`, `t21`, `t22`, `t23`, `t24`, `t25` | integration: gates.test.ts: approval goes through LifecycleService and stamps none of the removed fields | [[c2]] [[c5]] [[c6]] |
| 27 | **`t27`** Reject and ack-stale gates write only the lifecycle | S | `t26` | integration: gates-lifecycle-service.test.ts: rejection and stale acknowledgement go through LifecycleService | [[c2]] [[c5]] |
| 28 | **`t28`** Review and completion gates | M | `t26` | integration: review-gate.test.ts: a blocking lifecycle review withholds approval | [[c2]] [[c5]] |
| 29 | **`t29`** Review phases call persistReview | M | `t17`, `t26` | integration: review-step-findings.test.ts: the findings phase binds the review to the lifecycle through persistReview | [[c1]] [[c2]] [[c5]] |
| 30 | **`t30`** Review decision on the lifecycle | M | `t26`, `t2` | integration: review-decision.test.ts: a review decision records its resolution as a log entry | [[c2]] [[c5]] |
| 31 | **`t31`** Bugfix, issue and spec writers | M | `t26` | integration: bugfix-orchestration.test.ts: the bugfix chain advances from a lifecycle approval | [[c2]] [[c5]] |
| 32 | **`t32`** Completion record and standalone record | M | `t26` | integration: build-record.test.ts: the completion record needs no legacy stamp | [[c2]] [[c5]] |
| 33 | **`t33`** Range base keeps meta.rangeBase | S | `t26` | integration: range-base.test.ts: a Story's build range still resolves from meta.rangeBase | [[c2]] [[c5]] [[c6]] |
| 34 | **`t34`** tasks-sync, daemon index and the workflow-step end-to-end tests | M | `t26` | integration: task-set-approve.test.ts: plan approval syncs Task heads from the lifecycle approval | [[c2]] [[c5]] |
| 35 | **`t35`** Amendment records on the lifecycle | M | `t26` | integration: store.test.ts: amendments are heads with a lifecycle | [[c2]] [[c5]] |
| 36 | **`t36`** Make LifecycleService mandatory | M | `t27`, `t28`, `t29`, `t30`, `t31`, `t32`, `t33`, `t34`, `t35` | integration: round-recording.test.ts: round recording runs with a mandatory lifecycle service | [[c2]] [[c5]] |
| 37 | **`t37`** Fixture sweep, part one | M | `t36` | integration: artifact-writer.test.ts: the writer tests run on lifecycle fixtures | [[c4]] [[c5]] |
| 38 | **`t38`** Fixture sweep, part two | S | `t36` | integration: questions.test.ts: the question tests run on lifecycle fixtures | [[c4]] [[c5]] |
| 39 | **`t39`** Remove body.feedback and its writers | L | `t36` | integration: body-fields.test.ts: no body.feedback field is declared or written | [[c2]] [[c5]] |
| 40 | **`t40`** Remove the Plan Task record readers and the head-less fallbacks | L | `t36` | integration: unit-issue.test.ts: the unit issue resolves from the binding with no Plan Task record | [[c2]] [[c5]] |
| 41 | **`t41`** Remove the older Epic and Story refs | L | `t40` | integration: tracker-artifact.test.ts: the tracker lines read the binding, not the older refs | [[c2]] [[c5]] |
| 42 | **`t42`** artifactOfUnit answers the STORY head, and the PLAN task table | M | `t41` | integration: comment-sync-inbound.test.ts: comment sync reads and posts on the STORY head; integration: plan-artifact.test.ts: the PLAN task table shows each Task's status and revision from its head | [[c2]] [[c5]] |
| 43 | **`t43`** The repo.convert daemon method | S | `t16` | integration: repo-convert.test.ts: a bare repo.convert call runs a preview and writes nothing | [[c1]] [[c3]] |
| 44 | **`t44`** RepoSchemaGate guards at the daemon entry points | M | `t42`, `t43` | integration: repo-schema-entry-points.test.ts: each daemon entry point refuses an unconverted repository with the conversion message | [[c1]] [[c3]] [[c4]] |
| 45 | **`t45`** RepoSchemaGate guard at the MCP server | S | `t44` | integration: repo-schema-guard.test.ts: the MCP artifact tools refuse an unconverted repository | [[c1]] [[c3]] [[c4]] |
| 46 | **`t46`** Hand-offs and the contract source check | S | `t37`, `t38`, `t39`, `t41`, `t42`, `t45` | integration: s9-handoffs.test.ts: the plans document names each s9 hand-off and no production file outside the conversion names a removed stamp; smoke: smoke: preview on a copy of this repository lists the expected 444 renames and 56 flat amendments; smoke: smoke: apply on the copy reports no unexplained difference and every approved artifact keeps its revision number | [[c4]] [[c5]] |

### 1.1 E202610222f27754d:S009:T001 — Change convertLegacyFeedback to the s5 mapping

In src/workflow/artifact-core/feedback-convert.ts: the actor id is the author text lower-cased when it is already an os:, git: or github: id, else legacy:<slug of the author> with the author text in actor.properties.name; kind is revision-request when the entry's decision or kind is feedback, suggestion stays, the rest comment; a target.file other than the artifact's own document goes to anchor.section and is no longer reported unmapped; id, timestamp, batchId and revision are kept. Update src/workflow/artifact-core/__tests__/feedback-convert.test.ts and add src/workflow/convert/__tests__/convert-feedback.test.ts.

**Acceptance checks:**
- A namespaced author is kept lower-cased and any other author becomes legacy:<slug> with the text in actor.properties.name
- Decision or kind feedback is revision-request, suggestion stays suggestion, the rest comment
- A foreign target.file lands in anchor.section and is not reported unmapped
- id, timestamp, batchId and revision are kept

### 1.2 E202610222f27754d:S009:T002 — Store the review report in the review log entry and read it back

Add src/workflow/review/report-log.ts with reviewEntryOf (the 'review' ChangeLogEntry whose outcome.data holds { kind: 'review', report, resolutions }), resolutionEntryOf (a 'review' entry with outcome.data.kind 'review-resolution'), reviewReference (the Reference { entityId, type: 'change-log-entry', relation: 'reviews', fragment }) and readReviewReport(history, artifactId, review), which returns the report with the resolutions applied in order. Test src/workflow/review/__tests__/report-log.test.ts, including that effectiveReviewVerdict computed from the read-back report equals the verdict the old stamp gave.

**Acceptance checks:**
- readReviewReport returns the full report from the entry the lifecycle Reference names, and undefined when the Reference or entry is absent
- Later resolution entries are applied in order
- effectiveReviewVerdict over the read-back report equals the verdict computed from meta.review and reviewResolutions

### 1.3 E202610222f27754d:S009:T003 — Conversion types, migrated entry ids and legacyDeliveryView

Add src/workflow/convert/types.ts (ConversionPlan, ConversionChange, ConvertedHead, ConversionDeps, ConversionResult, ConversionReport, errors ConversionRefused, ConversionUnreadable, ConversionIncomplete), src/workflow/convert/entry-ids.ts (migratedEntryId) and src/workflow/convert/legacy-view.ts (legacyDeliveryView over raw legacy heads: status, revision number, approval, review verdict and blocking, open feedback count, reproducing the old delivery reader's rules). Tests src/workflow/convert/__tests__/entry-ids.test.ts and legacy-view.test.ts.

**Acceptance checks:**
- migratedEntryId is stable and distinct per part
- legacyDeliveryView gives the old approval, review and blocking state for approved, rejected, pending and blocked heads
- legacyDeliveryView reads no file

### 1.4 E202610222f27754d:S009:T004 — Lifecycle back-fill and the migrated log entries

Add src/workflow/convert/backfill.ts: from a raw legacy head compute meta.envelope and meta.lifecycle (status, approval, review bound to the head's current revision, stale), the contentHash of the converted content, the stamp entries (-approve, -reject, -mark-stale), the review entry from t2 and the revision-bearing migrated-<artifact id> entry (operation create when the artifact has no log, update otherwise; actor insrc:migration; the stamps' original times). Test src/workflow/convert/__tests__/convert-lifecycle-backfill.test.ts.

**Acceptance checks:**
- Status follows the later of the approval and rejection stamps and both stamp entries keep their original times
- A review older than the head's revision is not bound to it and the review entry still records the report
- The revision-bearing entry carries the head's meta.revision and the contentHash of the converted content
- meta.rangeBase is not stripped

### 1.5 E202610222f27754d:S009:T005 — The migration write

Add src/workflow/convert/migrated-head.ts with writeMigratedHead: under ArtifactStore.exclusive append each migrated log entry whose id is not found in History.log (stamp and review entries first, the revision-bearing entry last), then replace the head with writeAtomic, keeping meta.revision, status and approval; refuse a head whose revision number, status or approval would change. Test src/workflow/convert/__tests__/migrated-head.test.ts: an approved head keeps its revision number, status and approval, and a crash injected after each step then a rerun leaves one entry per id.

**Acceptance checks:**
- An approved head keeps its revision number, status and approval and passes checkHeadIntegrity and checkIntegrity
- A crash after any step followed by a rerun leaves one migrated entry per id and the same bytes as an uninterrupted run
- A write that would change revision, status or approval is refused and nothing is written for the head

### 1.6 E202610222f27754d:S009:T006 — Planner core

Add src/workflow/convert/plan.ts and src/workflow/convert/raw-heads.ts: refuse on a merge in progress or uncommitted changes under .insrc/artifacts and docs/epics; read every file raw, list unreadable files as problems; compute the before-snapshot with legacyDeliveryView; return equal plans for the same tree and an empty plan for a converted tree; recompute-and-compare for apply. Test src/workflow/convert/__tests__/convert-preview.test.ts.

**Acceptance checks:**
- A merge or dirty tree is refused naming the paths
- An unreadable file is a problem in the plan and nothing is skipped silently
- Two plans of the same tree are equal and a preview writes nothing

### 1.7 E202610222f27754d:S009:T007 — Rename rule for uppercase story ids

Add src/workflow/convert/rename.ts: build the rename map first (S001 to s1 through ArtifactIds), check each target against existing files and other renames, rename the files and rewrite the references in structured fields, list references in prose; leave no alias. Test src/workflow/convert/__tests__/convert-ids.test.ts.

**Acceptance checks:**
- Uppercase story ids are renamed once and every structured reference is rewritten
- A collision is a plan problem and no rename is applied
- References in prose are listed in the report

### 1.8 E202610222f27754d:S009:T008 — Stamp and amendment rules

Add src/workflow/convert/stamps.ts (epicCreatedAt from the work item head or the standalone design's own createdAt, a record with none is a problem) and src/workflow/convert/amendments.ts (a flat AMD record becomes a { meta, body, citations } head with a lifecycle from its own approval and rejection stamps). Tests src/workflow/convert/__tests__/convert-stamps.test.ts and convert-amendments.test.ts.

**Acceptance checks:**
- epicCreatedAt is taken from the head of the work item
- A flat amendment becomes a head with a lifecycle from its stamps
- A record with no usable stamp is reported as a problem

### 1.9 E202610222f27754d:S009:T009 — Feedback rule and its order

Add src/workflow/convert/feedback-rule.ts: for each head append the Feedback lines from body.feedback through convertLegacyFeedback (ids kept, deterministic) and the batch outcomes BEFORE the head's migration write, so the migration write is the only step that strips body.feedback; count unmapped values in the report. Test src/workflow/convert/__tests__/convert-feedback-rule.test.ts: a crash after each step and a rerun lose no feedback.

**Acceptance checks:**
- Feedback lines are appended before the head is replaced
- A crash between the append and the head write loses no feedback on the rerun
- A repeated run appends no line twice

### 1.10 E202610222f27754d:S009:T010 — EPIC and STORY heads with move-binding

Add src/workflow/convert/units.ts: one EPIC head per Define and one STORY head per Story in it (parent chain Epic, Story, LLD; status by rollUp); move the Epic binding and attachments from the Define to the EPIC head and the Story binding and attachments from the LLD to the STORY head with bindArtifact. Test src/workflow/convert/__tests__/convert-units.test.ts.

**Acceptance checks:**
- The EPIC and STORY heads hold the bindings and attachments moved from the Define and the LLD
- An unbound Define or LLD gives a head with no binding
- A repeat moves nothing again

### 1.11 E202610222f27754d:S009:T011 — move-story-history and the pre-s8 comment listing

Add src/workflow/convert/story-history.ts: copy the LLD's tracker:<comment id> feedback lines and feedback-post receipts to the STORY head (the LLD keeps its append-only copies; feedback ids de-duplicate); when a tracker port is supplied list the pre-s8 attach comments in the plan and the report without rewriting them. Test src/workflow/convert/__tests__/convert-story-history.test.ts.

**Acceptance checks:**
- The STORY head holds the tracker feedback lines and receipts and feedback ids de-duplicate on a repeat
- The pre-s8 attach comments are listed and not rewritten

### 1.12 E202610222f27754d:S009:T012 — Task heads for Stories planned before s7

Add src/workflow/convert/tasks.ts: call TaskSets.createFromPlan for each approved PLAN with no TASKS head (it alone moves the Plan's Task record) and back-fill one revision-less build-round entry per passed BUILD task result; write no Task record itself. Test src/workflow/convert/__tests__/convert-tasks.test.ts.

**Acceptance checks:**
- Task heads, bindings and passed build rounds exist for a Story planned before s7
- An unapproved PLAN gets no Task heads and a failed task result gets no round
- The conversion writes no Task record itself

### 1.13 E202610222f27754d:S009:T013 — Apply: the rules in order

Add src/workflow/convert/apply.ts: run the rules in the LLD's order (rename, stamps, amendments, feedback, migrate every head, EPIC and STORY heads, Task heads, bindings, story history), recompute the plan first and refuse on a difference, and refuse while the delivery reader's approval source is not the lifecycle. Test src/workflow/convert/__tests__/convert-apply.test.ts.

**Acceptance checks:**
- Apply on a legacy fixture converts every artifact and creates EPIC, STORY and Task heads in the stated order
- A tree that changed since the preview is refused
- Apply refuses while the delivery reader still reads the legacy stamps

### 1.14 E202610222f27754d:S009:T014 — Post-apply sweep and the marker

Add src/workflow/convert/sweep.ts and src/workflow/convert/marker.ts and a writeRepoSchema in src/workflow/artifact-core/repo-schema.ts: sweep every head (decodes, no legacy field other than meta.rangeBase, checkHeadIntegrity and checkIntegrity, stored revision, status and approval kept) and write .insrc/schema.json by temporary file and rename only if the sweep is clean. Tests src/workflow/convert/__tests__/convert-marker.test.ts and the existing src/workflow/artifact-core/__tests__/repo-schema.test.ts.

**Acceptance checks:**
- The marker is written last and only when every head is clean
- A head that still carries a legacy field is listed and blocks the marker
- A second apply writes nothing

### 1.15 E202610222f27754d:S009:T017 — persistReview, the one review persist helper

Add src/workflow/review/persist-review.ts: inspect, head conflict check, store the fix through updateContent with addresses [], record the review (a 'review' log entry with the full report via t2, then lifecycle.review with the report Reference), render the markdown; a failure raises ReviewPersistError naming the step. Test src/workflow/review/__tests__/persist-review.test.ts with a failure injected at each step.

**Acceptance checks:**
- The steps run in the stated order and the lifecycle record comes before the markdown
- A failure at each step names the step and a rerun repairs the state
- The auto-fix passes addresses [] so open feedback stays open

### 1.16 E202610222f27754d:S009:T018 — Shared test helper for lifecycle fixtures

Add src/workflow/__tests__/lifecycle-fixtures.ts: helpers that write an approved, rejected, stale, reviewed or blocked head through the lifecycle (envelope, lifecycle, the review entry) instead of stamping meta.approvedAt, for the tests that the reader and writer tasks rewrite. Test src/workflow/__tests__/lifecycle-fixtures.test.ts.

**Acceptance checks:**
- Each helper produces a head the lifecycle readers see as approved, rejected, stale, reviewed or blocked
- The helpers stamp none of the legacy fields

### 1.17 E202610222f27754d:S009:T019 — Delivery reader: load and types read the lifecycle

In src/workflow/delivery/load.ts (approvalOf) and src/workflow/delivery/types.ts read approval, rejection and status from meta.lifecycle only. Update src/workflow/delivery/__tests__/load.test.ts, types.test.ts, fixtures.test.ts and contract.test.ts to the lifecycle helper.

**Acceptance checks:**
- Approval state comes from the lifecycle
- No file under delivery load or types names approvedAt or rejectedAt

### 1.18 E202610222f27754d:S009:T020 — Delivery gate reads the review through readReviewReport

In src/workflow/delivery/gate.ts read the design review and its blocking state from the lifecycle review and readReviewReport. Update src/workflow/delivery/__tests__/gate.test.ts.

**Acceptance checks:**
- Malformed findings are still dropped before effectiveReviewVerdict
- Blocking comes from the lifecycle review and the review log entry

### 1.19 E202610222f27754d:S009:T021 — Delivery currency and snapshot read the lifecycle

In src/workflow/delivery/currency.ts (lines around 80 and 181) read the review verdict and reviewedAt from the lifecycle. Update src/workflow/delivery/__tests__/currency.test.ts, graph.test.ts, handlers.test.ts, snapshot.test.ts and stage.test.ts.

**Acceptance checks:**
- Currency uses the lifecycle review
- The delivery snapshot of a lifecycle fixture equals the old snapshot of the same unit

### 1.20 E202610222f27754d:S009:T015 — Verification inside apply

Add src/workflow/convert/verify.ts: after the marker is written compare the planner's before-snapshot with the snapshot the real delivery reader builds from the converted repository and report each difference without correcting it (a contentHash difference is not reported). Verification runs inside apply only; there is no standalone verify mode. Test src/workflow/convert/__tests__/convert-verify.test.ts: an approved legacy head verifies with no difference, and a planted difference is reported.

**Acceptance checks:**
- An approved legacy head verifies with no difference through the real delivery reader
- A planted difference is reported with the unit and the reason
- Nothing is written by verification

### 1.21 E202610222f27754d:S009:T016 — runConversion with preview and apply

Add src/workflow/convert/run.ts: runConversion(repo, mode, deps) with modes preview and apply (preview is the planner alone). Tests src/workflow/convert/__tests__/convert-repeat.test.ts (a second apply, and an apply crashed at each step then rerun, write nothing more and leave one migrated entry per head) and the remaining convert-preview cases.

**Acceptance checks:**
- A preview writes nothing and lists what would change
- A repeat apply leaves the bytes of every file unchanged
- A crash at each step then a rerun gives the result of an uninterrupted run

### 1.22 E202610222f27754d:S009:T022 — Pending, admit, chain and artifact-content read the lifecycle

Move src/workflow/pending.ts, src/workflow/bugfix/admit.ts, src/workflow/chain.ts and src/workflow/artifact-content.ts to the lifecycle. Update src/workflow/__tests__/pending.test.ts, artifact-content.test.ts, artifact-kinds.test.ts and src/workflow/runners/build/__tests__/admit-build.test.ts.

**Acceptance checks:**
- Pending approvals, admission and the chain report read the lifecycle
- None of the four files names the legacy stamps

### 1.23 E202610222f27754d:S009:T023 — Completion evidence, tracker readers and workflow types

Move src/workflow/artifact-core/completion-evidence.ts, src/workflow/runners/tracker/context.ts, src/workflow/tracker/conventions.ts and src/workflow/types.ts to the lifecycle. Update src/workflow/artifact-core/__tests__/completion-evidence.test.ts, src/workflow/tracker/__tests__/tracker.test.ts and src/workflow/tasks/__tests__/task-readers.test.ts.

**Acceptance checks:**
- Completion evidence and the tracker context read the lifecycle
- The WorkflowArtifactMeta type no longer declares the approval stamps

### 1.24 E202610222f27754d:S009:T024 — Review readers: tracker-auto, party and resolve

Move src/workflow/tracker-auto.ts (readReview), src/workflow/review/party.ts (reviewerPartyOf) and src/workflow/review/resolve.ts (effectiveReviewVerdict callers) to readReviewReport. Update src/workflow/review/__tests__/resolve.test.ts, outcome.test.ts, template-review.test.ts, gate-resolve-finding.test.ts, same-party-refusal.test.ts and src/workflow/__tests__/tracker-auto.test.ts.

**Acceptance checks:**
- The review report is read from the review log entry
- reviewerPartyOf reads the party from the lifecycle review

### 1.25 E202610222f27754d:S009:T025 — Access, MCP server, CLI service and workflow-rpc readers

Move src/shared/access.ts, src/mcp/server.ts, src/cli/services/workflow.ts, src/daemon/workflow-rpc.ts and the findings entry of src/workflow/artifact-write-inventory.ts to the lifecycle. Update src/cli/__tests__/command.test.ts, tui.test.ts, src/daemon/__tests__/workflow-rpc.test.ts, workflow-review-rpc.test.ts, src/mcp/__tests__/workflow-approve-dispatch.test.ts and src/understanding/__tests__/acceptance.test.ts.

**Acceptance checks:**
- The access check, the MCP approve dispatch and the CLI approve read the lifecycle
- The write inventory matches the new findings writer

### 1.26 E202610222f27754d:S009:T026 — Approve gate writes only the lifecycle

In src/workflow/gates.ts approveArtifactByJsonPath calls LifecycleService only; remove approvedAt, rejectedAt, rejectReason and reviewOverride from STAMP_KEYS and remove mirrorLegacyReview; keep meta.rangeBase in its own constant. Update src/workflow/__tests__/gates.test.ts, gate-approve.test.ts, gates-revision.test.ts, plan-gate.test.ts and approve-workflow-target.test.ts.

**Acceptance checks:**
- Approval goes through LifecycleService
- meta.rangeBase is still stamped at approval and read by the build range
- The approve gate writes none of the removed stamps

### 1.27 E202610222f27754d:S009:T027 — Reject and ack-stale gates write only the lifecycle

In src/workflow/gates.ts the reject and ack-stale gates call LifecycleService only. Update src/workflow/__tests__/gates-lifecycle-guard.test.ts and gates-lifecycle-service.test.ts.

**Acceptance checks:**
- Rejection and stale acknowledgement go through LifecycleService
- Neither writes meta.rejectedAt, rejectReason or staleAckedAt

### 1.28 E202610222f27754d:S009:T028 — Review and completion gates

In src/workflow/gates.ts move the review gate (lines near 641, 746 and 889), the other-party check and the BUILD completion check to the lifecycle review. Update src/workflow/__tests__/review-gate.test.ts, other-party-review-gate.test.ts, approve-build-completion.test.ts, approve-build-record-completion.test.ts and approve-codereview-gate.test.ts.

**Acceptance checks:**
- The review gate withholds approval on a blocking lifecycle review
- BUILD completion needs a code review by the other party read from the lifecycle

### 1.29 E202610222f27754d:S009:T029 — Review phases call persistReview

Move src/workflow/review/run-artifact.ts and the phases src/daemon/steps/review-step/phases/verdicts.ts and findings.ts onto persistReview, and update the findings entry in src/workflow/artifact-write-inventory.ts. Update src/daemon/steps/review-step/__tests__/review-step-findings.test.ts, review-step-routing.test.ts, review-step.test.ts and verdicts-lifecycle.test.ts.

**Acceptance checks:**
- findings, verdicts and run-artifact all call persistReview and HLD and LLD reviews bind to the lifecycle
- No review phase writes meta.review

### 1.30 E202610222f27754d:S009:T030 — Review decision on the lifecycle

Move src/workflow/review-decision.ts off meta.review, meta.reviewResolutions and body.feedback, recording resolutions as review-resolution log entries. Update src/workflow/__tests__/review-decision.test.ts.

**Acceptance checks:**
- A review decision records its resolution as a log entry and its comments through FeedbackService
- The decision writes no legacy stamp

### 1.31 E202610222f27754d:S009:T031 — Bugfix, issue and spec writers

Move src/workflow/bugfix/stamp.ts, src/workflow/bugfix/mount.ts and src/workflow/artifacts/issue.ts to the lifecycle. Update src/workflow/__tests__/bugfix-orchestration.test.ts, bugfix-tracker.test.ts, issue-artifact.test.ts, spec-artifact.test.ts, spec-resolver.test.ts and spec-review-approve.test.ts.

**Acceptance checks:**
- The bugfix chain advances from a lifecycle approval
- Issue and spec artifacts carry no legacy stamp

### 1.32 E202610222f27754d:S009:T032 — Completion record and standalone record

Move src/workflow/runners/build/completion-record.ts and standalone-record.ts off the legacy stamps and off body.feedback. Update src/workflow/runners/build/__tests__/build-record.test.ts, build-record-enrichment.test.ts and src/daemon/steps/build-step/__tests__/build-step.test.ts, build-start.test.ts, validate-task-round.test.ts, gate-call-sites.test.ts and comment-sync-callers.test.ts.

**Acceptance checks:**
- The completion record and the standalone record need no legacy stamp
- The build-step tests pass on lifecycle fixtures

### 1.33 E202610222f27754d:S009:T033 — Range base keeps meta.rangeBase

Move src/workflow/runners/build/range-base.ts off the legacy approval stamps while it keeps reading meta.rangeBase. Update src/workflow/runners/build/__tests__/range-base.test.ts and changed-files.test.ts.

**Acceptance checks:**
- A Story's build range still resolves from meta.rangeBase
- range-base.ts names none of the removed stamps

### 1.34 E202610222f27754d:S009:T034 — tasks-sync, daemon index and the workflow-step end-to-end tests

Move src/daemon/tasks-sync.ts and the stamp uses in src/daemon/index.ts to the lifecycle. Update src/workflow/tasks/__tests__/task-set-approve.test.ts, src/daemon/steps/workflow-step/__tests__/amendments-e2e.test.ts, define-extend-e2e.test.ts, src/daemon/steps/triage-step/__tests__/handler.test.ts and src/workflow/team/__tests__/handoff-resume-check.test.ts and snapshot-upstream.test.ts.

**Acceptance checks:**
- Plan approval syncs Task heads from the lifecycle approval
- The daemon index stamps nothing

### 1.35 E202610222f27754d:S009:T035 — Amendment records on the lifecycle

Move src/workflow/amendments/store.ts, types.ts, effective.ts and staleness.ts to the head shape and the lifecycle. Update src/workflow/amendments/__tests__/store.test.ts, applier.test.ts and effective-and-staleness.test.ts.

**Acceptance checks:**
- Amendments are heads with a lifecycle
- approveAmendment and the effective HLD read the lifecycle

### 1.36 E202610222f27754d:S009:T036 — Make LifecycleService mandatory

Make lifecycle required on WorkflowApproveRequest (src/workflow/gates.ts) and ReviewArtifactOpts (src/workflow/review/run-artifact.ts) and delete the head-only guard paths; update the tests that pass lifecycleFor: () => undefined or roundWriterFor: () => undefined: src/workflow/artifact-core/__tests__/round-recording.test.ts, store-write.test.ts and the gates and review tests that still build a request without a service.

**Acceptance checks:**
- No production request type has an optional lifecycle
- headConflict is the full log check on every path

### 1.37 E202610222f27754d:S009:T037 — Fixture sweep, part one

Rewrite the remaining test fixtures that stamp the legacy fields to the lifecycle helper: src/workflow/__tests__/anchor-missing-producers.test.ts, anchor-missing-read.test.ts, artifact-writer.test.ts, docs-s3-follow-ups.test.ts, feedback-carry-finalize.test.ts, folder-identity-finalize.test.ts, meta-only-body-unchanged.test.ts and plan-artifact.test.ts.

**Acceptance checks:**
- None of the listed tests names a removed stamp
- Each still passes

### 1.38 E202610222f27754d:S009:T038 — Fixture sweep, part two

Rewrite the remaining test fixtures: src/workflow/__tests__/questions.test.ts, scope-extend.test.ts, seed-focus.test.ts, src/workflow/locate/__tests__/locate-parent-ids.test.ts and src/workflow/code-review/__tests__/subject.test.ts.

**Acceptance checks:**
- None of the listed tests names a removed stamp
- Each still passes

### 1.39 E202610222f27754d:S009:T039 — Remove body.feedback and its writers

Remove appendFeedback, appendFeedbackBatch and the tool artifact_feedback_append and the body.feedback fields: src/workflow/artifacts/provenance/writer.ts, tool.ts, schema.ts and types.ts, src/workflow/artifacts/define.ts, hld.ts, lld.ts and plan.ts, src/workflow/artifact-content.ts (companion headers and delivery text read FeedbackService threads), src/workflow/artifact-core/history.ts and src/workflow/feedback/feedback-service.ts where they name it. Update src/workflow/artifacts/provenance/__tests__/body-fields.test.ts, review-fields.test.ts, writer.test.ts, src/daemon/__tests__/artifact-feedback-handler-contract.test.ts, src/workflow/__tests__/feedback-provenance.test.ts and feedback-synth-schema.test.ts.

**Acceptance checks:**
- No production file writes or declares body.feedback
- The companion headers show FeedbackService threads

### 1.40 E202610222f27754d:S009:T040 — Remove the Plan Task record readers and the head-less fallbacks

Remove the Plan Task record fields and readers (taskRefs, units for Tasks, the Task branch of recordUnit, bindingHome's Plan fallback) in src/workflow/tracker/unit-issue.ts, refs.ts, resolve.ts, src/workflow/runners/tracker/context.ts, index.ts and schemas.ts and src/workflow/orchestrator.ts, and taskBuildPassed's BUILD-record branch in src/workflow/artifact-core/completion-evidence.ts. Update src/workflow/tracker/__tests__/unit-issue.test.ts, unit-issue-binding.test.ts, unit-issue-bind-failures.test.ts, src/workflow/tasks/__tests__/task-unit-issue.test.ts and src/daemon/steps/workflow-step/__tests__/tracker-tasks-coarse.test.ts.

**Acceptance checks:**
- No production file reads the Plan's Task record or the BUILD record's per-task result for completion
- createFromPlan remains the only mover of Task records

### 1.41 E202610222f27754d:S009:T041 — Remove the older Epic and Story refs

Remove epicRef, storyRef and storyRefs from meta.tracker and their readers: src/workflow/tracker/sync.ts, link.ts and conventions.ts, src/workflow/chain.ts, questions.ts, storage.ts and tracker-auto.ts, src/workflow/artifacts/define.ts, hld.ts, lld.ts and tracker.ts, src/workflow/runners/build/changed-files.ts, src/workflow/code-review/grounding.ts, src/daemon/steps/build-step/render.ts. Update src/workflow/__tests__/define-artifact.test.ts, hld-artifact.test.ts, lld-artifact.test.ts, lld-head.test.ts, lld-head-resolve.test.ts, tracker-artifact.test.ts, tracker-push-modes.test.ts, tracker-tasks.test.ts, redraft-preserves-tracker.test.ts, draft-issues.test.ts, draft-write-revision.test.ts, id-resolve.test.ts and approve-fallback-issues.test.ts.

**Acceptance checks:**
- The Epic and Story refs are read only from the binding of the EPIC and STORY head
- The renderers' tracker lines read the binding

### 1.42 E202610222f27754d:S009:T042 — artifactOfUnit answers the STORY head, and the PLAN task table

In src/workflow/tracker/comment-sync.ts make artifactOfUnit answer the STORY head for a Story; render the PLAN document's task table from the Task heads in src/workflow/artifacts/plan.ts. Update src/workflow/tracker/__tests__/comment-sync-inbound.test.ts, comment-sync-outbound.test.ts and src/workflow/__tests__/plan-artifact.test.ts.

**Acceptance checks:**
- Comment sync reads and posts on the STORY head
- The PLAN table shows each Task's status and revision from its head

### 1.43 E202610222f27754d:S009:T043 — The repo.convert daemon method

Add src/daemon/repo-convert.ts with handleRepoConvert (params repo and mode preview or apply, default preview, an error that says why nothing was attempted) and register repo.convert in src/daemon/index.ts beside tracker.attach. Test src/daemon/__tests__/repo-convert.test.ts.

**Acceptance checks:**
- A bare call runs a preview and writes nothing
- A missing repo or a bad mode returns an error that says why

### 1.44 E202610222f27754d:S009:T044 — RepoSchemaGate guards at the daemon entry points

Call RepoSchemaGate.require(repo, 2) at the entry of src/daemon/workflow-rpc.ts, workflow-review-rpc.ts, code-review-rpc.ts, artifacts-rpc.ts, tracker-attach.ts and tracker-sync-comments.ts, and of the step handlers src/daemon/steps/analyze-step/handler.ts, build-step/handler.ts, code-review-step/handler.ts, review-step/handler.ts, triage-step/handler.ts and workflow-step/handler.ts; repo.convert is exempt. Test src/daemon/__tests__/repo-schema-entry-points.test.ts.

**Acceptance checks:**
- Each listed daemon entry point refuses an unconverted repository with a message naming the conversion
- repo.convert is exempt

### 1.45 E202610222f27754d:S009:T045 — RepoSchemaGate guard at the MCP server

Call RepoSchemaGate.require(repo, 2) in src/mcp/server.ts for the tools that read or write artifacts (not insrc_analyze, insrc_docgen, insrc_schema or insrc_guide). Test src/mcp/__tests__/repo-schema-guard.test.ts.

**Acceptance checks:**
- The MCP artifact tools refuse an unconverted repository with a message naming the conversion
- The read-only tools still work on an unconverted repository

### 1.46 E202610222f27754d:S009:T046 — Hand-offs and the contract source check

Add a section 's9 build: hand-offs' to docs/plans/core-data-model.md (the conversion is run by hand after BUILD approval with the restarted daemon; the pre-s8 attach comments; the first-sync backlog) and a contract test src/workflow/__tests__/s9-handoffs.test.ts that also fails if any production file outside src/workflow/convert names meta.approvedAt, rejectedAt, staleAckedAt, reviewOverride, reviewResolutions, rejectReason, meta.review or the body.feedback writers.

**Acceptance checks:**
- The plans document names each s9 hand-off
- The source check passes on the production tree

## 2. Test-strategy coverage

| LLD strategy item | Covered by |
| :--- | :--- |
| convertLegacyFeedback: a namespaced author is kept lower-cased, any other author becomes legacy:<slug> with the text in actor.properties.name | `t1` |
| convertLegacyFeedback: decision or kind feedback is revision-request, suggestion stays, the rest comment | `t1` |
| convertLegacyFeedback: a foreign target.file goes to anchor.section and is not reported unmapped; id, timestamp, batchId and revision are kept | `t1` |
| rename of uppercase story ids with collision and prose-reference reporting | `t7` |
| epicCreatedAt stamping from the work item head | `t8` |
| flat amendment to head conversion | `t8` |
| lifecycle computed from approvedAt, rejectedAt, reviewOverride, staleAckedAt and review with reviewResolutions, including a review older than the revision and a rejection followed by an approval | `t4` |
| migratedEntryId is stable; the stamp entries carry the original times; the review entry carries the full report and the resolutions | `t3`, `t4` |
| readReviewReport returns the report from the entry the lifecycle Reference names, and effectiveReviewVerdict computed from it equals the verdict the old stamp gave | `t2` |
| legacyDeliveryView reproduces the old delivery reader's approval, review and blocking for approved, rejected, pending and blocked heads | `t3` |
| writeMigratedHead: an approved head keeps its revision number, status and approval, and contentHash is that of the converted content | `t5` |
| writeRepoSchema writes by temporary file and rename | `t14` |
| RepoSchemaGate.require refusal message | `t14`, `t44` |
| preview writes nothing and lists the changes | `t6`, `t16` |
| apply on a legacy fixture converts every head, creates EPIC, STORY and Task heads, and writes the marker last | `t13`, `t14` |
| a second apply writes nothing (bytes of every file and line file unchanged) | `t14`, `t16` |
| a crash injected after each step of writeMigratedHead and each rule, then a rerun, gives the same result as an uninterrupted run with one migrated entry per head | `t5`, `t9`, `t16` |
| an approved head keeps its revision number, status and approval after conversion and checkIntegrity passes | `t5`, `t14` |
| verify: an approved legacy head verifies with no difference (before-snapshot from legacyDeliveryView, after-snapshot from the real delivery reader), and a planted difference is reported | `t15` |
| apply refuses while the delivery reader still reads the legacy stamps | `t13` |
| move-binding (Define to EPIC, LLD to STORY) and move-story-history: the STORY head holds the binding, the attachments, the tracker:<id> feedback lines and the receipts, and artifactOfUnit answers it | `t10`, `t11`, `t42` |
| createFromPlan for earlier Stories moves the Plan's Task record, and the conversion writes no Task record itself | `t12` |
| daemon repo.convert default mode is preview | `t43` |
| each daemon method and MCP step refuses an unconverted repository with the conversion message | `t44`, `t45` |
| a source check that no production file under src names meta.approvedAt, rejectedAt, staleAckedAt, reviewOverride, reviewResolutions, rejectReason, meta.review or the body.feedback writers, outside the conversion module | `t46` |
| approval, rejection, stale acknowledgement and review through LifecycleService only | `t26`, `t27` |
| persistReview with a failure injected at each of its steps: the error names the step and a rerun repairs the state | `t17` |
| findings, verdicts and run-artifact all call persistReview and HLD and LLD design reviews bind to the lifecycle | `t29` |
| tracker-auto readReview, reviewerPartyOf and the delivery gate read the report through readReviewReport | `t24`, `t20` |
| the PLAN task table rendered from the Task heads | `t42` |
| delivery board status and counts equal the pre-conversion read on the fixture | `t21` |
| preview on a copy of this repository lists the expected 444 renames and 56 flat amendments | `t46` |
| apply then verify on the copy reports no unexplained difference and every approved artifact keeps its revision number | `t46` |

## 3. References

- **[[c1]]** `prior-artifact` `LLD s9 contractDetails: planConversion, applyConversion, writeMigratedHead, migratedEntryId, verifyConversion, runConversion, handleRepoConvert, RepoSchemaGate.require, convertLegacyFeedback, persistReview, readReviewReport`
- **[[c2]]** `prior-artifact` `LLD s9 dataModelChanges: ConversionPlan, MigratedLogEntry, the converted lifecycle, the review report location, the migration write, the stamp writers and readers, the flat amendments, body.feedback, the tracker records, the Story history, the EPIC and STORY heads, the Task heads and the marker`
- **[[c3]]** `prior-artifact` `LLD s9 errorPaths: refusals, unreadable files, crashes and reruns, snapshot differences, a reader group not done, tracker failures and persistReview failures`
- **[[c4]]** `prior-artifact` `LLD s9 testStrategy: the unit, integration, contract and smoke subjects and the acceptance mapping of ac27, ac28 and ac29`
- **[[c5]]** `prior-artifact` `LLD s9 migration: the ordered steps, the reader group before the first run and the retirement groups`
- **[[c6]]** `doc` `docs/plans/core-data-model.md#s9-lld-approved-with-an-override-2026-10-22` — "Convert feedback before the migration write, and let the migration write strip."
