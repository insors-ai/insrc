<!-- insrc:artifact PLAN-edb76e2e4d41217d-s2 -->

# Plan: E20260925edb76e2e:S002

**Epic:** `work-framed-approved-spec-proceed-from`
**LLD run:** `wf-1790344457073-6cysyq`
**LLD effective hash:** `f394a9ecb688...`

## Tasks

| # | Task | Size | Depends on | Tests | Derived from |
| :--- | :--- | :--- | :--- | :--- | :--- |
| 1 | **`t1`** Spike the claude/codex structured-stream + native-resume contract; capture fixtures | S | — | live: opt-in: real claude/codex structured-stream invocation emits parseable events the mapper turns into TurnEvents; live: opt-in: real native session-resume yields a usable SessionHandle (or the provider is marked resume:false) | [[c5]] |
| 2 | **`t2`** Add sc2 stream-events.ts (TurnEvent union + UnifiedDiff) | S | — | unit: stream-events: the TurnEvent union has exactly the 6 kinds + UnifiedDiff shape (compile-time exhaustiveness assertion) | [[c1]] |
| 3 | **`t3`** Add sc5 cli-adapter.ts: StreamAdapter/ProviderRegistry + per-provider mappers + factory | M | `t1`, `t2` | unit: adapter: scripted native stream over a fake spawner → ordered TurnEvents (assistant-delta ×N → tool-call → file-edit → done); unit: adapter: file-edit native payload → hunk-based UnifiedDiff; unit: adapter: unparseable/unknown line skipped-and-logged; only valid sc2 TurnEvents yielded; unit: adapter: non-zero exit before done → terminal error TurnEvent with stderr tail; ENOENT → 'CLI not found' error TurnEvent; unit: adapter: auth-error native event → terminal re-auth error TurnEvent (no REST fallback); unit: adapter: cancel(turnId) terminates fake subprocess → done(ok:false); unknown id no-op; post-done events ignored; unit: adapter: capabilities.resume honored; resume-when-unsupported starts a fresh session (no throw) | [[c2]] [[c3]] |
| 4 | **`t4`** Add the test suites (fake-spawner unit + source-scan integration + gated live) | M | `t1`, `t2`, `t3` | unit: registry: available lists only providers whose injected probe reports present; Ollama never a member; unit: registry: get(id) returns the matching adapter; get(absent id) throws unknown-provider; available empty when none installed; integration: source-scan: cli-adapter imports a child_process spawn seam, not the daemon IPC client (k1); integration: source-scan: no undici/http/https/fetch import in the adapter execution path (k2) | [[c4]] |

### E20260925edb76e2e:S002:T001 — Spike the claude/codex structured-stream + native-resume contract; capture fixtures

Run a throwaway spike against the installed claude/codex CLIs to pin the exact structured-stream invocation flags (e.g. claude --output-format stream-json) and the native session-resume mechanism, and capture representative native-stream sample lines as test fixtures under vscode-plugin/src/chat/__tests__/fixtures/. Spike code is discarded; only the findings + fixtures are kept.

