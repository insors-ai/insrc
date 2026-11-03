<!-- insrc:artifact CR-866873cab2dedcc7-S001 -->

# Code review: 866873cab2dedcc7:S001

⚠️ **WARN** — HIGH 0 · MED 2 · LOW 10 · model `claude:claude-sonnet-5`

**Changed files:** 2

## adherence — 0 finding(s)

_No findings._

## conventions — 0 finding(s)

_No findings._

## coverage — 10 finding(s)

| Severity | Location | Message |
| --- | --- | --- |
| LOW | src/daemon/mcp-register.ts | daemonInstallRoot has no testsReaching edge in the graph, but the Story's test file src/daemon/__tests__/mcp-register.test.ts passes in full; likely exercised transitively but the call edge may be missing from the graph. |
| LOW | src/daemon/mcp-register.ts | runCli has no testsReaching edge in the graph, but the Story's test file passes in full (e.g. CLI add/spawn scenarios); likely exercised transitively but the call edge may be missing from the graph. |
| LOW | src/daemon/mcp-register.ts | defaultVibeConfigText has no testsReaching edge in the graph, but the Story's test file passes in full; likely exercised transitively but the call edge may be missing from the graph. |
| LOW | src/daemon/mcp-register.ts | defaultVibeHome has no testsReaching edge in the graph, but the Story's test file passes in full; likely exercised transitively but the call edge may be missing from the graph. |
| LOW | src/daemon/mcp-register.ts | defaultVibeAgentsMdText has no testsReaching edge, but its caller upsertVibeAgentsSteering is reached-passing and the AGENTS.md steering-block tests in the Story's test file pass; likely covered but the graph missed this edge. |
| LOW | src/daemon/mcp-register.ts | vibeServerTomlBlock has no testsReaching edge, but its caller upsertVibeProjectServer is reached-passing and the project .vibe/config.toml tests pass; likely covered but the graph missed this edge. |
| LOW | src/daemon/mcp-register.ts | defaultVibeProjectConfigText has no testsReaching edge in the graph, but the Story's test file passes in full (vibe+repoPath scenarios); likely exercised transitively but the call edge may be missing from the graph. |
| LOW | src/daemon/mcp-register.ts | alreadyRegistered has no testsReaching edge, but the 'existing insrc entry in mcp list' / 'substring only inside a path' passing titles in the Story's test file exercise this logic; likely covered but the graph missed this edge. |
| LOW | src/daemon/mcp-register.ts | clientPlans has no testsReaching edge, but its callers registerMcpClients and probeMcpClients are reached-passing; likely covered but the graph missed this edge. |
| LOW | src/daemon/mcp-register.ts | registerOne has no testsReaching edge, but its caller registerMcpClients is reached-passing and per-client registration titles in the Story's test file pass; likely covered but the graph missed this edge. |

## quality — 2 finding(s)

| Severity | Location | Message |
| --- | --- | --- |
| MED | src/daemon/mcp-register.ts:registerOne | registerOne takes 7 parameters — three of them bare callbacks (run, entrypointExists, vibeConfigText) plus a defaulted deps object — making the call site (registerMcpClients) and the function body hard to read and easy to miscall as the signature grows further. Collapsing the callback trio into deps (which already exists as a bag for this purpose) would remove the positional-callback pile-up. |
| MED | src/daemon/mcp-register.ts:vibeConfigHasServer | vibeConfigHasServer (checked against vibe project/agents config text) and alreadyRegistered (checked against CLI stdout) both exist to answer the same question — 'is this MCP server already registered for this client' — from two different evidence sources, and registerOne calls both. If their notions of 'already registered' ever diverge, registerOne's branching on the two independently can produce an inconsistent outcome (e.g. reporting 'registered' while the config-text path says 'unchanged', or vice versa) instead of funneling through one shared predicate. |

