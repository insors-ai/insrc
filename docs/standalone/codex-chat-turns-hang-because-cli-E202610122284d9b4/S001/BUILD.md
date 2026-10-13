<!-- insrc:artifact BUILD-2284d9b47fc9c35e-S001 -->

# Build (standalone trivial) — Story S001

**Size class:** trivial  ·  **Standalone:** yes  ·  **Created:** 2026-10-13T05:56:44.377Z

**Commit:** cabfb225

## Scope

ISSUE-2284d9b47fc9c35e: codex chat turns hang because the CLI's input is left open. Start a CLI that reads its input as prompt text (codex) with that input closed; keep it open for claude, whose approval answers are written to it. A codex approval answer is then reported as undeliverable. The live codex tests in vscode-plugin/src/chat/__tests__/live-cli.test.ts must pass through the production launcher.

## Triage rationale

Small bugfix: one clear approach in one file (vscode-plugin/src/chat/cli-adapter.ts), one spawn call site, one production user of the launcher.
