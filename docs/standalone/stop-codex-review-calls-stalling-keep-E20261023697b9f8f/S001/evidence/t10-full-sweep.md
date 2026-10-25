# t10 full test sweep

Run 2026-10-24 on main at 18d2672b2 (all of t1-t9 committed), with `npx tsx --test --test-force-exit --test-timeout=300000 'src/**/__tests__/*.test.ts'` under Node 22.

| tests | pass | fail | cancelled | skipped | todo |
|---|---|---|---|---|---|
| 6358 | 6210 | 8 | 6 | 131 | 3 |

None of the failures comes from this Story's code:

| Failing tests | File | Cause |
|---|---|---|
| 3 plan-task completeness tests | src/analyze/runtimes/__tests__/completeness-all-runtimes.test.ts | The other session's data-connections Story (484fcef7 s1), whose uncommitted edits to src/analyze/runtimes/data and src/daemon/db were in the tree the sweep ran against. |
| CM-S1-M lease tests (1 failed, 5 cancelled) | src/daemon/db/__tests__/connection-leases.test.ts | The same in-progress Story. |
| CM-S1-L | src/daemon/db/__tests__/driver-field-audit.test.ts | The same in-progress Story. |
| CM-S1-D | src/daemon/db/__tests__/saved-management.test.ts | The same in-progress Story. |
| search.query while one repository is being indexed | src/daemon/__tests__/search-filter.test.ts | A 180 s timeout under the sweep's load; it passes when run on its own. |
| entity.closure / entity.unreachable under index | src/daemon/__tests__/search-guard.test.ts | A 180 s timeout under the sweep's load; it passes when run on its own. |
| SIGTERM during an indexing pass | src/daemon/threads/__tests__/threads-boot.test.ts | Already failing before this Story: it fails the same way on a worktree at 0d6a5a2d, before t5. The indexing worker does not drain within the 20 s hard-exit backstop while it embeds through Ollama. |

Every suite this Story touches passes: review, review-pipeline, cli-provider, build-step, step-host, review-step and workflow-review-rpc.

## Comparison sweeps in clean worktrees (2026-10-24, after the rollout)

The attribution above relied on the other session's uncommitted edits and on
load. To settle it, the full sweep was rerun in clean worktrees (no uncommitted
work), one after the other:

| Revision | tests | pass | fail | cancelled | Failing tests |
|---|---|---|---|---|---|
| b5394349 (this Story's base) | 6,343 | 6,198 | 3 | 6 | search-filter "search.query while one repository is being indexed …", search-guard "entity.closure / entity.unreachable … under index …", 6 x connection-leases CM-S1-M (cancelled), threads-boot "SIGTERM during an indexing pass …" |
| 18d2672b (all of t1-t9) | 6,338 | 6,190 | 6 | 6 | the same 9, plus 3 in completeness-all-runtimes ("a table test over every registered plan-task runtime …", "the fixture gives the inventories and listings something to return", "the object-listing plan task reads the data driver's cut flag into a limit") |

The 3 extra failures come from 905cdce5 ("feat(build): s1/t10 migrate analysis
consumers to safe resolver leases", Insrc-Story 484fcef7efaf229e/s1, the other
session's data-connections Story), which moved src/analyze/runtimes/data onto
resolver leases; the completeness fixture has no `safeList` / `withConnection`,
which is exactly the error those tests report. None of this Story's commits
(Insrc-Story 697b9f8ff46b9deb/S001, b5394349..18d2672b) touches
src/analyze/runtimes, src/daemon/db or any data runtime.

So every failure either fails at this Story's base or is introduced by another
Story's commit; this Story adds none.
