package ai.insors.insrc.jetbrains.settings

import ai.insors.insrc.jetbrains.daemon.DaemonGatewayImpl
import ai.insors.insrc.jetbrains.daemon.DaemonStatusResult
import ai.insors.insrc.jetbrains.daemon.ModelDefinitionsResult
import ai.insors.insrc.jetbrains.daemon.PerRepoOverridesResult
import ai.insors.insrc.jetbrains.daemon.RegisteredReposResult
import ai.insors.insrc.jetbrains.daemon.SettingsCatalogResult
import ai.insors.insrc.jetbrains.daemon.UnixSocketDaemonRpc
import org.junit.jupiter.api.Assertions.assertFalse
import org.junit.jupiter.api.Assertions.assertInstanceOf
import org.junit.jupiter.api.Assertions.assertNotNull
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Assumptions.assumeTrue
import org.junit.jupiter.api.Test
import java.awt.Color
import java.awt.Component
import java.awt.Container
import java.awt.image.BufferedImage
import java.io.File
import javax.imageio.ImageIO
import javax.swing.JComponent

/**
 * Epic ce99b72065d03b1b, Story s7 / t10 — a live check against the running daemon (gated
 * by INSRC_LIVE_TESTS=1, skipped otherwise). It builds the real Model tiers section and
 * per-repo section over the live gateway, renders them to PNGs under the Story's evidence
 * folder, and runs a live models.check of a model no family lists. It never approves or
 * rejects (that would write the user's approved-model store) and never applies a write.
 */
class S7LiveRenderTest {

    private val evidence = File("../docs/epics/per-family-model-definitions-served-daemon-E20261023ce99b720/S007/evidence")

    private fun layoutAll(c: Component) {
        c.doLayout()
        (c as? Container)?.components?.forEach { layoutAll(it) }
    }

    private fun render(c: JComponent, name: String) {
        c.size = c.preferredSize
        layoutAll(c)
        val img = BufferedImage(maxOf(c.width, 1), maxOf(c.height, 1), BufferedImage.TYPE_INT_RGB)
        val g = img.createGraphics()
        g.color = Color.WHITE
        g.fillRect(0, 0, img.width, img.height)
        c.printAll(g)
        g.dispose()
        evidence.mkdirs()
        ImageIO.write(img, "png", File(evidence, name))
    }

    @Test
    fun `live daemon - the Model tiers section, the per-repo section and an unlisted-model check`() {
        assumeTrue(System.getenv("INSRC_LIVE_TESTS") == "1", "live test: set INSRC_LIVE_TESTS=1")
        val gateway = DaemonGatewayImpl(UnixSocketDaemonRpc())
        assertInstanceOf(DaemonStatusResult.Loaded::class.java, gateway.daemonStatus(), "the daemon is running")
        val catalog = assertInstanceOf(SettingsCatalogResult.Loaded::class.java, gateway.settingsCatalog()).catalog
        val definitions = gateway.modelDefinitions()
        val defs = assertInstanceOf(ModelDefinitionsResult.Loaded::class.java, definitions).definitions
        val log = StringBuilder()
        log.appendLine("models.definitions: defaultFamily=${defs.defaultFamily}")
        for (f in defs.families) log.appendLine("  ${f.id} (${f.displayName}, cliKind=${f.cliKind}): ${f.models.joinToString { "${it.id}${if (it.aliases.isEmpty()) "" else it.aliases.joinToString(",", "[", "]")}${it.efforts.joinToString(",", "{", "}")}" }}")

        // The Model tiers section over the live definitions: every tier resolves to a listed choice.
        val section = ModelTiersSection(catalog, definitions, gateway)
        render(section.component(), "s7-model-tiers-live.png")
        val model = ModelTiersModel(catalog, defs)
        assertTrue(model.runnerOptions().containsAll(defs.families.filter { it.models.isNotEmpty() }.map { it.id }))
        for (tier in ModelTiersModel.TIERS) {
            log.appendLine("tier $tier: ${model.currentRunner(tier)} / ${model.currentModel(tier)} / effort '${model.currentEffort(tier)}'${model.note(tier)?.let { " — note: $it" } ?: ""}")
            log.appendLine("  model choices: ${model.modelOptions(tier).joinToString { it.label }}")
            log.appendLine("  effort choices: ${model.effortOptions(tier).joinToString { it.ifEmpty { "CLI default" } }}")
        }
        assertFalse(section.isModified(), "opening the page changes nothing")

        // The per-repo section: one overridden repo shown (display only, never applied).
        val repos = assertInstanceOf(RegisteredReposResult.Loaded::class.java, gateway.registeredRepos()).repos
        val overrides = assertInstanceOf(PerRepoOverridesResult.Loaded::class.java, gateway.perRepoOverrides()).overrides
        val repoModel = PerRepoOverridesModel(repos, catalog.roles, catalog.tierNames, overrides)
        if (repoModel.rows().isEmpty()) repoModel.addableRepos().firstOrNull()?.let { repoModel.addOverride(it) }
        render(PerRepoSection(repoModel, gateway).component(), "s7-per-repo-live.png")
        log.appendLine("per-repo rows: ${repoModel.rows().joinToString { "${it.repoPath} coreFloor=${it.coreFloor} tasks=${it.tasks}" }}")

        // A live check of a model no family lists: it runs the family's CLI; nothing is decided.
        val family = defs.families.first { it.cliKind != null }
        val flow = ModelCheckFlow(gateway, defs, DaemonRestart({ throw AssertionError("no restart in the live test") }, gateway))
        flow.runCheck(family.id, "s7-live-check-unlisted-model")
        val check = flow.check
        assertNotNull(check, "the daemon ran the check: ${flow.message}")
        log.appendLine("models.check ${family.id} s7-live-check-unlisted-model: runs=${check!!.runs} error=${check.error} inputLimit=${check.inputLimit}")
        for (e in check.efforts) log.appendLine("  ${e.effort}: ${e.verdict} — ${e.evidence}")
        log.appendLine("canApprove=${flow.canApprove()} canReject=${flow.canReject()} message=${flow.message}")
        assertFalse(check.runs && flow.canApprove() != check.runs)
        File(evidence, "s7-live-check.txt").writeText(log.toString())
    }
}
