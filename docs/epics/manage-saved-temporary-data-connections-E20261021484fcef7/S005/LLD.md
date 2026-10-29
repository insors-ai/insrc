<!-- insrc:artifact LLD-484fcef7efaf229e-s5 -->

# LLD: E20261029484fcef7:S005

## Summary

**Epic:** `manage-saved-temporary-data-connections`
**HLD base run:** `wf-1792569414548-dvzndd`
**HLD effective hash:** `dc1a3f91a768...`

Add a Settings-discoverable connection manager to the VS Code extension and JetBrains plugin. Both live clients offer explicit registered-repository and lifetime scope selection, safe driver forms, draft testing, truthful recovery and confirmed Delete/Discard. Temporary state belongs to a VS Code workbench or JetBrains project lifetime, independently of the manager panel. The deprecated insrc-ide fork is out of scope; the user-confirmed scope correction supersedes historical fork references in the retained HLD context. [[c11]]

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

### 3.1 `Current client delivery scope` — invariant-change

User explicitly corrected delivery scope: only vscode-plugin/ and jetbrains-plugin/. docs/epics/manage-saved-temporary-data-connections-E20261021484fcef7/CLIENT-SCOPE-UPDATE.html supersedes deprecated-fork prose in historical DEF/HLD and earlier S004 handoff. The unchanged hldContextSlice below is archival input, not authorization to build the fork. No external checkout edits, TypeScript source mirror or fork release gate. Backend sc1–sc6/sc8 wire and approved build outcomes unchanged. [[c11]]

**Call sites:**
- `vscode-plugin/src/extension.ts`
- `jetbrains-plugin/src/main/kotlin/ai/insors/insrc/jetbrains/settings/InsrcSettingsConfigurable.kt`

### 3.2 `ConnectionManagerState` — new

Implement the sc7 state contract in a pure TypeScript core at proposed src/shared/connection-manager/model.ts, src/shared/connection-manager/controller.ts and src/shared/connection-manager/wire.ts, with a native Kotlin counterpart under proposed jetbrains-plugin/src/main/kotlin/ai/insors/insrc/jetbrains/connections/. Do not copy or execute TypeScript inside JetBrains. Maintain one language-neutral JSON fixture corpus for wire shapes and event/effect transcripts, with a version and digest checked by Node and JUnit consumers. Both reducers must pass identical state/effect expectations. One workbench/project controller owns 0..many root views, each with0..1selected key/draft and a monotonic view generation. Credentials and operation attempts are memory-only; capabilities live only in privileged transport owners and never renderer state. No webview setState, memento, Settings, PersistentStateComponent, artifacts or telemetry for temporary configuration/attempts. Proposed dedicated vscode-plugin/src/connections/types.ts, host.ts, wiring.ts and renderer.ts modules integrate via extension.ts; unrelated panels/types.ts stays unchanged. [[c1]][[c12]]

**Call sites:**
- `vscode-plugin/src/extension.ts`
- `jetbrains-plugin/src/main/kotlin/ai/insors/insrc/jetbrains/settings/InsrcSettingsConfigurable.kt`

### 3.3 `ConnectionListState` — new

Both native Settings surfaces expose insrc connections / Manage Connections. VS Code adds insrc.openDataSources and add/edit/test/remove routing through one manager host; preserve any registered live extension command IDs and avoid duplicate registration. JetBrains adds a Connections child applicationConfigurable plus a Manage Connections AnAction in plugin.xml; action context supplies a trusted Project object. Since application Settings has no unique project, its link explicitly chooses one live open project before obtaining that project service; never infer a workbench from a string path. No open project => no-repository guidance and no temporary session; closing Settings does not dispose the project owner. Within the chosen project/workbench explicitly select a registered daemon root and retain it independently of active editor. Multiple roots require a picker; no default to arbitrary project root. Successful empty registry, empty filter, read-error, offline, no-repository and upgrade-required differ. Rows/counts use successful full-key snapshots, last-good rows visibly stale and non-actionable on failure. Scope counts precede search, matching count follows scope+search. Add reveals new committed row by adjusting filter after successful refresh. [[c5]][[c12]]

