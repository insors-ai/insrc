<!-- insrc:artifact PLAN-ba132c185fe45860-s3 -->

# Plan: E20260923ba132c18:S003

**Epic:** `work-framed-approved-spec-proceed-from`
**LLD run:** `wf-1790173412852-v12dao`
**LLD effective hash:** `3fb0b2204d88...`

## Tasks

| # | Task | Size | Depends on | Tests | Derived from |
| :--- | :--- | :--- | :--- | :--- | :--- |
| 1 | **`t1`** Add the VS-Code-free picker module (model-tier-picker.ts) | M | — | unit: happy path: available:true+models -> dropdown shows exactly those models, picking one writeKeyPath(['models','tiers',tier,'model'], id) once; unit: available:false -> disabled 'no models available' + Refresh; Refresh re-invokes listModels; no writeKeyPath (saved model untouched); unit: available:true + models:[] -> same 'no models available' + Refresh, no write; unit: saved model present in a successful list -> shown once (marked current), not duplicated; re-pick is an idempotent no-op (no writeKeyPath); unit: saved model ABSENT from a successful list -> disabled '(current, not in catalog)' entry showing the saved id; picking a real model writes the new id; unit: provider changed mid-flow -> pending model clears + listModels re-queries the NEW provider; save only from the new list; runner key written on confirm; unit: listModels rejection (daemon unreachable) -> treated as available:false (Refresh), notify emitted, no writeKeyPath, no throw; unit: catalog() rejection -> notify + clean abort, no write, no throw; unit: writeKeyPath refusal ({ok:false, reason}) -> reason surfaced via notify, no further write, no throw; unit: Esc/cancel at tier / provider / model step -> pick() undefined -> clean return, no write; unit: tier runner outside the ModelProvider enum -> no out-of-enum provider passed to listModels; notify + provider-selection step offered | [[c2]] [[c3]] [[c4]] [[c6]] |
| 2 | **`t2`** Wire the 'insrc.models.setTier' command in extension.ts | S | `t1` | unit: source-scan: extension.ts registers 'insrc.models.setTier' via the sc3 registry and wires runSetModelTier over the default seams (client.rpc + hoisted configGateway + showQuickPick) | [[c1]] [[c5]] [[c6]] |
| 3 | **`t3`** Declare the command in package.json contributes.commands | S | `t2` | unit: contributes-manifest scan: package.json contributes.commands includes { command: 'insrc.models.setTier', title: 'insrc: Set model tier' } (palette-reachable, k6) | [[c7]] |
| 4 | **`t4`** Add colocated node:test unit + packaging tests | M | `t1`, `t2`, `t3` | unit: source-scan: the S003 picker module imports no 'vscode' (the sole vscode importer stays extension.ts); smoke: the full vscode-plugin suite passes locally via tsx --test (colocated under src/**/__tests__/) | [[c8]] [[c9]] |

### E20260923ba132c18:S003:T001 — Add the VS-Code-free picker module (model-tier-picker.ts)

Create vscode-plugin/src/models/model-tier-picker.ts exporting SetModelTierDeps + runSetModelTier(deps). Implements the tier→provider→model flow over injected seams (listModels / catalog / writeKeyPath / pick / notify): pick tier → read effective runner+model from catalog() → optional provider step (changing it clears the pending model) → listModels(provider) → render the k7 item states (model / refresh / current-not-in-catalog / no-models) → on a real pick writeKeyPath(['models','tiers',tier,'model'], id) (and the runner key only if provider changed). Never throws — all errors (listModels reject, catalog reject, writeKeyPath {ok:false}) surface via notify. Imports NO vscode. Purely additive; nothing wires it yet.

**Acceptance checks:**
- vscode-plugin/src/models/model-tier-picker.ts exists and exports runSetModelTier + SetModelTierDeps
- The module imports no 'vscode' module (VS-Code-free; injected seams only)
- runSetModelTier is dropdown-only (k4): only models from the daemon's returned list are selectable; no free-text entry
- BOTH empty-state variants — available:false AND available:true+models:[] — render 'no models available' + Refresh and write nothing (saved model untouched, ac2/k7); on a real pick, writeKeyPath(['models','tiers',tier,'model'], id) is called exactly once
- Provider changed mid-flow clears the pending model and re-queries listModels for the new provider (ac4); the runner key is written on confirm
- A saved model absent from a successful list renders a disabled '(current, not in catalog)' entry (ac3)
- No exception escapes runSetModelTier (never-throw idiom); errors go to notify

