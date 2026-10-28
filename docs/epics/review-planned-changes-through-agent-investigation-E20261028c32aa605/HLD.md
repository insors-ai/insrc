<!-- insrc:artifact HLD-c32aa60534232f36 -->

# HLD: review-planned-changes-through-agent-investigation

## Summary

One daemon-owned review state machine gives an independent reviewer the approved work and exact commit packets, then lets it inspect evidence where needed. Indexed and source-only modes share scope, coverage, recovery and completion; indexed mode adds caller-based impact evidence. Accepted progress survives restart and the final review explains both inspected coverage and unresolved work.

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

> See **DEF-c32aa60534232f36** § 1. Problem

## 2. Framework summary

Choose a1: a daemon-owned durable investigation state machine with provider-independent accepted state. Seed each run with sc1's approved tasks/checks, artifact references and explicit commit packets, not embedded source partitions. Source-only and indexed-impact runs use identical packets, obligations, reviewer policy and completion checks; only the indexed capability in sc3 differs. Substantive judgments remain the independent agent's job; deterministic guards validate identity, evidence provenance, coverage and publication, not semantic correctness. Reuse existing LLMProvider/CliProvider read-only execution, budget admission, source freshness, ownership and canonical artifact lifecycle; introduce the investigation protocol and durable accepted-state store behind the existing code-review entrypoints. Checkpoint cadence is per reviewed commit-packet block, independently of continuation boundaries and run time limits; multiple block checkpoints may be accepted within one managed reviewer session.

## 3. Architecture shape

PROPOSED components live under the existing code-review subsystem; concrete filenames are selected in LLD, not claimed as existing implementations. Subject preparation (s1) supplies packet manifests; coverage (s2) tracks obligations and evidence; investigation (s3) drives one serial reviewer continuation at a time; recovery (s4) provides the durable implementation of sc6; completion (s5) writes the canonical CR; integration (s6) composes both entrypoint adapters. Existing src/workflow/code-review/subject.ts, src/workflow/code-review/grounding.ts, src/workflow/code-review/freshness.ts, src/workflow/code-review/gate.ts, src/agent/read-only-tool-loop.ts and src/workflow/artifact-core/repo-lifecycle.ts are reuse seams, not finished implementations of these proposed contracts.

SCOPE AND SOURCE VIEWS. Subject preparation resolves the approved PLAN and LLD revisions (or explicitly named approved ISSUE/LLD for a legitimate planless route), built Story identity and selected commit IDs. Existing Story trailers and build records are candidate attribution evidence, not proof that every hunk in a mixed commit belongs to this Story. Each packet names one commit and an explicit comparison parent, exact Git object/blob identities, and only relevant changed blocks. Merge edits require a selected parent and attribution evidence; inherited merge changes, commits without demonstrated scope and unrelated hunks never slip in through generic base..HEAD or working-tree diff. If a mixed commit cannot be separated faithfully, report the ambiguous blocks and refuse a complete subject until the scope is clarified. Never guess a net HEAD diff as the replacement. Deleted, added, renamed, mode-only and binary changes have explicit packet entries. Intermediate patches retain provenance; the reviewer may navigate the same evidence once and bind it to multiple blocks/tasks, while supersession must be explicit rather than erasing any selected packet.

A frozen context tree identifies the source version being assessed. It may contain unchanged or foreign-origin surrounding code as context, but that content never becomes changed scope. Before/after blobs for each packet remain available even when later selected commits edited the same file. Source inspection uses a private immutable/read-only snapshot view or a provider adapter with equivalent pinned-read guarantees; a mutable project cwd is not a substitute. For native CLI sessions the execution adapter exposes the snapshot as the read workspace and mediates index access against the registered original repo identity. Tools permitted for review cannot edit source, fetch arbitrary network context or treat repository instructions as review policy. If an adapter cannot meet the declared read/pinning capability it reports unsupported rather than silently weakening it. Files are read in bounded ranges with explicit continuation and completeness; a large block is not discarded or treated as fully inspected after truncation.

REQUEST FLOW. The client starts with the Story/build and explicitly selected scope. The daemon prepares and hashes sc1 and sc2, persists the run and issued-attempt intent before dispatch, and sends compact task/check descriptors plus artifact, packet and outstanding-work references. The independent reviewer chooses related tasks, source reads, dependency/context reads and test evidence, then submits sc3 progress after each reviewed block with inspected evidence references, notes, coverage updates, findings and outstanding work. The continuation can remain open across many such block-progress acknowledgments. For each block-progress submission, the daemon checks request/generation/subject/policy and expected-sequence bindings, commits its evidence/notes/coverage/outstanding-work delta, and acknowledges a durable checkpoint receipt before the reviewer moves on. A final continuation reply references those accepted receipts rather than reapplying all earlier block results. The same reviewer may continue from that accepted checkpoint; an opaque native session may be reused as an optimization but is not recovery authority. Missing evidence stays unverified. No mandatory call per task, criterion or clause is scheduled, and source/contract text is fetched only when needed rather than repeated in every request. Repeated facts are referenced and reread if their exact evidence is needed; context summaries are navigation, never replacements for required proof. An automatic content correction invalidates affected evidence/coverage; there is no unconditional full re-review of unaffected accepted work.

COVERAGE AND REVIEW CRITERIA. The required ledger is the union of approved task IDs and acceptance checks, applicable LLD obligations and functional requirements, every packet block/non-text change and the current applicable review criteria (adherence, conventions, functional/test coverage, quality and companion/UX criteria where applicable). Planless runs derive named obligations from their approved upstream and never invent tasks. Every row has pending, satisfied, finding, unverified or justified not-applicable disposition. A satisfied row requires concrete inspected evidence and reviewer rationale; non-applicability requires a bounded reason consistent with the subject and criterion applicability rules. Evidence can support many rows and a row can require many evidence items. The daemon checks ownership, reference validity, required coverage and applicability, not that the code is semantically correct from a citation alone. A contradictory approved requirement produces an unresolved decision, not a fabricated implementation defect or a quiet change of policy. Unplanned attributable changes are assessed explicitly. Context-only code can expose an interaction defect in changed code; standalone pre-existing out-of-scope defects are reported separately, not counted as changed implementation findings. Existing severity/confidence folding and independent-party rules remain authoritative.

INDEXED IMPACT. Indexed mode makes queryChangedEntityCallers available only for methods/entities overlapping selected packet blocks, including before/after identities for deletion/rename when available. Results record index revision, query entity and completeness/freshness. Changed packet membership is never inferred from graph search. Caller results lead to snapshot source reads and explicit impact rows; relevant observed calls can be traced transitively when justified, with unresolved limits visible. A missing graph entity, stale index, unmatched snapshot version or empty caller result is not proof of no impact. Source-only review can inspect imports and helpers directly under the same criteria, but does not claim indexed caller completeness. Both modes may inspect contextual source; only indexed mode has graph caller enrichment. Incompatible index evidence can be omitted with an explicit limitation and remaining impact uncertainty must be disposed of before a successful complete result.

