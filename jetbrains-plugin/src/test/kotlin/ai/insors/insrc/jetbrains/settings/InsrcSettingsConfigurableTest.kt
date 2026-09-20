package ai.insors.insrc.jetbrains.settings

import org.junit.jupiter.api.Assertions.assertFalse
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Test
import java.io.File

/**
 * Source-scan guards for the settings page (the Configurable/Swing shell is not
 * headlessly bootable, so — like config-catalog-contract's source scan — we
 * assert the load-bearing invariants against the source text):
 *   - plugin.xml registers an <applicationConfigurable> pointing at InsrcSettingsConfigurable;
 *   - S003: the page is EDITABLE — isModified delegates to the model, apply writes
 *     via the sc2 gateway (writeSetting/clearSetting), never a raw config.write
 *     string, and throws ConfigurationException on a not-Saved/validation failure;
 *     the edit controls are type-appropriate (JComboBox/JCheckBox/JTextField), not
 *     the S002 read-only JLabel/disabled checkbox.
 */
class InsrcSettingsConfigurableTest {

    private fun read(path: String): String {
        val f = File(path)
        assertTrue(f.exists(), "expected source at $path (test cwd=${File("").absolutePath})")
        return f.readText()
    }

    @Test
    fun `plugin_xml registers an applicationConfigurable pointing at InsrcSettingsConfigurable`() {
        val xml = read("src/main/resources/META-INF/plugin.xml")
        assertTrue(xml.contains("<applicationConfigurable"), "no <applicationConfigurable> in plugin.xml")
        assertTrue(
            xml.contains("ai.insors.insrc.jetbrains.settings.InsrcSettingsConfigurable"),
            "applicationConfigurable does not point at InsrcSettingsConfigurable",
        )
    }

    @Test
    fun `InsrcSettingsConfigurable is editable via the sc2 gateway, not a raw config write`() {
        val src = read("src/main/kotlin/ai/insors/insrc/jetbrains/settings/InsrcSettingsConfigurable.kt")
        // isModified delegates to the pure model (no longer a hardcoded false).
        assertTrue(
            src.contains("model?.isModified()"),
            "isModified() must delegate to the SettingsEditModel",
        )
        // apply persists through the sc2 gateway, never a raw config.write string.
        assertTrue(src.contains("gateway.writeSetting"), "apply must call gateway.writeSetting")
        assertTrue(src.contains("gateway.clearSetting"), "apply must call gateway.clearSetting")
        assertFalse(
            src.contains("\"config.write\""),
            "the page must go through the gateway, never a raw config.write method string",
        )
        // A rejected/unavailable write or a validation error blocks the save (ac4).
        assertTrue(
            src.contains("throw ConfigurationException"),
            "apply must throw ConfigurationException on a not-Saved/validation failure (ac4)",
        )
    }

    @Test
    fun `InsrcSettingsConfigurable installs type-appropriate edit controls`() {
        val src = read("src/main/kotlin/ai/insors/insrc/jetbrains/settings/InsrcSettingsConfigurable.kt")
        assertTrue(src.contains("JComboBox"), "enum settings need a chooser (JComboBox) (ac1)")
        assertTrue(src.contains("JTextField"), "string/number settings need a text/number field (ac1)")
        assertTrue(src.contains("JCheckBox"), "boolean settings need a toggle (JCheckBox) (ac1)")
        // controls are enabled editors, not the S002 disabled read-only checkbox.
        assertFalse(
            src.contains("isEnabled = false"),
            "S003 controls must be editable (no disabled read-only control)",
        )
    }

