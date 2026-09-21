package ai.insors.insrc.jetbrains.debug

import java.nio.file.Files
import java.nio.file.Path

/** A platform-neutral projection of one [java.lang.ProcessHandle] the scan matches against:
 *  [pid] from `handle.pid()`, [commandLine] from `handle.info().commandLine().orElse(null)`.
 *  A null [commandLine] is the unobservable-platform signal the scan uses to degrade. */
data class ProcessSnapshot(val pid: Long, val commandLine: String?)

/** A stray daemon-entry process the scan recommends (its command contains the daemon entry
 *  and it is not the managed pid). Its [pid] is what a Kill selection passes. */
data class OrphanProcess(val pid: Long, val command: String)

/** The read-only result of an orphan scan (mirrors debug.ts `{supported:false} | {supported:true,orphans}`). */
sealed interface OrphanScanResult {
    /** The platform can't observe process command lines (Windows, or no observable commandLine). */
    data object Unsupported : OrphanScanResult

    /** The observable orphans (possibly empty). */
    data class Scanned(val orphans: List<OrphanProcess>) : OrphanScanResult
}

/** The per-pid result of a kill (mirrors debug.ts `'terminated'|'forced'|'not-found'|'error'`
 *  plus an explicit [SKIPPED] for the re-excluded managed pid, k5). */
enum class KillResult { TERMINATED, FORCED, NOT_FOUND, SKIPPED, ERROR }

/** One outcome per input pid, in input order. */
data class KillOutcome(val pid: Long, val result: KillResult)

/**
 * The OS-process seam that issues the single kill signal to another process (SIGTERM /
 * SIGKILL) and re-probes liveness. Split out as an interface so [OrphanProcessSeam.kill]
 * is unit-testable against a fake with no real signals; the production [LiveProcessKiller]
 * routes through [java.lang.ProcessHandle].
 */
interface ProcessKiller {
    /** Request SIGTERM. Returns false when there is no such live process (ESRCH-equivalent);
     *  throws only on a real OS/security error. */
    fun terminate(pid: Long): Boolean

    /** Request SIGKILL. A no-op when the process is already gone; throws only on a real error. */
    fun forceKill(pid: Long)

    /** Liveness re-probe. */
    fun isAlive(pid: Long): Boolean
}

/** Production [ProcessKiller] over java.lang.ProcessHandle. */
object LiveProcessKiller : ProcessKiller {
    override fun terminate(pid: Long): Boolean =
        ProcessHandle.of(pid).map { it.destroy() }.orElse(false)

    override fun forceKill(pid: Long) {
        ProcessHandle.of(pid).ifPresent { it.destroyForcibly() }
    }

    override fun isAlive(pid: Long): Boolean =
        ProcessHandle.of(pid).map { it.isAlive }.orElse(false)
}

/**
 * S004-internal, plugin-only OS-process seam that RECOMMENDS stray daemon-entry processes
 * and — the Epic's ONLY mutation — terminates exactly the operator's explicit selection.
 * It reproduces the CLI `src/cli/services/debug.ts` scanOrphansWith/killOrphansWith contract
 * with `java.lang.ProcessHandle` (k1 plugin-only; no daemon IPC):
 *
 *  - [scan] keeps processes whose command line contains [daemonEntry], EXCLUDING [managedPid],
 *    and degrades to [OrphanScanResult.Unsupported] off a capable platform (win32, or no
 *    observable command line). A read-only recommendation, never a signal.
 *  - [kill] acts ONLY on the passed pids (no 'kill all'), re-excludes the managed pid
 *    ([KillResult.SKIPPED], never signalled — k5), and escalates SIGTERM → wait grace →
 *    SIGKILL only for survivors, returning one outcome per input pid IN INPUT ORDER.
 *
 * Both NEVER throw: an enumeration failure degrades to `Scanned(empty)`, a per-pid signal
 * failure folds into that pid's [KillOutcome]. Every provider is injectable so the whole
 * contract is unit-testable with no real `ps`/kill.
 */
