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
 * One open question projected from an artifact's body + resolutions (Story S002
 * / sc2), forwarded VERBATIM from the daemon's `workflow.artifactContent` reply.
 * `status` is one of open / resolved / ignored / deferred.
 */
data class OpenQuestionDto(
    val id: String,
    val text: String,
    val status: String,
)

/**
 * The read-only review view of one artifact (Story S002 / sc2), forwarded
 * VERBATIM from the daemon (k1 — the plugin renders + transports, it does not
 * classify approval). [renderedMarkdown] is the artifact's OWN .md content
 * (no divergent second copy, k5); [approvable] is false when a review
 * block-verdict stands, with [blockReason] explaining it (surfaced by s5).
 */
data class ArtifactReviewViewDto(
    val artifactId: String,
    val kind: String,
    val renderedMarkdown: String,
    val openQuestions: List<OpenQuestionDto>,
    val approvable: Boolean,
    val blockReason: String?,
)

/**
 * The result of an artifact-content fetch (Story S002 / sc2). Two-state like
 * [PendingQueryResult]: a [Loaded] view is DISTINCT from [Unavailable] (the
 * daemon could not be reached / errored) — the content pane must never blank an
 * unreachable/errored fetch to empty content (k1, ac2).
 */
sealed interface ArtifactContentResult {
    /** The daemon answered; [view] is the artifact's review view. */
    data class Loaded(val view: ArtifactReviewViewDto) : ArtifactContentResult

    /** The daemon was unreachable or returned an error; [reason] explains why. */
    data class Unavailable(val reason: String) : ArtifactContentResult
}

/**
 * One inline comment sent to the daemon for recording (Story S004 / sc3). The
 * wire shape of an un-submitted [CommentBuffer][ai.insors.insrc.jetbrains.review.CommentBuffer]
 * comment: an id, an anchor, and a non-empty body. Forwarded VERBATIM; the
 * daemon owns the mapping onto open-question resolutions (k1).
 */
data class CommentAnchorDto(
    val sectionPath: String? = null,
    val quote: String? = null,
    val openQuestionId: String? = null,
)

data class ReviewCommentDto(
    val id: String,
    val anchor: CommentAnchorDto,
    val body: String,
)

/** One recorded resolution reported back per comment (Story S004 / sc3). */
data class ResolvedCommentDto(
    val openQuestionId: String?,
    val status: String,
)

/**
 * The result of submitting comments for recording (Story S004 / sc3). Two-state
 * like [ArtifactContentResult]: [Recorded] is DISTINCT from [Unavailable] (the
 * daemon was unreachable OR returned an error). The plugin NEVER treats an
 * error reply as success (the S001 framing invariant): only a [Recorded] with
 * `recorded == submitted` lets the panel clear the buffer (ac3).
 */
sealed interface ResolveCommentResult {
    /** The daemon recorded [recorded] comments; [resolutions] reports each. */
    data class Recorded(val recorded: Int, val resolutions: List<ResolvedCommentDto>) : ResolveCommentResult

    /** The daemon was unreachable or returned an error; [reason] explains why. */
    data class Unavailable(val reason: String) : ResolveCommentResult
}

/**
 * The result of approving one artifact from the IDE (Story S005). Three-state,
 * mirroring S002's ArtifactContentResult and S004's ResolveCommentResult, and
 * classified from the daemon's workflow.approve reply: the block-verdict gate is
 * NON-LOSSY and NOT an error, so a review-blocked artifact (in the reply's
 * skipped[]) becomes [Withheld], DISTINCT from an approval ([Approved]) and from
 * a failure ([Unavailable]). The plugin NEVER treats a withheld/errored reply as
 * approved (k1/k3).
 */
sealed interface ApproveResult {
    /** The artifact was approved (its approvedAt stamped daemon-side). */
    data object Approved : ApproveResult

    /** The review block-verdict gate withheld approval; [reason] is the gate reason. */
    data class Withheld(val reason: String) : ApproveResult

