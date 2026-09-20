package ai.insors.insrc.jetbrains.settings

import ai.insors.insrc.jetbrains.daemon.ConfigOptionDto
import ai.insors.insrc.jetbrains.daemon.DaemonGatewayService
import ai.insors.insrc.jetbrains.daemon.PerRoleOverridesResult
import ai.insors.insrc.jetbrains.daemon.SaveResult
import ai.insors.insrc.jetbrains.daemon.SettingsCatalogResult
import com.intellij.openapi.application.ApplicationManager
import com.intellij.openapi.application.ModalityState
import com.intellij.openapi.components.service
import com.intellij.openapi.options.Configurable
import com.intellij.openapi.options.ConfigurationException
import com.intellij.openapi.progress.ProgressManager
import java.awt.BorderLayout
import java.awt.Component
import java.awt.Dimension
import java.awt.FlowLayout
import javax.swing.BorderFactory
import javax.swing.Box
import javax.swing.BoxLayout
import javax.swing.JButton
import javax.swing.JCheckBox
import javax.swing.JComboBox
import javax.swing.JComponent
import javax.swing.JLabel
import javax.swing.JPanel
import javax.swing.JScrollPane
import javax.swing.JTextField
import javax.swing.event.DocumentEvent
import javax.swing.event.DocumentListener

/**
 * The native insrc Settings page (Settings ▸ Tools ▸ insrc).
 *
 * S002 shipped the READ-ONLY grouped/collapsible rendering (sc3). S003 makes the
 * GLOBAL settings EDITABLE (sc2): it reads the daemon's self-describing
 * config.catalog (via the gateway, OFF the EDT, marshaled back ON the EDT),
 * renders each setting with a type-appropriate EDIT control, and delegates its
 * native isModified()/apply()/reset() to a pure [SettingsEditModel]. Apply writes
 * only the dirty keys via the sc2 gateway (writeSetting / clearSetting) and, on a
 * rejected/unavailable write or a validation failure, throws
 * [ConfigurationException] so the dialog blocks and preserves the pending edit
 * (ac4). It renders whatever the daemon described — no setting, group, role, or
 * tier is hardcoded (k1/lc1). An Unavailable daemon shows the placeholder and
 * installs no editors. The per-role/per-repo override sub-sections (S004/S005)
 * plug into [SettingsSection]; S003 registers none.
 */
class InsrcSettingsConfigurable : Configurable {

    private var root: JPanel? = null
    private var model: SettingsEditModel? = null
    private var optionPaths: List<String> = emptyList()

    /** The sc3 sub-sections plugged in below the global groups (S004 per-role; S005 per-repo). */
    private val sections = mutableListOf<SettingsSection>()

    /** Per-row control re-seeders, run on reset()/reset-to-default to reflect model state. */
    private val rowRefreshers = mutableListOf<() -> Unit>()

    /** Guards control listeners from firing during a programmatic (re-seed) update. */
    private var suppressEdits = false

    override fun getDisplayName(): String = "insrc"

    override fun createComponent(): JComponent {
        val panel = JPanel(BorderLayout())
        root = panel
        panel.add(JLabel("Loading insrc settings…"), BorderLayout.NORTH)

        // Read off the EDT (local socket round-trips), then render on the EDT. Two
        // reads: the catalog (sc1) + the current per-role overrides (config.show).
        val gateway = service<DaemonGatewayService>()
        ApplicationManager.getApplication().executeOnPooledThread {
            val catalog = gateway.settingsCatalog()
            val overrides = gateway.perRoleOverrides()
            ApplicationManager.getApplication().invokeLater({
                // Only render if this component is still the live page.
                if (root === panel) {
                    panel.removeAll()
                    panel.add(renderBody(catalog, overrides, gateway), BorderLayout.CENTER)
                    panel.revalidate()
                    panel.repaint()
                }
            }, ModalityState.any())
        }
        return panel
    }

    /** Modified iff the global model OR any sub-section has an unsaved change (S003 + S004). */
    override fun isModified(): Boolean = (model?.isModified() ?: false) || sections.any { it.isModified() }

