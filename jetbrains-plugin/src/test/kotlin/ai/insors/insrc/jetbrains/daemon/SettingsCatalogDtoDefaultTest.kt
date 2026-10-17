package ai.insors.insrc.jetbrains.daemon

import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertFalse
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Test
import java.io.File

/**
 * Story s3 / t9 — SettingsCatalogDto gains repoFields with an emptyList() default so
 * the existing positional callers compile unchanged: the five settings tests build the
 * DTO without it and are left untouched.
 */
class SettingsCatalogDtoDefaultTest {

    @Test
    fun `the DTO built without repoFields defaults to an empty list`() {
        val dto = SettingsCatalogDto(groups = listOf("General"), options = emptyList(), roles = emptyList(), tierNames = listOf("cheap"))
        assertEquals(emptyList<RepoFieldDto>(), dto.repoFields)
        // copy() keeps the default and an explicit value round-trips.
        val field = RepoFieldDto("ghHost", "GitHub host", "string", null, "github.com", "d", "Tracker", "local", null)
        assertEquals(listOf(field), dto.copy(repoFields = listOf(field)).repoFields)
        assertEquals(emptyList<RepoFieldDto>(), dto.copy(groups = emptyList()).repoFields)
    }

    @Test
    fun `the five settings tests build the DTO without repoFields and are unchanged`() {
        val dir = "src/test/kotlin/ai/insors/insrc/jetbrains/settings/"
        val names = listOf(
            "SettingsTreeModelTest.kt", "SettingsTableModelTest.kt", "ModelTiersModelTest.kt",
            "SettingsEditModelTest.kt", "SettingsViewTest.kt",
        )
        for (name in names) {
            val f = File(dir + name)
            assertTrue(f.exists(), "expected $dir$name")
            val text = f.readText()
            assertTrue(text.contains("SettingsCatalogDto("), "$name builds the catalog DTO")
            assertFalse(text.contains("repoFields"), "$name does not name repoFields, so it relies on the default")
        }
        val dto = File("src/main/kotlin/ai/insors/insrc/jetbrains/daemon/DaemonGateway.kt").readText()
        assertTrue(dto.contains("val repoFields: List<RepoFieldDto> = emptyList(),"), "the default lives on the DTO")
    }
}
