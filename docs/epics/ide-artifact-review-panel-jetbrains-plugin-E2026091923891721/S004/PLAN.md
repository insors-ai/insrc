<!-- insrc:artifact PLAN-238917216d8fd532-s4 -->

# Plan: E2026091923891721:S004

**Epic:** `ide-artifact-review-panel-jetbrains-plugin`
**LLD run:** `wf-1789818615081-okvb4w`
**LLD effective hash:** `c93cb4358ff4...`

## Tasks

| # | Task | Size | Depends on | Tests | Derived from |
| :--- | :--- | :--- | :--- | :--- | :--- |
| 1 | **`t1`** Daemon types + artifactId parser (pure) | S | — | unit: parseArtifactId decodes 'LLD-<hash>-s4' to {kind,epicHash,storyId} and returns null on junk | [[c1]] [[c4]] |
| 2 | **`t2`** Pure daemon handler handleResolveComment (a1 mapping) | M | `t1` | unit: handleResolveComment: openQuestionId-anchored comment -> resolution in meta.questionResolutions; unit: handleResolveComment: general/section/quote comment -> body.openQuestions appended + resolution recorded (a1); unit: handleResolveComment: recorded === comments written; resolutions[] shape; unit: handleResolveComment: every failure path returns {error}, never throws | [[c1]] [[c2]] [[c4]] [[c5]] |
| 3 | **`t3`** Register workflow.resolveComment in the daemon dispatch | S | `t2` | integration: the daemon dispatch routes 'workflow.resolveComment' to handleResolveComment | [[c7]] |
| 4 | **`t4`** Daemon tests (handler + parser + dispatch/persistence) | M | `t2`, `t3` | unit: handleResolveComment: malformed/missing artifactId + empty comments + absent/unreadable artifact -> {error}; unit: read-only-except-target: no file outside the target artifact json is created/mutated; integration: persistence: re-reading the artifact json after a call finds the recorded resolutions/appended questions (ac2) | [[c5]] [[c6]] |
| 5 | **`t5`** Plugin gateway wrapper + DTOs + Recorded\|Unavailable result | M | `t2` | unit: DaemonGatewayImpl.resolveComment over a fake DaemonRpc: ok->Recorded; ok=false/DaemonUnavailable/malformed->Unavailable; unit: comment -> ReviewCommentDto wire mapping preserves anchor fields + body | [[c3]] [[c4]] [[c5]] |
| 6 | **`t6`** Submit action wired into the S003 comment panel | M | `t5` | unit: submit-outcome decision: recorded===submitted -> clear the buffer; else keep the whole buffer | [[c3]] [[c5]] [[c7]] |
| 7 | **`t7`** Plugin tests (gateway boundary + submit-outcome) | M | `t5`, `t6` | unit: real UnixSocketDaemonRpc.parse across the boundary: {result:{recorded,resolutions}}->Recorded; {result:{error}}->Unavailable; unit: submit-outcome decision keeps the whole buffer on any non-full/failed result | [[c6]] |

### E2026091923891721:S004:T001 — Daemon types + artifactId parser (pure)

Add ResolveCommentRequest/ResolveCommentResult + the ReviewComment/CommentAnchor request types (sc3) in src/workflow/resolve-comment.ts, and a pure parseArtifactId(id): { kind, epicHash, storyId } | null that decodes 'LLD-<epicHash>-<storyId>' (returns null on junk). No I/O.

**Acceptance checks:**
- parseArtifactId('LLD-238917216d8fd532-s4') -> {kind:'LLD', epicHash:'238917216d8fd532', storyId:'s4'}
- parseArtifactId of a malformed id returns null (no throw)
- The types match the sc3 ResolveCommentRequest/ResolveCommentResult shapes (recorded, resolutions[])

### E2026091923891721:S004:T002 — Pure daemon handler handleResolveComment (a1 mapping)

In src/workflow/resolve-comment.ts implement handleResolveComment(params, repoEnv): parse artifactId, resolve repo, then per comment fold into recordResolution — openQuestionId-anchored -> resolve that question (status='resolved', choice=anchor summary, rationale=body); section/quote/general -> append a new body.openQuestions entry (read-modify-write the artifact json) then resolve its minted qId (a1). Return {recorded, resolutions[]} or a RETURNED {error} on every failure (malformed id, repo unresolved, artifact not found, empty/blank comments, a mid-batch recordResolution failure with recorded-so-far).

