# Conflict register: second sync of origin/main into v2

Dry run on 2026-11-06. Nothing was merged. The register comes from `git merge-tree --write-tree --name-only v2 origin/main`, which writes the merge result as a tree object and leaves the working tree and index alone. The first sync is recorded in `docs/plans/main-sync-conflicts.md` and `docs/plans/main-sync-plan.md` (decisions D1-D6); they still apply.

- **Merge base:** `a19eaa8e5`. **origin/main** (`8f1dae848`, fetched today) has 282 commits since; **v2** has 1404. Main changed 353 files (+123,993 / -1,018).
- **Dry-run result tree:** `25827cedf0c2b45563f5c179e3b66e51fdc1d0a8` (reproduce with `git merge-tree --write-tree v2 origin/main`; the object lives until `git gc`).
- **Textual conflicts: 11 files, 19 hunks.** All are content conflicts; there are no modify/delete or add/add conflicts.
- **Semantic conflicts that merge cleanly: 2 found** (S1 and S2 below), both would break the build or a store. More may exist; the sweep after the merge is the proof.
- **Working tree:** it holds the user's uncommitted `CLAUDE.md` edit (+46/-10) and untracked review/LLD files. `CLAUDE.md` conflicts, so the merge must run where that file is clean (a worktree, as in the first sync, D3) and the edit must be reapplied or kept apart.

## Summary

| # | File | Hunks | Severity | Proposed side |
|---|------|-------|----------|---------------|
| S1 | `src/db/graph/migrations.ts`, `store.ts` (clean merge) | 2 migrations | CRITICAL | renumber v2's repair to 9 to 10 |
| S2 | `src/artifact-theme/theme.ts` (clean merge) | 1 | MED | keep one `<style>` wrapper |
| 1 | `vscode-plugin/src/chat/cli-adapter.ts` | 7 | HIGH | hand merge, main's write contract plus v2's endInput and prefix replay |
| 2 | `vscode-plugin/src/chat/session-output.ts` | 2 | HIGH | hand merge, main's pinning plus v2's bounded prefix |
| 3 | `vscode-plugin/src/chat/__tests__/cli-adapter.test.ts` | 1 | MED | combine both assertions |
| 4 | `vscode-plugin/src/chat/__tests__/fixtures.ts` | 3 | LOW | union |
| 5 | `vscode-plugin/src/chat/__tests__/session-output.test.ts` | 1 | LOW | union (both tests) |
| 6 | `src/daemon/db/__tests__/fixtures/session-source-inventory.json` | 1 | MED | regenerate after the merge |
| 7 | `src/db/__tests__/search-evidence.test.ts` | 1 | LOW | follows S1 |
| 8 | `src/db/__tests__/subsystem-tables.test.ts` | 2 | LOW | follows S1 |
| 9 | `src/db/graph/__tests__/operational.test.ts` | 1 | LOW | follows S1 |
| 10 | `CLAUDE.md` | 1 | LOW | v2's side |
| 11 | `src/artifact-theme/__tests__/theme.test.ts` | 1 | LOW | v2's side |

## Semantic conflicts (no textual conflict)

### S1 CRITICAL: both sides claim schema 9

