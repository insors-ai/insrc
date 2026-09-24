package ai.insors.insrc.jetbrains.freshness

import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertNull
import org.junit.jupiter.api.Test

/**
 * Story S004 / t1 — unit tests for the persisted last-seen-plugin-version store. Plain
 * JUnit5 over the store + its @State holder (no IDE fixture / application service lookup):
 * null before any write, the persisted value after setLastSeen, and a getState/loadState
 * round-trip of the lastSeenPluginVersion string.
 */
class LastSeenPluginVersionStoreTest {

    @Test
    fun `getLastSeen is null before any write and returns the value after setLastSeen`() {
        val store = LastSeenPluginVersionStore()
        assertNull(store.getLastSeen(), "no version recorded yet")
        store.setLastSeen("0.4.0")
        assertEquals("0.4.0", store.getLastSeen())
    }

    @Test
    fun `an empty recorded value reads back as null (treated as no prior version)`() {
        val store = LastSeenPluginVersionStore()
        store.setLastSeen("")
        assertNull(store.getLastSeen(), "'' is not a real prior version")
    }

    @Test
    fun `getState-loadState round-trips the lastSeenPluginVersion`() {
        val source = LastSeenPluginVersionStore()
        source.setLastSeen("1.2.3")

        val restored = LastSeenPluginVersionStore()
        restored.loadState(source.state)

        assertEquals("1.2.3", restored.getLastSeen())
        assertEquals("1.2.3", restored.state.lastSeenPluginVersion)
    }
}
