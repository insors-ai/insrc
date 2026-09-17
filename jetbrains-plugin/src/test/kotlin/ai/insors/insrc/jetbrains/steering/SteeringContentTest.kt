package ai.insors.insrc.jetbrains.steering

import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertThrows
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Test
import java.io.ByteArrayInputStream

/**
 * sc-internal steering-content unit tests (Story S004 / t2) — platform-free. They
 * verify steeringBody() returns the trimmed bundled body when the resource is present
 * and non-empty, that a missing OR empty resource throws IllegalStateException (so the
 * caller skips writing rather than clobbering a host's insrc section with nothing), and
 * — via the DEFAULT constructor — that the Gradle-bundled canonical block is actually
 * on the plugin classpath at /insrc/steering-block.md (t1 packaging contract: a bundle
 * regression turns this red instead of silently no-op-ing steering injection in prod).
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

    /**
     * t1 packaging contract: the DEFAULT SteeringContent (real classpath accessor) must
     * find the Gradle-bundled canonical block at /insrc/steering-block.md and return a
     * non-trivial body. Guards against a silent bundling regression — if the bundle
     * breaks, steeringBody() would throw and steering injection would no-op invisibly in
     * production; this makes that a red test instead.
     */
    @Test
    fun steeringBody_default_readsBundledClasspathResource() {
        val body = SteeringContent().steeringBody()
        assertTrue(body.length > 200, "bundled steering body is substantial")
        assertTrue(body.contains("insrc_triage"), "bundled steering body references the insrc tracked-workflow tools")
    }
}
