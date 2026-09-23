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
import com.intellij.ui.components.JBScrollPane
import com.intellij.util.ui.JBUI
import java.awt.BorderLayout
import java.awt.Component
import java.awt.Dimension
import java.awt.Rectangle
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
import javax.swing.JTextArea
import javax.swing.JTextField
import javax.swing.JToggleButton
import javax.swing.Scrollable
import javax.swing.ScrollPaneConstants
import javax.swing.SwingConstants
import javax.swing.table.AbstractTableModel
import javax.swing.table.TableCellEditor
import javax.swing.table.TableCellRenderer

/**
 * The native insrc Settings page (Settings ▸ Tools ▸ insrc).
 *
 * S002/S003/S004/S005 built a read → edit → per-role → per-repo page. This rework
 * (standalone S001) presents it as ONE vertically-scrolling page of COLLAPSIBLE
 * SECTIONS: for each [SettingsView.settingsTree] node either a setting CATEGORY (a
 * '▾/▸ group' toggle header over the category's editable Key/Value/Default
 * [SettingsTableModel] table, the table content-sized so the OUTER page scrollbar
 * governs) or an override SECTION (a toggle header over `section.component()`).
 * The whole content sits in ONE AS_NEEDED [JScrollPane] (so overflow always
 * scrolls, ac1); 'General' ([SettingsTree.defaultIndex]) is expanded on first
 * render and the rest collapsed. The pure [SettingsEditModel] +
 * [SettingsView.groupsOf] + the PerRole/PerRepo sections are consumed UNCHANGED —
 * apply/isModified/reset still fan out over the model + the sections list. An
 * Unavailable daemon shows the placeholder and installs no panels.
 */
class InsrcSettingsConfigurable : Configurable {

    private var root: JScrollPane? = null
    private var model: SettingsEditModel? = null
    private var optionPaths: List<String> = emptyList()

    /** The sc3 sub-sections plugged in as tree nodes (S004 per-role; S005 per-repo). */
    private val sections = mutableListOf<SettingsSection>()

    /** The live per-category table models, re-seeded (fireTableDataChanged) on reset/apply. */
    private val tableModels = mutableListOf<SettingsTableModel>()

    override fun getDisplayName(): String = "insrc"

