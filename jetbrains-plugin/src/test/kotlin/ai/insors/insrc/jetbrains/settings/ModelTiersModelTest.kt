package ai.insors.insrc.jetbrains.settings

import ai.insors.insrc.jetbrains.daemon.ConfigOptionDto
import ai.insors.insrc.jetbrains.daemon.ModelListResult
import ai.insors.insrc.jetbrains.daemon.ModelOption
import ai.insors.insrc.jetbrains.daemon.SettingsCatalogDto
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertFalse
import org.junit.jupiter.api.Assertions.assertInstanceOf
import org.junit.jupiter.api.Assertions.assertNull
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Test

/**
 * S004 tests for the pure headless ModelTiersModel (Epic ba132c185fe45860): the
 * whole k7 state machine over injected daemon lists, no Swing. Mirrors
 * PerRoleOverridesModelTest.
 */
class ModelTiersModelTest {

    // --- catalog builder ------------------------------------------------------

    /** A tier's runner/model options; pass a non-null override to mark it isSet. */
    private fun tierOptions(
        tier: String,
        runnerDefault: String,
        modelDefault: String,
        runnerOverride: String? = null,
        modelOverride: String? = null,
    ): List<ConfigOptionDto> = listOf(
        ConfigOptionDto(
            path = "models.tiers.$tier.runner", type = "enum", default = runnerDefault, desc = "runner",
            enumValues = ModelTiersModel.PROVIDERS, group = "Models — tiers",
            currentValue = runnerOverride, isSet = runnerOverride != null,
        ),
        ConfigOptionDto(
            path = "models.tiers.$tier.model", type = "string", default = modelDefault, desc = "model",
            enumValues = null, group = "Models — tiers",
            currentValue = modelOverride, isSet = modelOverride != null,
        ),
    )

    private fun catalog(vararg options: ConfigOptionDto): SettingsCatalogDto =
        SettingsCatalogDto(groups = listOf("Models — tiers"), options = options.toList(), roles = emptyList(), tierNames = emptyList())

    private fun loaded(vararg ids: String): ModelListResult =
        ModelListResult.Loaded(available = true, models = ids.map { ModelOption(it, null) })

    private val opus = ModelOption("claude-opus-5-5", "Claude Opus 5.5")
    private val sonnet = ModelOption("claude-sonnet-5", null)

    // --- dropdown (ac1) -------------------------------------------------------

    @Test
    fun `a Loaded list gives exactly the daemon ids (dropdown-only) and pre-selects the saved model`() {
        val cat = catalog(*tierOptions("core", "cli-claude", "", modelOverride = "claude-sonnet-5").toTypedArray())
        val m = ModelTiersModel(cat, mapOf("cli-claude" to ModelListResult.Loaded(true, listOf(opus, sonnet))))
        val options = m.modelOptions("core")
        assertEquals(listOf("claude-opus-5-5", "claude-sonnet-5"), options.filterIsInstance<ModelChoice.Model>().map { it.id })
        val sel = assertInstanceOf(ModelChoice.Model::class.java, m.selectedModelChoice("core"))
        assertEquals("claude-sonnet-5", sel.id)
        assertTrue(sel.current)
        assertEquals("Claude Opus 5.5", options.filterIsInstance<ModelChoice.Model>().first().label) // displayName used
    }

    // --- empty / unavailable (ac2) --------------------------------------------

    @Test
    fun `Unavailable gives a single NoModels sentinel and no write`() {
        val cat = catalog(*tierOptions("core", "cli-claude", "", modelOverride = "x").toTypedArray())
        val m = ModelTiersModel(cat, mapOf("cli-claude" to ModelListResult.Unavailable("down")))
        assertEquals(listOf(ModelChoice.NoModels), m.modelOptions("core"))
        assertFalse(m.isModified())
        assertTrue(m.collectWrites().isEmpty())
    }

