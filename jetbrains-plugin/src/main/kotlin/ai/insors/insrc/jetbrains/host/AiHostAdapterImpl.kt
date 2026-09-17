package ai.insors.insrc.jetbrains.host

/**
 * The concrete sc3 adapter (Story S002) assembled from the task cores:
 * detection ([HostDetector] over the real [JetBrainsHostProbes]) and the
 * format-agnostic marker writer ([MarkerFileWriter]). Both collaborators are
 * injectable so the wiring is unit/integration-testable with stub probes and a
 * temp-file writer.
 *
 * [writeBlock]/[removeBlock] map a ([AiHost], [HostFile]) to the host-owned file
 * path and that file's insrc markers, then delegate to the pure writer. S002
 * only ever writes [HostFile.MCP]; [HostFile.RULES] support is published here for
 * S004 (steering) and S005 (uninstall cleanup) to consume.
 */
class AiHostAdapterImpl(
    private val detector: HostDetector = HostDetector(JetBrainsHostProbes.all()),
    private val writer: MarkerFileWriter = MarkerFileWriter(),
) : AiHostAdapter {

    override fun detectPresent(): List<AiHost> = detector.detectPresent()

    override fun writeBlock(host: AiHost, file: HostFile, block: MarkerDelimitedBlock) {
        writer.writeBlock(pathFor(host, file), block)
    }

    override fun removeBlock(host: AiHost, file: HostFile) {
        val (begin, end) = markersFor(file)
        writer.removeBlock(pathFor(host, file), begin, end)
    }

    private fun pathFor(host: AiHost, file: HostFile): String =
        when (file) {
            HostFile.MCP -> host.mcpConfigPath
            HostFile.RULES -> host.rulesFilePath
        }

    /** The insrc marker pair for each host-owned file. */
    private fun markersFor(file: HostFile): Pair<String, String> =
        when (file) {
            HostFile.MCP -> InsrcMcpRegistration.MCP_BEGIN to InsrcMcpRegistration.MCP_END
            // Shared insrc rules markers — S004 writes the steering body between
            // them; declared here so removeBlock (invoked by S005) is complete.
            HostFile.RULES -> RULES_BEGIN to RULES_END
        }

    companion object {
        const val RULES_BEGIN = "<!-- insrc:rules:start -->"
        const val RULES_END = "<!-- insrc:rules:end -->"
    }
}