    /** The daemon was unreachable or the approve could not be applied; [reason] explains why. */
    data class Unavailable(val reason: String) : ApproveResult
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
 * One recognized reasoning role + its default tier (Story S002 / sc1), forwarded
 * verbatim from the config.catalog payload's `roles`. Rendered by the per-role
 * override editor (S004); carried here as part of the shared settings DTO.
 */
data class RoleDto(
    val id: String,
    val defaultTier: String,
)

/**
 * One enriched catalog row + its resolved current value (Story S002 / sc1),
 * mirroring the daemon's ConfigOption plus the folded-in current value.
 * [isSet] is true iff the payload's `values` map contained this path (so
 * [currentValue] is meaningful); false means the setting is unset / using its
 * default. [enumValues] is present only for `type == "enum"` rows.
 */
data class ConfigOptionDto(
    val path: String,
    val type: String,
    val default: Any?,
    val desc: String,
    val enumValues: List<String>?,
    val group: String,
    val currentValue: Any?,
    val isSet: Boolean,
)

/**
 * The plugin mirror of the daemon's config.catalog payload (Story S002 / sc1):
 * every recognized setting, the distinct group labels (in catalog order), the
 * recognized roles + their default tiers, and the allowed tier names. Everything
 * is forwarded verbatim from the daemon — the plugin hardcodes no setting,
 * group, role, or tier (k1/lc1).
 */
data class SettingsCatalogDto(
    val groups: List<String>,
    val options: List<ConfigOptionDto>,
    val roles: List<RoleDto>,
    val tierNames: List<String>,
)

/**
 * The result of a config.catalog read (Story S002 / sc1). Two-state by design,
 * mirroring [ArtifactContentResult]: a [Loaded] catalog is DISTINCT from
 * [Unavailable] (the daemon was unreachable / errored / replied malformed), so
 * the settings page never blanks an unreachable daemon into an empty form
 * (k3, ac3, the S001 result.error framing).
 */
sealed interface SettingsCatalogResult {
    /** The daemon described its settings; [catalog] is the payload. */
    data class Loaded(val catalog: SettingsCatalogDto) : SettingsCatalogResult

    /** The daemon was unreachable / errored / replied malformed; [reason] explains. */
    data class Unavailable(val reason: String) : SettingsCatalogResult
}

/**
 * The result of a settings write/clear (Story S003 / sc2). THREE-state by design:
 * a persisted [Saved] is distinct from a [Rejected] (the daemon refused the
 * path/value — config.write replied ok=false) and from [Unavailable] (the daemon
 * was unreachable / errored / a transport fault). This lets the settings page
 * preserve the pending edit and surface the failure rather than reporting a
 * false success (k3, ac4, the S001 result.error framing).
 */
sealed interface SaveResult {
    /** config.write persisted the change and reloaded active sessions. */
    data object Saved : SaveResult

    /** The daemon refused the write (ok=false — e.g. an invalid/empty path). */
    data class Rejected(val reason: String) : SaveResult

    /** The daemon was unreachable / errored / a transport fault; [reason] explains. */
    data class Unavailable(val reason: String) : SaveResult
}

/**
 * The result of reading the current per-role overrides (Story S004). Two-state,
 * mirroring [SettingsCatalogResult]: a [Loaded] map (roleId -> tierName, the
 * daemon's models.tasks) is DISTINCT from [Unavailable] (the daemon was
 * unreachable / a transport fault), so the per-role section never blanks an
 * unreachable daemon into an empty (= "no overrides") list. A legitimately-empty
 * override map is Loaded(emptyMap), not Unavailable.
 */
sealed interface PerRoleOverridesResult {
    /** The daemon's current per-role overrides: roleId -> tier. Empty = no overrides. */
    data class Loaded(val overrides: Map<String, String>) : PerRoleOverridesResult

    /** The daemon was unreachable / errored; [reason] explains. */
    data class Unavailable(val reason: String) : PerRoleOverridesResult
}

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

