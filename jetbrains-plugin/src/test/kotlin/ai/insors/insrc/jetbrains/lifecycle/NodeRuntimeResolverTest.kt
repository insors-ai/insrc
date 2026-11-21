package ai.insors.insrc.jetbrains.lifecycle

import org.junit.jupiter.api.Assertions.*
import org.junit.jupiter.api.Test

class NodeRuntimeResolverTest {
    @Test
    fun hostNodeNeverSelectedAndProbeNeverExecuted() {
        for (version in listOf(null, "v20.0.0", "v22.22.1", "v26.0.0", "hostile")) {
            var provisions = 0
            val expected = NodeRuntime("/owned/distribution/bin/node", NodeSource.PROVISIONED)
            val resolver = DefaultNodeRuntimeResolver(SystemNodeProbe { error("host probe must not run: $version") }, PrivateNodeProvisioner { provisions++; expected })
            assertEquals(expected, resolver.resolve())
            assertEquals(1, provisions)
        }
    }
    @Test
    fun bootstrapFailureHasNoHostFallback() {
        val resolver = DefaultNodeRuntimeResolver(SystemNodeProbe { error("host fallback") }, PrivateNodeProvisioner { throw NodeProvisioningException("checksum mismatch") })
        assertEquals("checksum mismatch", assertThrows(NodeProvisioningException::class.java) { resolver.resolve() }.message)
    }
}
