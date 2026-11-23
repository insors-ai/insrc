<!-- insrc:artifact LLD-c3d71313f34bce71-s2 -->

# LLD: STORY-c3d71313f34bce71-s2 — Install and upgrade development checkouts

## Summary

**Epic:** `reliable-cross-platform-daemon-installation-lifecycle`
**HLD base run:** `wf-1795445383474-itgkv3`
**HLD effective hash:** `77bfb88eed6d...`

Developers can prepare a selected repository and branch as a new immutable installation candidate using private Node and npm. Dirty source and failed builds leave the active installation intact. The shared installer still owns activation, terminal prompts and the TUI handoff.

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

**Rollout phase:** B — dev preparation
**Consumes:** `sc1` (Installation and release identity), `sc2` (Manager command and operation state), `sc3` (Dependency report and consent), `sc5` (Ordered upgrade hook delegation), `sc6` (Local transport and explicit installation home)

**Adjacent scope (owned by other stories — do NOT implement here):**
- `s1`: Own the foundational manifest, controller/operation/consent/hook/transport contracts because every branch already depends on s1. Private implementation covers bootstrap, runtime/payload integrity, bundle preparation/publication, platform lock adapter and atomic install records. Later stories implement lifecycle, checks and hooks behind these contracts. The canonical scripts and interactive installer mode are shared with manual invocation and both IDEs; terminal prompts and durable results are part of this foundation. Include the selected release's installed TUI entry/assets in the payload and default successful interactive installer-to-TUI handoff. The s1 LLD must explicitly reserve ManagerAction.install to the shared terminal bootstrap script and forbid IDE-adapter invocation. DEF traceability: E20261123c3d71313:S001:FR001 and this story's DEF acceptance criteria apply unchanged. — owns `sc1`, `sc2`, `sc3`, `sc5`, `sc6`, `sc7`
- `s3`: Private platform dependency detection, user-level Ollama installation and agent CLI recommendations. It implements foundational reports/consent and never auto-installs agent CLIs. DEF traceability: E20261123c3d71313:S003:FR001 and this story's DEF acceptance criteria apply unchanged.
- `s4`: Private daemon start/readiness, boot guard integration, shutdown drain/immediate exit and exit-completion launcher wrapper; transport is shared. No delivery sync/build on start and no signal/PID daemon control. DEF traceability: E20261123c3d71313:S004:FR001 and this story's DEF acceptance criteria apply unchanged. — owns `sc4`
- `s5`: Private ordered migration runner, daemon migration-only mode, blocked-state persistence, interrupted-run validation and explicit retry. Hooks alone choose data changes and recovery policy. DEF traceability: E20261123c3d71313:S005:FR001 and this story's DEF acceptance criteria apply unchanged.
- `s6`: Private VS Code native terminal open/focus/launch integration, duplicate-action handling and post-install reconnect. It invokes the shared script and leaves all install prompts/output in that terminal, including after failure. Existing ordinary lifecycle and upgrade-consent UI remains thin. Successful installation automatically enters the installed TUI in that same terminal; the IDE only reconnects/status-checks and does not require a second click. DEF traceability: E20261123c3d71313:S006:FR001 and this story's DEF acceptance criteria apply unchanged.
- `s7`: Private JetBrains native terminal open/focus/launch integration with the same script, stdin/output and post-install readiness behavior as VS Code; no independent wizard or hidden install. Preserve background activation/control and Windows IPC bridge for ordinary daemon operations. Successful installation automatically enters the installed TUI in that same terminal; the IDE only reconnects/status-checks and does not require a second click. DEF traceability: E20261123c3d71313:S007:FR001 and this story's DEF acceptance criteria apply unchanged.
- `s8`: Private isolated VM/runner fixtures, target matrix evidence and release qualification results, including real Windows named-pipe behavior and preservation of host v2 daemon. Terminal-install parity checks cover each IDE and manual invocation, paths with spaces/Unicode, missing terminal support, declined Ollama, Ctrl+C/close, duplicate windows, retained output and readiness-confirmed completion. Verify successful install enters TUI in the original terminal, install lock is released before TUI use, TUI exit leaves daemon running, and failure/cancellation never opens TUI. DEF traceability: E20261123c3d71313:S008:FR001 and this story's DEF acceptance criteria apply unchanged.

## 2. Contract details

**Surface level:** internal-shared

### 2.1 `Delivery`

```typescript
type Delivery = { mode: 'bundle'; repository: string; channel: string } | { mode: 'dev'; repository: string; branch: string };
```

