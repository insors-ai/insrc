<!-- insrc:artifact PLAN-ad0d45c9d690f8c1-s4 -->

# Plan: E20260922ad0d45c9:S004

**Epic:** `build-insrc-vs-code-extension-v1`
**LLD run:** `wf-1790055602237-euewfb`
**LLD effective hash:** `1e2038ef7232...`

## Tasks

| # | Task | Size | Depends on | Tests | Derived from |
| :--- | :--- | :--- | :--- | :--- | :--- |
| 1 | **`t1`** sc7 types + createWorkspaceRegistrar over the shared ipc-client + the injectable seam interfaces | M | — | unit: state(root) returns registered:true iff a repo.list row's normalized-absolute path equals the normalized root; false otherwise; unit: state(root) returns registered:false (never throws) when rpc('repo.list') rejects (daemon unreachable) or returns a non-array; unit: state(root) normalizes both sides (trailing slash / '.' segments) so a cosmetically-different root still matches a registered row; unit: register(root) calls rpc('repo.add', { path: root }) with NO steering key and returns { root, registered:true } on { ok:true }; unit: register(root) surfaces the error (does not mark registered) when rpc('repo.add') rejects | [[c1]] [[c2]] |
| 2 | **`t2`** registerWorkspaceCommands + the shared one-time offerWorkspaceRegistration flow | M | `t1` | unit: offerWorkspaceRegistration shows NO prompt and does nothing when folders() is empty (no open root); unit: offerWorkspaceRegistration shows NO prompt when state(root).registered is already true; unit: offerWorkspaceRegistration shows NO prompt when PromptStore.wasDismissed(root) is true (lc1); unit: on 'accepted' offerWorkspaceRegistration calls registrar.register(root) exactly once and pushes the outcome to StatusSurface.set; unit: on 'declined'/'dismissed' it calls PromptStore.markDismissed(root), calls registrar.register NEVER, and writes nothing (k4); unit: on an accepted-but-register-fails path it does NOT markDismissed (retryable) and reflects an errored status; unit: registerWorkspaceCommands registers the insrc.workspace.register command into the fake CommandRegistry | [[c3]] |
| 3 | **`t3`** vscode.d.ts additions + wire the registrar/command/offer into extension.ts | S | `t1`, `t2` | unit: extension.ts constructs createWorkspaceRegistrar over the shared client + real WorkspaceFolders/PromptStore and calls registerWorkspaceCommands with the s1 surfaces; the activation-time offerWorkspaceRegistration is fire-and-forget + guarded (never throws/blocks, S001) — source-scan; unit: contributes.commands includes insrc.workspace.register alongside the S002 daemon + S003 hosts entries (k6); smoke: the vscode-plugin package typechecks (tsc -p tsconfig.json) with the workspace module + the workspaceFolders/workspaceState vscode.d.ts additions | [[c2]] [[c3]] [[c4]] |

### E20260922ad0d45c9:S004:T001 — sc7 types + createWorkspaceRegistrar over the shared ipc-client + the injectable seam interfaces

Create vscode-plugin/src/workspace/ with: RegistrationState { root; registered } + WorkspaceRegistrar types; createWorkspaceRegistrar({ client }) whose state(root)=rpc<RegisteredRepo[]>('repo.list') then registered = normalized-absolute path equality against a row's `path` (Array.isArray guard; catches rpc rejection → registered:false, never throws), and register(root)=rpc('repo.add', { path }) WITH NO steering key → { root, registered:true } on { ok:true } (surfaces the error on reject). Export ONLY the TYPE/interface for the WorkspaceFolders seam (type () => readonly string[]) + the PromptStore seam (interface wasDismissed/markDismissed) — plus an optional in-memory PromptStore for tests; the REAL vscode.workspace.workspaceFolders + vscode.ExtensionContext.workspaceState bindings are constructed in extension.ts (t3), so workspace/ carries NO 'vscode' import (k5). Mirrors the S002 createDaemonLifecycleController factory. Path normalization via node:path resolve.

**Acceptance checks:**
- state(root) returns registered:true iff a repo.list row's normalized-absolute path equals the normalized root; false otherwise; never throws (rpc reject / non-array → registered:false)
- register(root) calls rpc('repo.add', { path: root }) with NO steering key, returns { root, registered:true } on { ok:true }, and surfaces the error (does not mark registered) on reject
- RegistrationState + WorkspaceRegistrar types + the WorkspaceFolders/PromptStore seam interfaces are exported from workspace/; the registrar is pure over the injected IpcClient and workspace/ carries no 'vscode' import (k5)
- path comparison normalizes both sides (resolve) so a trailing-slash / '.' difference still matches

### E20260922ad0d45c9:S004:T002 — registerWorkspaceCommands + the shared one-time offerWorkspaceRegistration flow

