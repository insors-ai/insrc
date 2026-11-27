<!-- insrc:artifact LLD-9c95950064e4b916-s1 -->

# LLD: STORY-9c95950064e4b916-s1

## Summary

**Epic:** `insrc-present-cannot-show-tracked-epic`
**HLD base run:** `wf-1795781226716-e61wgy`
**HLD effective hash:** `4aa2b6f12b0f...`

insrc_present currently refuses to open a document unless the daemon's pending-approval list includes it, and that list is also gated by a code-review-readiness rule that can never be satisfied while review is disabled -- so a perfectly normal, not-yet-decided artifact (like a tracked-epic Story's BUILD record) can never be shown. This Story adds a small, separate lookup the chat's present/approve flow uses instead: it answers only 'does this name resolve to exactly one real artifact record', regardless of that artifact's lifecycle status, leaving the existing pending-approval list (and the IDE plugins' review panel that also depends on it) completely unchanged. Because the MCP server process never reaches repo-touching data except through a dedicated daemon IPC method, this lookup is exposed as its own new IPC method (workflow.openable) mirroring the existing workflow.pending method exactly, including every completeness registry (RPC_AUDIT, method-class.ts, handler-runtime.test.ts's historical inventory) a new daemon RPC method must be registered in for the test suite to pass.

## Contents