PERSISTENCE AND RELATIONSHIPS. Daemon-owned runtime state is separate from DEF/LLD/PLAN/CR JSON. Proposed storage is <project>/.insrc/review-runs/investigation-v1/<runId>/ with append-only transition records, immutable evidence/accepted-reply blobs and reconstructible checkpoint references; generated runtime state must be excluded from Git attribution, indexing and review manifests. Existing metadata-only .insrc/review-runs/<runId>.jsonl diagnostics remain content-free and are not recovery checkpoints. One immutable Subject is referenced by one or more Runs; each Run owns zero or more Attempts and Checkpoints and exactly one required ledger at an accepted checkpoint. Runs own evidence records; evidence-to-coverage is many-to-many within the same subject. Each Packet owns one or more explicit block/change entries; each run can have zero or one terminal completion receipt referring to one canonical CR revision. An artifact reference is a pinned external contract dependency, not ownership of that artifact. s1 owns sc6's type-level persistence/usage ports; s4 implements them and s6 wires production, so s3 does not acquire a forbidden backwards dependency on s4.

DURABLE ACCEPTANCE AND OWNERSHIP. Persist attempt identity/request digest/owner generation before dispatch; persist validated answer, evidence and ledger delta as one committed transition before acknowledging acceptance. Durable framing/checksums and fsync of the committed journal plus atomic checkpoint replacement define the acceptance boundary; torn tails and corrupt or missing referenced blobs are detected, never accepted as complete. Checkpoints accelerate replay, while the committed journal is authoritative. Repeated submissions of an accepted attempt return its receipt without reapplying coverage, charging a new model call or duplicating the CR. A provider response lost before durable acceptance remains uncertain: recovery can require a fresh recorded attempt, but cannot promise exactly-once provider execution. Main-thread ownership fencing is retained and extended with durable generation/lease identity; worker/daemon restart invalidates old execution owners. Two clients can observe a run, but only one owner advances it; stale replies cannot resurrect it. Use explicit fencing on the shared append/accept boundary, not only in a worker's local memory.

RESUME, BUDGET AND FAILURE. Resume validates the subject/build/approved artifact digests, packet/blob availability, accepted evidence references, engine schema and compatible policy/provider/tool profile. Index evidence is revalidated or invalidated when its revision changes. A changed relevant input marks affected work stale; until a dependency-preserving invalidation can be proved, refuse reuse and require a new subject/run. Unrelated HEAD movement does not redefine packets. Completion also checks that the pinned subject remains applicable to the built Story and that observed context dependencies have not drifted under existing freshness rules. A schema migration is explicit and tested; unsupported state stays readable as unsupported, never silently reinterpreted. The default request cap remains the inclusive estimated128K policy with provider-qualified reserves, not a measured native hard guarantee. Each continuation is capped at five minutes and any shorter role/remaining allowance. A new run declares finite active-time and continuation limits; proposed defaults are120active minutes and24continuations, both visible/configurable and pinned at start. These govern pause points, never a premature passing verdict; extending either requires an explicit continuation decision recorded in the journal. Count managed continuation attempts and active execution, not hidden native model turns; mark native observations unavailable when the CLI cannot expose them. Paused/detached wall time is not execution allowance, and resume restores consumed time rather than resetting it. At most one immediate retry for a transient continuation failure; repeated or nonretryable provider failures pause before new work is dispatched. Cancellation fences the owner and records uncertain in-flight work. A client transport timeout detaches its wait/status subscription; it does not silently create a new review or discard durable progress.

USAGE AND COMPLETION. Stable observation IDs bind every attempted continuation to the Story/root/workflow activity and provider observation when available. Report observed counters, estimates, allowances and unknowns separately; do not add inclusive reserves to consumed tokens or count cached accepted results as new calls. sc6's usage port maps into the existing usage-domain contract; if a storage writer is unavailable, a durable pending outbox retains observations and the status reports pending rather than a false zero. No new warehouse, pricing engine or usage arrays in workflow artifact bodies are introduced. Large evidence and raw answer state stay private to runtime storage; CR carries compact subject/coverage references and existing findings/dimensions. Completion-request is not completion: s5 validates required dispositions, unresolved contradictions, source applicability, independent reviewer identity and exact accepted checkpoint, then commits one idempotent publication receipt through the canonical lifecycle/journal boundary. A passing/warn/block CR is publishable only after accountable coverage; incomplete/uncertain execution has a run status, not a fabricated passing CR. User approval and explicit override gates remain separate and unchanged.

MIGRATION. Introduce a distinct engine version behind explicit selection, preserve legacy CR readers and design-document review behavior, and never silently fall back between engines on failure. Legacy runs lack accepted checkpoints and are labeled non-resumable. Status distinguishes new paused/stale runs from completed old CRs. Subject and evidence formats, runtime schema and policy IDs are versioned. Before default adoption, independently adjudicated fixtures and authorized live comparisons must establish defect-detection/coverage parity and measure calls, repeated input, active time and reported/unknown token usage. Retirement replaces only predecessor code-review chunk/gather requirements. Rollback stops new-engine starts, preserves readable/exportable durable runs and legacy artifact interpretation, and never tries to resume a new checkpoint with the old executor. Human-readable review reports stay in /tmp; canonical CR/lifecycle records and runtime acceptance state remain the durable evidence.

AUTHOR CONSISTENCY NOTES. sc6 owns ReviewReadReceiptV1 as an opaque foundational read receipt; s2 turns trusted receipts into EvidenceV1. This keeps s1 independently buildable and introduces no reverse type dependency on s2. Usage observations carry provider/model identity, observation granularity and the existing five normalized counter buckets; adapters reuse src/workflow/usage/types.ts rather than treating invocation totals as individually observed hidden model calls. Schema mapping/quality remains explicit, and unknown model identity or counters are null, not invented. Packet line spans are one-based inclusive, with null for an absent side. Generated runtime namespaces are excluded at subject preparation before any runtime writes are enabled.

TERMINAL CRASH CONSISTENCY. Runtime completion and the canonical artifact store are not assumed to share one atomic file transaction. Stage a durable terminal intent with a stable receipt ID, reconcile its idempotent canonical CR write through the artifact journal, then record the runtime terminal receipt. Recovery after either side commits verifies the same run/subject/checkpoint/receipt identity before finishing the other side. Status is completed only after both sides reconcile; competing or mismatched receipts are explicit conflicts.