    /**
     * The review view of one pending artifact identified by its [mdPath] (Story
     * S002 / sc2). A thin forward of the daemon's `workflow.artifactContent`
     * reply — NO client-side rendering of approval state (k1). Like
     * [pendingArtifacts] it does NOT throw: an unreachable or error-returning
     * daemon maps to [ArtifactContentResult.Unavailable] so the content pane
     * shows a distinct 'content unavailable' state, never a blank (ac2).
     */
    fun artifactReviewView(projectRootPath: String, mdPath: String): ArtifactContentResult

    /**
     * Submit [comments] to be recorded against the artifact named by [artifactId]
     * as open-question resolutions (Story S004 / sc3). A thin forward of the
     * daemon's `workflow.resolveComment` reply — NO client-side resolution
     * reasoning (k1). Like the read paths it does NOT throw: an unreachable or
     * error-returning daemon maps to [ResolveCommentResult.Unavailable] so the
     * panel keeps the un-submitted buffer and surfaces the failure (ac3), never
     * treating an error as a silent success (the S001 framing invariant).
     */
    fun resolveComment(
        projectRootPath: String,
        artifactId: String,
        comments: List<ReviewCommentDto>,
    ): ResolveCommentResult

    /**
     * Approve the artifact at [mdPath] through the EXISTING workflow.approve path
     * (Story S005 / k3). [mdPath] is the sc1 descriptor's path, which is ABSOLUTE
     * (workflow.pending emits an absolute path) — it is forwarded as the absolute
     * artifactPath unchanged (a relative one is joined onto [projectRootPath]);
     * [overrideReason] is sent as overrideReview when non-null. A
     * thin forward + classification of the reply — NO client approval reasoning
     * (k1). Like the other read/write paths it does NOT throw: it returns
     * [ApproveResult.Approved] (approved[] non-empty), [ApproveResult.Withheld]
     * (skipped[] — the block gate, ok=true), or [ApproveResult.Unavailable] (a
     * non-ok reply / DaemonUnavailable / a malformed or empty reply). A withheld
     * or errored reply is NEVER read as approved (the k3 gate fidelity).
     */
    fun approve(
        projectRootPath: String,
        mdPath: String,
        overrideReason: String? = null,
    ): ApproveResult

    /**
     * Read the self-describing settings catalog (Story S002 / sc1) over the
     * read-only `config.catalog` IPC. No params — the catalog is global. A
     * framed error / unreachable daemon / malformed reply is
     * [SettingsCatalogResult.Unavailable], never a blank [SettingsCatalogResult.Loaded].
     */
    fun settingsCatalog(): SettingsCatalogResult

    /**
     * Persist an edited setting (Story S003 / sc2) via the segment-aware
     * `config.write` IPC. [pathSegments] are LITERAL key segments (never a dotted
     * string) so a dotted dynamic key is never mis-nested (k4); [value] is the
     * already-parsed, type-correct value (Boolean/number/String). Returns a
     * [SaveResult] — never throws: ok=true is [SaveResult.Saved], ok=false is
     * [SaveResult.Rejected], and an unreachable/errored daemon is
     * [SaveResult.Unavailable] (k3, ac4).
     *
     * NOTE: passing a null [value] is equivalent to [clearSetting] — the wire
     * serialization omits an absent/null value so the daemon drops the leaf rather
     * than storing JSON null. Callers that need to persist an actual null must not
     * use this method (no S003 path does; the edit model never yields Set(null)).
     */
    fun writeSetting(pathSegments: List<String>, value: Any?): SaveResult

    /**
     * Remove a setting key (Story S003 / sc2) via `config.write` with the `value`
     * field OMITTED — the daemon then drops the leaf, so the setting reverts to
     * the daemon default (reset-to-default for a global setting; override removal
     * for s4/s5). Same [SaveResult] classification as [writeSetting].
     */
    fun clearSetting(pathSegments: List<String>): SaveResult

