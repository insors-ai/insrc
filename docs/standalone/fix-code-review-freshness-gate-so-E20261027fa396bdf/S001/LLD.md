<!-- insrc:artifact LLD-fa396bdf197b8e8b-s1 -->

# LLD: STORY-fa396bdf197b8e8b-s1

## Summary

**Epic:** `fix-code-review-freshness-gate-so`
**HLD base run:** `wf-1793085995063-vangle`
**HLD effective hash:** `96a34482d75a...`

The index no longer misses files in directories that are created together with their parent. When the watcher sees a new directory that has subdirectories, it adds a watch for that directory and then reports every file already in it, so the files reach the index and later writes are seen too. As a backstop for what the watcher cannot know about, the code-review freshness check also asks for any stale changed file the index holds to be indexed once per modification time, treats a deleted file or a file the index never holds as not stale, and never calls a file fresh that is still stale after its request, so a file that cannot be indexed ends in the existing degraded diff review. The review-session timeout seen on 2026-10-27 is a different defect handled elsewhere and is not part of this Story.

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

### 2.1 `Watcher.addRepo`

```typescript
(repoPath: string, ignore?: readonly string[]) => Promise<void>
```

**Parameters:**
- `repoPath: string` — Absolute path of the repo to watch
- `ignore: readonly string[]` _(optional)_ — Directory names to leave out of the watch, the scan and the per-directory watches; defaults to IGNORE_DIRS

**Returns:** `Promise<void>` — Resolves once the repo subscription exists; unchanged

**Errors:**
- `error thrown by the watcher backend` when The repo subscription cannot be created, as today

**Preconditions:**
- The repo path exists

**Postconditions:**
- For each create event whose path is a directory, not a symbolic link, and with no ignored segment below the repo root, and that has no subscription of its own yet: if the directory has subdirectories, a recursive subscription for it is created first; then a create event is emitted for every file in its tree, skipping ignored directories and symbolic links
- Events from a directory's own subscription reach the same debounce and handlers as the repo's events, and a create event for a directory inside it is handled the same way
- A directory whose subscription fails is logged and still scanned, so its files are reported once

### 2.2 `Watcher.removeRepo`

```typescript
(repoPath: string) => Promise<void>
```

**Parameters:**
- `repoPath: string` — Absolute path of the repo to stop watching

**Returns:** `Promise<void>` — Resolves once the repo subscription and every per-directory subscription under it are released

**Postconditions:**
- No subscription remains for the repo or for any directory under it

### 2.3 `Watcher.close`

```typescript
() => Promise<void>
```

**Returns:** `Promise<void>` — Resolves once every subscription, per-directory ones included, is released

**Postconditions:**
- The map of per-directory subscriptions is empty

### 2.4 `computeCodeReviewFreshness`

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

### 2.5 `codeReview.freshness`

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

### 2.6 `selectFile`

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

### 2.7 `realFreshnessGraphDeps`

```typescript
() => Promise<Pick<FreshnessDeps, 'entityWatermark' | 'fileMtime' | 'selection'>>
```

**Returns:** `Promise<Pick<FreshnessDeps, 'entityWatermark' | 'fileMtime' | 'selection'>>` — The real graph, filesystem and selectFile seams; selection joins a relative file to repoPath, loads the parsers, and calls selectFile with resolveRepoIgnore(repoPath)

**Postconditions:**
- Read-only

## 3. Data model changes

### 3.1 `Watcher per-directory subscriptions` — new

A Map in the Watcher from the absolute path of a directory that was created together with subdirectories to its @parcel/watcher subscription, with the ignore list of its repo held per repo. Entries are added on a create event, removed on a delete event for that directory, and cleared by removeRepo and close. In memory only; empty after a restart, where the start-up delta pass covers files changed while the daemon was down.

**Call sites:**
- `src/indexer/watcher.ts:30-103`

### 3.2 `FreshnessDeps` — field-add

selection: (repoPath: string, file: string) => Promise<FileSelection> ; requestedAt: (repoPath: string, file: string) => number | undefined (unix ms of the last index request for the file, from a daemon-side map that lives for the daemon process)

```
+ readonly selection: (repoPath: string, file: string) => Promise<FileSelection>;
+ readonly requestedAt: (repoPath: string, file: string) => number | undefined;
```

