<!-- insrc:artifact BUILD-b9d5c5c40df5a574-s8 -->

# Build (plan-driven) — Story s8

**Standalone:** no  ·  **Created:** 2026-10-09T13:06:19.852Z  ·  **Updated:** 2026-10-09T14:28:43.659Z

**Commit:** 1b6dbb99

## Summary

docs/daemon.md has a new subsection, 'What a module is for the code tasks', after the kinds-of-scope subsection: the definition, the three forms of the module value and the rule under a file or symbol scope. The analyze suite after the Story's last source change (ba4b5014) has no test that passed in the baseline and fails now (1099 tests, 1004 pass, 0 fail, against 982 passes); the gated file passes whole with INSRC_LIVE_TESTS=1 (11 of 11) and its two rewritten tests are named. Upstream was merged with --no-ff (07caf563); it changed nothing under src/. Live check on 2026-10-09 through the installed daemon at 07caf563: run s8-live-code-S-mv10dmxn returned a final report, 12 tasks completed and none failed, the module list held 37 modules and all eight functional-surface tasks succeeded. The whole-repository suite was not run; the Story changed files under src/analyze only.

## Tasks validated

- ✓ `t1`
- ✓ `t2`
- ✓ `t3`
- ✓ `t4`
- ✓ `t5`

**Tests:** [TESTS.md](TESTS.md) — what the gate ran for each Task, and what each test case did.

## Changes

