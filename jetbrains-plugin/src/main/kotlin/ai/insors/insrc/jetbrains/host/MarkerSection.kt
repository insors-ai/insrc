package ai.insors.insrc.jetbrains.host

/**
 * The pure marker-delimited upsert/removal logic (Story S002 / t2, k4) — the
 * Kotlin port of the daemon's proven `src/daemon/steering-inject.ts` mechanic
 * (`c5`). No filesystem, no host-format knowledge: it operates purely on the
 * markers over a given text, so it is fully unit-testable and reusable by S004
 * for the 'rules' file just as S002 uses it for the 'mcp' file.
 *
 * The never-clobber invariant: content OUTSIDE the markers is always preserved
 * verbatim; malformed (open-without-close) or duplicate markers leave the text
 * untouched rather than guess.
 */
object MarkerSection {

    /** What an [upsert]/[removal] would do to the text. */
    enum class Action { CREATED, REPLACED, REMOVED, UNCHANGED }

    /**
     * The computed result. [content] is the new full text to write, or `null`
     * when nothing should be written (an idempotent no-op or a guarded
     * malformed/duplicate-marker case). [note] is set only for a guarded no-op.
     */
    data class Computation(
        val content: String?,
        val action: Action,
        val note: String? = null,
    )

    /** Render a block as its marker-bounded section: begin, body, end on their own lines. */
    fun render(block: MarkerDelimitedBlock): String =
        "${block.beginMarker}\n${block.body}\n${block.endMarker}"

    /**
     * Compute the text after inserting or replacing [block]'s marked section.
     *
     * [existing] is the current file text, or `null` when the file is absent.
     *  - absent file  -> create with only the marked section;
     *  - no markers   -> append the marked section, preserving all prior content;
     *  - one begin+end-> replace ONLY the region between (and including) the
     *    markers; identical result is an idempotent no-op (`content:null`);
     *  - malformed / duplicate markers -> leave untouched (`content:null`, note).
     */
    fun upsert(existing: String?, block: MarkerDelimitedBlock): Computation {
        val section = render(block)

        if (existing == null) {
            return Computation(content = section + "\n", action = Action.CREATED)
        }

        val opens = countOccurrences(existing, block.beginMarker)
        val closes = countOccurrences(existing, block.endMarker)

        // No marker yet -> append, preserving existing content.
        if (opens == 0 && closes == 0) {
            val sep = if (existing.endsWith("\n")) "\n" else "\n\n"
            return Computation(content = existing + sep + section + "\n", action = Action.CREATED)
        }

        // Guard: ambiguous / malformed markers -> never guess, never clobber.
        if (opens > 1 || closes > 1) {
            return Computation(null, Action.UNCHANGED, "duplicate insrc markers — left untouched")
        }
        val startIdx = existing.indexOf(block.beginMarker)
        val endIdx = existing.indexOf(block.endMarker)
        if (startIdx == -1 || endIdx == -1 || endIdx < startIdx) {
            return Computation(null, Action.UNCHANGED, "malformed insrc markers (open without matching close) — left untouched")
        }

        // Replace ONLY the region between (and including) the markers.
        val before = existing.substring(0, startIdx)
        val after = existing.substring(endIdx + block.endMarker.length)
        val next = before + section + after
        return if (next == existing) {
            Computation(null, Action.UNCHANGED) // idempotent — block already current
        } else {
            Computation(next, Action.REPLACED)
        }
    }

    /**
     * Compute the text after removing the insrc marked section bounded by
     * [beginMarker]/[endMarker] — the byte-exact inverse of [upsert]'s create /
     * append paths, restoring the file to its pre-insrc content.
     *
     *  - absent file / no markers -> nothing to remove (`content:null`, no-op);
     *  - malformed / duplicate markers -> left untouched (`content:null`, note);
     *  - otherwise strip the marked region and the single separator/newline the
     *    writer added, preserving all surrounding user content.
     */
    fun removal(existing: String?, beginMarker: String, endMarker: String): Computation {
        if (existing == null) return Computation(null, Action.UNCHANGED)

        val opens = countOccurrences(existing, beginMarker)
        val closes = countOccurrences(existing, endMarker)

        // No block present -> no-op.
        if (opens == 0 && closes == 0) return Computation(null, Action.UNCHANGED)

        // Guard: ambiguous / malformed markers -> never guess, never clobber.
        if (opens > 1 || closes > 1) {
            return Computation(null, Action.UNCHANGED, "duplicate insrc markers — left untouched")
        }
        val startIdx = existing.indexOf(beginMarker)
        val endIdx = existing.indexOf(endMarker)
        if (startIdx == -1 || endIdx == -1 || endIdx < startIdx) {
            return Computation(null, Action.UNCHANGED, "malformed insrc markers (open without matching close) — left untouched")
        }

        val before = existing.substring(0, startIdx)
        var after = existing.substring(endIdx + endMarker.length)
        // Strip the single trailing newline the writer appends after the end marker.
        if (after.startsWith("\n")) after = after.substring(1)
        // Strip the single separator newline the writer inserts before the begin
        // marker (append path leaves "…\n\n<block>"), leaving the prior trailing
        // newline intact so the pre-insrc content is restored byte-for-byte.
        val restored = if (before.endsWith("\n\n")) before.dropLast(1) + after else before + after

        return if (restored == existing) Computation(null, Action.UNCHANGED) else Computation(restored, Action.REMOVED)
    }

    private fun countOccurrences(haystack: String, needle: String): Int {
        var n = 0
        var i = haystack.indexOf(needle)
        while (i != -1) {
            n++
            i = haystack.indexOf(needle, i + needle.length)
        }
        return n
    }
}
