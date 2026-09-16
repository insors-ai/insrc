<!-- insrc:artifact PLAN-ea1b11621c933a2c-S001 -->

# Plan: S001

**Epic:** `daemon-update-automatically-refresh-insrc-steering`
**LLD run:** `wf-1785574573864-90235b`
**LLD effective hash:** `ea1b11621c93...`

## Tasks

| # | Task | Size | Depends on | Tests | Derived from |
| :--- | :--- | :--- | :--- | :--- | :--- |
| 1 | **`t1`** Add refreshMarkedSection pure function to steering-inject.ts | S | — | unit: refreshMarkedSection: present + stale block returns 'replaced', surrounding content preserved byte-for-byte; unit: refreshMarkedSection: present + identical block returns 'unchanged' with content:null, no write; unit: refreshMarkedSection: absent file returns 'skipped', never 'created'; unit: refreshMarkedSection: present file without markers returns 'skipped', never 'created'/appended; unit: refreshMarkedSection: duplicate/malformed markers return unchanged/skipped + note, file untouched | [[c1]] |
| 2 | **`t3`** Add optional steeringRefresh field to MaintenanceResult | S | — | unit: MaintenanceResult type accepts optional steeringRefresh: SteeringRefreshReport mirroring configReconcile shape | [[c5]] |
| 3 | **`t2`** Add refreshSteeringAcrossRepos walk to steering-inject.ts | M | `t1` | unit: refreshSteeringAcrossRepos: mixed repo list — stale written, opted-out skipped-not-created, malformed untouched; unit: refreshSteeringAcrossRepos: per-file read rejection recorded skipped+note, walk continues to remaining repos; unit: refreshSteeringAcrossRepos: per-file write rejection recorded skipped+note, other repos still refreshed; unit: refreshSteeringAcrossRepos: CLAUDE.md refreshed while sibling AGENTS.md skipped independently; unit: refreshSteeringAcrossRepos: zero registered repos yields empty report, no writes; unit: refreshSteeringAcrossRepos: writeFile invoked only when action is 'replaced'; unit: refreshSteeringAcrossRepos: called with no deps constructs valid production defaults for all four members | [[c3]] |
| 4 | **`t4`** Add runUpdateSteeringRefresh best-effort wrapper to maintenance.ts | M | `t2` | unit: runUpdateSteeringRefresh: readBlock/asset missing is caught and logged, returns undefined; unit: runUpdateSteeringRefresh: listRepos rejection is caught, returns undefined; unit: runUpdateSteeringRefresh: happy path returns SteeringRefreshReport and emits onLog summary line | [[c4]] |
| 5 | **`t5`** Wire runUpdateSteeringRefresh into maintenance.update() post-build flow | S | `t4`, `t3` | integration: maintenance.update: forced steering-refresh failure does not flip ok:false; steps includes 'steering-refresh'; integration: maintenance.update: successful run sets MaintenanceResult.steeringRefresh with per-repo report; integration: maintenance.update: steering-refresh runs strictly after build step and issues no daemon-restart call | [[c2]] [[c6]] |

### `t1` — Add refreshMarkedSection pure function to steering-inject.ts

Implement the replace-only sibling of upsertMarkedSection in src/daemon/steering-inject.ts: same marker-detection, duplicate-guard, and malformed-guard logic, but both 'created' arms (absent file, present-without-markers) return {content:null, action:'skipped'} instead of adding a block. Export SteeringRefreshDeps and SteeringRefreshReport (SteeringFileOutcome list) types alongside it. No change to existing upsertMarkedSection or injectSteeringBlock.

**Acceptance checks:**
- refreshMarkedSection(existing, block) returns action:'replaced' with the new content when existing has well-formed markers and a stale block; content outside the markers is preserved byte-for-byte
- refreshMarkedSection returns action:'unchanged', content:null when the block already matches (idempotent, no write signaled)
- refreshMarkedSection returns action:'skipped', content:null — never 'created' — when existing is null or the file has no markers (opt-out honoured)
- refreshMarkedSection returns action:'unchanged'/'skipped' with a note, and leaves the file untouched, on duplicate or malformed markers
- SteeringRefreshDeps ({listRepos, readBlock, readFile, writeFile}) and SteeringRefreshReport (SteeringFileOutcome list) types are exported from steering-inject.ts
- upsertMarkedSection and injectSteeringBlock source is unchanged

