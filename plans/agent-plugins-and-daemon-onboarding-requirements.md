# Agent Plugins and Daemon Onboarding Requirements

Status: Draft requirements  
Date: 29 October 2026

## Purpose

Release insrc integrations for Claude Code and Codex that package workflow skills and MCP connectivity, detect whether the insrc daemon is installed, and guide users through installation and readiness checks when needed. Developers should be able to adopt insrc from their existing agent conversation without first installing an IDE plugin or learning the insrc TUI.

The plugins are thin host adapters around one shared backend. The daemon remains authoritative for repository registration, storage, indexing, workflow state, independent review routing, and approval gates. Plugin installation, daemon installation, and repository readiness are separate observable states.

This document defines proposed behavior. It does not install software, approve a release, or authorize a tracked implementation.

## Existing foundation and related work

- [MCP registration](../src/daemon/mcp-register.ts): existing client registration behavior that must coexist with plugin-managed connections.
- [Daemon lifecycle](../src/daemon/lifecycle.ts): existing backend startup/lifecycle surface to evaluate for reuse.
- [Setup services](../src/cli/services/setup.ts): existing setup functionality to evaluate before creating a parallel installer.
- [Package manifest](../package.json): current runtime, binaries, and native dependencies; currently marks the backend package private, so public package-manager installation must not be assumed available.
- [Canonical steering](../src/prompts/steering-block.md): authoritative workflow guidance and review/approval discipline.
- [Host-independent presentation request](host-independent-document-presentation-change-request.md): document access and approval presentation for CLI users.
- [Coding and review instruction request](coding-and-code-review-instructions-change-request.md) and [context-sensitive review PRD](context-sensitive-review-prd.md): review-quality requirements relevant to the initial public experience.

Current IDE clients are vscode-plugin/ and jetbrains-plugin/ in this repository. The deprecated insrc-ide fork has no implementation, compatibility, or release-gate responsibility.

## Product boundaries

| Component | Responsibility |
|---|---|
| Shared insrc backend | Daemon, MCP implementation, storage, indexing, workflow execution, deterministic checks, and approval enforcement. |
| Shared installer and launcher | Versioned installation, platform/runtime checks, safe activation, daemon discovery/startup, and machine-readable diagnostics. |
| Claude Code adapter | Host manifest/MCP configuration, discoverable skills or commands, setup entry point, and host-specific presentation guidance. |
| Codex adapter | Host manifest/MCP configuration, discoverable skills, onboarding entry point, and host-specific presentation guidance. |
| IDE clients | Rich document, diff, diagram, and workflow views over the same backend. |

“One installation” means one active backend/store owner per OS user and execution host, with versioned inactive installations allowed for upgrade/rollback. Two agent clients, two projects, or two IDEs must not each start a separate owner of the same live databases. A remote machine/container is a separate execution host, not automatically the developer laptop's daemon.

## Scope

Initial scope includes local execution environments, a shared installer contract, both plugin packages, onboarding/diagnostics, safe daemon reuse/startup, repository setup, compatibility checks, recovery, and release validation. Preserve plain MCP installation for other clients and users who do not want plugins.

Do not promise that a plugin works in a cloud-only agent environment with no access to the local daemon/filesystem. Remote tunnel services, hosted insrc, new cloud authentication, new IDE features, unattended fleet deployment, and replacing platform permission controls are outside initial scope.

## User experience

### First use

1. User installs the appropriate insrc agent plugin and invokes its setup entry point.
2. Setup performs read-only discovery of backend installation, compatibility, running daemon health, host capabilities, and prerequisites.
3. Setup presents a concrete plan: required installation/version/location, missing runtime prerequisites, expected downloads, service registration if offered, and repository/model work as separate choices.
4. Within the user's authorized setup scope and host permissions, run the shared installer. If a necessary permission is denied, explain the remaining blocker and preserve completed work.
5. Start or connect to the compatible daemon and verify IPC/MCP health.
6. Check Ollama and configured model availability. Offer any required installation/model downloads with resource information where available.
7. Offer to register and index the intended repository. Registration must use repo.add IPC. Report progress and final index readiness.
8. Report verified capabilities, outstanding setup, and the next useful action. Never label a partially configured system fully ready.

