package ai.insors.insrc.jetbrains.settings

import ai.insors.insrc.jetbrains.daemon.BuildSetupDto
import ai.insors.insrc.jetbrains.daemon.DaemonGatewayImpl
import ai.insors.insrc.jetbrains.daemon.DaemonResult
import ai.insors.insrc.jetbrains.daemon.DaemonRpc
import ai.insors.insrc.jetbrains.daemon.RepoSettingsResult
import ai.insors.insrc.jetbrains.daemon.SaveResult
import ai.insors.insrc.jetbrains.daemon.SettingsCatalogResult
import com.google.gson.Gson
import com.google.gson.reflect.TypeToken
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertInstanceOf
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Test
import java.awt.Container
import java.io.File
import java.lang.reflect.Proxy
import javax.swing.JButton
import javax.swing.JComponent
import javax.swing.JLabel
import javax.swing.JTextField
import javax.swing.border.TitledBorder
import ai.insors.insrc.jetbrains.daemon.DaemonGateway

/**
 * Story s3 / t10 — the repo tracker rows contract, JetBrains side. Loads the same shared fixture as
 * the terminal and VS Code tests (src/config/__tests__/fixtures/repo-fields-catalog.json), runs it
 * through the real parseCatalog / readRepoSettings and the tracker row model, and checks the rows
 * show the same key, label, kind and note per row, in order. A row added to a copy of the table
 * appears with no change to the plugin.
 */
class RepoFieldsContractTest {

    private class FakeDaemonRpc(private val handler: (String, Map<String, Any?>) -> DaemonResult) : DaemonRpc {
        override fun call(method: String, params: Map<String, Any?>): DaemonResult = handler(method, params)
    }

    private val fixture: Map<String, Any?> = run {
        val f = File("../src/config/__tests__/fixtures/repo-fields-catalog.json")
        assertTrue(f.exists(), "expected the shared fixture at ${f.absolutePath}")
        Gson().fromJson(f.readText(), object : TypeToken<Map<String, Any?>>() {}.type)
    }

    @Suppress("UNCHECKED_CAST")
    private fun fixtureFields(): List<Map<String, Any?>> = fixture["repoFields"] as List<Map<String, Any?>>

    @Suppress("UNCHECKED_CAST")
    private fun fixtureSettings(): Map<String, Any?> = fixture["settings"] as Map<String, Any?>

    private data class Row(val key: String, val label: String, val kind: String, val note: String?)

    private fun expected(fields: List<Map<String, Any?>>): List<Row> =
        fields.map { Row(it["key"] as String, it["label"] as String, it["kind"] as String, it["note"] as String?) }

    /** The rows this client renders for [fields]: the real catalog parse, the real settings parse, then the row model. */
    private fun rendered(fields: List<Map<String, Any?>>): List<Row> {
        val catalogPayload = mapOf<String, Any?>(
            "options" to emptyList<Any?>(), "groups" to emptyList<Any?>(), "roles" to emptyList<Any?>(),
            "tierNames" to emptyList<Any?>(), "values" to emptyMap<String, Any?>(), "repoFields" to fields,
        )
        val catalog = DaemonGatewayImpl(FakeDaemonRpc { _, _ -> DaemonResult(ok = true, data = catalogPayload) }).settingsCatalog()
        val repoFields = assertInstanceOf(SettingsCatalogResult.Loaded::class.java, catalog).catalog.repoFields

        val settings = DaemonGatewayImpl(FakeDaemonRpc { _, _ ->
            DaemonResult(ok = true, data = mapOf("ok" to true, "payload" to fixtureSettings()))
        }).readRepoSettings(fixtureSettings()["repo"] as String)
        assertInstanceOf(RepoSettingsResult.Loaded::class.java, settings)

        val repo = fixtureSettings()["repo"] as String
        val model = RepoTrackerModel(repoFields, mapOf(repo to settings))
        return model.rows(repo).map { Row(it.key, it.label, it.kind, it.note) }
    }

