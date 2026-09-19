package ai.insors.insrc.jetbrains.review

import ai.insors.insrc.jetbrains.daemon.ArtifactContentResult
import ai.insors.insrc.jetbrains.daemon.ArtifactReviewViewDto
import ai.insors.insrc.jetbrains.daemon.DaemonGatewayImpl
import ai.insors.insrc.jetbrains.daemon.DaemonResult
import ai.insors.insrc.jetbrains.daemon.DaemonRpc
import ai.insors.insrc.jetbrains.daemon.DaemonUnavailableException
import ai.insors.insrc.jetbrains.daemon.UnixSocketDaemonRpc
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertFalse
import org.junit.jupiter.api.Assertions.assertInstanceOf
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Test

/**
 * S002 plugin tests (Epic ide-artifact-review-panel).
 *
 * t3: [DaemonGatewayImpl.artifactReviewView] over a fake [DaemonRpc] — ok(view)
 * -> Loaded (verbatim), ok=false / DaemonUnavailable / malformed -> Unavailable
 * (never a blank Loaded). Plus the REAL [UnixSocketDaemonRpc.parse] across the
 * framing boundary the fake tests never cross ({result:{view}} -> Loaded;
 * {result:{error}} -> Unavailable — the S001 lesson).
 *
 * t5: the pure [ArtifactContentViews.of] + [renderModeFor] mappers (headless).
 */
class ArtifactContentTest {

    private class FakeDaemonRpc(private val handler: (String, Map<String, Any?>) -> DaemonResult) : DaemonRpc {
        override fun call(method: String, params: Map<String, Any?>): DaemonResult = handler(method, params)
    }

    private fun viewData(): Map<String, Any?> = mapOf(
        "artifactId" to "LLD-h-s2",
        "kind" to "LLD",
        "renderedMarkdown" to "# Title\n\nbody",
        "openQuestions" to listOf(
            mapOf("id" to "q1", "text" to "First?", "status" to "open"),
            mapOf("id" to "q2", "text" to "Second?", "status" to "resolved"),
        ),
        "approvable" to true,
        "blockReason" to null,
    )

    // ---- t3 -----------------------------------------------------------------

    @Test
    fun `artifactReviewView maps ok(view) to Loaded, forwarding the view verbatim`() {
        val rpc = FakeDaemonRpc { method, params ->
            assertEquals("workflow.artifactContent", method)
            assertEquals("/home/dev/proj", params["repo"])
            assertEquals("docs/epics/x/S002/LLD.md", params["mdPath"])
            DaemonResult(ok = true, data = viewData())
        }
        val result = DaemonGatewayImpl(rpc).artifactReviewView("/home/dev/proj", "docs/epics/x/S002/LLD.md")
        val loaded = assertInstanceOf(ArtifactContentResult.Loaded::class.java, result)
        assertEquals(
            ArtifactReviewViewDto(
                artifactId = "LLD-h-s2", kind = "LLD", renderedMarkdown = "# Title\n\nbody",
                openQuestions = listOf(
                    ai.insors.insrc.jetbrains.daemon.OpenQuestionDto("q1", "First?", "open"),
                    ai.insors.insrc.jetbrains.daemon.OpenQuestionDto("q2", "Second?", "resolved"),
                ),
                approvable = true, blockReason = null,
            ),
            loaded.view,
        )
    }

    @Test
    fun `artifactReviewView maps ok=false to Unavailable, never a blank Loaded`() {
        val rpc = FakeDaemonRpc { _, _ -> DaemonResult(ok = false, error = "workflow.artifactContent: `mdPath` is required") }
        val result = DaemonGatewayImpl(rpc).artifactReviewView("/home/dev/proj", "")
        val unavailable = assertInstanceOf(ArtifactContentResult.Unavailable::class.java, result)
        assertEquals("workflow.artifactContent: `mdPath` is required", unavailable.reason)
    }

    @Test
    fun `artifactReviewView maps DaemonUnavailableException to Unavailable`() {
        val rpc = FakeDaemonRpc { _, _ -> throw DaemonUnavailableException("socket down") }
        val result = DaemonGatewayImpl(rpc).artifactReviewView("/home/dev/proj", "docs/x/LLD.md")
        assertEquals("socket down", assertInstanceOf(ArtifactContentResult.Unavailable::class.java, result).reason)
    }

    @Test
    fun `artifactReviewView degrades a malformed payload safely (not a throw)`() {
        // ok=true but blockReason absent + approvable missing -> approvable defaults false, no crash.
        val rpc = FakeDaemonRpc { _, _ -> DaemonResult(ok = true, data = mapOf("artifactId" to "DEF-h", "kind" to "DEF")) }
        val result = DaemonGatewayImpl(rpc).artifactReviewView("/home/dev/proj", "docs/x/DEF.md")
        val loaded = assertInstanceOf(ArtifactContentResult.Loaded::class.java, result)
        assertEquals("", loaded.view.renderedMarkdown)
        assertTrue(loaded.view.openQuestions.isEmpty())
        assertFalse(loaded.view.approvable)   // safe default: not approvable unless the daemon says so
    }

