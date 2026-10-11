<!-- insrc:artifact LLD-7224d0d4493d01d5-s1 -->

# LLD: E202610107224d0d4:S001

## Summary

**Epic:** `defect-against-epic-e1-2ff0dfda-delivery`
**HLD base run:** `wf-1791635476911-jq0q2k`
**HLD effective hash:** `9e79cdbd89bf...`

The delivery snapshot will carry what each work item is about, read straight from its records: a story's purpose and recorded size, an epic's problem statement and summary, and an issue's observed-vs-expected, root cause and fix intent. It also carries the feedback people have recorded on the item's design records, shown read-only. Every value says whether it was recorded and, if so, which record it came from; a value that does not belong to an item's kind is simply absent from that kind. The VS Code plugin's view of the contract picks up the new fields, so the board can show them later without ever opening a record itself.

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

**Surface level:** internal-shared

### 2.1 `assembleSnapshot`

```typescript
function assembleSnapshot(recordSet: ArtifactRecordSet, graph: WorkItemGraph, stages: StagePassResult, gates: GatePassResult, currency: CurrencyPassResult, markdown: DeliveryMarkdownPort): DeliverySnapshot
```

**Parameters:**
- `recordSet: ArtifactRecordSet` — Unchanged. Now also the source of each item's descriptive values and feedback, read from the bodies of the records in the item's evidence.

**Returns:** `DeliverySnapshot` — Unchanged shape at the snapshot level (schemaVersion stays 1). Every DeliveryItem additionally carries `description` and `feedback`.

**Preconditions:**
- The graph was built from the same recordSet, so each item's evidenceArtifactIds resolve in it.

**Postconditions:**
- description.kind equals the item's kind for every item.
- Epic: problem is recorded from the epic's DEF body.problem and summary from its DEF body.summary.prose, each when it is a non-empty string, with that DEF's artifactId; otherwise not-recorded.
- Story: purpose is recorded from the userValue of the DEF story entry with the story's ordinal, else from the userValue of an EXT record's body.addedStory in the story's evidence; size is recorded from that DEF entry's sizeEstimate when it is one of S, M, L, XL; otherwise not-recorded. A standalone story with neither record reads not-recorded for both.
- Issue: reproduction, rootCause and fixIntent are recorded from its ISSUE body when each is a non-empty string; otherwise not-recorded.
- Task: description is { kind: 'task' } with no fields.
- A recorded value is the source string exactly as stored; nothing is generated, summarised or trimmed.
- feedback lists every well-formed entry of body.feedback on the item's own DEF, HLD, LLD and PLAN evidence records (an epic's DEF and HLD, a story's LLD and PLAN), each with its artifactId, sorted by timestamp, then artifactId, then id. Feedback is never inherited from a parent or child.
- A feedback entry missing a string id, author, timestamp or comment is left out and named in an incomplete-evidence notice on the item; the item's other values are unaffected.
- Two snapshots of the same store are identical, including description and feedback.

### 2.2 `DeliveryItemView`

```typescript
type DeliveryItemView = Pick<DeliveryItem, 'id' | 'kind' | 'title' | 'standalone' | 'sourceIds' | 'parentId' | 'childIds' | 'stage' | 'evidence' | 'tasks' | 'validation' | 'storyLevelResult' | 'conflict' | 'correctsRef' | 'needsAttention' | 'attentionReasons' | 'notices' | 'description' | 'feedback'>
```

**Returns:** `type` — The plugin's pinned view of a snapshot item (vscode-plugin/src/delivery/delivery-contract.ts) gains description and feedback, and re-exports DeliveryItemDescription, DeliveryRecorded and DeliveryFeedback, so a rename or removal on the daemon side fails the plugin's contract typecheck.

**Postconditions:**
- tsconfig.delivery-contract.json typechecks against the daemon's types.
- The board's own rendering is unchanged by this Story.

## 3. Data model changes

### 3.1 `DeliveryRecorded<T> (src/workflow/delivery/types.ts)` — new

{ state: 'recorded'; value: T; artifactId: string } | { state: 'not-recorded' }. One recorded descriptive value and the record it came from, or the fact that no record states it.

**Call sites:**
- `src/workflow/delivery/snapshot.ts`
- `vscode-plugin/src/delivery/delivery-contract.ts`

### 3.2 `DeliveryItemDescription (src/workflow/delivery/types.ts)` — new

