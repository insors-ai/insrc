package ai.insors.insrc.jetbrains.lifecycle

import ai.insors.insrc.jetbrains.daemon.DaemonActionResult
import ai.insors.insrc.jetbrains.daemon.LifecycleCommand
import com.intellij.openapi.diagnostic.logger
import java.io.File
import java.io.IOException
import java.nio.file.Files

/** Current packaged bootstrap for UPDATE, retained qualified controller for START/RESTART. */
class DaemonLifecycleCommandRunner(
    private val runner: SubprocessRunner,
    private val scriptLocator: DaemonScriptLocator,
    private val nodeResolver: () -> NodeRuntime?,
    private val baseEnv: Map<String, String> = System.getenv(),
) {

    private val log = logger<DaemonLifecycleCommandRunner>()

    /** Run the daemon-ctl.sh subcommand for [command]; never throws. */
    fun run(command: LifecycleCommand): DaemonActionResult {
        val script = runCatching { if (command == LifecycleCommand.UPDATE) scriptLocator.scriptFor(ProvisionKind.UPDATE) else scriptLocator.controlScript() }
            .getOrElse { return DaemonActionResult.Failed(it.message ?: "Invalid daemon installation") }
        if (script == null || !Files.exists(script)) {
            log.warn("insrc: daemon-ctl.sh not found for $command — skipping")
            return DaemonActionResult.Failed("insrc daemon tooling is unavailable (daemon not installed)")
        }

        val commandLine = if (command == LifecycleCommand.UPDATE)
            installerCommand(script, ProvisionKind.UPDATE, scriptLocator.targetRoot())
        else listOf("/bin/bash", script.toString(), subcommand(command), "--skip-sync", "--skip-install", "--skip-build")
        val env = nativeChildEnvironment(nodeResolver(), baseEnv) + ("INSRC_DAEMON_UPDATE_WAIT" to "1") +
            (if (command != LifecycleCommand.UPDATE) mapOf("INSRC_DAEMON_ROOT" to script.parent.parent.toString()) else emptyMap())

        return try {
            val result = runner.runCaptured(Subprocess(command = commandLine, env = env))
            if (result.exitCode == 0) DaemonActionResult.Ok(okMessage(command))
            else DaemonActionResult.Failed(result.output.trim().takeLast(8192).ifEmpty { mapExit(result.exitCode) })
        } catch (e: IOException) {
            log.warn("insrc: failed to spawn daemon-ctl.sh for $command", e)
            DaemonActionResult.Failed("insrc could not run daemon-ctl.sh: ${e.message}")
        }
    }

    private fun subcommand(command: LifecycleCommand): String =
        when (command) {
            LifecycleCommand.START -> "start"
            LifecycleCommand.RESTART -> "restart"
            LifecycleCommand.UPDATE -> "update"
        }

    private fun okMessage(command: LifecycleCommand): String =
        when (command) {
            LifecycleCommand.START -> "daemon started"
            LifecycleCommand.RESTART -> "daemon restarted"
            LifecycleCommand.UPDATE -> "daemon updated"
        }

    /**
     * Map daemon-ctl.sh's documented exit codes to a user-facing reason (the same
     * semantics ScriptDaemonProvisioner.mapReason(UPDATE) uses): 2 daemon-dir-missing /
     * not a git checkout, 3 uncommitted / diverged, 4 git / npm / build / start failed.
     */
    private fun mapExit(exitCode: Int): String =
        when (exitCode) {
            2 -> "the daemon install is missing or not a git checkout"
            3 -> "the daemon repo has uncommitted or diverged changes — resolve it manually"
            4 -> "the git / npm / build / start step failed"
            else -> "daemon-ctl.sh failed (exit $exitCode)"
        }

    companion object {
        /** The production runner: the real ProcessBuilder subprocess seam + the default
         *  daemon-ctl.sh locator + the default Node resolver — the exact trio
         *  [DaemonLifecycleService.production] wires. */
        fun production(): DaemonLifecycleCommandRunner {
            // The shell resolves source versus managed ownership itself.
            return DaemonLifecycleCommandRunner(
                runner = ScriptDaemonProvisioner.ProcessBuilderRunner(),
                scriptLocator = DefaultDaemonScriptLocator(),
                nodeResolver = { null },
            )
        }
    }
}
