<!-- insrc:artifact LLD-7e0f65fc1a518722-s1 -->

# LLD: STORY-7e0f65fc1a518722-s1

## Summary

**Epic:** `keep-artifact-log-step-raw-content`
**HLD base run:** `wf-1793687550721-3iahoq`
**HLD effective hash:** `cc7b166644d5...`

When a raw writer changes the content of a head that already has history, the head ends one revision past its log and the lifecycle service refuses to approve, review or complete it. The service now recognises that state when it checks integrity: if the head's own hash holds and its content differs from the last logged revision, it logs the head's revision as an update by the system actor, marked as an adopted raw write, in the same queue slot, and then runs the operation. A hand-edited revision number, a hash mismatch and a log ahead of the head are still refused. No writer changes.

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

### 2.1 `LifecycleService.apply`

```typescript
apply(id: string, op: Operation, by: Actor, detail?: TransitionDetail, ctx?: EvidenceContext): Promise<ApplyResult>
```

**Parameters:**
- `id: string` — The artifact whose lifecycle operation is applied
- `op: Operation` — For approve, review and complete the integrity of the head against its log is checked first
- `by: Actor` — The actor of the operation; an adopted entry is by the system actor, not by this one

**Returns:** `Promise<ApplyResult>` — Unchanged

**Errors:**
- `LifecycleConflictError` when thrown with reason hash-mismatch, log-ahead-of-head, or head-ahead-of-log when the head's content hash equals the last logged revision's (a changed number alone); nothing is written or logged

**Preconditions:**
- For approve, review and complete the head has its own hash intact (checkHeadIntegrity is ok)

**Postconditions:**
- When the head was ahead of the log with changed content, the log ends with an 'update' entry for the head's revision and hash by insrc:system, with outcome result 'adopted', appended before the operation's own entry and under the same per-artifact queue slot
- After the adoption the integrity check passes and the operation proceeds as for any head in step
- A head in step, an unlogged head and every refusal leave the log exactly as before (no entry is added)

### 2.2 `checkIntegrity`

```typescript
checkIntegrity(a: ContentView, log: ChangeLogEntry | readonly ChangeLogEntry[] | undefined): Integrity
```

**Parameters:**
- `a: ContentView` — The head's description, payload and lifecycle
- `log: ChangeLogEntry | readonly ChangeLogEntry[] | undefined` — The log, or the entry to compare with

**Returns:** `Integrity` — Unchanged: it still answers head-ahead-of-log for a head later than the log; the decision to adopt is the caller's

**Postconditions:**
- Unchanged for every input; the service calls it again with the adopted entry appended

### 2.3 `History.appendLog`

```typescript
appendLog(id: string, e: ChangeLogEntry): Promise<void>
```

**Parameters:**
- `id: string` — The artifact id
- `e: ChangeLogEntry` — The adopted 'update' entry

**Returns:** `Promise<void>` — Consumed as it is

**Errors:**
- `HistoryEntryError` when the entry is malformed

**Preconditions:**
- The caller holds the artifact's queue, so no store write interleaves

**Postconditions:**
- The entry is the last revision-bearing entry of the log

## 3. Data model changes

### 3.1 `ChangeLogEntry (an adopted raw write)` — invariant-change

A new use of the existing entry shape, no new field: operation 'update', actor insrc:system (kind system), revision {number, contentHash} copied from the head, outcome {result: 'adopted', summary: 'a content change written outside the store was logged when the head was approved, reviewed or completed'}, no status change. The entry's timestamp is the time of the adoption, not the time of the raw write. It is appended only when the head is later than the last revision-bearing entry, its stored hash matches its own content, and its content hash differs from that entry's.

**Call sites:**
- `src/workflow/artifact-core/lifecycle-service.ts`
- `src/workflow/artifact-core/types.ts`
- `src/workflow/artifact-core/history.ts`

### 3.2 `Integrity rule for approve, review and complete` — invariant-change

head-ahead-of-log is no longer final for a head with changed content and an intact hash: the service logs it and re-checks. It stays final for a head whose number is ahead but whose content hash equals the last logged one, and hash-mismatch and log-ahead-of-head are unchanged. The check function itself does not change.

**Call sites:**
- `src/workflow/artifact-core/lifecycle.ts`
- `src/workflow/artifact-core/lifecycle-service.ts`
- `src/workflow/artifact-core/__tests__/lifecycle-service.test.ts`
- `src/daemon/__tests__/lifecycle-wiring.test.ts`

## 4. Error paths

**Error cases**

