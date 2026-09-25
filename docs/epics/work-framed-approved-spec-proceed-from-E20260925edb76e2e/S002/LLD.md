<!-- insrc:artifact LLD-edb76e2e4d41217d-s2 -->

# LLD: E20260925edb76e2e:S002

**Epic:** `work-framed-approved-spec-proceed-from`
**HLD base run:** `wf-1790343836936-uhegob`
**HLD effective hash:** `f394a9ecb688...`

## HLD context

**Framework:** Layered extension-host core + a thin terminal-styled webview (alternative a1). Per-provider stream adapter normalizes each CLI's native structured stream into one sc2 event union; extension observes, never orchestrates (k8).
**Rollout phase:** Phase A — foundational contracts (design system + CLI bridge)
**Owns:** `undefined` (undefined), `undefined` (undefined)

## Contract details

**Surface level:** internal-shared

### `StreamAdapter.run`

```typescript
run(req: TurnRequest): AsyncIterable<TurnEvent>
```

**Parameters:**
- `req: TurnRequest` — The turn to execute: provider, prompt, optional resume SessionHandle, and cwd (the workspace path scoping the CLI).

**Returns:** `AsyncIterable<TurnEvent>` — A lazily-produced stream of normalized sc2 TurnEvents; the consumer for-awaits it (natural backpressure). Completes after a terminal 'done' (or 'error') event.

**Errors:**
- `error TurnEvent (in-stream, kind:'error')` when The CLI cannot be spawned, exits non-zero, or emits an unparseable/native-protocol-violating line — surfaced as a terminal error event, never a thrown reject.

**Preconditions:**
- req.provider is a member of ProviderRegistry.available
- The provider CLI binary is installed and authenticated via its own OAuth session (k2)

**Postconditions:**
- No direct cloud REST call is made by the extension (k2)
- Execution is a directly-spawned subprocess, not routed through the daemon (k1)
- Every yielded item is a valid sc2 TurnEvent; no native provider-specific shape escapes the adapter

### `StreamAdapter.cancel`

```typescript
cancel(turnId: string): void
```

**Parameters:**
- `turnId: string` — The id of the in-flight turn to abort (matches TurnEvent.turnId).

**Returns:** `void` — Requests cancellation of the identified turn's subprocess; the run() iterable terminates (terminal done/error) promptly.

**Errors:**
- `no-op` when turnId is unknown or already finished — cancel is idempotent.

**Postconditions:**
- The turn's subprocess is signalled to terminate; no orphaned process is left running

### `ProviderRegistry.get`

```typescript
get(id: ProviderId): StreamAdapter
```

**Parameters:**
- `id: ProviderId` — Which agentic CLI adapter to retrieve ('claude' | 'codex').

**Returns:** `StreamAdapter` — The per-provider adapter that spawns and normalizes that CLI's stream.

**Errors:**
- `Error (unknown-provider)` when id is not one of the registered providers (should not occur when callers gate on `available`).

**Preconditions:**
- id is in ProviderRegistry.available

**Postconditions:**
- Returns a StreamAdapter whose capabilities reflect that provider's spike-verified stream/resume support

### `ProviderRegistry.available`

```typescript
readonly available: ReadonlyArray<ProviderId>
```

**Returns:** `ReadonlyArray<ProviderId>` — The agentic CLIs actually installed/usable on this machine (claude and/or codex) — the source of truth the provider selector (S005) reads. Ollama is never a member (k4).

**Postconditions:**
- Contains only agentic coding CLIs (claude/codex); never a plain-completion provider (k4)

## Data model changes

### `TurnEvent (sc2)` — new

The provider-agnostic discriminated union yielded per turn: assistant-delta | tool-call | file-edit | status | done | error, each carrying turnId. Verbatim from the HLD sc2 sketch. file-edit carries a UnifiedDiff. The only vocabulary consumers (S003/S004/S006) see.

```
+ export type TurnEvent = { kind:'assistant-delta'|... } (sc2 interfaceSketch, verbatim)
```

**Call sites:**
- `src/agent/providers/cli-provider.ts (prior-art reference for how claude/codex structured output is consumed in-repo)`

### `UnifiedDiff (sc2)` — new

The hunk-based diff payload of a file-edit event (path + hunks), verbatim from the HLD sketch; hunk-based (not full blobs) to respect the streaming-throughput target.

```
+ export interface UnifiedDiff { readonly path: string; readonly hunks: ReadonlyArray<{ oldStart; oldLines; newStart; newLines; lines: string[] }> }
```

