<!-- insrc:artifact LLD-807fa9e8fb678f4b-s1 -->

# LLD: STORY-807fa9e8fb678f4b-s1 — Reconcile daemon RPC registration and audit coverage

## Summary

**Epic:** `reconcile-daemon-rpc-registration-audit-coverage`
**HLD base run:** `wf-1795175116137-nrshbf`
**HLD effective hash:** `3a1654ebd181...`

Keep Batch05's exact registration, audit, routing and documentation reconciliation. Correct the discovered authority gap in modifying RPC routes while preserving existing error/result shapes. For tools.call, preserve unknown-tool, schema, cancellation and approval-denial behavior, then enforce explicit registered-repository authority immediately before capability execution; the new refusal for an otherwise admitted operation is an intentional compatibility change requiring approval.

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
- Previously unaudited team.park/team.resume/team.settle are modifying repo-scoped operations; their new explicit repo refusals are intentional. repo.settings.set remains modifying but preserves its own exact-registration check and structured error envelope. tools.call is explicitly modifying, with its authority check placed at execution admission rather than generic stream entry.

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

### 2.4 `executeTool`

```typescript
executeTool(toolId: string, input: ToolInput, deps: ToolDeps): Promise<ToolResult>
```

**Parameters:**
- `toolId: string` — Existing registry capability key.
- `input: ToolInput` — Existing untrusted capability input.
- `deps: ToolDeps` — Existing daemon execution context; the tools.call adapter supplies an internal repository-authority check using the daemon registry, never a caller-supplied wire callback.

**Returns:** `Promise<ToolResult>` — Existing result shape, including unsuccessful results for earlier failures or denied repository authority.

**Preconditions:**
- No duplicated executor validation or new executor framework. No new IPC fields or direct cloud REST.

**Postconditions:**
- Preserve this order: tool lookup and existing temporary-session checks; existing input-schema rejection; cancellation; approval description and denial; final cancellation; repository authority for otherwise admitted tools.call; capability execution and successful hooks.
- Unknown tool, invalid schema, cancelled call or declined approval must preserve its existing result/error and perform no repository registry lookup.
- At final admission, an invalid/unregistered repo yields an unsuccessful ToolResult using the existing failure shape, with the existing repo refusal code in its error text; no capability execute or success hook runs.
- Only the daemon installs the admission check for tools.call. Existing other executor callers retain their current contracts; no transport argument can supply a callback or waive authority.
- For an admitted operation, canonicalize repoPath from the authority check before execution. Preserve stream done/error envelopes and existing successful tool result shape.
- The new refusal for an otherwise admitted tools.call targeting an invalid repository is an intentional authority correction. Earlier blanket no-public-failure-change wording is superseded by these explicit ordering and compatibility rules.

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
- **tools.call is unknown, input-schema-invalid, cancelled or denied while its repoPath is invalid/unregistered.** (recoverable)
  - Detection: Dedicated executor/stream regression controls with a repository checker spy that fails if called.
  - Response: Return the existing earlier executor result unchanged; never replace it with repository refusal.
  - User impact: Existing actionable failures retain their precedence and format.
- **An otherwise admitted tools.call would execute in an invalid or unregistered repository.** (recoverable)
  - Detection: Daemon-supplied final admission check after existing validation, cancellation and approval denial handling.
  - Response: Return an unsuccessful ToolResult in the existing done envelope, carrying the repo refusal code in error text; execute and success hooks are untouched.
  - User impact: Intentional new authority refusal; caller supplies a valid registered repo before retrying.

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
- **integration** — Prove final tool admission authority with preserved earlier executor failures.
  - Subjects: `src/daemon/tools/__tests__/call-handler.test.ts and src/daemon/tools/__tests__/executor.test.ts: unknown tool, invalid schema, cancelled call and denied approval preserve existing results and never invoke the repository checker; admitted valid registered calls execute with canonical repoPath; refused calls execute no capability or success hook.`, `src/daemon/__tests__/repo-gate-dispatch.test.ts: exact modifying identities include tool dispatch and self-gated settings; preserve their own existing malformed/registration envelopes and check valid tool requests against unregistered repositories.`, `src/daemon/threads/__tests__/method-class.test.ts: actual Router and runtime handler test proves retired review local refusal precedes session-worker lookup.`
  - Fixtures: `Fake registry capabilities, approval broker controls and checker spies; isolated HOME and registered/unregistered temporary repos, no live provider.`

