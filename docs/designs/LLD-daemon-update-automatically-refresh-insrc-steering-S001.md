<!-- insrc:artifact LLD-ea1b11621c933a2c-S001 -->

# LLD: S001

**Epic:** `daemon-update-automatically-refresh-insrc-steering`
**HLD base run:** `wf-1785574573864-90235b`
**HLD effective hash:** `ea1b11621c93...`

## HLD context

**Framework:** Standalone feature — no parent HLD. Design directly against the repo, grounded on the s1 analyze passes. There are no HLD shared contracts to honour.
**Rollout phase:** standalone

## Contract details

**Surface level:** internal

### `refreshMarkedSection`

```typescript
function refreshMarkedSection(existing: string | null, block: string): UpsertResult
```

**Parameters:**
- `existing: string | null` — Current file text, or null when the target file is absent.
- `block: string` — The fresh steering block body (from readSteeringBlock) to install between the markers.

**Returns:** `UpsertResult` — The replace-ONLY sibling of upsertMarkedSection: identical replaced/unchanged/duplicate-guard/malformed-guard arms, but the two 'created' cases (absent file OR present-without-markers) return {content:null, action:'skipped'} — the block is NEVER added where it was opted out. Pure, no I/O.

**Preconditions:**
- Pure: no fs.

**Postconditions:**
- action is one of 'replaced' | 'unchanged' | 'skipped' — never 'created'.
- Surrounding user content outside the markers is preserved byte-for-byte; malformed/duplicate markers leave the file untouched (skipped/unchanged).

### `refreshSteeringAcrossRepos`

```typescript
function refreshSteeringAcrossRepos(deps?: SteeringRefreshDeps): Promise<SteeringRefreshReport>
```

**Parameters:**
- `deps: SteeringRefreshDeps` _(optional)_ — Injectable seam: { listRepos, readBlock, readFile, writeFile }. Defaults to the production impls (listRepos over the global registry, readSteeringBlock over the fresh out/prompts, node fs). A fake in tests.

**Returns:** `Promise<SteeringRefreshReport>` — Walks every registered repo (listRepos) and, for each repo's CLAUDE.md + AGENTS.md that exists, runs refreshMarkedSection with the fresh block and writes ONLY on action==='replaced'. Collects a per-repo/per-file SteeringFileOutcome list. Never throws for a per-file I/O error — records it as skipped+note and continues (a bad repo never aborts the walk).

**Errors:**
- `SteeringFileOutcome{action:'skipped', note}` when a per-repo/per-file read or write error (recorded, not thrown) — the walk continues.

**Preconditions:**
- The steering block asset is present + readable (readBlock); its failure is caught by the caller (best-effort).

**Postconditions:**
- Only files that already carry well-formed insrc:steering markers with a stale block are rewritten (replaced); no file gains a new block; no LMDB write; no re-index.

### `runUpdateSteeringRefresh`

```typescript
function runUpdateSteeringRefresh(root: string, onLog: LogFn): Promise<SteeringRefreshReport | undefined>
```

**Parameters:**
- `root: string` — The daemon install root (for symmetry with runUpdateReconcile / logging context); the walk itself reads the global registry, independent of root.
- `onLog: LogFn` — The maintenance progress logger — emits a per-repo/summary line, mirroring runUpdateReconcile.

**Returns:** `Promise<SteeringRefreshReport | undefined>` — The best-effort post-build wrapper (sibling of runUpdateReconcile): calls refreshSteeringAcrossRepos with production deps, logs the outcome, and swallows any top-level failure (returns undefined) so it can NEVER flip a successful update to failed. Reads the FRESHLY-built steering-block.md (module resolves its own out/prompts) so an updated template propagates.

**Errors:**
- `swallowed (returns undefined)` when any top-level failure of the walk (e.g. the block asset missing) is caught + logged; update stays ok:true.

**Preconditions:**
- Runs strictly AFTER `npm run build` in maintenance.update, so out/prompts holds the new block.

**Postconditions:**
- Never throws; the update result is unaffected by a steering-refresh failure (best-effort contract).

### `update`

```typescript
function update(onLog: LogFn, opts?: UpdateOpts): Promise<MaintenanceResult>
```

**Parameters:**
- `onLog: LogFn` — Progress logger.
- `opts: UpdateOpts` _(optional)_ — Existing update options (skipInstall/skipBuild).

