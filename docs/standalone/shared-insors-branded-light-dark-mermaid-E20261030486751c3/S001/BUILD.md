<!-- insrc:artifact BUILD-486751c3411ceef9-S001 -->

# Build (standalone) — Story S001

**Standalone:** yes  ·  **Created:** 2026-10-30T19:37:31.977Z  ·  **Updated:** 2026-10-30T22:10:54.708Z

**Commit:** bdf2ff3ca

## Summary

t6 re-validate after code-review round 1: typecheck clean (tsc exit 0), build green, regen smoke 8/8 branded on both shells (/tmp/smoke2.log), full affected-suite run 310 pass / 0 fail exit 0 (/tmp/fix2.log) covering artifact-theme, companion (shell + code-ref-script), docgen (shell, fallback, narrative-band, extract/narrative). Sweep reconciliation stands: per-file pristine-vs-mine runs show zero failures unique to this Story (/tmp/dm2.txt vs /tmp/dp2.txt); SIGTERM/summary-link pass in isolation on both trees.

## Tasks validated

- ✓ `t1`
- ✓ `t2`
- ✓ `t3`
- ✓ `t5`
- ✓ `t4`
- ✗ `t6`

**Tests:** [TESTS.md](TESTS.md) — what the gate ran for each Task, and what each test case did.

## Changes

- `.insrc/artifacts/ISSUE-2ec4d97980969dd5.json` — **insrc-build** (2026-10-30T22:10:54.708Z)
- `.insrc/artifacts/ISSUE-dc0bd8089ce15fcd.json` — **insrc-build** (2026-10-30T22:10:54.708Z)
- `.insrc/artifacts/ISSUE-e587866ef17ae15a.json` — **insrc-build** (2026-10-30T22:10:54.708Z)
- `.insrc/artifacts/LLD-e587866ef17ae15a-S001.json` — **insrc-build** (2026-10-30T22:10:54.708Z)
- `.insrc/artifacts/PLAN-486751c3411ceef9-S001.json` — **insrc-build** (2026-10-30T22:10:54.708Z)
- `.vibe/config.toml` — **insrc-build** (2026-10-30T22:10:54.708Z)
- `docs/standalone/answer-abort-finished-run-status-board-E20261029e587866e/S001/LLD.md` — **insrc-build** (2026-10-30T22:10:54.708Z)
- `docs/standalone/shared-insors-branded-light-dark-mermaid-E20261030486751c3/S001/PLAN.md` — **insrc-build** (2026-10-30T22:10:54.708Z)
- `plans/mermaid-theme-and-readability-requirements.md` — **insrc-build** (2026-10-30T22:10:54.708Z)
- `src/artifact-theme/__tests__/contrast.test.ts` — **insrc-build** (2026-10-30T22:10:54.708Z)
- `src/artifact-theme/__tests__/fonts.test.ts` — **insrc-build** (2026-10-30T22:10:54.708Z)
- `src/artifact-theme/__tests__/perf.integration.test.ts` — **insrc-build** (2026-10-30T22:10:54.708Z)
- `src/artifact-theme/__tests__/theme.test.ts` — **insrc-build** (2026-10-30T22:10:54.708Z)
- `src/artifact-theme/__tests__/viewer-script.test.ts` — **insrc-build** (2026-10-30T22:10:54.708Z)
- `src/artifact-theme/fonts.ts` — **insrc-build** (2026-10-30T22:10:54.708Z)
- `src/artifact-theme/theme.ts` — **insrc-build** (2026-10-30T22:10:54.708Z)
- `src/assets/artifacts/companion/panzoom.js` — **insrc-build** (2026-10-30T22:10:54.708Z)
- `src/assets/fonts/poppins/OFL.txt` — **insrc-build** (2026-10-30T22:10:54.708Z)
- `src/assets/fonts/poppins/poppins-400.woff2` — **insrc-build** (2026-10-30T22:10:54.708Z)
- `src/assets/fonts/poppins/poppins-600.woff2` — **insrc-build** (2026-10-30T22:10:54.708Z)
- `src/assets/fonts/poppins/poppins-700.woff2` — **insrc-build** (2026-10-30T22:10:54.708Z)
- `src/cli/services/__tests__/debug-mcp.test.ts` — **insrc-build** (2026-10-30T22:10:54.708Z)
- `src/daemon/threads/__tests__/admin-worker.test.ts` — **insrc-build** (2026-10-30T22:10:54.708Z)
- `src/daemon/threads/__tests__/indexing-worker.test.ts` — **insrc-build** (2026-10-30T22:10:54.708Z)
- `src/docgen/render/__tests__/fallback.test.ts` — **insrc-build** (2026-10-30T22:10:54.708Z)
- `src/docgen/render/__tests__/narrative-band.test.ts` — **insrc-build** (2026-10-30T22:10:54.708Z)
- `src/docgen/render/__tests__/shell.test.ts` — **insrc-build** (2026-10-30T22:10:54.708Z)
- `src/docgen/render/fallback.ts` — **insrc-build** (2026-10-30T22:10:54.708Z)
- `src/docgen/render/shell.ts` — **insrc-build** (2026-10-30T22:10:54.708Z)
- `src/workflow/artifacts/companion/__tests__/code-ref-script.test.ts` — **insrc-build** (2026-10-30T22:10:54.708Z)
- `src/workflow/artifacts/companion/__tests__/shell.test.ts` — **insrc-build** (2026-10-30T22:10:54.708Z)
- `src/workflow/artifacts/companion/shell.ts` — **insrc-build** (2026-10-30T22:10:54.708Z)
- `.insrc/artifacts/CR-486751c3411ceef9-S001.json` — **insrc-build** (2026-10-30T22:10:54.708Z)
- `docs/standalone/shared-insors-branded-light-dark-mermaid-E20261030486751c3/S001/CR.md` — **insrc-build** (2026-10-30T22:10:54.708Z)
- `src/docgen/extract/__tests__/narrative.test.ts` — **insrc-build** (2026-10-30T22:10:54.708Z)
