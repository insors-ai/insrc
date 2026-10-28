<!-- insrc:artifact TESTS-fa396bdf197b8e8b-s1 -->

# Tests: fa396bdf197b8e8b s1

What the build validation gate ran for each Task of this Story, and what each test case did. The gate runs the tests itself; a result here is never a builder's statement unless it says so. `not found` means no test of that title ran in that file.

**Totals:** 26 pass, 0 fail, 0 skipped, 0 not found; 2 reported by the builder and not run by the gate.

## t1

Run at 2026-10-27T08:11:48.224Z on commit `ebb41f59a`. Tests check: **passed**. 5 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**integration: src/indexer/__tests__/watcher-new-directories.test.ts: after addRepo, mkdir -p a/b/c with a file written in it at once yields a create event for that file, and a second file written in a/b/c three seconds later yields an event too (the case that produced no event before the fix)**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | src/indexer/__tests__/watcher-new-directories.test.ts: after addRepo, mkdir -p a/b/c with a file written in it at once yields a create event for that file, and a second file written in a/b/c three seconds later yields an event too (the case that produced no event before the fix) | `src/indexer/__tests__/watcher-new-directories.test.ts` |

**integration: src/indexer/__tests__/watcher-new-directories.test.ts: a directory tree with files created in one call yields a create event for every file in the tree, including files in nested directories, and a symbolic link to a directory is not followed**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | src/indexer/__tests__/watcher-new-directories.test.ts: a directory tree with files created in one call yields a create event for every file in the tree, including files in nested directories, and a symbolic link to a directory is not followed | `src/indexer/__tests__/watcher-new-directories.test.ts` |

**integration: src/indexer/__tests__/watcher-new-directories.test.ts: files inside a new directory whose name is on the ignore list (node_modules) and inside an ignored subdirectory of a new directory yield no events, at creation and when written later**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | src/indexer/__tests__/watcher-new-directories.test.ts: files inside a new directory whose name is on the ignore list (node_modules) and inside an ignored subdirectory of a new directory yield no events, at creation and when written later | `src/indexer/__tests__/watcher-new-directories.test.ts` |

**integration: src/indexer/__tests__/watcher-new-directories.test.ts: after a new nested directory is deleted and created again with the same path, files written in it are reported again**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | src/indexer/__tests__/watcher-new-directories.test.ts: after a new nested directory is deleted and created again with the same path, files written in it are reported again | `src/indexer/__tests__/watcher-new-directories.test.ts` |

**integration: src/indexer/__tests__/watcher-new-directories.test.ts: after close() no handler is called for later writes, and after removeRepo() the repo's per-directory subscriptions deliver nothing**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | src/indexer/__tests__/watcher-new-directories.test.ts: after close() no handler is called for later writes, and after removeRepo() the repo's per-directory subscriptions deliver nothing | `src/indexer/__tests__/watcher-new-directories.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `src/indexer/__tests__/watcher-new-directories.test.ts` | 0 | 5 | 8.7 s |  |

## t2

Run at 2026-10-27T08:14:07.191Z on commit `fe216e01a`. Tests check: **passed**. 2 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**integration: src/indexer/__tests__/watcher-new-directories.test.ts: a per-directory subscribe that throws is logged, does not throw out of the handler, and the files present in the new directory are still reported once**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | src/indexer/__tests__/watcher-new-directories.test.ts: a per-directory subscribe that throws is logged, does not throw out of the handler, and the files present in the new directory are still reported once | `src/indexer/__tests__/watcher-new-directories.test.ts` |

**integration: src/indexer/__tests__/watcher-new-directories.test.ts: a new nested directory that cannot be read (mode 000, skipped when running as root) does not throw or stop later events for other directories**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | src/indexer/__tests__/watcher-new-directories.test.ts: a new nested directory that cannot be read (mode 000, skipped when running as root) does not throw or stop later events for other directories | `src/indexer/__tests__/watcher-new-directories.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `src/indexer/__tests__/watcher-new-directories.test.ts` | 0 | 7 | 9.8 s |  |

## t3

Run at 2026-10-27T08:16:18.456Z on commit `4af5aa03d`. Tests check: **passed**. 9 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**unit: src/workflow/code-review/__tests__/freshness.test.ts: a changed file whose mtime is 0 (deleted or unstattable) is not stale, not in unindexedFiles, and neither the entity nor the selection seam decides it, even when selection would say selected**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | src/workflow/code-review/__tests__/freshness.test.ts: a changed file whose mtime is 0 (deleted or unstattable) is not stale, not in unindexedFiles, and neither the entity nor the selection seam decides it, even when selection would say selected | `src/workflow/code-review/__tests__/freshness.test.ts` |

