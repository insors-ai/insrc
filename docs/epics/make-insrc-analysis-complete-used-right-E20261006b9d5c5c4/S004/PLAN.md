<!-- insrc:artifact PLAN-b9d5c5c40df5a574-s4 -->

# Plan: STORY-b9d5c5c40df5a574-s4

## Summary

**Epic:** `make-insrc-analysis-complete-used-right`
**LLD run:** `wf-1794653538223-k2ok1z`
**LLD effective hash:** `faa0f59939ce...`

Building this Story removes every fixed limit and content cut from the analyzer's lookups and plan-task runtimes in small steps: first the item reader and the analyzer-only complete mode of the text search (both backends), then the sites that read items and return results, then the planner prompt and cache version, and last the proof that larger results are handled and the documents and live checks. The work is fourteen tasks, almost all independent starting points that converge on the planner and the proof tasks, and cancellation and the turn limit are left to Story s10.

## Contents

1. [Tasks](#1-tasks)
2. [Test-strategy coverage](#2-test-strategy-coverage)
3. [References](#3-references)

## 1. Tasks

| # | Task | Size | Status | Depends on | Tests | Derived from |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| 1 | **`t1`** ItemMeasure carries the item's content from its file | S | — | — | unit: item-length.test.ts: measureItem returns the whole content of a whole-file and a line-range item and no content for a changed, missing, unreadable or unhashed file | [[c1]] [[c5]] |
| 2 | **`t2`** The item measurer returns content and reports unconfirmed items as not covered | M | — | `t1` | unit: partly-read.test.ts: measure returns content for a confirmed item and a skipped or partlyRead entry with its reason for an unconfirmed one | [[c2]] [[c12]] |
| 3 | **`t3`** Complete mode for the ripgrep search backend | M | — | — | integration: grep-omitted.test.ts: through the ripgrep backend with complete set, more hits than MAX_LIMIT, a line over MAX_LINE_CHARS and output over RG_MAX_OUTPUT_BYTES are all returned in full, and a search past the 30-second deadline fails with its gathered hits; integration: grep-omitted.test.ts: without complete the ripgrep backend still applies MAX_LIMIT, MAX_LINE_CHARS and RG_MAX_OUTPUT_BYTES | [[c3]] [[c6]] [[c13]] |
| 4 | **`t4`** Complete mode for the Node fallback search backend | M | — | `t3` | integration: grep-omitted.test.ts: through the Node fallback with complete set, every hit with its whole line is returned, a file over MAX_FILE_BYTES is searched, the deadline fails with gathered hits and an unreadable file is listed as skipped; integration: grep-omitted.test.ts: without complete the Node fallback behaves exactly as today | [[c3]] [[c6]] [[c12]] |
| 5 | **`t5`** The analyzer's search lookups use the complete mode | M | — | `t3`, `t4` | integration: completeness-all-lookups.test.ts: search.text and config.trace return every hit with its whole line and no limited entry, and a timed-out search is the failed lookup output with its gathered hits | [[c4]] [[c12]] |
| 6 | **`t6`** The document lookups and the module profile read items from their file | M | — | `t2` | unit: partly-read.test.ts: doc.constraint.enumerate and doc.decision.trace read a section longer than the former cut whole and report an unconfirmable section as not covered; unit: module-profile-entrypoint.test.ts: an entry point beyond the former first 4,096 characters is recognised and an unconfirmable file is reported as not covered | [[c2]] [[c10]] |
| 7 | **`t7`** The adherence checks and the summariser read items from their file | M | — | `t2` | unit: adherence-check-body.test.ts: the code, data and infra adherence checks read a body over 1200 characters whole and an unconfirmable item is reported as not covered; unit: summariser-body.test.ts: a document over 8192 characters is summarised from its whole content | [[c2]] [[c10]] [[c11]] |
| 8 | **`t8`** Graph and symbol lookups return every result | M | — | — | unit: completeness-all-lookups.test.ts: symbol-locate, test-locate, import-graph, usage-example, concept-resolve, manifests-locate, data-model-trace and convention-detect return every result at, one over and zero versus the former limit with no limited entry | [[c8]] [[c11]] |
| 9 | **`t9`** The document lookups return every result | M | — | — | unit: completeness-all-lookups.test.ts: doc-mention, doc.decision.trace and doc.constraint.enumerate return every section at, one over and zero versus the former limits with no limited entry | [[c8]] [[c11]] |
| 10 | **`t10`** The capability and table lookups return every result | M | — | — | unit: completeness-all-lookups.test.ts: capability-reuse-check, db-tables-list and db-table-describe return every result and a complete driver's table listing has no limited entry; unit: kv-common.test.ts: a Redis or etcd listing is a sample reported incomplete and no key scan is made | [[c8]] [[c11]] |
| 11 | **`t11`** The plan-task runtimes return every result | M | — | — | unit: partly-read-plan-tasks.test.ts: the data and infra file lists, family samples, subject lists and the aggregator summary return every item; unit: dropped-or-failed.test.ts: a runtime over a sampled driver reports the sample and not a complete answer | [[c9]] [[c11]] |
| 12 | **`t12`** The planner stops offering limits and the cache version rises | M | — | `t5`, `t8`, `t9`, `t10` | unit: decompose-prompt-limits.test.ts: the planning prompt and catalog contain no limit, topK, maxSources or previewChars and no fixed result count; unit: params-schema.test.ts: a plan passing each of limit, topK, maxSources and previewChars produces the same cache key as one without; unit: cache-area-isolation.test.ts: a stored version 3 output is treated as absent at version 4 | [[c7]] [[c11]] |
| 13 | **`t13`** Prove larger results are handled and reported | M | — | `t6`, `t7`, `t8`, `t9`, `t10`, `t11`, `t12` | integration: partition-combine.test.ts: a lookup result larger than every former limit is divided and combined with every result processed; integration: run-report.test.ts: the answer names sampled, failed and uncovered sources and is complete only where its evidence supports it | [[c11]] [[c12]] |
| 14 | **`t14`** Update the documents and run the live checks and the full sweep | M | — | `t13` | unit: analyzer-docs-limits.test.ts: the four named documents contain no analyzer limit constant or parameter name; live: search-text-live.test.ts: a live search.text over this repository returns the same count as an independent search of the same pattern; live: redis-etcd-live.test.ts: a live Redis listing is reported as sampled and incomplete | [[c11]] [[c13]] |

### 1.1 TASK-b9d5c5c40df5a574-s4-t1 — ItemMeasure carries the item's content from its file

Add the optional content field to ItemMeasure in src/analyze/item-length.ts and have measureItem return the text it already reads when the recorded file hash matches (whole file for a document, file or config entity, the start-to-end line range for any other). When the file is missing, unreadable, changed or has no recorded hash, content stays absent and the reason says why; measureItem still never throws.

**Acceptance checks:**
- measureItem returns content equal in length to totalChars for a whole-file kind and a line-range kind when the hash matches
- measureItem returns no content and a reason for a changed, missing, unreadable and unhashed file, and never throws

### 1.2 TASK-b9d5c5c40df5a574-s4-t2 — The item measurer returns content and reports unconfirmed items as not covered

Make createItemMeasurer's measure(entity) in src/analyze/explore/item-measure.ts return the content with the length, and make partlyRead produce a skipped or partlyRead entry in Story s1's completeness record for an item whose content could not be confirmed, so the analyzer never presents such an item as read.

**Acceptance checks:**
- measure(entity) returns content for a confirmed item and none for an unconfirmed one
- An unconfirmed item produces a skipped or partlyRead entry with the reason and is not reported as read

### 1.3 TASK-b9d5c5c40df5a574-s4-t3 — Complete mode for the ripgrep search backend

Add the optional complete flag to GrepSearchOptions in src/daemon/tools/builtins/search/grep.ts and implement it for the ripgrep backend: no hit limit, no per-line cut, no output cap, ripgrep output read as a stream and parsed in complete records, the files the backend excludes by rule stated in the result, and a fixed 30-second deadline after which the process is stopped and the call fails with the hits gathered attached and an incomplete status. Without the flag every other caller keeps MAX_LIMIT, MAX_LINE_CHARS and RG_MAX_OUTPUT_BYTES exactly as today.

**Acceptance checks:**
- With complete set, more hits than MAX_LIMIT, a line over MAX_LINE_CHARS and ripgrep output over RG_MAX_OUTPUT_BYTES are all returned in full through the ripgrep backend
- A ripgrep search that passes the 30-second deadline fails with its gathered hits marked incomplete and is never reported as complete
- Without complete, the limits still apply and the existing grep tests pass unchanged

### 1.4 TASK-b9d5c5c40df5a574-s4-t4 — Complete mode for the Node fallback search backend

Implement the complete flag for the Node fallback path in runGrepSearch: no hit limit, no per-line cut, no per-file size skip (MAX_FILE_BYTES), the same 30-second deadline with gathered hits attached, the same by-rule exclusions statement, and an unreadable file listed as skipped with its reason while the scan continues. The default path for other callers is untouched.

**Acceptance checks:**
- With complete set, the Node backend returns every hit with its whole line and searches a file over MAX_FILE_BYTES
- The Node backend passes the same deadline behaviour, and an unreadable file is listed as skipped with its reason
- Without complete, the Node backend behaves exactly as today

### 1.5 TASK-b9d5c5c40df5a574-s4-t5 — The analyzer's search lookups use the complete mode

Make runSearchText in src/analyze/explore/search-text.ts and config-trace.ts call runGrepSearch with the complete flag, ignore any topK, raise a timeout or a search that could not run as the existing failed lookup output carrying the hits gathered, and write each distinct by-rule exclusion once in the completeness record's basisNote with no limited entry for hits, lines or files.

**Acceptance checks:**
- search.text and config.trace return every hit with its whole line and no limited entry
- A timed-out search is the failed lookup output with its gathered hits, not an empty or complete result

### 1.6 TASK-b9d5c5c40df5a574-s4-t6 — The document lookups and the module profile read items from their file

Replace the SECTION_BODY_CHARS slices of doc-constraint-enumerate and doc-decision-trace and the ENTRYPOINT_SCAN_CHARS slices of module-profile (two sites) with reads through measure(entity), so the whole item is used when the file still holds it and an unconfirmable item is reported as not covered.

**Acceptance checks:**
- A section longer than the former 2,000-character cut is read whole by both document lookups
- A module profile recognises an entry point beyond the former first 4,096 characters, and an unconfirmable file is reported as not covered

### 1.7 TASK-b9d5c5c40df5a574-s4-t7 — The adherence checks and the summariser read items from their file

Replace the 1,200-character body cut in the code, data and infra adherence checks, the SUMMARISER_BODY_CHARS cut in src/analyze/summariser/driver.ts and the PROJECT_CONTEXT_LIMIT cut in shared/adherence.ts with reads through measure(entity). entityToExcerpt becomes asynchronous in the three adherence checks, which ripples to their callers, so each caller is updated and the existing tests of the three checks must pass. The indexer's stored body and MAX_BODY are unchanged.

**Acceptance checks:**
- A body over 1,200 characters is read whole in the code, data and infra adherence checks, and the existing tests of the three checks pass after the change
- A document over 8,192 characters is summarised from its whole content, and an unconfirmable item is reported as not covered
- MAX_BODY in src/indexer/parser/artifact.ts and the stored body are unchanged

### 1.8 TASK-b9d5c5c40df5a574-s4-t8 — Graph and symbol lookups return every result

Delete the result-count constants and the limit and topK parameters from symbol-locate, test-locate, import-graph, usage-example, concept-resolve, manifests-locate, data-model-trace (MAX_TARGETS, MAX_FIELDS, MAX_TOP_CALLERS) and convention-detect (MAX_REPR_SUBCLASSES, MAX_BASE_CLASS_IDIOMS), so each returns everything it found with a completeness record that has no limited entry.

**Acceptance checks:**
- Each of these lookups returns every result at, one over and zero versus its former limit
- No limited entry appears in their completeness records

### 1.9 TASK-b9d5c5c40df5a574-s4-t9 — The document lookups return every result

Delete the limit and preview limits of doc-mention, the maxSources parameter of doc.decision.trace and doc.constraint.enumerate (in explore/executor.ts and the two lookups) and the result cut in src/analyze/docs-retrieval.ts, so the document lookups return every section they found.

**Acceptance checks:**
- doc-mention, doc.decision.trace and doc.constraint.enumerate return every section at, one over and zero versus the former limits
- No limited entry appears for sections read or previews

### 1.10 TASK-b9d5c5c40df5a574-s4-t10 — The capability and table lookups return every result

Delete the limit and slice cuts of capability-reuse-check (exports, subdirs and files), db-tables-list (asked in the data drivers' complete listing mode) and db-table-describe (KV summary fields and sample keys). A Redis or etcd listing stays a sample reported as sampled and incomplete, and nothing scans a live store's keys.

**Acceptance checks:**
- capability-reuse-check, db-tables-list and db-table-describe return every result, and a complete driver's table listing has no limited entry
- A Redis or etcd listing is reported as a sample and incomplete, and no key scan of a live store is made

### 1.11 TASK-b9d5c5c40df5a574-s4-t11 — The plan-task runtimes return every result

Delete FILE_LIST_LIMIT in data/discovery-objects.ts, DEFAULT_FILE_CAP in infra/_shared.ts, SAMPLE_CAP_PER_FAMILY in infra/discovery-families.ts, the TOP_SUBJECTS cut in docs/family-summarise.ts and SUMMARY_CAP in shared/aggregator.ts, and ask the data-driver listings in their complete mode, with their completeness records showing no limited entry.

**Acceptance checks:**
- The data and infra file lists, family samples, subject lists and the aggregator summary return every item
- A runtime over a sampled driver reports the sample and not a complete answer

### 1.12 TASK-b9d5c5c40df5a574-s4-t12 — The planner stops offering limits and the cache version rises

Remove the limit, topK, maxSources and previewChars parameters, their examples and the fan-out bound from the planner catalog and src/prompts/analyze/decompose.system.md; drop any such parameter from a plan in src/analyze/explore/params-schema.ts before a lookup runs and in exploration-cache-key.ts before its cache key is taken; and raise EXPLORATION_CACHE_VERSION from 3 to 4 so a stored version 3 output is treated as absent.

**Acceptance checks:**
- The planning prompt and catalog contain no limit, topK, maxSources or previewChars and no fixed result count
- A plan passing each of limit, topK, maxSources and previewChars produces the same cache key as one without, and a stored version 3 output is not served

### 1.13 TASK-b9d5c5c40df5a574-s4-t13 — Prove larger results are handled and reported

Add integration tests that a lookup result larger than every former limit is divided and combined by Story s3's method with every result processed, and that the answer names sampled, failed and uncovered sources and is not called complete otherwise, extending the partition-combine and run-report tests and the orchestrator code and docs runs.

**Acceptance checks:**
- A result larger than the former limits is processed in full through the partitioned handling
- The answer report names sampled, failed and uncovered sources and is complete only where its evidence supports it

### 1.14 TASK-b9d5c5c40df5a574-s4-t14 — Update the documents and run the live checks and the full sweep

Update design/analyze-context-builder.md, design/analyze-plan-builder.md, site/analyze.html and docs/daemon.md so none states a fixed result limit or content cut for the analyzer, add the gated live checks (a live search compared with an independent count, a live Redis listing reported as sampled), and run the full sweep once after the other tasks.

**Acceptance checks:**
- A search of the four named documents for the removed constants and parameter names finds no hit that belongs to the analyzer; each hit is removed or shown to belong to another caller
- The live checks are written and gated by INSRC_LIVE_TESTS=1, and the full sweep result is recorded

## 2. Test-strategy coverage

| LLD strategy item | Covered by |
| :--- | :--- |
| src/analyze/explore/__tests__/completeness-all-lookups.test.ts (extended: former limit, one more, zero for each lookup in the inventory) | `t8`, `t9`, `t10` |
| src/analyze/runtimes data, infra and shared runtime tests (file list, file cap, sample cap, project context and summary caps) | `t11`, `t7` |
| src/analyze/explore/__tests__ for doc-mention, db-tables-list, capability-reuse-check, data-model-trace and concept-resolve | `t8`, `t9`, `t10` |
| src/analyze/__tests__/item-length.test.ts (measureItem content: whole-file kind, line-range kind, shifted lines, missing file, unreadable file, no recorded hash) | `t1` |
| src/analyze/explore/__tests__ for doc-constraint-enumerate and doc-decision-trace section bodies | `t6` |
| the three adherence-check tests (body longer than 1200 characters) | `t7` |
| src/daemon/tools/builtins/search/__tests__/grep-omitted.test.ts (complete flag: more hits than MAX_LIMIT, a line over MAX_LINE_CHARS, a file over MAX_FILE_BYTES, ripgrep output over RG_MAX_OUTPUT_BYTES, timeout reported as failed) | `t3`, `t4` |
| src/analyze/explore/__tests__/completeness-all-lookups.test.ts search.text and config.trace cases | `t5` |
| runGrepSearch without the complete flag keeps today's limits | `t3`, `t4` |
| src/analyze tests that read src/prompts/analyze/decompose.system.md and the planner's catalog for limit, topK, maxSources and previewChars | `t12` |
| src/db exploration-cache tests for EXPLORATION_CACHE_VERSION 4 and a stored version 3 output treated as absent | `t12` |
| src/analyze/explore/__tests__/cache-area-isolation.test.ts | `t12` |
| src/analyze/context/__tests__ partition tests with a lookup result larger than the former limits | `t13` |
| src/analyze/orchestrator/__tests__ docs and code runs with a failed and a sampled source | `t13` |
| a live run of search.text over this repository compared with an independent count of the same pattern | `t14` |
| a live Redis listing reported as sampled | `t14`, `t10` |

## 3. References

- **[[c1]]** `prior-artifact` `LLD s4 contractDetails measureItem`
- **[[c2]]** `prior-artifact` `LLD s4 contractDetails createItemMeasurer`
- **[[c3]]** `prior-artifact` `LLD s4 contractDetails runGrepSearch`
- **[[c4]]** `prior-artifact` `LLD s4 contractDetails runSearchText`
- **[[c5]]** `prior-artifact` `LLD s4 dataModelChanges ItemMeasure`
- **[[c6]]** `prior-artifact` `LLD s4 dataModelChanges GrepSearchOptions`
- **[[c7]]** `prior-artifact` `LLD s4 dataModelChanges EXPLORATION_CACHE_VERSION`
- **[[c8]]** `prior-artifact` `LLD s4 dataModelChanges the result-count constants (MAX_TOP_K, DEFAULT_LIMIT)`
- **[[c9]]** `prior-artifact` `LLD s4 dataModelChanges the plan-task runtime caps (FILE_LIST_LIMIT and its peers)`
- **[[c10]]** `prior-artifact` `LLD s4 dataModelChanges the content cuts (SECTION_BODY_CHARS and its peers)`
- **[[c11]]** `prior-artifact` `LLD s4 migration steps 1 to 8 and backward compatibility`
- **[[c12]]** `prior-artifact` `LLD s4 errorPaths, edge cases and invariants to preserve`
- **[[c13]]** `stakeholder` `user, 2026-11-14` — "yes, resolve all"
