<!-- insrc:artifact DEF-ad0d45c9d690f8c1 -->

# Epic: insrc's grounded code-knowledge and tracked workflow reach two audiences today — JetBrains-IDE users (through the in-repo plugin) and terminal users (through the CLI/TUI) — but developers who work in stock, unmodified VS Code have no first-class way to bring insrc into their editor.

**Flavor:** new-capability

## Problem

insrc's grounded code-knowledge and tracked workflow reach two audiences today — JetBrains-IDE users (through the in-repo plugin) and terminal users (through the CLI/TUI) — but developers who work in stock, unmodified VS Code have no first-class way to bring insrc into their editor. Their only in-editor option is adopting a separate, forked VS Code build, which is a heavier commitment than installing an extension and is not what most VS Code users want. As a result, a VS Code developer who wants insrc must, by hand and outside the editor, provision and keep the background daemon current, register their AI assistant's tool configuration so the assistant can reach insrc, and enrol their workspace with the daemon — each a manual, easy-to-get-wrong, out-of-editor step with no living indication of whether any of it succeeded. This friction keeps insrc's grounded assistance out of reach for the large population of developers on standard VS Code and the VS-Code-family editors built on it.

## Non-goals

- **Forking or modifying VS Code itself — the deliverable must run as an ordinary extension in stock, unmodified VS Code.** — The whole point is a low-commitment packaging for developers who will not adopt a forked editor; the deeper fork-based integration already exists separately as insrc-ide.
- **Running any reasoning (LLM calls, analysis, or graph queries) inside the extension process.** — insrc's architecture keeps all reasoning and data behind the daemon; a client that reasoned on its own would duplicate and diverge from the daemon and break the local-first/no-cloud-REST guarantees.
- **Replacing the insrc-ide VS Code fork.** — The fork remains the deeper IDE-integration path; this extension is a complementary, lighter-weight surface, not a substitute.
- **Shipping the full operational/config surface in v1 (a configuration editor, Daemon/Workflows/Debug pages, an artifact-review panel, and context-menu repo actions).** — v1 is deliberately onboarding-first to deliver the core value (a grounded, wired assistant) fast; those surfaces collapse into a single later settings release, mirroring how the JetBrains side evolved.
- **Publishing to Open VSX or distributing a manual VSIX as part of v1.** — v1 targets the VS Code Marketplace only to keep one publish pipeline while the extension's shape is proven; broader-registry reach (for the fork editors) is an explicit fast-follow.
- **Deep code-sharing with the daemon/CLI beyond a thin IPC boundary.** — Pulling daemon internals, the indexer, or storage into the extension would bloat its bundle and violate the daemon-owns-everything boundary; only IPC types + a lightweight socket client are shared.

## Assumptions

- `high` The daemon exposes a stable local Unix-socket JSON-RPC contract (status, repo registration, and the other operational methods) that a thin client can speak without touching any daemon internals. [[c2]]
- `high` scripts/daemon-ctl.sh (start/stop/restart/update) and scripts/insrc-daemon-install.sh are the supported daemon lifecycle + install path — already the ones the JetBrains plugin drives/bundles — so the extension can mirror and bundle them rather than inventing a new mechanism. [[c3]]
- `med` The existing CLI daemon socket client (src/cli/client.ts) is close enough to a general client that it can be extracted/generalized into a shared package consumed by both the CLI/TUI and the extension. [[c2]]
- `med` The VS Code AI hosts the extension targets each read their MCP/tool configuration from a known per-host location (or the native VS Code MCP registry), analogous to how the JetBrains hosts expose an MCP config file the plugin key-merges into. [[c5]]
- `high` The extension runs in the VS Code Node extension host, so opening the local daemon socket and running a bundled install script are available to it without a separate runtime. [[c6]]
- `high` The JetBrains onboarding epic (foundation → MCP-wiring → daemon-lifecycle → steering → onboarding) is a sound structural template this epic can mirror 1:1 in TypeScript. [[c5]]

