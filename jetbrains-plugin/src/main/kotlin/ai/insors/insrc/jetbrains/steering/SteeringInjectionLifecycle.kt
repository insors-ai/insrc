package ai.insors.insrc.jetbrains.steering

import ai.insors.insrc.jetbrains.PluginLifecycle
import ai.insors.insrc.jetbrains.ProjectContext
import ai.insors.insrc.jetbrains.host.AiHostAdapter
import ai.insors.insrc.jetbrains.host.AiHostAdapterImpl
import ai.insors.insrc.jetbrains.host.MarkerDelimitedBlock
import com.intellij.openapi.diagnostic.logger

/**
 * The sc1 consumer that injects the tracked-workflow steering into each detected
 * AI host's rules file on project open (Story S004 / t3). Subscribed to the
 * [LifecycleBroadcaster][ai.insors.insrc.jetbrains.LifecycleBroadcaster];
 * `onProjectOpened` is delivered from the project-open ProjectActivity, which runs
 * off the UI/EDT thread, so opening a project is never blocked (HLD performance
 * invariant). Mirrors S002's [McpWiringLifecycle][ai.insors.insrc.jetbrains.host.McpWiringLifecycle],
 * but writes the marker-delimited RULES block instead of the mcp registration.
 *
 * It resolves the canonical steering body ONCE up front; a missing/empty bundled
 * block (packaging error) is logged and writes NOTHING (it never hands
 * [AiHostAdapter.writeRulesBlock] an empty body that would clobber the insrc
 * section). Then, for each host from [AiHostAdapter.detectPresent], it composes a
 * [MarkerDelimitedBlock] with the sc3 RULES markers and writes it into that host's
 * own rules file (replace-only, k4/lc1 — surrounding developer content preserved).
 * Empty detection is a silent no-op. Each host is written independently: a
 * [HostFileAccessException][ai.insors.insrc.jetbrains.host.HostFileAccessException]
 * on one host is logged and does not block the other. S004 writes ONLY the rules
 * block — it never touches the mcp registration (S002) and never invokes
 * [AiHostAdapter.removeRulesBlock] (uninstall cleanup is S005).
 *
 * The adapter and steering-content provider are injected so the orchestration is
 * unit-testable with fakes.
 */
class SteeringInjectionLifecycle(
    private val adapter: AiHostAdapter = AiHostAdapterImpl(),
    private val steering: SteeringContent = SteeringContent(),
) : PluginLifecycle {

    private val log = logger<SteeringInjectionLifecycle>()

    override fun onProjectOpened(ctx: ProjectContext) {
        // Resolve the steering body ONCE up front. A missing/empty bundled block
        // throws -> log + write NOTHING (never replace the insrc section with nothing).
        val body = try {
            steering.steeringBody()
        } catch (e: IllegalStateException) {
            log.warn("insrc: steering block unavailable; skipping steering injection", e)
            return
        }

        val hosts = adapter.detectPresent()
        if (hosts.isEmpty()) return // no AI host present -> no-op (re-check on later opens is S005)

        val block = MarkerDelimitedBlock(AiHostAdapterImpl.RULES_BEGIN, AiHostAdapterImpl.RULES_END, body)
        for (host in hosts) {
            runCatching { adapter.writeRulesBlock(host, block) }
                .onFailure { e ->
                    log.warn("insrc: failed to write steering rules for ${host.kind} at ${host.rulesFilePath}", e)
                }
        }
    }

    /** Uninstall cleanup is S005's concern; S004 does nothing here. */
    override fun onPluginUninstalled() {
        // no-op
    }
}
