# Installer S1 full backend suite — 2026-11-24

Run: `e5027f2f-f897-4c7e-b23c-613cbf59d594`. Official Node 22.22.1; `npm test -- --concurrency=4`; live-service opt-in unset.

Selected 1,386 files: 380 successful file results, 15 failed files, one timeout, three interrupted files, and 987 not admitted. Successful file results can contain intentional live-service skips. The first file timeout stops admission and drains remaining owned actors. This is an incomplete failed run, not a full-suite pass.

Cleanup reports confirmedClosed=true, interrupted=false, with no cancellation/evidence errors. The active ownership record was released. No second full run was started.

The table records observed failure reasons, not confirmed root causes. No comparison run on the pre-S1 commit was performed; do not call these all baseline failures.

| File | Result | Observed reason |
| --- | --- | --- |
| `src/analyze/explore/__tests__/completeness-all-lookups.test.ts` | failed | Timed-out search expected gathered hits; actual failed output had no hits field. |
| `src/analyze/explore/__tests__/failed-lookups.test.ts` | failed | Expected EACCES wording; ripgrep reports Permission denied (os error 13). |
| `src/cli/__tests__/cli-services-sites.test.ts` | failed | Reads removed src/cli/services/maintenance.ts (ENOENT). |
| `src/cli/__tests__/maintenance-source.test.ts` | failed | Calls undefined updateFixture. |
| `src/cli/__tests__/s5-tests-typecheck.test.ts` | failed | Old test fixtures still declare removed scanOrphans, installedCommit and shutdown properties. |
| `src/cli/__tests__/settings-modal.test.ts` | failed | Services fixture typecheck finds removed scanOrphans / installedCommit fields. |
| `src/cli/services/__tests__/steering-refresh-through-daemon.test.ts` | failed | Imports removed cli/services/maintenance.js (ERR_MODULE_NOT_FOUND). |
| `src/config/__tests__/config-reconcile-smoke.test.ts` | failed | Calls undefined runUpdateReconcile. |
| `src/config/__tests__/retired-roles.test.ts` | failed | Declared tools.convertEscalate setting is outside the live role taxonomy. |
| `src/daemon/__tests__/build-commands-doc.test.ts` | failed | Documentation JSON-name allowlist rejects node-runtime-policy.json. |
| `src/daemon/__tests__/model-literal-scan.test.ts` | failed | Literal scanner flags ollama in indexer/doc-relations-provider.ts and installer/schemas.ts. The installer schema is part of S1; investigate scanner intent before changing or exempting it. |
| `src/daemon/__tests__/repo-completeness.test.ts` | failed | Expected complete repository; actual report has four entities without vectors. |
| `src/daemon/__tests__/search-guard.test.ts` | failed | Both indexing guards waited 180 seconds without observing the seeded full index running. |
| `src/daemon/__tests__/search-request-contract.test.ts` | failed | Expected semantic parent s1; semantic result was empty. |
| `src/daemon/__tests__/understanding-rpc.test.ts` | failed | Healthy shutdown test calls undefined createShutdown. |
| `src/analyze/context/__tests__/pipeline-outcome.test.ts` | timeout | File exceeded the 600-second budget without final coverage. Root cause not established; last logs concern pipeline measurement. |
| `src/analyze/orchestrator/__tests__/orchestrator.test.ts` | interrupted | Interrupted by coordinator after pipeline-outcome timeout; not an independent failure. Last completed case: failed-record resume guard. |
| `src/daemon/__tests__/search-filter.test.ts` | interrupted | Interrupted by coordinator after pipeline-outcome timeout; not an independent failure. Seeded daemon initialization was last logged. |
| `src/daemon/db/__tests__/draft-test-routes.test.ts` | interrupted | Interrupted by coordinator after pipeline-outcome timeout; not an independent failure. |

## Retained evidence

- Results: `.insrc/tmp/test-harness/runs/e5027f2f-f897-4c7e-b23c-613cbf59d594/results.json`
- Cleanup: `.insrc/tmp/test-harness/runs/e5027f2f-f897-4c7e-b23c-613cbf59d594/cleanup.json`
- Per-file logs and child-close journal: `.insrc/tmp/test-harness/runs/e5027f2f-f897-4c7e-b23c-613cbf59d594/`

The host remains on the separately installed v2 daemon. These tests do not qualify an installer release or a platform. No unrelated test repairs were implemented in this build.
