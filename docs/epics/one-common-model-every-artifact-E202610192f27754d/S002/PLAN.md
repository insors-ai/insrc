<!-- insrc:artifact PLAN-2f27754d4ad00b8e-s2 -->

# Plan: E202610202f27754d:S002

## Summary

**Epic:** `one-common-model-every-artifact`
**LLD run:** `wf-1792513058992-7t1vmw`
**LLD effective hash:** `07908de0d965...`

The build lays the common model in small steps: the types and the rename first, then the pure prepare split and the inventory detector (each independent), the sidecar primitive and History, the codecs with the shared decoder and the creation context, the gates readers moving onto the decoder, the store read side, the store write side with the journal and recovery, the repository gate, the legacy feedback conversion, and last the s9 inputs and final checks. Every task keeps the inventory test green and leaves existing behaviour unchanged.

## Contents

1. [Tasks](#1-tasks)
2. [Test-strategy coverage](#2-test-strategy-coverage)
3. [References](#3-references)

## 1. Tasks

| # | Task | Size | Depends on | Tests | Derived from |
| :--- | :--- | :--- | :--- | :--- | :--- |
| 1 | **`t1`** Declare the envelope types and rename the build change log types | M | — | unit: src/workflow/artifact-core/__tests__/types-contract.test.ts: the exported types accept the sc2, sc3, sc4 and sc6 sketches and the stated anchor extension | [[c1]] |
| 2 | **`t2`** Split writeArtifact into a pure prepare step and a write | M | — | unit: src/workflow/__tests__/prepare-artifact-write.test.ts: prepareArtifactWrite returns the bytes and revision writeArtifact writes for content, meta-only, identical and first writes, and writes nothing | [[c2]] |
| 3 | **`t3`** Extend the write-inventory detector and enter the files it newly flags | M | — | integration: src/workflow/__tests__/artifact-write-inventory.test.ts: the detector reports appendFileSync in every form, an unlisted appendSidecarLine and a store write, and every newly flagged file has an entry | [[c3]] |
| 4 | **`t4`** Add the sidecar primitive and History | M | `t1`, `t3` | unit: src/workflow/artifact-core/__tests__/history.test.ts: History validates feedback and keeps the anchor through a round trip, and openFeedback closes entries by addresses; integration: src/workflow/artifact-core/__tests__/sidecar.test.ts: appendSidecarLine appends one JSON line per call to the path it is given | [[c3]] |
| 5 | **`t5`** Add the kind codecs, the creation context and the shared decoder | L | `t1` | unit: src/workflow/artifact-core/__tests__/decode.test.ts: decodeArtifactHead fills every envelope part, returns empty parts for a head without them, and refuses a malformed head, an unknown kind and a flat amendment; integration: src/workflow/artifact-core/__tests__/codec-create.test.ts: a create without a prior head builds identity meta that workItemAnchorCreatedAt and the Define renderer accept | [[c4]] |
| 6 | **`t6`** Delegate the four gates readers to the shared decoder | M | `t5` | integration: src/workflow/artifact-core/__tests__/gates-delegation.test.ts: the four gates readers return the same artifact and the same missing-file error as before, synchronously | [[c5]] |
| 7 | **`t7`** Add the read side of ArtifactStore | M | `t4`, `t5` | integration: src/workflow/artifact-core/__tests__/store-read.test.ts: readWithHistory exposes identity, description, parent, references, change log, feedback and lifecycle in one shape for an artifact with non-empty history and feedback; unit: src/workflow/artifact-core/__tests__/store-read.test.ts: a head with no envelope or lifecycle part reads an empty part and does not fail; unit: src/workflow/artifact-core/__tests__/store-read.test.ts: a reference names its target, type and relation, external targets are accepted, and the parent chain is given by the parent link; integration: src/workflow/artifact-core/__tests__/store-children.test.ts: children are derived from the parent link and are never stored on the parent | [[c6]] |
| 8 | **`t8`** Add the write side with the WriteJournal and recovery | L | `t2`, `t4`, `t7` | integration: src/workflow/artifact-core/__tests__/store-write.test.ts: write then read round trip keeps the revision rule for every registered kind; unit: src/workflow/artifact-core/__tests__/store-write.test.ts: only a content change moves the revision, and a description change is content; unit: src/workflow/artifact-core/__tests__/store-write.test.ts: a bad parent or artifact-typed reference is refused and external references are accepted; integration: src/workflow/artifact-core/__tests__/journal.test.ts: a failure at stage, log append, head replace and clear each leaves the documented state and the next write completes the staged operation once; integration: src/workflow/artifact-core/__tests__/journal.test.ts: a restart before the append, a retry by a different actor and an identical-head append failure all recover the original entry; integration: src/workflow/artifact-core/__tests__/store-write.test.ts: a store write keeps the prior meta so workItemAnchorCreatedAt and the Define renderer give the same results | [[c6]] |
| 9 | **`t9`** Add RepoSchemaGate | S | — | unit: src/workflow/artifact-core/__tests__/repo-schema.test.ts: RepoSchemaGate reads version 1 with no marker, requires a version and throws on an invalid marker | [[c7]] |
| 10 | **`t10`** Add the legacy feedback conversion | M | `t1` | unit: src/workflow/artifact-core/__tests__/feedback-convert.test.ts: the legacy feedback conversion maps every field and reports what it cannot map | [[c8]] |
| 11 | **`t11`** Record the s9 inputs and the final checks | S | `t6`, `t8`, `t9`, `t10` | unit: src/workflow/__tests__/docs-s2-inputs.test.ts: the plans doc lists the four s9 conversion inputs from the common model Story | [[c9]] |

### 1.1 E202610202f27754d:S002:T001 — Declare the envelope types and rename the build change log types

Add src/workflow/artifact-core/types.ts with the envelope, Actor, Reference, ChangeLogEntry, Feedback, SidecarRecord, RepoSchema, the error classes, and the sc4 Lifecycle family and sc6 TrackerBinding and Attachment exactly as the HLD defines them. Rename the provenance ChangeLogEntry and ChangeLog to FileChangeEntry and FileChangeLog and update their three consumers. Stored data does not change.

**Acceptance checks:**
- the exported types accept the sc2, sc3, sc4 and sc6 sketches (with the stated anchor extension) and nothing else is exported from the new module
- no production file refers to the old ChangeLogEntry or ChangeLog names and the build change log tests pass unchanged apart from the names
- the repository type-checks

### 1.2 E202610202f27754d:S002:T002 — Split writeArtifact into a pure prepare step and a write

In src/workflow/storage.ts add prepareArtifactWrite returning the exact bytes, the revision and whether content changed, and rewrite writeArtifact as prepare then writeAtomic with an identical signature and results.

**Acceptance checks:**
- prepareArtifactWrite returns the bytes and revision writeArtifact writes for content, meta-only, identical and first writes
- every existing writeArtifact and storage test passes unchanged
- prepareArtifactWrite writes nothing

### 1.3 E202610202f27754d:S002:T003 — Extend the write-inventory detector and enter the files it newly flags

In src/workflow/artifact-write-inventory.ts add appendFileSync, appendSidecarLine and an import-based store-write rule to the detector, with negative controls, and add inventory entries for every existing file the detector newly flags (src/daemon/fatal.ts, src/daemon/shutdown.ts, the analyze-step, build-step, workflow-step and review-step handlers, src/config/feedback.ts and the appendRunLog call in src/workflow/storage.ts). It names the new writers by name only, so it does not need the new files to exist.

**Acceptance checks:**
- the detector reports a raw, aliased, renamed, namespace and injected appendFileSync, an unlisted appendSidecarLine and a store write in a file with no entry
- the five existing writers are still detected exactly as before
- every file under src that the detector now flags has an inventory entry and the inventory test passes

### 1.4 E202610202f27754d:S002:T004 — Add the sidecar primitive and History

Add src/workflow/artifact-core/sidecar.ts (appendSidecarLine and the in-memory reader and appender) and src/workflow/artifact-core/history.ts (History with entry validation and the anchor limits), and enter the sidecar file in the inventory in the same task.

**Acceptance checks:**
- History validates text, kind and the anchor limits and keeps prefix, suffix, section and lines through a round trip
- openFeedback closes entries by addresses all and by listed ids
- appendSidecarLine appends one JSON line per call to the path it is given
- the inventory test passes with the sidecar file entered

### 1.5 E202610202f27754d:S002:T005 — Add the kind codecs, the creation context and the shared decoder

Add the codec registry with a codec per existing kind except AMD, each owning encode(payload, ctx) and the kind's identity meta; define the codec creation context type and its provider so a create with no prior head obtains workflow, runId, repoPath, createdAt, epicCreatedAt, elapsedMs, repoIndexedAt and schemaVersion; add the pure synchronous decodeArtifactHead; make the AMD codec refuse a flat amendment with a pointer to the s9 conversion.

**Acceptance checks:**
- decodeArtifactHead fills every envelope part for a head with envelope parts and returns empty parts for a head without them
- a create without a prior head builds a head whose workItemAnchorCreatedAt and Define renderer results are the ones an existing writer would produce
- a flat amendment, a malformed head and an unknown kind are refused with the documented errors

### 1.6 E202610202f27754d:S002:T006 — Delegate the four gates readers to the shared decoder

Make readDefineArtifact, readHldArtifact, readLldArtifact and readPlanArtifact in src/workflow/gates.ts call decodeArtifactHead, staying synchronous with unchanged return shapes and missing-file errors.

**Acceptance checks:**
- each reader returns the same artifact and the same ArtifactMissingError as before for a head with no envelope parts
- no caller of the four readers changed or became asynchronous
- the gates, orchestrator and build-step tests pass unchanged

### 1.7 E202610202f27754d:S002:T007 — Add the read side of ArtifactStore

Add src/workflow/artifact-core/store.ts with ArtifactStore.read, readWithHistory and childrenOf over the decoder and History, and enter the store file in the inventory in the same task.

**Acceptance checks:**
- readWithHistory returns identity, description, parent, references, change log, feedback and lifecycle in one shape for an artifact with non-empty history and feedback
- an artifact type with no lifecycle part reads an empty part and nothing fails
- childrenOf derives children from parent links, skips an unreadable head and stores nothing on the parent
- the inventory test passes with the store file entered

### 1.8 E202610202f27754d:S002:T008 — Add the write side with the WriteJournal and recovery

Add ArtifactStore.write and the WriteJournal port (stage, pending, clear) with an in-memory journal and a named non-durable constructor. The journal stages the whole immutable ChangeLogEntry with the prepared head; write completes any pending operation first, then stages, appends the log entry, replaces the head and clears; recovery appends the staged entry idempotently even when the head already matches. Validate the parent and artifact-typed references and merge the prior meta, replacing only meta.envelope, meta.lifecycle and meta.revision.

**Acceptance checks:**
- only a content change moves the revision, and a description change is content
- a failure at stage, log append, head replace and clear each leaves the documented state and the next write completes the staged operation under the same operation id with the log showing it once
- a restart before the append, a retry by a different actor and an identical-head append failure all recover the original entry
- the store merges prior meta and a store write followed by workItemAnchorCreatedAt and the Define renderer returns the same results as before the write
- external references are accepted and a bad parent or artifact-typed reference is refused

### 1.9 E202610202f27754d:S002:T009 — Add RepoSchemaGate

Add the repository version marker reader and require over .insrc/schema.json, with absent meaning version 1.

**Acceptance checks:**
- read returns version 1 with no marker and the marker's version when valid
- require refuses an unconverted repository with a message naming the s9 conversion and throws on an invalid marker

### 1.10 E202610202f27754d:S002:T010 — Add the legacy feedback conversion

Add the pure conversion from a stored FeedbackEntry to a Feedback with a report of unmapped fields: absent kind becomes comment, the author becomes an unknown: actor, sectionSlug becomes section, the segment becomes lines, an integer target.version becomes revision and any other value is reported, and the decision becomes the batch's log outcome.

**Acceptance checks:**
- every stated mapping is covered by a test including the absent kind and the namespaced actor
- an unmappable target.version or a foreign target.file is reported, not dropped

### 1.11 E202610202f27754d:S002:T011 — Record the s9 inputs and the final checks

Record in docs/plans/core-data-model.md the s9 conversion inputs this Story creates (the flat amendments, the envelope and lifecycle back-fill, the feedback conversion and the version marker) and run the workflow, mcp and daemon subsets and the build.

**Acceptance checks:**
- the plans doc lists the four s9 inputs from this Story
- npm run build succeeds and the workflow and mcp subsets pass

## 2. Test-strategy coverage

| LLD strategy item | Covered by |
| :--- | :--- |
| prepareArtifactWrite returns the same bytes and revision that writeArtifact writes for content, meta-only, identical and first writes, and writeArtifact keeps its existing results | `t2` |
| decodeArtifactHead fills every envelope part from a head with and without meta.envelope and meta.lifecycle, and rejects a malformed head, an unknown kind and an unconverted amendment | `t5` |
| ArtifactStore.write chooses content for a payload or description change and meta-only for references, parent, attachments, binding or lifecycle changes | `t8` |
| reference validation: an artifact-typed reference with a bad id and a parent that differs from ArtifactIds.parentOf are refused; github:issue, code-path and URL references are accepted | `t8` |
| the operation id is the same for a replayed staged write and different when the prior revision or the bytes differ | `t8` |
| History.appendFeedback validation of text, kind and the anchor limits, and that prefix, suffix, section and lines survive a round trip | `t4` |
| History.openFeedback closing by addresses 'all' and by listed ids | `t4` |
| RepoSchemaGate.read and require over no marker, a valid marker and an invalid marker | `t9` |
| the legacy feedback conversion: absent kind, namespaced unknown: actor, sectionSlug to section, segment to lines, integer and non-integer target.version, foreign target.file, decision to the batch log outcome | `t10` |
| write then read round trip for each registered kind keeps the revision rule: identical rewrite keeps it, a reference change keeps it, a description change moves it, a payload change moves it by one | `t8` |
| a store write followed by workItemAnchorCreatedAt and the Define renderer over the stored head returns the same anchor and markdown as before the write | `t8` |
| retry BEFORE replacement: a failure injected at stage, at the log append and at the head replace leaves the documented state and the next write completes the staged operation under the same operation id with the log showing it once | `t8` |
| retry AFTER replacement: the head replace succeeds and clear fails, the write still resolves, and the next write finds the pending operation, only clears it and appends no second entry | `t8` |
| an unrelated write while an operation is pending completes the pending one first | `t8` |
| a fresh store over the same directory and a persisted journal replays a staged write after a simulated restart | `t8` |
| readWithHistory returns a non-empty change log and non-empty feedback together with the lifecycle for an artifact that has both | `t7` |
| readDefineArtifact, readHldArtifact, readLldArtifact and readPlanArtifact return the same artifact and the same missing-file error as before, synchronously, for a head with no envelope parts | `t6` |
| appendSidecarLine appends one JSON line per call to a path it is given | `t4` |
| the write inventory test over the real src tree: every file the new detector flags has an entry, the store and primitive files have entries, and the negative controls for raw, aliased, renamed, namespace, injected appendFileSync and a store write with no entry are reported | `t3`, `t4`, `t7` |
| the build change log tests pass unchanged apart from the renamed type names | `t1` |
| the Lifecycle, Revision, Approval, Review, Signoff, Staleness, TrackerBinding and Attachment types accept the sc4 and sc6 sketches exactly | `t1` |
| the Artifact, ChangeLogEntry, Feedback and SidecarRecord types accept the sc2 and sc3 sketches plus the stated anchor extension | `t1` |
| the stored head keeps { meta, body, citations } with envelope parts only under meta.envelope and meta.lifecycle | `t5`, `t8` |

## 3. References

- **[[c1]]** `prior-artifact` `LLD LLD-2f27754d4ad00b8e-s2 handoff c1: envelope types and the build change log rename`
- **[[c2]]** `prior-artifact` `LLD LLD-2f27754d4ad00b8e-s2 handoff c2: prepareArtifactWrite split in src/workflow/storage.ts`
- **[[c3]]** `prior-artifact` `LLD LLD-2f27754d4ad00b8e-s2 handoff c3: write-inventory detector, sidecar primitive and History`
- **[[c4]]** `prior-artifact` `LLD LLD-2f27754d4ad00b8e-s2 handoff c4: kind codecs, creation context and shared decoder`
- **[[c5]]** `prior-artifact` `LLD LLD-2f27754d4ad00b8e-s2 handoff c5: gates readers delegate to the decoder`
- **[[c6]]** `prior-artifact` `LLD LLD-2f27754d4ad00b8e-s2 handoff c6: ArtifactStore read and write sides with the WriteJournal`
- **[[c7]]** `prior-artifact` `LLD LLD-2f27754d4ad00b8e-s2 handoff c7: RepoSchemaGate`
- **[[c8]]** `prior-artifact` `LLD LLD-2f27754d4ad00b8e-s2 handoff c8: legacy feedback conversion`
- **[[c9]]** `prior-artifact` `LLD LLD-2f27754d4ad00b8e-s2 handoff c9: s9 conversion inputs and final checks`
