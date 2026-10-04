<!-- insrc:artifact BUILD-b846171f48d26a25-s1 -->

# Build (standalone) — Story s1

**Standalone:** yes  ·  **Created:** 2026-10-04T16:58:33.403Z  ·  **Updated:** 2026-10-04T16:58:39.239Z

**Commit:** fdc24eb

## Summary

Closed by hand on 2026-10-04: the build ran on 2026-09-27 but no BUILD record was written and its commits were labelled "(no issue)". The five plan tasks shipped in commits 97bf2c2 (t1), 9e6f015 (t3), 1a31dee (t2 and t4) and dc2621b (t5): a WebviewPanelSerializer is registered for the chat panel and the host adopts the restored panel through the same wiring a fresh open uses. Verified on 2026-10-04 by reading the code (vscode-plugin/src/extension.ts registers the serializer) and by running the chat-panel and extension-wiring tests (107 pass, including the three adopt() tests). Not verified: the behaviour in a running VS Code window. The code-review record already on file for this Story (2026-09-27) examined unrelated files, so this fix has had no recorded code review.

## Tasks validated

- ✓ `t1`
- ✓ `t2`
- ✓ `t3`
- ✓ `t4`
- ✓ `t5`

## Changes

- `.insrc/artifacts/ISSUE-dddb4113077c8de8.json` — **insrc-build** (2026-10-04T16:58:39.239Z)
