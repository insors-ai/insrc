package ai.insors.insrc.jetbrains.settings

import ai.insors.insrc.jetbrains.daemon.PolicyRowsDto
import ai.insors.insrc.jetbrains.daemon.RepoFieldDto
import ai.insors.insrc.jetbrains.daemon.RepoSettingsResult
import ai.insors.insrc.jetbrains.daemon.ResolvedTargetDto
import ai.insors.insrc.jetbrains.daemon.SaveResult
import ai.insors.insrc.jetbrains.daemon.SigninDto

/**
 * One row of a repo's Tracker block (Story s3). [value] is what the row shows;
 * [current] is the repo's own stored value (the edit field's starting text, empty
 * when unset). Only [editable] (kind `local`) rows take edits; sign-in, target and
 * policy rows are read-only.
 */
data class TrackerRow(
    val key: String,
    val label: String,
    val kind: String,
    val type: String,
    val value: String,
    val current: String,
    val editable: Boolean,
    val note: String?,
    /** The section the row belongs to: the daemon's `group` (`Tracker` or `Build`). */
    val group: String = "Tracker",
    /** For an unset Build row of a repo with no commands: the typical value of its project type, shown as the field's placeholder. */
    val placeholder: String? = null,
)

/** One pending tracker edit ready to write: a null [value] clears the row. */
data class TrackerWrite(val repoPath: String, val key: String, val value: String?)

/**
 * The pure model behind the per-repo Tracker block of the settings page (Story s3):
 * rows from the daemon's `repoFields` and each repo's `repo.settings.get` result,
 * plus the pending edits. No Swing and no IO, so it is unit-testable. A repo whose
 * read was not Loaded shows its reason ([failure]) and no rows; the other repos are
 * unaffected.
 */
