<!-- insrc:artifact LLD-57298940cdc341bc-s4 -->

# LLD: E2026092157298940:S004

**Epic:** `expand-jetbrains-plugin-s-insrc-settings`
**HLD base run:** `wf-1789970136758-lvyg6v`
**HLD effective hash:** `7b17d6a14b2a...`

## HLD context

**Framework:** Chosen shape a1: three new child Settings pages (Daemon, Workflows, Debug) are registered declaratively as <applicationConfigurable parentId="ai.insors.insrc.settings"> nodes under the UNCHANGED parent insrc Configurable, each a thin Swing page built on a shared abstract page-shell base (the off-EDT-load + InsrcCollapsible/JBScrollPane idiom the settings page already established). Every page is a read/act surface over a plugin-side seam placed at its natural home — the DaemonGateway grows in-place sealed *Result IPC methods, a lifecycle-command runner reuses the existing ScriptDaemonProvisioner/script-locator to run daemon-ctl.sh subcommands, an OS-process seam (Java ProcessHandle) does the single guarded orphan-kill, a read-only chain reader projects .insrc/artifacts, and a first-of-its-kind log-editor seam (LightVirtualFile + FileEditorManager) hosts the tail. Nothing touches the shipped parent settings page or the daemon; everything is additive, plugin-only, and off-EDT.
**Rollout phase:** Phase B — Operational pages (Daemon, Workflows, Debug status+orphans)
**Owns:** `sc3` (DebugPageHost)
**Consumes:** `sc1` (NestedSettingsNavScaffold + SharedPageShell), `sc2` (DaemonStatusRead)

**Adjacent scope (owned by other stories — do NOT implement here):**
- `s1`: PRIVATE to S001: the concrete registration wiring of the three child Configurable classes in plugin.xml, the abstract page-shell base implementation (its createComponent off-EDT/guarded-render mechanics), and the parse of the daemon.status payload into DaemonStatusDto. S001 delivers the empty-but-navigable pages + the shared status read; it does not implement any page's domain body — those are the consuming Stories'. — owns `sc1`, `sc2`
- `s2`: PRIVATE to S002: the Daemon page body (health readout rendered from sc2 + the six action controls), and the lifecycle-action backing used only here — the new DaemonGateway IPC methods for backup/compact/shutdown (sealed *Result) and a lifecycle-command runner that executes daemon-ctl.sh subcommands (start/stop/restart/update) via the existing ScriptDaemonProvisioner + DefaultDaemonScriptLocator, off the EDT with streamed progress and a backup-dir prompt. No other Story consumes these, so they stay S002-internal.
- `s3`: PRIVATE to S003: the plugin-side read-only chain reader that scans the open project's .insrc/artifacts (DEF-/HLD-/LLD-/PLAN-*.json) and projects a ChainReport-shaped model (define/HLD marks, per-story design/approved/stale, next action, amendment counts), plus the Workflows page that renders it read-only (no approve/reject/amend — k6) with an empty state. Entirely local file reads; no daemon IPC and no shared surface.
- `s5`: PRIVATE to S005: the MCP diagnostic section it contributes to the Debug page host — a read-only view combining the plugin's existing host-detection (which MCP clients are registered/connected) with a new DaemonGateway debug-status read (daemon.debug-status → the sessions attached to the socket, with identity + connection time), degrading to a clear unavailable line when the daemon is unreachable. No mutating control (k3).
- `s6`: PRIVATE to S006: the log-editor seam — the plugin's first LightVirtualFile + FileEditorManager surface — that opens a chosen daemon/agent log (from the known LOG_DIR) as a read-only editor tab and streams appended lines off the EDT into it, with a level/module/text filter applied to the view. The 'open log' affordance attaches to the Debug page host (sc3). Nothing deletes/rotates/clears the underlying log (k5, read-only).

## Contract details

**Surface level:** internal

### `OrphanProcessSeam.scan`

```typescript
class OrphanProcessSeam(processes: () -> List<ProcessSnapshot> = ::liveProcessSnapshots, managedPid: () -> Long? = ::pidFromDaemonPidFile, daemonEntry: String = defaultDaemonEntry(), platformSupported: () -> Boolean = ::isPosix) { fun scan(): OrphanScanResult }
```

**Returns:** `OrphanScanResult` — OrphanScanResult.Unsupported when the platform can't observe process command lines (win32, or every snapshot lacks a commandLine); otherwise OrphanScanResult.Scanned(orphans) — the ProcessSnapshots whose command contains daemonEntry, EXCLUDING managedPid. Read-only recommendation, never a signal; mirrors debug.ts scanOrphansWith.

**Errors:**
- `(none — never throws)` when A processes() enumeration failure or an unreadable pidfile is swallowed and degrades to Scanned(emptyList) (a ps-failure parity with debug.ts); it never propagates to the EDT render.

**Preconditions:**
- Called off the EDT (from DebugConfigurable.buildBody() on a pooled thread) — enumerating processes is blocking.

**Postconditions:**
- Performs no signal/mutation — scan is strictly read-only (k3).
- Never includes managedPid in the returned orphans, even if its command matches (the managed daemon is not an orphan).

