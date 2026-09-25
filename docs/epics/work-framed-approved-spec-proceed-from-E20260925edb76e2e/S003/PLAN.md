<!-- insrc:artifact PLAN-edb76e2e4d41217d-s3 -->

# Plan: E20260925edb76e2e:S003

**Epic:** `work-framed-approved-spec-proceed-from`
**LLD run:** `wf-1790351293705-rcb4i9`
**LLD effective hash:** `f394a9ecb688...`

## Tasks

| # | Task | Size | Depends on | Tests | Derived from |
| :--- | :--- | :--- | :--- | :--- | :--- |
| 1 | **`t1`** sc4 session-store.ts (types + memento + in-memory double) | M | — | unit: createMementoChatSessionStore round-trip over a fake Memento (create/append/save then get/list) + corrupt/missing degrade + in-memory parity; unit: store writes only to the injected memento (no daemon/other write) — k3 | [[c1]] [[c2]] [[c5]] |
| 2 | **`t2`** sc3 protocol.ts (Envelope + message unions) | S | `t1` | unit: sc3 exhaustive switch over HostToWebview/WebviewToHost compiles; every message keeps `type`; Envelope v===1 | [[c2]] |
| 3 | **`t3`** chat-panel.ts createChatPanelHost (turn loop + dispatch + shell) | L | `t1`, `t2` | unit: submit-turn -> StreamAdapter.run + incremental turn-event posts (interleaved, not buffered) via FakePanel; unit: error TurnEvent posted inline + unknown-provider surfaced (not thrown); empty submit no-op; single-in-flight no interleave; unit: onDidDispose cancels the active turn + stops posting; edit-*/docs-*/malformed ignored; passthrough (no workflow-tool call on deps); integration: rendered chat shell: one nonce'd inline script + strict CSP + fresh nonce/render + renderTerminalStyle/surfaceClass('chat') + no remote origin/asWebviewUri | [[c1]] [[c5]] |
| 4 | **`t4`** Flag-gated extension.ts wiring + package.json contributes | S | `t3` | integration: extension.ts source-scan: chat command gated on insrc.chat.enabled (getConfiguration().get, full dotted key); host constructed with injected seams + memento store; Disposable pushed to context.subscriptions; integration: package.json contributes the chat command + insrc.chat.enabled boolean (default false) | [[c4]] |
| 5 | **`t5`** Test suites (unit + contract + extension-wiring scan) | M | `t3`, `t4` | unit: authors + runs the host + store unit suites green; integration: authors + runs the shell-contract + extension-wiring scan suites green; smoke: full vscode-plugin tsc + test sweep passes with no regressions | [[c3]] [[c5]] |

### E20260925edb76e2e:S003:T001 — sc4 session-store.ts (types + memento + in-memory double)

