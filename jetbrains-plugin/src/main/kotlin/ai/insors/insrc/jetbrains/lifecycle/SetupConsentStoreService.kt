package ai.insors.insrc.jetbrains.lifecycle

import com.intellij.openapi.components.PersistentStateComponent
import com.intellij.openapi.components.Service
import com.intellij.openapi.components.State
import com.intellij.openapi.components.Storage

/**
 * The app-scoped, persisted one-time-consent gate (Story S003 / t3), realised as
 * an @Service(Service.Level.APP) PersistentStateComponent (the S001
 * DaemonGatewayService pattern). Downstream code obtains it via
 * `service<SetupConsentStoreService>()`.
 *
 * Consent is APPLICATION-scoped (not per-project): the developer approves insrc
 * managing its backing service once for the IDE, and it survives restarts via the
 * persisted [state]. It gates ac1 (prompt once) vs ac2 (silent thereafter).
 */
@Service(Service.Level.APP)
@State(name = "InsrcDaemonSetupConsent", storages = [Storage("insrc.xml")])
class SetupConsentStoreService :
    SetupConsentStore,
    PersistentStateComponent<SetupConsentStoreService.State> {

    /** Persisted state — a plain mutable holder the IntelliJ serializer can read/write. */
    class State {
        @JvmField
        var consented: Boolean = false
    }

    private var state = State()

    override fun getState(): State = state

    override fun loadState(state: State) {
        this.state = state
    }

    override fun isConsented(): Boolean = state.consented

    override fun recordConsent() {
        state.consented = true
    }
}
