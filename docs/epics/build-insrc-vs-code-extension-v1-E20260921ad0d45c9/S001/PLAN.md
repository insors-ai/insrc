<!-- insrc:artifact PLAN-ad0d45c9d690f8c1-s1 -->

# Plan: E20260921ad0d45c9:S001

**Epic:** `build-insrc-vs-code-extension-v1`
**LLD run:** `wf-1790010529619-xyb76l`
**LLD effective hash:** `1e2038ef7232...`

## Tasks

| # | Task | Size | Depends on | Tests | Derived from |
| :--- | :--- | :--- | :--- | :--- | :--- |
| 1 | **`t1`** Extract src/shared/ipc-client + make src/cli/client.ts a re-export | M | — | unit: rpc() over a fake connect seam: success resolves result; ENOENT/ECONNREFUSED→'daemon is not running'; {error} line→Error(res.error); non-JSON→'invalid response from daemon'; { label:'cli', pid } envelope written on connect; unit: reachability() derives running/stopped/errored/(timeout→errored) from the call outcome and never throws; unit: source-scan: src/cli/client.ts re-exports rpc from src/shared/ipc-client and src/shared/ipc-client re-exports IpcRequest/IpcResponse/DaemonStatus from src/shared/types (no parallel type defs); import graph has no daemon internals/indexer/storage | [[c1]] |
| 2 | **`t2`** Scaffold the vscode-plugin/ package + activation entry | S | — | smoke: vscode-plugin/ builds (tsc) and its entry module exports activate + deactivate; unit: source-scan: the extension bundle imports only src/shared/ipc-client (no daemon internals/indexer/storage/cloud path) — k2/lc2/k5 | [[c5]] |
| 3 | **`t3`** Implement sc2 StatusSurface | S | `t2` | unit: StatusSurface.set()/current() maps each DaemonUiState (running/stopped/errored/unknown) to the fake status-bar handle's text/icon | [[c2]] |
| 4 | **`t4`** Implement sc3 CommandRegistry | S | `t2` | unit: CommandRegistry.register() pushes a Disposable into a fake subscriptions sink and rejects a duplicate InsrcCommandId | [[c3]] |
| 5 | **`t5`** Implement sc4 ConsentGate | S | `t2` | unit: ConsentGate.ask() maps the fake modal fn's return to accepted/declined/dismissed and performs no side effect | [[c4]] |
| 6 | **`t6`** Wire the activation shell (never-throws, off-UI probe → status) | M | `t1`, `t3`, `t4`, `t5` | unit: activate(context) constructs client + sc2/sc3/sc4, registers the status-bar item into context.subscriptions, runs the reachability probe off the UI path and calls StatusSurface.set with the derived state; unit: activate(context): a probe that throws/times out degrades to 'stopped'/'errored' and activation still returns (never throws); unit: deactivate() disposes status-bar + command Disposables (re-activate leaves no duplicate item) | [[c1]] [[c2]] [[c3]] [[c4]] [[c5]] |

### E20260921ad0d45c9:S001:T001 — Extract src/shared/ipc-client + make src/cli/client.ts a re-export

Create src/shared/ipc-client.ts holding the moved `rpc` fn (body verbatim from src/cli/client.ts:15, keeping the connect seam + {label,pid} envelope), plus a `createIpcClient(connect?)` factory exposing rpc<T>(), status(): Promise<DaemonStatus> (rpc('daemon.status')), and reachability(): Promise<DaemonReachability> (success⇒running; the ENOENT/ECONNREFUSED 'daemon is not running' throw⇒stopped; other throw⇒errored; never throws). Re-export IpcRequest/IpcResponse/DaemonStatus from src/shared/types.js and `sockFilePath` (= PATHS.sockFile). Turn src/cli/client.ts into `export { rpc } from '../shared/ipc-client.js'`.

**Acceptance checks:**
- src/shared/ipc-client.ts exports rpc, createIpcClient, IpcRequest, IpcResponse, DaemonStatus, DaemonReachability, sockFilePath
- src/cli/client.ts re-exports rpc; the four importers (src/cli/services/{debug,repo,config,daemon}.ts) compile + pass unchanged, and the { label: 'cli', pid } client-identity envelope is still emitted on the wire
- reachability() derives running/stopped/errored from the call outcome and never throws
- src/shared/ipc-client's import graph contains only node:net + src/shared/types + src/shared/paths (no daemon internals/indexer/storage)

### E20260921ad0d45c9:S001:T002 — Scaffold the vscode-plugin/ package + activation entry