    @Test
    fun `JetBrains rows equal the shared catalog fixture and a new row appears`() {
        val fields = fixtureFields()
        assertTrue(fields.isNotEmpty())
        assertEquals(expected(fields), rendered(fields), "key, label, kind and note per row, in order")

        // A row added to a copy of the table appears with no change to the plugin.
        val extraLocal = mapOf<String, Any?>(
            "key" to "reviewers", "label" to "Default reviewers", "type" to "string", "description" to "d",
            "group" to "Tracker", "kind" to "local", "note" to "saved; not used yet",
        )
        val withLocal = fields + extraLocal
        assertEquals(expected(withLocal), rendered(withLocal))

        val extraPolicy = mapOf<String, Any?>(
            "key" to "newRule", "label" to "New rule", "type" to "string", "description" to "d",
            "group" to "Tracker", "kind" to "policy", "note" to "set by the team policy",
        )
        val withPolicy = fields + extraPolicy
        assertEquals(expected(withPolicy), rendered(withPolicy))

        // Values come from the same payload as in the other clients.
        val repo = fixtureSettings()["repo"] as String
        val rows = RepoTrackerModel(
            assertInstanceOf(SettingsCatalogResult.Loaded::class.java, DaemonGatewayImpl(FakeDaemonRpc { _, _ ->
                DaemonResult(ok = true, data = mapOf<String, Any?>(
                    "options" to emptyList<Any?>(), "groups" to emptyList<Any?>(), "roles" to emptyList<Any?>(),
                    "tierNames" to emptyList<Any?>(), "values" to emptyMap<String, Any?>(), "repoFields" to fields,
                ))
            }).settingsCatalog()).catalog.repoFields,
            mapOf(repo to DaemonGatewayImpl(FakeDaemonRpc { _, _ ->
                DaemonResult(ok = true, data = mapOf("ok" to true, "payload" to fixtureSettings()))
            }).readRepoSettings(repo)),
        ).rows(repo)
        assertEquals("ghe.example.com", rows.first { it.key == "ghHost" }.value)
        assertEquals("missing-signin: gh is not signed in", rows.first { it.key == "signin" }.value)
        assertEquals(fields.filter { it["kind"] == "local" }.map { it["key"] }, rows.filter { it.editable }.map { it.key })
    }

    private fun labels(c: Container): List<JLabel> =
        c.components.flatMap { if (it is JLabel) listOf(it) else if (it is Container) labels(it) else emptyList() }

    @Test
    fun `the rendered Tracker block shows each fixture row's label and note, and only local rows have a text field`() {
        val fields = fixtureFields()
        val repo = fixtureSettings()["repo"] as String
        val catalog = DaemonGatewayImpl(FakeDaemonRpc { _, _ ->
            DaemonResult(ok = true, data = mapOf<String, Any?>(
                "options" to emptyList<Any?>(), "groups" to emptyList<Any?>(), "roles" to emptyList<Any?>(),
                "tierNames" to emptyList<Any?>(), "values" to emptyMap<String, Any?>(), "repoFields" to fields,
            ))
        }).settingsCatalog()
        val repoFields = assertInstanceOf(SettingsCatalogResult.Loaded::class.java, catalog).catalog.repoFields
        val settings = DaemonGatewayImpl(FakeDaemonRpc { _, _ ->
            DaemonResult(ok = true, data = mapOf("ok" to true, "payload" to fixtureSettings()))
        }).readRepoSettings(repo)

        val gateway = Proxy.newProxyInstance(DaemonGateway::class.java.classLoader, arrayOf(DaemonGateway::class.java)) { _, m, _ ->
            throw AssertionError("rendering must not call the gateway: ${m.name}")
        } as DaemonGateway
        val model = PerRepoOverridesModel(listOf(repo), emptyList(), emptyList(), emptyMap())
        val root = PerRepoSection(model, gateway, repoFields, mapOf(repo to settings)).component()

        val shown = labels(root).map { it.text }
        for (f in fields) {
            assertTrue(shown.contains(f["label"] as String), "the section shows the label of ${f["key"]}")
            val note = f["note"] as String?
            if (note != null) assertTrue(shown.contains(note), "the section shows the note of ${f["key"]}: $note")
        }
        // Every local row is a text field; status and policy rows are not.
        fun fieldCount(c: Container): Int = c.components.sumOf { if (it is JTextField) 1 else if (it is Container) fieldCount(it) else 0 }
        assertEquals(fields.count { it["kind"] == "local" }, fieldCount(root))
    }

