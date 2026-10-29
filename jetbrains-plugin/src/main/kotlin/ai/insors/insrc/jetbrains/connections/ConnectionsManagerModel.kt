package ai.insors.insrc.jetbrains.connections

import com.google.gson.JsonElement
import java.util.Collections

/** Pure sc7 state; no platform service, I/O, credentials or signed attempts. */
data class ConnectionSelection(val key: ConnectionKey, val revision: String)
data class ManagerReadIdentity(val repoRoot: String, val viewGeneration: Long, val daemonEpoch: String)
data class ConnectionsManagerState internal constructor(
    val roots: List<String>, val repoRoot: String?, val daemonEpoch: String,
    val filter: String = "all", val search: String = "", val listState: String = "no-repository",
    private val storedRows: List<SafeConnection> = emptyList(), val selected: ConnectionSelection? = null,
    val pendingReveal: ConnectionSelection? = null, val viewGeneration: Long = 0,
    val awaitingRead: Boolean = false, val closed: Boolean = false,
) {
    /** JsonObject is mutable: never hand a view a reference to the authoritative snapshot. */
    val rows: List<SafeConnection> get() = Collections.unmodifiableList(storedRows.map { it.copy(
        publicConfig = it.publicConfig.deepCopy(), credentialPresence = Collections.unmodifiableMap(it.credentialPresence.toMap()),
    ) })
}
sealed interface ManagerEvent {
    data class SelectRoot(val repoRoot: String) : ManagerEvent
    data class RegisteredRoots(val roots: List<String>) : ManagerEvent
    data object Refresh : ManagerEvent
    data class ListResult(val identity: ManagerReadIdentity, val rows: JsonElement) : ManagerEvent
    data class ListError(val identity: ManagerReadIdentity, val code: String) : ManagerEvent
    data class Filter(val value: String) : ManagerEvent
    data class Search(val value: String) : ManagerEvent
    data class Select(val selection: ConnectionSelection) : ManagerEvent
    data class CommittedReveal(val selection: ConnectionSelection) : ManagerEvent
    data class Epoch(val value: String) : ManagerEvent
    data object TemporaryEnded : ManagerEvent
    data class Unavailable(val code: String) : ManagerEvent
    data object Close : ManagerEvent
}
data class ManagerEffect(val type: String = "list", val repoRoot: String, val viewGeneration: Long, val daemonEpoch: String)
data class ManagerTransition(val state: ConnectionsManagerState, val effects: List<ManagerEffect> = emptyList())
data class ConnectionCounts(val all: Int, val saved: Int, val temporary: Int)
data class ConnectionsManagerProjection(
    val roots: List<String>, val repoRoot: String?, val daemonEpoch: String, val filter: String, val search: String,
    val listState: String, val rows: List<SafeConnection>, val selected: ConnectionSelection?, val pendingReveal: ConnectionSelection?,
    val viewGeneration: Long, val awaitingRead: Boolean, val closed: Boolean,
    val visibleKeys: List<ConnectionKey>, val counts: ConnectionCounts, val matchingCount: Int, val stale: Boolean, val canMutate: Boolean,
)
object ConnectionsManagerModel {
    private const val MAX_GENERATION = 9007199254740991L
    private fun advance(s: ConnectionsManagerState) = minOf(MAX_GENERATION, s.viewGeneration + 1)
    private fun rootsCopy(roots: List<String>): List<String> {
        require(roots.size <= 16384 && roots.all { it.isNotEmpty() && it.length <= 16384 && it.none { c -> c.code < 32 } })
        return Collections.unmodifiableList(roots.distinct())
    }
    fun create(roots: List<String>, daemonEpoch: String) = ConnectionsManagerState(rootsCopy(roots), null, daemonEpoch)
    private fun live(s: ConnectionsManagerState) = !s.closed && s.listState in setOf("ready", "empty-registry", "empty-filter")
    private fun visible(s: ConnectionsManagerState, rows: List<SafeConnection> = s.rows) = rows.filter {
        (s.filter == "all" || it.key.scope == s.filter) && listOf(it.key.id, it.kind, it.label ?: "").any { text -> text.lowercase().contains(s.search.lowercase()) }
    }
    private fun ready(s: ConnectionsManagerState) = when { s.rows.isEmpty() -> "empty-registry"; visible(s).isEmpty() -> "empty-filter"; else -> "ready" }
    fun project(s: ConnectionsManagerState): ConnectionsManagerProjection {
        val rows = s.rows; val visible = visible(s, rows)
        return ConnectionsManagerProjection(s.roots,s.repoRoot,s.daemonEpoch,s.filter,s.search,s.listState,rows,s.selected,s.pendingReveal,
            s.viewGeneration,s.awaitingRead,s.closed,Collections.unmodifiableList(visible.map { it.key }),
            ConnectionCounts(rows.size,rows.count { it.key.scope == "saved" },rows.count { it.key.scope == "temporary" }),visible.size,!live(s) && rows.isNotEmpty(),live(s))
    }
    fun reduce(s: ConnectionsManagerState, event: ManagerEvent): ManagerTransition {
        fun unchanged() = ManagerTransition(s)
        fun changed(next: ConnectionsManagerState) = ManagerTransition(next)
        fun refresh(next: ConnectionsManagerState): ManagerTransition {
            val root = next.repoRoot ?: return unchanged()
            if (root !in next.roots || next.viewGeneration >= MAX_GENERATION) return unchanged()
            val state = next.copy(viewGeneration = advance(next), listState = "loading", awaitingRead = true)
            return ManagerTransition(state, listOf(ManagerEffect(repoRoot = root, viewGeneration = state.viewGeneration, daemonEpoch = state.daemonEpoch)))
        }
        fun current(identity: ManagerReadIdentity) = s.awaitingRead && identity.repoRoot == s.repoRoot && identity.viewGeneration == s.viewGeneration && identity.daemonEpoch == s.daemonEpoch
        if (s.closed) return unchanged()
        return when (event) {
            is ManagerEvent.SelectRoot -> if (event.repoRoot !in s.roots || event.repoRoot == s.repoRoot) unchanged()
                else refresh(s.copy(repoRoot = event.repoRoot, storedRows = emptyList(), selected = null, pendingReveal = null))
            is ManagerEvent.RegisteredRoots -> {
                val roots = rootsCopy(event.roots)
                if (s.repoRoot != null && s.repoRoot !in roots) changed(s.copy(roots=roots,repoRoot=null,storedRows=emptyList(),selected=null,pendingReveal=null,awaitingRead=false,listState="no-repository",viewGeneration=advance(s)))
                else changed(s.copy(roots=roots))
            }
            ManagerEvent.Refresh -> refresh(s)
            is ManagerEvent.ListError -> if (!current(event.identity)) unchanged() else {
                require(event.code in setOf("read-error","offline","upgrade-required"));changed(s.copy(awaitingRead=false,listState=event.code))
            }
            is ManagerEvent.ListResult -> {
                if (!current(event.identity)) return unchanged()
                val rows = try { ConnectionProtocol.list(event.rows,event.identity.repoRoot) } catch (_: ConnectionReplyException) {
                    return changed(s.copy(awaitingRead=false,listState="read-error"))
                }
                var next = s.copy(storedRows=rows,awaitingRead=false)
                if (s.selected != null && rows.none { it.key == s.selected.key && it.revision == s.selected.revision }) next=next.copy(selected=null)
                val reveal=s.pendingReveal
                if (reveal != null && rows.any {it.key == reveal.key && it.revision == reveal.revision}) next=next.copy(selected=reveal,pendingReveal=null,filter=reveal.key.scope,search="")
                changed(next.copy(listState=ready(next)))
            }
            is ManagerEvent.Filter -> if(event.value !in setOf("all","saved","temporary")) unchanged() else {
                val next=s.copy(filter=event.value);changed(next.copy(listState=if(live(s)) ready(next) else s.listState))
            }
            is ManagerEvent.Search -> if(event.value.length>16384 || event.value.any {it.code<32}) unchanged() else {
                val next=s.copy(search=event.value);changed(next.copy(listState=if(live(s)) ready(next) else s.listState))
            }
            is ManagerEvent.Select -> if(!live(s) || visible(s).none {it.key==event.selection.key && it.revision==event.selection.revision}) unchanged() else changed(s.copy(selected=event.selection))
            is ManagerEvent.CommittedReveal -> if(event.selection.key.repoRoot!=s.repoRoot) unchanged() else refresh(s.copy(pendingReveal=event.selection))
            is ManagerEvent.Epoch -> if(event.value==s.daemonEpoch) unchanged() else changed(s.copy(daemonEpoch=event.value,viewGeneration=advance(s),awaitingRead=false,listState=if(s.repoRoot!=null)"offline" else "no-repository",storedRows=s.rows.filter {it.key.scope=="saved"},selected=null,pendingReveal=null))
            ManagerEvent.TemporaryEnded -> changed(s.copy(viewGeneration=advance(s),awaitingRead=false,listState=if(s.repoRoot!=null)"offline"else"no-repository",storedRows=s.rows.filter{it.key.scope=="saved"},selected=s.selected?.takeIf{it.key.scope=="saved"},pendingReveal=null))
            is ManagerEvent.Unavailable -> {
                require(event.code in setOf("offline","upgrade-required"));changed(s.copy(awaitingRead=false,viewGeneration=advance(s),listState=if(s.repoRoot!=null)event.code else "no-repository"))
            }
            ManagerEvent.Close -> changed(s.copy(closed=true,awaitingRead=false,viewGeneration=advance(s)))
        }
    }
}
