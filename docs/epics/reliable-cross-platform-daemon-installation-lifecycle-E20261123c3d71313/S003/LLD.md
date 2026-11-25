<!-- insrc:artifact LLD-c3d71313f34bce71-s3 -->

# LLD: STORY-c3d71313f34bce71-s3 — Guide dependency setup without privilege escalation

## Summary

**Epic:** `reliable-cross-platform-daemon-installation-lifecycle`
**HLD base run:** `wf-1795612799378-x1xqpi`
**HLD effective hash:** `ca69fcdcd2b0...`
**Tracker:** [insors-ai/insrc#245](https://github.com/insors-ai/insrc/issues/245)

S3 provides consent-bound live Ollama setup and read-only dependency checks. Following manual review, an interrupted install requires explicit Retry: complete safe owned cleanup, retire the old operation, then run a fresh install; this policy never applies to updates. Durable accepted policy/descriptor data, complete late disposal, retained-service reporting and verified ZIP descriptor continuity close recovery gaps, with stronger tests and observed native provenance.

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
- Decline performs no dependency context/attempt-record creation, filesystem mutation, download, command execution or service start. Ordinary manager bookkeeping is separate and a certain decline never becomes an uncertain dependency installation.
- Acceptance recomputes the offer immediately before mutation, then prepares an immutable private payload. No installer may overwrite an existing Ollama installation or replace an already available service.
- Cancellation and EOF propagate to all finite preparation work; only the explicitly consented, recorded long-lived Ollama service is exempt from finite preparation drain after its handoff boundary.
- A private dependency-uncertain failure is preserved as blocked by narrow manager integration; inspect/stop and daemon shutdown behavior are unchanged.
- All read-only inspection, including recorded-attempt reconciliation, shares the existing three-second aggregate deadline and cancellation. Never rehash installed payload files during inspection, reconciliation, reuse or service admission. Validate bounded canonical receipt/inventory metadata, pinned policy/version/target/archive identity, finite-closure/admission bindings and filesystem structure/size/mode/link state. A valid receipt means verified acquisition and closed preparation, not ongoing cryptographic integrity of installed bytes. Expiry/invalid metadata remains unavailable and grants no new mutation.
- Historical reconciliation uses the exact persisted accepted policy rather than the current catalog. Inspection is read-only and never cleans attempts. Install-only explicit Retry cleans owned interrupted preparation before a fresh ordinary install; update/migration recovery does not enter this path.

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
- Thread signal, EOF, SIGINT, SIGHUP and SIGTERM through cooperative finite abort/drain. Preserve lock release/TUI handoff. Explicit Retry completes owned cleanup before invoking ordinary installation with a fresh operation and current consent; no partial-candidate resume.
- For interrupted install show operation identity and Retry install? [y/N]. Only affirmative terminal input authorizes cleanup; no automatic cleanup or separate Discard UX. Original upgrade intent, selected daemon release, shutdown or daemon migration/activation admission never enters S3 cleanup. Existing non-install same-candidate/hook recovery remains.

### 2.5 `InstallerManager`

```typescript
InstallerManager.retryInstall(admission: TerminalAdmission, interruptedOperationId: string, signal?: AbortSignal): Promise<void>
```

**Parameters:**
- `admission: TerminalAdmission` — Existing terminal capability after explicit Retry input; never an IDE flag or public ManagerRequest action.
- `interruptedOperationId: string` — Exact original install whose owned preparation must be cleaned.
- `signal: AbortSignal` _(optional)_ — Bound cleanup; cancellation prevents fresh install.

**Returns:** `Promise<void>` — Cleanup completed and old operation durably retired. Terminal then invokes ordinary install with fresh identity; this method never installs or resumes the partial candidate.

**Errors:**
- `phase-conflict` when Original intent is not install, active release exists, operation differs or recovery belongs to later lifecycle/migration.
- `dependency-uncertain` when Actor, accepted policy, namespace, publication or cleanup completion cannot be proven.
- `cancelled` when Cleanup aborted; no new installation admitted.

**Preconditions:**
- Acquire existing installation lock, verify exact canonical home/id and durable intent.action=install, preparing interruption, no selected daemon release and no shutdown/migration/activation admission. Reconcile dependency service admission separately without replay/deletion.
- Only S3-owned preparation can be cleaned. Another delivery/lifecycle/hook owner's unresolved work blocks; do not invent general uninstall/reset or S2 cleanup policy.
- Require positive finite closure, or precisely qualified in-process-only proof: bound immutable actor record with externalActors=0; same anchored non-inherited native lock acquired before admission, held through all admitted async work/disposal, no external actors; reacquire and retain that lock throughout cleanup. PID/age, health or a generic free lock is insufficient.

**Postconditions:**
- Bounded durable cleanup plan and per-item completions survive death and make repeated explicit Retry idempotent. No new install/download/extract/publish/spawn/lifecycle operation until cleanup succeeds.
- Remove only proven-owned temporary stages, archives and temp records; preserve bounded historical diagnostics, intentional services/models/logs and valid installed dependency payloads. Unknown/foreign evidence remains blocked. Unadmitted partial publication requires exact ownership and finite closure before removal.
- Retire old operation only after cleanup completion. Terminal uses a fresh operation/attempt and normal inspection/offer/consent; no old consent authorizes changed policy or release.
- Original action=upgrade is rejected before cleanup writes. Updates retain existing same-candidate/hook recovery; no update reset.

## 3. Data model changes

### 3.1 `Dependency operation context and integration boundary` — new

Proposed internal-only types live beside DependencyPort in src/installer/peer-contracts.ts. DependencyProbeContext contains optional signal; DependencyOperationContext adds operationId, attemptNonce, assertCurrent():void and progress(stage,detail):void. The manager establishes/persists the preparing intent before accepting dependency side effects, and owns all controller updates. The adapter writes only its private dependency attempt/receipt files. It never receives ControllerStore, a release publication lease or lifecycle/migration authority. The optional API addition preserves fixture callers and all sc3/sc2 wire shapes. On dependency-uncertain the manager retains blocked preparation rather than clearing it; explicit same-operation reconciliation first inspects the recorded dependency attempt without starting a second actor. This is narrow wiring in src/installer/manager.ts, not a new scheduler or replacement lifecycle. Create dependency mutation context/attempt only for choice=install, never decline. Internal terminal retry consumes existing controller/terminal ownership; no new public action.

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

One installation owns zero or more immutable deps/ollama/<version>/<target>/<asset-digest> payloads and at most one accepted finite dependency preparation attempt under its installation lock. Each private attempt references exactly one qualified policy/offer and owns its isolated staging, bounded logs and atomic receipt; receipts never contain application DB data, credentials or a global service definition. Derive all paths below the canonical installation home; validate ancestors, user ownership and link/reparse-point state before writes. Stream exact-byte/digest download; do not reuse the S1 bundle compressed limit blindly because Ollama asset policy may differ. Finite preparation has an explicit 20-minute overall deadline, 30-second readiness deadline, 5-second cleanup deadline and bounded log/output limits; no background task queue or implicit retry. Check cancellation/current-owner before and after awaits and immediately before publication or spawn. Fsync files and bottom-up directories plus source/destination parents using the existing filesystem-only durability helpers and non-replacing native publication. A same-ID existing payload is reusable only after bounded canonical receipt/inventory identity, successful preparation closure and target/layout/metadata verification; conflicting records or unsafe/missing files never overwrite. Installed bytes are not rehashed. Hashing the small canonical inventory record remains permitted to bind existing closure/admission records; this does not read payload contents. Streaming member hashes already recorded while writing may remain for schema compatibility, but no second full-file content verification pass runs after archive acquisition. Failed/cancelled unpublished staging is removed only after its finite admitted actors positively close. Retain uncertain artifacts and block a second mutation. Explicit install retry may dispose only with positive closure or the precisely qualified in-process-only protocol below, never PID/age/generic free-lock inference.

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

Preserve disclosed retained user-session serve, absolute executable, sanitized explicit environment, bounded private logs, endpoint/model paths and no-model/no-elevation rules. Durable admission/launch/outcome is separate from finite preparation/handoff. SIGINT/SIGHUP/SIGTERM/EOF cooperate with bounded abort/drain; later explicit recovery handles process death. A stale finite handoff marker cannot erase valid retained-service facts or truthful availability; health alone is not ownership. Never replay ambiguous spawn or stop/delete a retained/foreign service or its payload/models/logs. Use identical pre/post-admission regular-file/nlink/header checks. Pre-spawn failures including log creation and supervisor validation produce bound not-started evidence when positively known and bounded persisted diagnostics; uncertain launch never becomes an invented exit. Supervisor death while service might live is distinct from installer death. Readiness deadline=min(overallEndsAt,readinessEndsAt); distinguish owner loss, abort, overall deadline and startup failure. Cancellation/failure after admission discloses retained Ollama. Install-only explicit Retry cleans finite preparation then invokes a fresh install. Update cleanup is excluded and S4/S5 govern later daemon lifecycle/migration.

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

### 3.9 `Install retry and historical accepted policy` — new

Private versioned relationships: one original install owns zero or more attempts; each attempt binds exactly one accepted policy copy and actor admission, zero/one closure and cleanup/disposal completion. A schemaVersion=1 install cleanup record binds installationId, originalOperationId, originalAction='install', attempt identity/policy hashes, bounded canonical relative targets, preserved-target classifications and immutable per-item completions. Derive targets from validated owned records, never arbitrary paths/globs. Retain matching actor locks through cleanup, parent flush and completion writes. New strict attempt format persists accepted policy; legacy v1 closure remains readable without inventing policy. A historical copy must validate structural bounds plus exact bound policy digest and authorizes historical reconciliation/cleanup only, never a new current offer or execution. Legacy missing policy can come only from an exactly bound service frame or exact hash-matching catalog; otherwise diagnose unsupported evidence. Cleanup is idempotent across death, preserves diagnostic history and finishes before old controller retirement/new install. No automatic recovery, separate discard or partial-install resume. Foreign/unknown files remain blocked. This S3 capability covers interrupted dependency preparation; later candidate/lifecycle/migration cleanup requires the owning contract and cannot be guessed.

**Call sites:**
- `src/installer/ollama-records.ts`
- `src/installer/ollama-prepare.ts`
- `src/installer/manager.ts`
- `src/installer/terminal-install.ts`

### 3.10 `Late disposal, no-replace records and durable bundle descriptor` — invariant-change

Late finite promise settlement records the actual prepared/failed/cancelled outcome and performs bounded cleanup/disposal under the retained handle. Remove failed unpublished stages; preserve complete published dependencies. No publication/start after cancellation/owner loss. Closed-undisposed evidence, uncertain publication and exact recognized temp files become explicit retry inputs; unknown files never silently deleted. Remove temp files on known write failure after descriptor close; retain uncertain close/publication. Publish immutable records via the existing native same-volume exclusive no-replace primitive, qualifying regular-file use; existsSync+replace is insufficient. Persist complete parsed bundle descriptor in versioned private accepted-offer data; fresh peers validate canonical digest/manifest/target/delivery instead of relying on factory-local Map. Fresh install Retry resolves normal current offer after cleanup, never uses old data to authorize a replacement. Existing update same-candidate recovery can consume exact durable descriptor but never enters install cleanup; unavailable legacy exact data fails closed rather than fetching latest. Keep interrupted state until cleanup or existing recovery positively completes.

**Call sites:**
- `src/installer/bundle-delivery.ts`
- `src/installer/peer-contracts.ts`
- `src/installer/manager.ts`
- `src/installer/ollama-records.ts`
- `src/installer/ollama-prepare.ts`

### 3.11 `ZIP continuity and qualification evidence` — invariant-change

Verify ZIP hash/envelope and extract with yauzl.fromFd on the same descriptor retained until actual ZIP close; no path reopen. Preserve cancellation/size/path bounds. System-ancestor aliases get actionable blocker; retain S1 canonical-home ownership and do not silently relax links. Emit coding-agent advice once; never install/auth/spawn agent CLIs. Qualification observes os.machine(), process.arch/platform, uid>0, Node version/executable, process.report glibcVersionRuntime, raw /etc/os-release and meaningful translation check, representing unknown honestly. Bind asset digest/size to independent official release digest/checksum or mark provenance pending. Capture scoped before/after install home, ~/.ollama and relevant temp paths, service argv/env, cache-advice action/result and observational limits. No claim of complete write confinement/full cache eviction from partial snapshots; no models/elevation/host-daemon changes.

**Call sites:**
- `src/installer/ollama-prepare.ts`
- `src/installer/ollama-records.ts`
- `src/installer/terminal-entry.ts`
- `src/installer/terminal-install.ts`
- `scripts/qualify-ollama.mjs`

## 4. Diagrams

- [Sequence diagram](docs/epics/reliable-cross-platform-daemon-installation-lifecycle-E20261123c3d71313/S003/sequence-diagram.html)

## 5. Interaction with shared contracts

| Contract | Role | How |
| :--- | :--- | :--- |
| `sc1` | consumes | Bind the existing target/private runtime and installation home; do not add a delivery mode, select a release, install PATH Node or replace verified runtime policy. |
| `sc2` | consumes | Use existing lock-owning manager preparation and terminal admission. Narrow internal context/progress and blocked dependency evidence preserve its sole controller writer and cancellation boundaries; ordinary lifecycle/inspect/stop behavior is unchanged. Narrow terminal install Retry verifies original durable action and cleans owned preparation before a fresh install. Public ManagerAction unchanged; update cleanup and hook policy excluded. |
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
- **Interrupted install preparation awaiting explicit Retry** (recoverable)
  - Detection: Under installation lock, validate original durable install intent, operation/home/attempt bindings, accepted policy, finite closure or the qualified in-process-only admission/lock protocol; distinguish retained service admission from finite parent handoff.
  - Response: Inspect only reports interruption. Explicit terminal Retry completes bounded idempotent cleanup of owned abandoned preparation, durably retires the original operation, then terminal starts normal installation with a fresh operation and current consent. No partial candidate continuation, automatic cleanup or update reset. Unknown closure/publication or incomplete cleanup remains blocked and starts nothing.
  - User impact: User sees cleanup progress before installation begins; no manual deletion of private files is the supported recovery path.
- **S4/S5 production peer is still absent** (recoverable)
  - Detection: Existing manager/terminal capability admission detects missing lifecycle/readiness or migration ports after S3 is composed.
  - Response: Keep capability-unavailable; do not install a fixture/no-op peer or fabricate full installation success.
  - User impact: S3 dependency adapter can be independently tested but real complete installation awaits its owning stories.
- **Bounded read-only reconciliation is incomplete or invalid** (recoverable)
  - Detection: The shared three-second aggregate deadline expires, cancellation occurs, or canonical receipt/inventory/closure/target/layout metadata is invalid. No installed-file content hash is computed.
  - Response: Return unavailable/cancelled with a bounded diagnostic, preserve retained evidence and existing uncertainty gates, and admit no automatic download, publication or service start. Do not extend to twenty seconds or introduce deep hashing workers.
  - User impact: Inspection stays bounded and avoids reading multi-GB payloads; genuine record or ownership uncertainty still blocks mutation.
- **Install cleanup interrupted, foreign evidence found, or cleanup deadline exceeded** (recoverable)
  - Detection: Compare per-item completion records and exact owned paths under live manager/actor locks; detect path/link/identity changes, resource-close uncertainty, missing durable completion or cancellation/deadline.
  - Response: Retain unfinished cleanup and bounded diagnostics, admit no new download/publication/spawn/install. A later explicit Retry resumes missing cleanup steps only; do not mark old operation finished before all cleanup items are disposed or classified as preserved installed dependency.
  - User impact: Retry remains blocked with exact unresolved item; repeated Retry does not duplicate installation.
- **Attempted use of install cleanup for UPDATE or later daemon work** (recoverable)
  - Detection: Original durable intent.action is upgrade, activeReleaseId exists, or shutdown/daemon migration/activation admission/candidate recovery falls outside S3 dependency preparation.
  - Response: Reject before cleanup writes; leave all update state, selected release, hook data and lifecycle evidence intact. Route existing same-candidate/hook-governed recovery unchanged; S3 does not invent a reset policy.
  - User impact: Install retry cannot erase an existing installation or restart an interrupted update from scratch.
- **Historical accepted policy differs from current catalog** (recoverable)
  - Detection: Validate persisted accepted policy against bound policySha256, exact installation/attempt paths and schema limits; detect absent/invalid legacy policy separately.
  - Response: Use exact accepted policy for historical reconciliation/cleanup. Never substitute latest policy; new install obtains current normal offer. Legacy absence without an exact already bound copy reports an actionable unsupported-evidence blocker.
  - User impact: Catalog updates do not invalidate a well-bound old attempt; new side effects still require current consent.
- **Supervisor fails before spawn or its controller dies after service admission** (recoverable)
  - Detection: Bound supervisor diagnostic/outcome and identical entrypoint checks establish not-started versus launch/admission ambiguity; service-health result is independent of finite parent closure.
  - Response: Persist not-started only when certain; retain ambiguous launch and running service, with bounded diagnosis. Do not replay spawn or erase service facts because a finite marker lacks closure. Cancellation after admission says service may remain. Bound readiness by overall deadline and identify owner loss separately.
  - User impact: No permanent wedge from positively known pre-spawn failure; existing/retained service is preserved.
- **Fresh bundle peer rehydrates accepted offer** (recoverable)
  - Detection: Parse versioned durable complete descriptor, recompute canonical digest and compare manifest/target/delivery/acceptance binding instead of factory-local Map.
  - Response: Validate exact accepted data for existing same-candidate recovery; missing/invalid legacy data blocks without fetch-latest. Install Retry uses descriptor only for history/cleanup and resolves an ordinary fresh offer afterward.
  - User impact: Fresh-process recovery no longer depends on reusing a JavaScript peer instance; install cleanup remains excluded from updates.

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
| Terminal closes with SIGHUP/SIGTERM during finite download or readiness, or process receives SIGKILL. | Cooperative signals drain original finite work; hard death leaves durable facts. Next launch does no cleanup until explicit Retry for original install. The complete cleanup gate precedes fresh install; retained services remain and duplicate spawn is forbidden. |
| Finite work settles after its bounded caller has already returned uncertainty. | The original still-owning actor records the actual outcome, finishes bounded disposal under retained handle and records closure. This is completion of its original cleanup, not permission for later automatic recovery. |
| Ollama install offer is declined and the terminal dies before ordinary manager finish. | No dependency context/attempt exists; do not convert a certain decline into dependency-uncertain. Ordinary operation accounting remains separate. |
| A complete admitted Ollama service is healthy when an install retry begins. | Cleanup temporary install work without terminating service or deleting its payload/models/logs; the fresh ordinary install may detect and reuse this already installed dependency. This is not resuming a partial install. |
| Cleanup completes but the process dies before new install begins. | Old operation completion and cleanup evidence remain durable; next explicit retry/ordinary invocation cannot duplicate cleanup or begin twice. New install identity and consent are still obtained through normal terminal admission. |

**Invariants to preserve**

- S3 consumes sc1/sc2/sc3/sc6 without changing public schemas, daemon IPC, delivery modes, release selection or IDE prompt ownership. [[c1]]
- Only the original manager lock owner writes controller state. Dependency adapter owns only private dependency staging/receipts; missing/uncertain closure blocks duplicate mutation. Finite ownership guarantee covers admitted actors, retained groups and cooperating descendants only. [[c2]]
- S1 terminal-only install, exact consent, stop bypass of unrelated dependency health, pre-shutdown cancellation, ready/lock-release-before-TUI and post-install failure semantics remain covered. [[c3]]
- No elevation, global PATH/system-service modification, implicit model download, direct cloud REST, provider initialization, agent spawn/auth/install or host v2 lifecycle changes. [[c4]]
- E20261123c3d71313:S003:FR001 and DEF ac1/ac2/ac3 apply unchanged; local fixtures do not certify target-native/VM/IDE support. [[c5]]
- Official archive size/SHA-256 remains mandatory on live download. Installed payload contents are not rehashed during staged second-pass validation, reuse, inspect/reconciliation or service admission; small metadata record digests and bounded target headers remain. No twenty-second inspection phase. [[c90]]
- Owner decision 2026-11-25: explicit Retry only; finish cleanup then install anew. Applies to INSTALL, never UPDATE. No separate Discard UI, startup cleanup or partial-candidate resume. [[c94]]

## 7. Test strategy

**Test framework:** `node:test + node:assert/strict with canonical *.test.ts coordinator under verified Node 22; reuse src/installer/__tests__ fixture conventions. Run only surrounding tests per task, then one combined S1/S2/S3 installer regression after all tasks. No unrelated backend sweep or host daemon/Ollama mutation. Revised evidence must be regenerated after fixes; preserve prior passing packet as historical. Final scoped regression uses INSRC_BUILD_CONFIRM_CLOSURE=1 with serial coordinator and exact file/admission/close/disposal audit. Human BUILD approval only after all tasks, no per-task approval.`

**Test levels**

- **contract** — Prove truthful reporting and unchanged public wire semantics at consent boundaries.
  - Subjects: `dependency-state-matrix-distinguishes-ready-stopped-missing-and-unavailable`, `healthy-service-without-path-binary-is-reused`, `inspect-and-decline-have-zero-mutation-or-process-side-effects`, `stale-forged-and-cross-home-offers-reject-before-mutation`, `stopped-existing-ollama-has-manual-guidance-without-start-action`, `agent-zero-one-many-detection-never-spawns-auth-model-or-install`, `private-runtime-provenance-rejects-path-node-and-wrong-target`
  - Fixtures: `Disposable home and configuration, absolute executable/PATHEXT lookup fixtures, loopback refused/slow/malformed/redirect/version endpoints and write/spawn sentinels.`
- **integration** — Exercise the accepted private payload, finite actor and intentional service-handoff paths with controlled peers and no models.
  - Subjects: `accepted-official-payload-is-user-only-and-discloses-install-and-start`, `consent-races-on-policy-destination-and-endpoint-never-overwrite-existing-state`, `hostile-archive-and-large-zstd-window-fail-before-unsafe-write-or-allocation`, `internal-archive-links-materialize-only-qualified-contained-files`, `download-size-digest-layout-and-fsync-failures-never-report-ready`, `cancellation-and-eof-block-later-publication-or-service-admission`, `unknown-actor-proof-blocks-install-retry-cleanup`, `service-admission-is-durable-and-distinct-from-finite-preparation-drain`, `explicit-install-retry-completes-cleanup-before-fresh-install`, `owned-service-start-port-conflict-and-readiness-failure-preserve-existing-listener`, `production-dependencies-compose-with-real-delivery-and-no-fake-s4-s5`, `terminal-manager-dependency-context-preserves-stop-and-cancellation-regressions`, `inspection-and-reconciliation-share-three-second-bound-without-payload-hashing`, `receipt-closure-and-layout-errors-block-reuse-without-content-rehash`, `same-size-installed-content-change-does-not-trigger-digest-reverification`, `archive-digest-mismatch-still-rejects-live-acquisition`, `reuse-and-service-admission-never-rehash-installed-files`, `install-retry-requires-explicit-terminal-admission-and-original-install-intent`, `upgrade-retry-never-enters-install-cleanup-or-changes-selected-release`, `cleanup-cancellation-or-partial-failure-prevents-every-new-install-side-effect`, `repeated-retry-after-death-is-idempotent-and-finishes-cleanup-first`, `sighup-sigterm-and-sigkill-at-preparation-and-handoff-preserve-correct-evidence`, `qualified-in-process-lock-proof-excludes-live-inherited-and-unknown-actors`, `late-settlement-records-true-outcome-and-completes-disposal-under-held-handle`, `policy-change-reconciles-exact-accepted-copy-without-current-policy-substitution`, `fresh-bundle-peer-validates-durable-descriptor-without-resolve-map`, `decline-creates-no-dependency-context-record-or-process-and-remains-certain`, `supervisor-log-validation-and-pre-spawn-failures-have-bounded-not-started-diagnostics`, `production-worker-dispatch-argv-path-and-sanitized-environment-with-seeded-sentinels`, `supervisor-death-does-not-imply-retained-service-death-or-authorize-replay`, `retained-service-cancellation-is-explicit-and-total-deadline-bounds-readiness`, `zip-extraction-uses-verified-descriptor-across-path-swap-and-positive-close`, `immutable-record-publication-never-replaces-existing-target-and-cleans-owned-temp`, `invalid-receipt-closure-layout-reject-with-specific-code-and-zero-transport-calls`, `payload-read-sentinel-covers-sync-async-stream-and-path-read-entrypoints`, `redirect-target-local-listener-is-never-contacted`, `coding-cli-advice-emitted-once-and-install-spawn-sentinels-remain-zero`, `hostile-tar-zstd-zip-boundary-matrix-rejects-before-unsafe-write`, `alias-copy-cancellation-closes-before-owned-cleanup`
  - Fixtures: `Tiny exact-hash ZIP/tar.zst payloads, qualified internal-alias layouts, malformed frame headers/stream truncation/output bombs, injected fsync/no-replace failures, controlled executable and loopback server with argv/env/log capture.`, `Manager/terminal fixtures with real S1/S2 control/store/download helpers and explicit S4/S5 fixture peers only in tests. Actor admission/close/disposal and retained-service checkpoint evidence.`, `Payload content-read/hash sentinel covering inspection, reconciliation, same-ID reuse and service admission; bounded metadata/target-header reads allowed. Same-size changed installed bytes demonstrate no hash revalidation; receipt/closure/link/size/layout tampering still fails. Slow metadata/HTTP and abort/late-settlement sentinels exercise the single aggregate deadline.`, `Separate real Node22 child processes with explicit ready/admission events for signal-death tests, retaining no host-service actors; hook/barrier-based ordering instead of tight wall-clock sleeps/partial JSON polling. Safe test time margins and bounded joins.`, `Fresh manager AND freshly constructed peers across restart. Old catalog/new catalog pairs; existing service and unknown/live actor cohorts; repeated cleanup crash points. Install-versus-upgrade snapshots assert no update deletions/writes.`, `Patch all practical payload content-read APIs (fs.promises.open/readFile, openSync/readFileSync, createReadStream); assert zero invalid-evidence download calls and exact InstallerError codes. Seed harmless credential/NODE_OPTIONS parent values and restore them. Use a second local version listener as redirect target and assert request count=0. Check actual stage/publication destinations.`, `Archive vectors: tar GNU L/K, base256/negative, PAX size, padding/end blocks, link-data, setuid normalization, nested inventory; zstd reserved/dictionary/content-size/skippable/decoder mismatch; ZIP ZIP64 descriptor, EOCD-in-comment, Unicode extra, gaps/overlaps, verified-fd swap. Assert intended validation path/error, not incidental EEXIST. Cancellation during alias copy.`
- **live** — Qualify each offered exact official payload/layout/version on its native target before enabling its auto-install route, without models or elevation.
  - Subjects: `qualified-exact-ollama-payload-version-and-user-session-readiness-on-enabled-target`, `existing-installation-reuse-and-decline-preserve-platform-state`, `official-large-archive-streaming-and-library-layout-match-policy`, `native-large-payload-inspection-avoids-content-reads-within-three-seconds`, `native-platform-glibc-translation-and-upstream-digest-provenance-are-observed`, `native-write-observations-and-cache-advice-are-recorded-with-limits`
  - Fixtures: `Linux ARM64 OrbStack disposable VM as the first Linux route; native Linux x64 runner or explicitly recorded translation plus native follow-up.`, `Existing macOS ARM64 UTM disposable guest; separate macOS x64 and Windows ARM64/x64 runners/guests when available. Unavailable targets remain pending, with no fake passed evidence.`, `Per-target receipt recording official URL/hash/bytes/version, native/translated status, archive limits, executable/library probe, no-elevation sentinels, endpoint readiness and cleanup/service intent.`, `Native large-payload inspection records total time and payload read behavior, with cold/warm owned-file cache conditions if available. No global cache drop, host mutation or model work. Historical cold full-hash failure remains evidence of the removed behavior, not a current pass.`, `Generate qualification summary from raw driver output: os.machine/process.report/os-release, uid>0 without fixed uid501, raw translation check and provenance source. Record independent official digest/checksum evidence and mark absent proof pending. Scoped ~/.ollama/tmp/home before-after observations, exact cache advice/result; do not claim complete filesystem isolation or cache eviction.`
- **smoke** — Complete one coherent installer regression after all S3 tasks, preserving S1/S2 functionality and qualification honesty.
  - Subjects: `combined-s1-s2-s3-installer-regression-has-exact-coverage-and-confirmed-cleanup`, `published-control-payload-includes-real-dependency-adapter-without-application-boot-imports`, `terminal-install-upgrade-consent-and-ready-before-tui-regressions`
  - Fixtures: `Canonical coordinator build, current source/output fingerprints, exact selected file list, admission/close/disposal journals and scoped report audit. A fixture pass never qualifies real target support.`

**Acceptance mapping**

| Criterion | Proving tests |
| :--- | :--- |
| `ac1` | `stale-forged-and-cross-home-offers-reject-before-mutation`, `accepted-official-payload-is-user-only-and-discloses-install-and-start`, `consent-races-on-policy-destination-and-endpoint-never-overwrite-existing-state`, `hostile-archive-and-large-zstd-window-fail-before-unsafe-write-or-allocation`, `qualified-exact-ollama-payload-version-and-user-session-readiness-on-enabled-target`, `install-retry-requires-explicit-terminal-admission-and-original-install-intent`, `upgrade-retry-never-enters-install-cleanup-or-changes-selected-release`, `zip-extraction-uses-verified-descriptor-across-path-swap-and-positive-close`, `native-platform-glibc-translation-and-upstream-digest-provenance-are-observed` |
| `ac2` | `dependency-state-matrix-distinguishes-ready-stopped-missing-and-unavailable`, `healthy-service-without-path-binary-is-reused`, `inspect-and-decline-have-zero-mutation-or-process-side-effects`, `stopped-existing-ollama-has-manual-guidance-without-start-action`, `download-size-digest-layout-and-fsync-failures-never-report-ready`, `cancellation-and-eof-block-later-publication-or-service-admission`, `explicit-install-retry-completes-cleanup-before-fresh-install`, `inspection-and-reconciliation-share-three-second-bound-without-payload-hashing`, `receipt-closure-and-layout-errors-block-reuse-without-content-rehash`, `native-large-payload-inspection-avoids-content-reads-within-three-seconds`, `same-size-installed-content-change-does-not-trigger-digest-reverification`, `archive-digest-mismatch-still-rejects-live-acquisition`, `reuse-and-service-admission-never-rehash-installed-files`, `install-retry-requires-explicit-terminal-admission-and-original-install-intent`, `upgrade-retry-never-enters-install-cleanup-or-changes-selected-release`, `cleanup-cancellation-or-partial-failure-prevents-every-new-install-side-effect`, `repeated-retry-after-death-is-idempotent-and-finishes-cleanup-first`, `sighup-sigterm-and-sigkill-at-preparation-and-handoff-preserve-correct-evidence`, `qualified-in-process-lock-proof-excludes-live-inherited-and-unknown-actors`, `late-settlement-records-true-outcome-and-completes-disposal-under-held-handle`, `policy-change-reconciles-exact-accepted-copy-without-current-policy-substitution`, `fresh-bundle-peer-validates-durable-descriptor-without-resolve-map`, `decline-creates-no-dependency-context-record-or-process-and-remains-certain`, `supervisor-log-validation-and-pre-spawn-failures-have-bounded-not-started-diagnostics`, `production-worker-dispatch-argv-path-and-sanitized-environment-with-seeded-sentinels`, `supervisor-death-does-not-imply-retained-service-death-or-authorize-replay`, `retained-service-cancellation-is-explicit-and-total-deadline-bounds-readiness`, `zip-extraction-uses-verified-descriptor-across-path-swap-and-positive-close`, `immutable-record-publication-never-replaces-existing-target-and-cleans-owned-temp`, `invalid-receipt-closure-layout-reject-with-specific-code-and-zero-transport-calls`, `payload-read-sentinel-covers-sync-async-stream-and-path-read-entrypoints`, `redirect-target-local-listener-is-never-contacted`, `hostile-tar-zstd-zip-boundary-matrix-rejects-before-unsafe-write`, `alias-copy-cancellation-closes-before-owned-cleanup`, `native-write-observations-and-cache-advice-are-recorded-with-limits` |
| `ac3` | `agent-zero-one-many-detection-never-spawns-auth-model-or-install`, `inspect-and-decline-have-zero-mutation-or-process-side-effects`, `coding-cli-advice-emitted-once-and-install-spawn-sentinels-remain-zero` |

## 8. Alternatives considered

### 8.1 a1: Install-only cleanup gate before a fresh terminal install — **CHOSEN**

Keep public schemas; one explicit terminal retry retires owned interrupted preparation before a new install.

Add a narrow internal terminal-admitted install-retry cleanup capability around the existing manager/store and S3 owned dependency records. Validate original durable intent.action=install under the existing installation lock, prove each finite actor closed (or qualified in-process-only lock protocol), record bounded idempotent cleanup, then retire the old operation. The terminal starts an ordinary install with a fresh operation/attempt and fresh dependency consent where needed only after cleanup completes. No separate Discard UX, automatic cleanup, partial-candidate resume, or update cleanup. Persist accepted policy/descriptor and closure/disposal outcomes; retain intentional services and diagnostic records. Use existing native no-replace support and verified ZIP descriptor lifetime.

### 8.2 a2: Dedicated private install recovery coordinator and journal

A separate internal recovery component orchestrates the same explicit cleanup-then-install policy.

Introduce a private versioned install-recovery coordinator with plan/execute/validate journal and typed dependency/delivery participants, invoked only by the terminal after validating original install intent. It persists a complete cleanup graph then hands control to a new ordinary installation after all participants close. It cannot change S1 publication, S2 dev preparation or S5 hook policies; absent participant proof blocks. No public schema change or update recovery alteration.

**Rejected because:** Could satisfy the same constraints but adds a generic recovery coordinator without a demonstrated need in this dependency story.

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
- **[[c93]]** `doc` `docs/plans/s3-manual-review-feedback-2026-11-25.md` — "Changes requested; recovery findings 1–4 require a coherent design; exact original feedback archived with SHA-256 bb1dd84cf5755d92cce1aad4cc07b95a1f2589f9ad6dad32b00798c19b54cbad."
- **[[c94]]** `stakeholder` `User decision, 2026-11-25: explicit retry, on retry complete cleanup and then install. only applies to install NOT UPDATE` — "explicit retry, on retry complete cleanup and then install. only applies to install NOT UPDATE"
- **[[c95]]** `analyze-bundle` `src/installer/manager.ts` — "Completed installer-scope symbol/model/usage/action/test/entrypoint analyzer. Stored original intent distinguishes install from upgrade. Graph incomplete (21 ignored relationships); actual manager/pee"

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
- **[[c93]]** `doc` `docs/plans/s3-manual-review-feedback-2026-11-25.md` — "Changes requested; recovery findings 1–4 require a coherent design; exact original feedback archived with SHA-256 bb1dd84cf5755d92cce1aad4cc07b95a1f2589f9ad6dad32b00798c19b54cbad."
- **[[c94]]** `stakeholder` `User decision, 2026-11-25: explicit retry, on retry complete cleanup and then install. only applies to install NOT UPDATE` — "explicit retry, on retry complete cleanup and then install. only applies to install NOT UPDATE"
- **[[c95]]** `analyze-bundle` `src/installer/manager.ts` — "Completed installer-scope symbol/model/usage/action/test/entrypoint analyzer. Stored original intent distinguishes install from upgrade. Graph incomplete (21 ignored relationships); actual manager/pee"
