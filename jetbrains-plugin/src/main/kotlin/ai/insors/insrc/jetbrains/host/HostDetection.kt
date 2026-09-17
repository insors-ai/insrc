package ai.insors.insrc.jetbrains.host

import com.intellij.openapi.diagnostic.logger

/**
 * The outcome of probing ONE AI host (Story S002 / t3).
 *
 * A closed set so the detector can treat every case explicitly:
 *  - [Present]      — installed, enabled, and its config shape recognised, with
 *                     both file paths resolved;
 *  - [Absent]       — not installed, or installed but disabled;
 *  - [Unrecognised] — installed but its config file shape/version cannot be
 *                     safely recognised (the external `c8` dimension) — a
 *                     fail-safe skip so no unrecognised file ever reaches the writer.
 */
sealed interface HostResolution {
    data class Present(val host: AiHost) : HostResolution
    data object Absent : HostResolution
    data class Unrecognised(val reason: String) : HostResolution
}

/**
 * Resolves a single AI host: is it installed+enabled, is its config shape one we
 * recognise, and where are its files (Story S002 / t3)? This is the one external
 * (`c8`) seam — a real implementation touches the IntelliJ plugin registry and
 * host config layout; the [HostDetector] treats every probe fail-safe so a probe
 * may return [HostResolution.Unrecognised] or throw without breaking detection.
 */
fun interface HostProbe {
    fun resolve(): HostResolution
}

/**
 * The pure detection core (Story S002 / t3): run each per-host [HostProbe]
 * fail-safe and return only the hosts that resolved [HostResolution.Present].
 *
 * Never throws — a probe that throws or reports [HostResolution.Unrecognised] is
 * logged and omitted, so `detectPresent` yields only installed+enabled hosts
 * with recognised, anchored file paths. Neither host present -> empty list.
 */
class HostDetector(private val probes: List<HostProbe>) {
    private val log = logger<HostDetector>()

    fun detectPresent(): List<AiHost> =
        probes.mapNotNull { probe ->
            val resolution = runCatching { probe.resolve() }
                .getOrElse { HostResolution.Unrecognised("probe threw: ${it.message}") }
            when (resolution) {
                is HostResolution.Present -> resolution.host
                is HostResolution.Absent -> null
                is HostResolution.Unrecognised -> {
                    // Fail-safe skip: never surface a partial/broken host, never
                    // hand an unrecognised file to the writer.
                    log.warn("insrc: skipping AI host with unrecognised config: ${resolution.reason}")
                    null
                }
            }
        }
}
