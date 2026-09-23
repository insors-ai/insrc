package ai.insors.insrc.jetbrains.onboarding

import ai.insors.insrc.jetbrains.IdeKind
import ai.insors.insrc.jetbrains.ProjectContext
import ai.insors.insrc.jetbrains.daemon.DaemonGateway
import ai.insors.insrc.jetbrains.daemon.ModelListResult
import ai.insors.insrc.jetbrains.daemon.SteeringSelection
import ai.insors.insrc.jetbrains.daemon.RepoStatsResult
import ai.insors.insrc.jetbrains.daemon.DaemonStatusResult
import ai.insors.insrc.jetbrains.daemon.DebugStatusResult
import ai.insors.insrc.jetbrains.daemon.DaemonActionResult
import ai.insors.insrc.jetbrains.daemon.ApproveResult
import ai.insors.insrc.jetbrains.daemon.SaveResult
import ai.insors.insrc.jetbrains.daemon.PerRoleOverridesResult
import ai.insors.insrc.jetbrains.daemon.PerRepoOverridesResult
import ai.insors.insrc.jetbrains.daemon.RegisteredReposResult
import ai.insors.insrc.jetbrains.daemon.SettingsCatalogResult
import ai.insors.insrc.jetbrains.daemon.ArtifactContentResult
import ai.insors.insrc.jetbrains.daemon.ResolveCommentResult
import ai.insors.insrc.jetbrains.daemon.ReviewCommentDto
import ai.insors.insrc.jetbrains.daemon.DaemonState
import ai.insors.insrc.jetbrains.daemon.PendingQueryResult
import ai.insors.insrc.jetbrains.daemon.DaemonUnavailableException
import ai.insors.insrc.jetbrains.daemon.RegistrationResult
import ai.insors.insrc.jetbrains.host.AiHost
import ai.insors.insrc.jetbrains.host.AiHostAdapter
import ai.insors.insrc.jetbrains.host.AiHostKind
import ai.insors.insrc.jetbrains.host.HostFileAccessException
import ai.insors.insrc.jetbrains.host.MarkerDelimitedBlock
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertNull
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Test

/**
 * sc-internal onboarding-orchestration unit tests (Story S005 / t2 + t4 Wave A) — platform-free,
 * against injected fakes (no IDE fixture, no real host file, no real daemon). They verify the offer
 * gating (ac1/ac2/ac3), that registerProject runs ONLY from the accept-callback, the
 * DaemonUnavailableException / RegistrationResult(false) handling, and the per-host uninstall cleanup
 * with isolation and zero writes (ac4).
 */
class OnboardingLifecycleTest {

    private val CTX = ProjectContext("/work/project", IdeKind.IDEA)

    private fun host(kind: AiHostKind) = AiHost(kind, "/tmp/${kind.name}/mcp.json", "/tmp/${kind.name}/rules.md")

    /** Fake sc2 gateway: scripts isProjectRegistered + registerProject; records the register call. */
    private class FakeGateway(
        private val registeredAnswer: Boolean = false,
        private val isRegisteredThrows: Boolean = false,
        private val registerResult: RegistrationResult = RegistrationResult(true),
        private val registerThrows: Boolean = false,
    ) : DaemonGateway {
        var isRegisteredCalls = 0
        val registerCalls = mutableListOf<String>()
        override fun probe(): DaemonState = DaemonState.CURRENT
        override fun isProjectRegistered(projectRootPath: String): Boolean {
            isRegisteredCalls++
            if (isRegisteredThrows) throw DaemonUnavailableException("insrc-test: daemon down")
            return registeredAnswer
        }
        override fun registerProject(projectRootPath: String, steering: SteeringSelection?): RegistrationResult {
            registerCalls += projectRootPath
            if (registerThrows) throw DaemonUnavailableException("insrc-test: daemon down at accept")
            return registerResult
        }
        override fun repoStats(projectRootPath: String): RepoStatsResult =
            RepoStatsResult.Unavailable("not used in this test")
        override fun pendingArtifacts(projectRootPath: String): PendingQueryResult =
            PendingQueryResult.Available(emptyList())
        override fun artifactReviewView(projectRootPath: String, mdPath: String): ArtifactContentResult =
            ArtifactContentResult.Unavailable("not used in this test")

        override fun resolveComment(projectRootPath: String, artifactId: String, comments: List<ReviewCommentDto>): ResolveCommentResult =
            ResolveCommentResult.Unavailable("not used in this test")

        override fun approve(projectRootPath: String, mdPath: String, overrideReason: String?): ApproveResult =
            ApproveResult.Unavailable("not used in this test")
        override fun settingsCatalog(): SettingsCatalogResult =
            SettingsCatalogResult.Unavailable("not used in this test")
        override fun writeSetting(pathSegments: List<String>, value: Any?): SaveResult =
            SaveResult.Unavailable("not used in this test")
        override fun clearSetting(pathSegments: List<String>): SaveResult =
            SaveResult.Unavailable("not used in this test")
        override fun perRoleOverrides(): PerRoleOverridesResult =
            PerRoleOverridesResult.Unavailable("not used in this test")
        override fun perRepoOverrides(): PerRepoOverridesResult =
            PerRepoOverridesResult.Unavailable("not used in this test")
        override fun registeredRepos(): RegisteredReposResult =
            RegisteredReposResult.Unavailable("not used in this test")

        override fun listModels(provider: String): ModelListResult = ModelListResult.Unavailable("not used in this test")
        override fun daemonStatus(): DaemonStatusResult = DaemonStatusResult.Unavailable("not used in this test")
        override fun debugStatus(): DebugStatusResult = DebugStatusResult.Unavailable("not used in this test")
        override fun shutdown(): DaemonActionResult = DaemonActionResult.Failed("not used in this test")
        override fun backup(targetDir: String): DaemonActionResult = DaemonActionResult.Failed("not used in this test")
        override fun compact(): DaemonActionResult = DaemonActionResult.Failed("not used in this test")
    }