    /**
     * Read the current per-role model overrides (Story S004) — the daemon's
     * `models.tasks` { roleId -> tier } map — over the EXISTING `config.show` IPC.
     * These dynamic keys are not in the sc1 catalog `values`, so this is a separate
     * read. Returns [PerRoleOverridesResult.Loaded] (empty when none configured) or
     * [PerRoleOverridesResult.Unavailable] on an unreachable/errored daemon; never
     * throws.
     */
    fun perRoleOverrides(): PerRoleOverridesResult
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

    override fun artifactReviewView(projectRootPath: String, mdPath: String): ArtifactContentResult =
        try {
            val r = rpc.call(METHOD_WORKFLOW_ARTIFACT_CONTENT, mapOf(PARAM_REPO to projectRootPath, PARAM_MD_PATH to mdPath))
            if (!r.ok || r.error != null) {
                // An error reply (repo/path-invalid / unreadable) is Unavailable,
                // never a blank Loaded view (k1, ac2).
                ArtifactContentResult.Unavailable(r.error ?: "workflow.artifactContent returned an error")
            } else {
                ArtifactContentResult.Loaded(parseView(r.data))
            }
        } catch (e: DaemonUnavailableException) {
            ArtifactContentResult.Unavailable(e.message ?: "daemon unavailable")
        } catch (e: RuntimeException) {
            // Defense-in-depth: any unexpected transport fault surfaces as
            // Unavailable rather than crashing the content-view open (ac2).
            ArtifactContentResult.Unavailable(e.message ?: "unexpected daemon fault")
        }

    override fun resolveComment(
        projectRootPath: String,
        artifactId: String,
        comments: List<ReviewCommentDto>,
    ): ResolveCommentResult =
        try {
            val r = rpc.call(
                METHOD_WORKFLOW_RESOLVE_COMMENT,
                mapOf(
                    PARAM_REPO to projectRootPath,
                    PARAM_ARTIFACT_ID to artifactId,
                    PARAM_COMMENTS to comments.map(::commentToMap),
                ),
            )
            if (!r.ok || r.error != null) {
                // An error reply (unsupported/malformed artifactId, unreadable
                // artifact, a mid-batch write failure) is Unavailable, never a
                // silent success — the panel keeps the buffer (k1, ac3, S001 framing).
                ResolveCommentResult.Unavailable(r.error ?: "workflow.resolveComment returned an error")
            } else {
                ResolveCommentResult.Recorded(
                    recorded = (r.data["recorded"] as? Number)?.toInt() ?: 0,
                    resolutions = parseResolutions(r.data["resolutions"]),
                )
            }
        } catch (e: DaemonUnavailableException) {
            ResolveCommentResult.Unavailable(e.message ?: "daemon unavailable")
        } catch (e: RuntimeException) {
            // Defense-in-depth: any unexpected transport fault surfaces as
            // Unavailable rather than crashing Submit (ac3).
            ResolveCommentResult.Unavailable(e.message ?: "unexpected daemon fault")
        }

    override fun approve(
        projectRootPath: String,
        mdPath: String,
        overrideReason: String?,
    ): ApproveResult =
        try {
            // workflow.pending emits an ABSOLUTE mdPath (resolveArtifactMdPath ->
            // join(repoPath, 'docs', ...)), and workflow.approve treats artifactPath
            // as an absolute, repo-independent path. So pass an absolute mdPath
            // THROUGH — prefixing projectRootPath would double the repo prefix and
            // the artifact would never be found. Only a (defensive) relative mdPath
            // is joined onto the repo root.
            val artifactPath = if (java.io.File(mdPath).isAbsolute) mdPath else "$projectRootPath/$mdPath"
            val params = buildMap<String, Any?> {
                put(PARAM_REPO, projectRootPath)
                put(PARAM_ARTIFACT_PATH, artifactPath)
                overrideReason?.let { put(PARAM_OVERRIDE_REVIEW, it) }
            }
            val r = rpc.call(METHOD_WORKFLOW_APPROVE, params)
            if (!r.ok || r.error != null) {
                // A non-ok reply (missing artifact / {error}) is Unavailable
                // (k1, k3, S001 framing) — never a silent Approved.
                ApproveResult.Unavailable(r.error ?: "workflow.approve returned an error")
            } else {
                classifyApprove(r.data)
            }
        } catch (e: DaemonUnavailableException) {
            ApproveResult.Unavailable(e.message ?: "daemon unavailable")
        } catch (e: RuntimeException) {
            // Defense-in-depth: any unexpected transport fault surfaces as
            // Unavailable rather than crashing the Approve action.
            ApproveResult.Unavailable(e.message ?: "unexpected daemon fault")
        }

