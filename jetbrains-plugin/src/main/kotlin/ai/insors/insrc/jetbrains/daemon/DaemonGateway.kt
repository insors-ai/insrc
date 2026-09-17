package ai.insors.insrc.jetbrains.daemon

/**
 * Raw backend presence (Story S001 / sc2). S001 reports presence only;
 * interpreting `STALE` into an install decision is S003's internal policy.
 */
enum class DaemonState {
    /** No daemon reachable (e.g. no socket file / connection refused). */
    ABSENT,

    /** Reachable, but the daemon affirmatively reports it is behind. */
    STALE,

    /** Reachable and not reporting stale. */
    CURRENT,
}

/** Outcome of a registration attempt. `reason` is set only when not registered. */
data class RegistrationResult(
    val registered: Boolean,
    val reason: String? = null,
)

/**
 * Thrown when the daemon socket cannot be reached to answer a query or perform
 * registration. Surfaced to the caller (never swallowed) so the S003 lifecycle
 * / S005 onboarding consumers can offer setup — the gateway itself has no retry
 * or install policy of its own.
 */
class DaemonUnavailableException(
    message: String,
    cause: Throwable? = null,
) : RuntimeException(message, cause)

/**
 * sc2 (Story S001): a thin handle to the backend daemon, shared across the
 * S002 wiring / S003 lifecycle / S005 onboarding branches. Read paths never
 * allocate registry membership (k2); every method takes the active project's
 * root explicitly so one shared service scopes per project (k3).
 */
interface DaemonGateway {
    /** Read-only presence/staleness. Never throws — an unreachable daemon is [DaemonState.ABSENT]. */
    fun probe(): DaemonState

    /**
     * Whether [projectRootPath] is already a registered insrc repo. Read-only;
     * never auto-allocates.
     * @throws DaemonUnavailableException when the daemon cannot be reached.
     */
    fun isProjectRegistered(projectRootPath: String): Boolean

    /**
     * Register [projectRootPath] via the strict `repo.add` contract. Idempotent;
     * returns `{registered:false, reason}` on backend rejection, and registers
     * only that one project (never auto-allocates others, k2).
     * @throws DaemonUnavailableException when the daemon cannot be reached.
     */
    fun registerProject(projectRootPath: String): RegistrationResult
}

/**
 * One JSON-RPC round-trip to the daemon. The concrete transport
 * ([UnixSocketDaemonRpc]) opens ONLY the local Unix socket — never a cloud/REST
 * connection (k1). `call` MUST throw [DaemonUnavailableException] when the
 * socket cannot be reached, and otherwise return the daemon's reply (which may
 * be `ok=false` with an [error][DaemonResult.error]).
 */
interface DaemonRpc {
    fun call(method: String, params: Map<String, Any?>): DaemonResult
}

/** A daemon reply: `ok` = success, `data` = result fields, `error` = reason when not ok. */
data class DaemonResult(
    val ok: Boolean,
    val data: Map<String, Any?> = emptyMap(),
    val error: String? = null,
)

/**
 * The pure sc2 logic over an injectable [DaemonRpc] — unit-testable against a
 * fake socket, with the real transport supplied in production by
 * [DaemonGatewayService].
 */
class DaemonGatewayImpl(private val rpc: DaemonRpc) : DaemonGateway {

    override fun probe(): DaemonState =
        try {
            val r = rpc.call(METHOD_STATUS, emptyMap())
            // Reachable => present. Only an affirmative stale signal downgrades to STALE;
            // unknown freshness is reported as CURRENT (presence), never invented as stale.
            if (r.data[FIELD_STALE] == true) DaemonState.STALE else DaemonState.CURRENT
        } catch (e: DaemonUnavailableException) {
            DaemonState.ABSENT
        }

    override fun isProjectRegistered(projectRootPath: String): Boolean {
        // repo.list is read-only; membership is checked by path. Never calls repo.add.
        val r = rpc.call(METHOD_REPO_LIST, emptyMap())
        val repos = (r.data[FIELD_REPOS] as? Collection<*>)?.map { it.toString() } ?: emptyList()
        return projectRootPath in repos
    }

    override fun registerProject(projectRootPath: String): RegistrationResult {
        val r = rpc.call(METHOD_REPO_ADD, mapOf(PARAM_PATH to projectRootPath))
        return if (r.ok) {
            RegistrationResult(registered = true)
        } else {
            RegistrationResult(registered = false, reason = r.error ?: "registration rejected")
        }
    }

    companion object {
        const val METHOD_STATUS = "daemon.status"
        const val METHOD_REPO_LIST = "repo.list"
        const val METHOD_REPO_ADD = "repo.add"
        const val FIELD_STALE = "stale"
        const val FIELD_REPOS = "repos"
        const val PARAM_PATH = "path"
    }
}
