# Plan: syncing origin/main into v2

Written 2026-11-03. The conflict register is [`main-sync-conflicts.md`](main-sync-conflicts.md); every conflict is recorded there with its impact, and resolved entries get a log block.

## Where the branches are

- Merge base `6378146c7` (2026-10-26). main has **880** commits since (3763 files; 2511 of them docs, 270 in `.insrc`), v2 has **1316** (9724 files).
- A dry-run merge gives **119 conflicted files, 183 hunks**; 8 are critical (storage), 37 are files v2 deleted and main changed.
- The last sync was `0247a87a9` (2026-10-26, "origin/main into v2, second round"). The previous ones were `ba438d1b3` and `8e1582bb9`.

## What main brought (by commit scope)

build 480, workflow 119, memory 44 (native project-memory package), review 40, connections 34, record 18, design 17, indexer 12, plan 11, vscode 8. In code: `packages/project-memory`, the connection manager, the subsystem pass and its scheduler, the session pool and abort routing in `daemon/threads`, FileFilter replacing the ignore helpers, model definitions with Claude on Ollama and a Mistral Vibe family, entity_by_file and schema 7 and 8, owned and resumable reviews.

What v2 brought that main lacks: the common artifact model and lifecycle service, the tool registry cutover (git, gh and Jira as typed tools; the build fails on a direct spawn), task review and design review replacing the old engines, the repo gate, the team signoff features, `gitHooks`, route-dependent code review.

## Approach

1. **Merge, do not rebase.** v2 is pushed and has 1316 commits; rewriting it would break everyone's clone.
2. **Do it away from the working tree.** The tree now holds another session's uncommitted design-review files. The merge runs in a separate worktree of v2 (detached), so those files are not touched, and v2 is only moved at the end by a fast-forward.
3. **Merge in layers, not in one go.** One `git merge origin/main` leaves 119 files and the semantic breaks at once. Instead:
   - **Layer A (no conflict, mechanical):** merge, take both sides for docs, `.insrc` records and generated fixtures with the rules in the register (ledger heads by lifecycle, fixtures regenerated, never hand-merged).
   - **Layer B (storage):** after decision D1. Schema numbering, migrations, entities, store, their tests.
   - **Layer C (providers and shared types):** providers, tool loop, `shared/types.ts`, ipc-client, review-stream, step-context.
   - **Layer D (daemon core):** index, handler-runtime, server, router, step-state, steps host and client, mcp server.
   - **Layer E (review and approval):** after decision D2. gates, pending, runners/build, review contracts, the 37 deleted-vs-changed files.
   - **Layer F (surfaces):** cli, config, steering, package.json, plugins (D4).
   Each layer is resolved, compiled and tested before the next. One commit per layer inside the merge is not possible, so the layers are staged as resolved files and the merge commit message lists them.
4. **Semantic sweep (after the textual merge).** `tsc --noEmit`, `node scripts/forbidden-spawn-scan.mjs --fail`, the registry tests (handler table, method class, repo-call audit and table), the pinned-fixture tests. The known breaks are CRITICAL-3 in the register: main code calling deleted APIs or spawning git directly. Fix by moving the call sites onto the typed tools in the same way s9 did, in separate commits after the merge.
5. **Verify against a clean base, once, in foreground chunks** (the sweep rule): the affected areas of the merged tree against v2 before the merge and against main, comparing failing test names. A failure present in v2 or main alone and not in the merge is a regression of the merge.
6. **Land.** Fast-forward v2 to the merge. The user pushes.

## Decisions needed before the merge

