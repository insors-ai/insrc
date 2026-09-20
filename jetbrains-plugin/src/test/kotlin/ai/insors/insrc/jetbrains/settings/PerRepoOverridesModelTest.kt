package ai.insors.insrc.jetbrains.settings

import ai.insors.insrc.jetbrains.daemon.RepoOverrideDto
import ai.insors.insrc.jetbrains.daemon.RoleDto
import ai.insors.insrc.jetbrains.daemon.TierSpecDto
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertFalse
import org.junit.jupiter.api.Assertions.assertNull
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Test

/**
 * S005 unit tests for the pure per-repo override logic (PerRepoOverridesModel) —
 * rows/addableRepos, add/remove/edit across coreFloor + tasks + tiers, dirty, the
 * DOTTED/SLASHED repoPath + dotted-roleId leaf-granular nested-key mapping,
 * per-key isolation, and the whole-override single-Clear, tested headlessly.
 */
class PerRepoOverridesModelTest {

    private val tiers = listOf("cheap", "mid", "core")
    private val roles = listOf(
        RoleDto("design.contract.detail", "core"), // a DOTTED roleId
        RoleDto("classify", "cheap"),
    )

    /** A registered set incl. a dotted/slashed path; used across the tests. */
    private val registered = listOf("/work/afm", "/Users/x/work/insors.ide", "/plain")

    private fun model(current: Map<String, RepoOverrideDto>) = PerRepoOverridesModel(
        registeredRepos = registered,
        roles = roles,
        tierNames = tiers,
        current = current,
    )

    /** A repo overridden on all three knobs (coreFloor + a task + a tier spec). */
    private val fullOverride = RepoOverrideDto(
        coreFloor = "mid",
        tasks = mapOf("design.contract.detail" to "core"),
        tiers = mapOf("core" to TierSpecDto(runner = "cli-claude", model = "opus")),
    )

    @Test
    fun `rows list an overridden repo with its nested settings and addableRepos shows repos with none`() {
        val m = model(mapOf("/work/afm" to fullOverride))
        val row = m.rows().single { it.repoPath == "/work/afm" }
        assertEquals("mid", row.coreFloor)
        assertEquals(mapOf("design.contract.detail" to "core"), row.tasks)
        assertEquals(TierSpecDto("cli-claude", "opus"), row.tiers["core"])
        assertTrue(row.hasOverride)
        // registered minus the one overridden repo.
        assertEquals(listOf("/Users/x/work/insors.ide", "/plain"), m.addableRepos())
    }

    @Test
    fun `a repo present in the config but not registered is a row and not addable`() {
        val m = model(
            mapOf("/ghost" to RepoOverrideDto(coreFloor = "cheap", tasks = emptyMap(), tiers = emptyMap())),
        )
        assertTrue(m.rows().any { it.repoPath == "/ghost" })
        assertFalse("/ghost" in m.addableRepos())
        // all three registered repos are still addable (none overridden).
        assertEquals(registered, m.addableRepos())
    }

    @Test
    fun `a fresh model is not modified and writes nothing`() {
        val m = model(mapOf("/work/afm" to fullOverride))
        assertFalse(m.isModified())
        assertTrue(m.collectWrites().isEmpty())
    }

    @Test
    fun `adding an override to a dotted-slashed repo writes coreFloor Set at one literal segment`() {
        val m = model(emptyMap())
        m.addOverride("/Users/x/work/insors.ide")
        m.setCoreFloor("/Users/x/work/insors.ide", "mid")
        val writes = m.collectWrites()
        assertEquals(1, writes.size)
        assertEquals(listOf("models", "byRepo", "/Users/x/work/insors.ide", "coreFloor"), writes[0].segments)
        assertEquals(WriteOp.Set("mid"), writes[0].op)
    }

    @Test
    fun `setting a per-role task with a dotted roleId writes Set at one literal segment`() {
        val m = model(emptyMap())
        m.addOverride("/plain")
        m.setTaskTier("/plain", "design.contract.detail", "core")
        val writes = m.collectWrites()
        assertEquals(1, writes.size)
        assertEquals(listOf("models", "byRepo", "/plain", "tasks", "design.contract.detail"), writes[0].segments)
        assertEquals(WriteOp.Set("core"), writes[0].op)
    }

    @Test
    fun `a tier runner and model are two independent leaves`() {
        val m = model(emptyMap())
        m.addOverride("/plain")
        m.setTierField("/plain", "core", TierField.Runner, "ollama")
        m.setTierField("/plain", "core", TierField.Model, "qwen")
        val bySeg = m.collectWrites().associate { it.segments to it.op }
        assertEquals(2, bySeg.size)
        assertEquals(WriteOp.Set("ollama"), bySeg[listOf("models", "byRepo", "/plain", "tiers", "core", "runner")])
        assertEquals(WriteOp.Set("qwen"), bySeg[listOf("models", "byRepo", "/plain", "tiers", "core", "model")])
    }

