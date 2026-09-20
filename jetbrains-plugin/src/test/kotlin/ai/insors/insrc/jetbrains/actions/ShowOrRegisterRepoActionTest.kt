package ai.insors.insrc.jetbrains.actions

import org.junit.jupiter.api.Assertions.assertFalse
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Test
import java.io.File

/**
 * Source-scan guards for the Project-view context-menu feature (Story
 * jetbrains-plugin-add-insrc-entry-project / S001 / t6). The AnAction + its
 * plugin.xml registration + the two DialogWrappers are not headlessly bootable, so
 * — the config-catalog-contract / InsrcSettingsConfigurable idiom — we assert the
 * load-bearing invariants against the source text.
 */
class ShowOrRegisterRepoActionTest {

    private fun read(path: String): String {
        val f = File(path)
        assertTrue(f.exists(), "expected source at $path (test cwd=${File("").absolutePath})")
        return f.readText()
    }

    @Test
    fun `plugin_xml registers the action on ProjectViewPopupMenu and stays platform-only`() {
        val xml = read("src/main/resources/META-INF/plugin.xml")
        assertTrue(xml.contains("<actions>"), "no <actions> block in plugin.xml")
        assertTrue(
            xml.contains("ai.insors.insrc.jetbrains.actions.ShowOrRegisterRepoAction"),
            "the action class is not registered",
        )
        assertTrue(
            Regex("<add-to-group\\s+group-id=\"ProjectViewPopupMenu\"").containsMatchIn(xml),
            "the action is not added to the ProjectViewPopupMenu group",
        )
        // The single-artifact-four-IDEs guarantee: still depends ONLY on the common platform module.
        assertTrue(
            xml.contains("<depends>com.intellij.modules.platform</depends>"),
            "plugin.xml must depend on the common platform module",
        )
        assertFalse(
            Regex("<depends>com\\.intellij\\.modules\\.(java|python|go|lang|ruby|php)\\b[^<]*</depends>").containsMatchIn(xml),
            "the action must not pull in an IDE-specific module dependency",
        )
    }

    @Test
    fun `the action computes the dynamic label off the EDT (BGT) and never blocks or throws in update`() {
        val src = read("src/main/kotlin/ai/insors/insrc/jetbrains/actions/ShowOrRegisterRepoAction.kt")
        assertTrue(src.contains("ActionUpdateThread.BGT"), "update() must run on BGT (a socket probe off the EDT)")
        assertTrue(src.contains("e.project?.basePath"), "update() reads the project root from basePath")
        assertTrue(
            src.contains("isEnabledAndVisible = false"),
            "a null/blank basePath must hide/disable the item",
        )
        assertTrue(src.contains("\"Show Repo status\""), "the registered label is 'Show Repo status'")
        assertTrue(src.contains("\"Register Repo\""), "the unregistered label is 'Register Repo'")
        assertTrue(src.contains("isProjectRegistered"), "the label is driven by isProjectRegistered")
        // The probe defaults safely on BOTH a DaemonUnavailableException and any other
        // transport fault (a malformed reply surfaced as a plain RuntimeException).
        assertTrue(
            src.contains("catch (ex: DaemonUnavailableException)"),
            "the probe must catch DaemonUnavailableException (never let it escape update())",
        )
        assertTrue(
            src.contains("catch (ex: RuntimeException)"),
            "the probe must also catch RuntimeException (malformed-reply safety)",
        )
    }

    @Test
    fun `actionPerformed reuses the BGT-computed registration flag and never re-probes on the EDT`() {
        val src = read("src/main/kotlin/ai/insors/insrc/jetbrains/actions/ShowOrRegisterRepoAction.kt")
        // update() stashes the registration state on the presentation…
        assertTrue(src.contains("putClientProperty(REGISTERED_KEY"), "update() stashes the registration flag")
        // …and actionPerformed reads it back instead of calling isProjectRegistered on the EDT.
        assertTrue(src.contains("getClientProperty(REGISTERED_KEY)"), "actionPerformed reuses the stashed flag")
        val actionBody = src.substringAfter("override fun actionPerformed")
        assertFalse(
            actionBody.substringBefore("private fun probeRegistered").contains("isProjectRegistered"),
            "actionPerformed must NOT re-probe isProjectRegistered on the EDT (a blocking socket call)",
        )
        assertTrue(src.contains("RepoStatusDialog(project, root)"), "registered -> the status dialog")
        assertTrue(src.contains("RegisterRepoDialog(project, root)"), "unregistered -> the register dialog")
    }

    @Test
    fun `RepoStatusDialog reads repoStats off the EDT and renders Loaded vs Unavailable`() {
        val src = read("src/main/kotlin/ai/insors/insrc/jetbrains/actions/RepoStatusDialog.kt")
        assertTrue(src.contains("executeOnPooledThread"), "the stats read runs off the EDT")
        assertTrue(src.contains("invokeLater"), "the render is marshalled back to the EDT")
        assertTrue(src.contains("gateway.repoStats"), "the dialog reads gateway.repoStats")
        assertTrue(src.contains("if (!disposed)"), "a late result on a disposed dialog is dropped")
        assertTrue(src.contains("RepoStatsResult.Loaded"), "the Loaded branch renders the rich fields")
        assertTrue(src.contains("RepoStatsResult.Unavailable"), "the Unavailable branch shows a distinct message")
        // rich fields referenced
        for (field in listOf("fileCount", "sizeBytes", "entityCount", "relationCount", "pendingJobs", "filesByLanguage", "entityCountByKind")) {
            assertTrue(src.contains(field), "the status view must reference $field")
        }
    }

    @Test
    fun `RegisterRepoDialog collects the root plus two steering toggles and never closes-as-success on failure`() {
        val src = read("src/main/kotlin/ai/insors/insrc/jetbrains/actions/RegisterRepoDialog.kt")
        // read-only root + two steering checkboxes
        assertTrue(src.contains("isEditable = false"), "the project root field is read-only")
        assertTrue(src.contains("JCheckBox(\"Add insrc steering to CLAUDE.md"), "a CLAUDE.md steering toggle")
        assertTrue(src.contains("JCheckBox(\"Add insrc steering to AGENTS.md"), "an AGENTS.md steering toggle")
        // register runs off the EDT with the steering selection
        assertTrue(src.contains("executeOnPooledThread"), "registration runs off the EDT")
        assertTrue(src.contains("gateway.registerProject(projectRootPath, steering)"), "registerProject is called with the steering selection")
        assertTrue(src.contains("SteeringSelection("), "the toggles build a SteeringSelection")
        // close ONLY on registered==true; a rejection/unavailable keeps the dialog open
        assertTrue(src.contains("outcome.result.registered"), "success is gated on registered==true")
        assertTrue(src.contains("close(OK_EXIT_CODE)"), "the dialog closes only on success")
        assertTrue(src.contains("setErrorText"), "a rejection/unavailable surfaces the reason in the dialog")
        // the success notification reuses the EXISTING 'insrc' NotificationGroup
        assertTrue(src.contains("getNotificationGroup(\"insrc\")"), "the success path reuses the 'insrc' NotificationGroup")
    }
}