### `TurnRequest / SessionHandle (sc5)` — new

TurnRequest {provider, prompt, resume?, cwd}; SessionHandle {provider, nativeSessionId} — the resume handle produced by a prior turn on the same provider (populated by S005). Verbatim from the HLD sc5 sketch.

```
+ export interface TurnRequest {...}; export interface SessionHandle { readonly provider: ProviderId; readonly nativeSessionId: string }
```

### `StreamAdapter / ProviderRegistry (sc5)` — new

StreamAdapter {run, cancel, capabilities:{resume}}; ProviderRegistry {get, available}. Constructed via a deps-injected factory following the createWebviewPanelHost(deps) idiom (deps: subprocess spawner + logger) so the adapter is unit-testable with a fake spawner. Each provider's native→TurnEvent mapper + resume mechanics are private to its adapter.

```
+ export interface StreamAdapter {...}; export interface ProviderRegistry {...}
```

**Call sites:**
- `src/agent/providers/cli-provider.ts (reference for subprocess spawn + structured-output handling)`

## Interaction with shared contracts

| Contract | Role | How |
| :--- | :--- | :--- |
| `sc2` | implements | S002 owns and defines the TurnEvent union + UnifiedDiff (stream-events.ts) exactly as the HLD published; each provider adapter maps native stream lines into these events. S003/S004/S006 consume the union unchanged. |
| `sc5` | implements | S002 owns and implements StreamAdapter + ProviderRegistry (cli-adapter.ts) as vscode-free deps-injected host modules: run() spawns the provider CLI in structured stream mode and yields sc2 events; cancel() aborts; capabilities.resume reflects spike-verified native resume; the registry exposes only installed agentic CLIs. S003 calls run(); S005 reads available + uses SessionHandle/capabilities.resume. |

## Error paths

### Error cases

- **The selected provider CLI binary is not installed / not on PATH.** (recoverable)
  - Detection: The subprocess spawn fails with ENOENT (spawn error event) before any stream line arrives.
  - Response: run() yields a single terminal error TurnEvent ('claude/codex CLI not found — install it or check PATH') and completes; ProviderRegistry omits that provider from `available`.
  - User impact: The turn fails immediately with a clear message; other installed providers keep working.
- **The CLI process exits non-zero mid-turn.** (recoverable)
  - Detection: The subprocess 'close' event fires with a non-zero exit code before a native terminal/done event was seen.
  - Response: Emit a terminal error TurnEvent with a trimmed stderr tail, then complete; partial assistant text stays rendered.
  - User impact: The user sees partial output plus a clear error line; they can retry.
- **The CLI emits a line that is not valid structured output.** (recoverable)
  - Detection: The per-provider parser's JSON.parse throws, or the parsed object matches no known native-event case.
  - Response: A non-fatal malformed line is logged (getLogger) and skipped — never yielded as a malformed TurnEvent; a wholly unintelligible stream yields one terminal error TurnEvent. The sc2 invariant (only valid events escape) holds.
  - User impact: Provider noise is invisible; a broken stream surfaces as one clear error, not corrupt UI.
- **The CLI reports an authentication/authorization failure.** (recoverable)
  - Detection: The provider emits its native auth-error event or exits with its documented auth exit code, matched in the mapper.
  - Response: Emit a terminal error TurnEvent telling the user to re-authenticate their CLI session; NO REST fallback, no stored credentials (k2).
  - User impact: Clear 'log in to your CLI' guidance; the extension never silently reaches a cloud endpoint.
- **cancel(turnId) is called while a turn is streaming.** (recoverable)
  - Detection: cancel() looks up the live subprocess handle for turnId (tracked internally).
  - Response: The subprocess is signalled to terminate; the iterable completes with terminal done (ok:false); no orphan remains. Unknown/finished id is a no-op.
  - User impact: Stopping a turn is immediate and clean.

### Edge cases

| Input | Expected |
| :--- | :--- |
| req.resume provided but the provider's capabilities.resume is false. | The adapter starts a fresh native session (ignores the resume handle) rather than erroring. |
| An empty or whitespace-only prompt. | The adapter still spawns the turn and lets the CLI decide; it does not reject — passthrough (k8). |
| The CLI emits further native events after a terminal 'done'. | Ignored; 'done' is terminal and the iterable has completed. |
| A burst of very high-frequency assistant-delta lines. | Yielded as they arrive; for-await backpressure paces consumption (no whole-turn buffering). |
| No agentic CLI installed at all. | available is empty; S005 shows 'no provider available'; get() is never called with an absent id. |

