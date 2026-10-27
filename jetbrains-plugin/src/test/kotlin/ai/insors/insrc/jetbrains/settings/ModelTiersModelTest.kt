package ai.insors.insrc.jetbrains.settings

import ai.insors.insrc.jetbrains.daemon.ConfigOptionDto
import ai.insors.insrc.jetbrains.daemon.DefinedFamilyDto
import ai.insors.insrc.jetbrains.daemon.DefinedModelDto
import ai.insors.insrc.jetbrains.daemon.ModelDefinitionsDto
import ai.insors.insrc.jetbrains.daemon.SettingsCatalogDto
import ai.insors.insrc.jetbrains.daemon.TierDefaultDto
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertFalse
import org.junit.jupiter.api.Assertions.assertNotNull
import org.junit.jupiter.api.Assertions.assertNull
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Test
import org.junit.jupiter.api.assertThrows

/**
 * Tests for the pure headless ModelTiersModel (Epic ce99b72065d03b1b, Story s7): every
 * choice comes from a fake model-definitions answer whose names match nothing the daemon
 * ships, and the current tier is the one the daemon resolves (tierSetting + parseTiering
 * in src/config/analyze.ts, then the registry's dropped effort).
 */
class ModelTiersModelTest {

    private fun model(id: String, efforts: List<String> = emptyList(), aliases: List<String> = emptyList(), installed: Boolean? = null, source: String = "shipped") =
        DefinedModelDto(id = id, aliases = aliases, displayName = null, efforts = efforts, source = source, installed = installed)

    /** FakeX (the default family), FakeC, and a local family with a tool-loop model and no tierDefaults. */
    private val defs = ModelDefinitionsDto(
        defaultFamily = "cli-codex",
        families = listOf(
            DefinedFamilyDto(
                id = "cli-codex", cliKind = "codex", displayName = "FakeX",
                tierDefaults = mapOf("core" to TierDefaultDto("x-a", "lo"), "mid" to TierDefaultDto("x-b", null), "cheap" to TierDefaultDto("x-b", "lo")),
                toolLoopModel = null,
                models = listOf(model("x-a", listOf("lo", "turbo"), aliases = listOf("xa")), model("x-b", listOf("lo"), source = "user-approved")),
            ),
            DefinedFamilyDto(
                id = "cli-claude", cliKind = "claude", displayName = "FakeC",
                tierDefaults = mapOf("core" to TierDefaultDto("c-big", "deep"), "mid" to TierDefaultDto("c-big", null), "cheap" to TierDefaultDto("c-big", null)),
                toolLoopModel = null,
                models = listOf(model("c-big", listOf("deep"), aliases = listOf("cb"))),
            ),
            DefinedFamilyDto(
                id = "ollama", cliKind = null, displayName = "FakeLocal", tierDefaults = emptyMap(), toolLoopModel = "loc:1",
                models = listOf(model("loc:1", installed = true), model("loc:2", installed = false)),
            ),
        ),
    )

    /** A catalog whose only set leaves are [leaves] ("tier.field" -> value). */
    private fun catalog(vararg leaves: Pair<String, String>): SettingsCatalogDto {
        val set = leaves.toMap()
        val options = ModelTiersModel.TIERS.flatMap { tier ->
            listOf("runner", "model", "effort").map { field ->
                val v = set["$tier.$field"]
                ConfigOptionDto(
                    path = "models.tiers.$tier.$field", type = "string", default = "", desc = field,
                    enumValues = null, group = "Models — tiers", currentValue = v, isSet = v != null,
                )
            }
        }
        return SettingsCatalogDto(groups = listOf("Models — tiers"), options = options, roles = emptyList(), tierNames = ModelTiersModel.TIERS)
    }

    private fun current(m: ModelTiersModel, tier: String) = Triple(m.currentRunner(tier), m.currentModel(tier), m.currentEffort(tier))