ACCEPTED EVIDENCE BOUNDARY. Snapshot and approved-artifact reads are mediated by the trusted read capability; only digest-bound receipts can support accepted evidence. This is not a claim that the daemon measures or completely sandboxes every hidden native CLI action. Backend restrictions and any unsupported capability are declared explicitly; untracked native observations cannot satisfy required coverage. The read capability rejects paths outside the allowed immutable source/artifact view, and an adapter that cannot supply pinned evidence is refused. Artifact references are separately pinned approved inputs, not arbitrary files read from a mutable project directory. Evidence/accepted-state blobs referenced by an active or completed canonical receipt are retained under explicit retention policy; garbage collection cannot silently remove evidence needed for resume or audit.

RELATIONSHIP CONTRACT (normative cardinalities at run admission; immutable blob sharing does not transfer logical ownership). The sequence and component companions explain interactions and module ownership. This table specifies the runtime relationships without introducing a separate persistent graph schema.

| From → To | Cardinality and ownership | Compatibility / invariant |
|---|---|---|
| Subject → CommitPacket | Subject references 1..many scope-bound packets; each logical packet belongs to its subject manifest. | Commit/parent/blob/block attribution is immutable; zero or ambiguous complete scope refuses admission. |
| CommitPacket → ChangedBlock | Packet owns 1..many text or explicit non-text change entries. | Every selected change remains accountable even after later selected commits; range bounds are one-based inclusive. |
| Subject → ReviewRun | Subject may have 0..many runs; each run references exactly one subject digest. | A changed subject creates explicit invalidation/new-run identity, never silent scope widening. |
| Run → ReviewAttempt | Run owns 0..many managed continuation attempts. | Stable attempt ID and generation bind replies and usage; accepted replay is idempotent. |
| Run → Checkpoint | Run owns an initial checkpoint and 0..many later accepted checkpoints. | Journal-committed sequence is authoritative; checkpoints are reconstructible accelerators. |
| Run → CoverageRow | Run owns 1..many required rows at admission. | Task/check/design/change/criterion rows cannot be dropped to obtain completion. |
| Run → Evidence | Run owns 0..many logical evidence records; immutable physical blobs may be deduplicated. | Each record binds subject/source digest and changed-scope versus context-only role. |
| CoverageRow ↔ Evidence | Many-to-many within the same run/subject; either side may initially have zero bindings. | A satisfied row requires concrete inspected evidence; a contextual read never creates changed scope. |
| Run → CompletionReceipt | Run owns 0..1 terminal publication receipts. | Competing/mismatched terminal identities are conflicts, not additional completions. |
| CompletionReceipt → CR revision | One completed receipt refers to exactly one canonical CR revision. | Canonical artifact journal and runtime terminal intent reconcile by stable receipt identity. |
| Run → approved artifact references | Run pins 1..many existing upstream artifact revisions/digests without owning those artifacts. | Planless routes identify their real approved upstream; approval and source freshness remain separate gates. |

FOUNDATIONAL VALUE I/O. sc6 stageImmutableValue accepts typed reply/evidence objects or bounded text, with canonical serialization and durable blob staging centralized in the storage adapter. The engine does not stringify objects in each caller. ReviewReadReceiptV1 includes bounded text for the reviewer plus an immutable content reference for accepted state; null text means unavailable content, not a successful inspection. Staged values and their digests are validated before a committed transition can reference them.

PER-BLOCK CHECKPOINT CADENCE (stakeholder clarification). A block is an explicitly identified changed block or non-text change entry in the scoped commit packets, not a120-minute batch and not a model-call boundary. After inspecting/assessing a block, persist the evidence, notes, findings, partial coverage and outstanding work immediately, before starting the next block assessment. A block requiring evidence from another block is checkpointed as needs-followup/unverified with its dependency recorded; this does not falsely satisfy the larger task or stop cross-block reasoning. Large blocks may additionally checkpoint bounded inspection progress. Each block assessment/version has a stable progress identity and expected accepted sequence; duplicate progress returns its prior receipt and does not duplicate evidence, findings or usage.

The independent reviewer publishes progress through a narrowly scoped daemon review-progress capability while the managed session remains open. That capability changes only the owned review runtime state; it cannot edit source, approve artifacts or widen packet scope. The coordinator requires the current assessed block's durable acknowledgment before advancing the assessment cursor; context reads needed for cross-block reasoning may still be performed and recorded as partial work. A backend must support in-session progress or explicitly yield at a block boundary; it cannot claim per-block durability while holding all block results until the session ends. No separate model invocation per block is mandated.

A crash after several acknowledged blocks preserves every accepted block checkpoint even if the enclosing model call has not returned. Recovery resumes only unfinished or invalidated work; the attempt may be uncertain while earlier accepted block receipts remain valid. Only an unacknowledged in-flight block result may require reinspection. The120-active-minute/24-attempt run limits are separate pause controls, not checkpoint timers. Pausing preserves already accepted block checkpoints and may capture additional safely accepted partial work; it never waits until the time limit to save progress. Default limits are not a reason to run another complete review after resumption.

PREDECESSOR MCP CONTRACT OWNERSHIP AND MIGRATION. The approved, unbuilt LLD-8315a11f29fd2812-s5 and HLD-8315a11f29fd2812 sc7 (Controller call frames, S005) own the legacy pipeline EmitCallsFrame / AnswersInput protocol across insrc_review_step and insrc_code_review_step. Approval of this HLD does not retire or edit those approved artifacts. S005 remains the owner of that legacy frame/schema and of design-review controller transport. This epic's s3 owns only the investigation-domain turns and per-block progress/receipt contracts; it does not independently add competing unversioned MCP phases. This epic's s6 is the sole owner of the plan-investigation-v1 code-review transport adapter and its MCP schema registration, consuming s3/sc3 and s4/sc4.

At admission, select and bind an explicit engine/protocol version in the run/state before emitting frames. Legacy code reviews and every design-document review continue through the S005 legacy protocol (or the installed pre-S005 compatibility path); new opt-in plan-investigation-v1 code reviews use the new s6 adapter. The existing entrypoint names are routing facades, not permission to interchange answers: validate engine, frame version, run, generation and call/progress identities; reject cross-engine replies and never reinterpret legacy callId answers as block receipts or vice versa. Design review receives no investigation progress/status protocol. Schema extensions must be additive/discriminated, and insrc_schema/tool descriptions must expose the admitted variants accurately. No shared answers branch may silently change meaning.

