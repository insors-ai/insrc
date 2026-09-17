<!-- insrc:artifact DEF-61d8c73edb68041a -->

# Epic: insrc's two core capabilities — grounded, citation-backed answers about a codebase, and the tracked, gated feature-build workflow that turns a request into designed, reviewed, approved work — are reachable today only from the terminal, the interactive CLI, and a single editor integration.

**Flavor:** new-capability

## Problem

insrc's two core capabilities — grounded, citation-backed answers about a codebase, and the tracked, gated feature-build workflow that turns a request into designed, reviewed, approved work — are reachable today only from the terminal, the interactive CLI, and a single editor integration. Developers whose daily environment is the JetBrains IDE family — writing Java, Python, Go, or JavaScript in IntelliJ IDEA, PyCharm, GoLand, or WebStorm — have no way to reach either capability from inside the tools they actually work in. To ask insrc a grounded question about the code in front of them, or to route a change through the tracked workflow, they must leave the IDE and drive insrc from an external surface, breaking their flow and, in practice, meaning the capability goes unused by that whole population. This is most costly precisely where insrc is strongest: the languages these IDEs specialize in are the same ones the system already indexes, so the grounded context and the workflow discipline already exist and are accurate, yet remain out of reach for the developers best positioned to benefit. There is likewise no in-IDE moment that connects an open project to insrc's grounded index, nor one that carries insrc's tracked-workflow discipline into the agentic assistants these IDEs now ship, so even a developer who already runs insrc receives none of it where they write code.

## Non-goals

- **Native in-IDE panes that render insrc's analyze/workflow/docgen surfaces directly from the daemon (the deferred Phase 2).** — The epic ships value first by surfacing insrc through the IDE's own agentic assistants; building a parallel native UI up front would multiply scope and delay any shippable outcome. Phase 2 is scoped separately once the integration altitude is proven.
- **Deep IDE-native code intelligence (language-server hooks, native refactorings, code inspections, gutter annotations).** — The value is bringing insrc's existing grounded-context and tracked-workflow capabilities into the IDE, not authoring new IDE-native analysis; those features would be a different, much larger product surface with no dependency on insrc's differentiators.
- **Extending language coverage beyond Java, Python, Go, and JavaScript/TypeScript (e.g. Scala).** — Scope is bounded to the languages the indexer already covers well and that the four target IDEs specialize in; adding languages is an indexer concern, orthogonal to this integration.
- **Re-implementing daemon installation, lifecycle, or the steering-write logic in the plugin's own language.** — Those mechanisms already exist and are maintained on the backend side; duplicating them risks divergence and double-maintenance. The epic reuses them rather than reproducing them.
- **Any direct cloud LLM/REST access initiated from the IDE integration.** — It would violate the project's standing principle that all cloud access flows through the user's claude/codex CLI OAuth sessions; the integration must not introduce a new cloud path.
- **Housing the integration in a separate sibling repository.** — The converged spec deliberately scaffolds the integration in this repository for one-place cohesion; a sibling repo was explicitly ruled out during brainstorming.

## Assumptions

- `high` The system already indexes Java, Python, Go, and JavaScript/TypeScript, so grounded context for the four target IDEs' languages is available without new indexer work. [[c1]]
- `high` A reusable server component already exposes insrc's Analyze and Workflow capabilities as tools that resolve their target repository from an environment default or an explicit per-call repository argument. [[c2]]
- `high` A project's grounded context is unavailable until that project is registered with the system; registration is the sole gate and nothing auto-allocates it. [[c3]]
- `high` Repository context can be scoped per call by supplying the active project's path explicitly, so multiple projects open at once each resolve to their own registered repository. [[c4]]
- `high` A reusable mechanism already writes insrc's guidance as a marker-delimited, replace-only block into a target configuration file without disturbing surrounding user content. [[c5]]
- `high` An existing installer script provisions and updates the backend daemon and requires a sufficiently recent Node.js runtime to do so. [[c6]]
- `med` The JetBrains IDE family ships two distinct agentic assistant surfaces, each with its own configuration for registering external tool servers and its own guidance/rules file, and either, both, or neither may be present in a given install. [[c8]]

## Constraints

