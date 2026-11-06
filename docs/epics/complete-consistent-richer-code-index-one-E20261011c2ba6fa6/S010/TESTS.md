<!-- insrc:artifact TESTS-c2ba6fa62a148ed1-s10 -->

# Tests: c2ba6fa62a148ed1 s10

What the build validation gate ran for each Task of this Story, and what each test case did. The gate runs the tests itself; a result here is never a builder's statement unless it says so. `not found` means no test of that title ran in that file.

**Totals:** 41 pass, 0 fail, 0 skipped, 0 not found; 2 reported by the builder and not run by the gate.

## t1

Run at 2026-11-04T05:30:21.258Z on commit `533bb49f3`. Tests check: **passed**. 4 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**integration: s10 t1: migration 9 creates empty doc-relation sub-dbs and changes no other row**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | s10 t1: migration 9 creates empty doc-relation sub-dbs and changes no other row | `src/db/__tests__/doc-relations-store.test.ts` |

**integration: s10 t1: a full index clears and carries proposal rows; restore keeps only unchanged documents**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | s10 t1: a full index clears and carries proposal rows; restore keeps only unchanged documents | `src/db/__tests__/doc-relations-store.test.ts` |

**integration: s10 t1: removeRepo deletes proposal, carry and quality rows**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | s10 t1: removeRepo deletes proposal, carry and quality rows | `src/db/__tests__/doc-relations-store.test.ts` |

**integration: s10 t1: session-memory reads the new handles and is refused writes**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | s10 t1: session-memory reads the new handles and is refused writes | `src/db/__tests__/doc-relations-store.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `src/db/__tests__/doc-relations-store.test.ts` | 0 | 4 | 2.2 s |  |

## t2

Run at 2026-11-04T05:39:58.496Z on commit `3c6b94c7d`. Tests check: **passed**. 4 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**unit: s10 t2: link destinations resolve against the document's directory and mentions against the repository root**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | s10 t2: link destinations resolve against the document's directory and mentions against the repository root | `src/indexer/parser/__tests__/markdown-links.test.ts` |

**unit: s10 t2: preamble and skipped-section links attribute to the file entity; fenced code, URLs and mailto are not read**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | s10 t2: preamble and skipped-section links attribute to the file entity; fenced code, URLs and mailto are not read | `src/indexer/parser/__tests__/markdown-links.test.ts` |

**unit: s10 t2: one REFERENCES per (source, target) with evidence 'extracted'; no self links**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | s10 t2: one REFERENCES per (source, target) with evidence 'extracted'; no self links | `src/indexer/parser/__tests__/markdown-links.test.ts` |

**unit: s10 t2: a bare file name yields a pending name reference**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | s10 t2: a bare file name yields a pending name reference | `src/indexer/parser/__tests__/markdown-links.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `src/indexer/parser/__tests__/markdown-links.test.ts` | 0 | 4 | 0.6 s |  |

## t3

Run at 2026-11-04T05:47:42.323Z on commit `9e5eabe67`. Tests check: **passed**. 5 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**integration: s10 t3: two linked documents store an extracted REFERENCES with zero provider calls**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | s10 t3: two linked documents store an extracted REFERENCES with zero provider calls | `src/indexer/__tests__/doc-links-commit.test.ts` |

**integration: s10 t3: links to missing, ignored and unselected targets are no-candidate pending rows; repository complete**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | s10 t3: links to missing, ignored and unselected targets are no-candidate pending rows; repository complete | `src/indexer/__tests__/doc-links-commit.test.ts` |

**integration: s10 t3: a target created later is promoted by Pass 0 on settle**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | s10 t3: a target created later is promoted by Pass 0 on settle | `src/indexer/__tests__/doc-links-commit.test.ts` |

**integration: s10 t3: removing a target re-reads the citing document**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | s10 t3: removing a target re-reads the citing document | `src/indexer/__tests__/doc-links-commit.test.ts` |

