# Story s7: tests and their results

Run on 2026-10-08 at commit `f74fb47f`, Node 22, each file with `npx tsx --test --test-force-exit`. A result of `not found` means no test of that title ran in that file.

Totals: 12 pass, 0 fail, 0 skipped, 0 not found.

## t1: One function for the pairing check and resolution; the indexed check takes readers

**Plan test (unit):** prepareScope and stepScope accept, refuse and return what they did, and prepareScope makes no pairing check in classification or task mode (mutation: make the check in every mode)

| Result | Test | File |
|---|---|---|
| pass | runShaper refuses a pairing the table does not allow before resolving the scope | `src/analyze/context/__tests__/prepare-scope.test.ts` |
| pass | runShaper accepts every pairing in the corrected table | `src/analyze/context/__tests__/prepare-scope.test.ts` |
| pass | the pairing is checked for run mode only: classification and task inputs are not refused | `src/analyze/context/__tests__/prepare-scope.test.ts` |
| pass | resolveScopeForTarget: every pairing of the table resolves to what resolveScope gives; every other pairing is refused before a reader is touched | `src/analyze/context/__tests__/prepare-scope.test.ts` |
| pass | prepareScope makes no pairing check outside run mode: a refused pairing resolves to what resolveScope gives | `src/analyze/context/__tests__/prepare-scope.test.ts` |
| pass | step tool start phase: resolved workspace scope, and the pairing test refusing a stand-in scope | `src/mcp/__tests__/analyze-step-scope.test.ts` |

Mutations tried, each restored afterwards:

- prepareScope makes the pairing check in every mode: 2 tests fail
- resolveScopeForTarget makes no pairing check: 4 tests fail
- resolveScopeForTarget drops the readers it is given: 5 tests fail

**Plan test (unit):** the indexed check reads the registry and entities through the readers it is given, and the real store when given none

| Result | Test | File |
|---|---|---|
| pass | ensureNonEmptyClosure: given readers it reads the registry and the entities through them, not the real store | `src/analyze/context/__tests__/invariants.test.ts` |
| pass | ensureNonEmptyClosure: with readers the check keeps its leniency for a registry that cannot be read or holds no repo | `src/analyze/context/__tests__/invariants.test.ts` |
| pass | ensureNonEmptyClosure: pristine registry -> skipped silently, returns undefined | `src/analyze/context/__tests__/invariants.test.ts` |
| pass | ensureNonEmptyClosure: registered repo with entities -> returns repo path | `src/analyze/context/__tests__/invariants.test.ts` |
| pass | ensureNonEmptyClosure: registered repo with ZERO entities -> ScopeNotIndexedError | `src/analyze/context/__tests__/invariants.test.ts` |
| pass | ensureNonEmptyClosure: scope outside every registered repo -> ScopeNotIndexedError | `src/analyze/context/__tests__/invariants.test.ts` |

Mutations tried, each restored afterwards:

- the check reads the registry from the real store when given readers: 1 test fails
- the check reads the entities from the real store when given readers: 1 test fails

## t2: The one scope function for plan tasks

**Plan test (unit):** a table test over four families and seven kinds of scope: pairings in the table resolve, the rest throw the mismatch error naming the kinds allowed (mutation: give a family a kind outside its row)

Not written yet.

**Plan test (unit):** a kind added to a row of a stand-in table is accepted

Not written yet.

**Plan test (unit):** a module, a file, a symbol and a connection scope resolve to the registered repo and the area

Not written yet.

**Plan test (unit):** a scope in no registered repo is not indexed for code and docs and resolves for infra and data

Not written yet.

**Plan test (unit):** an unreadable or empty registry does not refuse a path scope; a symbol scope fails as resolveScope decides (mutation: treat a null repo as not indexed)

Not written yet.

## t3: A refused scope is a coded failure on the task record

**Plan test (unit):** one function maps the three scope error classes to their codes and data, and both mapping functions return through it what they returned before (mutation: return the code alone)

Not written yet.

**Plan test (integration):** a runtime that throws each typed scope error is a failed task with that code and no 'runtime-threw:' prefix; any other error has no code (mutation: drop the class check)

Not written yet.

**Plan test (integration):** the plan's and the run's tasksFailed and the daemon's response carry the code

Not written yet.

## t4: The infra and data tasks take their scope from the scope function

**Plan test (integration):** a data task with a connection scope works on that connection only

Not written yet.

**Plan test (integration):** a data task on an unregistered directory and on a manifest directory inside a registered repo opens its pool at that directory (mutation: open it at the containing repo)

Not written yet.

**Plan test (integration):** an infra task accepts its three kinds and refuses a file scope with the mismatch code; the connection-listing task gives the same result for a repo scope as before

Not written yet.

**Plan test (unit):** the infra and data scope functions are gone and no infra or data runtime uses the scope's value as a repo path

Not written yet.

## t5: The code tasks take their scope from the scope function and keep to its area

**Plan test (integration):** a code task with a module scope uses only the entities under that directory, with a file scope only that file's, with a symbol scope the one entity

Not written yet.

**Plan test (integration):** the adherence check gives the same result for a repo scope as before, as a code, a data and an infra template, and as a data template on an unregistered directory is not refused

Not written yet.

**Plan test (unit):** the code family's scope function and its test hook are gone and no code runtime uses the scope's value as a repo path

Not written yet.

## t6: The docs tasks take their scope from the scope function

