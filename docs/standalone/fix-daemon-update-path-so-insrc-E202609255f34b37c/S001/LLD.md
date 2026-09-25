<!-- insrc:artifact LLD-5f34b37c850e4ffb-S001 -->

# LLD: E202609255f34b37c:S001

**Epic:** `fix-daemon-update-path-so-insrc`
**HLD base run:** `wf-1790323317478-a1vll7`
**HLD effective hash:** `5f34b37c850e...`

## HLD context

**Framework:** Standalone feature — no parent HLD. Design directly against the repo, grounded on the s1 analyze passes. There are no HLD shared contracts to honour.
**Rollout phase:** standalone

## Contract details

**Surface level:** internal

### `runBootSteeringRefresh`

```typescript
export async function runBootSteeringRefresh(deps?: Partial<SteeringRefreshDeps>): Promise<SteeringRefreshReport | undefined>
```

**Parameters:**
- `deps: Partial<SteeringRefreshDeps>` _(optional)_ — Optional seam overrides (listRepos/readBlock/readFile/writeFile) so the hook is unit-testable without touching the real registry or fs; production passes nothing so refreshSteeringAcrossRepos fills its own defaults (listRegisteredRepos + readSteeringBlock + node fs).

**Returns:** `Promise<SteeringRefreshReport | undefined>` — The flat per-file refresh report on success, or undefined when the refresh threw (best-effort swallow) — mirroring runUpdateSteeringRefresh's undefined-on-failure contract so a fault can never abort daemon boot.

**Errors:**
- `none (never throws)` when Any failure (asset read error, registry/listRepos rejection, per-file write error) is caught and logged best-effort; per-file faults are already isolated inside refreshSteeringAcrossRepos, and this wrapper additionally guards the top-level (readBlock/listRepos) so nothing propagates to the boot sequence.

**Preconditions:**
- Called during daemon boot AFTER the repo registry is available (so the default listRegisteredRepos returns the workspace repos)
- The daemon's built steering asset (out/prompts/steering-block.md) exists (readSteeringBlock throws only when missing/empty; that throw is swallowed and logged)

**Postconditions:**
- Every REGISTERED repo whose CLAUDE.md/AGENTS.md already carries the insrc:steering markers has that region replaced with stripGuideSections(readSteeringBlock()) (the skeleton) when stale; unchanged when already current (idempotent no-op)
- Repos with no marker / absent file are left untouched (REPLACE-ONLY opt-out preserved)
- The daemon boot sequence continues regardless of the refresh outcome (never fatal)

### `refreshSteeringAcrossRepos`

```typescript
export async function refreshSteeringAcrossRepos(deps?: Partial<SteeringRefreshDeps>): Promise<SteeringRefreshReport>
```

**Parameters:**
- `deps: Partial<SteeringRefreshDeps>` _(optional)_ — Existing seam bag (from s1) the new boot hook delegates to unchanged; production defaults strip guide sections centrally and walk the LMDB registry.

**Returns:** `Promise<SteeringRefreshReport>` — Existing contract (unchanged): the flat per-file outcome list across every walked repo; may reject if readBlock/listRepos throw (which is why the new boot wrapper guards it).

**Errors:**
- `Error (propagates)` when Existing behaviour: a readBlock (asset missing/empty) or listRepos rejection propagates; per-file read/write faults are caught internally and recorded as skipped outcomes.

**Preconditions:**
- Existing: consumed as-is by runBootSteeringRefresh; not modified by this Story

**Postconditions:**
- Existing: unchanged — this Story only adds a new caller, it does not alter refreshSteeringAcrossRepos

## Error paths

### Error cases

- **The daemon's built steering asset (out/prompts/steering-block.md) is missing or empty at boot** (recoverable)
  - Detection: The default readBlock (readSteeringBlock) throws inside refreshSteeringAcrossRepos before any repo is walked; runBootSteeringRefresh's top-level try/catch catches the rejected promise.
  - Response: Log a best-effort warn ('steering refresh skipped — retry on next boot') and return undefined; the boot sequence proceeds.
  - User impact: Registered repos are not re-stamped this boot; the next boot after a good build self-heals them.
