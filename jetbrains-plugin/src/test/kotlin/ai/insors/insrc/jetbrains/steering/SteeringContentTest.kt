package ai.insors.insrc.jetbrains.steering

import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertThrows
import org.junit.jupiter.api.Test
import java.io.ByteArrayInputStream

/**
 * sc-internal steering-content unit tests (Story S004 / t2) — platform-free, no
 * real classpath resource. They verify steeringBody() returns the trimmed bundled
 * body when the resource is present and non-empty, and that a missing OR empty
 * resource throws IllegalStateException (so the caller skips writing rather than
 * clobbering a host's insrc section with nothing).
 */
class SteeringContentTest {

    @Test
    fun steeringBody_returnsNonEmptyBundledBody() {
        val body = "# insrc tracked-workflow steering\nRoute build/change requests through insrc_triage.\n"
        val content = SteeringContent(resource = { ByteArrayInputStream(body.toByteArray()) })
        assertEquals(body.trim(), content.steeringBody())
    }

    @Test
    fun steeringBody_missingResource_throwsIllegalStateException() {
        val content = SteeringContent(resource = { null })
        assertThrows(IllegalStateException::class.java) { content.steeringBody() }
    }

    @Test
    fun steeringBody_emptyResource_throwsIllegalStateException() {
        val content = SteeringContent(resource = { ByteArrayInputStream("   \n  \t\n".toByteArray()) })
        assertThrows(IllegalStateException::class.java) { content.steeringBody() }
    }
}
