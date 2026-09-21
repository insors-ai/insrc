package ai.insors.insrc.jetbrains.debug

import com.google.gson.JsonParser

/**
 * One parsed daemon/agent log line (Story E2026092157298940:S006) — the plugin projection
 * of the CLI LogLine (src/cli/services/debug-types.ts). [raw] is ALWAYS the verbatim line;
 * [timeMs]/[level]/[module]/[msg] are the best-effort pino-JSON fields (level = numeric pino
 * level, module = pino `name`, timeMs = `time`). A non-JSON / partial line keeps ONLY [raw],
 * so the level/module filters skip it while a free-text filter still matches via [raw].
 */
data class LogLine(
    val raw: String,
    val timeMs: Long?,
    val level: Int?,
    val module: String?,
    val msg: String?,
)

/**
 * The active view filter (Story S006) — mirrors the CLI LogFilter. [minLevel] keeps lines whose
 * numeric level >= minLevel; [module] is a case-insensitive substring on [LogLine.module];
 * [text] is a case-insensitive substring over [LogLine.raw]. An unset (null/blank) field imposes
 * no constraint; active fields are ANDed. An empty LogFilter matches every line.
 */
data class LogFilter(
    val minLevel: Int? = null,
    val module: String? = null,
    val text: String? = null,
)

/** Which tailable log this is (Story S006) — the closed CLI LogCategoryId union {daemon, agent}. */
enum class LogCategoryId { DAEMON, AGENT }

/**
 * A tailable log category (Story S006) — mirrors the CLI LogCategory. [stem] is the pino-roll
 * file stem used to glob `<stem>.<N>.log`.
 */
data class LogCategory(
    val id: LogCategoryId,
    val title: String,
    val stem: String,
)

/** The two tailable categories, in order (mirrors the CLI LOG_CATEGORIES). */
object LogCategories {
    val all: List<LogCategory> = listOf(
        LogCategory(LogCategoryId.DAEMON, "Daemon", "daemon"),
        LogCategory(LogCategoryId.AGENT, "Agent", "agent"),
    )
}

/**
 * The pino numeric levels (Story S006) — mirrors the CLI LEVELS map. Drives the level-filter
 * parse ([parseLevel]) and the display ([label]).
 */
object LogLevels {
    /** name -> numeric pino level, in ascending order. */
    val byName: Map<String, Int> = linkedMapOf(
        "trace" to 10, "debug" to 20, "info" to 30, "warn" to 40, "error" to 50, "fatal" to 60,
    )
    private val byNumber: Map<Int, String> = byName.entries.associate { (k, v) -> v to k }

    /** A numeric level -> its UPPER-CASE name, or the raw number for an unknown level; "" for null. */
    fun label(level: Int?): String {
        if (level == null) return ""
        return byNumber[level]?.uppercase() ?: level.toString()
    }

    /**
     * Parse a level-filter token: a name like 'warn' (case-insensitive) or a numeric string;
     * a blank token clears the filter (null); an unrecognised token is null.
     */
    fun parseLevel(token: String): Int? {
        val t = token.trim().lowercase()
        if (t.isEmpty()) return null
        byName[t]?.let { return it }
        return t.toIntOrNull()
    }
}

/**
 * Best-effort parse of one raw tail line into a [LogLine] (Story S006), mirroring the CLI
 * parseLogLine byte-for-byte: a pino-JSON object fills timeMs(`time`)/level(`level`)/module(`name`)/
 * msg(`msg`); a non-JSON / partial / non-object line keeps ONLY [raw] (the others null). Numbers
 * arrive as JSON numbers and are coerced to Long/Int. NEVER throws (a malformed line -> raw only).
 */
fun parseLogLine(raw: String): LogLine {
    try {
        val el = JsonParser.parseString(raw)
        if (el.isJsonObject) {
            val o = el.asJsonObject
            fun num(key: String): Number? =
                o.get(key)?.takeIf { it.isJsonPrimitive && it.asJsonPrimitive.isNumber }?.asNumber
            fun str(key: String): String? =
                o.get(key)?.takeIf { it.isJsonPrimitive && it.asJsonPrimitive.isString }?.asString
            return LogLine(
                raw = raw,
                timeMs = num("time")?.toLong(),
                level = num("level")?.toInt(),
                module = str("name"),
                msg = str("msg"),
            )
        }
    } catch (e: Exception) {
        // non-JSON / malformed -> raw only
    }
    return LogLine(raw = raw, timeMs = null, level = null, module = null, msg = null)
}

/**
 * The pure view-filter predicate (Story S006), mirroring the CLI matchesFilter EXACTLY: [minLevel]
 * keeps lines whose numeric level >= minLevel (a null-level line is DROPPED by an active minLevel);
 * [module] is a case-insensitive substring on [LogLine.module] (a null module is DROPPED by an
 * active module filter); [text] is a case-insensitive substring over [LogLine.raw] (free-text still
 * matches a non-JSON line via raw). An unset/blank field imposes no constraint; active fields ANDed.
 */
fun matchesFilter(line: LogLine, filter: LogFilter): Boolean {
    filter.minLevel?.let { min ->
        val lvl = line.level ?: return false
        if (lvl < min) return false
    }
    filter.module?.takeIf { it.isNotEmpty() }?.let { mod ->
        val m = line.module ?: return false
        if (!m.lowercase().contains(mod.lowercase())) return false
    }
    filter.text?.takeIf { it.isNotEmpty() }?.let { txt ->
        if (!line.raw.lowercase().contains(txt.lowercase())) return false
    }
    return true
}
