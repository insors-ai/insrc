<!-- insrc:artifact EXT-c2ba6fa62a148ed1-s13 -->

# Extend: complete-consistent-richer-code-index-one — Settling file changes does work proportional to the changed files, never a scan of the repository or the store

> **Extends Epic `complete-consistent-richer-code-index-one`** — this builds on existing docs + code; no new Epic was created.

**Scope:** L   ·   **New Story:** `s13`

Extends Epic `complete-consistent-richer-code-index-one` (c2ba6fa6): adds a Story that makes the settle pass after file events proportional to the changed files, building on DEF-c2ba6fa6, Story s1's settle mode and pending-row index, and absorbing ISSUE-61045de91faef1a0; code in src/indexer/index.ts, src/indexer/cross-file-resolver.ts, src/indexer/external-endpoints.ts, src/indexer/messaging-endpoints.ts and src/db/entities.ts.

## Added Story

### s13: Settling file changes does work proportional to the changed files, never a scan of the repository or the store

**User value:** After an edit, a branch switch or a merge, the graph catches up in time proportional to what changed: a burst of file events no longer costs one whole-repository resolve per file, and reading one file's or one repository's entities no longer passes over every other repository's rows. The results are the same as a full index gives.

**Acceptance criteria:**
- **ac1:** Given a repository whose index is complete, and one file in it that changes, when the settle pass for that file event runs, then the entity rows, pending rows and edges it reads are those the changed file defines, imports, exports or awaits, and their number does not grow with the size of the repository or of the store.
- **ac2:** Given a burst of file events touching N files of a repository, when their settle work runs, then the work done grows with N and with what those files touch, not with N times the repository.
- **ac3:** Given the same file changes settled event by event, and the same files indexed by a full index, when the edges and pending-row classes of those files are compared, then they are identical.
- **ac4:** Given a store holding several repositories, when the entities of one file, or of one repository, are read, then no row of another file or another repository is read, and the result is what it is today.

## Building on

- `code` src/indexer/index.ts:866-869 — runCrossFileResolver({ db: this.db, repoRoot: repoPath, sourceRoots, scopeFile: file })
- `code` src/indexer/cross-file-resolver.ts:114 — const entities = await listEntitiesForRepo(opts.db, opts.repoRoot);
- `code` src/db/entities.ts:785 — for (const { key, value } of store.entity.getRange()) {
- `prior-artifact` .insrc/artifacts/ISSUE-61045de91faef1a0.json — Reading the entities of one file or one repository scans the whole entity table
- `stakeholder` chat 2026-10-17 — why scan the repos? the whole point of an event based implementation is to avoid these scans

## Next

Proposed HLD amendment `AMD-c2ba6fa62a148ed1-8` (pending approval — it adds the new Story's boundary).

Approve the HLD amendment (`AMD-c2ba6fa62a148ed1-8`) and the updated Epic, then run `design.story` for the new Story `s13` to produce its LLD.

```
insrc_workflow_step phase=start workflow=design.story params={"epicHash":"c2ba6fa62a148ed1","storyId":"s13"}
```
