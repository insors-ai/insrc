package ai.insors.insrc.jetbrains.lifecycle

import com.google.gson.JsonParser
import org.junit.jupiter.api.Assertions.*
import org.junit.jupiter.api.Test
import java.nio.file.Files
import java.nio.file.Path

class SourceBootstrapIntegrationTest {
    @Test
    fun sourceAdapterRetainsCurrentOwnerAndMcpWrapperAfterRollback() {
        val home = Files.createTempDirectory("insrc-ide-source-adapter").toRealPath()
        try {
            val state = home.resolve(".insrc/source-lifecycle/journal.json")
            Files.createDirectories(state.parent)
            Files.writeString(state, "opaque to the JVM")
            val prior = home.resolve("qualified-prior")
            val manager = home.resolve("current-owner")
            val ctl = manager.resolve("scripts/daemon-ctl.sh")
            Files.createDirectories(ctl.parent)
            Files.writeString(ctl, "exit 0")
            val reply = home.resolve("route.sh")
            Files.writeString(reply, """#!/bin/bash
                test "${'$'}1" = --print-source-route || exit 91
                test "${'$'}2" = --target || exit 92
                printf '%s\n' '{"launchRoot":"$prior","controlRoot":"$manager"}'
            """.trimIndent())
            val locator = DefaultDaemonScriptLocator(homeDir = home, macOS = false, daemonRootOverride = null,
                bundledInstaller = { Files.newInputStream(reply) })
            assertEquals(prior, locator.selectedReleaseRoot())
            assertEquals(manager, locator.mcpReleaseRoot())
            assertEquals(ctl, locator.controlScript())
            var child: Subprocess? = null
            val result = DaemonLifecycleCommandRunner(SubprocessRunner { child = it; 0 }, locator, { null },
                mapOf("INSRC_DAEMON_ROOT" to home.resolve("old-logical-root").toString()))
                .run(ai.insors.insrc.jetbrains.daemon.LifecycleCommand.RESTART)
            assertTrue(result is ai.insors.insrc.jetbrains.daemon.DaemonActionResult.Ok)
            assertEquals(manager.toString(), child!!.env["INSRC_DAEMON_ROOT"])
            assertTrue(child!!.command.contains("--skip-install"))
            Files.writeString(reply, "printf '{malformed'")
            assertThrows(Exception::class.java) { locator.mcpReleaseRoot() }
            assertThrows(Exception::class.java) { locator.controlScript() }
        } finally { home.toFile().deleteRecursively() }
    }

    @Test
    fun provisionerReconstructsNativeEnvironmentAndUsesPackagedVerifier() {
        val home = Path.of(System.getenv("INSRC_IDE_TEST_HOME"))
        val installer = Path.of(System.getenv("INSRC_IDE_TEST_INSTALLER"))
        val probe = Path.of(System.getenv("INSRC_IDE_TEST_PROBE"))
        val parent = System.getenv() + mapOf("HOME" to home.toString(), "PATH" to "/usr/bin:/bin",
            "NODE_OPTIONS" to "--invalid-injection", "NODE_PATH" to "/external", "CXXFLAGS" to "-DKEEP=1")
        val locator = DefaultDaemonScriptLocator(homeDir = home, bundledInstaller = { Files.newInputStream(installer) }, daemonRootOverride = null)
        val packaged = locator.scriptFor(ProvisionKind.UPDATE)!!
        val bytes = Files.readString(packaged)
        assertTrue(Regex("(?m)^INSRC_RELEASE_BOOTSTRAP_B64='[A-Za-z0-9+/=]+'$").containsMatchIn(bytes))
        assertTrue(bytes.contains("--print-source-route"))
        val node = DefaultPrivateNodeProvisioner(homeDir = home, installer = { packaged }, baseEnv = parent).ensurePrivateNode()
        // The first child has exited. A separate real provisioner child must carry
        // Node/npm/native policy without inheriting any exports from that child.
        for (cuda in listOf<String?>(null, "", "v12")) {
            var observed: NodeBootstrapResult? = null
            val runner = object : SubprocessRunner {
                override fun run(spec: Subprocess): Int = runCaptured(spec).exitCode
                override fun runCaptured(spec: Subprocess): NodeBootstrapResult =
                    ScriptDaemonProvisioner.ProcessBuilderRunner().runCaptured(spec).also { observed = it }
            }
            val env = parent.filterKeys { it != "ONNXRUNTIME_NODE_INSTALL_CUDA" } +
                (cuda?.let { mapOf("ONNXRUNTIME_NODE_INSTALL_CUDA" to it) } ?: emptyMap())
            val result = ScriptDaemonProvisioner(runner, DaemonScriptLocator { probe }, env).run(ProvisionKind.UPDATE, node)
            assertTrue(result.ok, result.reason)
            val value = JsonParser.parseString(observed!!.output).asJsonObject
            assertEquals(node.executablePath, value.get("exe").asString)
            assertEquals("22.22.1", value.get("version").asString)
            assertEquals("10.9.4", value.get("npm").asString)
            assertEquals(cuda ?: "skip", value.get("cuda").asString)
            assertEquals("1", value.get("python").asString)
            assertEquals("22.22.1", value.get("target").asString)
            assertEquals("node", value.get("runtime").asString)
            assertEquals("-DKEEP=1", value.get("cxx").asString)
            assertTrue(value.get("options").isJsonNull)
            assertTrue(value.get("nodePath").isJsonNull)
        }
        assertEquals(home.resolve(".insrc/daemon"), locator.targetRoot())
        assertNotEquals(home.resolve(".insrc/daemon/scripts/daemon-ctl.sh"), packaged)
    }
}
