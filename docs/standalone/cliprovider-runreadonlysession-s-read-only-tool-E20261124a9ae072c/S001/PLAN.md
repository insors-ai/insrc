<!-- insrc:artifact PLAN-a9ae072ce3b7b794-s1 -->

# Plan: STORY-a9ae072ce3b7b794-s1

## Summary

**Epic:** `cliprovider-runreadonlysession-s-read-only-tool`
**LLD run:** `wf-1795508022085-ym3ik3`
**LLD effective hash:** `3fc16fcfd501...`

Building this Story means swapping one bad constant for a correct one on the vibe side, and adding a small, self-contained TOML-aware gate plus a native capability-discovery call on the codex side. The vibe fix is a single-file, low-risk rename-and-harden. The codex fix layers three independent pieces -- a filesystem walk that decides whether a session can even start, a discovery call that enumerates what's globally registered, and a pure argv builder -- then wires all three into the existing session flow so a codex read-only session either runs with a verified, native tool restriction or refuses clearly before any subprocess work happens.

## Contents

1. [Tasks](#1-tasks)
2. [Test-strategy coverage](#2-test-strategy-coverage)
3. [References](#3-references)

## 1. Tasks

| # | Task | Size | Status | Depends on | Tests | Derived from |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| 1 | **`t1`** Fix vibe's read-only tool allowlist and add verifyRuntime's required-tool check | S | — | — | unit: verifyRuntime throws when an unexpected tool is reported (existing behavior, unchanged); unit: verifyRuntime throws on an empty tools array or a tools array missing one or both analyze tools; live: claude: unchanged behavior re-confirmed as a regression guard; live: vibe: functional proofs unaffected by this round's change | [[c1]] [[c2]] |
| 2 | **`t2`** Add a TOML-parsing dependency and walkProjectMcpConfigLayers | M | — | — | unit: walkProjectMcpConfigLayers returns false for a cwd beneath a mocked home directory whose .codex/config.toml (the mocked global config) declares mcp_servers.insrc -- the default-case positive regression test; unit: THE REGRESSION TEST FOR THIS ROUND'S FINDING, using the exact cited layout: mocked CODEX_HOME=/work/repo/codex-state (declaring mcp_servers.insrc), mocked cwd=/work/repo/src, and a mocked /work/repo/.codex/config.toml declaring a mutation-sentinel server -- walkProjectMcpConfigLayers must return TRUE (the sentinel at the project root is still detected and refused) while the SEPARATE case of the same layout with NO sentinel at /work/repo must return false (global insrc remains allowed); unit: walkProjectMcpConfigLayers returns false when a mocked CODEX_HOME lies entirely outside cwd's own ancestor chain -- the exclusion comparison never matches, and the walk otherwise behaves exactly as the unbounded design would; unit: walkProjectMcpConfigLayers returns true when a genuine ancestor project layer (distinct from the global config by path) declares its own mcp_servers table, for each of the four valid TOML forms; unit: walkProjectMcpConfigLayers returns false for a cwd chain with no non-excluded .codex/config.toml at all | [[c3]] [[c4]] |
| 3 | **`t3`** Add discoverCodexMcpServers and replace codexReadOnlySessionArgs | M | — | — | unit: discoverCodexMcpServers' subprocess invocation places '-C', cwd BEFORE 'mcp', 'list', '--json'; unit: codexReadOnlySessionArgs, given insrc plus two other servers, returns the enabled_tools override and one disable override per other server; unit: codexReadOnlySessionArgs throws CodexMcpServerNotRegisteredError synchronously, with no argv constructed, when insrc is absent from the servers list; live: codex: the previously-covered misregistration, budget/cancellation, and functional-proof tests, unaffected by this round's exact-path-exclusion fix | [[c5]] [[c6]] [[c7]] |
| 4 | **`t4`** Rewire readOnlySessionOnce's codex branch to orchestrate the new checks | S | — | `t2`, `t3` | unit: readOnlySessionOnce throws CodexProjectMcpServersUnexcludableError and calls neither discoverCodexMcpServers nor runCodex when walkProjectMcpConfigLayers returns true; unit: readOnlySessionOnce throws ReadOnlySessionTimeoutError and never calls runCodex when discovery consumes the entire remaining budget; live: codex: a real runReadOnlySession call against THIS environment's own repo succeeds and is NOT refused by CodexProjectMcpServersUnexcludableError, run against the real global config rather than a mock; live: codex: the prior round's nested-working-directory mutation-sentinel test still results in CodexProjectMcpServersUnexcludableError; live: codex: the same refusal for a sentinel declared at the exact cwd via each of the four valid TOML forms | [[c8]] |

### 1.1 TASK-a9ae072ce3b7b794-s1-t1 — Fix vibe's read-only tool allowlist and add verifyRuntime's required-tool check

Add the READ_ONLY_SESSION_VIBE_TOOL_NAMES constant and replace the three independently-hardcoded ['read_file','mcp_insrc_*'] literals at cli-provider.ts:577/670/688-693 with it; add a required-tools-present condition to verifyRuntime alongside its existing unexpected-tool rejection.

**Acceptance checks:**
- READ_ONLY_SESSION_VIBE_TOOL_NAMES is the single source of truth read by all three call sites
- verifyRuntime throws when an unexpected tool is reported (existing behavior, unchanged)
- verifyRuntime throws when either of the two analyze-tool names is absent from the reported tools, including an empty tools array

### 1.2 TASK-a9ae072ce3b7b794-s1-t2 — Add a TOML-parsing dependency and walkProjectMcpConfigLayers

Add a minimal, pure-ESM TOML-parsing dependency (this repo has none today); implement walkProjectMcpConfigLayers(cwd), which resolves the global config's exact file path once and walks cwd to the filesystem root, skipping only the one layer whose own .codex/config.toml path exactly equals that resolved global path, parsing every other layer's config.toml and checking whether its mcp_servers value is non-empty.

**Acceptance checks:**
- walkProjectMcpConfigLayers returns false for the default case (home directory's own config.toml is the global config, declaring mcp_servers.insrc)
- walkProjectMcpConfigLayers returns true when a genuine ancestor layer (CODEX_HOME nested inside the project tree, project root distinct from CODEX_HOME) declares its own mcp_servers table, and false for the same layout with no such declaration
- walkProjectMcpConfigLayers returns false when CODEX_HOME lies entirely outside cwd's ancestor chain
- walkProjectMcpConfigLayers returns true for each of the four valid TOML forms (dotted header, bare header with dotted/nested keys, inline-table assignment, top-level dotted key-value)
- walkProjectMcpConfigLayers propagates a plain Error (not false) on a non-ENOENT read/parse failure at a non-excluded layer

### 1.3 TASK-a9ae072ce3b7b794-s1-t3 — Add discoverCodexMcpServers and replace codexReadOnlySessionArgs

Implement discoverCodexMcpServers(binPath, cwd, timeoutMs, signal) with the corrected '-C cwd mcp list --json' argv; replace the current 3-argument, unrestricted codexReadOnlySessionArgs with the new 4-argument, pure/synchronous builder that takes the discovered servers list, throws CodexMcpServerNotRegisteredError when insrc is absent, and otherwise emits the existing base argv plus the insrc enabled_tools override and one disable override per other server.

**Acceptance checks:**
- discoverCodexMcpServers' subprocess argv places '-C', cwd before 'mcp', 'list', '--json'
- discoverCodexMcpServers propagates a plain Error on non-zero exit, timeout, abort, or unparseable JSON
- codexReadOnlySessionArgs, given insrc plus other servers, returns the existing base argv plus the enabled_tools override and one disable override per other server, excluding insrc's own name
- codexReadOnlySessionArgs throws CodexMcpServerNotRegisteredError synchronously, with no argv constructed, when insrc is absent from the servers list

### 1.4 TASK-a9ae072ce3b7b794-s1-t4 — Rewire readOnlySessionOnce's codex branch to orchestrate the new checks

Rewrite readOnlySessionOnce's codex branch (cli-provider.ts:604-619) to, in order: call walkProjectMcpConfigLayers(exec.cwd) and throw CodexProjectMcpServersUnexcludableError if true; write the schema temp file as today; call discoverCodexMcpServers(this.binPath, exec.cwd, exec.timeoutMs, exec.signal); recompute the remaining budget and throw ReadOnlySessionTimeoutError if exhausted; call the new codexReadOnlySessionArgs with the discovery result; call runCodex (unmodified) with the recomputed timeoutMs; parse the reply exactly as today.

**Acceptance checks:**
- readOnlySessionOnce throws CodexProjectMcpServersUnexcludableError and calls neither discoverCodexMcpServers nor runCodex when walkProjectMcpConfigLayers returns true
- readOnlySessionOnce calls runCodex with the recomputed remaining timeoutMs, not the original, after discovery consumes part of the budget
- readOnlySessionOnce throws ReadOnlySessionTimeoutError and never calls runCodex when discovery consumes the entire remaining budget
- readOnlySessionOnce's existing claude/vibe branches and its post-exec reply-parsing logic are unchanged

## 2. Test-strategy coverage

| LLD strategy item | Covered by |
| :--- | :--- |
| walkProjectMcpConfigLayers returns false for a cwd beneath a mocked home directory whose .codex/config.toml (the mocked global config) declares mcp_servers.insrc -- the default-case positive regression test | `t2` |
| THE REGRESSION TEST FOR THIS ROUND'S FINDING, using the exact cited layout: mocked CODEX_HOME=/work/repo/codex-state (declaring mcp_servers.insrc), mocked cwd=/work/repo/src, and a mocked /work/repo/.codex/config.toml declaring a mutation-sentinel server -- walkProjectMcpConfigLayers must return TRUE (the sentinel at the project root is still detected and refused) while the SEPARATE case of the same layout with NO sentinel at /work/repo must return false (global insrc remains allowed) | `t2` |
| walkProjectMcpConfigLayers returns false when a mocked CODEX_HOME lies entirely outside cwd's own ancestor chain -- the exclusion comparison never matches, and the walk otherwise behaves exactly as the unbounded design would | `t2` |
| walkProjectMcpConfigLayers returns true when a genuine ancestor project layer (distinct from the global config by path) declares its own mcp_servers table, for each of the four valid TOML forms | `t2` |
| walkProjectMcpConfigLayers returns false for a cwd chain with no non-excluded .codex/config.toml at all | `t2` |
| discoverCodexMcpServers' subprocess invocation places '-C', cwd BEFORE 'mcp', 'list', '--json' | `t3` |
| codexReadOnlySessionArgs, given insrc plus two other servers, returns the enabled_tools override and one disable override per other server | `t3` |
| readOnlySessionOnce throws CodexProjectMcpServersUnexcludableError and calls neither discoverCodexMcpServers nor runCodex when walkProjectMcpConfigLayers returns true | `t4` |
| verifyRuntime throws on an empty tools array or a tools array missing one or both analyze tools | `t1` |
| codex: a real runReadOnlySession call against THIS environment's own repo succeeds and is NOT refused by CodexProjectMcpServersUnexcludableError, run against the real global config rather than a mock | `t4` |
| codex: the prior round's nested-working-directory mutation-sentinel test still results in CodexProjectMcpServersUnexcludableError | `t4` |
| codex: the same refusal for a sentinel declared at the exact cwd via each of the four valid TOML forms | `t4` |
| codex: the previously-covered misregistration, budget/cancellation, and functional-proof tests, unaffected by this round's exact-path-exclusion fix | `t3`, `t4` |
| vibe: functional proofs unaffected by this round's change | `t1` |
| claude: unchanged behavior re-confirmed as a regression guard | `t1` |

## 3. References

- **[[c1]]** `prior-artifact` `LLD s1 handoff item: READ_ONLY_SESSION_VIBE_TOOL_NAMES (new shared constant)`
- **[[c2]]** `prior-artifact` `LLD s1 handoff item: runVibe's verifyRuntime callback`
- **[[c3]]** `prior-artifact` `LLD s1 handoff item: walkProjectMcpConfigLayers (new module-level helper)`
- **[[c4]]** `prior-artifact` `LLD s1 dataModelChanges entity: codex project-local MCP config exclusion refusal, now excluding only the exact global config file`
- **[[c5]]** `prior-artifact` `LLD s1 handoff item: discoverCodexMcpServers (new module-level helper)`
- **[[c6]]** `prior-artifact` `LLD s1 handoff item: codexReadOnlySessionArgs (replaces the current definition at src/agent/providers/cli-provider.ts:143-145)`
- **[[c7]]** `prior-artifact` `LLD s1 dataModelChanges entity: codex read-only session argv (native per-server allowlist + other-server disable)`
- **[[c8]]** `prior-artifact` `LLD s1 handoff item: readOnlySessionOnce (private, codex branch -- replaces the current flow at src/agent/providers/cli-provider.ts:604-619)`
