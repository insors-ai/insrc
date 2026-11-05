<!-- insrc:artifact BUILD-45e743550d9596c3-S001 -->

# Build (standalone trivial) — Story S001

**Size class:** trivial  ·  **Standalone:** yes  ·  **Created:** 2026-11-05T10:08:40.649Z  ·  **Updated:** 2026-11-05T11:18:12.723Z

**Commit:** 395d4230b

## Scope

Route VS Code Claude chat requests to the selected Ollama host

In VS Code insrc chat, select Claude and deepseek-v4-pro:cloud, then send a message. Claude reports: "There's an issue with the selected model (deepseek-v4-pro:cloud). It may not exist or you may not have access to it." The same model works from the user's CLI. The recorded chat stderr contains [claude-code:unrecognized_model], while the initialization event reports the insrc MCP server connected. A no-model-call diagnostic using createProviderRegistry confirms the launch passes the selected model but no explicit ANTHROPIC_BASE_URL or Ollama auth override. Expected: selecting a model served by the ollama-claude family runs Claude against the configured Ollama server, including subsequent turns and continuations; selecting a vendor model retains vendor routing. [c4][c5]

The VS Code chat path is separate from the backend CliProvider. runCatalogView merges models from families sharing cliKind into one provider view and retains only id/name/alias/efforts, so Ollama family/host/hosting information is lost. createProviderRegistry builds the chat StreamAdapter; its Claude launch passes --model but has no Ollama environment routing. By contrast, the backend CliProvider already accepts an Ollama target and applies child-only ANTHROPIC_BASE_URL/AUTH_TOKEN/API_KEY overrides while removing vendor OAuth and Bedrock/Vertex overrides. The VS Code extension constructs the unconfigured chat registry and therefore relies on its inherited environment rather than the selected model's served target. [c1][c2][c3][c4]

Resolve the selected Claude model's trusted served family and hosting against the daemon's model definitions and configured Ollama host at launch. Run Ollama-hosted chat turns with isolated child environment overrides equivalent to the existing backend path; preserve ordinary vendor behavior and avoid changing process.env or daemon/model configuration. Apply the same routing to initial, subsequent/resumed, approval follow-up and title-generation calls. Refuse unresolved hosted targets instead of silently falling back to a vendor endpoint. Add focused fake-spawn regressions covering local/cloud hosting, configured host, vendor environment isolation and continuation/title behavior. [c1][c2][c3]

## Summary

Extension-only fix: resolve Claude chat models through served definitions and configured Ollama host at the shared chat spawn boundary; use child-only Ollama environment overrides, canonical hosted aliases and fail-closed errors. Initial/resumed/follow-up/title calls share routing. Stop and title expiry prevent late spawning during IPC lookup. The initially extracted backend helper was removed in 5cac99fe7; backend has no net change against baseline. Verified 773 chat tests, 18 existing backend regressions, and both typechecks, then reran 34 focused/wiring tests after narrowing the helper. No global configuration changes or live model inference.

## Tasks validated

- ✓ `S001`

**Tests:** [TESTS.md](TESTS.md) — what the gate ran for each Task, and what each test case did.

## Changes

- `.insrc/artifacts/ISSUE-ee9a582d9f5a6c00.json` — **insrc-build** (2026-11-05T10:23:23.356Z)
- `docs/standalone/45e743550d9596c3-E2026110545e74355/S001/IMPLEMENTATION.md` — **insrc-build** (2026-11-05T10:23:23.356Z)
- `docs/standalone/45e743550d9596c3-E2026110545e74355/S001/evidence/backend-tests.tap` — **insrc-build** (2026-11-05T10:23:23.356Z)
- `docs/standalone/45e743550d9596c3-E2026110545e74355/S001/evidence/backend-typecheck.txt` — **insrc-build** (2026-11-05T10:23:23.356Z)
- `docs/standalone/45e743550d9596c3-E2026110545e74355/S001/evidence/chat-tests.tap` — **insrc-build** (2026-11-05T10:23:23.356Z)
- `docs/standalone/45e743550d9596c3-E2026110545e74355/S001/evidence/plugin-typecheck.txt` — **insrc-build** (2026-11-05T10:23:23.356Z)
- `docs/standalone/route-vs-code-claude-chat-requests-E20261105ee9a582d/ISSUE.md` — **insrc-build** (2026-11-05T10:23:23.356Z)
- `src/agent/providers/cli-provider.ts` — **insrc-build** (2026-11-05T10:23:23.356Z)
- `src/shared/ollama-claude-env.ts` — **insrc-build** (2026-11-05T10:23:23.356Z)
- `vscode-plugin/src/chat/__tests__/extension-chat-wiring.test.ts` — **insrc-build** (2026-11-05T10:23:23.356Z)
- `vscode-plugin/src/chat/__tests__/ollama-routing.test.ts` — **insrc-build** (2026-11-05T10:23:23.356Z)
- `vscode-plugin/src/chat/cli-adapter.ts` — **insrc-build** (2026-11-05T10:23:23.356Z)
- `vscode-plugin/src/chat/ollama-routing.ts` — **insrc-build** (2026-11-05T10:23:23.356Z)
- `vscode-plugin/src/chat/turn-lifecycle.ts` — **insrc-build** (2026-11-05T10:23:23.356Z)
- `vscode-plugin/src/extension.ts` — **insrc-build** (2026-11-05T10:23:23.356Z)
- `docs/standalone/45e743550d9596c3-E2026110545e74355/S001/evidence/checks.json` — **insrc-build** (2026-11-05T11:18:12.723Z)
- `.insrc/artifacts/CR-45e743550d9596c3-S001.json` — **insrc-build** (2026-11-05T11:18:12.723Z)
- `docs/standalone/45e743550d9596c3-E2026110545e74355/S001/CR.md` — **insrc-build** (2026-11-05T11:18:12.723Z)
- `docs/standalone/45e743550d9596c3-E2026110545e74355/S001/REVIEW-NOTES.md` — **insrc-build** (2026-11-05T11:18:12.723Z)
- `docs/standalone/45e743550d9596c3-E2026110545e74355/S001/evidence/installation.json` — **insrc-build** (2026-11-05T11:18:12.723Z)
- `docs/standalone/45e743550d9596c3-E2026110545e74355/S001/evidence/narrowed-tests.tap` — **insrc-build** (2026-11-05T11:18:12.723Z)
