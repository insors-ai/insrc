package ai.insors.insrc.jetbrains.settings

import ai.insors.insrc.jetbrains.connections.ConnectionsEntryPanel
import com.intellij.openapi.options.SearchableConfigurable
import javax.swing.JComponent

/** Navigation only: Save/Test/Delete/Discard are explicit immediate manager actions. */
class ConnectionsConfigurable internal constructor(private val create:()->ConnectionsEntryPanel) : SearchableConfigurable {
    constructor():this({ ConnectionsEntryPanel() })
    private var panel: ConnectionsEntryPanel? = null
    override fun getId() = "ai.insors.insrc.connections"
    override fun getDisplayName() = "Connections"
    override fun enableSearch(option:String):Runnable? = null
    override fun createComponent():JComponent = panel ?: create().also { panel=it }
    override fun isModified() = false
    override fun apply() = Unit
    override fun reset() = Unit
    override fun disposeUIResources() { panel?.dispose();panel=null }
}