**Call sites:**
- `src/workflow/code-review/freshness.ts:65-90`
- `src/daemon/handler-runtime.ts:596-626`

### 3.3 `FreshnessResult` — field-add

unindexedFiles: readonly string[], a subset of staleFiles. Additive: the controller-side handler reads isProcessing, inFlight, pendingCodeIndexJobs and staleFiles and ignores the new field.

```
+ readonly unindexedFiles: readonly string[];
```

**Call sites:**
- `src/workflow/code-review/freshness.ts:65-90`
- `src/daemon/steps/code-review-step/handler.ts:305-372`
- `src/workflow/code-review/__tests__/freshness.test.ts:97-114`

### 3.4 `index request map` — new

A Map from absolute file path to the unix ms of the last request, held in the codeReview.freshness handler's closure in handler-runtime. Not persisted; empty after a daemon restart, which only means a file is requested once more.

**Call sites:**
- `src/daemon/handler-runtime.ts:596-626`

## 4. Diagrams

- [Sequence diagram](docs/standalone/fix-code-review-freshness-gate-so-E20261027fa396bdf/S001/sequence-diagram.html)

## 5. Error paths

**Error cases**

- **The per-directory subscription for a new directory cannot be created (an inotify limit, a permission error, the directory removed first)** (recoverable)
  - Detection: The subscribe call rejects and the watcher catches the rejection
  - Response: A warning with the directory is logged, no entry is kept for it, and the scan still reports the files present, so they are indexed once
  - User impact: Files written later in that directory are not seen by the watcher; the freshness gate still requests them when a review asks, and the start-up delta pass covers them after a restart
- **The scan of a new directory fails part-way (a subdirectory removed or unreadable during the walk)** (recoverable)
  - Detection: A readdir or lstat call throws for one entry
  - Response: That entry is skipped, the rest of the tree is reported, and a debug line is logged
  - User impact: At most the files under the unreadable entry are not reported by the scan
- **The daemon handler cannot queue the file job for a stale file (the queue is stopped, as during shutdown)** (recoverable)
  - Detection: queue.enqueue returns without queueing, so the re-read of the queue state after the request still shows no code index work
  - Response: The file stays stale; it is not declared fresh
  - User impact: The gate waits for the freshness time-out and the review runs as a degraded diff review
- **A listed file is requested but the indexer throws on it or leaves it without a fresh File entity (a parse failure, an unregistered repo)** (recoverable)
  - Detection: After the job ends, the next poll finds the file still stale and the queue idle
  - Response: The file stays stale and is not requested again for the same mtime
  - User impact: The gate waits for the freshness time-out, then the review runs as a degraded diff review, which does not depend on graph entities for that file
- **The selection seam throws for a changed file that exists and has no entities** (recoverable)
  - Detection: The compute catches an exception from deps.selection for that file
  - Response: The file is treated as selected and kept stale, but it is not listed in unindexedFiles, so nothing is queued for it
  - User impact: The gate may wait for the freshness time-out for that file and then fall back to the degraded diff review
- **A changed file cannot be stat'ed (it was deleted, or a permission error)** (recoverable)
  - Detection: The real fileMtime catches the statSync failure and returns 0
  - Response: The compute settles the file before any entity or selection read: it is not stale, not listed as unindexed and nothing is requested, as today
  - User impact: A deleted source file never holds the gate or queues an index job for a path that does not exist

**Edge cases**

