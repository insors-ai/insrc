<!-- insrc:artifact BUILD-5ff61e5fdca3875d-S001 -->

# Build (standalone trivial) — Story S001

**Size class:** trivial  ·  **Standalone:** yes  ·  **Created:** 2026-10-13T06:45:42.001Z

**Commit:** 9e4ebe15

## Scope

In the VS Code dev chat, let the user collapse a long assistant response by hand. Since ISSUE-b1c7c1bc (commit 0d000665) the assistant row skips the collapse wrapper entirely, so it has no chevron. A long assistant response (the same test as for a user message: more than 3 lines or more than 240 characters) should get the chevron and start EXPANDED; it must never start collapsed. Short responses stay unwrapped. One function in vscode-plugin/src/chat/render-registry.ts (msgRow) and its tests.

## Triage rationale

One localized edit with no design choice left: the user decided the behaviour (a chevron on a long assistant response, starting expanded).
