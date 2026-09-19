package ai.insors.insrc.jetbrains.review

import ai.insors.insrc.jetbrains.daemon.PendingArtifactDto
import ai.insors.insrc.jetbrains.daemon.PendingQueryResult

/**
 * The pending-list view state (Story S001 / sc1, t4) — the platform-free core
 * the review tool window renders. Three DISTINCT states, so an unreachable
 * daemon can never be shown as "nothing to review": that would silently hide
 * real pending work (ac2). Kept separate from the Swing panel so the mapping
 * rule is unit-testable without an IDE fixture (like [ai.insors.insrc.jetbrains.ProjectContexts]).
 */
sealed interface ReviewListView {
    /** The daemon answered with a non-empty pending set — render the list. */
    data class Pending(val artifacts: List<PendingArtifactDto>) : ReviewListView

    /** The daemon answered with an empty set — "nothing awaiting review". */
    data object NothingPending : ReviewListView

    /** The daemon was unreachable or errored — "backing service unavailable". */
    data class Unavailable(val reason: String) : ReviewListView
}

/** Pure mapper from a [PendingQueryResult] to its [ReviewListView] state. */
object ReviewListViews {
    /**
     * An [Available][PendingQueryResult.Available] result splits on emptiness
     * (non-empty -> [Pending][ReviewListView.Pending], empty ->
     * [NothingPending][ReviewListView.NothingPending]); an
     * [Unavailable][PendingQueryResult.Unavailable] maps straight through to
     * [Unavailable][ReviewListView.Unavailable] — NEVER collapsed to the empty
     * state, so the panel keeps the two apart (ac2).
     */
    fun of(result: PendingQueryResult): ReviewListView = when (result) {
        is PendingQueryResult.Available ->
            if (result.artifacts.isEmpty()) ReviewListView.NothingPending
            else ReviewListView.Pending(result.artifacts)

        is PendingQueryResult.Unavailable -> ReviewListView.Unavailable(result.reason)
    }
}