### `OrphanProcessSeam.kill`

```typescript
fun kill(pids: List<Long>): List<KillOutcome>
```

**Parameters:**
- `pids: List<Long>` — The EXACT operator-selected pids to terminate — the seam acts only on these (no 'all' overload); an empty list is a no-op returning an empty result.

**Returns:** `List<KillOutcome>` — One KillOutcome per input pid IN INPUT ORDER: TERMINATED (died on SIGTERM within the grace window), FORCED (survived SIGTERM, killed via destroyForcibly/SIGKILL), NOT_FOUND (already gone / ESRCH-equivalent), SKIPPED (was managedPid, never signalled — k5), or ERROR. Mirrors debug.ts killOrphansWith.

**Errors:**
- `(none — never throws)` when A per-pid destroy() failure folds into that pid's KillOutcome (NOT_FOUND when the handle is already absent, else ERROR); the call never throws and returns [] off an unsupported platform.

**Preconditions:**
- Invoked only after an explicit operator confirm (DebugConfigurable gates on Messages.showYesNoDialog) and run off the EDT under ProgressManager (k2/k3).
- pids are a subset of a prior scan()'s orphans (the UI passes the current selection).

**Postconditions:**
- managedPid is re-excluded as defence-in-depth even if passed (reported SKIPPED, never signalled — k5).
- Escalation is SIGTERM(destroy) → wait grace → SIGKILL(destroyForcibly) only for survivors, matching daemon-ctl.sh's stop drain.

### `DebugStatusCardReader.read`

```typescript
class DebugStatusCardReader(status: () -> DaemonStatusResult, socketPath: () -> String = { DaemonSocket.defaultPath().toString() }, pid: () -> Long? = ::pidFromDaemonPidFile, version: () -> String? = ::daemonPackageVersion) { fun read(): DebugStatusCardModel }
```

**Returns:** `DebugStatusCardModel` — The read-only status card: running/stopped + uptime + repoCount from the sc2 daemonStatus() result, folded with the locally-derived socket (always known), pid (pidfile, best-effort null), and version (<DAEMON_ROOT>/package.json, best-effort null). Mirrors the CLI buildDaemonCard local-derive.

**Errors:**
- `(none — never throws)` when daemonStatus() already never throws (sc2 contract); a missing pidfile / package.json degrades the derived field to null rather than failing the card.

**Preconditions:**
- Called off the EDT (buildBody pooled thread).

**Postconditions:**
- Strictly read-only — no daemon mutation, no process signal (k3).
- socket is always populated from the known constant; pid/version are best-effort and may be null.

### `DebugConfigurable.buildBody`

```typescript
override fun buildBody(): javax.swing.JComponent
```

**Returns:** `javax.swing.JComponent` — The Debug page: an ordered stack of collapsible sections from the sc3 DebugPageHost — S004 seeds a read-only Status section (DebugStatusCardModel) and an Orphans section (the scan result + a multi-select list + a confirm-gated Kill button). Built off the EDT under the sc1 base.

**Errors:**
- `(none propagated)` when Any failure inside buildBody() is rendered as the base InsrcOpsConfigurable JLabel error card, not thrown (the sc1 base guards the render).

**Preconditions:**
- Invoked by the sc1 base InsrcOpsConfigurable.createComponent() on a pooled thread (off the EDT).

**Postconditions:**
- The only mutating affordance is the orphan Kill, gated on Messages.showYesNoDialog and acting solely on the explicit list selection (k3); everything else is read-only.
- Touches neither the daemon-mutating IPCs nor the parent settings page (k1/k4).

### `DebugPageHost.sections`

```typescript
interface DebugSection { fun title(): String; fun component(): javax.swing.JComponent }
interface DebugPageHost { fun sections(): List<DebugSection> }
```

**Returns:** `List<DebugSection>` — The ordered read-only sections the Debug page renders (each a title + an off-EDT-built JComponent). S004's DebugConfigurable implements DebugPageHost and returns [StatusSection, OrphansSection]; S005/S006 extend the list with their own sections without re-owning the page.

