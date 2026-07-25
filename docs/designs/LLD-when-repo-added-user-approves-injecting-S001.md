<!-- insrc:artifact LLD-ae7fd9ee4875830c-S001 -->

# LLD: S001

**Epic:** `when-repo-added-user-approves-injecting`
**HLD base run:** `wf-1784962027267-z256a5`
**HLD effective hash:** `ae7fd9ee4875...`

## HLD context

**Framework:** Standalone feature — no parent HLD. Design directly against the repo, grounded on the s1 analyze passes. There are no HLD shared contracts to honour.
**Rollout phase:** standalone

## Contract details

**Surface level:** internal-shared

### `registerMcpClients`

```typescript
export async function registerMcpClients(installRoot: string, selection: SteeringSelection): Promise<{ clients: McpClientOutcome[] }>
```

**Parameters:**
- `installRoot: string` — Absolute daemon install root used to build the client command `node <installRoot>/out/bin/insrc-mcp.js`. This is the daemon's own install directory (the binary the MCP clients register), NOT the repo being added — MCP registration is `--scope user` / global, so it is repo-independent (only gated by the repo's SteeringSelection).
- `selection: SteeringSelection` — The same {claude?, agents?} gate that drives injectSteeringBlock: selection.claude===true → register the Claude Code client (`claude mcp add insrc --scope user -- node <installRoot>/out/bin/insrc-mcp.js`); selection.agents===true → register the Codex client (`codex mcp add insrc -- node <installRoot>/out/bin/insrc-mcp.js`).

**Returns:** `Promise<{ clients: McpClientOutcome[] }>` — Per-client outcome array structurally parallel to injectSteeringBlock's { files: SteeringFileOutcome[] } (a1 winner: sibling array, not a keyed map). Always emits one entry per client target (claude, codex); unselected clients get action 'skipped'. Never throws for a per-client failure — records action 'failed' with a note and continues, mirroring injectSteeringBlock's per-file error isolation.

**Errors:**
- `never (per-client isolation)` when A `mcp add` / `mcp list` subprocess failure for one client is caught, recorded as { action: 'failed', note } on that client's outcome, and never propagated — registration must never fail the repo add (mirrors the non-fatal steering-injection contract at daemon/index.ts:448-456).

**Preconditions:**
- installRoot resolves to a directory containing out/bin/insrc-mcp.js (the client-registered daemon MCP entrypoint).
- The `claude` and/or `codex` CLI binaries are on PATH — reused via the CliProvider subprocess idiom (src/agent/providers/cli-provider.ts:88-345). A missing binary for a selected client yields action 'failed', not a throw.

**Postconditions:**
- For each selected client, the insrc MCP server is registered exactly once: an idempotent pre-check (`claude mcp list` / `codex mcp list`, since no existing helper exists) returns action 'unchanged' when already present, else runs `mcp add` and returns 'registered'.
- Unselected clients (selection flag not true) return action 'skipped' with no subprocess spawned.
- The returned clients[] is folded onto the repo.add response beside the existing steering outcome; the SteeringFileOutcome contract and its TUI rendering are left byte-for-byte untouched.

### `repo.add`

```typescript
'repo.add': (params: { path: string; steering?: SteeringSelection }) => Promise<{ ok: true; steering?: { files: SteeringFileOutcome[] }; mcp?: { clients: McpClientOutcome[] } }>
```

**Parameters:**
- `params.path: string` — Repo path to register (unchanged — validated via validateRepoPath).
- `params.steering: SteeringSelection | undefined` _(optional)_ — Existing {claude?, agents?} selection; now also gates the new MCP-registration step in addition to steering-block injection. No new payload field is introduced — MCP registration reuses the identical gate.

**Returns:** `Promise<{ ok: true; steering?: { files: SteeringFileOutcome[] }; mcp?: { clients: McpClientOutcome[] } }>` — Additive change: the response gains an optional `mcp` field carrying registerMcpClients's per-client outcomes, sibling to the untouched optional `steering` field. Present only when a steering selection with at least one true flag was supplied; absent otherwise (mirrors the existing conditional-spread of `steering` at daemon/index.ts:457).

**Errors:**
- `Error` when Invalid repo path (existing behaviour via validateRepoPath) — unchanged. Registration failures are NOT surfaced as handler errors; they appear as { action: 'failed' } inside mcp.clients[].

**Preconditions:**
- Repo path validates and addRepo(db, repo) + indexer.addRepo succeed (unchanged existing flow).

**Postconditions:**
- After the existing injectSteeringBlock call, registerMcpClients(installRoot, sel) runs under the same `sel !== undefined && (sel.claude===true || sel.agents===true)` guard, wrapped in the same try/catch so a registration throw is logged and swallowed (repo stays registered).
- The response spreads `mcp` only when the registration result is defined, exactly paralleling the existing `...(steering !== undefined ? { steering } : {})` spread.

### `injectSteeringBlock`

```typescript
export async function injectSteeringBlock(repoRoot: string, selection: SteeringSelection): Promise<{ files: SteeringFileOutcome[] }>
```

**Parameters:**
- `repoRoot: string` — Reference-only — the pattern being mirrored. Signature and body are UNCHANGED by this Story (a1 winner: additive sibling primitive, not a signature change to injectSteeringBlock — that was a3/a4 and lost).
- `selection: SteeringSelection` — The shared gate; registerMcpClients reuses the same object at the same callsite so injection and registration stay driven by one selection.

