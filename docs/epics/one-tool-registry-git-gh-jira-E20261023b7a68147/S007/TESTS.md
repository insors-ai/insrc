<!-- insrc:artifact TESTS-b7a68147dcf72034-s7 -->

# Tests: b7a68147dcf72034 s7

What the build validation gate ran for each Task of this Story, and what each test case did. The gate runs the tests itself; a result here is never a builder's statement unless it says so. `not found` means no test of that title ran in that file.

**Totals:** 187 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

## t1

Run at 2026-10-26T18:25:10.543Z on commit `2d44eb561`. Tests check: **passed**. 9 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**unit: src/daemon/tools/__tests__/executor-abort.test.ts**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | executor-abort.test.ts: an already-aborted signal returns denied cancelled, asks nobody and never starts the tool | `src/daemon/tools/__tests__/executor-abort.test.ts` |
| pass | executor-abort.test.ts: an abort during preview construction returns cancelled before any ask | `src/daemon/tools/__tests__/executor-abort.test.ts` |
| pass | executor-abort.test.ts: an abort between the approval answer and execute returns denied cancelled and the tool does not run | `src/daemon/tools/__tests__/executor-abort.test.ts` |
| pass | executor-abort.test.ts: the broker is asked with the effective signal, so a nested call with no signal of its own is cancelled while it waits | `src/daemon/tools/__tests__/executor-abort.test.ts` |
| pass | executor-abort.test.ts: a call with no signal anywhere behaves as before | `src/daemon/tools/__tests__/executor-abort.test.ts` |

**unit: src/daemon/tools/__tests__/tool-signal.test.ts**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | tool-signal.test.ts: inside runWithToolSignal the signal aborts with the call, also after an await and inside a started promise | `src/daemon/tools/__tests__/tool-signal.test.ts` |
| pass | tool-signal.test.ts: runWithoutToolSignal clears the context inside it and after an await, and leaves the outer context intact | `src/daemon/tools/__tests__/tool-signal.test.ts` |

**unit: src/daemon/tools/__tests__/hooks-context.test.ts**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | hooks-context.test.ts: a hook of a directly called tool sees no signal before and after an await | `src/daemon/tools/__tests__/hooks-context.test.ts` |
| pass | hooks-context.test.ts: a hook of a NESTED executeTool sees no signal before and after an await, and its subprocess-like work is not cancelled by the outer abort | `src/daemon/tools/__tests__/hooks-context.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `src/daemon/tools/__tests__/executor-abort.test.ts` | 0 | 6 | 0.7 s |  |
| `src/daemon/tools/__tests__/hooks-context.test.ts` | 0 | 4 | 0.6 s |  |
| `src/daemon/tools/__tests__/tool-signal.test.ts` | 0 | 6 | 0.4 s |  |

## t2

Run at 2026-10-26T18:34:12.464Z on commit `644a204ea`. Tests check: **passed**. 14 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**unit: src/daemon/tools/__tests__/shell-helper-abort.test.ts**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | shell-helper-abort.test.ts: an already-aborted explicit signal starts no process in runShell, runShellBytes or spawnManaged | `src/daemon/tools/__tests__/shell-helper-abort.test.ts` |
| pass | shell-helper-abort.test.ts: an already-aborted ambient signal starts no process either | `src/daemon/tools/__tests__/shell-helper-abort.test.ts` |
| pass | shell-helper-abort.test.ts: a running process is killed when the explicit or the ambient signal aborts | `src/daemon/tools/__tests__/shell-helper-abort.test.ts` |
| pass | shell-helper-abort.test.ts: a call with no signal and no context behaves as before | `src/daemon/tools/__tests__/shell-helper-abort.test.ts` |

**unit: src/daemon/tools/__tests__/shell-helper-tree-kill.test.ts**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | shell-helper-tree-kill.test.ts: abort and time-out kill the whole group (the descendant is gone) and settle quickly, in runShell, runShellBytes and spawnManaged | `src/daemon/tools/__tests__/shell-helper-tree-kill.test.ts` |
| pass | shell-helper-tree-kill.test.ts: a descendant that left the group and holds the pipes cannot keep the call open past the bound | `src/daemon/tools/__tests__/shell-helper-tree-kill.test.ts` |
| pass | shell-helper-tree-kill.test.ts: runShellBytes kills the group on stderr overflow and reports it | `src/daemon/tools/__tests__/shell-helper-tree-kill.test.ts` |
| pass | shell-helper-tree-kill.test.ts: a call that is neither aborted nor timed out settles on close as before | `src/daemon/tools/__tests__/shell-helper-tree-kill.test.ts` |

**unit: src/daemon/tools/__tests__/spawn-managed.test.ts**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | spawn-managed.test.ts: returns the live child so stdout and stderr callbacks receive data in order, and settled carries code, signal, timedOut and aborted | `src/daemon/tools/__tests__/spawn-managed.test.ts` |
| pass | spawn-managed.test.ts: the timeoutMs ceiling kills the group and reports timedOut | `src/daemon/tools/__tests__/spawn-managed.test.ts` |
| pass | spawn-managed.test.ts: a spawn error reaches the child error event and settled still resolves | `src/daemon/tools/__tests__/spawn-managed.test.ts` |
| pass | spawn-managed.test.ts: an already-aborted effective signal returns spawned false, starts nothing and settles already aborted | `src/daemon/tools/__tests__/spawn-managed.test.ts` |

**unit: src/daemon/tools/builtins/git/__tests__/git-cat-file-tree-kill.test.ts**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | git-cat-file-tree-kill.test.ts: an abort kills the stand-in git and its descendant and returns a rejected failure within the bound | `src/daemon/tools/builtins/git/__tests__/git-cat-file-tree-kill.test.ts` |
| pass | git-cat-file-tree-kill.test.ts: its time-out kills the stand-in git and its descendant and returns a failure within the bound | `src/daemon/tools/builtins/git/__tests__/git-cat-file-tree-kill.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `src/daemon/tools/__tests__/shell-helper-abort.test.ts` | 0 | 4 | 1.2 s |  |
| `src/daemon/tools/__tests__/shell-helper-tree-kill.test.ts` | 0 | 4 | 9.2 s |  |
| `src/daemon/tools/__tests__/spawn-managed.test.ts` | 0 | 4 | 0.8 s |  |
| `src/daemon/tools/builtins/git/__tests__/git-cat-file-tree-kill.test.ts` | 0 | 2 | 1.1 s |  |

