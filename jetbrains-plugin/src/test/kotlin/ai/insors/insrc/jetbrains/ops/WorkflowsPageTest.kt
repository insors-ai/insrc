package ai.insors.insrc.jetbrains.ops

import org.junit.jupiter.api.Assertions.assertFalse
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Test
import java.io.File

/**
 * Source-scan guards for the filled Workflows page (Story E2026092157298940:S003 / t5):
 * the read-only tracked-workflow chain status. The Settings dialog is not headlessly
 * bootable, so the load-bearing invariants are asserted against source text (the
 * NestedOpsPagesTest / DaemonPageTest idiom).
 */
class WorkflowsPageTest {

    private fun read(path: String): String {
        val f = File(path)
        assertTrue(f.exists(), "expected source at $path (test cwd=${File("").absolutePath})")
        return f.readText()
    }

    private val src by lazy { read("src/main/kotlin/ai/insors/insrc/jetbrains/ops/WorkflowsConfigurable.kt") }

    @Test
    fun `ac1 - the page consumes sc1 and renders the chain from WorkflowChainReader via InsrcCollapsible`() {
        assertTrue(src.contains("class WorkflowsConfigurable : InsrcOpsConfigurable()"), "consumes sc1 by subclassing the base")
        assertTrue(src.contains("WorkflowChainReader"), "reads the chain via WorkflowChainReader")
        assertTrue(src.contains("reader.readAll()"), "invokes readAll() to project the chain")
        assertTrue(src.contains("InsrcCollapsible.collapsiblePanel"), "renders each Epic in a read-only collapsible card")
        // it surfaces the load-bearing chain fields
        assertTrue(src.contains("nextActionHint"), "renders the next-action hint (ac1)")
        assertTrue(src.contains("amendmentsPending") && src.contains("amendmentsApproved"), "renders the amendment counts (ac1)")
    }

    @Test
    fun `ac2 - the page is strictly read-only - no interactive control and no daemon IPC (k6)`() {
        // no mutating / approval AFFORDANCE anywhere on the page: the read-only status text
        // may say "approved"/"pending approval", but there is no button or action to act on
        // it. Guard on the control constructs, not on status words.
        for (banned in listOf("JButton", "addActionListener", "ActionListener")) {
            assertFalse(src.contains(banned), "the read-only Workflows page must not contain a '$banned' control (ac2/k6)")
        }
        // no daemon reach — the chain is read from local files only (k1)
        assertFalse(src.contains("DaemonGateway"), "the page opens no daemon socket (k1)")
        assertFalse(src.contains("service<"), "the page wires no daemon service read (k1/k6)")
    }

    @Test
    fun `ac3 - the page shows a clear empty state when there are no chains`() {
        assertTrue(src.contains("isEmpty()"), "the page branches on an empty chain list")
        assertTrue(
            src.contains("No insrc workflow artifacts in the open project"),
            "the empty branch renders a clear empty-state label, not a blank/error panel (ac3)",
        )
    }

    @Test
    fun `k4 - the page does not touch the parent settings page`() {
        assertFalse(src.contains("InsrcSettingsConfigurable"), "the Workflows page never references the parent settings page (k4)")
        val settings = read("src/main/kotlin/ai/insors/insrc/jetbrains/settings/InsrcSettingsConfigurable.kt")
        assertFalse(settings.contains("WorkflowsConfigurable"), "the parent settings page is not repointed at the Workflows page")
    }
}
