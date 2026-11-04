<!-- insrc:artifact LLD-3c0b242fcabf01e9-s1 -->

# LLD: STORY-3c0b242fcabf01e9-s1

## Summary

**Epic:** `stop-flat-amendment-heads-from-blocking`
**HLD base run:** `wf-1793778200313-5oe9gw`
**HLD effective hash:** `6a47f9e368d6...`

Completion stops failing because of an unrelated unreadable head: the roll-up counts unreadable heads only of the kind it is counting. The two old-shape amendment records are repaired by a new, tested repair function that converts them and gives them their lifecycle, so they read as approved with the original approver's name. The repair works on a repository that is already converted, which the full conversion cannot. The roll-up is the sc4 lifecycle contract of the approved epic one-common-model-every-artifact and the conversion code belongs to that epic's s9; this Story keeps the sc4 signature and changes only which unreadable heads block.

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

### 2.1 `countedChildren`

```typescript
async function countedChildren(id: string, kind: 'TASK' | 'STORY', reader: ChildStatusReader): Promise<Status[]>
```

**Parameters:**
- `id: string` — The unit being completed.
- `kind: 'TASK' | 'STORY'` — The child kind that counts towards the unit's completion.
- `reader: ChildStatusReader` — Lists the unit's children and unreadable heads, and reads child statuses.

**Returns:** `Promise<Status[]>` — Statuses of the counted children, excluding withdrawn and superseded.

**Errors:**
- `UnreadableChildError` when An unreadable head whose id kind is the counted kind, or a counted child whose status cannot be read.

**Preconditions:**
- Module-private; reached through the exported rollUp(id, reader, evidence)
- reader.childrenOfStrict(id) returns the unit's children and every unreadable head id in the artifacts folder

**Postconditions:**
- An unreadable head whose id kind differs from the counted kind never makes the call throw
- An unreadable head of the counted kind still makes the call throw, as before
- Its signature is unchanged

### 2.2 `migrateHeads`

```typescript
export async function migrateHeads(repo: string, deps: ConversionDeps, seams: MigratedHeadSeams | undefined, only?: ReadonlySet<string>): Promise<number>
```

**Parameters:**
- `repo: string` — Absolute repo path.
- `deps: ConversionDeps` — History, clock and actor for the migrated entries.
- `seams: MigratedHeadSeams | undefined` — Test seam between the log append and the head write.
- `only: ReadonlySet<string>` _(optional)_ — When given, only heads with these artifact ids are examined.

**Returns:** `Promise<number>` — How many heads were written.

**Errors:**
- `ConversionUnreadable` when A head examined has no meta and body objects.
- `ConversionIncomplete` when writeMigratedHead refuses because the migration would change the stored revision, status or approval.

**Preconditions:**
- The full conversion passes no filter and behaves exactly as before

**Postconditions:**
- Without `only`, every head with no lifecycle or with legacy fields is migrated as before
- With `only`, heads outside the set are not read or written

### 2.3 `backfillHead`

```typescript
export function backfillHead(input: BackfillInput): BackfillResult
```

**Parameters:**
- `input: BackfillInput` — The raw head, whether it has a log, the clock and the migration actor.

**Returns:** `BackfillResult` — The converted head with its lifecycle, the legacy fields it removed and the log entries to append.

**Errors:**
- `ConversionUnreadable` when The head has no meta and body objects.

**Postconditions:**
- When the head's body.approvedBy is a non-empty string and the head is approved, lifecycle.approval.by is a person actor named by that string instead of the fixed legacy actor
- Every head without a string body.approvedBy gets exactly the lifecycle it got before
- The amendment store therefore reads the original approver's name

### 2.4 `repairFlatAmendments`

```typescript
export async function repairFlatAmendments(repo: string, deps: ConversionDeps): Promise<{ converted: string[]; problems: ConversionProblem[] }>
```

**Parameters:**
- `repo: string` — Absolute repo path; any schema version.
- `deps: ConversionDeps` — History, clock and actor used by the lifecycle migration.

**Returns:** `Promise<{ converted: string[]; problems: ConversionProblem[] }>` — Ids of the flat amendments written as heads in this call, and the flat amendments that could not be converted.

**Errors:**
- `ConversionUnreadable` when An amendment head cannot be read for the lifecycle migration.
- `ConversionIncomplete` when The lifecycle migration of an amendment head is refused.

**Preconditions:**
- None on the content of the flat records: one that cannot be converted is returned in problems

