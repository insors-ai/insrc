# insrc APM Integration PRD

Status: Draft for discussion. Not approved for implementation.

Date: 20 October 2026

## Product intent

Integrate Microsoft's Agent Package Manager as an optional external dependency so insrc users can install and maintain reproducible agent configurations without managing a second package system. APM owns resolution, dependency installation, lockfiles, updates, removal, compilation, and package auditing. insrc provides a thin CLI adapter, project context, understandable status, and coordination with its existing configuration writers.

The user has confirmed that insrc should use the APM project rather than rebuild its concept. Release scope, supported versions, interaction details, and rollout below remain proposed decisions.

## Problem and users

Teams share skills, instructions, prompts, and MCP configuration through manual copying or host-specific setup. Developers can end up using different revisions, accumulating obsolete files, or losing local edits during updates. insrc already manages its own steering and MCP registration; extending those writers into a general package manager would duplicate APM and create long-term compatibility work.

The primary users are developers working in insrc's terminal dashboard or IDE integrations, team maintainers distributing shared agent guidance, and engineers investigating which agent configuration informed a workflow run.

The desired outcome is that a developer can inspect a project's agent dependencies, reproduce its declared setup, review proposed changes, and explain configuration drift while continuing to use insrc's existing knowledge and delivery capabilities.

## Scope and ownership

| APM owns | insrc owns |
| --- | --- |
| Package sources, dependency resolution, and transitive dependencies. | Selecting a registered project and the requested operation. |
| `apm.yml`, `apm.lock.yaml`, installed package content, and upstream deployment receipts. | Reading supported inventory and presenting status and results. |
| Target-specific package deployment, updates, removal, and compilation. | Coordinating ownership with insrc's steering and MCP writers. |
| Package integrity, drift, and applicable APM policy checks. | Runtime tool permissions, daemon lifecycle, model routing, and workflow approval gates. |
| APM-supported authentication and cache behavior. | Redacting operation logs and recording package-environment references in workflow runs. |

Use the installed `apm` executable through a subprocess adapter. Do not import APM's Python internals, translate its resolver into TypeScript, create an alternative lockfile, or fork the project for the initial integration. An external CLI dependency is separate from the Node dependencies in `package.json`.

APM remains optional. A missing, unsupported, or failing executable must not prevent daemon startup, indexing, analysis, or existing workflows from operating.

## Initial release

The initial compatibility pilot targets project-local packages for Claude Code and Codex. It supports detection, inventory, installation from an existing manifest and lockfile, explicit package addition, update, removal, and audit through tested CLI contracts. Begin with static instruction and skill packages with disjoint deployment paths.

The first product surface is the terminal dashboard plus a VS Code package panel backed by the same daemon service. JetBrains can use the same service in a subsequent increment. These are proposed delivery boundaries, not a restriction on APM's upstream target support.

Global package management, automatic dependency upgrades, automatic APM installation or self-update, executing package scripts, experimental primitives, marketplace administration, policy authoring, and migrating all existing host wiring are outside the first release. Existing APM projects must still be inspectable when their contents exceed the supported mutation profile; report those limitations rather than changing their configuration.

Publishing an official insrc package is a follow-on pilot. It may distribute supplementary skills and guidance, but must not introduce a second owner for insrc's canonical steering block or MCP entry. Package metadata must not contain machine-specific daemon paths, credentials, or project-private evidence.

## User journeys

