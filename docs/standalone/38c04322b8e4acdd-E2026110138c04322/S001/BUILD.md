<!-- insrc:artifact BUILD-38c04322b8e4acdd-s1 -->

# Build (standalone trivial) — Story s1

**Size class:** trivial  ·  **Standalone:** yes  ·  **Created:** 2026-11-01T15:42:51.207Z  ·  **Updated:** 2026-11-01T15:47:53.870Z

**Commit:** 6b37240bd

## Scope

Separate mandatory review coverage from optional execution

Live review review-e6ddcdcb-s4-t4-live-20261101 completed with zero HIGH/MED/LOW findings and independently verified all four task tests plus typecheck. It nevertheless returned incomplete because it disclosed that production integration and the broader builder tests/build were not separately rerun. Expected: optional execution disclosures alone do not block; skipped in-scope code/modules, requirements or test-coverage inspection do block. [[c1]] [[c3]]

The task-review policy places every limitation in the same blocking bucket. Shared normalization and validation conservatively make any limitations entry incomplete, while the renderer separately supports nonblocking advice. Optional execution boundaries were emitted as mandatory limitations, so a fully assessed task could not pass. The validator rule is appropriate for mandatory missing evidence; the prompt/field semantics fail to distinguish optional execution from mandatory inspection. [[c1]] [[c2]]

Require complete inspection of all submitted code/modules, requirements and relevant test coverage. Treat executing integration checks, tests and builds as optional and disclose omissions in the existing nonblocking output section. Make verified testCoverage mean completed evidence-based coverage assessment, not mandatory reviewer execution; demonstrated coverage defects remain findings. Keep mandatory omissions incomplete regardless of reason, preserve HIGH/MED handling and pinned historical results, and add regressions for optional nonexecution, skipped modules and unassessed coverage. No new result fields, compatibility mode, automatic verdict promotion or revived review engine. [[c1]] [[c2]] [[c3]]

## Summary

Mandatory code/module/requirements and test-coverage inspection remain blocking when incomplete. Optional integration/test/typecheck/build execution is disclosed in nonblocking advice. Existing result shape and historical verdicts are preserved. Build/typecheck and73 focused regressions pass.

## Tasks validated

- ✓ `s1`

**Tests:** [TESTS.md](TESTS.md) — what the gate ran for each Task, and what each test case did.

## Changes

- `docs/task-review-execution.md` — **insrc-build** (2026-11-01T15:47:53.870Z)
- `src/workflow/code-review/task-review/__tests__/review-scope-policy.test.ts` — **insrc-build** (2026-11-01T15:47:53.870Z)
- `src/workflow/code-review/task-review/contracts.ts` — **insrc-build** (2026-11-01T15:47:53.870Z)
- `src/workflow/code-review/task-review/policy.ts` — **insrc-build** (2026-11-01T15:47:53.870Z)
- `src/workflow/code-review/task-review/record.ts` — **insrc-build** (2026-11-01T15:47:53.870Z)
- `src/workflow/code-review/task-review/results.ts` — **insrc-build** (2026-11-01T15:47:53.870Z)
