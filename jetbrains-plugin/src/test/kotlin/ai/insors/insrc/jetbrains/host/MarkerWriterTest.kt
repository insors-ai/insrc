package ai.insors.insrc.jetbrains.host

import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertFalse
import org.junit.jupiter.api.Assertions.assertThrows
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Test
import java.io.IOException

/**
 * sc3 marker-writer unit tests (Story S002 / t2, k4) — platform-free. They drive
 * [MarkerFileWriter] over an in-memory [HostFileIo] so the replace-only /
 * idempotent / restore / IO-failure behaviour is asserted byte-for-byte without
 * a real filesystem or IDE fixture. The writer is format-agnostic: no host-shape
 * logic appears here (recognition is t3's).
 */
class MarkerWriterTest {

    private val BEGIN = "<!-- insrc:mcp:start -->"
    private val END = "<!-- insrc:mcp:end -->"
    private fun block(body: String) = MarkerDelimitedBlock(BEGIN, END, body)

    /** An in-memory host file; `content == null` means absent. Optionally fails IO. */
    private class FakeIo(
        var content: String? = null,
        val failRead: Boolean = false,
        val failWrite: Boolean = false,
    ) : HostFileIo {
        var writes = 0
        override fun read(path: String): String? {
            if (failRead) throw IOException("read denied")
            return content
        }
        override fun write(path: String, content: String) {
            if (failWrite) throw IOException("write denied")
            this.content = content
            writes++
        }
    }

    @Test
    fun writeBlock_insertsOnce_preservesSurrounding_idempotentOnRerun() {
        val io = FakeIo(content = "USER SETTINGS\n")
        val writer = MarkerFileWriter(io)

        writer.writeBlock("/host/mcp", block("REGISTRATION"))
        assertEquals(
            "USER SETTINGS\n\n$BEGIN\nREGISTRATION\n$END\n",
            io.content,
        )
        // surrounding user content preserved verbatim
        assertTrue(io.content!!.startsWith("USER SETTINGS\n"))
        // exactly one block
        assertEquals(1, countOf(io.content!!, BEGIN))

        // idempotent: a second identical write leaves the file byte-identical and does not re-write
        val before = io.content
        val writesBefore = io.writes
        writer.writeBlock("/host/mcp", block("REGISTRATION"))
        assertEquals(before, io.content)
        assertEquals(writesBefore, io.writes, "identical re-write must be a no-op (no write performed)")
    }

    @Test
    fun writeBlock_replacesExistingSameMarkerBlockInPlace_noDuplicate() {
        val io = FakeIo(content = "TOP\n\n$BEGIN\nOLD\n$END\n")
        val writer = MarkerFileWriter(io)

        writer.writeBlock("/host/mcp", block("NEW"))
        assertEquals("TOP\n\n$BEGIN\nNEW\n$END\n", io.content)
        // replaced in place — still exactly one block, no duplicate appended
        assertEquals(1, countOf(io.content!!, BEGIN))
        assertEquals(1, countOf(io.content!!, END))
        assertFalse(io.content!!.contains("OLD"))
    }

    @Test
    fun removeBlock_stripsOnlyTheBlock_restoresPriorContent_noopWhenAbsent() {
        // append then remove restores the pre-insrc content byte-for-byte
        val io = FakeIo(content = "USER SETTINGS\n")
        val writer = MarkerFileWriter(io)
        writer.writeBlock("/host/mcp", block("REGISTRATION"))
        writer.removeBlock("/host/mcp", BEGIN, END)
        assertEquals("USER SETTINGS\n", io.content)

        // no-op when no block present: file untouched, no write performed
        val writesAfter = io.writes
        writer.removeBlock("/host/mcp", BEGIN, END)
        assertEquals("USER SETTINGS\n", io.content)
        assertEquals(writesAfter, io.writes, "removing an absent block must not write")

        // no-op on an absent file
        val emptyIo = FakeIo(content = null)
        MarkerFileWriter(emptyIo).removeBlock("/host/mcp", BEGIN, END)
        assertEquals(0, emptyIo.writes)
    }

    @Test
    fun ioFailure_surfacesHostFileAccessException_noPartialWrite() {
        // write failure -> surfaced, and the file is left exactly as it was
        val original = "USER SETTINGS\n"
        val io = FakeIo(content = original, failWrite = true)
        val writer = MarkerFileWriter(io)
        assertThrows(HostFileAccessException::class.java) {
            writer.writeBlock("/host/mcp", block("REGISTRATION"))
        }
        assertEquals(original, io.content, "no partial write — file unchanged on write failure")
        assertEquals(0, io.writes)

        // read failure -> surfaced too (never swallowed)
        val readIo = FakeIo(content = original, failRead = true)
        assertThrows(HostFileAccessException::class.java) {
            MarkerFileWriter(readIo).writeBlock("/host/mcp", block("REGISTRATION"))
        }
        assertEquals(original, readIo.content)
    }

    private fun countOf(haystack: String, needle: String): Int {
        var n = 0
        var i = haystack.indexOf(needle)
        while (i != -1) {
            n++
            i = haystack.indexOf(needle, i + needle.length)
        }
        return n
    }
}
