<!-- insrc:artifact TESTS-7d42b5dceb62afec-S001 -->

# Tests: 7d42b5dceb62afec S001

What the build validation gate ran for each Task of this Story, and what each test case did. The gate runs the tests itself; a result here is never a builder's statement unless it says so. `not found` means no test of that title ran in that file.

**Totals:** 14 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

## t1

Run at 2026-11-03T14:39:01.676Z on commit `f8e36664f`. Tests check: **passed**. 3 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**integration: S001 t1: every change site records its source file in the same transaction, and a non-grouping kind records nothing**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | S001 t1: every change site records its source file in the same transaction, and a non-grouping kind records nothing | `src/db/__tests__/subsystem-changes.test.ts` |

**integration: S001 t1: entity-row removal records its file on every path, and a whole-repository delete drops the contributions and bumps the reset counter**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | S001 t1: entity-row removal records its file on every path, and a whole-repository delete drops the contributions and bumps the reset counter | `src/db/__tests__/subsystem-changes.test.ts` |

**integration: S001 t1: a record entry is consumed only while its stamp is unchanged**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | S001 t1: a record entry is consumed only while its stamp is unchanged | `src/db/__tests__/subsystem-changes.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `src/db/__tests__/subsystem-changes.test.ts` | 0 | 3 | 1.3 s |  |

## t2

Run at 2026-11-03T14:55:18.938Z on commit `577df4ff8`. Tests check: **passed**. 3 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**integration: S001 t2: after each edit in the sequence the incremental pass stores what a forced full pass stores, and a comment-only edit is unchanged with one file read**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | S001 t2: after each edit in the sequence the incremental pass stores what a forced full pass stores, and a comment-only edit is unchanged with one file read | `src/indexer/__tests__/subsystem-incremental.test.ts` |

**integration: S001 t2: an unchanged importer stays correct while its target gains, loses and regains code entities**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | S001 t2: an unchanged importer stays correct while its target gains, loses and regains code entities | `src/indexer/__tests__/subsystem-incremental.test.ts` |

**integration: S001 t2: the first pass in a process and the first after a full index are full, including after an isolated file vanished without a watcher event**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | S001 t2: the first pass in a process and the first after a full index are full, including after an isolated file vanished without a watcher event | `src/indexer/__tests__/subsystem-incremental.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `src/indexer/__tests__/subsystem-incremental.test.ts` | 0 | 3 | 2.4 s |  |

## t3

Run at 2026-11-03T15:00:39.422Z on commit `1467e753a`. Tests check: **passed**. 3 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**integration: S001 t3: a fault in the publication transaction changes nothing, and the next pass converges**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | S001 t3: a fault in the publication transaction changes nothing, and the next pass converges | `src/indexer/__tests__/subsystem-publication.test.ts` |

**integration: S001 t3: an edge written while the pass runs keeps its record entry**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | S001 t3: an edge written while the pass runs keeps its record entry | `src/indexer/__tests__/subsystem-publication.test.ts` |

**integration: S001 t3: a pass held across a full index publishes nothing, and the next full pass drops the deleted file**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | S001 t3: a pass held across a full index publishes nothing, and the next full pass drops the deleted file | `src/indexer/__tests__/subsystem-publication.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `src/indexer/__tests__/subsystem-publication.test.ts` | 0 | 3 | 2.3 s |  |

## t4

Run at 2026-11-03T15:31:50.313Z on commit `8f06acfa0`. Tests check: **passed**. 5 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**integration: S001 t4: across the worker link, passes are paced by their actual starts, even when the lane or a held hand-over delays a start**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | S001 t4: across the worker link, passes are paced by their actual starts, even when the lane or a held hand-over delays a start | `src/indexer/__tests__/subsystem-scheduling.test.ts` |

**integration: S001 t4: failed summaries re-queue on the bounded back-off at the queue owner, a clean pass resets it, and a rejected job is retried**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | S001 t4: failed summaries re-queue on the bounded back-off at the queue owner, a clean pass resets it, and a rejected job is retried | `src/indexer/__tests__/subsystem-scheduling.test.ts` |

**integration: S001 t4: after an outage a retry writes the summaries, one call at a time after code work**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | S001 t4: after an outage a retry writes the summaries, one call at a time after code work | `src/indexer/__tests__/subsystem-scheduling.test.ts` |

**integration: S001 t4: dispose clears the timers on both stop paths, and a timer firing while stopping queues nothing**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | S001 t4: dispose clears the timers on both stop paths, and a timer firing while stopping queues nothing | `src/indexer/__tests__/subsystem-scheduling.test.ts` |
| pass | S001 t4: a timer that fires while the queue is stopping queues nothing | `src/indexer/__tests__/subsystem-scheduling.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `src/indexer/__tests__/subsystem-scheduling.test.ts` | 0 | 5 | 6.1 s |  |