### Existing installation

Reuse a healthy compatible daemon regardless of which client installed it. Starting a stopped compatible installation is distinct from installing or upgrading it. An incompatible installation produces a compatibility explanation and explicit upgrade/alternative plan; it must not be silently replaced because a plugin was updated.

### Headless and restricted environments

All essential setup and status information must be available in text and machine-readable results. No mandatory GUI, browser login, or insrc TUI. Explain remote path ownership and where installation occurs. If shell/network execution is unavailable, provide a precise supported manual path and report incomplete setup rather than pretending the plugin installed the backend.

## Functional requirements

### Plugin packages and workflow guidance

**R1 — Two adapters with shared content.** Publish Claude Code and Codex packages using their supported manifests and distribution routes. Share canonical workflow content, installer/launcher logic, and compatibility metadata rather than maintaining independent copies of the backend. Host-specific manifests and invocation guidance may differ.

**R2 — Discoverable entry points.** Provide recognizable setup, diagnose, analyze, develop/bugfix, review, and resume capabilities. Names are design decisions, not promises of currently implemented commands. Feature and defect requests must route through insrc_triage and the routed workflow. Review skills preserve assigned reviewer routing, round limits, and explicit approval.

**R3 — Thin skills.** Skills explain intent routing, host presentation, and setup behavior. Fetch detailed workflow procedures with insrc_guide and uncertain tool shapes with insrc_schema. Preserve opaque continuation state. Do not embed a second independently maintained workflow engine or a stale copy of every canonical procedure.

**R4 — Avoid global instruction pollution.** Plugin setup must not overwrite AGENTS.md/CLAUDE.md or erase unrelated instructions. Existing injected steering must coexist without contradictory duplicate procedures. Define how plugin-managed users retain any necessary minimal repository steering and how legacy injected content is identified and updated only within owned boundaries.

**R5 — Test host capabilities.** Validate the MCP transport, tool naming, skill invocation, reload/restart requirements, permissions, and onboarding behavior on each supported client/version. Do not assume identical behavior from shared skill syntax. Document any required restart and verify connectivity afterwards.

### Shared installer and first-run bootstrapping

**R6 — Explicit setup route.** Plugin installation exposes a setup skill/command; it is not proof of daemon installation. Setup can invoke a bundled installer/approved release bootstrap through available shell execution. Do not depend on an install-time lifecycle hook as the only path, and do not install/upgrade software merely because an MCP server was discovered.

**R7 — Bootstrap without a running daemon.** Setup and diagnostics must work before insrc MCP is healthy. A small packaged launcher/setup script must discover or install the backend without requiring an insrc tool call first. Host MCP startup should fail promptly with an actionable setup message when dependencies are absent, rather than repeatedly downloading software or waiting indefinitely for indexing.

**R8 — Single installer contract.** Reuse or consolidate existing installation mechanisms across supported clients. The installer accepts explicit action/version/location parameters and produces structured progress/results usable by both plugins and IDE clients. Define proposed install, inspect, repair, upgrade, and start actions during design; avoid inventing user-facing legacy subcommands that the current TUI does not implement.

**R9 — Stable installation location.** Keep active backend binaries, user configuration/data, and install metadata outside disposable plugin caches. Updating, disabling, or removing one plugin must not delete the shared daemon or its data. Resolve the installation through metadata or a stable launcher, not a checkout-specific absolute path copied from the developer's machine.

**R10 — Versioned and verifiable releases.** Choose and document the supported release mechanism: verified platform packages, reproducible version-pinned source builds, or a defined combination. Public npm availability cannot be assumed from the current private package. Pin the requested release and verify downloaded contents against trusted release metadata. Never execute a moving unverified download as an opaque bootstrap. Preserve provenance and installer/backend version records.

**R11 — Runtime and native prerequisites.** Establish a tested OS/architecture/Node compatibility matrix using actual native dependencies and release artifacts. Respect the supported Node runtime and native ABI; do not use an arbitrary Node on PATH without checking it. Detect missing native libraries/build tools and explain remediation. Do not install a system package manager, change system Node, require administrator access, or modify shell profiles without the applicable setup authorization. The initial supported platform list must be stated before release rather than inferred from TypeScript portability.

