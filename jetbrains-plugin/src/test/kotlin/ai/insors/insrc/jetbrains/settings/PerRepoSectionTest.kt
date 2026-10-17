package ai.insors.insrc.jetbrains.settings

import ai.insors.insrc.jetbrains.daemon.PolicyRowsDto
import ai.insors.insrc.jetbrains.daemon.RepoSettingsResult
import ai.insors.insrc.jetbrains.daemon.SigninDto
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertFalse
import org.junit.jupiter.api.Assertions.assertNull
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Test

/**
 * Story s3 / t9 — the Tracker block of the per-repo settings section, over the pure
 * [RepoTrackerModel] (no Swing): rows come from the daemon's repoFields and each
 * repo's settings payload; one repo's failure shows its reason without blanking the
 * others; sign-in, target and policy rows are read-only.
 */
class PerRepoSectionTest {

    private val a = "/work/a"
    private val b = "/work/b"
    private val c = "/work/c"

    @Test
    fun `one repo's failure shows its reason and the others still render`() {
        val model = RepoTrackerModel(
            TrackerFixtures.fields,
            linkedMapOf(
                a to TrackerFixtures.loaded(a),
                b to RepoSettingsResult.Rejected("/home/u/.insrc/github.json: is not valid JSON"),
                c to RepoSettingsResult.Unavailable("daemon is not running"),
            ),
        )
        assertEquals(listOf(a, b, c), model.repos())

        assertNull(model.failure(a))
        assertEquals(TrackerFixtures.fields.size, model.rows(a).size)

        assertEquals("/home/u/.insrc/github.json: is not valid JSON", model.failure(b))
        assertTrue(model.rows(b).isEmpty(), "a refused repo shows no rows")
        assertEquals("daemon is not running", model.failure(c))
        assertTrue(model.rows(c).isEmpty())

        // The labels, kinds and notes are the daemon's, in its order.
        val rows = model.rows(a)
        assertEquals(TrackerFixtures.fields.map { it.label }, rows.map { it.label })
        assertEquals(TrackerFixtures.fields.map { it.kind }, rows.map { it.kind })
        assertEquals("saved; not used yet", rows.first { it.key == "ghHost" }.note)

        // The loaded repo's values: its own keys, the default hint for an unset row.
        assertEquals("ghe.example.com", rows.first { it.key == "ghHost" }.value)
        assertEquals("(not set)", rows.first { it.key == "ghPath" }.value)
        assertEquals("acme/widgets (per-repo-config)", rows.first { it.key == "target" }.value)
        assertEquals("DEF, HLD", rows.first { it.key == "signoffStages" }.value)

        // Another repo's failure does not touch an edit made on the loaded one.
        model.setEdit(a, "ghHost", "ghe.other.example")
        assertTrue(model.isModified())
        assertEquals(listOf(TrackerWrite(a, "ghHost", "ghe.other.example")), model.collectWrites())
    }

    @Test
    fun `the sign-in row is read-only for signed-in and every failure state`() {
        val states = listOf(
            SigninDto("signed-in", "octocat", null) to "signed in as octocat",
            SigninDto("missing-tool", null, "gh was not found") to "missing-tool: gh was not found",
            SigninDto("missing-signin", null, "gh is not signed in") to "missing-signin: gh is not signed in",
            SigninDto("unreachable", null, "timed out") to "unreachable: timed out",
            SigninDto("rejected", null, "bad credentials") to "rejected: bad credentials",
            SigninDto("disabled", null, "the tracker is off for this repo") to "disabled: the tracker is off for this repo",
        )
        for ((signin, expected) in states) {
            val model = RepoTrackerModel(TrackerFixtures.fields, mapOf(a to TrackerFixtures.loaded(a, signin = signin)))
            val row = model.rows(a).first { it.key == "signin" }
            assertEquals(expected, row.value, "sign-in text for ${signin.state}")
            assertFalse(row.editable, "the sign-in row is never editable (${signin.state})")
            assertEquals("status", row.kind)

            // An edit attempt on the sign-in row is ignored.
            model.setEdit(a, "signin", "hacked")
            assertFalse(model.isModified(), "a read-only row takes no edit (${signin.state})")
        }
    }

    @Test
    fun `only local rows are editable, a blank edit clears, an unchanged edit is dropped`() {
        val model = RepoTrackerModel(TrackerFixtures.fields, mapOf(a to TrackerFixtures.loaded(a)))
        val editable = model.rows(a).filter { it.editable }.map { it.key }
        assertEquals(listOf("type", "owner", "repo", "ghPath", "ghHost", "branchPattern"), editable)
        assertTrue(model.rows(a).filter { it.kind != "local" }.none { it.editable })

        model.setEdit(a, "teamMode", "false")      // policy row: ignored
        model.setEdit(a, "target", "x/y")          // status row: ignored
        model.setEdit(a, "nope", "x")              // unknown row: ignored
        assertFalse(model.isModified())

        model.setEdit(a, "ghHost", "  ")           // blank on a set row = clear
        assertEquals(listOf(TrackerWrite(a, "ghHost", null)), model.collectWrites())

        model.setEdit(a, "ghHost", "ghe.example.com")   // back to the stored value: no edit
        assertFalse(model.isModified())

        model.setEdit(a, "ghPath", "/usr/local/bin/gh")
        model.revert()
        assertFalse(model.isModified())
        assertTrue(model.collectWrites().isEmpty())
    }

    @Test
    fun `a saved edit leaves the pending set and a re-read replaces the repo's result`() {
        val model = RepoTrackerModel(TrackerFixtures.fields, mapOf(a to TrackerFixtures.loaded(a)))
        model.setEdit(a, "ghPath", "/opt/gh")
        model.setEdit(a, "branchPattern", "{id}-{slug}")
        assertEquals(2, model.collectWrites().size)

        model.onSaved(a, "ghPath")
        assertEquals(listOf(TrackerWrite(a, "branchPattern", "{id}-{slug}")), model.collectWrites())

        model.replace(a, TrackerFixtures.loaded(a, values = mapOf("ghPath" to "/opt/gh", "ghHost" to "ghe.example.com")))
        assertEquals("/opt/gh", model.rows(a).first { it.key == "ghPath" }.value)
        // An unset row with a daemon default shows that default as a hint; the stored value stays empty.
        val ghHost = model.rows(a).first { it.key == "ghHost" }
        assertEquals("ghe.example.com", ghHost.value)
        model.replace(a, TrackerFixtures.loaded(a, values = emptyMap()))
        val unset = model.rows(a).first { it.key == "ghHost" }
        assertEquals("github.com (default)", unset.value)
        assertEquals("", unset.current)
    }

    @Test
    fun `policy rows read the policy mode and reason`() {
        val none = RepoTrackerModel(TrackerFixtures.fields, mapOf(a to TrackerFixtures.loaded(a, policy = PolicyRowsDto(true, "none", emptyMap(), null))))
        assertEquals("no team policy", none.rows(a).first { it.key == "teamMode" }.value)
        val bad = RepoTrackerModel(TrackerFixtures.fields, mapOf(a to TrackerFixtures.loaded(a, policy = PolicyRowsDto(false, null, emptyMap(), "no default branch known"))))
        assertEquals("unavailable: no default branch known", bad.rows(a).first { it.key == "signoffStages" }.value)
        assertEquals("true", RepoTrackerModel(TrackerFixtures.fields, mapOf(a to TrackerFixtures.loaded(a))).rows(a).first { it.key == "teamMode" }.value)
    }
}
