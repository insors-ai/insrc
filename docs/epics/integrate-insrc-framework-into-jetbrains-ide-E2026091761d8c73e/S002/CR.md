<!-- insrc:artifact CR-61d8c73edb68041a-s2 -->

# Code review: 61d8c73edb68041a:s2

⚠️ **WARN** — HIGH 0 · MED 1 · LOW 0 · model `client`

**Changed files:** 1

## adherence — 0 finding(s)

_No findings._

## conventions — 0 finding(s)

_No findings._

## coverage — 1 finding(s)

| Severity | Location | Message |
| --- | --- | --- |
| MED | jetbrains-plugin/src/test/kotlin/ai/insors/insrc/jetbrains/host/ProjectOpenWiringTest.kt:57 | No test parses the written mcp.json as JSON — assertions are substring (contains MCP_BEGIN / LAUNCH). A JSON-parse assertion on the written file would have immediately caught the quality HIGH (invalid JSON). The write-failure isolation, no-op counting, and detection tests are otherwise genuinely toothed. |

## quality — 0 finding(s)

_No findings._

