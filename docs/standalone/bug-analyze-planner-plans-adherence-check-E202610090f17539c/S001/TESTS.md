<!-- insrc:artifact TESTS-0f17539c98aa78ee-S001 -->

# Tests: 0f17539c98aa78ee S001

What the build validation gate ran for each Task of this Story, and what each test case did. The gate runs the tests itself; a result here is never a builder's statement unless it says so. `not found` means no test of that title ran in that file.

**Totals:** 25 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

## t1

Run at 2026-10-10T07:36:48.435Z on commit `a4b64f96`. Tests check: **passed**. 3 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**integration: one enumeration per run, repository and topic is made, recorded under the run's directory with its whole output, and read back; a topic that differs only in case or spacing reuses it; a different maxSources, topic or run does not; a failed enumeration is not recorded and one with no constraint is**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | one enumeration per run, repository and topic is made, recorded under the run's directory with its whole output, and read back; a topic that differs only in case or spacing reuses it; a different maxSources, topic or run does not; a failed enumeration is not recorded and one with no constraint is | `src/analyze/runtimes/shared/__tests__/adherence-topic-constraints.test.ts` |
| pass | the seam replaces the enumeration, and is handed the topic, the repository, the limit and no area | `src/analyze/runtimes/shared/__tests__/adherence-topic-constraints.test.ts` |

