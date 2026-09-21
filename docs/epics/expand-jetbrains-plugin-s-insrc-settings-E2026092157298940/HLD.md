<!-- insrc:artifact HLD-57298940cdc341bc -->

# HLD: Chosen shape a1: three new child Settings pages (Daemon, Workflows, Debug) are registered declaratively as <applicationConfigurable parentId="ai

## Framework summary

Chosen shape a1: three new child Settings pages (Daemon, Workflows, Debug) are registered declaratively as <applicationConfigurable parentId="ai.insors.insrc.settings"> nodes under the UNCHANGED parent insrc Configurable, each a thin Swing page built on a shared abstract page-shell base (the off-EDT-load + InsrcCollapsible/JBScrollPane idiom the settings page already established). Every page is a read/act surface over a plugin-side seam placed at its natural home — the DaemonGateway grows in-place sealed *Result IPC methods, a lifecycle-command runner reuses the existing ScriptDaemonProvisioner/script-locator to run daemon-ctl.sh subcommands, an OS-process seam (Java ProcessHandle) does the single guarded orphan-kill, a read-only chain reader projects .insrc/artifacts, and a first-of-its-kind log-editor seam (LightVirtualFile + FileEditorManager) hosts the tail. Nothing touches the shipped parent settings page or the daemon; everything is additive, plugin-only, and off-EDT.

## Architecture shape

Layering per page: a Configurable (the IDE-registered nav node) → a shared page-shell base that runs the off-EDT load and renders on a guarded invokeLater → a backing seam. Two seams are shared and owned by the foundational Story S001 because sibling Stories in different dependency branches both need them: the nav scaffold + page-shell base, and a rich daemon-status read (S002's Daemon health readout and S004's Debug status card both consume it; S001 is their nearest common ancestor). One seam is shared within the Debug branch and owned by S004: a Debug-page host that lets the Debug Configurable carry pluggable sections, consumed by S005 (MCP/sessions) and S006 (the log-open affordance), both of which depend on S004. Every other seam is Story-internal: S002 owns the six lifecycle actions (backup/compact/shutdown IPCs + the start/stop/restart/update script-runner); S003 owns the .insrc/artifacts chain reader; S004 owns the ProcessHandle orphan seam; S005 owns the debug-status/attached-clients + MCP-registration reads; S006 owns the log VirtualFile/FileEditor + local tail. All daemon/socket/file/process I/O runs on executeOnPooledThread and marshals UI back via a guarded invokeLater (k2). The one mutation anywhere is S004's confirm-gated orphan-kill (k3).

## Shared contracts

### sc1: NestedSettingsNavScaffold + SharedPageShell

**Owner Story:** `s1`
**Consumed by:** `s2`, `s3`, `s4`

**Purpose:** The S001 foundation every child page builds on: the declarative parent-nesting pattern (child applicationConfigurables under id ai.insors.insrc.settings, parent unchanged — k4) plus a shared abstract page-shell base that standardizes the off-EDT load + guarded EDT render + the InsrcCollapsible/JBScrollPane page idiom, so each page implements only its own body.

**Interface sketch (type-level):**

```
// Kotlin type-level (no bodies)
abstract class InsrcOpsConfigurable : com.intellij.openapi.options.Configurable {
  // subclasses supply the page body; the base owns createComponent()'s
  // off-EDT load + guarded invokeLater render + JBScrollPane/ScrollableColumn shell
  protected abstract fun pageTitle(): String
  protected abstract fun buildBody(): javax.swing.JComponent  // called on a pooled thread
}
// plugin.xml (declarative nesting, parent untouched):
// <applicationConfigurable parentId="ai.insors.insrc.settings" id="ai.insors.insrc.daemon"   instance="...DaemonConfigurable"/>
// <applicationConfigurable parentId="ai.insors.insrc.settings" id="ai.insors.insrc.workflows" instance="...WorkflowsConfigurable"/>
// <applicationConfigurable parentId="ai.insors.insrc.settings" id="ai.insors.insrc.debug"     instance="...DebugConfigurable"/>
```

