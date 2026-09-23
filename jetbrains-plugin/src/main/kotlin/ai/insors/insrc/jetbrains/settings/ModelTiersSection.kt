package ai.insors.insrc.jetbrains.settings

import ai.insors.insrc.jetbrains.daemon.DaemonGateway
import ai.insors.insrc.jetbrains.daemon.ModelListResult
import ai.insors.insrc.jetbrains.daemon.SaveResult
import com.intellij.openapi.options.ConfigurationException
import com.intellij.openapi.progress.ProgressManager
import java.awt.BorderLayout
import java.awt.Component
import java.awt.Dimension
import java.awt.FlowLayout
import javax.swing.BorderFactory
import javax.swing.BoxLayout
import javax.swing.DefaultListCellRenderer
import javax.swing.JButton
import javax.swing.JComboBox
import javax.swing.JComponent
import javax.swing.JLabel
import javax.swing.JList
import javax.swing.JPanel

/**
 * The global model-tiers sub-section (Epic ba132c185fe45860 / S004), plugged into
 * the sc3 [SettingsSection] seam. A thin Swing shell of one row per tier — a runner
 * (provider) chooser + a provider-filtered, NON-editable model dropdown (k4) — plus
 * a shared Refresh button, bound to the pure [ModelTiersModel]. All the k7 logic
 * (dropdown / empty+Refresh / '(current, not in catalog)' / clear-on-switch /
 * idempotent no-op) lives in the model; this shell only renders + pushes edits +
 * applies via sc2 (config.write). It imports no cloud/HTTP client and reaches the
 * daemon only through the injected [gateway] (k1/k3).
 *
 * [apply] runs OFF the EDT (the host's modal ProgressManager block): it touches only
 * the model + [gateway] (no Swing), so no EDT/data race. It throws
 * [ConfigurationException] listing the tiers whose write was not Saved, preserving
 * their pending intent. [Refresh] re-queries every provider off the EDT and re-seeds
 * the combos (the model list is never fetched on the EDT).
 */
