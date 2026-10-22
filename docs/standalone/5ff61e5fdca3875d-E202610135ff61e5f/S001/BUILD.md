<!-- insrc:artifact BUILD-5ff61e5fdca3875d-s1 -->

# Build (standalone trivial) — Story S001

**Size class:** trivial  ·  **Standalone:** yes  ·  **Created:** 2026-10-13T06:45:42.001Z  ·  **Updated:** 2026-10-13T07:18:27.074Z

**Commit:** e6ed9f33

## Scope

In the VS Code dev chat, let the user collapse a long assistant response by hand. Since ISSUE-b1c7c1bc (commit 0d000665) the assistant row skips the collapse wrapper entirely, so it has no chevron. A long assistant response (the same test as for a user message: more than 3 lines or more than 240 characters) should get the chevron and start EXPANDED; it must never start collapsed. Short responses stay unwrapped. One function in vscode-plugin/src/chat/render-registry.ts (msgRow) and its tests.

## Triage rationale

One localized edit with no design choice left: the user decided the behaviour (a chevron on a long assistant response, starting expanded).

## Summary

A long assistant response (more than 3 lines or 240 characters) now has the collapse chevron and starts expanded, so the user can fold it by hand; it is never folded for them. Short responses are unwrapped as before.

## Tasks validated

- ✓ `S001`

**Tests:** [TESTS.md](TESTS.md) — what the gate ran for each Task, and what each test case did.

## Changes

- `.insrc/artifacts/BUILD-7fefc3fc5c51793e-s1.json` — **insrc-build** (2026-10-13T07:18:27.074Z)
- `docs/standalone/make-dev-chat-follow-vs-code-E202610137fefc3fc/S001/BUILD.md` — **insrc-build** (2026-10-13T07:18:27.074Z)
