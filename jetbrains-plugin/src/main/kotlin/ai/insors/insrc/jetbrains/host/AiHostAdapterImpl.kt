package ai.insors.insrc.jetbrains.host

/**
 * The concrete sc3 adapter (Story S002) assembled from the task cores:
 * detection ([HostDetector] over the real [JetBrainsHostProbes]), the JSON
 * key-merge writer for the mcp config ([JsonMcpConfigWriter]), and the
 * marker-delimited writer for the Markdown rules file ([MarkerFileWriter]). All
 * collaborators are injectable so the wiring is unit/integration-testable with
 * stub probes and in-memory/temp-file writers.
 *
 * S002 only ever writes the mcp registration ([writeMcpRegistration]); the rules
 * write ([writeRulesBlock]) is published for S004 (steering) and both removals
 * for S005 (uninstall cleanup).
 */
class AiHostAdapterImpl(
    private val detector: HostDetector = HostDetector(JetBrainsHostProbes.all()),
    private val mcpWriter: JsonMcpConfigWriter = JsonMcpConfigWriter(),
    private val rulesWriter: MarkerFileWriter = MarkerFileWriter(),
) : AiHostAdapter {

    override fun detectPresent(): List<AiHost> = detector.detectPresent()

    override fun writeMcpRegistration(host: AiHost, serverEntryJson: String) {
        mcpWriter.writeInsrcServer(host.mcpConfigPath, serverEntryJson)
    }

    override fun removeMcpRegistration(host: AiHost) {
        mcpWriter.removeInsrcServer(host.mcpConfigPath)
    }

    override fun writeRulesBlock(host: AiHost, block: MarkerDelimitedBlock) {
        rulesWriter.writeBlock(host.rulesFilePath, block)
    }

    override fun removeRulesBlock(host: AiHost) {
        rulesWriter.removeBlock(host.rulesFilePath, RULES_BEGIN, RULES_END)
    }

    companion object {
        /** Shared insrc rules markers — S004 writes the steering body between them. */
        const val RULES_BEGIN = "<!-- insrc:rules:start -->"
        const val RULES_END = "<!-- insrc:rules:end -->"
    }
}
