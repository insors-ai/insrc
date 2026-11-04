<!-- insrc:artifact PLAN-3c0b242fcabf01e9-s1 -->

# Plan: STORY-3c0b242fcabf01e9-s1

## Summary

**Epic:** `stop-flat-amendment-heads-from-blocking`
**LLD run:** `wf-1793778200313-5oe9gw`
**LLD effective hash:** `6a47f9e368d6...`

Building this Story is five small steps: narrow the roll-up so only unreadable heads of the counted kind block it, name the approver on a migrated approval, make the lifecycle migration reusable with an id filter, add the repair function that composes them, and then run the repair once on a copy and on this repository, recording the unverified cause in the BUILD record. The code steps carry their own tests; the last step is a manual, reviewed data run.

## Contents

1. [Tasks](#1-tasks)
2. [Test-strategy coverage](#2-test-strategy-coverage)
3. [References](#3-references)

## 1. Tasks

| # | Task | Size | Status | Depends on | Tests | Derived from |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| 1 | **`t1`** Narrow the roll-up to unreadable heads of the counted kind | S | — | — | unit: lifecycle-rollup.test.ts: an unreadable head of another kind does not block a Story roll-up; unit: lifecycle-rollup.test.ts: an unreadable head of the counted kind still blocks the roll-up | [[c1]] [[c6]] |
| 2 | **`t2`** Name the approval actor from body.approvedBy in backfillHead | S | — | — | unit: convert-lifecycle-backfill.test.ts: an approved head with a string approvedBy gets an approval actor named by it; unit: convert-lifecycle-backfill.test.ts: a head without a string approvedBy gets the same lifecycle as before | [[c3]] [[c6]] |
| 3 | **`t3`** Export migrateHeads with an optional id filter | S | — | — | integration: convert-apply.test.ts: migrateHeads with an id filter leaves heads outside the filter unchanged with no new log entries; integration: convert-apply.test.ts: the full conversion migrates the same heads as before with no id filter | [[c2]] [[c6]] |
| 4 | **`t4`** Add repairFlatAmendments | M | — | `t2`, `t3` | integration: convert-amendments.test.ts: repairFlatAmendments makes a flat approved amendment a head the amendment store reads as approved by the original approver; integration: convert-amendments.test.ts: repairFlatAmendments makes a flat not-yet-approved amendment a draft head; integration: convert-amendments.test.ts: repairFlatAmendments lists a flat amendment it cannot convert and leaves it flat; integration: convert-amendments.test.ts: repairFlatAmendments finishes a head that was converted but not migrated; integration: convert-amendments.test.ts: repairFlatAmendments on a repo at schema version 2 does nothing the second time; integration: store-children-strict.test.ts: a flat amendment head is reported unreadable while real children are still listed | [[c4]] [[c5]] [[c6]] |
| 5 | **`t5`** Repair this repository's two amendments and record the cause | S | — | `t1`, `t4` | smoke: repair on a copy then on this repository: the two amendments read as approved heads and a BUILD approval needs no move-aside (reported with the before/after output) | [[c5]] [[c6]] |

### 1.1 TASK-3c0b242fcabf01e9-s1-t1 — Narrow the roll-up to unreadable heads of the counted kind

In countedChildren, throw UnreadableChildError only for unreadable ids whose id kind equals the counted kind (and for counted children whose status cannot be read); ignore unreadable heads of other kinds. Keep the signature and the strict scan. Add the ac1 tests through rollUp, using the inline reader(children, statuses, unreadable) factory of lifecycle-rollup.test.ts.

**Acceptance checks:**
- An unreadable head of a kind other than the counted kind does not block a Story roll-up
- An unreadable head of the counted kind still blocks the roll-up with UnreadableChildError
- countedChildren keeps its signature and stays unexported

### 1.2 TASK-3c0b242fcabf01e9-s1-t2 — Name the approval actor from body.approvedBy in backfillHead

When an approved head has a non-empty string body.approvedBy, set lifecycle.approval.by to a person actor derived with the amendments module's personOf (namespaced id when the string looks namespaced, otherwise local:<slug> plus the original name); every other head keeps the fixed legacy actor. Add tests that an amendment reads back its approver's name and that a head without a string approvedBy gets the same lifecycle as before.

**Acceptance checks:**
- An approved head with a string body.approvedBy gets approval.by named by it, with an id from personOf
- A head without a string body.approvedBy gets exactly the lifecycle it got before
- The amendment store reads the original approver name for the converted head

### 1.3 TASK-3c0b242fcabf01e9-s1-t3 — Export migrateHeads with an optional id filter

Export migrateHeads from apply.ts with an optional trailing set of artifact ids; the full conversion calls it unchanged. Limit its documented unreadable error to a head that has a meta object but no body object. Add a negative test that heads outside the filter are byte-for-byte unchanged and get no new log entries, and a test that the unfiltered call migrates the same heads as before.

**Acceptance checks:**
- With the filter, heads outside the set are neither read for writing nor changed, and get no new log entries
- Without the filter, the full conversion migrates the same heads as before
- applyConversion's call site is unchanged

### 1.4 TASK-3c0b242fcabf01e9-s1-t4 — Add repairFlatAmendments

First check that exporting migrateHeads from apply.ts and importing it in amendments.ts, which apply.ts already imports, loads without a load-order failure. Then in amendments.ts add repairFlatAmendments(repo, deps): convert flat amendments with flatToHead through convertAll, write the converted heads, return the converted ids and the conversion problems, then call migrateHeads with a filter made of every AMD head currently in the repository, not only the ones converted in this call. Add the ac2 tests on a converted repo built by adding flat amendments with the flat() and put() pattern of convert-amendments.test.ts and writing the version-2 marker with writeRepoSchema.

**Acceptance checks:**
- The module import between apply.ts and amendments.ts loads without error
- A flat approved amendment becomes a head the amendment store reads as approved by the original approver
- A flat not-yet-approved amendment becomes a draft head
- A flat amendment that cannot be converted is listed in problems and left flat
- A head converted earlier but not yet migrated is finished by a later call
- A second call on the repaired repository converts and migrates nothing

### 1.5 TASK-3c0b242fcabf01e9-s1-t5 — Repair this repository's two amendments and record the cause

Run repairFlatAmendments through a one-off script kept with its before/after output under the story's docs folder, first on a copy of this repository, comparing AMD-86197ac660732ceb-1 and -2 before and after (id, proposal, rationale and approval time unchanged, the approver reading as the original name, lifecycle added, legacy stamps gone). This comparison is a manual gate with no automated check: only if it shows just those differences, run the script on this repository and commit the two rewritten files in their own commit. Confirm that approving a BUILD works without the move-aside workaround. Record in the BUILD record only (the ISSUE is already approved) that the writer of the flat shape is unverified with the likely older daemon build, and that the sc4 roll-up narrowing was recorded here instead of amending the epic HLD, citing ISSUE-3c0b242fcabf01e9 and the LLD override.

**Acceptance checks:**
- The comparison on the copy shows only the expected differences
- After the repair on this repository the two amendments decode as heads and the amendment store reads them as approved by the original approver
- A BUILD approval succeeds without moving any file aside
- The BUILD record names the unverified cause and the sc4 recording decision

## 2. Test-strategy coverage

| LLD strategy item | Covered by |
| :--- | :--- |
| rollUp and the module-private countedChildren in src/workflow/artifact-core/lifecycle.ts | `t1` |
| repairFlatAmendments in src/workflow/convert/amendments.ts | `t4`, `t5` |
| backfillHead approval actor in src/workflow/convert/backfill.ts | `t2`, `t4` |
| migrateHeads with and without an id filter in src/workflow/convert/apply.ts | `t3`, `t4` |
| ArtifactStore child scan with a flat AMD head | `t4` |

## 3. References

- **[[c1]]** `code` `src/workflow/artifact-core/lifecycle.ts:303-323`
- **[[c2]]** `code` `src/workflow/convert/apply.ts:84-98`
- **[[c3]]** `code` `src/workflow/convert/backfill.ts:73-135`
- **[[c4]]** `code` `src/workflow/convert/amendments.ts:27-85`
- **[[c5]]** `prior-artifact` `LLD s1 migration steps of LLD-3c0b242fcabf01e9-s1`
- **[[c6]]** `prior-artifact` `docs/standalone/stop-flat-amendment-heads-from-blocking-E202611043c0b242f/S001/LLD.md`