## t3

Run at 2026-10-26T18:39:50.632Z on commit `3816ff364`. Tests check: **passed**. 10 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**unit: src/daemon/tools/builtins/git/__tests__/git-abort.test.ts**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | git-abort.test.ts: every refresh tool fails rejected on an already-aborted signal and starts no git | `src/daemon/tools/builtins/git/__tests__/git-abort.test.ts` |
| pass | git-abort.test.ts: every refresh tool stops its running command on an abort while running and returns a rejected failure | `src/daemon/tools/builtins/git/__tests__/git-abort.test.ts` |
| pass | git-abort.test.ts: git_show starts no command after an abort between its header, diff and stat commands | `src/daemon/tools/builtins/git/__tests__/git-abort.test.ts` |
| pass | git-abort.test.ts: git_show returns a cancelled failure, never a success, when the abort comes after the header and the diff and during the stat | `src/daemon/tools/builtins/git/__tests__/git-abort.test.ts` |
| pass | git-abort.test.ts: the git helper fail() reports an aborted command as cancelled, and a mutating one adds that its outcome is unknown | `src/daemon/tools/builtins/git/__tests__/git-abort.test.ts` |

**unit: src/daemon/tools/builtins/git/__tests__/git-shared-deadline.test.ts**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | git-shared-deadline.test.ts: one deadline signal shared by successive calls kills the running command at the deadline and later calls never spawn | `src/daemon/tools/builtins/git/__tests__/git-shared-deadline.test.ts` |
| pass | git-shared-deadline.test.ts: a tool's own limit still stops a call first when it is shorter than the signal | `src/daemon/tools/builtins/git/__tests__/git-shared-deadline.test.ts` |