### E20260923ba132c18:S003:T002 — Wire the 'insrc.models.setTier' command in extension.ts

In vscode-plugin/src/extension.ts register 'insrc.models.setTier' via the sc3 command registry (commands.register), invoking runSetModelTier over the default seams: listModels = client.rpc<ModelListResult>('providers.listModels', {provider}) (the shipped sc2 IPC), catalog + writeKeyPath = the already-hoisted configGateway (:160), pick = vscode.window.showQuickPick (the :293 pattern), notify = a status/notify surface. Additive to the existing command wiring; no existing command changes; extension.ts remains the sole vscode importer.

**Acceptance checks:**
- extension.ts registers 'insrc.models.setTier' via the sc3 registry and its callback invokes runSetModelTier
- The default seams bind listModels to client.rpc('providers.listModels'), catalog+writeKeyPath to the hoisted configGateway, pick to vscode.window.showQuickPick, and a notify surface
- No new daemon capability is introduced (k3) — only the shipped sc2 IPC + sc8 gateway + shared client are used
- The build compiles (tsc/esbuild) with the new wiring

### E20260923ba132c18:S003:T003 — Declare the command in package.json contributes.commands

Add { command: 'insrc.models.setTier', title: 'insrc: Set model tier' } to vscode-plugin/package.json contributes.commands so the command is palette-reachable (k6). Manifest-only additive change.

**Acceptance checks:**
- vscode-plugin/package.json contributes.commands includes { command: 'insrc.models.setTier', title: 'insrc: Set model tier' }
- The command is reachable from the VS Code command palette (k6)

### E20260923ba132c18:S003:T004 — Add colocated node:test unit + packaging tests

Add vscode-plugin/src/models/__tests__/model-tier-picker.test.ts exercising runSetModelTier over injected fakes for every branch (happy-path write; available:false + Refresh untouched; available:true+[]; saved-present idempotent; saved-absent '(current, not in catalog)'; provider-switch-clears + runner write; listModels reject; catalog reject; writeKeyPath {ok:false}; Esc/cancel; out-of-enum runner). Add a source-scan asserting the module imports no vscode, and extend the packaging.test.ts contributes-manifest scan (or a colocated scan) to assert 'insrc.models.setTier' is contributed. All green under tsx --test locally.

**Acceptance checks:**
- vscode-plugin/src/models/__tests__/ contains picker-flow unit tests covering all k7 branches + the never-throw error paths + cancel, over injected fakes (no live vscode)
- A source-scan test asserts model-tier-picker.ts imports no 'vscode'
- A contributes-manifest scan asserts package.json contributes the 'insrc.models.setTier' command (k6)
- The full suite passes locally via tsx --test (verified locally, not on GitHub CI)

## Test-strategy coverage

| LLD strategy item | Covered by |
| :--- | :--- |
| happy path: tier picked, provider read from catalog(), listModels returns available:true + models -> the QuickPick shows exactly those models (dropdown-only), picking one calls writeKeyPath(['models','tiers',tier,'model'], id) exactly once | `t1`, `t4` |
| available:false -> the items are a disabled 'no models available' + a Refresh entry; picking Refresh re-invokes listModels; NO writeKeyPath is called (saved model untouched) | `t1`, `t4` |
| available:true + models:[] (curated-empty/reachable-zero) -> same 'no models available' + Refresh presentation, no write | `t1`, `t4` |
| saved model present in a successful list -> shown once (marked current), not duplicated as '(current, not in catalog)'; re-picking it is an idempotent no-op (no writeKeyPath) | `t1`, `t4` |
| saved model ABSENT from a successful list -> a disabled '(current, not in catalog)' entry showing the saved id; it is not selectable; picking a real model writes the new id | `t1`, `t4` |
| provider changed mid-flow -> the pending model clears + listModels re-queries for the NEW provider; the model can only be saved from the new list; on confirm the runner key is also written | `t1`, `t4` |
| a listModels rejection (daemon unreachable) -> treated as available:false (Refresh), a notify is emitted, no writeKeyPath, no throw escapes | `t1`, `t4` |
| a catalog() rejection -> notify + clean abort, no write, no throw | `t1`, `t4` |
| a writeKeyPath refusal ({ok:false, reason}) -> the reason is surfaced via notify, no further write, no throw | `t1`, `t4` |
| Esc/cancel at the tier / provider / model step -> pick() undefined -> clean return, no write | `t1`, `t4` |
| a tier runner outside the ModelProvider enum -> no out-of-enum provider is passed to listModels; a notify + the provider-selection step is offered | `t1`, `t4` |
| the S003 picker module imports no 'vscode' (the SOLE vscode importer stays extension.ts) — an import source-scan | `t4` |
| package.json contributes.commands includes { command: 'insrc.models.setTier', title: 'insrc: Set model tier' } (palette-reachable, k6) — mirrors the packaging.test.ts command-manifest assertion | `t3`, `t4` |
| extension.ts registers 'insrc.models.setTier' via the sc3 registry and wires runSetModelTier over the default seams (client.rpc + the hoisted configGateway + showQuickPick) | `t2` |

