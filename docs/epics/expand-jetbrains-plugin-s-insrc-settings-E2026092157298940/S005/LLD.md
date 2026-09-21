<!-- insrc:artifact LLD-57298940cdc341bc-s5 -->

# LLD: E2026092157298940:S005

**Epic:** `expand-jetbrains-plugin-s-insrc-settings`
**HLD base run:** `wf-1789970136758-lvyg6v`
**HLD effective hash:** `7b17d6a14b2a...`

## HLD context

**Framework:** Chosen shape a1: three new child Settings pages (Daemon, Workflows, Debug) are registered declaratively as <applicationConfigurable parentId="ai.insors.insrc.settings"> nodes under the UNCHANGED parent insrc Configurable, each a thin Swing page built on a shared abstract page-shell base (the off-EDT-load + InsrcCollapsible/JBScrollPane idiom the settings page already established). Every page is a read/act surface over a plugin-side seam placed at its natural home — the DaemonGateway grows in-place sealed *Result IPC methods, a lifecycle-command runner reuses the existing ScriptDaemonProvisioner/script-locator to run daemon-ctl.sh subcommands, an OS-process seam (Java ProcessHandle) does the single guarded orphan-kill, a read-only chain reader projects .insrc/artifacts, and a first-of-its-kind log-editor seam (LightVirtualFile + FileEditorManager) hosts the tail. Nothing touches the shipped parent settings page or the daemon; everything is additive, plugin-only, and off-EDT.
**Rollout phase:** Phase C — Debug sections (MCP/sessions, log editor)
**Consumes:** `sc3` (DebugPageHost)

**Adjacent scope (owned by other stories — do NOT implement here):**
- `s1`: PRIVATE to S001: the concrete registration wiring of the three child Configurable classes in plugin.xml, the abstract page-shell base implementation (its createComponent off-EDT/guarded-render mechanics), and the parse of the daemon.status payload into DaemonStatusDto. S001 delivers the empty-but-navigable pages + the shared status read; it does not implement any page's domain body — those are the consuming Stories'. — owns `sc1`, `sc2`
- `s2`: PRIVATE to S002: the Daemon page body (health readout rendered from sc2 + the six action controls), and the lifecycle-action backing used only here — the new DaemonGateway IPC methods for backup/compact/shutdown (sealed *Result) and a lifecycle-command runner that executes daemon-ctl.sh subcommands (start/stop/restart/update) via the existing ScriptDaemonProvisioner + DefaultDaemonScriptLocator, off the EDT with streamed progress and a backup-dir prompt. No other Story consumes these, so they stay S002-internal.
- `s3`: PRIVATE to S003: the plugin-side read-only chain reader that scans the open project's .insrc/artifacts (DEF-/HLD-/LLD-/PLAN-*.json) and projects a ChainReport-shaped model (define/HLD marks, per-story design/approved/stale, next action, amendment counts), plus the Workflows page that renders it read-only (no approve/reject/amend — k6) with an empty state. Entirely local file reads; no daemon IPC and no shared surface.
- `s4`: PRIVATE to S004: the Debug status card rendered from sc2 (plus locally-derived pid/version where the status payload lacks them), and the OS-process seam — a Java ProcessHandle enumerator that recommends stray daemon-entry processes (excluding the managed one) and a confirm-gated kill that acts solely on the explicit selection and degrades to 'unsupported' off a capable platform (the single mutation, k3). S004 also implements the DebugPageHost (sc3) and seeds its own status+orphan section. — owns `sc3`
- `s6`: PRIVATE to S006: the log-editor seam — the plugin's first LightVirtualFile + FileEditorManager surface — that opens a chosen daemon/agent log (from the known LOG_DIR) as a read-only editor tab and streams appended lines off the EDT into it, with a level/module/text filter applied to the view. The 'open log' affordance attaches to the Debug page host (sc3). Nothing deletes/rotates/clears the underlying log (k5, read-only).

## Contract details

**Surface level:** internal

### `DaemonGateway.debugStatus`

```typescript
interface DaemonGateway { fun debugStatus(): DebugStatusResult }  // + impl in DaemonGatewayImpl over the injectable DaemonRpc; delegated by DaemonGatewayService
```

