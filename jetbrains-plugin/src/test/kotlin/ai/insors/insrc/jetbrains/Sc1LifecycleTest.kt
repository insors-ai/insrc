package ai.insors.insrc.jetbrains

import org.junit.jupiter.api.AfterEach
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertFalse
import org.junit.jupiter.api.Assertions.assertNull
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Test

/**
 * sc1 unit tests (Story S001 / t2) — platform-free: they exercise the pure core
 * ([IdeKind.fromProductCode], [ProjectContexts.of], [UninstallPolicy],
 * [LifecycleBroadcaster]) that the platform adapters delegate to.
 */
class Sc1LifecycleTest {

    @AfterEach
    fun tearDown() = LifecycleBroadcaster.clear()

    @Test
    fun `product-identity-to-IdeKind resolves each of idea pycharm goland webstorm`() {
        assertEquals(IdeKind.IDEA, IdeKind.fromProductCode("IC"))
        assertEquals(IdeKind.IDEA, IdeKind.fromProductCode("IU"))
        assertEquals(IdeKind.PYCHARM, IdeKind.fromProductCode("PC"))
        assertEquals(IdeKind.PYCHARM, IdeKind.fromProductCode("PY"))
        assertEquals(IdeKind.GOLAND, IdeKind.fromProductCode("GO"))
        assertEquals(IdeKind.WEBSTORM, IdeKind.fromProductCode("WS"))
        // case-insensitive + trimmed
        assertEquals(IdeKind.IDEA, IdeKind.fromProductCode(" ic "))
        // an unsupported IDE (e.g. Rider = RD) resolves to null
        assertNull(IdeKind.fromProductCode("RD"))
        assertNull(IdeKind.fromProductCode(null))
    }

    @Test
    fun `ProjectContext carries the opened project's absolute root; a rootless window is skipped`() {
        val ctx = ProjectContexts.of("/home/dev/proj", "GO")
        assertEquals("/home/dev/proj", ctx?.projectRootPath)
        assertEquals(IdeKind.GOLAND, ctx?.ide)

        // rootless / light project -> skipped (null), no bogus context
        assertNull(ProjectContexts.of(null, "IC"))
        assertNull(ProjectContexts.of("", "IC"))
        assertNull(ProjectContexts.of("   ", "IC"))
        // unsupported IDE -> skipped as well
        assertNull(ProjectContexts.of("/home/dev/proj", "RD"))
    }

    @Test
    fun `onPluginUninstalled fires on uninstall but not on a mere disable`() {
        assertTrue(UninstallPolicy.shouldSignalUninstall(PluginStateEvent.UNINSTALL))
        assertFalse(UninstallPolicy.shouldSignalUninstall(PluginStateEvent.DISABLE))
        assertFalse(UninstallPolicy.shouldSignalUninstall(PluginStateEvent.INSTALL))
        assertFalse(UninstallPolicy.shouldSignalUninstall(PluginStateEvent.UPDATE))
    }

    @Test
    fun `broadcaster delivers uninstall to registered consumers and isolates failures`() {
        var uninstalledA = false
        var uninstalledB = false
        var openedA = false
        LifecycleBroadcaster.register(object : PluginLifecycle {
            override fun onProjectOpened(ctx: ProjectContext) { openedA = true }
            override fun onPluginUninstalled() { throw RuntimeException("consumer A blows up") }
        })
        LifecycleBroadcaster.register(object : PluginLifecycle {
            override fun onProjectOpened(ctx: ProjectContext) { /* ignore */ }
            override fun onPluginUninstalled() { uninstalledB = true }
        })

        // A failing consumer must not prevent B from being notified.
        LifecycleBroadcaster.firePluginUninstalled()
        assertTrue(uninstalledB, "second consumer must still receive onPluginUninstalled")

        // firing project-open must not invoke the uninstall hook (events are distinct)
        LifecycleBroadcaster.fireProjectOpened(ProjectContext("/x", IdeKind.IDEA))
        assertFalse(uninstalledA, "onProjectOpened must not trigger onPluginUninstalled")
        assertTrue(openedA)
    }
}
