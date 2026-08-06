<!-- insrc:artifact PLAN-f900cf34c0342d4f-s3 -->

# Plan: E20260806f900cf34:S003

**Epic:** `seed-from-approved-specartifact-spec-bfa1f6c830c53982`
**LLD run:** `wf-1786000128848-p3vzsl`
**LLD effective hash:** `ddca67745f5c...`

## Tasks

| # | Task | Size | Depends on | Tests | Derived from |
| :--- | :--- | :--- | :--- | :--- | :--- |
| 1 | **`t1`** Add the OrphanScanResult / OrphanProcess / KillOutcome types | S | — | integration: debug-types.test.ts: OrphanScanResult/OrphanProcess/KillOutcome are exercised by a type-level round-trip (supported + unsupported variants, four KillOutcome results) and the suite compiles | [[c1]] |
| 2 | **`t2`** Export DAEMON_ENTRY + pidFromFile for reuse | S | — | integration: debug.ts imports DAEMON_ENTRY + pidFromFile — verified transitively by the scanOrphansWith/killOrphansWith unit suite compiling and the existing daemon/lifecycle suites staying green | [[c2]] |
| 3 | **`t3`** Implement scanOrphansWith/killOrphansWith + the scanOrphans/killOrphans facade methods | L | `t1`, `t2` | unit: scanOrphansWith: canned ps output (daemon-entry + managed-pid + unrelated node) -> {supported:true} with ONLY the non-managed daemon-entry pid(s); unit: scanOrphansWith: platform 'win32' -> {supported:false} with no ps invoked; unit: scanOrphansWith: throwing/garbled ps-runner -> {supported:true; orphans:[]} (never throws); unit: scanOrphansWith: managed pid undefined -> every matching daemon-entry process is a candidate; unit: killOrphansWith([p]) p dies on SIGTERM -> (p,'SIGTERM') then liveness clears; 'terminated', no SIGKILL; unit: killOrphansWith([p]) p survives -> (p,'SIGTERM') then after injected wait (p,'SIGKILL'); 'forced'; unit: killOrphansWith([managedPid,p]) -> managed pid never signalled; only p processed; unit: killOrphansWith([p]) kill throws EPERM/ESRCH -> 'error'/'not-found', no re-throw, other pids still processed; unit: killOrphansWith([]) -> no kill calls, resolves []; off-POSIX -> no-op; integration: makeServices().debug exposes scanOrphans + killOrphans bound to the real impls | [[c1]] [[c2]] [[c3]] |
| 4 | **`t4`** Grow the DaemonSection with the orphan area (multi-select + ConfirmPrompt-gated kill) | L | `t1`, `t3` | unit: DaemonSection orphan area (POSIX): renders scanOrphans() rows (pid + command); empty -> 'no orphan processes found'; unit: DaemonSection: select pids + kill-request opens ConfirmPrompt; No never calls killOrphans; Yes calls killOrphans with EXACTLY the selected pids + shows per-pid outcomes; unit: DaemonSection: kill-request with an empty selection is inert (killOrphans not invoked); unit: DaemonSection (non-POSIX, {supported:false}): renders 'not supported on this platform' with no scan/kill control | [[c1]] [[c4]] |
| 5 | **`t5`** Update the in-repo debug-facade test fakes for scanOrphans/killOrphans | S | `t3` | integration: the in-repo debug fakes (tui/command/DebugPane/DaemonSection tests) carry scanOrphans + killOrphans stubs so the CLI suite compiles | [[c5]] |

### E20260806f900cf34:S003:T001 — Add the OrphanScanResult / OrphanProcess / KillOutcome types

Add the three view-model types to src/cli/services/debug-types.ts (colocated with the sc1 types): OrphanScanResult = { supported:true; orphans: readonly OrphanProcess[] } | { supported:false }; OrphanProcess { readonly pid:number; readonly command:string }; KillOutcome { readonly pid:number; readonly result:'terminated'|'forced'|'not-found'|'error' }. Additive type surface, referenced by nothing yet.

**Acceptance checks:**
- OrphanScanResult is discriminated on `supported`; the unsupported variant is exactly { supported:false }
- OrphanProcess is {pid,command}; KillOutcome is {pid,result} with the four-member result union
- tsc compiles the new types