Create the NEW top-level vscode-plugin/ package (sibling to jetbrains-plugin/): its own tsconfig (strict/ESM/NodeNext) + a MINIMAL package.json with only what s1 needs to compile and declare the activation entry + status-bar contribution (the Marketplace listing metadata / full contributes / .vsix packaging is s6's boundary, deferred). Add the extension entry module exporting activate(context)/deactivate() stubs the later tasks fill in. Wire it to import the shared ipc-client.

**Acceptance checks:**
- vscode-plugin/ exists with tsconfig.json + a minimal package.json declaring the activation entry (no Marketplace listing metadata — that is s6)
- the package builds and exports activate/deactivate
- no reasoning/LLM/analysis/graph code is present in the extension (k2/lc2)

### E20260921ad0d45c9:S001:T003 — Implement sc2 StatusSurface

Add the StatusSurface interface (set(snapshot: StatusSnapshot): void; current(): StatusSnapshot) with DaemonUiState = running|stopped|errored|unknown, and one default impl wrapping an INJECTED status-bar handle (window.createStatusBarItem passed in), mapping each DaemonUiState to text/icon. No daemon calls here.

**Acceptance checks:**
- StatusSurface.set updates the injected handle's text/icon per DaemonUiState; current() returns the last snapshot
- the impl takes its VS Code handle via injection so it is testable with a fake (no live window required)

### E20260921ad0d45c9:S001:T004 — Implement sc3 CommandRegistry

Add the CommandRegistry interface (register(descriptor: CommandDescriptor, run: () => Promise<void>): void) with InsrcCommandId + CommandDescriptor, and a default impl over an INJECTED registerCommand-like fn that pushes each Disposable into the ExtensionContext.subscriptions sink and rejects a duplicate InsrcCommandId. s1 registers no command bodies itself.

**Acceptance checks:**
- register() registers via the injected fn and stores the Disposable in the subscriptions sink
- registering the same InsrcCommandId twice throws a guarded programming-error
- no command bodies are registered by s1 (the registry is the only surface)

### E20260921ad0d45c9:S001:T005 — Implement sc4 ConsentGate

Add the ConsentGate interface (ask(request: ConsentRequest): Promise<ConsentOutcome>) with ConsentRequest {title, detail, acceptLabel, items?} + ConsentOutcome = accepted|declined|dismissed, and a default impl over an INJECTED modal message fn (window.showInformationMessage modal:true) mapping the selection to the outcome. s1 performs NO invasive action — it only supplies the gate.

**Acceptance checks:**
- ask() maps the injected modal fn's return to accepted/declined/dismissed
- no side effect occurs in s1 — the gate performs nothing itself

### E20260921ad0d45c9:S001:T006 — Wire the activation shell (never-throws, off-UI probe → status)

Fill activate(context): construct the ipc client (t1) + sc2/sc3/sc4 (t3/t4/t5), register the status-bar item into context.subscriptions, and kick off a BOUNDED off-the-UI-path reachability probe whose derived DaemonUiState is pushed into StatusSurface.set; a failed/timed-out probe degrades to stopped/errored and activation never throws / never modifies the editor. deactivate() disposes the status-bar item + registered Disposables so a re-activate leaves no duplicate.

**Acceptance checks:**
- activate() constructs client + surfaces, registers the status-bar item, runs the reachability probe OFF the activation critical path (activate() returns without awaiting/blocking on it) and pushes the derived state to sc2 (ac1/ac2)
- activate() never throws and never modifies the editor even when the probe fails/times out (degrades to stopped/errored within a bounded deadline)
- deactivate() disposes the status-bar item + command Disposables (re-activate leaves no duplicate)

## Test-strategy coverage

| LLD strategy item | Covered by |
| :--- | :--- |
| src/shared/ipc-client: rpc() over a fake connect seam (success resolves result; ENOENT/ECONNREFUSED → 'daemon is not running' Error; {error} line → Error(res.error); non-JSON line → 'invalid response from daemon'); client-identity envelope { label, pid } written on connect | `t1` |
| IpcClient.reachability(): success ⇒ 'running'; 'daemon is not running' throw ⇒ 'stopped'; other throw ⇒ 'errored'; timeout ⇒ 'errored' | `t1` |
| StatusSurface: set()/current() maps each DaemonUiState to the fake status-bar handle's text/icon | `t3` |
| CommandRegistry: register() pushes a Disposable into a fake subscriptions sink and rejects a duplicate InsrcCommandId | `t4` |
| ConsentGate: ask() maps the fake modal fn's return to accepted/declined/dismissed and performs no side effect | `t5` |
| activate(context): constructs client + sc2/sc3/sc4, registers the status-bar item into context.subscriptions, runs the bounded reachability probe off the UI path, and calls StatusSurface.set with the derived state | `t6` |
| activate(context): a probe that throws/times out degrades to 'stopped'/'errored' and activation still returns (never throws) | `t6` |
| deactivate(): disposes status-bar + command Disposables (re-activate leaves no duplicate item) | `t6` |
| src/cli/client.ts still exports `rpc` (a re-export of src/shared/ipc-client) with an identical call signature — a source/type-level assertion that the four importers (src/cli/services/{debug,repo,config,daemon}.ts) resolve it unchanged | `t1` |
| src/shared/ipc-client re-exports IpcRequest/IpcResponse/DaemonStatus from src/shared/types.ts (no parallel type definitions) | `t1` |
| src/shared/ipc-client's import graph contains no daemon internals/indexer/storage modules (k5 thin-boundary guard, a source-scan assertion) | `t1`, `t2` |

## Citations

- **[[c1]]** `prior-artifact` `LLD s1 sc1 SharedIpcClient — rpc extraction + createIpcClient { rpc, status, reachability } + cli/client.ts re-export (methodAdd amendment sc1.reachability)`
- **[[c2]]** `prior-artifact` `LLD s1 sc2 StatusSurface — set/current over an injected status-bar handle, DaemonUiState`
- **[[c3]]** `prior-artifact` `LLD s1 sc3 CommandRegistry — register over an injected registerCommand + subscriptions sink, InsrcCommandId, duplicate-id guard`
- **[[c4]]** `prior-artifact` `LLD s1 sc4 ConsentGate — ask over an injected modal fn returning accepted/declined/dismissed`
- **[[c5]]** `prior-artifact` `LLD s1 activate/deactivate + vscode-plugin/ package scaffold (minimal manifest; Marketplace listing deferred to s6)`

<!-- insrc:review -->

## Review

### ✅ Review `PASS` — plan (plan)

**0 HIGH · 0 MED · 5 LOW** · model `client` · reviewed 2026-09-21T17:48:55.983Z

| Ref | Kind | Severity | Fixability | Premise | Evidence | Action |
| --- | --- | --- | --- | --- | --- | --- |
| t1 | inventory | LOW | manual | Exactly four non-test files import `rpc` from '../client.js' (src/cli/services/{debug,repo,config,daemon}.ts) — the importers t1's re-export must keep byte-compatible. | Confirmed exactly four src importers of `rpc` from '../client.js': src/cli/services/config.ts:12, daemon.ts:17, debug.ts:25, repo.ts:15 (the 5th grep hit is the LLD doc itself, not a source import). t1's re-export must preserve exactly these. | none — verified sound |
| t1 | citation | LOW | manual | src/cli/client.ts:15 holds the `rpc` fn body that t1 moves into src/shared/ipc-client. | Read src/cli/client.ts:15 = `export async function rpc<T = unknown>(method: string, params: unknown = {}, connect: () => Socket = () => createConnection(PATHS.sockFile)): Promise<T> {` — the exact fn t1 moves. Confirmed verbatim. | none — verified sound |
| t1 | semantic | LOW | manual | src/cli/client.ts imports only node:net + src/shared/types + src/shared/paths, so t1's extraction keeps the k5 thin boundary (no daemon internals to leak). | src/cli/client.ts:1 imports { createConnection, Socket } from 'node:net'; :2 IpcRequest/IpcResponse from ../shared/types.js; :3 PATHS from ../shared/paths.js — no daemon internals/indexer/storage on the graph, so t1's extraction keeps the k5 thin boundary. | none — verified sound |
| tasks | ordering | LOW | manual | The plan task DAG is acyclic and topologically ordered: t1/t2 have no deps; t3/t4/t5 depend on t2; t6 depends on t1/t3/t4/t5 — every dependency precedes its dependant by `order`. | Self-contained artifact-internal claim (no source probe needed): the plan's own task table shows t1/t2 with no deps, t3/t4/t5 dependsOn t2, t6 dependsOn t1/t3/t4/t5, with orders 1-6 — a valid acyclic topological order (every dependency's order < its dependant's). Verified in the s6 checklist (t3 passed). | none — verified sound |
| coverage | cross-artifact | LOW | manual | Every LLD testStrategy subject (11 items) maps to ≥1 covering task in testStrategyCoverage, and every derivedFrom citation c1-c5 traces to an approved-LLD sc/handoff item. | Self-contained artifact-internal claim: the plan's testStrategyCoverage table maps all 11 LLD subjects each to ≥1 task (t1×5/t2×1/t3/t4/t5/t6×3), and citations c1-c5 each carry a prior-artifact ref to an approved-LLD sc/handoff item, each referenced by ≥1 task. Verified in the s6 checklist (cov1/cov2/gr1 passed). | none — verified sound |