    // ---- t3: real parse across the framing boundary -------------------------

    private class WireRpc(private val reply: String) : DaemonRpc {
        private val parser = UnixSocketDaemonRpc()
        override fun call(method: String, params: Map<String, Any?>): DaemonResult = parser.parse(reply)
    }

    @Test
    fun `over the real parse, a daemon structured error maps to Unavailable, not a blank Loaded`() {
        val reply = """{"id":1,"result":{"error":"workflow.artifactContent: mdPath must resolve under docs/"}}"""
        val result = DaemonGatewayImpl(WireRpc(reply)).artifactReviewView("/home/dev/proj", "../escape.md")
        val unavailable = assertInstanceOf(ArtifactContentResult.Unavailable::class.java, result)
        assertEquals("workflow.artifactContent: mdPath must resolve under docs/", unavailable.reason)
    }

    @Test
    fun `over the real parse, a view payload maps to Loaded with the fields`() {
        val reply = """{"id":1,"result":{"artifactId":"LLD-h-s2","kind":"LLD","renderedMarkdown":"# T","openQuestions":[{"id":"q1","text":"Q?","status":"open"}],"approvable":true,"blockReason":null}}"""
        val result = DaemonGatewayImpl(WireRpc(reply)).artifactReviewView("/home/dev/proj", "docs/x/LLD.md")
        val loaded = assertInstanceOf(ArtifactContentResult.Loaded::class.java, result)
        assertEquals("LLD", loaded.view.kind)
        assertEquals("# T", loaded.view.renderedMarkdown)
        assertEquals(1, loaded.view.openQuestions.size)
        assertEquals("open", loaded.view.openQuestions[0].status)
        assertTrue(loaded.view.approvable)
    }

    // ---- t5: pure mappers ---------------------------------------------------

    @Test
    fun `ArtifactContentViews maps Loaded to Rendered and Unavailable to Unavailable`() {
        val dto = ArtifactReviewViewDto("LLD-h-s2", "LLD", "# T", emptyList(), true, null)
        assertEquals(
            ArtifactContentView.Rendered(dto),
            ArtifactContentViews.of(ArtifactContentResult.Loaded(dto)),
        )
        val unavailable = ArtifactContentViews.of(ArtifactContentResult.Unavailable("boom"))
        assertEquals(ArtifactContentView.Unavailable("boom"), unavailable)
        assertTrue(unavailable is ArtifactContentView.Unavailable)   // never collapses to Rendered/blank
    }

    @Test
    fun `renderModeFor selects JCEF when supported and the native fallback otherwise`() {
        assertEquals(RenderMode.JCEF_HTML, renderModeFor(true))
        assertEquals(RenderMode.NATIVE_FALLBACK, renderModeFor(false))
    }

    // ---- t4: the XSS-critical inline-script escaper -------------------------

    @Test
    fun `jsStringLiteral neutralizes a script-close breakout and never emits a raw closing tag`() {
        val out = jsStringLiteral("payload </script><img src=x onerror=alert(1)>")
        // The literal "</script>" (and any "<"/">") must not survive raw — else it
        // would close the inline <script> and inject active markup.
        assertFalse(out.contains("</script>"), "raw </script> must not survive")
        assertFalse(out.contains("<"), "raw '<' must not survive")
        assertFalse(out.contains(">"), "raw '>' must not survive")
        assertTrue(out.contains("\\u003C/script\\u003E"), "< and > are unicode-escaped")
    }

    @Test
    fun `jsStringLiteral escapes quote, backslash, newline, tab, control and line-separator chars`() {
        assertEquals("\"a\\\\b\"", jsStringLiteral("a\\b"))        // backslash
        assertEquals("\"a\\\"b\"", jsStringLiteral("a\"b"))       // double quote
        assertEquals("\"a\\nb\"", jsStringLiteral("a\nb"))        // newline
        assertEquals("\"a\\tb\"", jsStringLiteral("a\tb"))        // tab
        assertEquals("\"a\\u0000b\"", jsStringLiteral("a\u0000b")) // NUL control char
        assertEquals("\"a\\u2028b\"", jsStringLiteral("a\u2028b")) // JS line separator
        assertEquals("\"a\\u2029b\"", jsStringLiteral("a\u2029b")) // JS paragraph separator
    }

    @Test
    fun `jsStringLiteral wraps the value in double quotes and passes plain text through`() {
        assertEquals("\"hello world\"", jsStringLiteral("hello world"))
    }
}
