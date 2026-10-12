<!-- insrc:artifact BUILD-7ba8cf154db36204-S001 -->

# Build (standalone trivial) — Story S001

**Size class:** trivial  ·  **Standalone:** yes  ·  **Created:** 2026-10-12T06:31:54.482Z  ·  **Updated:** 2026-10-12T06:38:06.154Z

**Commit:** 22db1e9c

## Scope

Run each build-gate test file in the gate's own process (no `--test`), keeping `--test-force-exit`, so its TAP report is never truncated (ISSUE-7ba8cf15). Change TEST_RUNNER_ARGV in src/mcp/build-step/validation-checks.ts; add a regression test.

## Summary

TEST_RUNNER_ARGV drops `--test`, so each file runs in the runner's own process with force-exit kept. The TAP report goes to a per-run file through `--test-reporter-destination`, and the process's own output is appended as TAP comments, so a printed result line is never read as one. Review follow-up: if that report file cannot be created, the file's check now fails with a note instead of the gate throwing. Regression tests cover a 300-test file reported in full, a failing test, and the report directory not being creatable.

## Tasks validated

- ✓ `S001`

**Tests:** [TESTS.md](TESTS.md) — what the gate ran for each Task, and what each test case did.

## Changes

- `.insrc/artifacts/BUILD-6a811b8acca60ac5-S001.json` — **insrc-build** (2026-10-12T06:38:06.154Z)
- `.insrc/artifacts/TESTS-6a811b8acca60ac5-S001.json` — **insrc-build** (2026-10-12T06:38:06.154Z)
- `docs/standalone/bug-vs-code-dev-chat-approvals-E202610046a811b8a/S001/BUILD.md` — **insrc-build** (2026-10-12T06:38:06.154Z)
- `docs/standalone/bug-vs-code-dev-chat-approvals-E202610046a811b8a/S001/TESTS.md` — **insrc-build** (2026-10-12T06:38:06.154Z)
