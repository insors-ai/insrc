<!-- insrc:artifact PLAN-57298940cdc341bc-s4 -->

# Plan: E2026092157298940:S004

**Epic:** `expand-jetbrains-plugin-s-insrc-settings`
**LLD run:** `wf-1789984944132-7k0epd`
**LLD effective hash:** `7b17d6a14b2a...`

## Tasks

| # | Task | Size | Depends on | Tests | Derived from |
| :--- | :--- | :--- | :--- | :--- | :--- |
| 1 | **`t1`** Add the OrphanProcessSeam data types + seam skeleton (debug/ package) | S | — | unit: OrphanProcessSeamTest: the five data/enum types carry the exact LLD shapes and the seam exposes scan()/kill() + injectable providers (compile + shape smoke) | [[c1]] [[c2]] |
| 2 | **`t2`** Implement OrphanProcessSeam.scan() (match/exclude/degrade, never-throws) | M | `t1` | unit: OrphanProcessSeamTest.scan match/exclude: canned snapshots -> only daemonEntry-matching, non-managed pids; managed-only match -> Scanned(empty); unit: OrphanProcessSeamTest.scan degrade: unobservable-commandLine set / platformSupported()=false -> Unsupported; a throwing processes() provider -> Scanned(empty), never throws | [[c1]] [[c2]] |
| 3 | **`t3`** Implement OrphanProcessSeam.kill() (selection-only, SIGTERM->wait->SIGKILL, managed SKIPPED) | M | `t1` | unit: OrphanProcessSeamTest.kill escalation: fake killer scripts SIGTERM-death->TERMINATED, survivor->SIGKILL->FORCED, already-gone->NOT_FOUND, throws->ERROR; outcomes in input order; unit: OrphanProcessSeamTest.kill k5/no-op: the managed pid in the selection is SKIPPED + never signalled; empty pids -> empty result; never throws | [[c1]] [[c2]] |
| 4 | **`t4`** Add DebugStatusCardReader + DebugStatusCardModel (sc2 fold + local-derive) | M | — | unit: DebugStatusCardReaderTest: Loaded -> reachable card (running/uptimeSec/repoCount + socket + pid/version); Stopped/Unavailable -> not-reachable card still carrying socket + best-effort; unit: DebugStatusCardReaderTest: missing pidfile / package.json providers -> pid/version null without failing the card (never throws) | [[c3]] [[c5]] |
| 5 | **`t5`** Add the sc3 DebugPageHost + DebugSection interfaces | S | — | unit: DebugPageTest source-scan: DebugSection{title/component} + DebugPageHost{sections} interfaces exist matching the HLD sketch | [[c4]] |
| 6 | **`t6`** Fill DebugConfigurable.buildBody(): implement DebugPageHost, seed Status + Orphans sections with the confirm-gated Kill | M | `t2`, `t3`, `t4`, `t5` | unit: DebugPageTest source-scan: DebugConfigurable extends the base + implements DebugPageHost, seeds sections()=[Status,Orphans] via InsrcCollapsible, uses OrphanProcessSeam + DebugStatusCardReader; unit: DebugPageTest source-scan (k3): the Kill is gated on Messages.showYesNoDialog + runProcessWithProgressSynchronously and is the ONLY mutating control; Status/orphan-list read-only | [[c4]] [[c6]] |
| 7 | **`t7`** Add seam + reader + page tests and clear the NestedOpsPagesTest placeholder guard | M | `t2`, `t3`, `t4`, `t6` | unit: DebugPageTest source-scan (k4): InsrcSettingsConfigurable is not repointed at DebugConfigurable; parent page + plugin.xml untouched; unit: NestedOpsPagesTest: the placeholder-only assertion is cleared (all three pages filled) while the extends-base/pageTitle/overrides-buildBody assertions still pass for Daemon/Workflows/Debug; smoke: Local gate: gradlew test buildPlugin green on JDK21 (--no-build-cache after the new types) | [[c7]] [[c4]] |

### E2026092157298940:S004:T001 — Add the OrphanProcessSeam data types + seam skeleton (debug/ package)

Create jetbrains-plugin/src/main/kotlin/ai/insors/insrc/jetbrains/debug/OrphanProcessSeam.kt with the read-only data types (ProcessSnapshot{pid:Long,commandLine:String?}, OrphanProcess{pid:Long,command:String}, sealed OrphanScanResult{Unsupported|Scanned(orphans:List<OrphanProcess>)}, KillOutcome{pid:Long,result:KillResult}, enum KillResult{TERMINATED,FORCED,NOT_FOUND,SKIPPED,ERROR}) and the OrphanProcessSeam class shell with injectable ctor providers (processes/managedPid/daemonEntry/platformSupported/killer/waiter) + the scan()/kill() signatures + default providers (liveProcessSnapshots via ProcessHandle.allProcesses(), pidFromDaemonPidFile reading ~/.insrc/daemon.pid, defaultDaemonEntry = <DAEMON_ROOT>/out/daemon/index.js, isPosix). No behaviour yet beyond the never-throws scaffold.