**unit: src/daemon/tools/builtins/git/__tests__/git-cat-file-timeout.test.ts**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | git-cat-file-timeout.test.ts: timeoutMs accepts 1 to 30000 and rejects 0, 30001 and a non-integer, in the schema and in execute | `src/daemon/tools/builtins/git/__tests__/git-cat-file-timeout.test.ts` |
| pass | git-cat-file-timeout.test.ts: without timeoutMs the limit is 30000 ms; a lower timeoutMs stops the read sooner and keeps the time-out failure | `src/daemon/tools/builtins/git/__tests__/git-cat-file-timeout.test.ts` |
| pass | git-cat-file-timeout.test.ts: the signal still applies on top of timeoutMs | `src/daemon/tools/builtins/git/__tests__/git-cat-file-timeout.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `src/daemon/tools/builtins/git/__tests__/git-abort.test.ts` | 0 | 5 | 2.5 s |  |
| `src/daemon/tools/builtins/git/__tests__/git-cat-file-timeout.test.ts` | 0 | 3 | 1.4 s |  |
| `src/daemon/tools/builtins/git/__tests__/git-shared-deadline.test.ts` | 0 | 2 | 1.6 s |  |

## t4

Run at 2026-10-26T18:48:23.621Z on commit `92e2f886e`. Tests check: **passed**. 53 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**unit: src/daemon/tools/builtins/shell/__tests__/exec-detached-parity.test.ts and the k8s, test-runner, ssh and aws logs parity tests**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | exec-detached-parity.test.ts: an argv run streams its stdout and stderr as progress frames and reports its byte counts and exit 0 | `src/daemon/tools/builtins/shell/__tests__/exec-detached-parity.test.ts` |
| pass | exec-detached-parity.test.ts: the command form runs through bash -c and a non-zero exit maps to a failed result with exit N | `src/daemon/tools/builtins/shell/__tests__/exec-detached-parity.test.ts` |
| pass | exec-detached-parity.test.ts: a spawn error gives the spawn failed text | `src/daemon/tools/builtins/shell/__tests__/exec-detached-parity.test.ts` |
| pass | exec-detached-parity.test.ts: empty argv and command is refused as before | `src/daemon/tools/builtins/shell/__tests__/exec-detached-parity.test.ts` |
| pass | exec-detached-parity.test.ts: the runtime cap reports timed out with the runtime cap exceeded error | `src/daemon/tools/builtins/shell/__tests__/exec-detached-parity.test.ts` |
| pass | exec-detached-parity.test.ts: an abort ends the process with code null and the usual ended text | `src/daemon/tools/builtins/shell/__tests__/exec-detached-parity.test.ts` |
| pass | k8s-spawn-parity.test.ts: logs follow streams stdout and stderr as progress frames and reports the streamed bytes | `src/daemon/tools/builtins/k8s/__tests__/k8s-spawn-parity.test.ts` |
| pass | k8s-spawn-parity.test.ts: logs follow with a non-zero exit is a failed result with exit N | `src/daemon/tools/builtins/k8s/__tests__/k8s-spawn-parity.test.ts` |
| pass | k8s-spawn-parity.test.ts: logs follow reports its runtime cap as success with runtime cap in the text | `src/daemon/tools/builtins/k8s/__tests__/k8s-spawn-parity.test.ts` |
| pass | k8s-spawn-parity.test.ts: logs follow aborted by the caller ends as a failed exit null result | `src/daemon/tools/builtins/k8s/__tests__/k8s-spawn-parity.test.ts` |
| pass | k8s-spawn-parity.test.ts: exec writes stdin, returns stdout and stderr in the usual text | `src/daemon/tools/builtins/k8s/__tests__/k8s-spawn-parity.test.ts` |
| pass | k8s-spawn-parity.test.ts: exec with a non-zero exit and with a time-out keep their wording | `src/daemon/tools/builtins/k8s/__tests__/k8s-spawn-parity.test.ts` |
| pass | k8s-spawn-parity.test.ts: port-forward streams kubectl output and reports its end, cap and failure | `src/daemon/tools/builtins/k8s/__tests__/k8s-spawn-parity.test.ts` |
| pass | k8s-spawn-parity.test.ts: a missing kubectl gives the spawn failed text at each site | `src/daemon/tools/builtins/k8s/__tests__/k8s-spawn-parity.test.ts` |
| pass | test-runner-parity.test.ts: test_watch streams stdout and stderr as progress frames and reports byte counts and the framework | `src/daemon/tools/builtins/test/__tests__/test-runner-parity.test.ts` |
| pass | test-runner-parity.test.ts: test_watch with a non-zero exit, a runtime cap and an abort keeps its wording | `src/daemon/tools/builtins/test/__tests__/test-runner-parity.test.ts` |
| pass | test-runner-parity.test.ts: test_watch with a missing command gives the spawn failed text | `src/daemon/tools/builtins/test/__tests__/test-runner-parity.test.ts` |
| pass | ssh-spawn-parity.test.ts: exec-detached streams stdout and stderr as progress frames and reports byte counts | `src/daemon/tools/builtins/ssh/__tests__/ssh-spawn-parity.test.ts` |
| pass | ssh-spawn-parity.test.ts: exec-detached non-zero exit, runtime cap and abort keep their wording | `src/daemon/tools/builtins/ssh/__tests__/ssh-spawn-parity.test.ts` |
| pass | ssh-spawn-parity.test.ts: port-forward announces the tunnel, reports a clean close, a failing exit and its cap | `src/daemon/tools/builtins/ssh/__tests__/ssh-spawn-parity.test.ts` |
| pass | ssh-spawn-parity.test.ts: a missing ssh gives the spawn failed text at both sites | `src/daemon/tools/builtins/ssh/__tests__/ssh-spawn-parity.test.ts` |
| pass | logs-parity.test.ts: follow mode streams stdout as progress frames and reports bytes and the stderr tail | `src/daemon/tools/builtins/cloud/aws/__tests__/logs-parity.test.ts` |
| pass | logs-parity.test.ts: follow mode with a non-zero exit, a runtime cap and an abort keeps its wording | `src/daemon/tools/builtins/cloud/aws/__tests__/logs-parity.test.ts` |
| pass | logs-parity.test.ts: a missing aws gives the spawn failed text | `src/daemon/tools/builtins/cloud/aws/__tests__/logs-parity.test.ts` |

**integration: src/daemon/tools/__tests__/direct-spawn-tools-cancellation.test.ts**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | direct-spawn-tools-cancellation.test.ts: shell:exec-detached (argv): an abort kills the whole process group, settles within the bound, returns the usual aborted result and keeps the progress sent before | `src/daemon/tools/__tests__/direct-spawn-tools-cancellation.test.ts` |
| pass | direct-spawn-tools-cancellation.test.ts: shell:exec-detached (argv): its own time-out ceiling kills the group and keeps today's time-out wording | `src/daemon/tools/__tests__/direct-spawn-tools-cancellation.test.ts` |
| pass | direct-spawn-tools-cancellation.test.ts: shell:exec-detached (argv): an already-aborted signal takes the no-spawn branch and returns the aborted result | `src/daemon/tools/__tests__/direct-spawn-tools-cancellation.test.ts` |
| pass | direct-spawn-tools-cancellation.test.ts: shell:exec-detached (bash -c command): an abort kills the whole process group, settles within the bound, returns the usual aborted result and keeps the progress sent before | `src/daemon/tools/__tests__/direct-spawn-tools-cancellation.test.ts` |
| pass | direct-spawn-tools-cancellation.test.ts: shell:exec-detached (bash -c command): its own time-out ceiling kills the group and keeps today's time-out wording | `src/daemon/tools/__tests__/direct-spawn-tools-cancellation.test.ts` |
| pass | direct-spawn-tools-cancellation.test.ts: shell:exec-detached (bash -c command): an already-aborted signal takes the no-spawn branch and returns the aborted result | `src/daemon/tools/__tests__/direct-spawn-tools-cancellation.test.ts` |
| pass | direct-spawn-tools-cancellation.test.ts: k8s logs follow: an abort kills the whole process group, settles within the bound, returns the usual aborted result and keeps the progress sent before | `src/daemon/tools/__tests__/direct-spawn-tools-cancellation.test.ts` |
| pass | direct-spawn-tools-cancellation.test.ts: k8s logs follow: its own time-out ceiling kills the group and keeps today's time-out wording | `src/daemon/tools/__tests__/direct-spawn-tools-cancellation.test.ts` |
| pass | direct-spawn-tools-cancellation.test.ts: k8s logs follow: an already-aborted signal takes the no-spawn branch and returns the aborted result | `src/daemon/tools/__tests__/direct-spawn-tools-cancellation.test.ts` |
| pass | direct-spawn-tools-cancellation.test.ts: k8s exec: an abort kills the whole process group, settles within the bound, returns the usual aborted result and keeps the progress sent before | `src/daemon/tools/__tests__/direct-spawn-tools-cancellation.test.ts` |
| pass | direct-spawn-tools-cancellation.test.ts: k8s exec: its own time-out ceiling kills the group and keeps today's time-out wording | `src/daemon/tools/__tests__/direct-spawn-tools-cancellation.test.ts` |
| pass | direct-spawn-tools-cancellation.test.ts: k8s exec: an already-aborted signal takes the no-spawn branch and returns the aborted result | `src/daemon/tools/__tests__/direct-spawn-tools-cancellation.test.ts` |
| pass | direct-spawn-tools-cancellation.test.ts: k8s port-forward: an abort kills the whole process group, settles within the bound, returns the usual aborted result and keeps the progress sent before | `src/daemon/tools/__tests__/direct-spawn-tools-cancellation.test.ts` |
| pass | direct-spawn-tools-cancellation.test.ts: k8s port-forward: its own time-out ceiling kills the group and keeps today's time-out wording | `src/daemon/tools/__tests__/direct-spawn-tools-cancellation.test.ts` |
| pass | direct-spawn-tools-cancellation.test.ts: k8s port-forward: an already-aborted signal takes the no-spawn branch and returns the aborted result | `src/daemon/tools/__tests__/direct-spawn-tools-cancellation.test.ts` |
| pass | direct-spawn-tools-cancellation.test.ts: test_watch: an abort kills the whole process group, settles within the bound, returns the usual aborted result and keeps the progress sent before | `src/daemon/tools/__tests__/direct-spawn-tools-cancellation.test.ts` |
| pass | direct-spawn-tools-cancellation.test.ts: test_watch: its own time-out ceiling kills the group and keeps today's time-out wording | `src/daemon/tools/__tests__/direct-spawn-tools-cancellation.test.ts` |
| pass | direct-spawn-tools-cancellation.test.ts: test_watch: an already-aborted signal takes the no-spawn branch and returns the aborted result | `src/daemon/tools/__tests__/direct-spawn-tools-cancellation.test.ts` |
| pass | direct-spawn-tools-cancellation.test.ts: ssh exec-detached: an abort kills the whole process group, settles within the bound, returns the usual aborted result and keeps the progress sent before | `src/daemon/tools/__tests__/direct-spawn-tools-cancellation.test.ts` |
| pass | direct-spawn-tools-cancellation.test.ts: ssh exec-detached: its own time-out ceiling kills the group and keeps today's time-out wording | `src/daemon/tools/__tests__/direct-spawn-tools-cancellation.test.ts` |
| pass | direct-spawn-tools-cancellation.test.ts: ssh exec-detached: an already-aborted signal takes the no-spawn branch and returns the aborted result | `src/daemon/tools/__tests__/direct-spawn-tools-cancellation.test.ts` |
| pass | direct-spawn-tools-cancellation.test.ts: ssh port-forward: an abort kills the whole process group, settles within the bound, returns the usual aborted result and keeps the progress sent before | `src/daemon/tools/__tests__/direct-spawn-tools-cancellation.test.ts` |
| pass | direct-spawn-tools-cancellation.test.ts: ssh port-forward: its own time-out ceiling kills the group and keeps today's time-out wording | `src/daemon/tools/__tests__/direct-spawn-tools-cancellation.test.ts` |
| pass | direct-spawn-tools-cancellation.test.ts: ssh port-forward: an already-aborted signal takes the no-spawn branch and returns the aborted result | `src/daemon/tools/__tests__/direct-spawn-tools-cancellation.test.ts` |
| pass | direct-spawn-tools-cancellation.test.ts: aws logs tail follow: an abort kills the whole process group, settles within the bound, returns the usual aborted result and keeps the progress sent before | `src/daemon/tools/__tests__/direct-spawn-tools-cancellation.test.ts` |
| pass | direct-spawn-tools-cancellation.test.ts: aws logs tail follow: its own time-out ceiling kills the group and keeps today's time-out wording | `src/daemon/tools/__tests__/direct-spawn-tools-cancellation.test.ts` |
| pass | direct-spawn-tools-cancellation.test.ts: aws logs tail follow: an already-aborted signal takes the no-spawn branch and returns the aborted result | `src/daemon/tools/__tests__/direct-spawn-tools-cancellation.test.ts` |

**unit: src/daemon/tools/__tests__/child-process-inventory.test.ts**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | child-process-inventory.test.ts: no file under src/daemon/tools other than shell-helper.ts imports node:child_process | `src/daemon/tools/__tests__/child-process-inventory.test.ts` |
| pass | child-process-inventory.test.ts: a temporary file that imports it in a temporary tree is reported by the same logic | `src/daemon/tools/__tests__/child-process-inventory.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `src/daemon/tools/__tests__/child-process-inventory.test.ts` | 0 | 2 | 0.4 s |  |
| `src/daemon/tools/__tests__/direct-spawn-tools-cancellation.test.ts` | 0 | 27 | 6.9 s |  |
| `src/daemon/tools/builtins/cloud/aws/__tests__/logs-parity.test.ts` | 0 | 3 | 0.9 s |  |
| `src/daemon/tools/builtins/k8s/__tests__/k8s-spawn-parity.test.ts` | 0 | 8 | 1.4 s |  |
| `src/daemon/tools/builtins/shell/__tests__/exec-detached-parity.test.ts` | 0 | 6 | 0.7 s |  |
| `src/daemon/tools/builtins/ssh/__tests__/ssh-spawn-parity.test.ts` | 0 | 4 | 1.1 s |  |
| `src/daemon/tools/builtins/test/__tests__/test-runner-parity.test.ts` | 0 | 3 | 0.8 s |  |