Add registerWorkspaceCommands({ commands, consent, status, registrar, folders }): registers the durable insrc.workspace.register command (sc3) whose body resolves the primary root (folders()[0]), and runs the shared offerWorkspaceRegistration. Add offerWorkspaceRegistration({ consent, status, registrar, folders, prompts }): no root → no-op; already registered (state()) → no prompt; previously dismissed (prompts.wasDismissed) → no prompt; else ask a single sc4 ConsentGate prompt — on 'accepted' call registrar.register(root) once + push the outcome to sc2, on 'declined'/'dismissed' markDismissed(root) + write nothing (k4/lc1); on an accepted-but-register-fails path do NOT markDismissed (retryable) + push an errored status. Mirrors S002 registerDaemonCommands/offerDaemonInstall + S003 registerHostCommands/offerHostWiring.

**Acceptance checks:**
- registerWorkspaceCommands registers the insrc.workspace.register command into the CommandRegistry
- offerWorkspaceRegistration shows NO prompt (no-op) when no root is open, when already registered, or when previously dismissed (lc1)
- on 'accepted' registrar.register(root) runs exactly once and the outcome is pushed to StatusSurface.set; on 'declined'/'dismissed' markDismissed(root) runs and nothing is registered (k4)
- on an accepted-but-register-throws path it does NOT markDismissed and reflects an errored status (retryable)
- source-scan: vscode-plugin/src/workspace/ imports only node builtins + the shared ipc-client + the s1 surfaces — no daemon internals/indexer/storage, no cloud/HTTP (k5)

### E20260922ad0d45c9:S004:T003 — vscode.d.ts additions + wire the registrar/command/offer into extension.ts

Extend vscode-plugin/src/vscode.d.ts with vscode.workspace.workspaceFolders (readonly { uri: { fsPath: string } }[] | undefined) + ExtensionContext.workspaceState (a Memento with get<T>(key, default) / update(key, value)). In extension.ts (sole 'vscode' importer): construct the real WorkspaceFolders (() => vscode.workspace.workspaceFolders?.map(f => f.uri.fsPath) ?? []) + the default PromptStore over context.workspaceState, build createWorkspaceRegistrar over the existing shared client, call registerWorkspaceCommands with the s1 surfaces, and fire a guarded fire-and-forget activation-time offerWorkspaceRegistration (preserving S001 never-throws). ADD insrc.workspace.register to the EXISTING contributes.commands array (S002 daemon + S003 hosts entries untouched) so the command is palette-reachable (k6).

**Acceptance checks:**
- vscode.d.ts declares vscode.workspace.workspaceFolders + ExtensionContext.workspaceState; the package typechecks (tsc -p tsconfig.json)
- extension.ts constructs the registrar (over the shared client) + real WorkspaceFolders/PromptStore and calls registerWorkspaceCommands with the s1 surfaces
- the activation-time offerWorkspaceRegistration is fire-and-forget + guarded so activate() never throws/blocks (S001) and only acts when a root is open
- insrc.workspace.register is ADDED to the existing contributes.commands array (S002/S003 entries untouched) so it stays palette-reachable (k6)

## Test-strategy coverage

| LLD strategy item | Covered by |
| :--- | :--- |
| state(root) returns registered:true iff a repo.list row's normalized-absolute path equals the normalized root; false otherwise | `t1` |
| state(root) returns registered:false (never throws) when rpc('repo.list') rejects (daemon unreachable) or returns a non-array | `t1` |
| state(root) normalizes both sides (trailing slash / '.' segments) so a cosmetically-different root still matches a registered row | `t1` |
| register(root) calls rpc('repo.add', { path: root }) with NO steering key and returns { root, registered:true } on { ok:true } | `t1` |
| register(root) surfaces the error (does not mark registered) when rpc('repo.add') rejects | `t1` |
| offerWorkspaceRegistration shows NO prompt and does nothing when folders() is empty (no open root) | `t2` |
| offerWorkspaceRegistration shows NO prompt when state(root).registered is already true | `t2` |
| offerWorkspaceRegistration shows NO prompt when PromptStore.wasDismissed(root) is true (lc1) | `t2` |
| on 'accepted' offerWorkspaceRegistration calls registrar.register(root) exactly once and pushes the outcome to StatusSurface.set | `t2` |
| on 'declined'/'dismissed' it calls PromptStore.markDismissed(root), calls registrar.register NEVER, and writes nothing (k4) | `t2` |
| on an accepted-but-register-fails path it does NOT markDismissed (retryable) and reflects an errored status | `t2` |
| registerWorkspaceCommands registers the insrc.workspace.register command into the fake CommandRegistry | `t2` |
| source-scan: vscode-plugin/src/workspace/ imports only node builtins + the shared ipc-client + the s1 surfaces — no daemon internals/indexer/storage, no cloud/HTTP (k5) | `t2` |
| extension.ts constructs createWorkspaceRegistrar over the shared client + real WorkspaceFolders/PromptStore and calls registerWorkspaceCommands with the s1 surfaces | `t3` |
| the activation-time offerWorkspaceRegistration is fire-and-forget + guarded so activate() never throws/blocks (S001) | `t3` |
| contributes.commands includes insrc.workspace.register alongside the S002 daemon + S003 hosts entries (k6) | `t3` |
| the vscode-plugin package typechecks (tsc -p tsconfig.json) with the workspace module + the workspaceFolders/workspaceState vscode.d.ts additions | `t3` |

