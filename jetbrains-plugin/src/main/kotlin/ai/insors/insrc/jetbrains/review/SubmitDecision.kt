package ai.insors.insrc.jetbrains.review

import ai.insors.insrc.jetbrains.daemon.ResolveCommentResult

/**
 * The pure submit-outcome decision (Story S004 / t6). Kept out of the JCEF/EDT
 * wiring so it is unit-testable headlessly: the un-submitted buffer is cleared
 * ONLY on a full success (the daemon Recorded every submitted comment). Any
 * Unavailable, or a partial Recorded (recorded != submitted), keeps the WHOLE
 * buffer so no captured feedback is silently dropped (ac3).
 */
object SubmitDecision {
    fun shouldClear(result: ResolveCommentResult, submitted: Int): Boolean =
        result is ResolveCommentResult.Recorded && result.recorded == submitted
}
