<!-- insrc:artifact LLD-484fcef7efaf229e-s4 -->

# LLD: E20261029484fcef7:S004

## Summary

**Epic:** `manage-saved-temporary-data-connections`
**HLD base run:** `wf-1792569414548-dvzndd`
**HLD effective hash:** `dc1a3f91a768...`

S004 adds revision-checked Delete for saved registrations and Discard for temporary registrations. Removal never deletes the source file, database, table or remote data, and busy or stale requests preserve the row. A committed removal stays removed when resource or credential cleanup fails; the manager receives a separate cleanup-pending state and reconciles uncertain replies with the same operation. Client layout belongs to S005, and release remains gated on the existing prerequisites and complete consumer/lease-owner integration evidence. [[c3]] [[c4]] [[c10]]

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
10. [References](#10-references)

## 1. HLD context

> See **HLD-484fcef7efaf229e** § 2. Framework summary

**Rollout phase:** C — safe removal
**Owns:** `sc6` (Safe removal and cleanup presentation)
**Consumes:** `sc1` (Connection management protocol and driver descriptors), `sc2` (Revision-checked mutation and recovery outcomes), `sc3` (Validated connection access context and driver leases), `sc5` (Workbench session registration and ephemeral overlay)

**Adjacent scope (owned by other stories — do NOT implement here):**
- `s1`: Safe saved-config read/patch, canonical repo validation, driver profiles, registry metadata/receipts and crash recovery, immutable secret generation staging, compatibility adapters and lease accounting foundation. Does not own temporary storage or rich manager layout. Preserve saved-only scope-local lookup and legacy pinned-family values; signed operation tickets make expiry/replay decidable after receipt pruning. Own the shared memory-only conversion/probe driver foundation, converter-cache policy/identity changes and private DuckDB lifecycle (sc8), completed before the S002/S003 branches. — owns `sc1`, `sc2`, `sc3`, `sc8`
- `s2`: Transient process probe transport, deadline/cancellation and sanitization. Uses foundational context slots without depending on s3’s session implementation. — owns `sc4`
- `s3`: Session open/resume/heartbeat/end, memory-only temporary overlays and receipts, trusted execution-context propagation through analyzer/tool/MCP call paths, expiry and saved/temporary collision rules. Bind the S001-owned sc8 file execution policy to session identity and expiry; S001 owns conversion, cache-policy isolation and private DuckDB lifecycle. Every native/converted kind uses that foundation rather than a branch-local converter. — owns `sc5`
- `s5`: Settings contributions and shared command routing, themed editor/forms, filters, dirty guards, stale-test suppression and truthful feedback in extension and external IDE. HLD has inspected the external pane, actions, service, mirrored types and Settings registrations; S005 implements the recorded plan and validates its mirrored contract before integration acceptance. — owns `sc7`

## 2. Contract details

**Surface level:** internal-shared

### 2.1 `RemoveConnectionRequest`

```typescript
interface RemoveConnectionRequest { readonly ticket: OperationTicket; readonly operationId: string; readonly key: ConnectionKey; readonly expectedRevision: string }
```

**Parameters:**
- `request: RemoveConnectionRequest` — Exact confirmed key/revision and the single signed remove operation identity.

**Returns:** `Promise<MutationOutcome>` — Use existing db.connections.v2.mutate with explicit mode:'remove'; committed registration:'removed' and activation:'not-applicable' mean removal, not merely a failed lookup. [[c4]]

**Errors:**
- `invalid-input | operation-mismatch` when Wrong scope/root/id/mode/operation, malformed or excess input, or publicPatch/credentials on remove.
- `busy | conflict | not-found` when Live use, revision mismatch or missing row before a new commit; replay checks the receipt first.
- `registry-unreadable | recovery-required | reconciliation-required | session-expired | upgrade-required` when Existing storage, ticket, owner and compatibility failures; no legacy or saved-only fallback.

**Preconditions:**
- Reuse existing shared OperationTicket remove mode, CommittedOutcome removed registration, LeaseState remove barrier, parseMutationRequest remove decoding and SavedTicketAuthority.issue support unchanged. S004 removes the explicit rejection branches in the saved and temporary RPC/services, widens SessionOperationLedger's create/update-only admission to remove, and implements the planned commit and cleanup branches; no new shared remove-ticket or wire mode is introduced. [[c1]] [[c2]] [[c4]]
- Confirmation is pure and precedes ticket issue/mutation. It identifies selected repository, ID and Saved/Temporary scope; copy says registration/owned credentials only, source data is preserved. Cancel invokes no mutation, credential or cleanup port. S005 renders this contract; S004 does not implement either client. [[c1]] [[c2]] [[c4]]
- Saved management uses the explicit existing saved channel with registered canonical root. A presented session binding must never be stripped to choose that channel. Temporary management requires current workbench-ui owner/root/generation; unverified MCP cannot remove or inspect private state. [[c1]] [[c2]] [[c4]]
- Feature advertisement is additive sc6 capability only after verified readiness. Old/missing capability refuses upgrade-required before issuing a removal ticket; do not interpret an unknown method as permission for legacy deletion. [[c1]] [[c2]] [[c4]]
- All removal/status/cleanup adapters execute on main daemon and use the existing root gate. Leases for all admitted analysis, constructor, iterator and existing-row edit-probe lifetimes must reach the same owner. Thread-local Saved pools are a known integration risk: all-consumer affinity is a release prerequisite, not established by unit tests or this design. [[c1]] [[c2]] [[c4]]

**Postconditions:**
- Same operation plus identical full canonical payload replays its original outcome; changed payload returns operation-mismatch. Reconcile the same ticket after transport loss before issuing another remove. Receipt lookup/MAC comparison precedes row absence/revision checks, including after same-ID recreation. [[c4]]
- Under the root gate: validate live owner/eligibility/ticket, acquire the existing revision remove barrier, refuse active leases, and publish removal atomically with a fresh operation revision and receipt. A stale or busy request changes no registration, credentials, source data or receipt. [[c4]]
- Logical removal and resolver invalidation occur before releasing the root gate and before awaiting cleanup. Every subsequent list/lease/acquire rejects the removed revision; do not wait for SDK close while leaving an entry resolvable. [[c4]]
- Saved commit atomically removes the row and its revision from the existing JSON envelope and adds the existing-shaped removed receipt. Temporary commit synchronously removes its memory generation, decrements the shared session entry/byte budget and publishes its private removed receipt without a fabricated SafeConnection. [[c4]]
- No removal path unlinks/truncates a configured source, submits DROP/DELETE, scans/deletes remote data or removes a user directory. Only existing owned metadata, obsolete application-owned credential references and exact owned runtime/conversion handles are cleanup targets. [[c4]]
- Committed truth survives response loss or postcommit failure. Saved crash ambiguity is resolved through the existing preparation/receipt machinery; temporary authority and receipts disappear on session expiry/restart and cannot be reconstructed. [[c4]]

### 2.2 `RemovalState`

```typescript
interface RemovalState { readonly key: ConnectionKey; readonly operationId: string; readonly state: 'confirming'|'removing'|'busy'|'conflict'|'unknown'|'removed-cleanup-pending'|'removed'; readonly safeMessage?: string | undefined; readonly credentialCleanup?: 'complete'|'pending' | undefined; readonly resourceCleanup?: 'complete'|'pending' | undefined }
```

**Parameters:**
- `ticket: OperationTicket` — Strict signed remove ticket on status or cleanup retry, never a caller-supplied cleanup handle.

**Returns:** `Promise<RemovalState>` — sc6 proposed db.connections.v2.removalState({ticket}) projects committed removal and both independent cleanup phases; db.connections.v2.retryRemovalCleanup({ticket}) retries only the original operation's cleanup and returns the same projection. [[c4]]

**Errors:**
- `operation-mismatch | invalid-input | reconciliation-required` when Non-remove/invalid/expired-unreceipted ticket; no row-not-found shortcut to success.
- `session-expired | upgrade-required | recovery-required` when Lost authority, missing feature or unavailable cleanup truth, always a fixed safe message.

**Preconditions:**
- These two sc6 endpoints are proposed, bounded exact-field decoders, registered in the handler table, main-daemon method set and session allowlist together. Reuse existing canonical JSON/ticket bounds and authorize before receipt or cleanup lookup. [[c1]] [[c2]] [[c4]]
- Saved status/cleanup use the canonical managed owner; temporary status/cleanup use only the exact authenticated session overlay and ledger. Input contains ticket only; no source path, credential ref, session handle, revision selector or arbitrary resource descriptor. [[c1]] [[c2]] [[c4]]
- Confirming/removing/busy/conflict are pure client-facing state transitions. Server status returns unknown until a verified receipt exists; not-seen or an absent row is never treated as removed. Unknown/reconciliation-required retains same operation and retry guidance. [[c1]] [[c2]] [[c4]]
- Do not overload sc2 credentialCleanup with runtime failures or extend the exact persisted CommittedOutcome key set. resourceCleanup is an sc6 projection of daemon-owned retirement state. [[c1]] [[c2]] [[c4]]

**Postconditions:**
- Removed requires both credentialCleanup and resourceCleanup complete; any pending phase maps to removed-cleanup-pending. Neither state restores a removed row or permits re-running the registration mutation. [[c4]]
- Saved retries invoke existing credential journal recovery and strict runtime retirement for that receipt/revision only. Temporary retries touch memory-owned handles only; never call keychain or registry ports. [[c4]]
- After a daemon restart, no SDK handle from the old process exists: runtime cleanup is complete, while saved credential cleanup is independently recovered and can remain pending. Temporary requests fail session-expired even if their ticket clock has not expired. [[c4]]
- Same-ID recreation cannot redirect cleanup to the new generation; all cleanup is revision/operation/owner bound and retries are idempotent. A caller-visible timeout does not release resource ownership or imply cleanup completed. [[c4]]

### 2.3 `SavedConnectionManagement`

```typescript
interface SavedConnectionManagement { mutate(context: ManagementRequestContext, value: unknown): Promise<MutationOutcome>; status(context: ManagementRequestContext, value: unknown): Promise<OperationStatus>; removalState(context: ManagementRequestContext, ticket: OperationTicket): Promise<RemovalState>; retryRemovalCleanup(context: ManagementRequestContext, ticket: OperationTicket): Promise<RemovalState> }
```

**Parameters:**
- `context: ManagementRequestContext` — Existing trusted saved root/transport context.
- `value: unknown` — Existing strict v2 mutation/status input.

**Returns:** `Promise<MutationOutcome | OperationStatus>` — Add removal branches to the existing saved owner; retain create/update behavior and the sc2 receipt shape. [[c4]]

**Errors:**
- `busy | conflict | not-found | recovery-required` when Existing revision/lease/storage gates and uncertain commit behavior.

**Preconditions:**
- Consume the current root owner, SavedTicketAuthority, ManagedRegistry and CredentialGenerations/PreparationJournal; do not add a second transaction store, signer, lease counter or metadata schema. [[c1]] [[c2]] [[c4]]
- Provide a narrow removal-preparation port on the existing credential owner that journals an empty ownedStagedRefs set with current registry generation before commit. cleanupRefs contains only refs owned by this application and unreferenced by every remaining row. Never read plaintext secrets to remove them. [[c1]] [[c2]] [[c4]]
- Keep the remove barrier until durable commit classification and synchronous runtime detachment. Ambiguous commit errors preserve the journal and return reconciliation-required/recovery-required for same-ticket status, not invented success. [[c1]] [[c2]] [[c4]]
- Existing-row edit probes must hold the same sc3 lease through child close/drain, not only config materialization. New unsaved draft probes have no selected stored revision and are not mistaken for use of an existing row. [[c1]] [[c2]] [[c4]]
- If registry commit throws after a possibly successful rename, do not release the remove barrier in a generic finally. Retain prepared runtime ownership and refuse resolution until same-ticket canonical receipt recovery classifies the commit; then detach or cancel the preparation as appropriate. [[c1]] [[c2]] [[c4]]

**Postconditions:**
- Replay returns the removed receipt before touching a recreated ID. Remove does not materialize a replacement config or allocate a credential generation. [[c4]]
- Preserve unrelated registry fields, entries, pinned families, revisions and receipts. Clear any owner last-committed projection for the removed generation without altering a newly recreated one. [[c4]]
- Postcommit credential deletion reuses the existing recovery loop's live-reference recheck and own-ref validation. Failed cleanup retains durable journal/receipt truth and never rolls back the row removal. [[c4]]
- A removal-only strict retirement port must detach the selected pool entry and invalidate its lease revision synchronously, transfer exact SDK/build handles to a bounded cleanup-only map and retain failed closes for retry. Current closeEntry suppresses errors and must not be used as cleanup-success evidence. Saved runtime-cleanup handles contain no recoverable credential/config payload and never go to disk. [[c4]]
- Keep original saved-only nested/alias read semantics and current strict legacy compatibility. v2 removal is not silently wired through legacy delete, which lacks the confirmed revision/ticket contract. [[c4]]
- Proposed strict retirement bounds are 64 pending explicit-removal records per canonical root and 256 daemon-wide. Reserve capacity before commit; return busy/resource-limit rather than committing an unowned resource or evicting a pending close. Unconstructed resources need no retirement record. These limits do not block session end/shutdown from draining resources they already own. [[c4]]

### 2.4 `SessionOperationLedger`

```typescript
interface SessionOperationLedger { issue(key: ConnectionKey, mode: 'create'|'update'|'remove'): OperationTicket; status(value: unknown): OperationStatus; mutate(value: unknown, apply: (request: MutationRequest, commit: (publish: () => { readonly revision: string }) => MutationOutcome) => Promise<MutationOutcome>, assertRequest: () => void): Promise<MutationOutcome> }
```

**Parameters:**
- `request: MutationRequest` — Existing private session request; commit mode comes only from its validated ticket/request.

**Returns:** `Promise<MutationOutcome>` — Extend existing session issue/inspect/mutate to remove. Publication returns a revision token instead of requiring a new safe row for deletion. [[c4]]

**Errors:**
- `busy | conflict | operation-mismatch | reconciliation-required | session-expired` when Existing memory quota, owner, revision and replay rules.

**Preconditions:**
- Use the same owner HMAC, in-flight map and receipts; no new global/session ledger and no temporary tombstone persistence. [[c1]] [[c2]] [[c4]]
- Keep existing 16384 operation-record quota and unexpired receipt retention. Remove receipts use capacity under the same bound; cleanup-pending records cannot be silently evicted. [[c1]] [[c2]] [[c4]]
- Temporary key/root/generation authority is revalidated after awaits and immediately before the synchronous commit callback. Owner expiry wins over ticket wall clock. [[c1]] [[c2]] [[c4]]

**Postconditions:**
- Derive registration:'removed', activation:'not-applicable' and credentialCleanup:'complete' from validated remove mode internally; caller JSON cannot choose outcome phases. [[c4]]
- Commit callback publishes memory deletion and the receipt in one non-awaiting turn under the existing root gate; no exception after deletion can leave an unreceipted successful mutation. [[c4]]
- Clear obsolete activation/cleanup bookkeeping only for the removed revision; activation retry for a removed or recreated revision cannot reopen the old driver. [[c4]]
- Concurrent same-operation retries share the in-flight result; changed payload rejects. Session end revokes receipts and cancels/drains owned retirement work. [[c4]]

### 2.5 `TemporaryConnectionOverlay`

```typescript
interface TemporaryConnectionOverlay { read(id: string): SafeConnection; list(): readonly SafeConnection[]; prepareRemoval(input: { readonly id: string; readonly expectedRevision: string }, signal?: AbortSignal): object; commitRemoval(prepared: object): { readonly revision: string }; resolver(access: Readonly<ConnectionAccessContext>, authority: TemporaryUseAuthority): ConnectionResolver; close(): Promise<void> }
```

**Parameters:**
- `owner: TrustedConnectionSession` — Existing role/root/generation binding and full-use lifetime.
- `selected: { readonly id: string; readonly expectedRevision: string }` — Removal candidate checked by the existing revision gate.

**Returns:** `SafeConnection | Promise<void>` — Extend the existing overlay with a private prepare/commit-removal operation and strict revision-retirement integration; public read/list/resolver signatures stay compatible. [[c4]]

**Errors:**
- `busy | conflict | not-found | session-expired` when Existing lease/generation/owner gates.

**Preconditions:**
- No selected config, credentials or driver is published in sc6 state. Staging identity is opaque and owner-issued, never accepted from a wire field. [[c1]] [[c2]] [[c4]]
- Existing mutation barrier and CAS must prevent update/delete and lease/delete races across waits. Reject a busy selected generation before budget or receipt effects. [[c1]] [[c2]] [[c4]]
- Do not close the whole overlay or session to discard one row. Keep all other roots, entries, delegations, receipts and selected repository state alive. [[c1]] [[c2]] [[c4]]

**Postconditions:**
- Removal detaches only the selected entry, invalidates its lease state and prepared updates by revision CAS, drops its config/credential references and updates shared quotas atomically with its memory receipt. [[c4]]
- Retire only the exact old revision via TemporaryDriverResources; on failure retain cleanup-only handles and safe counters, not a resolvable config. S001 sc8 file/converter close semantics are consumed unchanged. [[c4]]
- Retain the removed ID's boolean reservation until its runtime cleanup completes, so same-ID creation cannot collide with failed old cleanup. Release that reservation under the same root gate after cleanup; other sessions may still retain their independent same-ID temporary rows. [[c4]]
- Expiry and daemon shutdown adopt pending retirement handles into the existing session cleanup/drain path. No success or quota release may erase live owned handles; no source data or temporary state is persisted. [[c4]]
- A pending explicit retirement continues to consume one of the existing 64 per-session connection/resource slots until close completes, although its live config byte budget is released on logical deletion. Share this accounting across roots, and reserve the daemon-wide removal retirement capacity before commit; session expiry transfers existing ownership without another quota admission. [[c4]]
- prepareRemoval and commitRemoval are proposed internal owner ports. The object is an opaque WeakMap-backed staging token; arbitrary/copied/foreign tokens reject before effects. commitRemoval performs the synchronous deletion/lease invalidation/quota/retirement transfer, returns only a fresh operation revision, and schedules physical retirement after the ledger's synchronous receipt publication. [[c4]]

### 2.6 `DriverPool`

```typescript
interface DriverPool { prepareRemoval(id: string, oldRevision: string, operationId: string): object; commitRemoval(prepared: object): { readonly close: () => Promise<void> }; cancelRemoval(prepared: object): void }
```

**Parameters:**
- `prepared: object` — Proposed opaque owner-issued token binding the selected revision, existing remove barrier and reserved retirement capacity; arbitrary/copied/foreign tokens reject.

**Returns:** `object | { readonly close: () => Promise<void> } | void` — Preparation reserves cleanup ownership before commit. Verified publication synchronously detaches the old entry and returns a joined strict close; cancellation is allowed only after proving no durable removal committed. [[c4]]

**Errors:**
- `busy | conflict | not-found | resource-limit | recovery-required` when Existing active use, entry mismatch, retirement-capacity refusal, or unresolved commit/cleanup ownership.

**Preconditions:**
- These three members are proposed S004 integration ports on the existing pool, whose current source was verified in s1. No lease counter, driver cache or transaction store is duplicated. [[c1]] [[c2]] [[c4]]
- Caller holds existing root/remove barrier. Capacity is reserved before any registry commit; close is not started during preparation. [[c1]] [[c2]] [[c4]]
- Private tokens never serialize or accept user-supplied ownership. Preparing a never-constructed entry need not allocate an SDK retirement slot. [[c1]] [[c2]] [[c4]]

**Postconditions:**
- commitRemoval invalidates the existing lease state, detaches the exact old entry and transfers its handles synchronously before any awaited cleanup; cleanup failures keep exact handles for retry and never resurrect the row. [[c4]]
- Do not use closeEntry's swallowed-error path for strict retirement. Join repeated close attempts; keep failed close ownership without dropping the driver reference. [[c4]]
- On ambiguous durable commit, retain the prepared token and remove barrier until a canonical receipt/read establishes commit or noncommit. Verified commit publishes detachment; verified noncommit cancels the preparation. If classification is unavailable, new resolution remains refused and recovery-required is returned; generic finally must not reopen the old generation. [[c4]]
- Bound pending explicit removal retirements at 64 per canonical root and 256 daemon-wide. Release a slot only when its exact resources close; existing expiry/shutdown ownership transfers never require a fresh quota admission. [[c4]]

## 3. Data model changes

### 3.1 `CommittedReceipt` — invariant-change

Existing saved receipt shape remains unchanged. A remove receipt proves the exact operation's atomic row/revision removal; fresh outcome.revision is an operation tombstone identity, not a live row revision. One registry owns zero-to-many receipts; each receipt identifies exactly one key and operation. cleanupRefs are application-owned obsolete refs, never secret values. Compatibility: no extra persisted CommittedOutcome keys. [[c1]] [[c2]] [[c4]]

**Call sites:**
- `src/shared/connection-management.ts`
- `src/daemon/db/management.ts`
- `src/daemon/db/managed-store.ts`
- `src/daemon/db/secrets.ts`

### 3.2 `TemporaryConnectionOverlay` — invariant-change

One session owns one overlay per canonical root; each overlay owns zero-to-64 live entries across the shared session quota. A remove commit drops one live generation and writes one memory receipt. Private retired resources are no longer entries and cannot be enumerated or acquired. No cross-session state sharing or new durable schema. [[c1]] [[c2]] [[c4]]

**Call sites:**
- `src/daemon/db/session-entries.ts`
- `src/daemon/db/session-ledger.ts`
- `src/daemon/connection-session-rpc.ts`

### 3.3 `RemovalState` — new

sc6-owned safe projection: key/operation/state plus optional separate credential/resource cleanup phases. A removal operation projects one current state and can own zero-to-many retired SDK/file handles. Saved credential receipts survive restart; runtime handles and all temporary states do not. Confirmation and UI transitions belong to the same model, but layout and both-client integration remain S005. [[c1]] [[c2]] [[c4]]

**Call sites:**
- `src/shared/connection-management.ts`
- `src/daemon/connection-management-rpc.ts`
- `src/daemon/connection-session-rpc.ts`

### 3.4 `Removed runtime retirement` — new

Daemon-only cleanup identity is exact owner/root/id/oldRevision/operation; never resolved by current ID alone. It owns zero-to-many outstanding handles with single-close/joined retry semantics. Pending closure remains reserved and bounded by existing session/resource limits; no forced eviction. Saved source creds/configs are not copied into this record. Release is blocked until all consumer paths share the required lease owner, including worker-enabled routes. [[c1]] [[c2]] [[c4]]

```
Proposed internal strict pool retirement port (no new persistent shape): retireRemoved(id: string, oldRevision: string, operationId: string): { readonly close: () => Promise<void> }. Detachment and ownership transfer are synchronous under the existing root/revision barrier; close joins exact cleanup ownership and retains failures. Reserve 64 records/root and 256 daemon-wide before commit.
```

**Call sites:**
- `src/daemon/db/pool.ts`
- `src/daemon/db/session-entries.ts`
- `src/daemon/db/lease-gate.ts`

## 4. Diagrams

- [ER model](docs/epics/manage-saved-temporary-data-connections-E20261021484fcef7/S004/er-model.html)
- [Sequence diagram](docs/epics/manage-saved-temporary-data-connections-E20261021484fcef7/S004/sequence-diagram.html)

## 5. Interaction with shared contracts

| Contract | Role | How |
| :--- | :--- | :--- |
| `sc6` | implements | Removal request, pure confirmation/state model, safe cleanup projection/retry and two-scope orchestration. Source-data preservation and committed-vs-cleanup truth are explicit. [[c3]] [[c4]] |
| `sc1` | consumes | Use ConnectionKey/SafeConnection, registered-root eligibility, capability negotiation and safe exact input/output validation. Append sc6 endpoints/feature support without altering old create/update or legacy behavior. [[c3]] [[c4]] |
| `sc2` | consumes | Use existing mode remove, ticket signatures/expiry, canonical request MAC, exact persisted receipt and registration removed outcome. Runtime cleanup remains separate sc6 projection; credential cleanup retains its original meaning. [[c3]] [[c4]] |
| `sc3` | consumes | Use existing root-serialized revision barriers and callback/iterator/constructor/probe leases. Main-daemon operation affinity is necessary; all-consumer cross-thread owner proof is an explicit release prerequisite, with the separate worker-crossing work left out of S004. [[c3]] [[c4]] |
| `sc5` | consumes | Use existing trusted session role/root/generation access, memory ledger quotas, expiry and cleanup owner. Discard one entry without ending the workbench or changing control/data capability lifecycle. [[c3]] [[c4]] |

## 6. Error paths

**Error cases**

- **Malformed, wrong-target or changed-payload removal** (recoverable)
  - Detection: Existing strict mutation/ticket decoder rejects extra fields, missing expectedRevision, invalid target/mode/operation or invalid signature; compare full canonical request MAC before replay.
  - Response: invalid-input or operation-mismatch with fixed safe message before entry/credential/resource effects. [[c5]]
  - User impact: Row remains; correct or reopen the selected item. Never silently remint an uncertain operation.
- **Active analysis, iterator, constructor or selected-row edit probe** (recoverable)
  - Detection: Existing revision lease owner has active use or a mutation barrier when beginMutation(remove) runs under the root gate. All supported routes must share that owner.
  - Response: busy without receipt, config, credential or quota mutation. [[c5]]
  - User impact: Keep row visible; finish/cancel existing work and explicitly retry the same selected revision.
- **Revision changed or selected row missing before a first commit** (recoverable)
  - Detection: After checking any exact replay receipt, compare current selected entry and revision under the root gate.
  - Response: conflict or not-found; no source/credential cleanup. [[c5]]
  - User impact: Refresh and confirm the current row. A missing row alone is not proof this operation committed.
- **Unreadable, corrupt, replaced or externally edited saved registry** (recoverable)
  - Detection: Existing ManagedRegistry current snapshot and commit CAS/inode/digest/generation validation fail.
  - Response: registry-unreadable or recovery-required; preserve preparation and canonical operation identity when commitment is uncertain. [[c5]]
  - User impact: No destructive fallback; reconcile status or repair management recovery before retrying.
- **Commit/response ambiguity** (recoverable)
  - Detection: Atomic registry publication may have occurred before fsync/readback/transport failed; caller lacks a verified removed receipt.
  - Response: Unknown/recovery-required projection; reuse signed ticket with status. Only an existing MAC-matched receipt establishes removed. [[c5]]
  - User impact: Keep pending operation and reconciliation guidance; do not present a fresh remove action as a retry.
- **Postcommit keychain deletion failure or foreign/live credential reference** (recoverable)
  - Detection: CredentialGenerations recovery checks root ownership and all live references before deletion; deleteKey or cleanup journal finalization fails.
  - Response: Committed removed with credentialCleanup pending; foreign/live refs are preserved and never used as destructive cleanup candidates. [[c5]]
  - User impact: Registration stays removed; retry only original owned credential cleanup through sc6.
- **Postcommit SDK/file resource close fails** (recoverable)
  - Detection: Removal-only strict retirement awaits the exact old handle close and retains the handle when it rejects; it does not rely on the current pool helper that swallows close errors.
  - Response: Committed removed plus resourceCleanup pending and removed-cleanup-pending state. Failed resource remains cleanup-owned and reserved. [[c5]]
  - User impact: No restored row or new resolution; retry cleanup without a new registration mutation.
- **Temporary owner ends, expires or resumes with a newer generation** (terminal)
  - Detection: Existing role/root/generation binding and monotonic deadline guard fail before admission, after awaits or at publication; owner cancellation fires.
  - Response: session-expired; close admission and use existing session cleanup drains. No saved-only fallback or persisted temporary receipt. [[c5]]
  - User impact: Temporary state is unavailable after owner loss; do not claim same-ticket recovery across daemon restart.
- **Ticket expired without a retained receipt or operation quota reached** (recoverable)
  - Detection: Existing ticket expiry and receipt/in-flight identity checks; memory ledger or retirement capacity check before commit.
  - Response: reconciliation-required for expired unreceipted request, busy/resource-limit for exhausted capacity; retain pending cleanup and never evict live receipts. [[c5]]
  - User impact: Refresh/reconcile before a genuinely new action, or finish pending work before retrying.
- **Cleanup retry after same-ID recreation** (recoverable)
  - Detection: Select retirement by original owner/root/operation/old revision and use receipt cleanup refs, never by current ID alone.
  - Response: Return original committed truth and clean only old unreferenced owned artifacts; reject mismatched authority. [[c5]]
  - User impact: New registration and its credentials remain usable and unchanged.
- **Unverified client, old daemon or unproven worker lease owner** (recoverable)
  - Detection: Audience/capability/readiness/owner-affinity checks precede receipt/config lookup and dispatch; all-consumer integration proof is absent.
  - Response: unsupported-temporary, upgrade-required or closed sc6 feature gate; do not route private state through workers to obtain apparent support. [[c5]]
  - User impact: Explicit unsupported capability rather than unsafe deletion. Separate worker-crossing work and S005 acceptance remain external prerequisites.
- **Concurrent session shutdown and cleanup retry** (recoverable)
  - Detection: Existing cleanup ownership and single-close/joined promise identity observe closure and cancellation after every awaited boundary.
  - Response: No duplicate disposal or row resurrection; retain failed handles for the existing shutdown retry path and report pending/failure honestly. [[c5]]
  - User impact: No success while an owned resource remains; shutdown backstop and source-data invariants remain unchanged.

**Edge cases**

| Input | Expected |
| :--- | :--- |
| User cancels confirmation or navigates away before confirming | Pure state change only; no ticket issue, mutation, keychain, source file or cleanup call. [[c5]] |
| Saved and temporary rows share an ID in historical or independent scopes | Exact ConnectionKey and owner determine the selected row; preserve visible-namespace collision rules and unrelated owners/roots. [[c5]] |
| Repeated identical remove before/after receipt expiry, then a new row with the same ID | Within retained receipt validity, replay returns original removed truth without touching the new row; expired-unreceipted becomes reconciliation-required, never a best-effort second delete. [[c5]] |
| A driver was never constructed or row has no app-owned credentials | Remove without constructing/probing a driver or reading secret values; corresponding cleanup phases are complete. [[c5]] |
| An imported or legacy pinned-family row contains unknown supported fields or foreign refs | Remove selected registration only under normal revision authorization; preserve all other registry fields and foreign/live credential refs. Do not instantiate a mismatched driver just to remove it. [[c5]] |
| Panel closure or repository switch with an in-flight cleanup | S005 detaches view, not session ownership; original operation can still be reconciled while owner is live. No other overlay or selected repository is implicitly removed. [[c5]] |
| Daemon restart after saved commit but before cleanup receipt finalization | Saved journal/receipt recover credential phase. Old-process runtime handles cannot remain; do not recreate them to retry cleanup. Temporary state remains absent. [[c5]] |
| Concurrent remove/remove, remove/update, acquire/remove or edit-probe/remove | Use one root and revision barrier; only valid serialized outcomes commit. Busy/stale operations have no destructive effects, and late prepared updates fail CAS after deletion. [[c5]] |

**Invariants to preserve**

- Existing exact keys, MAC-bound operation replay, receipt shape and canonical root serialization remain authoritative; s1 code discovery and source-verification bundles identify these owners and their refusal branches. [[c1]]
- Keep create/update and saved-only legacy/nested/alias behavior; only the planned remove branch is added. s1 source verification inspected current parseMutationRequest, management apply and regression fixtures. [[c2]]
- Session capabilities, memory-only receipt/quota ownership, exact expiry and callback leases remain S003/sc3 contracts; s1 code bundle locates SessionOperationLedger, TemporaryConnectionOverlay and RevisionLeaseGate. [[c1]]
- Logical removal cannot erase cleanup ownership; source data is outside every cleanup target. s1 source verification shows pool close suppresses errors and the existing credential journal recovery rechecks live references. [[c2]]
- Keep S003 full-sweep failures and external/provider/client acceptance pending; s1 source-verification cites the committed full-sweep evidence and does not relabel it green. [[c2]]

## 7. Test strategy

**Test framework:** `Existing node:test + node:assert/strict TypeScript suites, executed with tsx under Node 22; confirmed by the source-verification bundle because graph test.locate was broad/off-topic. Explicit TAP is required for child outputs parsed as TAP. No new test framework or fabricated service acceptance. [[c2]]`

**Test levels**

- **unit** — Pure sc6 request/state/confirmation contract and exact negative validation without effects. [[c6]]
  - Subjects: `CM-S4-CONFIRM: exact ID/scope/repository copy and source-data guarantee; cancel causes zero ticket/mutation/credential/cleanup calls`, `CM-S4-INPUT: signed remove target and expected revision; reject extra patch/credentials, changed payload, scope/mode/root mismatch and malformed cleanup ticket`, `CM-S4-STATE: committed removal and independent credential/resource phases project correctly; absent row/not-seen is never removed`
  - Fixtures: `Existing strict wire and driver-profile fixtures`, `Ports counting every destructive/serialization sink; fixed canary errors and unsupported capability fixtures`
- **integration** — Actual existing saved service/registry/credential journal through real RPC with fault injection at commit and cleanup boundaries. [[c6]]
  - Subjects: `CM-S4-SAVED: atomic selected-row/revision removal plus exact receipt; preserve unrelated document bytes/semantics, pinned families and all other rows`, `CM-S4-REPLAY: same-operation concurrent replay and changed-payload refusal; lost response, rename/fsync ambiguity, expiry, receipt pruning and same-ID recreation`, `CM-S4-CREDENTIALS: only obsolete app-owned refs retire; preserve foreign/shared/live refs; deletion and finalization failures remain pending and recover after restart`
  - Fixtures: `Extend saved-management, receipt/recovery and actual socket fixtures`, `Journal/rename/fsync/keychain fault ports, owned versus foreign refs, restartable isolated owner`
- **integration** — Actual memory owner and overlay removal without any durable/credential effects. [[c6]]
  - Subjects: `CM-S4-TEMP: exact owner/root/revision discard and quota changes atomic with memory receipt; unaffected roots, owners and delegations survive`, `CM-S4-TEMP-REPLAY: concurrent replay, stale staged edit, new same-ID revision, expiry/end/resume/restart and receipt-capacity boundaries`, `CM-S4-NO-PERSIST: poison registry/keychain/cache/checkpoint/log/telemetry ports; assert zero access and no config/capability/canary persistence`
  - Fixtures: `Existing session owner/ledger/entries fixtures and actual IpcServer`, `Two owners and roots, identical IDs where permitted, source/config/capability canaries, monotonic clock`
- **integration** — Prove full-use barriers and postcommit retirement truth through the real resolver rather than a replacement lease counter. [[c6]]
  - Subjects: `CM-S4-BUSY: callback/iterator/constructor and existing-row edit-probe use blocks remove, with exactly-once lease/drain release`, `CM-S4-INVALIDATE: no new list/lease/acquire resolves removed generation before cleanup finishes; late staged writes fail CAS`, `CM-S4-RETIRE: unused, late-building, idle and close-failing resources retain exact cleanup ownership; retry never selects a new same-ID generation`, `CM-S4-RACES: controlled root-gate ordering for remove/remove, remove/update, remove/acquire and cleanup/create; no timing-based Promise.all ordering assumptions`
  - Fixtures: `Existing RevisionLeaseGate and callback/iterator fixtures`, `Existing S002 private probe worker and request drain ports`, `Strict close fault injection and retirement counters, no swallowed close exception`
- **live** — Verify actual source data and process-owned handles with real supported service/file fixtures; unavailable evidence stays pending. [[c6]]
  - Subjects: `CM-S4-SOURCE: real PostgreSQL and Redis rows remain intact after removal, while app connections/owned handles really close`, `CM-S4-FILES: actual supported native/converted file bytes and directories remain intact; only owned sc8 runtime/cache metadata may close`, `CM-S4-AFFINITY: threads-enabled and single-thread production analysis/tool/probe routes share exact management lease authority, or are refused before unsupported use; main-only unit tests cannot satisfy global busy acceptance`
  - Fixtures: `Reuse disposable SQL/KV service and file matrices; inspect actual sockets and handle counts`, `Use installed local runtimes without enabling provider/cloud live calls by default`, `SQL Server and separately deferred worker-crossing acceptance remain pending if unavailable; no mock substitute marked live pass`
- **contract** — Version, scope and ownership boundaries remain compatible and fail closed. [[c6]]
  - Subjects: `CM-S4-RPC: both scopes route new sc6 state/cleanup methods to main; old/missing feature refuses; unverified MCP denied before lookup; explicit saved channel never strips a presented session`, `CM-S4-COMPAT: create/update, strict legacy shapes, read-only nested/alias targets, descriptor/pinned-family behavior and S002/S003 lifetime tests remain green`, `CM-S4-PRIVACY: fixed safe status/error/progress/retry output; no endpoint/config/source contents/credential refs or capabilities emitted`, `CM-S4-GATE: mixed/stale/missing source+compiled/inventory/evidence refuses; private positive verifier fixture uses matching current build maps, never relabels shipped prerequisites`
  - Fixtures: `Existing namespace, source inventory and release-gate suites`, `Source and compiled manifests with private positive/negative fixtures; preserved historical pending evidence`
- **smoke** — Integration acceptance and final verification after implementation without substituting for S005 client work. [[c6]]
  - Subjects: `CM-S4-CLIENT: S005 consumes exact Delete/Discard confirmation, cancel, busy/stale, unknown and cleanup-pending models in both clients; external client rendering/keyboard acceptance remains pending until S005 proves it`, `CM-S4-SWEEP: each task runs relevant tests; after all implementation run fresh Node22 build and one full sweep, preserve exact outcomes and existing worker-store/file-refusal/shutdown-under-load findings`
  - Fixtures: `S005 client evidence is an explicit dependency, not a backend metadata assertion`, `Frozen source/test snapshot, complete raw logs, no automatic daemon restart or release activation`

**Acceptance mapping**

| Criterion | Proving tests |
| :--- | :--- |
| `ac1` | `CM-S4-CONFIRM`, `CM-S4-SAVED`, `CM-S4-TEMP`, `CM-S4-CREDENTIALS`, `CM-S4-RETIRE`, `CM-S4-SOURCE`, `CM-S4-FILES`, `CM-S4-NO-PERSIST`, `CM-S4-CLIENT` |
| `ac2` | `CM-S4-INPUT`, `CM-S4-STATE`, `CM-S4-REPLAY`, `CM-S4-TEMP-REPLAY`, `CM-S4-BUSY`, `CM-S4-INVALIDATE`, `CM-S4-RACES`, `CM-S4-AFFINITY`, `CM-S4-RPC`, `CM-S4-COMPAT`, `CM-S4-GATE`, `CM-S4-PRIVACY`, `CM-S4-SWEEP` |

## 8. Migration

**State before:** s1 analyzer found existing protocol, lease gate and owner classes plus explicit remove refusals. s1 source-verification inspected current saved atomic create/update publication, existing-shaped receipts and credential journal, memory-only temporary generations, and the saved close helper that suppresses close failure. sc6 removal is not currently supported or advertised; release remains disabled. [[c1]] [[c2]]

**State after:** Proposed S004 adds both owner remove branches and sc6 removal-state/cleanup retry adapters using unchanged receipt and mutation formats. Removed generations stop resolving before asynchronous cleanup. Strict retirement retains failures independently from credential cleanup. No existing source, keychain or registry migration runs automatically, and no release flag is activated by implementation. [[c7]]

**Zero downtime:** no — **Data rewrite:** no

**Steps**

1. Add the sc6 types, strict decoders, pure confirmation/state model and private matching-build verifier fixtures with capability advertisement disabled. Add protocol compatibility tests before any removal is admitted. [[c7]] — ↩ rollbackable _(needs: `sc6-disabled`)_
2. Extend existing credential preparation/recovery and private runtime owner retirement ports for removal without altering persisted envelope/receipt schemas, lease counters, signing identity or session authority. Prove failure-retention and no-source-data-deletion fixtures. [[c7]] — ↩ rollbackable _(needs: `sc6-disabled`, `existing-owner-regression-green`)_
3. Add saved and temporary atomic remove branches and authenticated main-daemon status/cleanup routing; retain existing create/update and strict legacy paths. All source/compiled/consumer inventories receive reviewed classifications, not an automatic hash refresh. [[c7]] — ↩ rollbackable _(needs: `sc6-disabled`, `owner-removal-tests-green`)_
4. Verify real all-consumer lease affinity with worker routing enabled and full probe/iterator/constructor drains. Record any remaining worker-crossing dependency as pending and refuse unsupported routes. Do not implement the separately deferred cross-thread architecture as an S004 side effect. [[c7]] — ↩ rollbackable _(needs: `sc6-disabled`, `consumer-owner-proof-required`)_
5. Run each task's relevant tests, then the final fresh Node22 build and full sweep after implementation. Preserve S003's original failed sweep and isolated reruns, SQL Server/provider/foundation gaps and both-client S005 acceptance as historical/pending evidence. [[c7]] [[c11]] — ↩ rollbackable _(needs: `sc6-disabled`)_
6. Only a separately explicit release decision after all consumer, cleanup, privacy, source-preservation and external prerequisite evidence is verified may advertise saved-remove/temporary-remove and sc6 state/cleanup capabilities. This Story does not enable them. A committed user removal is not automatically reversible: recreation requires fresh user input and a new operation, never rollback of old source/config/credential material. [[c7]] — ✕ non-rollbackable _(needs: `all-release-prerequisites-verified`, `explicit-release-approval`)_

**Backward compat:** Keep protocol version 2 and existing signed ticket, MutationRequest, OperationStatus and persisted CommittedOutcome/CommittedReceipt shapes. Existing client methods and legacy saved read/save/delete semantics remain unchanged; no managed removal falls back to legacy delete. New clients require explicit sc6 capabilities and treat old/missing support as upgrade-required. Source and compiled evidence must describe the same build. Before downgrading, stop admission and drain current owned resources; old-process handles cannot be transferred. Saved removed receipts and empty-staging journal records retain existing-supported formats; temporary state expires on daemon restart rather than migrating. Never resurrect a removed entry or restore old credentials automatically. [[c3]] [[c7]]

## 9. Alternatives considered

### 9.1 a1: Extend existing mutation owners and add a narrow sc6 cleanup projection — **CHOSEN**

Use existing remove tickets/mutate/status, with private retirement ownership and a separate removal-state/cleanup retry surface.

Fill the already-declared remove branch in saved and temporary owners, retaining their canonical request MAC, replay and root/lease gates. Add only sc6 removal-state and cleanup-retry projections; keep CommittedOutcome and persisted receipt shapes unchanged. Confirmation is a pure typed state projection consumed by S005. Retired SDK handles stay in daemon memory; saved obsolete credential cleanup uses the existing preparation journal, and temporary state never persists. [[c1]] [[c2]] [[c3]]

### 9.2 a2: Dedicated removal coordinator RPC with typed result envelope

Expose one removal-specific coordinator over the existing saved and temporary owners.

Add an sc6 removal command/result envelope which accepts the existing signed ticket, exact key and expected revision, and delegates to the existing owner's remove branch. It owns confirmation presentation, maps replay and cleanup state, and retains the same credential journal and in-memory runtime retirement records; it does not create a new transaction store, signer or lease layer. [[c1]] [[c2]] [[c3]]

**Rejected because:** It does not close the sc3 integration gap and adds protocol adapters with partial sc1/sc2 fit compared with a1. [[c9]]

## 10. References

- **[[c1]]** `step-output` `s1` — "analyzeBundles[0]: analyzer-located symbols and remove refusal/root-gate evidence"
- **[[c2]]** `step-output` `s1` — "analyzeBundles[1]: direct source verification of owners and regression fixtures; incomplete graph supplemented"
- **[[c3]]** `prior-artifact` `HLD-484fcef7efaf229e`
- **[[c4]]** `step-output` `s4`
- **[[c5]]** `step-output` `s5`
- **[[c6]]** `step-output` `s6`
- **[[c7]]** `step-output` `s7`
- **[[c8]]** `step-output` `s8`
- **[[c9]]** `step-output` `s3`
- **[[c10]]** `prior-artifact` `DEF-484fcef7efaf229e`
- **[[c11]]** `doc` `docs/epics/manage-saved-temporary-data-connections-E20261021484fcef7/S003/evidence/full-sweep-20261029/summary.json`
