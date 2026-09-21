package ai.insors.insrc.jetbrains.debug

import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertFalse
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Test

/**
 * Unit tests for the S004 [OrphanProcessSeam] (Story E2026092157298940:S004 / t2+t3).
 * Drive scan()/kill() against injected fake providers (the DaemonLifecycleCommandRunnerTest
 * idiom, mirroring the CLI debug-orphans.test.ts) so the match/exclude/degrade + the
 * k3/k5 SIGTERM→wait→SIGKILL escalation are verified with NO real ps/kill.
 */
class OrphanProcessSeamTest {

    private val entry = "/home/u/.insrc/daemon/out/daemon/index.js"

    private fun seam(
        snapshots: List<ProcessSnapshot> = emptyList(),
        managed: Long? = null,
        supported: Boolean = true,
        killer: ProcessKiller = NoopKiller,
        processesThrows: Boolean = false,
    ) = OrphanProcessSeam(
        processes = { if (processesThrows) throw RuntimeException("enum failed") else snapshots },
        managedPid = { managed },
        daemonEntry = entry,
        platformSupported = { supported },
        killer = killer,
        waiter = { /* instant grace clock */ },
    )

    private object NoopKiller : ProcessKiller {
        override fun terminate(pid: Long): Boolean = false
        override fun forceKill(pid: Long) {}
        override fun isAlive(pid: Long): Boolean = false
    }

    // ---- scan: match / exclude ----------------------------------------------

    @Test
    fun `scan keeps only daemon-entry-matching non-managed pids`() {
        val snaps = listOf(
            ProcessSnapshot(100, "node $entry --serve"),   // orphan
            ProcessSnapshot(200, "vim notes.txt"),          // not a daemon
            ProcessSnapshot(300, "node $entry"),            // the managed daemon -> excluded
        )
        val result = seam(snaps, managed = 300).scan()
        assertTrue(result is OrphanScanResult.Scanned)
        val orphans = (result as OrphanScanResult.Scanned).orphans
        assertEquals(listOf(100L), orphans.map { it.pid })
    }

    @Test
    fun `scan with only the managed daemon matching yields an empty list`() {
        val snaps = listOf(ProcessSnapshot(300, "node $entry"))
        val result = seam(snaps, managed = 300).scan()
        assertEquals(emptyList<OrphanProcess>(), (result as OrphanScanResult.Scanned).orphans)
    }

    // ---- scan: degrade -------------------------------------------------------

    @Test
    fun `scan degrades to Unsupported off a capable platform`() {
        assertTrue(seam(supported = false).scan() is OrphanScanResult.Unsupported)
    }

    @Test
    fun `scan degrades to Unsupported when no command line is observable`() {
        val snaps = listOf(ProcessSnapshot(1, null), ProcessSnapshot(2, null))
        assertTrue(seam(snaps).scan() is OrphanScanResult.Unsupported)
    }

    @Test
    fun `scan swallows an enumeration failure into an empty scan (never throws)`() {
        val result = seam(processesThrows = true).scan()
        assertEquals(emptyList<OrphanProcess>(), (result as OrphanScanResult.Scanned).orphans)
    }

    @Test
    fun `scan returns an empty scan for an empty process list`() {
        assertEquals(emptyList<OrphanProcess>(), (seam(emptyList()).scan() as OrphanScanResult.Scanned).orphans)
    }

    // ---- kill: escalation + outcomes ----------------------------------------

    /** A scripted killer: each pid maps to how it behaves under SIGTERM / liveness / SIGKILL. */
    private class ScriptedKiller(
        private val terminated: Set<Long> = emptySet(),   // dies on SIGTERM (not alive after grace)
        private val survivors: Set<Long> = emptySet(),     // survives SIGTERM, needs SIGKILL
        private val absent: Set<Long> = emptySet(),        // SIGTERM finds no process (NOT_FOUND)
        private val termThrows: Set<Long> = emptySet(),    // SIGTERM raises a real error (ERROR)
    ) : ProcessKiller {
        val signalled = mutableListOf<Long>()
        override fun terminate(pid: Long): Boolean {
            if (pid in termThrows) throw RuntimeException("boom")
            signalled.add(pid)
            return pid !in absent
        }
        override fun forceKill(pid: Long) { signalled.add(-pid) }
        override fun isAlive(pid: Long): Boolean = pid in survivors
    }

    @Test
    fun `kill escalates SIGTERM to SIGKILL and reports per-pid outcomes in input order`() {
        val killer = ScriptedKiller(
            terminated = setOf(10),
            survivors = setOf(20),
            absent = setOf(30),
            termThrows = setOf(40),
        )
        val outcomes = seam(killer = killer).kill(listOf(10, 20, 30, 40))
        assertEquals(listOf(10L, 20L, 30L, 40L), outcomes.map { it.pid })
        assertEquals(KillResult.TERMINATED, outcomes[0].result)
        assertEquals(KillResult.FORCED, outcomes[1].result)
        assertEquals(KillResult.NOT_FOUND, outcomes[2].result)
        assertEquals(KillResult.ERROR, outcomes[3].result)
        // The survivor got a SIGKILL (negative marker); the not-found/error pids did not.
        assertTrue(killer.signalled.contains(-20L))
    }

    // ---- kill: k5 (managed skipped) + no-op ---------------------------------

    @Test
    fun `kill reports the managed pid SKIPPED and never signals it`() {
        val killer = ScriptedKiller(terminated = setOf(10))
        val outcomes = seam(managed = 99, killer = killer).kill(listOf(10, 99))
        assertEquals(KillResult.TERMINATED, outcomes.single { it.pid == 10L }.result)
        assertEquals(KillResult.SKIPPED, outcomes.single { it.pid == 99L }.result)
        assertFalse(killer.signalled.contains(99L), "the managed pid is never signalled (k5)")
        assertFalse(killer.signalled.contains(-99L), "the managed pid is never SIGKILLed (k5)")
    }

    @Test
    fun `kill of an empty selection is a no-op`() {
        assertEquals(emptyList<KillOutcome>(), seam().kill(emptyList()))
    }

    @Test
    fun `kill returns empty off an unsupported platform`() {
        assertEquals(emptyList<KillOutcome>(), seam(supported = false).kill(listOf(1, 2)))
    }
}
