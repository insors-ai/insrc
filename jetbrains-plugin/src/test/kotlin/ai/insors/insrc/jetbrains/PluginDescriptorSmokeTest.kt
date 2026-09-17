package ai.insors.insrc.jetbrains

import org.junit.jupiter.api.Assertions.assertFalse
import org.junit.jupiter.api.Assertions.assertNotNull
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Test

/**
 * Smoke / contract test for Task t1 (no IntelliJ fixture needed — pure JUnit5).
 *
 * Verifies the plugin descriptor that the single build artifact ships is
 * present and loadable-shaped: it declares the plugin id and depends ONLY on
 * the common platform module, never an IDE-specific one. That common-platform
 * dependency is exactly what lets one artifact activate across all four target
 * IDEs (S001 / lc1, ac3); an IDE-specific `<depends>` would silently restrict
 * it to a single IDE.
 */
class PluginDescriptorSmokeTest {

    private fun descriptor(): String {
        val stream = javaClass.getResourceAsStream("/META-INF/plugin.xml")
        assertNotNull(stream, "META-INF/plugin.xml must be on the plugin's resource path")
        return stream!!.bufferedReader().use { it.readText() }
    }

    @Test
    fun `descriptor declares the insrc plugin id`() {
        assertTrue(
            descriptor().contains("<id>${InsrcPlugin.PLUGIN_ID}</id>"),
            "plugin.xml <id> must match InsrcPlugin.PLUGIN_ID",
        )
    }

    @Test
    fun `descriptor depends only on the common platform module`() {
        val xml = descriptor()
        assertTrue(
            xml.contains("<depends>com.intellij.modules.platform</depends>"),
            "plugin.xml must depend on the common platform module so one artifact loads in all four IDEs",
        )
        // No IDE-specific module dependency — that would restrict the single
        // artifact to one IDE and break lc1.
        val ideSpecificDepends = Regex(
            """<depends>com\.intellij\.modules\.(java|python|go|lang|ruby|php)\b[^<]*</depends>""",
        )
        assertFalse(
            ideSpecificDepends.containsMatchIn(xml),
            "plugin.xml must NOT depend on any IDE-specific module (found one, which would restrict the artifact to a single IDE)",
        )
    }
}
