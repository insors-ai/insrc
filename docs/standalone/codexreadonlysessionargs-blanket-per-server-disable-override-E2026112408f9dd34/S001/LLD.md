<!-- insrc:artifact LLD-08f9dd3412bc10f0-s1 -->

# LLD: STORY-08f9dd3412bc10f0-s1 — Verify per-server exclusion safety before disabling a globally-registered codex MCP server in a read-only session

## Summary

**Epic:** `codexreadonlysessionargs-blanket-per-server-disable-override`
**HLD base run:** `wf-1795518818139-voj048`
**HLD effective hash:** `c0d16c8b6b76...`

This Story makes a codex read-only session fail cleanly, with a clear named error, when one of the OTHER globally-registered MCP servers it tries to disable turns out to be one codex itself cannot accept a partial override for (confirmed live: codex's own built-in plugin servers codex_app and cua_repl crash codex's bootstrap, while node_repl's identical override succeeds). It recognizes codex's own specific bootstrap-failure wording and translates it into a precise refusal naming the unexcludable server, instead of letting an opaque, generic CLI-exit error surface -- with no extra subprocess calls and no change to the safe, already-working case.

## Contents

1. [HLD context](#1-hld-context)
2. [Contract details](#2-contract-details)
3. [Data model changes](#3-data-model-changes)
4. [Error paths](#4-error-paths)
5. [Test strategy](#5-test-strategy)
6. [Migration](#6-migration)
7. [Alternatives considered](#7-alternatives-considered)
8. [References](#8-references)

## 1. HLD context

**Framework:** Standalone feature — no parent HLD. Design directly against the repo, grounded on the s1 analyze passes. There are no HLD shared contracts to honour.
**Rollout phase:** standalone

## 2. Contract details

**Surface level:** internal

### 2.1 `CodexMcpServerOverrideUnsafeError (new error class)`

```typescript
export class CodexMcpServerOverrideUnsafeError extends Error { constructor(readonly serverName: string) }
```

**Parameters:**
- `serverName: string` — the globally-registered server name codex's own bootstrap refused to accept a partial enabled=false override for

**Returns:** `Error instance` — a named, explicit refusal identifying exactly which server's disable override codex's bootstrap rejected

**Postconditions:**
- thrown by readOnlySessionOnce's codex branch in place of letting the underlying CliExitError (or a plain Error from runCodex) surface unexplained, when that failure's own message matches codex's live-confirmed bootstrap-rejection wording

### 2.2 `readOnlySessionOnce (private, codex branch -- modifies the existing flow at src/agent/providers/cli-provider.ts:699-753)`

```typescript
private async readOnlySessionOnce<T>(prompt: string, schema: StructuredSchema, exec: ExecOverride & { cwd: string; timeoutMs: number; watchStall: boolean }): Promise<T>
```

**Parameters:**
- `prompt: string` — the task prompt
- `schema: StructuredSchema` — the output schema
- `exec: ExecOverride & { cwd: string; timeoutMs: number; watchStall: boolean }` — per-call overrides including the required cwd and the remaining deadline budget

**Returns:** `Promise<T>` — the parsed, schema-checked structured reply

**Errors:**
- `CodexProjectMcpServersUnexcludableError` when unchanged -- walkProjectMcpConfigLayers(exec.cwd) returns true
- `ReadOnlySessionTimeoutError` when unchanged -- discovery exhausts the remaining budget
- `CodexMcpServerOverrideUnsafeError` when NEW -- runCodex's call fails and its failure message matches codex's live-confirmed bootstrap-rejection wording naming one of the servers codexReadOnlySessionArgs tried to disable (confirmed live this session: codex_app, cua_repl); the server name is read from that same message
- `Error` when unchanged -- any other codex exec failure keeps surfacing as today (e.g. codex read-only session emitted no agent_message item, unparseable JSON)

**Preconditions:**
- this.kind === 'codex' branch

**Postconditions:**
- ordering is otherwise unchanged: walkProjectMcpConfigLayers, schema temp file, discoverCodexMcpServers, budget recompute, codexReadOnlySessionArgs, runCodex (unmodified), reply parsing -- the ONLY change is that a failure from the runCodex call is inspected for the bootstrap-rejection wording before being re-thrown as-is

## 3. Data model changes

### 3.1 `codex per-server override failure handling` — new

When runCodex's call in readOnlySessionOnce's codex branch fails, its message (CliExitError.said, the same field the existing failure-classification logic already reads) is checked against the live-confirmed pattern for codex's own 'invalid transport' bootstrap rejection naming a specific mcp_servers.<name> override; a match throws CodexMcpServerOverrideUnsafeError(name) instead of the original error. No match re-throws the original error unchanged.

**Call sites:**
- `src/agent/providers/cli-provider.ts:699-753`

## 4. Error paths

**Error cases**

- **codexReadOnlySessionArgs emits a disable override for codex_app or cua_repl (globally registered, enabled or disabled, same live profile as node_repl), and runCodex's codex invocation fails because codex's own bootstrap cannot accept a partial override for that server** (recoverable)
  - Detection: runCodex's failure message (the same `said` field the existing CliExitError classification already reads) matches the live-confirmed pattern for codex's own bootstrap rejection, 'Error loading config.toml: invalid transport' naming a specific `mcp_servers.<name>` entry
  - Response: readOnlySessionOnce throws CodexMcpServerOverrideUnsafeError(name) instead of letting the original CliExitError surface unexplained; the server name is read directly from the matched message
  - User impact: the codex read-only session fails with a clear, named reason identifying exactly which globally-registered server could not be safely excluded, instead of an opaque CLI exit message; no tool from any server (including insrc's own) was ever reachable, since codex's own bootstrap crashed before starting any session
- **codexReadOnlySessionArgs emits a disable override for node_repl (or any other server whose override codex accepts, confirmed live), and runCodex succeeds normally** (recoverable)
  - Detection: runCodex returns normally (no non-zero exit)
  - Response: readOnlySessionOnce proceeds exactly as today -- no new error path is exercised at all
  - User impact: none: the session starts restricted as designed, unaffected by this Story
- **runCodex fails for a reason unrelated to a per-server override (e.g. the existing 'no agent_message item' / unparseable-JSON / other codex exec failures already handled today)** (recoverable)
  - Detection: the failure message does not match the live-confirmed bootstrap-rejection pattern
  - Response: the original error is re-thrown exactly as today, unmodified -- this Story's new check only recognizes its own specific pattern and otherwise is a no-op
  - User impact: no behavior change for any failure this Story does not target

**Edge cases**

| Input | Expected |
| :--- | :--- |
| codex's failure message happens to match the bootstrap-rejection pattern but names a server NOT in the `servers` list codexReadOnlySessionArgs was given (should not occur given this Story's own argv construction, but the match is purely textual) | CodexMcpServerOverrideUnsafeError is still thrown with whatever name the message itself contains -- the error names the server codex itself blamed, not a server this code independently re-validates against its own servers list |
| more than one other globally-registered server is unexcludable (e.g. both codex_app and cua_repl are present); codex's own bootstrap reports only the FIRST one it encountered applying overrides | CodexMcpServerOverrideUnsafeError names only the one server codex's own message identifies; the session still refuses correctly, it simply does not enumerate every unsafe server in one error -- consistent with codex's own bootstrap failing on the first bad override it processes, not all of them |
| the insrc server itself is somehow the one named in a bootstrap-rejection message (not expected, since insrc's own override is enabled_tools, not enabled=false, and insrc's own registration is confirmed working live throughout this session) | CodexMcpServerOverrideUnsafeError still fires and names 'insrc' -- the check is purely textual on codex's own message, with no special-casing that would hide a genuine insrc-side failure |

**Invariants to preserve**

- codexReadOnlySessionArgs, given insrc plus other servers, still returns the existing base argv plus the enabled_tools override and one disable override per other server, excluding insrc's own name -- this Story changes ONLY how readOnlySessionOnce reacts to a resulting codex failure, never the argv-construction logic itself. [[c1]]
- readOnlySessionOnce's existing ordering (walkProjectMcpConfigLayers, schema temp file, discoverCodexMcpServers, budget recompute, codexReadOnlySessionArgs, runCodex, reply parsing) and its claude/vibe branches are unaffected -- this Story's new check is a single inspection of runCodex's own failure, added without reordering any existing step. [[c1]]

## 5. Test strategy

**Test framework:** `node:test (npx tsx --test), matching this repo's existing cli-provider/cli-readonly-session test suites`

**Test levels**

- **unit** — verify readOnlySessionOnce's new failure-translation logic against a fake codex binary, without spawning the real codex binary
  - Subjects: `readOnlySessionOnce throws CodexMcpServerOverrideUnsafeError('codex_app') when runCodex's failure message matches codex's live-confirmed bootstrap-rejection wording naming codex_app`, `readOnlySessionOnce throws CodexMcpServerOverrideUnsafeError('cua_repl') when runCodex's failure message matches the same wording naming cua_repl`, `readOnlySessionOnce proceeds normally (no new error) when the servers list includes node_repl and runCodex succeeds, exactly as today`, `readOnlySessionOnce re-throws the original, unmodified error when runCodex fails for a reason that does NOT match the bootstrap-rejection wording (e.g. a generic non-zero exit, or the existing 'no agent_message item' case)`
  - Fixtures: `a fake codex binary that can be scripted to exit non-zero with the exact live-confirmed 'Error loading config.toml: invalid transport in `mcp_servers.<name>`' stderr text for a given server name, alongside the existing script-stepping fake already used in cli-readonly-session.test.ts`
- **live** — prove, against the real installed codex binary (gated INSRC_LIVE_TESTS=1), that codex_app and cua_repl are refused cleanly and node_repl starts a restricted session successfully, without exposing any server's tools
  - Subjects: `codex: a real runReadOnlySession call whose discovered servers include codex_app or cua_repl throws CodexMcpServerOverrideUnsafeError naming that server, and no tool from any server was reachable (the session never started)`, `codex: a real runReadOnlySession call whose discovered servers include only node_repl (and insrc) succeeds and starts a restricted session as today`, `codex: the previously-covered misregistration, budget/cancellation, and project-config-refusal tests remain unaffected by this Story's change`
  - Fixtures: `real codex CLI binary installed and authenticated, gated by INSRC_LIVE_TESTS=1`, `this environment's own real codex_app and cua_repl registrations (already present, confirmed live this session) to exercise the refusal path, and node_repl to exercise the success path`

**Acceptance mapping**

| Criterion | Proving tests |
| :--- | :--- |
| `ac1` | `unit: readOnlySessionOnce throws CodexMcpServerOverrideUnsafeError('codex_app') on the matching bootstrap-rejection message`, `unit: readOnlySessionOnce throws CodexMcpServerOverrideUnsafeError('cua_repl') on the matching bootstrap-rejection message`, `live: a real session whose discovered servers include codex_app or cua_repl throws CodexMcpServerOverrideUnsafeError and never starts, exposing no tool` |
| `ac2` | `unit: readOnlySessionOnce proceeds normally when the servers list includes node_repl and runCodex succeeds`, `live: a real session whose discovered servers include node_repl succeeds and starts a restricted session` |
| `ac3` | `unit: readOnlySessionOnce re-throws the original, unmodified error when the failure does not match the bootstrap-rejection wording`, `live: the previously-covered misregistration, budget/cancellation, and project-config-refusal tests remain unaffected` |

## 6. Migration

**State before:** Per s1: codexReadOnlySessionArgs (src/agent/providers/cli-provider.ts:215-225) builds one '-c mcp_servers.<name>.enabled=false' override for every globally-registered server other than insrc, with no check of whether codex itself can accept a partial override for that server. readOnlySessionOnce's codex branch (src/agent/providers/cli-provider.ts:699-753) calls runCodex with that argv; a failure propagates as whatever generic error runCodex already produces (a plain CliExitError or similar), with no special handling. Confirmed live this session: when the discovered servers list includes codex_app or cua_repl, the resulting codex invocation crashes codex's entire bootstrap ('Error loading config.toml: invalid transport'), and that crash surfaces today as an opaque, unexplained CliExitError.

**State after:** readOnlySessionOnce's codex branch inspects a runCodex failure's own message for the live-confirmed bootstrap-rejection wording naming a specific mcp_servers.<name> override; a match throws the new, named CodexMcpServerOverrideUnsafeError(name) instead of the generic error. Every other failure mode, and the already-working success case (e.g. node_repl), is unchanged.

**Zero downtime:** yes — **Data rewrite:** no

**Steps**

1. add the new CodexMcpServerOverrideUnsafeError class — ↩ rollbackable
2. in readOnlySessionOnce's codex branch, catch a runCodex failure, check its message against the live-confirmed bootstrap-rejection pattern, and re-throw as CodexMcpServerOverrideUnsafeError(name) on a match, else re-throw the original error unchanged — ↩ rollbackable
3. add unit tests covering the new error path (codex_app, cua_repl) and the unchanged paths (node_repl success, a non-matching failure re-thrown as-is) — ↩ rollbackable

**Backward compat:** readOnlySessionOnce's public call surface (runReadOnlySession) and its claude/vibe branches are unaffected. For the codex branch, every existing failure mode that does NOT match the new bootstrap-rejection pattern is re-thrown exactly as before -- callers that already catch a generic Error/CliExitError from a codex read-only session continue to work unchanged. A caller that wants to distinguish this specific failure can now catch CodexMcpServerOverrideUnsafeError, a capability that did not exist before; nothing that worked before stops working.

## 7. Alternatives considered

### 7.1 a1: Catch codex's own refusal and translate it into a clear, named error — **CHOSEN**

Keep emitting one disable override per other server as today, but recognize codex's specific 'invalid transport in `mcp_servers.<name>`' bootstrap failure and convert it into a new, named CodexMcpServerOverrideUnsafeError(serverName) instead of letting an opaque CliExitError bubble up.

codexReadOnlySessionArgs keeps building the full argv exactly as it does today (one enabled_tools override for insrc, one enabled=false override per other server). The caller (readOnlySessionOnce) runs codex exactly once as today; if codex exits non-zero and its stderr matches the specific pattern confirmed live this session ('Error loading config.toml: invalid transport in `mcp_servers.<name>`'), the server name is extracted from the match and a new, named error is thrown identifying exactly which server's override codex refused, instead of a generic CliExitError. Codex's own bootstrap never starts a session in this failure case (confirmed live: exit 1 before any MCP server, including insrc's own tools, is reachable), so no tool from any server is ever exposed. No extra subprocess call is added.

### 7.2 a2: Proactively probe each other server's override safety before building the real session argv

Before constructing the real session argv, run one extra, cheap codex invocation per OTHER globally-registered server to test whether its disable override is safe, then build the real argv only from servers that passed.

Add a new per-server preflight: for each server other than insrc, run a minimal codex invocation (e.g. a schema-less exec with no prompt work) carrying ONLY that one server's '-c mcp_servers.<name>.enabled=false' override, and classify it as safe or unsafe by its exit code. Servers that fail the preflight make the whole read-only session refuse immediately (via a named error identifying them), before the real session argv is ever built or a real codex session is attempted.

**Rejected because:** Detects the problem earlier but at real added cost per session (one extra codex invocation per other globally-registered server), and does not actually remove the need for a1's reactive catch as a backstop against combined-override interactions -- strictly more expensive for no proven additional safety.

### 7.3 a3: Stop disabling other servers at all; rely solely on insrc's own enabled_tools scoping

Drop the 'one enabled=false override per other server' mechanism entirely and depend only on the insrc server's own enabled_tools allowlist to restrict the session.

codexReadOnlySessionArgs would emit only the insrc enabled_tools override and no disable overrides for any other server, relying on codex's own enabled_tools semantics to implicitly exclude every other server's tools from the session.

**Rejected because:** Removes the failure mode by reintroducing the exact tool-exposure gap this epic was built to close; rejected outright, not merely more expensive.

## 8. References

- **[[c1]]** `code` `src/agent/providers/cli-provider.ts:699-753` — "s1 how-does-it-work analyze bundle: current signatures, callers, and existing tests of codexReadOnlySessionArgs and discoverCodexMcpServers, also citing src/agent/providers/cli-provider.ts:187-206 and"
