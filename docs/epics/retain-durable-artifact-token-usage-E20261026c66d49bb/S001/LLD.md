<!-- insrc:artifact LLD-c66d49bb81925886-s1 -->

<!-- governing-native-coverage-v1 -->
> **Governing user-approved scope decision, 2026-10-27.** Complete-leaf replacement is rejected in v1 with `native-coverage-unverified`; retain explicit aggregate fallback. This supersedes contrary complete-leaf success expectations below. Native invocation coverage needs a later schema/design extension. Canonical provenance: `.insrc/artifacts/LLD-c66d49bb81925886-s1.feedback.jsonl`, entry `user-decision-native-coverage-v1-lld`, and its revision-less scope-decision log entry. The original approved revision and its approval history are retained; this records the subsequent explicit user instruction, not a new automatic artifact approval.


<!-- insrc:artifact LLD-c66d49bb81925886-s1 -->

# LLD: STORY-c66d49bb81925886-s1

## Summary

**Epic:** `retain-durable-artifact-token-usage`
**HLD base run:** `wf-1793000708824-4ul5b4`
**HLD effective hash:** `eaf9512e2067...`

Story s1 defines the immutable usage facts and pure accounting rules consumed by the later root-ledger service. It validates stable identities, charged subjects, counter quality and explicit correction/reconciliation/transfer evidence, and explains one effective accounting basis without changing stored history. Source-capability fixtures keep physical calls, native invocation totals and unknown measurements distinguishable.

Current implementation baseline (2026-10-26, build in progress): accepted task t1 commit fddd2fc66 added src/workflow/usage/types.ts, the type-only index.ts and compiler fixtures; accepted t2 commit 8d729ba23 added schemas.ts and both ledger-record.v1 schema files. Task t3 commit 5b88059fc added canonical.ts and identity tests; its original allocation promise failed validation and its object-boundary revision remains unaccepted. Extend and qualify these existing foundations; do not recreate them. Validation, attribution, capabilities and reducer runtime implementations remain to be built in t4-t10; t11 publishes the complete runtime barrel. None of this is a completed usage ledger or live capture service.

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

> See **HLD-c66d49bb81925886** § 2. Framework summary

**Rollout phase:** A — accounting contracts
**Owns:** `sc1` (Immutable ledger record and accounting reducer), `sc2` (Canonical usage ownership and reservation types)

**Adjacent scope (owned by other stories — do NOT implement here):**
- `s2`: Root resolution against current content/workflow evidence, reservations, Avro block coding/reopen, root writer guards, intent/checkpoint IO, corruption classification, restart recovery, indexes and leased prefix copies. s1 types are consumed; no artifact content mutations, transfer policy implementation or reporting SQL. Lock and checkpoint implementation remains private. Repository-wide event/call ownership checks, derived disk-backed identity indexing and crash catch-up are private s2 mechanisms; accepted facts remain only in Avro. — owns `sc3`, `sc4`
- `s3`: Lifecycle independence tests, paired import/export, binary-safe branch event union, retained tombstones and source-coordinated cross-root transfer/recovery. Consume s2 APIs instead of reaching into its journal. No accounting redefinition, new root identity scheme or content approval gate. Import staging and transfer coordinator internals remain private. — owns `sc5`
- `s4`: Daemon registry/IPC adapters, path/identity/access validation, diagnostic projection, resource-budget/scale acceptance and committed-snapshot decoding qualification against existing DuckDB conversion. Exact handler registration and query fixture plumbing remain private. No capture, controller-host reporting, hierarchical DeliverySnapshot or board implementation. — owns `sc6`

## 2. Contract details

**Surface level:** internal-shared

### 2.1 `UsageReducer.validate`

```typescript
validate(record: LedgerRecord): readonly string[];
```

**Parameters:**
- `record: LedgerRecord` — One decoded v1 envelope; trust-boundary implementation first validates unknown input structurally before reading typed fields.

**Returns:** `readonly string[]` — Empty for a structurally/locally valid immutable record; otherwise stable code:path notices. No graph completeness, repository registration or filesystem ownership is inferred.

**Errors:**
- `UsageValidationNotice (stable code:path string)` when Unknown version/kind, invalid field/type/shape, unsafe counter, bad digest, illegal payload combination or oversized record.

**Preconditions:**
- Input is treated as unknown at runtime despite its HLD TypeScript signature; reject accessors/custom prototypes/cycles before field access.
- Use the closed v1 schema and safe scalar/depth/byte limits; no provider SDK objects.

**Postconditions:**
- No input mutation or persistence; validation never reruns inference.
- Checks local kind/shape/ID/counter rules only. Full references, identity collisions and attribution are checked by reduce and UsageAttributionPolicy.

### 2.2 `UsageReducer.reduce`

```typescript
reduce(records: AsyncIterable<LedgerRecord>, scope: Readonly<Record<string, unknown>>): Promise<EffectiveAccounting>;
```

**Parameters:**
- `records: AsyncIterable<LedgerRecord>` — Complete bounded call or invocation-model accounting group, including its correction/reconciliation/transfer reference closure.
- `scope: Readonly<Record<string, unknown>>` — Runtime-validated accounting scope: group key, metric, expected bindings, source capability evidence, closure declaration and resource limits. A service-supplied completeness proof is evidence; a caller boolean alone cannot establish complete native coverage.

**Returns:** `Promise<EffectiveAccounting>` — Exact decimal knownTokens/estimatedTokens for the selected metric, quality flags, selected observation basis IDs and bounded machine-readable notices. Incomplete groups/conflicts never yield an asserted complete total.

**Errors:**
- `UsageAccountingNotice (resolved quality/notice result)` when Invalid identity/reference graph, source/model overlap, unavailable evidence, unsupported version or incomplete snapshot closure.
- `UsageDomainError` when Resource bound exceeded, cancellation or source iterator failure. The caller receives no successful partial total and must not interpret rejection as zero.

**Preconditions:**
- One declared group per invocation/model-slice or isolated call; raw mixed-root ledger pages are not complete groups.
- Reference closure and canonical binding evidence come from later service/index contracts. s1 does not query roots, resolve documents or trust arbitrary client-supplied ownership.
- No parallel provider calls or filesystem/provider/DB side effects.

**Postconditions:**
- Permutation-invariant result for the same complete set, regardless of arrival sequence or timestamps; identical replay contributes once.
- All original observations remain untouched. Corrections select a replacement; overlap reconciliation selects a non-overlapping basis; valid transfers change effective attribution but not physical record provenance.
- No subtree rollup: TU4 composes disjoint effective groups and known/estimated/quality partitions.
- Under approved AMD-c66d49bb81925886-1, every new result includes typed effectiveOwners entries for selected contributions and explicit unresolved mappings; consumers never infer current ownership from immutable capture-owner record IDs.

