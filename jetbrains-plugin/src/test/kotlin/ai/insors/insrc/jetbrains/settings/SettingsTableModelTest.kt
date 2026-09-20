package ai.insors.insrc.jetbrains.settings

import ai.insors.insrc.jetbrains.daemon.ConfigOptionDto
import ai.insors.insrc.jetbrains.daemon.SettingsCatalogDto
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertFalse
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Test

/**
 * S001 rework unit tests for the per-category editable table model (SettingsTableModel)
 * over the UNCHANGED SettingsEditModel: Key/Value/Default columns, only-Value-editable,
 * setValueAt routes to editField (a boolean round-trips as a Boolean), and
 * resetToDefault maps to markResetToDefault.
 */
class SettingsTableModelTest {

    private val enumOpt = ConfigOptionDto("logLevel", "enum", "info", "", listOf("info", "debug"), "General", null, false)
    private val boolOpt = ConfigOptionDto("telemetry", "boolean", false, "", null, "General", false, true)
    private val numOpt = ConfigOptionDto("svc.port", "number", 8080.0, "", null, "General", null, false)
    private val strOpt = ConfigOptionDto("models.local.coreModel", "string", "qwen", "", null, "General", null, false)

    private fun catalog() = SettingsCatalogDto(
        groups = listOf("General"),
        options = listOf(enumOpt, boolOpt, numOpt, strOpt),
        roles = emptyList(),
        tierNames = listOf("cheap", "mid", "core"),
    )

    private fun model(): Pair<SettingsTableModel, SettingsEditModel> {
        val edit = SettingsEditModel(catalog())
        return SettingsTableModel(catalog().options, edit) to edit
    }

    @Test
    fun `three columns Key Value Default and only Value is editable`() {
        val (tm, _) = model()
        assertEquals(3, tm.columnCount)
        assertEquals("Key", tm.getColumnName(SettingsTableModel.COL_KEY))
        assertEquals("Value", tm.getColumnName(SettingsTableModel.COL_VALUE))
        assertEquals("Default", tm.getColumnName(SettingsTableModel.COL_DEFAULT))
        assertEquals(4, tm.rowCount)
        for (row in 0 until tm.rowCount) {
            assertTrue(tm.isCellEditable(row, SettingsTableModel.COL_VALUE))
            assertFalse(tm.isCellEditable(row, SettingsTableModel.COL_KEY))
            assertFalse(tm.isCellEditable(row, SettingsTableModel.COL_DEFAULT))
        }
    }

    @Test
    fun `getValueAt reads path, controlValue, and the default via renderScalar`() {
        val (tm, edit) = model()
        // enum row (index 0)
        assertEquals("logLevel", tm.getValueAt(0, SettingsTableModel.COL_KEY))
        assertEquals(edit.controlValue("logLevel"), tm.getValueAt(0, SettingsTableModel.COL_VALUE))
        assertEquals("info", tm.getValueAt(0, SettingsTableModel.COL_DEFAULT))
        // number row default renders as a whole number via renderScalar (8080, not 8080.0)
        assertEquals("8080", tm.getValueAt(2, SettingsTableModel.COL_DEFAULT))
    }

    @Test
    fun `setValueAt on the Value column routes to editField and a boolean round-trips as a Boolean`() {
        val (tm, edit) = model()
        val boolRow = 1 // telemetry, saved=false
        tm.setValueAt(true, boolRow, SettingsTableModel.COL_VALUE)
        assertTrue(edit.isModified())
        assertEquals(true, edit.controlValue("telemetry")) // Boolean, not "true"
        val dirty = edit.collectDirty().associate { it.segments to it.op }
        assertEquals(WriteOp.Set(true), dirty[listOf("telemetry")])
    }

    @Test
    fun `setValueAt on a non-Value column is ignored`() {
        val (tm, edit) = model()
        tm.setValueAt("hacked", 0, SettingsTableModel.COL_KEY)
        assertFalse(edit.isModified())
    }

    @Test
    fun `resetToDefault maps to markResetToDefault so a set field clears on apply`() {
        val (tm, edit) = model()
        val boolRow = 1 // telemetry is set (isSet=true)
        tm.resetToDefault(boolRow)
        assertTrue(edit.isModified()) // resetting a SET key is a change
        val dirty = edit.collectDirty().associate { it.segments to it.op }
        assertEquals(WriteOp.Clear, dirty[listOf("telemetry")])
    }

    @Test
    fun `controlKind reflects the option type per row`() {
        val (tm, _) = model()
        assertEquals(ControlKind.CHOOSER, tm.controlKind(0))
        assertEquals(ControlKind.TOGGLE, tm.controlKind(1))
        assertEquals(ControlKind.NUMBER, tm.controlKind(2))
        assertEquals(ControlKind.TEXT, tm.controlKind(3))
    }
}
