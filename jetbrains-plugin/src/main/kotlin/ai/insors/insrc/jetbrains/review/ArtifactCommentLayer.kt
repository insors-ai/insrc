package ai.insors.insrc.jetbrains.review

import com.google.gson.Gson
import com.google.gson.JsonObject
import com.google.gson.JsonParser
import com.intellij.openapi.Disposable
import com.intellij.openapi.application.ApplicationManager
import com.intellij.openapi.diagnostic.logger
import com.intellij.openapi.util.Disposer
import com.intellij.ui.jcef.JBCefBrowser
import com.intellij.ui.jcef.JBCefJSQuery

/**
 * The S003 inline-comment layer for the JCEF content view (t5). It owns the
 * JS<->Kotlin bridge and the per-artifact un-submitted [CommentBuffer]s (the
 * source of truth). The comment JS (comment-layer.js) posts a { op, comment }
 * payload across the [JBCefJSQuery]; this layer resolves the payload's artifact,
 * folds it into that artifact's buffer via the pure [applyCommentOp] (ALL
 * validation lives there, in testable Kotlin — the untested JS never decides
 * what is a valid comment), and pushes the new snapshot back to the page.
 *
 * Presentation only (lc1/k1): no daemon write (that is S004's submit), no
 * approval reasoning (S005). Buffers are in-memory and per-artifact, so
 * switching artifacts and coming back keeps each artifact's un-submitted
 * comments, and a page re-load re-embeds the snapshot (see [pageBootstrap]).
 *
 * Disposal: the [JBCefJSQuery] is registered on [parentDisposable]; a late
 * bridge callback or push after disposal is a guarded no-op (mirrors the S002
 * dispose-race handling in [ArtifactContentPane]).
 */
internal class ArtifactCommentLayer(
    private val browser: JBCefBrowser,
    parentDisposable: Disposable,
) {
    private val gson = Gson() // htmlSafe by default: escapes < > & ' and U+2028/2029 -> safe to embed in JS

    // The buffers + the current-artifact marker are touched ONLY on the EDT (see
    // the addHandler marshaling below), so they need no synchronization and match
    // the "all methods run on the EDT" contract of ArtifactContentPane.
    private val store = CommentBufferStore()
    private var currentArtifactId: String? = null

    @Volatile private var disposed = false

    private val query: JBCefJSQuery = JBCefJSQuery.create(browser as com.intellij.ui.jcef.JBCefBrowserBase).also {
        Disposer.register(parentDisposable, it)
    }

    init {
        Disposer.register(parentDisposable) { disposed = true }
        query.addHandler { payload ->
            // JCEF invokes this on the CEF message-router callback thread, NOT the
            // Swing EDT. Marshal onto the EDT so every buffer access (here and in
            // pageBootstrap/snapshot) is single-threaded — no data race on the
            // LinkedHashMaps, and a safe happens-before edge to the next EDT
            // pageBootstrap read (so an un-submitted comment cannot be lost).
            // The bridge needs no synchronous response.
            if (!disposed) {
                ApplicationManager.getApplication().invokeLater({ handlePayload(payload) }, { disposed })
            }
            null
        }
    }

    /** The buffer for [artifactId], created on first use (per-artifact scoping). */
    private fun bufferFor(artifactId: String): CommentBuffer = store.bufferFor(artifactId)

    /**
     * The bootstrap JS to inline into a page rendering [artifactId], AFTER the
     * markdown renderer has populated #insrc-content and BEFORE comment-layer.js
     * runs. It publishes the artifact id, the current buffer snapshot (so
     * un-submitted comments survive a re-load), and the injected post bridge.
     */
    fun pageBootstrap(artifactId: String): String {
        currentArtifactId = artifactId // the page now showing (EDT); pushSnapshot guards on it
        val snapshot = gson.toJson(bufferFor(artifactId).snapshot())
        return buildString {
            append("window.__insrcArtifactId=").append(gson.toJson(artifactId)).append(';')
            append("window.__insrcInitialComments=").append(snapshot).append(';')
            // The Kotlin bridge: comment-layer.js calls window.__insrcPostComment(payloadJson).
            append("window.__insrcPostComment=function(p){").append(query.inject("p")).append("};")
        }
    }

    private fun handlePayload(payload: String) {
        if (disposed) return
        val artifactId = try {
            val root = JsonParser.parseString(payload) as? JsonObject ?: return
            val el = root.get("artifactId") ?: return
            if (!el.isJsonPrimitive) return
            el.asString.ifEmpty { return }
        } catch (t: Throwable) {
            log.warn("insrc: malformed comment payload", t)
            return
        }
        if (!store.has(artifactId)) return // an op for an artifact never rendered -> ignore
        val buffer = bufferFor(artifactId)
        val result = applyCommentOp(buffer, payload)
        if (result is CommentOpResult.Applied) pushSnapshot(artifactId)
        else if (result is CommentOpResult.Ignored) log.debug("insrc: comment op ignored: ${result.reason}")
    }

    /** Re-render the page's threads from the (now-updated) buffer snapshot. */
    private fun pushSnapshot(artifactId: String) {
        if (disposed) return
        // Only push into the page that is actually showing this artifact: a stale
        // in-flight op for A delivered just after the panel navigated to B must
        // not render A's threads onto B's page.
        if (artifactId != currentArtifactId) return
        val b = browser
        if (b.isDisposed) return
        val json = gson.toJson(bufferFor(artifactId).snapshot())
        try {
            b.cefBrowser.executeJavaScript(
                "try{if(typeof window.insrcRenderComments==='function')window.insrcRenderComments($json);}catch(e){}",
                b.cefBrowser.url ?: "",
                0,
            )
        } catch (t: Throwable) {
            log.warn("insrc: failed to push comment snapshot", t)
        }
    }

    private companion object {
        private val log = logger<ArtifactCommentLayer>()
    }
}