**Postconditions:**
- Every amendment head that lacks a lifecycle or carries legacy fields, converted in this call or earlier, ends with a lifecycle and none of the legacy stamps
- An approved amendment's lifecycle keeps its original approval time and the approver's name
- A flat amendment that cannot be converted is left untouched and listed in problems
- Running it again converts and migrates nothing

### 2.5 `applyAmendments`

```typescript
export function applyAmendments(repo: string): number
```

**Parameters:**
- `repo: string` — Absolute repo path whose flat amendment heads are converted.

**Returns:** `number` — How many flat amendments were written as heads.

**Postconditions:**
- Unchanged by this Story; it writes converted heads without a lifecycle and drops conversion problems, which is harmless for the full conversion because applyConversion refuses the whole conversion on any plan problem before calling it

## 3. Data model changes

### 3.1 `Amendment head (AMD-86197ac660732ceb-1, -2)` — field-modify

Each record moves from the flat shape to {meta, body, citations}; meta gains lifecycle (status approved, approval at the original approvedAt by a person actor named by the original approvedBy) and loses the legacy approval stamps; body keeps approvedBy. The id, proposal and rationale are unchanged. Invariant it might break: the amendment store reads approval only from meta.lifecycle and takes the approver from lifecycle.approval.by first. No new entity and no relationship change, so no ER definition is needed.

**Call sites:**
- `src/workflow/convert/amendments.ts:27-56`
- `src/workflow/convert/backfill.ts:73-135`
- `src/workflow/amendments/store.ts:128-158`
- `src/workflow/artifact-core/approval-view.ts:24-34`
- `.insrc/artifacts/AMD-86197ac660732ceb-1.json`
- `.insrc/artifacts/AMD-86197ac660732ceb-2.json`

## 4. Error paths

**Error cases**

- **A Task or Story head that the unit may own cannot be read during roll-up** (recoverable)
  - Detection: The strict child scan lists its id as unreadable and the id's kind equals the counted kind
  - Response: countedChildren still throws UnreadableChildError naming it
  - User impact: Completion is refused with the same message as today, for the right reason
- **A flat amendment cannot be converted (no epicHash, no amendment object, no proposedAt, unknown status, or no work item head to take epicCreatedAt from)** (recoverable)
  - Detection: flatToHead returns a problem, which convertAll collects; repairFlatAmendments returns it in problems instead of dropping it
  - Response: That record is not written and stays flat; the others are repaired
  - User impact: The caller sees which file and why, and the roll-up is no longer blocked by it once the narrowing is in
- **The lifecycle migration of an amendment head is refused (the head cannot be read, or writeMigratedHead refuses because the migration would change the stored revision, status or approval)** (recoverable)
  - Detection: migrateHeads throws ConversionUnreadable or ConversionIncomplete from backfillHead or writeMigratedHead
  - Response: repairFlatAmendments lets the error propagate; a head already written without a lifecycle stays as it is
  - User impact: The amendment reads as not approved until the migration is finished; the error names the head and a second run retries it
- **The process stops after the converted heads are written and before the lifecycle migration finishes** (recoverable)
  - Detection: On the next run convertAll finds no flat record, and the migration pass selects amendment heads that still lack a lifecycle or carry legacy fields, so the unfinished heads are found by their state, not by this call's conversion list
  - Response: The migration pass completes them; the ids it migrates are every amendment head in that state
  - User impact: None beyond running the repair again

**Edge cases**

| Input | Expected |
| :--- | :--- |
| An unreadable head whose id is an amendment, build, review or issue id while a Story is being completed | Ignored by the roll-up; the Story completes on its own Tasks and code review |
| An unreadable head of the counted kind that belongs to a different unit | Still blocks, because the parent link of an unreadable head cannot be read; this is the accepted conservative behaviour |
| repairFlatAmendments on a repo with no flat amendment and every amendment head migrated | converted is empty, problems is empty, nothing is written |
| A flat amendment with no approval stamps and status pending or absent | Converted with lifecycle status draft; no approval is invented |
| A flat approved amendment whose approvedBy is missing or not a string | Approved with the legacy actor, exactly as before this Story |
| A flat amendment whose epic has no work item head | Reported in problems; left flat |

**Invariants to preserve**

- A genuinely unreadable Task or Story head still blocks a completion; the strict scan stays strict and the sc4 signature is unchanged [[c2]]
- The amendment store reads approval only from meta.lifecycle and refuses a flat record; the repair gives the heads a lifecycle and does not relax the reader [[c3]]
- The full conversion keeps its order and behaviour: migrateHeads without a filter migrates every head with no lifecycle or with legacy fields, as before, and heads without a string body.approvedBy get the lifecycle they got before [[c4]]

## 5. Test strategy

