package ai.insors.insrc.jetbrains.lifecycle

import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertFalse
import org.junit.jupiter.api.Assertions.assertNotNull
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Test
import java.io.File
import java.io.IOException
import java.nio.file.Files
import java.nio.file.Path

/**
 * sc-internal DaemonProvisioner unit tests (Story S003 / t6) — platform-free.
 * They drive ScriptDaemonProvisioner over a fake SubprocessRunner (records the
 * spec, returns a chosen exit / throws) and a fake locator (temp script files or
 * null), asserting target selection (INSTALL vs daemon-ctl update), Node-on-PATH,
 * exit-code mapping, and the missing-script / spawn-failure captured (not thrown).
 */
class DaemonProvisionerTest {

    private val node = NodeRuntime("/home/dev/.insrc/node/node-v20.18.0-darwin-arm64/bin/node", NodeSource.PROVISIONED)

    private class RecordingRunner(private val behaviour: () -> Int) : SubprocessRunner {
        var last: Subprocess? = null
        override fun run(spec: Subprocess): Int {
            last = spec
            return behaviour()
        }
    }

    private fun tempScript(name: String): Path {
        val dir = Files.createTempDirectory("insrc-scripts")
        val p = dir.resolve(name)
        Files.writeString(p, "#!/usr/bin/env bash\n")
        return p
    }

    private fun locatorFor(install: Path?, update: Path?): DaemonScriptLocator = DaemonScriptLocator { kind ->
        when (kind) {
            ProvisionKind.INSTALL -> install
            ProvisionKind.UPDATE -> update
        }
    }

    @Test
    fun INSTALL_spawnsInstallScript_UPDATE_spawnsDaemonCtlUpdate_withNodeOnPath() {
        val install = tempScript("insrc-daemon-install.sh")
        val update = tempScript("daemon-ctl.sh")
        val runner = RecordingRunner { 0 }
        val provisioner = ScriptDaemonProvisioner(runner, locatorFor(install, update), baseEnv = mapOf("PATH" to "/usr/bin"))

        provisioner.run(ProvisionKind.INSTALL, node)
        val installSpec = runner.last!!
        assertEquals(listOf("bash", install.toString()), installSpec.command) // install script, no extra arg
        assertTrue(installSpec.env["PATH"]!!.startsWith(File(node.executablePath).parent + File.pathSeparator))

        provisioner.run(ProvisionKind.UPDATE, node)
        val updateSpec = runner.last!!
        assertEquals(listOf("bash", update.toString(), "update"), updateSpec.command) // daemon-ctl.sh update
        assertTrue(updateSpec.env["PATH"]!!.startsWith(File(node.executablePath).parent + File.pathSeparator))
    }

    @Test
    fun exitCodeMapping_andFailuresCapturedNotThrown() {
        val install = tempScript("insrc-daemon-install.sh")
        fun outcomeForExit(code: Int) =
            ScriptDaemonProvisioner(RecordingRunner { code }, locatorFor(install, null)).run(ProvisionKind.INSTALL, node)

        assertTrue(outcomeForExit(0).ok)
        assertEquals(0, outcomeForExit(0).exitCode)

        val two = outcomeForExit(2)
        assertFalse(two.ok); assertEquals(2, two.exitCode); assertTrue(two.reason!!.contains("prerequisite"))
        val three = outcomeForExit(3)
        assertFalse(three.ok); assertTrue(three.reason!!.contains("source"))
        val four = outcomeForExit(4)
        assertFalse(four.ok); assertTrue(four.reason!!.contains("build"))

        // spawn failure -> captured, not thrown
        val spawnFail = ScriptDaemonProvisioner(SubprocessRunner { throw IOException("no bash") }, locatorFor(install, null))
            .run(ProvisionKind.INSTALL, node)
        assertFalse(spawnFail.ok)
        assertNotNull(spawnFail.reason)

        // missing script -> captured, not thrown, and the runner is never called
        val neverRunner = RecordingRunner { throw AssertionError("runner must not be called when script is missing") }
        val missing = ScriptDaemonProvisioner(neverRunner, locatorFor(install = null, update = null))
            .run(ProvisionKind.INSTALL, node)
        assertFalse(missing.ok)
        assertEquals(null, neverRunner.last)
    }
}
