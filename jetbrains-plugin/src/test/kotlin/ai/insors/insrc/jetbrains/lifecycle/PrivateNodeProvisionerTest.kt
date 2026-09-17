package ai.insors.insrc.jetbrains.lifecycle

import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertFalse
import org.junit.jupiter.api.Assertions.assertThrows
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Test
import java.io.IOException
import java.nio.file.Files
import java.nio.file.Path

/**
 * sc-internal private-Node provisioner unit tests (Story S003 / t5) — platform-free.
 * They drive DefaultPrivateNodeProvisioner over a temp home dir with injected
 * fake downloader/extractor seams (no real network), asserting idempotent reuse,
 * the download+extract+verify happy path, fail-safe on failure, and that the
 * download URL targets only the Node CDN (no cloud/LLM endpoint, k1).
 */
class PrivateNodeProvisionerTest {

    private val platform = NodePlatform("darwin", "arm64")
    private val version = "v20.18.0"

    private class RecordingDownloader(private val body: (String, Path) -> Unit) : NodeArchiveDownloader {
        var invoked = 0
        override fun download(url: String, dest: Path) {
            invoked++
            body(url, dest)
        }
    }

    private fun exeFor(home: Path): Path =
        platform.executablePath(home.resolve(".insrc").resolve("node"), version)

    @Test
    fun alreadyPresent_reusedNoReDownload() {
        val home = Files.createTempDirectory("insrc-home")
        val exe = exeFor(home)
        Files.createDirectories(exe.parent)
        Files.createFile(exe) // a prior provisioning

        val downloader = RecordingDownloader { _, _ -> throw AssertionError("must not download when already present") }
        val provisioner = DefaultPrivateNodeProvisioner(
            homeDir = home, platform = platform, nodeVersion = version,
            downloader = downloader, extractor = { _, _ -> throw AssertionError("must not extract when present") },
        )

        val rt = provisioner.ensurePrivateNode()
        assertEquals(NodeSource.PROVISIONED, rt.source)
        assertEquals(exe.toString(), rt.executablePath)
        assertEquals(0, downloader.invoked, "an already-provisioned Node must be reused with no re-download")
    }

    @Test
    fun absent_downloadVerifyExtract_returnsExecutable() {
        val home = Files.createTempDirectory("insrc-home")
        val exe = exeFor(home)
        val downloader = RecordingDownloader { _, dest -> Files.writeString(dest, "archive-bytes") }
        // the fake extractor materialises the expected executable, standing in for a real tar
        val extractor = NodeArchiveExtractor { _, _ ->
            Files.createDirectories(exe.parent)
            Files.createFile(exe)
        }
        val provisioner = DefaultPrivateNodeProvisioner(
            homeDir = home, platform = platform, nodeVersion = version,
            downloader = downloader, extractor = extractor,
        )

        val rt = provisioner.ensurePrivateNode()
        assertEquals(NodeSource.PROVISIONED, rt.source)
        assertEquals(exe.toString(), rt.executablePath)
        assertTrue(Files.exists(Path.of(rt.executablePath)))
        assertEquals(1, downloader.invoked)
    }

    @Test
    fun fetchOrVerifyFailure_throwsNodeProvisioningException_noPartialRuntime() {
        val home = Files.createTempDirectory("insrc-home")

        // download failure -> wrapped as NodeProvisioningException, no exe left
        val failing = DefaultPrivateNodeProvisioner(
            homeDir = home, platform = platform, nodeVersion = version,
            downloader = { _, _ -> throw IOException("offline") },
            extractor = { _, _ -> throw AssertionError("extractor must not run after a failed download") },
        )
        assertThrows(NodeProvisioningException::class.java) { failing.ensurePrivateNode() }
        assertFalse(Files.exists(exeFor(home)))

        // extraction succeeds but the expected executable is missing -> verify fails
        val home2 = Files.createTempDirectory("insrc-home")
        val missingExe = DefaultPrivateNodeProvisioner(
            homeDir = home2, platform = platform, nodeVersion = version,
            downloader = { _, dest -> Files.writeString(dest, "x") },
            extractor = { _, _ -> /* extracts nothing useful */ },
        )
        assertThrows(NodeProvisioningException::class.java) { missingExe.ensurePrivateNode() }
    }

    @Test
    fun targetUrlIsNodeBinaryOnly_noCloudEndpoint() {
        val url = platform.downloadUrl(version)
        assertTrue(url.startsWith("https://nodejs.org/dist/"), "must fetch only from the official Node CDN")
        assertTrue(url.endsWith("node-v20.18.0-darwin-arm64.tar.gz"))
        // no cloud/LLM endpoints
        assertFalse(url.contains("anthropic"))
        assertFalse(url.contains("openai"))
        assertFalse(url.contains("api."))
    }

    @Test
    fun unsupportedPlatform_throwsNodeProvisioningException() {
        val home = Files.createTempDirectory("insrc-home")
        val provisioner = DefaultPrivateNodeProvisioner(
            homeDir = home, platform = null, nodeVersion = version,
            downloader = { _, _ -> }, extractor = { _, _ -> },
        )
        assertThrows(NodeProvisioningException::class.java) { provisioner.ensurePrivateNode() }
    }
}
