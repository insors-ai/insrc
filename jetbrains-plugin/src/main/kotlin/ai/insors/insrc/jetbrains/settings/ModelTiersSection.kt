package ai.insors.insrc.jetbrains.settings

import ai.insors.insrc.jetbrains.daemon.DaemonGateway
import ai.insors.insrc.jetbrains.daemon.ModelDefinitionsDto
import ai.insors.insrc.jetbrains.daemon.ModelDefinitionsResult
import ai.insors.insrc.jetbrains.daemon.SaveResult
import ai.insors.insrc.jetbrains.daemon.SettingsCatalogDto
import ai.insors.insrc.jetbrains.lifecycle.DaemonLifecycleCommandRunner
import com.intellij.openapi.options.ConfigurationException
import com.intellij.openapi.progress.ProgressManager
import com.intellij.ui.JBColor
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
 * The global model-tiers sub-section (Epic ba132c185fe45860 / S004; Epic
 * ce99b72065d03b1b, Story s7), plugged into the sc3 [SettingsSection] seam. A thin Swing
 * shell of one row per tier — a runner chooser, a NON-editable model dropdown and an
 * effort dropdown, all filled from the daemon's model definitions through the pure
 * [ModelTiersModel] — plus a shared Refresh button. It reaches the daemon only through
 * the injected [gateway] and keeps no runner, model or effort list of its own.
 *
 * When the definitions cannot be read the section shows the classified failure and no
 * editable rows; Refresh re-reads them off the EDT. [apply] runs OFF the EDT (the host's
 * modal ProgressManager block): it touches only the model + [gateway] (no Swing). Each
 * changed tier is written whole; a tier the model refuses to save (an unlisted or
 * missing model) or the daemon refuses keeps its pending edit, and [apply] throws
 * [ConfigurationException] naming it with the reason and the daemon's detail.
 */
