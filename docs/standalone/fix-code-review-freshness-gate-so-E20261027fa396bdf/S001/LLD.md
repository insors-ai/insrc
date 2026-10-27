<!-- insrc:artifact LLD-fa396bdf197b8e8b-s1 -->

# LLD: STORY-fa396bdf197b8e8b-s1

## Summary

**Epic:** `fix-code-review-freshness-gate-so`
**HLD base run:** `wf-1793081987457-d5ktxu`
**HLD effective hash:** `7cc15a874e91...`

A changed file the index holds is brought up to date without a full reindex. A file that no longer exists is never stale. A file the index would never hold (an unsupported type, a lock file, a generated file or a path on the ignore list) is not stale. Any other stale changed file, whether it was never indexed or was indexed before a later edit the watcher missed, is queued once for indexing by the daemon's freshness handler, so a later poll of the gate finds it fresh. A file that cannot be indexed is never declared fresh: it stays stale until the existing freshness time-out sends the review to the degraded diff review. The review-session timeout seen on 2026-10-27 is a different defect handled elsewhere and is not part of this Story.

## Contents

1. [HLD context](#1-hld-context)
2. [Contract details](#2-contract-details)
3. [Data model changes](#3-data-model-changes)
4. [Diagrams](#4-diagrams)
5. [Error paths](#5-error-paths)
6. [Test strategy](#6-test-strategy)
7. [Migration](#7-migration)
8. [Alternatives considered](#8-alternatives-considered)
9. [References](#9-references)
10. [Open questions](#10-open-questions)

## 1. HLD context

**Framework:** Standalone feature — no parent HLD. Design directly against the repo, grounded on the s1 analyze passes. There are no HLD shared contracts to honour.
**Rollout phase:** standalone

## 2. Contract details

**Surface level:** internal

### 2.1 `computeCodeReviewFreshness`

```typescript
(repoPath: string, changedFiles: readonly string[], deps: FreshnessDeps) => Promise<FreshnessResult>
```

**Parameters:**
- `repoPath: string` — Absolute path of the registered repo
- `changedFiles: readonly string[]` — The Story's changed files, repo-relative or absolute
- `deps: FreshnessDeps` — Read-only seams; gains selection and requestedAt

**Returns:** `FreshnessResult` — The existing fields plus unindexedFiles: the stale files that exist and that the index holds (they have entities with an older watermark, or they are selected files without entities), and that have not been requested at or after their current mtime

**Errors:**
- `none thrown by the compute itself` when A selection read that throws keeps an entity-less file stale and unlisted; a file whose mtime reads as 0 (deleted or unstattable) is settled first and is never stale on its own, as today

**Preconditions:**
- deps.codeIndexWork, entityWatermark, repoLastIndexed, fileMtime, selection and requestedAt are provided

**Postconditions:**
- A changed file whose mtime is 0 is not in staleFiles or unindexedFiles, selection is not consulted for it, and nothing is requested for it
- A file with an entity watermark keeps its comparison: it is stale exactly when the watermark is older than its mtime; selection is not consulted for it
- A file with an entity watermark that is stale is in unindexedFiles unless requestedAt is at or after its mtime
- A file that exists, has no entities and has selection 'not-code' or 'excluded-by-ignore' is not in staleFiles
- A file that exists, has no entities and has selection 'selected' is always in staleFiles, whatever the repo-level lastIndexed or any earlier request, and is in unindexedFiles unless requestedAt is at or after its mtime
- The compute performs no write and queues nothing

### 2.2 `codeReview.freshness`

```typescript
(params: unknown) => Promise<FreshnessResult | { error: string }>
```

**Parameters:**
- `params: { repo?: string; epicHash: string; storyId: string; changedFiles?: unknown }` — As today

**Returns:** `FreshnessResult` — As today, with unindexedFiles added; when it queued jobs, isProcessing, inFlight and pendingCodeIndexJobs are re-read from the queue after the jobs were queued, so the same reply shows the work

**Errors:**
- `{ error: string }` when repo, epicHash or storyId missing, as today

**Preconditions:**
- The repo is registered

**Postconditions:**
- For each file in unindexedFiles the handler has queued one 'file' index job (event 'update') and recorded the request time for it, so it is not queued again for the same mtime
- The queue already replaces a queued file job for the same path, so a repeat cannot pile up

### 2.3 `selectFile`

```typescript
(filePath: string, repoPath: string, ignore: readonly string[]) => FileSelection
```

**Parameters:**
- `filePath: string` — Absolute path of the changed file
- `repoPath: string` — Repo root
- `ignore: readonly string[]` — The repo's ignore list from resolveRepoIgnore

**Returns:** `FileSelection` — 'selected' | 'not-code' | 'excluded-by-ignore'; reused unchanged as the single rule for whether the index holds a file

**Preconditions:**
- The language parsers are registered, as the indexer module does on import

**Postconditions:**
- Not changed by this Story; it makes no existence check for a language parser, which is why the compute settles a missing file first

### 2.4 `realFreshnessGraphDeps`

```typescript
() => Promise<Pick<FreshnessDeps, 'entityWatermark' | 'fileMtime' | 'selection'>>
```

**Returns:** `Promise<Pick<FreshnessDeps, 'entityWatermark' | 'fileMtime' | 'selection'>>` — The real graph, filesystem and selectFile seams; selection joins a relative file to repoPath, loads the parsers, and calls selectFile with resolveRepoIgnore(repoPath)

**Postconditions:**
- Read-only

## 3. Data model changes

### 3.1 `FreshnessDeps` — field-add

selection: (repoPath: string, file: string) => Promise<FileSelection> ; requestedAt: (repoPath: string, file: string) => number | undefined (unix ms of the last index request for the file, from a daemon-side map that lives for the daemon process)

```
+ readonly selection: (repoPath: string, file: string) => Promise<FileSelection>;
+ readonly requestedAt: (repoPath: string, file: string) => number | undefined;
```

**Call sites:**
- `src/workflow/code-review/freshness.ts:32-44`
- `src/daemon/handler-runtime.ts:596-626`

### 3.2 `FreshnessResult` — field-add

unindexedFiles: readonly string[], a subset of staleFiles. Additive: the controller-side handler reads isProcessing, inFlight, pendingCodeIndexJobs and staleFiles and ignores the new field.

```
+ readonly unindexedFiles: readonly string[];
```

**Call sites:**
- `src/workflow/code-review/freshness.ts:47-57`
- `src/daemon/steps/code-review-step/handler.ts:305-345`
- `src/workflow/code-review/__tests__/freshness.test.ts:97-114`

### 3.3 `index request map` — new

A Map from absolute file path to the unix ms of the last request, held in the codeReview.freshness handler's closure in handler-runtime. Not persisted; empty after a daemon restart, which only means a file is requested once more.

**Call sites:**
- `src/daemon/handler-runtime.ts:596-626`

## 4. Diagrams

- [Sequence diagram](docs/standalone/fix-code-review-freshness-gate-so-E20261027fa396bdf/S001/sequence-diagram.html)

## 5. Error paths

**Error cases**

- **The selection seam throws for a changed file that exists and has no entities, for example a permission error while selectFile reads a large file** (recoverable)
  - Detection: The compute catches an exception from deps.selection for that file
  - Response: The file is treated as selected and kept stale, but it is not listed in unindexedFiles, so nothing is queued for it
  - User impact: The gate may wait for the freshness time-out for that file and then fall back to the degraded diff review, as before this fix
- **The daemon handler cannot queue the file job (the queue is stopped, as during shutdown)** (recoverable)
  - Detection: queue.enqueue returns without queueing, so the re-read of the queue state after the request still shows no code index work
  - Response: The file stays stale; it is not declared fresh
  - User impact: The gate waits for the freshness time-out and the review runs as a degraded diff review
- **A listed file is requested but the indexer throws on it or leaves it without a fresh File entity (a parse failure, an unregistered repo)** (recoverable)
  - Detection: After the job ends, the next poll finds the file still stale and the queue idle
  - Response: The file stays stale and is not requested again for the same mtime
  - User impact: The gate waits for the freshness time-out, then the review runs as a degraded diff review, which does not depend on graph entities for that file
- **A changed file cannot be stat'ed (it was deleted, or a permission error)** (recoverable)
  - Detection: The real fileMtime catches the statSync failure and returns 0
  - Response: The compute settles the file before any entity or selection read: it is not stale, not listed as unindexed and nothing is requested, as today
  - User impact: A deleted source file never holds the gate or queues an index job for a path that does not exist

**Edge cases**

| Input | Expected |
| :--- | :--- |
| A changed .ts file that was deleted after the change | Its mtime reads as 0, so it is not stale and not requested even though selectFile would class the missing path as selected |
| A changed file of an unsupported type (for example a .png) or a lock file, with the repo last fully indexed before the change | Not stale and never queued: selection is 'not-code', so the repo-level lastIndexed is not consulted (it makes such a file stale today) |
| A changed ordinary Markdown file the index has no entities for | Selected, because the artifact parser holds Markdown: stale, listed as unindexed and queued once, then fresh when its File entity exists |
| A changed generated or minified file, or a path under an ignored directory such as node_modules or out, with no entities | Not stale and never queued |
| A changed code file the watcher missed, with an idle queue | Listed in staleFiles and unindexedFiles on the first poll; the handler queues one job and the same reply shows isProcessing true; a later poll finds a File entity with a watermark newer than the mtime and the file is fresh |
| An already indexed file edited after its entities were written, where the watcher missed the update and the queue is idle | Stale because its watermark is older than its mtime, listed in unindexedFiles and queued once; the watermark comparison itself is unchanged; a later poll finds the new entities and the file is fresh |
| A requested file is edited again after the request | Its mtime is newer than the recorded request time, so it is listed as unindexed again and requested once more |
| The same stale file appears on two polls before its job runs | It is queued once: the recorded request time is at or after its mtime so it is no longer listed, and the queue replaces a queued job for the same path in any case |
| A file's entities are being rewritten by its index job (the old entities are deleted before the new ones are written) | A poll in that window sees no entities, so the file is judged by selection and, because it was requested at or after its mtime, is stale but not listed again; it becomes fresh once the new entities exist |
| A changed set with one indexed file and one file whose indexing fails | The failed file stays stale, so the gate does not report the set fresh; after the freshness time-out the review runs as a degraded diff review rather than a full review without that file |
| The daemon restarts while a changed file is stale | The request map is empty, so the file is requested again once; the start-up delta pass may also queue it, and the queue replaces a queued job for the same path |

**Invariants to preserve**

- A changed file with indexed entities is stale exactly when its newest entity indexedAt is older than the file's mtime, and the compute never writes or queues anything [[c1]]
- A changed file that cannot be stat'ed has mtime 0 and is never stale on its own [[c1]]
- A file with a parser leaves a File entity when indexed, and a file event deletes the file's old entities before writing the new ones; selectFile stays the one rule for what the index holds [[c2]]
- The queued-or-running 'file' job for the repo keeps making isProcessing true, and a queued file job for the same path replaces the earlier one [[c3]]
- The controller-side handler keeps reading isProcessing, inFlight, pendingCodeIndexJobs and staleFiles with the same meaning, and its freshness time-out and diff-only fallback are unchanged [[c3]]
- The full review falls back to the diff review only when grounding has no symbols at all, so a file left out of the graph in a mixed set must be kept stale rather than reported fresh [[c3]]
- The handler, routing, long-review, RPC fallback and review-stream-freshness tests, which fake the freshness result, keep passing without edits [[c5]]

## 6. Test strategy

**Test framework:** `node:test run with tsx (npx tsx --test), tests co-located in __tests__, as in the existing src/workflow/code-review/__tests__/freshness.test.ts and src/daemon/steps/code-review-step/__tests__/handler.test.ts`

**Test levels**

- **unit** — The pure compute: missing files are settled first, stale held files are listed for a request once per mtime, files the index never holds are not stale, and nothing is declared fresh without fresh entities
  - Subjects: `src/workflow/code-review/__tests__/freshness.test.ts: a changed file whose mtime is 0 (deleted or unstattable) is not stale, not in unindexedFiles, and neither the entity nor the selection seam decides it, even when selection would say selected`, `src/workflow/code-review/__tests__/freshness.test.ts: a file with no entities and selection 'not-code' or 'excluded-by-ignore' is not stale, whatever the repo-level lastIndexed is`, `src/workflow/code-review/__tests__/freshness.test.ts: a file with no entities and selection 'selected' is in staleFiles and unindexedFiles when it was never requested`, `src/workflow/code-review/__tests__/freshness.test.ts: with an idle queue, a file with entities whose watermark is older than its mtime (a missed update) is in staleFiles and unindexedFiles, and the selection seam is not consulted for it`, `src/workflow/code-review/__tests__/freshness.test.ts: a stale file requested at or after its mtime stays in staleFiles but leaves unindexedFiles, with the queue idle or busy, for both an entity-less file and a file with an older watermark`, `src/workflow/code-review/__tests__/freshness.test.ts: a file edited after its request is in unindexedFiles again`, `src/workflow/code-review/__tests__/freshness.test.ts: a selection seam that throws keeps an entity-less file stale and out of unindexedFiles`, `src/workflow/code-review/__tests__/freshness.test.ts: a file with entities whose watermark is at or after its mtime is not stale and not in unindexedFiles; the compute calls no write seam`, `src/workflow/code-review/__tests__/freshness.test.ts: the existing whole-result assertions are updated for the unindexedFiles field and still pass`
  - Fixtures: `fake FreshnessDeps with the new selection and requestedAt seams, as in the existing freshness tests`
- **integration** — The daemon handler queues the index request once and re-reads the queue, and the real seams apply the real rules
  - Subjects: `src/daemon/__tests__/code-review-freshness-request.test.ts: the codeReview.freshness handler built by buildHandlerRuntime with a recording queue queues one 'file' job for each file in unindexedFiles, queues nothing for a second identical poll, and queues again after the file's mtime moves`, `src/daemon/__tests__/code-review-freshness-request.test.ts: after queueing, the same reply carries isProcessing, inFlight and pendingCodeIndexJobs read from the queue after the jobs were queued`, `src/daemon/__tests__/code-review-freshness-request.test.ts: realFreshnessGraphDeps().selection, with the indexer's parsers registered, returns 'not-code' for a .png file and package-lock.json, 'excluded-by-ignore' for a .ts file under node_modules, and 'selected' for a .ts file and a small .md file in a real temporary directory`, `src/daemon/__tests__/code-review-freshness-request.test.ts: through the real seams, a changed .ts path that does not exist is not stale and queues nothing, while an existing entity-less .ts file is stale and queued once`, `src/daemon/__tests__/handler-runtime.test.ts: the recorded handler key sets are unchanged because no method is added`
  - Fixtures: `a temporary repo directory with a .ts file, a .md file, a .png file, a package-lock.json and a node_modules file`, `a recording queue exposing enqueue and codeIndexWorkFor`
- **contract** — The controller-side consumers read the result as before, and a file that cannot be indexed reaches the degraded diff review
  - Subjects: `src/daemon/steps/code-review-step/__tests__/handler.test.ts: with proceed:true and a freshness that keeps reporting one stale file with an idle queue while other changed files have symbols, the wait ends at the freshness time-out in the degraded diff review (fallback reason freshness-timeout naming that file) and no full review runs`, `src/daemon/steps/code-review-step/__tests__/routing.test.ts and long-review.test.ts, src/daemon/__tests__/code-review-rpc-fallback.test.ts and src/shared/__tests__/review-stream-freshness.test.ts pass unchanged`
- **live** — The observed case and the missed update on a running daemon
  - Subjects: `Reported by the builder, not run by the gate: in a new directory create a small .ts file, call codeReview.freshness for a changed set that names it, see it listed and queued, and see it fresh within a few polls with the daemon's real index; then edit an already indexed file the same way and see it listed, queued and fresh`
  - Fixtures: `a running daemon with this repo registered`

**Acceptance mapping**

| Criterion | Proving tests |
| :--- | :--- |
| `ac1` | `src/workflow/code-review/__tests__/freshness.test.ts: a file with no entities and selection 'selected' is in staleFiles and unindexedFiles when it was never requested`, `src/daemon/__tests__/code-review-freshness-request.test.ts: the codeReview.freshness handler built by buildHandlerRuntime with a recording queue queues one 'file' job for each file in unindexedFiles, queues nothing for a second identical poll, and queues again after the file's mtime moves` |
| `ac2` | `src/workflow/code-review/__tests__/freshness.test.ts: a file with no entities and selection 'not-code' or 'excluded-by-ignore' is not stale, whatever the repo-level lastIndexed is`, `src/workflow/code-review/__tests__/freshness.test.ts: a changed file whose mtime is 0 (deleted or unstattable) is not stale, not in unindexedFiles, and neither the entity nor the selection seam decides it, even when selection would say selected`, `src/daemon/__tests__/code-review-freshness-request.test.ts: realFreshnessGraphDeps().selection, with the indexer's parsers registered, returns 'not-code' for a .png file and package-lock.json, 'excluded-by-ignore' for a .ts file under node_modules, and 'selected' for a .ts file and a small .md file in a real temporary directory`, `src/daemon/__tests__/code-review-freshness-request.test.ts: through the real seams, a changed .ts path that does not exist is not stale and queues nothing, while an existing entity-less .ts file is stale and queued once` |
| `ac3` | `src/workflow/code-review/__tests__/freshness.test.ts: a stale file requested at or after its mtime stays in staleFiles but leaves unindexedFiles, with the queue idle or busy, for both an entity-less file and a file with an older watermark`, `src/daemon/steps/code-review-step/__tests__/handler.test.ts: with proceed:true and a freshness that keeps reporting one stale file with an idle queue while other changed files have symbols, the wait ends at the freshness time-out in the degraded diff review (fallback reason freshness-timeout naming that file) and no full review runs` |
| `ac4` | `src/workflow/code-review/__tests__/freshness.test.ts: a file with entities whose watermark is at or after its mtime is not stale and not in unindexedFiles; the compute calls no write seam`, `src/workflow/code-review/__tests__/freshness.test.ts: the existing whole-result assertions are updated for the unindexedFiles field and still pass`, `src/daemon/steps/code-review-step/__tests__/routing.test.ts and long-review.test.ts, src/daemon/__tests__/code-review-rpc-fallback.test.ts and src/shared/__tests__/review-stream-freshness.test.ts pass unchanged` |
| `ac5` | `src/daemon/__tests__/code-review-freshness-request.test.ts: after queueing, the same reply carries isProcessing, inFlight and pendingCodeIndexJobs read from the queue after the jobs were queued` |
| `ac6` | `src/workflow/code-review/__tests__/freshness.test.ts: with an idle queue, a file with entities whose watermark is older than its mtime (a missed update) is in staleFiles and unindexedFiles, and the selection seam is not consulted for it` |

## 7. Migration

**State before:** computeCodeReviewFreshness judges a changed file with entities by its watermark against its mtime, and a file with no entities by the repo-level lastIndexed against its mtime (bundle c1). lastIndexed is written when a full index completes and also at daemon start-up, right after the delta file jobs are enqueued and before they finish, so it cannot show that any one file is indexed (bundle c2). Nothing in the gate asks for indexing, and the codeReview.freshness handler is read-only (bundle c3). A deleted file has mtime 0 and is never stale today. A changed file the watcher missed, new or edited, or a file of a type the index never holds, stays stale until the next full reindex or a daemon restart.

**State after:** A changed file whose mtime is 0 is settled first and is never stale, as today. A file with entities keeps its watermark comparison. A file with no entities is classed by selectFile: a file the index would never hold is not stale; a selected file is stale. Every stale file the index holds, with an older watermark or without entities, is listed as unindexed, and the codeReview.freshness handler queues one file job for it per mtime and re-reads the queue, so a later poll finds it fresh. A file that is still stale after its request stays stale and is not requested again for the same mtime, so the existing freshness time-out sends the review to the degraded diff review. FreshnessResult has one more field, unindexedFiles. No stored data changes.

**Zero downtime:** no — **Data rewrite:** no

**Steps**

1. Add the selection and requestedAt seams to FreshnessDeps and the unindexedFiles field to FreshnessResult, and the new rules to the compute with the mtime-0 case settled first and every stale held file listed, with the real selection seam in realFreshnessGraphDeps — ↩ rollbackable
2. In the codeReview.freshness handler, keep the in-memory request map, supply requestedAt from it, queue one file job for each file in unindexedFiles, record the time, and re-read the queue state for the reply — ↩ rollbackable
3. Update the existing whole-result assertions in freshness.test.ts, add the unit, integration and contract tests including the idle-queue missed-update case, and run the handler, routing, long-review, RPC fallback and review-stream-freshness tests unchanged — ↩ rollbackable
4. Restart the daemon so the running process uses the new handler; the request map starts empty, which only means each file is requested once more — ↩ rollbackable

**Backward compat:** The freshness IPC reply only gains unindexedFiles; clients that read isProcessing, inFlight, pendingCodeIndexJobs and staleFiles are unaffected. The controller-side wait loop, its freshness time-out and the diff-only fallback are unchanged. A client talking to an older daemon sees no unindexedFiles and the old behaviour.

## 8. Alternatives considered

### 8.1 a1: Classify with the index rule, and request indexing of every stale file the index holds — **CHOSEN**

Settle missing files first; class entity-less files with selectFile; and list every other stale file (entity-less and selected, or with an outdated watermark) so the daemon queues one file job for it per mtime.

A changed file with mtime 0 is settled first, as today. A file with entities keeps its watermark comparison and, when its watermark is behind its mtime, is stale and listed in a new unindexedFiles field. A file with no entities is classed by the existing selectFile rule through a new read-only selection seam: 'not-code' and 'excluded-by-ignore' files are not stale, and a 'selected' file is stale and listed. A listed file is left out of the list only when the daemon has already requested it at or after its mtime. The codeReview.freshness daemon handler queues one 'file' job for each listed file, records the request time, and re-samples the queue so the same reply shows isProcessing. A requested file that is still stale stays stale, so the controller-side wait ends through its existing freshness time-out in the degraded diff review.

### 8.2 a2: Classification only

Treat files the index would never hold as fresh; leave every other stale file stale.

Only the compute changes: it drops 'not-code' and 'excluded-by-ignore' files from staleFiles. Nothing is queued. A held file the watcher missed, new or edited, stays stale until a full reindex, a daemon restart or a later edit.

**Rejected because:** Safe and small but leaves the observed case and the missed update unfixed; it violates the first fix criterion.

### 8.3 a3: Per-file index record

The indexer records, for every file event it handles, a per-file marker with the time and outcome, and freshness reads that marker.

The indexer writes a small record per file path with the time and outcome for the watcher path, the index.file path and the full index; freshness compares that record with the mtime.

**Rejected because:** Exact but a new stored record and a write on every file event for a defect that two small rules fix; partial on keeping existing behaviour and tests.

### 8.4 a4: Advance the repo watermark on incremental indexing

Make each incremental file index move the repo-level lastIndexed.

After a 'file' job completes, the daemon sets the registered repo's lastIndexed to the time of the job.

**Rejected because:** Reports false freshness for unindexed files, so a mixed set reaches a full review without them; it violates the first and third fix criteria.

## 9. References

- **[[c1]]** `code` `src/workflow/code-review/freshness.ts:65-90`
- **[[c2]]** `code` `src/indexer/index.ts:293-303`
- **[[c3]]** `code` `src/daemon/steps/code-review-step/handler.ts:305-372`
- **[[c4]]** `code` `src/daemon/handler-runtime.ts:1189-1193`
- **[[c5]]** `code` `src/indexer/file-selection.ts:57-75`

## 10. Open questions

- Graded partial in the audit (ts1): the Story record has no acceptance criteria; ac1 to ac6 were written in this LLD from the approved issue's fix intent and the review rounds.
- Graded partial in the audit (alt2): the Story has no acceptance criteria, Epic constraints or HLD contracts, so the three scored constraints were taken from the approved issue's fix intent.
- The Story title still says 'the wait cannot deadlock'; the design does not address a wait deadlock because the controller-side wait is bounded by codeReview.freshnessTimeoutMs, and the review-session timeout is handled in another session.
- Why the ten fixture files were not indexed by the watcher was not confirmed from a daemon log; a missed event in a newly created directory is the likely cause.
- That an entity-less changed file is left out of a full review's grounding rests on review round 1; only the symbol list of grounding.ts was read here.

## Resolved questions

- `q71ed78b7` — Graded partial in the audit (ts1): the Story record has no acceptance criteria; ac1 to ac6 were written in this LLD from the approved issue's fix intent and the review rounds.
  - **resolved**: Confirm LLD as baseline — User chose option 2: ac1 to ac6 in the approved LLD govern acceptance; derived from the approved issue's fix intent and the review rounds; the Story record stays without criteria. _(2026-10-27T06:42:17.229Z)_
- `qc02cc01e` — That an entity-less changed file is left out of a full review's grounding rests on review round 1; only the symbol list of grounding.ts was read here.
  - **resolved**: Verify before proceeding — Verified 2026-10-27 in src/workflow/code-review/grounding.ts:88-113: symbols are built by looping each changed file's entities, so an entity-less file adds none; the code-review step handler falls back to the diff review only when the whole symbols list is empty (handler.ts:305-372). The omission in a mixed set is confirmed. _(2026-10-27T06:43:15.519Z)_
- `q3d42c913` — Graded partial in the audit (alt2): the Story has no acceptance criteria, Epic constraints or HLD contracts, so the three scored constraints were taken from the approved issue's fix intent.
  - **resolved**: Explicitly adopt issue intent — User chose option 1: the approved issue's fix intent is the scoring basis for the three constraints; the audit stays graded partial because the Story has no acceptance criteria, Epic constraints or HLD contracts. _(2026-10-27T06:48:16.439Z)_
- `qbd1ff74d` — The Story title still says 'the wait cannot deadlock'; the design does not address a wait deadlock because the controller-side wait is bounded by codeReview.freshnessTimeoutMs, and the review-session timeout is handled in another session.
  - **resolved**: Rename to bounded freshness wait — User chose option 1: the Story is about the bounded controller-side freshness wait and stale-file indexing; the review-session timeout is out of scope (another session). The approved issue and LLD keep their original title text. _(2026-10-27T06:52:02.757Z)_

## Citations

- **[[c1]]** `code` `src/workflow/code-review/freshness.ts:65-90`
- **[[c2]]** `code` `src/indexer/index.ts:293-303`
- **[[c3]]** `code` `src/daemon/steps/code-review-step/handler.ts:305-372`
- **[[c4]]** `code` `src/daemon/handler-runtime.ts:1189-1193`
- **[[c5]]** `code` `src/indexer/file-selection.ts:57-75`
