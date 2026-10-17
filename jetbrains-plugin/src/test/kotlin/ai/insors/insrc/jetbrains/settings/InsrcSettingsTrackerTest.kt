package ai.insors.insrc.jetbrains.settings

import ai.insors.insrc.jetbrains.daemon.DaemonGateway
import ai.insors.insrc.jetbrains.daemon.DaemonGatewayImpl
import ai.insors.insrc.jetbrains.daemon.DaemonResult
import ai.insors.insrc.jetbrains.daemon.DaemonRpc
import ai.insors.insrc.jetbrains.daemon.DaemonUnavailableException
import ai.insors.insrc.jetbrains.daemon.RepoSettingsResult
import ai.insors.insrc.jetbrains.daemon.RoleDto
import ai.insors.insrc.jetbrains.daemon.SaveResult
import ai.insors.insrc.jetbrains.daemon.SettingsCatalogResult
import com.intellij.openapi.options.ConfigurationException
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertFalse
import org.junit.jupiter.api.Assertions.assertInstanceOf
import org.junit.jupiter.api.Assertions.assertThrows
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Test
import java.awt.Container
import java.io.File
import java.lang.reflect.Proxy
import javax.swing.JLabel
import javax.swing.JTextField

/**
 * Story s3 / t9 — the settings page's tracker rows over the daemon methods:
 * parseCatalog keeps repoFields, readRepoSettings / writeRepoSetting classify the
 * three outcomes, the page loads each repo's settings on the pooled thread, and a
 * tracker edit is routed to writeRepoSetting while a model-tier edit still uses
 * writeSetting (source scans where the Swing host is not headlessly bootable).
 */
class InsrcSettingsTrackerTest {

    private class FakeDaemonRpc(private val handler: (String, Map<String, Any?>) -> DaemonResult) : DaemonRpc {
        override fun call(method: String, params: Map<String, Any?>): DaemonResult = handler(method, params)
    }

    private fun read(path: String): String {
        val f = File(path)
        assertTrue(f.exists(), "expected source at $path (test cwd=${File("").absolutePath})")
        return f.readText()
    }

    private val repoFieldsPayload = listOf(
        mapOf("key" to "ghHost", "label" to "GitHub host", "type" to "string", "default" to "github.com",
              "description" to "d", "group" to "Tracker", "kind" to "local", "note" to "saved; not used yet"),
        mapOf("key" to "signin", "label" to "Sign-in", "type" to "string", "description" to "d", "group" to "Tracker", "kind" to "status"),
        mapOf("key" to "type", "label" to "Tracker", "type" to "enum", "enumValues" to listOf("github", "none"),
              "description" to "d", "group" to "Tracker", "kind" to "local"),
    )

    private fun catalogPayload(withRepoFields: Boolean): Map<String, Any?> = buildMap<String, Any?> {
        put("options", emptyList<Any?>())
        put("groups", emptyList<Any?>())
        put("roles", emptyList<Any?>())
        put("tierNames", emptyList<Any?>())
        put("values", emptyMap<String, Any?>())
        if (withRepoFields) put("repoFields", repoFieldsPayload)
    }

    @Test
    fun `parseCatalog keeps repoFields and an older daemon without them gives an empty list`() {
        val loaded = DaemonGatewayImpl(FakeDaemonRpc { _, _ -> DaemonResult(ok = true, data = catalogPayload(true)) }).settingsCatalog()
        val cat = assertInstanceOf(SettingsCatalogResult.Loaded::class.java, loaded).catalog
        assertEquals(listOf("ghHost", "signin", "type"), cat.repoFields.map { it.key })
        val ghHost = cat.repoFields.first { it.key == "ghHost" }
        assertEquals("GitHub host", ghHost.label)
        assertEquals("local", ghHost.kind)
        assertEquals("github.com", ghHost.default)
        assertEquals("saved; not used yet", ghHost.note)
        assertEquals(listOf("github", "none"), cat.repoFields.first { it.key == "type" }.enumValues)

        val old = DaemonGatewayImpl(FakeDaemonRpc { _, _ -> DaemonResult(ok = true, data = catalogPayload(false)) }).settingsCatalog()
        assertTrue(assertInstanceOf(SettingsCatalogResult.Loaded::class.java, old).catalog.repoFields.isEmpty())
    }

    private fun settingsPayload(): Map<String, Any?> = mapOf(
        "repo" to "/work/a",
        "values" to mapOf("ghHost" to "ghe.example.com"),
        "resolved" to mapOf("type" to "github", "owner" to "acme", "repo" to "widgets", "source" to "per-repo-config"),
        "signin" to mapOf("state" to "missing-signin", "reason" to "gh is not signed in"),
        "policy" to mapOf("ok" to true, "mode" to "team", "values" to mapOf("teamMode" to true)),
    )

