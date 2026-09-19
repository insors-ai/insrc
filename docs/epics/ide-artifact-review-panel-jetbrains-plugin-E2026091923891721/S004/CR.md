<!-- insrc:artifact CR-238917216d8fd532-s4 -->

# Code review: 238917216d8fd532:s4

✅ **PASS** — HIGH 0 · MED 0 · LOW 2 · model `client`

**Changed files:** 12

## adherence — 0 finding(s)

_No findings._

## conventions — 0 finding(s)

_No findings._

## coverage — 1 finding(s)

| Severity | Location | Message |
| --- | --- | --- |
| LOW | jetbrains-plugin/src/main/kotlin/ai/insors/insrc/jetbrains/review/ArtifactCommentLayer.kt:115 | The JCEF/EDT Submit orchestration (submit()/applyResult(), the submitQuery bridge, comment-layer.js Submit button) has no automated test — it needs a live JBR/JCEF browser. This is a disclosed residual: the load-bearing decisions were extracted into pure Kotlin — SubmitDecision.shouldClear (tested: clears only on recorded===submitted) + the comment->ReviewCommentDto mapping + the gateway Recorded/Unavailable classification incl. the real UnixSocketDaemonRpc.parse framing boundary (ResolveCommentTest, 8 tests). The remove-only-submittedIds (HIGH fix) and the inFlight guard (MED fix) live in applyResult/submit and are the manual/backstopped surface. |

## quality — 1 finding(s)

| Severity | Location | Message |
| --- | --- | --- |
| LOW | jetbrains-plugin/src/main/kotlin/ai/insors/insrc/jetbrains/review/ArtifactCommentLayer.kt:155 | Independent cold review (opposite-actor) found and this build FIXED a HIGH silent-data-loss race (submit cleared the WHOLE buffer, dropping comments the reviewer added mid-flight) — fixed by removing ONLY the snapshotted submittedIds; plus 3 MED (double-submit re-entrancy -> an EDT-only inFlight guard; N synchronous git commit+push per submit blocking the daemon event loop -> an additive recordResolution opts.commit=false + one batched commit; a non-idempotent append duplicating on partial-failure re-submit -> resolveTargetQuestion reuses an identical already-appended question). Re-review CLEAN. Recorded here as the resolved risk. Narrow residual: editing an ALREADY-submitted comment during the in-flight window drops the un-submitted edit delta (the pre-edit body was what got recorded) — a much narrower corner than the fixed HIGH. |

