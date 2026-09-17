package ai.insors.insrc.jetbrains.lifecycle

import org.junit.jupiter.api.Assertions.assertFalse
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Test

/**
 * sc-internal consent-store unit tests (Story S003 / t3) — platform-free. They
 * drive the SetupConsentStoreService instance directly (no application service
 * container) to assert the flag flips on recordConsent and round-trips through
 * the PersistentStateComponent state.
 */
class SetupConsentStoreTest {

    @Test
    fun isConsented_falseInitially_trueAfterRecord_stateRoundTrips() {
        val store = SetupConsentStoreService()
        // false initially
        assertFalse(store.isConsented())
        // true after recordConsent
        store.recordConsent()
        assertTrue(store.isConsented())
        // the flip is persisted into the component state
        assertTrue(store.state.consented)

        // loadState round-trip: a persisted consented=true state restores as consented
        val restored = SetupConsentStoreService()
        val persisted = SetupConsentStoreService.State().apply { consented = true }
        restored.loadState(persisted)
        assertTrue(restored.isConsented())
    }
}