    /** Recording sc3 adapter: scripts detectPresent; records removals; asserts writes never happen. */
    private class RecordingAdapter(
        private val hosts: List<AiHost>,
        private val removeFailFor: AiHostKind? = null,
    ) : AiHostAdapter {
        val mcpRemovals = mutableListOf<AiHost>()
        val rulesRemovals = mutableListOf<AiHost>()
        var mcpWriteCalls = 0
        var rulesWriteCalls = 0
        override fun detectPresent(): List<AiHost> = hosts
        override fun writeMcpRegistration(host: AiHost, serverEntryJson: String) { mcpWriteCalls++ }
        override fun removeMcpRegistration(host: AiHost) {
            if (host.kind == removeFailFor) throw HostFileAccessException("insrc-test: mcp remove failed")
            mcpRemovals += host
        }
        override fun writeRulesBlock(host: AiHost, block: MarkerDelimitedBlock) { rulesWriteCalls++ }
        override fun removeRulesBlock(host: AiHost) { rulesRemovals += host }
    }

    /** Fake offer capturing (root, onAccept) so the test drives the accept path deterministically. */
    private class RecordingOffer : OnboardingOffer {
        val offeredRoots = mutableListOf<String>()
        var lastCallback: (() -> Unit)? = null
        override fun offerEnable(projectRootPath: String, onAccept: () -> Unit) {
            offeredRoots += projectRootPath
            lastCallback = onAccept
        }
    }

    private class RecordingNotify {
        val messages = mutableListOf<String>()
        fun sink(): (String) -> Unit = { messages += it }
    }

    /** Synchronous executor so off-EDT dispatch runs inline in the test. */
    private val sync: (Runnable) -> Unit = { it.run() }

    private fun lifecycle(
        gateway: DaemonGateway,
        adapter: AiHostAdapter,
        offer: OnboardingOffer,
        notify: (String) -> Unit,
    ) = OnboardingLifecycle(gateway, adapter, offer, notify, sync)

    @Test
    fun hostPresentUnregistered_offersOnce_registersNothingUntilAccept() {
        val gateway = FakeGateway(registeredAnswer = false)
        val offer = RecordingOffer()
        lifecycle(gateway, RecordingAdapter(listOf(host(AiHostKind.AI_ASSISTANT))), offer, RecordingNotify().sink())
            .onProjectOpened(CTX)

        assertEquals(listOf("/work/project"), offer.offeredRoots)
        assertTrue(gateway.registerCalls.isEmpty(), "registerProject must not run until the developer accepts")
    }

    @Test
    fun acceptCallback_registersOnce_reportsResult() {
        val gateway = FakeGateway(registeredAnswer = false, registerResult = RegistrationResult(true))
        val offer = RecordingOffer()
        val notify = RecordingNotify()
        lifecycle(gateway, RecordingAdapter(listOf(host(AiHostKind.JUNIE))), offer, notify.sink()).onProjectOpened(CTX)

        offer.lastCallback!!.invoke() // developer clicks Enable

        assertEquals(listOf("/work/project"), gateway.registerCalls)
        assertTrue(notify.messages.any { it.contains("enabled", ignoreCase = true) }, "success is reported")
    }