    override fun settingsCatalog(): SettingsCatalogResult =
        try {
            val r = rpc.call(METHOD_CONFIG_CATALOG, emptyMap())
            if (!r.ok || r.error != null) {
                // A framed error reply is Unavailable, never a blank Loaded (k3, ac3, S001 framing).
                SettingsCatalogResult.Unavailable(r.error ?: "config.catalog returned an error")
            } else {
                SettingsCatalogResult.Loaded(parseCatalog(r.data))
            }
        } catch (e: DaemonUnavailableException) {
            SettingsCatalogResult.Unavailable(e.message ?: "daemon unavailable")
        } catch (e: RuntimeException) {
            // Defense-in-depth: a malformed reply (e.g. options not a list) or any
            // unexpected transport fault surfaces as Unavailable rather than crashing
            // the Settings page open (ac3) — never a partially-parsed Loaded.
            SettingsCatalogResult.Unavailable(e.message ?: "unexpected daemon fault")
        }

    override fun writeSetting(pathSegments: List<String>, value: Any?): SaveResult =
        // A SET carries the value; the segments go through verbatim as config.write's
        // literal `path` array so a dotted dynamic key is never mis-nested (k4).
        configWrite(mapOf(PARAM_PATH to pathSegments, PARAM_VALUE to value))

    override fun clearSetting(pathSegments: List<String>): SaveResult =
        // A CLEAR OMITS `value` entirely — the daemon assigns undefined and
        // JSON.stringify drops the leaf, removing the key (reset-to-default). k4.
        configWrite(mapOf(PARAM_PATH to pathSegments))

    /**
     * The shared sc2 write path: one config.write round-trip classified into the
     * three-state [SaveResult]. config.write's handler returns its own business
     * flag INSIDE the result envelope — {ok:true} on success, a BARE {ok:false}
     * on a refused path (NOT a framed result.error). So the transport-level
     * [DaemonResult.ok] is true for both; the daemon's verdict is the `ok` field
     * in [DaemonResult.data]. Classification:
     *   - a thrown/socket fault (DaemonUnavailableException / RuntimeException) -> Unavailable;
     *   - a transport/framed error (r.ok=false or r.error != null — an unexpected
     *     handler throw) -> Rejected;
     *   - data.ok == true -> Saved; otherwise (a returned {ok:false}) -> Rejected.
     * Never throws, never a false Saved (ac4).
     */
    private fun configWrite(params: Map<String, Any?>): SaveResult =
        try {
            val r = rpc.call(METHOD_CONFIG_WRITE, params)
            when {
                !r.ok || r.error != null ->
                    // An unexpected handler throw framed as an error reply.
                    SaveResult.Rejected(r.error ?: "the daemon rejected the write")
                r.data["ok"] == true -> SaveResult.Saved
                else ->
                    // config.write returned a bare {ok:false} (refused path/value);
                    // it carries no error string, so fall back to a generic reason —
                    // never a silent/false success.
                    SaveResult.Rejected((r.data["error"] as? String)?.takeIf { it.isNotEmpty() }
                        ?: "the daemon rejected the write")
            }
        } catch (e: DaemonUnavailableException) {
            SaveResult.Unavailable(e.message ?: "daemon unavailable")
        } catch (e: RuntimeException) {
            // Defense-in-depth: any unexpected transport fault surfaces as
            // Unavailable rather than crashing Apply (ac4).
            SaveResult.Unavailable(e.message ?: "unexpected daemon fault")
        }

