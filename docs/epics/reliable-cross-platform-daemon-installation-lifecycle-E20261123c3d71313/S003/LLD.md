<!-- insrc:artifact LLD-c3d71313f34bce71-s3 -->

# LLD: STORY-c3d71313f34bce71-s3 — Guide dependency setup without privilege escalation

## Summary

**Epic:** `reliable-cross-platform-daemon-installation-lifecycle`
**HLD base run:** `wf-1795612799378-x1xqpi`
**HLD effective hash:** `ca69fcdcd2b0...`
**Tracker:** [insors-ai/insrc#245](https://github.com/insors-ai/insrc/issues/245)

S3 checks dependency availability, offers an exact consent-bound live Ollama download, and recommends coding-agent CLIs without installing them. It verifies the official archive during acquisition and validates safe extraction before publication. Subsequent inspection, reconciliation, reuse and service admission use bounded receipt, identity, closure and filesystem metadata checks without rereading installed file contents for hashes. The existing three-second aggregate inspection target remains; the unapproved twenty-second reconciliation proposal is withdrawn.

## Contents

1. [HLD context](#1-hld-context)
2. [Contract details](#2-contract-details)
3. [Data model changes](#3-data-model-changes)
4. [Diagrams](#4-diagrams)
5. [Interaction with shared contracts](#5-interaction-with-shared-contracts)
6. [Error paths](#6-error-paths)
7. [Test strategy](#7-test-strategy)
8. [Alternatives considered](#8-alternatives-considered)
9. [References](#9-references)

## 1. HLD context

> See **HLD-c3d71313f34bce71** § 2. Framework summary

**Rollout phase:** C — dependencies and lifecycle
**Consumes:** `sc1` (Installation and release identity), `sc2` (Manager command and operation state), `sc3` (Dependency report and consent), `sc6` (Local transport and explicit installation home)

**Adjacent scope (owned by other stories — do NOT implement here):**
- `s1`: Own the foundational manifest, controller/operation/consent/hook/transport contracts because every branch already depends on s1. Private implementation covers bootstrap, runtime/payload integrity, bundle preparation/publication, platform lock adapter and atomic install records. Later stories implement lifecycle, checks and hooks behind these contracts. The canonical scripts and interactive installer mode are shared with manual invocation and both IDEs; terminal prompts and durable results are part of this foundation. Include the selected release's installed TUI entry/assets in the payload and default successful interactive installer-to-TUI handoff. The s1 LLD must explicitly reserve ManagerAction.install to the shared terminal bootstrap script and forbid IDE-adapter invocation. DEF traceability: E20261123c3d71313:S001:FR001 and this story's DEF acceptance criteria apply unchanged. Resolve manifest runtime identity through the private live-downloaded runtime store; remove publisher duplication of tools/node and runtime archives, update probes/launchers/inventory validation and preserve digest/target checks. — owns `sc1`, `sc2`, `sc3`, `sc5`, `sc6`, `sc7`
- `s2`: Private dev checkout/branch sync, lockfile installation and native build preparation; returns the same immutable prepared candidate. It does not define a second lifecycle or migration engine. Include the selected release's installed TUI entry/assets in the payload and default successful interactive installer-to-TUI handoff. DEF traceability: E20261123c3d71313:S002:FR001 and this story's DEF acceptance criteria apply unchanged. Build with the identity-bound separately installed Node/npm; omit runtime archives/distributions from prepared dev payloads and share s1 runtime resolution.
- `s4`: Private daemon start/readiness, boot guard integration, shutdown drain/immediate exit and exit-completion launcher wrapper; transport is shared. No delivery sync/build on start and no signal/PID daemon control. DEF traceability: E20261123c3d71313:S004:FR001 and this story's DEF acceptance criteria apply unchanged. — owns `sc4`
- `s5`: Private ordered migration runner, daemon migration-only mode, blocked-state persistence, interrupted-run validation and explicit retry. Hooks alone choose data changes and recovery policy. DEF traceability: E20261123c3d71313:S005:FR001 and this story's DEF acceptance criteria apply unchanged.
- `s6`: Private VS Code native terminal open/focus/launch integration, duplicate-action handling and post-install reconnect. It invokes the shared script and leaves all install prompts/output in that terminal, including after failure. Existing ordinary lifecycle and upgrade-consent UI remains thin. Successful installation automatically enters the installed TUI in that same terminal; the IDE only reconnects/status-checks and does not require a second click. DEF traceability: E20261123c3d71313:S006:FR001 and this story's DEF acceptance criteria apply unchanged.
- `s7`: Private JetBrains native terminal open/focus/launch integration with the same script, stdin/output and post-install readiness behavior as VS Code; no independent wizard or hidden install. Preserve background activation/control and Windows IPC bridge for ordinary daemon operations. Successful installation automatically enters the installed TUI in that same terminal; the IDE only reconnects/status-checks and does not require a second click. DEF traceability: E20261123c3d71313:S007:FR001 and this story's DEF acceptance criteria apply unchanged.
- `s8`: Private isolated VM/runner fixtures, target matrix evidence and release qualification results, including real Windows named-pipe behavior and preservation of host v2 daemon. Terminal-install parity checks cover each IDE and manual invocation, paths with spaces/Unicode, missing terminal support, declined Ollama, Ctrl+C/close, duplicate windows, retained output and readiness-confirmed completion. Verify successful install enters TUI in the original terminal, install lock is released before TUI use, TUI exit leaves daemon running, and failure/cancellation never opens TUI. DEF traceability: E20261123c3d71313:S008:FR001 and this story's DEF acceptance criteria apply unchanged. Verify fresh live dependency acquisition and verified runtime reuse in both modes, application/IDE archives excluding Node/Ollama, decline/offline/digest failure behavior and resolved-runtime launch on each enabled target.

## 2. Contract details

**Surface level:** internal-shared

### 2.1 `DependencyPort`

```typescript
interface DependencyPort { inspect(location: InstallationLocation, context?: DependencyProbeContext): Promise<DependencyReport>; decide(location: InstallationLocation, decision: DependencyDecision, context?: DependencyOperationContext): Promise<DependencyReport>; }
```

**Parameters:**
- `location: InstallationLocation` — Canonical explicit installation home and installation identity; validated against the adapter factory binding.
- `decision: DependencyDecision` — Existing exact offerId with install/decline; accepted only from the manager terminal path.
- `context: DependencyProbeContext | DependencyOperationContext` _(optional)_ — Proposed optional internal TypeScript context. Probe context carries AbortSignal. Mutation context also binds operationId and attempt nonce, a live-owner assertion and bounded progress callback; production acceptance requires it. No controller writer, wire flag or prompt authority is exposed.

**Returns:** `Promise<DependencyReport>` — Existing schema-validated truthful runtime/Ollama/agent report. Missing Ollama is an unmet blocker until a valid service is ready; no agent CLI is ever a blocker.

**Errors:**
- `dependency-offer-stale` when Policy, target, endpoint, destination, existing executable/service or accepted id differs on locked recheck.
- `dependency-blocked` when Required private runtime or Ollama service is not available; diagnostics distinguish missing/stopped/unavailable.
- `dependency-uncertain` when Finite accepted preparation has no confirmed drain or published dependency state is inconsistent; manager retains a blocked operation.
- `cancelled` when Abort at a safe boundary; no subsequent download, publication or service launch is admitted.

**Preconditions:**
- inspect is read-only: no directory creation, downloads, process launch, models, sign-in or global configuration writes. A bounded GET /api/version is the only service probe.
- decide install requires the original manager-held installation mutation and valid internal context. A direct adapter accept without that context fails.
- Shared DependencyReport/DependencyDecision/ManagerRequest JSON schemas and protocol versions remain unchanged. Existing fixture implementations remain source compatible with optional internal parameters.

**Postconditions:**
- Decline performs no mutation, lookup commands or service start and returns the still-unmet report.
- Acceptance recomputes the offer immediately before mutation, then prepares an immutable private payload. No installer may overwrite an existing Ollama installation or replace an already available service.
- Cancellation and EOF propagate to all finite preparation work; only the explicitly consented, recorded long-lived Ollama service is exempt from finite preparation drain after its handoff boundary.
- A private dependency-uncertain failure is preserved as blocked by narrow manager integration; inspect/stop and daemon shutdown behavior are unchanged.
- All read-only inspection, including recorded-attempt reconciliation, shares the existing three-second aggregate deadline and cancellation. Never rehash installed payload files during inspection, reconciliation, reuse or service admission. Validate bounded canonical receipt/inventory metadata, pinned policy/version/target/archive identity, finite-closure/admission bindings and filesystem structure/size/mode/link state. A valid receipt means verified acquisition and closed preparation, not ongoing cryptographic integrity of installed bytes. Expiry/invalid metadata remains unavailable and grants no new mutation.

### 2.2 `DependencyReport`

```typescript
interface DependencyReport { runtimeReady: boolean; ollama: 'ready' | 'installed-not-running' | 'missing' | 'unavailable'; ollamaInstallOffer?: { id: string; destination: string; version: string }; agents: { claude: boolean; codex: boolean; vibe: boolean }; recommendations: string[]; blockers: string[]; }
```

**Parameters:**
- `input: unknown` — Existing sc3 wire input, parsed through the existing installer schema before consumption.

**Returns:** `DependencyReport` — ready requires a bounded successful local Ollama version response. An executable without a reachable service is installed-not-running. No executable and an unoccupied/refused configured endpoint is missing. Permission, timeout, malformed replies, endpoint conflict or configuration errors are unavailable.

**Errors:**
- `dependency-probe-failed` when Bounded filesystem/configuration or loopback response cannot establish state; include concrete diagnostic rather than silently reporting missing.

**Preconditions:**
- runtimeReady uses exact verified control runtime/target provenance from S1/S2, never host PATH node/npm.
- A ready existing service may be reused even when no executable is on PATH. All diagnostic and recommendation lists retain existing schema bounds.

**Postconditions:**
- Only missing, qualified targets with a clean absent private destination receive an offer. Installed-stopped gets an exact quoted manual serve instruction, not an install offer or invented API start action.
- Report recommendations disclose all install/start/model-directory side effects before the terminal consent prompt. No false success after decline.

### 2.3 `productionPeers`

```typescript
productionPeers(target: Target, location: InstallationLocation): ManagerPeers
```

**Parameters:**
- `target: Target` — Publisher-bound target, architecture and baseline.
- `location: InstallationLocation` — Bind dependency policy, paths, endpoint configuration and runtime provenance to this installation.

**Returns:** `ManagerPeers` — Existing bundle/dev adapters plus the production S3 dependency adapter. Lifecycle and migration peers remain absent until their owning stories implement them.

**Errors:**
- `runtime-invalid` when Control runtime is not the exact owned Node distribution for the selected target.

**Preconditions:**
- Factory construction has no install, probe, model initialization or application DB side effects.
- No fixture/no-op lifecycle or migration port is inserted to make a real install appear complete.

**Postconditions:**
- Both located manager-entry and terminal-entry callers receive the same dependency adapter. Packaging bundles the policy/decoder without importing config stores, providers, daemon boot or application DB modules.
- Update the S2 installed-dev composition assertion to expect the real dependency adapter while retaining assertions that S4/S5 capabilities are absent.

### 2.4 `runTerminalInstall`

```typescript
runTerminalInstall(options: TerminalInstallOptions): Promise<TerminalOutcome>
```

**Parameters:**
- `options: TerminalInstallOptions` — Existing terminal streams, manager peers and AbortSignal; report/decision forms stay unchanged.

**Returns:** `Promise<TerminalOutcome>` — Existing outcome semantics and same-terminal TUI handoff remain S1-owned.

**Errors:**
- `dependency-offer-stale` when Locked dependency recheck invalidates the displayed offer; return to explicit terminal consent rather than silently accepting a replacement.

**Preconditions:**
- TTY admission remains mandatory. Only the terminal sends install/decline; IDE and ManagerRequest flags cannot pre-answer it.
- For missing Ollama, the question explicitly reads Install and start Ollama <version> at <destination>? [y/N], with its scoped endpoint/log/model-directory policy shown beforehand.

**Postconditions:**
- Existing stopped Ollama displays manual start guidance with no automatic start/reinstall.
- Thread optional signal into dependency probes; mutation context is supplied only by the lock-owning InstallerManager. Preserve existing post-ready lock release, TUI launch, cancellation and retry behavior.

## 3. Data model changes

### 3.1 `Dependency operation context and integration boundary` — new

Proposed internal-only types live beside DependencyPort in src/installer/peer-contracts.ts. DependencyProbeContext contains optional signal; DependencyOperationContext adds operationId, attemptNonce, assertCurrent():void and progress(stage,detail):void. The manager establishes/persists the preparing intent before accepting dependency side effects, and owns all controller updates. The adapter writes only its private dependency attempt/receipt files. It never receives ControllerStore, a release publication lease or lifecycle/migration authority. The optional API addition preserves fixture callers and all sc3/sc2 wire shapes. On dependency-uncertain the manager retains blocked preparation rather than clearing it; explicit same-operation reconciliation first inspects the recorded dependency attempt without starting a second actor. This is narrow wiring in src/installer/manager.ts, not a new scheduler or replacement lifecycle.

**Call sites:**
- `src/installer/peer-contracts.ts`
- `src/installer/manager.ts`
- `src/installer/terminal-install.ts`

### 3.2 `Immutable qualified Ollama policy and exact offer` — new

Proposed source files: src/installer/dependencies.ts and src/installer/ollama-policy.ts. One shipped policy entry per enabled OS/arch/baseline selects exact version, official immutable URL, SHA256, compressed/expanded byte/file/window limits, validated layout, absolute executable-relative path, endpoint, model/log destinations and whether user-session serve startup is included. Offer identity is SHA256 of canonical policy + installation identity/home + target + normalized destination + endpoint/start/model side effects + observed absence state. Encode as an existing token-safe identifier (at most 128 characters). The report still projects only id/version/destination. Do not download latest metadata during inspect or accept arbitrary user URLs/digests. Recheck the whole offer and filesystem/service state under manager ownership before first mutation and again before publication/start. A policy, target or existing-installation race is stale and requires renewed consent. Nonenabled targets report concrete manual user-level guidance; target is not falsely marked supported.

**Call sites:**
- `src/installer/production-peers.ts`
- `src/installer/contracts.ts`
- `src/installer/terminal-install.ts`

### 3.3 `Detection and service-state table` — new

All read-only inspection, including recorded-attempt reconciliation, shares the existing three-second aggregate deadline and cancellation. Never rehash installed payload files during inspection, reconciliation, reuse or service admission. Validate bounded canonical receipt/inventory metadata, pinned policy/version/target/archive identity, finite-closure/admission bindings and filesystem structure/size/mode/link state. A valid receipt means verified acquisition and closed preparation, not ongoing cryptographic integrity of installed bytes. Expiry/invalid metadata remains unavailable and grants no new mutation. The initial IDE daemon reachability probe remains unchanged. Derive the Ollama endpoint through a narrow read-only configuration seam shared with the selected installation; default is loopback port 11434. Do not change configuration or probe a remote configured host as if it were local. Missing config uses the documented default; malformed, inaccessible or conflicting config is unavailable. Ready endpoint wins over a missing PATH executable and is reused; refused endpoint plus executable is installed-not-running; refused endpoint plus no executable is missing. Other network, permission, malformed-response or policy failures are unavailable, not missing. Enumerate absolute executable candidates via bounded PATH/PATHEXT and known user/macOS app locations. Never invoke claude/codex/vibe, auth, completion, embeddings, model-list or model-pull. Return zero/one/many booleans truthfully; recommend at least one agent if none found and preserve lookup diagnostics.

**Call sites:**
- `src/installer/contracts.ts`
- `src/installer/production-peers.ts`
- `src/installer/terminal-install.ts`

### 3.4 `Private payload, receipt and filesystem ownership` — new

One installation owns zero or more immutable deps/ollama/<version>/<target>/<asset-digest> payloads and at most one accepted finite dependency preparation attempt under its installation lock. Each private attempt references exactly one qualified policy/offer and owns its isolated staging, bounded logs and atomic receipt; receipts never contain application DB data, credentials or a global service definition. Derive all paths below the canonical installation home; validate ancestors, user ownership and link/reparse-point state before writes. Stream exact-byte/digest download; do not reuse the S1 bundle compressed limit blindly because Ollama asset policy may differ. Finite preparation has an explicit 20-minute overall deadline, 30-second readiness deadline, 5-second cleanup deadline and bounded log/output limits; no background task queue or implicit retry. Check cancellation/current-owner before and after awaits and immediately before publication or spawn. Fsync files and bottom-up directories plus source/destination parents using the existing filesystem-only durability helpers and non-replacing native publication. A same-ID existing payload is reusable only after bounded canonical receipt/inventory identity, successful preparation closure and target/layout/metadata verification; conflicting records or unsafe/missing files never overwrite. Installed bytes are not rehashed. Hashing the small canonical inventory record remains permitted to bind existing closure/admission records; this does not read payload contents. Streaming member hashes already recorded while writing may remain for schema compatibility, but no second full-file content verification pass runs after archive acquisition. Failed/cancelled unpublished staging is removed only after its finite admitted actors positively close. Retain uncertain artifacts and block a second mutation; do not infer ownership from PID, age, a free lock or a log line.

**Call sites:**
- `src/installer/durability.ts`
- `src/installer/manager.ts`
- `src/installer/dev-worker.ts`
- `src/installer/download.ts`

### 3.5 `Platform extraction and endpoint compatibility` — new

Proposed source file src/installer/ollama-archive.ts uses in-process bounded parsers. Linux consumes pinned official tar.zst using bundled pinned fzstd streaming decoding plus a validated tar reader; reject unsupported frame windows before decoder allocation and enforce its 2^25-byte backreference limit, input/output/file-count/individual-file limits and cooperative yielding. Qualify exact real archives, not only tiny fixtures. Windows consumes qualified standalone CLI ZIP plus only the required target libraries; never runs OllamaSetup.exe, changes user PATH or registers a service. macOS stages a qualified user-local app/CLI payload and invokes the bundled CLI directly, never the GUI move/global-link flow or quarantine-removal/elevation commands. Preserve exact layouts and executable/library dependencies. Archive member paths reject traversal, absolute/drive/UNC paths, ADS, collisions, device entries and escapes; permit no links in the published tree. If an official layout requires internal symlinks/hardlinks, qualify a two-pass bounded materialization of regular-file targets contained in the same payload (cycle/depth bounds, directory links materialized only with explicitly qualified layout); never create traversable archive links. Otherwise that exact payload remains unsupported with a concrete limitation. Preserve Linux/macOS/Windows scope while distinguishing pending qualification from enabled routes.

**Call sites:**
- `src/installer/production-peers.ts`
- `src/installer/download.ts`
- `src/installer/safe-zip.ts`

### 3.6 `Consented Ollama service handoff and interrupted attempts` — new

The missing-Ollama offer explicitly covers installation plus a user-session serve process with local-only binding, private bounded logs and a model directory under the selected dependency home. Reuse any healthy configured existing service without launching or stopping it. Publish the archive-verified, safely extracted payload and validate its receipt/closure/metadata before recording service-start admission; check cancellation immediately before spawn. Launch only the qualified absolute Ollama executable with an argv array and sanitized explicit environment (including scoped OLLAMA_HOST/OLLAMA_MODELS), no shell/system service/global PATH edits or implicit models. The service is intentionally retained after its recorded handoff, including installer/TUI exit; finite preparation drain must not wait for that long-lived process. Before admission cancellation prevents start; after admission cancellation stops installation progress, preserves truthful installed/unverified state and does not promise rollback or terminate an existing/reused service. Store the admission intent before spawn and outcome/readiness atomically; startup failure/port races never authorize stopping another listener. A healthy /api/version response establishes availability, not cryptographic process ownership. Record whether availability was reused or startup was admitted; do not label an arbitrary listener as owned. After manager death, inspect bounded receipt/inventory metadata, finite closure and endpoint without replaying spawn/download; already ready service is reusable, a stopped published binary gets manual guidance, and unresolved finite actors or an ambiguous in-progress launch remain unavailable/blocked until reconciled. Same-operation recovery must reconcile these facts before ordinary manager continuation, never start a second unconfirmed service. A discarded/failed dependency attempt cannot change selected daemon release or invoke lifecycle/migrations. The exact finite-actor guarantee remains admitted actors, retained owned groups and cooperating descendants; no arbitrary descendant isolation claim.

**Call sites:**
- `src/installer/manager.ts`
- `src/installer/peer-contracts.ts`
- `src/installer/terminal-install.ts`
- `src/installer/production-peers.ts`

### 3.7 `Composition, packaging and verification boundaries` — new

Production composition adds only dependencies to the existing bundle/dev peers. Private proposed helper files are bundled into the same target control artifacts; update required packaging assets only where the chosen decoder/policy requires it. Preserve dependency-free control startup and private-runtime executable provenance; no provider/config-store/application DB import. Entry callers remain src/installer/manager-entry.ts and src/installer/terminal-entry.ts. Existing S1/S2 test assertions expecting dependencies absent are revised narrowly; lifecycle/migrations stay absent, so complete real installer success remains gated on S4/S5. No changes to IDE adapters, daemon IPC, migration hooks or host v2 code. ERD is unnecessary for this small ownership model; the owner/cardinality, links and compatibility are explicit above. Terminal flow remains sequential prose prompts; no new layout warrants a UX mock. Ordered interactions are: read-only inspect -> disclose offer -> terminal decision -> manager lock/current recheck -> private prepare/probe/drain -> durable publication -> consented service admission/readiness -> ordinary S1/S4/S5 continuation -> ready/lock release/TUI. Live dependency delivery follows approved HLD revision7: Ollama is fetched from its exact official asset only on consent, never embedded in insrc/IDE payloads; Node acquisition/runtime-store/package corrections remain S1/S2-owned. This S3 change must not edit their runtime policy/launcher/bundle format.

**Call sites:**
- `src/installer/production-peers.ts`
- `src/installer/manager-entry.ts`
- `src/installer/terminal-entry.ts`
- `src/installer/__tests__/installed-dev-fixture.mjs`

### 3.8 `Installed dependency validation trust boundary` — invariant-change

Use existing verifyPreparedOllama and verifyOllamaTree surfaces. Acquisition streams the compressed archive once through SHA-256 and exact-size verification, rejects mismatch, validates safe bounded extraction, canonical contained member paths, required files and target executable/library headers, and durably publishes only after finite preparation closes. Replace full installed-file hash reads with bounded filesystem metadata checks at staged validation, published reuse, reconciliation and service admission. Preserve no-link/reparse/unsafe-ancestor checks, regular file type, declared size/mode, required layout, inventory bound and record binding checks; header reads remain bounded and are not file hashing. Retain inventory/receipt/closure schema compatibility, including small-record digests. No digest cache, hashing actor/pool, new certificate or automatic repair/re-download is introduced. Same-size post-install byte corruption may no longer be detected by inspection, which is an accepted consequence of the user directive; health/readiness remains separate from ownership and integrity. All three-second inspection work remains cancellation-aware and side-effect-free. Existing Node verification is outside this S3 change.

**Call sites:**
- `src/installer/ollama-layout.ts`
- `src/installer/ollama-prepare.ts`
- `src/installer/ollama-service.ts`
- `src/installer/dependencies.ts`

## 4. Diagrams

- [Sequence diagram](docs/epics/reliable-cross-platform-daemon-installation-lifecycle-E20261123c3d71313/S003/sequence-diagram.html)

## 5. Interaction with shared contracts

| Contract | Role | How |
| :--- | :--- | :--- |
| `sc1` | consumes | Bind the existing target/private runtime and installation home; do not add a delivery mode, select a release, install PATH Node or replace verified runtime policy. |
| `sc2` | consumes | Use existing lock-owning manager preparation and terminal admission. Narrow internal context/progress and blocked dependency evidence preserve its sole controller writer and cancellation boundaries; ordinary lifecycle/inspect/stop behavior is unchanged. |
| `sc3` | consumes | Return existing schema-validated reports and consume exact install/decline decisions. Use opaque offer identity to bind private policy and all side effects. No new report field, install flag, public service-start action or IDE prompt API. |
| `sc6` | consumes | Use resolved explicit installation home and the existing control entrypoints. Ollama loopback HTTP availability probing is separate from daemon IPC; no changes to Unix socket, named pipe or bridge protocol. |

## 6. Error paths

**Error cases**

- **Stale, forged or missing terminal consent** (recoverable)
  - Detection: Recompute the canonical qualified offer and compare id/target/home/destination/endpoint/side effects plus current executable/service observations after manager lock acquisition and immediately before mutation; production acceptance also validates operation context and live owner.
  - Response: Return dependency-offer-stale or capability error before writes/download/spawn. Do not accept a changed offer or ManagerRequest.installOllama as consent.
  - User impact: User sees the exact changed offer and must explicitly accept again.
- **Required runtime or local probe is unavailable** (recoverable)
  - Detection: Verify the selected control runtime provenance and target; bound candidate filesystem lookups and loopback version GET. Track refused versus timeout/permission/malformed/redirect/configuration failures separately.
  - Response: Return runtimeReady false or unavailable with bounded actionable blockers; never turn an unknown failure into missing or an install offer.
  - User impact: Repair the actual private-runtime or endpoint/configuration problem; existing Ollama is preserved.
- **Payload digest, extraction layout or decoder qualification fails** (recoverable)
  - Detection: Count and hash compressed bytes, validate target policy and archive headers/windows, bound expanded members/output and validate each canonical member before write. Verify complete staged inventory/runtime layout before publication.
  - Response: Stop admission and drain finite work, retain diagnostics and reject the payload. Delete only proven-private unpublished staging after confirmed closure; no system installer/decompressor fallback.
  - User impact: User gets the exact target/archive/window limitation and manual user-level guidance; no elevation requested.
- **Destination changed, durable flush failed or same-id payload conflicts** (recoverable)
  - Detection: Revalidate ancestors and absence under manager ownership; use exclusive no-replace publication; compare complete receipt/inventory on existing ids; check file/directory fsync and parent namespace results.
  - Response: Preserve the existing payload and daemon selection. If publication may have occurred, retain private evidence and reconcile its canonical receipt/inventory identity, positive preparation closure, filesystem metadata and successful parent flush before reuse; never overwrite by retry.
  - User impact: No destructive rollback or false success; exact staging/receipt diagnostic is retained.
- **Ctrl+C, terminal EOF, deadline or manager owner loss** (recoverable)
  - Detection: AbortSignal and live-owner assertions are checked around awaits and before side effects; finite owned actors and streams have bounded closure evidence. The service-admission checkpoint distinguishes finite preparation from the accepted long-lived service.
  - Response: Before service admission, cancel finite work and admit no later publication/start. After the recorded service-admission boundary, cancel installer continuation and preserve truthful installed/unverified state; the consented service may remain. Unknown finite closure persists dependency-uncertain/blocked and prevents a duplicate attempt. No PID/age inference or blind restart.
  - User impact: Cancellation outcome and any retained private payload/service/logs are explained. It is not claimed to undo an accepted service start.
- **Service port conflict, startup exit or readiness timeout** (recoverable)
  - Detection: Reprobe immediately before service admission, observe launch/exit errors, and bound the configured loopback version response. A response alone is not proof the newly spawned actor owns the endpoint.
  - Response: Reuse a healthy existing service without stopping it; otherwise report unavailable with bounded logs. Never stop/replace a foreign listener, elevate, or claim ready solely because a child was spawned.
  - User impact: User gets a concrete endpoint/start diagnostic with manual remedy and preserved existing service.
- **Interrupted dependency preparation on a later explicit operation** (recoverable)
  - Detection: Read and validate private attempt/receipt identities and stage under the installation lock; inspect existing payload metadata/required bounded headers and endpoint without content rehashing without replaying download/spawn. Distinguish a completely closed failed attempt, validated published binary, admitted retained service and unresolved finite actors.
  - Response: Reconcile the same operation before ordinary continuation. Reuse validated ready service; show manual guidance for a proven stopped binary; retain blocked state for unknown work/ambiguous launch. No automatic new service, new payload or changed consent.
  - User impact: Retry cannot silently duplicate uncertain work or overwrite a working installation.
- **S4/S5 production peer is still absent** (recoverable)
  - Detection: Existing manager/terminal capability admission detects missing lifecycle/readiness or migration ports after S3 is composed.
  - Response: Keep capability-unavailable; do not install a fixture/no-op peer or fabricate full installation success.
  - User impact: S3 dependency adapter can be independently tested but real complete installation awaits its owning stories.
- **Bounded read-only reconciliation is incomplete or invalid** (recoverable)
  - Detection: The shared three-second aggregate deadline expires, cancellation occurs, or canonical receipt/inventory/closure/target/layout metadata is invalid. No installed-file content hash is computed.
  - Response: Return unavailable/cancelled with a bounded diagnostic, preserve retained evidence and existing uncertainty gates, and admit no automatic download, publication or service start. Do not extend to twenty seconds or introduce deep hashing workers.
  - User impact: Inspection stays bounded and avoids reading multi-GB payloads; genuine record or ownership uncertainty still blocks mutation.

**Edge cases**

| Input | Expected |
| :--- | :--- |
| Working local Ollama service exists but no Ollama binary is found on PATH. | Report ready and reuse the service; do not offer installation or require locating/replacing its executable. |
| Existing Ollama executable is present and the configured loopback endpoint refuses connections. | Report installed-not-running with exact quoted manual serve guidance. No automatic start/reinstall and no fabricated public start decision. |
| Missing Ollama offer is declined, or user answers empty/default N. | No filesystem writes, downloads, service start, agent installation or model work. Return missing plus the visible unmet requirement; preserve incumbent daemon state. |
| Zero, one or multiple coding-agent executables are found, including Windows PATHEXT launchers. | Return exact boolean presence. Zero triggers recommendations. Lookup permission errors stay diagnostic; no CLI is spawned and no agent affects required dependency readiness. |
| Path/home includes spaces or Unicode, existing private payload is present, or CUDA environment is explicitly set (including empty). | Preserve argv boundaries and canonical paths. Reuse only complete valid immutable payload. Preserve explicit inherited CUDA setting; default skip only when absent for any relevant preparation environment. |
| Official archive contains internal library aliases, large zstd frames, or an unqualified architecture. | Only the explicitly qualified bounded materialization/layout is allowed; no published symlink escape. Unsupported frames/layout/target are concrete limitations, not silently enabled or narrowed platform support. |
| Installer is cancelled after the Ollama service was explicitly admitted to remain running. | Show cancellation and retained service/payload state truthfully. Stop installer continuation and TUI handoff; do not silently kill a reused or intentionally retained service. |
| Healthy existing Ollama with a valid 4.01 GB private payload and cold file caches | The aggregate read-only inspection target stays three seconds. Validate bounded receipts/closure/layout metadata and service health without reading or hashing 4.01 GB; payload cache warmth must not determine inspection cost. |
| Cancellation or receipt/inventory identity tampering during bounded reconciliation | Return unavailable/cancelled with positive resource closure and no late success, changed offer, download, publication or spawn. Download digest failures still reject acquisition; same-size installed content changes are not detected by hashing. |

**Invariants to preserve**

- S3 consumes sc1/sc2/sc3/sc6 without changing public schemas, daemon IPC, delivery modes, release selection or IDE prompt ownership. [[c1]]
- Only the original manager lock owner writes controller state. Dependency adapter owns only private dependency staging/receipts; missing/uncertain closure blocks duplicate mutation. Finite ownership guarantee covers admitted actors, retained groups and cooperating descendants only. [[c2]]
- S1 terminal-only install, exact consent, stop bypass of unrelated dependency health, pre-shutdown cancellation, ready/lock-release-before-TUI and post-install failure semantics remain covered. [[c3]]
- No elevation, global PATH/system-service modification, implicit model download, direct cloud REST, provider initialization, agent spawn/auth/install or host v2 lifecycle changes. [[c4]]
- E20261123c3d71313:S003:FR001 and DEF ac1/ac2/ac3 apply unchanged; local fixtures do not certify target-native/VM/IDE support. [[c5]]
- Official archive size/SHA-256 remains mandatory on live download. Installed payload contents are not rehashed during staged second-pass validation, reuse, inspect/reconciliation or service admission; small metadata record digests and bounded target headers remain. No twenty-second inspection phase. [[c90]]

## 7. Test strategy

**Test framework:** `node:test + node:assert/strict with canonical *.test.ts coordinator under verified Node 22; reuse src/installer/__tests__ fixture conventions. Run only surrounding tests per task, then one combined S1/S2/S3 installer regression after all tasks. No unrelated backend sweep or host daemon/Ollama mutation.`

**Test levels**

- **contract** — Prove truthful reporting and unchanged public wire semantics at consent boundaries.
  - Subjects: `dependency-state-matrix-distinguishes-ready-stopped-missing-and-unavailable`, `healthy-service-without-path-binary-is-reused`, `inspect-and-decline-have-zero-mutation-or-process-side-effects`, `stale-forged-and-cross-home-offers-reject-before-mutation`, `stopped-existing-ollama-has-manual-guidance-without-start-action`, `agent-zero-one-many-detection-never-spawns-auth-model-or-install`, `private-runtime-provenance-rejects-path-node-and-wrong-target`
  - Fixtures: `Disposable home and configuration, absolute executable/PATHEXT lookup fixtures, loopback refused/slow/malformed/redirect/version endpoints and write/spawn sentinels.`
- **integration** — Exercise the accepted private payload, finite actor and intentional service-handoff paths with controlled peers and no models.
  - Subjects: `accepted-official-payload-is-user-only-and-discloses-install-and-start`, `consent-races-on-policy-destination-and-endpoint-never-overwrite-existing-state`, `hostile-archive-and-large-zstd-window-fail-before-unsafe-write-or-allocation`, `internal-archive-links-materialize-only-qualified-contained-files`, `download-size-digest-layout-and-fsync-failures-never-report-ready`, `cancellation-and-eof-block-later-publication-or-service-admission`, `finite-actor-closure-uncertainty-blocks-retry-and-cleanup`, `service-admission-is-durable-and-distinct-from-finite-preparation-drain`, `interrupted-attempt-reconciles-existing-receipt-without-duplicate-download-or-spawn`, `owned-service-start-port-conflict-and-readiness-failure-preserve-existing-listener`, `production-dependencies-compose-with-real-delivery-and-no-fake-s4-s5`, `terminal-manager-dependency-context-preserves-stop-and-cancellation-regressions`, `inspection-and-reconciliation-share-three-second-bound-without-payload-hashing`, `receipt-closure-and-layout-errors-block-reuse-without-content-rehash`, `same-size-installed-content-change-does-not-trigger-digest-reverification`, `archive-digest-mismatch-still-rejects-live-acquisition`, `reuse-and-service-admission-never-rehash-installed-files`
  - Fixtures: `Tiny exact-hash ZIP/tar.zst payloads, qualified internal-alias layouts, malformed frame headers/stream truncation/output bombs, injected fsync/no-replace failures, controlled executable and loopback server with argv/env/log capture.`, `Manager/terminal fixtures with real S1/S2 control/store/download helpers and explicit S4/S5 fixture peers only in tests. Actor admission/close/disposal and retained-service checkpoint evidence.`, `Payload content-read/hash sentinel covering inspection, reconciliation, same-ID reuse and service admission; bounded metadata/target-header reads allowed. Same-size changed installed bytes demonstrate no hash revalidation; receipt/closure/link/size/layout tampering still fails. Slow metadata/HTTP and abort/late-settlement sentinels exercise the single aggregate deadline.`
- **live** — Qualify each offered exact official payload/layout/version on its native target before enabling its auto-install route, without models or elevation.
  - Subjects: `qualified-exact-ollama-payload-version-and-user-session-readiness-on-enabled-target`, `existing-installation-reuse-and-decline-preserve-platform-state`, `official-large-archive-streaming-and-library-layout-match-policy`, `native-large-payload-inspection-avoids-content-reads-within-three-seconds`
  - Fixtures: `Linux ARM64 OrbStack disposable VM as the first Linux route; native Linux x64 runner or explicitly recorded translation plus native follow-up.`, `Existing macOS ARM64 UTM disposable guest; separate macOS x64 and Windows ARM64/x64 runners/guests when available. Unavailable targets remain pending, with no fake passed evidence.`, `Per-target receipt recording official URL/hash/bytes/version, native/translated status, archive limits, executable/library probe, no-elevation sentinels, endpoint readiness and cleanup/service intent.`, `Native large-payload inspection records total time and payload read behavior, with cold/warm owned-file cache conditions if available. No global cache drop, host mutation or model work. Historical cold full-hash failure remains evidence of the removed behavior, not a current pass.`
- **smoke** — Complete one coherent installer regression after all S3 tasks, preserving S1/S2 functionality and qualification honesty.
  - Subjects: `combined-s1-s2-s3-installer-regression-has-exact-coverage-and-confirmed-cleanup`, `published-control-payload-includes-real-dependency-adapter-without-application-boot-imports`, `terminal-install-upgrade-consent-and-ready-before-tui-regressions`
  - Fixtures: `Canonical coordinator build, current source/output fingerprints, exact selected file list, admission/close/disposal journals and scoped report audit. A fixture pass never qualifies real target support.`

**Acceptance mapping**

| Criterion | Proving tests |
| :--- | :--- |
| `ac1` | `stale-forged-and-cross-home-offers-reject-before-mutation`, `accepted-official-payload-is-user-only-and-discloses-install-and-start`, `consent-races-on-policy-destination-and-endpoint-never-overwrite-existing-state`, `hostile-archive-and-large-zstd-window-fail-before-unsafe-write-or-allocation`, `qualified-exact-ollama-payload-version-and-user-session-readiness-on-enabled-target` |
| `ac2` | `dependency-state-matrix-distinguishes-ready-stopped-missing-and-unavailable`, `healthy-service-without-path-binary-is-reused`, `inspect-and-decline-have-zero-mutation-or-process-side-effects`, `stopped-existing-ollama-has-manual-guidance-without-start-action`, `download-size-digest-layout-and-fsync-failures-never-report-ready`, `cancellation-and-eof-block-later-publication-or-service-admission`, `interrupted-attempt-reconciles-existing-receipt-without-duplicate-download-or-spawn`, `inspection-and-reconciliation-share-three-second-bound-without-payload-hashing`, `receipt-closure-and-layout-errors-block-reuse-without-content-rehash`, `native-large-payload-inspection-avoids-content-reads-within-three-seconds`, `same-size-installed-content-change-does-not-trigger-digest-reverification`, `archive-digest-mismatch-still-rejects-live-acquisition`, `reuse-and-service-admission-never-rehash-installed-files` |
| `ac3` | `agent-zero-one-many-detection-never-spawns-auth-model-or-install`, `inspect-and-decline-have-zero-mutation-or-process-side-effects` |

## 8. Alternatives considered

### 8.1 a1: Existing receipts with metadata-only installed validation — **CHOSEN**

Verify the downloaded archive once; retain existing receipts and closure bindings without rehashing installed bytes.

Keep DependencyPort and existing attempt/inventory/receipt/service records. Live acquisition checks the exact compressed archive digest and size; safe extraction validates bounds, contained paths and target layout. Installed reuse, reconciliation and service admission validate bounded record identities, closure/admission bindings and filesystem metadata/required headers, with no full-file content digest or multi-GB read. Retain the existing three-second aggregate inspection target and cancellation behavior. No new wire fields or trust cache.

### 8.2 a2: Read only health and a new consolidated preparation certificate

Introduce a new compact certificate to replace current inventory/receipt reconciliation.

Keep public dependency wire contracts, but add a new private versioned preparation certificate containing the pinned archive identity and closed attempt/service state. Inspection uses that certificate plus endpoint health and no payload hashing; existing records require explicit conversion/compatibility handling before use.

**Rejected because:** Can satisfy contracts but adds unnecessary certificate compatibility and durability work.

## 9. References

- **[[c1]]** `prior-artifact` `docs/epics/reliable-cross-platform-daemon-installation-lifecycle-E20261123c3d71313/HLD.md`
- **[[c2]]** `prior-artifact` `docs/epics/reliable-cross-platform-daemon-installation-lifecycle-E20261123c3d71313/S002/LLD.md`
- **[[c3]]** `prior-artifact` `docs/epics/reliable-cross-platform-daemon-installation-lifecycle-E20261123c3d71313/S001/LLD.md`
- **[[c4]]** `doc` `AGENTS.md`
- **[[c5]]** `prior-artifact` `docs/epics/reliable-cross-platform-daemon-installation-lifecycle-E20261123c3d71313/DEF.md`
- **[[c6]]** `analyze-bundle` `src/installer` — "Completed six-probe insrc_analyze_step; relationship coverage incomplete and manually verified at actual entry/manager/terminal files."
- **[[c7]]** `code` `src/installer/peer-contracts.ts`
- **[[c8]]** `code` `src/installer/production-peers.ts`
- **[[c9]]** `code` `src/installer/manager.ts`
- **[[c10]]** `code` `src/installer/terminal-install.ts`
- **[[c11]]** `code` `src/installer/contracts.ts`
- **[[c12]]** `doc` `https://docs.ollama.com/linux`
- **[[c13]]** `doc` `https://docs.ollama.com/windows`
- **[[c14]]** `doc` `https://docs.ollama.com/macos`
- **[[c15]]** `doc` `https://github.com/101arrowz/fzstd`
- **[[c16]]** `stakeholder` `User: continue after S2 completed with override; workflow lifecycle fixes are being handled in v2.`
- **[[c17]]** `prior-artifact` `docs/plans/s2-dev-preparation-validation-2026-11-24.md`
- **[[c18]]** `doc` `docs/plans/s3-ollama-native-qualification-2026-11-25/README.md` — "Native official ARM64 payload materialized to 4,005,889,908 bytes. Complete verification measured 4.33/4.13 seconds; warm fresh inspection passed at 2.10 seconds, while cold-cache fresh inspection exc"
- **[[c90]]** `stakeholder` `User correction, 2026-11-25: the second installed-file hashing check is redundant. Keep download verification; remove repeated installed-content hashing.`
- **[[c91]]** `analyze-bundle` `src/installer/ollama-prepare.ts` — "Narrow insrc_analyze_step preparation profile and verifier usage graph; incomplete call graph supplemented with direct reads of layout/preparation/service/dependencies."
- **[[c92]]** `prior-artifact` `docs/epics/reliable-cross-platform-daemon-installation-lifecycle-E20261123c3d71313/HLD.md` — "Approved revision7: live Node/Ollama delivery, runtime referenced outside payloads, existing three-second inspection target."

## Citations

- **[[c1]]** `prior-artifact` `docs/epics/reliable-cross-platform-daemon-installation-lifecycle-E20261123c3d71313/HLD.md`
- **[[c2]]** `prior-artifact` `docs/epics/reliable-cross-platform-daemon-installation-lifecycle-E20261123c3d71313/S002/LLD.md`
- **[[c3]]** `prior-artifact` `docs/epics/reliable-cross-platform-daemon-installation-lifecycle-E20261123c3d71313/S001/LLD.md`
- **[[c4]]** `doc` `AGENTS.md`
- **[[c5]]** `prior-artifact` `docs/epics/reliable-cross-platform-daemon-installation-lifecycle-E20261123c3d71313/DEF.md`
- **[[c6]]** `analyze-bundle` `src/installer` — "Completed six-probe insrc_analyze_step; relationship coverage incomplete and manually verified at actual entry/manager/terminal files."
- **[[c7]]** `code` `src/installer/peer-contracts.ts`
- **[[c8]]** `code` `src/installer/production-peers.ts`
- **[[c9]]** `code` `src/installer/manager.ts`
- **[[c10]]** `code` `src/installer/terminal-install.ts`
- **[[c11]]** `code` `src/installer/contracts.ts`
- **[[c12]]** `doc` `https://docs.ollama.com/linux`
- **[[c13]]** `doc` `https://docs.ollama.com/windows`
- **[[c14]]** `doc` `https://docs.ollama.com/macos`
- **[[c15]]** `doc` `https://github.com/101arrowz/fzstd`
- **[[c16]]** `stakeholder` `User: continue after S2 completed with override; workflow lifecycle fixes are being handled in v2.`
- **[[c17]]** `prior-artifact` `docs/plans/s2-dev-preparation-validation-2026-11-24.md`
- **[[c18]]** `doc` `docs/plans/s3-ollama-native-qualification-2026-11-25/README.md` — "Native official ARM64 payload materialized to 4,005,889,908 bytes. Complete verification measured 4.33/4.13 seconds; warm fresh inspection passed at 2.10 seconds, while cold-cache fresh inspection exc"
- **[[c90]]** `stakeholder` `User correction, 2026-11-25: the second installed-file hashing check is redundant. Keep download verification; remove repeated installed-content hashing.`
- **[[c91]]** `analyze-bundle` `src/installer/ollama-prepare.ts` — "Narrow insrc_analyze_step preparation profile and verifier usage graph; incomplete call graph supplemented with direct reads of layout/preparation/service/dependencies."
- **[[c92]]** `prior-artifact` `docs/epics/reliable-cross-platform-daemon-installation-lifecycle-E20261123c3d71313/HLD.md` — "Approved revision7: live Node/Ollama delivery, runtime referenced outside payloads, existing three-second inspection target."