Add vscode-plugin/src/chat/session-store.ts: the ChatSession/TranscriptEntry/ChatSummary types + the ChatSessionStore interface (create/get/list/append/save), a createMementoChatSessionStore(deps:{memento,now?,genId?}) real binding (chat sessions under an insrc.chat.* key prefix, JSON-serializable, graceful-degrade on corrupt/missing), and a createInMemoryChatSessionStore() volatile double. vscode-free (Memento typed via the plugin's vscode.d.ts). Mirrors the OnboardingStore/PromptStore seam.

**Acceptance checks:**
- Exports ChatSession/TranscriptEntry/ChatSummary/ChatSessionStore + createMementoChatSessionStore + createInMemoryChatSessionStore; imports nothing from 'vscode'; tsc clean.
- create(provider) returns a fresh id + createdAt=now() + editMode 'auto' + empty transcript; append/save persist via memento.update; get/list reflect prior writes.
- A missing or corrupt memento entry degrades to get->undefined / list->[] (no throw); nothing is written outside the injected memento (k3).

### E20260925edb76e2e:S003:T002 — sc3 protocol.ts (Envelope + message unions)

Add vscode-plugin/src/chat/protocol.ts: Envelope<T>{v:1;payload:T} + the full HostToWebview/WebviewToHost unions (discriminated by `type`) verbatim from the HLD sketch, plus the minimal DocsArtifactSummary the docs-list variant carries. Imports TurnEvent/UnifiedDiff (sc2), TerminalTheme (sc1), ProviderId (sc5), TranscriptEntry/ChatSummary (sc4) — a type-only import dependency on t1, no runtime coupling. Type-only; vscode-free.

**Acceptance checks:**
- Exports Envelope + HostToWebview + WebviewToHost + DocsArtifactSummary; every message keeps a `type` discriminant; tsc clean with the sc1/sc2/sc4/sc5 imports resolving.
- An exhaustive switch over each union compiles (compile-time exhaustiveness); imports nothing from 'vscode'.

### E20260925edb76e2e:S003:T003 — chat-panel.ts createChatPanelHost (turn loop + dispatch + shell)

Add vscode-plugin/src/chat/chat-panel.ts: ChatPanelHost/ChatPanelHostDeps + createChatPanelHost(deps). Renders the terminal chat webview shell (one nonce'd inline script under a strict per-render CSP, embedding renderTerminalStyle + surfaceClass('chat')); dispatches WebviewToHost messages; on submit-turn runs StreamAdapter.run and posts each TurnEvent INCREMENTALLY while appending TranscriptEntry rows; single-in-flight guard; onDidDispose -> cancel + stop posting; unknown-provider/errors surfaced as terminal error events; edit-*/docs-* accepted-but-ignored; passthrough (no workflow tool). vscode-free, deps-injected. The two concerns (vscode-free dispatch/turn-loop + the rendered shell) stay independently provable per the checks below.

**Acceptance checks:**
- (host logic) createChatPanelHost is vscode-free (imports nothing from 'vscode') and returns ChatPanelHost {open,dispose}; submit-turn drives StreamAdapter.run(TurnRequest{provider,prompt,cwd}) and posts each yielded TurnEvent incrementally (no whole-turn buffering); a terminal error event is posted inline; empty submit is a no-op; a second submit while streaming does not interleave (cancel-or-ignore).
- (shell) the rendered shell keeps the one-inline-nonced-script + strict-CSP + fresh-nonce-per-render invariants and contains renderTerminalStyle output + surfaceClass('chat').
- onDidDispose cancels the active turn and stops posting; every post routes through the injected fire-and-forget postMessage; the host never calls an insrc workflow/MCP tool (passthrough, k8).

### E20260925edb76e2e:S003:T004 — Flag-gated extension.ts wiring + package.json contributes

Wire extension.ts activate(): read insrc.chat.enabled via getConfiguration().get; when true, construct the memento-backed ChatSessionStore + a ProviderRegistry + createChatPanelHost with the injected vscode channel seams (createWebviewPanel/onDidReceiveMessage/postMessage/onDidDispose) mirroring the status-panel callsite, register the chat command, push its Disposable into context.subscriptions. Add the chat command + insrc.chat.enabled (boolean, default false) to vscode-plugin/package.json contributes. Existing wiring untouched.

**Acceptance checks:**
- The chat command is registered ONLY when insrc.chat.enabled reads true; the chat host is constructed with the real injected vscode seams + the memento store; the Disposable is pushed into context.subscriptions.
- package.json contributes the chat command + the insrc.chat.enabled boolean config (default false); existing commands/panels are byte-unchanged.

### E20260925edb76e2e:S003:T005 — Test suites (unit + contract + extension-wiring scan)

Add node:test suites under vscode-plugin/src/chat/__tests__/: a FakePanel-driven unit suite for the host (incremental streaming, error/dispose/corrupt-store/malformed-message/double-submit, passthrough) + the store round-trip; a contract suite for the rendered shell CSP/nonce + sc1 consumption + sc3 exhaustiveness; an extension-wiring source-scan for the flag gate + injected seams + vscode-free host. Run the scoped src/chat suite then tsc + the full plugin sweep.

**Acceptance checks:**
- Unit suite proves incremental posting, the error/dispose/corrupt/malformed/double-submit paths, passthrough (no workflow-tool call), and the store round-trip/degrade.
- Contract suite proves the shell CSP/nonce invariants + renderTerminalStyle/surfaceClass('chat') consumption + sc3 exhaustiveness; extension-wiring scan proves the insrc.chat.enabled gate + injected seams + a vscode-free chat host.
- npx tsc --noEmit clean; scoped src/chat suite green; full vscode-plugin sweep passes with no regressions.

## Test-strategy coverage

| LLD strategy item | Covered by |
| :--- | :--- |
| submit-turn -> host calls StreamAdapter.run(TurnRequest{provider,prompt,cwd}) and posts each yielded TurnEvent as a HostToWebview 'turn-event' INCREMENTALLY (assert posts interleave with the async iterable, not buffered to the end) — ac2 | `t3`, `t5` |
| a terminal error TurnEvent (fake adapter) is posted inline and the turn is marked done, session still usable; unknown-provider is surfaced as an error event, not thrown | `t3`, `t5` |
| empty/whitespace submit-turn is a no-op (no StreamAdapter.run) | `t3`, `t5` |
| single-in-flight guard: a second submit while streaming cancels the prior turn (StreamAdapter.cancel) or is ignored — transcript never interleaves | `t3`, `t5` |
| onDidDispose -> host calls StreamAdapter.cancel(activeTurnId) and posts nothing further (posts routed through the fire-and-forget seam) | `t3`, `t5` |
| edit-*/docs-* and unknown/malformed inbound messages are accepted-but-ignored no-ops (logged, never thrown) | `t3`, `t5` |
| createMementoChatSessionStore round-trip over a fake Memento: create/append/save then get/list reflect it; a corrupt/missing entry degrades to undefined/[] (no throw); createInMemoryChatSessionStore parity | `t1`, `t5` |
| no chat data written anywhere but the injected memento (k3) | `t1`, `t5` |
| The rendered chat webview shell keeps the proven invariants: exactly one inline nonce'd script, strict CSP script-src limited to 'nonce-...', script nonce == CSP nonce, fresh nonce per render (mirrors webview-host.test.ts:321-338) | `t3`, `t5` |
| The shell embeds renderTerminalStyle(terminalTheme) (sc1) and targets surfaceClass('chat') — terminal styled, not chat-bubble (k6) | `t3`, `t5` |
| sc3 protocol.ts: an exhaustive switch over HostToWebview/WebviewToHost `type` compiles (compile-time exhaustiveness) and every message keeps the `type` discriminant; Envelope v===1 | `t2`, `t5` |
| no remote origin / asWebviewUri in the rendered shell (k2 CSP-safe) | `t3`, `t5` |
| extension.ts registers the chat panel command ONLY when insrc.chat.enabled is read true (config gate), via getConfiguration().get with the full dotted key | `t4`, `t5` |
| extension.ts constructs createChatPanelHost with the real injected vscode seams (createWebviewPanel/onDidReceiveMessage/postMessage/onDidDispose) and the memento-backed ChatSessionStore — the chat host module imports nothing from 'vscode' | `t4`, `t5` |
| the chat panel Disposable is pushed into context.subscriptions | `t4`, `t5` |

## Citations

- **[[c1]]** `prior-artifact` `LLD s3 contractDetails.api (createChatPanelHost + createMementoChatSessionStore)`
- **[[c2]]** `prior-artifact` `LLD s3 dataModelChanges (sc3 protocol types + sc4 ChatSession/store types)`
- **[[c3]]** `prior-artifact` `LLD s3 testStrategy (node:test FakePanel unit + contract + extension-wiring; acceptance ac1/ac2/ac3)`
- **[[c4]]** `prior-artifact` `LLD s3 migration (flag-gated extension.ts wiring + package.json contributes)`
- **[[c5]]** `prior-artifact` `LLD s3 errorPaths + invariants (streaming/dispose/corrupt-store/passthrough; CSP/nonce; memento-only k3)`
