<!-- insrc:artifact LLD-ad0d45c9d690f8c1-s5 -->

# LLD: E20260922ad0d45c9:S005

**Epic:** `build-insrc-vs-code-extension-v1`
**HLD base run:** `wf-1790009331473-c5to0q`
**HLD effective hash:** `1e2038ef7232...`

## HLD context

**Framework:** The insrc VS Code extension is a thin orchestrator that owns no reasoning: a new top-level vscode-plugin/ TypeScript package (sibling to jetbrains-plugin/, its own package.json + build + Marketplace metadata) whose whole job is to wire insrc into stock VS Code at lifecycle moments (activate, first workspace open, uninstall). It re-expresses the shipped jetbrains-plugin/ thin-config-orchestrator in TS over VS Code primitives, reaching the daemon ONLY through a NEW in-repo src/shared/ipc-client module that generalizes the existing src/cli/client.ts `rpc` fn + its IPC request/reply types + the socket path — giving exactly one socket-client code path shared by the CLI and the extension (k5), with no daemon internals, indexer, or storage in the extension bundle, and no cloud path opened by the extension (k2). The extension is decomposed into small per-capability seams, each with an injectable boundary so its load-bearing logic is unit-testable off the VS Code API, and every invasive action (install the daemon, wire a host, register the workspace) is consent-gated and exposed as a durable first-class command.
**Rollout phase:** Phase C — Onboarding capstone & clean removal
**Consumes:** `sc1` (SharedIpcClient), `sc2` (StatusSurface), `sc3` (CommandRegistry), `sc4` (ConsentGate), `sc5` (AiHostAdapter), `sc6` (DaemonLifecycleController), `sc7` (WorkspaceRegistrar)