### Invariants to preserve

- Cloud LLM access happens ONLY through the user's installed claude/codex CLI OAuth session — no direct cloud REST, no stored credentials (k2). The daemon's CliProvider (src/agent/providers/cli-provider.ts) is the in-repo precedent. [[c4]]
- Chat CLI execution is a directly-spawned subprocess in the extension host, NOT routed through the daemon (k1). [[c1]]
- The chat provider set is the agentic coding CLIs (claude/codex) only; ProviderRegistry never exposes a plain-completion provider (k4). [[c1]]
- Only valid sc2 TurnEvents escape the adapter — no native provider-specific shape leaks to consumers. [[c5]]

## Test strategy

**Test framework:** `node:test (tsx --test) + node:assert/strict over deps-injected fakes (the vscode-plugin *.test convention); a source-scan integration test mirroring vscode-plugin/src/freshness/__tests__/extension-wiring.test.ts; live provider checks gated behind an INSRC_LIVE_TESTS-style env var that skips cleanly when unset.`

### Test levels

- **unit** — Prove the StreamAdapter normalizes a provider's native structured stream into the sc2 TurnEvent union, over a FAKE subprocess spawner (no real CLI).
  - Subjects: `A scripted native stream maps to the expected ordered TurnEvents (assistant-delta ×N → tool-call → file-edit → done)`, `file-edit native payload maps to a hunk-based UnifiedDiff`, `Only valid sc2 TurnEvents are yielded; an unparseable/unknown line is skipped-and-logged`, `A non-zero exit before 'done' yields a terminal error TurnEvent with stderr tail`, `ENOENT spawn failure yields a terminal 'CLI not found' error TurnEvent`, `An auth-error native event yields a terminal re-auth error TurnEvent (no REST fallback)`, `cancel(turnId) terminates the fake subprocess and completes with done(ok:false); cancel of unknown id is a no-op`, `capabilities.resume reflects the mapper's declared support; resume when unsupported starts a fresh session (no throw)`, `post-'done' native events are ignored`
  - Fixtures: `A fake deps-injected subprocess spawner replaying scripted native lines + exit code/signal`, `Per-provider native-stream fixtures (claude, codex) from the S002 spike`
- **unit** — Prove ProviderRegistry exposes only installed agentic CLIs.
  - Subjects: `available lists only providers whose binary the injected probe reports present; Ollama never a member (k4)`, `get(id) returns the matching adapter; get(absent id) throws unknown-provider`, `available is empty when no agentic CLI is installed`
  - Fixtures: `A fake binary-presence probe injected via deps`
- **integration** — Source/wiring scan (headless-safe): assert direct subprocess spawn and no daemon-IPC/REST in the execution path.
  - Subjects: `cli-adapter imports a child_process spawn seam, not the daemon IPC client, for execution (k1)`, `No undici/http/https/fetch import in the adapter execution path (k2)`
  - Fixtures: `A source-scan over the new chat/ adapter module mirroring vscode-plugin/src/freshness/__tests__/extension-wiring.test.ts`
- **live** — OPT-IN spike/verification against the real installed claude/codex CLIs to pin the exact structured-stream flags + native resume (gated behind an INSRC_LIVE_TESTS-style env var).
  - Subjects: `Real claude structured-stream invocation emits parseable events the mapper turns into TurnEvents`, `Real native session-resume yields a usable SessionHandle (or the provider is marked resume:false)`
  - Fixtures: `Installed + authenticated claude/codex CLIs; an env-var gate so CI/others skip`

### Acceptance mapping

| Criterion | Proving tests |
| :--- | :--- |
| `ac1` | `unit: scripted native stream → ordered TurnEvents over a fake spawner`, `unit: available lists only installed agentic CLIs, Ollama never present`, `integration: source-scan proves direct child_process spawn, not daemon-IPC execution (k1)`, `live (opt-in): real claude/codex structured-stream emits parseable events` |
| `ac2` | `integration: source-scan asserts no undici/http/https/fetch import in the execution path (no REST)`, `unit: an auth-error native event yields a re-auth error TurnEvent with NO REST fallback` |
| `ac3` | `unit: scripted native stream maps to discrete assistant-delta/tool-call/file-edit/done TurnEvents`, `unit: unparseable line is skipped-and-logged, never yielded as a malformed TurnEvent` |

