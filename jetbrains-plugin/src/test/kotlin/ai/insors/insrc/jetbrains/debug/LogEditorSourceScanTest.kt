package ai.insors.insrc.jetbrains.debug

import org.junit.jupiter.api.Assertions.assertFalse
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Test
import java.io.File

/**
 * Source-scan guards for the platform-coupled log-editor surface (Story E2026092157298940:S006 /
 * t3+t4+t5). The FileEditorManager/LightVirtualFile surface + the Settings section are not
 * headlessly bootable, so the load-bearing invariants are asserted against source TEXT (the
 * DebugPageTest idiom): the editor-tab surface (k5), the off-EDT guarded write-action stream (k2),
 * dispose-on-close, strictly read-only (no delete/rotate/clear, k5/ac2), and the project resolution.
 */
class LogEditorSourceScanTest {

    private fun read(path: String): String {
        val f = File(path)
        assertTrue(f.exists(), "expected source at $path (test cwd=${File("").absolutePath})")
        return f.readText()
    }

    private val surface by lazy { read("src/main/kotlin/ai/insors/insrc/jetbrains/debug/LogEditorSurface.kt") }
    private val section by lazy { read("src/main/kotlin/ai/insors/insrc/jetbrains/debug/LogEditorSection.kt") }
    private val seam by lazy { read("src/main/kotlin/ai/insors/insrc/jetbrains/debug/LogTailSeam.kt") }

    // ---- ac1/k5/k2: the editor-tab surface + off-EDT guarded stream ----------

    @Test
    fun `the surface opens a LightVirtualFile via FileEditorManager and streams off the EDT under a write action`() {
        assertTrue(surface.contains("LightVirtualFile("), "opens a LightVirtualFile (k5: an editor-backing file)")
        assertTrue(surface.contains("FileEditorManager.getInstance"), "opens via FileEditorManager (an editor tab, not inline)")
        assertTrue(surface.contains("executeOnPooledThread"), "subscribes the tail OFF the EDT (k2)")
        assertTrue(surface.contains("invokeLater"), "marshals the document rebuild back to the EDT")
        assertTrue(surface.contains("runWriteAction"), "rebuilds the Document under a write action")
        assertTrue(surface.contains("MAX_BUFFER"), "streams through a BOUNDED ring buffer (memory-safe)")
        assertTrue(surface.contains("matchesFilter("), "the view is filtered from the buffer")
    }

    // ---- ac2/k5: read-only user + read-only on-disk log ----------------------

    @Test
    fun `the surface is user-read-only and never deletes rotates or clears the on-disk log`() {
        assertTrue(surface.contains("setReadOnly(true)"), "the document is user-read-only (blocks typing)")
        // the on-disk log is untouched: the surface writes/deletes NOTHING on disk (it renders into a
        // separate in-memory LightVirtualFile). No java.nio write/delete anywhere.
        assertFalse(surface.contains("Files.write"), "no on-disk write")
        assertFalse(surface.contains("Files.delete"), "no on-disk delete")
        assertFalse(surface.contains("deleteRecursively"), "no on-disk delete")
        assertFalse(surface.contains(".delete()"), "no file delete")
    }

    @Test
    fun `the surface disposes the tail on editor or project close`() {
        assertTrue(surface.contains("FileEditorManagerListener"), "listens for the editor tab closing")
        assertTrue(surface.contains("fileClosed"), "disposes on the tab closing (fileClosed)")
        // Project-close is covered by registering the per-tab Disposable on the project, so the
        // app-scoped polling ticker is cancelled even if the tab is still open.
        assertTrue(surface.contains("Disposer.register(project"), "the cleanup Disposable is scoped to the project (project-close safe)")
        assertTrue(surface.contains("handle?.close()") || surface.contains("handle.close()"), "the tail handle is closed on dispose")
        assertTrue(surface.contains("disposed"), "a disposed guard suppresses a late post-close emit")
    }

    // ---- t4: the section is the sc3 affordance, resolves a Project, opens an editor (not inline)

    @Test
    fun `the section implements DebugSection, resolves a Project and delegates to the editor surface`() {
        assertTrue(section.contains(": DebugSection"), "implements the sc3 DebugSection")
        assertTrue(section.contains("surface.openLog("), "delegates to LogEditorSurface.openLog (opens an editor tab)")
        assertTrue(section.contains("CommonDataKeys.PROJECT"), "resolves a Project from the Settings DataContext")
        assertTrue(section.contains("ProjectManager.getInstance().openProjects"), "falls back to the open-projects scan")
        assertTrue(section.contains("Open a project to view logs"), "degrades to a clear line when no project is open")
        // the section itself does NOT tail/render the log inline — the live view lives in the editor surface
        assertFalse(section.contains("LogTailSeam"), "the section does not tail inline; the surface owns the stream (k5)")
    }

    // ---- t2: default log dir is /tmp/.insrc (NOT ~/.insrc) + the segment regex

    @Test
    fun `the seam defaults to the tmp insrc log dir and the stem-N-log segment scheme`() {
        assertTrue(seam.contains("Paths.get(\"/tmp\", \".insrc\")"), "defaultLogDir is /tmp/.insrc (mirrors PATHS.logDir, NOT ~/.insrc)")
        assertTrue(seam.contains("\\\\.(\\\\d+)\\\\.log"), "matches the <stem>.<N>.log rotation scheme")
        assertFalse(seam.contains("Files.write"), "the seam is read-only (no on-disk write)")
        assertFalse(seam.contains("Files.delete"), "the seam is read-only (no on-disk delete)")
    }
}