**Acceptance checks:**
- The file compiles with the five data/enum types matching the LLD shapes exactly
- OrphanProcessSeam exposes the injectable ctor providers + scan():OrphanScanResult + kill(pids:List<Long>):List<KillOutcome>
- Plugin-internal read/act types only — no daemon IPC/socket reference (k1)

### E2026092157298940:S004:T002 — Implement OrphanProcessSeam.scan() (match/exclude/degrade, never-throws)

Fill scan(): if !platformSupported() -> Unsupported; enumerate processes() (swallow a thrown enumeration -> Scanned(empty)); if command lines are unobservable (every snapshot commandLine null) -> Unsupported; else keep snapshots whose commandLine contains daemonEntry, EXCLUDING managedPid, as OrphanProcess -> Scanned(list). Read-only, never a signal, never throws — mirrors debug.ts scanOrphansWith.

**Acceptance checks:**
- Returns only daemonEntry-matching, non-managed pids as orphans; a managed-only match yields Scanned(empty)
- Unobservable command lines / unsupported platform -> OrphanScanResult.Unsupported
- A processes() enumeration failure degrades to Scanned(empty); never throws; no signal issued (k3)

### E2026092157298940:S004:T003 — Implement OrphanProcessSeam.kill() (selection-only, SIGTERM->wait->SIGKILL, managed SKIPPED)

Fill kill(pids): act ONLY on the passed pids (empty -> empty result); re-exclude managedPid (reported SKIPPED, never signalled, k5); SIGTERM(destroy) each target -> wait grace -> re-probe liveness (ProcessHandle.of(pid).isPresent/isAlive) -> SIGKILL(destroyForcibly) survivors; per-pid NOT_FOUND (already gone) / ERROR (signal refused); outcomes in INPUT pid order; never throws; [] off an unsupported platform — mirrors debug.ts killOrphansWith.

**Acceptance checks:**
- Acts only on the passed pids and returns one KillOutcome per input pid in input order
- SIGTERM-death -> TERMINATED; SIGTERM-survivor -> SIGKILL -> FORCED; already-gone -> NOT_FOUND; refused -> ERROR
- The managed pid in the selection is SKIPPED and never signalled (k5); empty selection is a no-op; never throws

### E2026092157298940:S004:T004 — Add DebugStatusCardReader + DebugStatusCardModel (sc2 fold + local-derive)

Add jetbrains-plugin/.../debug/DebugStatusCardReader.kt (+ DebugStatusCardModel) consuming the UNCHANGED sc2 daemonStatus():DaemonStatusResult and folding in locally-derived socket (DaemonSocket.defaultPath()), pid (~/.insrc/daemon.pid), version (<DAEMON_ROOT>/package.json), best-effort/null-degrading — mirroring debug.ts buildDaemonCard. Loaded->reachable card (running/uptimeSec/repoCount + socket + pid/version); Stopped/Unavailable->not-reachable card still carrying socket + best-effort. Injectable status/socketPath/pid/version providers; never throws.

**Acceptance checks:**
- Loaded folds into a reachable DebugStatusCardModel with running/uptimeSec/repoCount + socket always + pid/version local-derive
- Stopped/Unavailable -> not-reachable card still carrying the socket path + best-effort pid/version
- A missing pidfile / package.json degrades pid/version to null without failing the card (never throws)

### E2026092157298940:S004:T005 — Add the sc3 DebugPageHost + DebugSection interfaces

Add the two new plugin-internal interfaces (DebugSection{title():String; component():JComponent} + DebugPageHost{sections():List<DebugSection>}) that S004 OWNS, so S005/S006 attach read-only sections later without re-owning the page. Type-level contract only.

**Acceptance checks:**
- DebugSection + DebugPageHost interfaces exist matching the HLD sketch (title/component + sections list)
- Section-additive: no coupling to S004's concrete sections (S005/S006 can append)

### E2026092157298940:S004:T006 — Fill DebugConfigurable.buildBody(): implement DebugPageHost, seed Status + Orphans sections with the confirm-gated Kill

