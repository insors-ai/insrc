package ai.insors.insrc.jetbrains.freshness

import ai.insors.insrc.jetbrains.IdeKind
import ai.insors.insrc.jetbrains.ProjectContext
import ai.insors.insrc.jetbrains.daemon.DaemonActionResult
import ai.insors.insrc.jetbrains.daemon.DaemonUpdateOutcomeResult
import org.junit.jupiter.api.Assertions.assertFalse
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Test
import java.io.File

/**
 * Story S004 / t3 — unit tests for the app-scoped freshness consumer wiring. Drives
 * onProjectOpened with a synchronous test executor to assert the pure check() is scheduled
 * fire-and-forget (never blocking project-open), and source-scans the wiring to assert the
 * k2 boundary (no daemon-ctl.sh / controller shell-out for the update).
 */
class InstalledCommitFreshnessConsumerTest {

    private class RecordingGateway : FreshnessGateway {
        var installedCommitCalls = 0
        override fun installedCommit(): String? { installedCommitCalls++; return null } // unreachable -> quick skip
        override fun update(): DaemonActionResult = DaemonActionResult.Failed("not used")
        override fun updateOutcome(): DaemonUpdateOutcomeResult = DaemonUpdateOutcomeResult.Unavailable("not used")
    }

    private class RecordingVersionState : PluginVersionState {
        override val current: String = "1.0.0"
        val saved = mutableListOf<String>()
        override fun getLastSeen(): String? = "1.0.0"
        override fun setLastSeen(version: String) { saved += version }
    }

    @Test
    fun `onProjectOpened schedules the check via the injected executor (fire-and-forget)`() {
        val gateway = RecordingGateway()
        val vs = RecordingVersionState()
        val deps = FreshnessDeps(
            gateway = gateway,
            gitLsRemote = { _, _ -> "" },
            notify = { _, _, _ -> },
            versionState = vs,
            daemonRoot = "/home/u/.insrc/daemon",
        )
        var executorUsed = false
        val consumer = InstalledCommitFreshnessConsumer(deps, execute = { r -> executorUsed = true; r.run() })

        consumer.onProjectOpened(ProjectContext("/repo", IdeKind.IDEA))

        assertTrue(executorUsed, "the check is dispatched through the off-EDT executor seam (fire-and-forget)")
        assertTrue(gateway.installedCommitCalls >= 1, "the scheduled check actually ran")
        assertTrue(vs.saved.contains("1.0.0"), "the flow recorded the current version on its terminal path")
    }

    @Test
    fun `freshness routes legacy macOS through the installer and keeps managed IPC`() {
        val src = codeLines(readConsumerSource())
        assertTrue(src.contains("upgradeLegacy = { scripts.existingUpgradeTarget()?.let { lifecycle.run(LifecycleCommand.UPDATE) } }"))
        assertTrue(src.contains("gateway.update()"), "consumes the daemon-owned update() IPC (k2)")
        assertTrue(src.contains("gateway.updateOutcome()"), "consumes the daemon-owned updateOutcome() IPC")
    }

    @Test
    fun `the Update balloon action re-dispatches the blocking update off the EDT (HIGH-1)`() {
        // A NotificationAction callback runs on the EDT; the Update action drives the
        // blocking update()+reconnect loop, so it MUST re-dispatch onUpdate to the pooled
        // executor or the IDE freezes for the whole rebuild.
        val src = codeLines(readConsumerSource())
        // The Update action's callback wraps onUpdate in DEFAULT_EXECUTOR.execute { ... }.
        assertTrue(
            Regex("""DEFAULT_EXECUTOR\.execute\s*\{[^}]*\(\s*\)""").containsMatchIn(src) ||
                src.contains("DEFAULT_EXECUTOR.execute { action() }"),
            "the Update action re-dispatches onUpdate off the EDT (HIGH-1)",
        )
        // And it must NOT invoke onUpdate directly on the EDT.
        assertFalse(src.contains("onUpdate?.invoke()"), "onUpdate must not run synchronously on the EDT")
    }

    @Test
    fun `git ls-remote bounds the wait before reading so a hung git cannot defeat the timeout (MED-2)`() {
        val src = codeLines(readConsumerSource())
        val waitIdx = src.indexOf("waitFor(LS_REMOTE_TIMEOUT_MS")
        val readIdx = src.indexOf("readText()")
        assertTrue(waitIdx >= 0, "the ls-remote runner bounds the wait with waitFor(timeout)")
        assertTrue(readIdx >= 0, "the ls-remote runner reads the output")
        assertTrue(waitIdx < readIdx, "waitFor(timeout) must precede readText() so the timeout is honored (MED-2)")
        assertTrue(src.contains("destroyForcibly"), "a hung ls-remote is killed (MED-2)")
    }

    /** Drop `//` line comments + blank lines so the k2 scan only sees code, not prose. */
    private fun codeLines(src: String): String =
        src.lineSequence()
            .map { it.substringBefore("//") }
            .filter { it.isNotBlank() }
            .joinToString("\n")

    private fun readConsumerSource(): String {
        val rel = "src/main/kotlin/ai/insors/insrc/jetbrains/freshness/InstalledCommitFreshnessConsumer.kt"
        for (base in listOf(File("."), File("jetbrains-plugin"), File(System.getProperty("user.dir")))) {
            val f = File(base, rel)
            if (f.exists()) return f.readText()
        }
        error("could not locate InstalledCommitFreshnessConsumer.kt from ${File(".").absolutePath}")
    }
}
