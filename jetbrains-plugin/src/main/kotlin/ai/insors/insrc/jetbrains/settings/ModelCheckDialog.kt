package ai.insors.insrc.jetbrains.settings

import ai.insors.insrc.jetbrains.daemon.DefinedFamilyDto
import ai.insors.insrc.jetbrains.daemon.ModelDefinitionsDto
import com.intellij.openapi.progress.ProgressManager
import com.intellij.openapi.ui.DialogWrapper
import com.intellij.util.ui.JBUI
import java.awt.Component
import java.awt.FlowLayout
import javax.swing.Action
import javax.swing.BoxLayout
import javax.swing.DefaultListCellRenderer
import javax.swing.JButton
import javax.swing.JCheckBox
import javax.swing.JComboBox
import javax.swing.JComponent
import javax.swing.JLabel
import javax.swing.JList
import javax.swing.JPanel
import javax.swing.JTextArea
import javax.swing.JTextField

/**
 * The Check model… dialog (Epic ce99b72065d03b1b, Story s7): a thin Swing shell over the
 * headless [ModelCheckFlow]. The user picks a CLI family and types a model id the
 * definitions do not list; the check runs under a modal progress indicator; the result
 * (whether the model ran, its input limit, and each effort's verdict and evidence) is shown;
 * Approve (with the ticked, non-rejected efforts) or Reject records the decision; after an
 * approval, Restart daemon restarts it and re-reads the definitions. [reloaded] then holds
 * the fresh definitions for the settings section. The dialog never saves a tier.
 */
class ModelCheckDialog(
    parent: Component,
    private val flow: ModelCheckFlow,
) : DialogWrapper(parent, true) {

    /** The definitions re-read after a confirmed restart, for the caller to apply. */
    var reloaded: ModelDefinitionsDto? = null
        private set

    private val familyCombo = JComboBox(flow.families().toTypedArray()).apply {
        isEditable = false
        renderer = object : DefaultListCellRenderer() {
            override fun getListCellRendererComponent(list: JList<*>?, value: Any?, index: Int, isSelected: Boolean, cellHasFocus: Boolean): Component =
                super.getListCellRendererComponent(list, (value as? DefinedFamilyDto)?.let { "${it.displayName} (${it.id})" } ?: "", index, isSelected, cellHasFocus)
        }
    }
    private val modelField = JTextField(24)
    private val checkButton = JButton("Check")
    private val result = JTextArea(6, 48).apply {
        isEditable = false
        lineWrap = true
        wrapStyleWord = true
    }
    private val effortsPanel = JPanel(FlowLayout(FlowLayout.LEFT, 6, 0))
    private val effortBoxes = mutableListOf<JCheckBox>()
    private val approveButton = JButton("Approve")
    private val rejectButton = JButton("Reject")
    private val restartButton = JButton("Restart daemon")
    private val message = JLabel(" ")

    init {
        title = "insrc — Check a model the daemon does not list"
        setOKButtonText("Close")
        checkButton.addActionListener { onCheck() }
        approveButton.addActionListener { blocking("Recording the approval…") { flow.approve(effortBoxes.filter { it.isSelected }.map { it.text }) } }
        rejectButton.addActionListener { blocking("Recording the rejection…") { flow.reject() } }
        restartButton.addActionListener {
            blocking("Restarting the daemon…") { flow.restartAndReload()?.let { reloaded = it } }
        }
        init()
        render()
    }

    override fun createActions(): Array<Action> = arrayOf(okAction)

    override fun createCenterPanel(): JComponent {
        val panel = JPanel()
        panel.layout = BoxLayout(panel, BoxLayout.Y_AXIS)
        panel.border = JBUI.Borders.empty(8)
        panel.add(row(JLabel("Family"), familyCombo))
        panel.add(row(JLabel("Model id"), modelField, checkButton))
        panel.add(row(result))
        panel.add(row(JLabel("Allow efforts"), effortsPanel))
        panel.add(row(approveButton, rejectButton, restartButton))
        panel.add(row(message))
        return panel
    }

    private fun row(vararg parts: JComponent): JComponent =
        JPanel(FlowLayout(FlowLayout.LEFT, 6, 2)).apply {
            alignmentX = Component.LEFT_ALIGNMENT
            for (p in parts) add(p)
        }

    private fun onCheck() {
        val family = (familyCombo.selectedItem as? DefinedFamilyDto)?.id ?: return
        val id = modelField.text
        blocking("Checking $id through its CLI…") { flow.runCheck(family, id) }
    }

    /** Run a blocking flow call under a modal progress indicator (off the EDT), then re-render. */
    private fun blocking(title: String, action: () -> Unit) {
        ProgressManager.getInstance().runProcessWithProgressSynchronously(action, title, false, null, contentPanel)
        render()
    }

    private fun render() {
        val c = flow.check
        result.text = if (c == null) {
            ""
        } else {
            buildString {
                append("${c.modelId} ${if (c.runs) "ran" else "did not run"}")
                c.inputLimit?.let { append(" · input limit $it") }
                c.error?.let { append("\nerror: $it") }
                for (e in c.efforts) append("\n${e.effort}: ${e.verdict}${if (e.evidence.isNotEmpty()) " — ${e.evidence}" else ""}")
            }
        }
        effortsPanel.removeAll()
        effortBoxes.clear()
        for (effort in flow.approvableEfforts()) {
            val box = JCheckBox(effort, true)
            effortBoxes += box
            effortsPanel.add(box)
        }
        effortsPanel.revalidate()
        approveButton.isEnabled = flow.canApprove()
        rejectButton.isEnabled = flow.canReject()
        restartButton.isVisible = flow.restartPending
        checkButton.text = if (flow.checkAgain) "Check again" else "Check"
        message.text = flow.message ?: " "
    }
}
