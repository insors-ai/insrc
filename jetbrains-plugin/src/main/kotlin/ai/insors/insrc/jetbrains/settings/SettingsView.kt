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