**integration: s10 t3: Pass 2, the SQL re-check and the SQL by-name return leave doc-link rows alone**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | s10 t3: Pass 2, the SQL re-check and the SQL by-name return leave doc-link rows alone | `src/indexer/__tests__/doc-links-commit.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `src/indexer/__tests__/doc-links-commit.test.ts` | 0 | 5 | 3 s |  |

## t4

Run at 2026-11-04T05:51:43.950Z on commit `69a80cd08`. Tests check: **passed**. 4 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**unit: s10 t4: role taxonomy has indexer.docRelations as peripheral mid**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | s10 t4: role taxonomy has indexer.docRelations as peripheral mid | `src/indexer/__tests__/doc-relations-provider.test.ts` |

**integration: s10 t4: a cheap-tier override is refused with and without a routing context**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | s10 t4: a cheap-tier override is refused with and without a routing context | `src/indexer/__tests__/doc-relations-provider.test.ts` |

**unit: s10 t4: a CLI family with no listed model is refused before any call**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | s10 t4: a CLI family with no listed model is refused before any call | `src/indexer/__tests__/doc-relations-provider.test.ts` |

**unit: s10 t4: provider-failure classification across CLI error shapes**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | s10 t4: provider-failure classification across CLI error shapes | `src/indexer/__tests__/doc-relations-provider.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `src/indexer/__tests__/doc-relations-provider.test.ts` | 0 | 4 | 0.7 s |  |

## t5

Run at 2026-11-04T06:04:38.709Z on commit `b1ef68c14`. Tests check: **passed**. 5 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**unit: s10 t5: switchOf on only at the bar with matching model and set hash**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | s10 t5: switchOf on only at the bar with matching model and set hash | `src/db/__tests__/doc-relations-read.test.ts` |

**integration: s10 t5: name references resolve across full-index order and stop on a second same-named file**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | s10 t5: name references resolve across full-index order and stop on a second same-named file | `src/db/__tests__/doc-relations-read.test.ts` |

**integration: s10 t5: proposals read as 'model' only while on and eligible; older generations counted as stale**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | s10 t5: proposals read as 'model' only while on and eligible; older generations counted as stale | `src/db/__tests__/doc-relations-read.test.ts` |

**integration: s10 t5: search.doc_relations registered, session-class, refused while indexing**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | s10 t5: search.doc_relations registered, session-class, refused while indexing | `src/db/__tests__/doc-relations-read.test.ts` |

**integration: s10 t5: callers, callees and closure are unchanged by proposals**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | s10 t5: callers, callees and closure are unchanged by proposals | `src/db/__tests__/doc-relations-read.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `src/db/__tests__/doc-relations-read.test.ts` | 0 | 5 | 3 s |  |

## t6

Run at 2026-11-04T06:14:36.255Z on commit `cc1395eab`. Tests check: **passed**. 3 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**integration: s10 t6: doc-relations jobs route to the summary lane and the summary worker**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | s10 t6: doc-relations jobs route to the summary lane and the summary worker | `src/indexer/__tests__/doc-relations-jobs.test.ts` |

**integration: s10 t6: runQueuedJob lifecycle: second pass, failed-pass retry, abandoned reply**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | s10 t6: runQueuedJob lifecycle: second pass, failed-pass retry, abandoned reply | `src/indexer/__tests__/doc-relations-jobs.test.ts` |

**integration: s10 t6: carried rows restored after a full index before the pass; stop disposes timers**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | s10 t6: carried rows restored after a full index before the pass; stop disposes timers | `src/indexer/__tests__/doc-relations-jobs.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `src/indexer/__tests__/doc-relations-jobs.test.ts` | 0 | 3 | 4.4 s |  |

## t7

Run at 2026-11-04T06:24:35.534Z on commit `4c9df7c7d`. Tests check: **passed**. 4 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**integration: s10 t7: serial calls; only changed documents; reindex of an unchanged repository sends none**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | s10 t7: serial calls; only changed documents; reindex of an unchanged repository sends none | `src/indexer/__tests__/doc-relations-pass.test.ts` |

**integration: s10 t7: stale-hash guard and superseded by a full index**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | s10 t7: stale-hash guard and superseded by a full index | `src/indexer/__tests__/doc-relations-pass.test.ts` |

**integration: s10 t7: unavailable provider (resolution, not signed in) writes status and the retry recovers**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | s10 t7: unavailable provider (resolution, not signed in) writes status and the retry recovers | `src/indexer/__tests__/doc-relations-pass.test.ts` |

