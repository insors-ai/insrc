<!-- insrc:artifact PLAN-7224d0d4493d01d5-s1 -->

# Plan: E202610107224d0d4:S001

## Summary

**Epic:** `defect-against-epic-e1-2ff0dfda-delivery`
**LLD run:** `wf-1791635476911-jq0q2k`
**LLD effective hash:** `9e79cdbd89bf...`

Building this Story makes the delivery snapshot say what each work item is about, straight from its records: first the purpose, size, problem, summary and issue body as recorded-or-not values with their source, then the read-only feedback recorded on each item's design records. It ends by mirroring both fields in the VS Code plugin's view of the contract and checking that a 1,000-record store is still served within its budget.

## Contents

1. [Tasks](#1-tasks)
2. [Test-strategy coverage](#2-test-strategy-coverage)
3. [References](#3-references)

## 1. Tasks

| # | Task | Size | Depends on | Tests | Derived from |
| :--- | :--- | :--- | :--- | :--- | :--- |
| 1 | **`t1`** Publish each item's description from its records | M | — | unit: snapshot.test.ts: an epic's problem and summary, a story's purpose and size, and an issue's reproduction, root cause and fix intent are published from their records; unit: snapshot.test.ts: missing, blank or wrongly typed values read not recorded, and a value that does not apply to a kind is absent; unit: snapshot.test.ts: a story added by an extension takes its purpose from the EXT, and a standalone story reads not recorded; integration: types.test.ts: the delivery IPC types list exactly the sketched members | [[c1]] [[c3]] |
| 2 | **`t2`** Publish the feedback recorded on an item's own design records | M | `t1` | unit: snapshot.test.ts: feedback from an item's own design records is listed read-only, in order, and malformed entries are noticed; unit: snapshot.test.ts: two snapshots of the same store, with equal timestamps, are identical in order and counts; integration: contract.test.ts: the JetBrains sample snapshot is plain JSON and equals what the assembler produces | [[c2]] [[c3]] |
| 3 | **`t3`** Mirror the new fields in the plugin's contract and verify the budget | S | `t2` | integration: contract.test.ts: the VS Code plugin type-checks against the published delivery types; integration: handlers.test.ts: a 1,000-record store forming 500 work items is served within 500 ms | [[c4]] [[c5]] [[c6]] |

### 1.1 E202610107224d0d4:S001:T001 — Publish each item's description from its records

Add DeliveryRecorded, DeliveryItemDescription and DeliveryItem.description to src/workflow/delivery/types.ts, and fill description for every item in assembleSnapshot: an epic's problem and summary from its head DEF, a story's purpose and size from its DEF entry by ordinal (else the EXT addedStory's userValue), an issue's reproduction, root cause and fix intent from its ISSUE body, and { kind: 'task' } for a task. A value is recorded only when it is a non-empty string (size: one of S, M, L, XL), published exactly as stored with its record's artifactId. Extend the record fixtures with body overrides, update the IPC member test and regenerate the JetBrains sample so the suite stays green.

**Acceptance checks:**
- Every item's description.kind equals its kind, and each kind carries only its own fields.
- Recorded values carry the source record's artifactId and equal the stored strings exactly; missing, blank or wrongly typed values read not-recorded.
- A story added by an extension takes its purpose from the EXT; a standalone story reads not-recorded for purpose and size.
- Two snapshots of the same store are identical, including description.
- The JetBrains sample equals the assembler's output and the IPC member test lists description; the root suite passes.

### 1.2 E202610107224d0d4:S001:T002 — Publish the feedback recorded on an item's own design records

Add DeliveryFeedback and DeliveryItem.feedback to the published types and fill feedback in assembleSnapshot from body.feedback on the item's own DEF, HLD, LLD and PLAN evidence records, with absent optional fields as null, sorted by timestamp, artifactId and id, never inherited. Malformed entries (or a non-array feedback) are left out and named in an incomplete-evidence notice on the item. Regenerate the sample and update the member test.

**Acceptance checks:**
- An item lists every well-formed feedback entry of its own design records, with its artifactId, in timestamp, artifactId, id order; a parent's or child's feedback is not listed.
- Missing kind, version or segment read as null; feedback on BUILD, CR or ISSUE bodies is not read.
- A malformed entry is left out, the others on the same record are kept, and an incomplete-evidence notice names the record and the count.
- Two snapshots of the same store are identical, including description and feedback.

### 1.3 E202610107224d0d4:S001:T003 — Mirror the new fields in the plugin's contract and verify the budget

Add 'description' and 'feedback' to DeliveryItemView in vscode-plugin/src/delivery/delivery-contract.ts, re-export the three new types, and add a type-level assertion that DeliveryItemView's keys include both fields so the contract typecheck fails when either is dropped. Give the board's item fixture default values for the two fields. Make the 1,000-record budget test's records carry descriptive values and feedback entries, and confirm it still serves within 500 ms; the board's rendering is unchanged.

**Acceptance checks:**
- tsconfig.delivery-contract.json typechecks, and removing 'description' or 'feedback' from the Pick fails it.
- The board fixtures carry the new fields and the full plugin suite passes unchanged.
- handlers.test.ts serves a 1,000-record store whose records carry descriptive values and feedback within 500 ms, and its snapshot contains recorded descriptions and feedback.
- The root and plugin suites pass apart from the known manifest-catalog baseline failure; both typechecks are clean.

## 2. Test-strategy coverage

| LLD strategy item | Covered by |
| :--- | :--- |
| snapshot.test.ts: an epic's problem and summary, a story's purpose and size, and an issue's reproduction, root cause and fix intent are published from their records with the record's artifactId | `t1` |
| snapshot.test.ts: missing, blank or wrongly typed values read not-recorded, values are published exactly as stored, a task's description has no fields, and a field that does not apply to a kind is absent | `t1` |
| snapshot.test.ts: a story added by an extension takes its purpose from the EXT; a standalone story reads not-recorded | `t1` |
| snapshot.test.ts: feedback from an item's own DEF/HLD/LLD/PLAN records is listed read-only in timestamp, artifactId, id order with absent optional fields as null, never inherited, and malformed entries are left out with an incomplete-evidence notice | `t2` |
| snapshot.test.ts: two snapshots of the same store, with descriptions and feedback, are identical | `t1`, `t2` |
| types.test.ts: the delivery IPC types list exactly the sketched members, including DeliveryItem.description and feedback and the three new types | `t1`, `t2` |
| contract.test.ts: the VS Code plugin type-checks against the published delivery types (DeliveryItemView picks description and feedback) | `t3` |
| contract.test.ts: the JetBrains sample snapshot, regenerated with descriptions and feedback, equals what the assembler produces | `t1`, `t2` |
| delivery-contract.ts: a type-level assertion that DeliveryItemView's keys include 'description' and 'feedback', so the contract typecheck (contract.test.ts) fails when the plugin mirror omits either field | `t3` |
| handlers.test.ts: a 1,000-record store forming 500 work items is served within 500 ms, with descriptions and feedback present (a regression guard: it passes before the fix and must still pass after it) | `t3` |
| vscode-plugin board tests: the board fixtures carry the new fields and every board test still passes unchanged | `t3` |

## 3. References

- **[[c1]]** `prior-artifact` `LLD s1 contractDetails.assembleSnapshot postconditions (description per kind)`
- **[[c2]]** `prior-artifact` `LLD s1 contractDetails.assembleSnapshot postconditions (feedback) and errorPaths`
- **[[c3]]** `prior-artifact` `LLD s1 dataModelChanges (DeliveryRecorded, DeliveryItemDescription, DeliveryFeedback, DeliveryItem)`
- **[[c4]]** `prior-artifact` `LLD s1 contractDetails.DeliveryItemView`
- **[[c5]]** `prior-artifact` `LLD s1 testStrategy`
- **[[c6]]** `prior-artifact` `LLD s1 migration`
