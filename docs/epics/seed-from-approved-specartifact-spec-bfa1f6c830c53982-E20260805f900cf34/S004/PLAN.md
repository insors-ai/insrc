<!-- insrc:artifact PLAN-f900cf34c0342d4f-s4 -->

# Plan: E20260806f900cf34:S004

**Epic:** `seed-from-approved-specartifact-spec-bfa1f6c830c53982`
**LLD run:** `wf-1786003781032-qjmy7p`
**LLD effective hash:** `ddca67745f5c...`

## Tasks

| # | Task | Size | Depends on | Tests | Derived from |
| :--- | :--- | :--- | :--- | :--- | :--- |
| 1 | **`t1`** Add IpcRequest.client envelope + AttachedClient shared type | S | — | integration: IpcRequest.client is optional/additive: an existing rpc call with no client envelope still type-checks (whole-tree tsc) | [[c1]] [[c2]] |
| 2 | **`t2`** Add the in-memory connection registry to IpcServer | M | `t1` | unit: IpcServer registry: a new connection creates an entry (monotonic id + injected-clock connectedAt), labelled 'unknown' until a message identifies it; unit: IpcServer registry: handleMessage with request.client={label,pid}+method updates label/pid/lastMethod; attachedClients() reflects it; unit: IpcServer registry: socket 'close' deletes the entry; double-close / close-before-message is an idempotent no-op; unit: IpcServer registry: a malformed request.client (missing/non-integer pid, empty/oversized label) is ignored — stays 'unknown'/pid undefined; unit: IpcServer.attachedClients() returns entries sorted by connectedAt and never mutates/closes any connection (k5) | [[c3]] |
| 3 | **`t3`** Register the read-only daemon.debug-status handler | S | `t2` | unit: daemon.debug-status handler returns { clients } from a stub IpcServer.attachedClients() and has no side effects (k1/k5) | [[c4]] |
| 4 | **`t4`** Populate the client identity envelope in the rpc + mcp producers | S | `t1` | unit: rpc() writes an IpcRequest carrying client={label:'cli', pid:process.pid} (asserted against a captured socket write with an injected connection seam) | [[c1]] [[c5]] |
| 5 | **`t5`** Widen the DebugService facade with attachedClients + mcpStatus (types + impls + binding) | L | `t1` | unit: mcpStatusWith: canned claude+codex mcp-list output with an insrc line + connection-state token -> per client {registered:true, connected:<parsed>, available:true}; unit: mcpStatusWith: stdout with NO insrc line -> {registered:false, connected:false, available:true}; unit: mcpStatusWith: a runner spawnError / non-zero exit for one client -> {available:false,...} while the OTHER client is still evaluated (never throws); unit: mcpStatusWith: exactly one McpClientStatus per known client (claude, codex), never omitted; unit: attachedClientsWith: a resolving rpc -> {reachable:true; clients} (sorted); a rejecting rpc -> {reachable:false} without throwing; unit: makeServices().debug exposes attachedClients + mcpStatus bound to the real impls | [[c2]] [[c6]] [[c7]] [[c8]] |
| 6 | **`t6`** Add the MCPSection component + wire it into DebugPane | L | `t5` | unit: MCPSection: renders per-client rows from mcpStatus() showing registered + connected independently; registered-but-not-connected case; unit: MCPSection: renders the attachedClients() list with label + pid + connected-at; empty non-self set -> 'no other sessions attached'; unit: MCPSection: a {reachable:false} attachedClients() renders 'daemon unreachable' while the mcp rows still show; unit: MCPSection: no keypress disconnects/terminates a client; only `r` refresh + section-nav honoured (ac3/k5); unit: MCPSection: the poll interval is cleared on unmount (no post-unmount setState); integration: DebugPane 'mcp' section maps to <MCPSection/> (the s1 placeholder is gone) | [[c9]] [[c10]] |
| 7 | **`t7`** Update the in-repo debug-facade test fakes for attachedClients/mcpStatus | S | `t5` | integration: Every in-repo debug facade fake (tui/command/DebugPane/DaemonSection/MCPSection) carries attachedClients + mcpStatus stubs so the widened DebugService compiles | [[c6]] |

