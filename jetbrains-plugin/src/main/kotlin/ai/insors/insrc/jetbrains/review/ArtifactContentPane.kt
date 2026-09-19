package ai.insors.insrc.jetbrains.review

import ai.insors.insrc.jetbrains.daemon.ApproveResult
import ai.insors.insrc.jetbrains.daemon.ArtifactReviewViewDto
import ai.insors.insrc.jetbrains.daemon.DaemonGateway
import com.intellij.openapi.Disposable
import com.intellij.openapi.application.ApplicationManager
import com.intellij.openapi.diagnostic.logger
import com.intellij.openapi.project.Project
import com.intellij.openapi.ui.Messages
import com.intellij.openapi.util.Disposer
import com.intellij.ui.components.JBLabel
import com.intellij.ui.components.JBScrollPane
import com.intellij.ui.components.JBTextArea
import com.intellij.ui.jcef.JBCefApp
import com.intellij.ui.jcef.JBCefBrowser
import com.intellij.util.ui.JBUI
import java.awt.BorderLayout
import java.awt.CardLayout
import java.awt.FlowLayout
import javax.swing.JButton
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
    private val project: Project,
    private val gateway: DaemonGateway,
    private val parentDisposable: Disposable,
    // S005: invoked on the EDT after a successful Approve so the pending list
    // drops the just-approved artifact (ReviewPanel wires it to refreshNow()).
    private val onApproved: () -> Unit = {},
) {
    private val cards = CardLayout()
    // The card container (status / native / jcef). Wrapped by [root] below so an
    // Approve action bar can sit above it (S005).
    private val content = JPanel(cards)
    private val root = JPanel(BorderLayout())

    // S005 Approve action bar (above the content, visible in every card).
    private val approveButton = JButton("Approve").apply { addActionListener { doApprove(null) } }
    private val overrideButton = JButton("Approve anyway…").apply { addActionListener { promptOverrideAndApprove() } }
    private val blockLabel = JBLabel("").apply {
        border = JBUI.Borders.emptyLeft(8)
        foreground = JBUI.CurrentTheme.ContextHelp.FOREGROUND
    }
    private val actionBar = JPanel(FlowLayout(FlowLayout.LEFT, 6, 4)).apply {
        add(approveButton)
        add(overrideButton)
        add(blockLabel)
        isVisible = false   // shown only once an artifact view is loaded
    }

    // The artifact currently shown, so Approve knows its target + gate state (S005).
    private var currentView: ArtifactReviewViewDto? = null
    private var currentMdPath: String? = null

    // Blocks a double-click from starting a second concurrent approve (EDT-only).
    private var approving = false

    // Set once the currently-shown artifact has been approved from here, so the
    // Approve controls disable (a re-approve is idempotent daemon-side but the
    // stale button is confusing) until a different artifact is loaded.
    private var approvedTarget = false

    private val statusLabel = JBLabel("", SwingConstants.CENTER).apply { border = JBUI.Borders.empty(16) }

    // Read-only native fallback (also used if JCEF or the bundled renderer is unavailable).
    private val nativeArea = JBTextArea().apply {
        isEditable = false
        lineWrap = true
        wrapStyleWord = true
        border = JBUI.Borders.empty(8)
    }

    // One-line notice shown above the native fallback: annotation is JCEF-only
    // (S003 open question q0faa8535 — the native fallback stays read-only).
    private val nativeNotice = JBLabel("Annotation requires a JCEF-capable JBR — this view is read-only.").apply {
        border = JBUI.Borders.empty(6, 8)
        foreground = JBUI.CurrentTheme.ContextHelp.FOREGROUND
    }

    // JCEF browser is created lazily ONLY when supported, and disposed with the panel.
    private val jcefSupported: Boolean = try { JBCefApp.isSupported() } catch (_: Throwable) { false }
    private var browser: JBCefBrowser? = null

    // The S003 inline-comment layer — only when a JCEF browser exists (annotation
    // is JCEF-only; the native fallback carries the read-only notice above).
    private var commentLayer: ArtifactCommentLayer? = null

    // Set when the tool-window disposable is disposed. A content fetch that was
    // dispatched off-EDT may still marshal a render back AFTER disposal (the
    // project can outlive the tool window on a dynamic unload); rendering into a
    // disposed JBCefBrowser throws. This flag + a try/catch keep the late render
    // safe (it degrades to the native fallback / no-op).
    @Volatile private var disposed = false

    val component: JComponent get() = root

    init {
        root.add(actionBar, BorderLayout.NORTH)
        root.add(content, BorderLayout.CENTER)
        content.add(statusLabel, CARD_STATUS)
        val nativeCard = JPanel(BorderLayout()).apply {
            add(nativeNotice, BorderLayout.NORTH)
            add(JBScrollPane(nativeArea), BorderLayout.CENTER)
        }
        content.add(nativeCard, CARD_NATIVE)
        if (jcefSupported) {
            val b = try {
                JBCefBrowser().also { Disposer.register(parentDisposable, it) }
            } catch (t: Throwable) {
                log.warn("insrc: JCEF reported supported but the browser could not be created; using the native fallback", t)
                null
            }
            browser = b
            if (b != null) {
                content.add(b.component, CARD_JCEF)
                commentLayer = try {
                    ArtifactCommentLayer(
                        browser = b,
                        parentDisposable = parentDisposable,
                        gateway = gateway,
                        repoSupplier = { project.basePath },
                        notify = ::notifyUser,
                    )
                } catch (t: Throwable) {
                    log.warn("insrc: could not create the comment layer; the content view stays read-only", t)
                    null
                }
            }
        }
        Disposer.register(parentDisposable) { disposed = true }
        statusLabel.text = "Select an artifact above to review it."
        cards.show(content, CARD_STATUS)
    }

    /** Show a plain status message (loading / no-path / hint). Hides the Approve
     *  action bar — there is no loaded artifact to approve. */
    fun showMessage(text: String) {
        clearApproveTarget()
        statusLabel.text = text
        cards.show(content, CARD_STATUS)
    }

    /** Render a content-view state. Unavailable is DISTINCT from empty (ac2).
     *  [mdPath] is the selected artifact's rendered path (S005): the Approve
     *  action composes the absolute artifactPath from it. */
    fun render(view: ArtifactContentView, mdPath: String) {
        if (disposed) return
        when (view) {
            is ArtifactContentView.Unavailable -> {
                clearApproveTarget()
                statusLabel.text = "insrc content unavailable — ${view.reason}"
                cards.show(content, CARD_STATUS)
            }
            is ArtifactContentView.Rendered -> {
                setApproveTarget(view.view, mdPath)
                val md = view.view.renderedMarkdown
                // renderModeFor keeps the gate->surface decision testable; the
                // actual browser may still be null (creation failed) -> native.
                val mode = renderModeFor(jcefSupported && browser != null)
                if (mode == RenderMode.JCEF_HTML) {
                    val html = composeHtml(md, view.view.artifactId)
                    val b = browser
                    if (html != null && b != null && !b.isDisposed) {
                        // Guarded: a dispose race (tool window unloaded while the
                        // fetch was in flight) must not throw on a dead browser.
                        try {
                            b.loadHTML(html)
                            cards.show(content, CARD_JCEF)
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
                cards.show(content, CARD_NATIVE)
            }
        }
    }

    // ---- S005 Approve action ------------------------------------------------

    /** Remember the loaded artifact + show/gate the Approve controls (EDT). */
    private fun setApproveTarget(view: ArtifactReviewViewDto, mdPath: String) {
        // A re-render for a DIFFERENT artifact clears the approved-latch; a
        // re-render of the same just-approved artifact keeps the buttons disabled.
        if (mdPath != currentMdPath) approvedTarget = false
        currentView = view
        currentMdPath = mdPath
        actionBar.isVisible = true
        updateApproveControls()
    }

    /** Hide the Approve controls — no artifact is loaded. */
    private fun clearApproveTarget() {
        currentView = null
        currentMdPath = null
        approvedTarget = false
        actionBar.isVisible = false
    }

    /** Enable normal Approve only for an approvable artifact with a resolvable
     *  path; show the blockReason when a review verdict withholds it. The
     *  override ('Approve anyway') stays available as the explicit power path. */
    private fun updateApproveControls() {
        val view = currentView
        val hasTarget = view != null && !currentMdPath.isNullOrEmpty() && !project.basePath.isNullOrEmpty()
        val actionable = hasTarget && !approving && !approvedTarget
        approveButton.isEnabled = actionable && ApproveDecision.enabled(view!!)
        overrideButton.isEnabled = actionable
        blockLabel.text = when {
            approvedTarget -> "Approved ✓"
            view != null && !view.approvable -> view.blockReason ?: "Approval is blocked by the review verdict."
            else -> ""
        }
    }

    private fun promptOverrideAndApprove() {
        val view = currentView ?: return
        val reason = Messages.showInputDialog(
            project,
            "Reason to approve past the review block (leave empty for a normal approve):",
            "Approve Anyway",
            Messages.getWarningIcon(),
            view.blockReason ?: "",
            null,
        )
        if (reason == null) return   // dialog cancelled
        // A blank reason normalizes to no override -> a normal approve (the block
        // gate still applies), matching the daemon's overrideReview semantics.
        doApprove(ApproveDecision.normalizeOverride(reason))
    }

    private fun doApprove(overrideReason: String?) {
        if (disposed || approving) return
        val view = currentView ?: return
        val md = currentMdPath
        val repo = project.basePath
        if (md.isNullOrEmpty() || repo.isNullOrEmpty()) {
            notifyUser("Cannot approve: the artifact has no resolvable path.", true)
            return
        }
        // A normal Approve (no override) is only offered for an approvable
        // artifact; the override path may proceed regardless (daemon-gated).
        if (overrideReason == null && !ApproveDecision.enabled(view)) return
        approving = true
        updateApproveControls()
        ApplicationManager.getApplication().executeOnPooledThread {
            val result = try {
                gateway.approve(repo, md, overrideReason)
            } catch (t: Throwable) {
                ApproveResult.Unavailable(t.message ?: "approve failed")
            }
            ApplicationManager.getApplication().invokeLater({ applyApprove(result, md) }, { disposed })
        }
    }

    private fun applyApprove(result: ApproveResult, approvedMdPath: String) {
        approving = false
        if (disposed) return
        when (result) {
            is ApproveResult.Approved -> {
                // Latch the "Approved" state ONLY when the artifact just approved is
                // still the one shown — a reply that lands after the reviewer moved
                // to a different pending artifact must not disable/label THAT one.
                if (ApproveDecision.latchApproved(approvedMdPath, currentMdPath)) approvedTarget = true
                notifyUser("Approved.", false)
                if (ApproveDecision.shouldRefresh(result)) onApproved()   // drop it off the pending list (ac3)
            }
            is ApproveResult.Withheld -> notifyUser("Approval withheld: ${result.reason}", true)
            is ApproveResult.Unavailable -> notifyUser("Approve failed: ${result.reason}", true)
        }
        updateApproveControls()
    }

    /**
     * Compose the JCEF page: the bundled renderer.js inlined from the classpath
     * + the daemon-provided markdown embedded as a JS string literal, rendered
     * read-only into a container. When a comment layer exists (S003), the bundled
     * comment-layer.js + the per-artifact bootstrap (the Kotlin post bridge + the
     * current buffer snapshot) are inlined too, so un-submitted comments survive
     * a re-load. Returns null when the bundled renderer resource is absent
     * (caller falls back to native).
     */
    private fun composeHtml(markdown: String, artifactId: String): String? {
        val renderer = readBundled(RENDERER_RESOURCE) ?: return null
        // The comment layer is optional: no JCEF-capable browser, a failed layer,
        // or a missing comment-layer.js resource -> a read-only rendered page.
        val layer = commentLayer
        val commentScript = layer?.let { l ->
            readBundled(COMMENT_RESOURCE)?.let { js ->
                // bootstrap (artifact id + snapshot + bridge) BEFORE the layer script.
                "<script>${l.pageBootstrap(artifactId)}</script>\n<script>$js</script>"
            }
        } ?: ""
        // Restrictive CSP (defense-in-depth on top of the escaping): no remote
        // fetches of any kind; only the inlined scripts + inline styles. The page
        // loads nothing from the network (the comment bridge is same-page JS).
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
              .insrc-comment-bar { position: sticky; bottom: 0; background: rgba(127,127,127,0.10);
                padding: 6px 8px; margin-top: 16px; border-top: 1px solid rgba(127,127,127,0.3); }
              .insrc-comment-bar button { cursor: pointer; }
              .insrc-hint { margin-left: 10px; color: #c47; font-style: italic; }
              .insrc-threads { margin-top: 10px; }
              .insrc-threads-title { font-weight: bold; margin-bottom: 6px; }
              .insrc-empty { color: #888; font-style: italic; }
              .insrc-thread { border: 1px solid rgba(127,127,127,0.3); border-radius: 4px; padding: 6px 8px; margin-bottom: 8px; }
              .insrc-thread-where { font-size: 0.85em; color: #888; }
              .insrc-thread-quote { border-left: 3px solid rgba(127,127,127,0.4); margin: 4px 0; padding-left: 8px; color: #888; }
              .insrc-thread-actions { font-size: 0.85em; margin-top: 4px; }
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
            $commentScript
            </body></html>
        """.trimIndent()
    }

    /** Surface a submit success/failure via the shared 'insrc' notification group. */
    private fun notifyUser(message: String, error: Boolean) {
        try {
            com.intellij.notification.NotificationGroupManager.getInstance()
                .getNotificationGroup("insrc")
                .createNotification(
                    message,
                    if (error) com.intellij.notification.NotificationType.ERROR
                    else com.intellij.notification.NotificationType.INFORMATION,
                )
                .notify(project)
        } catch (t: Throwable) {
            log.warn("insrc: failed to post a submit notification: $message", t)
        }
    }

    private fun readBundled(resource: String): String? =
        try {
            javaClass.getResourceAsStream(resource)?.readBytes()?.toString(Charsets.UTF_8)
        } catch (t: Throwable) {
            log.warn("insrc: failed to read a bundled review resource: $resource", t)
            null
        }

    private companion object {
        const val CARD_STATUS = "status"
        const val CARD_NATIVE = "native"
        const val CARD_JCEF = "jcef"
        const val RENDERER_RESOURCE = "/insrc-review/markdown-renderer.js"
        const val COMMENT_RESOURCE = "/insrc-review/comment-layer.js"
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
