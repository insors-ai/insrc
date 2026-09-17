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
     * k3: the application-scoped [DaemonGatewayImpl] holds no per-window state,
     * so interleaved calls from two different project roots each reach the
     * backend under their OWN root — a request from window A is never scoped to
     * window B's project. Proven by a recording fake RPC that captures the
     * `path` param of every `repo.add` the one shared gateway issues.
     */
    fun testSharedGatewayScopesEachCallToItsOwnRoot() {
        val recorded = mutableListOf<String?>()
        val gateway = DaemonGatewayImpl(object : DaemonRpc {
            override fun call(method: String, params: Map<String, Any?>): DaemonResult {
                if (method == DaemonGatewayImpl.METHOD_REPO_ADD) {
                    recorded += params[DaemonGatewayImpl.PARAM_PATH] as? String
                }
                return DaemonResult(ok = true)
            }
        })

        // Two "windows", interleaved, through the ONE shared gateway instance.
        gateway.registerProject("/home/dev/project-a")
        gateway.registerProject("/home/dev/project-b")
        gateway.registerProject("/home/dev/project-a")

        assertEquals(
            "each call must carry its own project root — no cross-scoping (k3)",
            listOf("/home/dev/project-a", "/home/dev/project-b", "/home/dev/project-a"),
            recorded,
        )
    }
}