### 2.3 `UsageAttributionPolicy.validate`

```typescript
validate(input: UsageAttributionInput): readonly string[];
```

**Parameters:**
- `input: UsageAttributionInput` — Explicit normalized activity, charged artifact, exact subject/task/BUILD/review subject and optional parent binding, with canonical syntax/kind and consistency validation.

**Returns:** `readonly string[]` — No notices only when supplied attribution satisfies the mandatory HLD table; the result is not proof that the caller owns the repository or resolved its actual root.

**Errors:**
- `UsageAttributionNotice (stable code:path string)` when Unsupported activity, wrong charged kind/subject, conflicting task/story IDs, missing reviewed subject/BUILD/parent context or attempted reference-only double charge.

**Preconditions:**
- Caller supplies exact subject evidence; no guess from a step name, document title, hash prefix or nearest artifact.
- Registration, actual owner resolution and dispatch selection remain s2/TU2/TU3 responsibilities.

**Postconditions:**
- Story design/review charges LLD; PLAN work charges PLAN; task execution/repair/probes/validation charges TASK; shared story validation/code review charges BUILD.
- CR/TASKS/BUILD summary references are non-additive. Nested workflow context inherits its explicit parent charge; background indexing is rejected as workflow usage without an explicit causal binding.
- DEF/HLD/ISSUE/SPEC authoring/review charges its exact subject. No automatic provider instrumentation.

## 3. Data model changes

### 3.1 `LedgerRecord and closed v1 payload catalog` — new

TARGET FILES: existing types.ts, ledger-record.v1.schema.json and ledger-record.v1.avsc.json are extended/qualified; validation.ts remains new in t4. All live under src/workflow/usage/. Only these pure domain contracts, not an Avro file writer, are built by s1. Existing HLD types remain compatible exports; refinements narrow context/observation/control at validation boundaries.

Every envelope has exactly schemaVersion=1, eventId, rootArtifactId, artifactId, sequence, recordedAt, recordKind, callId, payloadDigest, context, observation and control. Unknown extra properties fail ingestion. IDs are bounded <=256-character source strings; root/artifact IDs additionally parse with ArtifactIds and root kind is EPIC/STORY/ISSUE/SPEC. s1 checks syntax/relationships supplied as evidence; it does not decide whether a STORY is independently rooted. sequence is a nonnegative safe integer allocated by s2; recordedAt is canonical UTC ISO timestamp allocated by the service. callId is nonnull on request.started/request.finished/usage.corrected and null on usage.reconciled and reservation/binding/commit control records; transfer records carry the referenced call in typed control and do not introduce a second start.
recordKind is closed to request.started, request.finished, usage.corrected, usage.reconciled, root.reserved, artifact.bound, binding.reconciled, batch.commit, transfer.prepared, transfer.accepted and transfer.committed. Unknown version/kind never silently reduces to zero. Physical membership rootArtifactId/artifactId are capture-time facts; transfer destination is a reference, not a rewrite.

request.started: context nonnull; observation/control null. context has logicalRequestId, invocationId (nullable), nativeSessionId (nullable), parentCallId (nullable), workflow/runId/stepId, normalized activity, positive attempt, source provider/transport/version/evidenceId, granularity (model-call|invocation-total|cumulative-snapshot), stable modelSliceId, modelKind (completion|embedding), requestedModel, reportedModel(nullable), review(round/recordId nullable), and typed binding evidence. For aggregate observations, callId identifies the observed invocation attempt/model slice; it never asserts a physical leaf-call count.
request.finished: context/control null; observation nonnull and contains outcome (success|error|timeout|cancelled|interrupted), reportedModel(nullable), finishedAt, quality(reported|estimated|unavailable), counters, normalizationVersion=disjoint-v1, nativeUnit, sourceCapabilityId, reason(nullable) and cumulative(nullable; nativeSessionId, baselineEventId and frameId when present). It references one existing start with the same call/root/artifact; terminal outcomes retain reported consumed work even on failure.
usage.corrected: same usage identity, observation is a COMPLETE replacement observation, and control contains supersedesEventId plus bounded reason/provenance. A valid correction keeps source group/modelSliceId/call/capture owner; reported model may be refined from unknown with explicit evidence but cannot silently move to another source slice. No additive token delta.
usage.reconciled: no new counters; typed control references the group, complete candidate observation heads, selected/excluded basis IDs, previous reconciliation(nullable), source capability and evidence. Selected/excluded arrays are unique and disjoint; references must resolve to the same invocation/model slice. A complete-leaf decomposition must enumerate all replacement heads and validated coverage evidence, not just select a convenient subset.
Reservations/binding controls: reserved stable root/subject/run IDs, expected previous binding version, provenance/reason and authorized-workflow evidence reference; they contribute no tokens. s2 owns authority lookup and persistence.
Transfer controls: stable transferId, original source event/call/root, destination root/artifact, expected owner version, reason, prepared/accepted/committed event references as applicable. s1 validates reference state only; s3 owns locks, IO and coordinator recovery. batch.commit carries bounded batch IDs, prior digest and group digest; s2 validates physical bytes/checkpoint.
The Avro contract uses a flat named envelope, long safe counters/sequence, strings for IDs/tags/times, and typed nullable Context/Observation/Control records with bounded arrays. It contains no opaque prompt/response JSON. JSON schema enforces discriminator field combinations and counter bounds; typed Avro fields use nullable default=null for genuinely optional values. s2 consumes this writer schema unchanged, builds the container header/sync/blocks and qualifies reopening. Logical version tags never authorize mixing incompatible writer schemas within one file.
Packaging is part of s1 acceptance: existing src/workflow/usage/schemas.ts statically imports both schema JSON files with ESM JSON import attributes, exports immutable schema values for the validator and later s2, and is re-exported from proposed src/workflow/usage/index.ts. The existing tsconfig.json has resolveJsonModule and NodeNext, so imported JSON must be emitted with the production module graph; do not read schemas from the source tree using fs or assume copy-assets.mjs copies arbitrary directories. The physical Avro definition remains JSON despite the .avsc.json extension. A compiled-output smoke test verifies both schema modules load under the supported Node runtime without src/ present; source/compiled schema digests must match. This is a schema distribution check, not container writing or DuckDB integration.
Transfer controls discriminate mode=same-root|cross-root. Envelope callId is null on all transfer controls; the original call is a reference in typed control. Same-root committed control permits null phase references; cross-root commit requires both phase references.
Same-root reassignment is a distinct sc1 case, exactly as approved in HLD: one transfer.committed control operation, not a prepared/accepted pair. The control payload has mode=same-root, transferId, originalObservationRef(rootArtifactId,eventId,callId), sourceRootId, destinationRootId, fromArtifactId, destinationArtifactId, expectedBindingVersion and reason; preparedEventId and acceptedEventId are explicit null. sourceRootId equals destinationRootId and equals the current effective owner's root. The control record is non-billable and has envelope callId=null. Original capture location may be another historical root, but the immutable original observation reference must resolve and cannot be copied.
Validate that supplied current binding matches sourceRootId/fromArtifactId and expectedBindingVersion, that destinationArtifactId has verified same-root binding evidence, and that this single operation references the same logical consumption. After valid commitment, effective owner becomes destinationArtifactId and owner version becomes the committed eventId; retain previous owner/reason/reference history. No cross-root receipt or prepare is required. A mismatched root, version or subject is conflict; equal event replay/transferId with equal source control is idempotent. Competing changes from one expected version, cycles or conflicting transferId payloads remain explicit conflicts.
Cross-root transfer has mode=cross-root, unequal effective source/destination roots and the existing matching prepared -> accepted -> committed references. Its commit must resolve both phase IDs and required closure before changing effective owner. A same-root record cannot use this mode to bypass the single-operation validation, and a cross-root record cannot use same-root mode to avoid receipt validation. These are pure reference/owner-state rules; s3 alone commits and coordinates their IO.


