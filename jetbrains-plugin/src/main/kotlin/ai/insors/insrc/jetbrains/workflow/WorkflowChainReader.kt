package ai.insors.insrc.jetbrains.workflow

import com.google.gson.JsonArray
import com.google.gson.JsonElement
import com.google.gson.JsonObject
import com.google.gson.JsonParser
import com.intellij.openapi.project.ProjectManager
import java.nio.file.Files
import java.nio.file.Path
import java.security.MessageDigest

/**
 * The define/HLD existence + approval projection for one Epic stage, read from a
 * `DEF-*.json` / `HLD-*.json` artifact's `meta.approvedAt` (non-empty ⇒ approved) and
 * `meta.rejectedAt` (mirrors src/workflow/chain.ts:137-138,148-149).
 */
data class StageMark(val exists: Boolean, val approved: Boolean, val rejected: Boolean) {
    companion object {
        val ABSENT = StageMark(exists = false, approved = false, rejected = false)
    }
}

/**
 * Per-story chain state: [hasLld] from the `LLD-<hash>-<storyId>.json` presence,
 * [approved] from its `meta.approvedAt`, [stale] from `lld.meta.hldEffectiveHash !=
 * computeHldEffectiveHash(hld.meta.runId, approvedAmendmentIds)` (mirrors chain.ts:172-173
 * + amendments/staleness.ts). `id`/`title` come from the DEF `body.stories[]` entry.
 */
data class StoryChainMark(
    val id: String,
    val title: String,
    val hasLld: Boolean,
    val approved: Boolean,
    val stale: Boolean,
    val staleReason: String?,
)

/**
 * Plugin-owned READ-ONLY projection of the CLI `ChainReport` STATE subset the Workflows
 * page renders (Story E2026092157298940:S003). A faithful subset — NOT a port of the
 * mutating `NextAction`/tracker machine: [nextActionHint] is a plain human string derived
 * from the marks, with no push-tracker/sync-tracker cases (k6, no daemon).
 */
data class WorkflowChainDto(
    val epicHash: String,
    val epicSlug: String?,
    val define: StageMark,
    val hld: StageMark,
    val stories: List<StoryChainMark>,
    val amendmentsPending: Int,
    val amendmentsApproved: Int,
    val nextActionHint: String,
)

/**
 * S003-internal, strictly READ-ONLY reader that scans the open project(s)'
 * `.insrc/artifacts` directory and projects a [WorkflowChainDto] per Epic (one per
 * `DEF-*.json`). It mirrors the load-bearing markers of the CLI `src/workflow/chain.ts`
 * `buildChainReport` — `meta.approvedAt`/`meta.rejectedAt`, the
 * `sha256(runId + "|"+id…)` staleness the daemon itself uses (artifacts/lld.ts:176,
 * gates.ts) and the amendment tally (chain.ts:195) — but reproduces ONLY the STATE facts
 * ac1 needs plus a simple next-action hint, deliberately omitting the tracker push/sync
 * half (k6, no daemon reach).
 *
 * Entirely local file reads; opens no socket and mutates nothing (k1, k6). It NEVER
 * throws: a missing/unreadable artifacts dir, a malformed JSON file, or a project with no
 * base path is swallowed per-file and contributes nothing, so the off-EDT page render is
 * always safe.
 *
 * The seam the LLD documents as `artifactsDirOf: (Project) -> Path?` is realized here as a
 * Project-decoupled directory provider ([artifactsDirsProvider]): an application-level
 * Settings page has no injected Project, and a plain JUnit test cannot construct one, so
 * the reader takes the already-resolved list of `.insrc/artifacts` dirs. Production wires
 * it to `ProjectManager.getInstance().openProjects` mapped through each project's
 * `basePath`; tests inject a temp dir (or an empty list for the no-open-project case).
 */
