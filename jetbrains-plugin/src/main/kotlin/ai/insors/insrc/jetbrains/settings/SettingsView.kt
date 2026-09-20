package ai.insors.insrc.jetbrains.settings

import ai.insors.insrc.jetbrains.daemon.ConfigOptionDto
import ai.insors.insrc.jetbrains.daemon.SettingsCatalogDto

/**
 * The settings-page framework's PURE view logic (Story S002 / sc3), kept out of
 * the Swing/Configurable shell so grouping + current-vs-default display are
 * unit-testable headlessly (the review-epic split that repeatedly caught silent
 * UI defects).
 */

/** One group's options, in catalog order — one collapsible panel on the page. */
data class SettingsGroupModel(
    val group: String,
    val options: List<ConfigOptionDto>,
)

/**
 * The extension seam where downstream stories plug their own sub-sections into
 * the settings page: the per-role overrides (S004) and per-repo overrides
 * (S005). S002 declares it but registers no override section.
 */
interface SettingsSection {
    val title: String
    fun component(): javax.swing.JComponent
    fun isModified(): Boolean
    fun apply()
    fun reset()
}

object SettingsView {

    /**
     * Bucket the catalog's options into ordered [SettingsGroupModel]s:
     *   - groups appear in the payload's `groups` order first;
     *   - a group with no options yields NO model (no empty panel);
     *   - an option whose group is not listed in `groups` falls into a trailing
     *     bucket (in first-seen order), so no option is ever dropped.
     * Every option appears in exactly one model.
     */
    fun groupsOf(catalog: SettingsCatalogDto): List<SettingsGroupModel> {
        // Preserve option order per group.
        val byGroup = LinkedHashMap<String, MutableList<ConfigOptionDto>>()
        for (opt in catalog.options) {
            byGroup.getOrPut(opt.group) { mutableListOf() }.add(opt)
        }
        val out = mutableListOf<SettingsGroupModel>()
        val emitted = HashSet<String>()
        // Declared groups first, in payload order (skip ones with no options).
        for (g in catalog.groups) {
            val opts = byGroup[g] ?: continue
            out.add(SettingsGroupModel(g, opts))
            emitted.add(g)
        }
        // Any option whose group was not in groups[] — trailing, first-seen order.
        for ((g, opts) in byGroup) {
            if (g !in emitted) out.add(SettingsGroupModel(g, opts))
        }
        return out
    }

    /**
     * The read-only display string for one option: the current value when set,
     * else the default rendered with an explicit "(default)" marker so an unset
     * setting is never shown as a blank field (ac2).
     *
     * A set-but-null currentValue (an unusual config that maps a path to JSON
     * null) falls back to the default rather than showing the literal "null".
     */
    fun displayValue(option: ConfigOptionDto): String {
        if (option.isSet && option.currentValue != null) return render(option.currentValue)
        val default = option.default
        return "${if (default != null) render(default) else "—"} (default)"
    }

    /**
     * Render one config value for display. The real socket transport parses JSON
     * numbers through Gson (ToNumberPolicy.DOUBLE), so every numeric default and
     * currentValue arrives as a [Double] — a naive toString() would print an
     * integral setting like `40` as "40.0" (and a large one as "1.2E5"). Collapse
     * an integral Number back to its whole-number form; everything else is
     * toString() verbatim.
     */
    /**
     * Render a scalar value for an EDIT field (no "(default)" marker): an integral
     * number comes back without the Gson-Double artifact ("40", not "40.0"); null
     * is the empty string. Used by S003 to seed number/text editors.
     */
    fun renderScalar(value: Any?): String = if (value == null) "" else render(value)

    private fun render(value: Any): String {
        if (value is Number) {
            val d = value.toDouble()
            if (!d.isInfinite() && !d.isNaN() && d == Math.floor(d) && Math.abs(d) < 1e15) {
                return value.toLong().toString()
            }
        }
        return value.toString()
    }
}

