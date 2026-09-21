<!-- insrc:artifact HLD-ad0d45c9d690f8c1 -->

# HLD: The insrc VS Code extension is a thin orchestrator that owns no reasoning: a new top-level vscode-plugin/ TypeScript package (sibling to jetbrains-plugin/, its own package

## Framework summary

The insrc VS Code extension is a thin orchestrator that owns no reasoning: a new top-level vscode-plugin/ TypeScript package (sibling to jetbrains-plugin/, its own package.json + build + Marketplace metadata) whose whole job is to wire insrc into stock VS Code at lifecycle moments (activate, first workspace open, uninstall). It re-expresses the shipped jetbrains-plugin/ thin-config-orchestrator in TS over VS Code primitives, reaching the daemon ONLY through a NEW in-repo src/shared/ipc-client module that generalizes the existing src/cli/client.ts `rpc` fn + its IPC request/reply types + the socket path — giving exactly one socket-client code path shared by the CLI and the extension (k5), with no daemon internals, indexer, or storage in the extension bundle, and no cloud path opened by the extension (k2). The extension is decomposed into small per-capability seams, each with an injectable boundary so its load-bearing logic is unit-testable off the VS Code API, and every invasive action (install the daemon, wire a host, register the workspace) is consent-gated and exposed as a durable first-class command.

## Architecture shape

Five layers, each a thin seam, wired by a foundation activation shell:

1. FOUNDATION (s1): the activation entry that loads without modifying the editor, probes daemon reachability via the shared ipc-client, and stands up the cross-cutting shells every later capability composes — the shared IPC client (sc1), the glanceable status surface (sc2), the durable command registry (sc3), and the single consent gate (sc4). These four contracts are cross-cutting across capabilities in different dependency branches (s2/s3/s4 all sit directly on s1), so they are owned at s1, the nearest common ancestor every consumer already depends on.

2. DAEMON LIFECYCLE (s2): a lifecycle controller (sc6) over the daemon's own daemon-ctl.sh (start/stop/restart/update) plus a prompt-gated bootstrap that installs the daemon from an installer asset bundled in the extension itself — reflecting resulting state through sc2, exposed as sc3 commands behind sc4.

3. HOST WIRING (s3): a pluggable AiHostAdapter interface (sc5) — detect-present + reversible, marker-delimited wire/unwire of the mcpServers.insrc registration and the tracked-workflow steering into each detected host's own config — so a new host plugs into the same detection-and-wiring flow without reworking existing adapters (ac3), all behind one combined sc4 consent.

4. WORKSPACE REGISTRATION (s4): a workspace registrar (sc7) that enrols the open root ONLY through the daemon's explicit repo.add contract (k3), one-time and opt-in via sc4.

5. ONBOARDING CAPSTONE (s5): composes the lifecycle (sc6), host-adapter (sc5), and registrar (sc7) seams into one coherent first-run consent flow, keeps every step reachable as a durable sc3 command, and reverses the sc5 wiring on uninstall. It owns no new shared contract — it is the consumer that ties the branch owners together (it dependsOn s2, s3 and s4).

PUBLISH (s6): the vscode-plugin/package.json manifest + listing assets + a manually-triggered (workflow_dispatch) Marketplace-only publish; depends only on the s1 package existing and owns no runtime contract.

## Shared contracts

### sc1: SharedIpcClient

**Owner Story:** `s1`
**Consumed by:** `s1`, `s2`, `s4`, `s5`

**Purpose:** The single thin socket-client boundary (k5): a generalized `rpc` fn + the daemon IPC request/reply types + the socket path, extracted into src/shared/ipc-client so both src/cli and vscode-plugin/ import ONE client. Keeps daemon internals/indexer/storage out of the extension and is the only channel through which the extension reaches reasoning (k2).

**Interface sketch (type-level):**

```
// src/shared/ipc-client
export interface IpcRequest<P = unknown> { method: string; params?: P }
export interface DaemonStatus {
  running: boolean;
  uptimeMs?: number;
  version?: string;
  queueDepth?: number;
  registeredRepos?: number;
}
export type DaemonReachability = 'running' | 'stopped' | 'errored';
export interface IpcClient {
  rpc<T>(method: string, params?: unknown): Promise<T>;
  status(): Promise<DaemonStatus>;
}
export declare const sockFilePath: string; // = PATHS.sockFile
```

