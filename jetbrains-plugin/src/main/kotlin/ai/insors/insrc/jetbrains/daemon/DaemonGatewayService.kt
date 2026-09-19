package ai.insors.insrc.jetbrains.daemon

import com.intellij.openapi.components.Service

/**
 * The single application-scoped sc2 service (Story S001). Downstream stories
 * obtain it via `service<DaemonGatewayService>()` and consume the
 * [DaemonGateway] surface; the concrete transport ([UnixSocketDaemonRpc]) and
 * socket wire format stay private here.
 *
 * One shared instance safely serves every open project window because every
 * method takes `projectRootPath` explicitly (k3) — there is no per-window
 * gateway state.
 */
@Service(Service.Level.APP)
class DaemonGatewayService : DaemonGateway {
    private val delegate: DaemonGateway = DaemonGatewayImpl(UnixSocketDaemonRpc())

    override fun probe(): DaemonState = delegate.probe()

    override fun isProjectRegistered(projectRootPath: String): Boolean =
        delegate.isProjectRegistered(projectRootPath)

    override fun registerProject(projectRootPath: String): RegistrationResult =
        delegate.registerProject(projectRootPath)

    override fun pendingArtifacts(projectRootPath: String): PendingQueryResult =
        delegate.pendingArtifacts(projectRootPath)

    override fun artifactReviewView(projectRootPath: String, mdPath: String): ArtifactContentResult =
        delegate.artifactReviewView(projectRootPath, mdPath)

    override fun resolveComment(
        projectRootPath: String,
        artifactId: String,
        comments: List<ReviewCommentDto>,
    ): ResolveCommentResult =
        delegate.resolveComment(projectRootPath, artifactId, comments)

    override fun approve(
        projectRootPath: String,
        mdPath: String,
        overrideReason: String?,
    ): ApproveResult =
        delegate.approve(projectRootPath, mdPath, overrideReason)
}
