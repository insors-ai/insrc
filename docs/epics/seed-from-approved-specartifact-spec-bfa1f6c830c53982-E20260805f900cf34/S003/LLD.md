<!-- insrc:artifact LLD-f900cf34c0342d4f-s3 -->

# LLD: E20260806f900cf34:S003

**Epic:** `seed-from-approved-specartifact-spec-bfa1f6c830c53982`
**HLD base run:** `wf-1785928117126-v61buv`
**HLD effective hash:** `ddca67745f5c...`

## HLD context

**Framework:** A new Debug pane (peer *Pane.tsx in app.tsx's switcher, k6) with pane-local inner sub-tab navigation over three sections — Daemon, MCP, Logs — backed by a new debug service added to makeServices. The chosen shape (a1) keeps the daemon surface minimal: the status card reuses the existing daemon.status IPC, and the ONE genuinely new daemon contract (a read-only debug-status IPC that returns the daemon's own list of currently-attached socket clients, backed by per-connection tracking in the socket server) is built and consumed entirely inside the MCP-section story. Everything else is client-side: the POSIX orphan scan/kill keys on the managed daemon entry and OS signals (k3), and the log viewer fs.watch-tails the two rotated files on disk (k4) — so the Daemon and Logs sections keep working when the daemon is unreachable. The only cross-STORY contract is the pane's section-hosting shape + the debug-service facade that every section plugs into; it is owned by the foundational scaffold story (S001) that every section story already depends on.
**Rollout phase:** Phase B — diagnostic sections
**Consumes:** `sc1` (Debug pane section-hosting shape + DebugService facade)

## Contract details

**Surface level:** internal-shared

### `DebugService`

```typescript
export interface DebugService { readonly sections: readonly DebugSection[]; daemonStatus(): Promise<DaemonCardModel>; scanOrphans(): OrphanScanResult; killOrphans(pids: readonly number[]): Promise<KillOutcome[]> }
```

**Returns:** `interface` — The sc1 facade gains two additive methods for the Daemon-section orphan area: `scanOrphans()` (read) and `killOrphans(pids)` (the single guarded mutating action). Existing `sections` + `daemonStatus` unchanged. Same flat extension model as s2.

**Postconditions:**
- Additive to sc1 — existing members unchanged; s1/s2 fakes stubbing `debug` must add scanOrphans + killOrphans stubs.

### `scanOrphans`

```typescript
scanOrphans(): OrphanScanResult
```

**Returns:** `OrphanScanResult` — On POSIX: runs a one-shot `ps` cmdline scan, matches the RESOLVED absolute DAEMON_ENTRY (.../daemon/index.js), EXCLUDES the managed daemon's own pid (read from PATHS.pidFile), and returns { supported:true; orphans } as recommendations. On non-POSIX (process.platform==='win32') returns { supported:false }. On-entry/explicit-refresh only (not a poll loop). Read-only — a recommendation, never an action (lc1).

**Errors:**
- `n/a (never throws to the view)` when A `ps` failure / parse error resolves to { supported:true; orphans:[] } rather than throwing (the scan degrades to 'no orphans found').

**Preconditions:**
- Matches the resolved absolute DAEMON_ENTRY path (not a loose substring); always excludes the managed pid.

**Postconditions:**
- orphans lists only daemon-entry processes that are NOT the managed daemon; never includes the managed pid.
- Read-only; no process is signalled by scanning (k2).

### `killOrphans`

```typescript
killOrphans(pids: readonly number[]): Promise<KillOutcome[]>
```

**Parameters:**
- `pids: readonly number[]` — The EXPLICITLY-selected orphan pids to terminate. The caller (DaemonSection) passes only the operator's confirmed selection — there is no 'all' overload.

**Returns:** `Promise<KillOutcome[]>` — For each pid: SIGTERM, then after ~3s re-probe liveness (process.kill(pid,0)); if still alive, SIGKILL. Resolves to one KillOutcome per input pid. The service defensively re-excludes the managed pid (never kills the running managed daemon — k5) and no-ops on non-POSIX.

**Errors:**
- `KillOutcome{result:'error'}` when process.kill throws for a pid (e.g. EPERM) — captured as that pid's outcome, never thrown; other selected pids still processed.