## t5

Run at 2026-10-26T19:15:44.175Z on commit `5b833ce89`. Tests check: **passed**. 11 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**unit: src/daemon/tools/__tests__/call-tool-identity.test.ts**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | call-tool-identity.test.ts, real tools: every exported git definition and every exported gh tool is the registered tool or a marked copy of it | `src/daemon/tools/__tests__/call-tool-identity.test.ts` |
| pass | call-tool-identity.test.ts, real tools: recorded runs of a git definition, five gh exports and a gh family, a plain registered tool and a twice-wrapped one run | `src/daemon/tools/__tests__/call-tool-identity.test.ts` |
| pass | call-tool-identity.test.ts, replacements: a spread replacement over the same id is refused, alone or behind a failure net, and its execute never runs | `src/daemon/tools/__tests__/call-tool-identity.test.ts` |
| pass | call-tool-identity.test.ts, replacements: an overwritten gh export is refused for the original export, an unregistered id is refused, and the signature is unchanged | `src/daemon/tools/__tests__/call-tool-identity.test.ts` |

**unit: src/daemon/tools/__tests__/provenance.test.ts**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | provenance.test.ts: markDefinition(copy, original) makes definitionOf(copy) the original | `src/daemon/tools/__tests__/provenance.test.ts` |
| pass | provenance.test.ts: a copy of a marked copy records its immediate original and isDefinitionOf reaches both levels | `src/daemon/tools/__tests__/provenance.test.ts` |
| pass | provenance.test.ts: an object made by spreading a marked copy is not marked, and neither is any other unmarked object | `src/daemon/tools/__tests__/provenance.test.ts` |
| pass | provenance.test.ts: a symbol or property copied by a spread does not mark an object | `src/daemon/tools/__tests__/provenance.test.ts` |
| pass | provenance.test.ts: the gh wrapper marks its copy from the object passed too | `src/daemon/tools/__tests__/provenance.test.ts` |
| pass | provenance.test.ts: a chain of 9 wrappers is not accepted for the first object (the 8-step bound) and a cycle ends in false | `src/daemon/tools/__tests__/provenance.test.ts` |
| pass | provenance.test.ts: marking does not change withFailureNet: an UnsafeArgError becomes a rejected failure and any other exception is rethrown | `src/daemon/tools/__tests__/provenance.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `src/daemon/tools/__tests__/call-tool-identity.test.ts` | 0 | 4 | 0.7 s |  |
| `src/daemon/tools/__tests__/provenance.test.ts` | 0 | 7 | 0.4 s |  |

## t6

Run at 2026-10-26T19:20:00.445Z on commit `170be4563`. Tests check: **passed**. 6 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**unit: src/daemon/tools/__tests__/typed-git-tools.test.ts**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | typed-git-tools.test.ts: the list and the tool files agree in both directions, ids are unique and the registered ids equal the list | `src/daemon/tools/__tests__/typed-git-tools.test.ts` |
| pass | typed-git-tools.test.ts: every listed tool declares typebox input and output schemas at run time | `src/daemon/tools/__tests__/typed-git-tools.test.ts` |
| pass | typed-git-tools.test.ts: a tool exported but not listed, and a listed object not exported by a tool file, are each reported by the same logic | `src/daemon/tools/__tests__/typed-git-tools.test.ts` |

**unit: src/daemon/tools/__tests__/typecheck-config.test.ts**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | typecheck-config.test.ts: the root tsconfig excludes the __type-tests__ directories, so no fixture is in the root program | `src/daemon/tools/__tests__/typecheck-config.test.ts` |
| pass | typecheck-config.test.ts: tsconfig.typecheck.json includes the fixtures with noEmit, the script runs it, and the build chain runs the script after tsc | `src/daemon/tools/__tests__/typecheck-config.test.ts` |

**unit: src/daemon/tools/__type-tests__/git-tools.typecheck.ts via npm run typecheck:tools**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | typecheck-config.test.ts: the fixtures compile, and an unused @ts-expect-error fails typecheck:tools | `src/daemon/tools/__tests__/typecheck-config.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `src/daemon/tools/__tests__/typecheck-config.test.ts` | 0 | 3 | 4.1 s |  |
| `src/daemon/tools/__tests__/typed-git-tools.test.ts` | 0 | 3 | 0.7 s |  |