**Returns:** `Promise<{ files: SteeringFileOutcome[] }>` — The per-file outcome array whose shape (an array of per-target records with per-item error isolation and a non-fatal contract) registerMcpClients structurally mirrors as { clients: McpClientOutcome[] }.

**Errors:**
- `Error (block-asset read only)` when Existing behaviour — throws only if the steering-block asset is missing/empty; per-file I/O errors are recorded, not thrown. Registration mirrors the non-throwing part of this contract.

**Postconditions:**
- Contract is unchanged by this Story; listed to anchor the mirror relationship between SteeringFileOutcome and the new McpClientOutcome.

## Data model changes

### `McpClientOutcome` — new

New per-client result record, the exact structural parallel to SteeringFileOutcome (src/daemon/steering-inject.ts:45-49). Fields: `client: McpClient` (a new string-literal union `'claude' | 'codex'` naming the registered client — note the flag is `agents` but the client is `codex`, so the outcome is keyed on the CLIENT name to avoid the agents/codex mislabel hazard the a2 map shape carried); `action: McpRegisterAction` where `McpRegisterAction = 'registered' | 'unchanged' | 'skipped' | 'failed'` (paralleling SteeringAction 'created'|'replaced'|'unchanged'|'skipped': 'registered' ≈ created, 'unchanged' = idempotent skip when `mcp list` shows it already present, 'skipped' = client not selected, 'failed' = subprocess error); `note?: string` (present for a 'failed' outcome or an informative 'unchanged', mirroring SteeringFileOutcome.note). Defined alongside registerMcpClients (new module, e.g. src/daemon/mcp-register.ts, sibling to steering-inject.ts).

```
+ export type McpClient = 'claude' | 'codex';
+ export type McpRegisterAction = 'registered' | 'unchanged' | 'skipped' | 'failed';
+ export interface McpClientOutcome {
+   readonly client: McpClient;
+   readonly action: McpRegisterAction;
+   readonly note?: string;
+ }
```

**Call sites:**
- `src/daemon/index.ts`
- `src/cli/services/repo.ts`

### `repo.add IPC response` — field-add

Additive optional field `mcp?: { clients: McpClientOutcome[] }` on the repo.add handler return, sibling to the existing optional `steering?: { files: SteeringFileOutcome[] }`. Non-breaking: existing consumers that read only `ok`/`steering` are unaffected; the field is spread onto the response only when registration ran (same conditional-spread idiom as `steering` at daemon/index.ts:457). This is the response surface the CLI TUI renders parallel to the existing steering outcome.

```
  return {
    ok: true,
    ...(steering !== undefined ? { steering } : {}),
+   ...(mcp !== undefined ? { mcp } : {}),
  };
```

**Call sites:**
- `src/daemon/index.ts`
- `src/cli/services/repo.ts`

### `SteeringSelection` — invariant-change

No field change — the {claude?, agents?} shape (src/shared/types.ts:597-602) is unchanged. Its INVARIANT is broadened: the selection now gates two side effects rather than one — steering-block injection AND MCP-client registration — under the same per-flag semantics (claude→Claude Code, agents→Codex). Documented as an additive reuse, not a schema edit.

**Call sites:**
- `src/daemon/index.ts`
- `src/daemon/steering-inject.ts`
- `src/cli/services/repo.ts`

## Error paths

### Error cases

- **The `claude` (or `codex`) CLI binary for a selected client is not on PATH when registerMcpClients tries to spawn it.** (recoverable)
  - Detection: The subprocess launch (via the CliProvider spawn idiom) rejects — the child process emits an 'error' event / the spawn promise rejects with an ENOENT code — which the per-client try/catch observes.
  - Response: Catch it, record { client, action: 'failed', note: '<client> CLI not found on PATH' } on that client's outcome, and continue to the other client. Never propagate.
  - User impact: The repo is still added and indexed; the CLI TUI shows that client's MCP registration as failed with the missing-binary note, so the user can install the CLI and re-run. The other client is unaffected.
- **`claude mcp add insrc ...` / `codex mcp add insrc ...` runs but the command itself fails (bad args, permission, corrupt CLI config).** (recoverable)
  - Detection: The add subprocess resolves with a non-zero exit code; the code checks exitCode !== 0 (and captures stderr) rather than assuming success.
  - Response: Record { client, action: 'failed', note: <captured stderr, trimmed> } on that client's outcome; do not throw and do not attempt a retry.
  - User impact: Repo add succeeds; the failed registration surfaces in the mcp.clients[] outcome with the CLI's own error text, so the user knows exactly which command to re-run manually.
- **The idempotency pre-check `claude mcp list` / `codex mcp list` fails, so the current registration state cannot be determined.** (recoverable)
  - Detection: The list subprocess exits non-zero, or its stdout cannot be parsed for an `insrc` entry — the code notices via the non-zero exit / parse failure of the list output.
  - Response: Treat idempotency as indeterminate: record { client, action: 'failed', note: 'could not verify existing registration' } and deliberately DO NOT run `mcp add` (avoids creating a duplicate registration). Continue to the other client.
  - User impact: Repo add succeeds; the outcome tells the user their existing MCP config could not be inspected, so a blind add was skipped to stay safe. No duplicate/clobbered client config.
