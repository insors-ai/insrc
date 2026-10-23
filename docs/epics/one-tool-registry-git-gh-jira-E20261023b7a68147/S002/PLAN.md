<!-- insrc:artifact PLAN-b7a68147dcf72034-s2 -->

# Plan: STORY-b7a68147dcf72034-s2

## Summary

**Epic:** `one-tool-registry-git-gh-jira`
**LLD run:** `wf-1792752202899-gfo488`
**LLD effective hash:** `49d9b4a4eaf4...`

The build adds the types first, then the executor's input and output checks and the conversion pieces in parallel, then callTool and the tracker mapping, and ends with the integration and live tests and the docs. Existing tools and the agent loop must behave exactly as before, so the unchanged-behaviour checks sit with the executor task. Conversion retries follow requirement R1, with an exact 2+2 call test.

## Contents

1. [Tasks](#1-tasks)
2. [Test-strategy coverage](#2-test-strategy-coverage)
3. [References](#3-references)

## 1. Tasks

| # | Task | Size | Status | Depends on | Tests | Derived from |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| 1 | **`t1`** Declare the failure, output-schema and conversion types | S | — | — | unit: src/daemon/tools/__tests__/failure-types.test.ts: ToolDenialReason and ToolFailureKind hold exactly the declared values | [[c4]] |
| 2 | **`t2`** Add the two conversion roles and the provider helper | M | — | `t1` | integration: src/daemon/tools/__tests__/conversion-roles.test.ts: the two new roles resolve through the real RoleRouter and role taxonomy, and the coreFloor does not clamp them; unit: src/daemon/tools/__tests__/conversion-roles.test.ts: the helper returns a provider for each role from a test config | [[c5]] |
| 3 | **`t3`** Add the input and output checks to executeTool | M | — | `t1` | unit: src/daemon/tools/__tests__/output-schema.test.ts: valid input and valid data on a schematized tool pass through unchanged after the checks; unit: src/daemon/tools/__tests__/output-schema.test.ts: the check runs before the result is returned to the caller; unit: src/daemon/tools/__tests__/output-schema.test.ts: input that does not fit the inputSchema returns rejected and the tool is not run; unit: src/daemon/tools/__tests__/output-schema.test.ts: data that does not fit returns schema-mismatch with the failing paths named, and data dropped; unit: src/daemon/tools/__tests__/output-schema.test.ts: success without data on a schematized tool returns schema-mismatch; unit: src/daemon/tools/__tests__/output-schema.test.ts: a failed result is not validated and passes through; unit: src/daemon/tools/__tests__/output-schema.test.ts: a tool with no outputSchema is run and returned exactly as today, with its input unchecked; unit: src/daemon/tools/__tests__/output-schema.test.ts: a thrown error and an invalid schema each return a typed failure; integration: src/daemon/tools/__tests__/agent-loop-unchanged.test.ts: the agent loop path still receives output, success and error for a schematized tool and for a tool without a schema | [[c2]] [[c6]] |
| 4 | **`t4`** Build the key-value cross-check | M | — | `t1` | unit: src/daemon/tools/__tests__/cross-check.test.ts: key-value matching normalises whitespace and case and drops surrounding quotes; unit: src/daemon/tools/__tests__/cross-check.test.ts: an alphanumeric key value matches on token boundaries, so '12' is not found in '123'; unit: src/daemon/tools/__tests__/cross-check.test.ts: an empty keyValues result is accepted on schema alone; unit: src/daemon/tools/__tests__/cross-check.test.ts: the missing values are returned by name | [[c3]] [[c6]] |
| 5 | **`t5`** Build convertText | L | — | `t1`, `t2`, `t4` | unit: src/daemon/tools/__tests__/convert-text.test.ts: a first-attempt valid value on the cheap tier returns ok with tier cheap and no escalation; unit: src/daemon/tools/__tests__/convert-text.test.ts: an invalid first attempt is retried with the ajv errors appended; unit: src/daemon/tools/__tests__/convert-text.test.ts: two failed cheap attempts escalate once, and two failed escalated attempts return retries-exhausted; unit: src/daemon/tools/__tests__/convert-text.test.ts: the fake provider sees exactly 2 calls on the cheap role then 2 on the escalate role when every attempt fails, and exactly 1 call on first-attempt success; unit: src/daemon/tools/__tests__/convert-text.test.ts: a value that fits the schema but has a key value missing from the raw text fails with value-not-in-text and retries; unit: src/daemon/tools/__tests__/convert-text.test.ts: two concurrent calls reach the fake provider one after another, in arrival order; unit: src/daemon/tools/__tests__/convert-text.test.ts: a ToolDeps with no conversion field returns 'no conversion provider configured' without a model call; unit: src/daemon/tools/__tests__/convert-text.test.ts: a provider that rejects on every attempt returns retries-exhausted naming the role, with no fallback; unit: src/daemon/tools/__tests__/convert-text.test.ts: a hung provider call times out as an ordinary error, is retried, and releases the queue slot; unit: src/daemon/tools/__tests__/convert-text.test.ts: an aborted deps.signal drops a queued conversion without calling a provider and ends a running one as 'cancelled'; unit: src/daemon/tools/__tests__/convert-text.test.ts: an InputTooLargeError from the provider returns retries-exhausted with 'input too large' and is not resent | [[c3]] [[c6]] [[c7]] |
| 6 | **`t6`** Add callTool and the compile-time guard | M | — | `t1`, `t3` | unit: src/daemon/tools/__tests__/call-tool.test.ts: the runtime values of the fake definitions are what the types say; unit: src/daemon/tools/__tests__/call-tool.test.ts: TypedToolResult data is absent when success is false | [[c1]] |
| 7 | **`t7`** Map tool failure kinds onto the tracker port kinds | S | — | `t1` | unit: src/daemon/tools/__tests__/failure-mapping.test.ts: each ToolFailureKind maps onto a PortFailureKind, one test per kind | [[c8]] |
| 8 | **`t8`** Integration and live tests, then docs | M | — | `t5`, `t6`, `t7` | integration: src/daemon/tools/__tests__/call-tool.integration.test.ts: a tool with structured output called through callTool returns typed data; integration: src/daemon/tools/__tests__/call-tool.integration.test.ts: a tool with structured output called through callTool leaves the fake provider log empty; integration: src/daemon/tools/__tests__/call-tool.integration.test.ts: a text-only tool called through callTool converts, checks and returns typed data; integration: src/daemon/tools/__tests__/call-tool.integration.test.ts: a text-only tool whose conversion fails returns a conversion-failed ToolFailure with the raw text in failure.original; live: src/daemon/tools/__tests__/convert-text.live.test.ts: convertText on captured gh and git text-only outputs returns values whose key values are in the text; live: src/daemon/tools/__tests__/convert-text.live.test.ts: a deliberately altered output fails the cross-check | [[c9]] |

### 1.1 TASK-b7a68147dcf72034-s2-t1 — Declare the failure, output-schema and conversion types

In src/daemon/tools/types.ts add ToolFailureKind (missing-tool, missing-signin, unreachable, timed-out, rejected, conversion-failed, schema-mismatch, denied), ToolDenialReason (declined, timed-out, no-client, and cancelled from AMD-5), ToolFailure { kind, message, original?, denial? }, the optional Tool.outputSchema (typebox TSchema), the optional ToolResult.failure, ConversionProviders { resolveProvider(role) } and the optional ToolDeps.conversion. All additions are optional so the four ToolDeps builders keep compiling.

**Acceptance checks:**
- npm run build compiles with the four ToolDeps builders unchanged
- ToolDenialReason has exactly the four values declined, timed-out, no-client and cancelled
- no existing ToolResult or ToolDeps field changes meaning

### 1.2 TASK-b7a68147dcf72034-s2-t2 — Add the two conversion roles and the provider helper

Add tools.convert (peripheral, cheap) and tools.convert.escalate (peripheral, mid) to the closed registry in src/config/role-taxonomy.ts, and a small helper that builds ConversionProviders from an AnalyzeConfig, the repoPath and RoleRouter.resolveProviderForRole (src/analyze/context/role-router.ts:79). The coreFloor does not apply to them.

**Acceptance checks:**
- both roles resolve through the RoleRouter at their default tiers and can be reassigned by roleTiers
- the helper returns a provider for each role from a test config
- existing role-taxonomy and role-router tests still pass

### 1.3 TASK-b7a68147dcf72034-s2-t3 — Add the input and output checks to executeTool

In src/daemon/tools/executor.ts, for a tool that declares an outputSchema, validate the input against inputSchema before running (failure kind rejected naming the fields, tool not run) and the data against outputSchema after a successful run (schema-mismatch, data dropped, output replaced by the message, failure.original keeps the tool output truncated at a module constant). A thrown tool error also carries failure kind rejected. A tool with no outputSchema, a failed result and the existing unknown-tool path behave exactly as before; a schema ajv cannot compile is a rejected failure logged at error level.

**Acceptance checks:**
- a tool without outputSchema returns exactly what it returned before and its input is not validated
- data that does not fit returns schema-mismatch with the failing paths named and the unmatched data not passed on
- success without data on a schematized tool returns schema-mismatch
- the validator for a schema object is compiled once across calls
- src/agent/read-only-tool-loop.ts:78 still receives output, success and error unchanged through the real executeTool

### 1.4 TASK-b7a68147dcf72034-s2-t4 — Build the key-value cross-check

Add the pure cross-check used by convertText: normalise the raw text and each key value (whitespace collapsed, case folded, surrounding quotes dropped), match alphanumeric values on token boundaries, accept an empty keyValues list on schema alone with a log line saying nothing was checked, and report the missing values by name.

**Acceptance checks:**
- '12' is not found in 'issue 123 created'
- 'Fix-Login' is found in 'fix-login' with extra spaces
- an empty keyValues list is accepted and logged as unchecked
- the missing values are returned by name

### 1.5 TASK-b7a68147dcf72034-s2-t5 — Build convertText

Add the conversion module around the cross-check: a module-level serial queue, up to two attempts on tools.convert then, only if those fail, two on tools.convert.escalate, schema validation with the ajv errors appended on retry, a per-attempt deadline raised as an ordinary timed-out error, caller cancellation as AbortError ending as retries-exhausted with detail cancelled, and the named ConversionFailure kinds. Per requirement R1 it calls completeStructured with internalRetry false and maxAttempts 1 and uses withStructuredRetry as the only retry loop. It validates against the same schema object the executor uses.

**Acceptance checks:**
- with a fake provider that always fails the provider sees exactly 2 calls on the cheap role then 2 on the escalate role, and exactly 1 call when the first attempt succeeds
- two concurrent conversions reach the provider one after another
- a value whose key value is absent from the raw text fails with value-not-in-text and never reaches the caller
- a missing deps.conversion returns retries-exhausted with detail no conversion provider configured and makes no model call
- a deadline is retried as an ordinary error and a caller cancellation ends as cancelled
- no direct REST call exists in the module

### 1.6 TASK-b7a68147dcf72034-s2-t6 — Add callTool and the compile-time guard

Add TypedTool, TypedToolResult and callTool in the tools module: callTool takes the tool definition, types its input as Static of inputSchema and its data as Static of outputSchema, calls executeTool and returns a ToolFailure on any failure without throwing. Add src/daemon/tools/call-tool.type-test.ts, compiled by npm run build, with @ts-expect-error lines proving that a tool without an outputSchema and a wrongly typed input do not compile.

**Acceptance checks:**
- data is typed from the output schema with no cast
- callTool does not compile for a tool with no outputSchema
- a failure result has no data and a ToolFailure with a kind
- npm run build passes with the type-test file

### 1.7 TASK-b7a68147dcf72034-s2-t7 — Map tool failure kinds onto the tracker port kinds

Add a pure mapping from ToolFailureKind to the tracker port's four PortFailureKind values (missing-tool, missing-signin, unreachable, rejected; timed-out maps to unreachable as src/workflow/tracker/github.ts:71-79 does today), for s7's adapters to use. The port type, its stored results and its tests are not changed.

**Acceptance checks:**
- every ToolFailureKind maps to one of the four port kinds
- src/workflow/tracker/__tests__/unit-issue.test.ts still passes unchanged

### 1.8 TASK-b7a68147dcf72034-s2-t8 — Integration and live tests, then docs

Add the integration tests that run registered fake tools (structured and text-only) through callTool with the real executor, role taxonomy and router seam, proving too that the executor and convertText share one schema object, and the live test over a corpus of captured gh and git text outputs gated on INSRC_LIVE_TESTS=1. Update docs/daemon.md with the output-schema rule, callTool, convertText and the failure kinds.

**Acceptance checks:**
- a structured tool called through callTool leaves the fake provider log empty
- a text-only tool converts, checks and returns typed data, and a failed conversion returns conversion-failed with the raw text in failure.original
- the live test skips cleanly when INSRC_LIVE_TESTS is unset
- docs/daemon.md describes the rule that only code-called tools need an output schema

## 2. Test-strategy coverage

| LLD strategy item | Covered by |
| :--- | :--- |
| executeTool: valid input and valid data on a schematized tool pass through unchanged | `t3` |
| executeTool: input that does not fit the inputSchema returns rejected naming the fields, and the tool is not run | `t3` |
| executeTool: data that does not fit returns schema-mismatch, names the ajv paths, drops data, keeps failure.original truncated | `t3` |
| executeTool: success without data on a schematized tool returns schema-mismatch | `t3` |
| executeTool: a failed result is not validated and passes through | `t3` |
| executeTool: a tool with no outputSchema is run and returned exactly as today, with its input unchecked | `t3` |
| executeTool: a thrown error still returns a failed result, now with failure kind rejected | `t3` |
| executeTool: an invalid inputSchema or outputSchema returns rejected and is logged | `t3` |
| failure kinds: the mapping of each ToolFailureKind onto PortFailureKind, one test per kind | `t7` |
| convertText: a first-attempt valid value on the cheap tier returns ok with tier cheap and no escalation | `t5` |
| convertText: an invalid first attempt is retried with the ajv errors appended | `t5` |
| convertText: two failed cheap attempts escalate once, and two failed escalated attempts return retries-exhausted | `t5` |
| convertText: a value that fits the schema but has a key value missing from the raw text fails with value-not-in-text and retries | `t5` |
| convertText: key-value matching normalises whitespace and case and drops surrounding quotes | `t4` |
| convertText: an alphanumeric key value matches on token boundaries, so '12' is not found in '123' | `t4` |
| convertText: an empty keyValues result is accepted on schema alone | `t4` |
| convertText: two concurrent calls reach the fake provider one after another, in arrival order | `t5` |
| convertText: a ToolDeps with no conversion field returns 'no conversion provider configured' without a model call | `t5` |
| convertText: a provider that rejects on every attempt returns retries-exhausted naming the role, with no fallback | `t5` |
| convertText: a hung provider call times out as an ordinary error, is retried, and releases the queue slot | `t5` |
| convertText: an aborted deps.signal drops a queued conversion without calling a provider and ends a running one as 'cancelled' | `t5` |
| convertText: an InputTooLargeError from the provider returns retries-exhausted with 'input too large' and is not resent | `t5` |
| callTool accepts a definition with typebox inputSchema and outputSchema and returns data typed as Static of the output schema | `t6` |
| callTool types its input as Static of the inputSchema, so a wrong input type is an error (// @ts-expect-error) | `t6` |
| callTool does not compile for a tool with no outputSchema (// @ts-expect-error) | `t6` |
| TypedToolResult data is absent when success is false | `t6` |
| a runtime test that imports the same two fake definitions and checks the values at run time | `t6` |
| a tool with structured output called through callTool returns typed data and the fake provider log is empty | `t8` |
| a text-only tool called through callTool converts, checks and returns typed data | `t8` |
| a text-only tool whose conversion fails returns a conversion-failed ToolFailure with the raw text in failure.original | `t8` |
| the agent loop path (runReadOnlyToolLoop with the real executeTool) still receives output, success and error for a schematized tool and for a tool without a schema | `t3` |
| the two new roles resolve through the real RoleRouter and role taxonomy, and the coreFloor does not clamp them | `t2` |
| convertText on captured gh and git text-only outputs (for example the text of 'gh pr diff --stat' and 'gh run view') returns values whose key values are in the text | `t8` |
| convertText on a deliberately truncated and a deliberately altered output fails the cross-check or the schema | `t8` |

## 3. References

- **[[c1]]** `prior-artifact` `LLD s2 callTool, TypedTool and the compile-time guard (contract 2.1, acceptance ac5)`
- **[[c2]]** `prior-artifact` `LLD s2 executeTool input and output checks (contract 2.2, acceptance ac1 and ac2)`
- **[[c3]]** `prior-artifact` `LLD s2 convertText and the key-value cross-check (contract 2.3, acceptance ac4 and ac6)`
- **[[c4]]** `prior-artifact` `LLD s2 data model changes: Tool.outputSchema, ToolResult.failure, ToolFailure, ToolDeps.conversion (section 3)`
- **[[c5]]** `prior-artifact` `LLD s2 RoleTaxonomy roles tools.convert and tools.convert.escalate (section 3.5)`
- **[[c6]]** `prior-artifact` `LLD s2 error paths, edge cases and invariants (section 5)`
- **[[c7]]** `doc` `docs/plans/tool-registry.md#s2-requirements-the-plan-and-build-must-carry-captured-at-lld-approval-with-override-2026-10-23`
- **[[c8]]** `prior-artifact` `LLD s2 PortFailureKind mapping (section 3.6)`
- **[[c9]]** `prior-artifact` `LLD s2 test strategy and migration (sections 6 and 7)`