**Test framework:** `node:test run with tsx (npx tsx --test), the existing artifact-core and convert test kits`

**Test levels**

- **unit** — ac1: a Story or Task completion is not blocked by an unreadable head whose id kind is not the counted kind, and is still blocked by an unreadable head of the counted kind. The tests reach the module-private countedChildren through the exported rollUp with a fake ChildStatusReader.
  - Subjects: `rollUp and the module-private countedChildren in src/workflow/artifact-core/lifecycle.ts`
  - Fixtures: `the fake ChildStatusReader of src/workflow/artifact-core/__tests__/lifecycle-kit.ts returning children and unreadable ids`
- **integration** — ac2: on a repository whose schema marker is at version 2, repairFlatAmendments turns a flat approved amendment into a head that the amendment store reads as approved with the original approval time and the approver's name, a flat not-yet-approved amendment into a draft head, lists a flat amendment it cannot convert and leaves it flat, finishes heads that were converted but not yet migrated, and does nothing on a second run. ac3: the strict child scan still reports a flat amendment head as unreadable while real children are still listed, and the full conversion migrates the same heads as before when no id filter is given.
  - Subjects: `repairFlatAmendments in src/workflow/convert/amendments.ts`, `backfillHead approval actor in src/workflow/convert/backfill.ts`, `migrateHeads with and without an id filter in src/workflow/convert/apply.ts`, `ArtifactStore child scan with a flat AMD head`
  - Fixtures: `a temp repo from legacyRepo() in src/workflow/convert/__tests__/legacy-repo.ts, which builds a schema-version-1 repo, with the version-2 marker written afterwards by writeRepoSchema, plus a flat AMD head and its epic's work item head`, `the store-kit.ts store for the strict scan test`

**Acceptance mapping**

| Criterion | Proving tests |
| :--- | :--- |
| `ac1` | `lifecycle-rollup.test.ts: an unreadable head of another kind does not block a Story roll-up`, `lifecycle-rollup.test.ts: an unreadable head of the counted kind still blocks the roll-up` |
| `ac2` | `convert-amendments.test.ts: repairFlatAmendments makes a flat approved amendment a head the amendment store reads as approved by the original approver`, `convert-amendments.test.ts: repairFlatAmendments makes a flat not-yet-approved amendment a draft head`, `convert-amendments.test.ts: repairFlatAmendments lists a flat amendment it cannot convert and leaves it flat`, `convert-amendments.test.ts: repairFlatAmendments finishes a head that was converted but not migrated`, `convert-amendments.test.ts: repairFlatAmendments on a repo at schema version 2 does nothing the second time` |
| `ac3` | `store-children-strict.test.ts: a flat amendment head is reported unreadable while real children are still listed`, `convert-apply.test.ts: the full conversion migrates the same heads as before with no id filter`, `convert-lifecycle-backfill.test.ts: a head without a string approvedBy gets the same lifecycle as before` |

## 6. Migration

**State before:** Every Story or Task completion in the repo fails because the child scan lists AMD-86197ac660732ceb-1 and -2 as unreadable (flat records with no meta and body) and countedChildren throws on any unreadable head (src/workflow/artifact-core/store.ts:130-161, src/workflow/artifact-core/lifecycle.ts:303-323). The amendment store refuses the two records. The full conversion cannot repair them: it does nothing at schema version 2 (src/workflow/convert/apply.ts:103-115, src/workflow/convert/plan.ts:120-125). The lifecycle migration that a converted head needs is private to apply.ts (src/workflow/convert/apply.ts:84-98), and it stamps the approval with the fixed legacy actor (src/workflow/convert/backfill.ts:39, src/workflow/convert/backfill.ts:73-135), which the amendment store would read as the approver (src/workflow/amendments/store.ts:128-158).

**State after:** countedChildren throws only for an unreadable head of the counted kind, so unrelated unreadable heads do not block completion. The two amendments are heads with a lifecycle (approved, at their original approval time, with a person actor named by the original approvedBy), readable by the amendment store. A tested repair function exists for any future flat amendment on a converted repo.

**Zero downtime:** yes — **Data rewrite:** yes

**Steps**

