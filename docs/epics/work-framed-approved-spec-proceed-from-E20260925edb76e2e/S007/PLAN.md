<!-- insrc:artifact PLAN-edb76e2e4d41217d-s7 -->

# Plan: E20260926edb76e2e:S007

**Epic:** `work-framed-approved-spec-proceed-from`
**LLD run:** `wf-1790405792957-sachfw`
**LLD effective hash:** `e2745c4bac48...`

## Tasks

| # | Task | Size | Depends on | Tests | Derived from |
| :--- | :--- | :--- | :--- | :--- | :--- |
| 1 | **`t1`** Add the additive sc3 docs-content + open-doc messages | S | — | unit: docs-review-panel shell: renderShell has exactly one <script nonce=...> under strict CSP (the docs-content message the shell handles rides sc3) | [[c3]] |
| 2 | **`t2`** New docs-review-client.ts (DocsReviewClient over the shared IpcClient) | M | — | unit: docs-review-client: pending() maps PendingArtifact->DocsArtifactSummary + retains id->mdPath; { error } throws; { artifacts:[] } -> []; unit: docs-review-client: content(mdPath) returns { markdown, openQuestions, blocked }; { error } throws; unit: docs-review-client: approve(mdPath) -> rpc('workflow.approve',{artifactPath:mdPath}) returns WorkflowApproveResult verbatim; comment(id,note) -> rpc('workflow.resolveComment'); only client.rpc used | [[c1]] |
| 3 | **`t3`** New docs-review-panel.ts (createDocsReviewHost + sc1 docs-review shell) | M | `t1`, `t2` | integration: docs-review-panel: open() posts docs-list from pending() (ac1); empty -> empty-state; { error } -> notice; integration: docs-review-panel: open-doc -> content(mdPath) -> posts docs-content; unknown id ignored; empty mdPath -> 'content unavailable' without content(''); integration: docs-review-panel: docs-decision accept -> approve(mdPath) (+ skipped surfaced + re-fetch); reject-with-note -> comment + stays pending; empty note is a no-op; no chat/orchestration path (k8); unit: docs-review-panel shell: one nonce'd script + strict CSP + textContent/className only + sc1 docs-review surface class; no innerHTML/remote/asWebviewUri | [[c3]] [[c1]] |
| 4 | **`t4`** Contribute the insrc.chat.docsReview command in package.json | S | — | integration: extension-chat-wiring: package.json contributes insrc.chat.docsReview (+ any EXACT-set manifest count updated) | [[c2]] |
| 5 | **`t5`** Wire extension.ts: construct the client + host + register the command | M | `t2`, `t3`, `t4` | integration: extension-chat-wiring: extension.ts registers insrc.chat.docsReview inside the chatEnabled gate + constructs createDocsReviewHost with a DocsReviewClient over the shared client | [[c1]] [[c2]] |
| 6 | **`t6`** Tests: client unit + host integration + wiring + full sweep | M | `t1`, `t2`, `t3`, `t4`, `t5` | integration: docs-review-client.ts + docs-review-panel.ts import nothing from 'vscode' (source-scan); smoke: full vscode-plugin sweep green under tsx --test + tsc --noEmit clean; ac1-ac3 all have a passing proving test | [[c1]] [[c2]] [[c3]] |

### E20260926edb76e2e:S007:T001 — Add the additive sc3 docs-content + open-doc messages

In vscode-plugin/src/chat/protocol.ts add the two additive optional union members: HostToWebview `{ type:'docs-content'; artifactId; markdown; openQuestions: string[]; blocked: boolean }` + WebviewToHost `{ type:'open-doc'; artifactId }`, plus their entries in the HOST_TO_WEBVIEW_TYPES / WEBVIEW_TO_HOST_TYPES arrays. Additive; existing consumers ignore unknown types.

**Acceptance checks:**
- protocol.ts declares docs-content (HostToWebview) + open-doc (WebviewToHost) with the stated fields; the *_TYPES arrays include them
- docs-list/docs-decision + all existing message shapes are unchanged (additive only)

### E20260926edb76e2e:S007:T002 — New docs-review-client.ts (DocsReviewClient over the shared IpcClient)

Add vscode-plugin/src/chat/docs-review-client.ts: createDocsReviewClient(client) + DocsReviewClient (pending/content/approve/comment) + DocsContent type, wrapping workflow.pending/artifactContent/approve/resolveComment. pending() maps PendingArtifact -> DocsArtifactSummary + retains id->mdPath; every { error } arm throws. Pure/vscode-free (mirrors createDaemonConfigGateway).

**Acceptance checks:**
- exports createDocsReviewClient + DocsReviewClient/DocsContent; imports no vscode
- pending() maps PendingArtifact->DocsArtifactSummary (+ id->mdPath); { error } throws; { artifacts:[] } -> []
- content/approve/comment call the right rpc method with the right params; { error } throws

### E20260926edb76e2e:S007:T003 — New docs-review-panel.ts (createDocsReviewHost + sc1 docs-review shell)

