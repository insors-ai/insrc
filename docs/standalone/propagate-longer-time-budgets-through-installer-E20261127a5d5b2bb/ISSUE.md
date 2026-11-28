<!-- insrc:artifact ISSUE-a5d5b2bb021655d0 -->

# Propagate longer time budgets through installer qualification

## Reproduction

Run the native runtime foundation qualification on the UTM macOS guest backed by the external USB disk, using source f5e9f2afe1de462870fac5829878da93b0c0537d. Node acquisition, offline reuse, npm ci and compilation succeed. The preparation worker then spends more than an hour staging production dependencies. The retained attempt staged 43,697 files (1,329,984,102 bytes); its identity was written at 10:52:03.536 UTC and qualification failed at 12:21:59.647 UTC with preparation-uncertain. The final file was written less than one second before failure. This timing strongly supports the nested 90-minute deadline, although the exact parent command exit result was not retained. Expected: selecting a larger slow-VM qualification allowance consistently covers every relevant nested stage and still ends within finite limits. Actual: the outer qualification has a two-hour budget while independently created manager and worker scopes retain shorter defaults. [[c1]] [[c2]] [[c3]] [[c5]] [[c6]]

## Root cause

Time policy is distributed across independent boundaries. checkedBudgets/createRun permit explicit budgets, but dev-delivery's ownedScope creates a default run and launchDevWorker receives runMs minus cleanupMs; executeDevWorker creates another default run. Raising the outer qualification budget therefore leaves the manager/worker limit unchanged. Runtime acquisition, read-only verification and publication also use independent fixed limits. Supplemental source searches found further downloader/resource-closure and containing CI clocks, which must be included in the design inventory. The graph reports 35 coordinator-context importers, so changing shared defaults indiscriminately would affect unrelated consumers; graph coverage is not exhaustive. This diagnosed propagation gap is separate from the unmeasured contribution of fsync, ownership checks or USB/VM storage latency. [[c1]] [[c2]] [[c3]] [[c4]] [[c5]] [[c7]]

## Fix intent

Provide one explicit, bounded slow-VM qualification policy and apply it consistently to all relevant installer/runtime foundation work, reusing existing budget validation and ownership mechanisms. Proposed allowances for design: 40 minutes per build/command and runtime acquisition/download/extraction; four hours for manager and worker preparation with a 30-second cleanup reserve; eight minutes for read-only runtime verification; 30 seconds for relevant file/network/parser/process resource closure; five hours for outer native qualification, with containing operator/CI deadlines allowing the selected stages and final cleanup to complete. The parent must cover its child allowance plus setup/finalization, and no hidden old cap may silently win. Proposed scope is opt-in VM qualification, preserving normal defaults; the user was asked whether global defaults are desired instead, and that choice must be incorporated before implementation. Preserve finite deadlines, immediate explicit cancellation, integrity/size/profile checks, durable writes, ownership and fail-closed cleanup. No new public IPC trust flag, arbitrary unbounded timeout, daemon/IDE lifecycle change, automatic failed-attempt adoption, PID-based cleanup or Windows qualification waiver. Prove propagation with surrounding tests using accelerated clocks, keep ordinary/default behavior tests, record the chosen policy in native evidence and rerun in a fresh isolated VM home only after prior worker closure is established. This supplies the time-budget prerequisite for foundation 446ae69566d352dd/s1 T10; packaging optimization and diagnostic-retention redesign are separate scope. [[c1]] [[c2]] [[c3]] [[c4]] [[c5]] [[c6]] [[c8]]

## Citations

- **[[c1]]** `code` `scripts/test-harness/context.mjs:10` — "runMs: 5_400_000, cleanupMs: 5_000"
- **[[c2]]** `code` `src/installer/dev-delivery.ts:34-51` — "createRun(root, { mode: 'build' })"
- **[[c3]]** `code` `src/installer/dev-worker.ts:200-244` — "createRun(paths.checkout, { mode: 'build', runId: record.coordinatorRunId! })"
- **[[c4]]** `code` `src/installer/runtime-metadata.ts:12-13` — "networkMs: 600_000, verificationMs: 120_000"
- **[[c5]]** `code` `scripts/qualify-runtime-foundation.mjs:42` — "budgets: { buildMs: 3_600_000, fileMs: 3_600_000, runMs: 7_200_000 }"
- **[[c6]]** `doc` `docs/standalone/complete-shared-external-node-runtime-foundation-E20261126446ae695/S001/evidence/t10.md#follow-up-failure-explanation-deadline-timing-and-payload-metadata` — "Read-only retained stage scan: 43697 files, 1329984102 bytes; failure 89m56.111s after worker identity."
- **[[c7]]** `analyze-bundle` `Installer budget analysis, completed 2026-11-27: module.profile/config.trace/symbol.locate/import.graph/test.locate` — "Coordinator context has 35 graph importers; 36 relationships point at ignored files, so graph completeness is not established."
- **[[c8]]** `stakeholder` `User directive, 2026-11-27` — "since we are testing on a VM with USB disk, it is expected that operations will be slow. need to increase the time budget for all."
