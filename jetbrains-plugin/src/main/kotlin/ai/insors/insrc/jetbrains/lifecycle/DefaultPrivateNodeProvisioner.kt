package ai.insors.insrc.jetbrains.lifecycle

import java.io.IOException
import java.nio.file.Files
import java.nio.file.Path
import java.util.concurrent.TimeUnit

/** Captured shared-bootstrap outcome; tests never download or extract independently. */
data class NodeBootstrapResult(val exitCode: Int, val output: String)
fun interface NodeBootstrapRunner { fun run(command: List<String>, environment: Map<String, String>): NodeBootstrapResult }

/** Delegates pin, checksum, extraction, inventory and cache reuse to the bundled shell owner. */
class DefaultPrivateNodeProvisioner(
    private val homeDir: Path = Path.of(System.getProperty("user.home")),
    private val installer: () -> Path? = { DefaultDaemonScriptLocator().scriptFor(ProvisionKind.INSTALL) },
    private val runner: NodeBootstrapRunner = SharedNodeBootstrapRunner(),
    private val baseEnv: Map<String, String> = System.getenv(),
    private val osName: String = System.getProperty("os.name").orEmpty(),
) : PrivateNodeProvisioner {
    override fun ensurePrivateNode(): NodeRuntime {
        if (osName.startsWith("Windows", ignoreCase = true)) {
            throw NodeProvisioningException("insrc: Windows source runtime is not qualified; no system Node fallback")
        }
        try {
            val script = installer() ?: throw IOException("bundled runtime bootstrap is missing; reinstall the plugin")
            val environment = baseEnv.filterKeys { it != "NODE_OPTIONS" && it != "NODE_PATH" } + ("HOME" to homeDir.toString())
            val result = runner.run(listOf("/bin/bash", script.toString(), "--print-runtime"), environment)
            if (result.exitCode != 0) throw IOException(result.output.trim().ifEmpty { "shared runtime bootstrap failed (${result.exitCode})" })
            val text = result.output.trim()
            if (text.contains('\n') || text.contains('\r')) throw IOException("invalid shared runtime response")
            val executable = Path.of(text)
            val store = homeDir.resolve(".insrc/runtimes").toRealPath()
            if (!executable.isAbsolute || !executable.startsWith(store) || executable.toRealPath() != executable ||
                executable.fileName.toString() != "node" || !Files.isExecutable(executable)) {
                throw IOException("shared bootstrap returned a runtime outside its verified owned store")
            }
            return NodeRuntime(executable.toString(), NodeSource.PROVISIONED)
        } catch (e: Exception) {
            throw NodeProvisioningException("insrc: verified local Node unavailable: ${e.message}", e)
        }
    }
}

/** No Node invocation: the self-contained installer bootstraps using system shell utilities. */
class SharedNodeBootstrapRunner : NodeBootstrapRunner {
    override fun run(command: List<String>, environment: Map<String, String>): NodeBootstrapResult {
        val output = Files.createTempFile("insrc-runtime-bootstrap", ".log")
        try {
            val builder = ProcessBuilder(command).redirectErrorStream(true).redirectOutput(output.toFile())
            builder.environment().clear()
            builder.environment().putAll(environment)
            val process = builder.start()
            if (!process.waitFor(180, TimeUnit.SECONDS)) {
                val children = process.descendants().toList()
                children.reversed().forEach { it.destroyForcibly() }
                process.destroyForcibly()
                process.waitFor(10, TimeUnit.SECONDS)
                throw IOException("runtime bootstrap timed out; retry using the packaged installer")
            }
            if (Files.size(output) > 256 * 1024) throw IOException("runtime bootstrap output exceeded its bound")
            return NodeBootstrapResult(process.exitValue(), Files.readString(output))
        } finally { Files.deleteIfExists(output) }
    }
}
