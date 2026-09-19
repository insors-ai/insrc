package ai.insors.insrc.jetbrains.review

import ai.insors.insrc.jetbrains.daemon.DaemonGateway
import com.intellij.openapi.Disposable
import com.intellij.openapi.diagnostic.logger
import com.intellij.openapi.project.Project
import com.intellij.openapi.util.Disposer
import com.intellij.ui.components.JBLabel
import com.intellij.ui.components.JBScrollPane
import com.intellij.ui.components.JBTextArea
import com.intellij.ui.jcef.JBCefApp
import com.intellij.ui.jcef.JBCefBrowser
import com.intellij.util.ui.JBUI
import java.awt.CardLayout
import javax.swing.JComponent
import javax.swing.JPanel
import javax.swing.SwingConstants

/**
 * The S002 content view surface. Renders a selected artifact's own content
 * (ArtifactContentView.Rendered) via the bundled markdown->HTML JS renderer
 * inside a JCEF browser when [JBCefApp.isSupported], else a read-only
 * native-editor fallback showing the same markdown (ac2/lc2/k6). An
 * ArtifactContentView.Unavailable renders a distinct 'content unavailable'
 * state — never a blank/empty pane (ac2). The daemon-provided renderedMarkdown
 * is presented read-only; no divergent second copy is authored (k5/lc1).
 *
 * All methods run on the EDT.
 */
internal class ArtifactContentPane(
    @Suppress("unused") private val project: Project,
    @Suppress("unused") private val gateway: DaemonGateway,
    private val parentDisposable: Disposable,
) {
    private val cards = CardLayout()
    private val root = JPanel(cards)

    private val statusLabel = JBLabel("", SwingConstants.CENTER).apply { border = JBUI.Borders.empty(16) }

    // Read-only native fallback (also used if JCEF or the bundled renderer is unavailable).
    private val nativeArea = JBTextArea().apply {
        isEditable = false
        lineWrap = true
        wrapStyleWord = true
        border = JBUI.Borders.empty(8)
    }

    // JCEF browser is created lazily ONLY when supported, and disposed with the panel.
    private val jcefSupported: Boolean = try { JBCefApp.isSupported() } catch (_: Throwable) { false }
    private var browser: JBCefBrowser? = null

    // Set when the tool-window disposable is disposed. A content fetch that was
    // dispatched off-EDT may still marshal a render back AFTER disposal (the
    // project can outlive the tool window on a dynamic unload); rendering into a
    // disposed JBCefBrowser throws. This flag + a try/catch keep the late render
    // safe (it degrades to the native fallback / no-op).
    @Volatile private var disposed = false

    val component: JComponent get() = root

    init {
        root.add(statusLabel, CARD_STATUS)
        root.add(JBScrollPane(nativeArea), CARD_NATIVE)
        if (jcefSupported) {
            val b = try {
                JBCefBrowser().also { Disposer.register(parentDisposable, it) }
            } catch (t: Throwable) {
                log.warn("insrc: JCEF reported supported but the browser could not be created; using the native fallback", t)
                null
            }
            browser = b
            if (b != null) root.add(b.component, CARD_JCEF)
        }
        Disposer.register(parentDisposable) { disposed = true }
        statusLabel.text = "Select an artifact above to review it."
        cards.show(root, CARD_STATUS)
    }

    /** Show a plain status message (loading / no-path / hint). */
    fun showMessage(text: String) {
        statusLabel.text = text
        cards.show(root, CARD_STATUS)
    }

    /** Render a content-view state. Unavailable is DISTINCT from empty (ac2). */
    fun render(view: ArtifactContentView) {
        if (disposed) return
        when (view) {
            is ArtifactContentView.Unavailable -> {
                statusLabel.text = "insrc content unavailable — ${view.reason}"
                cards.show(root, CARD_STATUS)
            }
            is ArtifactContentView.Rendered -> {
                val md = view.view.renderedMarkdown
                // renderModeFor keeps the gate->surface decision testable; the
                // actual browser may still be null (creation failed) -> native.
                val mode = renderModeFor(jcefSupported && browser != null)
                if (mode == RenderMode.JCEF_HTML) {
                    val html = composeHtml(md)
                    val b = browser
                    if (html != null && b != null && !b.isDisposed) {
                        // Guarded: a dispose race (tool window unloaded while the
                        // fetch was in flight) must not throw on a dead browser.
                        try {
                            b.loadHTML(html)
                            cards.show(root, CARD_JCEF)
                            return
                        } catch (t: Throwable) {
                            log.warn("insrc: JCEF loadHTML failed; using the native fallback", t)
                        }
                    } else if (html == null) {
                        // bundled renderer missing -> degrade to native rather than a blank page
                        log.warn("insrc: bundled markdown renderer resource missing; using the native fallback")
                    }
                }
                nativeArea.text = md
                nativeArea.caretPosition = 0
                cards.show(root, CARD_NATIVE)
            }
        }
    }

    /**
     * Compose the JCEF page: the bundled renderer.js inlined from the classpath
     * + the daemon-provided markdown embedded as a JS string literal, rendered
     * read-only into a container. Returns null when the bundled renderer
     * resource is absent (caller falls back to native).
     */
    private fun composeHtml(markdown: String): String? {
        val renderer = readBundledRenderer() ?: return null
        // Restrictive CSP (defense-in-depth on top of the escaping): no remote
        // fetches of any kind; only the inlined renderer script + inline styles.
        // The page is read-only; it loads nothing from the network.
        return """
            <!doctype html>
            <html><head><meta charset="utf-8">
            <meta http-equiv="Content-Security-Policy"
                  content="default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; img-src data:;">
            <style>
              body { font-family: sans-serif; padding: 12px; line-height: 1.5; }
              pre { background: rgba(127,127,127,0.12); padding: 8px; overflow: auto; white-space: pre-wrap; }
              code { font-family: monospace; }
              blockquote { border-left: 3px solid rgba(127,127,127,0.4); margin: 0; padding-left: 10px; color: #888; }
              table { border-collapse: collapse; }
              h1,h2,h3,h4,h5,h6 { margin: 0.6em 0 0.3em; }
            </style></head>
            <body><div id="insrc-content"></div>
            <script>$renderer</script>
            <script>
              (function(){
                var md = ${jsStringLiteral(markdown)};
                var el = document.getElementById('insrc-content');
                function esc(s){return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');}
                // Never blank (ac2): if the renderer resource is present but its
                // JS fails at runtime (undefined global or a throw), fall back to
                // the escaped raw markdown in a <pre> rather than an empty pane.
                try {
                  el.innerHTML = (typeof window.insrcRenderMarkdown === 'function')
                    ? window.insrcRenderMarkdown(md)
                    : '<pre>' + esc(md) + '</pre>';
                } catch (e) {
                  el.innerHTML = '<pre>' + esc(md) + '</pre>';
                }
              })();
            </script>
            </body></html>
        """.trimIndent()
    }

    private fun readBundledRenderer(): String? =
        try {
            javaClass.getResourceAsStream(RENDERER_RESOURCE)?.readBytes()?.toString(Charsets.UTF_8)
        } catch (t: Throwable) {
            log.warn("insrc: failed to read the bundled markdown renderer", t)
            null
        }

    private companion object {
        const val CARD_STATUS = "status"
        const val CARD_NATIVE = "native"
        const val CARD_JCEF = "jcef"
        const val RENDERER_RESOURCE = "/insrc-review/markdown-renderer.js"
        private val log = logger<ArtifactContentPane>()
    }
}

