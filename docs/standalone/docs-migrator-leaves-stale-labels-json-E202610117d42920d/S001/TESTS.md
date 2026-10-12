<!-- insrc:artifact TESTS-7d42920dbef28b51-S001 -->

# Tests: 7d42920dbef28b51 S001

What the build validation gate ran for each Task of this Story, and what each test case did. The gate runs the tests itself; a result here is never a builder's statement unless it says so. `not found` means no test of that title ran in that file.

**Totals:** 22 pass, 0 fail, 0 skipped, 0 not found; 1 reported by the builder and not run by the gate.

## t1

Run at 2026-10-11T18:07:28.997Z on commit `d0dfe573`. Tests check: **passed**. 2 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**unit: t1: MigrationPlan from planMigration carries metaRewrites (empty for a repo with no artifacts)**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | t1 — a repo with no artifact store plans an empty metaRewrites list | `src/workflow/__tests__/migrate-docs-meta-rewrite.test.ts` |

**unit: t1: epicShortName / hldShortName exported: slug when set, else first sentence / first line**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | t1 — epicShortName and hldShortName: the slug when set, else the first sentence / first line | `src/workflow/__tests__/migrate-docs-meta-rewrite.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `src/workflow/__tests__/migrate-docs-meta-rewrite.test.ts` | 0 | 2 | 0.4 s |  |

## t2

Run at 2026-10-11T18:09:41.926Z on commit `16068b12`. Tests check: **passed**. 7 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**unit: planMigration: a moved PLAN whose stored epicSlug and anchor differ from its LLD head gets one metaRewrite setting both**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | t2 — a moved PLAN whose stored label and anchor differ from its LLD head gets one rewrite setting both | `src/workflow/__tests__/migrate-docs-meta-rewrite.test.ts` |

**unit: planMigration: an already-placed member with stale metadata (no move) still gets a metaRewrite**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | t2 — an already-placed member with stale metadata (no move) still gets a rewrite | `src/workflow/__tests__/migrate-docs-meta-rewrite.test.ts` |

**unit: planMigration: a hash-fallback group gets no epicSlug rewrite; anchor/standalone rewrites still planned**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | t2 — a hash-fallback group gets no label rewrite; anchor and standalone rewrites are still planned | `src/workflow/__tests__/migrate-docs-meta-rewrite.test.ts` |

**unit: planMigration: a legacy unflagged head LLD in a standalone group gets only standalone: true; false is never planned**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | t2 — a legacy unflagged head LLD in a standalone group gets only standalone: true; false is never planned | `src/workflow/__tests__/migrate-docs-meta-rewrite.test.ts` |

**unit: planMigration: a SPEC with no stored standalone flag in a standalone group gets standalone: true**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | t2 — a SPEC with no stored standalone flag in a standalone group gets standalone: true | `src/workflow/__tests__/migrate-docs-meta-rewrite.test.ts` |

**unit: planMigration: a same-day unstamped BUILD plans no anchor rewrite; a later-day unstamped BUILD plans epicCreatedAt = group anchor**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | t2 — a same-day unstamped BUILD plans no anchor rewrite; a later-day unstamped BUILD plans epicCreatedAt = group anchor | `src/workflow/__tests__/migrate-docs-meta-rewrite.test.ts` |

**unit: planMigration: a consistent repo plans metaRewrites: [] and docs + .insrc stay byte-identical after planning**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | t2 — a consistent repo plans no metaRewrites, and planning leaves docs and .insrc byte-identical | `src/workflow/__tests__/migrate-docs-meta-rewrite.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `src/workflow/__tests__/migrate-docs-meta-rewrite.test.ts` | 0 | 9 | 0.4 s |  |

## t3

Run at 2026-10-11T18:12:15.731Z on commit `6c068e9f`. Tests check: **passed**. 3 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**unit: planMigration: PLAN/LLD get the '**Epic:**' md edit at the post-move path (including an old '`undefined`' line)**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | t3 — PLAN and LLD get the '**Epic:**' edit at the post-move path, including an old '`undefined`' line | `src/workflow/__tests__/migrate-docs-meta-rewrite.test.ts` |

**unit: planMigration: BUILD/CR/TESTS get JSON-only rewrites; EXT gets its two title-line edits; DEF and HLD get their H1 edit (slug-less DEF first-sentence H1 -> slug H1)**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | t3 — BUILD/CR/TESTS get JSON-only rewrites; EXT gets its two title-line edits; DEF and HLD get their H1 edit | `src/workflow/__tests__/migrate-docs-meta-rewrite.test.ts` |

