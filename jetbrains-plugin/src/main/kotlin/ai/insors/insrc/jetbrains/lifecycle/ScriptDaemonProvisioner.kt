package ai.insors.insrc.jetbrains.lifecycle

import com.intellij.openapi.diagnostic.logger
import java.io.File
import java.io.IOException
import java.nio.file.Files
import java.nio.file.Path

/**
 * A launched subprocess spec (Story S003 / t6): the argv, the environment it runs
 * under, and the working directory. Recorded by tests to assert what was invoked.
 */
data class Subprocess(
    val command: List<String>,
    val env: Map<String, String>,
)

/**
 * Injectable process seam (Story S003 / t6): run [spec] and return the child exit
 * code. Throws [IOException] on a spawn failure. The real implementation uses
 * [ProcessBuilder]; tests fake it so exit-code mapping + target selection are
 * verifiable with no real process.
 */
fun interface SubprocessRunner {
    fun run(spec: Subprocess): Int
}

/**
 * Locates the existing backend scripts to delegate to (Story S003 / t6): the
 * install script for INSTALL, the daemon-ctl script for UPDATE. Returns `null`
 * when the script cannot be found on disk (a fail-safe skip, not a reproduction).
 */
fun interface DaemonScriptLocator {
    fun scriptFor(kind: ProvisionKind): Path?
}

/**
 * Delegates daemon install/update to the EXISTING backend tooling (Story S003 /
 * t6, lc1/k5): INSTALL -> insrc-daemon-install.sh, UPDATE -> daemon-ctl.sh update,
 * spawned with the resolved Node on PATH. It captures the outcome — a non-zero
 * exit, a missing script, or a spawn failure all become ProvisionOutcome(ok=false)
 * (never thrown) — and NEVER reproduces the installer's clone/npm/build logic.
 *
 * The process seam ([SubprocessRunner]) and script lookup ([DaemonScriptLocator])
 * are injected so exit-code mapping and target selection are unit-testable.
 */
class ScriptDaemonProvisioner(
    private val runner: SubprocessRunner,
    private val locator: DaemonScriptLocator,
    private val baseEnv: Map<String, String> = System.getenv(),
) : DaemonProvisioner {

    private val log = logger<ScriptDaemonProvisioner>()

    override fun run(kind: ProvisionKind, node: NodeRuntime): ProvisionOutcome {
        val script = locator.scriptFor(kind)
        if (script == null || !Files.exists(script)) {
            log.warn("insrc: daemon setup script for $kind not found — skipping")
            return ProvisionOutcome(ok = false, reason = "insrc setup tooling is unavailable")
        }

        // INSTALL runs the install script; UPDATE runs `daemon-ctl.sh update`.
        val command = when (kind) {
            ProvisionKind.INSTALL -> listOf("bash", script.toString())
            ProvisionKind.UPDATE -> listOf("bash", script.toString(), "update")
        }
        val env = envWithNodeOnPath(node)

        return try {
            val exit = runner.run(Subprocess(command = command, env = env))
            if (exit == 0) ProvisionOutcome(ok = true, exitCode = 0)
            else ProvisionOutcome(ok = false, exitCode = exit, reason = mapReason(kind, exit))
        } catch (e: IOException) {
            log.warn("insrc: failed to spawn daemon setup for $kind", e)
            ProvisionOutcome(ok = false, reason = "insrc setup could not start: ${e.message}")
        }
    }

    /** Prepend the resolved Node's bin dir to PATH so the installer's `node` resolves to our runtime. */
    private fun envWithNodeOnPath(node: NodeRuntime): Map<String, String> {
        val nodeBinDir = File(node.executablePath).parentFile?.path ?: return baseEnv
        val existingPath = baseEnv["PATH"].orEmpty()
        val newPath = if (existingPath.isEmpty()) nodeBinDir else nodeBinDir + File.pathSeparator + existingPath
        return baseEnv + ("PATH" to newPath)
    }

    /**
     * Map a script's documented exit codes to a user-facing reason. INSTALL runs
     * insrc-daemon-install.sh (2 prereq / 3 daemon-source-missing / 4 git-npm-build);
     * UPDATE runs daemon-ctl.sh, whose codes differ (2 daemon-dir-missing / not a
     * git checkout, 3 git in an unclean/diverged state, 4 npm/build/start). Each
     * kind is mapped with its own script's semantics so the message is accurate.
     */
    private fun mapReason(kind: ProvisionKind, exitCode: Int): String =
        when (kind) {
            ProvisionKind.INSTALL -> when (exitCode) {
                2 -> "a prerequisite is missing (node / git / npm)"
                3 -> "the daemon source could not be found"
                4 -> "the git / npm / build step failed"
                else -> "install failed (exit $exitCode)"
            }
            ProvisionKind.UPDATE -> when (exitCode) {
                2 -> "the daemon install is missing or not a git checkout"
                3 -> "the daemon repo has uncommitted or diverged changes — resolve it manually"
                4 -> "the git / npm / build step failed"
                else -> "update failed (exit $exitCode)"
            }
        }

    /** The real runner: spawn via [ProcessBuilder], inheriting IO, returning the exit code. */
    class ProcessBuilderRunner : SubprocessRunner {
        override fun run(spec: Subprocess): Int {
            val pb = ProcessBuilder(spec.command).redirectErrorStream(true)
            pb.environment().clear()
            pb.environment().putAll(spec.env)
            return pb.start().waitFor()
        }
    }
}
