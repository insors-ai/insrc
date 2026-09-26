<!-- insrc:artifact LLD-edb76e2e4d41217d-s7 -->

# LLD: E20260926edb76e2e:S007

**Epic:** `work-framed-approved-spec-proceed-from`
**HLD base run:** `wf-1790398081061-o81y85`
**HLD effective hash:** `e2745c4bac48...`

## HLD context

**Framework:** Layered extension-host core + a thin terminal-styled webview (a1); vscode-free deps-injected host modules; the extension observes, never orchestrates (k8).
**Rollout phase:** Phase C — provider/history, edit governance, docs review & restore fidelity
**Consumes:** `sc1` (Terminal-UX design tokens + component vocabulary), `sc3` (Webview↔extension message protocol)

**Adjacent scope (owned by other stories — do NOT implement here):**
- `s1`: Mock deliverables + palette private to S001; consume only sc1. — owns `sc1`
- `s2`: Subprocess spawn + native stream parsing private to S002; consumers see only sc2/sc5. — owns `sc2`, `sc5`
- `s3`: Renderer internals, panel lifecycle, CSP bootstrap private to S003; consume sc3/sc4. — owns `sc3`, `sc4`
- `s4`: marker-line mapping private to S004; no shared contract.
- `s5`: provider/history/resume private to S005; no shared contract.
- `s6`: inline-diff renderer + EditGovernor + baseline private to S006; no new shared contract.
- `s8`: marker cssClass persistence/replay private to S008; additive sc4 fieldAdd owned by s3.

## Contract details

**Surface level:** internal

### `createDocsReviewClient`

```typescript
createDocsReviewClient(client: IpcClient): DocsReviewClient
```

**Parameters:**
- `client: IpcClient` — The shared daemon IPC client (src/shared/ipc-client.ts), client.rpc<T>(method, params). Same seam createDaemonConfigGateway consumes.

**Returns:** `DocsReviewClient` — A vscode-free client over the EXISTING daemon IPCs: pending()->workflow.pending, content(mdPath)->workflow.artifactContent, approve(mdPath)->workflow.approve, comment(artifactId,note)->workflow.resolveComment. Each normalizes the daemon { error } arm into a thrown Error. Mirrors createDaemonConfigGateway.

**Errors:**
- `thrown` when daemon { error } or socket reject — surfaced to the host as an inline notice.

**Preconditions:**
- The daemon is reachable over the shared client (the host catches rejections).

**Postconditions:**
- No cloud REST (k2); acts only on daemon-tracked artifacts (k5); persists nothing.

### `DocsReviewClient.pending`

```typescript
pending(): Promise<DocsArtifactSummary[]>
```

**Returns:** `Promise<DocsArtifactSummary[]>` — Maps each PendingArtifact {artifactId,kind,title,mdPath,openQuestionCount,state} to DocsArtifactSummary {id:artifactId,kind,title,status:state}; retains id->mdPath. { error } -> throw; { artifacts:[] } -> [].

**Errors:**
- `thrown` when WorkflowPendingError.error present.

**Preconditions:**
- Called on open + after each decision (re-fetch, k5).

**Postconditions:**
- Only pending-state artifacts (daemon-tracked, k5).

### `DocsReviewClient.content`

```typescript
content(mdPath: string): Promise<DocsContent>
```

**Parameters:**
- `mdPath: string` — The artifact's rendered .md path from its PendingArtifact.

**Returns:** `DocsContent` — { markdown, openQuestions, blocked } from workflow.artifactContent { mdPath }. { error } -> throw.

**Errors:**
- `thrown` when artifactContent { error } (path guard / unreadable).

**Preconditions:**
- mdPath came from a pending() result (k5).

**Postconditions:**
- Read-only.

### `DocsReviewClient.approve`

```typescript
approve(mdPath: string): Promise<WorkflowApproveResult>
```

**Parameters:**
- `mdPath: string` — The artifact path to approve, passed as workflow.approve { artifactPath }.

**Returns:** `WorkflowApproveResult` — workflow.approve { artifactPath: mdPath } -> { approved[], skipped[], codeReview[] }. A review-blocked artifact returns in skipped[] with a reason (block gate daemon-side, k5). No overrideReview from the pane.

**Errors:**
- `thrown` when socket reject; a blocked artifact is NOT an error (non-lossy skipped[]).

**Preconditions:**
- The artifact is pending (ac2).