## Citations

- **[[c1]]** `prior-artifact` `LLD s4 handoff: sc7 WorkspaceRegistrar.state/register + createWorkspaceRegistrar over the sc1 ipc-client (state()=repo.list membership, register()=repo.add {path} no steering)`
- **[[c2]]** `prior-artifact` `LLD s4 handoff: RegistrationState type + the injectable WorkspaceFolders + PromptStore seams (default impls over vscode.workspace.workspaceFolders + ExtensionContext.workspaceState)`
- **[[c3]]** `prior-artifact` `LLD s4 handoff: registerWorkspaceCommands + the shared one-time offerWorkspaceRegistration flow (combined sc4 consent, register-on-accepted, markDismissed on decline, outcome to sc2)`
- **[[c4]]** `prior-artifact` `LLD s4 handoff: extension.ts activation wiring (real WorkspaceFolders/PromptStore + guarded fire-and-forget offer preserving S001 never-throws) + vscode.d.ts workspaceFolders/workspaceState additions + contributes.commands insrc.workspace.register (k6)`

<!-- insrc:review -->

## Review

### ✅ Review `PASS` — plan (plan)

**0 HIGH · 0 MED · 8 LOW** · model `client` · reviewed 2026-09-22T05:56:04.343Z

| Ref | Kind | Severity | Fixability | Premise | Evidence | Action |
| --- | --- | --- | --- | --- | --- | --- |
| t1 | citation | LOW | manual | The daemon result of repo.add is shaped { ok: true; mcp? } (not { path }), so register() checks ok:true — confirmed by the CLI wrapper's rpc<{ ok:true; mcp? }>('repo.add', ...). | src/cli/services/repo.ts:54 confirms repo.add is rpc<{ ok: true; mcp?: { clients } }> — register() checking { ok:true } is correct. | none — verified sound |
| t1 | citation | LOW | manual | repo.list is invoked as rpc<RegisteredRepo[]>('repo.list') and RegisteredRepo carries a `path` field to compare against — the membership source t1 consumes. | src/cli/services/repo.ts:31/32 listRepos = rpc<RegisteredRepo[]>('repo.list'); src/shared/types.ts:670 interface RegisteredRepo exists — the membership source t1 consumes. | none — verified sound |
| t2 | citation | LOW | manual | The s1 surfaces (CommandRegistry/ConsentGate/StatusSurface) that t2 composes exist, and the InsrcCommandId union already includes 'insrc.workspace.register'. | command-registry.ts:21 declares 'insrc.workspace.register'; CommandRegistry/ConsentGate/StatusSurface interfaces exist at surfaces/*.ts (28/22/19). | none — verified sound |
| t2/t3 | citation | LOW | manual | The S002/S003 register+offer precedent t2 mirrors exists (registerDaemonCommands/offerDaemonInstall + registerHostCommands/offerHostWiring). | registerDaemonCommands (daemon/commands.ts:58) + registerHostCommands (hosts/commands.ts:77) exist — the S002/S003 register+offer precedent t2 mirrors. | none — verified sound |
| t3 | inventory | LOW | manual | The existing contributes.commands array holds the 5 daemon ids + insrc.hosts.wire (6 entries) that t3 must leave untouched while appending insrc.workspace.register. | package.json:20-25 holds exactly the 5 insrc.daemon.* ids + insrc.hosts.wire (6 entries) t3 must leave untouched. | none — verified sound |
| t3 | semantic | LOW | manual | extension.ts is the sole 'vscode' importer + the wiring home, and the shared IpcClient (createIpcClient) is already constructed there for the registrar to reuse. | extension.ts:12 `import * as vscode from 'vscode'` (sole importer, enforced by activation.test:108) and :43 `const client = createIpcClient()` — the shared client is already constructed for the registrar to reuse. | none — verified sound |
| t3 | citation | LOW | manual | The vscode.d.ts shim that t3 extends with vscode.workspace.workspaceFolders + ExtensionContext.workspaceState exists and already declares the vscode module + ExtensionContext. | vscode.d.ts:8 `declare module 'vscode'` + :52 `interface ExtensionContext` — the shim t3 extends exists. | none — verified sound |
| tasks | ordering | LOW | manual | The task DAG t1→t2→t3 (t1→t3) is acyclic and orders the registrar/types before the commands/offer before the activation wiring. | Ordering claim (no probe): edges t1→t2→t3 + t1→t3 form a DAG; order 1<2<3 is a valid topological order placing registrar before commands before activation wiring. | none — verified sound |
