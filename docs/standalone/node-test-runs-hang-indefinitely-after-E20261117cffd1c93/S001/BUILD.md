<!-- insrc:artifact BUILD-cffd1c931403f0c9-s1 -->

# Build (standalone trivial) — Story s1

**Size class:** trivial  ·  **Standalone:** yes  ·  **Created:** 2026-11-18T04:12:58.156Z  ·  **Updated:** 2026-11-18T04:28:59.692Z

**Commit:** 3713f391e

## Scope

Bug: node:test runs hang indefinitely after all sub-tests finish because no exit-forcing flag is set. The repo's three node-test-runner invocations (package.json:19, packages/project-memory/package.json:27, vscode-plugin/package.json:911) invoke node's built-in test runner with no exit-forcing flag. Some shared test fixture leaves a timer/socket/watcher open after tests finish, so the process never exits on its own. Fix: add the `--test-force-exit` flag to the node test-runner invocation in all three 'test' scripts, so a run exits promptly once all tests have genuinely finished. No test logic changes. See ISSUE-cffd1c931403f0c9 for the full record.

## Triage rationale

A pure test-runner-invocation robustness fix, empirically confirmed by reproduction: 3 one-line script edits, no src/ code touched, identical pass count before/after, only the hang-after-completion eliminated.

## Tasks validated

- ✓ `s1`

**Tests:** [TESTS.md](TESTS.md) — what the gate ran for each Task, and what each test case did.