/**
 * A JS/JSON string literal for safely embedding untrusted artifact text into an
 * inline `<script>` (Story S002 / t4). Escapes the backslash + quote, the
 * newline/CR/tab, ALL control chars, the JS line/paragraph separators
 * (U+2028/U+2029, which are invalid raw inside a JS string), and — critically —
 * `<`/`>` so a `</script>` in the markdown can NEVER close the tag and break out
 * into active markup. Top-level + `internal` so the XSS-critical escaping is
 * directly unit-testable.
 */
internal fun jsStringLiteral(s: String): String {
    val sb = StringBuilder(s.length + 2)
    sb.append('"')
    for (ch in s) {
        when (ch.code) {
            '\\'.code -> sb.append("\\\\")
            '"'.code -> sb.append("\\\"")
            '\n'.code -> sb.append("\\n")
            '\r'.code -> sb.append("\\r")
            '\t'.code -> sb.append("\\t")
            '<'.code -> sb.append("\\u003C")   // never let "</script>" close the tag
            '>'.code -> sb.append("\\u003E")
            0x2028 -> sb.append("\\u2028")      // JS line separator (invalid raw in a string)
            0x2029 -> sb.append("\\u2029")      // JS paragraph separator
            else -> if (ch.code < 0x20) sb.append("\\u%04x".format(ch.code)) else sb.append(ch)
        }
    }
    sb.append('"')
    return sb.toString()
}
