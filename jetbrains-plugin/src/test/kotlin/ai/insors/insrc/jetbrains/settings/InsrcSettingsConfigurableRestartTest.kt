package ai.insors.insrc.jetbrains.settings

import ai.insors.insrc.jetbrains.daemon.DaemonGateway
import ai.insors.insrc.jetbrains.daemon.RoleDto
import ai.insors.insrc.jetbrains.daemon.SaveResult
import com.intellij.openapi.options.ConfigurationException
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertFalse
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Test
import org.junit.jupiter.api.assertThrows
import java.io.File
import java.lang.reflect.Proxy

/**
 * Epic ce99b72065d03b1b, Story s7 / t8: one daemon-restart offer per Apply. A section
 * reports a write saved with restartRequired through takeRestartRequired(); the page's
 * finishApply offers the restart once — before any failure is reported — and the page
 * calls it outside the background save loop (source scan: the Configurable is not
 * headlessly bootable).
 */
class InsrcSettingsConfigurableRestartTest {

    private fun gateway(answer: SaveResult): DaemonGateway =
        Proxy.newProxyInstance(javaClass.classLoader, arrayOf(DaemonGateway::class.java)) { _, method, _ ->
            when (method.name) {
                "writeSetting", "clearSetting" -> answer
                else -> throw AssertionError("unexpected gateway call: ${method.name}")
            }
        } as DaemonGateway

    private fun perRole(answer: SaveResult): PerRoleSection {
        val model = PerRoleOverridesModel(listOf(RoleDto("review", "core")), listOf("core", "mid", "cheap"), emptyMap())
        model.setOverride("review", "mid")
        return PerRoleSection(model, gateway(answer))
    }

    @Test
    fun `one prompt when any write needed a restart, also with a failure, none otherwise`() {
        // A section reports restartRequired once per apply.
        val restart = perRole(SaveResult.Saved(restartRequired = true))
        restart.apply()
        assertTrue(restart.takeRestartRequired())
        assertFalse(restart.takeRestartRequired(), "reading clears it")
        val plain = perRole(SaveResult.Saved())
        plain.apply()
        assertFalse(plain.takeRestartRequired())
        // The seam's default is false (a section that writes nothing needing a restart).
        val quiet = object : SettingsSection {
            override val title = "quiet"
            override fun component() = throw AssertionError()
            override fun isModified() = false
            override fun apply() {}
            override fun reset() {}
        }
        assertFalse(quiet.takeRestartRequired())

        // finishApply: one offer when needed, none otherwise.
        var offers = 0
        finishApply(restartRequired = true, failures = emptyList()) { offers++ }
        assertEquals(1, offers)
        finishApply(restartRequired = false, failures = emptyList()) { offers++ }
        assertEquals(1, offers, "no restart needed, no prompt")

        // With a failure: the offer comes first, then the ConfigurationException listing it.
        val events = mutableListOf<String>()
        val e = assertThrows<ConfigurationException> {
            finishApply(restartRequired = true, failures = listOf("logLevel: rejected-model — no")) { events += "offer" }
        }
        events += "thrown"
        assertEquals(listOf("offer", "thrown"), events)
        assertTrue(e.localizedMessage.contains("logLevel: rejected-model — no"))
        val none = mutableListOf<String>()
        assertThrows<ConfigurationException> { finishApply(restartRequired = false, failures = listOf("x: y")) { none += "offer" } }
        assertTrue(none.isEmpty())

        // The page: generic writes and every section feed one flag inside the save loop; the
        // prompt (finishApply) runs after the loop, on the EDT.
        val page = File("src/main/kotlin/ai/insors/insrc/jetbrains/settings/InsrcSettingsConfigurable.kt").readText()
        val loopStart = page.indexOf("runProcessWithProgressSynchronously({")
        val loopEnd = page.indexOf("}, \"Saving insrc Settings…\", false, null)")
        val finish = page.indexOf("finishApply(restartRequired, failures) { offerRestart(gateway) }")
        assertTrue(loopStart in 0 until loopEnd && finish > loopEnd, "finishApply runs after the background loop")
        val loop = page.substring(loopStart, loopEnd)
        assertTrue(loop.contains("if (result.restartRequired) restartRequired = true"), "generic writes feed the flag")
        assertTrue(loop.contains("if (section.takeRestartRequired()) restartRequired = true"), "every section feeds the flag")
        assertFalse(loop.contains("offerRestart"), "no prompt inside the loop")
        assertTrue(page.contains("DaemonRestart({ DaemonLifecycleCommandRunner.production().run(it) }, gateway).restart()"), "the shared restart helper")
        for (name in listOf("ModelTiersSection.kt", "PerRoleSection.kt", "PerRepoSection.kt")) {
            val src = File("src/main/kotlin/ai/insors/insrc/jetbrains/settings/$name").readText()
            assertTrue(src.contains("override fun takeRestartRequired(): Boolean"), "$name reports restartRequired")
        }
    }
}
