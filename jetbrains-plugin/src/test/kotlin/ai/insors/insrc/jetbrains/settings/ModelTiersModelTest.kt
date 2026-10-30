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
        val e = ModelTiersModel(catalog("core.runner" to "cli-empty", "core.model" to "z-1"), empty)
        assertEquals(listOf(ModelChoice.NoModels), e.modelOptions("core"))
        assertFalse("cli-empty" in e.runnerOptions(), "a family with no models is not offered")
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

    @Test
    fun `runner switch defaults incl a local family without tierDefaults, effort cleared on model change, whole-tier writes, not-listed model refused`() {
        // A switch to a CLI family takes its tier default with the default's effort.
        val m = ModelTiersModel(catalog(), defs)
        m.selectRunner("core", "cli-claude")
        assertEquals(Triple("cli-claude", "c-big", "deep"), current(m, "core"))
        // A switch to the local family (no tierDefaults) takes its tool-loop model and no effort.
        m.selectRunner("mid", "ollama")
        assertEquals(Triple("ollama", "loc:1", ""), current(m, "mid"))
        // A family the definitions do not serve is ignored.
        m.selectRunner("cheap", "cli-nope")
        assertEquals(Triple("cli-codex", "x-b", "lo"), current(m, "cheap"))

        // A model change to one that does not accept the current effort clears it to ''.
        val e = ModelTiersModel(catalog("core.effort" to "turbo"), defs)
        assertEquals(Triple("cli-codex", "x-a", "turbo"), current(e, "core"))
        e.selectModel("core", "x-b")
        assertEquals("", e.currentEffort("core"))
        // ... and keeps one it does accept.
        val keep = ModelTiersModel(catalog(), defs)
        keep.selectModel("core", "x-b")
        assertEquals("lo", keep.currentEffort("core"))

        // One whole-tier {runner, model, effort} write per dirty tier, at ['models','tiers',tier].
        assertEquals(
            listOf(
                PendingWrite(listOf("models", "tiers", "core"), WriteOp.Set(mapOf("runner" to "cli-claude", "model" to "c-big", "effort" to "deep"))),
                PendingWrite(listOf("models", "tiers", "mid"), WriteOp.Set(mapOf("runner" to "ollama", "model" to "loc:1", "effort" to ""))),
            ),
            m.collectWrites(),
        )
        assertTrue(ModelTiersModel(catalog(), defs).collectWrites().isEmpty(), "nothing dirty, nothing written")
        m.onSaved("core")
        m.onSaved("mid")
        assertFalse(m.isModified())
        assertTrue(m.collectWrites().isEmpty())

        // An effort-only edit of a tier still on a model the definitions do not list is refused.
        val stale = ModelTiersModel(catalog("mid.runner" to "cli-claude", "mid.model" to "c-old"), defs)
        stale.selectEffort("mid", "")
        stale.selectEffort("mid", "deep") // not offered for an unlisted model: ignored
        assertFalse(stale.isModified())
        val staleWithEffort = ModelTiersModel(catalog("mid.runner" to "cli-claude", "mid.model" to "c-old", "mid.effort" to "deep"), defs)
        staleWithEffort.selectEffort("mid", "")
        assertTrue(staleWithEffort.isModified())
        assertTrue(staleWithEffort.collectWrites().isEmpty(), "the unlisted model is never written")
        assertEquals(mapOf("mid" to "choose a listed model for the mid tier first (c-old is not listed)"), staleWithEffort.unsavable())
        // Picking a listed model makes it savable.
        staleWithEffort.selectModel("mid", "c-big")
        assertTrue(staleWithEffort.unsavable().isEmpty())
        assertEquals(listOf(PendingWrite(listOf("models", "tiers", "mid"), WriteOp.Set(mapOf("runner" to "cli-claude", "model" to "c-big", "effort" to "")))), staleWithEffort.collectWrites())
    }

    // --- Epic b220bb61, Story s5: a family that runs its CLI on Ollama (host), its models cloud or local ---

    private fun hostedModel(id: String, hosting: String, efforts: List<String> = emptyList(), aliases: List<String> = emptyList()) =
        DefinedModelDto(id = id, aliases = aliases, displayName = null, efforts = efforts, source = "shipped", installed = null, hosting = hosting)

    /** defs plus FakeH: host 'ollama', no tierDefaults, a cloud model with efforts and an alias, a local one without. */
    private val hostedDefs = defs.copy(families = defs.families + DefinedFamilyDto(
        id = "ollama-claude", cliKind = "claude", displayName = "FakeH", tierDefaults = emptyMap(), toolLoopModel = null,
        models = listOf(hostedModel("hc:cloud", "cloud", listOf("low", "max"), aliases = listOf("hc")), hostedModel("hl:7b", "local")),
        host = "ollama",
    ))

    @Test
    fun `offers the host family, labels its models cloud or local, offers efforts only where the model has them and writes the whole tier`() {
        val m = ModelTiersModel(catalog(), hostedDefs)
        assertEquals(listOf("cli-codex", "cli-claude", "ollama", "ollama-claude"), m.runnerOptions())
        m.selectRunner("core", "ollama-claude")
        assertEquals(Triple("ollama-claude", "hc:cloud", ""), current(m, "core"), "the first declared model, CLI-default effort")
        assertEquals(
            listOf("hc:cloud · hc — cloud", "hl:7b — local"),
            m.modelOptions("core").filterIsInstance<ModelChoice.Model>().map { it.label },
            "only its declared models, each marked",
        )
        assertEquals(listOf("", "low", "max"), m.effortOptions("core"))
        m.selectEffort("core", "max")
        assertEquals(listOf(PendingWrite(listOf("models", "tiers", "core"), WriteOp.Set(mapOf("runner" to "ollama-claude", "model" to "hc:cloud", "effort" to "max")))), m.collectWrites())
        m.selectModel("core", "hl:7b")
        assertEquals(listOf(""), m.effortOptions("core"), "a model with no efforts offers only the CLI default")
        assertEquals(listOf(PendingWrite(listOf("models", "tiers", "core"), WriteOp.Set(mapOf("runner" to "ollama-claude", "model" to "hl:7b", "effort" to "")))), m.collectWrites())

        // Vendor and plain Ollama labels carry no cloud/local mark.
        m.selectRunner("mid", "cli-codex")
        assertEquals(listOf("x-a · xa", "x-b — approved"), m.modelOptions("mid").filterIsInstance<ModelChoice.Model>().map { it.label })
        m.selectRunner("cheap", "ollama")
        assertEquals(listOf("loc:1", "loc:2 — not installed"), m.modelOptions("cheap").filterIsInstance<ModelChoice.Model>().map { it.label })

        // A host model configured by alias: its canonical id, labelled with its hosting.
        val byAlias = ModelTiersModel(catalog("core.runner" to "ollama-claude", "core.model" to "hc"), hostedDefs)
        assertEquals(Triple("ollama-claude", "hc:cloud", ""), current(byAlias, "core"))
        assertEquals(ModelChoice.Model("hc:cloud", "hc:cloud · hc — cloud", current = true), byAlias.selectedModelChoice("core"))
        assertNull(byAlias.note("core"))
    }

    @Test
    fun `notes an undeclared host-family model as not supported, the tier will not run, while a vendor or host-less family keeps today's note`() {
        val gone = ModelTiersModel(catalog("core.runner" to "ollama-claude", "core.model" to "gone:cloud"), hostedDefs)
        assertEquals(Triple("ollama-claude", "gone:cloud", ""), current(gone, "core"))
        assertEquals("gone:cloud is not supported by FakeH — the tier will not run", gone.note("core"))
        assertEquals(ModelChoice.CurrentNotInCatalog("gone:cloud", hosted = true), gone.selectedModelChoice("core"))
        assertEquals("(current, not supported): gone:cloud", gone.selectedModelChoice("core").label)
        gone.selectEffort("core", "max") // not accepted: only the CLI default is offered for an undeclared model
        assertEquals(listOf(""), gone.effortOptions("core"))

        // An edit still on the undeclared model is refused; nothing undeclared is written.
        val dirty = ModelTiersModel(catalog("core.runner" to "ollama-claude", "core.model" to "gone:cloud", "core.effort" to "max"), hostedDefs)
        dirty.selectEffort("core", "")
        assertEquals(mapOf("core" to "choose a listed model for the core tier first (gone:cloud is not listed)"), dirty.unsavable())
        assertEquals(emptyList<PendingWrite>(), dirty.collectWrites())

        // A vendor family keeps today's note and marker.
        val vendor = ModelTiersModel(catalog("core.runner" to "cli-claude", "core.model" to "c-old"), hostedDefs)
        assertEquals("c-old is not listed for FakeC — the daemon runs its default for the tier instead", vendor.note("core"))
        assertEquals("(current, not listed): c-old", vendor.selectedModelChoice("core").label)

        // An older daemon answers without host: the same family behaves as a vendor family.
        val hostless = hostedDefs.copy(families = hostedDefs.families.map { it.copy(host = null, models = it.models.map { md -> md.copy(hosting = null) }) })
        val old = ModelTiersModel(catalog("core.runner" to "ollama-claude", "core.model" to "gone:cloud"), hostless)
        assertEquals("gone:cloud is not listed for FakeH — the daemon runs its default for the tier instead", old.note("core"))
        assertEquals(ModelChoice.CurrentNotInCatalog("gone:cloud"), old.selectedModelChoice("core"))
        old.selectModel("core", "hc:cloud")
        assertEquals(listOf("hc:cloud · hc", "hl:7b"), old.modelOptions("core").filterIsInstance<ModelChoice.Model>().map { it.label }, "no marks without hosting")
    }

    @Test
    fun `resolves a tier saved on the host family to its runner, model and effort on reopen`() {
        // Save on the host family, then reopen over a catalog holding the written tier.
        val edit = ModelTiersModel(catalog(), hostedDefs)
        edit.selectRunner("mid", "ollama-claude")
        edit.selectEffort("mid", "low")
        val written = (edit.collectWrites().single().op as WriteOp.Set).value as Map<*, *>
        val reopened = ModelTiersModel(
            catalog("mid.runner" to written["runner"] as String, "mid.model" to written["model"] as String, "mid.effort" to written["effort"] as String),
            hostedDefs,
        )
        assertEquals(Triple("ollama-claude", "hc:cloud", "low"), current(reopened, "mid"))
        assertNull(reopened.note("mid"))
        assertFalse(reopened.isModified())
        assertEquals(ModelChoice.Model("hc:cloud", "hc:cloud · hc — cloud", current = true), reopened.selectedModelChoice("mid"))

        // An effort the declared model does not take is shown as the CLI default the daemon uses, with a note.
        val dropped = ModelTiersModel(catalog("mid.runner" to "ollama-claude", "mid.model" to "hl:7b", "mid.effort" to "max"), hostedDefs)
        assertEquals(Triple("ollama-claude", "hl:7b", ""), current(dropped, "mid"))
        assertEquals("stored effort 'max' is not accepted by hl:7b — the daemon drops it", dropped.note("mid"))
        assertFalse(dropped.isModified())
    }
}
