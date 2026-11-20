<!-- insrc:artifact LLD-3275fb2e9a542cd6-s1 -->

# LLD: STORY-3275fb2e9a542cd6-s1 — Make the test harness hermetic and bounded

## Summary

**Epic:** `make-test-harness-hermetic-bounded`
**HLD base run:** `wf-1795149678886-t22m35`
**HLD effective hash:** `4889d3eb4e7c...`

Give repository test and build commands one explicit owner for shared generated output, a validated Node-22 runtime and a disposable probe workspace. Build-dependent tests consume one prepared build; regression cases that intentionally rebuild execute separately under exclusive ownership. Owned ports and fixture children drain before release, while an uncatchable crash leaves a visible blocked record rather than permitting another run to overwrite output.

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

### 2.1 `typecheckAgainstPanel`

```typescript
typecheckAgainstPanel(t: Skipper, snippet: (moduleSpecifier: string) => string): Promise<{ ok: boolean; out: string }>
```

**Parameters:**
- `t: Skipper` — Existing local test context; coordinator preflight requires the compiler rather than silently counting a missing compiler as a passing check.
- `snippet: (moduleSpecifier: string) => string` — Construct the existing positive or negative type probe using the coordinator-provided path to the real panel module; preserve intentional type errors.

**Returns:** `Promise<{ ok: boolean; out: string }>` — Actual compiler result and diagnostics for one probe; ok is true only for compiler exit zero. A negative type test still verifies its intended diagnostic.

**Errors:**
- `Error & { code: 'harness-context-invalid' | 'harness-runtime-unsupported' | 'harness-compiler-unavailable' }` when Missing/mismatched active run, unsupported runtime or compiler prerequisite.
- `Error & { code: 'harness-child-timeout' | 'harness-cleanup-unconfirmed' }` when The owned compiler does not complete within its declared budget, or its close/cleanup cannot be confirmed.

**Preconditions:**
- Source module path is within the canonical checkout; run-owned probe directory is outside both backend and extension source include trees.
- One supported Node 22.22.1-or-newer 22.x binary has been validated by the coordinator; no automatic installation or fallback to Node 26.

**Postconditions:**
- No __sc4probe_ source is created under vscode-plugin/src; test snippets import the actual production type rather than a copied declaration.
- Compiler launch failure is distinguishable from an expected type-check rejection; permitted positive controls still compile.
- Normal completion or catchable cancellation reaps the retained child and removes only its owned probe directory. Abrupt-death residue remains under the ignored run workspace and cannot enter normal compilation.

## 3. Data model changes

### 3.1 `HarnessRunRecord (new, test-only coordination record)` — new

Proposed ownership: canonical checkout -> at most one active harness lease at .insrc/tmp/test-harness/active; the lease -> exactly one runId and one ignored workspace .insrc/tmp/test-harness/runs/<runId>. Acquisition is atomic before any output mutation; publication must complete before child admission. Overlap, malformed metadata, a symlinked lease or a replacement runId refuses promptly. Ownership is not transferred by age, PID absence or an environment variable alone. A stale record is never automatically stolen. Normal release requires matching runId plus confirmed owned-child closure; inability to confirm closure retains phase blocked. Uncatchable process death deliberately preserves the record; recovery is an explicit operator action after confirming the old run's actors have ended. PID values are diagnostics only and never authorize a signal. No LMDB/Lance/daemon socket/global ~/.insrc state is touched.

```
version: 1; runId: string; canonicalRoot: absolute-path; runtimeExecutable: absolute-path; runtimeVersion: string; phase: 'preparing'|'mutating'|'reading'|'draining'|'blocked'; mode: 'test'|'build'; selectedFiles: string[]; budgets: { buildMs: number; fileMs: number; runMs: number; cleanupMs: number }; workspace: absolute-path; outcome?: { code: number|null; signal: string|null; incomplete: boolean }; diagnosticFlags: string[]
```

**Call sites:**
- `package.json`
- `scripts/clean-output.mjs`
- `src/cli/services/__tests__/daemon-ctl-forced-stop.test.ts`
- `src/shared/__tests__/process-broker-native.test.ts`
- `src/daemon/__tests__/shutdown-lifecycle-evidence.test.ts`
- `src/daemon/__tests__/shutdown-watchdog.test.ts`
- `src/daemon/__tests__/review-retirement-package.test.ts`
- `src/daemon/__tests__/shutdown-bounded.test.ts`

