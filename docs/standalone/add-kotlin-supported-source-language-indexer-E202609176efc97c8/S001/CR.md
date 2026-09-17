<!-- insrc:artifact CR-6efc97c8dc73e0aa-S001 -->

# Code review: 6efc97c8dc73e0aa:S001

⚠️ **WARN** — HIGH 0 · MED 0 · LOW 2 · model `client`

**Changed files:** 13

## adherence — 0 finding(s)

_No findings._

## conventions — 0 finding(s)

_No findings._

## coverage — 1 finding(s)

| Severity | Location | Message |
| --- | --- | --- |
| LOW | src/indexer/parser/kotlin.ts:55 | Two documented recall gaps — `fun interface` (grammar emits an ERROR node) and Ktor verb-named `client.get(url)` HTTP calls (excluded to avoid List.get/Map.get collisions) — have no test assertions. Acceptable: both are grammar-level / precision-driven limitations that cannot be exercised as passing behavior, and they are explicitly documented in the parser KDoc as known gaps rather than silently dropped. No fix needed. |

## quality — 1 finding(s)

| Severity | Location | Message |
| --- | --- | --- |
| LOW | src/indexer/parser/kotlin.ts:595 | tree-sitter-kotlin@0.3.8 sets rootNode.hasError=true on an otherwise fully-formed tree for compact single-line class bodies with no newline before the closing brace (e.g. `class G { val x = 1 }`), so such files get a spurious `signature:'parse-error'` marker. Impact is bounded: realistic multi-line Kotlin parses clean, entities still emit correctly under the marker, and no downstream code consumes it as a gate. It mirrors the Scala parser's identical behavior and is documented in the KDoc; suppressing it would risk masking genuinely broken files. Noted, not blocking. |

