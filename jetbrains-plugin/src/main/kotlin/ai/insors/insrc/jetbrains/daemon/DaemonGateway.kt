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
 * One pending-approval artifact descriptor, forwarded VERBATIM from the daemon's
 * `workflow.pending` reply (Story S001 / sc1, k1 — the plugin does no approval
 * classification of its own; the daemon is the single source of truth). Optional
 * daemon fields (`workItemId`) stay nullable; `mdPath` may be empty when the
 * daemon could not resolve the rendered path.
 */
data class PendingArtifactDto(
    val artifactId: String,
    val kind: String,
    val title: String,
    val mdPath: String,
    val workItemId: String?,
    val openQuestionCount: Int,
    val state: String,
)

/**
 * The result of a pending-artifact query (Story S001 / sc1). Two-state by
 * design: an empty [Available] list ("nothing awaiting review") is DISTINCT from
 * [Unavailable] (the backing daemon could not be reached / errored) — the panel
 * must never blank an unreachable daemon to an empty list (k1, ac2/ac3).
 */
sealed interface PendingQueryResult {
    /** The daemon answered; [artifacts] is the pending set (possibly empty). */
    data class Available(val artifacts: List<PendingArtifactDto>) : PendingQueryResult

    /** The daemon was unreachable or returned an error; [reason] explains why. */
    data class Unavailable(val reason: String) : PendingQueryResult
}

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

    /**
     * The pending-approval artifacts for [projectRootPath] (Story S001 / sc1).
     * A thin forward of the daemon's `workflow.pending` reply — NO client-side
     * approval classification (k1). Unlike the registration reads, this method
     * does NOT throw: an unreachable or error-returning daemon maps to
     * [PendingQueryResult.Unavailable] so the poll loop keeps the last-known
     * surface and the panel shows a distinct "backing service unavailable"
     * state (never a blank/empty list, ac2).
     */
    fun pendingArtifacts(projectRootPath: String): PendingQueryResult
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

    override fun pendingArtifacts(projectRootPath: String): PendingQueryResult =
        try {
            val r = rpc.call(METHOD_WORKFLOW_PENDING, mapOf(PARAM_REPO to projectRootPath))
            if (!r.ok || r.error != null) {
                // An error reply (repo-unresolved / store-unreadable) is Unavailable,
                // never an empty Available — the panel must not blank it out (k1, ac2).
                PendingQueryResult.Unavailable(r.error ?: "workflow.pending returned an error")
            } else {
                PendingQueryResult.Available(parseArtifacts(r.data[FIELD_ARTIFACTS]))
            }
        } catch (e: DaemonUnavailableException) {
            // Socket down => Unavailable, not Available(emptyList) (ac2).
            PendingQueryResult.Unavailable(e.message ?: "daemon unavailable")
        } catch (e: RuntimeException) {
            // Defense-in-depth for the background poll: any unexpected transport
            // fault (e.g. a malformed reply) surfaces as Unavailable rather than
            // killing the poll thread — never a silent empty list (ac2).
            PendingQueryResult.Unavailable(e.message ?: "unexpected daemon fault")
        }

    companion object {
        const val METHOD_STATUS = "daemon.status"
        const val METHOD_REPO_LIST = "repo.list"
        const val METHOD_REPO_ADD = "repo.add"
        const val METHOD_WORKFLOW_PENDING = "workflow.pending"
        const val FIELD_STALE = "stale"
        const val FIELD_REPOS = "repos"
        const val FIELD_ARTIFACTS = "artifacts"
        const val PARAM_PATH = "path"
        const val PARAM_REPO = "repo"

        /**
         * Map the daemon's raw `artifacts` payload to DTOs, forwarding every
         * field verbatim (k1). A non-list payload yields an empty list; a
         * non-map entry is skipped. JSON numbers arrive as [Number] — coerced
         * to Int for `openQuestionCount`.
         */
        private fun parseArtifacts(raw: Any?): List<PendingArtifactDto> {
            val list = raw as? List<*> ?: return emptyList()
            return list.mapNotNull { item ->
                val m = item as? Map<*, *> ?: return@mapNotNull null
                PendingArtifactDto(
                    artifactId = str(m["artifactId"]),
                    kind = str(m["kind"]),
                    title = str(m["title"]),
                    mdPath = str(m["mdPath"]),
                    workItemId = (m["workItemId"] as? String)?.takeIf { it.isNotEmpty() },
                    openQuestionCount = (m["openQuestionCount"] as? Number)?.toInt() ?: 0,
                    state = str(m["state"]),
                )
            }
        }

        private fun str(v: Any?): String = (v as? String) ?: ""
    }
}
