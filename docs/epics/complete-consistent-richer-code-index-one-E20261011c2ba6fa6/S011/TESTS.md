<!-- insrc:artifact TESTS-c2ba6fa62a148ed1-s11 -->

# Tests: c2ba6fa62a148ed1 s11

What the build validation gate ran for each Task of this Story, and what each test case did. The gate runs the tests itself; a result here is never a builder's statement unless it says so. `not found` means no test of that title ran in that file.

**Totals:** 63 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

## t1

Run at 2026-10-12T11:26:57.256Z on commit `9f1697eb`. Tests check: **passed**. 5 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**unit: review stream module: ReviewStreamError from src/shared/review-stream.ts is the same class daemon-stream.ts exports, and the routing tests pass unchanged**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | review stream module: ReviewStreamError from src/shared/review-stream.ts is the same class daemon-stream.ts exports, and the routing tests pass unchanged | `src/shared/__tests__/review-stream.test.ts` |
| pass | T11 a daemon review that fails (timeout) is an error: nothing stamped, no controller loop offered | `src/mcp/review-step/__tests__/review-step-routing.test.ts` |
| pass | T11 against an older daemon (a plain unknown-method line, socket kept open) the tool fails at once with the update message | `src/mcp/review-step/__tests__/review-step-routing.test.ts` |
| pass | T17 a diff the daemon cannot read comes back as a failed daemon review naming the cause; nothing is stamped | `src/mcp/code-review-step/__tests__/routing.test.ts` |
| pass | T11 the tool waits 30 minutes: with a daemon that never answers it fails when that limit fires | `src/mcp/code-review-step/__tests__/routing.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `src/mcp/code-review-step/__tests__/routing.test.ts` | 0 | 21 | 0.7 s |  |
| `src/mcp/review-step/__tests__/review-step-routing.test.ts` | 0 | 20 | 0.5 s |  |
| `src/shared/__tests__/review-stream.test.ts` | 0 | 1 | 0.4 s |  |

## t2

Run at 2026-10-12T11:35:47.361Z on commit `dcecd4d1`. Tests check: **passed**. 4 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**unit: vector store owner rule: live path refused with no declaration and nothing created; opens after declareLiveStoreOwner; a temporary path opens; relative path and symbolic link refused**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | vector store owner rule: live path refused with no declaration and nothing created; opens after declareLiveStoreOwner; a temporary path opens; relative path and symbolic link refused | `src/db/lance/__tests__/live-vector-store-owner.test.ts` |
| pass | vector store owner rule: the graph store's temporary reader allowance does not open the live vector store | `src/db/lance/__tests__/live-vector-store-owner.test.ts` |

**integration: no test opens the live vector store: each repaired test file run in a temporary home leaves no lance directory**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | no test opens the live vector store: each repaired test file run in a temporary home leaves no lance directory | `src/db/lance/__tests__/no-live-vector-store-in-tests.test.ts` |
| pass | the check sees a vector store that IS opened at the default path | `src/db/lance/__tests__/no-live-vector-store-in-tests.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `src/db/lance/__tests__/live-vector-store-owner.test.ts` | 0 | 2 | 1 s |  |
| `src/db/lance/__tests__/no-live-vector-store-in-tests.test.ts` | 0 | 2 | 30.7 s |  |

## t3

