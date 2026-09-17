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
 * Which host-owned file an [AiHostAdapter] write/remove targets (Story S002 / sc3).
 *
 * Closed union: `MCP` is the host's MCP-server registration file (written by
 * S002), `RULES` is the host's guidance/rules file (written by S004). S002 only
 * ever writes [MCP]; it publishes the [RULES] capability for S004 to use.
 */
enum class HostFile {
    MCP,
    RULES,
}

/**
 * A detected AI host (Story S002 / sc3) with its resolved host-owned file
 * locations. Immutable; produced only by [AiHostAdapter.detectPresent], so both
 * paths are always absolute and belong to an installed+enabled host.
 *
 * @property kind           which agentic host this is
 * @property mcpConfigPath  absolute path to the host's MCP-registration file
 * @property rulesFilePath  absolute path to the host's guidance/rules file
 */
data class AiHost(
    val kind: AiHostKind,
    val mcpConfigPath: String,
    val rulesFilePath: String,
)

/**
 * The replace-only unit written into a host-owned file (Story S002 / sc3, k4).
 *
 * A marker-delimited block: [beginMarker] / [endMarker] bound the insrc region,
 * [body] is the content between them. The writer ([AiHostAdapter.writeBlock])
 * only ever creates, replaces, or removes the region between these markers —
 * surrounding user content is preserved verbatim. S002 composes the [HostFile.MCP]
 * block (the insrc-mcp registration); S004 composes the [HostFile.RULES] block
 * (steering).
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
 * Presence detection plus a marker-delimited, replace-only write/remove
 * primitive over the host's own config/rules files (k4). S002 owns and
 * implements this; S004 (steering) and S005 (uninstall cleanup) consume it. The
 * primitive is host-file-agnostic — the per-host format recognition that
 * resolves each file lives in detection, so writes only ever touch a recognised,
 * anchored file.
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
     * Write [block] into [host]'s [file], marker-delimited and replace-only (k4):
     * if a block with the same markers already exists it is replaced in place,
     * otherwise it is appended; all content outside the markers is preserved
     * verbatim, and re-writing the same block leaves the file byte-identical.
     *
     * @param host  a host returned by [detectPresent]
     * @throws HostFileAccessException if the file cannot be read or written
     *   (surfaced, not swallowed; no partial write is left behind)
     */
    fun writeBlock(host: AiHost, file: HostFile, block: MarkerDelimitedBlock)

    /**
     * Remove the insrc marker-delimited block from [host]'s [file], restoring the
     * file to its pre-insrc content (the reverse of [writeBlock]); a no-op when
     * no such block is present. Surrounding user content is preserved.
     *
     * @throws HostFileAccessException if the file cannot be read or written
     */
    fun removeBlock(host: AiHost, file: HostFile)
}