    @Test
    fun `available false and available true empty both present as NoModels with no write`() {
        val cat = catalog(*tierOptions("core", "cli-claude", "", modelOverride = "x").toTypedArray())
        for (result in listOf(ModelListResult.Loaded(false, emptyList()), ModelListResult.Loaded(true, emptyList()))) {
            val m = ModelTiersModel(cat, mapOf("cli-claude" to result))
            assertEquals(listOf(ModelChoice.NoModels), m.modelOptions("core"))
            assertTrue(m.collectWrites().isEmpty())
        }
    }

    // --- current-not-in-catalog (ac3) -----------------------------------------

    @Test
    fun `a saved OVERRIDE absent from a Loaded list shows a disabled current-not-in-catalog entry`() {
        val cat = catalog(*tierOptions("core", "cli-claude", "", modelOverride = "ghost-9").toTypedArray())
        val m = ModelTiersModel(cat, mapOf("cli-claude" to loaded("claude-opus-5-5")))
        val marker = assertInstanceOf(ModelChoice.CurrentNotInCatalog::class.java, m.modelOptions("core").first())
        assertEquals("ghost-9", marker.id)
        // picking a real model replaces it + emits the new id
        m.selectModel("core", "claude-opus-5-5")
        assertTrue(m.modelOptions("core").none { it is ModelChoice.CurrentNotInCatalog })
        assertEquals(
            listOf(listOf("models", "tiers", "core", "model")),
            m.collectWrites().map { it.segments },
        )
        assertEquals(WriteOp.Set("claude-opus-5-5"), m.collectWrites().first().op)
    }

    @Test
    fun `a saved built-in DEFAULT absent from the list is NOT flagged current-not-in-catalog`() {
        // mid.model default 'sonnet' (NOT an override) — the daemon returns full ids.
        val cat = catalog(*tierOptions("mid", "cli-claude", "sonnet").toTypedArray())
        val m = ModelTiersModel(cat, mapOf("cli-claude" to loaded("claude-opus-5-5", "claude-sonnet-5")))
        assertTrue(m.modelOptions("mid").none { it is ModelChoice.CurrentNotInCatalog })
        // a default that isn't in the list shows the neutral prompt, NOT a falsely
        // pre-selected first model (and no accidental write).
        assertEquals(ModelChoice.SelectPrompt, m.selectedModelChoice("mid"))
        assertFalse(m.isModified())
        assertTrue(m.collectWrites().isEmpty())
    }

    @Test
    fun `a saved model present in the list is marked current, not duplicated, and re-pick is a no-op`() {
        val cat = catalog(*tierOptions("core", "cli-claude", "", modelOverride = "claude-sonnet-5").toTypedArray())
        val m = ModelTiersModel(cat, mapOf("cli-claude" to loaded("claude-opus-5-5", "claude-sonnet-5")))
        assertTrue(m.modelOptions("core").none { it is ModelChoice.CurrentNotInCatalog })
        m.selectModel("core", "claude-sonnet-5") // re-pick the saved one
        assertFalse(m.isModified())
        assertTrue(m.collectWrites().isEmpty())
    }

    // --- provider switch (ac4) ------------------------------------------------

