<!-- insrc:artifact BUILD-2f07f59c76f70149-S001 -->

# Build (standalone trivial) — Story S001

**Size class:** trivial  ·  **Standalone:** yes  ·  **Created:** 2026-10-09T10:28:08.692Z  ·  **Updated:** 2026-10-09T10:37:04.481Z

**Commit:** 820e7347

## Scope

Fix ISSUE-2f07f59c: in vscode-plugin/src/chat/__tests__/docs-review-panel.test.ts, end the build window of the two Epic bfe98ff7 S004 guard tests ('t1: NO file under src/ is modified' at :4004 and 't6: docs-sections.ts is BYTE-IDENTICAL' at :5640) at that Story's BUILD approval commit (last commit touching its S004/BUILD.md) instead of HEAD (and, for t1, the working tree). Keep every existing assertion. Test-only change.

## Triage rationale

bugfix (small, issue-routed, no LLD): one test file, one obvious approach; the guard's window is open at HEAD and the working tree, so later unrelated src/ commits turn it red.

## Summary

Both bfe98ff7 S004 guard tests in docs-review-panel.test.ts now close their build window at that Story's BUILD approval commit (the last commit touching its S004/BUILD.md, 5db5fe95) instead of HEAD, and t1 no longer unions in the working tree; every existing assertion is kept, plus a sha check on the new boundary. The pane suite now passes 200/200 (t1 was red before), the plugin suite has only the known manifest-catalog failure, and both typechecks are clean (commit 820e7347).

## Tasks validated

- ✓ `S001`

## Changes

- `vscode-plugin/src/chat/__tests__/docs-review-panel.test.ts` — **insrc-build** (2026-10-09T10:37:04.481Z)
