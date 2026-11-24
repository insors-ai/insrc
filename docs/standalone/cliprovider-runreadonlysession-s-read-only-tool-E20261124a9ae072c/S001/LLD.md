<!-- insrc:artifact LLD-a9ae072ce3b7b794-s1 -->

# LLD: STORY-a9ae072ce3b7b794-s1

## Summary

**Epic:** `cliprovider-runreadonlysession-s-read-only-tool`
**HLD base run:** `wf-1795508022085-ym3ik3`
**HLD effective hash:** `3fc16fcfd501...`

This Story closes CliProvider.runReadOnlySession's full tool-restriction gap for codex and vibe (claude's existing --allowedTools mechanism already works correctly and is untouched). Vibe's three independently-hardcoded, wrong tool-name lists become one corrected constant, with a check that the two intended analyze tools are actually present. Codex gains a native enabled_tools allowlist for insrc plus dynamic disabling of every other globally-registered server, discovered via a budgeted, cancellable `codex -C cwd mcp list --json` call -- and, before any of that, the session refuses to start if any directory from cwd to the filesystem root (other than the one layer whose own .codex/config.toml is, by exact path, the real global config file) declares its own mcp_servers table, since such a server cannot be enumerated or excluded by this Story's discovery mechanism.

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

### 2.1 `READ_ONLY_SESSION_VIBE_TOOL_NAMES (new shared constant)`

```typescript
export const READ_ONLY_SESSION_VIBE_TOOL_NAMES: readonly string[] = ['read_file', 'grep', 'insrc_insrc_analyze', 'insrc_insrc_analyze_step']
```

**Returns:** `readonly string[]` — the single source of truth for vibe's read-only tool allowlist

**Postconditions:**
- replaces the three currently-independent, currently-wrong ['read_file','mcp_insrc_*'] literals at cli-provider.ts:577, cli-provider.ts:670, and cli-provider.ts:688-693

### 2.2 `runVibe's verifyRuntime callback`

```typescript
verifyRuntime?: (runtime: Record<string, unknown>) => void
```

**Parameters:**
- `runtime: Record<string, unknown>` — the vibe app-server's own reported runtime policy, including its resolved tools array

**Returns:** `void` — throws on policy mismatch, otherwise returns normally

**Errors:**
- `Error` when today (cli-provider.ts:690-693): any reported tool's name is neither 'read_file' nor startsWith('mcp_insrc_'), or bypassToolPermissions!==false, or tools is not an array. AFTER this Story: the comparison uses READ_ONLY_SESSION_VIBE_TOOL_NAMES' exact names, AND a second condition throws when either of its two analyze-tool names is absent from the reported tools

**Preconditions:**
- unchanged -- only invoked when runVibe's `allowed` ternary (line 670) is non-undefined

**Postconditions:**
- two independent failure conditions: an unexpected tool present, or a required tool absent

### 2.3 `walkProjectMcpConfigLayers (new module-level helper)`

```typescript
async function walkProjectMcpConfigLayers(cwd: string): Promise<boolean>
```

**Parameters:**
- `cwd: string` — the session's target working directory, the deepest layer to check

**Returns:** `Promise<boolean>` — true if cwd OR any ancestor directory up to the filesystem root, EXCLUDING only the one layer whose own .codex/config.toml path exactly equals the resolved global config file's path, has its own .codex/config.toml whose TOML-parsed `mcp_servers` value is a non-empty object, in any valid TOML form; false if no such layer exists

**Errors:**
- `Error` when an existing, non-excluded .codex/config.toml at any checked layer cannot be read (non-ENOENT) or fails to parse as valid TOML

**Preconditions:**
- none -- a pure presence check per layer, parsed with a real TOML parser; does not evaluate codex's own trust_level or layer-merge/override precedence

