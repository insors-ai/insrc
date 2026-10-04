<!-- insrc:artifact ISSUE-0855311b6b32eb72 -->

# File a small standalone story's BUILD record beside its design doc, not under docs/epics with a raw-hash folder name

## Reproduction

1. Route a feature through triage as `small`, which starts at a standalone `design.story` (the story's only upstream artifact is its LLD; there is no DEF and no ISSUE).
2. Approve the LLD, implement, then call `insrc_build_step` with `phase: 'validate'` and `standalone: { standalone: true, epicHash, storyId, sizeClass: 'small', ... }`.

Observed (story c4c420c22b71651e S001, 2026-10-04): the BUILD record's meta carried only workflow/epicHash/storyId/createdAt/updatedAt, with no `standalone` and no `sizeClass`. BUILD.md was written to `docs/epics/c4c420c22b71651e-E20261004c4c420c2/S001/BUILD.md`, titled "Build (plan-driven)" with "Standalone: no", while the same story's LLD.md and CR.md were in `docs/standalone/vs-code-plugin-lock-insrc-chat-E20261004c4c420c2/S001/`.

Expected: BUILD.md is written beside the LLD in `docs/standalone/vs-code-plugin-lock-insrc-chat-E20261004c4c420c2/S001/`, the record is marked standalone with its size class, and it renders as a standalone build.

## Root cause

The standalone validate branch knows it is serving a standalone story but discards that fact before the record is written. `handleStandaloneValidate` receives the caller's standalone context (including `sizeClass`) and passes only `{ epicHash, storyId, taskId }` into the shared `runValidateSession`. That shared persist then re-derives the route with `inheritedStandalone(repoPath, epicHash)`, which reads `readEpicDefinitionCore`. `readEpicDefinitionCore` looks at exactly two artifacts, the DEF and the ISSUE; a triage-routed small story has neither, so it returns an empty object and `standalone` is undefined. The record is therefore written without a `standalone` key and without `sizeClass`.

With `standalone` not true, `buildRecordFolderArgs` takes the epic branch: `workItemKind` becomes 'epic' (so the top-level folder is docs/epics), and the slug comes from the same empty definition lookup, so it is undefined and the path builder falls back to the epic hash as the folder label. `buildRecordFolderArgs` does know how to read the standalone LLD for the anchor and label, but only on the branch taken when it has already been told the story is standalone.

The earlier fix for this symptom (commit bc157a5) replaced an omitted flag with this definition-head lookup, which resolves ISSUE-anchored (bugfix) and DEF-anchored stories but not an LLD-only one. `completion-record.ts` uses the same `inheritedStandalone` lookup and has the same gap. The record's renderer titles on `meta.sizeClass`, which is why the missing size class also produces the "plan-driven" title.

## Fix intent

A BUILD record for a standalone story must be recognised as standalone and filed in the same folder as that story's other artifacts on every route, including the LLD-only small route. The route and size class the caller supplies to a standalone validate must reach the persisted record, and the route lookup shared by the validate and completion writers must resolve an LLD-only standalone story instead of returning nothing. The existing guarantees stay: only an explicit true is ever written for `standalone`, a prior true is never flipped by a later write, and DEF- and ISSUE-anchored stories resolve exactly as they do today. Tests must cover the first write for an LLD-only standalone story and assert the resulting BUILD.md path sits beside the LLD.

## Citations

- **[[c1]]** `code` `src/mcp/build-step/phases/validate.ts` — "return runValidateSession(repoPath, prompt, { epicHash, storyId, taskId: storyId }, summary);"
- **[[c2]]** `code` `src/mcp/build-step/phases/validate.ts` — "const standaloneFlag = inheritedStandalone(repoPath, epicHash);"
- **[[c3]]** `code` `src/workflow/storage.ts` — "for (const artifactId of [defineArtifactId(epicHash), issueArtifactId(epicHash)]) {"
- **[[c4]]** `code` `src/workflow/storage.ts` — "workItemKind: standalone ? 'standalone' : 'epic',"
- **[[c5]]** `code` `src/workflow/runners/build/completion-record.ts` — "const standaloneFlag = inheritedStandalone(repoPath, ref.epicHash);"
- **[[c6]]** `prior-artifact` `.insrc/artifacts/BUILD-c4c420c22b71651e-S001.json` — "as first written: meta = { workflow: 'build', epicHash, storyId, createdAt, updatedAt } with no standalone and no sizeClass"
- **[[c7]]** `prior-artifact` `ISSUE-43d72766d3b9a2c1` — "build-record-writer-mis-files-standalone"