### `t3` — Add optional steeringRefresh field to MaintenanceResult

Add an optional steeringRefresh?: SteeringRefreshReport field to the MaintenanceResult type (src/cli/services/type-contracts/maintenance-result.ts), mirroring the existing optional configReconcile field. Purely additive — no existing reader/caller changes required.

**Acceptance checks:**
- MaintenanceResult declares steeringRefresh?: SteeringRefreshReport, matching the shape/optionality pattern of the existing configReconcile field
- The project type-checks with no changes required at any existing MaintenanceResult call site (field is additive)

### `t2` — Add refreshSteeringAcrossRepos walk to steering-inject.ts

Implement refreshSteeringAcrossRepos(deps?): Promise<SteeringRefreshReport> in src/daemon/steering-inject.ts. Walks deps.listRepos() and, for each repo's CLAUDE.md and AGENTS.md independently, reads the file via deps.readFile, runs refreshMarkedSection with the block from deps.readBlock, and writes via deps.writeFile only when action==='replaced'. Any per-file read/write error is caught and recorded as a skipped SteeringFileOutcome with a note; the walk continues rather than aborting. When deps (or any of its four members) is omitted, construct production defaults for all of listRepos (global registry), readBlock (readSteeringBlock over the fresh out/prompts), readFile, and writeFile (node fs) — not listRepos alone.

**Acceptance checks:**
- refreshSteeringAcrossRepos(deps) calls deps.listRepos() and, per repo, checks CLAUDE.md and AGENTS.md independently
- For each file it calls refreshMarkedSection with the fresh block and calls deps.writeFile only when the result action is 'replaced'
- A per-file read or write error is caught and recorded as {action:'skipped', note} in the report; the walk continues to the remaining repos/files rather than throwing
- A repo whose files are absent or lack markers (opted out) is left untouched across the whole walk — never gains a new block
- A repo with CLAUDE.md markers present but AGENTS.md absent refreshes CLAUDE.md and records AGENTS.md as skipped, independently
- Zero registered repos (empty listRepos result) yields an empty SteeringRefreshReport and triggers no writes
- The walk performs no LMDB repo-row upsert and issues no re-index call — it only reads the registry and touches repo markdown files
- refreshSteeringAcrossRepos() called with no arguments constructs valid production defaults for all four dependencies (listRepos, readBlock, readFile, writeFile), not just listRepos

### `t4` — Add runUpdateSteeringRefresh best-effort wrapper to maintenance.ts