**Preconditions:**
- Acts ONLY on the passed pid list (lc1/k2 — never 'all scanned'); the managed pid is re-excluded even if passed.
- Reached only after the DaemonSection's ConfirmPrompt yes (ac2).

**Postconditions:**
- Exactly the selected (non-managed) pids are signalled; graceful SIGTERM first, forced SIGKILL only if still alive after ~3s.
- Returns a per-pid outcome ('terminated' | 'forced' | 'not-found' | 'error').

### `OrphanScanResult`

```typescript
export type OrphanScanResult = { supported: true; orphans: readonly OrphanProcess[] } | { supported: false }
```

**Returns:** `type-alias (new)` — Discriminated on `supported` so ac3 (non-POSIX 'not supported') is a first-class variant the DaemonSection renders without any platform logic of its own. Structured data only.

### `OrphanProcess`

```typescript
export interface OrphanProcess { readonly pid: number; readonly command: string }
```

**Returns:** `interface (new)` — One scanned candidate: its pid + the ps command line (for the operator to review before selecting). No selection/kill state — that is pane-local UI state.

### `KillOutcome`

```typescript
export interface KillOutcome { readonly pid: number; readonly result: 'terminated' | 'forced' | 'not-found' | 'error' }
```

**Returns:** `interface (new)` — Per-pid kill result: 'terminated' (died on SIGTERM), 'forced' (survived to SIGKILL), 'not-found' (already gone), 'error' (signal threw, e.g. EPERM). Lets the UI report exactly what happened to each selected process.

### `DaemonSection`

```typescript
export function DaemonSection(props: { services: { readonly debug: DebugService } }): ReactElement
```

**Parameters:**
- `props: { services: { readonly debug: DebugService } }` — Supplies the `debug` facade whose scanOrphans()/killOrphans() the orphan area drives (plus daemonStatus() from s2).

**Returns:** `ReactElement` — The existing s2 Daemon-section component grows an orphan area BELOW the status card: on POSIX it renders the scanOrphans() recommendations with a pane-local multi-select (Set<number>) + a refresh key; requesting a kill opens a ConfirmPrompt (capture-gated), and only on explicit yes calls killOrphans(selectedPids) and reports the per-pid outcomes. On non-POSIX (scanOrphans -> {supported:false}) it renders a 'not supported on this platform' line (ac3). This is the ONLY mutating control in the whole pane (k2).

**Preconditions:**
- Mounted only while the Debug pane's active section is 'daemon'; the kill is reachable only through the ConfirmPrompt.

**Postconditions:**
- ac1: lists non-managed daemon-entry processes as recommendations (POSIX).
- ac2: kill requires ConfirmPrompt yes and terminates exactly the selected pids (SIGTERM then SIGKILL).
- ac3: non-POSIX shows 'not supported on this platform' instead of a scan/kill control.

## Data model changes

### `DebugService (src/cli/services/debug-types.ts + debug.ts + index.ts)` — field-add

