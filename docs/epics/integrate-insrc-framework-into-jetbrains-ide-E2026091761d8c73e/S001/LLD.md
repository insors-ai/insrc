<!-- insrc:artifact LLD-61d8c73edb68041a-s1 -->

# LLD: E2026091761d8c73e:S001

**Epic:** `integrate-insrc-framework-into-jetbrains-ide`
**HLD base run:** `wf-1789642152969-snttef`
**HLD effective hash:** `7ebd2fd85012...`

## HLD context

**Framework:** A single new IntelliJ-Platform plugin (one codebase, all four target IDEs) that owns NO reasoning: it is a thin orchestrator that binds the IDE's lifecycle moments to already-built insrc backend surfaces. On project open it detects any present AI host, ensures the backend daemon is present/current, offers explicit project registration, wires the insrc-mcp server plus the tracked-workflow steering into each detected host's own config, and on uninstall reverses those writes. All grounded reasoning continues to run through the insrc-mcp server the host assistant invokes (k1), so the plugin never opens a cloud path and gains capability parity for free. The design rests on three shared contracts: a plugin runtime + project-context surface (the active project's path is the explicit per-call repo scope, k3), a daemon gateway that fronts the backend (health probe + registration via the strict repo.add contract, k2), and an AI-host adapter that abstracts each host's config/rules file locations behind a marker-delimited, replace-only writer (k4).
**Rollout phase:** Phase A — Foundation & backend seams
**Owns:** `sc1` (PluginRuntime & ProjectContext), `sc2` (DaemonGateway)

**Adjacent scope (owned by other stories — do NOT implement here):**
- `s2`: How the insrc-mcp server registration is composed and written into each detected host, and how each capability call is configured to carry the active project's path as its explicit repo argument, are private to this Story. It publishes the AiHostAdapter (sc3) as the shared seam; the MCP-registration content and the per-call repo-scoping wiring behind it are internal. — owns `sc3`
- `s3`: The daemon staleness/consent policy (one-click consent on first provisioning, silent updates thereafter), the tiered Node runtime decision (use system Node when adequate, else provision a private runtime under the insrc home), and the delegation to the existing installer script are entirely private to this Story. It consumes the lifecycle seam (sc1) to run on project open and the gateway probe (sc2) to decide when to act, but owns no shared contract.
- `s4`: The tracked-workflow steering content/template (the guidance that makes the host assistant route build/change requests through the tracked stages) and the decision of which host rules file receives it are private to this Story. It writes through the adapter's marker-delimited replace-only primitive (sc3) so surrounding user content is preserved; the steering body itself is internal and consumed by no other Story.
- `s5`: The one-click 'Enable insrc for this project' onboarding UX, the silent no-op-and-re-check behaviour when no AI host is present, and the uninstall-cleanup orchestration are private to this Story. It composes existing seams — registration via the gateway (sc2), host-write removal via the adapter (sc3), lifecycle triggers via sc1 — without introducing a new shared contract.

## Contract details

**Surface level:** internal-shared

### `PluginLifecycle.onProjectOpened`

```typescript
fun onProjectOpened(ctx: ProjectContext): Unit
```

**Parameters:**
- `ctx: ProjectContext` — The just-opened project's context (absolute root path + resolved IdeKind) that downstream stories key their per-project work on.

**Returns:** `Unit` — Fire-and-return; the hook only broadcasts the lifecycle event to registered downstream consumers off the UI thread.

**Errors:**
- `(none surfaced)` when The hook never throws to the platform; any downstream consumer failure is isolated and logged so opening a project is never blocked.

**Preconditions:**
- ctx.projectRootPath is the absolute root of a project the platform has finished opening.

**Postconditions:**
- Fires exactly once per opened project window.
- Does not itself register, index, or wire anything — it only delivers the event (registration is S005, wiring is S002, daemon policy is S003).

### `PluginLifecycle.onPluginUninstalled`

```typescript
fun onPluginUninstalled(): Unit
```

**Returns:** `Unit` — Fire-and-return; signals a true uninstall so consumers can reverse their host-file writes.

**Errors:**
- `(none surfaced)` when Never throws to the platform.

**Preconditions:**
- The plugin is being uninstalled, not merely disabled.

**Postconditions:**
- Fires only on uninstall, never on a mere disable (the distinction is the contract's whole point).

### `DaemonGateway.probe`

```typescript
fun probe(): DaemonState
```

**Returns:** `DaemonState` — Raw backend presence: 'absent' (no daemon reachable), 'stale' (reachable but behind), or 'current'. The POLICY that acts on 'stale' belongs to S003, not here.

**Errors:**
- `(none surfaced)` when An unreachable/unconnectable daemon socket is reported as 'absent' rather than thrown, so the probe is always answerable.

**Postconditions:**
- Read-only: never mutates daemon or registry state.
- Bounded, lightweight local check over the Unix socket — not a full capability call.

### `DaemonGateway.isProjectRegistered`

```typescript
fun isProjectRegistered(projectRootPath: String): Boolean
```

**Parameters:**
- `projectRootPath: String` — Absolute active-project root to query registry membership for (the explicit repo scope, k3).

**Returns:** `Boolean` — true iff the given project is already a registered insrc repo.

**Errors:**
- `DaemonUnavailable` when The daemon is not reachable to answer the query (surfaced to the caller, not swallowed).

**Preconditions:**
- projectRootPath is an absolute path.

**Postconditions:**
- Read-only: never auto-allocates registry membership (k2).

### `DaemonGateway.registerProject`

```typescript
fun registerProject(projectRootPath: String): RegistrationResult
```

**Parameters:**
- `projectRootPath: String` — Absolute active-project root to register via the strict repo.add contract.

**Returns:** `RegistrationResult` — { registered: Boolean, reason?: String } — whether the project is now registered, with a reason when not.

**Errors:**
- `DaemonUnavailable` when The daemon is not reachable to perform repo.add (surfaced, not swallowed).

**Preconditions:**
- Called only in response to an explicit developer action upstream (S005's one-click enable) — the gateway itself performs no unsolicited registration.
- projectRootPath is an absolute path.

**Postconditions:**
- Routes exactly the repo.add IPC for that one project; never auto-allocates any other repo (k2).
- Idempotent: registering an already-registered project succeeds without duplicate allocation.

## Data model changes

### `IdeKind` — new

A closed union of the four supported product identities: 'idea' | 'pycharm' | 'goland' | 'webstorm'. Resolved once at project-open from the running IDE's product identity; the product-to-IdeKind mapping is private to S001.

### `ProjectContext` — new

{ projectRootPath: String (absolute active-project root, the explicit repo argument for k3), ide: IdeKind }. Constructed by the project-open listener and handed to consumers; immutable.

### `DaemonState` — new

A closed union 'absent' | 'stale' | 'current' returned by probe(). S001 emits it as raw state; interpreting 'stale' into an install decision is S003's internal policy.

### `RegistrationResult` — new

{ registered: Boolean, reason?: String }. Returned by registerProject(); reason is populated only when registration did not occur.

## Interaction with shared contracts

| Contract | Role | How |
| :--- | :--- | :--- |
| `sc1` | implements | S001 owns and implements sc1: the plugin scaffold activates once across all four IDEs (single artifact against the shared platform), a project-open listener constructs ProjectContext (root + product-derived IdeKind) and fires onProjectOpened, and a plugin teardown hook fires onPluginUninstalled only on true uninstall. Downstream stories (s2/s3/s4/s5) consume these as plain interfaces via platform service lookup; the product mapping and packaging stay internal to S001. |
| `sc2` | implements | S001 owns and implements sc2 as a single application-scoped service holding one client connection to the daemon's Unix socket (~/.insrc/daemon.sock). probe() reads raw daemon presence; isProjectRegistered()/registerProject() front the strict repo.add registry (never auto-allocating, k2). Every method takes projectRootPath explicitly so one shared service scopes per active project (k3). The socket wire format is private to S001; S003 (lifecycle policy) and S005 (registration UX) only consume these methods. |

## Error paths

### Error cases

- **The backend daemon socket is unreachable while isProjectRegistered() or registerProject() is called (no socket file, connection refused, or the daemon is down).** (recoverable)
  - Detection: The gateway's socket connect / JSON-RPC request over ~/.insrc/daemon.sock fails or times out at the transport layer.
  - Response: Surface a DaemonUnavailable error to the caller rather than swallowing it or fabricating a registered/unregistered answer; the gateway performs no retry policy of its own (that judgement belongs to the S003 lifecycle consumer).
  - User impact: The consuming story (S003 setup / S005 onboarding) learns the daemon is down and can offer install/setup; the developer sees a clear notification instead of a silently wrong registration result.
- **The repo.add registration is rejected by the backend registry (e.g. the path is not a valid indexable repo).** (recoverable)
  - Detection: The repo.add IPC returns an error/negative result rather than a success acknowledgement.
  - Response: registerProject() returns RegistrationResult{ registered: false, reason: <backend reason> } with no partial or fallback allocation; probe/registry state is left exactly as it was.
  - User impact: The developer is told the project was not enabled and why, and can act on the reason; nothing is half-registered.
- **probe() cannot classify daemon freshness because the daemon answers but the version/staleness signal is unavailable.** (recoverable)
  - Detection: The daemon connects and responds, but the field the probe reads to distinguish 'stale' from 'current' is missing or unparseable.
  - Response: Return the conservative reachable state 'current' only when freshness is affirmatively known; otherwise report the weaker known state ('absent' if unreachable) rather than guessing 'current' — S001 never invents a freshness verdict, leaving any stale-handling policy to S003.
  - User impact: None directly; the S003 consumer decides what to do, and a conservative reading avoids skipping a needed update.

### Edge cases

| Input | Expected |
| :--- | :--- |
| A project window opens with no resolvable absolute root (a light/default or rootless project). | onProjectOpened is not fired with a bogus root; ProjectContext requires an absolute projectRootPath, so a rootless window is skipped (no registration/probe attempted) and logged. |
| Several project windows are open at once, each a different project. | Each window fires its own onProjectOpened with its own ProjectContext; the single application-scoped DaemonGateway serves each call using the explicit projectRootPath, so no window's request is scoped to another's project (k3). |
| The plugin is disabled (not uninstalled). | onPluginUninstalled does NOT fire; the lifecycle distinguishes disable from uninstall, so downstream cleanup (S005) is not triggered and injected state is left intact. |
| registerProject() is called for a project that is already a registered insrc repo. | Idempotent success — RegistrationResult{ registered: true }, with no duplicate registry allocation. |
| probe() runs when no daemon has ever been installed (no socket file present). | Returns 'absent' (the missing socket is a definite not-present reading), never an exception. |

### Invariants to preserve

- The repository registry stays strict and non-auto-allocating: S001's gateway registers a repo ONLY via an explicit registerProject() call driven by a developer action, and read paths (probe/isProjectRegistered) never allocate. [[c3]]
- No cloud path is introduced by S001: the gateway opens only the local daemon Unix socket and never any cloud/REST connection. [[c7]]

## Test strategy

**Test framework:** `JUnit (Kotlin) with the IntelliJ Platform Test Framework (BasePlatformTestCase / test fixtures) — the standard for IntelliJ-Platform plugins; this is a new Kotlin module, distinct from the TS backend's node:test suites (k6).`

### Test levels

- **unit** — Verify sc2 DaemonGateway logic against a fake in-test daemon socket and sc1 ProjectContext/IdeKind resolution, with no real daemon or IDE.
  - Subjects: `DaemonGateway.probe (maps reachable/unreachable/unknown-freshness to current/absent, never throws for absent)`, `DaemonGateway.isProjectRegistered (read-only, surfaces DaemonUnavailable, never allocates)`, `DaemonGateway.registerProject (routes repo.add, idempotent, returns RegistrationResult with reason on rejection, never auto-allocates others)`, `ProjectContext construction + the product-identity-to-IdeKind mapping for all four IDEs`, `PluginLifecycle: onPluginUninstalled fires only on uninstall, not disable`
  - Fixtures: `A fake daemon socket server that can be present/absent/stale and can accept or reject repo.add`, `A stub product-identity source for each of the four IDEs (idea/pycharm/goland/webstorm)`
- **integration** — Verify the plugin actually activates and fires its lifecycle events inside the IntelliJ Platform test fixture.
  - Subjects: `Plugin activation on project open (onProjectOpened fires once per opened project with the project's absolute basePath as projectRootPath)`, `Rootless/light project window is skipped without firing a bogus ProjectContext`, `Multiple open projects each resolve their own ProjectContext, and the shared gateway scopes each call by its explicit projectRootPath (k3)`
  - Fixtures: `IntelliJ Platform test fixture (BasePlatformTestCase / lightweight project fixture) with a temp project root`, `The fake daemon socket from the unit level, injected into the application-scoped gateway service`
- **contract** — Verify the single plugin artifact is built once and declares compatibility with the shared platform so it loads in all four IDEs, and carries the version metadata the IDE update mechanism needs.
  - Subjects: `The plugin descriptor depends only on the common platform module (not an IDE-specific module), so one artifact is compatible with IDEA/PyCharm/GoLand/WebStorm`, `The Gradle build emits exactly one versioned plugin artifact (no per-IDE variant) with valid since-build/until-build + version metadata`
  - Fixtures: `The built plugin descriptor + distribution artifact from the Gradle build`

### Acceptance mapping

| Criterion | Proving tests |
| :--- | :--- |
| `ac1` | `Integration: installing/loading the plugin in the platform test fixture activates it and fires onProjectOpened for an opened project (proves it comes up ready with no hand-assembly)` |
| `ac2` | `Contract: the Gradle build emits a single versioned plugin artifact with valid since-build/until-build + an incremented version, the metadata the IDE's normal update mechanism consumes to deliver a new version without manual reinstall` |
| `ac3` | `Contract: the plugin descriptor declares only the common platform-module dependency (no IDE-specific module), proving one artifact activates across IDEA/PyCharm/GoLand/WebStorm with no IDE-specific manual configuration (lc1)`, `Unit: the product-identity-to-IdeKind mapping resolves each of the four product identities to its IdeKind, proving per-IDE activation is handled by one codebase` |

## Alternatives considered

### a1: Single unified plugin; DaemonGateway as an application-level service, ProjectContext derived per open project — **CHOSEN**

One plugin module compatible with the shared IntelliJ Platform; sc1 via platform lifecycle listeners, sc2 as a single application-scoped daemon-client service with repo passed per call.

The plugin is one build artifact declaring compatibility with the common IntelliJ-Platform module, so the same binary loads and activates in IntelliJ IDEA, PyCharm, GoLand, and WebStorm (lc1, k6). sc1 is realised through the platform's own lifecycle surface: a project-open listener constructs a ProjectContext (root + product-derived IdeKind) and a plugin-level teardown hook distinguishes uninstall from a mere disable. sc2 is a single application-scoped service holding one client connection to the daemon's Unix socket; because the registry and MCP tools already scope by an explicit repo argument (k3), the gateway takes projectRootPath per call rather than holding project state, so one shared service safely serves every open window. Downstream stories consume sc1/sc2 as plain interfaces via platform service lookup; the socket wire format and product-to-IdeKind mapping stay private to S001.

### a2: Single unified plugin; DaemonGateway as a project-level service bound to its project

Same single-artifact plugin, but sc2 is instantiated once per open project and captures that project's root at construction.

Identical packaging and sc1 realisation to a1, but sc2 is a project-scoped service: each open project window gets its own DaemonGateway instance that captures its projectRootPath at construction, so callers need not pass the root on every call. This trades one shared connection for one gateway per window and makes k3's per-project scoping a property of object lifetime, but multiplies live socket clients with the number of open windows and complicates single-point daemon-connection management.

**Rejected because:** Ties a1 on the acceptance criteria and sc1 but is only partial on sc2: binding a gateway per project makes the HLD interface's explicit projectRootPath argument redundant and multiplies socket connections — a needless divergence from the owned contract's shape.

### a3: Core module plus per-IDE distribution modules

Shared sc1/sc2 in a core module, with a separate thin build/artifact per target IDE.

sc1 and sc2 live in a shared core module, and each of the four IDEs gets its own thin wrapper module and build artifact that depends on core and declares that IDE's specific compatibility. This maximises per-IDE control but directly cuts against lc1's 'single integration rather than a separate build per IDE': it produces four build/publish pipelines and four Marketplace listings to keep in lock-step, for a plugin whose behaviour is identical across the four.

**Rejected because:** Preserves the contracts but violates lc1 (partial on ac3) with four artifacts/builds/listings and is partial on ac2 (four update pipelines in lock-step) for identical behaviour — more surface, no gain.

## Citations

- **[[c1]]** `analyze-bundle` `capability-discovery: greenfield + reuse surfaces (S001 s1)` — "No JetBrains/IntelliJ/Kotlin/Gradle plugin code exists; sc1/sc2 are net-new Kotlin. Backend seams located: daemon Unix socket ~/.insrc/daemon.sock, repo.add/UnregisteredRepoError, $INSRC_REPO/repo-arg"
- **[[c2]]** `code` `src/mcp/server.ts (buildInsrcMcpServer), src/bin/insrc-mcp.ts` — "The insrc-mcp tool server the assistant invokes; S001 does not touch it, only stands up the scaffold that later stories wire it from."
- **[[c3]]** `doc` `CLAUDE.md:140` — "Repo registry is the contract via repo.add; the storage layer never auto-allocates; unregistered repo fails the upsert with UnregisteredRepoError — the strict registry sc2 fronts (k2)."
- **[[c4]]** `code` `src/mcp/resolve-repo.ts (ResolveRepoDeps); README.md:204` — "INSRC_REPO default with explicit per-call repo override — the per-project scoping ProjectContext.projectRootPath feeds (k3)."
- **[[c7]]** `doc` `CLAUDE.md (Project principles)` — "No direct cloud REST from our process; cloud LLM access goes through the claude/codex CLI OAuth sessions (k1) — S001 opens only the local daemon socket."

<!-- insrc:review -->

## Review

### ✅ Review `PASS` — design.story (design.story)

**0 HIGH · 0 MED · 0 LOW** · model `client` · reviewed 2026-09-17T11:08:35.798Z

_No load-bearing premises were extracted._
