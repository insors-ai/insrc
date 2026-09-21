package ai.insors.insrc.jetbrains.debug

import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertFalse
import org.junit.jupiter.api.Assertions.assertNull
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Test

/**
 * Pure-core unit tests for the log model (Story E2026092157298940:S006 / t1+t5). parseLogLine +
 * matchesFilter + LogLevels must mirror the CLI (src/cli/services/debug.ts + debug-types.ts)
 * byte-for-byte; these are golden CLI-parity vectors driven off the platform.
 */
class LogModelTest {

    // ---- parseLogLine --------------------------------------------------------

    @Test
    fun `parseLogLine fills the pino-JSON fields and always keeps raw`() {
        val raw = """{"time":1700000000000,"level":40,"name":"indexer","msg":"queued 3 files"}"""
        val line = parseLogLine(raw)
        assertEquals(raw, line.raw)
        assertEquals(1700000000000L, line.timeMs)
        assertEquals(40, line.level)
        assertEquals("indexer", line.module)
        assertEquals("queued 3 files", line.msg)
    }

    @Test
    fun `parseLogLine tolerates a name-but-no-msg line`() {
        val line = parseLogLine("""{"level":30,"name":"daemon"}""")
        assertEquals(30, line.level)
        assertEquals("daemon", line.module)
        assertNull(line.msg)
        assertNull(line.timeMs)
    }

    @Test
    fun `parseLogLine keeps only raw for a non-JSON or partial line and never throws`() {
        val free = parseLogLine("plain text line, not json")
        assertEquals("plain text line, not json", free.raw)
        assertNull(free.level); assertNull(free.module); assertNull(free.msg); assertNull(free.timeMs)

        val partial = parseLogLine("""{"level":50,"msg":"truncat""")   // malformed JSON
        assertEquals("""{"level":50,"msg":"truncat""", partial.raw)
        assertNull(partial.level)

        // a JSON array / primitive is not an object -> raw only
        assertNull(parseLogLine("[1,2,3]").level)
        assertNull(parseLogLine("42").msg)
    }

    // ---- matchesFilter -------------------------------------------------------

    private fun ln(raw: String, level: Int? = null, module: String? = null) =
        LogLine(raw = raw, timeMs = null, level = level, module = module, msg = null)

    @Test
    fun `matchesFilter minLevel keeps ge and drops both below and no-level`() {
        val f = LogFilter(minLevel = 30)
        assertTrue(matchesFilter(ln("a", level = 40), f))   // 40 >= 30
        assertTrue(matchesFilter(ln("a", level = 30), f))   // 30 >= 30
        assertFalse(matchesFilter(ln("a", level = 20), f))  // 20 < 30
        assertFalse(matchesFilter(ln("a", level = null), f)) // no level dropped by an active minLevel
    }

    @Test
    fun `matchesFilter module is a case-insensitive substring and drops no-module`() {
        val f = LogFilter(module = "Index")
        assertTrue(matchesFilter(ln("a", module = "indexer"), f)) // case-insensitive substring
        assertFalse(matchesFilter(ln("a", module = "daemon"), f))
        assertFalse(matchesFilter(ln("a", module = null), f))     // no module dropped by an active module filter
    }

    @Test
    fun `matchesFilter text is a case-insensitive substring over raw incl a non-JSON line`() {
        val f = LogFilter(text = "ERROR")
        assertTrue(matchesFilter(ln("a hard error happened"), f)) // matches raw, case-insensitive
        assertFalse(matchesFilter(ln("all good"), f))
        // free-text still matches a non-JSON line (raw only)
        assertTrue(matchesFilter(parseLogLine("boom: fatal ERROR trace"), f))
    }

    @Test
    fun `matchesFilter ANDs active fields and an empty filter matches everything`() {
        val both = LogFilter(minLevel = 40, module = "idx")
        assertTrue(matchesFilter(ln("a", level = 50, module = "idx-worker"), both))
        assertFalse(matchesFilter(ln("a", level = 50, module = "daemon"), both)) // module fails
        assertFalse(matchesFilter(ln("a", level = 20, module = "idx-worker"), both)) // level fails

        assertTrue(matchesFilter(ln("anything", level = null, module = null), LogFilter()))
    }

    // ---- LogLevels + categories ---------------------------------------------

    @Test
    fun `LogLevels parseLevel maps a name, a numeric string, blank and junk`() {
        assertEquals(40, LogLevels.parseLevel("warn"))
        assertEquals(40, LogLevels.parseLevel("WARN"))
        assertEquals(40, LogLevels.parseLevel("40"))
        assertNull(LogLevels.parseLevel(""))
        assertNull(LogLevels.parseLevel("   "))
        assertNull(LogLevels.parseLevel("nonsense"))
    }

    @Test
    fun `LogLevels label upper-cases a known level and falls back to the number for an unknown`() {
        assertEquals("INFO", LogLevels.label(30))
        assertEquals("FATAL", LogLevels.label(60))
        assertEquals("35", LogLevels.label(35)) // unknown numeric level -> raw number
        assertEquals("", LogLevels.label(null))
    }

    @Test
    fun `LogLevels carries the exact CLI numeric map`() {
        assertEquals(mapOf("trace" to 10, "debug" to 20, "info" to 30, "warn" to 40, "error" to 50, "fatal" to 60), LogLevels.byName)
    }

    @Test
    fun `LogCategories are the two CLI categories in order`() {
        assertEquals(listOf(LogCategoryId.DAEMON, LogCategoryId.AGENT), LogCategories.all.map { it.id })
        assertEquals(listOf("daemon", "agent"), LogCategories.all.map { it.stem })
    }
}
