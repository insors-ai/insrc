package ai.insors.insrc.jetbrains.settings

import ai.insors.insrc.jetbrains.daemon.ConfigOptionDto
import ai.insors.insrc.jetbrains.daemon.SettingsCatalogDto
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertFalse
import org.junit.jupiter.api.Assertions.assertNotNull
import org.junit.jupiter.api.Assertions.assertNull
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Test

/**
 * S003 unit tests for the pure edit logic (SettingsEditModel) — the load-bearing
 * per-type validation, dirty-vs-last-saved, reset semantics, and segment/op
 * mapping, tested headlessly (no Swing). Numbers arrive as Gson Doubles on the
 * real socket, so the equality/parse tests feed that shape (the S002 lesson).
 */
class SettingsEditModelTest {

    private fun opt(
        path: String,
        type: String,
        default: Any? = null,
        currentValue: Any? = null,
        isSet: Boolean = false,
        enumValues: List<String>? = null,
    ) = ConfigOptionDto(path, type, default, "desc of $path", enumValues, "General", currentValue, isSet)

    private fun model(vararg options: ConfigOptionDto) =
        SettingsEditModel(SettingsCatalogDto(groups = listOf("General"), options = options.toList(), roles = emptyList(), tierNames = emptyList()))

    @Test
    fun `control-kind maps per declared type`() {
        val m = model(
            opt("e", "enum", enumValues = listOf("a", "b")),
            opt("b", "boolean"),
            opt("n", "number"),
            opt("s", "string"),
            opt("u", "duration"), // unknown type degrades to a text field
        )
        assertEquals(ControlKind.CHOOSER, m.controlKind("e"))
        assertEquals(ControlKind.TOGGLE, m.controlKind("b"))
        assertEquals(ControlKind.NUMBER, m.controlKind("n"))
        assertEquals(ControlKind.TEXT, m.controlKind("s"))
        assertEquals(ControlKind.TEXT, m.controlKind("u"))
    }

    @Test
    fun `a fresh model is not modified and has nothing to write`() {
        val m = model(opt("n", "number", default = 40.0, currentValue = 40.0, isSet = true))
        assertFalse(m.isModified())
        assertTrue(m.collectDirty().isEmpty())
    }

    @Test
    fun `re-typing the same integral number (Gson Double baseline) is not dirty`() {
        // currentValue arrives as a Double 40.0 over the real socket; typing "40" must compare equal.
        val m = model(opt("n", "number", default = 3.0, currentValue = 40.0, isSet = true))
        m.editField("n", "40")
        assertFalse(m.isModified(), "40 == 40.0 numerically -> not dirty (ac2)")
        assertTrue(m.collectDirty().isEmpty())
    }

    @Test
    fun `editing a number to a new value is dirty and writes a numeric Set`() {
        val m = model(opt("n", "number", default = 3.0, currentValue = 40.0, isSet = true))
        m.editField("n", "41")
        assertTrue(m.isModified())
        val dirty = m.collectDirty()
        assertEquals(1, dirty.size)
        assertEquals(listOf("n"), dirty[0].segments)
        val op = dirty[0].op as WriteOp.Set
        assertEquals(41L, (op.value as Number).toLong())
    }

    @Test
    fun `a non-numeric number edit is a validation error and is excluded from writes`() {
        val m = model(opt("n", "number", currentValue = 1.0, isSet = true))
        m.editField("n", "abc")
        assertNotNull(m.validationError("n"))
        assertTrue(m.isModified(), "an invalid edit still counts as modified so apply can surface it")
        assertTrue(m.collectDirty().isEmpty(), "an invalid field is never written")
    }

    @Test
    fun `an enum value outside the declared set is a validation error`() {
        val m = model(opt("e", "enum", currentValue = "info", isSet = true, enumValues = listOf("info", "debug")))
        m.editField("e", "trace")
        assertNotNull(m.validationError("e"))
        m.editField("e", "debug")
        assertNull(m.validationError("e"))
        assertEquals(WriteOp.Set("debug"), m.collectDirty().single().op)
    }

    @Test
    fun `an empty string is a valid string value`() {
        val m = model(opt("s", "string", currentValue = "x", isSet = true))
        m.editField("s", "")
        assertNull(m.validationError("s"))
        assertTrue(m.isModified())
        assertEquals(WriteOp.Set(""), m.collectDirty().single().op)
    }

    @Test
    fun `revertField drops the edit`() {
        val m = model(opt("s", "string", currentValue = "x", isSet = true))
        m.editField("s", "y")
        assertTrue(m.isModified())
        m.revertField("s")
        assertFalse(m.isModified())
        assertTrue(m.collectDirty().isEmpty())
    }

    @Test
    fun `reset-to-default clears a set key but is a no-op on an unset key`() {
        val set = opt("a", "string", default = "d", currentValue = "x", isSet = true)
        val unset = opt("b", "string", default = "d", isSet = false)
        val m = model(set, unset)

        m.markResetToDefault("a")
        m.markResetToDefault("b")
        assertTrue(m.isModified(), "clearing a set key is a change")
        val dirty = m.collectDirty()
        assertEquals(1, dirty.size, "only the set key produces a Clear; the unset key is a no-op")
        assertEquals(listOf("a"), dirty[0].segments)
        assertEquals(WriteOp.Clear, dirty[0].op)
    }

    @Test
    fun `onSaved advances the baseline so the field is no longer dirty`() {
        val m = model(opt("s", "string", currentValue = "x", isSet = true))
        m.editField("s", "y")
        m.onSaved("s")
        assertFalse(m.isModified())
        assertEquals("y", m.controlValue("s"))
    }

    @Test
    fun `onSaved after a clear marks the field unset and shows the default`() {
        val m = model(opt("s", "string", default = "d", currentValue = "x", isSet = true))
        m.markResetToDefault("s")
        m.onSaved("s")
        assertFalse(m.isModified())
        assertEquals("d", m.controlValue("s"), "after a saved clear the control shows the default")
    }

    @Test
    fun `a dotted path maps to literal segments (lc1)`() {
        val m = model(opt("models.coreFloor", "string", currentValue = "core", isSet = true))
        m.editField("models.coreFloor", "mid")
        assertEquals(listOf("models", "coreFloor"), m.collectDirty().single().segments)
    }

    @Test
    fun `an unset field edited to a value is dirty (was using the default)`() {
        val m = model(opt("s", "string", default = "d", isSet = false))
        m.editField("s", "chosen")
        assertTrue(m.isModified())
        assertEquals(WriteOp.Set("chosen"), m.collectDirty().single().op)
    }

    @Test
    fun `re-selecting an unset field's own default is not dirty`() {
        // The control already shows the default for an unset field, so choosing it
        // again is not a change and must not be written (ac2).
        val m = model(opt("e", "enum", default = "info", isSet = false, enumValues = listOf("info", "debug")))
        m.editField("e", "info")
        assertFalse(m.isModified())
        assertTrue(m.collectDirty().isEmpty())
        // but choosing a different value IS dirty
        m.editField("e", "debug")
        assertTrue(m.isModified())
    }

    @Test
    fun `a set-but-null value displays the default (not a blank or false control)`() {
        // A config key explicitly mapped to null (isSet=true, currentValue=null):
        // the control must show the default, matching SettingsView.displayValue.
        val bool = opt("b", "boolean", default = true, currentValue = null, isSet = true)
        val str = opt("s", "string", default = "d", currentValue = null, isSet = true)
        val m = model(bool, str)
        assertEquals(true, m.controlValue("b"), "set-but-null boolean shows its default, not false")
        assertEquals("d", m.controlValue("s"))
    }
}
