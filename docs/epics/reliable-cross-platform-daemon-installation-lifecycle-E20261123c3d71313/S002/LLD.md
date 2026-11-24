<!-- insrc:artifact LLD-c3d71313f34bce71-s2 -->

# LLD: STORY-c3d71313f34bce71-s2 — Install and upgrade development checkouts

## Summary

**Epic:** `reliable-cross-platform-daemon-installation-lifecycle`
**HLD base run:** `wf-1795445383474-itgkv3`
**HLD effective hash:** `acb12724c316...`
**Tracker:** [insors-ai/insrc#244](https://github.com/insors-ai/insrc/issues/244)

Development installation resolves the chosen repository/branch to an accepted commit, builds it with verified private tooling and publishes a complete immutable release. The existing manager retains operation ownership and the shared terminal retains prompts/TUI handoff. This revision specifies the S1 integration seams, durable source checkout, receipt reopening and explicit pre-publication recovery exposed by the completed foundation. [[c1]] [[c3]] This revision records the user's explicit owned/cooperating actor cleanup boundary; it does not promise arbitrary descendant containment.

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

### 2.1 `PreparedReleaseOffer`

```typescript
type PreparedReleaseOffer = BundleReleaseOffer | DevSourceOffer;
interface BundleReleaseOffer { kind: 'bundle'; manifest: ReleaseManifest; descriptorSha256: string }
interface DevSourceOffer { kind: 'dev-source'; delivery: Extract<Delivery, { mode: 'dev' }>; sourceCommit: string; target: Target; runtime: RuntimeIdentity; recipeVersion: 'dev-v1'; releaseId: string; sourceSha256: string }
```

**Parameters:**
- `delivery: Delivery` — Explicit validated repository/branch; no inferred source or mode.

**Returns:** `PreparedReleaseOffer` — Private adapter offer: bundle metadata is complete; a dev offer binds source/build intent before output bytes exist. Public UpgradeOffer remains unchanged.

**Errors:**
- `source-invalid` when Invalid scheme/path/ref, option-like argument, unsupported object format or mismatched configured source.
- `source-fetch-failed` when Selected branch has no unique commit or Git authentication/deadline fails.
- `offer-stale` when The branch resolves to a different source identity when acceptance is rechecked.

**Preconditions:**
- This is an explicit private integration change to src/installer/peer-contracts.ts and src/installer/manager.ts, not a change to HLD sc1/sc2 wire records. Bundle behavior retains its existing descriptor integrity checks. [[c4]] [[c6]]
- Dev resolve uses bounded git ls-remote for refs/heads/<branch>. It performs no clone, fetch, npm, compilation, source mutation or persisted offer allocation. Credentials are delegated to ordinary Git configuration and never logged. [[c4]] [[c6]]

**Postconditions:**
- sourceSha256 is SHA-256 of canonical {kind,delivery,sourceCommit,target,runtime,recipeVersion}, excluding sourceSha256/releaseId. releaseId is dev- plus its first 48 hex characters; these identify the source recipe, not compiled bytes. [[c4]] [[c6]]
- Public offerId keeps the current installation/location/predecessor/delivery binding, using descriptorSha256 for bundle and sourceSha256 for dev. A changed branch between check and locked acceptance requires a new offer; no silent substitution. [[c4]] [[c6]]
- After locked acceptance persist the full dev-source offer before fetch/build. During preparation fetch only the configured branch, checkout the accepted SHA detached, and compare actual Git object identity. If that object cannot be obtained after branch movement, fail; never replace it with the new tip. [[c4]] [[c6]]
- No fabricated manifest/payload hash is used during a dev source check. The final ReleaseManifest and artifact descriptor hash exist only after compilation and inventory generation. [[c4]] [[c6]]

### 2.2 `DeliveryPort`

```typescript
interface DeliveryPort {
  resolve(delivery: Delivery): Promise<PreparedReleaseOffer>;
  prepare(store: PreparationLease, offer: PreparedReleaseOffer, context: PreparationContext): Promise<PreparedCandidate>;
  resumePreparation?(store: PreparationLease, context: PreparationContext): Promise<PreparedCandidate>;
  open(location: InstallationLocation, releaseId: string): Promise<PreparedCandidate>;
  verify(candidate: PreparedCandidate, location: InstallationLocation): Promise<void>;
}
```

**Parameters:**
- `store: PreparationLease` — Existing restricted location/assertHeld/inspect/publishCandidate capability; never exposes controller commit or unrestricted operation writes.
- `offer: PreparedReleaseOffer` — Exact accepted private source/bundle offer.
- `context: PreparationContext` — Manager-bound operation ID, AbortSignal and typed checkpoint read/write callbacks for this operation only.

**Returns:** `PreparedCandidate` — The existing common immutable candidate only after full artifact validation and publication.

**Errors:**
- `source-dirty` when Selected managed source has user changes, conflicts or changed identity.
- `source-build-failed` when Private npm/build/packaging/native probe failed.
- `preparation-uncertain` when Previous preparation actor closure or checkpoint identity cannot be positively established.

**Preconditions:**
- Proposed dev adapter implementation is src/installer/dev.ts; helper names there are private, not new public IPC APIs. Compose it as peers.dev in src/installer/production-peers.ts. All S1 required sibling-capability admission remains in force. [[c4]] [[c6]] [[c14]]
- The manager alone writes its protected dev-preparation checkpoint through validated context callbacks. Adapter/worker cannot commit controller.json, migration journals, lifecycle receipts or selection. [[c4]] [[c6]] [[c14]]
- PreparationContext is proposed private structure { operationId, signal?, readCheckpoint(), checkpoint(record) }; callbacks enforce installation/operation/source/attempt identity, bounded records, original lease and current revision. Bundle preparation ignores dev checkpoints and otherwise retains behavior. [[c4]] [[c6]] [[c14]]
- Cleanup is guaranteed for installer-admitted command actors, retained owned process groups and cooperating registered descendants. Arbitrary unregistered detached processes are outside this guarantee; it is an ownership contract, not process isolation. Known held/unknown owned actors, missing or mismatched registered-actor journals and unsupported tracked-actor disposal evidence remain preparation-uncertain and block publication, retry and cleanup. [[c19]] [[c20]]

**Postconditions:**
- Dev open/verify consume only stored receipt/inventory/runtime bytes; ordinary start/restart/TUI/recovery never fetch, npm-install or rebuild. [[c4]] [[c6]] [[c14]]
- For dev offers, manager compares candidate receipt sourceSha256, releaseId, commit, target, runtime and recipe against the accepted source offer; it does not compare a source-offer digest to the post-build descriptor digest. Bundle candidates keep descriptor equality with their offer. [[c4]] [[c6]] [[c14]]
- resumePreparation is used only by explicit same-operation retry-migration while the durable phase is preparing and no candidate/admission exists. It reuses the accepted source offer, never resolves the moving branch again. Once candidate identity is recorded, existing S1 same-candidate recovery applies. [[c4]] [[c6]] [[c14]]
- Cancellation reaches the owned preparation worker and its process scope, not merely a check before/after an awaited build. Publication and subsequent lifecycle handoff require confirmed closure of all actors within the owned/cooperating boundary. [[c4]] [[c6]] [[c14]]

### 2.3 `PreparedCandidate`

```typescript
interface PreparedCandidate { releaseId: string; directory: string; manifest: ReleaseManifest; descriptorSha256: string; payloadSha256: string; inventorySha256: string }
```

**Parameters:**
- `input: unknown` — Bounded dev receipt and complete inventory read from its immutable release root.

**Returns:** `PreparedCandidate` — Same S1 final identity regardless of delivery mode; dev-specific provenance stays in its private receipt.

**Errors:**
- `candidate-conflict` when Stored bytes, source identity, target, runtime, root or descriptor/inventory digest differs.
- `source-incompatible` when Unsupported source recipe/protocol, predecessor provenance or source ancestry.

**Preconditions:**
- Final root is <home>/releases/<releaseId>, published from owned <home>/install/staging through the existing manager-held lease. Existing roots are reused only after full verification; different bytes never replace them. [[c5]] [[c7]] [[c8]]
- Dev inventory.json describes complete runtime files. .dev-release.json is canonical {schemaVersion:1,mode:'dev',sourceOffer,manifest,inventorySha256,checkoutRelativePath}; bounded to the existing descriptor limit. Its manifest.payloadSha256 equals the canonical inventory-byte digest in dev mode. descriptorSha256 hashes receipt bytes; receipt and inventory are excluded from their own inventory. [[c5]] [[c7]] [[c8]]
- No bundle publication:'qualified' descriptor is synthesized for local dev artifacts. Existing .release.json bundle receipt/validation remains unchanged. Full verification rejects special files, escapes, collisions, missing/extra files, changed modes/digests and changed private runtime, reusing S1 bounded inventory/path primitives. [[c5]] [[c7]] [[c8]]
- Before a worker emits prepared, verify every inventoried file's membership, bytes, mode and digest; reject missing, changed, linked, escaped, extra or opposite-mode receipt files. Selected entrypoint presence alone is insufficient. [[c21]]

**Postconditions:**
- Candidate payload includes out/ daemon/TUI/MCP/assets, production/workspace/native dependency closure, bootstrap.mjs, manager.mjs, native/control.node and tools/node with exact runtime/npm/headers policy. Use S1 control bundling, collection and native/runtime probes from the accepted checkout; do not run the qualified GitHub publisher or fake qualification. [[c5]] [[c7]] [[c8]]
- Release identity is fixed before build; first verified publication fixes actual bytes in that installation. A later same-source request reopens the existing verified candidate instead of rebuilding different bytes under the same ID. An invalid existing release is a conflict, never an overwrite. [[c5]] [[c7]] [[c8]]
- Before publication derive compatiblePredecessors as [] for fresh install or [selected release ID] only after verifying a dev receipt for the same configured source/target/protocol/recipe and Git ancestry of its commit. Different/unknown provenance, non-forward history or bundle/legacy adoption is diagnosed; no implicit mode conversion. [[c5]] [[c7]] [[c8]]
- Ordered migration references are read from the accepted commit's optional package.json insrcInstaller object {schemaVersion:1,migrations:HookReference[]}; absence means an empty list. Reject unknown fields/invalid references, preserve order and bind the source commit. S5 alone decides/checks/runs/tests applicable migration work. [[c5]] [[c7]] [[c8]]

### 2.4 `managerMain`

```typescript
managerMain(args?: string[]): Promise<void>
```

**Parameters:**
- `args: string[]` _(optional)_ — Existing ordinary manager arguments and unchanged bounded ManagerRequest input.

**Returns:** `Promise<void>` — Ordinary installed manager can inspect/control either receipt mode using the shared controller.

**Errors:**
- `candidate-conflict` when Both receipt types exist, mode conflicts with controller delivery, or selected identity is inconsistent.
- `schema-invalid` when Unknown receipt version, malformed/oversized input or unknown fields.

**Preconditions:**
- Replace only private receipt loading in src/installer/manager-entry.ts with a mode dispatcher: exactly one .release.json or .dev-release.json at the installed release root. Validate embedded target against the bundled build target/current runtime before composing peers; never guess from environment or fabricate a bundle descriptor. [[c7]] [[c11]] [[c12]]
- Ordinary install rejection, terminal capability, current ManagerRequest/UpgradeOffer/ManagerEvent and application IPC stay unchanged. Preserve startup boot guards and required real sibling ports. [[c7]] [[c11]] [[c12]]

**Postconditions:**
- Fresh manager processes can reopen and verify a dev candidate without adapter memory caches or build tools on PATH. [[c7]] [[c11]] [[c12]]
- Installed TUI publication/retry selects the new candidate's own bootstrap/private runtime pair, as S1 now enforces. Successful readiness/selection and release of manager ownership still precede the shared terminal's TUI handoff. S2 does not implement that handoff again. [[c7]] [[c11]] [[c12]]

### 2.5 `buildStages`

```typescript
buildStages(run: BuildRun, options?: { npmCli?: string }): string[][]
```

**Parameters:**
- `run: BuildRun` — Existing accepted-checkout coordinator context under verified private Node.
- `options.npmCli: string` _(optional)_ — Proposed optional absolute verified matching npm CLI override for dev preparation; ordinary development defaults remain unchanged.

**Returns:** `string[][]` — Existing coordinated build stages with private npm CLI passed as a script to the selected absolute Node.

**Errors:**
- `runtime-invalid` when Node/npm/header identity or target differs from release policy.
- `source-prerequisite-missing` when Git/compiler/extraction/verified native-header prerequisite is unavailable without elevation.

**Preconditions:**
- S2's private worker uses absolute Node 22.22.1 and npm 10.9.4 CLI paths verified against S1 runtime policy. npm ci uses the accepted lockfile with optional native dependencies included; production closure is collected afterward. [[c9]] [[c10]]
- Use privateRuntimeEnvironment, prepend private Node's directory to child PATH, and supply absolute npmCli explicitly to buildStages/prepareBuild. Do not assume private bin/npm exists: bootstrap runtime extraction may expose only npm-cli.js. Preserve ordinary coordinator defaults outside this explicit dev call. [[c9]] [[c10]]
- Clear inherited Node injection and parent test-coordinator identity from the new source worker; retain needed ordinary Git/registry credentials without capturing/logging them. Override runtime-altering npm/node-gyp settings with selected pinned policy and verified headers; unavailable verified headers are a prerequisite error, never a host-version fallback. [[c9]] [[c10]]
- Set CUDA skip only if absent, preserve explicit inherited values and record the effective value. No global PATH, npm config, HOME, service or privilege changes. [[c9]] [[c10]]

**Postconditions:**
- All source worker children and coordinator stages use private Node/matching npm, including package scripts reached through PATH. No app DB/model/workflow boot is imported for preparation. [[c9]] [[c10]]
- Run canonical build/withRun ownership for the isolated checkout; call existing prepareBuild with explicit private-npm stages. Resolve source checkout helpers/dev dependencies from that checkout, not the invoking installer's ROOT. Any tiny packaging root/npm override needed is explicit S2 integration, not a second build pipeline. [[c9]] [[c10]]
- Retain and confirm closure of every spawned preparation process through the existing owned-process/coordinator machinery; no daemon PID/signal control is introduced. Native/payload probes are fixture/local evidence until S8 supplies actual target/live qualification. [[c9]] [[c10]]

## 3. Data model changes

### 3.1 `Dev source offer and accepted preparation checkpoint` — new

Proposed source files: src/installer/dev.ts and src/installer/dev-worker.ts; these are new implementation locations, while callSites below are existing composition boundaries. One installation owns at most one unfinished controller operation; that operation owns exactly one accepted source offer and zero or more serial preparation attempts. Manager-owned dev-preparation metadata is stored under install/operations/<operationId>, with schema version, exact source offer, predecessor, attemptId/nonce, checkoutRelativePath, stageRelativePath, coordinator run identity and outcome. Persist accepted identity before launch admission. Candidate ID is not an assertion of publication. A preparation worker owns only its checkout/stage/results and never a controller writer or application data lease. No new public Phase/ManagerAction is added. [[c1]] [[c6]] [[c13]]

```
interface PreparationContext { operationId: string; signal?: AbortSignal; readCheckpoint(): DevPreparationRecord | undefined; checkpoint(record: DevPreparationRecord): void }
interface DevPreparationRecord { schemaVersion: 1; installationId: string; operationId: string; sourceOffer: DevSourceOffer; predecessorId?: string; attemptId: string; workerNonce: string; checkoutRelativePath: string; stageRelativePath: string; coordinatorRunId?: string; stage: 'accepted' | 'building' | 'prepared' | 'failed' | 'cancelled'; resultRelativePath?: string }
```

**Call sites:**
- `src/installer/peer-contracts.ts`
- `src/installer/manager.ts`

### 3.2 `Retained managed source checkout` — new

Each attempt allocates a new private checkout at <home>/dev/checkouts/<attemptId>; payload staging stays in <home>/install/staging/<operationId>-<attemptId>. The selected dev receipt points to exactly one managed checkout through a bounded contained relative path; the checkout belongs to that source preparation and is outside the immutable payload/inventory. At later dev upgrade, inspect that exact checkout: expected origin, detached HEAD/source commit, clean tracked/untracked/conflict state, and build-input fingerprint recorded after successful preparation. Build-generated ignored outputs are excluded using the accepted source's normal Git rules, not blanket exclusion of user files. A configured local source path is also inspected for dirty/conflicting work before fetch. Never reset/clean/modify the selected checkout; use a fresh attempt. Dirty/missing/foreign source gives an actionable error. After activation the new receipt chooses its retained checkout; former checkouts are preserved with no automatic GC. Failed/cancelled attempts delete only their proven-owned pristine staging after all actors close; changed or ownership-uncertain checkout data is retained for the user. [[c1]] [[c6]] [[c13]]

**Call sites:**
- `src/installer/manager.ts`
- `scripts/test-harness/build.mjs`

### 3.3 `Preparation completion and explicit retry` — new

Cleanup is guaranteed for installer-admitted command actors, retained owned process groups and cooperating registered descendants. Arbitrary unregistered detached processes are outside this guarantee; it is an ownership contract, not process isolation. Known held/unknown owned actors, missing or mismatched registered-actor journals and unsupported tracked-actor disposal evidence remain preparation-uncertain and block publication, retry and cleanup. User decision: guarantee owned-process cleanup only. The private preparation worker uses the existing coordinator/process ownership pattern and writes a bounded nonce/source/attempt/run-bound result only after its command actors are confirmed closed; it has no publication callback or controller handle. A matching result, confirmed cleanup and released coordinator/worker ownership together permit manager verification/publication; a free operation lock, absent endpoint, PID/age, log line or result projection alone does not. Parent abort or terminal EOF cancels worker work and drains retained preparation actors within the configured budget. If the manager exits, a surviving worker may finish/dispose and persist its private result, but cannot publish/select/activate. Explicit same-operation retry-migration in preparing first checks checkpoint identities and prior actor closure. It can verify/finalize an already prepared stage, or create a new serial attempt for the same accepted source after a confirmed failed/cancelled attempt. A source ref is never re-resolved during recovery. Missing/contradictory evidence remains preparation-uncertain with retained diagnostics; no duplicate worker, automatic stage deletion, automatic retry loop or predecessor restart. The narrow window with an admitted worker but no positive outcome remains uncertain rather than guessed. Once publication is verified, the manager persists the usual candidate record; post-publication recovery continues through S1's existing exact-candidate path. Worker launch input and cancel frames are bounded/versioned and bind the operation/attempt/nonce; EOF is cancellation. Result/cleanup/child-close journal paths are derived from validated checkpoint IDs under the owned checkout, never accepted as arbitrary paths from output. A result is usable only with matching source/run identity, cleanup digest, confirmedClosed=true, observed close entries for all admitted command actors and released coordinator/worker ownership; status strings or exit-code projection alone are insufficient. Worker control/result schema is private preparation plumbing, not an IDE or daemon protocol. No workload or payload writes are admitted after a finalized result. [[c1]] [[c6]] [[c13]] The manager retains blocked/interrupted-preparing plus the checkpoint when child cleanup is unconfirmed, even though the daemon was never quiesced; it must not take the ordinary pre-disruption error path that clears the operation. Confirmed failed/cancelled preparation can finish without changing predecessor selection or its prior ready/stopped result. Explicit recovery requires the same operation ID; normal start/upgrade remains denied while ownership is uncertain. [[c6]] [[c13]]

```
interface DevPreparationResult { schemaVersion: 1; installationId: string; operationId: string; attemptId: string; workerNonce: string; sourceSha256: string; coordinatorRunId: string; outcome: 'prepared' | 'failed' | 'cancelled'; cleanupSha256: string; inputFingerprint: string; outputFingerprint?: string | undefined; inventorySha256?: string | undefined }
interface DevWorkerCancel { schemaVersion: 1; operationId: string; attemptId: string; workerNonce: string; kind: 'cancel' }
```

**Call sites:**
- `src/installer/manager.ts`
- `scripts/test-harness/context.mjs`
- `scripts/test-harness/process.mjs`

### 3.4 `Dev receipt and immutable payload identity` — new

One immutable release has exactly one receipt mode: qualified bundle .release.json or local .dev-release.json. A dev receipt binds one accepted source offer, one final sc1 manifest, one inventory and one managed checkout pointer; it is not a qualification record or migration journal. Receipt canonical bytes determine descriptorSha256, inventory bytes determine inventorySha256 and dev payloadSha256, and neither record hashes itself. Publication excludes both metadata files from inventory self-membership and rejects any extra receipt. Reopening validates full payload/runtime and actual manifest/offer identity independently in a new process. S1 bundle descriptors, archive-digest semantics and all external sc1/sc2 shapes are preserved. [[c1]] [[c6]] [[c13]]

**Call sites:**
- `src/installer/bundle.ts`
- `src/installer/manager-entry.ts`
- `src/installer/installed-launcher.ts`

### 3.5 `Complete payload assembly and explicit integration files` — invariant-change

Reuse source-checkout scripts/package-installer.mjs bundleControlEntrypoint, collectProductionPayload and probePayload plus scripts/installer-payload.mjs containment/closure/inventory helpers, factoring only bundle-agnostic helpers if necessary. Required roots include bootstrap.mjs, manager.mjs, native/control.node, tools/node and compiled out/ resources/native bindings. Preserve bounded entries/bytes and no linked files in published runtime closure. Proposed private receipt/worker modules live in src/installer/dev.ts, src/installer/dev-worker.ts and src/installer/dev-receipt.ts. Explicit existing-file edits are limited to private delivery offer/context types and dispatch in src/installer/peer-contracts.ts, src/installer/manager.ts, src/installer/production-peers.ts, src/installer/manager-entry.ts; cancellation plumbing in src/installer/terminal-entry.ts and src/installer/terminal-install.ts; reusable receipt-independent inventory checks in src/installer/safe-zip.ts if needed; and explicit private npm/root selection in scripts/test-harness/build.mjs and scripts/package-installer.mjs. Update affected fixture offers/composition/tests for the private discriminant; preserve bundle records and required sibling admission. This consumes S1 ownership, does not relocate it or reopen S1 task accounting. If a public HLD contract change proves necessary, back-flow before build instead of silently changing it. [[c1]] [[c6]] [[c13]]

**Call sites:**
- `src/installer/peer-contracts.ts`
- `src/installer/manager.ts`
- `src/installer/production-peers.ts`
- `src/installer/manager-entry.ts`
- `src/installer/terminal-entry.ts`
- `src/installer/terminal-install.ts`
- `scripts/package-installer.mjs`
- `scripts/installer-payload.mjs`
- `scripts/test-harness/build.mjs`

## 4. Diagrams

- [ER model](docs/epics/reliable-cross-platform-daemon-installation-lifecycle-E20261123c3d71313/S002/er-model.html)
- [Sequence diagram](docs/epics/reliable-cross-platform-daemon-installation-lifecycle-E20261123c3d71313/S002/sequence-diagram.html)

## 5. Interaction with shared contracts

| Contract | Role | How |
| :--- | :--- | :--- |
| `sc1` | consumes | Keep Delivery/Installation/ReleaseManifest/Target/RuntimeIdentity unchanged. Private source offers precede final manifests; dev receipt binds final inventory identity. Publish through S1 lease; no new selection writer or implicit mode/source switch. [[c1]] |
| `sc2` | consumes | Existing manager owns read-only checks, accepted offer, preparing checkpoint/candidate publication and subsequent sibling handoff. Existing retry-migration explicitly reconciles pre-publication dev preparation; no new public action/phase. Terminal install restriction, protected same-operation escalation and all required sibling adapter admission stay intact. [[c1]] |
| `sc3` | consumes | Use owning dependency reports/consent and shared pinned runtime policy; S2 only diagnoses its source build prerequisites. Missing S3/S4/S5 ports remain capability-unavailable; fixture peers are test-only. [[c1]] |
| `sc5` | consumes | Carry commit-bound ordered hook references into final manifest without executing hooks or allocating app DB leases. S5 owns applicability, migration-only boot, journals/test/retry policy; S4 owns shutdown/readiness completion. [[c1]] |
| `sc6` | consumes | Use shared explicit home, user-scoped endpoint and canonical drive-letter identity. Child paths/environment use the same chosen home. No new application transport or IDE bridge behavior. [[c1]] |

## 6. Error paths

**Error cases**

- **Configured source/ref or accepted offer changes** (recoverable)
  - Detection: Parse repository form and git check-ref-format before argument-array execution; ls-remote returns one exact branch SHA, and locked re-resolution/offer digest comparison differs from the accepted ID.
  - Response: source-invalid/source-fetch-failed/offer-stale; require fresh explicit acceptance. After acceptance fetch only the pinned commit or report it unavailable; never use a replacement branch tip.
  - User impact: No source execution or incumbent disruption for an unaccepted revision.
- **Dirty, conflicting, missing or foreign managed source** (recoverable)
  - Detection: Resolve the selected dev receipt's contained checkout path, compare origin/HEAD/fingerprint and inspect porcelain status/unmerged entries, including untracked user files. Also inspect an explicitly selected local source working tree.
  - Response: source-dirty/source-conflict/source-identity-mismatch with the preserved checkout location; never reset, clean, switch branch or silently allocate a replacement for a missing selected tree.
  - User impact: All user edits and incumbent runtime remain usable and unchanged.
- **Missing or mismatched private build toolchain** (recoverable)
  - Detection: Verified Node/npm/header identity/target differs from release policy, required source-build helpers/lockfile are absent, or compiler/Git/extraction probe fails.
  - Response: runtime-invalid/source-prerequisite-missing/source-incompatible before lifecycle handoff; provide concrete user-level prerequisites, never elevation or host Node/npm fallback.
  - User impact: No false install/upgrade success or privileged modification.
- **npm/build/native/payload validation fails** (recoverable)
  - Detection: Owned command exits nonzero, reaches deadline, changes source fingerprints or produces incomplete/unsafe payload bytes or failed target-native probes.
  - Response: source-build-failed; drain owned actors, persist exact attempt diagnostics, clean only proven-owned pristine staging, preserve selected source/release and report no activation.
  - User impact: Incumbent keeps serving; failed preparation does not select a partial release.
- **Terminal cancellation or manager exits before candidate publication** (recoverable)
  - Detection: AbortSignal/worker-control cancel or owner stdin EOF requests cancellation; manager restart sees a preparing checkpoint without ordinary candidate metadata.
  - Response: Propagate cancellation into owned process scope and await bounded confirmed child closure. Explicit retry-migration reconciles the same accepted source/attempt result, then finalizes verified prepared bytes or begins one fresh serial attempt. Missing cleanup, mismatched nonce or held/unknown actor ownership returns preparation-uncertain; no duplicate workers or automatic retries.
  - User impact: Cancellation prevents later publication/TUI handoff; interrupted work retains useful diagnostics and explicit recovery rather than guessing completion.
- **Manager exits around publication/checkpoint commit** (recoverable)
  - Detection: Recovered checkpoint names the expected release but the candidate record is missing, or a published directory exists without its matching durable operation projection.
  - Response: After prior actor closure, open and fully verify the exact dev receipt/source/bytes and reconcile it under the same manager lease. Record the existing candidate once and resume S1 recovery; a mismatching/incomplete root is candidate-conflict and is never overwritten.
  - User impact: A completed private publication can be recovered without rebuilding or silently changing identity.
- **Installed receipt or immutable files are corrupt/ambiguous** (recoverable)
  - Detection: Bounded receipt parsing finds unknown schema, both receipt modes, mismatched controller delivery/target/source, different inventory/descriptor hash, escaped paths, special files or changed Node/native/control files.
  - Response: candidate-conflict/schema-invalid; fail before executing candidate code or quiescing an incumbent. Do not reinterpret a dev receipt as a qualified bundle or rebuild during open/verify.
  - User impact: Tampering/corruption is visible and does not cause mixed-release execution.
- **Unsupported predecessor provenance or branch history** (recoverable)
  - Detection: Selected dev receipt does not match configured source/target/protocol/recipe, or Git ancestry check fails for a requested forward dev upgrade.
  - Response: source-incompatible before publication/cutover. No implicit bundle/legacy adoption, branch switch or invented compatibility list.
  - User impact: Unsupported source transitions require deliberate source-specific handling without data loss.
- **Required sibling ports or target qualification unavailable** (recoverable)
  - Detection: Shared manager admission finds missing actual dependency/lifecycle/migration methods, or requested production publication lacks target/native/live qualification.
  - Response: Preserve capability-unavailable/target-unqualified. Preparation fixtures may exercise handoff but cannot certify missing owning behavior or enable a platform.
  - User impact: S2 does not falsely report full live installation, readiness or platform support.

**Edge cases**

| Input | Expected |
| :--- | :--- |
| Branch moves between read-only check and locked acceptance | offer-stale; no build or state mutation. User accepts a new exact offer explicitly. |
| Branch moves after accepted source is durably recorded | Continue only the recorded commit if obtainable; fetch failure leaves incumbent serving. Recovery never re-resolves the branch. |
| Same source offer already has a verified published release | Reuse it after full identity/inventory/runtime verification. Never rebuild or overwrite different bytes under that release ID. |
| Source contains an ordered hook list or no hook metadata | Validate accepted package.json insrcInstaller metadata, preserve hook order unchanged; absence means zero hooks and does not replace S5's validation. |
| A failed checkout acquires user edits while diagnostics are retained | Retain it and report its location; automated cleanup never deletes edited or ownership-uncertain source. |
| Home/local repository contains spaces or Unicode; Windows drive letter uses another case | Use argument arrays, contained portable relative receipt paths and shared canonical location comparisons. Valid Unicode Git refs are accepted; spaces or other forbidden ref characters are rejected by Git rules. |
| Explicit CUDA setting is empty or another value | Preserve it exactly; default skip only when the variable is absent and record effective value. |
| No npm wrapper exists beside the verified Node executable | Use the absolute matching npm-cli.js for npm ci and coordinator stages; no PATH npm fallback. |
| A worker is admitted but no positive completion/cleanup evidence survives | Remain preparation-uncertain and retain diagnostics; neither a free OS lock nor PID absence authorizes deletion or another worker. |
| An arbitrary build-script descendant starts a new session/group and never registers with the installer/coordinator. | This process is outside the guaranteed ownership boundary. Do not describe empty tracked groups as proof of universal process-tree containment. Scope-boundary test fixtures must explicitly release and confirm their own detached process; known unresolved installer-owned or registered actors remain blocking. User decision limits the guarantee to the owned/cooperating boundary. [[c19]] |

**Invariants to preserve**

- HLD public sc1/sc2/sc3/sc5/sc6 wire records and owner boundaries remain unchanged; narrow private S1 composition adaptations are explicit S2 integration work. [[c1]]
- S1 remains the sole controller/selection writer. S2 workers do not stop/start daemons, run migration hooks, open app DBs or implement IDE transports. [[c1]]
- Terminal-only install, exact accepted offer, immutable candidate verification and selected release bootstrap/runtime TUI handoff remain enforced; all required sibling adapters remain mandatory. [[c1]]
- No elevated commands, implicit source/mode switch, daemon PID/signal/kill controls, direct cloud LLM REST or host v2 daemon mutation. [[c2]]
- DEF E20261123c3d71313:S002:FR001 and ac1-ac3 apply unchanged. S8 owns real UTM/OrbStack/Windows qualification; local/fixture passes never imply supported production publication. [[c3]]
- Cleanup is guaranteed for installer-admitted command actors, retained owned process groups and cooperating registered descendants. Arbitrary unregistered detached processes are outside this guarantee; it is an ownership contract, not process isolation. Known held/unknown owned actors, missing or mismatched registered-actor journals and unsupported tracked-actor disposal evidence remain preparation-uncertain and block publication, retry and cleanup. [[c19]]

## 7. Test strategy

**Test framework:** `node:test + node:assert/strict with co-located *.test.ts through the canonical coordinator. Owned subprocess fixtures self-exit/control their own lifetimes; host v2 daemon and app stores are untouched. Surrounding tests run per task; the combined installer regression runs after S2 tasks. S2 fixture/local evidence and S8 live platform qualification stay distinct. Cleanup evidence and tests guarantee only installer-admitted actors, retained owned groups and cooperating registered descendants. An unregistered detached process is an explicitly documented scope-boundary fixture, never claimed contained; the fixture must terminate itself and confirm its own teardown.`

**Test levels**

- **unit** — Strict source/receipt validation and noncircular, mode-specific identity without execution side effects.
  - Subjects: `dev-source-offer-binds-repo-branch-commit-target-runtime-recipe-without-payload-hash`, `dev-receipt-binds-final-manifest-inventory-and-contained-checkout-without-self-hash`, `invalid-option-like-ref-source-and-ambiguous-receipts-rejected`
  - Fixtures: `Canonical source-offer/dev-receipt vectors; malformed/oversized/unknown-version records; Linux/macOS/Windows path vectors including C:/c: aliases.`
- **contract** — Preserve S1 offer/lease/controller/terminal ownership while adding only private dev composition.
  - Subjects: `read-only-dev-check-never-fetches-builds-or-writes-install-state`, `offer-moves-before-acceptance-is-stale-after-acceptance-remains-pinned`, `dev-open-verify-and-fresh-manager-reopen-never-fetch-or-build`, `bundle-offer-receipt-and-required-sibling-admission-regressions-preserved`, `dev-common-handoff-selects-candidate-bootstrap-runtime-and-retains-mode`
  - Fixtures: `Existing manager/controller/terminal fixtures, typed dev adapter, actual ordinary manager subprocess and isolated controller homes; no substitute production sibling implementations.`
- **integration** — Exercise real local Git and owned private-tooling preparation, source preservation, failure and recovery. Ownership assertions use the explicit owned/cooperating scope; full staged-file inventory validation is mandatory before prepared.
  - Subjects: `selected-repo-branch-exact-commit-and-unrelated-branch-never-selected`, `dirty-conflicting-missing-or-foreign-selected-checkout-preserved`, `npm-build-fetch-and-native-probe-failure-preserve-incumbent`, `cancel-or-terminal-eof-drains-owned-preparation-actors-before-return`, `manager-self-exit-before-candidate-recovers-same-source-with-no-duplicate-worker`, `held-unknown-or-mismatched-preparation-result-blocks-retry-and-cleanup`, `published-release-before-candidate-record-reconciles-without-rebuild`, `immutable-dev-payload-tamper-or-existing-id-conflict-refuses-before-shutdown`
  - Fixtures: `Two local Git remotes, exact recorded commits, isolated explicit homes/checkouts/stages and nonce-bound worker results.`, `Owned-process fixtures for manager self-exit, a surviving preparation worker, bounded cancel and confirmed cleanup; missing/foreign cleanup evidence stays blocked.`, `Command fixtures for unavailable compilers and hostile host Node/npm; fixture success is not target qualification.`, `Owned/cooperating actor boundary fixture distinguishes tracked held/unknown actors (blocking) from an arbitrary unregistered detached process (outside guarantee); test code releases and confirms its detached fixture before removing temporary data.`, `Attempt actual foreign-checkpoint admission, retry/cleanup closure guards and retained-data assertions. Missing or tampered non-entrypoint inventory files cannot yield prepared. Full manager retry/deletion integration remains t7.`
- **smoke** — Probe the implemented private-toolchain and complete payload on the native host, without starting app services or certifying other platforms.
  - Subjects: `dev-private-node-and-explicit-npm-cli-work-with-no-host-npm-wrapper`, `dev-build-children-ignore-host-node-npm-and-preserve-explicit-cuda-setting`, `dev-complete-payload-native-probe-and-fresh-installed-manager-inspect`
  - Fixtures: `Verified official Node 22.22.1/npm 10.9.4; source checkout helpers run under canonical ownership and explicit npmCli override.`, `Actual complete payload collection/control bundling/runtime/native probe followed by ordinary manager inspect from a fresh process; publication stays local dev.`, `Actual UTM macOS/OrbStack Linux/native Windows install/upgrade/migration/IDE acceptance is S8 evidence, not an S2 reported smoke pass.`

**Acceptance mapping**

| Criterion | Proving tests |
| :--- | :--- |
| `ac1` | `selected-repo-branch-exact-commit-and-unrelated-branch-never-selected`, `dev-private-node-and-explicit-npm-cli-work-with-no-host-npm-wrapper`, `dev-build-children-ignore-host-node-npm-and-preserve-explicit-cuda-setting`, `dev-complete-payload-native-probe-and-fresh-installed-manager-inspect`, `dev-common-handoff-selects-candidate-bootstrap-runtime-and-retains-mode`, `npm-build-fetch-and-native-probe-failure-preserve-incumbent` |
| `ac2` | `read-only-dev-check-never-fetches-builds-or-writes-install-state`, `offer-moves-before-acceptance-is-stale-after-acceptance-remains-pinned`, `selected-repo-branch-exact-commit-and-unrelated-branch-never-selected`, `dev-open-verify-and-fresh-manager-reopen-never-fetch-or-build`, `dev-common-handoff-selects-candidate-bootstrap-runtime-and-retains-mode`, `bundle-offer-receipt-and-required-sibling-admission-regressions-preserved` |
| `ac3` | `dirty-conflicting-missing-or-foreign-selected-checkout-preserved`, `npm-build-fetch-and-native-probe-failure-preserve-incumbent`, `cancel-or-terminal-eof-drains-owned-preparation-actors-before-return`, `manager-self-exit-before-candidate-recovers-same-source-with-no-duplicate-worker`, `held-unknown-or-mismatched-preparation-result-blocks-retry-and-cleanup`, `published-release-before-candidate-record-reconciles-without-rebuild`, `immutable-dev-payload-tamper-or-existing-id-conflict-refuses-before-shutdown` |

## 8. Alternatives considered

### 8.1 a1: Source offer plus isolated retained checkout — **CHOSEN**

Resolve a source identity without building, then prepare and publish one verified payload under the existing manager.

Use a private dev-source offer alongside the existing bundle offer, preserving public sc1/sc2 wire records. Under the manager lease, persist accepted source identity before starting an isolated checkout/build. Keep the completed checkout outside immutable payloads as the managed source for later dirty/conflict preflight. Publish a mode-specific dev receipt and complete payload through S1 preparation ownership; reopen without fetch/build. Reuse S1 packaging, runtime and coordinator capabilities with explicit narrow composition edits. The guaranteed cleanup boundary is installer-admitted command actors, retained owned process groups and cooperating registered descendants. Arbitrary unregistered detached processes are outside the guarantee. Known unresolved owned actors remain blocking.

### 8.2 a2: Source offer plus shared bare cache and worktrees

Keep the same offer/receipt contract but allocate builds from a shared source cache.

Resolve and persist the same source-only offer, use a source-scoped bare Git cache and allocate detached per-operation worktrees, then publish the same complete immutable candidate and dev receipt. Track worktree/cache ownership separately from manager/controller and keep mutable selected sources outside payloads. Lifecycle and migration still use shared owner ports.

**Rejected because:** The prior alternative adds source preparation machinery unnecessary for the existing S2 mechanics or the user-selected owned/cooperating actor scope; a1 satisfies ac1-ac3 and all consumed shared contracts.

## 9. References

- **[[c1]]** `prior-artifact` `docs/epics/reliable-cross-platform-daemon-installation-lifecycle-E20261123c3d71313/HLD.md`
- **[[c2]]** `doc` `AGENTS.md`
- **[[c3]]** `prior-artifact` `docs/epics/reliable-cross-platform-daemon-installation-lifecycle-E20261123c3d71313/DEF.md`
- **[[c4]]** `code` `src/installer/peer-contracts.ts`
- **[[c5]]** `code` `src/installer/bundle.ts`
- **[[c6]]** `code` `src/installer/manager.ts`
- **[[c7]]** `code` `src/installer/manager-entry.ts`
- **[[c8]]** `code` `scripts/package-installer.mjs`
- **[[c9]]** `code` `scripts/test-harness/build.mjs`
- **[[c10]]** `code` `src/installer/runtime-policy.ts`
- **[[c11]]** `code` `src/installer/production-peers.ts`
- **[[c12]]** `code` `src/installer/installed-launcher.ts`
- **[[c13]]** `code` `scripts/test-harness/process.mjs`
- **[[c14]]** `code` `src/installer/controller-store.ts`
- **[[c15]]** `prior-artifact` `docs/epics/reliable-cross-platform-daemon-installation-lifecycle-E20261123c3d71313/S001/LLD.md`
- **[[c16]]** `code` `src/installer/terminal-install.ts`
- **[[c17]]** `code` `scripts/installer-payload.mjs`
- **[[c18]]** `code` `scripts/test-harness/context.mjs`
- **[[c19]]** `doc` `docs/plans/s2-dev-preparation-ownership-blocker-2026-11-24.md` — "The user explicitly selected the first guarantee in chat: "limit it to the first as guranteed"."
- **[[c20]]** `code` `src/installer/dev-worker.ts`
- **[[c21]]** `code` `src/installer/safe-zip.ts`

## Citations

- **[[c1]]** `prior-artifact` `docs/epics/reliable-cross-platform-daemon-installation-lifecycle-E20261123c3d71313/HLD.md`
- **[[c2]]** `doc` `AGENTS.md`
- **[[c3]]** `prior-artifact` `docs/epics/reliable-cross-platform-daemon-installation-lifecycle-E20261123c3d71313/DEF.md`
- **[[c4]]** `code` `src/installer/peer-contracts.ts`
- **[[c5]]** `code` `src/installer/bundle.ts`
- **[[c6]]** `code` `src/installer/manager.ts`
- **[[c7]]** `code` `src/installer/manager-entry.ts`
- **[[c8]]** `code` `scripts/package-installer.mjs`
- **[[c9]]** `code` `scripts/test-harness/build.mjs`
- **[[c10]]** `code` `src/installer/runtime-policy.ts`
- **[[c11]]** `code` `src/installer/production-peers.ts`
- **[[c12]]** `code` `src/installer/installed-launcher.ts`
- **[[c13]]** `code` `scripts/test-harness/process.mjs`
- **[[c14]]** `code` `src/installer/controller-store.ts`
- **[[c15]]** `prior-artifact` `docs/epics/reliable-cross-platform-daemon-installation-lifecycle-E20261123c3d71313/S001/LLD.md`
- **[[c16]]** `code` `src/installer/terminal-install.ts`
- **[[c17]]** `code` `scripts/installer-payload.mjs`
- **[[c18]]** `code` `scripts/test-harness/context.mjs`
- **[[c19]]** `doc` `docs/plans/s2-dev-preparation-ownership-blocker-2026-11-24.md` — "The user explicitly selected the first guarantee in chat: "limit it to the first as guranteed"."
- **[[c20]]** `code` `src/installer/dev-worker.ts`
- **[[c21]]** `code` `src/installer/safe-zip.ts`