    @Test
    fun `switching the provider clears the model, re-derives the list, and writes runner then model`() {
        val cat = catalog(*tierOptions("core", "cli-claude", "", modelOverride = "claude-sonnet-5").toTypedArray())
        val m = ModelTiersModel(
            cat,
            mapOf(
                "cli-claude" to loaded("claude-opus-5-5", "claude-sonnet-5"),
                "ollama" to loaded("llama3"),
            ),
        )
        m.selectRunner("core", "ollama")
        // the cleared saved model must not carry into the new provider as a marker;
        // the combo shows a '— select a model —' prompt, not a falsely pre-selected model.
        assertTrue(m.modelOptions("core").none { it is ModelChoice.CurrentNotInCatalog })
        assertEquals(ModelChoice.SelectPrompt, m.modelOptions("core").first())
        assertEquals(ModelChoice.SelectPrompt, m.selectedModelChoice("core"))
        assertEquals(listOf("llama3"), m.modelOptions("core").filterIsInstance<ModelChoice.Model>().map { it.id })
        // before a model re-pick: the runner is Set AND the stale override is Cleared
        // (k7 clears the model field — never leaves a cloud model under the ollama runner).
        assertEquals(
            listOf(listOf("models", "tiers", "core", "runner"), listOf("models", "tiers", "core", "model")),
            m.collectWrites().map { it.segments },
        )
        assertEquals(WriteOp.Set("ollama"), m.collectWrites()[0].op)
        assertEquals(WriteOp.Clear, m.collectWrites()[1].op)
        // re-picking a model from the new provider replaces the Clear with a Set
        m.selectModel("core", "llama3")
        assertEquals(WriteOp.Set("ollama"), m.collectWrites()[0].op)
        assertEquals(WriteOp.Set("llama3"), m.collectWrites()[1].op)
    }

    @Test
    fun `switching provider when the saved model was a DEFAULT (no override) clears nothing on disk`() {
        // cheap.model default 'qwen3.6:27b' is NOT an override -> a switch only writes the runner.
        val cat = catalog(*tierOptions("cheap", "ollama", "qwen3.6:27b").toTypedArray())
        val m = ModelTiersModel(cat, mapOf("ollama" to loaded("qwen3.6:27b"), "cli-claude" to loaded("claude-opus-5-5")))
        m.selectRunner("cheap", "cli-claude")
        assertEquals(listOf(listOf("models", "tiers", "cheap", "runner")), m.collectWrites().map { it.segments })
    }

    @Test
    fun `a defaulted tier runner resolves the catalog default so the provider list is keyed correctly`() {
        // cheap.runner default 'ollama', unset -> the model list is keyed by ollama.
        val cat = catalog(*tierOptions("cheap", "ollama", "qwen3.6:27b").toTypedArray())
        val m = ModelTiersModel(cat, mapOf("ollama" to loaded("qwen3.6:27b", "llama3")))
        assertEquals("ollama", m.currentRunner("cheap"))
        assertEquals(listOf("qwen3.6:27b", "llama3"), m.modelOptions("cheap").filterIsInstance<ModelChoice.Model>().map { it.id })
    }

    // --- isModified / reset ---------------------------------------------------

    @Test
    fun `isModified is false with no edits, true after a select, false again after revert`() {
        val cat = catalog(*tierOptions("core", "cli-claude", "", modelOverride = "claude-sonnet-5").toTypedArray())
        val m = ModelTiersModel(cat, mapOf("cli-claude" to loaded("claude-opus-5-5", "claude-sonnet-5")))
        assertFalse(m.isModified())
        m.selectModel("core", "claude-opus-5-5")
        assertTrue(m.isModified())
        m.revert()
        assertFalse(m.isModified())
        assertTrue(m.collectWrites().isEmpty())
    }

    @Test
    fun `onSaved advances the baseline so a re-applied model is no longer dirty`() {
        val cat = catalog(*tierOptions("core", "cli-claude", "").toTypedArray())
        val m = ModelTiersModel(cat, mapOf("cli-claude" to loaded("claude-opus-5-5")))
        m.selectModel("core", "claude-opus-5-5")
        assertTrue(m.isModified())
        m.onSaved("core")
        assertFalse(m.isModified())
        assertTrue(m.collectWrites().isEmpty())
    }

    @Test
    fun `an unknown tier is rejected (total over the three tiers)`() {
        val cat = catalog(*tierOptions("core", "cli-claude", "").toTypedArray())
        val m = ModelTiersModel(cat, emptyMap())
        assertNull(runCatching { m.currentRunner("bogus") }.getOrNull())
    }
}
