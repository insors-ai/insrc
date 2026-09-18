package ai.insors.insrc.jetbrains.onboarding

import ai.insors.insrc.jetbrains.IdeKind
import ai.insors.insrc.jetbrains.LifecycleBroadcaster
import ai.insors.insrc.jetbrains.ProjectContext
import ai.insors.insrc.jetbrains.daemon.DaemonGateway
import ai.insors.insrc.jetbrains.daemon.DaemonState
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
        override fun registerProject(projectRootPath: String): RegistrationResult = RegistrationResult(true)
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
