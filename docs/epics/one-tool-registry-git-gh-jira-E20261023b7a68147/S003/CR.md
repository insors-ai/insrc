<!-- insrc:artifact CR-b7a68147dcf72034-s3 -->

# Code review: b7a68147dcf72034:s3

⚠️ **WARN** — HIGH 0 · MED 20 · LOW 9 · model `codex:gpt-6.1-sol`

**Changed files:** 132

**Reviewed on the diff:** the wait for a fresh index timed out after 133 s (code-index job in flight: yes; queued: 1; stale files: none)

## adherence — 15 finding(s)

| Severity | Location | Message |
| --- | --- | --- |
| MED | src/daemon/approval-broker.ts:60 | The broker derives its timeout from the supplied request.expiresAt and uses APPROVAL_WAIT_MS only for invalid dates. A valid expiry can therefore shorten or extend the wait beyond the approved 300 seconds. The broker should establish expiresAt using its fixed 300000 ms constant when raising the request. |
| MED | src/daemon/approval-broker.ts:79 | answer() checks only pending membership, so an approval received after expiresAt but before the timer callback runs is accepted and clears the timeout. This permits execution instead of the required timed-out denial. Check expiresAt before accepting an answer and settle expired requests as timed-out. |
| MED | vscode-plugin/src/chat/approval-subscribe.ts:81 | The approval.answer result is discarded, so accepted:false produces no indication that the request is no longer open. When a request expires or is answered elsewhere before this RPC arrives, the client silently removes its local request instead of showing the required stale-request feedback. Inspect accepted and notify the user when it is false. |
| MED | vscode-plugin/src/extension.ts:116 | The notification's close handler only sets `closed = true`; it does not dismiss the displayed approval prompt. When the caller aborts, the cancel frame invalidates later clicks but leaves the prompt visible, departing from the required behavior that the prompt disappears from the client. |
| LOW | src/daemon/tools/approval-policy.ts:32 | The catch silently discards exceptions from per-input approval functions. Although it correctly falls back to destructive, the approved error case also requires logging the failure. Capture and log the exception while preserving the fallback. |
| LOW | src/daemon/tools/approval-policy.ts:85 | When a git call omits cwd and deps.repoPath is empty, the request carries an empty repository string. The approved edge case requires the request to explicitly say the repository is unknown. |
| MED | src/daemon/tools/approval-policy.ts:51 | The depth-four cutoff returns nested objects unchanged, so large strings inside them enter the approval request without truncation or an original-length annotation. Apply display truncation to strings at deeper nesting levels as well, while preserving the original execution input. |
| MED | vscode-plugin/src/chat/approval-subscribe.ts:48 | Truncating serialized arguments to 300 characters can remove the daemon's original-length annotation for a large value. The approval display then shows only an ellipsis, without the required full length. Preserve the length annotation when shortening the display. |
| MED | src/daemon/tools/executor.ts:102 | Approval request construction is awaited outside either try/catch. If argument truncation or generic preview serialization throws (for example, JSON.stringify encounters a circular reference or BigInt), executeTool rejects instead of returning a ToolResult with success false. Catch request-construction failures and convert them to failed ToolResults. |
| MED | src/daemon/tools/executor.ts:1 | The evidence does not show implementation of approval at step 2 before hooks at step 5, including suppression of hooks for denied calls. This required shared-contract behavior remains unimplemented in the supplied evidence. |
| MED | src/config/__tests__/fixtures/PROVENANCE.md:16 | The required fixture cleanup is unimplemented: daemon-defaults-literal.json is absent from the changed files, and PROVENANCE still describes permissions.mode as retained in the capture. Remove it from the fixture and update this description as required. |
| MED | vscode-plugin/src/chat/approval-subscribe.ts:46 | The evidence establishes editor/chat approval notifications and answers, but does not show implementation of the required exact-call display. Present the tool and complete arguments so users can inspect the call they are approving. |
| MED | src/daemon/tools/types.ts:163 | The evidence notes do not show implementation of the required removal of requiresApproval and destructive from the Tool type. This part of migration step 6 remains unaccounted for. |
| MED | src/daemon/tools/approval-policy.ts:51 | Truncation stops traversing objects at depth four, so large strings nested below that depth remain untruncated and lack the original-length annotation. Valid nested arguments can therefore produce an arbitrarily large approval display, contrary to the task's requirement to truncate large arguments with their length noted. |
| MED | vscode-plugin/src/extension.ts:116 | The notifier's close() only sets a boolean, so a cancel frame suppresses subsequent answers but leaves the approval notification visible. Task t10 explicitly requires cancellation to close the notification; use a dismissible notification surface and dispose it when cancelled. |