    @Test
    fun `choices exactly from a fake definitions answer, current-tier parity with the daemon's resolution, an unaccepted stored effort shown as none and not dirty`() {
        // Choices: exactly the answer's families, models (alias / approved / not installed labels) and efforts.
        val m = ModelTiersModel(catalog(), defs)
        assertEquals(listOf("cli-codex", "cli-claude", "ollama"), m.runnerOptions())
        assertEquals("FakeX (cli-codex)", m.runnerLabel("cli-codex"))
        val codexModels = m.modelOptions("core").filterIsInstance<ModelChoice.Model>()
        assertEquals(listOf("x-a", "x-b"), codexModels.map { it.id })
        assertEquals("x-a · xa", codexModels[0].label)
        assertEquals("x-b — approved", codexModels[1].label)
        assertEquals(listOf("", "lo", "turbo"), m.effortOptions("core"))
        m.selectRunner("cheap", "ollama")
        m.selectModel("cheap", "loc:2")
        assertEquals(listOf("loc:1", "loc:2 — not installed"), m.modelOptions("cheap").filterIsInstance<ModelChoice.Model>().map { it.label })
        assertEquals(listOf(""), ModelTiersModel(catalog("cheap.runner" to "ollama", "cheap.model" to "loc:1"), defs).effortOptions("cheap"))
        assertEquals(listOf(""), m.effortOptions("cheap"), "after switching to a model with no efforts, only the CLI default")
        assertEquals("", m.currentEffort("cheap"))

        // Unset tier: the default family's tier default and its effort.
        assertEquals(Triple("cli-codex", "x-a", "lo"), current(m, "core"))
        assertEquals(Triple("cli-codex", "x-b", ""), current(ModelTiersModel(catalog(), defs), "mid"))
        assertNull(ModelTiersModel(catalog(), defs).note("core"))

        // Runner + model, no effort: that runner and model with NO effort (not the default's).
        val noEffort = ModelTiersModel(catalog("core.runner" to "cli-claude", "core.model" to "c-big"), defs)
        assertEquals(Triple("cli-claude", "c-big", ""), current(noEffort, "core"))
        assertFalse(noEffort.isModified())

        // Runner + model + effort.
        assertEquals(Triple("cli-claude", "c-big", "deep"), current(ModelTiersModel(catalog("core.runner" to "cli-claude", "core.model" to "c-big", "core.effort" to "deep"), defs), "core"))

        // An explicit '' effort wins over the default's.
        assertEquals(Triple("cli-codex", "x-a", ""), current(ModelTiersModel(catalog("core.effort" to ""), defs), "core"))

        // An effort leaf alone applies to the default tier.
        assertEquals(Triple("cli-codex", "x-a", "turbo"), current(ModelTiersModel(catalog("core.effort" to "turbo"), defs), "core"))

        // A runner alone is ignored by the daemon: the default family's default, with a note.
        val runnerOnly = ModelTiersModel(catalog("core.runner" to "cli-claude"), defs)
        assertEquals(Triple("cli-codex", "x-a", "lo"), current(runnerOnly, "core"))
        assertTrue(runnerOnly.note("core")!!.contains("incomplete"), runnerOnly.note("core"))
        assertFalse(runnerOnly.isModified())

        // Model '' leaves the tier unset; an unknown runner is ignored too.
        assertEquals(Triple("cli-codex", "x-a", "lo"), current(ModelTiersModel(catalog("core.runner" to "cli-claude", "core.model" to ""), defs), "core"))
        assertEquals(Triple("cli-codex", "x-a", "lo"), current(ModelTiersModel(catalog("core.runner" to "cli-nope", "core.model" to "c-big"), defs), "core"))

        // An alias is shown as its canonical id.
        assertEquals(Triple("cli-codex", "x-a", ""), current(ModelTiersModel(catalog("core.runner" to "cli-codex", "core.model" to "xa"), defs), "core"))

        // A stored effort the model does not accept: shown as '' with the note, not dirty — CLI model ...
        val dropped = ModelTiersModel(catalog("core.runner" to "cli-codex", "core.model" to "x-b", "core.effort" to "turbo"), defs)
        assertEquals(Triple("cli-codex", "x-b", ""), current(dropped, "core"))
        assertEquals("stored effort 'turbo' is not accepted by x-b — the daemon drops it", dropped.note("core"))
        assertFalse(dropped.isModified())
        assertTrue(dropped.collectWrites().isEmpty())
        // ... and a local model.
        val droppedLocal = ModelTiersModel(catalog("cheap.runner" to "ollama", "cheap.model" to "loc:1", "cheap.effort" to "lo"), defs)
        assertEquals(Triple("ollama", "loc:1", ""), current(droppedLocal, "cheap"))
        assertNotNull(droppedLocal.note("cheap"))
        assertFalse(droppedLocal.isModified())

        // A configured model the definitions do not list: shown as current, marked not listed, with a note.
        val stale = ModelTiersModel(catalog("mid.runner" to "cli-claude", "mid.model" to "c-old"), defs)
        assertEquals(Triple("cli-claude", "c-old", ""), current(stale, "mid"))
        assertEquals(ModelChoice.CurrentNotInCatalog("c-old"), stale.selectedModelChoice("mid"))
        val staleEffort = ModelTiersModel(catalog("mid.runner" to "cli-claude", "mid.model" to "c-old", "mid.effort" to "invented"), defs)
        assertEquals(listOf(""), staleEffort.effortOptions("mid"), "no effort outside the definitions is offered")
        assertTrue(stale.note("mid")!!.contains("not listed"))
        stale.selectModel("mid", "c-big")
        assertTrue(stale.modelOptions("mid").none { it is ModelChoice.CurrentNotInCatalog }, "not offered again once changed away")

        // A family with no models is the NoModels sentinel; an unknown tier is refused.
        val empty = defs.copy(families = defs.families + DefinedFamilyDto("cli-empty", "codex", "Empty", emptyMap(), null, emptyList()))
        val e = ModelTiersModel(catalog(), empty)
        e.selectRunner("core", "cli-empty")
        assertEquals(listOf(ModelChoice.NoModels), e.modelOptions("core"))
        assertThrows<IllegalArgumentException> { e.currentRunner("nope") }
    }

    @Test
    fun `updateDefinitions re-resolves clean tiers and keeps a dirty tier's edit`() {
        val m = ModelTiersModel(catalog("mid.runner" to "cli-codex", "mid.model" to "x-new"), defs)
        assertEquals(ModelChoice.CurrentNotInCatalog("x-new"), m.selectedModelChoice("mid"))
        m.selectEffort("core", "turbo")
        val approved = defs.copy(families = defs.families.map { f ->
            if (f.id == "cli-codex") f.copy(models = f.models + model("x-new", listOf("lo"), source = "user-approved")) else f
        })
        m.updateDefinitions(approved)
        assertEquals("x-new", (m.selectedModelChoice("mid") as ModelChoice.Model).id, "the approved model is now listed")
        assertNull(m.note("mid"))
        assertEquals("turbo", m.currentEffort("core"), "a dirty tier keeps its edit")
        m.revert()
        assertEquals("lo", m.currentEffort("core"))
        assertFalse(m.isModified())
    }
}
