<!-- insrc:artifact BUILD-c03a454b11fd5933-s1 -->

# Build (standalone trivial) — Story s1

**Size class:** trivial  ·  **Standalone:** yes  ·  **Created:** 2026-11-28T07:47:44.070Z  ·  **Updated:** 2026-11-28T07:48:41.395Z

**Commit:** 8ed798155

## Scope

ISSUE-c03a454b11fd5933 (approved): Make the activation tests run to completion. Gate-visible failure on HEAD: hosts/__tests__/activation.test.ts test 1 asserts the launch target as join(paths.daemonRoot, 'scripts', 'insrc-mcp'), but extension.ts:167 now resolves join(await selectedMcpRoot(paths) ?? paths.daemonRoot, 'scripts', 'insrc-mcp') (owned-runtime routing) and returns it only when it exists. (The ISSUE's original bare-run hang — 5 cancelled tests in src/__tests__/activation.test.ts — is a --test-force-exit artifact owned by ISSUE-4b336004; under the gate's pinned command that file is 15/15.) Fix: update the test expectation to the selectedMcpRoot resolution; no product change.

## Summary

hosts/__tests__/activation.test.ts test 1 now asserts the current launch-target contract: join(await selectedMcpRoot(paths) ?? paths.daemonRoot, 'scripts', 'insrc-mcp') plus the existsSync(target) ? target : undefined guard. Test-side expectation only, no product change. File is 4/4 under the pinned command; tsc clean root + plugin. Commit 8ed798155.

## Tasks validated

- ✓ `s1`

**Tests:** [TESTS.md](TESTS.md) — what the gate ran for each Task, and what each test case did.

## Changes

- `vscode-plugin/src/hosts/__tests__/activation.test.ts` — **insrc-build** (2026-11-28T07:48:41.395Z)