## t7

Run at 2026-10-26T19:27:31.437Z on commit `7bdf69c17`. Tests check: **passed**. 27 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**unit: src/daemon/tools/builtins/git/__tests__/git-config.test.ts**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | git-config.test.ts: exit 0 gives found true with the value trimmed, including an empty value, and the argv is git config --get key | `src/daemon/tools/builtins/git/__tests__/git-config.test.ts` |
| pass | git-config.test.ts: exit 1 with empty stdout is a success with found false | `src/daemon/tools/builtins/git/__tests__/git-config.test.ts` |
| pass | git-config.test.ts: exit 128, and a spawn error, are failures with the kinds failureKind gives | `src/daemon/tools/builtins/git/__tests__/git-config.test.ts` |
| pass | git-config.test.ts: a key that is not dotted, or starts with -, is rejected by the schema before anything runs; ceiling and class | `src/daemon/tools/builtins/git/__tests__/git-config.test.ts` |

**unit: src/daemon/tools/builtins/git/__tests__/git-ls-remote.test.ts**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | git-ls-remote.test.ts: symref true with HEAD gives the symref and the HEAD entry; heads true with a branch pattern gives that head | `src/daemon/tools/builtins/git/__tests__/git-ls-remote.test.ts` |
| pass | git-ls-remote.test.ts: defaults are heads false, symref false and no patterns, and the argv is built from them | `src/daemon/tools/builtins/git/__tests__/git-ls-remote.test.ts` |
| pass | git-ls-remote.test.ts: an empty answer is a success with empty lists | `src/daemon/tools/builtins/git/__tests__/git-ls-remote.test.ts` |
| pass | git-ls-remote.test.ts: an unreachable remote is a failure with kind unreachable and git's text in the message | `src/daemon/tools/builtins/git/__tests__/git-ls-remote.test.ts` |
| pass | git-ls-remote.test.ts: an unsafe remote or pattern and nine patterns are rejected by the schema; ceiling and class | `src/daemon/tools/builtins/git/__tests__/git-ls-remote.test.ts` |

**unit: src/daemon/tools/builtins/git/__tests__/git-update-ref.test.ts**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | git-update-ref.test.ts: deletes a ref with argv git update-ref -d ref, returns {ref, deleted:true}, and an absent ref is a success | `src/daemon/tools/builtins/git/__tests__/git-update-ref.test.ts` |
| pass | git-update-ref.test.ts: delete false, a missing delete, a ref outside refs/, and a ref isSafeRefName refuses are rejected by the schema | `src/daemon/tools/builtins/git/__tests__/git-update-ref.test.ts` |
| pass | git-update-ref.test.ts: a ref with a non-ASCII letter, + or # is accepted | `src/daemon/tools/builtins/git/__tests__/git-update-ref.test.ts` |
| pass | git-update-ref.test.ts: the class is destructive and valid input always asks; a timed-out call says the outcome is unknown | `src/daemon/tools/builtins/git/__tests__/git-update-ref.test.ts` |

**unit: src/daemon/tools/builtins/git/__tests__/git-rm.test.ts**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | git-rm.test.ts: the argv is git rm -q --ignore-unmatch -- paths, quiet false drops -q, and the output is the paths | `src/daemon/tools/builtins/git/__tests__/git-rm.test.ts` |
| pass | git-rm.test.ts: a tracked path is removed, an untracked path succeeds, and a path starting with - is accepted | `src/daemon/tools/builtins/git/__tests__/git-rm.test.ts` |
| pass | git-rm.test.ts: empty paths, 201 paths and a path with a NUL are rejected by the schema | `src/daemon/tools/builtins/git/__tests__/git-rm.test.ts` |
| pass | git-rm.test.ts: the class is destructive, valid input always asks, and it runs in a worktree directory given as cwd | `src/daemon/tools/builtins/git/__tests__/git-rm.test.ts` |

**unit: src/daemon/tools/builtins/git/__tests__/git-safe-ref-equivalence.test.ts**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | git-safe-ref-equivalence.test.ts: the SAFE_REF schema pattern and isSafeRefName agree on one corpus of accepted and refused names | `src/daemon/tools/builtins/git/__tests__/git-safe-ref-equivalence.test.ts` |
| pass | git-safe-ref-equivalence.test.ts: every character class the predicate refuses is refused by the pattern too, one at a time | `src/daemon/tools/builtins/git/__tests__/git-safe-ref-equivalence.test.ts` |
| pass | git-safe-ref-equivalence.test.ts: SAFE_PATH refuses only a NUL | `src/daemon/tools/builtins/git/__tests__/git-safe-ref-equivalence.test.ts` |

