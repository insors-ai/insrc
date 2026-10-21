<!-- insrc:artifact PLAN-2f27754d4ad00b8e-s5 -->

# Plan: E202610212f27754d:S005

## Summary

**Epic:** `one-common-model-every-artifact`
**LLD run:** `wf-1792582680524-ox15vn`
**LLD effective hash:** `aea12dd76292...`

Story s5 lets a person leave feedback on any artifact, a Task included, reply to it, and see what is still open. Building it adds one field for replies, makes every content revision address open feedback by default (automated writers excepted), adds a feedback service and a thread view over the existing history, adds an identity service that links a person's accounts for display while the gates keep using the tracker, and moves the daemon's feedback and review-decision comment paths onto the service.

## Contents

1. [Tasks](#1-tasks)
2. [Test-strategy coverage](#2-test-strategy-coverage)
3. [References](#3-references)

## 1. Tasks

| # | Task | Size | Depends on | Tests | Derived from |
| :--- | :--- | :--- | :--- | :--- | :--- |
| 1 | **`t1`** Add inReplyTo to Feedback and validate it | S | — | unit: feedback-reply-shape.test.ts: History.validateFeedback accepts inReplyTo as a non-empty string other than its own id and refuses a reply that carries nested replies | [[c1]] |
| 2 | **`t2`** Apply the addresses rule in ArtifactStore.write | M | `t1` | unit: addresses-rule.test.ts: ArtifactStore.write stamps addresses 'all' on a revision that moves the revision number, honours a list, refuses ids that are not roots or are already addressed, and addresses nothing on an identical rewrite or a lifecycle operation | [[c2]] |
| 3 | **`t3`** Make every automated content writer address nothing | S | `t2` | integration: automated-writers-addresses.test.ts: a review auto-fix on either path and a BUILD, TESTS or code-review round leave open feedback open | [[c2]] |
| 4 | **`t4`** Build the thread view over History | M | `t1`, `t2` | unit: feedback-threads.test.ts: FeedbackService.threads nests replies under their root in time-then-id order, returns an orphan reply as an orphan root, never lists a reply on its own as open, and filters to open threads | [[c1]] [[c3]] |
| 5 | **`t5`** Add FeedbackService.add with retry comparison and per-artifact atomicity | L | `t4` | unit: feedback-service.test.ts: FeedbackService.add stores one root entry with the author, a minted id and time and the head's revision, defaults the kind to comment, and refuses blank text, a non-namespaced actor and a malformed anchor; unit: feedback-service.test.ts: FeedbackService.add stores a reply as its own line with inReplyTo, refuses a missing parent, a parent on another artifact and a reply to a reply, and a repeated caller id returns the stored entry or is refused when the content differs; integration: feedback-storage.test.ts: feedback on a design, a plan and a single Task is recorded once as a framed line in the right file, survives a restart, and a Task's line lands in its Story's Tasks file and reads back for that Task only; integration: feedback-storage.test.ts: a revision of an artifact addresses all its open feedback by default and only the listed roots when a list is given, in the shared (timestamp, id) order with the feedback file read first or last; integration: feedback-merge.test.ts: two clones that add feedback and replies to one artifact merge with no conflict and the threads read back once each in order | [[c3]] |
| 6 | **`t6`** Add the IdentityService and the identity file | M | — | unit: identity-service.test.ts: IdentityService.currentActor builds github:<login> from the tracker's whoAmI, falls back to git then os when the tracker does not answer, and copies the declared aliases only onto the declared primary or an alias; unit: identity-service.test.ts: IdentityService.declare validates namespaced lower-case ids, rejects duplicates and more than twenty aliases, and replaces the file atomically; show reports an invalid file instead of treating it as empty | [[c4]] |
| 7 | **`t7`** Give the registry the services and add the daemon feedback and identity methods | M | `t5`, `t6` | integration: feedback-wiring.test.ts: the daemon's artifact.feedback.add, artifact.feedback.list, identity.show and identity.declare handlers use the repository's FeedbackService and the identity service | [[c5]] |
| 8 | **`t8`** Re-point artifact.feedback.append at the service | M | `t7` | integration: feedback-wiring.test.ts: the daemon's artifact.feedback.append handler stores a legacy request as a Feedback line with the mapped kind and anchor, keeps a companion-file target in anchor.section, and keeps its request and error shapes | [[c5]] |
| 9 | **`t9`** Re-point the review decision's comments at the service | M | `t7`, `t8` | integration: review-decision.test.ts: handleReviewDecision stores its comments as Feedback entries by the request's actor or the current actor, with kind revision-request for send-feedback and one batchId, and still reports commentsError when saving fails after the decision | [[c5]] |
| 10 | **`t10`** Prove the gates ignore declared identities and record the s9 inputs | S | `t6`, `t9` | integration: gate-identity.test.ts: the team gate decides on the tracker's whoAmI only: declaring the claimant's login as an alias of another person does not change the gate's outcome, and nothing under src/workflow/team imports the identity module; integration: artifact-write-inventory.test.ts: the identity file writer is classified and appendSidecarLine remains the one raw append for history | [[c4]] [[c6]] |

### 1.1 E202610212f27754d:S005:T001 — Add inReplyTo to Feedback and validate it

Add the optional inReplyTo field to the Feedback type in src/workflow/artifact-core/types.ts (AMD-2f27754d4ad00b8e-9) and make validateFeedback in src/workflow/artifact-core/history.ts accept it only as a non-empty string different from the entry's own id, and refuse a reply (an entry with inReplyTo) that carries nested replies. Nothing else about the shape or the stored lines changes.

**Acceptance checks:**
- an entry with inReplyTo set to a non-empty string appends and reads back with the field
- inReplyTo equal to the entry's own id, empty, or not a string is refused with HistoryEntryError
- a reply that carries nested feedback[] is refused
- an entry without inReplyTo validates exactly as before

### 1.2 E202610212f27754d:S005:T002 — Apply the addresses rule in ArtifactStore.write

In ArtifactStore.writeUnlocked (src/workflow/artifact-core/store.ts), when the operation is update and the revision number moves and the writer gave no addresses, stamp addresses 'all' on the staged entry; when the writer gave a list, check before staging that every id is a root feedback entry of this artifact (no inReplyTo) that no earlier update entry addressed, and refuse with HistoryEntryError naming the bad ids; an update that moves no revision and a lifecycle operation address nothing. ContentWriteOptions and LifecycleService.updateContent pass addresses through.

**Acceptance checks:**
- a revision that moves the revision number logs addresses 'all' when none is given and openFeedback then returns nothing
- a list addresses only those roots and the other roots stay open
- a list naming an unknown id, a reply id, or an id an earlier revision addressed is refused and nothing is staged
- an identical rewrite and a lifecycle operation such as approve or review log no addresses
- an empty list is valid and addresses nothing
- the s2, s3 and s4 store, lifecycle and recovery tests pass unchanged

### 1.3 E202610212f27754d:S005:T003 — Make every automated content writer address nothing

Pass addresses [] from the three automated content callers: the controller's review auto-fix in src/daemon/steps/review-step/phases/verdicts.ts, the daemon review auto-fix in src/workflow/review/run-artifact.ts, and storeRound in src/workflow/runners/build/round-writer.ts (BUILD, TESTS and code-review rounds, also reached from ensureBuildRecordOnCompletion). Record the inventory of updateContent, update and write callers in the plans document with the decision for each.

**Acceptance checks:**
- a review auto-fix on the controller path and on the daemon path leaves an open revision request open
- a BUILD, TESTS or code-review round record leaves open feedback on that record open
- every production caller of updateContent, update and write is listed in the plans document with its decision
- the review-step, run-artifact and round-recording tests pass

### 1.4 E202610212f27754d:S005:T004 — Build the thread view over History

Add the feedback module (src/workflow/feedback/) with FeedbackThread and a pure builder that nests reply lines under their root by inReplyTo in the reader's (timestamp, id) order, returns a reply whose parent is missing as an orphan root, never lists a reply on its own, and marks a thread addressed from the log; add FeedbackService.threads(artifactId, { open }) over History.feedback, History.log and History.openFeedback.

**Acceptance checks:**
- replies nest under their root in time-then-id order
- an orphan reply is returned as an orphan root and never dropped
- threads with open true returns only threads whose root no later update addressed, and a reply never appears as an open item itself
- a reply added after its root was addressed leaves the thread addressed
- feedback and log entries with one timestamp are ordered by the shared rule whichever file is read first

### 1.5 E202610212f27754d:S005:T005 — Add FeedbackService.add with retry comparison and per-artifact atomicity

Add FeedbackService.add(artifactId, input, actor): read the head for existence and the current revision, check the actor is a namespaced lower-case id, default the kind to comment, mint a 32-hex id and the time unless the caller gave an id, check a reply's parent is a root of this artifact, compare a repeated caller id on the caller-supplied fields (text, kind, anchor, inReplyTo, batchId, actor id) and return the stored entry unchanged on a match or refuse on a difference, and run the lookup and the append under the store's per-artifact queue (expose an exclusive-run method on ArtifactStore) so two concurrent adds cannot both append.

**Acceptance checks:**
- one root entry is stored with the author, a minted id, the time and the head's revision, and the kind defaults to comment
- blank text, a non-namespaced actor and a malformed anchor are refused and nothing is appended
- a reply is stored as its own line; a missing parent, a parent on another artifact and a reply to a reply are refused
- a retry with the same id and the same caller fields returns the stored entry with its original timestamp and revision and appends nothing; a different text under that id is refused
- two concurrent adds with one id and different content leave exactly one line
- feedback on a design, a plan and a Task lands in the right file, a Task's line in its Story's Tasks file, and survives a restart
- a missing artifact is refused with ArtifactNotFoundError and nothing is written

### 1.6 E202610212f27754d:S005:T006 — Add the IdentityService and the identity file

Add the identity module (src/workflow/identity/) with IdentityService.currentActor(repoPath), declare and show, and the ~/.insrc/identity.json file ({ primary, aliases[] }, atomic replace, ids namespaced and lower-case, no duplicates, at most 20 aliases, IdentityError). currentActor wraps resolveLearner and localIdentityDeps from src/understanding/identity.ts and TrackerPort.whoAmI as the github source, maps the result to a namespaced person Actor (github:<login>, git:<email>, os:<user>@<host>), copies the declared aliases into properties.aliases only onto the declared primary or an alias, never throws, and reports an invalid file without blocking attribution.

**Acceptance checks:**
- currentActor returns github:<login> when the tracker answers, else git:<email>, else os:<user>@<host>, always lower-case and namespaced
- the same inputs give the same identity through resolveLearner and through IdentityService
- declared aliases are copied onto the declared primary or an alias and onto no other actor
- declare rejects non-namespaced or upper-case ids, duplicates and more than 20 aliases, and replaces the file atomically; show reports an invalid file instead of treating it as empty
- an invalid identity file leaves currentActor working without aliases and logs the problem

### 1.7 E202610212f27754d:S005:T007 — Give the registry the services and add the daemon feedback and identity methods

Extend the repository entry in src/daemon/lifecycle-registry.ts with a FeedbackService (and its History) and the IdentityService, and register artifact.feedback.add, artifact.feedback.list, identity.show and identity.declare in the handler map of src/daemon/index.ts, with the request actor handled by approvalActorOf and the current actor as the default. A repository that cannot get an entry is refused with that error.

**Acceptance checks:**
- artifact.feedback.add stores an entry for the request's actor id, or the current actor when none is given, through the repository's FeedbackService
- artifact.feedback.list returns threads, open ones when asked, for any artifact id including a Task
- identity.show and identity.declare read and write the identity file through the service
- an actor that is not a namespaced lower-case id is refused and nothing is recorded
- a repository whose registry entry cannot be created is refused

### 1.8 E202610212f27754d:S005:T008 — Re-point artifact.feedback.append at the service

Make the daemon's artifact.feedback.append handler convert its legacy request (coerceRequest in src/workflow/artifacts/provenance/tool.ts) into FeedbackService.add: kind feedback becomes revision-request, suggestion and comment stay; the anchor maps quote, sectionSlug (as section), prefix and suffix; a target.file other than the artifact's own document goes into anchor.section; the author string becomes the actor name when no actor id is given; the result keeps its shape with the stored entry's id. The legacy appendFeedback writer stays for callers outside the daemon.

**Acceptance checks:**
- a legacy request stores a Feedback line with the mapped kind and anchor and returns its id
- a companion-file target is kept on the parent artifact with the file path in anchor.section
- the request shape and the error shape of the handler are unchanged for existing clients
- the legacy appendFeedback writer still works for callers outside the daemon and its tests pass

### 1.9 E202610212f27754d:S005:T009 — Re-point the review decision's comments at the service

Give ReviewDecisionDeps a feedbackFor seam and make handleReviewDecision (src/workflow/review-decision.ts) store the decision's comments through FeedbackService.add by the request's actor or the current actor, with the kind taken from the decision that took effect (feedback becomes revision-request, approve and reject become comment), one batchId, the anchor and the companion-file mapping of t8; keep commentsError and the result shape, and wire the daemon's reviewDecision handler to the registry's service. Update the review-decision tests and the source-pinning test with it.

**Acceptance checks:**
- comments of an approved or rejected decision are stored as comment entries and of a send-feedback decision as revision-request entries, all with one batchId and the right actor
- a withheld approval's comments are stored as revision requests
- a failure saving comments after the decision reports commentsError and leaves the decision in place
- entryIds are the stored Feedback ids and the result shape is otherwise unchanged
- the existing review-decision tests pass in their updated form

### 1.10 E202610212f27754d:S005:T010 — Prove the gates ignore declared identities and record the s9 inputs

Add the gate-identity test (declaring the claimant's login as an alias of another person does not change a team gate's outcome, and nothing under src/workflow/team imports the identity module), classify the identity file writer in the write inventory, and record in docs/plans/core-data-model.md what s9 must do with body.feedback entries and that the body.feedback readers show a mixed view until then.

**Acceptance checks:**
- the team gate's outcome is the same with and without a declared alias for the claimant
- no module under src/workflow/team imports the identity module or reads the identity file
- the write inventory test passes with the identity writer classified
- the plans document lists the s9 inputs from this Story

## 2. Test-strategy coverage

| LLD strategy item | Covered by |
| :--- | :--- |
| FeedbackService.add stores one root entry with the author, a minted id and time and the head's revision, defaults the kind to comment, and refuses blank text, a non-namespaced actor and a malformed anchor | `t5` |
| FeedbackService.add stores a reply as its own line with inReplyTo, refuses a missing parent, a parent on another artifact and a reply to a reply, and a repeated caller id returns the stored entry or is refused when the content differs | `t5` |
| FeedbackService.threads nests replies under their root in time-then-id order, returns an orphan reply as an orphan root, never lists a reply on its own as open, and filters to open threads | `t4` |
| ArtifactStore.write stamps addresses 'all' on a revision that moves the revision number, honours a list, refuses ids that are not roots or are already addressed, and addresses nothing on an identical rewrite or a lifecycle operation | `t2`, `t3` |
| History.validateFeedback accepts inReplyTo as a non-empty string other than its own id and refuses a reply that carries nested replies | `t1` |
| IdentityService.currentActor builds github:<login> from the tracker's whoAmI, falls back to git then os when the tracker does not answer, and copies the declared aliases only onto the declared primary or an alias | `t6` |
| IdentityService.declare validates namespaced lower-case ids, rejects duplicates and more than twenty aliases, and replaces the file atomically; show reports an invalid file instead of treating it as empty | `t6` |
| feedback on a design, a plan and a single Task is recorded once as a framed line in the right file, survives a restart, and a Task's line lands in its Story's Tasks file and reads back for that Task only | `t5` |
| a revision of an artifact addresses all its open feedback by default and only the listed roots when a list is given, in the shared (timestamp, id) order with the feedback file read first or last | `t2`, `t5` |
| two clones that add feedback and replies to one artifact merge with no conflict and the threads read back once each in order | `t5` |
| handleReviewDecision stores its comments as Feedback entries by the request's actor or the current actor, with kind revision-request for send-feedback and one batchId, and still reports commentsError when saving fails after the decision | `t9` |
| the daemon's artifact.feedback.add, artifact.feedback.list, artifact.feedback.append, identity.show and identity.declare handlers use the repository's FeedbackService and the identity service | `t7`, `t8` |
| the team gate decides on the tracker's whoAmI only: declaring the claimant's login as an alias of another person does not change the gate's outcome, and nothing under src/workflow/team imports the identity module | `t10` |

## 3. References

- **[[c1]]** `prior-artifact` `LLD s5 handoff: the inReplyTo field on Feedback and its validation (AMD-9)`
- **[[c2]]** `prior-artifact` `LLD s5 handoff: the addresses rule in ArtifactStore.write and the automated writers that pass an empty list`
- **[[c3]]** `prior-artifact` `LLD s5 handoff: FeedbackService.add and threads, the retry comparison and per-artifact atomicity`
- **[[c4]]** `prior-artifact` `LLD s5 handoff: the IdentityService, the identity file and the gates that keep the tracker identity`
- **[[c5]]** `prior-artifact` `LLD s5 handoff: the registry, the daemon methods and the re-pointed feedback writers`
- **[[c6]]** `prior-artifact` `LLD s5 handoff: the write inventory entry and the s9 inputs`