- **installRoot does not actually contain out/bin/insrc-mcp.js, so registering would wire the client to a non-existent entrypoint.** (recoverable)
  - Detection: A pre-spawn existence check (fs.stat) on `<installRoot>/out/bin/insrc-mcp.js` throws ENOENT before any `mcp add` is issued.
  - Response: For each selected client, record { client, action: 'failed', note: 'MCP entrypoint missing at <installRoot>/out/bin/insrc-mcp.js' } and skip the add entirely.
  - User impact: Repo add succeeds and no client is pointed at a broken command; the outcome explains the install is incomplete so the user rebuilds the daemon rather than getting a silently dead MCP registration.
- **registerMcpClients throws an unanticipated error outside the per-client isolation (e.g. the whole call rejects before any outcome is built).** (recoverable)
  - Detection: The try/catch wrapping the registerMcpClients call in the repo.add handler (mirroring the injectSteeringBlock try/catch at daemon/index.ts:448-456) catches the thrown error.
  - Response: Log at warn and swallow; omit the `mcp` field from the repo.add response. The repo stays registered and indexed.
  - User impact: Repo add still succeeds transparently; MCP registration is silently skipped for this add (visible only in daemon logs), never blocking the user's core action.

### Edge cases

| Input | Expected |
| :--- | :--- |
| repo.add with steering = { claude: true } (agents absent), insrc not yet registered for Claude Code. | registerMcpClients runs (guard passes on claude===true). clients[] always emits one entry per client: { client: 'claude', action: 'registered' } and { client: 'codex', action: 'skipped' } — codex is skipped, not omitted. |
| repo.add with steering = { claude: true, agents: true } where `claude mcp list` and `codex mcp list` already show an `insrc` entry. | The idempotent pre-check short-circuits both adds: clients[] = [{ client: 'claude', action: 'unchanged' }, { client: 'codex', action: 'unchanged' }], with no `mcp add` subprocess spawned for either. |
| repo.add with steering undefined, or steering = { claude: false, agents: false }. | The guard `sel !== undefined && (sel.claude===true \|\| sel.agents===true)` is false — registerMcpClients is not invoked and the repo.add response has no `mcp` field at all (paralleling the conditional-spread of `steering`). |
| repo.add with steering = { claude: true, agents: true } where Claude Code already has insrc but Codex does not. | Each client is processed independently: clients[] = [{ client: 'claude', action: 'unchanged' }, { client: 'codex', action: 'registered' }] — a mixed outcome, one add spawned (codex) and one skipped (claude). |

### Invariants to preserve

- MCP registration must never fail the repo add: every failure is caught and reported inside the mcp.clients[] outcome (or swallowed by the handler try/catch), so a registration problem never rolls back or aborts the repo registration — mirroring the non-fatal steering-injection contract at the repo.add callsite. [[c3]]
- Per-target error isolation: a failure spawning or running a command for one client is recorded on that client's own McpClientOutcome and never prevents the other client from being processed, structurally paralleling injectSteeringBlock's { files: SteeringFileOutcome[] } per-file isolation. [[c2]]
- The SteeringSelection { claude?, agents? } shape is unchanged and remains the single gate that drives BOTH steering-block injection and MCP-client registration under the same per-flag semantics (claude → Claude Code, agents → Codex); no new payload field is introduced. [[c2]]
- injectSteeringBlock's signature/body, the SteeringFileOutcome shape, and the existing `steering` outcome on the repo.add response stay byte-for-byte untouched — the MCP outcome is an additive sibling primitive attached at the same callsite, not a change to the mirrored primitive. [[c1]]
- Idempotency (skip-if-already-registered) must be enforced by the new code itself via a `claude mcp list` / `codex mcp list` pre-check, because no pre-existing programmatic MCP-registration helper exists in the indexed graph to reuse. [[c4]]

## Test strategy

**Test framework:** `node:test (via `npx tsx --test 'src/**/__tests__/*.test.ts'`) — the repo's only harness per CLAUDE.md; convention.detect surfaced no existing test files in the steering/repo.add region, so this suite is established fresh under src/daemon/__tests__/.`

### Test levels

- **unit** — Exercise registerMcpClients in isolation with the claude/codex subprocess boundary stubbed, covering every McpRegisterAction path (registered/unchanged/skipped/failed), the SteeringSelection gate, idempotency pre-check, entrypoint existence check, and per-client error isolation without spawning real CLIs.
  - Subjects: `registerMcpClients (new src/daemon/mcp-register.ts)`, `McpClientOutcome / McpRegisterAction result shape`, `the claude/codex `mcp list` + `mcp add` subprocess seam (injected/mocked CliProvider-style spawn)`
  - Fixtures: `A stub for the CLI subprocess seam that lets each test script per-command exitCode + stdout/stderr for `claude mcp list`, `codex mcp list`, `claude mcp add`, `codex mcp add`, and simulate an ENOENT spawn rejection for a missing binary`, `A temp installRoot dir builder that can create (or omit) `<installRoot>/out/bin/insrc-mcp.js` to drive the fs.stat entrypoint check`, `SteeringSelection factory helpers: {}, {claude:true}, {agents:true}, {claude:true,agents:true}, {claude:false,agents:false}`