**R12 — Reentrant installation.** Repeating setup after success must be a no-op except explicit health checks. Concurrent setup attempts must coordinate with an installation lock; interrupted downloads/builds must not be mistaken for complete releases. Stage and verify a candidate before activation, preserve the last working installation, and clean up only installer-owned temporary files.

**R13 — Setup consent and permissions.** Explain concrete changes before dependent installation steps. Distinguish installing the backend, installing prerequisite software, downloading models, registering a persistent background service, upgrading/migrating existing data, and registering/indexing a repository. Respect authorization already given in the session; do not add repetitive confirmations. Never bypass the host's approval controls or infer approval from silence. A lightweight status/start operation must not conceal an upgrade or new persistent service.

### Daemon lifecycle and client coexistence

**R14 — Reuse before launch.** Discover the daemon through the authoritative local IPC/lifecycle mechanism. Verify identity and compatibility, not just socket/process existence. Reuse a healthy daemon. If startup is needed, serialize competing launch attempts and verify readiness before declaring success. Handle stale sockets/process metadata without killing unrelated processes or removing another live owner's socket.

**R15 — One storage owner.** Agent plugins and launchers never open LMDB/Lance directly. Compatible clients share the daemon for the same user/host. Do not stop the daemon when one agent session exits while other clients or background work depend on it. Detached startup and optional service registration must have explicit lifecycle ownership and shutdown semantics.

**R16 — Capability negotiation.** Record minimum/maximum supported backend/protocol capabilities per plugin release, and discover the active backend version/capabilities. Compatible patch differences should not trigger unnecessary upgrades. Unsupported combinations must name the mismatch and supported resolution. A plugin update cannot force a backend change that breaks another supported active client without disclosing the conflict.

**R17 — No duplicate MCP ownership.** Detect pre-existing insrc MCP registrations from manual setup, the current registration helper, or another integration. Offer a clear migration/reuse route without silently overwriting user configuration. Ensure one effective insrc tool connection per host session where possible. Removing a plugin must only remove its own registration/configuration and must not break another client's connection.

### Models repository setup and readiness

**R18 — Local model prerequisites.** Check Ollama availability and the configured local embedding model independently from optional local reasoning models. Report what each missing dependency prevents. Embeddings remain local-only; cloud inference uses the user's installed Claude/Codex CLI sessions through CliProvider, never direct cloud REST or plugin-managed API keys. Do not promise full index/analysis readiness before required local prerequisites exist.

**R19 — Controlled model downloads.** Explain model identity, purpose, configured source, disk/download size where obtainable, and hardware suitability. Never invent resource estimates or silently substitute a weaker model to meet resource limits. Reuse installed compatible models, serialize model/provider operations according to existing policy, and distinguish a canceled download from a model ready for use.

**R20 — Repository enrollment.** Identify the intended repository and obtain the applicable user authorization before registration/indexing. Use repo.add IPC exclusively, respect canonical paths and dependency-closure scope, and distinguish registration, initial indexing, partial/error status, and a fresh usable index. Adding one workspace must not automatically enroll unrelated directories or the user's home folder.

**R21 — Truthful readiness.** Report component states separately: plugin loaded, backend installed/compatible, daemon reachable, MCP connected, Ollama/model readiness, repository registration/index freshness, and review-provider availability. Define capability-specific readiness for analysis, workflow authoring, build validation, and independent review. A healthy daemon alone does not establish that every workflow can run.

### Upgrades recovery and removal

**R22 — Controlled upgrades.** Separate plugin upgrades from backend upgrades. Before backend activation, verify client compatibility and data migration needs, identify active workflows/indexing, and use a controlled handover so two versions never access live storage concurrently. Do not interrupt active work silently. Show progress and preserve continuation/artifact state across supported upgrades.

**R23 — Migration and rollback.** Back up affected persistent state before an approved destructive or irreversible migration. Define data-compatible rollback and failure recovery per release. Do not claim binary rollback is safe after a storage migration unless verified. A failed candidate installation must leave the last working installation usable; a failed migration must produce explicit recovery status rather than repeated automatic retries.