**Adjacent scope (owned by other stories — do NOT implement here):**
- `s1`: The VS Code activation entrypoint, the extension-bundle packaging (its build over src/shared/ipc-client), and the daemon-reachability probe implementation stay private to s1. How the status-bar item is created and rendered, and the concrete extraction of src/cli/client.ts into a re-export over src/shared/ipc-client (without regressing the CLI/TUI), are internal detail — only the four type-level contracts (sc1–sc4) are exposed. — owns `sc1`, `sc2`, `sc3`, `sc4`
- `s2`: The bundled installer asset (which installer script ships and how it is invoked over scripts/insrc-daemon-install.sh), the exact daemon-ctl.sh subcommand invocation and output parsing, and streamed lifecycle progress are private to s2. Only the sc6 lifecycle contract is exposed; the install/lifecycle commands are registered into sc3 and gated by sc4. — owns `sc6`
- `s3`: The concrete per-host config locations and shapes (extension-ID hosts like Copilot/Claude Code/Continue/Cline vs editor-environment hosts like Cursor/Windsurf/VSCodium via .vscode/mcp.json or the host's own file), the marker-delimited JSON-merge and steering writers, and the detection mechanics stay private to each adapter behind sc5. Only the sc5 interface + registry is exposed; the wire command is registered into sc3 and the combined consent uses sc4. — owns `sc5`
- `s4`: The workspace-root resolution from the open VS Code workspace folders and the already-registered check semantics stay private to s4. Only the sc7 registrar contract is exposed; enrolment goes exclusively through the daemon's repo.add over sc1, the register command is registered into sc3, and the one-time prompt uses sc4. — owns `sc7`
- `s6`: The vscode-plugin/package.json manifest (contributes/engines.vscode/activationEvents), the Marketplace listing assets (icon, README, categories), the packaging into a single .vsix, and the manually-triggered (workflow_dispatch) Marketplace-only publish path stay entirely private to s6 — no runtime contract is exposed and it depends on no other story's contract, only on the s1 package existing.

## Contract details

**Surface level:** internal

### `runOnboarding`

```typescript
runOnboarding(deps: { controller: DaemonLifecycleController; registrar: WorkspaceRegistrar; registry: AiHostRegistry; consent: ConsentGate; status: StatusSurface; folders: WorkspaceFolders; prompts: PromptStore; onboarded: OnboardingStore }): Promise<void>
```

**Parameters:**
- `deps: { controller; registrar; registry; consent; status; folders; prompts; onboarded }` — The shipped sc6/sc7/sc5 seams + the s1 sc2/sc4 surfaces + the s4 folders/prompts seams + the new OnboardingStore gate the orchestrator composes.

**Returns:** `Promise<void>` — Runs the first-run flow ONCE per workspace: resolve the primary root; if onboarded.wasOnboarded(root) -> no-op; else await offerDaemonInstall -> offerWorkspaceRegistration -> offerHostWiring IN ORDER (each keeps its own internal guard so a not-needed step silently no-ops), then onboarded.markOnboarded(root). A no-folder window still runs the global install/wire steps but skips the onboarded gate + register. Never re-registers commands; pure sequencing (lc1).

**Errors:**
- `(guarded by the caller)` when Each offer already swallows its own errors into a status; the activation caller additionally wraps runOnboarding in a fire-and-forget try/catch so activate() never throws (S001).

**Preconditions:**
- The three offers + the controller/registrar/registry/surfaces are already constructed by extension.ts (S001-S004); runOnboarding only orders them.

**Postconditions:**
- ac1: a fresh workspace sees the needed prompts in a single coherent install->register->wire sequence, once; a skipped step stays reachable via its durable command (ac2, unchanged).

### `OnboardingStore`

```typescript
interface OnboardingStore { wasOnboarded(root: string): boolean; markOnboarded(root: string): void }
```

**Returns:** `OnboardingStore` — A per-workspace persisted flag so the auto-run onboarding sequence fires ONCE per workspace root (default over vscode.ExtensionContext.workspaceState, a distinct namespaced key from S004's register-dismissed flag). Injected so the gate is testable off VS Code. Mirrors S004's PromptStore.

**Preconditions:**
- The default impl reads/writes workspaceState under a namespaced key; a read never throws (missing => not onboarded).

**Postconditions:**
- Once markOnboarded(root) runs, wasOnboarded(root) stays true for that workspace; the durable commands remain the way to (re-)perform any step.

### `unwireAllHosts`

```typescript
unwireAllHosts(deps: { specs: readonly HostSpec[]; fs: HostFileSystem }): Promise<{ unwired: number; failed: number }>
```

**Parameters:**
- `deps: { specs: readonly HostSpec[]; fs: HostFileSystem }` — The static HOST_SPECS list + the injected node HostFileSystem (unwire needs no editor detection), so the reversal is unit-testable off VS Code + off a real fs.

**Returns:** `Promise<{ unwired: number; failed: number }>` — The uninstall reversal: for each HostSpec, build an sc5 adapter (createHostAdapter over deps.fs + a no-op env/launchTarget - unwire ignores them) and call adapter.unwire() (removes exactly the insrc mcp entry + steering block; reversible no-op when absent). One host's HostFileAccessError does not abort the others; returns a tally. This is the body the vscode:uninstall hook invokes (ac3).

**Errors:**
- `(aggregated, never throws)` when A per-host unwire failure (HostFileAccessError) is counted in failed and does not abort the sweep; the function resolves a tally rather than throwing so the uninstall script always completes.

**Preconditions:**
- Runs in a plain-node context (the vscode:uninstall script) - no vscode import; only the sc5 adapters + the default node fs.
- unwire is idempotent: a host that was never wired is left byte-unchanged (no-op).

**Postconditions:**
- ac3: every host insrc wired is restored to its pre-insrc content; the sweep is safe to run whether or not any host was wired.

### `runUninstall`

```typescript
runUninstall(): Promise<void>
```

**Returns:** `Promise<void>` — The vscode:uninstall node entry (src/uninstall.ts): calls unwireAllHosts over HOST_SPECS + defaultHostFileSystem and exits cleanly. Declared in package.json scripts['vscode:uninstall'] = 'node ./out/uninstall.js'. NOTE: execution requires the S006 emit/.vsix (the package is noEmit for v1) - s5 authors this entry + declares the hook; s6 makes it run in a real uninstall.

**Errors:**
- `(never throws)` when unwireAllHosts never throws; runUninstall additionally guards so the uninstall script never exits non-zero on a host-file error.

**Preconditions:**
- Invoked by VS Code's uninstall lifecycle (the vscode:uninstall npm script), NOT by deactivate() (which fires on disable/reload - wiring must survive those, durability).

**Postconditions:**
- The extension's reversible host wiring is removed on uninstall (ac3).

### `activate`

```typescript
activate(context: vscode.ExtensionContext): void
```

**Parameters:**
- `context: vscode.ExtensionContext` — The VS Code activation context (already the entrypoint); s5 replaces its three independent offer IIFEs with one guarded runOnboarding call + constructs the OnboardingStore over context.workspaceState.

**Returns:** `void` — The S001-owned activation entry, minimally changed by s5: the three separate fire-and-forget offer IIFEs (offerDaemonInstall / offerHostWiring / offerWorkspaceRegistration) are replaced by ONE guarded fire-and-forget runOnboarding(...) that sequences them; activateExtension + the three registerXCommands calls are unchanged. Preserves the S001 never-throws/off-UI contract.

**Errors:**
- `(guarded)` when The single runOnboarding IIFE is wrapped in try/catch so activation never throws (S001).

**Preconditions:**
- extension.ts remains the sole vscode importer + the only place the OnboardingStore binds context.workspaceState.

**Postconditions:**
- The scattered concurrent modals (ac1 defect) are replaced by one coherent sequence; nothing else in activation changes.

## Data model changes

### `vscode-plugin/src/onboarding/ (new module dir)` — new

The s5 onboarding orchestrator: runOnboarding (sequences the three shipped offers behind the OnboardingStore gate) + the OnboardingStore seam interface (default impl over context.workspaceState constructed in extension.ts). Imports only node builtins + the shipped daemon/hosts/workspace command modules + the s1 surfaces (k5). Owns no new shared contract.

**Call sites:**
- `vscode-plugin/src/daemon/commands.ts`
- `vscode-plugin/src/hosts/commands.ts`
- `vscode-plugin/src/workspace/commands.ts`
- `vscode-plugin/src/extension.ts`

### `vscode-plugin/src/uninstall.ts (new node entry) + unwireAllHosts` — new

The fs-only uninstall reversal (ac3): unwireAllHosts iterates HOST_SPECS building an sc5 adapter per spec over defaultHostFileSystem and calls unwire() on each; runUninstall is the vscode:uninstall entry. No vscode import (plain node). package.json gains scripts['vscode:uninstall']='node ./out/uninstall.js'. Reuses createHostAdapter/HOST_SPECS/adapter.unwire() (src/hosts/adapter.ts:74, specs.ts:50) + defaultHostFileSystem (src/hosts/fs.ts).

**Call sites:**
- `vscode-plugin/src/hosts/adapter.ts`
- `vscode-plugin/src/hosts/specs.ts`
- `vscode-plugin/src/hosts/fs.ts`
- `vscode-plugin/package.json`

### `vscode-plugin/src/extension.ts (activation wiring)` — invariant-change

Replace the three independent fire-and-forget offer IIFEs (offerDaemonInstall / offerHostWiring / offerWorkspaceRegistration, src/extension.ts ~lines 72/85/97) with ONE guarded fire-and-forget runOnboarding(...) call + construct the OnboardingStore over context.workspaceState. activateExtension + registerDaemonCommands/registerHostCommands/registerWorkspaceCommands are unchanged (ac2 stays satisfied). The S001 never-throws/off-UI contract is preserved.

**Call sites:**
- `vscode-plugin/src/extension.ts`

## Interaction with shared contracts

| Contract | Role | How |
| :--- | :--- | :--- |
| `sc6` | consumes | runOnboarding awaits offerDaemonInstall (which drives DaemonLifecycleController.install on sc4 'accepted') as the FIRST step; not re-designed. |
| `sc7` | consumes | runOnboarding awaits offerWorkspaceRegistration (which drives WorkspaceRegistrar.register via repo.add) as the SECOND step; not re-designed. |
| `sc5` | consumes | runOnboarding awaits offerHostWiring (drives AiHostRegistry.detectPresent + adapter.wire) as the THIRD step; unwireAllHosts drives adapter.unwire() across HOST_SPECS for the uninstall reversal (ac3). sc5 unchanged. |
| `sc4` | consumes | Each sequenced step keeps its OWN sc4 ConsentGate prompt - per-action consent granularity preserved (k4); s5 adds no combined mega-consent. |
| `sc3` | consumes | s5 registers NO new command (the durable install/wire/register/lifecycle commands are already registered by s2/s3/s4); ac3 uses the uninstall hook, not a command - no new InsrcCommandId. |
| `sc2` | consumes | Each offer pushes its outcome into StatusSurface.set (unchanged); the orchestrator adds no separate status logic (lc1). |
| `sc1` | consumes | The daemon is reached only through the offers' existing rpc usage (install via daemon-ctl.sh, register via repo.add) - no new IPC (k5). |

## Error paths

### Error cases

- **One onboarding step's offer throws unexpectedly mid-sequence (e.g. a bug or an unguarded rejection inside offerDaemonInstall), which would otherwise abort the whole runOnboarding sequence before register/wire run.** (recoverable)
  - Detection: runOnboarding awaits each offer inside a per-step try/catch (each offer already swallows its own errors into a status, but the orchestrator guards the await too).
  - Response: The failing step is logged + skipped; the sequence CONTINUES to the next step (install failing does not prevent register/wire being offered). The whole runOnboarding is additionally wrapped by the activation caller's fire-and-forget try/catch so activate() never throws (S001).
  - User impact: A failure in one step never blocks the others or crashes activation; every step stays reachable via its durable command (ac2).
- **The onboarding sequence is interrupted (window closed / reloaded) after some steps ran but before markOnboarded, so the persisted onboarded flag is never set.** (recoverable)
  - Detection: On the next activation, onboarded.wasOnboarded(root) reads false (the flag was never written).
  - Response: runOnboarding re-runs the sequence - but each offer's OWN internal guard makes already-done steps no-ops (install skips when installed; register skips when registered/dismissed; wire re-detects). Only genuinely-unfinished steps re-prompt. markOnboarded runs after the (idempotent) completion.
  - User impact: At worst one extra pass of already-satisfied (silent) steps; no duplicate installs/registrations. The idempotent guards make re-entry safe.
- **During the uninstall sweep, one host's config file cannot be written (read-only / permissions / a present-but-malformed mcpServers), so its unwire() throws HostFileAccessError.** (recoverable)
  - Detection: unwireAllHosts wraps each adapter.unwire() in try/catch and counts a thrown HostFileAccessError in failed.
  - Response: The failing host is counted and SKIPPED; the sweep proceeds to the remaining hosts and resolves a { unwired, failed } tally. runUninstall never throws / never exits non-zero.
  - User impact: A single un-removable host does not abort the reversal for the others; the uninstall completes and the removable wiring is cleaned up.
- **The vscode:uninstall node script is invoked but the built out/uninstall.js does not exist yet (v1 is noEmit until S006 adds the bundle/.vsix).** (recoverable)
  - Detection: Node fails to resolve ./out/uninstall.js when VS Code runs the script (a packaging-time condition, surfaced by node's module resolution).
  - Response: This is the called-out cross-story dependency: s5 authors src/uninstall.ts + declares scripts['vscode:uninstall']; the driver's logic (unwireAllHosts) is unit-tested now over a fake fs, but the hook only executes once S006 emits + packages the .vsix. Flagged as an openQuestion / scope note, NOT silently assumed working.
  - User impact: Until S006 ships the bundle, uninstall does not auto-unwire; the unwire logic is proven by tests and the hook is declared, so S006 packaging completes ac3 end-to-end.

### Edge cases

| Input | Expected |
| :--- | :--- |
| A fresh workspace with no daemon, no wiring, no registration (the ac1 happy path). | runOnboarding runs offerDaemonInstall (prompt: install?) -> on its resolution offerWorkspaceRegistration (prompt: register?) -> then offerHostWiring (prompt: wire detected hosts?) IN ORDER - one coherent sequence of at most three sequential modals, not three concurrent pop-ups; then markOnboarded(root). |
| The workspace was already onboarded (wasOnboarded(root) === true) on a later activation. | runOnboarding no-ops immediately - no prompts. The durable commands remain the way to perform any step the developer wants to (re-)do (ac2). |
| No workspace folder is open (empty VS Code window) at activation. | runOnboarding still offers the GLOBAL steps whose guard permits (install if not installed; wire if a host is present) but SKIPS register (no root) and does NOT set the per-root onboarded flag (there is no root to key it on) - so opening a folder later still runs the register step. |
| The daemon is already installed + the workspace already registered, but a supported host is present and unwired, on a FRESH (not-yet-onboarded) workspace. | runOnboarding's install + register steps silently no-op (their guards), and only the wire prompt appears - the sequence degrades to just the needed step, then markOnboarded. |
| unwireAllHosts runs when NO host was ever wired (uninstall of an extension that only installed the daemon). | Each adapter.unwire() is an idempotent no-op (removeInsrcServer finds no key / SteeringWriter.remove finds no markers); the tally is { unwired: 0..n-no-op, failed: 0 } and every host file is left byte-unchanged. |
| The developer declines the install step but the workspace/host steps are still applicable. | offerDaemonInstall records the decline (its own status); the sequence still proceeds to offer register + wire (they are independent consents, k4). Declining install does not silently skip the later prompts. |

### Invariants to preserve

- Per-action consent granularity (k4): each of install / register / wire keeps its OWN sc4 ConsentGate prompt in the sequence - s5 introduces NO combined mega-consent, so a developer can accept one step and decline another. [[c1]]
- The uninstall reversal runs ONLY on true uninstall (the vscode:uninstall hook), NEVER in deactivate() - host wiring survives a mere disable / window reload (durability); unwire is idempotent + reversible (removes exactly the insrc markers, restoring prior content). [[c1]]
- lc1: s5 holds NO duplicated action logic - it only sequences the existing offers (which share the durable commands' flow) and pushes state through sc2; it registers no new command and re-implements no consent/branch logic. [[c1]]
- The S001 activation contract holds: the single runOnboarding call runs off the activation critical path, guarded fire-and-forget, so activate() never throws or blocks the editor (mirrors S001-S004). [[c1]]
- k5/k2: the onboarding orchestrator + the uninstall driver import only node builtins + the shipped seams (daemon/hosts/workspace + s1 surfaces) - no daemon internals/indexer/storage, no cloud path; the uninstall driver carries no vscode import (plain node). [[c4]]

## Test strategy

**Test framework:** `node:test (tsx --test) - the same runner S001-S004 use for vscode-plugin/ over injected fakes (no VS Code host); fake ConsentGate/StatusSurface + fake DaemonLifecycleController/WorkspaceRegistrar/AiHostRegistry + fake OnboardingStore/WorkspaceFolders/PromptStore drive runOnboarding; an in-memory HostFileSystem drives unwireAllHosts; plus source-scan tests for the k5 boundary + the extension.ts activation rewrite + the package.json vscode:uninstall hook.`

### Test levels

- **unit** — Prove runOnboarding sequences the three offers coherently, once-per-workspace, with each step's own guard + consent intact.
  - Subjects: `runOnboarding awaits the three offers IN ORDER install->register->wire (recorded call order), not concurrently - one coherent sequence, then markOnboarded(root)`, `runOnboarding no-ops (no offer runs, no prompt) when onboarded.wasOnboarded(root) is already true`, `a step that internally no-ops (already installed / already registered / no host) is silently skipped while the remaining needed steps still run - the sequence degrades to only the needed prompts`, `one step's offer throwing does NOT abort the sequence - the later steps still run (per-step guard); runOnboarding never throws`, `no workspace folder open -> register step is skipped and the per-root onboarded flag is NOT set (a later folder-open still onboards), while the global install/wire steps may still run`, `each step keeps its OWN sc4 consent (no combined mega-consent) - declining install still offers register + wire (k4)`
  - Fixtures: `fake ConsentGate returning scripted per-step outcomes + recording each ask`, `fake DaemonLifecycleController/WorkspaceRegistrar/AiHostRegistry (scripted isInstalled/state/detectPresent; one throw variant) + fake StatusSurface/WorkspaceFolders/PromptStore`, `an in-memory OnboardingStore recording wasOnboarded/markOnboarded`
- **unit** — Prove unwireAllHosts reverses every HostSpec's wiring over a fake fs, idempotently, isolating per-host failures.
  - Subjects: `unwireAllHosts builds an adapter per HostSpec over the injected fs and calls unwire() on each (mcp key + steering block removed), returning a { unwired, failed } tally`, `unwireAllHosts is an idempotent no-op for a host that was never wired (file left byte-unchanged; failed:0)`, `a host whose unwire() throws HostFileAccessError is counted in failed and does NOT abort the sweep (the other hosts are still unwired)`, `runUninstall calls unwireAllHosts over HOST_SPECS + defaultHostFileSystem and never throws / never exits non-zero`
  - Fixtures: `an in-memory HostFileSystem seeded with wired + un-wired + write-failing host configs`, `a couple of test HostSpecs (or the real HOST_SPECS) for the sweep`
- **unit** — Prove the k5 boundary + the activation rewrite + the uninstall-hook declaration by source scan (mirroring S002-S004).
  - Subjects: `source-scan: vscode-plugin/src/onboarding/ imports only node builtins + the shipped daemon/hosts/workspace command modules + the s1 surfaces - no daemon internals/indexer/storage, no cloud/HTTP (k5)`, `source-scan: vscode-plugin/src/uninstall.ts carries NO vscode import (plain node) and imports only the sc5 host seams + node builtins (k5)`, `extension.ts calls runOnboarding exactly ONCE (guarded fire-and-forget) and NO LONGER fires the three separate offer IIFEs - the scattered-pop-up defect is gone (S001 never-throws preserved)`, `package.json declares scripts['vscode:uninstall'] = 'node ./out/uninstall.js' (the ac3 hook is declared)`
  - Fixtures: `source read of vscode-plugin/src/onboarding/*.ts + vscode-plugin/src/uninstall.ts + vscode-plugin/src/extension.ts`, `read of vscode-plugin/package.json scripts`
- **smoke** — Prove the package still typechecks with the onboarding module + uninstall entry added.
  - Subjects: `the vscode-plugin package typechecks (tsc -p tsconfig.json) with src/onboarding/ + src/uninstall.ts + the extension.ts rewrite`
  - Fixtures: `the vscode-plugin tsconfig`

### Acceptance mapping

| Criterion | Proving tests |
| :--- | :--- |
| `ac1` | `runOnboarding awaits the three offers IN ORDER install->register->wire (recorded call order), not concurrently - one coherent sequence (runOnboarding unit test) - proves 'coherent rather than unrelated pop-ups'`, `a step that internally no-ops is skipped while the needed steps still run (runOnboarding unit test) - proves the sequence guides through only the NEEDED prompts`, `extension.ts calls runOnboarding once + no longer fires the three separate offer IIFEs (activation source-scan) - proves the scattered-pop-up defect is removed`, `each step keeps its own sc4 consent - no combined mega-consent (runOnboarding unit test) - proves k4 per-action granularity within the coherent flow` |
| `ac2` | `runOnboarding no-ops when already onboarded, and a step it skips stays performable - the durable install/wire/register/lifecycle commands are ALREADY registered by s2/s3/s4 (runOnboarding unit test asserts s5 registers no new command; the existing registerXCommands are untouched) - proves no dismissed prompt is a dead end`, `package.json still declares the install/wire/register + daemon-lifecycle commands in contributes.commands (bundle source-scan, unchanged from S002-S004) - proves the durable commands remain palette-reachable (k6)` |
| `ac3` | `unwireAllHosts removes the mcp entry + steering block for each wired HostSpec over the fake fs and restores prior content (unwire unit test) - proves the reversible wiring is removed on the uninstall path`, `unwireAllHosts is an idempotent no-op for an un-wired host + isolates a per-host failure (unwire unit test) - proves the uninstall sweep is safe + complete`, `package.json declares scripts['vscode:uninstall'] = 'node ./out/uninstall.js' + src/uninstall.ts carries no vscode import (source-scan) - proves the uninstall HOOK that invokes the reversal is declared (its execution completed by S006 emit/.vsix)` |

## Alternatives considered

### a1: A coalescing onboarding orchestrator (sequenced offers + persisted once-per-workspace gate) + a plain-node vscode:uninstall unwire driver — **CHOSEN**

One new src/onboarding/ seam runs the three existing offers as an awaited install->register->wire sequence behind a persisted OnboardingStore; a fs-only uninstall entry unwires every HostSpec.

Add a new injectable seam src/onboarding/ that composes the shipped contracts - it OWNS no new shared contract, only sequences. runOnboarding({ controller, registrar, folders, registry, consent, status, onboarded }) awaits offerDaemonInstall -> offerWorkspaceRegistration -> offerHostWiring IN ORDER (each keeps its own internal no-op guard), gated by an injected OnboardingStore { wasOnboarded(root); markOnboarded(root) } (default over context.workspaceState, per-root key, mirroring S004's PromptStore) so the sequence auto-runs ONCE per workspace; on completion markOnboarded(root). extension.ts replaces its three independent fire-and-forget offer IIFEs with ONE guarded fire-and-forget runOnboarding call (S001 never-throws preserved). The durable commands stay registered by the existing registerXCommands (ac2 already satisfied - s5 re-registers nothing). For ac3, add src/uninstall.ts: a plain-node entry (no vscode import) that iterates HOST_SPECS, builds an adapter per spec via createHostAdapter over defaultHostFileSystem, and calls unwire() on each (reversible no-op when absent); declare package.json scripts['vscode:uninstall'] = 'node ./out/uninstall.js'. Actual execution needs the S006 emit/.vsix (noEmit today) - s5 authors the driver + declares the hook; s6 makes it run.

### a2: Onboarding gated only by live probes (no persisted onboarded flag) + uninstall in deactivate()

Skip the persisted gate - rely on each offer's own guards - and run unwire from deactivate() instead of a vscode:uninstall script.

runOnboarding sequences the three offers but persists NO 'onboarded' flag - it relies purely on each offer's internal guard. unwire is driven from extension.ts deactivate() over the sc5 adapters.

**Rejected because:** Fails ac3 (deactivate() unwires on disable/reload, not just uninstall) and only partial on ac1 (the wire step re-nags without the persisted onboarded gate).

### a3: A single mega-consent prompt that bundles install+register+wire into one modal

Replace the three sc4 prompts with ONE combined consent that performs all three actions on a single 'accept'.

Instead of sequencing the three offers, present ONE combined ConsentGate prompt listing all three actions, and on a single 'accepted' perform install + register + wire together; skip the per-step prompts.

**Rejected because:** Violates k4/sc4 (one mega-consent collapses three distinct invasive actions behind one consent) and lc1 (re-implements branching logic in s5).

## Open questions

- The vscode:uninstall hook's actual EXECUTION depends on S006 adding emit + packaging the .vsix (v1 is noEmit today); s5 authors src/uninstall.ts + unwireAllHosts + declares scripts['vscode:uninstall'], all unit-tested now over a fake fs, and S006 completes ac3 end-to-end.

## Resolved questions

- `q8d382450` — The vscode:uninstall hook's actual EXECUTION depends on S006 adding emit + packaging the .vsix (v1 is noEmit today); s5 authors src/uninstall.ts + unwireAllHosts + declares scripts['vscode:uninstall'], all unit-tested now over a fake fs, and S006 completes ac3 end-to-end.
  - **resolved**: Split: s5 authors + unit-tests, S006 closes ac3 _(2026-09-22T06:48:46.952Z)_

## Citations

- **[[c1]]** `code` `Shipped S002/S003/S004 offers + durable commands: offerDaemonInstall (src/daemon/commands.ts:41), offerHostWiring (src/hosts/commands.ts:29), offerWorkspaceRegistration (src/workspace/commands.ts:81); registerDaemonCommands/registerHostCommands/registerWorkspaceCommands already register the durable commands`
- **[[c2]]** `code` `The scattered-pop-up defect: extension.ts fires the three offers as three independent fire-and-forget IIFEs (src/extension.ts ~72/85/97) that s5 replaces with one sequenced runOnboarding`
- **[[c3]]** `code` `Reversible unwire + uninstall hook: AiHostAdapter.unwire() (src/hosts/adapter.ts:74) over HOST_SPECS (src/hosts/specs.ts:50) + defaultHostFileSystem (src/hosts/fs.ts); the VS Code uninstall hook is package.json scripts['vscode:uninstall'] (plain node)`
- **[[c4]]** `convention` `InsrcCommandId (src/surfaces/command-registry.ts) has no unwire id (ac3 via the uninstall hook, no sc3 amendment); lc1 first-class-commands + the k5/k2 thin boundary; the OnboardingStore mirrors S004's PromptStore-over-workspaceState`