**unit: src/workflow/code-review/__tests__/freshness.test.ts: a file with no entities and selection 'not-code' or 'excluded-by-ignore' is not stale, whatever the repo-level lastIndexed is**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | src/workflow/code-review/__tests__/freshness.test.ts: a file with no entities and selection 'not-code' or 'excluded-by-ignore' is not stale, whatever the repo-level lastIndexed is | `src/workflow/code-review/__tests__/freshness.test.ts` |

**unit: src/workflow/code-review/__tests__/freshness.test.ts: a file with no entities and selection 'selected' is in staleFiles and unindexedFiles when it was never requested**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | src/workflow/code-review/__tests__/freshness.test.ts: a file with no entities and selection 'selected' is in staleFiles and unindexedFiles when it was never requested | `src/workflow/code-review/__tests__/freshness.test.ts` |

**unit: src/workflow/code-review/__tests__/freshness.test.ts: with an idle queue, a file with entities whose watermark is older than its mtime (a missed update) is in staleFiles and unindexedFiles, and the selection seam is not consulted for it**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | src/workflow/code-review/__tests__/freshness.test.ts: with an idle queue, a file with entities whose watermark is older than its mtime (a missed update) is in staleFiles and unindexedFiles, and the selection seam is not consulted for it | `src/workflow/code-review/__tests__/freshness.test.ts` |

**unit: src/workflow/code-review/__tests__/freshness.test.ts: a stale file requested at or after its mtime stays in staleFiles but leaves unindexedFiles, with the queue idle or busy, for both an entity-less file and a file with an older watermark**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | src/workflow/code-review/__tests__/freshness.test.ts: a stale file requested at or after its mtime stays in staleFiles but leaves unindexedFiles, with the queue idle or busy, for both an entity-less file and a file with an older watermark | `src/workflow/code-review/__tests__/freshness.test.ts` |

**unit: src/workflow/code-review/__tests__/freshness.test.ts: a file edited after its request is in unindexedFiles again**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | src/workflow/code-review/__tests__/freshness.test.ts: a file edited after its request is in unindexedFiles again | `src/workflow/code-review/__tests__/freshness.test.ts` |

**unit: src/workflow/code-review/__tests__/freshness.test.ts: a selection seam that throws keeps an entity-less file stale and out of unindexedFiles**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | src/workflow/code-review/__tests__/freshness.test.ts: a selection seam that throws keeps an entity-less file stale and out of unindexedFiles | `src/workflow/code-review/__tests__/freshness.test.ts` |

**unit: src/workflow/code-review/__tests__/freshness.test.ts: a file with entities whose watermark is at or after its mtime is not stale and not in unindexedFiles; the compute calls no write seam**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | src/workflow/code-review/__tests__/freshness.test.ts: a file with entities whose watermark is at or after its mtime is not stale and not in unindexedFiles; the compute calls no write seam | `src/workflow/code-review/__tests__/freshness.test.ts` |