**R24 — Diagnose and repair.** Return actionable machine-readable errors and concise human explanations for missing Node/native prerequisites, failed downloads, Ollama/model issues, denied permissions, socket conflicts, incompatible versions, MCP naming/registration errors, and interrupted installs. Repair affects only the diagnosed owned components and does not erase registry, databases, artifacts, credentials, or user settings as a generic remedy. Redact logs and environment details before displaying diagnostic evidence.

**R25 — Safe removal.** Plugin disable/uninstall leaves shared backend installation, models, repository data, and other clients intact. Offer separately authorized backend/service removal with clear data-retention choices. Never delete repositories or user models as a side effect of plugin uninstall.

### Presentation review and approvals

**R26 — CLI presentation.** Follow the host-independent presentation requirements: declare exact documents, show resolved identity/path and review summary, provide full-document access, and obtain explicit approval in the same conversation. Do not require the insrc TUI or claim an IDE pane opened in a terminal. Preserve revision freshness, blocking-finding gates, and explicit override reasons.

**R27 — Backend-enforced workflow discipline.** Skills and optional hooks assist routing but do not replace daemon enforcement. A skipped skill, host restart, plugin disable, or failed hook cannot authorize self-review, fabricate completed validation, bypass review/approval, or restart a fourth review round without the user's decision. Controller subagents remain the same reviewer party.

## Non functional requirements

| ID | Requirement | Verification |
|---|---|---|
| NFR1 | No concurrent daemon ownership of the same live stores, including installation/start/upgrade races. | Exercise simultaneous startup from both agent clients and IDEs, lock contention, stale sockets, and interrupted handover. |
| NFR2 | Repeated setup is idempotent and failure preserves owned persistent data and the last valid install where no migration has begun. | Interrupt each installation/activation phase, rerun, and compare data/config/install state. |
| NFR3 | Downloads/builds have version/provenance integrity and bounded failure behavior; no uncontrolled retry loops. | Corrupt/missing artifacts, unsupported architecture, network failures, cancellation, and explicit retry scenarios. Set concrete timeout/retry budgets during design. |
| NFR4 | Status is truthful per capability; unavailable dependencies never become false readiness or a weaker undisclosed model. | Validate partial setup and incompatible backend/provider/model combinations. |
| NFR5 | No credentials, prompts, repository contents, or unrelated environment secrets are transmitted by setup diagnostics. | Inspect outbound requests and redacted diagnostic payloads; test hostile repository/config input as untrusted data. |
| NFR6 | Installation does not rely on globally installed fonts/tools or developer checkout paths beyond documented prerequisites; runtime assets ship completely. | Fresh supported hosts and relocated plugin caches; verify native modules, prompts, schemas, and offline rendering assets. |
| NFR7 | Source and instruction releases stay compatible and traceable across both adapters and the shared daemon. | Version/capability fixtures, canonical guide comparisons, and supported host/client release matrix. |
| NFR8 | Local data/configuration remains local; no new cloud inference or hosted service is required to use the plugins. | Inspect model/provider/setup routes and verify local daemon IPC ownership and documented download-only network needs. |

No arbitrary installation-time or disk budget is prescribed. Measure supported clean-install and upgrade fixtures, report expected resource needs, and set justified budgets in design.

## Logical ownership relationships

| Relationship | Direction and cardinality | Ownership and compatibility |
|---|---|---|
| Agent plugin to active backend | Multiple plugin/IDE clients share one active backend per user/host/store. | Shared installer/lifecycle owns activation; plugin cache lifetime does not own backend data. |
| Backend install to versions | A managed installation can retain multiple versioned candidates, with one active store owner. | Rollback eligibility depends on data compatibility, not merely a retained binary. |
| Plugin release to capabilities | Each adapter release declares supported host/backend capability ranges. | Compatibility metadata is versioned and checked before use or activation. |
| Repository to daemon registry | One canonical repository registration serves authorized client work. | repo.add establishes membership; plugins never allocate storage registry rows directly. |
| Setup session to operations | One setup can include multiple separately scoped operations and resume them after failure. | Record action/version/result without storing secrets; completed steps are reused rather than repeated blindly. |

