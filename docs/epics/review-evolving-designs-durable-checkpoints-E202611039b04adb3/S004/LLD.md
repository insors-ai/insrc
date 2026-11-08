<!-- insrc:artifact LLD-9b04adb36cac716d-s4 -->

# LLD: STORY-9b04adb36cac716d-s4

## Summary

**Epic:** `review-evolving-designs-durable-checkpoints`
**HLD base run:** `wf-1793694252789-heyhey`
**HLD effective hash:** `20a9ee7f3bdf...`
**Tracker:** [insors-ai/insrc#107](https://github.com/insors-ai/insrc/issues/107)

S4 connects the existing design-review coordinator to ordinary artifact approval. Complete review history is published once through the artifact store, while the head keeps a compact revision-bound reference. Approval checks the current subject and independent review, and safe artifact-scoped cleanup removes only permanently preserved inactive checkpoints. [[c20]]

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

> See **HLD-9b04adb36cac716d** § 2. Framework summary

**Rollout phase:** D — approval and closeout
**Owns:** `sc5` (Permanent review publication and approval cleanup)
**Consumes:** `sc1` (Design review subject, policy and semantic chunk contract), `sc2` (Durable review attempts, feedback and progress), `sc3` (Change invalidation and bounded technical recovery), `sc4` (Impact-selected attempt and retained coverage)

**Adjacent scope (owned by other stories — do NOT implement here):**
- `s1`: Deliver the first useful normal-entrypoint review: latest-subject resolution, opposite-party execution, shared artifact-specific policy, reviewer chunk planning, sequential inspection, durable completed results, visible progress and a retrievable consolidated report. Keep prompt construction, native/controller exchange and checkpoint IO private; no shared-engine migration. Produce real narrow hosted-review evidence as well as deterministic fixtures. — owns `sc1`, `sc2`
- `s2`: Own interruption/recovery transitions, reviewed-subject monitoring, cancellation/late-response rejection, the single retry budget and user-decision pause. Native activity integration is private; callers consume recovery state/actions, not process internals. Preserve sc1/sc2 semantics and no external-file invalidation. — owns `sc3`
- `s3`: Own reviewer-led direct/indirect impact assessment, old/new plan mapping, conservative full-review fallback, retained coverage and finding reconciliation. Its document comparison/selection implementation stays private; expose only auditable scope reasoning and provenance, not a generic dependency engine. — owns `sc4`

## 2. Contract details

**Surface level:** internal-shared

### 2.1 `PermanentDesignReview`

```typescript
interface PermanentDesignReview { readonly kind:'design-chunk-review'; readonly schemaVersion:1; readonly reviewId:string; readonly artifactId:string; readonly reviewer:'daemon'|'controller'; readonly attempts:readonly DesignAttempt[]; readonly applicableAttempt:number; readonly status:DesignReviewStatus; readonly impact?:DesignImpactAssessment; }
```

**Returns:** `PermanentDesignReview` — sc5 permanent outcome; publication metadata adds source revision/hash, document identity, content identity and preservation digest.

**Preconditions:**
- Canonical subject and all saved attempts validate through sc1-sc4; no missing mandatory coverage is converted into a pass.

**Postconditions:**
- Append-only history retains baselines, plans, accepted feedback, retained origins/finding decisions, model/party where known, technical summaries/actions and failure states. No raw transcript or fake legacy claims.
- Grounded on the current S4 context and owned sc5 contract. [[c20]] [[c21]]

### 2.2 `DesignReviewCoordinator`

```typescript
interface DesignReviewCoordinator { recover(input:unknown,context?:DesignStartContext):Promise<DesignReviewAcknowledgement>; progress(project:string,reviewId:string,attempt:number,options?:{includeResult?:boolean;afterCompletedChunk?:number;artifactPath?:string}):Promise<DesignObservation>; }
```

**Parameters:**
- `input: unknown` — Existing transport request decoded by parseDesignRequest.
- `context: DesignStartContext` _(optional)_ — Existing trusted host context; publication resolves no provider.

**Returns:** `Promise<DesignReviewAcknowledgement|DesignObservation>` — Normal start/recover/progress route; proposed internal publication and cleanup operations remain owned by this coordinator.

**Errors:**
- `DesignReviewError` when Unknown identity, conflicting replay, changed subject or invalid saved evidence; publication error retains checkpoint/results and never restarts models.

**Preconditions:**
- Main-daemon registry owns review and artifact exclusion; controller/native trust and subject route remain S1 contracts.
- The existing unknown input is a transport trust boundary decoded with parseDesignRequest; it is not an untyped application value.

**Postconditions:**
- Save the consolidated checkpoint before background publication. Expose DesignPublication pending/complete and durable history reference. retry_publication is explicit and model-free. After cleanup progress/result resolves from permanent history by canonical artifact/review identity without recreating a checkpoint.
- Grounded on the current S4 context and owned sc5 contract. [[c20]] [[c21]]

### 2.3 `ArtifactStore.updateAndLog`

```typescript
type ArtifactMutation=(current:Artifact<HeadPayload>&{changeLog:ChangeLogEntry[]})=>UpdateResult|undefined|Promise<UpdateResult|undefined>; updateAndLog(id:string,by:Actor,mutate:ArtifactMutation,options?:WriteOptions,create?:()=>Artifact<HeadPayload>):Promise<{wrote:boolean;entry?:ChangeLogEntry}>;
```

**Parameters:**
- `id: string` — Exact DEF/HLD/LLD id.
- `by: Actor` — Trusted publication actor.
- `mutate: ArtifactMutation` — Validate current head/history and build a single review lifecycle update.
- `options: WriteOptions` _(optional)_ — Proposed additive validated entryId for deterministic journalled publication.

**Returns:** `Promise<{wrote:boolean;entry?:ChangeLogEntry}>` — Reuse the existing queue and journal for full review outcome plus compact head binding in one recoverable write.

**Errors:**
- `LifecycleConflictError` when Source/integrity/entry id conflicts; no approval is authorized.
- `HistoryEntryError` when Framed, journal or configured publication capacity exceeded; saved results remain recoverable.

**Preconditions:**
- No nested call to update/apply inside exclusive/updateAndLog for the same artifact.
- Proposed entryId is deterministic from project/artifact/review/attempt, checked for exact payload equality before append; ordinary writers retain existing ids.

**Postconditions:**
- Under the artifact queue recover the journal, verify integrity and current source binding, compare any existing id, then journal outcome and head reference together. Existing equal receipt returns idempotently; conflicting payload refuses. History durability precedes a complete publication ACK.
- Grounded on the current S4 context and owned sc5 contract. [[c20]] [[c21]]

### 2.4 `LifecycleService.apply`

```typescript
apply(id:string,op:Operation,by:Actor,detail?:TransitionDetail,ctx?:EvidenceContext):Promise<ApplyResult>
```

**Parameters:**
- `id: string` — Canonical artifact id.
- `op: Operation` — Existing review/approve lifecycle operation.
- `by: Actor` — Existing trusted approval/reviewer actor.

**Returns:** `Promise<ApplyResult>` — Keep the final design-review applicability check inside the existing artifact update queue, including direct lifecycle approval callers.

**Preconditions:**
- For DEF/HLD/LLD normal approval, the new-format history entry must resolve, be complete, belong to the exact artifact, match current revision/content/document/context and trusted opposite party.
- A human-authorized nonempty override follows existing integrity and authorization rules and records its reason; it does not manufacture passed review data.

**Postconditions:**
- HIGH/MED, incomplete/paused/invalidated/missing/malformed/foreign/same-party or stale evidence blocks ordinary approval. Fully reviewed LOW-only or clear reports map to pass; advice is not a warning blocker. Only a successful approval schedules cleanup outside the store queue.
- Grounded on the current S4 context and owned sc5 contract. [[c20]] [[c21]]

### 2.5 `approveArtifactByJsonPath`

```typescript
approveArtifactByJsonPath(jsonPath:string,opts:ApproveOptions):Promise<ApprovalResult>
```

**Parameters:**
- `jsonPath: string` — Canonical artifact head, resolved through existing path/identity helpers.
- `opts: ApproveOptions` — Existing human authorization/override plus a proposed optional daemon-owned design cleanup hook.

**Returns:** `Promise<ApprovalResult>` — Central workflow/IDE/TUI approval uses the same lifecycle gate and reports scoped cleanup results.

**Preconditions:**
- Use the actual artifact kind: review required for DEF/HLD/LLD; ISSUE/SPEC/PLAN remain human-only gates. An issue's LLD still requires design review.
- No invented HLD/DEF requirements for standalone or issue routes.

**Postconditions:**
- Preserve BUILD/code-review behavior. After successful design-artifact approval invoke artifact-specific cleanup; failed approval does not clean. Reapproval preserves the original approval and may retry cleanup. Cleanup failure is explicit and does not roll back approval.
- Grounded on the current S4 context and owned sc5 contract. [[c20]] [[c21]]

### 2.6 `reviewRecordOf`

```typescript
reviewRecordOf(log:readonly ChangeLogEntry[],artifactId:string,review:Pick<Review,'report'>):StoredReviewRecord|undefined
```

**Parameters:**
- `log: readonly ChangeLogEntry[]` — Existing append-only artifact history.
- `artifactId: string` — Exact owner.
- `review: Pick<Review,'report'>` — Existing change-log-entry reference.

**Returns:** `StoredReviewRecord|undefined` — Proposed discriminated read-only union distinguishes legacy report/resolutions from design-chunk-review v1.

**Preconditions:**
- Unknown/new malformed versions and missing referenced data fail closed for normal approval; never fall back to compact pass metadata.

**Postconditions:**
- Existing legacy history still renders as legacy, without execution or synthesized claims. New-format readers expose chunk reports directly through existing artifact-content, delivery and CLI paths; preserve common IPC fields/methods and qualify both current IDE clients. Old approvals remain historical; new normal design approvals require applicable new-format evidence or explicit override.
- Grounded on the current S4 context and owned sc5 contract. [[c20]] [[c21]]

## 3. Data model changes

### 3.1 `PermanentDesignReview and publication binding` — new

One artifact owns 0..many immutable review log entries; each entry owns exactly one review-id/applicable-attempt and a complete ordered prefix of attempts. Each applicable attempt has one baseline, one accepted plan when planned, 0..many results, and explicit sc4 retained origins. The compact lifecycle Review points to at most one current entry through the existing change-log-entry/reviews Reference. Proposed new record module: src/workflow/review/design-review/history.ts; proposed publisher: src/workflow/review/design-review/publication.ts. Records include sourceRevision {number,contentHash}, reviewedContentIdentity, document digest, workflow-context/author binding and a canonical preservation digest. Stored attempts retain meaningful S1-S3 state; volatile progress/current owner/publication receipt are excluded only from the documented comparison digest, never from accepted feedback, baseline, scope or failure history. Native model is recorded when known; historical/controller unknown attribution stays explicitly unknown, not invented. [[c20]] [[c21]]

**Call sites:**
- `src/workflow/review/design-review/coordinator.ts`
- `src/workflow/artifact-core/store.ts`
- `src/workflow/review/report-log.ts`

### 3.2 `DesignPublication` — new

sc5 state pending|complete, deterministic historyEntryId/reportReference and optional pointed publication error; optional metadata on a saved attempt/observation, not a new execution ledger. Save the report first, publish in background, then ACK complete only after journal recovery and exact readback. A crash after publication before checkpoint ACK finds the same entry and completes without a model call. Original baseline/report identities remain immutable. Publication changes only known lifecycle/render metadata; canonical Markdown is not rewritten to append a report. Existing artifact-content rendering supplies the review view. Record the exact allowed pre/post publication head fingerprints; suppress self-invalidation only for that owned metadata write and detect any additional subject delta. No blind baseline refresh. After checkpoint deletion, progress accepts an additive optional artifactPath; it is required when no local mapping exists, resolves through sc1, and reads the exact artifact's history. Missing locator returns an explicit artifact-reference-required error; never scan all projects or recreate a checkpoint. [[c20]] [[c21]]

**Call sites:**
- `src/workflow/review/design-review/contracts.ts`
- `src/workflow/review/design-review/coordinator.ts`
- `src/workflow/review/design-review/subject.ts`
- `src/daemon/design-review-rpc.ts`

### 3.3 `Bounded design-history framing` — invariant-change

Grounding correction: src/workflow/artifact-core/sidecar.ts currently caps every framed record at 256 KiB. The winning shape therefore requires a narrowly format-scoped size policy for design-chunk-review v1, using the existing review.maxJsonBytes setting and the existing 64 MiB design-checkpoint ceiling as an absolute design-history bound. All legacy/feedback/ordinary records retain 256 KiB. The framed reader first bounds declared length by the permitted outer maximum, then parses and applies the exact kind-specific bound; unknown kinds never acquire the larger allowance. Sync/async readers, writer and journal share this policy. Count actual UTF-8 framed JSON and journal escaping, not characters. Preflight the current baseline/prior attempts before dispatch and recheck accepted results and publication. Oversize data is never trimmed: preserve it in the bounded checkpoint, report publication capacity pending, and allow explicit model-free retry after a sufficient configured limit is available. The existing checkpoint limit is not silently expanded. [[c20]] [[c21]] [[c22]] Before every provider dispatch (planning, impact, chunk or retry), compute an encoded-byte upper bound for the post-response checkpoint, including the maximum schema-valid response at that boundary, JSON escaping/envelopes, any duplicated consolidated report, complete prior attempts and a bounded reserve for terminal error, recovery and publication metadata. Bound every otherwise unbounded field/collection contributing to that reserve in the host input/output validators. The bound must use the serializer and limits shared with saveDesignCheckpoint, not a heuristic percentage. Reserve consolidation capacity before the final result is requested; refuse dispatch with a durable capacity error if the complete worst-case snapshot exceeds 64 MiB. Never accept a result that the admitted reservation cannot durably save. Capacity refusal happens before spending model work; preserve the preceding snapshot and recover only after a permitted operation can fit, without discarding prior feedback or silently expanding the ceiling. A configured permanent-history limit may be raised for publication retry, but cannot repair checkpoint overflow and is not offered as its remedy. Aggregate-schema compatibility is part of the same reservation contract, not a separate after-the-fact validation. Keep per-chunk model limits unchanged. Give consolidated limitations its own lossless bound derived from maximum planned chunks times the accepted per-chunk limitation bound (128 × 8192 for model-supplied limitations), plus separately bounded host-generated missing-reference and reconciliation diagnostics. Validators must explicitly bound and account for host additions before acceptance. Do not reuse a per-chunk array limit for a concatenated report. Likewise derive aggregate finding/provenance limits from the admitted current plan and immutable prior history; a valid set of accepted per-chunk findings must not fail the current 256-effective-origin cap at consolidation. The finite absolute bound is attempts × chunks × per-chunk findings, with actual admissibility constrained by the pre-dispatch serialized checkpoint reservation. Use the same derived limits for full and impact consolidation, checkpoint validation, permanent publication and report readers. Preserve order, origin and every entry; do not truncate, deduplicate semantically distinct diagnostics, or relabel findings to fit a bound. Include duplicated aggregate arrays and host-added diagnostics in reserved bytes. Consolidation of an admitted complete result set must satisfy both cardinality and byte bounds without another model call.

**Call sites:**
- `src/workflow/artifact-core/store.ts`
- `src/workflow/artifact-core/history.ts`
- `src/workflow/artifact-core/types.ts`

### 3.4 `Revision-bound approval evidence` — invariant-change

The lifecycle review stores only party, pass/block, counts, revision and report reference. Current applicability requires the exact canonical artifact id, store-verified authored revision/hash, current Markdown digest, workflow context and opposite party to match the permanent entry. Recompute this under LifecycleService.apply's approval queue so direct callers cannot bypass a pre-read gate. Report completeness comes from sc1-sc4 consolidation, not severity alone; a new unfinished/invalidated current attempt cannot be hidden behind an older pass. Capture state under the coordinator's per-artifact fence with fixed lock order coordinator fence -> artifact queue; never await providers or a second queued lifecycle write while holding that queue. Raw subject edits observed before/after publication or immediately before approval refuse/invalidate; external unrelated-file edits remain ignored. [[c20]] [[c21]]

**Call sites:**
- `src/workflow/artifact-core/lifecycle-service.ts`
- `src/workflow/gates.ts`
- `src/workflow/review/report-file.ts`
- `src/workflow/review/design-review/subject.ts`

### 3.5 `DesignCleanupResult and ownership` — new

Proposed cleanup module: src/workflow/review/design-review/cleanup.ts. The main coordinator owns a short per-project/per-artifact fence excluding start, correction, publication and cleanup for that artifact. Cleanup runs outside the approval store transaction and never waits for model work: active ownership returns retained(reason). Filter bounded no-follow checkpoint identity by exact project and artifact id before any deep validation; same s1 or same slug is insufficient and no unrelated Git history is replayed. For each matching inactive file verify stored approval, known-format permanent coverage and exact preservation digest of every attempt, including interrupted/invalidated/failed attempts. Never discard unfinished state merely because an override approved the artifact: retain it with the unpublished/unfinished reason. No extra archival execution job is introduced; a later completed publication can preserve the full prior prefix.  Replace pathname check-then-unlink with a claim protocol. Under the artifact fence, atomically rename the candidate into a uniquely created private mode-0700 cleanup directory on the same filesystem, without overwriting any existing destination. Read/validate the claimed object with no-follow bounded I/O and compare its identity, exact bytes and full preservation digest with the verified candidate and permanent history. Delete only the verified claimed object inside that private namespace; never unlink the original public checkpoint pathname, which may now name a replacement. If the claimed object is foreign, changed, active, corrupt or unpreserved, retain it in quarantine with an explicit path/reason and restore it only with no-clobber semantics when the original pathname is absent. Never overwrite a replacement to restore. A crash leaves discoverable claim metadata; recovery verifies ownership, preservation and identity before completing deletion or retaining quarantine. A new checkpoint at the public pathname remains untouched and prevents releasing its replay state. This protects public-path replacement by external writers; it does not claim protection against an actor with the same OS credentials modifying the private namespace itself. Registry replay state is released only after actual deletion. Repeated cleanup and absent files are safe. [[c20]] [[c21]]

**Call sites:**
- `src/workflow/review/design-review/checkpoint.ts`
- `src/workflow/review/design-review/coordinator.ts`
- `src/daemon/design-review-rpc.ts`
- `src/workflow/gates.ts`

### 3.6 `Route and reader compatibility` — invariant-change

Use sc1's canonical subject.workflow, requiredReferences and notApplicableRoles. Epic DEF has no fabricated upstream HLD; epic HLD/LLD use only route-produced references. Standalone LLD and sized-issue LLD use their actual SPEC/ISSUE/design references, not an assumed DEF/HLD chain. ISSUE/SPEC/PLAN themselves gain no mandatory design review. Findings retain stable design finding ids and retained provenance; user resolutions cannot silently turn incomplete/invalidated coverage into complete. New-format gate/render paths do not call legacy ReviewReport claim extraction or retired engines. Existing approved legacy artifacts remain readable and idempotent; no mass backfill, fallback flag, dashboard or activation proof system is introduced. [[c20]] [[c21]]

**Call sites:**
- `src/workflow/review/design-review/subject.ts`
- `src/workflow/review/report-log.ts`
- `src/workflow/artifact-content.ts`
- `src/workflow/delivery/load.ts`
- `src/cli/services/workflow.ts`

## 4. Diagrams

- [Sequence diagram](docs/epics/review-evolving-designs-durable-checkpoints-E202611039b04adb3/S004/sequence-diagram.html)

## 5. Interaction with shared contracts

| Contract | Role | How |
| :--- | :--- | :--- |
| `sc5` | implements | Own versioned history publication, normal gate integration, guarded cleanup and final deterministic/compiled/live qualification. Proposed helper modules are internal to this contract. [[c20]] |
| `sc1` | consumes | Reuse canonical route/subject, trusted reviewer and common policy; no new scope or prompt engine. [[c20]] |
| `sc2` | consumes | Reuse atomic checkpoints, accepted chunk feedback, report and progress; add only publication receipts/archival projection needed by sc5. [[c20]] |
| `sc3` | consumes | Preserve invalidation, retry counts and directed recovery. Publication retry is persistence-only; no extra model execution or counter reset. [[c20]] |
| `sc4` | consumes | Persist and validate the accepted impact plan, finding decisions and retained-coverage closure exactly. Never re-judge relevance during publication/cleanup. [[c20]] |

## 6. Error paths

**Error cases**

- **Subject changed during publication or between review lookup and approval** (recoverable)
  - Detection: Re-read canonical artifact integrity/revision/hash, document digest, route/author binding and observed fingerprints inside the coordinator fence and artifact queue, with a final post-write identity check.
  - Response: Refuse normal approval and invalidate active work through sc3. A known owned lifecycle-only publication delta is accepted by its exact receipt; any extra delta is not. Keep feedback/checkpoint. [[c20]] [[c21]]
  - User impact: User must authorize a fresh full attempt when the reviewed artifact changed; external unrelated files remain ignored.
- **Missing, corrupt, foreign, unresolved or unknown-version permanent record** (recoverable)
  - Detection: Discriminated record validator checks exact owner/reference/key, contiguous history, accepted plan/coverage, sc4 provenance and payload digest; current head integrity is verified.
  - Response: Fail closed for ordinary approval; no fallback from an unreadable record to compact pass metadata. Preserve existing history for repair or a new authorized review. [[c20]] [[c21]]
  - User impact: Explicit error identifies the unavailable evidence; an authorized override still follows existing integrity policy.
- **HIGH/MED findings or mandatory incomplete coverage, paused/latest active work or same-party review** (recoverable)
  - Detection: Check consolidated status, counts, limitations, latest checkpoint/coordinator state and current trusted author/opposite reviewer under the same artifact fence.
  - Response: Block normal approval; preserve original outcome. Existing explicit nonempty human override is recorded, never translated into a passed review. [[c20]] [[c21]]
  - User impact: Findings or gaps remain visible after override.
- **Crash or I/O failure around log append, head replacement or publication receipt save** (recoverable)
  - Detection: Existing journal recovery and exact deterministic entry-id/payload comparison identify whether the publication exists and whether its head binding agrees.
  - Response: Keep publication pending unless durable evidence is proved. Explicit retry_publication recovers/reconciles the same journal/key without providers or repeated chunks. Conflicting bytes reject. [[c20]] [[c21]]
  - User impact: No lost accepted feedback or wasted model rerun.
- **History/frame/journal capacity exceeded** (recoverable)
  - Detection: Before every dispatch calculate serializer-based worst-case checkpoint bytes for the bounded response, consolidation duplication and bounded terminal metadata, including a capacity-refusal snapshot; separately enforce actual frame/journal publication limits.
  - Response: Reject dispatch durably before model work when its reservation cannot fit the fixed checkpoint ceiling. Never trim accepted feedback. Publication-only overflow keeps the fully saved checkpoint pending and permits explicit model-free retry after a sufficient allowed history setting. Raising that setting never repairs checkpoint overflow. [[c20]] [[c21]]
  - User impact: No false publication or cleanup; a limit reached after review does not require rerunning models.
- **Cleanup collides with review start, correction, publication or another cleanup** (recoverable)
  - Detection: The main-daemon per-artifact registry fence reports an owner, including admission and queued publication.
  - Response: Return retained(reason=active) promptly; do not queue indefinitely, cancel another owner or hold the artifact store queue over cleanup. Idempotent approval/cleanup retry is explicit. [[c20]] [[c21]]
  - User impact: Approval stands while temporary state remains safely recoverable.
- **Unsafe, foreign, changed or unpreserved checkpoint at cleanup** (recoverable)
  - Detection: Filter exact bounded identity, atomically claim into a private same-filesystem cleanup directory, then verify the claimed object's bytes and full preservation against permanent history.
  - Response: Never unlink the public checkpoint pathname. Delete only the verified private claim; retain mismatched claims in quarantine with an explicit path/reason and restore only without clobbering a replacement. Crash recovery repeats verification; unfinished override state remains retained. [[c20]] [[c21]]
  - User impact: Only proved matching inactive checkpoints are removed; other work remains intact.
- **Caller reads a result after checkpoint cleanup with no artifact locator** (recoverable)
  - Detection: No checkpoint/registry mapping exists and progress lacks the proposed optional artifactPath.
  - Response: Return artifact-reference-required; with the locator resolve the canonical subject and exact history entry. No global search, model call or checkpoint recreation. [[c20]] [[c21]]
  - User impact: Saved report remains accessible through its permanent reference or an explicit artifact path.

**Edge cases**

| Input | Expected |
| :--- | :--- |
| Complete LOW-only review, or optional execution/visual rendering unavailable but required design evidence otherwise adequate | LOW-only passes; optional advice never becomes a false incomplete/block. Genuine missing mandatory coverage remains incomplete. [[c20]] |
| Idempotent publish and repeated approval after a previously completed cleanup | Same payload/key is reused; approval time/reason remain unchanged, missing checkpoint is success and result reads from permanent history. [[c20]] |
| Epic DEF, epic HLD/LLD, standalone LLD and sized-issue LLD | Resolve actual route references; require no unproduced artifacts. ISSUE/SPEC/PLAN remain outside mandatory design review. [[c20]] |
| Latest complete publication contains older interrupted, invalidated or technically failed attempts | Preserve those attempts and their exact meaningful provenance, counters/actions and baselines; none are relabelled as passed. Cleanup can proceed only when the full prefix is represented. [[c20]] |
| Legacy approved artifact/report alongside a new-format design review | Historical readers remain version-aware and read-only. New normal approvals require new-format evidence or explicit override; no legacy execution or automatic migration. [[c20]] |
| Review metadata publication changes canonical JSON, but authored content and Markdown remain unchanged | Preserve original reviewed baseline and revision; recognize only the publisher's exact lifecycle delta. Do not append mutable review text to the canonical Markdown. [[c20]] |

**Invariants to preserve**

- sc1-sc4 remain authoritative for subject, trust, retries, mutation and impact; S4 adds publication/approval/cleanup only. [[c20]]
- Full review results live in artifact history, with a compact lifecycle reference and no head event arrays or raw native transcripts. [[c25]]
- Daemon owns state and registry fences; use CliProvider for any hosted qualification and retain existing code-review behavior. [[c7]]

## 7. Test strategy

**Test framework:** `Existing Node.js node:test and node:assert/strict TypeScript tests, executed with Node22 + tsx; source inspection of the analyzer-located design-review fixtures confirms these imports. Deterministic fixtures use temporary repositories and fake activity providers; hosted evidence is separately labelled. [[c21]]`

**Test levels**

- **unit** — Pure schemas, applicability, versioned read paths and framing policy.
  - Subjects: `U1: Versioned permanent payload validates every attempt, baseline, plan, accepted result, retained finding/coverage origin, model/party, failure/action history and exact preservation digest; missing/foreign/duplicate/tampered data rejects.`, `U2: UTF-8 frame/journal size policy accepts exact boundaries and rejects one byte over, malformed declared lengths, unsupported versions and oversized unknown/legacy/feedback kinds; only known design records receive the configured allowance within the existing design ceiling.`, `U3: Version-aware log, artifact-content, delivery and CLI readers preserve legacy display and expose new chunk findings without fabricated claims; current VS Code and JetBrains wire contracts retain existing common fields.`, `U4: Normal approval requires current complete opposite-party new-format evidence; HIGH/MED, stale body/document/context, same-party, incomplete, invalidated, paused/latest active and missing referenced records block; LOW-only/advice passes; explicit override remains truthful.`
  - Fixtures: `S1-S3 typed checkpoints and reports plus legacy immutable history fixtures.`, `Exact-size ASCII/Unicode framed records; unknown-kind and corrupt-header fixtures.`
- **integration** — Prove journal/queue/gate/cleanup behavior through normal boundaries without hosted calls.
  - Subjects: `I1: Crash/fault injection at journal stage, history append, head replace and checkpoint publication ACK recovers one identical entry/reference with zero model reruns; conflicting replay never overwrites history.`, `I2: Queued and direct subject changes before/during publication and immediately before approval refuse stale evidence; only exact owned lifecycle metadata is exempt, unrelated source changes are ignored and canonical Markdown is not rewritten.`, `I3: DEF/HLD/LLD normal MCP/daemon approval and direct LifecycleService approval share the same gate; epic, standalone and issue-linked routes require only their actual documents, while ISSUE/SPEC/PLAN remain human-only gates.`, `I4: Successful artifact approval cleans only matching inactive fully preserved checkpoints; verify every attempt including older failures, and retain latest unpublished work after override, foreign same-s1/slug records, corrupt/symlink and file-replacement races. Inject replacement immediately before claim, after claim verification and at the old public-path unlink boundary: no public pathname is unlinked, unverified claimed bytes survive in quarantine, and new public bytes remain intact. Inject crashes after claim and before deletion, and exercise no-clobber restore with a replacement present.`, `I5: Cleanup/start/correction/publication contention on one artifact returns retained promptly, while independent artifacts progress; fixed lock order avoids recursive store queues and no provider or unrelated Git-history replay runs under cleanup.`, `I6: After cleanup and a fresh daemon instance, exact artifactPath/history reference retrieves the permanent result without a checkpoint or model; missing locator rejects rather than scanning projects.`, `I7: Both reviewer parties publish S1-S3 fixture outcomes for interruption/recovery, technical retry pause, mutation invalidation, selective retained coverage and final consistency with unchanged semantic results and real provenance.`, `I8: Before planning/impact/chunk/retry dispatch, checkpoint-ceiling tests at exact and one-byte-over serializer bounds reserve maximum response, consolidation duplication and bounded error/publication metadata. Refused dispatch makes zero model calls and durably records refusal. At the admitted boundary, maximum valid feedback survives save, consolidation and restart without a rerun. Independently exercise permanent-history capacity pending, then model-free retry after raising the allowed history limit; it never repairs checkpoint overflow. Reproduce two individually valid chunks with 4097 limitations each and verify all 8194 survive full and impact consolidation, checkpoint restart, permanent publication and reading. Test derived aggregate maxima and one-over boundaries, bounded host-added diagnostics, and multiple chunks whose combined findings exceed 256 (including carried origins); admitted complete results must consolidate losslessly or dispatch must have been refused before provider work.`
  - Fixtures: `Real artifact store/history/journal and canonical DEF/HLD/LLD documents for epic, standalone and issue contexts.`, `Injectable write/rename/unlink and checkpoint-ACK failures; two owner connections and restart reconstruction.`, `Provider spies assert zero calls during publication, gate and cleanup; guarded foreign-checkpoint spies prove no deep replay.`
- **smoke** — Compiled normal-entrypoint qualification and working code-review regression.
  - Subjects: `S1: Built MCP/IPC and daemon paths exercise DEF/HLD/LLD lifecycle publication, current-subject invalidation, recovery/retry pause, selective correction, approval override/refusal, scoped cleanup and permanent result lookup across restart using labelled fake native CLI responses. Existing compiled code-review smoke stays passing; no legacy flags, raw approval IPC or activation subsystem.`
  - Fixtures: `Disposable registered repos, compiled Node22 output, isolated HOME and deterministic native CLI stand-in.`, `Current backend/VS Code/JetBrains contract checks where their existing parsers validate review views.`
- **live** — Demonstrate a useful real independent review and record limits honestly.
  - Subjects: `L1: After coordinated daemon update, run a narrow real DEF/HLD/LLD design scenario through insrc_review_step with live progress and permanent result retrieval, then normal registered approval/cleanup after explicit human consent. Record chosen provider/model, measured ACK/progress timings, actual findings/result/history reference and checkpoint disposition; separate hosted calls from fixtures and retain current code-review smoke evidence. A failure is recorded and investigated, not substituted with a fake pass.`
  - Fixtures: `One disposable or explicitly approved real artifact with the opposite reviewer; installed authenticated CLI through CliProvider.`, `Recorded existing DEF/HLD/LLD live evidence may be reused only with exact provenance; uncovered artifact kinds remain explicitly unverified.`

**Acceptance mapping**

| Criterion | Proving tests |
| :--- | :--- |
| `ac1` | `U1`, `U3`, `U4`, `I2`, `I3`, `I7` |
| `ac2` | `U1`, `U2`, `I1`, `I4`, `I5`, `I6`, `I8` |
| `ac3` | `I3`, `I5`, `I7`, `S1` |
| `ac4` | `I1`, `I2`, `I3`, `I4`, `I5`, `I6`, `I7`, `I8`, `S1` |
| `ac5` | `U3`, `S1`, `L1` |

## 8. Alternatives considered

### 8.1 a1: Versioned review outcome in the existing artifact log — **CHOSEN**

Keep complete design-review history in append-only artifact log entries and one compact lifecycle reference.

Represent sc5 with a validated design-chunk-review v1 payload on the existing review operation. Preserve full attempts and final consolidated report, and atomically journal the outcome with the revision-bound lifecycle reference through the existing artifact queue. A version-aware record reader distinguishes old read-only report data from new chunk data. Canonical subject identity controls approval and targeted cleanup. [[c20]]

### 8.2 a2: Separate baseline and result entries in the same artifact history

Publish an immutable record per attempt and a manifest referencing those entries.

Use the existing artifact history for individual attempt/baseline records and publish a versioned manifest selecting the applicable attempt. Compact lifecycle metadata references the manifest; approval and cleanup resolve the manifest and its full referenced closure. No separate database or event arrays in the head. [[c20]]

**Rejected because:** Meets functional goals, but partial sc5 alignment and extra closure/recovery states are unnecessary for this bounded Story.

## 9. References

- **[[c1]]** `prior-artifact` `docs/epics/review-evolving-designs-durable-checkpoints-E202611039b04adb3/DEF.md`
- **[[c2]]** `doc` `/tmp/s4-analysis-bundle.json`
- **[[c3]]** `doc` `/tmp/s4-integration-analysis-bundle.json`
- **[[c4]]** `prior-artifact` `docs/standalone/review-evolving-designs-durable-checkpoints-E2026110316f49beb/SPEC.md`
- **[[c5]]** `code` `src/shared/types.ts`
- **[[c6]]** `code` `src/workflow/artifact-core/store.ts`
- **[[c7]]** `convention` `AGENTS.md`
- **[[c20]]** `prior-artifact` `docs/epics/review-evolving-designs-durable-checkpoints-E202611039b04adb3/HLD.md`
- **[[c21]]** `doc` `/tmp/s4-context-output.json`
- **[[c22]]** `code` `src/workflow/artifact-core/sidecar.ts`
- **[[c25]]** `code` `src/workflow/review/report-log.ts`