{ kind: 'epic'; problem: DeliveryRecorded<string>; summary: DeliveryRecorded<string> } | { kind: 'story'; purpose: DeliveryRecorded<string>; size: DeliveryRecorded<'S' | 'M' | 'L' | 'XL'> } | { kind: 'issue'; reproduction: DeliveryRecorded<string>; rootCause: DeliveryRecorded<string>; fixIntent: DeliveryRecorded<string> } | { kind: 'task' }. A field that does not apply to a kind is not part of that kind's variant (not applicable).

**Call sites:**
- `src/workflow/delivery/snapshot.ts`
- `vscode-plugin/src/delivery/delivery-contract.ts`

### 3.3 `DeliveryFeedback (src/workflow/delivery/types.ts)` — new

{ artifactId: string; id: string; author: string; timestamp: string; kind: 'feedback' | 'suggestion' | 'comment' | null; comment: string; target: { file: string; version: string | null; segment: { startLine: number; endLine: number } | null } }. One read-only feedback entry from a FeedbackRecord (src/workflow/artifacts/provenance/types.ts), with absent optional fields as null so the snapshot stays plain JSON with every key present.

**Call sites:**
- `src/workflow/delivery/snapshot.ts`
- `vscode-plugin/src/delivery/delivery-contract.ts`

### 3.4 `DeliveryItem (src/workflow/delivery/types.ts)` — field-add

Adds description: DeliveryItemDescription and feedback: readonly DeliveryFeedback[] (empty when none). Additive within schemaVersion 1; no existing field changes.

```
+ readonly description: DeliveryItemDescription;
+ readonly feedback: readonly DeliveryFeedback[];
```

**Call sites:**
- `src/workflow/delivery/snapshot.ts`
- `vscode-plugin/src/delivery/delivery-contract.ts`
- `vscode-plugin/src/delivery/__tests__/board-fixtures.ts`
- `src/workflow/delivery/__tests__/contract.test.ts`

### 3.5 `DeliveryItemView (vscode-plugin/src/delivery/delivery-contract.ts)` — field-add

Pick list gains 'description' and 'feedback'; the module re-exports the three new types.

**Call sites:**
- `vscode-plugin/src/delivery/delivery-contract.ts`
- `vscode-plugin/src/delivery/__tests__/board-fixtures.ts`

## 4. Error paths

**Error cases**

- **A record body holds a descriptive field of the wrong type (problem as a number, userValue as an object, sizeEstimate 'XXL').** (recoverable)
  - Detection: Each value is read through a type check (a non-empty string; for size, membership in S, M, L, XL) before it is published.
  - Response: The value reads not-recorded; nothing is coerced or guessed.
  - User impact: The field shows as not recorded; the rest of the item is unaffected.
- **A body.feedback is not an array, or an entry lacks a string id, author, timestamp or comment, or its target lacks a string file.** (recoverable)
  - Detection: body.feedback is checked with Array.isArray and each entry field by type before it becomes a DeliveryFeedback.
  - Response: The malformed entries (or the whole non-array value) are left out, and an incomplete-evidence notice on the item names the record and how many entries were left out. Well-formed entries on the same record are still published.
  - User impact: Readable feedback still shows; the notice says some could not be read.
- **An item's evidence lists an artifactId that is missing from the record set.** (recoverable)
  - Detection: The lookup by artifactId returns undefined, as it already does for evidence entries.
  - Response: That record contributes no value and no feedback; the existing evidence handling is unchanged.
  - User impact: None beyond the values that record would have supplied.
- **Two DEF records share a work-item hash (identity-ambiguous).** (recoverable)
  - Detection: The graph takes the first DEF of the hash, by artifactId, as the head (graph.ts: epicLevel.find(r => r.kind === 'DEF')) and raises no notice for a second DEF; identity-ambiguous is raised only when a hash has both a Define and an issue record.
  - Response: The epic's problem and summary and its stories' purpose and size come from that same head DEF, so descriptive values never mix records. This Story adds no notice for duplicate DEFs; that would be a separate identity change.
  - User impact: Values follow the DEF the graph chose (the first by artifactId); the other DEF's values are not shown, as its titles are not today.

**Edge cases**

