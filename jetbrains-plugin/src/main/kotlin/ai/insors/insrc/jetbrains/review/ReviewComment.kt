package ai.insors.insrc.jetbrains.review

import java.util.concurrent.atomic.AtomicInteger

/**
 * The sc3 comment model (Story S003) — the inline-anchored comment a reviewer
 * builds while reading, plus the pure, Kotlin-owned un-submitted buffer that
 * holds them. Presentation-only (lc1/k1): the buffer performs NO approval or
 * resolution reasoning and is not persisted until S004's submit; it is the
 * SOURCE OF TRUTH the JS overlay re-renders from (so un-submitted comments
 * survive a page re-render). s4 reads [CommentBuffer.snapshot] at submit.
 */

/** The captured target of a comment. All fields optional — a comment may pin to
 *  a section, a quoted snippet, an open question, or a combination. */
data class CommentAnchor(
    val sectionPath: String? = null,     // heading path into the rendered artifact, e.g. 'Contract > api'
    val quote: String? = null,           // anchoring text snippet within that section
    val openQuestionId: String? = null,  // set when the comment targets a specific open question
) {
    /** An anchor is usable only if it pins to at least one target. */
    fun isEmpty(): Boolean =
        sectionPath.isNullOrEmpty() && quote.isNullOrEmpty() && openQuestionId.isNullOrEmpty()
}

/** One inline comment. [id] is client-generated until S004 submits it. */
data class ReviewComment(
    val id: String,
    val anchor: CommentAnchor,
    val body: String,
)

/**
 * The pure, Kotlin-owned un-submitted comment buffer. Ordered by insertion,
 * keyed by id. Total over normal ops (edit/remove of an unknown id return false,
 * never throw). In-memory only — no persistence, no daemon call, no resolution
 * reasoning (lc1/k5).
 */
class CommentBuffer {
    private val comments = LinkedHashMap<String, ReviewComment>()
    private val seq = AtomicInteger(0)

    /** Append a new comment with a freshly-minted client id; returns it. */
    fun add(anchor: CommentAnchor, body: String): ReviewComment {
        val id = "c${seq.incrementAndGet()}-${java.util.UUID.randomUUID().toString().take(8)}"
        val comment = ReviewComment(id = id, anchor = anchor, body = body)
        comments[id] = comment
        return comment
    }

    /** Replace the body of [id]; returns whether the id was present. */
    fun edit(id: String, body: String): Boolean {
        val existing = comments[id] ?: return false
        comments[id] = existing.copy(body = body)
        return true
    }

    /** Drop [id]; returns whether it was present. */
    fun remove(id: String): Boolean = comments.remove(id) != null

    /** An immutable copy in insertion order (what s4 reads at submit). */
    fun snapshot(): List<ReviewComment> = comments.values.toList()

    /** Drop all comments (e.g. after a successful submit). */
    fun clear() = comments.clear()
}

/**
 * Per-artifact scoping of un-submitted [CommentBuffer]s (Story S003 / t5). Each
 * artifact gets its own buffer, created on first use, so switching artifacts in
 * the review panel and coming back keeps each artifact's un-submitted comments
 * distinct. Pure + headlessly testable — the JCEF-bound [ArtifactCommentLayer]
 * delegates its buffer keeping here (load-bearing logic stays out of the
 * untested JCEF layer).
 */
class CommentBufferStore {
    private val buffers = LinkedHashMap<String, CommentBuffer>()

    /** The buffer for [artifactId], created on first use. */
    fun bufferFor(artifactId: String): CommentBuffer = buffers.getOrPut(artifactId) { CommentBuffer() }

    /** Whether a buffer has been created for [artifactId] yet. */
    fun has(artifactId: String): Boolean = buffers.containsKey(artifactId)
}
