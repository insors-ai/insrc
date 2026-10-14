<!-- insrc:artifact CR-0c845762241ba26c-S001 -->

# Code review: 0c845762241ba26c:S001

⚠️ **WARN** — HIGH 0 · MED 1 · LOW 4 · model `claude:opus`

**Changed files:** 2

## adherence — 0 finding(s)

_No findings._

## conventions — 0 finding(s)

_No findings._

## coverage — 2 finding(s)

| Severity | Location | Message |
| --- | --- | --- |
| MED | src/analyze/context/driver.ts:375 | checkScopeState is changed: it now sends docs (and every other checked source) through ensureScopeQueryable instead of ensureNonEmptyClosure/ensureRepoQueryable. Its testsReaching edge list is empty, but that is because the grounding only sees the diff at file level. The new test in this Story's changed set, src/analyze/context/__tests__/run-shaper-wiring.test.ts:598 ("runShaper (ISSUE-0c845762): a docs run on a scope the index does not hold…"), calls runShaper with shaperId 'docs'. It covers the cold path, the warm path (servedFromCache → checkScopeState) and the scopeChecked bypass, so this is not a missing test. No build record exists, so the test is present but its pass-state is unverified. Run the file under Node 22 to confirm it is green before completing the Story. |
| LOW | src/analyze/context/driver.ts:376 | checkScopeState also changed for the data and infra sources: they used to go through ensureRepoQueryable and now go through ensureScopeQueryable(scope, shaperId). The only test in this Story's changed set covers the docs source. The changed set shows no test that confirms data or infra are still refused only for a repository under index, and not also for an empty closure. The same gap applies to the new early return for classification and generic. Pre-existing tests may cover this, but nothing in the provided evidence shows it, so coverage of this part is unverified. |

## quality — 3 finding(s)

| Severity | Location | Message |
| --- | --- | --- |
| LOW | src/analyze/context/driver.ts:376 | checkScopeState now carries its own `classification`/`generic` early return, which repeats the exclusion checksScopeState already applies before every call site (the doc comment says these requests are 'never checked (checksScopeState)'). Two guards now encode the same rule and can drift apart. One option is to rely on checksScopeState alone. Another is to narrow the shaperId parameter type so the second guard is unnecessary. |
| LOW | src/analyze/context/driver.ts:80 | driver.ts (the context layer) now imports ensureScopeQueryable from '../runtimes/shared/task-scope.js', so the context layer depends on the runtimes layer. If the old invariants.js helpers (ensureNonEmptyClosure / ensureRepoQueryable) are no longer called anywhere except through task-scope, check whether they are now dead exports or should be the single home of the per-source rule. This is a layering and tidiness concern, not a behaviour defect. |
| LOW | src/analyze/context/__tests__/run-shaper-wiring.test.ts:604 | The new test registers the repository 'empty' through addRepo and never calls removeRepo. If other tests in this file share the sandbox registry, the leftover registration can change their scope resolution depending on run order. Wrapping the test body in try/finally with removeRepo would keep the test isolated. |

