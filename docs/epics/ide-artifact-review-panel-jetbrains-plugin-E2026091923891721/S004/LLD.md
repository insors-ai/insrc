<!-- insrc:artifact LLD-238917216d8fd532-s4 -->

# LLD: E2026091923891721:S004

**Epic:** `ide-artifact-review-panel-jetbrains-plugin`
**HLD base run:** `wf-1789799576767-kl7v1b`
**HLD effective hash:** `c93cb4358ff4...`

## HLD context

**Framework:** Chosen framework a1: a thin three-layer review surface bolted onto existing daemon capability. The daemon gains two small typed request/reply handlers — a read that enumerates the open project's pending-approval artifacts and a write that records reviewer comments through the existing open-question resolution machinery — while approval and artifact-content reads reuse the existing workflow.approve and artifact.get handlers unchanged. The JetBrains plugin extends its existing one-shot Unix-socket DaemonGateway with thin call() wrappers for those methods and adds a JCEF tool-window panel that renders the artifact's own content as HTML with inline PR-style anchored comment threads, a Submit action that records comments as open-question resolutions, and an Approve action that calls the existing approve path. The panel is gated by JBCefApp.isSupported() with a read-only native-editor fallback, and pending-artifact discovery is a bounded poll of the read handler. Reasoning stays entirely daemon-side (k1); the plugin only renders and transports.
**Rollout phase:** Phase B — Inline annotation + submit as open-question resolutions
**Consumes:** `sc2` (ArtifactReviewView), `sc3` (ReviewComment)

**Adjacent scope (owned by other stories — do NOT implement here):**
- `s1`: Private to s1: the daemon-side scan of the project's artifact store that classifies pending (approvedAt absent, not rejected) vs approved vs rejected; the plugin-side poll scheduler (project-open, IDE focus, coarse timer) and the tool-window list entry that renders the pending set, the empty 'nothing awaiting review' state, and the 'backing service unavailable' state. How often the poll fires and how the list is presented are s1's own concerns. — owns `sc1`
- `s2`: Private to s2: the JCEF browser lifecycle, the JBCefApp.isSupported() gate, the HTML rendering of the artifact's renderedMarkdown, and the read-only native-editor fallback view when JCEF is unavailable. The mechanics of turning renderedMarkdown into displayed HTML stay inside s2. — owns `sc2`
- `s3`: Private to s3: the inline-anchor UI mechanics (selecting a part of the rendered artifact, showing a thread there), the JBCefJSQuery add/edit/remove-comment bridge, and the un-submitted, presentation-only comment buffer held in the panel before Submit. No approval or resolution reasoning happens here (k1). — owns `sc3`
- `s5`: Private to s5: the Approve action wiring to the existing workflow.approve handler, explicit-override handling, block-reason display when a review verdict withholds approval, and the post-approve refresh so the just-approved artifact drops off the pending list. s5 adds no approval logic of its own — it calls the existing approve path.

## Contract details

**Surface level:** internal-shared

### `workflow.resolveComment`

```typescript
handleResolveComment(params: { repo?: string; artifactId: string; comments: ReviewComment[] }, repoEnv?: string): ResolveCommentResult | { error: string }
```

**Parameters:**
- `params.repo: string | undefined` _(optional)_ — Absolute repo path; falls back to repoEnv/INSRC_REPO and is resolved the same way S002's handleArtifactContent resolves it.
- `params.artifactId: string` — The artifact whose comments are being submitted, e.g. 'LLD-238917216d8fd532-s4'. Parsed to (kind, epicHash, storyId) — the locator recordResolution needs. No docs/ mdPath is accepted, so no untrusted filesystem path enters this handler.
- `params.comments: ReviewComment[]` — The submitted un-submitted-buffer snapshot (sc3): each has an id, an anchor {sectionPath?, quote?, openQuestionId?}, and a non-empty body.
- `repoEnv: string | undefined` _(optional)_ — The daemon's INSRC_REPO fallback, passed by the IPC dispatcher exactly as for handleArtifactContent.