At phase F adoption, this epic supersedes only S005's code-review requirement that every NEW controller review use chunk-pipeline emit_calls/answers, alongside S002/S003 code chunk/gather behavior. S005 retains legacy code-review compatibility and all design-review ownership. Old in-flight legacy states finish on their original route while valid; volatile states lost on restart remain explicitly non-resumable. New-engine durable states resume only on their own version. Rollback disables new-engine starts, preserves status/export, and refuses unsupported resumes rather than silently converting them. Before enabling adoption, s6 records this precise supersession in the predecessor's supported amendment/tracking process; until that reconciliation is recorded the opt-in gate remains closed. Do not rewrite an approved sibling LLD in place. If S005 ships first or later, its schema changes must preserve this routing partition, with no last-writer replacement of the other adapter.

Required s6 integration fixtures cover legacy under/over-limit code-review frames, pre-S005 saved-state compatibility, design template and premise reviews, opt-in investigation progress inside one session, cross-engine answer rejection, schema discrimination, S005-before/after installation order and rollback. s3 unit fixtures test domain progress without registering MCP transport. Existing independent-party, severity and approval gates are common and unchanged.

PLANNED ACCEPTANCE-TO-TEST MAPPING. These are named test obligations to implement in each owning Story, not executed tests or claimed results. Each row exercises the complete given/when/then of the cited approved DEF criterion; LLDs specify fixture paths and assertions. Routine providers are deterministic/mocked.

| DEF criterion | Test owner / planned test ID | Planned verification |
| --- | --- | --- |
| s1/ac1 | s1 / review-s1-ac1 | Packet parity: indexed/source manifests match tasks and provenance across add/delete/rename/binary/merge fixtures. |
| s1/ac2 | s1 / review-s1-ac2 | Scope exclusion: foreign commits/hunks and unrelated HEAD movement cannot enter; intermediate source remains navigable; ambiguous hunks refuse admission. |
| s1/ac3 | s1 / review-s1-ac3 | Planless/offline: pinned upstream basis, no invented tasks, source navigation without index. |
| s1/ac4 | s1 / review-s1-ac4 | Subject freshness: changed artifacts/blob identity reject mixed revisions. |
| s2/ac1 | s2 / review-s2-ac1 | Ledger universe: tasks/checks/design/blocks/non-text/criteria each retained with disposition. |
| s2/ac2 | s2 / review-s2-ac2 | Evidence links: shared receipts support multiple rows; unsupported pass rejected. |
| s2/ac3 | s2 / review-s2-ac3 | Exceptional changes: deleted/unplanned/unavailable entries remain explicitly unresolved or assessed. |
| s3/ac1 | s3 / review-s3-ac1 | On-demand parity: related tasks share inspection; caller evidence is context only; multi-block progress in one session. |
| s3/ac2 | s3 / review-s3-ac2 | Bounded yield: inclusive budget/time stop preserves pending work and evidence without false completion. |
| s3/ac3 | s3 / review-s3-ac3 | Failure/cancel: bounded transient retry then typed pause without draining backlog. |
| s3/ac4 | s3 / review-s3-ac4 | Trust boundary: deny writes/policy injection and same-party review; assert serial provider dispatch. |
| s3/ac5 | s3 / review-s3-ac5 | Index limits: stale/missing/partial callers stay disclosed and unresolved without widening commits. |
| s4/ac1 | s4 / review-s4-ac1 | Crash recovery: restart after each accepted block before session completion; replay accepted state without redispatch; legacy non-resumable. |
| s4/ac2 | s4 / review-s4-ac2 | Uncertain attempt: crash before acceptance preserves identity and uncertainty; retries never imply external exactly-once. |
| s4/ac3 | s4 / review-s4-ac3 | Concurrency fence: competing resumes/late generations cannot advance or duplicate publication. |
| s4/ac4 | s4 / review-s4-ac4 | Compatibility/allowances: mutate source/contracts/policy/formats/tools; refuse incompatible reuse and retain active-time/attempt accounting across downtime. |
| s4/ac5 | s4 / review-s4-ac5 | Usage replay: stable observations, no replay charge; retries/unknown/estimates remain distinct. |
| s5/ac1 | s5 / review-s5-ac1 | Completion guard: enumerate every required row; missing evidence blocks successful completion. |
| s5/ac2 | s5 / review-s5-ac2 | Adjudication: reject unsupported coverage, assess unplanned work, escalate conflicting requirements. |
| s5/ac3 | s5 / review-s5-ac3 | Publication fault matrix: crash before/after intent, canonical CR and receipt; one reconciled CR, preserved verdict/approval rules, no partial pass. |
| s5/ac4 | s5 / review-s5-ac4 | Post-review freshness: changed source/contracts require new applicable review evidence. |
| s6/ac1 | s6 / review-s6-ac1 | Entry/mode matrix: daemon/controller × indexed/source × planned/planless share subject and completion; test legacy/S005/new-engine routing and cross-engine rejection. |
| s6/ac2 | s6 / review-s6-ac2 | Status/accounting surface: pending/covered/failure/resume and actual/unknown/estimated usage survive reconnect and transport detachment. |
| s6/ac3 | s6 / review-s6-ac3 | Quality evaluation: deterministic adjudicated defect/coverage fixtures vs recorded baseline; measure time/calls/repeated input; live comparisons separately authorized. |
| s6/ac4 | s6 / review-s6-ac4 | Adoption/rollback: predecessor S002/S003 and S005 code-only supersession recorded; both installation orders; legacy CR readability and design template/premise behavior unchanged. |


## 4. Diagrams

- [Sequence diagram](docs/epics/review-planned-changes-through-agent-investigation-E20261028c32aa605/sequence-diagram.html)
- [Component dependencies](docs/epics/review-planned-changes-through-agent-investigation-E20261028c32aa605/component-dependency.html)

## 5. Shared contracts

### 5.1 sc1: ImmutableReviewSubjectV1

**Owner Story:** `s1`
**Consumed by:** `s2`, `s3`, `s4`, `s5`, `s6`

**Purpose:** The only authority for changed scope. Exact selected commit packets identify relevant parent-relative blocks; frozen context can include other source only as context. No HEAD/working-tree diff fallback.

**Interface sketch (type-level):**

```
interface ReviewSubjectV1 {
 readonly version: 1; readonly subjectId: string; readonly subjectDigest: string;
 readonly repoId: string; readonly rootArtifactId: string; readonly storyId: string;
 readonly build: { readonly artifactId: string; readonly revision: number; readonly sourceCommit: string };
 readonly contracts: readonly { readonly artifactId: string; readonly path: string; readonly revision: number; readonly contentDigest: string }[];
 readonly taskBasis: 'approved-plan' | 'approved-upstream';
 readonly tasks: readonly { readonly id: string; readonly description: string; readonly acceptanceChecks: readonly { readonly id: string; readonly text: string }[] }[];
 readonly packets: readonly CommitPacketV1[]; readonly contextTree: string;
 readonly ambiguities: readonly string[];
}
interface CommitPacketV1 {
 readonly packetId: string; readonly commitId: string; readonly parentId: string;
 readonly attribution: { readonly basis: string; readonly evidenceRefs: readonly string[] };
 readonly blocks: readonly { readonly blockId: string; readonly oldPath: string | null; readonly newPath: string | null; readonly oldBlob: string | null; readonly newBlob: string | null; readonly oldLines: readonly [number, number] | null; readonly newLines: readonly [number, number] | null; readonly kind: 'text' | 'binary' | 'rename' | 'mode' | 'delete' | 'add'; readonly attributionRefs: readonly string[] }[];
}
```

