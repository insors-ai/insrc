package ai.insors.insrc.jetbrains.host

import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Test

/**
 * sc3 detection unit tests (Story S002 / t3) — platform-free. They drive the
 * pure [HostDetector] aggregation with STUB [HostProbe]s (the plan's "stub
 * host-presence inputs") so the fail-safe rules are asserted without the
 * IntelliJ plugin registry or a real host: only Present hosts are returned;
 * Absent (not installed / disabled) is excluded; Unrecognised or a throwing
 * probe is a fail-safe skip; neither present -> empty, never a throw.
 */
class DetectPresentTest {

    private fun host(kind: AiHostKind) =
        AiHost(kind, "/cfg/${kind.name}/mcp.json", "/cfg/${kind.name}/rules.md")

    @Test
    fun includesInstalledEnabledHostsWithResolvedPaths_excludesDisabledAndAbsent() {
        val present = host(AiHostKind.AI_ASSISTANT)
        val detector = HostDetector(
            listOf(
                HostProbe { HostResolution.Present(present) },   // installed + enabled
                HostProbe { HostResolution.Absent },             // disabled or not installed
            ),
        )
        val result = detector.detectPresent()
        assertEquals(listOf(present), result)
        // resolved paths are carried through, absolute
        assertTrue(result.single().mcpConfigPath.startsWith("/"))
        assertTrue(result.single().rulesFilePath.startsWith("/"))
    }

    @Test
    fun unrecognisedHostFormat_failSafeSkip_omittedAndLogged_neverReachesWriter() {
        val present = host(AiHostKind.JUNIE)
        val detector = HostDetector(
            listOf(
                HostProbe { HostResolution.Present(present) },
                HostProbe { HostResolution.Unrecognised("unknown mcp shape") }, // fail-safe skip
                HostProbe { throw IllegalStateException("probe blew up") },      // throwing -> also skipped
            ),
        )
        val result = detector.detectPresent()
        // only the recognised, present host survives — the unrecognised/throwing ones are omitted
        assertEquals(listOf(present), result)
    }

    @Test
    fun neitherHostPresent_returnsEmpty_noThrow() {
        val detector = HostDetector(
            listOf(
                HostProbe { HostResolution.Absent },
                HostProbe { HostResolution.Absent },
            ),
        )
        assertEquals(emptyList<AiHost>(), detector.detectPresent())

        // no probes at all -> still empty, no throw
        assertEquals(emptyList<AiHost>(), HostDetector(emptyList()).detectPresent())
    }
}
