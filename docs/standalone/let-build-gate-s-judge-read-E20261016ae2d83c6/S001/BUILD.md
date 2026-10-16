<!-- insrc:artifact BUILD-ae2d83c6ab06c595-S001 -->

# Build (standalone trivial) — Story S001

**Size class:** trivial  ·  **Standalone:** yes  ·  **Created:** 2026-10-16T18:28:00.495Z

**Commit:** dd771653

## Scope

Both build-gate judge prompts (src/daemon/steps/build-step/render.ts renderStandaloneValidatePrompt and src/prompts/build/validate-task.md) let the judge read the repository with read-only commands as well as read tools, still telling it not to run the typecheck or tests and not to change anything, so a codex judge can read. A trivial standalone build's validate prompt carries the build's stated scope (the standalone focus), passed from src/daemon/steps/build-step/phases/validate.ts. The prompt test pinning the old wording is updated; tests show both prompts permit read-only commands and the trivial prompt includes the scope. Implements ISSUE-ae2d83c6ab06c595.

## Triage rationale

bugfix/small: prompt text in one module plus one spec field; existing render test updated.
