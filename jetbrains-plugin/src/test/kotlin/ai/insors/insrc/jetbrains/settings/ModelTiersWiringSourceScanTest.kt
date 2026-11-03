package ai.insors.insrc.jetbrains.settings

import ai.insors.insrc.jetbrains.daemon.ConfigOptionDto
import ai.insors.insrc.jetbrains.daemon.DaemonFailure
import ai.insors.insrc.jetbrains.daemon.DaemonGateway
import ai.insors.insrc.jetbrains.daemon.DefinedFamilyDto
import ai.insors.insrc.jetbrains.daemon.DefinedModelDto
import ai.insors.insrc.jetbrains.daemon.ModelDefinitionsDto
import ai.insors.insrc.jetbrains.daemon.ModelDefinitionsResult
import ai.insors.insrc.jetbrains.daemon.SaveResult
import ai.insors.insrc.jetbrains.daemon.SettingsCatalogDto
import ai.insors.insrc.jetbrains.daemon.TierDefaultDto
import com.intellij.openapi.options.ConfigurationException
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertFalse
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Test
import org.junit.jupiter.api.assertThrows
import java.io.File
import java.lang.reflect.Proxy

/**
 * Wiring guards for the Model tiers section (Epic ba132c185fe45860 S004; Epic
 * ce99b72065d03b1b s7). The Swing rendering and the Configurable are not headlessly
 * bootable, so — like InsrcSettingsConfigurableTest — their invariants are asserted
 * against the source text: no runner or model list in the settings sources, the
 * definitions read on open and on Refresh, a failure shown in the section, the
 * NON-editable combos, and no cloud/HTTP import. [ModelTiersSection.apply] touches no
 * Swing, so it is driven for real over a proxy gateway.
 */
class ModelTiersWiringSourceScanTest {

    private fun read(path: String): String {
        val f = File(path)
        assertTrue(f.exists(), "expected source at $path (test cwd=${File("").absolutePath})")
        return f.readText()
    }

    private val settingsSources: List<File> =
        File("src/main/kotlin/ai/insors/insrc/jetbrains/settings").listFiles { f -> f.extension == "kt" }!!.sortedBy { it.name }

    @Test
    fun `no PROVIDERS, no listModels use, no family or model literal in settings sources, definitions read on open and Refresh`() {
        assertTrue(settingsSources.size > 5, "found the settings sources")
        // Runner (family) ids and model-name shapes the daemon ships; none may appear as a literal.
        val literal = Regex("\"(cli-claude|cli-codex|ollama|claude-[a-z0-9.-]+|gpt-[a-z0-9.-]+|opus|sonnet|haiku|qwen[a-z0-9.:-]*)\"")
        for (f in settingsSources) {
            val src = f.readText()
            assertFalse(src.contains("PROVIDERS"), "${f.name}: no runner list")
            assertFalse(src.contains("listModels"), "${f.name}: no per-provider model list")
            assertFalse(literal.containsMatchIn(src), "${f.name}: a runner or model literal: ${literal.find(src)?.value}")
        }

        val page = read("src/main/kotlin/ai/insors/insrc/jetbrains/settings/InsrcSettingsConfigurable.kt")
        assertTrue(page.contains("val definitions = gateway.modelDefinitions()"), "the definitions are read with the catalog")
        assertTrue(page.contains("executeOnPooledThread"), "off the EDT")
        assertTrue(page.contains("sections.add(ModelTiersSection(fullCatalog, definitions, gateway))"), "the section is registered, Loaded or Failed")
        assertTrue(page.contains("filterNot { it.path.startsWith(\"models.tiers.\") }"), "models.tiers.* stay out of the generic table")

        val section = read("src/main/kotlin/ai/insors/insrc/jetbrains/settings/ModelTiersSection.kt")
        assertTrue(section.contains("fresh = gateway.modelDefinitions()"), "Refresh re-reads the definitions")
        assertTrue(section.contains("runProcessWithProgressSynchronously"), "Refresh runs off the EDT")
        assertTrue(section.contains("is ModelDefinitionsResult.Failed -> status = r.failure.text"), "a failed Refresh shows its message")
        assertTrue(section.contains("(initial as? ModelDefinitionsResult.Failed)?.failure?.text"), "a failed first read shows its message")
        assertTrue(
            section.contains("if (status == null) model?.let { m -> for (tier in ModelTiersModel.TIERS) body.add(tierRow(m, tier)) }"),
            "rows only with a loaded model and no failure — a failed Refresh hides them too",
        )
        assertTrue(Regex("is ModelDefinitionsResult\\.Failed -> status = r\\.failure\\.text[\\s\\S]*underGuard\\(::rebuildBody\\)").containsMatchIn(section), "a failed Refresh rebuilds the body")
        assertTrue(section.contains("modelCombo.isEditable = false"), "the model combo is non-editable (k4)")
        assertFalse(Regex("isEditable\\s*=\\s*true").containsMatchIn(section), "no free-text combo")
    }

