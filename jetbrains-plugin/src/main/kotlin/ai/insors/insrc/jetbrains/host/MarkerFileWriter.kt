package ai.insors.insrc.jetbrains.host

import java.io.IOException
import java.nio.file.Files
import java.nio.file.Path

/**
 * A minimal text-file port, injected so the [MarkerFileWriter]'s IO-failure
 * path is unit-testable without real permission games (Story S002 / t2).
 * [read] returns `null` when the file is absent; [write] replaces the whole
 * file content in one call.
 */
interface HostFileIo {
    /** @throws IOException on a read failure (permissions, unreadable). */
    fun read(path: String): String?

    /** @throws IOException on a write failure (permissions, missing parent, read-only). */
    fun write(path: String, content: String)
}

/** Real [HostFileIo] over `java.nio.file` — UTF-8, whole-file read/replace. */
class NioHostFileIo : HostFileIo {
    override fun read(path: String): String? {
        val p = Path.of(path)
        if (!Files.exists(p)) return null
        return Files.readString(p)
    }

    override fun write(path: String, content: String) {
        Files.writeString(Path.of(path), content)
    }
}

/**
 * The format-agnostic marker-delimited replace-only writer (Story S002 / t2,
 * k4). A read-modify-write over an ALREADY-LOCATED file path: it composes the
 * full new content with [MarkerSection] (pure) and writes it in a single call,
 * so a failure surfaces [HostFileAccessException] with no partial write. It
 * holds NO host-format knowledge — recognising and resolving each host's file
 * is t3's job; this primitive is reused unchanged by S004 for the 'rules' file.
 */
class MarkerFileWriter(private val io: HostFileIo = NioHostFileIo()) {

    /**
     * Insert or replace [block] in the file at [path], marker-delimited and
     * replace-only: surrounding content is preserved verbatim and re-writing the
     * same block is a byte-identical no-op.
     *
     * @throws HostFileAccessException if the file cannot be read or written
     *   (the file is left exactly as it was — no partial write).
     */
    fun writeBlock(path: String, block: MarkerDelimitedBlock) {
        val existing = readOrThrow(path)
        val computed = MarkerSection.upsert(existing, block)
        val content = computed.content ?: return // idempotent / guarded no-op — nothing to write
        writeOrThrow(path, content)
    }

    /**
     * Remove the insrc block bounded by [beginMarker]/[endMarker] from the file
     * at [path], restoring the pre-insrc content; a no-op when no such block is
     * present.
     *
     * @throws HostFileAccessException if the file cannot be read or written.
     */
    fun removeBlock(path: String, beginMarker: String, endMarker: String) {
        val existing = readOrThrow(path)
        val computed = MarkerSection.removal(existing, beginMarker, endMarker)
        val content = computed.content ?: return // nothing to remove
        writeOrThrow(path, content)
    }

    private fun readOrThrow(path: String): String? =
        try {
            io.read(path)
        } catch (e: IOException) {
            throw HostFileAccessException("insrc: cannot read host file $path", e)
        }

    private fun writeOrThrow(path: String, content: String) {
        try {
            io.write(path, content)
        } catch (e: IOException) {
            throw HostFileAccessException("insrc: cannot write host file $path", e)
        }
    }
}
