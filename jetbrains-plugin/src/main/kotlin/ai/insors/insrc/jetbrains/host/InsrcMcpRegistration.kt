package ai.insors.insrc.jetbrains.host

import com.intellij.openapi.diagnostic.logger
import java.nio.file.Files
import java.nio.file.Path

/**
 * Composes the S002-internal 'mcp' block body — the insrc-mcp registration
 * (Story S002 / t4). NOT part of sc3: consumers see only [AiHostAdapter]; this
 * is the private content S002 writes into each host's [HostFile.MCP] file.
 *
 * The composed registration launches ONLY the existing stdio insrc-mcp server
 * (`node <out/bin/insrc-mcp.js>`), never a cloud/REST endpoint (k1, ac4), and
 * carries the active project's root as an EXPLICIT `--repo` argument — the
 * resolve-repo explicit-over-`INSRC_REPO` contract (`c4`). Because the repo is
 * an explicit per-project argument and NOT a baked shared `INSRC_REPO` env
 * default (the rejected a2 shape), each window's registration scopes to its own
 * project, so a shared MCP process across windows stays correctly scoped (k3,
 * ac2). When the insrc-mcp launch target cannot be resolved the composition is
 * skipped (no registration pointing at a missing server) and logged.
 */
object InsrcMcpRegistration {

    /** The insrc markers bounding the registration block written into the host's mcp file. */
    const val MCP_BEGIN = "<!-- insrc:mcp:start -->"
    const val MCP_END = "<!-- insrc:mcp:end -->"

    /** The MCP server key the registration is filed under in the host config. */
    private const val SERVER_KEY = "insrc"

    private val log = logger<InsrcMcpRegistration>()

    /**
     * Compose the marker-delimited registration block for a project, or `null`
     * (fail-safe skip, logged) when [launchTargetPath] is absent.
     *
     * @param projectRootPath the active project's absolute root (sc1) — attached
     *   as the explicit `--repo` argument (k3, ac2)
     * @param launchTargetPath absolute path to the built insrc-mcp stdio entry
     *   (`out/bin/insrc-mcp.js`), or `null` when it cannot be resolved
     */
    fun compose(projectRootPath: String, launchTargetPath: String?): MarkerDelimitedBlock? {
        if (launchTargetPath == null) {
            log.warn("insrc: insrc-mcp launch target not resolved — skipping mcp registration for $projectRootPath")
            return null
        }
        val body = buildString {
            append("{\n")
            append("  \"mcpServers\": {\n")
            append("    \"").append(SERVER_KEY).append("\": {\n")
            // Local stdio server only — node spawning the built insrc-mcp entry.
            // No "url"/http(s) endpoint: reasoning stays on the host's CLI-OAuth path (k1).
            append("      \"command\": \"node\",\n")
            append("      \"args\": [")
            append(jsonString(launchTargetPath)).append(", ")
            // Explicit per-project repo argument (resolve-repo explicit-over-INSRC_REPO).
            // NOT a baked INSRC_REPO env default (the rejected a2 shape) — this is
            // what keeps a shared MCP process scoped per window (k3, ac2).
            append(jsonString("--repo")).append(", ")
            append(jsonString(projectRootPath))
            append("]\n")
            append("    }\n")
            append("  }\n")
            append("}")
        }
        return MarkerDelimitedBlock(beginMarker = MCP_BEGIN, endMarker = MCP_END, body = body)
    }

    /** Minimal JSON string escaping for the paths embedded in the registration. */
    private fun jsonString(raw: String): String {
        val sb = StringBuilder("\"")
        for (c in raw) {
            when (c) {
                '\\' -> sb.append("\\\\")
                '"' -> sb.append("\\\"")
                '\n' -> sb.append("\\n")
                '\t' -> sb.append("\\t")
                '\r' -> sb.append("\\r")
                else -> sb.append(c)
            }
        }
        return sb.append("\"").toString()
    }
}

/**
 * Resolves the built insrc-mcp stdio entry (Story S002 / t4). The IDE fork
 * clones this backend into `~/.insrc/daemon/` and spawns the compiled entry
 * (`out/bin/insrc-mcp.js`), so that is the launch target the registration points
 * at. Returns `null` when it is not present yet — the daemon-lifecycle policy
 * (S003) provisions the backend, and a later project-open re-composes.
 */
object InsrcMcpLaunchTarget {
    private fun daemonHome(): Path =
        Path.of(System.getProperty("user.home")).resolve(".insrc").resolve("daemon")

    /** Absolute path to `out/bin/insrc-mcp.js`, or `null` when absent. */
    fun resolve(): String? {
        val target = daemonHome().resolve("out").resolve("bin").resolve("insrc-mcp.js")
        return if (Files.exists(target)) target.toAbsolutePath().toString() else null
    }
}
