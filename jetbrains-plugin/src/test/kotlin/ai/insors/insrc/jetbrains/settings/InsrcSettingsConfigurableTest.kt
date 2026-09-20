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
}
