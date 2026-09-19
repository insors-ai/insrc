package ai.insors.insrc.jetbrains.review

import com.google.gson.JsonObject
import com.google.gson.JsonParser

/**
 * The pure comment-op applier (Story S003 / t2) — the JS<->Kotlin boundary
 * logic, in Kotlin so it is unit-testable headlessly (the load-bearing
 * validation does NOT live in the untested JS layer). The JBCefJSQuery handler
 * (t5) delegates here: it parses a { op, comment } JSON payload posted by the
 * comment JS and folds it into the [CommentBuffer], REJECTING malformed JSON /
 * unknown op / missing fields / an all-null anchor / a blank body as a no-op
 * (never throwing). Presentation-only (lc1/k1).
 */

/** The outcome of applying one op, for the handler to log / re-render from. */
sealed interface CommentOpResult {
    /** The op mutated the buffer. [comment] is the affected comment (add/edit) or null (remove). */
    data class Applied(val op: String, val comment: ReviewComment?) : CommentOpResult

    /** The op was ignored (bad payload / unknown id / empty); the buffer is unchanged. */
    data class Ignored(val reason: String) : CommentOpResult
}

/**
 * Parse [payloadJson] and fold it into [buffer]. Total: any malformed / invalid
 * payload returns [CommentOpResult.Ignored] rather than throwing.
 *
 * Payload shape: `{ "op": "add"|"edit"|"remove",
 *   "comment": { "id"?, "anchor": { "sectionPath"?, "quote"?, "openQuestionId"? }, "body"? } }`
 */
fun applyCommentOp(buffer: CommentBuffer, payloadJson: String): CommentOpResult {
    val root = try {
        JsonParser.parseString(payloadJson) as? JsonObject
            ?: return CommentOpResult.Ignored("payload is not a JSON object")
    } catch (t: Throwable) {
        return CommentOpResult.Ignored("malformed JSON: ${t.message}")
    }

    val op = root.stringOrNull("op") ?: return CommentOpResult.Ignored("missing op")
    val comment = root.get("comment") as? JsonObject

    return when (op) {
        "add" -> {
            if (comment == null) return CommentOpResult.Ignored("add: missing comment")
            val body = comment.stringOrNull("body")
            if (body.isNullOrBlank()) return CommentOpResult.Ignored("add: blank body")
            val anchor = parseAnchor(comment.get("anchor") as? JsonObject)
            if (anchor.isEmpty()) return CommentOpResult.Ignored("add: empty anchor")
            CommentOpResult.Applied("add", buffer.add(anchor, body))
        }
        "edit" -> {
            val id = comment?.stringOrNull("id") ?: return CommentOpResult.Ignored("edit: missing id")
            val body = comment.stringOrNull("body")
            if (body.isNullOrBlank()) return CommentOpResult.Ignored("edit: blank body")
            if (!buffer.edit(id, body)) return CommentOpResult.Ignored("edit: unknown id $id")
            CommentOpResult.Applied("edit", buffer.snapshot().firstOrNull { it.id == id })
        }
        "remove" -> {
            val id = comment?.stringOrNull("id") ?: return CommentOpResult.Ignored("remove: missing id")
            if (!buffer.remove(id)) return CommentOpResult.Ignored("remove: unknown id $id")
            CommentOpResult.Applied("remove", null)
        }
        else -> CommentOpResult.Ignored("unknown op: $op")
    }
}

private fun parseAnchor(o: JsonObject?): CommentAnchor {
    if (o == null) return CommentAnchor()
    return CommentAnchor(
        sectionPath = o.stringOrNull("sectionPath"),
        quote = o.stringOrNull("quote"),
        openQuestionId = o.stringOrNull("openQuestionId"),
    )
}

/** A non-empty string member, or null (absent / JsonNull / non-primitive / empty). */
private fun JsonObject.stringOrNull(key: String): String? {
    val el = this.get(key) ?: return null
    if (!el.isJsonPrimitive) return null
    val s = el.asString
    return if (s.isEmpty()) null else s
}
