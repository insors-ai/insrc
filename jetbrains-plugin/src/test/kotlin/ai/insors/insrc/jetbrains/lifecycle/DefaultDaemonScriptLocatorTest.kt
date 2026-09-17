package ai.insors.insrc.jetbrains.lifecycle

import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertNotNull
import org.junit.jupiter.api.Assertions.assertNull
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Test
import java.io.ByteArrayInputStream
import java.nio.file.Files

/**
 * sc-internal script-locator unit tests (Story S003 / t7) — platform-free. They
 * verify INSTALL extracts the plugin-bundled bootstrap installer to a runnable
 * temp file (so a fresh machine can install), that a missing bundle fail-safes to
 * null, and that UPDATE resolves daemon-ctl.sh under the daemon home.
 */
class DefaultDaemonScriptLocatorTest {

    @Test
    fun install_extractsBundledInstaller_toARunnableFile() {
        val body = "#!/usr/bin/env bash\necho install\n"
        val locator = DefaultDaemonScriptLocator(
            homeDir = Files.createTempDirectory("insrc-home"),
            bundledInstaller = { ByteArrayInputStream(body.toByteArray()) },
        )
        val script = locator.scriptFor(ProvisionKind.INSTALL)
        assertNotNull(script)
        assertTrue(Files.exists(script!!))
        assertEquals(body, Files.readString(script))
    }

    @Test
    fun install_missingBundle_returnsNull() {
        val locator = DefaultDaemonScriptLocator(
            homeDir = Files.createTempDirectory("insrc-home"),
            bundledInstaller = { null },
        )
        assertNull(locator.scriptFor(ProvisionKind.INSTALL))
    }

    @Test
    fun update_resolvesDaemonCtlUnderDaemonHome_orNullWhenAbsent() {
        val home = Files.createTempDirectory("insrc-home")
        val locator = DefaultDaemonScriptLocator(homeDir = home, bundledInstaller = { null })
        // absent until the daemon is installed
        assertNull(locator.scriptFor(ProvisionKind.UPDATE))

        val scriptsDir = home.resolve(".insrc").resolve("daemon").resolve("scripts")
        Files.createDirectories(scriptsDir)
        val ctl = scriptsDir.resolve("daemon-ctl.sh")
        Files.writeString(ctl, "#!/usr/bin/env bash\n")
        assertEquals(ctl, locator.scriptFor(ProvisionKind.UPDATE))
    }
}