| Input | Expected |
| :--- | :--- |
| A standalone story (no DEF, no EXT), e.g. an issue's fix story. | purpose and size both read not-recorded; its LLD and PLAN feedback is still published. |
| An epic story added by an extension (EXT with addedStory.userValue) and no DEF entry. | purpose is recorded from the EXT, with the EXT's artifactId; size reads not-recorded. |
| A DEF story entry with userValue but no sizeEstimate. | purpose recorded, size not-recorded. |
| An empty or whitespace-only string (problem: '  '). | not-recorded; a recorded value is never blank. |
| A recorded string with leading or trailing spaces or line breaks. | Published exactly as stored. |
| A DEF with summary absent but problem present. | problem recorded, summary not-recorded. |
| Feedback entries on both the LLD and the PLAN of a story, with equal timestamps. | All entries listed, ordered by timestamp, then artifactId, then id. |
| A feedback entry without kind, version or segment. | Published with kind, target.version and target.segment as null. |
| Feedback on a BUILD, CR or ISSUE body. | Not read: feedback is read only from DEF, HLD, LLD and PLAN bodies, the kinds that carry it. |

**Invariants to preserve**

- schemaVersion stays 1 and every existing DeliveryItem and DeliverySnapshot field keeps its name, type and meaning; the change is additive. [[c1]]
- The snapshot is pure and deterministic: two snapshots of the same store are identical, with items sorted by id and lists sorted. [[c2]]
- The daemon is the only interpreter of the records; clients read the snapshot, never record bodies, for these values. [[c10]]
- The work-item graph's identity, hierarchy and titles are unchanged; descriptive values are read beside it, not by changing it. [[c6]]
- The plugin's contract mirror typechecks against the daemon's types, so drift fails the build. [[c7]]
- The JetBrains sample snapshot equals what the assembler produces, byte for byte. [[c8]]
- A 1,000-record store forming 500 work items is served within 500 ms. [[c9]]

## 5. Test strategy

**Test framework:** `node:test via tsx (npx tsx --test 'src/**/__tests__/*.test.ts'), node:assert/strict; record fixtures from src/workflow/delivery/__tests__/fixtures.ts; the plugin side via npx tsx --test in vscode-plugin and its contract typecheck (tsconfig.delivery-contract.json)`

**Test levels**

- **unit** — Each kind's descriptive values, their three states and their source records, and the feedback list.
  - Subjects: `snapshot.test.ts: an epic's problem and summary, a story's purpose and size, and an issue's reproduction, root cause and fix intent are published from their records with the record's artifactId`, `snapshot.test.ts: missing, blank or wrongly typed values read not-recorded, values are published exactly as stored, a task's description has no fields, and a field that does not apply to a kind is absent`, `snapshot.test.ts: a story added by an extension takes its purpose from the EXT; a standalone story reads not-recorded`, `snapshot.test.ts: feedback from an item's own DEF/HLD/LLD/PLAN records is listed read-only in timestamp, artifactId, id order with absent optional fields as null, never inherited, and malformed entries are left out with an incomplete-evidence notice`, `snapshot.test.ts: two snapshots of the same store, with descriptions and feedback, are identical`
  - Fixtures: `fixtures.ts: defRecord/issueRecord/lldRecord/planRecord/extRecord accept body overrides (problem, summary, userValue, sizeEstimate, reproduction, rootCause, fixIntent, feedback)`
- **contract** — The published shape and its client mirrors.
  - Subjects: `types.test.ts: the delivery IPC types list exactly the sketched members, including DeliveryItem.description and feedback and the three new types`, `contract.test.ts: the VS Code plugin type-checks against the published delivery types (DeliveryItemView picks description and feedback)`, `contract.test.ts: the JetBrains sample snapshot, regenerated with descriptions and feedback, equals what the assembler produces`, `delivery-contract.ts: a type-level assertion that DeliveryItemView's keys include 'description' and 'feedback', so the contract typecheck (contract.test.ts) fails when the plugin mirror omits either field`
- **integration** — The served snapshot stays within budget with the new fields.
  - Subjects: `handlers.test.ts: a 1,000-record store forming 500 work items is served within 500 ms, with descriptions and feedback present (a regression guard: it passes before the fix and must still pass after it)`, `vscode-plugin board tests: the board fixtures carry the new fields and every board test still passes unchanged`

**Acceptance mapping**