**Postconditions:**
- On success it leaves the pending set; host re-fetches pending().

### `DocsReviewClient.comment`

```typescript
comment(artifactId: string, note: string): Promise<void>
```

**Parameters:**
- `artifactId: string` — The artifact whose review comment is recorded.
- `note: string` — The reviewer's note (recorded via the existing recordResolution machinery).

**Returns:** `Promise<void>` — workflow.resolveComment { artifactId, ... } — records the note; the artifact stays pending (the reject/request-changes path; no daemon reject IPC). Mirrors JetBrains annotate.

**Errors:**
- `thrown` when resolveComment { error }.

**Preconditions:**
- A daemon-tracked pending artifact (k5).

**Postconditions:**
- Stays pending (not approved).

### `createDocsReviewHost`

```typescript
createDocsReviewHost(deps: DocsReviewHostDeps): DocsReviewHost
```

**Parameters:**
- `deps: DocsReviewHostDeps` — Injected seams { createPanel:(opts)=>ChatPanelChannel; client: DocsReviewClient; logger?; genNonce? }. Reuses the S003 ChatPanelChannel seam so the host is vscode-free + FakePanel-testable.

**Returns:** `DocsReviewHost` — A vscode-free docs-review webview host (mirrors createChatPanelHost): open() renders the sc1 docs-review shell (one nonce'd CSP script) + posts docs-list from pending(); handles open-doc (->content->docs-content) + docs-decision (accept->approve; !accept->comment), re-fetching pending() after a decision. Holds id->mdPath in memory; persists nothing (k3).

**Errors:**
- `swallowed` when A client throw is caught + posted as an inline notice; never throws outward.

**Preconditions:**
- extension.ts injects the real createWebviewPanel seam + the DocsReviewClient, behind insrc.chat.enabled.

**Postconditions:**
- Acts only on daemon-tracked pending artifacts (k5); one nonce'd script under strict CSP, textContent/className only.

### `handleMessage`

```typescript
handleMessage(message: unknown): void  // docs host: open-doc | docs-decision
```

**Parameters:**
- `message: unknown` — The sc3 WebviewToHost envelope the docs-review webview posts. The chat-panel.ts reserved docs-decision default-case stays a no-op (docs-review is a SEPARATE host).

**Returns:** `void` — open-doc {artifactId} -> resolve mdPath -> content -> post docs-content. docs-decision {artifactId, accept} -> accept: approve(mdPath) + re-post docs-list (+ surface skipped[] block reason); !accept: record a comment + keep pending. Malformed/unknown -> dropped.

**Errors:**
- `validation` when non-string artifactId / unknown type dropped.

**Preconditions:**
- Called from the docs host's single onMessage handler.

**Postconditions:**
- Decisions reach the daemon approval flow (ac2); the list re-reflects real state (k5).

## Data model changes

### `DocsReviewClient / DocsContent (new, vscode-free, S007-private)` — new

createDocsReviewClient(client) + DocsReviewClient (pending/content/approve/comment) + DocsContent { markdown; openQuestions; blocked }. Maps PendingArtifact -> DocsArtifactSummary + normalizes { error }. No new daemon capability.

```
interface DocsContent { readonly markdown: string; readonly openQuestions: readonly string[]; readonly blocked: boolean; }
interface DocsReviewClient { pending(): Promise<DocsArtifactSummary[]>; content(mdPath: string): Promise<DocsContent>; approve(mdPath: string): Promise<WorkflowApproveResult>; comment(artifactId: string, note: string): Promise<void>; }
```

**Call sites:**
- `vscode-plugin/src/chat/docs-review-client.ts (new)`
- `vscode-plugin/src/extension.ts (constructed from the shared client)`

### `DocsReviewHost per-open state (in-memory, S007-private)` — new

createDocsReviewHost holds the current pending list (Map<artifactId, mdPath>) to resolve intents; discarded on dispose. Not persisted (k3).

```
// in-memory Map<string, string>; no persistence
```

**Call sites:**
- `vscode-plugin/src/chat/docs-review-panel.ts (new)`

### `insrc.chat.docsReview command (package.json contributes.commands)` — new

A new command opening the docs-review host, registered ONLY when insrc.chat.enabled (mirrors insrc.chat.open).

```
{ "command": "insrc.chat.docsReview", "title": "Review pending documents", "category": "insrc" }
```

**Call sites:**
- `vscode-plugin/package.json`
- `vscode-plugin/src/extension.ts`

## Interaction with shared contracts

| Contract | Role | How |
| :--- | :--- | :--- |
| `sc1` | consumes | Renders the docs-review surface with sc1 tokens (the 'docs-review' SurfaceKind); does not modify design-tokens.ts. |
| `sc3` | consumes | Rides docs-list + docs-decision unchanged; adds two ADDITIVE optional messages (docs-content host->webview, open-doc webview->host) — non-breaking, the S006/S008 additive pattern. No existing shape change. |

## Error paths

### Error cases

- **workflow.pending returns { error } (repo unresolved / unreadable store).** (recoverable)
  - Detection: DocsReviewClient.pending sees the { error } arm and throws; the host catch handles it.
  - Response: Inline notice with the error text; keep the pane open. Never a silent empty list (all-approved is a distinct empty-success).
  - User impact: The user sees why + can retry; no crash.
- **The daemon socket is unreachable.** (recoverable)
  - Detection: client.rpc rejects (createConnection fails); the rejection reaches the host catch.
  - Response: 'daemon unreachable' notice; refresh re-attempts. No throw outward.
  - User impact: Clear offline state, not a blank/hung pane.
- **workflow.approve returns the artifact in skipped[] with a review block reason.** (recoverable)
  - Detection: The host inspects WorkflowApproveResult.skipped[] (+ codeReview[]) after approve() — not in approved[].
  - Response: Surface the skipped reason inline + leave the artifact listed; no overrideReview from the pane (k5).
  - User impact: The user learns the block gate withheld approval + why.
- **workflow.artifactContent returns { error } for a body.** (recoverable)
  - Detection: DocsReviewClient.content sees the { error } arm and throws; the host catches it around open-doc.
  - Response: Post a docs-content notice 'content unavailable' for that id; keep the list intact.
  - User impact: One body fails with a reason; the rest works.

### Edge cases

| Input | Expected |
| :--- | :--- |
| No pending artifacts ({ artifacts: [] }). | Empty-state 'no pending documents' line (a success, not an { error }). |
| open-doc for an artifactId not in the held map (stale). | Ignored (or re-fetch) — no content call with an unknown id; no throw. |
| A PendingArtifact with an empty mdPath. | The row lists, but open-doc yields 'content unavailable' rather than content('') — guarded before the rpc. |
| accept for an artifact already approved out-of-band. | approve() is idempotent daemon-side (non-lossy); the host re-fetches and the row drops — no error. |
| reject with no comment text. | The pane prompts; an empty note is a no-op (nothing recorded, stays pending). |
| Panel disposed while a call is in flight. | The resolved post is a no-op (fire-and-forget); no throw, no leak. |

### Invariants to preserve

- The docs-review webview keeps EXACTLY ONE nonce'd inline script under strict CSP; list/body/controls via textContent + className only (never innerHTML), no remote origin, no asWebviewUri — the S003 shell contract. [[c3]]
- The pane acts ONLY on daemon-tracked pending-approval artifacts (workflow.pending/artifactContent/approve/resolveComment) — never ad-hoc chat files (k5); the list is a projection of the single source of truth (.insrc/artifacts). [[c1]]
- No direct cloud REST (k2): every daemon call goes through the shared IpcClient.rpc seam (the createDaemonConfigGateway idiom); no network path of its own. [[c2]]
- Approval goes through the daemon flow (workflow.approve); the code-review block gate is enforced daemon-side + surfaced via skipped[], never bypassed by the pane (ac2/k5). [[c1]]
- DocsReviewClient + createDocsReviewHost stay vscode-free (all vscode via the injected createPanel seam + injected client), unit-testable with a FakePanel + a fake IpcClient. [[c2]]
- S007 adds NO new daemon capability and NO new Epic shared contract: it consumes sc1 + sc3 + the existing four workflow.* IPCs; the only sc3 touch is the additive optional docs-content/open-doc messages (non-breaking). [[c3]]

## Test strategy

**Test framework:** `node:test + node:assert/strict via tsx --test (no vscode runtime; FakePanel + a fake IpcClient double) — matching chat-panel.test.ts / config/__tests__ / extension-chat-wiring.test.ts`

### Test levels

- **unit** — Pin DocsReviewClient mapping + { error } normalization over a fake IpcClient (docs-review-client.test.ts, new).
  - Subjects: `pending() maps PendingArtifact -> DocsArtifactSummary + retains id->mdPath`, `pending() throws on { error }; { artifacts:[] } -> []`, `content(mdPath) returns { markdown, openQuestions, blocked }; { error } -> throws`, `approve(mdPath) calls rpc('workflow.approve',{artifactPath:mdPath}) + returns WorkflowApproveResult verbatim`, `comment(id,note) calls rpc('workflow.resolveComment'); only client.rpc used (no cloud path)`
  - Fixtures: `a fake IpcClient recording {method,params} + scripted results incl. { error }`
- **integration** — Drive createDocsReviewHost (FakePanel + fake DocsReviewClient) (docs-review-panel.test.ts, new).
  - Subjects: `open() posts docs-list from pending() (ac1); empty -> empty-state; { error } -> notice`, `open-doc -> content(mdPath) -> posts docs-content; unknown id ignored; empty mdPath -> 'content unavailable' without content('')`, `docs-decision accept -> approve(mdPath); skipped[] block reason surfaced + artifact stays; success -> re-fetch pending()`, `docs-decision reject with a note -> comment(id,note) + stays pending; empty note is a no-op`, `the host invokes no chat/StreamAdapter/orchestration path (k8)`
  - Fixtures: `FakePanel`, `a fake DocsReviewClient recording calls + scripted results`
- **unit** — Docs-review shell preserves the S003 security shell + sc1 vocabulary (ac3).
  - Subjects: `renderShell() = exactly one <script nonce=...> under strict CSP; no innerHTML/remote/asWebviewUri`, `list/body/controls via textContent + className only, sc1 'docs-review' surface class`
  - Fixtures: `createDocsReviewHost + FakePanel + injected genNonce`
- **integration** — Command + wiring contributed (extension-chat-wiring.test.ts extension).
  - Subjects: `package.json contributes insrc.chat.docsReview`, `extension.ts registers it inside the insrc.chat.enabled gate + constructs createDocsReviewHost with a DocsReviewClient over the shared client`, `docs-review-client.ts + docs-review-panel.ts import nothing from 'vscode'`
  - Fixtures: `package.json + extension.ts source-scan`

### Acceptance mapping

| Criterion | Proving tests |
| :--- | :--- |
| `ac1` | `unit(client): pending() maps PendingArtifact -> DocsArtifactSummary (workflow.pending)`, `integration(host): open() posts docs-list from pending() (+ empty-state + { error } notice)` |
| `ac2` | `unit(client): approve(mdPath) -> rpc('workflow.approve',{artifactPath}); comment(id,note) -> rpc('workflow.resolveComment')`, `integration(host): docs-decision accept -> approve (+ skipped surfaced); reject-with-note -> comment + stays pending; open-doc reads the body` |
| `ac3` | `unit(shell): one nonce'd script + strict CSP + textContent/className + sc1 docs-review surface class; no innerHTML/remote/asWebviewUri`, `integration(wiring): the pane acts only via the daemon workflow.* IPCs (fake client records only those) — no ad-hoc file path` |

## Migration

**State before:** Per s1: the daemon already exposes workflow.pending/artifactContent/resolveComment/approve (built for the JetBrains panel) but the VS Code plugin has NO client or surface: no DocsReviewClient, no docs-review webview, no command. sc3 declares docs-list + docs-decision + DocsArtifactSummary but they are unused; chat-panel.ts drops docs-decision in its reserved default case. sc3 has no body channel or read intent. Behind flag insrc.chat.enabled.

**State after:** A new vscode-free DocsReviewClient over the shared IpcClient wraps the four IPCs (normalizing { error }); a new vscode-free createDocsReviewHost renders the sc1 docs-review webview (list + body + accept/reject/comment), re-fetching after each decision. sc3 gains two additive optional messages (open-doc, docs-content). package.json contributes insrc.chat.docsReview; extension.ts registers it inside the insrc.chat.enabled gate. No daemon change; no new Epic contract; nothing persisted (k3).

**Zero downtime:** yes — **Data rewrite:** no

### Steps

1. Add the two additive optional sc3 messages to protocol.ts: HostToWebview docs-content { artifactId, markdown, openQuestions, blocked } + WebviewToHost open-doc { artifactId } (+ their type-name arrays). — ↩ rollbackable
2. Add docs-review-client.ts (createDocsReviewClient + types) over the shared IpcClient; nothing wired yet. — ↩ rollbackable
3. Add docs-review-panel.ts (createDocsReviewHost) over the injected ChatPanelChannel seam + DocsReviewClient; renders the sc1 docs-review shell; not wired yet. — ↩ rollbackable
4. Add the insrc.chat.docsReview command to package.json contributes.commands. — ↩ rollbackable
5. Wire extension.ts inside the insrc.chat.enabled gate: construct the client + host with the real createWebviewPanel seam + register the command. — ↩ rollbackable
6. Add docs-review-client.test.ts + docs-review-panel.test.ts + extension-chat-wiring.test.ts assertions; run the full sweep + tsc --noEmit. — ↩ rollbackable

**Backward compat:** No public/shared-contract API removed or reshaped. sc3 gains only ADDITIVE optional union members (open-doc, docs-content) — non-breaking (existing switches ignore unknown types; the chat panel is unaffected). docs-list/docs-decision unchanged. No daemon change (the four IPCs already exist). No new persisted state (k3). The docs-review surface is a NEW command gated behind insrc.chat.enabled; prior stories untouched.

## Alternatives considered

### a1: Terminal-styled docs-review webview; body rendered in-webview via additive sc3 messages — **CHOSEN**

A dedicated terminal-styled docs-review webview: list + read the artifact body IN the pane + accept/reject, over the existing daemon IPCs, adding two additive optional sc3 messages (open-doc, docs-content).

createDocsReviewHost (mirrors createChatPanelHost) renders the sc1 docs-review surface; pending()->docs-list; open-doc->content->docs-content (rendered as terminal text); docs-decision accept->approve, reject->comment (+re-fetch). Two new sc3 messages additive+optional (S006/S008 pattern). DocsReviewClient is a vscode-free factory over IpcClient; extension.ts wires it + insrc.chat.docsReview behind insrc.chat.enabled.

### a2: Terminal-styled list + accept/reject in-webview; artifact BODY in a native editor

The webview renders the list + accept/reject (docs-list + docs-decision only); reading opens the .md in a native editor — no new sc3 message.

Same client + host, but the pane shows only the list + controls; open the mdPath in a native read-only editor (S006 editor-seam pattern). No open-doc/docs-content; sc3 untouched.

**Rejected because:** Fully meets ac1/ac2 and needs no sc3 change, but only PARTIAL on ac3/k6 (native-editor body, not the terminal-styled single-panel mirror). A solid lighter fallback.

### a3: No webview: QuickPick list + native editor + approve command

A QuickPick lists pending artifacts, selection opens the .md, a command approves; no sc1 surface, no sc3.

extension.ts registers a command that fetches pending() + shows a QuickPick; picking opens the mdPath + offers Approve/Comment via a follow-up pick calling approve()/comment(). No webview/sc1/sc3.

**Rejected because:** Cheapest but violates ac3/k6/sc1: no terminal-styled webview + not a JetBrains-panel mirror. Cannot satisfy the story as written.

## Citations

- **[[c1]]** `analyze-bundle` `s1: daemon IPC surface — workflow.pending (list), workflow.artifactContent (body+openQuestions+blocked), workflow.resolveComment (annotate), workflow.approve (approvedAt, block gate, skipped[]); no workflow.reject; daemon-tracked .insrc/artifacts only (k5)` — "S007 consumes the four existing workflow.* IPCs; accept=approve, reject=resolveComment+stay-pending"
- **[[c2]]** `analyze-bundle` `s1: plugin IpcClient.rpc seam (src/shared/ipc-client.ts) + the createDaemonConfigGateway factory-over-client idiom; no cloud REST (k2); vscode-free + fake-IpcClient testable` — "DocsReviewClient is a vscode-free factory over IpcClient.rpc, mirroring createDaemonConfigGateway"
- **[[c3]]** `analyze-bundle` `s1: sc3 protocol.ts docs-list/docs-decision + DocsArtifactSummary; the one nonce'd CSP webview shell (textContent/className only); design-tokens.ts docs-review SurfaceKind + surfaceClass` — "render the docs-review surface with sc1 tokens under the one nonce'd CSP script; sc3 gains additive docs-content/open-doc"

<!-- insrc:review -->

## Review

### ✅ Review `PASS` — design.story (design.story)

**0 HIGH · 0 MED · 8 LOW** · model `client` · reviewed 2026-09-26T07:06:56.345Z

| Ref | Kind | Severity | Fixability | Premise | Evidence | Action |
| --- | --- | --- | --- | --- | --- | --- |
| daemon-ipc/inventory | inventory | LOW | auto | The daemon registers exactly the four review IPCs S007 consumes — workflow.pending, workflow.artifactContent, workflow.resolveComment, workflow.approve — and there is NO workflow.reject handler. | src/daemon/index.ts registers workflow.approve (:610), workflow.pending (:634), workflow.artifactContent (:646), workflow.resolveComment (:660) and workflow.run.start/poll/abort/run — there is NO workflow.reject handler (a direct grep of index.ts over the workflow.* keys returns exactly these). The 'no reject IPC -> reject = resolveComment + stay-pending' premise is sound. | none — verified sound |
| daemon-ipc/pending | citation | LOW | auto | workflow.pending is registered in src/daemon/index.ts and delegates to handleWorkflowPending. | src/daemon/index.ts:634 registers 'workflow.pending' and delegates to handleWorkflowPending (import from ../workflow/pending.js), confirmed by direct read this session. | none — verified sound |
| data-model/PendingArtifact | semantic | LOW | auto | The daemon PendingArtifact carries artifactId, kind, title, mdPath, openQuestionCount, state — the fields S007 maps to DocsArtifactSummary and uses for open-doc/approve (mdPath). | src/workflow/pending.ts declares interface PendingArtifact with artifactId/kind/title/mdPath/openQuestionCount/state (read this session); the JetBrains DaemonGateway.kt mirror (openQuestionCount at :37) corroborates the same shape. The PendingArtifact -> DocsArtifactSummary mapping + mdPath retention are sound. | none — verified sound |
| data-model/WorkflowApproveResult | semantic | LOW | auto | WorkflowApproveResult has approved[], skipped[], and codeReview[] (so a review-blocked artifact is surfaced via skipped[], not an error). | src/workflow/gates.ts:584 interface WorkflowApproveResult has readonly approved[], readonly skipped[], readonly codeReview[] (read this session). A review-blocked artifact surfaces via skipped[] (non-lossy), not an error — exactly as the LLD relies on. | none — verified sound |
| client-seam/ipc | citation | LOW | auto | The plugin's shared IPC client exposes rpc<T>(method, params) (src/shared/ipc-client.ts), the seam createDaemonConfigGateway consumes and S007's DocsReviewClient reuses. | vscode-plugin/src/config/gateway.ts imports IpcClient from ../../../src/shared/ipc-client.js and createDaemonConfigGateway(client) calls client.rpc<T>('config.catalog'\|'config.write') (read this session). The DocsReviewClient reusing client.rpc<T> over the same seam is sound. | none — verified sound |
| sc3/docs | citation | LOW | auto | sc3 (protocol.ts) already declares HostToWebview docs-list, WebviewToHost docs-decision, and DocsArtifactSummary { id, kind, title, status }; S007 adds only additive docs-content/open-doc. | vscode-plugin/src/chat/protocol.ts:25 interface DocsArtifactSummary { id, kind, title, status }; :38 docs-list (HostToWebview); :48 docs-decision (WebviewToHost). chat-panel.ts:405 the reserved docs-decision default-case comment. All present; S007 adds only additive docs-content/open-doc. | none — verified sound |
| sc1/docs-review-surface | citation | LOW | auto | The sc1 SurfaceKind union includes 'docs-review' and surfaceClass maps it to a stable class; S007 renders under it without modifying design-tokens.ts. | vscode-plugin/src/chat/design-tokens.ts:29 SurfaceKind union includes 'docs-review' and TERMINAL_SURFACE_CLASS/surfaceClass map every SurfaceKind (confirmed in the S006 review, where surfaceClass('inline-diff') resolved from the same table). S007 renders under the existing 'docs-review' class without modifying design-tokens.ts. | none — verified sound |
| host-seam/ChatPanelChannel | citation | LOW | auto | createDocsReviewHost reuses the S003 ChatPanelChannel seam (setHtml/postMessage/onMessage/onDidDispose/reveal/dispose) so the host stays vscode-free + FakePanel-testable. | vscode-plugin/src/chat/chat-panel.ts:29 export interface ChatPanelChannel { setHtml/postMessage/onMessage/onDidDispose/reveal/dispose } (read this session). createDocsReviewHost reusing this seam keeps the host vscode-free + FakePanel-testable, as the LLD states. | none — verified sound |
