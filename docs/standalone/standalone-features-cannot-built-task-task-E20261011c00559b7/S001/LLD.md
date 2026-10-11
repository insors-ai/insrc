<!-- insrc:artifact LLD-c00559b7e38bb6ce-S001 -->

# LLD: E20261011c00559b7:S001

## Summary

**Epic:** `standalone-features-cannot-built-task-task`
**HLD base run:** `wf-1791723579520-bhf5kd`
**HLD effective hash:** `56846a7ef468...`
**Seeded from:** `SPEC-34d7bb72df47a5e5`

A standalone feature's LLD becomes the identity anchor of its work item, the same role a DEF plays for an Epic and an ISSUE plays for a fix, so the build tool can admit its plan's tasks one at a time. One reader in storage.ts decides what heads a work item (DEF, then ISSUE, then the story's LLD), and both the task resolver and folder naming use it, so they can no longer disagree. Head artifacts are named from a short written title instead of the first words of their prompt, everything downstream inherits that name, triage carries the SPEC a feature came from, and the existing docs migrator gathers already-split folders into one.

## Contents

1. [HLD context](#1-hld-context)
2. [Contract details](#2-contract-details)
3. [Data model changes](#3-data-model-changes)
4. [Error paths](#4-error-paths)
5. [Test strategy](#5-test-strategy)
6. [Migration](#6-migration)
7. [Alternatives considered](#7-alternatives-considered)
8. [References](#8-references)
9. [Open questions](#9-open-questions)

## 1. HLD context

**Framework:** Standalone feature — no parent HLD. Design directly against the repo, grounded on the s1 analyze passes. There are no HLD shared contracts to honour.
**Rollout phase:** standalone

## 2. Contract details

**Surface level:** internal

### 2.1 `readEpicDefinitionCore`

```typescript
readEpicDefinitionCore(repoPath: string, epicHash: string): EpicDefinitionCore  // EpicDefinitionCore gains readonly headKind?: 'DEF' | 'ISSUE' | 'LLD' and readonly tracker?: TrackerBlock
```

**Parameters:**
- `repoPath: string` — Repo root holding .insrc/artifacts.
- `epicHash: string` — 16-hex work-item hash.

**Returns:** `EpicDefinitionCore` — The work item's head core (createdAt, epicSlug, standalone, tracker) from DEF-<h>, else ISSUE-<h>, else the lowest-ordinal LLD-<h>-<story> (any LLD, flagged standalone or not); headKind names which one answered; {} when none exists. An LLD head always reports standalone: true (a work item headed by an LLD has no DEF, so it is never an epic), and its createdAt is the LLD's epicCreatedAt when stamped, else its createdAt.

**Preconditions:**
- Artifacts are read through readArtifactCore; a malformed file reads as empty and the next candidate is tried.

**Postconditions:**
- DEF and ISSUE keep precedence over an LLD, so epic and bugfix work items resolve exactly as before.
- readArtifactCore additionally reads meta.tracker, so readEpicIdentity keeps the tracker block (issue refs) it returns today for DEF/ISSUE epics.
- An LLD head reports standalone: true even when the LLD itself carries no flag (legacy items), so every placement consumer files the item under docs/standalone.

### 2.2 `readEpicIdentity`

```typescript
readEpicIdentity(dir: string, epicHash: string): EpicIdentity | null
```

**Parameters:**
- `dir: string` — The .insrc/artifacts directory.
- `epicHash: string` — 16-hex work-item hash.

**Returns:** `EpicIdentity | null` — {epicSlug, createdAt, tracker?} taken from the same head readEpicDefinitionCore selects (DEF, ISSUE, then LLD); null only when no head exists or it lacks epicSlug/createdAt.

**Postconditions:**
- The DEF -> ISSUE -> LLD head order lives only in readEpicDefinitionCore; readEpicIdentity maps its result to {epicSlug, createdAt, tracker?} unchanged in shape.
- resolve.ts readEpicDefinition (:209) deliberately stays DEF/ISSUE-only: it reads story DECLARATIONS for storyEvidence's 'declared' tier, and an LLD head's story existence is already proven by the 'artifact' tier (storyEvidence, resolve.ts:281), so an LLD needs no declaration path.

### 2.3 `listEpicHashes`

```typescript
listEpicHashes(dir: string): readonly string[]
```

**Parameters:**
- `dir: string` — The .insrc/artifacts directory.

**Returns:** `readonly string[]` — DEF hashes, then ISSUE hashes, then hashes that have an LLD-<h>-<story> file and no DEF/ISSUE; each listed once, existing order unchanged.

**Postconditions:**
- resolveByHier and an epicHash-scoped resolveByLabel now reach LLD-anchored work items, so resolveTaskRef admits their plan tasks from both build phases.
- Unscoped resolveByLabel (resolve.ts:487-499) ranks LLD-headed hashes in a NEW lowest tier, consulted only when neither the explicit tier nor the implied tier yields a candidate. Whenever any DEF- or ISSUE-anchored work item evidences the label, the result is exactly today's (same winner, same ambiguity refusal); two LLD-headed candidates in that last tier refuse as ambiguous.

### 2.4 `inheritedEpicSlug`

```typescript
inheritedEpicSlug(repoPath: string, epicHash: string, fallback: string): string
```

**Parameters:**
- `repoPath: string` — Repo root.
- `epicHash: string` — Work-item hash.
- `fallback: string` — Label used only when the work item has no head with a slug.

**Returns:** `string` — The head's epicSlug (now including an LLD head), else fallback.

**Postconditions:**
- finalizePlan and the BUILD/CR/TESTS writers land in the anchor LLD's folder for a standalone feature.

### 2.5 `safeDeriveSlug`

```typescript
safeDeriveSlug(focus: string | undefined): string  // unchanged; head finalizers now pass a title first
```

**Parameters:**
- `focus: string | undefined` _(optional)_ — Text to derive a label from; head finalizers pass their title when present, else their focus.

**Returns:** `string` — A filename-safe label.

**Postconditions:**
- finalizeBrainstorm labels from body.title, finalizeIssue from body.title, finalizeDefine from body.title, finalizeStandaloneLld (when no head exists yet) from params.storyTitle; each falls back to its focus when the title is absent.

### 2.6 `planMigration`

```typescript
planMigration(repoPath: string): MigrationPlan
```

**Parameters:**
- `repoPath: string` — Repo root.

**Returns:** `MigrationPlan` — Pure dry-run plan of moves; for a work item with no DEF/ISSUE, the label and anchor now come from its LLD before any other member.

**Postconditions:**
- Label precedence is DEF -> ISSUE -> LLD -> other slug-carrying members -> flat filename -> hash.
- workItemKind for a group with no DEF and no ISSUE member but an LLD member is 'standalone' (today it is 'standalone' only when some member carries the flag, migrate-docs-tree.ts:359), so legacy unflagged items consolidate under docs/standalone.
- A dry run lists the consolidation moves for split standalone items without touching disk; applyMigration performs them.

## 3. Data model changes

### 3.1 `EpicDefinitionCore` — field-add

Adds optional headKind ('DEF' | 'ISSUE' | 'LLD') and tracker (the meta.tracker block, now read by readArtifactCore so readEpicIdentity can delegate without losing issue refs). An LLD head is reported with standalone: true and createdAt = epicCreatedAt ?? createdAt.

```
+ headKind?: 'DEF' | 'ISSUE' | 'LLD'
+ tracker?: TrackerBlock
```

**Call sites:**
- `src/workflow/storage.ts`
- `src/workflow/tracker/resolve.ts`

### 3.2 `SpecArtifactBody` — field-add

Adds optional title (short, outcome-phrased) written by the brainstorm synthesizer in the same pass; the synthesizer schema asks for it; finalizeBrainstorm labels the SPEC folder from it. Existing SPECs without a title keep their focus-derived label.

```
+ title?: string
```

**Call sites:**
- `src/workflow/artifacts/spec.ts`
- `src/workflow/orchestrator.ts`

### 3.3 `DefineBody` — field-add

Adds optional title written by the define synthesizer; finalizeDefine labels the Epic folder from it, falling back to focus.

```
+ title?: string
```

**Call sites:**
- `src/workflow/artifacts/define.ts`
- `src/workflow/orchestrator.ts`

### 3.4 `Triage start input` — field-add

insrc_triage start input gains optional specHash. phases/start.ts verifies it with requireApprovedSpec (existing, gates.ts:439; read-only use) before creating state; the TriageState type and state.ts encode/decode carry it (decodeState today rebuilds only runId/focus/repo, state.ts:32); classify's buildNextCall gains the specHash argument and forwards it into the design.story params (and the define params for an epic); the insrc_triage input schema registered in src/mcp/server.ts gains the optional field. No markdown change is needed: the LLD renderer already prints '**Seeded from:** SPEC-<hash>' when meta.seededFromSpec is set (src/workflow/artifacts/lld.ts:339-340), and finalizeStandaloneLld already stamps it (orchestrator.ts:2320, :2354); the gap is only that triage never passes specHash.

```
+ specHash?: string
```

**Call sites:**
- `src/mcp/triage-step/types.ts`
- `src/mcp/triage-step/state.ts`
- `src/mcp/triage-step/phases/start.ts`
- `src/mcp/triage-step/phases/classify.ts`
- `src/mcp/server.ts`

### 3.5 `readEpicDefinitionCore consumers (behaviour under an LLD head)` — invariant-change

Every consumer and its behaviour once an LLD can head a work item: inheritedEpicSlug (storage.ts:223) -> the LLD's slug, so PLAN/BUILD/CR/TESTS share its folder; inheritedStandalone (storage.ts:240) and inheritedStoryStandalone (storage.ts:262) -> true, because an LLD head reports standalone: true; readEpicCreatedAt (storage.ts:273) -> the LLD's epicCreatedAt ?? createdAt, the same anchor buildRecordFolderArgs already uses for a standalone BUILD (callers: orchestrator.ts:1355/1817/2174 are DEF-headed and unchanged; orchestrator.ts:2331/2601/2611, tracker-auto.ts:147/220, tracker/link.ts:37 now get the LLD anchor instead of 'now'); buildRecordFolderArgs (storage.ts:383-416) -> unchanged result for flagged standalone items, and legacy unflagged items now resolve to the same LLD-derived folder; validate.ts resolveRouteFlag (src/mcp/build-step/phases/validate.ts:292-294) -> noHead becomes false for an LLD-only item, but the head now reports standalone: true, so inheritedStoryStandalone still returns true and BUILD/TESTS stay under docs/standalone (the ISSUE-0855311b placement invariant); completion-record.ts:58 and standalone-record.ts:267 (inheritedStoryStandalone) -> true for LLD-headed items; delivery graph placement (src/workflow/delivery/graph.ts:276, follows inheritedStoryStandalone) -> legacy unflagged items now show as standalone.

**Call sites:**
- `src/workflow/storage.ts`
- `src/mcp/build-step/phases/validate.ts`
- `src/workflow/orchestrator.ts`
- `src/workflow/runners/build/completion-record.ts`
- `src/workflow/runners/build/standalone-record.ts`
- `src/workflow/tracker-auto.ts`
- `src/workflow/tracker/link.ts`
- `src/workflow/delivery/graph.ts`

### 3.6 `Unscoped label resolution tiers` — invariant-change

resolveByLabel's unscoped candidate tiers become explicit (DEF/ISSUE epics with an LLD/PLAN or a declared story) -> implied (ISSUE convention) -> LLD-headed (no DEF/ISSUE). The new tier is evaluated last, so a repo containing any DEF or ISSUE epic that evidences the label resolves exactly as today. Scoped (epicHash) and hierarchical resolution reach LLD-headed items directly.

**Call sites:**
- `src/workflow/tracker/resolve.ts`

## 4. Error paths

**Error cases**

- **insrc_triage is started with a specHash whose SPEC is missing or not approved.** (recoverable)
  - Detection: requireApprovedSpec throws SpecArtifactNotFoundError / SpecNotApprovedError at triage start.
  - Response: Triage start returns an error naming the spec and the reason; no state is created, so no nextCall can carry an unapproved spec.
  - User impact: The user approves the SPEC (or drops the specHash) and starts triage again.
- **An LLD-anchored work item's LLD JSON is malformed or lacks createdAt/epicSlug.** (recoverable)
  - Detection: readArtifactCore yields an empty core for the LLD, so readEpicDefinitionCore returns {} and readEpicIdentity returns null.
  - Response: The resolver treats the hash as unresolvable (same as today) and resolveTaskRef reports unresolved-target; slug inheritance uses its fallback.
  - User impact: Same failure as before the fix for that one item; others resolve.
- **A head finalizer's synthesized title is present but produces a too-short slug (e.g. all stopwords).** (recoverable)
  - Detection: deriveSlug throws on a slug shorter than MIN_LENGTH; safeDeriveSlug catches it.
  - Response: The finalizer falls back to its focus-derived label (safeDeriveSlug(focus)).
  - User impact: Folder named from focus, as today.
- **planMigration finds a label or destination collision while consolidating a split standalone item.** (recoverable)
  - Detection: The existing toSeen collision map and unmappable list in planMigration.
  - Response: The item is reported as unmappable with its reason and its files stay where they are; applyMigration refuses to run while unmappable entries exist, as today.
  - User impact: The dry run names the item to fix by hand.

**Edge cases**

| Input | Expected |
| :--- | :--- |
| A work item with both an ISSUE and an LLD (sized bugfix). | The ISSUE heads it (headKind 'ISSUE'); behaviour identical to today. |
| A standalone hash with LLDs for several stories (S001, S002). | The lowest-ordinal LLD heads the work item, so every story shares one label and anchor date. |
| A legacy LLD without meta.standalone and without DEF/ISSUE. | It heads its work item and is reported standalone: true; its plan tasks resolve; its BUILD/TESTS/CR are placed under docs/standalone; the migrator groups it as a standalone item. |
| A SPEC or DEF synthesized before this change (no title). | Its existing focus-derived epicSlug is kept; nothing is renamed. |
| A standalone design.story started by hand without storyTitle. | The LLD is labelled from its focus, as today; PLAN/BUILD/CR inherit that label. |
| A trivial or small standalone build (no PLAN). | Unchanged: still built through the standalone build route without task resolution. |
| Unscoped 's1/t1' in a repo holding a DEF epic with s1 artifacts, an ISSUE bugfix and a standalone LLD+PLAN. | Same result as today (the DEF epic's explicit evidence wins); the standalone item is only reachable unscoped when no DEF/ISSUE epic evidences s1, and is always reachable with its epicHash or hierarchical id. |

**Invariants to preserve**

- DEF then ISSUE keep precedence; every epic and bugfix work item resolves to the same reference and folder as before. [[c1]]
- listEpicHashes keeps its existing order (DEF hashes, then ISSUE hashes) and lists each hash once. [[c1]]
- inheritedEpicSlug returns the caller's fallback when no head slug exists; finalizeDesignEpic/finalizeDesignStory/finalizeDefineExtend keep inheriting from the DEF. [[c2]]
- planMigration stays pure (no disk writes) and applyMigration still refuses a plan with unmappable entries. [[c5]]
- The workflow-step start phase's spec seeding and the seededFromSpec stamp are reused unchanged. [[c4]]
- A standalone work item's BUILD and TESTS records are placed under docs/standalone (validate.ts resolveRouteFlag + inheritedStoryStandalone), including when its LLD carries no flag. [[c2]]
- readEpicIdentity keeps returning the tracker block for DEF/ISSUE epics, so issue-number resolution is unchanged. [[c1]]
- Unscoped label resolution returns today's winner, or today's ambiguity refusal, whenever a DEF- or ISSUE-anchored work item evidences the label. [[c1]]

## 5. Test strategy

**Test framework:** `node:test via tsx (npx tsx --test), assert/strict, matching src/workflow/__tests__ and src/mcp/*/__tests__`

**Test levels**

- **unit** — Head selection, resolver reach, naming and triage threading in isolation over temp .insrc/artifacts fixtures.
  - Subjects: `readEpicDefinitionCore: DEF wins over ISSUE and LLD; ISSUE wins over LLD; a lone LLD heads the work item (flagged and legacy unflagged); lowest-ordinal LLD wins among several; malformed LLD -> {}; headKind set accordingly`, `readEpicIdentity delegates to the shared head and returns null for no head`, `listEpicHashes: DEF then ISSUE order unchanged; LLD-only hashes appended once; a hash with both ISSUE and LLD listed once`, `resolveWorkflowRef: 'S001/t1' + epicHash, 's1/t1' and the hierarchical id resolve to a task for an LLD+PLAN-only work item`, `head naming: SPEC/DEF/ISSUE labelled from body.title, standalone LLD from params.storyTitle, fallback to focus when the title is absent or yields a too-short slug`, `triage: start with an approved specHash forwards it into the design.story nextCall (and define for epic); missing/unapproved spec errors at start; no specHash -> nextCall unchanged`, `planMigration: an anchorless item's PLAN/BUILD/CR/TESTS move into the LLD's folder; label precedence DEF -> ISSUE -> LLD -> others`, `readEpicDefinitionCore: LLD head reports standalone: true even for an unflagged LLD; tracker block read for DEF/ISSUE heads`, `triage state: encodeState/decodeState round-trip specHash; classify forwards it`, `planMigration: a group with an LLD and no DEF/ISSUE is grouped as 'standalone' even when no member is flagged`, `resolveByLabel unscoped over a mixed fixture (DEF epic with s1 + ISSUE bugfix + LLD-only item): 's1/t1' resolves exactly as before; with only LLD-only items, a single one resolves and two refuse`
  - Fixtures: `temp repo with .insrc/artifacts holding DEF/ISSUE/LLD/PLAN/SPEC JSON variants`, `a split standalone item (LLD and PLAN md in differently-named folders)`
- **integration** — The build step and finalizers behave end to end for a standalone feature.
  - Subjects: `insrc_build_step implement + validate admit task t1 of an approved standalone LLD+PLAN (previously unresolved-target)`, `finalizePlan for a standalone feature writes PLAN.md into the anchor LLD's folder`, `existing epic and bugfix resolution/folder tests (id-resolve, folder-identity-*, storage, migrate-docs-tree) pass unchanged`, `validate: BUILD and TESTS records of a legacy unflagged LLD-only item are placed under docs/standalone (resolveRouteFlag)`, `issue-number resolution (workflowIdForIssue) for a DEF epic with a tracker block is unchanged`, `regression guard (passes before and after): a standalone design.story started with specHash stamps seededFromSpec and renders the 'Seeded from' line`
- **smoke** — Real repo consolidation.
  - Subjects: `planMigration dry run over this repo lists consolidation moves for d9f85b3c (LLD + PLAN into one folder) and reports no unmappable entries for standalone items before apply`

**Acceptance mapping**

| Criterion | Proving tests |
| :--- | :--- |
| `ac1` | `resolveWorkflowRef resolves S001/t1, s1/t1 and the hierarchical id for an LLD+PLAN-only work item`, `insrc_build_step implement + validate admit t1 of a standalone plan` |
| `ac2` | `readEpicDefinitionCore precedence DEF -> ISSUE -> LLD with legacy unflagged LLD accepted`, `existing epic and bugfix suites pass unchanged`, `legacy unflagged LLD item's BUILD/TESTS placed under docs/standalone; DEF tracker refs preserved`, `unscoped s1/t1 over a mixed DEF + ISSUE + LLD-only fixture resolves exactly as before` |
| `ac3` | `triage start validates specHash (missing/unapproved -> error), state round-trips it, and classify forwards it into the design.story nextCall` |
| `ac4` | `head naming from title with focus fallback (SPEC, DEF, ISSUE, standalone LLD)`, `finalizePlan writes into the anchor LLD's folder` |
| `ac5` | `planMigration consolidates an anchorless split item into the LLD folder with DEF -> ISSUE -> LLD label precedence`, `dry run over this repo lists d9f85b3c's consolidation` |

## 6. Migration

**State before:** Per s1: the resolver (resolve.ts listEpicHashes/readEpicIdentity) and the slug inheritor (storage.ts readEpicDefinitionCore) each anchor a work item only on DEF or ISSUE, so standalone feature plans are unresolvable and their stages fall back to focus-derived labels; head finalizers label from the first words of focus; triage has no specHash input; planMigration labels an anchorless item from its first slug-carrying member by sorted id.

**State after:** One head reader (DEF -> ISSUE -> lowest-ordinal LLD) serves the resolver and slug inheritance; standalone plans build task by task; heads are labelled from a written title with focus fallback and downstream stages inherit; triage verifies and forwards an approved specHash; planMigration labels anchorless items from their LLD, and existing split standalone folders are consolidated.

**Zero downtime:** yes — **Data rewrite:** no

**Steps**

1. Make readEpicDefinitionCore the single head reader: add the LLD fallback, headKind and the tracker field (read by readArtifactCore), report an LLD head as standalone: true; have readEpicIdentity and listEpicHashes use it. Add the LLD-headed tier last in resolveByLabel's unscoped tiering. — ↩ rollbackable
2. Add optional title to SPEC and DEF bodies and their synthesizer schemas; label SPEC/DEF/ISSUE heads from their title and the standalone LLD from params.storyTitle, keeping the focus fallback. — ↩ rollbackable
3. Add optional specHash to the triage start input (types.ts, the server.ts schema), verify it in phases/start.ts with requireApprovedSpec, carry it through state.ts encode/decode, and forward it from classify into the design.story (and define) nextCall. The LLD's 'Seeded from' line already renders (artifacts/lld.ts:339); no change there. — ↩ rollbackable
4. In planMigration give the LLD label precedence after DEF and ISSUE, and group a work item with an LLD and no DEF/ISSUE as standalone. — ↩ rollbackable
5. Run planMigration as a dry run over this repo, review the listed consolidation moves for anchorless standalone items, then run applyMigration to move their md files into the anchor LLD's folder (git mv, one commit per work item). — ↩ rollbackable

**Backward compat:** All changes are additive or internal. DEF and ISSUE keep precedence, so epic and bugfix work items resolve and land exactly as before; existing SPEC/DEF artifacts without a title keep their stored epicSlug; triage callers that omit specHash get the same nextCall as today. The consolidation moves markdown only (the JSON store is untouched) and is reversible with git.

## 7. Alternatives considered

### 7.1 a1: One shared work-item head reader + title-first naming — **CHOSEN**

A single head reader in storage.ts (DEF -> ISSUE -> LLD) that both the tracker resolver and slug inheritance consume; heads are named from a title; triage forwards an approved specHash; the migrator's label precedence gains the LLD.

storage.ts gains one exported head reader that returns the work item's head {kind: 'DEF'|'ISSUE'|'LLD', epicSlug, anchorCreatedAt, tracker?, standalone?} by trying DEF-<h>, then ISSUE-<h>, then the lowest-ordinal LLD-<h>-<story> (any LLD, flagged or legacy). readEpicDefinitionCore and resolve.ts readEpicIdentity both delegate to it, and listEpicHashes additionally yields hashes that have an LLD but no DEF/ISSUE. Naming: a pure helper derives the label from a head title (deriveSlug(title)) and falls back to safeDeriveSlug(focus); SpecArtifactBody and DefineBody gain an optional `title` that their synthesizer schemas ask for; finalizeIssue uses its body.title; finalizeStandaloneLld uses params.storyTitle; PLAN/BUILD/TESTS/CR keep inheriting via inheritedEpicSlug, which now sees the LLD head. Triage start input gains optional specHash, verified with requireApprovedSpec, and classify forwards it into the design.story params. planMigration's label precedence becomes DEF -> ISSUE -> LLD -> other members.

### 7.2 a2: Patch each reader independently

Add an LLD branch separately to readEpicIdentity/listEpicHashes in resolve.ts and to readEpicDefinitionCore in storage.ts, with naming and triage changes as in a1.

Each existing reader keeps its own file list and gains its own 'then try LLD-<h>-*' step; listEpicHashes adds an LLD_RE pass. Naming, triage specHash and migrator precedence change as in a1.

**Rejected because:** Meets the SPEC but keeps the head order duplicated in three places.

### 7.3 a3: Stamp an explicit anchor flag on the LLD

finalizeStandaloneLld stamps meta.anchor=true; readers accept only flagged LLDs; a migration stamps legacy LLDs.

Readers look for an LLD whose meta carries an explicit anchor marker; existing standalone LLDs (and the 7 unflagged legacy ones) get the marker written by a one-off migration over .insrc/artifacts.

**Rejected because:** Violates the SPEC's any-LLD decision by rewriting approved artifacts.

## 8. References

- **[[c1]]** `code` `src/workflow/tracker/resolve.ts`
- **[[c2]]** `code` `src/workflow/storage.ts`
- **[[c3]]** `code` `src/workflow/orchestrator.ts`
- **[[c4]]** `code` `src/mcp/workflow-step/phases/start.ts`
- **[[c5]]** `code` `src/workflow/migrate-docs-tree.ts`
- **[[c6]]** `prior-artifact` `SPEC-34d7bb72df47a5e5`
- **[[c7]]** `prior-artifact` `ISSUE-c00559b7e38bb6ce`
- **[[c8]]** `code` `src/mcp/triage-step/phases/classify.ts`

## 9. Open questions

- ts1 (partial): no Epic acceptance criteria exist for this standalone bugfix; ac1-ac5 are LLD-local and trace to SPEC-34d7bb72 decisions 1-5.

## Resolved questions

- `qa1e298b8` — ts1 (partial): no Epic acceptance criteria exist for this standalone bugfix; ac1-ac5 are LLD-local and trace to SPEC-34d7bb72 decisions 1-5.
  - **resolved**: Accept SPEC trace as sufficient — Standalone bugfix: the approved SPEC-34d7bb72 is the source of truth; ac1-ac5 trace to its decisions 1-5. Consistent with the companion-template plan's resolution. _(2026-10-11T13:11:31.530Z)_

## Citations

- **[[c1]]** `code` `src/workflow/tracker/resolve.ts`
- **[[c2]]** `code` `src/workflow/storage.ts`
- **[[c3]]** `code` `src/workflow/orchestrator.ts`
- **[[c4]]** `code` `src/mcp/workflow-step/phases/start.ts`
- **[[c5]]** `code` `src/workflow/migrate-docs-tree.ts`
- **[[c6]]** `prior-artifact` `SPEC-34d7bb72df47a5e5`
- **[[c7]]** `prior-artifact` `ISSUE-c00559b7e38bb6ce`
- **[[c8]]** `code` `src/mcp/triage-step/phases/classify.ts`
