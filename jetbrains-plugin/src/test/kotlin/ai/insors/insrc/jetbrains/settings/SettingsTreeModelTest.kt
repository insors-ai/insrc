package ai.insors.insrc.jetbrains.settings

import ai.insors.insrc.jetbrains.daemon.ConfigOptionDto
import ai.insors.insrc.jetbrains.daemon.SettingsCatalogDto
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Test

/**
 * S001 rework unit tests for the pure category-tree builder (SettingsView.settingsTree):
 * node ordering (categories in groupsOf order, then one node per section title),
 * default-selection ('General' when present else the first category), and that no
 * option is dropped/duplicated/reordered (an out-of-groups option gets a trailing node).
 */
class SettingsTreeModelTest {

    private fun opt(path: String, group: String) =
        ConfigOptionDto(path, "string", "d", "", null, group, null, false)

    /** groups=[General, Models]; options in General, Models, and an out-of-groups Misc. */
    private fun catalog() = SettingsCatalogDto(
        groups = listOf("General", "Models"),
        options = listOf(
            opt("logLevel", "General"),
            opt("models.tiers.core.model", "Models"),
            opt("svc.port", "Misc"), // group not in `groups` -> trailing bucket
        ),
        roles = emptyList(),
        tierNames = listOf("cheap", "mid", "core"),
    )

    private val sectionTitles = listOf("Per-role model overrides", "Per-repo overrides")

    @Test
    fun `nodes are categories in groupsOf order then one node per section title`() {
        val tree = SettingsView.settingsTree(catalog(), sectionTitles)
        val labels = tree.nodes.map { it.label }
        assertEquals(listOf("General", "Models", "Misc", "Per-role model overrides", "Per-repo overrides"), labels)
        // the first three are categories, the last two are sections
        assertTrue(tree.nodes[0] is SettingsTreeNode.Category)
        assertTrue(tree.nodes[2] is SettingsTreeNode.Category)
        assertTrue(tree.nodes[3] is SettingsTreeNode.Section)
        assertTrue(tree.nodes[4] is SettingsTreeNode.Section)
    }

    @Test
    fun `every option maps to exactly one category node in order (no drop, dup, or reorder)`() {
        val tree = SettingsView.settingsTree(catalog(), sectionTitles)
        val fromNodes = tree.nodes.filterIsInstance<SettingsTreeNode.Category>().flatMap { it.options.map { o -> o.path } }
        assertEquals(listOf("logLevel", "models.tiers.core.model", "svc.port"), fromNodes)
    }

    @Test
    fun `the default node is General when present`() {
        val tree = SettingsView.settingsTree(catalog(), sectionTitles)
        assertEquals("General", tree.nodes[tree.defaultIndex].label)
    }

    @Test
    fun `the default node falls back to the first category when there is no General`() {
        val noGeneral = SettingsCatalogDto(
            groups = listOf("Models", "Service"),
            options = listOf(opt("models.tiers.core.model", "Models"), opt("svc.port", "Service")),
            roles = emptyList(),
            tierNames = listOf("cheap", "mid", "core"),
        )
        val tree = SettingsView.settingsTree(noGeneral, sectionTitles)
        assertEquals(0, tree.defaultIndex)
        assertEquals("Models", tree.nodes[tree.defaultIndex].label)
    }

    @Test
    fun `an empty catalog with only sections still yields section nodes and a valid default`() {
        val empty = SettingsCatalogDto(emptyList(), emptyList(), emptyList(), listOf("cheap", "mid", "core"))
        val tree = SettingsView.settingsTree(empty, sectionTitles)
        assertEquals(listOf("Per-role model overrides", "Per-repo overrides"), tree.nodes.map { it.label })
        assertEquals(0, tree.defaultIndex) // first node when there is no category
    }
}
