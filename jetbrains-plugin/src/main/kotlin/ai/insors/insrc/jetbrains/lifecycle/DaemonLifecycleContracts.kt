package ai.insors.insrc.jetbrains.lifecycle

import ai.insors.insrc.jetbrains.daemon.DaemonState

/**
 * The S003-internal service seams for the daemon-lifecycle policy (Story S003).
 * All are internal to S003 (it owns no shared contract); each is an injectable
 * interface so the policy, resolver, provisioner and consent store are
 * unit-testable with fakes, matching the S001/S002 injectable-deps convention.
 */

/**
 * The pure staleness/consent policy: maps the sc2 [DaemonState] and the persisted
 * consent to exactly one [DaemonSetupAction] (Story S003 / t2). No IO.
 */
fun interface DaemonSetupPolicy {
    fun decide(state: DaemonState, consented: Boolean): DaemonSetupAction
}

/**
 * Ensures (provisions or reuses) a verified pinned local Node under the insrc
 * home (Story S003 / t5). The injectable seam behind [NodeRuntimeResolver] so the
 * owned-runtime policy is testable without a real download.
 *
 * @throws NodeProvisioningException when a private Node cannot be provided.
 */
fun interface PrivateNodeProvisioner {
    fun ensurePrivateNode(): NodeRuntime
}

/**
 * Resolves the Node interpreter the installer runs under (Story S003 / t4):
 * always dispatch to the shared verified
 * [PrivateNodeProvisioner] (ac3).
 *
 * @throws NodeProvisioningException when the verified local runtime is unavailable.
 */
fun interface NodeRuntimeResolver {
    fun resolve(): NodeRuntime
}

/**
 * Delegates install/update to the existing backend tooling (Story S003 / t6):
 * INSTALL -> insrc-daemon-install.sh, UPDATE -> daemon-ctl.sh update, run under
 * the resolved [NodeRuntime]. Captures the outcome (never reproduces the
 * installer's clone/build logic — lc1/k5).
 */
fun interface DaemonProvisioner {
    fun run(kind: ProvisionKind, node: NodeRuntime): ProvisionOutcome
}

/**
 * The app-scoped, persisted one-time-consent gate (Story S003 / t3): the first
 * setup prompts (ac1), and once consent is recorded later staleness is brought
 * current silently (ac2).
 */
interface SetupConsentStore {
    fun isConsented(): Boolean
    fun recordConsent()
}
