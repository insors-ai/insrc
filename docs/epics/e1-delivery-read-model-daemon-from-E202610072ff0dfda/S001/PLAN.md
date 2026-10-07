<!-- insrc:artifact PLAN-2ff0dfdadb1c8d1c-s1 -->

# Plan: E202610072ff0dfda:S001

## Summary

**Epic:** `e1-delivery-read-model-daemon-from`
**LLD run:** `wf-1791362817440-s4i7om`
**LLD effective hash:** `215b5fd4f60f...`

Building story 1 means adding a new src/workflow/delivery module with four source files and their tests: the shared types, the notice module, a read-only loader for the artifact store, and the pure graph builder that turns loaded records into one hierarchy of epics, stories, tasks and issues. Most of the work and most of the tests sit in the graph builder, whose rules are checked against fixtures copied from real records in the store. No existing file changes.

## Contents

1. [Tasks](#1-tasks)
2. [Test-strategy coverage](#2-test-strategy-coverage)
3. [References](#3-references)

## 1. Tasks

| # | Task | Size | Depends on | Tests | Derived from |
| :--- | :--- | :--- | :--- | :--- | :--- |
| 1 | **`t1`** Delivery types: record set, work-item graph, notice and filesystem port | S | — | unit: types.test.ts: 'DeliveryStoreUnreadableError carries the store path and the underlying message' | [[c2]] [[c3]] [[c4]] [[c5]] |
| 2 | **`t2`** Notice module: attention table, constructor and deterministic sort | S | `t1` | unit: notice.test.ts: 'NOTICE_ATTENTION is true for exactly record-unreadable, identity-ambiguous, unresolved-parent and validation-conflict'; unit: notice.test.ts: 'makeNotice sorts and de-duplicates ids and takes attention from the table'; unit: notice.test.ts: 'sortNotices gives one order for every permutation and drops exact duplicates' | [[c1]] [[c4]] |
| 3 | **`t3`** Test fixtures: record builders and real-shape records | S | `t1` | unit: fixtures.test.ts: 'every real-shape fixture builds a valid ArtifactRecord with its identity fields intact' | [[c7]] |
| 4 | **`t4`** Loader: read the artifact store once into the record set | M | `t1` | integration: load.test.ts: 'every kind in a temporary store is lifted, AMD from its flat shape'; integration: load.test.ts: 'invalid JSON, missing meta, unknown prefix and an unreadable file each become a load failure and the load continues'; integration: load.test.ts: 'an absent store yields an empty record set'; integration: load.test.ts: 'a store whose listDir throws raises DeliveryStoreUnreadableError'; integration: load.test.ts: 'the store is byte-identical after a load'; integration: load.test.ts: 'an unparseable storyId keeps storyIdRaw with storyOrdinal null' | [[c1]] [[c2]] [[c5]] [[c6]] |
| 5 | **`t5`** Graph builder, part 1: grouping, identity, membership and evidence | M | `t1`, `t2`, `t3` | unit: graph.test.ts: 'a story with LLD, PLAN, BUILD and CR is one item with all four as evidence'; unit: graph.test.ts: 's1 and S001 records join one story and both raw ids are kept in sourceIds'; unit: graph.test.ts: 'the real S001/s001 pair from epic dfc0371b yields one story'; unit: graph.test.ts: 'LLD standalone true with BUILD standalone false (real d88062a6 and dfc0371b shapes) is one item with no notice'; unit: graph.test.ts: 'an unparseable storyId keeps its own :R(<raw>) item and raises identity-ambiguous naming the sibling story items'; unit: graph.test.ts: 'a standalone story with no head is a root with no invented epic, dated from its own LLD'; unit: graph.test.ts: 'a trivial story with only a BUILD (standalone true) and a CR is a standalone root with no unresolved-parent notice'; unit: graph.test.ts: 'pending and rejected EXT records create no story item and appear as epic evidence'; unit: graph.test.ts: 'a rejected EXT whose story nothing else names is keyed epic-level and creates no story key'; unit: graph.test.ts: 'records with an invalid createdAt or a non-hex hash get the H-form id and an identity-anchor-missing notice'; unit: graph.test.ts: 'groupRecordsByWorkItem keys an unparseable storyId as <hash>\\|R(x), omits SPECs, and a head-less HLD key carries an unresolved-parent notice'; unit: identity-contract.test.ts: 'epic, standalone and issue ids equal deriveWorkItemIdentity over the anchor inputs and pinned folder segments, including a sized-bugfix LLD dated a different day from its ISSUE' | [[c1]] [[c3]] [[c4]] [[c8]] |
| 6 | **`t6`** Graph builder, part 2: tasks, issues and parents, SPECs, roots | M | `t5` | unit: graph.test.ts: 'task t1 in two stories of different epics gets two distinct canonical ids'; unit: graph.test.ts: 'a BUILD task id equal to the story id creates no task item and no notice'; unit: graph.test.ts: 'tasks under an :R(x) story and under a story with an invalid createdAt get <story id>:T<nnn> ids and the builder does not throw'; unit: graph.test.ts: 'an issue with fix stories S001 and S002 has two distinct story children with their own tasks and evidence'; unit: graph.test.ts: 'a self-slug parentRef gives correctsRef null and no notice'; unit: graph.test.ts: 'an issue whose outward parentRef matches nothing is present with an unresolved-parent notice'; unit: graph.test.ts: 'a parentRef with slug and storyId (ISSUE-57446545909fe95c shape) resolves to the named story'; unit: graph.test.ts: 'a parentRef naming an existing epic and a storyId it lacks resolves to the epic with an unresolved-parent notice naming the missing story'; unit: graph.test.ts: 'a bare-hash parentRef slug (ISSUE-095906bac5bbacaf shape) resolves to the existing story without a notice'; unit: graph.test.ts: 'a hierarchical slug parentRef resolves through parseWorkflowId'; unit: graph.test.ts: 'a parentRef slug matching two hashes resolves to nothing and raises identity-ambiguous naming both'; unit: graph.test.ts: 'a SPEC named by seededFromSpec is in that epic's evidence; an unnamed SPEC raises unattached-spec'; unit: graph.test.ts: 'the same record set built twice gives a deep-equal graph' | [[c1]] [[c3]] [[c4]] [[c6]] |

### 1.1 E202610072ff0dfda:S001:T001 — Delivery types: record set, work-item graph, notice and filesystem port

Create src/workflow/delivery/types.ts with the sc1 types (DeliveryArtifactKind, ApprovalState, ArtifactRecord, RecordLoadFailure, ArtifactRecordSet), the sc2 types (DeliveryItemKind, WorkItemNode, WorkItemGraph), the sc3 types (NoticeCode, DeliveryNotice), the ReadonlyStoreFs port (exists, listDir, readFile) and the DeliveryStoreUnreadableError class. Type-only except the error class, so the VS Code plugin can import the types later.

**Acceptance checks:**
- The types match HLD sc1, sc2 and sc3 field for field, including correctsRef.slug, seededFromSpecId and epicCreatedAt.
- ReadonlyStoreFs has exactly three read operations and no write method.
- The module compiles under the repo's strict tsconfig (exactOptionalPropertyTypes, noUncheckedIndexedAccess).

### 1.2 E202610072ff0dfda:S001:T002 — Notice module: attention table, constructor and deterministic sort

Create src/workflow/delivery/notice.ts exporting NOTICE_ATTENTION (exhaustive over NoticeCode, true for record-unreadable, identity-ambiguous, unresolved-parent and validation-conflict), makeNotice (sorts and de-duplicates id lists, takes attention from the table) and sortNotices (code, then artifactIds, itemIds, fileNames, message; duplicates removed).

**Acceptance checks:**
- NOTICE_ATTENTION is typed Record<NoticeCode, boolean>, so a new code fails to compile until it is given a value.
- makeNotice never lets a caller set attention; attention always equals NOTICE_ATTENTION[code].
- sortNotices returns the same order for any permutation of the same input.

### 1.3 E202610072ff0dfda:S001:T003 — Test fixtures: record builders and real-shape records

Create src/workflow/delivery/__tests__/fixtures.ts with builders that fabricate ArtifactRecords and record sets per kind (in the style of pending.test.ts's pendingLld) and with real-shape fixtures copied by value from the 2026-10-07 store: the S001/s001 pair in epic dfc0371b, ISSUE-0855311b6b32eb72, ISSUE-2d9e9e694a94116b, ISSUE-57446545909fe95c, ISSUE-095906bac5bbacaf, LLD-d88062a6e63aa312-S001 with its BUILD, BUILD-d5a433047dc3439f-S001 with its CR, BUILD-0855311b6b32eb72-S001, one flat AMD and one EXT.

**Acceptance checks:**
- Fixtures are plain values in the test tree; no test reads the live .insrc/artifacts store.
- Each real-shape fixture keeps the fields the LLD's edge cases rely on (standalone, epicCreatedAt, parentRef, storyId, body.tasks ids).

### 1.4 E202610072ff0dfda:S001:T004 — Loader: read the artifact store once into the record set

Create src/workflow/delivery/load.ts with loadArtifactRecordSet(repoPath, fs?, now?) and the default node:fs ReadonlyStoreFs. List ARTIFACTS_DIR, parse each *.json, lift per kind (AMD flat: hash from top-level epicHash, approval from approvedAt / rejectedAt / status, createdAt from proposedAt, meta = all fields but amendment, body = amendment; every other kind from meta/body, with workItemHash from epicHash, issueHash or specHash), compute storyOrdinal with storyIdToOrdinal inside a catch, and record each bad file as a RecordLoadFailure. Absent store gives an empty set; an unlistable store throws DeliveryStoreUnreadableError. Sort records and failures.

**Acceptance checks:**
- Every *.json file in the store appears exactly once, in records or in failures.
- The four failure reasons (unreadable, invalid-json, missing-meta, unknown-kind) are each produced by their case and never abort the load.
- No file under the repository is created, modified or deleted.
- An unparseable storyId keeps storyIdRaw and gives storyOrdinal null without throwing.

### 1.5 E202610072ff0dfda:S001:T005 — Graph builder, part 1: grouping, identity, membership and evidence

Create src/workflow/delivery/graph.ts with groupRecordsByWorkItem and the first half of buildWorkItemGraph. Group records by work-item hash and key (ordinal, R(<raw>) for an unparseable id, empty for epic-level records, SPECs omitted, pending or rejected EXT at epic level). Create epic and issue nodes from DEF and ISSUE heads and story nodes from story groups; pick each anchor as buildRecordFolderArgs does (epic story: DEF createdAt; standalone: LLD workItemAnchorCreatedAt, else ISSUE createdAt, else earliest BUILD); mint every id through safeCanonical with the H-form and :R(<raw>) fallbacks; take standalone from the head, else the LLD, else (trivial route only) the BUILD; derive epic membership from DEF stories, approved EXT addedStory and non-EXT story groups; attach evidence per kind; raise identity-ambiguous, identity-anchor-missing and unresolved-parent (head-less records) notices.

**Acceptance checks:**
- s1 and S001 records of one story form one item whose sourceIds keep both raw ids.
- A story's LLD, PLAN, BUILD and CR are all in that item's evidenceArtifactIds.
- Story ids equal deriveWorkItemIdentity's canonical form over the anchor inputs and the existing folder segment.
- Disagreeing standalone flags between an LLD and its BUILD do not split the story or raise a notice.
- A trivial story with only a BUILD (standalone true) and a CR is a standalone root with no unresolved-parent notice.
- A pending or rejected EXT creates no story item and no story key, and is in its epic's evidence.
- No call throws for a malformed createdAt, a non-hex hash or an unparseable storyId.

### 1.6 E202610072ff0dfda:S001:T006 — Graph builder, part 2: tasks, issues and parents, SPECs, roots

Complete buildWorkItemGraph: mint task items from t<n> PLAN and BUILD ids through safeCanonical (falling back to '<story item id>:T<nnn>'), with no task for a BUILD id equal to the story's own id; set plannedTaskIds; attach fix stories to their issue by shared hash; resolve each ISSUE parentRef by epicHash, then by slug in its four forms (self-slug = no parent; epicSlug label; bare hash; hierarchical slug or canonical id via parseWorkflowId), excluding the issue's own hash, honouring storyId, and flagging multi-hash matches as identity-ambiguous; attach SPECs named by seededFromSpec and raise unattached-spec for the rest; compute rootIds and sort every list.

**Acceptance checks:**
- Task t1 in two stories of different epics gets two distinct canonical ids.
- An issue with fix stories S001 and S002 has both as distinct children with their own tasks and evidence.
- A self-slug parentRef gives correctsRef null and no notice; an outward parentRef that matches nothing gives an unresolved-parent notice on a present issue.
- A parentRef with slug and storyId resolves to that story; a storyId the matched epic lacks resolves to the epic with an unresolved-parent notice naming the missing story.
- A bare-hash slug and a hierarchical slug both resolve; a slug matching two hashes gives resolvedItemId null and an identity-ambiguous notice naming both.
- The same record set always yields an identical graph, including the order of every list.

## 2. Test-strategy coverage

| LLD strategy item | Covered by |
| :--- | :--- |
| buildWorkItemGraph | `t5`, `t6` |
| groupRecordsByWorkItem | `t5` |
| makeNotice | `t2` |
| sortNotices | `t2` |
| NOTICE_ATTENTION | `t2` |
| loadArtifactRecordSet | `t4` |
| ReadonlyStoreFs default implementation | `t4` |
| buildWorkItemGraph ids versus deriveWorkItemIdentity / toCanonical | `t5` |

## 3. References

- **[[c1]]** `prior-artifact` `LLD s1 contractDetails.api (loadArtifactRecordSet, buildWorkItemGraph, groupRecordsByWorkItem, makeNotice, sortNotices, NOTICE_ATTENTION)`
- **[[c2]]** `prior-artifact` `LLD s1 dataModelChanges: ArtifactRecord / RecordLoadFailure / ArtifactRecordSet (sc1)`
- **[[c3]]** `prior-artifact` `LLD s1 dataModelChanges: WorkItemNode / WorkItemGraph (sc2)`
- **[[c4]]** `prior-artifact` `LLD s1 dataModelChanges: NoticeCode / DeliveryNotice (sc3)`
- **[[c5]]** `prior-artifact` `LLD s1 dataModelChanges: ReadonlyStoreFs`
- **[[c6]]** `prior-artifact` `LLD s1 errorPaths (errorCases and edgeCases)`
- **[[c7]]** `prior-artifact` `LLD s1 testStrategy (fixturesNeeded and acceptanceMapping)`
- **[[c8]]** `prior-artifact` `LLD s1 interactionWithShared (sc1, sc2, sc3 implemented; anchor refinement of sc2)`