**Call sites:**
- `vscode-plugin/package.json`
- `jetbrains-plugin/src/main/kotlin/ai/insors/insrc/jetbrains/settings/InsrcSettingsConfigurable.kt`
- `jetbrains-plugin/src/main/resources/META-INF/plugin.xml`

### 3.4 `SafeConnection` — invariant-change

Wire shapes unchanged. TypeScript consumes shared backend wire types; Kotlin adds exact typed v2 DTOs/decoders in proposed connections/ConnectionProtocol.kt and a separate manager gateway. Preserve the application-scoped DaemonGatewayService and its unrelated legacy methods/stateless behavior; do not add current project/session/capability fields to it. Strictly validate all capability, descriptor, safe read/list, ticket, outcome/status, draft-test and removal replies before use. Unknown schemas/required fields are actionable unsupported/read-only, not guessed inputs or raw JSON editing. Driver choice is authoritative descriptors for every registered kind. Edit fixes ID/kind/scope/family; pinned family and unknown private fields stay daemon-owned. Keep existing secrets by default, Replace via blank masked input, Clear explicit; presence booleans never become values. No error-to-empty fallback. [[c1]][[c12]]

**Call sites:**
- `src/shared/connection-management.ts`
- `jetbrains-plugin/src/main/kotlin/ai/insors/insrc/jetbrains/daemon/DaemonGatewayService.kt`
- `jetbrains-plugin/src/main/kotlin/ai/insors/insrc/jetbrains/daemon/UnixSocketDaemonRpc.kt`

### 3.5 `DraftTestRequest` — invariant-change

Wire unchanged. Host holds effective UI draft only in memory and increments draftRevision on every field/credential edit. Test and Save share one draft serializer; Test is optional, never saves, emits requestId/revision/key/expectedRevision/publicPatch/credential intent. Only one in-flight probe per transport; cancellation on edit, root/scope/selection switch and close. Display result only when requestId,draftRevision,repoRoot,epoch plus locally captured full key/view-generation all match. Ignore late results and retain safe elapsed duration. Preserve the source controller till daemon drain completes even if panel closes; timeout/cancel response is not proof of cleanup. Raw SDK/transport exceptions replaced with fixed local messages.

**Call sites:**
- `src/shared/connection-management.ts`
- `vscode-plugin/src/extension.ts`
- `jetbrains-plugin/src/main/kotlin/ai/insors/insrc/jetbrains/settings/InsrcSettingsConfigurable.kt`

### 3.6 `OperationTicket` — invariant-change

No wire/persistent-schema change. Each manager view has at most one active mutation and one memory-only immutable attempted request (including credential intent), paired with signed ticket. Freeze exact draft before ticket/mutate; disable duplicate submit. Lost delivery => unknown, retain draft and same operation, never reset to editable form and create a new ID. Status pending continues bounded/backoff polling with explicit retry; not-seen permits only identical same-ticket replay after explicit action; expired/unreceipted => reconciliation-required, no replay. Saved disconnect/reconnect may reconcile same ticket on an unclaimed Saved lane; temporary reconnect resumes only matching live owner/epoch and current root delegation. Committed response clears sensitive draft, reports saved/session-added independently from activation and refresh; retry activation by committed revision or list refresh only, never repeat mutation. Closing dirty draft uses Discard/Cancel; unknown mutation close may hide the view but workbench retains its reconciliation record and reopens it before new target mutation. No disk recovery store; after workbench/project loss, if no ticket remains, authoritative reload reports current registration state only; it cannot identify or claim the historical outcome and must never auto-replay. No durable retry payload or last-operation secret is created.

**Call sites:**
- `src/shared/connection-management.ts`
- `src/shared/connection-removal.ts`

### 3.7 `RemovalState` — invariant-change

Consume current independent credentialCleanup/resourceCleanup projection, not older HLD illustrative simplification. Exact selection confirmation shows repository+scope+ID and source-data guarantee. Busy/conflict keep row, selection and draft; conflict reload requires reconfirm fresh revision. Unknown never inferred removed from absent list row. Committed removed-cleanup-pending removes usable registration from authoritative rows but retains a separate operation status card with both cleanup phases; retry sends only {ticket}. Cannot close a recreated generation. Cancel uses zero ticket/mutation effects. S00420consumer snapshots reused for state copy; actual rendering/keyboard evidence still required in both clients.

