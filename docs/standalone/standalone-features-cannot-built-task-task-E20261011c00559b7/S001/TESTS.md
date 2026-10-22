<!-- insrc:artifact TESTS-c00559b7e38bb6ce-s1 -->

# Tests: c00559b7e38bb6ce S001

What the build validation gate ran for each Task of this Story, and what each test case did. The gate runs the tests itself; a result here is never a builder's statement unless it says so. `not found` means no test of that title ran in that file.

**Totals:** 46 pass, 0 fail, 0 skipped, 0 not found; 1 reported by the builder and not run by the gate.

## t1

Run at 2026-10-11T13:52:39.338Z on commit `ac3831b3`. Tests check: **passed**. 11 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**unit: readEpicDefinitionCore head precedence, LLD fallback, standalone:true and tracker**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | c00559b7 — a DEF beats an ISSUE and an LLD, and reports headKind DEF with its tracker | `src/workflow/__tests__/lld-head.test.ts` |
| pass | c00559b7 — an ISSUE beats an LLD, keeps its own fields and carries its tracker | `src/workflow/__tests__/lld-head.test.ts` |
| pass | c00559b7 — a lone flagged LLD heads its work item, anchored on its epicCreatedAt | `src/workflow/__tests__/lld-head.test.ts` |
| pass | c00559b7 — a legacy UNFLAGGED lone LLD still heads its work item and reports standalone: true | `src/workflow/__tests__/lld-head.test.ts` |
| pass | c00559b7 — the lowest-ordinal Story's LLD wins, compared numerically | `src/workflow/__tests__/lld-head.test.ts` |
| pass | c00559b7 — a malformed lowest-ordinal LLD is no head: the result is {} | `src/workflow/__tests__/lld-head.test.ts` |
| pass | c00559b7 — no artifacts at all, or no artifacts dir, is still {} | `src/workflow/__tests__/lld-head.test.ts` |
| pass | c00559b7 — a non-object tracker is ignored rather than passed through | `src/workflow/__tests__/lld-head.test.ts` |

**integration: legacy unflagged LLD-only item: BUILD/TESTS placed under docs/standalone**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | c00559b7 — a legacy unflagged LLD-only item files its BUILD and TESTS records under docs/standalone, in the LLD's folder | `src/workflow/__tests__/lld-head.test.ts` |

