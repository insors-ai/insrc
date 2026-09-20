package ai.insors.insrc.jetbrains.settings

import ai.insors.insrc.jetbrains.daemon.DaemonGateway
import ai.insors.insrc.jetbrains.daemon.SaveResult
import com.intellij.openapi.options.ConfigurationException
import java.awt.BorderLayout
import java.awt.Component
import java.awt.Dimension
import java.awt.FlowLayout
import javax.swing.BorderFactory
import javax.swing.BoxLayout
import javax.swing.JButton
import javax.swing.JComboBox
import javax.swing.JComponent
import javax.swing.JLabel
import javax.swing.JPanel
import javax.swing.JTextField
import javax.swing.event.DocumentEvent
import javax.swing.event.DocumentListener

/**
 * The per-repo overrides sub-section (Story S005), plugged into the sc3
 * [SettingsSection] seam and reusing the S004 host fan-out unchanged. A thin
 * Swing shell over the pure [PerRepoOverridesModel]: an add-repo picker of
 * addableRepos() plus one nested panel per overridden repo — a coreFloor chooser,
 * a per-role tier combo grid (mirroring [PerRoleSection], '(use default)' = clear
 * the task), and a per-tier runner+model text-field pair — plus a remove-override
 * control. All load-bearing logic (which repos are overridden, the leaf-granular
 * nested-key mapping, dirty) lives in the model; this shell only renders + pushes
 * edits + applies via sc2.
 *
 * [apply] is designed to run OFF the EDT (the host invokes it inside a modal
 * ProgressManager block): it touches only the model + [gateway] (no Swing), so
 * there is no EDT/data race. It throws [ConfigurationException] listing the leaves
 * (by repo + key) whose write was not Saved, preserving their pending intent
 * (ac2/ac3, never a false success).
 */