- **main** (`2a12a46d8`, s10/t1, 2026-11-04) added `MIGRATION_V8_TO_V9`: the `doc_relation_proposals`, `doc_relation_proposals_carry` and `doc_relation_quality` databases, and set `SCHEMA_VERSION = 9`.
- **v2** (D1 of the first sync) added its own `MIGRATION_V8_TO_V9`: the repair of a store built by the retired v2 entity index (clear and rebuild `entity_by_file`, drop `entity_by_repo`), with `SCHEMA_VERSION = 9`.
- **In the merged tree** `migrations.ts` exports `MIGRATION_V8_TO_V9` twice (lines 442 and 479) and lists it twice in `MIGRATIONS`; `tsc` fails on the duplicate export. `store.ts` carries both version comments under one `SCHEMA_VERSION = 9`.
- **Impact if merged as is:** a store at 8 would run main's no-op and stop at 9, or run the repair only; whichever wins, either the repair or the doc-relation tables is lost for an installed store. A store that main's code already moved to 9 (main's developers, the installed clone if it ever ran main) is never repaired, because v2's step would then be numbered 9 and look done.
- **Files touched by the fix:** `migrations.ts` (rename v2's step to `MIGRATION_V9_TO_V10`, `from: 9, to: 10`, change the log prefixes), `store.ts` (`SCHEMA_VERSION = 10`, add a `v10` note), `migration-v8-to-v9.test.ts` (v2's repair test: rename and repin to 9 to 10), `doc-relations-store.test.ts:82,99` (main's pin, becomes 10), `search-evidence.test.ts`, `subsystem-tables.test.ts`, `operational.test.ts`, `entities-lmdb.test.ts:568` (the exemption message names "v8->v9"; the count stays 3).
- **Proposed:** keep main's v8 to v9 as shipped (never edit a shipped step) and renumber v2's repair to v9 to v10. The repair is idempotent, so it is safe on a store that came from main's code.

### S2 MED: the font tag is wrapped twice

- Both sides fixed the same defect independently: main `01cb976a5` and v2 `e673bdfb5` both wrap the packaged `@font-face` CSS in a `<style>` tag.
- In the merged `src/artifact-theme/theme.ts`, `pageStyleTags` builds `fonts` as `<style data-iv-fonts>...</style>` (line 319) and returns `<style>${fonts}</style>` (line 323): a `<style>` nested in a `<style>`. The browser reads the inner tag text as CSS, so the fonts do not load.
- **Impact:** the artifact viewer shows system fonts; the live browser test in `theme-browser.live.test.ts` does not check fonts, so only `theme.test.ts` could catch it.
- **Proposed:** return `${fonts}${light}${dark}${overrides}` (one wrapper, main's `data-iv-fonts` marker) and check the `theme.test.ts` font assertion.

## Textual conflicts

### 1. `vscode-plugin/src/chat/cli-adapter.ts` (7 hunks) HIGH

**Detailed analysis of items 1 to 5: `docs/plans/main-sync-2-chat-analysis.md`** (it supersedes the first-pass notes below; notably it finds that a detached Claude turn would never close its stdin).

- **main** (6 commits, newest `8737feaec` 2026-11-05): owned, resumable chat turns for the concurrent-chats epic E202611031bd72813 S001. `write()` returns a boolean and reports async failure through `onError`; a failed decision is not consumed and is reported as delivery-failed; the decoder state (selection ids, native session id, `toolCommands`, `editPaths`) is saved in the observer checkpoint and restored on resume; a resumed read ends at the turn-end marker or a verified-dead pid, and EOF without a terminal event is an observation failure; Ollama routing for Claude models; Vibe prompt binding.
- **v2** (5 commits, newest `31ebd07c2` 2026-11-04): end the Claude CLI stdin at the correlated result so the chat lock is released (`endInput()` on the process seam); finish a Claude turn on its correlated request result (`requestUuid`); rebuild the retained result state on resume by replaying the turn's prefix (`tail` with `fromTurnStart` and `beforeOffset`), emitting `done` if the result is already there.
- **Hunks:**
  1. imports: v2 `randomUUID`, main `ollama-routing`. Take both.
  2. process seam type: v2 `write?(): void | Promise<void>` plus `endInput?()`, main `write?(data, onError?): boolean`. Take main's `write`, add v2's `endInput`.
  3. `decide`: v2 treats the write as best effort; main consumes the request only after an accepted write and re-registers it on async failure. Take main's; v2's behaviour (always consumed) contradicts main's delivery-failed contract.
  4. resume state: v2 derives `requestUuid` from the turn id; main restores `decoderState`. Needs both: `requestUuid` and the restored fields in one `TurnState`.
  5. resume read: v2 replays the prefix to rebuild `state.result`, then tails; main tails with a `finished` that is false for an absent pid. Needs both: keep main's `finished`, run v2's prefix replay first for Claude.
  6. end of read: v2 yields `done` when a Claude request already has a result, else an error; main yields an observation failure unless the pid is verified dead. Keep main's terminal rule and v2's `done` for a result found in the replay.
  7. process seam implementation: v2 `endInput`, main `write` with delivery checks. Keep both properties.
- **Impact:** the chat panel in VS Code (and the JetBrains plugin through the same IPC). Wrong merge symptoms: a Claude turn that never releases its chat lock (v2's bug, fixed on v2 on 2026-11-04), a decision reported delivered when stdin was dead, a resumed chat that replays or drops tool results. This is the file where the two designs overlap most; hunks 4 to 6 are one change and must be merged together.
- **Tests that pin it:** `cli-adapter.test.ts` (about 1,600 lines on each side), `session-output.test.ts`.

### 2. `vscode-plugin/src/chat/session-output.ts` (2 hunks) HIGH

- **main** (6 commits, 2026-11-04): generation pinning. A registered cursor pins its generation across rollover (archived, not discarded); the tail awaits pending pin IO, re-resolves the file on every read (a rollover renames it), verifies the generation of the file read, and ignores `ENOENT` mid-rename.
- **v2** (2 commits, 2026-10-25): a bounded prefix read for retained turns: `tail(cursor, { fromTurnStart, beforeOffset, signal })` stops at `beforeOffset`, does not replay a partial line, and checks abort between awaits.
- **Hunks:** (a) the start of the read loop: v2 `aborted()` plus `fileFor`, main `await pinIo` plus `let file`. (b) the chunk read: v2 limits the read to `limit - offset - pending.length`; main re-resolves `file`, catches `ENOENT`, and verifies the generation.
- **Proposed:** union. Keep main's re-resolve, `ENOENT` and generation check, and apply v2's `limit` to the length passed to `readRange`; keep `aborted()` before each await; keep `await pinIo` first.
- **Impact:** a bad union either reads past the checkpoint (the prefix replay in cli-adapter hunk 5 then replays visible lines) or follows the wrong generation after a rollover (lost output). The hunk 2 `remaining <= 0` return must still happen before the rollover re-resolve, or a pinned archive is read forever.

### 3. `vscode-plugin/src/chat/__tests__/cli-adapter.test.ts` (1 hunk) MED

- Test for a decision written to a process started without an input. v2 filters out `user` writes (the structured first input) and expects one undeliverable warning; main expects no writes and two warnings (a failed decision is not consumed, so both clicks warn).
- **Proposed:** v2's `filter(w => JSON.parse(w).type !== 'user')` with main's count of 2. Follows hunk 3 of the adapter.

### 4. `vscode-plugin/src/chat/__tests__/fixtures.ts` (3 hunks) LOW

- v2 adds `inputEnds()`, main adds `failWrites()` to the fake process. Independent properties; take both in all three places.

### 5. `vscode-plugin/src/chat/__tests__/session-output.test.ts` (1 hunk) LOW

- Both sides added a new test at the same spot (v2 the bounded prefix tests, main the pinned generation test). Keep both tests.

### 6. `src/daemon/db/__tests__/fixtures/session-source-inventory.json` (1 hunk) MED

- A generated inventory with source digests. v2 restaged it in the first sync (connection inventory, catalog repin); main's S003 work added or changed rows (s10 doc-relations files). The digests of any file changed by either side differ.
- **Proposed:** do not merge by hand; take either side to clear the markers, then regenerate from the merged tree with the generator and check the owning test.

### 7 to 9. Schema pins (4 hunks in 3 tests) LOW

- `search-evidence.test.ts`, `subsystem-tables.test.ts`, `operational.test.ts`: v2 pinned `SCHEMA_VERSION` 9 for the repair, main pinned 9 for the doc-relation tables (and a `>= 8` check, `SCHEMA_VERSION` in place of a literal). Both become 10 under S1; prefer main's non-literal form (`SCHEMA_VERSION`, `>= 8`) where it exists so the next bump does not break them. Comment texts name the step, so reword them.

### 10. `CLAUDE.md` (1 hunk) LOW

- main refreshed the steering block (`330ab0a3d`) with uppercase `LLD-<hash>-S001`; v2 kept lowercase `s1` (v2's lowercase-id rule). Main's added wording (every name must come back `presented`, "approve all" scope) is already in the working copy of CLAUDE.md as part of the user's uncommitted edit.
- **Proposed:** take v2's lowercase id; keep main's added approval wording. Do this in the worktree and leave the user's uncommitted edit untouched.

### 11. `src/artifact-theme/__tests__/theme.test.ts` (1 hunk) LOW

- Same assertion; v2 names the `lightStart` index first. Take v2's. (See S2 for the production file.)

## Not conflicting, to confirm during the sweep

- main added `packages/project-memory` changes, `src/shared/doc-relations-status.ts`, indexer tests, three analyzer exploration files and a large set of records under `docs/standalone/` and `docs/epics/`; none overlap v2.
- A scan of main's added lines in production `src/**/*.ts` finds no use of `runGit`, `runGitAsync`, `runGh`, `commitAndPushArtifacts`, `createGitRunner`, `child_process`, `execFile` or `spawn(`, so the first sync's CRITICAL-3 does not recur. The forbidden-spawn scan still runs in the build.
- New daemon methods or settings on main must appear in the method-class table, the repo-call audit and the catalog fixtures (first-sync rule). Not yet checked.
- 19 files changed on both sides in `git diff --name-only` (the rename-limit warning means this list may be short); the 11 above conflict, the rest merge cleanly.

## Resolution log

Merge commit `74bd5eca1` (worktree `insrc-sync`, branch `sync-main-into-v2`), then fix commits. Nothing pushed.

| Item | Decision | Confirmed impact | Tests run | Status |
|---|---|---|---|---|
| S1 schema 9 | D12 | `MIGRATION_V9_TO_V10`, `SCHEMA_VERSION = 10`; the registry order test, the repair test, four pin tests and the exemption message follow | `src/db/graph` and `src/db` migration, operational, subsystem, search-evidence, doc-relations and entities-lmdb tests: 72 pass | done |
| S2 font tag | D13 | one wrapper; `theme.test.ts` asserts no nested `<style>` | artifact-theme tests | done |
| 1 `cli-adapter.ts` | D8-D11 | union as decided; the user message goes through `write(data, onError)`; replay and the pre-terminal checkpoint only without saved decoder state; draining readers keep the cursor before the terminal; legacy ids end at the first result | `cli-adapter`, `cli-adapter-correlation`, `cli-adapter-utf8`, `session-output`: 128 pass, then 129 after the run-config argv update | done |
| 2 `session-output.ts` | D8 | main's pin, re-resolve and generation check with v2's bounded prefix; an archived generation stays readable, so v2's "generation is gone" test now expects the prefix | included above | done |
| 3-5 chat tests | D9, D11 | legacy tests rewritten; user-message writes filtered from decision counts; run-config argv; chat-panel fixture result line carries the request placeholder | `chat-panel.test.ts`: 221 pass | done |
| 6 session-source inventory | regenerated | main's 8 new files take main's classification; 37 digests refreshed; sc6 digests refreshed (this fixes CM-S4-GATE, which failed on v2) | inventory test: 2 of 3 pass | done; the 2 v2 files `src/workflow/convert/repair-amendments.ts` and `src/workflow/review/design-review/provenance.ts` are unclassified on v2 too |
| 7-9 pin tests | D12 | see S1 | see S1 | done |
| 10 `CLAUDE.md` | v2's side | | | done |
| 11 `theme.test.ts` | v2's side plus D13 | | | done |
| not a conflict: `docRelations.measure` | classified `daemon-store` in `repo-call-audit.ts` | the two registry tests failed for the new main method | `repo-call-audit` and `repo-call-table`: pass | done |

### Sweep versus the two parents

`tsc` (root and vscode-plugin), `typecheck:tools`, the forbidden-spawn scan (0 sites failing) and the model-definition check pass. The suites were run in chunks and every failing test was compared with v2 and with main (a clean `origin/main` worktree). No failure is new in the merge except the ones fixed above. Failures that remain are inherited:

- **Also failing on v2:** VS Code `approval-subscribe`, repo-config, webview-host, bundle-catalog, sync-assets and activation tests; `src/mcp` and `src/shared` review-stream and connection-manager tests; `no-live-store-in-tests` (three files); `session-source-inventory` (two unclassified files); `search-guard.test.ts` hangs; workflow gate tests that throw "PENDING REVIEW RE-IMPLEMENTATION" (`approve-build-*`, `gates`, `range-base`, `history`, `convert-preview`, `completion-evidence`).
- **Also failing on main:** `exec-path-scan` "Ollama is never a registrable provider" (main's adapter names Ollama in code); `project-memory-isolation` (needs the project-memory workspace).
- **Environmental in the worktree:** `handleWorkflowRun: START` (needs a registered repo cwd). Under the parallel full-directory runs a few tests hang or time out (`ids.test.ts`, `migration-v6-to-v7`, `git-hooks-methods`, `search-guard`, the long daemon groups); `ids`, `migration-v6-to-v7` and `git-hooks-methods` pass when run alone.
- **Not run in full:** the `chat-panel.test.ts` file never exits on v2 either (one cancelled item, all 168 or 221 tests pass).

Still to do after the fast-forward: D10 (close Claude's stdin when its reader is abandoned; the observer stops an idle process), with the live checks, as tracked work; `npm install` in the main tree; the daemon update.

## Decisions

- **D7 (2026-11-06), chat adapter: keep v2's implementation** (request-UUID correlation, structured input, `endInput`, bounded prefix replay, pre-terminal checkpoint) and address the gaps main fixed. Main's chat turn handling has problems with queues and locks; these are handled as a pre-merge step, before the conflict hunks in `cli-adapter.ts` and `session-output.ts` are resolved. Scope of the pre-merge step is open (see `docs/plans/main-sync-2-chat-analysis.md`, section 4, for the list of main's pieces the clean-merged panel code depends on). This replaces the proposal in section 4 of that file to drop the replay.
- **D8 (2026-11-06), prefix replay rule:** v2's bounded prefix replay and its checkpoint before the terminal event stay, but `resume()` skips the replay when the caller passes `decoderState` or `sawTerminal` (main's observer does), so an observer pass never re-reads the turn from its start. The reload path of the live reader (no saved decoder state) keeps the replay. Main's chat groups A to F (active-chat record, dropdown UI, observer and output pinning, approval queue and delivery contract, per-declaration panels, Ollama/Vibe fixes) are taken as main has them; the adapter (`cli-adapter.ts`, `session-output.ts`) is main's with v2's correlation, `endInput`, replay and UTF-8 changes layered on.
- **D9 (2026-11-06), legacy Claude turn ids (no request UUID):** the `result` line is emitted as the terminal immediately, as on main; v2's deferral to the end of the segment (`state.result` for legacy ids) is dropped. Effect: only turns already running at upgrade can end at a queued result; v2's tests that pin the legacy deferral are removed or rewritten.
- **D10 (2026-11-06), Claude stdin lifetime (Claude only; Codex and Vibe have no stdin, `inputIsPrompt`/`closeInput`, and exit by themselves):** (1) `run()` ends the input in its `finally` when a correlated turn is abandoned (detach, switch chat, stop following); (2) the observer stops an idle Claude process only when the correlated result has been ingested, the checkpoint is saved, the pid is alive and a grace period has passed. EOF behaviour of the CLI mid-turn and the stop's effect on background work are verified live before the merge is accepted.
- **D11 (2026-11-06), stdin write seam:** main's `write(data, onError): boolean` (never throws; only a destroyed or ended stream is undelivered, backpressure is not a failure) is the single seam for both writes to a Claude process: the one user message per process (`formatInput`) and approval decisions. A `false` return or an `onError` before the first event fails the turn with v2's visible error and stops the process; a decision failure follows main's `decide()` path (request stays registered, delivery-failed, follow-up). v2's promise-returning `write` and the await before `onSpawn` go away; the `endInput` seam stays.
- **D12 (2026-11-06), schema 9 clash (S1):** main's `MIGRATION_V8_TO_V9` (document-relationship tables, s10) is kept exactly as shipped. v2's entity_by_file repair is renumbered to `MIGRATION_V9_TO_V10` (`from: 9, to: 10`), `SCHEMA_VERSION = 10`. Tests that pin the version use the constant where possible; the repair test, `doc-relations-store.test.ts`, the three conflicting pin tests and the `entities-lmdb.test.ts` exemption message are updated.
- **D13 (2026-11-06), font tag (S2):** `pageStyleTags` returns `${fonts}${light}${dark}${overrides}` with one wrapper (main's `<style data-iv-fonts>`); `theme.test.ts` takes v2's side of the conflicting hunk and gains an assertion that the output contains no `<style><style`.