```
type NormalizedCounters = { readonly inputUncachedTokens: number | null; readonly cacheReadTokens: number | null; readonly cacheWriteTokens: number | null; readonly outputTokens: number | null; readonly reasoningTokens: number | null; };
type AccountingScope = { readonly group: Readonly<{ invocationId: string | null; modelSliceId: string; isolatedCallId: string | null }>; readonly metric: 'processed' | 'inputUncachedTokens' | 'cacheReadTokens' | 'cacheWriteTokens' | 'outputTokens' | 'reasoningTokens'; readonly expectedBindings: readonly UsageBinding[]; readonly evidence: Readonly<Record<string, unknown>>; readonly closure: 'complete-observed-group' | 'partial'; };
interface UsageNotice { readonly code: string; readonly path: string; readonly eventIds: readonly string[]; }
type UsageValidationNotice = string;
type UsageAccountingNotice = string;
type UsageAttributionNotice = string;
interface UsageDomainError extends Error { readonly code: 'resource-limit' | 'source-unavailable'; }
```


### 3.2 `Canonical source identity and immutable comparison` — new

EXISTING PARTIAL IMPLEMENTATION: src/workflow/usage/canonical.ts was added by t3 and must be qualified against the revised object-boundary contract. Preserve the existing artifact contentHash behavior and do not export/import its private canonicalJson. src/design/corpus/canonical.ts is a distinct domain dependency; follow safe-data conventions but do not couple usage to design-corpus errors/limits. Proposed new helper names are private implementation choices, not additions to HLD public APIs.
Canonical source bytes include schemaVersion, eventId, rootArtifactId, artifactId, recordKind, callId and the complete typed source context/observation/control. Exclude only service-assigned sequence, recordedAt and payloadDigest. Canonical UTF-8 JSON sorts object keys by code-unit order, preserves array order, permits only plain enumerable data properties/dense arrays and JSON scalars, and rejects cycles, accessors, custom prototypes, symbols, undefined, functions, nonfinite/unsafe numbers, invalid Unicode and unknown keys before invocation of getters/toJSON. All nullable fields are explicit null; absent optional payload fields are rejected or normalized only by a single documented typed boundary before hashing. Never hash a lossy serialization. Canonical digest is SHA-256 with domain separator insrc.usage.source.v1 followed by a zero byte and those bytes.
Validate root/artifact membership even on duplicate payload. Identical event ID + same canonical source bytes is replay even if a later server sequence/time differs; identical ID + different payload is conflict. A second start for a callId with different context/owner is conflict even under a different event ID. s2's repository-wide gate checks these pure rules across roots before accepting bytes; a group reducer cannot claim it checked unseen roots.
Limits: <=16 KiB canonical source bytes and <=32 nesting depth; at most 4096 traversed scalar/container nodes and <=1024 items in any reference array. Accept objects directly and centralize safe snapshotting, serialization and validation in the usage domain; callers must not pre-serialize. Bound canonicalizer traversal, retained bookkeeping and emitted bytes. JavaScript engine own-property enumeration may allocate memory proportional to the supplied object before the property-count check; this initial engine allocation is explicitly excluded from the resource guarantee. Continue rejecting hidden/symbol properties and getters without invoking hooks. Reject oversized arrays by their own length descriptor before key enumeration. No transcript or credential property is accepted. Input snapshots are immutable copies after validation; reducer does not mutate caller arrays.


### 3.3 `Deterministic effective observations and bounded scope` — new

REMAINING NEW FILE: src/workflow/usage/reducer.ts. Public UsageReducer implements HLD sc1; internal lookup maps and graph walks are private. Input must be a complete bounded accounting group with all correction/reconciliation references and, for transfer, both-root committed evidence. Scope schema is closed; an isolated call and an invocation/modelSlice group cannot both be selected. Resource ceiling: <=1024 records and <=8 MiB canonical source bytes per invocation of reduce, plus bounded notices/reference lists; resource overflow rejects the operation with no successful total. Larger roots are grouped and streamed by s2/s4/TU4 using derived indexes; s1 never loads or aggregates a whole root. Tests measure heap behavior separately.
Evaluation order is semantic, not arrival sequence: validate records/scope -> identical-event deduplication and call/start consistency -> build bounded reference graph and detect dangling/fork/cycle/cross-scope edges -> select each call's unambiguous terminal/correction head -> resolve one observation basis per overlap group -> validate committed transfer closure/version -> partition exact contributions by selected metric/quality. Use deterministic sorted-ID traversal for notice/basis presentation and bigint arithmetic after validating each nonnegative safe input. Return decimal strings, never unsafe JS sums. Cancellation/iterator failure cannot turn an incomplete stream into a successful result.

