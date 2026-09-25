package ai.insors.insrc.jetbrains.freshness

import ai.insors.insrc.jetbrains.daemon.DaemonActionResult
import ai.insors.insrc.jetbrains.daemon.DaemonUpdateOutcomeResult
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertFalse
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Test
import java.time.Instant

/**
 * Story S004 / t2 — unit tests for the pure DaemonFreshnessFlow over injected fakes (fake
 * FreshnessGateway, recording FreshnessNotify, fake gitLsRemote, fake PluginVersionState,
 * no-wait sleep + fixed clock). No IDE fixture, no real daemon/git — the S003TypesTest/
 * DecidePolicyTest pure-logic idiom. Covers every acceptance path (ac1-ac4) + never-throws
 * + the empty-version and stale-outcome guards.
 */
class DaemonFreshnessFlowTest {

    private companion object {
        const val INSTALLED = "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
        const val UPSTREAM = "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb"
        fun isoAt(ms: Long): String = Instant.ofEpochMilli(ms).toString()
    }

    private class FakeGateway : FreshnessGateway {
        var commit: String? = INSTALLED
        var updateResult: DaemonActionResult = DaemonActionResult.Ok()
        var outcome: DaemonUpdateOutcomeResult = DaemonUpdateOutcomeResult.None
        var commitAfterUpdate: String? = null
        var updateCalls = 0
        override fun installedCommit(): String? = commit
        override fun update(): DaemonActionResult {
            updateCalls++
            commitAfterUpdate?.let { commit = it }
            return updateResult
        }
        override fun updateOutcome(): DaemonUpdateOutcomeResult = outcome
    }

    private class RecordingNotify(private val clickUpdate: Boolean = false) : FreshnessNotify {
        val kinds = mutableListOf<NotifyKind>()
        val messages = mutableListOf<String>()
        /** Records, per show(), whether an action (onUpdate) was supplied. */
        val hasAction = mutableListOf<Boolean>()
        override fun show(kind: NotifyKind, message: String, onUpdate: (() -> Unit)?) {
            kinds += kind
            messages += message
            hasAction += (onUpdate != null)
            if (kind == NotifyKind.UPDATE_PROMPT && clickUpdate) onUpdate?.invoke()
        }
    }

    private class FakeVersionState(
        override val current: String,
        private val lastSeen: String?,
    ) : PluginVersionState {
        val saved = mutableListOf<String>()
        override fun getLastSeen(): String? = lastSeen
        override fun setLastSeen(version: String) { saved += version }
    }

    private fun deps(
        gateway: FakeGateway,
        notify: FreshnessNotify,
        versionState: PluginVersionState,
        gitLsRemote: (String, String) -> String = { _, _ -> UPSTREAM },
        now: () -> Long = { 1_000L },
        budget: Long = 5_000L,
        beginUpdate: () -> Boolean = { true },
        endUpdate: () -> Unit = {},
    ) = FreshnessDeps(
        gateway = gateway,
        gitLsRemote = gitLsRemote,
        notify = notify,
        versionState = versionState,
        daemonRoot = "/home/u/.insrc/daemon",
        reconnectBudgetMs = budget,
        pollIntervalMs = 0L,
        sleep = { /* no-wait */ },
        now = now,
        beginUpdate = beginUpdate,
        endUpdate = endUpdate,
    )

    // ---- startup-check drift (ac1) ------------------------------------------

    @Test
    fun `startup-check drift shows Update Dismiss and updates only on Update`() {
        val gateway = FakeGateway().apply { commitAfterUpdate = UPSTREAM }
        val notify = RecordingNotify(clickUpdate = true)
        val vs = FakeVersionState(current = "1.0.0", lastSeen = "1.0.0") // same version -> startup-check
        DaemonFreshnessFlow.check(deps(gateway, notify, vs))

        assertTrue(notify.kinds.contains(NotifyKind.UPDATE_PROMPT), "a drift prompt is shown (k7)")
        assertEquals(1, gateway.updateCalls, "update() runs on Update")
        assertTrue(notify.kinds.contains(NotifyKind.INFO), "a success balloon follows")
        assertEquals(listOf("1.0.0"), vs.saved)
    }

