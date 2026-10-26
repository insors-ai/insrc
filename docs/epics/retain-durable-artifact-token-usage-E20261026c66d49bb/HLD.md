<!-- insrc:artifact HLD-c66d49bb81925886 -->

# HLD: retain-durable-artifact-token-usage

## Summary

TU1 adds an independent usage-accounting service owned by the daemon. One append-only Avro ledger per canonical work root retains the root's and descendants' immutable observations; artifacts remain ordinary content documents. A deterministic reducer explains effective usage, while durable appends, explicit ownership bindings and committed snapshots make the foundation consumable by later capture and DuckDB reporting work.

## Contents

1. [Problem context](#1-problem-context)
2. [Framework summary](#2-framework-summary)
3. [Architecture shape](#3-architecture-shape)
4. [Diagrams](#4-diagrams)
5. [Shared contracts](#5-shared-contracts)
6. [Story boundaries](#6-story-boundaries)
7. [Non-functional targets](#7-non-functional-targets)
8. [Rollout](#8-rollout)
9. [Alternatives considered](#9-alternatives-considered)
10. [References](#10-references)

## 1. Problem context

> See **DEF-c66d49bb81925886** § 1. Problem

## 2. Framework summary

Choose a1: per-root Avro event sourcing with a recovery-only append intent and committed checkpoint. All components and usage.* interfaces below are PROPOSED additions, not claims of existing implementation. Reuse existing ArtifactIds/envelope contracts, daemon repository-service ownership and the bounded Avro-to-Parquet query path; do not reuse artifact JSON writes as ledger commits. Approved DEF revision 7 and its human review override remain the upstream scope. Four stories own domain semantics, persistence/root resolution, lifecycle/transfer and daemon access respectively. TU2/TU3 capture, TU4 hierarchy aggregation and TU5 board remain outside this epic.

## 3. Architecture shape

Existing boundaries and evidence:
- src/workflow/artifact-ids.ts:190-200 only supplies TASK/TASKS/DIAG -> STORY and STORY -> EPIC. Optional envelope.parent in src/workflow/artifact-core/types.ts and src/workflow/artifact-core/decode.ts is not a complete document/standalone usage-root resolver.
- src/daemon/lifecycle-registry.ts owns repository artifact content services; src/workflow/artifact-core/journal.ts stages artifact heads, not Avro blocks, and its writeAtomic use is not proof of fsync durability.
- src/daemon/db/drivers/duckdb-file.ts routes Avro through a converter and read_parquet; src/daemon/db/duckdb-pool.ts is in-memory and disables automatic extension loading. avsc already appears in package.json. None establishes the new appender/snapshot protocol.

Proposed placement and dependency direction:
A pure accounting domain under a proposed new usage-accounting area (exact files belong to LLDs) owns event validation, identity and reduction; a new daemon-owned usage repository service composes filesystem persistence, canonical ownership evidence and existing content readers. Proposed IPC handlers call this service; CLI/MCP/IDE never open usage files. Snapshot consumers can invoke the existing daemon DB converter/query interfaces. The domain never imports providers, board code or DuckDB; storage never calls an LLM. Exact file layout is finalized in each LLD.

Storage and relationships:
A registered repository owns 0..N RootLedger objects; each RootLedger has exactly one rootArtifactId, immutable incarnation UUID and canonical <repo>/.insrc/usage/<rootArtifactId>/events.avro. A root contains 0..N LedgerRecords, each physically belonging to exactly one root. Each usage record names exactly one chargedArtifactId; a charged artifact has 0..N observations. Physical container membership is capture-time provenance; effective owner changes only through explicit transfer facts. Artifact JSON stores no usage arrays or duplicated totals.
An epic resolves to EPIC identity. A standalone work item resolves from its explicit standalone/owner binding, not by blindly climbing STORY -> EPIC. ISSUE/SPEC is a root only when independently owned. Document kinds (DEF/HLD/LLD/PLAN/BUILD/CR/TESTS) require explicit workflow subject/binding evidence. An ISSUE corrects/reference link never changes its root. Resolution checks registered canonical repo, ID syntax, actual envelope/workflow owner consistency and acyclic binding ancestry; missing, contradictory or multiple candidates produce unresolved/conflict, never a hash-prefix guess.
Reservation binds a stable intended root and artifact to an authorized daemon workflow/run before document creation. Its immutable control record is in the root ledger and is non-billable. Attachment checks the later artifact against the reservation; mismatches remain conflicts. Reservations do not mint an artifact body, approval or registry entry.

Record and schema contract:
All records contain schemaVersion, eventId, rootArtifactId, artifactId, sequence, recordedAt, recordKind and canonical payload digest. Usage starts additionally contain callId, logicalRequestId, optional invocation/parentCall IDs, run/step/activity/review context and requested/reported model/source/granularity; outcomes/corrections reference the same call/owner. Control kinds cover root/artifact reservation, binding reconciliation, batch commit and transfer phases and never contribute tokens. sequence is root-local allocation order; eventId/callId are stable source identities and never derived from array offsets or wall clock. Caller payload equality excludes server-assigned sequence/recordedAt; retries with the same eventId and canonical source payload return the original receipt, while differing source payloads are conflicts.
The physical v1 Avro writer schema is a named typed record with additive nullable/defaulted context, measurement and control records. Counters and sequences are nonnegative signed-long values restricted to safe integers at the JS boundary; aggregate arithmetic uses bigint internally and decimal strings on IPC. No raw prompts/completions or provider secrets. Use null codec initially, bounded blocks and avsc for qualified schema/record coding; do not assume createFileEncoder safely reopens an existing container. s2 owns reopen/header/sync/framing qualification. All records in a container use its header writer schema; schemaVersion tags do not permit mixed writer schemas. Unsupported schema is read-only/unavailable; incompatible changes require an approved migration and byte-preserving backup/export, not automatic rotation or rewrite.

Accounting:
Each physical attempt has one callId; model retries use distinct call IDs under the logical request, transport retries reuse event IDs. Known zero differs from no ledger, missing expected ledger, pending start, interrupted/unavailable finish, estimate, unsupported schema and malformed/conflicting history. Normalize uncached input, cache read/write and output as disjoint buckets; reasoning is an output subset. Finished observations, corrections and reconciliation are immutable. A correction points to the preceding observation of the same call/owner/model slice; only one unambiguous valid chain contributes, with missing refs, forks, cycles and conflicting IDs surfaced. Never silently select a timestamp winner.
An invocation/model accounting group declares model-call, invocation-total or cumulative-snapshot granularity. Aggregate-only evidence has unknown physical-call count. Overlapping aggregate and leaves remain unresolved until an explicit reconciliation selects one validated basis. Partial leaf coverage does not subtract guessed residuals or silently exclude a known aggregate; the reducer returns separate evidence/coverage and unresolved overlap. Cumulative deltas require a durable matching session/model baseline; resets or gaps are unknown. Pure reduction returns exact known/estimated partitions plus notices; story/epic subtree sums are TU4.

Repository-wide identity gate:
A repository-scoped identity gate precedes root writer locks (and ordered multi-root locks) for all append, import and transfer operations. It checks eventId source-payload equality and callId capture ownership across every root, not just the requested file. A new root cannot accept a second start for an existing callId; relocation uses explicit transfer references. Conflicting replay under another root is rejected or quarantined with no second charge.
The gate uses a bounded-memory, rebuildable disk-backed identity/binding index owned by s2. This is derived from verified root commit watermarks, not another canonical ledger. Index state carries its root-watermark coverage vector; after a crash, changed roots are replayed and any conflict blocks new writes until resolved. A missing/stale index never authorizes duplicate acceptance. Index rebuild cost and disk use are measured separately from the 128 MiB service-buffer target. No caller can bypass this gate, including maintenance/import paths.

Append and recovery sequence:
The daemon repository service holds one serialized root writer and a cross-process ownership guard; the usual daemon singleton is not a substitute for guarding maintenance/import writes. A second writer is refused. Lock reclamation requires verified owner death/incarnation, not a PID or age heuristic alone. Root paths are ID-derived, containment/realpath checked and reject symlink escapes. Root directory/header creation and parent directories are synced before acknowledgment.
For each bounded append, validate IDs/bindings/semantics and expected checkpoint; allocate sequence under the lock; durably stage pending intent with operation ID, prior incarnation/offset/digest and exact block bytes; append a complete Avro block containing the batch's records and a non-billable batch.commit integrity record; fsync events.avro; atomically replace and sync checkpoint (incarnation, acknowledged sequence/end offset, chained digest); then return the durable receipt. Clear/sync the intent after commit; a crash before acknowledgment may still leave a committed batch, so retry returns its original receipt without another charge.
Recovery runs before reads/writes. Validate header, schema, checkpoint and committed prefix integrity. Ledger shorter than committed offset or changed committed bytes is corruption and blocks complete reporting. Exact already-committed intent is cleared. A valid staged extension is completed idempotently; a torn suffix beyond the committed offset is preserved for diagnostics outside canonical history and repaired only from the matching durable intent. An unexplained valid suffix or mismatching intent is a conflict, not discarded. Loss/malformed checkpoint produces explicit recovery-required, not blind reconstruction that might hide truncation. Rebuild requires a verified export/expected commit proof. Journal/checkpoint contain recovery metadata and staged bytes only; all accepted facts live in events.avro. Neither artifact writeAtomic nor Avro flush alone qualifies this protocol.

Snapshots and queries:
A root watermark is incarnation + acknowledged sequence/end offset + chained digest. Paged reads bind an opaque cursor to that watermark and filters. Under a short root lease, validate the committed prefix and pin its exact byte boundary, then copy only immutable committed bytes to a daemon-owned private temp snapshot with bounded IO and digest validation; release lock before expensive DuckDB conversion. No raw client path is accepted. In-progress tail bytes are never scanned; a WHERE sequence <= watermark clause is not a physical snapshot. Snapshot and derived cache identity include canonical repo, root incarnation, end offset, digest and conversion/schema version, not only mtime/length. Lease expiry, reader cancellation or daemon restart releases/cleans temp data; source watermark remains reproducible while retained. Multi-root snapshots record a watermark vector under deterministically ordered root leases, including transfer reference closure.
Initial compatibility uses existing bounded Avro conversion to disposable Parquet and in-memory DuckDB. Direct read_avro is optional only after explicit trusted extension provisioning before pool lockdown and exact platform/offline/schema qualification; no automatic extension install from caller SQL. TU1 tests decoded committed records through an existing query path; it does not implement hierarchical reports. TU4 consumes reducer semantics before aggregating and may add rebuildable analytical indexes. No second persistent DuckDB database.

Lifecycle, import and transfer:
Content regeneration, revision, review and approval never touch ledger bytes. Usage appends never write artifact JSON or change its content hash/signoffs/status. Combined export carries artifact references and exact root ledger/header/checkpoint/watermark metadata; artifact-only export explicitly marks missing usage. Import validates root identity/schema/digests and appends original event identities through the daemon; it never concatenates headers, text-merges binary files or trusts file timestamps. Same IDs/different content remain a visible quarantined conflict. Supersession/deletion retains the accounting root or explicit tombstone; retention cannot silently reduce history. No automatic event deletion or compaction in v1.
Cross-root transfer uses a stable transferId and the source root as coordinator. Source transfer.prepared references original call/observation and expected owner version; destination transfer.accepted references that source event without copying counters; source transfer.committed references the exact destination acceptance. Acquire root locks in ID order, durably record each phase and recover/replay by transferId. Only a validated committed pair changes effective ownership; incomplete preparation leaves original charge and a pending notice. Consumers resolve source evidence once from a snapshot vector containing both roots; unavailable closure yields partial/conflict, not a complete destination total. Competing transfer versions or chains/forks are explicit conflicts. Future calls can bind to the destination, while historical physical records remain in their original file. Same-root reassignment uses one committed control operation.

Visual scope:
The ER definition documents storage/charging/transfer cardinality. Append ordering, snapshot interaction and coordinated transfer phases are specified above as ordered prose; no UI changes occur in TU1, so no new UX mock is needed.

Mandatory activity-to-charged-artifact policy (owned by s1, sc2):
| Supplied activity | Required charged artifact | Validation assertion |
| --- | --- | --- |
| Definition authoring/review | Subject DEF | All rounds charge that definition once; independent ISSUE/SPEC framing uses its subject ISSUE/SPEC. |
| Epic architecture authoring/review | Subject HLD | Charge the authored/reviewed HLD at the epic root, without copying its usage to each story. |
| Story design, revisions and design review | Reviewed/authored LLD | Every LLD review round charges the same subject LLD; review-record IDs are non-charging references. |
| Plan generation/refinement | Subject PLAN | PLAN usage is distinct from task implementation; task-list/BUILD summaries cannot duplicate it. |
| Task implementation, repair, probes and task validation | Specific TASK | Task ID and its owning story must agree with binding evidence. TASKS and BUILD references do not add another charge. |
| Shared story validation or post-build code review | Story BUILD | CR references that BUILD and call ID; CR never stores a second charged observation. Do not copy shared work into each TASK. |
| Nested context/analyze work | Explicit parent workflow activity's charged artifact | Require the parent dispatch binding; causal links are not extra charges and background indexing is excluded. |

s1 owns the pure attribution-policy validator and negative fixtures; s2 resolves and verifies canonical subject/task/BUILD evidence, and s4 applies those validators to supplied requests. TU1 validates caller-supplied activity, exact subject and binding; it does not discover dispatch sites or instrument providers/hosts. Automatic attribution at dispatch is TU2/TU3. Missing/mismatched reviewed subject, task/story, BUILD, parent context or required evidence is rejected/unresolved, never silently reassigned to the root. Activity names are normalized domain tags, not loose matches on a workflow step name.

Acceptance-to-test matrix (planned qualification; no test is claimed implemented or passed):

| DEF criterion | Owner story | Planned fixture/check | Expected assertion |
| --- | --- | --- | --- |
| s1/ac1 | s1 | attempt-and-replay-identity | Transport duplicate returns the same event; distinct model retry has a new callId; wrong charged kind/subject is rejected by the complete attribution table, including CR-to-BUILD references. |
| s1/ac2 | s1 | counter-and-quality-partitions | Reported zero, estimate, unavailable, pending and legacy remain distinct; invalid/overflow counters fail; cache/reasoning buckets add once. |
| s1/ac3 | s1 | correction-and-overlap-basis | Corrections preserve originals; aggregate-only, full leaf decomposition and partial overlapping leaves select one explicit valid basis or remain unresolved. |
| s1/ac4 | s1 | conflict-reference-graphs | Different payload/same identity, missing target, fork and cycle are visible and never inflate complete totals. |
| s1/ac5 | s1 | effective-owner-versioning | Same-root and cross-root transfer rules produce one unambiguous owner and retain prior-owner/reason provenance. |
| s1/ac6 | s1 | source-capability-contract-survey | For existing Ollama/CLI response contracts and an external-host capability-declaration fixture, record inspected version/source evidence and whether leaf calls, invocation/model totals, cumulative values or no counters are observable. Source adapters are not built here. Unknown native capability stays unknown; aggregate evidence never asserts physical-call completeness. Replay recorded sanitized contract envelopes without live parallel calls; source version/semantics must accompany each fixture. |
| s2/ac1 | s2 | durable-root-roundtrip | Root and descendant facts recover exactly once from the same events.avro after durable receipt and process restart. |
| s2/ac2 | s2 | commit-boundary-faults | Inject failure at directory/header, intent, block append/fsync, checkpoint replace/sync and cleanup; acknowledged prefix survives; mismatching suffix/interior corruption is explicit; simultaneous replay and cross-root ID attempts cannot double charge. |
| s2/ac3 | s2 | reserved-root-child-creation | Reserve stable root/child before content, restart, create valid content and reconcile once; no JSON body/approval fabrication or second final ledger. |
| s2/ac4 | s2 | interrupted-start-recovery | A durable start without usable finish remains pending/interrupted/unavailable, not zero. |
| s2/ac5 | s2 | recording-failure-producer-contract | Distinguish before-ack failure, committed-but-response-lost and pending recovery; replay recording safely; assert no instruction or side effect reruns inference. |
| s3/ac1 | s3 | content-byte-independence | Append usage to approved/signed-off subjects; compare artifact bytes, content hash/revision and approval/signoff exactly before/after. |
| s3/ac2 | s3 | lifecycle-and-paired-export | Regeneration/codecs/lifecycle leave ledger bytes unchanged; paired export/import retains accepted facts and artifact-only exports disclose missing usage. |
| s3/ac3 | s3 | retained-supersession-history | Rejected/cancelled/superseded subjects retain attributable consumption; successor references do not duplicate charges. |
| s3/ac4 | s3 | binary-branch-event-union | Import distinct branch events and an identical replay through daemon APIs; retain each once, reject conflicting IDs without timestamp/text-merge winners. |
| s3/ac5 | s3 | legacy-and-schema-compatibility | No-ledger legacy and unsupported writer/record schema preserve content usability and untouched source bytes; quality is explicit, never complete zero. |
| s3/ac6 | s3 | cross-root-transfer-crashes | Fail between source prepare, destination acceptance and source commit; deterministic recovery and snapshot closure retain source evidence and one effective owner; unresolved closure stays partial. |
| s4/ac1 | s4 | scoped-service-roundtrip | Registered repo producer can resolve/append/page via daemon contracts; committed/duplicate/pending-recovery/conflict/unsupported outcomes are explicit and clients never open files. |
| s4/ac2 | s4 | scope-and-path-refusals | Invalid ID, wrong repo, mismatched subject/root, ambiguous owner, symlink escape and arbitrary path cannot modify unrelated data or fabricate attribution. |
| s4/ac3 | s4 | watermark-paging-consistency | Traverse every record once at a pinned watermark while writes append later; expired/mismatched cursors fail explicitly; boundaries agree with snapshot bytes. |
| s4/ac4 | s4 | operational-diagnostics | Inspect/retry recovery, unsupported schemas and merge/retention conflicts; no silent history truncation or approval change. |
| s4/ac5 | s4 | standalone-foundation-acceptance | Run foundation fixtures without provider capture, host reporting, hierarchy/board or live inference; preserve existing inference policies. |
| s4/ac6 | s4 | scale-schema-query-qualification | Measure agreed scale/memory/append/recovery limits; reopen/schema/default/overflow fixtures and exact committed-prefix decoding through current Avro converter plus in-memory DuckDB must agree with source records. No uncontrolled live-tail read or assumed native extension. |

Fixture names identify acceptance obligations, not an implementation task list. Each Story LLD owns concrete test paths and setup; implementation must retain this complete 23-criterion mapping. s1 attribution fixtures cover LLD reviews, TASK execution/validation, BUILD shared validation/code-review, noncharging CR/TASKS/BUILD summaries and mismatched-owner refusals. Source-capability qualification records evidence limits without importing TU2/TU3 capture implementation into TU1.


## 4. Diagrams

- [ER model](docs/epics/retain-durable-artifact-token-usage-E20261026c66d49bb/er-model.html)
- [Sequence diagram](docs/epics/retain-durable-artifact-token-usage-E20261026c66d49bb/sequence-diagram.html)
- [Component dependencies](docs/epics/retain-durable-artifact-token-usage-E20261026c66d49bb/component-dependency.html)

## 5. Shared contracts

### 5.1 sc1: Immutable ledger record and accounting reducer

**Owner Story:** `s1`
**Consumed by:** `s2`, `s3`, `s4`

**Purpose:** Versioned normalized usage/control facts, stable identity, non-overlap, correction/transfer semantics, quality states and exact accounting basis; schema and reducer owned before persistence.

**Interface sketch (type-level):**

```
type UsageQuality = 'reported' | 'estimated' | 'pending' | 'unavailable' | 'legacy' | 'missing' | 'unsupported' | 'conflict';
interface LedgerRecord { readonly schemaVersion: 1; readonly eventId: string; readonly rootArtifactId: string; readonly artifactId: string; readonly sequence: number; readonly recordedAt: string; readonly recordKind: string; readonly callId: string | null; readonly payloadDigest: string; readonly context: Readonly<Record<string, unknown>> | null; readonly observation: Readonly<Record<string, unknown>> | null; readonly control: Readonly<Record<string, unknown>> | null; }
interface EffectiveAccounting { readonly knownTokens: string; readonly estimatedTokens: string; readonly quality: readonly UsageQuality[]; readonly basisEventIds: readonly string[]; readonly notices: readonly string[]; }
interface UsageReducer { validate(record: LedgerRecord): readonly string[]; reduce(records: AsyncIterable<LedgerRecord>, scope: Readonly<Record<string, unknown>>): Promise<EffectiveAccounting>; }
```

**Assumptions cited:** [[c1]] [[c2]] [[c3]]

### 5.2 sc2: Canonical usage ownership and reservation types

**Owner Story:** `s1`
**Consumed by:** `s2`, `s3`, `s4`

**Purpose:** Root/charged identity, explicit binding evidence, stable reservation and transfer preconditions; shared model is foundational even though resolution/persistence is s2. Own and validate the mandatory activity-to-subject attribution table, including noncharging CR/TASKS/BUILD references.

**Interface sketch (type-level):**

```
interface UsageBinding { readonly repo: string; readonly rootArtifactId: string; readonly artifactId: string; readonly workItemId: string; readonly workflowRunId: string; readonly version: string; readonly provenance: 'stored-owner' | 'workflow-reservation' | 'committed-transfer'; }
type BindingResolution = { readonly kind: 'resolved'; readonly binding: UsageBinding } | { readonly kind: 'unresolved' | 'conflict'; readonly reasons: readonly string[] };
interface BindingRequest { readonly artifactId: string; readonly workflowRunId: string; readonly expectedRootId?: string | undefined; readonly subjectId?: string | undefined; }
interface UsageAttributionInput { readonly activity: string; readonly chargedArtifactId: string; readonly subjectArtifactId: string; readonly reviewedArtifactId?: string | undefined; readonly taskId?: string | undefined; readonly storyBuildId?: string | undefined; readonly parentBinding?: UsageBinding | undefined; }
interface UsageAttributionPolicy { validate(input: UsageAttributionInput): readonly string[]; }
```

**Assumptions cited:** [[c16]]

### 5.3 sc3: Durable root ledger and binding service

**Owner Story:** `s2`
**Consumed by:** `s3`, `s4`

**Purpose:** Exclusive root writers, durable append/receipts, canonical root resolution/reservation and explicit recovery outcomes without inference or artifact-content mutation.

**Interface sketch (type-level):**

```
interface RootWatermark { readonly rootArtifactId: string; readonly incarnation: string; readonly sequence: number; readonly endOffset: string; readonly digest: string; }
type AppendResult = { readonly kind: 'committed' | 'duplicate'; readonly watermark: RootWatermark; readonly eventIds: readonly string[] } | { readonly kind: 'recovery-required' | 'conflict' | 'unsupported' | 'rejected'; readonly reasons: readonly string[] };
interface RootLedgerService { resolveBinding(request: BindingRequest): Promise<BindingResolution>; reserve(request: BindingRequest): Promise<BindingResolution>; append(binding: UsageBinding, events: readonly Readonly<Record<string, unknown>>[]): Promise<AppendResult>; recover(rootArtifactId: string): Promise<AppendResult>; }
```

**Assumptions cited:** [[c3]] [[c8]] [[c16]]

### 5.4 sc4: Committed snapshots and bounded record access

**Owner Story:** `s2`
**Consumed by:** `s3`, `s4`

**Purpose:** Physical committed-prefix snapshots, root watermark vectors, scoped cursors and cleanup leases; consumers never read an uncontrolled live tail.

**Interface sketch (type-level):**

```
interface UsageSnapshot { readonly snapshotId: string; readonly watermarks: readonly RootWatermark[]; readonly expiresAt: string; }
interface UsagePage { readonly records: readonly LedgerRecord[]; readonly nextCursor: string | null; readonly snapshot: UsageSnapshot; readonly notices: readonly string[]; }
interface UsageSnapshotService { acquire(rootIds: readonly string[]): Promise<UsageSnapshot>; read(snapshotId: string, cursor: string | null, limit: number): Promise<UsagePage>; release(snapshotId: string): Promise<void>; }
```

**Assumptions cited:** [[c3]] [[c18]]

### 5.5 sc5: Lifecycle-independent export/import and attribution transfer

**Owner Story:** `s3`
**Consumed by:** `s4`

**Purpose:** Paired portable history, binary-safe event union, retained accounting roots and recoverable transfer references across roots.

**Interface sketch (type-level):**

```
interface TransferRequest { readonly transferId: string; readonly sourceRootId: string; readonly destinationRootId: string; readonly callId: string; readonly destinationArtifactId: string; readonly expectedBindingVersion: string; readonly reason: string; }
interface TransferResult { readonly kind: 'committed' | 'duplicate' | 'pending' | 'conflict'; readonly transferId: string; readonly watermarks: readonly RootWatermark[]; readonly notices: readonly string[]; }
interface UsageLifecycleService { transfer(request: TransferRequest): Promise<TransferResult>; exportSnapshot(snapshotId: string): Promise<{ readonly exportId: string; readonly manifestDigest: string }>; importExport(exportId: string): Promise<AppendResult>; retainRoot(rootArtifactId: string, reason: string): Promise<AppendResult>; }
```

**Assumptions cited:** [[c3]] [[c16]]

### 5.6 sc6: Daemon usage access and query compatibility boundary

**Owner Story:** `s4`

**Purpose:** Registered-repository-scoped append/read/diagnostics adapters and acceptance evidence for committed Avro snapshots through the existing DuckDB converter path. Does not implement provider instrumentation, controller telemetry or hierarchy aggregates.

**Interface sketch (type-level):**

```
interface UsageDaemonApi { resolve(request: BindingRequest): Promise<BindingResolution>; append(request: { readonly binding: UsageBinding; readonly events: readonly Readonly<Record<string, unknown>>[] }): Promise<AppendResult>; snapshot(request: { readonly rootIds: readonly string[] }): Promise<UsageSnapshot>; page(request: { readonly snapshotId: string; readonly cursor: string | null; readonly limit: number }): Promise<UsagePage>; diagnostics(request: { readonly rootId: string }): Promise<{ readonly state: string; readonly notices: readonly string[]; readonly watermark: RootWatermark | null }>; }
interface UsageQueryQualification { readonly writerSchemaDigest: string; readonly converterVersion: string; readonly sourceWatermark: RootWatermark; readonly decodedRowsAgree: boolean; readonly exactCountersAgree: boolean; }
```

**Assumptions cited:** [[c8]] [[c18]]

## 6. Story boundaries

### 6.1 Story STORY-c66d49bb81925886-s1

**Owns:** `sc1`, `sc2`

Pure schemas, canonical source-payload identity/digest rules, normalized counter validation, correction/non-overlap/transfer state machines and deterministic accounting fixtures. Define physical Avro type requirements and binding evidence types; no filesystem writer, provider capture or hierarchy totals. Internal reducer representation and fixture builders remain private. Own the mandatory activity-to-charged-artifact validation table and source-capability qualification evidence; automatic dispatch capture remains TU2/TU3.

### 6.2 Story STORY-c66d49bb81925886-s2

**Owns:** `sc3`, `sc4`
**Depends on:** `sc1`, `sc2`

Root resolution against current content/workflow evidence, reservations, Avro block coding/reopen, root writer guards, intent/checkpoint IO, corruption classification, restart recovery, indexes and leased prefix copies. s1 types are consumed; no artifact content mutations, transfer policy implementation or reporting SQL. Lock and checkpoint implementation remains private. Repository-wide event/call ownership checks, derived disk-backed identity indexing and crash catch-up are private s2 mechanisms; accepted facts remain only in Avro.

### 6.3 Story STORY-c66d49bb81925886-s3

**Owns:** `sc5`
**Depends on:** `sc1`, `sc2`, `sc3`, `sc4`

Lifecycle independence tests, paired import/export, binary-safe branch event union, retained tombstones and source-coordinated cross-root transfer/recovery. Consume s2 APIs instead of reaching into its journal. No accounting redefinition, new root identity scheme or content approval gate. Import staging and transfer coordinator internals remain private.

### 6.4 Story STORY-c66d49bb81925886-s4

**Owns:** `sc6`
**Depends on:** `sc1`, `sc2`, `sc3`, `sc4`, `sc5`

Daemon registry/IPC adapters, path/identity/access validation, diagnostic projection, resource-budget/scale acceptance and committed-snapshot decoding qualification against existing DuckDB conversion. Exact handler registration and query fixture plumbing remain private. No capture, controller-host reporting, hierarchical DeliverySnapshot or board implementation.

## 7. Non-functional targets

- **Performance:** Initial proposed acceptance budget: <=16 KiB encoded source record, <=256 KiB uncompressed append block, <=256 events per submission and <=500 records per page; reject before allocation/append when exceeded. Qualify one root up to 1,000,000 records or 1 GiB and a 10-root snapshot vector with bounded <=128 MiB service working buffers (excluding configured DuckDB budget); larger histories return resource-limit/partial diagnostics, never truncation. Target p95 durable single-root append <=100 ms and cold verified recovery <=60 s at the qualification scale on a documented local SSD/Node runtime; these are targets to measure, not existing results. Missing targets block production enablement and require a documented bound/architecture decision, not silent reduction in correctness. Full scans are O(N), and snapshot/derived-index latency is reported independently.
- **Security:** Registered repo required; realpath/containment and no symlink escapes; root IDs validated by canonical types and workflow bindings. Private root/journal and temp files; no raw prompt/response or credentials. Daemon-only writer and query access; no arbitrary paths/SQL extension installation from clients. Import resources/schema bounded before decoder allocation. Preserve local CLI OAuth, critical model tier and provider sequencing policies.
- **Observability:** Explicit committed/duplicate/rejected/conflict/recovery-required/unsupported states, pending reservations and transfers, interrupted calls, snapshot age and watermark vector. Log operation/root/event IDs and phase timings without model payloads; distinguish recording failure from inference retry. Temp snapshots cleaned on expiry/cancellation/restart. Emit measured scale/recovery results and exact schema/converter versions in acceptance evidence.
- **Durability:** Durable intent -> complete Avro block and batch commit -> file fsync -> atomic checkpoint replace and directory fsync -> receipt. Failure injection covers header/root directory, intent, append/sync, checkpoint and cleanup; two clients, duplicate replay, process restart, short/truncated/corrupt committed files and cross-root transfer boundaries. Never rerun inference for telemetry recovery. Missing/corrupt recovery metadata fails visibly; no text merge, silent compaction, rotation or acknowledged-event loss.

## 8. Rollout

**A — accounting contracts**

**Stories:** `s1`

Freeze sc1 normalized immutable events/reducer and sc2 binding/reservation types before persistence consumes them.

**Backward compat:** Existing artifacts remain unchanged and legacy absence is not converted to zero. No provider or board path is enabled.

**B — durable root ledgers**

**Stories:** `s2`
**Flag:** `usageLedger.enabled`

Implement sc3 root resolution, exclusive appends/recovery and sc4 committed snapshots against accepted s1 contracts.

**Backward compat:** Use an additive .insrc/usage namespace; do not rewrite artifact JSON or replace the generic artifact journal. Missing/unsupported ledgers return explicit outcomes. Gate new service activation on restart/fault and scale qualification.

**C — lifecycle and transfer**

**Stories:** `s3`
**Flag:** `usageLedger.enabled`

Implement sc5 paired export/import, retained accounting roots and recoverable attribution transfers on s2 durability/snapshot APIs.

**Backward compat:** Content review/signoff/approval semantics and JSON bytes are independent. Existing exports without usage remain usable but visibly incomplete; binary ledgers are never text-merged. Rollback disables writes but retains all files and pending operations for forward recovery.

**D — daemon service qualification**

**Stories:** `s4`
**Flag:** `usageLedger.enabled`

Expose sc6 scoped daemon append/read/diagnostics and qualify committed snapshots through the existing Avro converter/DuckDB path, independently of TU2-TU5.

**Backward compat:** Keep provider dispatch, controller-host reporting, DeliverySnapshot and board unchanged. Proposed usage.* IPC methods are additive and mirrored only where a consumer is introduced. Disablement never deletes ledgers or returns fabricated zero; no runtime extension autoinstall.

**Ordering rationale:** s1 -> s2 -> s3 -> s4 respects the approved DEF (s4 depends on s2 and s3) and sc1/sc2 foundational ownership. The proposed disabled-by-default enablement is an operational gate, not automatic provider capture; it is turned on only after all foundation acceptance evidence is recorded. Downstream epic contracts can be implemented later without reopening usage semantics.

**Risky bits**

| Area | Why | Mitigation |
| :--- | :--- | :--- |
| Durable block commit, checkpoint and corruption classification | Avro framing and existing artifact writeAtomic are not transaction/fsync guarantees; an interrupted append must not be confused with damaged acknowledged history. | Qualify avsc record/header handling and the new append protocol with durable-phase fault injection, restart, duplicate delivery, multiprocess writer refusal and full committed-prefix integrity checks before enablement. Fail visibly when checkpoint proof is absent. |
| Ownership and cross-root transfer consistency | Existing parentOf is incomplete for document/standalone roots and multi-root read cuts can otherwise lose or duplicate an effective charge. | Require evidence-backed explicit bindings/reservations; source-coordinate transfer IDs, lock roots in deterministic order and snapshot the transfer closure. Pending/conflicting transfers stay partial and preserve original observations. |
| Growing single files and snapshot/query compatibility | Full ledger copying/scanning and converter resources can exceed practical bounds; nested schema/counters may decode differently from assumed analytics types. | Set and measure root/record/block/page and service-memory budgets, use opaque watermark-bound cursors and private leased snapshots, qualify exact Avro schema through existing bounded conversion and exact-counter fixtures, and block unsupported limits rather than truncate or silently weaken correctness. |

## 9. Alternatives considered

### 9.1 a1: Per-root Avro event sourcing with a recoverable append journal — **CHOSEN**

One canonical Avro container per root; a daemon service serializes durable block appends and recovers interrupted operations.

Store normalized immutable observations and identity/control records in one root-owned Avro object container. Validate ownership and event semantics before staging a bounded append; retain a transient durable intent until the Avro block and commit checkpoint are durable, then acknowledge. Readers consume an acknowledged prefix through leased snapshots.

Use a pure deterministic accounting reducer, separate content lifecycle services and daemon-owned interfaces. Cross-root transfers coordinate reference records without copying consumed-call observations; DuckDB consumes a committed snapshot through the existing converter initially. Root identifiers and binding reservations are validated independently of document creation.

**Pros:**
- Keeps one canonical events.avro per root and never rewrites artifact JSON for usage.
- Durable intent plus a committed byte/sequence checkpoint makes crash boundaries and replay outcomes explicit.
- Separates normalized accounting from provider capture and reporting, allowing four independently accepted stories.

**Cons:**
- Journal/checkpoint ordering and recovery need fault-injection tests for every durable boundary.
- Cross-root coordination and bounded snapshot copying introduce new daemon service logic.
- The physical Avro schema and append library path must be qualified; an existing converter is not an appender.

**Cost estimate:** L

### 9.2 a2: File-only Avro append with replay and prefix scanning

Use the canonical Avro container alone for event/control records and rebuild commit/index state from its valid prefix.

Append complete bounded blocks directly under a single writer and fsync before returning durable acceptance. On restart scan the file to reconstruct IDs, bindings and accounting state; recover incomplete tails using protocol-defined block framing and replay by stable IDs. Content artifacts remain separate.

Keep no persistent append intent or fast checkpoint. Reads obtain a root writer lease while identifying and copying a stable prefix. Cross-root transfers and reservations are represented in Avro control records and consumers must inspect the relevant roots to establish completion.

**Pros:**
- Eliminates a second durable append-intent format and checkpoint synchronization.
- Preserves the single canonical Avro file and supports deterministic replay from immutable records.

**Cons:**
- Every cold recovery requires a full ledger scan before safe ID deduplication and owner resolution.
- Without a trusted committed offset, distinguishing an interrupted tail from corruption in already acknowledged history needs stronger format-level evidence.
- Reader leases can block appends for the duration of snapshot capture unless additional prefix coordination is added.

**Cost estimate:** L

**Rejected because:** Keeps storage shape but weakens demonstrability of k6/k9 durability and bounded recovery.

### 9.3 a3: Immutable Parquet dataset with transactional manifest

Write small immutable Parquet parts and query committed parts through DuckDB.

Stage normalized records in immutable columnar parts and publish a durable manifest as the report snapshot. Use manifest transactions to expose only committed parts, with event IDs and accounting reduction determining effective contributions.

The daemon owns manifest updates, artifact ownership bindings and queries. Periodic compaction reduces small-file scan cost while preserving stable record identities and provenance, and the report engine reads the same manifest version.

**Pros:**
- DuckDB can query existing native Parquet readers without adding Avro scanning support.
- A manifest naturally provides immutable multi-file snapshots and partitions for analytical reads.

**Cons:**
- Violates the approved one live Avro file per root contract and requires a definition change.
- Small append batches create many files or require a separate canonical write log, increasing ownership and retention complexity.
- Compaction and manifest recovery become additional storage protocols outside TU1's chosen boundary.

**Cost estimate:** L

**Rejected because:** Analytical layout is useful later, but k1 and k10 reject it as canonical TU1 storage.

## 10. References

- **[[c1]]** `doc` `docs/model-token-usage-prd.html#schema`
- **[[c2]]** `doc` `docs/model-token-usage-prd.html#counting`
- **[[c3]]** `doc` `docs/model-token-usage-prd.html#integrity`
- **[[c4]]** `prior-artifact` `docs/epics/retain-durable-artifact-token-usage-E20261026c66d49bb/DEF.md`
- **[[c5]]** `step-output` `s1.analyzeBundles`
- **[[c6]]** `analyze-bundle` `s1.analyzeBundles[0]`
- **[[c7]]** `analyze-bundle` `s1.analyzeBundles[1]`
- **[[c8]]** `convention` `AGENTS.md`
- **[[c9]]** `code` `src/workflow/artifact-core/store.ts`
- **[[c10]]** `code` `src/workflow/artifact-core/decode.ts`
- **[[c11]]** `code` `src/workflow/artifact-core/lifecycle.ts:102-104`
- **[[c12]]** `code` `src/workflow/artifact-core/repo-lifecycle.ts`
- **[[c13]]** `code` `src/workflow/storage.ts`
- **[[c14]]** `code` `src/shared/types.ts:61-87`
- **[[c15]]** `analyze-bundle` `s1.analyzeBundles[2]`
- **[[c16]]** `code` `src/workflow/artifact-ids.ts:190-200`
- **[[c17]]** `code` `src/daemon/lifecycle-registry.ts:41-55`
- **[[c18]]** `code` `src/daemon/db/drivers/duckdb-file.ts:114-141`
- **[[c19]]** `code` `src/daemon/db/duckdb-pool.ts:65-122`
- **[[c20]]** `code` `src/workflow/artifact-core/journal.ts:72-104`
- **[[c21]]** `code` `src/daemon/db/drivers/converters/avro.ts`
- **[[c22]]** `doc` `package.json`
- **[[c23]]** `code` `src/workflow/artifact-core/types.ts:25-47`

<!-- insrc:review -->

## Review

### ⚠️ Review `WARN` — design.epic (design.epic)

**0 do not hold · 1 could not be verified · 9 hold** · template `design-spec` · model `cli-codex:gpt-6.1-sol` · reviewed 2026-10-26T08:08:38.063Z

Only a premise that does not hold blocks approval. One that could not be verified is listed for the reader and does not block.

#### Does not hold (blocks approval)

_None._

#### Could not verify (does not block)

| Check item | Premise | What was tried and what was missing | Action |
| --- | --- | --- | --- |
| change-sites | The generated ER, sequence and component companions render consistently with the HLD. | Read the embedded Mermaid sources in all three HTML companions. They describe root/record cardinalities, durable append ordering and dependency direction consistent with the principal prose. Rendering was attempted: the in-app browser was unavailable, and Chrome rejected the local file URL under its protocol policy. Layout, clipping and actual Mermaid execution were not verified. [files: docs/epics/retain-durable-artifact-token-usage-E20261026c66d49bb/er-model.html, docs/epics/retain-durable-artifact-token-usage-E20261026c66d49bb/sequence-diagram.html, docs/epics/retain-durable-artifact-token-usage-E20261026c66d49bb/component-dependency.html] | Render all three existing companions in an environment permitted to open them and inspect their visual consistency. |
