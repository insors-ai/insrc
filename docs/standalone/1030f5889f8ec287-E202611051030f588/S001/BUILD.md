<!-- insrc:artifact BUILD-1030f5889f8ec287-S001 -->

# Build (standalone trivial) — Story S001

**Size class:** trivial  ·  **Standalone:** yes  ·  **Created:** 2026-11-05T12:45:25.581Z  ·  **Updated:** 2026-11-05T12:49:10.017Z

**Commit:** 8737feaec

## Scope

Implement approved ISSUE-910fce32967bc4ea: correct Vibe programmatic prompt delivery for initial/resumed chat and title generation, preserving streaming, permissions, attachments and model environment; cover multiline and option-like prompts, verify real installed CLI contract without live inference and check backend stdin compatibility.

## Triage rationale

Small bugfix routed issue → build; localized existing Vibe mapper correction without new IPC or schema.

## Summary

Corrected Vibe programmatic prompt transport by binding the full text to --prompt= in the existing chat mapper, covering new/resumed turns and title generation. Streaming, attachment, permission and model environment behavior is retained; backend stdin transport remains unchanged. 152 affected tests and both typechecks passed locally. Installed Vibe 3.0.4 parser probe with a stub app server confirms old argv fails missing-prompt and corrected/multiline/backend stdin inputs pass that guard without inference. Authenticated live inference is a manual check.

## Tasks validated

- ✓ `S001`

**Tests:** [TESTS.md](TESTS.md) — what the gate ran for each Task, and what each test case did.

## Changes

- `.insrc/artifacts/ISSUE-910fce32967bc4ea.json` — **insrc-build** (2026-11-05T12:49:10.017Z)
- `docs/standalone/1030f5889f8ec287-E202611051030f588/S001/IMPLEMENTATION.md` — **insrc-build** (2026-11-05T12:49:10.017Z)
- `docs/standalone/1030f5889f8ec287-E202611051030f588/S001/evidence/affected-tests.tap` — **insrc-build** (2026-11-05T12:49:10.017Z)
- `docs/standalone/1030f5889f8ec287-E202611051030f588/S001/evidence/vibe-cli-probe.json` — **insrc-build** (2026-11-05T12:49:10.017Z)
- `docs/standalone/pass-vibe-chat-prompts-correctly-programmatic-E20261105910fce32/ISSUE.md` — **insrc-build** (2026-11-05T12:49:10.017Z)
- `vscode-plugin/src/chat/__tests__/cli-adapter.test.ts` — **insrc-build** (2026-11-05T12:49:10.017Z)
- `vscode-plugin/src/chat/cli-adapter.ts` — **insrc-build** (2026-11-05T12:49:10.017Z)