Add vscode-plugin/src/chat/docs-review-panel.ts: createDocsReviewHost(deps) over the injected ChatPanelChannel seam + DocsReviewClient. Renders the sc1 'docs-review' shell (one nonce'd CSP script, textContent/className only) with the pending list + body view + accept/reject/comment controls; open() posts docs-list from pending(); handleMessage fills open-doc (->content->docs-content) + docs-decision (accept->approve + re-fetch + surface skipped[]; !accept->comment, keep pending); holds id->mdPath in memory.

**Acceptance checks:**
- createDocsReviewHost renders one nonce'd CSP script (sc1 docs-review surface); textContent/className only, no innerHTML/remote/asWebviewUri; imports no vscode
- open() posts docs-list from client.pending(); open-doc -> client.content -> docs-content; empty/{error} handled as inline notices
- docs-decision accept -> client.approve(mdPath) (+ re-fetch, skipped[] surfaced); reject-with-note -> client.comment; empty note is a no-op

### E20260926edb76e2e:S007:T004 — Contribute the insrc.chat.docsReview command in package.json

Add { command: 'insrc.chat.docsReview', title: 'Review pending documents', category: 'insrc' } to vscode-plugin/package.json contributes.commands (mirrors insrc.chat.open). Update the EXACT-set manifest tests (packaging cmd list / truthful-sync count) if they trip (S003 precedent).

**Acceptance checks:**
- package.json contributes.commands has insrc.chat.docsReview
- any EXACT-set manifest test (command list / count) is updated to stay green

### E20260926edb76e2e:S007:T005 — Wire extension.ts: construct the client + host + register the command

In extension.ts, inside the insrc.chat.enabled gate, construct createDocsReviewClient over the shared IpcClient (the one already used for the config gateway) + createDocsReviewHost with the real createWebviewPanel seam, and register insrc.chat.docsReview to open it (mirroring insrc.chat.open).

**Acceptance checks:**
- extension.ts constructs createDocsReviewClient(sharedClient) + createDocsReviewHost with the real createWebviewPanel seam
- insrc.chat.docsReview is registered inside the chatEnabled gate; no direct cloud REST (k2)

### E20260926edb76e2e:S007:T006 — Tests: client unit + host integration + wiring + full sweep

Add docs-review-client.test.ts + docs-review-panel.test.ts (FakePanel + fake IpcClient/DocsReviewClient) + extend extension-chat-wiring.test.ts; each of ac1-ac3 gets a passing proving test. Run the full sweep + tsc --noEmit.

**Acceptance checks:**
- ac1, ac2, ac3 each have >=1 passing proving test
- docs-review-client.test.ts + docs-review-panel.test.ts + the extended wiring suite pass under tsx --test; tsc --noEmit clean
- the docs-review shell CSP/one-script/no-innerHTML invariants are asserted

## Test-strategy coverage

| LLD strategy item | Covered by |
| :--- | :--- |
| pending() maps PendingArtifact -> DocsArtifactSummary + retains id->mdPath | `t2` |
| pending() throws on { error }; { artifacts:[] } -> [] | `t2` |
| content(mdPath) returns { markdown, openQuestions, blocked }; { error } -> throws | `t2` |
| approve(mdPath) calls rpc('workflow.approve',{artifactPath:mdPath}) + returns WorkflowApproveResult verbatim | `t2` |
| comment(id,note) calls rpc('workflow.resolveComment'); only client.rpc used (no cloud path) | `t2` |
| open() posts docs-list from pending() (ac1); empty -> empty-state; { error } -> notice | `t3` |
| open-doc -> content(mdPath) -> posts docs-content; unknown id ignored; empty mdPath -> 'content unavailable' without content('') | `t3` |
| docs-decision accept -> approve(mdPath); skipped[] block reason surfaced + artifact stays; success -> re-fetch pending() | `t3` |
| docs-decision reject with a note -> comment(id,note) + stays pending; empty note is a no-op | `t3` |
| the host invokes no chat/StreamAdapter/orchestration path (k8) | `t3` |
| renderShell() = exactly one <script nonce=...> under strict CSP; no innerHTML/remote/asWebviewUri | `t3` |
| list/body/controls via textContent + className only, sc1 'docs-review' surface class | `t3` |
| package.json contributes insrc.chat.docsReview | `t4` |
| extension.ts registers it inside the insrc.chat.enabled gate + constructs createDocsReviewHost with a DocsReviewClient over the shared client | `t5` |
| docs-review-client.ts + docs-review-panel.ts import nothing from 'vscode' | `t6` |

## Citations

- **[[c1]]** `prior-artifact` `LLD s7 contractDetails: DocsReviewClient (pending/content/approve/comment) over the shared IpcClient wrapping the existing workflow.pending/artifactContent/approve/resolveComment daemon IPCs; createDocsReviewHost turn/message handling`
- **[[c2]]** `prior-artifact` `LLD s7 dataModelChanges: insrc.chat.docsReview command (package.json) + extension.ts wiring behind insrc.chat.enabled`
- **[[c3]]** `prior-artifact` `LLD s7 interactionWithShared/contractDetails: additive sc3 docs-content/open-doc + the sc1 docs-review terminal webview shell (one nonce'd CSP script, textContent/className)`