| ID | Type | Text | Source |
| :--- | :--- | :--- | :--- |
| `k1` | invariant | All cloud LLM access must continue to flow through the user's claude/codex CLI OAuth sessions; the integration must introduce no direct cloud REST path. | [[c7]] |
| `k2` | contract | The repository registry is strict and non-auto-allocating: a project becomes usable only through the explicit registration contract, and the integration must never silently allocate registry membership. | [[c3]] |
| `k3` | invariant | Repository context must be scoped to the active project on every capability call, because separate IDE windows each carry their own project and a single shared default cannot disambiguate them. | [[c4]] |
| `k4` | invariant | Any write into a host-owned configuration or guidance file must be marker-delimited and replace-only, preserving all surrounding user-authored content and reversible on removal. | [[c5]] |
| `k5` | contract | Daemon installation, update, and lifecycle must reuse the existing installer rather than reproducing its logic, and must respect its runtime prerequisites. | [[c6]] |
| `k6` | convention | The integration is a new codebase distinct from the existing TypeScript backend and must not entangle the two build systems or their toolchains. | [[c1]] |

## Stories

### E2026091761d8c73e:S001 — Install insrc into a JetBrains IDE and have it activate across the four target IDEs

**User value:** `size: M`

A developer working in IntelliJ IDEA, PyCharm, GoLand, or WebStorm can obtain insrc through the IDE's normal plugin channel and have it come up ready, without hand-assembling anything.

**Acceptance criteria:**

- **ac1:** Given a supported JetBrains IDE with insrc not yet installed, when the developer installs insrc through the IDE's standard plugin marketplace and restarts the IDE, then insrc activates and is available in that IDE. _(operationalizes `k6`)_
- **ac2:** Given insrc is already installed and a newer version has been published, when the developer checks for or receives plugin updates through the IDE's normal update mechanism, then the new version is delivered without a manual re-download or reinstall. _(operationalizes `k6`)_
- **ac3:** Given any of the four target IDEs — IntelliJ IDEA, PyCharm, GoLand, or WebStorm, when insrc is installed in that IDE, then it activates there without IDE-specific manual configuration. _(operationalizes `k6`)_

**Local constraints:**

- `lc1` (convention) A single integration must install and activate across all four target IDEs rather than requiring a separate build per IDE. [[c1]]

### E2026091761d8c73e:S002 — Reach insrc's grounded answers and tracked workflow from inside the IDE's AI assistant

**User value:** `size: L`

A developer can ask insrc grounded questions about — and route changes through the tracked workflow for — the project in front of them, using the agentic assistant already built into their IDE, with no manual tool-server setup.

**Depends on:** `s1`

**Extends:** [[c2]]

**Acceptance criteria:**

- **ac1:** Given a supported IDE whose agentic assistant is installed and enabled, when the developer opens a project, then insrc's grounded-analyze and tracked-workflow capabilities become available as tools inside that assistant without the developer configuring anything by hand. _(operationalizes `k3`)_
- **ac2:** Given several projects are open at once in separate IDE windows, when the developer invokes an insrc capability from one window, then the request resolves against that window's own project and never against another open project. _(operationalizes `k3`)_
- **ac3:** Given both of the IDE's agentic assistant surfaces are installed and enabled, when the developer opens a project, then insrc is made available inside each of them. _(operationalizes `k3`)_
- **ac4:** Given the assistant has insrc available and reaches a capability that needs cloud reasoning, when that capability runs on the developer's behalf, then it uses the developer's existing command-line sign-in and introduces no new direct cloud path. _(operationalizes `k1`)_

**Local constraints:**

- `lc1` (invariant) The active project's identity must accompany every capability invocation so a shared default can never mis-scope a call. [[c4]]

### E2026091761d8c73e:S003 — Have insrc's backing service set up and kept current without leaving the IDE

**User value:** `size: L`

A developer gets a working insrc without a separate terminal install: if the backing service is missing or out of date the IDE offers a one-click setup the first time and keeps it current afterward, even on machines that lack the runtime it needs.

**Depends on:** `s1`

**Acceptance criteria:**

- **ac1:** Given a developer opens a project and insrc's backing service is absent or out of date, when the project finishes opening, then the IDE detects this and offers a single one-click action to set it up or bring it current. _(operationalizes `k5`)_
- **ac2:** Given the developer accepted the one-click setup once already, when the backing service later falls out of date, then it is brought current automatically without prompting the developer again. _(operationalizes `k5`)_
- **ac3:** Given the machine lacks a suitable runtime for the backing service, when setup runs, then insrc provides the runtime the service needs and setup completes rather than failing. _(operationalizes `k5`)_
- **ac4:** Given a suitable runtime is already present on the machine, when setup runs, then the existing runtime is used instead of provisioning another. _(operationalizes `k5`)_

**Local constraints:**

- `lc1` (contract) Setup and update must reuse the existing backend installer and honour its runtime prerequisites rather than reproducing its logic. [[c6]]

### E2026091761d8c73e:S004 — Have the IDE's AI assistant follow insrc's tracked-workflow discipline

**User value:** `size: M`

When a developer asks the assistant to build or change something, it drives the request through insrc's tracked stages — sizing, design, review-before-approve, present-and-ask, build — rather than merely having loose access to the tools.

