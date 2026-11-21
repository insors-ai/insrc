package ai.insors.insrc.jetbrains.lifecycle

import org.junit.jupiter.api.Assertions.*
import org.junit.jupiter.api.Test
import org.junit.jupiter.api.io.TempDir
import java.nio.file.Files
import java.nio.file.Path

class PrivateNodeProvisionerTest {
    @TempDir lateinit var home: Path
    private fun executable(): Path {
        val exe=home.resolve(".insrc/runtimes/node-v22.22.1-fixture/digest/distribution/bin/node")
        Files.createDirectories(exe.parent);Files.writeString(exe,"fixture");exe.toFile().setExecutable(true)
        return exe.toRealPath()
    }
    @Test
    fun delegatesEveryReuseToSharedBootstrapWithoutDownloadPolicy() {
        val exe=executable();val script=home.resolve("installer.sh");var calls=0
        val provisioner=DefaultPrivateNodeProvisioner(homeDir=home,installer={script},runner=NodeBootstrapRunner { command,env ->
            calls++;assertEquals(listOf("/bin/bash",script.toString(),"--print-runtime"),command)
            assertEquals(home.toString(),env["HOME"]);assertFalse(env.containsKey("NODE_OPTIONS"));assertFalse(env.containsKey("NODE_PATH"))
            NodeBootstrapResult(0,exe.toString()+"\n")
        },baseEnv=mapOf("PATH" to "/hostile", "NODE_OPTIONS" to "--injected", "NODE_PATH" to "/external"),osName="Mac OS X")
        repeat(2){assertEquals(NodeRuntime(exe.toString(),NodeSource.PROVISIONED),provisioner.ensurePrivateNode())}
        assertEquals(2,calls,"cache presence must never bypass shared inventory verification")
    }
    @Test
    fun checksumMissingAndExternalRuntimeFailuresNeverReturnPartialRuntime() {
        executable()
        for(result in listOf(NodeBootstrapResult(2,"checksum mismatch"),NodeBootstrapResult(0,"/usr/bin/node"),NodeBootstrapResult(0,"/missing/node"),NodeBootstrapResult(0,"/one/node\n/two/node"))) {
            val provisioner=DefaultPrivateNodeProvisioner(homeDir=home,installer={home.resolve("installer.sh")},runner=NodeBootstrapRunner{_,_->result},osName="Linux")
            assertThrows(NodeProvisioningException::class.java){provisioner.ensurePrivateNode()}
        }
        val missing=DefaultPrivateNodeProvisioner(homeDir=home,installer={null},osName="Linux")
        assertTrue(assertThrows(NodeProvisioningException::class.java){missing.ensurePrivateNode()}.message!!.contains("reinstall"))
    }
    @Test
    fun windowsIsExplicitlyUnqualifiedWithoutAnyHostFallback() {
        val provisioner=DefaultPrivateNodeProvisioner(homeDir=home,installer={error("must not provision Windows")},osName="Windows 11")
        assertTrue(assertThrows(NodeProvisioningException::class.java){provisioner.ensurePrivateNode()}.message!!.contains("not qualified"))
    }
}
