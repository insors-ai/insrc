package ai.insors.insrc.jetbrains.settings

import ai.insors.insrc.jetbrains.daemon.DaemonGateway
import ai.insors.insrc.jetbrains.daemon.SaveResult
import com.intellij.openapi.options.ConfigurationException
import java.awt.BorderLayout
import java.awt.Component
import java.awt.Dimension
import javax.swing.BorderFactory
import javax.swing.BoxLayout
import javax.swing.JComboBox
import javax.swing.JComponent
import javax.swing.JLabel
import javax.swing.JPanel

/**
 * The per-role model-override sub-section (Story S004), plugged into the sc3
 * [SettingsSection] seam. A thin Swing shell of one row per recognized role — a
 * tier chooser whose first entry means "use the default routing" — bound to the
 * pure [PerRoleOverridesModel]. All load-bearing logic (override-vs-default,
 * dirty, the roleId->literal-segment mapping) lives in the model; this shell only
 * renders + pushes edits + applies via sc2.
 *
 * [apply] is designed to run OFF the EDT (the host invokes it inside a modal
 * ProgressManager block): it touches only the model + [gateway] (no Swing), so
 * there is no EDT/data race. It throws [ConfigurationException] listing the roles
 * whose write was not Saved, preserving their pending intent (ac2/ac3).
 */
class PerRoleSection(
    private val model: PerRoleOverridesModel,
    private val gateway: DaemonGateway,
) : SettingsSection {

    /** The chooser's first item — selecting it removes the role's override. */
    private val useDefault = "(use default)"

    /** Per-row re-seeders, run on reset() to reflect model state (on the EDT). */
    private val rowRefreshers = mutableListOf<() -> Unit>()
    private var suppressEdits = false

    override val title: String = "Per-role model overrides"

    override fun component(): JComponent {
        val panel = JPanel()
        panel.layout = BoxLayout(panel, BoxLayout.Y_AXIS)
        panel.border = BorderFactory.createTitledBorder(title)
        rowRefreshers.clear()
        for (row in model.rows()) panel.add(roleRow(row.roleId))
        return panel
    }

    override fun isModified(): Boolean = model.isModified()

    override fun reset() {
        model.revert()
        suppressEdits = true
        try {
            for (refresh in rowRefreshers) refresh()
        } finally {
            suppressEdits = false
        }
    }

    /**
     * Persist the dirty per-role overrides via sc2. Runs OFF the EDT (host modal
     * block). onSaved advances only the Saved roles; a not-Saved role keeps its
     * pending intent; throws ConfigurationException naming the failed roles (ac2/ac3).
     */
    override fun apply() {
        val failures = mutableListOf<String>()
        for (pw in model.collectWrites()) {
            val roleId = pw.segments.last() // ["models","tasks",roleId]
            val result = when (val op = pw.op) {
                is WriteOp.Set -> gateway.writeSetting(pw.segments, op.value)
                WriteOp.Clear -> gateway.clearSetting(pw.segments)
            }
            when (result) {
                SaveResult.Saved -> model.onSaved(roleId)
                is SaveResult.Rejected -> failures.add("$roleId: ${result.reason}")
                is SaveResult.Unavailable -> failures.add("$roleId: ${result.reason}")
            }
        }
        if (failures.isNotEmpty()) {
            throw ConfigurationException(
                "Some per-role overrides could not be saved:\n" + failures.joinToString("\n"),
            )
        }
    }

    // --- rendering ------------------------------------------------------------

    private fun roleRow(roleId: String): JComponent {
        val row = JPanel(BorderLayout())
        row.alignmentX = Component.LEFT_ALIGNMENT
        val name = JLabel(roleId)
        row.add(name, BorderLayout.WEST)

        // First item = "use default"; the rest are the daemon's tier names.
        val items = (listOf(useDefault) + model.tierNames()).toTypedArray()
        val combo = JComboBox(items)
        combo.selectedItem = selectionFor(roleId)
        combo.addActionListener {
            if (suppressEdits) return@addActionListener
            val sel = combo.selectedItem?.toString()
            if (sel == null || sel == useDefault) model.removeOverride(roleId)
            else model.setOverride(roleId, sel)
        }
        rowRefreshers.add { combo.selectedItem = selectionFor(roleId) }

        row.add(combo, BorderLayout.EAST)
        row.maximumSize = Dimension(Int.MAX_VALUE, row.preferredSize.height)
        return row
    }

    /** The combo selection reflecting the model's PENDING state for a role. */
    private fun selectionFor(roleId: String): String {
        val r = model.rows().first { it.roleId == roleId }
        return if (r.isOverride) r.effectiveTier else useDefault
    }
}
