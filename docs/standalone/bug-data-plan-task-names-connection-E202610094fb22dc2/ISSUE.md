<!-- insrc:artifact ISSUE-4fb22dc28697cc14 -->

# Give the refusal of a connection outside the scope an error code

## Reproduction

Run a data plan under a `connection` scope in which a task names a different connection.

For example, with the request's scope set to the connection `ledger-db`, a `data.discovery.objects` task (or a `data.schema.table` task) with `connectionId: 'audit-db'`. The task is refused, correctly, before the connection pool hands anything over, with the message:

`<template>: the request's scope is the connection 'ledger-db', and this task names the connection 'audit-db'. A task under a connection scope works on that connection only.`

Expected: the failed task is recorded as every other scope refusal is: its entry in `tasksFailed` and its task record carry a `code`, and the `reason` is the error's own message.

Observed, by reading the code: the entry has no `code`, and its `reason` is the message with `runtime-threw:` in front, the form used for a task that crashed. A client cannot tell this refusal from a crash.

This was found by the daemon's code review of the Story that introduced the refusal (a LOW finding), not in a live run: none of the live runs of 2026-10-09 used a `connection` scope with a task naming another connection. The refusal itself is covered by an existing test (`a data task with a connection scope works on that connection only`); how the plan walk records it is not.

## Root cause

The refusal is thrown as a plain `Error` (`connectionWithinScope` in `src/analyze/runtimes/data/_shared.ts`). It is called by the two data tasks that take a connection id, in `src/analyze/runtimes/data/discovery-objects.ts` and `src/analyze/runtimes/data/schema-table.ts`.

The plan walk gives a failed task a code only when the one mapping from scope errors to codes recognises the error: it calls `scopeErrorMapping(err)` and, when that returns nothing, records the failure through its general path as a task whose runtime threw (`src/analyze/executor/walker.ts`). The mapping recognises three error classes and returns `undefined` for any other error (`src/analyze/context/invariants.ts`); the type of the code is those three values and no other.

So the refusal, which is a scope refusal like the other three, falls through to the general path. The daemon guide states the contract the same way: `code` is one of three values and is present only for those three (`docs/daemon.md`).

## Fix intent

A task refused because it names a connection outside the request's connection scope is recorded as a scope refusal: its task record and its entry in `tasksFailed`, on the plan's result, the run's result, the run record and the daemon's response, carry a code a client can read, and the reason is the error's own message with no `runtime-threw:` in front.

The refusal's message and the point at which the task is refused (before the connection pool hands the connection over) stay as they are.

The daemon guide's list of codes says what a client can now receive.

Every other failure is recorded exactly as today: the three existing codes keep their meaning, and a task that crashes still has no code.

Whether the refusal gets a code of its own or one of the existing three is a decision for the fix; whichever it is, the guide and the type of the code agree with it.

## Citations

- **[[c1]]** `code` `src/analyze/runtimes/data/_shared.ts` — "`and this task names the connection '${named}'. A task under a connection scope works on that connection only.`,"
- **[[c2]]** `code` `src/analyze/runtimes/data/discovery-objects.ts` — "const connectionId = connectionWithinScope(scope, requireStringParam(args, 'connectionId'"
- **[[c3]]** `code` `src/analyze/executor/walker.ts` — "const scoped = scopeErrorMapping(err);
		if (scoped !== undefined) {"
- **[[c4]]** `code` `src/analyze/context/invariants.ts` — "export type ScopeErrorCode = 'scope-not-indexed' | 'scope-ref-unresolved' | 'scope-ref-kind-target-mismatch';"
- **[[c5]]** `code` `src/analyze/context/invariants.ts` — "The ONE mapping from the three scope error classes to their codes. Returns
 * `undefined` for any other error."
- **[[c6]]** `doc` `docs/daemon.md` — "`code` is one of `scope-ref-kind-target-mismatch`, `scope-ref-unresolved` and
`scope-not-indexed`, and is present only for those three."
- **[[c7]]** `doc` `docs/epics/make-insrc-analysis-complete-used-right-E20261006b9d5c5c4/S007/CR.md` — "`connectionWithinScope` refuses a task that names a connection outside the scope with a plain `Error`. `scopeErrorMapping` does not recognise it, so the walk records it as `runtime-threw: ...` with no"
- **[[c8]]** `code` `src/analyze/runtimes/data/__tests__/data-runtimes.test.ts` — "test('a data task with a connection scope works on that connection only', async () => {"
