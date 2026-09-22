<!-- insrc:artifact PLAN-ad0d45c9d690f8c1-s5 -->

# Plan: E20260922ad0d45c9:S005

**Epic:** `build-insrc-vs-code-extension-v1`
**LLD run:** `wf-1790058200031-ods9oh`
**LLD effective hash:** `1e2038ef7232...`

## Tasks

| # | Task | Size | Depends on | Tests | Derived from |
| :--- | :--- | :--- | :--- | :--- | :--- |
| 1 | **`t1`** src/onboarding/ - runOnboarding orchestrator + OnboardingStore seam | M | — | unit: runOnboarding awaits the three offers IN ORDER install->register->wire (recorded call order), not concurrently - one coherent sequence, then markOnboarded(root); unit: runOnboarding no-ops (no offer runs, no prompt) when onboarded.wasOnboarded(root) is already true; unit: a step that internally no-ops (already installed / already registered / no host) is silently skipped while the remaining needed steps still run - the sequence degrades to only the needed prompts; unit: one step's offer throwing does NOT abort the sequence - the later steps still run (per-step guard); runOnboarding never throws; unit: no workspace folder open -> register step is skipped and the per-root onboarded flag is NOT set (a later folder-open still onboards), while the global install/wire steps may still run; unit: each step keeps its OWN sc4 consent (no combined mega-consent) - declining install still offers register + wire (k4) | [[c1]] [[c4]] |
| 2 | **`t2`** src/uninstall.ts - unwireAllHosts + runUninstall (fs-only reversal) | M | — | unit: unwireAllHosts builds an adapter per HostSpec over the injected fs and calls unwire() on each (mcp key + steering block removed), returning a { unwired, failed } tally; unit: unwireAllHosts is an idempotent no-op for a host that was never wired (file left byte-unchanged; failed:0); unit: a host whose unwire() throws HostFileAccessError is counted in failed and does NOT abort the sweep (the other hosts are still unwired); unit: runUninstall calls unwireAllHosts over HOST_SPECS + defaultHostFileSystem and never throws / never exits non-zero; unit: source-scan: vscode-plugin/src/uninstall.ts carries NO vscode import (plain node) and imports only the sc5 host seams + node builtins (k5) | [[c3]] |
| 3 | **`t3`** Wire runOnboarding into extension.ts (replace the 3 offer IIFEs) + declare the vscode:uninstall hook | S | `t1`, `t2` | unit: extension.ts calls runOnboarding exactly ONCE (guarded fire-and-forget) and NO LONGER fires the three separate offer IIFEs - the scattered-pop-up defect is gone (S001 never-throws preserved); unit: source-scan: vscode-plugin/src/onboarding/ imports only node builtins + the shipped daemon/hosts/workspace command modules + the s1 surfaces - no daemon internals/indexer/storage, no cloud/HTTP (k5); unit: package.json declares scripts['vscode:uninstall'] = 'node ./out/uninstall.js' (the ac3 hook is declared); smoke: the vscode-plugin package typechecks (tsc -p tsconfig.json) with src/onboarding/ + src/uninstall.ts + the extension.ts rewrite | [[c2]] [[c3]] [[c4]] |

### E20260922ad0d45c9:S005:T001 — src/onboarding/ - runOnboarding orchestrator + OnboardingStore seam