**Assumptions cited:** [[c2]]

### 5.2 sc2: EvidenceCoverageV1

**Owner Story:** `s2`
**Consumed by:** `s3`, `s4`, `s5`, `s6`

**Purpose:** Run-scoped evidence and many-to-many coverage bindings. Each approved obligation, packet block/non-text change and applicable criterion has a required row; findings and unresolved work cannot disappear.

**Interface sketch (type-level):**

```
interface EvidenceV1 {
 readonly evidenceId: string; readonly subjectDigest: string;
 readonly kind: 'changed-block' | 'context-source' | 'artifact' | 'test-result' | 'caller-impact';
 readonly source: { readonly path: string; readonly revision: string; readonly digest: string; readonly lines: readonly [number, number] | null };
 readonly role: 'changed-scope' | 'context-only'; readonly inspectedByAttempt: string;
 readonly completeness: 'complete' | 'partial' | 'unavailable'; readonly limitations: readonly string[];
 readonly contentRef: string;
}
interface CoverageV1 {
 readonly rowId: string; readonly subjectDigest: string; readonly requirementRef: string;
 readonly category: 'task' | 'acceptance' | 'design' | 'change' | 'criterion' | 'impact';
 readonly disposition: 'pending' | 'satisfied' | 'finding' | 'unverified' | 'not-applicable';
 readonly evidenceIds: readonly string[]; readonly findingIds: readonly string[];
 readonly rationale: string; readonly assessedByAttempt: string | null;
}
interface ReviewLedgerV1 {
 readonly runId: string; readonly subjectDigest: string;
 readonly evidence: readonly EvidenceV1[]; readonly coverage: readonly CoverageV1[];
 readonly findings: readonly { readonly findingId: string; readonly criterion: string; readonly severity: 'HIGH' | 'MED' | 'LOW'; readonly confidence: 'breach' | 'observation'; readonly evidenceIds: readonly string[]; readonly expectationRefs: readonly string[]; readonly message: string }[];
}
```

### 5.3 sc3: InvestigationContinuationV1

**Owner Story:** `s3`
**Consumed by:** `s4`, `s5`, `s6`

**Purpose:** One bounded independent read-only investigation protocol for both entrypoints/modes. Provider sessions execute requests but never own scope, accepted coverage or completion. Accept incremental per-block progress and durable acknowledgments inside one managed continuation; final replies reference accepted block receipts. Domain protocol only; s6 owns external MCP registration. Legacy sibling 8315a11f/S005 sc7 remains separate.

**Interface sketch (type-level):**

```
interface InvestigationTurnV1 {
 readonly runId: string; readonly subjectDigest: string; readonly generation: number;
 readonly attemptId: string; readonly requestDigest: string; readonly policyDigest: string;
 readonly assignment: readonly string[]; readonly navigationRefs: readonly string[];
 readonly unresolvedRefs: readonly string[]; readonly priorAcceptedCheckpoint: string;
 readonly limits: { readonly attemptMs: number; readonly activeMsRemaining: number; readonly continuationsRemaining: number; readonly inclusiveTokenLimit: number };
}
interface InvestigationReplyV1 {
 readonly runId: string; readonly subjectDigest: string; readonly generation: number; readonly attemptId: string;
 readonly acceptedBlockReceiptIds: readonly string[]; readonly lastAcceptedSequence: number;
 readonly inspectedEvidenceIds: readonly string[]; readonly coverageUpdates: readonly CoverageV1[];
 readonly findings: ReviewLedgerV1['findings'];
 readonly next: { readonly kind: 'continue' | 'request-completion' | 'pause'; readonly remainingWork: readonly string[]; readonly reason: string };
}
interface ImpactCapabilityV1 {
 readonly mode: 'source-only' | 'indexed-impact';
 readonly index: { readonly revision: string; readonly freshness: 'compatible' | 'stale' | 'unknown'; readonly completeness: 'partial' | 'unknown' } | null;
 readonly queryChangedEntityCallers: ((entityRef: string) => Promise<readonly EvidenceV1[]>) | null;
}
interface ReviewBlockProgressV1 {
 readonly runId: string; readonly subjectDigest: string; readonly generation: number; readonly attemptId: string;
 readonly progressId: string; readonly expectedSequence: number; readonly blockId: string;
 readonly disposition: 'reviewed' | 'needs-followup' | 'unverified';
 readonly evidenceIds: readonly string[]; readonly notes: string; readonly coverageUpdates: readonly CoverageV1[];
 readonly findings: ReviewLedgerV1['findings']; readonly outstandingWork: readonly string[];
}
interface BlockCheckpointReceiptV1 {
 readonly runId: string; readonly subjectDigest: string; readonly generation: number;
 readonly progressId: string; readonly blockId: string; readonly sequence: number; readonly checkpointDigest: string;
}
```

### 5.4 sc4: DurableReviewRecoveryV1

**Owner Story:** `s4`
**Consumed by:** `s5`, `s6`

**Purpose:** Daemon-owned acceptance journal, reconstructible checkpoints and exclusive generation/lease fencing; accepted replies are idempotent, uncertain provider outcomes remain explicit. Checkpoint per reviewed block, not only after a whole provider request or at the run time limit.

**Interface sketch (type-level):**

```
interface ReviewRecoveryV1 {
 readonly schemaVersion: 1; readonly runId: string; readonly subjectDigest: string; readonly policyDigest: string;
 readonly state: 'prepared' | 'running' | 'paused' | 'completion-requested' | 'completed' | 'cancelled' | 'stale';
 readonly journalSequence: number; readonly acceptedCheckpointDigest: string;
 readonly owner: { readonly leaseId: string; readonly generation: number; readonly expiresAt: string } | null;
 readonly attempts: readonly { readonly attemptId: string; readonly requestDigest: string; readonly state: 'issued' | 'partially-accepted' | 'accepted' | 'failed' | 'uncertain' | 'cancelled'; readonly acceptedSequence: number | null; readonly usageReceipt: string | null }[];
 readonly activeMsConsumed: number; readonly continuationsConsumed: number;
 readonly blockCheckpoints: readonly { readonly blockId: string; readonly progressId: string; readonly sequence: number; readonly checkpointDigest: string }[];
 readonly outstandingWork: readonly string[]; readonly completionReceipt: string | null;
}
interface ResumeCompatibilityV1 {
 readonly kind: 'compatible' | 'stale' | 'unsupported';
 readonly invalidatedEvidenceIds: readonly string[]; readonly reasons: readonly string[];
 readonly extensionRequired: boolean;
}
```