Replace the S001 placeholder body: DebugConfigurable implements DebugPageHost and seeds sections()=[StatusSection (DebugStatusCardReader.read() rendered read-only), OrphansSection (OrphanProcessSeam.scan() as a multi-select JList or an 'unsupported' label + a Kill button)], rendered via ui/InsrcCollapsible.collapsiblePanel off the EDT (sc1 base). The Kill is gated on Messages.showYesNoDialog and runs seam.kill(selection) under ProgressManager.runProcessWithProgressSynchronously (off-EDT), reporting per-pid outcomes; empty selection no-ops. The ONLY mutating control (k3); parent settings page + plugin.xml untouched (k4).

**Acceptance checks:**
- DebugConfigurable implements DebugPageHost and renders sections()=[Status, Orphans] via InsrcCollapsible off the EDT
- The Status card + orphan LIST are read-only; the Kill is confirm-gated (showYesNoDialog) + runProcessWithProgressSynchronously and is the ONLY mutating control (k3)
- Empty selection kills nothing; an Unsupported scan shows the 'unsupported' line + no Kill; still `class DebugConfigurable : InsrcOpsConfigurable()`
- InsrcSettingsConfigurable + plugin.xml untouched (k4); replaces the S001 placeholder

### E2026092157298940:S004:T007 — Add seam + reader + page tests and clear the NestedOpsPagesTest placeholder guard

Add OrphanProcessSeamTest.kt (JUnit5 injected-fake providers: scan match/exclude/unsupported/enumeration-swallow; kill selection-only/SKIPPED/SIGTERM->wait->SIGKILL/input-order/empty-no-op) + DebugStatusCardReaderTest.kt (Loaded/Stopped/Unavailable folds + pid/version null-degrade) + DebugPageTest.kt (source-scan: extends base, implements DebugPageHost, uses the seam+reader, showYesNoDialog + runProcessWithProgressSynchronously = only mutation, k4 parent-untouched). Edit NestedOpsPagesTest: after S004 ALL THREE child pages are filled, so the placeholder-only branch has no remaining page — drop the now-empty placeholder-only assertion while KEEPING the extends-base + pageTitle + overrides-buildBody assertions for all three. Verify locally: gradlew test buildPlugin (JDK21, --no-build-cache after the new types).

**Acceptance checks:**
- OrphanProcessSeamTest covers scan match/exclude/unsupported/enumeration-swallow + kill selection-only/SKIPPED/escalation/input-order/empty
- DebugStatusCardReaderTest covers Loaded/Stopped/Unavailable + pid/version null-degrade
- DebugPageTest source-scan asserts sc1+sc3, the confirm-gated single mutation, and parent-untouched; NestedOpsPagesTest placeholder guard cleanly cleared (no false failures)
- Full jetbrains-plugin test + buildPlugin green locally on JDK21

## Test-strategy coverage

| LLD strategy item | Covered by |
| :--- | :--- |
| OrphanProcessSeam.scan (injected processes/managedPid/daemonEntry/platformSupported providers) | `t2`, `t7` |
| OrphanProcessSeam.kill (fake killer records signals + scripts per-pid liveness; instant grace clock) | `t3`, `t7` |
| DebugStatusCardReader.read (injected status/socketPath/pid/version providers) | `t4`, `t7` |
| DebugConfigurable.kt source text (extends InsrcOpsConfigurable, implements DebugPageHost, uses OrphanProcessSeam + DebugStatusCardReader, showYesNoDialog + runProcessWithProgressSynchronously, no S001 placeholder) | `t6`, `t7` |
| InsrcSettingsConfigurable.kt source text (not repointed at DebugConfigurable) | `t7` |
| DebugConfigurable.sections() (the sc3 DebugPageHost implementation, exercised directly where constructible without the platform, else source-scanned for the seeded section list) | `t5`, `t6` |

## Citations

- **[[c1]]** `prior-artifact` `LLD s4 dataModelChanges + contractDetails.OrphanProcessSeam — ProcessSnapshot/OrphanProcess/OrphanScanResult/KillOutcome/KillResult + scan()/kill() over java.lang.ProcessHandle`
- **[[c2]]** `analyze-bundle` `s1 data-model.trace — debug.ts scanOrphansWith/killOrphansWith heuristic (daemonEntry match, managedPid exclude, SIGTERM→wait→SIGKILL, input-order outcomes)`
- **[[c3]]** `prior-artifact` `LLD s4 contractDetails.DebugStatusCardReader + s1 symbol.locate — the buildDaemonCard local-derive (socket=DaemonSocket.defaultPath, pid=daemon.pid, version=DAEMON_ROOT/package.json)`
- **[[c4]]** `analyze-bundle` `s1 convention.detect — sc3 DebugPageHost/DebugSection (new, S004-owned) + DebugConfigurable placeholder + InsrcCollapsible section idiom (off-EDT via sc1 base)`
- **[[c5]]** `prior-artifact` `LLD s4 interactionWithShared sc2 — the shipped daemonStatus():DaemonStatusResult (DaemonGateway.kt:363/383) consumed unchanged`
- **[[c6]]** `code` `src/cli/services/debug.ts — the CLI orphan-scan/kill + daemon-card contract the plugin seam + page mirror`
- **[[c7]]** `analyze-bundle` `s1 test.locate — seam-injection unit idiom (DaemonLifecycleCommandRunnerTest) + debug.test.ts + source-scan (DaemonPageTest/NestedOpsPagesTest)`

