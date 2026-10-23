<!-- insrc:artifact TESTS-b7a68147dcf72034-s2 -->

# Tests: b7a68147dcf72034 s2

What the build validation gate ran for each Task of this Story, and what each test case did. The gate runs the tests itself; a result here is never a builder's statement unless it says so. `not found` means no test of that title ran in that file.

**Totals:** 34 pass, 0 fail, 0 skipped, 0 not found; 2 reported by the builder and not run by the gate.

## t1

Run at 2026-10-23T12:39:41.311Z on commit `5c29e577`. Tests check: **passed**. 1 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**unit: src/daemon/tools/__tests__/failure-types.test.ts: ToolDenialReason and ToolFailureKind hold exactly the declared values**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | failure-types.test.ts: ToolDenialReason and ToolFailureKind hold exactly the declared values | `src/daemon/tools/__tests__/failure-types.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `src/daemon/tools/__tests__/failure-types.test.ts` | 0 | 1 | 1 s |  |

## t2

Run at 2026-10-23T12:42:31.078Z on commit `e75d2938`. Tests check: **passed**. 2 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**integration: src/daemon/tools/__tests__/conversion-roles.test.ts: the two new roles resolve through the real RoleRouter and role taxonomy, and the coreFloor does not clamp them**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | conversion-roles.test.ts: the two new roles resolve through the real RoleRouter and role taxonomy, and the coreFloor does not clamp them | `src/daemon/tools/__tests__/conversion-roles.test.ts` |

**unit: src/daemon/tools/__tests__/conversion-roles.test.ts: the helper returns a provider for each role from a test config**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | conversion-roles.test.ts: the helper returns a provider for each role from a test config | `src/daemon/tools/__tests__/conversion-roles.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `src/daemon/tools/__tests__/conversion-roles.test.ts` | 0 | 2 | 1.4 s |  |

## t3

Run at 2026-10-23T12:46:24.164Z on commit `ac075e53`. Tests check: **passed**. 9 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**unit: src/daemon/tools/__tests__/output-schema.test.ts: valid input and valid data on a schematized tool pass through unchanged after the checks**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | output-schema.test.ts: valid input and valid data on a schematized tool pass through unchanged after the checks | `src/daemon/tools/__tests__/output-schema.test.ts` |

**unit: src/daemon/tools/__tests__/output-schema.test.ts: the check runs before the result is returned to the caller**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | output-schema.test.ts: the check runs before the result is returned to the caller | `src/daemon/tools/__tests__/output-schema.test.ts` |

**unit: src/daemon/tools/__tests__/output-schema.test.ts: input that does not fit the inputSchema returns rejected and the tool is not run**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | output-schema.test.ts: input that does not fit the inputSchema returns rejected and the tool is not run | `src/daemon/tools/__tests__/output-schema.test.ts` |

**unit: src/daemon/tools/__tests__/output-schema.test.ts: data that does not fit returns schema-mismatch with the failing paths named, and data dropped**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | output-schema.test.ts: data that does not fit returns schema-mismatch with the failing paths named, and data dropped | `src/daemon/tools/__tests__/output-schema.test.ts` |

**unit: src/daemon/tools/__tests__/output-schema.test.ts: success without data on a schematized tool returns schema-mismatch**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | output-schema.test.ts: success without data on a schematized tool returns schema-mismatch | `src/daemon/tools/__tests__/output-schema.test.ts` |

**unit: src/daemon/tools/__tests__/output-schema.test.ts: a failed result is not validated and passes through**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | output-schema.test.ts: a failed result is not validated and passes through | `src/daemon/tools/__tests__/output-schema.test.ts` |

**unit: src/daemon/tools/__tests__/output-schema.test.ts: a tool with no outputSchema is run and returned exactly as today, with its input unchecked**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | output-schema.test.ts: a tool with no outputSchema is run and returned exactly as today, with its input unchecked | `src/daemon/tools/__tests__/output-schema.test.ts` |

**unit: src/daemon/tools/__tests__/output-schema.test.ts: a thrown error and an invalid schema each return a typed failure**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | output-schema.test.ts: a thrown error and an invalid schema each return a typed failure | `src/daemon/tools/__tests__/output-schema.test.ts` |

