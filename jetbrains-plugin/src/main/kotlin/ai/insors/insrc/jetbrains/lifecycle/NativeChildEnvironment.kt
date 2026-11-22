package ai.insors.insrc.jetbrains.lifecycle

import com.google.gson.JsonParser
import java.io.File
import java.nio.file.Path

/** The verified shell remains Node/npm authority. Reapply policy to each JVM child. */
internal fun nativeChildEnvironment(node: NodeRuntime?, parent: Map<String, String>): Map<String, String> {
    val policy = NativeChildPolicy.nodeVersion
    val env = parent.filterKeys { it != "NODE_OPTIONS" && it != "NODE_PATH" }.toMutableMap()
    node?.let {
        val bin = File(it.executablePath).parent
        env["PATH"] = bin + File.pathSeparator + (parent["PATH"] ?: "/usr/bin:/bin")
    }
    env["PYTHONDONTWRITEBYTECODE"] = "1"
    env["ONNXRUNTIME_NODE_INSTALL_CUDA"] = parent["ONNXRUNTIME_NODE_INSTALL_CUDA"] ?: "skip"
    env["npm_config_target"] = policy
    env["npm_config_runtime"] = "node"
    // CXXFLAGS is preserved here; the canonical installer appends its C++17 flag.
    return env
}

private object NativeChildPolicy {
    val nodeVersion: String = NativeChildPolicy::class.java.getResourceAsStream("/insrc/node-runtime-policy.json")!!.use {
        JsonParser.parseReader(it.reader()).asJsonObject.get("nodeVersion").asString
    }
}

internal fun installerCommand(script: Path, kind: ProvisionKind, target: Path?): List<String> =
    listOf("/bin/bash", script.toString(), "-y") +
        (target?.let { listOf("--target", it.toString()) } ?: emptyList()) +
        (if (kind == ProvisionKind.UPDATE) listOf("--migrate-runtime", "--no-start") else emptyList())
