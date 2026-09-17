package ai.insors.insrc.jetbrains.host

import com.google.gson.JsonParser
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertFalse
import org.junit.jupiter.api.Assertions.assertNotNull
import org.junit.jupiter.api.Assertions.assertNull
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Test

/**
 * sc3 registration-composition unit tests (Story S002 / t4) — platform-free.
 * They parse the composed server entry as JSON (not substring-match it) and
 * assert it honours k1 (no cloud endpoint — spawns only the stdio insrc-mcp) and
 * k3/ac2 (the active project's root is the server `cwd`, so resolve-repo's
 * session-cwd match scopes to this project — NOT a baked INSRC_REPO env default,
 * NOT an inert --repo argv), and that a missing launch target is a fail-safe skip.
 */
class RegistrationCompositionTest {

    private val LAUNCH = "/home/dev/.insrc/daemon/out/bin/insrc-mcp.js"

    private fun entryObject(projectRoot: String) =
        JsonParser.parseString(InsrcMcpRegistration.composeServerEntry(projectRoot, LAUNCH)!!).asJsonObject

    @Test
    fun composedEntryIsValidJson_launchesOnlyStdioInsrcMcp_noCloudEndpoint() {
        val json = InsrcMcpRegistration.composeServerEntry("/home/dev/project-a", LAUNCH)
        assertNotNull(json)
        // must be VALID JSON (this is what the host actually parses) — parse, don't substring
        val entry = JsonParser.parseString(json).asJsonObject
        assertEquals("node", entry.get("command").asString)
        val args = entry.getAsJsonArray("args")
        assertEquals(1, args.size())
        assertEquals(LAUNCH, args.get(0).asString)
        // NO cloud/REST endpoint anywhere (k1, ac4)
        assertFalse(json!!.contains("http://"))
        assertFalse(json.contains("https://"))
        assertFalse(entry.has("url"))
    }

    @Test
    fun scopesToActiveProjectViaCwd_twoRootsScopeIndependently_notInsrcRepoEnv_notRepoArgv() {
        val a = entryObject("/home/dev/project-a")
        val b = entryObject("/home/dev/project-b")

        // each entry is scoped to ITS OWN project via cwd (resolve-repo session-cwd match)
        assertEquals("/home/dev/project-a", a.get("cwd").asString)
        assertEquals("/home/dev/project-b", b.get("cwd").asString)

        // scoping is NOT a baked INSRC_REPO env default (the rejected a2 shape)
        assertFalse(a.has("env"), "must not bake a shared INSRC_REPO env default")
        // and NOT an inert --repo argv (insrc-mcp does not parse process args)
        val args = a.getAsJsonArray("args").map { it.asString }
        assertFalse(args.contains("--repo"), "must not rely on a non-existent --repo flag")
    }

    @Test
    fun missingLaunchTarget_skipsComposition_logged() {
        // no entry is composed when the insrc-mcp launch target is absent
        assertNull(InsrcMcpRegistration.composeServerEntry("/home/dev/project-a", null))
    }
}