**Call sites:**
- `src/shared/connection-removal.ts`
- `docs/epics/manage-saved-temporary-data-connections-E20261021484fcef7/S004/S005-HANDOFF.html`

### 3.8 `Workbench session client ownership` — new

One VS Code extension-host workbench or JetBrains Project owns one memory-only session controller and dedicated persistent control socket, initially opened for an explicitly selected registered root. Heartbeat30s and same-epoch resume within the authoritative90s lease; end on real workbench/project service disposal, not Settings/manager/toolwindow close or root switch. Existing src/shared/ipc-client.ts owns the TypeScript socket implementation: extend its shared boundary with bounded multiplexing while preserving one-shot exports. Kotlin extends the existing UnixSocketDaemonRpc.kt transport boundary with a separate persistent lane object; old call() behavior remains unclaimed and stateless. New project @Service(PROJECT) ConnectionsSessionService (proposed connections/ConnectionsSessionService.kt) implements Disposable; no session state on APP DaemonGatewayService or PluginLifecycle singleton. Per-root workbench-ui delegated data lanes carry temporary management and session-bound analysis/tool/probe operations, separate from unclaimed Saved lanes. RootA→B→A delegates same owner, retains overlays. JSON IDs/project paths are selection hints only; ownership is the actual host Project/service or extension workbench instance. No control/data lane downgrade by dropping fields. On reconnect stop effects, resume exact owner+epoch, re-delegate/attach current generation; lease/epoch loss clears temporary inputs/attempts, invalidates view generations, cancels probes and never recreates implicitly. Before-add copy states panel/root switching survival and workbench/project end,lease loss,daemon restart expiry. [[c1]][[c12]]

**Call sites:**
- `src/shared/ipc-client.ts`
- `vscode-plugin/src/extension.ts`
- `jetbrains-plugin/src/main/kotlin/ai/insors/insrc/jetbrains/daemon/UnixSocketDaemonRpc.kt`
- `jetbrains-plugin/src/main/kotlin/ai/insors/insrc/jetbrains/daemon/DaemonGatewayService.kt`
- `jetbrains-plugin/src/main/kotlin/ai/insors/insrc/jetbrains/platform/InsrcProjectOpenActivity.kt`

### 3.9 `JetBrains native manager and project isolation` — new

Add proposed connections/ConnectionsManagerModel.kt, ConnectionsManagerGateway.kt, ConnectionsManagerPanel.kt, ConnectionsConfigurable.kt, ConnectionsSessionService.kt and actions/ManageConnectionsAction.kt. Settings child and action registration live in plugin.xml. Native Swing uses JBUI/JBColor/theme tokens, labelled JBTextField/JBPasswordField and focus/error status; no JBCef/JS bridge is needed. Existing settings/InsrcSettingsConfigurable.kt remains the global config editor; connection mutations are immediate explicit daemon operations in a dedicated manager surface, never Settings Apply/reset. Opening via application Settings explicitly chooses an open Project, then that project service and registered root; project action supplies its actual Project object. All sockets/heartbeat/descriptor reads/mutation/status/probes run on bounded background executor, never EDT; publish UI updates on EDT only if view generation and project disposal checks still hold. Project service disposal cancels admission, sends best-effort end, cancels outstanding requests, closes owned channels and joins bounded cleanup off EDT; daemon90s lease is crash fallback. Two open projects with same root/IDs have different control/data sockets and no shared capabilities/reply maps; duplicate request IDs on separate channels cannot cross. Closing one Settings/manager instance disposes only its view/subscriptions/probes, not project controller. InsrcProjectOpenActivity and existing project Disposer patterns are reuse references, not nonexistent close hooks on PluginLifecycle. Existing application-wide gateway stays unchanged and Saved/unclaimed. [[c12]]