1. [Epic impact analysis](#1-epic-impact-analysis)
2. [HLD context](#2-hld-context)
3. [Contract details](#3-contract-details)
4. [Error paths](#4-error-paths)
5. [Test strategy](#5-test-strategy)
6. [Migration](#6-migration)
7. [Alternatives considered](#7-alternatives-considered)
8. [References](#8-references)
9. [Open questions](#9-open-questions)

## 1. Epic impact analysis

**Does not apply**: Standalone bugfix Story with no prior Story of this Epic; there is nothing already built to analyse.

## 2. HLD context

**Framework:** Standalone feature — no parent HLD. Design directly against the repo, grounded on the s1 analyze passes. There are no HLD shared contracts to honour.
**Rollout phase:** standalone

## 3. Contract details

**Surface level:** internal

### 3.1 `resolveOpenableArtifacts`

```typescript
resolveOpenableArtifacts(repoPath: string): readonly { readonly artifactId: string; readonly mdPath: string }[]
```

**Parameters:**
- `repoPath: string` — Absolute repo path whose .insrc/artifacts directory is scanned.

**Returns:** `readonly { readonly artifactId: string; readonly mdPath: string }[]` — One entry per PENDING_KINDS artifact file on disk, regardless of lifecycle status or the BUILD/CR-sibling precondition.

**Preconditions:**
- repoPath is a registered repo

**Postconditions:**
- Already implemented and validated in this Story's t1 (unchanged by this revision)

### 3.2 `handleWorkflowOpenable`

```typescript
handleWorkflowOpenable(params: { repo?: string } | undefined, repoEnv: string | undefined): { readonly artifacts: readonly { readonly artifactId: string; readonly mdPath: string }[] } | { readonly error: string }
```

**Parameters:**
- `params: { repo?: string } | undefined` — The IPC call's params, carrying the repo path when the caller sends one.
- `repoEnv: string | undefined` — The daemon process's INSRC_REPO fallback, used exactly as handleWorkflowPending uses it.

**Returns:** `{ artifacts: readonly {...}[] } | { error: string }` — Mirrors handleWorkflowPending's own return shape and repo-resolution rule exactly: a structured { error } when no repo can be resolved, never a silently empty list in that case.

**Errors:**
- `structured-error-result` when repo cannot be resolved from params.repo or repoEnv -- returns { error } exactly as handleWorkflowPending does, never throws

**Postconditions:**
- New exported function in src/workflow/pending.ts, placed beside handleWorkflowPending, wrapping resolveOpenableArtifacts the same way handleWorkflowPending wraps listPendingArtifacts
- Defines named exported interfaces WorkflowOpenableResult/WorkflowOpenableError, mirroring the existing WorkflowPendingResult/WorkflowPendingError naming convention

### 3.3 `openableWorkflow`

```typescript
openableWorkflow(req: { repo: string }, deps?: UnaryRpcDeps): Promise<{ artifacts: readonly { artifactId: string; mdPath: string }[] } | { error: string }>
```

**Parameters:**
- `req: { repo: string }` — The resolved repo path to forward.
- `deps: UnaryRpcDeps` _(optional)_ — Test seams (connect), identical to pendingWorkflow's own deps parameter.

**Returns:** `Promise<{...} | { error: string }>` — A pure forward to the daemon's new 'workflow.openable' IPC method, structurally identical to pendingWorkflow's forward to 'workflow.pending'.

**Postconditions:**
- New exported function in src/mcp/daemon-stream.ts, placed beside pendingWorkflow
- Calls unaryRpc('workflow.openable', req, deps) -- a new IPC method name, never reusing 'workflow.pending'

### 3.4 `handleInsrcPresent`

```typescript
handleInsrcPresent(args: InsrcPresentArgs, deps: InsrcPresentDeps = {}): Promise<{ content: { type: 'text'; text: string }[]; isError?: boolean }>
```

**Parameters:**
- `args: InsrcPresentArgs` — The declared document names (artifact ids or paths).
- `deps: InsrcPresentDeps` _(optional)_ — Test seams for the IPC call and repo resolver.

**Returns:** `Promise<{ content: ...; isError?: boolean }>` — Unchanged external response shape: { presented: string[], notPending: string[] } as the text payload.

**Postconditions:**
- Calls openableWorkflow({repo}, deps) instead of pendingWorkflow({repo}, deps); pendingWorkflow is no longer imported or called by this function
- namesPending's matching logic is reused unchanged since it only needs {artifactId, mdPath}
- External request/response shape of the insrc_present MCP tool is unchanged

## 4. Error paths

**Error cases**

- **A declared name does not resolve to any artifact file at all (misspelled id or path).** (recoverable)
  - Detection: resolveOpenableArtifacts' scan over .insrc/artifacts finds no PENDING_KINDS file whose artifactId or mdPath matches the declared name.
  - Response: handleInsrcPresent places the name in notPending, exactly as today for an unmatched name -- no behavior change for this case.
  - User impact: The caller sees notPending and must correct the name before presenting again.
- **A bare filename (e.g. a plain 'PLAN.md') matches more than one artifact across different Stories.** (recoverable)
  - Detection: namesPending's filter over resolveOpenableArtifacts' output returns more than one match for the same declared name.
  - Response: The ambiguous name is reported as notPending, not guessed at -- the existing ambiguity rule in handleInsrcPresent is unchanged, now evaluated over the broader (status-independent) candidate set.
  - User impact: Caller must disambiguate with a more specific path or the artifact id.
- **A malformed artifact JSON file exists under .insrc/artifacts (corrupted or partially written).** (recoverable)
  - Detection: JSON.parse throws while resolveOpenableArtifacts scans that file (daemon-side, inside handleWorkflowOpenable).
  - Response: The malformed file is skipped and logged, matching listPendingArtifacts' existing one-bad-file-must-not-drop-the-rest behavior; the scan continues over the remaining files.
  - User impact: That one malformed artifact cannot be presented, but every other declared name still resolves correctly.
- **The daemon is unreachable, or the new 'workflow.openable' IPC call itself fails (e.g. the daemon returns { error }).** (recoverable)
  - Detection: openableWorkflow's unaryRpc either rejects (connection failure) or resolves with an 'error' field present in the result.
  - Response: handleInsrcPresent returns an isError result exactly as it already does today for a pendingWorkflow failure -- no new failure-handling branch, the same existing try/catch and 'error' in result check now wraps openableWorkflow instead.
  - User impact: The caller sees an explicit error, never a silently empty or silently-notPending answer.
- **The new 'workflow.openable' handler is registered in handler-runtime.ts but omitted from one of the daemon's own completeness registries (RPC_AUDIT or method-class.ts's TABLE).** (recoverable)
  - Detection: repo-call-audit.test.ts's assert.deepEqual(Object.keys(RPC_AUDIT).sort(), registeredMethods(), ...), and/or method-class.test.ts's coverage test asserting differences(tables) equals { missing: [], stale: [] }, fail at test time -- not at runtime.
  - Response: The test suite fails before any commit lands; the build step cannot report success. Both registries must be updated in the same commit that registers the handler.
  - User impact: A build attempted without all three registrations cannot pass validation; this is caught before merge, not in production.

**Edge cases**

| Input | Expected |
| :--- | :--- |
| An artifact kind outside PENDING_KINDS (e.g. a STUB or an EPIC/STORY/TASK record). | Not included in resolveOpenableArtifacts' output -- insrc_present never presents a non-reviewable kind, matching today's scope exactly. |
| An artifact whose lifecycle status is already 'approved' or 'rejected'. | Now included in resolveOpenableArtifacts' output (unlike listPendingArtifacts); insrc_present reports it as presented if its name resolves uniquely. Re-approving it is still governed separately by insrc_workflow_approve's own lifecycle checks, so presenting a decided artifact carries no approval risk. |
| A tracked-epic BUILD record with no CR-*.json sibling (the reported defect's exact case). | Now included in resolveOpenableArtifacts' output -- the CR-sibling precondition is not reapplied; insrc_present reports it as presented. |
| A daemon running an older build that has not yet registered the new 'workflow.openable' method. | The daemon's own unknown-method response surfaces as an ordinary IPC error through openableWorkflow/handleInsrcPresent's existing error path -- no fallback to the old pendingWorkflow/'workflow.pending' call is added; this is an in-process code change shipped as one unit, not a wire format requiring version negotiation. |

**Invariants to preserve**

- A malformed artifact file must not drop the rest of the scan: one bad file is skipped and logged, not a thrown error that fails the whole lookup. [[c1]]
- A declared name matching more than one document stays ambiguous and is reported notPending rather than guessed at. [[c2]]
- A daemon error or an unreachable daemon is answered as an explicit error, never silently treated as presented/notPending. [[c5]]
- Every registered daemon RPC method must have a matching entry in RPC_AUDIT (kind + evidence) and in method-class.ts's TABLE (method, class, stream), or the daemon's own completeness tests fail -- a new method's handler-runtime.ts registration is never sufficient on its own. [[c6]]

## 5. Test strategy

**Test framework:** `node:test`

**Test levels**

- **unit** — Prove resolveOpenableArtifacts returns every PENDING_KINDS artifact file regardless of lifecycle status, and regardless of the BUILD/CR-sibling precondition, while still skipping non-PENDING_KINDS files and malformed JSON (already implemented and passing from t1; carried unchanged into this revision).
  - Subjects: `resolveOpenableArtifacts returns a draft (never-decided) artifact`, `resolveOpenableArtifacts returns an approved artifact`, `resolveOpenableArtifacts returns a rejected artifact`, `resolveOpenableArtifacts returns a non-standalone BUILD with no CR sibling`, `resolveOpenableArtifacts excludes a non-PENDING_KINDS file (e.g. an EPIC/STORY/TASK record)`, `resolveOpenableArtifacts skips a malformed JSON file without dropping the rest of the scan`
  - Fixtures: `temp repo with .insrc/artifacts containing one artifact per PENDING_KINDS member at draft/approved/rejected status`, `a non-standalone BUILD file with no CR sibling`, `a non-PENDING_KINDS file (e.g. EPIC-<hash>.json)`, `a malformed (non-JSON) artifact file`
- **unit** — Prove the new daemon-side handleWorkflowOpenable wraps resolveOpenableArtifacts with the same repo-resolution rule as handleWorkflowPending.
  - Subjects: `handleWorkflowOpenable returns { artifacts } from a fixture repo via resolveOpenableArtifacts`, `handleWorkflowOpenable returns { error } when repo cannot be resolved from params or repoEnv`
  - Fixtures: `same temp-repo fixtures as resolveOpenableArtifacts's own tests`
- **unit** — Prove handleInsrcPresent now presents a name that listPendingArtifacts would have excluded, calls the new 'workflow.openable' method (not 'workflow.pending'), and preserves every existing ambiguity/unmatched/daemon-error behavior.
  - Subjects: `handleInsrcPresent presents a tracked-epic BUILD by artifact id with no CR sibling (the reported defect's exact case)`, `handleInsrcPresent presents the same BUILD by its repo-relative doc path`, `handleInsrcPresent presents an already-approved artifact by name`, `handleInsrcPresent reports notPending for a name matching zero artifacts`, `handleInsrcPresent reports notPending for a bare filename matching more than one document (ambiguity preserved)`, `handleInsrcPresent's external response shape stays { presented: string[], notPending: string[] }`, `handleInsrcPresent calls the daemon's 'workflow.openable' method, not 'workflow.pending'`, `handleInsrcPresent answers a daemon error or an unreachable daemon as an explicit error, never as presented`
  - Fixtures: `present-dispatch.test.ts's existing fakeDaemon helper, updated to expect 'workflow.openable' and to answer with the minimal {artifactId, mdPath} fixture shape`
- **contract** — Confirm the new 'workflow.openable' registration satisfies every existing daemon method-completeness test, with no new test code required.
  - Subjects: `repo-call-audit.test.ts: every method of the handler registry has an audit entry, now including workflow.openable`, `method-class.test.ts: the method set equals the keys of the constructed rpcHandlers and streamHandlers, now including workflow.openable`, `handler-runtime.test.ts: RECORDED_RPC + ADDED_RPC equals the registered method set, now including workflow.openable in ADDED_RPC`, `repo-call-table.test.ts: every registered method is a table row or on the reviewed read-only list -- workflow.openable satisfies this via its RPC_AUDIT kind:'read-only' entry with no separate edit`

**Acceptance mapping**

| Criterion | Proving tests |
| :--- | :--- |
| `ac1` | `handleInsrcPresent presents a tracked-epic BUILD by artifact id with no CR sibling (the reported defect's exact case)`, `handleInsrcPresent presents the same BUILD by its repo-relative doc path` |
| `ac2` | `resolveOpenableArtifacts returns a draft (never-decided) artifact`, `resolveOpenableArtifacts returns an approved artifact`, `resolveOpenableArtifacts returns a rejected artifact`, `resolveOpenableArtifacts returns a non-standalone BUILD with no CR sibling`, `resolveOpenableArtifacts excludes a non-PENDING_KINDS file (e.g. an EPIC/STORY/TASK record)`, `handleInsrcPresent calls the daemon's 'workflow.openable' method, not 'workflow.pending'` |
| `ac3` | `handleInsrcPresent reports notPending for a name matching zero artifacts`, `handleInsrcPresent reports notPending for a bare filename matching more than one document (ambiguity preserved)`, `resolveOpenableArtifacts skips a malformed JSON file without dropping the rest of the scan`, `handleInsrcPresent answers a daemon error or an unreachable daemon as an explicit error, never as presented`, `handleWorkflowOpenable returns { error } when repo cannot be resolved from params or repoEnv` |
| `ac4` | `repo-call-audit.test.ts: every method of the handler registry has an audit entry, now including workflow.openable`, `method-class.test.ts: the method set equals the keys of the constructed rpcHandlers and streamHandlers, now including workflow.openable`, `handler-runtime.test.ts: RECORDED_RPC + ADDED_RPC equals the registered method set, now including workflow.openable in ADDED_RPC` |

## 6. Migration

**State before:** handleInsrcPresent (src/mcp/server.ts:1105-1140) calls pendingWorkflow({repo}, deps) (src/mcp/daemon-stream.ts:315-320), a pure forward to the daemon's 'workflow.pending' IPC method (src/daemon/handler-runtime.ts:604-607), which wraps listPendingArtifacts. 'workflow.pending' is registered in exactly three source-level completeness tables: RPC_AUDIT (src/daemon/repo-call-audit.ts:291), method-class.ts's TABLE (src/daemon/threads/method-class.ts:256), and handler-runtime.test.ts's RECORDED_RPC historical inventory.

**State after:** handleInsrcPresent calls a new openableWorkflow({repo}, deps) forward to a new daemon 'workflow.openable' IPC method, which wraps resolveOpenableArtifacts (added in t1). 'workflow.openable' is registered in the same three completeness tables 'workflow.pending' is registered in, with matching kind/class/stream classifications. listPendingArtifacts, handleWorkflowPending, 'workflow.pending', pendingWorkflow and the IDE plugins' review panel are all unchanged.

**Zero downtime:** yes — **Data rewrite:** no

**Steps**

1. Add handleWorkflowOpenable (plus WorkflowOpenableResult/WorkflowOpenableError interfaces) to src/workflow/pending.ts, mirroring handleWorkflowPending's repo-resolution rule exactly but wrapping resolveOpenableArtifacts. — ↩ rollbackable
2. Register a new 'workflow.openable' entry in src/daemon/handler-runtime.ts's method table, mirroring the existing 'workflow.pending' entry (dynamic import of pending.js, call handleWorkflowOpenable). — ↩ rollbackable
3. Add a 'workflow.openable' entry to src/daemon/repo-call-audit.ts's RPC_AUDIT, classified kind: 'read-only' with evidence citing resolveOpenableArtifacts' bounded readdir, mirroring the 'workflow.pending' entry's shape. — ↩ rollbackable
4. Add a ['workflow.openable', 'session', false] entry to src/daemon/threads/method-class.ts's TABLE, mirroring the 'workflow.pending' entry's classification. — ↩ rollbackable
5. Add 'workflow.openable' to src/daemon/__tests__/handler-runtime.test.ts's ADDED_RPC array (the list of methods added since the historical RECORDED_RPC snapshot). — ↩ rollbackable
6. Add openableWorkflow to src/mcp/daemon-stream.ts, mirroring pendingWorkflow's unaryRpc forward but naming 'workflow.openable'. — ↩ rollbackable
7. Change handleInsrcPresent in src/mcp/server.ts to call openableWorkflow instead of pendingWorkflow; remove the now-unused pendingWorkflow import from server.ts if nothing else there needs it. — ↩ rollbackable
8. Update src/mcp/__tests__/present-dispatch.test.ts: every fakeDaemon() assertion of the called method name changes from 'workflow.pending' to 'workflow.openable', and every fixture object is trimmed to the minimal {artifactId, mdPath} shape the new daemon handler actually returns. — ↩ rollbackable
9. Add/extend unit tests for resolveOpenableArtifacts (t1, already done) and handleWorkflowOpenable per the test strategy; run the existing repo-call-audit.test.ts, method-class.test.ts, handler-runtime.test.ts and repo-call-table.test.ts suites to confirm their completeness checks pass with no further edits. — ↩ rollbackable

**Backward compat:** insrc_present's external MCP request/response shape ({ documents } in, { presented, notPending } out) is unchanged. listPendingArtifacts/handleWorkflowPending/'workflow.pending'/pendingWorkflow and every consumer of them (the IDE plugins' review panel) are byte-for-byte unchanged -- a provably separate IPC method, registered in parallel in every completeness table 'workflow.pending' already occupies, never altering its entries. The only observable behavior change is that insrc_present now also presents artifacts it previously refused -- a strict widening, not a narrowing, so no existing caller that depended on a name being presented can regress. This ships as one deployed unit (daemon + MCP server together); no wire-format version negotiation is added for an intermediate mixed-version state.

## 7. Alternatives considered

### 7.1 a1: New daemon IPC method 'workflow.openable', fully registered in every completeness registry it must pass — **CHOSEN**

Add a new daemon-side handler entry 'workflow.openable' (wrapping resolveOpenableArtifacts) and a new daemon-stream.ts forwarder, register it in RPC_AUDIT and method-class.ts's TABLE, add it to handler-runtime.test.ts's ADDED_RPC inventory, then switch handleInsrcPresent to call the new forwarder instead of pendingWorkflow.

Add a thin daemon handler 'workflow.openable' in src/daemon/handler-runtime.ts, structurally identical to the existing 'workflow.pending' entry. Add a matching forwarder openableWorkflow in src/mcp/daemon-stream.ts, mirroring pendingWorkflow. Register the new method in the two source-level completeness registries every daemon RPC method must appear in: src/daemon/repo-call-audit.ts's RPC_AUDIT (kind: 'read-only', mirroring 'workflow.pending's own entry) and src/daemon/threads/method-class.ts's TABLE (['workflow.openable', 'session', false], mirroring 'workflow.pending's own entry) -- both enforced by their own completeness tests that fail otherwise. Also add 'workflow.openable' to src/daemon/__tests__/handler-runtime.test.ts's ADDED_RPC historical inventory, which independently asserts the exact registered-method set. handleInsrcPresent (server.ts) then calls openableWorkflow instead of pendingWorkflow. listPendingArtifacts, handleWorkflowPending, 'workflow.pending' and the IDE panel's consumption of it stay completely untouched.

### 7.2 a2: Widen the existing 'workflow.pending' daemon handler to answer both needs

Keep one IPC method; change the daemon's 'workflow.pending' handler itself to include every openable artifact (not just pending ones) in its response, and have handleInsrcPresent read the wider field while the IDE panel keeps reading the narrower one.

Widen WorkflowPendingResult to carry two fields (artifacts for the existing pending-only list, openable for the new unrestricted list), with handleWorkflowPending computing both via listPendingArtifacts and resolveOpenableArtifacts in the same call. handleInsrcPresent reads result.openable; the IDE panel keeps reading result.artifacts unchanged. No new IPC method, so none of the three completeness registries need a new entry.

**Rejected because:** Reintroduces, at the IPC-response level, the exact conflation this Story exists to remove from the in-process level; a1 keeps the two concerns on two separate, independently-evolvable IPC methods for the same mechanical cost, now correctly scoped to include every registry a new method actually requires.

### 7.3 a3: Direct filesystem access from the MCP server process, bypassing the daemon

Have server.ts call resolveOpenableArtifacts directly (or re-implement an equivalent fs scan) without going through any daemon IPC call at all, since .insrc/artifacts/*.json are plain files, not an LMDB/Lance database.

Import resolveOpenableArtifacts (or a copy of it) directly into src/mcp/server.ts and call it with the resolved repo path, with no socket round-trip and no daemon-side registration of any kind.

**Rejected because:** Breaks an architectural boundary every other repo-touching read in server.ts respects, for no cost saving over a1, and trades a loud IPC failure mode for a silent one if the two processes are ever not co-located.

## 8. References

- **[[c1]]** `code` `src/workflow/pending.ts:116-157` — "if (kind === 'BUILD' && meta['standalone'] !== true && !names.has(`CR${file.slice('BUILD'.length)}`)) continue;"
- **[[c2]]** `code` `src/mcp/server.ts:1105-1140` — "const pending = await pendingWorkflow({ repo }, deps); ... const openable = pending.artifacts; ... const presented = names.filter((n) => openable.filter((a) => namesPending(n, a)).length === 1);"
- **[[c3]]** `code` `src/mcp/daemon-stream.ts:313-320` — "export function pendingWorkflow(
	req: { repo: string },
	deps: UnaryRpcDeps = {},
): Promise<WorkflowPendingResult | WorkflowPendingError> {
	return unaryRpc<WorkflowPendingResult | WorkflowPendingEr"
- **[[c4]]** `code` `src/daemon/handler-runtime.ts:598-607` — "'workflow.pending': async (params) => {
	const { handleWorkflowPending } = await import('../workflow/pending.js');
	return handleWorkflowPending(params as { repo?: string } | undefined, process.env['I"
- **[[c5]]** `code` `src/mcp/__tests__/present-dispatch.test.ts:139-152` — "test('insrc_present: a daemon error or an unreachable daemon is answered as an error, never as presented', async () => { ... }"
- **[[c6]]** `code` `src/daemon/__tests__/repo-call-audit.test.ts:19-34` — "assert.deepEqual(Object.keys(RPC_AUDIT).sort(), registeredMethods(), 'the audit lists exactly the registered RPC methods');"
- **[[c7]]** `code` `src/daemon/threads/method-class.ts:1-40` — "A test fails when it differs from the handler tables buildHandlerRuntime constructs."
- **[[c8]]** `code` `src/daemon/__tests__/handler-runtime.test.ts:27-100` — "assert.deepEqual(Object.keys(runtime.rpcHandlers).sort(), [...RECORDED_RPC, ...ADDED_RPC].sort());"

## 9. Open questions

- cd1 (partial): handleWorkflowOpenable and openableWorkflow are two genuinely new functions, explicitly modeled as mirrors of the existing, grounded handleWorkflowPending and pendingWorkflow.
- ep3 (partial): c5 resolves to src/mcp/__tests__/present-dispatch.test.ts:139-152; c6 resolves to src/daemon/__tests__/repo-call-audit.test.ts:19-34, src/daemon/threads/method-class.ts's coverage test, and src/daemon/__tests__/handler-runtime.test.ts:27-100, all independently verified this session.

## Resolved questions

- `qbba5d9d9` — cd1 (partial): handleWorkflowOpenable and openableWorkflow are two genuinely new functions, explicitly modeled as mirrors of the existing, grounded handleWorkflowPending and pendingWorkflow.
  - **resolved**: Add explicit mirror functions — Matches the approved LLD's chosen alternative (a1): handleWorkflowOpenable and openableWorkflow are separate, explicit mirrors of handleWorkflowPending/pendingWorkflow, not a shared-helper refactor. The LLD explicitly rejected widening/sharing (alternative a2) to avoid reintroducing the conflation this Story removes. _(2026-11-27T12:17:57.820Z)_

## Citations

- **[[c1]]** `code` `src/workflow/pending.ts:116-157` — "if (kind === 'BUILD' && meta['standalone'] !== true && !names.has(`CR${file.slice('BUILD'.length)}`)) continue;"
- **[[c2]]** `code` `src/mcp/server.ts:1105-1140` — "const pending = await pendingWorkflow({ repo }, deps); ... const openable = pending.artifacts; ... const presented = names.filter((n) => openable.filter((a) => namesPending(n, a)).length === 1);"
- **[[c3]]** `code` `src/mcp/daemon-stream.ts:313-320` — "export function pendingWorkflow(
	req: { repo: string },
	deps: UnaryRpcDeps = {},
): Promise<WorkflowPendingResult | WorkflowPendingError> {
	return unaryRpc<WorkflowPendingResult | WorkflowPendingEr"
- **[[c4]]** `code` `src/daemon/handler-runtime.ts:598-607` — "'workflow.pending': async (params) => {
	const { handleWorkflowPending } = await import('../workflow/pending.js');
	return handleWorkflowPending(params as { repo?: string } | undefined, process.env['I"
- **[[c5]]** `code` `src/mcp/__tests__/present-dispatch.test.ts:139-152` — "test('insrc_present: a daemon error or an unreachable daemon is answered as an error, never as presented', async () => { ... }"
- **[[c6]]** `code` `src/daemon/__tests__/repo-call-audit.test.ts:19-34` — "assert.deepEqual(Object.keys(RPC_AUDIT).sort(), registeredMethods(), 'the audit lists exactly the registered RPC methods');"
- **[[c7]]** `code` `src/daemon/threads/method-class.ts:1-40` — "A test fails when it differs from the handler tables buildHandlerRuntime constructs."
- **[[c8]]** `code` `src/daemon/__tests__/handler-runtime.test.ts:27-100` — "assert.deepEqual(Object.keys(runtime.rpcHandlers).sort(), [...RECORDED_RPC, ...ADDED_RPC].sort());"
