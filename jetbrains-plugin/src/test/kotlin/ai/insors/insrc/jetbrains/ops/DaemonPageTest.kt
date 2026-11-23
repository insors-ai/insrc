package ai.insors.insrc.jetbrains.ops

import org.junit.jupiter.api.Assertions.assertFalse
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Test
import java.io.File

/**
 * Source-scan guards for the filled Daemon page (Story E2026092157298940:S002 / t5): the
 * sc2 health readout + the six lifecycle actions wired off the EDT. The Settings dialog is
 * not headlessly bootable, so the load-bearing invariants are asserted against source text
 * (the SettingsViewTest / NestedOpsPagesTest idiom).
 */
class DaemonPageTest {

    private fun read(path: String): String {
        val f = File(path)
        assertTrue(f.exists(), "expected source at $path (test cwd=${File("").absolutePath})")
        return f.readText()
    }

    private val src by lazy { read("src/main/kotlin/ai/insors/insrc/jetbrains/ops/DaemonConfigurable.kt") }

    @Test
    fun `ac1 - buildBody renders the three daemonStatus states from sc2`() {
        assertTrue(src.contains("gateway.daemonStatus()"), "reads sc2 daemonStatus()")
        assertTrue(src.contains("DaemonStatusResult.Loaded"), "renders Loaded fields")
        assertTrue(src.contains("DaemonStatusResult.Stopped"), "renders a distinct Stopped state")
        assertTrue(src.contains("DaemonStatusResult.Unavailable"), "renders the Unavailable reason")
        // not the S001 placeholder any more
        assertFalse(src.contains("arrive in a later insrc update"), "the S001 placeholder body is replaced")
    }

    @Test
    fun `ac2 - backup and compact actions remain wired`() {
        assertTrue(src.contains("gateway.backup("), "Backup via the gateway backup IPC")
        assertTrue(src.contains("gateway.compact()"), "Compact via the gateway compact IPC")
    }

    @Test
    fun `ac2 - every action runs off the EDT under ProgressManager and Backup asks for a directory first`() {
        assertTrue(src.contains("runProcessWithProgressSynchronously"), "actions run off the EDT under ProgressManager")
        assertTrue(src.contains("FileChooser.chooseFile"), "Backup opens a directory chooser")
        assertTrue(
            src.contains("createSingleFolderDescriptor"),
            "the backup chooser is a single-folder descriptor",
        )
        // the cancel path returns before any daemon.backup call
        assertTrue(src.contains("?: return@addActionListener"), "cancelling the chooser makes no backup call")
    }

    @Test
    fun `ac2 - the page consumes sc1 (extends the base) and does not touch the parent settings page`() {
        assertTrue(src.contains("class DaemonConfigurable : InsrcOpsConfigurable()"), "consumes sc1 by subclassing the base")
        assertFalse(src.contains("InsrcSettingsConfigurable"), "the Daemon page never references the parent settings page (k4)")
        // the shipped parent settings page is not edited by this story
        val settings = read("src/main/kotlin/ai/insors/insrc/jetbrains/settings/InsrcSettingsConfigurable.kt")
        assertFalse(settings.contains("DaemonConfigurable"), "the parent settings page is not repointed at the Daemon page")
    }
}