<!-- insrc:review -->

## Review

### ✅ Review `PASS` — plan (plan)

**0 HIGH · 0 MED · 7 LOW** · model `client` · reviewed 2026-09-21T10:56:36.260Z

| Ref | Kind | Severity | Fixability | Premise | Evidence | Action |
| --- | --- | --- | --- | --- | --- | --- |
| tasks | ordering | LOW | auto | The plan's 7 tasks form an acyclic dependency graph with a valid topological order (t1<-t2,t3; t4,t5 independent; t6<-t2,t3,t4,t5; t7<-t2,t3,t4,t6), respecting storyDependsOn s1 (already shipped). | The dependsOn graph (t1:[], t2:[t1], t3:[t1], t4:[], t5:[], t6:[t2,t3,t4,t5], t7:[t2,t3,t4,t6]) is acyclic and order 1..7 is a valid topological sort; s1 (sc1 base + sc2 + placeholder Debug page) is already shipped, so ordering respects storyDependsOn. | None — ordering is valid. |
| t2/t3 | citation | LOW | auto | src/cli/services/debug.ts defines the orphan scan/kill heuristic (scanOrphansWith + killOrphansWith) the OrphanProcessSeam tasks t2/t3 mirror. | Confirmed: scanOrphansWith + killOrphansWith resolve in src/cli/services/debug.ts (imported at debug-orphans.test.ts:17), the exact CLI heuristic t2/t3 mirror — and the CLI even carries a debug-orphans.test.ts seam-test the plugin tests parallel. | None — both CLI functions resolve. |
| t4 | citation | LOW | auto | src/cli/services/debug.ts buildDaemonCard + readPid/readVersion is the local-derive t4 mirrors for the status card socket/pid/version. | Confirmed: buildDaemonCard at debug.ts:82 with readPid (debug.ts:55, pidfile) + readVersion (debug.ts:66, DAEMON_ROOT/package.json) — the local-derive t4 mirrors for socket/pid/version. | None — citation resolves. |
| t4 | citation | LOW | auto | The shipped sc2 daemonStatus():DaemonStatusResult (DaemonGateway.kt) is consumed unchanged by t4's DebugStatusCardReader. | Confirmed: DaemonGateway.kt:383 sealed interface DaemonStatusResult + :596 interface daemonStatus() (+ :975 impl) — the shipped sc2 t4 consumes unchanged. | None — sc2 surface resolves. |
| t5/t6 | citation | LOW | auto | The sc1 base InsrcOpsConfigurable + the placeholder DebugConfigurable both exist in the plugin; t6 fills the latter (implementing the new DebugPageHost). | Confirmed: InsrcOpsConfigurable.kt has the abstract base and DebugConfigurable.kt:13 'class DebugConfigurable : InsrcOpsConfigurable()' is the placeholder t6 fills (implementing the new DebugPageHost). | None — base + fill target resolve. |
| t7 | citation | LOW | auto | The test idioms t7 extends exist: NestedOpsPagesTest.kt (placeholder guard) + DaemonLifecycleCommandRunnerTest.kt (seam-injection idiom) + the CLI debug.test.ts. | Confirmed: NestedOpsPagesTest.kt:17 (the placeholder guard t7 edits) + DaemonLifecycleCommandRunnerTest.kt:19 (the seam-injection idiom the seam tests extend); the CLI debug.test.ts/debug-orphans.test.ts are the mirrored TS tests. | None — test idioms resolve. |
| coverage | cross-artifact | LOW | auto | Every task derivedFrom id (c1..c7) resolves to a plan citation, and all 6 LLD testStrategy subjects are covered by >=1 task in testStrategyCoverage. | All task derivedFrom ids c1..c7 are defined in the plan's citations block, and all 6 LLD testStrategy subjects appear in testStrategyCoverage each with >=1 covering task — no dead citation, no uncovered subject. | None — grounding + coverage complete. |