class RepoTrackerModel(
    private val fields: List<RepoFieldDto>,
    initial: Map<String, RepoSettingsResult>,
) {
    private val results = LinkedHashMap(initial)
    private val pending = LinkedHashMap<Pair<String, String>, String>()

    /** The repos shown, in the order given. */
    fun repos(): List<String> = results.keys.toList()

    /** Why this repo's settings could not be shown, or null when they loaded. */
    fun failure(repoPath: String): String? = when (val r = results[repoPath]) {
        is RepoSettingsResult.Rejected -> r.reason
        is RepoSettingsResult.Unavailable -> r.reason
        else -> null
    }

    /** Where the repo's team policy came from ("origin/main, fetched <time>"), or null when it has none or did not load. */
    fun policySource(repoPath: String): String? {
        val policy = (results[repoPath] as? RepoSettingsResult.Loaded)?.settings?.policy ?: return null
        val ref = policy.sourceRef ?: return null
        val at = policy.sourceFetchedAt
        return if (at != null) "$ref, fetched $at" else ref
    }

    /** The rows of a repo in `repoFields` order; empty when its settings did not load. */
    fun rows(repoPath: String): List<TrackerRow> {
        val loaded = (results[repoPath] as? RepoSettingsResult.Loaded)?.settings ?: return emptyList()
        return fields.map { f ->
            val own = loaded.values[f.key]
            val current = own?.toString() ?: ""
            val value = when (f.kind) {
                "local" -> own?.toString() ?: (f.default?.let { "$it (default)" } ?: "(not set)")
                "status" -> if (f.key == "signin") signinText(loaded.signin) else targetText(loaded.resolved)
                else -> policyText(loaded.policy, f.key)
            }
            val setup = loaded.buildSetup
            val placeholder = if (f.group == "Build" && f.kind == "local" && own == null && setup != null && setup.commandsSource == "none") {
                setup.suggestion[f.key]
            } else {
                null
            }
            TrackerRow(
                key = f.key, label = f.label, kind = f.kind, type = f.type,
                value = value, current = current, editable = f.kind == "local", note = f.note,
                group = f.group, placeholder = placeholder,
            )
        }
    }

    /**
     * The typical build commands offered for a repo, keyed by repo setting key, or null. Offered only when the
     * repo's commands source is `none` and its project type has a suggestion; never for a repo that has commands.
     */
    fun suggestion(repoPath: String): Map<String, String>? {
        val setup = (results[repoPath] as? RepoSettingsResult.Loaded)?.settings?.buildSetup ?: return null
        return if (setup.commandsSource == "none" && setup.suggestion.isNotEmpty()) setup.suggestion else null
    }

    /**
     * Record the field's text for an editable row. Text equal to the stored value
     * drops the pending edit; blank text means "clear the row". A non-editable or
     * unknown key is ignored.
     */
    fun setEdit(repoPath: String, key: String, text: String) {
        val row = rows(repoPath).firstOrNull { it.key == key } ?: return
        if (!row.editable) return
        val trimmed = text.trim()
        if (trimmed == row.current) pending.remove(repoPath to key) else pending[repoPath to key] = trimmed
    }

    fun isModified(): Boolean = pending.isNotEmpty()

    /** Drop every pending edit. */
    fun revert() = pending.clear()

    /** The pending edits to write; a blank text becomes a null (clear). */
    fun collectWrites(): List<TrackerWrite> =
        pending.map { (k, text) -> TrackerWrite(k.first, k.second, text.ifEmpty { null }) }

    /** A write was Saved: its pending edit is done. */
    fun onSaved(repoPath: String, key: String) {
        pending.remove(repoPath to key)
    }

    /** Replace one repo's result (after a successful write re-read). */
    fun replace(repoPath: String, result: RepoSettingsResult) {
        results[repoPath] = result
    }

    companion object {
        /** The keys the "use suggested" action writes, in write order. */
        private val SUGGESTED_KEYS = listOf("typecheckCommand", "testCommand", "resultFormat")

        /**
         * Writes the suggested values one key at a time through [write] (`repo.settings.set`). When a write is
         * refused, the keys already written are cleared again so no lone command is left. Returns null when all
         * were written, else the reason (with the keys it could not clear). Never throws for a refused write.
         */
        fun writeSuggested(suggestion: Map<String, String>, write: (key: String, value: String?) -> SaveResult): String? {
            val written = mutableListOf<String>()
            for (key in SUGGESTED_KEYS) {
                val value = suggestion[key] ?: continue
                val failure = when (val r = write(key, value)) {
                    is SaveResult.Saved -> { written.add(key); null }
                    is SaveResult.Rejected -> r.message
                    is SaveResult.Unavailable -> r.reason
                }
                if (failure != null) {
                    val stuck = written.reversed().filter { write(it, null) !is SaveResult.Saved }
                    val tail = if (stuck.isEmpty()) "" else "; could not clear ${stuck.joinToString(", ")}"
                    return "$failure (suggested commands were not applied$tail)"
                }
            }
            return null
        }

        fun signinText(s: SigninDto): String {
            if (s.state == "signed-in") return "signed in as ${s.login ?: "?"}"
            val reason = s.reason
            return if (reason != null && reason.isNotEmpty()) "${s.state}: $reason" else s.state
        }

        fun targetText(r: ResolvedTargetDto): String = when {
            r.type == "none" -> "none (${r.source})"
            r.error != null -> "unresolved: ${r.error}"
            else -> "${r.owner ?: "?"}/${r.repo ?: "?"} (${r.source})"
        }

        fun policyText(policy: PolicyRowsDto, key: String): String = when {
            !policy.ok -> "unavailable: ${policy.reason ?: "unknown"}"
            policy.mode == "none" -> "no team policy"
            policy.values.containsKey(key) -> valueText(policy.values[key])
            else -> "(not set)"
        }

        private fun valueText(v: Any?): String = when (v) {
            is List<*> -> if (v.isEmpty()) "(none)" else v.joinToString(", ") { it.toString() }
            is Map<*, *> -> v.entries.joinToString(" · ") { (k, x) -> "$k: ${valueText(x)}" }
            else -> v.toString()
        }
    }
}