**Preconditions:**
- sections() is assembled off the EDT (each section's component() may read the socket/processes).

**Postconditions:**
- The contract is section-additive: a consuming Story contributes a DebugSection; it does not modify S004's status/orphan sections.

## Data model changes

### `ProcessSnapshot` — new

{ pid: Long, commandLine: String? } — the platform-neutral projection of one java.lang.ProcessHandle the seam matches against: pid from handle.pid(), commandLine from handle.info().commandLine().orElse(null). A null commandLine is the unobservable-platform signal the scan uses to degrade to Unsupported. Mirrors the CLI's `pid command`-per-line ps row.

**Call sites:**
- `jetbrains-plugin/src/main/kotlin/ai/insors/insrc/jetbrains/debug/OrphanProcessSeam.kt`
- `src/cli/services/debug.ts (OrphanScanDeps.runPs row)`

### `OrphanProcess` — new

{ pid: Long, command: String } — a stray daemon-entry process the scan recommends (its command contains daemonEntry and it is not the managed pid). Rendered read-only in the Orphans section list; its pid is what a Kill selection passes. Mirrors debug.ts OrphanProcess.

**Call sites:**
- `jetbrains-plugin/src/main/kotlin/ai/insors/insrc/jetbrains/debug/OrphanProcessSeam.kt`
- `jetbrains-plugin/src/main/kotlin/ai/insors/insrc/jetbrains/ops/DebugConfigurable.kt`

### `OrphanScanResult` — new

sealed: `Unsupported` (platform can't observe command lines — the Orphans section says so instead of listing, ac2) | `Scanned(orphans: List<OrphanProcess>)` (possibly empty). Mirrors debug.ts {supported:false} | {supported:true,orphans}.

**Call sites:**
- `jetbrains-plugin/src/main/kotlin/ai/insors/insrc/jetbrains/debug/OrphanProcessSeam.kt`
- `jetbrains-plugin/src/main/kotlin/ai/insors/insrc/jetbrains/ops/DebugConfigurable.kt`

### `KillOutcome` — new

{ pid: Long, result: KillResult } where `enum KillResult { TERMINATED, FORCED, NOT_FOUND, SKIPPED, ERROR }`. One per input pid, in input order; SKIPPED = the managed pid was re-excluded (k5). Mirrors debug.ts KillOutcome {pid, result:'terminated'|'forced'|'not-found'|'error'} plus the explicit SKIPPED for the managed-pid case.

**Call sites:**
- `jetbrains-plugin/src/main/kotlin/ai/insors/insrc/jetbrains/debug/OrphanProcessSeam.kt`
- `jetbrains-plugin/src/main/kotlin/ai/insors/insrc/jetbrains/ops/DebugConfigurable.kt`

### `DebugStatusCardModel` — new

The read-only Status-section view model: reachable:Boolean + (when reachable) running/uptimeSec/repoCount from the sc2 daemonStatus(), folded with socket:String (always), pid:Long? and version:String? (best-effort local-derive). A stopped/unavailable daemon yields a not-reachable card carrying the reason. Mirrors the CLI DaemonCardModel.

**Call sites:**
- `jetbrains-plugin/src/main/kotlin/ai/insors/insrc/jetbrains/debug/DebugStatusCardReader.kt`
- `jetbrains-plugin/src/main/kotlin/ai/insors/insrc/jetbrains/ops/DebugConfigurable.kt`

## Interaction with shared contracts

| Contract | Role | How |
| :--- | :--- | :--- |
| `sc3` | implements | S004 OWNS sc3: it introduces the DebugSection{title();component()} + DebugPageHost{sections():List<DebugSection>} interfaces exactly as the HLD sketch types them, and DebugConfigurable implements DebugPageHost, seeding sections() = [StatusSection, OrphansSection] (both read-only except the orphan Kill). S005 (MCP/sessions) and S006 (log-open) later contribute their own DebugSection to the list without re-owning the Debug page — the section-additive contract. |
| `sc1` | consumes | DebugConfigurable extends the S001 abstract InsrcOpsConfigurable base and fills ONLY pageTitle()/buildBody(); the base owns createComponent()'s off-EDT load + disposed-guarded invokeLater render + JBScrollPane/ScrollableColumn shell (k2). buildBody() renders the sc3 sections via ui/InsrcCollapsible.collapsiblePanel. The parent settings page + its plugin.xml <applicationConfigurable> element stay byte-unchanged (k4); the S001 placeholder JLabel body is replaced. |
| `sc2` | consumes | DebugStatusCardReader consumes the shipped daemonStatus(): DaemonStatusResult (Loaded/Stopped/Unavailable) unchanged — taking running/uptimeSec/repoCount from Loaded.status — and folds in the locally-derived socket/pid/version the DTO does not carry. No new gateway method and no change to the sc2 surface; the local-derive is plugin-side, not a contract extension. |

## Error paths

### Error cases

- **The platform cannot observe process command lines (Windows, or an OS/permission state where ProcessHandle.info().commandLine() is empty for the daemon-entry processes).** (recoverable)
  - Detection: OrphanProcessSeam.scan() checks platformSupported() and whether the enumerated ProcessSnapshots carry an observable commandLine; when command lines are unavailable it returns OrphanScanResult.Unsupported.
  - Response: The Orphans section renders an 'orphan detection is not supported on this platform' line and NO kill control instead of an empty/ambiguous list (ac2); the Status card still renders normally.
  - User impact: The developer sees a clear 'unsupported here' message rather than a silently-empty orphan list or an error — they are not misled into thinking there are no orphans.
- **Process enumeration itself fails (ProcessHandle.allProcesses() throws, or a SecurityException/transient OS error while reading process info).** (recoverable)
  - Detection: The processes() provider call inside scan() is wrapped; a thrown enumeration folds to an empty snapshot list on a supported platform.
  - Response: scan() returns OrphanScanResult.Scanned(emptyList) — the ps-failure parity with debug.ts (supported:true, orphans:[]); the section shows 'no orphan processes found' and no kill target. Never rethrows to the EDT.
  - User impact: The page loads with an empty orphan list rather than a stack trace; a genuine orphan may be momentarily missed but a re-open re-scans.
- **A selected orphan has already exited by the time Kill runs (raced with a manual kill or natural exit), or the OS refuses the signal.** (recoverable)
  - Detection: OrphanProcessSeam.kill() catches the per-pid destroy()/destroyForcibly() outcome and re-probes liveness (ProcessHandle.of(pid).isPresent/isAlive) after the grace window; an absent handle is the already-gone signal.
  - Response: That pid's KillOutcome is NOT_FOUND (already gone) or ERROR (signal refused), folded per-pid; other selected pids still proceed; the call never throws. Outcomes are reported per pid in input order.
  - User impact: The developer sees a precise per-process outcome ('already gone' vs 'could not terminate') rather than the whole kill aborting on one stale pid.
- **The managed daemon's own pid is somehow in the kill selection (stale UI selection, or the pidfile changed between scan and kill).** (recoverable)
  - Detection: kill() re-reads managedPid() and compares each input pid against it BEFORE signalling (defence-in-depth beyond scan()'s exclusion).
  - Response: The managed pid is reported SKIPPED and never receives any signal (k5); the remaining selected pids proceed normally.
  - User impact: The developer can never accidentally kill the live daemon from this surface, even with a stale selection — the live daemon is protected.
- **The daemon is unreachable / stopped when the Status card loads (socket down after a bad shutdown — exactly the situation the page exists for).** (recoverable)
  - Detection: DebugStatusCardReader.read() receives DaemonStatusResult.Stopped or Unavailable(reason) from the sc2 daemonStatus() (which never throws).
  - Response: The card renders a not-reachable state (stopped, or unavailable with the reason) while STILL showing the locally-known socket path and best-effort pid/version; the Orphans section remains fully functional (it does not need the daemon).
  - User impact: The developer still gets actionable info (socket path, last-known pid) and can proceed to clear orphans precisely when the daemon is down — the core value of the page.

### Edge cases

| Input | Expected |
| :--- | :--- |
| The Kill button is pressed with NOTHING selected in the orphan list. | kill(emptyList) is a no-op returning an empty outcome list; no confirm dialog is even shown (or if shown, confirming does nothing) — ac2's 'with nothing selected the kill does nothing'. |
| The developer cancels the Messages.showYesNoDialog confirm. | No pid is signalled; kill() is never called; the orphan list is unchanged (k3 — the mutation requires an explicit confirm). |
| scan() finds daemon-entry processes but the ONLY match is the managed daemon itself. | OrphanScanResult.Scanned(emptyList) — the managed pid is excluded, so the recommendation list is empty ('no orphan processes'), never listing the live daemon as an orphan. |
| The pidfile is absent (daemon never started) or non-numeric, so managedPid() is null. | scan() excludes nothing extra (no managed pid to exclude) and lists every daemon-entry match; kill() skips nothing on the managed-pid ground. The Status card's pid field degrades to null/'—'. |
| A selected orphan survives SIGTERM through the full grace window. | It is escalated to SIGKILL (destroyForcibly) and reported FORCED; a survivor that dies during the grace window is TERMINATED. |
| Multiple orphans are selected; some terminate on SIGTERM, some need SIGKILL, one is already gone. | kill() returns one KillOutcome per input pid IN INPUT ORDER with the correct per-pid result (TERMINATED/FORCED/NOT_FOUND), and the section reports each outcome next to its pid. |

### Invariants to preserve

- The orphan KILL is the ONLY mutating operation on the entire Debug surface, and it must be confirm-gated and act SOLELY on the operator's explicit pid selection — no 'kill all', and the managed daemon pid is never signalled (SKIPPED). The scan is a read-only recommendation, never a signal. This mirrors the CLI killOrphansWith contract (debug.ts: acts only on the passed pids, re-excludes managedPid, SIGTERM→wait→SIGKILL) that the s1 data-model.trace bundle grounds. [[c4]]
- Every daemon/socket/file/process read AND the kill run OFF the EDT (buildBody pooled thread + runProcessWithProgressSynchronously) with the render marshalled back via the sc1 base's guarded invokeLater — never block the EDT on process enumeration or a 3s kill-escalation. Grounded in the s1 convention.detect bundle (the DaemonConfigurable/S002 off-EDT idiom the base owns). [[c8]]

## Test strategy

**Test framework:** `JUnit5 (org.junit.jupiter) — the jetbrains-plugin test module, mirroring the CLI src/cli/services/__tests__/debug.test.ts seam tests in Kotlin and the DaemonPageTest/NestedOpsPagesTest source-scan idiom.`

### Test levels

- **unit** — Prove the OrphanProcessSeam.scan() match/exclude/degrade logic against canned ProcessSnapshots with no real OS: keeps only daemonEntry-matching pids, excludes managedPid, and degrades to Unsupported when command lines are unobservable or the platform is unsupported.
  - Subjects: `OrphanProcessSeam.scan (injected processes/managedPid/daemonEntry/platformSupported providers)`
  - Fixtures: `canned List<ProcessSnapshot>: some commands containing the daemonEntry path, some not, one equal to the managedPid`, `a snapshot set whose commandLine is null (unobservable) + a platformSupported()=false provider`, `a processes() provider that throws (enumeration failure)`
- **unit** — Prove the OrphanProcessSeam.kill() k3/k5 contract with an injected fake killer + instant waiter: acts ONLY on the passed pids, re-excludes managedPid (SKIPPED), escalates SIGTERM→wait→SIGKILL only for survivors, folds per-pid failures, and returns one outcome per input pid in input order — never throwing.
  - Subjects: `OrphanProcessSeam.kill (fake killer records signals + scripts per-pid liveness; instant grace clock)`
  - Fixtures: `a fake killer scripting: a pid that dies on SIGTERM (TERMINATED), one that survives to SIGKILL (FORCED), one already gone (NOT_FOUND), one that throws on signal (ERROR)`, `an input list containing the managedPid to assert SKIPPED + never-signalled`, `an empty pids list to assert the no-op empty result`
- **unit** — Prove DebugStatusCardReader.read() folds the sc2 daemonStatus() result with the locally-derived socket/pid/version: Loaded -> reachable card with running/uptime/repoCount + socket always + best-effort pid/version; Stopped/Unavailable -> not-reachable card still carrying socket + best-effort fields.
  - Subjects: `DebugStatusCardReader.read (injected status/socketPath/pid/version providers)`
  - Fixtures: `a status provider returning Loaded(DaemonStatusDto(...)), one returning Stopped, one returning Unavailable(reason)`, `pid/version providers returning a value and returning null (missing pidfile / package.json)`
- **unit** — Source-scan guard the Debug PAGE + sc3 invariants that can't be asserted by booting the Settings dialog headlessly: DebugConfigurable extends the base + implements DebugPageHost, renders the status card + orphan section via InsrcCollapsible, the kill is confirm-gated (showYesNoDialog) + run off-EDT (runProcessWithProgressSynchronously), and the parent settings page is untouched (k4).
  - Subjects: `DebugConfigurable.kt source text (extends InsrcOpsConfigurable, implements DebugPageHost, uses OrphanProcessSeam + DebugStatusCardReader, showYesNoDialog + runProcessWithProgressSynchronously, no S001 placeholder)`, `InsrcSettingsConfigurable.kt source text (not repointed at DebugConfigurable)`
  - Fixtures: `read of src/main/kotlin/ai/insors/insrc/jetbrains/ops/DebugConfigurable.kt`, `read of src/main/kotlin/ai/insors/insrc/jetbrains/settings/InsrcSettingsConfigurable.kt`
- **unit** — Prove the sc3 DebugPageHost contract shape: DebugConfigurable.sections() returns an ordered list seeded with the Status + Orphans sections (each a DebugSection with a title + a component), so S005/S006 can append without re-owning the page.
  - Subjects: `DebugConfigurable.sections() (the sc3 DebugPageHost implementation, exercised directly where constructible without the platform, else source-scanned for the seeded section list)`
  - Fixtures: `a DebugConfigurable (or its extracted section-list builder) constructed with injected seams so sections() can be asserted off the platform`

### Acceptance mapping

| Criterion | Proving tests |
| :--- | :--- |
| `ac1` | `unit(card): a Loaded status folds into a reachable DebugStatusCardModel with running/uptimeSec/repoCount + socket always present + pid/version from the local-derive`, `unit(card): a Stopped / Unavailable status yields a not-reachable card that still carries the socket path and best-effort pid/version`, `unit(card): a missing pidfile / package.json degrades pid/version to null without failing the card`, `source-scan(page): DebugConfigurable renders the status card read-only via InsrcCollapsible and exposes it as an sc3 section` |
| `ac2` | `unit(scan): only daemonEntry-matching, non-managed pids are returned; a managed-only match yields an empty orphan list`, `unit(scan): an unobservable-commandLine snapshot set / unsupported platform yields OrphanScanResult.Unsupported (the section says so, no kill)`, `unit(kill): acts only on the passed pids, returns one outcome per input pid in input order (TERMINATED/FORCED/NOT_FOUND/ERROR) via the SIGTERM→wait→SIGKILL escalation`, `unit(kill): the managed pid in the selection is reported SKIPPED and never signalled (k5); an empty selection is a no-op`, `source-scan(page): the kill is gated on Messages.showYesNoDialog and run under runProcessWithProgressSynchronously (confirm-gated, off-EDT), and is the only mutating control on the page` |

## Migration

**State before:** The Debug child Settings page exists but is inert: S001 registered ops/DebugConfigurable.kt as an <applicationConfigurable parentId="ai.insors.insrc.settings"> with a PLACEHOLDER JLabel body ('Debug diagnostics arrive in a later insrc update'), extending the InsrcOpsConfigurable base (s1 convention.detect). The sc2 daemonStatus():DaemonStatusResult read ships (DaemonGateway.kt:363, s1 symbol.locate) but is consumed only by the S002 Daemon page; no plugin-side orphan scan/kill exists — that logic lives only in the CLI src/cli/services/debug.ts (scanOrphansWith/killOrphansWith, s1 data-model.trace). No DebugPageHost/DebugSection type exists (s1 convention.detect). NestedOpsPagesTest currently guards DebugConfigurable as placeholder-only (JLabel body, no service wiring), exactly as it did for Workflows before S003.

**State after:** DebugConfigurable.buildBody() is filled: it implements the NEW sc3 DebugPageHost, seeding sections()=[StatusSection, OrphansSection] rendered read-only via InsrcCollapsible off the EDT. The Status section reads DebugStatusCardModel from a new DebugStatusCardReader (sc2 daemonStatus() folded with locally-derived socket/pid/version). The Orphans section renders a new OrphanProcessSeam's scan() result (a multi-select list, or an 'unsupported' line) plus a confirm-gated Kill button (Messages.showYesNoDialog + runProcessWithProgressSynchronously) that calls seam.kill(selection) — the epic's only mutation (k3). New plugin-internal types: ProcessSnapshot, OrphanProcess, OrphanScanResult, KillOutcome/KillResult, DebugStatusCardModel, DebugSection/DebugPageHost. Parent settings page + every other page byte-unchanged.

**Zero downtime:** yes — **Data rewrite:** no

### Steps

1. Add the sc3 contract types DebugSection + DebugPageHost (new plugin-internal interfaces) and the OS-process seam OrphanProcessSeam (+ its ProcessSnapshot/OrphanProcess/OrphanScanResult/KillOutcome/KillResult data + default providers: liveProcessSnapshots via ProcessHandle, pidFromDaemonPidFile, defaultDaemonEntry, isPosix) under jetbrains-plugin/.../debug/ — all additive; nothing existing changes. Purely read-only until wired. — ↩ rollbackable
2. Add DebugStatusCardReader (+ DebugStatusCardModel) that consumes the UNCHANGED sc2 daemonStatus() and folds in the locally-derived socket (DaemonSocket.defaultPath), pid (daemon.pid), version (DAEMON_ROOT/package.json) — a new additive reader, no change to DaemonGateway/sc2. — ↩ rollbackable
3. Fill DebugConfigurable.buildBody() to implement DebugPageHost and render sections()=[StatusSection, OrphansSection] via InsrcCollapsible, wiring the confirm-gated Kill (showYesNoDialog + runProcessWithProgressSynchronously -> seam.kill(selection)); replace the S001 placeholder JLabel body. This is the only edit to an existing file's behavior, confined to the Debug page body. — ↩ rollbackable
4. Update the NestedOpsPagesTest placeholder-only guard to exclude DebugConfigurable (scope the assertion so only genuinely-unfilled pages are checked — all three are now filled: Daemon/S002, Workflows/S003, Debug/S004); add OrphanProcessSeamTest + DebugStatusCardReaderTest (seam-injection unit tests) + DebugPageTest (source-scan). — ↩ rollbackable

**Backward compat:** No public/plugin-external API changes and no change to any existing contract: OrphanProcessSeam, DebugStatusCardReader, the sc3 interfaces, and the new data types are all NEW plugin-internal types; sc2's daemonStatus()/DaemonStatusDto/DaemonStatusResult are CONSUMED UNCHANGED (no gateway method added, no field added — the socket/pid/version are plugin-side local-derives, not a DTO extension), so there is no fanout across the DaemonGateway impls. DebugConfigurable's only external contract is its <applicationConfigurable> registration id (ai.insors.insrc.debug), which is unchanged. The sc1 base is consumed unchanged (no override-signature change). The orphan kill is a live OS action but is gated behind an explicit confirm and re-excludes the managed pid, so it cannot affect the running daemon.

## Alternatives considered

### a1: Dedicated ProcessHandle orphan seam + sc3 section-host, mirroring the CLI contract — **CHOSEN**

An injectable plugin-side OrphanProcessSeam over java.lang.ProcessHandle that reproduces debug.ts scanOrphansWith/killOrphansWith exactly (match daemonEntry, exclude managedPid, SIGTERM->wait->SIGKILL, platform-degrade), a DaemonStatusCardModel derived from sc2 + local socket/pid/version, and the sc3 DebugSection/DebugPageHost that DebugConfigurable seeds with a Status section + an Orphans section (confirm-gated kill).

Introduce an S004-internal OrphanProcessSeam with a small typed surface: `data class OrphanProcess(pid:Long, command:String)`, `sealed OrphanScanResult { Unsupported; data class Scanned(orphans:List<OrphanProcess>) }`, `data class KillOutcome(pid:Long, result:KillResult)` with `enum KillResult { TERMINATED, FORCED, NOT_FOUND, ERROR, SKIPPED }`. Its scan/kill are pure over injectable providers — `processes: () -> List<ProcessSnapshot>` (each {pid, commandLine?} sourced from ProcessHandle.allProcesses().map{it.pid() to it.info().commandLine()}), `killer` (destroy/destroyForcibly + isAlive re-probe), `managedPid: () -> Long?` (read `~/.insrc/daemon.pid`), `daemonEntry: String` (`<DAEMON_ROOT>/out/daemon/index.js`), and a `waiter`/grace clock — so the match/exclude/degrade + escalation are unit-testable with canned rows and no real OS. Support gates on commandLine() being observable (any snapshot lacking it, or an unsupported platform, -> OrphanScanResult.Unsupported). A `DaemonStatusCardModel` folds the sc2 daemonStatus() (running/uptime/repoCount) with locally-derived socket (DaemonSocket.defaultPath()), pid (pidfile), version (`<DAEMON_ROOT>/package.json`), each best-effort. sc3 is the two interfaces from the HLD sketch (DebugSection/DebugPageHost); DebugConfigurable implements DebugPageHost, seeds sections()=[StatusSection, OrphansSection], and renders each via InsrcCollapsible off the EDT; the Orphans section shows a multi-select list + a Kill button gated on Messages.showYesNoDialog, running the kill under runProcessWithProgressSynchronously and reporting per-pid outcomes.

### a2: Daemon-IPC orphan management (new daemon.scan-orphans / daemon.kill-orphans)

Add read + mutate daemon IPCs so the plugin asks the daemon to enumerate and kill stray daemon processes, and the Debug page is a thin caller.

The daemon grows new IPC handlers that run the existing debug.ts scanOrphans/killOrphans server-side; DaemonGateway gains scanOrphans()/killOrphans(pids) sealed-result methods and the Debug page renders/acts through them, reusing the daemon's own canonical logic with zero Kotlin re-implementation.

**Rejected because:** VIOLATES k1 — adds daemon.scan-orphans/kill-orphans IPC handlers + the mirrored IDE-fork lock-step (the Epic is plugin-only, NO daemon/CI change in scope; the HLD placed this on a plugin-side ProcessHandle seam precisely to avoid it); and structurally an orphan is not spawned by / not reachable from the managed daemon, so when a bad shutdown left the socket down (exactly when orphans exist) the IPC kill fails.

### a3: Inline the card + kill in DebugConfigurable (no seam, no sc3 host)

Put the ProcessHandle scan/kill and the status card directly inside DebugConfigurable.buildBody() with no injectable seam and no DebugPageHost abstraction.

DebugConfigurable calls ProcessHandle.allProcesses() and destroy()/destroyForcibly() inline in its body/action listeners, and renders the status card + orphan controls as a single flat page — no OrphanProcessSeam type, no DebugSection/DebugPageHost.

**Rejected because:** VIOLATES sc3 — omits the DebugPageHost/DebugSection contract S004 OWNS and S005/S006 depend on (forcing them to re-own the page, an HLD breach); and inlining the escalation into EDT listeners leaves the k3-critical selection-only/managed-exclusion/degrade logic untestable, so the epic's single mutating action ships unverified.

## Citations

- **[[c1]]** `analyze-bundle` `s1 symbol.locate — shipped sc2 DaemonStatusDto/DaemonStatusResult (DaemonGateway.kt:363); no socket/pid/version, local-derived like debug.ts buildDaemonCard`
- **[[c2]]** `analyze-bundle` `s1 data-model.trace — debug.ts scanOrphansWith/killOrphansWith orphan heuristic (daemonEntry match, managedPid exclude, SIGTERM→wait→SIGKILL); Java ProcessHandle realization`
- **[[c3]]** `analyze-bundle` `s1 convention.detect — sc3 DebugPageHost (new, S004-owned) + DebugConfigurable placeholder + InsrcCollapsible section idiom (off-EDT via sc1 base)`
- **[[c4]]** `analyze-bundle` `s1 test.locate — seam-injection unit idiom (DaemonLifecycleCommandRunnerTest) + debug.test.ts + source-scan (DaemonPageTest/NestedOpsPagesTest)`
- **[[c5]]** `prior-artifact` `HLD 57298940cdc341bc sharedContract sc3 (DebugPageHost) ownedByStory s4; sc1/sc2 consumed`
- **[[c6]]** `code` `src/cli/services/debug.ts:82/108-237 buildDaemonCard + scanOrphansWith/killOrphansWith — the CLI contract the plugin seam mirrors`
- **[[c7]]** `analyze-bundle` `s1 symbol.locate — the daemon.status payload shape sc2 parses into DaemonStatusDto (daemon/index.ts:913 / shared/types.ts DaemonStatus)`
- **[[c8]]** `convention` `s1 convention.detect — k2 off-EDT idiom: buildBody on a pooled thread + guarded invokeLater + ProgressManager (InsrcOpsConfigurable/DaemonConfigurable)`

<!-- insrc:review -->

## Review

### ✅ Review `PASS` — design.story (design.story)

**0 HIGH · 0 MED · 10 LOW** · model `client` · reviewed 2026-09-21T10:19:00.822Z

| Ref | Kind | Severity | Fixability | Premise | Evidence | Action |
| --- | --- | --- | --- | --- | --- | --- |
| OrphanProcessSeam | citation | LOW | auto | src/cli/services/debug.ts defines scanOrphansWith + killOrphansWith — the orphan scan/kill heuristic (daemonEntry match, managedPid exclude, SIGTERM→wait→SIGKILL) the plugin OrphanProcessSeam mirrors. | Confirmed: scanOrphansWith resolves at src/cli/services/debug.ts:148. killOrphansWith is declared `export async function killOrphansWith` (debug.ts:180), so the exact 'export function' pattern missed it, but it exists — the seam mirrors both. | None — both CLI functions resolve. |
| DebugStatusCardReader | citation | LOW | auto | src/cli/services/debug.ts buildDaemonCard derives the status card's socket/pid/version locally (socket, readPid from pidfile, readVersion from DAEMON_ROOT/package.json) — the local-derive the plugin DebugStatusCardReader mirrors. | Confirmed: buildDaemonCard at debug.ts:82 with readVersion (debug.ts:66, DAEMON_ROOT/package.json) and readPid (debug.ts:55, pidfile) — the exact local-derive the plugin DebugStatusCardReader mirrors. | None — citation resolves. |
| daemonEntry | citation | LOW | auto | DAEMON_ENTRY (the daemon index.js path a candidate command must contain) is defined in src/cli/services/daemon.ts, and DAEMON_ROOT (~/.insrc/daemon) in src/cli/services/maintenance.ts. | Confirmed: src/cli/services/daemon.ts:26 DAEMON_ENTRY = join(__dirname,'../../daemon/index.js') and maintenance.ts:34 DAEMON_ROOT = $INSRC_DAEMON_ROOT ?? ~/.insrc/daemon — the daemonEntry the plugin match uses. | None — both constants resolve. |
| managedPid | citation | LOW | auto | The daemon writes its pid to PID_FILE=$HOME/.insrc/daemon.pid (scripts/daemon-ctl.sh), the pidfile the plugin reads for managedPid + the status card pid. | Confirmed: scripts/daemon-ctl.sh:48 PID_FILE=$HOME/.insrc/daemon.pid — the pidfile the plugin reads for managedPid + the status-card pid. | None — pidfile path resolves. |
| sc2 | citation | LOW | auto | The shipped sc2 DaemonStatusDto (running/uptimeSec/queueDepth/embeddingsPending/modelPullStatus/modelPullPct/lmdbFileSizeMb/repoCount) + sealed DaemonStatusResult{Loaded\|Stopped\|Unavailable} exist in the plugin DaemonGateway.kt and carry NO socket/pid/version. | Confirmed: DaemonGateway.kt:363 data class DaemonStatusDto, :383 sealed interface DaemonStatusResult, :596 interface daemonStatus() + :975 impl — the shipped sc2 consumed unchanged; carries no socket/pid/version (as the LLD states). | None — sc2 surface resolves. |
| socket | citation | LOW | auto | DaemonSocket.defaultPath() = ~/.insrc/daemon.sock is an existing plugin constant the status card uses for the socket field. | Supported: DaemonSocket/daemon.sock grep is capped at 50 matches so the src hit wasn't isolated, but DaemonSocket.defaultPath() = ~/.insrc/daemon.sock is confirmed to exist at UnixSocketDaemonRpc.kt:20 (an existing plugin constant). Correct source for the socket field. | None — the socket constant exists; verifiable at build. |
| sc1/sc3 | citation | LOW | auto | The sc1 base InsrcOpsConfigurable (abstract buildBody) and the placeholder DebugConfigurable both exist in the plugin; S004 fills DebugConfigurable and implements the new DebugPageHost. | Confirmed: InsrcOpsConfigurable.kt:33 (abstract base) and DebugConfigurable.kt:13 (the placeholder S004 fills). The sc3 DebugPageHost is new (only named in DebugConfigurable's forward-looking KDoc today), correctly introduced by this Story. | None — base + fill target resolve. |
| ProcessHandle seam | external-contract | LOW | auto | java.lang.ProcessHandle (allProcesses(), info().commandLine(), pid(), destroy()/destroyForcibly(), isAlive) is a stable JDK API providing the process enumeration + signal the OS-process seam uses. | External JDK contract: java.lang.ProcessHandle (allProcesses/info().commandLine()/pid()/destroy()/destroyForcibly()/isAlive) is a stable public API (JDK9+); not yet referenced in plugin src, which is expected pre-build. Correct seam for local process enumeration + signalling. | None — platform API is valid; build introduces the reference. |
| interactionWithShared | cross-artifact | LOW | auto | The HLD assigns sc3 (DebugPageHost) ownedByStory s4 and lists s5/s6 as its consumers; sc1/sc2 are consumed (owned by s1). S004 implements sc3 and consumes sc1/sc2. | Supported: ownedByStory is the HLD ownership field; sc3 (DebugPageHost) ownedByStory s4 with s5/s6 consumers is grounded in the HLD context slice, and S004 correctly role=implements sc3 while consuming sc1/sc2 (owned by s1). | None — cross-artifact ownership holds. |
| kill contract | closed-union | LOW | auto | The kill escalation + outcome union mirrors debug.ts killOrphansWith exactly: SIGTERM(destroy)→wait→SIGKILL(destroyForcibly) survivors, managed pid re-excluded (SKIPPED), outcomes in input order (terminated/forced/not-found/error). | Confirmed: debug.ts:109 KILL_GRACE_MS=3000 + :198 wait + :182 isManaged (managed re-excluded) + SIGTERM→SIGKILL escalation with outcomes in input pid order (:222) — the exact kill contract the plugin KillOutcome/KillResult union mirrors, plus the added explicit SKIPPED for the managed case. | None — kill escalation + union mirror the CLI. |
