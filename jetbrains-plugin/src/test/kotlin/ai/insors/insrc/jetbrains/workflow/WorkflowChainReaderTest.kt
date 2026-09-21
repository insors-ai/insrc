package ai.insors.insrc.jetbrains.workflow

import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertFalse
import org.junit.jupiter.api.Assertions.assertNull
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Test
import java.nio.file.Files
import java.nio.file.Path
import java.security.MessageDigest

/**
 * Unit tests for the S003 [WorkflowChainReader] (Story E2026092157298940:S003 / t3+t4).
 * Drive the reader over a temp `.insrc/artifacts` directory populated with hand-written
 * DEF/HLD/LLD/AMD JSON fixtures (the Kotlin mirror of src/workflow/__tests__/chain.test.ts)
 * and assert the projected read-only [WorkflowChainDto] — existence/approval marks,
 * matching vs mismatching hldEffectiveHash staleness, amendment counts by status, the
 * derived nextActionHint, and the never-throws/empty behaviors. No daemon, no socket, no
 * IDE.
 */
class WorkflowChainReaderTest {

    private fun tempArtifacts(): Path = Files.createTempDirectory("insrc-artifacts").also { it.toFile().deleteOnExit() }

    private fun write(dir: Path, name: String, json: String) {
        Files.writeString(dir.resolve(name), json)
    }

    private fun readerOver(vararg dirs: Path): WorkflowChainReader =
        WorkflowChainReader(artifactsDirsProvider = { dirs.toList() })

    /** The same effective-hash rule the reader (and the CLI) use — sha256(runId || "|"+id…). */
    private fun effHash(runId: String, vararg approvedIds: String): String {
        val d = MessageDigest.getInstance("SHA-256")
        d.update(runId.toByteArray(Charsets.UTF_8))
        for (id in approvedIds) {
            d.update('|'.code.toByte())
            d.update(id.toByteArray(Charsets.UTF_8))
        }
        return d.digest().joinToString("") { "%02x".format(it) }
    }

    private fun def(epicHash: String, slug: String, approved: Boolean, vararg stories: Pair<String, String>): String {
        val approvedAt = if (approved) "\"2026-01-01T00:00:00Z\"" else "\"\""
        val storiesJson = stories.joinToString(",") { (id, title) -> """{"id":"$id","title":"$title"}""" }
        return """{"meta":{"epicHash":"$epicHash","epicSlug":"$slug","approvedAt":$approvedAt},"body":{"stories":[$storiesJson]}}"""
    }

    private fun hld(runId: String, approved: Boolean): String {
        val approvedAt = if (approved) "\"2026-01-02T00:00:00Z\"" else "\"\""
        return """{"meta":{"runId":"$runId","approvedAt":$approvedAt}}"""
    }

    private fun lld(runId: String, effectiveHash: String, approved: Boolean, applied: List<String> = emptyList()): String {
        val approvedAt = if (approved) "\"2026-01-03T00:00:00Z\"" else "\"\""
        val appliedJson = applied.joinToString(",") { "\"$it\"" }
        return """{"meta":{"approvedAt":$approvedAt,"hldBaseRunId":"$runId","hldEffectiveHash":"$effectiveHash","hldAmendmentsApplied":[$appliedJson]}}"""
    }

    private fun amd(id: String, epicHash: String, status: String, approvedAt: String = ""): String =
        """{"id":"$id","epicHash":"$epicHash","status":"$status","approvedAt":"$approvedAt"}"""

    // ---- ac1 / t3: full projection -------------------------------------------

    @Test
    fun `readAll projects a fully-populated Epic into the right stage and story marks`() {
        val dir = tempArtifacts()
        val runId = "run-abc"
        write(dir, "DEF-hash1.json", def("hash1", "my-epic", approved = true, "s1" to "Story One", "s2" to "Story Two", "s3" to "Story Three"))
        write(dir, "HLD-hash1.json", hld(runId, approved = true))
        write(dir, "AMD-hash1-1.json", amd("AMD-hash1-1", "hash1", "pending"))
        write(dir, "AMD-hash1-2.json", amd("AMD-hash1-2", "hash1", "approved", "2026-02-01T00:00:00Z"))
        // The current effective hash folds in the one approved amendment.
        // s1: approved + not stale (matching hash); s2: present + stale (mismatching); s3: absent LLD
        write(dir, "LLD-hash1-s1.json", lld(runId, effHash(runId, "AMD-hash1-2"), approved = true))
        write(dir, "LLD-hash1-s2.json", lld(runId, "deadbeef", approved = false))

        val chains = readerOver(dir).readAll()
        assertEquals(1, chains.size)
        val chain = chains.single()
        assertEquals("hash1", chain.epicHash)
        assertEquals("my-epic", chain.epicSlug)
        assertTrue(chain.define.exists && chain.define.approved)
        assertTrue(chain.hld.exists && chain.hld.approved)
        assertEquals(3, chain.stories.size)

        val s1 = chain.stories.single { it.id == "s1" }
        assertTrue(s1.hasLld && s1.approved && !s1.stale)
        val s2 = chain.stories.single { it.id == "s2" }
        assertTrue(s2.hasLld && !s2.approved && s2.stale)
        // s2's base run matches, so the reason names the first un-applied approved amendment.
        assertEquals("amendment-AMD-hash1-2", s2.staleReason)
        val s3 = chain.stories.single { it.id == "s3" }
        assertFalse(s3.hasLld)
    }