### 3.2 `PreparedBuild (new, run-scoped prerequisite)` — new

Coordinator -> one current prepared-build record, usable only by that run's readers. Test entrypoint is proposed scripts/test-harness/run.mjs (backend/vscode suite or explicit files); build entrypoint is proposed scripts/test-harness/build.mjs, preserving the current build stages and argv-based subprocess execution. Proposed support is scripts/test-harness/context.mjs; these are new script locations, not claims of existing APIs. Root and VS Code npm test routes delegate to the coordinator. A standalone root npm build acquires the same checkout ownership. Coordinator build calls join only the matching active preparing/mutating context and a nested single-writer reservation; ordinary reading-phase tests cannot rebuild. Prepare once, run the true output-mutating retirement-package regression separately, refresh the prepared record after its successful rebuild, then admit ordinary consumers. Replace the other five rebuild hooks with prepared-build checks; direct raw build-dependent test invocations fail with the supported selector command instead of silently rebuilding. A missing helper fails setup before fake-daemon creation. Existing package build/typecheck/native/assets checks remain semantically enforced; adapt only their exposure to the wrapper in this batch, leaving stale tool snapshots/exemptions to Batch 09. Fingerprint drift invalidates the run's validation claim; this metadata never grants production release qualification.

```
runId: string; canonicalRoot: absolute-path; runtimeExecutable: absolute-path; buildExitCode: 0; completedAt: ISO-string; inputFingerprint: string; outputFingerprint: string; requiredArtifacts: string[]
```

**Call sites:**
- `package.json`
- `scripts/clean-output.mjs`
- `src/cli/services/__tests__/daemon-ctl-forced-stop.test.ts`
- `src/shared/__tests__/process-broker-native.test.ts`
- `src/daemon/__tests__/shutdown-lifecycle-evidence.test.ts`
- `src/daemon/__tests__/shutdown-watchdog.test.ts`
- `src/daemon/__tests__/shutdown-bounded.test.ts`
- `src/daemon/__tests__/review-retirement-package.test.ts`

### 3.3 `HarnessChild and ProbeWorkspace (new, internal lifetime relation)` — new

One run owns 0..N retained ChildProcess records; each compiler owns exactly one isolated probe directory. Helpers register actors at spawn and observe close, with cleanup in per-test finally/afterEach rather than one after-all cleanup that lets a failed case poison the next. Short cancellation tests start their asserted deadline after a bounded fixture-ready handshake, not before spawn scheduling; do not increase production deadlines or suppress assertions. The obsolete zero-test peer fixture must allocate no ports at module load; retained meaningful channel coverage is exercised in an actual test that owns setup/finally cleanup without restoring removed reviews. The type probe uses the existing repository's NodeNext/type resolution and real module, but stores snippets under the ignored run workspace. Inherit a cloned environment with the selected Node directory first on PATH, no ambient NODE_OPTIONS injection, and known SDK debug switches cleared for baseline tests; negative environment tests explicitly set their own switches. Preserve explicit live-test opt-ins and report them; never enable paid/live services implicitly. Default ordinary test-file concurrency is 2, bounded 1–4; build-mutating cases are serial. Initial harness ceilings are build 10 minutes, file 10 minutes, run 90 minutes and drain 5 seconds, selectable explicitly when a documented file needs more; record budgets and preserve longer intentional case requirements. Timeouts remain nonzero/incomplete outcomes, not green results. Cleanup only signals retained test-owned child/process-group handles through existing owned lifecycle behavior; never kill by a discovered PID or change production shell/native semantics. Escaped descendants require fixture-owned registration/parent-death cleanup or an explicit unconfirmed outcome before ownership release.

```
childId: string; runId: string; kind: 'build'|'test'|'fixture'|'compiler'; state: 'starting'|'ready'|'closing'|'closed'|'unconfirmed'; budgetMs: positive-integer; probeDirectory?: absolute-path
```

**Call sites:**
- `src/daemon/tools/__tests__/_proc.ts`
- `src/daemon/steps/__tests__/peer-state-store-leakfree.test.ts`
- `vscode-plugin/src/chat/__tests__/docs-review-panel.test.ts`
- `src/daemon/tools/shell-helper.ts`

## 4. Diagrams

- [Sequence diagram](docs/standalone/make-test-harness-hermetic-bounded-E202611203275fb2e/S001/sequence-diagram.html)