### E20260806f900cf34:S003:T002 — Export DAEMON_ENTRY + pidFromFile for reuse

Add `export` to the module-private DAEMON_ENTRY const (src/cli/services/daemon.ts:24) and pidFromFile function (src/cli/services/lifecycle.ts:20) so the debug service reuses the same resolved daemon-entry path + managed-pid read. Visibility-only; no behaviour change to existing callers.

**Acceptance checks:**
- DAEMON_ENTRY is exported from daemon.ts (value unchanged)
- pidFromFile is exported from lifecycle.ts (behaviour unchanged)
- tsc compiles; existing daemon.ts/lifecycle.ts callers are unaffected

### E20260806f900cf34:S003:T003 — Implement scanOrphansWith/killOrphansWith + the scanOrphans/killOrphans facade methods

In src/cli/services/debug.ts add injectable-deps helpers: scanOrphansWith(deps) (deps: ps-runner, platform, managedPid, daemonEntry) runs the ps scan, matches the resolved DAEMON_ENTRY, excludes the managed pid, returns {supported:false} on win32, and folds any ps failure into {supported:true; orphans:[]}; killOrphansWith(deps) (deps: kill(pid,signal), isAlive/liveness probe, wait/clock, platform, managedPid) does SIGTERM -> wait ~3s -> SIGKILL-only-for-survivors over exactly the passed pids, re-excludes the managed pid, folds signal errors into per-pid KillOutcome, no-ops off-POSIX, never throws. Add zero-arg wrappers scanOrphans()/killOrphans(pids) over realDeps (DAEMON_ENTRY, pidFromFile, execFileSync ps, process.kill, process.platform), add the two methods to the DebugService interface, and bind them onto the makeServices() debug entry. Build note: land WITH t5 (the fakes) in one increment.

**Acceptance checks:**
- DebugService interface gains scanOrphans(): OrphanScanResult + killOrphans(pids: readonly number[]): Promise<KillOutcome[]>; existing members unchanged
- scanOrphansWith returns non-managed daemon-entry pids from canned ps output; {supported:false} on win32; {supported:true;orphans:[]} on ps failure
- killOrphansWith sends SIGTERM then SIGKILL only to survivors (injected clock), acts only on the passed pids, re-excludes the managed pid, folds errors into per-pid KillOutcome, never throws
- makeServices().debug.scanOrphans + .killOrphans are bound to the real impls; tsc compiles
- no real ps/process.kill runs in the unit tests (deps injected)

### E20260806f900cf34:S003:T004 — Grow the DaemonSection with the orphan area (multi-select + ConfirmPrompt-gated kill)