**integration: a record that is unreadable, of another version or of another topic is enumerated again and overwritten; a record that cannot be written does not fail the check**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | a record that is unreadable, of another version or of another topic is enumerated again and overwritten; a record that cannot be written does not fail the check | `src/analyze/runtimes/shared/__tests__/adherence-topic-constraints.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `src/analyze/runtimes/shared/__tests__/adherence-topic-constraints.test.ts` | 0 | 3 | 1.1 s |  |

## t2

Run at 2026-10-10T07:45:20.509Z on commit `af4c2bbc`. Tests check: **passed**. 22 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**integration: a check with a topic judges against the constraints enumerated from the repository's documents, and its output carries those constraints, their citations and the record's path**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | a check with a topic judges against the constraints enumerated from the repository's documents, and its output carries those constraints, their citations and the record's path | `src/analyze/runtimes/shared/__tests__/adherence-topic-route.test.ts` |

**integration: four checks with one topic in one run make one enumeration; a topic that differs only in case or spacing reuses it; a different maxConstraintSources, a different topic or a different run does not**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | four checks with one topic in one run make one enumeration; a topic that differs only in case or spacing reuses it; a different maxConstraintSources, a different topic or a different run does not | `src/analyze/runtimes/shared/__tests__/adherence-topic-route.test.ts` |

**integration: the enumeration's reached limit, partly read section and skipped search by meaning appear in the completeness record of the check that made it and of a check that read its record**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | the enumeration's reached limit, partly read section and skipped search by meaning appear in the completeness record of the check that made it and of a check that read its record | `src/analyze/runtimes/shared/__tests__/adherence-topic-route.test.ts` |
| pass | a table test over every registered plan-task runtime finds a completeness record on each result | `src/analyze/runtimes/__tests__/completeness-all-runtimes.test.ts` |

**integration: an inline list or stored-document ids are used alone when given, with a topic also present, and no enumeration is made; an empty inline list beside ids uses the ids, and beside a topic uses the topic**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | an inline list or stored-document ids are used alone when given, with a topic also present, and no enumeration is made; an empty inline list beside ids uses the ids, and beside a topic uses the topic | `src/analyze/runtimes/shared/__tests__/adherence-topic-route.test.ts` |
| pass | an inline list wins over ids; an empty inline list counts as not given and the ids are used | `src/analyze/runtimes/shared/__tests__/adherence-constraints.test.ts` |

**integration: a data check under a connection scope and an infra check under a manifest directory read the documents of the declaring or containing repository, and a code check scoped to one file reads the whole repository's documents**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | a data check under a connection scope and an infra check under a manifest directory read the documents of the declaring or containing repository, and a code check scoped to one file reads the whole repository's documents | `src/analyze/runtimes/shared/__tests__/adherence-topic-route.test.ts` |

**integration: when the documents state no constraint on the topic the check fails with that reason, with the number of sections read or the note that none matched, the record is written, and a sibling check fails the same way without a second enumeration**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | when the documents state no constraint on the topic the check fails with that reason, with the number of sections read or the note that none matched, the record is written, and a sibling check fails the same way without a second enumeration | `src/analyze/runtimes/shared/__tests__/adherence-topic-route.test.ts` |

**integration: when the enumeration's model call fails the check fails with 'could not be enumerated', writes no record, and the next check enumerates again; when the judging call fails the reason is the judging's and the record stays**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | when the enumeration's model call fails the check fails with 'could not be enumerated', writes no record, and the next check enumerates again; when the judging call fails the reason is the judging's and the record stays | `src/analyze/runtimes/shared/__tests__/adherence-topic-route.test.ts` |
| pass | an adherence check whose model call fails is recorded by the walk as a failed task | `src/analyze/runtimes/__tests__/dropped-or-failed.test.ts` |
| pass | the count of catch clauses in the runtime files equals the number of classified entries | `src/analyze/runtimes/__tests__/dropped-or-failed.test.ts` |

**integration: an override that yields no constraint fails naming the override and does not fall back to the topic**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | an override that yields no constraint fails naming the override and does not fall back to the topic | `src/analyze/runtimes/shared/__tests__/adherence-topic-route.test.ts` |

**unit: the existing tests of constraintIds and inline constraints keep their assertions, read through the new result shape of the seam; the two tests of constraintsSource are replaced, and the test that no source returns an empty list is replaced by one that asserts the throw naming constraintTopic, constraints and constraintIds**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | inline params.constraints pass through untouched | `src/analyze/runtimes/shared/__tests__/adherence-constraints.test.ts` |
| pass | constraintIds hydrate keyConstraints from summarised docs | `src/analyze/runtimes/shared/__tests__/adherence-constraints.test.ts` |
| pass | constraintIds skip ids that do not resolve to summarised docs | `src/analyze/runtimes/shared/__tests__/adherence-constraints.test.ts` |
| pass | a constraintsSource in the params is not read: beside usable ids the ids are used, and the upstream outputs are never looked at | `src/analyze/runtimes/shared/__tests__/adherence-constraints.test.ts` |
| pass | with no source of constraints the check throws, naming constraintTopic, constraints and constraintIds | `src/analyze/runtimes/shared/__tests__/adherence-constraints.test.ts` |
| pass | the project-context assembler reports a limit it reached and the documents behind its decisions and constraints, and the adherence check puts them in the record | `src/analyze/runtimes/__tests__/partly-read-plan-tasks.test.ts` |
| pass | each adherence check reports a body it cut with the kept and full lengths | `src/analyze/runtimes/__tests__/partly-read-plan-tasks.test.ts` |
| pass | each of the five aggregate-report runtimes hands absentInputs to the aggregator | `src/analyze/runtimes/__tests__/aggregate-absent-inputs.test.ts` |

**unit: the adherence check resolves its repository once and reads neither constraintsSource nor upstreamOutputs**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | the code family's scope function and its test hook are gone and no code runtime uses the scope's value as a repo path | `src/analyze/runtimes/__tests__/scope-sources.test.ts` |
| pass | a constraintsSource in the params is not read: beside usable ids the ids are used, and the upstream outputs are never looked at | `src/analyze/runtimes/shared/__tests__/adherence-constraints.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `src/analyze/runtimes/__tests__/aggregate-absent-inputs.test.ts` | 0 | 1 | 0.6 s |  |
| `src/analyze/runtimes/__tests__/completeness-all-runtimes.test.ts` | 0 | 7 | 1.7 s |  |
| `src/analyze/runtimes/__tests__/dropped-or-failed.test.ts` | 0 | 3 | 0.9 s |  |
| `src/analyze/runtimes/__tests__/partly-read-plan-tasks.test.ts` | 0 | 4 | 0.9 s |  |
| `src/analyze/runtimes/__tests__/scope-sources.test.ts` | 0 | 7 | 0.3 s |  |
| `src/analyze/runtimes/shared/__tests__/adherence-constraints.test.ts` | 0 | 6 | 1.1 s |  |
| `src/analyze/runtimes/shared/__tests__/adherence-topic-route.test.ts` | 0 | 8 | 1.3 s |  |
