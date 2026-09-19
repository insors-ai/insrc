package ai.insors.insrc.jetbrains.review

import ai.insors.insrc.jetbrains.daemon.ApproveResult
import ai.insors.insrc.jetbrains.daemon.ArtifactReviewViewDto

/**
 * The pure approve decisions (Story S005 / t2). Kept out of the Swing/JCEF panel
 * so the load-bearing UI logic is unit-testable headlessly:
 *   - [enabled]           — normal Approve is offered only when the artifact is
 *     approvable (a review block-verdict disables it; the blockReason is shown).
 *   - [normalizeOverride] — a blank/whitespace override reason means NO override
 *     (a normal approve, so the block gate still applies); a non-blank reason is
 *     trimmed and sent as overrideReview to approve past a block.
 *   - [shouldRefresh]     — the pending list is refreshed (the just-approved
 *     artifact drops off) ONLY on a genuine [ApproveResult.Approved], never on a
 *     Withheld or an Unavailable.
 */
object ApproveDecision {
    fun enabled(view: ArtifactReviewViewDto): Boolean = view.approvable

    fun normalizeOverride(reason: String?): String? = reason?.trim()?.ifEmpty { null }

    fun shouldRefresh(result: ApproveResult): Boolean = result is ApproveResult.Approved

    /**
     * Whether an Approved reply for [approvedMdPath] should latch the "Approved"
     * state onto the currently-shown artifact ([shownMdPath]) — ONLY when they
     * are the same artifact. An approve reply that lands AFTER the reviewer has
     * navigated to a different pending artifact must not disable/label THAT one
     * (the daemon approved a different artifact).
     */
    fun latchApproved(approvedMdPath: String, shownMdPath: String?): Boolean =
        approvedMdPath == shownMdPath
}