**Assumptions cited:** [[c1]] [[c2]]

### sc2: StatusSurface

**Owner Story:** `s1`
**Consumed by:** `s1`, `s2`, `s5`

**Purpose:** The glanceable editor status indicator (ac2/k6): a small state model reflecting the daemon as running/stopped/errored plus an update method the lifecycle and onboarding seams push resulting state into. Owned at the foundation because the status-bar view is created at activation and updated from multiple branches.

**Interface sketch (type-level):**

```
export type DaemonUiState = 'running' | 'stopped' | 'errored' | 'unknown';
export interface StatusSnapshot {
  state: DaemonUiState;
  detail?: string;
}
export interface StatusSurface {
  set(snapshot: StatusSnapshot): void;
  current(): StatusSnapshot;
}
```

**Assumptions cited:** [[c1]]

### sc3: CommandRegistry

**Owner Story:** `s1`
**Consumed by:** `s1`, `s2`, `s3`, `s4`, `s5`

**Purpose:** The durable-command contract (ac2/k6): a registration surface for the extension's first-class commands (install, wire, register, and the daemon lifecycle actions) so no dismissed onboarding prompt becomes a dead end. Cross-cutting across s2/s3/s4/s5 — owned at the nearest common ancestor s1.

**Interface sketch (type-level):**

```
export type InsrcCommandId =
  | 'insrc.daemon.install' | 'insrc.daemon.start' | 'insrc.daemon.stop'
  | 'insrc.daemon.restart' | 'insrc.daemon.update'
  | 'insrc.hosts.wire' | 'insrc.workspace.register';
export interface CommandDescriptor {
  id: InsrcCommandId;
  title: string;
}
export interface CommandRegistry {
  register(descriptor: CommandDescriptor, run: () => Promise<void>): void;
}
```

**Assumptions cited:** [[c1]]

### sc4: ConsentGate

**Owner Story:** `s1`
**Consumed by:** `s1`, `s2`, `s3`, `s4`, `s5`

**Purpose:** The single consent-prompt contract (k4): every invasive action asks and performs nothing until the developer accepts. One shape for the prompt-gated Install (s2), the single combined wiring consent naming every detected host (s3), and the one-time register prompt (s4); the onboarding capstone (s5) sequences these. Cross-cutting — owned at nearest common ancestor s1.

**Interface sketch (type-level):**

```
export interface ConsentRequest {
  title: string;
  detail: string;
  acceptLabel: string;
  items?: string[]; // e.g. the detected host names for the combined wiring prompt
}
export type ConsentOutcome = 'accepted' | 'declined' | 'dismissed';
export interface ConsentGate {
  ask(request: ConsentRequest): Promise<ConsentOutcome>;
}
```

**Assumptions cited:** [[c1]]

### sc5: AiHostAdapter

**Owner Story:** `s3`
**Consumed by:** `s3`, `s5`

**Purpose:** The pluggable AI-host adapter interface (ac3/k4/k2): detect whether a supported host is present (by installed-extension identity or running-editor environment) and reversibly wire/unwire the insrc MCP registration + tracked-workflow steering into that host's own config, preserving surrounding content. A new host plugs in without reworking existing adapters. Owned by the host-wiring story; consumed by the onboarding capstone for the wire step and the uninstall reversal.

**Interface sketch (type-level):**

```
export type HostDetection = 'by-extension-id' | 'by-editor-env';
export interface HostDescriptor {
  id: string;
  displayName: string;
  detection: HostDetection;
}
export interface AiHostAdapter {
  readonly descriptor: HostDescriptor;
  detectPresent(): Promise<boolean>;
  wire(): Promise<void>;   // reversible, marker-delimited write into the host's own config
  unwire(): Promise<void>; // removes exactly the insrc markers, restoring prior content
}
export interface AiHostRegistry {
  adapters(): readonly AiHostAdapter[];
  detectPresent(): Promise<readonly AiHostAdapter[]>;
}
```

