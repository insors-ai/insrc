<!-- insrc:artifact LLD-b9d5c5c40df5a574-s4 -->

# LLD: STORY-b9d5c5c40df5a574-s4 — No lookup drops results

## Summary

**Epic:** `make-insrc-analysis-complete-used-right`
**HLD base run:** `wf-1791349476498-tih4l4`
**HLD effective hash:** `faa0f59939ce...`

This Story removes every fixed limit on how many results an analyzer lookup or plan-task runtime returns and every fixed cut on how much of an item is read. It adds no new contract: each limit constant and parameter is deleted at its site, item content is read from its file through the existing item measurement (which already confirms the file still holds the item), and the shared text search gains a complete mode that only the analyzer asks for. A result that grows is handled by Story s3's method and described by Story s1's record; an item that cannot be confirmed is reported as not covered. Cancellation and the tool loop's turn limit are Story s10's.

## Contents

1. [HLD context](#1-hld-context)
2. [Contract details](#2-contract-details)
3. [Data model changes](#3-data-model-changes)
4. [Interaction with shared contracts](#4-interaction-with-shared-contracts)
5. [Error paths](#5-error-paths)
6. [Test strategy](#6-test-strategy)
7. [Migration](#7-migration)
8. [Alternatives considered](#8-alternatives-considered)
9. [References](#9-references)
10. [Open questions](#10-open-questions)

## 1. HLD context

> See **HLD-b9d5c5c40df5a574** § 2. Framework summary

**Rollout phase:** Phase F — remove the limits
**Consumes:** `sc1` (Completeness record), `sc2` (Answer report), `sc3` (Request measure), `sc4` (Handling report), `sc6` (Causes of not proceeding)

**Adjacent scope (owned by other stories — do NOT implement here):**
- `s1`: With every limit still in place: returning the completeness record from each lookup and each plan-task runtime, saying when a limit was reached (limited), what was skipped and what was only partly read, and the basis each rests on. For the text search, reporting what it leaves out today: files over its size limit, files it could not read, lines it shortened, output it discarded, and the files each backend excludes by rule. Classifying every catch clause in the lookups and the plan-task runtimes: a clause that handles a named, expected condition stays and names what it skipped in the record; a clause that swallows an error is removed or rethrows, so that the lookup becomes the failed output. Deriving the answer report's overall completeness from those records and writing the completeness line at the head of every answer on both paths, in the layouts as they are today. Reporting a failure of the answer-writing step as a typed error that carries the lookup results and the report, in place of the 'model unavailable' error that discards them today, added as one more case to the raise site and the mapping that Story s6 owns, and passed through everything that reaches the context builder (six callers, the one-shot agent tool and the daemon's workflow runner, with the error's data carried through the daemon's error mapping). Keeping the report out of the schema given to a model at both places the schema reaches one (the answer-writing call and the tool loop's final answer), and rejecting a report an agent supplies. What the step tool attaches to a bundle the agent wrote. The declared report field on the bundle, its schema version, and how bundles and run records stored before the change are treated. The lookup cache's version. The lookup cache's stored shape changes with the outputs. The free-form fallback: an optional field for partial findings on the failed output, the loop's exit at the limit attaching what it gathered, reaching its turn limit becoming a failed output, and its answer gets a report that says it rests on a search directed by a model. Reading the data drivers' cut flag into the completeness record of the table-listing lookup and the object-listing plan task. — owns `sc1`, `sc2`
- `s2`: The two measuring sources and the mapping from counts to the five sizes. From lookup results, at all four places that assume a size today. From the named area, on the plan tree: the measuring pass after both classification branches, removal of the scope picker's model call, removal of the size from the classifier's output, what the decomposer and planner receive as size at each moment, the size's effect on plan depth as well as task count, and measuring a child plan from the area it names when it is spawned, with the planner model's figure and a size on the daemon request kept as hints. A size given by a caller or a slash command kept as a hint. The unmeasurable case. Filling the measure into the answer report and showing it in the answer. The source of the measure for each of the seven kinds of scope, including counting a data connection's tables or objects from the live source through the data driver, and the fallback to XL, recorded as not determined, when a count cannot be taken. Adding a complete mode to the data drivers' listings for the count (the five relational drivers, four of the six namespace drivers, the file listing; Redis and etcd are recorded as not determined, since their listing is a sample of keys), with the limited mode kept for other callers; a listing that reports it was cut is never a determined count. — owns `sc3`
- `s3`: The table from size to handling method and the size above which results are handled in parts. How outputs are divided along directory and file boundaries, and one large item into consecutive sections, so that a single item is read in full. In the lookup pipeline: writing a per-part result for each part serially and the new combine step (its input, its output, its own size rule, its failure case). On the plan tree: the same size rule on the aggregator's input, combining in stages. Keeping a failed part out of the combined answer. The step tool's part turn. Filling the handling report and showing it in the answer. The limits are still in place, so this is exercised by results that are large within them and by tests that lower the threshold. This Story closes the exception accepted on Story s7: a broad docs analysis whose aggregate input is larger than one model call accepts must complete once that input is handled in parts. — owns `sc4`
- `s5`: Adding the enumeration question kind to the planner's choices and rendering it directly from lookup results, including returning it from the step tool's plan phase with no model turn. Choosing a layout by question kind and source kind at both places a layout is selected today. Removing the limits from the six layouts and the older per-source layouts and from the summariser's output schema. Making each layout describe every lookup it may draw on, with that reference at the end of the prompt. Laying out the answer report, which Stories s1 to s3 already write, in the form each layout uses. — owns `sc5`
- `s6`: Giving a request that asks no specific question a run context: what the lookup pipeline plans for it (a broad survey of the area it names, from the lookups that exist) where today it returns at once; the same for a request started with a stated kind of source, which is always marked unfocused; serving, in the lookup pipeline, the four kinds of scope it returns for today (a file, a symbol, a manifest directory, a data connection), and how each resolves to what the lookups need. Replacing the single 'model unavailable' error with the cause of each way of not proceeding, as new codes in the existing list and new typed errors, and with the existing codes where one fits: every place the pipeline returns nothing, and the fall-through for a bundle that fails validation, is listed and given its cause. It owns the place the error is raised, the pipeline's rule for returning nothing, and the functions that map these errors to codes (the plan tree's and the daemon's, and the classify stage's mapping, through which an error from the classifier's context build is routed). The form of a symbol scope's value, its resolution to one stored entity, and the validator and classifier prompt brought in line. The one function that resolves a scope's value to a repo, a path or an entity, and moving the lookup pipeline's direct readers of the value to it (the planning prompt, the context builder's path resolution, the indexed check). Correcting the table of which kind of scope goes with which kind of source, with the classifier prompt's copy of it, the table's comment and the matrix test, and applying it on both classification branches: the plan tree's classify mapping surfaces the validator's inner code, and the branch with no classifier calls the validator's checks directly. Supplying the connection check from both callers of the classifier, and mapping a connection id to its repo. It declares all three new codes in both lists; Stories s1 and s7 raise one each. — owns `sc6`
- `s7`: Widening the plan tasks of each family (code, docs, infra, data) to exactly the kinds of scope the corrected table gives it, with the scope check the docs tasks share with the code tasks taking the family's row as an argument, and every task that reads the scope's value directly (three docs tasks, the shared adherence task, the task that lists data connections) moved to the resolution function Story s6 defines, including a data connection for the data tasks, and refusing any other pairing with the existing code for it. Running a broad analysis through classification, the run context, planning, the plan walk with its nested plans, and the aggregator, to a final report; finding and correcting what stops it at each stage. A stop the run catches is already recorded; what is added is a handler for an error nothing catches, in the plan walk and in the daemon's request, that writes the run record, and the rule that a record still in progress with no live run behind it is abandoned: the process's in-memory count of the runs it is executing per id, and the two readers that apply it, the status request and the purge, each rewriting the record as failed with the code 'run-abandoned', which Story s6 declares and this Story raises; a new run replaces a record left in progress with its own first record. Making a task's refusal of a scope a typed error the plan walk recognises, with an optional code on the failed-task record. Its design begins by running one and recording how far it gets; if what is found is more than one Story, it is brought back to be split. Two stops the first runs of 2026-10-08 found are corrected here as well: the aggregate-report task runs on the inputs that exist when a task before it failed and is told which are absent, so that a run with a failed task returns a report that names what is missing; and the daemon's run request accepts an empty prompt when the caller states the kind of source. Two further stops are not this Story's: what the code tasks treat as a module is Story s8's, and an aggregate input larger than one model call accepts is Story s3's. For the second, a broad docs analysis not completing on a repository of that size is an exception the stakeholder accepted on 2026-10-08, to be closed by Story s3.
- `s10`: Building cancellation: a signal from each caller through the context builder to a check between turns; the run's signal into the plan walk and the classifier; the optional signal on the daemon's standard handlers; the signal parameter on the daemon's context-building functions; a signal on the step tool's plan and narrow phases, through stepPlan and the runner context; the new cancel request for the five requests received over the socket that reach a tool loop (the three context requests, the plan request and the classify request), with the daemon's table of run id to canceller; the cancelled case in the classify stage's mapping; 'aborted' in the daemon's error codes; and what a cancelled loop returns. Only then removing the turn limit and retiring its configuration setting (catalog row, retired list, the analyzer's configuration, the planning prompt, the VS Code extension's declaration with a release, the pages that document it, the reconcile fixture) for all three users of the loop (the free-form lookup and the classification and task modes). Removing the error and the code for reaching the turn limit from both lists and both mappings, with the tests that import the error and the test configuration that sets the limit. This Story is built after Story s4: the turn limit comes off only once a loop can be cancelled and the loop's search tools are complete.
- `s8`: Private implementation of s8: The code tasks of a broad analysis work on a repository whose graph has no modules for its directories

## 2. Contract details

**Surface level:** internal

### 2.1 `measureItem`

```typescript
function measureItem(entity: MeasuredEntity, opts: MeasureItemOptions): ItemMeasure
```

**Parameters:**
- `entity: MeasuredEntity` — The stored item: kind, file, start and end line and the stored body.
- `opts: MeasureItemOptions` — The file hash recorded when the item was indexed, and a test seam for reading the file.

**Returns:** `ItemMeasure` — The item's full length and, now, the item's full content read from the file at the pointer when the file still holds the item; content is absent when the length could not be established.

**Preconditions:**
- entity.file and the line range are the pointer the index stored
- opts.recordedFileHash is the hash recorded for the item's file, or undefined

**Postconditions:**
- When the file is readable and its hash equals the recorded hash, totalChars and content are both set and content.length equals totalChars
- When the file is missing, unreadable, changed since indexing, or has no recorded hash, totalChars is null, content is absent and reason says why
- measureItem never throws

### 2.2 `createItemMeasurer`

```typescript
function createItemMeasurer(db: DbClient, entities?: readonly Entity[]): ItemMeasurer
```

**Parameters:**
- `db: DbClient` — Source of the recorded file hash for an item's file.
- `entities: readonly Entity[]` _(optional)_ — Entities already loaded, to avoid a second read.

**Returns:** `ItemMeasurer` — A measurer whose measure(entity) now returns the content with the length, and whose partlyRead reports an item as not covered when the content could not be confirmed.

**Preconditions:**
- the repo of each StoredItem is registered

**Postconditions:**
- The nine content-cut sites read an item through measure(entity), never through a slice of entity.body
- An item whose content could not be confirmed yields a skipped or partlyRead entry in the completeness record (Story s1's record) and is never presented as read

### 2.3 `runGrepSearch`

```typescript
function runGrepSearch(opts: GrepSearchOptions): Promise<SearchGrepData>
```

**Parameters:**
- `opts: GrepSearchOptions` — The pattern, root and options; gains a complete flag that only the analyzer sets.

**Returns:** `SearchGrepData` — In complete mode: every hit, whole lines, no file skipped for size, output read as a stream, the files excluded by rule stated in the result; truncated is false unless the search failed.

**Errors:**
- `Error` when an empty pattern, an invalid regex, a search root that cannot be read, or a search that runs out of time (reported as a failed lookup by the caller, never as complete)

**Preconditions:**
- opts.root is inside the repository's dependency closure
- opts.complete is set only by the analyzer's search lookup

**Postconditions:**
- Without opts.complete, behaviour is unchanged: MAX_LIMIT, MAX_LINE_CHARS, MAX_FILE_BYTES and RG_MAX_OUTPUT_BYTES still apply for every other caller
- With opts.complete, none of those four limits applies

### 2.4 `runSearchText`

```typescript
function runSearchText(exp: Exploration, ctx: ExplorationRunnerContext): Promise<SearchTextOutput>
```

**Parameters:**
- `exp: Exploration` — The planned lookup; any topK it carries is ignored.
- `ctx: ExplorationRunnerContext` — The repository path and the lookup context.

**Returns:** `SearchTextOutput` — Every hit with its whole line and a completeness record that lists what was excluded by rule; a search that ran out of time is the existing failed-lookup output.

**Errors:**
- `LookupFailedError` when the search could not run or ran out of time

**Preconditions:**
- the pattern is non-empty and valid

**Postconditions:**
- The result's completeness record has no limited entry for hits, lines or files
- Every distinct by-rule exclusion appears once in basisNote

## 3. Data model changes

### 3.1 `ItemMeasure` — field-add

Gains an optional content field: the item's full text read from its file at the stored pointer, set only when totalChars is established. cutByIndexer and storedChars keep their meaning so Story s1's partly-read reporting is unchanged.

```
readonly content?: string | undefined;
```

**Call sites:**
- `src/analyze/item-length.ts`
- `src/analyze/explore/item-measure.ts`
- `src/analyze/explore/doc-constraint-enumerate.ts`
- `src/analyze/explore/doc-decision-trace.ts`
- `src/analyze/runtimes/code/adherence-check.ts`
- `src/analyze/runtimes/data/adherence-check.ts`
- `src/analyze/runtimes/infra/adherence-check.ts`

### 3.2 `GrepSearchOptions` — field-add

Gains an optional complete flag. When set, runGrepSearch lifts the hit limit, the per-line cut, the per-file size skip and the ripgrep output cap and reads ripgrep output as a stream; unset, every other caller behaves as today.

```
readonly complete?: boolean;
```

**Call sites:**
- `src/daemon/tools/builtins/search/grep.ts`
- `src/analyze/explore/search-text.ts`
- `src/analyze/explore/config-trace.ts`

### 3.3 `EXPLORATION_CACHE_VERSION` — field-modify

Raised from 3 to 4 so no lookup output cut by a limit is served from the cache; limit parameters are dropped from a lookup's parameters before its cache key is taken.

```
export const EXPLORATION_CACHE_VERSION = 4;
```

**Call sites:**
- `src/db/exploration-cache.ts`
- `src/analyze/explore/exploration-cache-key.ts`

### 3.4 `MAX_TOP_K` — field-remove

The per-lookup result cap of test-locate, search-text, manifests-locate, config-trace, import-graph and usage-example is deleted along with the topK parameter.

**Call sites:**
- `src/analyze/explore/search-text.ts`
- `src/analyze/explore/data-model-trace.ts`
- `src/analyze/explore/concept-resolve.ts`

### 3.5 `DEFAULT_LIMIT` — field-remove

The default and maximum limit of symbol-locate, doc-mention, db-tables-list and capability-reuse-check (with MAX_LIMIT and MAX_PREVIEW_CHARS) are deleted with the limit and previewChars parameters; data-model-trace's MAX_TARGETS, MAX_FIELDS and MAX_TOP_CALLERS and concept-resolve's MAX_HITS go with them.

**Call sites:**
- `src/analyze/explore/doc-mention.ts`
- `src/analyze/explore/db-tables-list.ts`
- `src/analyze/explore/capability-reuse-check.ts`
- `src/analyze/explore/db-table-describe.ts`

### 3.6 `FILE_LIST_LIMIT` — field-remove

The plan-task runtime caps (FILE_LIST_LIMIT, DEFAULT_FILE_CAP, SAMPLE_CAP_PER_FAMILY, PROJECT_CONTEXT_LIMIT, SUMMARY_CAP) are deleted; the data-driver listings are asked in their complete mode.

**Call sites:**
- `src/analyze/runtimes/data/discovery-objects.ts`
- `src/analyze/runtimes/infra/_shared.ts`
- `src/analyze/runtimes/infra/discovery-families.ts`
- `src/analyze/runtimes/shared/adherence.ts`
- `src/analyze/runtimes/shared/aggregator.ts`

### 3.7 `SECTION_BODY_CHARS` — field-remove

The content cuts (the 1200-character body cut of the three adherence checks, SECTION_BODY_CHARS of the two document lookups, ENTRYPOINT_SCAN_CHARS, SUMMARISER_BODY_CHARS and the indexer's MAX_BODY) are no longer applied to what the analyzer reads; the indexer's stored body is unchanged and is reported by Story s1.

**Call sites:**
- `src/analyze/explore/doc-constraint-enumerate.ts`
- `src/analyze/explore/doc-decision-trace.ts`
- `src/analyze/explore/module-profile.ts`
- `src/analyze/summariser/driver.ts`
- `src/indexer/parser/artifact.ts`

## 4. Interaction with shared contracts

| Contract | Role | How |
| :--- | :--- | :--- |
| `sc1` | consumes | No limited entry is produced for a removed limit. An item whose content could not be confirmed is written as a skipped or partlyRead entry, a sampled source stays incomplete with its basisNote, and a search that runs out of time is the failed lookup output. |
| `sc2` | consumes | The answer report is derived from the records as before; nothing here adds a field to it. |
| `sc3` | consumes | Results that grow are measured from what the lookups returned, so a request that was M may now measure larger. |
| `sc4` | consumes | Larger results are divided and combined by Story s3's method and its handling report names any part not covered; this Story does not change how they are divided. |
| `sc6` | consumes | A search that cannot run, runs out of time or cannot read its root is raised as the existing failed lookup error and mapped by Story s6's functions; no code is added by this Story. |

## 5. Error paths

**Error cases**

- **An item's file changed since it was indexed, so the pointer no longer holds the item** (recoverable)
  - Detection: measureItem compares indexerFileHash of the file text with opts.recordedFileHash and finds them different, so totalChars is null and content is absent
  - Response: The lookup records the item as skipped or partly read in its completeness record with the reason 'the file changed since it was indexed' and does not use any text of it
  - User impact: The answer names the item as not covered instead of claiming to have read it
- **An item's file is missing or unreadable** (recoverable)
  - Detection: readFileSync in measureItem throws ENOENT or another error code
  - Response: Same as above, with the reason 'the file no longer exists' or 'the file could not be read (<code>)'; measureItem never throws
  - User impact: The item is reported as not covered; the rest of the lookup is unaffected
- **The index recorded no hash for an item's file, so the pointer cannot be confirmed** (recoverable)
  - Detection: measureItem sees opts.recordedFileHash undefined or empty
  - Response: The item is reported as not covered with the reason 'no hash was recorded for the file when it was indexed'; its stored body is not used as if it were the whole item
  - User impact: The answer says the item could not be confirmed
- **A complete text search runs out of time or its ripgrep process fails** (recoverable)
  - Detection: runGrepSearch's backend times out or exits with an error while complete is set
  - Response: runSearchText raises LookupFailedError, which is the existing failed lookup output carrying any hits gathered, never an empty or complete result
  - User impact: The lookup is reported as failed with its reason
- **The search root cannot be read** (recoverable)
  - Detection: the Node backend cannot read the root, or an empty pattern or an invalid regular expression is given
  - Response: runGrepSearch throws as it does today and runSearchText turns it into the failed lookup output
  - User impact: The lookup fails with its reason
- **A single file below the root cannot be read during a complete search** (recoverable)
  - Detection: the scan hits an unreadable file or directory below the root
  - Response: The file is listed in the result's omitted list with its reason and the search continues; the completeness record names it as skipped
  - User impact: The answer says which files could not be searched
- **A limit parameter reaches a lookup from a plan written for the old catalog** (recoverable)
  - Detection: the planner schema or the lookup's parameter parsing sees a topK, limit, maxSources or previewChars value
  - Response: The value is dropped before the lookup runs and before its cache key is taken, as the HLD states; the lookup runs unbounded
  - User impact: A request returns the complete result, which may be larger than that plan expected
- **A lookup output cached under the old cache version is found** (recoverable)
  - Detection: the stored version is 3 and EXPLORATION_CACHE_VERSION is 4
  - Response: The stored output is treated as absent and the lookup runs again
  - User impact: No output cut by a limit is served as complete

**Edge cases**

| Input | Expected |
| :--- | :--- |
| A lookup whose true result count is exactly a former limit, one more than it, and zero | Every result is returned in each case, an empty result is reported as complete only when the lookup ran, and the completeness record has no limited entry |
| A single item far larger than the old 1200-character, 8192-character or section cuts | The whole item is read from its file when the pointer is confirmed, and Story s3's section handling divides it if it is too large for one pass |
| A document or file entity (a whole-file kind) versus a function or class entity (a line range) | A whole-file kind returns the file's full text and any other kind returns the lines from its start line to its end line, as measureItem already measures them |
| A line of 100,000 characters, a file of 50 MiB, and a search with a million hits | The complete search returns every hit with its whole line and searches the large file; ripgrep output is read as a stream, not kept to a fixed size |
| A caller outside the analyzer calls runGrepSearch without the complete flag | The four limits still apply exactly as today and the result's truncated flag still reports a cut |
| A Redis or etcd connection asked for its tables or namespaces | The listing stays a sample reported as sampled and incomplete, and the analyzer does not scan every key of the live store |

**Invariants to preserve**

- A lookup that cannot run is the existing failed output with its reason, never an empty result. [[c1]]
- An item whose content could not be confirmed is reported as not covered and never claimed as read. [[c1]]
- The text search used by callers outside the analyzer keeps its limits (MAX_LIMIT, MAX_LINE_CHARS, MAX_FILE_BYTES, RG_MAX_OUTPUT_BYTES). [[c1]]
- What the index stores and how it is built are not changed; the indexer's stored body cut (MAX_BODY) stays and is only no longer relied on by the analyzer. [[c1]]
- Model calls stay serial: removing limits adds no parallel provider call. [[c1]]

## 6. Test strategy

**Test framework:** `node:test with tsx (npx tsx --test 'src/**/__tests__/*.test.ts'), assert/strict, the existing test files for these modules`

**Test levels**

- **unit** — Prove each removed limit at its site: a lookup returns every result for a fixture larger than its former limit, and the completeness record has no limited entry.
  - Subjects: `src/analyze/explore/__tests__/completeness-all-lookups.test.ts (extended: former limit, one more, zero for each lookup in the inventory)`, `src/analyze/runtimes data, infra and shared runtime tests (file list, file cap, sample cap, project context and summary caps)`, `src/analyze/explore/__tests__ for doc-mention, db-tables-list, capability-reuse-check, data-model-trace and concept-resolve`
  - Fixtures: `Stand-in database seeded with more items than each former limit`, `Stand-in data-driver pool that reports a complete listing and one that reports a sample`
- **unit** — Prove item content is read from the file at the pointer and that an unconfirmable item is reported as not covered.
  - Subjects: `src/analyze/__tests__/item-length.test.ts (measureItem content: whole-file kind, line-range kind, shifted lines, missing file, unreadable file, no recorded hash)`, `src/analyze/explore/__tests__ for doc-constraint-enumerate and doc-decision-trace section bodies`, `the three adherence-check tests (body longer than 1200 characters)`
  - Fixtures: `Temporary files with a recorded hash, a changed file and a removed file`, `An item larger than 8192 characters in a file whose stored body was cut by the indexer`
- **integration** — Prove the complete text search for both backends and that outside callers keep their limits.
  - Subjects: `src/daemon/tools/builtins/search/__tests__/grep-omitted.test.ts (complete flag: more hits than MAX_LIMIT, a line over MAX_LINE_CHARS, a file over MAX_FILE_BYTES, ripgrep output over RG_MAX_OUTPUT_BYTES, timeout reported as failed)`, `src/analyze/explore/__tests__/completeness-all-lookups.test.ts search.text and config.trace cases`, `runGrepSearch without the complete flag keeps today's limits`
  - Fixtures: `A generated repository with a very large file and a very long line`, `A stub ripgrep command and the Node fallback path`
- **contract** — Prove the planner catalog and prompt no longer state or accept a fixed number of results, and the cache version rises.
  - Subjects: `src/analyze tests that read src/prompts/analyze/decompose.system.md and the planner's catalog for limit, topK, maxSources and previewChars`, `src/db exploration-cache tests for EXPLORATION_CACHE_VERSION 4 and a stored version 3 output treated as absent`, `src/analyze/explore/__tests__/cache-area-isolation.test.ts`
  - Fixtures: `A stored cache row with version 3`
- **integration** — Prove a result that became larger is handled by the method for its size and the answer reports sampled, failed or uncovered sources.
  - Subjects: `src/analyze/context/__tests__ partition tests with a lookup result larger than the former limits`, `src/analyze/orchestrator/__tests__ docs and code runs with a failed and a sampled source`
  - Fixtures: `A lookup stand-in that returns more results than the handling threshold`
- **live** — Prove on the real repository that a text search returns every hit and that Redis or etcd stays a sample.
  - Subjects: `a live run of search.text over this repository compared with an independent count of the same pattern`, `a live Redis listing reported as sampled`
  - Fixtures: `A running daemon with this code, and a Redis connection (live tests run only with INSRC_LIVE_TESTS=1)`

**Acceptance mapping**

| Criterion | Proving tests |
| :--- | :--- |
| `ac1` | `completeness-all-lookups.test.ts: every lookup returns all results at, one over and zero versus its former limit with no limited entry`, `discovery-objects.test.ts: the data and infra file lists and sample caps return every file`, `aggregator-handling.test.ts: the aggregator summary is not cut at SUMMARY_CAP` |
| `ac2` | `item-length.test.ts: measureItem returns the whole content of a whole-file and a line-range item and no content for a changed, missing, unreadable or unhashed file`, `doc-constraint-enumerate.test.ts: a section longer than the former cut is read whole and an unconfirmable section is reported as not covered`, `adherence-check.test.ts: a body over 1200 characters is read whole in the code, data and infra checks` |
| `ac3` | `grep-omitted.test.ts: with complete set, more hits than MAX_LIMIT, a line over MAX_LINE_CHARS, a file over MAX_FILE_BYTES and ripgrep output over RG_MAX_OUTPUT_BYTES are all returned in full, and a timeout is a failed lookup`, `grep-omitted.test.ts: without complete, the four limits still apply` |
| `ac4` | `decompose-prompt-limits.test.ts: the planning prompt and catalog contain no limit, topK, maxSources or previewChars and no fixed result count`, `params-schema.test.ts: a plan that passes a limit parameter has it ignored and dropped before the cache key` |
| `ac5` | `partition-combine.test.ts: a lookup result larger than the former limits is divided and combined with every result processed`, `run-report.test.ts: the answer names sampled, failed and uncovered sources and is not called complete otherwise` |
| `ac6` | `db-tables-list.test.ts: a Redis or etcd listing is a sample, reported incomplete, and no key scan is made`, `redis-etcd-live.test.ts: a live Redis listing is reported as sampled (live, INSRC_LIVE_TESTS=1)` |

## 7. Migration

**State before:** Today every lookup and plan-task runtime in the s1 inventory stops at a fixed constant, cuts an item's body at 1200, SECTION_BODY_CHARS, ENTRYPOINT_SCAN_CHARS or 8192 characters, and relies on the body the indexer stored (cut at MAX_BODY in src/indexer/parser/artifact.ts). The shared text search applies MAX_LIMIT 5000, MAX_LINE_CHARS 500, MAX_FILE_BYTES 2 MiB and RG_MAX_OUTPUT_BYTES 4 MiB for every caller. Lookup outputs are cached under EXPLORATION_CACHE_VERSION 3.

**State after:** No analyzer lookup or runtime stops at a fixed result count or cuts an item's content: item text is read from its file through measureItem after the file is confirmed to hold the item, an unconfirmable item is reported as not covered, and the analyzer's text search runs in a complete mode. The search tool keeps its four limits for every other caller. Limit parameters are gone from the planner catalog and prompt, and the exploration cache is at version 4.

**Zero downtime:** yes — **Data rewrite:** no

**Steps**

1. Add the optional content field to ItemMeasure and have measureItem return the text it already reads when the file hash is confirmed. — ↩ rollbackable
2. Add the complete option to GrepSearchOptions and implement it in runGrepSearch for both backends, leaving the default path untouched. — ↩ rollbackable
3. Switch the analyzer's search lookups to the complete option and report a timeout as the failed lookup output. — ↩ rollbackable _(needs: `step 2`)_
4. Switch the nine content-cut sites to read items through measure(entity) and report an item that cannot be confirmed as not covered. — ↩ rollbackable _(needs: `step 1`)_
5. Remove the result-count constants and parameters from each lookup and plan-task runtime, and ask the data-driver listings in their complete mode. — ↩ rollbackable
6. Remove the limit parameters, their examples and the fan-out bound from the planner catalog and prompt, and drop any such parameter before the lookup runs and before its cache key is taken. — ↩ rollbackable
7. Raise EXPLORATION_CACHE_VERSION from 3 to 4. — ↩ rollbackable
8. Update the tests and the documents that state a limit, and run the full sweep. — ↩ rollbackable

**Backward compat:** Results get larger: a lookup that returned its first thirty hits returns all of them, and a request that measured as one size may measure larger. A plan that still passes a limit parameter has it ignored, not rejected. The search tool exposed to callers outside the analyzer keeps its four limits. The indexer's stored body is not changed. Cached lookup outputs from version 3 are not served. The tool loop's turn limit and cancellation are Story s10's and are not changed here.

## 8. Alternatives considered

### 8.1 a1: Delete the limits in place, one item reader, one complete search mode — **CHOSEN**

Remove each limit parameter and constant at its site; read item content through one validated reader built on the existing item-length check; give the shared text search an analyzer-only complete mode.

Every lookup and plan-task runtime in the inventory (the result-count constants in explore and the runtimes, the three adherence-check body cuts at 1200 characters, the section-body cuts of the two document lookups, the entrypoint scan cut, the summariser body cut and the document-retrieval preview) loses its constant and its parameter: the lookup returns everything it found and its completeness record says so. A planner plan that still passes a limit parameter has it ignored, as the HLD says, and the parameter is removed from the planner's catalog and prompt. Item content is read through one function that takes the item's stored pointer (file, line range, content hash where the index has one), reads the file at that place, and confirms the file still holds the item by reusing the checks already in src/analyze/item-length.ts (changed, missing, unreadable, hash-unverified); the nine content-cut sites call it, so a changed or unreadable file becomes a 'not covered' note in the completeness record and never a claimed read. The shared text search gains an options flag, set only by the analyzer, that lifts MAX_LIMIT, the per-line cut, the per-file size skip and the ripgrep output cap, reads ripgrep output as a stream, states the by-rule exclusions in the result, and reports a search that runs out of time as a failed lookup; callers outside the analyzer keep today's limits. The lookup cache version is raised and limit parameters are dropped before the cache key is taken. The data-driver listings used by table listing and object listing are asked in their complete mode. Results that become large are handled by Story s3's method and described by Story s1's record; this Story adds no new contract.

### 8.2 a2: Keep optional caller bounds, unbounded by default

Keep the limit parameters in the lookup input types as optional bounds that default to none, and stop passing them from the planner.

Each lookup keeps its limit-style parameter in its input type but treats an absent value as no bound; the planner's catalog and prompt stop offering the parameters and the analyzer's own calls never pass one. Item content is read through the same validated reader as in a1. The text search keeps its limit option and its other limits for outside callers and gains the same analyzer-only complete mode. A caller that deliberately passes a bound (a test, a script, another tool) still gets a bounded result, and the completeness record reports the bound it reached.

**Rejected because:** Keeps a way for a bound to apply inside the analyzer and keeps the reached-limit path alive, which the Define and the HLD say should not exist; partial on ac1, ac3 and ac5.

### 8.3 a3: Stream results into the handling method

Add a paged retrieval layer so unbounded lookups produce results in pages that Story s3's handling consumes, instead of one large array.

In addition to the deletions in a1, each lookup that can return a large set (text search, import graph, symbol and test location, concept resolution, document lookups) exposes its results as an ordered stream of pages, and the context builder hands pages to the per-part step as they arrive, so no single array holds the whole result. The search's output is already read as a stream; this extends that to the lookups' results and to the answer path.

**Rejected because:** Adds a paged retrieval contract that reaches into Story s3's boundary (violates sc4) and no criterion asks for it.

## 9. References

- **[[c1]]** `analyze-bundle` `s1 analyze bundle` — "Result-count limits and content cuts found by text search of the production files (the analyzer pass over the lookup directory was cut at 30 hits)"
- **[[c2]]** `code` `src/analyze/item-length.ts` — "export function measureItem(entity: MeasuredEntity, opts: MeasureItemOptions): ItemMeasure {"
- **[[c3]]** `code` `src/daemon/tools/builtins/search/grep.ts` — "export async function runGrepSearch(opts: GrepSearchOptions): Promise<SearchGrepData> {"
- **[[c4]]** `code` `src/db/exploration-cache.ts` — "export const EXPLORATION_CACHE_VERSION = 3;"
- **[[c5]]** `doc` `docs/epics/make-insrc-analysis-complete-used-right-E20261006b9d5c5c4/HLD.md` — "Cancellation, and the retirement of the tool loop's turn limit with its setting, its error and its code, are Story s10's"

## 10. Open questions

- Which of the constants found in the s1 inventory are the Define's sixteen result-count limits and nine content cuts is not established; the plan stage should reconcile the two lists before the tasks are written.
- The HLD's Story s4 boundary text has a grammar slip from the split with Story s10 ('...cache key is taken. moving the table-listing lookup...'); it should be corrected the next time the HLD is edited.
- Several proving tests named in the test strategy do not exist yet (discovery-objects, doc-constraint-enumerate, adherence-check, db-tables-list, decompose-prompt-limits and redis-etcd-live); the plan stage should create them or map the criteria to existing files.
- Reading ripgrep output as a stream in complete mode and how a search that runs out of time reports hits already gathered are stated but not detailed; the plan stage should choose the time limit for the analyzer's search.