## 5. Error paths

**Error cases**

- **Another run/build already owns the canonical checkout.** (recoverable)
  - Detection: Atomic acquisition finds an existing active lease; owner metadata is validated only for diagnostics, never for age/PID-based takeover.
  - Response: Return nonzero harness-busy before cleaning or reading shared output. Name the existing run and supported retry/recovery path without printing its nonce.
  - User impact: Second invocation ends promptly instead of racing or hanging.
- **Unsupported Node runtime or missing npm/compiler/native build prerequisite.** (recoverable)
  - Detection: Preflight probes the selected absolute executable/version and required local entrypoints before output mutation or fake-daemon startup.
  - Response: Return a distinct setup failure with the required supported runtime/prerequisite command; do not auto-install, switch runtimes silently or count a skipped setup as pass.
  - User impact: Environment problems remain distinguishable from product defects.
- **A build child fails or exceeds its declared ceiling.** (recoverable)
  - Detection: Retained build process emits nonzero/signal/error or its monotonic budget expires.
  - Response: Do not publish PreparedBuild or start output readers. Drain owned actors; release only on confirmed closure, otherwise retain blocked ownership. Preserve the real build log and failure code.
  - User impact: One primary setup failure replaces cascades of missing helpers.
- **A reading-phase test tries to rebuild, or a raw direct invocation lacks a prepared context.** (recoverable)
  - Detection: The build wrapper/context check compares active runId, canonical root, allowed phase and current prepared manifest; the single-writer reservation also refuses concurrent writers.
  - Response: Refuse with harness-context-invalid or harness-write-during-read and the supported coordinator selector command. The true mutation regression runs only in its serial phase.
  - User impact: Historical one-file debugging remains available through selectors without unsafe implicit rebuilds.
- **Lease path/record is malformed, replaced, foreign or symlinked.** (terminal)
  - Detection: Validate the canonical fixed lease location, record schema, same-run identity and ownership before any transition/removal; detect missing/changed identity on release.
  - Response: Fail closed and never remove another run's record or source tree. Incomplete publication is blocked, not interpreted as free output.
  - User impact: Recovery is explicit; unrelated files and active runs remain untouched.
- **A fixture case fails before its expected startup marker.** (recoverable)
  - Detection: A bounded ready/exit observation fails before the behavioral deadline is admitted.
  - Response: Report fixture-startup failure, reclaim the retained actor in per-case finally, and prevent the next case from inheriting its socket/PID/probe residue. Do not inflate the asserted behavioral timeout.
  - User impact: Cancellation/termination failures are not mislabeled when nothing had started.
- **Compiler negative probe cannot launch, hangs, or reports an unrelated diagnostic.** (recoverable)
  - Detection: Retain the compiler spawn outcome/exit and assert the intended negative diagnostic plus a valid positive control.
  - Response: Raise a setup/timeout failure rather than treating every nonzero exit as proof of a type guarantee. Keep snippets outside normal source includes.
  - User impact: Type assertions remain meaningful and interrupted probes cannot break the plugin build.
- **SIGINT/SIGTERM or whole-run deadline interrupts a run.** (recoverable)
  - Detection: The coordinator receives the signal/deadline while it still retains child ownership.
  - Response: Stop new admission, transition to draining, cancel registered actors within the cleanup ceiling and close logs/ports/probes. Return an interrupted/incomplete nonzero result. Unconfirmed disposal retains blocked ownership; no next build is admitted.
  - User impact: A cancellation does not become a green test run or leave a silently reusable output lease.
- **Supervisor or fixture is killed by an uncatchable signal.** (terminal)
  - Detection: A later invocation observes the unreleased active record, or a retained parent observes its child die without confirmed cleanup.
  - Response: Keep the previous record blocked and refuse automatic re-use. Document explicit recovery after old actors are confirmed ended. Run-local residue is isolated from source includes; do not claim guaranteed detached-descendant cleanup after arbitrary SIGKILL.
  - User impact: May require deliberate recovery, preserving output correctness instead of unsafe automatic lock theft.
- **A descendant escapes normal group ownership or disposal cannot be established.** (terminal)
  - Detection: Registered child/fixture close acknowledgments are missing at the bounded drain boundary.
  - Response: Report harness-cleanup-unconfirmed, retain blocked state, and never signal a PID discovered by scanning the system. Fixture-owned registration/parent-death handling must provide its actual cleanup guarantee.
  - User impact: The run remains incomplete and cannot silently authorize another build.
