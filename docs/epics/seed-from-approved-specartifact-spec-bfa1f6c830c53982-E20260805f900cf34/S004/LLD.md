<!-- insrc:artifact LLD-f900cf34c0342d4f-s4 -->

# LLD: E20260806f900cf34:S004

**Epic:** `seed-from-approved-specartifact-spec-bfa1f6c830c53982`
**HLD base run:** `wf-1785928117126-v61buv`
**HLD effective hash:** `ddca67745f5c...`

## HLD context

**Framework:** A new Debug pane (peer *Pane.tsx in app.tsx's switcher, k6) with pane-local inner sub-tab navigation over three sections — Daemon, MCP, Logs — backed by a new debug service added to makeServices. The chosen shape (a1) keeps the daemon surface minimal: the status card reuses the existing daemon.status IPC, and the ONE genuinely new daemon contract (a read-only debug-status IPC that returns the daemon's own list of currently-attached socket clients, backed by per-connection tracking in the socket server) is built and consumed entirely inside the MCP-section story. Everything else is client-side: the POSIX orphan scan/kill keys on the managed daemon entry and OS signals (k3), and the log viewer fs.watch-tails the two rotated files on disk (k4) — so the Daemon and Logs sections keep working when the daemon is unreachable. The only cross-STORY contract is the pane's section-hosting shape + the debug-service facade that every section plugs into; it is owned by the foundational scaffold story (S001) that every section story already depends on.
**Rollout phase:** Phase B — diagnostic sections
**Consumes:** `sc1` (Debug pane section-hosting shape + DebugService facade)

## Contract details

**Surface level:** internal-shared

### `IpcRequest`

```typescript
export interface IpcRequest { id: number; method: string; params: unknown; stream?: boolean | undefined; client?: { readonly label: string; readonly pid: number } | undefined }
```

**Returns:** `interface` — Additive OPTIONAL `client` identity envelope on the existing wire request. Every current caller/handler stays valid (undefined). rpc() and the insrc-mcp server populate it so the daemon can attribute a live socket connection to a labelled client + pid (ac2).

**Postconditions:**
- Purely additive — no existing rpc caller or handler changes behaviour; the field is undefined unless a producer sets it.

### `rpc`

```typescript
export async function rpc<T = unknown>(method: string, params?: unknown): Promise<T>
```

**Parameters:**
- `method: string` — The daemon method to call (unchanged).
- `params: unknown` _(optional)_ — Method params (unchanged).

**Returns:** `Promise<T>` — Unchanged externally. Internally the IpcRequest it writes now carries client: { label: 'cli', pid: process.pid } so CLI-originated connections are labelled in the daemon registry. No signature/behaviour change for callers.

**Errors:**
- `Error('daemon is not running …')` when socket ENOENT/ECONNREFUSED (unchanged).

**Postconditions:**
- Every CLI RPC connection self-identifies as 'cli' + the CLI pid.

### `IpcServer`

```typescript
class IpcServer { constructor(handlers: RpcHandlers, streamHandlers?: StreamHandlers, now?: () => number); attachedClients(): AttachedClient[] }
```

**Parameters:**
- `now: () => number` _(optional)_ — Injected clock for connectedAt (defaults to a real epoch-ms clock) so the registry is unit-testable without wall-clock.

**Returns:** `AttachedClient[]` — attachedClients() returns a snapshot of the in-memory per-connection registry (sorted by connectedAt). Internally IpcServer holds a private Map<Socket, ConnInfo>: an entry is created in handleConnection (monotonic id + connectedAt), updated in handleMessage from request.client (label/pid) + request.method (lastMethod), and deleted on socket 'close'. Read-only observation; the server never closes a connection on the pane's behalf (k5).

**Preconditions:**
- pid/label are only present for connections whose client set the IpcRequest.client envelope; others are labelled 'unknown'.

**Postconditions:**
- The registry reflects exactly the sockets currently open; a closed socket is removed synchronously on 'close'.
- No connection is ever terminated by this code path (k5).

### `daemon.debug-status`

```typescript
'daemon.debug-status': RpcHandler  // (params: unknown) => Promise<{ clients: AttachedClient[] }>
```