**Acceptance checks:**
- An openQuestionId-anchored comment writes a resolution into meta.questionResolutions for that qId
- A general/section/quote comment appends a body.openQuestions entry AND records a resolution against its minted qId
- recorded === comments successfully written; resolutions[] reports {openQuestionId?, status}
- Every failure path RETURNS {error} (never throws); nothing outside the target artifact json is written

### E2026091923891721:S004:T003 — Register workflow.resolveComment in the daemon dispatch

Register the 'workflow.resolveComment' method in src/daemon/index.ts delegating to handleResolveComment(params, repoEnv), mirroring the S002 workflow.artifactContent registration. Purely additive.

**Acceptance checks:**
- The daemon routes method 'workflow.resolveComment' to handleResolveComment
- No existing dispatch entry is changed

### E2026091923891721:S004:T004 — Daemon tests (handler + parser + dispatch/persistence)

Add src/workflow/__tests__/resolve-comment.test.ts mirroring artifact-content.test.ts (temp .insrc/artifacts fixture, no socket): each comment kind recorded; recorded count; every {error} path; read-only-except-target; parseArtifactId happy/junk. PLUS a lightweight dispatch/persistence assertion (call the handler over a temp registered-repo fixture and re-read the artifact json to confirm the resolutions/appended questions are durable — ac2). Verify via npx tsx --test + tsc --noEmit.

**Acceptance checks:**
- Tests cover openQuestionId-anchored + general-append + recorded-count + malformed-id + empty-comments + absent-artifact + read-only-except-target
- A persistence assertion re-reads the artifact json after a call and finds the recorded resolutions/appended questions (ac2)
- npx tsc --noEmit clean; the new tests pass under npx tsx --test

### E2026091923891721:S004:T005 — Plugin gateway wrapper + DTOs + Recorded|Unavailable result

Add DaemonGateway.resolveComment(repo, artifactId, comments): ResolveCommentResult (Recorded|Unavailable) + ReviewCommentDto + the result DTOs in DaemonGateway.kt, mirroring S002's artifactReviewView/ArtifactContentResult; classify the reply verbatim (ok->Recorded; ok=false/DaemonUnavailable/result.error/malformed->Unavailable). Add the new interface-method override to EVERY gateway test double (FakeGateway/NoopGateway/AlreadyRegisteredGateway across all test files) + imports in the SAME task so the suite compiles.

**Acceptance checks:**
- DaemonGatewayImpl.resolveComment maps ok(result)->Recorded and ok=false/DaemonUnavailable/result.error/malformed->Unavailable
- All existing gateway test doubles compile with the new override (no broken test files)
- The comment->ReviewCommentDto wire mapping preserves anchor fields + body

### E2026091923891721:S004:T006 — Submit action wired into the S003 comment panel

Wire Submit end-to-end: extract the pure submit-outcome DECISION (recorded===submitted -> clear the buffer, else keep it) into a testable Kotlin function; the ArtifactContentPane/ArtifactCommentLayer Submit path reads CommentBuffer.snapshot(), maps to DTOs, calls gateway.resolveComment off-EDT, marshals the result to the EDT, applies the decision (clear+re-push+refresh the S002 view on full success, else keep+notify via the 'insrc' group). The comment-layer.js Submit button + JBCefJSQuery bridge call is the manual/backstopped residual (recorded honestly in the CR).

**Acceptance checks:**
- The pure submit-outcome decision is a standalone testable function (recorded===submitted -> clear, else keep)
- Submit reads CommentBuffer.snapshot(), calls resolveComment off-EDT, and marshals the result to the EDT
- On Recorded with recorded===submitted the buffer is cleared + re-pushed; otherwise the whole buffer is kept and the failure surfaced (ac3)
- Submit is unavailable/no-op with an empty buffer or in the native (non-JCEF) fallback

### E2026091923891721:S004:T007 — Plugin tests (gateway boundary + submit-outcome)