Add scanOrphans(): OrphanScanResult + killOrphans(pids): Promise<KillOutcome[]> to the DebugService interface (debug-types.ts) and their impls in debug.ts — injectable-deps helpers (scanOrphansWith(deps) / killOrphansWith(deps) taking a ps-runner, a kill(pid,signal) fn, a clock/wait fn, a platform flag, and the managed pid) with zero-arg facade wrappers bound onto the existing makeServices() debug entry. The service resolves the absolute DAEMON_ENTRY (reused from daemon.ts, exported for s3) + the managed pid (reused from lifecycle.ts's pidFromFile, exported for s3). Additive; existing members unchanged.

```
interface DebugService { ...; + scanOrphans(): OrphanScanResult; + killOrphans(pids: readonly number[]): Promise<KillOutcome[]> }
```

**Call sites:**
- `src/cli/services/debug.ts`
- `src/cli/services/index.ts`
- `src/cli/services/daemon.ts`
- `src/cli/services/lifecycle.ts`
- `src/cli/panes/DaemonSection.tsx`

### `OrphanScanResult / OrphanProcess / KillOutcome (src/cli/services/debug-types.ts)` — new

New view-model types colocated with the sc1 types: OrphanScanResult (discriminated on supported), OrphanProcess ({pid,command}), KillOutcome ({pid,result}). Structured data only.

```
+ export type OrphanScanResult = { supported:true; orphans: readonly OrphanProcess[] } | { supported:false }
+ export interface OrphanProcess { readonly pid: number; readonly command: string }
+ export interface KillOutcome { readonly pid: number; readonly result: 'terminated'|'forced'|'not-found'|'error' }
```

**Call sites:**
- `src/cli/services/debug-types.ts`
- `src/cli/services/debug.ts`
- `src/cli/panes/DaemonSection.tsx`

### `DaemonSection (src/cli/panes/DaemonSection.tsx)` — field-modify

Grow the s2 Daemon-section component with the orphan area below the status card: a scanOrphans()-driven recommendation list, a pane-local multi-select (Set<number>) + refresh key via useInput, and a ConfirmPrompt-gated killOrphans(selection) with per-pid outcome reporting; a non-POSIX 'not supported' line. No change to the s2 status card, DebugSectionId, or DebugPane hosting.

```
DaemonSection adds an orphan-area block (scan list + multi-select + ConfirmPrompt-gated kill) under the status card
```

**Call sites:**
- `src/cli/panes/DaemonSection.tsx`
- `src/cli/ui/widgets.tsx`

### `DAEMON_ENTRY (src/cli/services/daemon.ts) + pidFromFile (src/cli/services/lifecycle.ts)` — field-modify

Export the currently module-private DAEMON_ENTRY (daemon.ts:24) and pidFromFile (lifecycle.ts:20) so the debug service reuses the SAME resolved daemon-entry path + managed-pid read rather than duplicating a second constant/read. Purely a visibility change (add `export`); no behaviour change.

```
daemon.ts: `const DAEMON_ENTRY` -> `export const DAEMON_ENTRY`; lifecycle.ts: `function pidFromFile` -> `export function pidFromFile`
```

**Call sites:**
- `src/cli/services/daemon.ts`
- `src/cli/services/lifecycle.ts`
- `src/cli/services/debug.ts`

## Interaction with shared contracts

| Contract | Role | How |
| :--- | :--- | :--- |
| `sc1` | consumes | s3 consumes sc1 (HLD boundary: s3 depends=[sc1]) and extends it per sc1's stated model: it augments the DebugService facade with two additive FLAT methods (scanOrphans + killOrphans, recorded via the sharedContract.methodAdd amendment) and grows the s2 DaemonSection component with the orphan area. It does NOT change the section-hosting shape, DebugSectionId, navigation, or add a new section (all owned by s1). Entirely client-side (no daemon IPC); killOrphans is the single mutating action in the pane (k2), gated behind ConfirmPrompt (ac2), acting only on the explicit selection with the managed pid re-excluded (lc1/k5); POSIX-only with a non-POSIX degrade (k3). |

## Error paths

### Error cases

- **The `ps` subprocess fails to run or its output cannot be parsed (ps missing, non-zero exit, unexpected format).** (recoverable)
  - Detection: The ps-runner throws / returns a non-parseable string; scanOrphansWith catches it around the exec + parse.
  - Response: Resolve the scan to { supported:true; orphans:[] } (POSIX but 'no orphans found') rather than throwing to the view. No process is signalled.
  - User impact: The operator sees an empty orphan list instead of a crash; a later refresh retries the scan.
- **process.kill throws for a selected pid during termination (e.g. EPERM insufficient permissions, or the pid vanished between scan and kill).** (recoverable)
  - Detection: The kill(pid, signal) call throws inside killOrphansWith's per-pid try/catch.
  - Response: Record that pid's KillOutcome as 'error' (permission/other) or 'not-found' (ESRCH), continue processing the remaining selected pids, and never re-throw. The per-pid outcomes are returned to the UI.
  - User impact: The operator sees per-pid results — e.g. 'pid 1234: error (permission denied)' — while other selected pids are still handled; nothing crashes.
- **A selected pid is the managed daemon's pid (stale scan, or a caller passes it).** (recoverable)
  - Detection: killOrphansWith compares each pid against the managed pid (pidFromFile) before signalling.
  - Response: The managed pid is re-excluded and NEVER signalled (k5) — it is dropped from the kill set (reported 'not-found'/skipped), even though the scan already excludes it. Defence-in-depth.
  - User impact: The running managed daemon is never terminated by the orphan kill, even under a race; the operator keeps the process they rely on.
- **A selected orphan survives the graceful SIGTERM (ignores/handles it) past the ~3s window.** (recoverable)
  - Detection: After the ~3s wait, killOrphansWith re-probes liveness via process.kill(pid, 0) and finds the process still alive.
  - Response: Escalate to SIGKILL for that pid and record the outcome as 'forced'.
  - User impact: The stubborn orphan is force-terminated; the operator sees 'forced' rather than a silent no-op.

### Edge cases

| Input | Expected |
| :--- | :--- |
| The scan finds no daemon-entry processes other than the managed daemon (the healthy common case). | scanOrphans returns { supported:true; orphans:[] }; the orphan area shows 'no orphan processes found' — no select/kill control is actionable, no confirm can fire. |
| The operator opens the ConfirmPrompt then chooses No (or dismisses it). | killOrphans is NEVER called; no process is signalled; the selection remains for the operator to reconsider (ac2 confirm-gate holds). |
| The operator requests a kill with an empty selection. | The kill action is inert (disabled / no-op) — there is nothing to confirm or terminate; killOrphans is not invoked (lc1: acts only on an explicit non-empty selection). |
| The daemon is not running (no pidfile) while orphan daemon-entry processes exist. | The managed pid is undefined, so NO pid is excluded on that basis; every matching daemon-entry process is a candidate the operator may select and kill — the scan still works with the daemon down (the moment it matters most). |
| A repeat scan (refresh) after the operator already killed some orphans. | The refreshed scan re-derives the list from live `ps` output (never an append-only cache), so killed pids drop off and any newly-appeared ones show up; a missed/duplicate never persists. |

### Invariants to preserve

- The orphan scan matches the RESOLVED absolute DAEMON_ENTRY (the daemon/index.js entry path) and ALWAYS excludes the managed daemon's own pid (from PATHS.pidFile via pidFromFile); it never signals a process merely by scanning. The kill re-excludes the managed pid as defence-in-depth so the running managed daemon is never terminated. [[c2]]
- SIGTERM-then-SIGKILL escalation mirrors the existing daemon-ctl.sh stop sequence: graceful SIGTERM first, re-probe liveness (process.kill(pid,0)) after a wait, and force SIGKILL only if still alive — never a bare SIGKILL and never a blanket signal. [[c2]]
- The kill is the ONLY mutating action in the entire Debug pane (k2) and acts SOLELY on the operator's explicit, confirmed, non-empty selection — never automatically, never a 'kill all', and only after a ConfirmPrompt yes. [[c3]]
- Scan + kill are POSIX-only (ps + OS signals); on non-POSIX (process.platform==='win32') the section shows a 'not supported on this platform' message with no scan/kill control (k3). [[c2]]
- The orphan area is added to the s2 DaemonSection and consumes only the sc1 `debug` facade (new flat scanOrphans/killOrphans methods); it does not alter DebugSectionId, the section registry, DebugPane hosting, or navigation (all owned by s1), and stays entirely client-side (no daemon IPC). [[c1]]

## Test strategy

**Test framework:** `node:test (via `npx tsx --test`) with ink-testing-library for the DaemonSection orphan-area render + stdin select/confirm keypresses, and injectable ps-runner/kill/clock/platform/managed-pid deps for the scanOrphansWith/killOrphansWith service unit tests — matching the s2 debug-service (buildDaemonCard injectable-deps) + DaemonSection harness; NO real ps/process.kill in tests.`

### Test levels

- **unit** — Prove scanOrphansWith(deps) matches the resolved DAEMON_ENTRY, excludes the managed pid, degrades ps failures to an empty list, and returns the not-supported variant off-POSIX — all with injected deps (no real ps).
  - Subjects: `scanOrphansWith: canned ps output with a daemon-entry line + the managed-pid line + an unrelated node line -> { supported:true; orphans } containing ONLY the non-managed daemon-entry pid(s)`, `scanOrphansWith: platform 'win32' -> { supported:false } (no ps invoked)`, `scanOrphansWith: a throwing/garbled ps-runner -> { supported:true; orphans:[] } (never throws)`, `scanOrphansWith: managed pid undefined (daemon down) -> every matching daemon-entry process is a candidate (nothing excluded on that basis)`
  - Fixtures: `An injectable ps-runner returning canned `ps -o pid,command` text`, `An injected platform flag + managed-pid value + resolved DAEMON_ENTRY path`
- **unit** — Prove killOrphansWith(deps) does SIGTERM-then-(after wait)-SIGKILL only for survivors, acts on exactly the passed pids, re-excludes the managed pid, and folds signal errors into per-pid outcomes — with an injected clock/kill (no real processes, no real 3s delay).
  - Subjects: `killOrphansWith([p]) where p dies on SIGTERM -> kill called with (p,'SIGTERM') then liveness-probe clears; outcome 'terminated', NO SIGKILL sent`, `killOrphansWith([p]) where p survives -> (p,'SIGTERM') then after the injected wait (p,0) shows alive -> (p,'SIGKILL'); outcome 'forced'`, `killOrphansWith([managedPid, p]) -> the managed pid is re-excluded/never signalled; only p is processed (k5)`, `killOrphansWith([p]) where kill throws EPERM/ESRCH -> outcome 'error'/'not-found', no re-throw, other pids still processed`, `killOrphansWith([]) -> no kill calls, resolves []; and off-POSIX -> no-op`
  - Fixtures: `An injectable kill(pid,signal) fn recording every (pid,signal) call + a scripted liveness map (alive-after-SIGTERM per pid)`, `An injectable wait/clock fn so the ~3s escalation window is instant in tests`, `An injected managed-pid + platform flag`
- **unit** — Prove the DaemonSection orphan area renders the scan recommendations, enforces the confirm gate, and calls killOrphans only with the explicit selection — against a fake facade (no real ps/kill).
  - Subjects: `DaemonSection orphan area (POSIX): renders scanOrphans() rows (pid + command) as recommendations; empty -> 'no orphan processes found'`, `DaemonSection: selecting pids + requesting kill opens a ConfirmPrompt; choosing No never calls killOrphans; choosing Yes calls killOrphans with EXACTLY the selected pids and shows the per-pid outcomes`, `DaemonSection: a kill request with an empty selection is inert (killOrphans not invoked)`, `DaemonSection (non-POSIX, scanOrphans -> {supported:false}): renders 'not supported on this platform' with no scan/kill control`
  - Fixtures: `A fake `{ debug }` facade whose scanOrphans() returns supported/unsupported fixtures and whose killOrphans() records its pid argument + returns canned KillOutcome[]`, `ink-testing-library render + stdin keypresses for select / kill-request / confirm-yes/no`
- **integration** — Prove the widened DebugService compiles + the whole CLI suite stays green with the new scanOrphans/killOrphans facade methods.
  - Subjects: `makeServices().debug exposes scanOrphans + killOrphans bound to the real impls`, `the in-repo debug fakes (tui/command/DebugPane/DaemonSection tests) carry scanOrphans + killOrphans stubs so the suite compiles`
  - Fixtures: `Real makeServices() call (no real ps invoked at construction time)`

### Acceptance mapping

| Criterion | Proving tests |
| :--- | :--- |
| `ac1` | `unit: scanOrphansWith returns non-managed daemon-entry pids from canned ps output (excludes the managed pid + unrelated processes)`, `unit: DaemonSection orphan area renders the scanOrphans() rows as recommendations (empty -> 'no orphan processes found')` |
| `ac2` | `unit: DaemonSection kill request opens ConfirmPrompt; Yes calls killOrphans with exactly the selected pids, No never calls it`, `unit: killOrphansWith does SIGTERM then SIGKILL-only-for-survivors on exactly the passed pids and returns per-pid outcomes`, `unit: killOrphansWith re-excludes the managed pid and folds signal errors into outcomes (never throws)` |
| `ac3` | `unit: scanOrphansWith on platform 'win32' -> { supported:false } (no ps invoked)`, `unit: DaemonSection with an unsupported scan result renders 'not supported on this platform' and shows no scan/kill control` |

## Migration

**State before:** After s2, the Debug pane's Daemon section (src/cli/panes/DaemonSection.tsx) shows only the status card (reachable/unreachable) from debug.daemonStatus(); there is no orphan-process surface anywhere in the pane. The DebugService facade (src/cli/services/debug-types.ts) carries sections (s1) + daemonStatus (s2). The daemon-entry path DAEMON_ENTRY is module-private in src/cli/services/daemon.ts:24 and the managed-pid read pidFromFile is module-private in src/cli/services/lifecycle.ts:20; there is no client-side ps scan or process-kill surface (the only process management is scripts/daemon-ctl.sh's SIGTERM-then-drain stop). [grounded on the s1 DAEMON_ENTRY/pidFromFile + system-info execSync/signal + ConfirmPrompt analyze bundles]

