<!-- insrc:artifact LLD-7d42920dbef28b51-s1 -->

# LLD: E202610117d42920d:S001

## Summary

**Epic:** `docs-migrator-leaves-stale-labels-json`
**HLD base run:** `wf-1791738764728-helvp1`
**HLD effective hash:** `631e7cacc5fc...`

The docs migration already decides one label, one date anchor and one top-level folder for each work item and moves every document there, but it leaves each artifact's stored label and anchor as they were. This Story makes the migration plan also list, for every artifact whose stored label, anchor or standalone flag disagrees with its work item, exactly which metadata fields change and which label lines in its markdown change. The dry run shows them; applying the plan writes them in the same per-work-item commit as the moves, under the same all-or-nothing rollback, and touches nothing else in the artifact.

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

**Framework:** Standalone feature — no parent HLD. Design directly against the repo, grounded on the s1 analyze passes. There are no HLD shared contracts to honour.
**Rollout phase:** standalone

## 2. Contract details

**Surface level:** internal

### 2.1 `planMigration`

```typescript
planMigration(repoPath: string): MigrationPlan  // MigrationPlan gains readonly metaRewrites: readonly MetaRewrite[]
```

**Parameters:**
- `repoPath: string` — Repo root holding .insrc/artifacts and docs/.

**Returns:** `MigrationPlan` — The existing moves, linkRewrites and unmappable, plus metaRewrites: one entry per member of a resolved group whose stored epicSlug, anchor (epicCreatedAt ?? createdAt) or standalone flag disagrees with the group's label, anchor or kind, in the same group order as moves.

**Preconditions:**
- Unchanged: reads only .insrc/artifacts JSON and docs/ md.

**Postconditions:**
- Pure: no disk write, no git call (unchanged).
- epicSlug is rewritten only when the group's label came from a real slug source (DEF, ISSUE, head LLD, another member, or a flat filename), never to the hash fallback, because an absent label already derives the same folder.
- epicCreatedAt is set to the group anchor only when the member's own anchor (epicCreatedAt ?? createdAt) derives a DIFFERENT folder segment, i.e. deriveWorkItemIdentity(hash, memberAnchor).epicSegment !== deriveWorkItemIdentity(hash, groupAnchor).epicSegment (the folder key uses only the date, id.ts:213). A same-day ledger record (BUILD/CR/TESTS created hours after its LLD, with no stamp) already resolves to the right folder and gets no rewrite.
- standalone: true is added when the group is standalone and the member's RAW stored meta.standalone (the parsed JSON value, which deriveMdPath reads) is not true; false is never written. The comparison must not use the in-memory Artifact.standalone, which planMigration forces true for SPEC (migrate-docs-tree.ts:345), so a SPEC with no stored flag in a standalone group is rewritten too.
- A member that is unmappable or whose group has no anchor gets no rewrite.
- mdEdits are planned for every member whose rendered md prints the label and whose epicSlug changes, as exact old-line -> new-line replacements against the md's post-move path: PLAN and LLD '**Epic:** `<slug>`' (plan.ts:121, lld.ts:336); EXT '# Extend: <slug> — ...' and '> **Extends Epic `<slug>`**' (extend.ts:59-61); DEF '# Epic: <short name>' and HLD '# HLD: <short name>', where the old and new short names follow the renderers' own rule (epicShortName / hldShortName: the slug when set, else the first sentence of body.problem / first line of body.frameworkSummary), so the planner reuses those helpers (exported) rather than re-deriving them.
- Companion HTML pages (er-model / sequence-diagram / component-dependency / ux-mock) are NOT edited: their header context line ('Epic <slug ?? hash>', companion/header.ts:165-168) is a rendered snapshot regenerated on the next finalize, and editing escaped HTML is out of this metadata-only fix. The dry run lists each such page of a relabelled member as a note so the user sees it.
- A plan for a repo already consistent has metaRewrites: [] (idempotent).

### 2.2 `applyMigration`

```typescript
applyMigration(repoPath: string, plan: MigrationPlan): void
```

**Parameters:**
- `repoPath: string` — Repo root (a clean git work tree).
- `plan: MigrationPlan` — The plan from planMigration, including metaRewrites.