class WorkflowChainReader(
    private val artifactsDirsProvider: () -> List<Path> = { defaultOpenProjectArtifactsDirs() },
) {

    /** One [WorkflowChainDto] per `DEF-*.json` across every open project's artifacts dir;
     *  an empty list when none is found (drives the ac3 empty state). Never throws. */
    fun readAll(): List<WorkflowChainDto> {
        val dirs = try {
            artifactsDirsProvider()
        } catch (e: RuntimeException) {
            return emptyList()
        }
        return dirs.flatMap { readDir(it) }
    }

    /** Project every Epic (DEF-*.json) found directly under [dir]. A dir that is absent or
     *  cannot be listed contributes nothing. */
    private fun readDir(dir: Path): List<WorkflowChainDto> {
        if (!Files.isDirectory(dir)) return emptyList()
        val names: List<String> = try {
            Files.list(dir).use { stream -> stream.map { it.fileName.toString() }.toList() }
        } catch (e: Exception) {
            return emptyList()
        }
        return names
            .filter { it.startsWith("DEF-") && it.endsWith(".json") }
            .mapNotNull { readEpic(dir, it) }
    }

    /** Project one Epic from its `DEF-<epicHash>.json` file name. Returns null when the DEF
     *  itself is unreadable/malformed (there is no Epic to show without it). */
    private fun readEpic(dir: Path, defFileName: String): WorkflowChainDto? {
        val epicHash = defFileName.removePrefix("DEF-").removeSuffix(".json")
        val defObj = parseObject(dir.resolve(defFileName)) ?: return null

        val defMeta = defObj.objOrNull("meta")
        val define = StageMark(exists = true, approved = defMeta.isApproved(), rejected = defMeta.isRejected())
        val epicSlug = defMeta.stringOrNull("epicSlug")

        val hldObj = parseObject(dir.resolve("HLD-$epicHash.json"))
        val hldMeta = hldObj?.objOrNull("meta")
        val hld = if (hldObj == null) StageMark.ABSENT
        else StageMark(exists = true, approved = hldMeta.isApproved(), rejected = hldMeta.isRejected())
        val hldRunId = hldMeta.stringOrNull("runId").orEmpty()

        // Approved amendment ids (approvedAt order) + the pending/approved tally.
        val amendments = readAmendments(dir, epicHash)
        val currentEffective =
            if (hldRunId.isBlank()) null else computeHldEffectiveHash(hldRunId, amendments.approvedIds)

        val stories = defObj.objOrNull("body").arrayOrEmpty("stories").mapNotNull { el ->
            val story = el.takeIf { it.isJsonObject }?.asJsonObject ?: return@mapNotNull null
            val id = story.stringOrNull("id") ?: return@mapNotNull null
            val title = story.stringOrNull("title") ?: id
            readStory(dir, epicHash, id, title, hldRunId, currentEffective, amendments.approvedIds)
        }

        return WorkflowChainDto(
            epicHash = epicHash,
            epicSlug = epicSlug,
            define = define,
            hld = hld,
            stories = stories,
            amendmentsPending = amendments.pending,
            amendmentsApproved = amendments.approved,
            nextActionHint = nextActionHint(define, hld, stories, amendments.pending),
        )
    }

    /** Project a single story's LLD state. A missing/malformed LLD reads as hasLld=false. */
    private fun readStory(
        dir: Path,
        epicHash: String,
        storyId: String,
        title: String,
        hldRunId: String,
        currentEffective: String?,
        approvedAmendmentIds: List<String>,
    ): StoryChainMark {
        val lldObj = parseObject(dir.resolve("LLD-$epicHash-$storyId.json"))
        if (lldObj == null) {
            return StoryChainMark(storyId, title, hasLld = false, approved = false, stale = false, staleReason = null)
        }
        val meta = lldObj.objOrNull("meta")
        val approved = meta.isApproved()

        // Staleness is undefined without an HLD base — report not-stale rather than crash.
        // (Mirrors chain.ts: with no HLD artifact the staleness map is empty ⇒ stale=false.)
        if (currentEffective == null) {
            return StoryChainMark(storyId, title, hasLld = true, approved = approved, stale = false, staleReason = null)
        }
        val stored = meta.stringOrNull("hldEffectiveHash")
        val baseRunId = meta.stringOrNull("hldBaseRunId")
        // An LLD whose effective-hash / base-run meta is not a string is stale='malformed'
        // — checked BEFORE the hash-equality test, exactly as amendments/staleness.ts:94-97.
        if (stored == null || baseRunId == null) {
            return StoryChainMark(storyId, title, hasLld = true, approved = approved, stale = true, staleReason = "malformed")
        }
        if (stored == currentEffective) {
            return StoryChainMark(storyId, title, hasLld = true, approved = approved, stale = false, staleReason = null)
        }
        // Stale — name the reason exactly as amendments/staleness.ts:108-115 does.
        val reason = if (baseRunId != hldRunId) {
            "hld-rerun"
        } else {
            val applied = meta.arrayOrEmpty("hldAmendmentsApplied").mapNotNull { it.asStringOrNull() }.toSet()
            approvedAmendmentIds.firstOrNull { it !in applied }?.let { "amendment-$it" } ?: "unknown"
        }
        return StoryChainMark(storyId, title, hasLld = true, approved = approved, stale = true, staleReason = reason)
    }

    private data class AmendmentTally(val pending: Int, val approved: Int, val approvedIds: List<String>)

    /** Tally `AMD-<epicHash>-*.json` by status and collect approved ids in approvedAt order
     *  (the same order the CLI applier folds them into the effective hash). */
    private fun readAmendments(dir: Path, epicHash: String): AmendmentTally {
        val prefix = "AMD-$epicHash-"
        val names: List<String> = try {
            Files.list(dir).use { stream -> stream.map { it.fileName.toString() }.toList() }
        } catch (e: Exception) {
            return AmendmentTally(0, 0, emptyList())
        }
        var pending = 0
        var approved = 0
        val approvedRows = mutableListOf<Pair<String, String>>() // id -> approvedAt
        for (name in names) {
            if (!name.startsWith(prefix) || !name.endsWith(".json")) continue
            val obj = parseObject(dir.resolve(name)) ?: continue
            val status = obj.stringOrNull("status") ?: continue
            when (status) {
                "pending" -> pending++
                "approved" -> {
                    approved++
                    // The COUNT includes every approved amendment, but only those carrying an
                    // approvedAt STRING feed the effective-hash id list — listApprovedAmendments
                    // (amendments/store.ts:216-218) filters on `typeof approvedAt === 'string'`.
                    val approvedAt = obj.stringOrNull("approvedAt")
                    if (approvedAt != null) {
                        val id = obj.stringOrNull("id") ?: name.removeSuffix(".json")
                        approvedRows.add(id to approvedAt)
                    }
                }
            }
        }
        val approvedIds = approvedRows.sortedBy { it.second }.map { it.first }
        return AmendmentTally(pending, approved, approvedIds)
    }

    /**
     * Derive a plain human next-action hint from the projected marks, in the same
     * precedence the CLI decision tree uses but WITHOUT the tracker push/sync cases (k6):
     * run/approve define → review pending amendments → run/approve HLD → the first story
     * that is stale / unbuilt / unapproved → "Chain complete".
     */
    private fun nextActionHint(
        define: StageMark,
        hld: StageMark,
        stories: List<StoryChainMark>,
        amendmentsPending: Int,
    ): String {
        if (!define.exists) return "Run define"
        if (!define.approved) return "Approve define"
        if (amendmentsPending > 0) return "Review pending amendment(s)"
        if (!hld.exists) return "Run design (HLD)"
        if (!hld.approved) return "Approve HLD"
        stories.firstOrNull { it.stale }?.let { return "Refresh stale LLD for ${it.id}" }
        stories.firstOrNull { !it.hasLld }?.let { return "Design story ${it.id}" }
        stories.firstOrNull { !it.approved }?.let { return "Approve LLD for ${it.id}" }
        return "Chain complete"
    }

    /**
     * The effective HLD hash — `sha256(baseRunId || "|"+id …)` over the approved amendment
     * ids, replicating computeHldEffectiveHash (src/workflow/artifacts/lld.ts:176) so a
     * story LLD's staleness is decided by `!=` against its stored `meta.hldEffectiveHash`.
     * Pure, no I/O; with no approved amendments returns `sha256(baseRunId)`.
     */
    private fun computeHldEffectiveHash(hldRunId: String, approvedAmendmentIds: List<String>): String {
        val digest = MessageDigest.getInstance("SHA-256")
        digest.update(hldRunId.toByteArray(Charsets.UTF_8))
        for (id in approvedAmendmentIds) {
            digest.update('|'.code.toByte())
            digest.update(id.toByteArray(Charsets.UTF_8))
        }
        return digest.digest().joinToString("") { "%02x".format(it) }
    }

    // ---- JSON helpers (all null-safe; a wrong shape reads as absent, never throws) ------

    private fun parseObject(path: Path): JsonObject? = try {
        if (!Files.isRegularFile(path)) null
        else JsonParser.parseString(Files.readString(path)).takeIf { it.isJsonObject }?.asJsonObject
    } catch (e: Exception) {
        null
    }

    private fun JsonObject?.objOrNull(field: String): JsonObject? =
        this?.get(field)?.takeIf { it.isJsonObject }?.asJsonObject

    private fun JsonObject?.arrayOrEmpty(field: String): JsonArray =
        this?.get(field)?.takeIf { it.isJsonArray }?.asJsonArray ?: JsonArray()

    private fun JsonObject?.stringOrNull(field: String): String? =
        this?.get(field)?.asStringOrNull()

    private fun JsonElement.asStringOrNull(): String? =
        takeIf { it.isJsonPrimitive && it.asJsonPrimitive.isString }?.asString

    /** A stage is approved iff its meta carries a non-empty `approvedAt` string. */
    private fun JsonObject?.isApproved(): Boolean = !stringOrNull("approvedAt").isNullOrEmpty()

    /** A stage is rejected iff its meta carries a non-empty `rejectedAt` string. */
    private fun JsonObject?.isRejected(): Boolean = !stringOrNull("rejectedAt").isNullOrEmpty()

    companion object {
        /** Production seam: every open project's `<basePath>/.insrc/artifacts` directory. */
        fun defaultOpenProjectArtifactsDirs(): List<Path> =
            ProjectManager.getInstance().openProjects.mapNotNull { project ->
                project.basePath?.let { base -> Path.of(base, ".insrc", "artifacts") }
            }
    }
}
