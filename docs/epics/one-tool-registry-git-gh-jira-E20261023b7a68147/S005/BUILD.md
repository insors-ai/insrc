<!-- insrc:artifact BUILD-b7a68147dcf72034-s5 -->

# Build (plan-driven) — Story s5

**Standalone:** no  ·  **Created:** 2026-10-25T14:56:19.569Z  ·  **Updated:** 2026-10-25T17:39:05.767Z

**Commit:** 15170ccc3

## Summary

Docs only: the s5 outcome section (with the deviations and the known gaps) in docs/plans/tool-registry.md, and the nonFunctional.retarget amendment for the per-job gh limits filed as the pending artifact AMD-b7a68147dcf72034-9 through the amendments store (proposeAmendment); the user approves it.

## Tasks validated

- ✓ `t1`
- ✓ `t2`
- ✓ `t3`
- ✓ `t4`
- ✓ `t5`
- ✓ `t6`
- ✓ `t7`
- ✓ `t8`
- ✓ `t9`
- ✓ `t10`
- ✓ `t11`
- ✓ `t12`

**Tests:** [TESTS.md](TESTS.md) — what the gate ran for each Task, and what each test case did.

## Changes

- `src/daemon/tools/builtins/gh/__tests__/_fakegh.ts` — **insrc-build** (2026-10-25T17:50:25.300Z)
- `src/daemon/tools/builtins/gh/__tests__/gh-capture.test.ts` — **insrc-build** (2026-10-25T17:50:25.300Z)
- `src/daemon/tools/builtins/gh/__tests__/gh-exec.test.ts` — **insrc-build** (2026-10-25T17:50:25.300Z)
- `src/daemon/tools/builtins/gh/__tests__/gh-timeouts.test.ts` — **insrc-build** (2026-10-25T17:50:25.300Z)
- `src/daemon/tools/builtins/gh/helpers.ts` — **insrc-build** (2026-10-25T17:50:25.300Z)
- `src/daemon/tools/builtins/gh/actions.ts` — **insrc-build** (2026-10-25T17:50:25.300Z)
- `src/daemon/tools/builtins/gh/issue.ts` — **insrc-build** (2026-10-25T17:50:25.300Z)
- `src/daemon/tools/builtins/gh/pr.ts` — **insrc-build** (2026-10-25T17:50:25.300Z)
- `src/daemon/tools/builtins/gh/release.ts` — **insrc-build** (2026-10-25T17:50:25.300Z)
- `src/daemon/tools/builtins/gh/repo.ts` — **insrc-build** (2026-10-25T17:50:25.300Z)
- `src/daemon/tools/builtins/gh/__tests__/gh-approval.test.ts` — **insrc-build** (2026-10-25T17:50:25.300Z)
- `src/daemon/tools/builtins/gh/__tests__/gh-failure-net.test.ts` — **insrc-build** (2026-10-25T17:50:25.300Z)
- `src/daemon/tools/builtins/gh/__tests__/gh-failures.test.ts` — **insrc-build** (2026-10-25T17:50:25.300Z)
- `src/daemon/tools/call-tool.type-test.ts` — **insrc-build** (2026-10-25T17:50:25.300Z)
- `src/daemon/tools/__tests__/approval-class-mapping.test.ts` — **insrc-build** (2026-10-25T17:50:25.300Z)
- `src/daemon/tools/builtins/gh/__tests__/gh-compat.test.ts` — **insrc-build** (2026-10-25T17:50:25.300Z)
- `src/daemon/tools/builtins/gh/__tests__/gh-output-schemas.test.ts` — **insrc-build** (2026-10-25T17:50:25.300Z)
- `src/daemon/tools/builtins/gh/schemas.ts` — **insrc-build** (2026-10-25T17:50:25.300Z)
- `src/daemon/tools/builtins/gh/legacy.ts` — **insrc-build** (2026-10-25T17:50:25.300Z)
- `src/daemon/tools/builtins/gh/project.ts` — **insrc-build** (2026-10-25T17:50:25.300Z)
- `src/daemon/tools/builtins/gh/__tests__/gh-convert-text.test.ts` — **insrc-build** (2026-10-25T17:50:25.300Z)
- `src/daemon/tools/builtins/gh/convert.ts` — **insrc-build** (2026-10-25T17:50:25.300Z)
- `src/daemon/tools/__tests__/fixtures/added-by-s5.json` — **insrc-build** (2026-10-25T17:50:25.300Z)
- `src/daemon/tools/builtins/gh/__tests__/_cases.ts` — **insrc-build** (2026-10-25T17:50:25.300Z)
- `src/daemon/tools/builtins/gh/__tests__/gh-typed-call.test.ts` — **insrc-build** (2026-10-25T17:50:25.300Z)
- `src/daemon/tools/builtins/gh/__tests__/gh-op-schema.test.ts` — **insrc-build** (2026-10-25T17:50:25.300Z)
- `src/daemon/tools/builtins/gh/__tests__/gh-parsers.test.ts` — **insrc-build** (2026-10-25T17:50:25.300Z)
- `src/daemon/tools/builtins/gh/op-table.ts` — **insrc-build** (2026-10-25T17:50:25.300Z)
- `src/daemon/tools/builtins/gh/parsers.ts` — **insrc-build** (2026-10-25T17:50:25.300Z)
- `src/daemon/tools/builtins/gh/__tests__/gh-family-tools.test.ts` — **insrc-build** (2026-10-25T17:50:25.300Z)
- `src/daemon/tools/builtins/gh/__tests__/gh-inputs.test.ts` — **insrc-build** (2026-10-25T17:50:25.300Z)
- `src/daemon/tools/builtins/gh/index.ts` — **insrc-build** (2026-10-25T17:50:25.300Z)
- `src/daemon/tools/builtins/gh/manage.ts` — **insrc-build** (2026-10-25T17:50:25.300Z)
- `src/daemon/tools/builtins/gh/resources.ts` — **insrc-build** (2026-10-25T17:50:25.300Z)
- `src/daemon/tools/builtins/gh/__tests__/_providers.ts` — **insrc-build** (2026-10-25T17:50:25.300Z)
- `src/daemon/tools/builtins/gh/__tests__/gh-search-inputs.test.ts` — **insrc-build** (2026-10-25T17:50:25.300Z)
- `src/daemon/tools/builtins/gh/account.ts` — **insrc-build** (2026-10-25T17:50:25.300Z)
- `src/daemon/tools/builtins/gh/__tests__/_ghhelp.ts` — **insrc-build** (2026-10-25T17:50:25.300Z)
- `src/daemon/tools/builtins/gh/__tests__/gh-coverage.test.ts` — **insrc-build** (2026-10-25T17:50:25.300Z)
- `src/daemon/tools/builtins/gh/coverage.ts` — **insrc-build** (2026-10-25T17:50:25.300Z)
- `src/daemon/tools/builtins/gh/inputs.ts` — **insrc-build** (2026-10-25T17:50:25.300Z)
- `src/daemon/tools/builtins/gh/__tests__/_family-rows.ts` — **insrc-build** (2026-10-25T17:50:25.300Z)
- `src/daemon/tools/builtins/gh/__tests__/gh-live.test.ts` — **insrc-build** (2026-10-25T17:50:25.300Z)
- `src/daemon/tools/builtins/gh/__tests__/gh-parser.test.ts` — **insrc-build** (2026-10-25T17:50:25.300Z)
- `docs/plans/tool-registry.md` — **insrc-build** (2026-10-25T17:50:25.300Z)