**Call sites:**
- `jetbrains-plugin/src/main/kotlin/ai/insors/insrc/jetbrains/settings/InsrcSettingsConfigurable.kt`
- `jetbrains-plugin/src/main/kotlin/ai/insors/insrc/jetbrains/daemon/DaemonGatewayService.kt`
- `jetbrains-plugin/src/main/kotlin/ai/insors/insrc/jetbrains/daemon/UnixSocketDaemonRpc.kt`
- `jetbrains-plugin/src/main/resources/META-INF/plugin.xml`
- `jetbrains-plugin/src/main/kotlin/ai/insors/insrc/jetbrains/platform/InsrcProjectOpenActivity.kt`
- `jetbrains-plugin/src/main/kotlin/ai/insors/insrc/jetbrains/debug/LogEditorSurface.kt`

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
- **Cross-project or stale manager effect** (terminal)
  - Detection: Actual project service/workbench owner, root lane and view/epoch tuple differ, or owner disposed.
  - Response: Refuse before socket send and publish no reply to another owner. Never route from caller-supplied project/window IDs; actual host object selects service.
  - User impact: Other projects/workbenches retain isolation.
- **Late test/list reply after editing or navigation** (recoverable)
  - Detection: Captured request/root/key/revision/view-generation/epoch tuple fails current comparison.
  - Response: Ignore for visible state, cancel prior work and retain drain ownership. Do not paint success on another draft.
  - User impact: Current form remains accurate.
- **Cross-language contract/fixture drift** (recoverable)
  - Detection: Node/JUnit fixture version/digest or expected state/effect transcript differs; Kotlin wire DTOs reject current shapes.
  - Response: Fail integration/parity checks and keep release gated; fix consumer before acceptance, without copying TypeScript or introducing deprecated-fork work.
  - User impact: Explicit incomplete client acceptance; backend ownership unchanged.

**Edge cases**

| Input | Expected |
| :--- | :--- |
| No registered roots or multiple registered roots | No-repository with registration guidance, or explicit picker; retain selection while valid, no active-file inference. |
| Empty registry versus all rows excluded by scope/search | Different empty-registry and empty-filter copy; All/Saved/Temporary counts use authoritative selected-root snapshot. |
| Add Temporary while Saved filter selected | Scope default is Saved unless explicitly chosen; successful temporary add reveals new row by scope/All adjustment after actual refresh. Show lifecycle copy before adding. |
| Dirty navigation, root/filter/row/scope change, removal or panelclose | Discard/Cancel before leaving dirty form; Discard means throw away unsaved draft only, not temporary registration. Scope fixed when editing. Unknown operations retained at workbench level on hide; unresolved targets reopen reconciliation before another mutation. |
| Read-only legacy pinned family or unknown private fields | Safe read-only guidance and confirmation removal remain if advertised; no JSON editor to bypass descriptor constraints or silent family normalization. |
| Manager closed then reopened, root A→B→A, or second window | Same VSCode workbench/JetBrains Project owner retains overlays across root switches and manager close/reopen; other projects/workbenches have separate session channels. No end on view close. |
| Temporary resource-limit/unsupported file type | Actionable safe refusal; do not perform client conversion or write cache/source/sidecars. Test failure does not persist draft. |
| Dark/light/high contrast and keyboard only | VSCode tokens, programmatic labels, focus-visible, logical navigation, focus restored to initiating row/toolbar after modal; status/error live region. Password inputs masked without accidental reveal from presence booleans. |

**Invariants to preserve**

- Daemon remains authority for configs, credentials, atomic operation receipts and revision leases; client core imports only pure shared modules. Grounded by s1 symbol/data-model bundles. [[c1]]
- Existing thin shared IPC one-shot public API remains compatible; persistent workbench lane extends the same boundary, not a new backend/storage path. Grounded by s1 source supplement. [[c2]]
- Existing JetBrains application-wide DaemonGatewayService remains stateless for explicit-root legacy callers; new session state is project-scoped. Analyzer located APP annotation and source confirms delegation to one-shot transport. [[c12]]
- S004 source-preservation, exact ticket/revision retry and independent cleanup phases remain unchanged. Grounded by s1 removal usage and handoff. [[c4]]
- Production release gate stays disabled until genuine both-client and backend prerequisites are verified; no test fixture is product acceptance. [[c4]]

## 7. Test strategy

**Test framework:** `Existing node:test + node:assert/strict with Node22+tsx for shared/backend/extension; JetBrains JUnit5 + IntelliJ Platform test framework from jetbrains-plugin/build.gradle.kts, JDK21 and committed ./gradlew. Extend actual Settings/DaemonGateway/UnixSocketDaemonRpc tests. Include explicit vscode-plugin test paths; backend glob alone omits extension/Kotlin tests. Native UI acceptance must run in both live clients. [[c12]]`