class PerRepoSection(
    private val model: PerRepoOverridesModel,
    private val gateway: DaemonGateway,
) : SettingsSection {

    /** The tier chooser's first item — selecting it clears that leaf's override. */
    private val useDefault = "(use default)"

    /** Re-render the whole section body on any structural change (add/remove/edit). */
    private var body: JPanel? = null
    private var suppressEdits = false

    override val title: String = "Per-repo overrides"

    override fun component(): JComponent {
        val panel = JPanel()
        panel.layout = BoxLayout(panel, BoxLayout.Y_AXIS)
        panel.border = BorderFactory.createTitledBorder(title)
        body = panel
        rebuild()
        return panel
    }

    override fun isModified(): Boolean = model.isModified()

    override fun reset() {
        model.revert()
        rebuild()
    }

    /**
     * Persist the dirty per-repo leaves via sc2. Runs OFF the EDT (host modal
     * block). onSaved advances only the Saved leaves; a not-Saved leaf keeps its
     * pending intent; throws ConfigurationException naming the failed leaves (ac2/ac3).
     */
    override fun apply() {
        val failures = mutableListOf<String>()
        for (pw in model.collectWrites()) {
            val label = pw.segments.drop(2).joinToString("/") // repoPath/key…
            val result = when (val op = pw.op) {
                is WriteOp.Set -> gateway.writeSetting(pw.segments, op.value)
                WriteOp.Clear -> gateway.clearSetting(pw.segments)
            }
            when (result) {
                SaveResult.Saved -> model.onSaved(pw.segments)
                is SaveResult.Rejected -> failures.add("$label: ${result.reason}")
                is SaveResult.Unavailable -> failures.add("$label: ${result.reason}")
            }
        }
        if (failures.isNotEmpty()) {
            throw ConfigurationException(
                "Some per-repo overrides could not be saved:\n" + failures.joinToString("\n"),
            )
        }
    }

    // --- rendering ------------------------------------------------------------

    /** Rebuild the whole section body from the model (add/remove change the row set). */
    private fun rebuild() {
        val panel = body ?: return
        suppressEdits = true
        try {
            panel.removeAll()
            panel.add(addRow())
            for (row in model.rows()) panel.add(repoPanel(row))
            panel.revalidate()
            panel.repaint()
        } finally {
            suppressEdits = false
        }
    }

    /** The add-override picker: a combo of addable repos + an Add button. */
    private fun addRow(): JComponent {
        val row = JPanel(FlowLayout(FlowLayout.LEFT, 4, 0))
        row.alignmentX = Component.LEFT_ALIGNMENT
        val addable = model.addableRepos()
        val combo = JComboBox(addable.toTypedArray())
        val add = JButton("Add override")
        add.isEnabled = addable.isNotEmpty()
        add.addActionListener {
            val repoPath = combo.selectedItem?.toString() ?: return@addActionListener
            model.addOverride(repoPath)
            rebuild()
        }
        row.add(JLabel("Repository:"))
        row.add(combo)
        row.add(add)
        row.maximumSize = Dimension(Int.MAX_VALUE, row.preferredSize.height)
        return row
    }

    /** One overridden repo's nested editor panel: coreFloor + tasks + tiers + remove. */
    private fun repoPanel(row: PerRepoRow): JComponent {
        val repoPath = row.repoPath
        val panel = JPanel()
        panel.layout = BoxLayout(panel, BoxLayout.Y_AXIS)
        panel.border = BorderFactory.createTitledBorder(repoPath)
        panel.alignmentX = Component.LEFT_ALIGNMENT

        // Header: the repo path + a remove-whole-override button.
        val header = JPanel(BorderLayout())
        val remove = JButton("Remove override")
        remove.addActionListener {
            model.removeOverride(repoPath)
            rebuild()
        }
        header.add(remove, BorderLayout.EAST)
        panel.add(header)

        // coreFloor chooser.
        panel.add(labeledCombo("coreFloor", row.coreFloor) { sel ->
            model.setCoreFloor(repoPath, sel)
        })

        // Per-role task tier combos (mirrors PerRoleSection; '(use default)' = clear).
        for (role in model.roles()) {
            val current = row.tasks[role.id]
            panel.add(labeledCombo("tasks: ${role.id}", current) { sel ->
                model.setTaskTier(repoPath, role.id, sel)
            })
        }

        // Per-tier runner + model free-text fields (daemon-validated; k5).
        for (tierName in model.tierNames()) {
            val spec = row.tiers[tierName]
            panel.add(tierFieldRow(repoPath, tierName, TierField.Runner, spec?.runner))
            panel.add(tierFieldRow(repoPath, tierName, TierField.Model, spec?.model))
        }

        panel.maximumSize = Dimension(Int.MAX_VALUE, panel.preferredSize.height)
        return panel
    }

    /**
     * A labeled tier chooser ('(use default)' first, then the daemon's tier names)
     * seeded from [current]; selecting '(use default)' passes null (clear the leaf).
     */
    private fun labeledCombo(label: String, current: String?, onSelect: (String?) -> Unit): JComponent {
        val rowPanel = JPanel(BorderLayout())
        rowPanel.alignmentX = Component.LEFT_ALIGNMENT
        rowPanel.add(JLabel(label), BorderLayout.WEST)
        val items = (listOf(useDefault) + model.tierNames()).toTypedArray()
        val combo = JComboBox(items)
        combo.selectedItem = current ?: useDefault
        combo.addActionListener {
            if (suppressEdits) return@addActionListener
            val sel = combo.selectedItem?.toString()
            onSelect(if (sel == null || sel == useDefault) null else sel)
        }
        rowPanel.add(combo, BorderLayout.EAST)
        rowPanel.maximumSize = Dimension(Int.MAX_VALUE, rowPanel.preferredSize.height)
        return rowPanel
    }

    /** A labeled free-text field for one tier leaf (runner|model); empty = clear. */
    private fun tierFieldRow(repoPath: String, tierName: String, field: TierField, current: String?): JComponent {
        val rowPanel = JPanel(BorderLayout())
        rowPanel.alignmentX = Component.LEFT_ALIGNMENT
        rowPanel.add(JLabel("tiers: $tierName.${field.segment}"), BorderLayout.WEST)
        val text = JTextField(current ?: "", 16)
        text.document.addDocumentListener(object : DocumentListener {
            private fun changed() {
                if (!suppressEdits) model.setTierField(repoPath, tierName, field, text.text)
            }
            override fun insertUpdate(e: DocumentEvent) = changed()
            override fun removeUpdate(e: DocumentEvent) = changed()
            override fun changedUpdate(e: DocumentEvent) = changed()
        })
        rowPanel.add(text, BorderLayout.EAST)
        rowPanel.maximumSize = Dimension(Int.MAX_VALUE, rowPanel.preferredSize.height)
        return rowPanel
    }
}