Create vscode-plugin/src/onboarding/ with: the OnboardingStore seam interface { wasOnboarded(root): boolean; markOnboarded(root): void } + an in-memory impl for tests (the real workspaceState binding lives in extension.ts, t3); and runOnboarding(deps) that resolves the primary root (folders()[0]), and when a root exists returns early if onboarded.wasOnboarded(root); else awaits the three shipped offers IN ORDER offerDaemonInstall -> offerWorkspaceRegistration -> offerHostWiring (each in its own per-step try/catch so one failure doesn't abort the rest; each keeps its OWN internal guard + sc4 consent), then onboarded.markOnboarded(root). A no-folder window skips the register step + the onboarded gate but still runs the global install/wire steps. Pure sequencing over the shipped seam TYPES + offers; registers no command, holds no duplicated action logic (lc1). Imports only node builtins + ../daemon|hosts|workspace command modules + ../surfaces (k5).

**Acceptance checks:**
- runOnboarding awaits offerDaemonInstall -> offerWorkspaceRegistration -> offerHostWiring in that order (recorded), not concurrently; then markOnboarded(root)
- runOnboarding no-ops (no offer runs) when onboarded.wasOnboarded(root) is already true
- one step's offer throwing does NOT abort the sequence (per-step guard); the later steps still run; runOnboarding never throws
- no workspace folder open -> the register step is skipped and markOnboarded is NOT called (no root key), while global install/wire steps may still run
- OnboardingStore interface + in-memory test impl are exported; runOnboarding holds no duplicated consent/branch logic (lc1)

### E20260922ad0d45c9:S005:T002 — src/uninstall.ts - unwireAllHosts + runUninstall (fs-only reversal)

Add vscode-plugin/src/uninstall.ts (plain node, NO vscode import): unwireAllHosts({ specs, fs }) iterates specs, builds an sc5 adapter per spec via createHostAdapter over fs + a no-op env/launchTarget (unwire ignores them), calls adapter.unwire() inside a per-host try/catch (removes the mcpServers.insrc key + the steering marker block; reversible no-op when absent), counting HostFileAccessError failures, and returns { unwired, failed } (never throws). runUninstall() calls unwireAllHosts over HOST_SPECS + defaultHostFileSystem and never throws / never exits non-zero. Reuses the shipped createHostAdapter/HOST_SPECS/adapter.unwire (src/hosts/adapter.ts:74, specs.ts:50) + defaultHostFileSystem (src/hosts/fs.ts). Imports only the hosts seams + node builtins (k5).

**Acceptance checks:**
- unwireAllHosts builds an adapter per HostSpec over the injected fs and calls unwire() on each; removes the mcp key + steering block; returns { unwired, failed }
- unwireAllHosts is an idempotent no-op for a never-wired host (file byte-unchanged; failed:0)
- a host whose unwire() throws HostFileAccessError is counted in failed and does NOT abort the sweep (other hosts still unwired)
- runUninstall calls unwireAllHosts over HOST_SPECS + defaultHostFileSystem and never throws / never exits non-zero
- source-scan: src/uninstall.ts carries NO vscode import (plain node) and imports only the hosts seams + node builtins (k5)

### E20260922ad0d45c9:S005:T003 — Wire runOnboarding into extension.ts (replace the 3 offer IIFEs) + declare the vscode:uninstall hook

In extension.ts (sole vscode importer): construct the default OnboardingStore over context.workspaceState (per-root namespaced key distinct from S004's register-dismissed key; get/update try-guarded) and REPLACE the three independent fire-and-forget offer IIFEs (offerDaemonInstall/offerHostWiring/offerWorkspaceRegistration, ~lines 72/85/97) with ONE guarded fire-and-forget runOnboarding({ controller, registrar, registry, consent, status, folders, prompts, onboarded }) call - preserving the S001 never-throws/off-UI contract. activateExtension + registerDaemonCommands/registerHostCommands/registerWorkspaceCommands stay untouched (ac2). ADD scripts['vscode:uninstall'] = 'node ./out/uninstall.js' to package.json (the ac3 hook declaration; its execution is completed by S006 emit/.vsix per the resolved open question). The daemon/hosts/workspace offer imports stay for reuse by runOnboarding.

**Acceptance checks:**
- extension.ts calls runOnboarding exactly ONCE (guarded fire-and-forget) and NO LONGER fires the three separate offer IIFEs; the scattered-pop-up defect is removed (S001 never-throws preserved)
- extension.ts constructs the OnboardingStore over context.workspaceState (per-root key distinct from the S004 register-dismissed key; get/update guarded)
- package.json declares scripts['vscode:uninstall'] = 'node ./out/uninstall.js'
- the vscode-plugin package typechecks (tsc -p tsconfig.json); the S002/S003/S004 durable commands remain in contributes.commands (subset check, k6)

## Test-strategy coverage

| LLD strategy item | Covered by |
| :--- | :--- |
| runOnboarding awaits the three offers IN ORDER install->register->wire (recorded call order), not concurrently - one coherent sequence, then markOnboarded(root) | `t1` |
| runOnboarding no-ops (no offer runs, no prompt) when onboarded.wasOnboarded(root) is already true | `t1` |
| a step that internally no-ops (already installed / already registered / no host) is silently skipped while the remaining needed steps still run - the sequence degrades to only the needed prompts | `t1` |
| one step's offer throwing does NOT abort the sequence - the later steps still run (per-step guard); runOnboarding never throws | `t1` |
| no workspace folder open -> register step is skipped and the per-root onboarded flag is NOT set (a later folder-open still onboards), while the global install/wire steps may still run | `t1` |
| each step keeps its OWN sc4 consent (no combined mega-consent) - declining install still offers register + wire (k4) | `t1` |
| unwireAllHosts builds an adapter per HostSpec over the injected fs and calls unwire() on each (mcp key + steering block removed), returning a { unwired, failed } tally | `t2` |
| unwireAllHosts is an idempotent no-op for a host that was never wired (file left byte-unchanged; failed:0) | `t2` |
| a host whose unwire() throws HostFileAccessError is counted in failed and does NOT abort the sweep (the other hosts are still unwired) | `t2` |
| runUninstall calls unwireAllHosts over HOST_SPECS + defaultHostFileSystem and never throws / never exits non-zero | `t2` |
| source-scan: vscode-plugin/src/onboarding/ imports only node builtins + the shipped daemon/hosts/workspace command modules + the s1 surfaces - no daemon internals/indexer/storage, no cloud/HTTP (k5) | `t3` |
| source-scan: vscode-plugin/src/uninstall.ts carries NO vscode import (plain node) and imports only the sc5 host seams + node builtins (k5) | `t2` |
| extension.ts calls runOnboarding exactly ONCE (guarded fire-and-forget) and NO LONGER fires the three separate offer IIFEs - the scattered-pop-up defect is gone (S001 never-throws preserved) | `t3` |
| package.json declares scripts['vscode:uninstall'] = 'node ./out/uninstall.js' (the ac3 hook is declared) | `t3` |
| the vscode-plugin package typechecks (tsc -p tsconfig.json) with src/onboarding/ + src/uninstall.ts + the extension.ts rewrite | `t3` |

## Citations

- **[[c1]]** `prior-artifact` `LLD s5: the three shipped offers runOnboarding sequences - offerDaemonInstall (daemon/commands.ts:41), offerHostWiring (hosts/commands.ts:29), offerWorkspaceRegistration (workspace/commands.ts:81); the durable commands are already registered by s2/s3/s4`
- **[[c2]]** `prior-artifact` `LLD s5: the scattered-pop-up activation defect - extension.ts fires the three offers as three independent fire-and-forget IIFEs that s5 replaces with one guarded sequenced runOnboarding`
- **[[c3]]** `prior-artifact` `LLD s5: the reversible unwire + uninstall hook - AiHostAdapter.unwire (hosts/adapter.ts:74) over HOST_SPECS (specs.ts:50) + createHostAdapter + defaultHostFileSystem (hosts/fs.ts); the VS Code uninstall hook is package.json scripts['vscode:uninstall'] (plain node); execution completed by S006 emit/.vsix (resolved open question)`
- **[[c4]]** `prior-artifact` `LLD s5: conventions - no new InsrcCommandId (ac3 via the uninstall hook, no sc3 amendment), lc1 first-class-commands, the k5/k2 thin boundary, and the OnboardingStore mirroring S004's PromptStore-over-workspaceState`

<!-- insrc:review -->

## Review

### ✅ Review `PASS` — plan (plan)

**0 HIGH · 0 MED · 7 LOW** · model `client` · reviewed 2026-09-22T06:53:08.490Z

| Ref | Kind | Severity | Fixability | Premise | Evidence | Action |
| --- | --- | --- | --- | --- | --- | --- |
| t1 | citation | LOW | manual | The three offer functions runOnboarding sequences exist at their cited locations (offerDaemonInstall daemon/commands.ts:41, offerHostWiring hosts/commands.ts:29, offerWorkspaceRegistration workspace/commands.ts:81). | grep confirms offerDaemonInstall (daemon/commands.ts:41), offerHostWiring (hosts/commands.ts:29), offerWorkspaceRegistration (workspace/commands.ts:81) all exist at the cited lines. | none - verified sound |
| t2 | citation | LOW | manual | The uninstall reversal reuses shipped symbols: createHostAdapter + adapter.unwire() (hosts/adapter.ts), HOST_SPECS (hosts/specs.ts:50), defaultHostFileSystem (hosts/fs.ts). | createHostAdapter (adapter.ts:45), HOST_SPECS (specs.ts:50), defaultHostFileSystem (fs.ts:43), and adapter.unwire() (adapter.ts:74) all exist - the shipped symbols t2 reuses. | none - verified sound |
| t3 | citation | LOW | manual | extension.ts currently fires the three offers as three independent fire-and-forget IIFEs that t3 replaces with one runOnboarding. | extension.ts has three `void (async () =>` IIFEs at 114/127/139, calling offerDaemonInstall (117), offerHostWiring (129), offerWorkspaceRegistration (141) - exactly the three scattered fire-and-forget offers t3 replaces. | none - verified sound |
| t1 | semantic | LOW | manual | The default OnboardingStore binding relies on vscode.ExtensionContext.workspaceState, already declared in the S004 vscode.d.ts shim (Memento). | vscode.d.ts:62 declares interface Memento and :72 ExtensionContext.workspaceState: Memento; extension.ts already uses context.workspaceState.get/update (94/101) - the OnboardingStore binding relies on an already-declared surface. | none - verified sound |
| t3 | cross-artifact | LOW | manual | The durable commands ac2 relies on are already registered (registerDaemonCommands/registerHostCommands/registerWorkspaceCommands) so s5 re-registers nothing. | registerDaemonCommands (daemon/commands.ts:58), registerHostCommands (hosts/commands.ts:77), registerWorkspaceCommands (workspace/commands.ts:92) all exist - the durable commands are already registered; s5 re-registers nothing. | none - verified sound |
| t3 | inventory | LOW | manual | The S002/S003/S004 durable commands (7 ids: 5 daemon + hosts.wire + workspace.register) remain in contributes.commands for the subset check. | package.json:20-26 holds exactly the 7 durable command ids (5 daemon + hosts.wire + workspace.register) that the subset check preserves. | none - verified sound |
| tasks | ordering | LOW | manual | The task DAG (t1, t2 independent; t3 depends on both) is acyclic and orders the onboarding + uninstall modules before the extension.ts wiring. | Ordering claim (no probe): edges t1->t3, t2->t3 form a DAG; order 1,2<3 is a valid topological order placing the onboarding + uninstall modules before the extension.ts wiring. | none - verified sound |
