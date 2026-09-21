package ai.insors.insrc.jetbrains.debug

import com.intellij.util.concurrency.AppExecutorUtil
import java.nio.file.Files
import java.nio.file.Path
import java.nio.file.Paths
import java.util.concurrent.TimeUnit

/**
 * The injectable filesystem seam behind [LogTailSeam] (Story E2026092157298940:S006) — mirrors the
 * CLI TailDeps so rotation/append/parse are unit-testable without a real disk watcher.
 * [listSegments] returns the `<stem>.<N>.log` files under [dir] sorted ASCENDING by N (the active
 * segment is the last); [readLines] returns a file's current lines (trailing empty dropped);
 * [watch] installs a directory watcher firing [onEvent] on any append/creation and returns an
 * idempotent unwatch. [LiveLogTailFs] is the java.nio + polling-ticker default; a scripted fake
 * drives the tests. Strictly READ-ONLY — no method writes to disk (k5).
 */
interface LogTailFs {
    fun listSegments(dir: Path, stem: String): List<Path>
    fun readLines(file: Path): List<String>
    fun watch(dir: Path, onEvent: () -> Unit): AutoCloseable
}

/** Max lines the initial tail delivers (mirrors the CLI TAIL_MAX_LINES). */
const val TAIL_MAX_LINES: Int = 500

/** The interval of the [LiveLogTailFs] polling ticker. */
private const val POLL_INTERVAL_MS: Long = 1000L

/**
 * The default insrc log directory — `/tmp/.insrc` (mirrors the CLI PATHS.logDir at
 * src/shared/paths.ts). NOTE: the logs live under /tmp/.insrc, a DISTINCT root from the
 * `~/.insrc` daemon-root the [OrphanProcessSeam] uses — do NOT reuse that constant here.
 */
fun defaultLogDir(): Path = Paths.get("/tmp", ".insrc")

/**
 * The live [LogTailFs] (Story S006): java.nio directory listing + line reads, and a FIXED-INTERVAL
 * POLLING TICKER as the "watcher" — a single scheduled task (~1s) fires [onEvent], and the
 * [LogTailSeam]'s own seen-diff makes the follow append-only. Polling has one code path on every OS
 * (the JDK WatchService degrades to polling on macOS anyway) and satisfies never-throws trivially: a
 * failed list/read is simply a skipped tick. Every method swallows its own IO errors.
 */
object LiveLogTailFs : LogTailFs {

    override fun listSegments(dir: Path, stem: String): List<Path> {
        val re = Regex("^" + Regex.escape(stem) + "\\.(\\d+)\\.log$")
        return try {
            if (!Files.isDirectory(dir)) return emptyList()
            Files.list(dir).use { stream ->
                stream.toList()
                    .mapNotNull { p ->
                        val m = re.matchEntire(p.fileName.toString()) ?: return@mapNotNull null
                        val n = m.groupValues[1].toIntOrNull() ?: return@mapNotNull null
                        p to n
                    }
                    .sortedBy { it.second }
                    .map { it.first }
            }
        } catch (e: Exception) {
            emptyList()
        }
    }

    override fun readLines(file: Path): List<String> = Files.readAllLines(file)

    override fun watch(dir: Path, onEvent: () -> Unit): AutoCloseable {
        val future = AppExecutorUtil.getAppScheduledExecutorService().scheduleWithFixedDelay(
            { try { onEvent() } catch (e: Throwable) { /* skipped tick — never propagate */ } },
            POLL_INTERVAL_MS, POLL_INTERVAL_MS, TimeUnit.MILLISECONDS,
        )
        return AutoCloseable { future.cancel(false) }
    }
}

/**
 * The rotation-aware log tail (Story S006), mirroring the CLI tailLogWith over an injectable
 * [LogTailFs]. [tail] resolves the ACTIVE segment as the highest-N `<stem>.<N>.log`, emits the last
 * [maxLines] lines initially, then on each fs event emits ONLY newly-appended (parsed) lines
 * (tracks `seen`); a truncated file (< seen) re-tails from 0; a new/higher-N segment resets seen.
 * NEVER throws — a missing dir / read error / un-installable watcher degrades to an empty initial
 * emit + a quiet retry on the next tick. Read-only: only lists/reads/watches under [logDir] (k5).
 * The returned [AutoCloseable] is idempotent and a `disposed` guard suppresses any post-dispose emit.
 */
class LogTailSeam(
    private val fs: LogTailFs = LiveLogTailFs,
    private val logDir: Path = defaultLogDir(),
    private val maxLines: Int = TAIL_MAX_LINES,
) {

    fun tail(category: LogCategory, onLines: (List<LogLine>) -> Unit): AutoCloseable {
        // Set on the caller's dispose thread, read on the watcher/ticker thread — atomic so the
        // seam is correct even when used standalone (not only behind LogEditorSurface's guards).
        val disposed = java.util.concurrent.atomic.AtomicBoolean(false)
        var activeFile: Path? = null
        var seen = 0

        fun resolveActive(): Path? =
            try {
                fs.listSegments(logDir, category.stem).lastOrNull()
            } catch (e: Exception) {
                null
            }

        fun emit(initial: Boolean) {
            if (disposed.get()) return
            val active = resolveActive()
            if (active == null) {
                if (initial) onLines(emptyList())     // loaded-but-empty; a later tick retries
                return
            }
            if (active != activeFile) { activeFile = active; seen = 0 }  // new/rotated segment
            val lines = try { fs.readLines(active) } catch (e: Exception) { return }  // transient read error
            if (lines.size < seen) seen = 0                                            // truncated -> re-tail
            if (seen == 0 && lines.size > maxLines) seen = lines.size - maxLines       // initial: last-N only
            val fresh = lines.drop(seen)
            seen = lines.size
            if (initial || fresh.isNotEmpty()) onLines(fresh.map(::parseLogLine))
        }

        emit(true)
        var unwatch: AutoCloseable = AutoCloseable { }
        try {
            unwatch = fs.watch(logDir) { if (!disposed.get()) emit(false) }
        } catch (e: Exception) {
            // no watcher installable — the initial emit still delivered; live follow degrades quietly
        }

        return AutoCloseable {
            if (disposed.getAndSet(true)) return@AutoCloseable
            try { unwatch.close() } catch (e: Exception) { /* ignore */ }
        }
    }
}
