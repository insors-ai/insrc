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

    override fun registerProject(projectRootPath: String, steering: SteeringSelection?): RegistrationResult =
        delegate.registerProject(projectRootPath, steering)

    override fun repoStats(projectRootPath: String): RepoStatsResult =
        delegate.repoStats(projectRootPath)

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

    override fun settingsCatalog(): SettingsCatalogResult = delegate.settingsCatalog()

    override fun writeSetting(pathSegments: List<String>, value: Any?): SaveResult =
        delegate.writeSetting(pathSegments, value)

    override fun clearSetting(pathSegments: List<String>): SaveResult =
        delegate.clearSetting(pathSegments)

    override fun perRoleOverrides(): PerRoleOverridesResult = delegate.perRoleOverrides()

    override fun perRepoOverrides(): PerRepoOverridesResult = delegate.perRepoOverrides()

    override fun registeredRepos(): RegisteredReposResult = delegate.registeredRepos()

    override fun daemonStatus(): DaemonStatusResult = delegate.daemonStatus()

    override fun shutdown(): DaemonActionResult = delegate.shutdown()

    override fun backup(targetDir: String): DaemonActionResult = delegate.backup(targetDir)

    override fun compact(): DaemonActionResult = delegate.compact()
}