**integration: src/daemon/tools/__tests__/agent-loop-unchanged.test.ts: the agent loop path still receives output, success and error for a schematized tool and for a tool without a schema**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | agent-loop-unchanged.test.ts: the agent loop path still receives output, success and error for a schematized tool and for a tool without a schema | `src/daemon/tools/__tests__/agent-loop-unchanged.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `src/daemon/tools/__tests__/agent-loop-unchanged.test.ts` | 0 | 1 | 1 s |  |
| `src/daemon/tools/__tests__/output-schema.test.ts` | 0 | 9 | 0.9 s |  |

## t4

Run at 2026-10-23T12:48:26.134Z on commit `be889694`. Tests check: **passed**. 4 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**unit: src/daemon/tools/__tests__/cross-check.test.ts: key-value matching normalises whitespace and case and drops surrounding quotes**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | cross-check.test.ts: key-value matching normalises whitespace and case and drops surrounding quotes | `src/daemon/tools/__tests__/cross-check.test.ts` |

**unit: src/daemon/tools/__tests__/cross-check.test.ts: an alphanumeric key value matches on token boundaries, so '12' is not found in '123'**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | cross-check.test.ts: an alphanumeric key value matches on token boundaries, so '12' is not found in '123' | `src/daemon/tools/__tests__/cross-check.test.ts` |

**unit: src/daemon/tools/__tests__/cross-check.test.ts: an empty keyValues result is accepted on schema alone**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | cross-check.test.ts: an empty keyValues result is accepted on schema alone | `src/daemon/tools/__tests__/cross-check.test.ts` |

**unit: src/daemon/tools/__tests__/cross-check.test.ts: the missing values are returned by name**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | cross-check.test.ts: the missing values are returned by name | `src/daemon/tools/__tests__/cross-check.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `src/daemon/tools/__tests__/cross-check.test.ts` | 0 | 4 | 3.4 s |  |

## t5

Run at 2026-10-23T12:51:42.716Z on commit `3119245b`. Tests check: **passed**. 11 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**unit: src/daemon/tools/__tests__/convert-text.test.ts: a first-attempt valid value on the cheap tier returns ok with tier cheap and no escalation**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | convert-text.test.ts: a first-attempt valid value on the cheap tier returns ok with tier cheap and no escalation | `src/daemon/tools/__tests__/convert-text.test.ts` |

**unit: src/daemon/tools/__tests__/convert-text.test.ts: an invalid first attempt is retried with the ajv errors appended**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | convert-text.test.ts: an invalid first attempt is retried with the ajv errors appended | `src/daemon/tools/__tests__/convert-text.test.ts` |

**unit: src/daemon/tools/__tests__/convert-text.test.ts: two failed cheap attempts escalate once, and two failed escalated attempts return retries-exhausted**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | convert-text.test.ts: two failed cheap attempts escalate once, and two failed escalated attempts return retries-exhausted | `src/daemon/tools/__tests__/convert-text.test.ts` |

**unit: src/daemon/tools/__tests__/convert-text.test.ts: the fake provider sees exactly 2 calls on the cheap role then 2 on the escalate role when every attempt fails, and exactly 1 call on first-attempt success**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | convert-text.test.ts: the fake provider sees exactly 2 calls on the cheap role then 2 on the escalate role when every attempt fails, and exactly 1 call on first-attempt success | `src/daemon/tools/__tests__/convert-text.test.ts` |

**unit: src/daemon/tools/__tests__/convert-text.test.ts: a value that fits the schema but has a key value missing from the raw text fails with value-not-in-text and retries**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | convert-text.test.ts: a value that fits the schema but has a key value missing from the raw text fails with value-not-in-text and retries | `src/daemon/tools/__tests__/convert-text.test.ts` |

**unit: src/daemon/tools/__tests__/convert-text.test.ts: two concurrent calls reach the fake provider one after another, in arrival order**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | convert-text.test.ts: two concurrent calls reach the fake provider one after another, in arrival order | `src/daemon/tools/__tests__/convert-text.test.ts` |

**unit: src/daemon/tools/__tests__/convert-text.test.ts: a ToolDeps with no conversion field returns 'no conversion provider configured' without a model call**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | convert-text.test.ts: a ToolDeps with no conversion field returns 'no conversion provider configured' without a model call | `src/daemon/tools/__tests__/convert-text.test.ts` |

**unit: src/daemon/tools/__tests__/convert-text.test.ts: a provider that rejects on every attempt returns retries-exhausted naming the role, with no fallback**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | convert-text.test.ts: a provider that rejects on every attempt returns retries-exhausted naming the role, with no fallback | `src/daemon/tools/__tests__/convert-text.test.ts` |

**unit: src/daemon/tools/__tests__/convert-text.test.ts: a hung provider call times out as an ordinary error, is retried, and releases the queue slot**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | convert-text.test.ts: a hung provider call times out as an ordinary error, is retried, and releases the queue slot | `src/daemon/tools/__tests__/convert-text.test.ts` |

