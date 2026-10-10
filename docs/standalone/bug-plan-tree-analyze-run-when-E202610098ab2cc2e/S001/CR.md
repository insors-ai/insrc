<!-- insrc:artifact CR-8ab2cc2edb3743df-S001 -->

# Code review: 8ab2cc2edb3743df:S001

⚠️ **WARN** — HIGH 0 · MED 1 · LOW 7 · model `claude:opus`

**Changed files:** 23

## adherence — 0 finding(s)

_No findings._

## conventions — 1 finding(s)

| Severity | Location | Message |
| --- | --- | --- |
| LOW | src/analyze/executor/types.ts:40 | The JSDoc block that documents TemplateExecuteArgs ("Arguments handed to a template runtime's execute() call ... `upstreamOutputs` is a Map from produces-name to EVERY output ...") was rewritten by this Story but is still detached from the interface it describes: it is immediately followed by the AbsentInput JSDoc, and the Story inserts the new UpstreamOutput interface between it and TemplateExecuteArgs as well. The detachment pre-dates the Story, but the Story edited the comment and moved it one declaration further away. Elsewhere in the touched modules a doc comment sits directly above its declaration (UpstreamOutput, countOutputs, renderValue, renderUpstreamSection). Moving the block to sit directly above `export interface TemplateExecuteArgs` would restore that. |

## coverage — 3 finding(s)

| Severity | Location | Message |
| --- | --- | --- |
| LOW | src/analyze/runtimes/code/__tests__/aggregate-report.live.test.ts:103 | Present but unverified: the four live aggregate-report suites (code, data, generic, infra) were moved to the new list-shaped upstream map but are gated behind INSRC_LIVE_TESTS and were not run. The Story's own comparison record (commit 50e3b1ea, analyze-suite-comparison-t3.md) counts them among the 92 skipped tests and says they were typechecked only. Their `tasksAnalyzed === SYNTHETIC_UPSTREAM.size` assertion against the new countOutputs path has therefore never executed against a model. The same count is exercised offline by the five-runtimes test in aggregate-absent-inputs.test.ts (expects 4), so this is a residual gap, not an uncovered behaviour. |
| LOW | src/analyze/executor/__tests__/walker-aggregate.test.ts:112 | Present, pass-state unverified by a build record: promised test 8 (existing one-producer assertions kept, consumer-handed assertions rewritten to list form) is not a named test. It is delivered as edits to existing tests in walker-aggregate.test.ts, walker-walk-failure.test.ts and walker.test.ts, which the diff shows. No build record was supplied to this review. The only pass evidence is the Story's comparison record at commit 50e3b1ea, which reports that no test name is gone and no test changed result (1148 before, 1157 after, 0 failures). That record sits outside the changed set I was given and I did not re-run it. |
| LOW | src/analyze/runtimes/shared/__tests__/aggregator.test.ts:386 | Present but outside the supplied grounding, pass-state unverified by a build record: the promised smoke comparison of the whole analyze suite is not a test in the changed set. It exists as a measurement record committed at 50e3b1ea (analyze-suite-comparison-t3.md plus both raw TAP outputs, before bc072f79 and after f50af845). I read it in the repository: it states that no test that passed before fails after, and lists the 9 new test names as passing; 8 of them are the promised named tests and the ninth is the absent-wording unit test. This is the Story's self-reported evidence; no independent build record confirms it. Separately, every changed symbol's `testsReaching` is empty only because the grounding entities are file-level diff entries with no graph edges. The diffs show walker.ts exercised through the plan walk and `_projectUpstreamForTest`/`_unmetDependenciesForTest`, and aggregator.ts through `_buildMessagesForTest`, `_renderUpstreamSectionForTest`, `_renderAbsentSectionForTest` and `runAggregator`, so I report no not-exercised finding for them. |

## quality — 4 finding(s)

| Severity | Location | Message |
| --- | --- | --- |
| MED | src/analyze/runtimes/shared/aggregator.ts:214 | Correctness risk: when a name has several producers but only one finished, the survivor is rendered through the `list.length === 1` branch as a plain `### <name>` block with no task id, template or params. The absent section then says "the output of task t02 under this name is absent; the other outputs under <name> are available", but the model cannot tell which task or directory the remaining output came from, so the report cannot say what it covers. The 'skipped-sibling' case in walker-aggregate.test.ts produces this state (upstream holds t03 only, t02 absent under the same name) but asserts no prompt for it. Consider rendering the attributed sub-section form whenever an absent input with a producer shares the name; the byte-identical guarantee for plans with one producer per name would still hold. |
| LOW | src/analyze/runtimes/shared/aggregator.ts:170 | Correctness risk (minor): `metadata.tasksAnalyzed` and the `upstreamTasks` log field are now `countOutputs`, summed over names. A task that produces two consumed names (as t01 does with `modules` and `module-count` in the tests) is counted twice, and an output whose value is null and renders as `[unavailable: ...]` is counted as analysed. The field name still says tasks. docs/daemon.md documents the new meaning, so this is a naming and semantics drift; counting distinct `taskId`s would keep the name true. |
| LOW | src/analyze/runtimes/shared/aggregator.ts:271 | Duplication: `renderAbsentSection` now holds two near-identical closing paragraphs that differ only in "inputs"/"outputs" and one inserted sentence. A later wording change must be made in both and they can drift. The duplication exists to keep the old section byte-identical; sharing the common tail and inserting the extra sentence conditionally would keep that for the old branch, though it would change the new branch's wording unless "input"/"output" is parameterised. |
| LOW | src/analyze/runtimes/code/__tests__/aggregate-report.live.test.ts:144 | Duplication: the same `asUpstream` helper is pasted into four live test files (code, data, generic, infra). `single` in aggregator.test.ts, `produced` in walker.test.ts and an inline wrapper in completeness-all-runtimes.test.ts do the same wrapping of a value as the one output of a task. One shared test helper would do. |