## Constraints

| ID | Type | Text | Source |
| :--- | :--- | :--- | :--- |
| `k1` | stakeholder | The deliverable is a stock-VS-Code EXTENSION (not a fork), written in TypeScript, living in-repo under vscode-plugin/ mirroring the jetbrains-plugin/ thin-orchestrator precedent. | [[c1]] |
| `k2` | invariant | No reasoning of any kind (LLM calls, analysis, graph queries) runs in the extension process; every such capability stays behind daemon IPC, and the extension opens no cloud path. | [[c4]] |
| `k3` | contract | The repo registry is the contract: a workspace is enrolled ONLY via the daemon's explicit repo.add registration — never a silent/auto-registration. | [[c4]] |
| `k4` | stakeholder | Every invasive action — provisioning the daemon and wiring an AI host's own config files — is explicit and consent-gated (a prompt-gated Install for the daemon; a single combined-consent prompt for wiring), never silent or automatic. | [[c1]] |
| `k5` | invariant | Code-sharing with the daemon/CLI is limited to a thin IPC boundary (IPC types + a lightweight socket client); no daemon internals, indexer, or storage code enters the extension. | [[c1]] |
| `k6` | stakeholder | v1 is phased/onboarding-first: only the host wiring, daemon lifecycle, workspace registration, a minimal status surface, and its commands ship; the configuration editor, Daemon/Workflows/Debug pages, artifact-review panel, and context-menu actions are deferred to a single later settings release. | [[c1]] |
| `k7` | stakeholder | v1 publishes to the VS Code Marketplace only, via a manually-triggered publish (not per-push CI); Open VSX / manual-VSIX distribution is out of v1. | [[c1]] |

## Stories

### E20260921ad0d45c9:S001 — Foundation: activate in stock VS Code and reach the daemon, with live status

**User value:** `size: L`

A developer installs the extension in ordinary VS Code, opens a workspace, and immediately sees whether the insrc daemon is up — the extension loads cleanly, owns no reasoning, and talks to the daemon only through a thin shared client, giving every later capability a common foundation.

**Extends:** [[c2]] [[c6]]

**Acceptance criteria:**

- **ac1:** Given the extension is installed in stock, unmodified VS Code and a workspace is open, when VS Code activates the extension, then it loads without modifying the editor, determines whether the daemon is reachable, and runs no reasoning (LLM/analysis/graph) in its own process. _(operationalizes `k1`, `k2`, `k5`)_
- **ac2:** Given the extension is active and has read the daemon's state, when the developer looks at the editor, then a glanceable status indicator reflects the daemon as running, stopped, or errored. _(operationalizes `k6`)_

**Local constraints:**

- `lc1` (invariant) The daemon is reached ONLY through the thin shared IPC boundary that the CLI/TUI also uses — no daemon internals, indexer, or storage code is pulled into the extension. [[c2]]
- `lc2` (invariant) The extension is a thin orchestrator: it displays and acts, but performs no reasoning of its own. [[c4]]

### E20260921ad0d45c9:S002 — Manage the daemon lifecycle, bootstrapping a bundled installer on first use

**User value:** `size: M`

A developer can start, stop, restart, and update the insrc daemon without leaving the editor — and if the daemon isn't installed at all, the extension can provision it for them from an installer it already ships with, but only after they explicitly agree.

**Depends on:** `s1`

**Extends:** [[c3]]

**Acceptance criteria:**

- **ac1:** Given the daemon is installed and running or stopped, when the developer chooses a lifecycle action (start, stop, restart, or update), then the extension carries it out through the daemon's own supported lifecycle mechanism and reflects the resulting state. _(operationalizes `k1`, `k6`)_
- **ac2:** Given no daemon is installed on the machine, when the developer opens a workspace with the extension active, then the extension offers an explicit Install action and provisions nothing until the developer accepts — and on acceptance it installs the daemon from an installer bundled in the extension itself, never a silent or unprompted install. _(operationalizes `k4`)_