### E20260806f900cf34:S004:T001 — Add IpcRequest.client envelope + AttachedClient shared type

In src/shared/types.ts add the OPTIONAL `client?: { readonly label: string; readonly pid: number }` field to IpcRequest and the new `AttachedClient { readonly id: number; readonly label: string; readonly pid?: number; readonly connectedAt: number; readonly lastMethod?: string }` interface. Purely additive — every existing caller/handler stays valid with the field absent.

**Acceptance checks:**
- IpcRequest gains an optional `client` object (readonly label + pid); existing fields unchanged and every current rpc call still type-checks
- AttachedClient is exported from shared/types.ts with id/label/pid?/connectedAt/lastMethod?
- tsc compiles

### E20260806f900cf34:S004:T002 — Add the in-memory connection registry to IpcServer

In src/daemon/server.ts add a private Map<Socket,ConnInfo> + a monotonic id counter + an injected `now` clock (3rd constructor arg, defaulting to a real epoch-ms clock). handleConnection creates an entry (id, connectedAt=now(), label 'unknown') and adds a socket.on('close') that deletes it; handleMessage updates the entry from a VALIDATED request.client (finite positive pid + non-empty bounded label, else ignored) + request.method (lastMethod). Add public attachedClients(): AttachedClient[] returning the snapshot sorted by connectedAt. Read-only, in-memory; no existing request-handling behaviour changes, and no code path ever closes a peer connection (k5).

**Acceptance checks:**
- A new connection registers an entry (monotonic id + connectedAt from the injected clock), labelled 'unknown' until a message identifies it
- handleMessage with request.client={label,pid}+method updates label/pid/lastMethod; a malformed client envelope is ignored (stays 'unknown'/pid undefined)
- socket 'close' deletes the entry; a double-close / close-before-message is an idempotent no-op (no throw)
- attachedClients() returns entries sorted by connectedAt and never mutates or closes a connection (k5)
- Existing data/error handling + stream handling is unchanged; tsc compiles

### E20260806f900cf34:S004:T003 — Register the read-only daemon.debug-status handler

In src/daemon/index.ts register a new 'daemon.debug-status' RpcHandler as a peer of 'daemon.status' in the handler map, returning { clients: server.attachedClients() } from the IpcServer instance constructed at index.ts:452. Read-only; no side effects, no persistence.

**Acceptance checks:**
- 'daemon.debug-status' is registered in the index.ts handler map and returns { clients: AttachedClient[] } from the live IpcServer registry
- The handler has no side effects and never closes/mutates a connection (k1/k5)
- tsc compiles; existing handlers untouched

### E20260806f900cf34:S004:T004 — Populate the client identity envelope in the rpc + mcp producers

Set IpcRequest.client on the producer path(s): src/cli/client.ts rpc() writes `client: { label: 'cli', pid: process.pid }` (client.ts:17); if the insrc-mcp server has its OWN daemon-rpc client, it writes `client: { label: 'mcp:<clientName>', pid: process.pid }`. Build note: first grep for the insrc-mcp daemon-client call site — if it reuses cli/client.ts rpc() there is no second edit and t4 collapses to the rpc() change (CLI connections still labelled). Producers only — no reader/behaviour change; an unlabelled producer simply shows 'unknown'.

**Acceptance checks:**
- rpc() attaches client={label:'cli', pid:process.pid} to every request it writes
- If the insrc-mcp server has a distinct daemon-client, it attaches client={label:'mcp:<client>', pid:process.pid}; if it reuses rpc(), that is documented and sufficient
- No external signature/behaviour change to rpc(); tsc compiles

### E20260806f900cf34:S004:T005 — Widen the DebugService facade with attachedClients + mcpStatus (types + impls + binding)

Add DebugStatusModel (discriminated reachable/unreachable) + McpClientStatus to src/cli/services/debug-types.ts and widen the DebugService interface with attachedClients(): Promise<DebugStatusModel> + mcpStatus(): Promise<readonly McpClientStatus[]>. In src/cli/services/debug.ts add injectable-deps cores: attachedClientsWith(deps) (rpc seam → folds resolve to {reachable:true;clients sorted}, reject to {reachable:false}, never throws) and mcpStatusWith(deps) (per claude/codex, injectable runCli → parse insrc-line=registered + connection-state token=connected, spawnError/non-zero → available:false, never throws, always one entry per client) + zero-arg facade wrappers over realDeps, bound onto the makeServices() debug entry. Build note: land WITH t7 (the fakes) in one increment.