**Returns:** `Promise<{ clients: AttachedClient[] }>` — A new READ-ONLY RpcHandler registered as a peer of daemon.status in the index.ts handler map (index.ts:452/849). Returns the IpcServer.attachedClients() snapshot. No side effects, no persistence (k1 — daemon owns the socket state; CLI reads it only over IPC).

**Preconditions:**
- The daemon is running (else the CLI rpc rejects, folded to an 'unreachable' model).

**Postconditions:**
- Returns the live attached-client set; calling it has no effect on any connection.

### `DebugService`

```typescript
export interface DebugService { readonly sections: readonly DebugSection[]; daemonStatus(): Promise<DaemonCardModel>; scanOrphans(): OrphanScanResult; killOrphans(pids: readonly number[]): Promise<KillOutcome[]>; attachedClients(): Promise<DebugStatusModel>; mcpStatus(): Promise<readonly McpClientStatus[]> }
```

**Returns:** `interface` — The sc1 facade gains two additive READ methods for the MCP section: attachedClients() (daemon.debug-status over IPC, folded to a discriminated reachable/unreachable model like daemonStatus) and mcpStatus() (client-side `mcp list` parse per client). Existing members unchanged. Same flat extension model as s2/s3.

**Postconditions:**
- Additive to sc1 — existing members unchanged; s1/s2/s3 fakes stubbing `debug` must add attachedClients + mcpStatus stubs.

### `mcpStatus`

```typescript
mcpStatus(): Promise<readonly McpClientStatus[]>
```

**Returns:** `Promise<readonly McpClientStatus[]>` — Per MCP client (claude, codex): runs `<cli> mcp list` client-side (injectable runner mirroring mcp-register.ts:runCli, never throws), parses whether an `insrc` server line is present (registered) and the connection-state token on that line (connected). One entry per client; a CLI missing from PATH → { registered:false, connected:false, available:false }. Independent of daemon reachability (ac1).

**Errors:**
- `n/a (never throws to the view)` when A `<cli> mcp list` spawn failure / non-zero exit resolves that client to available:false rather than throwing.

**Preconditions:**
- On-mount / explicit-refresh only — not a continuous poll (nonFunctional: avoid subprocess churn).

**Postconditions:**
- Exactly one McpClientStatus per known client (claude, codex); never omitted.

### `attachedClients`

```typescript
attachedClients(): Promise<DebugStatusModel>
```

**Returns:** `Promise<DebugStatusModel>` — Reads daemon.debug-status over IPC and folds the result into a discriminated { reachable:true; clients: AttachedClient[] } | { reachable:false } (mirroring DaemonCardModel). A daemon-down reject → { reachable:false } (never throws to the view).

**Errors:**
- `n/a (folded)` when rpc reject (daemon not running) → { reachable:false }.

**Preconditions:**
- Polled while the MCP section is open; the interval is cleared on unmount/section-change (nonFunctional).

**Postconditions:**
- The view never sees a throw; unreachable is a first-class variant.

### `MCPSection`

```typescript
export function MCPSection(props: { services: { readonly debug: DebugService } }): ReactElement
```

**Parameters:**
- `props: { services: { readonly debug: DebugService } }` — Supplies the debug facade whose attachedClients()/mcpStatus() the section renders.

