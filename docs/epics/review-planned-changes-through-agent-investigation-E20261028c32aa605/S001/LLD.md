<!-- insrc:artifact LLD-c32aa60534232f36-s1 -->

# LLD: STORY-c32aa60534232f36-s1

## Summary

**Epic:** `review-planned-changes-through-agent-investigation`
**HLD base run:** `wf-1793173650139-u4mcad`
**HLD effective hash:** `12565b4b7f9e...`

Prepare a fixed review subject from approved work and explicitly selected commits. Preserve exact changed-block provenance and make before/after source navigable without reading the working tree. Define the runtime ports needed by later Stories without activating the new engine.

## Contents

1. [HLD context](#1-hld-context)
2. [Contract details](#2-contract-details)
3. [Data model changes](#3-data-model-changes)
4. [Interaction with shared contracts](#4-interaction-with-shared-contracts)
5. [Error paths](#5-error-paths)
6. [Test strategy](#6-test-strategy)
7. [Migration](#7-migration)
8. [Alternatives considered](#8-alternatives-considered)
9. [References](#9-references)

## 1. HLD context

> See **HLD-c32aa60534232f36** § 2. Framework summary

**Rollout phase:** A — scoped subject and foundational ports
**Owns:** `sc1` (ImmutableReviewSubjectV1), `sc6` (ReviewRuntimePortsV1)

**Adjacent scope (owned by other stories — do NOT implement here):**
- `s2`: Own required-row enumeration, evidence identity/provenance and coverage relationships/dispositions. Reuse subject inputs and runtime ports. Keep ledger validation helpers private; do not execute reviewer turns or publish CRs. — owns `sc2`
- `s3`: Own independent read-only task-directed continuation behavior, on-demand source navigation, optional indexed caller/impact enrichment, budget admission, bounded retry/pause and attempt usage emission through foundational ports. In-memory ports are test scaffolding while production selection remains disabled until s4/s6; no durable storage implementation or terminal approval logic. Publish and acknowledge incremental block progress within continuations, with partial cross-block assessments recorded rather than lost. Domain progress contracts only; no competing MCP phase/schema ownership. External registration belongs to s6. — owns `sc3`
- `s4`: Own durable implementation of foundational acceptance/usage-outbox ports, append/replay/checkpoint integrity, lease/generation fencing, uncertain attempts and compatibility/time recovery. Do not alter review criteria or introduce a usage warehouse. Its recovery implementation is composed by downstream s6 rather than consumed backwards by s3. Persist/replay block-level evidence and assessment receipts independently of final provider-call completion. — owns `sc4`
- `s5`: Own completion coverage/freshness/party validation, canonical CR adaptation and idempotent terminal publication receipts. Reuse existing lifecycle and severity/confidence policy. Do not let a completion request, missing evidence or a failed run masquerade as a completed verdict. — owns `sc5`
- `s6`: Own production composition, equivalent MCP/daemon/controller start/status/resume/cancel adapters, status/usage presentation fields, explicit engine rollout/rollback, legacy compatibility and evaluation fixtures. No client opens stores directly; no client-specific board UI or design-review replacement. Sole new-engine MCP adapter/schema owner; reconcile 8315a11f/S005 legacy sc7 as specified in the architecture and record code-only supersession before opt-in. Verify routing partitions across both installation orders. — owns `sc7`

## 2. Contract details

**Surface level:** internal-shared

### 2.1 `ReviewSubjectV1`

```typescript
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

**Returns:** `ReviewSubjectV1` — Immutable sc1 value admitted only from verified artifact snapshots and exact selected Git commit/parent objects.

**Errors:**
- `SubjectPreparationError` when Typed invalid-input, unapproved-contract, stale-contract, invalid-object, ambiguous-attribution, unsupported-change or resource-limit; never silently truncate/admit.

**Preconditions:**
- Internal preparation request carries repo/root/story/build identity, explicit commit IDs with parent choice and attribution evidence; pinned approved PLAN/LLD or legitimate approved upstream basis.
- Commit ownership proof and selected hunk identities are validated against trusted build attribution, never accepted merely because caller supplied arbitrary evidenceRef strings.

**Postconditions:**
- No HEAD/worktree diff establishes scope; all packets use full object IDs and actual parent membership.
- Subject digest is SHA256 of deterministic canonical JSON excluding subjectId/subjectDigest; identity derived from digest. Mode/index excluded so identical inputs yield same subject.
- Preparation revalidates artifact revisions/content and input bindings before returning. Later freshness validation compares the same pins, not moving HEAD.

### 2.2 `ReviewRuntimePortsV1`

```typescript
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

**Returns:** `ReviewRuntimePortsV1` — Type-only sc6 contract; s4 backend and s6 composition remain deferred.

**Errors:**
- `ReviewRuntimePortError` when Named backend error contract for invalid identity/value, stale generation, sequence conflict or unknown evidence reference; implemented by s4, not s1.

**Preconditions:**
- Central stageImmutableValue accepts objects and strings; serialization and digesting belong to the backend, never every caller.

**Postconditions:**
- Retain HLD read receipt and usage observation fields exactly, including all five nullable counters and observation granularity; no usage warehouse.

## 3. Data model changes

### 3.1 `ReviewSubjectV1 / CommitPacketV1` — new

sc1 is normative. Subject owns 1..N packets; packet owns 1..N selected blocks; each block belongs to exactly one parent-relative packet. Artifact references are immutable non-owned pins, 1..N per subject. A commit may have several explicit parent packets, never an implicit first-parent merge choice. Resolve commit parents and blobs using argv-only read-only Git plumbing; no replace refs, external diff/textconv or shell interpolation. Verify selected parent is actual direct parent, unique full hashes and exact file/blob/mode metadata. Root commits: refuse explicitly in v1 because required parentId cannot encode empty-tree provenance. Submodules and unsupported Git object formats refuse explicitly until supported. Object IDs must match repo format. Paths are exact repo-relative Git paths, parsed NUL-delimited, never interpreted as filesystem symlink targets or Git options. Per-file zero-context canonical hunks supply stable block identity; old/new line spans are one-based inclusive, null for zero-line side. Added/deleted/binary/rename/mode changes retain typed non-text entries plus textual hunks where applicable. Attribution must cover each admitted block against trusted scope evidence; mixed commits with no verified block ownership refuse. No inference from file ownership alone. Empty/ambiguous/truncated selection returns error, not a vacuous subject. Navigation uses pinned blobs/contextTree only; HEAD changes do not add scope. Bounded reads return explicit partial/unavailable receipts with digest and range, never silently truncated complete content. No graph/index needed. Implementation layout (all proposed): src/workflow/code-review/investigation/types.ts exports exact sc1/sc6 values; subject.ts owns prepareReviewSubject(request,deps): Promise<ReviewSubjectV1> and assertReviewSubjectFresh(subject,deps): Promise<void>; git-packets.ts owns read-only exact object/packet extraction; source.ts owns readReviewSource(subject,reference,limits,deps): Promise<ReviewReadReceiptV1>; index.ts exports these internal entrypoints. These helpers implement sc1, not additional cross-Story protocols. No call sites are claimed before s6 integration. Git deps expose argv-array execution returning bytes with timeout/output caps; no generic shell executor. Attribution algorithm: the trusted preparation dependency resolves selected full commits from a pinned build scope record and checks exact root/story identity and selection membership. A full-commit ownership record may admit all canonical changes only if it attests exclusive Story ownership; an Insrc-Story trailer alone is a candidate filter, not exclusive hunk proof. For mixed commits the trusted record supplies exact parent/blob/hunk-content digests and mode/rename/non-text entry selectors; compare each against recomputed entries, fail unmatched/overlapping/conflicting ownership. Omitted entries are excluded with attribution rationale available to diagnostics. Caller-provided evidence strings without a matching trusted record cannot authorize scope. Missing historical hunk proof yields ambiguity requiring an explicit human scope attestation recorded by the upstream scope owner, not an LLM guess. s1 consumes that immutable attestation; it does not build its UI or a new ledger. Stable IDs bind commit,parent,path,blobs,kind,ranges and normalized exact hunk bytes; duplicate metadata/text representations have distinct IDs. Do not conflate an entire changed file with one textual hunk. REUSE CORRECTION [[c7]]: git-packets.ts is a narrow packet/hunk interpretation adapter over createGitRunner and BinaryGitRunner from src/design/corpus/sources/git-reader.ts, not a second process runner or Git environment implementation. Reuse GIT_READ_ARGS/gitEnvironment and existing timeout/stdout/stderr/cancellation guards through createGitRunner unchanged. Retain local repo read-only/no-lazy-fetch behavior. Reuse readPinnedSources for regular-file commit/path acquisition where its request contract fits; it alone does not expose commit parents, object identities, mode/rename changes or raw blob references. For those extra sc1 metadata needs, make minimal additive named exports of the existing decodeObject and treeEntry helpers from that same I/O module and reuse their framing/hash/tree validation; do not copy them into investigation. Keep pure corpus barrels unchanged; workflow imports explicit I/O module, with no corpus DB/storage initialization. Preserve existing helper behavior/signatures/errors and test the additive export seam. New logic is only explicit parent/packet/hunk selection, trusted attribution and review-reference projection. Map SourceReaderError/ValidationResult failures to SubjectPreparationError without swallowing missing/digest/limit distinctions.


### 3.2 `Pinned approved work and task basis` — new

Request references existing build and approved artifact snapshots, retaining their identity/revision/digest. Validate root/story membership, lifecycle approval current revision and upstream compatibility, with integrity errors distinct from absence. Approved PLAN maps ordered task IDs, full title/summary and every acceptance check with stable task-scoped ordinal IDs. An existing unapproved/stale PLAN is not a legitimate planless route: refuse. Approved-upstream route requires explicit recognized build-route provenance and preserves upstream obligations without inventing PLAN task IDs; tasks may be empty while contracts retain authoritative requirements. Pin artifact bytes/content consistently and recheck before admission; immutable snapshot must be supplied to later readers rather than reread mutable markdown. Snapshot input validation belongs to a typed trusted dependency supplying canonical artifact envelope plus lifecycle/integrity result; it must not accept an arbitrary caller-provided approved boolean. The daemon composition uses its existing artifact lifecycle service; s1 fixtures inject deterministic equivalents. BUILD need not be approved (code review precedes BUILD approval), but must identify the correct root/Story and sourceCommit from a verified build scope record. Plan tasks preserve title plus summary; acceptance-check IDs are task ID plus one-based ordinal, with their exact text. Approved-upstream requirements stay in pinned contract snapshots and taskBasis, not fabricated plan tasks. ContextTree is the explicit build sourceCommit tree, verified as a tree; sourceCommit must match the trusted scope record, never ambient HEAD. One subject owns 1 build pin and 1 context tree reference; build/contract snapshots and source objects are shared immutable references, not copied ownership of external artifacts.


### 3.3 `ReviewRuntimePortsV1 / ReviewReadReceiptV1 / ReviewUsageObservationV1` — new

Copy approved sc6 fields as type-only exports. Ports refer to subject/run IDs but do not own subjects or create evidence/coverage rows. s4 supplies durable run ownership and usage pending outbox; s3 owns investigation; s2 owns evidence ledger. Keep foundational types free from imports of later Story types. Proposed implementation files under src/workflow/code-review/investigation/; no MCP facade registration or production engine selection in s1. Canonical JSON accepts plain JSON records/arrays/scalars, sorts object keys, preserves array order and rejects cycles, undefined, non-finite numbers and non-plain prototypes; strings are treated as strings, not pre-parsed JSON. s1 subject hashing uses this same documented canonical value representation; stageImmutableValue remains a type-level port whose s4 backend centralizes serialization. Subject freezing is recursive defensive copying; external mutation cannot change an admitted digest. REUSE CORRECTION [[c6]]: subject identity calls existing canonicalJson/hashCanonical from src/design/corpus/canonical.ts directly. No new serializer, cloned implementation or alternate key-order algorithm is permitted. Use explicit maxBytes no greater than existing CORPUS_LIMITS.packageBytes (64MiB), default subject ceiling 1MiB; oversize subject is typed resource-limit, never truncated or hashed as partial. Preserve existing depth/safe-number/Unicode/accessor/symbol/sparse-array validation. Existing artifact lifecycle contentHash semantics remain unchanged; subject digest is its own versioned canonical projection. Translate CorpusInputError schema/limit errors at the subject boundary while retaining original cause. s4 later reuses this central primitive behind stageImmutableValue; s1 implements no storage backend.


## 4. Interaction with shared contracts

| Contract | Role | How |
| :--- | :--- | :--- |
| `sc1` | implements | Own deterministic preparation, input validation, packet provenance and pinned source navigation. Existing legacy grounding is unchanged and cannot serve as new scope authority. |
| `sc6` | implements | Define type-only ports and usage/read receipt values, with central object serialization contract; no durable backend, controller progress protocol or accounting implementation. |

## 5. Error paths

**Error cases**

- **Untrusted or ambiguous changed scope** (recoverable)
  - Detection: Reject empty/duplicate selections, parent-not-member, unresolved revision expressions, missing trusted attribution for a selected hunk, mismatch between recorded selector and recomputed canonical hunk.
  - Response: Typed ambiguous-attribution/invalid-object refusal, listing affected packet/block without admitting partial subject; no HEAD fallback.
  - User impact: Supply explicit verifiable scope or resolve attribution before review.
- **Unapproved/stale/corrupt artifact or mixed Story** (recoverable)
  - Detection: Compare canonical artifact identity, lifecycle approved revision and content digest to loaded snapshots; verify build/root/story linkage and recheck pins at end.
  - Response: Typed distinct contract/integrity failure; never downgrade an unapproved PLAN to planless.
  - User impact: Approve or refresh the correct upstream artifacts.
- **Unsafe or oversized source navigation** (recoverable)
  - Detection: Validate subject-bound blob/reference allowlist, integer range bounds and per-read byte/line caps; Git process timeout/output cap; validate tree object and blob metadata.
  - Response: Explicit partial/unavailable read receipt for bounded valid reads; preparation output exhaustion is resource-limit error, never incomplete complete manifest.
  - User impact: Navigate smaller ranges or explicitly revise limits; invalid references fail.
- **Missing objects or unsupported provenance** (recoverable)
  - Detection: Git cat-file object checks, parent array, object-format detection, diff raw modes reveal missing commit/blob, root commit, submodule or unsupported format.
  - Response: Typed refusal with precise reason; no working tree substitution, shell fallback or object fetching.
  - User impact: Restore local objects or provide supported subject.

**Edge cases**

| Input | Expected |
| :--- | :--- |
| Two selected commits change and later revert the same block | Retain both parent-relative packets and provenance; no net diff cancellation. |
| Merge commit with selected parent and shared file | Check direct parent relation, retain explicit parent packet; mixed ownership needs block proof, never silently choose parent one. |
| Rename plus textual edits, zero-line insertions/deletions, binary and mode changes | Preserve metadata entries and each selected textual hunk; null absent line side; blobs and paths remain navigable. |
| Legitimate approved issue build without PLAN; index offline | Explicit upstream basis, no invented task IDs; same source-only subject works. |
| Foreign HEAD advances after preparation | Subject stays pinned; new HEAD does not alter selected scope. Changed approved artifact pins still mark stale. |

**Invariants to preserve**

- Legacy grounding and realDiffGroundingDeps stay unchanged; s1 adds isolated preparation rather than replacing existing review dispatch. Grounded by s1 contracts/grounding analyze bundle. [[c1]]
- Preserve existing Insrc-Story attribution fixture behavior while adding strict explicit packet admission; do not widen legacy scope by failure. Grounded by s1 attribution/test analyze bundle. [[c2]]

## 6. Test strategy

**Test framework:** `Node node:test and node:assert/strict via tsx (verify imports in the cited diff-attribution fixtures; analyzer test.locate was broad, not framework proof). No live LLM tests needed.`

**Test levels**

- **unit** — Validate canonical identity, approval/task projection, attribution and type-only ports.
  - Subjects: `review-s1-ac1 packet parity and complete task/check projection`, `review-s1-ac2 forged/missing evidence, duplicate selectors and ambiguous mixed hunks refusal`, `review-s1-ac3 planless route provenance, unapproved PLAN cannot fall back`, `review-s1-ac4 artifact revision/content race rejection`, `Canonical digest stable across key order, meaningful changes invalidate, no mode dependency`, `sc6 accepts object|string centrally and preserves nullable five-counter usage observation without later-story imports`, `Reuse canonicalJson/hashCanonical: same accepted bytes/digest as existing helper, invalid-value errors preserved and limits explicit; no second serializer.`
  - Fixtures: `Pinned artifact/build snapshots, trusted attribution records, fake bounded Git port with deterministic objects`
- **integration** — Prove real read-only Git objects define scope independently of worktree and index.
  - Subjects: `review-s1-ac1 add/delete/rename-with-edit/binary/mode and explicit merge parent packet contents`, `review-s1-ac2 shared commits/files, foreign hunks and unrelated HEAD changes excluded; intermediate edits/reverts retained`, `review-s1-ac3 source navigation works offline; no source symlink following`, `review-s1-ac4 immutable reads and missing-object rejection; changed pinned contracts stale`, `NUL-delimited whitespace/Unicode/leading-dash paths; no external diff/textconv or replacement refs`, `Zero-count ranges, oversized output/time refusal; root/submodule/unsupported format explicit rejection`
  - Fixtures: `Small isolated temp Git repositories; no mutations of shared checkout; clean environment strips inherited Git overrides`
- **contract** — Keep legacy review behavior and HLD contract structure intact.
  - Subjects: `Existing grounding/attribution tests unchanged`, `Owned sc1/sc6 exported types match HLD, no MCP registration or engine activation`, `Existing corpus canonical and Git reader fixture suites remain unchanged; additive decodeObject/treeEntry exports preserve identity validation; workflow import causes no DB access.`

**Acceptance mapping**

| Criterion | Proving tests |
| :--- | :--- |
| `ac1` | `review-s1-ac1 unit packet parity and task/check projection`, `review-s1-ac1 real Git change-kind fixtures` |
| `ac2` | `review-s1-ac2 forged/mixed evidence rejection`, `review-s1-ac2 real concurrent foreign commit/hunk and revert fixtures` |
| `ac3` | `review-s1-ac3 legitimate upstream basis and unapproved PLAN refusal`, `review-s1-ac3 offline pinned source navigation` |
| `ac4` | `review-s1-ac4 artifact pin race/mismatch`, `review-s1-ac4 missing objects and immutable navigation` |

## 7. Migration

**State before:** s1 analyze bundles locate legacy storyRangeDiff/realDiffGroundingDeps and attribution fixtures; legacy grounding can use range/net diff. No new subject/runtime-port symbol was found, with graph limitations disclosed.

**State after:** Add isolated internal sc1 preparation/navigation and sc6 type definitions, leaving production routing and persisted artifact shapes unchanged. Later s6 composes/adopts; no existing run is migrated.

**Zero downtime:** yes — **Data rewrite:** no

**Steps**

1. Add foundational sc1/sc6 types and explicit input/attribution validation within the owned module. Reuse src/design/corpus/canonical.ts and src/design/corpus/sources/git-reader.ts; only additive helper exports if needed, preserving original corpus call sites and pure barrels. — ↩ rollbackable
2. Add pinned Git packet extraction, deterministic subject preparation and bounded object navigation with focused fixtures. — ↩ rollbackable
3. Publish internal exports for later Stories and run owned tests plus legacy attribution regression subset; do not connect MCP or activate engine. — ↩ rollbackable

**Backward compat:** No public API/schema change, no predecessor S005 ownership change. Legacy code/design review entrypoints continue untouched. Rollback removes unused internal module only; no durable data format is created by s1. Reuse introduces an explicit workflow-to-corpus utility dependency, not corpus storage or a new public MCP contract. Additive exports preserve corpus APIs; no shared helper behavior is rewritten.

## 8. Alternatives considered

### 8.1 a1: Explicit manifest and pinned object reader — **CHOSEN**

Build sc1 from explicit commits and attributed block selections; resolve exact Git objects.

A pure preparation core validates approved input snapshots and explicit parent-relative commit selections. A bounded Git adapter resolves full object IDs, canonical diff blocks and immutable source reads. Caller supplies attribution evidence; mixed or missing proof refuses admission. sc6 remains type-only, production integration later.

### 8.2 a2: Pre-materialized packet import

Accept complete signed/digested packets, independently verify all objects and blocks.

A producer emits the complete sc1 packet graph and a verifier recomputes Git metadata, ranges, digests and attribution before admitting it. The same reader serves immutable objects and sc6 stays type-only. Producer and verifier share canonical packet rules.

**Rejected because:** Correct but larger than needed.

## 9. References

- **[[c1]]** `analyze-bundle` `s1/analyzeBundles/0` — "Analyzer symbol.locate found storyRangeDiff and usage.example its realDiffGroundingDeps caller. Proposed ReviewSubjectV1/ReviewRuntimePortsV1 not found. StoryChangeSet data-model trace empty, graph ex"
- **[[c2]]** `analyze-bundle` `s1/analyzeBundles/1` — "Analyzer bounded search.text found Insrc-Story attribution fixtures. test.locate returned broad unrelated matches and provides no targeted coverage proof; inspect actual scope tests before designing v"
- **[[c3]]** `prior-artifact` `.insrc/artifacts/HLD-c32aa60534232f36.json` — "Approved revision6 sc1/sc6 and s1 scope."
- **[[c4]]** `code` `src/workflow/runners/build/story-commits.ts:55-95`
- **[[c5]]** `code` `src/workflow/artifacts/plan.ts:64-75`
- **[[c6]]** `code` `src/design/corpus/canonical.ts:23-87` — "Reuse canonicalJson/hashCanonical validation and bounds, not a duplicate serializer."
- **[[c7]]** `code` `src/design/corpus/sources/git-reader.ts:15-186` — "Reuse createGitRunner/readPinnedSources and minimally expose existing object/tree helpers where packet metadata requires them."

<!-- insrc:review -->

## Review

### ✅ Review `PASS` — design.story (design.story)

**0 do not hold · 0 could not be verified · 10 hold** · template `design-spec` · model `cli-claude:claude-sonnet-5` · reviewed 2026-10-28T11:51:15.963Z

Only a premise that does not hold blocks approval. One that could not be verified is listed for the reader and does not block.

#### Does not hold (blocks approval)

_None._

#### Could not verify (does not block)

_None._
