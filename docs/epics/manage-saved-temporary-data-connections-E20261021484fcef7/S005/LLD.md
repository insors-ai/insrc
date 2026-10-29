<!-- insrc:artifact LLD-484fcef7efaf229e-s5 -->

# LLD: E20261029484fcef7:S005

## Summary

**Epic:** `manage-saved-temporary-data-connections`
**HLD base run:** `wf-1792569414548-dvzndd`
**HLD effective hash:** `dc1a3f91a768...`

Add a Settings-discoverable connection manager to the standalone VS Code extension and upgrade the IDE fork’s Data Sources editor to the same behavior. Users explicitly choose a registered repository and Saved or Temporary scope, filter by lifetime, edit safe driver-specific fields, test drafts, and Delete or Discard with truthful recovery states. Workbench-owned temporary connections survive closing the manager; incomplete backend release evidence continues to block production admission.

## Contents

1. [HLD context](#1-hld-context)
2. [Contract details](#2-contract-details)
3. [Data model changes](#3-data-model-changes)
4. [Diagrams](#4-diagrams)
5. [Interaction with shared contracts](#5-interaction-with-shared-contracts)
6. [Error paths](#6-error-paths)
7. [Test strategy](#7-test-strategy)
8. [Migration](#8-migration)
9. [Alternatives considered](#9-alternatives-considered)
10. [UX](#10-ux)
11. [References](#11-references)

## 1. HLD context

> See **HLD-484fcef7efaf229e** § 2. Framework summary

**Rollout phase:** D — manager integration
**Owns:** `sc7` (Manager state and scope filter)
**Consumes:** `sc1` (Connection management protocol and driver descriptors), `sc2` (Revision-checked mutation and recovery outcomes), `sc3` (Validated connection access context and driver leases), `sc4` (Transient draft test contract), `sc5` (Workbench session registration and ephemeral overlay), `sc6` (Safe removal and cleanup presentation)

**Adjacent scope (owned by other stories — do NOT implement here):**
- `s1`: Safe saved-config read/patch, canonical repo validation, driver profiles, registry metadata/receipts and crash recovery, immutable secret generation staging, compatibility adapters and lease accounting foundation. Does not own temporary storage or rich manager layout. Preserve saved-only scope-local lookup and legacy pinned-family values; signed operation tickets make expiry/replay decidable after receipt pruning. Own the shared memory-only conversion/probe driver foundation, converter-cache policy/identity changes and private DuckDB lifecycle (sc8), completed before the S002/S003 branches. — owns `sc1`, `sc2`, `sc3`, `sc8`
- `s2`: Transient process probe transport, deadline/cancellation and sanitization. Uses foundational context slots without depending on s3’s session implementation. — owns `sc4`
- `s3`: Session open/resume/heartbeat/end, memory-only temporary overlays and receipts, trusted execution-context propagation through analyzer/tool/MCP call paths, expiry and saved/temporary collision rules. Bind the S001-owned sc8 file execution policy to session identity and expiry; S001 owns conversion, cache-policy isolation and private DuckDB lifecycle. Every native/converted kind uses that foundation rather than a branch-local converter. — owns `sc5`
- `s4`: Removal coordination for both scopes, busy/revision enforcement, confirmation state, postcommit credential cleanup retry and operation-status recovery. Never invokes source data deletion. — owns `sc6`

## 2. Contract details

**Surface level:** internal-shared

### 2.1 `ConnectionManagerState`

```typescript
interface ConnectionManagerState { repoRoot?: string | undefined; filter: 'all'|'saved'|'temporary'; listState: 'loading'|'ready'|'empty-registry'|'empty-filter'|'read-error'|'offline'|'no-repository'|'upgrade-required'; draftRevision: number; dirty: boolean; mutationOperationId?: string | undefined; refreshError?: string | undefined; }
```

**Returns:** `ConnectionManagerState` — sc7 public projection; privileged credentials, capabilities and transport ownership never enter this projection.

**Errors:**
- `read-error` when List or descriptor reply fails strict validation; no fallback empty list.
- `upgrade-required` when Required version/features unavailable or release admission withheld.

**Preconditions:**
- Daemon-authoritative registered root selection; retain selected root in memory, never derive it from the active text editor.
- All external messages and v2 replies decoded as unknown at host boundary.

**Postconditions:**
- All/Saved/Temporary counts and rows use full key plus revision, from one successful authoritative snapshot.
- Dirty transitions require Discard/Cancel; mutation unknown state is reconciled before another mutation of that selected target.

### 2.2 `removalConfirmation`

```typescript
removalConfirmation(key: ConnectionKey, expectedRevision: string): RemovalConfirmation
```

**Parameters:**
- `key: ConnectionKey` — Exact selected repository/scope/ID
- `expectedRevision: string` — Captured selected generation

**Returns:** `RemovalConfirmation` — S004-owned pure copy; Delete versus Discard and source-preservation guarantee.

**Errors:**
- `ManagementInputError` when Malformed key/revision

**Preconditions:**
- Dirty form resolved before removal confirmation.
- No ticket issued until explicit confirm.

**Postconditions:**
- Cancel issues zero ticket/mutation/cleanup calls.
- Confirm uses exact captured target and revision; unknown uses the original ticket, never the current same-ID row.

## 3. Data model changes

### 3.1 `ConnectionManagerState` — new

Proposed pure core in src/shared/connection-manager/{model,controller,wire}.ts (new files, no daemon/storage/provider imports). Mirror only this reviewed pure module closure into IDE common/connectionManagement via deterministic sync manifest with source/destination hashes and divergence refusal; no separate package/runtime dependency. Both renderers consume the same reducer/events/effect descriptors; injected adapters execute effects. One workbench controller owns 0..many per-root manager views; each view has 0..1selected key, 0..1draft and monotonically increasing view generation. UI selection never grants backend authority. Keep selected repo/filter in workbench memory; reject stale list/read responses on root+view-generation+epoch mismatch. Do not persist temporary state in webview getState/setState, memento, Settings, logs or telemetry. Persistence of non-sensitive preferences is unnecessary for this scope. The extension manager owns proposed vscode-plugin/src/connections/{types,host,wiring,renderer}.ts modules. Existing vscode-plugin/src/panels/types.ts remains unchanged: it is a reference for injection patterns only, not a connection-state extension point.

**Call sites:**
- `vscode-plugin/src/extension.ts`
- `/Users/subhagho/work/projects/insors/insrc-ide/src/vs/workbench/contrib/insrc/browser/dbDrivers/dbDriversPane.ts`

### 3.2 `ConnectionListState` — new

Settings keyword group 'insrc connections' exposes a command link Manage Connections; it is discovery text, not a writable URL/options/scope setting. Standalone extension adds insrc.openDataSources and legacy add/edit/remove/test aliases only where absent, all to one manager route. Existing IDE command/editor IDs retained. No-repository shows register guidance; multiple registered workspace roots require explicit selection, none inferred. A retained selected root wins over active editor; if registration is removed, invalidate selection. Successful zero rows => empty-registry; nonempty total but zero filtered => empty-filter; failed read/offline/upgrade states distinct, retry only re-reads. Preserve last-good rows as visibly stale non-actionable context on error, never count as authoritative. All/Saved/Temporary counts computed before filter for selected root; search then filter matching count is explicit. Add reveals committed row by switching to matching scope or All and selecting exact new key/revision; does not fake a successful refresh.

**Call sites:**
- `vscode-plugin/package.json`
- `/Users/subhagho/work/projects/insors/insrc-ide/src/vs/workbench/contrib/insrc/common/insrcConfiguration.ts`

### 3.3 `SafeConnection` — invariant-change

Wire unchanged. Add separate v2 methods and result decoders to IDE service/types; preserve legacy list/save/test/remove signatures for unrelated callers, but v2 manager never calls swallowed-error list or legacy upsert/delete. Validate capabilities, descriptors, lists, safe read, signed-ticket target, mutation/status/test/removal replies as exact discriminated structures with size/depth bounds. Validate descriptors with supported schema subset; unknown required input/schema kind => driver unavailable/read-only with safe guidance, never infer endpoint format or accept arbitrary options. Every daemon descriptor offered with unsupported/read-only explanation if not editable. Fixed edit ID/kind/scope/family; pinned legacy family and unknown private fields stay server-side. Credential Keep default on existing slots, Replace masked blank new value, Clear explicit confirmation; do not round-trip presence booleans as secret values.

**Call sites:**
- `src/shared/connection-management.ts`
- `/Users/subhagho/work/projects/insors/insrc-ide/src/vs/workbench/contrib/insrc/common/dbConnectionsService.ts`
- `/Users/subhagho/work/projects/insors/insrc-ide/src/vs/workbench/contrib/insrc/browser/dbDrivers/insrcDbConnectionsServiceImpl.ts`

### 3.4 `DraftTestRequest` — invariant-change

Wire unchanged. Host holds effective UI draft only in memory and increments draftRevision on every field/credential edit. Test and Save share one draft serializer; Test is optional, never saves, emits requestId/revision/key/expectedRevision/publicPatch/credential intent. Only one in-flight probe per transport; cancellation on edit, root/scope/selection switch and close. Display result only when requestId,draftRevision,repoRoot,epoch plus locally captured full key/view-generation all match. Ignore late results and retain safe elapsed duration. Preserve the source controller till daemon drain completes even if panel closes; timeout/cancel response is not proof of cleanup. Raw SDK/transport exceptions replaced with fixed local messages.

**Call sites:**
- `src/shared/connection-management.ts`
- `vscode-plugin/src/extension.ts`
- `/Users/subhagho/work/projects/insors/insrc-ide/src/vs/workbench/contrib/insrc/browser/dbDrivers/dbConnectionCommands.ts`

### 3.5 `OperationTicket` — invariant-change

No wire/persistent-schema change. Each manager view has at most one active mutation and one memory-only immutable attempted request (including credential intent), paired with signed ticket. Freeze exact draft before ticket/mutate; disable duplicate submit. Lost delivery => unknown, retain draft and same operation, never reset to editable form and create a new ID. Status pending continues bounded/backoff polling with explicit retry; not-seen permits only identical same-ticket replay after explicit action; expired/unreceipted => reconciliation-required, no replay. Saved disconnect/reconnect may reconcile same ticket on an unclaimed Saved lane; temporary reconnect resumes only matching live owner/epoch and current root delegation. Committed response clears sensitive draft, reports saved/session-added independently from activation and refresh; retry activation by committed revision or list refresh only, never repeat mutation. Closing dirty draft uses Discard/Cancel; unknown mutation close may hide the view but workbench retains its reconciliation record and reopens it before new target mutation. No disk recovery store; after workbench loss Saved requires authoritative reload/status only when ticket still in memory, otherwise describe uncertain last operation without inventing outcome.

**Call sites:**
- `src/shared/connection-management.ts`
- `src/shared/connection-removal.ts`

### 3.6 `RemovalState` — invariant-change

Consume current independent credentialCleanup/resourceCleanup projection, not older HLD illustrative simplification. Exact selection confirmation shows repository+scope+ID and source-data guarantee. Busy/conflict keep row, selection and draft; conflict reload requires reconfirm fresh revision. Unknown never inferred removed from absent list row. Committed removed-cleanup-pending removes usable registration from authoritative rows but retains a separate operation status card with both cleanup phases; retry sends only {ticket}. Cannot close a recreated generation. Cancel uses zero ticket/mutation effects. S00420consumer snapshots reused for state copy; actual rendering/keyboard evidence still required in both clients.

**Call sites:**
- `src/shared/connection-removal.ts`
- `docs/epics/manage-saved-temporary-data-connections-E20261021484fcef7/S004/S005-HANDOFF.html`

### 3.7 `Workbench session client ownership` — new

One workbench lifetime owns one memory-only session and dedicated multiplexed control socket, initially opened with selected registered root. Heartbeat every30s while workbench live; end on actual disposal, not manager close/root switch. Extend existing thin src/shared/ipc-client.ts socket code with persistent request-ID multiplexing and sanitized disconnect outcome, preserving one-shot exports unchanged; no independent socket implementation in extension. Control lane carries only session open/resume/delegate/heartbeat/end plus permitted metadata; per-root workbench-ui delegated data sockets carry temporary management and scoped analysis/tool/probe calls. Saved actions use separate unclaimed sockets. Root switching delegates existing owner to new registered root, never creates a new owner or discards previous overlay. Same-root data channels may carry concurrent bound requests but no raw capabilities reach renderer. On disconnect stop dependent effects, resume old in-memory owner within90s and same epoch then re-delegate/attach current generation; expired/new epoch clears temporary UI/attempt records, cancels drafts/tests, displays lifetime loss, no silent recreation. Temporary copy shown before Add: survives panelclose/root switch; ends on workbench end,90s lease loss or daemonrestart. No guessed heartbeat extends a daemon deadline.

**Call sites:**
- `src/shared/ipc-client.ts`
- `vscode-plugin/src/extension.ts`
- `src/daemon/connection-session-rpc.ts`
- `/Users/subhagho/work/projects/insors/insrc-ide/src/vs/workbench/contrib/insrc/electron-sandbox/daemonServiceImpl.ts`

### 3.8 `Privileged IDE transport isolation` — new

Current IDE generic daemon service funnels renderer RPCs through a global main-process socket, so it cannot host workbench-bound sc5 claims. S005 client integration adds a window-scoped management channel in /Users/subhagho/work/projects/insors/insrc-ide/src/vs/code/electron-main/app.ts and /Users/subhagho/work/projects/insors/insrc-ide/src/vs/platform/insrc/electron-main/insrcDaemonMainService.ts, using trusted Electron IPC caller/window identity from server context, never JSON windowId or labels. Main owns 1control+0..many root-data sockets per trusted window and a separate Saved lane; exact allowlisted management/session/scoped execution methods, request IDs and result events routed only to owner. Browser/electron-sandbox daemonServiceImpl exposes typed intent API with no capability serialization to browser/editor state; lifecycle disposal tied to window lifecycle. Existing global generic channel remains unclaimed Saved/legacy traffic. Two renderer pending RPC maps cannot consume each other's reply IDs; collision tests mandatory. This is client transport adaptation of sc5, not new daemon authorization. If trusted caller identity cannot be established at build, block external integration and raise amendment/question; never use payload identity. External edits require tracked commits and authorized filesystem access before execution.

**Call sites:**
- `/Users/subhagho/work/projects/insors/insrc-ide/src/vs/workbench/contrib/insrc/browser/dbDrivers/insrcDbConnectionsServiceImpl.ts`
- `/Users/subhagho/work/projects/insors/insrc-ide/src/vs/workbench/contrib/insrc/common/dbConnectionsService.ts`

## 4. Diagrams

- [Sequence diagram](docs/epics/manage-saved-temporary-data-connections-E20261021484fcef7/S005/sequence-diagram.html)
- [Component dependencies](docs/epics/manage-saved-temporary-data-connections-E20261021484fcef7/S005/component-dependency.html)

## 5. Interaction with shared contracts

| Contract | Role | How |
| :--- | :--- | :--- |
| `sc7` | implements | Pure manager model, counts, mutually distinct list states, retained repo, explicit scope, dirty navigation, generation-bound tests and truthful effects; independent host rendering. |
| `sc1` | consumes | Strict capabilities/descriptors/safe reads and feature-by-feature fail-closed admission; no new wire contract. |
| `sc2` | consumes | Consume signed operation/status and activation semantics unchanged; immutable same-ticket retry, no persistence inference from transport delivery. |
| `sc3` | consumes | Client conveys only trusted scoped session lane; daemon owns leases, authority and global busy enforcement. |
| `sc4` | consumes | Draft-test serializer/cancel/result identity consumed unchanged; true drain is daemon owned. |
| `sc5` | consumes | Workbench memory-only control owner, per-root delegated UI/data sockets, explicit resume/end and90s lifetime; no panel/chat session lifetime. |
| `sc6` | consumes | Consume S004 confirmation/state/ticket-only cleanup and independent phases; never delete source or select cleanup by current ID. |
| `sc8` | consumes | Consume unsupported/resource-limit messages without local conversion/cache/spill fallback; file runtime remains daemon-owned. |

## 6. Error paths

**Error cases**

- **Unavailable or mixed capability/version/release evidence** (recoverable)
  - Detection: Capabilities decoder rejects shape/version/epoch or required feature set is missing; unknown-method replies are classified as upgrade-required.
  - Response: Show upgrade-required and disable affected add/edit/test/remove controls, with metadata readable only if that feature is advertised. No legacy mutation fallback and no synthetic positive gate evidence shipped.
  - User impact: Can see explicit compatibility guidance rather than unsafe forms.
- **List/driver/read failure or malicious descriptor** (recoverable)
  - Detection: Rejected transport call or strict bounded decoder/schema-subset validation fails before render/use.
  - Response: read-error/offline as appropriate; preserve last-good view marked stale, disable mutations; do not show zero counts, empty registry or invent fields. Fixed safe error text.
  - User impact: Draft stays in memory; Retry reads only.
- **Mutation reply lost or timed out after possible write** (recoverable)
  - Detection: Transport reports written-but-unanswered/disconnected, RPC timeout or malformed outcome on an attempted operation.
  - Response: Unknown state freezes exact request+ticket and blocks new mutation for target; status and identical same-ticket replay only under sc2 rules. Reconnect Saved separately; never send changed payload or fresh ticket.
  - User impact: No duplicate create/delete or false success; explicit reconciliation action.
- **Committed save but activation or authoritative refresh failed** (recoverable)
  - Detection: Validated committed outcome plus failed activation phase/list call.
  - Response: Show Saved/Added for this session separately from activation/refresh failures; retry failed effect only. Clear credential replacements after known commit. Do not reset truth to unsaved.
  - User impact: User sees committed data with actionable partial success.
- **Busy/stale removal or concurrent edit** (recoverable)
  - Detection: Validated busy/conflict rejection or exact expectedRevision differs after reload.
  - Response: Keep row/draft and safe explanation. Busy retry after work ends; stale must refresh/read and reconfirm revision. Independent cleanup pending keeps operation card and sends ticket-only retry.
  - User impact: No source-data deletion, row loss or old retry closing new handle.
- **Temporary lease loss/new daemon epoch** (recoverable)
  - Detection: session-expired response, failed same-epoch resume or capabilities epoch differs; local timer never claims authoritative renewal.
  - Response: Revoke lane/view generation; cancel tests, clear temporary inputs/attempt records and show expired registration guidance. Require new explicit session/add; preserve Saved operations for separate reconciliation.
  - User impact: Expired temporary rows unavailable; no silent persistence/recreation.
- **Cross-window/spoofed or stale privileged request** (terminal)
  - Detection: Main-process IPC context owner differs, unknown lane, wrong root/generation or forbidden method; IDs correlated within owner lane.
  - Response: Refuse before socket send/lookup, route fixed failure only to caller. No JSON window ID authorization, no global broadcast of sensitive results or capabilities.
  - User impact: Other workbenches retain isolation.
- **Late test/list reply after editing or navigation** (recoverable)
  - Detection: Captured request/root/key/revision/view-generation/epoch tuple fails current comparison.
  - Response: Ignore for visible state, cancel prior work and retain drain ownership. Do not paint success on another draft.
  - User impact: Current form remains accurate.
- **External checkout drift or missing trusted caller integration** (recoverable)
  - Detection: Pinned source/commit/sync manifest check fails or IPC ownership test cannot bind to trusted Electron identity.
  - Response: Stop only cross-repo integration task; report explicit dependency/amendment instead of guessing caller identity or stamping both-client acceptance.
  - User impact: Release remains gated; approved backend work unaffected.

**Edge cases**

| Input | Expected |
| :--- | :--- |
| No registered roots or multiple registered roots | No-repository with registration guidance, or explicit picker; retain selection while valid, no active-file inference. |
| Empty registry versus all rows excluded by scope/search | Different empty-registry and empty-filter copy; All/Saved/Temporary counts use authoritative selected-root snapshot. |
| Add Temporary while Saved filter selected | Scope default is Saved unless explicitly chosen; successful temporary add reveals new row by scope/All adjustment after actual refresh. Show lifecycle copy before adding. |
| Dirty navigation, root/filter/row/scope change, removal or panelclose | Discard/Cancel before leaving dirty form; Discard means throw away unsaved draft only, not temporary registration. Scope fixed when editing. Unknown operations retained at workbench level on hide; unresolved targets reopen reconciliation before another mutation. |
| Read-only legacy pinned family or unknown private fields | Safe read-only guidance and confirmation removal remain if advertised; no JSON editor to bypass descriptor constraints or silent family normalization. |
| Manager closed then reopened, root A→B→A, or second window | Same workbench owner retains overlays A andB; other window independent session/control/data sockets. No parent shared socket capability. No end on panelclose. |
| Temporary resource-limit/unsupported file type | Actionable safe refusal; do not perform client conversion or write cache/source/sidecars. Test failure does not persist draft. |
| Dark/light/high contrast and keyboard only | VSCode tokens, programmatic labels, focus-visible, logical navigation, focus restored to initiating row/toolbar after modal; status/error live region. Password inputs masked without accidental reveal from presence booleans. |

**Invariants to preserve**

- Daemon remains authority for configs, credentials, atomic operation receipts and revision leases; client core imports only pure shared modules. Grounded by s1 symbol/data-model bundles. [[c1]]
- Existing thin shared IPC one-shot public API remains compatible; persistent workbench lane extends the same boundary, not a new backend/storage path. Grounded by s1 source supplement. [[c2]]
- Existing IDE editor identity and action IDs preserved; v2 uses a separate typed service surface instead of changing legacy array projections. Grounded by s1 external source supplement. [[c3]]
- S004 source-preservation, exact ticket/revision retry and independent cleanup phases remain unchanged. Grounded by s1 removal usage and handoff. [[c4]]
- Production release gate stays disabled until genuine both-client and backend prerequisites are verified; no test fixture is product acceptance. [[c4]]

## 7. Test strategy

**Test framework:** `Extend existing node:test + node:assert/strict injectable extension cores and fake webview/command ports, as found by s1 source/test inspection; Node22+tsx for backend/shared and extension tests. IDE uses its existing workbench browser test runner and actual Electron IPC integration harness; discover exact invocation from that checkout before build. Include explicit extension test paths: backend src/** glob alone excludes vscode-plugin. No fabricated browser/native acceptance.`

**Test levels**

- **unit** — Portable sc7 reducer and projections with side-effect counters
  - Subjects: `CM-S5-STATE: all list states distinct, retained root, full-key identity, filter/search/counts, add reveal and stale-view rejection`, `CM-S5-DIRTY: every draft exit Discard/Cancel; editing fixed identity/scope; zero effects after Cancel; unknown mutation retains reconciliation on close`, `CM-S5-FORM: descriptor subset validation, every offered driver, safe endpoint/secret-slot serialization and Keep/Replace/Clear; pinned/read-only compatibility`, `CM-S5-TEST: same draft serializer for Save/Test, optional testing, exact stale-result tuple, repeated click suppression and cancel`
  - Fixtures: `Fake clock and deferred effects with controlled ordering`, `S00420consumer snapshots plus new full sc7 transcripts, malformed descriptor and credential canaries`
- **contract** — Exact decoded consumer contract and cross-repo parity
  - Subjects: `CM-S5-WIRE: capabilities, descriptors, safe lists/reads, tickets, outcomes/status, test/removal replies strict/size-bounded; old/missing/malformed fails closed`, `CM-S5-SYNC: deterministic shared module closure copy, hash parity and source/destination drift negative controls; no daemon/storage/provider in client bundles`, `CM-S5-COMPAT: old daemon/new client upgrade UI; no legacy mutation fallback, legacy unrelated projections retained, pinned family retained`
  - Fixtures: `Real shared wire contracts, safe malformed/accessor/prototype/oversized shapes`, `Pinned source/compiled manifests and standalone packaged extension loaded without backend node_modules`
- **integration** — Actual sockets/workbench and privileged host boundary
  - Subjects: `CM-S5-TRANSPORT: persistent request multiplexing, disconnect pre/postwrite, timeout/abort, request ID collisions, finite buffers, exactly-once disposal and no raw error leak`, `CM-S5-OWNER: one control owner per workbench;30sheartbeat,90sexpiry,sameepochresume,new epoch invalidation; rootA→B→A,close/reopen and no capability persistence`, `CM-S5-WINDOW: two real trusted IPC window identities, overlapping request IDs, forged JSON IDs, wrong-root/method/generation refusal, owner-only response delivery and disposal`, `CM-S5-OUTCOME: known commit vs activation/refresh failure; lostreply same-ticket recovery, expiry, no changedpayload/new operation retry; row/card independent cleanup phases`, `CM-S5-REMOVE: exact root/scope/ID confirmation, zero-effect Cancel, busy/conflict retention, unknown status, ticket-only retry and same-ID recreation safety`, `CM-S5-ENTRY: Settings query/command link, palette and existing editor/pane actions route same selected state in each client; no-repo/multiroot cases`
  - Fixtures: `Isolated real daemon IPC fixture with private feature evidence only; production gates unchanged`, `Extension host fake/adaptor plus actual IDE main/window lifecycle and scoped socket channels`, `Actual S004 receipt/state and S002 probe services, fault-controlled delivery`
- **live** — Both actual client renderers and supported service/file flows
  - Subjects: `CM-S5-UI: extension and IDE screenshots with native light/dark/highcontrast tokens, labelled controls, focus/live regions and keyboard-only add/edit/test/Delete/Discard flows`, `CM-S5-LIFETIME: before-add temporary copy in both clients, panelclose/root switch retention, workbench disposal/reconnect/expiry/restart loss; no inferred lifecycle success from backend snapshots`, `CM-S5-SOURCE: both clients supported SQL/KV/file Test/Save/discard/delete leave seeded source rows/bytes unchanged; SQL Server unavailable remains pending`, `CM-S5-PRIVACY: synthetic endpoint/secret/config/capability canaries absent from Settings,memento,webview state,logs,telemetry,artifacts and other-window events; temporary actions cause zero persistence`
  - Fixtures: `Running standalone extension host and separate IDE build, real UI automation and keyboard evidence`, `Disposable PostgreSQL/Redis and native/converted files; no production data`, `Collect only safe screenshots, never secret field content/capabilities`
- **smoke** — Final build and evidence after all planned implementation, with honest release gate
  - Subjects: `CM-S5-BUILD: fresh Node22 backend and extension typecheck/bundle plus IDE targeted typecheck/build, current mirrored contracts; packaged runtime smoke`, `CM-S5-SWEEP: per-task relevant tests, then final frozen full backend+extension+IDE relevant suites with exact logs/counts, no live gates forced and no historical failures relabeled`, `CM-S5-GATE: production remains fail-closed until current S001/provider/worker-affinity/SQLServer/both-client prerequisites are genuinely satisfied; test-positive evidence never enables shipped gates`
  - Fixtures: `Two-repo commit/test manifests, original raw failures/skips/TODO retained`, `Manual review per user direction for implementation; mandatory LLD review before approval, no automated post-build CR`

**Acceptance mapping**

| Criterion | Proving tests |
| :--- | :--- |
| `ac1` | `CM-S5-ENTRY`, `CM-S5-FORM`, `CM-S5-WIRE`, `CM-S5-SYNC`, `CM-S5-BUILD` |
| `ac2` | `CM-S5-STATE`, `CM-S5-DIRTY`, `CM-S5-TEST`, `CM-S5-OWNER`, `CM-S5-WINDOW`, `CM-S5-OUTCOME`, `CM-S5-REMOVE`, `CM-S5-LIFETIME` |
| `ac3` | `CM-S5-UI`, `CM-S5-COMPAT`, `CM-S5-PRIVACY`, `CM-S5-TRANSPORT`, `CM-S5-SOURCE`, `CM-S5-SWEEP`, `CM-S5-GATE` |

## 8. Migration

**State before:** S1 backend analyzer locates v2types/session/removal helpers; source supplement confirms extension has injectable panels/commands but no current connection manager. IDE still uses legacy Data Sources input/pane, generic globally shared main socket and service list errors→[]. S004 completion approved with explicit failed-sweep/manual-review exceptions; release gates remain disabled.

**State after:** Both VSCode clients have Settings/palette/editor routing into common sc7 state semantics, safe descriptor forms, explicit registered root and scope, full-key counts, memory-only workbench session transport, generation-safe Test, signed same-operation recovery and S004 removal presentation. Separate privileged per-window transport verified; backend schemas, credentials/registry ownership and release requirements unchanged.

**Zero downtime:** yes — **Data rewrite:** no

**Steps**

1. Freeze both checkout commits and current integration files; pin generated consumer module closure and verify uncommitted source drift. Track external edits under this S005 ledger and obtain filesystem access through normal escalation before writes. No external edits during design. — ↩ rollbackable
2. Add pure sc7 types/model/reply decoders and extend existing thin shared client with persistent multiplexed sockets, preserving one-shot exports. Test independently with real isolated socket server and bounded faults. — ↩ rollbackable
3. Add workbench-memory session owner and scope-aware client effects in extension; add trusted window-scoped privileged IDE lanes and mechanically synchronize reviewed pure core. Verify two-workbench/root isolation before enabling any temporary UI. — ↩ rollbackable _(needs: `Private current contract/lifecycle fixtures pass; no shipped positive evidence`)_
4. Wire extension Settings/commands/webview and migrate IDE pane/actions/service/types/native Settings to v2-only manager path. Keep old IDs/legacy unrelated signatures. Add theme/keyboard UI, descriptors, dirty/reconciliation states and exact Delete/Discard. — ↩ rollbackable
5. Execute focused tests per task, then both-client native interaction, service/file/privacy/lifecycle evidence and final frozen builds/sweeps after implementation. Review manually per user direction, retain original failed/skipped results. Submit consumer proof without clearing external backend prerequisites. — ↩ rollbackable
6. Release manager mutations/temporary visibility only when genuine current S001/provider/worker-affinity/SQLServer and both-client evidence is independently accepted. Otherwise ship explicit upgrade/unsupported gate; never activate using fixture hashes or accepted historical test exceptions. — ↩ rollbackable
7. User-confirmed Saved changes/deletes are intentional data mutations and cannot be undone by rolling back UI. UI rollback first disables new mutation admission, preserves reconciliation/cleanup/end controls for live owners, cancels probes and drains/end sessions on workbench disposal. Never downgrade backend to binaries that discard receipt metadata or secret refs. — ✕ non-rollbackable

**Backward compat:** Backend wire contracts unchanged; IDE mirrored v2 declarations are additive, legacy arrays/results stay separate. Existing editor and action IDs preserved. Extension new aliases route same manager. Older daemon => explicit upgrade-required, no legacy upsert/remove fallback for manager. No registry migration, directory lookup redirection, persisted temporary form/session state or implicit family normalization.

## 9. Alternatives considered

### 9.1 a1: Shared pure manager state with native host adapters — **CHOSEN**

One transport-free sc7 transition core, two host-specific renderers and lifecycle adapters.

Use a pure TypeScript state/projection core and strict v2 reply decoders shared by the extension and mechanically synchronized into the IDE fork with a pinned manifest. Extension reuses its injectable webview host conventions; IDE preserves DbDriversInput/pane and service/action identities. Each workbench owns a memory-only control connection independently of panel lifetime; scope-specific data and Saved lanes remain explicit. No new backend ownership or persistent client connection store.

### 9.2 a2: Independent client controllers with common protocol fixtures

Each client owns its sc7 controller and renderer, checked against common contract scenarios.

Implement the same public sc7 state model separately inside the extension and IDE workbench, preserving host conventions and existing commands. Both validate exact backend contracts and run the same scenario fixtures; each implements memory-only session control, dirty guards, same-ticket recovery and safe outcome presentation independently.

**Rejected because:** Also fulfills every acceptance/contract, but duplicates subtle operation reconciliation, dirty and session-state rules with no user benefit.

## 10. UX

- [UX mock](docs/epics/manage-saved-temporary-data-connections-E20261021484fcef7/S005/ux-mock.html)

## 11. References

- **[[c1]]** `analyze-bundle` `s1.analyzeBundles[0..2]` — "Backend symbols located; SafeConnection field/call graph incomplete, source supplemented."
- **[[c2]]** `code` `src/shared/ipc-client.ts` — "Existing shared thin one-shot socket client; persistent workbench support is proposed consumer extension."
- **[[c3]]** `code` `/Users/subhagho/work/projects/insors/insrc-ide/src/vs/workbench/contrib/insrc/browser/dbDrivers/insrcDbConnectionsServiceImpl.ts` — "Legacy list catches errors and returns empty array; new v2 lane must preserve failure."
- **[[c4]]** `prior-artifact` `docs/epics/manage-saved-temporary-data-connections-E20261021484fcef7/S004/S005-HANDOFF.html` — "Consume exact transport, confirmation and independent removal phases; shared release prerequisites remain pending."
- **[[c5]]** `doc` `docs/connection-management-prd.html` — "CM01–CM08 scope/filter/edit/test/safe removal and both-client interaction."
- **[[c6]]** `step-output` `s4` — "sc7 contract and client integration details; sc1–sc6/sc8 consumed unchanged."
- **[[c7]]** `step-output` `s5` — "Failure detection, valid edge cases and invariants."
- **[[c8]]** `step-output` `s6` — "Twenty proving subjects across ac1/ac2/ac3; planned evidence is not acceptance."
- **[[c9]]** `step-output` `s7` — "Phased migration with rollback boundaries; release gates unchanged."
- **[[c10]]** `step-output` `s2,s3,s8` — "Two viable alternatives; final score table explicitly includes ac1–ac3,sc1–sc8,k1–k5."
