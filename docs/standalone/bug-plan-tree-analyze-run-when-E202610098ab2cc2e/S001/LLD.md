<!-- insrc:artifact LLD-8ab2cc2edb3743df-S001 -->

# LLD: E202610108ab2cc2e:S001

## Summary

**Epic:** `bug-plan-tree-analyze-run-when`
**HLD base run:** `wf-1791627848863-k53fdt`
**HLD effective hash:** `3379c56907db...`

When several tasks of a plan produce an output under the same name, the task that consumes that name now receives all of them, each with the task that produced it, where it used to receive only the last. The final report of a plan is therefore written from every directory's surface, every file's inventory and every child plan's report, and a producer that failed is named as missing even when a sibling succeeded. A plan in which each name has one producer gives the report task the same input as before.

## Contents

1. [HLD context](#1-hld-context)
2. [Contract details](#2-contract-details)
3. [Data model changes](#3-data-model-changes)
4. [Error paths](#4-error-paths)
5. [Test strategy](#5-test-strategy)
6. [Migration](#6-migration)
7. [Alternatives considered](#7-alternatives-considered)
8. [References](#8-references)

## 1. HLD context

**Framework:** Standalone feature — no parent HLD. Design directly against the repo, grounded on the s1 analyze passes. There are no HLD shared contracts to honour.
**Rollout phase:** standalone

## 2. Contract details

**Surface level:** internal

### 2.1 `runAggregator`

```typescript
runAggregator(args: RunAggregatorArgs): Promise<AggregateReport>
```

**Parameters:**
- `args: RunAggregatorArgs` — Unchanged apart from one field: `upstreamOutputs` is now ReadonlyMap<string, readonly UpstreamOutput[]>, every output produced under each consumed name, in plan order. The five aggregate-report runtimes pass `args.upstreamOutputs` on as today.

**Returns:** `AggregateReport` — Unchanged in shape. `metadata.tasksAnalyzed` (and the logged `upstreamTasks`) is the number of outputs received, summed over the names; for a plan with one producer per name that is the number it is today.

**Errors:**
- `Error (a plain Error, unchanged; its message begins 'aggregator prompt missing', 'aggregator-llm-unavailable' or 'aggregator-schema-unrecoverable')` when As today: the model call fails or the prompt file is missing. A prompt that is too long for the model is one of these and is Story s3's subject.

**Postconditions:**
- Every output in the map is in the user message, under its name, attributable to its task.

### 2.2 `renderUpstreamSection`

```typescript
renderUpstreamSection(map: ReadonlyMap<string, readonly UpstreamOutput[]>): string
```

**Parameters:**
- `map: ReadonlyMap<string, readonly UpstreamOutput[]>` — The consumer's inputs. Names are rendered in sorted order, as today.

**Returns:** `string` — For a name with ONE output, exactly today's block: `### <name>` and the value as stable JSON in a json fence (or today's 'unavailable' line for a null value). For a name with SEVERAL, a heading `### <name> (<n> outputs, one per task)` followed, in plan order, by one sub-block per output: `#### <name> from task <taskId> (<template>)`, a line `params: <the task's params as stable JSON>`, and the value in a json fence. An empty map renders today's sentence.

**Postconditions:**
- For a map in which every name has one output, the string is byte-identical to today's.

### 2.3 `projectUpstream`

```typescript
projectUpstream(task: PlannedTask, outputs: ReadonlyMap<string, readonly UpstreamOutput[]>): ReadonlyMap<string, readonly UpstreamOutput[]>
```

**Parameters:**
- `task: PlannedTask` — The consuming task; its `consumes` names are projected, as today.
- `outputs: ReadonlyMap<string, readonly UpstreamOutput[]>` — The plan's outputs so far: per name, the outputs of the tasks that finished ok, in plan order.

**Returns:** `ReadonlyMap<string, readonly UpstreamOutput[]>` — For each consumed name that has at least one output, the whole list.

### 2.4 `absentInputsFor`

```typescript
absentInputsFor(task: PlannedTask, tasks: readonly PlannedTask[], outputs: ReadonlyMap<string, readonly UpstreamOutput[]>, perTask: ReadonlyMap<string, TaskExecutionRecord>): AbsentInput[]
```

**Parameters:**
- `task: PlannedTask` — The aggregate-report task.
- `tasks: readonly PlannedTask[]` — The plan's tasks, in order.
- `outputs: ReadonlyMap<string, readonly UpstreamOutput[]>` — The plan's outputs so far.
- `perTask: ReadonlyMap<string, TaskExecutionRecord>` — The records of the tasks that ran.

**Returns:** `AbsentInput[]` — One entry per name of every failed or skipped task, with that task's id and reason, WHETHER OR NOT another task produced the same name (today such an entry is left out when a sibling succeeded); then, as today, one entry with no producing task for a consumed name no task of the plan produces. The shared aggregate code's renderAbsentSection is changed with it. Today it words each entry by name ('<name>: task <taskId> should have produced it') and tells the model it has nothing about an absent input; for a name that also has outputs that would contradict the outputs the model was just given. So for such a name the line says that the output of task <taskId> under <name> is absent and that the other outputs under that name are available, and the closing instruction speaks of the absent output of that task, not of the name. When no absent name has an output, the section is byte-identical to today's.

**Postconditions:**
- For a plan with one producer per name the list is the same as today's.

## 3. Data model changes

### 3.1 `UpstreamOutput (new type) and TemplateExecuteArgs.upstreamOutputs` — field-modify

A new exported type in src/analyze/executor/types.ts: UpstreamOutput = { taskId: string; template: string; params: Readonly<Record<string, unknown>>; value: unknown }: one output of one task that finished ok, with what is needed to tell it from its siblings. TemplateExecuteArgs.upstreamOutputs changes from ReadonlyMap<string, unknown> (one value per name) to ReadonlyMap<string, readonly UpstreamOutput[]> (every output under the name, in plan order; a name with no output is not in the map). Today a second producer of a name replaces the first; that is the invariant this change removes. The doc comment of the field is rewritten to say so. The only production reader is the shared aggregate code; a runtime that does not read the map is unaffected.

```
+ export interface UpstreamOutput { readonly taskId: string; readonly template: string; readonly params: Readonly<Record<string, unknown>>; readonly value: unknown }
~ TemplateExecuteArgs.upstreamOutputs: ReadonlyMap<string, unknown> -> ReadonlyMap<string, readonly UpstreamOutput[]>
~ RunAggregatorArgs.upstreamOutputs: the same change
```

**Call sites:**
- `src/analyze/executor/types.ts`
- `src/analyze/executor/walker.ts`
- `src/analyze/runtimes/shared/aggregator.ts`
- `src/analyze/runtimes/code/aggregate-report.ts`
- `src/analyze/runtimes/data/aggregate-report.ts`
- `src/analyze/runtimes/docs/aggregate-report.ts`
- `src/analyze/runtimes/generic/aggregate-report.ts`
- `src/analyze/runtimes/infra/aggregate-report.ts`

### 3.2 `The plan walk's map of outputs` — invariant-change

executePlan's `outputs` becomes a Map from output name to a list of UpstreamOutput. A task that finishes ok APPENDS one entry (its task id, template, params and the value) to the list of each name it produces; nothing is replaced. Today's invariant, one value per name with the last producer winning, is what is removed. A planner task appends its child plan's final report under its one output name the same way, so a parent's report task receives every child's report. Each plan of a tree still has its own map. The dependency rules keep their meaning over the new map: unmetDependencies and aggregateUnmet ask whether a name has at least one output, exactly as `outputs.has(name)` does today.

**Call sites:**
- `src/analyze/executor/walker.ts`

### 3.3 `The aggregate prompts' description of their input` — field-modify

The five aggregate system prompts (src/prompts/analyze/code, data, docs, generic, infra .aggregate.system.md) describe the block `Upstream task outputs:`. Each of the five says it has one `### <taskId>` section per input (src/prompts/analyze/code.aggregate.system.md, data.aggregate.system.md, docs.aggregate.system.md, generic.aggregate.system.md and infra.aggregate.system.md), which is not what is rendered today (the title is the output name). Each prompt's description is corrected to the form actually rendered: one `### <output name>` section per name, and, when several tasks produced the name, one `#### <name> from task <taskId> (<template>)` sub-section per task with its `params:` line; the report must cover every sub-section and may tell them apart by the task's parameters. No other instruction of the prompts changes.

**Call sites:**
- `src/prompts/analyze/code.aggregate.system.md`
- `src/prompts/analyze/data.aggregate.system.md`
- `src/prompts/analyze/docs.aggregate.system.md`
- `src/prompts/analyze/generic.aggregate.system.md`
- `src/prompts/analyze/infra.aggregate.system.md`

## 4. Error paths

**Error cases**

- **One of several producers of a name fails and the others succeed (for example one of eight functional-surface tasks).** (recoverable)
  - Detection: The plan walk records the task as failed and appends nothing for it; absentInputsFor finds a failed or skipped record for a task whose name is in the plan and no longer skips it because a sibling produced the name.
  - Response: The report task runs on the outputs that exist and is handed an AbsentInput for the failed producer, with its task id and its own reason, as a wholly absent name is today.
  - User impact: The report covers the seven that succeeded and says which one is missing and why. Today the failure is hidden: the name counts as present.
- **Every producer of a consumed name fails.** (recoverable)
  - Detection: The name has no output in the walk's map; aggregateUnmet and unmetDependencies see it as they do today.
  - Response: Unchanged: the report task runs on its other inputs, or is skipped when it has none; each failed producer is listed as absent.
  - User impact: As today.
- **The report task's prompt, now holding every output, is longer than the model accepts.** (terminal)
  - Detection: The model call in runAggregator throws; classifyError turns it into the aggregate failure, as today.
  - Response: Unchanged: the report task fails with the model's reason ('Prompt is too long'). This design does not shorten or split the input.
  - User impact: A large plan can now fail where it used to return a report written from one output of many. That report was wrong; handling an input too large for one pass is Story s3 of the analyzer Epic.
- **A child plan produced no report and its sibling child plans did.** (recoverable)
  - Detection: The planner task is failed with 'child-plan-unavailable' and appends nothing; absentInputsFor lists it.
  - Response: The parent's report task receives every sibling's report and the absent entry for the failed child, with the child's cause.
  - User impact: The parent's report covers the children that reported and names the one that did not.

**Edge cases**

| Input | Expected |
| :--- | :--- |
| A plan in which every output name has one producer. | The report task's user message is byte-identical to today's; the absent list, the task records, tasksCompleted and tasksFailed are the same. |
| Eight tasks of one template produce `functional-surface`, each for one directory (the live run). | The report task receives eight outputs under the name, in plan order, each with its task id, its template and its params (which hold the directory); the prompt has one sub-section per task. |
| A root plan with four planner tasks that each produce `report`. | The root's report task receives four reports under `report`, each attributed to its planner task; today it receives the last one. |
| A task that is not the report task consumes a name that several tasks produced. | It runs when at least one output exists and receives all that exist. It is not told which producers failed: absent inputs are handed to the report task only, as today. |
| A producer's output value is null. | With one producer, today's 'unavailable' line; with several, the same line in that task's sub-section. |
| Two producers of a name have identical params. | Both are rendered; their task ids tell them apart. |
| The report task consumes no name (an empty `consumes`). | Unchanged: it runs with an empty map and today's sentence; the absent list is still built from the plan's tasks. |

**Invariants to preserve**

- A task's own record (its `outputs`, status and error) is not changed by this design; each task already keeps its own output there. [[c2]]
- The report task is skipped only when it consumes at least one name and none has an output; a task that is not the report task is skipped when a consumed name has no output. [[c1]]
- The report task is the last task of its plan and its `report` is the plan's final report. [[c1]]
- For a plan with one producer per name the report task's user message, including the order of the names (sorted) and the form of each block, is what it is today. [[c3]]
- A consumer is given only the names in its own `consumes`. [[c1]]
- A plan cannot give two tasks of one template different output names (INV-6); this design does not change plan validation. [[c5]]

## 5. Test strategy

**Test framework:** `node:test with node:assert/strict, run by `npx tsx --test` under Node 22; test files are `__tests__/*.test.ts` beside the code (as src/analyze/executor/__tests__/walker-aggregate.test.ts and src/analyze/runtimes/shared/__tests__/aggregator.test.ts)`

**Test levels**

- **integration** — Through the plan walk, a consumer receives every output produced under a name, and a failed producer is reported.
  - Subjects: `through the plan walk, eight tasks of one template each produce the same name and the report task receives all eight, in plan order, each with its task id, template and params`, `a root plan with four planner tasks hands its report task four child reports, each attributed to its planner task`, `when one of several producers of a name fails, the report task runs on the others and is handed the failed producer as absent, with its task id and reason; the prompt says that task's output is absent and that the other outputs under the name are available, and when no absent name has an output the absent section is unchanged`, `a task that is not the report task receives every output of a name it consumes`
  - Fixtures: `runExecutor with stand-in runtimes that record the upstreamOutputs and absentInputs they are handed (the pattern of walker-aggregate.test.ts)`, `a plan of the shape of the live run kept in docs/epics/make-insrc-analysis-complete-used-right-E20261006b9d5c5c4/S008/measurements/live/`
- **unit** — The report task's prompt presents every output, and is unchanged where each name has one producer.
  - Subjects: `a map in which every name has one output renders a user message byte-identical to the one rendered before the change`, `a name with several outputs renders one sub-section per task in plan order, with the task id, the template and the params, and a null value renders the unavailable line in its sub-section`, `each of the five aggregate-report runtimes hands every output of a name to the shared aggregate code, and the count of tasks analysed is the number of outputs`, `each of the five aggregate prompts describes the block as it is rendered and no longer says one section per task id`
  - Fixtures: `the message builder's test seam in aggregator.test.ts`, `a copy of the user message rendered by the code before the change, kept as the expected string for the one-producer case`, `a stand-in model that returns a fixed report and keeps the prompt it was given`
- **unit** — Plans with one producer per name behave as before.
  - Subjects: `for a plan with one producer per name the existing assertions on the absent list, the task records, tasksCompleted and tasksFailed are kept unchanged, and the assertions on what a consumer was handed are rewritten to the list form (one entry with the expected task id, template, params and value)`
  - Fixtures: `the existing fixtures of walker.test.ts, walker-aggregate.test.ts and walker-walk-failure.test.ts`

**Acceptance mapping**

| Criterion | Proving tests |
| :--- | :--- |
| `ac1` | `through the plan walk, eight tasks of one template each produce the same name and the report task receives all eight, in plan order, each with its task id, template and params`, `a task that is not the report task receives every output of a name it consumes` |
| `ac2` | `a name with several outputs renders one sub-section per task in plan order, with the task id, the template and the params, and a null value renders the unavailable line in its sub-section`, `each of the five aggregate prompts describes the block as it is rendered and no longer says one section per task id` |
| `ac3` | `when one of several producers of a name fails, the report task runs on the others and is handed the failed producer as absent, with its task id and reason; the prompt says that task's output is absent and that the other outputs under the name are available, and when no absent name has an output the absent section is unchanged` |
| `ac4` | `a map in which every name has one output renders a user message byte-identical to the one rendered before the change`, `for a plan with one producer per name the existing assertions on the absent list, the task records, tasksCompleted and tasksFailed are kept unchanged, and the assertions on what a consumer was handed are rewritten to the list form (one entry with the expected task id, template, params and value)` |
| `ac5` | `each of the five aggregate-report runtimes hands every output of a name to the shared aggregate code, and the count of tasks analysed is the number of outputs`, `a root plan with four planner tasks hands its report task four child reports, each attributed to its planner task` |

## 6. Migration

**State before:** The plan walk keeps one value per output name and a later producer replaces an earlier one (s1: the reading of walker.ts). A consumer is handed one value per consumed name through TemplateExecuteArgs.upstreamOutputs, a ReadonlyMap<string, unknown> (s1: the reading of types.ts). The only reader is the shared aggregate code, through the five aggregate-report runtimes, which renders one block per name (s1: the text search of readers). A failed producer is not reported absent when a sibling produced the same name (s1: absentInputsFor). The code aggregate prompt describes one section per task id, which is not what is rendered (s1: the prompt search).

**State after:** The walk keeps, per name, the list of outputs of the tasks that finished ok, in plan order, each with its task id, template and params. A consumer is handed the whole list for each name it consumes. The shared aggregate code renders today's block for a name with one output and one sub-section per task for a name with several. Every failed or skipped producer is reported absent. The five aggregate prompts describe the block as it is rendered.

**Zero downtime:** yes — **Data rewrite:** no

**Steps**

1. Add the UpstreamOutput type; change the type of upstreamOutputs on TemplateExecuteArgs and on the shared aggregate code's arguments; change the walk to append and to project lists, and the absent-input rule to list every failed producer; change the rendering and the two counts in the shared aggregate code. These go together: the type change does not compile in parts. Update the tests that build a non-empty map by hand or assert on the map a consumer was handed: src/analyze/runtimes/shared/__tests__/aggregator.test.ts, src/analyze/runtimes/__tests__/aggregate-absent-inputs.test.ts, src/analyze/executor/__tests__/walker-aggregate.test.ts and src/analyze/executor/__tests__/walker-walk-failure.test.ts (both assert the raw values a stand-in was handed) and src/analyze/executor/__tests__/walker.test.ts, src/analyze/runtimes/__tests__/completeness-all-runtimes.test.ts (its helper builds the map from an object of raw values and hands a non-empty one to each of the five aggregate runtimes; an empty array there would be read as a name with no output) and the four live suites src/analyze/runtimes/code, data, generic and infra /__tests__/aggregate-report.live.test.ts. This list is every test file found by a text search for `upstreamOutputs` that passes a non-empty map or reads the map it was handed. Two more files name the map and need no change of behaviour, only a look: src/analyze/runtimes/shared/__tests__/adherence-constraints.test.ts and adherence-topic-route.test.ts (they hand the adherence check a map it must not read, and one stand-in reads only the map's keys). The live suites are skipped without INSRC_LIVE_TESTS and the typecheck does not compile tests, so the usual gate will not show them left on the old shape: they are brought to the new shape all the same and run once with the stand-in removed or read for type-correctness. — ↩ rollbackable
2. Correct the description of the input block in the five aggregate prompts. — ↩ rollbackable
3. Update the guide (docs/daemon.md, the section on the final report being written from the inputs that exist) and the framework design page where they describe what the report task receives. — ↩ rollbackable

**Backward compat:** No public API changes: the field is internal to the analyze framework and plans are executed fresh on every run. No stored data is rewritten: a task's own record keeps its shape, and the map of upstream outputs is never stored. A plan with one producer per name gives its report task the same user message as before. What changes for a reader of a report: a plan with several producers of a name now has a report written from all of them, and its prompt is longer in proportion, so a plan large enough can fail at the report task with the model's 'Prompt is too long' where it used to return a report written from one output; that limit is Story s3's subject. The system prompts of the report task change by a few lines for every run.

## 7. Alternatives considered

### 7.1 a1: The upstream map holds a list of produced outputs per name — **CHOSEN**

TemplateExecuteArgs.upstreamOutputs becomes a map from output name to the list of outputs produced under it, each with its producing task.

The walk keeps, per plan, a map from output name to a list of produced outputs in plan order; each entry is { taskId, template, params, value }. A task that finishes ok appends to the list of each name it produces; nothing is replaced. A consumer is given, for each name it consumes, the whole list. The type of `upstreamOutputs` changes from ReadonlyMap<string, unknown> to ReadonlyMap<string, readonly UpstreamOutput[]>, so no reader can take one value where there are several: the only reader, the shared aggregate code, is changed with it. The aggregate prompt keeps today's block for a name with one producer (`### <name>` and the value), and for a name with several renders one sub-block per producer, titled with the task id, the template and the task's parameters. The absent-input rule lists every failed or skipped producer, also when another producer of the name succeeded. The log and metadata counts become counts of outputs.

### 7.2 a2: Keep the map; add a second field with every producer's output

upstreamOutputs stays one value per name; a new optional field carries the per-producer list.

TemplateExecuteArgs keeps `upstreamOutputs: ReadonlyMap<string, unknown>` (the last producer's value, as today) and gains `upstreamByProducer: ReadonlyMap<string, readonly UpstreamOutput[]>`. The shared aggregate code reads the new field; any other reader keeps working unchanged.

**Rejected because:** Fixes the aggregate report but leaves the old field holding one output of several, where a later reader can take it.

### 7.3 a3: Give each task's output its own name in the map

The walk stores an output under `<name>@<taskId>` and the consumer's `consumes` is expanded to match.

The walk keys the plan's outputs by output name and task id together. When it projects a consumer's inputs it expands each consumed name to every key of that name, in plan order. The map's type stays ReadonlyMap<string, unknown>; the keys carry the producer. The aggregate code renders one block per key.

**Rejected because:** Keeps every output but encodes the producer in a key string without its template or parameters, and changes the prompt of a plan with one producer per name unless special-cased.

## 8. References

- **[[c1]]** `code` `src/analyze/executor/walker.ts` — "outputs.set(name, value);"
- **[[c2]]** `code` `src/analyze/executor/types.ts` — "readonly upstreamOutputs: ReadonlyMap<string, unknown>;"
- **[[c3]]** `code` `src/analyze/runtimes/shared/aggregator.ts` — "function renderUpstreamSection(map: ReadonlyMap<string, unknown>): string {"
- **[[c4]]** `code` `src/prompts/analyze/code.aggregate.system.md` — "- A block titled `Upstream task outputs:` with one `### <taskId>`"
- **[[c5]]** `code` `src/analyze/planner/validate.ts` — "// INV-6: produces matches template"
- **[[c6]]** `prior-artifact` `docs/standalone/bug-plan-tree-analyze-run-when-E202610098ab2cc2e/ISSUE.md` — "A task that consumes an output name receives every output produced under that name by the tasks of its plan that finished `ok`"
- **[[c7]]** `stakeholder` `The acceptance criteria this design states, from the five points of the issue's fix intent` — "ac1: a consumer receives every output produced under a name it consumes, each attributable to its task, in plan order. ac2: the report task's prompt presents all of them with the producing task and it"

<!-- insrc:review -->

## Review

### ✅ Review `PASS` — design.story (design.story)

**0 do not hold · 0 could not be verified · 8 hold** · template `design-issue` · model `cli-claude:opus` · reviewed 2026-10-10T10:36:18.011Z

Only a premise that does not hold blocks approval. One that could not be verified is listed for the reader and does not block.

#### Does not hold (blocks approval)

_None._

#### Could not verify (does not block)

_None._
