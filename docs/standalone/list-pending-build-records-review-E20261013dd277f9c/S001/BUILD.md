<!-- insrc:artifact BUILD-dd277f9cddd6d879-s1 -->

# Build (standalone small) — Story S001

**Size class:** small  ·  **Standalone:** yes  ·  **Created:** 2026-10-13T20:14:17.594Z  ·  **Updated:** 2026-10-13T20:14:17.594Z

**Commit:** e0903120

## Summary

BUILD joins the pending kinds (src/workflow/pending.ts). A build record that is neither approved nor rejected is listed when CR-<same suffix>.json is in the artifacts directory (a set lookup over the names the scan already reads). Its mdPath is the derived path only when that BUILD.md exists and its first 512 characters carry this record's artifact marker, else '' (buildRecordMdPath, BUILD only). The scan walks the file names sorted. Tests: three in pending.test.ts (replacing 'excludes a non-union KIND even when unapproved (BUILD)'), one each in artifact-content.test.ts, review-decision.test.ts and the plugin's docs-review-panel.test.ts; artifact-kinds.test.ts was re-read and passes unchanged. Nine mutations of the scan each failed the tests. No plugin source changed. The hand check is not done yet and is reported so.

## Tasks validated

- ✗ `S001`

**Tests:** [TESTS.md](TESTS.md) — what the gate ran for each Task, and what each test case did.

## Changes

- `.insrc/artifacts/BUILD-1f74c81f507dbe78-s1.json` — **insrc-build** (2026-10-13T20:14:17.594Z)
- `.insrc/artifacts/BUILD-8d4b90c9ab301e66-s1.json` — **insrc-build** (2026-10-13T20:14:17.594Z)
- `.insrc/artifacts/BUILD-e62a9269a7cb9550-s1.json` — **insrc-build** (2026-10-13T20:14:17.594Z)
- `.insrc/artifacts/CR-1f74c81f507dbe78-s1.json` — **insrc-build** (2026-10-13T20:14:17.594Z)
- `.insrc/artifacts/CR-e62a9269a7cb9550-s1.json` — **insrc-build** (2026-10-13T20:14:17.594Z)
- `.insrc/artifacts/TESTS-1f74c81f507dbe78-s1.json` — **insrc-build** (2026-10-13T20:14:17.594Z)
- `.insrc/artifacts/TESTS-8d4b90c9ab301e66-s1.json` — **insrc-build** (2026-10-13T20:14:17.594Z)
- `.insrc/artifacts/TESTS-e62a9269a7cb9550-s1.json` — **insrc-build** (2026-10-13T20:14:17.594Z)
- `docs/standalone/open-document-presented-approval-review-pane-E20261013e62a9269/S001/BUILD.md` — **insrc-build** (2026-10-13T20:14:17.594Z)
- `docs/standalone/open-document-presented-approval-review-pane-E20261013e62a9269/S001/CR.md` — **insrc-build** (2026-10-13T20:14:17.594Z)
- `docs/standalone/open-document-presented-approval-review-pane-E20261013e62a9269/S001/TESTS.md` — **insrc-build** (2026-10-13T20:14:17.594Z)
- `docs/standalone/review-pane-document-table-search-live-E202610131f74c81f/S001/BUILD.md` — **insrc-build** (2026-10-13T20:14:17.594Z)
- `docs/standalone/review-pane-document-table-search-live-E202610131f74c81f/S001/CR.md` — **insrc-build** (2026-10-13T20:14:17.594Z)
- `docs/standalone/review-pane-document-table-search-live-E202610131f74c81f/S001/TESTS.md` — **insrc-build** (2026-10-13T20:14:17.594Z)
- `docs/standalone/rework-document-review-pane-fixed-decision-E202610138d4b90c9/S001/BUILD.md` — **insrc-build** (2026-10-13T20:14:17.594Z)
- `docs/standalone/rework-document-review-pane-fixed-decision-E202610138d4b90c9/S001/TESTS.md` — **insrc-build** (2026-10-13T20:14:17.594Z)
- `src/workflow/__tests__/artifact-content.test.ts` — **insrc-build** (2026-10-13T20:14:17.594Z)
- `src/workflow/__tests__/pending.test.ts` — **insrc-build** (2026-10-13T20:14:17.594Z)
- `src/workflow/__tests__/review-decision.test.ts` — **insrc-build** (2026-10-13T20:14:17.594Z)
- `src/workflow/pending.ts` — **insrc-build** (2026-10-13T20:14:17.594Z)
- `vscode-plugin/src/chat/__tests__/docs-review-panel.test.ts` — **insrc-build** (2026-10-13T20:14:17.594Z)