**Assumptions cited:** [[c8]]

### sc2: DaemonStatusRead

**Owner Story:** `s1`
**Consumed by:** `s2`, `s4`

**Purpose:** A single rich daemon-status read both the Daemon health readout (S002) and the Debug status card (S004) consume. Owned at S001 (the nearest common ancestor of the two sibling branches) so both are trivially downstream. Extends DaemonGateway beyond today's stale-only probe to parse the full daemon.status payload into a sealed result; never throws (unreachable → a distinct stopped/unavailable state).

**Interface sketch (type-level):**

```
// Kotlin type-level (no bodies)
data class DaemonStatusDto(
  val running: Boolean, val uptimeSec: Long?, val queueDepth: Int, val embeddingsPending: Int,
  val modelPull: String, val modelPullPct: Int?, val lmdbFileSizeMb: Int?, val repoCount: Int,
  val socket: String?
)
sealed interface DaemonStatusResult {
  data class Loaded(val status: DaemonStatusDto) : DaemonStatusResult
  data object Stopped : DaemonStatusResult                 // reachable-negative / not running
  data class Unavailable(val reason: String) : DaemonStatusResult
}
interface DaemonGatewayStatus { fun daemonStatus(): DaemonStatusResult }  // added to DaemonGateway
```

**Assumptions cited:** [[c7]]

### sc3: DebugPageHost

**Owner Story:** `s4`
**Consumed by:** `s5`, `s6`

**Purpose:** The Debug Configurable's section-host: S004 builds the Debug page as a small ordered set of sections, so S005 (MCP clients + attached sessions) and S006 (the log-open affordance) can attach their read-only sections without re-owning the Debug page. Owned by S004; consumed by S005 and S006 (both depend on S004).

**Interface sketch (type-level):**

```
// Kotlin type-level (no bodies)
interface DebugSection {          // one collapsible read-only area on the Debug page
  fun title(): String
  fun component(): javax.swing.JComponent   // built off-EDT by the section, rendered under the shell
}
interface DebugPageHost {         // the S004 Debug page exposes an ordered section list
  fun sections(): List<DebugSection>        // S004 seeds status+orphans; S005/S006 contribute theirs
}
```

**Assumptions cited:** [[c3]]

## Story boundaries

### Story E2026092157298940:S001

**Owns:** `sc1`, `sc2`

PRIVATE to S001: the concrete registration wiring of the three child Configurable classes in plugin.xml, the abstract page-shell base implementation (its createComponent off-EDT/guarded-render mechanics), and the parse of the daemon.status payload into DaemonStatusDto. S001 delivers the empty-but-navigable pages + the shared status read; it does not implement any page's domain body — those are the consuming Stories'.

### Story E2026092157298940:S002

**Depends on:** `sc1`, `sc2`

PRIVATE to S002: the Daemon page body (health readout rendered from sc2 + the six action controls), and the lifecycle-action backing used only here — the new DaemonGateway IPC methods for backup/compact/shutdown (sealed *Result) and a lifecycle-command runner that executes daemon-ctl.sh subcommands (start/stop/restart/update) via the existing ScriptDaemonProvisioner + DefaultDaemonScriptLocator, off the EDT with streamed progress and a backup-dir prompt. No other Story consumes these, so they stay S002-internal.

### Story E2026092157298940:S003

**Depends on:** `sc1`

PRIVATE to S003: the plugin-side read-only chain reader that scans the open project's .insrc/artifacts (DEF-/HLD-/LLD-/PLAN-*.json) and projects a ChainReport-shaped model (define/HLD marks, per-story design/approved/stale, next action, amendment counts), plus the Workflows page that renders it read-only (no approve/reject/amend — k6) with an empty state. Entirely local file reads; no daemon IPC and no shared surface.

### Story E2026092157298940:S004

**Owns:** `sc3`
**Depends on:** `sc1`, `sc2`

