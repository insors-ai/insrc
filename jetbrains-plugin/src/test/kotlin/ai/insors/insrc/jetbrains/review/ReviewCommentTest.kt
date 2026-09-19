package ai.insors.insrc.jetbrains.review

import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertFalse
import org.junit.jupiter.api.Assertions.assertInstanceOf
import org.junit.jupiter.api.Assertions.assertNotEquals
import org.junit.jupiter.api.Assertions.assertNull
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Test

/**
 * S003 plugin tests (Epic ide-artifact-review-panel) — the headlessly-testable
 * comment core. The JCEF/JS layer ([ArtifactCommentLayer] + comment-layer.js) is
 * the manual/backstopped residual (recorded in the CR); ALL load-bearing
 * validation lives here in pure Kotlin and is covered:
 *
 *   - the [CommentAnchor] emptiness contract
 *   - the [CommentBuffer] add/edit/remove/snapshot/clear semantics
 *   - the pure [applyCommentOp] JSON boundary (every reject path is a no-op)
 *   - per-artifact scoping via [CommentBufferStore]
 */
class ReviewCommentTest {

    // ---- CommentAnchor -------------------------------------------------------

    @Test
    fun `anchor is empty only when every target is null-or-blank`() {
        assertTrue(CommentAnchor().isEmpty())
        assertTrue(CommentAnchor(sectionPath = "", quote = "", openQuestionId = "").isEmpty())
        assertFalse(CommentAnchor(sectionPath = "Contract > api").isEmpty())
        assertFalse(CommentAnchor(quote = "some text").isEmpty())
        assertFalse(CommentAnchor(openQuestionId = "q1").isEmpty())
    }

    // ---- CommentBuffer -------------------------------------------------------

    @Test
    fun `buffer add mints unique ids, preserves insertion order, and snapshots immutably`() {
        val b = CommentBuffer()
        val c1 = b.add(CommentAnchor(sectionPath = "A"), "first")
        val c2 = b.add(CommentAnchor(sectionPath = "B"), "second")
        assertNotEquals(c1.id, c2.id)
        val snap = b.snapshot()
        assertEquals(listOf("first", "second"), snap.map { it.body })
        // snapshot is a copy: a later add does not mutate an earlier snapshot
        b.add(CommentAnchor(quote = "q"), "third")
        assertEquals(2, snap.size)
    }

    @Test
    fun `buffer edit replaces the body of a known id and returns true, unknown id returns false`() {
        val b = CommentBuffer()
        val c = b.add(CommentAnchor(sectionPath = "A"), "orig")
        assertTrue(b.edit(c.id, "updated"))
        assertEquals("updated", b.snapshot().single().body)
        assertFalse(b.edit("nope", "x"))
    }

    @Test
    fun `buffer remove drops a known id and returns true, unknown id false, clear empties`() {
        val b = CommentBuffer()
        val c = b.add(CommentAnchor(sectionPath = "A"), "body")
        assertFalse(b.remove("nope"))
        assertTrue(b.remove(c.id))
        assertTrue(b.snapshot().isEmpty())
        b.add(CommentAnchor(quote = "q"), "x")
        b.clear()
        assertTrue(b.snapshot().isEmpty())
    }

    // ---- applyCommentOp: happy paths ----------------------------------------

    @Test
    fun `applyCommentOp add folds a well-formed comment into the buffer`() {
        val b = CommentBuffer()
        val r = applyCommentOp(b, """{"op":"add","comment":{"anchor":{"sectionPath":"Contract > api"},"body":"looks off"}}""")
        val applied = assertInstanceOf(CommentOpResult.Applied::class.java, r)
        assertEquals("add", applied.op)
        assertEquals("looks off", applied.comment?.body)
        assertEquals("Contract > api", b.snapshot().single().anchor.sectionPath)
    }

    @Test
    fun `applyCommentOp edit and remove target an existing id`() {
        val b = CommentBuffer()
        val c = b.add(CommentAnchor(quote = "snippet"), "first")
        val edited = applyCommentOp(b, """{"op":"edit","comment":{"id":"${c.id}","body":"revised"}}""")
        assertInstanceOf(CommentOpResult.Applied::class.java, edited)
        assertEquals("revised", b.snapshot().single().body)

        val removed = applyCommentOp(b, """{"op":"remove","comment":{"id":"${c.id}"}}""")
        assertInstanceOf(CommentOpResult.Applied::class.java, removed)
        assertTrue(b.snapshot().isEmpty())
    }

