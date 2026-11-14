<!-- insrc:artifact TESTS-b9d5c5c40df5a574-s4 -->

# Tests: b9d5c5c40df5a574 s4

What the build validation gate ran for each Task of this Story, and what each test case did. The gate runs the tests itself; a result here is never a builder's statement unless it says so. `not found` means no test of that title ran in that file.

**Totals:** 33 pass, 0 fail, 0 skipped, 0 not found; 2 reported by the builder and not run by the gate.

## t1

Run at 2026-11-14T13:08:41.465Z on commit `6c24ca958`. Tests check: **passed**. 1 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**unit: item-length.test.ts: measureItem returns the whole content of a whole-file and a line-range item and no content for a changed, missing, unreadable or unhashed file**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | measureItem returns the whole content of a whole-file and a line-range item and no content for a changed, missing, unreadable or unhashed file | `src/analyze/__tests__/item-length.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `src/analyze/__tests__/item-length.test.ts` | 0 | 5 | 0.6 s |  |

## t2

Run at 2026-11-14T13:24:55.435Z on commit `8617331d3`. Tests check: **passed**. 1 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**unit: partly-read.test.ts: measure returns content for a confirmed item and a skipped or partlyRead entry with its reason for an unconfirmed one**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | measure returns content for a confirmed item and a skipped or partlyRead entry with its reason for an unconfirmed one | `src/analyze/explore/__tests__/partly-read.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `src/analyze/explore/__tests__/partly-read.test.ts` | 0 | 7 | 0.9 s |  |

## t3

Run at 2026-11-14T13:29:21.694Z on commit `c921351df`. Tests check: **passed**. 2 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**integration: grep-omitted.test.ts: through the ripgrep backend with complete set, more hits than MAX_LIMIT, a line over MAX_LINE_CHARS and output over RG_MAX_OUTPUT_BYTES are all returned in full, and a search past the 30-second deadline fails with its gathered hits**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | through the ripgrep backend with complete set, more hits than MAX_LIMIT, a line over MAX_LINE_CHARS and output over RG_MAX_OUTPUT_BYTES are all returned in full, and a search past the 30-second deadline fails with its gathered hits | `src/daemon/tools/builtins/search/__tests__/grep-omitted.test.ts` |

**integration: grep-omitted.test.ts: without complete the ripgrep backend still applies MAX_LIMIT, MAX_LINE_CHARS and RG_MAX_OUTPUT_BYTES**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | without complete the ripgrep backend still applies MAX_LIMIT, MAX_LINE_CHARS and RG_MAX_OUTPUT_BYTES | `src/daemon/tools/builtins/search/__tests__/grep-omitted.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `src/daemon/tools/builtins/search/__tests__/grep-omitted.test.ts` | 0 | 10 | 1.8 s |  |

## t4

Run at 2026-11-14T13:34:15.719Z on commit `f6f5035f0`. Tests check: **passed**. 2 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**integration: grep-omitted.test.ts: through the Node fallback with complete set, every hit with its whole line is returned, a file over MAX_FILE_BYTES is searched, the deadline fails with gathered hits and an unreadable file is listed as skipped**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | through the Node fallback with complete set, every hit with its whole line is returned, a file over MAX_FILE_BYTES is searched, the deadline fails with gathered hits and an unreadable file is listed as skipped | `src/daemon/tools/builtins/search/__tests__/grep-omitted.test.ts` |

**integration: grep-omitted.test.ts: without complete the Node fallback behaves exactly as today**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | without complete the Node fallback behaves exactly as today | `src/daemon/tools/builtins/search/__tests__/grep-omitted.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `src/daemon/tools/builtins/search/__tests__/grep-omitted.test.ts` | 0 | 12 | 2 s |  |

## t5