**Local constraints:**

- `lc1` (stakeholder) The daemon installer is bundled inside the extension package and run locally on consent — not downloaded from the network at runtime. [[c1]]
- `lc2` (convention) Lifecycle actions mirror the daemon's existing supported control mechanism rather than inventing a new one. [[c3]]

### E20260921ad0d45c9:S003 — Detect AI hosts and wire insrc into them behind one combined consent

**User value:** `size: L`

A developer's AI assistant in VS Code can actually reach insrc — the extension detects whichever supported assistants are present and, in a single click, registers insrc's tool config plus its tracked-workflow steering into each, written reversibly so their own settings are preserved.

**Depends on:** `s1`

**Extends:** [[c5]]

**Acceptance criteria:**

- **ac1:** Given one or more supported AI hosts are present (detected by installed-extension identity or by the running editor environment), when the developer first opens a workspace, then the extension presents a single combined prompt naming every detected host and wires none of them until the developer accepts. _(operationalizes `k4`)_
- **ac2:** Given the developer accepts the wiring prompt, when the extension wires the detected hosts, then each host's own configuration gains the insrc tool registration and the tracked-workflow steering, written reversibly and preserving the developer's surrounding content. _(operationalizes `k4`, `k2`)_
- **ac3:** Given a supported host the extension does not yet recognize appears in the ecosystem, when a new host adapter is added, then it plugs into the same detection-and-wiring flow without reworking the existing adapters. _(operationalizes `k6`)_

**Local constraints:**

- `lc1` (stakeholder) The host universe is a pluggable set of adapters (extension-ID hosts + editor-environment hosts); detection is best-effort by known identity/environment, and an unknown host simply isn't wired until an adapter exists. [[c5]]
- `lc2` (convention) Writes into a host's own files are marker-delimited / replace-only and reversible, so surrounding user content is preserved and the insrc region can be removed later. [[c5]]

### E20260921ad0d45c9:S004 — Enrol the open workspace with the daemon, explicitly and once

**User value:** `size: M`

A developer's workspace becomes scoped to insrc so their assistant's queries are grounded in that repo — offered as a one-time, opt-in prompt that respects the registry contract and never enrolls anything behind their back.

**Depends on:** `s1`

**Acceptance criteria:**

- **ac1:** Given the open workspace's root is not yet enrolled with the daemon, when the extension activates on that workspace, then it shows a one-time prompt offering to register the workspace and never enrolls it silently. _(operationalizes `k3`, `k4`)_
- **ac2:** Given the developer accepts the register prompt, when the extension enrols the workspace, then it does so only through the daemon's explicit registration contract. _(operationalizes `k3`)_

**Local constraints:**

- `lc1` (stakeholder) The register prompt is one-time-per-workspace; a dismissal is respected and not re-nagged on every activation. [[c1]]

### E20260921ad0d45c9:S005 — Coherent first-run onboarding plus durable commands (and clean removal)

**User value:** `size: M`

A developer opening a fresh workspace is guided through exactly the consent steps they need — install the daemon, register the workspace, wire their assistant — as one coherent flow rather than scattered surprises; any step they skip stays reachable as a command, and uninstalling the extension cleanly removes what it wired.

**Depends on:** `s2`, `s3`, `s4`

**Acceptance criteria:**

- **ac1:** Given a fresh workspace with no daemon, no wiring, and no registration, when the developer opens it, then the extension guides them through the needed consent prompts (install, register, wire) coherently rather than as unrelated pop-ups. _(operationalizes `k4`, `k6`)_
- **ac2:** Given the developer dismissed or declined any onboarding prompt, when they later want to perform that action, then a durable command is available for it (install, register, wire, and the daemon lifecycle actions) so no dismissed prompt becomes a dead end. _(operationalizes `k6`)_
- **ac3:** Given the extension has wired hosts and registered a workspace, when the extension is uninstalled, then the reversible wiring it added is removed, restoring each host's configuration to its prior content. _(operationalizes `k4`)_