**Returns:** `void` — Moves, link rewrites and metadata rewrites applied and committed per work item.

**Errors:**
- `Error` when Unchanged refusals: unmappable entries, or a dirty work tree.
- `Error` when A metadata rewrite's JSON cannot be read or parsed, or an md label line is not found exactly once; the whole run is rolled back to the start commit.

**Preconditions:**
- Unchanged: a clean work tree.

**Postconditions:**
- Runs when moves OR metaRewrites is non-empty (no early return on zero moves when rewrites exist).
- Each rewrite sets only the listed meta fields on the parsed JSON and re-writes it with the artifact store's formatting (2-space indent, trailing newline); body, citations, approvedAt and every other meta field are preserved.
- Each md edit replaces exactly the planned label line in the md at its post-move path.
- A group's moves, link rewrites in its files, JSON rewrites and md edits are committed together in that group's chunk; a group with rewrites and no moves gets its own chunk ('chore(docs): realign <hash> artifact labels ...').
- Any failure resets --hard to the pinned start commit, undoing moves, rewrites and earlier chunks alike (unchanged rule, now covering rewrites).

## 3. Data model changes

### 3.1 `MetaRewrite` — new

One planned metadata realignment: { artifactId, jsonPath, groupHash, set: { epicSlug?: string; epicCreatedAt?: string; standalone?: true }, mdEdits: readonly { file: string; from: string; to: string }[], companionNotes: readonly string[] }. `set` lists only the fields that change; `mdEdits` are exact whole-line replacements in the md at its post-move path; `companionNotes` lists companion pages of the member whose header still shows the old label (not edited).

```
+ interface MetaRewrite { artifactId; jsonPath; groupHash; set; mdEdits; companionNotes }
```

**Call sites:**
- `src/workflow/migrate-docs-tree.ts`
- `src/bin/insrc-migrate-docs.ts`

### 3.2 `MigrationPlan` — field-add

Adds readonly metaRewrites: readonly MetaRewrite[]. The CLI prints one line per rewrite (artifact id, changed fields, md edits) in the dry run.

```
+ readonly metaRewrites: readonly MetaRewrite[]
```

**Call sites:**
- `src/workflow/migrate-docs-tree.ts`
- `src/bin/insrc-migrate-docs.ts`

### 3.3 `.insrc/artifacts JSON store (migration invariant)` — invariant-change

The migrator no longer promises to leave the JSON store byte-identical. It may change exactly meta.epicSlug, meta.epicCreatedAt and meta.standalone (to true) of members whose stored values disagree with their work item, and nothing else. A consistent member's JSON stays byte-identical.

**Call sites:**
- `src/workflow/migrate-docs-tree.ts`
- `src/workflow/__tests__/migrate-docs-tree.test.ts`

## 4. Error paths

**Error cases**

- **A planned label line is not in the md at apply time because the md was edited and COMMITTED between plan and apply (an uncommitted edit is already refused by the clean-tree check at migrate-docs-tree.ts:668-670 before any rewrite runs), or the md renders the label differently.** (recoverable)
  - Detection: The md edit counts exact whole-line matches of the planned `from` line in the file and finds zero or more than one.
  - Response: Throw an Error naming the file and the expected line; the existing catch resets --hard to the pinned start commit.
  - User impact: Nothing is half-applied; the user re-runs the dry run (which re-plans from the current files) and applies again.
- **An artifact JSON listed for a rewrite is unreadable or not valid JSON at apply time (a corruption committed after planning; an uncommitted one hits the clean-tree refusal first).** (recoverable)
  - Detection: JSON.parse of the file throws inside the rewrite step.
  - Response: Throw an Error naming the artifact; the run is rolled back to the start commit.
  - User impact: The work tree is restored; the user fixes or removes the corrupt artifact and re-runs.
- **A rewrite would set epicCreatedAt to an anchor that is not a parseable date.** (recoverable)
  - Detection: planMigration only plans a group whose anchor resolved; deriveWorkItemIdentity on that anchor already failed into `unmappable` for such groups.
  - Response: No rewrite is planned for an unmappable group's members (and apply refuses plans with unmappable entries, as today).
  - User impact: The dry run names the item to fix by hand.

**Edge cases**