**Returns:** `Promise<MaintenanceResult>` — Existing maintenance.update, RESHAPED: after the post-build runUpdateReconcile it also calls runUpdateSteeringRefresh(root, onLog) and pushes steps.push('steering-refresh'); the per-repo report rides on an optional MaintenanceResult.steeringRefresh field (mirrors configReconcile). No change to the git/install/build arms; still does NOT restart the daemon.

**Errors:**
- `MaintenanceResult{ok:false}` when unchanged — only a real git/install/build failure fails the update; the steering refresh is best-effort and never contributes to ok:false.

**Preconditions:**
- Runs in the CLI maintenance process over the daemon install root.

**Postconditions:**
- On a successful update, every registered repo whose files already carry the markers has its steering block refreshed to the newly-built template (ac); opted-out repos are untouched.

## Data model changes

### `refreshMarkedSection + SteeringRefreshDeps / SteeringRefreshReport (SteeringFileOutcome list)` — new

A pure replace-only variant of upsertMarkedSection (reuses UpsertResult + SteeringFileOutcome from steering-inject.ts) plus the walk's injectable deps + report types. Lives in src/daemon/steering-inject.ts (next to its siblings), consumed by the maintenance hook.

**Call sites:**
- `src/daemon/steering-inject.ts`
- `src/cli/services/maintenance.ts`

### `MaintenanceResult.steeringRefresh (optional report field)` — field-add

Add an optional `steeringRefresh?: SteeringRefreshReport` to MaintenanceResult, mirroring the existing optional `configReconcile` field — additive, so every existing consumer/caller of MaintenanceResult is unaffected.

**Call sites:**
- `src/cli/services/maintenance.ts`
- `src/cli/services/type-contracts/maintenance-result.ts`

### `maintenance.update post-build flow` — invariant-change

src/cli/services/maintenance.ts update(): add a best-effort runUpdateSteeringRefresh(root, onLog) call beside the existing runUpdateReconcile (both strictly after `npm run build`, both in their own try/catch that never flips ok:false), and steps.push('steering-refresh'). The git-sync/install/build arms + the 'daemon NOT restarted' contract are unchanged.

**Call sites:**
- `src/cli/services/maintenance.ts`

## Error paths

### Error cases

- **A registered repo's path no longer exists on disk (moved/deleted) when the walk reaches it.** (recoverable)
  - Detection: refreshSteeringAcrossRepos reads `<repo>/CLAUDE.md` / `AGENTS.md` and the fs read rejects with ENOENT (the directory/file is gone).
  - Response: Record a SteeringFileOutcome {action:'skipped', note:'unreadable/absent'} for that repo/file and CONTINUE the walk — a per-repo failure never aborts the rest.
  - User impact: The stale/absent repo is reported (in the update log) and skipped; every other registered repo still gets refreshed.
- **A repo file has duplicate or malformed insrc:steering markers (hand-edited).** (recoverable)
  - Detection: refreshMarkedSection counts markers / checks ordering and hits the duplicate (>1 open/close) or malformed (open without close, or end<start) guard.
  - Response: Return {content:null, action:'unchanged'/'skipped', note} — the file is left BYTE-FOR-BYTE untouched and the note is recorded.
  - User impact: The ambiguous file is never clobbered; the note tells the user to de-duplicate the markers manually (same guard as repo.add).
- **The steering-block.md asset is missing or empty at refresh time (e.g. build did not stage prompts).** (recoverable)
  - Detection: readSteeringBlock throws (missing/empty asset) at the top of runUpdateSteeringRefresh.
  - Response: The best-effort wrapper's try/catch swallows it, logs a warn, and returns undefined; maintenance.update keeps ok:true and pushes 'steering-refresh' as attempted.
  - User impact: The update still succeeds; no repo is touched; the log notes the block asset was unavailable (defer to the next update).
- **Writing the refreshed block fails for one repo (read-only file / permission denied) though its block was stale.** (recoverable)
  - Detection: writeFile rejects for that specific `<repo>/CLAUDE.md`|`AGENTS.md`.
  - Response: Record {action:'skipped', note:'write failed: <msg>'} and continue; other repos are unaffected.
  - User impact: That one file keeps its old block (reported); the rest of the fleet is refreshed. Re-running update (after fixing perms) picks it up.