**Returns:** `DebugStatusResult` — A sealed read result over the shipped daemon.debug-status IPC: DebugStatusResult.Loaded(sessions: List<AttachedSessionDto>) with the attached sessions sorted by connectedAtMs ascending, or DebugStatusResult.Unavailable(reason) when the socket is unreachable / the reply is not ok / malformed. Mirrors the daemonStatus() sealed-result idiom; never throws.

**Errors:**
- `(none — never throws)` when DaemonUnavailableException (socket down) -> Unavailable; a !ok/error reply or a RuntimeException (malformed payload) -> Unavailable(reason). Never propagates to the EDT render, matching the daemonStatus() contract.

**Preconditions:**
- Called off the EDT (from the MCP section's component() on a pooled thread) — it does a blocking socket round-trip.

**Postconditions:**
- Read-only: sends METHOD_DEBUG_STATUS='daemon.debug-status' with emptyMap() params and never mutates the daemon (k3).
- The daemon is UNCHANGED — only the client-side gateway method is added over the already-registered IPC (k1).

### `McpRegistrationReader.read`

```typescript
class McpRegistrationReader(detectPresent: () -> List<AiHost> = { service<AiHostAdapterService>().detectPresent() }, isInsrcRegistered: (mcpConfigPath: String) -> Boolean = ::mcpServersInsrcPresent) { fun read(): List<McpHostStatusDto> }
```

**Returns:** `List<McpHostStatusDto>` — One McpHostStatusDto {kind: AiHostKind, present: Boolean, registered: Boolean} per host the plugin's existing detectPresent() reports — present is always true for a detected host; registered = the host's mcpConfigPath JSON carries the mcpServers.insrc key. The plugin's own MCP-client universe (AiHostKind {AI_ASSISTANT, JUNIE}), not the CLI's claude/codex.

**Errors:**
- `(none — never throws)` when A detectPresent() failure yields an empty list; a per-host config read that throws (missing/unreadable/malformed JSON) folds to registered=false for that host, so the projection never propagates an exception.

**Preconditions:**
- Called off the EDT (blocking local file reads of each host's mcpConfigPath).

**Postconditions:**
- Read-only: no host file is written; mirrors the existing detectPresent() host-detection + a mcpServers.insrc key read (no reach into JsonMcpConfigWriter internals).
- Returns one entry per detected host, in detectPresent() order.

### `McpDebugSection.component`

```typescript
class McpDebugSection(gateway: DaemonGateway, registration: McpRegistrationReader) : DebugSection { override fun title(): String; override fun component(): javax.swing.JComponent }
```

**Returns:** `javax.swing.JComponent` — The read-only MCP diagnostic: a per-host registration table (kind / present / registered) from McpRegistrationReader.read() + an attached-sessions table (id, label, pid, connected-at, last method) from gateway.debugStatus(); a clear 'daemon unreachable' line replaces the sessions table when debugStatus() is Unavailable (ac1). NO disconnect/terminate control anywhere (ac2/k3).

**Errors:**
- `(none propagated)` when Both reads never throw (their contracts); the component is built off the EDT by the sc3 host and rendered under the sc1 base's disposed-guarded invokeLater.

**Preconditions:**
- Built off the EDT: component() is invoked while DebugConfigurable.buildBody() runs on a pooled thread (sc1 base).

**Postconditions:**
- Strictly read-only — the section exposes no mutating or disconnecting affordance (ac2/k3).
- Implements the sc3 DebugSection interface (title + off-EDT-built component).

### `DebugConfigurable.sections`

```typescript
override fun sections(): List<DebugSection>  // now returns [statusSection(), orphansSection(), mcpSection()]
```

**Returns:** `List<DebugSection>` — The sc3 ordered section list, now with the S005 McpDebugSection APPENDED after S004's Status and Orphans sections — the section-additive consumption of sc3. S004's status/orphan sections are unchanged.

**Preconditions:**
- Assembled off the EDT (each section's component() may read the socket / host files).

**Postconditions:**
- Consumes sc3 by appending exactly one DebugSection; does NOT re-design S004's sections (stays within the s5 boundary).
- The parent settings page + plugin.xml <applicationConfigurable> element remain byte-unchanged (k4).

## Data model changes

### `DebugStatusResult` — new

Plugin-side sealed result of the daemon.debug-status read: `Loaded(sessions: List<AttachedSessionDto>)` | `Unavailable(reason: String)`. Mirrors the shipped DaemonStatusResult shape (Loaded/Stopped/Unavailable) but two-state (a debug read has no distinct 'stopped'); the CLI equivalent is DebugStatusModel {reachable:true,clients}|{reachable:false}.

**Call sites:**
- `jetbrains-plugin/src/main/kotlin/ai/insors/insrc/jetbrains/daemon/DaemonGateway.kt`
- `jetbrains-plugin/src/main/kotlin/ai/insors/insrc/jetbrains/debug/McpDebugSection.kt`

### `AttachedSessionDto` — new

Plugin projection of the daemon's AttachedClient (src/shared/types.ts:835): { id:Long, label:String, pid:Long?, connectedAtMs:Long, lastMethod:String? } parsed from the debug-status `clients[]` payload (Gson Double->Long coercion for id/pid/connectedAt, matching the daemonStatus() coercion idiom). Rendered read-only as one attached-session row.

**Call sites:**
- `jetbrains-plugin/src/main/kotlin/ai/insors/insrc/jetbrains/daemon/DaemonGateway.kt`
- `jetbrains-plugin/src/main/kotlin/ai/insors/insrc/jetbrains/debug/McpDebugSection.kt`

### `McpHostStatusDto` — new

Per-host registration projection: { kind: AiHostKind, present: Boolean, registered: Boolean } over the closed AiHostKind union {AI_ASSISTANT, JUNIE}. present from AiHostAdapter.detectPresent() (installed+enabled); registered from whether the host's mcpConfigPath JSON carries the mcpServers.insrc key. Rendered read-only as one MCP-client row.

**Call sites:**
- `jetbrains-plugin/src/main/kotlin/ai/insors/insrc/jetbrains/debug/McpRegistrationReader.kt`
- `jetbrains-plugin/src/main/kotlin/ai/insors/insrc/jetbrains/debug/McpDebugSection.kt`

## Interaction with shared contracts

| Contract | Role | How |
| :--- | :--- | :--- |
| `sc3` | consumes | S005 CONSUMES sc3 (owned by S004): it implements the DebugSection interface with a new S005-internal McpDebugSection and APPENDS it to DebugConfigurable.sections() (now [Status, Orphans, Mcp]) — the section-additive contract. It does NOT re-own or re-design the DebugPageHost or S004's Status/Orphans sections; it only contributes one read-only section built off the EDT under the sc1 base. No change to the sc3 interface shape. |

## Error paths

### Error cases

- **The daemon socket is down / not running when the MCP section loads (the diagnostic's core use case).** (recoverable)
  - Detection: DaemonGateway.debugStatus() catches DaemonUnavailableException from the DaemonRpc round-trip (the daemonStatus() idiom) and returns DebugStatusResult.Unavailable(reason).
  - Response: The attached-sessions table is replaced by a clear 'daemon unreachable: <reason>' line (ac1 — not a blank); the per-host registration table still renders (it needs no daemon, only local host-detection + config reads).
  - User impact: The developer sees an explicit unavailable line plus the still-useful registration state, never a blank or a stack trace.
- **The daemon.debug-status reply is malformed / not ok (a truncated payload, a non-array clients field, or an {error} reply).** (recoverable)
  - Detection: The gateway's Gson parse of `clients[]` throws (JsonSyntaxException / IllegalStateException) or the reply carries !ok/error; both are caught in the debugStatus() classification (RuntimeException/!ok -> Unavailable), matching daemonStatus().
  - Response: debugStatus() returns Unavailable(reason); the section shows the unavailable line rather than a partial/garbled table. Never rethrows to the EDT.
  - User impact: A daemon glitch surfaces as 'unavailable', not a broken UI.
- **A detected host's mcpConfigPath JSON is missing, unreadable (permissions), or malformed when computing registration.** (recoverable)
  - Detection: The injected isInsrcRegistered(mcpConfigPath) read wraps the file read + Gson parse; an IOException/JsonSyntaxException is caught per host.
  - Response: That host folds to registered=false (present stays true — the host is detected); the other hosts are still evaluated. McpRegistrationReader.read() never throws.
  - User impact: A host with an unreadable/absent mcp config shows as present-but-not-registered rather than dropping the whole MCP table.
- **The plugin's host-detection (detectPresent) itself fails (probe error).** (recoverable)
  - Detection: McpRegistrationReader.read() wraps the detectPresent() provider call; a thrown detection folds to an empty list.
  - Response: The registration table renders empty (or a 'no MCP hosts detected' line); the attached-sessions table is unaffected (it comes from the gateway).
  - User impact: The developer still sees attached sessions even if host-detection hiccups; no crash.

### Edge cases

| Input | Expected |
| :--- | :--- |
| The daemon is reachable but has ZERO attached sessions (no client currently on the socket). | DebugStatusResult.Loaded(emptyList) -> the attached-sessions table renders an empty-but-present state ('no sessions attached') rather than the Unavailable line — reachable-with-none is distinct from unreachable. |
| No MCP hosts are detected on this machine (neither AI_ASSISTANT nor JUNIE installed/enabled). | McpRegistrationReader.read() returns an empty list -> the registration table shows a clear 'no MCP hosts detected' empty state; the attached-sessions table still renders from the gateway. |
| A detected host is present but the insrc entry is NOT registered (mcpServers.insrc absent). | McpHostStatusDto {present=true, registered=false} -> the row shows present + not-registered (the expected read-only diagnostic signal). |
| Multiple sessions are attached with the same label (e.g. two of the same client). | Each AttachedClient is a distinct row keyed by its id; the table lists all of them sorted by connectedAtMs ascending (identity = id/label/pid, connection time = connectedAtMs), never de-duplicated away. |
| An AttachedClient omits the optional pid / lastMethod fields. | AttachedSessionDto.pid / lastMethod are null and render as '—'; id/label/connectedAtMs (required) still render. |
| connectedAt / id arrive as JSON numbers (Gson Double over the socket). | The Double is coerced to Long for connectedAtMs/id/pid (the daemonStatus() coercion idiom), not left as a fractional/scientific string. |

### Invariants to preserve

- The MCP diagnostic is STRICTLY READ-ONLY — it surfaces registration + attached sessions but exposes NO control that disconnects/terminates a client or session (ac2/k3). The epic's single mutation stays S004's confirm-gated orphan kill; c5 is the existing host-detection capability this section reuses read-only (detectPresent + a mcpServers.insrc key read), adding no write to any host file. [[c5]]
- The daemon is NOT modified: S005 only adds a client-side DaemonGateway method over the ALREADY-REGISTERED daemon.debug-status IPC and consumes it read-only; no daemon handler / IPC / CI change (k1). Grounded in the s1 external-contract bundle (daemon.debug-status ships at src/daemon/index.ts:937). [[c5]]

## Test strategy

**Test framework:** `JUnit5 (org.junit.jupiter) — the jetbrains-plugin test module, mirroring the DaemonStatusGatewayTest/Sc2DaemonGatewayTest fake-DaemonRpc idiom and the DebugPageTest/NestedOpsPagesTest source-scan idiom.`

### Test levels

- **unit** — Prove DaemonGateway.debugStatus() over a fake DaemonRpc: sends METHOD_DEBUG_STATUS='daemon.debug-status' with empty params; parses `clients[]` into AttachedSessionDto sorted by connectedAtMs with the Gson Double->Long coercion; classifies DaemonUnavailableException/!ok/RuntimeException-malformed -> Unavailable; never throws.
  - Subjects: `DaemonGatewayImpl.debugStatus (RecordingRpc fake returning a canned {clients:[...]}, an {error}/!ok reply, a throwing rpc, and a malformed payload)`
  - Fixtures: `a canned {clients:[{id,label,pid,connectedAt,lastMethod}, ...]} reply with numbers as Gson Double + optional pid/lastMethod omitted`, `a rpc that throws DaemonUnavailableException; a reply that is !ok/error; a malformed (non-array clients) reply`
- **unit** — Prove McpRegistrationReader.read() folds the injected detectPresent() + isInsrcRegistered seam into per-host McpHostStatusDto {kind,present,registered}, and never throws: a per-host config read failure folds to registered=false; a detectPresent failure yields empty.
  - Subjects: `McpRegistrationReader.read (injected detectPresent + isInsrcRegistered providers)`, `the mcpServers.insrc key read helper (over temp JSON)`
  - Fixtures: `injected detectPresent returning [AiHost(AI_ASSISTANT,path), AiHost(JUNIE,path)] and an empty list`, `temp mcpConfig JSON with mcpServers.insrc present, absent, and malformed/unreadable (to assert registered=true/false/false)`
- **unit** — Source-scan guard the Debug MCP section + its sc3 consumption: DebugConfigurable.sections() now includes the MCP section (appended after Status/Orphans), McpDebugSection implements DebugSection + reads gateway.debugStatus()+McpRegistrationReader, renders an unavailable line, and exposes NO disconnect/terminate control (read-only, ac2/k3); parent settings page untouched (k4).
  - Subjects: `McpDebugSection.kt source text (implements DebugSection, uses DaemonGateway.debugStatus + McpRegistrationReader, an 'unreachable'/unavailable line, no disconnect/terminate/JButton-action)`, `DebugConfigurable.kt source text (sections() appends the MCP section; Status/Orphans unchanged)`
  - Fixtures: `read of src/main/kotlin/ai/insors/insrc/jetbrains/debug/McpDebugSection.kt`, `read of src/main/kotlin/ai/insors/insrc/jetbrains/ops/DebugConfigurable.kt`

### Acceptance mapping

| Criterion | Proving tests |
| :--- | :--- |
| `ac1` | `unit(gateway): a canned {clients:[...]} reply -> DebugStatusResult.Loaded with AttachedSessionDto rows (id/label/pid/connectedAtMs/lastMethod) sorted by connectedAtMs, Gson Double coerced to Long`, `unit(gateway): DaemonUnavailableException / !ok / malformed -> DebugStatusResult.Unavailable(reason) (the degrade-not-blank signal)`, `unit(reader): detectPresent + mcpServers.insrc present/absent -> per-host McpHostStatusDto{present,registered}; a host with an unreadable config -> registered=false; empty detect -> empty list`, `source-scan(section): McpDebugSection reads gateway.debugStatus() + McpRegistrationReader and renders a per-host registration table + attached-sessions table, with an unavailable line when the gateway read fails` |
| `ac2` | `source-scan(section): McpDebugSection.kt contains no disconnect/terminate/JButton-action-listener control and no daemon-mutating IPC — strictly read-only (k3)`, `source-scan(page): DebugConfigurable.sections() only APPENDS the MCP section; the epic's single mutation stays S004's orphan kill (no new mutating control on the page)` |

## Migration

**State before:** The Debug page (S004) renders exactly two sc3 sections — DebugConfigurable.sections() returns listOf(statusSection(), orphansSection()) (s1 convention.detect). DaemonGateway exposes daemonStatus() (sc2) + the S002 action IPCs, but NO debug-status read (s1 convention.detect); the daemon.debug-status IPC ships at src/daemon/index.ts:937 returning { clients: AttachedClient[] } and is consumed only by the CLI today (s1 external-contract). The plugin's host-detection AiHostAdapter.detectPresent():List<AiHost> over AiHostKind {AI_ASSISTANT, JUNIE} exists (s1 symbol.locate) but nothing surfaces MCP registration/attached-sessions on the Debug page. JsonMcpConfigWriter exposes only write/remove of mcpServers.insrc, no public read.

**State after:** DaemonGateway grows a read-only debugStatus():DebugStatusResult over the already-shipped daemon.debug-status IPC (Loaded(sessions)|Unavailable, mirroring daemonStatus(); parses AttachedSessionDto with Gson Double->Long). A pure McpRegistrationReader folds detectPresent() + an injected mcpServers.insrc key read into per-host McpHostStatusDto{kind,present,registered}. A new S005-internal McpDebugSection (sc3 DebugSection) renders both read-only via InsrcCollapsible with an unavailable line, and DebugConfigurable.sections() APPENDS it (now [Status, Orphans, Mcp]). No disconnect/terminate control (k3/ac2); daemon + parent settings page + plugin.xml unchanged (k1/k4).

**Zero downtime:** yes — **Data rewrite:** no

### Steps

1. Add the new plugin-internal types + the DaemonGateway read: DebugStatusResult{Loaded(sessions)|Unavailable(reason)} + AttachedSessionDto, and interface DaemonGateway.debugStatus() with the DaemonGatewayImpl impl (METHOD_DEBUG_STATUS='daemon.debug-status', emptyMap params, parse clients[] with Gson Double->Long, sealed classification mirroring daemonStatus(), never throws) + the DaemonGatewayService delegate. Adding a method to the DaemonGateway interface forces the override in every impl (real + delegating + test fakes). — ↩ rollbackable
2. Add the pure McpRegistrationReader (+ McpHostStatusDto) over an injected detectPresent() + a small mcpServersInsrcPresent(mcpConfigPath):Boolean read helper (Gson read of the mcpServers.insrc key; per-host swallow -> registered=false) — additive, reads host files read-only, no reach into JsonMcpConfigWriter internals. — ↩ rollbackable
3. Add the S005-internal McpDebugSection implementing the sc3 DebugSection (title + off-EDT component rendering the registration table + attached-sessions table via InsrcCollapsible, unavailable line, strictly read-only). — ↩ rollbackable
4. Append the McpDebugSection to DebugConfigurable.sections() (now [statusSection(), orphansSection(), mcpSection()]) — the only edit to an existing file, confined to adding one list element; S004's Status/Orphans sections unchanged. — ↩ rollbackable
5. Add McpDebugStatusGatewayTest (fake DaemonRpc: Loaded/Unavailable/malformed + Gson Double coercion) + McpRegistrationReaderTest (temp JSON: present/absent/malformed registration, empty detect) + extend DebugPageTest (source-scan: sections() appends the MCP section; McpDebugSection read-only + unavailable line). Add the debugStatus() stub override to the DaemonGateway test fakes. Verify locally: gradlew test buildPlugin (JDK21, --no-build-cache after the interface change). — ↩ rollbackable

**Backward compat:** The DaemonGateway INTERFACE gains a new method debugStatus() — additive, but every existing impl (DaemonGatewayImpl real, DaemonGatewayService delegate, and the daemon test fakes) must add the override (a compile-forced fanout, exactly as sc2 daemonStatus() did across the 6 impls; grep `override fun daemonStatus(` = the inventory). No EXISTING method signature changes and no behavior change to daemonStatus()/the action IPCs, so no runtime backward-incompatibility — only the new-method override is required. sc3 is consumed unchanged (no interface change). The daemon is untouched (the debug-status IPC already ships). DebugConfigurable's <applicationConfigurable> id is unchanged; the sections() list only grows by one.

## Alternatives considered

### a1: DaemonGateway sealed debug-status read + pure host-registration reader + sc3 section — **CHOSEN**

Add a sealed debugStatus() to DaemonGateway over the shipped daemon.debug-status IPC (attached sessions), a pure McpRegistrationReader projecting per-host {present, registered} from the existing detectPresent() + an injected config-read seam, and an McpDebugSection (sc3 DebugSection) that DebugConfigurable.sections() appends and renders read-only with an unavailable line.

DaemonGateway grows a new read method mirroring daemonStatus(): a sealed `DebugStatusResult { Loaded(sessions: List<AttachedSessionDto>) | Unavailable(reason) }` where AttachedSessionDto = {id:Long, label:String, pid:Long?, connectedAtMs:Long, lastMethod:String?} parsed from the `clients[]` payload (Gson Double->Long coercion) and sorted by connectedAtMs; reuses the injectable DaemonRpc with METHOD_DEBUG_STATUS='daemon.debug-status'; DaemonUnavailableException/!ok/error/RuntimeException -> Unavailable; never throws. A pure `McpRegistrationReader` folds AiHostAdapter.detectPresent():List<AiHost> with an injected `isInsrcRegistered: (mcpConfigPath) -> Boolean` (a tiny local read of the mcpServers.insrc key) into a per-host `McpHostStatusDto {kind, present, registered}` over the closed AiHostKind union. A new S005-internal `McpDebugSection` implements the sc3 DebugSection (title + off-EDT-built component) rendering a per-host registration table + the attached-sessions table via ui/InsrcCollapsible, strictly read-only (no disconnect/terminate control), with a clear 'daemon unreachable' line when debugStatus() is Unavailable (ac1). DebugConfigurable.sections() APPENDS this section to its ordered list (the sc3 section-additive contract) — S004's status/orphan sections unchanged.

### a2: CLI-parity live MCP status via spawning `<cli> mcp list` per client

Reproduce the CLI mcpStatus exactly — spawn `<cli> mcp list` for each known client (claude/codex), parse registered+connected from stdout — plus the debug-status attached-sessions read.

Instead of the plugin's host-detection, S005 spawns the claude/codex CLI binaries with `mcp list` per render (mirroring debug.ts mcpStatusWith + parseMcpList), parsing the `insrc` server line for registered/connected, and combines that with the daemon.debug-status attached-sessions read; the section renders both.

**Rejected because:** Uses the WRONG client universe (spawns claude/codex, not the plugin's own AiHostKind {AI_ASSISTANT, JUNIE} hosts — ignoring the boundary's 'plugin's existing host-detection') and a heavy per-render CLI subprocess the plugin was explicitly designed not to reimplement (partial ac1/k1/k2), and is far harder to unit-test than an injected detectPresent()+config-read.

### a3: Inline the debug-status rpc + registration read directly in the section (no gateway method, no reader seam)

Do the daemon.debug-status rpc and the mcpServers.insrc read inline inside the McpDebugSection, with no DaemonGateway method and no pure registration reader.

The McpDebugSection opens the DaemonRpc / reaches JsonMcpConfigWriter internals directly in its component() body and formats the result inline — no sealed DebugStatusResult on DaemonGateway, no injectable McpRegistrationReader.

**Rejected because:** Breaks the HLD's chosen shape ('the DaemonGateway grows in-place sealed *Result IPC methods') by putting a raw rpc + JSON parse in a Swing section, and leaves the Unavailable/Gson-Double parse + the registration projection UNTESTABLE (no gateway seam / no pure reader to inject a fake into) — partial ac1/k2; it also couples to JsonMcpConfigWriter's private internals.

## Citations

- **[[c1]]** `analyze-bundle` `s1 external-contract — daemon.debug-status IPC {clients:AttachedClient[]} (index.ts:937; types.ts:835; server.ts:84); the CLI attachedClientsWith`
- **[[c2]]** `analyze-bundle` `s1 symbol.locate — AiHostAdapter.detectPresent():List<AiHost> over AiHostKind {AI_ASSISTANT,JUNIE}; mcpServers.insrc registration (JsonMcpConfigWriter)`
- **[[c3]]** `analyze-bundle` `s1 convention.detect — sc3 section-additive consumption + the daemonStatus() sealed-result gateway idiom + off-EDT render (InsrcCollapsible)`
- **[[c4]]** `analyze-bundle` `s1 test.locate — DaemonStatusGatewayTest/Sc2DaemonGatewayTest fake-DaemonRpc + DebugPageTest source-scan idioms`
- **[[c5]]** `prior-artifact` `HLD 57298940cdc341bc sc3 (DebugPageHost) ownedByStory s4, consumed by s5; existingCapabilityRefs c5 = host-detection`

<!-- insrc:review -->

## Review

### ✅ Review `PASS` — design.story (design.story)

**0 HIGH · 0 MED · 10 LOW** · model `client` · reviewed 2026-09-21T11:38:59.081Z

| Ref | Kind | Severity | Fixability | Premise | Evidence | Action |
| --- | --- | --- | --- | --- | --- | --- |
| c1 | external-contract | LOW | auto | The daemon registers the 'daemon.debug-status' IPC returning { clients: AttachedClient[] } at src/daemon/index.ts around line 937. | READ src/daemon/index.ts:937 found=True and grep 'daemon.debug-status' returned a source match — the daemon.debug-status IPC returning { clients: AttachedClient[] } ships as cited. | None — citation resolves. |
| c2 | citation | LOW | auto | The AttachedClient interface { id, label, pid?, connectedAt, lastMethod? } is declared in src/shared/types.ts around line 835. | READ src/shared/types.ts:835 found=True; grep 'interface AttachedClient' matched in source. The AttachedClient interface is declared where cited. | None — citation resolves. |
| c3 | citation | LOW | auto | The daemon server exposes attachedClients(): AttachedClient[] at src/daemon/server.ts around line 84, which the debug-status handler returns. | READ src/daemon/server.ts:84 found=True — attachedClients(): AttachedClient[] exists at the cited line, backing the debug-status handler. | None — citation resolves. |
| c4 | closed-union | LOW | auto | The plugin's MCP-client universe is the closed AiHostKind union {AI_ASSISTANT, JUNIE}, detected via AiHostAdapter.detectPresent(): List<AiHost>. | grep 'enum class AiHostKind' matched exactly once in source and 'fun detectPresent' matched in source — the closed AiHostKind union {AI_ASSISTANT, JUNIE} and AiHostAdapter.detectPresent() exist as described. | None — closed-union holds. |
| c5 | citation | LOW | auto | JsonMcpConfigWriter writes/removes under the mcpServers.insrc key and exposes no public read helper; McpRegistrationReader reads the mcpServers.insrc key itself without reaching JsonMcpConfigWriter internals. | grep 'class JsonMcpConfigWriter' matched in source and 'mcpServers' matched broadly — JsonMcpConfigWriter operates on the mcpServers.insrc key; the reader's own key read (no writer-internals reach) is consistent with the source. | None — citation resolves. |
| c6 | citation | LOW | auto | DaemonGateway exposes a sealed daemonStatus() result idiom (DaemonStatusResult sealed with Loaded/Stopped/Unavailable, fun daemonStatus()) which the new debugStatus() mirrors. | grep 'DaemonStatusResult' and 'fun daemonStatus' resolve in source (DaemonGateway.kt override at :975 confirms the sealed daemonStatus() idiom the new debugStatus() mirrors). | None — idiom citation resolves. |
| c7 | cross-artifact | LOW | auto | S004's DebugConfigurable (class DebugConfigurable : InsrcOpsConfigurable(), DebugPageHost) is the existing Debug page that S005 appends its MCP section to via sections(). | grep 'class DebugConfigurable' and 'DebugPageHost' matched in source — S004's DebugConfigurable : InsrcOpsConfigurable(), DebugPageHost with a sections() method exists as the append target. | None — cross-artifact trace to S004 holds. |
| c8 | citation | LOW | auto | The sc3 DebugPageHost seam defines interface DebugSection {title/component} + interface DebugPageHost {sections} in the debug package, which McpDebugSection implements. | grep 'interface DebugSection', 'interface DebugPageHost', 'fun title', 'fun component' all matched in source — the sc3 DebugSection/DebugPageHost seam exists with title/component as McpDebugSection implements. | None — citation resolves. |
| c9 | inventory | LOW | auto | Adding debugStatus() to the DaemonGateway interface forces the override across every existing impl (real + delegate + test fakes), the same compile-forced fanout the sc2 daemonStatus() override already spans (grep override fun daemonStatus). | grep 'override fun daemonStatus' matched real source files (DaemonGateway.kt:975, DaemonGatewayService.kt:64), confirming the compile-forced override fanout the new debugStatus() replicates. | None — inventory/fanout claim holds. |
| c10 | semantic | LOW | auto | The daemonStatus() gateway sends its request via an injectable DaemonRpc with a METHOD constant (mirroring METHOD_DEBUG_STATUS='daemon.debug-status' the new method uses), and coerces Gson Double->Long for numeric fields. | grep 'DaemonRpc', 'daemon.status', and 'toLong' resolve in source (toLong coercion present in plugin sources). The specific constant name METHOD_DAEMON_STATUS is not load-bearing (my probe guess); the injectable-DaemonRpc + Gson Double->Long coercion idiom the debugStatus() mirrors is confirmed. | None — semantic idiom holds. |