    @Test
    fun `InsrcSettingsConfigurable host renders SettingsSections and fans apply-isModified-reset to them (S004)`() {
        val src = read("src/main/kotlin/ai/insors/insrc/jetbrains/settings/InsrcSettingsConfigurable.kt")
        // A generic section list is rendered + driven (the sc3 seam is now consumed).
        assertTrue(src.contains("sections"), "the host must keep a list of SettingsSections")
        assertTrue(src.contains("PerRoleSection("), "the host builds the per-role section")
        assertTrue(src.contains("section.apply()"), "apply fans out to sections")
        assertTrue(src.contains("section.reset()"), "reset fans out to sections")
        assertTrue(
            src.contains("sections.any { it.isModified() }"),
            "isModified ORs the sections",
        )
        // Section writes ride the SAME off-EDT ProgressManager block as the global writes.
        assertTrue(src.contains("runProcessWithProgressSynchronously"), "writes run off the EDT")
    }

    @Test
    fun `PerRoleSection persists via the sc2 gateway with a literal segment list, not a raw config write`() {
        val src = read("src/main/kotlin/ai/insors/insrc/jetbrains/settings/PerRoleSection.kt")
        assertTrue(src.contains("gateway.writeSetting"), "sets go through sc2 writeSetting")
        assertTrue(src.contains("gateway.clearSetting"), "removals go through sc2 clearSetting")
        assertFalse(
            src.contains("\"config.write\""),
            "the section must go through the gateway, never a raw config.write method string",
        )
        assertTrue(
            src.contains("throw ConfigurationException"),
            "a not-Saved section write throws ConfigurationException (ac2/ac3)",
        )
        // No hardcoded role or tier: the rows/tiers come from the model (daemon-derived).
        assertTrue(src.contains("model.rows()"), "rows come from the model (daemon-derived, lc1)")
        assertTrue(src.contains("model.tierNames()"), "tier choices come from the model (daemon-derived)")
    }

    @Test
    fun `PerRepoSection persists via the sc2 gateway with a byRepo segment list, not a raw config write (S005)`() {
        val src = read("src/main/kotlin/ai/insors/insrc/jetbrains/settings/PerRepoSection.kt")
        assertTrue(src.contains("gateway.writeSetting"), "sets go through sc2 writeSetting")
        assertTrue(src.contains("gateway.clearSetting"), "removals go through sc2 clearSetting")
        assertFalse(
            src.contains("\"config.write\""),
            "the section must go through the gateway, never a raw config.write method string",
        )
        assertTrue(
            src.contains("throw ConfigurationException"),
            "a not-Saved leaf write throws ConfigurationException (ac2/ac3)",
        )
        // The three nested editors are driven from the model (daemon-derived, lc1/k5):
        // coreFloor + tasks combos + per-tier runner/model text fields.
        assertTrue(src.contains("model.rows()"), "rows come from the model (daemon-derived)")
        assertTrue(src.contains("model.tierNames()"), "tier choices come from the model (daemon-derived)")
        assertTrue(src.contains("model.roles()"), "per-role task rows come from the model (daemon-derived)")
        assertTrue(src.contains("model.addableRepos()"), "the add-picker candidates come from the model")
        assertTrue(src.contains("JComboBox"), "coreFloor + task tiers use a chooser")
        assertTrue(src.contains("JTextField"), "per-tier runner/model use free-text fields (k5)")
        assertTrue(src.contains("setTierField"), "the tiers editor edits runner/model leaves independently")
    }

    @Test
    fun `InsrcSettingsConfigurable host registers a PerRepoSection and reads perRepoOverrides plus registeredRepos (S005)`() {
        val src = read("src/main/kotlin/ai/insors/insrc/jetbrains/settings/InsrcSettingsConfigurable.kt")
        assertTrue(src.contains("PerRepoSection("), "the host builds the per-repo section")
        // The section rides the SAME sections list + off-EDT fan-out as S004 (no new machinery).
        assertTrue(src.contains("sections.add("), "the per-repo section is registered into the sections list")
        // createComponent's off-EDT read gains the two new reads.
        assertTrue(src.contains("gateway.perRepoOverrides()"), "createComponent reads perRepoOverrides")
        assertTrue(src.contains("gateway.registeredRepos()"), "createComponent reads registeredRepos")
        // A section is registered ONLY when both reads are Loaded (else a placeholder).
        assertTrue(
            src.contains("PerRepoOverridesResult.Loaded") && src.contains("RegisteredReposResult.Loaded"),
            "the per-repo section renders only when both reads are Loaded",
        )
    }

