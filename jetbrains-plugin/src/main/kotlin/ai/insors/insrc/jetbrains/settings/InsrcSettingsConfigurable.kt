package ai.insors.insrc.jetbrains.settings

import ai.insors.insrc.jetbrains.daemon.ConfigOptionDto
import ai.insors.insrc.jetbrains.daemon.DaemonGatewayService
import ai.insors.insrc.jetbrains.daemon.PerRepoOverridesResult
import ai.insors.insrc.jetbrains.daemon.PerRoleOverridesResult
import ai.insors.insrc.jetbrains.daemon.RegisteredReposResult
import ai.insors.insrc.jetbrains.daemon.SaveResult
import ai.insors.insrc.jetbrains.daemon.SettingsCatalogResult
import com.intellij.openapi.application.ApplicationManager
import com.intellij.openapi.application.ModalityState
import com.intellij.openapi.components.service
import com.intellij.openapi.options.Configurable
import com.intellij.openapi.options.ConfigurationException
import com.intellij.openapi.progress.ProgressManager
import com.intellij.ui.JBSplitter
import java.awt.BorderLayout
import java.awt.CardLayout
import java.awt.Component
import javax.swing.AbstractCellEditor
import javax.swing.BorderFactory
import javax.swing.BoxLayout
import javax.swing.JCheckBox
import javax.swing.JComboBox
import javax.swing.JComponent
import javax.swing.JLabel
import javax.swing.JPanel
import javax.swing.JScrollPane
import javax.swing.JTable
import javax.swing.JTextField
import javax.swing.JTree
import javax.swing.ScrollPaneConstants
import javax.swing.table.AbstractTableModel
import javax.swing.table.TableCellEditor
import javax.swing.table.TableCellRenderer
import javax.swing.tree.DefaultMutableTreeNode
import javax.swing.tree.DefaultTreeCellRenderer
import javax.swing.tree.DefaultTreeModel
import javax.swing.tree.TreeSelectionModel

/**
 * The native insrc Settings page (Settings ▸ Tools ▸ insrc).
 *
 * S002/S003/S004/S005 built a read → edit → per-role → per-repo page as a flat,
 * one-scrolling-column BoxLayout. This rework (standalone S001) presents it as a
 * master-detail: a LEFT [JTree] of setting categories (from [SettingsView.settingsTree])
 * plus one node per override [SettingsSection], and a RIGHT detail panel that shows
 * either the selected category's editable Key/Value/Default [SettingsTableModel] table
 * or an override node's `section.component()`. The tree and the detail each sit in
 * their own AS_NEEDED [JScrollPane] (so overflow always scrolls); 'General' is
 * selected on first render. The pure [SettingsEditModel] + [SettingsView.groupsOf] +
 * the PerRole/PerRepo sections are consumed UNCHANGED — apply/isModified/reset still
 * fan out over the model + the sections list. An Unavailable daemon shows the
 * placeholder and installs no tree.
 */
class InsrcSettingsConfigurable : Configurable {

    private var root: JPanel? = null
    private var model: SettingsEditModel? = null
    private var optionPaths: List<String> = emptyList()

    /** The sc3 sub-sections plugged in as tree nodes (S004 per-role; S005 per-repo). */
    private val sections = mutableListOf<SettingsSection>()

    /** The live per-category table models, re-seeded (fireTableDataChanged) on reset/apply. */
    private val tableModels = mutableListOf<SettingsTableModel>()

    override fun getDisplayName(): String = "insrc"

    override fun createComponent(): JComponent {
        val panel = JPanel(BorderLayout())
        root = panel
        panel.add(JLabel("Loading insrc settings…"), BorderLayout.NORTH)

        // Read off the EDT (local socket round-trips), then render on the EDT.
        val gateway = service<DaemonGatewayService>()
        ApplicationManager.getApplication().executeOnPooledThread {
            val catalog = gateway.settingsCatalog()
            val overrides = gateway.perRoleOverrides()
            val perRepo = gateway.perRepoOverrides()
            val registered = gateway.registeredRepos()
            ApplicationManager.getApplication().invokeLater({
                // Only render if this component is still the live page.
                if (root === panel) {
                    panel.removeAll()
                    panel.add(renderBody(catalog, overrides, perRepo, registered, gateway), BorderLayout.CENTER)
                    panel.revalidate()
                    panel.repaint()
                }
            }, ModalityState.any())
        }
        return panel
    }

    /** Modified iff the global model OR any sub-section has an unsaved change. */
    override fun isModified(): Boolean = (model?.isModified() ?: false) || sections.any { it.isModified() }