    override fun createComponent(): JComponent {
        // The TOP-LEVEL component is the scroll pane itself (not a JPanel wrapping
        // one): the Settings dialog sizes a plain panel to its preferred height and
        // grows it past the pane (clipping), but it bounds a JScrollPane to the pane
        // and lets the scrollbar govern. We swap the scroll pane's VIEWPORT VIEW from
        // a loading note to the rendered body once the off-EDT read returns.
        val scroll = JBScrollPane(
            JLabel("Loading insrc settings…"),
            ScrollPaneConstants.VERTICAL_SCROLLBAR_AS_NEEDED,
            ScrollPaneConstants.HORIZONTAL_SCROLLBAR_NEVER,
        )
        scroll.border = JBUI.Borders.empty()
        root = scroll

        // Read off the EDT (local socket round-trips), then render on the EDT.
        val gateway = service<DaemonGatewayService>()
        ApplicationManager.getApplication().executeOnPooledThread {
            val catalog = gateway.settingsCatalog()
            val overrides = gateway.perRoleOverrides()
            val perRepo = gateway.perRepoOverrides()
            val registered = gateway.registeredRepos()
            // S004: pre-fetch each provider's model list off the EDT (a socket round-trip
            // must never run on the EDT). All three providers are fetched up front so an
            // in-session runner switch immediately shows the new provider's list; Refresh
            // re-queries them. The plugin is a dumb consumer of these results (k2).
            val modelLists = ModelTiersModel.PROVIDERS.associateWith { gateway.listModels(it) }
            ApplicationManager.getApplication().invokeLater({
                // Only render if this component is still the live page.
                if (root === scroll) {
                    scroll.setViewportView(renderBody(catalog, overrides, perRepo, registered, modelLists, gateway))
                    scroll.revalidate()
                    scroll.repaint()
                }
            }, ModalityState.any())
        }
        return scroll
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
                    // localizedMessage (inherited Throwable) rather than the newer-IDE
                    // deprecated ConfigurationException.getMessage() — same text.
                    e.localizedMessage?.let { failures.add(it) }
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
        modelLists: Map<String, ai.insors.insrc.jetbrains.daemon.ModelListResult>,
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
            val fullCatalog = result.catalog
            // S004: the models.tiers.* rows are lifted out of the generic category table
            // into the dedicated ModelTiersSection (dropdown-only model picker + Refresh),
            // so the table/edit-model/settings-tree see a catalog WITHOUT them (no
            // duplication). The ModelTiersModel reads the tiers from the FULL catalog.
            val catalog = fullCatalog.copy(
                options = fullCatalog.options.filterNot { it.path.startsWith("models.tiers.") },
            )
            val editModel = SettingsEditModel(catalog)
            model = editModel
            optionPaths = catalog.options.map { it.path }
            sections.clear()
            tableModels.clear()

            // S004: the dedicated Model-tiers section over the pure ModelTiersModel + the
            // pre-fetched per-provider lists. Registered first so it heads the sub-sections.
            sections.add(ModelTiersSection(ModelTiersModel(fullCatalog, modelLists), gateway))

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

            buildCollapsiblePage(catalog, editModel, placeholders)
        }
    }

    /**
     * The collapsible-sections page: ONE vertically-scrolling column of
     * [SettingsView.settingsTree] nodes, each a collapsible panel — a category over
     * its editable Key/Value/Default JTable, a section over its `component()`. The
     * whole column sits in ONE AS_NEEDED [JScrollPane] (ac1); the
     * [SettingsTree.defaultIndex] category ('General' when present) is expanded on
     * first render, the rest collapsed. Any Unavailable-override placeholders are
     * appended as plain notes below the panels.
     *
     * The column is a [ScrollableContentPanel] (tracks the viewport WIDTH but not
     * its HEIGHT) so the panels keep their natural heights at the top and the outer
     * scrollbar governs overflow — no `maximumSize` caps and no vertical glue.
     */
    private fun buildCollapsiblePage(
        catalog: ai.insors.insrc.jetbrains.daemon.SettingsCatalogDto,
        editModel: SettingsEditModel,
        placeholders: List<String>,
    ): JComponent {
        val tree = SettingsView.settingsTree(catalog, sections.map { it.title })

        val content = ScrollableContentPanel()
        content.layout = BoxLayout(content, BoxLayout.Y_AXIS)
        content.border = BorderFactory.createEmptyBorder(4, 6, 4, 6)

        tree.nodes.forEachIndexed { i, node ->
            val expanded = i == tree.defaultIndex
            val body = bodyFor(node, editModel)
            content.add(collapsiblePanel(node.label, body, expanded))
        }
        for (p in placeholders) content.add(placeholderNote(p))

        // Return the content column directly — createComponent's top-level
        // JScrollPane scrolls it. The column tracks the viewport width and keeps its
        // natural height (ScrollableContentPanel), so the outer scrollbar governs.
        return content
    }

    /**
     * One collapsible panel: a '▾/▸ title' toggle header over [body], whose
     * visibility flips on toggle. [expanded] governs the initial state. The panel
     * takes its natural (preferred) height; the outer page scrollbar governs.
     */
    private fun collapsiblePanel(title: String, body: JComponent, expanded: Boolean): JComponent {
        val panel = JPanel(BorderLayout())
        panel.alignmentX = Component.LEFT_ALIGNMENT
        val header = JToggleButton(headerText(title, expanded), expanded).apply {
            horizontalAlignment = SwingConstants.LEFT
            isFocusPainted = false
            isContentAreaFilled = false
            border = BorderFactory.createEmptyBorder(4, 2, 4, 2)
        }
        body.isVisible = expanded
        header.addActionListener {
            val open = header.isSelected
            header.text = headerText(title, open)
            body.isVisible = open
            panel.revalidate()
            panel.repaint()
        }
        panel.add(header, BorderLayout.NORTH)
        panel.add(body, BorderLayout.CENTER)
        return panel
    }

    private fun headerText(title: String, expanded: Boolean): String = "${if (expanded) "▾" else "▸"} $title"

    /**
     * A width-tracking, WRAPPING note for an Unavailable-override reason. A bare
     * JLabel would be clipped in the width-tracked column (no horizontal scroll), so
     * a non-editable, transparent, line-wrapping JTextArea keeps a long reason fully
     * visible as the window narrows.
     */
    private fun placeholderNote(reason: String): JComponent = JTextArea(reason).apply {
        isEditable = false
        isFocusable = false // a pure static note: wraps + reflows, but never a caret/tab-stop
        isOpaque = false
        lineWrap = true
        wrapStyleWord = true
        alignmentX = Component.LEFT_ALIGNMENT
        border = BorderFactory.createEmptyBorder(4, 2, 4, 2)
    }

    /** The collapsible body for one node: an editable table (category) or the section component. */
    private fun bodyFor(node: SettingsTreeNode, editModel: SettingsEditModel): JComponent = when (node) {
        is SettingsTreeNode.Category -> {
            val tableModel = SettingsTableModel(node.options, editModel)
            tableModels.add(tableModel)
            val table = JTable(tableModel)
            table.putClientProperty("terminateEditOnFocusLost", true)
            table.rowHeight = table.rowHeight.coerceAtLeast(24)
            val valueCol = table.columnModel.getColumn(SettingsTableModel.COL_VALUE)
            valueCol.cellRenderer = SettingsValueCellRenderer(tableModel)
            valueCol.cellEditor = SettingsValueCellEditor(tableModel)
            // No inner scroll pane: the table is content-sized by its own model
            // (rows*rowHeight) and rendered in full, with its column header supplied
            // manually (a JTable outside a scroll pane shows no header otherwise). The
            // ONE outer page JScrollPane governs all overflow.
            JPanel(BorderLayout()).apply {
                alignmentX = Component.LEFT_ALIGNMENT
                add(table.tableHeader, BorderLayout.NORTH)
                add(table, BorderLayout.CENTER)
            }
        }
        is SettingsTreeNode.Section -> {
            val section = sections.first { it.title == node.title }
            section.component()
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
 * The collapsible-sections column (Story S001): a [Scrollable] BoxLayout panel that
 * tracks the enclosing viewport's WIDTH (so the panels fill the page horizontally)
 * but ALWAYS keeps its natural HEIGHT (never letting the viewport compress it), so
 * the outer AS_NEEDED scroll pane governs vertical overflow and the content-sized
 * tables never clip — hence no maximum-size cap and no trailing vertical glue. When
 * the content is shorter than the viewport it sits at its natural height with empty
 * space below (a normal settings-page look), never stretched.
 */
private class ScrollableContentPanel : JPanel(), Scrollable {
    /**
     * The preferred viewport size the enclosing scroll pane sizes itself to. The
     * WIDTH is the content's own (stable) preferred width — NEVER the live viewport
     * width: reading the viewport width here fed the width back on itself and, with
     * [getScrollableTracksViewportWidth] true, spiralled the panel infinitely wider.
     * The HEIGHT is a bounded, [JBUI]-scaled default — NEVER the full content height:
     * returning the full height made the scroll pane's preferred height grow with the
     * content, so the Settings dialog grew the WHOLE page to fit on every expand
     * (pushing the scrollbar out and clipping past the fold) instead of staying
     * bounded and letting the vertical scrollbar scroll. Neither dimension reads the
     * viewport, so there is no layout feedback loop.
     */
    override fun getPreferredScrollableViewportSize(): Dimension =
        Dimension(preferredSize.width, JBUI.scale(500))

    override fun getScrollableTracksViewportWidth(): Boolean = true

    /**
     * ALWAYS false: never let the viewport force this column to its own height. If it
     * did (e.g. when the content momentarily looks like it fits), the BoxLayout would
     * COMPRESS its children below their natural heights — squeezing the content-sized,
     * no-scrollbar category tables so their rows clip and the outer scrollbar vanishes
     * ("shows then disappears"). Keeping the natural (taller) height means the outer
     * AS_NEEDED scrollbar always governs the overflow and never clips.
     */
    override fun getScrollableTracksViewportHeight(): Boolean = false

    override fun getScrollableUnitIncrement(visibleRect: Rectangle, orientation: Int, direction: Int): Int = 16
    override fun getScrollableBlockIncrement(visibleRect: Rectangle, orientation: Int, direction: Int): Int =
        if (orientation == SwingConstants.VERTICAL) visibleRect.height else visibleRect.width
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
