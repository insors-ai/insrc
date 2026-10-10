<!-- insrc:artifact ISSUE-a6940f8a25c4521f -->

# A request that cannot be counted is announced as the largest size before it is refused

## Reproduction

Read from the code by the code review of Story s2 of the analyzer epic (finding 12); it can be shown with stand-ins and no model. Send a code request on a path no registered repository contains, and record the run's events. Observed: the run emits `classified` with size XL and a measure that says `determined: false`; it then builds the run's context, and only after that checks the scope and ends the run as refused. Expected: a request that is going to be refused for its scope is not announced as a large run first; where a size is announced that could not be counted, a consumer can tell it from a size that was counted without reading a second field. No consumer was seen acting on the size alone today; the framework's design describes a warning before a large run, which would do so.

## Root cause

The run driver measures the request, sets the intent's size from the measure and emits `classified` at once. A measure that could not be taken is the largest size by rule, so the intent says XL. The check that refuses a scope the index does not hold comes later, after the context has been built. The size on the event is therefore XL both for a request that really is that large and for one that is about to be refused, and the only thing that tells them apart is the `determined` field of the measure beside it.

## Fix intent

A request whose scope will be refused is refused before it is announced as classified with a size, or its announcement makes plain that its size could not be counted. A consumer of the run's events that acts on a large size does not act on a request that is merely unindexed or cannot be resolved. A request that is refused is still refused with the same code and message as today.

## Citations

- **[[c1]]** `code` `src/analyze/orchestrator/driver.ts` — "emit({ type: 'classified', intent, measure });"
- **[[c2]]** `code` `src/analyze/orchestrator/driver.ts` — "await resolveTaskScope(intent.scopeRef, intent.target, 'the run');"
- **[[c3]]** `doc` `docs/plans/handover-2026-10-10.md` — "A request that cannot be counted announces XL before it is refused"
