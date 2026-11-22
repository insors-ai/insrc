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
    fun runCaptured(spec: Subprocess): NodeBootstrapResult = NodeBootstrapResult(run(spec), "")
}

/** Current packaged installer for setup/update; a separate qualified controller for lifecycle. */
fun interface DaemonScriptLocator {
    fun scriptFor(kind: ProvisionKind): Path?
    fun controlScript(): Path? = scriptFor(ProvisionKind.UPDATE)
    fun targetRoot(): Path? = null
}

/** Delegates to the current installer, reconstructing each child's native build environment. */
class ScriptDaemonProvisioner(
    private val runner: SubprocessRunner,
    private val locator: DaemonScriptLocator,
    private val baseEnv: Map<String, String> = System.getenv(),
) : DaemonProvisioner {

    private val log = logger<ScriptDaemonProvisioner>()

    override fun run(kind: ProvisionKind, node: NodeRuntime): ProvisionOutcome {
        val script = runCatching { locator.scriptFor(kind) }
            .getOrElse { return ProvisionOutcome(ok = false, reason = it.message ?: "Invalid daemon installation") }
        if (script == null || !Files.exists(script)) {
            log.warn("insrc: daemon setup script for $kind not found — skipping")
            return ProvisionOutcome(ok = false, reason = "insrc setup tooling is unavailable")
        }

        val command = installerCommand(script, kind, locator.targetRoot())
        // A child provisioner's exports never reach this JVM. Reconstruct native
        // build policy in every child; the shell independently verifies Node/npm.
        val env = nativeChildEnvironment(node, baseEnv) + ("INSRC_DAEMON_UPDATE_WAIT" to "1")

        return try {
            val result = runner.runCaptured(Subprocess(command = command, env = env))
            val exit = result.exitCode
            if (exit == 0) ProvisionOutcome(ok = true, exitCode = 0)
            else ProvisionOutcome(ok = false, exitCode = exit, reason = result.output.trim().takeLast(8192).ifEmpty { mapReason(kind, exit) })
        } catch (e: IOException) {
            log.warn("insrc: failed to spawn daemon setup for $kind", e)
            ProvisionOutcome(ok = false, reason = "insrc setup could not start: ${e.message}")
        }
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
                2 -> "verified local runtime or shell/git prerequisites are unavailable"
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
        override fun run(spec: Subprocess): Int = runCaptured(spec).exitCode
        override fun runCaptured(spec: Subprocess): NodeBootstrapResult {
            val pb = ProcessBuilder(spec.command).redirectErrorStream(true)
            pb.environment().clear()
            pb.environment().putAll(spec.env)
            val process = pb.start()
            var tail = byteArrayOf()
            process.inputStream.use { stream ->
                val buffer = ByteArray(4096)
                while (true) {
                    val count = stream.read(buffer)
                    if (count < 0) break
                    tail = (tail + buffer.copyOf(count)).takeLast(8192).toByteArray()
                }
            }
            return NodeBootstrapResult(process.waitFor(), tail.toString(Charsets.UTF_8))
        }
    }
}