**Local constraints:**

- `lc1` (stakeholder) Every action is a first-class command; the status surface and any prompt merely invoke those commands rather than holding separate logic. [[c1]]

### E20260921ad0d45c9:S006 — Publish scaffolding for the VS Code Marketplace

**User value:** `size: S`

A maintainer can ship the extension to the VS Code Marketplace as a single installable package with a proper listing, via a deliberate manual publish step — so developers can discover and install insrc for VS Code the ordinary way.

**Depends on:** `s1`

**Acceptance criteria:**

- **ac1:** Given the extension is built, when a maintainer prepares a release, then the extension carries the metadata and listing assets required to publish to the VS Code Marketplace as a single installable package. _(operationalizes `k1`, `k7`)_
- **ac2:** Given a maintainer wants to publish a version, when they trigger the publish, then it targets the VS Code Marketplace only and runs as a deliberate, manually-triggered step rather than automatically on every push. _(operationalizes `k7`)_

**Local constraints:**

- `lc1` (stakeholder) v1 targets the VS Code Marketplace only; Open VSX and manual-VSIX distribution are out of scope. [[c1]]
- `lc2` (stakeholder) Publishing is a manually-triggered action, not a per-push CI job. [[c1]]

## Citations

- **[[c1]]** `doc` `.insrc/artifacts/SPEC-0f8ddef9b2d99e8e.json` — "The approved brainstorm SpecArtifact — 12 recorded decisions + non-goals defining the VS Code extension v1 (in-repo vscode-plugin/, thin shared IPC package, pluggable multi-host adapter, bundled-insta"
- **[[c2]]** `code` `src/cli/client.ts` — "The existing Unix-socket JSON-RPC daemon client used by the CLI/TUI — the seed for the new thin src/shared/ipc-client package."
- **[[c3]]** `code` `scripts/daemon-ctl.sh + scripts/insrc-daemon-install.sh` — "The supported daemon lifecycle script + standalone installer the extension mirrors (start/stop/restart/update) and bundles (install)."
- **[[c4]]** `convention` `CLAUDE.md` — "'Repo registry is the contract' (repo.add is the only registration path; storage never auto-allocates) and 'No direct cloud REST from our process' — the invariants the extension must honor."
- **[[c5]]** `code` `jetbrains-plugin/src/main/kotlin/ai/insors/insrc/jetbrains/host/ (AiHostAdapter, HostDetection, InsrcMcpRegistration, JsonMcpConfigWriter, MarkerFileWriter)` — "The proven JetBrains onboarding stack (detect hosts → key-merge the MCP registration → marker-delimited steering) this VS Code epic mirrors in TypeScript."
- **[[c6]]** `analyze-bundle` `define s1 scope.assess bundles (reuse.map + capability.map + convention.detect)` — "Grounding that the reuse is via a thin shared boundary over the shipped socket client/lifecycle/installer, mirroring the JetBrains onboarding decomposition, honoring the repo-registry + no-cloud-REST "

<!-- insrc:review -->

## Review

### ✅ Review `PASS` — define (define)

**0 HIGH · 0 MED · 8 LOW** · model `client` · reviewed 2026-09-21T16:35:27.430Z