### 5.5 sc5: ReviewCompletionV1

**Owner Story:** `s5`
**Consumed by:** `s6`

**Purpose:** Validate accountable coverage and source applicability before one canonical CR publication. Required unverified work blocks successful completion; findings retain existing severity/confidence and human override policy.

**Interface sketch (type-level):**

```
interface CompletionAssessmentV1 {
 readonly runId: string; readonly subjectDigest: string; readonly checkpointDigest: string;
 readonly outcome: 'publishable' | 'incomplete' | 'stale' | 'conflict';
 readonly unresolvedRows: readonly string[]; readonly reasons: readonly string[];
 readonly requiredCriteria: readonly string[];
}
interface ReviewCompletionReceiptV1 {
 readonly receiptId: string; readonly runId: string; readonly subjectDigest: string;
 readonly terminalCheckpointDigest: string; readonly artifactId: string; readonly artifactRevision: number;
 readonly verdict: 'pass' | 'warn' | 'block'; readonly coverageRef: string;
}
```

### 5.6 sc6: ReviewRuntimePortsV1

**Owner Story:** `s1`
**Consumed by:** `s2`, `s3`, `s4`, `s5`, `s6`

**Purpose:** Foundational type-level ports avoid making the investigation Story depend backwards on recovery. s4 implements durable storage, s3 uses the port, and s6 composes production adapters. Usage observations flow to existing usage contracts with a durable pending outbox when a writer is unavailable.

**Interface sketch (type-level):**

```
interface ReviewRuntimePortsV1 {
 readonly readEvidence: (subjectId: string, reference: string) => Promise<ReviewReadReceiptV1>;
 readonly stageImmutableValue: (runId: string, value: Readonly<Record<string, unknown>> | string) => Promise<{ readonly reference: string; readonly digest: string }>;
 readonly appendTransition: (runId: string, generation: number, expectedSequence: number, transitionRef: string) => Promise<{ readonly sequence: number; readonly checkpointDigest: string }>;
 readonly recordAttemptUsage: (observation: ReviewUsageObservationV1) => Promise<{ readonly state: 'recorded' | 'pending' | 'unavailable'; readonly receiptRef: string | null }>;
}
interface ReviewUsageObservationV1 {
 readonly runId: string; readonly attemptId: string; readonly observationId: string;
 readonly activity: 'code-review'; readonly chargedArtifactId: string; readonly subjectArtifactId: string;
 readonly providerRequestId: string | null; readonly quality: 'reported' | 'estimated' | 'unavailable';
 readonly providerId: string; readonly modelId: string | null;
 readonly granularity: 'model-call' | 'invocation-total' | 'cumulative-snapshot';
 readonly counters: { readonly inputUncachedTokens: number | null; readonly cacheReadTokens: number | null; readonly cacheWriteTokens: number | null; readonly outputTokens: number | null; readonly reasoningTokens: number | null };
 readonly nativeObservationRef: string | null;
 readonly allowanceTokens: number; readonly elapsedActiveMs: number;
}
interface ReviewReadReceiptV1 {
 readonly reference: string; readonly sourceDigest: string; readonly contentRef: string; readonly text: string | null;
 readonly lines: readonly [number, number] | null;
 readonly completeness: 'complete' | 'partial' | 'unavailable'; readonly limitations: readonly string[];
}
```

### 5.7 sc7: ReviewClientStatusV1

**Owner Story:** `s6`

**Purpose:** Versioned start/status/resume/cancel replies for MCP and daemon clients, retaining legacy CR readability and surfacing state rather than reporting transport silence as a verdict. Sole transport owner for plan-investigation-v1 code reviews, version-routed alongside predecessor 8315a11f/S005 sc7; never replaces design-review or legacy frames.

**Interface sketch (type-level):**

```
interface ReviewClientStatusV1 {
 readonly version: 1; readonly engine: 'plan-investigation-v1' | 'legacy';
 readonly runId: string; readonly subjectDigest: string; readonly generation: number;
 readonly state: ReviewRecoveryV1['state']; readonly coverageRef: string;
 readonly covered: number; readonly required: number; readonly unresolved: readonly string[];
 readonly resume: { readonly available: boolean; readonly reason: string | null };
 readonly consumption: { readonly reportedRef: string | null; readonly estimatedInputTokens: number | null; readonly unavailableAttempts: number; readonly activeMs: number; readonly continuationCount: number };
 readonly receipt: ReviewCompletionReceiptV1 | null; readonly error: { readonly code: string; readonly retryable: boolean } | null;
}
```

## 6. Story boundaries

### 6.1 Story STORY-c32aa60534232f36-s1

**Owns:** `sc1`, `sc6`

Own subject preparation, attribution ambiguity detection, exact Git commit/blob/block navigation and frozen context binding. Define foundational runtime-port types only; do not implement task investigation, a recovery store or new accounting storage. No generic HEAD/working-tree diff may select scope.

### 6.2 Story STORY-c32aa60534232f36-s2

**Owns:** `sc2`
**Depends on:** `sc1`, `sc6`

Own required-row enumeration, evidence identity/provenance and coverage relationships/dispositions. Reuse subject inputs and runtime ports. Keep ledger validation helpers private; do not execute reviewer turns or publish CRs.

### 6.3 Story STORY-c32aa60534232f36-s3

**Owns:** `sc3`
**Depends on:** `sc1`, `sc2`, `sc6`

Own independent read-only task-directed continuation behavior, on-demand source navigation, optional indexed caller/impact enrichment, budget admission, bounded retry/pause and attempt usage emission through foundational ports. In-memory ports are test scaffolding while production selection remains disabled until s4/s6; no durable storage implementation or terminal approval logic. Publish and acknowledge incremental block progress within continuations, with partial cross-block assessments recorded rather than lost. Domain progress contracts only; no competing MCP phase/schema ownership. External registration belongs to s6.

### 6.4 Story STORY-c32aa60534232f36-s4

**Owns:** `sc4`
**Depends on:** `sc1`, `sc2`, `sc3`, `sc6`

Own durable implementation of foundational acceptance/usage-outbox ports, append/replay/checkpoint integrity, lease/generation fencing, uncertain attempts and compatibility/time recovery. Do not alter review criteria or introduce a usage warehouse. Its recovery implementation is composed by downstream s6 rather than consumed backwards by s3. Persist/replay block-level evidence and assessment receipts independently of final provider-call completion.

