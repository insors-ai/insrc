<!-- insrc:artifact LLD-ad0d45c9d690f8c1-s1 -->

# LLD: E20260921ad0d45c9:S001

**Epic:** `build-insrc-vs-code-extension-v1`
**HLD base run:** `wf-1790009331473-c5to0q`
**HLD effective hash:** `1e2038ef7232...`

## HLD context

**Framework:** The insrc VS Code extension is a thin orchestrator that owns no reasoning: a new top-level vscode-plugin/ TypeScript package (sibling to jetbrains-plugin/, its own package.json + build + Marketplace metadata) whose whole job is to wire insrc into stock VS Code at lifecycle moments (activate, first workspace open, uninstall). It re-expresses the shipped jetbrains-plugin/ thin-config-orchestrator in TS over VS Code primitives, reaching the daemon ONLY through a NEW in-repo src/shared/ipc-client module that generalizes the existing src/cli/client.ts `rpc` fn + its IPC request/reply types + the socket path — giving exactly one socket-client code path shared by the CLI and the extension (k5), with no daemon internals, indexer, or storage in the extension bundle, and no cloud path opened by the extension (k2). The extension is decomposed into small per-capability seams, each with an injectable boundary so its load-bearing logic is unit-testable off the VS Code API, and every invasive action (install the daemon, wire a host, register the workspace) is consent-gated and exposed as a durable first-class command.
**Rollout phase:** Phase A — Foundation & cross-cutting contracts
**Owns:** `sc1` (SharedIpcClient), `sc2` (StatusSurface), `sc3` (CommandRegistry), `sc4` (ConsentGate)
**Consumes:** `sc1` (SharedIpcClient), `sc2` (StatusSurface), `sc3` (CommandRegistry), `sc4` (ConsentGate)

