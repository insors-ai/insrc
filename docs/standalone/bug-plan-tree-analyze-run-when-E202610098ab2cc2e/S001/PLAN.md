<!-- insrc:artifact PLAN-8ab2cc2edb3743df-S001 -->

# Plan: E202610108ab2cc2e:S001

## Summary

**Epic:** `bug-plan-tree-analyze-run-when`
**LLD run:** `wf-1791627848863-k53fdt`
**LLD effective hash:** `3379c56907db...`

The build is one large task and two small ones. The large task changes what a consuming task is handed (a list of outputs per name, each with its producing task), how the plan walk fills it, and how the report task's prompt presents it, together with the ten test files that build or read that map; it cannot be split because the type change does not compile in parts. The two small tasks correct the five report prompts' description of their input, and update the documents with a before-and-after comparison of the analyze suite.

## Contents

1. [Tasks](#1-tasks)
2. [Test-strategy coverage](#2-test-strategy-coverage)
3. [References](#3-references)

## 1. Tasks

| # | Task | Size | Depends on | Tests | Derived from |
| :--- | :--- | :--- | :--- | :--- | :--- |
| 1 | **`t1`** A consumer receives every output produced under a name, and the report task's prompt presents them all | L | — | integration: through the plan walk, eight tasks of one template each produce the same name and the report task receives all eight, in plan order, each with its task id, template and params; integration: a root plan with four planner tasks hands its report task four child reports, each attributed to its planner task; integration: when one of several producers of a name fails, the report task runs on the others and is handed the failed producer as absent, with its task id and reason; the prompt says that task's output is absent and that the other outputs under the name are available, and when no absent name has an output the absent section is unchanged; integration: a task that is not the report task receives every output of a name it consumes; unit: a map in which every name has one output renders a user message byte-identical to the one rendered before the change; unit: a name with several outputs renders one sub-section per task in plan order, with the task id, the template and the params, and a null value renders the unavailable line in its sub-section; unit: each of the five aggregate-report runtimes hands every output of a name to the shared aggregate code, and the count of tasks analysed is the number of outputs; unit: for a plan with one producer per name the existing assertions on the absent list, the task records, tasksCompleted and tasksFailed are kept unchanged, and the assertions on what a consumer was handed are rewritten to the list form (one entry with the expected task id, template, params and value) | [[c1]] [[c2]] [[c3]] [[c4]] |
| 2 | **`t2`** The five aggregate prompts describe their input as it is rendered | S | `t1` | unit: each of the five aggregate prompts describes the block as it is rendered and no longer says one section per task id | [[c2]] [[c5]] |
| 3 | **`t3`** The documents, and the suite before and after | S | `t1`, `t2` | smoke: the whole analyze suite at the commit before the Story and at this task's commit, compared by test name: no test that passed before fails after | [[c4]] [[c5]] |

### 1.1 E202610108ab2cc2e:S001:T001 — A consumer receives every output produced under a name, and the report task's prompt presents them all

Add the UpstreamOutput type and change upstreamOutputs to a map from output name to a list of them (src/analyze/executor/types.ts and the shared aggregate code's arguments). In the plan walk, append one entry per produced name when a task finishes ok (planner tasks included), project whole lists to a consumer, keep the dependency rules' meaning (a name is present when it has at least one output), and list every failed or skipped producer as absent whether or not a sibling produced the name. In the shared aggregate code, render today's block for a name with one output and one sub-section per task for a name with several; word the absent section per task when the name also has outputs and leave it byte-identical otherwise; count outputs for tasksAnalyzed and the log. Bring the tests that build or read the map to the new shape: aggregator.test.ts, aggregate-absent-inputs.test.ts, completeness-all-runtimes.test.ts, walker.test.ts, walker-aggregate.test.ts, walker-walk-failure.test.ts and the four live aggregate-report suites. The task is one piece because the type change does not compile in parts.

**Acceptance checks:**
- Through the plan walk, eight tasks of one template that each produce the same name leave the report task with eight outputs under it, in plan order, each with its task id, template and params.
- A root plan with four planner tasks hands its report task four child reports, each attributed to its planner task.
- When one of several producers of a name fails, the report task runs on the others and is handed that producer as absent with its task id and reason; the prompt says that task's output is absent and the others under the name are available.
- For a map in which every name has one output, the user message is byte-identical to the one the code rendered before the change, and when no absent name has an output the absent section is byte-identical too.
- A name with several outputs is rendered with one sub-section per task in plan order, with the task id, the template and the params; a null value renders the unavailable line in its sub-section.
- Each of the five aggregate-report runtimes hands every output of a name on, and tasksAnalyzed is the number of outputs.
- A task that is not the report task receives every output of a name it consumes.
- The existing assertions on the absent list, the task records, tasksCompleted and tasksFailed for plans with one producer per name are unchanged and pass; the assertions on what a consumer was handed are in the list form.
- The four live aggregate-report suites are type-correct for the new map (they are skipped without INSRC_LIVE_TESTS).
- `npx tsc --noEmit` is clean and the executor and runtimes suites pass.

### 1.2 E202610108ab2cc2e:S001:T002 — The five aggregate prompts describe their input as it is rendered

Correct, in the five aggregate system prompts (src/prompts/analyze/code, data, docs, generic and infra .aggregate.system.md), the description of the block `Upstream task outputs:`: one `### <output name>` section per name, and, when several tasks produced the name, one `#### <name> from task <taskId> (<template>)` sub-section per task with its `params:` line; the report must cover every sub-section. No other instruction of the prompts changes.

**Acceptance checks:**
- None of the five prompts says one `### <taskId>` section per input; each describes the name section and the per-task sub-section in the words the renderer uses.
- Apart from that description, each prompt's text is unchanged.
- The prompt validation that runs at daemon boot still passes for the five files.

### 1.3 E202610108ab2cc2e:S001:T003 — The documents, and the suite before and after

Update docs/daemon.md (the section on the final report being written from the inputs that exist) and design/analyze-framework.md where they describe what the report task receives: every output under a name, each with its task; a failed producer named as absent beside its siblings; and that a large plan's report prompt grows with the number of producers, which Story s3 of the analyzer Epic is to bound. Run the whole analyze suite at the commit before the Story and at this task's commit, compare by test name, and keep the comparison and both raw outputs in the Story's measurements folder.

**Acceptance checks:**
- docs/daemon.md and design/analyze-framework.md say what a consumer and the report task receive after the change, and name the prompt-size consequence and its owner.
- The comparison of the analyze suite before and after, by test name, is in the Story's measurements folder with both raw outputs; no test that passed before fails after, and every test that is gone or new is accounted for.
- `npx tsc --noEmit` is clean.

## 2. Test-strategy coverage

| LLD strategy item | Covered by |
| :--- | :--- |
| through the plan walk, eight tasks of one template each produce the same name and the report task receives all eight, in plan order, each with its task id, template and params | `t1` |
| a root plan with four planner tasks hands its report task four child reports, each attributed to its planner task | `t1` |
| when one of several producers of a name fails, the report task runs on the others and is handed the failed producer as absent, with its task id and reason; the prompt says that task's output is absent and that the other outputs under the name are available, and when no absent name has an output the absent section is unchanged | `t1` |
| a task that is not the report task receives every output of a name it consumes | `t1` |
| a map in which every name has one output renders a user message byte-identical to the one rendered before the change | `t1` |
| a name with several outputs renders one sub-section per task in plan order, with the task id, the template and the params, and a null value renders the unavailable line in its sub-section | `t1` |
| each of the five aggregate-report runtimes hands every output of a name to the shared aggregate code, and the count of tasks analysed is the number of outputs | `t1` |
| each of the five aggregate prompts describes the block as it is rendered and no longer says one section per task id | `t2` |
| for a plan with one producer per name the existing assertions on the absent list, the task records, tasksCompleted and tasksFailed are kept unchanged, and the assertions on what a consumer was handed are rewritten to the list form (one entry with the expected task id, template, params and value) | `t1`, `t3` |

## 3. References

- **[[c1]]** `prior-artifact` `LLD S001 contractDetails`
- **[[c2]]** `prior-artifact` `LLD S001 dataModelChanges`
- **[[c3]]** `prior-artifact` `LLD S001 errorPaths`
- **[[c4]]** `prior-artifact` `LLD S001 testStrategy`
- **[[c5]]** `prior-artifact` `LLD S001 migration`