### 6.5 Story STORY-c32aa60534232f36-s5

**Owns:** `sc5`
**Depends on:** `sc1`, `sc2`, `sc3`, `sc4`, `sc6`

Own completion coverage/freshness/party validation, canonical CR adaptation and idempotent terminal publication receipts. Reuse existing lifecycle and severity/confidence policy. Do not let a completion request, missing evidence or a failed run masquerade as a completed verdict.

### 6.6 Story STORY-c32aa60534232f36-s6

**Owns:** `sc7`
**Depends on:** `sc1`, `sc2`, `sc3`, `sc4`, `sc5`, `sc6`

Own production composition, equivalent MCP/daemon/controller start/status/resume/cancel adapters, status/usage presentation fields, explicit engine rollout/rollback, legacy compatibility and evaluation fixtures. No client opens stores directly; no client-specific board UI or design-review replacement. Sole new-engine MCP adapter/schema owner; reconcile 8315a11f/S005 legacy sc7 as specified in the architecture and record code-only supersession before opt-in. Verify routing partitions across both installation orders.

## 7. Non-functional targets

- **Performance:** No eager whole-source or whole-contract repetition and no mandatory call-per-clause. Bounded read ranges and explicit evidence references prevent unbounded request growth.128K inclusive estimated admission and five-minute continuation cap; default120active-minute/24continuation limits pause with durable progress and explicit extension rather than claim success. Use deterministic/mock providers for routine tests; measure authorized live comparisons against recorded baselines before claiming savings. Block checkpoint acceptance is independent of run duration:120minutes is a pause ceiling, never a save interval. Grouping several block assessments in one session remains allowed.
- **Security:** Daemon owns runtime state and DB access; cloud access remains LLMProvider/CliProvider only. Independent reviewer identity is checked at start and publication. Source reads are pinned and read-only; untrusted repository text is data, not tool/policy authority. Trusted evidence reads cannot escape the declared snapshot/approved-artifact view, graph queries bind to the registered source repo and declared dependency closure, and native adapters that cannot meet pinning/read-only capability refuse explicitly. Private runtime state uses restrictive access; metadata diagnostics contain no raw prompts/evidence.
- **Observability:** Expose run/subject/engine/policy IDs, owner generation, attempt lifecycle, required/covered/unverified rows, pause/stale causes and resume compatibility. Show managed attempt count/active time, observed usage quality and unknown/pending observations distinctly from reservations and estimates. Emit status/heartbeats without replaying accepted work; transport disconnect is not a review verdict. Keep human-readable review reports only in /tmp. Surface latest accepted block/progress receipt and outstanding block IDs so clients can distinguish durable block progress from provider-session liveness.
- **Durability:** Journal-committed acceptance precedes acknowledgment; snapshots/checkpoints are reconstructible and verified against immutable evidence/answer blobs. Detect torn tails and corruption, fence concurrent owners and late replies, preserve uncertain provider outcomes and idempotent completion/usage receipts. Pauses do not erase consumed execution time. Legacy runs are explicitly non-resumable; runtime data remains outside artifact JSON and excluded from changed scope. Every reviewed block is journal-committed before its durable acknowledgment and cursor advancement, even while a native session continues. Accepted block state survives an uncertain or failed enclosing attempt; only unfinished/unacknowledged work is resumed.

## 8. Rollout

**A — scoped subject and foundational ports**

**Stories:** `s1`
**Flag:** `proposed codeReview.engine (legacy default)`

Establish immutable selected commit packets, pinned approved inputs and the foundational port types before any consumer.

**Backward compat:** New contracts are versioned and internal. Legacy review and design-document review remain selected; zero or ambiguous scoped packets refuse admission rather than falling back to HEAD/working-tree diff.

**B — evidence and accountable coverage**

**Stories:** `s2`
**Flag:** `proposed codeReview.engine (legacy default)`

Establish ledger identity and required-row semantics independently with deterministic fixtures.

**Backward compat:** No current CR schema or approval gate changes; evidence/coverage state remains outside workflow artifact JSON.

**C — bounded agent investigation**

**Stories:** `s3`
**Flag:** `proposed codeReview.engine (legacy default)`

Exercise on-demand investigation and source/indexed modes against in-memory foundational ports while the production engine remains disabled.

**Backward compat:** Existing provider routing, independent-party rules and inclusive budget profiles are reused; no requirement to run a full legacy LLM review for each iteration.

**D — durable accepted-state recovery**

**Stories:** `s4`
**Flag:** `proposed codeReview.engine (legacy default)`

Provide production durability, resume compatibility, uncertainty and owner fencing behind the foundational interfaces.

**Backward compat:** Do not reinterpret legacy volatile tokens or metadata-only events as resumable accepted state. Runtime namespace is excluded from Git changes and indexing.

**E — complete and publish one canonical review**

**Stories:** `s5`
**Flag:** `proposed codeReview.engine (legacy default)`

Bind full coverage and source applicability to one terminal CR publication and receipt.

**Backward compat:** Legacy CR records remain readable; old severity/confidence and human approval/override gates remain authoritative. Incomplete execution has status only.

**F — integration and measured adoption**

**Stories:** `s6`
**Flag:** `proposed codeReview.engine (explicit plan-investigation-v1 opt-in)`

Compose production adapters, expose versioned status and recovery, run parity/quality evaluation, then opt in explicitly before considering a default change.

**Backward compat:** Both entrypoints/modes share scope and execution. No silent engine fallback. Rollback prevents new-engine starts, preserves export/status of durable runs and existing CR readers, and leaves design-document reviews unchanged. Explicitly partition predecessor 8315a11f/S005 sc7: retain legacy and all design-review frames; supersede only new code-review chunk-frame dispatch at adoption, after recorded predecessor reconciliation. Reject cross-engine frames and preserve valid in-flight routing.

**Ordering rationale:** The order s1→s2→s3→s4→s5→s6 respects every approved Story edge and every shared-contract owner/consumer edge. Foundational sc6 is owned by s1, its durable backend by s4, and production composition by s6; investigation does not depend backwards on recovery implementation. s6 is the only adoption point. Proposed flags/settings are new design surface, not a claim that they already exist. Packet line spans use one-based inclusive bounds with null for an absent before/after side; LLD fixes exact validation rules. Usage output binds to the existing usage domain without making its separate warehouse rollout a prerequisite. The architecture acceptance-to-test matrix assigns every approved DEF criterion to a named test and owning Story; these are planned obligations. Predecessor S005/sc7 routing reconciliation is an explicit phase-F adoption gate.

