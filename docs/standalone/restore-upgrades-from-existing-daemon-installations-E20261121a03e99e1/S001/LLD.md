<!-- insrc:artifact LLD-a03e99e17a364550-s1 -->

# LLD: STORY-a03e99e17a364550-s1 — Design the approved ISSUE-a03e99e17a364550: restore end-to-end historical and runtime-bound daemon source upgrades on qualified macOS/Linux, independently bootstrapping owned Node/npm before native builds and retaining staged activation, trust, rollback and data. Include recovery for partially failed old updates and real historical upgrade qualification.

## Summary

**Epic:** `restore-upgrades-from-existing-daemon-installations`
**HLD base run:** `wf-1795277045609-pvtnhf`
**HLD effective hash:** `6593ac1cd33b...`

Restore upgrades from historical and runtime-bound source daemon installations using a current independently delivered bootstrap. Build and native-check the candidate with verified Node/npm before disturbing the incumbent, then activate through the existing macOS owner or a Linux source transaction with durable rollback. Historical clients need a one-time current installer/client delivery; partially failed installations receive explicit diagnosis and a qualified recovery route.

## Contents

1. [HLD context](#1-hld-context)
2. [Contract details](#2-contract-details)
3. [Data model changes](#3-data-model-changes)
4. [Diagrams](#4-diagrams)
5. [Error paths](#5-error-paths)
6. [Test strategy](#6-test-strategy)
7. [Migration](#7-migration)
8. [Alternatives considered](#8-alternatives-considered)
9. [References](#9-references)

## 1. HLD context

**Framework:** Standalone feature — no parent HLD. Design directly against the repo, grounded on the s1 analyze passes. There are no HLD shared contracts to honour.
**Rollout phase:** standalone

## 2. Contract details

**Surface level:** internal-shared

### 2.1 `resolveOwnedToolchain`

```typescript
resolveOwnedToolchain(installationRoot: string, stateRoot?: string, migration?: boolean): Promise<OwnedToolchain>
```

**Parameters:**
- `installationRoot: string` — Authorized candidate/bootstrap checkout, never an incumbent helper selected implicitly by upgrade.
- `stateRoot: string` _(optional)_ — Private runtime store of this installation.
- `migration: boolean` _(optional)_ — Allow staging with retained legacy runtime marker; never permits incumbent mutation.

**Returns:** `Promise<OwnedToolchain>` — Verified exact policy Node and matching npm for the candidate.

**Errors:**
- `Error` when Missing/corrupt archive, unsafe store, disabled target, conflicting binding or injected runtime.

**Preconditions:**
- Bootstrap assets are delivered independently by the current installer/client and their source is authorized before executing candidate code.

**Postconditions:**
- No ambient npm is selected; old runtime remains pinned and unchanged.

### 2.2 `ownedNodeEnvironment`

```typescript
ownedNodeEnvironment(toolchain: OwnedToolchain, parent?: NodeJS.ProcessEnv): NodeJS.ProcessEnv
```

**Parameters:**
- `toolchain: OwnedToolchain` — Verified runtime selected for this candidate.
- `parent: NodeJS.ProcessEnv` _(optional)_ — Caller configuration, preserving explicit ONNX choices.

**Returns:** `NodeJS.ProcessEnv` — Matching Node PATH/native headers, clean Node injection variables, Python no-bytecode protection and unset-only ONNX skip.

**Preconditions:**
- Use only the verified candidate toolchain.

**Postconditions:**
- All install/build/smoke subprocesses receive the environment; CXXFLAGS retain caller flags and append required C++17.

### 2.3 `stageManagedRelease`

```typescript
stageManagedRelease(options: StageOptions): Promise<{ readonly candidate: StagedReleasePin; readonly prior?: StagedReleasePin; readonly compatibility?: QualifiedReleasePair }>
```

**Parameters:**
- `options: StageOptions` — Exact authorized source commit, qualified prior/candidate compatibility, separately pinned prior runtime and candidate build context.

**Returns:** `Promise<{ candidate: StagedReleasePin; prior?: StagedReleasePin; compatibility?: QualifiedReleasePair }>` — Fully built/native-smoked candidate and verified rollback pin; no live cutover.

**Errors:**
- `Error` when Source authorization or compatibility fails; predecessor dirty/unqualified; native build fails; pin changes.

**Preconditions:**
- Extract reusable source qualification/staging logic only where necessary; do not call Darwin lifecycle gate from Linux.
- Candidate authorization pins a full commit before npm lifecycle hooks; signed deployments retain verifier/floor/channel checks.
- Historical prior must qualify by actual executable/dependency bytes and compatibility, not merely newer source HEAD.

**Postconditions:**
- Absolute matching Node/npm execute npm ci/build/native smoke.
- Candidate binding is published only after verification; live selector/process/store unchanged.
- Platform-neutral staging storage is supplied explicitly where needed, preserving existing macOS default location and API compatibility.

### 2.4 `prepareLegacyUpgrade`

```typescript
prepareLegacyUpgrade(root: string, checkout: string, override: UpdateSource, bootstrap: string): Promise<unknown>
```

**Parameters:**
- `root: string` — Private state root.
- `checkout: string` — Historical source root retained for rollback.
- `override: UpdateSource` — Validated source channel.
- `bootstrap: string` — Independent authenticated bootstrap material.

**Returns:** `Promise<unknown>` — Existing macOS staged-migration outcome remains authoritative; Linux uses a separate source transaction adapter and never enters launchctl/Darwin gate.

**Errors:**
- `Error` when Absent verifier, unsupported launch profile, invalid predecessor, changed pins or non-quiescent cutover.

**Preconditions:**
- Retain current macOS signature, supervisor/job ownership and compatibility checks.
- New installer/client reaches current bootstrap without executing old update/npm functions.

**Postconditions:**
- No signature bypass or reinterpretation of a Linux source selector as a macOS managed selector.

## 3. Data model changes

### 3.1 `Upgrade bootstrap delivery and routing` — new

One self-contained current installer/bootstrap is the upgrade authority for newly shipped VS Code/JetBrains, shell ctl, TUI and daemon update helper. Client package generation embeds canonical runtime assets and authenticated source-release bootstrap where that channel requires it. Never run the target's old daemon-ctl update/restart to build it. An old daemon/TUI/client cannot be rewritten in flight: recovery explicitly requires obtaining the newly packaged installer or updating the client, then invoking --migrate-runtime against the existing root; document exact supported distribution/channel and prerequisites. New bootstrap resolves installed selection before routing, preventing fallback to legacy root. Pure stop/start actions retain their owner. Source/managed bundle policies remain distinct.

**Call sites:**
- `scripts/insrc-daemon-install.sh`
- `scripts/daemon-ctl.sh`
- `src/shared/owned-node-runtime.ts`
- `src/daemon/managed-update-preparation.ts`

### 3.2 `Linux source installation selection` — new

Private versioned source-lifecycle selector (separate from managed-lifecycle/installation.json) belongs to one canonical state root and maps one stable logical install root to exactly one selected immutable release root and verified runtime binding; records generation, source channel, commit, compatibility identity and prior reference. One selector has zero or one active transaction; each transaction references exactly one candidate and zero or one qualified predecessor. Release/runtime objects may be referenced by multiple retained receipts and are never GC'd here. All Linux shell, IDE, TUI, daemon and MCP/start resolution must consume this selection with schema/ownership/canonical-root validation; an absent selector means legacy behavior, a malformed selector is fatal. Do not overwrite/rename the incumbent checkout or make source runtime binding itself a mutable release selector. Darwin and signed bundle selectors are untouched. No persisted registry/entity/DB relationship changes.

**Call sites:**
- `src/shared/managed-daemon-installation.ts`
- `src/shared/owned-node-runtime.ts`
- `scripts/daemon-ctl.sh`
- `scripts/insrc-daemon-install.sh`

### 3.3 `Linux source upgrade transaction` — new

Versioned private journal under source-lifecycle: operation id, state root, old selector or absent sentinel, selected generation, authenticated channel/candidate receipt, prior and candidate pins/runtime references, wasRunning, retained process identity, phase, bounded diagnostic outcome. States reserved -> qualified/staged -> predecessor-exited -> candidate-selected -> candidate-ready -> committed; rollback-required/rolled-back/recovery-required are explicit terminal or recoverable states. One exclusive installation mutation owner serializes update/start/restart during cutover; acquire before capture and recheck at every transition. Reuse existing retained process capability/run-file guard APIs for Linux and kernel-observed exit, not PID age or kill(pid,0). Durable fsync+atomic selector replace with same-filesystem journal checkpoints; unknown fsync/rename outcome must be reread and reconciled before spawn. Recovery never opens live DBs from a client and never releases exclusion while actor closure is unknown.

**Call sites:**
- `src/daemon/managed-release-staging.ts`
- `src/daemon/managed-update-recovery.ts`
- `src/shared/managed-daemon-installation.ts`

### 3.4 `Predecessor qualification and failed-update recovery` — invariant-change

Inventory independently identifies source HEAD, built output provenance/hash, npm install marker/dependency integrity, runtime binding, live executable/root and dirty tracked/untracked files. Never infer built provenance from current HEAD if out is stale. Dirty source/lockfiles are preserved, diagnosed and never reset/stashed automatically. Normal cutover requires a validated restartable rollback pin plus an authorized compatibility pair for actual prior bytes. Missing/partial node_modules or unverifiable stale output blocks cutover while candidate preparation/diagnostic can proceed. Explicit recovery offers an independently staged last-known-good predecessor from an authenticated qualified commit, or a fresh side-by-side installation when no rollback baseline can be proven; user data remains retained and compatibility-gated. No automatic destructive repair or guessed restart from partial bytes. A running historical daemon can stay running while recovery inputs are prepared. A stopped broken daemon is not described as a working predecessor.

**Call sites:**
- `src/daemon/managed-release-staging.ts`
- `src/daemon/managed-update-preparation.ts`
- `scripts/insrc-daemon-install.sh`

### 3.5 `Source authorization and platform qualification` — invariant-change

Reuse authenticated source release verifier/catalog and floor semantics before executing candidate npm hooks; factor portable verification/staging from Darwin-only journal admission without replacing macOS owner. Linux source predecessor profiles and compatibility evidence must be explicitly represented and qualified in source-release packaging/verification; do not claim managed/signed Linux bundle support. Missing production signing/bootstrap material fails before incumbent mutation and provides the actual authenticated installer distribution prerequisite, not the current circular migration advice. Candidate source cannot authorize its own compatibility or weaken the verifier. No keys are created/committed by this work. Windows/darwin-x64 remain disabled. Old installs cannot acquire this guarantee through their unchanged updater alone.

**Call sites:**
- `src/daemon/managed-update-preparation.ts`
- `src/daemon/managed-release-staging.ts`
- `scripts/insrc-daemon-install.sh`

## 4. Diagrams

- [ER model](docs/standalone/restore-upgrades-from-existing-daemon-installations-E20261121a03e99e1/S001/er-model.html)
- [Sequence diagram](docs/standalone/restore-upgrades-from-existing-daemon-installations-E20261121a03e99e1/S001/sequence-diagram.html)

## 5. Error paths

**Error cases**

- **Bootstrap/verifier missing, wrong channel, revoked floor or unqualified predecessor** (recoverable)
  - Detection: Verify delivered source bootstrap, signed receipt/catalog, exact commit, profile and compatibility before candidate npm execution.
  - Response: Fail preparation with a concrete current-installer/channel prerequisite; preserve incumbent and receipt floor; never bootstrap from candidate assertions.
  - User impact: Upgrade withheld; old install remains selected.
- **Archive/cache corruption or ambient Node/npm injection** (recoverable)
  - Detection: Digest, private ownership, full runtime inventory and binding checks fail; child probes record unexpected executable/npm identity.
  - Response: Reject/re-provision from verified archive using existing runtime owner; no ambient fallback or inventory relaxation.
  - User impact: No native build/cutover under an unknown runtime.
- **npm ci, native compilation, build or smoke failure** (recoverable)
  - Detection: Absolute owned subprocess returns nonzero, times out, or native smoke fails; retain exact command/error and child closure evidence.
  - Response: Publish bounded failure diagnostic, retain incumbent selection/data and safe resumable candidate evidence; reap only owned children.
  - User impact: Working daemon continues; no restart into partial output.
- **Dirty or partly failed historical install** (recoverable)
  - Detection: Compare git status, lockfile/install marker, built output provenance, runtime inventory, live process root and exact predecessor pin.
  - Response: Preserve all source/lock changes and block cutover until independently staged qualified rollback baseline or explicit side-by-side recovery is admitted.
  - User impact: Actionable recovery instead of another destructive in-place update.
- **Concurrent update/start or selector changed** (recoverable)
  - Detection: Exclusive reservation/generation comparison and re-read prior pin/selector before each transition detect interference.
  - Response: Refuse second mutation; on stale owner use retained incarnation/kernel exit proof and journal recovery, never timestamp-only lock breaking.
  - User impact: One owner may mutate selection/run files.
- **Predecessor refuses shutdown or child closure uncertain** (recoverable)
  - Detection: Retained process capability and kernel-observed exit/run-file guard cannot prove quiescence.
  - Response: Keep old selector; withhold candidate start. Invoke existing platform owner stop behavior without adding new PID/IPC fallback logic.
  - User impact: Upgrade may wait/fail safely; no second daemon opens same stores.
- **Candidate fails readiness after selection** (recoverable)
  - Detection: Check expected process incarnation, candidate executable/root/commit and daemon health within bounded startup window.
  - Response: Prove candidate/children exited, restore exact prior selector or absent sentinel durably, restart qualified prior only if wasRunning. If closure or compatibility unknown remain recovery-required and excluded.
  - User impact: Rollback if provably safe; otherwise explicit recovery state.
- **Crash or disk error during journal/selector publication** (recoverable)
  - Detection: Reopen bounded owned journal, fsync receipts and selector; compare generation, pins and actual actor identities.
  - Response: Reconcile idempotently before spawn; uncertain durable state is recovery-required. Never assume rename failure means old selection persisted.
  - User impact: Retry cannot start both releases or lose rollback reference.

**Edge cases**

| Input | Expected |
| :--- | :--- |
| No ambient node/npm, ambient20/26 or hostile shell PATH; explicit ONNX v12 or empty. | Independent bootstrap selects policy22.22.1/npm10.9.4; child environment protects Python inventory and defaults CUDA only when truly unset. |
| Stopped clean historical installation with known runtime. | Stage and select only qualified pair, retain stopped state; start only if requested by the invoking restart action. |
| Unchanged old daemon/client entrypoint. | It cannot self-acquire the new implementation; documented one-time new installer/client route is required and tested. |
| Already migrated Linux source or existing signed macOS managed release. | Resolve selected release before update; use source transaction on Linux and unchanged managed authority on Mac, including subsequent update and rollback. |
| Source checkout contains local changes or stale out after failed npm. | No automatic git reset/checkout/stash or dependency repair in place. Diagnose/preserve and require qualified recovery baseline before cutover. |
| Unsupported Windows/darwin-x64 or missing signing material. | Explicit unsupported/prerequisite error, never target enablement or trust downgrade. |

**Invariants to preserve**

- Runtime candidate build uses verified matching owned Node/npm and separately retained predecessor runtime; grounded by s1 runtime/staging analyzer bundle. [[c1]]
- stageManagedRelease prepares candidate before platform cutover; existing managed recovery APIs remain macOS authority, grounded by s1 staging/usage/recovery bundle. [[c1]]
- Missing Linux staged route remains an explicit defect until actual native historical upgrade evidence qualifies it; graph completeness limits remain disclosed. [[c1]]

## 6. Test strategy

**Test framework:** `Existing TypeScript *.test.ts suites (node:test and node:assert/strict, verified in src/daemon/__tests__/macos-upgrade-routing.test.ts), run through the canonical Node22 test coordinator; existing macOS staging/routing suites extended, not replaced by mocks.`

**Test levels**

- **contract** — Prove every updated launcher reaches the current independent bootstrap before any old npm path and consumes selected release after migration.
  - Subjects: `VS Code install/update/restart and child environment`, `JetBrains installer/provisioner update/restart and packaged bootstrap`, `TUI maintenance, daemon detached updater, shell ctl, standalone --migrate-runtime`, `Authenticated source packaging completeness and no-signature downgrade`
  - Fixtures: `Exact historical a30aa7f91 ctl and pre-owned-runtime clients`, `Bound source install and current signed managed fixtures`, `Old-updater hostile ambient npm sentinel`
- **unit** — Validate boundary parsers, selector ownership/generation, preservation and journal transitions without mirroring implementation.
  - Subjects: `Linux source selector/journal schema, symlink/hardlink/path/uid/mode rejection`, `Prior built provenance versus newer source HEAD`, `ONNX unset/empty/explicit and Node injection environment`, `Malformed/missing source qualification and rollback compatibility`
- **integration** — Exercise real process capability ownership and interrupted cutover deterministically.
  - Subjects: `Two concurrent update/start attempts and stale owner identity reuse`, `Fault injection before/after each durable phase including rename/fsync unknown result`, `Native build timeout/failure with child closure before cutover`, `Predecessor exit refusal, failed candidate readiness, exact prior restoration and wasRunning behavior`, `Dirty lockfile/source and partially installed node_modules preservation`
  - Fixtures: `Isolated INSRC state roots and disposable source repos`, `OS processes with retained capability handles, no user's real daemon`, `Existing staging/transaction fault fixtures`
- **live** — Qualify actual historical native installation to current plus second update using real dependencies; fresh-install proof alone is insufficient.
  - Subjects: `Actual darwin-arm64 source predecessor a30aa7f91 -> candidate -> next candidate, existing authenticated managed path regression`, `OrbStack Ubuntu linux-arm64 and linux-x64 historical source -> current -> subsequent update`, `No ambient Node, Node20/26 and hostile PATH; actual absolute Node/npm process identity logs`, `Actual tree-sitter/LMDB/fs-ext/Lance/Duck loads and CPU ONNX binding`, `Seeded user state/config preservation via daemon IPC, no overlapping DB actor`, `Failed build-before-cutover and failed start rollback/retry with all owned child processes closed`
  - Fixtures: `Recorded authenticated source-release package/catalog and qualified predecessor pair`, `Official verified22.22.1 target archives and matching npm`, `8GB OrbStack machines; x64 emulation caveat recorded`, `Historical installed out/dependencies plus source-ahead/partial npm fixtures`
- **smoke** — Verify generated installer/client payload and review artifacts.
  - Subjects: `Generated canonical/client bootstrap parity and required source authorization material`, `Supported old-client one-time recovery command works independently of old installed out`, `Generated ownership diagram source/HTML consistency; disclose render availability`, `Final controller census and cleanup confirmedClosed after tests`

**Acceptance mapping**

| Criterion | Proving tests |
| :--- | :--- |
| `ac1` | `Historical ctl with hostile npm is never used for candidate build by new entrypoints; Node/npm executable identity captured on every qualified target.`, `Independent current installer succeeds with absent/20/26 ambient Node; native child defaults preserve explicit overrides.` |
| `ac2` | `Actual historical -> current -> subsequent migrated-install update on macOS and both OrbStack architectures through standalone and applicable launcher adapters.`, `Normal startup/MCP consumes Linux selected release; managed Mac routes unchanged.` |
| `ac3` | `Prebuild failure leaves prior process/selection/data unchanged; failed candidate readiness rolls back only after closure proof.`, `Missing/invalid signatures, wrong profile/floor/compatibility and dirty prior block before cutover.`, `Concurrent start/update and crash at each durable phase cannot overlap daemon DB ownership.` |
| `ac4` | `Newer source with stale out, partial npm/deleted marker and dirty lockfile all diagnose/preserve incumbent.`, `Explicit independently staged qualified rollback baseline recovery and no-baseline side-by-side path; unsafe automatic cutover refused.` |
| `ac5` | `Recorded actual npm/native build, start/status/restart/stop and owned-child census for historical upgrade matrix.`, `No fixture-only qualification claim; exact source/runtime/OS receipts and remote error attribution limits documented.` |

## 7. Migration

**State before:** s1 analyzer bundle c1 locates resolveOwnedToolchain/stageManagedRelease/prepareLegacyUpgrade and recovery APIs, shell migration/refusal literals, and incomplete caller/model graph. Direct source checks confirm managed selector/gate are Darwin-only; exact a30aa7f91 old updater invokes ambient npm and existing Linux target is refused. Existing fresh-install native evidence is not historical-upgrade proof.

**State after:** A newly delivered current bootstrap can stage and qualify a candidate independently of old installed code. macOS uses its existing authenticated lifecycle; qualified Linux source installations use a private durable selection/transaction adapter. Subsequent updates consume selection consistently. Failed historical updates are diagnosed and preserved until qualified recovery is possible.

**Zero downtime:** no — **Data rewrite:** no

**Steps**

1. Deliver current self-contained authenticated source installer through release packaging and current IDE assets, with canonical runtime assets/public verifier and qualified predecessor catalog. The release operator retains signing key custody; implementation must not create a replacement trust root. Document invoking the obtained installer via /bin/bash <current-installer> --target <existing-root> --migrate-runtime with explicit source options. Old clients/TUI/daemon require this one-time external delivery; do not instruct them to rebuild the old install to acquire it. — ↩ rollbackable
2. Inventory incumbent state without modifying it: selector/generation, source channel/HEAD/dirt, output/dependency provenance, live actor/runtime and data compatibility. Record actual old executable identity. Dirty or stale/partial state branches to explicit recovery diagnostics; prepare independent qualified rollback baseline or side-by-side recovery, never reset local edits or infer provenance from current HEAD. — ↩ rollbackable
3. Independently bootstrap verified candidate Node/npm, authenticate exact source/compatibility/predecessor/profile, stage source and native install/build/smoke out of tree; pin prior and candidate runtimes separately and retain references. No live stores or incumbent code/dependencies change. Staged resources are retained or cleaned only after owned-child closure, never while referenced. — ↩ rollbackable
4. Acquire platform mutation admission. Revalidate selector/pins; capture and stop the incumbent through its owner only after staging is complete. Prove original process and relevant children exited and hold run-file exclusion. Persist cutover checkpoint, publish candidate selection durably, then start only if action/previous running state requires it. macOS remains on existing managed cutover; Linux source adapter owns its new selector and recovery journal. — ↩ rollbackable
5. Readiness must identify candidate process/root/commit and health. Commit outcome on success. On failure prove candidate closure before restoring exact prior selector (including absent legacy selection), then restart qualified prior only when it was running and compatibility permits. Unknown closure/state leaves recovery-required and withholds another start. — ↩ rollbackable
6. Qualify historical-to-current and a second update on actual Mac and both OrbStack targets. Ship source-selection consumption to all applicable clients/launchers in the same release, retaining compatibility with absent selectors. Retain incumbent checkout, data and runtime receipts; this work performs no GC. — ↩ rollbackable

**Backward compat:** Existing daemon IPC methods/result payloads remain compatible; update launch acknowledgments remain distinct from final outcomes. Existing signed macOS managed installation schema, supervisor and bundle policy stay authoritative. Linux selector is additive and absent means legacy routing; malformed means explicit failure. New clients resolve selected release before start/MCP/update. An unchanged old binary is not guaranteed to understand new selection: route it through one-time installer/client update and document that legacy launchers must not start retained roots directly after migration. Update versus restart running-state semantics must remain explicit. No Windows support, deprecated fork work or new IPC-stop fallback.

## 8. Alternatives considered

### 8.1 a1: Independent bootstrap with staged source transactions — **CHOSEN**

Deliver the current bootstrap outside the incumbent, share owned-runtime staging, and keep activation with each platform's lifecycle owner.

New clients and a newly delivered self-contained installer invoke the same current upgrade bootstrap rather than old ctl update functions. Preserve macOS authenticated managed migration/update and add a Linux source installation selector plus durable source transaction adapter around existing verified staging/runtime APIs. Keep signed bundle and source authority distinct; never turn off signature gates to accommodate raw installers.

### 8.2 a2: Extend the macOS managed supervisor to Linux

Use one platform-neutral supervisor/selector for every installation.

Generalize the current Darwin incarnation, launchctl job, managed mutation gate and recovery contracts into platform-neutral services, then route all upgrades through the expanded supervisor.

**Rejected because:** Satisfies acceptance only by redesigning unrelated platform supervisor contracts; a1 reuses existing macOS authority with less scope.

### 8.3 a3: Deliver only a runtime-prefixed legacy updater

Prefix Node/npm and native environment around old installed scripts.

New launchers provision Node/npm and export their environment before invoking old ctl update. Keep old in-place git/npm behavior and existing-target installer refusal.

**Rejected because:** Fails qualified staged migration, data/rollback preservation, partial-update recovery and historical upgrade proof; runtime prefix alone is insufficient.

## 9. References

- **[[c1]]** `analyze-bundle` `design.story s1 context.assemble: symbol.locate, data-model.trace, usage.example, search.text, test.locate, module.profile` — "stageManagedRelease, prepareLegacyUpgrade, resolveOwnedToolchain, ownedNodeEnvironment, readInstallationSelector located; recovery exports identified. Graph model/caller completeness not established."
- **[[c2]]** `prior-artifact` `docs/standalone/restore-upgrades-from-existing-daemon-installations-E20261121a03e99e1/ISSUE.md` — "Approved historical-updater ambient npm routing reproduction and actual Linux existing-target refusal; missing remote error remains an attribution limit."
- **[[c3]]** `code` `src/daemon/managed-release-staging.ts:168-256` — "Candidate authorized, built with matching owned runtime/npm, native-smoked and pinned before cutover."
- **[[c4]]** `code` `src/shared/managed-daemon-installation.ts:94-100` — "readInstallationSelector returns undefined outside Darwin; managed mutation gate separately requires macOS."
- **[[c5]]** `code` `scripts/prepare-source-release.mjs` — "Source promotion consumes qualification evidence, signs release tag with operator key and packages verifier using provided public key."
- **[[c6]]** `code` `src/daemon/__tests__/macos-upgrade-routing.test.ts` — "Existing node:test/assert fixture routing uses shim delegates; cannot substitute for real historical native upgrade qualification."