    @Test
    fun `applyCommentOp add accepts a quote-only or openQuestion-only anchor`() {
        val b = CommentBuffer()
        assertInstanceOf(CommentOpResult.Applied::class.java,
            applyCommentOp(b, """{"op":"add","comment":{"anchor":{"quote":"just this"},"body":"c"}}"""))
        assertInstanceOf(CommentOpResult.Applied::class.java,
            applyCommentOp(b, """{"op":"add","comment":{"anchor":{"openQuestionId":"q7"},"body":"c"}}"""))
        assertEquals(2, b.snapshot().size)
    }

    // ---- applyCommentOp: every reject path is a no-op (never throws) ---------

    @Test
    fun `applyCommentOp rejects malformed json as a no-op`() {
        val b = CommentBuffer()
        assertInstanceOf(CommentOpResult.Ignored::class.java, applyCommentOp(b, "{ not json"))
        assertInstanceOf(CommentOpResult.Ignored::class.java, applyCommentOp(b, "[]"))
        assertInstanceOf(CommentOpResult.Ignored::class.java, applyCommentOp(b, "\"a string\""))
        assertTrue(b.snapshot().isEmpty())
    }

    @Test
    fun `applyCommentOp rejects an unknown or missing op as a no-op`() {
        val b = CommentBuffer()
        assertInstanceOf(CommentOpResult.Ignored::class.java,
            applyCommentOp(b, """{"op":"nuke","comment":{"anchor":{"quote":"x"},"body":"y"}}"""))
        assertInstanceOf(CommentOpResult.Ignored::class.java,
            applyCommentOp(b, """{"comment":{"anchor":{"quote":"x"},"body":"y"}}"""))
        assertTrue(b.snapshot().isEmpty())
    }

    @Test
    fun `applyCommentOp add rejects an all-null anchor or a blank body`() {
        val b = CommentBuffer()
        // all-null anchor (absent, empty object, and all-blank fields)
        assertInstanceOf(CommentOpResult.Ignored::class.java, applyCommentOp(b, """{"op":"add","comment":{"body":"b"}}"""))
        assertInstanceOf(CommentOpResult.Ignored::class.java, applyCommentOp(b, """{"op":"add","comment":{"anchor":{},"body":"b"}}"""))
        assertInstanceOf(CommentOpResult.Ignored::class.java,
            applyCommentOp(b, """{"op":"add","comment":{"anchor":{"sectionPath":"","quote":""},"body":"b"}}"""))
        // blank / missing body
        assertInstanceOf(CommentOpResult.Ignored::class.java,
            applyCommentOp(b, """{"op":"add","comment":{"anchor":{"quote":"x"},"body":"   "}}"""))
        assertInstanceOf(CommentOpResult.Ignored::class.java,
            applyCommentOp(b, """{"op":"add","comment":{"anchor":{"quote":"x"}}}"""))
        assertTrue(b.snapshot().isEmpty())
    }

    @Test
    fun `applyCommentOp edit and remove reject a missing or unknown id as a no-op`() {
        val b = CommentBuffer()
        b.add(CommentAnchor(quote = "x"), "keep")
        assertInstanceOf(CommentOpResult.Ignored::class.java, applyCommentOp(b, """{"op":"edit","comment":{"body":"z"}}"""))
        assertInstanceOf(CommentOpResult.Ignored::class.java, applyCommentOp(b, """{"op":"edit","comment":{"id":"ghost","body":"z"}}"""))
        assertInstanceOf(CommentOpResult.Ignored::class.java, applyCommentOp(b, """{"op":"remove","comment":{"id":"ghost"}}"""))
        assertInstanceOf(CommentOpResult.Ignored::class.java, applyCommentOp(b, """{"op":"edit","comment":{"id":"${b.snapshot().single().id}","body":"  "}}"""))
        // the surviving comment is untouched
        assertEquals(listOf("keep"), b.snapshot().map { it.body })
    }

    // ---- per-artifact scoping ------------------------------------------------

    @Test
    fun `buffer store scopes comments per artifact and creates on first use`() {
        val store = CommentBufferStore()
        assertFalse(store.has("A"))
        val a = store.bufferFor("A")
        assertTrue(store.has("A"))
        assertFalse(store.has("B"))

        a.add(CommentAnchor(quote = "qa"), "on A")
        val b = store.bufferFor("B")
        b.add(CommentAnchor(quote = "qb"), "on B")

        // distinct buffers, and returning to A yields the same buffer
        assertEquals(listOf("on A"), store.bufferFor("A").snapshot().map { it.body })
        assertEquals(listOf("on B"), store.bufferFor("B").snapshot().map { it.body })
        assertTrue(a === store.bufferFor("A"))
    }
}
