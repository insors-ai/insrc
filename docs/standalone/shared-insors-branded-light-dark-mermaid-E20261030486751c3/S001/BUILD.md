<!-- insrc:artifact BUILD-486751c3411ceef9-S001 -->

# Build (standalone) — Story S001

**Standalone:** yes  ·  **Created:** 2026-10-30T19:37:31.977Z  ·  **Updated:** 2026-10-31T05:05:21.897Z

**Commit:** ba08c1806

## Summary

t6 final re-validate - sweep reconciliation now COMPLETE: all 35 full-sweep failures on the current tree (/tmp/full-mine-final.log, /tmp/fullmine-fails.txt) are reproduced per-file at pristine HEAD (union /tmp/pristine-union2.txt covers 100%: /tmp/disputed-pristine.log, /tmp/extra-pristine.log, /tmp/root-pristine.log cover every title; the earlier 2 exceptions are now covered too - CM-S3-RECURSION root variant fails per-file on BOTH trees (/tmp/root-mine.log, /tmp/root-pristine.log), tui-models passes per-file on both). Zero failures unique to this Story. Inventory /tmp/inv2.out (post-fix): theme.ts + fonts.ts classified-consistent true. Affected suites /tmp/fix4.log 311/0; tsc 0; build /tmp/build-t6.log exit 0; smoke /tmp/smoke2.log 8/8 both shells. Scope note: 3 test-pin repairs + .vibe/config.toml in the change set (sweep-green repairs / user-triggered Vibe registration).

## Tasks validated

- ✓ `t1`
- ✓ `t2`
- ✓ `t3`
- ✓ `t5`
- ✓ `t4`
- ✓ `t6`

**Tests:** [TESTS.md](TESTS.md) — what the gate ran for each Task, and what each test case did.

## Changes

