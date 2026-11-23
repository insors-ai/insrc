<!-- insrc:artifact LLD-c3d71313f34bce71-s3 -->

# LLD: STORY-c3d71313f34bce71-s3 — Guide dependency setup without privilege escalation

## Summary

**Epic:** `reliable-cross-platform-daemon-installation-lifecycle`
**HLD base run:** `wf-1795445383474-itgkv3`
**HLD effective hash:** `77bfb88eed6d...`

Dependency setup checks local Ollama and coding-agent availability without starting model work or sign-in. Missing Ollama is offered as a user-level installation with explicit terminal consent; coding agents are recommendations only. Existing installations are reused.

## Contents

1. [HLD context](#1-hld-context)
2. [Contract details](#2-contract-details)
3. [Data model changes](#3-data-model-changes)
4. [Interaction with shared contracts](#4-interaction-with-shared-contracts)
5. [Error paths](#5-error-paths)
6. [Test strategy](#6-test-strategy)
7. [Alternatives considered](#7-alternatives-considered)
8. [References](#8-references)

## 1. HLD context

> See **HLD-c3d71313f34bce71** § 2. Framework summary

**Rollout phase:** C — dependencies and lifecycle
**Consumes:** `sc1` (Installation and release identity), `sc2` (Manager command and operation state), `sc3` (Dependency report and consent), `sc6` (Local transport and explicit installation home)

**Adjacent scope (owned by other stories — do NOT implement here):**
- `s1`: Own the foundational manifest, controller/operation/consent/hook/transport contracts because every branch already depends on s1. Private implementation covers bootstrap, runtime/payload integrity, bundle preparation/publication, platform lock adapter and atomic install records. Later stories implement lifecycle, checks and hooks behind these contracts. The canonical scripts and interactive installer mode are shared with manual invocation and both IDEs; terminal prompts and durable results are part of this foundation. Include the selected release's installed TUI entry/assets in the payload and default successful interactive installer-to-TUI handoff. The s1 LLD must explicitly reserve ManagerAction.install to the shared terminal bootstrap script and forbid IDE-adapter invocation. DEF traceability: E20261123c3d71313:S001:FR001 and this story's DEF acceptance criteria apply unchanged. — owns `sc1`, `sc2`, `sc3`, `sc5`, `sc6`, `sc7`
- `s2`: Private dev checkout/branch sync, lockfile installation and native build preparation; returns the same immutable prepared candidate. It does not define a second lifecycle or migration engine. Include the selected release's installed TUI entry/assets in the payload and default successful interactive installer-to-TUI handoff. DEF traceability: E20261123c3d71313:S002:FR001 and this story's DEF acceptance criteria apply unchanged.
- `s4`: Private daemon start/readiness, boot guard integration, shutdown drain/immediate exit and exit-completion launcher wrapper; transport is shared. No delivery sync/build on start and no signal/PID daemon control. DEF traceability: E20261123c3d71313:S004:FR001 and this story's DEF acceptance criteria apply unchanged. — owns `sc4`
- `s5`: Private ordered migration runner, daemon migration-only mode, blocked-state persistence, interrupted-run validation and explicit retry. Hooks alone choose data changes and recovery policy. DEF traceability: E20261123c3d71313:S005:FR001 and this story's DEF acceptance criteria apply unchanged.
- `s6`: Private VS Code native terminal open/focus/launch integration, duplicate-action handling and post-install reconnect. It invokes the shared script and leaves all install prompts/output in that terminal, including after failure. Existing ordinary lifecycle and upgrade-consent UI remains thin. Successful installation automatically enters the installed TUI in that same terminal; the IDE only reconnects/status-checks and does not require a second click. DEF traceability: E20261123c3d71313:S006:FR001 and this story's DEF acceptance criteria apply unchanged.
- `s7`: Private JetBrains native terminal open/focus/launch integration with the same script, stdin/output and post-install readiness behavior as VS Code; no independent wizard or hidden install. Preserve background activation/control and Windows IPC bridge for ordinary daemon operations. Successful installation automatically enters the installed TUI in that same terminal; the IDE only reconnects/status-checks and does not require a second click. DEF traceability: E20261123c3d71313:S007:FR001 and this story's DEF acceptance criteria apply unchanged.
- `s8`: Private isolated VM/runner fixtures, target matrix evidence and release qualification results, including real Windows named-pipe behavior and preservation of host v2 daemon. Terminal-install parity checks cover each IDE and manual invocation, paths with spaces/Unicode, missing terminal support, declined Ollama, Ctrl+C/close, duplicate windows, retained output and readiness-confirmed completion. Verify successful install enters TUI in the original terminal, install lock is released before TUI use, TUI exit leaves daemon running, and failure/cancellation never opens TUI. DEF traceability: E20261123c3d71313:S008:FR001 and this story's DEF acceptance criteria apply unchanged.

## 2. Contract details

**Surface level:** internal-shared

### 2.1 `DependencyReport`

```typescript
interface DependencyReport { runtimeReady: boolean; ollama: 'ready' | 'installed-not-running' | 'missing' | 'unavailable'; ollamaInstallOffer?: { id: string; destination: string; version: string }; agents: { claude: boolean; codex: boolean; vibe: boolean }; recommendations: string[]; blockers: string[] }
```

**Parameters:**
- `input: unknown` — Truthful bounded detection report.; untrusted wire input is schema-validated before use.

**Returns:** `DependencyReport` — Truthful bounded detection report.

**Errors:**
- `dependency-probe-failed` when Unreadable path, malformed endpoint/version reply or bounded probe failure.

**Preconditions:**
- Private runtime readiness comes from verified s1 policy, not PATH Node.
- Filesystem/HTTP probe errors must not be silently recast as missing.

**Postconditions:**
- A service-ready result requires a bounded local version response; executable-only is installed-not-running.
- Agent checks detect executables without LLM requests, auth prompts or installation.

### 2.2 `DependencyDecision`

```typescript
interface DependencyDecision { offerId: string; choice: 'install' | 'decline' }
```

**Parameters:**
- `input: unknown` — One exact user decision from the shared terminal script.; untrusted wire input is schema-validated before use.

**Returns:** `DependencyDecision` — One exact user decision from the shared terminal script.

**Errors:**
- `dependency-offer-stale` when Policy, target, destination or existing installation changed.

**Preconditions:**
- Offer binds target/version/digest/destination and whether starting a user-session Ollama process is included.
- No IDE-generated/default-yes consent; stale offers re-prompt.

**Postconditions:**
- Decline changes nothing and retains visible unmet requirement.
- Accept installs only Ollama, never agent CLIs or GPU drivers/system services.

## 3. Data model changes

### 3.1 `Qualified Ollama offer` — new

Private s3 policy selects explicit per-target official payload/version/digest and user-owned destination under the selected installation home. Reuse a healthy existing Ollama binary/service; never overwrite it. Offer text says install and start for this user when that side effect is needed. No models or GPU/system drivers are downloaded implicitly. Proposed boundary: src/installer/dependencies.ts; provider modules are inspected context, not reused for model initialization.


### 3.2 `Platform extraction and readiness` — new

Windows uses a qualified official standalone archive; macOS uses a user-local app/CLI location without global links, quarantine removal or automatic privilege escalation. Linux extracts official tar.zst into a user-owned directory, never running the upstream privileged installer. Bundle a pinned streaming fzstd decoder plus validated tar reader rather than depending on root-installed zstd; qualify the exact large payload/frame window and fail with a concrete limitation if unsupported. Apply byte/path/symlink and free-space limits before publication. Start only an accepted owned Ollama user-session process with logs and a bounded loopback version probe; do not stop another user's/existing service or create system launch services.


### 3.3 `Detection-only coding agents` — new

Resolve claude, codex and vibe through bounded platform executable lookup including Windows executable suffixes. Existence/executability is reported without spawning login/model commands; recommendations are shown when none are found. Permission/lookup diagnostics stay visible and never trigger automatic agent installation. The original terminal handles all prompts; normal daemon/TUI launch remains the foundation owner's responsibility.


## 4. Interaction with shared contracts

| Contract | Role | How |
| :--- | :--- | :--- |
| `sc1` | consumes | Use selected target/private runtime/home; do not select a new delivery mode. |
| `sc2` | consumes | Publish bounded dependency progress through the existing operation; no new install action. |
| `sc3` | consumes | Provide real detection/setup behavior behind foundation-owned report/decision types. |
| `sc6` | consumes | Resolve the same explicit user home; local service probing is not daemon lifecycle. |

## 5. Error paths

**Error cases**

- **Missing or stale consent** (recoverable)
  - Detection: Offer identity no longer matches policy/destination or no terminal decision exists.
  - Response: No side effects; report stale/no consent.
  - User impact: User can re-read the exact offer.
- **Download/extraction/readiness failure** (recoverable)
  - Detection: Digest, archive limits, filesystem write or bounded local-version probe fails.
  - Response: Report dependency unavailable with owned staging/log location; do not mark ready or request elevation.
  - User impact: Installation state remains accurate; no model work starts.
- **Existing endpoint is not Ollama or is unhealthy** (recoverable)
  - Detection: Version response fails shape/identity validation.
  - Response: unavailable, not missing; do not overwrite or replace a running service.
  - User impact: User gets the real probe error.
- **Unsupported user-level platform payload** (recoverable)
  - Detection: Qualification policy lacks this target or decompressor rejects its exact archive.
  - Response: Concrete user-level limitation; no sudo/system installer fallback.
  - User impact: User may install Ollama manually and retry detection.

**Edge cases**

| Input | Expected |
| :--- | :--- |
| Ollama executable exists but service is stopped | Report installed-not-running; a separate explicit start choice is visible. |
| User declines missing Ollama | No install/start; report remains unmet and no success claim for Ollama-dependent functionality. |
| One or several coding agents found | Report them; no install or sign-in action. |

**Invariants to preserve**

- Remain inside s3 boundary; no elevated commands, PID/kill daemon fallback, direct cloud LLM REST, or host v2 daemon mutation. [[c1]]
- Approved HLD shared contracts, terminal-only install and success-to-TUI handoff remain unchanged. [[c2]]
- DEF E20261123c3d71313:S003:FR001 and this story acceptance criteria apply unchanged. [[c3]]

## 6. Test strategy

**Test framework:** `node:test + node:assert/strict; canonical *.test.ts coordinator. Real platform/IDE qualification is recorded separately and not inferred from fakes.`

**Test levels**

- **contract** — Verify truthful report/consent classification and advisory boundaries.
  - Subjects: `missing versus unavailable versus installed-not-running`, `stale/declined consent cannot mutate`, `agent lookup never calls auth/model/install`
- **integration** — Exercise safe user-level extraction and readiness without any LLM.
  - Subjects: `local version endpoint fixtures`, `official payload layout/hostile archive/large frame limits`, `no-elevation and no-global-PATH sentinels`
  - Fixtures: `Disposable home, loopback server and owned process fixtures.`
- **live** — Qualify each offered exact payload on actual platforms without downloading models.
  - Subjects: `private executable version and local serve/version readiness`, `existing Ollama reused`, `decline path remains untouched`

**Acceptance mapping**

| Criterion | Proving tests |
| :--- | :--- |
| `ac1` | `missing-ollama-exact-consent-before-user-install`, `accepted-official-payload-user-only`, `unsupported-route-no-elevation` |
| `ac2` | `existing-healthy-reuse`, `installed-stopped-classification`, `decline-keeps-unmet-state` |
| `ac3` | `zero-one-many-agent-detection`, `no-auth-model-or-agent-install-side-effects` |

## 7. Alternatives considered

### 7.1 a1: Bounded report and exact consent offer — **CHOSEN**

Probe local availability, then bind each side effect to one exact terminal offer.

Produce the existing DependencyReport from filesystem/executable and lightweight local service checks. Missing Ollama produces a version/destination offer; the canonical script returns explicit acceptance or decline.

Install only qualified official payloads into the user's private dependency directory, verify readiness, and keep coding-agent detection advisory.

### 7.2 a2: Persistent dependency task queue

Store dependency setup jobs and replay them across restarts.

Use the same report/decision contracts but persist a queue of detection, download and service-start jobs. Terminal interaction confirms jobs and watches their state.

Queue replay and cancellation require an additional lifecycle separate from the existing installation operation record.

**Rejected because:** A separate dependency scheduler/replay model duplicates foundation state and makes terminal-owned consent harder to reason about.

## 8. References

- **[[c1]]** `doc` `AGENTS.md`
- **[[c2]]** `prior-artifact` `docs/epics/reliable-cross-platform-daemon-installation-lifecycle-E20261123c3d71313/HLD.md`
- **[[c3]]** `prior-artifact` `docs/epics/reliable-cross-platform-daemon-installation-lifecycle-E20261123c3d71313/DEF.md`
- **[[c4]]** `analyze-bundle` `src/agent/providers/ollama.ts`
- **[[c5]]** `analyze-bundle` `src/agent/providers/cli-provider.ts`
- **[[c6]]** `doc` `https://docs.ollama.com/linux`
- **[[c7]]** `doc` `https://docs.ollama.com/windows`
- **[[c8]]** `doc` `https://docs.ollama.com/macos`
- **[[c9]]** `doc` `https://github.com/101arrowz/fzstd`
