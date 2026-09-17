<!-- insrc:artifact LLD-61d8c73edb68041a-s5 -->

# LLD: E2026091761d8c73e:S005

**Epic:** `integrate-insrc-framework-into-jetbrains-ide`
**HLD base run:** `wf-1789642152969-snttef`
**HLD effective hash:** `7ebd2fd85012...`

## HLD context

**Framework:** A single new IntelliJ-Platform plugin (one codebase, all four target IDEs) that owns NO reasoning: it is a thin orchestrator that binds the IDE's lifecycle moments to already-built insrc backend surfaces. On project open it detects any present AI host, ensures the backend daemon is present/current, offers explicit project registration, wires the insrc-mcp server plus the tracked-workflow steering into each detected host's own config, and on uninstall reverses those writes. All grounded reasoning continues to run through the insrc-mcp server the host assistant invokes (k1), so the plugin never opens a cloud path and gains capability parity for free. The design rests on three shared contracts: a plugin runtime + project-context surface (the active project's path is the explicit per-call repo scope, k3), a daemon gateway that fronts the backend (health probe + registration via the strict repo.add contract, k2), and an AI-host adapter that abstracts each host's config/rules file locations behind a marker-delimited, replace-only writer (k4).
**Rollout phase:** Phase D — Onboarding & clean removal
**Consumes:** `sc1` (PluginRuntime & ProjectContext), `sc2` (DaemonGateway), `sc3` (AiHostAdapter)

**Adjacent scope (owned by other stories — do NOT implement here):**
- `s1`: The Marketplace-published single-plugin packaging, the per-IDE activation manifest that brings the plugin up identically in IntelliJ IDEA, PyCharm, GoLand, and WebStorm, and the plugin-update delivery path are private to this Story. It exposes only the ProjectContext/lifecycle seam (sc1) and the DaemonGateway handle (sc2); how activation and packaging are realised is not consumed by any other Story. — owns `sc1`, `sc2`
- `s2`: How the insrc-mcp server registration is composed and written into each detected host, and how each capability call is configured to carry the active project's path as its explicit repo argument, are private to this Story. It publishes the AiHostAdapter (sc3) as the shared seam; the MCP-registration content and the per-call repo-scoping wiring behind it are internal. — owns `sc3`
- `s3`: The daemon staleness/consent policy (one-click consent on first provisioning, silent updates thereafter), the tiered Node runtime decision (use system Node when adequate, else provision a private runtime under the insrc home), and the delegation to the existing installer script are entirely private to this Story. It consumes the lifecycle seam (sc1) to run on project open and the gateway probe (sc2) to decide when to act, but owns no shared contract.
- `s4`: The tracked-workflow steering content/template (the guidance that makes the host assistant route build/change requests through the tracked stages) and the decision of which host rules file receives it are private to this Story. It writes through the adapter's marker-delimited replace-only primitive (sc3) so surrounding user content is preserved; the steering body itself is internal and consumed by no other Story.

## Contract details

**Surface level:** internal

### `OnboardingLifecycle.onProjectOpened`

```typescript
fun onProjectOpened(ctx: ProjectContext): Unit
```

**Parameters:**
- `ctx: ProjectContext` — The opened project's context (sc1). ctx.projectRootPath is the explicit repo scope (k3) passed to isProjectRegistered/registerProject.

**Returns:** `Unit` — Fire-and-return. Detection + gateway query run off the EDT; project opening is never blocked. Nothing is registered here — registration happens only in the offer's accept-callback.

**Errors:**
- `(none surfaced)` when A DaemonUnavailableException from isProjectRegistered is caught (runCatching) and logged — no offer is shown, re-checked on a later open; it never throws into the lifecycle broadcaster.

**Preconditions:**
- Registered as a PluginLifecycle consumer of sc1's LifecycleBroadcaster.

**Postconditions:**
- adapter.detectPresent() empty -> silent no-op (ac3), re-checked on the next open. Otherwise if !gateway.isProjectRegistered(ctx.projectRootPath) it surfaces the one-click 'Enable insrc for this project' offer; the project is NOT registered until the developer clicks (ac1/ac2).
- Owns no shared contract; never writes host files (S002/S004) and never removes (its own onPluginUninstalled does).

### `OnboardingLifecycle.onPluginUninstalled`

```typescript
fun onPluginUninstalled(): Unit
```

**Returns:** `Unit` — Fire-and-return. Reverses every insrc host-file write so removal leaves no trace (ac4/lc2).

**Errors:**
- `(none surfaced)` when Per-host removals are guarded (runCatching); a HostFileAccessException on one host is logged and does not block the other host or throw into the broadcaster.

**Preconditions:**
- Delivered only on a TRUE uninstall via sc1's InsrcPluginStateListener.uninstall -> firePluginUninstalled (a mere disable raises no such event), so a disable leaves the files in place (ac4).

**Postconditions:**
- For each host in adapter.detectPresent(): removeMcpRegistration(host) then removeRulesBlock(host), each per-host isolated — the insrc mcp entry and rules section are removed and surrounding user content restored (lc2/k4). No-op when detectPresent() is empty.

### `OnboardingOffer.offerEnable`

```typescript
fun offerEnable(projectRootPath: String, onAccept: () -> Unit): Unit
```

**Parameters:**
- `projectRootPath: String` — The project the 'Enable insrc for this project' offer is scoped to (shown to the developer; the accept-callback registers exactly this root).
- `onAccept: () -> Unit` — Invoked when the developer clicks Enable; the lifecycle passes a callback that calls gateway.registerProject(projectRootPath) off the EDT and reports the result.

**Returns:** `Unit` — Shows the passive one-click IDE notification (the S005-internal seam over the 'insrc' NotificationGroup + NotificationAction, mirroring DaemonLifecycleService's offer). Injected so the orchestration is unit-testable without an IDE.

**Preconditions:**
- Only called when a host is present and the project is not yet registered.

**Postconditions:**
- Registration runs only if/when the developer clicks (ac1) — the offer itself allocates nothing (k2/lc1).

### `DaemonGateway.isProjectRegistered`

```typescript
fun isProjectRegistered(projectRootPath: String): Boolean
```

**Parameters:**
- `projectRootPath: String` — The active project root (k3) whose registration state gates the offer.

**Returns:** `Boolean` — True if already a registered insrc repo. Read-only; never auto-allocates (k2). Consumed unchanged from sc2 (S001).

**Errors:**
- `DaemonUnavailableException` when sc2 surfaces this when the daemon socket cannot be reached; S005 catches it, logs, shows no offer, re-checks later.

**Postconditions:**
- Consumed unchanged from sc2; S005 never re-implements the registry query.

### `DaemonGateway.registerProject`

```typescript
fun registerProject(projectRootPath: String): RegistrationResult
```

**Parameters:**
- `projectRootPath: String` — The project root registered via the strict repo.add contract (k2/lc1) when the developer accepts the offer.

**Returns:** `RegistrationResult` — {registered: Boolean, reason: String?} — the outcome of the explicit repo.add. Consumed unchanged from sc2; S005 reports it via a notification and never re-implements repo.add.

**Errors:**
- `DaemonUnavailableException` when sc2 surfaces this when the daemon cannot be reached at accept time; S005 catches it in the accept-callback and reports 'could not reach the daemon', without crashing.

**Preconditions:**
- Invoked only from the offer's accept-callback (never silently, never on open).

**Postconditions:**
- Consumed unchanged from sc2 (strict, non-auto-allocating repo.add).

### `AiHostAdapter.detectPresent`

```typescript
fun detectPresent(): List<AiHost>
```

**Returns:** `List<AiHost>` — The installed+enabled AI hosts (sc3, from S002). Empty when neither is present — the ac3 no-op case for the offer and a no-op for cleanup.

**Postconditions:**
- Consumed unchanged from sc3; S005 never re-implements detection.

### `AiHostAdapter.removeMcpRegistration`

```typescript
fun removeMcpRegistration(host: AiHost): Unit
```

**Parameters:**
- `host: AiHost` — A host from detectPresent() whose JSON mcp config's insrc entry is removed on uninstall (ac4).

**Returns:** `Unit` — The insrc entry is removed from mcpServers and the file restored to its pre-insrc content; a no-op when absent. Consumed unchanged from sc3 (the inverse of S002's writeMcpRegistration).

**Errors:**
- `HostFileAccessException` when sc3 surfaces this when the mcp file cannot be read/written; S005 catches per host and logs, not swallowed globally, not thrown into the broadcaster.

**Preconditions:**
- host was returned by detectPresent().

**Postconditions:**
- Consumed unchanged from sc3; S005 never re-implements the JSON key-merge removal.

### `AiHostAdapter.removeRulesBlock`

```typescript
fun removeRulesBlock(host: AiHost): Unit
```

**Parameters:**
- `host: AiHost` — A host from detectPresent() whose Markdown rules file's insrc marker-delimited section is removed on uninstall (ac4).

**Returns:** `Unit` — The insrc RULES section is removed and surrounding developer content restored; a no-op when absent. Consumed unchanged from sc3 (the inverse of S004's writeRulesBlock).

**Errors:**
- `HostFileAccessException` when sc3 surfaces this when the rules file cannot be read/written; S005 catches per host and logs.

**Preconditions:**
- host was returned by detectPresent().

**Postconditions:**
- Consumed unchanged from sc3; S005 never re-implements the marker remover.

## Data model changes

### `OnboardingLifecycle` — new

S005-internal sc1 consumer (PluginLifecycle) in a new ai.insors.insrc.jetbrains.onboarding package, registered in InsrcAppLifecycle.appStarted alongside McpWiringLifecycle/DaemonLifecycleService/SteeringInjectionLifecycle. Constructor injects the sc2 DaemonGateway, the sc3 AiHostAdapter, the OnboardingOffer seam, a notify(message) sink, and an off-EDT executor — all defaulted by a production() factory to the real @Service gateway + AiHostAdapterImpl + IDE notifications (mirroring DaemonLifecycleService.production). onProjectOpened = the offer; onPluginUninstalled = the cleanup.

**Call sites:**
- `jetbrains-plugin/src/main/kotlin/ai/insors/insrc/jetbrains/platform/InsrcPluginStateListener.kt:47-51`
- `jetbrains-plugin/src/main/kotlin/ai/insors/insrc/jetbrains/lifecycle/DaemonLifecycleService.kt:131-147`

### `OnboardingOffer` — new

S005-INTERNAL fun-interface seam over the IDE one-click notification (the 'insrc' BALLOON NotificationGroup + a NotificationAction whose click runs onAccept), so the offer/accept flow is unit-testable with a fake. The production impl mirrors DaemonLifecycleService.showOfferSetupNotification (title 'insrc: enable for this project?', action 'Enable'). Not a new shared type; consumed by no other Story.

**Call sites:**
- `jetbrains-plugin/src/main/kotlin/ai/insors/insrc/jetbrains/lifecycle/DaemonLifecycleService.kt:149-168`
- `jetbrains-plugin/src/main/resources/META-INF/plugin.xml:34`

## Interaction with shared contracts

| Contract | Role | How |
| :--- | :--- | :--- |
| `sc1` | consumes | S005 registers OnboardingLifecycle as a PluginLifecycle consumer of sc1's LifecycleBroadcaster (InsrcAppLifecycle.appStarted). onProjectOpened (off-EDT) drives the offer; onPluginUninstalled (delivered only on a true uninstall via InsrcPluginStateListener.uninstall -> firePluginUninstalled, NOT on a mere disable) drives cleanup — this is precisely the ac4 uninstall-vs-disable distinction. S005 does not re-implement sc1 or the routing; it fills the onPluginUninstalled hook the sibling consumers deliberately left as a no-op. |
| `sc2` | consumes | S005 consumes the sc2 DaemonGateway (@Service DaemonGatewayService): isProjectRegistered(ctx.projectRootPath) gates whether to offer (read-only, never auto-allocates — ac2/k2), and registerProject(ctx.projectRootPath) runs ONLY in the offer's accept-callback via the strict repo.add contract (ac1/lc1/k2). A DaemonUnavailableException from either is caught and reported, never crashes. It never re-implements repo.add and never registers on open. |
| `sc3` | consumes | S005 consumes the sc3 AiHostAdapter: detectPresent() decides the ac3 no-op (empty -> no offer, re-check next open) and enumerates hosts for cleanup; removeMcpRegistration(host) + removeRulesBlock(host) (the inverses of S002's writeMcpRegistration and S004's writeRulesBlock) reverse both writes per host on uninstall, each per-host isolated (ac4/lc2/k4). It never re-implements detection, the JSON key-merge, or the marker remover, and never WRITES host files. NOTE: the HLD sc3 sketch shows generic removeBlock(host, file); the shipped surface S005 consumes is removeMcpRegistration(host)/removeRulesBlock(host) — same k4 semantics, reshaped by S002 at build time; no amendment needed since S005 only consumes it. |

## Error paths

### Error cases

- **The daemon socket is unreachable when checking registration state on project open.** (recoverable)
  - Detection: gateway.isProjectRegistered(ctx.projectRootPath) throws DaemonUnavailableException (sc2 surfaces it when the Unix socket can't be reached).
  - Response: onProjectOpened wraps the gateway query in runCatching, logs the DaemonUnavailableException, and shows NO offer this session; the lifecycle fires again on later opens so the offer re-appears once the daemon is reachable. It never throws into the LifecycleBroadcaster.
  - User impact: No 'Enable insrc' prompt appears while the daemon is down; nothing is registered and the developer's project is untouched. The offer returns on a later open when the daemon is back.
- **The daemon becomes unreachable at the moment the developer clicks 'Enable' (accept-callback).** (recoverable)
  - Detection: gateway.registerProject(projectRootPath) throws DaemonUnavailableException inside the accept-callback.
  - Response: The accept-callback wraps registerProject in runCatching, catches the DaemonUnavailableException, and surfaces a notification ('insrc could not reach the daemon to enable this project'); it does not crash the IDE action thread. Nothing is registered.
  - User impact: The developer is told enabling didn't complete because the daemon was unreachable, and can click Enable again later; no partial/ghost registration is created.
- **The backend rejects the registration (e.g. an unindexable or invalid path) even though the daemon is reachable.** (recoverable)
  - Detection: gateway.registerProject returns RegistrationResult(registered=false, reason=<backend reason>) (not an exception — a normal negative result).
  - Response: The accept-callback inspects result.registered; on false it surfaces the returned reason via a notification and registers nothing further. On true it confirms 'insrc enabled for this project'. Strict repo.add is respected either way (k2/lc1).
  - User impact: The developer sees exactly why registration didn't take (the backend's reason) instead of a silent failure; the registry is unchanged.
- **A detected host's file cannot be read/written during uninstall cleanup (permissions / read-only / missing parent).** (recoverable)
  - Detection: adapter.removeMcpRegistration(host) or removeRulesBlock(host) throws HostFileAccessException (sc3 surfaces it from the read-modify-write).
  - Response: onPluginUninstalled wraps each host's removals in per-host runCatching, logs which host+file failed, and continues to the next host — not swallowed globally, not thrown into the broadcaster. sc3 guarantees the failed file is left exactly as it was (no partial write).
  - User impact: One host's insrc additions may remain if its file is momentarily unwritable, but every other host is still cleaned; the failure is logged. (Uninstall cleanup is best-effort per host by design.)

### Edge cases

| Input | Expected |
| :--- | :--- |
| No AI host is present when a project opens (detectPresent() empty). | onProjectOpened shows no offer and does nothing visible (ac3); it re-checks on each later open because the lifecycle fires per open. |
| The project is already registered when it opens. | gateway.isProjectRegistered returns true -> no offer is shown (nothing to enable); nothing is re-registered (idempotent, ac2). |
| A host is present and the project is unregistered. | The one-click 'Enable insrc for this project' offer is shown; registerProject runs ONLY if the developer clicks (ac1/ac2/lc1). |
| The same unregistered project is re-opened (or opened in a second window) before the developer accepts. | The offer is shown again on each open (gated purely on isProjectRegistered==false); accepting once registers it and subsequent opens show no offer. |
| The plugin is DISABLED (not uninstalled). | No onPluginUninstalled event is delivered (sc1 routes only true uninstall), so the host files' insrc additions are LEFT IN PLACE (ac4). |
| The plugin is UNINSTALLED but no host is currently present (detectPresent() empty). | onPluginUninstalled iterates an empty host list -> no removals attempted (a clean no-op); nothing to restore. |
| The plugin is uninstalled and a host is present but never had insrc content written. | removeMcpRegistration/removeRulesBlock are each a no-op when the insrc entry/section is absent (sc3 guarantee); the host files are unchanged. |
| Both AI Assistant and Junie are present at uninstall. | Each host is cleaned independently: removeMcpRegistration(host)+removeRulesBlock(host) per host, per-host isolated so one host's failure doesn't block the other (ac4/lc2). |

### Invariants to preserve

- Project registration happens ONLY through the explicit sc2 registerProject (repo.add) contract, invoked solely from the developer's click on the offer — never on project open, never silently, never auto-allocated (k2/lc1). The read-only isProjectRegistered gate allocates nothing. [[c3]]
- Uninstall cleanup restores each host-owned file insrc wrote into back to its pre-insrc state via the sc3 remove ops (marker-delimited/JSON-key removal, surrounding user content preserved), and runs only on a true uninstall, not a disable (k4/lc2). S005 never re-implements the removers and never writes. [[c5]]

## Test strategy

**Test framework:** `JUnit (Kotlin) with the IntelliJ Platform Test Framework (BasePlatformTestCase / test fixtures) — the jetbrains-plugin module's established suite from S001/S002/S003/S004 (JUnit5 for platform-free unit tests, junit-vintage BasePlatformTestCase for fixture integration tests); distinct from the TS backend's node:test (k6).`

### Test levels

- **unit** — Verify the OnboardingLifecycle orchestration against injected fakes — no IDE fixture, no real host file, no real daemon.
  - Subjects: `onProjectOpened with a host present + isProjectRegistered==false -> OnboardingOffer.offerEnable is called once with ctx.projectRootPath and NOTHING is registered until the injected onAccept runs (ac1/ac2)`, `the offer's accept-callback calls gateway.registerProject(projectRootPath) exactly once and reports the RegistrationResult (registered / reason)`, `onProjectOpened with detectPresent() empty -> no offerEnable call, no gateway query beyond nothing visible (ac3 no-op)`, `onProjectOpened with isProjectRegistered==true -> no offerEnable call (already registered, ac2)`, `a DaemonUnavailableException from isProjectRegistered is caught -> no offer shown, no throw into the caller`, `a DaemonUnavailableException from registerProject in the accept-callback is caught -> a failure notification, no crash`, `registerProject returning RegistrationResult(false, reason) -> the reason is surfaced via notify and nothing further registered`, `onPluginUninstalled iterates detectPresent() and calls removeMcpRegistration(host)+removeRulesBlock(host) once per host (ac4), with 0 writeMcp/0 writeRules calls (S005 never writes)`, `onPluginUninstalled with empty detectPresent() -> no removal calls (clean no-op)`, `a HostFileAccessException from one host's removal is caught (per-host runCatching) and the other host is still fully cleaned`
  - Fixtures: `A fake DaemonGateway: stub isProjectRegistered (true/false/throws DaemonUnavailableException) + registerProject (RegistrationResult true/false, or throws) recording calls`, `A recording fake AiHostAdapter: stub detectPresent (present/absent/both) + recording removeMcpRegistration/removeRulesBlock (and write* to assert never called), optionally throwing HostFileAccessException for a chosen host`, `A fake OnboardingOffer capturing (projectRootPath, onAccept) so the test can drive the accept path deterministically`, `A recording notify sink + a synchronous executor`
- **integration** — Verify, inside the IntelliJ Platform fixture, that uninstall cleanup drives the REAL sc3 remove ops over on-disk host files and restores them to their pre-insrc content, and that onboarding is reached via the sc1 broadcaster.
  - Subjects: `onPluginUninstalled over a real AiHostAdapterImpl with a host whose mcp.json + rules.md carry insrc content restores BOTH files to their exact pre-insrc bytes (ac4/lc2) — the insrc mcpServers.insrc key and the RULES-delimited section are gone, surrounding developer content preserved`, `a host whose files have developer content but NO insrc section is left byte-unchanged by the removals (no-op removal)`, `OnboardingLifecycle is registered as a sc1 LifecycleBroadcaster consumer and its onProjectOpened work runs off the EDT`, `firePluginUninstalled (the true-uninstall path) reaches OnboardingLifecycle.onPluginUninstalled, whereas no such event is delivered on a mere disable (ac4 uninstall-vs-disable)`
  - Fixtures: `IntelliJ Platform test fixture (BasePlatformTestCase) with a temp project from S001's sc1`, `Temp files standing in for each host's mcp.json + rules.md, pre-seeded via the real S002 writeMcpRegistration + S004 writeRulesBlock (or equivalent fixtures) so removal has something to reverse and pre-insrc bytes are known`, `The real AiHostAdapterImpl (JsonMcpConfigWriter + MarkerFileWriter) to prove end-to-end restore`

### Acceptance mapping

| Criterion | Proving tests |
| :--- | :--- |
| `ac1` | `Unit: onProjectOpened (host present, unregistered) calls offerEnable once and registers nothing until the injected onAccept runs; the accept-callback then calls registerProject(projectRootPath)`, `Integration: OnboardingLifecycle is reached via the sc1 broadcaster on project open and shows the one-click offer` |
| `ac2` | `Unit: no registerProject is called during onProjectOpened (only isProjectRegistered is queried) — registration happens strictly in the accept-callback`, `Unit: isProjectRegistered==true -> no offer, no re-registration` |
| `ac3` | `Unit: onProjectOpened with detectPresent() empty -> no offer shown, nothing registered; a later open re-checks (lifecycle fires per open)` |
| `ac4` | `Unit: onPluginUninstalled calls removeMcpRegistration+removeRulesBlock once per detected host with 0 write calls; per-host HostFileAccessException isolation`, `Integration: onPluginUninstalled over the real AiHostAdapterImpl restores each host's mcp.json + rules.md to their pre-insrc bytes; a mere disable delivers no uninstall event so files are left in place` |

## Alternatives considered

### a1: One OnboardingLifecycle sc1 consumer handling BOTH hooks (offer + cleanup) — **CHOSEN**

A single new PluginLifecycle consumer (mirroring McpWiringLifecycle/SteeringInjectionLifecycle) whose onProjectOpened runs the one-click registration offer and whose onPluginUninstalled runs the per-host cleanup, over injected sc2 gateway + sc3 adapter + a notification/action seam.

S005 introduces OnboardingLifecycle : PluginLifecycle in a new ai.insors.insrc.jetbrains.onboarding package, registered once in InsrcAppLifecycle.appStarted alongside the three existing consumers. onProjectOpened(ctx): off-EDT, call adapter.detectPresent() — empty -> silent no-op (ac3, re-checked on each later open since the lifecycle fires per open); else if !gateway.isProjectRegistered(ctx.projectRootPath) surface a one-click 'Enable insrc for this project' notification (the injected offer seam, mirroring DaemonLifecycleService's NotificationAction pattern) whose accept-callback calls gateway.registerProject(ctx.projectRootPath) off-EDT and reports the RegistrationResult; nothing is registered until the developer clicks (ac1/ac2/lc1). onPluginUninstalled(): iterate adapter.detectPresent() and per host, with runCatching isolation, call removeMcpRegistration(host) then removeRulesBlock(host) (ac4/lc2). All collaborators (gateway, adapter, offer seam, notify, executor) injected so the orchestration is unit-testable; a production() factory wires the real @Service gateway + AiHostAdapterImpl + IDE notifications.

### a2: Two separate consumers split by responsibility (Registration vs UninstallCleanup)

A ProjectRegistrationLifecycle (onProjectOpened offer only) and a separate UninstallCleanupLifecycle (onPluginUninstalled only), each a PluginLifecycle consumer registered independently.

Same seams as a1 but split across two classes: ProjectRegistrationLifecycle implements onProjectOpened (detect+gate+offer+registerProject) with a no-op onPluginUninstalled; UninstallCleanupLifecycle implements onPluginUninstalled (per-host removeMcpRegistration+removeRulesBlock) with a no-op onProjectOpened. Both registered in InsrcAppLifecycle.appStarted; both take an injected adapter (and the registration one also the gateway + offer seam).

**Rejected because:** Functionally equivalent on ac1-ac4 and the contracts, but splits one small story into two consumers/factories/test files; the single-responsibility gain is cosmetic since PluginLifecycle forces a no-op second hook on each class. More surface, same behaviour.

### a3: Distribute uninstall cleanup into the existing writer consumers' onPluginUninstalled

Make McpWiringLifecycle.onPluginUninstalled remove the mcp registration and SteeringInjectionLifecycle.onPluginUninstalled remove the rules block (each undoes its own write), and add only a standalone registration-offer consumer for the onboarding half.

Instead of a dedicated cleanup consumer, fill the currently-no-op onPluginUninstalled hooks in S002's McpWiringLifecycle (detectPresent + removeMcpRegistration per host) and S004's SteeringInjectionLifecycle (detectPresent + removeRulesBlock per host), so each writer reverses its own write. S005 then adds only a registration-offer consumer for onProjectOpened.

**Rejected because:** Can technically satisfy ac1-ac4 but reaches them by editing S002's and S004's classes — the uninstall cleanup the HLD explicitly scopes to S005's boundary. That reopens shipped adjacent-boundary code and scatters removal across three stories; a boundary/design regression regardless of acceptance-criterion pass.

## Citations

- **[[c1]]** `analyze-bundle` `symbol.locate: real sc2 DaemonGateway surface (DaemonGateway.kt) — isProjectRegistered/registerProject/RegistrationResult/DaemonUnavailableException; @Service DaemonGatewayService accessor`
- **[[c2]]** `analyze-bundle` `symbol.locate: real sc3 removal surface (AiHostAdapter.kt:82,101,117) — detectPresent/removeMcpRegistration/removeRulesBlock, inverses of S002/S004 writes`
- **[[c3]]** `doc` `CLAUDE.md k2 — strict non-auto-allocating repo registry: membership only via the explicit repo.add contract (UnregisteredRepoError); never silently allocate`
- **[[c4]]** `analyze-bundle` `usage.example: sc1 uninstall-vs-disable routing (InsrcPluginStateListener.uninstall -> firePluginUninstalled; PluginLifecycle.kt:64-70) + consumer registration in InsrcAppLifecycle.appStarted; sibling onPluginUninstalled no-ops S005 fills`
- **[[c5]]** `code` `jetbrains-plugin/.../host/AiHostAdapterImpl.kt + MarkerFileWriter/JsonMcpConfigWriter remove ops — k4 marker-delimited/JSON-key replace-only removal restores pre-insrc content`
- **[[c6]]** `analyze-bundle` `usage.example: one-click IDE-notification offer pattern (DaemonLifecycleService.kt:149-168 NotificationGroup 'insrc' + NotificationAction; plugin.xml:34) S005 mirrors for 'Enable insrc for this project'`
- **[[c7]]** `convention` `jetbrains-plugin test suite: JUnit (Kotlin) + IntelliJ Platform Test Framework (JUnit5 unit + junit-vintage BasePlatformTestCase), established S001-S004 — distinct from TS backend node:test`
- **[[c8]]** `doc` `CLAUDE.md k1 — no direct cloud REST from our process; S005 only queries the local daemon socket + edits local host files, opens no cloud path`

<!-- insrc:review -->

## Review

### ✅ Review `PASS` — design.story (design.story)

**0 HIGH · 0 MED · 0 LOW** · model `client` · reviewed 2026-09-17T16:37:03.394Z

_No load-bearing premises were extracted._