- **Source/output fingerprints drift during a validation run.** (recoverable)
  - Detection: Compare the run's prepared inputs/outputs with its final snapshots outside explicitly admitted mutation phases.
  - Response: Mark validation incomplete/nonzero and retain logs; never update release/qualification evidence automatically to bless the new bytes.
  - User impact: Results cannot be reported as validating a different source/build.
- **Native broker permission denied or a sibling product test fails after valid setup.** (recoverable)
  - Detection: The underlying test reports its actual error, such as denied errno 1 or a real assertion failure.
  - Response: Preserve the failing result and coverage. This batch changes neither native admission nor sibling assertions; record the corresponding batch dependency.
  - User impact: Harness improvements do not hide remaining product/platform failures.

**Edge cases**

| Input | Expected |
| :--- | :--- |
| The same checkout is reached through /var and /private/var aliases. | One canonical ownership identity is used; the second run cannot acquire a second lease. |
| No selected test file, repeated selectors, or an out-of-checkout path. | Empty/invalid selection fails before mutation; duplicates are deduplicated and every selected file is reported once. |
| A supported test file contains no registered test. | It allocates no module-scope resource and terminates. The peer-store fixture retains meaningful coverage only in an actual owned test; no tests/handles are restored for removed review engines. |
| A valid compiler snippet is intentionally type-invalid. | Its expected diagnostic is reported as the test's negative control; launch/setup failure remains a different error. |
| The environment contains DEBUG/NODE_DEBUG or NODE_OPTIONS. | Baseline child environment is explicitly controlled and recorded by flag names only; tests of those variables set their own negative cases. Parent environment and production configuration are unchanged. |
| A documented expensive fixture needs more than the default harness file ceiling. | An explicit recorded selector budget can be used; the 60-second audit cap is not imposed as a production/test correctness requirement. |
| A second cleanup notification or late close arrives after closure. | Cleanup is idempotent for the same owned actor and never deletes a replacement run/workspace. |
| User runs npm build without starting tests. | The same build stages run under an independently acquired checkout lease; normal developer/install builds do not require a preexisting test context. |

**Invariants to preserve**

- The complete existing TypeScript/workspace/tool typecheck/native/assets build stages remain enforced; only their harness ownership changes. [[c1]]
- Existing production shell/channel signatures and native refusal behavior remain unchanged; helpers are consumed rather than weakened. [[c1]]
- Compiler fixtures test real published types with positive and intended-negative controls, not copied declarations or inert ts-expect-error comments. [[c1]]
- No daemon-owned LMDB/Lance stores, daemon sockets, cloud provider sessions or release-ready evidence are mutated by harness coordination. [[c1]]
- All paths in the design are repository-relative; local ic* constraints identify issue-derived checks, not invented upstream criterion IDs. [[c1]]

## 6. Test strategy

**Test framework:** `node:test with node:assert/strict and tsx for TypeScript tests, matching the current .test.ts fixtures and imports. ac1–ac6 are local acceptance labels mapped one-to-one to the issue-derived ic1–ic6 checks; this standalone issue has no upstream acceptance IDs. Harness subprocess integration tests use retained disposable child handles and readiness barriers; no cloud/Ollama calls or broad overlapping sweeps.`

**Test levels**

- **unit** — Validate preflight/record/phase/budget parsing and idempotent ownership checks, including replacement and path-alias refusals; assert observable outcomes rather than copying helper internals.
  - Subjects: `unsupported Node exits before output mutation`, `a changed lease or source/output fingerprint never produces successful validation`
  - Fixtures: `Proposed scripts/__tests__/test-harness.test.ts with temporary checkouts and injectable process/build entrypoints; no real repository output deletion.`
- **integration** — Exercise two independent contenders, real child lifetimes, failed setup and catchable interruption under one owned temporary root.
  - Subjects: `one checkout owner protects prepared output from a second test or build`, `output-mutating tests run alone and ordinary consumers reuse the prepared build`, `all nested Node and npm children use the validated runtime`, `a failing fixture closes its own socket and child before the next case`, `startup readiness is bounded separately from the asserted cancellation deadline`, `timeouts and unconfirmed cleanup remain nonzero incomplete results`
  - Fixtures: `Two controllable test/build child programs with IPC-ready barriers and a protected-output marker; fake npm records its actual Node executable.`, `A disposable fixture that replies, fails startup, ignores a first cancellation, or retains a registered descendant; never scan or kill unrelated system PIDs.`