In src/cli/panes/DaemonSection.tsx add an orphan area below the s2 status card: read scanOrphans() (on mount/refresh), render the recommendation rows (pid + command) with a pane-local multi-select (Set<number>) + a refresh key via a new useInput (gated on !useCaptured() AND not while confirming, so the ConfirmPrompt's own useInput owns keys during confirm); a kill-request opens ConfirmPrompt (only when the selection is non-empty), and only on explicit Yes calls killOrphans(selectedPids) and renders the per-pid outcomes. Non-POSIX (scanOrphans -> {supported:false}) renders a 'not supported on this platform' line with no scan/kill control. Empty scan -> 'no orphan processes found'. Read-only except this one guarded kill.

**Acceptance checks:**
- POSIX: renders scanOrphans() rows as recommendations; empty -> 'no orphan processes found'
- selecting pids + kill-request opens ConfirmPrompt; No never calls killOrphans; Yes calls killOrphans with EXACTLY the selected pids and shows the per-pid outcomes
- a kill-request with an empty selection is inert (killOrphans not invoked)
- non-POSIX ({supported:false}) shows 'not supported on this platform' with no scan/kill control
- the section's useInput is suspended while the ConfirmPrompt is open (no double key handling); the s2 status card is unchanged; tsc compiles

### E20260806f900cf34:S003:T005 — Update the in-repo debug-facade test fakes for scanOrphans/killOrphans

Add conformant scanOrphans + killOrphans stubs to every in-repo `debug` facade fake so the widened DebugService compiles: fakeServices() in src/cli/__tests__/tui.test.ts, ctxWith base in src/cli/__tests__/command.test.ts, and the props built in src/cli/panes/__tests__/DebugPane.test.ts + DaemonSection.test.ts (default scanOrphans -> {supported:false}, killOrphans -> []). Build note: apply together-with t3 in ONE increment (mirrors s1/t5 + s2/t5 lockstep); dependsOn stays [t3] (the true compile dependency).

**Acceptance checks:**
- every in-repo debug-facade fake includes scanOrphans + killOrphans stubs returning valid OrphanScanResult / KillOutcome[]
- `npx tsx --test 'src/cli/**/*.test.ts'` compiles against the widened DebugService
- no existing assertion behaviour changes beyond the additive stubs

## Test-strategy coverage

| LLD strategy item | Covered by |
| :--- | :--- |
| scanOrphansWith: canned ps output with a daemon-entry line + the managed-pid line + an unrelated node line -> { supported:true; orphans } containing ONLY the non-managed daemon-entry pid(s) | `t3` |
| scanOrphansWith: platform 'win32' -> { supported:false } (no ps invoked) | `t3` |
| scanOrphansWith: a throwing/garbled ps-runner -> { supported:true; orphans:[] } (never throws) | `t3` |
| scanOrphansWith: managed pid undefined (daemon down) -> every matching daemon-entry process is a candidate (nothing excluded on that basis) | `t3` |
| killOrphansWith([p]) where p dies on SIGTERM -> kill called with (p,'SIGTERM') then liveness-probe clears; outcome 'terminated', NO SIGKILL sent | `t3` |
| killOrphansWith([p]) where p survives -> (p,'SIGTERM') then after the injected wait (p,0) shows alive -> (p,'SIGKILL'); outcome 'forced' | `t3` |
| killOrphansWith([managedPid, p]) -> the managed pid is re-excluded/never signalled; only p is processed (k5) | `t3` |
| killOrphansWith([p]) where kill throws EPERM/ESRCH -> outcome 'error'/'not-found', no re-throw, other pids still processed | `t3` |
| killOrphansWith([]) -> no kill calls, resolves []; and off-POSIX -> no-op | `t3` |
| DaemonSection orphan area (POSIX): renders scanOrphans() rows (pid + command) as recommendations; empty -> 'no orphan processes found' | `t4` |
| DaemonSection: selecting pids + requesting kill opens a ConfirmPrompt; choosing No never calls killOrphans; choosing Yes calls killOrphans with EXACTLY the selected pids and shows the per-pid outcomes | `t4` |
| DaemonSection: a kill request with an empty selection is inert (killOrphans not invoked) | `t4` |
| DaemonSection (non-POSIX, scanOrphans -> {supported:false}): renders 'not supported on this platform' with no scan/kill control | `t4` |
| makeServices().debug exposes scanOrphans + killOrphans bound to the real impls | `t3` |
| the in-repo debug fakes (tui/command/DebugPane/DaemonSection tests) carry scanOrphans + killOrphans stubs so the suite compiles | `t5` |

## Citations

- **[[c1]]** `prior-artifact` `LLD s3 handoff: OrphanScanResult/OrphanProcess/KillOutcome view-model types + the scan recommendation model (lc1: scan is recommendation-only)`
- **[[c2]]** `prior-artifact` `LLD s3 handoff: reuse the resolved DAEMON_ENTRY (daemon.ts:24) + managed-pid read pidFromFile (lifecycle.ts:20) via export to identify + exclude the daemon's own process (k1/k5)`
- **[[c3]]** `prior-artifact` `LLD s3 handoff: killOrphansWith SIGTERM->wait->SIGKILL-only-for-survivors escalation over exactly the selected pids, injectable ps/kill/clock/platform/managed-pid deps, POSIX-only degrade, never throws (k2/k3/lc1)`
- **[[c4]]** `prior-artifact` `LLD s3 handoff: DaemonSection orphan area — multi-select + ConfirmPrompt-gated kill acting solely on explicit selection + confirm, useInput suspended while confirming, non-POSIX 'not supported' degrade (k2/k3/lc1; ConfirmPrompt widgets.tsx:56)`
- **[[c5]]** `prior-artifact` `LLD s3 handoff: the widened DebugService facade requires the in-repo debug fakes (tui/command/DebugPane/DaemonSection tests) to carry conformant scanOrphans/killOrphans stubs (t3+t5 lockstep, mirrors sc1 flat-facade extension)`

<!-- insrc:review -->

## Review

### ✅ Review `PASS` — plan (plan)

**0 HIGH · 0 MED · 9 LOW** · model `client` · reviewed 2026-08-06T07:45:36.648Z

| Ref | Kind | Severity | Fixability | Premise | Evidence | Action |
| --- | --- | --- | --- | --- | --- | --- |
| t2 | citation | LOW | auto | DAEMON_ENTRY is a module-private const in src/cli/services/daemon.ts (around line 24) that t2 exports. | src/cli/services/daemon.ts:24 reads `const DAEMON_ENTRY = join(__dirname, '../../daemon/index.js');` — module-private const exactly as cited; t2's export is well-founded. | None — citation confirmed verbatim. |
| t2 | citation | LOW | auto | pidFromFile is a module-private function in src/cli/services/lifecycle.ts (around line 20) that t2 exports. | src/cli/services/lifecycle.ts:20 reads `function pidFromFile(): number \| undefined {` — module-private fn exactly as cited; t2's export is well-founded. | None — citation confirmed verbatim. |
| t1 | citation | LOW | auto | src/cli/services/debug-types.ts exists and hosts the sc1 DebugService types where t1 colocates the new orphan types. | grep finds DebugService/DaemonCardModel in src/cli/services/debug-types.ts (the sc1 types host); colocation target exists. | None — target file confirmed. |
| t3 | citation | LOW | auto | src/cli/services/debug.ts exists and hosts the debug service impl (buildDaemonCard/daemonStatus) that t3 extends with scanOrphansWith/killOrphansWith. | grep finds buildDaemonCard/realDeps in src/cli/services/debug.ts; the injectable-deps service module t3 extends exists. | None — target file confirmed. |
| t4 | citation | LOW | auto | src/cli/panes/DaemonSection.tsx exists (the s2 status-card component) and is read-only today, which t4 grows with the orphan area. | grep finds DaemonSection in src/cli/panes/DaemonSection.tsx (the s2 component); t4's growth target exists. | None — target file confirmed. |
| t4 | citation | LOW | auto | ConfirmPrompt is an exported widget with its own useInput (y/n/esc) that t4 uses to gate the kill. | src/cli/ui/widgets.tsx:56 reads `export function ConfirmPrompt(props: { label: string; onYes: () => void; onNo: () => void }): ReactElement {` — the confirm widget t4 gates the kill with exists exactly as cited. | None — citation confirmed verbatim. |
| t5 | inventory | LOW | auto | The in-repo debug facade fakes needing scanOrphans/killOrphans stubs live in exactly these four test files: tui.test.ts, command.test.ts, DebugPane.test.ts, DaemonSection.test.ts. | grep for daemonStatus/debug: matches across the four named test files (tui/command/DebugPane/DaemonSection); the inventory of in-repo debug fakes to update is accurate. | None — fake inventory confirmed. |
| t3 | semantic | LOW | auto | A ps-based process listing precedent using execSync/execFileSync exists in the CLI/shared layer, supporting the injectable ps-runner over `ps -o pid,command`. | grep confirms child_process/execSync precedent in the shared layer (src/shared/system-info.ts); the injectable ps-runner over `ps -o pid,command` has an existing pattern to follow. | None — ps precedent confirmed. |
| t3 | ordering | LOW | auto | t3 depends on t1 (the orphan types) and t2 (the exported DAEMON_ENTRY + pidFromFile); t4 depends on t1+t3; t5 depends on t3 — an acyclic order matching the build sequence. | dependsOn graph t1,t2 (roots) -> t3 -> {t4,t5} is acyclic with order 1..5 a valid topological sort; matches the checklist.verify audit. | None — ordering is consistent and acyclic. |