## Citations

- **[[c1]]** `prior-artifact` `LLD s3 — interactionWithShared sc2 (ModelList): client.rpc<ModelListResult>('providers.listModels', { provider })` — "S003 consumes sc2 (ModelList) over the shared client: client.rpc<ModelListResult>('providers.listModels', { provider }) where provider is the tier's runner."
- **[[c2]]** `prior-artifact` `LLD s3 — contractDetails.runSetModelTier(deps: SetModelTierDeps): Promise<void>` — "The S003-private orchestrator for the 'insrc: Set model tier' command. Flow: pick a tier -> read its effective runner + current model from catalog() -> listModels(provider) -> render the dropdown (or "
- **[[c3]]** `prior-artifact` `LLD s3 — dataModelChanges SetModelTierDeps (new injected-seams interface) + the k7 QuickPick item kinds` — "The injected-seams interface for the S003 picker module (listModels / catalog / writeKeyPath / pick / notify)… the QuickPick item type carries { label, description?, id?, kind (model | refresh | curre"
- **[[c4]]** `analyze-bundle` `s1 reused-seam / consumed-contract — sc2 result shape (src/daemon/list-models.ts:46 ModelListResult, :30 ModelProvider) + shared ipc-client client.rpc (src/shared/ipc-client.ts:93)` — "ModelListResult { provider, available, models: {id, displayName?}[] } at list-models.ts:46; ModelProvider = 'ollama' | 'cli-claude' | 'cli-codex' at list-models.ts:30; the rpc<T>(method, params?) sign"
- **[[c5]]** `analyze-bundle` `s1 config-target — the write path ['models','tiers',tier,'model'] on the existing CONFIG_CATALOG key (src/config/config-catalog.ts:96) via the sc8 writeKeyPath ARRAY form (vscode-plugin/src/config/gateway.ts:42)` — "models.tiers.<core|mid|cheap>.{runner,model} is an existing static CONFIG_CATALOG key at config-catalog.ts:96; S003 writes it via writeKeyPath(['models','tiers',tier,'model'], id) — no schema change, "
- **[[c6]]** `analyze-bundle` `s1 reused-seam — extension.ts is the sole vscode importer, hoisting the client (:67), configGateway (:160), and using showQuickPick (:293); sc3 command registry at vscode-plugin/src/daemon/commands.ts:61` — "extension.ts already constructs the client (:67), hoists configGateway (:160), and uses showQuickPick (:293); the sc3 registry pattern commands.register({id,title}, cb) is at commands.ts:61."
- **[[c7]]** `prior-artifact` `LLD s3 — dataModelChanges insrc.models.setTier (new command): contributes.commands entry + sc3 registration` — "A new command id + title ('insrc: Set model tier') registered via the sc3 registry (commands.register) and declared as a contributes.commands manifest entry so it is palette-reachable (k6)."
- **[[c8]]** `prior-artifact` `LLD s3 — testStrategy: the unit + packaging test levels (inject-the-dependency over fakes, no-vscode source-scan, contributes-manifest scan)` — "Exercise runSetModelTier over injected fakes so every k7 branch is verified WITHOUT vscode… Guard the packaging + wiring invariants via source-scans: the module is VS-Code-free and the command is pale"
- **[[c9]]** `analyze-bundle` `s1 test-prior-art — the colocated node:test idiom: vscode-plugin/src/panels/__tests__/repo-config.test.ts (inject-the-dependency) + vscode-plugin/src/__tests__/packaging.test.ts (contributes-manifest scan)` — "Both prior-art test files exist: repo-config.test.ts (S007's inject-the-dependency over fakes, incl. a no-vscode-import source scan) and packaging.test.ts (the contributes-manifest scan)."
