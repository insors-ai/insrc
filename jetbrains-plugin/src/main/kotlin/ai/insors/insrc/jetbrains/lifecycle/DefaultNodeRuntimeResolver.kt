package ai.insors.insrc.jetbrains.lifecycle

/**
 * The minimum Node major the daemon installer requires (Story S003).
 *
 * Mirrors NODE_MIN_MAJOR in scripts/insrc-daemon-install.sh (line 53): the
 * installer dies if `node` is absent or older than this, so the resolver must
 * hand it a Node whose major is at least this value (lc1/k5).
 */
const val NODE_MIN_MAJOR: Int = 20

/** A detected system Node: its executable and the raw `node -v` output. */
data class SystemNode(
    val executablePath: String,
    val versionOutput: String,
)

/**
 * Injectable seam over the system `node` (Story S003 / t4): returns the detected
 * system Node, or `null` when none is on PATH. A real implementation runs
 * `node -v`; tests provide a fake so the tiered policy is verifiable with no
 * real process.
 */
fun interface SystemNodeProbe {
    fun detect(): SystemNode?
}

/**
 * The tiered runtime resolver policy (Story S003 / t4): reuse the system Node
 * when adequate (ac4), otherwise dispatch to the injected [PrivateNodeProvisioner]
 * (ac3). Pure over its two injected seams — it holds NO download logic itself
 * (that is t5's [PrivateNodeProvisioner]).
 */
class DefaultNodeRuntimeResolver(
    private val systemNodeProbe: SystemNodeProbe,
    private val privateNodeProvisioner: PrivateNodeProvisioner,
) : NodeRuntimeResolver {

    override fun resolve(): NodeRuntime {
        val system = systemNodeProbe.detect()
        val major = system?.let { parseMajor(it.versionOutput) }
        return if (system != null && major != null && major >= NODE_MIN_MAJOR) {
            // ac4: adequate system Node reused; the provisioner is never invoked.
            NodeRuntime(executablePath = system.executablePath, source = NodeSource.SYSTEM)
        } else {
            // ac3: absent / too old / unparseable -> provision a private Node.
            // A provisioner failure propagates as NodeProvisioningException so the
            // caller notifies rather than handing the installer a bad runtime.
            privateNodeProvisioner.ensurePrivateNode()
        }
    }

    companion object {
        /**
         * Parse the major version from a `node -v` string like `v20.11.1`, or
         * `null` when it is absent/unrecognisable (fail-safe: treated as NOT
         * adequate, so the resolver provisions rather than trusting a runtime it
         * cannot verify).
         */
        fun parseMajor(versionOutput: String?): Int? {
            val trimmed = versionOutput?.trim()?.removePrefix("v") ?: return null
            val majorText = trimmed.substringBefore('.', missingDelimiterValue = "")
            return majorText.toIntOrNull()
        }
    }
}
