package ai.insors.insrc.jetbrains

/**
 * The active project's context (Story S001 / sc1) — the seam every downstream
 * story keys its per-project work on.
 *
 * [projectRootPath] is the opened project's absolute root; it IS the explicit
 * `repo` argument every insrc capability call must carry (constraint k3), so a
 * single shared [DaemonGateway][ai.insors.insrc.jetbrains.daemon.DaemonGateway]
 * can serve multiple open windows without cross-scoping. Immutable.
 */
data class ProjectContext(
    val projectRootPath: String,
    val ide: IdeKind,
)

/**
 * Pure factory for [ProjectContext] — the platform-free core the project-open
 * adapter delegates to, so the construction/skip rules are unit-testable
 * without an IDE fixture.
 */
object ProjectContexts {
    /**
     * Build a [ProjectContext] for an opened project, or `null` to SKIP it.
     *
     * Returns `null` (skip, do not fire a bogus context) when:
     *  - the project has no resolvable absolute root (a light/default or
     *    rootless window), or
     *  - the running IDE's product code is not one of the four supported IDEs.
     */
    fun of(projectRootPath: String?, productCode: String?): ProjectContext? {
        val root = projectRootPath?.trim()
        if (root.isNullOrEmpty()) return null
        val ide = IdeKind.fromProductCode(productCode) ?: return null
        return ProjectContext(projectRootPath = root, ide = ide)
    }
}
