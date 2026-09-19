package ai.insors.insrc.jetbrains.lifecycle

import ai.insors.insrc.jetbrains.IdeKind
import ai.insors.insrc.jetbrains.LifecycleBroadcaster
import ai.insors.insrc.jetbrains.ProjectContext
import ai.insors.insrc.jetbrains.daemon.DaemonGateway
import ai.insors.insrc.jetbrains.daemon.DaemonState
import ai.insors.insrc.jetbrains.daemon.PendingQueryResult
import ai.insors.insrc.jetbrains.daemon.RegistrationResult
import com.intellij.testFramework.fixtures.BasePlatformTestCase

/**
 * sc-internal daemon-lifecycle wiring tests (Story S003 / t7). Runs inside the
 * IntelliJ Platform fixture and drives DaemonLifecycleService with fake
 * collaborators + a controllable executor, proving: ABSENT/no-consent surfaces
 * the one-click OfferSetup and does NOT auto-run (ac1); after consent a STALE open
 * runs the update silently with no prompt (ac2); CURRENT does nothing; delivery
 * via the broadcaster reaches the service; and the single-flight guard stops a
 * second concurrent trigger from launching a second installer.
 *
 * JUnit4-style (BasePlatformTestCase); run under the vintage engine.
 */
class DaemonLifecycleServiceTest : BasePlatformTestCase() {

    private class FakeGateway(private val state: DaemonState) : DaemonGateway {
        override fun probe(): DaemonState = state
        override fun isProjectRegistered(projectRootPath: String): Boolean = false
        override fun registerProject(projectRootPath: String): RegistrationResult =
            throw AssertionError("S003 must never call registerProject (that is S005)")
        override fun pendingArtifacts(projectRootPath: String): PendingQueryResult =
            throw AssertionError("S003 must never call pendingArtifacts (that is the review panel)")
    }

    private class FakeConsent(initial: Boolean) : SetupConsentStore {
        private var consented = initial
        var recordCalls = 0
        override fun isConsented(): Boolean = consented
        override fun recordConsent() { recordCalls++; consented = true }
    }

    private class RecordingProvisioner : DaemonProvisioner {
        val runs = mutableListOf<ProvisionKind>()
        var outcome = ProvisionOutcome(ok = true, exitCode = 0)
        override fun run(kind: ProvisionKind, node: NodeRuntime): ProvisionOutcome {
            runs += kind
            return outcome
        }
    }

    private val systemNode = NodeRuntime("/usr/bin/node", NodeSource.SYSTEM)
    private val ctx get() = ProjectContext(project.basePath!!, IdeKind.IDEA)
    private val syncExecute: (Runnable) -> Unit = { it.run() }

    fun testAbsentNoConsent_surfacesOfferSetup_doesNotAutoRun() {
        val consent = FakeConsent(initial = false)
        val provisioner = RecordingProvisioner()
        var offered: ProvisionKind? = null
        val service = DaemonLifecycleService(
            gateway = FakeGateway(DaemonState.ABSENT),
            consent = consent,
            resolver = { systemNode },
            provisioner = provisioner,
            offerSetup = { kind, _ -> offered = kind }, // surface the offer but DON'T accept
            notify = {},
            execute = syncExecute,
        )

        service.onProjectOpened(ctx)

        assertEquals("a one-click install offer is surfaced (ac1)", ProvisionKind.INSTALL, offered)
        assertTrue("nothing auto-runs without acceptance", provisioner.runs.isEmpty())
        assertEquals("consent is not recorded on a mere offer", 0, consent.recordCalls)
    }

    fun testAcceptingOfferRecordsConsentAndRuns() {
        val consent = FakeConsent(initial = false)
        val provisioner = RecordingProvisioner()
        val service = DaemonLifecycleService(
            gateway = FakeGateway(DaemonState.ABSENT),
            consent = consent,
            resolver = { systemNode },
            provisioner = provisioner,
            offerSetup = { _, onAccept -> onAccept() }, // accept immediately
            notify = {},
            execute = syncExecute,
        )

        service.onProjectOpened(ctx)

        assertEquals("accepting records consent (ac1)", 1, consent.recordCalls)
        assertEquals("accepting runs the install", listOf(ProvisionKind.INSTALL), provisioner.runs)
    }