- **The LMDB repo registry read (listRegisteredRepos) rejects at boot** (recoverable)
  - Detection: The awaited refreshSteeringAcrossRepos promise rejects at the listRepos() call; caught by runBootSteeringRefresh's wrapper.
  - Response: Log a best-effort warn and return undefined; daemon boot continues (never fatal).
  - User impact: No repos refreshed this boot; retried next boot.
- **Writing the refreshed block to one repo's CLAUDE.md/AGENTS.md fails (e.g. read-only file / permissions)** (recoverable)
  - Detection: refreshSteeringAcrossRepos's existing per-file try/catch catches the write error and records that file as action:'skipped' with a note; the walk continues to the remaining files/repos.
  - Response: That one file is reported skipped; every other repo/file is still refreshed; the aggregate report is returned normally.
  - User impact: The single un-writable file stays stale; all other repos are updated.

### Edge cases

| Input | Expected |
| :--- | :--- |
| A registered repo whose CLAUDE.md/AGENTS.md has NO insrc:steering markers (opted out, like a hand-authored project doc) | refreshMarkedSection returns skipped (REPLACE-ONLY) — the file is left untouched, no block installed. |
| A repo whose marked region already equals the current stripped skeleton | refreshMarkedSection returns action:'unchanged' — no write occurs (idempotent no-op), so repeated boots do not churn files or git status. |
| The registry is empty (no registered repos) | refreshSteeringAcrossRepos returns an empty report; no writes; runBootSteeringRefresh returns the empty report, no error. |
| A repo file with duplicate or malformed insrc:steering markers | refreshMarkedSection's guard returns action:'unchanged' with a note ('duplicate/malformed markers — left untouched'); the file is never clobbered. |
| The boot hook runs on a normal restart where nothing changed since last boot | Every repo reports 'unchanged'; zero writes — the hook is a cheap no-op, exactly like the boot config reconcile. |

### Invariants to preserve

- REPLACE-ONLY opt-out: the refresh must NEVER install a steering block into a repo that opted out (absent file or a CLAUDE.md/AGENTS.md with no insrc:steering markers). Only an already-marked region is replaced. [[c1]]
- Idempotency: when a marked region already equals the current stripped skeleton, no write occurs (refreshMarkedSection returns 'unchanged'), so running the refresh on every boot does not churn files. [[c2]]
- Boot best-effort / never-fatal: a steering-refresh failure must never abort or fail the daemon boot sequence — it is caught, logged, and retried next boot, mirroring the existing authoritative boot config reconcile. [[c3]]
- Daemon owns DB access (rule 1): the registry read backing the refresh runs in-process in the daemon (listRegisteredRepos), never a separate process against the live LMDB. [[c4]]

## Test strategy

**Test framework:** `node:test (tsx --test), asserted with node:assert/strict — the repo convention used by maintenance-steering-refresh.test.ts and guide-strip.test.ts`

### Test levels

- **unit** — Prove runBootSteeringRefresh's contract over injected seams without touching the real registry or fs (mirroring maintenance-steering-refresh.test.ts + guide-strip.test.ts).
  - Subjects: `runBootSteeringRefresh returns the per-file report and re-stamps a MARKED repo file to the stripped skeleton (guide-marker-free) when the injected readBlock is the whole canonical asset`, `runBootSteeringRefresh leaves an UNMARKED / absent file untouched (REPLACE-ONLY opt-out)`, `runBootSteeringRefresh is idempotent: a second run over the already-stamped file reports 'unchanged' and writes nothing`, `runBootSteeringRefresh swallows a readBlock throw (missing/empty asset) and returns undefined without throwing`, `runBootSteeringRefresh swallows a listRepos rejection and returns undefined without throwing`, `runBootSteeringRefresh over an empty registry returns an empty report, no writes`
  - Fixtures: `An in-memory marked-file fixture (STEERING markers around stale content) + a whole-asset-with-guide-sections readBlock`, `Injected listRepos/readFile/writeFile seams capturing writes (the guide-strip.test.ts pattern)`