**Acceptance checks:**
- DebugService interface gains attachedClients() + mcpStatus(); DebugStatusModel + McpClientStatus are exported from debug-types.ts
- attachedClientsWith folds a resolving rpc → {reachable:true;clients} (sorted) and a rejecting rpc → {reachable:false} without throwing
- mcpStatusWith returns exactly one McpClientStatus per claude/codex from canned mcp-list output (registered + connected independent); a spawnError/non-zero client → available:false; never throws
- makeServices().debug.attachedClients + .mcpStatus are bound to the real impls; no real subprocess/socket runs in unit tests (deps injected)
- tsc compiles

### E20260806f900cf34:S004:T006 — Add the MCPSection component + wire it into DebugPane

Add src/cli/panes/MCPSection.tsx: renders (a) the per-client mcp registration/connection rows from mcpStatus() on mount/refresh (ac1) and (b) the attached-socket-client list from attachedClients() with label + pid + connected-at, polled while open with the interval cleared on unmount (ac2); a { reachable:false } shows a 'daemon unreachable' line while the mcp rows still render; strictly read-only — only `r` refresh + the pane's section-nav, NO disconnect/terminate control (ac3/k5). Swap DebugPane's SECTION_VIEWS mcp entry from the placeholder to <MCPSection services={{ debug }} />.

**Acceptance checks:**
- MCPSection renders per-client registered + connected rows (independently) from mcpStatus() (ac1)
- MCPSection renders the attachedClients() list with label + pid + connected-at and polls while open; the poll interval is cleared on unmount (ac2)
- A { reachable:false } attachedClients() renders a 'daemon unreachable' line while the mcp rows still show; empty non-self set → 'no other sessions attached'
- No keypress disconnects/terminates a client — only `r` refresh + section-nav (ac3/k5); DebugPane's mcp section maps to <MCPSection/> (placeholder gone)
- tsc compiles

### E20260806f900cf34:S004:T007 — Update the in-repo debug-facade test fakes for attachedClients/mcpStatus

Add conformant attachedClients + mcpStatus stubs to every in-repo `debug` facade fake so the widened DebugService compiles: fakeServices() in tui.test.ts, the ctxWith base in command.test.ts, and the props built in DebugPane.test.ts + DaemonSection.test.ts (defaults attachedClients → {reachable:false}, mcpStatus → []). Build note: apply together-with t5 in ONE increment (mirrors s2/s3 t5); dependsOn stays [t5] (the true compile dependency).

**Acceptance checks:**
- Every in-repo debug-facade fake includes attachedClients + mcpStatus stubs returning valid DebugStatusModel / McpClientStatus[]
- `npx tsx --test 'src/cli/**/*.test.ts'` compiles against the widened DebugService
- No existing assertion behaviour changes beyond the additive stubs

## Test-strategy coverage

