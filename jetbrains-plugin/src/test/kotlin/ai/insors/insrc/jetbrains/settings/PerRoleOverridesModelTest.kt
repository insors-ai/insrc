package ai.insors.insrc.jetbrains.settings

import ai.insors.insrc.jetbrains.daemon.RoleDto
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertFalse
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Test

/**
 * S004 unit tests for the pure per-role override logic (PerRoleOverridesModel) —
 * override-vs-default rows, add/change/remove intent, dirty, and the DOTTED
 * roleId -> literal-segment mapping + per-key isolation, tested headlessly.
 */
class PerRoleOverridesModelTest {

    private val tiers = listOf("cheap", "mid", "core")

    private fun model(current: Map<String, String>) = PerRoleOverridesModel(
        roles = listOf(
            RoleDto("design.contract.detail", "core"), // a DOTTED roleId
            RoleDto("classify", "cheap"),
        ),
        tierNames = tiers,
        current = current,
    )

    @Test
    fun `rows list an override with its value and a non-override as default routing`() {
        val m = model(mapOf("design.contract.detail" to "mid"))
        val rows = m.rows().associateBy { it.roleId }
        assertEquals("mid", rows.getValue("design.contract.detail").effectiveTier)
        assertTrue(rows.getValue("design.contract.detail").isOverride)
        assertEquals("cheap", rows.getValue("classify").effectiveTier) // its defaultTier
        assertFalse(rows.getValue("classify").isOverride)
    }

    @Test
    fun `a fresh model is not modified and writes nothing`() {
        val m = model(mapOf("classify" to "mid"))
        assertFalse(m.isModified())
        assertTrue(m.collectWrites().isEmpty())
    }

    @Test
    fun `adding an override to a dotted roleId writes Set at one literal segment`() {
        val m = model(emptyMap())
        m.setOverride("design.contract.detail", "core")
        assertTrue(m.isModified())
        val writes = m.collectWrites()
        assertEquals(1, writes.size) // per-key isolation: only the changed role
        assertEquals(listOf("models", "tasks", "design.contract.detail"), writes[0].segments)
        assertEquals(WriteOp.Set("core"), writes[0].op)
    }

    @Test
    fun `removing an existing override writes Clear and removing an unset role is a no-op`() {
        val m = model(mapOf("classify" to "core"))
        m.removeOverride("classify")
        m.removeOverride("design.contract.detail") // unset -> no-op
        val writes = m.collectWrites()
        assertEquals(1, writes.size)
        assertEquals(listOf("models", "tasks", "classify"), writes[0].segments)
        assertEquals(WriteOp.Clear, writes[0].op)
    }

    @Test
    fun `setting the same tier a role already overrides to is not dirty`() {
        val m = model(mapOf("classify" to "mid"))
        m.setOverride("classify", "mid")
        assertFalse(m.isModified())
        assertTrue(m.collectWrites().isEmpty())
    }

    @Test
    fun `setting an unset role to its own default tier is an explicit override write`() {
        val m = model(emptyMap())
        m.setOverride("classify", "cheap") // classify's defaultTier is cheap
        assertTrue(m.isModified())
        assertEquals(WriteOp.Set("cheap"), m.collectWrites().single().op)
    }

    @Test
    fun `revert restores the saved state`() {
        val m = model(mapOf("classify" to "mid"))
        m.setOverride("classify", "core")
        m.setOverride("design.contract.detail", "cheap")
        assertTrue(m.isModified())
        m.revert()
        assertFalse(m.isModified())
        assertTrue(m.collectWrites().isEmpty())
    }

    @Test
    fun `onSaved advances the baseline so the role is no longer dirty`() {
        val m = model(emptyMap())
        m.setOverride("classify", "core")
        m.onSaved("classify")
        assertFalse(m.isModified())
        assertTrue(m.rows().first { it.roleId == "classify" }.isOverride)
        assertEquals("core", m.rows().first { it.roleId == "classify" }.effectiveTier)
    }

    @Test
    fun `changing one role's override leaves the others untouched (per-key isolation)`() {
        val m = model(mapOf("classify" to "mid", "design.contract.detail" to "core"))
        m.setOverride("classify", "cheap")
        val writes = m.collectWrites()
        assertEquals(1, writes.size)
        assertEquals(listOf("models", "tasks", "classify"), writes[0].segments)
    }
}
