<!-- insrc:artifact PLAN-a03e99e17a364550-s1 -->

# Plan: STORY-a03e99e17a364550-s1

## Summary

**Epic:** `restore-upgrades-from-existing-daemon-installations`
**LLD run:** `wf-1795277045609-pvtnhf`
**LLD effective hash:** `6593ac1cd33b...`

Build the existing-install upgrade fix in five coherent batches: verified bootstrap, Linux transaction and recovery, user entrypoint integration, fault verification, and actual native qualification with release guidance. Twelve ordered tasks preserve the current macOS owner while adding Linux source selection and historical-install recovery. Final qualification covers macOS, OrbStack arm64 and x64 separately, including a second update and rollback; production release claims remain tied to authenticated artifacts.

## Contents

1. [Tasks](#1-tasks)
2. [Test-strategy coverage](#2-test-strategy-coverage)
3. [References](#3-references)

## 1. Tasks

| # | Task | Size | Status | Depends on | Tests | Derived from |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| 1 | **`t1`** Expose independently verified source bootstrap and staging | M | — | — | integration: Portable source qualification rejects wrong channel/profile/floor before npm; integration: Independent staging uses absolute owned npm and preserves Mac signed behavior | [[c1]] [[c2]] [[c3]] |
| 2 | **`t2`** Add private Linux source selection and durable journal | M | — | `t1` | unit: Linux selector/journal reject malformed, linked and nonprivate files; integration: Atomic publication with unknown fsync/rename outcome reconciles safely | [[c2]] [[c4]] |
| 3 | **`t3`** Admit historical predecessors and explicit failed-update recovery | M | — | `t1`, `t2` | integration: Source-ahead stale output and partial npm preserve incumbent and require qualified recovery; integration: Dirty lock/source preserved; independently staged rollback baseline admitted only by actual compatibility | [[c2]] [[c3]] [[c5]] |
| 4 | **`t4`** Implement Linux source cutover, rollback and restart recovery | L | — | `t1`, `t2`, `t3` | integration: Linux original-process closure precedes selection and candidate start; integration: Interrupted cutover and failed readiness recover exact prior selection and running state | [[c4]] [[c5]] [[c6]] |
| 5 | **`t5`** Deliver current standalone and shell upgrade entrypoints | M | — | `t1`, `t2`, `t3`, `t4` | integration: Current packaged installer upgrades existing legacy/bound target without old npm; integration: Shell selected-root routing and update/restart semantics under hostile PATH | [[c1]] [[c2]] [[c3]] [[c6]] |
| 6 | **`t6`** Route TUI, daemon updater and MCP through selected releases | M | — | `t4`, `t5` | integration: TUI and detached daemon update survive handoff and expose final outcome; integration: MCP/start resolve source selection and reject malformed state | [[c1]] [[c2]] [[c4]] [[c6]] |
| 7 | **`t7`** Ship VS Code and JetBrains bootstrap and selection routing | M | — | `t5`, `t6` | integration: VS Code controller reaches packaged current bootstrap and selected runtime; integration: JetBrains provisioner inherits owned native environment and packaged verifier | [[c1]] [[c2]] [[c3]] [[c6]] |
| 8 | **`t8`** Verify interrupted upgrades and trust/ownership regressions | M | — | `t1`, `t2`, `t3`, `t4`, `t5`, `t6`, `t7` | integration: Every transaction phase crash/timeout and concurrent mutation preserves single daemon ownership; integration: Corrupt source/runtime and wrong compatibility denied; package integration gate enforced; smoke: Canonical coordinator cleanup confirms all owned test actors closed | [[c3]] [[c4]] [[c5]] [[c6]] [[c7]] |
| 9 | **`t9`** Qualify actual macOS historical upgrade and next update | L | — | `t8` | live: darwin-arm64 actual historical upgrade, subsequent update and qualified rollback/retry; live: Mac native dependency loads and owned Node/npm environment identities | [[c3]] [[c5]] [[c6]] [[c7]] |
| 10 | **`t10`** Qualify OrbStack Linux arm64 historical and subsequent updates | L | — | `t8`, `t9` | live: OrbStack linux-arm64 actual historical and migrated-install update, native loads and failure recovery; live: arm64 retained data and owned-child/coordinator closure census | [[c2]] [[c3]] [[c4]] [[c5]] [[c6]] [[c7]] |
| 11 | **`t11`** Qualify OrbStack Linux x64 historical and subsequent updates | L | — | `t10` | live: OrbStack linux-x64 actual historical and migrated-install update, native loads and failure recovery; live: x64 emulation receipt, retained data and owned-child/coordinator closure census | [[c2]] [[c3]] [[c4]] [[c5]] [[c6]] [[c7]] |
| 12 | **`t12`** Publish supported recovery guidance and release evidence | M | — | `t9`, `t10`, `t11` | smoke: Documented recovery commands match tested independent installer delivery; smoke: Qualification receipts, generated companions and canonical client package parity verified | [[c1]] [[c2]] [[c3]] [[c4]] [[c5]] [[c6]] [[c7]] |

### 1.1 TASK-a03e99e17a364550-s1-t1 — Expose independently verified source bootstrap and staging

Factor reusable authorization/staging from Darwin admission in existing release bootstrap/preparation/staging owners. Authorize full source commit and compatible predecessor profile before candidate code/npm; package canonical Node assets and preserve public-key/floor/channel boundaries.

**Acceptance checks:**
- Existing macOS authenticated managed/legacy flows retain their verifier, floors and compatibility semantics.
- Linux source profiles are explicit in qualification/packaging; unsigned/missing/wrong-channel inputs fail before npm.
- Candidate npm ci/build/native smoke use absolute owned22.22.1/npm10.9.4 and complete native environment; explicit ONNX overrides preserved.
- Staging remains out of tree and pins prior runtime independently; no selected source mutation.
- Portable verifier cannot silently read only the old macOS catalog/profile; Linux qualification is verified before candidate execution while existing Mac receipts remain compatible.

### 1.2 TASK-a03e99e17a364550-s1-t2 — Add private Linux source selection and durable journal

Implement the LLD Linux source selector/journal persistence separately from Darwin managed installation state. Validate version, canonical roots, generation, private ownership, bounded files and runtime references; fsync and atomically publish without making runtime binding mutable.

**Acceptance checks:**
- Absent selection means legacy; malformed selection fails closed; Darwin managed selector schema unchanged.
- One logical installation maps to one selected release and at most one active transaction.
- Unsafe links/ownership/modes/path escapes and unknown publication outcomes are rejected or recoverable.
- Referenced source/runtime receipts retained; no GC or incumbent rename/overwrite.

### 1.3 TASK-a03e99e17a364550-s1-t3 — Admit historical predecessors and explicit failed-update recovery

Inventory actual incumbent executable/dependencies, source HEAD/dirt, output provenance and runtime. Diagnose stale output/partial npm/dirty lockfile; prepare an independent qualified rollback baseline or explicit side-by-side recovery without repairing incumbent in place.

**Acceptance checks:**
- Never equate newer source HEAD with actual built release; use authenticated qualification and measured prior bytes.
- Dirty source and lockfile contents remain byte-for-byte preserved; no reset/stash/checkout cleanup.
- Incomplete/unknown predecessor blocks cutover with concrete recovery command/prerequisite.
- Supported recovery stages a qualified prior independently; no proven baseline means retained data and explicit side-by-side route, not automatic destructive migration.

### 1.4 TASK-a03e99e17a364550-s1-t4 — Implement Linux source cutover, rollback and restart recovery

Compose exclusive mutation admission, retained existing process capabilities and run-file guards with the source journal. Revalidate pins, stop original only after qualification, prove exit, select candidate, verify readiness and restore qualified prior on failure. Reconcile interruptions before another start.

**Acceptance checks:**
- One mutation owner serializes update/start/restart; stale reservation recovery requires retained incarnation/exit proof, never PID age alone.
- Build failure leaves selected/running incumbent unchanged; candidate starts only after original closure.
- Every durable transition supports crash/retry and unknown fsync/rename results without a second daemon/store owner.
- Failed readiness rolls back only after candidate/children closure; exact old selector/absent sentinel and wasRunning state restored.
- Existing Mac owner and separate IPC-stop fallback scope unchanged.

### 1.5 TASK-a03e99e17a364550-s1-t5 — Deliver current standalone and shell upgrade entrypoints

Route packaged installer --migrate-runtime and updated shell ctl through the independent bootstrap and selected release. Make existing-target Linux migration concrete, preserve current Mac managed dispatch, and replace circular recovery instructions with tested delivery prerequisites.

**Acceptance checks:**
- Exact old a30aa7f91 updater is bypassed for candidate npm; absent/hostile ambient runtimes cannot select npm.
- Existing legacy and runtime-bound source roots reach staged update without successful incumbent build.
- Update/restart/start running-state semantics explicit; selection consumed consistently.
- Missing authenticated package/material fails before mutation with an actionable prerequisite; raw template is not described as a signed recovery package.

### 1.6 TASK-a03e99e17a364550-s1-t6 — Route TUI, daemon updater and MCP through selected releases

Update maintenance, detached update helper and startup/MCP resolution to consume current bootstrap and selected source release. Preserve IPC acknowledgments/final outcomes and the authoritative platform stop/start paths.

**Acceptance checks:**
- TUI and daemon updater avoid delegation into installed old build functions; errors include exact failing command and bounded diagnostics.
- Selected release/root/runtime resolved before launch; malformed selector never falls back.
- Detached updater survives incumbent shutdown and reports final committed/rolled-back/recovery-required outcome.
- Old unchanged clients are documented to use current installer/client once; no claim that existing process functions update themselves.

### 1.7 TASK-a03e99e17a364550-s1-t7 — Ship VS Code and JetBrains bootstrap and selection routing

Integrate both active IDE clients with current independently packaged bootstrap, native environment and Linux selection. Generate runtime/client assets from canonical sources and preserve managed signed bundle behavior.

**Acceptance checks:**
- Both IDE update/restart paths stop selecting old ctl npm functions and consume selected release for startup/MCP.
- Generated package payload contains required canonical runtime assets and authenticated source bootstrap for qualified upgrade channels.
- Child Node/npm/native environment is verified independently of a child provisioner's nonpersistent environment exports.
- Controller/provisioner tests cover legacy, bound source and existing managed Mac; deprecated fork untouched.

### 1.8 TASK-a03e99e17a364550-s1-t8 — Verify interrupted upgrades and trust/ownership regressions

Extend real-process and contract suites with fault injection across source preparation, persistence and cutover. Integrate launcher contracts, runtime corruption, predecessor recovery and existing Mac managed/native tests.

**Acceptance checks:**
- Crash/failure injection at every journal/selector phase proves selection consistency and child closure.
- Concurrent mutations, PID reuse, stop refusal and ambiguous actor identity cannot start a second DB actor.
- Wrong signatures/profile/floors, source tampering, runtime cache corruption and candidate failure are refused safely.
- Canonical Node22 coordinator build/tests pass for affected scope, cleanup confirmedClosed; unrelated upstream failures separately identified.
- Release/package gate refuses qualified distribution until shell, CLI/daemon/MCP and both IDE consumers understand selection together (t5-t7).

### 1.9 TASK-a03e99e17a364550-s1-t9 — Qualify actual macOS historical upgrade and next update

On isolated darwin-arm64 state, build/install real historical a30aa7f91 dependencies/output and upgrade through the delivered current bootstrap, then update migrated installation again. Exercise native failure before cutover and readiness rollback/retry; capture exact runtime/source/process/data receipts.

**Acceptance checks:**
- Actual npm/native builds and five native module/CPU ONNX loads succeed under owned runtime; use no/20/26/hostile ambient cases across contract/native coverage.
- Historical and bound-source transitions, subsequent update and applicable new launcher integration are exercised; existing authenticated managed path regresses cleanly.
- Seeded state/config preserved via daemon IPC; no user's real daemon/store modified.
- Failures preserve or restore qualified prior with retained identity and all owned children closed.
- Test keys qualify fixtures only; production source promotion requires operator-signed artifacts and valid qualification evidence.

### 1.10 TASK-a03e99e17a364550-s1-t10 — Qualify OrbStack Linux arm64 historical and subsequent updates

Repeat real historical-to-current-to-next upgrade on Ubuntu linux-arm64 OrbStack machines with persistent isolated homes, qualified source profiles and actual native dependencies. Exercise pre-cutover failure, interrupted cutover, failed readiness and explicit recovery cases.

**Acceptance checks:**
- linux-arm64 performs actual native npm builds, selected daemon readiness/start/restart/stop and subsequent update under verified runtime.
- Legacy and bound source targets supported; stale out/partial dependencies/local changes follow qualified recovery without overwriting incumbent.
- No/20/26/hostile ambient cases covered with executable/npm identity evidence and explicit ONNX override checks.
- Seeded data/config retained; every test actor/coordinator closed and named VMs stopped afterward.
- Receipts state arm64 virtualization, resources, source/OS/archive hashes and qualification limits; fresh installs or mock routing alone cannot satisfy completion.

### 1.11 TASK-a03e99e17a364550-s1-t11 — Qualify OrbStack Linux x64 historical and subsequent updates

Repeat real historical-to-current-to-next upgrade on Ubuntu linux-x64 OrbStack machines with persistent isolated homes, qualified source profiles and actual native dependencies. Exercise pre-cutover failure, interrupted cutover, failed readiness and explicit recovery cases.

**Acceptance checks:**
- linux-x64 performs actual native npm builds, selected daemon readiness/start/restart/stop and subsequent update under verified runtime.
- Legacy and bound source targets supported; stale out/partial dependencies/local changes follow qualified recovery without overwriting incumbent.
- No/20/26/hostile ambient cases covered with executable/npm identity evidence and explicit ONNX override checks.
- Seeded data/config retained; every test actor/coordinator closed and named VMs stopped afterward.
- Receipts state x64 emulation, resources, source/OS/archive hashes and qualification limits; fresh installs or mock routing alone cannot satisfy completion.

### 1.12 TASK-a03e99e17a364550-s1-t12 — Publish supported recovery guidance and release evidence

Document the exact current-installer acquisition/package prerequisite, one-time historical client recovery, partial-update branches, subsequent update and rollback. Bind qualification receipts and client package checks to source release evidence; inspect/update design companions for final implementation relationships.

**Acceptance checks:**
- Document commands are exercised against existing installations and distinguish raw source template, authenticated source installer and signed managed bundle.
- All ac1-ac5 evidence points to exact source/runtime/platform, commands, outcomes and cleanup; unavailable remote compiler logs remain an attribution limit.
- Production signing key remains external; unqualified/missing promotion material cannot be represented as production release success.
- Diagrams/relationships match final code; render verified where available and limits stated.
- No Windows enablement, IPC-stop fallback implementation, runtime/store deletion or unrelated test fixes included.
- Pin receipts and shared release/runtime object identities are distinguished; generated cardinalities, diagram source and HTML match the final ownership model.

## 2. Test-strategy coverage

| LLD strategy item | Covered by |
| :--- | :--- |
| VS Code install/update/restart and child environment | `t7`, `t8` |
| JetBrains installer/provisioner update/restart and packaged bootstrap | `t7`, `t8` |
| TUI maintenance, daemon detached updater, shell ctl, standalone --migrate-runtime | `t5`, `t6`, `t8` |
| Authenticated source packaging completeness and no-signature downgrade | `t1`, `t7`, `t8`, `t12` |
| Linux source selector/journal schema, symlink/hardlink/path/uid/mode rejection | `t2`, `t8` |
| Prior built provenance versus newer source HEAD | `t3`, `t8` |
| ONNX unset/empty/explicit and Node injection environment | `t1`, `t7`, `t8` |
| Malformed/missing source qualification and rollback compatibility | `t1`, `t3`, `t8` |
| Two concurrent update/start attempts and stale owner identity reuse | `t4`, `t8` |
| Fault injection before/after each durable phase including rename/fsync unknown result | `t2`, `t4`, `t8` |
| Native build timeout/failure with child closure before cutover | `t1`, `t4`, `t8` |
| Predecessor exit refusal, failed candidate readiness, exact prior restoration and wasRunning behavior | `t4`, `t8` |
| Dirty lockfile/source and partially installed node_modules preservation | `t3`, `t8` |
| Actual darwin-arm64 source predecessor a30aa7f91 -> candidate -> next candidate, existing authenticated managed path regression | `t9` |
| OrbStack Ubuntu linux-arm64 and linux-x64 historical source -> current -> subsequent update | `t10`, `t11` |
| No ambient Node, Node20/26 and hostile PATH; actual absolute Node/npm process identity logs | `t5`, `t7`, `t9`, `t10`, `t11` |
| Actual tree-sitter/LMDB/fs-ext/Lance/Duck loads and CPU ONNX binding | `t9`, `t10`, `t11` |
| Seeded user state/config preservation via daemon IPC, no overlapping DB actor | `t9`, `t10`, `t11` |
| Failed build-before-cutover and failed start rollback/retry with all owned child processes closed | `t9`, `t10`, `t11` |
| Generated canonical/client bootstrap parity and required source authorization material | `t1`, `t7`, `t12` |
| Supported old-client one-time recovery command works independently of old installed out | `t5`, `t9`, `t10`, `t11`, `t12` |
| Generated ownership diagram source/HTML consistency; disclose render availability | `t12` |
| Final controller census and cleanup confirmedClosed after tests | `t8`, `t9`, `t10`, `t11` |

## 3. References

- **[[c1]]** `prior-artifact` `LLD s1 contractDetails and dataModelChanges: Upgrade bootstrap delivery and routing` — "Independent current bootstrap must reach verified candidate build before old npm; old clients require one-time new installer/client delivery."
- **[[c2]]** `prior-artifact` `LLD s1 dataModelChanges and migration: source authorization, installation selection and staged upgrade` — "Qualified Linux source upgrades and subsequent updates use a separate selector; no in-place incumbent mutation or signing bypass."
- **[[c3]]** `prior-artifact` `LLD s1 contractDetails: resolveOwnedToolchain, ownedNodeEnvironment and stageManagedRelease` — "Exact matching Node/npm, native environment, independently authorized source and separate candidate/prior runtime pins."
- **[[c4]]** `prior-artifact` `LLD s1 dataModelChanges: Linux source installation selection and source upgrade transaction` — "Private versioned selector/journal, exclusive mutation owner, atomic durable publication and retained process closure."
- **[[c5]]** `prior-artifact` `LLD s1 dataModelChanges: Predecessor qualification and failed-update recovery` — "Actual executable/dependency provenance must be qualified; preserve local edits, stale out and partial npm; explicit independent rollback-baseline or side-by-side recovery."
- **[[c6]]** `prior-artifact` `LLD s1 errorPaths and migration` — "Failures before cutover preserve incumbent; stop/start and durable rollback use proven actor closure, compatibility and wasRunning; every applicable entrypoint consumes selection."
- **[[c7]]** `prior-artifact` `LLD s1 testStrategy, migration and generated companion definitions` — "Real historical and second-update/native qualification on Mac and both OrbStack architectures; fault/closure proofs, package delivery, data retention and final diagram/release evidence."