**Acceptance mapping**

| Criterion | Proving tests |
| :--- | :--- |
| `ac1` | `Exact assembled-handler audit and method-class coverage, reviewed snapshots, stream flags, phase coverage and drift controls establish complete explicit classifications. This is a local proving label for the issue's prose requirement; no upstream typed criterion was provided.` |
| `ac2` | `Full modifying dispatch identity coverage, refusal code/canonicalization controls and successful registered-repo feedback append preserve repository authority.` |
| `ac3` | `qualificationState owner/class and negative dispatch controls, retired-review main-thread refusal checks and worker-safe imports preserve execution ownership.` |
| `ac4` | `Exact daemon documentation parity plus complete seven-file coordinated run and cleanup evidence establish coherent maintained coverage.` |
| `ac5` | `New authority/ordering controls prove the deliberate compatibility correction while all existing earlier tool failures remain unchanged. This is an LLD-local label.` |

## 5. Migration

**State before:** Task-one code and all mapped tests/typecheck pass, but two build validation attempts reject the tools.call authority ordering under the original blanket failure-preservation requirement. The current early callback is unfinished, unapproved build work.

**State after:** Exact inventories remain reconciled and final tool admission authority preserves earlier executor failures. Only otherwise admitted operations gain the explicitly approved repository refusal.

**Zero downtime:** no — **Data rewrite:** no

**Steps**

1. Obtain human approval of this revised LLD and a replacement PLAN before continuing implementation. Replace the unfinished early tools.call callback with the approved final admission ordering; keep completed inventory/retired-router checks. — ↩ rollbackable
2. Reconcile documentation with reviewed modifying rules; run the complete affected files serially through the coordinator, retain evidence and update the failure/batch record. — ↩ rollbackable
3. Present validated BUILD for human approval before completion. Deployment/restart uses the normal separate daemon lifecycle; no installed daemon change or release qualification is required to validate this batch. — ↩ rollbackable

**Backward compat:** Public parameter/result schemas, storage formats and existing malformed/unknown/schema/cancellation/denial responses remain unchanged. Previously unaudited modifying team routes gain explicit repo refusal. Otherwise admitted tools.call operations with invalid/unregistered repos gain an intentional unsuccessful ToolResult before capability execution; registered successful operations keep their prior shape. No data rewrite or installed daemon restart is required.

## 6. Alternatives considered

### 6.1 a1: Authorize immediately before admitted tool execution — **CHOSEN**

Preserve earlier executor failures and enforce explicit repository authority before any admitted capability runs.

Retain explicit RPC/phase/class reconciliation and independent exact inventories. For tools.call, reuse the existing executor after unknown-tool, schema, cancellation and approval-denial handling; apply repository authority before capability execution and hooks. Define new repository refusals as an intentional compatibility change only for otherwise admitted operations.

### 6.2 a2: Gate every tool request at the stream boundary

Authorize before resolving and validating the selected capability.

Use the current generic modifying stream gate or the early toolsCall repository callback before executeTool. This is simple but changes unknown-tool, invalid schema, cancellation and denial precedence for requests with invalid repositories.

**Rejected because:** Build validation rejected this ordering because it replaces existing executor failures before any capability could execute.

## 7. References

- **[[c1]]** `code` `src/daemon/repo-call-gate.ts`
- **[[c2]]** `code` `src/daemon/threads/method-class.ts`
- **[[c3]]** `prior-artifact` `docs/standalone/reconcile-daemon-rpc-registration-audit-coverage-E20261120807fa9e8/ISSUE.md`
- **[[c4]]** `code` `src/daemon/handler-runtime.ts`
- **[[c5]]** `code` `src/daemon/tools/call-handler.ts`
- **[[c6]]** `code` `src/daemon/tools/executor.ts`
- **[[c7]]** `code` `src/daemon/repo-call-audit.ts`
- **[[c8]]** `prior-artifact` `docs/standalone/reconcile-daemon-rpc-registration-audit-coverage-E20261120807fa9e8/S001/BUILD.md`
- **[[c9]]** `doc` `docs/testing.md`