Add plugin JUnit tests mirroring ArtifactContentTest: DaemonGatewayImpl.resolveComment over a fake DaemonRpc (ok->Recorded; ok=false/DaemonUnavailable/malformed->Unavailable) AND the real UnixSocketDaemonRpc.parse across the framing boundary ({result:{...}}->Recorded; {result:{error}}->Unavailable); the pure submit-outcome decision (clear only on recorded===submitted); the comment->DTO mapping. Verify via ./gradlew test JDK21.

**Acceptance checks:**
- Gateway tests cross the real parse framing boundary ({result:{error}}->Unavailable)
- The submit-outcome decision keeps the whole buffer on any non-full/failed result and clears only on full success
- ./gradlew test green on JDK21

## Test-strategy coverage

| LLD strategy item | Covered by |
| :--- | :--- |
| handleResolveComment: openQuestionId-anchored comment -> recordResolution(qId=openQuestionId, status='resolved', rationale=body); the artifact json's meta.questionResolutions gains the entry | `t2`, `t4` |
| handleResolveComment: section/quote/general comment -> a new body.openQuestions entry appended AND a resolution recorded against its minted qId (a1) | `t2`, `t4` |
| handleResolveComment: recorded count === comments written; resolutions[] shape | `t2`, `t4` |
| handleResolveComment: malformed/missing artifactId -> {error}, no write; empty comments -> {error} | `t2`, `t4` |
| handleResolveComment: unreadable/absent artifact json -> {error}; a mid-batch recordResolution failure -> {error} with recorded-so-far and no silent drop | `t2`, `t4` |
| artifactId parser: 'LLD-238917216d8fd532-s4' -> {kind:'LLD', epicHash, storyId:'s4'}; junk -> null | `t1`, `t4` |
| read-only-except-target: no file outside the target artifact json is created/mutated | `t4` |
| DaemonGatewayImpl.resolveComment over a fake DaemonRpc: ok(result) -> Recorded(recorded, resolutions); ok=false -> Unavailable; DaemonUnavailable -> Unavailable; malformed -> Unavailable (never a blank Recorded) | `t5`, `t7` |
| the REAL UnixSocketDaemonRpc.parse across the boundary: {result:{recorded,resolutions}} -> ok=true -> Recorded; {result:{error}} -> ok=false -> Unavailable (a RETURNED handler error, not a throw) | `t7` |
| the comment -> ReviewCommentDto wire mapping (anchor fields + body preserved) | `t5`, `t7` |
| the pure submit-outcome decision: clear the buffer ONLY when recorded === submitted; otherwise keep the whole buffer (ac3) | `t6`, `t7` |
| the daemon index.ts dispatch routes 'workflow.resolveComment' to handleResolveComment | `t3`, `t4` |
| after a successful call, re-reading the artifact json shows the resolutions/appended questions (durable, backing-service-side — ac2) | `t4` |

## Citations

- **[[c1]]** `prior-artifact` `LLD s4 contractDetails.api workflow.resolveComment (handleResolveComment signature + pre/postconditions)`
- **[[c2]]** `prior-artifact` `LLD s4 contractDetails.api recordResolution (the reused write path, questions.ts:383)`
- **[[c3]]** `prior-artifact` `LLD s4 contractDetails.api DaemonGateway.resolveComment (Recorded|Unavailable result, S001 framing invariant)`
- **[[c4]]** `prior-artifact` `LLD s4 dataModelChanges (ResolveCommentRequest/ResolveCommentResult + body.openQuestions/meta.questionResolutions)`
- **[[c5]]** `prior-artifact` `LLD s4 errorPaths (returned {error} on every failure; buffer-kept on failure; invariants)`
- **[[c6]]** `prior-artifact` `LLD s4 testStrategy (daemon unit + real parse boundary + persistence; frameworks)`
- **[[c7]]** `prior-artifact` `LLD s4 migration (additive dispatch registration + plugin gateway + Submit wiring; backward compat)`

<!-- insrc:review -->

## Review

### ✅ Review `PASS` — plan (plan)

**0 HIGH · 0 MED · 0 LOW** · model `client` · reviewed 2026-09-19T12:18:18.172Z

_No load-bearing premises were extracted._