**Adjacent scope (owned by other stories — do NOT implement here):**
- `s2`: The bundled installer asset (which installer script ships and how it is invoked over scripts/insrc-daemon-install.sh), the exact daemon-ctl.sh subcommand invocation and output parsing, and streamed lifecycle progress are private to s2. Only the sc6 lifecycle contract is exposed; the install/lifecycle commands are registered into sc3 and gated by sc4. — owns `sc6`
- `s3`: The concrete per-host config locations and shapes (extension-ID hosts like Copilot/Claude Code/Continue/Cline vs editor-environment hosts like Cursor/Windsurf/VSCodium via .vscode/mcp.json or the host's own file), the marker-delimited JSON-merge and steering writers, and the detection mechanics stay private to each adapter behind sc5. Only the sc5 interface + registry is exposed; the wire command is registered into sc3 and the combined consent uses sc4. — owns `sc5`
- `s4`: The workspace-root resolution from the open VS Code workspace folders and the already-registered check semantics stay private to s4. Only the sc7 registrar contract is exposed; enrolment goes exclusively through the daemon's repo.add over sc1, the register command is registered into sc3, and the one-time prompt uses sc4. — owns `sc7`
- `s5`: The first-run flow sequencing (the order and coalescing of the install → register → wire consent prompts into one coherent flow rather than scattered pop-ups), the persisted 'already onboarded' state, and the uninstall hook that drives sc5.unwire across wired hosts are private to s5. It owns no new shared contract — it composes the branch owners' contracts and pushes resulting state through sc2.
- `s6`: The vscode-plugin/package.json manifest (contributes/engines.vscode/activationEvents), the Marketplace listing assets (icon, README, categories), the packaging into a single .vsix, and the manually-triggered (workflow_dispatch) Marketplace-only publish path stay entirely private to s6 — no runtime contract is exposed and it depends on no other story's contract, only on the s1 package existing.

## Contract details

**Surface level:** internal-shared

### `rpc`

```typescript
export async function rpc<T = unknown>(method: string, params?: unknown, connect?: () => Socket): Promise<T>
```

**Parameters:**
- `method: string` — The daemon JSON-RPC method name (e.g. 'daemon.status').
- `params: unknown` _(optional)_ — Method params; defaults to {}.
- `connect: () => Socket` _(optional)_ — Injectable socket-connection seam (defaults to createConnection(PATHS.sockFile)); lets tests pass a fake socket.

**Returns:** `Promise<T>` — The daemon's result for that method; rejects on daemon error or unreachable socket.

**Errors:**
- `Error('daemon is not running — start it with: insrc daemon start')` when socket error code ENOENT or ECONNREFUSED (daemon down).
- `Error(res.error)` when the daemon returned an IpcResponse with an `error` field.
- `Error('invalid response from daemon')` when a response line is not parseable JSON.

**Preconditions:**
- No behavioral change — the function body is MOVED verbatim from src/cli/client.ts:15 into the new src/shared/ipc-client.ts.

**Postconditions:**
- src/cli/client.ts re-exports `rpc` from '../shared/ipc-client.js' so its four importers (src/cli/services/{debug,repo,config,daemon}.ts) are byte-unchanged (lc1 / Phase-A backward-compat).
- Only node:net + src/shared/types + src/shared/paths are on the import graph, so an extension importing src/shared/ipc-client pulls no daemon internals (k5/lc1).

### `IpcClient.status`

```typescript
status(): Promise<DaemonStatus>
```

**Returns:** `Promise<DaemonStatus>` — The daemon's real status (the shared/types.ts DaemonStatus: uptime, repos[], queueDepth, embeddingsPending, modelPull*, lmdbFileSizeMb?), obtained via rpc('daemon.status').

**Errors:**
- `Error` when propagates rpc()'s errors when the daemon is down or returns an error.

**Preconditions:**
- sc1 re-exports the REAL DaemonStatus + IpcRequest/IpcResponse from src/shared/types.ts (no mirrored copies).

**Postconditions:**
- Returns the wire DaemonStatus unchanged; the extension never opens a cloud path (k2).

### `IpcClient.reachability`

```typescript
reachability(): Promise<DaemonReachability>
```

**Returns:** `Promise<DaemonReachability>` — 'running' if status() resolves; 'stopped' if rpc threw the ENOENT/ECONNREFUSED 'daemon is not running' error; 'errored' for any other failure.

**Preconditions:**
- Added to sc1 via the methodAdd amendment above (never throws — it CATCHES rpc's throws to classify them).

**Postconditions:**
- Gives s1 activation and consumers s2/s4/s5 a single reachability derivation matching ac1 ('determines whether the daemon is reachable').

### `StatusSurface.set`

```typescript
set(snapshot: StatusSnapshot): void
```

**Parameters:**
- `snapshot: StatusSnapshot` — { state: DaemonUiState; detail?: string } — the new status to render in the status-bar item.

**Returns:** `void` — Updates the glanceable status-bar indicator (ac2).

**Preconditions:**
- The default impl wraps an injected StatusBarItem-like handle (window.createStatusBarItem), so its mapping logic is testable with a fake.

**Postconditions:**
- The status-bar text/icon reflects running/stopped/errored/unknown; current() returns the last set snapshot.

### `CommandRegistry.register`

```typescript
register(descriptor: CommandDescriptor, run: () => Promise<void>): void
```

**Parameters:**
- `descriptor: CommandDescriptor` — { id: InsrcCommandId; title: string } — the durable command to expose.
- `run: () => Promise<void>` — The command handler later stories supply (s1 registers none itself).

**Returns:** `void` — Registers a first-class VS Code command so a dismissed prompt is never a dead end (ac2/k6).

**Errors:**
- `Error` when the same InsrcCommandId is registered twice (guarded — a duplicate is a programming error).

**Preconditions:**
- The default impl wraps an injected registerCommand-like fn + pushes the Disposable into the ExtensionContext.subscriptions sink.

**Postconditions:**
- The command id is invocable from the palette/status surface; s1 owns only the registry, not the command bodies (those are s2/s3/s4/s5).

### `ConsentGate.ask`

```typescript
ask(request: ConsentRequest): Promise<ConsentOutcome>
```

**Parameters:**
- `request: ConsentRequest` — { title; detail; acceptLabel; items? } — the prompt describing the invasive action.

**Returns:** `Promise<ConsentOutcome>` — 'accepted' | 'declined' | 'dismissed' — the developer's decision; nothing invasive happens until 'accepted' (k4).

**Preconditions:**
- The default impl wraps an injected modal message fn (window.showInformationMessage with modal:true); s1 performs NO invasive action itself — it only provides the gate.

**Postconditions:**
- Consumers (s2 install, s3 wire, s4 register) call ask() before any side effect; a non-'accepted' outcome performs nothing.

### `activate`

```typescript
export function activate(context: ExtensionContext): void
```

**Parameters:**
- `context: ExtensionContext` — VS Code extension context; its `subscriptions` receives the status-bar item + command Disposables for clean teardown.

**Returns:** `void` — The extension entrypoint: constructs the ipc client + sc2/sc3/sc4 surfaces, registers the status-bar item, and kicks off an off-the-UI reachability probe that pushes a DaemonUiState into sc2 (ac1/ac2).

**Errors:**
- `(never throws)` when activation must not block/hang the editor — the reachability probe is bounded and its failure degrades to 'stopped'/'errored', never a thrown activation.

**Preconditions:**
- No reasoning/LLM/analysis/graph runs in-process (k2/lc2); the editor is not modified (ac1).

**Postconditions:**
- The status-bar item shows the derived reachability; later stories attach their commands via sc3.

## Data model changes

### `src/shared/ipc-client (new module)` — new

New module holding the moved `rpc` fn + `createIpcClient` factory producing an IpcClient { rpc, status, reachability }, re-exporting IpcRequest/IpcResponse/DaemonStatus from src/shared/types.ts and `sockFilePath` (= PATHS.sockFile). This is the sc1 home — the single socket-client path shared by the CLI/TUI and the extension.

**Call sites:**
- `src/cli/client.ts:15`
- `src/shared/types.ts:798`
- `src/shared/paths.ts:19`

### `src/cli/client.ts` — invariant-change

Its `rpc` body moves to src/shared/ipc-client; client.ts becomes `export { rpc } from '../shared/ipc-client.js'`. Public surface is byte-identical so the four importers are untouched — the load-bearing backward-compat invariant of Phase A.

**Call sites:**
- `src/cli/services/debug.ts:25`
- `src/cli/services/repo.ts:15`
- `src/cli/services/config.ts:12`
- `src/cli/services/daemon.ts:17`

### `vscode-plugin/ (new package)` — new

New top-level TS package (sibling to jetbrains-plugin/) with its own tsconfig/package.json and an activation entry that stands up sc1-sc4. s1 stands up only the minimal manifest needed to compile + register the status-bar item and commands; the Marketplace listing/contributes/.vsix packaging is s6's boundary. VS Code API access is injected behind each surface's boundary so logic is unit-testable off VS Code.

**Call sites:**
- `jetbrains-plugin/gradle.properties`

## Interaction with shared contracts

| Contract | Role | How |
| :--- | :--- | :--- |
| `sc1` | implements | s1 owns sc1: creates src/shared/ipc-client with the moved rpc + IpcClient { rpc, status, reachability } re-exporting the real IpcRequest/IpcResponse/DaemonStatus + sockFilePath; cli/client.ts re-exports rpc. The reachability() method is added via the methodAdd amendment (the wire DaemonStatus has no `running` field). |
| `sc2` | implements | s1 owns sc2: a StatusSurface with set/current over an injected StatusBarItem handle; activation pushes the derived DaemonUiState so the status-bar reflects running/stopped/errored/unknown (ac2). |
| `sc3` | implements | s1 owns sc3: a CommandRegistry.register over an injected registerCommand + the ExtensionContext.subscriptions Disposable sink. s1 registers no command bodies — it provides the durable-registration surface that s2/s3/s4/s5 populate (k6). |
| `sc4` | implements | s1 owns sc4: a ConsentGate.ask over an injected modal message fn returning accepted/declined/dismissed. s1 performs no invasive action; it only supplies the single consent gate the invasive stories (s2/s3/s4) call before any side effect (k4). |

## Error paths

### Error cases

- **The daemon is not installed or not running when the extension activates (socket path absent / refused).** (recoverable)
  - Detection: reachability() calls rpc('daemon.status'); the rpc socket 'error' handler sees err.code ENOENT or ECONNREFUSED and rejects with the 'daemon is not running' Error, which reachability() catches and classifies as 'stopped'.
  - Response: Activation completes normally; the status surface is set to { state: 'stopped' }. No exception propagates out of activate().
  - User impact: The developer sees a 'stopped' status-bar indicator rather than a broken/erroring extension; later stories offer install/start via durable commands.
- **The daemon socket exists but the daemon returns an error or an unparseable line for daemon.status.** (recoverable)
  - Detection: rpc() either rejects with Error(res.error) (daemon returned {error}) or Error('invalid response from daemon') (JSON.parse failed); reachability() catches any non-ENOENT/ECONNREFUSED throw.
  - Response: reachability() classifies it as 'errored'; the status surface is set to { state: 'errored', detail: <message> }.
  - User impact: The developer sees an 'errored' indicator with a hover detail; the extension stays loaded and usable.
- **The daemon.status call hangs (socket connects but no response line arrives).** (recoverable)
  - Detection: The reachability probe is wrapped in a bounded timeout (activation must not block the editor per the performance NFR); when the timeout elapses before a response, the probe resolves to a timed-out outcome.
  - Response: reachability() treats the timeout as 'errored' (or 'stopped' if the connection never established); the status surface reflects that and activation is never blocked waiting.
  - User impact: The editor never hangs on activation; the developer sees a non-running status within the bounded window.
- **A command id is registered more than once (e.g. two seams register the same InsrcCommandId).** (terminal)
  - Detection: CommandRegistry.register checks its internal id set (or catches the VS Code 'command already exists' error from the injected registerCommand) before/at registration.
  - Response: The duplicate registration throws a programming-error Error during activation of the offending seam; the first registration stands. (s1 registers no commands itself, so this only fires on a downstream misuse.)
  - User impact: None at runtime for a correct build; a duplicate is caught in tests/dev, not shipped.
- **No workspace folder is open when the extension activates.** (recoverable)
  - Detection: activate() reads the VS Code workspace folders and finds none.
  - Response: The extension still activates and probes reachability (the daemon is machine-global, not workspace-scoped); the status surface shows the daemon state. Workspace-scoped behavior (registration) is s4's concern and simply has nothing to enrol yet.
  - User impact: The developer sees daemon status even with no folder open; nothing errors.

### Edge cases

| Input | Expected |
| :--- | :--- |
| daemon.status resolves but with modelPullStatus: 'pulling' (daemon up but still pulling a model). | reachability() returns 'running' (the call succeeded); the status surface shows 'running' (optionally a detail noting a pull in progress). Model-pull nuance is not a reachability state. |
| The extension is disabled then re-enabled (deactivate then activate again). | deactivate() disposes the status-bar item + command Disposables via ExtensionContext.subscriptions; a fresh activate() rebuilds them cleanly with no duplicate status-bar items or leaked registrations. |
| A consumer calls IpcClient.status() concurrently from two seams during activation. | Each call opens its own short-lived socket via the connect seam (rpc is unary and closes on first line), so concurrent calls are independent; no shared mutable socket state. |
| The CLI/TUI runs after the extraction (rpc now lives in src/shared/ipc-client, re-exported from src/cli/client.ts). | The four importers (src/cli/services/{debug,repo,config,daemon}.ts) resolve `rpc` unchanged; the client-identity envelope still sends { label: 'cli', pid } so the daemon's attached-client registry is unaffected. |

### Invariants to preserve

- src/cli/client.ts's public `rpc` export must remain byte-compatible for its four CLI/TUI importers after the body moves to src/shared/ipc-client (a re-export) — the CLI/TUI must not regress, including the { label: 'cli', pid } client-identity envelope on the wire. [[c2]]
- The daemon IPC method names, payload shapes, and socket path (~/.insrc/daemon.sock) stay identical — the shared client is a move, not a protocol change; the daemon and every other client remain interoperable. [[c2]]

## Test strategy

**Test framework:** `node:test (tsx --test) — the repo's existing runner for src/**/__tests__/*.test.ts; the new vscode-plugin/ package uses the same node:test runner over injected fakes so its logic tests need no VS Code host (mirroring the JetBrains stories' off-platform unit + source-scan split).`

### Test levels

- **unit** — Prove the sc1 client's reachability derivation + the sc2/sc3/sc4 surface logic without booting VS Code, using injected fakes for the socket connect seam and the VS Code API handles.
  - Subjects: `src/shared/ipc-client: rpc() over a fake connect seam (success resolves result; ENOENT/ECONNREFUSED → 'daemon is not running' Error; {error} line → Error(res.error); non-JSON line → 'invalid response from daemon'); client-identity envelope { label, pid } written on connect`, `IpcClient.reachability(): success ⇒ 'running'; 'daemon is not running' throw ⇒ 'stopped'; other throw ⇒ 'errored'; timeout ⇒ 'errored'`, `StatusSurface: set()/current() maps each DaemonUiState to the fake status-bar handle's text/icon`, `CommandRegistry: register() pushes a Disposable into a fake subscriptions sink and rejects a duplicate InsrcCommandId`, `ConsentGate: ask() maps the fake modal fn's return to accepted/declined/dismissed and performs no side effect`
  - Fixtures: `a fake Socket (EventEmitter-like) that scripts connect/data/error events`, `a fake StatusBarItem handle (records text/tooltip)`, `a fake registerCommand fn + a fake Disposable sink`, `a fake modal-message fn returning a scripted selection`
- **unit** — Prove the activation shell wires the surfaces + derives+pushes reachability, and never throws, with a fully faked VS Code API + injected ipc client.
  - Subjects: `activate(context): constructs client + sc2/sc3/sc4, registers the status-bar item into context.subscriptions, runs the bounded reachability probe off the UI path, and calls StatusSurface.set with the derived state`, `activate(context): a probe that throws/times out degrades to 'stopped'/'errored' and activation still returns (never throws)`, `deactivate(): disposes status-bar + command Disposables (re-activate leaves no duplicate item)`
  - Fixtures: `a fake ExtensionContext with a subscriptions array`, `an injected IpcClient whose reachability() is scripted per case`
- **contract** — Prove the extraction preserves the CLI/TUI surface + the daemon wire contract (the Phase-A backward-compat invariant).
  - Subjects: `src/cli/client.ts still exports `rpc` (a re-export of src/shared/ipc-client) with an identical call signature — a source/type-level assertion that the four importers (src/cli/services/{debug,repo,config,daemon}.ts) resolve it unchanged`, `src/shared/ipc-client re-exports IpcRequest/IpcResponse/DaemonStatus from src/shared/types.ts (no parallel type definitions)`, `src/shared/ipc-client's import graph contains no daemon internals/indexer/storage modules (k5 thin-boundary guard, a source-scan assertion)`
  - Fixtures: `the built module graph / import list of src/shared/ipc-client`

### Acceptance mapping

| Criterion | Proving tests |
| :--- | :--- |
| `ac1` | `activate(context) constructs the surfaces + probes reachability and never modifies the editor / never throws (activation unit test)`, `IpcClient.reachability() derives running/stopped/errored from the daemon.status call outcome (reachability unit test) — proves 'determines whether the daemon is reachable'`, `src/shared/ipc-client import-graph contains no daemon internals/indexer/storage (k5 contract test) — proves the thin boundary + no in-process reasoning` |
| `ac2` | `StatusSurface.set maps each DaemonUiState (running/stopped/errored/unknown) to the status-bar handle (StatusSurface unit test)`, `activate(context) pushes the derived DaemonUiState into the status surface so the indicator reflects the daemon state (activation unit test)` |

## Alternatives considered

### a1: Faithful-wire sc1 factory + injectable VS Code-backed sc2/sc3/sc4 seams — **CHOSEN**

src/shared/ipc-client re-exports the REAL IpcRequest/IpcResponse/DaemonStatus + the moved `rpc` fn + `sockFilePath`, and adds a tiny `createIpcClient(connect?)` factory whose `.rpc()`/`.status()`/`.reachability()` derive reachability from call outcome; sc2/sc3/sc4 are plain interfaces each with one default VS Code-backed impl behind an injectable boundary, wired by an activation shell.

sc1: create src/shared/ipc-client.ts holding the `rpc` fn body (moved verbatim, keeping the `connect` seam + client-identity envelope), re-exporting IpcRequest/IpcResponse + the real DaemonStatus from src/shared/types.ts and sockFilePath (= PATHS.sockFile). Add a thin IpcClient { rpc, status, reachability } produced by createIpcClient(connect?); reachability is DERIVED (status resolves ⇒ running; ENOENT/ECONNREFUSED throw ⇒ stopped; other throw ⇒ errored). src/cli/client.ts becomes a re-export so the four CLI importers are byte-unchanged. sc2/sc3/sc4 are plain interfaces each with one default impl wrapping a narrow injected VS Code surface, so their logic is unit-testable with a fake. The activation entry constructs the client + surfaces, registers the status-bar item, kicks off an off-the-UI reachability probe, and pushes the derived DaemonUiState into sc2.

### a2: Class-based IpcClient holding a cached status + class-based surfaces

sc1 as a stateful `IpcClient` class that owns the connect seam and caches the last DaemonStatus plus a `running` boolean field; sc2/sc3/sc4 as classes constructed at activation.

src/shared/ipc-client exports a class IpcClient constructed with an optional connect seam; it exposes rpc(), status(), and a cached lastStatus/running it refreshes on each call. The activation shell instantiates it once and shares the instance; sc2/sc3/sc4 are likewise classes holding their VS Code handles as private fields. Reachability is read off the cached running boolean updated after each probe.

**Rejected because:** Honors k5 but only PARTIAL on ac2 (a cached `running` boolean can lag the real daemon state), sc1 (class ceremony over the functional precedent + cache to invalidate) and sc4 (class-held handles harder to fake). No hard violation but weaker than a1 on freshness + testability.

### a3: No extraction — the extension imports src/cli/client.ts directly

Skip the src/shared/ipc-client module; the vscode-plugin/ imports the existing `rpc` from src/cli/client.ts and defines sc2/sc3/sc4 locally.

Rather than moving rpc, the extension imports it straight from src/cli/client.ts (whose current imports are already shared-safe), and stands up sc2/sc3/sc4 in vscode-plugin/. sc1 as a named contract still exists conceptually but its home stays under src/cli/. This is the smallest possible change to the backend.

**Rejected because:** VIOLATES k5 and sc1 by coupling the extension to src/cli/ instead of the mandated src/shared/ipc-client extraction; the smallest change but breaks the load-bearing thin-boundary contract, so it ranks last.

## Citations

- **[[c1]]** `analyze-bundle` `s1 symbol.locate: src/cli/client.ts:15 `export async function rpc<T = unknown>(method, params, connect = () => createConnection(PATHS.sockFile)): Promise<T>` — unary JSON-RPC-over-Unix-socket, imports only node:net + shared/types + shared/paths` — "extracting the fn body into a NEW src/shared/ipc-client.ts and leaving src/cli/client.ts as a re-export is mechanically clean."
- **[[c2]]** `analyze-bundle` `s1 usage.example + data-model.trace: the four rpc importers (src/cli/services/{debug:25,repo:15,config:12,daemon:17}.ts); IpcRequest(798)/IpcResponse(812)/DaemonStatus(882) in src/shared/types.ts; daemon.status handler src/daemon/index.ts:913 returns DaemonStatus with no `running` field; socket ~/.insrc/daemon.sock (paths.ts:19)` — "the daemon's real DaemonStatus (types.ts:882) is {uptime, repos[], queueDepth, embeddingsPending, modelPull*, lmdbFileSizeMb?} — it has NO `running` boolean; reachability is INFERRED at the client."
- **[[c3]]** `analyze-bundle` `s1 convention.detect: no VS Code manifest exists today; vscode-plugin/ is a NEW package sibling to jetbrains-plugin/; VS Code API (createStatusBarItem/registerCommand/showInformationMessage) is the sc2/sc3/sc4 substrate behind injectable boundaries` — "s1 stands up only the minimal package + activation entry it needs to compile and register the status-bar item + commands, deferring listing/publish metadata to s6."
- **[[c4]]** `convention` `CLAUDE.md: TypeScript strict/ESM/NodeNext; 'No direct cloud REST' (k2); tests via `npx tsx --test src/**/__tests__/*.test.ts` (node:test)` — "The extension is a thin orchestrator: it displays and acts, but performs no reasoning of its own."

<!-- insrc:review -->

## Review

### ✅ Review `PASS` — design.story (design.story)

**0 HIGH · 0 MED · 8 LOW** · model `client` · reviewed 2026-09-21T17:20:56.910Z

| Ref | Kind | Severity | Fixability | Premise | Evidence | Action |
| --- | --- | --- | --- | --- | --- | --- |
| rpc | citation | LOW | auto | src/cli/client.ts:15 defines `export async function rpc<T = unknown>(method, params, connect = () => createConnection(PATHS.sockFile)): Promise<T>` — the fn the LLD moves into src/shared/ipc-client. | Confirmed verbatim: src/cli/client.ts:15 = `export async function rpc<T = unknown>(method: string, params: unknown = {}, connect: () => Socket = () => createConnection(PATHS.sockFile)): Promise<T>`. The move-into-src/shared/ipc-client premise is grounded. | None — rpc signature/location resolves. |
| dataModel | inventory | LOW | auto | Exactly four non-test files import `rpc` from '../client.js': src/cli/services/{debug,repo,config,daemon}.ts — the importers the re-export must keep byte-compatible. | Confirmed: the four importers src/cli/services/{config:12,daemon:17,debug:25,repo:15}.ts each `import { rpc } from '../client.js'` — exactly the inventory the byte-compatible re-export must preserve. No other non-test importer. | None — importer inventory is exact. |
| IpcClient.status | citation | LOW | auto | The daemon's real DaemonStatus (src/shared/types.ts:882) has fields uptime/repos[]/queueDepth/embeddingsPending/modelPull*/lmdbFileSizeMb? and NO `running` boolean — the basis for the reachability amendment. | Confirmed: src/shared/types.ts:882 `export interface DaemonStatus {` with uptime/repos/queueDepth/embeddingsPending/modelPull*/lmdbFileSizeMb? and no `running` field (the test fixture at command.test.ts:32 mirrors those fields). The reachability-amendment basis holds. | None — DaemonStatus shape confirmed; reachability derivation is correctly grounded. |
| IpcClient.status | citation | LOW | auto | The daemon registers a 'daemon.status' IPC handler (src/daemon/index.ts:913) returning that DaemonStatus — the call reachability() makes. | Confirmed: src/daemon/index.ts:913 `'daemon.status': async () => {` — the real handler reachability() calls. | None — daemon.status handler resolves. |
| IpcRequest/IpcResponse | citation | LOW | auto | src/shared/types.ts already exports IpcRequest (798) and IpcResponse (812) that the shared client re-uses (no mirrored copies), and IpcRequest carries the { label, pid } client envelope. | Confirmed: src/shared/types.ts:798 IpcRequest, :812 IpcResponse, and :809 the `client?: { readonly label; readonly pid }` envelope — the shared client reuses these existing types (no mirrored copies), and the { label, pid } wire envelope is real. | None — IPC types + client envelope confirmed. |
| dataModel | citation | LOW | auto | src/shared/paths.ts:19 defines sockFile = join(INSRC_DIR, 'daemon.sock') — the socket path the sc1 client dials / exposes as sockFilePath. | Confirmed: src/shared/paths.ts:19 `sockFile: join(INSRC_DIR, 'daemon.sock')` — the socket path the sc1 client dials / exposes. | None — socket path resolves. |
| dataModel | semantic | LOW | auto | src/cli/client.ts's only imports are node:net + src/shared/types + src/shared/paths (all shared-safe), so extracting rpc into src/shared/ipc-client pulls no daemon internals (the k5 thin-boundary basis). | Confirmed: src/cli/client.ts:1 imports only `{ createConnection, Socket } from 'node:net'` plus IpcRequest/IpcResponse from ../shared/types.js and PATHS from ../shared/paths.js — no daemon internals/indexer/storage on the import graph, so the extraction keeps the k5 thin boundary. (The 52 grep hits are unrelated Socket uses across the tree, not client.ts imports.) | None — the thin-boundary import basis holds; a build-time import-graph test is specified to guard it. |
| interactionWithShared | cross-artifact | LOW | auto | s1 implements only contracts it owns per the HLD (sc1-sc4); the adjacent-owned sc5/sc6/sc7 are named only as future consumers, not implemented here. | Internal-consistency check (no source probe): the LLD's interactionWithShared implements only sc1-sc4 (all ownedByStory=s1 in the HLD); sc5/sc6/sc7 appear only as adjacent-owned future consumers, never designed/implemented — the scope boundary (sbdry5) holds. | None — s1 stays within its owned contracts. |