Correction head selection: every correction has exactly one predecessor; a predecessor has at most one effective successor. Different valid successors cause conflict; never choose latest timestamp/sequence. Missing predecessor is incomplete. A finish without a start, multiple distinct finishes without a correction relation or mismatching root/call/model slice is unresolved/conflicting. Original rows stay available as provenance.
Overlap: invocation-total and model-call evidence in one invocation/modelSlice overlap unless an explicit validated reconciliation says otherwise. Without it, their union has no trusted additive basis and yields overlap-unresolved. Reconciliation declares all currently observed candidate heads, their coverage and selected/excluded set. Aggregate fallback selects the aggregate and excludes known overlapping leaves, retaining provenance; complete-leaf decomposition selects all validated covered leaf heads and excludes fallback. Partial observed leaves cannot fabricate residual tokens or native call count. Any later candidate not covered by the active reconciliation reopens unresolved overlap until a successor reconciliation names the updated set. Reconciliation forks, stale correction heads or coverage inconsistent with the source capability are conflicts.
Cumulative observations have a stable native session/model-slice identity and explicit baselineEventId. For a cumulative scope, evidence declares selectedCurrentEventId, baselineEventId and referenceOnlyEventIds. Only the selected endpoint minus that baseline contributes; intermediate snapshots and baseline records are reference evidence, never additional delta contributions. A baseline can come from a prior invocation only as explicitly reference-only evidence with the same qualified nativeSessionId/modelSliceId. Multiple endpoints sharing a baseline are overlapping candidates, not additive deltas; a validated reconciliation must select one interval/basis. TU4 may combine only proven disjoint intervals using their reference boundaries. Compute disjoint deltas only from a resolved same-session/same-model baseline with monotone per-bucket counters and no missing evidence; never sum snapshots or carry a baseline across reset/model change. Cache-inclusive/native-exclusive conversion is a producer normalization concern in TU2; s1 validates disjoint-v1 facts and capability provenance rather than parsing provider payloads.
A metric's known portion sums nonnull reported values; estimated portion stays separate. Unknown required components add unavailable/partial notices and cannot become reported zero. Processed = uncached + cacheRead + cacheWrite + output; reasoning is a subset of output and is not added. reasoning > output is invalid when both known. unavailable quality has all counters null and a reason; estimated counters require estimation provenance; measured reported zero requires an explicit finished record and applicable supported counters. Failure/timeout with counters still contributes them.
For a conflict or unresolved overlap in one basis, exclude that ambiguous contribution rather than selecting a speculative winner; retain other disjoint trusted known/estimated contributions with conflict/partial quality. A partial scope cannot return a complete total even if the visible rows add to zero. Unknown actual model is grouped/labeled as requested-only, never silently merged with confirmed actual-model usage. EffectiveAccounting.basisEventIds are selected observation heads, not starts, control facts or extra charges. UsageQuality flags are a set in deterministic order; bounded notice strings carry stable codes, paths and referenced IDs. Numeric strings are exact values for the chosen metric, not currency or normalized effort.

Transfers: distinguish same-root single committed operation from cross-root source-prepared -> destination-accepted -> source-committed reference chains using explicit mode, transferId and expected owner version. Source observation remains physically in its original root. For cross-root mode, only matching committed pairs change effective owner; pending preparation retains original attribution plus notice. Same-root mode applies the single committed operation described below without requiring cross-root phases. A destination receipt alone contributes no usage. Invalid/missing closure, competing owner versions and transfer cycles/forks yield conflict/partial. No original counter is copied into a destination observation. s1 evaluates supplied facts; it does not coordinate transfer writes or resolve repository roots.
The closed scope.evidence descriptor includes root watermark references, expected unique event IDs/count/set digest, referenceOnlyEventIds, source capability declarations/versions, expected binding versions and coverageState (observed|partial|legacy|missing|unsupported). Compare the actual unique set and required reference roles before accounting. Reference-only baseline/transfer closure may cross invocation/root boundaries only as explicitly typed evidence, never as an additional contribution. Domain code checks descriptor consistency; trust/authority and descriptor construction remain sibling service responsibilities.
Same-root reassignment is a distinct sc1 case, exactly as approved in HLD: one transfer.committed control operation, not a prepared/accepted pair. The control payload has mode=same-root, transferId, originalObservationRef(rootArtifactId,eventId,callId), sourceRootId, destinationRootId, fromArtifactId, destinationArtifactId, expectedBindingVersion and reason; preparedEventId and acceptedEventId are explicit null. sourceRootId equals destinationRootId and equals the current effective owner's root. The control record is non-billable and has envelope callId=null. Original capture location may be another historical root, but the immutable original observation reference must resolve and cannot be copied.
Validate that supplied current binding matches sourceRootId/fromArtifactId and expectedBindingVersion, that destinationArtifactId has verified same-root binding evidence, and that this single operation references the same logical consumption. After valid commitment, effective owner becomes destinationArtifactId and owner version becomes the committed eventId; retain previous owner/reason/reference history. No cross-root receipt or prepare is required. A mismatched root, version or subject is conflict; equal event replay/transferId with equal source control is idempotent. Competing changes from one expected version, cycles or conflicting transferId payloads remain explicit conflicts.
Cross-root transfer has mode=cross-root, unequal effective source/destination roots and the existing matching prepared -> accepted -> committed references. Its commit must resolve both phase IDs and required closure before changing effective owner. A same-root record cannot use this mode to bypass the single-operation validation, and a cross-root record cannot use same-root mode to avoid receipt validation. These are pure reference/owner-state rules; s3 alone commits and coordinates their IO.



### 3.4 `UsageBinding and mandatory attribution policy` — new

PROPOSED FILE: src/workflow/usage/attribution.ts; HLD sc2 types remain in src/workflow/usage/types.ts. Preserve UsageBinding, BindingRequest, BindingResolution, UsageAttributionInput and UsageAttributionPolicy signatures. Existing ArtifactIds provides canonical syntax/kinds only; policy validation is not registration, root resolution or authorization.
Normalized activities and charged kinds: definition-author/definition-review -> exact DEF; epic-design/epic-design-review -> exact HLD; story-design/story-revision/design-review -> exact LLD, with reviewedArtifactId=chargedArtifactId for a review; plan-author/plan-refine -> exact PLAN; task-implement/task-repair/task-probe/task-validate -> exact TASK and matching task/story; shared-validate/code-review -> exact story BUILD; issue-framing/spec-framing -> exact ISSUE/SPEC; workflow-context -> exact explicit parentBinding artifact/root/run. No fuzzy aliases on step names.
For each activity require subjectArtifactId to be the authored/reviewed work-item document or parent context as appropriate. The parsed story/task/hash of charged ID must agree with supplied subject/task/BUILD evidence. CR, TASKS and generic BUILD summaries are reference records only; code-review charges BUILD, not CR; task work charges TASK, not each summary. A review round field alone never changes the charged owner. No automatic root fallback when evidence is absent.
Binding fields repo/rootArtifactId/artifactId/workItemId/workflowRunId/version/provenance are validated bounded strings with canonical identity consistency. provenance is stored-owner, workflow-reservation or committed-transfer. A reserved root/child is a type-level fact supplied by a trusted service, not an instruction for this module to create storage. New-version/ownership changes require explicit reference facts, never replacement of the original source identity. Missing or conflicting evidence returns attribution/binding notices without inventing an owner.

**Call sites:**
- `src/workflow/artifact-ids.ts`

### 3.5 `SourceCapability evidence and qualification fixtures` — new

