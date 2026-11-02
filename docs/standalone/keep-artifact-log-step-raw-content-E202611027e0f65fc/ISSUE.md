<!-- insrc:artifact ISSUE-7e0f65fc1a518722 -->

# Keep the artifact log in step with raw content writes

## Reproduction

Write an artifact through the store (ArtifactStore.write), so its head is revision 1 and its history log holds one entry at revision 1. Change its content with a raw writer: read the head, change the body and call writeArtifact with kind 'content'. Observed (reproduced with a scratch test on 2026-11-02): the head is now revision 2 and the log still ends at revision 1; asking the lifecycle service to approve it throws LifecycleConflictError 'head-ahead-of-log' and nothing is approved. Expected: a content change on a head that has history is logged, so the service can approve and review the new revision.

## Root cause

writeArtifact in src/workflow/storage.ts prepares a content write with prepareArtifactWrite, which mints the next revision and rewrites the head, but it never appends to the artifact's history. The integrity check in src/workflow/artifact-core/lifecycle.ts compares the head's revision with the last revision in the log and reports 'head-ahead-of-log' when the head is later. The store tolerates that state on a write (src/workflow/artifact-core/store.ts) but LifecycleService refuses to approve, review or complete such a head (src/workflow/artifact-core/lifecycle-service.ts). Content writers that call writeArtifact directly include src/daemon/steps/workflow-step/phases/synthesize.ts, src/daemon/workflow-rpc.ts, src/workflow/gates.ts, src/workflow/resolve-comment.ts, src/workflow/tracker/unit-head.ts and the build ledger writers (src/workflow/runners/build/test-record.ts and standalone-record.ts); which of them run on a head that already has history is not yet established. The core data model plan lists the gap as binding item 3 for the s3 build (docs/plans/core-data-model.md).

## Fix intent

A content change that a raw writer makes to a head that has history must leave the log in step with the head, so the lifecycle service approves, reviews and completes the new revision as it does a store write. The design settles whether that is done by moving those writers onto the history-aware store path or by the service treating a head ahead of its log by a raw writer explicitly, and which of the raw writers need it. A real content change on a head with existing history is tested through service approval and review. The integrity rules themselves (hash-mismatch, log-ahead-of-head) are not loosened.

## Citations

- **[[c1]]** `code` `src/workflow/storage.ts`
- **[[c2]]** `code` `src/workflow/artifact-core/lifecycle.ts`
- **[[c3]]** `code` `src/workflow/artifact-core/store.ts`
- **[[c4]]** `code` `src/workflow/artifact-core/lifecycle-service.ts`
- **[[c5]]** `doc` `docs/plans/core-data-model.md`
- **[[c6]]** `code` `src/workflow/artifact-write-inventory.ts`
