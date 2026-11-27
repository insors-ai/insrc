<!-- insrc:artifact BUILD-ba80a780f4408613-s1 -->

# Build (standalone bugfix) — Story s1

**Size class:** bugfix  ·  **Standalone:** yes  ·  **Created:** 2026-11-27T14:13:08.214Z  ·  **Updated:** 2026-11-27T15:49:17.922Z

**Commit:** b23dd0e7e

## Summary

Validate turn 4 against approved LLD-ba80a780f4408613-s1 rev 4, with the repo build-command setting now pinning the gate test runner to the repo-required Node 22.22.1 (testCommand = node22 tsx --test-force-exit; the dev daemon itself runs v24, under which harness-aware backend tests refuse with harness-runtime-unsupported). Implementation on commits 7a47d0e28 + b23dd0e7e. All three subjects mapped and expected to pass gate-run under Node 22: real-panel probe behavior test (nested harness over the two t3 docs-review-panel tests), skipLibCheck wiring unit test, commands full-sequence argv test.

## Tasks validated

- ✓ `s1`

**Tests:** [TESTS.md](TESTS.md) — what the gate ran for each Task, and what each test case did.

## Changes

- `scripts/test-harness/probe.mjs` — **insrc-build** (2026-11-27T15:49:17.922Z)
- `vscode-plugin/src/chat/__tests__/docs-review-panel.test.ts` — **insrc-build** (2026-11-27T15:49:17.922Z)
- `vscode-plugin/src/daemon/__tests__/commands.test.ts` — **insrc-build** (2026-11-27T15:49:17.922Z)
- `scripts/__tests__/test-harness.test.ts` — **insrc-build** (2026-11-27T15:49:17.922Z)
