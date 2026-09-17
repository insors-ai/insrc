package ai.insors.insrc.jetbrains.host

/**
 * The two JetBrains agentic AI hosts this plugin wires (Story S002 / sc3).
 *
 * Closed union — these are the only hosts insrc detects and registers into.
 * `detectPresent` (t3) realises detection for both; downstream stories (S004
 * steering, S005 onboarding/cleanup) never widen this set. The two hosts carry
 * different MCP/config formats (the external `c8` dimension); that difference is
 * isolated behind the per-host resolver in detection, not here.
 */
enum class AiHostKind {
    AI_ASSISTANT,
    JUNIE,
}

/**
 * A detected AI host (Story S002 / sc3) with its resolved host-owned file
 * locations. Immutable; produced only by [AiHostAdapter.detectPresent], so both
 * paths are always absolute and belong to an installed+enabled host.
 *
 * @property kind           which agentic host this is
 * @property mcpConfigPath  absolute path to the host's MCP-registration file (JSON)
 * @property rulesFilePath  absolute path to the host's guidance/rules file (Markdown)
 */
data class AiHost(
    val kind: AiHostKind,
    val mcpConfigPath: String,
    val rulesFilePath: String,
)

/**
 * The replace-only unit written into a host-owned MARKDOWN file (Story S002 /
 * sc3, k4) — used for the 'rules' file (S004 steering).
 *
 * A marker-delimited block: [beginMarker] / [endMarker] bound the insrc region,
 * [body] is the content between them. The rules writer only ever creates,
 * replaces, or removes the region between these markers — surrounding user
 * content is preserved verbatim. (The JSON 'mcp' file is NOT written this way:
 * HTML-comment markers are invalid in JSON, so the mcp registration is a JSON
 * key-merge under `mcpServers.insrc` instead — see [AiHostAdapter.writeMcpRegistration].)
 */
data class MarkerDelimitedBlock(
    val beginMarker: String,
    val endMarker: String,
    val body: String,
)

/**
 * Raised when a host-owned file cannot be read or written — permissions, a
 * read-only location, or a missing parent directory (Story S002 / sc3).
 *
 * Surfaced to the caller, never swallowed, and only after the target file has
 * been left exactly as it was (no partial write), so the orchestrating consumer
 * (S005) can notify while the other detected hosts are still wired independently.
 */
class HostFileAccessException(
    message: String,
    cause: Throwable? = null,
) : RuntimeException(message, cause)

/**
 * sc3 (Story S002): an abstraction over a detected JetBrains AI host.
 *
 * Presence detection plus replace-only, format-appropriate write/remove
 * primitives over the host's own files (k4): a JSON KEY-MERGE for the JSON mcp
 * config (`mcpServers.insrc`) and a MARKER-DELIMITED block for the Markdown
 * rules file. Both preserve surrounding user content and are fully reversible.
 * S002 owns and implements this; S004 (steering) writes the rules block and S005
 * (uninstall cleanup) removes both. The per-host format recognition that resolves
 * each file lives in detection, so writes only ever touch a recognised, anchored
 * file.
 */
interface AiHostAdapter {
    /**
     * The AI hosts installed and enabled in the running IDE, each with its
     * resolved MCP-config and rules-file paths. Empty when neither is present
     * (the no-op case S005 handles). Read-only — inspects host installations /
     * config locations and mutates nothing. Never throws: a host whose presence
     * or config shape cannot be safely determined is logged and omitted.
     */
    fun detectPresent(): List<AiHost>

    /**
     * Install or replace the insrc entry under `mcpServers.insrc` in [host]'s
     * JSON mcp config, preserving every other key/server verbatim and idempotent
     * on re-run (k4). [serverEntryJson] is the JSON object value for the `insrc`
     * key (composed by [InsrcMcpRegistration]).
     *
     * @throws HostFileAccessException if the file cannot be read or written
     *   (surfaced, not swallowed; no partial write is left behind)
     */
    fun writeMcpRegistration(host: AiHost, serverEntryJson: String)

    /**
     * Remove the insrc entry from [host]'s mcp config, restoring it to its
     * pre-insrc content; a no-op when absent. Used by S005 (uninstall cleanup).
     *
     * @throws HostFileAccessException if the file cannot be read or written
     */
    fun removeMcpRegistration(host: AiHost)

    /**
     * Write [block] into [host]'s Markdown rules file, marker-delimited and
     * replace-only (k4). Published for S004 (steering); S002 does not call it.
     *
     * @throws HostFileAccessException if the file cannot be read or written
     */
    fun writeRulesBlock(host: AiHost, block: MarkerDelimitedBlock)

    /**
     * Remove the insrc marker-delimited block from [host]'s rules file; a no-op
     * when absent. Published for S005 (uninstall cleanup).
     *
     * @throws HostFileAccessException if the file cannot be read or written
     */
    fun removeRulesBlock(host: AiHost)
}
