package ai.insors.insrc.jetbrains

import ai.insors.insrc.jetbrains.daemon.DaemonGatewayImpl
import ai.insors.insrc.jetbrains.daemon.DaemonResult
import ai.insors.insrc.jetbrains.daemon.DaemonRpc
import ai.insors.insrc.jetbrains.platform.InsrcProjectOpenActivity
import com.intellij.testFramework.fixtures.BasePlatformTestCase
import kotlinx.coroutines.runBlocking

/**
 * sc1 activation integration test (Story S001 / t4). Runs inside the IntelliJ
 * Platform test fixture (a real, headless test IDE) and proves the plugin's
 * project-open activity fires `onProjectOpened` for an opened project, carrying
 * that project's absolute root — acceptance criterion ac1. A second test proves
 * the per-project scoping invariant (k3): the SINGLE shared gateway routes each
 * call under the caller's own root, so two windows never cross-scope.
 *
 * JUnit4-style (BasePlatformTestCase); run under the vintage engine.
 */
class Sc1ActivationIntegrationTest : BasePlatformTestCase() {

    fun testProjectOpenActivityBroadcastsContextForOpenedProject() {
        val received = mutableListOf<ProjectContext>()
        val listener = object : PluginLifecycle {
            override fun onProjectOpened(ctx: ProjectContext) {
                received += ctx
            }

            override fun onPluginUninstalled() {}
        }
        LifecycleBroadcaster.register(listener)
        try {
            runBlocking { InsrcProjectOpenActivity().execute(project) }

            // The fixture project has an absolute basePath and runs under a
            // supported product (the test IDE is IntelliJ IDEA / IC), so exactly
            // one context is broadcast, keyed on the project's own root.
            assertEquals("expected exactly one onProjectOpened broadcast", 1, received.size)
            val ctx = received.single()
            assertEquals(
                "ProjectContext must carry the opened project's absolute root",
                project.basePath,
                ctx.projectRootPath,
            )
            assertEquals(IdeKind.IDEA, ctx.ide)
        } finally {
            LifecycleBroadcaster.unregister(listener)
        }
    }

    /**
     * k3, the multi-window scoping mechanism. A single BasePlatformTestCase hosts
     * one project, so rather than fake a second fixture window we assert the
     * property that actually makes multi-window safe: the ONE application-scoped
     * [DaemonGatewayImpl] holds no per-window state, so interleaved reads AND
     * writes from two different roots each reach the backend under their own root
     * — a request from window A never leaks into window B's project.
     *
     * This is distinct from t3's [Sc2DaemonGatewayTest], which only exercises a
     * single root per method: here both operations are interleaved across two
     * roots against one shared instance, which is where cross-window state, if
     * any existed, would show up.
     */
    fun testSharedGatewayScopesEachCallToItsOwnRoot() {
        val repoAdds = mutableListOf<String?>()
        val repoLists = mutableListOf<String?>() // params carry no path, so this stays null — reads are also root-argument driven
        val gateway = DaemonGatewayImpl(object : DaemonRpc {
            override fun call(method: String, params: Map<String, Any?>): DaemonResult {
                when (method) {
                    DaemonGatewayImpl.METHOD_REPO_ADD ->
                        repoAdds += params[DaemonGatewayImpl.PARAM_PATH] as? String
                    DaemonGatewayImpl.METHOD_REPO_LIST ->
                        repoLists += params[DaemonGatewayImpl.PARAM_PATH] as? String
                }
                return DaemonResult(ok = true, data = mapOf("repos" to listOf("/home/dev/project-a")))
            }
        })

        // Two "windows" (a, b), interleaved reads + writes through the ONE gateway.
        val aRegistered = gateway.isProjectRegistered("/home/dev/project-a")
        val bRegistered = gateway.isProjectRegistered("/home/dev/project-b")
        gateway.registerProject("/home/dev/project-a")
        gateway.registerProject("/home/dev/project-b")
        gateway.registerProject("/home/dev/project-a")

        // Reads are scoped by the explicit root argument, not by any retained
        // per-window state: a is registered, b is not, from the same instance.
        assertTrue("window A's read must see its own project's membership", aRegistered)
        assertFalse("window B's read must not inherit window A's membership", bRegistered)
        // Writes each carry their own root, in order, with no cross-scoping.
        assertEquals(
            "each write must carry its own project root — no cross-scoping (k3)",
            listOf("/home/dev/project-a", "/home/dev/project-b", "/home/dev/project-a"),
            repoAdds,
        )
    }
}