    // ---- t3: staleness (matching vs mismatching hash) ------------------------

    @Test
    fun `readAll marks a matching-hash LLD not stale and a mismatching-hash LLD stale`() {
        val dir = tempArtifacts()
        val runId = "run-xyz"
        write(dir, "DEF-h2.json", def("h2", "epic-two", approved = true, "s1" to "A", "s2" to "B"))
        write(dir, "HLD-h2.json", hld(runId, approved = true))
        write(dir, "LLD-h2-s1.json", lld(runId, effHash(runId), approved = true))         // matches -> not stale
        write(dir, "LLD-h2-s2.json", lld("OLD-run", effHash("OLD-run"), approved = true))  // built against an old run -> stale (hld-rerun)

        val stories = readerOver(dir).readAll().single().stories
        assertFalse(stories.single { it.id == "s1" }.stale)
        val s2 = stories.single { it.id == "s2" }
        assertTrue(s2.stale)
        assertEquals("hld-rerun", s2.staleReason)
    }

    // ---- t3: amendment tally -------------------------------------------------

    @Test
    fun `readAll counts amendments by matching-epic status and excludes rejected`() {
        val dir = tempArtifacts()
        write(dir, "DEF-h3.json", def("h3", "epic-three", approved = true))
        write(dir, "AMD-h3-1.json", amd("AMD-h3-1", "h3", "pending"))
        write(dir, "AMD-h3-2.json", amd("AMD-h3-2", "h3", "approved", "2026-03-01T00:00:00Z"))
        write(dir, "AMD-h3-3.json", amd("AMD-h3-3", "h3", "rejected"))
        // A different Epic's amendment must not be counted.
        write(dir, "AMD-other-1.json", amd("AMD-other-1", "other", "pending"))

        val chain = readerOver(dir).readAll().single { it.epicHash == "h3" }
        assertEquals(1, chain.amendmentsPending)
        assertEquals(1, chain.amendmentsApproved)
    }

    // ---- t3: never-throws (malformed / missing dir / no dirs) ----------------

    @Test
    fun `readAll swallows a malformed artifact file without throwing`() {
        val dir = tempArtifacts()
        write(dir, "DEF-h4.json", def("h4", "epic-four", approved = true, "s1" to "A"))
        write(dir, "HLD-h4.json", "{ this is not valid json ")
        write(dir, "LLD-h4-s1.json", "}}} broken {{{")

        val chain = readerOver(dir).readAll().single()
        // The broken HLD reads as absent; the broken LLD reads as hasLld=false — no throw.
        assertFalse(chain.hld.exists)
        assertFalse(chain.stories.single { it.id == "s1" }.hasLld)
    }

    @Test
    fun `readAll returns empty for a missing dir and for no dirs, never throwing`() {
        val missing = tempArtifacts().resolve("does-not-exist")
        assertTrue(readerOver(missing).readAll().isEmpty())
        assertTrue(WorkflowChainReader(artifactsDirsProvider = { emptyList() }).readAll().isEmpty())
    }

    @Test
    fun `readAll returns empty for an empty artifacts dir`() {
        assertTrue(readerOver(tempArtifacts()).readAll().isEmpty())
    }

    // ---- t3: HLD-missing staleness guard -------------------------------------

    @Test
    fun `readAll reports a story not stale when the HLD base is missing`() {
        val dir = tempArtifacts()
        write(dir, "DEF-h5.json", def("h5", "epic-five", approved = true, "s1" to "A"))
        // No HLD file — staleness is undefined; must not crash on a null runId.
        write(dir, "LLD-h5-s1.json", lld("some-run", "whatever", approved = true))

        val chain = readerOver(dir).readAll().single()
        assertFalse(chain.hld.exists)
        val s1 = chain.stories.single { it.id == "s1" }
        assertTrue(s1.hasLld)
        assertFalse(s1.stale)
        assertNull(s1.staleReason)
    }

    // ---- t4: nextActionHint precedence ---------------------------------------

