<!-- insrc:artifact TESTS-067b05b6892cb212-s1 -->

# Tests: 067b05b6892cb212 s1

What the build validation gate ran for each Task of this Story, and what each test case did. The gate runs the tests itself; a result here is never a builder's statement unless it says so. `not found` means no test of that title ran in that file.

**Totals:** 25 pass, 0 fail, 0 skipped, 0 not found; 2 reported by the builder and not run by the gate.

## t1

Run at 2026-10-15T11:32:13.593Z on commit `44ce459f`. Tests check: **passed**. 0 pass, 0 fail, 0 skipped, 0 not found; 1 reported by the builder and not run by the gate.

the gate ran no test: every named test of this Task was reported by the builder

**smoke: the existing symbols the LLD changes or removes match its before state (read and recorded, reported)**

Reported by the builder, not run by the gate: **pass**. Evidence: Read in code: (1) review-presenter.ts: createReviewPresenter(deps) returns begin(): PresentedTurn {toolResult(output), end()}; exported presentedPathOf(output) JSON-parses for pendingApproval.artifactPath; end() opens whatever became pending since the turn began; ReviewPresenterDeps = {pendingDocuments(), open({artifactId, mdPath}), log} - matches the LLD before state. (2) stream-events.ts line 32-49: the tool-call TurnEvent has turnId, tool, mcp?, command?, callId? and no input/present field - matches. (3) cli-adapter.ts Claude mapper (about 598-623) builds tool-call from a tool_use block with the block's input in hand; the Codex mapper (about 740-775) handles only item.completed items of type command_execution or tool_call and reads item.tool/command/id, with no mcp and no arguments - matches. ONE CLARIFICATION, no contradiction: Claude's tool_use name is server-qualified (mcp__<server>__insrc_present, parsed by parseMcpTool into mcp {server, name}), while Codex's tool is the bare name; so the Claude mapper must match mcp.name === 'insrc_present' (any server name) and the Codex mapper tool === 'insrc_present', which fits the LLD's 'only for the insrc_present tool'. Recorded in this BUILD summary.

## t2

Run at 2026-10-15T11:34:44.617Z on commit `1d3c1ea2`. Tests check: **passed**. 6 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**integration: insrc_present answers presented and notPending against the daemon's pending list and rejects an empty or oversized list**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | insrc_present answers presented and notPending against the daemon's pending list and rejects an empty or oversized list | `src/mcp/__tests__/present-dispatch.test.ts` |

**integration: the schema registry's expected tool list and the steering skeleton's tool catalog name insrc_present**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | the schema registry's expected tool list and the steering skeleton's tool catalog name insrc_present | `src/mcp/__tests__/schema-registry.test.ts` |

**integration: the MCP tool surface golden fixture lists insrc_present and the tool count is thirteen**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | the MCP tool surface golden fixture lists insrc_present and the tool count is thirteen | `src/mcp/__tests__/forward-step.test.ts` |
| pass | MCP tool surface: the thirteen tools keep their names, descriptions and input schemas | `src/mcp/__tests__/forward-step.test.ts` |

**integration: insrc_present with a resolver that finds no repo answers an error and presents nothing**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | insrc_present with a resolver that finds no repo answers an error and presents nothing | `src/mcp/__tests__/present-dispatch.test.ts` |

**integration: a pending record with no document file is reported as not pending by the tool and by the chat**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | a pending record with no document file is reported as not pending by the tool and by the chat | `src/mcp/__tests__/present-dispatch.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `src/mcp/__tests__/forward-step.test.ts` | 0 | 5 | 0.8 s |  |
| `src/mcp/__tests__/present-dispatch.test.ts` | 0 | 4 | 0.5 s |  |
| `src/mcp/__tests__/schema-registry.test.ts` | 0 | 10 | 0.6 s |  |

## t3

Run at 2026-10-15T11:36:21.709Z on commit `a0ce5de1`. Tests check: **passed**. 3 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**unit: the Claude mapper sets present on an insrc_present tool call from its input and leaves it off every other tool call**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | the Claude mapper sets present on an insrc_present tool call from its input and leaves it off every other tool call | `vscode-plugin/src/chat/__tests__/cli-adapter.test.ts` |

**unit: an input that is not a list of at most twenty non-empty strings leaves present absent**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | an input that is not a list of at most twenty non-empty strings leaves present absent | `vscode-plugin/src/chat/__tests__/cli-adapter.test.ts` |

**unit: the declared list is not written into the saved transcript**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | the declared list is not written into the saved transcript | `vscode-plugin/src/chat/__tests__/markers.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `vscode-plugin/src/chat/__tests__/cli-adapter.test.ts` | 0 | 85 | 1.3 s |  |
| `vscode-plugin/src/chat/__tests__/markers.test.ts` | 0 | 13 | 0.3 s |  |

## t4

Run at 2026-10-15T11:37:56.950Z on commit `df95566d`. Tests check: **passed**. 3 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**unit: the pinned real Codex capture maps to exactly one tool-call event with present set to the declared documents, from the completed mcp_tool_call item and not the started one**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | the pinned real Codex capture maps to exactly one tool-call event with present set to the declared documents, from the completed mcp_tool_call item and not the started one | `vscode-plugin/src/chat/__tests__/cli-adapter.test.ts` |

**unit: a Codex mcp_tool_call insrc_present item with status failed still sets present**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | a Codex mcp_tool_call insrc_present item with status failed still sets present | `vscode-plugin/src/chat/__tests__/cli-adapter.test.ts` |

