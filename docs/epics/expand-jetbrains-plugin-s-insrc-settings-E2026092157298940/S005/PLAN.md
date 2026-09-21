<!-- insrc:artifact PLAN-57298940cdc341bc-s5 -->

# Plan: E2026092157298940:S005

**Epic:** `expand-jetbrains-plugin-s-insrc-settings`
**LLD run:** `wf-1789990038657-p988fx`
**LLD effective hash:** `7b17d6a14b2a...`

## Tasks

| # | Task | Size | Depends on | Tests | Derived from |
| :--- | :--- | :--- | :--- | :--- | :--- |
| 1 | **`t1`** Add DaemonGateway.debugStatus() read + DebugStatusResult/AttachedSessionDto + the daemonStatus-parity impl fanout | M | — | unit: McpDebugStatusGatewayTest.loadedSortedAndCoerced (RecordingRpc canned {clients:[...]} Gson-Double + omitted pid/lastMethod -> Loaded sorted by connectedAtMs); unit: McpDebugStatusGatewayTest.unavailableOnUnreachableNotOkAndMalformed (DaemonUnavailableException / !ok / non-array clients -> Unavailable, never throws) | [[c1]] [[c2]] |
| 2 | **`t2`** Add McpRegistrationReader + McpHostStatusDto (detectPresent fold + mcpServers.insrc read) | M | — | unit: McpRegistrationReaderTest.perHostRegisteredFromMcpServersInsrc (injected detectPresent [AI_ASSISTANT,JUNIE] + temp JSON present/absent -> registered true/false, detectPresent order); unit: McpRegistrationReaderTest.foldsFailuresNeverThrows (malformed/unreadable config -> registered=false; detectPresent failure -> empty list) | [[c3]] [[c4]] |
| 3 | **`t3`** Add McpDebugSection (sc3 DebugSection) rendering the two read-only tables + unavailable line | M | `t1`, `t2` | unit: DebugPageTest.mcpSectionReadsGatewayAndReaderRendersUnavailableLine (source-scan: McpDebugSection implements DebugSection, uses debugStatus()+McpRegistrationReader, has an unreachable/unavailable line); unit: DebugPageTest.mcpSectionHasNoDisconnectOrTerminateControl (source-scan: no disconnect/terminate/JButton-action / no daemon-mutating IPC — read-only, ac2/k3) | [[c5]] [[c1]] |
| 4 | **`t4`** Append the McpDebugSection to DebugConfigurable.sections() | S | `t3` | unit: DebugPageTest.sectionsAppendsMcpAfterStatusAndOrphans (source-scan: sections() -> [Status, Orphans, Mcp]; S004's two sections unchanged; parent page + plugin.xml untouched) | [[c5]] |
| 5 | **`t5`** Add gateway + reader tests, extend DebugPageTest, and verify locally | M | `t1`, `t2`, `t3`, `t4` | unit: McpDebugStatusGatewayTest (assembled: Loaded sorted+coerced / Unavailable unreachable+!ok+malformed / never-throws); unit: McpRegistrationReaderTest (assembled: present/absent/malformed registration + empty detect + the mcpServers.insrc key-read helper); unit: DebugPageTest (extended source-scan: MCP section appended + read-only + unavailable line + fanout stub on each t1-inventory fake); smoke: gradlew test buildPlugin green locally on JDK21 (--no-build-cache after the interface change) | [[c6]] [[c5]] |

### E2026092157298940:S005:T001 — Add DaemonGateway.debugStatus() read + DebugStatusResult/AttachedSessionDto + the daemonStatus-parity impl fanout

Add the sealed DebugStatusResult{Loaded(sessions:List<AttachedSessionDto>)|Unavailable(reason:String)} + AttachedSessionDto{id:Long,label:String,pid:Long?,connectedAtMs:Long,lastMethod:String?} to DaemonGateway.kt, and the interface method debugStatus():DebugStatusResult with the real DaemonGatewayImpl impl (METHOD_DEBUG_STATUS='daemon.debug-status', emptyMap params; parse the reply Map's clients[] via `(m["id"] as? Number)?.toLong()` / connectedAt / pid + String? label/lastMethod, matching DaemonGateway.kt:1201; sort by connectedAtMs asc; DaemonUnavailableException/!ok/RuntimeException -> Unavailable; never throws) + the DaemonGatewayService delegate override. Per the s3 critique, do NOT trust the remembered '6-impl' count: at build time grep every `override fun daemonStatus(` site + the interface itself to derive the real inventory, then add a compile-forced `override fun debugStatus() = DebugStatusResult.Unavailable("not used")` stub to each non-real impl the interface change breaks.

**Acceptance checks:**
- DebugStatusResult + AttachedSessionDto match the LLD field shapes; debugStatus() added to the DaemonGateway interface + real impl + DaemonGatewayService delegate
- The real impl sends METHOD_DEBUG_STATUS='daemon.debug-status' with empty params, parses clients[] with Number->Long coercion sorted by connectedAtMs, and classifies unreachable/!ok/malformed -> Unavailable; never throws
- Inventory is re-derived at build time (grep every `override fun daemonStatus(` + the interface), a debugStatus() override is added to each such impl incl. the daemon test fakes, and the module compiles; no daemon/CI change (k1)

### E2026092157298940:S005:T002 — Add McpRegistrationReader + McpHostStatusDto (detectPresent fold + mcpServers.insrc read)

Add jetbrains-plugin/.../debug/McpRegistrationReader.kt (+ McpHostStatusDto{kind:AiHostKind,present:Boolean,registered:Boolean}) as a pure fold over an injected detectPresent:()->List<AiHost> + an injected isInsrcRegistered:(mcpConfigPath)->Boolean (default = a small mcpServersInsrcPresent Gson key-read: true iff mcpServers.insrc present; per-host swallow -> registered=false). detectPresent failure -> empty list; never throws. Per the s3 critique, the default detectPresent provider MUST bind to the REAL AiHostAdapter host-detection accessor resolved at build time (grep the actual service class / AiHostAdapterImpl / companion) — the LLD's `service<AiHostAdapterService>()` is a placeholder; the injected-seam shape (detectPresent:()->List<AiHost>) stays unchanged so the reader is testable regardless of what the default resolves to.

**Acceptance checks:**
- read() returns one McpHostStatusDto per detected host (present=true) with registered = mcpServers.insrc present in mcpConfigPath, in detectPresent() order
- A per-host unreadable/malformed config folds to registered=false (not a throw); a detectPresent() failure yields an empty list
- The default detectPresent provider is bound to the REAL resolved AiHostAdapter accessor (not the placeholder service name) and the module compiles; read-only — no host file written, no reach into JsonMcpConfigWriter private internals (k3)

### E2026092157298940:S005:T003 — Add McpDebugSection (sc3 DebugSection) rendering the two read-only tables + unavailable line

Add jetbrains-plugin/.../debug/McpDebugSection.kt implementing the sc3 DebugSection (title 'MCP clients' + off-EDT component()): a per-host registration table (kind/present/registered from McpRegistrationReader.read()) + an attached-sessions table (id/label/pid/connected-at/last-method from gateway.debugStatus() Loaded), a clear 'daemon unreachable: <reason>' line on Unavailable (ac1), and empty-state labels for no-hosts / no-sessions. Strictly read-only via ui/InsrcCollapsible — NO disconnect/terminate/JButton-action control (ac2/k3). Ctor takes (DaemonGateway, McpRegistrationReader) for injectability.

**Acceptance checks:**
- McpDebugSection implements DebugSection and renders the registration + attached-sessions tables read-only via InsrcCollapsible
- debugStatus() Unavailable -> a clear unreachable line (not a blank); reachable-with-zero -> 'no sessions attached'; no hosts -> 'no MCP hosts detected'
- No disconnect/terminate/JButton-action control and no daemon-mutating IPC anywhere in the section (ac2/k3)

### E2026092157298940:S005:T004 — Append the McpDebugSection to DebugConfigurable.sections()

Edit DebugConfigurable.sections() to return listOf(statusSection(), orphansSection(), mcpSection()) — appending exactly one element (the sc3 section-additive consumption). S004's status/orphan sections + the buildBody() render loop (which already iterates sections()) are unchanged; the parent settings page + plugin.xml stay byte-unchanged (k4).

**Acceptance checks:**
- sections() now returns [Status, Orphans, Mcp] with the MCP section appended last; S004's two sections unchanged
- Still `class DebugConfigurable : InsrcOpsConfigurable(), DebugPageHost`; InsrcSettingsConfigurable + plugin.xml untouched (k4)
- No new mutating control on the page — the epic's single mutation stays S004's orphan kill (k3)

### E2026092157298940:S005:T005 — Add gateway + reader tests, extend DebugPageTest, and verify locally

Add McpDebugStatusGatewayTest.kt (RecordingRpc fake: canned {clients:[...]} with Gson-Double numbers + omitted optional pid/lastMethod -> Loaded sorted by connectedAtMs; DaemonUnavailableException/!ok/malformed -> Unavailable) + McpRegistrationReaderTest.kt (injected detectPresent list + empty; temp mcpConfig JSON mcpServers.insrc present/absent/malformed -> registered true/false/false) + extend DebugPageTest.kt (source-scan: DebugConfigurable.sections() appends the MCP section; McpDebugSection read-only + unavailable line + no disconnect/terminate). Verify locally: gradlew test buildPlugin (JDK21, --no-build-cache after the interface change). The debugStatus() stub override goes on whatever DaemonGateway test fakes the t1 inventory grep turned up (not an assumed count).

**Acceptance checks:**
- McpDebugStatusGatewayTest covers Loaded(sorted+coerced)/Unavailable(unreachable/!ok/malformed)/never-throws
- McpRegistrationReaderTest covers present/absent/malformed registration + empty detect
- DebugPageTest source-scan asserts the appended MCP section + read-only + unavailable line; every DaemonGateway test fake from the t1 inventory carries a debugStatus() stub
- Full jetbrains-plugin test + buildPlugin green locally on JDK21

## Test-strategy coverage

| LLD strategy item | Covered by |
| :--- | :--- |
| DaemonGatewayImpl.debugStatus (RecordingRpc fake returning a canned {clients:[...]}, an {error}/!ok reply, a throwing rpc, and a malformed payload) | `t1`, `t5` |
| McpRegistrationReader.read (injected detectPresent + isInsrcRegistered providers) | `t2`, `t5` |
| the mcpServers.insrc key read helper (over temp JSON) | `t2`, `t5` |
| McpDebugSection.kt source text (implements DebugSection, uses DaemonGateway.debugStatus + McpRegistrationReader, an 'unreachable'/unavailable line, no disconnect/terminate/JButton-action) | `t3`, `t5` |
| DebugConfigurable.kt source text (sections() appends the MCP section; Status/Orphans unchanged) | `t4`, `t5` |

## Citations

- **[[c1]]** `prior-artifact` `LLD s5 contractDetails.api DaemonGateway.debugStatus():DebugStatusResult(Loaded(sessions)|Unavailable) over daemon.debug-status + AttachedSessionDto`
- **[[c2]]** `analyze-bundle` `plan s1 gateway-fanout-sizing: the daemonStatus-parity impl inventory (grep `override fun daemonStatus(`) + the Gson Double->Long coercion idiom `(m[x] as? Number)?.toLong()` at DaemonGateway.kt:1201`
- **[[c3]]** `prior-artifact` `LLD s5 contractDetails.api McpRegistrationReader.read():List<McpHostStatusDto{kind,present,registered}> + dataModelChanges McpHostStatusDto over AiHostKind {AI_ASSISTANT, JUNIE}`
- **[[c4]]** `analyze-bundle` `plan s1 registration-reader-sizing: the real AiHostAdapter host-detection accessor (resolve; LLD service<AiHostAdapterService>() is a placeholder) + the mcpServers.insrc key-read helper, no JsonMcpConfigWriter-private reach`
- **[[c5]]** `prior-artifact` `LLD s5 contractDetails.api McpDebugSection.component() (sc3 DebugSection, read-only, unavailable line) + DebugConfigurable.sections() append + interactionWithShared sc3 consume (k3/k4)`
- **[[c6]]** `prior-artifact` `LLD s5 testStrategy: JUnit5 fake-DaemonRpc gateway test + injected-seam reader test + DebugPageTest source-scan idiom; local gradlew test buildPlugin gate`

<!-- insrc:review -->

## Review

### ✅ Review `PASS` — plan (plan)

**0 HIGH · 0 MED · 9 LOW** · model `client` · reviewed 2026-09-21T11:48:22.932Z

| Ref | Kind | Severity | Fixability | Premise | Evidence | Action |
| --- | --- | --- | --- | --- | --- | --- |
| s5/t1 | citation | LOW | auto | DaemonGateway.kt carries the daemonStatus() sealed-result idiom and the Gson Number->Long coercion `(m[x] as? Number)?.toLong()` that debugStatus() must mirror, with the coercion around DaemonGateway.kt:1201. | The Gson Number->Long coercion pattern `as? Number)?.toLong()` resolves to real plugin code (4 hits) and the DaemonGateway.kt:1201 read anchor was found; `fun daemonStatus(` is present as the sealed-result idiom debugStatus() will mirror. The citation is grounded. | None — t1 correctly mirrors an existing, verified idiom. |
| s5/t1 | inventory | LOW | manual | The number of DaemonGateway impls that must gain a debugStatus() override is the set of sites that already override daemonStatus() plus the interface declaration; t1 explicitly re-derives this inventory at build time rather than trusting a fixed count of 6. | `override fun daemonStatus(` matches across code and docs (the S002 LLD even records 'exactly 6 DaemonGateway impls'), but the plan deliberately does NOT hard-code a count: t1's acceptance check re-derives the inventory at build time by grepping every override site + the interface. This removes the miscount risk rather than leaning on the remembered 6. | None — the build-time re-derivation instruction is the correct hedge; the builder must actually run the grep. |
| s5/t1 | external-contract | LOW | auto | The daemon exposes a 'daemon.debug-status' IPC method returning { clients: AttachedClient[] }, already shipped and consumed by the CLI, so t1 only adds a client-side gateway read over an existing method (no daemon change, k1). | `daemon.debug-status` (50 hits), `interface AttachedClient` (4) and the src/shared/types.ts:835 read anchor confirm the IPC + payload already ship and are consumed by the CLI; t1 adds only a client-side read (no daemon change, k1). External contract grounded. | None. |
| s5/t2 | semantic | LOW | assisted | The plugin's MCP-client universe is the AiHostKind union {AI_ASSISTANT, JUNIE} detected via an AiHostAdapter host-detection accessor (detectPresent), NOT the CLI's claude/codex; t2's default detectPresent must bind to the real accessor since the LLD's service<AiHostAdapterService>() is a placeholder. | `enum class AiHostKind` (2), `AI_ASSISTANT`/`JUNIE`, `fun detectPresent(` (10) and `class AiHostAdapter` (1) resolve to real plugin code including jetbrains-plugin/.../host/AiHostAdapterImpl.kt:15. The plugin's MCP-client universe {AI_ASSISTANT, JUNIE} and the detectPresent accessor exist; t2 flags binding the default to the real accessor (LLD's service<AiHostAdapterService>() is a placeholder) as a build-time gate. | None — but the builder MUST resolve the concrete accessor (AiHostAdapterImpl / its service) rather than emit the placeholder symbol. |
| s5/t2 | semantic | LOW | auto | MCP registration for a host is determined by whether its mcpConfigPath JSON carries the mcpServers.insrc key; t2 reads this key read-only without reaching into JsonMcpConfigWriter private internals. | `mcpServers`, `class JsonMcpConfigWriter` (3) and `mcpConfigPath` resolve to real code; t2's read-only mcpServers.insrc key-read over the host's config (no JsonMcpConfigWriter-private reach) is consistent with the existing surface. | None. |
| s5/t3 | cross-artifact | LOW | auto | sc3 is the DebugPageHost/DebugSection contract owned by S004; S005 consumes it by adding one DebugSection (McpDebugSection) rendered off-EDT via ui/InsrcCollapsible, strictly read-only. | `interface DebugSection`, `interface DebugPageHost`, `fun sections()` and `object InsrcCollapsible` (jetbrains-plugin/.../ui/InsrcCollapsible.kt:23) all resolve; sc3 and the collapsible render idiom S005 consumes exist as owned by S004. | None. |
| s5/t4 | semantic | LOW | auto | DebugConfigurable currently returns exactly two sc3 sections (statusSection(), orphansSection()); t4 appends a third (mcpSection()) and changes nothing else, keeping the parent settings page and plugin.xml byte-unchanged (k4). | `listOf(statusSection(), orphansSection())` matches (DebugConfigurable.kt:43, directly confirmed by file read) and the read anchor was found; DebugConfigurable currently returns exactly two sc3 sections, so t4's single-element append is a minimal, accurate edit. | None. |
| s5 | ordering | LOW | auto | Task order is a valid topological sort: t1,t2 have no deps; t3 depends on t1,t2; t4 depends on t3; t5 depends on t1,t2,t3,t4 — acyclic with strictly increasing order. | By inspection the dependsOn graph is acyclic and order 1..5 is a valid topological sort: t1,t2 roots -> t3(t1,t2) -> t4(t3) -> t5(all). No probe needed; the sequencing is internally consistent. | None. |
| s5 | inventory | LOW | auto | The single mutation across the whole epic remains S004's confirm-gated orphan kill; S005 adds no disconnect/terminate/mutating control (ac2/k3), so no new addActionListener/JButton-action for a mutation appears in the MCP section. | `addActionListener`/`disconnect`/`terminate`/`destroy()` hits are all pre-existing sites (e.g. DaemonConfigurable, S004 orphan kill) elsewhere in the repo, not the not-yet-written MCP section. The read-only constraint (no new mutating control in McpDebugSection) is a forward-looking invariant enforced by t3/t5 source-scan tests, not a present-state defect. | None — the ac2/k3 read-only guard is carried by the source-scan tests in t3/t5. |