**Test levels**

- **unit** — Portable sc7 reducer and projections with side-effect counters
  - Subjects: `CM-S5-STATE: all list states distinct, retained root, full-key identity, filter/search/counts, add reveal and stale-view rejection`, `CM-S5-DIRTY: every draft exit Discard/Cancel; editing fixed identity/scope; zero effects after Cancel; unknown mutation retains reconciliation on close`, `CM-S5-FORM: descriptor subset validation, every offered driver, safe endpoint/secret-slot serialization and Keep/Replace/Clear; pinned/read-only compatibility`, `CM-S5-TEST: same draft serializer for Save/Test, optional testing, exact stale-result tuple, repeated click suppression and cancel`
  - Fixtures: `Fake clock and deferred effects with controlled ordering`, `S00420consumer snapshots plus new full sc7 transcripts, malformed descriptor and credential canaries`
- **contract** — Exact decoded consumer contract and cross-repo parity
  - Subjects: `CM-S5-WIRE: capabilities, descriptors, safe lists/reads, tickets, outcomes/status, test/removal replies strict/size-bounded; old/missing/malformed fails closed`, `CM-S5-SYNC: one versioned/digested JSON wire+state/effect transcript corpus executed by TypeScript and Kotlin, divergent-field/transition negative controls; both bundles exclude daemon/storage/provider code.`, `CM-S5-COMPAT: old daemon/new client upgrade UI; no legacy mutation fallback, legacy unrelated projections retained, pinned family retained`
  - Fixtures: `Real shared wire contracts, safe malformed/accessor/prototype/oversized shapes`, `Pinned source/compiled manifests and standalone packaged extension loaded without backend node_modules`
- **integration** — Actual sockets/workbench and privileged host boundary
  - Subjects: `CM-S5-TRANSPORT: persistent request multiplexing, disconnect pre/postwrite, timeout/abort, request ID collisions, finite buffers, exactly-once disposal and no raw error leak`, `CM-S5-OWNER: one owner per extension workbench or JetBrains Project;30sheartbeat,90sexpiry,sameepochresume/new epoch,root switches/close-reopen; no session end on Configurable disposal, no persistent capabilities.`, `CM-S5-WINDOW: two actual project-scoped services/workbench hosts, same roots/IDs and overlapping RPC IDs, forged owner hints and disposed/stale-view refusal; owner-only delivery and independent project disposal.`, `CM-S5-OUTCOME: known commit vs activation/refresh failure; lostreply same-ticket recovery, expiry, no changedpayload/new operation retry; row/card independent cleanup phases`, `CM-S5-REMOVE: exact root/scope/ID confirmation, zero-effect Cancel, busy/conflict retention, unknown status, ticket-only retry and same-ID recreation safety`, `CM-S5-ENTRY: VSCode Settings/command and JetBrains native Settings/AnAction route each project/workbench to the same guarded manager; explicit project chooser for application Settings, no-project/multiroot/retained-root cases.`
  - Fixtures: `Isolated real daemon IPC fixture with private feature evidence only; production gates unchanged`, `Extension host fake/adaptor plus actual JetBrains project service lifecycle and scoped socket channels`, `Actual S004 receipt/state and S002 probe services, fault-controlled delivery`
- **live** — Both actual client renderers and supported service/file flows
  - Subjects: `CM-S5-UI: actual VSCode extension and JetBrains native manager in light/dark/highcontrast, labels, focus/live status and keyboard-only add/edit/test/Delete/Discard flows.`, `CM-S5-LIFETIME: before-add temporary copy in both clients, panelclose/root switch retention, workbench disposal/reconnect/expiry/restart loss; no inferred lifecycle success from backend snapshots`, `CM-S5-SOURCE: both clients supported SQL/KV/file Test/Save/discard/delete leave seeded source rows/bytes unchanged; SQL Server unavailable remains pending`, `CM-S5-PRIVACY: synthetic endpoint/secret/config/capability canaries absent from Settings,memento,webview state,logs,telemetry,artifacts and other-window events; temporary actions cause zero persistence`
  - Fixtures: `Running standalone extension host and JetBrains sandbox IDE, real UI automation and keyboard evidence`, `Disposable PostgreSQL/Redis and native/converted files; no production data`, `Collect only safe screenshots, never secret field content/capabilities`
