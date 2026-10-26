<!-- insrc:artifact BUILD-117dcaa2402ba54c-s1 -->

# Build (standalone trivial) — Story s1

**Size class:** trivial  ·  **Standalone:** yes  ·  **Created:** 2026-10-26T06:34:59.174Z  ·  **Updated:** 2026-10-26T07:21:03.951Z

**Commit:** 9c17142d4

## Scope

Fix three known gaps of the gh tools: (1) gh:project:item-archive and gh:project:item-delete must take the project number as a positional instead of --project-id (gh 2.46.0); update input/output schemas, coverage, tests. (2) Turn dashSafe on for the manage.ts and resources.ts families with tests that a '-' positional is refused. (3) Find and close the open handle in src/daemon/tools/builtins/gh/__tests__/gh-typed-call.test.ts so it exits without --test-force-exit.

## Triage rationale

Small bugfix: ISSUE-117dcaa2402ba54c, no LLD (issue -> build).

## Tasks validated

- ✗ `s1`

**Tests:** [TESTS.md](TESTS.md) — what the gate ran for each Task, and what each test case did.

## Changes

- `src/daemon/tools/builtins/gh/__tests__/_cases.ts` — **insrc-build** (2026-10-26T07:38:53.317Z)
- `src/daemon/tools/builtins/gh/__tests__/gh-compat.test.ts` — **insrc-build** (2026-10-26T07:38:53.317Z)
- `src/daemon/tools/builtins/gh/__tests__/gh-dash-safe.test.ts` — **insrc-build** (2026-10-26T07:38:53.317Z)
- `src/daemon/tools/builtins/gh/__tests__/gh-typed-call.test.ts` — **insrc-build** (2026-10-26T07:38:53.317Z)
- `src/daemon/tools/builtins/gh/inputs.ts` — **insrc-build** (2026-10-26T07:38:53.317Z)
- `src/daemon/tools/builtins/gh/manage.ts` — **insrc-build** (2026-10-26T07:38:53.317Z)
- `src/daemon/tools/builtins/gh/project.ts` — **insrc-build** (2026-10-26T07:38:53.317Z)
- `src/daemon/tools/builtins/gh/resources.ts` — **insrc-build** (2026-10-26T07:38:53.317Z)
- `src/daemon/tools/builtins/gh/schemas.ts` — **insrc-build** (2026-10-26T07:38:53.317Z)
- `src/daemon/tools/__tests__/approval-class-mapping.test.ts` — **insrc-build** (2026-10-26T07:38:53.317Z)