PRIVATE to S004: the Debug status card rendered from sc2 (plus locally-derived pid/version where the status payload lacks them), and the OS-process seam — a Java ProcessHandle enumerator that recommends stray daemon-entry processes (excluding the managed one) and a confirm-gated kill that acts solely on the explicit selection and degrades to 'unsupported' off a capable platform (the single mutation, k3). S004 also implements the DebugPageHost (sc3) and seeds its own status+orphan section.

### Story E2026092157298940:S005

**Depends on:** `sc3`

PRIVATE to S005: the MCP diagnostic section it contributes to the Debug page host — a read-only view combining the plugin's existing host-detection (which MCP clients are registered/connected) with a new DaemonGateway debug-status read (daemon.debug-status → the sessions attached to the socket, with identity + connection time), degrading to a clear unavailable line when the daemon is unreachable. No mutating control (k3).

### Story E2026092157298940:S006

**Depends on:** `sc3`

PRIVATE to S006: the log-editor seam — the plugin's first LightVirtualFile + FileEditorManager surface — that opens a chosen daemon/agent log (from the known LOG_DIR) as a read-only editor tab and streams appended lines off the EDT into it, with a level/module/text filter applied to the view. The 'open log' affordance attaches to the Debug page host (sc3). Nothing deletes/rotates/clears the underlying log (k5, read-only).

## Non-functional targets

- **Performance:** Every read (status, chain scan, debug-status, MCP list, process scan) and every action (lifecycle scripts, backup/compact) runs on a pooled thread with a guarded invokeLater render (k2); the log editor streams into a bounded view so a long-running tail stays memory-safe, mirroring the CLI's bounded ring buffer.
- **Security:** The single mutating operation anywhere in the Epic is the Debug orphan-process kill, which is confirm-gated and acts only on the operator's explicit selection (k3); all other surfaces are strictly read-only. No credentials are handled; the plugin reaches only the local socket, local files, and local processes on the same machine.
- **Observability:** The pages surface the daemon's OWN observable state (status/queue/logs/attached clients); the Epic adds no new telemetry of its own — it is a read/act projection of existing signals.
- **Durability:** No persisted plugin state: every page shows a live snapshot (or a live stream for logs); closing a page or the log editor drops only in-memory view state. Lifecycle actions mutate the daemon via its own scripts/IPCs, not via any plugin-held store.

## Rollout

### Phase A — Foundation (nav scaffold + shared status read)

**Stories:** `s1`

S001 owns both shared contracts every other Story consumes: the nested-Configurable nav scaffold + page-shell base (sc1) and the rich daemonStatus read (sc2). It must land first — it registers the three child pages (initially empty-but-navigable) under the unchanged parent and delivers the status read the Daemon and Debug branches both build on. Depends on nothing.

**Backward compat:** The parent insrc Settings page (ai.insors.insrc.settings) stays the default and is not modified; adding child applicationConfigurables is purely additive to plugin.xml. The DaemonGateway gains a new daemonStatus() method alongside the existing stale-only probe() — no existing gateway signature changes.

### Phase B — Operational pages (Daemon, Workflows, Debug status+orphans)

**Stories:** `s2`, `s3`, `s4`

The three page bodies that depend only on the Phase-A foundation. S002 (Daemon health + six lifecycle actions) consumes sc1+sc2; S003 (read-only Workflows chain) consumes sc1; S004 (Debug status card + orphan kill, and it owns the Debug-page host sc3) consumes sc1+sc2. All three depend solely on S001, so they can proceed in parallel once Phase A lands; none depends on another.

**Backward compat:** S002's lifecycle-command runner reuses the existing ScriptDaemonProvisioner/DefaultDaemonScriptLocator to invoke daemon-ctl.sh subcommands and adds backup/compact/shutdown IPC methods to DaemonGateway additively — the existing INSTALL/UPDATE offer path is untouched. S004's DebugPageHost (sc3) must be defined so Phase-C sections can attach without S004 being re-opened.

### Phase C — Debug sections (MCP/sessions, log editor)

**Stories:** `s5`, `s6`

The two read-only Debug sections that attach to the Debug-page host (sc3) owned by S004, so they must land after S004. S005 (MCP clients + attached sessions) and S006 (log-tail editor panel) each depend only on S004; they are independent of each other and can proceed in parallel once Phase B's S004 is in.