**State after:** The DebugService facade gains two additive FLAT methods — scanOrphans(): OrphanScanResult and killOrphans(pids): Promise<KillOutcome[]> — impl'd in debug.ts via injectable-deps helpers (scanOrphansWith/killOrphansWith) and bound onto the existing makeServices() debug entry. New OrphanScanResult/OrphanProcess/KillOutcome types are colocated with the sc1 types. DAEMON_ENTRY (daemon.ts) and pidFromFile (lifecycle.ts) are exported so the debug service reuses them. The s2 DaemonSection grows an orphan area below the status card (POSIX scan list + multi-select + ConfirmPrompt-gated kill; non-POSIX 'not supported' line). The in-repo debug fakes gain scanOrphans/killOrphans stubs. No daemon-side change; no change to sc1's hosting shape, DebugSectionId, or navigation.

**Zero downtime:** yes — **Data rewrite:** no

### Steps

1. Add the OrphanScanResult / OrphanProcess / KillOutcome types to the sc1 types module (additive type surface, referenced by nothing yet). — ↩ rollbackable
2. Add `export` to the module-private DAEMON_ENTRY (daemon.ts:24) and pidFromFile (lifecycle.ts:20) — a visibility-only change so the debug service reuses the same resolved entry path + managed-pid read; no behaviour change to existing callers. — ↩ rollbackable
3. Add scanOrphans + killOrphans to the DebugService interface and implement scanOrphansWith(deps) / killOrphansWith(deps) in debug.ts — injectable ps-runner/kill/clock/platform/managed-pid deps; the scan matches the resolved DAEMON_ENTRY excluding the managed pid (win32 -> {supported:false}); the kill does SIGTERM -> wait ~3s -> SIGKILL over exactly the passed pids, re-excluding the managed pid, folding signal errors into per-pid outcomes. Bind zero-arg wrappers onto the makeServices() debug entry. Additive. — ↩ rollbackable
4. Grow the DaemonSection component (s2) with the orphan area: scanOrphans()-driven recommendation list + pane-local multi-select (Set<number>) + refresh key, a ConfirmPrompt-gated killOrphans(selection) with per-pid outcome reporting, and the non-POSIX 'not supported' line. This is the single user-visible new behaviour (the pane's only mutating control). No change to the s2 status card / hosting. — ↩ rollbackable
5. Update the in-repo Services `debug` fakes (tui.test.ts, command.test.ts, DebugPane.test.ts, DaemonSection.test.ts) to add conformant scanOrphans + killOrphans stubs so the suites compile against the widened DebugService. Land WITH step 3 (the interface widening) in one increment (same lockstep as s1/t5, s2/t5). — ↩ rollbackable

**Backward compat:** The DebugService change is additive (two new methods); sections + daemonStatus and every sibling facade are unchanged, so s1/s2 code and all existing panes compile and behave as before. The DAEMON_ENTRY / pidFromFile change is a pure visibility widening (const -> export const; function -> export function) — no existing caller or behaviour changes. In-repo callers constructing a `debug` facade literal (the test fakes) must add scanOrphans + killOrphans stubs to stay interface-conformant; this is an internal (non-published) contract, caught at compile time (same shape as the s1/t5 + s2/t5 additive-fake updates). No daemon IPC, socket, DaemonStatus, or on-disk shape changes — s3 adds only a client-side ps scan + OS-signal kill; the IDE-fork IPC contract is untouched. The kill is a new one-shot OS action gated behind an explicit confirm; it mutates no persistent state.

## Alternatives considered

### a1: Two flat facade methods: scanOrphans() + killOrphans(pids) with the escalation policy in the service — **CHOSEN**

Augment DebugService with scanOrphans(): OrphanScanResult (POSIX ps-match on DAEMON_ENTRY excluding the managed pid, or a not-supported marker off-POSIX) and killOrphans(pids: readonly number[]): Promise<KillResult> (SIGTERM → re-probe after ~3s → SIGKILL, over EXACTLY the given pids); the DaemonSection owns selection + ConfirmPrompt and calls killOrphans on confirm.

Two additive methods on the sc1 DebugService facade (same flat model as s2's daemonStatus): `scanOrphans(): OrphanScanResult` where OrphanScanResult = `{ supported: true; orphans: readonly { pid: number; command: string }[] } | { supported: false }`, and `killOrphans(pids: readonly number[]): Promise<KillOutcome[]>` where each KillOutcome = `{ pid; result: 'terminated' | 'forced' | 'not-found' | 'error' }`. The debug service impl takes injectable deps (a ps-runner, a kill(pid,signal) fn, a platform flag, the managed pid) so the SIGTERM-then-wait-~3s-then-SIGKILL ESCALATION lives entirely in the service and is unit-tested without real processes; scanOrphans returns { supported:false } when platform==='win32'. killOrphans acts only on the passed pid list (never 'all scanned'), and the service defensively re-excludes the managed pid. DaemonSection (s2) grows an orphan area below the status card: a multi-select list (pane-local Set<number>), a refresh key, and a ConfirmPrompt gate that calls killOrphans(selected) only on explicit yes.

### a2: Read method on the facade + a low-level killProcess primitive, escalation in the component

Facade exposes scanOrphans() plus a thin killProcess(pid, signal) primitive; the DaemonSection component orchestrates the SIGTERM → wait ~3s → SIGKILL sequence and the confirm gate in the view.

scanOrphans() is as in a1, but the mutating surface is a minimal `killProcess(pid: number, signal: 'SIGTERM' | 'SIGKILL'): void` primitive on the facade. The DaemonSection then owns the escalation policy: on confirm it sends SIGTERM to each selected pid, starts a ~3s timer, re-checks liveness, and sends SIGKILL to survivors. The service is thinner; the component holds the timed state machine.

**Rejected because:** ac1/ac3/k3/k5 hold, but ac2/k2/lc1/sc1 all drop to partial: putting the security-sensitive SIGTERM→SIGKILL escalation + live timer in the component makes it hard to test and race-prone, and a generic killProcess primitive weakens the type-enforced 'explicit selection only' guarantee a1 gets for free.

### a3: Nested `orphans` sub-facade { scan(); kill(pids) }

Group the two methods under a nested DebugService.orphans sub-object ({ scan(); kill(pids) }) instead of two flat methods.

Same scanOrphans/killOrphans semantics + injectable-deps service impl as a1, but exposed as `DebugService.orphans = { scan(): OrphanScanResult; kill(pids): Promise<KillOutcome[]> }`. The DaemonSection consumes debug.orphans.scan()/kill().

**Rejected because:** Functionally equal to a1 on every ac + k2/k3/k5/lc1 with the same testable service core, but sc1=partial: the nested `orphans` sub-object diverges from s2's flat daemonStatus precedent for no benefit on a two-method surface — pure structure cost.

## Citations

- **[[c1]]** `prior-artifact` `HLD sc1 (Debug pane section-hosting shape + DebugService facade), boundary s3 depends=[sc1]; interfaceSketch comment '... orphan scan/kill ...' + the s2 DaemonSection/DebugPane hosting s3 extends without changing`
- **[[c2]]** `analyze-bundle` `s3 symbol.locate/usage.example — DAEMON_ENTRY (src/cli/services/daemon.ts:24) + pidFromFile/pidAlive managed-pid exclusion (src/cli/services/lifecycle.ts:20-28, process.kill(pid,0)); execSync ps precedent (src/shared/system-info.ts:7); SIGTERM-then-drain-then-force (scripts/daemon-ctl.sh:142-149); POSIX via os.platform()/process.platform!=='win32'`
- **[[c3]]** `analyze-bundle` `s3 symbol.locate — ConfirmPrompt (src/cli/ui/widgets.tsx:56) + the capture/useCaptured modal idiom (DaemonPane run(), src/cli/ui/context.ts) the k2 confirm-gated kill reuses; kill is the pane's ONLY mutating action`

<!-- insrc:review -->

## Review

### ✅ Review `PASS` — design.story (design.story)

**0 HIGH · 0 MED · 10 LOW** · model `client` · reviewed 2026-08-06T07:21:06.784Z

| Ref | Kind | Severity | Fixability | Premise | Evidence | Action |
| --- | --- | --- | --- | --- | --- | --- |
| dm/c2 | citation | LOW | manual | DAEMON_ENTRY is a module-private const defined in src/cli/services/daemon.ts around line 24 (join(__dirname,'../../daemon/index.js')), which s3 exports. | read src/cli/services/daemon.ts:24 = "const DAEMON_ENTRY = join(__dirname, '../../daemon/index.js');" — the module-private const is exactly at the cited line. | none — verified sound |
| dm/c2 | citation | LOW | manual | pidFromFile is a module-private function in src/cli/services/lifecycle.ts around line 20 that reads PATHS.pidFile for the managed pid, which s3 exports. | read src/cli/services/lifecycle.ts:20 = "function pidFromFile(): number \| undefined {" — the module-private managed-pid read is at the cited line. | none — verified sound |
| c2 | citation | LOW | manual | The managed-pid liveness probe pattern is process.kill(pid, 0) in src/cli/services/lifecycle.ts (pidAlive), which the kill re-uses to detect SIGTERM survivors. | grep matched process.kill(pid, 0) in lifecycle.ts (pidAlive at :28) — the liveness-probe primitive the kill re-uses is real. | none — verified sound |
| c2 | citation | LOW | manual | execSync from node:child_process is the existing subprocess precedent (src/shared/system-info.ts) that the orphan `ps` scan mirrors. | read src/shared/system-info.ts:7 = "import { execSync } from 'node:child_process';" — the subprocess precedent is at the cited line. | none — verified sound |
| c3 | citation | LOW | manual | ConfirmPrompt is an existing modal widget exported from src/cli/ui/widgets.tsx (around line 56) that the guarded kill gates behind. | read src/cli/ui/widgets.tsx:56 = "export function ConfirmPrompt(props: { label: string; onYes: () => voi..." — the confirm-gate modal is exported at the cited line. | none — verified sound |
| c2 | citation | LOW | manual | The SIGTERM-then-drain(-then-force) stop sequence exists in scripts/daemon-ctl.sh (around lines 142-149), which the killOrphans escalation mirrors. | read scripts/daemon-ctl.sh:148 = 'log "SIGTERM daemon (pid $pid)"' — the SIGTERM-then-drain stop sequence the escalation mirrors is real. | none — verified sound |
| sc1/c1 | citation | LOW | manual | The DebugService interface + the s2 DaemonSection component the orphan area augments exist from s1/s2 (src/cli/services/debug-types.ts + src/cli/panes/DaemonSection.tsx). | grep matched `interface DebugService` (debug-types.ts) and `export function DaemonSection` in src — the sc1 facade + s2 component s3 augments both exist. | none — verified sound |
| contractDetails | closed-union | LOW | manual | scanOrphans/killOrphans/OrphanScanResult/OrphanProcess/KillOutcome do not exist in src yet; they are this Story's new sc1 additions. | grep for scanOrphans\|killOrphans\|OrphanScanResult\|OrphanProcess\|KillOutcome returned zero src hits — these are genuinely new sc1 additions, as the LLD claims. | none — the new-surface premise holds |
| killOrphans | semantic | LOW | manual | killOrphans acts only on the explicit pid list, re-excludes the managed pid, escalates SIGTERM->SIGKILL for survivors, and never throws (folds errors into per-pid KillOutcome). | No source probe (design intention for the NEW killOrphans method). Internally consistent: the artifact's killOrphans postconditions state explicit-pids-only + managed-pid re-exclusion + SIGTERM->SIGKILL + per-pid KillOutcome (never throws), and its readonly number[] signature type-enforces the explicit-selection guarantee; build + code-review verify the impl. | none — design intention, verified internally consistent; enforced at build/code-review |
| interactionWithShared | cross-artifact | LOW | manual | The HLD assigns sc1 ownership to s1; s3 depends on (consumes) sc1 and adds scanOrphans/killOrphans via an additive sharedContract.methodAdd amendment, not by owning sc1. | Cross-artifact: the approved HLD boundary assigns sc1 to s1; the s3 LLD interactionWithShared declares role=consumes for sc1 and records scanOrphans/killOrphans as an additive sharedContract.methodAdd (not an ownership claim), consistent with the flat s2 daemonStatus precedent (cl7 grep shows the shared DebugService base). | none — cross-artifact trace consistent |
