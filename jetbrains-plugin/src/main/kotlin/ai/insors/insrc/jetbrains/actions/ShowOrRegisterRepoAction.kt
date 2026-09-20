package ai.insors.insrc.jetbrains.actions

import ai.insors.insrc.jetbrains.daemon.DaemonGatewayService
import ai.insors.insrc.jetbrains.daemon.DaemonUnavailableException
import com.intellij.openapi.actionSystem.ActionUpdateThread
import com.intellij.openapi.actionSystem.AnAction
import com.intellij.openapi.actionSystem.AnActionEvent
import com.intellij.openapi.components.service
import com.intellij.openapi.util.Key

/**
 * The insrc Project-view context-menu entry (Story
 * jetbrains-plugin-add-insrc-entry-project / S001) — the plugin's FIRST AnAction.
 *
 * The label is DYNAMIC: when the open project's root is already a registered
 * insrc repo it reads "Show Repo status" (and opens the rich repo.stats popup);
 * otherwise it reads "Register Repo" (and opens the register popup). The
 * registration probe is a local socket round-trip, so [getActionUpdateThread] is
 * [ActionUpdateThread.BGT] — [update] does it OFF the EDT and stashes the result
 * on the presentation. [actionPerformed] then REUSES that flag rather than
 * re-probing, so the EDT never makes a blocking socket call. A daemon that cannot
 * be reached (or a malformed reply) defaults to "Register Repo" (the safe offer).
 */
class ShowOrRegisterRepoAction : AnAction() {

    override fun getActionUpdateThread(): ActionUpdateThread = ActionUpdateThread.BGT

    override fun update(e: AnActionEvent) {
        val root = e.project?.basePath?.takeIf { it.isNotBlank() }
        if (root == null) {
            // No resolvable project root (light/default/rootless window) — hide the item.
            e.presentation.isEnabledAndVisible = false
            return
        }
        e.presentation.isEnabledAndVisible = true
        val registered = probeRegistered(root)
        // Stash the BGT-computed state so actionPerformed reuses it (no EDT socket call).
        e.presentation.putClientProperty(REGISTERED_KEY, registered)
        e.presentation.text = if (registered) "Show Repo status" else "Register Repo"
    }

    override fun actionPerformed(e: AnActionEvent) {
        val project = e.project ?: return
        val root = project.basePath?.takeIf { it.isNotBlank() } ?: return
        // Reuse the registration flag update() computed OFF the EDT (BGT) moments
        // before the menu opened — never re-probe here (that would be a blocking
        // socket round-trip on the EDT). Absent (defensive) => the safe register offer.
        val registered = e.presentation.getClientProperty(REGISTERED_KEY) ?: false
        if (registered) {
            RepoStatusDialog(project, root).show()
        } else {
            RegisterRepoDialog(project, root).show()
        }
    }

    /**
     * The registration probe, run only on the BGT update thread. Never throws: a
     * DaemonUnavailableException OR any other transport fault (e.g. a malformed
     * reply surfaced as a plain RuntimeException by the socket parse) defaults to
     * false — offer registration when membership cannot be confirmed.
     */
    private fun probeRegistered(root: String): Boolean =
        try {
            service<DaemonGatewayService>().isProjectRegistered(root)
        } catch (ex: DaemonUnavailableException) {
            false
        } catch (ex: RuntimeException) {
            false
        }

    private companion object {
        private val REGISTERED_KEY: Key<Boolean> = Key.create("insrc.showOrRegisterRepo.registered")
    }
}