## conventions — 7 finding(s)

| Severity | Location | Message |
| --- | --- | --- |
| LOW | src/cli/services/approval.ts:31 | createApprovalWatcher declares reconnectMs?: number without the explicit \| undefined required for optional properties. Use reconnectMs?: number \| undefined. |
| LOW | src/cli/services/index.ts:103 | The approvals property omits the explicit \| undefined required for optional properties. Use approvals?: ApprovalWatcher \| undefined. |
| LOW | src/config/__tests__/tools-common-approval.test.ts:38 | The parsed-config annotation declares `tools?` and `commonApproval?` without explicit `\| undefined`, contrary to the documented optional-property convention. Add `\| undefined` to both optional property types. |
| LOW | src/daemon/tools/__tests__/approval-class-mapping.test.ts:32 | SnapshotTool.probes is optional but omits the explicit `\| undefined` required by the documented optional-property convention. Declare it as `probes?: Array<{ input: Record<string, unknown>; asks: boolean }> \| undefined`. |
| LOW | src/daemon/tools/types.ts:190 | Tool.approval is optional but omits the explicit `\| undefined` required for optional property declarations. Add `\| undefined` to its union. |
| LOW | src/shared/common-approval.ts:27 | The asserted config shape declares optional `tools` and `commonApproval` properties without the explicit `\| undefined` required for optional properties by the documented convention. |
| LOW | vscode-plugin/src/chat/approval-subscribe.ts:56 | The optional reconnectMs property omits the explicit `\| undefined` required by the documented optional-property convention. Declare it as `readonly reconnectMs?: number \| undefined`. |

## coverage — 0 finding(s)

_No findings._

## quality — 7 finding(s)

| Severity | Location | Message |
| --- | --- | --- |
| MED | src/daemon/approval-broker.ts:73 | Correctness: answer() checks only map membership, so an expired request can still be approved before its timeout callback runs. Check expiresAt when accepting an answer and settle expired requests as timed-out. |
| MED | src/cli/services/approval.ts:77 | Error handling: answer() removes the prompt before the RPC succeeds, and useApprovals silently discards RPC failures. If the answer RPC fails while the subscription stays open, the daemon still holds the request but this terminal cannot retry it and shows no failure. Retain or restore the prompt on failure and expose the error. |
| MED | src/daemon/tools/executor.ts:113 | Correctness: every non-string gate result permits execution, although ApprovalAnswer explicitly permits decision: 'decline'. Check that the decision is 'approve' and the requestId matches before running the tool; otherwise a valid decline response can authorize it. |
| MED | src/daemon/tools/approval-policy.ts:68 | Correctness: the request includes unredacted input arguments and constructs a generic preview from them. The supplied schemas include secretString, smtpPass, accountKey and bearerToken, so approval requests expose credentials even when a custom gate redacts its preview. Apply sensitive-field redaction to both arguments and the fallback preview. |
| MED | src/daemon/tools/executor.ts:102 | Error handling: building the approval request happens outside both the gate catch and the tool execution catch. A serialization failure in the generic preview therefore rejects executeTool instead of returning a structured failure. Catch request-construction errors and deny execution with a ToolResult failure. |
| MED | vscode-plugin/src/chat/approval-subscribe.ts:49 | Approval text truncates arguments after 300 characters, while the extension notifier displays only that text and ignores the full request. Users can therefore approve a destructive call without seeing its complete arguments, including targets or options beyond the cutoff. Provide an inspectable full argument view before approval. |
| MED | src/cli/services/approval.ts:53 | Both modules implement the same approval subscription lifecycle: guarding stream creation, subscribing to gate frames, clearing pending state on disconnect, scheduling reconnection, and closing the stream and timer on stop. Extracting this shared lifecycle would prevent fixes to reconnect and shutdown behavior from diverging while retaining each client's distinct presentation logic. |