## Acceptance criteria

1. A clean supported machine can install a plugin, invoke setup without a working insrc MCP server, install the authorized backend release, connect, enroll an authorized repository, and reach verified capability-specific readiness.
2. Existing compatible installation from an IDE or manual setup is reused without duplicate install, registration, or store owner.
3. Simultaneous Claude Code/Codex/IDE setup or startup produces one active daemon and consistent results.
4. Unsupported platform/native ABI or unavailable prerequisite yields precise remediation without false installation success.
5. Cancellation or permission denial preserves completed work and existing data; setup resumes without repeating successful downloads or unauthorized steps.
6. A corrupted release or interrupted extraction/build is never activated as a complete backend.
7. Missing Ollama/embedding model, optional reasoning model, or review-provider login is distinguished from daemon/MCP health, with accurate capability limits.
8. MCP startup with no daemon installation gives a prompt actionable setup message; it does not silently perform an unbounded installation.
9. Legacy manual MCP registration and injected steering can migrate/coexist without duplicate tool surfaces, overwritten instructions, or unrelated config loss.
10. A plugin upgrade does not silently upgrade the backend. A backend upgrade checks other supported clients, active work, and migration compatibility before handover.
11. Failed upgrade/migration reports recovery state and supports only verified rollback paths; no two versions access live storage together.
12. Plugin uninstall leaves shared daemon/data/models and other client connections intact.
13. Terminal users can inspect documents and approve in the current conversation without an IDE or TUI; failed presentation never implies consent.
14. An agent bypassing a skill or losing continuation context cannot bypass backend review, freshness, registry, or approval enforcement.
15. Both plugin packages are validated against explicitly listed supported host versions and supported local environments; unsupported cloud-only execution is clearly described.
16. Setup logs and diagnostic output contain no secrets or raw repository content; untrusted inputs cannot change install destinations, release source, or approval policy without validated user configuration.

## Distribution and documentation references

Documentation was checked on 29 October 2026. Platform packaging rules can change; verify supported formats and publication eligibility again when implementing and releasing.

- [OpenAI plugin packaging](https://developers.openai.com/plugins/build/plugins): supports onboarding skills invoked through setup after installation. It distinguishes public directory submission from local/desktop distribution; the consulted guidance excludes lifecycle-hook plugins from public directory eligibility and directs local MCP servers to desktop-only submission. Do not promise one universal public listing across every Codex/ChatGPT surface or depend on hooks as the installer.
- [Claude Code plugin overview](https://code.claude.com/docs/en/plugins): packages skills, MCP servers, and optional host components. Use an explicit setup entry point to invoke the shared installer with the available permissions.
- [Claude Code plugin dependencies](https://code.claude.com/docs/en/plugin-dependencies): plugin dependencies do not by themselves establish installation of insrc's OS/runtime/native prerequisites.

Preserve separate host packaging where needed. A shared skills format does not prove identical manifest, transport, hook, install, or permission behavior. Start with a tested local/team distribution route, then publish through each eligible public channel. No marketplace acceptance is implied by these requirements.

## Release gates and decisions for design

Before release, resolve the supported OS/architecture/host-version matrix, canonical installer ownership/location, verified release channel, Node/native packaging, capability negotiation, launch locking, consent boundaries, MCP migration rules, and recovery/migration contract. Establish how bootstrap scripts are distributed and verified before the backend exists.

Validate clean install, reuse, interrupted setup, restricted/headless operation, concurrent clients, upgrade/rollback, disable/uninstall, and full tracked workflow journeys on the supported matrix. Classify the known CLI presentation and coding/review evidence gaps from the linked requests: resolve or explicitly restrict affected release capabilities; a successful plugin install must not mask an unreliable review experience.

Implementation follows insrc_triage and the routed tracked workflow, with relevant design artifacts, independent review, explicit user approval, build verification, and final code review. Prompt/manifest assertions alone do not establish a working installation or safe lifecycle.
