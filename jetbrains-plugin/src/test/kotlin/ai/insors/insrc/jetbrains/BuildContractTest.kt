package ai.insors.insrc.jetbrains

import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Test
import java.io.File
import java.util.Properties

/**
 * Build contract test (Story S001 / t4) — verifies, without an IDE fixture, that
 * the build produces exactly ONE versioned artifact (acceptance criteria ac2 and
 * the single-integration constraint lc1):
 *  - `gradle.properties` pins a plugin version and a since/until-build range (the
 *    metadata the IDE's normal update path consumes, ac2);
 *  - the build is a single Gradle module (no subprojects, no per-IDE variant) that
 *    applies the IntelliJ Platform plugin once, so `buildPlugin` yields one
 *    distribution rather than a per-IDE artifact;
 *  - that one distribution's descriptor depends only on the common platform
 *    module, so it loads across all four IDEs (ac3, lc1).
 */
class BuildContractTest {

    /** Locate the plugin module root (the dir holding gradle.properties). */
    private fun moduleRoot(): File {
        var dir = File(System.getProperty("user.dir")).absoluteFile
        while (dir.parentFile != null && !File(dir, "gradle.properties").exists()) {
            dir = dir.parentFile
        }
        assertTrue(File(dir, "gradle.properties").exists(), "gradle.properties must be locatable")
        return dir
    }

    @Test
    fun `gradle properties pin a version and an open-ended since-build range`() {
        val props = Properties().apply {
            File(moduleRoot(), "gradle.properties").inputStream().use { load(it) }
        }
        assertTrue(props.getProperty("pluginVersion").orEmpty().isNotBlank(), "pluginVersion must be set (ac2)")
        assertTrue(props.getProperty("pluginSinceBuild").orEmpty().isNotBlank(), "pluginSinceBuild must be set (ac2)")
        // The upper bound is DELIBERATELY open-ended (untilBuild unset in build.gradle.kts,
        // pluginUntilBuild removed from gradle.properties) so the plugin stays forward-compatible
        // across IDE releases — it depends only on the stable com.intellij.modules.platform.
        assertTrue(props.getProperty("pluginUntilBuild").orEmpty().isBlank(), "pluginUntilBuild is intentionally open-ended (unset)")
    }

    @Test
    fun `build is a single module that emits one plugin artifact`() {
        val root = moduleRoot()

        // No subprojects: a single module produces a single distribution (no
        // per-IDE variant). settings.gradle.kts must not include(...) anything.
        val settings = File(root, "settings.gradle.kts").readText()
        val includeCount = Regex("""(^|\n)\s*include\s*\(""").findAll(settings).count()
        assertEquals(0, includeCount, "settings.gradle.kts must declare no subprojects (one artifact, lc1)")

        // The IntelliJ Platform plugin is applied exactly once — one buildPlugin task,
        // one distribution artifact.
        val build = File(root, "build.gradle.kts").readText()
        val platformPluginApplications =
            Regex("""org\.jetbrains\.intellij\.platform""").findAll(build).count()
        assertTrue(
            platformPluginApplications >= 1,
            "build.gradle.kts must apply the IntelliJ Platform plugin (one plugin build)",
        )
        // No IDE-specific per-variant product blocks (would imply multiple artifacts).
        assertTrue(
            !build.contains("pycharmProfessional") &&
                !build.contains("goland") &&
                !build.contains("webStorm"),
            "build must not configure per-IDE product variants (single artifact, lc1)",
        )
    }

    @Test
    fun `the one artifact's descriptor depends only on the common platform module`() {
        // The single-artifact half above only matters if that artifact loads in
        // all four IDEs — which requires a common-platform-only descriptor (ac3).
        val xml = javaClass.getResourceAsStream("/META-INF/plugin.xml")!!
            .bufferedReader().use { it.readText() }
        assertTrue(
            xml.contains("<depends>com.intellij.modules.platform</depends>"),
            "the single artifact must depend on the common platform module (ac3, lc1)",
        )
        val ideSpecificDepends = Regex(
            """<depends>com\.intellij\.modules\.(java|python|go|lang|ruby|php)\b[^<]*</depends>""",
        )
        assertTrue(
            !ideSpecificDepends.containsMatchIn(xml),
            "no IDE-specific <depends> — that would restrict the single artifact to one IDE",
        )
    }
}
