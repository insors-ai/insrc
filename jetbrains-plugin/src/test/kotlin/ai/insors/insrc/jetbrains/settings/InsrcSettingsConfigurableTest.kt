package ai.insors.insrc.jetbrains.settings

import org.junit.jupiter.api.Assertions.assertFalse
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Test
import java.io.File

/**
 * S002 source-scan guards for the settings page (the Configurable/Swing shell is
 * not headlessly bootable, so — like config-catalog-contract's source scan — we
 * assert the load-bearing invariants against the source text):
 *   - plugin.xml registers an <applicationConfigurable> pointing at InsrcSettingsConfigurable;
 *   - the Configurable is READ-ONLY: isModified() returns false, apply()/reset()
 *     do not write, and the class never calls a config write / reload.
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
    fun `InsrcSettingsConfigurable is read-only - isModified false, no config write or reload`() {
        val src = read("src/main/kotlin/ai/insors/insrc/jetbrains/settings/InsrcSettingsConfigurable.kt")
        // isModified() returns false (read-only page)
        assertTrue(
            Regex("""override fun isModified\(\)\s*:\s*Boolean\s*=\s*false""").containsMatchIn(src),
            "isModified() must return false (read-only)",
        )
        // the page must never write config or reload sessions
        assertFalse(src.contains("config.write"), "settings page must not call config.write")
        assertFalse(src.contains("writeSetting"), "settings page must not call a write (S002 is read-only)")
        assertFalse(src.contains("config.reload"), "settings page must not reload sessions")
    }
}