**integration: finalizePlan writes PLAN.md into the anchor LLD's folder**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | c00559b7 — finalizePlan writes PLAN.md into the anchor LLD's folder | `src/workflow/__tests__/folder-identity-finalize.test.ts` |
| pass | c00559b7 — a PLAN for a legacy UNFLAGGED LLD-only item is still placed under docs/standalone | `src/workflow/__tests__/folder-identity-finalize.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `src/workflow/__tests__/folder-identity-finalize.test.ts` | 0 | 11 | 0.5 s |  |
| `src/workflow/__tests__/lld-head.test.ts` | 0 | 9 | 0.4 s |  |

## t2

Run at 2026-10-11T13:55:59.899Z on commit `198c1e24`. Tests check: **passed**. 19 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**unit: readEpicIdentity and listEpicHashes over DEF/ISSUE/LLD fixtures**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | c00559b7 — an LLD-only work item is enumerated and its identity comes from the LLD head | `src/workflow/__tests__/lld-head-resolve.test.ts` |
| pass | c00559b7 — a hash with an ISSUE and an LLD is headed by the ISSUE and enumerated once | `src/workflow/__tests__/lld-head-resolve.test.ts` |
| pass | c00559b7 — a DEF head keeps its tracker refs through the shared reader | `src/workflow/__tests__/lld-head-resolve.test.ts` |
| pass | c00559b7 — with no head at all a hash is not enumerated | `src/workflow/__tests__/lld-head-resolve.test.ts` |

**unit: resolveWorkflowRef reaches an LLD+PLAN-only task by scoped label and hierarchical id**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | c00559b7 — S001/t1 and s1/t1 scoped by epicHash, and the hierarchical id, all reach the standalone task | `src/workflow/__tests__/lld-head-resolve.test.ts` |
| pass | c00559b7 — a legacy UNFLAGGED standalone LLD is reached the same way | `src/workflow/__tests__/lld-head-resolve.test.ts` |
| pass | resolver — MUTATION (INVERTED at ISSUE-c00559b7): delete the ISSUE and the LLD heads the work item; delete the LLD too and the target goes back to null | `src/workflow/__tests__/id-resolve.test.ts` |

**unit: unscoped label tiering over a mixed DEF + ISSUE + LLD-only fixture**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | c00559b7 — unscoped s1/t1 over DEF + ISSUE + LLD-only resolves to the DEF epic, exactly as before | `src/workflow/__tests__/lld-head-resolve.test.ts` |
| pass | c00559b7 — the bugfix's implied S001 still outranks an LLD-only item that built S001 | `src/workflow/__tests__/lld-head-resolve.test.ts` |
| pass | c00559b7 — with only LLD-only items, a single one resolves unscoped and two refuse as ambiguous | `src/workflow/__tests__/lld-head-resolve.test.ts` |

**integration: insrc_build_step implement + validate admit t1 of a standalone plan**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | c00559b7 — implement + validate admit t1 of a standalone LLD+PLAN (was unresolved-target) | `src/mcp/build-step/__tests__/build-step.test.ts` |

**integration: workflowIdForIssue unchanged for a DEF epic with a tracker block**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | c00559b7 — workflowIdForIssue for a DEF epic with a tracker block is unchanged beside an LLD-only item | `src/workflow/__tests__/lld-head-resolve.test.ts` |
| pass | resolver — both-way helpers | `src/workflow/__tests__/id-resolve.test.ts` |

**integration: existing id-resolve, folder-identity, storage and migrate-docs-tree suites pass**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | resolver — #9, s1/t3, canonical + slug all resolve to the same task record | `src/workflow/__tests__/id-resolve.test.ts` |
| pass | t4 — GENUINE ambiguity still refuses: two feature epics that BOTH contain s1, unscoped → null | `src/workflow/__tests__/id-resolve.test.ts` |
| pass | t7 REGRESSION GUARD: a DEF-bearing epic chain composes byte-identical paths to the pre-change baseline | `src/workflow/__tests__/folder-identity-regression.test.ts` |
| pass | 3a98d279 — a PLAN whose LLD carries a DIFFERENT label still takes the definition head's | `src/workflow/__tests__/folder-identity-finalize.test.ts` |
| pass | t1 — a DEF present and readable wins outright; the ISSUE is never consulted | `src/workflow/__tests__/storage.test.ts` |
| pass | planMigration: every member of the epic resolves to ONE folder; story artifacts under S<nnn>/; DEF-anchored (no split) | `src/workflow/__tests__/migrate-docs-tree.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `src/mcp/build-step/__tests__/build-step.test.ts` | 0 | 62 | 4.8 s |  |
| `src/workflow/__tests__/folder-identity-finalize.test.ts` | 0 | 11 | 0.5 s |  |
| `src/workflow/__tests__/folder-identity-regression.test.ts` | 0 | 11 | 0.3 s |  |
| `src/workflow/__tests__/id-resolve.test.ts` | 0 | 52 | 0.3 s |  |
| `src/workflow/__tests__/lld-head-resolve.test.ts` | 0 | 10 | 0.3 s |  |
| `src/workflow/__tests__/migrate-docs-tree.test.ts` | 0 | 27 | 1.1 s |  |
| `src/workflow/__tests__/storage.test.ts` | 0 | 44 | 0.3 s |  |

## t3

Run at 2026-10-11T13:58:47.319Z on commit `3b330fb1`. Tests check: **passed**. 7 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**unit: head naming from title with focus fallback (SPEC, DEF, ISSUE, standalone LLD)**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | c00559b7 — headLabel derives from the title, and falls back to the focus for an absent, blank or degenerate title | `src/workflow/__tests__/head-naming.test.ts` |
| pass | c00559b7 — a SPEC with a title is labelled from it; without one, from its focus as before | `src/workflow/__tests__/head-naming.test.ts` |
| pass | c00559b7 — a DEF with a title is labelled from it; without one, from its focus as before | `src/workflow/__tests__/head-naming.test.ts` |
| pass | c00559b7 — an ISSUE is labelled from its defect title, falling back to the focus for a degenerate one | `src/workflow/__tests__/head-naming.test.ts` |
| pass | c00559b7 — a body title that is not a string is rejected as a schema failure | `src/workflow/__tests__/head-naming.test.ts` |
| pass | c00559b7 — a first-time standalone LLD is labelled from storyTitle; a re-finalized one keeps its LLD head's label | `src/workflow/__tests__/head-naming.test.ts` |

