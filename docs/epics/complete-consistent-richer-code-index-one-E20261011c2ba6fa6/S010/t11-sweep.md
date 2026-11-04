# S010 t11 — full test sweep (2026-11-04)

Node 22.22.1. Backend: `npx tsx --test --test-force-exit --test-timeout=180000 'src/**/__tests__/*.test.ts' 'jetbrains-plugin/__tests__/*.test.ts'` at c7140757c.
VS Code plugin: `npx tsx --test --test-force-exit --test-timeout=180000 'src/**/__tests__/*.test.ts'` (default node), after the fixes below.

## Results

- Backend: 7413 tests, 7195 pass, 62 fail, 18 cancelled.
- VS Code plugin: 1582 tests, 1567 pass, 7 fail.

## Failures caused by this Story (fixed)

| File | Cause | Fix |
|---|---|---|
| `src/db/__tests__/doc-relations-store.test.ts` | t1's carry test predates t6, whose full index restores the carry itself | fba6d3255: the test checks the delete step directly, then the full index's restore (mutation-checked: carry off, restore off both fail) |
| `src/daemon/__tests__/handler-runtime.test.ts` | the recorded RPC key set lacked t5's `search.doc_relations` and `docRelations.measure` | fba6d3255 |
| `src/analyze/orchestrator/__tests__/run-order.test.ts` | its cached bundle had no `docRelationsRevision`; t9 treats an unstamped bundle as stale | 55a1a3e3f: the seeded bundle is stamped |
| `src/daemon/threads/__tests__/indexing-worker.test.ts` | the indexing-class list lacked `docRelations.measure` | 55a1a3e3f: called with a bad repoPath, its own validation answers |
| `vscode-plugin/src/panels/__tests__/repo-config.test.ts` | role counts predate t4's peripheral role `indexer.docRelations` | cde206951: 21 peripheral / 35 roles |

## Every other failure: re-run alone at HEAD and at the pre-s10 commit e62b581d1

Each file was run on its own (3 at a time) at HEAD, then on a detached worktree at e62b581d1, the parent of the first s10 commit.

| File | HEAD (alone) | pre-s10 (alone) |
|---|---|---|
| `jetbrains-plugin/__tests__/b220-s5-gradle.test.ts` | pass=0 fail=0 cancelled=1 | pass=4 fail=1 cancelled=0 |
| `jetbrains-plugin/__tests__/s10-gradle.test.ts` | pass=0 fail=1 cancelled=0 | — |
| `jetbrains-plugin/__tests__/s7-gradle.test.ts` | pass=0 fail=0 cancelled=1 | pass=10 fail=1 cancelled=0 |
| `src/analyze/orchestrator/__tests__/run-order.test.ts` | pass=5 fail=1 cancelled=0 | pass=6 fail=0 cancelled=0 |
| `src/daemon/__tests__/doc-summary-restore-ipc.test.ts` | pass=0 fail=2 cancelled=0 | pass=1 fail=0 cancelled=0 |
| `src/daemon/__tests__/models-daemon-s3.test.ts` | pass=0 fail=2 cancelled=0 | pass=0 fail=2 cancelled=0 |
| `src/daemon/__tests__/repo-completeness.test.ts` | pass=0 fail=1 cancelled=0 | pass=0 fail=1 cancelled=0 |
| `src/daemon/__tests__/search-filter.test.ts` | pass=0 fail=3 cancelled=0 | pass=0 fail=1 cancelled=1 |
| `src/daemon/__tests__/search-guard.test.ts` | pass=0 fail=3 cancelled=0 | pass=0 fail=1 cancelled=1 |
| `src/daemon/__tests__/search-request-contract.test.ts` | pass=0 fail=1 cancelled=0 | pass=0 fail=1 cancelled=0 |
| `src/daemon/db/__tests__/driver-log-policy.test.ts` | pass=2 fail=1 cancelled=0 | pass=2 fail=1 cancelled=0 |
| `src/daemon/db/__tests__/duckdb-file-driver.test.ts` | pass=21 fail=1 cancelled=0 | pass=21 fail=1 cancelled=0 |
| `src/daemon/db/__tests__/session-release-gate.test.ts` | pass=2 fail=1 cancelled=0 | pass=0 fail=3 cancelled=0 |
| `src/daemon/db/__tests__/session-service-isolation.test.ts` | pass=1 fail=1 cancelled=0 | pass=0 fail=2 cancelled=0 |
| `src/daemon/db/__tests__/session-source-inventory.test.ts` | pass=2 fail=1 cancelled=0 | pass=1 fail=2 cancelled=0 |
| `src/daemon/threads/__tests__/indexing-worker.test.ts` | pass=3 fail=1 cancelled=0 | pass=4 fail=0 cancelled=0 |
| `src/daemon/threads/__tests__/s4-acceptance.test.ts` | pass=3 fail=2 cancelled=0 | pass=3 fail=2 cancelled=0 |
| `src/daemon/threads/__tests__/threads-boot.test.ts` | pass=3 fail=2 cancelled=0 | pass=3 fail=2 cancelled=0 |
| `src/daemon/tools/builtins/file/__tests__/live-store-file-refusal.test.ts` | pass=1 fail=1 cancelled=0 | pass=1 fail=1 cancelled=0 |
| `src/mcp/__tests__/import-graph.test.ts` | pass=0 fail=1 cancelled=0 | pass=0 fail=1 cancelled=0 |
| `src/mcp/__tests__/present-steering.test.ts` | pass=0 fail=1 cancelled=0 | pass=0 fail=1 cancelled=0 |
| `src/shared/__tests__/connection-manager-kotlin-render.test.ts` | pass=0 fail=1 cancelled=0 | pass=0 fail=1 cancelled=0 |
| `src/shared/__tests__/connection-manager-kotlin-test.test.ts` | pass=0 fail=1 cancelled=0 | pass=0 fail=1 cancelled=0 |
| `src/shared/__tests__/connection-manager-release.test.ts` | pass=1 fail=1 cancelled=0 | pass=1 fail=1 cancelled=0 |