Run at 2026-11-14T13:42:29.911Z on commit `e1f7a955a`. Tests check: **passed**. 1 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**integration: completeness-all-lookups.test.ts: search.text and config.trace return every hit with its whole line and no limited entry, and a timed-out search is the failed lookup output with its gathered hits**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | search.text and config.trace return every hit with its whole line and no limited entry, and a timed-out search is the failed lookup output with its gathered hits | `src/analyze/explore/__tests__/completeness-all-lookups.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `src/analyze/explore/__tests__/completeness-all-lookups.test.ts` | 0 | 11 | 1.5 s |  |

## t6

Run at 2026-11-14T13:48:06.862Z on commit `8d45126b7`. Tests check: **passed**. 2 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**unit: partly-read.test.ts: doc.constraint.enumerate and doc.decision.trace read a section longer than the former cut whole and report an unconfirmable section as not covered**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | doc.constraint.enumerate and doc.decision.trace read a section longer than the former cut whole and report an unconfirmable section as not covered | `src/analyze/explore/__tests__/partly-read.test.ts` |

**unit: module-profile-entrypoint.test.ts: an entry point beyond the former first 4,096 characters is recognised and an unconfirmable file is reported as not covered**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | an entry point beyond the former first 4,096 characters is recognised and an unconfirmable file is reported as not covered | `src/analyze/explore/__tests__/module-profile-entrypoint.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `src/analyze/explore/__tests__/module-profile-entrypoint.test.ts` | 0 | 1 | 0.7 s |  |
| `src/analyze/explore/__tests__/partly-read.test.ts` | 0 | 5 | 0.8 s |  |

## t7

Run at 2026-11-14T13:56:26.845Z on commit `7842384df`. Tests check: **passed**. 8 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**unit: adherence-check-body.test.ts: the code, data and infra adherence checks read a body over 1200 characters whole and an unconfirmable item is reported as not covered**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | the code, data and infra adherence checks read a body over 1200 characters whole and an unconfirmable item is reported as not covered | `src/analyze/runtimes/__tests__/adherence-check-body.test.ts` |
| pass | a check with a topic judges against the constraints enumerated from the repository's documents, and its output carries those constraints, their citations and the record's path | `src/analyze/runtimes/shared/__tests__/adherence-topic-route.test.ts` |
| pass | the enumeration's reached limit, partly read section and skipped search by meaning appear in the completeness record of the check that made it and of a check that read its record | `src/analyze/runtimes/shared/__tests__/adherence-topic-route.test.ts` |
| pass | an inline list or stored-document ids are used alone when given, with a topic also present, and no enumeration is made; an empty inline list beside ids uses the ids, and beside a topic uses the topic | `src/analyze/runtimes/shared/__tests__/adherence-topic-route.test.ts` |
| pass | the project-context assembler reports a limit it reached and the documents behind its decisions and constraints, and the adherence check puts them in the record | `src/analyze/runtimes/__tests__/partly-read-plan-tasks.test.ts` |
| pass | the adherence check gives the same result for a repo scope as before, as a code, a data and an infra template, and as a data template on an unregistered directory is not refused | `src/analyze/runtimes/code/__tests__/scope-area.test.ts` |
| pass | an adherence check whose model call fails is recorded by the walk as a failed task | `src/analyze/runtimes/__tests__/dropped-or-failed.test.ts` |

**unit: summariser-body.test.ts: a document over 8192 characters is summarised from its whole content**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | a document over 8192 characters is summarised from its whole content | `src/analyze/summariser/__tests__/summariser-body.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `src/analyze/runtimes/__tests__/adherence-check-body.test.ts` | 0 | 1 | 0.7 s |  |
| `src/analyze/runtimes/__tests__/dropped-or-failed.test.ts` | 0 | 3 | 1 s |  |
| `src/analyze/runtimes/__tests__/partly-read-plan-tasks.test.ts` | 0 | 3 | 0.7 s |  |
| `src/analyze/runtimes/code/__tests__/scope-area.test.ts` | 0 | 2 | 0.7 s |  |
| `src/analyze/runtimes/shared/__tests__/adherence-topic-route.test.ts` | 0 | 10 | 0.8 s |  |
| `src/analyze/summariser/__tests__/summariser-body.test.ts` | 0 | 1 | 0.7 s |  |

## t8

Run at 2026-11-14T14:58:15.269Z on commit `579838cd3`. Tests check: **passed**. 1 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**unit: completeness-all-lookups.test.ts: symbol-locate, test-locate, import-graph, usage-example, concept-resolve, manifests-locate, data-model-trace and convention-detect return every result at, one over and zero versus the former limit with no limited entry**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | symbol-locate, test-locate, import-graph, usage-example, concept-resolve, manifests-locate, data-model-trace and convention-detect return every result at, one over and zero versus the former limit with no limited entry | `src/analyze/explore/__tests__/completeness-all-lookups.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `src/analyze/explore/__tests__/completeness-all-lookups.test.ts` | 0 | 11 | 1.6 s |  |