## Migration

**State before:** The insrc VS Code extension (vscode-plugin/src) has NO chat/CLI-bridge module and no TurnEvent/StreamAdapter types — the only webview is the status/repo-config panel and the only in-repo CLI-subprocess wrapper is the daemon-side src/agent/providers/cli-provider.ts, which S002 does not touch. S002 is purely additive.

**State after:** New vscode-free host modules under a new chat/ area of vscode-plugin/src: stream-events.ts (sc2) and cli-adapter.ts (sc5 + per-provider adapters + deps-injected factory), exported for Phase B/C but NOT wired into activation yet. The daemon's CliProvider is unchanged.

**Zero downtime:** yes — **Data rewrite:** no

### Steps

1. Run the throwaway claude/codex stream+resume spike against the installed CLIs to pin the exact structured-stream flags + native session-resume; capture native-stream fixtures for the unit tests. (Spike code discarded.) — ↩ rollbackable
2. Add stream-events.ts (sc2 TurnEvent + UnifiedDiff). Additive type-only module. — ↩ rollbackable
3. Add cli-adapter.ts (sc5 interfaces + per-provider adapters + deps-injected factory). Additive; not referenced by activation. — ↩ rollbackable
4. Add unit suites (fake spawner + fixtures) + the source-scan integration test; optionally an INSRC_LIVE_TESTS-gated live check. — ↩ rollbackable

**Backward compat:** No existing public API changes — S002 adds new modules only and does not modify extension.ts activation, the status webview host, or the daemon's CliProvider. The new sc2/sc5 exports become the stable surface Phase B/C build against; no consumer exists yet to break.

## Alternatives considered

### a1: HLD contract as-is: AsyncIterable<TurnEvent> discriminated union — **CHOSEN**

Implement sc2/sc5 exactly as the HLD sketch — run() returns an AsyncIterable of the TurnEvent union, per-provider native→TurnEvent mappers private to the adapter.

Keep the HLD sc2 union + sc5 StreamAdapter/ProviderRegistry verbatim. run(req) is an async generator that spawns the provider CLI, reads its native structured stream line-by-line, yields normalized TurnEvents; cancel() kills the subprocess; capabilities.resume reflects native resume. Consumers for-await for natural backpressure; nothing provider-specific escapes.

### a2: Enveloped events: TurnEvent wrapped with monotonic seq + timestamp

Same union but each yielded item is wrapped in an envelope { seq, ts, event }.

Adopt the a1 union but yield an envelope carrying a per-turn monotonic seq + timestamp around each TurnEvent; AsyncIterable/StreamAdapter otherwise identical.

**Rejected because:** Drops to partial on sc2: the seq/ts envelope changes the approved contract for an ordinal benefit that yield-order already provides in-scope, forcing an amendment for no in-scope gain. (The seq idea can live as an internal per-turn counter without changing sc2.)

### a3: Pre/post content on file-edit instead of a UnifiedDiff

file-edit carries {path, before, after} full contents; S006 computes the diff.

Same AsyncIterable<TurnEvent> but the file-edit variant carries before/after file contents instead of a UnifiedDiff; diff computation moves to the S006 renderer.

**Rejected because:** Partial on sc2 (file-edit shape change) and strains the HLD streaming-throughput non-functional target by shipping full file blobs; worse than a1 with no compensating in-scope benefit.

## Citations

- **[[c1]]** `prior-artifact` `Approved HLD (HLD-edb76e2e4d41217d) + SpecArtifact 67260700545c57e7` — "sc2 TurnEvent union + sc5 StreamAdapter/ProviderRegistry owned by S002; extension-managed CLI spawn (k1), no REST/own CLI (k2), claude/codex only (k4), passthrough (k8), per-provider adapter quarantin"
- **[[c2]]** `analyze-bundle` `s1 structural-map of vscode-plugin/src` — "Factory+deps-injection idiom (createWebviewPanelHost(deps)); vscode-free host modules; tests *.test; no existing chat/CLI-bridge — S002 net-new."
- **[[c3]]** `code` `src/agent/providers/cli-provider.ts` — "The daemon's CliProvider wraps claude+codex as structured-output-aware subprocesses — in-repo prior art for how these CLIs are invoked (reference for the S002 extension-side adapter + spike)."
- **[[c4]]** `convention` `CLAUDE.md project principles` — "Cloud LLM access only via the claude/codex CLI binaries; no direct cloud REST. Daemon owns DB; IDE via IPC — but chat execution is deliberately extension-managed (k1)."
- **[[c5]]** `prior-artifact` `HLD sharedContracts sc2 + sc5 interfaceSketches` — "The TurnEvent union + UnifiedDiff (sc2) and StreamAdapter/ProviderRegistry/TurnRequest/SessionHandle (sc5) type sketches implemented verbatim by S002."

