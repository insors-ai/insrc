package ai.insors.insrc.jetbrains.lifecycle

import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Test

/**
 * S003 type-surface unit tests (Story S003 / t1) — platform-free. They pin the
 * closed unions ([ProvisionKind], [NodeSource], [DaemonSetupAction]) to exactly
 * their declared members and assert the value types carry their LLD-named fields.
 * No behaviour is exercised here — decide/resolve/run/consent land in t2..t7.
 */
class S003TypesTest {

    @Test
    fun `ProvisionKind is the closed union of exactly INSTALL and UPDATE`() {
        assertEquals(listOf(ProvisionKind.INSTALL, ProvisionKind.UPDATE), ProvisionKind.entries.toList())
    }

    @Test
    fun `NodeSource is the closed union of exactly SYSTEM and PROVISIONED`() {
        assertEquals(listOf(NodeSource.SYSTEM, NodeSource.PROVISIONED), NodeSource.entries.toList())
    }

    @Test
    fun `DaemonSetupAction is the closed set NoOp, OfferSetup(kind), RunSilently(kind)`() {
        val actions: List<DaemonSetupAction> = listOf(
            DaemonSetupAction.NoOp,
            DaemonSetupAction.OfferSetup(ProvisionKind.INSTALL),
            DaemonSetupAction.RunSilently(ProvisionKind.UPDATE),
        )
        // OfferSetup/RunSilently carry the ProvisionKind; NoOp is a singleton
        assertEquals(ProvisionKind.INSTALL, (actions[1] as DaemonSetupAction.OfferSetup).kind)
        assertEquals(ProvisionKind.UPDATE, (actions[2] as DaemonSetupAction.RunSilently).kind)
        assertEquals(DaemonSetupAction.NoOp, actions[0])
    }

    @Test
    fun `NodeRuntime carries executablePath and source`() {
        val rt = NodeRuntime(executablePath = "/usr/bin/node", source = NodeSource.SYSTEM)
        assertEquals("/usr/bin/node", rt.executablePath)
        assertEquals(NodeSource.SYSTEM, rt.source)
        assertEquals(rt, NodeRuntime("/usr/bin/node", NodeSource.SYSTEM))
    }

    @Test
    fun `ProvisionOutcome carries ok, optional exitCode and reason`() {
        val ok = ProvisionOutcome(ok = true)
        assertEquals(true, ok.ok)
        assertEquals(null, ok.exitCode)
        assertEquals(null, ok.reason)
        val fail = ProvisionOutcome(ok = false, exitCode = 4, reason = "git/npm/build failed")
        assertEquals(false, fail.ok)
        assertEquals(4, fail.exitCode)
        assertEquals("git/npm/build failed", fail.reason)
    }

    @Test
    fun `NodeProvisioningException is a RuntimeException carrying its message`() {
        val e = NodeProvisioningException("offline")
        assertEquals(true, e is RuntimeException)
        assertEquals("offline", e.message)
    }
}