**Plan test (integration):** the docs tasks give the same result for a repo scope as before the change, and refuse a symbol scope with the mismatch code

Not written yet.

**Plan test (integration):** the family-summary task with a module scope keeps only the summaries of documents under that directory, and with a file scope only that file's

Not written yet.

**Plan test (unit):** no docs runtime uses the scope's value as a repo path

Not written yet.

## t7: The docs constraint and decision tasks keep to their area at retrieval

**Plan test (integration):** a docs constraint task and a docs decision task with a module scope retrieve only sections under that directory and count within it; without an area the runners and the lookup pipeline's calls return what they did (mutation: drop the area at the hand-over from runner to prepare)

Not written yet.

## t8: The vector pass of document retrieval keeps to the area

**Plan test (integration):** a docs task with a module scope whose sections are not among the repository's nearest matches still gets them from the vector pass (mutation: search the whole repository and drop what lies outside)

Not written yet.

**Plan test (integration):** the vector search given an empty list of ids makes no query; given a large list it returns the nearest of them, in one query or in batches merged by distance; with no area the query is as before

Not written yet.

## t9: The aggregator is told which inputs are absent

**Plan test (integration):** the aggregator's prompt lists each absent input with its producer and reason after the outputs that exist, and is unchanged when nothing is absent

Not written yet.

**Plan test (integration):** each of the five aggregate-report runtimes hands absentInputs to the aggregator

Not written yet.

## t10: The aggregate task runs on the inputs that exist

**Plan test (integration):** a plan in which one of three producers failed has a final report written from the two that exist, with the third named as absent (mutation: skip the aggregate task as before)

Not written yet.

**Plan test (integration):** a plan in which every producer failed has no final report; a task other than the aggregate task with a missing input is still skipped; an aggregate task that throws still fails the run

Not written yet.

**Plan test (integration):** a plan whose aggregate task consumes nothing runs with and without a failed task before it (mutation: skip an aggregate task that consumes nothing)

Not written yet.

**Plan test (integration):** a nested plan in which one child task failed gives a root report, and the answer report names the child's task by its path

Not written yet.

## t11: A failure outside a task's runtime fails that task, not the walk

**Plan test (integration):** a writing failure while the walk handles one task fails that task and the walk goes on; an error not tied to a task propagates

Not written yet.

## t12: A run that dies says so: live runs are counted and an uncaught error is recorded

**Plan test (integration):** an uncaught error gives a failed record at the stage reached and a returned failure, 'done' fires once and the run is no longer live (mutation: remove the handler)

Not written yet.

**Plan test (integration):** a run is live from its first read of a record until it returns, and with two runs under one id until the second returns (mutation: hold a set of ids instead of a count)

Not written yet.

**Plan test (integration):** with a run record that cannot be written the handler still returns 'internal-error' and fires 'done' once (mutation: let the write's error escape)

Not written yet.

**Plan test (integration):** a completed run asked for again returns its stored result and report; a record left in progress is replaced by the new run's first record, with no abandoned rewrite

Not written yet.

## t13: The run checks its scope once before it plans

**Plan test (integration):** a docs run on a scope in no registered repo ends at stage 'plan' with 'scope-not-indexed' before the planner is called; a refused pairing still ends at 'classify'; a generic run is not checked (mutation: remove the check before planning)

Not written yet.

## t14: A record with no live run is abandoned when it is read

**Plan test (integration):** a record in progress with no live run is rewritten as 'run-abandoned' by the status request, on disk too (mutation: return the record as read)

Not written yet.

**Plan test (integration):** the daemon's purge request purges such a record without force; purgeRun with no liveness refuses it; a live run's record is returned unchanged and refused

Not written yet.

**Plan test (integration):** the daemon's handler writes the record and sends its stage, not 'classify', for a runAnalyze that throws, and sends both frames when the record cannot be written

Not written yet.

**Plan test (integration):** with a record that cannot be written the status request still says 'run-abandoned' and the purge still removes the directory (mutation: let the rewrite's error escape)

Not written yet.

**Plan test (integration):** no reader changes a record that is 'ok' or 'failed'

Not written yet.

## t15: A run request with no prompt and a stated source is accepted

**Plan test (unit):** an empty prompt with a stated kind of source is accepted and gives an unfocused intent; with none it is refused with the new message

Not written yet.

**Plan test (unit):** a prompt of only white space is accepted with and without a stated kind of source (mutation: treat white space as empty at the parser)

Not written yet.

## t16: The HLD's wording on run records is brought in line

**Plan test (smoke):** the rendered HLD equals what its renderer gives for the stored data, and the Epic's designs pass the approved-and-fresh gate once the HLD is approved

Not written yet.

## t17: The daemon guide, the live checks and the baseline comparison

**Plan test (live):** an infra request and a data request each complete with a final report

Not written yet.

**Plan test (live):** a code request returns a final report whose first line names the failed functional-surface tasks

Not written yet.

**Plan test (live):** a request with an empty prompt and a stated kind of source completes

Not written yet.

**Plan test (live):** infra or data requests at sizes above S: a plan with a planner-kind task runs its child plan, or the sizes tried are recorded and the nested integration test stands

Not written yet.

**Plan test (live):** a docs request, recorded as the accepted exception

Not written yet.

**Plan test (smoke):** no test of the four suites that passed in the baseline fails after the last Task, other than the tests of the three removed scope functions

Not written yet.

