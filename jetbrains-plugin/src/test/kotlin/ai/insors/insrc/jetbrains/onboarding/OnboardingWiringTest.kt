package ai.insors.insrc.jetbrains.onboarding

import ai.insors.insrc.jetbrains.IdeKind
import ai.insors.insrc.jetbrains.LifecycleBroadcaster
import ai.insors.insrc.jetbrains.ProjectContext
import ai.insors.insrc.jetbrains.daemon.DaemonGateway
import ai.insors.insrc.jetbrains.daemon.SteeringSelection
import ai.insors.insrc.jetbrains.daemon.RepoStatsResult
import ai.insors.insrc.jetbrains.daemon.DaemonStatusResult
import ai.insors.insrc.jetbrains.daemon.DaemonActionResult
import ai.insors.insrc.jetbrains.daemon.ApproveResult
import ai.insors.insrc.jetbrains.daemon.SaveResult
import ai.insors.insrc.jetbrains.daemon.PerRoleOverridesResult
import ai.insors.insrc.jetbrains.daemon.PerRepoOverridesResult
import ai.insors.insrc.jetbrains.daemon.RegisteredReposResult
import ai.insors.insrc.jetbrains.daemon.SettingsCatalogResult
import ai.insors.insrc.jetbrains.daemon.ArtifactContentResult
import ai.insors.insrc.jetbrains.daemon.ResolveCommentResult
import ai.insors.insrc.jetbrains.daemon.ReviewCommentDto
import ai.insors.insrc.jetbrains.daemon.DaemonState
import ai.insors.insrc.jetbrains.daemon.PendingQueryResult
import ai.insors.insrc.jetbrains.daemon.RegistrationResult
import ai.insors.insrc.jetbrains.host.AiHost
import ai.insors.insrc.jetbrains.host.AiHostAdapter
import ai.insors.insrc.jetbrains.host.AiHostKind
import ai.insors.insrc.jetbrains.host.MarkerDelimitedBlock
import com.intellij.testFramework.fixtures.BasePlatformTestCase

/**
 * sc1 onboarding-wiring integration test (Story S005 / t3). Inside the IntelliJ Platform fixture it
 * proves OnboardingLifecycle behaves as a registered [LifecycleBroadcaster] consumer: onProjectOpened
 * is dispatched through the injected off-EDT executor seam, and firePluginUninstalled (the
 * true-uninstall path) reaches onPluginUninstalled and drives the per-host cleanup.
 *
 * JUnit4-style (BasePlatformTestCase); run under the vintage engine.
 */
class OnboardingWiringTest : BasePlatformTestCase() {

    override fun setUp() {
        super.setUp()
        // Isolate from any consumer a dispatched project-open registration may have added, so firePluginUninstalled
        // fans out only to this test's instance (never real cleanup against the machine's host files).
        LifecycleBroadcaster.clear()
    }

    private class RecordingAdapter(private val hosts: List<AiHost>) : AiHostAdapter {
        val mcpRemovals = mutableListOf<AiHost>()
        override fun detectPresent(): List<AiHost> = hosts
        override fun writeMcpRegistration(host: AiHost, serverEntryJson: String) {}
        override fun removeMcpRegistration(host: AiHost) { mcpRemovals += host }
        override fun writeRulesBlock(host: AiHost, block: MarkerDelimitedBlock) {}
        override fun removeRulesBlock(host: AiHost) {}
    }

    private object AlreadyRegisteredGateway : DaemonGateway {
        override fun probe(): DaemonState = DaemonState.CURRENT
        override fun isProjectRegistered(projectRootPath: String): Boolean = true // no offer needed
        override fun registerProject(projectRootPath: String, steering: SteeringSelection?): RegistrationResult = RegistrationResult(true)
        override fun repoStats(projectRootPath: String): RepoStatsResult = RepoStatsResult.Unavailable("not used")
        override fun pendingArtifacts(projectRootPath: String): PendingQueryResult = PendingQueryResult.Available(emptyList())
        override fun artifactReviewView(projectRootPath: String, mdPath: String): ArtifactContentResult = ArtifactContentResult.Unavailable("not used in this test")
        override fun resolveComment(projectRootPath: String, artifactId: String, comments: List<ReviewCommentDto>): ResolveCommentResult = ResolveCommentResult.Unavailable("not used in this test")
        override fun approve(projectRootPath: String, mdPath: String, overrideReason: String?): ApproveResult = ApproveResult.Unavailable("not used in this test")
        override fun settingsCatalog(): SettingsCatalogResult = SettingsCatalogResult.Unavailable("not used in this test")
        override fun writeSetting(pathSegments: List<String>, value: Any?): SaveResult = SaveResult.Unavailable("not used in this test")
        override fun clearSetting(pathSegments: List<String>): SaveResult = SaveResult.Unavailable("not used in this test")
        override fun perRoleOverrides(): PerRoleOverridesResult = PerRoleOverridesResult.Unavailable("not used in this test")
        override fun perRepoOverrides(): PerRepoOverridesResult = PerRepoOverridesResult.Unavailable("not used in this test")
        override fun registeredRepos(): RegisteredReposResult = RegisteredReposResult.Unavailable("not used in this test")
        override fun daemonStatus(): DaemonStatusResult = DaemonStatusResult.Unavailable("not used in this test")
        override fun shutdown(): DaemonActionResult = DaemonActionResult.Failed("not used in this test")
        override fun backup(targetDir: String): DaemonActionResult = DaemonActionResult.Failed("not used in this test")
        override fun compact(): DaemonActionResult = DaemonActionResult.Failed("not used in this test")
    }

    fun testOnboardingLifecycle_registeredOnBroadcaster_offEdt_and_reachedByUninstall() {
        val host = AiHost(AiHostKind.AI_ASSISTANT, "/tmp/mcp.json", "/tmp/rules.md")
        val adapter = RecordingAdapter(listOf(host))
        var executorUsed = false
        val lifecycle = OnboardingLifecycle(
            gateway = AlreadyRegisteredGateway,
            adapter = adapter,
            offer = OnboardingOffer { _, _ -> },
            notify = {},
            execute = { executorUsed = true; it.run() },
        )

        LifecycleBroadcaster.register(lifecycle)
        try {
            LifecycleBroadcaster.fireProjectOpened(ProjectContext(project.basePath!!, IdeKind.IDEA))
            assertTrue("onProjectOpened is dispatched through the off-EDT executor seam", executorUsed)

            LifecycleBroadcaster.firePluginUninstalled()
            assertEquals("true uninstall reaches onPluginUninstalled -> per-host cleanup", listOf(host), adapter.mcpRemovals)
        } finally {
            LifecycleBroadcaster.unregister(lifecycle)
        }
    }
}