- **The revision number of a head was edited by hand and its content did not change** (recoverable)
  - Detection: In LifecycleService.apply the head's content hash equals the content hash of the last revision-bearing log entry while its number is higher (checkIntegrity answers head-ahead-of-log)
  - Response: LifecycleConflictError head-ahead-of-log as before; nothing is written or logged
  - User impact: A person has to resolve it; the head is not approved
- **The body of a head was edited by hand without recomputing the stored hash** (recoverable)
  - Detection: checkHeadIntegrity: the stored contentHash differs from the hash of the head's own content
  - Response: LifecycleConflictError hash-mismatch before any adoption is considered; nothing is written or logged
  - User impact: A person has to resolve it
- **The log is ahead of the head (a merge brought in a later revision)** (recoverable)
  - Detection: checkIntegrity: the head's revision number is below the last logged one
  - Response: LifecycleConflictError log-ahead-of-head as before; no adoption
  - User impact: A conflict-resolved write is needed
- **The adopted entry cannot be appended (the sidecar write fails, or the entry is malformed)** (recoverable)
  - Detection: History.appendLog throws inside the store.updateAndLog callback
  - Response: The error is thrown out of apply; the head is not written and the operation is not applied; the log keeps whatever the failed append left (an append is one record)
  - User impact: The operation fails and can be retried; the next attempt finds the head still ahead of the log and adopts again
- **A raw writer changes the head again between the adoption and the operation** (recoverable)
  - Detection: None needed: adoption and the operation run under the artifact's one queue slot in store.updateAndLog, and a raw write that lands before or after is seen by the next call as a head ahead of the log again
  - Response: The later raw write is adopted by the next approve, review or complete; the operation that ran judged the content it read
  - User impact: A draft changed after a review is not covered by it: the revision moves, so the review is stale

**Edge cases**

| Input | Expected |
| :--- | :--- |
| A head with no revision-bearing log entry (never approved or reviewed) | No history, so checkIntegrity passes and nothing is adopted or logged, as before |
| Two raw content writes in a row on a head with history (revisions 2 and 3, log at 1) | One adopted entry at revision 3 and its hash; revision 2 is not logged, and the integrity check passes afterwards |
| A raw write changes the content and a second raw write restores the logged content, so the head is at revision 3 with the revision-1 hash | The content hash equals the last logged one, so it is not adopted and head-ahead-of-log is refused; a person resolves it |
| A head is approved after adoption | The log ends with the adopted update at the head's revision followed by the approve at the same revision; the next integrity check finds head and log equal |
| A complete on a unit whose members are checked | Each member is checked the same way where the service checks it (lifecycle-service.ts line 260 path); a member with a raw write is adopted under its own queue slot, or refused for the other reasons |
| apply of an operation that is not approve, review or complete | No integrity check, so no adoption; such operations run as before |

**Invariants to preserve**

- A head whose stored hash does not match its content is never approved, reviewed or completed (hash-mismatch is refused before any adoption) [[c2]]
- A log ahead of the head (log-ahead-of-head) is refused [[c2]]
- A refused operation writes nothing and logs nothing [[c4]]
- A head with no revision-bearing log entry is approved normally [[c2]]
- A content change by a raw writer still returns the head to draft and keeps its Signoff entries; nothing in storage.ts changes [[c1]]
- ArtifactStore.write still tolerates head-ahead-of-log on an ordinary write and refuses the other integrity reasons [[c3]]

## 5. Test strategy

**Test framework:** `node:test with tsx (npx tsx --test), tests in src/workflow/artifact-core/__tests__ using the store-kit and lifecycle-kit fixtures (kit, artifact, service, stubEvidence), and src/daemon/__tests__/lifecycle-wiring.test.ts for the daemon path`

**Test levels**

- **unit** — The adoption rule of LifecycleService.apply: when it adopts, when it refuses, what it logs
  - Subjects: `a head that a raw writeArtifact content change moved one revision past its log is approved: the log ends with an update by insrc:system with outcome result adopted at the head's revision and hash, followed by the approve at the same revision, and the head is approved`, `the same head is reviewed and then completed through apply with the same adoption, one adopted entry per raw write`, `a head whose number alone was raised by hand (content hash equal to the last logged one) is refused with head-ahead-of-log and nothing is written or logged`, `a hash-mismatch head and a log-ahead-of-head head are refused as before, with no adopted entry`, `a head with no revision-bearing log entry is approved with no adopted entry`, `two raw content writes in a row are adopted as one entry at the last revision`, `a raw write that restores the logged content (revision 3, the revision-1 hash) is refused, not adopted`, `an adopted entry whose append fails (a History that throws) fails the operation, writes no head and leaves the next attempt able to adopt`
  - Fixtures: `kit() with a store and a sidecar`, `service() with stubEvidence([])`, `a raw writeArtifact content change on a head written by ArtifactStore.write`, `a History wrapper that throws on the first appendLog`