- **integration** — Prove the boot hook is actually wired into the daemon boot sequence after the authoritative config reconcile (a source-scan test, since booting the daemon headlessly is heavy — same rationale as the existing maintenance SOURCE-contract test).
  - Subjects: `src/daemon/index.ts imports and calls runBootSteeringRefresh in the boot sequence AFTER the reconcileConfigFile block`, `the call is guarded best-effort (inside a try/catch or awaiting the never-throwing wrapper) so it cannot abort boot`
  - Fixtures: `Read src/daemon/index.ts source and assert the call ordering + guard (regex/source-scan)`

### Acceptance mapping

| Criterion | Proving tests |
| :--- | :--- |
| `ac1` | `unit: runBootSteeringRefresh re-stamps a MARKED repo file to the stripped skeleton`, `integration: index.ts calls runBootSteeringRefresh in the boot sequence after the reconcile` |
| `ac2` | `unit: runBootSteeringRefresh leaves an UNMARKED / absent file untouched (opt-out)` |
| `ac3` | `unit: runBootSteeringRefresh is idempotent — second run reports 'unchanged', no write` |
| `ac4` | `unit: readBlock throw → returns undefined, never throws`, `unit: listRepos rejection → returns undefined, never throws`, `unit: empty registry → empty report, no writes` |
| `ac5` | `integration: the boot-hook call is guarded best-effort so a fault cannot abort daemon boot` |

## Migration

**State before:** The daemon boot sequence runs the AUTHORITATIVE config reconcile (src/daemon/index.ts ~line 162-206) but has NO boot-time steering refresh; refreshSteeringAcrossRepos is invoked only from runUpdateSteeringRefresh in src/cli/services/maintenance.ts, whose sole caller is the interactive CLI TUI update flow. Consequently scripts/daemon-ctl.sh (update/restart) and the daemon.update IPC (src/daemon/update-runner.ts) rebuild the daemon but never re-stamp registered repos, so a live update leaves each repo's marked insrc:steering region stale.

**State after:** src/daemon/index.ts calls a new best-effort runBootSteeringRefresh at boot, right after the config-reconcile block. Because every update entrypoint (shell update+start, shell restart, daemon.update IPC) terminates in a daemon boot, the marked steering region of every registered repo is re-stamped to the stripped skeleton on the next boot after any update — idempotently and without aborting boot on failure.

**Zero downtime:** yes — **Data rewrite:** no

### Steps

