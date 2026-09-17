package ai.insors.insrc.jetbrains.lifecycle

import com.intellij.openapi.diagnostic.logger
import java.io.IOException
import java.net.URI
import java.net.http.HttpClient
import java.net.http.HttpRequest
import java.net.http.HttpResponse
import java.nio.file.Files
import java.nio.file.Path

/**
 * The host os/arch and the layout of an official Node distribution for it
 * (Story S003 / t5) — the external assumption isolated in one place: Node ships
 * tarballs named `node-<version>-<os>-<arch>` under `https://nodejs.org/dist/`.
 */
data class NodePlatform(
    val os: String,   // darwin | linux | win
    val arch: String, // arm64 | x64
) {
    private val archiveExt: String get() = if (os == "win") "zip" else "tar.gz"
    private val exeRelToDistRoot: String get() = if (os == "win") "node.exe" else "bin/node"

    fun distRootName(version: String): String = "node-$version-$os-$arch"

    /** The official Node CDN URL for this platform's distribution (a Node binary — not a cloud/LLM endpoint). */
    fun downloadUrl(version: String): String =
        "$NODE_DIST_BASE/$version/${distRootName(version)}.$archiveExt"

    /** Absolute path the node executable will live at once extracted under [nodeHome]. */
    fun executablePath(nodeHome: Path, version: String): Path =
        nodeHome.resolve(distRootName(version)).resolve(exeRelToDistRoot)

    fun archivePath(nodeHome: Path, version: String): Path =
        nodeHome.resolve("${distRootName(version)}.$archiveExt")

    companion object {
        const val NODE_DIST_BASE: String = "https://nodejs.org/dist"

        /** Detect the current platform, or `null` when it is unsupported (arch/os we have no mapping for). */
        fun detect(
            osName: String = System.getProperty("os.name").orEmpty(),
            osArch: String = System.getProperty("os.arch").orEmpty(),
        ): NodePlatform? {
            val os = when {
                osName.startsWith("Mac", ignoreCase = true) -> "darwin"
                osName.startsWith("Windows", ignoreCase = true) -> "win"
                osName.startsWith("Linux", ignoreCase = true) -> "linux"
                else -> return null
            }
            val arch = when (osArch.lowercase()) {
                "aarch64", "arm64" -> "arm64"
                "x86_64", "amd64" -> "x64"
                else -> return null
            }
            return NodePlatform(os, arch)
        }
    }
}

/** Injectable download seam (Story S003 / t5): fetch [url] to [dest]. Real impl is HTTP; tests fake it. */
fun interface NodeArchiveDownloader {
    fun download(url: String, dest: Path)
}

/** Injectable extraction seam (Story S003 / t5): extract [archive] into [into]. Real impl shells out; tests fake it. */
fun interface NodeArchiveExtractor {
    fun extract(archive: Path, into: Path)
}

/**
 * The concrete [PrivateNodeProvisioner] (Story S003 / t5): ensure a private Node
 * >= NODE_MIN_MAJOR under ~/.insrc/node for the current os/arch. Reuses an
 * already-provisioned one (idempotent, no re-download); otherwise downloads +
 * extracts + verifies. Throws [NodeProvisioningException] on any failure, leaving
 * no partial/unusable runtime returned. Fetches only a Node runtime binary from
 * the official Node CDN — it opens no cloud LLM/REST endpoint (k1).
 *
 * The network and extraction steps are injected ([NodeArchiveDownloader] /
 * [NodeArchiveExtractor]) so the provisioning logic is unit-testable with no real
 * network fetch.
 */
class DefaultPrivateNodeProvisioner(
    private val homeDir: Path = Path.of(System.getProperty("user.home")),
    private val platform: NodePlatform? = NodePlatform.detect(),
    private val nodeVersion: String = DEFAULT_NODE_VERSION,
    private val downloader: NodeArchiveDownloader = HttpNodeArchiveDownloader(),
    private val extractor: NodeArchiveExtractor = TarNodeArchiveExtractor(),
) : PrivateNodeProvisioner {

    private val log = logger<DefaultPrivateNodeProvisioner>()

    override fun ensurePrivateNode(): NodeRuntime {
        val plat = platform
            ?: throw NodeProvisioningException("insrc: no private Node distribution for this os/arch")
        val nodeHome = homeDir.resolve(".insrc").resolve("node")
        val exe = plat.executablePath(nodeHome, nodeVersion)

        // Idempotent reuse: a previously-provisioned Node is used as-is, no re-download.
        if (Files.exists(exe)) {
            return NodeRuntime(executablePath = exe.toString(), source = NodeSource.PROVISIONED)
        }

        try {
            Files.createDirectories(nodeHome)
            val archive = plat.archivePath(nodeHome, nodeVersion)
            downloader.download(plat.downloadUrl(nodeVersion), archive)
            extractor.extract(archive, nodeHome)
        } catch (e: NodeProvisioningException) {
            throw e
        } catch (e: Exception) {
            throw NodeProvisioningException("insrc: failed to provision a private Node under $nodeHome", e)
        }

        // Verify: the expected executable must exist after extraction (no partial runtime).
        if (!Files.exists(exe)) {
            throw NodeProvisioningException("insrc: provisioned Node is missing its executable at $exe")
        }
        log.info("insrc: provisioned a private Node at $exe")
        return NodeRuntime(executablePath = exe.toString(), source = NodeSource.PROVISIONED)
    }

    companion object {
        /** The pinned private-Node version (>= NODE_MIN_MAJOR). */
        const val DEFAULT_NODE_VERSION: String = "v20.18.0"
    }
}

/** Real HTTP downloader (Story S003 / t5) — GETs the Node archive to disk. */
class HttpNodeArchiveDownloader(
    private val client: HttpClient = HttpClient.newHttpClient(),
) : NodeArchiveDownloader {
    override fun download(url: String, dest: Path) {
        val request = HttpRequest.newBuilder(URI.create(url)).GET().build()
        val response = client.send(request, HttpResponse.BodyHandlers.ofFile(dest))
        if (response.statusCode() !in 200..299) {
            throw IOException("download failed (${response.statusCode()}) for $url")
        }
    }
}

/** Real extractor (Story S003 / t5) — shells out to the platform `tar` (which also handles .zip on modern Windows). */
class TarNodeArchiveExtractor : NodeArchiveExtractor {
    override fun extract(archive: Path, into: Path) {
        val process = ProcessBuilder("tar", "-xf", archive.toString(), "-C", into.toString())
            .redirectErrorStream(true)
            .start()
        val code = process.waitFor()
        if (code != 0) throw IOException("tar extraction failed ($code) for $archive")
    }
}