Run at 2026-10-12T11:43:13.587Z on commit `62ccb310`. Tests check: **passed**. 17 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**unit: moved analyze tests pass at src/daemon/steps (the analyze-step suite, bundle-md, and the repointed importers and source scans)**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | a missing answer prompt after the lookups ran returns a non-retryable error with the results and the report, from the plan phase and from the narrow phase | `src/daemon/steps/__tests__/analyze-step-answer-prompt-missing.test.ts` |
| pass | the step tool's bundle phase attaches the report it derives from its state and rejects an agent-supplied one as 'bundle-schema' | `src/daemon/steps/__tests__/analyze-step-bundle-report.test.ts` |
| pass | stepPlan with a lookup whose prepare throws records the failed output and goes on to the next lookup (mutation: remove the conversion) | `src/daemon/steps/__tests__/analyze-step-failed-lookup.test.ts` |
| pass | handler rejects non-object input | `src/daemon/steps/__tests__/analyze-step-handler.test.ts` |
| pass | the step tool carries a caller's stated size in its state token from the start phase to the bundle phase and the answer turn, whose reports give the measured size with that hint; a token minted before the change still decodes | `src/daemon/steps/__tests__/analyze-step-measure.test.ts` |
| pass | state codec round-trips awaiting_narrow with preparedBlob + resumeState | `src/daemon/steps/__tests__/analyze-step-narrow.test.ts` |
| pass | step tool start phase: resolved workspace scope, and the pairing test refusing a stand-in scope | `src/daemon/steps/__tests__/analyze-step-scope.test.ts` |
| pass | encodeState + decodeState round-trip preserves every field | `src/daemon/steps/__tests__/analyze-step-state.test.ts` |
| pass | render includes the meta comment prefix by default | `src/daemon/steps/__tests__/bundle-md.test.ts` |
| pass | every writer of an answer's head (the run context's markdown, both writers of the bundle's markdown, the step tool's answer turn, both writers of the workflow runner, and the plan tree's final report) carries the measure line under the completeness line; the plan tree's merged report carries the run's measure; and a report or a run record stored before the change is read as it is | `src/analyze/__tests__/report-head.test.ts` |
| pass | executor dispatches to the registered runner | `src/analyze/explore/__tests__/executor-lmdb.test.ts` |
| pass | the daemon's error payload, the one-shot tool's message and the workflow runner's step failure carry the report and the reason | `src/daemon/__tests__/answer-step-failed-callers.test.ts` |
| pass | the context builder gives the planning call the size of the named-area measure, gives the answer step the size of the measure from lookup results, and puts that measure in the report, as do the step tool's bundle phase and answer turn; the one-shot tool, the step tool and the workflow runner set no size of their own; the free-form lookup uses the request size its runner context carries and, when it carries none, measures its resolved scope or a repo scope at its repo path | `src/analyze/context/__tests__/lookup-measure.test.ts` |
| pass | a source scan finds no call that picks a size with a model and no literal default size at the four places that set M today (mutation: restore one default) | `src/analyze/classifier/__tests__/no-size.test.ts` |
| pass | no source file under src/daemon/steps/analyze-step writes a literal schema version | `src/analyze/context/__tests__/bundle-report-schema.test.ts` |
| pass | the one-shot tool and the workflow runner state no size of their own and their answers carry the measure line; a run-level request needs no size on its intent, and a run and a plan request for the same scope share one cached run bundle | `src/daemon/__tests__/analyze-rpc-measure.test.ts` |
| pass | the MCP step and review tests, found by the full audit, create nothing at the default path | `src/db/graph/__tests__/no-live-store-in-tests.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `src/analyze/__tests__/report-head.test.ts` | 0 | 1 | 0.8 s |  |
| `src/analyze/classifier/__tests__/no-size.test.ts` | 0 | 2 | 0.6 s |  |
| `src/analyze/context/__tests__/bundle-report-schema.test.ts` | 0 | 3 | 0.4 s |  |
| `src/analyze/context/__tests__/lookup-measure.test.ts` | 0 | 4 | 0.9 s |  |
| `src/analyze/explore/__tests__/executor-lmdb.test.ts` | 0 | 9 | 1.4 s |  |
| `src/daemon/__tests__/analyze-rpc-measure.test.ts` | 0 | 3 | 1 s |  |
| `src/daemon/__tests__/answer-step-failed-callers.test.ts` | 0 | 3 | 0.6 s |  |
| `src/daemon/steps/__tests__/analyze-step-answer-prompt-missing.test.ts` | 0 | 2 | 0.7 s |  |
| `src/daemon/steps/__tests__/analyze-step-bundle-report.test.ts` | 0 | 1 | 0.5 s |  |
| `src/daemon/steps/__tests__/analyze-step-failed-lookup.test.ts` | 0 | 7 | 1.2 s |  |
| `src/daemon/steps/__tests__/analyze-step-handler.test.ts` | 0 | 8 | 0.6 s |  |
| `src/daemon/steps/__tests__/analyze-step-measure.test.ts` | 0 | 1 | 0.7 s |  |
| `src/daemon/steps/__tests__/analyze-step-narrow.test.ts` | 0 | 4 | 0.6 s |  |
| `src/daemon/steps/__tests__/analyze-step-scope.test.ts` | 0 | 3 | 0.7 s |  |
| `src/daemon/steps/__tests__/analyze-step-state.test.ts` | 0 | 11 | 0.5 s |  |
| `src/daemon/steps/__tests__/bundle-md.test.ts` | 0 | 8 | 0.3 s |  |
| `src/db/graph/__tests__/no-live-store-in-tests.test.ts` | 0 | 5 | 5.9 s |  |

## t4

Run at 2026-10-12T11:48:00.943Z on commit `92c6ea9c`. Tests check: **passed**. 24 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**unit: moved workflow, build and triage tests pass at src/daemon/steps, and workflow-rpc imports nothing from src/mcp**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | T30/T31: two Stories approved in ONE sweep, built in turn — each change log is EXACTLY its own files (build-start file committed with the work) | `src/daemon/steps/build-step/__tests__/build-start.test.ts` |
| pass | implement: approved+fresh plan returns a prompt carrying acceptance checks + issue ref | `src/daemon/steps/build-step/__tests__/build-step.test.ts` |
| pass | the validate prompts no longer instruct running the repo-wide sweep or any shell command, and the implement prompt still cites it | `src/daemon/steps/build-step/__tests__/render.test.ts` |
| pass | admitStandaloneBuild: trivial (no LLD) is admitted directly | `src/daemon/steps/build-step/__tests__/standalone-implement.test.ts` |
| pass | the captured run in the Story's tap-sample folder gives the result of each of its titles: pass, fail, skipped for ' # SKIP' with and without a reason, and skipped for ' # TODO' | `src/daemon/steps/build-step/__tests__/tap-results.test.ts` |
| pass | a mapping is refused, with every fault listed, for an unknown name, a repeated name, a file that is not a tracked '.test.ts' file in the repository, a path that leaves the repository, an empty title, an entry with neither cases nor a reported result, and a reported result on a unit, an integration and a contract test and on a test with no level | `src/daemon/steps/build-step/__tests__/test-mapping.test.ts` |
| pass | resolveTaskTestFiles maps plan test names to tracked __tests__ files, de-duplicates, and lists names with no match as unresolved | `src/daemon/steps/build-step/__tests__/validation-checks.test.ts` |
| pass | start: returns emit_classification with a schema, prompt, and state token | `src/daemon/steps/triage-step/__tests__/handler.test.ts` |
| pass | LLD s4 amendment proposal lands as pending AmendmentRecord | `src/daemon/steps/workflow-step/__tests__/amendments-e2e.test.ts` |
| pass | t5: a payload carrying BrainstormElicitState round-trips unchanged through save->token->load | `src/daemon/steps/workflow-step/__tests__/brainstorm-state.test.ts` |
| pass | define workflow: happy path writes artifact to docs/epics/<slug>-E.../DEF.md | `src/daemon/steps/workflow-step/__tests__/define-e2e.test.ts` |
| pass | define EXTEND: scope=extend → skip frame/compose → append Story + pending amendment + ExtendArtifact | `src/daemon/steps/workflow-step/__tests__/define-extend-e2e.test.ts` |
| pass | design.epic: happy path writes HLD.md under docs/epics/<slug>-E.../ | `src/daemon/steps/workflow-step/__tests__/design-epic-e2e.test.ts` |
| pass | design.story enhancement: happy path writes LLD under docs/epics/<slug>-E.../S<nnn>/LLD.md | `src/daemon/steps/workflow-step/__tests__/design-story-e2e.test.ts` |
| pass | stub workflow: start → plan → synthesize → done writes artifact | `src/daemon/steps/workflow-step/__tests__/handler.test.ts` |
| pass | plan happy path: writes a PlanArtifact under docs/epics/<slug>-E.../S<nnn>/PLAN.md | `src/daemon/steps/workflow-step/__tests__/plan-e2e.test.ts` |
| pass | start gates on an unresolved HLD open question, returns resolve_questions with options | `src/daemon/steps/workflow-step/__tests__/questions-gate-e2e.test.ts` |
| pass | augmentStandaloneParams: no-op unless standalone===true | `src/daemon/steps/workflow-step/__tests__/standalone-keying.test.ts` |
| pass | save + load round-trip | `src/daemon/steps/workflow-step/__tests__/state-store.test.ts` |
| pass | tracker.push: happy path patches Epic meta.tracker with refs | `src/daemon/steps/workflow-step/__tests__/tracker-e2e.test.ts` |
| pass | coarse push with pushTasks: execute prompt carries the TASK TIER block + the approved plan tasks | `src/daemon/steps/workflow-step/__tests__/tracker-tasks-coarse.test.ts` |
| pass | workflow-rpc imports nothing from src/mcp, and takes the workflow step from src/daemon/steps | `src/daemon/steps/__tests__/workflow-rpc-imports.test.ts` |
| pass | t4: the workflow-step handler phase switch gains NO brainstorm case (new workflow value, not a new phase) | `src/workflow/runners/brainstorm/__tests__/registration.test.ts` |
| pass | handler rejects non-object input | `src/daemon/steps/__tests__/analyze-step-handler.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `src/daemon/steps/__tests__/analyze-step-handler.test.ts` | 0 | 8 | 0.8 s |  |
| `src/daemon/steps/__tests__/workflow-rpc-imports.test.ts` | 0 | 1 | 0.3 s |  |
| `src/daemon/steps/build-step/__tests__/build-start.test.ts` | 0 | 13 | 4.5 s |  |
| `src/daemon/steps/build-step/__tests__/build-step.test.ts` | 0 | 63 | 11.1 s |  |
| `src/daemon/steps/build-step/__tests__/render.test.ts` | 0 | 5 | 0.5 s |  |
| `src/daemon/steps/build-step/__tests__/standalone-implement.test.ts` | 0 | 5 | 0.5 s |  |
| `src/daemon/steps/build-step/__tests__/tap-results.test.ts` | 0 | 5 | 0.3 s |  |
| `src/daemon/steps/build-step/__tests__/test-mapping.test.ts` | 0 | 4 | 0.3 s |  |
| `src/daemon/steps/build-step/__tests__/validation-checks.test.ts` | 0 | 27 | 7.5 s |  |
| `src/daemon/steps/triage-step/__tests__/handler.test.ts` | 0 | 17 | 0.5 s |  |
| `src/daemon/steps/workflow-step/__tests__/amendments-e2e.test.ts` | 0 | 4 | 0.5 s |  |
| `src/daemon/steps/workflow-step/__tests__/brainstorm-state.test.ts` | 0 | 4 | 0.4 s |  |
| `src/daemon/steps/workflow-step/__tests__/define-e2e.test.ts` | 0 | 3 | 0.5 s |  |
| `src/daemon/steps/workflow-step/__tests__/define-extend-e2e.test.ts` | 0 | 2 | 0.5 s |  |
| `src/daemon/steps/workflow-step/__tests__/design-epic-e2e.test.ts` | 0 | 6 | 0.5 s |  |
| `src/daemon/steps/workflow-step/__tests__/design-story-e2e.test.ts` | 0 | 7 | 0.5 s |  |
| `src/daemon/steps/workflow-step/__tests__/handler.test.ts` | 0 | 3 | 0.5 s |  |
| `src/daemon/steps/workflow-step/__tests__/plan-e2e.test.ts` | 0 | 4 | 0.5 s |  |
| `src/daemon/steps/workflow-step/__tests__/questions-gate-e2e.test.ts` | 0 | 7 | 0.5 s |  |
| `src/daemon/steps/workflow-step/__tests__/standalone-keying.test.ts` | 0 | 5 | 0.4 s |  |
| `src/daemon/steps/workflow-step/__tests__/state-store.test.ts` | 0 | 14 | 0.4 s |  |
| `src/daemon/steps/workflow-step/__tests__/tracker-e2e.test.ts` | 0 | 6 | 0.5 s |  |
| `src/daemon/steps/workflow-step/__tests__/tracker-tasks-coarse.test.ts` | 0 | 4 | 0.5 s |  |
| `src/workflow/runners/brainstorm/__tests__/registration.test.ts` | 0 | 10 | 0.5 s |  |