**unit: a Codex mcp_tool_call for another tool, a server-qualified tool name, or string arguments sets no present, and command_execution and tool_call items map as before**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | a Codex mcp_tool_call for another tool, a server-qualified tool name, or string arguments sets no present, and command_execution and tool_call items map as before | `vscode-plugin/src/chat/__tests__/cli-adapter.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `vscode-plugin/src/chat/__tests__/cli-adapter.test.ts` | 0 | 88 | 1.3 s |  |

## t5

Run at 2026-10-15T11:39:20.750Z on commit `f922fe04`. Tests check: **passed**. 6 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**unit: a declared artifact id and a declared path each open the matching pending document once, in order**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | a declared artifact id and a declared path each open the matching pending document once, in order | `vscode-plugin/src/chat/__tests__/review-presenter.test.ts` |

**unit: a declared name that is not pending opens nothing and is reported by name**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | a declared name that is not pending opens nothing and is reported by name | `vscode-plugin/src/chat/__tests__/review-presenter.test.ts` |

**unit: the same document declared twice in a turn opens once**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | the same document declared twice in a turn opens once | `vscode-plugin/src/chat/__tests__/review-presenter.test.ts` |

**unit: an unreadable pending list and a failing open are logged and never thrown**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | an unreadable pending list and a failing open are logged and never thrown | `vscode-plugin/src/chat/__tests__/review-presenter.test.ts` |

**unit: declared answers an outcome naming what opened, which names were not pending, and whether the pending list was unreadable**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | declared answers an outcome naming what opened, which names were not pending, and whether the pending list was unreadable | `vscode-plugin/src/chat/__tests__/review-presenter.test.ts` |

**unit: a declared artifact id matches the pending list's id without regard to the case of its story part**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | a declared artifact id matches the pending list's id without regard to the case of its story part | `vscode-plugin/src/chat/__tests__/review-presenter.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `vscode-plugin/src/chat/__tests__/review-presenter.test.ts` | 0 | 11 | 1 s |  |

## t6

Run at 2026-10-15T11:47:06.257Z on commit `fe5dcbb6`. Tests check: **passed**. 4 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**integration: the chat host passes a tool-call's declared documents to the presenter and nothing else, and ends the turn without opening anything**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | the chat host passes a tool-call's declared documents to the presenter and nothing else, and ends the turn without opening anything | `vscode-plugin/src/chat/__tests__/chat-panel.test.ts` |

**integration: the chat host shows a line for a not-pending name and for an unreadable pending list from the presenter's outcome**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | the chat host shows a line for a not-pending name and for an unreadable pending list from the presenter's outcome | `vscode-plugin/src/chat/__tests__/chat-panel.test.ts` |

**integration: the chat host feeds the declaration from both a followed live turn and a hosted run**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | the chat host feeds the declaration from both a followed live turn and a hosted run | `vscode-plugin/src/chat/__tests__/chat-panel.test.ts` |

**integration: the chat opens a declared pending document even when the insrc_present tool call itself failed**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | the chat opens a declared pending document even when the insrc_present tool call itself failed | `vscode-plugin/src/chat/__tests__/chat-panel.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `vscode-plugin/src/chat/__tests__/chat-panel.test.ts` | 0 | 163 | 4.5 s |  |

## t7

Run at 2026-10-15T11:48:18.646Z on commit `dbb08be0`. Tests check: **passed**. 1 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**integration: the steering block, the steering template and the guide tell the controller to call insrc_present before it asks for approval**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | the steering block, the steering template and the guide tell the controller to call insrc_present before it asks for approval | `src/mcp/__tests__/present-steering.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `src/mcp/__tests__/present-steering.test.ts` | 0 | 1 | 0.5 s |  |

## t8

Run at 2026-10-15T12:16:34.103Z on commit `44286557`. Tests check: **passed**. 2 pass, 0 fail, 0 skipped, 0 not found; 1 reported by the builder and not run by the gate.

**unit: a turn with no declaration opens nothing at its end, and a tool result carrying a pendingApproval block opens nothing**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | a turn with no declaration opens nothing at its end, and a tool result carrying a pendingApproval block opens nothing | `vscode-plugin/src/chat/__tests__/review-presenter.test.ts` |

**integration: the output-parsing path is gone: presentedPathOf and the end-of-turn guess no longer exist**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | the output-parsing path is gone: presentedPathOf and the end-of-turn guess no longer exist | `vscode-plugin/src/chat/__tests__/review-presenter.test.ts` |

**live: a document the controller declares opens in the review pane even when the workflow result was large, and a name that is not pending is reported in the chat**

Reported by the builder, not run by the gate: **pass**. Evidence: Run by the user in the insrc chat, 2026-10-15, after installing the rebuilt vsix and reloading the window. I called insrc_guide (build, a large result) and then insrc_present with ['ISSUE-83c85f38afad7843', 'LLD-nope-S001']; the tool answered presented:[ISSUE-83c85f38afad7843], notPending:[LLD-nope-S001]. The user reported: the issue record (Keep a chat turn's reply when the CLI answers a queued item first) opened in the review pane, and the chat showed the line 'Not shown for review, because not pending approval: LLD-nope-S001.' An earlier attempt, before the rebuilt plugin was installed, failed (nothing opened, no line) because the installed extension was the old build; it is not counted. Note: the large result was a guide text, not a truncated workflow result.

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `vscode-plugin/src/chat/__tests__/review-presenter.test.ts` | 0 | 9 | 0.5 s |  |