| # | Decision | Recommended |
|---|---|---|
| D1 | Which entity membership index survives, and the schema numbering | **DECIDED 2026-11-03:** keep main's `entity_by_file` (keys `(repoId, filePath)`, repo listing by prefix) and its schema 6, 7, 8 unchanged. Drop v2's `entity_by_repo` and hashed-path index. Port v2's callers (scope reads, bounded readiness, file watermarks) to main's reads. Add a repair step 8 to 9 that clears `entity_by_file`, drops `entity_by_repo` and rebuilds the index from the entity table (harmless on a store already in main's shape), with a test that opens a v2-shaped v6 fixture |
| D2 | What to do with main's review work | **DECIDED 2026-11-03:** the v2 review framework (task review, design review, lifecycle-based approval, `build-freshness`) overrides anything main did on review. The 37 files v2 deleted stay deleted. The shared review-contract files (`gate.ts`, `types.ts`, `code-review-rpc.ts`, the review tests) are hand-merged: v2's design wins, main's non-review edits are kept. Main's review features (chunked diff pipeline, owned resumable reviews, isolated CLI helper, input-fingerprint stale-review refusal) are dropped or replaced and listed under "Intent to port" in the register. Treated as non-review and kept: `approval-owner.ts` (BUILD writer lock) and the pending-list fixes (standalone BUILD without a CR sibling, EXT and AMD in the pending list) |
| D3 | Where the merge runs | **DECIDED 2026-11-03:** a local-only branch `sync-main-into-v2` in a separate worktree, never pushed. After the verification checklist passes, v2 is fast-forwarded to it and the branch is deleted. The branch is the one explicit exception to the no-branches-unless-asked rule, granted for this merge only |
| D4 | Are `vscode-plugin` and `jetbrains-plugin` still supported | **DECIDED 2026-11-03:** yes, they are the live IDE clients (main's CLAUDE.md, user clarification 2026-10-29: the insrc-ide fork is deprecated, the in-tree plugins are not). Take main's side in all 11 plugin conflict files; after the merge list every daemon method the plugins call, compare with the merged handler table and payload shapes, and re-apply a v2 change only where a called method changed. The plugins' own test suites run only if asked |
| D5 | Order relative to the other session's design-review work | **DECIDED 2026-11-03:** the other session is paused until the merge is done. Its uncommitted files (CR-9b04adb36cac716d-s2 records, two build-start files, a design-review tmp file, S002/CR.md) stay in the tree: none of them is a path main changed, so they do not block the fast-forward. Its design-review code is already committed on v2 |
| D6 | Do the new main epics (project memory, connections) need v2's repo gate and tool-registry rules applied inside the merge | **DECIDED 2026-11-03:** no. Merge only; the repo gate, the tool-registry rules (CRITICAL-3), the registry tests and the spawn scan are fixed after the merge is committed, as separate commits on the same branch |

## Recording and analysis

- Every conflict is a row in the register with type, hunks, commits on each side, first-pass impact and a status. At resolution each file gets a log block (decision, confirmed impact, follow-ups, tests).
- Findings that are not textual conflicts (CRITICAL-3, registry misses, compile breaks) are added to the register under the same headings, not lost in commit messages.
- A "intent to port" list collects every main behaviour that a deletion or a replacement would otherwise drop.

## Verification checklist for the merge commit

- `git merge-tree` count of conflicts is zero in the final tree; `git diff --check` is clean.
- `npx tsc --noEmit` clean outside any other session's uncommitted files.
- `node scripts/forbidden-spawn-scan.mjs --fail` reports 0 sites.
- Registry tests (handler table, method class, repo-call audit and table) pass.
- Storage: a store created by v2 at the old v6 opens (or is refused with a clear message), a fresh store reaches the final version, the migration tests pass.
- The approval path: stale review refused, standalone BUILD listed, an adopted raw write approved.
- Providers: Claude on Ollama pre-run check runs before every call; review diagnostics still stream.
- IPC alignment: every daemon method the editor plugins call exists in the merged handler table with a compatible payload (D4).
- Area comparison against the clean bases recorded in `main-sync-sweep.md`.

## What this plan does not do

It does not resolve any conflict and it does not read all 183 hunks. The first-pass impacts come from commit subjects and a few targeted reads (the migrations, the five main files that call removed APIs); each is confirmed when its file is resolved.