/** The kind of edit control a setting's declared type maps to (Story S003 / ac1). */
enum class ControlKind { CHOOSER, TOGGLE, NUMBER, TEXT }

/** The operation a [PendingWrite] carries: set a parsed value, or clear the key. */
sealed interface WriteOp {
    /** Persist [value] (already parsed to the right JVM type). */
    data class Set(val value: Any?) : WriteOp

    /** Remove the key so the daemon default governs (reset-to-default / override removal). */
    data object Clear : WriteOp
}

/** One dirty setting the Configurable applies via sc2: literal [segments] + the [op]. */
data class PendingWrite(val segments: List<String>, val op: WriteOp)

/**
 * The pure, headless edit state for the whole settings page (Story S003 / sc3
 * internal). Kept out of the Swing/Configurable shell so the load-bearing logic
 * — per-type validation, dirty-vs-last-saved, reset semantics, and the segment/op
 * mapping — is unit-testable (the review-epic split). The Configurable is a thin
 * shell that renders controls, pushes edits in via [editField]/[revertField]/
 * [markResetToDefault], and delegates its native isModified/apply/reset here.
 *
 * Number parsing tolerates the Gson-Double catalog shape (an integral default
 * arrives as e.g. 40.0), so re-typing the same number is NOT counted as an edit
 * (unchanged settings are never written — ac2).
 */
class SettingsEditModel(catalog: SettingsCatalogDto) {

    private class FieldState(val option: ConfigOptionDto) {
        var savedIsSet: Boolean = option.isSet
        var savedValue: Any? = if (option.isSet) option.currentValue else null
        var edited: Boolean = false
        var pendingRaw: Any? = null
        var resetToDefault: Boolean = false
    }

    private val fields: Map<String, FieldState> =
        catalog.options.associate { it.path to FieldState(it) }

    private fun field(path: String): FieldState =
        fields[path] ?: throw IllegalArgumentException("unknown setting path: $path")

    /** The control kind for one setting's declared type (ac1). */
    fun controlKind(path: String): ControlKind = controlKindFor(field(path).option)

    /** Record a user edit (raw control input: a Boolean from a toggle, else a String). Clears any reset flag. */
    fun editField(path: String, rawInput: Any?) {
        val f = field(path)
        f.edited = true
        f.pendingRaw = rawInput
        f.resetToDefault = false
    }

    /** Revert one field to its last-saved value (drops any edit / reset). */
    fun revertField(path: String) {
        val f = field(path)
        f.edited = false
        f.pendingRaw = null
        f.resetToDefault = false
    }

    /** Mark one field to be reset to its catalog default (a clear). Drops any pending edit. */
    fun markResetToDefault(path: String) {
        val f = field(path)
        f.resetToDefault = true
        f.edited = false
        f.pendingRaw = null
    }

    /**
     * The validation error for one field's pending edit, or null when it is valid
     * (or not edited). A number that does not parse, or an enum value outside the
     * declared set, is invalid; an empty string is a VALID string.
     */
    fun validationError(path: String): String? {
        val f = field(path)
        if (!f.edited || f.resetToDefault) return null
        return when (controlKindFor(f.option)) {
            ControlKind.NUMBER ->
                if (parseNumber(f.pendingRaw) == null) "must be a number" else null
            ControlKind.CHOOSER -> {
                val allowed = f.option.enumValues
                val v = f.pendingRaw?.toString()
                if (allowed != null && v !in allowed) "must be one of: ${allowed.joinToString(", ")}" else null
            }
            ControlKind.TOGGLE, ControlKind.TEXT -> null
        }
    }

    /** True iff any field carries an unsaved change (a real value change, a reset of a set key, or an invalid edit). */
    fun isModified(): Boolean = fields.values.any { it.dirtyOrInvalid() }