    override fun perRoleOverrides(): PerRoleOverridesResult =
        try {
            // config.show returns the RAW config object directly (no {ok} envelope),
            // so DaemonResult.data IS the config; models.tasks is the { roleId -> tier }
            // override map. Missing/non-map degrades to an empty Loaded (= no overrides),
            // NOT Unavailable (which is reserved for an unreachable/errored daemon).
            val r = rpc.call(METHOD_CONFIG_SHOW, emptyMap())
            if (!r.ok || r.error != null) {
                PerRoleOverridesResult.Unavailable(r.error ?: "config.show returned an error")
            } else {
                val models = r.data["models"] as? Map<*, *>
                val tasks = models?.get("tasks") as? Map<*, *> ?: emptyMap<Any?, Any?>()
                val overrides = buildMap<String, String> {
                    for ((k, v) in tasks) {
                        val roleId = k as? String ?: continue
                        val tier = v as? String ?: continue // skip non-string tiers, never throw
                        put(roleId, tier)
                    }
                }
                PerRoleOverridesResult.Loaded(overrides)
            }
        } catch (e: DaemonUnavailableException) {
            PerRoleOverridesResult.Unavailable(e.message ?: "daemon unavailable")
        } catch (e: RuntimeException) {
            // Defense-in-depth: a malformed reply / transport fault -> Unavailable, never a throw.
            PerRoleOverridesResult.Unavailable(e.message ?: "unexpected daemon fault")
        }