| Criterion | Proving tests |
| :--- | :--- |
| `ac1` | `snapshot.test.ts: 'an epic\'s problem and summary, a story\'s purpose and size, and an issue\'s reproduction, root cause and fix intent are published from their records'`, `snapshot.test.ts: 'a story added by an extension takes its purpose from the EXT, and a standalone story reads not recorded'` |
| `ac2` | `snapshot.test.ts: 'missing, blank or wrongly typed values read not recorded, and a value that does not apply to a kind is absent'` |
| `ac3` | `snapshot.test.ts: 'feedback from an item\'s own design records is listed read-only, in order, and malformed entries are noticed'` |
| `ac4` | `contract.test.ts: 'the VS Code plugin type-checks against the published delivery types'`, `delivery-contract.ts: the DeliveryItemView key assertion for description and feedback, checked by contract.test.ts 'the VS Code plugin type-checks against the published delivery types'` |
| `ac5` | `snapshot.test.ts: 'two snapshots of the same store, with equal timestamps, are identical in order and counts'`, `handlers.test.ts: 'a 1,000-record store forming 500 work items is served within 500 ms'` |
| `ac6` | `types.test.ts: 'the delivery IPC types list exactly the sketched members'`, `contract.test.ts: 'the JetBrains sample snapshot is plain JSON and equals what the assembler produces'` |

## 6. Migration

**State before:** Per s1: DeliveryItem (src/workflow/delivery/types.ts) carries identity, hierarchy, stage, gates, evidence and notices only; assembleSnapshot (snapshot.ts) reads no descriptive body field, and a search of src/workflow/delivery finds no userValue, sizeEstimate, reproduction, rootCause, fixIntent or feedback. The plugin mirror pins 17 DeliveryItem fields.