Implement runUpdateSteeringRefresh(root, onLog): Promise<SteeringRefreshReport | undefined> in src/cli/services/maintenance.ts. Resolves the freshly-built steering-block.md (out/prompts), calls refreshSteeringAcrossRepos with production deps, emits a per-repo/summary log line via onLog (mirroring runUpdateReconcile's logging shape), and wraps the whole call in a try/catch so any top-level failure (missing block asset, listRepos rejection) is caught and logged, returning undefined instead of throwing.

**Acceptance checks:**
- runUpdateSteeringRefresh reads the freshly-built steering-block.md from out/prompts (post-build) and passes it as the deps.readBlock source into refreshSteeringAcrossRepos with production deps (real listRepos, real fs readFile/writeFile)
- On success it emits a per-repo/summary log line via onLog, mirroring runUpdateReconcile's logging shape, and returns the SteeringRefreshReport
- readBlock/asset-missing failure is caught, logged, and the function returns undefined without throwing
- listRepos rejection is caught, logged, and the function returns undefined without throwing

### `t5` — Wire runUpdateSteeringRefresh into maintenance.update() post-build flow

In src/cli/services/maintenance.ts update(), call runUpdateSteeringRefresh(root, onLog) strictly after npm run build, beside the existing runUpdateReconcile call, in its own try/catch that never flips ok:false. Push 'steering-refresh' onto steps and, on success, set result.steeringRefresh (from the MaintenanceResult.steeringRefresh field) to the returned report. Leave the git-sync/install/build arms and the 'daemon NOT restarted' behavior unchanged.

**Acceptance checks:**
- update() calls runUpdateSteeringRefresh(root, onLog) after the existing post-build runUpdateReconcile step, inside its own try/catch
- A steering-refresh failure (thrown error or undefined result) never sets MaintenanceResult.ok to false — only a real git-sync/install/build failure does
- steps.push('steering-refresh') is added to the returned steps array on every update() run that reaches the post-build phase
- On a successful refresh, MaintenanceResult.steeringRefresh carries the report returned by runUpdateSteeringRefresh
- update() issues no daemon-restart call — the 'daemon NOT restarted' contract is preserved
- The git-sync, npm install, and npm run build arms of update() are unchanged

## Test-strategy coverage

| LLD strategy item | Covered by |
| :--- | :--- |
| present + stale block → action 'replaced', surrounding user content preserved byte-for-byte | `t1` |
| present + identical block → action 'unchanged' (content:null), no write | `t1` |
| absent file (existing=null) → action 'skipped', NEVER 'created' | `t1` |
| present file WITHOUT markers → action 'skipped', NEVER 'created'/appended (opt-out honoured) | `t1` |
| duplicate or malformed markers → unchanged/skipped + note, file left byte-for-byte untouched | `t1` |
| mixed repo list: repo with stale block → written (replaced); opted-out repo (no markers / files absent) → skipped, not created; repo with malformed markers → untouched | `t2` |
| a repo file whose read rejects (moved/deleted) → recorded skipped+note, walk CONTINUES to the remaining repos | `t2` |
| a repo whose write rejects (perm) though stale → recorded skipped+note, other repos still refreshed | `t2` |
| CLAUDE.md present-with-markers but AGENTS.md absent → CLAUDE.md refreshed, AGENTS.md skipped (per-file opt-out) | `t2` |
| zero registered repos → empty report, no writes | `t2` |
| writes happen ONLY on action==='replaced' (identical/skip never write) — assert the fake writeFile call set | `t2` |
| readBlock/asset missing → catches, logs, returns undefined (does not throw) | `t4` |
| listRepos rejects → catches, returns undefined | `t4` |
| happy path → returns a SteeringRefreshReport with the per-repo outcomes + emits an onLog summary line | `t4` |
| a forced steering-refresh failure (deps seam throws) does NOT flip the update to ok:false — update stays ok:true and steps includes 'steering-refresh' | `t5` |
| on a successful run, MaintenanceResult.steeringRefresh carries the per-repo report (mirrors configReconcile) | `t5`, `t3` |
| the refresh runs strictly AFTER the build step (ordering) and the daemon is NOT restarted (no restart call) | `t5` |

## Citations

- **[[c1]]** `prior-artifact` `LLD S001 refreshMarkedSection: replace-only sibling of upsertMarkedSection` — "both 'created' arms (absent file, present-without-markers) return {content:null, action:'skipped'} instead of adding a block"
- **[[c2]]** `prior-artifact` `LLD S001 wire steering-refresh into maintenance.update() post-build flow` — "call runUpdateSteeringRefresh(root, onLog) strictly after npm run build, beside the existing runUpdateReconcile call, in its own try/catch that never flips ok:false"
- **[[c3]]** `prior-artifact` `LLD S001 refreshSteeringAcrossRepos walk over registered repos` — "Walks deps.listRepos() and, for each repo's CLAUDE.md and AGENTS.md independently, reads the file via deps.readFile, runs refreshMarkedSection with the block from deps.readBlock, and writes via deps.w"
- **[[c4]]** `prior-artifact` `LLD S001 runUpdateSteeringRefresh best-effort wrapper in maintenance.ts` — "wraps the whole call in a try/catch so any top-level failure (missing block asset, listRepos rejection) is caught and logged, returning undefined instead of throwing"
- **[[c5]]** `prior-artifact` `LLD S001 MaintenanceResult.steeringRefresh field addition` — "Add an optional steeringRefresh?: SteeringRefreshReport field to the MaintenanceResult type, mirroring the existing optional configReconcile field"
- **[[c6]]** `prior-artifact` `LLD S001 daemon NOT restarted / update() arms unchanged constraint` — "Leave the git-sync/install/build arms and the 'daemon NOT restarted' behavior unchanged"

<!-- insrc:review -->

## Review

### ✅ Review `PASS` — plan (plan)

**0 HIGH · 0 MED · 7 LOW** · model `client` · reviewed 2026-08-01T09:39:25.269Z

| Ref | Kind | Severity | Fixability | Premise | Evidence | Action |
| --- | --- | --- | --- | --- | --- | --- |
| t1 | citation | LOW | manual | src/daemon/steering-inject.ts exports the pure upsertMarkedSection returning UpsertResult with the two 'created' arms + duplicate/malformed guards + SteeringFileOutcome — the exact logic t1's refreshMarkedSection clones (minus the created arms). | steering-inject.ts:90 upsertMarkedSection, :95+:104 the two `action:'created'` arms t1 collapses to skipped, :80 UpsertResult, :45 SteeringFileOutcome. refreshMarkedSection has 0 src hits (docs only) — correctly a new replace-only sibling. Confirmed. | none |
| t3 | citation | LOW | manual | MaintenanceResult carries an existing OPTIONAL configReconcile field that t3's additive steeringRefresh field mirrors; the type is declared in src/cli/services/type-contracts/maintenance-result.ts. | maintenance.ts:42 interface MaintenanceResult; type-contracts/maintenance-result.ts present; configReconcile is the existing optional field the additive steeringRefresh mirrors; steeringRefresh has 0 src hits (new). Confirmed. | none |
| t2 | citation | LOW | manual | src/db/repos.ts exports listRepos returning RegisteredRepo[] (each with a path) — the registry t2's walk iterates; readSteeringBlock is the production readBlock default. | repos.ts:213 `export async function listRepos(_db): Promise<RegisteredRepo[]>`; steering-inject.ts:64 readSteeringBlock — the walk's registry source + the production readBlock default. Confirmed. | none |
| t4/t5 | citation | LOW | manual | src/cli/services/maintenance.ts update() runs a best-effort post-build runUpdateReconcile after npm run build and does NOT restart the daemon — the precedent + insertion point runUpdateSteeringRefresh (t4) is wired beside (t5). | maintenance.ts:148 'update complete (daemon NOT restarted)'; runUpdateReconcile is the exported post-build best-effort step (16 src refs); runUpdateSteeringRefresh 0 src (new) — the precedent + insertion point are precise. Confirmed. | none |
| tasks | inventory | LOW | manual | The plan enumerates exactly 5 tasks (t1, t2, t3, t4, t5). | Five task sections t1–t5 present (t1 refreshMarkedSection, t3 field, t2 walk, t4 wrapper, t5 wiring). The count re-derives from the task table + headers. Confirmed. | none |
| tasks | ordering | LOW | manual | The task dependency DAG is acyclic and well-formed: t1(—), t3(—); t2->t1; t4->t2; t5->t4,t3. | DAG: t1(—), t3(—); t2->t1; t4->t2; t5->t4,t3. Acyclic, every dep precedes its dependent; the pure fn (t1) + type (t3) precede the walk (t2) which precedes the wrapper (t4) + wiring (t5). Confirmed. | none |
| t1 | semantic | LOW | manual | refreshMarkedSection is NEW (does not exist yet in steering-inject.ts), a replace-only variant of the existing upsertMarkedSection. | refreshMarkedSection / refreshSteeringAcrossRepos / runUpdateSteeringRefresh all have 0 hits in src/ — all three are genuinely new deliverables, not restatements of existing symbols. Confirmed. | none |