**Postconditions:**
- resolves globalConfigPath = join(process.env.CODEX_HOME || join(homedir(), '.codex'), 'config.toml') ONCE; walks cwd to the filesystem root, and at each directory `dir` builds candidatePath = join(dir, '.codex', 'config.toml'); if candidatePath === globalConfigPath, that one layer is treated as clear WITHOUT being read (it is already fully handled by discoverCodexMcpServers) and the walk continues; every other layer is checked normally. This exact-path comparison -- not a directory-containment boundary -- correctly skips only the one default-case coincidence (confirmed live: at this environment's home directory, dir/.codex/config.toml literally equals the resolved global config path) while never wrongly excluding a genuine project layer when CODEX_HOME is configured inside a project tree (the two paths then never coincide, so nothing above or beside CODEX_HOME is skipped); when CODEX_HOME lies outside cwd's own ancestor chain entirely, the comparison simply never matches and the walk behaves as if no global config existed on this path

### 2.4 `discoverCodexMcpServers (new module-level helper)`

```typescript
async function discoverCodexMcpServers(binPath: string, cwd: string, timeoutMs: number, signal?: AbortSignal): Promise<readonly { readonly name: string; readonly enabled: boolean }[]>
```

**Parameters:**
- `binPath: string` — the codex binary to invoke
- `cwd: string` — the session's real working directory
- `timeoutMs: number` — the remaining budget available for this discovery call
- `signal: AbortSignal` _(optional)_ — the caller's cancellation signal

**Returns:** `Promise<readonly { readonly name: string; readonly enabled: boolean }[]>` — the parsed JSON array `codex -C cwd mcp list --json` prints, one entry per GLOBALLY-registered MCP server

**Errors:**
- `Error` when the subprocess exits non-zero (confirmed live: codex exits 2 if -C is placed after the subcommand instead of before it), times out, is aborted via signal, or prints unparseable JSON

**Preconditions:**
- codex itself is installed and runnable; only called after walkProjectMcpConfigLayers(cwd) has returned false

**Postconditions:**
- unchanged: subprocess argv is `[binPath, '-C', cwd, 'mcp', 'list', '--json']`

### 2.5 `codexReadOnlySessionArgs (replaces the current definition at cli-provider.ts:143-145)`

```typescript
function codexReadOnlySessionArgs(schemaPath: string, cwd: string, modelArgs: readonly string[], servers: readonly { readonly name: string; readonly enabled: boolean }[]): string[]
```

**Parameters:**
- `schemaPath: string` — path to the written output-schema JSON file
- `cwd: string` — the working directory passed via -C
- `modelArgs: readonly string[]` — model-selection args appended after the fixed flags
- `servers: readonly { readonly name: string; readonly enabled: boolean }[]` — the globally-registered server list from discoverCodexMcpServers

**Returns:** `string[]` — the full codex exec argv

**Errors:**
- `CodexMcpServerNotRegisteredError` when the insrc MCP server is not present in `servers`

**Preconditions:**
- servers reflects a discovery call made against the same cwd this argv's -C will use; walkProjectMcpConfigLayers(cwd) has already returned false

**Postconditions:**
- unchanged: returns the existing base argv plus one '-c mcp_servers.<insrc>.enabled_tools=[...]' and one '-c mcp_servers.<other>.enabled=false' per other server

### 2.6 `readOnlySessionOnce (private, codex branch -- replaces the current flow at cli-provider.ts:604-619)`

```typescript
private async readOnlySessionOnce<T>(prompt: string, schema: StructuredSchema, exec: ExecOverride & { cwd: string; timeoutMs: number; watchStall: boolean }): Promise<T>
```

**Parameters:**
- `prompt: string` — the task prompt
- `schema: StructuredSchema` — the output schema
- `exec: ExecOverride & { cwd: string; timeoutMs: number; watchStall: boolean }` — per-call overrides including the required cwd and the remaining deadline budget

**Returns:** `Promise<T>` — the parsed, schema-checked structured reply

**Errors:**
- `CodexProjectMcpServersUnexcludableError` when walkProjectMcpConfigLayers(exec.cwd) returns true -- a genuine, non-global project-local layer declares mcp_servers
- `ReadOnlySessionTimeoutError` when after discoverCodexMcpServers completes, the remaining budget is exhausted
- `Error` when unchanged -- codex read-only session emitted no agent_message / unparseable JSON

**Preconditions:**
- this.kind === 'codex' branch

**Postconditions:**
- unchanged ordering: (1) walkProjectMcpConfigLayers(exec.cwd) -- now using the exact-path exclusion; (2) schema temp file; (3) discoverCodexMcpServers; (4) budget recompute; (5) codexReadOnlySessionArgs; (6) runCodex (unmodified); (7) parse reply

## 3. Data model changes

### 3.1 `codex read-only session argv (native per-server allowlist + other-server disable)` — new

Unchanged: codexReadOnlySessionArgs carries one '-c mcp_servers.<insrc>.enabled_tools=[...]' and one '-c mcp_servers.<other>.enabled=false' per other globally-registered server.

**Call sites:**
- `src/agent/providers/cli-provider.ts:143-145`
- `src/agent/providers/cli-provider.ts:604-619`

### 3.2 `codex project-local MCP config exclusion refusal, now excluding only the exact global config file` — new

walkProjectMcpConfigLayers walks cwd to the filesystem root, excluding by EXACT PATH IDENTITY only the one layer that is the real global config file -- not a directory-containment boundary -- confirmed by direct trace this round that a directory boundary wrongly excludes a genuine project layer when CODEX_HOME is configured inside the project tree.

**Call sites:**
- `src/agent/providers/cli-provider.ts:604-619`

### 3.3 `vibe read-only tool name/toolset mapping and required-tool verification` — field-modify

Unchanged: the three independently-hardcoded, wrong literals become one READ_ONLY_SESSION_VIBE_TOOL_NAMES constant; verifyRuntime additionally requires both analyze tools to be present.

**Call sites:**
- `src/agent/providers/cli-provider.ts:577`
- `src/agent/providers/cli-provider.ts:670`
- `src/agent/providers/cli-provider.ts:688-693`

## 4. Error paths

**Error cases**

- **a genuine project-local layer (anywhere from cwd to the filesystem root, other than the one layer that IS the global config file by exact path) declares a non-empty mcp_servers value, in any valid TOML form** (recoverable)
  - Detection: walkProjectMcpConfigLayers parses that layer's config.toml with a real TOML parser and inspects the parsed `mcp_servers` value directly, having first confirmed its path does not equal the resolved global config path
  - Response: readOnlySessionOnce throws CodexProjectMcpServersUnexcludableError immediately, before discoverCodexMcpServers or any subprocess is spawned at all
  - User impact: a codex read-only session targeting that cwd cannot run until the project-local mcp_servers table is removed, or the caller routes the session through claude/vibe instead
- **CODEX_HOME is configured INSIDE the project tree (e.g. CODEX_HOME=/work/repo/codex-state, cwd=/work/repo/src), and /work/repo/.codex/config.toml (a genuine, distinct project layer) declares mcp_servers** (recoverable)
  - Detection: walkProjectMcpConfigLayers's exact-path comparison correctly finds candidatePath (/work/repo/.codex/config.toml) does NOT equal globalConfigPath (/work/repo/codex-state/config.toml), so this layer is read and checked normally, not skipped
  - Response: readOnlySessionOnce throws CodexProjectMcpServersUnexcludableError, exactly as for any other genuine project layer -- this is the regression this round's finding specifically demanded
  - User impact: correctly refused, where the withdrawn directory-boundary design would have silently missed it
- **a layer's .codex/config.toml (not the excluded global one) exists but cannot be read or fails to parse as valid TOML** (recoverable)
  - Detection: walkProjectMcpConfigLayers' own file-read/parse call for that layer fails for a reason other than ENOENT
  - Response: propagates as a plain Error -- treated as inability to verify exclusion, not evidence of its absence
  - User impact: a codex read-only session fails clearly rather than silently assuming no project-local servers exist at a layer that could not actually be checked
- **no non-excluded directory between cwd and the filesystem root has a .codex/config.toml at all (the common case)** (recoverable)
  - Detection: walkProjectMcpConfigLayers' ENOENT branch at every non-excluded checked layer
  - Response: returns false; the session proceeds to discoverCodexMcpServers and the real codex exec call
  - User impact: none
- **discoverCodexMcpServers' subprocess exits non-zero, or consumes most of the remaining deadline budget** (recoverable)
  - Detection: the subprocess's own non-zero exit code, or readOnlySessionOnce's budget recomputation after discovery resolves
  - Response: propagates as a plain Error, or throws ReadOnlySessionTimeoutError before the real codex exec call if the remaining budget is <= 0
  - User impact: fails clearly rather than silently proceeding with a malformed discovery result or an already-exhausted timeout
- **the insrc MCP server is not present in discoverCodexMcpServers' returned list (misnamed or never registered)** (recoverable)
  - Detection: codexReadOnlySessionArgs checks `servers` for a matching name before constructing any -c override
  - Response: throws CodexMcpServerNotRegisteredError before constructing any argv
  - User impact: a clear, named error identifying the misconfiguration instead of an opaque codex bootstrap failure
- **a vibe app-server reports a tools array missing one or both of READ_ONLY_SESSION_VIBE_TOOL_NAMES' two analyze-tool names** (terminal)
  - Detection: verifyRuntime's required-tools-present condition
  - Response: throws 'Vibe app server did not verify the read-only tool policy'
  - User impact: a vibe regression that silently drops the analyze tools is caught as a hard failure

**Edge cases**

| Input | Expected |
| :--- | :--- |
| the default case: a codex read-only session targeting a cwd beneath the user's home directory, with the real global config at $HOME/.codex/config.toml declaring mcp_servers.insrc and nothing else registered anywhere between cwd and the filesystem root | walkProjectMcpConfigLayers's exact-path comparison matches exactly at the home-directory layer, skips it without reading it, finds no other declaring layer, and returns false -- the session proceeds normally, confirmed live against this environment's own real repo and real ~/.codex/config.toml |
| CODEX_HOME lies entirely OUTSIDE cwd's own ancestor chain (e.g. on a different drive/mount, or simply nowhere on the path from cwd to the filesystem root) | candidatePath never equals globalConfigPath at any checked layer, so no layer is ever skipped -- the walk behaves exactly as if no global-config exclusion existed, checking every real ancestor directory's own .codex/config.toml normally; this requires no special-casing, it falls out of the exact-path comparison on its own |
| a .codex/config.toml exists at some non-excluded layer and contains other tables but its parsed mcp_servers value is absent or empty | walkProjectMcpConfigLayers treats that layer as clear and continues checking the remaining layers |
| CODEX_HOME is itself literally named '.codex' and sits one level above cwd somewhere other than home (e.g. /work/.codex as CODEX_HOME, cwd=/work/repo) | candidatePath for dir=/work is join('/work', '.codex', 'config.toml') = '/work/.codex/config.toml', which DOES equal globalConfigPath in this specific naming coincidence -- correctly skipped, since it genuinely IS the global config file by exact path identity, not merely by directory containment |

**Invariants to preserve**

- discoverCodexMcpServers and codexReadOnlySessionArgs' own behavior (argv ordering, enabled_tools/disable overrides, CodexMcpServerNotRegisteredError) are completely unchanged by this round's exact-path-exclusion fix -- only walkProjectMcpConfigLayers' own exclusion logic changes [[c1]]

## 5. Test strategy

**Test framework:** `node:test (npx tsx --test), matching this repo's existing security-review and cli-provider test suites`

**Test levels**

- **unit** — verify walkProjectMcpConfigLayers' exact-path exclusion, including the review's cited CODEX_HOME-inside-project layout and the CODEX_HOME-outside-ancestor-chain case, without spawning any subprocess
  - Subjects: `walkProjectMcpConfigLayers returns false for a cwd beneath a mocked home directory whose .codex/config.toml (the mocked global config) declares mcp_servers.insrc -- the default-case positive regression test`, `THE REGRESSION TEST FOR THIS ROUND'S FINDING, using the exact cited layout: mocked CODEX_HOME=/work/repo/codex-state (declaring mcp_servers.insrc), mocked cwd=/work/repo/src, and a mocked /work/repo/.codex/config.toml declaring a mutation-sentinel server -- walkProjectMcpConfigLayers must return TRUE (the sentinel at the project root is still detected and refused) while the SEPARATE case of the same layout with NO sentinel at /work/repo must return false (global insrc remains allowed)`, `walkProjectMcpConfigLayers returns false when a mocked CODEX_HOME lies entirely outside cwd's own ancestor chain -- the exclusion comparison never matches, and the walk otherwise behaves exactly as the unbounded design would`, `walkProjectMcpConfigLayers returns true when a genuine ancestor project layer (distinct from the global config by path) declares its own mcp_servers table, for each of the four valid TOML forms`, `walkProjectMcpConfigLayers returns false for a cwd chain with no non-excluded .codex/config.toml at all`
  - Fixtures: `nested temp directory trees simulating the exact cited layout (project root / src subdirectory / a CODEX_HOME directory inside the project tree), plus the default home-directory layout, with mocked homedir()/CODEX_HOME so the boundary computation is testable without touching the real ~/.codex`
- **unit** — verify discoverCodexMcpServers' corrected argv, codexReadOnlySessionArgs' pure construction, and readOnlySessionOnce's ordering -- unchanged from the prior round
  - Subjects: `discoverCodexMcpServers' subprocess invocation places '-C', cwd BEFORE 'mcp', 'list', '--json'`, `codexReadOnlySessionArgs, given insrc plus two other servers, returns the enabled_tools override and one disable override per other server`, `readOnlySessionOnce throws CodexProjectMcpServersUnexcludableError and calls neither discoverCodexMcpServers nor runCodex when walkProjectMcpConfigLayers returns true`, `verifyRuntime throws on an empty tools array or a tools array missing one or both analyze tools`
  - Fixtures: `a mocked/intercepted subprocess call standing in for `codex mcp list --json`, and mocked walkProjectMcpConfigLayers/discoverCodexMcpServers/runCodex to assert call order`
- **live** — prove, against the real installed codex binary (gated INSRC_LIVE_TESTS=1) and this environment's own real home-directory global config, the positive, negative, and CODEX_HOME-inside-project cases
  - Subjects: `codex: a real runReadOnlySession call against THIS environment's own repo succeeds and is NOT refused by CodexProjectMcpServersUnexcludableError, run against the real global config rather than a mock`, `codex: the prior round's nested-working-directory mutation-sentinel test still results in CodexProjectMcpServersUnexcludableError`, `codex: the same refusal for a sentinel declared at the exact cwd via each of the four valid TOML forms`, `codex: the previously-covered misregistration, budget/cancellation, and functional-proof tests, unaffected by this round's exact-path-exclusion fix`, `vibe: functional proofs unaffected by this round's change`, `claude: unchanged behavior re-confirmed as a regression guard`
  - Fixtures: `real codex CLI binary installed and authenticated, gated by INSRC_LIVE_TESTS=1`, `this environment's own real repo path and real ~/.codex/config.toml for the positive no-false-refusal test`, `a throwaway project directory tree beneath home with a nested working subdirectory and a mutation-sentinel server at the root, for the negative ancestor-refusal test`, `the live test records the exact installed codex version it was verified against and fails clearly rather than silently skipping or passing when run against an unverified version`

**Acceptance mapping**

| Criterion | Proving tests |
| :--- | :--- |
| `ac1` | `unit: walkProjectMcpConfigLayers returns false for the default-case mocked home directory`, `live: a real runReadOnlySession call against this environment's own repo succeeds and is not refused` |
| `ac2` | `unit: the regression test for this round's finding using the exact cited CODEX_HOME-inside-project layout -- sentinel at the project root triggers refusal`, `unit: the same layout with no sentinel at the project root does not trigger refusal (global insrc remains allowed)` |
| `ac3` | `unit: walkProjectMcpConfigLayers returns false when CODEX_HOME lies entirely outside cwd's own ancestor chain` |
| `ac4` | `unit: walkProjectMcpConfigLayers returns true for each alternate valid TOML form at a genuine ancestor layer`, `live: the nested-working-directory mutation-sentinel test and per-TOML-form refusal still hold` |
| `ac5` | `unit: discoverCodexMcpServers' subprocess invocation places -C before the mcp subcommand`, `live: the previously-covered misregistration and budget/cancellation tests are unaffected` |
| `ac6` | `unit: verifyRuntime throws on an empty tools array or a tools array missing one or both analyze tools` |
| `ac7` | `live: claude's and vibe's behavior are unaffected by this round's fix` |

## 6. Migration

**State before:** Per s1: the dirname(CODEX_HOME)-boundary design (the prior round's fix) excludes the entire directory containing the global config and everything above it from the ancestor walk. Traced against the review's cited layout (CODEX_HOME=/work/repo/codex-state, cwd=/work/repo/src), this wrongly excludes /work/repo itself, so a genuine, distinct project-local .codex/config.toml at /work/repo would never be checked or refused.

**State after:** walkProjectMcpConfigLayers resolves the global config's own full file path once and walks cwd to the filesystem root, skipping (without reading) ONLY the one layer whose own .codex/config.toml path exactly equals that resolved global path; every other layer, including a project root above a CODEX_HOME nested inside the project tree, is checked normally. This single exact-path comparison correctly handles the default case, the CODEX_HOME-inside-project layout, and the CODEX_HOME-outside-cwd's-ancestor-chain case with no special-casing.

**Zero downtime:** yes — **Data rewrite:** no

**Steps**

1. change walkProjectMcpConfigLayers' exclusion logic from a directory-containment boundary to a single exact-path comparison against the resolved global config file — ↩ rollbackable
2. add the regression test using the review's exact cited layout (CODEX_HOME nested inside a project tree, sentinel at the project root triggers refusal, no sentinel leaves global insrc allowed) — ↩ rollbackable

**Backward compat:** walkProjectMcpConfigLayers is private/module-internal, introduced earlier in this Story's own design and not yet shipped -- this is a correction to that not-yet-released helper's own exclusion logic, not a change to any existing public API.

## 7. Alternatives considered

### 7.1 a1: Skip only the exact resolved global config file path; walk every ancestor to the filesystem root otherwise — **CHOSEN**

Replace the dirname(CODEX_HOME)-boundary exclusion with a precise comparison: resolve the global config's own full file path once (join(CODEX_HOME || join(homedir(),'.codex'), 'config.toml')), and while walking cwd to the filesystem root, skip (treat as clear) ONLY the one layer whose own '.codex/config.toml' path exactly equals that resolved global path -- every other layer, including ones above or beside it, is checked normally.

walkProjectMcpConfigLayers computes globalConfigPath once, then walks cwd upward to the filesystem root; at each directory it builds candidatePath = join(dir, '.codex', 'config.toml') and, if candidatePath === globalConfigPath, treats that one layer as clear without reading it (it is already fully handled by discoverCodexMcpServers) and continues the walk; every other candidatePath is read/parsed/checked as before.

### 7.2 a2: Keep the dirname(CODEX_HOME)-boundary exclusion (the withdrawn design)

No change from the version this round's review rejected -- exclude the directory containing the global config and everything above it.

Unchanged from the prior round's walkProjectMcpConfigLayers.

**Rejected because:** Confirmed by direct trace to wrongly exclude a genuine project layer whenever CODEX_HOME sits inside the project tree -- directly reproduces this round's HIGH finding.

### 7.3 a3: Determine applicable project layers independently of CODEX_HOME entirely (e.g. stop only at a detected VCS/workspace root)

Instead of comparing against the global config's own path at all, bound or identify project layers using some other signal (a .git directory, a package.json, etc.) that does not reference CODEX_HOME.

Replace the global-config-path comparison with a heuristic project-root detector (first ancestor containing .git, or similar), and check only directories between cwd and that detected root.

**Rejected because:** Would avoid the CODEX_HOME dependency but invents an undocumented boundary concept and introduces its own, different false-negative class.

## 8. References

- **[[c1]]** `code` `src/agent/providers/cli-provider.ts:143-145`
