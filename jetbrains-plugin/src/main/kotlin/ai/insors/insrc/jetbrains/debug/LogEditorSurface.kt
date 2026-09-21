package ai.insors.insrc.jetbrains.debug

import com.intellij.openapi.Disposable
import com.intellij.openapi.application.ApplicationManager
import com.intellij.openapi.command.CommandProcessor
import com.intellij.openapi.fileEditor.FileDocumentManager
import com.intellij.openapi.fileEditor.FileEditorManager
import com.intellij.openapi.fileEditor.FileEditorManagerListener
import com.intellij.openapi.fileEditor.TextEditor
import com.intellij.openapi.fileTypes.PlainTextFileType
import com.intellij.openapi.project.Project
import com.intellij.openapi.util.Disposer
import com.intellij.openapi.vfs.VirtualFile
import com.intellij.testFramework.LightVirtualFile
import com.intellij.ui.components.JBLabel
import com.intellij.ui.components.JBTextField
import com.intellij.util.ui.JBUI
import java.awt.FlowLayout
import javax.swing.JPanel
import javax.swing.event.DocumentEvent
import javax.swing.event.DocumentListener

/**
 * The plugin's first log-editor surface (Story E2026092157298940:S006) — opens a chosen daemon/agent
 * log as a read-only IDE editor tab and streams appended lines into it OFF the EDT, with a
 * level/module/text filter applied to the VIEW (k5/ac1/ac2).
 *
 * The tab is backed by a SEPARATE in-memory [LightVirtualFile] ('insrc-<stem>.log'), NOT the real
 * on-disk log, so nothing the developer does can delete/rotate/clear the underlying log (k5). The
 * document is user-read-only (blocks typing); only the plugin rebuilds it, under a write action, by
 * momentarily lifting the read-only flag. Lines flow through a bounded ([MAX_BUFFER]) ring buffer,
 * so a long-running tail stays memory-safe; a filter change re-renders from the buffer (no disk
 * re-read). The tail subscription is disposed when the editor tab / project closes. Never throws.
 */
class LogEditorSurface(private val seam: LogTailSeam = LogTailSeam()) {

    companion object {
        /** Max lines the bounded ring buffer retains (memory-safe over an unbounded tail). */
        const val MAX_BUFFER: Int = 1000
    }

    /** Per-open-tab state; keyed by category so a re-open re-focuses rather than duplicates. */
    private class OpenLog(val file: LightVirtualFile) {
        val buffer = ArrayDeque<LogLine>()
        @Volatile var filter: LogFilter = LogFilter()
        @Volatile var disposed = false
        var tail: AutoCloseable? = null
    }

    private val open = HashMap<LogCategoryId, OpenLog>()

    /**
     * Open (or re-focus) the editor tab for [category] in [project] and begin streaming. Must be
     * called on the EDT (an action handler); the blocking tail reads happen on the seam's own
     * off-EDT polling feed. Never throws.
     */
    fun openLog(project: Project, category: LogCategory) {
        val existing = open[category.id]
        if (existing != null && !existing.disposed && existing.file.isValid) {
            FileEditorManager.getInstance(project).openFile(existing.file, true)
            return
        }

        val file = LightVirtualFile("insrc-${category.stem}.log", PlainTextFileType.INSTANCE, "")
        val state = OpenLog(file)
        open[category.id] = state

        val editors = FileEditorManager.getInstance(project).openFile(file, true)
        // A fresh in-memory document is user-read-only until the plugin rebuilds it.
        FileDocumentManager.getInstance().getDocument(file)?.setReadOnly(true)
        installFilterToolbar(editors, state, category)
        installCloseListener(project, category, state)

        // Subscribe OFF the EDT: the seam's initial read + the polling ticker feed onLines on a
        // pooled thread; each batch is marshalled back to the EDT via a disposed-guarded invokeLater.
        ApplicationManager.getApplication().executeOnPooledThread {
            val handle = seam.tail(category) { lines -> onBatch(state, lines) }
            // Publish the handle atomically w.r.t. dispose(): if the tab/project was already closed
            // while we were subscribing (dispose ran first, state.tail still null), close the handle
            // here so its polling ticker cannot leak (the close-during-open race).
            val closeNow = synchronized(state) {
                if (state.disposed) true else { state.tail = handle; false }
            }
            if (closeNow) handle.close()
        }
    }

    // ---- Streaming ----------------------------------------------------------