PROPOSED FILES: src/workflow/usage/capabilities.ts and src/workflow/usage/__tests__/fixtures/source-capabilities.v1.json. This is a closed evidence declaration and sanitized contract-fixture survey, not provider adapters or host telemetry.
Each declaration carries capabilityId, provider/transport, inspected version or source revision, evidence refs, granularity (model-call|invocation-total|cumulative-snapshot|unknown), physicalCallCoverage (complete|partial|unknown), observed model identity support, input convention (disjoint|inclusive-cache|exclusive-cache|unknown), reasoning-in-output (true|false|unknown), supported counter buckets, baseline requirements and qualification status (source-inspected|recorded-fixture|unqualified). Missing version/evidence cannot claim complete coverage.
Existing source facts: LLMResponse.usage is optional, with required input/output when present and optional cache fields; this shared shape does not establish native completeness. Ollama code conditionally captures final done-chunk prompt_eval_count/eval_count; absent counters remain absent, and warm-cache comments do not prove total cache consumption or cache=0. Fixtures distinguish final envelope, no-counter warm-up, missing counter and disjoint normalization contracts. CLI source inspection/recorded envelopes must state whether the application exposes usage and at what native scope; unsupported native leaf visibility remains unknown. External-host declarations are synthetic capability contract fixtures, not evidence that the host currently reports usage. No answer-length estimate or historical backfill is allowed.
s1/ac6 acceptance requires a checked-in survey listing exact inspected source revision/tool version and evidence refs for each supported entry, plus golden declaration/validation fixtures. Where native per-call evidence is unavailable, record unqualified/unknown and prove the API refuses a completeness claim. Live source probing is optional and serial if needed, not required to call providers or implement TU2/TU3.

**Call sites:**
- `src/shared/types.ts`
- `src/agent/providers/ollama.ts`
- `src/agent/providers/__tests__/internal-retry.test.ts`

### 3.6 `EffectiveAccounting effective ownership result` — field-add

Approved additive sc1 amendment AMD-c66d49bb81925886-1: EffectiveAccounting.effectiveOwners?: ReadonlyArray<Readonly<{ callId: string; rootArtifactId: string | null; artifactId: string | null; ownerVersion: string | null; captureRootArtifactId: string; captureArtifactId: string; basisEventIds: readonly string[]; provenanceEventIds: readonly string[]; state: 'resolved' | 'pending' | 'conflict' | 'unavailable' }>>. This field belongs to the EffectiveAccounting result, not the reducer instance. It is optional only for backward compatibility with existing base consumers; this new s1 implementation always returns it. AMD-c66d49bb81925886-1 was explicitly approved and is applied to the effective HLD consumed by this LLD. The base HLD document remains unchanged; its approved amendment overlay supplies the field. No missing-HLD override is assumed.
For every selected effective contribution, emit a deterministic entry linking its callId and selected basisEventIds to effective rootArtifactId/artifactId/ownerVersion, immutable captureRootArtifactId/captureArtifactId and ordered provenanceEventIds (start/binding and validated committed transfer chain). Resolved entries and valid pending-transfer entries have nonnull effective owner/version; pending retains the original/current committed owner until transfer commits. Conflict/unavailable entries have null effective owner/version and explicit state; no ambiguous contribution is assigned by guesswork. Empty array means no observed contributions, not absent source usage; quality/closure states still distinguish legacy/missing.
Same-root single commitment and cross-root validated phase chain update these typed entries as well as token basis. Replayed commitment does not create another entry or charge. Failed/incomplete transfer proof cannot assign destination ownership. Consumers join basis IDs through this mapping and require its presence before grouping by artifact/root; global basisEventIds alone remain immutable observation references and are not attribution. Notices are diagnostics, never a machine ownership protocol.


```
interface EffectiveAccounting { readonly effectiveOwners?: ReadonlyArray<Readonly<{ callId: string; rootArtifactId: string | null; artifactId: string | null; ownerVersion: string | null; captureRootArtifactId: string; captureArtifactId: string; basisEventIds: readonly string[]; provenanceEventIds: readonly string[]; state: 'resolved' | 'pending' | 'conflict' | 'unavailable' }>> | undefined; }
```


## 4. Diagrams

- [ER model](docs/epics/retain-durable-artifact-token-usage-E20261026c66d49bb/S001/er-model.html)

## 5. Interaction with shared contracts

| Contract | Role | How |
| :--- | :--- | :--- |
| `sc1` | implements | Own the normalized logical/Avro schema, immutable source identity, validation and bounded UsageReducer. Preserve HLD public signatures; typed internal variants refine its generic context/observation/control fields. s2 consumes schema/equality/group rules for storage and its repository-wide index; s3 supplies transfer facts; s4 supplies trusted snapshot closures. No sibling IO/queries are implemented. |
| `sc2` | implements | Own binding/reservation evidence types and UsageAttributionPolicy for the approved activity table. Reuse canonical ArtifactIds syntax; s2 alone resolves existing/standalone/reserved roots, s3 persists explicit transfer changes and s4 applies the policies at daemon entry. This module never guesses actual repository ownership or instruments capture. |

## 6. Error paths

**Error cases**

- **Unsupported or malformed record at the trust boundary** (recoverable)
  - Detection: Inspect plain data descriptors before field access, then discriminate schemaVersion/recordKind and validate exact allowed fields and payload combinations against v1 schema.
  - Response: validate returns unsupported-version, unknown-kind or invalid-field code:path notices. reduce marks unsupported/conflict and cannot assert complete accounting for the group; no original record is rewritten.
  - User impact: Usage is explicitly unavailable/partial rather than measured zero; content remains usable.
- **Invalid canonical payload or digest** (recoverable)
  - Detection: Bounded canonical traversal detects accessor/custom prototype/cycle/undefined/invalid Unicode/nonfinite or unsafe scalar, or recomputed source digest differs from payloadDigest.
  - Response: Reject untrusted ingestion; reduction of retained malformed evidence returns explicit conflict. Do not invoke getters/toJSON or persist altered bytes.
  - User impact: Potentially forged/lossy data cannot become a trusted charge.
- **Conflicting event ID or second start under one call** (recoverable)
  - Detection: Canonical source comparisons find equal event IDs with different bytes, or the same callId has differing start context/owner/modelSlice under different event IDs.
  - Response: Exclude the ambiguous contribution and return identity-conflict with bounded reference IDs; identical source replay is a no-op. s2 applies the same rule repository-wide.
  - User impact: Replay cannot increase consumption or move a call to another root silently.
- **Unsafe counters or quality contradiction** (recoverable)
  - Detection: Numeric guards reject negative/fractional/unsafe values, known reasoning greater than known output, unavailable with nonnull counters, or estimate missing provenance.
  - Response: counter-invalid/quality-conflict notices; no unsafe JS arithmetic and no implicit unknown-to-zero conversion.
  - User impact: Totals retain exact trusted values and disclose malformed measurement.