- **integration** — Verify the repo.add handler folds registerMcpClients's outcome onto the response beside the untouched steering outcome — same conditional-spread + same try/catch non-fatal wrapping — so registration state reaches the IPC surface exactly as the contract specifies and a registration throw never aborts the add.
  - Subjects: `repo.add IPC handler (src/daemon/index.ts main)`, `repo.add response shape { ok, steering?, mcp? }`, `the injectSteeringBlock + registerMcpClients callsite ordering and shared guard`
  - Fixtures: `A registered-repo test db/registry fixture so addRepo(db, repo) + indexer.addRepo succeed`, `registerMcpClients stubbed/injected to return a fixed clients[] and, in one case, to throw — asserting the response omits `mcp` and the repo still registers`, `injectSteeringBlock stubbed to a fixed { files } so the steering sibling can be asserted byte-for-byte untouched`
- **live** — Gated end-to-end smoke that runs real `claude mcp add/list` (and codex) against a throwaway user scope to confirm the actual CLI arg strings and idempotent re-run behave as modelled; skips cleanly when the gate env var / binaries are absent, matching the repo's INSRC_LIVE_TESTS convention.
  - Subjects: `registerMcpClients against the real claude/codex CLI binaries`, `idempotent second invocation (registered → unchanged)`
  - Fixtures: `Env gate (e.g. INSRC_LIVE_TESTS=1) plus a PATH-available `claude`/`codex` binary; skip otherwise`, `A real built installRoot containing out/bin/insrc-mcp.js`, `Teardown that removes the `insrc` MCP registration from user scope after the test`

### Acceptance mapping

| Criterion | Proving tests |
| :--- | :--- |
| `ac1` | `unit: a `mcp add` non-zero exit records { action: 'failed', note: <stderr> } and registerMcpClients resolves (never rejects)`, `unit: a missing-binary ENOENT spawn rejection is caught and recorded as { action: 'failed' } without throwing`, `integration: registerMcpClients throwing inside repo.add is swallowed (warn-logged) — response omits `mcp` and the repo stays registered/indexed` |
| `ac2` | `unit: selection {claude:true,agents:true} where claude fails and codex succeeds yields [{client:'claude',action:'failed'},{client:'codex',action:'registered'}] — one failure does not block the other`, `unit: a `mcp list` failure for claude records claude 'failed' while codex is still processed independently` |
| `ac3` | `unit: selection {claude:true} → claude client processed, codex entry present with action 'skipped' (per-flag gate: claude→Claude Code)`, `unit: selection {agents:true} → codex client processed (agents flag → codex client name), claude 'skipped'`, `integration: repo.add reuses params.steering as the sole gate — no new payload field is read or required` |
| `ac4` | `unit: `mcp list` already showing an `insrc` entry short-circuits the add → action 'unchanged', with no `mcp add` subprocess spawned`, `unit: an indeterminate `mcp list` (non-zero exit / unparseable) records 'failed' with 'could not verify existing registration' and deliberately does NOT spawn `mcp add` (no blind duplicate)` |
| `ac5` | `unit: every invocation emits exactly one entry per client (claude, codex); unselected clients get action 'skipped', never omitted`, `unit: mixed idempotency case {claude:true,agents:true} with claude already present, codex absent → [{client:'claude',action:'unchanged'},{client:'codex',action:'registered'}]` |
| `ac6` | `integration: repo.add with a true steering flag spreads `mcp: { clients }` beside `steering` on the response; the existing steering field/rendering is unchanged`, `integration: repo.add with steering undefined or {claude:false,agents:false} produces a response with no `mcp` field (guard false, conditional-spread omits it)` |
| `ac7` | `unit: installRoot missing out/bin/insrc-mcp.js → each selected client records { action:'failed', note:'MCP entrypoint missing at ...' } and no `mcp add` is issued`, `unit: installRoot containing the entrypoint proceeds to the list/add flow` |

## Migration

**State before:** Per the s1 analyze bundles, the repo.add IPC handler (main in src/daemon/index.ts:127–1631) today runs addRepo(db, repo) + indexer.addRepo, then calls injectSteeringBlock(repoRoot, selection) as its single caller (usage.example: totalCallers: 1) and folds only a conditional `steering?: { files: SteeringFileOutcome[] }` field onto the response (spread idiom at daemon/index.ts:457). SteeringSelection {claude?, agents?} (symbol.locate at src/daemon/steering-inject.ts:143 and src/cli/services/repo.ts:26) gates exactly one side effect: steering-block injection. There is NO programmatic MCP registration anywhere in the indexed graph (search.text: no `mcp add` occurrence surfaced) — clients are registered by hand. The CLI-side addRepo (src/cli/services/repo.ts:26–33) threads SteeringSelection and consumes the repo.add response; CliProvider (src/agent/providers/cli-provider.ts:88–345) is the existing claude/codex subprocess wrapper. No test suite for this region was enumerated by the s1 passes (test.locate: none pinned).

