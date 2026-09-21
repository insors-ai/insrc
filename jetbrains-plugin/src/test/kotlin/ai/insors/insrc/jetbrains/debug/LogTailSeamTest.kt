package ai.insors.insrc.jetbrains.debug

import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertFalse
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Test
import java.nio.file.Path
import java.nio.file.Paths

/**
 * Unit tests for the rotation-aware log tail (Story E2026092157298940:S006 / t2+t5). Drive
 * [LogTailSeam] over a SCRIPTED [LogTailFs] fake (no real disk watcher) exactly like the
 * OrphanProcessSeam ScriptedKiller idiom, proving the CLI tailLogWith semantics:
 * initial-last-maxLines / append-only / rotation / truncation / never-throws / idempotent dispose.
 */
class LogTailSeamTest {

    private val daemon = LogCategory(LogCategoryId.DAEMON, "Daemon", "daemon")

    /**
     * A scripted fs: programmable segment list + per-file line contents + a manual watch trigger.
     * `trigger()` fires the last-installed onEvent, standing in for a fs event.
     */
    private class ScriptedLogTailFs : LogTailFs {
        val segments = mutableListOf<Path>()
        val lines = HashMap<Path, MutableList<String>>()
        var onEvent: (() -> Unit)? = null
        var throwOnList = false
        var throwOnRead = false
        var throwOnWatch = false

        override fun listSegments(dir: Path, stem: String): List<Path> {
            if (throwOnList) throw RuntimeException("insrc-test: list failed")
            return segments.toList()
        }

        override fun readLines(file: Path): List<String> {
            if (throwOnRead) throw RuntimeException("insrc-test: read failed")
            return lines[file]?.toList() ?: emptyList()
        }

        override fun watch(dir: Path, onEvent: () -> Unit): AutoCloseable {
            if (throwOnWatch) throw RuntimeException("insrc-test: watch failed")
            this.onEvent = onEvent
            return AutoCloseable { this.onEvent = null }
        }

        fun trigger() = onEvent?.invoke()
    }

    private fun seam(fs: LogTailFs, maxLines: Int = 3) =
        LogTailSeam(fs = fs, logDir = Paths.get("/tmp", ".insrc"), maxLines = maxLines)

    // ---- initial last-maxLines of the highest-N segment ----------------------

    @Test
    fun `tail emits the last maxLines of the highest-N segment initially`() {
        val fs = ScriptedLogTailFs()
        val older = Paths.get("/tmp/.insrc/daemon.1.log")
        val active = Paths.get("/tmp/.insrc/daemon.2.log")
        fs.segments.addAll(listOf(older, active))                       // listSegments already sorted ascending
        fs.lines[active] = mutableListOf("l1", "l2", "l3", "l4", "l5")

        val batches = mutableListOf<List<LogLine>>()
        seam(fs, maxLines = 3).tail(daemon) { batches += it }

        assertEquals(1, batches.size)
        assertEquals(listOf("l3", "l4", "l5"), batches[0].map { it.raw }) // last 3 of the ACTIVE (highest-N) segment
    }

    // ---- append-only follow (seen) -------------------------------------------

    @Test
    fun `a watch trigger after appended lines emits ONLY the fresh lines`() {
        val fs = ScriptedLogTailFs()
        val active = Paths.get("/tmp/.insrc/daemon.1.log")
        fs.segments.add(active)
        fs.lines[active] = mutableListOf("a", "b")

        val batches = mutableListOf<List<LogLine>>()
        seam(fs, maxLines = 10).tail(daemon) { batches += it }
        assertEquals(listOf("a", "b"), batches[0].map { it.raw })  // initial

        fs.lines[active]!!.addAll(listOf("c", "d"))
        fs.trigger()
        assertEquals(2, batches.size)
        assertEquals(listOf("c", "d"), batches[1].map { it.raw })  // ONLY the appended lines
    }

    // ---- rotation + truncation ----------------------------------------------

    @Test
    fun `rotation to a higher-N segment resets seen and truncation re-tails from 0`() {
        val fs = ScriptedLogTailFs()
        val s1 = Paths.get("/tmp/.insrc/daemon.1.log")
        fs.segments.add(s1)
        fs.lines[s1] = mutableListOf("x1", "x2")

        val batches = mutableListOf<List<LogLine>>()
        seam(fs, maxLines = 10).tail(daemon) { batches += it }
        assertEquals(listOf("x1", "x2"), batches[0].map { it.raw })

        // rotation: a new higher-N segment appears; seen resets, the whole new file is fresh
        val s2 = Paths.get("/tmp/.insrc/daemon.2.log")
        fs.segments.add(s2)
        fs.lines[s2] = mutableListOf("y1", "y2")
        fs.trigger()
        assertEquals(listOf("y1", "y2"), batches[1].map { it.raw })

        // truncation: the active file shrinks below seen -> re-tail from 0 (no negative slice)
        fs.lines[s2] = mutableListOf("z1")
        fs.trigger()
        assertEquals(listOf("z1"), batches[2].map { it.raw })
    }

    // ---- never-throws + idempotent dispose -----------------------------------

    @Test
    fun `a throwing fs degrades to an empty initial emit and a valid idempotent dispose`() {
        val fs = ScriptedLogTailFs().apply { throwOnList = true; throwOnWatch = true }
        val batches = mutableListOf<List<LogLine>>()
        val handle = seam(fs).tail(daemon) { batches += it }
        assertEquals(1, batches.size)
        assertTrue(batches[0].isEmpty(), "no active segment -> empty initial emit, never throws")
        // idempotent close, no throw
        handle.close(); handle.close()
    }

    @Test
    fun `a post-dispose trigger emits nothing`() {
        val fs = ScriptedLogTailFs()
        val active = Paths.get("/tmp/.insrc/daemon.1.log")
        fs.segments.add(active)
        fs.lines[active] = mutableListOf("a")

        val batches = mutableListOf<List<LogLine>>()
        val handle = seam(fs, maxLines = 10).tail(daemon) { batches += it }
        val countAtDispose = batches.size
        handle.close()

        fs.lines[active]!!.add("b")
        fs.trigger()  // the fake still holds onEvent, but the seam's disposed guard suppresses it
        assertEquals(countAtDispose, batches.size, "no emit after dispose")
    }

    @Test
    fun `a transient read failure skips the emit without throwing`() {
        val fs = ScriptedLogTailFs()
        val active = Paths.get("/tmp/.insrc/daemon.1.log")
        fs.segments.add(active)
        fs.lines[active] = mutableListOf("a")
        val batches = mutableListOf<List<LogLine>>()
        seam(fs, maxLines = 10).tail(daemon) { batches += it }
        assertEquals(1, batches.size)

        fs.throwOnRead = true
        fs.trigger()  // read fails -> emit skipped, no throw
        assertEquals(1, batches.size)

        fs.throwOnRead = false
        fs.lines[active]!!.add("b")
        fs.trigger()  // recovers
        assertFalse(batches.size == 1)
    }
}
