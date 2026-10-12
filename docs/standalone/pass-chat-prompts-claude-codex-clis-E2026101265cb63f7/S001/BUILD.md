<!-- insrc:artifact BUILD-65cb63f7186f84fa-S001 -->

# Build (standalone trivial) — Story S001

**Size class:** trivial  ·  **Standalone:** yes  ·  **Created:** 2026-10-12T05:32:00.687Z  ·  **Updated:** 2026-10-12T05:35:35.400Z

**Commit:** ec0dd3c7

## Scope

Pass chat prompts to the claude and codex CLIs after an end-of-options marker

Root cause: vscode-plugin/src/chat/cli-adapter.ts buildArgs puts the raw prompt where the CLI option parser reads it (claude ['-p', req.prompt, ...]; codex ['exec', '--json', ...auto, req.prompt] and the resume variant), so a prompt starting with '-' is parsed as an option.

Fix intent: both argv builders hand the prompt to the CLI so it can never be read as an option, for claude and codex, new and resumed turns; every other argument keeps its meaning.

## Triage rationale

Small bugfix (ISSUE-65cb63f7): one file's two argv builders plus their tests.

## Summary

The chat's claude and codex argv builders now put every flag first and the prompt last, after '--', for new and resumed turns, so a prompt starting with '-' reaches the CLI as the prompt. Verified against the real claude CLI: without '--' a '- MED: ...' prompt fails with "unknown option"; with '--' it is read as the prompt. New test 65cb63f7 in cli-adapter.test.ts fails without the fix and passes with it.

## Tasks validated

- ✓ `S001`

**Tests:** [TESTS.md](TESTS.md) — what the gate ran for each Task, and what each test case did.

## Changes

- `.insrc/artifacts/CR-65cb63f7186f84fa-S001.json` — **insrc-build** (2026-10-12T05:35:35.400Z)
- `.insrc/artifacts/ISSUE-65cb63f7186f84fa.json` — **insrc-build** (2026-10-12T05:35:35.400Z)
- `docs/standalone/pass-chat-prompts-claude-codex-clis-E2026101265cb63f7/ISSUE.md` — **insrc-build** (2026-10-12T05:35:35.400Z)
- `docs/standalone/pass-chat-prompts-claude-codex-clis-E2026101265cb63f7/S001/CR.md` — **insrc-build** (2026-10-12T05:35:35.400Z)
- `vscode-plugin/src/chat/__tests__/cli-adapter.test.ts` — **insrc-build** (2026-10-12T05:35:35.400Z)
- `vscode-plugin/src/chat/cli-adapter.ts` — **insrc-build** (2026-10-12T05:35:35.400Z)