    @Test
    fun `InsrcSettingsConfigurable renders collapsible category sections with editable tables in one scrolling page (S001 a2 rework)`() {
        val src = read("src/main/kotlin/ai/insors/insrc/jetbrains/settings/InsrcSettingsConfigurable.kt")
        // ac2: categories render as COLLAPSIBLE panels (a toggle header over a body),
        // built from the pure panel-node model — NOT a master-detail JTree/JBSplitter/CardLayout.
        assertTrue(src.contains("collapsiblePanel("), "categories render as collapsible panels (ac2)")
        assertTrue(src.contains("JToggleButton"), "each collapsible panel has a toggle header (ac2)")
        assertTrue(src.contains("SettingsView.settingsTree("), "the panels are built from the pure SettingsView.settingsTree model")
        assertFalse(src.contains("JTree"), "the a1 master-detail JTree is gone (ac2)")
        assertFalse(src.contains("JBSplitter"), "the a1 master-detail JBSplitter is gone (ac2)")
        assertFalse(src.contains("CardLayout"), "the a1 CardLayout detail is gone (ac2)")
        // ac3/ac4: each category body is an editable Key/Value/Default JTable bound to the model.
        assertTrue(src.contains("JTable"), "each category body is a JTable (ac4)")
        assertTrue(src.contains("SettingsTableModel("), "the table is bound to the per-category SettingsTableModel (ac3/ac4)")
        // ac1: ONE outer AS_NEEDED page scroll; each category table is content-sized with
        // its OWN scrollbars OFF (NEVER), so the outer scroll governs — no maximumSize caps,
        // no vertical glue.
        assertTrue(src.contains("JScrollPane"), "the page is wrapped in a scroll pane (ac1)")
        assertTrue(src.contains("VERTICAL_SCROLLBAR_AS_NEEDED"), "the outer page scrolls when content overflows (ac1)")
        assertTrue(src.contains("VERTICAL_SCROLLBAR_NEVER"), "each category table's own scroll is off so the outer scroll governs (ac1)")
        assertTrue(src.contains("preferredScrollableViewportSize"), "each category table is content-sized (ac1)")
        assertTrue(src.contains("ScrollableContentPanel"), "the column tracks the viewport width but not its height (fills the settings window, no fixed size) (ac1)")
        assertFalse(src.contains("maximumSize = Dimension"), "no per-wrapper maximumSize height caps in the page shell (ac1)")
        assertFalse(src.contains("Box.createVerticalGlue"), "no vertical glue remains (ac1)")
        // The flat S002/S003 render path is gone.
        assertFalse(src.contains("collapsibleGroup"), "the flat collapsibleGroup render is replaced")
        assertFalse(src.contains("settingRow"), "the flat settingRow render is replaced")
        // ac5: General (the default node) is expanded on first render.
        assertTrue(src.contains("i == tree.defaultIndex"), "General (the default node) is expanded on first render (ac5)")
        // ac7: the override sections are rendered as collapsible panels over section.component().
        assertTrue(src.contains("section.component()"), "override sections render inside a collapsible panel over section.component() (ac7)")
        // ac6: the editable Value cell drives the unchanged edit model.
        assertTrue(src.contains("SettingsValueCellEditor"), "the Value column has an editable per-type cell editor (ac6)")
        assertTrue(src.contains("edit.editField"), "the table's setValueAt routes to SettingsEditModel.editField (ac6)")
        assertTrue(src.contains("edit.markResetToDefault"), "reset-to-default maps to markResetToDefault (ac6)")
    }
}
