package ai.insors.insrc.jetbrains.ops

import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertFalse
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Test
import java.io.File

/**
 * Source-scan guards for the nested Settings pages (Story E2026092157298940:S001 /
 * sc1): the three child applicationConfigurables (Daemon/Workflows/Debug) nested under
 * the UNCHANGED parent insrc node, built on the shared InsrcOpsConfigurable page-shell
 * base. The Settings dialog is not headlessly bootable, so — the SettingsViewTest /
 * RepoStatusPopupLayoutTest idiom — the load-bearing invariants are asserted against
 * source text (plugin.xml + the .kt files).
 */
class NestedOpsPagesTest {

    private fun read(path: String): String {
        val f = File(path)
        assertTrue(f.exists(), "expected source at $path (test cwd=${File("").absolutePath})")
        return f.readText()
    }

    @Test
    fun `ac1 - plugin_xml nests exactly three child pages under the unchanged parent`() {
        val xml = read("src/main/resources/META-INF/plugin.xml")

        // exactly three children point at the parent insrc Settings node
        val childParent = Regex("parentId=\"ai\\.insors\\.insrc\\.settings\"").findAll(xml).count()
        assertEquals(3, childParent, "exactly three child applicationConfigurables nest under ai.insors.insrc.settings")

        // the three distinct child ids + their instance classes
        for (id in listOf("ai.insors.insrc.daemon", "ai.insors.insrc.workflows", "ai.insors.insrc.debug")) {
            assertTrue(xml.contains("id=\"$id\""), "child id $id is registered")
        }
        for (cls in listOf("ops.DaemonConfigurable", "ops.WorkflowsConfigurable", "ops.DebugConfigurable")) {
            assertTrue(xml.contains(cls), "child instance $cls is wired")
        }

        // the parent element is UNCHANGED: still parentId=tools with the shipped instance
        assertTrue(
            xml.contains("parentId=\"tools\"") &&
                xml.contains("id=\"ai.insors.insrc.settings\"") &&
                xml.contains("ai.insors.insrc.jetbrains.settings.InsrcSettingsConfigurable"),
            "the parent insrc Settings node (parentId=tools, InsrcSettingsConfigurable) is untouched",
        )
    }

    @Test
    fun `ac2 - the shared page-shell base runs off-EDT with a guarded render and never edits the settings page`() {
        val base = read("src/main/kotlin/ai/insors/insrc/jetbrains/ops/InsrcOpsConfigurable.kt")
        assertTrue(base.contains("abstract class InsrcOpsConfigurable : Configurable"), "base is an abstract Configurable")
        assertTrue(base.contains("protected abstract fun pageTitle()"), "base exposes abstract pageTitle()")
        assertTrue(base.contains("protected abstract fun buildBody()"), "base exposes abstract buildBody()")
        assertTrue(base.contains("executeOnPooledThread"), "the body read runs OFF the EDT")
        assertTrue(base.contains("invokeLater"), "the render is marshalled back to the EDT")
        assertTrue(base.contains("disposed"), "a disposed guard drops a late render")
        assertTrue(base.contains("JBScrollPane"), "the top-level component is a JBScrollPane")
        assertTrue(base.contains("ScrollableColumn"), "the body sits in the shared width-tracking ScrollableColumn")

        // no-regression: S001 does NOT edit the shipped parent settings page.
        val settings = read("src/main/kotlin/ai/insors/insrc/jetbrains/settings/InsrcSettingsConfigurable.kt")
        assertFalse(
            settings.contains("InsrcOpsConfigurable"),
            "the shipped Settings page is not repointed at the new base in this story",
        )
    }

    @Test
    fun `ac2 - each child extends the base and overrides only pageTitle + buildBody`() {
        val expected = mapOf(
            "DaemonConfigurable" to "Daemon",
            "WorkflowsConfigurable" to "Workflows",
            "DebugConfigurable" to "Debug",
        )
        for ((cls, title) in expected) {
            val src = read("src/main/kotlin/ai/insors/insrc/jetbrains/ops/$cls.kt")
            assertTrue(src.contains("class $cls : InsrcOpsConfigurable()"), "$cls extends InsrcOpsConfigurable()")
            assertTrue(src.contains("override fun pageTitle(): String = \"$title\""), "$cls titles itself $title")
            assertTrue(src.contains("override fun buildBody()"), "$cls overrides buildBody()")
            // All three child pages are now filled — Daemon by S002, Workflows by S003,
            // Debug by S004 — so there is no remaining placeholder-only page to guard.
            // Each page's domain body is asserted by its own source-scan test
            // (DaemonPageTest / WorkflowsPageTest / DebugPageTest).
        }
    }
}
