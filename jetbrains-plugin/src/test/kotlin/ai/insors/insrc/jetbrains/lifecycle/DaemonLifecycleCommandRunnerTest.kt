package ai.insors.insrc.jetbrains.lifecycle

import ai.insors.insrc.jetbrains.daemon.DaemonActionResult
import ai.insors.insrc.jetbrains.daemon.LifecycleCommand
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Test
import java.io.IOException
import java.nio.file.Files
import java.nio.file.Path

/**
 * Unit tests for the S002 lifecycle-command runner (Story E2026092157298940:S002 / t4).
 * Drives [DaemonLifecycleCommandRunner] against a fake [SubprocessRunner] (records the
 * [Subprocess] + returns a scripted exit code) and a fake [DaemonScriptLocator] — no real
 * process, no real daemon-ctl.sh — asserting the subcommand wiring + the exit-code ->
 * DaemonActionResult mapping + the never-throws contract.
 */
class DaemonLifecycleCommandRunnerTest {

    private class RecordingRunner(private val exit: Int, private val throwIo: Boolean = false) : SubprocessRunner {
        var lastSpec: Subprocess? = null
        override fun run(spec: Subprocess): Int {
            lastSpec = spec
            if (throwIo) throw IOException("spawn failed")
            return exit
        }
    }

    /** A temp daemon-ctl.sh so Files.exists() passes; contents irrelevant (never executed). */
    private fun tempScript(): Path = Files.createTempFile("daemon-ctl", ".sh").also { it.toFile().deleteOnExit() }

    private fun locator(path: Path?) = DaemonScriptLocator { path }

    private val noNode: () -> NodeRuntime? = { null }

    @Test
    fun `run(START) invokes bash daemon-ctl_sh start and maps exit 0 to Ok`() {
        val script = tempScript()
        val runner = RecordingRunner(exit = 0)
        val result = DaemonLifecycleCommandRunner(runner, locator(script), noNode, emptyMap()).run(LifecycleCommand.START)

        assertEquals(listOf("bash", script.toString(), "start"), runner.lastSpec?.command)
        assertTrue(result is DaemonActionResult.Ok)
    }

    @Test
    fun `run maps each command to its daemon-ctl_sh subcommand`() {
        val script = tempScript()
        for ((cmd, sub) in listOf(
            LifecycleCommand.START to "start",
            LifecycleCommand.RESTART to "restart",
            LifecycleCommand.UPDATE to "update",
        )) {
            val runner = RecordingRunner(exit = 0)
            DaemonLifecycleCommandRunner(runner, locator(script), noNode, emptyMap()).run(cmd)
            assertEquals(sub, runner.lastSpec?.command?.last())
        }
    }

    @Test
    fun `run prepends the resolved Node bin dir to PATH`() {
        val script = tempScript()
        val runner = RecordingRunner(exit = 0)
        val node = NodeRuntime("/opt/node/bin/node", NodeSource.SYSTEM)
        DaemonLifecycleCommandRunner(runner, locator(script), { node }, mapOf("PATH" to "/usr/bin")).run(LifecycleCommand.START)
        assertEquals("/opt/node/bin" + java.io.File.pathSeparator + "/usr/bin", runner.lastSpec?.env?.get("PATH"))
    }

    @Test
    fun `run maps daemon-ctl_sh exit codes 2 3 4 to distinct Failed reasons`() {
        val script = tempScript()
        val reasons = listOf(2, 3, 4).map { code ->
            (DaemonLifecycleCommandRunner(RecordingRunner(code), locator(script), noNode, emptyMap())
                .run(LifecycleCommand.UPDATE) as DaemonActionResult.Failed).reason
        }
        assertEquals(3, reasons.toSet().size, "each exit code maps to a distinct message")
        assertTrue(reasons[0].contains("not a git checkout"))
        assertTrue(reasons[1].contains("uncommitted"))
        assertTrue(reasons[2].contains("build"))
    }

    @Test
    fun `run maps a missing daemon-ctl_sh (null locator) to Failed without spawning`() {
        val runner = RecordingRunner(exit = 0)
        val result = DaemonLifecycleCommandRunner(runner, locator(null), noNode, emptyMap()).run(LifecycleCommand.START)
        assertTrue(result is DaemonActionResult.Failed)
        assertTrue((result as DaemonActionResult.Failed).reason.contains("unavailable"))
        assertEquals(null, runner.lastSpec, "no subprocess is spawned when the script is absent")
    }

    @Test
    fun `run maps a spawn IOException to Failed, never rethrown`() {
        val script = tempScript()
        val result = DaemonLifecycleCommandRunner(RecordingRunner(exit = 0, throwIo = true), locator(script), noNode, emptyMap())
            .run(LifecycleCommand.RESTART)
        assertTrue(result is DaemonActionResult.Failed)
    }
}