class OrphanProcessSeam(
    private val processes: () -> List<ProcessSnapshot> = { liveProcessSnapshots() },
    private val managedPid: () -> Long? = { pidFromDaemonPidFile() },
    private val daemonEntry: String = defaultDaemonEntry(),
    private val platformSupported: () -> Boolean = { isPosix() },
    private val killer: ProcessKiller = LiveProcessKiller,
    private val waiter: (Long) -> Unit = { ms -> Thread.sleep(ms) },
    private val graceMillis: Long = KILL_GRACE_MS,
) {

    /** Recommend stray daemon-entry processes. Read-only; never throws; never signals. */
    fun scan(): OrphanScanResult {
        if (!platformSupported()) return OrphanScanResult.Unsupported
        val snapshots = try {
            processes()
        } catch (e: Exception) {
            // ps-failure parity with debug.ts: degrade to an empty recommendation.
            return OrphanScanResult.Scanned(emptyList())
        }
        // No observable command line anywhere ⇒ the platform can't be scanned for orphans.
        if (snapshots.isNotEmpty() && snapshots.none { it.commandLine != null }) {
            return OrphanScanResult.Unsupported
        }
        val managed = try { managedPid() } catch (e: Exception) { null }
        val orphans = snapshots.mapNotNull { snap ->
            val command = snap.commandLine ?: return@mapNotNull null
            if (!command.contains(daemonEntry)) return@mapNotNull null
            if (managed != null && snap.pid == managed) return@mapNotNull null
            OrphanProcess(snap.pid, command)
        }
        return OrphanScanResult.Scanned(orphans)
    }

    /**
     * Terminate exactly [pids] (the operator's selection). Re-excludes the managed pid
     * (SKIPPED), SIGTERM → wait → SIGKILL survivors, per-pid outcomes in input order.
     * Never throws; returns [] off an unsupported platform.
     */
    fun kill(pids: List<Long>): List<KillOutcome> {
        if (!platformSupported()) return emptyList()
        val managed = try { managedPid() } catch (e: Exception) { null }
        val result = HashMap<Long, KillResult>()
        val pending = ArrayList<Long>()

        for (pid in pids) {
            if (managed != null && pid == managed) continue // reported SKIPPED below; never signalled (k5)
            try {
                if (killer.terminate(pid)) pending.add(pid) else result[pid] = KillResult.NOT_FOUND
            } catch (e: Exception) {
                result[pid] = KillResult.ERROR
            }
        }

        if (pending.isNotEmpty()) {
            try { waiter(graceMillis) } catch (e: InterruptedException) { Thread.currentThread().interrupt() }
        }

        for (pid in pending) {
            val alive = try { killer.isAlive(pid) } catch (e: Exception) { false }
            if (!alive) {
                result[pid] = KillResult.TERMINATED
                continue
            }
            try {
                killer.forceKill(pid)
                result[pid] = KillResult.FORCED
            } catch (e: Exception) {
                result[pid] = KillResult.ERROR
            }
        }

        return pids.map { pid ->
            val r = if (managed != null && pid == managed) KillResult.SKIPPED else result[pid] ?: KillResult.ERROR
            KillOutcome(pid, r)
        }
    }

    companion object {
        /** SIGTERM→SIGKILL grace window (ms), mirroring daemon-ctl.sh's stop drain (debug.ts KILL_GRACE_MS). */
        const val KILL_GRACE_MS: Long = 3_000

        /** Production process source: every live process as a [ProcessSnapshot]. */
        fun liveProcessSnapshots(): List<ProcessSnapshot> =
            ProcessHandle.allProcesses()
                .map { ProcessSnapshot(it.pid(), it.info().commandLine().orElse(null)) }
                .toList()

        /** `$INSRC_DAEMON_ROOT ?: ~/.insrc/daemon` — the installed daemon root (maintenance.ts:34). */
        fun defaultDaemonRoot(): Path =
            System.getenv("INSRC_DAEMON_ROOT")?.let { Path.of(it) }
                ?: Path.of(System.getProperty("user.home"), ".insrc", "daemon")

        /** `<DAEMON_ROOT>/out/daemon/index.js` — the resolved daemon entry a candidate command
         *  must contain to be a daemon process (mirrors debug.ts DAEMON_ENTRY). */
        fun defaultDaemonEntry(): String =
            defaultDaemonRoot().resolve("out").resolve("daemon").resolve("index.js").toString()

        /** Best-effort managed pid from `~/.insrc/daemon.pid` — null if absent/non-numeric. */
        fun pidFromDaemonPidFile(): Long? {
            val pidFile = Path.of(System.getProperty("user.home"), ".insrc", "daemon.pid")
            return try {
                if (!Files.isRegularFile(pidFile)) null
                else Files.readString(pidFile).trim().toLongOrNull()
            } catch (e: Exception) {
                null
            }
        }

        /** POSIX gate — orphan detection/kill is unsupported on Windows. */
        fun isPosix(): Boolean =
            !System.getProperty("os.name").orEmpty().startsWith("Windows", ignoreCase = true)
    }
}
