<!-- insrc:artifact BUILD-34b6a247a4828d49-S001 -->

# Build (standalone trivial) — Story S001

**Size class:** trivial  ·  **Standalone:** yes  ·  **Created:** 2026-10-08T15:04:07.322Z  ·  **Updated:** 2026-10-08T15:09:25.086Z

**Commit:** ca780fe1

## Scope

Fix ISSUE-34b6a247a4828d49: the graph builder (src/workflow/delivery/graph.ts buildWorkItemGraph) reports every load failure in the record set as one store-level 'record-unreadable' notice that names the failed file (fileNames) and carries the failure reason and detail in its message, with attention taken from the fixed table (true). Nothing else about the graph changes: no items are added or removed, and other notices keep their content. Tests in graph.test.ts: one notice per failure naming the file, reason and detail; and items, rootIds and every other notice are deep-equal with and without an unreadable file in the record set.

## Triage rationale

A missing behaviour in one function: buildWorkItemGraph never reads recordSet.failures, so no 'record-unreadable' notice is raised although the approved s1 LLD requires one per RecordLoadFailure. One loop in graph.ts plus a test in graph.test.ts; no contract change.

## Summary

The graph builder now raises one store-level record-unreadable notice per load failure, naming the file and carrying the reason and detail in its message; items, root ids and other notices are unchanged.

## Tasks validated

- ✓ `S001`

## Changes

- `src/workflow/delivery/__tests__/graph.test.ts` — **insrc-build** (2026-10-08T15:09:25.086Z)
- `src/workflow/delivery/graph.ts` — **insrc-build** (2026-10-08T15:09:25.086Z)