    @Test
    fun `nextActionHint follows the documented precedence`() {
        // DEF unapproved -> approve define
        run {
            val dir = tempArtifacts()
            write(dir, "DEF-a.json", def("a", "e", approved = false, "s1" to "A"))
            assertEquals("Approve define", readerOver(dir).readAll().single().nextActionHint)
        }
        // DEF approved, a pending amendment -> review amendments
        run {
            val dir = tempArtifacts()
            write(dir, "DEF-b.json", def("b", "e", approved = true, "s1" to "A"))
            write(dir, "AMD-b-1.json", amd("AMD-b-1", "b", "pending"))
            assertEquals("Review pending amendment(s)", readerOver(dir).readAll().single().nextActionHint)
        }
        // DEF approved, no HLD -> run design
        run {
            val dir = tempArtifacts()
            write(dir, "DEF-c.json", def("c", "e", approved = true, "s1" to "A"))
            assertEquals("Run design (HLD)", readerOver(dir).readAll().single().nextActionHint)
        }
        // DEF+HLD approved, a stale story -> refresh
        run {
            val dir = tempArtifacts()
            val runId = "r"
            write(dir, "DEF-d.json", def("d", "e", approved = true, "s1" to "A"))
            write(dir, "HLD-d.json", hld(runId, approved = true))
            write(dir, "LLD-d-s1.json", lld("OLD", effHash("OLD"), approved = true)) // built against an old run -> stale
            assertEquals("Refresh stale LLD for s1", readerOver(dir).readAll().single().nextActionHint)
        }
    }

    // ---- t2: byte-parity with the CLI computeHldEffectiveHash (golden vectors) ----------

    @Test
    fun `staleness matches CLI-derived golden effective-hash vectors`() {
        // Golden hex produced by the CLI's own computeHldEffectiveHash (artifacts/lld.ts:176)
        //   sha256("golden-run")            and   sha256("golden-run" || "|" || "AMD-g-1")
        val goldenBase = "493d823df17a2dc2cf3a73d915bc1df729927bb74e5b3cbb6e6cf3e50fa34835"
        val goldenWithAmd = "f04398e826d0ffe898125484d313585c335ba2d7033c95319cc5fc3063d78d25"

        // No amendments: an LLD storing the base golden hash must read NOT stale — proving the
        // plugin's hash layout is byte-identical to the CLI's, not merely self-consistent.
        run {
            val dir = tempArtifacts()
            write(dir, "DEF-g.json", def("g", "golden", approved = true, "s1" to "A"))
            write(dir, "HLD-g.json", hld("golden-run", approved = true))
            write(dir, "LLD-g-s1.json", lld("golden-run", goldenBase, approved = true))
            assertFalse(readerOver(dir).readAll().single().stories.single().stale)
        }
        // One approved amendment (AMD-g-1): only the with-amendment golden hash is current.
        run {
            val dir = tempArtifacts()
            write(dir, "DEF-g.json", def("g", "golden", approved = true, "s1" to "A"))
            write(dir, "HLD-g.json", hld("golden-run", approved = true))
            write(dir, "AMD-g-1.json", amd("AMD-g-1", "g", "approved", "2026-05-01T00:00:00Z"))
            write(dir, "LLD-g-s1.json", lld("golden-run", goldenWithAmd, approved = true, applied = listOf("AMD-g-1")))
            assertFalse(readerOver(dir).readAll().single().stories.single().stale)
        }
    }

    // ---- t3: malformed LLD meta reads stale='malformed' (CLI parity) --------------------

    @Test
    fun `readAll marks an LLD missing its effective-hash meta as stale malformed`() {
        val dir = tempArtifacts()
        val runId = "run-m"
        write(dir, "DEF-hm.json", def("hm", "epic-m", approved = true, "s1" to "A"))
        write(dir, "HLD-hm.json", hld(runId, approved = true))
        // Present + parseable LLD but with no hldEffectiveHash — the CLI flags this stale='malformed'.
        write(dir, "LLD-hm-s1.json", """{"meta":{"approvedAt":"2026-01-03T00:00:00Z"}}""")

        val s1 = readerOver(dir).readAll().single().stories.single()
        assertTrue(s1.hasLld)
        assertTrue(s1.stale)
        assertEquals("malformed", s1.staleReason)
    }

    @Test
    fun `nextActionHint is Chain complete when everything is approved and current`() {
        val dir = tempArtifacts()
        val runId = "r"
        write(dir, "DEF-z.json", def("z", "e", approved = true, "s1" to "A", "s2" to "B"))
        write(dir, "HLD-z.json", hld(runId, approved = true))
        write(dir, "LLD-z-s1.json", lld(runId, effHash(runId), approved = true))
        write(dir, "LLD-z-s2.json", lld(runId, effHash(runId), approved = true))
        assertEquals("Chain complete", readerOver(dir).readAll().single().nextActionHint)
    }
}
