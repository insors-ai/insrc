<!-- insrc:artifact LLD-c3d71313f34bce71-s5 -->

# LLD: STORY-c3d71313f34bce71-s5 — Delegate upgrade migrations to ordered hooks

## Summary

**Epic:** `reliable-cross-platform-daemon-installation-lifecycle`
**HLD base run:** `wf-1795445383474-itgkv3`
**HLD effective hash:** `77bfb88eed6d...`
**Tracker:** [insors-ai/insrc#247](https://github.com/insors-ai/insrc/issues/247)

Upgrade migrations run as ordered in-process hooks inside a candidate daemon with exclusive data ownership. Each hook decides what to migrate and validates its result. Failure or interruption blocks startup until explicit retry or hook-owned recovery succeeds.

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

**Rollout phase:** D — delegated upgrades
**Consumes:** `sc1` (Installation and release identity), `sc2` (Manager command and operation state), `sc3` (Dependency report and consent), `sc4` (Daemon shutdown and readiness), `sc5` (Ordered upgrade hook delegation), `sc6` (Local transport and explicit installation home)

**Adjacent scope (owned by other stories — do NOT implement here):**
- `s1`: Own the foundational manifest, controller/operation/consent/hook/transport contracts because every branch already depends on s1. Private implementation covers bootstrap, runtime/payload integrity, bundle preparation/publication, platform lock adapter and atomic install records. Later stories implement lifecycle, checks and hooks behind these contracts. The canonical scripts and interactive installer mode are shared with manual invocation and both IDEs; terminal prompts and durable results are part of this foundation. Include the selected release's installed TUI entry/assets in the payload and default successful interactive installer-to-TUI handoff. The s1 LLD must explicitly reserve ManagerAction.install to the shared terminal bootstrap script and forbid IDE-adapter invocation. DEF traceability: E20261123c3d71313:S001:FR001 and this story's DEF acceptance criteria apply unchanged. — owns `sc1`, `sc2`, `sc3`, `sc5`, `sc6`, `sc7`
- `s2`: Private dev checkout/branch sync, lockfile installation and native build preparation; returns the same immutable prepared candidate. It does not define a second lifecycle or migration engine. Include the selected release's installed TUI entry/assets in the payload and default successful interactive installer-to-TUI handoff. DEF traceability: E20261123c3d71313:S002:FR001 and this story's DEF acceptance criteria apply unchanged.
- `s3`: Private platform dependency detection, user-level Ollama installation and agent CLI recommendations. It implements foundational reports/consent and never auto-installs agent CLIs. DEF traceability: E20261123c3d71313:S003:FR001 and this story's DEF acceptance criteria apply unchanged.
- `s4`: Private daemon start/readiness, boot guard integration, shutdown drain/immediate exit and exit-completion launcher wrapper; transport is shared. No delivery sync/build on start and no signal/PID daemon control. DEF traceability: E20261123c3d71313:S004:FR001 and this story's DEF acceptance criteria apply unchanged. — owns `sc4`
- `s6`: Private VS Code native terminal open/focus/launch integration, duplicate-action handling and post-install reconnect. It invokes the shared script and leaves all install prompts/output in that terminal, including after failure. Existing ordinary lifecycle and upgrade-consent UI remains thin. Successful installation automatically enters the installed TUI in that same terminal; the IDE only reconnects/status-checks and does not require a second click. DEF traceability: E20261123c3d71313:S006:FR001 and this story's DEF acceptance criteria apply unchanged.
- `s7`: Private JetBrains native terminal open/focus/launch integration with the same script, stdin/output and post-install readiness behavior as VS Code; no independent wizard or hidden install. Preserve background activation/control and Windows IPC bridge for ordinary daemon operations. Successful installation automatically enters the installed TUI in that same terminal; the IDE only reconnects/status-checks and does not require a second click. DEF traceability: E20261123c3d71313:S007:FR001 and this story's DEF acceptance criteria apply unchanged.
- `s8`: Private isolated VM/runner fixtures, target matrix evidence and release qualification results, including real Windows named-pipe behavior and preservation of host v2 daemon. Terminal-install parity checks cover each IDE and manual invocation, paths with spaces/Unicode, missing terminal support, declined Ollama, Ctrl+C/close, duplicate windows, retained output and readiness-confirmed completion. Verify successful install enters TUI in the original terminal, install lock is released before TUI use, TUI exit leaves daemon running, and failure/cancellation never opens TUI. DEF traceability: E20261123c3d71313:S008:FR001 and this story's DEF acceptance criteria apply unchanged.

## 2. Contract details

**Surface level:** internal-shared

### 2.1 `HookReference`

```typescript
interface HookReference { id: string; version: string; module: string }
```

**Parameters:**
- `input: unknown` — Immutable ordered hook identity.; untrusted wire input is schema-validated before use.

**Returns:** `HookReference` — Immutable ordered hook identity.

**Preconditions:**
- Candidate identity/inventory and module containment validated by s1.
- Unique id/version entries retain manifest order.

**Postconditions:**
- No dependency sorting, remote hook endpoint, arbitrary external module path or implicit migration discovery.

### 2.2 `MigrationContext`

```typescript
interface MigrationContext { installationId: string; operationId: string; fromReleaseId?: string; toReleaseId: string; dataHome: string }
```

**Parameters:**
- `input: unknown` — Exact upgrade scope passed to all hook methods.; untrusted wire input is schema-validated before use.

**Returns:** `MigrationContext` — Exact upgrade scope passed to all hook methods.

**Preconditions:**
- Operation admitted and incumbent stopped through s4 completion proof.
- Candidate acquires exclusive daemon-owned data lease before opening stores.
- First admitted upgrade and explicit reconciled same-candidate retry are both valid; first install uses no predecessor and requires exclusive ownership, not nonexistent incumbent completion.

**Postconditions:**
- Same from/to identity survives retry; manager/IDE never open LMDB/Lance.
- Migration-only mode does not start normal indexing/model/workflow services.

### 2.3 `UpgradeHook`

```typescript
interface UpgradeHook { check(context: MigrationContext): Promise<HookDecision>; run(context: MigrationContext): Promise<void>; test(context: MigrationContext): Promise<HookValidation> }
```

**Parameters:**
- `input: unknown` — Delegated local in-process migration.; untrusted wire input is schema-validated before use.

**Returns:** `UpgradeHook` — Delegated local in-process migration.

**Errors:**
- `migration-hook-failed` when Method throws, times out, exits or validation returns passed=false.

**Preconditions:**
- check/test are validation/applicability operations; run owns mutation and recovery policy.
- Hook modules loaded only from the verified candidate; trusted code is not claimed sandboxed.

**Postconditions:**
- Serial manifest order; no later hook on check/run/test failure.
- Record run-started before run; require test after any possibly executed unvalidated run.
- An unstarted not-needed hook skips cleanly; retry not-needed never erases pending test obligation.

### 2.4 `HookValidation`

```typescript
interface HookValidation { passed: boolean; detail: string }
```

**Parameters:**
- `input: unknown` — Evidence supplied by a hook's test method.; untrusted wire input is schema-validated before use.

**Returns:** `HookValidation` — Evidence supplied by a hook's test method.

**Preconditions:**
- Hook has the exact admitted context and exclusive data owner.

**Postconditions:**
- Only passed=true can complete an unvalidated run; diagnostics preserve false/exception stage.

## 3. Data model changes

### 3.1 `Migration-only boot mode` — new

New private boundary src/daemon/upgrade-hooks.ts and a gated migration-only branch of src/daemon/index.ts. Validate controller admission before importing/opening stores. Initialize only hook-required daemon-owned resources, run serial hooks, close those resources and exit before normal daemon start. The existing graph ownership/health guards remain authoritative; a lost/corrupt owner fails closed. This mode is not a second DB owner and does not run application indexing/model boot.

**Call sites:**
- `src/daemon/index.ts`
- `src/db/graph/store.ts`

### 3.2 `Atomic hook-stage journal` — new

One user-protected journal binds installation/operation/from/to/candidate inventory and ordered entries {index,id,version,moduleDigest,stage,runStarted,testPassed,detail}. Persist atomically under the same operation's ownership; the public OperationRecord reports current hook/stage/blocked state while this private record keeps exact versions. Validated prefix order cannot be reordered or reused for another candidate. Keep run-started through interruption until test passes, even if a retry check says not-needed. Only the lock-owning manager writes controller.json. Only the candidate daemon writes its operation/candidate-bound hook journal atomically while holding the exclusive data lease; it never writes controller.json or inherits the manager lock. Journal run-started commits before mutation. Stage events are advisory; OperationRecord is a possibly lagging projection, never migration validation evidence. Validate journal identity/version/order/digests before accepting results. On manager exit, a live candidate may finish its admitted hooks/journal but cannot activate or write controller state. A new lock owner first reconciles the exact candidate session, lease and protected observed-exit evidence; held/unknown ownership means busy/uncertain, never a second runner. Lease availability alone is not migration success. Only after prior candidate actual exit may explicit recovery validate the journal and resume the same operation or retry unvalidated hooks under hook policy. Reject stale session/revision writes; no PID/age inference or predecessor restart. Initial migration in migrating and candidate normal boot in activating require matching live-owner admission; independent ordinary boot remains denied.


### 3.3 `Failure, retry and startup guard` — new

Initial migration-only boot is admitted for a live manager-owned operation in migrating; an explicit same-operation/same-candidate retry is also admitted after reconciliation. Ordinary startup executes no hooks. Normal candidate boot in activating requires live-owner admission, validated journal and prior migration-process exit. Only the lock-owning manager writes controller.json. Only the candidate daemon writes its operation/candidate-bound hook journal atomically while holding the exclusive data lease; it never writes controller.json or inherits the manager lock. Journal run-started commits before mutation. Stage events are advisory; OperationRecord is a possibly lagging projection, never migration validation evidence. Validate journal identity/version/order/digests before accepting results. On manager exit, a live candidate may finish its admitted hooks/journal but cannot activate or write controller state. A new lock owner first reconciles the exact candidate session, lease and protected observed-exit evidence; held/unknown ownership means busy/uncertain, never a second runner. Lease availability alone is not migration success. Only after prior candidate actual exit may explicit recovery validate the journal and resume the same operation or retry unvalidated hooks under hook policy. Reject stale session/revision writes; no PID/age inference or predecessor restart. Initial migration in migrating and candidate normal boot in activating require matching live-owner admission; independent ordinary boot remains denied. Hook check/run/test and documented manual recovery retain all data-policy decisions; a hung/unreachable candidate remains uncertain, never externally killed. Consume s4's proposed mandatory MigrationExitReceipt: manager records the full admission/session identity before spawn; wrapper writes durable proof after natural or failed child exit even if manager died. Recovery validates that receipt and the exact hook journal; neither exit code nor journal alone is success. Missing receipt remains uncertain; no second runner. This story does not define another receipt format/writer.


### 3.4 `No-op and predecessor adoption` — new

Ordinary startup does not execute hooks. An upgrade with no applicable work still yields an explicit validated no-migration outcome; first install without predecessor does not invent one. Supported legacy/predecessor acceptance is checked before disruption, and each release carries all ordered hooks needed for its declared predecessor set. Unsupported source state is diagnosed before mutation.


## 4. Diagrams

- [Sequence diagram](docs/epics/reliable-cross-platform-daemon-installation-lifecycle-E20261123c3d71313/S005/sequence-diagram.html)

## 5. Interaction with shared contracts

| Contract | Role | How |
| :--- | :--- | :--- |
| `sc1` | consumes | Exact immutable candidate and predecessor acceptance. |
| `sc2` | consumes | Publish stage/blocked outcome via existing operation state; explicit same-candidate retry. |
| `sc3` | consumes | Consume dependency/precondition readiness; no dependency installer. |
| `sc4` | consumes | Require incumbent exit and exclusive ownership release before data open. |
| `sc5` | consumes | Execute the foundation-owned check/run/test contract serially; do not redesign it. |
| `sc6` | consumes | Honor explicit home and user-scoped local control endpoints. |

## 6. Error paths

**Error cases**

- **Hook method fails or test is false** (recoverable)
  - Detection: Method result/exception, deadline or child exit plus durable stage indicates failure.
  - Response: Record exact hook/version/stage as blocked and stop later hooks/startup.
  - User impact: User sees actionable diagnostics and explicit retry.
- **Candidate or context changes on retry** (recoverable)
  - Detection: Journal identity/digest/order does not match admitted operation.
  - Response: migration-context-conflict; do not import hooks or touch data.
  - User impact: New upgrade cannot silently replace a failed migration.
- **Check says not-needed after an interrupted run** (recoverable)
  - Detection: Journal has runStarted without testPassed.
  - Response: Run required validation anyway; failure stays blocked.
  - User impact: Partial mutation is not mistaken for completed migration.
- **Data owner unavailable or stores fail to close** (recoverable)
  - Detection: Exclusive lease/store-health/close or observed exit evidence fails.
  - Response: Blocked/uncertain outcome; no normal start or manager DB access.
  - User impact: No simultaneous store ownership.

**Edge cases**

| Input | Expected |
| :--- | :--- |
| All clean checks return not-needed | Skip runs and report validated no-op; no hook on ordinary startup. |
| Hook run completed but test response was lost | Retry reconciles exact journal and requires test; no automatic destructive rerun. |
| Hook needs manual recovery | Expose hook-owned instructions; framework provides no generic data policy. |

**Invariants to preserve**

- Remain inside s5 boundary; no elevated commands, PID/kill daemon fallback, direct cloud LLM REST, or host v2 daemon mutation. [[c1]]
- Approved HLD shared contracts, terminal-only install and success-to-TUI handoff remain unchanged. [[c2]]
- DEF E20261123c3d71313:S005:FR001 and this story acceptance criteria apply unchanged. [[c3]]

## 7. Test strategy

**Test framework:** `node:test + node:assert/strict; canonical *.test.ts coordinator. Real platform/IDE qualification is recorded separately and not inferred from fakes.`

**Test levels**

- **contract** — Verify delegation/order/context and the pending-validation invariant.
  - Subjects: `skip/needed/exception/false-test paths`, `same-candidate retry`, `no graph or implicit rollback policy`
- **integration** — Exercise actual candidate process/store ownership and durable journal crash points.
  - Subjects: `crash before/after run-started/run/test/commit`, `not-needed after partial run still tests`, `normal boot blocked`, `later hooks never execute after failure`, `First upgrade admits migration-only boot, while ordinary startup and forged/stale admission fail.`, `Manager self-exit before/after run-started/run/test/final journal; surviving candidate finish, held/unknown lease and missing-exit cases; no duplicate run or stale controller write.`, `Manager exits during hook run/test; candidate finishes; wrapper receipt plus journal permits exact recovery. Zero-exit without validated tests never activates.`
  - Fixtures: `Disposable registered graph/Lance state, hook fixtures and self-exiting child processes.`
- **live** — Qualify supported real predecessor paths and native closure.
  - Subjects: `no concurrent old/candidate stores`, `hook-owned migration recovery`, `startup only after validated completion`

**Acceptance mapping**

| Criterion | Proving tests |
| :--- | :--- |
| `ac1` | `ordered-check-skip-run-test`, `unique-hook-reference-validation`, `first-upgrade-migration-admission` |
| `ac2` | `check-run-test-failure-blocks-later-and-startup`, `false-test-and-process-interruption-diagnostics`, `manager-exit-candidate-alive-blocks-second-runner` |
| `ac3` | `same-candidate-explicit-retry`, `partial-run-not-needed-still-tests`, `hook-owned-recovery-only`, `durable-journal-reconcile-after-owner-death`, `mandatory-receipt-and-journal-recovery`, `exit-code-not-migration-validation` |
| `ac4` | `ordinary-start-no-hooks`, `no-applicable-upgrade-noop`, `bundle-dev-same-runner`, `ordinary-boot-denied-but-admitted-first-migration-allowed` |
| `ac5` | `supported-predecessor-representative-state`, `unsupported-predecessor-before-mutation`, `no-generic-delete-rebuild-policy` |

## 8. Alternatives considered

### 8.1 a1: Ordered hook list with one stage journal — **CHOSEN**

Execute the manifest list serially with exact-operation stage receipts.

The candidate daemon reads ordered unique hook references and one small operation-bound journal. Each hook decides applicability and owns its work/validation; the runner only enforces sequencing and startup blocking.

Retry reuses the immutable candidate and source identity, reconciles prior run/test stage, and never skips required validation.

### 8.2 a2: One receipt file per hook invocation

Separate hook-stage receipts, assembled into an operation outcome.

Use the same ordered hook interface but persist independent invocation files for each hook/version/stage. The runner assembles their valid prefix before starting the next hook.

This can retain more detailed history but introduces multi-file completeness and cleanup rules in addition to the required operation identity.

**Rejected because:** Per-invocation receipt aggregation adds durability/cleanup combinations that the small operation journal already avoids.

## 9. References

- **[[c1]]** `doc` `AGENTS.md`
- **[[c2]]** `prior-artifact` `docs/epics/reliable-cross-platform-daemon-installation-lifecycle-E20261123c3d71313/HLD.md`
- **[[c3]]** `prior-artifact` `docs/epics/reliable-cross-platform-daemon-installation-lifecycle-E20261123c3d71313/DEF.md`
- **[[c4]]** `analyze-bundle` `src/daemon/index.ts`
- **[[c5]]** `analyze-bundle` `src/db/graph/store.ts`
- **[[c6]]** `analyze-bundle` `src/daemon/server.ts`