**Parameters:**
- `input: unknown` — Validated configured development source.; untrusted wire input is schema-validated before use.

**Returns:** `Delivery` — Validated configured development source.

**Errors:**
- `source-invalid` when Invalid repository/ref or unavailable exact branch.

**Preconditions:**
- Dev mode explicitly chosen; validate repository scheme/path and branch with Git ref rules.
- No option-like repository/ref arguments, credential logging or shell interpolation.

**Postconditions:**
- Resolve configured branch once; persist exact commit before build.
- No implicit default branch or bundle fallback.

### 2.2 `ReleaseManifest`

```typescript
interface ReleaseManifest { schemaVersion: 1; releaseId: string; sourceCommit: string; target: Target; runtime: RuntimeIdentity; payloadSha256: string; daemonEntry: string; managerEntry: string; tuiEntry: string; protocolVersion: 1; compatiblePredecessors: string[]; migrations: HookReference[] }
```

**Parameters:**
- `input: unknown` — Immutable prepared dev candidate with common target/runtime identity.; untrusted wire input is schema-validated before use.

**Returns:** `ReleaseManifest` — Immutable prepared dev candidate with common target/runtime identity.

**Preconditions:**
- Private Node 22.22.1/matching npm verified; required compiler/native prerequisites available without elevation.

**Postconditions:**
- Source commit and compiled/dependency inventory digest bind the candidate.
- Common controller receives preparation result; s2 never stops daemon, runs migrations or starts TUI independently.

### 2.3 `ManagerRequest`

```typescript
interface ManagerRequest { protocolVersion: 1; operationId: string; action: ManagerAction; installationId: string; shutdownMode?: 'graceful' | 'immediate'; acceptedOfferId?: string; installOllama?: boolean }
```

**Parameters:**
- `input: unknown` — Existing manager selection of dev preparation, not a second install protocol.; untrusted wire input is schema-validated before use.

**Returns:** `ManagerRequest` — Existing manager selection of dev preparation, not a second install protocol.

**Preconditions:**
- Terminal-only install remains enforced by s1; upgrade binds exact accepted offer.

**Postconditions:**
- Reuse foundation state/locks/errors; no new IDE-facing install path.
- Missing sibling execution capability is explicit before disruption.

## 3. Data model changes

### 3.1 `Development preparation record` — new

New private s2 record binds operation id, configured repository/branch, once-resolved commit, private runtime and staging root. Fetch configured refs/heads/<branch> into a new operation-owned repository and checkout detached at FETCH_HEAD. Verify remote/source identity and avoid changing global Git settings or user credentials. Git subprocesses use argument arrays, bounded output/deadlines and disabled repository hooks/fsmonitor where untrusted preparation could trigger them. Proposed implementation boundary: src/installer/dev.ts; existing build coordinator is inspected input, not an instruction to rewrite it.


### 3.2 `Source preservation and build result` — new

Detect dirty/conflicting managed source before upgrade and refuse with an actionable message; never reset/clean user trees. Build only the isolated checkout using its lockfile and absolute private Node/npm; optional native dependencies are retained. Set ONNXRUNTIME_NODE_INSTALL_CUDA=skip only when absent, preserving and recording an explicit inherited value. Run the repository's documented build through the existing coordinator, capture source/build fingerprints and copy only validated runtime dependency closure. Untrusted dev source executes only after explicit source selection; no elevated install of Git/compiler/system libraries.


### 3.3 `Prepared dev payload` — new

Canonical inventory digest identifies the prepared dev payload; payloadSha256 denotes this immutable inventory digest in dev mode, while the bundle adapter owns archive-digest semantics. Mode/sourceCommit/target remain explicit. Candidate files are operation-owned until validation/publish; common s1 controller owns atomic selection and subsequent sibling handoff. Failed prepare cleans only its own staging and never changes running/stopped intent. Installed TUI/assets remain part of the selected payload.


## 4. Interaction with shared contracts

| Contract | Role | How |
| :--- | :--- | :--- |
| `sc1` | consumes | Validate and return common prepared identity; never change delivery mode implicitly. |
| `sc2` | consumes | Use foundation operation/lock/candidate admission; install remains script-only. |
| `sc3` | consumes | Consume prerequisite/dependency result; do not implement detection/install. |
| `sc5` | consumes | Carry ordered hook references unchanged; execution belongs to s5. |
| `sc6` | consumes | Use explicit shared home/target/endpoint resolution. |

## 5. Error paths

**Error cases**