## t5

Run at 2026-10-12T11:51:53.497Z on commit `f4298fae`. Tests check: **passed**. 13 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**unit: moved review and code-review tests pass at src/daemon/steps, including the routing tests and the three conditional tests**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | start => next:emit_judgements with the four prompts + a file:line-pinned DimensionResult[] schema + grounding + an opaque token (ac1) | `src/daemon/steps/code-review-step/__tests__/handler.test.ts` |
| pass | T10 daemon-authored code gets the judgements prompt as before, and the daemon is not asked | `src/daemon/steps/code-review-step/__tests__/routing.test.ts` |
| pass | start: a uxDefinition subject → emit_judgements with FIVE prompts + a schema admitting ux | `src/daemon/steps/code-review-step/__tests__/ux-handler.test.ts` |
| pass | T13 start on a design returns the review template with next emit_findings | `src/daemon/steps/review-step/__tests__/review-step-findings.test.ts` |
| pass | T9/T14 daemon-authored work runs the controller loop as before, and the daemon is not asked | `src/daemon/steps/review-step/__tests__/review-step-routing.test.ts` |
| pass | review-step drives the full loop and stamps meta.review with model=client | `src/daemon/steps/review-step/__tests__/review-step.test.ts` |
| pass | effectiveJudges keeps diagram only for a subject with an erDefinition/diagram companion | `src/workflow/code-review/__tests__/diagram-conditional.test.ts` |
| pass | effectiveJudges keeps functional-coverage only for a subject with FRs | `src/workflow/code-review/__tests__/functional-coverage-conditional.test.ts` |
| pass | effectiveJudges keeps ux only when hasUxAcceptance | `src/workflow/code-review/__tests__/ux-conditional.test.ts` |
| pass | review-step stays leak-free: updateState is in-place — a multi-turn run keeps ~1 live token | `src/daemon/steps/__tests__/peer-state-store-leakfree.test.ts` |
| pass | no file under src/mcp other than server.ts imports src/daemon/steps | `src/daemon/steps/__tests__/workflow-rpc-imports.test.ts` |
| pass | T11 a daemon review that fails (timeout) is an error: nothing stamped, no controller loop offered | `src/daemon/steps/review-step/__tests__/review-step-routing.test.ts` |
| pass | T17 a diff the daemon cannot read comes back as a failed daemon review naming the cause; nothing is stamped | `src/daemon/steps/code-review-step/__tests__/routing.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `src/daemon/steps/__tests__/peer-state-store-leakfree.test.ts` | 0 | 2 | 0.5 s |  |
| `src/daemon/steps/__tests__/workflow-rpc-imports.test.ts` | 0 | 2 | 0.3 s |  |
| `src/daemon/steps/code-review-step/__tests__/handler.test.ts` | 0 | 28 | 0.5 s |  |
| `src/daemon/steps/code-review-step/__tests__/routing.test.ts` | 0 | 21 | 0.5 s |  |
| `src/daemon/steps/code-review-step/__tests__/ux-handler.test.ts` | 0 | 4 | 0.5 s |  |
| `src/daemon/steps/review-step/__tests__/review-step-findings.test.ts` | 0 | 9 | 0.9 s |  |
| `src/daemon/steps/review-step/__tests__/review-step-routing.test.ts` | 0 | 20 | 0.5 s |  |
| `src/daemon/steps/review-step/__tests__/review-step.test.ts` | 0 | 4 | 0.5 s |  |
| `src/workflow/code-review/__tests__/diagram-conditional.test.ts` | 0 | 7 | 0.5 s |  |
| `src/workflow/code-review/__tests__/functional-coverage-conditional.test.ts` | 0 | 5 | 0.5 s |  |
| `src/workflow/code-review/__tests__/ux-conditional.test.ts` | 0 | 8 | 0.5 s |  |