**State after:** Every DeliveryItem also carries description (a union keyed by kind, each field recorded with its source artifactId or not-recorded) and feedback (the read-only entries recorded on the item's own DEF/HLD/LLD/PLAN records), within schemaVersion 1. The plugin mirror picks both fields, the JetBrains sample is regenerated, and the shape tests pin the new members.

**Zero downtime:** yes — **Data rewrite:** no

**Steps**

1. Add the DeliveryRecorded, DeliveryItemDescription and DeliveryFeedback types and the two DeliveryItem fields to the published types. — ↩ rollbackable
2. Fill description and feedback for every item while the snapshot is assembled, reading the bodies of the item's own records; raise incomplete-evidence for malformed feedback entries. — ↩ rollbackable
3. Add the two fields to the plugin's DeliveryItemView and its board test fixtures; the board's rendering stays as it is. — ↩ rollbackable
4. Regenerate the JetBrains sample snapshot and extend the type, snapshot, contract and budget tests; run the root and plugin suites. — ↩ rollbackable

**Backward compat:** Additive within schemaVersion 1: no existing field is renamed, removed or re-meant, so a client that ignores unknown fields (the plugin today, and the JetBrains Gson reader, which reads by field name) keeps working. The stored records are read only, never rewritten. Old daemons simply omit the fields; the plugin is released together with the daemon, as before.

## 7. Alternatives considered

### 7.1 a1: A kind-tagged description plus an item feedback list — **CHOSEN**

DeliveryItem gains `description`, a union keyed by the item's kind whose fields each say recorded (with value and source record) or not recorded, and `feedback`, the recorded feedback entries of the item's own records.

Add DeliveryItem.description: { kind: 'epic', problem: Recorded<string>, summary: Recorded<string> } | { kind: 'story', purpose: Recorded<string>, size: Recorded<'S'|'M'|'L'|'XL'> } | { kind: 'issue', reproduction, rootCause, fixIntent: Recorded<string> } | { kind: 'task' }, where Recorded<T> = { state: 'recorded'; value: T; artifactId: string } | { state: 'not-recorded' }. A field that does not apply to a kind is simply not part of that kind's variant, so 'not applicable' is structural rather than a third value. Add DeliveryItem.feedback: readonly DeliveryFeedback[] = { artifactId, id, author, timestamp, kind, comment, target } for every feedback entry recorded on the item's own evidence records (DEF/HLD for an epic, LLD/PLAN for a story), sorted by timestamp then id. A new pure pass reads the values from the record bodies; the graph stays as it is. The plugin mirror adds both fields to DeliveryItemView.

### 7.2 a2: Flat nullable fields on DeliveryItem

Add purpose, size, problem, summary, reproduction, rootCause, fixIntent and feedback as nullable fields on every item.

Every DeliveryItem carries all the descriptive fields as string | null (size as the enum or null), filled where the item's kind has a source and null otherwise; feedback as an array. The extraction reads the same record bodies.

**Rejected because:** Cheapest, but violates the three-state requirement the issue states explicitly.

### 7.3 a3: Uniform tri-state fields on every item

Every item carries every descriptive field as { status: 'recorded' | 'not-recorded' | 'not-applicable', value, artifactId }.

Same extraction as a1, but each of the seven fields is present on every item with an explicit status, including 'not-applicable' for kinds without that field. Feedback as in a1.

**Rejected because:** Same guarantees as a1 at runtime but weaker typing (the kind rule is not in the contract) and a larger payload.

### 7.4 a4: Counts and pointers only; values through the evidence request

The snapshot publishes only which values are recorded and in which record; clients fetch the text with workflow.deliveryEvidence.

DeliveryItem gains a descriptor { purpose: artifactId | null, size, problem: artifactId | null, ... , feedbackCount } and the client reads the actual text from the record body returned by the evidence request.

**Rejected because:** Violates the PRD rule that the daemon is the only interpreter of the records.

## 8. References

- **[[c1]]** `code` `src/workflow/delivery/types.ts` — "DeliveryItem / DeliverySnapshot (schemaVersion 1)"
- **[[c2]]** `code` `src/workflow/delivery/snapshot.ts` — "assembleSnapshot / itemOf: pure and deterministic"
- **[[c3]]** `code` `src/workflow/artifacts/define.ts` — "DefineBody.problem, summary, stories[].userValue / sizeEstimate, feedback"
- **[[c4]]** `code` `src/workflow/artifacts/issue.ts` — "IssueArtifactBody { title, reproduction, rootCause, fixIntent }"
- **[[c5]]** `code` `src/workflow/artifacts/provenance/types.ts` — "FeedbackEntry / FeedbackRecord"
- **[[c6]]** `code` `src/workflow/delivery/graph.ts` — "buildWorkItemGraph keeps only titles from bodies"
- **[[c7]]** `code` `vscode-plugin/src/delivery/delivery-contract.ts` — "DeliveryItemView = Pick<DeliveryItem, ...>"
- **[[c8]]** `code` `src/workflow/delivery/__tests__/contract.test.ts` — "the JetBrains sample snapshot equals what the assembler produces"
- **[[c9]]** `code` `src/workflow/delivery/__tests__/handlers.test.ts` — "a 1,000-record store forming 500 work items is served within 500 ms"
- **[[c10]]** `prior-artifact` `docs/standalone/defect-against-epic-e1-2ff0dfda-delivery-E202610097224d0d4/ISSUE.md` — "the daemon as the only interpreter (PRD §07)"
- **[[c11]]** `step-output` `s1..s8 of this run`

## 9. Open questions

- ep3 (partial): the sole-interpreter invariant cites the PRD (c10) rather than an analyze bundle.

## Resolved questions

- `q7fc55c12` — ep3 (partial): the sole-interpreter invariant cites the PRD (c10) rather than an analyze bundle.
  - **resolved**: Ground it with an analyze pass — Grounded in code: vscode-plugin/src/delivery has no filesystem access (no fs import or readFile outside tests) and reads data only through delivery-client.ts's two daemon calls, workflow.delivery and workflow.deliveryEvidence (delivery-client.ts:93,112,124). The invariant holds today; the PRD (c10) stays as the source of intent. _(2026-10-10T12:41:57.723Z)_

## Citations

- **[[c1]]** `code` `src/workflow/delivery/types.ts` — "DeliveryItem / DeliverySnapshot (schemaVersion 1)"
- **[[c2]]** `code` `src/workflow/delivery/snapshot.ts` — "assembleSnapshot / itemOf: pure and deterministic"
- **[[c3]]** `code` `src/workflow/artifacts/define.ts` — "DefineBody.problem, summary, stories[].userValue / sizeEstimate, feedback"
- **[[c4]]** `code` `src/workflow/artifacts/issue.ts` — "IssueArtifactBody { title, reproduction, rootCause, fixIntent }"
- **[[c5]]** `code` `src/workflow/artifacts/provenance/types.ts` — "FeedbackEntry / FeedbackRecord"
- **[[c6]]** `code` `src/workflow/delivery/graph.ts` — "buildWorkItemGraph keeps only titles from bodies"
- **[[c7]]** `code` `vscode-plugin/src/delivery/delivery-contract.ts` — "DeliveryItemView = Pick<DeliveryItem, ...>"
- **[[c8]]** `code` `src/workflow/delivery/__tests__/contract.test.ts` — "the JetBrains sample snapshot equals what the assembler produces"
- **[[c9]]** `code` `src/workflow/delivery/__tests__/handlers.test.ts` — "a 1,000-record store forming 500 work items is served within 500 ms"
- **[[c10]]** `prior-artifact` `docs/standalone/defect-against-epic-e1-2ff0dfda-delivery-E202610097224d0d4/ISSUE.md` — "the daemon as the only interpreter (PRD §07)"
- **[[c11]]** `step-output` `s1..s8 of this run`
