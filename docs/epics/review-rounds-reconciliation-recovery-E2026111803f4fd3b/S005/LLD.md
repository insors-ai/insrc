<!-- insrc:artifact LLD-03f4fd3b9102aab8-s5 -->

# LLD: STORY-03f4fd3b9102aab8-s5 — Per-review-type checkpointing and temp-folder lifecycle make a review resumable and its final result durable

## Summary

**Epic:** `review-rounds-reconciliation-recovery`
**HLD base run:** `wf-1794986545330-2wntv5`
**HLD effective hash:** `6d57abfa68ac...`
**Tracker:** [insors-ai/insrc#215](https://github.com/insors-ai/insrc/issues/215)

This Story adds the review checkpoint record (sc5): a small, independent JSON side-record under each review's own .insrc/tmp/<reviewId>/ folder, written automatically once per completed round or Task so a crash costs at most one unit of rework, plus a final step that copies a completed review's last output into durable storage before its scratch folder is deleted. The round-driver (s1, owned elsewhere) calls these functions; this Story only exposes and proves them.

## Contents

1. [HLD context](#1-hld-context)
2. [Contract details](#2-contract-details)
3. [Data model changes](#3-data-model-changes)
4. [Interaction with shared contracts](#4-interaction-with-shared-contracts)
5. [Error paths](#5-error-paths)
6. [Test strategy](#6-test-strategy)
7. [Alternatives considered](#7-alternatives-considered)
8. [References](#8-references)
9. [Open questions](#9-open-questions)

## 1. HLD context

> See **HLD-03f4fd3b9102aab8** § 2. Framework summary

**Rollout phase:** Phase B — taxonomy, reconciliation, rendering, checkpointing
**Owns:** `sc5` (Review checkpoint record)
**Consumes:** `sc1` (Review-type hook set)

**Adjacent scope (owned by other stories — do NOT implement here):**
- `s1`: The round-driver function itself -- what it does internally to run the grounding+findings, reconciliation, render+present and checkpoint-write cycle -- stays private to s1; no other Story's type depends on the driver's internals, only on the hook contract sc1 exposes. — owns `sc1`
- `s2`: Which exact per-review-type severity scales exist beyond the HIGH/MED default, and how a review type's Feedback implementation declares its own, stay internal to s2; no other Story's type depends on Finding's shape. — owns `sc2`
- `s3`: How the reconciliation LLM call is actually prompted, and how it reads the temp folder's audit trail when needed, stay internal to s3; no other Story's type depends on ReconciliationResult's internals beyond its verdict shape. — owns `sc3`
- `s4`: The exact docgen docType registration and MD rendering logic (including the resolved/still-open/contradicted annotation rule scoped to this round's own corrections) stay internal to s4; no other Story's type depends on the renderer's internals. — owns `sc4`

## 2. Contract details

**Surface level:** internal-shared

### 2.1 `writeCheckpoint`

```typescript
function writeCheckpoint(reviewId: string, lastCompletedUnit: { readonly kind: 'round' | 'task'; readonly ref: number | string }): Promise<void>
```

**Parameters:**
- `reviewId: string` — The review's own identity -- the same literal string already used to name its .insrc/tmp/<reviewId>/ folder in reconciliation.ts and review-report.ts.
- `lastCompletedUnit: { readonly kind: 'round' | 'task'; readonly ref: number | string }` — The unit of work (a round number, or a Task's own reference) that just finished -- supplied by the caller (s1's driver), never derived here, per ac1's per-review-type granularity rule.

**Returns:** `Promise<void>` — Resolves once the checkpoint.json file has been durably written; rejects if the write fails.

**Errors:**
- `Error` when reviewId is not a literal identifier (fails the same path-traversal check reconciliation.ts and review-report.ts already apply).
- `Error` when the reviewed repository cannot be resolved (no registered repo for the request's cwd, and no INSRC_REPO fallback).

**Preconditions:**
- reviewId names an existing (or about-to-exist) .insrc/tmp/<reviewId>/ review directory.

**Postconditions:**
- A ReviewCheckpoint JSON record exists at .insrc/tmp/<reviewId>/checkpoint.json containing exactly {reviewId, lastCompletedUnit}, overwriting any prior checkpoint for the same reviewId.

### 2.2 `readCheckpoint`

```typescript
function readCheckpoint(reviewId: string): Promise<{ readonly reviewId: string; readonly lastCompletedUnit: { readonly kind: 'round' | 'task'; readonly ref: number | string } } | undefined>
```

**Parameters:**
- `reviewId: string` — The review's own identity to look up a prior checkpoint for.

**Returns:** `Promise<ReviewCheckpoint | undefined>` — The last-written ReviewCheckpoint for this reviewId, or undefined when no checkpoint file exists yet (a review that has never completed a unit of work).

**Errors:**
- `Error` when reviewId is not a literal identifier.
- `Error` when the reviewed repository cannot be resolved.

**Postconditions:**
- Never throws merely because no checkpoint exists yet -- that is the defined undefined case (ac2: a fresh review resumes from the start, not an error).

### 2.3 `finalizeAndCleanup`

```typescript
function finalizeAndCleanup(reviewId: string, finalOutput: unknown): Promise<void>
```

**Parameters:**
- `reviewId: string` — The review's own identity, naming both the .insrc/tmp/<reviewId>/ folder to delete and the durable artifact location to copy into.
- `finalOutput: unknown` — The final round's own review-output JSON (the caller's self-contained finding/reconciliation result for its last round) to persist durably before the scratch folder is gone.

**Returns:** `Promise<void>` — Resolves once the durable copy has been written AND the .insrc/tmp/<reviewId>/ folder has been deleted, in that order.

**Errors:**
- `Error` when reviewId is not a literal identifier.
- `Error` when the reviewed repository cannot be resolved.
- `Error` when the durable copy write fails -- the temp folder is NOT deleted in this case, preserving k7's ordering invariant.

**Preconditions:**
- The review has reached a terminal state (the caller decides this; this function does not itself judge terminality).

**Postconditions:**
- finalOutput is durably persisted before .insrc/tmp/<reviewId>/ is deleted, never the reverse order, matching k7 exactly.
- A deletion failure (e.g. a concurrent process holding a file open) still leaves the durable copy intact, since the copy already completed first.

## 3. Data model changes

### 3.1 `ReviewCheckpoint` — new

New interface {readonly reviewId: string; readonly lastCompletedUnit: {readonly kind: 'round' | 'task'; readonly ref: number | string}}, exactly sc5's HLD interfaceSketch. Serialized verbatim as .insrc/tmp/<reviewId>/checkpoint.json. No existing type is modified; this is new capability only.

**Call sites:**
- `src/workflow/review-round/types.ts:19-24`

## 4. Interaction with shared contracts

| Contract | Role | How |
| :--- | :--- | :--- |
| `sc5` | implements | This Story's ReviewCheckpoint interface and writeCheckpoint/readCheckpoint/finalizeAndCleanup functions are the entire implementation of sc5 -- the generic review checkpoint JSON side-record and .insrc/tmp/<reviewId>/ folder lifecycle (k1/k7/k8/lc4). |
| `sc1` | consumes | lastCompletedUnit.kind is supplied by the caller from RoundDriverHooks.checkpointGranularity ('round' \| 'task'); this Story never reads or re-derives checkpointGranularity itself, only accepts whatever kind the caller (s1's driver) passes in. |

## 5. Error paths

**Error cases**

- **reviewId contains a path-traversal segment (e.g. '../../../private')** (recoverable)
  - Detection: A literal-identifier regex check (the same pattern reconciliation.ts's requireValidReviewId and review-report.ts's requireValidReviewId already apply) run first, before any path join or filesystem access.
  - Response: Throws a plain Error naming the invalid reviewId, before any directory is touched.
  - User impact: The call fails fast with a clear message instead of silently joining an unsafe path.
- **The reviewed repository cannot be resolved (no registered repo for the request's cwd, and no INSRC_REPO fallback)** (recoverable)
  - Detection: resolveRepoPath(undefined) returns undefined, exactly as reconciliation.ts's and review-report.ts's own defaultResolveRepoRoot already detect.
  - Response: Throws a plain Error naming the resolution failure, before any filesystem access.
  - User impact: The call fails fast rather than silently defaulting to the daemon process's own cwd.
- **An existing path segment between the repo root and the checkpoint file (the reviewId directory, .insrc/tmp itself, or the checkpoint.json leaf) is a symlink -- whether planted maliciously or substituted by a race after an earlier check** (recoverable)
  - Detection: A requireNoSymlinkInPath-style walk (reusing review-report.ts's own lstatSync-based, dangling-symlink-safe helper verbatim) runs immediately before every write.
  - Response: Throws an Error naming the symlinked segment; refuses to write through it.
  - User impact: A checkpoint write can never be redirected outside the repository or truncate an unrelated file via a symlinked review directory or checkpoint file.
- **writeCheckpoint's own write is interrupted mid-write (process killed, disk full) between opening the file and completing the write** (recoverable)
  - Detection: Not detected at write time -- prevented structurally: writeCheckpoint publishes through the same guarded temp-file-then-rename primitive review-report.ts's P2 fix established (publishGuarded), so an observer can only ever see the complete prior checkpoint or the complete new one, never a partially-written file.
  - Response: No special handling needed at the write site; the rename is atomic.
  - User impact: A crash during a checkpoint write can never leave behind a checkpoint that reads back as corrupted, preserving ac2's 'at most one unit of rework' guarantee.
- **readCheckpoint finds a checkpoint.json file that is not valid JSON, or is valid JSON but does not match ReviewCheckpoint's shape (e.g. truncated by something outside this Story's own write path, or disk-level corruption)** (recoverable)
  - Detection: JSON.parse throws, or the parsed value fails a minimal shape check (reviewId is a string, lastCompletedUnit.kind is 'round' or 'task').
  - Response: Treated identically to a missing checkpoint: readCheckpoint resolves to undefined rather than throwing or returning unvalidated data, so a review can always still resume (from the start, in the worst case) rather than being permanently stuck on an unreadable checkpoint.
  - User impact: A corrupted checkpoint costs at most a full restart of the review, never a hard failure that blocks resumption entirely -- consistent with ac2's crash-safety intent even in this worse-than-expected case.
- **finalizeAndCleanup's durable copy write fails (disk full, permission denied, symlink refusal) partway through** (recoverable)
  - Detection: The write call itself throws or rejects.
  - Response: Propagates the error unchanged; the .insrc/tmp/<reviewId>/ deletion step is never reached.
  - User impact: A review whose final output could not be durably copied keeps its scratch folder intact rather than losing the only copy of its result -- k7's ordering is preserved even on failure.
- **finalizeAndCleanup's deletion step encounters a symlinked .insrc/tmp/<reviewId>/ directory (the exact leaf path itself redirected elsewhere)** (recoverable)
  - Detection: The same requireNoSymlinkInPath-style walk (lstat-based, never following) runs immediately before the recursive delete, exactly as before the write.
  - Response: Throws an Error naming the symlink; refuses to delete through it (never follows a symlinked directory into a deletion that could remove unrelated real files elsewhere).
  - User impact: A symlinked scratch folder can never cause finalizeAndCleanup to delete something outside the review's own .insrc/tmp/<reviewId>/ location.

**Edge cases**

| Input | Expected |
| :--- | :--- |
| readCheckpoint called for a reviewId that has never had writeCheckpoint called (a brand-new review, or one whose .insrc/tmp/<reviewId>/ directory does not exist at all) | Resolves to undefined, not an error -- the caller (s1's driver) starts from round 1 / the first Task. |
| finalizeAndCleanup called a second time for a reviewId whose .insrc/tmp/<reviewId>/ folder was already deleted by an earlier successful call (e.g. a retried completion after a crash between the durable copy and the deletion) | The durable copy write re-runs (idempotent overwrite of the same durable location with the same finalOutput) and the deletion step is a no-op when the folder no longer exists, rather than throwing -- mirrors the force:true convention this codebase's own tests already use for .insrc/tmp cleanup. |
| finalizeAndCleanup called when checkpoint.json was never written at all (e.g. a single-round design review that completed its only round without ever crashing, so no intermediate checkpoint was needed) | Succeeds regardless -- finalizeAndCleanup deletes whatever the .insrc/tmp/<reviewId>/ folder currently contains (checkpoint.json, round outputs, rendered reports) as a whole; it does not require a checkpoint to have existed. |
| writeCheckpoint called repeatedly for the same reviewId as successive rounds/Tasks complete | Each call overwrites the prior checkpoint.json with the new lastCompletedUnit -- only the single most recent checkpoint is ever kept, never a growing history. |

**Invariants to preserve**

- Checkpoint granularity is defined per review type (round-level for design review, per-Task for code review), never re-derived inside this Story's own functions -- the caller always supplies lastCompletedUnit.kind. [[c1]]
- Checkpoint write/read is automatic and internal to the review process, never an agent-driven step. [[c1]]
- The .insrc/tmp/<reviewId>/ temp folder is deleted only after the final round's review-output JSON is copied into durable artifact storage, never before. [[c1]]
- reviewId is one identity: the same string names both the .insrc/tmp/<reviewId>/ folder and the reviewId field inside the checkpoint record itself, so a resume can recover the id from the checkpoint artifact's own content. [[c1]]

## 6. Test strategy

**Test framework:** `node:test (matching this module's existing *.test.ts convention: driver.test.ts, reconciliation.test.ts, review-report.test.ts)`

**Test levels**

- **unit** — Prove writeCheckpoint/readCheckpoint/finalizeAndCleanup each in isolation, with the repo-resolution and durable-copy steps injected via a test-deps seam matching reconciliation.ts's and review-report.ts's own _set*DepsForTests convention, over disposable .insrc/tmp/<reviewId>/ fixture directories.
  - Subjects: `writeCheckpoint writes a ReviewCheckpoint JSON record to .insrc/tmp/<reviewId>/checkpoint.json containing exactly {reviewId, lastCompletedUnit}, overwriting any prior checkpoint for the same reviewId`, `readCheckpoint resolves to undefined when no checkpoint file exists yet for a reviewId, rather than throwing`, `readCheckpoint resolves to the last-written ReviewCheckpoint after writeCheckpoint has been called, so a resumed review can continue from lastCompletedUnit rather than re-running completed units`, `readCheckpoint's own reviewId field, read back from the checkpoint record, is exactly the identity k8 requires -- the same string as both the temp folder name and the record's own content`, `finalizeAndCleanup copies finalOutput into durable artifact storage before deleting the .insrc/tmp/<reviewId>/ folder, in that order`, `if finalizeAndCleanup's durable copy write fails, the .insrc/tmp/<reviewId>/ folder is not deleted`, `finalizeAndCleanup is idempotent: calling it a second time for a reviewId whose temp folder was already deleted by an earlier successful call succeeds without error`, `writeCheckpoint called repeatedly for the same reviewId overwrites the prior checkpoint rather than accumulating a history`, `a reviewId containing a path-traversal segment is rejected before any filesystem access, for writeCheckpoint, readCheckpoint, and finalizeAndCleanup alike`, `when the reviewed repository cannot be resolved, writeCheckpoint/readCheckpoint/finalizeAndCleanup reject rather than silently defaulting to the daemon process's own cwd`, `a symlinked review directory or checkpoint file is never written through by writeCheckpoint, even outside .insrc/tmp`, `a symlinked .insrc/tmp/<reviewId>/ directory is never deleted through by finalizeAndCleanup`, `a checkpoint.json file that is not valid JSON, or does not match ReviewCheckpoint's shape, is treated by readCheckpoint as though no checkpoint exists, rather than throwing or returning unvalidated data`, `finalizeAndCleanup succeeds even when checkpoint.json was never written at all, deleting whatever the .insrc/tmp/<reviewId>/ folder currently contains as a whole`
  - Fixtures: `A disposable .insrc/tmp/<reviewId>/ directory per test, cleaned up in a finally block (mirroring reconciliation.test.ts/review-report.test.ts).`, `An injectable resolveRepoRoot test double returning a fixed ROOT.`, `An injectable durable-copy-destination test double so finalizeAndCleanup's durable write can be observed/forced-to-fail without touching real artifact storage.`

**Acceptance mapping**

| Criterion | Proving tests |
| :--- | :--- |
| `ac1` | `writeCheckpoint writes a ReviewCheckpoint JSON record to .insrc/tmp/<reviewId>/checkpoint.json containing exactly {reviewId, lastCompletedUnit}, overwriting any prior checkpoint for the same reviewId` |
| `ac2` | `readCheckpoint resolves to undefined when no checkpoint file exists yet for a reviewId, rather than throwing`, `readCheckpoint resolves to the last-written ReviewCheckpoint after writeCheckpoint has been called, so a resumed review can continue from lastCompletedUnit rather than re-running completed units` |
| `ac3` | `finalizeAndCleanup copies finalOutput into durable artifact storage before deleting the .insrc/tmp/<reviewId>/ folder, in that order`, `if finalizeAndCleanup's durable copy write fails, the .insrc/tmp/<reviewId>/ folder is not deleted` |
| `ac4` | `readCheckpoint resolves to the last-written ReviewCheckpoint after writeCheckpoint has been called, so a resumed review can continue from lastCompletedUnit rather than re-running completed units`, `readCheckpoint's own reviewId field, read back from the checkpoint record, is exactly the identity k8 requires -- the same string as both the temp folder name and the record's own content` |

## 7. Alternatives considered

### 7.1 a1: Standalone checkpoint module: three exported functions over a flat JSON side-record — **CHOSEN**

writeCheckpoint / readCheckpoint / finalizeAndCleanup in a new checkpoint.ts, exactly matching sc5's interfaceSketch and lc4's 'independent JSON side-record' requirement.

Add src/workflow/review-round/checkpoint.ts exporting: `writeCheckpoint(reviewId, lastCompletedUnit)` -- writes `.insrc/tmp/<reviewId>/checkpoint.json` containing exactly `ReviewCheckpoint` (`{reviewId, lastCompletedUnit: {kind, ref}}`), overwriting any prior checkpoint for the same reviewId (ac1, no agent-driven step -- s1's driver calls this once per completed round/Task). `readCheckpoint(reviewId)` -- reads it back, returning `undefined` when no checkpoint file exists yet (a fresh review), so a caller (s1's driver, on resume) knows whether to start from round 1 or from `lastCompletedUnit`'s own next unit (ac2, ac4). `finalizeAndCleanup(reviewId, finalOutput)` -- copies the final round's review-output JSON into the review's durable artifact storage location, THEN deletes the `.insrc/tmp/<reviewId>/` folder (ac3), reusing review-report.ts's and reconciliation.ts's own established symlink-safety pattern (lstat-based containment checks before any write or recursive delete, since an attacker-substituted symlink at any of these three operations -- checkpoint write, durable copy, or folder deletion -- could redirect outside the repo or delete/overwrite an unrelated path). reviewId is the sole identity (ac4): every function takes it as a bare string, exactly as runReviewRound already does, with no ReviewContext struct involved (per s1's own analyzeBundles finding -- no such type exists).

### 7.2 a2: Fold checkpoint read/write into the round-driver's own call signature

Instead of standalone functions, give runReviewRound itself new checkpoint-aware parameters/return fields, so the driver reads/writes checkpoints inline.

Extend runReviewRound's own signature (or an internal helper inside driver.ts) to read a prior checkpoint before the round loop starts and write one after each unit completes, folding sc5's logic directly into s1's driver rather than exposing it as a separate consumable module.

**Rejected because:** Violates sc1's HLD boundary by requiring edits to s1's privately-owned driver.ts internals, and blurs sc5's own separable, independently testable ownership (lc4).

### 7.3 a3: Generic reusable 'scratch side-record' abstraction

A generalized, typed key-value side-record utility under .insrc/tmp/<id>/, with ReviewCheckpoint as its first consumer, anticipating future side-records other Stories might want.

Build a generic `SideRecord<T>` abstraction (read/write/finalize-and-cleanup parameterized over any JSON-serializable T and any id), then define ReviewCheckpoint as one instantiation of it, so any future Story needing a similar durable-scratch-record pattern reuses the same primitive.

**Rejected because:** Technically satisfies every constraint but adds a generic SideRecord<T> abstraction no other Story or contract in this Epic's HLD asks for -- unrequested generalization at higher cost than a1 for no measurable benefit.

## 8. References

- **[[c1]]** `code` `src/workflow/review-round/types.ts:19-24`
- **[[c2]]** `code` `src/workflow/review-round/driver.ts:24-36`
- **[[c3]]** `code` `src/workflow/review-round/reconciliation.ts:106`
- **[[c4]]** `code` `src/workflow/review-round/review-report.ts:102`
- **[[c5]]** `code` `src/workflow/artifact-core/types.ts:364`

## 9. Open questions

- ep3 (partial): invariantsToPreserve cite Epic constraint source 'c1' rather than an s1 analyze-bundle entity, since this Story is entirely new capability with no current-code invariant to analyze -- the Epic's own k1/k6/k7/k8 constraints are the only available grounding. Flagged for completeness; not considered blocking since no current-behaviour invariant exists to cite instead.
- Integration gap (non-blocking, HLD-aligned): this LLD exposes writeCheckpoint/readCheckpoint/finalizeAndCleanup and proves them in isolation, but wiring them into s1's own round-driver cycle (calling writeCheckpoint after each completed unit, readCheckpoint before starting a resumed review, and finalizeAndCleanup at a terminal state) is s1's own adjacent-boundary responsibility, not built here.

## Resolved questions

- `qefc9984a` — ep3 (partial): invariantsToPreserve cite Epic constraint source 'c1' rather than an s1 analyze-bundle entity, since this Story is entirely new capability with no current-code invariant to analyze -- the Epic's own k1/k6/k7/k8 constraints are the only available grounding. Flagged for completeness; not considered blocking since no current-behaviour invariant exists to cite instead.
  - **resolved**: Retain Epic grounding — Preserves the available evidence (Epic constraints k1/k6/k7/k8 via c1) and clarifies its provenance as upstream design grounding rather than existing-code analysis, since this Story is entirely new capability with no current-behaviour invariant to cite instead. _(2026-11-21T08:03:50.464Z)_
- `qdc3aa50e` — Integration gap (non-blocking, HLD-aligned): this LLD exposes writeCheckpoint/readCheckpoint/finalizeAndCleanup and proves them in isolation, but wiring them into s1's own round-driver cycle (calling writeCheckpoint after each completed unit, readCheckpoint before starting a resumed review, and finalizeAndCleanup at a terminal state) is s1's own adjacent-boundary responsibility, not built here.
  - **resolved**: Add an explicit integration contract — Preserves the HLD-aligned s5/s1 ownership boundary (s5 stays independently testable, consuming only sc1) while documenting the three required call sites (write after each completed unit, read before a resumed review, finalize at a terminal state) as an explicit, verifiable integration contract for s1's own plan to pick up -- rather than silently expanding s5's scope into s1's adjacent boundary. _(2026-11-21T08:04:14.510Z)_

## Citations

- **[[c1]]** `code` `src/workflow/review-round/types.ts:19-24`
- **[[c2]]** `code` `src/workflow/review-round/driver.ts:24-36`
- **[[c3]]** `code` `src/workflow/review-round/reconciliation.ts:106`
- **[[c4]]** `code` `src/workflow/review-round/review-report.ts:102`
- **[[c5]]** `code` `src/workflow/artifact-core/types.ts:364`