    private fun textFields(c: Container): List<PlaceholderTextField> =
        c.components.flatMap { if (it is PlaceholderTextField) listOf(it) else if (it is Container) textFields(it) else emptyList() }

    private fun buttons(c: Container): List<JButton> =
        c.components.flatMap { if (it is JButton) listOf(it) else if (it is Container) buttons(it) else emptyList() }

    /** Every titled panel under [c], by its border title. */
    private fun titled(c: Container): List<Pair<String, Container>> = c.components.flatMap {
        val border = (it as? JComponent)?.border as? TitledBorder
        val here = if (border != null && it is Container) listOf((border.title ?: "") to it) else emptyList()
        here + (if (it is Container) titled(it) else emptyList())
    }

    private fun loadedRepo(): Triple<String, List<ai.insors.insrc.jetbrains.daemon.RepoFieldDto>, RepoSettingsResult.Loaded> {
        val repo = fixtureSettings()["repo"] as String
        val catalog = DaemonGatewayImpl(FakeDaemonRpc { _, _ ->
            DaemonResult(ok = true, data = mapOf<String, Any?>(
                "options" to emptyList<Any?>(), "groups" to emptyList<Any?>(), "roles" to emptyList<Any?>(),
                "tierNames" to emptyList<Any?>(), "values" to emptyMap<String, Any?>(), "repoFields" to fixtureFields(),
            ))
        }).settingsCatalog()
        val fields = assertInstanceOf(SettingsCatalogResult.Loaded::class.java, catalog).catalog.repoFields
        val settings = DaemonGatewayImpl(FakeDaemonRpc { _, _ ->
            DaemonResult(ok = true, data = mapOf("ok" to true, "payload" to fixtureSettings()))
        }).readRepoSettings(repo)
        return Triple(repo, fields, assertInstanceOf(RepoSettingsResult.Loaded::class.java, settings))
    }

    private fun sectionFor(repo: String, fields: List<ai.insors.insrc.jetbrains.daemon.RepoFieldDto>, loaded: RepoSettingsResult): Container {
        val gateway = Proxy.newProxyInstance(DaemonGateway::class.java.classLoader, arrayOf(DaemonGateway::class.java)) { _, m, _ ->
            throw AssertionError("rendering must not call the gateway: ${m.name}")
        } as DaemonGateway
        return PerRepoSection(PerRepoOverridesModel(listOf(repo), emptyList(), emptyList(), emptyMap()), gateway, fields, mapOf(repo to loaded)).component()
    }

