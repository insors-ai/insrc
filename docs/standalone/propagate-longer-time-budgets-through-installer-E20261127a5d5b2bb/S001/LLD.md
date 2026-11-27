<!-- insrc:artifact LLD-a5d5b2bb021655d0-s1 -->

# LLD: STORY-a5d5b2bb021655d0-s1 — Propagate longer time budgets through installer qualification

## Summary

**Epic:** `propagate-longer-time-budgets-through-installer`
**HLD base run:** `wf-1795787623125-0c9h3u`
**HLD effective hash:** `4d00a48b868b...`

Add an explicit qualification profile for slow USB-backed VMs, with larger finite allowances reaching every nested preparation and runtime I/O scope. Normal operation keeps its existing numeric defaults. The design preserves exact integrity, durable writes, cancellation and ownership proof, while exposing the selected budgets in native evidence. [[c3]]

## Contents

1. [Epic impact analysis](#1-epic-impact-analysis)
2. [HLD context](#2-hld-context)
3. [Contract details](#3-contract-details)
4. [Data model changes](#4-data-model-changes)
5. [Diagrams](#5-diagrams)
6. [Error paths](#6-error-paths)
7. [Test strategy](#7-test-strategy)
8. [Migration](#8-migration)
9. [Alternatives considered](#9-alternatives-considered)
10. [References](#10-references)

## 1. Epic impact analysis

**Does not apply**: Standalone budget prerequisite; no prior approved BUILD in this work item.

## 2. HLD context

**Framework:** Standalone feature — no parent HLD. Design directly against the repo, grounded on the s1 analyze passes. There are no HLD shared contracts to honour.
**Rollout phase:** standalone

## 3. Contract details

**Surface level:** internal-shared

### 3.1 `checkedBudgets`

```typescript
checkedBudgets(overrides?: Partial<BuildRun['budgets']>): BuildRun['budgets']
```

**Parameters:**
- `overrides: Partial<BuildRun['budgets']>` _(optional)_ — Explicit per-scope ceilings, including deliberately short test clocks; overlay selected coordinator defaults.

**Returns:** `BuildRun['budgets']` — Exactly buildMs/fileMs/runMs/cleanupMs, all positive safe integer milliseconds.

**Errors:**
- `qualification-profile-invalid` when The process selector is present but is not normal or slow-vm.
- `harness-context-invalid` when An override has an unknown key or a nonpositive/noninteger/nonfinite value.

**Preconditions:**
- The fixed qualification policy is selected once when its side-effect-free module is imported; select the environment before starting Node. [[c1]] [[c2]] [[c3]]
- No numeric duration is accepted from the profile environment selector. [[c1]] [[c2]] [[c3]]

**Postconditions:**
- Normal behavior remains byte-for-byte equivalent in numeric defaults. [[c1]] [[c2]] [[c3]]
- Explicit overrides remain last and are never multiplied, allowing accelerated negative tests. [[c1]] [[c2]] [[c3]]
- No filesystem/network/process operation is performed by policy selection or budget validation. [[c1]] [[c2]] [[c3]]

### 3.2 `createRun`

```typescript
createRun(root: string, options?: { mode?: 'test' | 'build'; selectedFiles?: string[]; budgets?: Partial<BuildRun['budgets']>; runId?: string }): BuildRun
```

**Parameters:**
- `root: string` — Existing canonical root whose lease is acquired by the existing coordinator.
- `options: Run options` _(optional)_ — Existing scope metadata and explicit role budgets; callers pass selected role values instead of leaving hidden defaults.

**Returns:** `BuildRun` — Existing retained owner with resolved numeric budgets and unchanged persisted lease schema.

**Errors:**
- `Error & { code: 'harness-context-invalid' | 'harness-busy' | 'harness-runtime-unsupported' | 'qualification-profile-invalid' }` when Invalid budget/profile/runtime/root or an existing active lease; reject before admitting work.

**Preconditions:**
- Profile is selected before any operation-root allocation. [[c1]] [[c2]] [[c3]]
- The manager uses its manager role, worker uses coordinator role, qualification uses qualification role, and Git resolution uses its existing narrow scope with its selected role override. [[c1]] [[c2]] [[c3]]

**Postconditions:**
- Every child environment carries the canonical fixed profile name, including private npm aliases and worker launch; no process.env mutation is used to switch a live process. [[c1]] [[c2]] [[c3]]
- Normal role caps match existing explicit defaults/overrides; slow-vm roles are all at least their normal role values. [[c1]] [[c2]] [[c3]]
- Actual budgets remain present in existing run.json records for independent audit. [[c1]] [[c2]] [[c3]]

### 3.3 `launchDevWorker`

```typescript
launchDevWorker(scope: CommandScope, location: InstallationLocation, record: DevPreparationRecord, options: { entrypoint: string; signal?: AbortSignal; ownerInput?: Readable; environment: NodeJS.ProcessEnv; budgetMs?: number; deadline?: Readonly<{ expiresAt: number; reserveMs: number }> }): Promise<DevPreparationResult>
```

**Parameters:**
- `scope: CommandScope` — Existing retained manager command owner.
- `location: InstallationLocation` — Exact isolated installation identity.
- `record: DevPreparationRecord` — Existing accepted attempt and worker binding.
- `options: Existing launch options plus optional local deadline` — Carry canonical profile through environment; deadline is monotonic parent-process state, never JSON, IPC or persisted authority.

**Returns:** `Promise<DevPreparationResult>` — Existing qualified final result only after actual child and coordinator closure.

**Errors:**
- `InstallerError('source-build-failed')` when The selected parent allowance is exhausted before worker admission; no worker is spawned.
- `InstallerError('preparation-uncertain' | 'source-cancelled' | 'runtime-invalid')` when Existing identity/ownership, actual closure, explicit cancellation or canonical runtime checks fail.

**Preconditions:**
- ownedScope captures its monotonic expiry when admitting manager work and passes it through this same parent process. [[c1]] [[c2]] [[c3]]
- After runtime verification, immediately before scope.start, cap the child allowance by the selected worker cap, any explicit budgetMs and positive parent remaining time minus the manager cleanup reserve. [[c1]] [[c2]] [[c3]]
- The worker receives only the canonical profile environment name; DevWorkerLaunch JSON is unchanged. [[c1]] [[c2]] [[c3]]

**Postconditions:**
- Runtime verification/setup cannot consume the child's reserved cleanup time unnoticed. [[c1]] [[c2]] [[c3]]
- Larger allowances never delay explicit cancellation; it still uses the existing cancel frame and retained owned-process coordinator. [[c1]] [[c2]] [[c3]]
- Worker lifetime, manager cooperative drain and outer cancellation reserves are ordered so a child can attempt complete finalization before forced disposal; uncertainty still blocks handoff. [[c1]] [[c2]] [[c3]]

### 3.4 `qualifyRuntimeFoundation`

```typescript
qualifyRuntimeFoundation(options?: { parent?: string; baseline?: string }): Promise<string>
```

**Parameters:**
- `options: Existing parent/baseline options` _(optional)_ — Choose a fresh evidence root and target baseline; profile is selected in the starting process environment.

**Returns:** `Promise<string>` — Existing result.json path, containing actual profile/caps as qualification evidence.

**Errors:**
- `Error & { code: 'qualification-profile-invalid' }` when Unsupported selector before a fresh home or lease is allocated.
- `AssertionError | InstallerError | DOMException | (Error & { code: 'harness-interrupted' | 'harness-cleanup-unconfirmed' })` when An actual stage/integrity/native assertion, cancellation/deadline or positive closure check fails; preserve result and evidence.

**Preconditions:**
- Opt in using INSRC_QUALIFICATION_PROFILE=slow-vm before Node starts; absent/normal retains current role budgets. [[c1]] [[c2]] [[c3]]
- Select the outer role before copying resources or allocating the evidence root. [[c1]] [[c2]] [[c3]]
- The outer run's wall-clock cancellation is also connected to the qualification AbortController passed into acquisition/preparation, including in-process packaging. [[c1]] [[c2]] [[c3]]

**Postconditions:**
- Outer cancellation propagates across independently owned manager and worker scopes; it is not limited to children directly registered with the outer scope. [[c1]] [[c2]] [[c3]]
- Record profile, resolved role table and actual observed outcomes at the beginning of result.json; profile metadata is evidence, never an enablement or success claim. [[c1]] [[c2]] [[c3]]
- The outer work allowance is five hours in slow-vm mode with a separately counted bounded final drain; a containing operator budget must include final drain and diagnostic headroom. [[c1]] [[c2]] [[c3]]
- No host daemon/Ollama start, release enablement, automatic retry or old-attempt adoption is added. [[c1]] [[c2]] [[c3]]

### 3.5 `closedRuntimeOperation`

```typescript
closedRuntimeOperation<T>(operation: Promise<T>, signal: AbortSignal): Promise<T>
```

**Parameters:**
- `operation: Promise<T>` — Existing owned runtime I/O work, including its actual file/network/parser closure.
- `signal: AbortSignal` — Existing cancellation/deadline signal.

**Returns:** `Promise<T>` — Actual operation result or explicit uncertainty after the selected finite drain.

**Errors:**
- `resource-close-uncertain` when Actual resource closure is not confirmed within the selected drain interval.

**Preconditions:**
- Existing resource-drain guard is selected from the same process policy: five seconds normal, thirty seconds slow-vm. [[c1]] [[c2]] [[c3]]
- A synchronous close has no invented asynchronous timeout; closeOwnedFile/Descriptor still require actual successful close. [[c1]] [[c2]] [[c3]]

**Postconditions:**
- A timeout never counts as closure and never authorizes deleting a live/unknown stage. [[c1]] [[c2]] [[c3]]
- ZIP decoder and enclosing download/file drain guards use the selected interval; no five-second literal silently truncates slow-vm work. [[c1]] [[c2]] [[c3]]

## 4. Data model changes

### 4.1 `QualificationTimeBudgetPolicy` — new

Proposed pure JS source src/installer/qualification-time-budgets.mjs with adjacent qualification-time-budgets.d.mts declaration. It exports one deeply frozen process-local QUALIFICATION_TIME_BUDGETS value selected once from INSRC_QUALIFICATION_PROFILE (absent/normal or slow-vm only). Reading the environment and validating the enum are the only import-time effects: no filesystem, network, application state, CLI provider or source-builder imports. One Node process owns exactly one selected policy for its lifetime; that value supplies zero or more scopes. Child processes independently load the same compiled table from the canonical inherited profile name. There is no persistent entity, foreign key or new wire field, so an ER diagram is unnecessary. Unknown values fail before work; changing the environment after import cannot change admitted budgets. [[c1]] [[c2]] [[c3]]

**Call sites:**
- `scripts/test-harness/context.mjs`
- `src/installer/runtime-metadata.ts`
- `src/installer/dev-delivery.ts`
- `src/installer/dev-worker.ts`
- `scripts/qualify-runtime-foundation.mjs`

### 4.2 `Role budget table` — invariant-change

All durations below are milliseconds in code and are finite safe integers. Normal numeric defaults stay as they are. Slow-vm coordinator/worker: build40min,file40min,run4h,cleanup30s. Slow-vm manager: build40min,file40min,run4h,cleanup120s; its larger cooperative parent reserve contains the worker's30s drain and final evidence writes. Slow-vm qualification: build2h,file2h,run5h,cleanup5min; this raises the existing1h qualification override instead of lowering it to the issue's proposed general40min value. Git reference scope: normal file30s/run40s/cleanup5s; slow-vm file120s/run180s/cleanup30s. Runtime acquisition/download/extraction: normal10min,slow-vm40min; read-only verification/publication: normal2min,slow-vm8min; existing resource/decoder drain: normal5s,slow-vm30s. Larger explicit per-role caps are preserved; short intentional test overrides remain exact. Parent-child remaining-time calculation and cooperative cleanup reserves take precedence over a nominal full child cap. [[c1]] [[c2]] [[c3]]

**Call sites:**
- `scripts/test-harness/context.mjs`
- `scripts/test-harness/process.mjs`
- `src/installer/dev-git.ts`
- `src/installer/dev-delivery.ts`
- `src/installer/dev-worker.ts`
- `src/installer/runtime-metadata.ts`
- `src/installer/runtime-acquire.ts`
- `src/installer/runtime-store.ts`
- `src/installer/controller-store.ts`
- `src/installer/bootstrap-foundation.ts`
- `src/installer/runtime-archive.ts`
- `src/installer/download.ts`
- `scripts/qualify-runtime-foundation.mjs`

### 4.3 `Runtime limits and helper coverage` — invariant-change

RUNTIME_LIMITS retains its existing object shape, profile/size/count limits and normal timing values; only its time fields come from the selected fixed policy. Update every existing acquisition, read-only store/publication/bootstrap and downloader timeout consumer, plus runtime abort-drain and ZIP memory-entry closure. downloadBoundedAsset continues consuming its owning operation's signal rather than creating a shorter nested timer. Generic downloadJson/downloadVerifiedAsset use the selected download allowance. owned-file close functions have no existing standalone timer to increase; retain actual close semantics and rely on the selected enclosing operation/drain. Do not invent successful closure or silently treat an unbounded await as proof. Shared test-harness process drain already uses run.budgets.cleanupMs; the correct role value must reach it. No change to exact hashes, safe archive rules, file size/count limits, durable writes or foreign-target admission. [[c1]] [[c2]] [[c3]]

**Call sites:**
- `src/installer/runtime-metadata.ts`
- `src/installer/runtime-acquire.ts`
- `src/installer/runtime-store.ts`
- `src/installer/bootstrap-foundation.ts`
- `src/installer/controller-store.ts`
- `src/installer/download.ts`
- `src/installer/runtime-archive.ts`
- `src/installer/owned-file.ts`
- `scripts/test-harness/process.mjs`

### 4.4 `Policy resource publication and imports` — new

Dependency directions are scripts/test-harness/context.mjs -> source policy MJS, and installer TS modules -> the adjacent policy MJS. The policy imports neither consumer; read-only runtime resolution does not import test-harness context or application/source-builder code. copy-assets.mjs explicitly copies the single source policy resource to out/installer/qualification-time-budgets.mjs and verifies its bytes. TypeScript sees the adjacent .d.mts declaration. There is exactly one source policy asset per checkout and one copied policy asset per built output; esbuild includes that same resource in control bundles. Existing full-out collection/provenance and native/build inventories must include it, with no descriptor/receipt/manifest format change and no extra source/tooling directories shipped. No separate generated policy implementation is permitted. [[c1]] [[c2]] [[c3]]

**Call sites:**
- `copy-assets.mjs`
- `scripts/package-installer.mjs`
- `scripts/installer-payload.mjs`
- `src/installer/dev-payload.ts`
- `scripts/test-harness/build.mjs`

### 4.5 `CI and operator containment` — invariant-change

Only the manual runtime-foundation job is affected; backend20min behavior is unchanged. Expose the same fixed normal/slow-vm selection for that validation scope, propagate it to the complete job environment, and replace its containing60min limit with the supported360min maximum when slow-vm is selected. Normal runtime-foundation containment must cover its existing2h qualifier and preflight as well; use240min rather than retaining a shorter60min cap. Hosted runners have an official6h maximum (https://docs.github.com/en/actions/reference/limits). In slow-vm mode bound checkout/SDK/preflight+selected surrounding tests to a combined at-most40min work allowance plus at-most5min setup/drain, reserve at-most5h for qualification work plus at-most7min cascading manager/outer cleanup, and reserve diagnostic upload time within360min. Refuse before native admission if remaining hosted job allowance cannot contain the selected qualifier and cleanup; never silently shorten it. Reuse existing owned coordinator boundaries for preflight, not an unmanaged detached test runner. Local detached VM supervisors must allow the five-hour work plus cleanup and diagnostics; record that containing ceiling and never reuse the old two-hour/90-minute supervisor caps. This does not authorize dispatching the Windows job before its separate ownership prerequisite is ready. [[c3]] [[c5]]

**Call sites:**
- `scripts/qualify-runtime-foundation.mjs`
- `scripts/test-harness/context.mjs`
- `scripts/test-harness/process.mjs`

### 4.6 `Evidence and compatibility` — field-add

Add the selected profile and resolved time-budget table only to the diagnostic native-qualification result (not RuntimeIdentity, ReleaseManifest, DevWorkerLaunch, installation/controller snapshots, run lease schema or completion receipts). Existing run records already contain actual numeric budgets and remain the proof for each scope. Published runtime integrity inventories remain policy-bound and time-profile independent. A consumer without the environment selector remains normal; old receipts remain compatible. A user/operator can choose the profile name but cannot supply an arbitrary number or a flag that waives integrity or process closure. Missing retired worker closure, native Windows proof and current-source final regression remain unsatisfied gates. [[c1]] [[c2]] [[c3]]

**Call sites:**
- `scripts/qualify-runtime-foundation.mjs`
- `src/installer/dev-worker.ts`
- `src/installer/runtime-policy.ts`
- `src/installer/runtime-metadata.ts`

## 5. Diagrams

- [Sequence diagram](./sequence-diagram.html)
- [Component dependencies](./component-dependency.html)

## 6. Error paths

**Error cases**

- **Unknown or malformed qualification profile** (recoverable)
  - Detection: The policy module validates the single process selector against normal/slow-vm before root allocation or lease admission; numeric strings, whitespace aliases, empty values and arbitrary factors are rejected. [[c1]] [[c2]] [[c3]]
  - Response: Throw qualification-profile-invalid; create no installation home, worker or scope. Do not fall back silently. [[c3]]
  - User impact: Operator gets a concrete configuration error without beginning expensive work.
- **Profile is lost or conflicts in a custom child environment** (recoverable)
  - Detection: Before spawn, compare any supplied profile selector to the admitted process snapshot; canonicalize one environment key, including Windows case aliases. Omission is supplied from the snapshot; conflicting/invalid selectors fail. [[c1]] [[c2]] [[c3]]
  - Response: Restore an omitted canonical selector; reject a conflict before spawning. The admitted policy never changes mid-operation. [[c3]]
  - User impact: A child cannot silently revert to the normal90-minute cap or select a different budget policy.
- **Setup or runtime verification consumes parent allowance before worker admission** (recoverable)
  - Detection: Immediately before starting the worker, calculate monotonic remaining time less the manager cleanup reserve and cap it by explicit/selected worker limits. [[c1]] [[c2]] [[c3]]
  - Response: If no positive allowance remains, fail before spawning, preserve accepted attempt evidence and follow existing explicit reconciliation rules; never reset the parent clock. [[c3]]
  - User impact: The operation fails within its enclosing budget rather than starting work that cannot be drained.
- **Outer deadline expires during in-process source packaging** (recoverable)
  - Detection: The outer qualification work deadline drives its existing AbortController as well as the retained scope; the preparation context receives the abort. [[c1]] [[c2]] [[c3]]
  - Response: Send existing cooperative cancel frames immediately and drain under the selected role reserves. Return failure/cancellation or uncertainty, never a prepared result without closure. [[c3]]
  - User impact: A five-hour ceiling also bounds independently owned/in-process work, not only directly spawned outer commands.
- **File, network, parser or process closure is still unconfirmed** (terminal)
  - Detection: Existing actual-close/journal checks and selected resource/worker/manager drain intervals expire without positive closure. [[c1]] [[c2]] [[c3]]
  - Response: Retain resource-close-uncertain/preparation-uncertain behavior, owned stage and lease evidence. A longer clock does not authorize deletion, process adoption or publication. [[c3]]
  - User impact: Operator can inspect/reconcile the failed attempt; no unsafe automatic retry is introduced.
- **Copied policy asset is missing or differs from source** (recoverable)
  - Detection: Build copying verifies exact bytes; package/bundle and installed-runtime import tests check policy availability/provenance without application imports. [[c1]] [[c2]] [[c3]]
  - Response: Fail build/preparation before releasing a usable candidate; retain failure evidence. [[c3]]
  - User impact: No installed consumer silently falls back to another timeout table.
- **Hosted CI or detached supervisor has insufficient remaining allowance** (recoverable)
  - Detection: The containing runner/operator ceiling is compared to selected native work and cascading drain/diagnostic reserves before native admission; hosted ceiling is capped by its supported six-hour limit. [[c1]] [[c2]] [[c3]]
  - Response: Fail preflight with selected/available allowances, or require a sufficiently bounded local VM supervisor; never run a five-hour qualifier under the old60/90/120-minute wrapper. [[c3]]
  - User impact: Long work is not predictably cut off by a shorter hidden outer clock.

**Edge cases**

| Input | Expected |
| :--- | :--- |
| Selector absent or explicitly normal | All existing role-specific numeric defaults/overrides remain unchanged, including the qualification harness's1h build/file and2h work budget. [[c1]] [[c2]] [[c3]] |
| A slow-vm scope has explicit short budgets for a negative test | Validated explicit overrides win exactly; no scaling or flooring turns a millisecond timeout test into a multi-hour wait. [[c1]] [[c2]] [[c3]] |
| The profile environment is changed after the policy module is imported | The admitted process snapshot is unchanged. A new profile requires a new process; process.env is never mutated to switch an active job. [[c1]] [[c2]] [[c3]] |
| SIGINT, SIGTERM, terminal EOF or explicit cancellation arrives early | The existing signal/owner-channel cancellation starts immediately; larger budgets only change maximum allowances and grace windows. [[c1]] [[c2]] [[c3]] |
| Previously failed native worker retains an unfinished lease | Profile selection neither adopts it nor clears it. Actual qualified closure/reconciliation must precede any fresh native attempt. [[c1]] [[c2]] [[c3]] |
| Normal and slow-vm profiles inspect the same immutable runtime | Identity, independently pinned inventory, exact bytes, headers/npm and receipt formats agree; time profile is not part of runtime identity or release selection. [[c1]] [[c2]] [[c3]] |

**Invariants to preserve**

- Existing checkedBudgets validation rejects unknown keys and nonpositive/noninteger values; explicit overrides remain exact and ownership stays with createRun. [[c1]]
- Runtime-only resolution/acquisition retain their import boundaries, exact independent integrity limits and existing installation/manifest/worker JSON formats. [[c1]]
- Actual file/network/decoder/process closure is required; an expired timer cannot become successful closure or authorize stage deletion. [[c2]]
- The selector is a fixed process-local timing policy; it is not new IPC authority, a skip-validation flag or an unbounded duration supplied by a request. [[c2]]
- Graph/retrieval completeness is qualified; direct source/call-site and actual native evidence supplement it. [[c1]]

## 7. Test strategy

**Test framework:** `Use existing node:test/node:assert strict TypeScript .test.ts fixtures through the canonical verified Node22 coordinator. This implied standalone issue Story has no upstream formal FR/AC list; local design acceptance IDs derive from its approved requirements: ac1 fixed opt-in selection/default compatibility, ac2 end-to-end timing propagation, ac3 finite parent/child/cancellation/containment ordering, ac4 integrity/schema/ownership invariants, ac5 built asset and complete regression evidence, ac6 actual UTM native result/closure. They are local design criteria, not invented upstream FR identifiers. Run surrounding tests only per task; one final scoped regression after all source tasks. Accelerate intentional negative clocks with existing mocks/explicit scope overrides, never an untrusted numeric scaling flag. Do not run unavailable review endpoints, mutate the installed host daemon/Ollama, recover an uncertain worker from PID/age, or dispatch known-blocked Windows CI. Human BUILD approval remains after all required tasks/tests; no per-task human approval. [[c1]] [[c2]] [[c3]]`

**Test levels**

- **unit** — Validate the selected fixed policy and unchanged normal behavior in fresh Node22 processes without waiting for long deadlines. [[c3]]
  - Subjects: `qualification-profile-selects-frozen-normal-and-slow-vm-role-budgets`, `invalid-profile-fails-before-any-filesystem-or-worker-admission`, `explicit-short-scope-overrides-remain-exact-under-slow-vm`, `profile-snapshot-cannot-change-after-module-import`
  - Fixtures: `Fresh Node22 process imports of the actual source/built MJS policy; existing canonical coordinator and node:test fixtures. No duration-multiplier environment or verifier bypass.`
- **integration** — Prove propagation and remaining-time/cleanup ordering through actual retained parent and child processes using accelerated explicit scope clocks. [[c3]]
  - Subjects: `qualification-profile-reaches-manager-worker-private-npm-and-runtime-helpers`, `child-budget-is-parent-remaining-minus-reserve-after-runtime-setup`, `parent-cooperative-reserve-covers-worker-drain-and-final-evidence`, `outer-deadline-cancels-independent-in-process-preparation`, `omitted-child-profile-is-canonicalized-and-conflicting-profile-rejected`, `slow-vm-runtime-download-verification-and-decoder-drain-have-no-hidden-normal-cap`
  - Fixtures: `Existing dev-worker/dev-toolchain/coordinator owned-process fixtures and official runtime byte fixtures.`, `Barrier-controlled setup and real existing cancel frames, unique admission/close/disposal journals, fake clocks or explicit millisecond scope overrides; no unmanaged child or application DB.`
- **contract** — Protect publication/import, integrity, compatibility and containing deadline boundaries. [[c3]]
  - Subjects: `copied-policy-asset-has-source-bytes-and-loads-from-installed-control`, `normal-runtime-identity-inventory-worker-wire-and-controller-schema-remain-unchanged`, `profile-never-waives-positive-resource-or-process-closure`, `ci-and-operator-containment-admit-only-sufficient-native-work-and-cleanup-headroom`
  - Fixtures: `Existing publisher/bootstrap/source-provenance fixtures; actual copied MJS under out and bundled control.`, `CI configuration inspection plus the same containment-admission function exercised with sufficient/insufficient remaining allowances; keep backend CI behavior unchanged.`
- **smoke** — Record current-source surrounding checks and one final scoped regression after implementation is complete. [[c3]]
  - Subjects: `current-budget-correction-surrounding-and-final-scoped-regression-have-confirmed-cleanup`
  - Fixtures: `Node22 canonical coordinator; only surrounding policy/coordinator/runtime/preparation/bootstrap/publisher tests per task.`, `One final all-installer plus installation-home/build/scanner/coordinator regression and post-run exact-coverage/fingerprint/closure audit after all implementation tasks.`
- **live** — Qualify the selected profile on real slow storage without weakening existing native proof. [[c3]]
  - Subjects: `fresh-UTM-macOS-slow-vm-profile-completes-native-foundation-and-confirmed-closure`
  - Fixtures: `Actual UTM macOS ordinary user and new isolated home; official live runtime acquisition, offline0networkreuse, actual private npm/build/payload and native consumer probes.`, `Record profile/caps, exact source/OS/runtime and parent/worker closure. Existing failed worker must have actual qualified closure/reconciliation before admission; missing proof is unsatisfied, never a pass. Windows native acceptance remains owned by its separate prerequisite and foundationT10.`

**Acceptance mapping**

| Criterion | Proving tests |
| :--- | :--- |
| `ac1` | `qualification-profile-selects-frozen-normal-and-slow-vm-role-budgets`, `invalid-profile-fails-before-any-filesystem-or-worker-admission`, `profile-snapshot-cannot-change-after-module-import`, `explicit-short-scope-overrides-remain-exact-under-slow-vm` |
| `ac2` | `qualification-profile-reaches-manager-worker-private-npm-and-runtime-helpers`, `slow-vm-runtime-download-verification-and-decoder-drain-have-no-hidden-normal-cap`, `omitted-child-profile-is-canonicalized-and-conflicting-profile-rejected` |
| `ac3` | `child-budget-is-parent-remaining-minus-reserve-after-runtime-setup`, `parent-cooperative-reserve-covers-worker-drain-and-final-evidence`, `outer-deadline-cancels-independent-in-process-preparation`, `ci-and-operator-containment-admit-only-sufficient-native-work-and-cleanup-headroom` |
| `ac4` | `normal-runtime-identity-inventory-worker-wire-and-controller-schema-remain-unchanged`, `profile-never-waives-positive-resource-or-process-closure` |
| `ac5` | `copied-policy-asset-has-source-bytes-and-loads-from-installed-control`, `current-budget-correction-surrounding-and-final-scoped-regression-have-confirmed-cleanup` |
| `ac6` | `fresh-UTM-macOS-slow-vm-profile-completes-native-foundation-and-confirmed-closure` |

## 8. Migration

**State before:** The two s1 analyzer passes and direct source reads show independent normal coordinator defaults (10min build/file,90min run,5s cleanup), a1h/2h qualification override, separate600s/120s runtime timers and5s resource guards, and no matching qualification-profile selector. Runtime/receipt/worker JSON formats are already in use. The retained f5 macOS attempt has incomplete worker-finalization proof and must remain isolated. [[c1]] [[c2]]

**State after:** New Node22 processes can explicitly select one fixed slow-vm policy before importing installer/build helpers; no selector retains the same normal role durations. Manager/worker, runtime I/O, cleanup and outer/containing deadlines agree, with larger parent reserves and actual remaining-time checks. Native evidence records the selection; installation data, identity, receipts, controller and private worker frames are unchanged. [[c3]]

**Zero downtime:** yes — **Data rewrite:** no

**Steps**

1. Implement the approved LLD/plan in the tracked budget work item, maintaining the pure policy asset and all source/bundled consumers together; run surrounding tests and validate copy/provenance before any new qualification. [[c3]] — ↩ rollbackable
2. Leave existing normal processes and installations untouched. Start an isolated development/qualification process with the explicit profile environment and a sufficiently long retained supervisor; confirm the resolved role table in evidence before expensive work. [[c3]] — ↩ rollbackable
3. Before admitting another actual UTM qualification, establish the retired attempt's worker closure/reconciliation through existing qualified ownership proof. Preserve old logs, stage and lease while proof is absent. Do not infer death from PID/age, alter its checkpoint or reclassify it as passing. [[c3]] — ✕ non-rollbackable _(needs: `retired-worker-closure-confirmed`)_
4. Use a fresh isolated home and committed built source for the real UTM test. Record official live acquisition, offline reuse, private source build/payload/native probes and independent parent/worker closure with the selected profile. Keep missing native evidence unsatisfied. [[c3]] — ↩ rollbackable
5. After all implementation and native feedback corrections, run one current-source scoped installer regression and independent post-run audit, then submit build validation and final human approval. Do not hand off foundationS4 or dispatch Windows qualification while their separate gates remain unmet. [[c3]] — ↩ rollbackable

**Backward compat:** No public API or persisted data rewrite. DevWorkerLaunch, manifest, runtime identity and installed/controller formats retain their exact shapes. Normal numeric defaults remain unchanged. A new local-only monotonic deadline option is optional and never serialized. To roll back the opt-in behavior, launch future processes without the selector or with the previous code; never edit a running process's policy or discard an uncertain attempt. [[c1]] [[c2]] [[c3]]

## 9. Alternatives considered

### 9.1 a1: Named policy inherited by qualification processes — **CHOSEN**

One fixed opt-in policy selects immutable role budgets through the existing private environment.

Use a single side-effect-free policy surface readable by Node build scripts and installed installer code. A named normal/slow-vm selector travels through the already controlled local process environment; each operation snapshots its role budget and existing createRun/checkedBudgets perform scope ownership. Public manager/worker JSON and persisted installation formats remain unchanged. Explicit test overrides remain explicit; only the selected qualification job receives larger defaults. [[c1]] [[c2]] [[c3]]

### 9.2 a2: Explicit private policy parameters

Pass a frozen policy object explicitly through every internal acquisition and preparation call.

Resolve a policy at the qualification boundary and thread that process-local value through manager, worker launch, runtime acquisition/resolution, downloader and closure options. The worker receives only the selected fixed policy name through private launch composition and validates it locally; no arbitrary numeric budget is accepted on public IPC. Existing checkedBudgets/createRun still own actual scope timing. [[c1]] [[c2]] [[c3]]

**Rejected because:** Also satisfies propagation, compatibility and proof constraints, but introduces policy parameters across more APIs/callers to achieve the same bounded qualification behavior. The extra plumbing is unnecessary for the approved process-local opt-in use.

## 10. References

- **[[c1]]** `analyze-bundle` `Completed qualification budget ownership analysis 2026-11-27` — "Existing checkedBudgets/createRun; independent manager/worker/runtime/outer caps; context35importers; graph completeness not established."
- **[[c2]]** `analyze-bundle` `Completed qualification resource and publication analyses 2026-11-27` — "Located actual close/decoder helpers, DevWorkerLaunch, download interfaces, collector/inventory APIs; no existing matching profile selector found in searched source."
- **[[c3]]** `prior-artifact` `docs/standalone/propagate-longer-time-budgets-through-installer-E20261127a5d5b2bb/ISSUE.md` — "Provide one explicit, bounded slow-VM qualification policy"
- **[[c4]]** `prior-artifact` `docs/standalone/complete-shared-external-node-runtime-foundation-E20261126446ae695/S001/LLD.md#4-data-model-changes` — "Network operation deadline 600 s and read-only verification deadline 120 s"
- **[[c5]]** `doc` `https://docs.github.com/en/actions/reference/limits` — "Each job in a workflow can run for up to 6 hours of execution time."
- **[[c6]]** `code` `src/installer/dev-delivery.ts:139-142` — "budgetMs: run.budgets.runMs - run.budgets.cleanupMs"
- **[[c7]]** `code` `src/installer/download.ts:44` — "function deadline(signal?: AbortSignal): AbortSignal"
- **[[c8]]** `code` `copy-assets.mjs:29-44` — "const DIRS = ['prompts', 'assets'];"
- **[[c9]]** `doc` `docs/standalone/complete-shared-external-node-runtime-foundation-E20261126446ae695/S001/evidence/t10.md#follow-up-failure-explanation-deadline-timing-and-payload-metadata` — "43697 files/1329984102 bytes staged; failure89m56.111s after worker identity; exact parent exit result not retained."