- **Missing or forked/cyclic correction references** (recoverable)
  - Detection: Bounded predecessor/successor graph finds absent predecessor, multiple effective successors, cycle, mismatched call/capture owner/group or terminal finish without start.
  - Response: reference-missing or correction-conflict, retain originals and exclude ambiguous basis; never choose timestamps.
  - User impact: Correction history remains auditable and incomplete evidence cannot appear complete.
- **Invalid or stale aggregate/leaf reconciliation** (recoverable)
  - Detection: Selected/excluded candidate IDs are not disjoint/complete, reference stale corrected heads, cross invocation/modelSlice, conflict with capability coverage, or omit a newly observed candidate.
  - Response: overlap-unresolved/reconciliation-conflict; no summed aggregate plus leaves, guessed residual or fabricated call count.
  - User impact: Known disjoint groups remain usable while overlapping contribution is explicitly unresolved.
- **Invalid cumulative delta** (recoverable)
  - Detection: Baseline reference is absent/different session/model slice, required bucket is null, a bucket decreases or reset/model-change evidence exists.
  - Response: baseline-unavailable and unknown delta for affected buckets; never subtract across sessions or sum cumulative frames.
  - User impact: Reports disclose incomplete cumulative usage instead of inventing a count.
- **Bad activity attribution or binding evidence** (recoverable)
  - Detection: Closed normalized activity table and ArtifactIds parsing compare charged kind/subject, task/story/hash, reviewedArtifactId, BUILD and parent binding fields.
  - Response: attribution-invalid or binding-unresolved with no guessed root; reject CR/TASKS/reference charges and out-of-workflow background indexing.
  - User impact: Review/task/shared work remains charged exactly to the approved subject.
- **Incomplete/conflicting transfer closure** (recoverable)
  - Detection: Discriminate transfer mode first. Same-root validates one committed operation, equal effective roots, current binding/version and original observation; cross-root validates unequal roots and prepared/accepted/committed phase references. Detect mismatched mode/root, owner version, missing closure, fork/cycle or conflicting IDs.
  - Response: A valid same-root single committed operation changes effective owner once without phase receipts. Valid pending cross-root preparation retains original owner plus notice; unavailable/invalid required closure produces partial/conflict. No transfer IO or counters are copied.
  - User impact: An interrupted transfer cannot silently create two effective charges or hide the original consumption.
- **Group truncation or false completeness** (recoverable)
  - Detection: scope.evidence must carry trusted-service root watermark refs, expected unique eventIds, expected record count, canonical sorted event-set digest, source capability IDs and binding versions. Compare all received unique IDs/count/digest and required reference closure to that descriptor; a closure boolean alone is insufficient. Exclude replay duplicates from the unique count.
  - Response: closure-incomplete if descriptor missing/mismatched or the scope explicitly partial; return quality/notice that prevents a complete total. The pure module checks consistency, not the authority of service evidence; s4 authorizes requests and s2 constructs descriptors from committed snapshots.
  - User impact: A ledger page or omitted record cannot masquerade as the full accounting group.
- **Resource exhaustion, iterator failure or cancellation** (recoverable)
  - Detection: Incremental record/canonical-byte/node/reference limits trip before unbounded accumulation; upstream async iterator rejects/cancels while being consumed.
  - Response: Reject reduce with stable resource-limit or source-unavailable error and close the iterator in cleanup. No successful partial total or zero is returned; validate stays bounded and side-effect-free.
  - User impact: A large group must be queried with supported service evidence or surfaced as unavailable; reporting cannot silently truncate.
- **Unqualified source claims complete physical-call coverage** (recoverable)
  - Detection: Capability declaration lacks exact inspected version/evidence, declares unknown granularity or contradicts available model-call/invocation/cumulative fixture support.
  - Response: capability-unqualified/coverage-unknown; retain aggregate/unknown facts without asserting observed native physical count.
  - User impact: Users see the actual coverage boundary, independently of later instrumentation.

**Edge cases**

| Input | Expected |
| :--- | :--- |
| Identical event replay arrives with a different root-local sequence and service recordedAt. | Canonical source excludes only service-assigned fields; same source identity contributes once. Root/capture owner is still part of identity and must agree. |
| A failed/cancelled call has valid reported counters. | Retain its consumed known usage; outcome is not a reason to erase counters. |
| A valid explicit reported finish has all applicable buckets zero. | Measured zero is distinct from pending, unavailable, legacy and missing ledger. |
| Reported observation has a known output but an unknown input/cache bucket. | Known portion remains exact and partial quality remains visible; do not replace unknown buckets with zero. |
| An invocation aggregate is the only qualified evidence. | Keep invocation/model-slice totals with physical-call count unavailable; no fabricated leaf IDs/count. |
| A correction refines an unknown actual model within the same stable source model slice. | Preserve both observations, use explicit correction evidence and group by the corrected actual model only after validation; never silently equate requested and actual. |
| A correction/reconciliation is delivered before its predecessor/start. | Order independence holds once complete closure is supplied; until then return missing-reference/partial rather than discard it. |
| A valid transfer is same-root or destination-reference-only. | Only committed version-consistent mapping changes effective owner; references have no additive counters. |
| Empty records with a complete, authenticated service descriptor versus historical absence. | A validated observed empty group yields zero known/estimated with no fabricated call; legacy/no-ledger is explicitly flagged from scope evidence and is not measured zero. |
| The sum of valid per-observation safe counters exceeds Number.MAX_SAFE_INTEGER. | bigint accumulation and decimal-string results remain exact; no floating-point rounding. |

**Invariants to preserve**

- Existing ArtifactIds key shapes and syntax remain the canonical artifact identity contract; s1 adds usage validation without changing parentOf or root-resolution behavior. [[c1]]
- LLMResponse remains the provider abstraction; this story does not add native parsing, provider SDK types or change completion/embedding execution. [[c1]]
- The private lifecycle canonicalJson/content hash and separate design-corpus canonicalization keep their existing behavior; usage-specific source identity is not a content revision/hash mutation. [[c1]]
- Provider test fixture patterns are reused as evidence inputs; no claim is made that located provider tests already cover usage accounting. [[c2]]

## 7. Test strategy

**Test framework:** `node:test and node:assert/strict executed through tsx, matching the existing TypeScript provider/workflow *.test.ts conventions; no new test framework or live inference required.`

**Test levels**

- **unit** — Prove v1 trust-boundary validation and canonical source identity with adversarial inputs, not mirrored implementation assertions.
  - Subjects: `LedgerRecord local shape and payload digests`, `Exact counters/quality bounds`, `Canonical payload equivalence and safe data traversal`, `UsageAttributionPolicy activity/subject rules`
  - Fixtures: `src/workflow/usage/__tests__/validation.test.ts (proposed)`, `src/workflow/usage/__tests__/identity.test.ts (proposed)`, `src/workflow/usage/__tests__/attribution.test.ts (proposed)`, `Getter/toJSON traps, cyclic/nonplain/sparse input, unsafe/fractional/negative/overflow counters, reordered keys, replay with changed server metadata and changed owner under same ID`
