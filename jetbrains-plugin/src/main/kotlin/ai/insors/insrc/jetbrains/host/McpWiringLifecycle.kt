package ai.insors.insrc.jetbrains.host

import ai.insors.insrc.jetbrains.PluginLifecycle
import ai.insors.insrc.jetbrains.ProjectContext
import com.intellij.openapi.diagnostic.logger

/**
 * The sc1 consumer that wires insrc-mcp into each detected host on project open
 * (Story S002 / t5). Subscribed to the [LifecycleBroadcaster][ai.insors.insrc.jetbrains.LifecycleBroadcaster];
 * `onProjectOpened` is delivered from the project-open [ProjectActivity][ai.insors.insrc.jetbrains.platform.InsrcProjectOpenActivity],
 * which runs off the UI/EDT thread, so opening a project is never blocked (HLD
 * performance invariant).
 *
 * For each host from [AiHostAdapter.detectPresent] it composes the
 * [InsrcMcpRegistration] with the active project's root and writes it into that
 * host's [HostFile.MCP] file. Empty detection is a silent no-op. Each host is
 * wired independently: a [HostFileAccessException] on one host is logged and does
 * not block the other. S002 writes ONLY the 'mcp' file — the 'rules' write is
 * S004 and uninstall cleanup (removeBlock) is S005.
 */
class McpWiringLifecycle(
    private val adapter: AiHostAdapter = AiHostAdapterImpl(),
    private val launchTargetProvider: () -> String? = InsrcMcpLaunchTarget::resolve,
) : PluginLifecycle {

    private val log = logger<McpWiringLifecycle>()

    override fun onProjectOpened(ctx: ProjectContext) {
        val hosts = adapter.detectPresent()
        if (hosts.isEmpty()) return // no AI host present -> no-op (re-check on later opens is S005)

        val launchTarget = launchTargetProvider()
        for (host in hosts) {
            val block = InsrcMcpRegistration.compose(ctx.projectRootPath, launchTarget) ?: continue
            runCatching { adapter.writeBlock(host, HostFile.MCP, block) }
                .onFailure { e ->
                    log.warn("insrc: failed to wire mcp registration for ${host.kind} at ${host.mcpConfigPath}", e)
                }
        }
    }

    /** Uninstall cleanup is S005's concern; S002 does nothing here. */
    override fun onPluginUninstalled() {
        // no-op
    }
}
