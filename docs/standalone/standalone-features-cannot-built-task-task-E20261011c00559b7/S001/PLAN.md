<!-- insrc:artifact PLAN-c00559b7e38bb6ce-S001 -->

# Plan: E20261011c00559b7:S001

## Summary

**Epic:** `standalone-features-cannot-built-task-task`
**LLD run:** `wf-1791723579520-bhf5kd`
**LLD effective hash:** `56846a7ef468...`

Building this fix teaches the workflow that a standalone feature's LLD heads its work item. The core change is one head reader in storage.ts that the task resolver and folder naming both use, followed by the resolver changes that let the build tool admit standalone plan tasks without disturbing epic or bugfix resolution. Alongside that, head artifacts get names from a written title, triage starts carrying the SPEC a feature came from, and the docs migrator learns to gather already-split standalone folders, which is then run once over this repo.

## Contents

1. [Tasks](#1-tasks)
2. [Test-strategy coverage](#2-test-strategy-coverage)
3. [References](#3-references)

## 1. Tasks

| # | Task | Size | Depends on | Tests | Derived from |
| :--- | :--- | :--- | :--- | :--- | :--- |
| 1 | **`t1`** Make readEpicDefinitionCore the single work-item head reader | M | — | unit: readEpicDefinitionCore head precedence, LLD fallback, standalone:true and tracker; integration: legacy unflagged LLD-only item: BUILD/TESTS placed under docs/standalone; integration: finalizePlan writes PLAN.md into the anchor LLD's folder | [[c1]] [[c3]] |
| 2 | **`t2`** Route the tracker resolver through the shared head | M | `t1` | unit: readEpicIdentity and listEpicHashes over DEF/ISSUE/LLD fixtures; unit: resolveWorkflowRef reaches an LLD+PLAN-only task by scoped label and hierarchical id; unit: unscoped label tiering over a mixed DEF + ISSUE + LLD-only fixture; integration: insrc_build_step implement + validate admit t1 of a standalone plan; integration: workflowIdForIssue unchanged for a DEF epic with a tracker block; integration: existing id-resolve, folder-identity, storage and migrate-docs-tree suites pass | [[c2]] [[c3]] |
| 3 | **`t3`** Name head artifacts from a written title | M | `t1` | unit: head naming from title with focus fallback (SPEC, DEF, ISSUE, standalone LLD); integration: regression guard: standalone design.story with specHash stamps seededFromSpec and renders the Seeded-from line | [[c4]] |
| 4 | **`t4`** Thread an approved specHash through triage | S | — | unit: triage start validates specHash and classify forwards it into the nextCall; unit: triage state round-trips specHash | [[c5]] |
| 5 | **`t5`** Teach the docs migrator about LLD-headed work items | S | — | unit: planMigration consolidates an anchorless split item into the LLD folder; unit: planMigration groups an unflagged LLD-headed item as standalone | [[c6]] |
| 6 | **`t6`** Consolidate this repo's split standalone folders | S | `t2`, `t5` | smoke: planMigration dry run over this repo lists d9f85b3c's consolidation with no unmappable standalone entries | [[c6]] [[c8]] |

### 1.1 E20261011c00559b7:S001:T001 — Make readEpicDefinitionCore the single work-item head reader

In storage.ts: readArtifactCore also reads meta.tracker; EpicDefinitionCore gains headKind and tracker; readEpicDefinitionCore tries DEF, then ISSUE, then the lowest-ordinal LLD-<h>-<story>, reporting an LLD head with standalone: true and createdAt = epicCreatedAt ?? createdAt. All existing consumers (inheritedEpicSlug, inheritedStandalone, inheritedStoryStandalone, readEpicCreatedAt, buildRecordFolderArgs, validate resolveRouteFlag) then see LLD heads with no code change of their own.

**Acceptance checks:**
- DEF beats ISSUE beats LLD; a lone LLD (flagged or unflagged) heads its hash with headKind 'LLD' and standalone: true; lowest-ordinal LLD wins; malformed LLD -> {}.
- DEF/ISSUE heads keep their existing fields and now also carry tracker.
- A legacy unflagged LLD-only item's BUILD/TESTS placement resolves to docs/standalone.
- finalizePlan for an LLD-only standalone work item inherits the LLD's slug and writes PLAN.md into the LLD's folder.

### 1.2 E20261011c00559b7:S001:T002 — Route the tracker resolver through the shared head

In resolve.ts: readEpicIdentity maps readEpicDefinitionCore's result to {epicSlug, createdAt, tracker?}; listEpicHashes appends hashes that have an LLD and no DEF/ISSUE; resolveByLabel's unscoped tiering gains a last tier for LLD-headed hashes; readEpicDefinition stays DEF/ISSUE-only.

**Acceptance checks:**
- S001/t1 + epicHash, s1/t1 + epicHash and the hierarchical id resolve to a task for an LLD+PLAN-only work item.
- Unscoped s1/t1 over a mixed DEF + ISSUE + LLD-only fixture resolves exactly as before.
- insrc_build_step implement admits t1 of a standalone plan (was unresolved-target).
- workflowIdForIssue for a DEF epic with a tracker block is unchanged.

### 1.3 E20261011c00559b7:S001:T003 — Name head artifacts from a written title

Add optional title to SpecArtifactBody and DefineBody and ask for it in the brainstorm and define synthesizer prompts/schemas; finalizeBrainstorm, finalizeIssue and finalizeDefine label from body.title, and finalizeStandaloneLld (when no head exists yet) from params.storyTitle, each falling back to safeDeriveSlug(focus).

**Acceptance checks:**
- A SPEC/DEF/ISSUE with a title gets a folder slug derived from it.
- Absent or degenerate titles fall back to the focus-derived slug.
- Existing title-less artifacts keep their stored epicSlug.
- A first-time standalone LLD is labelled from storyTitle; a re-finalized one keeps the label its existing LLD head carries.

### 1.4 E20261011c00559b7:S001:T004 — Thread an approved specHash through triage

insrc_triage start input (types.ts, server.ts schema) gains optional specHash; phases/start.ts verifies it with requireApprovedSpec before creating state; state.ts encode/decode carries it; classify's buildNextCall forwards it into the design.story (and define) params.

**Acceptance checks:**
- Missing/unapproved spec -> start error, no state.
- State round-trips specHash.
- The design.story nextCall carries specHash; without one, the nextCall is unchanged.

### 1.5 E20261011c00559b7:S001:T005 — Teach the docs migrator about LLD-headed work items

In planMigration: label precedence DEF -> ISSUE -> LLD -> other members; a group with an LLD and no DEF/ISSUE is grouped as standalone even when no member is flagged.

**Acceptance checks:**
- An anchorless split item's PLAN/BUILD/CR/TESTS md are planned into the LLD's folder.
- An unflagged LLD-headed group plans into docs/standalone.
- Existing migrate-docs-tree tests pass.

### 1.6 E20261011c00559b7:S001:T006 — Consolidate this repo's split standalone folders

Run planMigration as a dry run over this repo, show the listed moves (including d9f85b3c's LLD + PLAN) to the user, and on approval run applyMigration (git mv, per-work-item commits).

**Acceptance checks:**
- The dry run lists d9f85b3c's PLAN moving next to its LLD and reports no unmappable standalone entries.
- After apply, each anchorless standalone item's docs sit in one folder and post-move link validation passes.

## 2. Test-strategy coverage

| LLD strategy item | Covered by |
| :--- | :--- |
| readEpicDefinitionCore: DEF wins over ISSUE and LLD; ISSUE wins over LLD; a lone LLD heads the work item (flagged and legacy unflagged); lowest-ordinal LLD wins among several; malformed LLD -> {}; headKind set accordingly | `t1` |
| readEpicIdentity delegates to the shared head and returns null for no head | `t2` |
| listEpicHashes: DEF then ISSUE order unchanged; LLD-only hashes appended once; a hash with both ISSUE and LLD listed once | `t2` |
| resolveWorkflowRef: 'S001/t1' + epicHash, 's1/t1' and the hierarchical id resolve to a task for an LLD+PLAN-only work item | `t2` |
| head naming: SPEC/DEF/ISSUE labelled from body.title, standalone LLD from params.storyTitle, fallback to focus when the title is absent or yields a too-short slug | `t3` |
| triage: start with an approved specHash forwards it into the design.story nextCall (and define for epic); missing/unapproved spec errors at start; no specHash -> nextCall unchanged | `t4` |
| planMigration: an anchorless item's PLAN/BUILD/CR/TESTS move into the LLD's folder; label precedence DEF -> ISSUE -> LLD -> others | `t5` |
| readEpicDefinitionCore: LLD head reports standalone: true even for an unflagged LLD; tracker block read for DEF/ISSUE heads | `t1` |
| triage state: encodeState/decodeState round-trip specHash; classify forwards it | `t4` |
| planMigration: a group with an LLD and no DEF/ISSUE is grouped as 'standalone' even when no member is flagged | `t5` |
| resolveByLabel unscoped over a mixed fixture (DEF epic with s1 + ISSUE bugfix + LLD-only item): 's1/t1' resolves exactly as before; with only LLD-only items, a single one resolves and two refuse | `t2` |
| insrc_build_step implement + validate admit task t1 of an approved standalone LLD+PLAN (previously unresolved-target) | `t2` |
| finalizePlan for a standalone feature writes PLAN.md into the anchor LLD's folder | `t1` |
| existing epic and bugfix resolution/folder tests (id-resolve, folder-identity-*, storage, migrate-docs-tree) pass unchanged | `t2` |
| validate: BUILD and TESTS records of a legacy unflagged LLD-only item are placed under docs/standalone (resolveRouteFlag) | `t1` |
| issue-number resolution (workflowIdForIssue) for a DEF epic with a tracker block is unchanged | `t2` |
| regression guard (passes before and after): a standalone design.story started with specHash stamps seededFromSpec and renders the 'Seeded from' line | `t3` |
| planMigration dry run over this repo lists consolidation moves for d9f85b3c (LLD + PLAN into one folder) and reports no unmappable entries for standalone items before apply | `t6` |

## 3. References

- **[[c1]]** `prior-artifact` `LLD S001 head reader: readEpicDefinitionCore DEF -> ISSUE -> lowest-ordinal LLD with headKind, tracker, standalone:true (storage.ts)`
- **[[c2]]** `prior-artifact` `LLD S001 resolver: readEpicIdentity delegation, listEpicHashes LLD-only append, resolveByLabel lowest unscoped tier (tracker/resolve.ts)`
- **[[c3]]** `prior-artifact` `LLD S001 consumer inventory: inheritedEpicSlug, inheritedStandalone, inheritedStoryStandalone, readEpicCreatedAt, buildRecordFolderArgs, validate resolveRouteFlag, completion-record, standalone-record, tracker-auto, tracker/link, delivery/graph`
- **[[c4]]** `prior-artifact` `LLD S001 naming: optional title on SpecArtifactBody/DefineBody; finalizers label from title, standalone LLD from storyTitle, fallback safeDeriveSlug(focus)`
- **[[c5]]** `prior-artifact` `LLD S001 triage specHash: types.ts, server.ts schema, phases/start.ts requireApprovedSpec, state.ts round-trip, classify buildNextCall forwarding`
- **[[c6]]** `prior-artifact` `LLD S001 migrator: planMigration label precedence DEF -> ISSUE -> LLD; LLD-headed group classified standalone (migrate-docs-tree.ts)`
- **[[c8]]** `prior-artifact` `LLD S001 migration steps: dry-run planMigration over this repo, show moves to the user, then applyMigration with per-work-item commits`
