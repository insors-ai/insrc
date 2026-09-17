package ai.insors.insrc.jetbrains.host

import com.google.gson.GsonBuilder
import com.google.gson.JsonObject
import com.google.gson.JsonPrimitive
import com.intellij.openapi.diagnostic.logger
import java.nio.file.Files
import java.nio.file.Path

/**
 * Composes the S002-internal insrc-mcp registration (Story S002 / t4). NOT part
 * of sc3: consumers see only [AiHostAdapter]; this is the private content S002
 * installs under the `mcpServers.insrc` key of each host's mcp config.
 *
 * The registration launches ONLY the existing stdio insrc-mcp server
 * (`node <out/bin/insrc-mcp.js>`), never a cloud/REST endpoint (k1, ac4). It
 * scopes to the active project by setting the server's working directory
 * (`cwd`) to the project root: resolve-repo (src/mcp/resolve-repo.ts) resolves
 * the session repo by matching the process CWD against the daemon's live repo
 * registry (its step 2), so a server spawned for a project resolves to that
 * project — WITHOUT baking a shared `INSRC_REPO` env default (the rejected a2
 * shape) and WITHOUT relying on a non-existent `--repo` argv (insrc-mcp does not
 * parse process args). Robust per-tool-call scoping (resolve-repo step 1, the
 * outright winner) is delivered by the host agent passing `repo` per call, which
 * S004's steering instructs. When the insrc-mcp launch target cannot be resolved
 * the composition is skipped (no registration pointing at a missing server) and
 * logged.
 */
object InsrcMcpRegistration {

    /** The MCP server key the registration is filed under — the replace anchor (k4). */
    const val SERVER_KEY = "insrc"

    private val log = logger<InsrcMcpRegistration>()
    private val gson = GsonBuilder().setPrettyPrinting().create()

    /**
     * Compose the insrc server-entry JSON (the value written under
     * `mcpServers.insrc`), or `null` (fail-safe skip, logged) when
     * [launchTargetPath] is absent.
     *
     * @param projectRootPath the active project's absolute root (sc1) — set as
     *   the server `cwd` so resolve-repo scopes to this project (k3, ac2)
     * @param launchTargetPath absolute path to the built insrc-mcp stdio entry
     *   (`out/bin/insrc-mcp.js`), or `null` when it cannot be resolved
     * @return the pretty-printed JSON object for the `insrc` server entry
     */
    fun composeServerEntry(projectRootPath: String, launchTargetPath: String?): String? {
        if (launchTargetPath == null) {
            log.warn("insrc: insrc-mcp launch target not resolved — skipping mcp registration for $projectRootPath")
            return null
        }
        val args = com.google.gson.JsonArray().apply { add(launchTargetPath) }
        val entry = JsonObject().apply {
            // Local stdio server only — node spawning the built insrc-mcp entry.
            // No "url"/http(s) endpoint: reasoning stays on the host's CLI-OAuth path (k1).
            add("command", JsonPrimitive("node"))
            add("args", args)
            // Per-project scoping via CWD (resolve-repo session-cwd match), NOT a
            // baked INSRC_REPO env default and NOT an inert --repo argv (k3, ac2).
            add("cwd", JsonPrimitive(projectRootPath))
        }
        return gson.toJson(entry)
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
