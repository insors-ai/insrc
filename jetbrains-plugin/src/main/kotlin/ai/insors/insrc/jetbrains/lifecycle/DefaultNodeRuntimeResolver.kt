package ai.insors.insrc.jetbrains.lifecycle

/** Retained injectable probe shape for callers migrating from the old resolver. */
data class SystemNode(val executablePath: String, val versionOutput: String)
fun interface SystemNodeProbe { fun detect(): SystemNode? }

/** The shared verified provisioner is authoritative regardless of host Node. */
class DefaultNodeRuntimeResolver(
    @Suppress("UNUSED_PARAMETER") systemNodeProbe: SystemNodeProbe,
    private val privateNodeProvisioner: PrivateNodeProvisioner,
) : NodeRuntimeResolver {
    override fun resolve(): NodeRuntime = privateNodeProvisioner.ensurePrivateNode()
}