    /**
     * Persist the dirty settings via sc2. Validation is checked FIRST so no invalid
     * value reaches the daemon; a rejected/unavailable write or a validation failure
     * throws [ConfigurationException] (the dialog stays open, edits preserved). Writes
     * run OFF the EDT under a modal progress dialog; the model mutation + table
     * re-seed happen back on the EDT. (Unchanged from the flat page except the re-seed
     * is a table-model fire, not per-row control refreshers.)
     */
    override fun apply() {
        val m = model
        if (m != null) {
            for (path in optionPaths) {
                val err = m.validationError(path)
                if (err != null) throw ConfigurationException("$path: $err")
            }
        }
        val dirty = m?.collectDirty() ?: emptyList()
        val dirtySections = sections.filter { it.isModified() }
        if (dirty.isEmpty() && dirtySections.isEmpty()) return

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
                try {
                    section.apply()
                } catch (e: ConfigurationException) {
                    e.message?.let { failures.add(it) }
                }
            }
        }, "Saving insrc Settings…", false, null)

        for (path in saved) m?.onSaved(path)
        refreshTables()
        if (failures.isNotEmpty()) {
            throw ConfigurationException("Some settings could not be saved:\n" + failures.joinToString("\n"))
        }
    }

    /** Revert every field + section to its last-saved value and re-seed the tables. */
    override fun reset() {
        model?.let { m -> for (path in optionPaths) m.revertField(path) }
        for (section in sections) section.reset()
        refreshTables()
    }

    override fun disposeUIResources() {
        root = null
        model = null
        optionPaths = emptyList()
        sections.clear()
        tableModels.clear()
    }

    /** Re-seed every rendered category table from the (reverted/advanced) model. */
    private fun refreshTables() {
        for (tm in tableModels) tm.fireTableDataChanged()
    }

    // --- rendering (thin shell over the pure SettingsView / SettingsEditModel) --

    private fun renderBody(
        result: SettingsCatalogResult,
        overrides: PerRoleOverridesResult,
        perRepo: PerRepoOverridesResult,
        registered: RegisteredReposResult,
        gateway: DaemonGatewayService,
    ): JComponent = when (result) {
        is SettingsCatalogResult.Unavailable -> {
            model = null
            optionPaths = emptyList()
            sections.clear()
            tableModels.clear()
            unavailablePanel(result.reason)
        }
        is SettingsCatalogResult.Loaded -> {
            val catalog = result.catalog
            val editModel = SettingsEditModel(catalog)
            model = editModel
            optionPaths = catalog.options.map { it.path }
            sections.clear()
            tableModels.clear()

            // Build the override sub-sections (unchanged S004/S005 wiring); a section
            // is registered only when its read is Loaded. Unavailable reads become a
            // placeholder note under the tree rather than a node.
            val placeholders = mutableListOf<String>()
            when (overrides) {
                is PerRoleOverridesResult.Loaded -> sections.add(
                    PerRoleSection(PerRoleOverridesModel(catalog.roles, catalog.tierNames, overrides.overrides), gateway),
                )
                is PerRoleOverridesResult.Unavailable ->
                    placeholders.add("Per-role overrides are unavailable — ${overrides.reason}")
            }
            if (perRepo is PerRepoOverridesResult.Loaded && registered is RegisteredReposResult.Loaded) {
                sections.add(
                    PerRepoSection(
                        PerRepoOverridesModel(registered.repos, catalog.roles, catalog.tierNames, perRepo.overrides),
                        gateway,
                    ),
                )
            } else {
                val reason = when {
                    perRepo is PerRepoOverridesResult.Unavailable -> perRepo.reason
                    registered is RegisteredReposResult.Unavailable -> registered.reason
                    else -> "unavailable"
                }
                placeholders.add("Per-repo overrides are unavailable — $reason")
            }

            buildMasterDetail(catalog, editModel, placeholders)
        }
    }

    /**
     * The master-detail page: a JTree of the [SettingsView.settingsTree] nodes on the
     * left (its own scroll pane), a card-swapped detail on the right (its own scroll
     * pane). Each category card is an editable Key/Value/Default JTable; each section
     * card is that section's component(). 'General' is selected on first render.
     */
    private fun buildMasterDetail(
        catalog: ai.insors.insrc.jetbrains.daemon.SettingsCatalogDto,
        editModel: SettingsEditModel,
        placeholders: List<String>,
    ): JComponent {
        val tree = SettingsView.settingsTree(catalog, sections.map { it.title })

        val treeRoot = DefaultMutableTreeNode("insrc")
        for (node in tree.nodes) treeRoot.add(DefaultMutableTreeNode(node))
        val jtree = JTree(DefaultTreeModel(treeRoot))
        jtree.isRootVisible = false
        jtree.showsRootHandles = true
        jtree.selectionModel.selectionMode = TreeSelectionModel.SINGLE_TREE_SELECTION
        jtree.cellRenderer = object : DefaultTreeCellRenderer() {
            override fun getTreeCellRendererComponent(
                t: JTree?, value: Any?, sel: Boolean, expanded: Boolean,
                leaf: Boolean, row: Int, hasFocus: Boolean,
            ): Component {
                val c = super.getTreeCellRendererComponent(t, value, sel, expanded, leaf, row, hasFocus)
                val payload = (value as? DefaultMutableTreeNode)?.userObject
                if (payload is SettingsTreeNode) text = payload.label
                return c
            }
        }

        // The detail: one card per node, swapped on selection.
        val cards = CardLayout()
        val detail = JPanel(cards)
        tree.nodes.forEachIndexed { i, node -> detail.add(cardFor(node, editModel), i.toString()) }

        jtree.addTreeSelectionListener {
            val sel = jtree.lastSelectedPathComponent as? DefaultMutableTreeNode ?: return@addTreeSelectionListener
            val idx = treeRoot.getIndex(sel)
            if (idx >= 0) cards.show(detail, idx.toString())
        }
        if (tree.defaultIndex >= 0) jtree.setSelectionRow(tree.defaultIndex)

        val treeScroll = JScrollPane(
            jtree,
            ScrollPaneConstants.VERTICAL_SCROLLBAR_AS_NEEDED,
            ScrollPaneConstants.HORIZONTAL_SCROLLBAR_AS_NEEDED,
        )
        val left: JComponent = if (placeholders.isEmpty()) {
            treeScroll
        } else {
            val notes = JPanel()
            notes.layout = BoxLayout(notes, BoxLayout.Y_AXIS)
            notes.border = BorderFactory.createEmptyBorder(4, 6, 4, 6)
            for (p in placeholders) notes.add(JLabel(p))
            JPanel(BorderLayout()).apply {
                add(treeScroll, BorderLayout.CENTER)
                add(notes, BorderLayout.SOUTH)
            }
        }
        // The detail is NOT wrapped again — each card supplies its OWN AS_NEEDED
        // JScrollPane (cardFor), so there is exactly one scroll level per card (a
        // second outer pane would leave a dead inner pane / double scrollbars).
        val splitter = JBSplitter(false, 0.3f)
        splitter.firstComponent = left
        splitter.secondComponent = detail
        return splitter
    }

    /** The detail card for one tree node: an editable table (category) or the section component. */
    private fun cardFor(node: SettingsTreeNode, editModel: SettingsEditModel): JComponent = when (node) {
        is SettingsTreeNode.Category -> {
            val tableModel = SettingsTableModel(node.options, editModel)
            tableModels.add(tableModel)
            val table = JTable(tableModel)
            table.putClientProperty("terminateEditOnFocusLost", true)
            table.rowHeight = table.rowHeight.coerceAtLeast(24)
            val valueCol = table.columnModel.getColumn(SettingsTableModel.COL_VALUE)
            valueCol.cellRenderer = SettingsValueCellRenderer(tableModel)
            valueCol.cellEditor = SettingsValueCellEditor(tableModel)
            JScrollPane(
                table,
                ScrollPaneConstants.VERTICAL_SCROLLBAR_AS_NEEDED,
                ScrollPaneConstants.HORIZONTAL_SCROLLBAR_AS_NEEDED,
            )
        }
        is SettingsTreeNode.Section -> {
            val section = sections.first { it.title == node.title }
            JScrollPane(
                section.component(),
                ScrollPaneConstants.VERTICAL_SCROLLBAR_AS_NEEDED,
                ScrollPaneConstants.HORIZONTAL_SCROLLBAR_AS_NEEDED,
            )
        }
    }

    /** A clear, distinct daemon-unavailable placeholder (never a blank form). */
    private fun unavailablePanel(reason: String): JComponent {
        val panel = JPanel(BorderLayout())
        panel.border = BorderFactory.createEmptyBorder(12, 12, 12, 12)
        panel.add(JLabel("insrc settings are unavailable — $reason"), BorderLayout.NORTH)
        return panel
    }
}