    /**
     * Persist the dirty settings via sc2. Validation is checked FIRST so no
     * invalid value reaches the daemon; a rejected/unavailable write or a
     * validation failure throws [ConfigurationException] (the dialog stays open,
     * edits preserved — ac4). Saved writes advance the model's baseline; a
     * partial-batch failure keeps the Saved ones and re-throws for the rest.
     */
    override fun apply() {
        val m = model
        // Block on the first GLOBAL validation error before issuing any write (ac1/ac4).
        if (m != null) {
            for (path in optionPaths) {
                val err = m.validationError(path)
                if (err != null) throw ConfigurationException("$path: $err")
            }
        }
        val dirty = m?.collectDirty() ?: emptyList()
        val dirtySections = sections.filter { it.isModified() }
        if (dirty.isEmpty() && dirtySections.isEmpty()) return

        // The daemon config.write does writeFileSync + reloadChatConfig per call,
        // so each write is a blocking round-trip. Run them all OFF the EDT under a
        // modal progress dialog (apply() stays synchronous — the Settings contract —
        // but the EDT is not frozen and SlowOperations is not tripped). Global model
        // mutation + control re-seeding stay on the EDT below; each section persists
        // itself (model + gateway only, no Swing) inside the block.
        val gateway = service<DaemonGatewayService>()
        val saved = mutableListOf<String>()
        val failures = mutableListOf<String>()
        ProgressManager.getInstance().runProcessWithProgressSynchronously({
            for (pw in dirty) {
                val path = pw.segments.joinToString(".")
                val result = when (val op = pw.op) {
                    is WriteOp.Set -> gateway.writeSetting(pw.segments, op.value)
                    WriteOp.Clear -> gateway.clearSetting(pw.segments)
                }
                when (result) {
                    SaveResult.Saved -> saved.add(path)
                    is SaveResult.Rejected -> failures.add("$path: ${result.reason}")
                    is SaveResult.Unavailable -> failures.add("$path: ${result.reason}")
                }
            }
            for (section in dirtySections) {
                // Each section persists its own changes (off-EDT here) and throws
                // ConfigurationException naming its failures; aggregate them.
                try {
                    section.apply()
                } catch (e: ConfigurationException) {
                    e.message?.let { failures.add(it) }
                }
            }
        }, "Saving insrc Settings…", false, null)

        // Back on the EDT: advance the baseline for the Saved GLOBAL fields only (a
        // partial failure keeps the failed fields dirty with their edits), then re-seed.
        for (path in saved) m?.onSaved(path)
        refreshAllRows()
        if (failures.isNotEmpty()) {
            throw ConfigurationException("Some settings could not be saved:\n" + failures.joinToString("\n"))
        }
    }

    /** Revert every field + section to its last-saved value and re-seed the controls (ac3). */
    override fun reset() {
        model?.let { m -> for (path in optionPaths) m.revertField(path) }
        for (section in sections) section.reset()
        refreshAllRows()
    }

    override fun disposeUIResources() {
        root = null
        model = null
        optionPaths = emptyList()
        sections.clear()
        rowRefreshers.clear()
    }

    private fun refreshAllRows() {
        suppressEdits = true
        try {
            for (refresh in rowRefreshers) refresh()
        } finally {
            suppressEdits = false
        }
    }

    // --- rendering (thin shell over the pure SettingsView / SettingsEditModel) --

    private fun renderBody(
        result: SettingsCatalogResult,
        overrides: PerRoleOverridesResult,
        gateway: DaemonGatewayService,
    ): JComponent = when (result) {
        is SettingsCatalogResult.Unavailable -> {
            // No model, no editors, no sections on an unavailable page (apply/reset become no-ops).
            model = null
            optionPaths = emptyList()
            sections.clear()
            rowRefreshers.clear()
            unavailablePanel(result.reason)
        }
        is SettingsCatalogResult.Loaded -> {
            val editModel = SettingsEditModel(result.catalog)
            model = editModel
            optionPaths = result.catalog.options.map { it.path }
            sections.clear()
            rowRefreshers.clear()
            val content = JPanel()
            content.layout = BoxLayout(content, BoxLayout.Y_AXIS)
            for (group in SettingsView.groupsOf(result.catalog)) {
                content.add(collapsibleGroup(group, editModel))
            }
            // The per-role overrides sub-section (S004) below the global groups.
            when (overrides) {
                is PerRoleOverridesResult.Loaded -> {
                    val section = PerRoleSection(
                        PerRoleOverridesModel(result.catalog.roles, result.catalog.tierNames, overrides.overrides),
                        gateway,
                    )
                    sections.add(section)
                    content.add(section.component())
                }
                is PerRoleOverridesResult.Unavailable ->
                    // Catalog loaded but the override read failed: show a placeholder,
                    // register no section (so apply/reset never touch a half-built model).
                    content.add(JLabel("Per-role overrides are unavailable — ${overrides.reason}"))
            }
            content.add(Box.createVerticalGlue())
            JScrollPane(content)
        }
    }

    /** A clear, distinct daemon-unavailable placeholder (never a blank form). */
    private fun unavailablePanel(reason: String): JComponent {
        val panel = JPanel(BorderLayout())
        panel.border = BorderFactory.createEmptyBorder(12, 12, 12, 12)
        panel.add(JLabel("insrc settings are unavailable — $reason"), BorderLayout.NORTH)
        return panel
    }

