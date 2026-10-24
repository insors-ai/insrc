<!-- insrc:artifact TESTS-b7a68147dcf72034-s3 -->

# Tests: b7a68147dcf72034 s3

What the build validation gate ran for each Task of this Story, and what each test case did. The gate runs the tests itself; a result here is never a builder's statement unless it says so. `not found` means no test of that title ran in that file.

**Totals:** 36 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

## t1

Run at 2026-10-24T07:05:36.878Z on commit `8c93a2f5`. Tests check: **passed**. 1 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**unit: src/daemon/tools/__tests__/approval-types.test.ts: ApprovalDenial holds exactly the four values and ToolDeps accepts caller and approvalMode**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | approval-types.test.ts: ApprovalDenial holds exactly the four values and ToolDeps accepts caller and approvalMode | `src/daemon/tools/__tests__/approval-types.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `src/daemon/tools/__tests__/approval-types.test.ts` | 0 | 1 | 1 s |  |

## t2

Run at 2026-10-24T07:07:56.893Z on commit `ff07926c`. Tests check: **passed**. 2 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**unit: src/config/__tests__/tools-common-approval.test.ts: config catalog entry tools.commonApproval: default auto, an unknown value falls back to auto with a warning, and a value written to config.json is read back after a reload**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | tools-common-approval.test.ts: config catalog entry tools.commonApproval: default auto, an unknown value falls back to auto with a warning, and a value written to config.json is read back after a reload | `src/config/__tests__/tools-common-approval.test.ts` |

**unit: src/config/__tests__/tools-common-approval.test.ts: permissions.mode is stripped from an existing config and is gone from the catalog, the plugin manifest and the settings page**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | tools-common-approval.test.ts: permissions.mode is stripped from an existing config and is gone from the catalog, the plugin manifest and the settings page | `src/config/__tests__/tools-common-approval.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `src/config/__tests__/tools-common-approval.test.ts` | 0 | 2 | 0.9 s |  |

## t3

Run at 2026-10-24T07:09:39.560Z on commit `cda2446f`. Tests check: **passed**. 7 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**unit: src/daemon/tools/__tests__/approval-broker.test.ts: an answered request resolves approved and a declined one resolves declined**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | approval-broker.test.ts: an answered request resolves approved and a declined one resolves declined | `src/daemon/tools/__tests__/approval-broker.test.ts` |

**unit: src/daemon/tools/__tests__/approval-broker.test.ts: no open stream resolves no-client at once**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | approval-broker.test.ts: no open stream resolves no-client at once | `src/daemon/tools/__tests__/approval-broker.test.ts` |

**unit: src/daemon/tools/__tests__/approval-broker.test.ts: an unanswered request resolves timed-out at expiry and a late answer is ignored**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | approval-broker.test.ts: an unanswered request resolves timed-out at expiry and a late answer is ignored | `src/daemon/tools/__tests__/approval-broker.test.ts` |

**unit: src/daemon/tools/__tests__/approval-broker.test.ts: with two subscribers the first answer wins and the second is refused**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | approval-broker.test.ts: with two subscribers the first answer wins and the second is refused | `src/daemon/tools/__tests__/approval-broker.test.ts` |

**unit: src/daemon/tools/__tests__/approval-broker.test.ts: closing the last stream resolves every pending request to no-client**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | approval-broker.test.ts: closing the last stream resolves every pending request to no-client | `src/daemon/tools/__tests__/approval-broker.test.ts` |

**unit: src/daemon/tools/__tests__/approval-broker.test.ts: an aborted caller signal resolves cancelled and sends the subscribers a cancel frame**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | approval-broker.test.ts: an aborted caller signal resolves cancelled and sends the subscribers a cancel frame | `src/daemon/tools/__tests__/approval-broker.test.ts` |