**unit: planMigration: a relabelled HLD with a companion page plans no edit to the page and lists it in companionNotes**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | t3 — a relabelled HLD with a companion page plans no edit to the page and lists it in companionNotes | `src/workflow/__tests__/migrate-docs-meta-rewrite.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `src/workflow/__tests__/migrate-docs-meta-rewrite.test.ts` | 0 | 12 | 0.4 s |  |

## t4

Run at 2026-10-11T18:16:21.027Z on commit `b4e7c227`. Tests check: **passed**. 9 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**integration: applyMigration: after apply, deriveMdPath on every member's stored meta equals where its md sits, and PLAN.md shows the head label**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | t4 — after apply, deriveMdPath on every member's stored meta is where its md sits, and PLAN.md shows the head label | `src/workflow/__tests__/migrate-docs-meta-rewrite.test.ts` |

**integration: applyMigration: only the planned meta fields change; a consistent member JSON is byte-identical**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | t4 — only the planned meta fields change; a consistent member's JSON is byte-identical | `src/workflow/__tests__/migrate-docs-meta-rewrite.test.ts` |
| pass | applyMigration: git mv relocates each md (history followed), no flat md remains, a consistent member's JSON byte-identical | `src/workflow/__tests__/migrate-docs-tree.test.ts` |

**integration: applyMigration: a group's moves, JSON rewrites and md edits land in one commit; a rewrite-only group gets its own realign commit**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | t4 — a group's moves, JSON rewrites and md edits land in one commit; a rewrite-only group gets its own realign commit | `src/workflow/__tests__/migrate-docs-meta-rewrite.test.ts` |

**integration: applyMigration: a rewrite-only plan still applies (no early return)**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | t4 — a plan with rewrites but no moves still applies | `src/workflow/__tests__/migrate-docs-meta-rewrite.test.ts` |

**integration: applyMigration: a committed missing label line / corrupt JSON rolls the whole two-group run back to the start commit with the rewrite-step error**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | t4 — a label line broken and committed after planning rolls the whole two-group run back to the start commit | `src/workflow/__tests__/migrate-docs-meta-rewrite.test.ts` |
| pass | t4 — a JSON broken and committed after planning rolls the whole two-group run back to the start commit | `src/workflow/__tests__/migrate-docs-meta-rewrite.test.ts` |

**integration: applyMigration: a second plan after apply has no moves and no metaRewrites**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | t4 — a second plan after apply has no moves and no metaRewrites | `src/workflow/__tests__/migrate-docs-meta-rewrite.test.ts` |

**integration: applyMigration: a SPEC realigned to standalone resolves under docs/standalone via deriveMdPath**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | t4 — a SPEC realigned to standalone resolves under docs/standalone via deriveMdPath | `src/workflow/__tests__/migrate-docs-meta-rewrite.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `src/workflow/__tests__/migrate-docs-meta-rewrite.test.ts` | 0 | 21 | 0.8 s |  |
| `src/workflow/__tests__/migrate-docs-tree.test.ts` | 0 | 30 | 1.2 s |  |

## t5

Run at 2026-10-11T18:17:56.606Z on commit `62b68e5f`. Tests check: **passed**. 1 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**integration: CLI insrc-migrate-docs dry run prints one line per metadata rewrite, its md edits and companion notes, and mutates nothing**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | t5 — the insrc-migrate-docs dry run prints each metadata rewrite, its md edits and companion notes, and mutates nothing | `src/workflow/__tests__/migrate-docs-meta-rewrite.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `src/workflow/__tests__/migrate-docs-meta-rewrite.test.ts` | 0 | 22 | 1.1 s |  |

## t6

Run at 2026-10-11T18:19:06.269Z on commit `141cfc52`. Tests check: **passed**. 0 pass, 0 fail, 0 skipped, 0 not found; 1 reported by the builder and not run by the gate.

the gate ran no test: every named test of this Task was reported by the builder

**smoke: t6: dry run of insrc-migrate-docs over this repo shown to the user before any apply**

Reported by the builder, not run by the gate: **pass**. Evidence: /tmp/migcheck/dry-run.txt (full dry-run output); /tmp/migcheck/check.ts run on scratch clone /tmp/mig-scratch: before {ok:500,bad:448}, after apply {ok:948,bad:0}; re-plan: 0 moves, 0 metadata rewrites
