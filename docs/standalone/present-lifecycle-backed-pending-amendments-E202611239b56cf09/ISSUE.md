<!-- insrc:artifact ISSUE-9b56cf09824e7110 -->

# Present lifecycle-backed pending amendments

## Reproduction

Create an HLD amendment through the normal design.story amendment proposal path. Its stored head contains meta.lifecycle.status='draft' and no top-level status. Call insrc_present with the amendment artifact id. Expected: presented while undecided. Observed: notPending because workflow.pending omits it. Reproduced with AMD-c3d71313f34bce71-1 through -4; all four have lifecycle=draft and fail the current top-level-status predicate. Existing LLD presentation still succeeds. [[c1]] [[c2]]

## Root cause

The canonical amendment store writes {meta,body,citations} heads through the lifecycle service and reads their decisions through approvalStateOf(meta). listPendingArtifacts still special-cases AMD as a flat legacy record and requires art.status==='pending', excluding all current amendment heads. The pending regression fixture supplies only flat AMD status records, so it does not cover the real writer format. The issue is a stale reader assumption rather than missing amendment content or a requirement for Markdown. [[c1]] [[c2]] [[c3]]

## Fix intent

Make pending amendment discovery agree with the canonical lifecycle-backed amendment writer/reader without changing saved amendment decisions or weakening approval gates. Retain legacy flat-record behavior only where deliberately supported and ensure lifecycle-backed decisions take precedence over stale legacy fields. Add meaningful regression coverage using real amendment creation and draft/approved/rejected decisions, then verify pending discovery and insrc_present agree. Do not change the installer designs or restart/update the host daemon as part of this patch. Validate under a project-supported Node 22 runtime; report source/test results separately from availability in the running daemon. [[c1]] [[c2]] [[c3]] [[c4]]

## Citations

- **[[c1]]** `code` `src/workflow/pending.ts`
- **[[c2]]** `code` `src/workflow/amendments/store.ts`
- **[[c3]]** `doc` `src/workflow/__tests__/pending.test.ts`
- **[[c4]]** `doc` `AGENTS.md`
