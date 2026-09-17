package ai.insors.insrc.jetbrains.lifecycle

import ai.insors.insrc.jetbrains.daemon.DaemonState

/**
 * The default staleness/consent policy (Story S003 / t2) — a pure total function
 * of the sc2 [DaemonState] and the persisted consent, with NO IO:
 *
 *  - CURRENT               -> NoOp (regardless of consent)
 *  - ABSENT, !consented    -> OfferSetup(INSTALL)   (ac1: prompt once)
 *  - ABSENT, consented     -> RunSilently(INSTALL)  (ac2: silent thereafter)
 *  - STALE,  !consented    -> OfferSetup(UPDATE)     (ac1)
 *  - STALE,  consented     -> RunSilently(UPDATE)    (ac2)
 *
 * It consumes sc2's DaemonState; it never re-implements the probe.
 */
object DefaultDaemonSetupPolicy : DaemonSetupPolicy {
    override fun decide(state: DaemonState, consented: Boolean): DaemonSetupAction =
        when (state) {
            DaemonState.CURRENT -> DaemonSetupAction.NoOp
            DaemonState.ABSENT -> gate(ProvisionKind.INSTALL, consented)
            DaemonState.STALE -> gate(ProvisionKind.UPDATE, consented)
        }

    /** Prompt on first setup (ac1); run silently once consent is given (ac2). */
    private fun gate(kind: ProvisionKind, consented: Boolean): DaemonSetupAction =
        if (consented) DaemonSetupAction.RunSilently(kind) else DaemonSetupAction.OfferSetup(kind)
}