**Returns:** `ReactElement` — The MCP section component (replaces the s1 'MCP diagnostics — coming soon' placeholder wired in DebugPane's SECTION_VIEWS). Renders (a) the per-client mcp registration/connection rows from mcpStatus() (ac1) and (b) the attached-socket-client list from attachedClients() with label + pid + connected-at, polled while open (ac2). STRICTLY read-only — no key offers disconnect/terminate (ac3); an explicit `r` refresh re-reads both.

**Preconditions:**
- Rendered by DebugPane only when the mcp section is active.

**Postconditions:**
- No mutating control exists in the section (ac3/k5); the poll interval is cleared on unmount.

## Data model changes

### `IpcRequest (src/shared/types.ts)` — field-add

Add OPTIONAL `client?: { readonly label: string; readonly pid: number }`. Additive/non-breaking — the daemon reads it opportunistically for the connection registry; absence yields an 'unknown'-labelled connection. Populated by rpc() (label 'cli') and the insrc-mcp server (label 'mcp:<client>').

```
interface IpcRequest { id; method; params; stream?; + client?: { readonly label: string; readonly pid: number } | undefined }
```

**Call sites:**
- `src/shared/types.ts`
- `src/cli/client.ts`
- `src/daemon/server.ts`

### `AttachedClient / DebugStatusModel / McpClientStatus (new types)` — new

AttachedClient { readonly id: number; readonly label: string; readonly pid?: number; readonly connectedAt: number; readonly lastMethod?: string } — one live socket connection. DebugStatusModel = { reachable: true; clients: readonly AttachedClient[] } | { reachable: false } — the CLI-side discriminated view-model (mirrors DaemonCardModel). McpClientStatus { readonly client: 'claude' | 'codex'; readonly available: boolean; readonly registered: boolean; readonly connected: boolean } — one MCP client's registration/connection state. AttachedClient lives in shared/types.ts (crosses the IPC boundary); DebugStatusModel + McpClientStatus are CLI-side in debug-types.ts.

```
+ shared/types.ts: interface AttachedClient { id; label; pid?; connectedAt; lastMethod? }
+ debug-types.ts: type DebugStatusModel = {reachable:true;clients} | {reachable:false}; interface McpClientStatus { client; available; registered; connected }
```

**Call sites:**
- `src/shared/types.ts`
- `src/daemon/server.ts`
- `src/cli/services/debug-types.ts`
- `src/cli/services/debug.ts`
- `src/cli/panes/MCPSection.tsx`

### `IpcServer connection registry (src/daemon/server.ts)` — field-add

Add a private Map<Socket, ConnInfo> + a monotonic id counter + an injected `now` clock. handleConnection creates an entry (id, connectedAt=now()); handleMessage updates it from request.client (label/pid) + request.method (lastMethod); a socket 'close' listener deletes it. New public attachedClients() returns the snapshot (sorted by connectedAt). Pure in-memory, rebuilt from live connections; no persistence.

```
class IpcServer { + private conns: Map<Socket, ConnInfo>; + private connSeq: number; + private now: () => number; + attachedClients(): AttachedClient[] }
```

**Call sites:**
- `src/daemon/server.ts`
- `src/daemon/index.ts`

### `DebugService facade (debug-types.ts + debug.ts + index.ts)` — field-add

Add attachedClients(): Promise<DebugStatusModel> + mcpStatus(): Promise<readonly McpClientStatus[]> to the interface + impls (injectable-deps helpers with zero-arg facade wrappers) + bind onto the makeServices() debug entry. Additive; existing members unchanged.

```
interface DebugService { ...; + attachedClients(): Promise<DebugStatusModel>; + mcpStatus(): Promise<readonly McpClientStatus[]> }
```

**Call sites:**
- `src/cli/services/debug-types.ts`
- `src/cli/services/debug.ts`
- `src/cli/services/index.ts`
- `src/cli/panes/MCPSection.tsx`

### `DebugPane SECTION_VIEWS (src/cli/panes/DebugPane.tsx)` — field-modify

Swap the mcp placeholder ('MCP diagnostics — coming soon.') for <MCPSection services={{ debug }} />, exactly as s2 swapped in DaemonSection. No change to the hosting shape, DebugSectionId, or navigation (all sc1/s1-owned).

```
SECTION_VIEWS.mcp: () => <MCPSection services={{ debug }} />
```

**Call sites:**
- `src/cli/panes/DebugPane.tsx`

## Interaction with shared contracts

| Contract | Role | How |
| :--- | :--- | :--- |
| `sc1` | consumes | s4 consumes sc1 (HLD boundary: depends=[sc1]) and extends it per sc1's stated model: it augments the DebugService facade with two additive FLAT read methods (attachedClients + mcpStatus, recorded via a sharedContract.methodAdd amendment on sc1, owned by s1) and supplies the MCPSection component that DebugPane maps for the 'mcp' section id. It does NOT change the section-hosting shape, DebugSectionId, navigation, or add a section (all owned by s1). The one genuinely new daemon surface (IpcRequest.client + the connection registry + daemon.debug-status) is s4-internal, built and consumed only here (k1 read-only, k5 no disconnect); the section is strictly read-only (ac3). |

## Error paths

### Error cases

- **The daemon is not running when the MCP section polls attachedClients().** (recoverable)
  - Detection: rpc('daemon.debug-status') rejects with the ENOENT/ECONNREFUSED 'daemon is not running' Error from client.ts:40-45; the attachedClients() wrapper catches the reject.
  - Response: Fold the reject into { reachable: false } (never rethrow to the view), exactly like buildDaemonCard. The section renders a 'daemon unreachable — no attached-client data' line and keeps the ac1 mcp-list rows (which are daemon-independent).
  - User impact: The operator sees mcp registration status still, plus a clear 'daemon unreachable' note instead of a crash; a later poll recovers once the daemon is up.
- **A `<cli> mcp list` subprocess fails to spawn (CLI not on PATH) or exits non-zero / prints unparseable output.** (recoverable)
  - Detection: The injected runCli resolves with spawnError set (child 'error') or code!==0 (child 'close'); mcpStatus catches around the run + parse (mirroring mcp-register.ts:130-135).
  - Response: Resolve that client to { available:false, registered:false, connected:false } rather than throwing; the other client is still evaluated independently.
  - User impact: The operator sees e.g. 'codex — CLI not found' for one client while claude's real status still shows; nothing crashes.
- **A socket 'close' fires for a connection whose registry entry was already removed (double close), or 'close' fires before any handleMessage ran.** (recoverable)
  - Detection: The 'close' handler looks up the Socket key in the conns Map; a missing key is a no-op delete, and a never-messaged connection still has its handleConnection-created entry (label 'unknown').
  - Response: Map.delete on a missing key is idempotent; a connection that closed before messaging is simply dropped with no label ever assigned. No throw, no leak.
  - User impact: None — the attached-client list stays consistent with live sockets; no ghost entries accumulate.
- **A client sends an IpcRequest.client envelope with a malformed shape (missing pid, non-numeric pid, absurdly long label).** (recoverable)
  - Detection: handleMessage validates request.client before recording: pid must be a finite positive integer and label a non-empty string (bounded length), else the field is ignored.
  - Response: Record only the well-formed fields; a bad envelope leaves label 'unknown'/pid undefined for that connection rather than storing garbage. The registry never trusts unvalidated wire input.
  - User impact: A misbehaving client shows as 'unknown' rather than injecting a bogus label/pid into the operator's view.

### Edge cases

| Input | Expected |
| :--- | :--- |
| The MCP section is open and the ONLY attached connection is the debug-status poll itself. | The attached-client list shows exactly that one 'cli' connection (the querying rpc). The section notes it may include itself; the count is honest, not zero. |
| A long-running stream (workflow.run / analyze.run) is in flight while the section polls. | That connection appears with its label ('cli' or 'mcp:<client>'), pid, connected-at, and lastMethod='workflow.run'/'analyze.run' — the primary real 'attached session' the feature surfaces, since ordinary rpc calls are ephemeral. |
| `<cli> mcp list` shows the insrc server registered but currently NOT connected (e.g. the daemon/MCP entry is registered but the server process is not live). | That client row renders registered:true, connected:false — the two states are reported independently (ac1). |
| The operator presses any key in the MCP section looking for a disconnect action. | No key disconnects or terminates anything; only `r` (refresh) and the pane's ←/→ section-nav are honoured. The section is strictly read-only (ac3/k5). |
| The daemon has zero non-self connections (idle daemon, section just opened). | The attached-client list is empty apart from the poll connection; the section renders a 'no other sessions attached' line, not an error. |

### Invariants to preserve

- All daemon-held socket state is read by the CLI EXCLUSIVELY over IPC (the new daemon.debug-status handler); the CLI never opens the daemon's socket internals or the conns Map directly. The handler and registry live in the daemon process (server.ts / index.ts), mirroring how daemon.status is served at index.ts:849 and read via rpc<DaemonStatus> at cli/services/daemon.ts:50. [[c2]]
- The MCP section never disconnects or terminates any client and never restarts the daemon (k5): the connection registry is observational only, IpcServer.attachedClients() has no mutating counterpart, and no UI control triggers a socket close. This mirrors that server.ts today only aborts a stream's handler on the client's OWN socket 'close', never proactively closing a peer. [[c4]]
- The IpcRequest.client envelope is purely additive and optional; every existing rpc caller and daemon handler continues to work unchanged with the field absent. The wire types (IpcRequest at types.ts:749) are extended, never narrowed, and unvalidated wire input is never trusted into the registry. [[c2]]

## Test strategy

**Test framework:** `node:test via `npx tsx --test`: injectable-deps unit tests for the daemon registry (fake Socket EventEmitters + injected now clock) and the CLI mcpStatusWith/attachedClientsWith cores (injected runCli + rpc seams), mirroring the s2/s3 debug-service tests; ink-testing-library (createElement + stdin) for the MCPSection render/poll/read-only tests, mirroring DaemonSection.test.ts. NO real socket, subprocess, or wall-clock in unit tests; a gated live test is out of scope.`

### Test levels

- **unit** — Prove the daemon-side connection registry register/update/remove logic + attachedClients() snapshot against fake Socket objects (EventEmitter stand-ins) with an injected clock — no real socket.
  - Subjects: `IpcServer registry: a new connection creates an entry with a monotonic id + connectedAt from the injected clock; attachedClients() returns it labelled 'unknown' until a message identifies it`, `IpcServer registry: a handleMessage carrying request.client={label,pid} + method updates that connection's label/pid/lastMethod; attachedClients() reflects it`, `IpcServer registry: a socket 'close' deletes the entry; a double 'close' / close-before-message is an idempotent no-op (no throw, no ghost entry)`, `IpcServer registry: a malformed request.client (missing/non-integer pid, empty/oversized label) is ignored — the connection stays 'unknown'/pid undefined (untrusted wire input never stored)`, `attachedClients() returns entries sorted by connectedAt and never mutates/closes any connection (k5 — no disconnect counterpart)`
  - Fixtures: `A fake Socket (node:events EventEmitter with a no-op write) to drive connect/message/close`, `An injectable now() clock returning scripted epoch-ms values`, `Canned IpcRequest objects with/without a client envelope`
- **unit** — Prove the CLI-side mcpStatusWith(deps) parse against canned `<cli> mcp list` output and the attachedClients() fold — injectable runner + rpc, no real subprocess/socket.
  - Subjects: `mcpStatusWith: canned claude+codex `mcp list` output with an `insrc` line + a connection-state token -> per client { registered:true, connected:<parsed>, available:true }`, `mcpStatusWith: stdout with NO insrc line -> { registered:false, connected:false, available:true }`, `mcpStatusWith: a runner spawnError / non-zero exit for one client -> { available:false, registered:false, connected:false } while the OTHER client is still evaluated (never throws)`, `mcpStatusWith: exactly one McpClientStatus per known client (claude, codex) is always returned, never omitted`, `attachedClientsWith: a resolving rpc -> { reachable:true; clients } (sorted); a rejecting rpc (daemon down) -> { reachable:false } without throwing`, `makeServices().debug exposes attachedClients + mcpStatus bound to the real impls`
  - Fixtures: `An injectable runCli seam returning canned `mcp list` stdout/code/spawnError per (bin,args)`, `An injectable rpc seam resolving/rejecting a canned { clients } payload`, `A real makeServices() call (no subprocess/socket at construction)`
- **unit** — Prove the MCPSection component renders the mcp-registration rows + the attached-client list, polls while open, clears the interval on unmount, and offers NO mutating control — via ink-testing-library + a fake debug facade.
  - Subjects: `MCPSection: renders per-client rows from mcpStatus() showing registered + connected independently (ac1); a registered-but-not-connected client renders registered:true/connected:false`, `MCPSection: renders the attachedClients() list with label + pid + connected-at (ac2); empty non-self set -> 'no other sessions attached'`, `MCPSection: a { reachable:false } attachedClients() renders a 'daemon unreachable' line while the mcp-registration rows still show (daemon-independent)`, `MCPSection: no keypress disconnects/terminates a client; only `r` refresh + the pane's section-nav are honoured (ac3/k5)`, `MCPSection: the poll interval is cleared on unmount (no post-unmount setState)`
  - Fixtures: `A fake `{ debug }` facade whose mcpStatus()/attachedClients() return supported/unsupported + reachable/unreachable fixtures`, `ink-testing-library render (createElement) + stdin keypresses; fake timers or a short poll interval to exercise polling`
- **integration** — Prove the widened DebugService compiles across the whole CLI suite and the in-repo debug fakes carry the new stubs; and that IpcRequest.client is purely additive (existing callers unaffected).
  - Subjects: `Every in-repo `debug` facade fake (tui/command/DebugPane/DaemonSection/MCPSection tests) carries attachedClients + mcpStatus stubs so the widened DebugService compiles`, `The DebugPane 'mcp' section maps to <MCPSection/> (the s1 placeholder is gone)`, `IpcRequest.client is optional/additive: an existing rpc call with no client envelope still type-checks and the daemon handler map is unchanged apart from the added daemon.debug-status peer`
  - Fixtures: ``npx tsx --test 'src/cli/**/*.test.ts'` compiling against the widened DebugService`

### Acceptance mapping

| Criterion | Proving tests |
| :--- | :--- |
| `ac1` | `unit: mcpStatusWith canned output -> per-client registered + connected (independently); registered-but-not-connected case`, `unit: MCPSection renders the per-client mcp-registration rows (registered + connected) from mcpStatus()` |
| `ac2` | `unit: IpcServer registry records label/pid/connectedAt from request.client + attachedClients() snapshot (sorted)`, `unit: attachedClientsWith folds a resolving rpc into { reachable:true; clients }`, `unit: MCPSection renders the attached-client list with label + pid + connected-at and polls while open` |
| `ac3` | `unit: MCPSection offers NO disconnect/terminate control — only `r` refresh + section-nav (read-only)`, `unit: IpcServer.attachedClients() has no mutating counterpart and never closes a connection (k5)` |

## Migration

**State before:** The Unix-socket server (src/daemon/server.ts) tracks NO per-connection state — handleConnection(socket) (server.ts:75) only sets up line-buffering, and there is no enumeration of attached clients anywhere; the daemon handler map (index.ts:452) has daemon.status but no debug-status peer. IpcRequest (types.ts:749) is {id,method,params,stream?} with no identity envelope, and rpc() (client.ts) writes it as-is over an ephemeral per-call connection. The Debug pane's MCP section is the s1 placeholder ('MCP diagnostics — coming soon.') in DebugPane's SECTION_VIEWS; the DebugService facade has sections/daemonStatus/scanOrphans/killOrphans but no attachedClients/mcpStatus. MCP per-client registration is only checked internally by mcp-register.ts during repo-add, never surfaced read-only.

**State after:** IpcRequest carries an OPTIONAL client identity envelope that rpc() (label 'cli') and the insrc-mcp server (label 'mcp:<client>') populate. IpcServer keeps an in-memory Map<Socket,ConnInfo> (id/connectedAt/label?/pid?/lastMethod?) maintained across connect/message/close and exposes attachedClients(); a new read-only daemon.debug-status handler returns that snapshot. The DebugService facade gains attachedClients() (IPC, folded to a reachable/unreachable model) + mcpStatus() (client-side `mcp list` parse), and the DebugPane 'mcp' section renders the new MCPSection (per-client registration/connection rows + attached-socket-client list, polled while open, strictly read-only). No persistent state is added.

**Zero downtime:** yes — **Data rewrite:** no

### Steps

1. Add the OPTIONAL `client?: { label; pid }` field to IpcRequest and the new AttachedClient type in shared/types.ts. Purely additive — no existing caller/handler changes; the field defaults to undefined on every current request. — ↩ rollbackable
2. Add the in-memory connection registry (Map + monotonic id + injected now clock) to IpcServer, maintained in handleConnection/handleMessage/socket-'close', plus the public attachedClients() snapshot. Read-only, in-memory, no wire/behaviour change to existing request handling. — ↩ rollbackable
3. Register the new read-only daemon.debug-status handler as a peer in the index.ts handler map, returning the IpcServer.attachedClients() snapshot. Additive method — existing methods untouched. — ↩ rollbackable
4. Populate IpcRequest.client in rpc() (label 'cli', pid process.pid) and in the insrc-mcp server's daemon calls (label 'mcp:<client>'). Producers only; a connection whose producer is older simply shows 'unknown'. — ↩ rollbackable
5. Widen the DebugService facade (interface + impls + makeServices binding) with attachedClients() + mcpStatus() (injectable-deps cores + zero-arg wrappers), and add the DebugStatusModel/McpClientStatus CLI-side types. Add the new stubs to the in-repo debug fakes in the SAME change so the widened interface compiles. — ↩ rollbackable
6. Add the MCPSection component and swap it into DebugPane's SECTION_VIEWS for the 'mcp' id (replacing the placeholder). No change to the section-hosting shape, DebugSectionId, or navigation. — ↩ rollbackable

**Backward compat:** The only touched public/shared surface is IpcRequest, extended with an OPTIONAL field — every existing rpc caller and daemon handler compiles and behaves identically with the field absent (the daemon reads it opportunistically; a missing envelope yields an 'unknown'-labelled connection). rpc()'s external signature is unchanged. The daemon.debug-status method is net-new and additive; no method is renamed or removed. A newer CLI talking to an older daemon degrades gracefully (the older daemon ignores the client envelope and has no debug-status handler — the CLI folds the 'unknown method' reject into { reachable:false }); an older CLI talking to a newer daemon simply appears as an 'unknown'-labelled connection. The DebugService widening is additive and internal to src/cli.

## Alternatives considered

### a1: Identity-envelope + in-memory connection registry — **CHOSEN**

Additive optional client identity on IpcRequest, populated by every caller; the socket server keeps a live Map<Socket,ConnInfo> a new daemon.debug-status handler snapshots; ac1 via a client-side injectable `mcp list` parse.



### a2: Server-side inference, no wire-type change

Track only what the socket already exposes (connection id, connected-at, last method) with NO IpcRequest change; derive a coarse label from the method, omit pid.



**Rejected because:** Fails ac2 outright — pid is required and cannot be obtained over AF_UNIX without client self-report; the label is a method-derived guess, not identity. Trading the feature's core value (accurate identity) for a smaller diff contradicts accuracy-first.

### a3: Dedicated client.identify handshake

Clients send a separate client.identify RPC carrying {label,pid} right after connecting; the server correlates identity to the socket out-of-band from the real request.



**Rejected because:** Achieves identity but doubles every RPC round-trip codebase-wide (rpc()'s ephemeral connections would need two writes per call) and adds an identify/real-request correlation race that leaves connections intermittently unlabelled — far more cost and fragility than a1's single-write envelope for the same result.

## Citations

- **[[c1]]** `prior-artifact` `HLD-f900cf34c0342d4f sc1: Debug pane section-hosting shape + DebugService facade (ownedByStory s1, consumed by s2-s5); s4 depends=[sc1], owns=[]`
- **[[c2]]** `analyze-bundle` `s1 symbol.locate: src/daemon/server.ts IpcServer (no per-connection tracking today) + IpcRequest/IpcResponse (types.ts:749/756) + daemon.status handler (index.ts:849) + rpc<DaemonStatus> (cli/services/daemon.ts:50); the daemon.debug-status peer + registry model`
- **[[c3]]** `analyze-bundle` `s1 usage.example: src/cli/client.ts rpc() opens an ephemeral per-call connection (socket.end after first response, client.ts:30); only stream:true requests stay attached — frames ac2's 'currently attached' as stream-dominated`
- **[[c4]]** `analyze-bundle` `s1 symbol.locate: src/daemon/mcp-register.ts runCli/alreadyRegistered (mcp-register.ts:55/87) per-client `<cli> mcp list` parse (never throws) reused client-side for ac1; server.ts only aborts a stream's own socket, never proactively closing a peer (k5)`
- **[[c5]]** `analyze-bundle` `s1 test.locate: the s2/s3 injectable-deps debug-service tests (debug-daemon-status.test.ts, debug-orphans.test.ts) + DaemonSection.test.ts ink-testing-library idiom that s4's registry/mcp-status/MCPSection tests extend`

<!-- insrc:review -->

## Review

### ✅ Review `PASS` — design.story (design.story)

**0 HIGH · 0 MED · 10 LOW** · model `client` · reviewed 2026-08-06T08:19:38.878Z

| Ref | Kind | Severity | Fixability | Premise | Evidence | Action |
| --- | --- | --- | --- | --- | --- | --- |
| cl1 | citation | LOW | auto | IpcRequest is defined in src/shared/types.ts around line 749 with fields id/method/params/stream? (the surface s4 extends with an optional client envelope). | src/shared/types.ts:749 reads `export interface IpcRequest {` — confirmed; the additive optional client envelope extends a real type. | None — citation confirmed. |
| cl2 | citation | LOW | auto | src/daemon/server.ts IpcServer.handleConnection(socket) exists and today tracks no per-connection state (the hook point for the connection registry). | src/daemon/server.ts:75 reads `private handleConnection(socket: Socket): void {` — the registry hook point exists exactly as cited. | None — confirmed. |
| cl3 | citation | LOW | auto | src/daemon/server.ts IpcServer.handleMessage dispatches a request by request.method to the handler map (where request.client/method would update the registry). | src/daemon/server.ts:93 reads `private async handleMessage(raw: string, socket: Socket): Promise<void> {` — the per-message update site exists as cited. | None — confirmed. |
| cl4 | citation | LOW | auto | The daemon.status handler is registered in the src/daemon/index.ts handler map (around line 849), and the IpcServer is constructed there (around line 452) — the peer location for the new daemon.debug-status handler. | src/daemon/index.ts:849 reads `'daemon.status': async () => {` and index.ts:452 reads `const server = new IpcServer({` — both peer/construction sites confirmed for the new daemon.debug-status handler. | None — confirmed. |
| cl5 | citation | LOW | auto | src/cli/client.ts rpc() opens an ephemeral per-call connection and calls socket.end() after the first response (the write site where the client envelope is populated). | src/cli/client.ts:11 reads `export async function rpc<T = unknown>(method: string, params: unknown = {}): Promise<T> {` — the rpc write site to carry the client envelope exists. | None — confirmed. |
| cl6 | citation | LOW | auto | The daemon.status IPC is consumed CLI-side via rpc<DaemonStatus>('daemon.status') in src/cli/services/daemon.ts (~line 50) — the precedent attachedClients() mirrors. | The cited symbol resolves at src/cli/services/daemon.ts:52 (`return rpc<DaemonStatus>('daemon.status');`) — the artifact said ~line 50 (off by two, the line-50 read landed on the doc comment). Symbol confirmed; the precedent attachedClients() mirrors is real. | None material — minor line drift, symbol present. |
| cl7 | citation | LOW | auto | src/daemon/mcp-register.ts provides runCli (never-throwing subprocess capture) and alreadyRegistered (/^\\s*insrc\\b/m) that the client-side mcpStatus parse reuses for ac1. | src/daemon/mcp-register.ts:55 reads `function runCli(...)` and :87 reads `function alreadyRegistered(stdout: string): boolean {` — both reusable client-side for ac1 as cited. | None — confirmed. |
| cl8 | semantic | LOW | auto | The DebugService facade (sc1) currently has sections/daemonStatus/scanOrphans/killOrphans and s4 adds attachedClients + mcpStatus additively; the in-repo debug fakes needing the new stubs live in the tui/command/DebugPane/DaemonSection test files. | src/cli/services/debug-types.ts:35 reads `export interface DebugService {` (with scanOrphans/killOrphans present per s3) and DebugPane's 'MCP diagnostics' placeholder is the swap target; additive widening is well-founded. | None — confirmed. |
| cl9 | inventory | LOW | auto | There are exactly two MCP clients (claude, codex) that mcpStatus reports one McpClientStatus each, matching the two ClientPlan entries in mcp-register.ts. | src/daemon/mcp-register.ts:105 reads `const plans: ClientPlan[] = [` with exactly the claude + codex entries — the two-client inventory matches; mcpStatus returning one per client is grounded. | None — confirmed. |
| cl10 | closed-union | LOW | auto | The IpcServer socket lifecycle exposes a 'close' event (used to delete the registry entry) alongside the existing 'data'/'error' handling in handleConnection. | server.ts handleConnection registers socket.on('data') + socket.on('error'); a socket 'close' listener is added by s4 for registry deletion (the stream path already listens on 'close' at server.ts:149). The 'close' lifecycle event is available as the design assumes. | None — confirmed. |