**Depends on:** `s2`

**Acceptance criteria:**

- **ac1:** Given insrc has been made available inside a detected assistant for a project, when insrc activates for that project, then the assistant is given insrc's tracked-workflow guidance so it routes build and change requests through the tracked stages. _(operationalizes `k4`)_
- **ac2:** Given the assistant's own guidance file already contains the developer's custom content, when insrc writes its guidance into that file, then only insrc's own delimited section is added or replaced and all surrounding developer content is preserved. _(operationalizes `k4`)_
- **ac3:** Given both assistant surfaces are present, when insrc activates for a project, then each surface receives the guidance in its own native location and format. _(operationalizes `k4`)_

**Local constraints:**

- `lc1` (invariant) Guidance writes into a host-owned file must be marker-delimited and replace-only, never overwriting the whole file. [[c5]]

### E2026091761d8c73e:S005 — Connect a project to insrc by explicit choice, stay silent when there is nothing to do, and remove cleanly

**User value:** `size: M`

A developer's open project is connected to insrc's grounded index only by an explicit one-click choice; when no assistant is present the plugin stays quiet; and removing insrc leaves no trace in the developer's own configuration.

**Depends on:** `s2`, `s4`

**Acceptance criteria:**

- **ac1:** Given a project that is not yet registered with insrc is opened, when the project finishes opening, then the developer is offered a one-click action to enable insrc for that project, and nothing is registered until the developer chooses it. _(operationalizes `k2`)_
- **ac2:** Given the developer has not enabled insrc for a project, when that project is open, then insrc neither registers nor indexes it on the developer's behalf. _(operationalizes `k2`)_
- **ac3:** Given no agentic assistant is installed or enabled in the IDE, when a project is opened, then insrc takes no visible action and simply re-checks on later project opens. _(operationalizes `k2`)_
- **ac4:** Given insrc previously wrote configuration or guidance into an assistant's files, when the developer uninstalls insrc, then insrc's delimited additions are removed and the files are restored to their prior content, whereas a mere disable leaves them in place. _(operationalizes `k4`)_

**Local constraints:**

- `lc1` (contract) Project registration happens only through the explicit registration contract and is never auto-allocated on the developer's behalf. [[c3]]
- `lc2` (invariant) Removal must restore any host-owned files insrc wrote into back to their pre-insrc state. [[c5]]

## Citations

- **[[c1]]** `analyze-bundle` `capability-discovery: JetBrains/IDE-plugin subsystem + reuse surfaces` — "0 clear-match / 1 partial-match (src/mcp) / 4 unrelated; no plugin code found; every Kotlin/Gradle hit is the indexer's JVM-manifest parser on other projects. Greenfield new-capability; the plugin is "
- **[[c2]]** `code` `src/mcp/server.ts (buildInsrcMcpServer), src/bin/insrc-mcp.ts` — "Assembles the server registered as insrc-mcp exposing Analyze + Workflow tools."
- **[[c3]]** `doc` `CLAUDE.md:140` — "Repo registry is the contract — established exclusively via the repo.add IPC; the storage layer never auto-allocates registry rows; an Entity whose repo path isn't registered fails the upsert with Unr"
- **[[c4]]** `code` `src/mcp/resolve-repo.ts (ResolveRepoDeps); README.md:204` — "INSRC_REPO is optional — callers may pass repo on each tool call instead."
- **[[c5]]** `doc` `docs/standalone/daemon-update-automatically-refresh-insrc-steering-E20260801ea1b1162/S001/LLD.md` — "refreshSteering — replace-only, marker-delimited steering block written into a target config, leaving surrounding content untouched."
- **[[c6]]** `code` `scripts/insrc-daemon-install.sh:150-158` — "Requires Node.js >= NODE_MIN_MAJOR: dies 'node not found ... install Node.js first' when absent and 'node too old' when below the minimum; also requires npm."
- **[[c7]]** `doc` `CLAUDE.md (Project principles)` — "No direct cloud REST calls from our process. Cloud LLM access happens through the locally-installed claude and codex CLI binaries. Auth + quota stay with the user's CLI OAuth sessions."
- **[[c8]]** `prior-artifact` `SPEC-607ec3f1d0604b86` — "JetBrains ships two distinct agentic surfaces (AI Assistant and Junie) with different MCP/config formats; Phase 1 wires whichever is installed/enabled, requiring neither specifically."

<!-- insrc:review -->

## Review

### ✅ Review `PASS` — define (define)

**0 HIGH · 0 MED · 0 LOW** · model `client` · reviewed 2026-09-17T10:48:41.394Z

_No load-bearing premises were extracted._
