package ai.insors.insrc.jetbrains.actions

import ai.insors.insrc.jetbrains.daemon.DaemonGatewayImpl
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertNull
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Test
import java.io.File

/** Epic c2ba6fa6, Story s10, t10: the status dialog's Document links group. */
class DocRelationsRowsTest {
    private val figures = mapOf("checked" to 110.0, "precision" to 0.97, "recall" to 0.64, "extractedRecovery" to 1.0, "modelId" to "m1", "measuredAt" to "x")

    @Test
    fun `the Document links group shows the switch, the figures and why new documents are not examined, and nothing without the field`() {
        val on = DaemonGatewayImpl.parseDocRelations(mapOf(
            "switch" to "on", "figures" to figures,
            "extraction" to mapOf("state" to "unavailable", "reason" to "claude is not signed in", "examined" to 0.0, "failed" to 0.0, "updatedAt" to "x"),
        ))!!
        assertEquals("document links: on (P 0.97 / R 0.64 on 110 links); new documents not examined: claude is not signed in", describeDocRelations(on))
        assertEquals(
            listOf(
                "Summary" to "document links: on (P 0.97 / R 0.64 on 110 links); new documents not examined: claude is not signed in",
                "Switch" to "on", "Checked links" to "110", "Precision" to "0.97", "Recall" to "0.64",
                "Not examined because" to "claude is not signed in",
            ),
            docRelationsRows(on),
        )
        val notMeasured = DaemonGatewayImpl.parseDocRelations(mapOf("switch" to "not-measured"))!!
        assertEquals("document links: not-measured", describeDocRelations(notMeasured))
        assertEquals(listOf("Summary" to "document links: not-measured", "Switch" to "not-measured"), docRelationsRows(notMeasured))
        val off = DaemonGatewayImpl.parseDocRelations(mapOf("switch" to "off", "figures" to figures + ("recall" to 0.4)))!!
        assertEquals("document links: off (P 0.97 / R 0.40 on 110 links)", describeDocRelations(off))
        assertNull(DaemonGatewayImpl.parseDocRelations(null), "no field: no group")
        assertNull(DaemonGatewayImpl.parseDocRelations(mapOf("figures" to figures)), "no switch: no group")
        val parsed = DaemonGatewayImpl.parseRepoStats(mapOf("repoPath" to "/w", "status" to "ready", "addedAt" to "x", "docRelations" to mapOf("switch" to "on")))
        assertEquals("on", parsed.docRelations?.switch)
        val src = File("src/main/kotlin/ai/insors/insrc/jetbrains/actions/RepoStatusDialog.kt").readText()
        assertTrue(src.contains("docRelationsRows(d)"), "the dialog builds its group from docRelationsRows")
    }
}
