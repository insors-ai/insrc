<!-- insrc:artifact CR-b7a68147dcf72034-s3 -->

# Code review: b7a68147dcf72034:s3

⛔ **BLOCK** — HIGH 7 · MED 27 · LOW 3 · model `codex:gpt-6.1-sol`

**Changed files:** 134

## adherence — 34 finding(s)

| Severity | Location | Message |
| --- | --- | --- |
| MED | src/daemon/tools/types.ts:1 | The supplied evidence shows no implementation of Tool.approval or the required migration from requiresApproval/destructive, including predicate mapping and the eight destructive builtins. This required contract is therefore unimplemented on the review evidence. |
| MED | src/daemon/tools/types.ts:50 | The evidence establishes approvalMode on ToolDeps but does not show the required optional caller field with values 'agent' \| 'daemon' \| 'workflow' implemented. |
| MED | src/analyze/context/driver.ts:1132 | The evidence identifies buildToolDeps but does not show entry-point propagation of caller and the chat's edits mode into approvalMode. This required dependency construction is therefore unimplemented in the supplied evidence. |
| MED | src/daemon/approval-broker.ts:1 | The evidence establishes centralized settlement but does not show the required in-memory requestId-to-resolver/timer map, open-stream set, first-answer-wins enforcement, restart denial behavior, or broker-constant 300-second expiry measured from request creation. These required parts of the pending-table obligation remain unimplemented on the supplied evidence. |
| MED | src/config/config-catalog.ts:1 | The evidence shows only a config reader and test connections. It does not show the required persisted tools.commonApproval enum (manual \| edit-auto \| auto, default auto), retirement without migration of permissions.mode, or removal of approval.defaultAction and destructive.requireDoubleConfirm. These required configuration changes remain unimplemented in the supplied evidence. |
| HIGH | src/daemon/approval.ts:1 | The evidence establishes RPC and streaming infrastructure, but does not show registration of approval.subscribe to push gate frames or approval.answer to accept { requestId, decision }. These required IPC methods remain unimplemented on the supplied evidence. |
| HIGH | src/shared/ipc-client.ts:1 | The evidence does not show the required optional streaming member on IpcClient or terminal and editor/chat consumers that subscribe, render gates, and answer them. Generic openStream infrastructure alone does not implement these required client integrations. |
| HIGH | src/daemon/approval-broker.ts:1 | The supplied evidence shows no implementation of the required no-client path: ask() must resolve 'no-client' immediately when no approval stream is open, and the executor must return a denied ToolFailure with reason 'no-client' without running the destructive tool. This required error case is unimplemented in the review evidence. |
| MED | src/daemon/approval-broker.ts:1 | The evidence shows no implementation of the required unanswered-request timeout: a per-request timer must remove the pending request, resolve ask() as 'timed-out', cause a denied executor failure with reason 'timed-out', and ignore late approval.answer messages. |
| MED | src/daemon/tools/executor.ts:126 | The supplied evidence establishes only a decline-to-settlement path in the broker. No note shows the required executor behavior: returning a denied failure with reason 'declined' and preventing the tool from running. This part of the expectation is unimplemented in the provided evidence. |
| MED | src/daemon/approval-broker.ts:73 | The evidence establishes only the boolean response shape. It does not show the required pending-table lookup or miss handling that returns { accepted: false }, logs at warn level, and leaves pending requests unaffected for unknown, expired, or already answered request IDs. |
| HIGH | src/daemon/approval-broker.ts:52 | The evidence shows only an optional signal and cancellation notification plumbing. It does not show the required abort listener, pending-request removal, gate cancel frame, cancelled resolution, or executor denial preventing tool execution. These required cancellation behaviors remain unimplemented in the supplied evidence. |
| MED | src/shared/common-approval.ts:1 | The review evidence shows no implementation of the required handling for an unknown setting or config-read failure: validate against manual/edit-auto/auto, fall back to auto with a warning for common calls, and bypass the setting for destructive calls. This error-case expectation remains unimplemented on the supplied evidence. |
| MED | src/daemon/tools/executor.ts:1 | No evidence shows the required handling for a throwing per-input approval function. The executor must catch the exception, log the failure, and treat the class as destructive so the user is asked for approval. |
| MED | src/daemon/approval-broker.ts:1 | The supplied evidence shows no implementation ensuring simultaneous destructive calls receive distinct requestIds and separate prompts, with each answer resolving only its corresponding call. This required concurrency behavior remains unimplemented in the review evidence. |
| MED | src/daemon/approval-broker.ts:1 | The supplied evidence does not show implementation of first-answer-wins arbitration when two subscribed clients answer, including returning accepted: false to the second client. This required edge case remains unimplemented on the review evidence. |
| MED | src/daemon/tools/executor.ts:1 | The supplied evidence shows no implementation of the required per-call override: a common-class tool with deps.approvalMode 'auto' must execute without asking even when the global flag is 'manual'. This expectation remains unimplemented in the review evidence. |
| MED | src/daemon/tools/approval-policy.ts:1 | The supplied evidence does not show implementation of the required approval prompt for a common-class tool with no approvalMode when the global flag is 'edit-auto'. This required edge case remains unimplemented in the review evidence. |
| MED | src/daemon/tools/approval-policy.ts:1 | The evidence shows buildApprovalRequest accepts input and deps.repoPath, but does not show implementation of the required behavior: when a git tool omits cwd, the request must name deps.repoPath, or explicitly say the repository is unknown when that is also empty. |
| MED | src/daemon/approval-broker.ts:1 | The supplied evidence shows no implementation that sends still-pending approval requests when a client subscribes. This required late-subscription behavior is therefore unimplemented in the review evidence, leaving late clients unable to receive and answer existing requests. |
| MED | src/daemon/tools/approval-policy.ts:63 | The supplied evidence establishes a separate display transformation but does not show large-value truncation, annotation of the original full length, or preservation of untruncated execution input. These required behaviors remain unimplemented in the evidence for this obligation. |
| MED | src/daemon/tools/types.ts:1 | The supplied evidence does not show implementation of sc4's required approval contract: the class field, global flag, ApprovalRequest/Answer/Denial types, broker, timeout, and two IPC methods. It also does not establish the caller and optional approvalMode request fields or their propagation to daemon dependencies. Under the review's evidence-only rule, this remains an unimplemented expectation. |
| MED | src/daemon/tools/types.ts:1 | The supplied evidence does not show implementation of ApprovalClass, the optional Tool.approval field, or the optional ToolDeps.caller and ToolDeps.approvalMode fields alongside the old fields. This required migration step is therefore unimplemented on the review evidence. |
| MED | src/config/config-catalog.ts:1 | Unimplemented expectation: none of the supplied evidence shows the required tools.commonApproval catalog entry, persistence, boot reconciliation, or per-call executor read, nor the removal of the superseded approval settings and permissions.mode or the required fixture, test, and documentation updates. |
| MED | src/daemon/index.ts:1 | The supplied evidence shows no implementation of the approval broker or registration of approval.subscribe and approval.answer in the daemon handler maps. This required migration step is therefore unimplemented on the review evidence. |
| HIGH | src/cli/hooks/useApprovals.ts:1 | The evidence establishes only terminal approval UI interfaces. It does not show approval.subscribe connections, exact-call presentation, or approval.answer RPCs for the terminal, editor, and chat. These required client integrations remain unimplemented on the supplied evidence. |
| MED | src/docgen/tool.ts:1 | The required migration is unimplemented in the supplied evidence: no note shows builtin approval values or predicates mapped, the eight destructive builtins migrated, or legacy fields removed, including from src/docgen/tool.ts. |
| MED | src/daemon/tools/executor.ts:1 | The supplied evidence shows no implementation of migration step 6: executor class resolution and broker authorization, removal of the auto-approving branch, caller assignment in the two executeTool dependency builders, or removal of requiresApproval and destructive from Tool. This required migration is therefore unimplemented in the review evidence. |
| HIGH | src/daemon/index.ts:1 | The evidence shows an IPC test harness and shared type declarations, but no production registration of approval.subscribe or approval.answer against the single broker created at daemon startup. The required production IPC exposure is therefore unimplemented in the supplied evidence. |
| HIGH | src/daemon/tools/executor.ts:1 | The evidence establishes policy/helper integration and a gate accessor, but shows no implementation of input validation before prompting, awaiting approval, or returning denied with the denial reason without executing on decline, timeout, no client, or cancellation. It also does not establish removal of the auto-approving branch. These required execution safeguards remain unimplemented on the supplied evidence. |
| MED | src/analyze/context/driver.ts:1 | No note shows caller being set in either required ToolDeps builder (the analyzer's buildToolDeps or the Ollama provider). The required caller propagation remains unimplemented on the supplied evidence. |
| MED | src/daemon/tools/__tests__/approval-class-mapping.test.ts:1 | The evidence shows only mapping-test infrastructure. No note shows the required builtin approval migration, removal of legacy Tool fields, or a preserved snapshot asserting identical tool IDs/input schemas and correct approval classes. Task t7 therefore remains unimplemented on the supplied evidence. |
| MED | src/cli/ui/ApprovalPrompt.tsx:23 | The evidence shows prompt props and an expiry helper, but no implementation rendering the tool, repository, exact arguments, preview and time left, or binding approve/decline keys. These required terminal interactions remain unimplemented in the supplied evidence. |
| MED | src/cli/services/approval.ts:31 | The evidence supports subscription state and reconnect plumbing, but shows no cancel-frame handler removing the corresponding pending request. Task t9 explicitly requires cancellation to dismiss the prompt. |

## conventions — 3 finding(s)

| Severity | Location | Message |
| --- | --- | --- |
| LOW | src/agent/providers/ollama.ts:266 | listLocalModels declares optional timeoutMs and listFn properties without explicit `\| undefined`, contrary to the documented optional-property convention. Use `timeoutMs?: number \| undefined` and `listFn?: (() => Promise<{ models?: unknown }>) \| undefined`. |
| LOW | src/daemon/tools/builtins/ssh/index.ts:40 | parseHost declares its optional return property as `port?: number`, omitting the explicit `\| undefined` required by the documented convention. Use `port?: number \| undefined`. |
| LOW | src/cli/app.tsx:43 | App and AppBody (line 51) declare optional pollMs and initialPane props without explicit `\| undefined`, contrary to the documented optional-property convention. |

## coverage — 0 finding(s)

_No findings._

## quality — 0 finding(s)

_No findings._