    private fun onBatch(state: OpenLog, lines: List<LogLine>) {
        if (state.disposed || lines.isEmpty()) return
        synchronized(state.buffer) {
            state.buffer.addAll(lines)
            while (state.buffer.size > MAX_BUFFER) state.buffer.removeFirst()
        }
        ApplicationManager.getApplication().invokeLater({ rebuild(state) }, { state.disposed })
    }

    /** Rebuild the editor document from the CURRENT bounded buffer, filtered — on the EDT. */
    private fun rebuild(state: OpenLog) {
        if (state.disposed || !state.file.isValid) return
        val doc = FileDocumentManager.getInstance().getDocument(state.file) ?: return
        val filter = state.filter
        val text = synchronized(state.buffer) {
            state.buffer.filter { matchesFilter(it, filter) }.joinToString("\n") { formatLine(it) }
        }
        CommandProcessor.getInstance().runUndoTransparentAction {
            ApplicationManager.getApplication().runWriteAction {
                doc.setReadOnly(false)
                try {
                    doc.setText(text)
                } finally {
                    doc.setReadOnly(true)
                }
            }
        }
    }

    private fun formatLine(l: LogLine): String {
        if (l.msg == null) return l.raw
        val lvl = LogLevels.label(l.level)
        val mod = l.module?.let { " $it:" } ?: ""
        return "${if (lvl.isNotEmpty()) "$lvl " else ""}$mod ${l.msg}".replace(Regex("\\s+"), " ").trim()
    }

    // ---- Filter toolbar (the editor's header component) ----------------------

    private fun installFilterToolbar(editors: Array<out com.intellij.openapi.fileEditor.FileEditor>, state: OpenLog, category: LogCategory) {
        val textEditor = editors.filterIsInstance<TextEditor>().firstOrNull() ?: return
        val level = JBTextField(6)
        val module = JBTextField(10)
        val text = JBTextField(12)
        val panel = JPanel(FlowLayout(FlowLayout.LEFT, JBUI.scale(6), JBUI.scale(2))).apply {
            add(JBLabel("${category.title} log — filter:"))
            add(JBLabel("level")); add(level)
            add(JBLabel("module")); add(module)
            add(JBLabel("text")); add(text)
        }
        val onChange = {
            state.filter = LogFilter(
                minLevel = LogLevels.parseLevel(level.text),
                module = module.text.takeIf { it.isNotBlank() },
                text = text.text.takeIf { it.isNotBlank() },
            )
            rebuild(state)
        }
        val listener = object : DocumentListener {
            override fun insertUpdate(e: DocumentEvent) = onChange()
            override fun removeUpdate(e: DocumentEvent) = onChange()
            override fun changedUpdate(e: DocumentEvent) = onChange()
        }
        level.document.addDocumentListener(listener)
        module.document.addDocumentListener(listener)
        text.document.addDocumentListener(listener)
        textEditor.editor.setHeaderComponent(panel)
    }

    // ---- Dispose on tab / project close --------------------------------------

    private fun installCloseListener(project: Project, category: LogCategory, state: OpenLog) {
        // A per-tab Disposable registered on the project: disposing it runs the cleanup. Registering
        // it on `project` guarantees the tail's polling ticker is cancelled on PROJECT close even if
        // the tab is still open (a messageBus disconnect alone would NOT cancel the app-scoped ticker,
        // and fileClosed is not reliably delivered during project teardown).
        val disposable = Disposer.newDisposable("insrc-log-${category.stem}")
        Disposer.register(project, disposable)
        Disposer.register(disposable) { dispose(category, state) }
        // The tab-close path: dispose the per-tab Disposable (which runs cleanup + disconnects below).
        project.messageBus.connect(disposable).subscribe(
            FileEditorManagerListener.FILE_EDITOR_MANAGER,
            object : FileEditorManagerListener {
                override fun fileClosed(source: FileEditorManager, closedFile: VirtualFile) {
                    if (closedFile == state.file) Disposer.dispose(disposable)
                }
            },
        )
    }

    private fun dispose(category: LogCategory, state: OpenLog) {
        val handle = synchronized(state) {
            if (state.disposed) return
            state.disposed = true
            state.tail          // may be null if the off-EDT subscribe has not completed yet;
        }                       // that path closes its own handle via the closeNow check in openLog.
        try { handle?.close() } catch (e: Exception) { /* ignore */ }
        open.remove(category.id, state)
    }
}
