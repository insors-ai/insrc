<!-- insrc:artifact BUILD-2284d9b47fc9c35e-S001 -->

# Build (standalone trivial) — Story S001

**Size class:** trivial  ·  **Standalone:** yes  ·  **Created:** 2026-10-13T05:56:44.377Z  ·  **Updated:** 2026-10-13T06:09:34.368Z

**Commit:** f21955c6

## Scope

ISSUE-2284d9b47fc9c35e: codex chat turns hang because the CLI's input is left open. Start a CLI that reads its input as prompt text (codex) with that input closed; keep it open for claude, whose approval answers are written to it. A codex approval answer is then reported as undeliverable. The live codex tests in vscode-plugin/src/chat/__tests__/live-cli.test.ts must pass through the production launcher.

## Triage rationale

Small bugfix: one clear approach in one file (vscode-plugin/src/chat/cli-adapter.ts), one spawn call site, one production user of the launcher.

## Summary

Codex is now started with no input stream, so `codex exec` no longer waits for its input to end; claude keeps its input for the decision relay. A decision for codex is reported as undeliverable and written nowhere. Checked with unit tests (a real process that reads its input to the end starts at once with the input closed and waits with it open) and with the live codex tests through the production launcher: evidence in /tmp/insrc-validate-output/codex-fix-live-tests.tap (3 of 3 pass) and /tmp/insrc-validate-output/codex-fix-plugin-suite.tap (1165 tests, 1157 pass, 6 skipped, 2 fail: the manifest-catalog tests that failed before).

## Tasks validated

- ✓ `S001`

**Tests:** [TESTS.md](TESTS.md) — what the gate ran for each Task, and what each test case did.

## Changes

- `.insrc/artifacts/CR-2284d9b47fc9c35e-S001.json` — **insrc-build** (2026-10-13T06:09:34.368Z)
- `.insrc/artifacts/CR-59da3204a44afd1b-S001.json` — **insrc-build** (2026-10-13T06:09:34.368Z)
- `.insrc/artifacts/ISSUE-2284d9b47fc9c35e.json` — **insrc-build** (2026-10-13T06:09:34.368Z)
- `docs/standalone/codex-chat-turns-hang-because-cli-E202610122284d9b4/S001/CR.md` — **insrc-build** (2026-10-13T06:09:34.368Z)
- `docs/standalone/paste-images-attach-documents-dev-chat-E2026101259da3204/S001/CR.md` — **insrc-build** (2026-10-13T06:09:34.368Z)
- `vscode-plugin/src/chat/__tests__/cli-adapter.test.ts` — **insrc-build** (2026-10-13T06:09:34.368Z)
- `vscode-plugin/src/chat/__tests__/fixtures.ts` — **insrc-build** (2026-10-13T06:09:34.368Z)
- `vscode-plugin/src/chat/cli-adapter.ts` — **insrc-build** (2026-10-13T06:09:34.368Z)