Notes:
- Every backend file that fails at HEAD also fails at the pre-s10 commit, except the four fixed above and `doc-summary-restore-ipc.test.ts`. That file passed once at pre-s10, then failed there on a second run the same way it fails at HEAD. Seeded test daemons stall before the socket opens; the boot log is identical on both sides except for the s10 pass's own log line. This is the known boot stall in this environment (connection-management Keychain read).
- `jetbrains-plugin/__tests__/s10-gradle.test.ts` failed in the sweep and in the 3-at-a-time re-run only while other Gradle bridges were running at the same time. Alone it passes (it also passed the t10 gate).
- The other files under test — search-filter, search-guard, search-request-contract and repo-completeness — fail at HEAD with the same seeded-daemon boot stall. At pre-s10 they also fail, with the stall or with their own pre-existing assertions.
- VS Code: `session-lock.test.ts` and `vscode-bundle-catalog.test.ts` failed during the sweep while another session's uncommitted chat edits were in the tree. Both pass when re-run at HEAD. `privacy.test.ts` and `activation.test.ts` fail at pre-s10 too. The detail-renderers source-scan failure (`repoRegisterProviders`) is pre-existing.

## Second full sweep, after the fixes (2026-11-05)

Backend: `npx tsx --test --test-force-exit --test-timeout=180000 'src/**/__tests__/*.test.ts'` at d7b8baa11 (all s10 fixes in). The Gradle bridges were run one at a time afterwards (below), because they fail when run concurrently.

- 7384 tests, 7174 pass, 60 fail, 12 cancelled.
- All four files this Story broke pass in it: `doc-relations-store`, `handler-runtime`, `run-order` and `indexing-worker`.
- Every failing file is either one the first sweep already showed to fail without s10 (table above), or one of these 12, each re-run alone:

| File | Alone at HEAD | At pre-s10 e62b581d1 | Cause |
|---|---|---|---|
| `src/daemon/db/__tests__/saved-management.test.ts` | pass 16 | — | load only |
| `src/daemon/db/__tests__/credential-generations.test.ts` | pass 10 | — | load only |
| `src/daemon/db/__tests__/session-file-matrix.test.ts` | pass 2 | — | load only |
| `src/daemon/db/__tests__/session-file-resources.test.ts` | pass 2 | — | load only |
| `src/daemon/steps/__tests__/root-run-memory.test.ts` | pass 1 | — | load only |
| `src/daemon/steps/__tests__/task-persistence.test.ts` | pass 1 | — | load only |
| `src/workflow/review-pipeline/__tests__/code-review-material.test.ts` | pass 11 | — | load only |
| `src/workflow/__tests__/build-review-freshness.test.ts` | pass 9 | — | load only |
| `src/daemon/db/__tests__/clickhouse-live-probe.test.ts` | fail 1 | fail 1 | needs Docker (OrbStack socket absent) |
| `src/daemon/steps/__tests__/rpc-diagnostics.test.ts` | fail 1 | fail 1 | pre-existing |
| `src/shared/__tests__/project-memory-platform-evidence.test.ts` | fail 1 | pass 1 | pins sha256 of `packages/project-memory` sources changed by Epic 17123b6d after e62b581d1 (`store-self-review.test.ts`); no s10 file pinned |
| `src/shared/__tests__/project-memory-resource-evidence.test.ts` | fail 1 | pass 1 | same: the expected file list names `packages/project-memory` sources (`src/store/lance-store.ts`, `plan.ts`, `reads.ts`) changed by Epic 17123b6d |

### Gradle bridges, one at a time (2026-11-05)

| File | Result |
|---|---|
| `jetbrains-plugin/__tests__/b220-s5-gradle.test.ts` | pass 5, fail 0 |
| `jetbrains-plugin/__tests__/s10-gradle.test.ts` | pass 1, fail 0 |
| `jetbrains-plugin/__tests__/s7-gradle.test.ts` | pass 11, fail 0 |

Their failures in both sweeps came from running at the same time: concurrent Gradle builds on one project directory. `s10-gradle` is new in this Story, so there is no pre-s10 run of it; it passes alone, and it passed the t10 gate.