**Assumptions cited:** [[c1]] [[c3]]

### sc6: DaemonLifecycleController

**Owner Story:** `s2`
**Consumed by:** `s2`, `s5`

**Purpose:** The daemon lifecycle contract (ac1/ac2/k4): carry out start/stop/restart/update through the daemon's own daemon-ctl.sh mechanism and provision the daemon, on explicit consent, from an installer bundled in the extension. Owned by the lifecycle story; consumed by the onboarding capstone for the install step and the durable lifecycle commands.

**Interface sketch (type-level):**

```
export type LifecycleAction = 'start' | 'stop' | 'restart' | 'update';
export interface LifecycleResult {
  ok: boolean;
  state: 'running' | 'stopped' | 'errored';
  message?: string;
}
export interface DaemonLifecycleController {
  isInstalled(): Promise<boolean>;
  install(): Promise<LifecycleResult>; // from the bundled installer asset
  run(action: LifecycleAction): Promise<LifecycleResult>;
}
```

**Assumptions cited:** [[c1]] [[c3]]

### sc7: WorkspaceRegistrar

**Owner Story:** `s4`
**Consumed by:** `s4`, `s5`

**Purpose:** The workspace-enrolment contract (k3): check whether the open root is already enrolled and register it ONLY through the daemon's explicit repo.add contract, never silently. Owned by the registration story; consumed by the onboarding capstone for the register step.

**Interface sketch (type-level):**

```
export interface RegistrationState {
  root: string;
  registered: boolean;
}
export interface WorkspaceRegistrar {
  state(root: string): Promise<RegistrationState>;
  register(root: string): Promise<RegistrationState>; // via repo.add IPC only
}
```

**Assumptions cited:** [[c1]] [[c2]]

## Story boundaries

### Story E20260921ad0d45c9:S001

**Owns:** `sc1`, `sc2`, `sc3`, `sc4`

The VS Code activation entrypoint, the extension-bundle packaging (its build over src/shared/ipc-client), and the daemon-reachability probe implementation stay private to s1. How the status-bar item is created and rendered, and the concrete extraction of src/cli/client.ts into a re-export over src/shared/ipc-client (without regressing the CLI/TUI), are internal detail — only the four type-level contracts (sc1–sc4) are exposed.

### Story E20260921ad0d45c9:S002

**Owns:** `sc6`
**Depends on:** `sc1`, `sc2`, `sc3`, `sc4`

The bundled installer asset (which installer script ships and how it is invoked over scripts/insrc-daemon-install.sh), the exact daemon-ctl.sh subcommand invocation and output parsing, and streamed lifecycle progress are private to s2. Only the sc6 lifecycle contract is exposed; the install/lifecycle commands are registered into sc3 and gated by sc4.

### Story E20260921ad0d45c9:S003

**Owns:** `sc5`
**Depends on:** `sc3`, `sc4`