| Input | Expected |
| :--- | :--- |
| mkdir -p a/b/c followed by a file written in a/b/c at once, or seconds later | The create event for a gets a per-directory subscription and a scan; the file present at the scan is reported by it, and a file written later in a/b/c is reported by the new subscription |
| A single new directory with no subdirectories | No per-directory subscription is created, because the repo's own watch already covers it; the scan reports any files already in it |
| A directory created under an ignored directory name (node_modules, out, .insrc, a name from the repo's ignore list) | Not subscribed to and not scanned |
| A new directory that contains an ignored subdirectory and other directories | The ignored subdirectory is skipped by the scan and by the per-directory subscription's ignore list; the others are covered |
| A symbolic link to a directory appears in the tree | It is not followed, so no loop and no second copy of the files |
| A new directory is deleted again | Its delete event releases its per-directory subscription and drops its map entry; files that were reported stay until the indexer handles their delete events |
| The repo's own watch and a per-directory watch both report the same file | Two events reach the Indexer, which queues one 'file' job because the queue replaces a queued job for the same path |
| A directory is moved in from outside the repo with a large tree | The scan reports every file with a supported type; the Indexer drops the others as it does today; the queue holds one job per path |
| A changed .ts file that was deleted after the change | Its mtime reads as 0, so the gate does not call it stale and does not request it, even though selectFile would class the missing path as selected |
| A changed file of an unsupported type (for example a .png) or a lock file, with the repo last fully indexed before the change | Not stale and never queued: selection is 'not-code', so the repo-level lastIndexed is not consulted |
| A changed ordinary Markdown file the index has no entities for | Selected, because the artifact parser holds Markdown: stale, listed as unindexed and queued once, then fresh when its File entity exists |
| An already indexed file edited after its entities were written, where the watcher missed the update and the queue is idle | Stale because its watermark is older than its mtime, listed in unindexedFiles and queued once; a later poll finds the new entities and the file is fresh |
| A requested file is edited again after the request | Its mtime is newer than the recorded request time, so it is listed as unindexed again and requested once more |
| A changed set with one indexed file and one file whose indexing fails | The failed file stays stale, so the gate does not report the set fresh; after the freshness time-out the review runs as a degraded diff review rather than a full review without that file |
| The daemon restarts while a changed file is stale | The per-directory subscriptions and the request map are empty; the start-up delta pass queues files changed while the daemon was down, and a still-stale file is requested again once by the gate |

**Invariants to preserve**

- The repo subscription, its ignore list, the 200 ms debounce and the handlers' view of events as {type, path} are unchanged; a file event from a per-directory subscription is indistinguishable from one from the repo subscription [[c1]]
- A directory created alone, or a child created later than its parent, is already watched by the repo subscription, so it gets no second subscription [[c2]]
- The Indexer drops events whose extension is not supported and a queued file job for the same path replaces the earlier one, so repeated events cost nothing [[c1]]
- A changed file with indexed entities is stale exactly when its newest entity indexedAt is older than the file's mtime, and the compute never writes or queues anything [[c3]]
- A changed file that cannot be stat'ed has mtime 0 and is never stale on its own [[c3]]
- A file with a parser leaves a File entity when indexed, and a file event deletes the file's old entities before writing the new ones; selectFile stays the one rule for what the index holds [[c4]]
- The controller-side handler keeps reading isProcessing, inFlight, pendingCodeIndexJobs and staleFiles with the same meaning, and its freshness time-out and diff-only fallback are unchanged; the full review falls back to the diff review only when grounding has no symbols at all, so a file left out of the graph in a mixed set must be kept stale rather than reported fresh [[c5]]
- The handler, routing, long-review, RPC fallback and review-stream-freshness tests, which fake the freshness result, keep passing without edits [[c6]]

## 6. Test strategy

**Test framework:** `node:test run with tsx (npx tsx --test), tests co-located in __tests__, as in the existing src/workflow/code-review/__tests__/freshness.test.ts, src/daemon/steps/code-review-step/__tests__/handler.test.ts and src/indexer/__tests__/ignore-dirs.test.ts`

**Test levels**

- **integration** — The real @parcel/watcher in a temporary directory: the Watcher reports files in directories created together with their parent, ignores what it must, and releases what it holds
  - Subjects: `src/indexer/__tests__/watcher-new-directories.test.ts: after addRepo, mkdir -p a/b/c with a file written in it at once yields a create event for that file, and a second file written in a/b/c three seconds later yields an event too (the case that produced no event before the fix)`, `src/indexer/__tests__/watcher-new-directories.test.ts: a directory tree with files created in one call yields a create event for every file in the tree, including files in nested directories, and a symbolic link to a directory is not followed`, `src/indexer/__tests__/watcher-new-directories.test.ts: files inside a new directory whose name is on the ignore list (node_modules) and inside an ignored subdirectory of a new directory yield no events, at creation and when written later`, `src/indexer/__tests__/watcher-new-directories.test.ts: after a new nested directory is deleted and created again with the same path, files written in it are reported again`, `src/indexer/__tests__/watcher-new-directories.test.ts: after close() no handler is called for later writes, and after removeRepo() the repo's per-directory subscriptions deliver nothing`, `src/indexer/__tests__/watcher-new-directories.test.ts: a new nested directory that cannot be read (mode 000, skipped when running as root) does not throw or stop later events for other directories`
  - Fixtures: `a temporary repo directory per test, removed afterwards`, `a polling wait with a time limit instead of fixed sleeps`
- **unit** — The pure freshness compute: missing files are settled first, stale held files are listed for a request once per mtime, files the index never holds are not stale, and nothing is declared fresh without fresh entities
  - Subjects: `src/workflow/code-review/__tests__/freshness.test.ts: a changed file whose mtime is 0 (deleted or unstattable) is not stale, not in unindexedFiles, and neither the entity nor the selection seam decides it, even when selection would say selected`, `src/workflow/code-review/__tests__/freshness.test.ts: a file with no entities and selection 'not-code' or 'excluded-by-ignore' is not stale, whatever the repo-level lastIndexed is`, `src/workflow/code-review/__tests__/freshness.test.ts: a file with no entities and selection 'selected' is in staleFiles and unindexedFiles when it was never requested`, `src/workflow/code-review/__tests__/freshness.test.ts: with an idle queue, a file with entities whose watermark is older than its mtime (a missed update) is in staleFiles and unindexedFiles, and the selection seam is not consulted for it`, `src/workflow/code-review/__tests__/freshness.test.ts: a stale file requested at or after its mtime stays in staleFiles but leaves unindexedFiles, with the queue idle or busy, for both an entity-less file and a file with an older watermark`, `src/workflow/code-review/__tests__/freshness.test.ts: a file edited after its request is in unindexedFiles again`, `src/workflow/code-review/__tests__/freshness.test.ts: a selection seam that throws keeps an entity-less file stale and out of unindexedFiles`, `src/workflow/code-review/__tests__/freshness.test.ts: a file with entities whose watermark is at or after its mtime is not stale and not in unindexedFiles; the compute calls no write seam`, `src/workflow/code-review/__tests__/freshness.test.ts: the existing whole-result assertions are updated for the unindexedFiles field and still pass`
  - Fixtures: `fake FreshnessDeps with the new selection and requestedAt seams, as in the existing freshness tests`
- **integration** — The daemon handler queues the index request once and re-reads the queue, and the real seams apply the real rules
  - Subjects: `src/daemon/__tests__/code-review-freshness-request.test.ts: the codeReview.freshness handler built by buildHandlerRuntime with a recording queue queues one 'file' job for each file in unindexedFiles, queues nothing for a second identical poll, and queues again after the file's mtime moves`, `src/daemon/__tests__/code-review-freshness-request.test.ts: after queueing, the same reply carries isProcessing, inFlight and pendingCodeIndexJobs read from the queue after the jobs were queued`, `src/daemon/__tests__/code-review-freshness-request.test.ts: realFreshnessGraphDeps().selection, with the indexer's parsers registered, returns 'not-code' for a .png file and package-lock.json, 'excluded-by-ignore' for a .ts file under node_modules, and 'selected' for a .ts file and a small .md file in a real temporary directory`, `src/daemon/__tests__/code-review-freshness-request.test.ts: through the real seams, a changed .ts path that does not exist is not stale and queues nothing, while an existing entity-less .ts file is stale and queued once`, `src/daemon/__tests__/handler-runtime.test.ts: the recorded handler key sets are unchanged because no method is added`
  - Fixtures: `a temporary repo directory with a .ts file, a .md file, a .png file, a package-lock.json and a node_modules file`, `a recording queue exposing enqueue and codeIndexWorkFor`
- **contract** — The controller-side consumers read the result as before, and a file that cannot be indexed reaches the degraded diff review
  - Subjects: `src/daemon/steps/code-review-step/__tests__/handler.test.ts: with proceed:true and a freshness that keeps reporting one stale file with an idle queue while other changed files have symbols, the wait ends at the freshness time-out in the degraded diff review (fallback reason freshness-timeout naming that file) and no full review runs`, `src/daemon/steps/code-review-step/__tests__/routing.test.ts and long-review.test.ts, src/daemon/__tests__/code-review-rpc-fallback.test.ts and src/shared/__tests__/review-stream-freshness.test.ts pass unchanged`
- **live** — The observed case on a running daemon, end to end
  - Subjects: `Reported by the builder, not run by the gate: with the rebuilt daemon running, create mkdir -p dir/sub with a small .ts file in it at once, then another file three seconds later, and see both indexed (codeReview.freshness reports them not stale) without a restart; then edit an already indexed file and see it fresh`
  - Fixtures: `a running daemon with this repo registered and the rebuilt watcher`

**Acceptance mapping**

| Criterion | Proving tests |
| :--- | :--- |
| `ac1` | `src/workflow/code-review/__tests__/freshness.test.ts: a file with no entities and selection 'selected' is in staleFiles and unindexedFiles when it was never requested`, `src/daemon/__tests__/code-review-freshness-request.test.ts: the codeReview.freshness handler built by buildHandlerRuntime with a recording queue queues one 'file' job for each file in unindexedFiles, queues nothing for a second identical poll, and queues again after the file's mtime moves` |
| `ac2` | `src/workflow/code-review/__tests__/freshness.test.ts: a file with no entities and selection 'not-code' or 'excluded-by-ignore' is not stale, whatever the repo-level lastIndexed is`, `src/workflow/code-review/__tests__/freshness.test.ts: a changed file whose mtime is 0 (deleted or unstattable) is not stale, not in unindexedFiles, and neither the entity nor the selection seam decides it, even when selection would say selected`, `src/daemon/__tests__/code-review-freshness-request.test.ts: realFreshnessGraphDeps().selection, with the indexer's parsers registered, returns 'not-code' for a .png file and package-lock.json, 'excluded-by-ignore' for a .ts file under node_modules, and 'selected' for a .ts file and a small .md file in a real temporary directory`, `src/daemon/__tests__/code-review-freshness-request.test.ts: through the real seams, a changed .ts path that does not exist is not stale and queues nothing, while an existing entity-less .ts file is stale and queued once` |
| `ac3` | `src/workflow/code-review/__tests__/freshness.test.ts: a stale file requested at or after its mtime stays in staleFiles but leaves unindexedFiles, with the queue idle or busy, for both an entity-less file and a file with an older watermark`, `src/daemon/steps/code-review-step/__tests__/handler.test.ts: with proceed:true and a freshness that keeps reporting one stale file with an idle queue while other changed files have symbols, the wait ends at the freshness time-out in the degraded diff review (fallback reason freshness-timeout naming that file) and no full review runs` |
| `ac4` | `src/workflow/code-review/__tests__/freshness.test.ts: a file with entities whose watermark is at or after its mtime is not stale and not in unindexedFiles; the compute calls no write seam`, `src/workflow/code-review/__tests__/freshness.test.ts: the existing whole-result assertions are updated for the unindexedFiles field and still pass`, `src/daemon/steps/code-review-step/__tests__/routing.test.ts and long-review.test.ts, src/daemon/__tests__/code-review-rpc-fallback.test.ts and src/shared/__tests__/review-stream-freshness.test.ts pass unchanged` |
| `ac5` | `src/daemon/__tests__/code-review-freshness-request.test.ts: after queueing, the same reply carries isProcessing, inFlight and pendingCodeIndexJobs read from the queue after the jobs were queued` |
| `ac6` | `src/workflow/code-review/__tests__/freshness.test.ts: with an idle queue, a file with entities whose watermark is older than its mtime (a missed update) is in staleFiles and unindexedFiles, and the selection seam is not consulted for it` |
| `ac7` | `src/indexer/__tests__/watcher-new-directories.test.ts: after addRepo, mkdir -p a/b/c with a file written in it at once yields a create event for that file, and a second file written in a/b/c three seconds later yields an event too (the case that produced no event before the fix)`, `src/indexer/__tests__/watcher-new-directories.test.ts: a directory tree with files created in one call yields a create event for every file in the tree, including files in nested directories, and a symbolic link to a directory is not followed` |
| `ac8` | `src/indexer/__tests__/watcher-new-directories.test.ts: files inside a new directory whose name is on the ignore list (node_modules) and inside an ignored subdirectory of a new directory yield no events, at creation and when written later`, `src/indexer/__tests__/watcher-new-directories.test.ts: after a new nested directory is deleted and created again with the same path, files written in it are reported again`, `src/indexer/__tests__/watcher-new-directories.test.ts: after close() no handler is called for later writes, and after removeRepo() the repo's per-directory subscriptions deliver nothing` |
| `ac9` | `src/indexer/__tests__/watcher-new-directories.test.ts: a new nested directory that cannot be read (mode 000, skipped when running as root) does not throw or stop later events for other directories` |

## 7. Migration

**State before:** The Watcher holds one @parcel/watcher subscription per repo and hands its events to the Indexer (bundle c1). On Linux, a directory created together with its parent is never watched, so files written into it, even much later, produce no event until the daemon restarts and its start-up delta pass re-queues them (bundle c2). The freshness check judges a changed file with entities by its watermark and a file without entities by the repo-level lastIndexed, which is also set at start-up before the delta jobs finish (bundles c3 and c4); nothing in the gate asks for indexing and the codeReview.freshness handler is read-only (bundle c5). A deleted file has mtime 0 and is never stale today.

**State after:** The Watcher gives each new directory that has subdirectories its own subscription, created before its tree is scanned, and reports the files already in it; the subscription is released when the directory is deleted, on removeRepo and on close, and a failed subscription is logged with the scan kept. The freshness check settles a file with mtime 0 first, classes an entity-less file with selectFile, lists every stale file the index holds as unindexed, and the codeReview.freshness handler queues one file job for it per mtime and re-reads the queue; a file still stale after its request stays stale, so the existing freshness time-out sends the review to the degraded diff review. FreshnessResult has one more field, unindexedFiles. No stored data changes.

**Zero downtime:** no — **Data rewrite:** no

**Steps**

1. Change the Watcher so a create event for a directory under a watched repo adds its own subscription when it has subdirectories, then scans the tree and emits create events for its files, with the per-directory subscriptions released on delete, removeRepo and close — ↩ rollbackable
2. Add the selection and requestedAt seams to FreshnessDeps and the unindexedFiles field to FreshnessResult, and the new rules to the compute with the mtime-0 case settled first and every stale held file listed, with the real selection seam in realFreshnessGraphDeps — ↩ rollbackable
3. In the codeReview.freshness handler, keep the in-memory request map, supply requestedAt from it, queue one file job for each file in unindexedFiles, record the time, and re-read the queue state for the reply — ↩ rollbackable
4. Add the watcher integration test and the freshness unit, integration and contract tests, update the existing whole-result assertions in freshness.test.ts, and run the handler, routing, long-review, RPC fallback and review-stream-freshness tests unchanged — ↩ rollbackable
5. Rebuild and restart the daemon so the running process uses the new watcher and handler; the per-directory subscriptions and the request map start empty, and the start-up delta pass covers files changed while it was down — ↩ rollbackable

**Backward compat:** The Watcher keeps its public methods and the {type, path} event shape, so the Indexer and both places that construct a Watcher need no change; only the set of events grows, by create events for files in directories the watcher previously did not cover. The freshness IPC reply only gains unindexedFiles; clients that read isProcessing, inFlight, pendingCodeIndexJobs and staleFiles are unaffected, and the controller-side wait loop, its freshness time-out and the diff-only fallback are unchanged. A client talking to an older daemon sees no unindexedFiles and the old behaviour.

## 8. Alternatives considered

### 8.1 a1: Close the watcher blind spot with a per-directory watch and a scan, and keep the gate's index request as a backstop — **CHOSEN**

The watcher watches and scans every new directory that has subdirectories, so the index stays current; the freshness gate also requests indexing of any stale file the index holds.

In the Watcher, a create event for a directory under a watched repo (not on the ignore list) first adds a dedicated recursive subscription for that directory when it has subdirectories, then walks the new tree and emits a create event for each file in it; the subscription is released on delete, removeRepo and close, and a failure to subscribe is logged with the scan kept. Separately, the freshness compute lists every stale changed file the index holds and the codeReview.freshness handler queues one file job for it per mtime, after settling files with mtime 0 first; a file still stale after its request stays stale, so the existing time-out reaches the degraded diff review.

### 8.2 a2: Watcher fix only

Only the watcher changes; the freshness gate stays read-only.

The Watcher watches and scans new directories as in a1; the freshness compute and handler do not change.

**Rejected because:** Fixes the cause but leaves the gate unable to recover from a failed watch or a restart gap; partial on the second fix criterion.

### 8.3 a3: Gate request only

Leave the watcher alone and let the freshness gate request indexing of stale files.

The freshness compute lists every stale held file and the handler queues one file job per mtime; the watcher is unchanged.

**Rejected because:** A workaround that leaves the cause, which the user named as the crux; it violates the first fix criterion.

### 8.4 a4: Re-subscribe the whole repo when a nested directory appears, plus the gate request

On a created directory that has subdirectories, replace the repo's watch with a new one and scan the new tree.

On a create event for a directory with subdirectories, the Watcher unsubscribes the repo's subscription, subscribes again and scans the new directory; the gate request from a1 is kept. Events that occur between the unsubscribe and the new subscription are lost.

**Rejected because:** Trades the doubled watches for a window in which the whole repo is unwatched, which is the kind of loss this Story removes; partial on the first fix criterion.

## 9. References

- **[[c1]]** `code` `src/indexer/watcher.ts:1-103`
- **[[c2]]** `code` `src/indexer/index.ts:233-259`
- **[[c3]]** `code` `src/workflow/code-review/freshness.ts:65-90`
- **[[c4]]** `code` `src/indexer/index.ts:293-303`
- **[[c5]]** `code` `src/daemon/steps/code-review-step/handler.ts:305-372`
- **[[c6]]** `code` `src/indexer/file-selection.ts:57-75`

## 10. Open questions

- Graded partial in the audit (ts1): the Story record has no acceptance criteria; ac1 to ac9 were written in this LLD from the approved issue, the review rounds and the user's decision to bring the watcher into scope. The user confirmed the LLD as the acceptance baseline on 2026-10-27.
- Graded partial in the audit (alt2): the Story has no acceptance criteria, Epic constraints or HLD contracts, so the three scored constraints were taken from the approved issue's fix intent and the user's decision on the watcher; the user confirmed this basis on 2026-10-27.
- The approved ISSUE's root cause says the missing watcher event was not established, and its reproduction step 3 and second cause describe a wait deadlock that does not exist; the ISSUE record has not been revised to match the confirmed cause.
- No test forces the per-directory subscribe call itself to fail; the unreadable-directory test covers the scan and the no-throw guarantee only.

## Resolved questions

- `qfa21e2bd` — Graded partial in the audit (ts1): the Story record has no acceptance criteria; ac1 to ac9 were written in this LLD from the approved issue, the review rounds and the user's decision to bring the watcher into scope. The user confirmed the LLD as the acceptance baseline on 2026-10-27.
  - **resolved**: Use the confirmed LLD baseline — Same decision the user gave on 2026-10-27 for the earlier wording: LLD ac1 to ac9 govern acceptance; the Story record stays without criteria. _(2026-10-27T07:40:34.059Z)_
- `qb61bbcfb` — Graded partial in the audit (alt2): the Story has no acceptance criteria, Epic constraints or HLD contracts, so the three scored constraints were taken from the approved issue's fix intent and the user's decision on the watcher; the user confirmed this basis on 2026-10-27.
  - **resolved**: Proceed with the confirmed basis — Same decision the user gave on 2026-10-27 for the earlier wording: the approved issue's fix intent and the user's watcher decision are the scoring basis; the audit stays graded partial. _(2026-10-27T07:41:12.085Z)_
- `q20632acb` — The approved ISSUE's root cause says the missing watcher event was not established, and its reproduction step 3 and second cause describe a wait deadlock that does not exist; the ISSUE record has not been revised to match the confirmed cause.
  - **resolved**: Revise ISSUE before planning — User chose option 1. The issue stage cannot revise in place, so the corrected record is ISSUE-75eaf053e7b7cddd (approved 2026-10-27, no follow-on chain started). The approved LLD and this plan stay under epic fa396bdf197b8e8b; the old ISSUE-fa396bdf197b8e8b stays on the ledger with its inaccurate text and is superseded by the new one. _(2026-10-27T07:50:02.403Z)_

## Citations

- **[[c1]]** `code` `src/indexer/watcher.ts:1-103`
- **[[c2]]** `code` `src/indexer/index.ts:233-259`
- **[[c3]]** `code` `src/workflow/code-review/freshness.ts:65-90`
- **[[c4]]** `code` `src/indexer/index.ts:293-303`
- **[[c5]]** `code` `src/daemon/steps/code-review-step/handler.ts:305-372`
- **[[c6]]** `code` `src/indexer/file-selection.ts:57-75`
