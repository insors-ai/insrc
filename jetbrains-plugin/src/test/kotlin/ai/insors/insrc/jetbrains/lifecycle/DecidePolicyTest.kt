package ai.insors.insrc.jetbrains.lifecycle

import ai.insors.insrc.jetbrains.daemon.DaemonState
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Test

/**
 * sc-internal decide-policy unit tests (Story S003 / t2) — platform-free. They
 * exercise the full (DaemonState x consented) truth table so the ac1 prompt-once
 * / ac2 silent / CURRENT-no-op policy is pinned exhaustively.
 */
class DecidePolicyTest {

    private fun decide(state: DaemonState, consented: Boolean) =
        DefaultDaemonSetupPolicy.decide(state, consented)

    @Test
    fun truthTable_allSixCells() {
        // CURRENT -> NoOp regardless of consent
        assertEquals(DaemonSetupAction.NoOp, decide(DaemonState.CURRENT, false))
        assertEquals(DaemonSetupAction.NoOp, decide(DaemonState.CURRENT, true))

        // ABSENT: prompt install first (ac1), silent install once consented (ac2)
        assertEquals(DaemonSetupAction.OfferSetup(ProvisionKind.INSTALL), decide(DaemonState.ABSENT, false))
        assertEquals(DaemonSetupAction.RunSilently(ProvisionKind.INSTALL), decide(DaemonState.ABSENT, true))

        // STALE: prompt update first (ac1), silent update once consented (ac2)
        assertEquals(DaemonSetupAction.OfferSetup(ProvisionKind.UPDATE), decide(DaemonState.STALE, false))
        assertEquals(DaemonSetupAction.RunSilently(ProvisionKind.UPDATE), decide(DaemonState.STALE, true))
    }
}
