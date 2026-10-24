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
