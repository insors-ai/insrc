package ai.insors.insrc.jetbrains.connections

import com.google.gson.*
import org.junit.jupiter.api.Assertions.*
import org.junit.jupiter.api.Test

class ConnectionsManagerModelTest {
    private val gson=GsonBuilder().serializeNulls().create()
    private fun selection(o:JsonObject):ConnectionSelection {
        val k=o.getAsJsonObject("key")
        return ConnectionSelection(ConnectionKey(k["repoRoot"].asString,k["scope"].asString,k["id"].asString),o["revision"].asString)
    }
    private fun event(o:JsonObject):ManagerEvent {
        fun identity()=ManagerReadIdentity(o["repoRoot"].asString,o["viewGeneration"].asLong,o["daemonEpoch"].asString)
        return when(o["type"].asString) {
            "select-root" -> ManagerEvent.SelectRoot(o["repoRoot"].asString)
            "registered-roots" -> ManagerEvent.RegisteredRoots(o.getAsJsonArray("roots").map {it.asString})
            "refresh" -> ManagerEvent.Refresh
            "list-result" -> ManagerEvent.ListResult(identity(),o["rows"])
            "list-error" -> ManagerEvent.ListError(identity(),o["code"].asString)
            "filter" -> ManagerEvent.Filter(o["value"].asString)
            "search" -> ManagerEvent.Search(o["value"].asString)
            "select" -> ManagerEvent.Select(selection(o.getAsJsonObject("selection")))
            "committed-reveal" -> ManagerEvent.CommittedReveal(selection(o.getAsJsonObject("selection")))
            "epoch" -> ManagerEvent.Epoch(o["value"].asString)
            "temporary-ended" -> ManagerEvent.TemporaryEnded
            "unavailable" -> ManagerEvent.Unavailable(o["code"].asString)
            "close" -> ManagerEvent.Close
            else -> error("Unsupported shared model event")
        }
    }
    @Test fun `same sixteen sc7 transcripts match state projections and effects`() {
        val scenarios=ConnectionCorpus.load().getAsJsonArray("managerScenarios")
        assertEquals(16,scenarios.size())
        for(raw in scenarios) {
            val scenario=raw.asJsonObject;val id=scenario["id"].asString
            var state=ConnectionsManagerModel.create(listOf("/fixture/repo-a","/fixture/repo-b"),"fixture-epoch")
            assertEquals("no-repository",ConnectionsManagerModel.project(state).listState)
            for(rawStep in scenario.getAsJsonArray("steps")) {
                val step=rawStep.asJsonObject;val before=gson.toJson(state)
                val result=ConnectionsManagerModel.reduce(state,event(step.getAsJsonObject("event")))
                assertEquals(before,gson.toJson(state),"$id modified old state")
                state=result.state
                val projected=gson.toJsonTree(ConnectionsManagerModel.project(state)).asJsonObject
                // Kotlin DTO null means an absent optional wire field; state nulls remain explicit.
                for (row in projected.getAsJsonArray("rows")) {
                    val o=row.asJsonObject
                    o.entrySet().filter { it.value.isJsonNull }.map {it.key}.forEach {o.remove(it)}
                }
                for((key,value) in step.getAsJsonObject("expected").entrySet()) assertEquals(value,projected[key],"$id: $key")
                if(step.has("effects"))assertEquals(step["effects"],gson.toJsonTree(result.effects),id)
            }
        }
    }
    @Test fun `root snapshots rows and public projections are defensive and pure`() {
        val roots=mutableListOf("/fixture/repo-a")
        val initial=ConnectionsManagerModel.create(roots,"fixture-epoch");roots.clear()
        val loading=ConnectionsManagerModel.reduce(initial,ManagerEvent.SelectRoot("/fixture/repo-a"))
        assertEquals(listOf(ManagerEffect(repoRoot="/fixture/repo-a",viewGeneration=1,daemonEpoch="fixture-epoch")),loading.effects)
        val rows=ConnectionCorpus.load().getAsJsonArray("transcripts")[2].asJsonObject.getAsJsonObject("expected")["rows"].deepCopy()
        val ready=ConnectionsManagerModel.reduce(loading.state,ManagerEvent.ListResult(ManagerReadIdentity("/fixture/repo-a",1,"fixture-epoch"),rows)).state
        rows.asJsonArray.remove(0)
        assertEquals(2,ready.rows.size)
        val exposed=ready.rows;exposed[0].publicConfig.addProperty("path","altered")
        assertFalse(ready.rows[0].publicConfig.has("path"))
        assertThrows(UnsupportedOperationException::class.java){(exposed as MutableList).clear()}
        val projection=ConnectionsManagerModel.project(ready);projection.rows[0].publicConfig.addProperty("path","altered")
        assertFalse(ready.rows[0].publicConfig.has("path"))
        val stale=ConnectionsManagerModel.reduce(ready,ManagerEvent.Refresh).state
        assertNull(ConnectionsManagerModel.reduce(stale,ManagerEvent.Select(ConnectionSelection(ready.rows[0].key,ready.rows[0].revision))).state.selected)
        val source=java.nio.file.Files.readString(java.nio.file.Path.of("src/main/kotlin/ai/insors/insrc/jetbrains/connections/ConnectionsManagerModel.kt"))
        assertFalse(source.contains("com.intellij"));assertFalse(source.contains("PersistentStateComponent"));assertFalse(source.contains("java.io"))
    }
}
