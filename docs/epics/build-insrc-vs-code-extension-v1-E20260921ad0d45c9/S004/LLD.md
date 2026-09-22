<!-- insrc:artifact LLD-ad0d45c9d690f8c1-s4 -->

# LLD: E20260922ad0d45c9:S004

**Epic:** `build-insrc-vs-code-extension-v1`
**HLD base run:** `wf-1790009331473-c5to0q`
**HLD effective hash:** `1e2038ef7232...`

## HLD context

**Framework:** The insrc VS Code extension is a thin orchestrator that owns no reasoning: a new top-level vscode-plugin/ TypeScript package (sibling to jetbrains-plugin/, its own package.json + build + Marketplace metadata) whose whole job is to wire insrc into stock VS Code at lifecycle moments (activate, first workspace open, uninstall). It re-expresses the shipped jetbrains-plugin/ thin-config-orchestrator in TS over VS Code primitives, reaching the daemon ONLY through a NEW in-repo src/shared/ipc-client module that generalizes the existing src/cli/client.ts `rpc` fn + its IPC request/reply types + the socket path — giving exactly one socket-client code path shared by the CLI and the extension (k5), with no daemon internals, indexer, or storage in the extension bundle, and no cloud path opened by the extension (k2). The extension is decomposed into small per-capability seams, each with an injectable boundary so its load-bearing logic is unit-testable off the VS Code API, and every invasive action (install the daemon, wire a host, register the workspace) is consent-gated and exposed as a durable first-class command.
**Rollout phase:** Phase B — Capability seams (lifecycle, host wiring, registration)
**Owns:** `sc7` (WorkspaceRegistrar)
**Consumes:** `sc1` (SharedIpcClient), `sc3` (CommandRegistry), `sc4` (ConsentGate), `sc7` (WorkspaceRegistrar)