**unit: src/daemon/tools/builtins/git/__tests__/git-unsafe-before-approval.test.ts**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | git-unsafe-before-approval.test.ts: unsafe input returns a rejected input failure and the approval gate is never called, with an approval subscriber attached | `src/daemon/tools/builtins/git/__tests__/git-unsafe-before-approval.test.ts` |
| pass | git-unsafe-before-approval.test.ts: unsafe input returns a rejected input failure and the approval gate is never called, with no subscriber attached | `src/daemon/tools/builtins/git/__tests__/git-unsafe-before-approval.test.ts` |

**unit: src/daemon/tools/builtins/git/__tests__/git-registration.test.ts**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | git-registration.test.ts: after registerGitTools, getTool finds the four new tools as marked withFailureNet copies and the exported definitions are unchanged | `src/daemon/tools/builtins/git/__tests__/git-registration.test.ts` |
| pass | git-registration.test.ts: executeTool runs each of the four through the registry | `src/daemon/tools/builtins/git/__tests__/git-registration.test.ts` |

**unit: src/daemon/tools/builtins/git/__tests__/git-coverage.test.ts**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | git_config, git_ls_remote, git_update_ref and git_rm are marked as built by s7 and are in gitToolDefinitions | `src/daemon/tools/builtins/git/__tests__/git-coverage.test.ts` |
| pass | every covered row's case runs through executeTool and matches its assertion | `src/daemon/tools/builtins/git/__tests__/git-coverage.test.ts` |
| pass | docs/daemon.md shows the coverage table | `src/daemon/tools/builtins/git/__tests__/git-coverage.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `src/daemon/tools/builtins/git/__tests__/git-config.test.ts` | 0 | 5 | 0.8 s |  |
| `src/daemon/tools/builtins/git/__tests__/git-coverage.test.ts` | 0 | 6 | 5.9 s |  |
| `src/daemon/tools/builtins/git/__tests__/git-ls-remote.test.ts` | 0 | 6 | 2.3 s |  |
| `src/daemon/tools/builtins/git/__tests__/git-registration.test.ts` | 0 | 2 | 0.7 s |  |
| `src/daemon/tools/builtins/git/__tests__/git-rm.test.ts` | 0 | 5 | 2.2 s |  |
| `src/daemon/tools/builtins/git/__tests__/git-safe-ref-equivalence.test.ts` | 0 | 3 | 0.6 s |  |
| `src/daemon/tools/builtins/git/__tests__/git-unsafe-before-approval.test.ts` | 0 | 2 | 0.7 s |  |
| `src/daemon/tools/builtins/git/__tests__/git-update-ref.test.ts` | 0 | 4 | 0.8 s |  |

## t8

Run at 2026-10-26T19:32:44.216Z on commit `1d0a73b17`. Tests check: **passed**. 15 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**unit: src/daemon/tools/builtins/gh/__tests__/gh-field-pattern.test.ts**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | gh-field-pattern.test.ts: fieldSchema of a string spec with a pattern carries it, and one without builds today's schema | `src/daemon/tools/builtins/gh/__tests__/gh-field-pattern.test.ts` |
| pass | gh-field-pattern.test.ts: field.name accepts octo-org, my.repo_1 and a.b, and rejects empty, dots, slashes, query characters, whitespace and non-ASCII | `src/daemon/tools/builtins/gh/__tests__/gh-field-pattern.test.ts` |
| pass | gh-field-pattern.test.ts: two ops that declare a shared field with different patterns make defineGhFamily throw, identical patterns and differing descriptions do not | `src/daemon/tools/builtins/gh/__tests__/gh-field-pattern.test.ts` |
| pass | gh-field-pattern.test.ts: through executeTool a bad owner returns a rejected input failure, the approval gate is not called and no gh command runs, with an approval subscriber attached | `src/daemon/tools/builtins/gh/__tests__/gh-field-pattern.test.ts` |
| pass | gh-field-pattern.test.ts: through executeTool a bad owner returns a rejected input failure, the approval gate is not called and no gh command runs, with no subscriber attached | `src/daemon/tools/builtins/gh/__tests__/gh-field-pattern.test.ts` |

**unit: src/daemon/tools/builtins/gh/__tests__/gh-op-table-args.test.ts**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | gh-op-table-args.test.ts: the path variant encodes a slash, question mark, hash, percent and Unicode in a field value and never splices it | `src/daemon/tools/builtins/gh/__tests__/gh-op-table-args.test.ts` |
| pass | gh-op-table-args.test.ts: the kv variant emits the flag and key=value, with repeat one pair per list member, and nothing for an absent field | `src/daemon/tools/builtins/gh/__tests__/gh-op-table-args.test.ts` |
| pass | gh-op-table-args.test.ts: path, kv, qs and the old variants combine in the order the op declares them | `src/daemon/tools/builtins/gh/__tests__/gh-op-table-args.test.ts` |
| pass | gh-op-table-args.test.ts: existing ops build exactly the argv the recorded table gives, and use none of the new variants | `src/daemon/tools/builtins/gh/__tests__/gh-op-table-args.test.ts` |

**unit: src/daemon/tools/builtins/gh/__tests__/gh-op-table-qs.test.ts**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | gh-op-table-qs.test.ts: the qs variant builds constants only, a constant then an optional field present or absent, and two constants then a list field joined by a comma | `src/daemon/tools/builtins/gh/__tests__/gh-op-table-qs.test.ts` |
| pass | gh-op-table-qs.test.ts: a value with & # / and Unicode is encoded and adds no key; every entry an absent optional field appends nothing, not even a question mark | `src/daemon/tools/builtins/gh/__tests__/gh-op-table-qs.test.ts` |
| pass | gh-op-table-qs.test.ts: a list field without join, a required field that is absent and a query without a path are refused | `src/daemon/tools/builtins/gh/__tests__/gh-op-table-qs.test.ts` |
| pass | gh-op-table-qs.test.ts: the complete argv of the three paginated ops is api --paginate, the positional, then -q and a fixed filter that no input can change | `src/daemon/tools/builtins/gh/__tests__/gh-op-table-qs.test.ts` |
| pass | gh-op-table-qs.test.ts: the positionals equal the argv the tracker wrappers in src/workflow/tracker/github.ts send for the same inputs | `src/daemon/tools/builtins/gh/__tests__/gh-op-table-qs.test.ts` |
| pass | gh-op-table-qs.test.ts: parseJsonLines returns the values in order across pages, skips blank lines, reads empty output as an empty list and reports the first bad line | `src/daemon/tools/builtins/gh/__tests__/gh-op-table-qs.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `src/daemon/tools/builtins/gh/__tests__/gh-field-pattern.test.ts` | 0 | 5 | 0.7 s |  |
| `src/daemon/tools/builtins/gh/__tests__/gh-op-table-args.test.ts` | 0 | 5 | 0.6 s |  |
| `src/daemon/tools/builtins/gh/__tests__/gh-op-table-qs.test.ts` | 0 | 6 | 0.5 s |  |

