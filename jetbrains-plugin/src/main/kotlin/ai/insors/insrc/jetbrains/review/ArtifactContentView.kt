package ai.insors.insrc.jetbrains.review

import ai.insors.insrc.jetbrains.daemon.ArtifactContentResult
import ai.insors.insrc.jetbrains.daemon.ArtifactReviewViewDto

/**
 * The content-pane view state (Story S002 / sc2, t5) — the platform-free core
 * the review content view renders. Two DISTINCT states, so an unreachable /
 * errored fetch is never shown as blank/empty content (ac2). Kept separate from
 * the Swing/JCEF panel so the mapping is unit-testable headlessly (mirrors
 * S001's [ReviewListViews]).
 */
sealed interface ArtifactContentView {
    /** The daemon returned the review view — render it. */
    data class Rendered(val view: ArtifactReviewViewDto) : ArtifactContentView

    /** The fetch failed / the daemon was unreachable — 'content unavailable'. */
    data class Unavailable(val reason: String) : ArtifactContentView
}

/** Pure mapper from an [ArtifactContentResult] to its [ArtifactContentView]. */
object ArtifactContentViews {
    fun of(result: ArtifactContentResult): ArtifactContentView = when (result) {
        is ArtifactContentResult.Loaded -> ArtifactContentView.Rendered(result.view)
        is ArtifactContentResult.Unavailable -> ArtifactContentView.Unavailable(result.reason)
    }
}

/** Which render surface the content view uses (Story S002 / ac2, lc2, k6). */
enum class RenderMode {
    /** The rich JCEF HTML view (the bundled markdown renderer). */
    JCEF_HTML,

    /** The read-only native-editor fallback, carrying the same review actions. */
    NATIVE_FALLBACK,
}

/**
 * Pure selection of the render surface from the JCEF availability gate
 * ([com.intellij.ui.jcef.JBCefApp.isSupported]). Extracted so the
 * gate→surface decision is testable without a JBR (ac2/lc2).
 */
fun renderModeFor(jcefSupported: Boolean): RenderMode =
    if (jcefSupported) RenderMode.JCEF_HTML else RenderMode.NATIVE_FALLBACK
