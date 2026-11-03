package ai.insors.insrc.jetbrains.connections

import com.intellij.openapi.Disposable
import com.intellij.openapi.components.service
import com.intellij.openapi.project.Project
import com.intellij.openapi.project.ProjectManager
import com.intellij.util.ui.JBUI
import java.awt.BorderLayout
import java.awt.Component
import javax.swing.*

/** Application Settings has no authoritative Project: require an explicit object selection. */
class ConnectionsEntryPanel internal constructor(
    private val projects: () -> List<Project>,
    context: Project? = null,
) : JPanel(BorderLayout()), Disposable {
    constructor(context: Project? = null) : this({ ProjectManager.getInstance().openProjects.toList() }, context)
    private var manager: ConnectionsManagerPanel? = null
    private var disposed = false
    private var generation = 0L
    private val chooser = JPanel(BorderLayout(JBUI.scale(8), JBUI.scale(8)))
    private val projectChoice = JComboBox<Project?>()
    private val message = JLabel()
    init {
        border = JBUI.Borders.empty(8)
        if (context != null && !context.isDisposed && !context.isDefault) open(context) else showChooser()
    }
    private fun live() = projects().filter { !it.isDisposed && !it.isDefault }
    private fun showChooser() {
        if (disposed) return
        val current = ++generation
        manager?.dispose(); manager = null; removeAll(); chooser.removeAll()
        projectChoice.removeAllItems(); projectChoice.addItem(null); live().forEach(projectChoice::addItem)
        projectChoice.name = "connection-project"
        projectChoice.renderer = object : DefaultListCellRenderer() {
            override fun getListCellRendererComponent(list:JList<*>?, value:Any?, index:Int, selected:Boolean, focus:Boolean):Component {
                val label = super.getListCellRendererComponent(list, "", index, selected, focus) as JLabel
                label.putClientProperty("html.disable", true)
                label.text = (value as? Project)?.let { it.name + " · " + (it.basePath ?: "rootless project") } ?: "Choose an open project"
                return label
            }
        }
        message.putClientProperty("html.disable", true)
        message.text = if (projectChoice.itemCount == 1) "No open project. Open a project to manage connections; no temporary session has been created." else "Select a project, then choose its registered repository in Manage Connections."
        val label = JLabel("Project").apply { labelFor = projectChoice }
        val controls = JPanel().apply { add(label); add(projectChoice)
            add(JButton("Manage Connections").apply { name="manage-connections"; addActionListener {
                val selected = projectChoice.selectedItem as? Project
                if (!disposed && generation == current && selected != null && live().any { it === selected }) open(selected)
                else if (!disposed && generation == current) message.text = "Choose a live open project before managing connections."
            } })
            add(JButton("Cancel").apply { name="cancel-project"; addActionListener { if(!disposed && generation == current) projectChoice.selectedIndex=0 } })
            add(JButton("Refresh projects").apply { name="refresh-projects"; addActionListener { if(!disposed && generation == current) showChooser() } })
        }
        chooser.add(message, BorderLayout.NORTH); chooser.add(controls, BorderLayout.CENTER)
        add(chooser, BorderLayout.NORTH); revalidate(); repaint()
    }
    private fun open(project:Project) {
        if(disposed || project.isDisposed || project.isDefault) return
        val current = ++generation
        removeAll(); manager?.dispose()
        val panel = ConnectionsManagerPanel(project) { showChooser() }; manager=panel
        val change = JButton("Choose another project").apply { name="choose-project"; addActionListener {
            if(!disposed && generation == current && !project.isDisposed) project.service<ConnectionsSessionService>().manager().requestClose { showChooser() }
        } }
        add(change, BorderLayout.NORTH); add(panel, BorderLayout.CENTER); revalidate(); repaint()
    }
    override fun dispose() { if(disposed)return;disposed=true;manager?.dispose();manager=null;projectChoice.removeAllItems();removeAll() }
}