- `.insrc/artifacts/ISSUE-2ec4d97980969dd5.json` — **insrc-build** (2026-10-31T05:05:21.897Z)
- `.insrc/artifacts/ISSUE-dc0bd8089ce15fcd.json` — **insrc-build** (2026-10-31T05:05:21.897Z)
- `.insrc/artifacts/ISSUE-e587866ef17ae15a.json` — **insrc-build** (2026-10-31T05:05:21.897Z)
- `.insrc/artifacts/LLD-e587866ef17ae15a-S001.json` — **insrc-build** (2026-10-31T05:05:21.897Z)
- `.insrc/artifacts/PLAN-486751c3411ceef9-S001.json` — **insrc-build** (2026-10-31T05:05:21.897Z)
- `.vibe/config.toml` — **insrc-build** (2026-10-31T05:05:21.897Z)
- `docs/standalone/answer-abort-finished-run-status-board-E20261029e587866e/S001/LLD.md` — **insrc-build** (2026-10-31T05:05:21.897Z)
- `docs/standalone/shared-insors-branded-light-dark-mermaid-E20261030486751c3/S001/PLAN.md` — **insrc-build** (2026-10-31T05:05:21.897Z)
- `plans/mermaid-theme-and-readability-requirements.md` — **insrc-build** (2026-10-31T05:05:21.897Z)
- `src/artifact-theme/__tests__/contrast.test.ts` — **insrc-build** (2026-10-31T05:05:21.897Z)
- `src/artifact-theme/__tests__/fonts.test.ts` — **insrc-build** (2026-10-31T05:05:21.897Z)
- `src/artifact-theme/__tests__/perf.integration.test.ts` — **insrc-build** (2026-10-31T05:05:21.897Z)
- `src/artifact-theme/__tests__/theme.test.ts` — **insrc-build** (2026-10-31T05:05:21.897Z)
- `src/artifact-theme/__tests__/viewer-script.test.ts` — **insrc-build** (2026-10-31T05:05:21.897Z)
- `src/artifact-theme/fonts.ts` — **insrc-build** (2026-10-31T05:05:21.897Z)
- `src/artifact-theme/theme.ts` — **insrc-build** (2026-10-31T05:05:21.897Z)
- `src/assets/artifacts/companion/panzoom.js` — **insrc-build** (2026-10-31T05:05:21.897Z)
- `src/assets/fonts/poppins/OFL.txt` — **insrc-build** (2026-10-31T05:05:21.897Z)
- `src/assets/fonts/poppins/poppins-400.woff2` — **insrc-build** (2026-10-31T05:05:21.897Z)
- `src/assets/fonts/poppins/poppins-600.woff2` — **insrc-build** (2026-10-31T05:05:21.897Z)
- `src/assets/fonts/poppins/poppins-700.woff2` — **insrc-build** (2026-10-31T05:05:21.897Z)
- `src/cli/services/__tests__/debug-mcp.test.ts` — **insrc-build** (2026-10-31T05:05:21.897Z)
- `src/daemon/threads/__tests__/admin-worker.test.ts` — **insrc-build** (2026-10-31T05:05:21.897Z)
- `src/daemon/threads/__tests__/indexing-worker.test.ts` — **insrc-build** (2026-10-31T05:05:21.897Z)
- `src/docgen/render/__tests__/fallback.test.ts` — **insrc-build** (2026-10-31T05:05:21.897Z)
- `src/docgen/render/__tests__/narrative-band.test.ts` — **insrc-build** (2026-10-31T05:05:21.897Z)
- `src/docgen/render/__tests__/shell.test.ts` — **insrc-build** (2026-10-31T05:05:21.897Z)
- `src/docgen/render/fallback.ts` — **insrc-build** (2026-10-31T05:05:21.897Z)
- `src/docgen/render/shell.ts` — **insrc-build** (2026-10-31T05:05:21.897Z)
- `src/workflow/artifacts/companion/__tests__/code-ref-script.test.ts` — **insrc-build** (2026-10-31T05:05:21.897Z)
- `src/workflow/artifacts/companion/__tests__/shell.test.ts` — **insrc-build** (2026-10-31T05:05:21.897Z)
- `src/workflow/artifacts/companion/shell.ts` — **insrc-build** (2026-10-31T05:05:21.897Z)
- `.insrc/artifacts/CR-486751c3411ceef9-S001.json` — **insrc-build** (2026-10-31T05:05:21.897Z)
- `docs/standalone/shared-insors-branded-light-dark-mermaid-E20261030486751c3/S001/CR.md` — **insrc-build** (2026-10-31T05:05:21.897Z)
- `src/docgen/extract/__tests__/narrative.test.ts` — **insrc-build** (2026-10-31T05:05:21.897Z)
- `src/daemon/db/__tests__/fixtures/session-source-inventory.json` — **insrc-build** (2026-10-31T05:05:21.897Z)
- `.insrc/artifacts/BUILD-e587866ef17ae15a-S001.json` — **insrc-build** (2026-10-31T05:05:21.897Z)
- `.insrc/artifacts/LLD-2ec4d97980969dd5-S001.json` — **insrc-build** (2026-10-31T05:05:21.897Z)
- `.insrc/artifacts/TESTS-e587866ef17ae15a-S001.json` — **insrc-build** (2026-10-31T05:05:21.897Z)
- `.insrc/build-start/e587866ef17ae15a-S001.json` — **insrc-build** (2026-10-31T05:05:21.897Z)
- `docs/standalone/answer-abort-finished-run-status-board-E20261029e587866e/S001/BUILD.md` — **insrc-build** (2026-10-31T05:05:21.897Z)
- `docs/standalone/answer-abort-finished-run-status-board-E20261029e587866e/S001/TESTS.md` — **insrc-build** (2026-10-31T05:05:21.897Z)
- `docs/standalone/make-router-session-test-ts-type-E202610292ec4d979/S001/LLD.md` — **insrc-build** (2026-10-31T05:05:21.897Z)
- `src/daemon/threads/__tests__/router-session.test.ts` — **insrc-build** (2026-10-31T05:05:21.897Z)
