<!-- insrc:artifact LLD-b6c90b3e0240d36c-s2 -->

# LLD: E20260923b6c90b3e:S002

**Epic:** `work-framed-approved-spec-proceed-from`
**HLD base run:** `wf-1790185288043-yyq6gx`
**HLD effective hash:** `0a15cb12814d...`

## HLD context

**Framework:** Both plugins keep the locally-installed insrc daemon current over ONE net-new daemon-owned update+restart IPC. The daemon exposes a single request that pulls, rebuilds and self-restarts by spawning a DETACHED helper (the proven daemon-ctl.sh update+restart sequence) — the only safe way a process respawns itself, since the request's own socket dies mid-restart. Freshness is judged purely by git-commit comparison: the daemon reports its installed source commit additively on the existing daemon.status; each plugin runs a remote git ls-remote (no pull) against the daemon repo's default branch and compares. On drift the startup path shows a native in-IDE notification (Update/Dismiss) and updates only on approval; a plugin self-update triggers the daemon update automatically (notify-after, fire-and-forget). Failure surfaces once with the raw error; no retry/rollback — the daemon owns its state. The plugin confirms success by reconnecting and re-reading the installed commit.
**Rollout phase:** Phase A — daemon foundations (update+restart IPC and installed-commit report)
**Owns:** `sc2` (DaemonStatus.installedCommit)

**Adjacent scope (owned by other stories — do NOT implement here):**
- `s1`: The detached-helper mechanism itself is private to s1: how the daemon spawns daemon-ctl.sh update+restart fully detached (its own session/process group so it survives the daemon exit), where and how the DaemonUpdateOutcome record is persisted under the daemon home, and how the restarted daemon reads that record on boot to surface it. Callers see only the sc1 method shape — launch acknowledgement plus the reconnect-and-read-outcome protocol — never the helper wiring or the daemon-ctl.sh invocation details. — owns `sc1`
- `s3`: Everything VS-Code-specific stays private to s3: the activation hook that runs the check opportunistically only when the daemon is already reachable (k6), the remote git ls-remote invocation and commit comparison, the showInformationMessage notification with inline Update/Dismiss (k7), the first-activation detection that distinguishes a plugin self-update from an ordinary startup (to pick the approval-prompt path vs the auto notify-after path, k4), the fire-and-forget scheduling so the daemon update never blocks the plugin's own startup, and the reconnect-and-confirm loop plus the single failure notification (k5). None of this is consumed by any other Story.
- `s4`: Everything JetBrains-specific stays private to s4: the postStartupActivity hook running the opportunistic-when-reachable check (k6), the ls-remote comparison, the insrc Notifications BALLOON with inline Update/Dismiss (k7), the plugin-version-change detection that selects the approval path vs the auto notify-after self-update path (k4), the fire-and-forget scheduling off the UI thread so it never blocks activation, and the reconnect-and-confirm plus single failure balloon (k5). It mirrors s3's behaviour by consuming the same sc1 + sc2 contracts; it shares no code with s3.

## Contract details

**Surface level:** internal-shared

### `daemon.status`

```typescript
'daemon.status': () => Promise<DaemonStatus>
```

**Returns:** `DaemonStatus` — The existing status snapshot, now carrying one additive field installedCommit:string — the daemon root's current git HEAD sha, or '' when undeterminable. Every other field is unchanged; the handler remains best-effort/never-throws.

**Postconditions:**
- The returned DaemonStatus.installedCommit is the trimmed full sha of `git rev-parse HEAD` against DAEMON_ROOT, or '' when the root is absent / not a git repo / git unavailable.
- daemon.status still never throws: the git read is wrapped best-effort, exactly like the existing LMDB-size fs stat, so a git failure degrades to '' and does not fail the status call.
- No other DaemonStatus field is changed and sc1 (daemon.update/updateOutcome) is not touched.

### `readInstalledCommit`

```typescript
readInstalledCommit(root?: string, deps?: { exec?: (cmd: string, args: readonly string[]) => string }): string
```

**Parameters:**
- `root: string` _(optional)_ — The daemon checkout root to read HEAD from; defaults to $INSRC_DAEMON_ROOT ?? ~/.insrc/daemon (the tree daemon-ctl.sh updates).
- `deps: { exec?: (cmd, args) => string }` _(optional)_ — Injected exec seam (default: execFileSync-based git runner) so the reader is unit-testable without a real git process.

