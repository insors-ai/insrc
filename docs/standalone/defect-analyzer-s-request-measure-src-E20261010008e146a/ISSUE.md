<!-- insrc:artifact ISSUE-008e146ad1475ef9 -->

# Measuring a request can stall on a slow data source, reads a whole repository for one file, and is done twice in one run

## Reproduction

None of the three was seen to fail in a live run. Each was read from the code by the daemon's code review of the change that added the measure, and each can be shown with stand-ins and no model.

1. No time limit on a live data source. Register a data connection whose driver's table listing never returns (a stand-in driver whose `listTables` returns a promise that does not settle). Send a data request on that connection, or a data request on the repository that declares it. Observed (by reading): the request waits in its classify stage for as long as the listing takes; it has no time limit and cannot be cancelled there, and the scope checks that could refuse the request run only afterwards. Expected: after a bounded wait the source is reported as one whose size could not be determined, with the reason, and the request goes on. In a plan tree the same listing is asked for again for every child plan that names the source.

2. The whole repository is read for a small scope. Send a code request scoped to one file, or to one symbol, of a large indexed repository, with a stand-in reader that counts what it is asked for. Observed: every stored entity of the repository is read and the scope's own entities are then picked out of them. Expected: the read is of the scope's own area.

3. The area is measured twice in one run. Start a plan-tree run with a stand-in reader that counts its calls. Observed: the area the request names is read and counted once when the run measures the request, and a second time when the run's context is built, at two different moments. The two counts can differ if the index changes between them, so the size on the run's intent and the size the context's planning call was given can disagree. Expected: one run takes one measure of the area it names.

## Root cause

1. The measure of a live data source awaits the driver's complete listing directly. Nothing bounds that wait, and the measuring pass takes no cancellation signal, although the run it is called from has one. The complete mode was added so that the count is of everything the source holds; it was added without a bound on how long that may take.

2. The measure of a stored area reads all stored entities of the repository that contains the scope and then narrows them to the scope's area. That is right for a repository or a directory and wasteful for a file or a symbol, for which the store can be asked for less.

3. Two callers each measure the named area for themselves. The plan tree's driver measures the request before it builds the run's context, to set the size on the intent. The context builder then measures the same resolved scope again for its planning call, because it is written to be the one that sets the size for every caller of the lookup pipeline, and it has no way to be handed a measure that was already taken.

## Fix intent

A live data source is measured within a bounded time. A source that does not answer within it is reported as not determined, with a reason that says the listing timed out, and is never read as a count. A request that is cancelled stops measuring. The bound is a stated value that can be changed by configuration.

The stored area read for a measure is no wider than the scope needs: a file or a symbol scope does not cause every entity of its repository to be read. The counts and sizes the measure returns do not change.

One run takes one measure of the area it names. Where the run has measured its request, the context built for that run uses that measure and takes none of its own; a caller that has taken none still gets one from the context builder, as today. The size on the run's intent and the size its planning call is given are then the same by construction.

## Citations

- **[[c1]]** `code` `src/analyze/measure.ts` — "const listing = await r.listTables({ complete: true });"
- **[[c2]]** `code` `src/analyze/measure.ts` — "const listing = await k.listNamespaces({ complete: true });"
- **[[c3]]** `code` `src/analyze/measure.ts` — "const entities = await readEntities(scope.repoPath);"
- **[[c4]]** `code` `src/analyze/orchestrator/driver.ts` — "const measure = await measureRequestScope(unsized.scopeRef, unsized.target, args.scopeHint);"
- **[[c5]]** `code` `src/analyze/context/driver.ts` — "const area = await (steps.measureArea ?? measureResolvedScope)(args.scope, unsized.target, sizeHint);"
- **[[c6]]** `code` `src/analyze/planner/recursive.ts` — "const childMeasure = await measureRequestScope(childIntent.scopeRef, childIntent.target, childIntent.scope);"
- **[[c7]]** `prior-artifact` `docs/epics/make-insrc-analysis-complete-used-right-E20261006b9d5c5c4/S002/CR.md` — "with no timeout or abort visible in the summaries"
