package ai.insors.insrc.jetbrains.debug

import ai.insors.insrc.jetbrains.daemon.DaemonStatusDto
import ai.insors.insrc.jetbrains.daemon.DaemonStatusResult
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertFalse
import org.junit.jupiter.api.Assertions.assertNull
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Test

/**
 * Unit tests for the S004 [DebugStatusCardReader] (Story E2026092157298940:S004 / t4).
 * Drive read() against injected status/socket/pid/version providers so the sc2 fold +
 * local-derive is verified off the platform (ac1).
 */
class DebugStatusCardReaderTest {

    private val socket = "/home/u/.insrc/daemon.sock"

    private fun reader(
        status: DaemonStatusResult,
        pid: Long? = 4242,
        version: String? = "1.2.3",
    ) = DebugStatusCardReader(
        status = { status },
        socketPath = { socket },
        pid = { pid },
        version = { version },
    )

    private fun loaded() = DaemonStatusResult.Loaded(
        DaemonStatusDto(
            running = true, uptimeSec = 120, queueDepth = 0, embeddingsPending = 0,
            modelPullStatus = "ready", modelPullPct = null, lmdbFileSizeMb = 7, repoCount = 3,
        ),
    )

    @Test
    fun `a Loaded status folds into a reachable card with the sc2 fields + local-derive`() {
        val card = reader(loaded()).read()
        assertTrue(card.reachable)
        assertEquals(true, card.running)
        assertEquals(120L, card.uptimeSec)
        assertEquals(3, card.repoCount)
        assertEquals(socket, card.socket)
        assertEquals(4242L, card.pid)
        assertEquals("1.2.3", card.version)
        assertNull(card.notReachableReason)
    }

    @Test
    fun `a Stopped daemon yields a not-reachable card that still carries socket + best-effort`() {
        val card = reader(DaemonStatusResult.Stopped).read()
        assertFalse(card.reachable)
        assertEquals("stopped", card.notReachableReason)
        assertEquals(socket, card.socket)
        assertEquals(4242L, card.pid)
        assertEquals("1.2.3", card.version)
    }

    @Test
    fun `an Unavailable daemon carries the reason and still the socket`() {
        val card = reader(DaemonStatusResult.Unavailable("socket error")).read()
        assertFalse(card.reachable)
        assertEquals("socket error", card.notReachableReason)
        assertEquals(socket, card.socket)
    }

    @Test
    fun `a missing pidfile and package_json degrade pid and version to null without failing`() {
        val card = reader(loaded(), pid = null, version = null).read()
        assertTrue(card.reachable)
        assertNull(card.pid)
        assertNull(card.version)
        assertEquals(socket, card.socket) // socket is always populated
    }
}
