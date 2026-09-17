package ai.insors.insrc.jetbrains.onboarding

import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertFalse
import org.junit.jupiter.api.Assertions.assertNotNull
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Test

/**
 * sc-internal OnboardingOffer seam unit test (Story S005 / t1) — platform-free. Verifies the
 * fun-interface contract the lifecycle depends on: offerEnable captures BOTH the project root and the
 * onAccept callback, and onAccept fires only when the (developer-click) callback is actually invoked,
 * never at offer time (nothing is registered until the click).
 */
class OnboardingOfferTest {

    @Test
    fun offerEnable_isAFunInterface_capturesRootAndOnAccept() {
        var capturedRoot: String? = null
        var capturedCallback: (() -> Unit)? = null
        val offer = OnboardingOffer { root, onAccept ->
            capturedRoot = root
            capturedCallback = onAccept
        }

        var accepted = false
        offer.offerEnable("/work/project") { accepted = true }

        assertEquals("/work/project", capturedRoot)
        assertNotNull(capturedCallback)
        assertFalse(accepted, "onAccept must not fire until the captured callback is invoked")

        capturedCallback!!.invoke()
        assertTrue(accepted, "invoking the captured callback runs onAccept")
    }
}
