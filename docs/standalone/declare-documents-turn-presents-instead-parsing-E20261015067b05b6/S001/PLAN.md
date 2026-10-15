<!-- insrc:artifact PLAN-067b05b6892cb212-s1 -->

# Plan: E20261015067b05b6:S001

## Summary

**Epic:** `declare-documents-turn-presents-instead-parsing`
**LLD run:** `wf-1792058614869-taragn`
**LLD effective hash:** `067b05b6892c...`

Building this Story adds one small MCP tool, insrc_present, and a live-only list of declared documents on the chat's tool-call event, read from each provider's own tool-call input (Claude's tool_use, Codex's mcp_tool_call with the shape captured and pinned from a real run). The presenter then opens exactly those pending documents and reports any that are not pending, the chat host feeds it from both paths and shows the outcome, the steering tells the controller to declare, and the old reading of tool output and the end-of-turn guess are removed last. Steering-only enforcement is accepted for now and the plan notes it should be revisited if it proves unreliable.

## Contents

1. [Tasks](#1-tasks)
2. [Test-strategy coverage](#2-test-strategy-coverage)
3. [References](#3-references)

## 1. Tasks

| # | Task | Size | Depends on | Tests | Derived from |
| :--- | :--- | :--- | :--- | :--- | :--- |
| 1 | **`t1`** Verify the existing symbols match the LLD | S | — | smoke: the existing symbols the LLD changes or removes match its before state (read and recorded, reported) | [[c1]] [[c4]] |
| 2 | **`t2`** Add the insrc_present MCP tool | M | `t1` | integration: insrc_present answers presented and notPending against the daemon's pending list and rejects an empty or oversized list; integration: the schema registry's expected tool list and the steering skeleton's tool catalog name insrc_present; integration: the MCP tool surface golden fixture lists insrc_present and the tool count is thirteen; integration: insrc_present with a resolver that finds no repo answers an error and presents nothing; integration: a pending record with no document file is reported as not pending by the tool and by the chat | [[c1]] [[c4]] |
| 3 | **`t3`** Carry the declared documents on the tool-call event (Claude) | M | `t1` | unit: the Claude mapper sets present on an insrc_present tool call from its input and leaves it off every other tool call; unit: an input that is not a list of at most twenty non-empty strings leaves present absent; unit: the declared list is not written into the saved transcript | [[c1]] [[c2]] [[c3]] |
| 4 | **`t4`** Map the Codex mcp_tool_call item | M | `t3` | unit: the pinned real Codex capture maps to exactly one tool-call event with present set to the declared documents, from the completed mcp_tool_call item and not the started one; unit: a Codex mcp_tool_call insrc_present item with status failed still sets present; unit: a Codex mcp_tool_call for another tool, a server-qualified tool name, or string arguments sets no present, and command_execution and tool_call items map as before | [[c2]] [[c3]] |
| 5 | **`t5`** Presenter: open exactly the declared documents | M | `t1` | unit: a declared artifact id and a declared path each open the matching pending document once, in order; unit: a declared name that is not pending opens nothing and is reported by name; unit: the same document declared twice in a turn opens once; unit: an unreadable pending list and a failing open are logged and never thrown; unit: declared answers an outcome naming what opened, which names were not pending, and whether the pending list was unreadable; unit: a declared artifact id matches the pending list's id without regard to the case of its story part | [[c1]] [[c2]] [[c3]] |
| 6 | **`t6`** Chat host feeds declarations and shows the outcome | M | `t3`, `t4`, `t5` | integration: the chat host passes a tool-call's declared documents to the presenter and nothing else, and ends the turn without opening anything; integration: the chat host shows a line for a not-pending name and for an unreadable pending list from the presenter's outcome; integration: the chat host feeds the declaration from both a followed live turn and a hosted run; integration: the chat opens a declared pending document even when the insrc_present tool call itself failed | [[c1]] [[c2]] [[c3]] |
| 7 | **`t7`** Rewrite the steering and guide text | S | `t2` | integration: the steering block, the steering template and the guide tell the controller to call insrc_present before it asks for approval | [[c1]] [[c4]] |
| 8 | **`t8`** Remove the output-parsing path and run the live checks | M | `t6`, `t7` | unit: a turn with no declaration opens nothing at its end, and a tool result carrying a pendingApproval block opens nothing; integration: the output-parsing path is gone: presentedPathOf and the end-of-turn guess no longer exist; live: a document the controller declares opens in the review pane even when the workflow result was large, and a name that is not pending is reported in the chat; live: a Codex chat turn that calls insrc_present opens the declared document in the review pane | [[c1]] [[c2]] [[c3]] [[c4]] |

### 1.1 E20261015067b05b6:S001:T001 — Verify the existing symbols match the LLD

Before changing anything, confirm that createReviewPresenter and its PresentedTurn handle, the exported presentedPathOf, the tool-call TurnEvent in stream-events.ts, and the Claude and Codex mappers in cli-adapter.ts have the shapes the LLD assumes (toolResult and end on the handle; no input on the tool-call event; Codex handling only command_execution and tool_call on item.completed). Record the symbols and shapes found as the task's reported evidence (no test is added); stop and report if any differs.

**Acceptance checks:**
- Each of the existing symbols the LLD changes or removes was read in the code and its shape is recorded against the LLD's before state
- Any difference from the LLD is reported, not worked around

### 1.2 E20261015067b05b6:S001:T002 — Add the insrc_present MCP tool

Add the insrc_present input shape to the schema registry, a workflow.pending wrapper in daemon-stream.ts, a handler that resolves the repo as insrc_workflow_approve does and answers presented and notPending against the pending list (a record with no document file is not presentable; ids matched without regard to the case of the story part; one to twenty names), register the tool in server.ts, and update the pins: the golden tool-surface fixture (inserted in name-sorted position, count thirteen, the 'twelve tools' title and length check in forward-step.test.ts), EXPECTED_TOOLS and PHASELESS_TOOLS in schema-registry.test.ts, and the steering tool-catalog row in steering-block.md (the only steering edit in this task; the prose is t7).

**Acceptance checks:**
- insrc_present answers presented and notPending for pending and non-pending names and rejects an empty, oversized or non-string list
- With no resolvable repo the tool answers an error and presents nothing
- The golden fixture, forward-step test and schema registry tests pass with thirteen tools

### 1.3 E20261015067b05b6:S001:T003 — Carry the declared documents on the tool-call event (Claude)

Add the optional live-only present list to the tool-call TurnEvent in stream-events.ts and set it in the Claude mapper from the tool_use input's documents when the tool is insrc_present (an array of at most twenty non-empty strings; anything else leaves it absent). Every other tool-call event is unchanged and the field is never written to the saved transcript.

**Acceptance checks:**
- A Claude insrc_present tool_use sets present from its input and every other tool leaves it off
- An input that is not a list of at most twenty non-empty strings leaves present absent
- present is not written into the saved transcript

### 1.4 E20261015067b05b6:S001:T004 — Map the Codex mcp_tool_call item

Give the Codex mapper in cli-adapter.ts a branch for mcp_tool_call items on item.completed only: set the event's mcp from server and tool, and when tool is exactly insrc_present set present from arguments.documents (an object, no JSON-string form); ignore item.started so a call declares once, and still declare when the item's status is failed. command_execution and tool_call items map as before. Tested against the pinned codex-mcp-tool-call.jsonl capture. The mapper stays pinned to codex-cli 0.162.1 with no drift warning.

**Acceptance checks:**
- The pinned real capture maps to exactly one tool-call event with present set, from the completed item
- A failed completed item still sets present
- Another tool, a server-qualified tool name, or string arguments set no present, and command_execution and tool_call items map as before

### 1.5 E20261015067b05b6:S001:T005 — Presenter: open exactly the declared documents

Change the presenter's turn handle in review-presenter.ts from toolResult and end to declared(documents) returning a DeclaredOutcome (opened, notPending, unreadable) and end. declared resolves each name against the pending list (artifact id without regard to the case of the story part, or path), opens each match once per turn in order, reports names that are not pending, logs and reports an unreadable list, and never throws. The old toolResult, presentedPathOf and end-of-turn guess are left in place for now so the build stays green; they are removed in t8.

**Acceptance checks:**
- A declared id and a declared path each open the matching pending document once, in order
- A name that is not pending opens nothing and is reported by name; an unreadable list or a failing open is logged and never thrown
- The same document declared twice in a turn opens once, and ids match without regard to the case of the story part

### 1.6 E20261015067b05b6:S001:T006 — Chat host feeds declarations and shows the outcome

In chat-panel.ts pass each tool-call event's present list to the presented turn's declared() on both feed paths (the followed live turn and the hosted run) with the existing guarded helpers, and show the DeclaredOutcome as chat information lines (a name that is not pending, an unreadable pending list). extension.ts keeps building the presenter as today.

**Acceptance checks:**
- A tool-call's declared documents reach the presenter on both a followed live turn and a hosted run, and nothing else is passed
- A not-pending name and an unreadable pending list each show an information line in the chat
- The chat opens a declared pending document even when the insrc_present call itself failed

### 1.7 E20261015067b05b6:S001:T007 — Rewrite the steering and guide text

Rewrite the approval and guide prose in steering-block.md so the controller calls insrc_present with the documents it asks the user to review before it asks for approval, and also gives the document's path in its message; the catalog row stays as t2 left it, and the steering-template needs no change beyond pointing at the block. Add a plain note that steering-only enforcement is accepted for now and should be revisited (a daemon-side reminder in tool responses, or detection of a missing call) if it proves unreliable. Update the steering-text pins in the tests.

**Acceptance checks:**
- The steering block and guide tell the controller to call insrc_present before asking for approval and to give the path in its message
- The steering text carries the revisit note for steering-only enforcement
- The steering-text tests pass

### 1.8 E20261015067b05b6:S001:T008 — Remove the output-parsing path and run the live checks

Once everything above is in, remove presentedPathOf, toolResult on the presented turn, the chat host's tool-result feed to the presenter and the end-of-turn opening of whatever became pending, along with the TurnState fields only they used and the tests that pinned them. Nothing in the chat reads a tool result to decide what to open. Then run the two live checks against the finished behaviour: a declared document opens in the review pane even when the workflow result was large, and a Codex chat turn that calls insrc_present opens the declared document.

**Acceptance checks:**
- presentedPathOf, toolResult and the end-of-turn guess no longer exist and nothing references them
- A turn with no declaration opens nothing at its end, and a result carrying a pendingApproval block opens nothing
- The chat, presenter and extension tests and the type check pass
- The two live checks were run by the user and their results recorded as reported, not run by the gate

## 2. Test-strategy coverage

| LLD strategy item | Covered by |
| :--- | :--- |
| a declared artifact id and a declared path each open the matching pending document once, in order | `t5` |
| a declared name that is not pending opens nothing and is reported by name | `t5` |
| a turn with no declaration opens nothing at its end, and a tool result carrying a pendingApproval block opens nothing | `t8` |
| the same document declared twice in a turn opens once | `t5` |
| an unreadable pending list and a failing open are logged and never thrown | `t5` |
| the Claude mapper sets present on an insrc_present tool call from its input and leaves it off every other tool call | `t3` |
| an input that is not a list of at most twenty non-empty strings leaves present absent | `t3` |
| the declared list is not written into the saved transcript | `t3` |
| the pinned real Codex capture maps to exactly one tool-call event with present set to the declared documents, from the completed mcp_tool_call item and not the started one | `t4` |
| a Codex mcp_tool_call insrc_present item with status failed still sets present | `t4` |
| a Codex mcp_tool_call for another tool, a server-qualified tool name, or string arguments sets no present, and command_execution and tool_call items map as before | `t4` |
| declared answers an outcome naming what opened, which names were not pending, and whether the pending list was unreadable | `t5` |
| a declared artifact id matches the pending list's id without regard to the case of its story part | `t5` |
| insrc_present answers presented and notPending against the daemon's pending list and rejects an empty or oversized list | `t2` |
| the chat host passes a tool-call's declared documents to the presenter and nothing else, and ends the turn without opening anything | `t6` |
| the output-parsing path is gone: presentedPathOf and the end-of-turn guess no longer exist | `t8` |
| the steering block, the steering template and the guide tell the controller to call insrc_present before it asks for approval | `t7` |
| the chat host shows a line for a not-pending name and for an unreadable pending list from the presenter's outcome | `t6` |
| the schema registry's expected tool list and the steering skeleton's tool catalog name insrc_present | `t2` |
| the MCP tool surface golden fixture lists insrc_present and the tool count is thirteen | `t2` |
| insrc_present with a resolver that finds no repo answers an error and presents nothing | `t2` |
| a pending record with no document file is reported as not pending by the tool and by the chat | `t2`, `t5` |
| the chat host feeds the declaration from both a followed live turn and a hosted run | `t6` |
| the chat opens a declared pending document even when the insrc_present tool call itself failed | `t6` |
| a document the controller declares opens in the review pane even when the workflow result was large, and a name that is not pending is reported in the chat | `t8` |
| a Codex chat turn that calls insrc_present opens the declared document in the review pane | `t8` |

## 3. References

- **[[c1]]** `prior-artifact` `LLD s1 contract details: createReviewPresenter, presentedPathOf, the tool-call event and insrc_present`
- **[[c2]]** `prior-artifact` `LLD s1 data model changes: the tool-call event's present field, the Codex mcp_tool_call mapper and the pinned capture`
- **[[c3]]** `prior-artifact` `LLD s1 error paths, edge cases and invariants to preserve`
- **[[c4]]** `prior-artifact` `LLD s1 migration steps and the MCP tool-surface and steering pins`
