# Model token usage implementation plan

Status: Proposed epic scopes and build sequence.

Date: 26 October 2026

## Outcome and planning boundary

Deliver the [per-model-call token usage PRD](../docs/model-token-usage-prd.html) and its [Delivery board experience](../docs/mocks/model-token-usage/board.html). Each workflow model attempt contributes immutable usage evidence to its owning artifact. Users can reconcile model calls to artifact activities, tasks, stories and epics, including the usage consumed by reviews, revisions and unsuccessful attempts.

The roadmap contains five epics. Each owns a complete capability, publishes contracts for its consumers, and has its own acceptance evidence. An epic may depend on an accepted predecessor, but its completion must not depend on an unfinished successor. Tests, compatibility, recovery and documentation belong to the epic that introduces the behavior.

TU1–TU5 are planning labels, not registered artifact IDs. This file does not create tracked epics or authorize implementation. Before building, use triage and scope assessment to create or extend the appropriate tracked epics, then follow their definition, design, approval, plan, build and independent review gates.

## Shared product boundaries

- Keep one authoritative append-only Avro file per canonical root at `<project>/.insrc/usage/<root-artifact-id>/events.avro`. Root and descendant records share that file; each record retains its charged artifact identity. Artifact JSON contains no event arrays. Recovery journals and derived Parquet exports are not additional canonical stores.
- Give each physical model attempt one stable call ID and one charged owner. Transport retries reuse event IDs; model retries create new call IDs under their logical request. References from TASKS, BUILD and review records do not create additional charges.
- Charge design reviews to their subject LLD, task work to the TASK record, and shared story validation/code review to the BUILD record. Epic design overhead stays on the epic. Rollups follow canonical ownership, never dependency or `corrects` links.
- Distinguish reported, estimated, unavailable, pending and historical not-recorded usage. CLI invocation aggregates must not be presented as an observed number of physical model calls.
- Keep artifact JSON bytes, content approvals, signoffs and content hashes independent of ledger appends. Retain usage across content revisions, rejected designs, cancelled runs and supersession.
- The daemon owns persistence and aggregate computation. IDE, CLI and MCP consumers use supported IPC contracts and share the same snapshot semantics.
- Reuse the existing model/provider abstraction. Cloud inference continues through local Claude/Codex CLIs and OAuth; local inference and embeddings use Ollama. Preserve sequential provider calls and the model capability floor for critical roles.
- Deliver token accounting, not pricing, billing, budgets or automatic model selection. Do not store prompts, completions or credentials in the usage collection.

## Epic scopes and dependencies

| Epic | Self-contained outcome | Required predecessors | Owns |
| --- | --- | --- | --- |
| TU1 Durable artifact usage accounting | Validated, recoverable usage histories that survive normal artifact operations | None | Event schema, identity, ownership rules, append service, effective-event reduction and recovery |
| TU2 Daemon workflow model capture | Real daemon-dispatched model work is attributed and persisted automatically | TU1 | Workflow capture context, provider normalization and dispatch/result instrumentation |
| TU3 External controller usage reporting | Cooperating controller hosts can report workflow usage safely, with explicit coverage limits | TU1 and TU2 | Reporting handshake, IPC/MCP ingestion, host integration and source coverage |
| TU4 Hierarchical usage read model | Artifact, task, story and epic totals are queryable and reconcilable through daemon APIs | TU1 and TU2 | Ownership aggregation, usage queries, filters, paging, exports and snapshot consistency |
| TU5 Delivery board usage experience | Existing board views expose totals and let users inspect the contributing calls | TU3 and TU4 | Client contract consumption, summaries, Usage drill-downs and integrated release verification |

## TU1 Durable artifact usage accounting

Deliver a reliable artifact usage service and accounting contract that producers can use without the Delivery board.

### Scope and build order