**unit: src/daemon/tools/__tests__/approval-broker.test.ts: a late subscriber receives the still-pending requests**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | approval-broker.test.ts: a late subscriber receives the still-pending requests | `src/daemon/tools/__tests__/approval-broker.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `src/daemon/tools/__tests__/approval-broker.test.ts` | 0 | 7 | 1.4 s |  |

## t4

Run at 2026-10-24T07:11:26.202Z on commit `820c2eb6`. Tests check: **passed**. 5 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**integration: src/daemon/tools/__tests__/approval-ipc.test.ts: a subscribed client receives the gate frame for a pending request and its answer resolves it**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | approval-ipc.test.ts: a subscribed client receives the gate frame for a pending request and its answer resolves it | `src/daemon/tools/__tests__/approval-ipc.test.ts` |

**integration: src/daemon/tools/__tests__/approval-ipc.test.ts: a client that subscribes after the request was raised receives it and answers with approval.answer**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | approval-ipc.test.ts: a client that subscribes after the request was raised receives it and answers with approval.answer | `src/daemon/tools/__tests__/approval-ipc.test.ts` |

**integration: src/daemon/tools/__tests__/approval-ipc.test.ts: an answer for an unknown request id returns accepted false**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | approval-ipc.test.ts: an answer for an unknown request id returns accepted false | `src/daemon/tools/__tests__/approval-ipc.test.ts` |

**integration: src/daemon/tools/__tests__/approval-ipc.test.ts: disconnecting the only subscriber resolves pending requests to no-client**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | approval-ipc.test.ts: disconnecting the only subscriber resolves pending requests to no-client | `src/daemon/tools/__tests__/approval-ipc.test.ts` |

**integration: src/daemon/tools/__tests__/approval-ipc.test.ts: a cancelled request sends a cancel frame over the socket**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | approval-ipc.test.ts: a cancelled request sends a cancel frame over the socket | `src/daemon/tools/__tests__/approval-ipc.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `src/daemon/tools/__tests__/approval-ipc.test.ts` | 0 | 5 | 1.3 s |  |

## t5

Run at 2026-10-24T07:13:29.579Z on commit `23abb17b`. Tests check: **passed**. 4 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**unit: src/daemon/tools/__tests__/approval-policy.test.ts: class resolution gives none, common, destructive, a per-input class, and destructive for a throwing function**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | approval-policy.test.ts: class resolution gives none, common, destructive, a per-input class, and destructive for a throwing function | `src/daemon/tools/__tests__/approval-policy.test.ts` |

**unit: src/daemon/tools/__tests__/approval-policy.test.ts: a destructive tool asks under every approvalMode, every flag value, any caller and any argument**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | approval-policy.test.ts: a destructive tool asks under every approvalMode, every flag value, any caller and any argument | `src/daemon/tools/__tests__/approval-policy.test.ts` |

**unit: src/daemon/tools/__tests__/approval-policy.test.ts: a common tool asks in manual and edit-auto, not in auto, and the call mode wins over the flag**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | approval-policy.test.ts: a common tool asks in manual and edit-auto, not in auto, and the call mode wins over the flag | `src/daemon/tools/__tests__/approval-policy.test.ts` |

**unit: src/daemon/tools/__tests__/approval-policy.test.ts: the request takes the repository from input cwd then deps.repoPath, truncates large arguments and falls back to a generic preview**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | approval-policy.test.ts: the request takes the repository from input cwd then deps.repoPath, truncates large arguments and falls back to a generic preview | `src/daemon/tools/__tests__/approval-policy.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `src/daemon/tools/__tests__/approval-policy.test.ts` | 0 | 4 | 0.6 s |  |

## t6

Run at 2026-10-24T07:16:02.369Z on commit `6187ed67`. Tests check: **passed**. 6 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**unit: src/daemon/tools/__tests__/executor-approval.test.ts: a declined call returns a denied failure with reason declined and execute is never called**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | executor-approval.test.ts: a declined call returns a denied failure with reason declined and execute is never called | `src/daemon/tools/__tests__/executor-approval.test.ts` |

**unit: src/daemon/tools/__tests__/executor-approval.test.ts: a timed-out call returns a denied failure with reason timed-out and the tool is not run**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | executor-approval.test.ts: a timed-out call returns a denied failure with reason timed-out and the tool is not run | `src/daemon/tools/__tests__/executor-approval.test.ts` |

**unit: src/daemon/tools/__tests__/executor-approval.test.ts: no client and a cancelled request return denied with their reasons**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | executor-approval.test.ts: no client and a cancelled request return denied with their reasons | `src/daemon/tools/__tests__/executor-approval.test.ts` |

**unit: src/daemon/tools/__tests__/executor-approval.test.ts: an approved call runs and returns the tool's result unchanged**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | executor-approval.test.ts: an approved call runs and returns the tool's result unchanged | `src/daemon/tools/__tests__/executor-approval.test.ts` |

**unit: src/daemon/tools/__tests__/executor-approval.test.ts: a second destructive call after an approved one raises its own request with a new id**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | executor-approval.test.ts: a second destructive call after an approved one raises its own request with a new id | `src/daemon/tools/__tests__/executor-approval.test.ts` |

**unit: src/daemon/tools/__tests__/executor-approval.test.ts: a bad input is rejected before any prompt**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | executor-approval.test.ts: a bad input is rejected before any prompt | `src/daemon/tools/__tests__/executor-approval.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `src/daemon/tools/__tests__/executor-approval.test.ts` | 0 | 6 | 3.4 s |  |

## t7