**Returns:** `string` — The trimmed full HEAD sha (`git rev-parse HEAD` of root), or '' on any failure — non-git/missing root, git absent, or a thrown exec. Never throws.

**Postconditions:**
- Pure + side-effect-free apart from the read-only git exec; returns '' rather than throwing on every failure path (best-effort), so daemon.status's never-throw contract holds.
- Runs `git -C <root> rev-parse HEAD` (the same command daemon-ctl.sh uses for its 'current' commit) — a cheap local read, no network, no version scheme (k1).

## Data model changes

### `DaemonStatus` — field-add

Add one additive required field installedCommit:string to the existing DaemonStatus interface (src/shared/types.ts:882), populated by the daemon.status handler (src/daemon/index.ts:922) from readInstalledCommit(). It is a plain string ('' when undeterminable) rather than optional, so consumers can always read it; existing fields and the never-throw guarantee are unchanged. This is the sc2 surface — distinct from sc1's DaemonUpdateOutcome (S001).

```
interface DaemonStatus { /* ...existing... */ installedCommit: string; }
```

**Call sites:**
- `src/shared/types.ts:882 (field definition)`
- `src/daemon/index.ts:922 (daemon.status handler sets the field)`
- `the new installed-commit reader module (produces the value)`

### `readInstalledCommit` — new

New pure helper module (e.g. src/daemon/installed-commit.ts) that resolves DAEMON_ROOT ($INSRC_DAEMON_ROOT ?? ~/.insrc/daemon) and returns the best-effort `git rev-parse HEAD` sha over an injected exec seam. Mirrors the sync execFileSync git idiom (migrate-docs-tree.ts:317) and the exact rev-parse HEAD command (maintenance.ts:101). S002-internal; resolves the root with its own env-var+default so it does NOT import s1's update-runner module (keeps sc2 independent of sc1).

```
export function readInstalledCommit(root?: string, deps?: { exec?: (cmd: string, args: readonly string[]) => string }): string
```

**Call sites:**
- `src/daemon/index.ts:922 (daemon.status handler)`
- `src/cli/services/maintenance.ts:34 (DAEMON_ROOT resolution convention it mirrors)`

## Interaction with shared contracts

| Contract | Role | How |
| :--- | :--- | :--- |
| `sc2` | implements | S002 owns and realizes sc2 (DaemonStatus.installedCommit). The additive installedCommit:string field on DaemonStatus is the contract surface both s3 and s4 consume; the daemon.status handler populates it from the pure readInstalledCommit() helper (best-effort git rev-parse HEAD of DAEMON_ROOT, '' when undeterminable). How the commit is computed — the reader module, DAEMON_ROOT resolution, and the '' fallback — is s2-internal; consumers see only the string. daemon.status's never-throw guarantee is preserved, and sc1 (daemon.update/updateOutcome, S001) is NOT touched. |

## Error paths

### Error cases

- **The daemon root is not a git repository (or does not exist) — e.g. a tarball/zip install, or a dev daemon whose ~/.insrc/daemon is absent** (recoverable)
  - Detection: `git -C <root> rev-parse HEAD` exits non-zero / throws (execFileSync raises on a non-zero exit), which readInstalledCommit catches in its try/catch.
  - Response: readInstalledCommit returns '' ; daemon.status sets installedCommit:'' and returns normally. The handler never throws.
  - User impact: The plugin sees installedCommit:'' and treats it as 'freshness undeterminable' — skips the drift check silently (per the plugin flows, adjacent boundary), never an error.
- **git is not installed / not on PATH** (recoverable)
  - Detection: spawning `git` fails with ENOENT; execFileSync throws, caught by readInstalledCommit's try/catch.
  - Response: Return '' ; daemon.status carries installedCommit:'' and still returns the rest of the status normally.
  - User impact: Same as a non-git root — freshness undeterminable, check skipped; no crash, no degraded status.