- **smoke** — Final build and evidence after all planned implementation, with honest release gate
  - Subjects: `CM-S5-BUILD: fresh Node22 backend and extension typecheck/bundle; JDK21 ./gradlew test build and applicable verifyPlugin checks; packaged runtime smoke for both live clients.`, `CM-S5-SWEEP: per-task relevant Node/JUnit tests, then final frozen backend+explicit extension+JetBrains suites with exact logs/counts; no forced live gates or historical failure relabeling.`, `CM-S5-GATE: production remains fail-closed until current S001/provider/worker-affinity/SQLServer/both-client prerequisites are genuinely satisfied; test-positive evidence never enables shipped gates`
  - Fixtures: `One repository commit plus Node/JUnit/IDE test manifests, original raw failures/skips/TODO retained`, `Manual review per user direction for implementation; mandatory LLD review before approval, no automated post-build CR`

**Acceptance mapping**

| Criterion | Proving tests |
| :--- | :--- |
| `ac1` | `CM-S5-ENTRY`, `CM-S5-FORM`, `CM-S5-WIRE`, `CM-S5-SYNC`, `CM-S5-BUILD` |
| `ac2` | `CM-S5-STATE`, `CM-S5-DIRTY`, `CM-S5-TEST`, `CM-S5-OWNER`, `CM-S5-WINDOW`, `CM-S5-OUTCOME`, `CM-S5-REMOVE`, `CM-S5-LIFETIME` |
| `ac3` | `CM-S5-UI`, `CM-S5-COMPAT`, `CM-S5-PRIVACY`, `CM-S5-TRANSPORT`, `CM-S5-SOURCE`, `CM-S5-SWEEP`, `CM-S5-GATE` |

## 8. Migration

**State before:** Analyzer and source confirm no connection manager in current VSCode extension; JetBrains has native application Settings, APP-scoped stateless DaemonGatewayService and one-shot UnixSocketDaemonRpc. S004 backend contracts are built but release prerequisites remain pending. User explicitly deprecated insrc-ide and selected VSCode+JetBrains. [[c11]][[c12]]

**State after:** Both live plugins implement native sc7 manager behavior using TypeScript/Kotlin controllers and shared JSON scenarios. Session owners are extension workbench and JetBrains Project, independent of views. Backend schemas/ownership and historical failures unchanged; deprecated fork is excluded.

**Zero downtime:** yes — **Data rewrite:** no

**Steps**

1. Record user scope correction and source manifests for vscode-plugin/ and jetbrains-plugin/ in this repository. Preserve approved upstream JSON bodies as history; scope correction supersedes fork requirements. — ↩ rollbackable
2. Add canonical wire/state/effect JSON fixtures and native TypeScript/Kotlin models/decoders; extend existing TypeScript and Kotlin transport boundaries with persistent multiplexing while preserving one-shot APIs. — ↩ rollbackable
3. Add extension workbench owner and JetBrains project-level Disposable session service with explicit root-data and Saved lanes; prove two-owner isolation and view-independent lifecycle before temporary UI. — ↩ rollbackable _(needs: `Private current contract/lifecycle fixtures pass; no shipped positive evidence`)_
4. Wire VSCode Settings/commands/dedicated webview and JetBrains ConnectionsConfigurable/ManageConnectionsAction/native panel via plugin.xml, keeping global config Apply/reset separate from immediate connection operations. — ↩ rollbackable
5. Run focused tests per implementation task, actual both-client native UI/service/file/privacy/lifecycle evidence, then frozen Node/backend+extension and Gradle suites. Manual post-build review per user instruction; retain original failures/skips. — ↩ rollbackable
6. Keep mutation/temporary production admission gated until real current S001/provider/worker-affinity/SQLServer and live VSCode+JetBrains acceptance is approved. No deprecated-fork dependency, no fixture-only activation. — ↩ rollbackable
7. User Saved changes/deletes cannot be undone by UI rollback. Disable new admission first, keep reconciliation/cleanup available while live; end owners on actual workbench/project disposal, never downgrade backend receipt/secret compatibility. — ✕ non-rollbackable