**Adjacent scope (owned by other stories — do NOT implement here):**
- `s1`: The VS Code activation entrypoint, the extension-bundle packaging (its build over src/shared/ipc-client), and the daemon-reachability probe implementation stay private to s1. How the status-bar item is created and rendered, and the concrete extraction of src/cli/client.ts into a re-export over src/shared/ipc-client (without regressing the CLI/TUI), are internal detail — only the four type-level contracts (sc1–sc4) are exposed. — owns `sc1`, `sc2`, `sc3`, `sc4`
- `s2`: The bundled installer asset (which installer script ships and how it is invoked over scripts/insrc-daemon-install.sh), the exact daemon-ctl.sh subcommand invocation and output parsing, and streamed lifecycle progress are private to s2. Only the sc6 lifecycle contract is exposed; the install/lifecycle commands are registered into sc3 and gated by sc4. — owns `sc6`
- `s3`: The concrete per-host config locations and shapes (extension-ID hosts like Copilot/Claude Code/Continue/Cline vs editor-environment hosts like Cursor/Windsurf/VSCodium via .vscode/mcp.json or the host's own file), the marker-delimited JSON-merge and steering writers, and the detection mechanics stay private to each adapter behind sc5. Only the sc5 interface + registry is exposed; the wire command is registered into sc3 and the combined consent uses sc4. — owns `sc5`
- `s5`: The first-run flow sequencing (the order and coalescing of the install → register → wire consent prompts into one coherent flow rather than scattered pop-ups), the persisted 'already onboarded' state, and the uninstall hook that drives sc5.unwire across wired hosts are private to s5. It owns no new shared contract — it composes the branch owners' contracts and pushes resulting state through sc2.
- `s6`: The vscode-plugin/package.json manifest (contributes/engines.vscode/activationEvents), the Marketplace listing assets (icon, README, categories), the packaging into a single .vsix, and the manually-triggered (workflow_dispatch) Marketplace-only publish path stay entirely private to s6 — no runtime contract is exposed and it depends on no other story's contract, only on the s1 package existing.

## Contract details

**Surface level:** internal-shared

### `WorkspaceRegistrar.state`

```typescript
state(root: string): Promise<RegistrationState>
```

**Parameters:**
- `root: string` — The open workspace root (absolute) to check enrolment for.

**Returns:** `Promise<RegistrationState>` — { root, registered } where registered = the normalized-absolute root equals the `path` of some row returned by rpc<RegisteredRepo[]>('repo.list'). Derives membership from the registry, never assumes (k3).

**Errors:**
- `(never throws for membership)` when A daemon/socket failure from rpc('repo.list') is caught and surfaced as registered:false with the reason logged, so activation degrades rather than hanging (nonFunctional.performance); the caller may re-run via the durable command.

**Preconditions:**
- Reads only the shared ipc-client rpc + the passed root; opens no cloud path (k2).

**Postconditions:**
- registered reflects the real repo.list membership at call time; no mutation.

### `WorkspaceRegistrar.register`

```typescript
register(root: string): Promise<RegistrationState>
```

**Parameters:**
- `root: string` — The open workspace root (absolute) to enrol.

**Returns:** `Promise<RegistrationState>` — { root, registered:true } after rpc('repo.add', { path: root }) resolves { ok:true }. Enrols ONLY through the daemon's explicit repo.add (ac2/k3).

**Errors:**
- `Error` when rpc('repo.add') rejects (invalid path — src/daemon/index.ts:470 'rejected repo.add: invalid path', or the daemon is unreachable); surfaced to the caller, which reflects an errored status via sc2 and leaves the durable command available to retry.

**Preconditions:**
- The CALLER obtained sc4 'accepted' before register() runs (k4) — register() itself performs no consent.
- `steering` is OMITTED from the repo.add params so the daemon does NOT also inject steering / register host MCP clients (host wiring is the reversible s3 flow — no double-wiring).

**Postconditions:**
- The daemon registry contains a row whose path === root; a subsequent state(root) returns registered:true (idempotent — a second register is a harmless re-add).

### `createWorkspaceRegistrar`

```typescript
createWorkspaceRegistrar(deps: { client: IpcClient }): WorkspaceRegistrar
```

**Parameters:**
- `deps: { client: IpcClient }` — The sc1 shared ipc-client the registrar issues repo.list/repo.add over — injected so the registrar is unit-testable with a fake client.

**Returns:** `WorkspaceRegistrar` — The sc7 implementation whose state()/register() delegate to repo.list membership + repo.add, mirroring the S002 createDaemonLifecycleController factory.

**Preconditions:**
- client is the same shared ipc-client the extension binds in s1 (no new IPC).

**Postconditions:**
- A registrar with no VS Code dependency — pure over the injected client.

### `WorkspaceFolders`

```typescript
type WorkspaceFolders = () => readonly string[]
```

**Returns:** `readonly string[]` — The absolute roots of the open workspace folders (from vscode.workspace.workspaceFolders), injected so root resolution is testable off VS Code. Empty when no folder is open.

**Preconditions:**
- Bound in extension.ts to vscode.workspace.workspaceFolders?.map(f => f.uri.fsPath) ?? [].

**Postconditions:**
- The first entry is treated as the primary root for the one-time offer; a no-folder window yields [] (no prompt).

### `PromptStore`

```typescript
interface PromptStore { wasDismissed(key: string): boolean; markDismissed(key: string): void }
```

**Returns:** `PromptStore` — A per-workspace persisted flag store (default over vscode.ExtensionContext.workspaceState Memento) so a dismissed register prompt is not re-nagged (lc1). Injected so the one-time gate is testable off VS Code.

**Preconditions:**
- The default impl reads/writes workspaceState under a namespaced key; a read never throws (missing ⇒ not dismissed).

**Postconditions:**
- Once markDismissed(root) runs, wasDismissed(root) stays true for that workspace across activations (until the workspace is registered, which makes the prompt moot).

### `registerWorkspaceCommands`

```typescript
registerWorkspaceCommands(deps: { commands: CommandRegistry; consent: ConsentGate; status: StatusSurface; registrar: WorkspaceRegistrar; folders: WorkspaceFolders }): void
```

**Parameters:**
- `deps: { commands: CommandRegistry; consent: ConsentGate; status: StatusSurface; registrar: WorkspaceRegistrar; folders: WorkspaceFolders }` — The s1 surfaces (sc3/sc4/sc2) + the sc7 registrar + the folders seam the command composes.

**Returns:** `void` — Registers the durable insrc.workspace.register command (sc3): resolve the primary root, ask sc4, and register on 'accepted' (k4), pushing the outcome to sc2. Mirrors S002 registerDaemonCommands / S003 registerHostCommands.

**Errors:**
- `Error` when Propagates a duplicate-InsrcCommandId programming error from CommandRegistry.register (build-time guard).

**Preconditions:**
- s4 owns the register capability + command; the install→register→wire coalescing is s5's boundary.

**Postconditions:**
- A dismissed register prompt stays reachable via the durable insrc.workspace.register command (k6); nothing enrols without sc4 'accepted' (k4).

### `offerWorkspaceRegistration`

```typescript
offerWorkspaceRegistration(deps: { consent: ConsentGate; status: StatusSurface; registrar: WorkspaceRegistrar; folders: WorkspaceFolders; prompts: PromptStore }): Promise<void>
```

**Parameters:**
- `deps: { consent; status; registrar; folders; prompts }` — The shared one-time offer flow reused by the durable command and the activation-time offer.

**Returns:** `Promise<void>` — Resolve the primary root; if absent → no-op; if already registered (state()) → no prompt; if previously dismissed (prompts.wasDismissed) → no prompt; else ask sc4 — on 'accepted' register() + push status, on 'declined'/'dismissed' markDismissed (lc1) and write nothing.

**Errors:**
- `(guarded)` when Any failure is caught by the activation caller's fire-and-forget guard so activate() never throws (S001).

**Preconditions:**
- Reuses sc7.state for the registered check and PromptStore for the dismissed check — the two-part one-time gate (lc1).

**Postconditions:**
- ac1: an unregistered root shows a one-time prompt and never enrols silently; a dismissal is remembered and not re-nagged.

## Data model changes

### `vscode-plugin/src/workspace/ (new module dir)` — new

New sc7 home mirroring vscode-plugin/src/daemon/ + src/hosts/: RegistrationState + WorkspaceRegistrar types, createWorkspaceRegistrar (over the sc1 client), the WorkspaceFolders + PromptStore injectable seams (default impls over vscode.workspace.workspaceFolders + vscode.ExtensionContext.workspaceState), and registerWorkspaceCommands + the shared offerWorkspaceRegistration flow. No daemon internals/indexer/storage imported (k5); reaches the daemon only through the shared ipc-client rpc.

**Call sites:**
- `src/cli/services/repo.ts`
- `src/daemon/index.ts`

### `RegistrationState` — new

{ root: string; registered: boolean } — the sc7 result type (verbatim from the HLD sketch). registered is derived from repo.list membership by normalized-absolute path equality against RegisteredRepo.path (src/shared/types.ts RegisteredRepo).

**Call sites:**
- `src/cli/services/repo.ts`

### `extension.ts (activation wiring)` — invariant-change

extension.ts constructs the WorkspaceRegistrar (over the shared client), the real WorkspaceFolders (vscode.workspace.workspaceFolders) + PromptStore (context.workspaceState), calls registerWorkspaceCommands with the s1 surfaces, and fires a guarded fire-and-forget activation-time offerWorkspaceRegistration; the S001 never-throws/off-UI contract is preserved. Adds insrc.workspace.register to contributes.commands (k6). The install→register→wire coalescing stays s5's.

**Call sites:**
- `vscode-plugin/src/extension.ts`

## Interaction with shared contracts

| Contract | Role | How |
| :--- | :--- | :--- |
| `sc7` | implements | s4 owns sc7: createWorkspaceRegistrar returns a WorkspaceRegistrar whose state() derives registered-ness from rpc('repo.list') membership and register() enrols via rpc('repo.add', { path }) with no steering. |
| `sc1` | consumes | All daemon access is rpc<RegisteredRepo[]>('repo.list') + rpc('repo.add', …) over the injected shared ipc-client — no new IPC, no daemon internals (k5). |
| `sc3` | consumes | registerWorkspaceCommands registers the existing insrc.workspace.register command id into the CommandRegistry so a dismissed prompt stays reachable (k6). |
| `sc4` | consumes | The register offer asks a single ConsentGate prompt and enrols only on 'accepted'; declined/dismissed enrols nothing (k4). |
| `sc2` | consumes | registerWorkspaceCommands / offerWorkspaceRegistration push the register outcome (registered / errored / declined) into StatusSurface.set (not re-designed). |

## Error paths

### Error cases

- **The daemon is not running / the socket is unreachable when state(root) issues repo.list at activation.** (recoverable)
  - Detection: rpc('repo.list') rejects (ENOENT/ECONNREFUSED 'daemon is not running' from the shared ipc-client).
  - Response: state() catches the rejection and returns { root, registered:false } with the reason logged; offerWorkspaceRegistration's activation call is fire-and-forget + guarded so activate() never throws. NO prompt is forced by a failed probe (the registered check is treated as indeterminate-not-registered but the offer still respects the dismissed flag).
  - User impact: Activation is not blocked or crashed by a stopped daemon; once the daemon is up the developer can register via the durable insrc.workspace.register command.
- **register(root) calls repo.add but the daemon rejects the path as invalid (does not exist / not a directory).** (recoverable)
  - Detection: rpc('repo.add') rejects; the daemon logs 'rejected repo.add: invalid path' (src/daemon/index.ts:470).
  - Response: register() surfaces the error to the caller (the command / offer), which sets an errored status via sc2 with the reason and does NOT mark the workspace registered; the durable command stays available to retry.
  - User impact: The developer sees why enrolment failed and can fix the path / retry; nothing is half-registered.
- **The developer accepts the register prompt but the daemon becomes unreachable between the consent and the repo.add.** (recoverable)
  - Detection: rpc('repo.add') rejects with a connection error after ConsentGate returned 'accepted'.
  - Response: register() rejects; offerWorkspaceRegistration reflects an errored status via sc2. It does NOT markDismissed (the developer opted IN), so the offer / durable command can retry once the daemon is reachable.
  - User impact: The accepted intent is not lost to a permanent dismissal; the developer can retry and enrol succeeds.
- **repo.list resolves but returns a shape that is not an array (a daemon-version drift / error object).** (recoverable)
  - Detection: state() checks Array.isArray on the repo.list result before membership.
  - Response: A non-array result is treated as 'no rows' → registered:false (logged); membership is never inferred from a malformed payload.
  - User impact: A daemon shape drift degrades to 'offer to register' rather than a crash or a false 'already registered'.

### Edge cases

| Input | Expected |
| :--- | :--- |
| No workspace folder is open (an empty VS Code window). | folders() returns []; offerWorkspaceRegistration resolves the primary root as undefined and no-ops — no prompt, no repo.list call (ac1 applies only to an open workspace root). |
| The open root is ALREADY registered (state().registered === true) at activation. | offerWorkspaceRegistration shows no prompt (the one-time offer is moot); a status detail may reflect 'workspace registered'. The durable command, if run manually, reports already-registered and does a harmless idempotent no-op. |
| The developer previously dismissed the register prompt for this workspace (PromptStore.wasDismissed(root) === true) and re-activates. | offerWorkspaceRegistration does NOT prompt again (lc1); the durable insrc.workspace.register command still works if the developer chooses to register later (k6). |
| A multi-root workspace (several folders open). | The primary root (folders()[0]) is offered for the one-time activation prompt; the durable command also targets the primary root. Enrolling additional roots is left to re-running the command per root / s5's coalescing — s4 does not silently enrol every folder. |
| register() is run for a root that is already registered (double-accept, or command re-run). | repo.add is idempotent at the registry (a re-add of the same path is harmless); register() returns { root, registered:true } and no duplicate row is created. |
| The workspace root path contains a trailing slash / differs only by case or normalization from the registered row's path. | state() compares NORMALIZED absolute paths (resolve) on both sides so a trailing-slash / '.' segment difference still matches the registered row; the same normalized root is what register() passes to repo.add. |

### Invariants to preserve

- Enrolment happens ONLY through the daemon's explicit repo.add over the shared ipc-client (k3): the extension holds no shadow registry and never marks a workspace registered without a successful repo.add; state() derives membership from repo.list, never assumes. [[c4]]
- The register prompt is one-time-per-workspace (lc1): a dismissal is persisted (PromptStore) and not re-nagged on subsequent activations, and an already-registered root is never re-prompted. [[c1]]
- The sc5-style never-throws/off-UI activation contract holds: the activation-time register offer runs off the critical path, guarded, so activate() never throws or blocks the editor (mirrors S001/S002/S003). [[c1]]
- register() OMITS the steering param to repo.add so the daemon does not also inject steering / register host MCP clients — host wiring stays the reversible s3 flow, no double-wiring (k2 boundary + s3 ownership). [[c4]]

## Test strategy

**Test framework:** `node:test (tsx --test) — the same runner S001/S002/S003 use for vscode-plugin/ over injected fakes (no VS Code host); a fake IpcClient records repo.list/repo.add calls, fake WorkspaceFolders/PromptStore/ConsentGate/StatusSurface/CommandRegistry drive the flow, plus a source-scan test for the k5 boundary.`

### Test levels

- **unit** — Prove createWorkspaceRegistrar's state()/register() over a fake IpcClient: membership from repo.list, enrolment via repo.add without steering, never-throws + normalization.
  - Subjects: `state(root) returns registered:true iff a repo.list row's normalized-absolute path equals the normalized root; false otherwise`, `state(root) returns registered:false (never throws) when rpc('repo.list') rejects (daemon unreachable) or returns a non-array`, `state(root) normalizes both sides (trailing slash / '.' segments) so a cosmetically-different root still matches a registered row`, `register(root) calls rpc('repo.add', { path: root }) with NO steering key and returns { root, registered:true } on { ok:true }`, `register(root) surfaces the error (does not mark registered) when rpc('repo.add') rejects`
  - Fixtures: `a fake IpcClient recording { method, params } and returning scripted repo.list rows / repo.add resolutions or rejections`, `sample RegisteredRepo[] rows (matching, non-matching, trailing-slash)`
- **unit** — Prove the one-time offer + durable command wiring over fake sc2/sc3/sc4 + fake registrar/folders/prompts: consent-gated, one-time, never silent.
  - Subjects: `offerWorkspaceRegistration shows NO prompt and does nothing when folders() is empty (no open root)`, `offerWorkspaceRegistration shows NO prompt when state(root).registered is already true`, `offerWorkspaceRegistration shows NO prompt when PromptStore.wasDismissed(root) is true (lc1)`, `on 'accepted' offerWorkspaceRegistration calls registrar.register(root) exactly once and pushes the outcome to StatusSurface.set`, `on 'declined'/'dismissed' it calls PromptStore.markDismissed(root), calls registrar.register NEVER, and writes nothing (k4)`, `on an accepted-but-register-fails path it does NOT markDismissed (retryable) and reflects an errored status`, `registerWorkspaceCommands registers the insrc.workspace.register command into the fake CommandRegistry`
  - Fixtures: `fake ConsentGate returning a scripted outcome + recording the request`, `fake StatusSurface recording set() calls`, `fake CommandRegistry recording registered ids`, `a fake WorkspaceRegistrar (scripted state/register, one register-throws variant) + fake WorkspaceFolders + in-memory PromptStore`
- **unit** — Prove the k5 thin-boundary + activation wiring by source scan (mirroring S002/S003).
  - Subjects: `source-scan: vscode-plugin/src/workspace/ imports only node builtins + the shared ipc-client + the s1 surfaces — no daemon internals/indexer/storage, no cloud/HTTP (k5)`, `extension.ts constructs createWorkspaceRegistrar over the shared client + real WorkspaceFolders/PromptStore and calls registerWorkspaceCommands with the s1 surfaces`, `the activation-time offerWorkspaceRegistration is fire-and-forget + guarded so activate() never throws/blocks (S001)`, `contributes.commands includes insrc.workspace.register alongside the S002 daemon + S003 hosts entries (k6)`
  - Fixtures: `source read of vscode-plugin/src/extension.ts + vscode-plugin/src/workspace/*.ts`, `read of vscode-plugin/package.json contributes.commands`
- **smoke** — Prove the package still typechecks with the sc7 workspace module + vscode.d.ts additions.
  - Subjects: `the vscode-plugin package typechecks (tsc -p tsconfig.json) with the workspace module + the workspaceFolders/workspaceState vscode.d.ts additions`
  - Fixtures: `the vscode-plugin tsconfig`

### Acceptance mapping

| Criterion | Proving tests |
| :--- | :--- |
| `ac1` | `offerWorkspaceRegistration shows a prompt only when the root is present, unregistered, and not previously dismissed — and enrols NOTHING until 'accepted' (offer unit tests) — proves the one-time, never-silent prompt`, `offerWorkspaceRegistration shows NO prompt when already registered / when previously dismissed / when no folder is open (offer unit tests) — proves the one-time gate (lc1)`, `on 'declined'/'dismissed' nothing is written and markDismissed persists (offer unit test) — proves never-silent + not-re-nagged` |
| `ac2` | `register(root) calls rpc('repo.add', { path }) with no steering and returns registered:true only on { ok:true } (registrar unit test) — proves enrolment goes ONLY through the daemon's explicit repo.add (k3)`, `on 'accepted' offerWorkspaceRegistration calls registrar.register exactly once (offer unit test) — proves acceptance drives the repo.add enrolment path` |

## Alternatives considered

### a1: Thin sc7 registrar over the shared ipc-client + injected workspace-folders + injected one-time PromptStore — **CHOSEN**

sc7 as an injectable seam: state()=repo.list membership, register()=repo.add (no steering), a one-time prompt gated by state() + a per-workspace persisted-dismissed flag.

Implement sc7 as a small injectable seam mirroring S002/S003. state(root) = rpc<RegisteredRepo[]>('repo.list') then membership by normalized-absolute path equality against the rows' `path`; register(root) = rpc('repo.add', { path }) with NO `steering` (host wiring is s3's job — passing steering would double-wire the daemon's own MCP/steering), returning { root, registered:true } on the daemon's { ok:true }. A WorkspaceFolders seam (injected () => readonly string[]) resolves the open root(s) off vscode.workspace.workspaceFolders; a PromptStore seam (injected get/set over vscode.ExtensionContext.workspaceState Memento) persists a per-workspace 'register prompt dismissed' flag so lc1's one-time-and-not-re-nagged holds. registerWorkspaceCommands registers the durable insrc.workspace.register command (sc3) that asks sc4 then registers on 'accepted'; the activation-time offer fires only when the root is present, NOT registered (state()), and NOT previously dismissed (PromptStore) — guarded fire-and-forget so activate() never throws (S001). Outcome pushed to sc2.

### a2: sc7 exposes state/register + the durable command only; ALL one-time persistence deferred to s5

s4 owns no persistence — the activation offer fires whenever unregistered, leaving the one-time/dismissal memory entirely to s5.

Same registrar over the shared ipc-client, but s4 owns NO persistence: the activation offer fires whenever the root is unregistered, and the 'don't re-nag on dismiss' persistence is left entirely to s5's onboarding-coalescing state. s4 ships only state(), register(), and the durable insrc.workspace.register command + a bare activation offer.

**Rejected because:** Scored 'violates' on ac1 (and lc1): without persisted dismissal the prompt re-fires every activation. lc1 is an s4 constraint, so s4 must own the minimal one-time gate; a1 does this with an injected seam s5 can later compose.

### a3: Derive registered-ness from repo.stats instead of repo.list membership

sc7.state calls repo.stats and treats its { error: 'not a registered repo' } payload as not-registered.

sc7.state(root) calls rpc('repo.stats', { repoPath: root }) and treats the { error: '… is not a registered repo' } shape (src/daemon/index.ts:552) as not-registered, any success as registered; register() still uses repo.add. Membership is inferred from the stats error rather than an explicit registry listing.

**Rejected because:** Only 'partial' on ac1/sc7: inferring membership from a brittle error-shaped payload heavier than the canonical repo.list source. a1 uses the explicit, lightweight, wording-independent repo.list rows.

## Citations

- **[[c1]]** `analyze-bundle` `s1 symbol.locate+search.text: the real repo.add/repo.list IPC contract — daemon handlers src/daemon/index.ts:459/536, CLI wrappers src/cli/services/repo.ts:31-33/49-58; repo.add applies steering/MCP only when steering is passed (src/daemon/steering-inject.ts)`
- **[[c2]]** `analyze-bundle` `s1 data-model.trace: RegisteredRepo (src/shared/types.ts:670) = { path, name, addedAt, status, ... }; repo.list returns workspace rows keyed by absolute path; AddRepoResult = { path, mcp? }`
- **[[c3]]** `analyze-bundle` `s1 convention.detect: CLAUDE.md rule 6 'Repo registry is the contract' (repo.add is the only registration path; storage never auto-allocates; UnregisteredRepoError) + the S002/S003 injectable-seam + node:test pattern the extension mirrors`
- **[[c4]]** `prior-artifact` `HLD sc7 WorkspaceRegistrar sketch (state/register, register via repo.add IPC only) + k3 (registry is the contract) + k2 (no cloud path) constraints`

<!-- insrc:review -->

## Review

### ✅ Review `PASS` — design.story (design.story)

**0 HIGH · 0 MED · 0 LOW** · model `client` · reviewed 2026-09-22T05:49:43.537Z

_No load-bearing premises were extracted._
