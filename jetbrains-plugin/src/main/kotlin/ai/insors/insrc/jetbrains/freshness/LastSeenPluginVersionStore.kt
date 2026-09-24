package ai.insors.insrc.jetbrains.freshness

import com.intellij.openapi.components.PersistentStateComponent
import com.intellij.openapi.components.Service
import com.intellij.openapi.components.State
import com.intellij.openapi.components.Storage

/**
 * The app-scoped, persisted last-seen-plugin-version store (Story S004 / t1) — an
 * @Service(Service.Level.APP) PersistentStateComponent modeled on
 * [SetupConsentStoreService][ai.insors.insrc.jetbrains.lifecycle.SetupConsentStoreService]
 * (same Storage file, `insrc.xml`). Obtained via `service<LastSeenPluginVersionStore>()`.
 *
 * The daemon-freshness flow compares the plugin's currently-running version against the
 * value recorded here to pick the self-update path (version changed -> auto notify-after)
 * vs the startup-check path (same version -> Update/Dismiss prompt), and records the
 * current version on every terminal path so the self-update fires exactly once per
 * plugin version (k4). The value is APPLICATION-scoped (not per-project) and survives
 * restarts. `null`/`""` before any write means "no prior version seen".
 */
@Service(Service.Level.APP)
@State(name = "InsrcDaemonSelfUpdate", storages = [Storage("insrc.xml")])
class LastSeenPluginVersionStore : PersistentStateComponent<LastSeenPluginVersionStore.State> {

    /** Persisted state — a plain mutable holder the IntelliJ serializer can read/write. */
    class State {
        @JvmField
        var lastSeenPluginVersion: String? = null
    }

    private var state = State()

    override fun getState(): State = state

    override fun loadState(state: State) {
        this.state = state
    }

    /** The last recorded plugin version, or null when none has been recorded yet. */
    fun getLastSeen(): String? = state.lastSeenPluginVersion?.takeIf { it.isNotEmpty() }

    /** Record [version] as the last-seen plugin version. */
    fun setLastSeen(version: String) {
        state.lastSeenPluginVersion = version
    }
}