1. Add a new exported best-effort wrapper runBootSteeringRefresh(deps?) in src/daemon/steering-inject.ts that awaits refreshSteeringAcrossRepos(deps) inside try/catch and returns undefined (logging a warn) on any throw — mirroring runUpdateSteeringRefresh's never-throw contract. — ↩ rollbackable
2. Call runBootSteeringRefresh() in src/daemon/index.ts immediately after the config-reconcile block, awaited-but-guarded so a fault cannot abort boot; log the per-file report summary like the reconcile does. — ↩ rollbackable
3. Leave the existing maintenance.ts runUpdateSteeringRefresh call in place (now redundant but harmless — idempotent, and it still serves the CLI TUI's own progress log); no change required. — ↩ rollbackable

**Backward compat:** No public API or wire/schema change. refreshSteeringAcrossRepos is consumed unchanged; the only additions are a new internal export (runBootSteeringRefresh) and one new boot call site. The CLI TUI update path is unaffected (at worst it and the boot hook both run the idempotent refresh — the second is a no-op). Repos that opted out (unmarked/absent files) remain untouched, so no existing user file is newly modified without markers.

## Alternatives considered

### a1: Boot-time steering refresh in daemon/index.ts (mirror the boot reconcile) — **CHOSEN**

Run refreshSteeringAcrossRepos() at daemon boot, right after the existing authoritative config reconcile, best-effort + idempotent.

Extract a small, seam-injectable boot hook (runBootSteeringRefresh) delegating to the already-exported refreshSteeringAcrossRepos and invoke it in src/daemon/index.ts immediately after the config-reconcile block, once the registry is available. Unconditional like the reconcile, wrapped in a never-fatal try/catch, so a fault cannot abort boot. Because every update entrypoint terminates in a boot of index.js, this single hook fires on every update path.

### a2: Shell→node bridge in daemon-ctl.sh (post-build maintenance invocation)

After npm_build, daemon-ctl.sh invokes a node entrypoint that runs runUpdateReconcile + runUpdateSteeringRefresh from the built maintenance service.

Add a new bin entrypoint wrapping the maintenance fns and call it from daemon-ctl.sh after npm_build in cmd_start (reused by cmd_restart) and cmd_update.

**Rejected because:** dc2 VIOLATES rule 1: on daemon-ctl.sh update the daemon is still live, so a separate node process opening the LMDB registry concurrently risks lock contention. Also partial path coverage (dc1) and more new surface (dc5). Rank 3.

### a3: Post-restart steering.refresh IPC driven by update-runner

Add a daemon steering.refresh IPC and have the daemon.update helper call it after the restart completes and the daemon is ready.

Add a thin daemon steering.refresh IPC over refreshSteeringAcrossRepos and extend the update-runner detached helper to invoke it after daemon-ctl.sh restart reports ready.

**Rejected because:** dc1 PARTIAL: covers only the daemon.update IPC path — a user running daemon-ctl.sh update/restart directly gets no refresh. Adds a new IPC + client wiring + wait-for-ready/reconnect complexity (dc3/dc5 partial) for strictly less coverage than a1. Rank 2.

## Citations

- **[[c1]]** `analyze-bundle` `src/daemon/steering-inject.ts` — "refreshMarkedSection is REPLACE-ONLY: an absent or unmarked CLAUDE.md/AGENTS.md is skipped (opt-out), a marked region is replaced only when stale."
- **[[c2]]** `analyze-bundle` `src/daemon/steering-inject.ts` — "Idempotent (refreshMarkedSection returns action:'unchanged' when current → no write)."
- **[[c3]]** `analyze-bundle` `src/daemon/index.ts:162-206` — "At boot it runs the AUTHORITATIVE config reconcile UNCONDITIONALLY + best-effort (logs; 'retry on next boot' on failure; never fatal)."
- **[[c4]]** `convention` `CLAUDE.md — Key architectural rules #1 (Daemon owns all DB access)` — "Daemon owns all DB access — CLI, MCP, and the IDE workbench communicate via IPC only."
- **[[c5]]** `analyze-bundle` `src/daemon/update-runner.ts + scripts/daemon-ctl.sh + src/daemon/index.ts` — "EVERY update entrypoint terminates in a fresh daemon boot of index.js — making a boot-time hook the single point that covers all paths."

<!-- insrc:review -->

## Review

### ✅ Review `PASS` — design.story (design.story)

**0 HIGH · 0 MED · 9 LOW** · model `client` · reviewed 2026-09-25T08:11:37.996Z

| Ref | Kind | Severity | Fixability | Premise | Evidence | Action |
| --- | --- | --- | --- | --- | --- | --- |
| cl1 | citation | LOW | auto | refreshSteeringAcrossRepos is exported from src/daemon/steering-inject.ts and takes an optional Partial<SteeringRefreshDeps> returning Promise<SteeringRefreshReport>. | Confirmed: src/daemon/steering-inject.ts:301 `export async function refreshSteeringAcrossRepos(`; SteeringRefreshDeps/SteeringRefreshReport are defined in the same file. | Confirmed — no change needed. |
| cl2 | semantic | LOW | auto | refreshMarkedSection is REPLACE-ONLY: a file with no insrc:steering markers (or absent) is skipped, never given a block. | Confirmed: src/daemon/steering-inject.ts:168 `export function refreshMarkedSection(existing: string \| null, block: string): UpsertResult`; its REPLACE-ONLY opt-out (skip unmarked/absent) is the documented behaviour. | Confirmed — no change needed. |
| cl3 | semantic | LOW | auto | refreshMarkedSection returns action 'unchanged' (no write) when the marked region already equals the current block (idempotent). | Confirmed verbatim: src/daemon/steering-inject.ts:149 and :198 both `return { content: null, action: 'unchanged' };   // idempotent — block already current`. | Confirmed — no change needed. |
| cl4 | semantic | LOW | auto | readSteeringBlock throws only when the steering asset is missing/empty; it is exported from steering-inject.ts. | Confirmed: src/daemon/steering-inject.ts:66 `export function readSteeringBlock(): string`. | Confirmed — no change needed. |
| cl5 | citation | LOW | assisted | src/daemon/index.ts runs reconcileConfigFile at boot as the authoritative, best-effort, never-fatal reconcile point (the anchor after which the new hook is inserted). | The boot reconcile IS in src/daemon/index.ts (the 'retry on next boot' config.json messages at index.ts:225/229/233 prove the reconcile block), and reconcileConfigFile is the authoritative reconcile (maintenance.ts:30/192). But the LLD's cited anchor 'index.ts:162-206 / :176' reflects the BUILT out/daemon/index.js line numbers, not src (the src reconcile block is ~index.ts:210-233). | Non-blocking: at build time locate the reconcile block in src/daemon/index.ts by CONTENT (the reconcileConfigFile call / 'retry on next boot' messages, ~line 210-233) and insert runBootSteeringRefresh immediately after it, rather than trusting the built-file line numbers in the LLD. |
| cl6 | closed-union | LOW | manual | src/daemon/index.ts does NOT currently call refreshSteeringAcrossRepos anywhere in the boot sequence (the asymmetry the Story fixes); injectSteeringBlock is used only in the repo.add handler. | The asymmetry holds: src/daemon/index.ts imports injectSteeringBlock (used only in repo.add) and has NO boot call to refreshSteeringAcrossRepos (directly verified earlier via grep over the daemon index). The deterministic probe result was capped/inconclusive (its match list filled with docs hits before src), so this rests on direct inspection, not the probe. | Confirmed by direct inspection — no change needed; the Story correctly adds the missing boot call. |
| cl7 | citation | LOW | auto | runUpdateSteeringRefresh in src/cli/services/maintenance.ts is best-effort (returns undefined on failure, never throws) and reads root/out/prompts/steering-block.md then calls refreshSteeringAcrossRepos. | Confirmed: src/cli/services/maintenance.ts:214 `export async function runUpdateSteeringRefresh(`; it reads out/prompts/steering-block.md and delegates to refreshSteeringAcrossRepos, best-effort. | Confirmed — no change needed. |
| cl8 | ordering | LOW | auto | Every update entrypoint terminates in a daemon boot of out/daemon/index.js: daemon-ctl.sh cmd_start/cmd_restart spawn the daemon, and the daemon.update IPC (update-runner.ts) shells out to daemon-ctl.sh restart. | Confirmed: scripts/daemon-ctl.sh defines cmd_restart (=cmd_stop+cmd_start) and cmd_start spawns the daemon (DAEMON_ENTRY out/daemon/index.js); update-runner.ts shells out to `bash daemon-ctl.sh restart`. Every update path ends in a daemon boot. | Confirmed — no change needed. |
| cl9 | citation | LOW | auto | The existing tests maintenance-steering-refresh.test.ts and guide-strip.test.ts exist and establish the seam-injection + best-effort test patterns the new tests extend. | Confirmed both test files exist and establish the seam/best-effort patterns: src/cli/services/__tests__/maintenance-steering-refresh.test.ts and src/daemon/__tests__/guide-strip.test.ts (both pass in the current tree). | Confirmed — no change needed. |