1. **Qualify the measurement boundary and freeze the contract.** Establish the observable granularity for daemon provider calls, native CLI invocations and external controller hosts. Finalize the draft schema, disjoint token buckets, logical request/call/event IDs, model identity, step/run context, review attribution and coverage declarations. Make an explicit scope decision where a required source cannot expose physical calls; aggregate fallback cannot silently satisfy per-call completeness.
2. **Implement validation and effective-event reduction.** Support started, finished and corrected observations, duplicate acknowledgment, conflicting identity detection, incomplete attempts, unknown versions and invalid counters. Define a versioned reconciliation contract for overlapping aggregate/leaf evidence and attribution transfers before allowing those operations. Keep original facts immutable and resolve one non-overlapping accounting basis.
3. **Implement durable per-root Avro append and recovery.** Resolve canonical root IDs through parent links, reserve stable roots/children before content exists, serialize one writer per repository/root and append all descendant records to that root's `events.avro`. Prove fsync-based acknowledgment, root-directory creation durability, duplicate replay, complete-block checkpoints and interrupted-tail recovery. Missing or invalid roots cannot be guessed. Journals are recovery-only; never invent content or rerun inference.
4. **Keep lifecycle and usage persistence independent.** Artifact regeneration, codecs, approval/signoff and supersession leave ledger bytes intact. Define paired artifact/ledger import-export, binary-safe branch-history reconciliation, missing-ledger quality, root deletion/retention and recoverable cross-root attribution transfer without duplicate charging. No event arrays or duplicate usage caches enter artifact JSON.
5. **Expose and qualify the service.** Provide daemon-owned append/read access, per-root watermarks, bounded paging, recovery diagnostics and scale tests. Finalize the physical Avro schema/library and schema evolution strategy; the PRD JSON schema describes decoded API/export data only. Keep one live file per root; set measurable growth/read/recovery limits. Optional Parquet exports are derived snapshots identified by source watermark.

### Scope boundary

TU1 owns storage and accounting semantics, including the meaning of an effective observation. It does not instrument model providers, decide workflow dispatch sites, calculate work-item subtree totals or implement board UI. Provider discovery informs its contract; provider adapters belong to TU2.

### Exit criteria

- Root and descendant attempts appear in the same root Avro file with distinct charged owners. Artifact regeneration and approval leave ledger history intact and usage appends leave artifact JSON bytes unchanged.
- Concurrent appends and crash recovery lose no acknowledged event. Duplicate delivery adds no charge; conflicting duplicates and forked corrections remain visible.
- A reserved root ledger accepts usage before artifact content exists; reserved child attribution resolves once after creation. A torn tail recovers without losing acknowledged blocks; an interrupted request remains unknown rather than becoming zero.
- Reconciliation, correction and ownership-transfer fixtures select each consumed request once while preserving original provenance.
- The accepted schema, preservation rules and append/read contract are available to TU2–TU4 with deterministic fixtures and recovery documentation.

## TU2 Daemon workflow model capture

Deliver automatic capture for model requests the daemon dispatches. Its usage is inspectable in the root ledger through TU1 even before a board exists.

### Scope and build order

1. **Propagate workflow ownership context.** Carry the target artifact, canonical work item, workflow, exact step, run, activity, model role and logical request through orchestration and nested context/analyze work. Review rounds retain the reviewed subject as their charged owner. Task validation and shared story validation remain distinct.
2. **Normalize native provider usage.** Implement and qualify the supported Ollama, Claude CLI and Codex CLI paths against pinned native fixtures. Distinguish requested from reported model IDs, completion from embedding work, cache buckets from uncached input, and reasoning subsets from output. Establish whether observations are per-call, per-invocation or cumulative.
3. **Connect dispatch and completion to durable capture.** Persist a start before dispatch and a final observation after success, failure, cancellation or timeout. Instrument the actual dispatch boundary once, so caller and retry wrappers do not double-record a call. Persist available usage from unsuccessful attempts and preserve unknowns when counters are absent.
4. **Handle retries, nesting and native aggregation.** Give each actual retry a new call ID, preserve its logical request identity, and distinguish a CLI invocation from any observable calls inside it. Apply TU1's accepted reconciliation rules before ingesting overlapping native summaries. Exclude background indexing from workflow totals unless an explicit causal workflow owner exists.
5. **Verify real workflow paths and recording failures.** Exercise LLD authoring/review, PLAN, task implementation/validation and shared code review. If capture fails, retry recording rather than inference; retain completed results and expose recovery state. A start that cannot be made durable must not dispatch silently.

### Scope boundary

TU2 owns daemon instrumentation and provider-specific extraction. It consumes TU1's schema and append service without introducing another ledger. It does not claim visibility into an external controller's own model requests; those reporting integrations belong to TU3.

### Exit criteria

