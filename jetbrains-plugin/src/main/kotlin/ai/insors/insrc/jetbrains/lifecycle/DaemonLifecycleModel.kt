package ai.insors.insrc.jetbrains.lifecycle

/**
 * The S003-internal data model for the daemon-lifecycle policy (owns no shared
 * contract). These types are private to S003: they express the decision the
 * policy reaches on project open and the runtime/outcome of acting on it.
 */

/**
 * Which delegation target a setup action drives (Story S003).
 *
 * Closed union: INSTALL provisions an absent daemon via the installer, UPDATE
 * brings a stale daemon current via the control script. Maps 1:1 to the
 * DaemonState the sc2 probe reports (ABSENT -> INSTALL, STALE -> UPDATE).
 */
enum class ProvisionKind {
    INSTALL,
    UPDATE,
}

/**
 * Where the Node interpreter the installer runs under came from (Story S003).
 *
 * Closed union: SYSTEM = an adequate system Node was reused (ac4); PROVISIONED =
 * a private Node was provisioned under ~/.insrc/node (ac3).
 */
enum class NodeSource {
    SYSTEM,
    PROVISIONED,
}

/**
 * A resolved Node interpreter (>= NODE_MIN_MAJOR) the daemon installer runs
 * under (Story S003). Immutable; produced only by [NodeRuntimeResolver].
 *
 * @property executablePath absolute path to the `node` executable
 * @property source         whether the system Node was reused (ac4) or a private
 *                          one was provisioned (ac3)
 */
data class NodeRuntime(
    val executablePath: String,
    val source: NodeSource,
)

/**
 * The outcome of a delegated installer / daemon-ctl subprocess (Story S003).
 *
 * @property ok       true when the daemon is now present/current
 * @property exitCode the child process exit code (null on a spawn failure)
 * @property reason   a user-facing message when not ok (mapped from the
 *                    installer's documented exit codes 2/3/4), else null
 */
data class ProvisionOutcome(
    val ok: Boolean,
    val exitCode: Int? = null,
    val reason: String? = null,
)

/**
 * The policy outcome for a project-open evaluation (Story S003).
 *
 * Closed union: [NoOp] when the daemon is CURRENT; [OfferSetup] surfaces the
 * single one-click IDE action on first setup (ac1); [RunSilently] runs without
 * prompting once consent has been given (ac2). [OfferSetup]/[RunSilently] carry
 * the [ProvisionKind] (install vs update) to run.
 */
sealed interface DaemonSetupAction {
    data object NoOp : DaemonSetupAction
    data class OfferSetup(val kind: ProvisionKind) : DaemonSetupAction
    data class RunSilently(val kind: ProvisionKind) : DaemonSetupAction
}

/**
 * Raised when no adequate system Node exists AND a private Node cannot be
 * provisioned (download/verify/arch/offline failure) — Story S003.
 *
 * Surfaced so the caller notifies rather than handing the installer a bad
 * runtime (which would just hit the installer's own node-missing/too-old die path).
 */
class NodeProvisioningException(
    message: String,
    cause: Throwable? = null,
) : RuntimeException(message, cause)
