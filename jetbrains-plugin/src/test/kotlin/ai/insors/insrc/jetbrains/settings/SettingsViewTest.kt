package ai.insors.insrc.jetbrains.settings

import ai.insors.insrc.jetbrains.daemon.ConfigOptionDto
import ai.insors.insrc.jetbrains.daemon.SettingsCatalogDto
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Test

/**
 * S002 unit tests for the pure sc3 view logic (SettingsView) — the load-bearing
 * grouping + current-vs-default display, tested headlessly (no Swing).
 */
class SettingsViewTest {

    private fun opt(
        path: String,
        group: String,
        type: String = "string",
        default: Any? = "d",
        currentValue: Any? = null,
        isSet: Boolean = false,
        enumValues: List<String>? = null,
    ) = ConfigOptionDto(path, type, default, "desc of $path", enumValues, group, currentValue, isSet)

    @Test
    fun `groupsOf orders by payload groups, covers every option, trailing-buckets out-of-groups, skips empty groups`() {
        val catalog = SettingsCatalogDto(
            groups = listOf("General", "Models", "EmptyGroup"),
            options = listOf(
                opt("logLevel", "General"),
                opt("ollama.host", "General"),
                opt("models.coreFloor", "Models"),
                opt("stray.setting", "Zzz"), // group not listed in groups[]
            ),
            roles = emptyList(),
            tierNames = emptyList(),
        )

        val models = SettingsView.groupsOf(catalog)

        // General + Models (declared, non-empty) first, in payload order; then the
        // out-of-groups "Zzz" trailing. "EmptyGroup" (no options) yields no model.
        assertEquals(listOf("General", "Models", "Zzz"), models.map { it.group })
        assertEquals(listOf("logLevel", "ollama.host"), models[0].options.map { it.path })
        assertEquals(listOf("models.coreFloor"), models[1].options.map { it.path })
        assertEquals(listOf("stray.setting"), models[2].options.map { it.path })

        // every option appears exactly once
        val rendered = models.flatMap { it.options }.map { it.path }
        assertEquals(catalog.options.map { it.path }.sorted(), rendered.sorted())
    }

    @Test
    fun `displayValue shows the value when set and the default with a marker when unset`() {
        val set = opt("logLevel", "General", type = "enum", default = "info", currentValue = "debug", isSet = true)
        assertEquals("debug", SettingsView.displayValue(set))

        val unset = opt("logLevel", "General", type = "enum", default = "info", isSet = false)
        assertTrue(SettingsView.displayValue(unset).contains("info"))
        assertTrue(SettingsView.displayValue(unset).contains("default"))
    }

    @Test
    fun `displayValue yields a string for an unrecognized type (never dropped or thrown)`() {
        val weird = opt("some.future.setting", "General", type = "duration", default = 5, currentValue = 42, isSet = true)
        assertEquals("42", SettingsView.displayValue(weird))
    }

    @Test
    fun `displayValue renders an integral number without the Gson Double artifact (real socket shape)`() {
        // The real UnixSocketDaemonRpc parses every JSON number as a Double, so an
        // integral setting like 40 arrives as 40.0 and a large one like 120000 as
        // 120000.0 — a naive toString() would show "40.0" / "1.2E5" on the page.
        val setNum = opt("maxToolTurns", "Models", type = "number", default = 40.0, currentValue = 40.0, isSet = true)
        assertEquals("40", SettingsView.displayValue(setNum))

        val unsetNum = opt("freshnessTimeoutMs", "Workflow", type = "number", default = 120000.0, isSet = false)
        assertEquals("120000 (default)", SettingsView.displayValue(unsetNum))

        val large = opt("big", "Models", type = "number", default = 10000000.0, currentValue = 10000000.0, isSet = true)
        assertEquals("10000000", SettingsView.displayValue(large))
    }

    @Test
    fun `displayValue keeps a genuinely fractional number as-is`() {
        val frac = opt("ratio", "Models", type = "number", default = 1.5, currentValue = 2.75, isSet = true)
        assertEquals("2.75", SettingsView.displayValue(frac))
    }

    @Test
    fun `displayValue treats a set-but-null currentValue as unset (falls back to default)`() {
        val nulled = opt("weird", "General", default = "info", currentValue = null, isSet = true)
        assertEquals("info (default)", SettingsView.displayValue(nulled))
    }
}