- **integration** — A real content change on a head with history, through the daemon's approve path and the review path
  - Subjects: `lifecycle-wiring: an approved artifact is redrafted by a raw content write and approved again through the daemon approve handler; the approval succeeds and the log holds the adopted entry`, `a redraft by the design-run writer (synthesize writes the head with writeArtifact content) on an approved LLD, then insrc approval of the new draft, ends approved at the new revision`, `the review-decision step reviews a redrafted head: the review is recorded at the new revision (no head-ahead-of-log)`
  - Fixtures: `the lifecycle-wiring daemon fixture with a registered temporary repository`
- **contract** — The existing refusals keep their tests
  - Subjects: `lifecycle-service.test.ts keeps its head-ahead-of-log case for a hand-edited number, and its hash-mismatch and log-ahead-of-head cases, unchanged`

**Acceptance mapping**

| Criterion | Proving tests |
| :--- | :--- |
| `ac1` | `a head moved past its log by a raw content write is approved, reviewed and completed with one adopted entry, then the operation's own entry (unit)`, `an approved artifact redrafted by a raw write is approved again through the daemon approve handler (integration)` |
| `ac2` | `a hand-edited number is refused with nothing written (unit)`, `hash-mismatch and log-ahead-of-head are refused as before with no adopted entry (unit)`, `a raw write that restores the logged content is refused (unit)`, `lifecycle-service.test.ts keeps its integrity cases unchanged (contract)` |
| `ac3` | `the adoption is in LifecycleService.apply, so it holds for whichever raw writer moved the head: a redraft by the design-run writer, and a resolve-comment revise (integration)` |
| `ac4` | `a real content change on a head with existing history is approved and reviewed through the service (unit and integration)`, `an adopted entry that cannot be appended fails the operation and leaves the next attempt able to adopt (unit)` |

## 6. Migration

**State before:** A raw content write (writeArtifact kind content, src/workflow/storage.ts) on a head that already has a revision-bearing log entry moves the head one revision past its log; checkIntegrity (src/workflow/artifact-core/lifecycle.ts) answers head-ahead-of-log and LifecycleService.apply (src/workflow/artifact-core/lifecycle-service.ts) refuses to approve, review or complete it and writes nothing, as reproduced on 2026-11-02. ArtifactStore.write tolerates the state on an ordinary write (src/workflow/artifact-core/store.ts).

**State after:** LifecycleService.apply, for approve, review and complete, first logs a head that is ahead of its log with intact hash and changed content as an update by insrc:system with outcome adopted, in the same queue slot, and then applies the operation as for a head in step. The refusals for a hand-edited number, a hash mismatch and a log ahead of the head are unchanged. No writer and no stored head changes.

**Zero downtime:** yes — **Data rewrite:** no

**Steps**

1. Add the adoption step to LifecycleService.apply before the integrity refusal: when checkIntegrity answers head-ahead-of-log, the head's own hash holds and its content hash differs from the last revision-bearing entry, append the adopted update through the store's history and check again — ↩ rollbackable
2. Add the tests: a raw write on a head with history approved, reviewed and completed; the refusals that must stay; the failing append; the daemon approve path — ↩ rollbackable
3. Record the decision and the limit (the adopted entry carries the time and actor of the adoption) in docs/plans/core-data-model.md item 3 and docs/plans/team-workflow.md, and update the write inventory note of the raw content writers — ↩ rollbackable

**Backward compat:** No stored data changes and no API signature changes. A head that was refused before with head-ahead-of-log and a real content change is now approved, reviewed or completed; that is the fix. Heads already stuck in that state are adopted the next time they are approved, reviewed or completed, with an adopted entry dated at that time. A log with adopted entries is read by the same code, since the entry uses the existing update operation and outcome fields.

## 7. Alternatives considered

### 7.1 a1: The service adopts a raw content write when it judges integrity — **CHOSEN**

LifecycleService.apply, finding a head ahead of its log whose own hash holds and whose content differs from the last logged revision, first logs that revision as an update by a system actor, then runs the operation.

In LifecycleService.apply, inside the store.updateAndLog callback that already runs checkIntegrity for approve, review and complete, a head-ahead-of-log result is no longer final. When the head's stored hash matches its own content (checkHeadIntegrity is ok) and the head's content hash differs from the content hash of the last revision-bearing log entry, the head is a raw content write that was never logged: the service appends an 'update' entry at the head's revision, hash and time, by the system actor, with an outcome saying a raw write was adopted, in the same queue slot, and then checks the operation as before. A head whose number is ahead but whose content hash equals the logged one (a hand edit of the number), a hash-mismatch and a log-ahead-of-head stay refused. No writer changes.