    @Test
    fun `readRepoSettings maps loaded, a daemon refusal and a transport fault`() {
        val calls = mutableListOf<Pair<String, Map<String, Any?>>>()
        val ok = DaemonGatewayImpl(FakeDaemonRpc { m, p ->
            calls.add(m to p)
            DaemonResult(ok = true, data = mapOf("ok" to true, "payload" to settingsPayload()))
        }).readRepoSettings("/work/a")
        val s = assertInstanceOf(RepoSettingsResult.Loaded::class.java, ok).settings
        assertEquals(listOf("repo.settings.get" to mapOf<String, Any?>("repo" to "/work/a")), calls)
        assertEquals("ghe.example.com", s.values["ghHost"])
        assertEquals("acme", s.resolved.owner)
        assertEquals("missing-signin", s.signin.state)
        assertEquals("gh is not signed in", s.signin.reason)
        assertEquals("team", s.policy.mode)
        assertEquals(true, s.policy.values["teamMode"])

        val refused = DaemonGatewayImpl(FakeDaemonRpc { _, _ ->
            DaemonResult(ok = true, data = mapOf("ok" to false, "error" to mapOf("code" to "github-json-unreadable", "message" to "github.json: is not valid JSON")))
        }).readRepoSettings("/work/a")
        assertEquals("github.json: is not valid JSON", assertInstanceOf(RepoSettingsResult.Rejected::class.java, refused).reason)

        val framed = DaemonGatewayImpl(FakeDaemonRpc { _, _ -> DaemonResult(ok = false, error = "unknown method") }).readRepoSettings("/work/a")
        assertInstanceOf(RepoSettingsResult.Unavailable::class.java, framed)
        val down = DaemonGatewayImpl(FakeDaemonRpc { _, _ -> throw DaemonUnavailableException("daemon is not running") }).readRepoSettings("/work/a")
        assertEquals("daemon is not running", assertInstanceOf(RepoSettingsResult.Unavailable::class.java, down).reason)
        val malformed = DaemonGatewayImpl(FakeDaemonRpc { _, _ -> DaemonResult(ok = true, data = mapOf("ok" to true)) }).readRepoSettings("/work/a")
        assertInstanceOf(RepoSettingsResult.Unavailable::class.java, malformed)
    }

    @Test
    fun `writeRepoSetting calls repo_settings_set and maps saved, a refusal and a transport fault`() {
        val calls = mutableListOf<Pair<String, Map<String, Any?>>>()
        val saved = DaemonGatewayImpl(FakeDaemonRpc { m, p -> calls.add(m to p); DaemonResult(ok = true, data = mapOf("ok" to true)) })
            .writeRepoSetting("/work/a", "ghHost", "ghe.example.com")
        assertEquals(SaveResult.Saved, saved)
        assertEquals("repo.settings.set", calls.single().first, "not config.write")
        assertEquals(mapOf<String, Any?>("repo" to "/work/a", "key" to "ghHost", "value" to "ghe.example.com"), calls.single().second)

        // A null value is passed through as null; the transport keeps it as a JSON null (see the wire test below).
        val cleared = mutableListOf<Map<String, Any?>>()
        DaemonGatewayImpl(FakeDaemonRpc { _, p -> cleared.add(p); DaemonResult(ok = true, data = mapOf("ok" to true)) })
            .writeRepoSetting("/work/a", "ghPath", null)
        assertEquals(null, cleared.single()["value"])
        assertTrue(cleared.single().containsKey("key"))

        val refused = DaemonGatewayImpl(FakeDaemonRpc { _, _ ->
            DaemonResult(ok = true, data = mapOf("ok" to false, "error" to mapOf("code" to "invalid-value", "message" to "branchPattern must not start with a slash")))
        }).writeRepoSetting("/work/a", "branchPattern", "/x")
        assertEquals("branchPattern must not start with a slash", assertInstanceOf(SaveResult.Rejected::class.java, refused).reason)

        val down = DaemonGatewayImpl(FakeDaemonRpc { _, _ -> throw DaemonUnavailableException("daemon is not running") })
            .writeRepoSetting("/work/a", "ghHost", "x")
        assertInstanceOf(SaveResult.Unavailable::class.java, down)
    }

    @Test
    fun `repo_settings_set keeps a null value on the wire as an explicit null while config_write still drops it`() {
        val rpc = ai.insors.insrc.jetbrains.daemon.UnixSocketDaemonRpc()
        val clear = rpc.requestLine(1, "repo.settings.set", mapOf("repo" to "/work/a", "key" to "ghPath", "value" to null))
        assertTrue(clear.contains("\"value\":null"), "an explicit null clears the row: $clear")
        val set = rpc.requestLine(2, "repo.settings.set", mapOf("repo" to "/work/a", "key" to "ghHost", "value" to "h"))
        assertTrue(set.contains("\"value\":\"h\""))
        // The existing method keeps its convention: a null is dropped (a clear omits `value`).
        val config = rpc.requestLine(3, "config.write", mapOf("path" to listOf("a"), "value" to null))
        assertFalse(config.contains("value"), "config.write still omits a null value: $config")
    }

