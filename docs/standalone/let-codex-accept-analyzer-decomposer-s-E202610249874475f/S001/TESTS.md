<!-- insrc:artifact TESTS-9874475f902756f6-S001 -->

# Tests: 9874475f902756f6 S001

What the build validation gate ran for each Task of this Story, and what each test case did. The gate runs the tests itself; a result here is never a builder's statement unless it says so. `not found` means no test of that title ran in that file.

**Totals:** 21 pass, 0 fail, 0 skipped, 0 not found; 2 reported by the builder and not run by the gate.

## t1

Run at 2026-10-24T14:19:36.403Z on commit `0e258e3d1`. Tests check: **passed**. 3 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**unit: every exploration type has exactly one params branch, derived from EXPLORATION_TYPES**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | every exploration type has exactly one params branch, derived from EXPLORATION_TYPES | `src/analyze/explore/__tests__/params-schema.test.ts` |

**unit: each branch is closed, requires no param, and admits null and a placeholder string for every value**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | each branch is closed, requires no param, and admits null and a placeholder string for every value | `src/analyze/explore/__tests__/params-schema.test.ts` |

**unit: every documented params example in the decomposer prompt validates against its type's branch**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | every documented params example in the decomposer prompt validates against its type's branch | `src/analyze/explore/__tests__/params-schema.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `src/analyze/explore/__tests__/params-schema.test.ts` | 0 | 3 | 0.5 s |  |

## t2

Run at 2026-10-24T14:23:46.628Z on commit `e756417d6`. Tests check: **passed**. 5 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**unit: the codex strict copy of DECOMPOSE_SCHEMA contains no object without properties and no object whose additionalProperties is not false**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | the codex strict copy of DECOMPOSE_SCHEMA contains no object without properties and no object whose additionalProperties is not false | `src/analyze/context/__tests__/decompose-params.test.ts` |

**unit: decompose and finalizeDecompose remove null params, so the executor receives today's params**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | decompose and finalizeDecompose remove null params, so the executor receives today's params | `src/analyze/context/__tests__/decompose-params.test.ts` |

**unit: an exploration carrying a key its type does not declare fails with DecomposerSchemaUnrecoverable at decompose and at finalizeDecompose, and the one-shot driver runs the freeform.probe fallback instead of the plan**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | an exploration carrying a key its type does not declare fails with DecomposerSchemaUnrecoverable at decompose and at finalizeDecompose | `src/analyze/context/__tests__/decompose-params.test.ts` |
| pass | a plan whose exploration carries a param its type does not take is not executed: the one-shot driver runs the freeform.probe fallback instead | `src/analyze/context/__tests__/pipeline-outcome.test.ts` |

**unit: empty params, a placeholder string where an array is expected, and a plan omitting optional params validate against DECOMPOSE_SCHEMA**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | empty params, a placeholder string where an array is expected, and a plan omitting optional params validate against DECOMPOSE_SCHEMA | `src/analyze/context/__tests__/decompose-params.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `src/analyze/context/__tests__/decompose-params.test.ts` | 0 | 4 | 0.5 s |  |
| `src/analyze/context/__tests__/pipeline-outcome.test.ts` | 0 | 19 | 0.7 s |  |

## t3

Run at 2026-10-24T14:25:59.732Z on commit `18aeeef6c`. Tests check: **passed**. 2 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**unit: the 27 built-in templates yield a branch each, with exactly their 9 slot sets at the expected paths**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | the 27 built-in templates yield a branch each, with exactly their 9 slot sets at the expected paths | `src/analyze/planner/__tests__/wire-schema.test.ts` |

**unit: a slot is placed only at a position the original schema restricts to an object, and the adherence root one-of-three is left out of the branch**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | a slot is placed only at a position the original schema restricts to an object, and the adherence root one-of-three is left out of the branch | `src/analyze/planner/__tests__/wire-schema.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `src/analyze/planner/__tests__/wire-schema.test.ts` | 0 | 2 | 0.6 s |  |

## t4

Run at 2026-10-24T14:31:17.318Z on commit `7a5df2bb5`. Tests check: **passed**. 4 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**unit: no inputSchema, a local reference, a union with a string, and a draft-07 tuple each yield a whole-params slot, and no built-in template falls back**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | no inputSchema, a local reference, a union with a string, and a draft-07 tuple each yield a whole-params slot, and no built-in template falls back | `src/analyze/planner/__tests__/wire-schema.test.ts` |

**unit: repeated and recursive wire-schema builds with identical and different catalogs compile through validateAgainstSchema and validateCodexReply without an id collision**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | repeated and recursive wire-schema builds with identical and different catalogs compile through validateAgainstSchema and validateCodexReply without an id collision | `src/analyze/planner/__tests__/wire-schema.test.ts` |

**unit: two catalogs sharing a template id with different inputSchemas get different wire schemas**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | two catalogs sharing a template id with different inputSchemas get different wire schemas | `src/analyze/planner/__tests__/wire-schema.test.ts` |

**unit: the codex strict copy of the built-in planner wire schema for every target contains no open object**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | the codex strict copy of the built-in planner wire schema for every target contains no open object | `src/analyze/planner/__tests__/wire-schema.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `src/analyze/planner/__tests__/wire-schema.test.ts` | 0 | 6 | 1.2 s |  |