    @Test
    fun `startup-check drift on Dismiss does not update`() {
        val gateway = FakeGateway()
        val notify = RecordingNotify(clickUpdate = false) // Dismiss / no click
        val vs = FakeVersionState(current = "1.0.0", lastSeen = "1.0.0")
        DaemonFreshnessFlow.check(deps(gateway, notify, vs))

        assertEquals(0, gateway.updateCalls, "no update on Dismiss")
        assertEquals(listOf(NotifyKind.UPDATE_PROMPT), notify.kinds, "only the prompt, no further balloon")
        assertEquals(listOf("1.0.0"), vs.saved, "setLastSeen still recorded")
    }

    // ---- skip paths (ac2) ---------------------------------------------------

    @Test
    fun `skip paths show nothing and never update`() {
        // unreachable (installedCommit null)
        run {
            val g = FakeGateway().apply { commit = null }
            val n = RecordingNotify()
            val vs = FakeVersionState("1.0.0", "1.0.0")
            DaemonFreshnessFlow.check(deps(g, n, vs))
            assertEquals(0, g.updateCalls); assertTrue(n.kinds.isEmpty(), "unreachable -> nothing")
            assertEquals(listOf("1.0.0"), vs.saved, "unreachable still records the version")
        }
        // installedCommit == "" (pre-S002 / non-git root)
        run {
            val g = FakeGateway().apply { commit = "" }
            val n = RecordingNotify()
            DaemonFreshnessFlow.check(deps(g, n, FakeVersionState("1.0.0", "1.0.0")))
            assertEquals(0, g.updateCalls); assertTrue(n.kinds.isEmpty(), "'' commit -> skip")
        }
        // up to date (installed == upstream)
        run {
            val g = FakeGateway().apply { commit = UPSTREAM }
            val n = RecordingNotify()
            DaemonFreshnessFlow.check(deps(g, n, FakeVersionState("1.0.0", "1.0.0")))
            assertEquals(0, g.updateCalls); assertTrue(n.kinds.isEmpty(), "up to date -> skip")
        }
        // ls-remote returns "" and ls-remote throws
        for (git in listOf<(String, String) -> String>({ _, _ -> "" }, { _, _ -> throw RuntimeException("net down") })) {
            val g = FakeGateway()
            val n = RecordingNotify()
            DaemonFreshnessFlow.check(deps(g, n, FakeVersionState("1.0.0", "1.0.0"), gitLsRemote = git))
            assertEquals(0, g.updateCalls); assertTrue(n.kinds.isEmpty(), "ls-remote undeterminable -> skip")
        }
    }

    // ---- self-update (ac3) --------------------------------------------------

    @Test
    fun `self-update auto-updates with no prompt and records the version`() {
        val gateway = FakeGateway().apply { commitAfterUpdate = UPSTREAM }
        val notify = RecordingNotify(clickUpdate = false) // there should be NO prompt to click
        val vs = FakeVersionState(current = "2.0.0", lastSeen = "1.0.0") // version changed -> self-update
        DaemonFreshnessFlow.check(deps(gateway, notify, vs))

        assertEquals(1, gateway.updateCalls, "auto-updates without a prompt")
        assertFalse(notify.kinds.contains(NotifyKind.UPDATE_PROMPT), "no Update/Dismiss prompt in self-update mode")
        assertTrue(notify.kinds.contains(NotifyKind.INFO), "notify-after on success")
        assertEquals(listOf("2.0.0"), vs.saved)
    }

    // ---- reconnect-and-confirm success --------------------------------------

    @Test
    fun `reconnect confirms success from a fresh succeeded outcome`() {
        // commit does NOT advance in the fake; a fresh succeeded outcome is authoritative.
        val gateway = FakeGateway().apply { outcome = DaemonUpdateOutcomeResult.Loaded("succeeded", null, isoAt(2_000)) }
        val notify = RecordingNotify(clickUpdate = true)
        DaemonFreshnessFlow.check(deps(gateway, notify, FakeVersionState("1.0.0", "1.0.0"), now = { 1_000L }))
        assertTrue(notify.kinds.contains(NotifyKind.INFO), "fresh succeeded outcome -> success balloon")
    }

    // ---- failure (ac4) ------------------------------------------------------