- A representative daemon workflow produces attributable usage for authoring, multiple review rounds, planning, task work and validation, including a failed/retried attempt.
- Every dispatched supported provider path has a declared capture capability and a final or explicitly incomplete accounting outcome.
- Inclusive/exclusive cache fixtures, reasoning counters and session-cumulative/native aggregate fixtures normalize without duplicate tokens.
- Serial opt-in native probes establish supported provider behavior. An unavailable field or physical-call count is disclosed, not inferred.
- Capture and recovery do not change workflow results, permission behavior or model-routing guarantees. Recording failure never triggers a duplicate inference.

## TU3 External controller usage reporting

Deliver a complete reporting path for workflow reasoning performed outside the daemon, using the same ownership and accounting rules as TU2.

### Scope and build order

1. **Define the host capability and reporting handshake.** Identify the workflow run/step and server-issued accounting context before external work. Declare whether the host can observe model identity, individual attempts and usage counters. Represent an unsupported host or unknown request count as a coverage limitation; do not invent one placeholder physical call.
2. **Expose reporting through existing client boundaries.** Add the required IPC/MCP reporting surface using TU1's append service and TU2's context. Validate repository scope, ownership, event identity, source and schema. Accept reports only under the established caller/access rules; do not trust an arbitrary artifact path or allow cross-repository attribution.
3. **Integrate supported controller paths.** Wire controller-driven workflow authoring, revision and review flows where the host exposes telemetry. Carry call IDs through reconnects and finalization. Store counters reported by the controller with their provenance; do not imply independent provider verification by the daemon.
4. **Reconcile reporting sources and incomplete hosts.** Ensure the same native request reported by both host and daemon contributes once. Exercise late reports, duplicate submissions, reporting failures and outbox recovery. Publish a supported-host coverage matrix and instructions for hosts that cannot expose counters.

### Scope boundary

TU3 owns external reporting and host integrations, not another inference provider or credential system. It cannot derive private host usage from answer length or silently convert an invocation total into individual model calls. Changes to core event semantics return to TU1's contract owner.

### Exit criteria

- A cooperating controller reports one step's model attempts into the correct artifact and review round, and retries its telemetry without duplicating usage.
- Cross-scope reports, conflicting event identities and malformed counters are rejected with recoverable, explicit results.
- Daemon and controller reports of the same observable request reconcile to one charge.
- A host without telemetry remains usable under the agreed product scope while its coverage remains visibly unavailable. Complete per-call coverage is claimed only for qualified paths.
- Host integration evidence and capability limits are available to TU5; no board feature is required to verify this reporting epic.

## TU4 Hierarchical usage read model

Deliver daemon APIs that explain usage independently of a particular client. A caller can query a story total and reconcile it to artifacts and model attempts.

### Scope and build order

1. **Resolve canonical ownership.** Map charged artifacts to task, story, epic and standalone identities. Consume capture-time ownership and TU1's explicit transfer rules. Treat TASKS/BUILD summaries, review references, dependencies and `corrects` relationships as references rather than extra aggregation edges.
2. **Compute deterministic rollups.** Calculate own and inclusive totals bottom-up from effective observations. Publish LLD plus reviews, PLAN, child tasks and shared story work as reconcilable partitions. Keep epic overhead separate from story usage and count unions of overlapping selections once.
3. **Apply usage filters and coverage consistently.** Support model, model kind, run/time and counter selection over the same observation set. Keep reported, estimated and unavailable values separate; report incomplete attempts, legacy absence, unknown schemas, attribution conflicts and unavailable physical-call counts. Detect cycles, missing parents and ambiguous identities without looping or joining by title.
4. **Expose summaries and paged evidence.** Extend the delivery read contract with usage summaries, source references and a usage watermark. Provide paged calls, model/activity breakdowns, correction provenance, filtered reports and explicitly scoped raw-history exports. Keep summaries and detail reads tied to a coherent snapshot.
5. **Verify incremental refresh and scale.** Refresh only affected ownership paths when appropriate, with the same result as a full recomputation. Measure representative large histories, pagination and refresh behavior; do not require the board to load every event to obtain a total.

### DuckDB reporting implementation