## t9

Run at 2026-10-26T19:41:25.313Z on commit `b566aa7f7`. Tests check: **passed**. 16 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**unit: src/daemon/tools/builtins/gh/__tests__/gh-tracker-family.test.ts**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | gh-tracker-family.test.ts: each of the 15 ops builds its exact argv, accepts its input schema, returns the data of the fixture that fits its output schema, and has its class and limit | `src/daemon/tools/builtins/gh/__tests__/gh-tracker-family.test.ts` |
| pass | gh-tracker-family.test.ts: owner, repo and org are name fields and numbers are positive integers; a bad value is refused by the input schema | `src/daemon/tools/builtins/gh/__tests__/gh-tracker-family.test.ts` |
| pass | gh-tracker-family.test.ts: the three paginated ops return every page in API order (more than 100 items), pull requests are absent, empty output is an empty list, blank lines are skipped and a malformed line is a rejected failure naming its line | `src/daemon/tools/builtins/gh/__tests__/gh-tracker-family.test.ts` |
| pass | gh-tracker-family.test.ts: the paginated ops return the same items as the tracker wrappers do for the same gh output | `src/daemon/tools/builtins/gh/__tests__/gh-tracker-family.test.ts` |
| pass | gh-tracker-family.test.ts: tasks_query returns pageInfo { hasNextPage: false } without endCursor when the API gives none, keeps a non-empty endCursor with hasNextPage false, and returns issueCount only when it is a number; it matches queryTasks | `src/daemon/tools/builtins/gh/__tests__/gh-tracker-family.test.ts` |
| pass | gh-tracker-family.test.ts: project_create returns {number, url} for the JSON ghCreateProject reads and a rejected failure for a missing or non-numeric number and for non-JSON output | `src/daemon/tools/builtins/gh/__tests__/gh-tracker-family.test.ts` |
| pass | gh-tracker-family.test.ts: the other single-object ops reject an answer that lacks what they must return | `src/daemon/tools/builtins/gh/__tests__/gh-tracker-family.test.ts` |

**unit: src/daemon/tools/builtins/gh/__tests__/gh-tracker-registration.test.ts**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | gh-tracker-registration.test.ts: after registerGhTools, getTool finds gh_tracker and executeTool runs one op of it through the registry | `src/daemon/tools/builtins/gh/__tests__/gh-tracker-registration.test.ts` |
| pass | gh-tracker-registration.test.ts: callTool of the exported gh_tracker object runs | `src/daemon/tools/builtins/gh/__tests__/gh-tracker-registration.test.ts` |

**unit: src/daemon/tools/builtins/gh/__tests__/gh-tracker-diagnostic.test.ts**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | gh-tracker-diagnostic.test.ts: issue_create_typed on an HTTP 422 that names issue types returns a rejected failure whose failure.original is the exact trimmed API text | `src/daemon/tools/builtins/gh/__tests__/gh-tracker-diagnostic.test.ts` |
| pass | gh-tracker-diagnostic.test.ts: a diagnostic text of 5000 characters is cut to 4000 in failure.original by the seam and failure.message is unchanged | `src/daemon/tools/builtins/gh/__tests__/gh-tracker-diagnostic.test.ts` |
| pass | gh-tracker-diagnostic.test.ts: the same 422 from an existing gh tool still has no failure.original, and a spawn error from the same op and from an existing tool still has failure.original equal to the trimmed stderr | `src/daemon/tools/builtins/gh/__tests__/gh-tracker-diagnostic.test.ts` |

**unit: src/daemon/tools/builtins/gh/__tests__/gh-tracker-mapped-ops.test.ts**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | gh-tracker-mapped-ops.test.ts: every mapped wrapper gets, from the existing op, the success and the fields it reads | `src/daemon/tools/builtins/gh/__tests__/gh-tracker-mapped-ops.test.ts` |
| pass | gh-tracker-mapped-ops.test.ts: no mapped wrapper is served by the tracker family, and the family holds exactly its fifteen ops | `src/daemon/tools/builtins/gh/__tests__/gh-tracker-mapped-ops.test.ts` |

**unit: src/daemon/tools/builtins/gh/__tests__/gh-coverage.test.ts**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | gh-coverage.test.ts: every installed gh command has a GH_COVERAGE row, covered rows name registered tools and ops, excluded rows have a reason, and all 69 tools are registered (68 that serve a gh command and gh_tracker) | `src/daemon/tools/builtins/gh/__tests__/gh-coverage.test.ts` |
| pass | gh-coverage.test.ts: the coverage table names the tracker family as s7's amendment and keeps raw gh api excluded | `src/daemon/tools/builtins/gh/__tests__/gh-coverage.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `src/daemon/tools/builtins/gh/__tests__/gh-coverage.test.ts` | 0 | 2 | 4.6 s |  |
| `src/daemon/tools/builtins/gh/__tests__/gh-tracker-diagnostic.test.ts` | 0 | 3 | 0.7 s |  |
| `src/daemon/tools/builtins/gh/__tests__/gh-tracker-family.test.ts` | 0 | 7 | 0.9 s |  |
| `src/daemon/tools/builtins/gh/__tests__/gh-tracker-mapped-ops.test.ts` | 0 | 2 | 0.6 s |  |
| `src/daemon/tools/builtins/gh/__tests__/gh-tracker-registration.test.ts` | 0 | 2 | 0.6 s |  |

## t10