**State after:** The repo.add handler runs a new additive sibling primitive registerMcpClients(installRoot, selection) immediately after injectSteeringBlock, under the identical `sel !== undefined && (sel.claude===true || sel.agents===true)` guard and wrapped in the same non-fatal try/catch. registerMcpClients (new module src/daemon/mcp-register.ts) returns { clients: McpClientOutcome[] }, structurally parallel to injectSteeringBlock's { files: SteeringFileOutcome[] }: one entry per client target (claude, codex), each with client/action/note, per-client error isolation, and never throwing for a per-client failure. selection.claude===true idempotently registers the Claude Code client (`claude mcp add insrc --scope user -- node <installRoot>/out/bin/insrc-mcp.js`) and selection.agents===true idempotently registers the Codex client (`codex mcp add insrc -- node <installRoot>/out/bin/insrc-mcp.js`), each guarded by a `mcp list` pre-check that yields action 'unchanged' when already present. The repo.add response gains an additive optional `mcp?: { clients: McpClientOutcome[] }` field, spread only when registration ran, sibling to the untouched `steering` field. injectSteeringBlock and SteeringFileOutcome are byte-for-byte unchanged; SteeringSelection's shape is unchanged but its invariant is broadened to gate two side effects.

**Zero downtime:** yes — **Data rewrite:** no

### Steps

1. Add the new type definitions (McpClient = 'claude' | 'codex', McpRegisterAction = 'registered' | 'unchanged' | 'skipped' | 'failed', and interface McpClientOutcome { client; action; note? }) in the new module src/daemon/mcp-register.ts, structurally parallel to SteeringFileOutcome. Purely additive — no existing type is touched. — ↩ rollbackable
2. Add the new registerMcpClients(installRoot, selection) primitive in src/daemon/mcp-register.ts: for each client target, if the selection flag is not true return action 'skipped' with no subprocess spawned; otherwise run the `mcp list` pre-check (via the CliProvider subprocess idiom) and return 'unchanged' if already present, else run `mcp add` and return 'registered'; catch any per-client subprocess error and record action 'failed' with a note, never throwing. This is a new isolated function with no callers yet — dead but safe to ship. — ↩ rollbackable
3. Widen the repo.add IPC response type to add the optional field `mcp?: { clients: McpClientOutcome[] }` sibling to the existing optional `steering` field, in the daemon handler type and its IDE-mirrored counterpart. Additive optional field — existing consumers reading only ok/steering are unaffected. — ↩ rollbackable
4. Wire registerMcpClients into the repo.add handler in src/daemon/index.ts immediately after the injectSteeringBlock call, under the same `sel !== undefined && (sel.claude===true || sel.agents===true)` guard and inside the same non-fatal try/catch that logs-and-swallows so a registration throw never fails the repo add; conditionally spread the `mcp` result onto the response exactly paralleling the existing `...(steering !== undefined ? { steering } : {})` spread at daemon/index.ts:457. Behaviour flips from no-registration to registration for selected clients. — ↩ rollbackable
5. Update the CLI addRepo consumer (src/cli/services/repo.ts) and the TUI to read and render the new optional `mcp.clients` outcome array alongside the existing steering outcome. Additive read of an optional field; renders nothing when absent, so behaviour is unchanged for older daemon responses. — ↩ rollbackable
6. Add daemon-side tests (after verifying/creating the src/daemon/**/__tests__ harness, which s1 did not enumerate) asserting: per-client gating from SteeringSelection, idempotent skip via the `mcp list` pre-check ('unchanged'), unselected-client 'skipped', outcome reporting on the repo.add response, and the non-fatal guarantee that a registration failure yields action 'failed' without failing the repo add. Test-only addition. — ↩ rollbackable

**Backward compat:** repo.add is a public IPC method mirrored in lock-step with the IDE fork, so the change to its response is a public-API change and must preserve compatibility. It does so by being strictly additive: the new `mcp?` field is optional and spread onto the response only when registration ran, exactly mirroring the existing conditional `steering` spread; existing consumers that read only `ok`/`steering` are byte-for-byte unaffected. No request-payload field is added — MCP registration reuses the identical existing `steering?: SteeringSelection` gate, so older callers that omit steering trigger neither injection nor registration and see the unchanged response. injectSteeringBlock's signature/body and the SteeringFileOutcome contract (plus its TUI rendering) are left untouched, so the mirrored steering surface is unchanged. SteeringSelection's {claude?, agents?} shape is unchanged; only its documented invariant broadens (one gate now drives two side effects). The IDE fork's mirrored repo.add response type must gain the same optional `mcp?` field to stay in lock-step, but an un-updated IDE that ignores the extra field continues to work because it is optional.

## Alternatives considered

### a1: Parallel outcome array (mirror injectSteeringBlock) — **CHOSEN**

New standalone primitive returns a per-client outcome array, folded into repo.add as a sibling field beside the existing steering outcome.