## t5

Run at 2026-10-24T15:32:05.516Z on commit `864cacca4`. Tests check: **passed**. 4 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**unit: runPlanner sends a wire schema covering exactly its effective catalog, and a supplied scopeRef round-trips through a slot into INV-5 unchanged**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | runPlanner sends a wire schema covering exactly its effective catalog, and a supplied scopeRef round-trips through a slot into INV-5 unchanged | `src/analyze/planner/__tests__/wire-decode.test.ts` |

**unit: supplied templates with no inputSchema, local references, a union with a string, and a draft-07 tuple round-trip as whole-params slots and pass INV-5 as today**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | supplied templates with no inputSchema, local references, a union with a string, and a draft-07 tuple round-trip as whole-params slots and pass INV-5 as today | `src/analyze/planner/__tests__/wire-decode.test.ts` |

**unit: nulls the wire form forced are removed at structural positions only: slot contents and whole-params reach INV-5 as written, and the adherence one-of-three rule still holds**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | nulls the wire form forced are removed at structural positions only: slot contents and whole-params reach INV-5 as written, and the adherence one-of-three rule still holds | `src/analyze/planner/__tests__/wire-decode.test.ts` |

**unit: invalid JSON in a slot is reported through the planner failure path and nothing partial reaches INV-5**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | invalid JSON in a slot is reported through the planner failure path and nothing partial reaches INV-5 | `src/analyze/planner/__tests__/wire-decode.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `src/analyze/planner/__tests__/wire-decode.test.ts` | 0 | 4 | 1.1 s |  |

## t6

Run at 2026-10-24T14:54:38.197Z on commit `e30ce2a04`. Tests check: **passed**. 3 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**unit: the planner's output-shape block is the call's wire schema and the catalog lists each template's slot paths**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | the output shape is the call's wire schema and the catalog lists each template's slot paths, marking whole-params slots | `src/analyze/planner/__tests__/wire-messages.test.ts` |

**unit: a correction retry echoes the rejected plan and the offending task in wire form**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | a correction retry echoes the rejected plan and the offending task in wire form | `src/analyze/planner/__tests__/wire-messages.test.ts` |

**unit: the planner system prompt names the slot exception with the aggregator example and allows null for absent optional values**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | the planner system prompt names the slot exception with the aggregator example and allows null for absent optional values | `src/analyze/planner/__tests__/wire-messages.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `src/analyze/planner/__tests__/wire-messages.test.ts` | 0 | 3 | 0.8 s |  |

## t7

Run at 2026-10-24T14:58:53.441Z on commit `638bc9291`. Tests check: **passed**. 0 pass, 0 fail, 0 skipped, 0 not found; 1 reported by the builder and not run by the gate.

the gate ran no test: every named test of this Task was reported by the builder

**live: codex accepts the complete DECOMPOSE_SCHEMA and every built-in planner wire schema, and the replies pass the reply check**

Reported by the builder, not run by the gate: **pass**. Evidence: docs/standalone/let-codex-accept-analyzer-decomposer-s-E202610249874475f/S001/evidence/t7-live-codex.md (run of src/analyze/__tests__/codex-plan-schemas.live.test.ts with INSRC_LIVE_TESTS=1, plus the PLAN_TASK_SCHEMA control)

## t8

Run at 2026-10-24T15:28:28.004Z on commit `864cacca4`. Tests check: **passed**. 0 pass, 0 fail, 0 skipped, 0 not found; 1 reported by the builder and not run by the gate.

the gate ran no test: every named test of this Task was reported by the builder

**smoke: a one-shot insrc_analyze on the rebuilt daemon's codex tier returns a plan**

Reported by the builder, not run by the gate: **pass**. Evidence: docs/standalone/let-codex-accept-analyzer-decomposer-s-E202610249874475f/S001/evidence/t8-rollout-smoke.md (run mcp-1792854654039-jybhub; /tmp/.insrc/daemon.log 15:10:54-15:12:00)