### 7.2 a2: Move every raw content writer onto the store

Replace writeArtifact kind 'content' at each caller with ArtifactStore.write, which logs the revision as it writes.

Each raw content writer (synthesize, the workflow rpc, the gates, resolve-comment, the tracker unit head, the two build ledger writers) obtains the repository's ArtifactStore and calls its async write with an actor, so the head and the log move together under the store's queue and journal. writeArtifact keeps only the meta-only kind. The callers that are synchronous become async.

**Rejected because:** The log is exact, but it changes many synchronous callers and needs a store where there is none; a large change across modules for one symptom.

### 7.3 a3: writeArtifact appends the log entry itself

writeArtifact, after a content write that mints a revision on a head with history, appends a revision-bearing entry to the sidecar from the path.

writeArtifact derives the repository root and the sidecar from the artifact path and appends an 'update' entry for the new revision through a synchronous variant of the history append, so no caller changes.

**Rejected because:** Bypasses the store's queue and journal and needs a synchronous history surface; it risks creating the opposite conflict.

### 7.4 a4: Raw writers call an adopt step after writing

A new ArtifactStore method logs the head's current revision as an update; each raw content writer that runs where a store exists calls it after writeArtifact.

ArtifactStore gains an adopt(id, actor) that, under the queue, appends an 'update' entry for the head's current revision when the head is ahead of the log with its own hash intact. The daemon-side raw writers (synthesize, the workflow rpc, resolve-comment) call it right after writeArtifact; the library-only writers are left, which still leaves them able to produce the state.

**Rejected because:** Better timing than a1 but depends on every writer remembering a call, and leaves the library writers uncovered.

## 8. References

- **[[c1]]** `code` `src/workflow/storage.ts`
- **[[c2]]** `code` `src/workflow/artifact-core/lifecycle.ts`
- **[[c3]]** `code` `src/workflow/artifact-core/store.ts`
- **[[c4]]** `code` `src/workflow/artifact-core/lifecycle-service.ts`
- **[[c5]]** `doc` `docs/plans/core-data-model.md`
- **[[c6]]** `code` `src/workflow/artifact-core/__tests__/lifecycle-service.test.ts`

## 9. Open questions

- src/workflow/artifact-core/types.ts is listed as a call site of the adopted ChangeLogEntry but was not cited in an s1 analyze bundle; confirm it when building.
- The Story carries no formal acceptance criteria: ac1 to ac4 and the constraints that the alternatives were scored against are derived from the approved issue's fix intent.
- The adopted entry carries the time and actor (insrc:system) of the adoption, not of the raw write; confirm that this is acceptable for the history, or have the raw writers log at write time in a later change.

## Resolved questions

- `q9081541a` — src/workflow/artifact-core/types.ts is listed as a call site of the adopted ChangeLogEntry but was not cited in an s1 analyze bundle; confirm it when building.
  - **resolved**: Verify now via targeted grep/Read — Checked: src/workflow/artifact-core/types.ts defines ChangeLogEntry (line 58) with a free-text outcome.result, so the adopted entry needs no type change; types.ts is a reference, not a file to edit. _(2026-11-03T07:14:14.107Z)_
- `q3845a9c6` — The Story carries no formal acceptance criteria: ac1 to ac4 and the constraints that the alternatives were scored against are derived from the approved issue's fix intent.
  - **resolved**: Adopt issue-derived ACs as-is — ac1 to ac4 come from the approved ISSUE-7e0f65fc1a518722 fix intent; the PLAN cites it. _(2026-11-03T07:15:05.768Z)_
- `q8179f5a1` — The adopted entry carries the time and actor (insrc:system) of the adoption, not of the raw write; confirm that this is acceptable for the history, or have the raw writers log at write time in a later change.
  - **resolved**: Accept as designed — The LLD you approved states that the adopted entry carries the adoption time and insrc:system; it is recorded in the entry's outcome. Logging at write time stays a possible later change, not tracked here. _(2026-11-03T07:15:38.832Z)_

## Citations

- **[[c1]]** `code` `src/workflow/storage.ts`
- **[[c2]]** `code` `src/workflow/artifact-core/lifecycle.ts`
- **[[c3]]** `code` `src/workflow/artifact-core/store.ts`
- **[[c4]]** `code` `src/workflow/artifact-core/lifecycle-service.ts`
- **[[c5]]** `doc` `docs/plans/core-data-model.md`
- **[[c6]]** `code` `src/workflow/artifact-core/__tests__/lifecycle-service.test.ts`