<!-- insrc:review -->

## Review

### ✅ Review `PASS` — design.story (design.story)

**0 HIGH · 0 MED · 8 LOW** · model `client` · reviewed 2026-09-25T14:18:31.900Z

| Ref | Kind | Severity | Fixability | Premise | Evidence | Action |
| --- | --- | --- | --- | --- | --- | --- |
| dataModel/invariants | citation | LOW | auto | The daemon's CliProvider prior art the LLD leans on exists at src/agent/providers/cli-provider.ts. | src/agent/providers/cli-provider.ts:1 read OK + 50 CliProvider refs — the prior-art wrapper the LLD references exists. | No action; citation confirmed. |
| testStrategy | citation | LOW | auto | The source-scan integration test the LLD says to mirror exists at vscode-plugin/src/freshness/__tests__/extension-wiring.test.ts. | vscode-plugin/src/freshness/__tests__/extension-wiring.test.ts:1 read OK — the source-scan test idiom the LLD mirrors exists. | No action; citation confirmed. |
| migration | citation | LOW | auto | No chat/CLI-bridge module currently exists in vscode-plugin/src (S002 is net-new); there is no existing StreamAdapter/TurnEvent/cli-adapter. | A scoped rg over vscode-plugin/src for StreamAdapter/TurnEvent/ProviderRegistry/cli-adapter/stream-events returns ZERO; the 50 unscoped hits are all in the DEF/HLD/LLD docs. S002 is net-new as claimed. | No action; the net-new premise holds. |
| contractDetails | citation | LOW | auto | The extension already uses the deps-injected factory idiom (createWebviewPanelHost) the LLD follows for the new adapter modules. | createWebviewPanelHost has 41 refs and vscode-plugin/src/panels/webview-host.ts:111 read OK — the deps-injected factory idiom the LLD follows exists. | No action; citation confirmed. |
| hldContextSlice | cross-artifact | LOW | assisted | The HLD assigns ownership of sc2 and sc5 to Story S002, matching this LLD's implements-role claims. | The approved HLD.md read OK and matches ownership of sc2/sc5 to S002. NOTE: the rendered LLD.md header shows 'Owns: undefined (undefined)' — a cosmetic renderer glitch from passing hldContextSlice.ownedContracts as plain strings; the underlying ownership + implements-roles are correct throughout the artifact and the HLD. | Cosmetic only: the 'Owns: undefined' header line is a display artifact, not a substance error. Optionally re-render with ownedContracts as {id,name} objects on a future touch; no gate impact. |
| dataModel | closed-union | LOW | auto | The sc2 TurnEvent union has exactly six variants: assistant-delta, tool-call, file-edit, status, done, error (verbatim from the HLD sc2 sketch). | The HLD.md read OK; the six TurnEvent variants (assistant-delta/tool-call/file-edit/status/done/error) match the sc2 sketch verbatim. | No action; closed-union matches the HLD. |
| spike | external-contract | LOW | assisted | claude/codex each expose a machine-readable structured stream mode (e.g. claude --output-format stream-json) and a native session-resume flag — an out-of-process contract the LLD defers to the S002 spike, quarantined behind the adapter (StreamAdapter.capabilities.resume). | output-format stream-json / --resume / session-id hit 11 in-repo refs (docs/prompts) — these do NOT prove the external claude/codex CLI flags. This is correctly treated as an out-of-process contract deferred to the S002 spike and quarantined behind StreamAdapter.capabilities.resume, so a per-provider surprise cannot leak past sc2/sc5. | Validate the exact flags with the S002 build-time spike before wiring the panel (already the LLD's migration step 1). No LLD change needed. |
| invariants | citation | LOW | auto | The project mandate the LLD's k2 invariant rests on (cloud LLM only via claude/codex CLI, no direct REST) is documented in CLAUDE.md. | CLAUDE.md:1 read OK + 50 CliProvider/no-REST refs — the project mandate behind the k2 invariant is real as cited. | No action; citation confirmed. |