Reuse the daemon-owned in-memory DuckDB engine. The current Avro driver converts source files to a derived Parquet cache (`src/daemon/db/drivers/duckdb-file.ts:114`); direct `read_avro` requires an explicitly provisioned Avro extension because the pool disables automatic loading (`src/daemon/db/duckdb-pool.ts:114`). Qualify exact extension/version/platform/offline behavior. Read a committed bounded snapshot or coordinated reader lease, with a per-root watermark vector; a SQL sequence predicate alone cannot protect a scan from a torn append tail. Apply TU1 effective-event semantics before sums and compare results against reducer fixtures. Derived caches and indexes remain rebuildable. Validate root allowlists through the daemon; clients do not query files directly. See [DuckDB Avro documentation](https://duckdb.org/docs/current/core_extensions/avro).

### Scope boundary

TU4 owns aggregation and query contracts. It consumes TU1's effective observations and accepts TU2/TU3's common source representation without normalizing provider payloads again. It does not add capture events or implement client presentation.

### Exit criteria

- The PRD fixture reconciles 97,100 LLD/review tokens and 171,750 follow-on tokens to a 268,850-token story total.
- A new 3,000-token task call updates that task, story and epic once. Duplicate replay, reference expansion and overlapping selections leave the charge unchanged.
- Corrections, reparenting/attribution transfers, historical runs and standalone/linked issues preserve deterministic accounting and visible provenance.
- Every filtered subtotal uses the same model/run/time/quality rules. Unknowns and excluded estimates cannot appear as complete measured zeroes.
- Paged evidence, exports and aggregate snapshots agree, and incremental results match a full rebuild. The API is usable and verified before TU5 begins client integration.

## TU5 Delivery board usage experience

Deliver the user-facing feature in the current Delivery board, consuming accepted capture and query contracts rather than implementing a second accounting engine.

### Scope and build order

1. **Update the client contracts and state.** Consume TU4 summaries and paged evidence through existing delivery IPC. Preserve navigation, selection and refresh behavior. Keep workflow stage, validation, approval and usage quality as separate signals.
2. **Add summaries to existing views.** Show inclusive usage and quality on story cards and epic rows. Add LLD plus reviews, follow-on activities and story total to story details, and usage beside task results and artifact records. Preserve All work, Epics, Standalone and Issues views.
3. **Add the Usage drill-down.** Implement activity/task hierarchy, model breakdowns, review rounds, individual attempts and read-only event evidence. Explain shared usage and non-additive reference links. Show requested-model fallback and actual-model uncertainty explicitly.
4. **Integrate filters, exports and all evidence states.** Apply the daemon's model/metric/run/time filters consistently, label matching-card subtotals separately from whole-scope totals, and distinguish raw-history export from filtered reports. Implement reported/estimated controls, pending, unknown, legacy, conflict, unsupported-schema and stale/unavailable states.
5. **Qualify the complete release.** Verify the current board in light/dark themes, keyboard navigation and narrow layouts. Exercise large histories without mounting all events. Run an end-to-end workflow containing daemon and cooperating-controller work, multiple LLD reviews, a PLAN, tasks, retries and shared code review; reconcile the displayed numbers to stored events.

### Scope boundary

TU5 owns presentation and client interaction. All authoritative totals, deduplication, correction selection and ownership rules remain in the daemon. The [clickable mock](../docs/mocks/model-token-usage/board.html) is a behavior reference, not a substitute for production capture, persistence or large-history verification.

### Exit criteria

- Every board usage figure reconciles to the same daemon snapshot and ultimately to immutable artifact events.
- A user can explain the LLD/review subtotal and the PLAN/task/shared-work subtotal without adding an already-inclusive group twice.
- Live appended usage refreshes the affected views once; replaying an event does not inflate a figure. Failed refreshes retain clearly labeled last-known values.
- Keyboard, theme, narrow-layout, pagination and existing delivery-navigation checks pass, with existing stage/approval/validation behavior preserved.
- Integrated capture, persistence, reporting and read-model checks pass for the published provider/host support matrix. Remaining native observability limits are visible in the product and release documentation.

## Build sequence and release gates

| Wave | Build | Gate before advancing |
| --- | --- | --- |
| 1 | TU1 | Accounting schema, semantic rules, durable append/recovery and preservation contracts accepted; provider/host feasibility boundaries settled |
| 2 | TU2 | Real daemon workflows emit durable, normalized usage under the accepted ownership rules; supported native granularity is verified |
| 3 | TU3 and TU4 | Controller reporting and hierarchical queries can proceed independently against the accepted TU1/TU2 contracts; each must pass its own integration and recovery checks |
| 4 | TU5 | Both TU3 and TU4 accepted; board integration and full workflow reconciliation establish the complete release |

Recommended serial order when one build stream is available: **TU1 → TU2 → TU3 → TU4 → TU5**. With independent build streams, TU3 and TU4 may run concurrently after TU2. Keep live model/provider calls sequential even when development work overlaps.

Consumers may prototype against accepted fixtures earlier, but that does not complete their upstream dependencies. Do not start production board integration against a guessed snapshot contract or declare the read-model epic complete solely from synthetic arithmetic.

Each epic exits through its own tracked build and independent review. Cross-cutting fixes return to the owning epic/contract; TU5 must not absorb unfinished provider normalization, persistence recovery or aggregation work.

## Contract ownership

| Contract | Owner | Consumers |
| --- | --- | --- |
| Event schema, identity, quality/granularity semantics and effective-observation reduction | TU1 | TU2, TU3, TU4 |
| Per-root Avro append/read, root reservation, lifecycle independence and recovery behavior | TU1 | TU2, TU3, TU4 |
| Workflow capture context and provider-normalized observations | TU2 | TU3, TU4 |
| Controller capability declarations and report ingestion | TU3 | Supported hosts, TU4, TU5 |
| Ownership rollups, filtered summaries, usage snapshot, paged evidence and export | TU4 | TU5 and other read-only clients |
| Delivery board presentation and interaction | TU5 | Board users |

TU4 can implement coverage projection against TU1's accepted representation while TU3 implements its producer. Neither may invent a different meaning of unknown coverage. Any contract change must name affected consumers and its compatibility strategy before downstream build proceeds.

## PRD acceptance coverage

| PRD criterion | Primary delivery | Required integration |
| --- | --- | --- |
| TU01 Per-attempt attribution and outcomes | TU2, TU3 | TU1 durability and TU5 end-to-end workflow |
| TU02 LLD authoring and every review round | TU2, TU3 | TU4 partitioning and TU5 drill-down |
| TU03 Canonical hierarchical arithmetic | TU4 | TU1 effective observations and TU5 displayed reconciliation |
| TU04 Idempotency, recovery and immutable history | TU1 | TU2/TU3 dispatch and reporting failure paths |
| TU05 Cache, reasoning and aggregate normalization | TU1, TU2 | TU4 non-overlapping totals |
| TU06 Unknown, historical and aggregate-only coverage | TU1–TU4 | TU5 quality presentation |
| TU07 Approval/hash preservation and concurrent appends | TU1 | TU2/TU3 live capture |
| TU08 Existing board navigation and consistent scope | TU5 | TU4 snapshot/query contract |
| TU09 Ancestor updates without reference duplication | TU4 | TU5 refresh and hierarchy interactions |
| TU10 Capture failures, stale data and scoped exports | TU1–TU4 | TU5 recovery presentation and export labels |
| TU11 Qualified native/provider/controller behavior | TU2, TU3 | TU5 published support matrix |
| TU12 Accessibility and large-history behavior | TU4, TU5 | Paged evidence, scale measurements and board checks |

## Tracking and next action

| Planned epic | Tracking status |
| --- | --- |
| TU1 Durable artifact usage accounting | Defined as [DEF c66d49bb81925886](../docs/epics/retain-durable-artifact-token-usage-E20261026c66d49bb/DEF.md) with four ordered stories; revision 7 approved by explicit human review override on 26 October 2026; final independent report retained: 0 HIGH / 10 MED, five unjudged after CLI stalls. Next stage: design.epic HLD |
| TU2 Daemon workflow model capture | Proposed; depends on TU1 |
| TU3 External controller usage reporting | Proposed; depends on TU1 and TU2 |
| TU4 Hierarchical usage read model | Proposed; depends on TU1 and TU2 |
| TU5 Delivery board usage experience | Proposed; depends on TU3 and TU4 |

Start with TU1 scope assessment and definition. Use the [PRD decisions](../docs/model-token-usage-prd.html#decisions), [draft schema](../docs/mocks/model-token-usage/usage-ledger.schema.json) and [example ledger export](../docs/mocks/model-token-usage/usage-ledger-example.json) to settle measurement granularity, reconciliation, attribution transfers, recording failures and retention before freezing producer contracts. Record the resulting tracked artifact links here as each epic is created or matched to existing work.