**Risky bits**

| Area | Why | Mitigation |
| :--- | :--- | :--- |
| Scope leakage and context/version ambiguity | Mixed commits, merge parents, intermediate edits and stale index mappings can attach foreign hunks or hide impacted callers. | Exact parent/blob/block provenance, explicit ambiguity refusal and independent multi-session fixtures; context-only role cannot create changed-scope entries. Exercise binary/delete/rename/merge and unrelated-HEAD advancement. Require compatibility/source inspection for indexed evidence. |
| False coverage or unsafe recovery/publication | A citation is not substantive proof; crash windows, late replies and duplicate clients can lose accepted work, revive stale state or duplicate final records. | Independent evidence-backed judgments, required-row completion guards, journal-first atomic acceptance, immutable evidence references, generation fencing and idempotent terminal/usage receipts. Simulate failures before and after every acceptance/publication boundary, corrupt tails and unsupported schema versions; unknown provider outcomes stay uncertain. Test one session reviewing multiple blocks, crash after an acknowledged block but before provider completion, and assert only unfinished work resumes. |
| Repeated context, hidden provider usage and integration regression | Opaque native session histories and eager re-review can recreate high costs, while shared legacy code can accidentally change design review. | Compact navigation with explicit progress, grouped task investigation, no unconditional full re-review after a correction and measured invalidation. Distinguish managed continuations from hidden native turns and unknown usage. Keep deterministic tests routine, authorize live comparisons separately, and require design-review/legacy CR compatibility before adoption. |

## 9. Alternatives considered

### 9.1 a1: Daemon-owned durable investigation state machine — **CHOSEN**

One explicit review state machine owns immutable commit packets, evidence/coverage and restart-safe continuations; daemon and controller are execution adapters.

Prepare a small manifest of approved work and exact attributed commit packets, then let an independent read-only reviewer choose its next evidence reads and related task assessments. All results are admitted through a shared coverage and freshness boundary, not merged from eager source partitions. Indexed callers enrich impact evidence without redefining changed scope.

Persist accepted transitions and attempt intents in a daemon-owned append-only journal with reconstructible checkpoints; both execution surfaces use the same generation-bound continuation envelope. A deterministic completion check validates coverage and publishes one compatible CR, while reviewers supply the substantive judgments. Recovery, usage and policy remain independent of any provider's private conversation state.

**Pros:**
- Accepted results survive daemon and provider-session loss without depending on opaque CLI conversation IDs.
- Both entrypoints enforce one scope, coverage, ownership and completion contract; mock failure/replay tests can assert identical accepted state.
- The initial request contains tasks and navigation references rather than repeated whole-source and whole-contract packets.

**Cons:**
- Requires coordinated contracts for subject identity, evidence, durable acceptance and terminal publication across six Stories.
- An issued request whose provider result was not durably accepted can remain uncertain; exactly-once external model execution cannot be promised.

**Cost estimate:** L

### 9.2 a2: Native provider session as the review authority

Give one CLI session the plan and commit packet references and rely on native session resume for investigation continuity.

Start a long-lived read-only reviewer with approved tasks and commit navigation, allowing it to choose its own inspection and return a final verdict. Both modes share that prompt; indexed mode exposes caller lookup as an additional navigation operation.

Persist provider session identifiers and coarse progress, restoring the provider's conversation after interruption. The existing artifact gate consumes the final output while most coverage, evidence selection and recovery semantics remain inside the provider's session history.

**Pros:**
- Uses the native reviewer tool loop without introducing a separate execution continuation for each semantic work group.
- Can share already-read context inside a provider session when that provider supports reliable continuation.

**Cons:**
- Opaque and family-specific session histories do not establish durable accepted evidence or reproducible completion after session loss.
- A session identifier alone cannot prove full task/change coverage, single-owner reply acceptance or safe reuse after contract changes.
- Couples recovery to provider retention and context behavior rather than repository-owned state; cannot satisfy the approved recovery contract by itself.

**Cost estimate:** M

**Rejected because:** Violates k4 and leaves completeness and gating dependent on opaque provider state.

### 9.3 a3: Task-batched static review pipeline

Replace source-size chunks with static task batches, keeping prepare/review/gather plus a durable result cache.

Map task groups to changed commit blocks in advance, send each batch its relevant approved expectations and merge batch findings. Indexed review can add a caller/impact batch using the same selected commit set, and accepted batch outputs can be stored for recovery.

A scheduler chooses batches before substantive investigation. Coverage is checked after all batches complete and retries reuse stored outputs, leaving the existing pipeline's scheduling and gather pattern substantially intact.

**Pros:**
- Retains existing prepared-job, schema-envelope and dimension folding machinery while adding durable batch reuse.
- A static task partition permits a preflight upper bound on scheduled batches before execution.

**Cons:**
- A task-to-source assignment made before investigation can miss cross-task and cross-file interactions or require repeating shared context.
- Preset batches and gather still determine what the reviewer sees rather than allowing evidence needs to drive the review.
- Would require broad fallback batches to preserve accuracy when attribution or task mapping is ambiguous, recreating the measured expansion.

**Cost estimate:** L

**Rejected because:** Violates k1: predetermined batches still choose evidence before investigation and recreate gather/context expansion.

## 10. References

- **[[c1]]** `analyze-bundle` `design.epic.s1.analyzeBundles[0]`
- **[[c2]]** `code` `src/workflow/code-review/grounding.ts:446`
- **[[c3]]** `code` `src/workflow/code-review/subject.ts:121`
- **[[c4]]** `code` `src/workflow/code-review/freshness.ts`
- **[[c5]]** `code` `src/workflow/code-review/gate.ts`
- **[[c6]]** `code` `src/agent/read-only-tool-loop.ts:87`
- **[[c7]]** `code` `src/workflow/artifact-core/repo-lifecycle.ts:27`
- **[[c8]]** `prior-artifact` `docs/epics/review-planned-changes-through-agent-investigation-E20261028c32aa605/DEF.md`
- **[[c9]]** `code` `src/shared/types.ts`
- **[[c10]]** `code` `src/workflow/artifact-core/journal.ts:72`
- **[[c11]]** `code` `src/agent/providers/cli-provider.ts:139`
- **[[c12]]** `code` `src/workflow/review-pipeline/budget.ts:86`
- **[[c13]]** `code` `src/workflow/usage/types.ts:27`
- **[[c14]]** `stakeholder` `Conversation: checkpoint after every reviewed block,2026-10-28` — "checkpoint should be per block"
- **[[c15]]** `artifact` `.insrc/artifacts/LLD-8315a11f29fd2812-s5.json` — "Approved predecessor S005 owns legacy controller call frames; new code-review routing is explicitly partitioned at adoption."
