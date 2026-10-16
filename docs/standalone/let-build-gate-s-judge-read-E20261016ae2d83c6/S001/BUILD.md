<!-- insrc:artifact BUILD-ae2d83c6ab06c595-S001 -->

# Build (standalone trivial) — Story S001

**Size class:** trivial  ·  **Standalone:** yes  ·  **Created:** 2026-10-16T18:28:00.495Z  ·  **Updated:** 2026-10-16T18:36:00.026Z

**Commit:** 687395c8

## Scope

Both build-gate judge prompts (src/daemon/steps/build-step/render.ts renderStandaloneValidatePrompt and src/prompts/build/validate-task.md) let the judge read the repository with read-only commands as well as read tools, still telling it not to run the typecheck or tests and not to change anything, so a codex judge can read. A trivial standalone build's validate prompt carries the build's stated scope (the standalone focus), passed from src/daemon/steps/build-step/phases/validate.ts. The prompt test pinning the old wording is updated; tests show both prompts permit read-only commands and the trivial prompt includes the scope. Implements ISSUE-ae2d83c6ab06c595.

## Triage rationale

bugfix/small: prompt text in one module plus one spec field; existing render test updated.

## Summary

Commit 687395c8: both judge prompts allow read-only commands (cat, rg, ls, git diff, git log) beside read tools and still forbid running the typecheck/tests or changing anything; a trivial standalone prompt renders the focus as "## Stated scope" (passed from phases/validate.ts). Tests: render.test.ts (wording + scope section) and build-start.test.ts (the trivial validate passes the focus to the judge); four falsifying mutations each fail a test. Full sweep: the same 2 pre-existing failures as before (sqlite-driver, review-decision), nothing new. Live: on the daemon at 687395c8 the codex judge read the repository and judged the change.

## Tasks validated

- ✓ `S001`

**Tests:** [TESTS.md](TESTS.md) — what the gate ran for each Task, and what each test case did.

## Changes

- `.insrc/artifacts/TESTS-c2ba6fa62a148ed1-s1.json` — **insrc-build** (2026-10-16T18:36:00.026Z)
- `docs/epics/complete-consistent-richer-code-index-one-E20261011c2ba6fa6/S001/TESTS.md` — **insrc-build** (2026-10-16T18:36:00.026Z)
- `docs/standalone/send-codex-structured-output-schemas-openai-E20261016e48e33ae/S001/BUILD.md` — **insrc-build** (2026-10-16T18:36:00.026Z)
