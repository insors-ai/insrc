<!-- insrc:artifact BUILD-65cb63f7186f84fa-S001 -->

# Build (standalone trivial) — Story S001

**Size class:** trivial  ·  **Standalone:** yes  ·  **Created:** 2026-10-12T05:32:00.687Z

**Commit:** 500beba0

## Scope

Pass chat prompts to the claude and codex CLIs after an end-of-options marker

Root cause: vscode-plugin/src/chat/cli-adapter.ts buildArgs puts the raw prompt where the CLI option parser reads it (claude ['-p', req.prompt, ...]; codex ['exec', '--json', ...auto, req.prompt] and the resume variant), so a prompt starting with '-' is parsed as an option.

Fix intent: both argv builders hand the prompt to the CLI so it can never be read as an option, for claude and codex, new and resumed turns; every other argument keeps its meaning.

## Triage rationale

Small bugfix (ISSUE-65cb63f7): one file's two argv builders plus their tests.
