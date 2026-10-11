<!-- insrc:artifact PLAN-7d42920dbef28b51-S001 -->

# Plan: E202610117d42920d:S001

## Summary

**Epic:** `docs-migrator-leaves-stale-labels-json`
**LLD run:** `wf-1791738764728-helvp1`
**LLD effective hash:** `631e7cacc5fc...`

Building this fix teaches the docs migrator to correct each artifact's stored label, date anchor and standalone flag along with moving its markdown. The planner gains a list of exact metadata rewrites and label-line edits that the dry run prints, and the apply step writes them inside the existing per-work-item commits and all-or-nothing rollback. The work closes with a dry run over this repo shown to the user before anything is applied.

## Contents

1. [Tasks](#1-tasks)
2. [Test-strategy coverage](#2-test-strategy-coverage)
3. [References](#3-references)

## 1. Tasks

| # | Task | Size | Depends on | Tests | Derived from |
| :--- | :--- | :--- | :--- | :--- | :--- |
| 1 | **`t1`** MetaRewrite type, metaRewrites field and exported short-name helpers | S | — | unit: t1: MigrationPlan from planMigration carries metaRewrites (empty for a repo with no artifacts); unit: t1: epicShortName / hldShortName exported: slug when set, else first sentence / first line | [[c1]] [[c3]] |
| 2 | **`t2`** planMigration computes per-member field rewrites | M | `t1` | unit: planMigration: a moved PLAN whose stored epicSlug and anchor differ from its LLD head gets one metaRewrite setting both; unit: planMigration: an already-placed member with stale metadata (no move) still gets a metaRewrite; unit: planMigration: a hash-fallback group gets no epicSlug rewrite; anchor/standalone rewrites still planned; unit: planMigration: a legacy unflagged head LLD in a standalone group gets only standalone: true; false is never planned; unit: planMigration: a SPEC with no stored standalone flag in a standalone group gets standalone: true; unit: planMigration: a same-day unstamped BUILD plans no anchor rewrite; a later-day unstamped BUILD plans epicCreatedAt = group anchor; unit: planMigration: a consistent repo plans metaRewrites: [] and docs + .insrc stay byte-identical after planning | [[c1]] [[c3]] [[c4]] |
| 3 | **`t3`** planMigration plans md label-line edits and companion notes | M | `t2` | unit: planMigration: PLAN/LLD get the '**Epic:**' md edit at the post-move path (including an old '`undefined`' line); unit: planMigration: BUILD/CR/TESTS get JSON-only rewrites; EXT gets its two title-line edits; DEF and HLD get their H1 edit (slug-less DEF first-sentence H1 -> slug H1); unit: planMigration: a relabelled HLD with a companion page plans no edit to the page and lists it in companionNotes | [[c1]] [[c3]] |
| 4 | **`t4`** applyMigration applies metaRewrites inside the per-group commits and rollback | M | `t3` | integration: applyMigration: after apply, deriveMdPath on every member's stored meta equals where its md sits, and PLAN.md shows the head label; integration: applyMigration: only the planned meta fields change; a consistent member JSON is byte-identical; integration: applyMigration: a group's moves, JSON rewrites and md edits land in one commit; a rewrite-only group gets its own realign commit; integration: applyMigration: a rewrite-only plan still applies (no early return); integration: applyMigration: a committed missing label line / corrupt JSON rolls the whole two-group run back to the start commit with the rewrite-step error; integration: applyMigration: a second plan after apply has no moves and no metaRewrites; integration: applyMigration: a SPEC realigned to standalone resolves under docs/standalone via deriveMdPath | [[c2]] [[c4]] [[c5]] |
| 5 | **`t5`** CLI prints metadata rewrites | S | `t2` | integration: CLI insrc-migrate-docs dry run prints one line per metadata rewrite, its md edits and companion notes, and mutates nothing | [[c2]] [[c5]] |
| 6 | **`t6`** Dry-run the migrator over this repo and review with the user | S | `t4`, `t5` | smoke: t6: dry run of insrc-migrate-docs over this repo shown to the user before any apply | [[c6]] |

### 1.1 E202610117d42920d:S001:T001 — MetaRewrite type, metaRewrites field and exported short-name helpers

Add the exported MetaRewrite interface ({ artifactId, jsonPath, groupHash, set: { epicSlug?, epicCreatedAt?, standalone?: true }, mdEdits: { file, from, to }[], companionNotes: string[] }) and `readonly metaRewrites: readonly MetaRewrite[]` on MigrationPlan in src/workflow/migrate-docs-tree.ts; every return site of planMigration returns metaRewrites (empty for now). Export epicShortName (define.ts) and hldShortName (hld.ts) unchanged in behaviour so the planner can rebuild DEF/HLD H1 lines with the renderers' own rule.

**Acceptance checks:**
- tsc passes; MigrationPlan carries metaRewrites at every planMigration return
- epicShortName and hldShortName are exported and the DEF/HLD renderers' output is unchanged (existing define/hld tests pass)

### 1.2 E202610117d42920d:S001:T002 — planMigration computes per-member field rewrites

Inside the group member loop, compare each mappable member of an anchored group against the group: epicSlug set to the label only when the label came from a real slug source (slug !== undefined) and differs from the stored slug; epicCreatedAt set to the group anchor only when deriveWorkItemIdentity(hash, memberAnchor).epicSegment differs from the group's (memberAnchor = epicCreatedAt ?? createdAt; an unparsable or missing member anchor counts as different); standalone: true when the group is standalone and the RAW stored meta.standalone is not true (readMeta surfaces the raw flag separately from the SPEC-forced Artifact.standalone). Members that are unmappable get no rewrite. Emits one MetaRewrite per member with a non-empty `set`, in group order, including already-placed (non-moving) members.

**Acceptance checks:**
- A moved PLAN whose stored slug and day-anchor differ from its LLD head gets set { epicSlug, epicCreatedAt }
- An already-placed stale member gets a rewrite with no move
- Hash-fallback groups plan no epicSlug rewrite
- Same-day unstamped BUILD plans no anchor rewrite; later-day plans one
- Unflagged SPEC and legacy head LLD in a standalone group get only standalone: true; false is never planned
- A consistent repo plans metaRewrites: [] and planning writes nothing

### 1.3 E202610117d42920d:S001:T003 — planMigration plans md label-line edits and companion notes

For members whose epicSlug is rewritten, plan exact whole-line edits against the md's post-move path (the move's `to`, else its current mdPath), building each old line exactly as the renderer did from the stored meta: PLAN/LLD '**Epic:** `${String(oldSlug)}`' (the literal 'undefined' when no slug was stored) -> new; EXT '# Extend: <old> — <title>' and '> **Extends Epic `<old>`** — ...' -> new; DEF '# Epic: <epicShortName(old)>' and HLD '# HLD: <hldShortName(old)>' -> new, computed by calling the exported helpers on the parsed artifact with old vs new meta. No md edit for BUILD/CR/TESTS/SPEC/ISSUE. For relabelled members carrying body.companions, list each companion relPath in companionNotes (pages are not edited).

**Acceptance checks:**
- PLAN/LLD get the '**Epic:**' edit at the post-move path, including a member whose old line reads '**Epic:** `undefined`'
- EXT gets both title-line edits; DEF and HLD get the H1 edit, including a slug-less DEF whose old H1 is its first sentence
- BUILD/CR/TESTS rewrites carry no mdEdits
- A relabelled HLD with a companion lists it in companionNotes and plans no edit to the page

### 1.4 E202610117d42920d:S001:T004 — applyMigration applies metaRewrites inside the per-group commits and rollback

Change the zero-moves early return to require no moves AND no metaRewrites. After link rewrites, for each MetaRewrite: JSON.parse the artifact (error names the artifact), set only the listed meta fields, write back as JSON.stringify(..., null, 2) + '\n', git add; for each md edit, count exact whole-line matches of `from` in the file (error naming file + line when not exactly one), replace, git add. Commit per group with the moves' paths plus the group's JSON and md paths; groups with only rewrites get a 'chore(docs): realign <hash> artifact labels' commit. With zero moves the vacated set is empty and link validation still runs. All inside the existing try so failures reset --hard to startSha. Narrow the existing '.insrc/artifacts byte-identical after apply' test assertion to consistent members, since stale members are now expected to change.

**Acceptance checks:**
- After apply, deriveMdPath on every member's stored meta equals its md location and PLAN.md shows the head label
- Only the planned meta fields change; consistent members stay byte-identical (existing byte-identical assertion narrowed accordingly and passing)
- A group's moves and rewrites land in one commit; a rewrite-only group gets its own realign commit
- A rewrite-only plan applies (no early return; prune is a no-op and link validation passes)
- A committed missing label line or corrupt JSON throws the rewrite-step error after an earlier chunk committed, and HEAD + work tree equal the start commit
- Re-planning after apply yields no moves and no metaRewrites

### 1.5 E202610117d42920d:S001:T005 — CLI prints metadata rewrites

src/bin/insrc-migrate-docs.ts: include the rewrite count in the summary line and print one 'meta' line per MetaRewrite (artifact id and changed fields), an indented line per md edit, and a 'note' line per companion page; the Applied line mentions rewrites.

**Acceptance checks:**
- The dry run prints one line per metadata rewrite with its fields, its md edits and companion notes
- Dry run mutates nothing

### 1.6 E202610117d42920d:S001:T006 — Dry-run the migrator over this repo and review with the user

Run insrc-migrate-docs (dry run) over this repo and show the user the planned moves and metadata rewrites before any apply; expected: no moves and no anchor rewrites for same-day ledger records. Apply only on the user's explicit go-ahead.

**Acceptance checks:**
- The dry-run output is shown to the user and every listed rewrite is explained as a real disagreement
- Nothing is applied without the user's yes

## 2. Test-strategy coverage

| LLD strategy item | Covered by |
| :--- | :--- |
| planMigration: a moved PLAN whose stored epicSlug and anchor differ from its LLD head gets one metaRewrite setting both, plus the '**Epic:**' md edit at its post-move path | `t2`, `t3` |
| planMigration: an already-placed member with stale metadata (no move) still gets a metaRewrite | `t2` |
| planMigration: a hash-fallback group gets no epicSlug rewrite; anchor/standalone rewrites still planned | `t2` |
| planMigration: a legacy unflagged head LLD in a standalone group gets only standalone: true; false is never planned | `t2` |
| planMigration: a SPEC with no stored standalone flag in a standalone group gets standalone: true (raw meta compared, not the in-memory SPEC override), and after apply its deriveMdPath resolves under docs/standalone | `t2`, `t4` |
| planMigration: anchors compared by derived folder segment: a same-day unstamped BUILD plans no rewrite; a later-day unstamped BUILD plans epicCreatedAt = group anchor | `t2` |
| planMigration: BUILD/CR/TESTS members get JSON-only rewrites (no md edit); EXT gets its two title-line edits; DEF and HLD get their H1 edit (slug-less DEF: first-sentence H1 -> slug H1) | `t3` |
| planMigration: a relabelled HLD with a companion page plans no edit to the page and lists it as a note | `t3` |
| planMigration: a consistent repo plans metaRewrites: [] and stays read-only (docs and .insrc byte-identical after planning) | `t2` |
| applyMigration: after apply, deriveMdPath on every member's stored meta equals where its md sits, and the PLAN.md header shows the head label | `t4` |
| applyMigration: only the planned meta fields change; body, citations, approvedAt and other meta fields are byte-equal; a consistent member's JSON is byte-identical | `t4` |
| applyMigration: a group's moves, JSON rewrites and md edits land in one commit; a rewrite-only group gets its own 'realign' commit | `t4` |
| applyMigration: a plan with rewrites but no moves still applies (no early return) | `t4` |
| applyMigration: with two groups, where the second group's md label line was removed (resp. its JSON corrupted) and COMMITTED after planMigration, apply throws the rewrite-step error (asserted by message, not the dirty-tree refusal) after the first group's chunk was committed, and HEAD plus the work tree equal the start commit afterwards | `t4` |
| applyMigration: a second plan after apply has no moves and no metaRewrites (idempotent) | `t4` |
| CLI insrc-migrate-docs dry run prints one line per metadata rewrite | `t5` |

## 3. References

- **[[c1]]** `prior-artifact` `LLD S001 contractDetails.api planMigration (metaRewrites postconditions)`
- **[[c2]]** `prior-artifact` `LLD S001 contractDetails.api applyMigration (apply, commit, rollback postconditions)`
- **[[c3]]** `prior-artifact` `LLD S001 dataModelChanges (MetaRewrite, MigrationPlan.metaRewrites, JSON-store invariant)`
- **[[c4]]** `prior-artifact` `LLD S001 errorPaths (error cases, edge cases, invariants)`
- **[[c5]]** `prior-artifact` `LLD S001 testStrategy (unit + integration subjects, acceptance mapping)`
- **[[c6]]** `prior-artifact` `LLD S001 migration step 5 (dry run over this repo before any apply)`