**Backward compat:** Both attach as additional DebugSections to the host S004 established — the status+orphan section S004 seeded stays in place and its ordering is preserved. S005 adds a debug-status/attached-clients read to DaemonGateway additively; S006 introduces the plugin's first LightVirtualFile/FileEditorManager surface without touching any existing component.

**Ordering rationale:** The order is forced by shared-contract ownership: S001 owns sc1 (nav scaffold) and sc2 (daemonStatus), consumed by S002/S003/S004, so S001 is Phase A. S002/S003/S004 depend only on S001 and on no sibling, so they form one parallelizable Phase B; S004 additionally owns sc3 (the Debug-page host) which S005 and S006 consume, so those two land in Phase C after S004. Within Phase B and within Phase C there are no inter-Story edges, so members may be built in any order or concurrently. Every Story appears in exactly one phase and every dependency edge points to an earlier phase.

### Risky bits

| Area | Why | Mitigation |
| :--- | :--- | :--- |
| Lifecycle-command seam (S002 start/stop/restart/update) | The existing DaemonLifecycleService only models INSTALL/UPDATE offers; start/stop/restart are not yet expressible, so S002 must introduce a new command runner over daemon-ctl.sh — a genuinely new seam, and a wrong script path or a blocked EDT during a long restart would freeze the IDE or silently no-op. | Reuse the proven DefaultDaemonScriptLocator to resolve daemon-ctl.sh and run every subcommand on a pooled thread with streamed progress + a guarded invokeLater outcome (k2); treat a missing script or non-zero exit as a reported failure state, never a thrown EDT exception. |
| daemonStatus() ownership at S001 across sibling branches (sc2) | The rich status read is consumed by both S002 (Daemon page) and S004 (Debug card) which live in different Phase-B branches; if it were owned by either consumer, the other branch would depend on a sibling and the phase order would break (cg2). | Own sc2 at S001 (the nearest common ancestor) as the HLD framework specifies, so both consumers are trivially downstream; S001's Phase-A delivery includes the DaemonStatusDto parse and a sealed Loaded/Stopped/Unavailable result that never throws. |
| First VirtualFile/FileEditor surface (S006 log editor) | No existing plugin code opens an editor panel; a LightVirtualFile + FileEditorManager streaming tail is new territory and an unbounded append or an EDT-bound file read could bloat memory or stall the UI. | Stream appended lines off the EDT into a bounded view (mirroring the CLI's ring buffer) and open the log strictly read-only via FileEditorManager; the affordance attaches to the sc3 host so S006 stays isolated from the other Debug sections and can be verified independently. |

## Alternatives considered

### a1: Static child Configurables + distributed per-story seams, gateway extended in place — **CHOSEN**

Each of Daemon/Workflows/Debug is its own plugin.xml applicationConfigurable nested via parentId under a shared abstract page-shell base; the backing seams (gateway IPC methods, a lifecycle-command runner, a process seam, a log editor, a chain reader) are added where they belong and owned by the first story that needs each — no daemon change.

The navigation is declarative: three new <applicationConfigurable parentId="ai.insors.insrc.settings"> entries in plugin.xml, each a distinct Configurable class, so the IDE renders them as sibling child nodes under the unchanged parent insrc node (S001 owns this scaffold + a shared abstract base that centralizes the off-EDT-load + InsrcCollapsible/JBScrollPane page idiom the settings page already established). Each page is a thin consumer of a backing seam, and the seams are placed at their natural home rather than in one god-object: DaemonGateway grows sealed *Result methods in place for the pure IPCs (a rich daemonStatus() parse, backup, compact, shutdown, and a debug-status attached-clients read); a small NEW lifecycle-command seam runs daemon-ctl.sh subcommands (start/stop/restart/update) via the existing ScriptDaemonProvisioner + DefaultDaemonScriptLocator pattern with streamed progress; an OS-process seam (Java ProcessHandle) does the orphan scan/kill; a log-editor seam (LightVirtualFile + FileEditorManager, appended off-EDT) hosts the tail; and a plugin-side chain reader projects the .insrc/artifacts DEF/HLD/LLD/PLAN files into a read-only ChainReport-shaped model.

Ownership follows nearest-common-ancestor: the scaffold + shared page shell are S001's; each gateway method is a shared contract owned by the first story that needs it (backup/compact/shutdown + daemonStatus → S002; debug-status → S005; the chain reader → S003); the lifecycle-command seam is S002's, the process seam S004's, the log editor S006's. Everything is additive and plugin-only, and the shipped parent settings page + its hardened scroll code are never touched.

**Pros:**
- Zero edit to the shipped parent InsrcSettingsConfigurable — the <applicationConfigurable parentId> nesting is declarative, so the hardened settings-page scroll code cannot regress (honours k4).
- Each seam lives at its natural home and is independently testable (fake-DaemonRpc for the gateway methods, a fake process-enumerator for orphans, a source-scan for the editor/scaffold) — the established plugin test idiom applies unchanged.
- The story boundaries are clean and mostly parallel after S001: S002/S003/S004 share only the scaffold, so the epic parallelizes with minimal cross-story coupling.
- No daemon or IPC change — stays inside k1 (plugin-only, local verify); the one net-new backing seam (the lifecycle-command runner) reuses the existing provisioner/script-locator.

**Cons:**
- Three separate Configurable registrations + classes is slightly more boilerplate than one composite (mitigated by the shared abstract base).
- The rich daemonStatus() parse and the debug status card's version/pid must combine an IPC read with local-file reads, so S002/S004 carry a little more parsing than a single IPC would.

**Cost estimate:** L

### a2: Configurable.Composite parent building its children in code

Turn the existing InsrcSettingsConfigurable into a Configurable.Composite that constructs and returns the Daemon/Workflows/Debug children programmatically, rather than registering them declaratively in plugin.xml.

Instead of three static plugin.xml registrations, the shipped InsrcSettingsConfigurable is changed to implement Configurable.Composite (or SearchableConfigurable.Parent), whose getConfigurables() returns the three child pages built in code. The backing seams are identical to a1 (gateway IPC methods, lifecycle-command runner, process seam, log editor, chain reader).

This centralizes the child set + order in one Kotlin location and lets the parent inject shared dependencies into its children directly, but it requires editing the parent Configurable class that the settings-page epic shipped and hardened.

**Pros:**
- Child pages, their order, and any shared dependency wiring live in one code location rather than spread across plugin.xml entries.
- The parent can pass shared state to children without each looking up services independently.

**Cons:**
- VIOLATES the k4 invariant that the parent settings page is NOT modified — changing InsrcSettingsConfigurable to a Composite edits the shipped, hardened parent and risks regressing its scroll/edit behaviour for zero user-facing gain.
- Programmatic child construction is less idiomatic than the platform's declarative parentId nesting and interacts with the settings search index differently, adding avoidable surface.
- Couples all six stories' navigation to a change in one shipped file, reducing the parallelism a1 gets from independent registrations.

**Cost estimate:** L

**Rejected because:** VIOLATES k4: converting InsrcSettingsConfigurable to a Configurable.Composite edits the shipped, hardened parent settings page (which k4 says must not be modified) with regression risk for zero user gain; ties all six stories' navigation to one shipped file, losing a1's parallelism. Ranked 2 — ties a1 on k1/k2/k3/k5/k6 but loses on k4.

### a3: New read-only daemon IPCs for status + chain, thin plugin

Add daemon-side IPCs (a rich status and a workflow-chain projection) so the plugin stays a pure IPC caller with no local file/artifact logic.

Rather than parsing local files, the daemon grows new read-only IPC handlers — a richer status payload and a workflow-chain read that returns the ChainReport the CLI computes locally — and the plugin's pages become thin callers of those, mirroring how the Review tool window consumes workflow.pending.

The Debug orphan scan/kill and log tail would similarly be pushed toward daemon-side helpers where possible, minimizing plugin-side OS/file code.

**Pros:**
- The plugin stays a very thin caller with almost no local file/process logic, so cross-platform edge cases (ps, file watching) move to the daemon.
- A daemon-computed chain read reuses the CLI's existing chain logic instead of re-deriving it plugin-side.

**Cons:**
- VIOLATES k1 outright — the Epic is explicitly plugin-only with no daemon or CI changes in scope; adding IPC handlers is out of bounds.
- The workflow chain and logs are inherently PROJECT-LOCAL files the same-machine plugin can already read; routing them through the daemon adds a dependency for data the plugin can get directly, and fails when the daemon is down (exactly the Debug/diagnosis moment).
- Expands the blast radius to the daemon + the IDE-fork IPC lock-step, far beyond a plugin enhancement.

**Cost estimate:** L

**Rejected because:** VIOLATES k1 outright: adds daemon IPC handlers when the Epic is explicitly plugin-only with no daemon/CI change in scope; and it's partial on k2 because routing project-local chain/log reads through the daemon makes them fail exactly when the daemon is down — the diagnosis moment the Debug surface exists for. Ranked 3.

## Citations

- **[[c1]]** `analyze-bundle` `s1 capability.map — src/cli/panes/{DaemonPane,WorkflowsPane,DebugPane,DaemonSection,MCPSection,LogsSection}.tsx` — "Daemon=full DaemonPane, Workflows=read-only half of WorkflowsPane, Debug=DaemonSection+MCPSection + a log tail moved to an editor panel."
- **[[c2]]** `analyze-bundle` `s1 external-contract — src/daemon/index.ts, DaemonGateway.kt:552, src/shared/paths.ts` — "daemon.status/backup/compact/shutdown/debug-status are socket IPCs; DaemonGateway.probe() reads ONLY the stale flag — a new richer daemonStatus() read is required; version/pid derived from local files"
- **[[c3]]** `analyze-bundle` `s1 reuse.map — DaemonLifecycleService.kt:28, DaemonLifecycleModel.kt:12, ScriptDaemonProvisioner.kt` — "ProvisionKind is a CLOSED union of INSTALL | UPDATE only … the Daemon page (S002) needs a SMALL NEW lifecycle-command seam that runs daemon-ctl.sh <subcommand> via the existing ScriptDaemonProvisioner"
- **[[c4]]** `analyze-bundle` `s1 convention.detect — plugin.xml:290-291, InsrcSettingsConfigurable.kt, ui/InsrcCollapsible.kt, src/workflow/chain.ts` — "Child pages nest by registering more applicationConfigurable elements with parentId=ai.insors.insrc.settings … NO existing VirtualFile/FileEditor usage in the plugin — the log editor (S006) is the plu"
- **[[c7]]** `analyze-bundle` `s1 external-contract — daemon.status payload gap (src/daemon/index.ts, DaemonGateway.kt:552)` — "the rich fields the Daemon/Debug pages need (uptime, queueDepth, embeddingsPending, modelPull status, lmdbFileSizeMb, repos, and for the Debug card socket/version/pid) are NOT parsed today; a new rich"
- **[[c8]]** `convention` `s1 convention.detect — plugin.xml:290-291 parent applicationConfigurable + ui/InsrcCollapsible.kt off-EDT/JBScrollPane idiom` — "Child pages nest by registering more applicationConfigurable elements with parentId=ai.insors.insrc.settings, each its own Configurable (the S001 scaffold; the shared page shell reuses ui/InsrcCollaps"

<!-- insrc:review -->

## Review

### ✅ Review `PASS` — design.epic (design.epic)

**0 HIGH · 0 MED · 10 LOW** · model `client` · reviewed 2026-09-21T06:10:42.120Z

| Ref | Kind | Severity | Fixability | Premise | Evidence | Action |
| --- | --- | --- | --- | --- | --- | --- |
| sc1 | citation | LOW | manual | The plugin registers a parent applicationConfigurable with id=ai.insors.insrc.settings (class InsrcSettingsConfigurable) under parentId=tools, so child pages can nest via parentId=ai.insors.insrc.settings without editing the parent. | grep confirms <applicationConfigurable parentId=tools id=ai.insors.insrc.settings> exists in plugin.xml (build/resources copy at :276 mirrors src); child nesting via parentId=ai.insors.insrc.settings is valid and the parent is untouched. |  |
| sc1 | citation | LOW | manual | A shared UI helper ui/InsrcCollapsible.kt exists exposing collapsiblePanel and ScrollableColumn, which the S001 shared page-shell reuses. | grep confirms fun collapsiblePanel( and class ScrollableColumn exist in the plugin ui/InsrcCollapsible.kt (also echoed in the prior standalone LLD and compiled test classes). |  |
| sc2 | citation | LOW | manual | DaemonGateway currently exposes only a stale-only probe() and does not parse the rich daemon.status fields, so a new richer daemonStatus() read is required. | grep confirms fun probe(): DaemonState at DaemonGateway.kt:369 (the current stale-only read); fun daemonStatus( appears only in this HLD, confirming it is a new method to add, exactly as the contract states. |  |
| risky/S002 | closed-union | LOW | manual | The plugin's DaemonLifecycleService ProvisionKind is a closed union of INSTALL \| UPDATE only, with no direct start/stop/restart command, so S002 must add a new lifecycle-command seam over daemon-ctl.sh. | grep confirms enum class ProvisionKind at DaemonLifecycleModel.kt:16; the closed INSTALL\|UPDATE union is real, so a new start/stop/restart lifecycle-command seam is genuinely required. |  |
| a1 | citation | LOW | manual | A ScriptDaemonProvisioner (and a DefaultDaemonScriptLocator resolving daemon-ctl.sh) exists in the plugin for S002 to reuse when running lifecycle subcommands. | grep confirms class ScriptDaemonProvisioner at ScriptDaemonProvisioner.kt:47 and daemon-ctl.sh references; the reuse target for the S002 script-runner exists. |  |
| sc2/S002 | external-contract | LOW | manual | The daemon exposes socket IPC handlers for status, backup, compact, shutdown, and debug-status that the plugin's new gateway methods call. | grep confirms daemon.status/backup/compact/shutdown/debug-status IPC names are present (design/indexer.html IPC table + DEF citation c7 quoting src/daemon/index.ts); the socket handlers the plugin will call exist. |  |
| sc3/S006 | inventory | LOW | manual | The plugin currently has NO VirtualFile/FileEditor/FileEditorManager/LightVirtualFile usage, so the S006 log editor is the plugin's first such surface. | grep for LightVirtualFile/FileEditorManager matches only this HLD (no plugin source), and com.intellij.openapi.fileEditor returns 0 matches; confirms the plugin has no existing editor surface, so S006 is correctly the first such surface. |  |
| S003 | citation | LOW | manual | The CLI's workflow chain logic (ChainReport) lives in src/workflow/chain.ts, which the S003 plugin-side chain reader mirrors as a read-only projection over .insrc/artifacts. | grep confirms ChainReport exists in the CLI workflow layer (src/workflow/chain.ts and related LLDs); the S003 plugin-side read-only projection mirrors a real model. |  |
| rollout | ordering | LOW | manual | Every Story appears in exactly one rollout phase and every dependsOn edge points to an earlier phase: s1 (Phase A, no deps); s2/s3/s4 (Phase B, depend on s1); s5/s6 (Phase C, depend on s4). | Internal-consistency claim: each Story appears in exactly one phase (A=s1, B=s2/s3/s4, C=s5/s6) and every dependsOn edge points to an earlier phase; verified against the artifact rollout and boundaries. |  |
| sharedContracts | semantic | LOW | manual | Each shared contract has exactly one owner and every consumer transitively depends on that owner: sc1 owned by s1 (consumed s2/s3/s4), sc2 owned by s1 (consumed s2/s4), sc3 owned by s4 (consumed s5/s6). | Internal-consistency claim: sc1/sc2 owned by s1 (consumers s2/s3/s4 and s2/s4 all depend on s1), sc3 owned by s4 (consumers s5/s6 both depend on s4); every consumer is transitively downstream of its owner. |  |