    /**
     * The dirty, validation-clean fields as [PendingWrite]s the Configurable
     * applies via sc2. A field with a [validationError] is EXCLUDED (apply blocks
     * on it separately); a reset of an already-unset key is a no-op (excluded).
     */
    fun collectDirty(): List<PendingWrite> =
        fields.values.mapNotNull { f ->
            when {
                f.resetToDefault && f.savedIsSet ->
                    PendingWrite(segmentsOf(f.option.path), WriteOp.Clear)
                f.edited && validationErrorOf(f) == null && parsedDiffers(f) ->
                    PendingWrite(segmentsOf(f.option.path), WriteOp.Set(parsedValue(f)))
                else -> null
            }
        }

    /** Advance one field's last-saved baseline after its write persisted (ac2/ac3). */
    fun onSaved(path: String) {
        val f = field(path)
        if (f.resetToDefault) {
            f.savedIsSet = false
            f.savedValue = null
        } else if (f.edited) {
            f.savedIsSet = true
            f.savedValue = parsedValue(f)
        }
        f.edited = false
        f.pendingRaw = null
        f.resetToDefault = false
    }

    /**
     * The value a control should display for one field (on build and after a
     * revert/reset): the pending edit when editing, the catalog default when
     * marked reset-to-default, else the last-saved value when set, else the
     * default. Booleans come back as Boolean; other types as their raw value.
     */
    fun controlValue(path: String): Any? {
        val f = field(path)
        return when {
            f.resetToDefault -> f.option.default
            f.edited -> f.pendingRaw
            // A set-but-null value (a config key explicitly mapped to null) shows
            // the default, matching SettingsView.displayValue — never a blank/false
            // control that misrepresents the effective value.
            f.savedIsSet && f.savedValue != null -> f.savedValue
            else -> f.option.default
        }
    }

    // ---- internals -----------------------------------------------------------

    private fun FieldState.dirtyOrInvalid(): Boolean = when {
        resetToDefault -> savedIsSet // resetting an already-unset key is a no-op
        edited -> validationErrorOf(this) != null || parsedDiffers(this)
        else -> false
    }

    private fun validationErrorOf(f: FieldState): String? = validationError(f.option.path)

    /**
     * Whether the field's parsed pending value differs from what is effectively in
     * force. For a SET key that is the last-saved value; for an UNSET key it is the
     * catalog default (which the control is showing) — so re-selecting an unset
     * field's own default is NOT a change and is never written (ac2).
     */
    private fun parsedDiffers(f: FieldState): Boolean {
        val effective = if (f.savedIsSet && f.savedValue != null) f.savedValue else f.option.default
        return !valuesEqual(parsedValue(f), effective)
    }

    /** The typed value for a valid pending edit (Boolean / Number / String). */
    private fun parsedValue(f: FieldState): Any? = when (controlKindFor(f.option)) {
        ControlKind.TOGGLE -> f.pendingRaw as? Boolean ?: f.pendingRaw?.toString()?.toBoolean() ?: false
        ControlKind.NUMBER -> parseNumber(f.pendingRaw)
        ControlKind.CHOOSER, ControlKind.TEXT -> f.pendingRaw?.toString() ?: ""
    }

    private companion object {
        fun controlKindFor(option: ConfigOptionDto): ControlKind = when (option.type) {
            "enum" -> ControlKind.CHOOSER
            "boolean" -> ControlKind.TOGGLE
            "number" -> ControlKind.NUMBER
            else -> ControlKind.TEXT
        }

        /** Split a config path into literal segments (lc1/k4 — passed verbatim to config.write). */
        fun segmentsOf(path: String): List<String> = path.split('.')

        /** Parse a numeric editor input, preferring an integral Long; null when it does not parse. */
        fun parseNumber(raw: Any?): Number? {
            if (raw is Number) return raw
            val s = raw?.toString()?.trim() ?: return null
            if (s.isEmpty()) return null
            return s.toLongOrNull() ?: s.toDoubleOrNull()
        }

        /** Numeric-aware equality: two Numbers compare by their double value (40L == 40.0). */
        fun valuesEqual(a: Any?, b: Any?): Boolean {
            if (a is Number && b is Number) return a.toDouble() == b.toDouble()
            return a == b
        }
    }
}
