<!-- insrc:artifact ISSUE-778fc07c9d84c7fb -->

# deriveMdPath resolves a brainstorm SPEC artifact under docs/epics/ instead of docs/standalone/

## Reproduction

1. Run the `brainstorm` workflow to completion; it synthesizes a SpecArtifact and writes its rendered markdown to `docs/standalone/<slug>-E<date><hash>/SPEC.md` (per the hardcoded brainstorm special-case in `pathsForWorkflow`). 2. Approve the SPEC via `insrc_workflow_approve`. 3. Call `insrc_present` (or anything that walks the pending-artifact list, e.g. the TUI's pending pane) with that SPEC's artifact id. Observed: the call fails with `workflow.artifactContent: cannot read '.../docs/epics/<slug>-E<date><hash>/SPEC.md': ENOENT: no such file or directory`. Expected: it should read the file that actually exists at `docs/standalone/<slug>-E<date><hash>/SPEC.md`. Reproduced concretely for three approved SPEC artifacts: SPEC-0add47b5b1f72874, SPEC-e8632c1ae22c3bf8, SPEC-5a5f556b77d7aa31.

## Root cause

`deriveMdPath` (src/workflow/pending.ts:245-257) computes the work-item placement for ANY artifact kind with `const workItemKind: WorkItemKind = meta['standalone'] === true ? 'standalone' : 'epic';` (pending.ts:249), defaulting to `'epic'` whenever the artifact's `meta.standalone` flag is not literally `true`. A brainstorm `SPEC` artifact's `meta` never carries a `standalone` field at all, so this always evaluates to `'epic'`, producing a `docs/epics/...` path. But the WRITE path for a SPEC (`pathsForWorkflow` in src/workflow/storage.ts, workflow==='brainstorm' branch at storage.ts:1183-1188) special-cases SPEC artifacts BEFORE reaching the generic standalone check — it always calls `specArtifactPaths(..., 'standalone', ...)` regardless of the `standalone` meta flag, per its own comment "a brainstorm spec precedes the Epic chain, so it is always a standalone work item" (storage.ts:1174-1177). That write-side special case never stamps `meta.standalone = true` back onto the artifact, so the two code paths (write-side `pathsForWorkflow` and read-side `deriveMdPath`) disagree for every SPEC: the file really is under `docs/standalone/`, but `deriveMdPath` computes `docs/epics/`. `deriveMdPath`'s two callers in the same file, `toDescriptor` (pending.ts:158-182, builds the pending-list descriptor consumed by `insrc_present`) and `buildRecordMdPath` (pending.ts:195-212), both inherit this wrong path for SPEC kind. The identical `meta.standalone === true ? 'standalone' : 'epic'` pattern is also present at storage.ts:455 and storage.ts:1177, but both of those sit downstream of workflow-specific branches (brainstorm, issue, define, etc.) that resolve non-SPEC kinds correctly via their own meta flags, so this mismatch is specific to SPEC/brainstorm artifacts.

## Fix intent

Add an early special-case inside `deriveMdPath` (src/workflow/pending.ts) so that `kind === 'SPEC'` always resolves `workItemKind = 'standalone'`, mirroring the write-side special case already proven correct in `pathsForWorkflow` (storage.ts:1183-1188) — rather than falling through to the generic `meta['standalone'] === true` check that SPEC artifacts never satisfy. No change to the write path, the SpecArtifact schema, or any other artifact kind's path resolution.

## Citations

- **[[c1]]** `code` `src/workflow/pending.ts:245-257` — "const workItemKind: WorkItemKind = meta['standalone'] === true ? 'standalone' : 'epic';"
- **[[c2]]** `code` `src/workflow/storage.ts:1174-1188` — "A brainstorm spec precedes the Epic chain, so it is always a standalone work item."
- **[[c3]]** `code` `src/workflow/pending.ts:158-182`
- **[[c4]]** `code` `src/workflow/pending.ts:195-212`
- **[[c5]]** `code` `src/workflow/storage.ts:455`
