<!-- insrc:artifact LLD-163e7bc3d6f0ccba-s1 -->

# LLD: STORY-163e7bc3d6f0ccba-s1 — Isolate code reviews with commit-parent baseline workspaces

## Summary

**Epic:** `isolate-code-reviews-commit-parent-baseline`
**HLD base run:** `wf-1794812552588-7in1dw`
**HLD effective hash:** `baf8f07eddb4...`

Code-review preparation will validate the submitted packet as the only review scope and turn its pinned local-Git provenance into an immutable, per-attempt baseline workspace containing only relevant pre-change files. Reviewers receive ordinary paths to the packet, baseline workspace, design/task artifacts and complete test evidence; checkpoint, recovery and publication behavior remain unchanged and source bodies are no longer retained in review records.

## Contents

1. [HLD context](#1-hld-context)
2. [Contract details](#2-contract-details)
3. [Data model changes](#3-data-model-changes)
4. [Diagrams](#4-diagrams)
5. [Error paths](#5-error-paths)
6. [Test strategy](#6-test-strategy)
7. [Migration](#7-migration)
8. [Alternatives considered](#8-alternatives-considered)
9. [References](#9-references)

## 1. HLD context

**Framework:** Standalone feature — no parent HLD. Design directly against the repo, grounded on the s1 analyze passes. There are no HLD shared contracts to honour.
**Rollout phase:** standalone

## 2. Contract details

**Surface level:** internal-shared

### 2.1 `prepareReviewPacket`

```typescript
prepareReviewPacket<Blob>(input: unknown, sources: ReviewSources<Blob>, historical?: boolean, route?: StoryRoute, stored?: StoredDerived, access?: ReviewPacketAccess<Blob>): Promise<PreparedReviewPacket<Blob>>
```

**Parameters:**
- `input: unknown` — Submitted packet whose selected after blocks and deletion anchors exclusively define review scope.
- `sources: ReviewSources<Blob>` — Pinned local-Git provenance and content access used to validate declared commits, parents and blobs.
- `historical: boolean` _(optional)_ — Indicates historical-attempt validation without changing the pinned attempt input.
- `route: StoryRoute` _(optional)_ — Resolved Story/task routing context.
- `stored: StoredDerived` _(optional)_ — Previously stored derived checkpoint metadata used only when its identity matches the pinned packet.
- `access: ReviewPacketAccess<Blob>` _(optional)_ — Packet field accessor used during validation and preparation.

**Returns:** `Promise<PreparedReviewPacket<Blob>>` — A source-light prepared packet containing validated selected-change locators, artifact/task/test references and an immutable baseline-workspace manifest/path, without embedded source bodies or broad semantic hydration.

**Errors:**
- `invalid-review-revision` when The final review revision is absent, not a full local object id, rewritten or inconsistent with selected after blobs.
- `invalid-review-set` when A selected change is not contained in one of the declared local commits or requires uncommitted worktree content.
- `invalid-baseline-parent` when The applicable parent is absent, ambiguous for a merge, or not the parent against which the selected transition was made.
- `baseline-integrity-failed` when A materialized parent blob or after blob does not match the packet digest/path metadata.

**Preconditions:**
- Every selected change is pinned to a declared local commit and the packet carries a full final review revision.
- The selected after range/block or deletion anchor is the sole review-scope declaration.
- Merge changes identify the applicable parent explicitly; no remote branch or origin state is required.

**Postconditions:**
- Only selected changes appear in the prepared scope, even when declared commits contain unrelated changes.
- Each non-new selected transition resolves to its exact applicable local parent blob and immutable workspace path.
- New, deleted and renamed files retain explicit transition metadata; stacked edits retain each relevant transition.
- Prepared/checkpoint data contains locators, digests and paths, not source bodies.
- Reviewer, checkpoint history, recovery and publication state semantics are unchanged.

### 2.2 `CodePreparation`

```typescript
class CodePreparation<Blob>
```

**Parameters:**
- `packet: unknown` — The pinned task-review packet to qualify and prepare.
- `sources: ReviewSources<Blob>` — Local-Git object/provenance source used for qualification and selective baseline materialization.

**Returns:** `CodePreparation<Blob>` — Attempt-scoped preparation owner that qualifies packet provenance, creates or reuses the immutable baseline workspace, exposes source-light reviewer context and closes owned resources.

**Errors:**
- `preparation-refused` when Packet scope or provenance validation fails before reviewer invocation.
- `workspace-conflict` when An existing attempt workspace does not match the pinned packet/workspace manifest identity.

**Preconditions:**
- Review identity and attempt are fixed before preparation begins.
- Preparation has an attempt-scoped temporary root and cleanup ownership.

**Postconditions:**
- Preparation never broadens scope from Git status, commit breadth or live worktree state.
- Closing releases transient resources without altering checkpoint review history.
- A retry of the same pinned attempt either reuses an identical sealed workspace or fails closed.

### 2.3 `StagedPacketConstruction`

```typescript
class StagedPacketConstruction<Blob>
```

**Parameters:**
- `packet: unknown` — Validated source-light packet being constructed in bounded stages.

**Returns:** `StagedPacketConstruction<Blob>` — A staged construction boundary that seals packet metadata only after provenance and workspace integrity succeed.

**Errors:**
- `construction-not-sealed` when Required provenance or workspace stages are incomplete.

**Preconditions:**
- No source body is embedded into the packet/checkpoint representation.

**Postconditions:**
- The sealed packet references immutable evidence by locator, digest and path.

### 2.4 `StagedPacketSources`

```typescript
class StagedPacketSources<Blob>
```

**Parameters:**
- `sources: ReviewSources<Blob>` — Bounded source provider for selected commit, parent and blob qualification.

**Returns:** `StagedPacketSources<Blob>` — Selected-change source view that resolves only packet-declared transitions and releases decoded results after validation/materialization.

**Errors:**
- `source-out-of-scope` when A requested source is not named by a selected transition.

**Preconditions:**
- Requested blobs correspond to packet-declared commits, parents and paths.

**Postconditions:**
- Decoded bodies are not retained after verified files are materialized or digests checked.

## 3. Data model changes

### 3.1 `PreparedReviewPacket<Blob>` — invariant-change

Becomes source-light. It owns review identity, final revision, declared commits, selected after blocks/deletion anchors, per-transition local commit/parent/blob/path metadata, artifact/task/test references, and a baseline workspace manifest/path. It must not carry hydrated source bodies or broad context derived outside selected changes.

```
Add per-selected-change provenance `{ originCommit, applicableParent, beforePath?, beforeBlob?, afterPath?, afterBlob?, changeKind, selection, mergeParentIndex? }` and baseline workspace `{ root, manifestDigest, entries[] }`; prohibit embedded source bodies.
```

**Call sites:**
- `src/workflow/code-review/task-review/packet.ts:144-226`
- `src/workflow/review/code-preparation.ts:23-124`
- `src/daemon/threads/review-worker-preparation.ts`

### 3.2 `StagedPacketConstruction` — invariant-change

Production construction must seal only after packet provenance and baseline workspace integrity are verified; the existing class becomes part of the production preparation path rather than a test-only/isolated helper.

**Call sites:**
- `src/workflow/review/staged-packet-construction.ts:23-97`
- `src/workflow/review/code-preparation.ts:23-124`

### 3.3 `StagedPacketSources` — invariant-change

Source acquisition is restricted to packet-declared commits, applicable parents and blobs. Decoded source is transient and released after digest verification or workspace materialization.

**Call sites:**
- `src/workflow/review/staged-packet-sources.ts:25-149`
- `src/workflow/review/source-session.ts`
- `src/workflow/review/code-preparation.ts:23-124`

## 4. Diagrams

- [Sequence diagram](docs/standalone/isolate-code-reviews-commit-parent-baseline-E20261116c592d0bd/S001/sequence-diagram.html)
- [Component dependencies](docs/standalone/isolate-code-reviews-commit-parent-baseline-E20261116c592d0bd/S001/component-dependency.html)
- [Sequence diagram](docs/standalone/isolate-code-reviews-commit-parent-baseline-E20261116163e7bc3/S001/sequence-diagram.html)
- [Component dependencies](docs/standalone/isolate-code-reviews-commit-parent-baseline-E20261116163e7bc3/S001/component-dependency.html)

## 5. Error paths

**Error cases**

- **Final review revision or declared commit cannot be resolved locally.** (recoverable)
  - Detection: Resolve every full object id with the local repository object database and verify it is a commit before preparing any workspace entry.
  - Response: Reject admission with invalid-review-revision or invalid-review-set and do not invoke the reviewer.
  - User impact: The submitter must create or restore the local commit packet and submit a new attempt.
- **Selected after content is uncommitted or does not match the pinned after blob.** (recoverable)
  - Detection: Resolve the selected path at the declared origin commit/final revision and compare the blob digest and selected after range/block digest with packet metadata.
  - Response: Reject the attempt as unpinned; never read live worktree content as a fallback.
  - User impact: The submitter must commit the intended change and create a corrected packet.
- **A selected change is not present in any declared review-set commit.** (recoverable)
  - Detection: Compare the selected path/transition against each declared commit-parent diff and require one exact provenance match.
  - Response: Reject invalid-review-set before workspace creation.
  - User impact: The submitter must correct the review set or remove the out-of-scope selection.
- **Merge commit has no unique applicable parent.** (recoverable)
  - Detection: Inspect the merge commit's parents and find either the explicitly declared parent index/OID or exactly one parent transition matching the selected change.
  - Response: Reject invalid-baseline-parent; never select the first parent implicitly when ambiguous.
  - User impact: The submitter must pin the intended merge parent.
- **Existing attempt workspace conflicts with the packet.** (recoverable)
  - Detection: Recompute packet identity and manifest digest and compare both with the sealed workspace manifest before reuse.
  - Response: Fail closed with workspace-conflict; retain evidence and require a new attempt rather than mutating the pinned attempt.
  - User impact: The controller must submit a new attempt after clearing the failed attempt according to existing recovery rules.
- **Materialized baseline file does not match the parent blob or escapes the attempt root.** (recoverable)
  - Detection: Verify canonical destination containment, reject symlink/path traversal components, hash written bytes and compare with the local Git blob OID/digest.
  - Response: Abort preparation, quarantine or clean the incomplete workspace, and publish no reviewer assignment.
  - User impact: The attempt fails technically without consuming reviewer tokens.
- **Checkpoint metadata references a rewritten commit or missing workspace entry during resume.** (recoverable)
  - Detection: Re-resolve every pinned commit/blob and validate the sealed manifest identity before resume.
  - Response: Mark the attempt incomplete/failed under existing recovery semantics; do not silently rebuild it from changed Git history.
  - User impact: The controller must trigger a subsequent attempt with fresh pins.

**Edge cases**

| Input | Expected |
| :--- | :--- |
| A brand-new file selected in a commit. | Record no before blob/path, materialize no baseline file, and retain the exact after selection and after blob digest. |
| A deleted file selected by deletion anchor. | Materialize the applicable parent's file, record no after blob/path, and keep the deletion anchor as the sole selected scope. |
| A rename with or without content edits. | Record old parent path/blob and new commit path/blob; materialize the old path under an unambiguous transition entry and scope review to the selected new blocks or deletion/rename anchor. |
| The same file changes in multiple stacked unpushed commits. | Preserve each selected transition's own origin commit and applicable parent; materialize distinct immutable baseline entries where parent blobs differ, while the final review revision pins the final after state. |
| A declared commit also contains unrelated files or blocks. | Ignore them completely because only packet-selected ranges/blocks/deletion anchors define review scope. |
| Two selected transitions share the same parent blob. | Deduplicate physical baseline bytes only when manifest entries retain both logical transition identities and integrity remains explicit. |
| A valid empty selection set. | Reject admission because a review cannot proceed without at least one selected after block or deletion anchor. |
| Large or binary selected file. | Do not embed its body in packet/checkpoint memory; materialize only the required parent blob and retain size/digest metadata, with text ranges required only for textual after-block selections. |

**Invariants to preserve**

- `src/daemon/threads/review-worker-preparation.ts` remains the production entry point that owns preparation before reviewer execution. [[c1]]
- Admission, execution, packet, source and worker-checkpoint contracts remain coordinated through `src/workflow/review/code-preparation.ts`. [[c1]]
- Checkpoint history, migration and progress behavior covered by the located preparation tests remains semantically unchanged. [[c1]]
- Reviewer publication consumes a sealed prepared result; failed preparation never invokes the reviewer. [[c1]]
- All source access remains attempt-scoped and is closed/released by the preparation lifecycle. [[c1]]

## 6. Test strategy

**Test framework:** `Node.js built-in test runner executed through `tsx --test`, following the located `*.test.ts` suites.`

**Test levels**

- **unit** — Prove packet provenance and transition modeling without daemon concurrency.
  - Subjects: `Full-OID final revision and declared local commit validation`, `Selected change membership in declared commit-parent transitions`, `Applicable-parent resolution for normal and merge commits`, `New, deleted, renamed and stacked same-file transition metadata`, `Path containment, blob digest and manifest identity validation`, `Transient source-result release after materialization`
  - Fixtures: `Disposable local Git repository with linear, stacked, rename, delete and merge histories`, `Packet fixtures containing exact after blocks and deletion anchors`
- **contract** — Prove source-light packet/checkpoint compatibility and unchanged lifecycle semantics.
  - Subjects: `PreparedReviewPacket locator and baseline-workspace manifest schema`, `CodePreparation create/seal/reuse/close contract`, `Checkpoint history, migration, progress and publication compatibility`, `Refusal of uncommitted, unpinned, rewritten or out-of-scope inputs`
  - Fixtures: `Historical checkpoint fixtures`, `Sealed workspace manifest fixtures`, `Reviewer assignment/publication spy`
- **integration** — Exercise the production daemon preparation entry point with real local Git objects and filesystem materialization.
  - Subjects: `src/daemon/threads/review-worker-preparation.ts production wiring`, `Selective immutable per-attempt baseline workspace creation and reuse`, `Packet-only scope when commits contain unrelated changes`, `Resume after interruption with unchanged pins`, `Concurrent reviews with isolated attempt roots`
  - Fixtures: `Temporary repositories and `.insrc/tmp/code-review/<review-id>/<attempt>` roots`, `Two simultaneous review identities`, `Provider spy that records whether invocation occurred`
- **smoke** — Qualify that a retained large review reaches reviewer invocation without eager source-body memory exhaustion and without broadening scope.
  - Subjects: `171-file four-attempt retained preparation workload`, `Bounded preparation memory independent of aggregate source-body size`, `No duplicate physical Git reads after deduplication`, `Reviewer prompt/context contains artifact paths, packet path, baseline workspace path and complete test evidence only`
  - Fixtures: `Generated retained review repository`, `Preparation metrics collector`, `Reviewer/provider capture harness`

**Acceptance mapping**

| Criterion | Proving tests |
| :--- | :--- |
| `ac1` | `Packet-only scope ignores unrelated files and blocks in declared commits`, `Uncommitted and unpinned selected changes are rejected before reviewer invocation` |
| `ac2` | `Linear and stacked unpushed commits resolve each selected transition from its applicable local parent`, `Merge transitions require and honor the applicable parent` |
| `ac3` | `New/delete/rename transitions produce correct before/after path and blob metadata`, `Same-file stacked transitions preserve distinct baselines` |
| `ac4` | `Only relevant parent blobs are materialized under the immutable attempt root`, `Workspace reuse requires identical packet and manifest digests` |
| `ac5` | `Prepared packets and checkpoints contain locators/digests/paths but no source bodies`, `Retained 171-file workload reaches provider invocation within bounded preparation memory` |
| `ac6` | `Checkpoint history, recovery, progress and publication regression suites remain passing`, `Preparation failure never publishes reviewer assignment` |
| `ac7` | `Reviewer input exposes Story/LLD/Plan/task, packet, baseline workspace and complete test evidence paths`, `Reviewer scope contains only selected after blocks and deletion anchors` |

## 7. Migration

**State before:** Analyze bundle c1 shows production preparation in `src/workflow/review/code-preparation.ts`, called by `src/daemon/threads/review-worker-preparation.ts`, directly coordinating packet, admission, source-session, prepared-context, preparation-memory, prepared-views and worker-checkpoint contracts. The staged packet/source classes exist separately, while retained preparation eagerly holds broad source/context data and can fail before reviewer invocation.

**State after:** Every new review attempt requires a source-light packet whose exact selected after blocks/deletion anchors are pinned to local commits and a final revision. Production preparation validates each commit-parent transition, selectively creates an immutable per-attempt baseline workspace, gives the reviewer evidence paths, and retains only locators/digests/paths in checkpoint state. Existing review status, feedback history, recovery decisions and publication semantics remain intact.

**Zero downtime:** yes — **Data rewrite:** no

**Steps**

1. Extend packet validation and persisted derived metadata with explicit selected-transition provenance and baseline-workspace manifest identity; keep existing checkpoint review history fields unchanged. — ↩ rollbackable
2. Integrate staged packet construction and staged source ownership into production preparation, including strict release of decoded source results and fail-closed integrity checks. — ↩ rollbackable
3. Add selective per-attempt baseline workspace creation/reuse/cleanup and route the production worker's reviewer context to packet/workspace/artifact/test paths. — ↩ rollbackable
4. Switch admission for new attempts to require the new pinned transition contract and reject legacy/uncommitted inputs without a compatibility fallback. — ↩ rollbackable
5. Run packet, preparation, checkpoint, recovery, publication, concurrency and retained-load qualification; remove the eager hydration path once all production tests pass. — ↩ rollbackable

**Backward compat:** This is an intentional hard cutover for new attempts: there is no fallback that reconstructs eager hydrated packets or derives scope from commit breadth, Git status or the live worktree. Existing checkpoint history and published feedback remain readable; an incomplete pre-cutover attempt that lacks the new pins must be continued only through a separately submitted new attempt, consistent with the existing recovery rule.

## 8. Alternatives considered

### 8.1 a1: Attempt-scoped baseline workspace — **CHOSEN**

Keep the submitted packet as the scope contract and materialize only selected changes' applicable parent blobs into an immutable attempt directory.

Extend packet qualification to produce source-light locators and a manifest keyed by review identity, attempt, selected commit, applicable parent, path, blob digest, and exact selected after/deletion segments. Reuse staged packet construction and source access to write only required parent files into an attempt-owned temporary workspace. Reviewers open those files and repository artifacts on demand; checkpoints retain locators and manifest identity rather than decoded bodies.

### 8.2 a2: Lazy Git object source adapter

Expose parent and after blobs lazily through ReviewSources without materializing a filesystem workspace.

Represent selected changes as immutable Git object locators and teach reviewer tools to fetch parent or after content on demand through a bounded ReviewSources adapter. Checkpoints retain only locators and digests, and every read is verified against the pinned packet.

**Rejected because:** Requires a new reviewer-access tool surface and couples independent review to live blob retrieval.

### 8.3 a3: Compressed prepared-context cache

Retain the current preparation model but compress and evict decoded source bodies as limits approach.

Keep semantic hydration and prepared views, adding compression, spill-to-disk, and eviction to the existing source session and memory manager. Rehydrate bodies when a reviewer asks for them while preserving current packet structures.

**Rejected because:** Cannot naturally represent multiple stacked parent transitions and materializes unrelated repository content.

## 9. References

- **[[c1]]** `analyze-bundle` `The s1 deterministic structural map of code-review preparation, its production importer, direct dependencies, staged helper symbols and located tests.`
- **[[c2]]** `prior-artifact` `ISSUE-163e7bc3d6f0ccba`
- **[[c3]]** `stakeholder` `The submitted review packet is the sole review scope; commits are provenance pointers; pre-change baselines come from applicable parents in the local Git graph, including stacked unpushed commits.`
- **[[c4]]** `convention` `Repository tests use TypeScript `*.test.ts` suites executed with `npx tsx --test`.`