**Returns:** `ResolveCommentResult | { error: string }` — On success ResolveCommentResult { recorded, resolutions[] } (sc3). On any failure a RETURNED { error } (framed by server.ts as result:{error}; the transport surfaces the non-empty result.error as ok=false) — never a partial/silent success.

**Errors:**
- `{ error: string }` when artifactId missing/malformed (does not parse to kind+epicHash+storyId), repo unresolved, the artifact json not found, or any recordResolution write failure — returned, never thrown.
- `{ error: string }` when comments is empty or any comment has a blank body (nothing to record) — returned so the plugin surfaces it and keeps the buffer.

**Preconditions:**
- The artifactId names a persisted artifact under .insrc/artifacts (located by parsed identity; the handler never reads an arbitrary caller path)
- Each comment.body is non-empty (already enforced by S003's applyCommentOp before it entered the buffer)

**Postconditions:**
- Each openQuestionId-anchored comment is recorded via recordResolution against that existing question (status='resolved', choice=anchor summary, rationale=body)
- Each section/quote/general comment appends a new entry to the artifact's own body.openQuestions and is immediately recorded via recordResolution against that new qId (a1) — all through the existing open-question machinery, no parallel store (lc1)
- recorded === the count of comments successfully written; resolutions[] reports each {openQuestionId?, status}

### `recordResolution`

```typescript
recordResolution(repoPath: string, kind: QuestionArtifactKind, epicHash: string, storyId: string | undefined, qId: string, status: QuestionResolutionStatus, choice?: string, rationale?: string): RecordResolutionResult
```

**Parameters:**
- `repoPath: string` — Resolved repo path.
- `kind: QuestionArtifactKind` — Parsed from artifactId (e.g. LLD).
- `epicHash: string` — Parsed from artifactId.
- `storyId: string | undefined` _(optional)_ — Parsed from artifactId (e.g. s4).
- `qId: string` — The open-question id: the comment's anchor.openQuestionId, or a freshly-minted id for an appended general-comment question.
- `status: QuestionResolutionStatus` — 'resolved' under a1 for recorded comments (the existing enum; no 'note' value is introduced).
- `choice: string | undefined` _(optional)_ — Short anchor summary (sectionPath/quote) for provenance.
- `rationale: string | undefined` _(optional)_ — The reviewer's comment body.

**Returns:** `RecordResolutionResult` — The existing result of merging one resolution into meta.questionResolutions (questions.ts:383-431). Consumed per comment; S004 adds no new behaviour to it.

**Errors:**
- `thrown/failed RecordResolutionResult` when The artifact cannot be located or written — caught by handleResolveComment and mapped to a returned { error }.

**Preconditions:**
- The (kind, epicHash, storyId) locate a persisted artifact

**Postconditions:**
- meta.questionResolutions gains/updates the entry for qId (existing behaviour, reused unchanged)

### `DaemonGateway.resolveComment`

```typescript
fun resolveComment(repo: String, artifactId: String, comments: List<ReviewCommentDto>): ResolveCommentResult
```

**Parameters:**
- `repo: String` — The project base path.
- `artifactId: String` — The selected artifact's id (already held by the panel from the S002 view).
- `comments: List<ReviewCommentDto>` — CommentBuffer.snapshot() (S003) mapped to the wire DTO.

**Returns:** `ResolveCommentResult (Recorded | Unavailable)` — A two-state result mirroring S002's ArtifactContentResult: Recorded(recorded, resolutions) on ok, Unavailable(reason) when the daemon is unreachable OR returns result.error (the S001 framing invariant) — the plugin never treats an {error} as success.

**Errors:**
- `ResolveCommentResult.Unavailable` when DaemonUnavailable, a non-ok reply, a non-empty result.error, or a malformed reply — classified verbatim, no client reasoning (k1).

**Preconditions:**
- The one-shot UnixSocketDaemonRpc channel is used (k2); no cloud/REST path

**Postconditions:**
- On Recorded the panel clears the submitted comments from the CommentBuffer and re-pushes; on Unavailable the buffer is kept and the failure is surfaced (ac3)

## Data model changes

### `ResolveCommentRequest` — new

The sc3 write request { repo, artifactId, comments: ReviewComment[] }, consumed as-is. artifactId (not an mdPath) is the locator: it parses to (kind, epicHash, storyId), so no untrusted docs/ path enters the handler and no path-guard/realpathSync is needed here (unlike S002's content read).

**Call sites:**
- `src/daemon/index.ts (new workflow.resolveComment dispatch)`
- `jetbrains-plugin DaemonGateway.resolveComment`

### `ResolveCommentResult` — new

The sc3 result { recorded, resolutions[] }. Under a1 the emitted status is 'resolved' (the existing enum); the sketch's optional 'note' status is NOT emitted — a documented sketch deviation, not a machinery change. resolutions[] carries {openQuestionId?, status} per recorded comment.

**Call sites:**
- `src/workflow/resolve-comment.ts (new pure handler)`
- `jetbrains-plugin ResolveCommentResult DTO`

### `body.openQuestions (artifact body)` — field-modify

a1 APPENDS a new open-question entry (derived from a section/quote/general comment's anchor + body) to the artifact's own body.openQuestions before resolving it, so the comment lives inside the existing open-question machinery. This is the one new write shape a1 introduces and the subject of the LLD open question. openQuestionId-anchored comments do NOT modify body.openQuestions (they resolve an existing question).

**Call sites:**
- `src/workflow/questions.ts (openQuestions projection reads body.openQuestions)`
- `src/workflow/artifact-content.ts (S002 view reflects the appended question)`

### `meta.questionResolutions (artifact meta)` — field-add

Each recorded comment adds/updates an entry keyed by qId via the existing recordResolution merge (questions.ts:409-415). No schema change to QuestionResolution.

**Call sites:**
- `src/workflow/questions.ts (recordResolution)`
- `src/workflow/artifact-content.ts (openQuestions status reflects the resolution)`

## Interaction with shared contracts

| Contract | Role | How |
| :--- | :--- | :--- |
| `sc3` | consumes | S004 consumes the ReviewComment model + the workflow.resolveComment write contract that S003 owns: the handler folds each ReviewComment into recordResolution and returns ResolveCommentResult. It does not redesign sc3; the only deviation is that a1 emits status='resolved' rather than the sketch's optional 'note' (documented, no type change). |
| `sc2` | consumes | After a successful submit the panel refreshes the ArtifactReviewView (S002) so the just-recorded resolutions show up as resolved open questions and the un-submitted buffer is cleared — consuming the read view unchanged. |

## Error paths

### Error cases

- **The daemon is unreachable when the reviewer clicks Submit.** (recoverable)
  - Detection: UnixSocketDaemonRpc.call() throws DaemonUnavailableException (socket connect/write fails); DaemonGateway.resolveComment catches it.
  - Response: Return ResolveCommentResult.Unavailable(reason); the panel surfaces a failure notification via the 'insrc' group and KEEPS the CommentBuffer intact (no clear, no re-push loss).
  - User impact: The reviewer sees 'submit failed — daemon unavailable' and their comments are still in the panel to retry.
- **The handler cannot record (artifact json not found, or a recordResolution write fails).** (recoverable)
  - Detection: handleResolveComment catches the failure and RETURNS { error }; server.ts frames it as result:{error}; UnixSocketDaemonRpc.parse surfaces the non-empty result.error as ok=false (the S001 framing invariant).
  - Response: DaemonGateway maps the ok=false reply to ResolveCommentResult.Unavailable(reason); the panel surfaces it and keeps the buffer.
  - User impact: The reviewer sees the specific failure reason and no comment is silently dropped (ac3).
- **artifactId is missing or malformed (does not parse to kind + epicHash + storyId).** (recoverable)
  - Detection: The artifactId parser returns null before any write; handleResolveComment returns { error: 'unrecognized artifactId' }.
  - Response: No write is attempted; the returned {error} becomes Unavailable client-side.
  - User impact: The reviewer sees a clear 'cannot identify the artifact' message; buffer kept.
- **A batch partially records: some comments are written, then a later recordResolution fails.** (recoverable)
  - Detection: handleResolveComment records sequentially and traps the failing call; it returns { error } carrying the recorded-so-far count.
  - Response: The plugin treats a non-full result as failure: it KEEPS the entire buffer (clears only on recorded === submitted) and surfaces the partial-failure reason. openQuestionId-anchored resolutions are idempotent on re-submit (keyed by qId); appended general-comment questions may duplicate on re-submit (a documented residual).
  - User impact: No feedback is lost, but a retry after a partial failure can create duplicate appended questions for the general comments already written — surfaced, not silent.
- **Submit is invoked with an empty buffer (or every comment somehow blank).** (recoverable)
  - Detection: handleResolveComment sees comments.length === 0 (or all-blank bodies, though S003 already blocks blanks) and returns { error: 'nothing to record' }; the plugin also disables Submit when the buffer is empty.
  - Response: No write; a benign 'no comments to submit' notice.
  - User impact: The reviewer is told there is nothing to submit.

### Edge cases

| Input | Expected |
| :--- | :--- |
| A comment anchored to an openQuestionId that no longer exists on the artifact (the question was already resolved/removed since the view loaded). | recordResolution merges by qId WITHOUT validating against the current open-questions list (questions.ts:409-415), so the resolution is still written; the openQuestions() projection (reused by S002) tolerates a resolution whose qId has no matching body text. Recorded, not rejected. |
| The reviewer re-submits after a partial failure. | openQuestionId-anchored comments overwrite the same qId entry (idempotent); general/section/quote comments append a NEW question each time (new minted qId) — a known duplication cost, mitigated by clearing the buffer only on full success. |
| The artifact was approved or rejected between load and Submit. | The write still succeeds (recordResolution does not gate on approvedAt); recording feedback on an already-decided artifact is harmless. No special-casing in S004. |
| The panel is in the native (non-JCEF) fallback. | S003 made annotation JCEF-only, so the buffer is empty in native mode and Submit is unavailable/no-op — consistent with the read-only native notice. |
| A very large comment body or a body containing markdown/quotes. | Stored verbatim as the resolution rationale; no truncation or re-rendering (k5 single source of truth). JSON transport escapes it. |

### Invariants to preserve

- Reviewer feedback is recorded ONLY through the existing recordResolution + open-question machinery (meta.questionResolutions, and body.openQuestions for appended general comments) — never a parallel comment store (lc1). [[c5]]
- A daemon handler that RETURNS { error } is framed by server.ts as result:{error} (a top-level error appears only on THROW); the transport must surface a non-empty result.error as ok=false so a failed submit is never read as success — the S001 latent-bug invariant. [[c4]]
- The single artifact remains the single source of truth; the submit writes into that one artifact's own body/meta and creates no divergent second copy of its content. [[c5]]
- The plugin owns no resolution reasoning: it transports the submit and classifies the reply as Recorded/Unavailable verbatim; all mapping of comments onto resolutions happens daemon-side. [[c1]]

## Test strategy

**Test framework:** `node:test via `npx tsx --test` (daemon TS) + JUnit5/Kotlin via `./gradlew test` on JDK21 (plugin)`

### Test levels

- **unit** — Prove the pure daemon handler folds each comment kind into recordResolution correctly and maps every failure to a returned {error} — over a temp .insrc/artifacts fixture, no socket (mirrors artifact-content.test.ts).
  - Subjects: `handleResolveComment: openQuestionId-anchored comment -> recordResolution(qId=openQuestionId, status='resolved', rationale=body); the artifact json's meta.questionResolutions gains the entry`, `handleResolveComment: section/quote/general comment -> a new body.openQuestions entry appended AND a resolution recorded against its minted qId (a1)`, `handleResolveComment: recorded count === comments written; resolutions[] shape`, `handleResolveComment: malformed/missing artifactId -> {error}, no write; empty comments -> {error}`, `handleResolveComment: unreadable/absent artifact json -> {error}; a mid-batch recordResolution failure -> {error} with recorded-so-far and no silent drop`, `artifactId parser: 'LLD-238917216d8fd532-s4' -> {kind:'LLD', epicHash, storyId:'s4'}; junk -> null`, `read-only-except-target: no file outside the target artifact json is created/mutated`
  - Fixtures: `a temp repo with .insrc/artifacts/<artifactId>.json carrying body.openQuestions + meta (like artifact-content.test.ts)`, `an artifact json with a pre-existing open question to resolve by openQuestionId`, `an artifact json with NO open questions (to exercise the general-comment append path)`
- **unit** — Prove the plugin gateway maps the daemon reply to Recorded/Unavailable verbatim, INCLUDING across the real transport framing boundary (the S001 lesson) — mirrors ArtifactContentTest.
  - Subjects: `DaemonGatewayImpl.resolveComment over a fake DaemonRpc: ok(result) -> Recorded(recorded, resolutions); ok=false -> Unavailable; DaemonUnavailable -> Unavailable; malformed -> Unavailable (never a blank Recorded)`, `the REAL UnixSocketDaemonRpc.parse across the boundary: {result:{recorded,resolutions}} -> ok=true -> Recorded; {result:{error}} -> ok=false -> Unavailable (a RETURNED handler error, not a throw)`, `the comment -> ReviewCommentDto wire mapping (anchor fields + body preserved)`, `the pure submit-outcome decision: clear the buffer ONLY when recorded === submitted; otherwise keep the whole buffer (ac3)`
  - Fixtures: `a FakeDaemonRpc returning canned DaemonResult values`, `a raw {result:{...}} / {result:{error}} JSON string to drive UnixSocketDaemonRpc.parse`
- **integration** — Prove the daemon dispatches the new workflow.resolveComment method end-to-end and persists into the artifact store.
  - Subjects: `the daemon index.ts dispatch routes 'workflow.resolveComment' to handleResolveComment`, `after a successful call, re-reading the artifact json shows the resolutions/appended questions (durable, backing-service-side — ac2)`
  - Fixtures: `a temp registered repo + artifact json`

### Acceptance mapping

| Criterion | Proving tests |
| :--- | :--- |
| `ac1` | `handleResolveComment: openQuestionId-anchored comment recorded as a resolution (unit)`, `handleResolveComment: section/quote/general comment appended + recorded (unit)`, `handleResolveComment: recorded count === comments written (unit)`, `integration: re-reading the artifact shows the recorded resolutions so the next stage's start-gate consumes them` |
| `ac2` | `handleResolveComment writes ONLY into the target artifact json's meta.questionResolutions/body.openQuestions (unit; read-only-except-target)`, `integration: the resolution is durable in the artifact store, not an IDE-local file`, `the plugin holds no local resolution store — gateway only transports (unit: mapping test)` |
| `ac3` | `DaemonGatewayImpl.resolveComment: ok=false / {result:{error}} / DaemonUnavailable / malformed -> Unavailable (unit, incl. the real parse boundary)`, `the submit-outcome decision keeps the whole buffer on any non-full/failed result (unit)`, `handleResolveComment: write failure / malformed artifactId / empty comments -> returned {error} (unit)` |

## Migration

**State before:** The daemon exposes workflow.approve, artifact.get, and the S002 workflow.artifactContent read handler; the plugin's DaemonGateway wraps pendingArtifacts (S001) + artifactReviewView (S002); S003 holds un-submitted comments in an in-memory CommentBuffer (presentation-only) with NO way to submit them — they are lost when the panel closes. recordResolution (questions.ts:383-431) already writes resolutions into an artifact's meta.questionResolutions but is only reached via the resolve_question workflow phase; there is no comment-submission IPC.

**State after:** A net-new daemon workflow.resolveComment handler folds each submitted ReviewComment into the existing recordResolution machinery (openQuestionId-anchored -> resolve that question; section/quote/general -> append a new body.openQuestions entry then resolve it), returning ResolveCommentResult. The plugin gains DaemonGateway.resolveComment + a Submit action that reads CommentBuffer.snapshot(), calls it, and on full success clears the buffer + re-pushes (on failure keeps the buffer and surfaces it). Existing artifacts, existing IPCs, and the resolve_question phase are all unchanged.

**Zero downtime:** yes — **Data rewrite:** no

### Steps

1. Add the pure daemon handler (src/workflow/resolve-comment.ts) + the ResolveCommentRequest/ResolveCommentResult types and register 'workflow.resolveComment' in the daemon dispatch. Purely additive — no existing method changes. — ↩ rollbackable
2. Add the plugin DaemonGateway.resolveComment wrapper + DTOs + the two-state Recorded|Unavailable result (mirroring S002's ArtifactContentResult), and add the override to the gateway test doubles. — ↩ rollbackable
3. Wire the Submit action into the S003 comment panel: read CommentBuffer.snapshot(), call resolveComment off-EDT, marshal the result to the EDT, clear+re-push on full success or keep+notify on failure. — ↩ rollbackable
4. Verify locally (npx tsc --noEmit + npx tsx --test for the daemon; ./gradlew test JDK21 for the plugin) — no production data touched. — ↩ rollbackable

**Backward compat:** Fully backward compatible: workflow.resolveComment is a new method, so older callers are unaffected; the plugin change only ADDS a method to the DaemonGateway interface (existing wrappers unchanged). Older artifacts without any comment resolutions are unaffected — the handler only writes when comments are submitted. An older plugin talking to a newer daemon simply never calls the new method; a newer plugin talking to an older daemon that lacks the method receives an unknown-method error, which the gateway classifies as Unavailable (surfaced, not a crash). No existing public API signature changes.

## Alternatives considered

### a1: Append-question-then-resolve (all comments land as resolved open questions) — **CHOSEN**

Every submitted comment becomes an open-question resolution: openQuestionId-anchored ones resolve their existing question; section/quote/general ones append a new open question (the comment text) to the artifact and immediately resolve it — all via recordResolution, no enum change.

The workflow.resolveComment handler derives (kind, epicHash, storyId) from the submitted artifact identity, then for each ReviewComment: if anchor.openQuestionId is set, call recordResolution(qId=openQuestionId, status='resolved', choice=anchor summary, rationale=body); otherwise FIRST append the comment (its anchor description + body) as a new entry in the artifact's body.openQuestions, mint a stable qId for it, then recordResolution(that qId, status='resolved', rationale=body). Because openQuestions() reads body.openQuestions + meta.questionResolutions together, the next stage sees each general comment as a resolved question carrying the reviewer's note — strictly the existing open-question mechanism (lc1), no 'note' status needed. Returns ResolveCommentResult {recorded, resolutions[]}.

### a2: Synthesized-qId note resolutions (no body mutation, extend status with 'note')

Record every comment as a questionResolutions entry keyed by a synthesized stable id (open-question-anchored ones key by their qId), carrying body as rationale and a new 'note' status for un-anchored comments — body.openQuestions is never mutated.

Extend QuestionResolutionStatus (types.ts) with a 'note' member (matching the sc3 sketch), then the handler records each comment straight into meta.questionResolutions: openQuestionId-anchored -> recordResolution(qId=openQuestionId, status='resolved'|'deferred', rationale=body); section/quote/general -> recordResolution(qId=`cmt-<stableHash(anchor+body)>`, status='note', question=anchor description, rationale=body). No append to body.openQuestions. openQuestions()/renderers must tolerate a resolution whose qId has no matching open-question text (render as a standalone note). ResolveCommentResult mirrors sc3 verbatim.

**Rejected because:** Satisfies ac1 too but forces a cross-cutting QuestionResolutionStatus edit in types.ts + an audit of every openQuestions()/renderer that switches on status — a change beyond s4's owns:[] boundary (k4 scored partial). Reserved as the alternative the open question offers.

### a3: Open-question-anchored comments only (minimal contract fit)

S004 submits only comments whose anchor targets an existing open question (resolve/ignore/defer it with the body as rationale); section/quote/general comments are held with a message telling the reviewer to anchor to an open question.

The handler accepts only ReviewComments with anchor.openQuestionId set, calling recordResolution(qId=openQuestionId, status derived from a per-comment choice or defaulting to 'resolved', choice=anchor summary, rationale=body). Comments without an openQuestionId are reported back in ResolveCommentResult as skipped (not recorded), and the plugin surfaces 'N comments need an open-question anchor to submit'. No body mutation, no enum change.

**Rejected because:** VIOLATES ac1 for the majority of S003's anchor model (section/quote/general comments), losing exactly the feedback the story must preserve. Only acceptable as an explicit scoped-down fallback if the user chooses to defer general-comment recording.

## Open questions

- General-comment mapping (load-bearing): how should a section/quote/general comment (no anchor.openQuestionId) be recorded through the existing open-question machinery? Recommended a1 = append a new body.openQuestions entry then resolve it (all comments recorded, no types.ts change, but mutates the artifact's authored body.openQuestions). Alternatives: a2 = a meta-only 'note' resolution keyed by a synthesized qId (needs a cross-cutting QuestionResolutionStatus enum change) or a3 = restrict submission to open-question-anchored comments only (drops general comments, violating ac1). Confirm a1 or choose a2/a3 before build.

## Resolved questions

- `q24c46fa1` — General-comment mapping (load-bearing): how should a section/quote/general comment (no anchor.openQuestionId) be recorded through the existing open-question machinery? Recommended a1 = append a new body.openQuestions entry then resolve it (all comments recorded, no types.ts change, but mutates the artifact's authored body.openQuestions). Alternatives: a2 = a meta-only 'note' resolution keyed by a synthesized qId (needs a cross-cutting QuestionResolutionStatus enum change) or a3 = restrict submission to open-question-anchored comments only (drops general comments, violating ac1). Confirm a1 or choose a2/a3 before build.
  - **resolved**: a1 — append the comment as a new body.openQuestions entry then resolve it via recordResolution — User's explicit in-chat choice. a1 records EVERY comment kind through the existing recordResolution + open-question machinery with the existing status enum (no types.ts change, staying within s4's boundary), honoring ac1 for section/quote/general comments. The cost — appending reviewer-authored entries to the artifact's own body.openQuestions — is accepted as the single new write shape. _(2026-09-19T12:12:15.339Z)_

## Citations

- **[[c1]]** `analyze-bundle` `s1 how-does-it-work bundle: recordResolution/openQuestions/jsonPathForMd machinery (src/workflow/questions.ts:383-431, :103; src/workflow/gates.ts:758)`
- **[[c2]]** `analyze-bundle` `s1 capability-discovery bundle: existing daemon read/approve IPC + plugin one-shot DaemonGateway + S002 handleArtifactContent reuse; the {error}->result:{error} framing invariant`
- **[[c3]]** `prior-artifact` `HLD shared contract sc2 ArtifactReviewView (owned by s2, consumed by s4)`
- **[[c4]]** `prior-artifact` `HLD shared contract sc3 ReviewComment + workflow.resolveComment write contract (owned by s3, consumed by s4)`
- **[[c5]]** `code` `src/workflow/questions.ts:402-415 (recordResolution builds {question,status,choice,rationale,resolvedAt} and merges into meta.questionResolutions) + src/workflow/types.ts:373 (QuestionResolution/QuestionResolutionStatus)`
