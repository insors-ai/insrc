<!-- insrc:artifact LLD-7d2422c8f57fa483-s1 -->

# LLD: STORY-7d2422c8f57fa483-s1 — Let code-review reuse survive provenance-only test-row changes

## Summary

**Epic:** `code-review-reuse-refused-when-only`
**HLD base run:** `wf-1794410314395-9seizo`
**HLD effective hash:** `8d914e774975...`

A code-review correction attempt may reuse an earlier task result only when the task's inputs are unchanged, but today that check also covers free-text provenance in each test row, so rewording or re-running tests blocks reuse; and each refused task costs a separate submission of a three-submission budget. This Story versions the task identity: new attempts use a format whose test entries carry only the committed test file, its cases and its result, and record that format on the attempt. Attempts saved before the change keep their original format and validate exactly as before, reuse across the two formats is refused with the usual reassess feedback, and every refused task in one submission is reported in a single rejection.

## Contents

1. [HLD context](#1-hld-context)
2. [Contract details](#2-contract-details)
3. [Data model changes](#3-data-model-changes)
4. [Error paths](#4-error-paths)
5. [Test strategy](#5-test-strategy)
6. [Migration](#6-migration)
7. [Alternatives considered](#7-alternatives-considered)
8. [References](#8-references)

## 1. HLD context

**Framework:** Standalone feature — no parent HLD. Design directly against the repo, grounded on the s1 analyze passes. There are no HLD shared contracts to honour.
**Rollout phase:** standalone

## 2. Contract details

**Surface level:** internal

### 2.1 `taskFinalIdentity`

```typescript
taskFinalIdentity(prepared: PreparedReviewPacket, assignment: TaskAssignment, format?: TaskIdentityFormat): string  // exported type TaskIdentityFormat = 'final-task-v1' | 'final-task-v2'
```

**Parameters:**
- `format: TaskIdentityFormat` _(optional)_ — Which input the hash covers. 'final-task-v1' (default, today's input) hashes each assigned test as { detail: <whole submitted row>, blobOid }. 'final-task-v2' hashes each assigned test as { file, cases, result, blobOid }; requirements (taskId, title, summary, acceptanceChecks), changes and documents are hashed exactly as in v1. A task with no assigned tests hashes an empty tests list in both formats.

**Returns:** `string` — Hex sha256 of the canonical task input in the given format; the format name is part of the hashed input, so v1 and v2 identities never coincide. cases are hashed in submitted order.

**Errors:**
- `TaskReviewInputError field=attribution` when Existing checks: missing final task source identities, unknown assigned test, historical scope.

**Preconditions:**
- prepared has a projection and finalTestBlobs for every packet test (unchanged).

**Postconditions:**
- With format 'final-task-v1' the result is byte-identical to today's taskFinalIdentity.

### 2.2 `bindTaskFinalIdentities`

```typescript
bindTaskFinalIdentities(review: AdmittedReview, input: readonly AcceptedTaskAttribution[]): Promise<readonly TaskAssignment[]>
```

**Returns:** `Promise<readonly TaskAssignment[]>` — Unchanged result. The bind format is the attempt header's taskIdentityFormat when present; otherwise 'final-task-v1' when the attempt is already accepted (saved before this change) and 'final-task-v2' when the attempt is pending. Identities are computed in the bind format; a pending attempt's candidate also carries taskIdentityFormat: 'final-task-v2'; a re-bound accepted attempt must reproduce every stored key. The reuse check is given the bind format explicitly, because the header field is written only after the check. The existing source checks (reuse decision present, earlier, same-party accepted source) still throw at once, unchanged, because they reject a malformed decision rather than changed inputs. Every reuse assignment that passes them is checked for format and identity before anything fails, through a module-internal, non-throwing per-task check shared with requireReuseIdentity that returns a { field, message } refusal or nothing. No refusals: the candidate is applied as today. Exactly one refusal: one TaskReviewInputError with today's field origins/tasks/<index>/sourceAttempt/<n> and today's text. Several refusals: one TaskReviewInputError whose field is the first refused task's field (in selectedTaskIds order) and whose message starts with 'N tasks cannot reuse their source attempt: <task ids>.' followed by each task's own refusal text, so the listing of every refused task id comes first and survives the existing 8192-byte feedback bound.

**Errors:**
- `TaskReviewInputError field=attribution` when Existing: 'Accepted mapping cannot change within an attempt' when a re-bound attempt does not reproduce its stored identities or format.
- `TaskReviewInputError field=origins/tasks/<index>/sourceAttempt/<n>` when One or more reuse assignments are refused for a format or identity difference; raised once per bind.

**Postconditions:**
- Saved accepted attempts without taskIdentityFormat re-bind with v1 identities exactly as today.
- One bind raises at most one reuse rejection, so it consumes at most one of the MAX_ATTRIBUTION_SUBMISSIONS = 3 submissions however many tasks are refused.

### 2.3 `requireReuseIdentity`

```typescript
requireReuseIdentity(review: AdmittedReview, assignment: TaskAssignment, format?: TaskIdentityFormat): void
```

**Parameters:**
- `format: TaskIdentityFormat` _(optional)_ — The current attempt's identity format. bindTaskFinalIdentities passes its bind format; when omitted (sourceAssessment, after acceptance) it is the header's taskIdentityFormat, or 'final-task-v1' when absent.

**Returns:** `void` — Throws the one refusal for this task, if any. Existing source checks are unchanged and throw at once. Then: if the source attempt's format (its taskIdentityFormat, or 'final-task-v1' when absent) differs from format, refusal with feedback 'Task <id> cannot reuse attempt <n>: its result was recorded under an earlier task identity format. Set action to "reassess" and omit sourceAttempt for this task; retain eligible reuse for other tasks.'; else if the source's stored identity differs from taskFinalIdentity(prepared, assignment, format), today's refusal with the reuseMismatch text.

**Errors:**
- `TaskReviewInputError field=origins` when Existing source checks.
- `TaskReviewInputError field=origins/tasks/<index>/sourceAttempt/<n>` when Format differs, or identity differs.

**Postconditions:**
- A published reuse row and its source always carry identities of the same format, so the string-equality check in src/workflow/code-review/task-review/record.ts:73-77 stays like-for-like.

### 2.4 `taskInputFingerprint`

```typescript
taskInputFingerprint(prepared: PreparedReviewPacket, assignment: TaskAssignment): TaskInputFingerprint  // tests: readonly { path: string; identity: string; provenance: string }[]
```

**Returns:** `TaskInputFingerprint` — Transient diagnostic, not persisted. Signature unchanged (admission.ts:50 keeps calling it as today). Each tests entry carries identity, the digest of the v2 test fields { file, cases, result, blobOid }, and provenance, the digest of the whole submitted row with its blobOid (today's identity).

**Postconditions:**
- requirements, sources and documents entries are unchanged.

### 2.5 `reuseMismatch`

```typescript
reuseMismatch(review: AdmittedReview, assignment: TaskAssignment, sourceAttempt: number, format: TaskIdentityFormat): string
```

**Parameters:**
- `format: TaskIdentityFormat` — The shared format of the compared attempts. A tests entry counts as changed when identity differs, or, only for 'final-task-v1', when provenance differs.

**Returns:** `string` — Today's text ('Task <id> cannot reuse attempt <n>: relevant task inputs changed (<details>). Set action to "reassess" ...'), naming only fields that differ under the compared format: under v2 a provenance-only edit never appears; under v1 it names the test. The generic fallback text is unchanged.

**Postconditions:**
- The message format from ISSUE-146084d04395b88b is unchanged.

### 2.6 `validateSavedAttribution`

```typescript
validateSavedAttribution(attempt: ReviewAttempt): void
```

**Returns:** `void` — Unchanged checks, plus: taskIdentityFormat must be absent on an unpinned attempt and on a pending or failed attempt, like the other accepted-only fields; on an accepted attempt it is absent (v1) or 'final-task-v2'.

**Errors:**
- `TaskReviewInputError field=attribution` when Existing messages ('Unpinned history cannot carry final-scope authority', 'Unmapped phase cannot carry accepted task bindings') when taskIdentityFormat is present where it is not allowed.

**Postconditions:**
- Saved attempts written before the change carry no taskIdentityFormat and validate exactly as today.

## 3. Data model changes

### 3.1 `ReviewAttempt.header (code-review checkpoint)` — field-add

Optional taskIdentityFormat: 'final-task-v2', written in the candidate when a pending mapping is accepted; absent means 'final-task-v1'. Added to the header interface and to the strict header schema. Ownership: one per attempt; all of the attempt's taskScopeIdentities share it. CR summaries, history snapshots and record schemas are unchanged: they copy and compare stored identity strings without recomputing them.

**Call sites:**
- `src/workflow/code-review/task-review/contracts.ts:112`
- `src/workflow/code-review/task-review/contracts.ts:130`
- `src/workflow/code-review/task-review/attribution-binding.ts:121-140`
- `src/workflow/code-review/task-review/attribution-binding.ts:63-78`

### 3.2 `taskFinalInput (task reuse identity input)` — invariant-change

New 'final-task-v2' input: each assigned test contributes { file, cases, result, blobOid } instead of the whole row. 'final-task-v1' is kept unchanged for saved attempts.

**Call sites:**
- `src/workflow/code-review/task-review/attribution-binding.ts:23-34`
- `src/workflow/code-review/task-review/attribution-binding.ts:109-119`

### 3.3 `TaskInputFingerprint.tests entry (transient)` — field-add

Adds provenance beside identity; identity becomes the v2 test digest. Built in memory by admission.ts and the reuse check; never stored.

**Call sites:**
- `src/workflow/code-review/task-review/attribution-binding.ts:42-62`
- `src/workflow/code-review/task-review/admission.ts:50`
- `src/workflow/code-review/task-review/execution.ts:11`

## 4. Error paths

**Error cases**

- **A correction attempt reuses one or more tasks whose source attempt was recorded under the earlier identity format (the transition after deploy, e.g. projection-scope-66d4-s1 reusing t1, t2 and t4 from attempt 1).** (recoverable)
  - Detection: The per-task reuse check compares the source attempt's taskIdentityFormat (absent = 'final-task-v1') with the bind format passed in by bindTaskFinalIdentities; the bind runs the check for every reuse assignment before failing.
  - Response: One TaskReviewInputError for the whole submission: field origins/tasks/<index>/sourceAttempt/<n> of the first refused task; text listing every refused task id, then each task's 'recorded under an earlier task identity format ... set action to "reassess"' text.
  - User impact: The reviewer reassesses every such task in its next submission; the transition costs one of the three attribution submissions in total, not one per task. Later attempts can reuse those results under the new format.
- **One or more reused tasks' committed test file, cases or result (or requirements, changes, documents) changed.** (recoverable)
  - Detection: The v2 identity of each current task differs from its source attempt's stored v2 identity; checked for every reuse assignment.
  - Response: One rejection naming every refused task; each task's part is today's 'cannot reuse attempt N: relevant task inputs changed (tests <file>)' text, naming only fields that changed under the compared format. A single refusal is byte-identical to today.
  - User impact: Those tasks are reassessed in one resubmission.
- **A reuse decision is malformed: no decision, a source attempt that is not earlier, or a missing or other-party source.** (recoverable)
  - Detection: The existing source checks in the reuse check, run before format and identity.
  - Response: Existing TaskReviewInputError at field origins, thrown at once and not collected with the format and identity refusals.
  - User impact: Unchanged.
- **A saved accepted attempt is re-bound and its stored identities or format no longer reproduce.** (terminal)
  - Detection: bindTaskFinalIdentities' existing deep-equality of every candidate key against the saved header.
  - Response: Existing 'Accepted mapping cannot change within an attempt' error.
  - User impact: Unchanged fail-closed behaviour.
- **A checkpoint header carries an unknown taskIdentityFormat value.** (terminal)
  - Detection: The strict header schema accepts only 'final-task-v2' for the optional field.
  - Response: Existing schema rejection of the checkpoint.
  - User impact: The checkpoint is refused rather than silently mis-hashed.
- **A saved unpinned, pending or failed attempt carries taskIdentityFormat.** (terminal)
  - Detection: validateSavedAttribution's existing absence check for accepted-only fields, extended to taskIdentityFormat.
  - Response: Existing 'Unpinned history cannot carry final-scope authority' or 'Unmapped phase cannot carry accepted task bindings' error.
  - User impact: The inconsistent checkpoint is refused, as for the other accepted-only fields.

**Edge cases**

| Input | Expected |
| :--- | :--- |
| Correction attempt on the same pin whose test rows differ only in evidenceReferences, executionDetails or command, source attempt in the new format. | Reuse is accepted; identities match. |
| Three tasks reused from a v2 source after evidence references are removed from their test rows (the projection-scope-66d4-s1 shape). | All three accepted in one submission; no rejection recorded. |
| Saved attempt (no taskIdentityFormat) resumed or re-prepared after the change. | Re-binds with v1 identities and validates as today; no format is added. |
| Two saved v1 attempts where attempt 2 reused attempt 1, re-prepared after the change. | Both re-bind in v1; the reuse check compares v1 with v1 and passes as before. |
| Attempt saved as pending before the change and accepted after it. | Accepted with v2 identities and taskIdentityFormat recorded. |
| A task with no assigned tests. | v2 identity covers requirements, changes and documents only, as v1 does. |
| Two tasks share one test row and one of them is reused. | Each task's identity covers its own assigned tests; unchanged shared rows keep both reusable. |
| Test row cases reordered. | Treated as a change (cases are hashed as submitted), so reuse is refused; no reordering normalisation is added. |
| Many tasks refused at once, so the combined text would exceed the 8192-byte feedback bound. | The listing of every refused task id comes first and is kept; only later per-task detail can be cut by the existing bound. |

**Invariants to preserve**

- Saved accepted attempts recompute exactly the identities they stored when re-bound (bindTaskFinalIdentities deep-equality). [[c1]]
- A published reuse row's identity equals its source attempt's stored identity for that task, compared as stored strings (record.ts:73-77). [[c2]]
- History snapshots and CR summaries copy stored identities without recomputing them. [[c2]]
- The three-submission attribution budget (MAX_ATTRIBUTION_SUBMISSIONS) and each task's reassess feedback from ISSUE-146084d04395b88b are unchanged. [[c3]]
- The attempt header schema stays strict (additionalProperties false); only the one optional field is added. [[c4]]
- Committed sources, documents, requirements and each test's committed file content remain part of the reuse identity. [[c1]]
- Accepted-only header fields are absent on unpinned, pending and failed attempts (validateSavedAttribution). [[c1]]

## 5. Test strategy

**Test framework:** `node:test with node:assert/strict, run through npx tsx --test (Node 22), using the existing task-review publication fixture (src/workflow/code-review/task-review/__tests__/publication-fixture.ts) as in src/workflow/code-review/task-review/__tests__/attribution-binding.test.ts`

**Test levels**

- **unit** — Pin the two identity formats and the fingerprint: v1 byte-identical to the pre-change identity; v2 ignores provenance-only test-row fields, reacts to file blob, cases (including order) and result, and covers requirements, changes and documents for a task with no tests; the fingerprint carries identity and provenance per test. The v1 identity is pinned to constants computed with the pre-change code on a hand-built prepared packet, so a change to the v1 input fails the test.
  - Subjects: `taskFinalIdentity`, `taskInputFingerprint`, `reuseMismatch`
  - Fixtures: `prepared review from the publication fixture with one task and one test row`, `the same task with no assigned tests`, `a hand-built PreparedReviewPacket and TaskAssignment (one test row with command, executionDetails and evidenceReferences; and the same task with no tests), with v1 identities 7b854ad9e2e64cb264d9d32e5f9680c201e002faec9a15f59a7c58a0f141ab95 and 93a44cddf3b97cb48249894b044e9bd0672bc7d12787ab0472f94ea974c7a489 computed by the pre-change code`
- **integration** — Exercise bindTaskFinalIdentities, restoreAcceptedAssignments and requireReuseIdentity across attempts on real fixture checkpoints: v2 sources reused after provenance-only edits (one task and three tasks in one submission); a v2 source refused after a real change; three tasks refused in one rejection because their source is v1; saved v1 attempts (including a v1 attempt reusing a v1 attempt) re-binding unchanged; the rejection text naming a provenance-only change between two v1 attempts; a published v2 reuse row passing validateTaskBody's reuse-identity check; the attribution budget counting one rejection per submission.
  - Subjects: `bindTaskFinalIdentities`, `requireReuseIdentity`, `restoreAcceptedAssignments`, `recordAttributionRejection`, `validateTaskBody`
  - Fixtures: `publication fixture checkpoint with an accepted v2 attempt 1 over three tasks and a correction attempt 2 whose test rows differ only in evidenceReferences, executionDetails and command`, `same, with attempt 2 changing a test's cases`, `a saved accepted attempt 1 without taskIdentityFormat whose stored identities were computed by the v1 formula, and a v1 attempt 2 that reused it`, `a CR body built from the published v2 attempts`

**Acceptance mapping**

| Criterion | Proving tests |
| :--- | :--- |
| `ac1` | `src/workflow/code-review/task-review/__tests__/reuse-identity.test.ts: a correction attempt reuses a task when only provenance text in its test rows changed`, `src/workflow/code-review/task-review/__tests__/reuse-identity.test.ts: the v2 task identity ignores command, execution details and evidence references`, `src/workflow/code-review/task-review/__tests__/reuse-identity.test.ts: a published v2 reuse row passes the record reuse-identity check` |
| `ac2` | `src/workflow/code-review/task-review/__tests__/reuse-identity.test.ts: the v2 task identity changes with the test file, cases or result`, `src/workflow/code-review/task-review/__tests__/reuse-identity.test.ts: reordered test cases refuse reuse`, `src/workflow/code-review/task-review/__tests__/reuse-identity.test.ts: a task with no assigned tests keeps a v2 identity over requirements, changes and documents`, `src/workflow/code-review/task-review/__tests__/reuse-identity.test.ts: reuse is still refused with reassess feedback when a test's cases changed`, `src/workflow/code-review/task-review/__tests__/reuse-identity.test.ts: the rejection names a provenance-only change between two v1 attempts` |
| `ac3` | `src/workflow/code-review/task-review/__tests__/reuse-identity.test.ts: the v1 task identity equals the identity pinned from the pre-change code`, `src/workflow/code-review/task-review/__tests__/reuse-identity.test.ts: an identity format on an unaccepted attempt is refused`, `src/workflow/code-review/task-review/__tests__/reuse-identity.test.ts: a saved attempt without an identity format re-binds with its stored v1 identities`, `src/workflow/code-review/task-review/__tests__/reuse-identity.test.ts: a saved v1 attempt that reused a v1 attempt still re-binds`, `src/workflow/code-review/task-review/__tests__/attribution-binding.test.ts: existing tests pass unchanged`, `src/workflow/code-review/task-review/__tests__/compatibility.test.ts: existing tests pass unchanged` |
| `ac4` | `src/workflow/code-review/task-review/__tests__/reuse-identity.test.ts: reuse from an attempt recorded under the earlier identity format is refused with reassess feedback`, `src/workflow/code-review/task-review/__tests__/reuse-identity.test.ts: three tasks whose source used the earlier identity format are refused in one rejection naming all three` |
| `ac5` | `src/workflow/code-review/task-review/__tests__/reuse-identity.test.ts: three tasks reused after their evidence references are removed are accepted in one submission` |

## 6. Migration

**State before:** The task reuse identity hashes the whole submitted test row (src/workflow/code-review/task-review/attribution-binding.ts:23-34, s1 bundle 1); saved attempts store those identities in taskScopeIdentities and are re-bound against them on restore; the reuse check throws at the first refused task (src/workflow/code-review/task-review/attribution-binding.ts:136, s1 bundle 1), each throw costing one of three submissions (src/workflow/code-review/task-review/attribution-repair.ts:6-16, s1 bundle 2); publication compares stored identity strings (src/workflow/code-review/task-review/record.ts:73-77, s1 bundle 2).

**State after:** New accepted mappings store 'final-task-v2' identities and taskIdentityFormat on the attempt header; unmarked saved attempts keep 'final-task-v1'; reuse requires matching formats and identities; one bind raises at most one reuse rejection naming every refused task.

**Zero downtime:** yes — **Data rewrite:** no

**Steps**

1. Add the optional taskIdentityFormat field ('final-task-v2') to the attempt header interface and strict schema, and require it absent on unpinned, pending and failed attempts. — ↩ rollbackable
2. Add the v2 identity input, the provenance digest on fingerprint test entries, the format parameter on the reuse check, and collect every format or identity refusal of a bind into one rejection; v1 stays the default for unmarked accepted attempts. — ↩ rollbackable
3. Deploy by daemon update/restart. No stored data is rewritten; existing checkpoints and CR history read as before. The first correction attempt of a review whose earlier attempts are v1 reassesses its formerly reused tasks in one extra submission. — ✕ non-rollbackable _(needs: `Before rolling back to code without the field, search the code-review checkpoints under .insrc/tmp for "taskIdentityFormat"; roll back only when none is found, because the older strict schema refuses a checkpoint that carries the field.`)_

**Backward compat:** Internal daemon contract only (no IPC or plugin surface). Saved attempts and CR history written before the change keep validating unchanged. Results from those attempts cannot be reused by attempts accepted after the change; all such tasks are refused in one rejection and reassessed together, costing one attribution submission in total. Older daemon builds cannot read checkpoints that carry the new optional field (see the rollback check in step 3).

## 7. Alternatives considered

### 7.1 a1: Versioned task identity recorded on the attempt, refusals collected per bind — **CHOSEN**

New attempts compute a 'final-task-v2' identity (test entries carry only file, cases, result and the committed test blob) and record taskIdentityFormat on the header; saved attempts without the marker keep 'final-task-v1'; the bind collects every reuse refusal and raises one rejection.

taskFinalInput takes a format; 'final-task-v1' is today's input unchanged, 'final-task-v2' replaces each test entry's detail with { file, cases, result } plus the committed blobOid. bindTaskFinalIdentities resolves its format (header taskIdentityFormat when present; else v1 for an already accepted attempt, v2 for a pending one), records taskIdentityFormat: 'final-task-v2' in the candidate of a newly accepted mapping, and passes that format to the reuse check. A non-throwing reuseRefusal(review, assignment, format) returns { field, message } or undefined: format refusal when the source attempt's format (taskIdentityFormat or v1) differs, else identity refusal with today's reuseMismatch text. The bind evaluates every reuse assignment and raises one TaskReviewInputError: a single refusal keeps today's field and text, several list every refused task id first and then each task's text, with the first refused task's field. requireReuseIdentity(review, assignment, format?) throws the one refusal and serves sourceAssessment, defaulting to the header format. taskInputFingerprint test entries keep path and identity (now the v2 digest) and add provenance (digest of the whole row); reuseMismatch compares provenance only when the comparison format is v1.

### 7.2 a2: Infer the format by trial

Compute both v1 and v2 identities on restore and accept whichever matches the stored values; no stored marker.

On restore, accept the saved taskScopeIdentities when every one equals either the v1 or the v2 recomputation. New attempts store v2. Reuse compares in the format that matched for the source; cross-format reuse is refused; refusals collected as in a1.

**Rejected because:** Avoids a schema field but leaves the format implicit: it is rediscovered by trial on every restore and reuse check, and the rule that all of an attempt's tasks share one format has nowhere to be recorded (ac4 partial). record.ts compares stored strings under both a1 and a2, so it is not a difference.

### 7.3 a3: Separate reuse identity beside the integrity identity

Keep taskScopeIdentities as today and add a second stored per-task reuse identity used only for reuse equality.

Add taskReuseIdentities (v2 inputs) to the attempt header, the CR summary and history snapshots; requireReuseIdentity and the record.ts reuse check compare reuse identities when both sides have them and fall back to the old identities otherwise; refusals collected as in a1.

**Rejected because:** Correct but adds stored data in three schemas and a publication fallback for the same reuse outcome.

### 7.4 a4: Narrow the single identity in place

Change 'final-task-v1' itself to hash only file, cases, result and blob, with no format marker.

Replace the tests entry of the one identity input with the v2 fields and keep everything else, including the format name.

**Rejected because:** Saved accepted attempts would recompute a different identity on restore and fail 'Accepted mapping cannot change within an attempt' (violates ac3).

## 8. References

- **[[c1]]** `code` `src/workflow/code-review/task-review/attribution-binding.ts:23-145` — "Task identity input, fingerprint, reuse check, bind deep-equality and re-bind."
- **[[c2]]** `code` `src/workflow/code-review/task-review/record.ts:73-77` — "A published reuse row's identity must equal the source review's stored task identity, compared as strings."
- **[[c3]]** `code` `src/workflow/code-review/task-review/attribution-repair.ts:6` — "MAX_ATTRIBUTION_SUBMISSIONS = 3; each TaskReviewInputError counts one rejection."
- **[[c4]]** `code` `src/workflow/code-review/task-review/contracts.ts:130` — "The attempt header schema is strict (additionalProperties false)."
- **[[c5]]** `prior-artifact` `docs/standalone/code-review-reuse-refused-when-only-E202611117d2422c8/ISSUE.md`
- **[[c6]]** `code` `src/workflow/code-review/task-review/__tests__/attribution-binding.test.ts` — "Existing tests pinning the reuse rejection text and saved identities."
- **[[c7]]** `doc` `docs/standalone/code-review-reuse-refused-when-only-E202611117d2422c8/S001/LLD-SELF-REVIEW.md` — "Design review rounds 1 (daemon) and 2 (controller self-review) and their changes."