Add a new daemon-side primitive `registerMcpClients(installRoot: string, selection: SteeringSelection): Promise<{ clients: McpRegistrationOutcome[] }>` that structurally mirrors `injectSteeringBlock(repoRoot, selection): Promise<{ files: SteeringFileOutcome[] }>` (src/daemon/steering-inject.ts:143). It is gated by the same SteeringSelection: `selection.claude` approved -> register Claude Code (`claude mcp add insrc --scope user -- node <installRoot>/out/bin/insrc-mcp.js`), `selection.agents` approved -> register Codex (`codex mcp add insrc -- node <installRoot>/out/bin/insrc-mcp.js`). Each element is `McpRegistrationOutcome { client: 'claude' | 'codex'; status: 'registered' | 'skipped-existing' | 'failed'; command?: string; reason?: string }`. Idempotency is a `claude mcp list` / `codex mcp list` pre-check emitting `skipped-existing`. It is invoked at the single injectSteeringBlock callsite (src/daemon/index.ts:127 main, repo.add handler) right after the steering call, wrapped in the same catch-and-report isolation so registration never fails the add. The repo.add response gains a new independent field `mcp: { clients: McpRegistrationOutcome[] }` beside the untouched `steering` field.

### a2: Keyed outcome map mirroring SteeringSelection

Registration outcome is a client-keyed object {claude?, agents?} that mirrors the SteeringSelection gate shape rather than an array.

Same standalone primitive as a1, but the return and response shape mirror the SteeringSelection {claude?, agents?} gate rather than the SteeringFileOutcome array. Primitive: `registerMcpClients(installRoot, selection): Promise<{ registrations: { claude?: McpRegistrationStatus; agents?: McpRegistrationStatus } }>` where a key is present only when that steering flag was approved, and `McpRegistrationStatus { status: 'registered' | 'skipped-existing' | 'failed'; command: string; reason?: string }`. repo.add response gains `mcpRegistration: { claude?: ..., agents?: ... }`. Gating, idempotent pre-check, callsite, and non-fatal isolation are identical to a1.

**Rejected because:** a2 is functionally identical to a1 (same standalone primitive, gating, idempotent pre-check, non-fatal isolation) and keeps the existing steering contract untouched, so it shares a1's low blast radius. It loses to a1 on the Story's explicit 'parallel to / mirror the SteeringFileOutcome *array*' instruction: a keyed map {claude?, agents?} is no longer visually symmetric with the files[] array. It also carries a naming hazard — keying on the selection flag 'agents' while the client is 'codex' risks mislabeling unless the TUI maps flag->client. O(1) lookup is a modest upside but not enough to overcome the divergence from the asked-for shape. Cost S.

### a3: Extend injectSteeringBlock to also register (single primitive)

Fold MCP registration into the existing steering primitive, which returns {files, registrations} from one gate pass at the existing callsite.

Rather than a new sibling primitive, extend `injectSteeringBlock` to perform registration as part of the same per-client pass, changing its return to `Promise<{ files: SteeringFileOutcome[]; registrations: McpRegistrationOutcome[] }>`. Because injection already walks selection.claude / selection.agents, registration is emitted inside the same loop iteration (inject CLAUDE.md AND register Claude in the claude branch; inject AGENTS.md AND register Codex in the agents branch). It needs the `installRoot` in addition to `repoRoot`, so the signature gains a param: `injectSteeringBlock(repoRoot, installRoot, selection)`. The single callsite (src/daemon/index.ts:127) is unchanged in structure; repo.add response surfaces `steering: { files, registrations }`.

**Rejected because:** a3 guarantees injection/registration lockstep and eliminates duplicated gate-branching, which is genuinely attractive. But it directly works against the Story framing by folding registration into a primitive named and scoped for steering-file injection — two responsibilities, weaker single-purpose naming — and it changes injectSteeringBlock's signature and return type, touching its caller and any shape-asserting test (a contract change rather than an additive sibling). Mixing a filesystem write with a CLI subprocess in one primitive also complicates the per-item error model. Cost M, above a1/a2's S. Ranked below the two additive approaches for higher change surface and weaker adherence to the 'parallel' framing.

### a4: Unified per-client record (combined steering + mcp)

Restructure the repo.add response so each client has one combined record carrying both its steering-file outcome and its MCP-registration outcome.

Replace the flat steering outcome with a per-client aggregate: repo.add returns `clientSetup: ClientSetupOutcome[]` where `ClientSetupOutcome { client: 'claude' | 'codex'; steering: SteeringFileOutcome | null; mcp: McpRegistrationOutcome | null }`. The registration primitive still exists (as in a1) but the daemon handler zips the two result sets into one array keyed by client before shaping the response. Each per-client entry tells the TUI everything about that client in one place. Gating, idempotency and non-fatal isolation as in a1.

**Rejected because:** a4 has the cleanest long-term domain model (one per-client record for all setup actions, most extensible), but it is the worst fit here: it directly contradicts the Story's 'parallel to the existing steering outcome' by replacing rather than paralleling it, breaks the existing steering-outcome response shape (largest blast radius — every repo.add consumer and the TUI steering rendering must migrate), and adds a zip/merge step plus null-handling convention in the handler. Cost L, the highest. Highest risk against the least adherence to the asked-for shape, so ranked last.

## Open questions

