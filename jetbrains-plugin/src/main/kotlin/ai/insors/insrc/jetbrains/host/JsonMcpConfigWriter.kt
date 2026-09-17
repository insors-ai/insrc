package ai.insors.insrc.jetbrains.host

import com.google.gson.GsonBuilder
import com.google.gson.JsonObject
import com.google.gson.JsonParser
import com.google.gson.JsonSyntaxException
import java.io.IOException

/**
 * The replace-only writer for a host's JSON mcp config (Story S002 / t2, k4).
 *
 * The mcp config is JSON, so — unlike the Markdown rules file — the insrc region
 * cannot be a text marker block (HTML comments are invalid JSON). Instead the
 * replace anchor is the `mcpServers.insrc` KEY: [writeInsrcServer] parses the
 * existing config (or starts from `{}`), sets `mcpServers.insrc` to the composed
 * entry, and re-serialises — every OTHER key and server is preserved verbatim,
 * and re-writing the same entry is an idempotent no-op. [removeInsrcServer]
 * deletes only that key. The full content is composed in memory and written in
 * one call, so a failure surfaces [HostFileAccessException] with no partial write.
 *
 * IO is injected ([HostFileIo]) so the failure path is unit-testable.
 */
class JsonMcpConfigWriter(private val io: HostFileIo = NioHostFileIo()) {

    private val gson = GsonBuilder().setPrettyPrinting().create()

    /**
     * Upsert the insrc server entry under `mcpServers.insrc`, preserving all
     * other content; idempotent (identical entry -> no write).
     *
     * @throws HostFileAccessException if the file cannot be read or written, or
     *   its existing content is not a JSON object (fail-safe: never clobber).
     */
    fun writeInsrcServer(path: String, serverEntryJson: String) {
        val existing = readOrThrow(path)
        val root = if (existing.isNullOrBlank()) JsonObject() else parseObjectOrThrow(existing, path)
        val servers = root.getAsJsonObject("mcpServers") ?: JsonObject().also { root.add("mcpServers", it) }
        servers.add(InsrcMcpRegistration.SERVER_KEY, JsonParser.parseString(serverEntryJson))
        val next = gson.toJson(root)
        // idempotent: skip the write if the serialised content is unchanged
        if (existing == next) return
        writeOrThrow(path, next)
    }

    /**
     * Remove the `mcpServers.insrc` entry, restoring the config to its pre-insrc
     * content; a no-op when the entry (or the file) is absent.
     *
     * @throws HostFileAccessException if the file cannot be read or written.
     */
    fun removeInsrcServer(path: String) {
        val existing = readOrThrow(path) ?: return // absent file -> nothing to remove
        val root = parseObjectOrThrow(existing, path)
        val servers = root.getAsJsonObject("mcpServers") ?: return // no servers -> nothing to remove
        if (!servers.has(InsrcMcpRegistration.SERVER_KEY)) return // not present -> no-op
        servers.remove(InsrcMcpRegistration.SERVER_KEY)
        writeOrThrow(path, gson.toJson(root))
    }

    private fun parseObjectOrThrow(text: String, path: String): JsonObject =
        try {
            JsonParser.parseString(text).asJsonObject
        } catch (e: JsonSyntaxException) {
            throw HostFileAccessException("insrc: host mcp config is not valid JSON: $path", e)
        } catch (e: IllegalStateException) {
            throw HostFileAccessException("insrc: host mcp config is not a JSON object: $path", e)
        }

    private fun readOrThrow(path: String): String? =
        try {
            io.read(path)
        } catch (e: IOException) {
            throw HostFileAccessException("insrc: cannot read host mcp config $path", e)
        }

    private fun writeOrThrow(path: String, content: String) {
        try {
            io.write(path, content)
        } catch (e: IOException) {
            throw HostFileAccessException("insrc: cannot write host mcp config $path", e)
        }
    }
}