**unit: src/workflow/code-review/__tests__/freshness.test.ts: the existing whole-result assertions are updated for the unindexedFiles field and still pass**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | src/workflow/code-review/__tests__/freshness.test.ts: the existing whole-result assertions are updated for the unindexedFiles field and still pass | `src/workflow/code-review/__tests__/freshness.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `src/workflow/code-review/__tests__/freshness.test.ts` | 0 | 18 | 0.4 s |  |

## t4

Run at 2026-10-27T08:22:45.585Z on commit `ae156482d`. Tests check: **passed**. 10 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**integration: src/daemon/__tests__/code-review-freshness-request.test.ts: the codeReview.freshness handler built by buildHandlerRuntime with a recording queue queues one 'file' job for each file in unindexedFiles, queues nothing for a second identical poll, and queues again after the file's mtime moves**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | src/daemon/__tests__/code-review-freshness-request.test.ts: the codeReview.freshness handler built by buildHandlerRuntime with a recording queue queues one 'file' job for each file in unindexedFiles, queues nothing for a second identical poll, and queues again after the file's mtime moves | `src/daemon/__tests__/code-review-freshness-request.test.ts` |

**integration: src/daemon/__tests__/code-review-freshness-request.test.ts: after queueing, the same reply carries isProcessing, inFlight and pendingCodeIndexJobs read from the queue after the jobs were queued**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | src/daemon/__tests__/code-review-freshness-request.test.ts: after queueing, the same reply carries isProcessing, inFlight and pendingCodeIndexJobs read from the queue after the jobs were queued | `src/daemon/__tests__/code-review-freshness-request.test.ts` |

**integration: src/daemon/__tests__/code-review-freshness-request.test.ts: realFreshnessGraphDeps().selection, with the indexer's parsers registered, returns 'not-code' for a .png file and package-lock.json, 'excluded-by-ignore' for a .ts file under node_modules, and 'selected' for a .ts file and a small .md file in a real temporary directory**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | src/daemon/__tests__/code-review-freshness-request.test.ts: realFreshnessGraphDeps().selection, with the indexer's parsers registered, returns 'not-code' for a .png file and package-lock.json, 'excluded-by-ignore' for a .ts file under node_modules, and 'selected' for a .ts file and a small .md file in a real temporary directory | `src/daemon/__tests__/code-review-freshness-request.test.ts` |

**integration: src/daemon/__tests__/code-review-freshness-request.test.ts: through the real seams, a changed .ts path that does not exist is not stale and queues nothing, while an existing entity-less .ts file is stale and queued once**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | src/daemon/__tests__/code-review-freshness-request.test.ts: through the real seams, a changed .ts path that does not exist is not stale and queues nothing, while an existing entity-less .ts file is stale and queued once | `src/daemon/__tests__/code-review-freshness-request.test.ts` |

**integration: src/daemon/__tests__/handler-runtime.test.ts: the recorded handler key sets are unchanged because no method is added**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | src/daemon/__tests__/handler-runtime.test.ts: the recorded handler key sets are unchanged because no method is added | `src/daemon/__tests__/handler-runtime.test.ts` |

**integration: src/daemon/steps/code-review-step/__tests__/handler.test.ts: with proceed:true and a freshness that keeps reporting one stale file with an idle queue while other changed files have symbols, the wait ends at the freshness time-out in the degraded diff review (fallback reason freshness-timeout naming that file) and no full review runs**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | src/daemon/steps/code-review-step/__tests__/handler.test.ts: with proceed:true and a freshness that keeps reporting one stale file with an idle queue while other changed files have symbols, the wait ends at the freshness time-out in the degraded diff review (fallback reason freshness-timeout naming that file) and no full review runs | `src/daemon/steps/code-review-step/__tests__/handler.test.ts` |

**integration: src/daemon/steps/code-review-step/__tests__/routing.test.ts and long-review.test.ts, src/daemon/__tests__/code-review-rpc-fallback.test.ts and src/shared/__tests__/review-stream-freshness.test.ts pass unchanged**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | T10 daemon-authored code gets the judgements prompt as before, and the daemon is not asked | `src/daemon/steps/code-review-step/__tests__/routing.test.ts` |
| pass | a daemon code review reporting a call every minute runs past 30 minutes and writes its record; one quiet past the idle limit fails with the idle cause and writes none | `src/daemon/steps/code-review-step/__tests__/long-review.test.ts` |
| pass | codeReview.run with params.fallbackReason writes a record whose body.fallbackReason equals it, and refuses a malformed reason; without one the body has no fallbackReason | `src/daemon/__tests__/code-review-rpc-fallback.test.ts` |
| pass | freshnessFromReply keeps inFlight and pendingCodeIndexJobs from a current reply and maps an older reply to inFlight=isProcessing, pendingCodeIndexJobs=0 | `src/shared/__tests__/review-stream-freshness.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `src/daemon/__tests__/code-review-freshness-request.test.ts` | 0 | 4 | 0.9 s |  |
| `src/daemon/__tests__/code-review-rpc-fallback.test.ts` | 0 | 2 | 0.7 s |  |
| `src/daemon/__tests__/handler-runtime.test.ts` | 0 | 2 | 0.8 s |  |
| `src/daemon/steps/code-review-step/__tests__/handler.test.ts` | 0 | 32 | 0.8 s |  |
| `src/daemon/steps/code-review-step/__tests__/long-review.test.ts` | 0 | 1 | 0.7 s |  |
| `src/daemon/steps/code-review-step/__tests__/routing.test.ts` | 0 | 23 | 0.7 s |  |
| `src/shared/__tests__/review-stream-freshness.test.ts` | 0 | 1 | 0.4 s |  |

## t5

Run at 2026-10-27T08:35:14.860Z on commit `1b1565660`. Tests check: **passed**. 0 pass, 0 fail, 0 skipped, 0 not found; 1 reported by the builder and not run by the gate.

the gate ran no test: every named test of this Task was reported by the builder

**live: Reported by the builder, not run by the gate: with the rebuilt daemon running, create mkdir -p dir/sub with a small .ts file in it at once, then another file three seconds later, and see both indexed (codeReview.freshness reports them not stale) without a restart; then edit an already indexed file and see it fresh**

Reported by the builder, not run by the gate: **pass**. Evidence: docs/standalone/fix-code-review-freshness-gate-so-E20261027fa396bdf/S001/E2E-t5.md — freshness replies quoted for first.ts, second.ts (3 s later) and the edited base.ts.

## t6

Run at 2026-10-27T08:38:17.646Z on commit `a2066bf09`. Tests check: **passed**. 0 pass, 0 fail, 0 skipped, 0 not found; 1 reported by the builder and not run by the gate.

the gate ran no test: every named test of this Task was reported by the builder

**smoke: Reported by the builder: git status lists no probe file, config.json has logLevel info, and the daemon log has no debug lines after its latest start**

Reported by the builder, not run by the gate: **pass**. Evidence: docs/standalone/fix-code-review-freshness-gate-so-E20261027fa396bdf/S001/CLEANUP-t6.md