- **listRepos itself fails (registry unreadable / LMDB error).** (recoverable)
  - Detection: The `await listRepos(...)` call inside runUpdateSteeringRefresh rejects.
  - Response: The wrapper's top-level try/catch catches it, logs, returns undefined; maintenance.update stays ok:true.
  - User impact: The update completes normally; no steering files are touched; the failure is logged, not fatal.

### Edge cases

| Input | Expected |
| :--- | :--- |
| A repo whose CLAUDE.md carries well-formed markers but the block already matches the fresh template (identical). | refreshMarkedSection returns action:'unchanged' (content:null); no write — idempotent, so a second update is a no-op. |
| A repo that opted out of steering (neither file has the markers, or the files are absent). | refreshMarkedSection returns action:'skipped' for both files; the block is NEVER created — opt-out is honoured by construction (replace-only). |
| A repo with markers in CLAUDE.md but no AGENTS.md (only Claude was selected at add time). | CLAUDE.md is refreshed (replaced/unchanged); AGENTS.md is skipped (absent) — per-file opt-out preserved; Codex is not silently given a block. |
| Zero registered repos. | The walk is a no-op with an empty report; the update proceeds normally. |
| The daemon is still running during the update (update does not restart). | The refresh reads the registry as a concurrent LMDB reader and writes only repo markdown files (which the daemon doesn't hold) — no contention; safe. |
| A repo whose CLAUDE.md has the marked block surrounded by the user's own content. | Only the region between the markers is replaced; all surrounding user content is preserved byte-for-byte (the existing upsert guarantee). |

### Invariants to preserve

- maintenance.update fails (returns ok:false) ONLY on a real git-sync / npm install / npm run build failure; the steering refresh is best-effort in its own try/catch and NEVER contributes to ok:false — exactly the contract the sibling runUpdateReconcile already holds ('must NOT flip a successful update to failed'). [[c2]]
- maintenance.update still does NOT restart the daemon; the refresh only writes repo markdown files, which take effect for controllers without a restart. [[c2]]
- The marker upsert never clobbers content outside the insrc:steering markers, and leaves a file byte-for-byte untouched on duplicate/malformed markers — refreshMarkedSection preserves this guarantee from the existing upsertMarkedSection. [[c1]]
- repo.add's injectSteeringBlock and its create/append arms are unchanged — the refresh is purely additive (a new replace-only walk), so first-time install on add and the opt-out prompt still behave as before. [[c1]]

## Test strategy

**Test framework:** `node:test + node:assert/strict, run via npx tsx --test (the repo's convention; steering-inject.test.ts + the CLI maintenance tests already use it). The walk + maintenance hook are exercised through injected deps (fake listRepos/readBlock/fs), so no real git/npm/LMDB is needed.`

### Test levels

- **unit** — Prove the pure replace-only refreshMarkedSection variant — the guard that distinguishes it from upsertMarkedSection.
  - Subjects: `present + stale block → action 'replaced', surrounding user content preserved byte-for-byte`, `present + identical block → action 'unchanged' (content:null), no write`, `absent file (existing=null) → action 'skipped', NEVER 'created'`, `present file WITHOUT markers → action 'skipped', NEVER 'created'/appended (opt-out honoured)`, `duplicate or malformed markers → unchanged/skipped + note, file left byte-for-byte untouched`
  - Fixtures: `Hand-built file-text fixtures (stale-block, identical-block, no-marker, duplicate-marker, malformed-marker) + a canned block string`
- **unit** — Prove refreshSteeringAcrossRepos walks the registry + writes replace-only, resilient to per-repo failures, against an injected deps seam.
  - Subjects: `mixed repo list: repo with stale block → written (replaced); opted-out repo (no markers / files absent) → skipped, not created; repo with malformed markers → untouched`, `a repo file whose read rejects (moved/deleted) → recorded skipped+note, walk CONTINUES to the remaining repos`, `a repo whose write rejects (perm) though stale → recorded skipped+note, other repos still refreshed`, `CLAUDE.md present-with-markers but AGENTS.md absent → CLAUDE.md refreshed, AGENTS.md skipped (per-file opt-out)`, `zero registered repos → empty report, no writes`, `writes happen ONLY on action==='replaced' (identical/skip never write) — assert the fake writeFile call set`
  - Fixtures: `A fake SteeringRefreshDeps: canned listRepos array, a readBlock returning a fixed block, an in-memory readFile/writeFile that can be told to throw for a given path`
- **unit** — Prove runUpdateSteeringRefresh is best-effort — never throws, swallows top-level failures.
  - Subjects: `readBlock/asset missing → catches, logs, returns undefined (does not throw)`, `listRepos rejects → catches, returns undefined`, `happy path → returns a SteeringRefreshReport with the per-repo outcomes + emits an onLog summary line`
  - Fixtures: `A fake deps seam + a capturing onLog`
- **integration** — Prove maintenance.update wires the refresh in as a best-effort post-build step without changing the update contract.
  - Subjects: `a forced steering-refresh failure (deps seam throws) does NOT flip the update to ok:false — update stays ok:true and steps includes 'steering-refresh'`, `on a successful run, MaintenanceResult.steeringRefresh carries the per-repo report (mirrors configReconcile)`, `the refresh runs strictly AFTER the build step (ordering) and the daemon is NOT restarted (no restart call)`
  - Fixtures: `The maintenance update flow driven with skipInstall/skipBuild or injected git/npm/refresh seams so no real network/build runs (matching the existing maintenance test setup under src/cli/**/__tests__/)`

### Acceptance mapping

| Criterion | Proving tests |
| :--- | :--- |
| `ac1` | `integration: maintenance.update calls the refresh after build, records MaintenanceResult.steeringRefresh, and pushes steps 'steering-refresh' (no restart)`, `unit: refreshSteeringAcrossRepos writes the fresh block to a repo whose CLAUDE.md carries a stale marked block (replaced)` |
| `ac2` | `unit: refreshMarkedSection returns 'skipped' (never 'created') for an absent file AND a present-without-markers file`, `unit: refreshSteeringAcrossRepos leaves opted-out repos (no markers) untouched while refreshing has-block repos` |
| `ac3` | `unit: runUpdateSteeringRefresh returns undefined (never throws) when readBlock or listRepos fails`, `integration: a steering-refresh failure never flips maintenance.update to ok:false`, `unit: a per-repo read/write error is recorded skipped+note and the walk continues` |
| `ac4` | `unit: refreshMarkedSection preserves surrounding user content on 'replaced' and leaves duplicate/malformed-marker files byte-for-byte untouched` |
| `ac5` | `unit: refreshSteeringAcrossRepos only reads the registry + writes repo markdown files (asserted via the fake deps — no repo-row upsert / no re-index call)`, `integration: maintenance.update does not restart the daemon (no restart invocation) and the git/install/build arms are unchanged` |

## Migration

**State before:** maintenance.update (src/cli/services/maintenance.ts) runs git fast-forward sync → npm install (if the lockfile changed) → npm run build → a best-effort runUpdateReconcile post-build step → returns {ok, steps, configReconcile}; it does NOT restart the daemon and NOTHING walks the registered repos. injectSteeringBlock (src/daemon/steering-inject.ts) has exactly one caller — the repo.add IPC handler (src/daemon/index.ts:488) — so an updated steering-block.md reaches existing repos ONLY via a manual per-repo repo.add (which also upserts the repo row + re-indexes). upsertMarkedSection has a 'created' arm that would ADD the block to a repo that never had it.

**State after:** maintenance.update additionally runs a best-effort runUpdateSteeringRefresh(root, onLog) after build (beside runUpdateReconcile) that walks listRepos and, for each repo whose CLAUDE.md/AGENTS.md already carries well-formed insrc:steering markers, rewrites ONLY the marked region with the freshly-built block (replace-only via the new refreshMarkedSection — never the 'created' arm); the per-repo report rides on an optional MaintenanceResult.steeringRefresh field. Opted-out repos are untouched; no re-index; no daemon restart; the update ok/fail contract is unchanged.

**Zero downtime:** yes — **Data rewrite:** no

### Steps

1. Add the pure `refreshMarkedSection` variant + the `SteeringRefreshDeps`/`SteeringRefreshReport` (SteeringFileOutcome list) types to steering-inject.ts — new exports only, no change to upsertMarkedSection/injectSteeringBlock. — ↩ rollbackable
2. Add the `refreshSteeringAcrossRepos(deps?)` walk (listRepos → per-repo CLAUDE.md/AGENTS.md → refreshMarkedSection → write only on 'replaced') with an injectable deps seam — additive. — ↩ rollbackable
3. Add an OPTIONAL `steeringRefresh?: SteeringRefreshReport` field to MaintenanceResult (mirrors the existing optional configReconcile) — additive, no existing consumer touched. — ↩ rollbackable
4. Wire `runUpdateSteeringRefresh(root, onLog)` into maintenance.update strictly after `npm run build` (in its own try/catch, never flipping ok:false) and `steps.push('steering-refresh')` — remove-to-rollback. — ↩ rollbackable

**Backward compat:** Fully backward-compatible. MaintenanceResult gains only an OPTIONAL field, so every existing reader/caller is unaffected; the update() signature, the git/install/build arms, the ok/fail contract, and the 'daemon NOT restarted' guarantee are all unchanged; repo.add/injectSteeringBlock (incl. its create/append/opt-out prompt) are untouched. No config flag, no user action: the FIRST `insrc daemon update` after this ships refreshes each registered repo whose block is present + stale in place (idempotent — unchanged when already current); a repo that opted out (no markers) is never given a block, so hand-removal of the markers remains a durable opt-out. A downgrade simply stops refreshing on update — already-refreshed repo files are valid steering blocks and need no reversal.

## Alternatives considered

### a1: Best-effort post-build step in maintenance.update, mirroring runUpdateReconcile — **CHOSEN**

Add a runUpdateSteeringRefresh(root, onLog) best-effort step beside the existing post-build runUpdateReconcile: walk listRepos() and, for each repo whose CLAUDE.md/AGENTS.md already carries the markers, apply a replace-ONLY upsert with the freshly-built block; own try/catch, never flips update ok:false.



### a2: Refresh at daemon boot (walk + replace-only upsert in the boot sequence)

Do the replace-only refresh in the daemon's own boot sequence: on start, walk listRepos() and refresh every repo whose files already carry the markers.



**Rejected because:** PARTIAL on the deciding requirement (trigger-on-update): it moves the work to boot, but `insrc daemon update` deliberately does NOT restart, so 'automatic on update' would not actually fire at update time — only on the next manual restart. Also heavier boot-time fs side effects that must be isolated so they never block serving.

### a3: New daemon IPC repo.refreshSteering (all-repos), invoked post-restart

Add a daemon IPC that performs the replace-only walk across all registered repos; maintenance drives it after a restart, and it's also callable standalone from the TUI.



**Rejected because:** Largest surface (new IPC + result contract + both-side wiring) and PARTIAL on trigger-on-update (needs a restart to run the new build before the IPC can act — update doesn't restart). Over-engineered for auto-refresh-on-update; the reusable-IPC value is speculative. a1 delivers the same outcome with one best-effort function and no restart.

## Citations

- **[[c1]]** `code` `src/daemon/steering-inject.ts — upsertMarkedSection (pure marker upsert, {content,action,note}, never-clobber + duplicate/malformed guards), readSteeringBlock (reads out/prompts/steering-block.md via the module's own import.meta.url), UpsertResult/SteeringFileOutcome, injectSteeringBlock: the core refreshMarkedSection + the walk reuse`
- **[[c2]]** `code` `src/cli/services/maintenance.ts — update() (git sync → npm install → npm run build → best-effort runUpdateReconcile post-build, own try/catch that never flips ok:false, does NOT restart the daemon): the exact precedent + insertion point for runUpdateSteeringRefresh; MaintenanceResult + its type-contract (type-contracts/maintenance-result.ts) is where the optional steeringRefresh field lands`
- **[[c3]]** `code` `src/db/repos.ts listRepos(_db): Promise<RegisteredRepo[]> (self-opens the global LMDB registry at ~/.insrc; RegisteredRepo.path) — the registry the walk iterates; concurrent-reader-safe with a still-running daemon`
- **[[c4]]** `code` `src/daemon/index.ts:488 repo.add handler — injectSteeringBlock's ONLY caller today (gated on a steering selection); confirms the refresh is purely additive and the CLAUDE.md/AGENTS.md targets`
- **[[c5]]** `code` `src/daemon/__tests__/steering-inject.test.ts — the existing upsertMarkedSection branch coverage the replace-only + walk tests extend (node:test + assert/strict via npx tsx --test)`
- **[[c6]]** `step-output` `s8 checklist.verify — all 18 items passed (cd1-3, dm1-2, int1-2, ep1-3, ts1-2, mg1-2, alt1-2, sbdry1-4)`

<!-- insrc:review -->

## Review

### ✅ Review `PASS` — design.story (design.story)

**0 HIGH · 0 MED · 8 LOW** · model `client` · reviewed 2026-08-01T09:13:31.480Z

| Ref | Kind | Severity | Fixability | Premise | Evidence | Action |
| --- | --- | --- | --- | --- | --- | --- |
| c1 | citation | LOW | manual | src/daemon/steering-inject.ts exports the pure upsertMarkedSection returning UpsertResult {content,action,note} + readSteeringBlock + SteeringFileOutcome — the primitives refreshMarkedSection reuses. | steering-inject.ts:90 upsertMarkedSection, :64 readSteeringBlock, :80 UpsertResult, :45 SteeringFileOutcome — all present; the refresh reuse is grounded. Confirmed. | none |
| c1 | semantic | LOW | manual | upsertMarkedSection has a 'created' arm for both the absent-file and present-without-markers cases — the arm refreshMarkedSection must collapse to 'skipped' (replace-only). | steering-inject.ts:95 `action:'created'` (absent-file arm) + :104 (present-without-markers append arm), :102 `if (opens === 0 && closes === 0)` — the two 'created' arms refreshMarkedSection must collapse to 'skipped' are real. Confirmed. | none |
| c2 | citation | LOW | manual | src/cli/services/maintenance.ts update() runs a best-effort post-build runUpdateReconcile(root, onLog) that never flips ok:false and does NOT restart the daemon — the precedent + insertion point for runUpdateSteeringRefresh. | maintenance.ts:122 `npm run build`, :148 'update complete (daemon NOT restarted)'; runUpdateReconcile is the exported post-build best-effort step (16 src refs incl. its own tests) — the precedent + insertion point. Confirmed. | none |
| c2 | semantic | LOW | manual | MaintenanceResult already carries an optional configReconcile field (declared in the maintenance-result type-contract), so adding an optional steeringRefresh field mirrors an existing additive pattern. | maintenance.ts:42 `interface MaintenanceResult`; type-contracts/maintenance-result.ts exists; configReconcile is the existing optional field on the update return (`return {ok:true, steps, configReconcile}`) that the additive steeringRefresh mirrors. Confirmed. | none |
| c3 | citation | LOW | manual | src/db/repos.ts exports listRepos(_db): Promise<RegisteredRepo[]> (self-opens the global registry; the _db param unused) and RegisteredRepo carries a path — the registry the walk iterates. | repos.ts:213 `export async function listRepos(_db): Promise<RegisteredRepo[]>` (self-opens; _db unused); types.ts:621 RegisteredRepo with a path — the registry the walk iterates. Confirmed. | none |
| c4 | citation | LOW | manual | The repo.add IPC handler in src/daemon/index.ts is injectSteeringBlock's only production caller, gated on a steering selection — confirming the refresh is additive and unchanged. | daemon/index.ts:453 'repo.add' handler, :488 `injectSteeringBlock(normalisedPath, sel)` — its only production caller, gated on the steering selection; the refresh is additive + leaves this path unchanged. Confirmed. | none |
| c5 | citation | LOW | manual | src/daemon/__tests__/steering-inject.test.ts already unit-tests upsertMarkedSection's branches (the pattern the replace-only + walk tests extend), using node:test. | steering-inject.test.ts:25-28 'upsertMarkedSection — the pure marker logic (every branch)' with node:test/assert — the pattern the replace-only + walk tests extend. Confirmed. | none |
| c1 | semantic | LOW | manual | readSteeringBlock resolves out/prompts/steering-block.md via the steering-inject module's own import.meta.url, so it reads the freshly-built asset after npm run build regardless of caller. | steering-inject.ts:58 `steeringBlockPath()` resolving via import.meta.url + :65 readSteeringBlock uses it — so it reads out/prompts/steering-block.md by the module's own location (fresh after build) regardless of caller. Confirmed. | none |
