package ai.insors.insrc.jetbrains.settings

import ai.insors.insrc.jetbrains.daemon.ConfigOptionDto
import ai.insors.insrc.jetbrains.daemon.DaemonGatewayService
import ai.insors.insrc.jetbrains.daemon.SettingsCatalogResult
import com.intellij.openapi.application.ApplicationManager
import com.intellij.openapi.application.ModalityState
import com.intellij.openapi.components.service
import com.intellij.openapi.options.Configurable
import java.awt.BorderLayout
import java.awt.Component
import java.awt.Dimension
import javax.swing.BorderFactory
import javax.swing.Box
import javax.swing.BoxLayout
import javax.swing.JButton
import javax.swing.JCheckBox
import javax.swing.JComponent
import javax.swing.JLabel
import javax.swing.JPanel
import javax.swing.JScrollPane

/**
 * The native insrc Settings page (Story S002 / sc3) — Settings ▸ Tools ▸ insrc.
 *
 * READ-ONLY: it reads the daemon's self-describing config.catalog (via the
 * gateway, OFF the EDT, marshaled back ON the EDT) and renders each setting into
 * collapsible group panels showing value / default / description. It renders
 * whatever the daemon described — no setting, group, role, or tier is hardcoded
 * (k1/lc1). It never writes config.json and never reloads: isModified() is
 * always false and apply()/reset() are no-ops. Editing arrives in S003; the
 * per-role/per-repo override sub-sections (S004/S005) plug into [SettingsSection].
 */
class InsrcSettingsConfigurable : Configurable {

    private var root: JPanel? = null

    override fun getDisplayName(): String = "insrc"

    override fun createComponent(): JComponent {
        val panel = JPanel(BorderLayout())
        root = panel
        panel.add(JLabel("Loading insrc settings…"), BorderLayout.NORTH)

        // Read off the EDT (a local socket round-trip), then render on the EDT.
        val gateway = service<DaemonGatewayService>()
        ApplicationManager.getApplication().executeOnPooledThread {
            val result = gateway.settingsCatalog()
            ApplicationManager.getApplication().invokeLater({
                // Only render if this component is still the live page.
                if (root === panel) {
                    panel.removeAll()
                    panel.add(renderBody(result), BorderLayout.CENTER)
                    panel.revalidate()
                    panel.repaint()
                }
            }, ModalityState.any())
        }
        return panel
    }

    /** Read-only: nothing to persist (S002). */
    override fun isModified(): Boolean = false

    /** Read-only: no write, no reload (k5). Editing is S003. */
    override fun apply() { /* no-op: S002 is read-only */ }

    /** Read-only: nothing to reset. */
    override fun reset() { /* no-op: S002 is read-only */ }

    override fun disposeUIResources() {
        root = null
    }

    // --- rendering (thin shell over the pure SettingsView) --------------------

    private fun renderBody(result: SettingsCatalogResult): JComponent = when (result) {
        is SettingsCatalogResult.Unavailable -> unavailablePanel(result.reason)
        is SettingsCatalogResult.Loaded -> {
            val content = JPanel()
            content.layout = BoxLayout(content, BoxLayout.Y_AXIS)
            for (group in SettingsView.groupsOf(result.catalog)) {
                content.add(collapsibleGroup(group))
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

    /** One collapsible group panel: a toggle header over a body of read-only rows. */
    private fun collapsibleGroup(group: SettingsGroupModel): JComponent {
        val body = JPanel()
        body.layout = BoxLayout(body, BoxLayout.Y_AXIS)
        body.border = BorderFactory.createEmptyBorder(2, 16, 6, 8)
        for (option in group.options) body.add(settingRow(option))

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
     * One read-only setting row: the path on the left, a per-type read-only
     * control on the right (a disabled checkbox for booleans, else a label of
     * the display value), with the description as a tooltip. An unrecognized
     * type degrades to the label fallback — never dropped.
     */
    private fun settingRow(option: ConfigOptionDto): JComponent {
        val row = JPanel(BorderLayout())
        row.alignmentX = Component.LEFT_ALIGNMENT
        val name = JLabel(option.path)
        name.toolTipText = option.desc
        row.add(name, BorderLayout.WEST)
        row.add(readOnlyControl(option), BorderLayout.EAST)
        row.maximumSize = Dimension(Int.MAX_VALUE, row.preferredSize.height)
        return row
    }

    /** Per-type READ-ONLY display control; unknown types fall back to a text label. */
    private fun readOnlyControl(option: ConfigOptionDto): JComponent = when (option.type) {
        "boolean" -> {
            // Show a visible "(default)" marker on a defaulted boolean, matching the
            // label rows so a defaulted checkbox is never mistaken for an explicit one.
            // Gate on the same condition displayValue uses (a set-but-null value is
            // "using the default"), so the checkbox marker and its tooltip agree.
            val usingDefault = !option.isSet || option.currentValue == null
            val box = JCheckBox(if (usingDefault) "(default)" else "")
            box.isSelected = (option.currentValue as? Boolean) ?: (option.default as? Boolean) ?: false
            box.isEnabled = false
            box.toolTipText = SettingsView.displayValue(option)
            box
        }
        else -> {
            // string / number / enum / any unknown type: a read-only value label.
            val label = JLabel(SettingsView.displayValue(option))
            label.toolTipText = option.desc
            label
        }
    }
}
