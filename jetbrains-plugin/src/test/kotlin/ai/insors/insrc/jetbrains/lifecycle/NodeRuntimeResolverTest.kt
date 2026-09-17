package ai.insors.insrc.jetbrains.lifecycle

import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertFalse
import org.junit.jupiter.api.Assertions.assertThrows
import org.junit.jupiter.api.Test

/**
 * sc-internal tiered-resolver unit tests (Story S003 / t4) — platform-free. They
 * drive DefaultNodeRuntimeResolver over a fake system-Node probe and a recording
 * fake PrivateNodeProvisioner, proving ac4 (reuse system Node, never provision)
 * and ac3 (no adequate system Node -> provisioned), plus the boundary and
 * fail-safe cases. No real process, no real download.
 */
class NodeRuntimeResolverTest {

    private class RecordingProvisioner(
        private val result: () -> NodeRuntime,
    ) : PrivateNodeProvisioner {
        var invoked = 0
        override fun ensurePrivateNode(): NodeRuntime {
            invoked++
            return result()
        }
    }

    private val provisioned = NodeRuntime("/home/dev/.insrc/node/bin/node", NodeSource.PROVISIONED)

    private fun resolver(systemVersion: String?, provisioner: RecordingProvisioner): DefaultNodeRuntimeResolver {
        val probe = SystemNodeProbe {
            systemVersion?.let { SystemNode(executablePath = "/usr/bin/node", versionOutput = it) }
        }
        return DefaultNodeRuntimeResolver(probe, provisioner)
    }

    @Test
    fun adequateSystemNode_sourceSYSTEM_provisionerNeverInvoked() {
        val prov = RecordingProvisioner { provisioned }
        val rt = resolver("v22.3.0", prov).resolve()
        assertEquals(NodeSource.SYSTEM, rt.source)
        assertEquals("/usr/bin/node", rt.executablePath)
        assertEquals(0, prov.invoked, "an adequate system Node must never trigger provisioning (ac4)")
    }

    @Test
    fun boundaryEqualsMin_adequate_and_unparseableOrAbsent_dispatchesToProvisioner() {
        // boundary: major == NODE_MIN_MAJOR is adequate -> SYSTEM, no provisioning
        val provBoundary = RecordingProvisioner { provisioned }
        val boundary = resolver("v$NODE_MIN_MAJOR.0.0", provBoundary).resolve()
        assertEquals(NodeSource.SYSTEM, boundary.source)
        assertEquals(0, provBoundary.invoked)

        // unparseable `node -v` -> fail-safe: treated as not adequate -> provision
        val provUnparseable = RecordingProvisioner { provisioned }
        val unparseable = resolver("not-a-version", provUnparseable).resolve()
        assertEquals(NodeSource.PROVISIONED, unparseable.source)
        assertEquals(1, provUnparseable.invoked)

        // absent system Node -> provision
        val provAbsent = RecordingProvisioner { provisioned }
        val absent = resolver(null, provAbsent).resolve()
        assertEquals(NodeSource.PROVISIONED, absent.source)
        assertEquals(1, provAbsent.invoked)
    }

    @Test
    fun noAdequateSystemNode_returnsProvisionedNode_and_provisionerFailure_propagates() {
        // too old system Node -> provisioned (ac3)
        val prov = RecordingProvisioner { provisioned }
        val rt = resolver("v18.19.0", prov).resolve()
        assertEquals(NodeSource.PROVISIONED, rt.source)
        assertEquals("/home/dev/.insrc/node/bin/node", rt.executablePath)
        assertEquals(1, prov.invoked)

        // provisioner failure surfaces as NodeProvisioningException
        val failing = RecordingProvisioner { throw NodeProvisioningException("offline") }
        assertThrows(NodeProvisioningException::class.java) {
            resolver(null, failing).resolve()
        }
    }

    @Test
    fun parseMajor_handlesVPrefixAndGarbage() {
        assertEquals(20, DefaultNodeRuntimeResolver.parseMajor("v20.11.1"))
        assertEquals(22, DefaultNodeRuntimeResolver.parseMajor(" v22.0.0\n"))
        assertFalse(DefaultNodeRuntimeResolver.parseMajor("garbage") != null)
        assertFalse(DefaultNodeRuntimeResolver.parseMajor(null) != null)
    }
}