    @Test
    fun `the page reads each repo's settings on the pooled thread and hands them with repoFields to PerRepoSection`() {
        val src = read("src/main/kotlin/ai/insors/insrc/jetbrains/settings/InsrcSettingsConfigurable.kt")
        val pooled = src.indexOf("executeOnPooledThread")
        val edt = src.indexOf("invokeLater", pooled)
        val readCall = src.indexOf("gateway.readRepoSettings(it)")
        assertTrue(pooled in 0 until readCall && readCall < edt, "readRepoSettings runs inside the pooled-thread block, before the EDT render")
        assertTrue(src.contains("fullCatalog.repoFields"), "PerRepoSection gets the catalog's repoFields")
        assertTrue(Regex("gateway,\\s*fullCatalog\\.repoFields,\\s*repoSettings,").containsMatchIn(src), "and each repo's settings result")
    }

    // --- edits route to the right gateway method -----------------------------------------

    private fun gatewayRecording(calls: MutableList<String>, write: (String, String, Any?) -> SaveResult): DaemonGateway =
        Proxy.newProxyInstance(DaemonGateway::class.java.classLoader, arrayOf(DaemonGateway::class.java)) { _, method, args ->
            when (method.name) {
                "writeRepoSetting" -> {
                    calls.add("writeRepoSetting ${args[0]} ${args[1]} ${args[2]}")
                    write(args[0] as String, args[1] as String, args[2])
                }
                "readRepoSettings" -> {
                    calls.add("readRepoSettings ${args[0]}")
                    TrackerFixtures.loaded(args[0] as String, values = mapOf("ghHost" to "ghe.corp.example"))
                }
                "writeSetting" -> {
                    calls.add("writeSetting ${(args[0] as List<*>).joinToString(".")}")
                    SaveResult.Saved
                }
                "clearSetting" -> {
                    calls.add("clearSetting ${(args[0] as List<*>).joinToString(".")}")
                    SaveResult.Saved
                }
                else -> throw AssertionError("unexpected gateway call ${method.name}")
            }
        } as DaemonGateway

    private fun fieldFor(root: Container, label: String): JTextField? {
        val comps = root.components
        if (comps.size >= 2 && (comps[0] as? JLabel)?.text == label && comps[1] is JTextField) return comps[1] as JTextField
        for (c in comps) if (c is Container) fieldFor(c, label)?.let { return it }
        return null
    }

    private fun section(gateway: DaemonGateway, repo: String = "/work/a"): PerRepoSection {
        val model = PerRepoOverridesModel(listOf(repo), listOf(RoleDto("review", "core")), listOf("cheap", "mid", "core"), emptyMap())
        return PerRepoSection(model, gateway, TrackerFixtures.fields, mapOf(repo to TrackerFixtures.loaded(repo)))
    }

    @Test
    fun `a ghHost edit goes to writeRepoSetting, a model-tier edit still goes to writeSetting`() {
        val calls = mutableListOf<String>()
        val sec = section(gatewayRecording(calls) { _, _, _ -> SaveResult.Saved })
        val root = sec.component()
        assertFalse(sec.isModified())

        fieldFor(root, "GitHub host")!!.text = "ghe.corp.example"
        assertTrue(sec.isModified(), "a tracker edit makes the section dirty")
        sec.apply()
        assertEquals(
            listOf("writeRepoSetting /work/a ghHost ghe.corp.example", "readRepoSettings /work/a"),
            calls,
            "the tracker edit uses repo.settings.set and re-reads that repo; config.write is not used",
        )
        assertFalse(sec.isModified(), "a Saved edit leaves nothing pending")

        // A model-tier edit (coreFloor of a new override) keeps going to writeSetting.
        calls.clear()
        val model = PerRepoOverridesModel(listOf("/work/a"), listOf(RoleDto("review", "core")), listOf("cheap", "mid", "core"), emptyMap())
        model.addOverride("/work/a")
        model.setCoreFloor("/work/a", "core")
        val sec2 = PerRepoSection(model, gatewayRecording(calls) { _, _, _ -> SaveResult.Saved }, TrackerFixtures.fields, mapOf("/work/a" to TrackerFixtures.loaded("/work/a")))
        sec2.apply()
        assertTrue(calls.any { it.startsWith("writeSetting models.byRepo./work/a") }, "model-tier edits keep using writeSetting: $calls")
        assertTrue(calls.none { it.startsWith("writeRepoSetting") })
    }

    @Test
    fun `a refused tracker edit is reported with the daemon's message and stays pending`() {
        val calls = mutableListOf<String>()
        val sec = section(gatewayRecording(calls) { _, _, _ -> SaveResult.Rejected("branchPattern must not start with a slash") })
        val root = sec.component()
        fieldFor(root, "Branch pattern")!!.text = "/x"

        val ex = assertThrows(ConfigurationException::class.java) { sec.apply() }
        assertTrue(ex.localizedMessage.contains("branchPattern must not start with a slash"))
        assertTrue(sec.isModified(), "the refused edit is kept so the user can fix it")
        assertTrue(calls.none { it.startsWith("readRepoSettings") }, "no re-read after a refusal")

        sec.reset()
        assertFalse(sec.isModified())
    }
}
