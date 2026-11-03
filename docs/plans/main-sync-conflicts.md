# Conflict register: merging origin/main into v2

Dry run on 2026-11-03. Nothing was merged: the register comes from `git merge-tree --write-tree HEAD origin/main`, which writes the merge result as a tree object without touching the working tree or the index.

- **Merge base:** `6378146c7` (2026-10-26). **origin/main** has 880 commits since; **v2** has 1316.
- **Dry-run result tree:** `c5be5cfdbaf7b1040db29b464ec3d9588b0825b0` (reproduce with `git merge-tree --write-tree HEAD origin/main`; the object lives in the object store until `git gc` removes it).
- **Textual conflicts: 119 files, 183 conflict hunks** (79 content, 38 modify/delete, 2 add/add). 166 files changed on both sides; the other 47 merge cleanly but may still break (see the semantic list below).
- **How to read an entry.** `main` and `v2` give the number of commits that touched the file since the merge base and the newest subject. *First-pass impact* is inferred from those subjects and the surrounding code, not from reading every hunk; each entry is confirmed when the file is resolved, by filling in the **Resolution log** at the end of this file (decision, confirmed impact, tests run). Status starts `open`.

## Summary by severity

| Severity | Files | Meaning |
|---|---|---|

| CRITICAL | 8 | two designs for the same thing; a decision comes before any merge |
| HIGH | 75 | behaviour changes on both sides; manual merge and a targeted test |
| MED | 25 | mostly a union; regenerate or re-run a test |
| LOW | 11 | take one side |

## Critical findings (read first)

### CRITICAL-1: both sides built the same entity membership index, with the same schema number

- v2 (`2cce1be89`, `6c5dee273`, `d31c835d5`, `50563f003`, 2026-10-24) added transactional entity membership indexes `entityByFile` and `entityByRepo`, a v5 to v6 backfill that keys by the absolute file path, and moved the scope reads onto them.
- main (`f054482bb`, 2026-11-01, "add entity_by_file for proportional file/repo entity reads") added an index of the same name and its own v5 to v6 backfill that keys by `(repoId, filePath)`. main then went on to schema 7 and 8 (subsystem tables `f1c1e5b0a`, languages and table/view kinds `7348f340d`, edge-row byte codec `71b4348d2`).
- Both register `MIGRATION_V5_TO_V6` under the same name with different key encodings, and `src/db/graph/migrations.ts`, `store.ts`, `src/db/entities.ts` (11 hunks) and four migration tests conflict. A repository already opened by a v2 build has a v6 store that main's v6 code would read with the wrong key shape, and the reverse.
- **Decided (D1, 2026-11-03): keep main's index.** Drop v2's `entity_by_repo` and hashed-path index, port v2's callers to main's reads, keep main's schema 6, 7, 8, and add a repair step 8 to 9 (clear `entity_by_file`, drop `entity_by_repo`, rebuild from the entity table) so a store built by v2 code is repaired.

### CRITICAL-2: the review engine diverged

- v2 retired the old review engines (`da0f491d1`, `7e640edec`, 2026-10-30/11-01) and built task review and design review. 37 conflicts are files v2 deleted and main changed (`src/workflow/code-review/*`, `review-pipeline/*`, `daemon/steps/code-review-step/*`, and their tests).
- main kept building on those files: owned, resumable reviews with pinned continuation state (`9d87b90e1`, `e92c06614`), bounded operation transport contracts (`7b6822e02`), isolated CLI helper execution (`2e042cd47`), the review pipeline, stale-review refusal at the BUILD boundary (`e777060ff`, `161256f3b`).
- Keeping the deletion drops those features. **Decided (D2, 2026-11-03): the v2 review framework overrides anything main did on review.** The deleted files stay deleted; the shared review-contract files (`gate.ts`, `types.ts`, `code-review-rpc.ts`, the review tests) are hand-merged with v2's design winning and main's non-review edits kept. Dispositions are in "Intent to port" at the end of this file.

### CRITICAL-3: main's new code uses what v2 removed, and calls git directly (not a textual conflict)

