# S005 / t16 — ship and smoke check

Epic c2ba6fa6, Story s5 ("reads of the index's state give a named, truthful answer").

## Ship

- 2026-10-13: the installed daemon was updated to d250513b (the commit that closed t15) with the
  maintenance update function, and restarted. Smoke 1 on that build found a gap, fixed as
  ISSUE-7c255f61 (beb499b5, d4b0371e).
- 2026-10-14 (local clock; log times below are UTC): the installed daemon was updated to e5e374b5
  (origin/main, which carries the ISSUE-7c255f61 fix) and restarted.
  - `daemon.status`: `installedCommit` e5e374b516a39aee07625f45f9feed6ceac8cf94; log `[daemon] ready` at 19:22:17.
  - No store migration and no re-index at start: every registered repository came back `ready`;
    insrc's `lastIndexed` moved only by the start-up refresh of changed files, and no repository
    gained a new `lastRun` (only AFM carries one, from the smoke 2 reindex below).
  - Note: the start must run with the daemon's own directory as the working directory
    (`node --import tsx` resolves `tsx` from it); a start launched from `/tmp` failed with
    `ERR_MODULE_NOT_FOUND: Cannot find package 'tsx'`.

## Smoke 1 — an analyze on an unindexed path is refused before any size is announced

Scope: `/tmp/isc-unindexed`, a directory no registered repository contains.

First run, daemon d250513b (2026-10-13), FAILED for the step tool:

- `analyze.context.buildRun` (target code): refused, `scope-not-indexed`, no size. Pass.
- `insrc_analyze_step` `start` (target code): NOT refused. It returned `emit_plan`, minted a run
  state and announced the size `"XL"` in its user turn; `plan` then ran the lookups over the file
  system and moved to `emit_bundle`. Fail. Cause and fix: ISSUE-7c255f61 (the step tool's scope
  check made only the under-index check).

Re-run, daemon e5e374b5 (2026-10-14): PASS.

- `insrc_analyze_step` `start`, target code, through the MCP server (forwarded to the daemon by
  `step.call`):
  `{"next":"error","error":{"code":"scope-not-indexed","message":"Scope /tmp/isc-unindexed produced an empty graph closure. No registered repo contains this path. Reason: no registered repo contains the scope path. Run `insrc repo add <path>` and let the indexer finish (status: 'ready') before re-running analyze.","retryable":false}}`
  — no plan prompt, no size, no state.
- The same with target docs: the same reply.
- `analyze.context.buildRun`, target code:
  `{"ok":false,"error":{"code":"scope-not-indexed","message":"Scope /tmp/isc-unindexed produced an empty graph closure. ...","data":{"scopePath":"/tmp/isc-unindexed"}}}`.

Out of scope here and filed apart: a DOCS request through `analyze.context.buildRun`, `analyze.plan`,
the one-shot `insrc_analyze` and workflow grounding is not refused on such a path (ISSUE-0c845762).

## Smoke 2 — a request during a reindex is refused with 'repo-indexing' and its figures

Repository: AFM (`/Users/subhagho/work/projects/AFM`, 393 files), reindexed with `repo.reindex` on
daemon d250513b. A probe (`/tmp/smoke-s5.mjs`, log `/tmp/smoke-s5-afm2.log`) polled the registry
every 50 ms and, while the row read `indexing`, made three requests. The reindex waited ~1.5 h
behind the daemon's queue of document summaries; the run itself took ~3 s.

- Row during the run: `{"status":"indexing"}` (no `lastIndexed`).
- `search.closure {repoPath: AFM}`:
  `"repo-indexing: The repository /Users/subhagho/work/projects/AFM is being indexed: the run began at 2026-10-13T17:51:09.527Z, 393 of 393 files done. Retry once the index is ready."`
- `repo.depends_on {repoId: AFM}`: the same error.
- `analyze.context.buildRun` (code, AFM):
  `{"ok":false,"error":{"code":"repo-indexing","message":"The repository /Users/subhagho/work/projects/AFM is being indexed: the run began at 2026-10-13T17:51:09.527Z, 393 of 393 files done. Retry once the index is ready.","data":{"repoPath":"/Users/subhagho/work/projects/AFM","status":"indexing","run":{"startedAt":1791913869527,"filesSelected":393,"filesDone":393}}}}`

PASS.

## Smoke 3 — after the reindex the row shows lastRun

- Row after the run: `{"status":"ready","lastIndexed":"2026-10-13T17:51:12.485Z","lastRun":{"startedAt":1791913869527,"endedAt":1791913872485,"filesSelected":393,"filesDone":393,"outcome":"completed"}}`
- `search.closure {repoPath: AFM}` answers again: `["/Users/subhagho/work/projects/AFM"]`.
- The row still carries the same `lastRun` after the daemon restart on 2026-10-14.

PASS.