    companion object {
        const val METHOD_STATUS = "daemon.status"
        const val METHOD_REPO_LIST = "repo.list"
        const val METHOD_REPO_ADD = "repo.add"
        const val METHOD_WORKFLOW_PENDING = "workflow.pending"
        const val METHOD_WORKFLOW_ARTIFACT_CONTENT = "workflow.artifactContent"
        const val METHOD_WORKFLOW_RESOLVE_COMMENT = "workflow.resolveComment"
        const val METHOD_WORKFLOW_APPROVE = "workflow.approve"
        const val METHOD_CONFIG_CATALOG = "config.catalog"
        const val METHOD_CONFIG_WRITE = "config.write"
        const val METHOD_CONFIG_SHOW = "config.show"
        const val FIELD_STALE = "stale"
        const val FIELD_REPOS = "repos"
        const val FIELD_ARTIFACTS = "artifacts"
        const val PARAM_PATH = "path"
        const val PARAM_VALUE = "value"
        const val PARAM_REPO = "repo"
        const val PARAM_MD_PATH = "mdPath"
        const val PARAM_ARTIFACT_ID = "artifactId"
        const val PARAM_COMMENTS = "comments"
        const val PARAM_ARTIFACT_PATH = "artifactPath"
        const val PARAM_OVERRIDE_REVIEW = "overrideReview"

        /**
         * Classify a successful workflow.approve reply (Story S005). approved[]
         * non-empty -> Approved (a single approve, so at most one entry;
         * idempotent re-approve also lands here); else skipped[] non-empty ->
         * Withheld(reason) — the block gate (NOT a success); else a defensive
         * Unavailable so an unexpected shape is never read as Approved.
         */
        private fun classifyApprove(data: Map<String, Any?>): ApproveResult {
            val approved = data["approved"] as? List<*> ?: emptyList<Any?>()
            if (approved.isNotEmpty()) return ApproveResult.Approved
            val skipped = data["skipped"] as? List<*> ?: emptyList<Any?>()
            val first = skipped.firstOrNull() as? Map<*, *>
            if (first != null) {
                val reason = (first["reason"] as? String)?.takeIf { it.isNotEmpty() }
                    ?: "approval withheld by the review gate"
                return ApproveResult.Withheld(reason)
            }
            return ApproveResult.Unavailable("no artifact approved or withheld")
        }

        /** Serialize one comment to the wire map, omitting null anchor fields
         *  (the daemon treats an absent field the same as a null one). */
        private fun commentToMap(c: ReviewCommentDto): Map<String, Any?> {
            val anchor = buildMap<String, Any?> {
                c.anchor.sectionPath?.let { put("sectionPath", it) }
                c.anchor.quote?.let { put("quote", it) }
                c.anchor.openQuestionId?.let { put("openQuestionId", it) }
            }
            return mapOf("id" to c.id, "anchor" to anchor, "body" to c.body)
        }

        /** Map the daemon's `resolutions` payload to DTOs (verbatim, k1). */
        private fun parseResolutions(raw: Any?): List<ResolvedCommentDto> {
            val list = raw as? List<*> ?: return emptyList()
            return list.mapNotNull { item ->
                val m = item as? Map<*, *> ?: return@mapNotNull null
                ResolvedCommentDto(
                    openQuestionId = (m["openQuestionId"] as? String)?.takeIf { it.isNotEmpty() },
                    status = str(m["status"]),
                )
            }
        }

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

        /**
         * Map the daemon's `config.catalog` reply to the settings DTO (Story S002,
         * verbatim k1). options/groups/roles/tierNames come straight from the
         * payload; the `values` map is folded into each option's currentValue/isSet
         * (isSet = the option's path was present in values). enumValues is carried
         * only when present. A non-list/non-map field degrades to empty, never a throw.
         */
        private fun parseCatalog(data: Map<String, Any?>): SettingsCatalogDto {
            // A missing/non-list `options` is a malformed reply, not an empty catalog:
            // require a list so the gateway's catch maps it to Unavailable (never a
            // blank Loaded). A legitimately empty catalog sends options: [] (a list).
            val optionsRaw = data["options"]
            require(optionsRaw is List<*>) { "config.catalog reply has no options list" }
            val values = data["values"] as? Map<*, *> ?: emptyMap<Any?, Any?>()
            val options = optionsRaw.mapNotNull { item ->
                val m = item as? Map<*, *> ?: return@mapNotNull null
                val path = str(m["path"])
                val isSet = values.containsKey(path)
                ConfigOptionDto(
                    path = path,
                    type = str(m["type"]),
                    default = m["default"],
                    desc = str(m["desc"]),
                    enumValues = (m["enumValues"] as? List<*>)?.map { it.toString() },
                    group = str(m["group"]),
                    currentValue = if (isSet) values[path] else null,
                    isSet = isSet,
                )
            } ?: emptyList()
            val groups = (data["groups"] as? List<*>)?.map { it.toString() } ?: emptyList()
            val tierNames = (data["tierNames"] as? List<*>)?.map { it.toString() } ?: emptyList()
            val roles = (data["roles"] as? List<*>)?.mapNotNull { item ->
                val m = item as? Map<*, *> ?: return@mapNotNull null
                RoleDto(id = str(m["id"]), defaultTier = str(m["defaultTier"]))
            } ?: emptyList()
            return SettingsCatalogDto(groups = groups, options = options, roles = roles, tierNames = tierNames)
        }

        /**
         * Map the daemon's `workflow.artifactContent` reply to the review-view
         * DTO, forwarding every field verbatim (k1). openQuestions is a list of
         * { id, text, status } maps; blockReason is nullable; approvable is a
         * boolean (defaults false — the safe side: not approvable unless the
         * daemon says so).
         */
        private fun parseView(data: Map<String, Any?>): ArtifactReviewViewDto {
            val questions = (data["openQuestions"] as? List<*>)?.mapNotNull { item ->
                val m = item as? Map<*, *> ?: return@mapNotNull null
                OpenQuestionDto(id = str(m["id"]), text = str(m["text"]), status = str(m["status"]))
            } ?: emptyList()
            return ArtifactReviewViewDto(
                artifactId = str(data["artifactId"]),
                kind = str(data["kind"]),
                renderedMarkdown = str(data["renderedMarkdown"]),
                openQuestions = questions,
                approvable = data["approvable"] as? Boolean ?: false,
                blockReason = (data["blockReason"] as? String)?.takeIf { it.isNotEmpty() },
            )
        }
    }
}
