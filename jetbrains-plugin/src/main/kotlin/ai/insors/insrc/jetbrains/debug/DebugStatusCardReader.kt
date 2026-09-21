package ai.insors.insrc.jetbrains.debug

import ai.insors.insrc.jetbrains.daemon.DaemonSocket
import ai.insors.insrc.jetbrains.daemon.DaemonStatusResult
import ai.insors.insrc.jetbrains.daemon.DaemonGatewayService
import com.intellij.openapi.components.service
import java.nio.file.Files
import java.nio.file.Path

/**
 * The read-only Debug Status-section view model (Story E2026092157298940:S004). When
 * [reachable], [running]/[uptimeSec]/[repoCount] come from the sc2 daemonStatus() Loaded
 * snapshot; [socket] is always the known constant; [pid]/[version] are best-effort local
 * derives that may be null. A stopped/unavailable daemon yields a not-reachable card
 * carrying [notReachableReason]. Mirrors the CLI DaemonCardModel.
 */
data class DebugStatusCardModel(
    val reachable: Boolean,
    val running: Boolean?,
    val uptimeSec: Long?,
    val repoCount: Int?,
    val socket: String,
    val pid: Long?,
    val version: String?,
    val notReachableReason: String?,
)

/**
 * Assembles the [DebugStatusCardModel] (ac1). It consumes the shipped sc2
 * daemonStatus():DaemonStatusResult UNCHANGED and folds in the locally-derived socket
 * (the DaemonSocket constant), pid (`~/.insrc/daemon.pid`) and version
 * (`<DAEMON_ROOT>/package.json`) — exactly the CLI buildDaemonCard local-derive — since the
 * sc2 DTO carries none of those. Strictly read-only (no daemon mutation, no process signal,
 * k3); never throws (daemonStatus() never throws; a missing pidfile/package.json degrades to
 * null). Every provider is injectable so the fold is unit-testable off the platform.
 */
class DebugStatusCardReader(
    private val status: () -> DaemonStatusResult = { service<DaemonGatewayService>().daemonStatus() },
    private val socketPath: () -> String = { DaemonSocket.defaultPath().toString() },
    private val pid: () -> Long? = { OrphanProcessSeam.pidFromDaemonPidFile() },
    private val version: () -> String? = { daemonPackageVersion() },
) {

    fun read(): DebugStatusCardModel {
        val socket = socketPath()
        val localPid = try { pid() } catch (e: Exception) { null }
        val localVersion = try { version() } catch (e: Exception) { null }
        return when (val s = status()) {
            is DaemonStatusResult.Loaded -> DebugStatusCardModel(
                reachable = true,
                running = s.status.running,
                uptimeSec = s.status.uptimeSec,
                repoCount = s.status.repoCount,
                socket = socket,
                pid = localPid,
                version = localVersion,
                notReachableReason = null,
            )
            DaemonStatusResult.Stopped -> notReachable(socket, localPid, localVersion, "stopped")
            is DaemonStatusResult.Unavailable -> notReachable(socket, localPid, localVersion, s.reason)
        }
    }

    private fun notReachable(socket: String, pid: Long?, version: String?, reason: String) =
        DebugStatusCardModel(
            reachable = false, running = null, uptimeSec = null, repoCount = null,
            socket = socket, pid = pid, version = version, notReachableReason = reason,
        )

    companion object {
        /** Best-effort installed-daemon version from `<DAEMON_ROOT>/package.json` (mirrors debug.ts readVersion). */
        fun daemonPackageVersion(): String? {
            val pkg: Path = OrphanProcessSeam.defaultDaemonRoot().resolve("package.json")
            return try {
                if (!Files.isRegularFile(pkg)) return null
                val obj = com.google.gson.JsonParser.parseString(Files.readString(pkg))
                obj.takeIf { it.isJsonObject }?.asJsonObject?.get("version")
                    ?.takeIf { it.isJsonPrimitive && it.asJsonPrimitive.isString }?.asString
            } catch (e: Exception) {
                null
            }
        }
    }
}
