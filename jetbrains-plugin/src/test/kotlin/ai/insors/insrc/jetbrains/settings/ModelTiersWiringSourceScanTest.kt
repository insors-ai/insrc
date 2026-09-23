package ai.insors.insrc.jetbrains.settings

import org.junit.jupiter.api.Assertions.assertFalse
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Test
import java.io.File

/**
 * S004 source-scan guards (Epic ba132c185fe45860). The Swing section + the
 * Configurable wiring are not headlessly bootable, so — like
 * InsrcSettingsConfigurableTest — the load-bearing invariants are asserted against
 * the source text: the 3-place gateway addition, the section registered + the
 * models.tiers.* rows lifted out of the generic table, the NON-editable model combo
 * (dropdown-only, k4), the off-EDT Refresh, and no cloud/HTTP import (k1/k3).
 */
class ModelTiersWiringSourceScanTest {

    private fun read(path: String): String {
        val f = File(path)
        assertTrue(f.exists(), "expected source at $path (test cwd=${File("").absolutePath})")
        return f.readText()
    }

    @Test
    fun `the gateway declares listModels in the interface, the impl, and the service delegate`() {
        val gw = read("src/main/kotlin/ai/insors/insrc/jetbrains/daemon/DaemonGateway.kt")
        assertTrue(gw.contains("fun listModels(provider: String): ModelListResult"), "interface + impl signature")
        assertTrue(gw.contains("METHOD_LIST_MODELS = \"providers.listModels\""), "the sc2 method const")
        assertTrue(gw.contains("sealed interface ModelListResult"), "the sealed result type")
        // available:false must map to Loaded, not Unavailable (the load-bearing distinction).
        assertTrue(
            Regex("val available = r\\.data\\[\"available\"\\] == true").containsMatchIn(gw),
            "available flag read from data (Loaded even when false)",
        )
        val svc = read("src/main/kotlin/ai/insors/insrc/jetbrains/daemon/DaemonGatewayService.kt")
        assertTrue(svc.contains("override fun listModels(provider: String): ModelListResult = delegate.listModels(provider)"), "service delegate")
    }

    @Test
    fun `InsrcSettingsConfigurable registers the ModelTiersSection and excludes models_tiers from the generic table`() {
        val src = read("src/main/kotlin/ai/insors/insrc/jetbrains/settings/InsrcSettingsConfigurable.kt")
        assertTrue(src.contains("ModelTiersSection(ModelTiersModel("), "the section is registered")
        assertTrue(
            src.contains("filterNot { it.path.startsWith(\"models.tiers.\") }"),
            "models.tiers.* are excluded from the generic category table (no duplication)",
        )
        // the model-list pre-fetch runs on the createComponent off-EDT pooled thread.
        assertTrue(src.contains("executeOnPooledThread"), "off-EDT read preserved")
        assertTrue(
            Regex("ModelTiersModel\\.PROVIDERS\\.associateWith \\{ gateway\\.listModels").containsMatchIn(src),
            "the pre-fetch calls listModels per provider off the EDT",
        )
    }

    @Test
    fun `the model combo is non-editable (dropdown-only) and Refresh runs off the EDT`() {
        val section = read("src/main/kotlin/ai/insors/insrc/jetbrains/settings/ModelTiersSection.kt")
        assertTrue(section.contains("modelCombo.isEditable = false"), "the model combo is non-editable (k4)")
        assertFalse(Regex("isEditable\\s*=\\s*true").containsMatchIn(section), "no editable combo anywhere (no free-text)")
        assertTrue(section.contains("runProcessWithProgressSynchronously"), "Refresh re-queries off the EDT")
        assertTrue(section.contains("gateway.listModels"), "Refresh goes through the injected gateway")
    }

    @Test
    fun `the section and the pure model import no cloud or HTTP client (k1) and reach the daemon only via the gateway`() {
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
}