**Backward compat:** Backend wire unchanged; existing shared IpcClient and Kotlin one-shot DaemonGateway legacy methods remain compatible and unclaimed. New manager uses strict v2 only, old daemon gives upgrade-required with no unsafe fallback. Application-wide Kotlin gateway gains no mutable session state; no new disk recovery store or registry migration. Deprecated insrc-ide carries no compatibility obligation. [[c11]][[c12]]

## 9. Alternatives considered

### 9.1 a1: Native TypeScript and Kotlin controllers with one scenario contract — **CHOSEN**

One language-neutral sc7 contract and transcript corpus; native host controllers and renderers.

Implement the sc7 TypeScript controller in the extension and a Kotlin controller in JetBrains. Validate exact protocol/state/effect parity using one checked-in JSON scenario corpus, including all race,unknown-outcome and lifecycle cases. Reuse injectable extension cores and existing native JetBrains Swing/JUnit patterns. Project/workbench-owned persistent session lanes are independent of views; no shared JS runtime or deprecated fork.

### 9.2 a2: Common web manager rendered in extension and JetBrains JBCef

Reuse TypeScript state and HTML UI through two native wrappers.

Reuse the TypeScript controller and HTML manager inside extension webview and a JetBrains JBCef surface, with a strictly validated native bridge to project-scoped session lanes. Current JBCef artifact preview demonstrates availability, but a new sensitive-management bridge and equivalent accessibility would need full acceptance.

**Rejected because:** Native Swing is already used for live Settings; sharing behavior fixtures meets parity without adding a sensitive browser bridge.

## 10. UX

- [UX mock](docs/epics/manage-saved-temporary-data-connections-E20261021484fcef7/S005/ux-mock.html)

## 11. References

- **[[c1]]** `analyze-bundle` `s1.analyzeBundles[0..2]` — "Backend symbols located; SafeConnection field/call graph incomplete, source supplemented."
- **[[c2]]** `code` `src/shared/ipc-client.ts` — "Existing shared thin one-shot socket client; persistent workbench support is proposed consumer extension."
- **[[c4]]** `prior-artifact` `docs/epics/manage-saved-temporary-data-connections-E20261021484fcef7/S004/S005-HANDOFF.html` — "Consume exact transport, confirmation and independent removal phases; shared release prerequisites remain pending."
- **[[c5]]** `doc` `docs/connection-management-prd.html` — "CM01–CM08 scope/filter/edit/test/safe removal and both-client interaction."
- **[[c6]]** `step-output` `s4` — "sc7 contract and client integration details; sc1–sc6/sc8 consumed unchanged."
- **[[c7]]** `step-output` `s5` — "Failure detection, valid edge cases and invariants."
- **[[c8]]** `step-output` `s6` — "Twenty proving subjects across ac1/ac2/ac3; planned evidence is not acceptance."
- **[[c9]]** `step-output` `s7` — "Phased migration with rollback boundaries; release gates unchanged."
- **[[c10]]** `step-output` `s2,s3,s8` — "Two viable alternatives; final score table explicitly includes ac1–ac3,sc1–sc8,k1–k5."
- **[[c11]]** `stakeholder` `docs/epics/manage-saved-temporary-data-connections-E20261021484fcef7/CLIENT-SCOPE-UPDATE.json` — "insrc-ide is deprecated, only VS Code + JetBrains"
- **[[c12]]** `analyze-bundle` `S005/evidence/design/jetbrains-discovery.json` — "Analyzer located Kotlin APP gateway, one-shot socket transport, native Settings and plugin.xml registrations; source and existing JUnit tests supplemented."

<!-- insrc:review -->

## Review

### ✅ Review `PASS` — design.story (design.story)

**0 do not hold · 0 could not be verified · 16 hold** · template `design-spec` · model `cli-claude:claude-sonnet-5` · reviewed 2026-10-29T14:06:32.143Z

Only a premise that does not hold blocks approval. One that could not be verified is listed for the reader and does not block.

#### Does not hold (blocks approval)

_None._

#### Could not verify (does not block)

_None._