| Input | Expected |
| :--- | :--- |
| A member already placed in its group folder (no move) whose stored epicSlug is stale, like PLAN-d9f85b3c before commit 14e9496c. | A metaRewrite is planned and applied even though the member has no move; its md label line is edited in place. |
| A group whose label falls back to the hash (no slug source anywhere). | No epicSlug rewrite; anchor and standalone rewrites still apply where they disagree. |
| The head itself (DEF, ISSUE or head LLD) whose stored values define the group. | Its label and anchor already match, so it gets no rewrite unless its standalone flag is missing in a standalone group (a legacy unflagged head LLD), in which case only standalone: true is set. |
| A member whose effective anchor (epicCreatedAt ?? createdAt) is a different timestamp on the SAME day as the group anchor (e.g. a BUILD/CR/TESTS record with no epicCreatedAt, created hours after its LLD). | No anchor rewrite: anchors are compared by the derived folder segment (date + hash8), not the raw ISO string. |
| A member with no epicCreatedAt whose createdAt falls on a LATER day than the group anchor (e.g. a BUILD made the next day). | epicCreatedAt is set to the group anchor, so deriveMdPath resolves the group folder. |
| A BUILD, CR, TESTS, SPEC or ISSUE member whose epicSlug changes. | Only its JSON is rewritten; those renderers do not print the label, so no md edit is planned. |
| A DEF or HLD member whose epicSlug changes (e.g. a slug-less DEF whose group label came from another member). | Its JSON is rewritten and its H1 line is replaced: '# Epic: <old short name>' -> '# Epic: <new slug>' (DEF), '# HLD: <old short name>' -> '# HLD: <new slug>' (HLD). |
| A relabelled HLD or epic LLD that has companion HTML pages. | The pages are left unchanged (their 'Epic <slug>' header is regenerated on the next finalize); the dry run lists them as notes. |
| A repo where every member already matches its group (e.g. after a successful run). | metaRewrites is empty; a second apply is a no-op. |
| A plan with rewrites but no moves. | applyMigration still runs, commits one 'realign' chunk per affected group, and pruning/link validation behave as for an empty move set. |

**Invariants to preserve**

- planMigration stays pure: it reads JSON and md only, writes nothing and calls no git. [[c1]]
- applyMigration is all-or-nothing: any failure resets --hard to the pinned pre-run commit, so no partial mix of moves, link rewrites or metadata rewrites survives. [[c1]]
- Only meta.epicSlug, meta.epicCreatedAt and meta.standalone (to true) may change in an artifact JSON; body, citations, approvedAt, review stamps and every other field are preserved, and a member that already matches its group stays byte-identical. [[c6]]
- After the run, deriveMdPath on each member's stored meta yields the path its md actually occupies. [[c3]]
- applyMigration still refuses a plan with unmappable entries or a dirty work tree. [[c1]]
- The CLI dry run lists every change apply will make, now including metadata rewrites. [[c2]]
- The standalone comparison reads the raw stored meta.standalone, the same value deriveMdPath reads, never the planner's in-memory SPEC override. [[c3]]

## 5. Test strategy

**Test framework:** `node:test via tsx (npx tsx --test), assert/strict, temp git repos seeded with seedJson/seedMd as in src/workflow/__tests__/migrate-docs-tree.test.ts`

**Test levels**

- **unit** — planMigration plans exactly the metadata rewrites the fix needs, and nothing else, while staying pure.
  - Subjects: `planMigration: a moved PLAN whose stored epicSlug and anchor differ from its LLD head gets one metaRewrite setting both, plus the '**Epic:**' md edit at its post-move path`, `planMigration: an already-placed member with stale metadata (no move) still gets a metaRewrite`, `planMigration: a hash-fallback group gets no epicSlug rewrite; anchor/standalone rewrites still planned`, `planMigration: a legacy unflagged head LLD in a standalone group gets only standalone: true; false is never planned`, `planMigration: a SPEC with no stored standalone flag in a standalone group gets standalone: true (raw meta compared, not the in-memory SPEC override), and after apply its deriveMdPath resolves under docs/standalone`, `planMigration: anchors compared by derived folder segment: a same-day unstamped BUILD plans no rewrite; a later-day unstamped BUILD plans epicCreatedAt = group anchor`, `planMigration: BUILD/CR/TESTS members get JSON-only rewrites (no md edit); EXT gets its two title-line edits; DEF and HLD get their H1 edit (slug-less DEF: first-sentence H1 -> slug H1)`, `planMigration: a relabelled HLD with a companion page plans no edit to the page and lists it as a note`, `planMigration: a consistent repo plans metaRewrites: [] and stays read-only (docs and .insrc byte-identical after planning)`
  - Fixtures: `temp git repo with an LLD-headed split item (LLD + PLAN/BUILD in a second folder)`, `hash-only group`, `EXT fixture with its title lines`, `DEF and HLD fixtures (with and without a stored slug), one with a companion page`