    fun testAfterConsent_staleOpen_runsUpdateSilently_noPrompt_andCurrentDoesNothing() {
        val provisioner = RecordingProvisioner()
        var offerCalls = 0
        fun serviceFor(state: DaemonState) = DaemonLifecycleService(
            gateway = FakeGateway(state),
            consent = FakeConsent(initial = true),
            resolver = { systemNode },
            provisioner = provisioner,
            offerSetup = { _, _ -> offerCalls++ },
            notify = {},
            execute = syncExecute,
        )

        serviceFor(DaemonState.STALE).onProjectOpened(ctx)
        assertEquals("consented STALE runs update silently (ac2)", listOf(ProvisionKind.UPDATE), provisioner.runs)
        assertEquals("no prompt when already consented", 0, offerCalls)

        provisioner.runs.clear()
        serviceFor(DaemonState.CURRENT).onProjectOpened(ctx)
        assertTrue("CURRENT -> no provisioner call", provisioner.runs.isEmpty())
        assertEquals("CURRENT -> no prompt", 0, offerCalls)
    }

    fun testSilentFailure_surfacesNonModalNotification() {
        val provisioner = RecordingProvisioner().apply { outcome = ProvisionOutcome(ok = false, exitCode = 4, reason = "the git / npm / build step failed") }
        val notes = mutableListOf<String>()
        val service = DaemonLifecycleService(
            gateway = FakeGateway(DaemonState.STALE),
            consent = FakeConsent(initial = true),
            resolver = { systemNode },
            provisioner = provisioner,
            offerSetup = { _, _ -> },
            notify = { notes += it },
            execute = syncExecute,
        )

        service.onProjectOpened(ctx)

        assertEquals(listOf(ProvisionKind.UPDATE), provisioner.runs)
        assertEquals("a silent failure is surfaced, never a silent breakage", 1, notes.size)
        assertTrue(notes.single().contains("build"))
    }

    fun testRegisteredAsBroadcasterConsumer_isReachedViaBroadcaster() {
        val provisioner = RecordingProvisioner()
        val service = DaemonLifecycleService(
            gateway = FakeGateway(DaemonState.STALE),
            consent = FakeConsent(initial = true),
            resolver = { systemNode },
            provisioner = provisioner,
            offerSetup = { _, _ -> },
            notify = {},
            execute = syncExecute,
        )
        LifecycleBroadcaster.register(service)
        try {
            LifecycleBroadcaster.fireProjectOpened(ctx)
            assertEquals("the service is reached through the sc1 broadcaster", listOf(ProvisionKind.UPDATE), provisioner.runs)
        } finally {
            LifecycleBroadcaster.unregister(service)
        }
    }

    fun testSingleFlightGuard_secondConcurrentTrigger_doesNotLaunchSecondInstaller() {
        // A provisioner that, WHILE it is installing (guard held), fires a second
        // project-open — simulating a concurrent trigger mid-install. The guard must
        // make that second trigger a no-op, so only one install ever runs.
        lateinit var service: DaemonLifecycleService
        val runs = mutableListOf<ProvisionKind>()
        val reentrantProvisioner = object : DaemonProvisioner {
            override fun run(kind: ProvisionKind, node: NodeRuntime): ProvisionOutcome {
                runs += kind
                service.onProjectOpened(ctx) // concurrent trigger arrives while in-flight
                return ProvisionOutcome(ok = true, exitCode = 0)
            }
        }
        service = DaemonLifecycleService(
            gateway = FakeGateway(DaemonState.ABSENT),
            consent = FakeConsent(initial = true), // RunSilently -> setup runs directly
            resolver = { systemNode },
            provisioner = reentrantProvisioner,
            offerSetup = { _, _ -> },
            notify = {},
            execute = syncExecute,
        )

        service.onProjectOpened(ctx)

        assertEquals(
            "a concurrent trigger during an in-flight install does not launch a second (single-flight)",
            listOf(ProvisionKind.INSTALL),
            runs,
        )
    }
}
