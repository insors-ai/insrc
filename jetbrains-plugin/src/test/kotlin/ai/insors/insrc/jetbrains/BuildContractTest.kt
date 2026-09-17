package ai.insors.insrc.jetbrains

import org.junit.jupiter.api.Assertions.assertFalse
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Test
import java.util.Properties

/**
 * Build contract test (Story S001 / t4) — verifies, without an IDE fixture, that
 * the single distribution artifact is versioned and compatible across all four
 * IDEs (acceptance criteria ac2, ac3, lc1):
 *  - `gradle.properties` pins a plugin version and a since/until-build range
 *    (the metadata the IDE's normal update path consumes, ac2);
 *  - the descriptor depends only on the common platform module, so one artifact
 *    loads in IntelliJ IDEA / PyCharm / GoLand / WebStorm (ac3, lc1).
 *
 * The "exactly one artifact" guarantee is structural: there is a single Gradle
 * module producing one `buildPlugin` distribution (no per-IDE variant), verified
 * end-to-end by `gradle build verifyPlugin` in CI.
 */
class BuildContractTest {

    private fun gradleProperties(): Properties {
        // Walk up from the test working dir to the module root that holds gradle.properties.
        var dir = java.io.File(System.getProperty("user.dir")).absoluteFile
        while (dir.parentFile != null && !java.io.File(dir, "gradle.properties").exists()) {
            dir = dir.parentFile
        }
        val file = java.io.File(dir, "gradle.properties")
        assertTrue(file.exists(), "gradle.properties must be locatable from the module")
        return Properties().apply { file.inputStream().use { load(it) } }
    }

    @Test
    fun `gradle properties pin a version and a since-until build range`() {
        val props = gradleProperties()
        assertTrue(props.getProperty("pluginVersion").orEmpty().isNotBlank(), "pluginVersion must be set (ac2)")
        assertTrue(props.getProperty("pluginSinceBuild").orEmpty().isNotBlank(), "pluginSinceBuild must be set (ac2)")
        assertTrue(props.getProperty("pluginUntilBuild").orEmpty().isNotBlank(), "pluginUntilBuild must be set (ac2)")
    }

    @Test
    fun `descriptor is compatible with all four IDEs via the common platform module only`() {
        val xml = javaClass.getResourceAsStream("/META-INF/plugin.xml")!!
            .bufferedReader().use { it.readText() }
        assertTrue(
            xml.contains("<depends>com.intellij.modules.platform</depends>"),
            "one artifact must depend on the common platform module (ac3, lc1)",
        )
        val ideSpecificDepends = Regex(
            """<depends>com\.intellij\.modules\.(java|python|go|lang|ruby|php)\b[^<]*</depends>""",
        )
        assertFalse(
            ideSpecificDepends.containsMatchIn(xml),
            "no IDE-specific <depends> — that would restrict the single artifact to one IDE",
        )
    }
}