    @Test
    fun `the JetBrains repo settings render the Build rows as a section of their own`() {
        val (repo, fields, loaded) = loadedRepo()
        // the payload's buildSetup is parsed, and a payload without one parses as before
        assertEquals(
            BuildSetupDto("python", "none", null, mapOf("typecheckCommand" to "mypy .", "testCommand" to "pytest", "resultFormat" to "exit-code")),
            loaded.settings.buildSetup,
        )
        val without = DaemonGatewayImpl(FakeDaemonRpc { _, _ ->
            DaemonResult(ok = true, data = mapOf("ok" to true, "payload" to fixtureSettings().filterKeys { it != "buildSetup" }))
        }).readRepoSettings(repo)
        assertEquals(null, assertInstanceOf(RepoSettingsResult.Loaded::class.java, without).settings.buildSetup)

        // the rows: the Build rows carry the suggestion as their placeholder, the others none
        val model = RepoTrackerModel(fields, mapOf(repo to loaded))
        val build = fields.filter { it.group == "Build" }
        assertTrue(build.isNotEmpty())
        val rows = model.rows(repo)
        assertEquals(fields.map { it.key }, rows.map { it.key }, "the daemon's order")
        assertEquals(
            mapOf("typecheckCommand" to "mypy .", "testCommand" to "pytest", "resultFormat" to "exit-code"),
            rows.filter { it.placeholder != null }.associate { it.key to it.placeholder },
        )
        assertEquals(build.map { it.key }, rows.filter { it.group == "Build" }.map { it.key })

        // the view: a Build block beside the Tracker block, holding exactly the Build rows
        val root = sectionFor(repo, fields, loaded)
        val blocks = titled(root).toMap()
        val buildBlock = blocks["$repo — build"]
        val trackerBlock = blocks["$repo — tracker"]
        assertTrue(buildBlock != null && trackerBlock != null, "a Build block and a Tracker block: ${blocks.keys}")
        val inBuild = labels(buildBlock!!).map { it.text }
        val inTracker = labels(trackerBlock!!).map { it.text }
        for (f in build) {
            assertTrue(inBuild.contains(f.label), "the Build block shows ${f.key}")
            assertTrue(!inTracker.contains(f.label), "the Tracker block does not show ${f.key}")
        }
        // the suggestion is the placeholder of the unset field itself, and the field's text stays empty
        val fieldsInBuild = textFields(buildBlock)
        assertEquals(
            mapOf("mypy ." to "", "pytest" to "", "exit-code" to ""),
            fieldsInBuild.mapNotNull { f -> f.placeholder?.let { it to f.text } }.toMap(),
        )
        assertTrue(textFields(trackerBlock).all { it.placeholder == null })
        assertEquals(listOf("Use suggested build commands"), buttons(buildBlock).map { it.text })

        // a repo that has commands, or a payload with no buildSetup, shows no placeholder and no action
        val others = listOf(
            RepoSettingsResult.Loaded(loaded.settings.copy(buildSetup = BuildSetupDto("go", "repo-setting"))),
            RepoSettingsResult.Loaded(loaded.settings.copy(buildSetup = BuildSetupDto("unknown", "none"))),
            RepoSettingsResult.Loaded(loaded.settings.copy(buildSetup = null)),
        )
        for (other in others) {
            val plain = titled(sectionFor(repo, fields, other)).toMap()["$repo — build"]!!
            assertTrue(buttons(plain).isEmpty(), "no action for ${other.settings.buildSetup}")
            assertTrue(textFields(plain).all { it.placeholder == null }, "no placeholder for ${other.settings.buildSetup}")
            assertEquals(null, RepoTrackerModel(fields, mapOf(repo to other)).suggestion(repo))
        }
    }

    @Test
    fun `the suggested build commands clear the first key when the second is refused`() {
        val suggestion = mapOf("typecheckCommand" to "mypy .", "testCommand" to "pytest", "resultFormat" to "exit-code")

        val all = mutableListOf<Pair<String, String?>>()
        assertEquals(null, RepoTrackerModel.writeSuggested(suggestion) { k, v -> all.add(k to v); SaveResult.Saved() })
        assertEquals(listOf("typecheckCommand" to "mypy .", "testCommand" to "pytest", "resultFormat" to "exit-code"), all)

        val calls = mutableListOf<Pair<String, String?>>()
        val failure = RepoTrackerModel.writeSuggested(suggestion) { k, v ->
            calls.add(k to v)
            if (k == "testCommand" && v != null) SaveResult.Rejected("read only") else SaveResult.Saved()
        }
        assertEquals(listOf("typecheckCommand" to "mypy .", "testCommand" to "pytest", "typecheckCommand" to null), calls)
        assertTrue(failure != null && failure.contains("read only") && failure.contains("not applied"), "the reason is returned: $failure")
    }
}