**integration: regression guard: standalone design.story with specHash stamps seededFromSpec and renders the Seeded-from line**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | ac4/provenance: a spec-seeded standalone LLD stamps meta.seededFromSpec + renders the Seeded-from line | `src/workflow/__tests__/seed-focus.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `src/workflow/__tests__/head-naming.test.ts` | 0 | 6 | 0.5 s |  |
| `src/workflow/__tests__/seed-focus.test.ts` | 0 | 11 | 0.5 s |  |

## t4

Run at 2026-10-11T14:00:52.621Z on commit `04d7571e`. Tests check: **passed**. 6 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**unit: triage start validates specHash and classify forwards it into the nextCall**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | c00559b7 — start with an approved specHash forwards it into the design.story nextCall | `src/mcp/triage-step/__tests__/handler.test.ts` |
| pass | c00559b7 — an epic routed with an approved specHash forwards it into the define call | `src/mcp/triage-step/__tests__/handler.test.ts` |
| pass | c00559b7 — start with an UNAPPROVED spec errors and hands back no state | `src/mcp/triage-step/__tests__/handler.test.ts` |
| pass | c00559b7 — start with a MISSING spec errors and hands back no state | `src/mcp/triage-step/__tests__/handler.test.ts` |
| pass | c00559b7 — without a specHash the nextCall is unchanged (no specHash key anywhere) | `src/mcp/triage-step/__tests__/handler.test.ts` |

**unit: triage state round-trips specHash**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | c00559b7 — the triage state token round-trips specHash, and omits it when absent | `src/mcp/triage-step/__tests__/handler.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `src/mcp/triage-step/__tests__/handler.test.ts` | 0 | 17 | 0.5 s |  |

## t5

Run at 2026-10-11T14:02:44.063Z on commit `36a3b7f1`. Tests check: **passed**. 3 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**unit: planMigration consolidates an anchorless split item into the LLD folder**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | c00559b7 — planMigration consolidates an anchorless split item's PLAN/BUILD/CR/TESTS into its LLD's folder | `src/workflow/__tests__/migrate-docs-tree.test.ts` |
| pass | c00559b7 — the head LLD's label wins over a downstream member's own; a DEF or ISSUE still outranks any LLD | `src/workflow/__tests__/migrate-docs-tree.test.ts` |

**unit: planMigration groups an unflagged LLD-headed item as standalone**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | c00559b7 — planMigration groups an unflagged LLD-headed item as standalone | `src/workflow/__tests__/migrate-docs-tree.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `src/workflow/__tests__/migrate-docs-tree.test.ts` | 0 | 30 | 1.1 s |  |

## t6

Run at 2026-10-11T14:22:50.855Z on commit `0d865df2`. Tests check: **passed**. 0 pass, 0 fail, 0 skipped, 0 not found; 1 reported by the builder and not run by the gate.

the gate ran no test: every named test of this Task was reported by the builder

**smoke: planMigration dry run over this repo lists d9f85b3c's consolidation with no unmappable standalone entries**

Reported by the builder, not run by the gate: **pass**. Evidence: Dry run (/tmp/mig-dry/dry.ts) before apply: 'moves: 2 linkRewrites: 1 unmappable: 0', including PLAN docs/standalone/decompose-approved-lld-d9f85b3cc8cc966b-s001-shared-E20261011d9f85b3c/S001/PLAN.md -> docs/standalone/implement-approved-spec-77932eaa1a85819b-docs-standalone-E20261011d9f85b3c/S001/PLAN.md; shown to the user and approved in chat. Applied as commits 1b2284fc and 0d865df2; a re-run dry plan reports 'moves: 0 linkRewrites: 0 unmappable: 0'.