    @Test
    fun `the section and the pure model import no cloud or HTTP client and reach the daemon only via the gateway`() {
        for (path in listOf(
            "src/main/kotlin/ai/insors/insrc/jetbrains/settings/ModelTiersSection.kt",
            "src/main/kotlin/ai/insors/insrc/jetbrains/settings/ModelTiersModel.kt",
        )) {
            val src = read(path)
            val imports = Regex("^import\\s+([^\\n]+)$", RegexOption.MULTILINE).findAll(src).map { it.groupValues[1] }.toList()
            for (imp in imports) {
                assertFalse(Regex("okhttp|undici|java\\.net\\.http|apache\\.http|https?://").containsMatchIn(imp), "forbidden import: $imp")
            }
        }
    }

    // --- apply over a proxy gateway ---------------------------------------------

    private val defs = ModelDefinitionsDto(
        defaultFamily = "fam-x",
        families = listOf(
            DefinedFamilyDto(
                "fam-x", "codex", "FakeX",
                mapOf("core" to TierDefaultDto("x-a", null), "mid" to TierDefaultDto("x-a", null), "cheap" to TierDefaultDto("x-a", null)),
                null,
                listOf(DefinedModelDto("x-a", emptyList(), null, listOf("lo"), "shipped", null), DefinedModelDto("x-b", emptyList(), null, listOf("lo"), "shipped", null)),
            ),
        ),
    )

    private fun catalog(vararg leaves: Pair<String, String>): SettingsCatalogDto {
        val set = leaves.toMap()
        return SettingsCatalogDto(
            groups = emptyList(),
            options = ModelTiersModel.TIERS.flatMap { tier ->
                listOf("runner", "model", "effort").map { field ->
                    val v = set["$tier.$field"]
                    ConfigOptionDto("models.tiers.$tier.$field", "string", "", field, null, "Models — tiers", v, v != null)
                }
            },
            roles = emptyList(),
            tierNames = ModelTiersModel.TIERS,
        )
    }

    /** A DaemonGateway whose writeSetting answers from [answers] by tier and records the writes; anything else fails the test. */
    private fun gateway(writes: MutableList<Pair<List<String>, Any?>>, answers: Map<String, SaveResult>): DaemonGateway =
        Proxy.newProxyInstance(javaClass.classLoader, arrayOf(DaemonGateway::class.java)) { _, method, args ->
            when (method.name) {
                "writeSetting" -> {
                    @Suppress("UNCHECKED_CAST")
                    val segments = args[0] as List<String>
                    writes += segments to args[1]
                    answers[segments[2]] ?: SaveResult.Saved()
                }
                else -> throw AssertionError("unexpected gateway call: ${method.name}")
            }
        } as DaemonGateway

    @Test
    fun `apply writes whole tiers and keeps a failed tier's pending edit with the reason and detail`() {
        val writes = mutableListOf<Pair<List<String>, Any?>>()
        val section = ModelTiersSection(
            catalog("mid.runner" to "fam-x", "mid.model" to "x-old", "mid.effort" to "lo"),
            ModelDefinitionsResult.Loaded(defs),
            gateway(writes, mapOf("cheap" to SaveResult.Rejected("rejected-model", "models.tiers.cheap: model 'x-b' is rejected in fam-x"))),
        )
        // Reach the section's model through its own field (the rows are Swing).
        val field = ModelTiersSection::class.java.getDeclaredField("model").apply { isAccessible = true }
        val m = field.get(section) as ModelTiersModel
        m.selectModel("core", "x-b")
        m.selectModel("cheap", "x-b")
        m.selectEffort("mid", "") // an effort-only edit of a tier on an unlisted model
        assertTrue(section.isModified())

        val e = assertThrows<ConfigurationException> { section.apply() }
        assertEquals(
            listOf(
                listOf("models", "tiers", "core") to mapOf("runner" to "fam-x", "model" to "x-b", "effort" to ""),
                listOf("models", "tiers", "cheap") to mapOf("runner" to "fam-x", "model" to "x-b", "effort" to ""),
            ),
            writes,
            "one whole-tier write per savable tier; the unlisted tier is never written",
        )
        val text = e.localizedMessage
        assertTrue(text.contains("mid: choose a listed model for the mid tier first (x-old is not listed)"), text)
        assertTrue(text.contains("cheap: rejected-model — models.tiers.cheap: model 'x-b' is rejected in fam-x"), text)
        assertFalse(text.contains("core:"), text)
        // core saved; cheap and mid keep their pending edits.
        assertEquals("x-b", m.currentModel("cheap"))
        assertTrue(m.isModified())
        writes.clear()
        m.selectModel("cheap", "x-a")
        m.selectModel("mid", "x-a")
        section.apply()
        assertEquals(listOf("mid"), writes.map { it.first[2] }, "core was already saved; cheap is back on its saved model, so clean")
        assertFalse(section.isModified())

        // A failed definitions read: nothing to edit, nothing written.
        val failed = ModelTiersSection(catalog(), ModelDefinitionsResult.Failed(DaemonFailure.NotRunning), gateway(writes, emptyMap()))
        assertFalse(failed.isModified())
        failed.apply()
    }
}
