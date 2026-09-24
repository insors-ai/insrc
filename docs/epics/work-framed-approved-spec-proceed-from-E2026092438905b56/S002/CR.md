<!-- insrc:artifact CR-38905b56cb44c4cf-s2 -->

# Code review: 38905b56cb44c4cf:s2

⚠️ **WARN** — HIGH 0 · MED 0 · LOW 1 · model `client`

**Changed files:** 5

## adherence — 1 finding(s)

| Severity | Location | Message |
| --- | --- | --- |
| LOW | src/daemon/index.ts:1372 | GROUNDING CAVEAT: the code-review graph for this Story is hollow — it indexed only bare diff file entries (src/daemon/index.ts, daemon-stream.ts, server.ts, schema-registry.test.ts) and did NOT index the new src/daemon/guide-sections.ts + src/mcp/guide/* at all, with no symbol/test edges. Adherence was judged by reading the diff + running the suite. Verdict: ADHERES. insrc_guide is read-only (readOnlyHint:true); the daemon guide.get/guide.list handlers reuse the EXPORTED readSteeringBlock() (the single canonical-asset reader steering-inject ships — k1, no copy) and shape every failure (read-throw / omitted / unknown workflow) as a structured InsrcGuideError inside guideGetResult/guideListResult so nothing escapes the IPC (k3/k5); no cloud/REST path. Follows the docgen daemon-IPC + thin-MCP-wrapper precedent. No project-rule breach. |

## conventions — 0 finding(s)

_No findings._

## coverage — 0 finding(s)

_No findings._

## quality — 0 finding(s)

_No findings._

