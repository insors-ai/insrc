<!-- insrc:artifact TESTS-8ab2cc2edb3743df-S001 -->

# Tests: 8ab2cc2edb3743df S001

What the build validation gate ran for each Task of this Story, and what each test case did. The gate runs the tests itself; a result here is never a builder's statement unless it says so. `not found` means no test of that title ran in that file.

**Totals:** 17 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

## t1

Run at 2026-10-10T12:08:41.130Z on commit `ff6107ec`. Tests check: **passed**. 15 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**integration: through the plan walk, eight tasks of one template each produce the same name and the report task receives all eight, in plan order, each with its task id, template and params**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | through the plan walk, eight tasks of one template each produce the same name and the report task receives all eight, in plan order, each with its task id, template and params | `src/analyze/executor/__tests__/walker-aggregate.test.ts` |

**integration: a root plan with four planner tasks hands its report task four child reports, each attributed to its planner task**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | a root plan with four planner tasks hands its report task four child reports, each attributed to its planner task | `src/analyze/executor/__tests__/walker-aggregate.test.ts` |

**integration: when one of several producers of a name fails, the report task runs on the others and is handed the failed producer as absent, with its task id and reason; the prompt says that task's output is absent and that the other outputs under the name are available, and when no absent name has an output the absent section is unchanged**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | when one of several producers of a name fails, the report task runs on the others and is handed the failed producer as absent, with its task id and reason; the prompt says that task's output is absent and that the other outputs under the name are available, and when no absent name has an output the absent section is unchanged | `src/analyze/executor/__tests__/walker-aggregate.test.ts` |
| pass | an absent output of one of several producers is worded by its task and the others are said to be available; a name with no output keeps the old wording | `src/analyze/runtimes/shared/__tests__/aggregator.test.ts` |

**integration: a task that is not the report task receives every output of a name it consumes**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | a task that is not the report task receives every output of a name it consumes | `src/analyze/executor/__tests__/walker-aggregate.test.ts` |

**unit: a map in which every name has one output renders a user message byte-identical to the one rendered before the change**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | a map in which every name has one output renders a user message byte-identical to the one rendered before the change | `src/analyze/runtimes/shared/__tests__/aggregator.test.ts` |

**unit: a name with several outputs renders one sub-section per task in plan order, with the task id, the template and the params, and a null value renders the unavailable line in its sub-section**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | a name with several outputs renders one sub-section per task in plan order, with the task id, the template and the params, and a null value renders the unavailable line in its sub-section | `src/analyze/runtimes/shared/__tests__/aggregator.test.ts` |

**unit: each of the five aggregate-report runtimes hands every output of a name to the shared aggregate code, and the count of tasks analysed is the number of outputs**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | each of the five aggregate-report runtimes hands every output of a name to the shared aggregate code, and the count of tasks analysed is the number of outputs | `src/analyze/runtimes/__tests__/aggregate-absent-inputs.test.ts` |

**unit: for a plan with one producer per name the existing assertions on the absent list, the task records, tasksCompleted and tasksFailed are kept unchanged, and the assertions on what a consumer was handed are rewritten to the list form (one entry with the expected task id, template, params and value)**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | a plan in which one of three producers failed has a final report written from the two that exist, with the third named as absent (mutation: skip the aggregate task as before) | `src/analyze/executor/__tests__/walker-aggregate.test.ts` |
| pass | a plan in which every producer failed has no final report; a task other than the aggregate task with a missing input is still skipped; an aggregate task that throws still fails the run | `src/analyze/executor/__tests__/walker-aggregate.test.ts` |
| pass | a plan whose aggregate task consumes nothing runs with and without a failed task before it (mutation: skip an aggregate task that consumes nothing) | `src/analyze/executor/__tests__/walker-aggregate.test.ts` |
| pass | a nested plan in which one child task failed gives a root report, and the answer report names the child's task by its path | `src/analyze/executor/__tests__/walker-aggregate.test.ts` |
| pass | a writing failure while the walk handles one task fails that task and the walk goes on; an error not tied to a task propagates | `src/analyze/executor/__tests__/walker-walk-failure.test.ts` |
| pass | projectUpstream: limits to consumed names only | `src/analyze/executor/__tests__/walker.test.ts` |
| pass | each of the five aggregate-report runtimes hands absentInputs to the aggregator | `src/analyze/runtimes/__tests__/aggregate-absent-inputs.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `src/analyze/executor/__tests__/walker-aggregate.test.ts` | 0 | 8 | 0.9 s |  |
| `src/analyze/executor/__tests__/walker-walk-failure.test.ts` | 0 | 1 | 0.6 s |  |
| `src/analyze/executor/__tests__/walker.test.ts` | 0 | 28 | 0.6 s |  |
| `src/analyze/runtimes/__tests__/aggregate-absent-inputs.test.ts` | 0 | 2 | 0.6 s |  |
| `src/analyze/runtimes/shared/__tests__/aggregator.test.ts` | 0 | 23 | 0.6 s |  |

## t2

Run at 2026-10-10T12:11:05.590Z on commit `b79348f8`. Tests check: **passed**. 2 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**unit: each of the five aggregate prompts describes the block as it is rendered and no longer says one section per task id**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | each of the five aggregate prompts describes the block as it is rendered and no longer says one section per task id | `src/analyze/runtimes/__tests__/aggregate-absent-inputs.test.ts` |
| pass | validateAnalyzePrompts: every PROMPT_PATHS entry is present + non-empty | `src/analyze/context/__tests__/boot-validator.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `src/analyze/context/__tests__/boot-validator.test.ts` | 0 | 12 | 0.9 s |  |
| `src/analyze/runtimes/__tests__/aggregate-absent-inputs.test.ts` | 0 | 3 | 0.6 s |  |
