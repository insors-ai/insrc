<!-- insrc:artifact TESTS-b7a68147dcf72034-s1 -->

# Tests: b7a68147dcf72034 s1

What the build validation gate ran for each Task of this Story, and what each test case did. The gate runs the tests itself; a result here is never a builder's statement unless it says so. `not found` means no test of that title ran in that file.

**Totals:** 22 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

## t1

Run at 2026-10-24T14:28:01.568Z on commit `42a9aadc8`. Tests check: **passed**. 1 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**unit: src/daemon/tools/__tests__/tool-hooks.test.ts: HookFailure report shape**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | tool-hooks.test.ts: HookFailure report shape | `src/daemon/tools/__tests__/tool-hooks.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `src/daemon/tools/__tests__/tool-hooks.test.ts` | 0 | 1 | 0.4 s |  |

## t2

Run at 2026-10-24T14:30:25.345Z on commit `4c90e9c58`. Tests check: **passed**. 6 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**unit: src/daemon/tools/__tests__/tool-hooks.test.ts: registerToolHook appends in order and refuses a duplicate toolId+id and an empty id or toolId**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | tool-hooks.test.ts: registerToolHook appends in order and refuses a duplicate toolId+id and an empty id or toolId | `src/daemon/tools/__tests__/tool-hooks.test.ts` |

**unit: src/daemon/tools/__tests__/tool-hooks.test.ts: registerToolHook refuses an alias in place of a canonical id**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | tool-hooks.test.ts: registerToolHook refuses an alias in place of a canonical id | `src/daemon/tools/__tests__/tool-hooks.test.ts` |

**unit: src/daemon/tools/__tests__/tool-hooks.test.ts: runToolHooks runs hooks one at a time**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | tool-hooks.test.ts: runToolHooks runs hooks one at a time | `src/daemon/tools/__tests__/tool-hooks.test.ts` |

**unit: src/daemon/tools/__tests__/tool-hooks.test.ts: runToolHooks catches a throw or rejection, cuts a long message to 500 characters and gives each hook its own structuredClone of input and result**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | tool-hooks.test.ts: runToolHooks catches a throw or rejection, cuts a long message to 500 characters and gives each hook its own structuredClone of input and result | `src/daemon/tools/__tests__/tool-hooks.test.ts` |

**unit: src/daemon/tools/__tests__/tool-hooks.test.ts: failure text for a null-prototype object, a value with a throwing toString and an empty message falls back to a fixed non-empty text, and building it does not throw**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | tool-hooks.test.ts: failure text for a null-prototype object, a value with a throwing toString and an empty message falls back to a fixed non-empty text, and building it does not throw | `src/daemon/tools/__tests__/tool-hooks.test.ts` |

**unit: src/daemon/tools/__tests__/tool-hooks.test.ts: a hook that mutates nested result.data, with and without then throwing, leaves the caller's result untouched; a result that cannot be cloned reports that hook as failed and still runs the rest**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | tool-hooks.test.ts: a hook that mutates nested result.data, with and without then throwing, leaves the caller's result untouched; a result that cannot be cloned reports that hook as failed and still runs the rest | `src/daemon/tools/__tests__/tool-hooks.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `src/daemon/tools/__tests__/tool-hooks.test.ts` | 0 | 7 | 0.5 s |  |

## t3

Run at 2026-10-24T14:32:56.760Z on commit `620fe6278`. Tests check: **passed**. 8 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**integration: src/daemon/tools/__tests__/tool-hooks.test.ts: a registered rule runs once after a successful call for each caller (agent, daemon, workflow, unset)**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | tool-hooks.test.ts: a registered rule runs once after a successful call for each caller (agent, daemon, workflow, unset) | `src/daemon/tools/__tests__/tool-hooks.test.ts` |

**integration: src/daemon/tools/__tests__/tool-hooks.test.ts: a tool with no outputSchema still runs its rules**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | tool-hooks.test.ts: a tool with no outputSchema still runs its rules | `src/daemon/tools/__tests__/tool-hooks.test.ts` |

**integration: src/daemon/tools/__tests__/tool-hooks.test.ts: a tool called through an alias runs the canonical id's rule exactly once**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | tool-hooks.test.ts: a tool called through an alias runs the canonical id's rule exactly once | `src/daemon/tools/__tests__/tool-hooks.test.ts` |