- main-only code still calls `runGit`, `runGitAsync`, `runGh`, `commitAndPushArtifacts` and `createGitRunner` (src/workflow/team/*, src/workflow/tracker/github*.ts, questions.ts, resolve-comment.ts, cli/services/workflow.ts, design/corpus/sources/git-reader.ts), all deleted on v2 by the tool-registry cutover (s9).
- New main files spawn git themselves (`src/indexer/file-filter.ts`, `src/workflow/code-review/input-fingerprint.ts`, `src/workflow/runners/build/changed-files.ts` and others). v2 runs `scripts/forbidden-spawn-scan.mjs --fail` in the build, so these fail the build until moved onto the typed git tools.
- `src/workflow/artifacts/companion/header.ts` imports `repo-ignore-config.js`, which main deleted (s6/t9).
- The textual merge will not show any of this; `tsc` and the scan will. Phase 4 of the plan covers it.

## Other semantic risks (merge cleanly, may break)

- 47 files changed on both sides without a textual conflict (166 changed on both, 119 conflict). The list comes from the two `git diff --name-only` sets against the merge base and is recomputed at merge time.
- Registries scanned by tests: every new daemon method on main must appear in the method-class table and the repo-call audit (v2 rule); main's `index.subsystems`, languages and memory methods are new.
- Settings and the config catalog: main added model-family and tier settings; v2 added `gitHooks`. The catalog fixture and the settings tests pin the lists.
- Pre-conversion forms: v2 converted artifact ids and stories (lowercase story ids, feedback moved to a sidecar, `permissions.mode` retired). main's code, tests and records may still use the old forms (one production file on main still mentions `permissions.mode`); not checked beyond that grep.
- The in-tree editor plugins (`vscode-plugin`, `jetbrains-plugin`) mirror daemon IPC types; main changed 121 and 66 files there.
- New on main with no v2 counterpart: `packages/project-memory` (75 files, a native memory store), the connection manager (`src/shared/connection-manager`), the subsystem pass and scheduler in the indexer, the session pool in `daemon/threads`, FileFilter, model definitions with the Ollama-hosted Claude and Mistral Vibe families.

## Conflicts by area


### Storage: entity membership index and schema versions (8)

**Severity:** CRITICAL. **Impact (first pass):** Both sides added an entity membership index by file and repository and both claim schema version 6 (v2: 6c5dee273/2cce1be89; main: f054482bb); main continues to versions 7 and 8 (subsystem tables, languages). Same name, different key encodings and backfill.

**Proposed resolution:** Pick one design for the v6 index, renumber the other side's migration, and give main's v7/v8 the following numbers. Needs a decision before any text is merged; see CRITICAL-1.

| File | Type | Hunks | main (commits, newest) | v2 (commits, newest) | Status |
|---|---|---|---|---|---|
| `src/db/__tests__/doc-summary-carry.test.ts` | content | 2 | 1: f054482bb 2026-11-01 feat(db): add entity_by_file for proportional file/repo entity reads | 2: 6c5dee273 2026-10-24 feat(build): s1/t1 add entity membership indexes and schema6 backfill | resolved |
| `src/db/entities.ts` | content | 11 | 16: 067af4f5e 2026-11-03 fix(db): a file commit records its file once (ISSUE-7d42b5dc t1) | 4: 50563f003 2026-10-24 feat(build): s1/t4 use bounded readiness and indexed file watermarks | resolved |
| `src/db/graph/__tests__/migration-v4-to-v5.test.ts` | content | 2 | 3: f1c1e5b0a 2026-11-02 feat(build): s8/t1 subsystem tables and schema 8 ((no issue)) | 1: 6c5dee273 2026-10-24 feat(build): s1/t1 add entity membership indexes and schema6 backfill | resolved |
| `src/db/graph/__tests__/migration-v5-to-v6.test.ts` | add/add | 2 | 1: f054482bb 2026-11-01 feat(db): add entity_by_file for proportional file/repo entity reads | 2: 85887da0b 2026-10-24 test(build): s1/t1 exercise raw v5 startup and long path backfill | resolved |
| `src/db/graph/__tests__/operational.test.ts` | content | 1 | 3: f1c1e5b0a 2026-11-02 feat(build): s8/t1 subsystem tables and schema 8 ((no issue)) | 1: 6c5dee273 2026-10-24 feat(build): s1/t1 add entity membership indexes and schema6 backfill | resolved |
| `src/db/graph/migrations.ts` | content | 1 | 3: f1c1e5b0a 2026-11-02 feat(build): s8/t1 subsystem tables and schema 8 ((no issue)) | 1: 6c5dee273 2026-10-24 feat(build): s1/t1 add entity membership indexes and schema6 backfill | resolved |
| `src/db/graph/store.ts` | content | 1 | 9: fe1d42528 2026-11-03 feat(db): record files whose subsystem grouping inputs change (ISSUE-7 | 3: ba438d1b3 2026-10-25 merge: origin/main into v2 | resolved |
| `src/understanding/__tests__/storage.test.ts` | content | 1 | 3: c53f2db0e 2026-11-03 test(understanding): the store has 41 namespaces with the subsystem in | 2: 85887da0b 2026-10-24 test(build): s1/t1 exercise raw v5 startup and long path backfill | resolved |

### Old review engine: v2 deleted, main changed (37)

**Severity:** HIGH. **Impact (first pass):** v2 deleted this file when it retired the old review engines (da0f491d1, 7e640edec); main kept changing it (resumable owned reviews, bounded transport, Mistral Vibe, review pipeline).

**Proposed resolution:** Keep the deletion. Record the intent of main's change in the "intent to port" list and decide per feature whether task-review/design-review needs it; do not port file by file.

| File | Type | Hunks | main (commits, newest) | v2 (commits, newest) | Status |
|---|---|---|---|---|---|
| `src/cli/services/__tests__/review-source-roots-daemon.test.ts` | deleted in v2 | - | 1: 413c409c8 2026-10-26 feat(build): s5/t10 review command from models.resolveRole | 2: 7d93d7a11 2026-10-28 feat(build): s10/t18 the terminal's approve, sync, tracker setup, revi | resolved |
| `src/daemon/steps/code-review-step/__tests__/coverage-normalized-paths.test.ts` | deleted in v2 | - | 1: f97e952ac 2026-10-27 fix(review): revalidate owned input identity at publication | 10: da0f491d1 2026-11-01 refactor(review): remove retired engines and fail closed at old entryp | resolved |
| `src/daemon/steps/code-review-step/__tests__/handler.test.ts` | deleted in v2 | - | 1: 83f4eba30 2026-10-27 feat(build): S001/t18 drive bounded controller review calls with repla | 15: da0f491d1 2026-11-01 refactor(review): remove retired engines and fail closed at old entryp | resolved |
| `src/daemon/steps/code-review-step/__tests__/long-review.test.ts` | deleted in v2 | - | 1: f97e952ac 2026-10-27 fix(review): revalidate owned input identity at publication | 2: da0f491d1 2026-11-01 refactor(review): remove retired engines and fail closed at old entryp | resolved |
| `src/daemon/steps/code-review-step/handler.ts` | deleted in v2 | - | 7: ef850d10d 2026-10-30 feat: Mistral Vibe CLI family + s1/t1 Ollama-hosted family in the mode | 16: da0f491d1 2026-11-01 refactor(review): remove retired engines and fail closed at old entryp | resolved |
| `src/daemon/steps/code-review-step/state-store.ts` | deleted in v2 | - | 4: 2e042cd47 2026-10-27 feat(build): S001/t19 execute controller reviews through verified isol | 1: da0f491d1 2026-11-01 refactor(review): remove retired engines and fail closed at old entryp | resolved |
| `src/daemon/steps/code-review-step/types.ts` | deleted in v2 | - | 4: 3fbfb0fa5 2026-10-27 fix(build): S001/t22 resolve final-sweep review integration regression | 6: da0f491d1 2026-11-01 refactor(review): remove retired engines and fail closed at old entryp | resolved |
| `src/workflow/artifacts/provenance/writer.ts` | deleted in v2 | - | 1: 11d7d4a0e 2026-10-26 feat(build): s3/t23 close task and report persistence sinks | 2: 22e8028c1 2026-10-22 feat(build): s9/t39 body.feedback, its writers and the artifact_feedba | resolved |
| `src/workflow/code-review/__tests__/diff-attribution.test.ts` | deleted in v2 | - | 1: 3fbfb0fa5 2026-10-27 fix(build): S001/t22 resolve final-sweep review integration regression | 10: da0f491d1 2026-11-01 refactor(review): remove retired engines and fail closed at old entryp | resolved |
| `src/workflow/code-review/__tests__/diff-grounding.test.ts` | deleted in v2 | - | 3: aef193eae 2026-10-27 feat(review): S001/t4 preserve lossless attributed diff spans | 1: da0f491d1 2026-11-01 refactor(review): remove retired engines and fail closed at old entryp | resolved |
| `src/workflow/code-review/__tests__/gate.test.ts` | deleted in v2 | - | 1: e777060ff 2026-10-27 fix(workflow): refuse stale review approval at shared BUILD boundary | 2: da0f491d1 2026-11-01 refactor(review): remove retired engines and fail closed at old entryp | resolved |
| `src/workflow/code-review/__tests__/grounding-eligibility.test.ts` | deleted in v2 | - | 3: 87a1d6675 2026-10-27 feat(build): S001/t21 reconcile review compatibility and current sourc | 6: da0f491d1 2026-11-01 refactor(review): remove retired engines and fail closed at old entryp | resolved |
| `src/workflow/code-review/__tests__/subject-attribution.test.ts` | deleted in v2 | - | 1: 3fbfb0fa5 2026-10-27 fix(build): S001/t22 resolve final-sweep review integration regression | 10: da0f491d1 2026-11-01 refactor(review): remove retired engines and fail closed at old entryp | resolved |
| `src/workflow/code-review/dimensions/__tests__/coverage-evidence.test.ts` | deleted in v2 | - | 1: deedc5f2c 2026-10-27 feat(review): prepare exact dimension jobs before execution | 5: da0f491d1 2026-11-01 refactor(review): remove retired engines and fail closed at old entryp | resolved |
| `src/workflow/code-review/dimensions/adherence.ts` | deleted in v2 | - | 1: deedc5f2c 2026-10-27 feat(review): prepare exact dimension jobs before execution | 5: da0f491d1 2026-11-01 refactor(review): remove retired engines and fail closed at old entryp | resolved |
| `src/workflow/code-review/dimensions/conventions.ts` | deleted in v2 | - | 1: deedc5f2c 2026-10-27 feat(review): prepare exact dimension jobs before execution | 4: da0f491d1 2026-11-01 refactor(review): remove retired engines and fail closed at old entryp | resolved |
| `src/workflow/code-review/dimensions/coverage.ts` | deleted in v2 | - | 1: deedc5f2c 2026-10-27 feat(review): prepare exact dimension jobs before execution | 5: da0f491d1 2026-11-01 refactor(review): remove retired engines and fail closed at old entryp | resolved |
| `src/workflow/code-review/dimensions/diagram/index.ts` | deleted in v2 | - | 1: deedc5f2c 2026-10-27 feat(review): prepare exact dimension jobs before execution | 2: da0f491d1 2026-11-01 refactor(review): remove retired engines and fail closed at old entryp | resolved |
| `src/workflow/code-review/dimensions/functional-coverage.ts` | deleted in v2 | - | 1: deedc5f2c 2026-10-27 feat(review): prepare exact dimension jobs before execution | 5: da0f491d1 2026-11-01 refactor(review): remove retired engines and fail closed at old entryp | resolved |
| `src/workflow/code-review/dimensions/quality.ts` | deleted in v2 | - | 1: deedc5f2c 2026-10-27 feat(review): prepare exact dimension jobs before execution | 4: da0f491d1 2026-11-01 refactor(review): remove retired engines and fail closed at old entryp | resolved |
| `src/workflow/code-review/dimensions/ux/index.ts` | deleted in v2 | - | 1: deedc5f2c 2026-10-27 feat(review): prepare exact dimension jobs before execution | 2: da0f491d1 2026-11-01 refactor(review): remove retired engines and fail closed at old entryp | resolved |
| `src/workflow/code-review/grounding.ts` | deleted in v2 | - | 4: a5390a694 2026-10-27 feat(review): S001/t5 fit complete diff calls to authoritative budgets | 1: da0f491d1 2026-11-01 refactor(review): remove retired engines and fail closed at old entryp | resolved |
| `src/workflow/code-review/runner.ts` | deleted in v2 | - | 5: 83f4eba30 2026-10-27 feat(build): S001/t18 drive bounded controller review calls with repla | 14: da0f491d1 2026-11-01 refactor(review): remove retired engines and fail closed at old entryp | resolved |
| `src/workflow/review-pipeline/__tests__/code-review-chunking.test.ts` | deleted in v2 | - | 1: a4c8c5144 2026-10-27 fix(review): S001/t1 measure complete structured review input | 5: da0f491d1 2026-11-01 refactor(review): remove retired engines and fail closed at old entryp | resolved |
| `src/workflow/review-pipeline/__tests__/code-review-divided.test.ts` | deleted in v2 | - | 1: deedc5f2c 2026-10-27 feat(review): prepare exact dimension jobs before execution | 5: da0f491d1 2026-11-01 refactor(review): remove retired engines and fail closed at old entryp | resolved |
| `src/workflow/review-pipeline/__tests__/code-review-gather.test.ts` | deleted in v2 | - | 1: a4c8c5144 2026-10-27 fix(review): S001/t1 measure complete structured review input | 5: da0f491d1 2026-11-01 refactor(review): remove retired engines and fail closed at old entryp | resolved |
| `src/workflow/review-pipeline/__tests__/pipeline-job.test.ts` | deleted in v2 | - | 2: 55e892c23 2026-10-27 fix(review): S001/t1 refuse empty oversized framing | 8: da0f491d1 2026-11-01 refactor(review): remove retired engines and fail closed at old entryp | resolved |
| `src/workflow/review-pipeline/adapters/code-review-chunk.ts` | deleted in v2 | - | 3: 4cc01ce6c 2026-10-27 fix(review): validate primary diff finding provenance | 3: da0f491d1 2026-11-01 refactor(review): remove retired engines and fail closed at old entryp | resolved |
| `src/workflow/review-pipeline/adapters/code-review-duplicates.ts` | deleted in v2 | - | 2: 2c3fde281 2026-10-27 fix(review): gather duplication across diff parents | 6: da0f491d1 2026-11-01 refactor(review): remove retired engines and fail closed at old entryp | resolved |
| `src/workflow/review-pipeline/adapters/code-review-gather.ts` | deleted in v2 | - | 3: 2c3fde281 2026-10-27 fix(review): gather duplication across diff parents | 7: da0f491d1 2026-11-01 refactor(review): remove retired engines and fail closed at old entryp | resolved |
| `src/workflow/review-pipeline/adapters/code-review-material.ts` | deleted in v2 | - | 2: deea66b58 2026-10-27 feat(review): S001/t6 adjudicate complete diff parents from fragment e | 1: da0f491d1 2026-11-01 refactor(review): remove retired engines and fail closed at old entryp | resolved |
| `src/workflow/review-pipeline/code-review.ts` | deleted in v2 | - | 8: 83f4eba30 2026-10-27 feat(build): S001/t18 drive bounded controller review calls with repla | 6: da0f491d1 2026-11-01 refactor(review): remove retired engines and fail closed at old entryp | resolved |
| `src/workflow/review-pipeline/driver.ts` | deleted in v2 | - | 5: cd26e5325 2026-10-30 fix(build): s2 code-review fixes for claude on Ollama | 7: da0f491d1 2026-11-01 refactor(review): remove retired engines and fail closed at old entryp | resolved |
| `src/workflow/review-pipeline/envelope.ts` | deleted in v2 | - | 2: bcb286d2c 2026-10-27 feat(review): S001/t2 enforce isolated bounded CLI admission | 2: da0f491d1 2026-11-01 refactor(review): remove retired engines and fail closed at old entryp | resolved |
| `src/workflow/review-pipeline/job.ts` | deleted in v2 | - | 5: 7f3c1889b 2026-10-27 fix(review): enforce timed dispatch and await owned shutdown | 11: da0f491d1 2026-11-01 refactor(review): remove retired engines and fail closed at old entryp | resolved |
| `src/workflow/review-pipeline/types.ts` | deleted in v2 | - | 4: 9fc0d016b 2026-10-27 fix(review): rebuild refused diff ranges with frozen timing | 5: da0f491d1 2026-11-01 refactor(review): remove retired engines and fail closed at old entryp | resolved |
| `src/workflow/review/__tests__/same-party-refusal.test.ts` | deleted in v2 | - | 1: 413c409c8 2026-10-26 feat(build): s5/t10 review command from models.resolveRole | 4: da0f491d1 2026-11-01 refactor(review): remove retired engines and fail closed at old entryp | resolved |

### Review and approval contracts (8)

**Severity:** HIGH. **Impact (first pass):** Shared review/approval contract that v2 kept but reshaped (task-review, route-dependent documents, lifecycle adoption) and main extended (stale-review refusal at the BUILD boundary, resumable owned reviews).

**Proposed resolution:** Merge by hand, keeping v2's routes and adding main's stale-review refusal as a rule on the new flow; re-run the approval-gate tests.

| File | Type | Hunks | main (commits, newest) | v2 (commits, newest) | Status |
|---|---|---|---|---|---|
| `src/daemon/__tests__/code-review-rpc-fallback.test.ts` | content | 1 | 1: f97e952ac 2026-10-27 fix(review): revalidate owned input identity at publication | 6: da0f491d1 2026-11-01 refactor(review): remove retired engines and fail closed at old entryp | resolved |
| `src/daemon/__tests__/code-review-rpc.test.ts` | content | 2 | 1: f97e952ac 2026-10-27 fix(review): revalidate owned input identity at publication | 6: da0f491d1 2026-11-01 refactor(review): remove retired engines and fail closed at old entryp | resolved |
| `src/daemon/code-review-rpc.ts` | content | 1 | 5: ef850d10d 2026-10-30 feat: Mistral Vibe CLI family + s1/t1 Ollama-hosted family in the mode | 12: da0f491d1 2026-11-01 refactor(review): remove retired engines and fail closed at old entryp | resolved |
| `src/workflow/__tests__/approve-build-completion.test.ts` | content | 1 | 1: 3fbfb0fa5 2026-10-27 fix(build): S001/t22 resolve final-sweep review integration regression | 3: 100305e6f 2026-10-26 feat(build): s1/t3 approve-build-completion builds its code reviews wi | resolved |
| `src/workflow/__tests__/gates.test.ts` | content | 2 | 1: e777060ff 2026-10-27 fix(workflow): refuse stale review approval at shared BUILD boundary | 3: 86f50f1d8 2026-10-22 feat(build): s9/t27 reject and stale acknowledgement go through the li | resolved |
| `src/workflow/__tests__/other-party-review-gate.test.ts` | content | 1 | 1: e777060ff 2026-10-27 fix(workflow): refuse stale review approval at shared BUILD boundary | 6: a8e91b955 2026-10-28 fix(build): s10 the full sweep: the new daemon methods are classified, | resolved |
| `src/workflow/code-review/gate.ts` | content | 1 | 2: e777060ff 2026-10-27 fix(workflow): refuse stale review approval at shared BUILD boundary | 7: da0f491d1 2026-11-01 refactor(review): remove retired engines and fail closed at old entryp | resolved |
| `src/workflow/code-review/types.ts` | content | 1 | 6: f97e952ac 2026-10-27 fix(review): revalidate owned input identity at publication | 10: da0f491d1 2026-11-01 refactor(review): remove retired engines and fail closed at old entryp | resolved |

### Approval, pending list and BUILD records (4)

**Severity:** HIGH. **Impact (first pass):** v2 moved approval, pending and BUILD records onto the lifecycle service (adoption of raw writes, current build-bound review); main added stale-review refusal and a pending-list fix for standalone BUILD records.

**Proposed resolution:** Merge by hand; every main rule is kept only if it still fires on the lifecycle-service path. Test: approve with a stale review is refused, standalone BUILD listed without a CR sibling.

| File | Type | Hunks | main (commits, newest) | v2 (commits, newest) | Status |
|---|---|---|---|---|---|
| `src/workflow/gates.ts` | content | 8 | 2: e777060ff 2026-10-27 fix(workflow): refuse stale review approval at shared BUILD boundary | 36: e921a001c 2026-11-03 feat(build): s1/t2 the approve path adopts a raw content write: inspec | resolved |
| `src/workflow/pending.ts` | content | 1 | 2: 9da5a38b2 2026-10-31 fix(review-pane): pane follows external decisions; EXT and AMD enter t | 4: 702bcec3f 2026-10-22 feat(build): s9/t22 pending, admission, chain and the content view rea | resolved |
| `src/workflow/runners/build/completion-record.ts` | content | 4 | 1: f95fb9657 2026-10-27 fix(build): preserve unchanged completion ledger identity | 10: f61348e05 2026-11-01 feat(build): s9/t6 callers of the synchronous runners await them | resolved |
| `src/workflow/runners/build/standalone-record.ts` | content | 7 | 3: e777060ff 2026-10-27 fix(workflow): refuse stale review approval at shared BUILD boundary | 14: 9419ae51b 2026-11-01 feat(build): s9/t11 build range base, standalone record and the gate's | resolved |

### LLM providers and tool loop (4)

**Severity:** HIGH. **Impact (first pass):** main: Claude on Ollama (target option, pre-run check, per-run environment), Mistral Vibe family, session error sinks; v2: bounded native review output diagnostics, scoped feedback, activity streaming, async tool paths.

**Proposed resolution:** Union of both; keep main's Ollama pre-run check ahead of every call and v2's diagnostics around it. Many hunks (8-10): resolve with both commit lists open.

| File | Type | Hunks | main (commits, newest) | v2 (commits, newest) | Status |
|---|---|---|---|---|---|
| `src/agent/providers/cli-provider.ts` | content | 8 | 8: cd26e5325 2026-10-30 fix(build): s2 code-review fixes for claude on Ollama | 19: 6c02faf63 2026-11-02 feat(build): supply scoped previous-round review failure feedback | resolved |
| `src/agent/providers/ollama.ts` | content | 10 | 6: 15155ec65 2026-10-30 feat(build): s2/t2 checkOllamaTarget pre-run check | 15: b076f9581 2026-11-01 feat(build): s1/t1 define review activity contracts and inactivity mon | resolved |
| `src/agent/providers/structured-output.ts` | content | 4 | 6: 3fbfb0fa5 2026-10-27 fix(build): S001/t22 resolve final-sweep review integration regression | 7: c034aeb45 2026-11-02 feat(build): s1/t1 capture bounded native review output diagnostics | resolved |
| `src/agent/read-only-tool-loop.ts` | content | 2 | 2: 31d7aaa7d 2026-10-26 Close Session tool RPC diagnostic and failure envelopes | 8: 74966b3f5 2026-11-01 fix(build): s9/t23 classify git_status.paths and drop the deleted wrap | resolved |

### Daemon core wiring, transport and shared types (20)

**Severity:** HIGH. **Impact (first pass):** Daemon wiring, router, step state and shared transport types: main added session pool, persistent IPC lanes, abort and run-status routing, subsystem scheduler; v2 added repo gate, review state claims, closeAware rpc, design/task review methods.

**Proposed resolution:** Hand-merge as a union; every method added by either side must appear in the handler table, method-class table and repo-call audit (those lists are scanned by tests). Re-run the registry tests.

| File | Type | Hunks | main (commits, newest) | v2 (commits, newest) | Status |
|---|---|---|---|---|---|
| `src/daemon/__tests__/handler-runtime.test.ts` | content | 1 | 9: 674989914 2026-11-02 feat(build): s8/t6 the index.subsystems request ((no issue)) | 11: f176f357b 2026-11-03 feat(build): s1/t6 add the repo.gitHooks install, uninstall and status | resolved |
| `src/daemon/handler-runtime.ts` | content | 1 | 17: 674989914 2026-11-02 feat(build): s8/t6 the index.subsystems request ((no issue)) | 29: 43db4833b 2026-11-03 feat(build): s2/t7 expose trusted recovery and failure over MCP and IP | resolved |
| `src/daemon/index.ts` | content | 4 | 16: a41fff7b9 2026-11-03 feat(indexer): one scheduler paces subsystem passes and retries failed | 20: 1e91c7bcd 2026-11-02 feat(build): s9/t3 tracker refresh hooks on git_pull and git_push | resolved |
| `src/daemon/server.ts` | content | 1 | 6: 90a7133e1 2026-10-27 fix(build): s2/t3 a request whose method is not a string is answered i | 6: 0247a87a9 2026-10-26 merge: origin/main into v2 (second round) | resolved |
| `src/daemon/shutdown.ts` | content | 1 | 1: e40c8c9f6 2026-10-26 Retain closed Session cleanup handles and reservations through actual  | 4: adbcc33c0 2026-10-25 Enforce independent shutdown duration with a monotonic clock | resolved |
| `src/daemon/steps/daemon-client.ts` | content | 1 | 3: 2ba5a8688 2026-10-28 feat(build): s3/t4 per-method in-daemon route and the session purge's  | 2: da0f491d1 2026-11-01 refactor(review): remove retired engines and fail closed at old entryp | resolved |
| `src/daemon/steps/host.ts` | content | 2 | 2: ef850d10d 2026-10-30 feat: Mistral Vibe CLI family + s1/t1 Ollama-hosted family in the mode | 9: 2760fc272 2026-11-03 feat(build): s1/t7 expose current design review through MCP | resolved |
| `src/daemon/threads/__tests__/helpers/step-state-worker.ts` | content | 1 | 2: 83f4eba30 2026-10-27 feat(build): S001/t18 drive bounded controller review calls with repla | 4: dcf268364 2026-10-27 Fix review budget admission, controller recovery and diagnostics | resolved |
| `src/daemon/threads/__tests__/step-state.test.ts` | content | 1 | 2: 83f4eba30 2026-10-27 feat(build): S001/t18 drive bounded controller review calls with repla | 3: da0f491d1 2026-11-01 refactor(review): remove retired engines and fail closed at old entryp | resolved |
| `src/daemon/threads/router.ts` | content | 5 | 16: 0b79d0161 2026-10-31 fix(build): S001 keep each abort-broadcast target busy until its own r | 5: 5d8affec9 2026-11-03 feat(build): s1/t8 add compiled review verification and route regressi | resolved |
| `src/daemon/threads/step-state.ts` | content | 7 | 4: 91496c91d 2026-10-27 fix(review): acquire shared transition ownership before publication | 6: fa8e85ac0 2026-10-27 Close remaining review lifecycle and source freshness gaps | resolved |
| `src/daemon/tools/config.ts` | content | 1 | 1: aa6dd90df 2026-10-29 feat(build): S001/t6 tool settings live on the main thread and reach e | 1: ff07926c4 2026-10-24 feat(build): s3/t2 tools.commonApproval setting; retire permissions.mo | resolved |
| `src/daemon/tools/executor.ts` | content | 1 | 2: 31d7aaa7d 2026-10-26 Close Session tool RPC diagnostic and failure envelopes | 8: c2b7c42b0 2026-10-27 feat(build): s7/t8 FieldSpec pattern, op-table path, kv and qs variant | resolved |
| `src/mcp/daemon-stream.ts` | content | 1 | 3: ef850d10d 2026-10-30 feat: Mistral Vibe CLI family + s1/t1 Ollama-hosted family in the mode | 5: da0f491d1 2026-11-01 refactor(review): remove retired engines and fail closed at old entryp | resolved |
| `src/mcp/server.ts` | content | 4 | 7: 9da5a38b2 2026-10-31 fix(review-pane): pane follows external decisions; EXT and AMD enter t | 19: 5d8affec9 2026-11-03 feat(build): s1/t8 add compiled review verification and route regressi | resolved |
| `src/shared/__tests__/ipc-client.test.ts` | content | 1 | 1: 1bd87a1cd 2026-10-26 feat(build): s5/t1 shared rpc client rejects on a connection lost befo | 1: 3251877d3 2026-10-24 fix(streams): preserve UTF-8 characters across reads | resolved |
| `src/shared/ipc-client.ts` | content | 2 | 3: 55adb15a3 2026-10-29 feat(build): s5/t4 add bounded persistent IPC lanes to shared client | 6: 38c9d68cd 2026-11-02 feat(build): s3/t4 verify compiled review lifecycle and document rollo | resolved |
| `src/shared/review-stream.ts` | content | 2 | 4: ef850d10d 2026-10-30 feat: Mistral Vibe CLI family + s1/t1 Ollama-hosted family in the mode | 2: da0f491d1 2026-11-01 refactor(review): remove retired engines and fail closed at old entryp | resolved |
| `src/shared/step-context.ts` | content | 1 | 4: ef850d10d 2026-10-30 feat: Mistral Vibe CLI family + s1/t1 Ollama-hosted family in the mode | 1: 699daea62 2026-10-27 feat(build): s1/t9 bind review claims to trusted request lifetimes | resolved |
| `src/shared/types.ts` | content | 4 | 10: 72314d819 2026-11-02 feat(build): s8/t5 queue the subsystem pass when a repository's graph  | 13: c034aeb45 2026-11-02 feat(build): s1/t1 capture bounded native review output diagnostics | resolved |

### Ignore filter and async git reads (6)

**Severity:** MED. **Impact (first pass):** main replaced the repo ignore helpers with a FileFilter (s6, repo-ignore-config.ts removed); v2 made the git reads under the same helpers async through the tool registry (s9).

**Proposed resolution:** Take main's FileFilter and re-apply v2's await changes on top. src/workflow/artifacts/companion/header.ts still imports repo-ignore-config.js on v2: a compile break after the merge unless fixed.

| File | Type | Hunks | main (commits, newest) | v2 (commits, newest) | Status |
|---|---|---|---|---|---|
| `src/analyze/context/__tests__/repo-ignore-filter.test.ts` | content | 2 | 1: 6a343240e 2026-11-01 feat(build): s6/t11 reimplement createRepoIgnoreFilter as a thin wrapp | 1: ddc09371e 2026-11-01 feat(build): s9/t14 ignore filter, companion header user and convert p | resolved |
| `src/analyze/context/invariants.ts` | content | 2 | 2: f054482bb 2026-11-01 feat(db): add entity_by_file for proportional file/repo entity reads | 1: 50563f003 2026-10-24 feat(build): s1/t4 use bounded readiness and indexed file watermarks | resolved |
| `src/analyze/context/repo-ignore-filter.ts` | content | 1 | 3: e272bcc5f 2026-11-01 fix(build): s6 code-review round 2 -- root ignore file for pre-s6 repo | 1: ddc09371e 2026-11-01 feat(build): s9/t14 ignore filter, companion header user and convert p | resolved |
| `src/analyze/explore/executor.ts` | content | 1 | 3: e272bcc5f 2026-11-01 fix(build): s6 code-review round 2 -- root ignore file for pre-s6 repo | 1: f61348e05 2026-11-01 feat(build): s9/t6 callers of the synchronous runners await them | resolved |
| `src/indexer/watcher.ts` | content | 2 | 5: e272bcc5f 2026-11-01 fix(build): s6 code-review round 2 -- root ignore file for pre-s6 repo | 5: 07263f69a 2026-10-27 fix(review): s1 removeRepo and close wait for releases started by dele | resolved |
| `src/workflow/artifacts/companion/header.ts` | content | 1 | 1: 198583e88 2026-11-01 feat(build): s6/t9 remove repo-ignore-config.ts and hasIgnoredSegment; | 5: ddc09371e 2026-11-01 feat(build): s9/t14 ignore filter, companion header user and convert p | resolved |

### Approved artifact records in .insrc (2)

**Severity:** HIGH. **Impact (first pass):** Both sides changed the same approved artifact record; its head and its history log are hash-chained, so a text merge cannot be trusted.

**Proposed resolution:** Take the later revision of the head, keep both sides' log entries in time order, re-check the head/log hash with the lifecycle service, never hand-edit the hash.

| File | Type | Hunks | main (commits, newest) | v2 (commits, newest) | Status |
|---|---|---|---|---|---|
| `.insrc/artifacts/ISSUE-6dbf14435972af7a.json` | content | 1 | 1: 6bc454a14 2026-11-01 chore(workflow): back-fill the insrc chain for the three direct-built  | 2: 66758e6e9 2026-10-22 chore: convert this repository to the common artifact model (schema ve | resolved |
| `.insrc/artifacts/ISSUE-7fa297efd4bd1c59.json` | content | 1 | 1: 6bc454a14 2026-11-01 chore(workflow): back-fill the insrc chain for the three direct-built  | 2: 66758e6e9 2026-10-22 chore: convert this repository to the common artifact model (schema ve | resolved |

### Generated or pinned fixtures (4)

**Severity:** MED. **Impact (first pass):** A generated or pinned fixture both sides regenerated.

**Proposed resolution:** Do not hand-merge: merge the sources first, then regenerate the fixture and review the diff.

| File | Type | Hunks | main (commits, newest) | v2 (commits, newest) | Status |
|---|---|---|---|---|---|
| `src/config/__tests__/config-catalog-contract.test.ts` | content | 2 | 1: 39dbb0d76 2026-10-28 feat(build): s3/t7 session pool (sc6) with the unattributed worker | 7: 7e640edec 2026-10-30 revert(review): remove plan-investigation engine and qualification mac | resolved |
| `src/config/config-catalog.ts` | content | 1 | 2: 39dbb0d76 2026-10-28 feat(build): s3/t7 session pool (sc6) with the unattributed worker | 11: da0f491d1 2026-11-01 refactor(review): remove retired engines and fail closed at old entryp | resolved |
| `src/daemon/db/__tests__/fixtures/session-source-inventory.json` | content | 1 | 150: 8f06acfa0 2026-11-03 fix(indexer): a scheduler request resuming after dispose queues nothin | 3: 077508d23 2026-11-01 test(build): s9/t23 refresh the inventory digest of read-only-tool-loo | resolved |
| `src/mcp/__tests__/fixtures/tool-surface.golden.json` | content | 2 | 2: 87a1d6675 2026-10-27 feat(build): S001/t21 reconcile review compatibility and current sourc | 11: 43cfcb07b 2026-11-02 feat(build): s1/t7 document the calls that name their repository, and  | resolved |

### Terminal, settings, steering and package surfaces (14)

**Severity:** MED. **Impact (first pass):** Terminal, settings, steering and package surfaces both sides extended (main: model tiers/definitions UI, connections; v2: gitHooks setting, async services, tool-registry scripts).

**Proposed resolution:** Union of both; steering text is merged by section. Re-run the settings, command and tui tests.

| File | Type | Hunks | main (commits, newest) | v2 (commits, newest) | Status |
|---|---|---|---|---|---|
| `AGENTS.md` | content | 1 | 3: 84fca26a7 2026-11-03 docs(steering): harden hard gates so any host agent (incl. Vibe) follo | 5: ba438d1b3 2026-10-25 merge: origin/main into v2 | resolved |
| `copy-assets.mjs` | content | 1 | 1: 5be989c84 2026-10-26 feat(build): s3/t33 bind disabled release evidence to complete compile | 1: 887e44f11 2026-10-24 feat(build): s1/t8 package stable native process capabilities | resolved |
| `package.json` | content | 1 | 4: 7348f340d 2026-11-02 feat(build): s9/t1 languages, table/view kinds, three module namespace | 13: 21e4a78f3 2026-11-03 feat(build): s1/t3 add the git hook entry program | resolved |
| `scripts/daemon-ctl.sh` | content | 1 | 1: 15f44dc79 2026-11-02 fix(build): S001 t2: daemon-ctl.sh installs until an install succeeds | 4: 9ad0d65ba 2026-10-25 Route shell stop and restart through retained process capability helpe | resolved |
| `src/cli/__tests__/command.test.ts` | content | 2 | 4: 635c4ede5 2026-10-26 test(build): s5/t11 type-check the tests s5 changed | 9: 7d93d7a11 2026-10-28 feat(build): s10/t18 the terminal's approve, sync, tracker setup, revi | resolved |
| `src/cli/__tests__/tui.test.ts` | content | 1 | 5: ef850d10d 2026-10-30 feat: Mistral Vibe CLI family + s1/t1 Ollama-hosted family in the mode | 12: b0c207d7a 2026-10-28 feat(build): s10/t13 the tracker port, issue ops and adapter are async | resolved |
| `src/cli/panes/ReposPane.tsx` | content | 5 | 2: ef850d10d 2026-10-30 feat: Mistral Vibe CLI family + s1/t1 Ollama-hosted family in the mode | 3: 8e1582bb9 2026-10-19 merge: sync with origin/main before the core data model work | resolved |
| `src/cli/services/config.ts` | content | 1 | 1: 01b3836ee 2026-10-26 feat(build): s5/t4 Services.models facade and typed config.write resul | 1: 6bdc9e911 2026-10-17 feat(build): s3/t7 terminal Services members and the repo tracker-sett | resolved |
| `src/cli/services/index.ts` | content | 2 | 2: ba5225101 2026-10-26 feat(build): s5/t5 Setup recommends the definitions' tool-loop model | 14: b0c207d7a 2026-10-28 feat(build): s10/t13 the tracker port, issue ops and adapter are async | resolved |
| `src/cli/services/maintenance.ts` | content | 1 | 1: 9355bdead 2026-11-02 fix(build): S001 t1: maintenance.update installs until an install succ | 3: 6c91a7dbd 2026-10-22 fix(build): daemon update source code review round 2: a switch never r | resolved |
| `src/cli/services/workflow.ts` | content | 2 | 3: cd26e5325 2026-10-30 fix(build): s2 code-review fixes for claude on Ollama | 25: 5428eb902 2026-11-02 feat(build): s1/t3 the MCP server and the terminal client send an abso | resolved |
| `src/config/__tests__/check-model-definitions.test.ts` | content | 1 | 2: d2a7e5ae8 2026-11-02 fix(build): s2/t14 bind queue paths to canonical directory ownership | 1: 0247a87a9 2026-10-26 merge: origin/main into v2 (second round) | resolved |
| `src/mcp/__tests__/workflow-approve-dispatch.test.ts` | content | 1 | 1: 87a1d6675 2026-10-27 feat(build): S001/t21 reconcile review compatibility and current sourc | 1: e874e1ade 2026-10-22 feat(build): s9/t25 the CLI service, the MCP server and the write inve | resolved |
| `src/prompts/steering-block.md` | content | 4 | 5: 84fca26a7 2026-11-03 docs(steering): harden hard gates so any host agent (incl. Vibe) follo | 15: 43db4833b 2026-11-03 feat(build): s2/t7 expose trusted recovery and failure over MCP and IP | resolved |

### Removed on main (1)

**Severity:** MED. **Impact (first pass):** main deleted this file; v2 modified it.

**Proposed resolution:** Find why main removed it (commit), then delete it here and carry v2's change to its replacement if the change is still wanted.

| File | Type | Hunks | main (commits, newest) | v2 (commits, newest) | Status |
|---|---|---|---|---|---|
| `src/cli/__tests__/tui-shipped-registry.test.ts` | deleted in main | - | 2: 413c409c8 2026-10-26 feat(build): s5/t10 review command from models.resolveRole | 2: 7d93d7a11 2026-10-28 feat(build): s10/t18 the terminal's approve, sync, tracker setup, revi | resolved |

### In-tree editor plugins (11)

**Severity:** LOW. **Impact (first pass):** main changed the in-tree editor plugins heavily (121 vscode and 66 jetbrains files: model tiers, connections, repo config); v2 touched them only for IPC shape mirroring.

**Proposed resolution:** Decided (D4): the plugins are in scope. Take main's side, then re-check v2's IPC changes against the methods the plugins call after the merge.

| File | Type | Hunks | main (commits, newest) | v2 (commits, newest) | Status |
|---|---|---|---|---|---|
| `jetbrains-plugin/src/main/kotlin/ai/insors/insrc/jetbrains/daemon/UnixSocketDaemonRpc.kt` | content | 1 | 2: 2772bd9a4 2026-10-29 feat(jetbrains): add bounded persistent connection transport | 1: 3faa3edab 2026-10-17 fix(build): s3/t9 keep a null value on the wire for repo.settings.set  | resolved |
| `jetbrains-plugin/src/main/kotlin/ai/insors/insrc/jetbrains/settings/InsrcSettingsConfigurable.kt` | content | 2 | 4: 6c9078bf8 2026-10-27 feat(build): s7/t8 one restart offer after an Apply that needs it | 1: 5b024e0d1 2026-10-17 feat(build): s3/t9 JetBrains client: repo tracker gateway, DTO, settin | resolved |
| `jetbrains-plugin/src/main/kotlin/ai/insors/insrc/jetbrains/settings/PerRepoSection.kt` | content | 1 | 3: 655cb085b 2026-10-27 feat(build): s7/t9 per-repo settings without tier fields | 3: c77cdfe87 2026-10-18 fix(build): s3 code review round 1: keep the policy source in the JetB | resolved |
| `vscode-plugin/assets/steering-block.md` | content | 2 | 2: 84fca26a7 2026-11-03 docs(steering): harden hard gates so any host agent (incl. Vibe) follo | 5: 458aa73f6 2026-10-27 feat(review): admit controller design continuations and exact completi | resolved |
| `vscode-plugin/src/config/__tests__/gateway.test.ts` | add/add | 2 | 1: a4de1989c 2026-10-27 feat(build): s6/t1 config write results carry the daemon's answer | 1: 558cedfc8 2026-10-17 feat(build): s3/t8 VS Code client: repo tracker rows, repoTrackerWrite | resolved |
| `vscode-plugin/src/extension.ts` | content | 1 | 18: 699309121 2026-10-31 feat(vscode-plugin): add Delivery Board to the insrc status-bar click  | 3: de2093957 2026-10-24 fix(build): s3 review round 1 findings: redaction, stale answers, deta | resolved |
| `vscode-plugin/src/models/__tests__/model-tier-picker.test.ts` | content | 2 | 11: 44025177c 2026-10-30 feat(build): S001/t5 unit tests for the data layer, renderer/handler,  | 1: 558cedfc8 2026-10-17 feat(build): s3/t8 VS Code client: repo tracker rows, repoTrackerWrite | resolved |
| `vscode-plugin/src/panels/__tests__/repo-config.test.ts` | content | 6 | 7: 6b249d82a 2026-10-30 chore: commit pending workspace changes (mcp vibe restart hint + build | 1: 558cedfc8 2026-10-17 feat(build): s3/t8 VS Code client: repo tracker rows, repoTrackerWrite | resolved |
| `vscode-plugin/src/panels/repo-config.ts` | content | 3 | 8: 6b249d82a 2026-10-30 chore: commit pending workspace changes (mcp vibe restart hint + build | 2: 04dd34f36 2026-10-17 refactor(build): s3/t8 keep the CLI row model where it was; the VS Cod | resolved |
| `vscode-plugin/src/panels/types.ts` | content | 2 | 6: 699309121 2026-10-31 feat(vscode-plugin): add Delivery Board to the insrc status-bar click  | 2: 8e1582bb9 2026-10-19 merge: sync with origin/main before the core data model work | resolved |
| `vscode-plugin/src/panels/webview-host.ts` | content | 3 | 7: 699309121 2026-10-31 feat(vscode-plugin): add Delivery Board to the insrc status-bar click  | 2: 8e1582bb9 2026-10-19 merge: sync with origin/main before the core data model work | resolved |

## Resolution log

One entry per conflicted file, added when the file is resolved. Copy this block.

```
### <path>
- Decision: <ours | theirs | union | rewritten | deleted>, and why
- Impact confirmed: <what behaviour changes, what main/v2 feature is kept, dropped or ported>
- Follow-ups: <tests added, issues filed>
- Tests run: <files and results, compared with the clean base>
```


## Resolution log (merge run 2026-11-03, branch sync-main-into-v2)

One block per file; files with the same decision are grouped. Statuses: every entry below is resolved in the merge; FOLLOW-UP marks work for the post-merge commits.

### deleted (kept v2's deletion)

- Impact: D2: main's change to the retired review engine is dropped; see "Intent to port". Residual main-added review-engine files that merged cleanly are listed below.
- Files: `src/cli/services/__tests__/review-source-roots-daemon.test.ts`, `src/daemon/steps/code-review-step/__tests__/coverage-normalized-paths.test.ts`, `src/daemon/steps/code-review-step/__tests__/handler.test.ts`, `src/daemon/steps/code-review-step/__tests__/long-review.test.ts`, `src/daemon/steps/code-review-step/handler.ts`, `src/daemon/steps/code-review-step/state-store.ts`, `src/daemon/steps/code-review-step/types.ts`, `src/workflow/artifacts/provenance/writer.ts`, `src/workflow/code-review/__tests__/diff-attribution.test.ts`, `src/workflow/code-review/__tests__/diff-grounding.test.ts`, `src/workflow/code-review/__tests__/gate.test.ts`, `src/workflow/code-review/__tests__/grounding-eligibility.test.ts`, `src/workflow/code-review/__tests__/subject-attribution.test.ts`, `src/workflow/code-review/dimensions/__tests__/coverage-evidence.test.ts`, `src/workflow/code-review/dimensions/adherence.ts`, `src/workflow/code-review/dimensions/conventions.ts`, `src/workflow/code-review/dimensions/coverage.ts`, `src/workflow/code-review/dimensions/diagram/index.ts`, `src/workflow/code-review/dimensions/functional-coverage.ts`, `src/workflow/code-review/dimensions/quality.ts`, `src/workflow/code-review/dimensions/ux/index.ts`, `src/workflow/code-review/grounding.ts`, `src/workflow/code-review/runner.ts`, `src/workflow/review-pipeline/__tests__/code-review-chunking.test.ts`, `src/workflow/review-pipeline/__tests__/code-review-divided.test.ts`, `src/workflow/review-pipeline/__tests__/code-review-gather.test.ts`, `src/workflow/review-pipeline/__tests__/pipeline-job.test.ts`, `src/workflow/review-pipeline/adapters/code-review-chunk.ts`, `src/workflow/review-pipeline/adapters/code-review-duplicates.ts`, `src/workflow/review-pipeline/adapters/code-review-gather.ts`, `src/workflow/review-pipeline/adapters/code-review-material.ts`, `src/workflow/review-pipeline/code-review.ts`, `src/workflow/review-pipeline/driver.ts`, `src/workflow/review-pipeline/envelope.ts`, `src/workflow/review-pipeline/job.ts`, `src/workflow/review-pipeline/types.ts`, `src/workflow/review/__tests__/same-party-refusal.test.ts`

### deleted (main's deletion)

- Impact: main removed the shipped-registry stopgap in s5/t10 (the terminal asks the daemon with models.resolveRole); v2 had only trimmed the test. `src/__tests__/no-default-tiers.test.ts` still names the removed module: check after the merge.
- Files: `src/cli/__tests__/tui-shipped-registry.test.ts`

### ours (v2's converted record)

- Impact: v2 converted these records to the lifecycle form. main approved both on 2026-11-01 in the old form (approvedAt). ISSUE-6dbf14435972af7a is already approved in v2's record. ISSUE-7fa297efd4bd1c59 reads draft in v2's record: main's approval (2026-11-01T05:13:09Z) is not carried. FOLLOW-UP: re-approve it through the lifecycle with the user.
- Files: `.insrc/artifacts/ISSUE-6dbf14435972af7a.json`, `.insrc/artifacts/ISSUE-7fa297efd4bd1c59.json`

### theirs + new step

- Impact: D1: main's index and schema 6/7/8 kept; v2's membership index dropped. SCHEMA_VERSION 9 and MIGRATION_V8_TO_V9 (clear and rebuild entity_by_file in main's shape, drop legacy entity_by_repo). New test migration-v8-to-v9.test.ts. Pinned schema-version tests moved from 8 to 9. FOLLOW-UP: v2's callers and tests of the dropped index (entity-memberships.test.ts, entity-scope-indexes.test.ts, analyze/context/scope.ts, workflow/code-review/freshness.ts, encodeEntityFileKey/absoluteEntityFilePath in keys.ts) need porting or removal; found by tsc.
- Files: `src/db/entities.ts`, `src/db/graph/migrations.ts`, `src/db/graph/store.ts`

### theirs

- Impact: D1: main's version of the migration/storage test (v2's test pinned the dropped index). operational.test.ts pin moved to schema 9 afterwards.
- Files: `src/db/__tests__/doc-summary-carry.test.ts`, `src/db/graph/__tests__/migration-v4-to-v5.test.ts`, `src/db/graph/__tests__/migration-v5-to-v6.test.ts`, `src/db/graph/__tests__/operational.test.ts`, `src/understanding/__tests__/storage.test.ts`

### ours

- Impact: D2: v2's review framework wins. main's resumable owned reviews, isolated controller CLI helper (controllerReview capability), legacy review streams and codeReviewControl/resolveControllerReviewRole are dropped. Residual: shared/controller-review.ts, mcp/controller-review.ts, daemon/code-review-operations.ts and their tests merged cleanly and are dead code to remove.
- Files: `src/daemon/__tests__/code-review-rpc-fallback.test.ts`, `src/daemon/__tests__/code-review-rpc.test.ts`, `src/daemon/code-review-rpc.ts`, `src/daemon/steps/daemon-client.ts`, `src/daemon/steps/host.ts`, `src/mcp/daemon-stream.ts`, `src/shared/review-stream.ts`, `src/shared/step-context.ts`

### ours

- Impact: D2: v2's lifecycle-based approval and task-review gate win. main's input-fingerprint stale-review refusal, completion mode of persistBuildRecord and the synchronous BUILD writer lock (approval-owner.ts, withBuildWriter) are not carried. DEVIATION FROM THE D2 NOTE: the writer lock was meant to be kept, but main's lock wraps a synchronous stamp-write that no longer exists in v2 (approval runs through the async lifecycle service), so wrapping it needs an async variant. FOLLOW-UP: decide whether cross-process BUILD write ownership is still wanted; if so add an async withBuildWriter around the lifecycle approve.
- Files: `src/mcp/server.ts`, `src/workflow/__tests__/approve-build-completion.test.ts`, `src/workflow/__tests__/gates.test.ts`, `src/workflow/__tests__/other-party-review-gate.test.ts`, `src/workflow/code-review/gate.ts`, `src/workflow/code-review/types.ts`, `src/workflow/gates.ts`, `src/workflow/runners/build/completion-record.ts`, `src/workflow/runners/build/standalone-record.ts`

### manual merge

- Impact: v2's lifecycle approval state plus main's two pending-list fixes: AMD records (flat, top-level status) and a standalone BUILD listed without a CR sibling (meta.standalone).
- Files: `src/workflow/pending.ts`

### ours + guards

- Impact: D2: v2's review state claims win; main's pin/transition-lock/compareReplace (resumable reviews) are dropped. main's non-review change, assertNoSessionPersistence() on the store methods, is applied to v2's methods. main's step-state tests for pinning are lost with the dropped feature.
- Files: `src/daemon/threads/__tests__/helpers/step-state-worker.ts`, `src/daemon/threads/__tests__/step-state.test.ts`, `src/daemon/threads/step-state.ts`

### manual merge

- Impact: Union: main's session pool dispatch (dispatchSession, onAck, began/finished, MAIN_THREAD_STATE_METHODS) and v2's review owner registration (retireReviewOwner, trusted context). Compile check needed for the pending-entry type.
- Files: `src/daemon/threads/router.ts`

### manual merge

- Impact: main's lazy handler-runtime build, session pool and shared-state worker; v2's park-offer/signoff registration, run-file release and serverClosing. main's code-review-operations close dropped (D2).
- Files: `src/daemon/index.ts`

### union

- Impact: Both imports kept.
- Files: `src/daemon/server.ts`

### manual merge

- Impact: v2's watchdog/stage structure with main's exit-code semantics applied: queue drain failure exits 1, an `ended` guard against double end.
- Files: `src/daemon/shutdown.ts`

### union

- Impact: Path imports from both sides. The three repo.gitHooks methods stay listed in the file text (registry scan).
- Files: `src/daemon/handler-runtime.ts`

### union

- Impact: Both sides' tests kept. The ADDED_RPC key-set test needs the main-added methods added to the list: FOLLOW-UP.
- Files: `src/daemon/__tests__/handler-runtime.test.ts`

### manual merge

- Impact: v2's executor (output schemas, approval classes, signals, hooks) with main's connection-execution wrapping (runWithConnectionExecution, session-memory failure text).
- Files: `src/daemon/tools/executor.ts`

### union

- Impact: v2's log line (no approval.defaultAction) and main's changed?.(next) callback.
- Files: `src/daemon/tools/config.ts`

### manual merge

- Impact: Union of main's Claude-on-Ollama target/pre-run check, Mistral Vibe review session, Session denial and connection-execution parameters with v2's review budget, activity stream and review-scoped structured retry. Dropped (D2): main's boundedInput/completeBoundedStructured isolated helper and boundedStructuredInput capability. withStructuredRetry takes (reviewScoped, execution) in that order; callers to check by tsc.
- Files: `src/agent/providers/cli-provider.ts`, `src/agent/providers/ollama.ts`, `src/agent/providers/structured-output.ts`, `src/agent/read-only-tool-loop.ts`

### union

- Impact: Both sides' fields: reviewBudget/connectionExecution on CompletionOpts and StructuredCompletionOpts, the Bounded/Activity ReviewSessionOpts union with connectionExecution, reviewActivity and boundedStructuredInput capabilities.
- Files: `src/shared/types.ts`

### union

- Impact: rpc keeps v2's timeout/closeAware and main's connectToDaemon default; createPersistentIpcClient (v2, review) and openIpcLane (main, connection lanes) both kept.
- Files: `src/shared/ipc-client.ts`

### union

- Impact: Imports from both sides.
- Files: `src/shared/__tests__/ipc-client.test.ts`

### union

- Impact: Both tests kept (v2 lifecycle dispatch, main stale-review relay). The stale-review relay test may no longer describe v2's gate: check.
- Files: `src/mcp/__tests__/workflow-approve-dispatch.test.ts`

### theirs

- Impact: main replaced the ls-files based filter with FileFilter (s6); v2's await changes on the old git helper are moot.
- Files: `src/analyze/context/__tests__/repo-ignore-filter.test.ts`, `src/analyze/context/invariants.ts`, `src/analyze/context/repo-ignore-filter.ts`, `src/analyze/explore/executor.ts`

### manual merge

- Impact: v2's git-calls and ArtifactIds imports with main's new repoConfigPath location; main's id.js import dropped (v2 removed the workflow id scheme).
- Files: `src/workflow/artifacts/companion/header.ts`

### manual merge

- Impact: main's FileFilter-based Watcher is the base; v2's nested-directory adoption (dirSubscriptions, releasing) re-applied on it, using the FileFilter for ignoring instead of an ignore-name list. Constructor injection of subscribe (v2 tests) and the protected subscribe override (main tests) both work. v2's watcher-new-directories.test.ts calls addRepo(repo, ignore): needs adapting.
- Files: `src/indexer/watcher.ts`

### union

- Impact: Imports and Services members from both sides (approvals watcher from v2, models service from main).
- Files: `src/cli/services/config.ts`, `src/cli/services/index.ts`

### ours

- Impact: v2's daemonUpdate source handling; the unused lockBefore removed because main replaced the lock-hash install check with an install marker.
- Files: `src/cli/services/maintenance.ts`

### ours

- Impact: D2: reviewArtifact stays a daemon call (workflow.reviewArtifact); main's CLI-process review with models.resolveRole is dropped.
- Files: `src/cli/services/workflow.ts`

### union

- Impact: Both views: s (repo settings modal, v2) and m (models view, main), steer-vibe modal.
- Files: `src/cli/panes/ReposPane.tsx`

### manual merge

- Impact: main's notFaked fakes plus both sides' tests.
- Files: `src/cli/__tests__/command.test.ts`

### theirs

- Impact: main moved the fixtures to helpers/fake-services.ts. FOLLOW-UP: v2-only Services members may be missing there (found by tsc).
- Files: `src/cli/__tests__/tui.test.ts`

### ours

- Impact: D2: v2 removed the old review settings (codeReview.*, review.chunkTokens, designReview.*); main's rows for them are dropped.
- Files: `src/config/config-catalog.ts`

### ours

- Impact: Row counts (49) need recomputing for the merged catalog: FOLLOW-UP.
- Files: `src/config/__tests__/config-catalog-contract.test.ts`

### theirs

- Impact: main's build-order assertion allows the workspace build before tsc.
- Files: `src/config/__tests__/check-model-definitions.test.ts`

### manual merge

- Impact: Build script: v2's clean-output, typecheck:tools, forbidden-spawn scan --fail, broker and watchdog builds, with main's project-memory workspace build and --inlineSources.
- Files: `package.json`

### main's wording

- Impact: Approval discipline: main's stricter text (yes for that artifact, no raw IPC), with lowercase story ids. Review-gate sections kept v2's.
- Files: `AGENTS.md`, `src/prompts/steering-block.md`

### manual merge

- Impact: Comments combined; behaviour follows each side's own changes (main's install marker, v2's IPC stop).
- Files: `copy-assets.mjs`, `scripts/daemon-ctl.sh`

### ours (placeholder)

- Impact: Generated fixtures: regenerate from the merged sources, do not hand-merge. FOLLOW-UP.
- Files: `src/daemon/db/__tests__/fixtures/session-source-inventory.json`, `src/mcp/__tests__/fixtures/tool-surface.golden.json`

### theirs

- Impact: D4: main's side. FOLLOW-UP: IPC alignment check of the plugins against the merged handler table.
- Files: `jetbrains-plugin/src/main/kotlin/ai/insors/insrc/jetbrains/daemon/UnixSocketDaemonRpc.kt`, `jetbrains-plugin/src/main/kotlin/ai/insors/insrc/jetbrains/settings/InsrcSettingsConfigurable.kt`, `jetbrains-plugin/src/main/kotlin/ai/insors/insrc/jetbrains/settings/PerRepoSection.kt`, `vscode-plugin/assets/steering-block.md`, `vscode-plugin/src/config/__tests__/gateway.test.ts`, `vscode-plugin/src/extension.ts`, `vscode-plugin/src/models/__tests__/model-tier-picker.test.ts`, `vscode-plugin/src/panels/__tests__/repo-config.test.ts`, `vscode-plugin/src/panels/repo-config.ts`, `vscode-plugin/src/panels/types.ts`, `vscode-plugin/src/panels/webview-host.ts`

## Intent to port (review engine, D2)

Filled while resolving CRITICAL-2 (decision D2: v2's review framework overrides main). One line per main feature.

| main feature | main commits | Disposition | Reason |
|---|---|---|---|
| Chunked, lossless diff evidence and the review pipeline | `aef193eae`, `deea66b58`, `2092cd6d7`, `9fc0d016b` and about 20 more (2026-10-27) | dropped | Feeds only the old runner. Follow-up: check whether an oversized Story diff is a problem for task review (not verified). |
| Owned, resumable reviews, pinned continuation state, replay protection | `e92c06614`, `9d87b90e1`, `83f4eba30`, `91496c91d` | replaced | v2 has start/resume/progress/result, checkpoints, atomic claims and receipts. |
| Isolated, bounded CLI helper execution | `bcb286d2c`, `2e042cd47` | replaced | v2 has bounded native output diagnostics and activity streaming. |
| Stale-review refusal by input fingerprint | `e777060ff`, `161256f3b`, `9222dca90`, `f97e952ac` | replaced | v2's `build-freshness.ts` binds a review to the BUILD and its files. Main's broader fingerprint is not ported. |
| BUILD writer lock (`approval-owner.ts`, `withBuildWriter`) | `e777060ff` | kept (treated as non-review) | No v2 equivalent; unrelated to the engine. Confirm when resolving `gates.ts`. |
| Pending list: standalone BUILD without a CR sibling; EXT and AMD listed | `c7aa317bd`, `9da5a38b2` | kept | Not review-engine features. |

## Residual main review-engine files (removed, post-merge step 1)

These came in from main without a textual conflict and belong to the review engine D2 drops. Deleted with their tests: `src/agent/providers/bounded-input.ts`, `src/daemon/code-review-operations.ts`, `src/daemon/steps/code-review-step/controller-pipeline.ts` (+ tests and helper), `src/mcp/controller-review.ts`, `src/shared/controller-review.ts`, `src/shared/review-input-identity.ts`, `src/workflow/code-review/{diff-spans,input-fingerprint,publication}.ts`, `src/workflow/review-pipeline/{adapters/diff-fragments,adapters/diff-parent-evidence,timing}.ts` and eight review-pipeline tests, `src/workflow/__tests__/{build-review-freshness,final-review-verification}.test.ts`, `src/cli/services/__tests__/review-resolve-role.test.ts`, the code-review control/operations/publication daemon tests. `reconcileCompletionChangeLog` removed from `runners/build/changed-files.ts`; the controller helper admission removed from `mcp/forward-step.ts`.

Whole-file `--ours` resolutions earlier in the merge dropped main's independent (non-review) changes in the same files; they were redone with `git merge-file --ours` (conflicting hunks to v2, other changes kept) for `shared/step-context.ts` (connection-execution helpers, the vibe client) and `daemon/steps/daemon-client.ts` (per-method routing, in-daemon-only methods), and ported by hand into `mcp/server.ts` (vibe client, every pending record presentable), `daemon/steps/host.ts` (vibe client) and `mcp/daemon-stream.ts` (StepClient). Kept as v2 whole-file: `gates.ts`, `standalone-record.ts`, `completion-record.ts`, `code-review/types.ts`, the code-review rpc files, `review-stream.ts`.

Other post-merge fixes in step 1: `shared/ipc-client.ts` rpc (v2's timeout/closeAware and main's DaemonDisconnectedError merged into one settle), `agent/providers/cli-provider.ts` (retry argument order, no activity review for the vibe CLI), `db/entities.ts` listEntitiesForRepo gains the `limit` option v2's bounded-readiness callers use. `npm install` run in the worktree (main added the `ignore` dependency and the project-memory workspace); `package-lock.json` gains the `insrc-git-hook` bin. **`tsc --noEmit` is clean.**

## Deferred (get back to these)

- **BUILD writer lock (decided 2026-11-03 to defer).** main's `src/workflow/approval-owner.ts` (`withBuildWriter`, a cross-process ownership lock for BUILD ledger and approval writes, commit `e777060ff`) is not carried into v2. It wraps a synchronous stamp-write that v2 replaced with the async lifecycle service. If cross-process BUILD write ownership is still wanted, add an async variant of `withBuildWriter` around the lifecycle approve for BUILD records, with a test that two concurrent approvals of one BUILD do not both write. Until then v2 relies on the lifecycle service's own journalled writes. Owner: user to decide when to schedule it; track it as its own Story through triage.
- **ISSUE-7fa297efd4bd1c59 approval** (approved on main 2026-11-01, draft in v2's converted record): re-approve through the lifecycle with the user.