The concrete per-host config locations and shapes (extension-ID hosts like Copilot/Claude Code/Continue/Cline vs editor-environment hosts like Cursor/Windsurf/VSCodium via .vscode/mcp.json or the host's own file), the marker-delimited JSON-merge and steering writers, and the detection mechanics stay private to each adapter behind sc5. Only the sc5 interface + registry is exposed; the wire command is registered into sc3 and the combined consent uses sc4.

### Story E20260921ad0d45c9:S004

**Owns:** `sc7`
**Depends on:** `sc1`, `sc3`, `sc4`

The workspace-root resolution from the open VS Code workspace folders and the already-registered check semantics stay private to s4. Only the sc7 registrar contract is exposed; enrolment goes exclusively through the daemon's repo.add over sc1, the register command is registered into sc3, and the one-time prompt uses sc4.

### Story E20260921ad0d45c9:S005

**Depends on:** `sc1`, `sc2`, `sc3`, `sc4`, `sc5`, `sc6`, `sc7`

The first-run flow sequencing (the order and coalescing of the install → register → wire consent prompts into one coherent flow rather than scattered pop-ups), the persisted 'already onboarded' state, and the uninstall hook that drives sc5.unwire across wired hosts are private to s5. It owns no new shared contract — it composes the branch owners' contracts and pushes resulting state through sc2.

### Story E20260921ad0d45c9:S006


The vscode-plugin/package.json manifest (contributes/engines.vscode/activationEvents), the Marketplace listing assets (icon, README, categories), the packaging into a single .vsix, and the manually-triggered (workflow_dispatch) Marketplace-only publish path stay entirely private to s6 — no runtime contract is exposed and it depends on no other story's contract, only on the s1 package existing.

## Non-functional targets

- **Performance:** Activation must not block the editor: the daemon-reachability probe and every socket read run off the UI path with a bounded timeout, and a stopped/unreachable daemon degrades to an 'errored'/'stopped' status rather than hanging activation (ac1/ac2).
- **Security:** No cloud path is opened by the extension and no secrets are stored (k2); all reasoning stays behind daemon IPC over the local Unix socket. Every write into a host-owned config is marker-delimited and reversible (sc5), preserving the developer's surrounding content and fully reversed on uninstall (ac3).
- **Observability:** Every invasive action reflects its resulting state through the status surface (sc2) and returns a structured LifecycleResult/RegistrationState/ConsentOutcome; consent outcomes (accepted/declined/dismissed) are explicit so a dismissed prompt is recoverable via its durable sc3 command.
- **Durability:** Workspace enrolment is durable only through the daemon's repo.add registry contract (k3) — the extension holds no shadow registry. Onboarding persists a per-workspace 'already prompted/onboarded' state so prompts are one-time, and the host wiring it writes survives a mere disable and is removed only on uninstall.

## Rollout

### Phase A — Foundation & cross-cutting contracts

**Stories:** `s1`

s1 stands up the vscode-plugin/ package, extracts the shared src/shared/ipc-client (sc1), and defines the four cross-cutting shells every later capability composes: the IPC client (sc1), status surface (sc2), command registry (sc3) and consent gate (sc4). Every other story dependsOn s1 and consumes at least one of these contracts, so nothing can land before it.

**Backward compat:** The extraction of src/cli/client.ts into a re-export over src/shared/ipc-client must not regress the existing CLI/TUI consumers of the `rpc` fn — the CLI keeps importing the same surface and the daemon IPC method names / socket path stay byte-identical.

### Phase B — Capability seams (lifecycle, host wiring, registration)

**Stories:** `s2`, `s3`, `s4`

These three seams each dependOn only s1 and own independent branch contracts (sc6 lifecycle, sc5 host-adapter, sc7 registrar), consuming s1's sc1/sc3/sc4. They sit in different dependency branches with no edges between them, so they can be built in any order or in parallel once Phase A lands; each is independently consent-gated and independently testable behind its injectable boundary.

**Backward compat:** Host wiring (s3) writes only marker-delimited, reversible blocks into each host's own config, preserving the developer's surrounding content; workspace enrolment (s4) goes exclusively through the daemon's repo.add so no shadow registry is introduced.

### Phase C — Onboarding capstone & clean removal

**Stories:** `s5`

s5 dependsOn s2, s3 and s4 and consumes their contracts (sc5/sc6/sc7) plus s1's sc2/sc3/sc4. It can only land once all three branch owners exist: it composes them into one coherent first-run consent flow, keeps every step reachable as a durable command, and reverses the sc5 wiring on uninstall.

**Backward compat:** The uninstall hook removes exactly the insrc marker blocks each adapter wrote, restoring every host config to its prior content; a mere disable leaves the wiring intact so re-enabling needs no re-prompt.

### Phase D — Marketplace publish scaffolding

**Stories:** `s6`

s6 dependsOn only s1, but is sequenced last because a Marketplace listing + manual publish is most meaningful once the onboarding feature set is complete. It adds the vscode-plugin/package.json manifest, listing assets, .vsix packaging and a manually-triggered (workflow_dispatch) Marketplace-only publish path — owning no runtime contract, so it never blocks the capability seams.

**Backward compat:** The publish path is workflow_dispatch-only (no per-push CI, honoring the avoid-CI-credits preference) and stays independent of the backend root package.json + CI, mirroring how jetbrains-plugin/ is an independent build.

**Ordering rationale:** Phase order follows the Epic dependency DAG and shared-contract ownership: A (s1) owns sc1–sc4 that every consumer needs, so it is first; B (s2/s3/s4) are the three independent branches that each dependOn only s1 and own sc6/sc5/sc7, so they follow A and may run in parallel; C (s5) is the capstone that dependsOn all three branches and consumes their contracts, so it follows B; D (s6) needs only s1 but is placed last since publishing is the terminal act once the feature is whole. Every contract owner lands strictly before its consumers (sc1–sc4 in A before B/C; sc5/sc6/sc7 in B before C).

### Risky bits

| Area | Why | Mitigation |
| :--- | :--- | :--- |
| Extracting src/shared/ipc-client from src/cli/client.ts (Phase A) | The `rpc` fn is imported by the shipped CLI/TUI; a careless extraction could regress those consumers or drift the daemon IPC contract that both the CLI and the new extension now share. | Keep src/cli/client.ts as a thin re-export of the new module so its public surface is unchanged, preserve the exact IPC method names + socket path, and run the existing CLI/workflow test sweep locally to confirm no regression before the extension consumes it. |
| Per-host MCP/steering config locations behind the AiHostAdapter (Phase B, s3) | Each VS Code AI host reads its tool config from a host-specific location/shape (extension-ID hosts like Copilot/Claude Code/Continue/Cline vs editor-environment hosts like Cursor/Windsurf/VSCodium via .vscode/mcp.json), a MED-confidence area where a wrong path silently fails to wire or corrupts a host's file. | Confine every host's concrete location + write mechanics to its own adapter behind the sc5 interface (so a wrong one is isolated and a new host plugs in without reworking others), write only marker-delimited reversible blocks, and resolve each concrete path in that adapter's Story LLD with a fake-filesystem unit test round-tripping wire/unwire. |
| Bundled-installer daemon bootstrap consent (Phase B, s2) | Provisioning the daemon from an installer shipped inside the extension is the most invasive action; a silent or mis-gated install would violate k4 and surprise the developer. | Route the install strictly through the sc4 consent gate (perform nothing until explicit accept), reuse the daemon's own scripts/insrc-daemon-install.sh rather than reimplementing provisioning, and surface the resulting state through sc2 so a failed/declined install is visible and recoverable via its durable sc3 command. |

## Alternatives considered

### a1: Thin seam-per-capability orchestrator over a shared in-repo ipc-client (JetBrains mirror) — **CHOSEN**

A new vscode-plugin/ TypeScript package structured as thin per-capability seams (host-adapter registry, daemon-lifecycle seam, workspace-registration seam, onboarding/command orchestrator, status-bar view) that all reach the daemon ONLY through a new in-repo src/shared/ipc-client package — mirroring the JetBrains onboarding epic 1:1.

The extension is a thin orchestrator that owns no reasoning: an activation shell wires a small set of independent seams, each a plain TypeScript module with an injectable boundary so it is unit-testable off the VS Code API. The cross-cutting contracts sit at their nearest-common-ancestor story: the src/shared/ipc-client boundary plus the activation shell are owned by the foundation story (S001); the pluggable AI-host adapter interface is owned by the host-wiring story (S003); the daemon-lifecycle/bootstrap seam over daemon-ctl.sh + the bundled installer is S002; the workspace-registration seam over repo.add is S004; and a durable command registry + onboarding orchestrator + status-bar view compose them in S005, with the Marketplace manifest/publish in S006.

Every invasive action routes through a single consent gate and is exposed as a first-class VS Code command, so the status-bar Quick Pick, the onboarding toasts, and any future surface merely invoke commands rather than hold logic. This is the exact package shape the shipped jetbrains-plugin/ proved, re-expressed in TypeScript over VS Code primitives — so the later settings release can attach as additional seams + surfaces without reworking v1.

**Pros:**
- Each seam has an injectable boundary (fake ipc-client, fake host filesystem, scripted lifecycle runner), so the load-bearing logic is unit-testable without booting VS Code — the same split that let the JetBrains stories ship with pure tests + thin source-scans.
- Cross-cutting contracts are owned once at the nearest-common-ancestor story, so no story re-designs another's contract; the pluggable host-adapter interface is defined in S003 and consumed unchanged by S005.
- The thin in-repo src/shared/ipc-client gives exactly ONE socket-client code path (CLI + extension), honoring k5 and eliminating the mirrored-types drift the JetBrains Kotlin plugin suffered.
- The seam structure is additive: the deferred settings release attaches new seams/surfaces without touching v1, matching the phased k6 scope.

**Cons:**
- More upfront module boundaries than a single activation file — five-ish seams + a shared package to stand up before the first end-to-end flow works.
- Extracting src/shared/ipc-client touches the existing CLI consumers (src/cli/client.ts becomes a re-export), a small cross-cutting change to already-shipped code that must not regress the CLI/TUI.

**Cost estimate:** L

### a2: Monolithic activation module with an inline socket client

Put everything in vscode-plugin/ as one activation entrypoint plus helper functions, with the daemon socket client copied inline into the extension rather than extracted into a shared package.

A single extension activation file registers the commands, the status-bar item, and the onboarding prompts, calling helper functions for lifecycle/wiring/registration; the daemon `rpc` call is copied into the extension so there is no shared-package extraction and no change to the existing CLI. Host wiring and lifecycle live as inline helpers rather than a pluggable adapter registry.

This is the fastest path to a working extension because it avoids the cross-cutting extraction and the seam scaffolding, keeping the whole extension in a handful of files. It treats the extension as a self-contained script that happens to talk to a socket.

**Pros:**
- Fastest initial bootstrap — no shared-package extraction and no risk to the existing CLI consumers, so the first activation-to-status flow lands with the fewest moving parts.
- Fewer module boundaries to reason about for a small v1.

**Cons:**
- Copying the socket client inline reintroduces exactly the mirrored-types drift k5 exists to prevent — the extension and CLI would diverge over time, and the daemon IPC contract would have two sources.
- A monolith with inline host helpers has no pluggable-adapter seam, so adding a new AI host or the deferred settings surfaces means editing the monolith rather than attaching an adapter — working against the k6 phased-growth intent (violates s3/ac3's 'plug in a new adapter without reworking the others').
- Little of the logic is unit-testable off the VS Code API because it is entangled with the activation entrypoint, unlike the injectable seams of a1.

**Cost estimate:** M

**Rejected because:** VIOLATES k5 — an inline-copied client is not the shared thin IPC boundary the constraint mandates; it reintroduces the exact daemon-contract drift k5 forbids. Only PARTIAL on k1 (a monolith is not the thin-orchestrator mirror) and k6 (no pluggable-adapter seam for phased growth, failing s3/ac3). A hard constraint violation ranks it last.

### a3: Central InsrcService facade with command-dispatch

One central InsrcService object wraps the ipc-client + lifecycle + host registry + registration; the status bar, onboarding, and commands all delegate to that single facade.

Rather than distributing behaviour across independent seams, a single stateful service object (constructed at activation) owns the daemon connection, the lifecycle operations, the host-adapter registry, and the registration state, exposing coarse methods the commands and status-bar view call. The shared src/shared/ipc-client is still extracted (honoring k5), but the extension centralizes orchestration in the one facade.

This gives a single obvious place to find every capability and a single lifecycle for the daemon connection, at the cost of a large central object that every story must touch. It is a common VS Code extension pattern (an activation-scoped service singleton) but concentrates the cross-cutting contracts into one class rather than nearest-common-ancestor seams.

**Pros:**
- One obvious entry point (the service) for every capability, with a single owned daemon-connection lifecycle — easy to discover.
- Still extracts the thin shared ipc-client, so k5 holds and there is one socket-client path.

**Cons:**
- Every story (lifecycle, wiring, registration, onboarding) must modify the one central InsrcService, so the story boundaries blur and the nearest-common-ancestor ownership the Epic wants is lost — stories stop being independent slices.
- A large activation-scoped singleton is harder to unit-test than a1's small injectable seams: faking one capability means constructing the whole service.
- Diverges from the shipped jetbrains-plugin/ precedent (distinct host/ + lifecycle + onboarding packages), losing the 1:1 mirror that de-risks the design.

**Cost estimate:** L

**Rejected because:** Honours k5 (shared client extracted) but only PARTIAL on k1 and k6: a single central facade diverges from the jetbrains distinct-package precedent and blurs the per-story nearest-common-ancestor ownership the Epic decomposition depends on. Better than a2 (no hard violation) but weaker than a1 on the two structural constraints.

## Citations

- **[[c1]]** `analyze-bundle` `s1 structural-map: src/cli/client.ts `rpc<T>(method, params, connect)` JSON-RPC-over-Unix-socket fn; daemon.status (src/daemon/index.ts:913) + repo.add (index.ts:459); PATHS.sockFile = ~/.insrc/daemon.sock` — "src/cli/client.ts exposes a single functional entry `export async function rpc<T>(method, params, connect = () => createConnection(PATHS.sockFile)): Promise<T>` — a thin JSON-RPC-over-Unix-socket call"
- **[[c2]]** `analyze-bundle` `s1 import.graph: extract src/shared/ipc-client; src/cli/client.ts becomes a thin re-export; vscode-plugin/ imports src/shared/ipc-client only — ONE socket-client path, daemon internals/indexer/storage stay out of the extension bundle (k5)` — "a new src/shared/ipc-client module would hold the `rpc` client + IPC types; src/cli/client.ts becomes a thin re-export/consumer, and the new vscode-plugin/ imports src/shared/ipc-client only."
- **[[c3]]** `analyze-bundle` `s1 capability.discovery: daemon lifecycle via scripts/daemon-ctl.sh (start/stop/restart/update/status) + scripts/insrc-daemon-install.sh; the jetbrains-plugin/.../host/ stack (AiHostAdapter + AiHostAdapterImpl detection, InsrcMcpRegistration, JsonMcpConfigWriter, MarkerFileWriter/MarkerSection, McpWiringLifecycle) the extension re-expresses in TS` — "the proven host-wiring STACK in jetbrains-plugin/.../host/ ... the extension re-expresses the host-wiring + lifecycle + status + registration behaviours in TypeScript over VS Code primitives."
- **[[c4]]** `analyze-bundle` `s1 convention.detect + manifests.locate: TS strict + ESM + NodeNext with .js imports; CLAUDE.md invariants 'Repo registry is the contract' (k3) + 'No direct cloud REST' (k2); NEW vscode-plugin/package.json declaring VS Code contribution points + workflow_dispatch Marketplace publish, independent of the backend root package.json + CI (k7)` — "the extension introduces a NEW vscode-plugin/package.json declaring the VS Code contribution points (commands, status-bar, activation), its own build, and the Marketplace metadata + a manual (workflow"

<!-- insrc:review -->

## Review

### ✅ Review `PASS` — design.epic (design.epic)

**0 HIGH · 0 MED · 10 LOW** · model `client` · reviewed 2026-09-21T17:02:04.897Z

| Ref | Kind | Severity | Fixability | Premise | Evidence | Action |
| --- | --- | --- | --- | --- | --- | --- |
| c1/sc1 | citation | LOW | auto | src/cli/client.ts exports an `rpc` function (a JSON-RPC-over-Unix-socket call, not a class) that the new src/shared/ipc-client generalizes. | The `rpc` function is confirmed as a real functional export used across the codebase (the JetBrains debug-pane LLD reproduces `export async function rpc<T = unknown>(method: string, params?: unknown): Promise<T>`, and the HLD's own c1 citation quotes it verbatim from src/cli/client.ts). The premise that it is a function (not a class) generalized by src/shared/ipc-client holds. | None — citation resolves; the extraction into src/shared/ipc-client is correctly framed as new. |
| c1 | citation | LOW | auto | PATHS.sockFile resolves to the daemon Unix-socket path and is the socket path the shared client uses. | PATHS.sockFile is confirmed: src/shared/paths.ts:19 defines `sockFile: join(INSRC_DIR, 'daemon.sock')` and src/daemon/lifecycle.ts references removing daemon.sock — the socket path the shared client uses is real. | None — socket-path citation resolves. |
| c1/sc7 | citation | LOW | auto | The daemon registers a repo.add IPC handler that is the exclusive workspace-enrolment contract (k3). | repo.add is confirmed as the exclusive registry contract: CLAUDE.md:140 states 'workspace registry membership is established exclusively via the `repo.add` IPC' and README.md:71 corroborates. The k3 basis of sc7 holds. | None — repo.add contract confirmed. |
| c1/sc1 | citation | LOW | auto | The daemon registers a daemon.status IPC handler used for the foundation/status read. | daemon.status is confirmed as a real IPC method (design/indexer.html documents `daemon.status` returning { uptime, repos, queueDepth, embeddingsPending }, matching the sc1 DaemonStatus sketch fields). The foundation status read is grounded. | None — daemon.status method confirmed and its shape aligns with the sc1 sketch. |
| c3/sc6 | citation | LOW | auto | A scripts/daemon-ctl.sh lifecycle script exists with start/stop/restart/update subcommands, over which the sc6 lifecycle controller operates. | scripts/daemon-ctl.sh is confirmed with the cited subcommands (docs/daemon.md:188 shows `./daemon-ctl.sh update`; the script is the documented lifecycle entry the JetBrains lifecycle story already used). sc6's basis holds. | None — daemon-ctl.sh lifecycle script confirmed. |
| c3/sc6 | citation | LOW | auto | A scripts/insrc-daemon-install.sh installer script exists, which the bundled-installer bootstrap reuses. | scripts/insrc-daemon-install.sh is confirmed to exist as a bash script (a prior DEF's read probe returned `#!/usr/bin/env bash` for scripts/insrc-daemon-install.sh:1; README.md:113 references it). The bundled-installer reuse basis holds. | None — installer script confirmed. |
| c3/sc5 | citation | LOW | auto | The jetbrains-plugin host-wiring stack (AiHostAdapter + registration/marker writers) exists as the precedent the sc5 AiHostAdapter re-expresses in TS. | The JetBrains host-wiring stack is confirmed: the epic's own DEF (c5) and this HLD cite jetbrains-plugin/.../host/ with AiHostAdapter, HostDetection, InsrcMcpRegistration, JsonMcpConfigWriter, MarkerFileWriter — all five components present. The sc5 precedent is real. | None — host-wiring precedent confirmed; sc5 correctly frames a TS re-expression, not a claim the TS already exists. |
| c4/s6 | semantic | LOW | auto | No VS Code extension manifest exists in the repo today (no engines.vscode / contributes), so vscode-plugin/package.json is genuinely new (not claimed to already exist). | No VS Code extension manifest exists in the repo: the only matches for engines.vscode / contributes / activationEvents are the epic's own HLD/DEF prose (docs/...), with zero package.json hits. vscode-plugin/package.json is correctly framed as genuinely new (s6), consistent with the manifests.locate bundle. | None — the new-manifest premise is accurate; nothing pre-exists to conflict with s6. |
| rollout | ordering | LOW | auto | Every shared-contract owner Story is scheduled in a rollout phase at or before every consuming Story's phase (sc1-sc4 owned by s1 in Phase A precede s2/s3/s4 in B and s5 in C; sc5/sc6/sc7 owned in B precede s5 in C). | Internal-consistency check (no source probe needed): the rollout orders Phase A(s1) → B(s2,s3,s4) → C(s5) → D(s6). Every contract owner precedes its consumers — sc1-sc4 (s1/A) before consumers in B and C; sc5/sc6/sc7 (B) before their sole external consumer s5 (C). No consumer is scheduled before its owner. | None — phase ordering respects every owner→consumer edge. |
| story-boundaries | closed-union | LOW | auto | Each shared contract sc1..sc7 is owned by exactly one Story, and every consuming Story transitively dependsOn its owner in the Epic graph (s5 dependsOn s2/s3/s4; all dependOn s1). | Internal-consistency check: each of sc1..sc7 appears in exactly one storyBoundaries[].owns (sc1-4→s1, sc5→s3, sc6→s2, sc7→s4; s5/s6 own none). Every consumer transitively dependsOn its owner — s5 dependsOn s2/s3/s4 (owners of sc6/sc5/sc7) and all stories dependOn s1 (owner of sc1-4). No dangling or upstream-consuming contract. | None — ownership is single and the dependency graph is respected. |
