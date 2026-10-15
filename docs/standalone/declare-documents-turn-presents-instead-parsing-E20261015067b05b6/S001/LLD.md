<!-- insrc:artifact LLD-067b05b6892cb212-s1 -->

# LLD: E20261015067b05b6:S001

## Summary

**Epic:** `declare-documents-turn-presents-instead-parsing`
**HLD base run:** `wf-1792058614869-taragn`
**HLD effective hash:** `067b05b6892c...`

A turn now says which documents to show for review by calling a new insrc_present tool with their ids, and the chat opens exactly those in the review pane. The chat reads the declaration from the tool call's own small input, not from any tool result, so a large result that the CLI shortens can no longer make a review document fail to open. Both providers are covered: the Claude tool_use input and the Codex mcp_tool_call arguments, whose shape was captured from a real Codex run and is pinned as a fixture. The old reading of tool output and the end-of-turn guess are removed, a name that is not pending is reported in the chat and to the controller, and the steering tells the controller to declare what it presents.

## Contents

1. [HLD context](#1-hld-context)
2. [Contract details](#2-contract-details)
3. [Data model changes](#3-data-model-changes)
4. [Error paths](#4-error-paths)
5. [Test strategy](#5-test-strategy)
6. [Migration](#6-migration)
7. [Alternatives considered](#7-alternatives-considered)
8. [References](#8-references)
9. [Open questions](#9-open-questions)

## 1. HLD context

**Framework:** Standalone feature — no parent HLD. Design directly against the repo, grounded on the s1 analyze passes. There are no HLD shared contracts to honour.
**Rollout phase:** standalone

## 2. Contract details

**Surface level:** internal-shared

### 2.1 `createReviewPresenter`

```typescript
function createReviewPresenter(deps: ReviewPresenterDeps): ReviewPresenter  // PresentedTurn changes from { toolResult(output: string): void; end(): void } to { declared(documents: readonly string[]): Promise<DeclaredOutcome>; end(): void }, with DeclaredOutcome = { opened: string[]; notPending: string[]; unreadable: boolean }
```

**Parameters:**
- `deps: ReviewPresenterDeps` — the pending-list lookup, the review pane's open call and the logger (no callback is added: the outcome comes back from declared)
- `documents: readonly string[]` — the artifact ids or document paths a turn declared, read from the turn's insrc_present tool call

**Returns:** `ReviewPresenter` — a presenter whose turn handle opens, once per turn and in order, the pending document each declared name resolves to, and answers a DeclaredOutcome naming what opened, which names were not pending and whether the pending list could not be read; the chat host turns that outcome into a line in the chat. It opens nothing the turn did not declare

**Errors:**
- `swallowed` when a pending list that cannot be read, or a failing open, is logged and shown through the outcome (unreadable, or a name left out of opened); nothing is thrown to the chat host

**Preconditions:**
- the declaration comes from a tool-call event of the insrc_present tool

**Postconditions:**
- no tool-result text is read
- no document is opened at the end of a turn that the turn did not declare
- a document is opened at most once in a turn
- the chat host, not extension.ts, shows a line for a not-pending name or an unreadable pending list, through the chat's existing information-line output

### 2.2 `presentedPathOf`

```typescript
function presentedPathOf(output: string): string | undefined  // removed
```

**Parameters:**
- `output: string` — a tool result's text; the function is removed with the output-parsing path

**Returns:** `undefined` — removed: nothing parses a tool result for a document path any more

**Errors:**
- `removed` when any caller of presentedPathOf fails to compile, which is how the build finds every remaining use

**Preconditions:**
- no caller remains

**Postconditions:**
- the 'pendingApproval' text is no longer searched for in a tool result by the chat

### 2.3 `tool-call`

```typescript
{ kind: 'tool-call'; turnId: string; tool: string; mcp?: { server: string; name: string }; command?: string; callId?: string; present?: readonly string[] | undefined }
```

**Parameters:**
- `present: readonly string[] | undefined` _(optional)_ — the documents the call declares, set only for the insrc_present tool, from its input's documents list

**Returns:** `TurnEvent` — the existing tool-call event, with the declared documents when the call is insrc_present; every other tool-call event is as it was. The Claude mapper reads the tool_use input. The Codex mapper reads an item of type mcp_tool_call on item.completed only, when its tool is exactly insrc_present, and takes the documents from its arguments object (the shape captured from codex-cli 0.162.1: id, server, tool as a bare name, arguments as a JSON object, result, error, status). The same call also arrives on item.started with the same arguments; it is ignored there, so a call declares once. A call whose completed item reports status failed still declares, because its arguments are present

**Errors:**
- `swallowed` when an input that is not an array of strings leaves present absent; the call is still shown as a tool row

**Preconditions:**
- the provider reported the tool call's input

**Postconditions:**
- present is live-only and is never saved in the transcript
- present holds at most 20 non-empty strings
- a Codex insrc_present call produces one present declaration, not two

### 2.4 `insrc_present`

```typescript
insrc_present(input: { documents: string[]; repo?: string | undefined }): { presented: string[]; notPending: string[] }  // new MCP tool
```

**Parameters:**
- `documents: string[]` — one to twenty artifact ids (for example LLD-<hash>-S001) or repo-relative document paths the controller asks the user to review
- `repo: string` _(optional)_ — the repository whose pending list is checked; resolved as insrc_workflow_approve does (the explicit repo, INSRC_REPO, or the repository registered for the working directory)

**Returns:** `{ presented: string[]; notPending: string[] }` — the names that are pending approval and presentable (they have a document file) and the names that are not, so the controller can see a mistake at once. The tool's answer is for the controller; the chat opens independently of it, from the declaration alone

**Errors:**
- `invalid-input` when documents is empty, holds more than twenty names, or holds a non-string; the tool answers an error and the chat opens nothing
- `repo-required` when no repo resolves (not explicit, not INSRC_REPO, and the working directory is in no registered repository), so the pending list cannot be read; the tool answers an error and the chat opens nothing

**Preconditions:**
- the daemon's pending list can be read through the workflow.pending IPC, which the tool's MCP-side handler calls with the resolved repo

**Postconditions:**
- the result is a few short strings, never a document body
- the tool changes no artifact and approves nothing
- a pending record with no document file (an empty mdPath) is reported under notPending, as the chat's lookup also drops it, so the two answers agree
- the chat opens a declared name whether or not the tool succeeded: only the mapper's input check gates the declaration, and the chat resolves each name through its own pending list, so a tool-side failure never hides a document that is pending in the workspace; the real Codex capture shows a failed call (approval policy never) still carrying its arguments

## 3. Data model changes

### 3.1 `TurnEvent (tool-call)` — field-add

The tool-call turn event gains an optional present list, set by the provider mappers from the input of the insrc_present MCP tool only. It is live-only and is not written to the transcript, so stored rows and old sessions are unchanged. The review presenter's turn handle changes from reading tool results and the end of the turn to receiving a declared list; the chat host feeds it from the tool-call event. The MCP server registers the new insrc_present tool, its input schema is added to the schema registry, and the steering block, the steering template and the guide's approval text are rewritten to tell the controller to call it. Codex: a real capture (codex-cli 0.162.1, pinned as vscode-plugin/src/chat/__tests__/fixtures/codex-mcp-tool-call.jsonl) shows an MCP call as an item of type mcp_tool_call with server, tool (a bare name, not server-qualified), arguments (a JSON object) and status, emitted on item.started and again on item.completed. The Codex mapper in cli-adapter.ts, which today handles only command_execution and tool_call items on item.completed, gains a branch for mcp_tool_call on item.completed only, matches tool equal to insrc_present, reads arguments.documents as an array of strings (no JSON-string form is accepted, since none was observed) and sets present; started items are ignored so the call declares once, and a failed completed item still declares. It also sets the event's mcp field from server and tool, which that mapper never set before. Registering insrc_present also changes the schema registry's expected tool list and the steering skeleton's tool catalog, which schema-registry.test.ts pins, so that list and the catalog row are updated in the same commit; the CLAUDE.md copies of the steering block are refreshed by repo.add and are not edited by hand. The MCP tool surface is pinned by a golden fixture: forward-step.test.ts asserts the tool list against tool-surface.golden.json, so insrc_present is inserted into the fixture in name-sorted position, between insrc_guide and insrc_review_step, because forward-step.test.ts compares the sorted live surface to the golden list index by index, the count rises to thirteen (the 'twelve tools' test title and the length check of 12 in forward-step.test.ts are updated), and schema-registry.test.ts's EXPECTED_TOOLS and PHASELESS_TOOLS are updated. The MCP-side handler needs a new unary workflow.pending wrapper in daemon-stream.ts (none exists), and the chat's pending lookup in docs-review-client.ts is reused as it is: it already drops records with no document file. The chat host passes a declaration from both of its feed paths, the followed live turn and the hosted run. The existing presenter and chat-panel tests that pin toolResult and the end-of-turn open are rewritten to the declared contract, and steering-template.md only points at the steering block, so the approval text changes in steering-block.md and the guide.

**Call sites:**
- `vscode-plugin/src/chat/review-presenter.ts`
- `vscode-plugin/src/chat/chat-panel.ts`
- `vscode-plugin/src/chat/stream-events.ts`
- `vscode-plugin/src/chat/cli-adapter.ts`
- `vscode-plugin/src/extension.ts`
- `src/mcp/server.ts`
- `src/mcp/schema`
- `src/prompts/steering-block.md`
- `src/mcp/__tests__/schema-registry.test.ts`
- `src/mcp/__tests__/forward-step.test.ts`
- `src/mcp/__tests__/fixtures/tool-surface.golden.json`
- `src/mcp/daemon-stream.ts`
- `vscode-plugin/src/chat/docs-review-client.ts`
- `vscode-plugin/src/chat/__tests__/fixtures/codex-mcp-tool-call.jsonl`

## 4. Error paths

**Error cases**

- **The controller does not call insrc_present when it asks for approval** (recoverable)
  - Detection: Nothing in the turn's events is a tool-call of insrc_present, so the presenter receives no declaration
  - Response: Nothing opens; the controller's own text still asks for the decision and gives the document's path
  - User impact: The user has to open the document by hand, as the steering and the controller's message say how
- **A declared name is not pending (misspelt, already approved, or not yet written)** (recoverable)
  - Detection: The presenter looks the name up in the pending list and finds no artifact id or path that matches
  - Response: Nothing is opened for that name and the chat shows one line naming it; the insrc_present result also lists it under notPending so the controller can correct it
  - User impact: The user sees which document was not shown and why, not a silent miss
- **The pending list cannot be read when a declaration arrives** (recoverable)
  - Detection: The presenter's read of the pending list rejects or answers an error; declared() answers unreadable: true in its outcome
  - Response: It is logged, nothing opens for that declaration, and the chat host shows a line saying the documents could not be opened
  - User impact: The user is told and can open the documents by hand
- **The tool call's input is not an array of strings or is over the limit** (recoverable)
  - Detection: The provider mapper checks the input's documents list: an array of at most twenty non-empty strings
  - Response: present is left absent and the tool call still shows as a tool row; the tool itself answers an invalid-input error to the controller. A call whose tool-side work fails for another reason (no repo resolves, or Codex refusing the call for approval policy) still carries a valid declaration, and the chat still opens what is pending
  - User impact: Nothing opens for a malformed call, and the controller is told its call was malformed
- **The review pane's open call fails** (recoverable)
  - Detection: The open callback throws
  - Response: The error is logged and the presenter goes on with the next declared name; that name is not retried in the turn
  - User impact: One document may not open; the others do
- **A pending record has no document file (an empty mdPath), as some BUILD records do before their markdown exists** (recoverable)
  - Detection: The pending list entry has an empty mdPath; both the tool's check and the chat's lookup drop such entries
  - Response: The name is reported as not pending by the tool and by the chat, never as presented
  - User impact: The controller and the user are told it cannot be shown, and the controller can give the path in its message
- **A Codex version reports an MCP call in a different shape than the captured one (a different item type, server-qualified tool name, or arguments as a string)** (recoverable)
  - Detection: The Codex mapper matches only an mcp_tool_call item whose tool is exactly insrc_present with an arguments object; any other shape yields no present value
  - Response: The call shows as an ordinary tool row and nothing is declared; the pinned fixture test fails when the pinned shape itself is changed in the repo, and a newer Codex shape would need a new capture and fixture
  - User impact: A Codex turn on a changed CLI opens nothing until the mapper is updated; the controller's message still gives the document path

**Edge cases**

| Input | Expected |
| :--- | :--- |
| the same document declared twice in one turn, or in two insrc_present calls | It is opened once for the turn |
| a Codex insrc_present call, which arrives on item.started and again on item.completed with the same arguments | Only the completed item declares, so the call declares once |
| a Codex insrc_present call whose completed item has status failed and an error message | It still declares, because the arguments are present, and the chat opens what is pending |
| several documents declared in one call | Each opens in the order given, in the same quiet way as one |
| a declaration made after the document is already open in the pane | The pane shows it again as it does for a re-open, without a second tab |
| a name given as a repo-relative path or as an artifact id | Both resolve to the same pending document; an id is matched without regard to the case of its story part (the daemon lists LLD-<hash>-s5 for some records and -S001 for others) |
| a name that matches one of the hundreds of old pending records | It opens only if it was declared; nothing is opened because it is pending |
| a result carrying a pendingApproval block that nothing declared | Nothing opens, because the chat no longer reads tool results; the controller is told by its steering to declare |
| a turn that ends with no declaration | Nothing opens at the end of the turn |

**Invariants to preserve**

- A presented pane still opens quietly in the editor group the review pane uses, once per document per turn, and a failure in the presenter is logged and never thrown into the chat host [[c1]]
- The chat host still begins a presented turn once per turn and ends it with the turn, and tool results are still rendered as rows; only what the presenter does with them changes [[c2]]
- Stored transcript rows and old sessions are unchanged: the declared list is live-only and is never saved; Codex command_execution and tool_call items map exactly as before [[c3]]

## 5. Test strategy

**Test framework:** `node:test run through tsx (npx tsx --test), as the existing chat and MCP tests`

**Test levels**

- **unit** — The presenter opens exactly the declared documents, and the provider mappers read the declaration from the tool call's input
  - Subjects: `a declared artifact id and a declared path each open the matching pending document once, in order`, `a declared name that is not pending opens nothing and is reported by name`, `a turn with no declaration opens nothing at its end, and a tool result carrying a pendingApproval block opens nothing`, `the same document declared twice in a turn opens once`, `an unreadable pending list and a failing open are logged and never thrown`, `the Claude mapper sets present on an insrc_present tool call from its input and leaves it off every other tool call`, `an input that is not a list of at most twenty non-empty strings leaves present absent`, `the declared list is not written into the saved transcript`, `the pinned real Codex capture maps to exactly one tool-call event with present set to the declared documents, from the completed mcp_tool_call item and not the started one`, `a Codex mcp_tool_call insrc_present item with status failed still sets present`, `a Codex mcp_tool_call for another tool, a server-qualified tool name, or string arguments sets no present, and command_execution and tool_call items map as before`, `declared answers an outcome naming what opened, which names were not pending, and whether the pending list was unreadable`, `a declared artifact id matches the pending list's id without regard to the case of its story part`
  - Fixtures: `a fake pending list and a recording open callback`, `a scripted Claude tool_use line for insrc_present`, `vscode-plugin/src/chat/__tests__/fixtures/codex-mcp-tool-call.jsonl, the real codex-cli 0.162.1 capture (its completed item reports failed, which the capture's approval policy produced)`
- **integration** — The tool, the chat host and the steering agree
  - Subjects: `insrc_present answers presented and notPending against the daemon's pending list and rejects an empty or oversized list`, `the chat host passes a tool-call's declared documents to the presenter and nothing else, and ends the turn without opening anything`, `the output-parsing path is gone: presentedPathOf and the end-of-turn guess no longer exist`, `the steering block, the steering template and the guide tell the controller to call insrc_present before it asks for approval`, `the chat host shows a line for a not-pending name and for an unreadable pending list from the presenter's outcome`, `the schema registry's expected tool list and the steering skeleton's tool catalog name insrc_present`, `the MCP tool surface golden fixture lists insrc_present and the tool count is thirteen`, `insrc_present with a resolver that finds no repo answers an error and presents nothing`, `a pending record with no document file is reported as not pending by the tool and by the chat`, `the chat host feeds the declaration from both a followed live turn and a hosted run`, `the chat opens a declared pending document even when the insrc_present tool call itself failed`
  - Fixtures: `the MCP server's tool registry test harness`, `the chat host with a recording presenter`, `the MCP resolve-repo dependencies injected with a resolver that returns nothing`
- **live** — What only a running VS Code and a running Codex show
  - Subjects: `a document the controller declares opens in the review pane even when the workflow result was large, and a name that is not pending is reported in the chat`, `a Codex chat turn that calls insrc_present opens the declared document in the review pane`

**Acceptance mapping**

| Criterion | Proving tests |
| :--- | :--- |
| `ac1` | `a declared artifact id and a declared path each open the matching pending document once, in order`, `the Claude mapper sets present on an insrc_present tool call from its input and leaves it off every other tool call`, `the chat host passes a tool-call's declared documents to the presenter and nothing else, and ends the turn without opening anything`, `a document the controller declares opens in the review pane even when the workflow result was large, and a name that is not pending is reported in the chat`, `the pinned real Codex capture maps to exactly one tool-call event with present set to the declared documents, from the completed mcp_tool_call item and not the started one`, `a Codex mcp_tool_call insrc_present item with status failed still sets present`, `a Codex mcp_tool_call for another tool, a server-qualified tool name, or string arguments sets no present, and command_execution and tool_call items map as before`, `a Codex chat turn that calls insrc_present opens the declared document in the review pane`, `a declared artifact id matches the pending list's id without regard to the case of its story part`, `the chat host feeds the declaration from both a followed live turn and a hosted run`, `the chat opens a declared pending document even when the insrc_present tool call itself failed` |
| `ac2` | `a turn with no declaration opens nothing at its end, and a tool result carrying a pendingApproval block opens nothing`, `the output-parsing path is gone: presentedPathOf and the end-of-turn guess no longer exist` |
| `ac3` | `a declared name that is not pending opens nothing and is reported by name`, `insrc_present answers presented and notPending against the daemon's pending list and rejects an empty or oversized list`, `an unreadable pending list and a failing open are logged and never thrown`, `an input that is not a list of at most twenty non-empty strings leaves present absent`, `declared answers an outcome naming what opened, which names were not pending, and whether the pending list was unreadable`, `the chat host shows a line for a not-pending name and for an unreadable pending list from the presenter's outcome`, `the MCP tool surface golden fixture lists insrc_present and the tool count is thirteen`, `insrc_present with a resolver that finds no repo answers an error and presents nothing`, `a pending record with no document file is reported as not pending by the tool and by the chat` |
| `ac4` | `the steering block, the steering template and the guide tell the controller to call insrc_present before it asks for approval`, `the same document declared twice in a turn opens once`, `the declared list is not written into the saved transcript`, `the schema registry's expected tool list and the steering skeleton's tool catalog name insrc_present` |

## 6. Migration

**State before:** The review presenter infers what to open: it JSON-parses each tool result for a top-level pendingApproval.artifactPath, and at the end of a turn it opens whatever became pending since the turn began. The Claude CLI replaces an oversized MCP result with a non-JSON preview, so a large workflow result opens nothing, and the end-of-turn guess depends on a pending list that holds hundreds of old records. The tool-call turn event carries no input, and the Codex mapper handles only command_execution and tool_call items, so a Codex mcp_tool_call item falls through unmapped (review-presenter.ts, chat-panel.ts, stream-events.ts and cli-adapter.ts, from the s1 bundles).

**State after:** The controller declares what it presents by calling a new insrc_present tool, whose input names the documents. Each provider mapper puts that list on the tool-call turn event (Claude from the tool_use input; Codex from the arguments object of a completed mcp_tool_call item, in the shape captured from codex-cli 0.162.1), the chat host hands it to the presenter, and the presenter opens exactly those pending documents once each, reporting any name that is not pending. The presenter no longer reads tool results or guesses at the end of a turn, and the steering text, the steering template and the guide tell the controller to declare before it asks for approval.

**Zero downtime:** yes — **Data rewrite:** no

**Steps**

1. Add the insrc_present MCP tool with its input schema and its answer of presented and notPending, validated against the daemon's pending list; it changes nothing and can ship before anything calls it, and update the schema registry's expected tool list in schema-registry.test.ts and the steering skeleton's tool catalog row, the golden tool-surface fixture and its count in forward-step.test.ts, and PHASELESS_TOOLS; the tool's handler runs MCP-side and reads the pending list through the workflow.pending IPC for the resolved repo, with a new workflow.pending wrapper in daemon-stream.ts for its handler — ↩ rollbackable
2. Extend the tool-call turn event with the optional present list and set it in the provider mappers from the insrc_present input only, live-only: the Claude mapper from the tool_use input, and the Codex mapper from the completed mcp_tool_call item's arguments object, with the real capture pinned as a fixture and tested — ↩ rollbackable
3. Change the presenter's turn handle to take a declared list and open exactly those pending documents once each, with a not-pending report that the chat shows as a line; feed it from the tool-call event in the chat host — ↩ rollbackable
4. Rewrite the steering block, the steering template and the guide's approval text to tell the controller to call insrc_present before it asks for approval, and to give the document's path in its message as well — ↩ rollbackable
5. Remove presentedPathOf, the reading of tool results and the end-of-turn guess, with the tests that pinned them, only after the steps above are in — ↩ rollbackable

**Backward compat:** The MCP tool is additive and the turn event field is optional, so an older plugin shows an insrc_present call as an ordinary tool row and keeps its old behaviour until it is updated, and an older daemon without the tool simply lacks it. The daemon (which serves the MCP tools) should be updated before the plugin that stops reading tool results, or the controller would have no tool to call. Stored transcript rows and old sessions are unaffected.

## 7. Alternatives considered

### 7.1 a1: A dedicated present tool whose input names the documents — **CHOSEN**

The controller calls insrc_present with the documents to open; the chat reads that call's small input from the turn event and opens exactly those.

Add one MCP tool, insrc_present, taking a list of artifact ids or document paths. The controller calls it whenever it asks the user to review or approve something. The tool validates the names against the daemon's pending list and returns a short result naming any that are not pending. The chat host reads the declaration from the turn's tool-call event, which is extended to carry the declared documents for this tool only (read by each provider mapper from the call's input: the Claude tool_use input, or the arguments object of a Codex mcp_tool_call item), resolves each name through the pending list and opens it quietly in the review pane. A name that does not resolve is shown in the chat as a line, not guessed at. The old parsing of tool output and the end-of-turn guess are removed, and the steering text and guide tell the controller to call insrc_present before asking for approval.

### 7.2 a2: A present field on every workflow and review tool

Each existing insrc tool takes an optional present list in its input, and the chat reads it from that call.

Add an optional present field (artifact ids or paths) to the inputs of insrc_workflow_step, insrc_build_step, insrc_review_step, insrc_code_review_step and the others that end in an approval. The chat reads the field from each tool-call event's input. The field is declared in each tool's schema and the steering says to set it on the call that produces a document for approval.

**Rejected because:** Also explicit, but it changes eight or more schemas, and the document does not exist yet when the declaring call is made, so the name cannot be validated then.

### 7.3 a3: The daemon records what each tool presents and the chat follows it

The tools register presented documents with the daemon, and the chat reads that record, with no controller declaration.

When a workflow, build or review tool writes a document for approval, the daemon records it as presented in a small ledger. The chat host reads the ledger for the turn through IPC and opens what it holds. The controller declares nothing.

**Rejected because:** It removes the controller's declaration, which is the point of the request: the chat would still infer what to open, now from a daemon ledger, and could open what was not meant to be shown.

## 8. References

- **[[c1]]** `analyze-bundle` `s1: The output-parsing presenter (review-presenter.ts, docs-review-client.ts)`
- **[[c2]]** `analyze-bundle` `s1: How the chat host feeds the presenter and where it is built (chat-panel.ts, extension.ts)`
- **[[c3]]** `analyze-bundle` `s1: What a turn event carries about a tool call, and the Codex and Claude mappers (stream-events.ts, cli-adapter.ts)`
- **[[c4]]** `code` `vscode-plugin/src/chat/__tests__/fixtures/codex-mcp-tool-call.jsonl` — "{"type":"item.completed","item":{"id":"item_1","type":"mcp_tool_call","server":"stub","tool":"insrc_present","arguments":{"documents":["LLD-abc-S001","docs/x.md"]}"

## 9. Open questions

- The contract names insrc_present and the present field as new; createReviewPresenter, presentedPathOf and the tool-call event are existing symbols.
- The invariants cite c1-c3, defined at synthesize as the s1 bundles.
- The Story has no acceptance criteria; ac1-ac4 were derived from its stated needs.
- The controller must call insrc_present for anything to open; the steering text is the only enforcement, and a missing call is visible as nothing opening.
- The Codex shape is verified against codex-cli 0.162.1 only; a newer Codex that changes the item type, the tool naming or the arguments shape would open nothing until the mapper and the pinned fixture are updated.

## Resolved questions

- `qd09e2042` — The contract names insrc_present and the present field as new; createReviewPresenter, presentedPathOf and the tool-call event are existing symbols.
  - **resolved**: Verify existing symbols first — User chose option 1. _(2026-10-15T10:27:56.470Z)_
- `q67ef84b9` — The invariants cite c1-c3, defined at synthesize as the s1 bundles.
  - **resolved**: Pin c1-c3 to concrete source refs in PLAN — User chose option 1. _(2026-10-15T10:30:44.457Z)_
- `q1daf4a0e` — The Story has no acceptance criteria; ac1-ac4 were derived from its stated needs.
  - **resolved**: Accept derived ac1-ac4 as-is — User chose option 1. _(2026-10-15T10:31:35.250Z)_
- `q89143172` — The controller must call insrc_present for anything to open; the steering text is the only enforcement, and a missing call is visible as nothing opening.
  - **resolved**: Accept steering-only enforcement — User: steering only is fine for now; the PLAN must carry a note that this may need to be revisited (e.g. a daemon-side reminder or missing-call detection) if steering-only proves unreliable. _(2026-10-15T10:33:02.190Z)_
- `q8bf7921c` — The Codex shape is verified against codex-cli 0.162.1 only; a newer Codex that changes the item type, the tool naming or the arguments shape would open nothing until the mapper and the pinned fixture are updated.
  - **resolved**: Accept the pin, document the limit — User chose option 1. _(2026-10-15T10:33:49.957Z)_

## Citations

- **[[c1]]** `analyze-bundle` `s1: The output-parsing presenter (review-presenter.ts, docs-review-client.ts)`
- **[[c2]]** `analyze-bundle` `s1: How the chat host feeds the presenter and where it is built (chat-panel.ts, extension.ts)`
- **[[c3]]** `analyze-bundle` `s1: What a turn event carries about a tool call, and the Codex and Claude mappers (stream-events.ts, cli-adapter.ts)`
- **[[c4]]** `code` `vscode-plugin/src/chat/__tests__/fixtures/codex-mcp-tool-call.jsonl` — "{"type":"item.completed","item":{"id":"item_1","type":"mcp_tool_call","server":"stub","tool":"insrc_present","arguments":{"documents":["LLD-abc-S001","docs/x.md"]}"