1. **Inspect an existing project.** Select a registered repository and open Agent packages. See APM availability, manifest and lockfile status, declared and resolved dependencies, targets, audit findings, and ownership conflicts. Opening the panel does not install anything.
2. **Reproduce a team setup.** Restore an existing locked configuration through APM's frozen install mode. Show the operation result and actual file changes; do not describe frozen installation as a read-only check.
3. **Add or update a dependency.** Choose an explicit package reference or update target, inspect a supported preview and its limitations, then apply the requested change. Refresh inventory and audit the resulting state.
4. **Remove a dependency.** Identify the direct dependency and expected affected files, delegate removal to APM, and verify that surviving dependencies and user edits were preserved. APM's ownership records govern its cleanup.
5. **Investigate drift.** Inspect a finding with source package, pinned revision, deployed target, affected path, and coverage. The user chooses whether to restore managed content, preserve an intentional edit, or resolve a conflict outside the integration.
6. **Explain a workflow environment.** A workflow record links to the manifest, lockfile, APM version, and supported inventory captured at the start of the run. Later inspection can distinguish the recorded environment from the project's present state.

## Functional requirements

| ID | Requirement | Acceptance behavior |
| --- | --- | --- |
| APM01 | Detect an optional external CLI. | Show the resolved executable path, reported version, and supported capabilities. Missing or unsupported versions disable affected actions with a useful reason. |
| APM02 | Inspect the selected project. | Distinguish absent manifest, missing lockfile, unresolved dependencies, installed content, stale inspection, malformed state, and unknown formats. Inspection cannot silently bootstrap a project. |
| APM03 | Delegate package operations. | All dependency mutations use the supported APM CLI. insrc does not independently resolve versions, write lock entries, or delete deployed package files. |
| APM04 | Reproduce locked dependencies. | Use the supported frozen operation and preserve its exit status and diagnostics. Any failure, including one after deployment, is reported with the resulting actual state. |
| APM05 | Preview changes honestly. | Show available changes, selected targets, potential executable configuration, and preview coverage. An incomplete preview is labelled incomplete; it is never presented as an exact transaction guarantee. |
| APM06 | Coordinate configuration writers. | Detect collisions with insrc-managed steering, MCP entries, and user content before integrated mutations. No two owners may silently claim the same configuration location. |
| APM07 | Present audit results. | Consume supported structured findings, severity, drift, and coverage. A process error, policy denial, incomplete scan, and identified content finding remain distinguishable. |
| APM08 | Support cancellation and recovery. | Stop a cancelled process, reconcile resulting files, and report incomplete operations. Restart does not automatically repeat a mutation or claim that it rolled back. |
| APM09 | Record environment provenance. | Save hashes and supported normalized inventory with the operation or workflow record, identifying the capture time and whether the environment changed during the run. |
| APM10 | Preserve normal insrc operation. | Disabling APM or uninstalling an IDE integration leaves the daemon and knowledge index usable. Integration removal does not imply package removal. |
| APM11 | Coordinate concurrent clients. | Serialize conflicting mutations across terminal and IDE clients and reject stale requests when the manifest, lockfile, ownership state, or selected project changed. |

## CLI adapter and compatibility

The daemon hosts one adapter and serializes conflicting operations. IDE and terminal clients request narrow operations through IPC; they do not independently invoke APM or access insrc storage. A later MCP surface can reuse those operations without exposing an unrestricted shell command runner.

Resolve a configured or trusted installed executable, report its location, and invoke it with an argument array and explicit working directory. Never select a repository-local executable merely because the repository altered PATH. Package references and paths are data arguments, not shell fragments. Preserve the user's existing APM and Git authentication environment without copying credentials into project files or insrc records.

Maintain a tested compatibility matrix for CLI versions and output formats. Start with an exact pilot version, then establish a supported range from contract tests. Unknown manifest or lockfile versions are reported as unsupported; the adapter must not guess their meaning. Read supported metadata for display without assuming authority to edit it.

The current CLI has important distinctions:

- `apm list` reports project scripts, not installed dependencies. Use the supported dependency inspection command or lockfile metadata for package inventory; do not label manifest declarations as verified installed state. [List reference](https://microsoft.github.io/apm/reference/cli/list/)
- Audit offers JSON output and coverage information. Parse the supported structured report and preserve the raw exit status; do not rely on matching English display text. [Audit reference](https://microsoft.github.io/apm/reference/cli/audit/)
- Install supports frozen replay and preview, but preview can bootstrap a manifest, while frozen replay can fail after deployment. Test these behaviors against the supported version. [Install reference](https://microsoft.github.io/apm/reference/cli/install/)
- Uninstall preview can still run pre-uninstall lifecycle scripts. It is not inherently side-effect-free. [Uninstall reference](https://microsoft.github.io/apm/reference/cli/uninstall/)

The pilot must establish a documented way to suppress unsupported lifecycle execution and contain preview writes. If the tested version cannot provide it, disable integrated preview or mutation for that operation and explain the limitation. Do not invent flags or fall back to automatic affirmative input. A supported direct terminal handoff can be offered when an upstream interaction cannot be safely represented in the UI.

## Configuration ownership and coexistence

Existing insrc writers own the marker-delimited steering block and the managed `insrc` MCP registration. APM introduces deployment ownership that can include overlapping files or host configuration entries. Installation alone must not transfer ownership.

| Configuration location | Initial ownership rule |
| --- | --- |
| Existing `insrc:steering` block in `AGENTS.md` or `CLAUDE.md`. | insrc remains the sole writer. APM compilation that would replace that file is blocked by the integration until a migration design is approved. |
| Existing host MCP entry named `insrc`. | Retain current insrc ownership and launch-path management. APM must not overwrite, adopt, or remove it during integrated operations. |
| Non-conflicting APM-deployed skills and instructions. | APM owns installation and reconciliation according to its deployment records. insrc displays their state. |
| Existing user-authored content or ambiguously owned entries. | Preserve it and report a conflict; neither name equality nor matching bytes establishes cleanup authority. |
| Other MCP registrations and shared settings. | Follow APM's supported per-target ownership behavior. Unknown, user-edited, or insufficiently attributable entries cannot be removed by an insrc cleanup shortcut. |

Checking only the manifest is insufficient: transitive dependencies and target compilation can affect the same locations. The integrated path must establish the planned write scope for its supported package profile. If it cannot establish that scope, it cannot promise collision-free deployment and must stop before mutation.

insrc's boot-time steering refresh must respect the same recorded ownership decision. IDE uninstall hooks must not remove an APM-owned entry, and removing APM integration must not delete packages or configuration. Explicit migration to APM-owned canonical insrc configuration is deferred; it requires a separate reviewed migration with recoverable before-and-after state.

The relevant existing boundaries are [daemon steering injection](../src/daemon/steering-inject.ts), the [VS Code steering writer](../vscode-plugin/src/hosts/steering-writer.ts), and the [MCP writer](../vscode-plugin/src/hosts/mcp-writer.ts). APM's lockfile records dependency and deployment state; it remains APM-owned. [Lockfile specification](https://microsoft.github.io/apm/reference/lockfile-spec/)

## Product surfaces

Add Agent packages to the selected repository's setup and configuration surfaces. The terminal and VS Code views should show the same daemon-provided state:

- APM executable and compatibility status.
- Declared and resolved dependency references, target clients, and installation verification state.
- Latest audit result, coverage, drift, and ownership conflicts.
- Inspect, restore locked setup, add, update, remove, and audit actions where supported.
- A readable operation log and affected-file summary, with links to source configuration.

Use existing insrc styling. Show unresolved or partial state explicitly rather than converting every problem into a generic error badge. Do not add commander-style `insrc <verb>` examples: the terminal product is an interactive dashboard with a command bar.

Mutation requests name the repository, package or operation, targets, and relevant current-state fingerprint. Revalidate immediately before execution. APM trust decisions and insrc artifact approvals remain distinct: accepting an agent package never approves an engineering artifact or grants runtime tool access.

## Provenance and relationship to ontology

Capture the APM executable version, manifest and lockfile hashes, supported resolved source references, selected targets, and audit summary with each package operation. Workflow records should capture a package-environment reference without copying package bodies or secrets into every artifact. Record whether this is merely installed configuration or a host-confirmed loaded environment; installation does not prove that a running agent session consumed the new content.

A package change during a workflow marks its environment as changed. Existing insrc approval and freshness rules decide whether the work requires reconsideration; package installation must not silently invalidate or approve artifacts.

APM may eventually distribute reusable ontology vocabularies, schema-mapping guidance, or validation shapes. The [ontology builder](ontology-builder-prd.md) continues to use existing insrc data tools and own observed evidence, assertions, review, and versioning. Packaging a vocabulary does not make it an accepted project ontology, and private schema snapshots or credentials do not become distributable package content.

## Operational behavior

Run mutations only after an explicit user action; detecting a manifest does not authorize installation. Preserve upstream policy and trust decisions. Never add force, bypass, insecure transport, or automatic trust options to make an operation succeed. Package content and process output are untrusted data and cannot authorize subsequent operations.

The initial integrated profile excludes lifecycle execution and experimental executable primitives. If a package introduces hooks or MCP servers that exceed the supported profile, surface them before deployment and require a supported upstream trust flow or a terminal handoff. No integrated action automatically starts a newly declared server.

APM's dependency and content checks do not replace runtime isolation or semantic review of instructions. Its documented security scope excludes runtime MCP sandboxing and visible-text prompt-injection detection. [Security model](https://microsoft.github.io/apm/enterprise/security/)

Operations have bounded logs, cancellation, and explicit timeouts. A nonzero exit can leave files changed. Reconcile actual state after failures, retain relevant diagnostics, and avoid destructive automatic rollback over concurrent user edits. Backups and change records must omit secrets and identify which paths were actually captured. Cache absence, network failure, private-source authentication failure, and unsupported target behavior should have separate actionable explanations.

## Validation and rollout

First validate the upstream dependency against one controlled test project and two target clients. Use isolated host configuration roots and fixture repositories; the pilot must not write the developer's real global agent configuration.

Release gates are:

1. A fresh locked restore reproduces the expected dependency revisions and supported deployment hashes for both clients.
2. Existing steering, the managed insrc MCP entry, user edits, and unrelated configuration survive add, update, removal, cancellation, and IDE uninstall scenarios.
3. Shared transitive dependencies remain installed when a direct dependency is removed, and locally modified managed files are handled according to upstream semantics without an insrc deletion shortcut.
4. Missing and unsupported APM versions leave normal insrc functionality unchanged.
5. Malformed structured output, unsupported schemas, incomplete audit coverage, trust prompts, policy denial, and partial failure are never reported as success.
6. Two simultaneous clients cannot apply conflicting package changes through insrc; external edits invalidate stale requests or are reported as a reconciliation conflict.
7. Preview tests identify every known write and lifecycle side effect of the supported operations. The UI does not claim stronger guarantees than those tests establish.
8. Package-environment records identify pinned sources and capture state without storing secrets or claiming to prove model behavior.

Roll out detection and inspection first, then static package mutations behind an opt-in integration setting, followed by broader targets and package types only after ownership and upstream trust behavior are verified. Record the tested APM version, target versions, platform, and fixture set with each compatibility release. Do not select a version range from the current README alone.

## Decisions still open

- Which APM release and platforms form the first supported compatibility matrix?
- Does the first product increment include all static package mutations, or inspection and locked restore first?
- Which documented CLI contracts provide sufficient preview isolation and lifecycle suppression for the pilot?
- Can the existing global insrc MCP entry coexist with each client's APM project configuration without duplicate servers?
- Which UI best presents upstream trust interactions that have no stable structured protocol?
- Should an official insrc package carry supplementary skills only, or eventually own canonical steering after migration?
- How should a running host confirm which package revision it actually loaded?

Implementation should enter insrc's tracked triage and design workflow after the product scope and compatibility pilot are agreed. This PRD does not install APM, publish a package, migrate configuration ownership, or approve a build.