- s8/ep3 (partial, non-HARD): the five invariantsToPreserve are substantively grounded in the s1 bundles, but each `source` cites an opaque constraint id (c1..c4) rather than the specific analyze bundle it derives from. Recommendation from s8: re-tag each invariant to the specific s1 bundle (kind/focus) it derives from before approve.
- s8/sbdry4 (partial, HARD-item but not 'missed' — must be resolved before approve): the design fabricates precise line coordinates s1 never established — src/shared/types.ts:597-602 for SteeringSelection (a file absent from ALL s1 pathsCited), src/daemon/steering-inject.ts:45-49 for SteeringFileOutcome, and daemon/index.ts:448-456 / :457. s1's data-model.trace explicitly stated the field-level definitions of SteeringSelection / SteeringFileOutcome were NOT expanded and directed confirming their exact members in src/daemon/steering-inject.ts. Fix: replace the invented line ranges (and the asserted types.ts definition site) with the confirmed locations from the s1-directed read of steering-inject.ts, or mark them unverified pending that read.
- s1 back-flow gap (1): confirm the exact member fields of SteeringSelection and SteeringFileOutcome by reading src/daemon/steering-inject.ts directly before finalising the parallel McpClientOutcome type — the graph slice did not expand them.
- s1 back-flow gap (2): verify the daemon-side test harness (src/daemon/**/__tests__) actually exists before committing to the s6 test strategy — the s1 test.locate pass pinned no existing test files for this region (convention.detect on bundle-md.ts reported 'Test files: none', which does not prove the daemon has no tests).

## Citations

- **[[c1]]** `analyze-bundle` `s1.symbol.locate — Current signatures of the steering-injection primitive and the SteeringSelection-carrying entrypoints` — "injectSteeringBlock(repoRoot: string, selection: SteeringSelection): Promise<{ files: SteeringFileOutcome[] }> is defined at src/daemon/steering-inject.ts:143–174 — this is the primitive whose shape t"
- **[[c2]]** `analyze-bundle` `s1.data-model.trace — SteeringSelection {claude?, agents?} and SteeringFileOutcome result shape` — "SteeringSelection is the {claude?, agents?} selection object ... it is the same gate the Story reuses — steering.claude approved → register the Claude Code client, steering.agents approved → register "
- **[[c3]]** `analyze-bundle` `s1.usage.example — single callsite where injectSteeringBlock runs after addRepo` — "injectSteeringBlock has exactly one caller (totalCallers: 1): the main function in src/daemon/index.ts:127–1631, which invokes it after addRepo in the repo.add handler. ... Mirroring this callsite's e"
- **[[c4]]** `analyze-bundle` `s1.search.text — MCP-registration command strings and steering-injection idiom to reuse` — "no existing programmatic MCP registration anywhere in the indexed set — the subprocess idiom to reuse is CliProvider (src/agent/providers/cli-provider.ts:88–345) ... idempotency must therefore be enfo"
- **[[c5]]** `analyze-bundle` `s1.test.locate — existing test coverage around repo.add / steering-injection` — "no test entities were surfaced in the graph slice for the steering-injection region ... No existing test pattern was pinned by the passes to extend directly ... Locate/confirm the daemon-side test sui"
- **[[c6]]** `step-output` `s4 — contract details (surfaceLevel, api, dataModel, interactionWithShared)` — "registerMcpClients(installRoot: string, selection: SteeringSelection): Promise<{ clients: McpClientOutcome[] }> ... repo.add gains an additive optional `mcp` field, sibling to the untouched optional `"
- **[[c7]]** `step-output` `s5 — error paths (errorCases, edgeCases, invariantsToPreserve)` — "MCP registration must never fail the repo add: every failure is caught and reported inside the mcp.clients[] outcome (or swallowed by the handler try/catch)."
- **[[c8]]** `step-output` `s6 — test strategy (node:test, unit/integration/live levels, ac1-ac7 mapping)` — "testFramework: node:test (via `npx tsx --test 'src/**/__tests__/*.test.ts'`) ... this suite is established fresh under src/daemon/__tests__/."
- **[[c9]]** `step-output` `s7 — migration (stateBefore/stateAfter, six rollbackable steps, backwardCompat)` — "The repo.add handler runs a new additive sibling primitive registerMcpClients(installRoot, selection) immediately after injectSteeringBlock ... The repo.add response gains an additive optional `mcp?: "
- **[[c10]]** `step-output` `s2 — alternatives a1..a4` — "a1 Parallel outcome array (mirror injectSteeringBlock); a2 Keyed outcome map mirroring SteeringSelection; a3 Extend injectSteeringBlock to also register; a4 Unified per-client record."
- **[[c11]]** `step-output` `s3 — judgments + winnerId` — "winnerId: a1 ... a1 wins because it is the only alternative that satisfies the Story's two explicit design directives literally — 'parallel to the existing steering outcome' ... and 'mirror the existi"
- **[[c12]]** `step-output` `s8 — self-check verdicts (ep3 partial, sbdry4 partial)` — "ep3 partial: each `source` cites an opaque constraint id (c1..c4), not an analyze bundle ... sbdry4 partial: the design fabricates precise line coordinates that s1 never established ... Fix before app"

<!-- insrc:review -->

## Review

### ✅ Review `PASS` — design.story (design.story)

**0 HIGH · 0 MED · 9 LOW** · model `client` · reviewed 2026-07-25T07:22:44.737Z