| LLD strategy item | Covered by |
| :--- | :--- |
| IpcServer registry: a new connection creates an entry with a monotonic id + connectedAt from the injected clock; attachedClients() returns it labelled 'unknown' until a message identifies it | `t2` |
| IpcServer registry: a handleMessage carrying request.client={label,pid} + method updates that connection's label/pid/lastMethod; attachedClients() reflects it | `t2` |
| IpcServer registry: a socket 'close' deletes the entry; a double 'close' / close-before-message is an idempotent no-op (no throw, no ghost entry) | `t2` |
| IpcServer registry: a malformed request.client (missing/non-integer pid, empty/oversized label) is ignored — the connection stays 'unknown'/pid undefined (untrusted wire input never stored) | `t2` |
| attachedClients() returns entries sorted by connectedAt and never mutates/closes any connection (k5 — no disconnect counterpart) | `t2` |
| mcpStatusWith: canned claude+codex `mcp list` output with an `insrc` line + a connection-state token -> per client { registered:true, connected:<parsed>, available:true } | `t5` |
| mcpStatusWith: stdout with NO insrc line -> { registered:false, connected:false, available:true } | `t5` |
| mcpStatusWith: a runner spawnError / non-zero exit for one client -> { available:false, registered:false, connected:false } while the OTHER client is still evaluated (never throws) | `t5` |
| mcpStatusWith: exactly one McpClientStatus per known client (claude, codex) is always returned, never omitted | `t5` |
| attachedClientsWith: a resolving rpc -> { reachable:true; clients } (sorted); a rejecting rpc (daemon down) -> { reachable:false } without throwing | `t5` |
| makeServices().debug exposes attachedClients + mcpStatus bound to the real impls | `t5` |
| MCPSection: renders per-client rows from mcpStatus() showing registered + connected independently (ac1); a registered-but-not-connected client renders registered:true/connected:false | `t6` |
| MCPSection: renders the attachedClients() list with label + pid + connected-at (ac2); empty non-self set -> 'no other sessions attached' | `t6` |
| MCPSection: a { reachable:false } attachedClients() renders a 'daemon unreachable' line while the mcp-registration rows still show (daemon-independent) | `t6` |
| MCPSection: no keypress disconnects/terminates a client; only `r` refresh + the pane's section-nav are honoured (ac3/k5) | `t6` |
| MCPSection: the poll interval is cleared on unmount (no post-unmount setState) | `t6` |
| Every in-repo `debug` facade fake (tui/command/DebugPane/DaemonSection/MCPSection tests) carries attachedClients + mcpStatus stubs so the widened DebugService compiles | `t7` |
| The DebugPane 'mcp' section maps to <MCPSection/> (the s1 placeholder is gone) | `t6` |
| IpcRequest.client is optional/additive: an existing rpc call with no client envelope still type-checks and the daemon handler map is unchanged apart from the added daemon.debug-status peer | `t1` |

## Citations

- **[[c1]]** `prior-artifact` `LLD s4 handoff: IpcRequest.client optional identity envelope (additive field-add on the shared wire type, types.ts:749)`
- **[[c2]]** `prior-artifact` `LLD s4 handoff: new types AttachedClient (shared/types.ts) + DebugStatusModel/McpClientStatus (debug-types.ts)`
- **[[c3]]** `prior-artifact` `LLD s4 handoff: IpcServer in-memory connection registry (Map<Socket,ConnInfo> + connSeq + injected now + attachedClients()) maintained across connect/message/close (server.ts)`
- **[[c4]]** `prior-artifact` `LLD s4 handoff: read-only daemon.debug-status RpcHandler returning the attachedClients() snapshot (index.ts handler map, k1)`
- **[[c5]]** `prior-artifact` `LLD s4 handoff: rpc() (client.ts) + the insrc-mcp server populate the IpcRequest.client envelope (label 'cli' / 'mcp:<client>')`
- **[[c6]]** `prior-artifact` `LLD s4 handoff: DebugService facade widening with attachedClients + mcpStatus (interface + impls + makeServices binding; s2/s3 flat-facade extension model; requires the in-repo fakes to stub the new methods)`
- **[[c7]]** `prior-artifact` `LLD s4 handoff: mcpStatus() client-side `mcp list` parse per claude/codex (registered + connected independent, never throws, one entry per client; reuses mcp-register.ts runCli/alreadyRegistered)`
- **[[c8]]** `prior-artifact` `LLD s4 handoff: attachedClients() reads daemon.debug-status over IPC and folds to a discriminated reachable/unreachable DebugStatusModel (never throws)`
- **[[c9]]** `prior-artifact` `LLD s4 handoff: MCPSection component — mcp-registration rows (ac1) + attached-client list polled while open (ac2), strictly read-only with poll-cleanup on unmount (ac3/k5)`
- **[[c10]]** `prior-artifact` `LLD s4 handoff: DebugPane SECTION_VIEWS swaps the 'mcp' placeholder for <MCPSection/> (no change to the hosting shape/DebugSectionId/navigation, sc1/s1-owned)`

<!-- insrc:review -->

## Review

### ✅ Review `PASS` — plan (plan)