- **unit** — Prove deterministic reference semantics, non-overlap, exact known/estimated partitions and pure owner-version evaluation.
  - Subjects: `UsageReducer bounded group reduction`, `Correction/reconciliation reference graphs`, `Cumulative interval basis and model/session baselines`, `Transfer reference-state evaluation`
  - Fixtures: `src/workflow/usage/__tests__/reducer.test.ts (proposed)`, `src/workflow/usage/__tests__/reconciliation.test.ts (proposed)`, `src/workflow/usage/__tests__/transfer-state.test.ts (proposed)`, `Golden numeric totals including safe-input sums above Number.MAX_SAFE_INTEGER; same-baseline cumulative snapshots must not add overlapping deltas; missing/different-session baseline is unknown; complete aggregate fallback/decomposition and newly arriving candidate invalidation`, `Seeded permutations of identical complete event sets; dangling refs, graph cycles/forks, competing transfer owner versions and retained source evidence`, `Positive same-root single transfer.committed fixture with null prepared/accepted refs changes artifact owner once; replay is idempotent. Wrong-root same-root mode, stale owner version and cross-root mode without receipts are negative fixtures.`
- **contract** — Freeze sc1/sc2 logical/Avro shape and documented source-capability limits without container IO, provider adapters or runtime capture.
  - Subjects: `Versioned JSON schema and Avro record type catalog`, `HLD-compatible public interfaces and unknown-version outcomes`, `SourceCapability evidence declarations`
  - Fixtures: `src/workflow/usage/__tests__/schema-contract.test.ts (proposed)`, `src/workflow/usage/__tests__/source-capabilities.test.ts (proposed)`, `src/workflow/usage/__tests__/fixtures/source-capabilities.v1.json (proposed)`, `Exact source revision/version and evidence refs for inspected provider fixtures; unknown CLI/native leaf coverage must remain unknown; external-host synthetic declarations are labeled synthetic`, `In-memory avsc record encode/decode of valid typed payloads with null defaults and exact counters; no file/header writer or DuckDB compatibility claim`, `Compiled-output smoke fixture imports proposed src/workflow/usage/index.ts production exports from built output with source-tree access removed; validate static JSON schema emission and Avro schema digest equality.`, `EffectiveAccounting optional field compatibility: old totals-only consumers remain structurally valid; new reducer always emits effectiveOwners, and a grouping consumer rejects absent attribution rather than deriving capture ownership.`
- **integration** — Exercise validated events and supplied binding/closure evidence through public domain APIs with an in-memory async iterator; no daemon/filesystem/provider implementation.
  - Subjects: `Validating and reducing shuffled/replayed golden groups`, `Complete versus truncated closure descriptors`, `Iterator error/cancellation and resource-bound outcomes`, `Input immutability and absence of sibling side effects`
  - Fixtures: `src/workflow/usage/__tests__/domain-contract.test.ts (proposed)`, `Expected event-count/set-digest descriptors, >1024-record/8-MiB inputs, iterator that rejects midstream, deep-frozen inputs`, `Complete group fixture with LLD design review, TASK validation and BUILD code-review charged subjects; CR/TASKS reference-only records never contribute`

**Acceptance mapping**

| Criterion | Proving tests |
| :--- | :--- |
| `ac1` | `src/workflow/usage/__tests__/identity.test.ts: identical source replay with different service sequence/time contributes once; a true retry with distinct callId counts separately; source identity includes capture owner.`, `src/workflow/usage/__tests__/attribution.test.ts: table-driven DEF/HLD/LLD/PLAN/TASK/BUILD/ISSUE/SPEC/context positive cases and wrong-subject/kind/task/story/review/BUILD negative cases; CR/TASKS/summary references add no charge.` |
| `ac2` | `src/workflow/usage/__tests__/validation.test.ts: explicit reported zero differs from unavailable/pending/legacy/estimated; negative/fractional/unsafe counters and reasoning greater than output are rejected.`, `src/workflow/usage/__tests__/reducer.test.ts: disjoint cache/output arithmetic, reasoning subset, exact bigint overflow boundary and known-plus-estimated-plus-unknown partitions match golden expectations.` |
| `ac3` | `src/workflow/usage/__tests__/reconciliation.test.ts: immutable correction replacement, aggregate fallback, complete-leaf decomposition and newly observed/stale candidates never double count or manufacture residuals.`, `src/workflow/usage/__tests__/reducer.test.ts: one cumulative endpoint/baseline interval is selected; same-baseline snapshots are not summed; reset/session/model mismatches yield unknown.` |
| `ac4` | `src/workflow/usage/__tests__/identity.test.ts and src/workflow/usage/__tests__/validation.test.ts: conflicting event/call identities are visible without mutating input.`, `src/workflow/usage/__tests__/reconciliation.test.ts: missing refs, two successor corrections, cycles, stale heads and overlapping selected/excluded lists cannot produce a claimed complete contribution.`, `src/workflow/usage/__tests__/domain-contract.test.ts: truncated expected event-set closure or iterator failure cannot yield a successful complete total.` |
| `ac5` | `src/workflow/usage/__tests__/transfer-state.test.ts: a positive same-root single committed control operation with null phase refs changes effective artifact once; equal replay does not charge again, and missing prepared/accepted records are not errors for same-root mode.`, `src/workflow/usage/__tests__/transfer-state.test.ts: prepared/accepted/committed references change effective owner only once after valid version-consistent closure; original source owner/reason remain traceable.`, `src/workflow/usage/__tests__/transfer-state.test.ts: destination reference alone, missing source, competing versions, transfer cycle/fork and replay stay pending/conflict/duplicate as appropriate, never copied counters.`, `src/workflow/usage/__tests__/transfer-state.test.ts: typed effectiveOwners exposes root/artifact/version/capture owner/basis/provenance for same-root and cross-root commits; pending retains current committed owner, unresolved ownership is null, and replay is idempotent.` |
| `ac6` | `src/workflow/usage/__tests__/source-capabilities.test.ts: checked-in source survey records exact inspected versions/revisions and refs, native input/cache/reasoning conventions and granularity/call-count support; unavailable knowledge is explicitly unqualified/unknown.`, `src/workflow/usage/__tests__/source-capabilities.test.ts: CLI invocation aggregate, cumulative session and synthetic external-host fixture cannot assert complete native physical-call coverage; no TU2/TU3 adapter is needed.`, `src/workflow/usage/__tests__/schema-contract.test.ts: logical and Avro record fixtures preserve nullable counters/model identity and explicit granularity/source evidence.` |