    @Test
    fun `failure on update Failed shows exactly one failure balloon with no retry`() {
        val gateway = FakeGateway().apply { updateResult = DaemonActionResult.Failed("update already in progress") }
        val notify = RecordingNotify(clickUpdate = true)
        DaemonFreshnessFlow.check(deps(gateway, notify, FakeVersionState("1.0.0", "1.0.0")))
        assertEquals(1, gateway.updateCalls, "no retry")
        assertEquals(1, notify.kinds.count { it == NotifyKind.FAILURE }, "exactly one failure balloon")
        assertTrue(notify.messages.any { it.contains("update already in progress") }, "carries the raw error")
    }

    @Test
    fun `failure on a fresh failed outcome carries the raw error`() {
        val gateway = FakeGateway().apply { outcome = DaemonUpdateOutcomeResult.Loaded("failed", "npm run build exited 1", isoAt(2_000)) }
        val notify = RecordingNotify(clickUpdate = true)
        DaemonFreshnessFlow.check(deps(gateway, notify, FakeVersionState("1.0.0", "1.0.0"), now = { 1_000L }))
        assertEquals(1, notify.kinds.count { it == NotifyKind.FAILURE })
        assertTrue(notify.messages.any { it.contains("npm run build exited 1") })
    }

    @Test
    fun `failure on reconnect timeout shows one failure balloon and no second update`() {
        val gateway = FakeGateway() // commit never advances, outcome stays None
        val notify = RecordingNotify(clickUpdate = true)
        // budget 0 + now at/after the deadline -> the loop exits on the first pass.
        DaemonFreshnessFlow.check(deps(gateway, notify, FakeVersionState("1.0.0", "1.0.0"), now = { 1_000L }, budget = 0L))
        assertEquals(1, gateway.updateCalls, "no second update on timeout")
        assertEquals(1, notify.kinds.count { it == NotifyKind.FAILURE })
        assertTrue(notify.messages.any { it.contains("did not come back") })
    }

    // ---- never-throws + guards ----------------------------------------------

    @Test
    fun `never-throws swallows a throwing seam and still records the version`() {
        val gateway = FakeGateway()
        val throwingNotify = FreshnessNotify { _, _, _ -> throw RuntimeException("boom") }
        val vs = FakeVersionState("1.0.0", "1.0.0")
        // Must not throw.
        DaemonFreshnessFlow.check(deps(gateway, throwingNotify, vs))
        assertEquals(listOf("1.0.0"), vs.saved, "setLastSeen ran despite the throw")
    }

    @Test
    fun `empty current version falls back to the prompt path, never the silent auto path`() {
        val gateway = FakeGateway()
        val notify = RecordingNotify(clickUpdate = false)
        val vs = FakeVersionState(current = "", lastSeen = null) // undeterminable version + first run
        DaemonFreshnessFlow.check(deps(gateway, notify, vs))
        assertEquals(listOf(NotifyKind.UPDATE_PROMPT), notify.kinds, "'' version -> prompt, not silent auto")
        assertEquals(0, gateway.updateCalls, "dismissed -> no update")
    }

    @Test
    fun `the single-flight gate skips the update when another is already in flight (no competing update, no balloon)`() {
        // Simulates a second concurrent multi-window check: the gate is already held, so
        // beginUpdate returns false -> performUpdate skips silently (MED-1).
        val gateway = FakeGateway().apply { commitAfterUpdate = UPSTREAM }
        val notify = RecordingNotify(clickUpdate = false)
        val vs = FakeVersionState(current = "2.0.0", lastSeen = "1.0.0") // self-update mode
        var endCalls = 0
        DaemonFreshnessFlow.check(
            deps(gateway, notify, vs, beginUpdate = { false }, endUpdate = { endCalls++ }),
        )
        assertEquals(0, gateway.updateCalls, "loser does not launch a competing update")
        assertTrue(notify.kinds.isEmpty(), "no failure balloon during a healthy concurrent update")
        assertEquals(0, endCalls, "endUpdate is not called when the gate was never acquired")
        assertEquals(listOf("2.0.0"), vs.saved, "still records the version so it does not re-fire")
    }