**integration: src/daemon/tools/__tests__/tool-hooks.test.ts: a failing rule leaves the result a success and reports the failure on hookFailures and in the output text**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | tool-hooks.test.ts: a failing rule leaves the result a success and reports the failure on hookFailures and in the output text | `src/daemon/tools/__tests__/tool-hooks.test.ts` |

**integration: src/daemon/tools/__tests__/tool-hooks.test.ts: a failed, denied, rejected or schema-mismatch call runs no rule**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | tool-hooks.test.ts: a failed, denied, rejected or schema-mismatch call runs no rule | `src/daemon/tools/__tests__/tool-hooks.test.ts` |

**integration: src/daemon/tools/__tests__/tool-hooks.test.ts: rules run in registration order and a failing rule does not stop the next**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | tool-hooks.test.ts: rules run in registration order and a failing rule does not stop the next | `src/daemon/tools/__tests__/tool-hooks.test.ts` |

**integration: src/daemon/tools/__tests__/tool-hooks.test.ts: a call with no rule returns the object the tool returned**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | tool-hooks.test.ts: a call with no rule returns the object the tool returned | `src/daemon/tools/__tests__/tool-hooks.test.ts` |
| pass | executor-approval.test.ts: a declined call returns a denied failure with reason declined and execute is never called | `src/daemon/tools/__tests__/executor-approval.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `src/daemon/tools/__tests__/executor-approval.test.ts` | 0 | 7 | 0.5 s |  |
| `src/daemon/tools/__tests__/tool-hooks.test.ts` | 0 | 14 | 0.4 s |  |

## t4

Run at 2026-10-24T14:34:20.880Z on commit `397c98cde`. Tests check: **passed**. 3 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**integration: src/daemon/tools/__tests__/tool-hooks.test.ts: callTool carries hookFailures onto the typed success result**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | tool-hooks.test.ts: callTool carries hookFailures onto the typed success result | `src/daemon/tools/__tests__/tool-hooks.test.ts` |

**integration: src/daemon/tools/__tests__/tool-hooks.test.ts: callTool omits hookFailures when nothing failed**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | tool-hooks.test.ts: callTool omits hookFailures when nothing failed | `src/daemon/tools/__tests__/tool-hooks.test.ts` |
| pass | call-tool.test.ts: the runtime values of the fake definitions are what the types say | `src/daemon/tools/__tests__/call-tool.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `src/daemon/tools/__tests__/call-tool.test.ts` | 0 | 2 | 0.6 s |  |
| `src/daemon/tools/__tests__/tool-hooks.test.ts` | 0 | 16 | 0.5 s |  |

## t5

Run at 2026-10-24T14:36:37.028Z on commit `258f72fbb`. Tests check: **passed**. 4 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**integration: src/daemon/tools/__tests__/tool-hooks.test.ts: a rule that throws a null-prototype object or a value with a throwing toString is reported with a fixed text**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | tool-hooks.test.ts: a rule that throws a null-prototype object or a value with a throwing toString is reported with a fixed text | `src/daemon/tools/__tests__/tool-hooks.test.ts` |

**integration: src/daemon/tools/__tests__/tool-hooks.test.ts: a rule that mutates nested result data leaves the caller's result untouched**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | tool-hooks.test.ts: a rule that mutates nested result data leaves the caller's result untouched | `src/daemon/tools/__tests__/tool-hooks.test.ts` |

**integration: src/daemon/tools/__tests__/approval-class-mapping.test.ts: the tool snapshot is unchanged**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | approval-class-mapping.test.ts: the tool ids and input schemas match the snapshot taken before the rewrite | `src/daemon/tools/__tests__/approval-class-mapping.test.ts` |

**integration: src/agent/__tests__/read-only-tool-loop.test.ts: the read-only tool loop still returns the tool's output text unchanged when no rule is registered**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | read-only-tool-loop.test.ts: the read-only tool loop still returns the tool's output text unchanged when no rule is registered | `src/agent/__tests__/read-only-tool-loop.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `src/agent/__tests__/read-only-tool-loop.test.ts` | 0 | 1 | 0.5 s |  |
| `src/daemon/tools/__tests__/approval-class-mapping.test.ts` | 0 | 4 | 0.6 s |  |
| `src/daemon/tools/__tests__/tool-hooks.test.ts` | 0 | 18 | 0.4 s |  |
