package ai.insors.insrc.jetbrains.lifecycle

import ai.insors.insrc.jetbrains.daemon.DaemonActionResult
import ai.insors.insrc.jetbrains.daemon.LifecycleCommand
import com.intellij.openapi.diagnostic.logger
import java.io.File
import java.io.IOException
import java.nio.file.Files

/**
 * The S002-internal lifecycle-command seam (Story E2026092157298940:S002): runs the
 * on-demand `daemon-ctl.sh <subcommand>` for START/RESTART/UPDATE from the Daemon
 * settings page. It REUSES the existing S003 process seams — [SubprocessRunner] /
 * [Subprocess] / [ScriptDaemonProvisioner.ProcessBuilderRunner], the
 * [DaemonScriptLocator] that resolves `~/.insrc/daemon/scripts/daemon-ctl.sh`, and the
 * [NodeRuntimeResolver] node-on-PATH idiom — and NEVER reproduces daemon-ctl.sh's logic
 * nor extends the S003-owned [ProvisionKind] (it only reads it as the selector for the
 * daemon-ctl.sh path, via [DaemonScriptLocator.scriptFor]).
 *
 * Mirrors [ScriptDaemonProvisioner]'s never-throw contract: a non-zero exit, a missing
 * script, or a spawn [IOException] all become [DaemonActionResult.Failed]; exit 0 is
 * [DaemonActionResult.Ok].
 *
 * The seams are injected so exit-code mapping + target selection are unit-testable with
 * no real process. Use [production] for the wired-up instance.
 */
class DaemonLifecycleCommandRunner(
    private val runner: SubprocessRunner,
    private val scriptLocator: DaemonScriptLocator,
    private val nodeResolver: () -> NodeRuntime?,
    private val baseEnv: Map<String, String> = System.getenv(),
) {

    private val log = logger<DaemonLifecycleCommandRunner>()

    /** Run the daemon-ctl.sh subcommand for [command]; never throws. */
    fun run(command: LifecycleCommand): DaemonActionResult {
        // daemon-ctl.sh is the UPDATE-kind script the existing locator already resolves;
        // we run it with a DIFFERENT subcommand. A null path (daemon not installed) is a
        // fail-safe skip, never a reproduction.
        val script = scriptLocator.scriptFor(ProvisionKind.UPDATE)
        if (script == null || !Files.exists(script)) {
            log.warn("insrc: daemon-ctl.sh not found for $command — skipping")
            return DaemonActionResult.Failed("insrc daemon tooling is unavailable (daemon not installed)")
        }

        val commandLine = listOf("bash", script.toString(), subcommand(command))
        val env = envWithNodeOnPath(nodeResolver())

        return try {
            val exit = runner.run(Subprocess(command = commandLine, env = env))
            if (exit == 0) DaemonActionResult.Ok(okMessage(command)) else DaemonActionResult.Failed(mapExit(exit))
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

    /** Prepend the resolved Node's bin dir to PATH so daemon-ctl.sh's `node` resolves to our runtime. */
    private fun envWithNodeOnPath(node: NodeRuntime?): Map<String, String> {
        val nodeBinDir = node?.let { File(it.executablePath).parentFile?.path } ?: return baseEnv
        val existingPath = baseEnv["PATH"].orEmpty()
        val newPath = if (existingPath.isEmpty()) nodeBinDir else nodeBinDir + File.pathSeparator + existingPath
        return baseEnv + ("PATH" to newPath)
    }

    companion object {
        /** The production runner: the real ProcessBuilder subprocess seam + the default
         *  daemon-ctl.sh locator + the default Node resolver — the exact trio
         *  [DaemonLifecycleService.production] wires. */
        fun production(): DaemonLifecycleCommandRunner {
            val nodeResolver = DefaultNodeRuntimeResolver(RealSystemNodeProbe, DefaultPrivateNodeProvisioner())
            return DaemonLifecycleCommandRunner(
                runner = ScriptDaemonProvisioner.ProcessBuilderRunner(),
                scriptLocator = DefaultDaemonScriptLocator(),
                nodeResolver = { runCatching { nodeResolver.resolve() }.getOrNull() },
            )
        }
    }
}