- `.insrc/artifacts/CR-b9d5c5c40df5a574-s8.json` — **insrc-build** (2026-10-09T14:28:43.659Z)
- `docs/daemon.md` — **insrc-build** (2026-10-09T14:28:43.659Z)
- `docs/epics/make-insrc-analysis-complete-used-right-E20261006b9d5c5c4/S008/CR.md` — **insrc-build** (2026-10-09T14:28:43.659Z)
- `docs/epics/make-insrc-analysis-complete-used-right-E20261006b9d5c5c4/S008/baseline/README.md` — **insrc-build** (2026-10-09T14:28:43.659Z)
- `docs/epics/make-insrc-analysis-complete-used-right-E20261006b9d5c5c4/S008/baseline/analyze.txt` — **insrc-build** (2026-10-09T14:28:43.659Z)
- `docs/epics/make-insrc-analysis-complete-used-right-E20261006b9d5c5c4/S008/baseline/deterministic-runtimes.gated.txt` — **insrc-build** (2026-10-09T14:28:43.659Z)
- `docs/epics/make-insrc-analysis-complete-used-right-E20261006b9d5c5c4/S008/measurements/after/analyze.txt` — **insrc-build** (2026-10-09T14:28:43.659Z)
- `docs/epics/make-insrc-analysis-complete-used-right-E20261006b9d5c5c4/S008/measurements/after/deterministic-runtimes.gated.txt` — **insrc-build** (2026-10-09T14:28:43.659Z)
- `docs/epics/make-insrc-analysis-complete-used-right-E20261006b9d5c5c4/S008/measurements/baseline-comparison-t5.md` — **insrc-build** (2026-10-09T14:28:43.659Z)
- `docs/epics/make-insrc-analysis-complete-used-right-E20261006b9d5c5c4/S008/measurements/live-run-t5.md` — **insrc-build** (2026-10-09T14:28:43.659Z)
- `docs/epics/make-insrc-analysis-complete-used-right-E20261006b9d5c5c4/S008/measurements/live/code-S.frames.jsonl` — **insrc-build** (2026-10-09T14:28:43.659Z)
- `docs/epics/make-insrc-analysis-complete-used-right-E20261006b9d5c5c4/S008/measurements/live/code-S.meta.json` — **insrc-build** (2026-10-09T14:28:43.659Z)
- `docs/epics/make-insrc-analysis-complete-used-right-E20261006b9d5c5c4/S008/measurements/live/code-S.result.json` — **insrc-build** (2026-10-09T14:28:43.659Z)
- `docs/epics/make-insrc-analysis-complete-used-right-E20261006b9d5c5c4/S008/measurements/live/code-S.run/plan.json` — **insrc-build** (2026-10-09T14:28:43.659Z)
- `docs/epics/make-insrc-analysis-complete-used-right-E20261006b9d5c5c4/S008/measurements/live/code-S.run/run.json` — **insrc-build** (2026-10-09T14:28:43.659Z)
- `docs/epics/make-insrc-analysis-complete-used-right-E20261006b9d5c5c4/S008/measurements/live/code-S.run/tasks/t01.json` — **insrc-build** (2026-10-09T14:28:43.659Z)
- `docs/epics/make-insrc-analysis-complete-used-right-E20261006b9d5c5c4/S008/measurements/live/code-S.run/tasks/t02.json` — **insrc-build** (2026-10-09T14:28:43.659Z)
- `docs/epics/make-insrc-analysis-complete-used-right-E20261006b9d5c5c4/S008/measurements/live/code-S.run/tasks/t03.json` — **insrc-build** (2026-10-09T14:28:43.659Z)
- `docs/epics/make-insrc-analysis-complete-used-right-E20261006b9d5c5c4/S008/measurements/live/code-S.run/tasks/t04.json` — **insrc-build** (2026-10-09T14:28:43.659Z)
- `docs/epics/make-insrc-analysis-complete-used-right-E20261006b9d5c5c4/S008/measurements/live/code-S.run/tasks/t05.json` — **insrc-build** (2026-10-09T14:28:43.659Z)
- `docs/epics/make-insrc-analysis-complete-used-right-E20261006b9d5c5c4/S008/measurements/live/code-S.run/tasks/t06.json` — **insrc-build** (2026-10-09T14:28:43.659Z)
- `docs/epics/make-insrc-analysis-complete-used-right-E20261006b9d5c5c4/S008/measurements/live/code-S.run/tasks/t07.json` — **insrc-build** (2026-10-09T14:28:43.659Z)
- `docs/epics/make-insrc-analysis-complete-used-right-E20261006b9d5c5c4/S008/measurements/live/code-S.run/tasks/t08.json` — **insrc-build** (2026-10-09T14:28:43.659Z)
- `docs/epics/make-insrc-analysis-complete-used-right-E20261006b9d5c5c4/S008/measurements/live/code-S.run/tasks/t09.json` — **insrc-build** (2026-10-09T14:28:43.659Z)
- `docs/epics/make-insrc-analysis-complete-used-right-E20261006b9d5c5c4/S008/measurements/live/code-S.run/tasks/t10.json` — **insrc-build** (2026-10-09T14:28:43.659Z)
- `docs/epics/make-insrc-analysis-complete-used-right-E20261006b9d5c5c4/S008/measurements/live/code-S.run/tasks/t11.json` — **insrc-build** (2026-10-09T14:28:43.659Z)
- `docs/epics/make-insrc-analysis-complete-used-right-E20261006b9d5c5c4/S008/measurements/live/code-S.run/tasks/t12.json` — **insrc-build** (2026-10-09T14:28:43.659Z)
- `src/analyze/planner/templates/code/index.ts` — **insrc-build** (2026-10-09T14:28:43.659Z)
- `src/analyze/runtimes/__tests__/completeness-all-runtimes.test.ts` — **insrc-build** (2026-10-09T14:28:43.659Z)
- `src/analyze/runtimes/__tests__/scope-sources.test.ts` — **insrc-build** (2026-10-09T14:28:43.659Z)
- `src/analyze/runtimes/code/__tests__/deterministic-runtimes.test.ts` — **insrc-build** (2026-10-09T14:28:43.659Z)
- `src/analyze/runtimes/code/__tests__/module-directories.test.ts` — **insrc-build** (2026-10-09T14:28:43.659Z)
- `src/analyze/runtimes/code/discovery-modules.ts` — **insrc-build** (2026-10-09T14:28:43.659Z)
- `src/analyze/runtimes/code/structure-module-tree.ts` — **insrc-build** (2026-10-09T14:28:43.659Z)
- `src/analyze/runtimes/code/surface-functional.ts` — **insrc-build** (2026-10-09T14:28:43.659Z)
- `src/analyze/runtimes/shared/__tests__/source-modules.test.ts` — **insrc-build** (2026-10-09T14:28:43.659Z)
- `src/analyze/runtimes/shared/source-modules.ts` — **insrc-build** (2026-10-09T14:28:43.659Z)