class ModelTiersSection(
    private val model: ModelTiersModel,
    private val gateway: DaemonGateway,
) : SettingsSection {

    private val rowRefreshers = mutableListOf<() -> Unit>()
    private var suppressEdits = false

    override val title: String = "Model tiers"

    override fun component(): JComponent {
        val panel = JPanel()
        panel.layout = BoxLayout(panel, BoxLayout.Y_AXIS)
        panel.border = BorderFactory.createTitledBorder(title)
        rowRefreshers.clear()
        for (tier in ModelTiersModel.TIERS) panel.add(tierRow(tier))
        panel.add(refreshRow())
        return panel
    }

    override fun isModified(): Boolean = model.isModified()

    override fun reset() {
        model.revert()
        reseedUnderGuard()
    }

    /**
     * Persist the dirty tier runner/model edits via sc2, grouped per tier. Runs OFF
     * the EDT (host modal block). A tier's baseline is advanced (onSaved) only when
     * ALL of its writes Saved; a tier with any failure keeps its pending intent.
     * Throws ConfigurationException naming the failed tiers.
     */
    override fun apply() {
        val failuresByTier = LinkedHashMap<String, MutableList<String>>()
        val touched = LinkedHashSet<String>()
        for (pw in model.collectWrites()) {
            val tier = pw.segments[2] // ["models","tiers",tier,leaf]
            touched.add(tier)
            val result = when (val op = pw.op) {
                is WriteOp.Set -> gateway.writeSetting(pw.segments, op.value)
                WriteOp.Clear -> gateway.clearSetting(pw.segments)
            }
            when (result) {
                SaveResult.Saved -> {}
                is SaveResult.Rejected -> failuresByTier.getOrPut(tier) { mutableListOf() }.add(result.reason)
                is SaveResult.Unavailable -> failuresByTier.getOrPut(tier) { mutableListOf() }.add(result.reason)
            }
        }
        for (tier in touched) {
            if (!failuresByTier.containsKey(tier)) model.onSaved(tier)
        }
        if (failuresByTier.isNotEmpty()) {
            val lines = failuresByTier.entries.map { (tier, reasons) -> "$tier: ${reasons.joinToString("; ")}" }
            throw ConfigurationException("Some model-tier settings could not be saved:\n" + lines.joinToString("\n"))
        }
    }

    // --- rendering ------------------------------------------------------------

    private fun tierRow(tier: String): JComponent {
        val row = JPanel(BorderLayout())
        row.alignmentX = Component.LEFT_ALIGNMENT
        row.add(JLabel(tier), BorderLayout.WEST)

        val controls = JPanel(FlowLayout(FlowLayout.RIGHT, 6, 0))

        val runnerCombo = JComboBox(model.runnerOptions().toTypedArray())
        runnerCombo.selectedItem = model.currentRunner(tier)

        val modelCombo = JComboBox<ModelChoice>()
        modelCombo.isEditable = false // dropdown-only (k4): no free-text model entry.
        modelCombo.renderer = object : DefaultListCellRenderer() {
            override fun getListCellRendererComponent(
                list: JList<*>?,
                value: Any?,
                index: Int,
                isSelected: Boolean,
                cellHasFocus: Boolean,
            ): Component {
                val text = (value as? ModelChoice)?.label ?: ""
                return super.getListCellRendererComponent(list, text, index, isSelected, cellHasFocus)
            }
        }
        seedModelCombo(modelCombo, tier)

        runnerCombo.addActionListener {
            if (suppressEdits) return@addActionListener
            val sel = runnerCombo.selectedItem as? String ?: return@addActionListener
            model.selectRunner(tier, sel)
            // A provider switch clears + re-filters the model combo (ac4).
            reseedModelUnderGuard(modelCombo, tier)
        }
        modelCombo.addActionListener {
            if (suppressEdits) return@addActionListener
            when (val sel = modelCombo.selectedItem) {
                is ModelChoice.Model -> model.selectModel(tier, sel.id)
                // A sentinel / current-not-in-catalog is non-selectable: re-seed to the
                // model's own selection so the pending state is unchanged.
                else -> reseedModelUnderGuard(modelCombo, tier)
            }
        }

        rowRefreshers.add {
            runnerCombo.selectedItem = model.currentRunner(tier)
            seedModelCombo(modelCombo, tier)
        }

        controls.add(runnerCombo)
        controls.add(modelCombo)
        row.add(controls, BorderLayout.EAST)
        row.maximumSize = Dimension(Int.MAX_VALUE, row.preferredSize.height)
        return row
    }

    private fun refreshRow(): JComponent {
        val row = JPanel(FlowLayout(FlowLayout.RIGHT, 6, 0))
        row.alignmentX = Component.LEFT_ALIGNMENT
        val refresh = JButton("Refresh").apply {
            toolTipText = "Re-query the daemon for each provider's available models"
            addActionListener { refreshLists() }
        }
        row.add(refresh)
        row.maximumSize = Dimension(Int.MAX_VALUE, row.preferredSize.height)
        return row
    }

    /** Re-query every provider off the EDT, update the model's lists, and re-seed the combos. */
    private fun refreshLists() {
        val fresh = HashMap<String, ModelListResult>()
        ProgressManager.getInstance().runProcessWithProgressSynchronously({
            for (provider in ModelTiersModel.PROVIDERS) fresh[provider] = gateway.listModels(provider)
        }, "Refreshing model lists…", false, null)
        model.updateLists(fresh)
        reseedUnderGuard()
    }

    private fun seedModelCombo(combo: JComboBox<ModelChoice>, tier: String) {
        combo.removeAllItems()
        for (choice in model.modelOptions(tier)) combo.addItem(choice)
        combo.selectedItem = model.selectedModelChoice(tier)
    }

    private fun reseedModelUnderGuard(combo: JComboBox<ModelChoice>, tier: String) {
        suppressEdits = true
        try {
            seedModelCombo(combo, tier)
        } finally {
            suppressEdits = false
        }
    }

    private fun reseedUnderGuard() {
        suppressEdits = true
        try {
            for (refresh in rowRefreshers) refresh()
        } finally {
            suppressEdits = false
        }
    }
}
