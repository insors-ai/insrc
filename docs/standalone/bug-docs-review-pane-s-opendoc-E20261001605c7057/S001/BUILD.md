# Build (standalone trivial) — Story S001

**Size class:** trivial  ·  **Standalone:** yes  ·  **Created:** 2026-10-04T09:40:27.183Z  ·  **Updated:** 2026-10-04T09:52:43.994Z

**Commit:** 92cd26e

## Scope

Fix ISSUE-605c70574633ed67: opening two documents quickly in the docs-review pane can display the wrong one, because openDoc has no supersede guard (refreshSeq covers only refreshPending). A slower earlier open must never overwrite a newer one.

## Triage rationale

Approved small bugfix (issue -> build): one function in vscode-plugin/src/chat/docs-review-panel.ts lacks the monotonic guard its sibling refreshPending already has.

## Summary

openDoc in the docs-review pane now carries the same monotonic supersede guard refreshPending has, on its own counter, so a slow earlier open (or its failure) can no longer replace the document the reviewer opened last; a failure of the current open still posts blocked:true. Four regression tests added; four mutations of the guard each turn them red.

## Tasks validated

- ✗ `S001`
