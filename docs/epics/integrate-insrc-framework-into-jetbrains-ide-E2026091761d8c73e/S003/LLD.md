<!-- insrc:artifact LLD-61d8c73edb68041a-s3 -->

# LLD: E2026091761d8c73e:S003

**Epic:** `integrate-insrc-framework-into-jetbrains-ide`
**HLD base run:** `wf-1789642152969-snttef`
**HLD effective hash:** `7ebd2fd85012...`

## HLD context

**Framework:** A single new IntelliJ-Platform plugin (one codebase, all four target IDEs) that owns NO reasoning: it is a thin orchestrator that binds the IDE's lifecycle moments to already-built insrc backend surfaces. On project open it detects any present AI host, ensures the backend daemon is present/current, offers explicit project registration, wires the insrc-mcp server plus the tracked-workflow steering into each detected host's own config, and on uninstall reverses those writes. All grounded reasoning continues to run through the insrc-mcp server the host assistant invokes (k1), so the plugin never opens a cloud path and gains capability parity for free. The design rests on three shared contracts: a plugin runtime + project-context surface (the active project's path is the explicit per-call repo scope, k3), a daemon gateway that fronts the backend (health probe + registration via the strict repo.add contract, k2), and an AI-host adapter that abstracts each host's config/rules file locations behind a marker-delimited, replace-only writer (k4).
**Rollout phase:** Phase B — Capability wiring & daemon lifecycle
**Consumes:** `sc1` (PluginRuntime & ProjectContext), `sc2` (DaemonGateway)

**Adjacent scope (owned by other stories — do NOT implement here):**
- `s1`: The Marketplace-published single-plugin packaging, the per-IDE activation manifest that brings the plugin up identically in IntelliJ IDEA, PyCharm, GoLand, and WebStorm, and the plugin-update delivery path are private to this Story. It exposes only the ProjectContext/lifecycle seam (sc1) and the DaemonGateway handle (sc2); how activation and packaging are realised is not consumed by any other Story. — owns `sc1`, `sc2`
- `s2`: How the insrc-mcp server registration is composed and written into each detected host, and how each capability call is configured to carry the active project's path as its explicit repo argument, are private to this Story. It publishes the AiHostAdapter (sc3) as the shared seam; the MCP-registration content and the per-call repo-scoping wiring behind it are internal. — owns `sc3`
- `s4`: The tracked-workflow steering content/template (the guidance that makes the host assistant route build/change requests through the tracked stages) and the decision of which host rules file receives it are private to this Story. It writes through the adapter's marker-delimited replace-only primitive (sc3) so surrounding user content is preserved; the steering body itself is internal and consumed by no other Story.
- `s5`: The one-click 'Enable insrc for this project' onboarding UX, the silent no-op-and-re-check behaviour when no AI host is present, and the uninstall-cleanup orchestration are private to this Story. It composes existing seams — registration via the gateway (sc2), host-write removal via the adapter (sc3), lifecycle triggers via sc1 — without introducing a new shared contract.

## Contract details

**Surface level:** internal

### `DaemonLifecycleService.onProjectOpened`

```typescript
fun onProjectOpened(ctx: ProjectContext): Unit
```

**Parameters:**
- `ctx: ProjectContext` — The opened project's context (sc1). S003 uses it only as the off-EDT trigger to run the daemon-lifecycle policy; the daemon/consent are application-scoped, not per-project.

**Returns:** `Unit` — Fire-and-return. The policy is evaluated and any setup/update runs off-EDT; project opening is never blocked.

**Errors:**
- `(none surfaced)` when All work is guarded/logged; a probe or provisioning failure surfaces as an IDE notification, never a thrown exception into the lifecycle broadcaster (which isolates consumers anyway).

**Preconditions:**
- Registered as a PluginLifecycle consumer of sc1's LifecycleBroadcaster.

**Postconditions:**
- Consumes sc2.probe() and the persisted consent to pick exactly one DaemonSetupAction (NoOp / OfferSetup / RunSilently) and executes it off the EDT.
- Owns no shared contract; does not touch sc3 host wiring or re-implement sc1/sc2.

### `DaemonSetupPolicy.decide`

```typescript
fun decide(state: DaemonState, consented: Boolean): DaemonSetupAction
```

**Parameters:**
- `state: DaemonState` — The sc2 probe result: ABSENT | STALE | CURRENT.
- `consented: Boolean` — Whether the developer has already accepted insrc managing its backing service (ac2 gate).

**Returns:** `DaemonSetupAction` — CURRENT -> NoOp; ABSENT -> Install; STALE -> Update; and for Install/Update the action carries whether to prompt (OfferSetup when !consented, ac1) or run silently (RunSilently when consented, ac2).

**Postconditions:**
- Pure total function of (state, consented) — no IO — so the ac1/ac2/CURRENT-no-op policy is exhaustively unit-testable.
- CURRENT always maps to NoOp regardless of consent.

### `NodeRuntimeResolver.resolve`

```typescript
fun resolve(): NodeRuntime
```

**Returns:** `NodeRuntime` — An interpreter whose major version >= NODE_MIN_MAJOR: the system Node when it is adequate (source=SYSTEM, ac4), otherwise a private Node provisioned/reused under ~/.insrc/node (source=PROVISIONED, ac3).

**Errors:**
- `NodeProvisioningException` when No adequate system Node AND a private Node cannot be provisioned (download/verify/arch/offline failure); surfaced so the caller notifies rather than handing the installer a bad runtime.

**Postconditions:**
- Reads the system `node -v`; if its major >= NODE_MIN_MAJOR returns it unchanged (ac4 — no provisioning).
- Otherwise ensures a private Node under ~/.insrc/node (reusing an already-provisioned one) and returns it (ac3).
- The returned executable satisfies the installer's own prerequisite (>= NODE_MIN_MAJOR), so the installer never hits its node-missing/too-old die path (lc1).

### `DaemonProvisioner.run`

```typescript
fun run(kind: ProvisionKind, node: NodeRuntime): ProvisionOutcome
```

**Parameters:**
- `kind: ProvisionKind` — INSTALL (ABSENT -> insrc-daemon-install.sh) or UPDATE (STALE -> daemon-ctl.sh update).
- `node: NodeRuntime` — The resolved Node to put on PATH for the delegated subprocess.

**Returns:** `ProvisionOutcome` — Whether the delegated installer/daemon-ctl subprocess succeeded, carrying its exit code and (on failure) a reason mapped from the installer's documented codes (2 prereq / 3 source / 4 git-npm-build).

**Errors:**
- `(captured, not thrown)` when A non-zero installer exit is returned as ProvisionOutcome(ok=false, exitCode, reason); process-spawn failure is also captured into the outcome so the caller can notify.

**Preconditions:**
- node.executablePath is a Node >= NODE_MIN_MAJOR (from NodeRuntimeResolver).

**Postconditions:**
- Delegates to the EXISTING tooling unchanged (lc1, k5): INSTALL -> scripts/insrc-daemon-install.sh, UPDATE -> daemon-ctl.sh update, with the resolved Node on PATH; never reproduces clone/build logic.
- Runs off the EDT; the outcome is surfaced as an IDE notification.

### `SetupConsentStore.isConsented`

```typescript
fun isConsented(): Boolean
```

**Returns:** `Boolean` — Whether the developer has already accepted insrc managing its backing service (application-scoped, persisted across IDE restarts).

**Postconditions:**
- Read-only; app-scoped (not per-project).

### `SetupConsentStore.recordConsent`

```typescript
fun recordConsent(): Unit
```

**Returns:** `Unit` — Persist that consent has been given, so subsequent staleness is brought current silently (ac2).

**Postconditions:**
- After this, decide(STALE|ABSENT, consented=true) yields RunSilently, so no further prompt (ac2).

## Data model changes

### `DaemonSetupAction` — new

Closed union of the policy outcome: NoOp | OfferSetup(kind: ProvisionKind) | RunSilently(kind: ProvisionKind). OfferSetup surfaces the single one-click IDE action (ac1); RunSilently runs without prompting (ac2); NoOp when the daemon is CURRENT.

### `ProvisionKind` — new

Closed union INSTALL | UPDATE selecting the delegation target: INSTALL -> scripts/insrc-daemon-install.sh (ABSENT), UPDATE -> daemon-ctl.sh update (STALE).

**Call sites:**
- `scripts/insrc-daemon-install.sh`
- `scripts/insrc-daemon-install.sh:455`

### `NodeRuntime` — new

{ executablePath: String, source: NodeSource } where NodeSource = SYSTEM | PROVISIONED. The Node>=NODE_MIN_MAJOR interpreter the installer runs under; source records whether the system Node was reused (ac4) or a private one was provisioned under ~/.insrc/node (ac3).

**Call sites:**
- `scripts/insrc-daemon-install.sh:53`
- `scripts/insrc-daemon-install.sh:149-158`

### `SetupConsent` — new

An application-scoped persisted flag (IntelliJ PersistentStateComponent / @Service(APP), the S001 DaemonGatewayService pattern) recording that the developer approved insrc managing its backing service. Gates ac1 (prompt once) vs ac2 (silent thereafter).

**Call sites:**
- `jetbrains-plugin/src/main/kotlin/ai/insors/insrc/jetbrains/daemon/DaemonGatewayService.kt`

### `ProvisionOutcome` — new

{ ok: Boolean, exitCode: Int?, reason: String? } capturing the delegated subprocess result. reason maps the installer's documented exit codes (2 prereq missing, 3 daemon source missing, 4 git/npm/build failed) to a user-facing message; ok=true when the daemon is now present/current.

**Call sites:**
- `scripts/insrc-daemon-install.sh:149-158`
- `scripts/insrc-daemon-install.sh:191-211`

## Interaction with shared contracts

| Contract | Role | How |
| :--- | :--- | :--- |
| `sc1` | consumes | S003 registers a DaemonLifecycleService as a PluginLifecycle consumer of sc1's LifecycleBroadcaster; onProjectOpened (delivered off the EDT by the S001 project-open ProjectActivity) is the trigger that evaluates the daemon-lifecycle policy. S003 does not re-implement sc1 or the lifecycle; the daemon/consent are application-scoped, so the ProjectContext is used only as the run trigger. |
| `sc2` | consumes | S003 consumes sc2 DaemonGateway.probe() to obtain DaemonState (ABSENT\|STALE\|CURRENT) and feeds it (with the persisted consent) into DaemonSetupPolicy.decide. It never re-implements the probe and never calls registerProject (registration is S005). CURRENT -> NoOp, ABSENT -> install, STALE -> update. |

## Error paths

### Error cases

- **The machine has no adequate system Node AND provisioning a private Node fails (download/checksum/arch-mismatch/offline).** (recoverable)
  - Detection: NodeRuntimeResolver.resolve exhausts the system-Node path (major < NODE_MIN_MAJOR or absent) then the private-Node provisioning step fails its download/verify, throwing NodeProvisioningException before any installer is invoked.
  - Response: Abort setup for this attempt and surface an IDE notification explaining the runtime could not be provisioned (with the underlying cause); DO NOT invoke the installer with a missing/bad Node (which would just hit its own die path). Leave the daemon absent; a later project-open re-evaluates and re-offers.
  - User impact: The developer is told setup couldn't get the runtime and why (e.g. offline); nothing is half-installed, and re-opening after fixing connectivity retries.
- **The delegated installer / daemon-ctl subprocess exits non-zero (installer codes: 2 prereq missing, 3 daemon source missing, 4 git/npm/build failed).** (recoverable)
  - Detection: DaemonProvisioner.run observes the child process exit code; any non-zero is captured into ProvisionOutcome(ok=false, exitCode, reason) with reason mapped from the installer's documented codes.
  - Response: Report the failure via an IDE notification with the mapped reason; do not retry blindly and do not reproduce the installer's steps. The daemon stays absent/stale, so the next project-open re-probes and re-offers (or re-runs silently if consented).
  - User impact: The developer sees a specific setup-failed message (e.g. 'git/npm/build failed') rather than a silent no-op, and can act or retry.
- **The installer script or daemon-ctl.sh cannot be located on disk to delegate to.** (recoverable)
  - Detection: DaemonProvisioner resolves the script path before spawning and finds it missing (e.g. the plugin's bundled/looked-up script path does not exist).
  - Response: Surface a notification that setup tooling is unavailable and skip; never fall back to reproducing the installer's clone/build logic in the plugin (lc1/k5). Captured as ProvisionOutcome(ok=false).
  - User impact: The developer is told setup could not run; no partial or divergent install is attempted.
- **A silent (consented) update fails while running without a prompt (ac2 path).** (recoverable)
  - Detection: For a RunSilently action, DaemonProvisioner.run returns ok=false (non-zero exit or spawn failure) even though no dialog was shown.
  - Response: Surface a NON-modal informational notification of the failed background update (so a silent path never leaves the developer unknowingly broken), and leave the daemon stale; the next open re-checks. Do not escalate to a modal prompt (consent was already given).
  - User impact: The developer is passively informed the background update failed and insrc is running on the prior version, rather than a silent breakage.
- **Two project windows open near-simultaneously and both trigger provisioning/update of the single app-scoped daemon.** (recoverable)
  - Detection: The app-scoped DaemonLifecycleService sees concurrent onProjectOpened deliveries; a single-flight guard detects an in-progress provisioning run.
  - Response: Serialize: the second trigger observes the in-flight run and no-ops (or awaits its result) rather than launching a second concurrent installer against the same ~/.insrc/daemon; consent is recorded once.
  - User impact: One setup runs; opening several projects at once does not double-install or corrupt the install.

### Edge cases

| Input | Expected |
| :--- | :--- |
| System Node major is exactly NODE_MIN_MAJOR (the boundary). | Treated as adequate (>= NODE_MIN_MAJOR) -> system Node used, no provisioning (ac4). |
| `node` is on PATH but `node -v` output is unparseable / not a recognizable version. | Fail-safe: treat as NOT adequate and provision a private Node (ac3), rather than hand the installer a runtime we cannot verify. |
| Daemon probes CURRENT on project open. | decide -> NoOp: no prompt, no subprocess, no work (the common fast path). |
| Consent already given and the daemon is ABSENT (e.g. ~/.insrc/daemon was deleted). | decide(ABSENT, consented=true) -> RunSilently(INSTALL): reinstall silently without re-prompting (ac2 applies to install as well as update). |
| A private Node was already provisioned by an earlier setup. | NodeRuntimeResolver reuses the existing ~/.insrc/node (no re-download); provisioning is idempotent. |
| The developer declines the one-click OfferSetup. | No install runs and consent is NOT recorded; the offer reappears on a later project-open while the daemon remains absent/stale (never auto-runs without consent). |

### Invariants to preserve

- Setup and update delegate to the existing tooling unchanged — insrc-daemon-install.sh for install, daemon-ctl.sh update for update — and honour its runtime prerequisite (Node >= NODE_MIN_MAJOR); S003 never reproduces the installer's clone/npm/build logic. [[c6]]
- No new cloud path: S003 fetches only a Node runtime binary and drives the git-based installer; it opens no direct cloud LLM/REST endpoint, so all reasoning stays on the host assistant's CLI-OAuth sessions (k1). [[c7]]

## Test strategy

**Test framework:** `JUnit (Kotlin) with the IntelliJ Platform Test Framework (BasePlatformTestCase / test fixtures) — the jetbrains-plugin module's established suite from S001/S002; distinct from the TS backend's node:test (k6).`

### Test levels

- **unit** — Verify the pure policy + tiered-runtime + delegation logic against injected fakes — no IDE fixture, no real subprocess, no real download.
  - Subjects: `DaemonSetupPolicy.decide: exhaustive (DaemonState x consented) truth table — CURRENT->NoOp (either consent); ABSENT/!consented->OfferSetup(INSTALL); ABSENT/consented->RunSilently(INSTALL); STALE/!consented->OfferSetup(UPDATE); STALE/consented->RunSilently(UPDATE)`, `NodeRuntimeResolver: system Node major >= NODE_MIN_MAJOR -> source=SYSTEM, no provisioning (ac4); system Node absent or too old (or unparseable `node -v`) -> provision private Node under ~/.insrc/node, source=PROVISIONED (ac3); an already-provisioned private Node is reused (idempotent, no re-download); provisioning failure -> NodeProvisioningException`, `boundary: system Node major == NODE_MIN_MAJOR is treated as adequate (ac4)`, `DaemonProvisioner.run: maps installer exit codes to ProvisionOutcome (0->ok; 2 prereq / 3 source / 4 build -> ok=false with mapped reason) and selects the right target (INSTALL->install script, UPDATE->daemon-ctl update) via an injected subprocess runner — no real process`, `SetupConsentStore: isConsented reflects recordConsent; after recordConsent, decide yields RunSilently (ac2)`, `single-flight guard: a second concurrent trigger does not launch a second installer while one is in flight`
  - Fixtures: `Fake system-Node probe (returns a chosen `node -v` string or absent)`, `Fake private-Node provisioner (success / failure, records whether it was invoked)`, `Fake subprocess runner returning a chosen exit code, capturing the argv + PATH it was given`, `In-memory SetupConsent store`
- **integration** — Verify the sc1-triggered service wiring inside the IntelliJ Platform fixture: on project open the policy runs off-EDT and drives the injected collaborators, and consent persists.
  - Subjects: `On project open with the daemon ABSENT and no prior consent, the service surfaces the one-click OfferSetup and does NOT auto-run (ac1)`, `After consent is recorded, a later open with the daemon STALE runs the update via the provisioner WITHOUT a prompt (ac2)`, `On project open with the daemon CURRENT, the service does nothing (no prompt, no provisioner call)`, `The DaemonLifecycleService is registered as a sc1 LifecycleBroadcaster consumer and its work runs off the EDT`
  - Fixtures: `IntelliJ Platform test fixture with a temp project (basePath) from S001's sc1`, `Injected fake DaemonGateway (sc2) returning a chosen DaemonState`, `Injected fake NodeRuntimeResolver + DaemonProvisioner to assert what the service invoked without real install`, `The @Service(APP) consent store to assert persistence across the prompt->silent transition`

### Acceptance mapping

| Criterion | Proving tests |
| :--- | :--- |
| `ac1` | `Integration: project open with ABSENT/STALE + no consent surfaces exactly one one-click OfferSetup action and does not auto-run`, `Unit: decide(ABSENT|STALE, consented=false) -> OfferSetup(kind)` |
| `ac2` | `Integration: after recordConsent, a later open with STALE runs the update via the provisioner with no prompt`, `Unit: decide(STALE|ABSENT, consented=true) -> RunSilently(kind)` |
| `ac3` | `Unit: NodeRuntimeResolver with system Node absent/too old provisions a private Node under ~/.insrc/node (source=PROVISIONED) so resolve() returns a usable runtime and setup can proceed` |
| `ac4` | `Unit: NodeRuntimeResolver with an adequate system Node returns source=SYSTEM and never invokes the private-Node provisioner (asserted via the fake provisioner not being called)` |

## Alternatives considered

### a1: Tiered NodeRuntimeResolver + policy service delegating to the unchanged installer / daemon-ctl — **CHOSEN**

A plugin-side lifecycle policy service maps the sc2 probe (+ persisted consent) to an install/update/no-op action, and a NodeRuntimeResolver ensures a Node>=NODE_MIN_MAJOR (use system Node if adequate, else provision a private Node under ~/.insrc/) before delegating to insrc-daemon-install.sh / daemon-ctl.sh update unchanged.

Internal (S003-owned, no shared contract) types: DaemonSetupDecision (from sc2 DaemonState x SetupConsent -> one of NoOp / OfferSetup / RunSilently), NodeRuntime (an absolute path to a node>=NODE_MIN_MAJOR interpreter, tagged system|provisioned), and SetupConsent (an app-scoped persisted flag). A DaemonLifecycleService consumes sc1 onProjectOpened (off-EDT) and sc2 probe(): CURRENT -> NoOp; ABSENT/STALE with consent not yet given -> surface a single one-click IDE notification (OfferSetup, ac1); ABSENT/STALE with consent already given -> run automatically (RunSilently, ac2). The action first resolves the NodeRuntime via a NodeRuntimeResolver: read the system `node -v`; if its major >= NODE_MIN_MAJOR use it (ac4); otherwise provision a private Node under ~/.insrc/node and use that (ac3). It then invokes the EXISTING tooling as a subprocess with that Node on PATH -- insrc-daemon-install.sh for ABSENT, daemon-ctl.sh update for STALE -- honouring the installer's own prerequisites and exit codes (lc1), never reproducing its clone/build logic. Consent is captured on the first accepted OfferSetup and persisted app-level so later staleness is silent.

### a2: System-Node-only: require an adequate system Node, guide the user to install one if absent

Skip runtime provisioning entirely: if the system Node is >= NODE_MIN_MAJOR run the installer, otherwise surface a notification telling the developer to install Node and stop.

Same DaemonLifecycleService + consent gate, but the NodeRuntime step is detection-only: read the system `node -v`; if adequate, delegate to the installer/daemon-ctl; if absent or too old, surface a 'please install Node >= NODE_MIN_MAJOR' notification and abort setup. No private Node is ever provisioned; S003 leans entirely on the installer's own prerequisite check.

**Rejected because:** Simplest and honours lc1/sc1/sc2, but VIOLATES ac3: on a machine without a suitable runtime it aborts with guidance rather than completing setup — failing the Story's central promise that setup works even when the runtime is missing.

### a3: Always provision a private Node under ~/.insrc/ (ignore system Node)

Deterministic runtime: always provision and use a private Node under ~/.insrc/node for the installer, regardless of any system Node.

Same policy service + consent gate, but the NodeRuntime is ALWAYS a private Node provisioned under ~/.insrc/node -- system Node is never consulted. Setup provisions (or reuses an already-provisioned) private Node and runs the installer/daemon-ctl with it, giving a single known-good runtime version everywhere.

**Rejected because:** Deterministic and satisfies ac3, but VIOLATES ac4: it ignores an already-suitable system Node and provisions another runtime anyway, imposing needless download/disk on the majority of users who already meet the prerequisite.

## Citations

- **[[c1]]** `code` `scripts/insrc-daemon-install.sh:53,149-158,191-211` — "NODE_MIN_MAJOR=20; the installer dies (exit 2) if node is not found or too old (it does NOT provision Node), then clones ~/.insrc/daemon + npm install + npm run build. S003 must ensure Node>=NODE_MIN_"
- **[[c2]]** `code` `scripts/insrc-daemon-install.sh:374,455` — "daemon-ctl.sh (CTL) start ...; `$CTL update` = 'sync origin, install if lock changed, build' — S003's STALE->bring-current path delegates here rather than re-cloning."
- **[[c3]]** `doc` `CLAUDE.md:140 (repo registry strict contract; sc2 fronts it)` — "Repo registry is the contract — the sc2 DaemonGateway probe/registration S003 consumes; S003 uses probe() only, never registerProject (k2)."
- **[[c4]]** `code` `jetbrains-plugin/src/main/kotlin/ai/insors/insrc/jetbrains/ProjectContext.kt + platform/InsrcProjectOpenActivity.kt` — "sc1 ProjectContext + onProjectOpened (off-EDT ProjectActivity) — the lifecycle trigger S003 consumes; it re-implements neither."
- **[[c5]]** `code` `jetbrains-plugin/src/main/kotlin/ai/insors/insrc/jetbrains/daemon/DaemonGatewayService.kt` — "The @Service(APP) pattern S001 uses — the natural home for the app-scoped SetupConsent PersistentStateComponent gating ac1 (prompt once) vs ac2 (silent)."
- **[[c6]]** `doc` `Story lc1 / Epic k5 (reuse the existing installer; honour its runtime prerequisites)` — "Setup and update must reuse the existing backend installer and honour its runtime prerequisites rather than reproducing its logic — S003 delegates to insrc-daemon-install.sh / daemon-ctl.sh update unc"
- **[[c7]]** `doc` `CLAUDE.md (Project principles: No direct cloud REST) / Epic k1` — "No direct cloud REST from our process — S003 fetches only a Node runtime and drives the git installer, opening no cloud LLM/REST path; reasoning stays on the host's CLI-OAuth sessions."

<!-- insrc:review -->

## Review

### ✅ Review `PASS` — design.story (design.story)

**0 HIGH · 0 MED · 0 LOW** · model `client` · reviewed 2026-09-17T14:22:24.109Z

_No load-bearing premises were extracted._