/**
 * The per-category editable table model (Story S001): columns Key (read), Value
 * (editable), Default (read), one row per [ConfigOptionDto] in the category. Backed
 * ENTIRELY by the pure [SettingsEditModel] + [SettingsView.renderScalar] — getValueAt
 * reads the path / controlValue / default, and setValueAt on the Value column routes
 * to [SettingsEditModel.editField], so a dirty cell contributes to the host's
 * isModified/collectDirty exactly as the S003 per-row control did. A separate
 * [resetToDefault] maps a row to [SettingsEditModel.markResetToDefault].
 */
class SettingsTableModel(
    private val options: List<ConfigOptionDto>,
    private val edit: SettingsEditModel,
) : AbstractTableModel() {

    fun option(row: Int): ConfigOptionDto = options[row]
    fun controlKind(row: Int): ControlKind = edit.controlKind(options[row].path)

    override fun getRowCount(): Int = options.size
    override fun getColumnCount(): Int = 3

    override fun getColumnName(column: Int): String = when (column) {
        COL_KEY -> "Key"
        COL_VALUE -> "Value"
        else -> "Default"
    }

    override fun isCellEditable(rowIndex: Int, columnIndex: Int): Boolean = columnIndex == COL_VALUE

    override fun getValueAt(rowIndex: Int, columnIndex: Int): Any? {
        val option = options[rowIndex]
        return when (columnIndex) {
            COL_KEY -> option.path
            COL_VALUE -> edit.controlValue(option.path) // raw; the renderer/editor type-switches
            else -> SettingsView.renderScalar(option.default)
        }
    }

    override fun setValueAt(aValue: Any?, rowIndex: Int, columnIndex: Int) {
        if (columnIndex != COL_VALUE) return
        edit.editField(options[rowIndex].path, aValue)
        fireTableRowsUpdated(rowIndex, rowIndex)
    }

    /** Reset one row's setting to its catalog default (a Clear on apply). */
    fun resetToDefault(rowIndex: Int) {
        edit.markResetToDefault(options[rowIndex].path)
        fireTableRowsUpdated(rowIndex, rowIndex)
    }

    companion object {
        const val COL_KEY = 0
        const val COL_VALUE = 1
        const val COL_DEFAULT = 2
    }
}

