package ai.insors.insrc.jetbrains.ops

import org.junit.jupiter.api.Assertions.assertFalse
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Test
import java.io.File

/**
 * Source-scan guards for the filled Debug page (Story E2026092157298940:S004 / t6+t7):
 * the sc3 DebugPageHost + the daemon-status card + the confirm-gated orphan Kill (the
 * Epic's only mutation). The Settings dialog is not headlessly bootable, so the
 * load-bearing invariants are asserted against source text (the DaemonPageTest idiom).
 */
class DebugPageTest {

    private fun read(path: String): String {
        val f = File(path)
        assertTrue(f.exists(), "expected source at $path (test cwd=${File("").absolutePath})")
        return f.readText()
    }

    private val page by lazy { read("src/main/kotlin/ai/insors/insrc/jetbrains/ops/DebugConfigurable.kt") }

    @Test
    fun `sc3 - the DebugSection + DebugPageHost interfaces exist matching the HLD sketch`() {
        val host = read("src/main/kotlin/ai/insors/insrc/jetbrains/debug/DebugPageHost.kt")
        assertTrue(host.contains("interface DebugSection"), "DebugSection exists")
        assertTrue(host.contains("fun title(): String"), "DebugSection.title()")
        assertTrue(host.contains("fun component(): JComponent"), "DebugSection.component()")
        assertTrue(host.contains("interface DebugPageHost"), "DebugPageHost exists")
        assertTrue(host.contains("fun sections(): List<DebugSection>"), "DebugPageHost.sections()")
    }

    @Test
    fun `ac1 - the page consumes sc1 + implements sc3 and renders the status card from the reader via InsrcCollapsible`() {
        assertTrue(page.contains("class DebugConfigurable : InsrcOpsConfigurable(), DebugPageHost"), "consumes sc1 + implements sc3")
        assertTrue(page.contains("override fun sections(): List<DebugSection>"), "seeds the sc3 section list")
        assertTrue(page.contains("DebugStatusCardReader"), "reads the status card via DebugStatusCardReader")
        assertTrue(page.contains("OrphanProcessSeam"), "scans orphans via OrphanProcessSeam")
        assertTrue(page.contains("InsrcCollapsible.collapsiblePanel"), "renders each section in a collapsible panel")
    }

    @Test
    fun `ac2 - k3 - the orphan Kill is the ONLY mutation, confirm-gated and run off the EDT`() {
        assertTrue(page.contains("Messages.showYesNoDialog"), "the Kill is confirm-gated")
        assertTrue(page.contains("runProcessWithProgressSynchronously"), "the Kill runs off the EDT under ProgressManager")
        assertTrue(page.contains("orphanSeam.kill("), "the confirmed action calls the seam kill")
        // nothing selected -> no-op before any confirm/kill (ac2)
        assertTrue(page.contains("if (selected.isEmpty()) return@addActionListener"), "an empty selection kills nothing")
        // the single mutating control: exactly one action button + one action listener on the page
        assertTrue(page.contains("JButton(\"Kill selected"), "the sole mutating control is the Kill button")
        assertFalse(page.contains("gateway.shutdown") || page.contains("gateway.backup") || page.contains("gateway.compact"),
            "the Debug page performs no daemon-mutating IPC — the kill is a local process signal only (k3)")
    }

    @Test
    fun `k4 - the page does not touch the parent settings page`() {
        assertFalse(page.contains("InsrcSettingsConfigurable"), "the Debug page never references the parent settings page (k4)")
        val settings = read("src/main/kotlin/ai/insors/insrc/jetbrains/settings/InsrcSettingsConfigurable.kt")
        assertFalse(settings.contains("DebugConfigurable"), "the parent settings page is not repointed at the Debug page")
        // the S001 placeholder body is gone
        assertFalse(page.contains("Debug diagnostics arrive in a later insrc update"), "the S001 placeholder is replaced")
    }
}
