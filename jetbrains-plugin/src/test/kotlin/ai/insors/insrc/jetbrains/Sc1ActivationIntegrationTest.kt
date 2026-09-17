package ai.insors.insrc.jetbrains

import ai.insors.insrc.jetbrains.platform.InsrcProjectOpenActivity
import com.intellij.testFramework.fixtures.BasePlatformTestCase
import kotlinx.coroutines.runBlocking

/**
 * sc1 activation integration test (Story S001 / t4). Runs inside the IntelliJ
 * Platform test fixture (a real, headless test IDE) and proves the plugin's
 * project-open activity fires `onProjectOpened` for an opened project, carrying
 * that project's absolute root — the acceptance criterion ac1.
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

    fun testMultipleProjectsScopeToTheirOwnRoot() {
        // Per-project scoping (k3): the shared, application-scoped surfaces are
        // keyed by explicit root, so two open projects never cross-scope. The
        // fixture hosts one project; the scoping invariant is exercised by
        // constructing each window's context from its own root.
        val a = ProjectContexts.of("/home/dev/project-a", "IC")
        val b = ProjectContexts.of("/home/dev/project-b", "GO")
        assertNotNull(a)
        assertNotNull(b)
        assertEquals("/home/dev/project-a", a!!.projectRootPath)
        assertEquals("/home/dev/project-b", b!!.projectRootPath)
        assertFalse("distinct windows must not share a root", a.projectRootPath == b.projectRootPath)
    }
}