| Ref | Kind | Severity | Fixability | Premise | Evidence | Action |
| --- | --- | --- | --- | --- | --- | --- |
| cl-c2-exists | citation | LOW | auto | src/cli/client.ts exists and is the Unix-socket JSON-RPC daemon client used by the CLI/TUI (the seed the epic generalizes into a shared ipc-client package). | Read src/cli/client.ts:1 = "import { createConnection, type Socket } from 'node:net';" and grep matched 50 occurrences of createConnection\|net.connect\|.sock\|jsonrpc plus 5 client class/export symbols. Confirms it is the real Unix-socket JSON-RPC daemon client. | none — verified sound |
| cl-c3-scripts | citation | LOW | auto | scripts/daemon-ctl.sh and scripts/insrc-daemon-install.sh both exist, and daemon-ctl.sh supports start/stop/restart/update lifecycle actions. | Both reads resolved found:true — scripts/daemon-ctl.sh:1 and scripts/insrc-daemon-install.sh:1 both begin '#!/usr/bin/env bash'; grep matched 50 start/stop/restart/update occurrences. Both scripts exist and daemon-ctl.sh carries the lifecycle verbs. | none — verified sound |
| cl-c4-claude-conventions | citation | LOW | auto | CLAUDE.md states the 'Repo registry is the contract' rule (repo.add is the only registration path; storage never auto-allocates) and the 'No direct cloud REST from our process' invariant. | CLAUDE.md:1 read found:true; grep 'Repo registry is the contract' matched 8, 'No direct cloud REST' matched 24, 'repo.add' and 'UnregisteredRepoError' each matched (50, truncated). Both cited conventions are present verbatim in CLAUDE.md. | none — verified sound |
| cl-c5-jetbrains-host-stack | inventory | LOW | auto | The JetBrains onboarding host stack exists under jetbrains-plugin/src/main/kotlin/ai/insors/insrc/jetbrains/host/ with the five named components: AiHostAdapter, HostDetection, InsrcMcpRegistration, JsonMcpConfigWriter, MarkerFileWriter. | All five named components matched in grep, and the jetbrains-plugin/.../jetbrains/host/ source directory contains AiHostAdapter.kt, HostDetection.kt, InsrcMcpRegistration.kt, JsonMcpConfigWriter.kt, MarkerFileWriter.kt (plus AiHostAdapterImpl, McpWiringLifecycle, MarkerSection). The onboarding host stack the epic mirrors exists as claimed. | none — verified sound |
| cl-c1-spec-exists | citation | LOW | auto | The approved brainstorm SpecArtifact .insrc/artifacts/SPEC-0f8ddef9b2d99e8e.json exists as the DEF's stakeholder-constraint source. | Read .insrc/artifacts/SPEC-0f8ddef9b2d99e8e.json:1 found:true (begins '{'). The approved brainstorm SpecArtifact exists as the DEF's stakeholder-constraint source. | none — verified sound |
| cl-vscode-plugin-new | semantic | LOW | auto | vscode-plugin/ is a NEW deliverable subsystem that does not yet exist in the repo (its absence is expected — the epic creates it mirroring jetbrains-plugin/). | grep 'vscode-plugin' matched 6 times, ALL in docs artifacts (DEF.md, standalone SPEC.md) and one CLAUDE.md doc mention — none under src/ or an existing vscode-plugin/ source tree. Confirms vscode-plugin/ is a new deliverable path, correctly absent (expected). | none — verified sound |
| cl-ipc-client-new | semantic | LOW | auto | src/shared/ipc-client is a NEW proposed shared package that does not yet exist (its absence is expected — the epic extracts src/cli/client.ts into it). | grep 'shared/ipc-client\|ipc-client' matched 3 times, all in docs artifacts (DEF.md c2 citation, standalone SPEC.md) — no existing src/shared/ipc-client source. Confirms it is a new proposed package, correctly absent (expected). | none — verified sound |
| cl-dep-graph-acyclic | ordering | LOW | auto | The story dependency graph is acyclic: s1 is root; s2/s3/s4/s6 each depend on s1; s5 depends on s2, s3, s4 — no cycle. | The DEF story headers state: s1 root (no Depends on); s2 'Depends on: s1'; s3 'Depends on: s1'; s4 'Depends on: s1'; s5 'Depends on: s2, s3, s4'; s6 'Depends on: s1'. Edges point only from higher-numbered to lower/earlier stories converging on s1 — no back-edge, no cycle. DAG confirmed. | none — verified sound |