**0 HIGH · 0 MED · 10 LOW** · model `client` · reviewed 2026-08-06T08:26:42.135Z

| Ref | Kind | Severity | Fixability | Premise | Evidence | Action |
| --- | --- | --- | --- | --- | --- | --- |
| t1 | citation | LOW | auto | IpcRequest is defined in src/shared/types.ts around line 749 (the additive client field target). | src/shared/types.ts:749 reads `export interface IpcRequest {` — the additive client-envelope target confirmed. | None. |
| t2 | citation | LOW | auto | src/daemon/server.ts IpcServer has handleConnection + handleMessage and a constructor taking handlers + streamHandlers (the registry hook points + the 3rd now-clock arg target). | src/daemon/server.ts:75 `private handleConnection(socket: Socket): void {` confirmed; class IpcServer + handleMessage exist as the registry hook points. | None. |
| t3 | citation | LOW | auto | src/daemon/index.ts constructs `new IpcServer(...)` (~line 452) and registers the 'daemon.status' handler (~line 849), the peer site for daemon.debug-status. | src/daemon/index.ts:452 `const server = new IpcServer({` and :849 `'daemon.status': async () => {` — both the IpcServer construction site (holds the ref for attachedClients()) and the peer handler location confirmed. | None. |
| t4 | citation | LOW | auto | src/cli/client.ts rpc() writes an IpcRequest object (~line 17) — the single site to attach the client envelope. | src/cli/client.ts:11 confirms rpc(); the request-write site (const req: IpcRequest) is where the client envelope attaches. | None. |
| t5 | citation | LOW | auto | src/cli/services/debug-types.ts hosts the DebugService interface (with s2 daemonStatus + s3 scanOrphans/killOrphans) that t5 widens, and src/cli/services/debug.ts holds the injectable-deps cores + realDeps. | src/cli/services/debug-types.ts:35 `export interface DebugService {` confirmed — the facade t5 widens (with s2/s3 members present); debug.ts holds the injectable-deps cores. | None. |
| t5 | citation | LOW | auto | src/daemon/mcp-register.ts provides runCli + alreadyRegistered + a two-client (claude, codex) ClientPlan list that the client-side mcpStatusWith parse reuses. | src/daemon/mcp-register.ts:105 `const plans: ClientPlan[] = [` with the claude + codex entries confirmed; runCli/alreadyRegistered present — the two-client parse shape mcpStatusWith reuses. | None. |
| t6 | citation | LOW | auto | src/cli/panes/DebugPane.tsx has a SECTION_VIEWS mcp placeholder ('MCP diagnostics') that t6 swaps for <MCPSection/>, mirroring how the daemon section is wired. | src/cli/panes/DebugPane.tsx:36 `const SECTION_VIEWS: Partial<Record<string, () => ReactElement>> = {` confirmed — the mcp placeholder swap target (mirrors the daemon-section wiring). | None. |
| t7 | inventory | LOW | auto | The in-repo debug facade fakes needing attachedClients/mcpStatus stubs live in exactly these test files: tui.test.ts, command.test.ts, DebugPane.test.ts, DaemonSection.test.ts (plus the new MCPSection test). | grep for daemonStatus:/scanOrphans: matches across the four named test files (tui/command/DebugPane/DaemonSection); the fake inventory to widen is accurate (the new MCPSection test adds its own fake). | None. |
| t2 | closed-union | LOW | auto | The IpcServer socket lifecycle exposes a 'close' event (used to delete the registry entry) alongside the existing 'data'/'error' handlers in handleConnection. | server.ts handleConnection registers socket.on('data')+('error'); the stream path already uses socket.on('close') at server.ts:149, so the 'close' lifecycle event t2 relies on for registry deletion is available. | None. |
| plan | ordering | LOW | auto | The task dependency graph is acyclic (t1 root; t2<-t1; t3<-t2; t4<-t1; t5<-t1; t6<-t5; t7<-t5) with order 1..7 a valid topological sort. | dependency graph t1 root -> {t2,t4,t5}; t2->t3; t5->{t6,t7} is acyclic with order 1..7 a valid topological sort; matches the checklist.verify audit. | None — ordering consistent. |