class ModelTiersSection(
    private val catalog: SettingsCatalogDto,
    initial: ModelDefinitionsResult,
    private val gateway: DaemonGateway,
) : SettingsSection {

    private var definitions: ModelDefinitionsDto? = (initial as? ModelDefinitionsResult.Loaded)?.definitions
    private var model: ModelTiersModel? = definitions?.let { ModelTiersModel(catalog, it) }
    private var status: String? = (initial as? ModelDefinitionsResult.Failed)?.failure?.text

    private val body = JPanel().apply { layout = BoxLayout(this, BoxLayout.Y_AXIS) }
    private val rowRefreshers = mutableListOf<() -> Unit>()
    private var suppressEdits = false

    override val title: String = "Model tiers"

    override fun component(): JComponent {
        val panel = JPanel()
        panel.layout = BoxLayout(panel, BoxLayout.Y_AXIS)
        panel.border = BorderFactory.createTitledBorder(title)
        body.alignmentX = Component.LEFT_ALIGNMENT
        rebuildBody()
        panel.add(body)
        panel.add(refreshRow())
        return panel
    }

    override fun isModified(): Boolean = model?.isModified() ?: false

    /** Set when a write of the last apply was saved with the daemon's restartRequired. */
    @Volatile
    private var restartRequired = false

    override fun takeRestartRequired(): Boolean = restartRequired.also { restartRequired = false }

    override fun reset() {
        model?.revert()
        reseedUnderGuard()
    }

    /**
     * Persist the changed tiers via sc2, one whole-tier write each. Runs OFF the EDT (host
     * modal block). A tier's baseline is advanced (onSaved) only when its write Saved; a
     * refused or failed tier keeps its pending edit. Throws ConfigurationException naming
     * the failed tiers.
     */
    override fun apply() {
        val m = model ?: return
        val failuresByTier = LinkedHashMap<String, String>()
        for ((tier, reason) in m.unsavable()) failuresByTier[tier] = reason
        for (pw in m.collectWrites()) {
            val tier = pw.segments[2] // ["models","tiers",tier]
            val result = when (val op = pw.op) {
                is WriteOp.Set -> gateway.writeSetting(pw.segments, op.value)
                WriteOp.Clear -> gateway.clearSetting(pw.segments)
            }
            when (result) {
                is SaveResult.Saved -> {
                    m.onSaved(tier)
                    if (result.restartRequired) restartRequired = true
                }
                is SaveResult.Rejected -> failuresByTier[tier] = result.message
                is SaveResult.Unavailable -> failuresByTier[tier] = result.reason
            }
        }
        if (failuresByTier.isNotEmpty()) {
            val lines = failuresByTier.entries.map { (tier, reason) -> "$tier: $reason" }
            throw ConfigurationException("Some model-tier settings could not be saved:\n" + lines.joinToString("\n"))
        }
    }

    // --- rendering ------------------------------------------------------------

    /**
     * The rows for a loaded model, or — whenever the latest read failed — only the failure
     * message, with no editable rows; called on the EDT. A model loaded earlier is kept with
     * its pending edits and shown again after a successful Refresh.
     */
    private fun rebuildBody() {
        body.removeAll()
        rowRefreshers.clear()
        status?.let { text ->
            body.add(JLabel(text).apply {
                foreground = JBColor.RED
                alignmentX = Component.LEFT_ALIGNMENT
            })
        }
        if (status == null) model?.let { m -> for (tier in ModelTiersModel.TIERS) body.add(tierRow(m, tier)) }
        body.revalidate()
        body.repaint()
    }

    private fun tierRow(m: ModelTiersModel, tier: String): JComponent {
        val block = JPanel()
        block.layout = BoxLayout(block, BoxLayout.Y_AXIS)
        block.alignmentX = Component.LEFT_ALIGNMENT

        val row = JPanel(BorderLayout())
        row.alignmentX = Component.LEFT_ALIGNMENT
        row.add(JLabel(tier), BorderLayout.WEST)

        val controls = JPanel(FlowLayout(FlowLayout.RIGHT, 6, 0))

        val runnerCombo = JComboBox(m.runnerOptions().toTypedArray())
        runnerCombo.isEditable = false
        runnerCombo.renderer = labelRenderer { (it as? String)?.let(m::runnerLabel) ?: "" }

        val modelCombo = JComboBox<ModelChoice>()
        modelCombo.isEditable = false // dropdown-only (k4): no free-text model entry.
        modelCombo.renderer = labelRenderer { (it as? ModelChoice)?.label ?: "" }

        val effortCombo = JComboBox<String>()
        effortCombo.isEditable = false
        effortCombo.renderer = labelRenderer { (it as? String)?.ifEmpty { "CLI default" } ?: "" }
        effortCombo.toolTipText = "Reasoning effort passed to the tier's CLI"

        val note = JLabel().apply {
            foreground = JBColor.GRAY
            alignmentX = Component.LEFT_ALIGNMENT
        }

        // Fill the three combos and the note from the model (the caller guards edits).
        val seed = {
            runnerCombo.selectedItem = m.currentRunner(tier)
            modelCombo.removeAllItems()
            for (choice in m.modelOptions(tier)) modelCombo.addItem(choice)
            modelCombo.selectedItem = m.selectedModelChoice(tier)
            effortCombo.removeAllItems()
            for (effort in m.effortOptions(tier)) effortCombo.addItem(effort)
            effortCombo.selectedItem = m.currentEffort(tier)
            val text = m.note(tier)
            note.text = text ?: ""
            note.isVisible = text != null
        }

        runnerCombo.addActionListener {
            if (suppressEdits) return@addActionListener
            val sel = runnerCombo.selectedItem as? String ?: return@addActionListener
            // A runner switch takes the family's default model and effort.
            m.selectRunner(tier, sel)
            underGuard(seed)
        }
        modelCombo.addActionListener {
            if (suppressEdits) return@addActionListener
            // A sentinel / current-not-listed marker is non-selectable: re-seeding restores the model's selection.
            (modelCombo.selectedItem as? ModelChoice.Model)?.let { m.selectModel(tier, it.id) }
            underGuard(seed)
        }
        effortCombo.addActionListener {
            if (suppressEdits) return@addActionListener
            val sel = effortCombo.selectedItem as? String ?: return@addActionListener
            m.selectEffort(tier, sel)
        }

        underGuard(seed)
        rowRefreshers.add(seed)

        controls.add(runnerCombo)
        controls.add(modelCombo)
        controls.add(effortCombo)
        row.add(controls, BorderLayout.EAST)
        row.maximumSize = Dimension(Int.MAX_VALUE, row.preferredSize.height)
        block.add(row)
        block.add(note)
        return block
    }

    private fun labelRenderer(text: (Any?) -> String) = object : DefaultListCellRenderer() {
        override fun getListCellRendererComponent(
            list: JList<*>?,
            value: Any?,
            index: Int,
            isSelected: Boolean,
            cellHasFocus: Boolean,
        ): Component = super.getListCellRendererComponent(list, text(value), index, isSelected, cellHasFocus)
    }

    private fun refreshRow(): JComponent {
        val row = JPanel(FlowLayout(FlowLayout.RIGHT, 6, 0))
        row.alignmentX = Component.LEFT_ALIGNMENT
        val check = JButton("Check model…").apply {
            toolTipText = "Check a model the daemon does not list, then approve or reject it"
            addActionListener { checkModel(this) }
        }
        val refresh = JButton("Refresh").apply {
            toolTipText = "Re-read the daemon's model definitions"
            addActionListener { refreshDefinitions() }
        }
        row.add(check)
        row.add(refresh)
        row.maximumSize = Dimension(Int.MAX_VALUE, row.preferredSize.height)
        return row
    }

    /**
     * Re-read the daemon's model definitions off the EDT. Loaded: the model is built (or
     * updated, keeping pending edits) and the failure cleared. Failed: the failure is shown
     * and the rows are hidden until a Refresh succeeds.
     */
    private fun refreshDefinitions() {
        var fresh: ModelDefinitionsResult? = null
        ProgressManager.getInstance().runProcessWithProgressSynchronously({
            fresh = gateway.modelDefinitions()
        }, "Refreshing the model definitions…", false, null)
        when (val r = fresh) {
            is ModelDefinitionsResult.Loaded -> applyDefinitions(r.definitions)
            is ModelDefinitionsResult.Failed -> status = r.failure.text
            null -> status = "the model definitions could not be read"
        }
        underGuard(::rebuildBody)
    }

    /** Build or update the model from fresh definitions (keeping pending edits) and clear the failure. */
    private fun applyDefinitions(fresh: ModelDefinitionsDto) {
        definitions = fresh
        val m = model
        if (m == null) model = ModelTiersModel(catalog, fresh) else m.updateDefinitions(fresh)
        status = null
    }

    /**
     * Open the Check model… dialog over the current definitions. A model approved there is
     * offered once the dialog's restart re-read the definitions; it is saved to a tier only
     * by this page's Apply.
     */
    private fun checkModel(parent: JComponent) {
        val defs = definitions ?: return
        val flow = ModelCheckFlow(gateway, defs, DaemonRestart({ DaemonLifecycleCommandRunner.production().run(it) }, gateway))
        val dialog = ModelCheckDialog(parent, flow)
        dialog.show()
        dialog.reloaded?.let {
            applyDefinitions(it)
            underGuard(::rebuildBody)
        }
    }

    private fun underGuard(action: () -> Unit) {
        suppressEdits = true
        try {
            action()
        } finally {
            suppressEdits = false
        }
    }

    private fun reseedUnderGuard() = underGuard { for (refresh in rowRefreshers) refresh() }
}