## 8. Migration

**State before:** Original pre-build baseline: s1 analyze bundles c1/c2 locate LLMResponse, canonical identity helpers, private lifecycle canonicalJson and a separate design-corpus canonicalJson, plus provider counter sites/test fixtures. They do not establish a shared immutable usage-domain API or complete native source visibility; absence of graph hits is not an exhaustive absence proof. Existing artifact/provider/content-hash APIs remain the current contracts, and no production TU1 Avro ledger is claimed to exist.

Current implementation baseline (2026-10-26, build in progress): accepted task t1 commit fddd2fc66 added src/workflow/usage/types.ts, the type-only index.ts and compiler fixtures; accepted t2 commit 8d729ba23 added schemas.ts and both ledger-record.v1 schema files. Task t3 commit 5b88059fc added canonical.ts and identity tests; its original allocation promise failed validation and its object-boundary revision remains unaccepted. Extend and qualify these existing foundations; do not recreate them. Validation, attribution, capabilities and reducer runtime implementations remain to be built in t4-t10; t11 publishes the complete runtime barrel. None of this is a completed usage ledger or live capture service.

**State after:** Add internal-shared sc1/sc2 usage types, closed v1 logical/Avro record schema, strict source identity/validation, bounded reducer, attribution policy and source-capability contract fixtures. Later siblings consume these exports; s1 has no storage side effects, runtime capture, daemon activation or hierarchy/board behavior. The optional EffectiveAccounting.effectiveOwners field is approved through AMD-c66d49bb81925886-1 and included in the effective HLD.

**Zero downtime:** yes — **Data rewrite:** no

**Steps**

1. Extend and qualify the already-present t1/t2/t3 foundation files listed in the current implementation baseline; add remaining validation/attribution/capability/reducer modules and complete the runtime barrel without changing artifact/provider/content hash APIs or registration paths. — ↩ rollbackable
2. Qualify the closed schema, identity/reconciliation/transfer and attribution semantics with the six-criterion fixture matrix and explicit source-evidence survey. Keep all code paths free of persistence or live provider calls. — ↩ rollbackable
3. Publish the accepted sc1/sc2 contract and compatibility notes for s2/s3/s4. No existing data is backfilled or converted. Any later incompatible contract change must return to the owning story/HLD process before consumers adopt it. — ↩ rollbackable

**Backward compat:** No existing public API changes or artifact JSON rewrites. Preserve ArtifactIds, LLMResponse and contentHash behavior. Missing historical usage remains not-recorded, not zero. Draft PRD/mock exports are illustrative and are not silently relabeled as the runtime v1 Avro contract. Once consumers or persisted records exist, rollback cannot delete those records; disable later activation and retain compatible readers instead. The optional typed owner field preserves existing totals-only consumers; new attribution/grouping consumers must treat an absent field as unavailable. Adoption uses approved AMD-c66d49bb81925886-1.

## 9. Alternatives considered

### 9.1 a1: Closed typed events with bounded deterministic group reduction — **CHOSEN**

A versioned discriminated event model, pure validators and one reducer over a complete bounded accounting group.

Refine HLD sc1/sc2 with closed v1 usage/control payloads and immutable binding evidence. Define canonical source-payload equality, exact counter partitions, explicit observation/reconciliation/transfer references and machine-readable errors. Validate known version and attribution at entry, and return bounded effective evidence rather than mutate history.

Use one deterministic reducer for a complete call/invocation-model group supplied by later snapshot/index services. Reject oversized groups or report incomplete closure explicitly. Reuse ArtifactIds for syntax/kind validation; do not couple pure accounting to provider parsing, artifact content persistence, design-corpus canonicalization or DuckDB.

### 9.2 a2: Typed event model with a rule-object registry

Keep the same v1 facts but dispatch validation and reduction through independently registered kind rules.

Represent the HLD event envelope and immutable normalized payloads as typed records, then register one validation/reduction rule object for each event/control kind. A rule scheduler resolves dependencies before producing effective accounting under the same bounded closure and attribution rules.

Only built-in rules would be enabled; this alternative does not add external providers or persistence. Binding and source-capability validators remain pure, with caller-supplied schema versions explicitly gated.

**Rejected because:** Meets the contracts but introduces registration/scheduling risks and tests with no current extensibility requirement.

## 10. References

- **[[c1]]** `analyze-bundle` `s1.analyzeBundles[0]`
- **[[c2]]** `analyze-bundle` `s1.analyzeBundles[1]`
- **[[c3]]** `prior-artifact` `docs/epics/retain-durable-artifact-token-usage-E20261026c66d49bb/HLD.md`
- **[[c4]]** `code` `src/shared/types.ts:61-87`
- **[[c5]]** `code` `src/agent/providers/ollama.ts:450-497`
- **[[c6]]** `code` `src/workflow/artifact-core/lifecycle.ts:96-104`
- **[[c7]]** `code` `src/design/corpus/canonical.ts:23-84`
- **[[c8]]** `convention` `AGENTS.md`
- **[[c9]]** `doc` `docs/model-token-usage-prd.html#ownership`
- **[[c10]]** `doc` `docs/model-token-usage-prd.html#counting`
- **[[c11]]** `doc` `docs/model-token-usage-prd.html#schema`
- **[[c12]]** `step-output` `s4`
- **[[c13]]** `code` `src/workflow/artifact-ids.ts`
- **[[c14]]** `prior-artifact` `docs/epics/retain-durable-artifact-token-usage-E20261026c66d49bb/DEF.md`
- **[[c15]]** `doc` `tsconfig.json`
- **[[c16]]** `code` `copy-assets.mjs`
- **[[c17]]** `prior-artifact` `.insrc/artifacts/AMD-c66d49bb81925886-1.json`

<!-- insrc:review -->

## Review

### ⚠️ Review `WARN` — design.story (design.story)

**0 do not hold · 1 could not be verified · 10 hold** · template `design-spec` · model `cli-codex:gpt-6.1-sol` · reviewed 2026-10-26T14:42:22.139Z

Only a premise that does not hold blocks approval. One that could not be verified is listed for the reader and does not block.

#### Does not hold (blocks approval)

_None._

#### Could not verify (does not block)

| Check item | Premise | What was tried and what was missing | Action |
| --- | --- | --- | --- |
| change-sites | The linked ER companion renders correctly. | Inspected the embedded Mermaid source and rendering/bootstrap code. Attempted to open the local companion through the in-app browser, which returned 'Browser is not available: iab'. Actual Mermaid execution, layout and clipping could not be verified. [files: docs/epics/retain-durable-artifact-token-usage-E20261026c66d49bb/S001/er-model.html] | Render the existing companion in an available browser and inspect its layout and consistency. |