    @Test
    fun emptyDetectPresent_noOffer_noop() {
        val gateway = FakeGateway()
        val offer = RecordingOffer()
        lifecycle(gateway, RecordingAdapter(emptyList()), offer, RecordingNotify().sink()).onProjectOpened(CTX)

        assertTrue(offer.offeredRoots.isEmpty(), "no host -> no offer")
        assertEquals(0, gateway.isRegisteredCalls, "no host -> the gateway is never queried")
    }

    @Test
    fun alreadyRegistered_noOffer() {
        val gateway = FakeGateway(registeredAnswer = true)
        val offer = RecordingOffer()
        lifecycle(gateway, RecordingAdapter(listOf(host(AiHostKind.AI_ASSISTANT))), offer, RecordingNotify().sink())
            .onProjectOpened(CTX)

        assertTrue(offer.offeredRoots.isEmpty(), "already registered -> no offer")
        assertTrue(gateway.registerCalls.isEmpty())
    }

    @Test
    fun isProjectRegisteredThrows_caught_noOffer() {
        val gateway = FakeGateway(isRegisteredThrows = true)
        val offer = RecordingOffer()
        // Must not throw out of onProjectOpened.
        lifecycle(gateway, RecordingAdapter(listOf(host(AiHostKind.AI_ASSISTANT))), offer, RecordingNotify().sink())
            .onProjectOpened(CTX)

        assertTrue(offer.offeredRoots.isEmpty(), "daemon unreachable -> no offer, re-checked later")
    }

    @Test
    fun registerProjectThrows_caught_failureNotification_noCrash() {
        val gateway = FakeGateway(registeredAnswer = false, registerThrows = true)
        val offer = RecordingOffer()
        val notify = RecordingNotify()
        lifecycle(gateway, RecordingAdapter(listOf(host(AiHostKind.AI_ASSISTANT))), offer, notify.sink()).onProjectOpened(CTX)

        offer.lastCallback!!.invoke() // click -> registerProject throws

        assertTrue(notify.messages.any { it.contains("could not reach", ignoreCase = true) }, "failure is reported, no crash")
    }

    @Test
    fun registrationRejected_surfacesReason() {
        val gateway = FakeGateway(registeredAnswer = false, registerResult = RegistrationResult(false, "path is not indexable"))
        val offer = RecordingOffer()
        val notify = RecordingNotify()
        lifecycle(gateway, RecordingAdapter(listOf(host(AiHostKind.AI_ASSISTANT))), offer, notify.sink()).onProjectOpened(CTX)

        offer.lastCallback!!.invoke()

        assertTrue(notify.messages.any { it.contains("path is not indexable") }, "backend reason is surfaced")
    }

    @Test
    fun onPluginUninstalled_removesMcpAndRulesPerHost_zeroWrites() {
        val a = host(AiHostKind.AI_ASSISTANT)
        val b = host(AiHostKind.JUNIE)
        val adapter = RecordingAdapter(listOf(a, b))
        lifecycle(FakeGateway(), adapter, RecordingOffer(), RecordingNotify().sink()).onPluginUninstalled()

        assertEquals(listOf(a, b), adapter.mcpRemovals)
        assertEquals(listOf(a, b), adapter.rulesRemovals)
        assertEquals(0, adapter.mcpWriteCalls, "S005 never writes the mcp file")
        assertEquals(0, adapter.rulesWriteCalls, "S005 never writes the rules file")
    }

    @Test
    fun onPluginUninstalled_emptyDetect_noop() {
        val adapter = RecordingAdapter(emptyList())
        lifecycle(FakeGateway(), adapter, RecordingOffer(), RecordingNotify().sink()).onPluginUninstalled()

        assertTrue(adapter.mcpRemovals.isEmpty())
        assertTrue(adapter.rulesRemovals.isEmpty())
    }

    @Test
    fun perHostRemovalException_isolated_otherHostStillCleaned() {
        val a = host(AiHostKind.AI_ASSISTANT) // its mcp removal throws
        val b = host(AiHostKind.JUNIE)        // must still be fully cleaned
        val adapter = RecordingAdapter(listOf(a, b), removeFailFor = AiHostKind.AI_ASSISTANT)
        lifecycle(FakeGateway(), adapter, RecordingOffer(), RecordingNotify().sink()).onPluginUninstalled()

        // host a's mcp removal threw, but its rules removal is independent (own runCatching) and still
        // runs; host b is fully cleaned. So the (writable) rules file is restored even when the mcp
        // removal fails, and neither host blocks the other.
        assertEquals(listOf(b), adapter.mcpRemovals, "host a's mcp removal threw; host b's succeeded")
        assertEquals(listOf(a, b), adapter.rulesRemovals, "host a's rules removal still ran (independent of its mcp removal)")
        assertNull(adapter.mcpRemovals.firstOrNull { it.kind == AiHostKind.AI_ASSISTANT })
    }
}