- **Dirty/conflicting managed source** (recoverable)
  - Detection: Git status/conflict markers and configured source identity fail preflight.
  - Response: source-dirty; refuse before disruption without reset/clean.
  - User impact: User keeps all changes.
- **Fetch/auth/ref failure** (recoverable)
  - Detection: Git exit/deadline and exact ref validation fail.
  - Response: source-fetch-failed with redacted diagnostics; discard only owned staging.
  - User impact: Active release remains usable.
- **Private toolchain/native build failure** (recoverable)
  - Detection: Verified executable identity, npm/build exit or inventory probes fail.
  - Response: source-build-failed; no candidate activation or source-mode switch.
  - User impact: Install/upgrade is not falsely successful.
- **Source moved during preparation** (recoverable)
  - Detection: Recorded fetched commit differs from later branch observations.
  - Response: Continue only the already accepted exact commit, or require a new offer for a new candidate.
  - User impact: No silent revision substitution.

**Edge cases**

| Input | Expected |
| :--- | :--- |
| Remote branch advances after fetch | Build the recorded commit; next check may offer another commit. |
| Repository/branch/home contains spaces or Unicode | Argument arrays and validated ref/path handling preserve identity. |
| Explicit CUDA install env value exists | Preserve it; set skip only when absent and record effective value. |

**Invariants to preserve**

- Remain inside s2 boundary; no elevated commands, PID/kill daemon fallback, direct cloud LLM REST, or host v2 daemon mutation. [[c1]]
- Approved HLD shared contracts, terminal-only install and success-to-TUI handoff remain unchanged. [[c2]]
- DEF E20261123c3d71313:S002:FR001 and this story acceptance criteria apply unchanged. [[c3]]

## 6. Test strategy

**Test framework:** `node:test + node:assert/strict; canonical *.test.ts coordinator. Real platform/IDE qualification is recorded separately and not inferred from fakes.`

**Test levels**

- **integration** — Prove source preservation and exact private build behavior with local Git remotes and process fixtures.
  - Subjects: `branch movement/dirty checkout/auth errors`, `wrong/no host Node and npm`, `build failure leaves incumbent unchanged`
  - Fixtures: `Two local repositories and operation-owned temp homes; no real daemon socket.`
- **contract** — Verify identical prepared-candidate contracts and terminal ownership.
  - Subjects: `mode/source/runtime/inventory identity`, `missing sibling capabilities fail explicitly`, `shared script success-to-TUI path is consumed, not reimplemented`

**Acceptance mapping**

| Criterion | Proving tests |
| :--- | :--- |
| `ac1` | `dev-private-runtime-and-target-build`, `missing-prerequisite-no-elevation`, `selected-repo-branch-exact-commit` |
| `ac2` | `branch-movement-pinned-candidate`, `unrelated-branch-never-selected`, `dev-mode-survives-common-activation` |
| `ac3` | `dirty-and-conflicting-source-preserved`, `npm/build/fetch-failure-incumbent-unchanged` |

## 7. Alternatives considered

### 7.1 a1: Isolated exact-commit checkout — **CHOSEN**

Prepare a fresh operation-owned checkout and publish an immutable built candidate.

Fetch only the configured branch into an isolated preparation root, resolve FETCH_HEAD once and build that exact commit. The selected installed checkout and user changes are never reset.

Return the same validated candidate manifest as bundle preparation; common controller, lifecycle, migration and terminal behavior stays with its owner.

### 7.2 a2: Shared bare cache and linked worktrees

Cache Git objects and prepare operation-specific worktrees.

Keep a controlled bare repository per configured source and allocate a separate detached worktree at the fetched commit. Build outputs remain candidate-local.

Common candidate contracts remain unchanged, but cache lock, worktree cleanup and repository ownership become extra internal state.

**Rejected because:** Shared object caching is optional optimization; its ownership and cleanup states add complexity without improving correctness.

## 8. References

- **[[c1]]** `doc` `AGENTS.md`
- **[[c2]]** `prior-artifact` `docs/epics/reliable-cross-platform-daemon-installation-lifecycle-E20261123c3d71313/HLD.md`
- **[[c3]]** `prior-artifact` `docs/epics/reliable-cross-platform-daemon-installation-lifecycle-E20261123c3d71313/DEF.md`
- **[[c4]]** `analyze-bundle` `scripts/test-harness/build.mjs`
- **[[c5]]** `analyze-bundle` `copy-assets.mjs`
- **[[c6]]** `code` `.npmrc`