- **contract** — Keep current build stages, real published type checks, explicit native refusal and no-sibling-scope promises intact.
  - Subjects: `type probes distinguish intended diagnostics from launch failure and retain positive controls`, `native refusal and saved-mode assertions are preserved`, `the coordinator uses existing build/process boundaries without production API changes`
  - Fixtures: `Existing vscode-plugin/src/chat/__tests__/docs-review-panel.test.ts positive/negative real-type snippets, plus a fake compiler launch/timeout control.`, `Existing package build/typecheck/native/assets and six build-dependent fixture entrypoints; narrowly adapt wrapper exposure checks without refreshing sibling snapshots.`
- **smoke** — Verify that actual owned ports/probes terminate and do not contaminate later focused runs; include abrupt-death limitation as a fail-closed outcome.
  - Subjects: `the peer-state fixture registers a real test and releases both ports`, `interrupted type probes cannot enter normal source includes`, `uncatchable owner death leaves blocked ownership without lock stealing`
  - Fixtures: `Disposable fresh Node process loading src/daemon/steps/__tests__/peer-state-store-leakfree.test.ts with a hard outer budget; no removal of meaningful coverage.`, `Run-owned compiler workspace outside source includes; compare before/after normal compiler input discovery and exercise an actual plugin type-check after interruption.`, `Simulated abandoned run record with no auto-reaping; do not require proof that arbitrary SIGKILL can clean detached processes.`

**Acceptance mapping**

| Criterion | Proving tests |
| :--- | :--- |
| `ac1` | `one checkout owner protects prepared output from a second test or build`, `output-mutating tests run alone and ordinary consumers reuse the prepared build` |
| `ac2` | `unsupported Node exits before output mutation`, `all nested Node and npm children use the validated runtime` |
| `ac3` | `a failing fixture closes its own socket and child before the next case`, `the peer-state fixture registers a real test and releases both ports`, `interrupted type probes cannot enter normal source includes`, `uncatchable owner death leaves blocked ownership without lock stealing` |
| `ac4` | `type probes distinguish intended diagnostics from launch failure and retain positive controls`, `native refusal and saved-mode assertions are preserved` |
| `ac5` | `the coordinator uses existing build/process boundaries without production API changes` |
| `ac6` | `startup readiness is bounded separately from the asserted cancellation deadline`, `timeouts and unconfirmed cleanup remain nonzero incomplete results`, `a changed lease or source/output fingerprint never produces successful validation` |

## 7. Migration

**State before:** s1 bundle c1 identifies six test files invoking independent shared-root npm builds, the cleanup script removing the common output tree, the peer fixture's module-scope MessageChannel, and the panel helper's source-adjacent synchronous TypeScript probe. The approved audit records output races, runtime drift and probe residue. A bounded isolated design experiment confirmed afterFired:false and two live MessagePort resources one second after importing the zero-test peer fixture; the experiment exited its own process deliberately and made no source change.

**State after:** Supported build/test entrypoints use one checkout-local coordinator lease, a validated Node-22 runtime, one prepared build with an explicit serial mutation phase, per-case retained resources and run-local compiler probes outside source includes. Failure and abrupt-death recovery are explicit; no production store/API/release-readiness state is migrated.

**Zero downtime:** yes — **Data rewrite:** no

**Steps**