## t9

Run at 2026-11-14T15:07:08.579Z on commit `b39481443`. Tests check: **passed**. 1 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**unit: completeness-all-lookups.test.ts: doc-mention, doc.decision.trace and doc.constraint.enumerate return every section at, one over and zero versus the former limits with no limited entry**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | doc-mention, doc.decision.trace and doc.constraint.enumerate return every section at, one over and zero versus the former limits with no limited entry | `src/analyze/explore/__tests__/completeness-all-lookups.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `src/analyze/explore/__tests__/completeness-all-lookups.test.ts` | 0 | 12 | 1.6 s |  |

## t10

Run at 2026-11-14T15:14:39.120Z on commit `5798a91fd`. Tests check: **passed**. 4 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**unit: completeness-all-lookups.test.ts: capability-reuse-check, db-tables-list and db-table-describe return every result and a complete driver's table listing has no limited entry**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | capability-reuse-check, db-tables-list and db-table-describe return every result and a complete driver's table listing has no limited entry | `src/analyze/explore/__tests__/completeness-all-lookups.test.ts` |
| pass | a limit a plan still passes is ignored: the named subject is checked first and every child that matches follows, on both execution modes | `src/analyze/explore/__tests__/capability-reuse-anchor.test.ts` |

**unit: kv-common.test.ts: a Redis or etcd listing is a sample reported incomplete and no key scan is made**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | a Redis or etcd listing is a sample reported incomplete and no key scan is made | `src/daemon/db/__tests__/kv-common.test.ts` |
| pass | the table listing of sqlite, pg and mysql applies no clamp in the complete mode, that of oracle and mssql builds its query without the row-limit clause, and the four namespace drivers' listing applies no limit; each behaves exactly as before without the mode; the file listing walks to the end when no limit is given; a ClickHouse source, whose listing throws, is not determined | `src/daemon/db/__tests__/list-complete.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `src/analyze/explore/__tests__/capability-reuse-anchor.test.ts` | 0 | 5 | 1.1 s |  |
| `src/analyze/explore/__tests__/completeness-all-lookups.test.ts` | 0 | 12 | 1.6 s |  |
| `src/daemon/db/__tests__/kv-common.test.ts` | 0 | 12 | 0.8 s |  |
| `src/daemon/db/__tests__/list-complete.test.ts` | 0 | 1 | 1.2 s |  |

## t11

Run at 2026-11-14T15:26:01.288Z on commit `cf0e6e4c5`. Tests check: **passed**. 4 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**unit: partly-read-plan-tasks.test.ts: the data and infra file lists, family samples, subject lists and the aggregator summary return every item**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | the data and infra file lists, family samples, subject lists and the aggregator summary return every item | `src/analyze/runtimes/__tests__/partly-read-plan-tasks.test.ts` |
| pass | discovery-families names every file of a family and reports no limit | `src/analyze/runtimes/__tests__/completeness-all-runtimes.test.ts` |

