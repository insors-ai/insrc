package ai.insors.insrc.jetbrains.host

import org.junit.jupiter.api.Assertions.assertFalse
import org.junit.jupiter.api.Assertions.assertNotNull
import org.junit.jupiter.api.Assertions.assertNull
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Test

/**
 * sc3 registration-composition unit tests (Story S002 / t4) — platform-free.
 * They assert the composed InsrcMcpRegistration block honours k1 (no cloud
 * endpoint — spawns only the stdio insrc-mcp) and k3/ac2 (the active project's
 * root is an explicit per-project repo argument, not a baked INSRC_REPO env
 * default), and that a missing launch target is a fail-safe skip.
 */
class RegistrationCompositionTest {

    private val LAUNCH = "/home/dev/.insrc/daemon/out/bin/insrc-mcp.js"

    @Test
    fun launchCommandReferencesOnlyStdioInsrcMcp_noCloudEndpoint() {
        val block = InsrcMcpRegistration.compose("/home/dev/project-a", LAUNCH)
        assertNotNull(block)
        val body = block!!.body
        // launches the existing stdio insrc-mcp via node
        assertTrue(body.contains("\"command\": \"node\""))
        assertTrue(body.contains(LAUNCH))
        // NO cloud/REST endpoint anywhere in the registration (k1, ac4)
        assertFalse(body.contains("http://"))
        assertFalse(body.contains("https://"))
        assertFalse(body.contains("\"url\""))
        // marker-delimited so it can be written replace-only
        assertTrue(block.beginMarker == InsrcMcpRegistration.MCP_BEGIN)
        assertTrue(block.endMarker == InsrcMcpRegistration.MCP_END)
    }

    @Test
    fun attachesActiveProjectRootAsExplicitRepoArg_twoRootsScopeIndependently() {
        val a = InsrcMcpRegistration.compose("/home/dev/project-a", LAUNCH)!!.body
        val b = InsrcMcpRegistration.compose("/home/dev/project-b", LAUNCH)!!.body

        // each registration carries ITS OWN project root as an explicit --repo argument
        assertTrue(a.contains("\"--repo\""))
        assertTrue(a.contains("/home/dev/project-a"))
        assertFalse(a.contains("/home/dev/project-b"))

        assertTrue(b.contains("\"--repo\""))
        assertTrue(b.contains("/home/dev/project-b"))
        assertFalse(b.contains("/home/dev/project-a"))

        // repo is an EXPLICIT per-call argument, never a baked shared INSRC_REPO env
        // default (the rejected a2 shape) — this is what keeps a shared MCP process
        // scoped per window (k3, ac2).
        assertFalse(a.contains("INSRC_REPO"))
        assertFalse(b.contains("INSRC_REPO"))
    }

    @Test
    fun missingLaunchTarget_skipsComposition_logged() {
        // no registration is composed when the insrc-mcp launch target is absent
        assertNull(InsrcMcpRegistration.compose("/home/dev/project-a", null))
    }
}
