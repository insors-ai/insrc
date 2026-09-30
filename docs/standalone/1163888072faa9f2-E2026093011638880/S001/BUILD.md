# Build (standalone trivial) — Story S001

**Size class:** trivial  ·  **Standalone:** yes  ·  **Created:** 2026-09-30T13:41:04.969Z

## Scope

ISSUE-1163888072faa9f2 (bugfix/small, issue -> build): Merge dev-chat tool result into its tool row and collapse long commands. Render one row per tool invocation: when a tool result arrives, attach its collapsed output to the pending tool row instead of drawing a new row repeating the command; fall back to a standalone result row when no pending tool row exists. Make commands over ~2 lines collapsible via the existing chevron collapse primitive. Keep restored-chat rendering consistent with the live single-row shape. No change to TurnEvent kinds, transcript storage shape, or daemon IPC; bump vscode-plugin 0.5.2 -> 0.5.3.

## Triage rationale

bugfix/small: rendering defect confined to vscode-plugin/src/chat; reuses sc1 collapsible primitive; no event/storage/IPC change.