**unit: dropped-or-failed.test.ts: a runtime over a sampled driver reports the sample and not a complete answer**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | a runtime over a sampled driver reports the sample and not a complete answer | `src/analyze/runtimes/__tests__/dropped-or-failed.test.ts` |
| pass | the object-listing plan task reports a driver that stopped early as skipped, never as a limit | `src/analyze/runtimes/__tests__/completeness-all-runtimes.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `src/analyze/runtimes/__tests__/completeness-all-runtimes.test.ts` | 0 | 7 | 1.3 s |  |
| `src/analyze/runtimes/__tests__/dropped-or-failed.test.ts` | 0 | 4 | 1 s |  |
| `src/analyze/runtimes/__tests__/partly-read-plan-tasks.test.ts` | 0 | 4 | 1.1 s |  |

## t12

Run at 2026-11-14T15:53:18.954Z on commit `2e62161b4`. Tests check: **passed**. 3 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**unit: decompose-prompt-limits.test.ts: the planning prompt and catalog contain no limit, topK, maxSources or previewChars and no fixed result count**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | the planning prompt and catalog contain no limit, topK, maxSources or previewChars and no fixed result count | `src/analyze/context/__tests__/decompose-prompt-limits.test.ts` |

**unit: params-schema.test.ts: a plan passing each of limit, topK, maxSources and previewChars produces the same cache key as one without**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | a plan passing each of limit, topK, maxSources and previewChars produces the same cache key as one without | `src/analyze/explore/__tests__/params-schema.test.ts` |

**unit: cache-area-isolation.test.ts: a stored version 3 output is treated as absent at version 4**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | a stored version 3 output is treated as absent at version 4 | `src/analyze/explore/__tests__/cache-area-isolation.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `src/analyze/context/__tests__/decompose-prompt-limits.test.ts` | 0 | 1 | 0.7 s |  |
| `src/analyze/explore/__tests__/cache-area-isolation.test.ts` | 0 | 5 | 1.1 s |  |
| `src/analyze/explore/__tests__/params-schema.test.ts` | 0 | 4 | 0.7 s |  |

## t13

Run at 2026-11-14T15:56:05.395Z on commit `a02da29a2`. Tests check: **passed**. 2 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**integration: partition-combine.test.ts: a lookup result larger than every former limit is divided and combined with every result processed**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | a lookup result larger than every former limit is divided and combined with every result processed | `src/analyze/context/__tests__/partition-combine.test.ts` |

**integration: run-report.test.ts: the answer names sampled, failed and uncovered sources and is complete only where its evidence supports it**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | the answer names sampled, failed and uncovered sources and is complete only where its evidence supports it | `src/analyze/orchestrator/__tests__/run-report.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `src/analyze/context/__tests__/partition-combine.test.ts` | 0 | 7 | 0.9 s |  |
| `src/analyze/orchestrator/__tests__/run-report.test.ts` | 0 | 7 | 0.9 s |  |

## t14

Run at 2026-11-14T16:33:15.215Z on commit `dc36dd201`. Tests check: **passed**. 1 pass, 0 fail, 0 skipped, 0 not found; 2 reported by the builder and not run by the gate.

**unit: analyzer-docs-limits.test.ts: the four named documents contain no analyzer limit constant or parameter name**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | the four named documents contain no analyzer limit constant or parameter name | `src/analyze/__tests__/analyzer-docs-limits.test.ts` |

**live: search-text-live.test.ts: a live search.text over this repository returns the same count as an independent search of the same pattern**

Reported by the builder, not run by the gate: **pass**. Evidence: docs/epics/make-insrc-analysis-complete-used-right-E20261006b9d5c5c4/S004/SWEEP.md, section 'Live checks' (INSRC_LIVE_TESTS=1 run output)

**live: redis-etcd-live.test.ts: a live Redis listing is reported as sampled and incomplete**

Reported by the builder, not run by the gate: **pass**. Evidence: docs/epics/make-insrc-analysis-complete-used-right-E20261006b9d5c5c4/S004/SWEEP.md, section 'Live checks' (real Redis 8.0.5, INSRC_LIVE_TESTS=1 INSRC_TEST_REDIS_URL=redis://127.0.0.1:6344, 1 pass)

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `src/analyze/__tests__/analyzer-docs-limits.test.ts` | 0 | 1 | 0.5 s |  |
