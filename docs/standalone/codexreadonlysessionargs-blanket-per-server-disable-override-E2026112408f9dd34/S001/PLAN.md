<!-- insrc:artifact PLAN-08f9dd3412bc10f0-s1 -->

# Plan: STORY-08f9dd3412bc10f0-s1

## Summary

**Epic:** `codexreadonlysessionargs-blanket-per-server-disable-override`
**LLD run:** `wf-1795518818139-voj048`
**LLD effective hash:** `c0d16c8b6b76...`

Building this Story means wrapping the one existing codex subprocess call inside readOnlySessionOnce's codex branch with a narrow catch: when that call fails with codex's own live-confirmed bootstrap-rejection wording, the failure is translated into a new, named CodexMcpServerOverrideUnsafeError identifying the unexcludable server; every other failure, and the already-working success path, passes through completely unchanged. No new subprocess calls, no reordering of the existing discovery/argv-build/exec flow.

## Contents

1. [Tasks](#1-tasks)
2. [Test-strategy coverage](#2-test-strategy-coverage)
3. [References](#3-references)

## 1. Tasks

| # | Task | Size | Status | Depends on | Tests | Derived from |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| 1 | **`t1`** Add CodexMcpServerOverrideUnsafeError and catch-translate it in readOnlySessionOnce's codex branch | S | — | — | unit: readOnlySessionOnce throws CodexMcpServerOverrideUnsafeError('codex_app') when runCodex's failure message matches codex's live-confirmed bootstrap-rejection wording naming codex_app | [[c1]] [[c2]] |
| 2 | **`t2`** Unit test the new failure-translation path with a scripted fake codex binary | M | — | `t1` | unit: readOnlySessionOnce throws CodexMcpServerOverrideUnsafeError('codex_app') when runCodex's failure message matches codex's live-confirmed bootstrap-rejection wording naming codex_app; unit: readOnlySessionOnce throws CodexMcpServerOverrideUnsafeError('cua_repl') when runCodex's failure message matches the same wording naming cua_repl; unit: readOnlySessionOnce proceeds normally (no new error) when the servers list includes node_repl and runCodex succeeds, exactly as today; unit: readOnlySessionOnce re-throws the original, unmodified error when runCodex fails for a reason that does NOT match the bootstrap-rejection wording (e.g. a generic non-zero exit, or the existing 'no agent_message item' case) | [[c1]] [[c2]] [[c3]] |
| 3 | **`t3`** Live-test the refusal and success paths against the real codex binary | S | — | `t1` | live: codex: a real runReadOnlySession call whose discovered servers include codex_app or cua_repl throws CodexMcpServerOverrideUnsafeError naming that server, and no tool from any server was reachable (the session never started); live: codex: a real runReadOnlySession call whose discovered servers include only node_repl (and insrc) succeeds and starts a restricted session as today; live: codex: the previously-covered misregistration, budget/cancellation, and project-config-refusal tests remain unaffected by this Story's change | [[c1]] [[c3]] |

### 1.1 TASK-08f9dd3412bc10f0-s1-t1 — Add CodexMcpServerOverrideUnsafeError and catch-translate it in readOnlySessionOnce's codex branch

Export a new `CodexMcpServerOverrideUnsafeError extends Error` class carrying `serverName`. Wrap the existing `this.runCodex(codexReadOnlySessionArgs(...), ...)` call inside readOnlySessionOnce's codex branch (cli-provider.ts:741) in a try/catch: on catch, read `err instanceof CliExitError ? err.said : (err as Error).message`, match it against codex's live-confirmed bootstrap-rejection pattern ('Error loading config.toml: invalid transport in `mcp_servers.<name>`'); on a match throw `CodexMcpServerOverrideUnsafeError(name)` with the extracted server name, else re-throw the original error unchanged. No other step in readOnlySessionOnce's codex branch (walkProjectMcpConfigLayers, schema temp file, discoverCodexMcpServers, budget recompute, codexReadOnlySessionArgs, reply parsing) is reordered or modified.

**Acceptance checks:**
- CodexMcpServerOverrideUnsafeError is exported from cli-provider.ts with a readonly serverName field
- readOnlySessionOnce's codex branch catches a runCodex failure and translates it per the pattern match, with every other step in the branch unchanged in order and behavior
- a failure that does not match the pattern is re-thrown exactly as before (same type, same message)

### 1.2 TASK-08f9dd3412bc10f0-s1-t2 — Unit test the new failure-translation path with a scripted fake codex binary

Extend the existing fake-codex test harness (cli-readonly-session.test.ts) to script a non-zero exit whose stderr is the exact live-confirmed bootstrap-rejection text naming a given server, and add unit tests: readOnlySessionOnce throws CodexMcpServerOverrideUnsafeError('codex_app') and CodexMcpServerOverrideUnsafeError('cua_repl') on the matching message; proceeds normally (no new error) when the servers list includes node_repl and runCodex succeeds; re-throws the original, unmodified error when the failure does not match the pattern (e.g. a generic non-zero exit or the existing 'no agent_message item' case).

**Acceptance checks:**
- ac1's two unit tests (codex_app, cua_repl) pass against the fake codex harness
- ac2's unit test (node_repl success, unaffected) passes
- ac3's unit test (non-matching failure re-thrown unchanged, same type and message) passes
- no existing test in cli-readonly-session.test.ts or cli-codex-strict-schema.test.ts regresses

### 1.3 TASK-08f9dd3412bc10f0-s1-t3 — Live-test the refusal and success paths against the real codex binary

Add INSRC_LIVE_TESTS=1-gated live tests: a real runReadOnlySession call whose discovered servers include codex_app or cua_repl throws CodexMcpServerOverrideUnsafeError naming that server and never starts a session (no tool from any server reachable); a real call whose discovered servers include node_repl (and insrc) succeeds and starts a restricted session as today; confirm the previously-covered misregistration, budget/cancellation, and project-config-refusal live tests remain unaffected.

**Acceptance checks:**
- live: codex_app or cua_repl in the discovered servers list throws CodexMcpServerOverrideUnsafeError naming that server, no session starts
- live: node_repl in the discovered servers list starts a restricted session successfully, as today
- live: existing misregistration / budget-cancellation / project-config-refusal tests still pass unchanged

## 2. Test-strategy coverage

| LLD strategy item | Covered by |
| :--- | :--- |
| readOnlySessionOnce throws CodexMcpServerOverrideUnsafeError('codex_app') when runCodex's failure message matches codex's live-confirmed bootstrap-rejection wording naming codex_app | `t2` |
| readOnlySessionOnce throws CodexMcpServerOverrideUnsafeError('cua_repl') when runCodex's failure message matches the same wording naming cua_repl | `t2` |
| readOnlySessionOnce proceeds normally (no new error) when the servers list includes node_repl and runCodex succeeds, exactly as today | `t2` |
| readOnlySessionOnce re-throws the original, unmodified error when runCodex fails for a reason that does NOT match the bootstrap-rejection wording (e.g. a generic non-zero exit, or the existing 'no agent_message item' case) | `t2` |
| codex: a real runReadOnlySession call whose discovered servers include codex_app or cua_repl throws CodexMcpServerOverrideUnsafeError naming that server, and no tool from any server was reachable (the session never started) | `t3` |
| codex: a real runReadOnlySession call whose discovered servers include only node_repl (and insrc) succeeds and starts a restricted session as today | `t3` |
| codex: the previously-covered misregistration, budget/cancellation, and project-config-refusal tests remain unaffected by this Story's change | `t3` |

## 3. References

- **[[c1]]** `prior-artifact` `LLD 08f9dd3412bc10f0 s1 errorPaths+invariantsToPreserve+summary`
- **[[c2]]** `code` `src/agent/providers/cli-provider.ts:699-753`
- **[[c3]]** `prior-artifact` `LLD 08f9dd3412bc10f0 s1 testStrategy`