1. Confirm no previous test/build owner remains before rollout. Preserve the failure audit and report any legacy source-adjacent probe residue for explicit owner-confirmed cleanup; do not sweep unknown files or stop the real daemon. — ↩ rollbackable
2. Introduce the new script-level run/build/context entrypoints and their temporary-root integration controls without switching default commands yet. Preserve the existing full build pipeline as the delegated build stages. — ↩ rollbackable
3. Route root npm test and npm build through checkout ownership. Route the VS Code package's npm test through the same coordinator with canonical repository cwd. Move its mutating pretest asset synchronization into the admitted preparing phase while retaining the existing sync-assets command and asset semantics; refuse overlapping commands before any shared mutation. — ↩ rollbackable
4. Convert the five ordinary rebuild hooks to prepared-build prerequisite checks. Classify the retirement-package rebuild regression as the serial mutation phase and preserve its stale-output/package assertions. Require explicit participant context for build-dependent direct file selections. — ↩ rollbackable
5. Give the peer channel fixture real test-owned setup/finally cleanup; migrate panel probes and their call sites to asynchronous real-module compilation in run-owned ignored directories. Update fixture readiness/per-case cleanup at the audited process helpers without changing production timer or security semantics. — ↩ rollbackable
6. Make existing specialized regression/build launchers participate at the ownership boundary only, preserving their build stages, proof contents and gate policy. Their changed script fingerprints remain pending independent requalification in Batch 15; do not generate or approve qualification evidence here. — ↩ rollbackable
7. Publish the supported focused selector/runtime/recovery commands and explicit interruption limits. Adapt only compatibility assertions needed to keep existing build-stage checks effective under the wrapper; leave unrelated stale schemas, review contracts and native permission diagnosis to their batches. — ↩ rollbackable
8. Validate the new harness against isolated adversarial fixtures, then one sequential focused run of the affected files. Record remaining sibling/platform failures as such; broaden only after the focused ownership/cleanup controls pass and no actor from the prior run remains. — ↩ rollbackable

**Backward compat:** Root npm build retains its complete build-stage semantics and normal standalone use; npm test still selects the backend by default and supports documented focused selectors/Node test flags. The VS Code package's npm test retains asset synchronization under ownership and runs from canonical repo cwd. Raw direct invocations of build-dependent files now fail with the supported selector command when no prepared context exists; ordinary independent tests remain directly runnable. The local typecheckAgainstPanel helper changes to Promise + snippet factory and all of its test callers migrate together. No daemon IPC, provider, storage or native public contract changes. Rollback requires a quiescent harness and cannot remove a foreign/blocked ownership record merely because the code is reverted.

## 8. Alternatives considered

### 8.1 a1: One coordinator with a fail-closed checkout lease — **CHOSEN**

A test-only run record owns one build, bounded child lifetimes and isolated probe workspaces for the full invocation.

Use one supported test entrypoint and one cooperating build entrypoint with explicit checkout-local lease ownership. Prepare the build once, run ordinary consumers against that prepared output, and run true output-mutating regression cases in an exclusive serial phase. Pin child Node/npm to the validated runtime. Keep probe files outside production source includes. Normal completion and catchable interruptions drain owned children before release; abrupt death leaves a visible blocked ownership record requiring explicit recovery, never age/PID-based lock stealing. Existing production shell/storage/native APIs remain unchanged.

### 8.2 a2: Independent full test workspace per invocation

Each run builds and reads its own complete source/dependency snapshot.

Give every invocation an independent checkout/build/probe root, including correctly rebound workspace dependencies and the current uncommitted source being validated. All fixture roots resolve to that snapshot. Child runtime and resource-lifetime contracts remain explicit, but generated output is never shared with another invocation.

**Rejected because:** Per-run snapshots can satisfy ic1 and isolate crash residue under ic3, but ic5 is only partial because correct Git/workspace/native dependency and uncommitted-source rebinding expands the harness significantly.

### 8.3 a3: Kernel advisory locks with distributed reader/writer participation

Builds and every output-consuming process hold explicit native advisory ownership.

A native lock contract admits build writers exclusively and output consumers as readers, with ownership retained across relevant subprocess lifetimes. Runtime and probe isolation remain required. Treat package-private NativeLock/loadNative as a separate ownership boundary rather than importing the storage host into test scripts.

**Rejected because:** ic1 and ic3 remain partial until every relevant descendant/exec lifetime participates correctly; a parent-only lock is insufficient. ic5 is partial because the package-private native lock adapter is not a shared test contract and a new native harness dependency would need its own qualification.

## 9. References

- **[[c1]]** `analyze-bundle` `design.story s1` — "Thirteen scoped lookups establish package/build cleanup entrypoints, existing process helpers and channel APIs. Six test files independently call npm run build: daemon-ctl-forced-stop, process-broker-"
- **[[c2]]** `step-output` `design.story s2–s4` — "Alternatives and proposed ownership/runtime/helper contracts derived from the approved issue."
- **[[c3]]** `step-output` `design.story s5–s8` — "Failure handling, local acceptance mapping, migration and self-check evidence; implementation validation remains pending."
- **[[c4]]** `prior-artifact` `docs/standalone/make-test-harness-hermetic-bounded-E202611203275fb2e/ISSUE.md`