    @Test
    fun `changing one leaf of one repo writes exactly one PendingWrite (per-key isolation)`() {
        val m = model(mapOf("/work/afm" to fullOverride))
        m.setCoreFloor("/work/afm", "core") // was mid
        val writes = m.collectWrites()
        assertEquals(1, writes.size)
        assertEquals(listOf("models", "byRepo", "/work/afm", "coreFloor"), writes[0].segments)
        assertEquals(WriteOp.Set("core"), writes[0].op)
    }

    @Test
    fun `removing a whole override writes ONE Clear at the repoPath and drops the row`() {
        val m = model(mapOf("/work/afm" to fullOverride))
        m.removeOverride("/work/afm")
        val writes = m.collectWrites()
        assertEquals(1, writes.size)
        assertEquals(listOf("models", "byRepo", "/work/afm"), writes[0].segments)
        assertEquals(WriteOp.Clear, writes[0].op)
        assertFalse(m.rows().any { it.repoPath == "/work/afm" })
    }

    @Test
    fun `setting the same coreFloor a repo already has is not dirty`() {
        val m = model(mapOf("/work/afm" to fullOverride))
        m.setCoreFloor("/work/afm", "mid") // unchanged
        assertFalse(m.isModified())
        assertTrue(m.collectWrites().isEmpty())
    }

    @Test
    fun `clearing an unset task leaf is a no-op`() {
        val m = model(mapOf("/work/afm" to fullOverride))
        m.setTaskTier("/work/afm", "classify", null) // classify was never set
        assertFalse(m.isModified())
        assertTrue(m.collectWrites().isEmpty())
    }

    @Test
    fun `add then revert restores the saved state and re-offers the repo`() {
        val m = model(emptyMap())
        m.addOverride("/plain")
        m.setCoreFloor("/plain", "mid")
        assertTrue(m.isModified())
        m.revert()
        assertFalse(m.isModified())
        assertTrue(m.collectWrites().isEmpty())
        assertTrue("/plain" in m.addableRepos())
    }

    @Test
    fun `onSaved advances the coreFloor baseline so the repo is no longer dirty`() {
        val m = model(emptyMap())
        m.addOverride("/plain")
        m.setCoreFloor("/plain", "mid")
        val write = m.collectWrites().single()
        m.onSaved(write.segments)
        assertFalse(m.isModified())
        assertEquals("mid", m.rows().single { it.repoPath == "/plain" }.coreFloor)
    }

    @Test
    fun `onSaved of a whole-override clear drops the repo from the baseline and re-offers it`() {
        val m = model(mapOf("/work/afm" to fullOverride))
        m.removeOverride("/work/afm")
        m.onSaved(listOf("models", "byRepo", "/work/afm"))
        assertFalse(m.isModified())
        assertFalse(m.rows().any { it.repoPath == "/work/afm" })
        assertTrue("/work/afm" in m.addableRepos())
    }

    @Test
    fun `re-adding a repo after a persisted whole-override removal starts from a clean slate`() {
        val m = model(mapOf("/work/afm" to fullOverride))
        // Remove the whole override and persist it (onSaved on the repoPath Clear).
        m.removeOverride("/work/afm")
        m.onSaved(listOf("models", "byRepo", "/work/afm"))
        // Re-add the (now clean) repo in the same session.
        m.addOverride("/work/afm")
        val row = m.rows().single { it.repoPath == "/work/afm" }
        assertNull(row.coreFloor)
        assertTrue(row.tasks.isEmpty())
        assertTrue(row.tiers.isEmpty())
        // A clean re-add with no edits is not dirty and resurrects nothing.
        assertFalse(m.isModified())
        assertTrue(m.collectWrites().isEmpty())
    }

    @Test
    fun `removing then re-adding WITHOUT applying returns to the saved override (a no-op)`() {
        val m = model(mapOf("/work/afm" to fullOverride))
        m.removeOverride("/work/afm") // not applied
        m.addOverride("/work/afm")
        // Working state is unchanged from the saved override -> no writes.
        assertFalse(m.isModified())
        assertTrue(m.collectWrites().isEmpty())
        val row = m.rows().single { it.repoPath == "/work/afm" }
        assertEquals("mid", row.coreFloor)
        assertEquals(mapOf("design.contract.detail" to "core"), row.tasks)
    }

    @Test
    fun `editing one repo leaves another repo untouched`() {
        val m = model(
            mapOf(
                "/work/afm" to fullOverride,
                "/plain" to RepoOverrideDto("core", emptyMap(), emptyMap()),
            ),
        )
        m.setCoreFloor("/work/afm", "core")
        val writes = m.collectWrites()
        assertEquals(1, writes.size)
        assertEquals("/work/afm", writes[0].segments[2])
        // the untouched repo keeps its saved coreFloor.
        assertEquals("core", m.rows().single { it.repoPath == "/plain" }.coreFloor)
    }

    @Test
    fun `clearing a set coreFloor writes Clear at the coreFloor leaf`() {
        val m = model(mapOf("/work/afm" to fullOverride))
        m.setCoreFloor("/work/afm", null)
        val write = m.collectWrites().single()
        assertEquals(listOf("models", "byRepo", "/work/afm", "coreFloor"), write.segments)
        assertEquals(WriteOp.Clear, write.op)
        assertNull(m.rows().single { it.repoPath == "/work/afm" }.coreFloor)
    }
}