**unit: s10 t7: proposal validation, resolution and dedupe against extracted links**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | s10 t7: proposal validation, resolution and dedupe against extracted links | `src/indexer/__tests__/doc-relations-pass.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `src/indexer/__tests__/doc-relations-pass.test.ts` | 0 | 4 | 4.7 s |  |

## t8

Run at 2026-11-04T06:38:28.081Z on commit `61575c569`. Tests check: **passed**. 4 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**unit: s10 t8: set validation and proposal normalisation**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | s10 t8: set validation and proposal normalisation | `src/indexer/__tests__/doc-relations-measure.test.ts` |

**unit: s10 t8: quality computation over admitted and implied links**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | s10 t8: quality computation over admitted and implied links | `src/indexer/__tests__/doc-relations-measure.test.ts` |

**integration: s10 t8: docRelations.measure records figures over a 100+ link fixture; below the bar reads exclude proposals**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | s10 t8: docRelations.measure records figures over a 100+ link fixture; below the bar reads exclude proposals | `src/indexer/__tests__/doc-relations-measure.test.ts` |

**integration: s10 t8: measurement provider failure creates or keeps the row with extraction unavailable**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | s10 t8: measurement provider failure creates or keeps the row with extraction unavailable | `src/indexer/__tests__/doc-relations-measure.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `src/indexer/__tests__/doc-relations-measure.test.ts` | 0 | 4 | 6.1 s |  |

## t9

Run at 2026-11-04T06:57:19.448Z on commit `4ee436fe9`. Tests check: **passed**. 4 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**unit: s10 t9: evidenceOrigin document noun and unchanged default wording**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | s10 t9: evidenceOrigin document noun and unchanged default wording | `src/analyze/explore/__tests__/doc-relations-attach.test.ts` |

**integration: s10 t9: attachDocRelations on fresh, executePlanWithContext and stepPlanWithContext hits**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | s10 t9: attachDocRelations on fresh, executePlanWithContext and stepPlanWithContext hits | `src/analyze/explore/__tests__/doc-relations-attach.test.ts` |

**integration: s10 t9: resume of a paused step recomputes related links**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | s10 t9: resume of a paused step recomputes related links | `src/analyze/explore/__tests__/doc-relations-attach.test.ts` |

**integration: s10 t9: bundle cache stale by docRelationsRevision**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | s10 t9: bundle cache stale by docRelationsRevision | `src/analyze/context/__tests__/run-shaper-wiring.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `src/analyze/context/__tests__/run-shaper-wiring.test.ts` | 0 | 19 | 5 s |  |
| `src/analyze/explore/__tests__/doc-relations-attach.test.ts` | 0 | 3 | 1.8 s |  |

## t10

Run at 2026-11-04T07:13:02.393Z on commit `c7140757c`. Tests check: **passed**. 4 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**integration: s10 t10: repo.stats and the status board read the persisted docRelations status**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | s10 t10: repo.stats and the status board read the persisted docRelations status | `src/daemon/__tests__/doc-relations-status.test.ts` |

**unit: s10 t10: CLI ReposPane renders docRelations states**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | s10 t10: CLI ReposPane renders docRelations states | `src/cli/panes/__tests__/ReposPane-doc-relations.test.ts` |

**unit: s10 t10: VS Code repositoryList renders docRelations states**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | s10 t10: VS Code repositoryList renders docRelations states | `vscode-plugin/src/panels/__tests__/doc-relations-status.test.ts` |

**unit: s10 t10: JetBrains RepoStatusDialog renders docRelations states**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | s10 t10: JetBrains RepoStatusDialog renders docRelations states | `jetbrains-plugin/__tests__/s10-gradle.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `jetbrains-plugin/__tests__/s10-gradle.test.ts` | 0 | 1 | 30.7 s |  |
| `src/cli/panes/__tests__/ReposPane-doc-relations.test.ts` | 0 | 1 | 3.9 s |  |
| `src/daemon/__tests__/doc-relations-status.test.ts` | 0 | 1 | 7.8 s |  |
| `vscode-plugin/src/panels/__tests__/doc-relations-status.test.ts` | 0 | 1 | 1.2 s |  |

## t11

Run at 2026-11-05T04:32:36.489Z on commit `992618f97`. Tests check: **passed**. 0 pass, 0 fail, 0 skipped, 0 not found; 2 reported by the builder and not run by the gate.

the gate ran no test: every named test of this Task was reported by the builder

**live: s10 t11: measurement on this repository against the hand-checked set**

Reported by the builder, not run by the gate: **pass**. Evidence: docs/epics/complete-consistent-richer-code-index-one-E20261011c2ba6fa6/S010/t11-evidence.md#re-measurement-after-the-code-review-fix-2026-11-05

**smoke: s10 t11: installed daemon returns extracted document links and docRelations status**

Reported by the builder, not run by the gate: **pass**. Evidence: docs/epics/complete-consistent-richer-code-index-one-E20261011c2ba6fa6/S010/t11-evidence.md#installed-daemon-smoke