1. Narrow the roll-up so only unreadable heads of the counted kind block it, keeping the sc4 signature; add the tests for it through rollUp; commit. — ↩ rollbackable
2. Make backfillHead name the approval actor from a non-empty string body.approvedBy on an approved head and keep the legacy actor otherwise; export the lifecycle migration with an optional id filter, leaving the full conversion's call unchanged; add the repair function; add its tests on a temporary repository whose schema marker is written at version 2; commit. — ↩ rollbackable
3. Run the repair through a one-off script (confirmed by the user on 2026-11-04) on a copy of this repository first, and compare the two amendment heads before and after: id, proposal, rationale and approval time unchanged; the approver reads as the original name 'Subho Ghosh (in-chat approval)'; lifecycle added; legacy stamps gone. The copy is the preview, because the repair has no preview mode. — ↩ rollbackable
4. Run the repair on this repository with the same script, commit the two rewritten files so git history holds the flat originals, and confirm that approving a BUILD no longer needs the move-aside workaround. — ↩ rollbackable _(needs: `step 3 comparison shows only the expected differences`)_
5. Record in the BUILD record that the writer of the flat shape after 2026-10-22 is unverified and name the likely cause (an older daemon build handling the amendments). — ↩ rollbackable

**Backward compat:** No public API changes. The store contract, the strict scan result and the sc4 signature are unchanged. migrateHeads gains an optional trailing parameter and the full conversion calls it as before. backfillHead's output changes only for an approved head whose body.approvedBy is a non-empty string, which in this repository means amendments, and only in the name on the approval actor; it affects the full conversion only if it is run again on an unconverted repository. The two amendments keep their ids, proposals and approval times, so references to AMD-86197ac660732ceb-1 and -2 still resolve; their file shape changes from flat to head.

## 7. Alternatives considered

### 7.1 a1: Narrow the roll-up only

The roll-up ignores unreadable heads whose id kind is not the counted kind; the two amendments are left flat.

Inside the sc4 roll-up (countedChildren, reached through rollUp) keep throwing UnreadableChildError only for unreadable ids of the counted kind (TASK or STORY) and for counted children whose status cannot be read; an unreadable head of another kind no longer blocks. The store scan, the sc4 signature and the two flat amendment records are not touched.

**Rejected because:** Stops the failure but leaves the two approved records unreadable.

### 7.2 a2: Narrow the roll-up, repair the amendments and keep their approver — **CHOSEN**

a1 plus a tested repair function; the lifecycle migration takes the approval actor from body.approvedBy when it is a string.

Do a1. Add an exported repairFlatAmendments(repo, deps) in src/workflow/convert that converts flat amendments with the existing flatToHead, writes them, returns the conversion problems, then runs the existing lifecycle migration over every amendment head that has no lifecycle or still carries legacy fields (not only the ones converted in this call, so a crash between the two writes is finished on the next run). Export migrateHeads with an optional id filter for that. Change backfillHead so that, when body.approvedBy is a non-empty string, the lifecycle's approval actor is a person actor named by it instead of the fixed legacy actor; heads without it keep the legacy actor. The repair is run through a one-off script, first on a copy.

### 7.3 a3: Narrow the roll-up and repair the amendments, leaving the approver as the legacy actor

a2 without the backfillHead change; the reader shows the approver as legacy:unknown.

Do a1 and the repair of a2, but leave backfillHead alone. The original approver stays in body.approvedBy but the amendment store reads lifecycle.approval.by first, so it reports the approver as legacy:unknown for these two amendments.

**Rejected because:** Same as a2 without touching backfillHead, at the price of reporting the approver as legacy:unknown.

### 7.4 a4: Repair by a one-off script with its own copy of the migration

a1 plus an untested script that duplicates the conversion and the lifecycle step.

Do a1. For the data, write a script outside the product source that reimplements the conversion and the lifecycle step for the two ids and run it once.

**Rejected because:** Duplicates logic that already exists and is tested.

## 8. References

- **[[c1]]** `code` `src/workflow/artifact-core/store.ts:130-161`
- **[[c2]]** `code` `src/workflow/artifact-core/lifecycle.ts:303-323`
- **[[c3]]** `code` `src/workflow/amendments/store.ts:128-158`
- **[[c4]]** `code` `src/workflow/convert/apply.ts:84-98`
- **[[c5]]** `code` `src/workflow/convert/amendments.ts:27-85`
- **[[c6]]** `prior-artifact` `docs/standalone/stop-flat-amendment-heads-from-blocking-E202611043c0b242f/ISSUE.md`

## 9. Open questions

- countedChildren implements the sc4 lifecycle contract of the approved epic one-common-model-every-artifact (HLD-2f27754d4ad00b8e, owned by that epic's s3), and migrateHeads and applyAmendments belong to its s9. This Story keeps the sc4 signature and changes only which unreadable heads block a completion. Does that narrowing need an amendment to the HLD of that epic, or is recording it in this ISSUE and the BUILD enough? The plan assumes the latter; confirm or ask for the amendment.