- **integration** — applyMigration writes the planned rewrites inside the per-work-item commit and the all-or-nothing rollback, and the result is consistent.
  - Subjects: `applyMigration: after apply, deriveMdPath on every member's stored meta equals where its md sits, and the PLAN.md header shows the head label`, `applyMigration: only the planned meta fields change; body, citations, approvedAt and other meta fields are byte-equal; a consistent member's JSON is byte-identical`, `applyMigration: a group's moves, JSON rewrites and md edits land in one commit; a rewrite-only group gets its own 'realign' commit`, `applyMigration: a plan with rewrites but no moves still applies (no early return)`, `applyMigration: with two groups, where the second group's md label line was removed (resp. its JSON corrupted) and COMMITTED after planMigration, apply throws the rewrite-step error (asserted by message, not the dirty-tree refusal) after the first group's chunk was committed, and HEAD plus the work tree equal the start commit afterwards`, `applyMigration: a second plan after apply has no moves and no metaRewrites (idempotent)`, `CLI insrc-migrate-docs dry run prints one line per metadata rewrite`
  - Fixtures: `temp git repos per scenario, as in the existing migrate-docs-tree tests`, `a two-group repo where the fixture commits the md edit / JSON corruption between planMigration and applyMigration`

**Acceptance mapping**

| Criterion | Proving tests |
| :--- | :--- |
| `ac1` | `applyMigration: after apply, deriveMdPath on every member's stored meta equals where its md sits, and the PLAN.md header shows the head label`, `planMigration: an already-placed member with stale metadata (no move) still gets a metaRewrite` |
| `ac2` | `planMigration: a consistent repo plans metaRewrites: [] and stays read-only (docs and .insrc byte-identical after planning)`, `CLI insrc-migrate-docs dry run prints one line per metadata rewrite` |
| `ac3` | `applyMigration: with two groups, where the second group's md label line was removed (resp. its JSON corrupted) and COMMITTED after planMigration, apply throws the rewrite-step error (asserted by message, not the dirty-tree refusal) after the first group's chunk was committed, and HEAD plus the work tree equal the start commit afterwards`, `applyMigration: a group's moves, JSON rewrites and md edits land in one commit; a rewrite-only group gets its own 'realign' commit` |
| `ac4` | `applyMigration: only the planned meta fields change; body, citations, approvedAt and other meta fields are byte-equal; a consistent member's JSON is byte-identical` |

## 6. Migration

**State before:** planMigration resolves one label, anchor and kind per work item and uses them only for md destinations; applyMigration moves md, rewrites links and commits per group, leaving .insrc/artifacts JSON byte-identical and the md label lines untouched, and returns early when there are no moves (c1). Metadata-derived paths (deriveMdPath, c3) therefore point at old folders for relabelled members, which had to be fixed by hand in 14e9496c (c6).

**State after:** MigrationPlan also carries metaRewrites; the dry run lists them (c2); applyMigration applies them with the moves, per group, under the same rollback, so every member's stored epicSlug, anchor and standalone flag match its folder and the PLAN/LLD/EXT label lines show the work item's label.

**Zero downtime:** yes — **Data rewrite:** no

**Steps**