- **The git command hangs or is unexpectedly slow** (recoverable)
  - Detection: N/A at correctness level — `git rev-parse HEAD` is a local plumbing read with no network; there is no expected hang. (A pathological slow FS is out of scope; the exec is bounded by git's own local read.)
  - Response: The synchronous read completes as any local git plumbing call; if git itself errored it falls to the '' path above. No new timeout machinery is introduced for a cheap local read.
  - User impact: daemon.status latency is one local git exec (a few ms) — within the nonFunctional 'cheap local git read' budget; not a hot path.

### Edge cases

| Input | Expected |
| :--- | :--- |
| A detached-HEAD daemon root (checked out at a commit, not a branch) | `git rev-parse HEAD` still returns the current commit sha — installedCommit is the exact build commit, which is precisely what the freshness comparison needs (k1 compares commits, not branches). |
| A dirty working tree (uncommitted local edits) under the daemon root | installedCommit is the HEAD commit sha, unaffected by uncommitted changes — the reader reports the installed BUILD commit, not working-tree state. |
| readInstalledCommit called with no root argument | Resolves DAEMON_ROOT = $INSRC_DAEMON_ROOT ?? ~/.insrc/daemon and reads HEAD there — the tree the daemon runs from / daemon-ctl.sh updates. |
| git stdout carries a trailing newline (and rev-parse prints the full 40-char sha) | The reader .trim()s the output so installedCommit is the bare sha with no surrounding whitespace. |

## Test strategy

**Test framework:** `node:test (tsx --test), per src/daemon/__tests__/*.test.ts (server-registry.test.ts, analyze-rpc.test.ts)`

### Test levels

- **unit** — Assert the pure readInstalledCommit reader over an injected exec seam — the happy path returns the trimmed sha, and every failure path degrades to '' without throwing (the best-effort guarantee daemon.status relies on).
  - Subjects: `readInstalledCommit with an exec seam returning a sha (+ trailing newline) -> the bare trimmed sha`, `readInstalledCommit runs `git -C <root> rev-parse HEAD` — the injected exec records the exact command+argv`, `readInstalledCommit with an exec seam that THROWS (non-git root / non-zero exit / git ENOENT) -> '' , never throws`, `readInstalledCommit with no root arg resolves DAEMON_ROOT = $INSRC_DAEMON_ROOT ?? ~/.insrc/daemon`
  - Fixtures: `an injected exec fn returning a scripted sha or throwing`, `an INSRC_DAEMON_ROOT env override to assert root resolution without touching ~/.insrc`
- **unit** — Assert the daemon.status handler carries installedCommit and preserves the never-throw contract — exercised inline the way the daemon.debug-status test replicates a handler body, so no full daemon boot is needed.
  - Subjects: `the status object includes installedCommit populated from the (injected) reader`, `a reader that returns '' (undeterminable) yields installedCommit:'' with the rest of the status intact — the handler still resolves, never throws`, `sc1 fields (daemon.update/updateOutcome) are untouched by the status change`
  - Fixtures: `a stub readInstalledCommit returning a fixed sha or ''`

### Acceptance mapping

| Criterion | Proving tests |
| :--- | :--- |
| `ac1` | `unit: readInstalledCommit returns the trimmed `git rev-parse HEAD` sha for a valid daemon root (the exact installed build commit, comparable against upstream)`, `unit: the daemon.status object carries installedCommit set to that sha`, `unit: a git-read failure degrades installedCommit to '' while daemon.status still returns (never-throw), so freshness is 'undeterminable' rather than an error` |

## Alternatives considered

### a1: Per-read best-effort git read via a pure helper — **CHOSEN**

daemon.status computes installedCommit on every read by calling a pure readInstalledCommit(root) helper (synchronous best-effort git rev-parse HEAD), falling back to '' — no caching, no daemon lifecycle state.

Add installedCommit:string to DaemonStatus (src/shared/types.ts) and set it in the daemon.status handler (index.ts:922) from a new pure module (e.g. src/daemon/installed-commit.ts) exporting readInstalledCommit(root, deps?) over an injected exec seam. The reader runs `git -C <root> rev-parse HEAD` (execFileSync, encoding utf8), trims the sha, and returns '' on any failure (non-git root, git absent, exec throw) — all inside try/catch so it never throws. root resolves as $INSRC_DAEMON_ROOT ?? ~/.insrc/daemon, the same tree daemon-ctl.sh updates. Called per status read, mirroring the handler's existing per-read best-effort fs stat (LMDB size).

### a2: Compute once at daemon boot, cache in memory

Resolve installedCommit ONCE during daemon startup, store it in a module/scope variable, and return the cached value on every status read — zero per-read cost.

During daemon setup, call readInstalledCommit(root) once and hold the result in the daemon scope (or a module singleton). daemon.status returns the cached string. Because a self-update RESTARTS the daemon (sc1), the fresh process recomputes at its own boot, so the cached value is always correct for the process lifetime — the installed commit is invariant within a running daemon.

**Rejected because:** Also satisfies ac1/sc2/k1 and is strictly cheaper per read (returns a cached string), but buys that with daemon lifecycle state (a boot hook + cache) and a staleness caveat if the root's HEAD changes without a restart — more surface than a1 for a saving the HLD already deems unnecessary (the read is cheap). A close second, preferable only if status becomes a hot path.

### a3: Lazy memoize on first status read

Compute installedCommit on the first daemon.status read and cache it for subsequent reads — a hybrid: no boot cost, no repeated exec.

daemon.status calls readInstalledCommit(root) only the first time (guarded by a nullable cache in the daemon scope), memoizes the result, and returns the cache thereafter. Combines a1's no-boot-hook simplicity with a2's amortized zero-cost reads.

**Rejected because:** Satisfies ac1/k1 but only partial on sc2's spirit: it adds a nullable-cache guard AND inherits the staleness caveat, with a less predictable capture moment than either a1 (every read) or a2 (boot) — the most machinery for the least clarity, saving one git exec the HLD already calls cheap.

## Citations

- **[[c1]]** `analyze-bundle` `s1 structural-map: daemon.status handler (src/daemon/index.ts:922) + DaemonStatus (src/shared/types.ts:882), best-effort/never-throw` — "daemon.status builds a DaemonStatus object and is best-effort/never-throws (the LMDB-size read is wrapped in try/catch, 'status should never throw'); S002 adds one additive installedCommit:string set "
- **[[c2]]** `convention` `s1 convention: git rev-parse HEAD idiom (src/workflow/migrate-docs-tree.ts:317 execFileSync + src/cli/services/maintenance.ts:101)` — "installedCommit = execFileSync('git', ['-C', root, 'rev-parse', 'HEAD'], { encoding:'utf8' }).trim() wrapped best-effort; the exact rev-parse HEAD command daemon-ctl.sh uses for its 'current' commit. "
- **[[c3]]** `convention` `s1 convention: DAEMON_ROOT resolution (src/cli/services/maintenance.ts:34)` — "DAEMON_ROOT = $INSRC_DAEMON_ROOT ?? ~/.insrc/daemon — the tree the daemon runs from / daemon-ctl.sh updates. S002 resolves it with the same env-var+default in its own helper (does NOT import s1's upda"
- **[[c4]]** `convention` `s1 test-strategy: src/daemon/__tests__/server-registry.test.ts handler-driving + inline handler-body idiom` — "server-registry.test.ts drives handlers via internals(server).handleMessage(reqLine('daemon.status'), sock) and the debug-status test replicates a handler body inline; the pure readInstalledCommit rea"
- **[[c5]]** `prior-artifact` `HLD-b6c90b3e0240d36c sc2 + Epic constraint k1` — "sc2 = the additive DaemonStatus.installedCommit (full git rev-parse HEAD of the daemon root, '' if undeterminable), compared by each plugin against the upstream commit; freshness by git-commit compari"

<!-- insrc:review -->

## Review

### ✅ Review `PASS` — design.story (design.story)

**0 HIGH · 0 MED · 9 LOW** · model `client` · reviewed 2026-09-23T19:16:50.669Z

| Ref | Kind | Severity | Fixability | Premise | Evidence | Action |
| --- | --- | --- | --- | --- | --- | --- |
| c1 | citation | LOW | manual | The daemon.status handler at src/daemon/index.ts:922 builds a DaemonStatus object and is best-effort/never-throws (an existing read is wrapped in try/catch with a 'status should never throw' comment) — the additive installedCommit field lands here. | grep 'status should never throw' resolves at src/daemon/index.ts:944 — the daemon.status handler's best-effort fs-stat catch, confirming the handler + never-throw guarantee exist. The exact ':922' anchor has drifted ~1-2 lines because THIS story's own S001 commit added an import + handlers to index.ts; the handler is now ~line 923. Minor staleness, not a defect: the handler is present and the never-throw contract holds. | At build time, locate the daemon.status handler by name (it is the 'status should never throw' block near index.ts:944), not by the literal :922 anchor, when adding installedCommit. |
| c1 | citation | LOW | manual | DaemonStatus is defined as an interface at src/shared/types.ts:882, where the additive installedCommit:string field is added. | read src/shared/types.ts:882 = `export interface DaemonStatus {` — the interface the additive installedCommit:string field is added to exists at exactly the cited line (unshifted; S001's additions were appended after it). | No change. Citation resolves verbatim. |
| c2 | citation | LOW | manual | A synchronous execFileSync('git', ...) idiom exists in the codebase at src/workflow/migrate-docs-tree.ts:317, the sync git-exec pattern the reader mirrors. | read src/workflow/migrate-docs-tree.ts:317 = `return execFileSync('git', args, { cwd: repoPath, encoding: 'utf8' });` — the synchronous execFileSync git idiom the reader mirrors exists as cited. | No change. Citation resolves. |
| c2 | citation | LOW | manual | src/cli/services/maintenance.ts runs `git -C <root> rev-parse HEAD` for the daemon-ctl.sh update's 'current' commit — the exact command the installed-commit reader mirrors. | read src/cli/services/maintenance.ts:101 = `const current = (await capture('git', ['-C', root, 'rev-parse', 'HEAD'])).stdout.trim();` — the exact `git -C <root> rev-parse HEAD` command the reader mirrors exists as cited. | No change. Citation resolves verbatim. |
| c3 | citation | LOW | manual | DAEMON_ROOT resolves as process.env['INSRC_DAEMON_ROOT'] ?? join(homedir(), '.insrc', 'daemon'), defined at src/cli/services/maintenance.ts:34 — the resolution convention S002 mirrors in its own helper. | read src/cli/services/maintenance.ts:34 = `export const DAEMON_ROOT = process.env['INSRC_DAEMON_ROOT'] ?? join(homedir(), '.insrc', 'daemon');` — the resolution convention S002 mirrors exists as cited (also present at update-runner.ts:42 from S001, as expected). | No change. Citation resolves verbatim. |
| c4 | citation | LOW | manual | src/daemon/__tests__/server-registry.test.ts drives handlers via internals(server).handleMessage(reqLine('daemon.status'), sock) — the handler-driving test pattern the new unit tests extend, using node:test. | read src/daemon/__tests__/server-registry.test.ts:65 = `await internals(server).handleMessage(reqLine('daemon.status'), sock);` — the handler-driving test pattern the new unit tests extend exists verbatim; node:test framework. | No change. Citation resolves verbatim. |
| s4/dataModel | semantic | LOW | manual | installedCommit is a NEW field not yet present on DaemonStatus, and readInstalledCommit is a NEW helper not yet present in src/ — both are net-new additions this Story introduces. | grep for `installedCommit` and `readInstalledCommit` returns hits ONLY in the HLD/LLD docs — no src/ definition exists yet, confirming both are genuinely net-new additions this Story introduces. | No change. The field + helper are correctly stated as new. |
| interactionWithShared/sc2 | cross-artifact | LOW | manual | The HLD (b6c90b3e0240d36c) assigns sc2 (DaemonStatus.installedCommit) ownership to Story s2/S002, which this LLD implements; sc1 (daemon.update/updateOutcome, owned by s1) is not touched. | read docs/epics/work-framed-approved-spec-proceed-from-E20260923b6c90b3e/HLD.md:1 resolves the approved HLD that assigns sc2 to s2 and sc1 to s1. The LLD implements sc2 only and states sc1 is not touched — consistent with the HLD boundary. | No change. The cross-artifact ownership trace holds. |
| boundary | semantic | LOW | manual | S001's DaemonUpdateOutcome type (the sc1 surface) already exists in the codebase and is distinct from sc2's installedCommit — confirming the two Phase-A stories occupy separate surfaces (the LLD does not re-own it). | grep `interface DaemonUpdateOutcome` returns 4 hits; the type was shipped to src/shared/types.ts by S001 (main 9bb8c6f) and is distinct from installedCommit — confirming the two Phase-A stories occupy separate surfaces and S002 does not re-own sc1's type. | No change. The sc1/sc2 surface separation holds. |