| Ref | Kind | Severity | Fixability | Premise | Evidence | Action |
| --- | --- | --- | --- | --- | --- | --- |
| contract/injectSteeringBlock | citation | LOW | manual | injectSteeringBlock(repoRoot, selection): Promise<{ files: SteeringFileOutcome[] }> is defined in src/daemon/steering-inject.ts (the primitive being mirrored). | steering-inject.ts:143 `export async function injectSteeringBlock(` confirmed — the mirrored primitive exists as cited. | none — verified sound |
| data-model/McpClientOutcome | semantic | LOW | manual | SteeringFileOutcome is an interface with fields file, action, note? in src/daemon/steering-inject.ts (the shape McpClientOutcome mirrors). | steering-inject.ts:45 `export interface SteeringFileOutcome {` with `readonly action: SteeringAction` (:47) and `readonly note?: string` (:48). The shape McpClientOutcome mirrors is confirmed. | none — verified sound |
| data-model/McpRegisterAction | closed-union | LOW | manual | SteeringAction is the union 'created' \| 'replaced' \| 'unchanged' \| 'skipped' in steering-inject.ts (the parallel McpRegisterAction is modeled on it). | steering-inject.ts:43 `export type SteeringAction = 'created' \| 'replaced' \| 'unchanged' \| 'skipped';` — exact union confirmed; McpRegisterAction is modeled on it. | none — verified sound |
| data-model/SteeringSelection | citation | LOW | manual | SteeringSelection is the {claude?, agents?} interface; the LLD locates it at src/shared/types.ts:597-602 (s8 flagged this file as absent from s1 grounding). | src/shared/types.ts:597 `export interface SteeringSelection {`, :599 `readonly claude?: boolean \| undefined`, :601 `readonly agents?: boolean \| undefined`. The LLD's coordinates (types.ts:597-602) are EXACTLY correct — the s8 self-check's 'fabricated / absent from s1' concern is refuted by this evidence. | none — verified sound; the s8/sbdry4 open question is resolved (coordinates are real). |
| migration/callsite | citation | LOW | manual | The repo.add handler in src/daemon/index.ts calls injectSteeringBlock inside a try/catch under a `sel.claude === true \|\| sel.agents === true` guard and folds it onto the response via a conditional spread `...(steering !== undefined ? { steering } : {})`. | daemon/index.ts:447 `if (sel !== undefined && (sel.claude === true \|\| sel.agents === true)) {`, :449 `steering = await injectSteeringBlock(normalisedPath, sel);` (inside the try/catch), :457 `return { ok: true, ...(steering !== undefined ? { steering } : {}) };`. Guard, callsite, and conditional-spread all confirmed — the additive `mcp` spread mirrors an exact real idiom. | none — verified sound |
| invariant/no-existing-mcp | inventory | LOW | manual | There is NO existing programmatic MCP registration in production code (no `claude mcp add` / `codex mcp add` invocation), so the idempotency pre-check must be built fresh. | The only `mcp add insrc` hit is a DOC COMMENT (src/mcp/analyze-step/handler.ts:37 `* claude mcp add insrc \\`); `'mcp', 'add'` argv → 0 matches. No production programmatic MCP registration exists — the idempotency pre-check must indeed be built fresh. | none — verified sound |
| reuse/CliProvider | citation | LOW | manual | CliProvider (the claude/codex subprocess wrapper the registration reuses the spawn idiom from) exists in src/agent/providers/cli-provider.ts. | cli-provider.ts:88 `class CliProvider`, with the reusable subprocess idiom: :456 `spawn(command, [...args], ...)` and :423 `execFileSync('which', [command])` for PATH detection — exactly the pattern registerMcpClients reuses to spawn claude/codex + detect a missing binary. | none — verified sound |
| migration/cli-consumer | citation | LOW | manual | The CLI-side addRepo consumer that threads SteeringSelection and consumes the repo.add response is in src/cli/services/repo.ts. | src/cli/services/repo.ts:26 `export async function addRepo(path, steering?: SteeringSelection)`, :31 `rpc('repo.add', { path, ...(steering !== undefined ? { steering } : {}) })`; the TUI add call is ReposPane.tsx:48 `svc.repo.add(addPath, { claude, agents })`. The CLI consumer + TUI render site are confirmed. | For build: the new mcp.clients outcome render lands in src/cli/panes/ReposPane.tsx (alongside the existing steering render) + the repo.add return type in src/cli/services/repo.ts — both confirmed real. |
| contract/installRoot | semantic | LOW | manual | The daemon can derive its own install root (to build <installRoot>/out/bin/insrc-mcp.js) — a PATHS helper or a process.argv[1]/import.meta-based derivation exists that the repo.add handler can pass as installRoot. | The daemon CAN derive its install root: steering-inject.ts:59 already does `join(dirname(fileURLToPath(import.meta.url)), '..', 'prompts', 'steering-block.md')` to locate a built asset relative to the daemon. `out/bin` currently has 0 refs (the entrypoint path is new); DAEMON_ROOT exists only CLI-side (maintenance.ts:31). So the premise (derivation is possible) holds, but the LLD does not specify HOW the repo.add handler obtains installRoot. | For build: derive installRoot in daemon/index.ts via the import.meta.url pattern (precedent steering-inject.ts:59): from out/daemon/index.js, `join(dirname(fileURLToPath(import.meta.url)), '..', '..')` is the daemon install root, and the MCP entrypoint is `<root>/out/bin/insrc-mcp.js`. The LLD leaves this wiring to the build — make it explicit (a small helper or inline const), not an unbound param. |
