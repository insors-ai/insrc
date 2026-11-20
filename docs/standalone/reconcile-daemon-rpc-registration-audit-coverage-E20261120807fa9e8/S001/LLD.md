<!-- insrc:artifact LLD-807fa9e8fb678f4b-s1 -->

# LLD: STORY-807fa9e8fb678f4b-s1 — Reconcile daemon RPC registration and audit coverage

## Summary

**Epic:** `reconcile-daemon-rpc-registration-audit-coverage`
**HLD base run:** `wf-1795173501200-iln8uq`
**HLD effective hash:** `bce6337fee05...`

Reconcile daemon registrations, repository-scope audit rules and execution classifications against the handlers the runtime actually constructs. Add missing qualification and retired-review cancellation coverage, replace stale inventories and count assumptions with exact contract checks, and update the repository-gate documentation. Public payloads, storage formats and retired-review refusal behavior remain compatible.

## Contents

1. [HLD context](#1-hld-context)
2. [Contract details](#2-contract-details)
3. [Error paths](#3-error-paths)
4. [Test strategy](#4-test-strategy)
5. [Migration](#5-migration)
6. [Alternatives considered](#6-alternatives-considered)
7. [References](#7-references)

## 1. HLD context

**Framework:** Standalone feature — no parent HLD. Design directly against the repo, grounded on the s1 analyze passes. There are no HLD shared contracts to honour.
**Rollout phase:** standalone

## 2. Contract details

**Surface level:** internal-shared

### 2.1 `buildHandlerRuntime`

```typescript
buildHandlerRuntime(deps: HandlerRuntimeDeps): HandlerRuntime
```

**Parameters:**
- `deps: HandlerRuntimeDeps` — Existing runtime services; contract tests use inert stubs for construction and isolated daemon-owned stores for dispatch.

**Returns:** `HandlerRuntime` — Assembled rpcHandlers and streamHandlers, including spread registrations; these actual maps are the registration inventory.

**Preconditions:**
- Construction-only checks must not execute provider calls or open the installed daemon's stores.

**Postconditions:**
- RPC_AUDIT keys equal the union of constructed unary and stream registrations with no missing or stale entries. Each audit row has reviewed evidence and a valid kind; modifying rows alone carry their existing repository/path rules.
- methodClasses entries uniquely cover every constructed method with the exact transport flag. Preserve an independently reviewed compatibility key inventory, updating only explained added methods.
- Add daemon.qualificationState as read-only in the repo audit and unary session-class in methodClasses: it reads journal/release/graph metadata through the full handler runtime. It is not shared state, FIFO-exempt or an admin-board method. Session workers already load this runtime and enter daemon store and maintenance guards.
- Retired review methods retain explicit main-daemon refusal ownership. Tests must verify membership in the named retired-review ownership sets and existing router precedence, rather than assume the entire codeReview family runs on shared-state workers.
- Callable step phase contracts, including frozen inert review schemas, are the independent expected phase inventory. Include design-review-step.cancel as read-only with unavailability evidence and reconcile any additional missing/stale phases only against their actual callable dispatcher/schema. Never restore deleted review execution.
- docs/daemon.md lists exactly FILE_MODIFYING_METHODS with the correct repo parameter and all six refusal codes. Remove retired-review modifying rows and document current modifying registrations.

### 2.2 `requireRepoForCall`

```typescript
requireRepoForCall(method: string, params: unknown, registered: ReadonlySet<string>, opts?: RepoCallOptions): RepoCallCheck
```

**Parameters:**
- `method: string` — Explicit audited modifying method or step phase.
- `params: unknown` — Untrusted request parameters.
- `registered: ReadonlySet<string>` — Registered canonical repository paths.
- `opts: RepoCallOptions` _(optional)_ — Existing continuation token repository context when explicitly allowed by the phase rule.

**Returns:** `RepoCallCheck` — Existing checked canonical repository and rewritten parameters, or refusal code/error.

**Preconditions:**
- No fallback to daemon cwd, INSRC_REPO or session workspace establishes mutation authority.

**Postconditions:**
- Preserve repo-missing, repo-not-absolute, repo-not-directory, repo-not-registered, path-outside-repo and repo-mismatch behavior.
- Every modifying registered RPC/stream and supported modifying phase remains covered by its gate; exact exercised-name sets replace a fixed lower bound. Keep successful registered-repo writes and no-write refusal controls.
- Unavailability remains the first boundary for retired review endpoints; classify them as read-only refusals without forcing a repo gate.

### 2.3 `inDaemonTarget`

```typescript
inDaemonTarget(method: string, view: InDaemonRouteView): { readonly cls: MethodClass; readonly shared?: true } | undefined
```

**Parameters:**
- `method: string` — Existing method routing key.
- `view: InDaemonRouteView` — Current routed classes and shared-worker identity.

**Returns:** `{ readonly cls: MethodClass; readonly shared?: true } | undefined` — Existing routed worker target or inline execution on the current daemon thread.

**Preconditions:**
- Method-class data remains worker-safe and imports no handler runtime.

**Postconditions:**
- Keep existing admin/indexing and shared-state routing behavior. qualificationState is ordinary session work: nested calls stay inline on the current full-runtime daemon thread.
- Explicitly test unknown, missing, stale, duplicate and wrong-transport inventory drift. Do not add family fallbacks or blanket reviewed exemptions.
- Ownership relationships are metadata lookups: each registered key has one execution class and one audited repo-scope kind, while transport membership is checked independently. Existing main-thread overrides take priority over session class. No domain entity, module-dependency or public IPC shape changes require a new ERD or interaction diagram; these explicit ownership rules suffice.

## 3. Error paths

**Error cases**

- **A new or merged method lacks an audit/class entry, or an old row is no longer registered.** (recoverable)
  - Detection: Bidirectional exact key comparison against constructed unary and stream maps, plus callable phase inventory.
  - Response: Fail the named contract test with missing/stale keys; do not synthesize a default classification.
  - User impact: Prevents silently ungated mutation or requests sent to unsupported owners.
- **Missing, relative, nonexistent, unregistered or mismatched repository, or path traversal outside it.** (recoverable)
  - Detection: Existing requireRepoForCall and dispatch tests, including conflicting cwd/environment and continuation token cases.
  - Response: Retain the existing six refusal codes before repository mutation; stream refusal remains an error frame.
  - User impact: Caller gets the existing actionable refusal and repository files remain unchanged.
- **Unavailable review called through RPC or a frozen step phase, including cancel.** (terminal)
  - Detection: Existing Batch04 unavailable-boundary and router precedence controls.
  - Response: Preserve the current unavailable response before repo lookup, worker allocation or review work.
  - User impact: Retired reviews remain unavailable and cause no writes or provider calls.
- **qualificationState has no completed rollback, release identity mismatch, or missing/wrong graph fixture.** (recoverable)
  - Detection: Existing handler guards and an isolated negative dispatch control.
  - Response: Keep the existing no-completed-qualification or missing-fixture error; never return fabricated success or route to an admin worker lacking the handler.
  - User impact: Qualification reports failure accurately.

**Edge cases**

| Input | Expected |
| :--- | :--- |
| A method supplied by an object spread or auxiliary task-progress registration. | The constructed-map inventory includes it regardless of source formatting. |
| Unary/stream flag swapped, duplicate descriptor, missing method, stale method, or unknown method. | Independent negative controls detect each drift category; unknown methods receive no automatic audit exemption. |
| A retired codeReview method is still session-class but has an explicit main-daemon refusal override. | Ownership tests assert the exact explicit override and local refusal rather than shared-family membership. |
| A continuation supplies an opaque state token but no explicit repo. | Only phases already permitting repoFromRunToken consume their validated run repository; conflicting explicit repo is refused. |
| Changing numbers of modifying methods after retirement or legitimate additions. | Exact identity and exercised-method coverage governs dispatch validation; no arbitrary minimum count substitutes for coverage. |

**Invariants to preserve**

- Repository authority derives from explicit registered canonical repo or an already-supported validated continuation token, never daemon environment/cwd. [[c1]]
- Daemon-owned storage, worker-safe classification imports and existing main-thread refusal ownership remain intact. [[c2]]
- Review implementation stays retired; frozen schemas remain inert compatibility data. Qualification evidence regeneration belongs to another batch. [[c3]]

## 4. Test strategy

**Test framework:** `node:test and node:assert/strict under the repository Node22 test coordinator; build once, concurrency=1, no live-service flag. Preserve source/out consistency and retain results/cleanup artifacts.`

**Test levels**

- **contract** — Prove exact registration, classification, phase and documentation coverage independently of production metadata.
  - Subjects: `src/daemon/__tests__/handler-runtime.test.ts: reviewed compatibility snapshots include explained cancellation and qualification additions; constructed maps include spread registrations.`, `src/daemon/__tests__/repo-call-audit.test.ts: exact RPC/stream union and callable phase coverage, valid kinds/evidence and repo rules; detect missing/stale rows.`, `src/daemon/__tests__/repo-call-table.test.ts: exact disjoint modifying/nonmodifying partition over actual registration and callable phases, with unknown-name negative control.`, `src/daemon/threads/__tests__/method-class.test.ts: unique complete method classes and stream flags; missing/stale/duplicate/wrong-transport controls; worker-safe imports and explicit retired-review ownership.`, `src/daemon/__tests__/daemon-doc-repo-table.test.ts: exact modifying-method names/repo params and six refusal codes.`
  - Fixtures: `Inert runtime construction dependencies; expected keys come from actual assembled runtime, never the audit under test.`, `Frozen callable phase schemas and current dispatch contracts, including unavailable review phases.`
- **integration** — Prove repository authority and real dispatch ownership rather than metadata equality alone.
  - Subjects: `src/daemon/__tests__/repo-gate-dispatch.test.ts: exercise every modifying RPC/stream by exact identity without repo, assert unchanged filesystem, retain successful registered feedback append.`, `src/daemon/__tests__/repo-call-gate.test.ts: preserve refusal codes, canonical paths, cross-repo and validated continuation semantics.`, `qualificationState: isolated full-runtime unary dispatch rejects an unqualified fixture with its existing error rather than unknown-method; routing/class tests prove ordinary session ownership and no admin-board/shared-state dispatch.`, `Retired review router precedence and no-work refusal controls from Batch04 remain regression evidence; rerun directly affected router/unavailability files if routing assumptions change.`
  - Fixtures: `Managed temporary HOME and registered repositories, daemon store ownership, ordinary child cleanup; never installed live stores.`, `Use the existing coordinator for build/run ownership and serialized files. No live providers or qualification release regeneration.`
- **smoke** — Compile and run the complete affected files with accountable cleanup.
  - Subjects: `Run all seven baseline files through Node22 scripts/test-harness/run.mjs --concurrency=1; broaden only to directly affected dispatch/phase regressions.`, `Retain TAP/results/cleanup evidence under docs/plans; report whole-file failures honestly, no skip/force-exit suppression.`
  - Fixtures: `Baseline run 8aecf395-5b83-4e46-8b56-cf5a90f04dc3: 24 tests, 17 pass, 7 fail, no incomplete coverage, confirmed child closure.`

**Acceptance mapping**

| Criterion | Proving tests |
| :--- | :--- |
| `ac1` | `Exact assembled-handler audit and method-class coverage, reviewed snapshots, stream flags, phase coverage and drift controls establish complete explicit classifications. This is a local proving label for the issue's prose requirement; no upstream typed criterion was provided.` |
| `ac2` | `Full modifying dispatch identity coverage, refusal code/canonicalization controls and successful registered-repo feedback append preserve repository authority.` |
| `ac3` | `qualificationState owner/class and negative dispatch controls, retired-review main-thread refusal checks and worker-safe imports preserve execution ownership.` |
| `ac4` | `Exact daemon documentation parity plus complete seven-file coordinated run and cleanup evidence establish coherent maintained coverage.` |

## 5. Migration

**State before:** Six of seven baseline files fail because qualificationState lacks audit and class entries, cancel additions are absent from compatibility snapshots, review ownership expectations and repo-gate docs are stale, and dispatch coverage relies on a fixed modifying-method count. The repository gate's own tests pass.

**State after:** Existing explicit audit/class/phase inventories agree with actual constructed registrations and callable contracts; authority and refusal behavior stay enforced, ownership is explicit, docs match modifying methods, and independent negative controls detect drift.

**Zero downtime:** no — **Data rewrite:** no

**Steps**

1. After human LLD and PLAN approvals, repair only evidenced audit/class omissions and the related independent registration/phase and ownership expectations. Preserve public endpoint shapes and review unavailability. — ↩ rollbackable
2. Reconcile documentation with reviewed modifying rules; run the complete affected files serially through the coordinator, retain evidence and update the failure/batch record. — ↩ rollbackable
3. Present validated BUILD for human approval before completion. Deployment/restart uses the normal separate daemon lifecycle; no installed daemon change or release qualification is required to validate this batch. — ↩ rollbackable

**Backward compat:** No persisted schema, entity, RPC parameter or result shape changes. Existing refusal messages/codes and retired callable review schema compatibility stay intact. qualificationState gains explicit unary session classification matching an existing full-runtime owner. Reverting code/tests/docs restores previous metadata without data conversion.

## 6. Alternatives considered

### 6.1 a1: Reconcile explicit contracts — **CHOSEN**

Repair existing inventories and validate against assembled handler maps and callable phase contracts.

Keep RPC_AUDIT, STEP_PHASE_AUDIT, methodClasses and explicit ownership sets. Add evidence-based missing classifications and use independent exact comparisons against constructed RPC/stream maps and callable phase contracts. Retain reviewed endpoint snapshots as compatibility evidence, current refusal behavior and worker-safe routing imports; reconcile docs with the modifying table.

### 6.2 a2: Unified endpoint descriptors

Replace registration, audit and routing inventories with one descriptor per endpoint.

Create descriptors containing handlers, transport, repo rules, class and ownership, then derive runtime registrations and documentation from them. Preserve independent behavior tests because generated metadata agreement alone cannot prove correct classification.

**Rejected because:** Can satisfy coverage but introduces unnecessary handler-registration and worker-safe import migration; a single generated metadata source does not prove its own correctness.

## 7. References

- **[[c1]]** `code` `src/daemon/repo-call-gate.ts`
- **[[c2]]** `code` `src/daemon/threads/method-class.ts`
- **[[c3]]** `prior-artifact` `docs/standalone/reconcile-daemon-rpc-registration-audit-coverage-E20261120807fa9e8/ISSUE.md`
- **[[c4]]** `code` `src/daemon/handler-runtime.ts`
- **[[c5]]** `code` `src/daemon/threads/session-worker.ts`
- **[[c6]]** `code` `src/daemon/threads/admin-worker.ts`
- **[[c7]]** `code` `src/daemon/repo-call-audit.ts`
- **[[c8]]** `code` `src/mcp/review-input-schemas.ts`
- **[[c9]]** `doc` `docs/testing.md`