    /** One collapsible group panel: a toggle header over a body of editable rows. */
    private fun collapsibleGroup(group: SettingsGroupModel, editModel: SettingsEditModel): JComponent {
        val body = JPanel()
        body.layout = BoxLayout(body, BoxLayout.Y_AXIS)
        body.border = BorderFactory.createEmptyBorder(2, 16, 6, 8)
        for (option in group.options) body.add(settingRow(option, editModel))

        val toggle = JButton("▾ ${group.group}")
        toggle.alignmentX = Component.LEFT_ALIGNMENT
        toggle.horizontalAlignment = javax.swing.SwingConstants.LEFT
        toggle.isBorderPainted = false
        toggle.isContentAreaFilled = false
        toggle.addActionListener {
            body.isVisible = !body.isVisible
            toggle.text = (if (body.isVisible) "▾ " else "▸ ") + group.group
        }

        val wrapper = JPanel(BorderLayout())
        wrapper.alignmentX = Component.LEFT_ALIGNMENT
        wrapper.add(toggle, BorderLayout.NORTH)
        wrapper.add(body, BorderLayout.CENTER)
        // keep the group from stretching vertically in the BoxLayout
        wrapper.maximumSize = Dimension(Int.MAX_VALUE, wrapper.preferredSize.height)
        return wrapper
    }

    /**
     * One EDITABLE setting row: the path on the left, a type-appropriate edit
     * control + a reset-to-default button on the right, with the description as a
     * tooltip. Edits push into the pure model; a re-seeder is registered so
     * reset()/reset-to-default can restore the control from model state.
     */
    private fun settingRow(option: ConfigOptionDto, editModel: SettingsEditModel): JComponent {
        val row = JPanel(BorderLayout())
        row.alignmentX = Component.LEFT_ALIGNMENT
        val name = JLabel(option.path)
        name.toolTipText = option.desc
        row.add(name, BorderLayout.WEST)

        val control = editControl(option, editModel)

        val reset = JButton("⟲")
        reset.toolTipText = "Reset to default (${SettingsView.renderScalar(option.default)})"
        reset.addActionListener {
            editModel.markResetToDefault(option.path)
            refreshAllRows()
        }

        val east = JPanel(FlowLayout(FlowLayout.RIGHT, 4, 0))
        east.add(control)
        east.add(reset)
        row.add(east, BorderLayout.EAST)
        row.maximumSize = Dimension(Int.MAX_VALUE, row.preferredSize.height)
        return row
    }

    /**
     * The per-type edit control bound to [editModel] (ac1): enum → chooser,
     * boolean → toggle, number → number field, string/unknown → text field. Each
     * control pushes edits via editField (guarded by [suppressEdits]) and
     * registers a re-seeder that reads model.controlValue back.
     */
    private fun editControl(option: ConfigOptionDto, editModel: SettingsEditModel): JComponent {
        val path = option.path
        return when (editModel.controlKind(path)) {
            ControlKind.TOGGLE -> {
                val box = JCheckBox()
                box.isSelected = editModel.controlValue(path) as? Boolean ?: false
                box.toolTipText = option.desc
                box.addActionListener { if (!suppressEdits) editModel.editField(path, box.isSelected) }
                rowRefreshers.add { box.isSelected = editModel.controlValue(path) as? Boolean ?: false }
                box
            }
            ControlKind.CHOOSER -> {
                val choices = option.enumValues ?: emptyList()
                val combo = JComboBox(choices.toTypedArray())
                combo.selectedItem = SettingsView.renderScalar(editModel.controlValue(path))
                combo.toolTipText = option.desc
                combo.addActionListener {
                    if (!suppressEdits) editModel.editField(path, combo.selectedItem?.toString() ?: "")
                }
                rowRefreshers.add { combo.selectedItem = SettingsView.renderScalar(editModel.controlValue(path)) }
                combo
            }
            ControlKind.NUMBER, ControlKind.TEXT -> {
                val field = JTextField(SettingsView.renderScalar(editModel.controlValue(path)), 16)
                field.toolTipText = option.desc
                field.document.addDocumentListener(object : DocumentListener {
                    private fun changed() { if (!suppressEdits) editModel.editField(path, field.text) }
                    override fun insertUpdate(e: DocumentEvent) = changed()
                    override fun removeUpdate(e: DocumentEvent) = changed()
                    override fun changedUpdate(e: DocumentEvent) = changed()
                })
                rowRefreshers.add { field.text = SettingsView.renderScalar(editModel.controlValue(path)) }
                field
            }
        }
    }
}