Run at 2026-10-26T19:51:16.441Z on commit `4bffb5951`. Tests check: **passed**. 19 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**integration: src/daemon/tools/__tests__/call-handler.test.ts**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | call-handler.test.ts: invalid params (an invalid caller, a missing field, a non-object input) give one error frame and run nothing | `src/daemon/tools/__tests__/call-handler.test.ts` |
| pass | call-handler.test.ts: one done frame carries the ToolResult, and an unknown tool is a done frame with a rejected failure, not an error | `src/daemon/tools/__tests__/call-handler.test.ts` |
| pass | call-handler.test.ts: ToolDeps carry the validated params and sessionId tools-call: plus the connection identity, or tools-call without a context | `src/daemon/tools/__tests__/call-handler.test.ts` |
| pass | call-handler.test.ts: no approval.subscribe client denies a destructive call with no-client and the done frame carries the denial | `src/daemon/tools/__tests__/call-handler.test.ts` |
| pass | call-handler.test.ts: closing the stream aborts the signal and resolves a pending approval as cancelled | `src/daemon/tools/__tests__/call-handler.test.ts` |
| pass | call-handler.test.ts: a registered hook runs for a tools.call with caller workflow as for agent, and runs outside the signal context | `src/daemon/tools/__tests__/call-handler.test.ts` |

**integration: src/daemon/tools/__tests__/call-tool-workflow.test.ts**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | call-tool-workflow.test.ts: a rule registered on a tool runs for a callTool call with caller workflow as for agent | `src/daemon/tools/__tests__/call-tool-workflow.test.ts` |
| pass | call-tool-workflow.test.ts: callTool with caller workflow runs the hook, honours manual and edit-auto for a common tool and always asks for a destructive one | `src/daemon/tools/__tests__/call-tool-workflow.test.ts` |
| pass | call-tool-workflow.test.ts: a destructive callTool with a gate that times out returns a denied failure and the caller does not continue | `src/daemon/tools/__tests__/call-tool-workflow.test.ts` |

**integration: src/daemon/tools/__tests__/tools-call-cancellation.test.ts**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | tools-call-cancellation.test.ts, git_diff: closing the stream kills the stand-in tree and settles within the bound although git_diff forwards no signal | `src/daemon/tools/__tests__/tools-call-cancellation.test.ts` |
| pass | tools-call-cancellation.test.ts, legacy gh export: closing the stream kills the stand-in gh tree and settles within the bound | `src/daemon/tools/__tests__/tools-call-cancellation.test.ts` |
| pass | tools-call-cancellation.test.ts, auth probe: closing the stream while the probe runs kills the probe tree and no further gh process starts | `src/daemon/tools/__tests__/tools-call-cancellation.test.ts` |
| pass | tools-call-cancellation.test.ts, multi-command tool: git_show stopped in its second command never starts the third | `src/daemon/tools/__tests__/tools-call-cancellation.test.ts` |
| pass | tools-call-cancellation.test.ts, approval preview: closing the stream while the preview of git_push (no ref) runs kills its tree, and no approval request reaches the subscriber | `src/daemon/tools/__tests__/tools-call-cancellation.test.ts` |
| pass | tools-call-cancellation.test.ts, nested approval wait: closing the stream resolves the nested approval as cancelled at once and the nested call returns the cancelled denial | `src/daemon/tools/__tests__/tools-call-cancellation.test.ts` |
| pass | tools-call-cancellation.test.ts, nested subprocess: closing the stream kills the subprocess of a second tool called without a signal | `src/daemon/tools/__tests__/tools-call-cancellation.test.ts` |
| pass | tools-call-cancellation.test.ts, pending approval and not-started tool: closing the stream resolves a pending approval as cancelled and the tool never starts | `src/daemon/tools/__tests__/tools-call-cancellation.test.ts` |

**integration: src/daemon/threads/__tests__/method-class.test.ts**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | tools.call is classed session and stream, and equals the handler table | `src/daemon/threads/__tests__/method-class.test.ts` |
| pass | coverage: the method set equals the keys of the constructed rpcHandlers and streamHandlers after all merges, failing on a missing or a stale entry | `src/daemon/threads/__tests__/method-class.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `src/daemon/threads/__tests__/method-class.test.ts` | 0 | 4 | 0.9 s |  |
| `src/daemon/tools/__tests__/call-handler.test.ts` | 0 | 8 | 0.5 s |  |
| `src/daemon/tools/__tests__/call-tool-workflow.test.ts` | 0 | 3 | 0.6 s |  |
| `src/daemon/tools/__tests__/tools-call-cancellation.test.ts` | 0 | 8 | 2.4 s |  |

## t11

Run at 2026-10-26T19:54:50.132Z on commit `620f63423`. Tests check: **passed**. 5 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**unit: scripts/__tests__/forbidden-spawn-scan.test.ts**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | forbidden-spawn-scan.test.ts: one positive-control fixture per form is reported with its file, line and form | `scripts/__tests__/forbidden-spawn-scan.test.ts` |
| pass | forbidden-spawn-scan.test.ts: the three exemptions are listed with their reasons and are not violations | `scripts/__tests__/forbidden-spawn-scan.test.ts` |
| pass | forbidden-spawn-scan.test.ts: report mode exits 0 and failing mode exits 1 over the same sites | `scripts/__tests__/forbidden-spawn-scan.test.ts` |
| pass | forbidden-spawn-scan.test.ts: an unparseable file is listed as unscanned and exits non-zero even in report mode | `scripts/__tests__/forbidden-spawn-scan.test.ts` |
| pass | forbidden-spawn-scan.test.ts: a run over src lists the direct gitDiffTool.execute calls in grounding.ts and changed-files.ts and parses every file | `scripts/__tests__/forbidden-spawn-scan.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `scripts/__tests__/forbidden-spawn-scan.test.ts` | 0 | 6 | 8.7 s |  |

## t12

Run at 2026-10-26T19:56:53.629Z on commit `aebb5d868`. Tests check: **passed**. 2 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**unit: src/daemon/tools/builtins/gh/__tests__/gh-coverage.test.ts**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | gh-coverage.test.ts: the plan note lists the tools s7 built, marks the callTool prerequisite done and states the s9 and s10 hand-over | `src/daemon/tools/builtins/gh/__tests__/gh-coverage.test.ts` |
| pass | gh-coverage.test.ts: the coverage table names the tracker family as s7's amendment and keeps raw gh api excluded | `src/daemon/tools/builtins/gh/__tests__/gh-coverage.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `src/daemon/tools/builtins/gh/__tests__/gh-coverage.test.ts` | 0 | 3 | 4.4 s |  |