    @Test
    fun `the single-flight gate is released after the update completes`() {
        val gateway = FakeGateway().apply { commitAfterUpdate = UPSTREAM }
        val notify = RecordingNotify(clickUpdate = true)
        var begun = false
        var endCalls = 0
        DaemonFreshnessFlow.check(
            deps(gateway, notify, FakeVersionState("1.0.0", "1.0.0"),
                beginUpdate = { begun = true; true }, endUpdate = { endCalls++ }),
        )
        assertTrue(begun, "the winner acquires the gate")
        assertEquals(1, endCalls, "the gate is released exactly once after the update")
    }

    // ---- post-update MCP-reload nudge (S001) --------------------------------

    @Test
    fun `on a confirmed update the success balloon carries the reload-nudge message and no action`() {
        val gateway = FakeGateway().apply { commitAfterUpdate = UPSTREAM }
        val notify = RecordingNotify(clickUpdate = true)
        DaemonFreshnessFlow.check(deps(gateway, notify, FakeVersionState("1.0.0", "1.0.0")))

        val idx = notify.messages.indexOf(DaemonFreshnessFlow.RELOAD_NUDGE_MESSAGE)
        assertTrue(idx >= 0, "the exact reload-nudge message is shown on success")
        assertEquals(NotifyKind.INFO, notify.kinds[idx], "the nudge is an INFO balloon")
        assertFalse(notify.hasAction[idx], "the nudge is notification-only (null action slot)")
    }

    @Test
    fun `no reload nudge on a no-op or a failed update`() {
        // no-op: installed == upstream -> skip, no nudge.
        run {
            val g = FakeGateway().apply { commit = UPSTREAM }
            val n = RecordingNotify()
            DaemonFreshnessFlow.check(deps(g, n, FakeVersionState("1.0.0", "1.0.0")))
            assertFalse(n.messages.contains(DaemonFreshnessFlow.RELOAD_NUDGE_MESSAGE), "no nudge when already current")
        }
        // failed: commit never advances + no outcome -> failure balloon, not the nudge.
        run {
            val g = FakeGateway()
            val n = RecordingNotify(clickUpdate = true)
            DaemonFreshnessFlow.check(deps(g, n, FakeVersionState("1.0.0", "1.0.0"), now = { 1_000L }, budget = 0L))
            assertFalse(n.messages.contains(DaemonFreshnessFlow.RELOAD_NUDGE_MESSAGE), "no nudge on a failed update")
            assertEquals(1, n.kinds.count { it == NotifyKind.FAILURE }, "a failure balloon is shown instead")
        }
    }

    @Test
    fun `the self-update nudge records the plugin version so it does not silently re-fire`() {
        // A self-update fires the nudge once and records the current version via setLastSeen;
        // a later activation on the SAME version then sees current == lastSeen -> startup-check
        // (prompt), never another silent auto-nudge. Here we prove the version is recorded.
        val gateway = FakeGateway().apply { commitAfterUpdate = UPSTREAM }
        val notify = RecordingNotify(clickUpdate = false) // no click -> self-update path only
        val vs = FakeVersionState(current = "2.0.0", lastSeen = "1.0.0") // version changed -> self-update
        DaemonFreshnessFlow.check(deps(gateway, notify, vs))
        assertEquals(1, gateway.updateCalls, "the self-update fired once")
        assertTrue(notify.messages.contains(DaemonFreshnessFlow.RELOAD_NUDGE_MESSAGE), "the nudge fired on the self-update")
        assertEquals(listOf("2.0.0"), vs.saved, "setLastSeen(current) records the version so it does not silently re-fire")
    }

    @Test
    fun `a stale outcome is ignored and commit-advance decides success`() {
        val gateway = FakeGateway().apply {
            commitAfterUpdate = UPSTREAM
            // finishedAt is BEFORE the update start (now()=5000) -> stale -> ignored.
            outcome = DaemonUpdateOutcomeResult.Loaded("failed", "old failure", isoAt(1_000))
        }
        val notify = RecordingNotify(clickUpdate = true)
        DaemonFreshnessFlow.check(deps(gateway, notify, FakeVersionState("1.0.0", "1.0.0"), now = { 5_000L }))
        assertTrue(notify.kinds.contains(NotifyKind.INFO), "stale failed outcome ignored; commit advance -> success")
        assertFalse(notify.kinds.contains(NotifyKind.FAILURE), "the stale failure never surfaces")
    }
}