1. Add the MetaRewrite type (with an optional companion-page notes list) and the metaRewrites field to MigrationPlan; export epicShortName / hldShortName; planMigration computes rewrites and md edits (PLAN, LLD, EXT, DEF, HLD) from the already-resolved group label, anchor and kind (pure, additive). — ↩ rollbackable
2. Teach applyMigration to apply metaRewrites (meta field patch + exact md label-line edits), to include their files in each group's chunk commit, to give rewrite-only groups their own commit, and to run when moves is empty but rewrites exist. — ↩ rollbackable
3. Print metaRewrites in the insrc-migrate-docs dry run. — ↩ rollbackable
4. Invert the '.insrc/artifacts byte-identical' test for stale members; add plan, apply, idempotence and rollback tests for rewrites. — ↩ rollbackable
5. Dry-run the migrator over this repo and show the user the planned moves and rewrites before any apply. Expected: no moves, and no anchor rewrites for same-day ledger records; any rewrites listed are real disagreements (e.g. a later-day BUILD/CR or an unflagged SPEC) and are reviewed with the user before apply. — ↩ rollbackable

**Backward compat:** MigrationPlan gains a field; its only consumer (src/bin/insrc-migrate-docs.ts) is updated in the same change. Plans with no stale members behave exactly as before. Artifacts written by the migration stay readable by every reader, since only values that readers already accept change.

## 7. Alternatives considered

### 7.1 a1: Planned metadata rewrites in MigrationPlan — **CHOSEN**

planMigration also returns metaRewrites (per-artifact field changes + md label-line edits); applyMigration writes them inside the same per-group commit and rollback.

MigrationPlan gains `metaRewrites: readonly MetaRewrite[]`, one per member whose stored epicSlug, anchor (epicCreatedAt ?? createdAt) or standalone flag disagrees with its group's resolved label, anchor and kind. Each carries the JSON path, the exact field changes and the md label-line edits (PLAN/LLD '**Epic:**' line, EXT title lines). The dry run lists them; applyMigration applies them (JSON meta patch + md line edit), stages them and commits them in the same per-group chunk as that group's moves; groups with rewrites but no moves get their own chunk; the existing reset --hard rollback covers them.

### 7.2 a2: Rewrite metadata during apply only

applyMigration recomputes group labels and patches JSON as it moves files; the plan is unchanged.

Leave MigrationPlan as is. Inside applyMigration, after each group's moves, re-read the group's JSON and patch any member whose stored label/anchor/kind disagrees with the destination folder, then commit with the moves.

**Rejected because:** Breaks the preview contract and misses already-placed stale members.

### 7.3 a3: Full markdown re-render after metadata patch

As a1, but re-render each touched md from its patched JSON with the per-kind renderer instead of editing label lines.

Same plan entries as a1, but applyMigration re-renders the whole md for every patched artifact through a kind-to-renderer dispatcher (renderPlanMarkdown, renderLldMarkdown, ...).

**Rejected because:** Correct metadata but violates the metadata-only clause and needs a new ten-kind dispatcher.

## 8. References

- **[[c1]]** `code` `src/workflow/migrate-docs-tree.ts planMigration (:315) / applyMigration (:657) / MigrationPlan (:86)`
- **[[c2]]** `code` `src/bin/insrc-migrate-docs.ts:25-41 (dry-run print + apply)`
- **[[c3]]** `code` `src/workflow/pending.ts:188 deriveMdPath; src/workflow/delivery/markdown.ts:101`
- **[[c4]]** `code` `src/workflow/artifacts/plan.ts:121, lld.ts:336, extend.ts:59-61, define.ts:110/163 epicShortName, hld.ts:150/236 hldShortName (label lines); companion/header.ts:165-168`
- **[[c5]]** `code` `src/workflow/__tests__/migrate-docs-tree.test.ts`
- **[[c6]]** `prior-artifact` `commit 14e9496c (hand realignment of PLAN-d9f85b3c / PLAN-f2f08ccf metadata)`
- **[[c7]]** `prior-artifact` `ISSUE-7d42920dbef28b51 (approved) fix intent: ac1 folder agreement, ac2 dry-run purity, ac3 rollback, ac4 metadata-only`

<!-- insrc:review -->

## Review

### ✅ Review `PASS` — design.story (design.story)

**0 do not hold · 0 could not be verified · 8 hold** · template `design-issue` · model `cli-claude:opus` · reviewed 2026-10-11T17:23:28.574Z

Only a premise that does not hold blocks approval. One that could not be verified is listed for the reader and does not block.

#### Does not hold (blocks approval)

_None._

#### Could not verify (does not block)

_None._
