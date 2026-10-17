package ai.insors.insrc.jetbrains.daemon

import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Test
import java.io.File

/**
 * Story s3 / t9 — DaemonGatewayService forwards the two new methods to its delegate,
 * and every DaemonGateway implementation in the test tree implements them (so the
 * interface change compiles everywhere). The service builds its delegate over a real
 * unix socket, so — like the other wiring guards — this scans the source.
 */
class DaemonGatewayServiceTest {

    private fun read(path: String): String {
        val f = File(path)
        assertTrue(f.exists(), "expected source at $path (test cwd=${File("").absolutePath})")
        return f.readText()
    }

    @Test
    fun `the service forwards readRepoSettings and writeRepoSetting to its delegate`() {
        val svc = read("src/main/kotlin/ai/insors/insrc/jetbrains/daemon/DaemonGatewayService.kt")
        assertTrue(svc.contains("override fun readRepoSettings(repoPath: String): RepoSettingsResult = delegate.readRepoSettings(repoPath)"))
        assertTrue(Regex("override fun writeRepoSetting\\(repoPath: String, key: String, value: Any\\?\\): SaveResult =\\s*delegate\\.writeRepoSetting\\(repoPath, key, value\\)").containsMatchIn(svc))
    }

    @Test
    fun `the gateway declares both methods and calls repo_settings_get and repo_settings_set, not config_write`() {
        val gw = read("src/main/kotlin/ai/insors/insrc/jetbrains/daemon/DaemonGateway.kt")
        assertTrue(gw.contains("fun readRepoSettings(repoPath: String): RepoSettingsResult"))
        assertTrue(gw.contains("fun writeRepoSetting(repoPath: String, key: String, value: Any?): SaveResult"))
        assertTrue(gw.contains("METHOD_REPO_SETTINGS_GET = \"repo.settings.get\""))
        assertTrue(gw.contains("METHOD_REPO_SETTINGS_SET = \"repo.settings.set\""))
        val write = gw.substringAfter("override fun writeRepoSetting").substringBefore("override fun writeSetting")
        assertTrue(write.contains("METHOD_REPO_SETTINGS_SET") && !write.contains("METHOD_CONFIG_WRITE"), "tracker writes do not use config.write")
    }

    @Test
    fun `the four DaemonGateway test doubles implement both new methods`() {
        val doubles = listOf(
            "src/test/kotlin/ai/insors/insrc/jetbrains/onboarding/OnboardingWiringTest.kt",
            "src/test/kotlin/ai/insors/insrc/jetbrains/onboarding/OnboardingLifecycleTest.kt",
            "src/test/kotlin/ai/insors/insrc/jetbrains/onboarding/OnboardingCleanupIntegrationTest.kt",
            "src/test/kotlin/ai/insors/insrc/jetbrains/lifecycle/DaemonLifecycleServiceTest.kt",
        )
        for (path in doubles) {
            val text = read(path)
            assertTrue(text.contains("override fun readRepoSettings("), "$path implements readRepoSettings")
            assertTrue(text.contains("override fun writeRepoSetting("), "$path implements writeRepoSetting")
        }
        // Every file in the tree that declares a full DaemonGateway has them: a new double added later fails here.
        val all = File("src/test/kotlin").walkTopDown().filter { it.isFile && it.extension == "kt" }.toList()
        for (f in all) {
            val text = f.readText()
            if (Regex(":\\s*DaemonGateway\\s*\\{").containsMatchIn(text)) {
                assertTrue(text.contains("override fun readRepoSettings(") && text.contains("override fun writeRepoSetting("), "${f.path} implements DaemonGateway without the new methods")
            }
        }
    }
}