Run at 2026-10-24T07:20:35.735Z on commit `0cdb6f0e`. Tests check: **passed**. 4 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**unit: src/daemon/tools/__tests__/approval-class-mapping.test.ts: every former requiresApproval true builtin is common, every predicate one is per-input, and every former false or absent tool resolves to none**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | approval-class-mapping.test.ts: every former requiresApproval true builtin is common, every predicate one is per-input, and every former false or absent tool resolves to none | `src/daemon/tools/__tests__/approval-class-mapping.test.ts` |

**unit: src/daemon/tools/__tests__/approval-class-mapping.test.ts: the eight destructive builtins are destructive**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | approval-class-mapping.test.ts: the eight destructive builtins are destructive | `src/daemon/tools/__tests__/approval-class-mapping.test.ts` |

**unit: src/daemon/tools/__tests__/approval-class-mapping.test.ts: no builtin still declares requiresApproval or destructive**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | approval-class-mapping.test.ts: no builtin still declares requiresApproval or destructive | `src/daemon/tools/__tests__/approval-class-mapping.test.ts` |

**unit: src/daemon/tools/__tests__/approval-class-mapping.test.ts: the tool ids and input schemas match the snapshot taken before the rewrite**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | approval-class-mapping.test.ts: the tool ids and input schemas match the snapshot taken before the rewrite | `src/daemon/tools/__tests__/approval-class-mapping.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `src/daemon/tools/__tests__/approval-class-mapping.test.ts` | 0 | 4 | 6.6 s |  |

## t8

Run at 2026-10-24T07:23:45.186Z on commit `dfd92a80`. Tests check: **passed**. 2 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**integration: src/shared/__tests__/ipc-client-stream.test.ts: a client opens a stream, receives the pushed frames and closes it**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | ipc-client-stream.test.ts: a client opens a stream, receives the pushed frames and closes it | `src/shared/__tests__/ipc-client-stream.test.ts` |

**integration: src/shared/__tests__/ipc-client-stream.test.ts: closing the handle aborts the server's stream handler**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | ipc-client-stream.test.ts: closing the handle aborts the server's stream handler | `src/shared/__tests__/ipc-client-stream.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `src/shared/__tests__/ipc-client-stream.test.ts` | 0 | 2 | 1.3 s |  |

## t9

Run at 2026-10-24T07:29:25.127Z on commit `40d41a49`. Tests check: **passed**. 2 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**integration: src/cli/services/__tests__/approval-subscribe.test.ts: the terminal client receives a gate frame, shows the tool, repository and arguments, and sends approval.answer**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | approval-subscribe.test.ts: the terminal client receives a gate frame, shows the tool, repository and arguments, and sends approval.answer | `src/cli/services/__tests__/approval-subscribe.test.ts` |

**integration: src/cli/services/__tests__/approval-subscribe.test.ts: a cancel frame removes the prompt and the stream is reopened after a restart**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | approval-subscribe.test.ts: a cancel frame removes the prompt and the stream is reopened after a restart | `src/cli/services/__tests__/approval-subscribe.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `src/cli/services/__tests__/approval-subscribe.test.ts` | 0 | 2 | 4.4 s |  |

## t10

Run at 2026-10-24T07:33:54.135Z on commit `fa57c897`. Tests check: **passed**. 2 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**integration: vscode-plugin/src/chat/__tests__/approval-subscribe.test.ts: the editor and chat client receive a gate frame, show the exact call and send approval.answer**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | approval-subscribe.test.ts: the editor and chat client receive a gate frame, show the exact call and send approval.answer | `vscode-plugin/src/chat/__tests__/approval-subscribe.test.ts` |

**integration: vscode-plugin/src/chat/__tests__/approval-subscribe.test.ts: a cancel frame closes the notification and the stream is reopened after a restart**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | approval-subscribe.test.ts: a cancel frame closes the notification and the stream is reopened after a restart | `vscode-plugin/src/chat/__tests__/approval-subscribe.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `vscode-plugin/src/chat/__tests__/approval-subscribe.test.ts` | 0 | 3 | 2 s |  |

## t11

Run at 2026-10-24T07:35:56.834Z on commit `0a38fb5d`. Tests check: **passed**. 1 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**integration: src/daemon/tools/__tests__/approval-matrix.test.ts: every mode against none, common and destructive tools asks exactly as the ac6 reading says, through the real executor and broker**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | approval-matrix.test.ts: every mode against none, common and destructive tools asks exactly as the ac6 reading says, through the real executor and broker | `src/daemon/tools/__tests__/approval-matrix.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `src/daemon/tools/__tests__/approval-matrix.test.ts` | 0 | 1 | 3.5 s |  |