**Acceptance checks:**
- The exact per-provider structured-stream flags + native resume flag/id are documented (in the adapter's comments / a short note)
- Representative native-stream fixtures for claude (and codex if available) are captured for the unit tests
- No throwaway spike code remains in the shipped source

### E20260925edb76e2e:S002:T002 — Add sc2 stream-events.ts (TurnEvent union + UnifiedDiff)

Create vscode-plugin/src/chat/stream-events.ts with the sc2 TurnEvent discriminated union (assistant-delta | tool-call | file-edit | status | done | error) + UnifiedDiff, verbatim from the HLD sketch. Type-only, additive, exported for downstream stories; nothing imports it yet.

**Acceptance checks:**
- stream-events.ts exports the exact 6-variant TurnEvent union + UnifiedDiff from the HLD sc2 sketch
- tsc clean under the vscode-plugin tsconfig; no vscode import

### E20260925edb76e2e:S002:T003 — Add sc5 cli-adapter.ts: StreamAdapter/ProviderRegistry + per-provider mappers + factory

Create vscode-plugin/src/chat/cli-adapter.ts implementing sc5 as vscode-free deps-injected host modules: TurnRequest/SessionHandle/StreamAdapter/ProviderRegistry types; a deps-injected factory (spawner + logger + binary-presence probe) following the createWebviewPanelHost(deps) idiom; per-provider (claude, codex) native→TurnEvent mappers behind the adapter; run() as an async generator that spawns the CLI directly (bypassing the daemon) and yields sc2 events; cancel() with subprocess-handle tracking; capabilities.resume; and the error-normalization paths (ENOENT, non-zero exit, unparseable line skip-and-log, auth-error, cancel) all surfaced as in-stream terminal error TurnEvents. ProviderRegistry.available lists only installed agentic CLIs (never Ollama). No cloud REST; imports child_process spawn, not the daemon IPC client.

**Acceptance checks:**
- run() spawns the provider CLI directly via a child_process spawn seam (no daemon IPC, no undici/http/fetch) and yields only valid sc2 TurnEvents
- The five LLD error cases each surface as a terminal error TurnEvent (never a thrown reject); cancel() tracks + kills the subprocess and is idempotent
- capabilities.resume reflects the provider; resume-when-unsupported starts a fresh session (no throw)
- ProviderRegistry.available lists only installed claude/codex (Ollama never a member); get(absent) throws unknown-provider
- tsc/eslint clean; vscode-free; deps-injected factory (unit-testable with a fake spawner)

### E20260925edb76e2e:S002:T004 — Add the test suites (fake-spawner unit + source-scan integration + gated live)

Add vscode-plugin/src/chat/__tests__/: unit suites over a fake deps-injected spawner replaying the captured fixtures (stream normalization, ordered events, file-edit→UnifiedDiff, malformed-line skip, ENOENT/non-zero-exit/auth-error terminal errors, cancel, capabilities.resume, post-done ignored) + a ProviderRegistry unit suite (available filtering, get, empty); a source-scan integration test (mirroring freshness/__tests__/extension-wiring.test.ts) asserting the adapter uses child_process spawn and imports no daemon-IPC/undici/http/fetch in the execution path; and an INSRC_LIVE_TESTS-gated real-CLI check that skips cleanly when unset. All acceptance criteria ac1-ac3 covered and green.

**Acceptance checks:**
- Unit suites cover every LLD testStrategy subject and pass under tsx --test
- The source-scan integration test proves direct spawn + no daemon-IPC/REST in the execution path (k1/k2)
- The live check is env-gated and skips cleanly when INSRC_LIVE_TESTS is unset
- ac1, ac2, ac3 each have a passing proving test

## Test-strategy coverage

| LLD strategy item | Covered by |
| :--- | :--- |
| A scripted native stream maps to the expected ordered TurnEvents (assistant-delta ×N → tool-call → file-edit → done) | `t3`, `t4` |
| file-edit native payload maps to a hunk-based UnifiedDiff | `t3`, `t4` |
| Only valid sc2 TurnEvents are yielded; an unparseable/unknown line is skipped-and-logged | `t3`, `t4` |
| A non-zero exit before 'done' yields a terminal error TurnEvent with stderr tail | `t3`, `t4` |
| ENOENT spawn failure yields a terminal 'CLI not found' error TurnEvent | `t3`, `t4` |
| An auth-error native event yields a terminal re-auth error TurnEvent (no REST fallback) | `t3`, `t4` |
| cancel(turnId) terminates the fake subprocess and completes with done(ok:false); cancel of unknown id is a no-op | `t3`, `t4` |
| capabilities.resume reflects the mapper's declared support; resume when unsupported starts a fresh session (no throw) | `t3`, `t4` |
| post-'done' native events are ignored | `t3`, `t4` |
| available lists only providers whose binary the injected probe reports present; Ollama never a member (k4) | `t4` |
| get(id) returns the matching adapter; get(absent id) throws unknown-provider | `t4` |
| available is empty when no agentic CLI is installed | `t4` |
| cli-adapter imports a child_process spawn seam, not the daemon IPC client, for execution (k1) | `t4` |
| No undici/http/https/fetch import in the adapter execution path (k2) | `t4` |
| Real claude structured-stream invocation emits parseable events the mapper turns into TurnEvents | `t1` |
| Real native session-resume yields a usable SessionHandle (or the provider is marked resume:false) | `t1` |

## Citations

- **[[c1]]** `prior-artifact` `LLD s2 dataModelChanges: sc2 TurnEvent union + UnifiedDiff (stream-events.ts)`
- **[[c2]]** `prior-artifact` `LLD s2 contractDetails: sc5 StreamAdapter/ProviderRegistry + TurnRequest/SessionHandle (cli-adapter.ts)`
- **[[c3]]** `prior-artifact` `LLD s2 errorPaths: the five in-stream terminal-error cases + cancel + invariants k1/k2/k4/sc2`
- **[[c4]]** `prior-artifact` `LLD s2 testStrategy: fake-spawner unit suites + source-scan integration + INSRC_LIVE_TESTS-gated live check`
- **[[c5]]** `prior-artifact` `LLD s2 migration step 1: the claude/codex structured-stream + native-resume spike (pin flags, capture fixtures)`
