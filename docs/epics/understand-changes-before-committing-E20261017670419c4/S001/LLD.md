<!-- insrc:artifact LLD-670419c4ad8bea8e-s1 -->

# LLD: E20261017670419c4:S001

## Summary

**Epic:** `understand-changes-before-committing`
**HLD base run:** `wf-1792239015225-9sq2cz`
**HLD effective hash:** `0b18f1868092...`

Keep each learner's check and original attempts recoverable after closing the editor or restarting the daemon. Records remain private and local until the learner deletes them, independent of delivery status. This story supplies validated shared records and commands; later stories supply classification, teaching, the editor and commit enforcement.

## Contents

1. [HLD context](#1-hld-context)
2. [Contract details](#2-contract-details)
3. [Data model changes](#3-data-model-changes)
4. [Diagrams](#4-diagrams)
5. [Interaction with shared contracts](#5-interaction-with-shared-contracts)
6. [Error paths](#6-error-paths)
7. [Test strategy](#7-test-strategy)
8. [Alternatives considered](#8-alternatives-considered)
9. [References](#9-references)

## 1. HLD context

> See **HLD-670419c4ad8bea8e** § 2. Framework summary

**Rollout phase:** Phase A — durable scope
**Owns:** `sc1` (Learner and immutable assessment scope), `sc2` (Durable assessment commands and eligibility boundary)

**Adjacent scope (owned by other stories — do NOT implement here):**
- `s2`: Own context-driven impact prompts, evidence limitation reporting, configuration validation and deterministic requirement mapping. Do not grade understanding or allow a classifier error to become Trivial. — owns `sc3`
- `s3`: Own question/rubric generation, independent verification, authoritative grading, first-response capture and purpose/association assessment. Own daemon-side upstream grading/validation adaptations and provenance. Do not publish answer keys or mutate delivery records. — owns `sc4`
- `s4`: Own guided explanation and fresh reassessment selection, two-retry accounting and explicit gap completion. Preserve the initial answer and do not infer a pass from guidance consumption. — owns `sc5`
- `s5`: Own the dedicated VS Code editor view, accessible question/guidance interactions, inferred association correction, source navigation, pending/error/Unknown display and resume. Adapt useful upstream renderer code only. Render override intents through the shared foundational contract; no UI score authority. Also own Source Control readiness presentation, derived solely from current daemon eligibility. Refresh after assessment/override results, staged/base changes, policy or learner changes and daemon reconnect; immediately mark stale/unavailable rather than showing cached Ready. Provide a reveal-assessment action in Source Control and an accessible status label. Concrete VS Code contribution APIs belong in s5 LLD; do not assume the existing status/config host supplies this integration. — owns `sc6`
- `s6`: Own effective-index capture, hook integration, final scope recheck, receipt lifecycle, concurrency/cancellation/retry handling and post-commit association. Enforce default policy without mutating staged content. Before s7 ships, High/Unknown override requests remain unavailable rather than allowed. — owns `sc7`
- `s7`: Implement explicit High and Unknown exception handling using shared override shapes, record acknowledgment/reason, preserve final message audit trailers and reject forged/missing/stale records. The feature is not released as complete until both automatic pass and explicit override paths are available.

## 2. Contract details

**Surface level:** internal-shared

### 2.1 `AssessmentService`

```typescript
interface AssessmentService { prepare(scope: AssessmentScope): Promise<AssessmentView>; resume(id: string): Promise<AssessmentView>; cancel(command: CommandEnvelope): Promise<AssessmentView>; requestOverride(command: CommandEnvelope, intent: OverrideIntent): Promise<AssessmentView>; }
```

**Parameters:**
- `scope: AssessmentScope` — Internally verified immutable context; never trust renderer-supplied learner or candidate tree as authoritative.
- `command: CommandEnvelope` — Request UUID, assessment ID, expected revision and exact bound scope for mutations.
- `intent: OverrideIntent` — Explicit acknowledgment and reason; unavailable in s1.

**Returns:** `Promise<AssessmentView>` — Redacted canonical view after durable commit; internal domain errors are mapped by RPC into typed result variants, never reduced to generic thrown strings for expected conflicts.

**Errors:**
- `revision-conflict` when Expected revision differs; return current redacted view only after ownership validation.
- `scope-mismatch` when Any scope field differs; preserve original history and invalidate current authorization.
- `unavailable` when Required sibling implementation, identity or scope attestation unavailable.
- `not-found` when Record absent, deleted or belongs to another local principal.
- `schema-unsupported` when Missing/corrupt/newer stored schema; no synthetic empty replacement.

**Preconditions:**
- Daemon owns storage; repository must be registered; caller cannot set score, learner key, state or eligibility.
- Internal trusted context provider supplies identity and validated scope; absent s2/s6 integration cannot authorize.

**Postconditions:**
- prepare deduplicates exact scope per principal; new record starts revision 1, preparing/incomplete/unassessed/unavailable.
- resume retains history; stale context changes view eligibility, never rewrites original scope.
- cancel revokes active jobs/authorization, preserves progress; requestOverride returns unavailable until s7.
- No delivery status/approval writes and no model call in s1.

## 3. Data model changes

### 3.1 `LearnerIdentity` — new

Resolve locally: enumerate already-connected provider account identities without starting login or accepting arbitrary renderer IDs. A provider candidate is {source, authority, stable subject, assurance}; deduplicate only exact source/authority/subject. Exactly one candidate wins; multiple candidates select effective repository git config user.email; zero provider candidates also try Git email, then OS userInfo uid (username where uid unavailable). Trim whitespace, preserve subject/email case; canonical provider authority is normalized host URL. Key is SHA256 of versioned length-delimited source/authority/subject. Git authority is 'git-email'; OS authority includes installation-host ID. Git identity is current configured email, never commit author or agent identity. Missing connector integration returns no candidate with diagnostic, never fabricated provider-confirmed assurance. New daemon identity adapters must inspect existing connection metadata; use authenticated stable IDs where available, never infer account ownership from repository remotes. No automatic account merging or alias migration; aliases empty unless a future explicit linking feature is approved. All records additionally bind daemon OS principal and current resolved learner. Local config identity is attribution, not protection against another process running as the same OS user.


### 3.2 `AssessmentScope` — new

Preserve all sc1 fields, ordered parentOids and commitMode. Canonical serialization with version tag produces scopeFingerprint SHA256; serialize exactly this ordered tuple: ["assessment-scope-v1", repoId, worktreeId, baseOid, stagedTreeOid, commitMode, parentOids, learnerKey, policyRevision, evidenceRevision]. Use canonical UTF-8 JSON array encoding with null preserved and parentOids in their original order, then SHA256; no aliases, omitted fields or object-key ordering dependence. OIDs must be lowercase full 40- or 64-hex of one object format, checked with trusted Git capture in s6; null base only unborn normal commit. Registered canonical repository and worktree identities prevent path aliases. No supplied current-scope hash proves freshness: s6 capture and s2 policy/evidence resolution supply attestations. s1 validates value shape and exact equality, with unavailable until attestations installed. Historical scope is immutable.


### 3.3 `AssessmentRecord and child records` — new

New LMDB named databases understanding_current, understanding_attempt, understanding_audit, understanding_request, understanding_owner_index, understanding_scope_index, understanding_receipt, understanding_meta within existing GraphStore root; use collision-free tuple keys. Schema version1 independent of graph schema. Current value includes assessmentSchemaVersion, id UUID, ownerPrincipal, learner snapshot, immutable scope+fingerprint, revision safe positive integer, state/completion/outcome/eligibility, associations, progress cursor, job descriptor, lifecycleGeneration, createdAt/updatedAt. Attempts keyed (assessmentId, sequence) preserve attemptId, questionId/conceptId, submitted answer, confidence enum unsure/low/medium/high exactly as owned by HLD sc4; unanswered drafts have no submitted attempt and no confidence value, assisted flag, guidance references, submittedAt, evaluation status and criterion results; first response never overwritten. s3/s4 own question/evaluation payload schemas and transitions; foundational persistence accepts only registered validated domain payloads, not arbitrary renderer objects. Audit rows keyed assessmentId/revision/ordinal preserve transitions and references without duplicating raw answers. WorkAssociation retains many-to-many provenance; proposal is not verified. Separate immutable attempt events record later evaluations without rewriting submitted answer. No Lance embedding, indexing, tracker push, telemetry or cloud sync of learner history. Downstream reasoning receives minimum current assessment input through existing providers; private/local describes history storage and sharing, not a new local-only model mandate. Existing GraphStore opens 27 named databases and MAX_DBS is 32; these eight namespaces require 35. Raise MAX_DBS to 64 in src/db/graph/store.ts before opening the added namespaces, with an inventory assertion and fresh/existing-store open tests. Preserve existing named databases and their data; this is an additive namespace change, not a graph schema rewrite.

**Call sites:**
- `src/db/graph/store.ts`

### 3.4 `CommandEnvelope and mutation transaction` — new

Every external mutation includes requestId UUID, assessmentId, expectedRevision and expected scope; principal resolved server-side. Request hash covers command kind and canonical complete payload. Under one withWriteTxn synchronous callback validate ownership, schema, current revision/generation, scope and transition; atomically append attempts/audit, update record/indexes and store dedup result. Exact repeated requestId+hash returns original receipt with current view plus appliedRevision; different payload is request-conflict. Ownership and record existence checked before replay; deletion cannot be replayed into resurrection. Serialize same-assessment writes via LMDB transaction, no provider/network await inside. Durable job descriptor includes id/kind/inputRevision/generation/status. Downstream completion CAS checks these; cancel, deletion and stale transitions discard late completion. Startup atomically marks running jobs interrupted and clears authorizations before serving requests; history/answers survive. No retry counter reset on resume.

**Call sites:**
- `src/db/graph/store.ts:933`

### 3.5 `Assessment RPC result and observation` — new

Proposed RPC module src/daemon/understanding-rpc.ts registers understanding.prepare, understanding.resume, understanding.list, understanding.cancel, understanding.delete, understanding.history and understanding.requestOverride into src/daemon/index.ts; add understanding.watch streaming route using IpcServer stream contract. Request schema rejects additional fields, unsafe revisions, oversized input, arbitrary principal/grade/eligibility. prepare external input {requestId,repoPath,worktreePath} resolves trusted context, not client AssessmentScope. resume/get/history/list re-resolve current learner and check OS ownership. Result envelope {protocolVersion:1,ok:true,value,appliedRevision?} or {protocolVersion:1,ok:false,error:{code,retryable,message},current?:AssessmentView}; revision-conflict carries current only for owner. Codes invalid-input/not-found/revision-conflict/request-conflict/scope-mismatch/unavailable/schema-unsupported/storage-failure. Normal typed failures returned as result, not thrown; unexpected transport errors require refresh and show unavailable. watch {assessmentId,afterRevision?} subscribes before reading snapshot, then emits current projection with monotonically increasing revision; coalescing allowed because each event is complete projection. Event shape {protocolVersion:1,type:'snapshot'|'deleted'|'unavailable',assessmentId,revision?,view?}. Each subscription checks identity; changed identity terminates owner data stream. Reconnect always requests fresh projection and clears cached readiness; revision gaps trigger resume rather than replaying audit. No answer keys in views/events. No editor implementation in s1; s5 implements strict decoder against shared protocol with fixtures supplied here. history cursor is owner-bound assessment sequence, page1..100; list pages owner-filtered; never expose another learner's existence. Wire framing: understanding.watch requests set stream:true. Domain snapshot/deleted/unavailable events are data inside existing IpcStreamMessage {id: requestId, stream:"progress", data:event}; do not add those domain names to IpcStreamKind. Handler sends with id:0 and IpcServer substitutes the request id. Normal termination (deletion, identity change, deliberate service shutdown) sends its final deleted/unavailable event then exactly one {id:0,stream:"done",data:{protocolVersion:1,reason}} and resolves. Validation/fatal failure sends exactly one stream:"error" frame with data:{error:message,recoverable:boolean,protocolVersion:1,code}, then resolves; error is terminal. The server does not emit done automatically. On AbortSignal/disconnect, unsubscribe and release resources in finally without sending frames; no assessment cancellation is inferred from observation disconnect. Transport errors clear cached readiness and require a fresh subscription. Tests validate complete outer frames, request-ID correlation, one terminal frame and no events after terminal/abort. Deliberate shutdown integration: src/daemon/index.ts owns an understanding-service stop hook. Its stopBackgroundWork callback first marks that service stopping (reject new commands/watches), cancels domain jobs, synchronously emits unavailable then done for active watches and unregisters them, before initiating server.close(). Existing send callback remains void. Extend IpcServer internally to track outstanding socket.write callbacks and expose a bounded flushPendingWrites(timeoutMs) promise; flush failures settle as failed delivery, not uncaught rejection. In the healthy closeStores callback await that flush for at most 1000ms before closing any database, then release service resources and continue existing close order. The existing 20-second shutdown backstop and locks-lost SIGKILL path remain authoritative and never wait for this flush; no unconditional delivery guarantee is made for broken sockets, timeout or forced exit. A client treats disconnect without a terminal frame as unavailable and refreshes after reconnect. Test stop hook ordering and real-socket final frames on healthy shutdown, plus bounded backpressure, disconnect, re-entrant shutdown and locks-lost behavior. No frame is emitted after a watch is closed.

**Call sites:**
- `src/daemon/server.ts`

### 3.6 `Deletion and privacy` — new

Retain all acknowledged personal history until learner deletion; no automatic TTL on history. Delete requires explicit {confirmed:true} plus normal revision envelope and affects only current resolved learner's chosen assessment (bulk deletion iterates owned assessments). Single transaction removes current/history/request/index/receipt rows and advances in-memory invalidation generation; absent record is a hard failure for late worker completion, never upsert. Cancel jobs and scrub in-memory projections/cache before acknowledging deletion; emit deleted event without payload then close watches. Retry of delete on absent owned ID returns absent, without preserving personal audit tombstone. No modifications to Git commit messages already written by s7 and no promise to erase user backups; deletion is logical store removal, not secure disk erasure. Never log answers, provider subjects, emails or private payloads; log opaque IDs/error categories only. Store/socket must be accessible only by daemon OS user: validate owned parent/storage path and enforce 0700 directories and 0600 socket/files before enabling understanding, fail closed if ownership or permission checks fail. Same-OS-user processes remain trusted-local boundary; supplied client label/pid is not authentication.

**Call sites:**
- `src/db/graph/store.ts`
- `src/daemon/server.ts`

### 3.7 `Assessment schema and roles` — new

Runtime schema registry with assessmentSchemaVersion=1; validate every persisted row on read and before mutation. Empty new namespace initialized atomically; existing data without version, malformed values, newer version or dangling referenced child returns schema-unsupported/storage-failure, never reset/pass. No old assessment format exists to migrate in s1. Future migrations require backup/checkpoint and atomic version publication; do not implement hypothetical converters. Register understanding.classify/generate/grade/verify/guide in src/config/role-taxonomy.ts as critical/default core, verify descriptors on service initialization; missing role yields unavailable, never unknown-role mid fallback. s1 calls no LLM. Service dependencies expose typed internal domain transition registration for s2/s3/s4/s6/s7 with schema guards; no generic privileged mutation RPC. Receipt envelope exists but s1 never issues one; all eligibility unavailable until downstream authoritative policy/capture installed.

**Call sites:**
- `src/config/role-taxonomy.ts`
- `src/db/graph/store.ts`

## 4. Diagrams

- [Sequence diagram](docs/epics/understand-changes-before-committing-E20261017670419c4/S001/sequence-diagram.html)

## 5. Interaction with shared contracts

| Contract | Role | How |
| :--- | :--- | :--- |
| `sc1` | implements | Define versioned learner identity, immutable scope and association schemas; consume daemon-derived inputs only. Identity precedence follows resolved HLD decisions. |
| `sc2` | implements | Implement durable prepare/resume/cancel, history/deletion and typed transport projection infrastructure; preserve shared service sketch and wrap domain errors in RPC results. Define but do not implement policy authorization/override scoring. Consumer-owned domain commands register validated schemas in later stories. |

## 6. Error paths

**Error cases**

- **Concurrent stale mutation** (recoverable)
  - Detection: Transactional expectedRevision check
  - Response: revision-conflict with owner-only current view; no writes
  - User impact: Refresh before resubmitting
- **Lost response then retry** (recoverable)
  - Detection: requestId and canonical payload hash
  - Response: Same command returns appliedRevision/current view; changed payload returns request-conflict
  - User impact: No duplicate answer or consumed retry
- **Crash or interrupted evaluation** (recoverable)
  - Detection: Startup running-job scan before RPC enablement
  - Response: Persist interrupted job, unavailable eligibility, invalidate receipts; preserve acknowledged attempts
  - User impact: Resume progress without accidental pass
- **Corrupt/newer schema or transaction failure** (recoverable)
  - Detection: Version/schema guards and failed atomic commit
  - Response: Typed failure; no reset or partial success; recovery diagnostic without raw answers
  - User impact: History unavailable pending recovery; commit not authorized
- **Identity or staged/policy/evidence scope changed** (recoverable)
  - Detection: Fresh trusted context comparison
  - Response: not-found for different owner; stale/unavailable projection for same-owner changed scope, original record retained
  - User impact: New check required for new context
- **Deletion races worker/replay** (terminal)
  - Detection: Missing current record or generation mismatch
  - Response: Discard result and reject replay without recreating record
  - User impact: Deleted history stays deleted
- **Unknown domain transition or missing sibling** (recoverable)
  - Detection: Registered schema/handler and role checks
  - Response: unavailable; no pass/receipt
  - User impact: Foundation alone cannot enable commit gate
- **Local privacy cannot be enforced** (recoverable)
  - Detection: OS ownership/path/mode check before feature activation
  - Response: unavailable, no private data accepted
  - User impact: Actionable local permission correction

**Edge cases**

| Input | Expected |
| :--- | :--- |
| Multiple providers and missing Git email | OS identity fallback; no arbitrary provider selection |
| No providers but usable Git email | Use configured Git email before OS fallback |
| Case/whitespace variants and different provider authorities | Trim only subject whitespace; preserve case and authority namespace, no silent merge |
| Partial staged content and message-only amend | s1 represents immutable supplied scope; s6 captures actual intended candidate, never baseline working tree |
| Unsure, original incorrect response and assisted retry | Separate immutable attempts/assessment events and durable counters; s3/s4 define pedagogy |
| Several inferred/proposed task IDs or no association | Preserve provenance and reason; no forced primary or delivery write |
| Watch reconnect, missing revision or identity switch | Refresh full redacted projection; no cached Ready or cross-owner payload |
| History exceeding one page | Bounded owner-only pagination; no automatic retention expiry |

**Invariants to preserve**

- Personal assessment does not alter work item status or approval. [[c1]]
- Retain original responses, confidence and assisted history; uncertainty never becomes pass. [[c1]]
- Daemon owns canonical records and authorization; clients cannot supply grading truth. [[c2]]
- Private local retention ends only on learner deletion; no sharing. [[c3]]
- Reuse Git wrappers; executor auto-approval and hook skipping are not assessment overrides. [[c4]]

## 7. Test strategy

**Test framework:** `Existing node:test + node:assert/strict TypeScript runner with temporary isolated LMDB and sockets. Run npm run build, new understanding tests, affected graph-store/server and role/core-floor suites. No live cloud calls required; fixtures exercise persistence only, actual grader/editor/Git enforcement tests belong s3/s5/s6.`

**Test levels**

- **unit** — Identity, schema, scope and state invariants
  - Subjects: `Single/multiple/zero providers; repo Git-email and OS fallback; whitespace/case/authority collisions; no automatic merge`, `Every scope field affects fingerprint; ordered parents, null base and SHA format validation`, `Malformed/newer/missing schema; unknown transition and role missing fail closed`, `All five roles critical/default core and existing core-floor routing`, `Canonical fingerprint vectors: changing only commitMode changes hash; exact stagedTreeOid and ordered parentOids preserved; explicit null and SHA256 UTF-8 tuple encoding`, `Submitted confidence round-trips all sc4 values unsure/low/medium/high unchanged; unanswered draft distinct from submission`
  - Fixtures: `Injected connected-provider identities, Git config reader and OS principal`, `Fake clock and UUID generator, canonical scope vectors`
- **integration** — Prove durable atomicity and privacy with real temporary LMDB, not mocks alone
  - Subjects: `Persist original/assisted attempts and confidence, close/reopen daemon store, compare all records and associations`, `Concurrent revision writes only one succeeds; duplicate request no extra attempt/audit; payload mismatch rejected`, `Fault before transaction commit rolls back current/history/request/indexes together`, `Startup interrupted-job recovery and late callback discard; no pass or receipt`, `Learner deletion removes every key family/cache, races restart and retry without resurrection`, `Different owner cannot list/read/delete/watch; permission failure refuses activation`, `Completed delivery artifacts byte-identical after prepare/cancel/failure/resume/delete`, `Complete 35-database inventory opens within MAX_DBS=64 for fresh and existing stores; existing rows survive reopen and new namespace initialization`
  - Fixtures: `Temporary isolated graph store using existing store-test setup; never user's live DB`, `Fixture domain module for validated answer events; no production grading in s1`, `Approved delivery artifact copies and fake context attestation`
- **contract** — RPC protocol and reconnect fixture suite for s5 consumer
  - Subjects: `Typed revision-conflict delivered inside result with owner-only projection`, `Unknown fields, forged learner/grade/eligibility, oversized and unsafe numeric inputs rejected`, `Snapshot subscription race, coalescing and reconnect full refresh; no stale Ready`, `Public projection whitelist excludes rubric/answer keys/private job payloads`, `Missing s2/s6/s7 modules return unavailable; override intent never grants permission`, `Actual IpcStreamMessage progress/data framing, substituted request ID, explicit done/error terminal, unsubscribe on abort and no post-terminal events`, `Healthy daemon shutdown with active watch: stop hook before store close, final unavailable/done flushed; 1000ms bounded flush and disconnect/locks-lost paths never hang or imply pass`
  - Fixtures: `Real temporary Unix socket and daemon handlers`, `Versioned public result/event fixtures consumed later by editor decoder`

**Acceptance mapping**

| Criterion | Proving tests |
| :--- | :--- |
| `ac1` | `integration: persisted original and assisted attempts/confidence/association round-trip`, `unit: exact scope and deterministic identity separation` |
| `ac2` | `integration: completed delivery artifacts unchanged across assessment lifecycle` |
| `ac3` | `integration: crash recovery, failed commit rollback and deletion races`, `contract: reconnect/current projection and missing dependencies never pass` |

## 8. Alternatives considered

### 8.1 a1: Revisioned aggregate plus append-only child records — **CHOSEN**

One current record, separate immutable attempts and audit entries, committed together.

Use daemon-owned LMDB namespaces in the existing root transaction. Each command validates a discriminated schema and writes the aggregate, appended history and idempotency result atomically; public projection omits private rubric payloads. Replay is only request deduplication, not event sourcing.

### 8.2 a2: Single serialized assessment document

Embed current record, complete history and request receipts in one value.

Use one versioned LMDB value per assessment with all attempts/audit and idempotency entries embedded, replacing it atomically on every accepted command and deriving a redacted projection.

**Rejected because:** Correctness possible but unnecessary write amplification and unbounded documents for indefinite retention.

## 9. References

- **[[c1]]** `prior-artifact` `docs/epics/understand-changes-before-committing-E20261017670419c4/DEF.md`
- **[[c2]]** `prior-artifact` `docs/epics/understand-changes-before-committing-E20261017670419c4/HLD.md`
- **[[c3]]** `prior-artifact` `.insrc/artifacts/HLD-670419c4ad8bea8e.json` — "User-resolved retention, identity, enablement and Git reuse decisions in meta.questionResolutions."
- **[[c4]]** `code` `src/daemon/tools/executor.ts:38`
- **[[c5]]** `code` `src/db/graph/store.ts:933`
- **[[c6]]** `code` `src/daemon/server.ts`
- **[[c7]]** `code` `src/config/role-taxonomy.ts`
- **[[c8]]** `doc` `docs/pre-commit-understanding-spec.md`
- **[[c9]]** `code` `src/shared/types.ts:851`
- **[[c10]]** `code` `src/daemon/shutdown.ts`

<!-- insrc:review -->

## Review

### ⚠️ Review `WARN` — design.story (design.story)

**0 do not hold · 1 could not be verified · 11 hold** · template `design-spec` · model `cli-codex:gpt-6-astra` · reviewed 2026-10-17T12:44:39.150Z

Only a premise that does not hold blocks approval. One that could not be verified is listed for the reader and does not block.

#### Does not hold (blocks approval)

_None._

#### Could not verify (does not block)

| Check item | Premise | What was tried and what was missing | Action |
| --- | --- | --- | --- |
| change-sites | Existing connection metadata provides a concrete integration path for enumerating authenticated GitHub, GitLab and Jira stable subjects. | The analyzer failed during planning with shaper-llm-unavailable caused by an invalid response schema. Subsequent source searches and reads found GitHub tracker configuration and ghAuthOk(), which runs 'gh auth status' and returns only ok/reason. Repository owner/repo metadata is not authenticated learner identity. No concrete stable-subject enumeration API or GitLab/Jira connection adapter was identified. [files: src/workflow/config/github.ts, src/workflow/tracker/github.ts] | Specify each adapter's module, metadata source, stable-ID field and unavailable behavior. Distinguish a missing integration from an available authenticated identity that the implementation must discover. |