**unit: src/daemon/tools/__tests__/convert-text.test.ts: an aborted deps.signal drops a queued conversion without calling a provider and ends a running one as 'cancelled'**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | convert-text.test.ts: an aborted deps.signal drops a queued conversion without calling a provider and ends a running one as 'cancelled' | `src/daemon/tools/__tests__/convert-text.test.ts` |

**unit: src/daemon/tools/__tests__/convert-text.test.ts: an InputTooLargeError from the provider returns retries-exhausted with 'input too large' and is not resent**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | convert-text.test.ts: an InputTooLargeError from the provider returns retries-exhausted with 'input too large' and is not resent | `src/daemon/tools/__tests__/convert-text.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `src/daemon/tools/__tests__/convert-text.test.ts` | 0 | 11 | 1.3 s |  |

## t6

Run at 2026-10-23T12:55:02.301Z on commit `a7191841`. Tests check: **passed**. 2 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**unit: src/daemon/tools/__tests__/call-tool.test.ts: the runtime values of the fake definitions are what the types say**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | call-tool.test.ts: the runtime values of the fake definitions are what the types say | `src/daemon/tools/__tests__/call-tool.test.ts` |

**unit: src/daemon/tools/__tests__/call-tool.test.ts: TypedToolResult data is absent when success is false**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | call-tool.test.ts: TypedToolResult data is absent when success is false | `src/daemon/tools/__tests__/call-tool.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `src/daemon/tools/__tests__/call-tool.test.ts` | 0 | 2 | 2.3 s |  |

## t7

Run at 2026-10-23T12:57:09.830Z on commit `81655c2e`. Tests check: **passed**. 1 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**unit: src/daemon/tools/__tests__/failure-mapping.test.ts: each ToolFailureKind maps onto a PortFailureKind, one test per kind**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | failure-mapping.test.ts: each ToolFailureKind maps onto a PortFailureKind, one test per kind | `src/daemon/tools/__tests__/failure-mapping.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `src/daemon/tools/__tests__/failure-mapping.test.ts` | 0 | 9 | 1.5 s |  |

## t8

Run at 2026-10-23T13:02:23.867Z on commit `c0e11db2`. Tests check: **passed**. 4 pass, 0 fail, 0 skipped, 0 not found; 2 reported by the builder and not run by the gate.

**integration: src/daemon/tools/__tests__/call-tool.integration.test.ts: a tool with structured output called through callTool returns typed data**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | call-tool.integration.test.ts: a tool with structured output called through callTool returns typed data | `src/daemon/tools/__tests__/call-tool.integration.test.ts` |

**integration: src/daemon/tools/__tests__/call-tool.integration.test.ts: a tool with structured output called through callTool leaves the fake provider log empty**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | call-tool.integration.test.ts: a tool with structured output called through callTool leaves the fake provider log empty | `src/daemon/tools/__tests__/call-tool.integration.test.ts` |

**integration: src/daemon/tools/__tests__/call-tool.integration.test.ts: a text-only tool called through callTool converts, checks and returns typed data**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | call-tool.integration.test.ts: a text-only tool called through callTool converts, checks and returns typed data | `src/daemon/tools/__tests__/call-tool.integration.test.ts` |

**integration: src/daemon/tools/__tests__/call-tool.integration.test.ts: a text-only tool whose conversion fails returns a conversion-failed ToolFailure with the raw text in failure.original**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | call-tool.integration.test.ts: a text-only tool whose conversion fails returns a conversion-failed ToolFailure with the raw text in failure.original | `src/daemon/tools/__tests__/call-tool.integration.test.ts` |

**live: src/daemon/tools/__tests__/convert-text.live.test.ts: convertText on captured gh and git text-only outputs returns values whose key values are in the text**

Reported by the builder, not run by the gate: **pass**. Evidence: docs/epics/one-tool-registry-git-gh-jira-E20261023b7a68147/S002/LIVE-convert-text.txt (run with INSRC_LIVE_TESTS=1, 49 s, real cheap-tier CLI model)

**live: src/daemon/tools/__tests__/convert-text.live.test.ts: a deliberately altered output fails the cross-check**

Reported by the builder, not run by the gate: **pass**. Evidence: docs/epics/one-tool-registry-git-gh-jira-E20261023b7a68147/S002/LIVE-convert-text.txt (same run; the escalation tier also returned a claude envelope error, noted there)

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `src/daemon/tools/__tests__/call-tool.integration.test.ts` | 0 | 4 | 1.3 s |  |