/** Renders the Value cell per type: a checkbox for a boolean, else the scalar text. */
private class SettingsValueCellRenderer(private val model: SettingsTableModel) : TableCellRenderer {
    private val label = JLabel()
    private val check = JCheckBox().apply { isBorderPainted = false }

    override fun getTableCellRendererComponent(
        table: JTable, value: Any?, isSelected: Boolean, hasFocus: Boolean, row: Int, column: Int,
    ): Component {
        val bg = if (isSelected) table.selectionBackground else table.background
        val fg = if (isSelected) table.selectionForeground else table.foreground
        val comp = if (model.controlKind(row) == ControlKind.TOGGLE) {
            check.isSelected = value as? Boolean ?: false
            check
        } else {
            label.text = SettingsView.renderScalar(value)
            label
        }
        comp.isOpaque = true
        comp.background = bg
        comp.foreground = fg
        return comp
    }
}

/**
 * Edits the Value cell with a per-type widget chosen by the row's [ControlKind]
 * (JComboBox over enumValues for CHOOSER, JCheckBox for TOGGLE, JTextField for
 * NUMBER/TEXT), plus a reset-to-default (⟲) button that maps to
 * [SettingsTableModel.resetToDefault]. getCellEditorValue returns the typed raw value
 * (Boolean / String) which the JTable hands to [SettingsTableModel.setValueAt] →
 * [SettingsEditModel.editField].
 */
private class SettingsValueCellEditor(private val model: SettingsTableModel) : AbstractCellEditor(), TableCellEditor {
    private var kind: ControlKind = ControlKind.TEXT
    private var combo: JComboBox<String>? = null
    private var check: JCheckBox? = null
    private var text: JTextField? = null

    override fun getTableCellEditorComponent(
        table: JTable, value: Any?, isSelected: Boolean, row: Int, column: Int,
    ): Component {
        kind = model.controlKind(row)
        val option = model.option(row)
        combo = null; check = null; text = null
        val control: JComponent = when (kind) {
            // Commit a toggle/selection immediately (stopCellEditing) rather than only
            // on focus-loss, so the edit reaches editField as soon as the user acts.
            ControlKind.TOGGLE -> JCheckBox().also {
                it.isSelected = value as? Boolean ?: false
                it.addActionListener { stopCellEditing() }
                check = it
            }
            ControlKind.CHOOSER -> JComboBox((option.enumValues ?: emptyList()).toTypedArray()).also {
                it.selectedItem = SettingsView.renderScalar(value)
                it.addActionListener { stopCellEditing() }
                combo = it
            }
            ControlKind.NUMBER, ControlKind.TEXT -> JTextField(SettingsView.renderScalar(value)).also { text = it }
        }
        val tableModel = model // capture: JButton.apply shadows `model` with AbstractButton.model
        val reset = javax.swing.JButton("⟲").apply {
            toolTipText = "Reset to default (${SettingsView.renderScalar(option.default)})"
            addActionListener {
                cancelCellEditing()
                tableModel.resetToDefault(row)
            }
        }
        return JPanel(BorderLayout()).apply {
            add(control, BorderLayout.CENTER)
            add(reset, BorderLayout.EAST)
        }
    }

    override fun getCellEditorValue(): Any? = when (kind) {
        ControlKind.TOGGLE -> check?.isSelected ?: false
        ControlKind.CHOOSER -> combo?.selectedItem?.toString() ?: ""
        ControlKind.NUMBER, ControlKind.TEXT -> text?.text ?: ""
    }
}
