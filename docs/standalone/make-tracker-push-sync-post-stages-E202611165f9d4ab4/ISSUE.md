<!-- insrc:artifact ISSUE-5f9d4ab4c90c0b4c -->

# Make the tracker push, sync and post stages handle an ISSUE-anchored work item

## Reproduction

1. Take a bugfix work item whose definition artifact is an ISSUE with no DEF (for example ISSUE-149283b0d0455a43, once its story s1 LLD is approved).
2. Ask the chain for the next action: the chain report suggests push-tracker once every story LLD is approved, or run-define when no DEF exists.
3. Start insrc_workflow_step with workflow tracker.push, tracker.sync or tracker.post and params.epicHash set to the ISSUE hash.
OBSERVED: the stage fails at its context read, because requireApprovedEpic looks only for a DEF and throws ArtifactMissingError ('Define artifact not found ... Run insrc_workflow_step workflow=define first'). The chain's own tracker read (readTrackerMeta) returns pushed:false for the same item, so it keeps suggesting push-tracker for an item that can never be pushed.
EXPECTED: an ISSUE is equivalent to a define in the chain, so the tracker stages accept an ISSUE-anchored work item and the chain's tracker next actions are reachable for it.

## Root cause

All three tracker context assemblers read their Epic through requireApprovedEpic, which wraps readDefineArtifact and so only knows DEF files. assemblePushContext, assembleSyncContext and assemblePostContext each call it first, and then use DEF-only fields (epic.body.stories, epic.meta.tracker.milestoneRef). The chain report's readTrackerMeta takes the Define as a parameter and returns pushed:false when there is none, so for an ISSUE-anchored item the chain can neither show the tracker state nor reach chain-complete without being pointed at a stage that throws.
The tracker resolver (readEpicDefinition) already reads DEF then ISSUE, and the issue-approval path (bugfix advance) already creates a GitHub issue for an approved ISSUE, so the codebase has an ISSUE-aware read and a separate ISSUE-to-GitHub path; the three tracker stages and the chain report use neither.

## Fix intent

The tracker push, sync and post stages should accept an ISSUE-anchored work item as they accept a DEF-anchored one, and the chain report's tracker reading and push-tracker / sync-tracker next actions should be correct for it.
Deliberately not settled here, because it is the design decision this defect turns on: what an ISSUE pushes as (the ISSUE is already filed to GitHub at approval, so whether tracker.push re-files, links or only syncs the existing issue and its story), which stages need an ISSUE-aware reader and which should keep refusing one, and how this reuses the one implied-story rule from ISSUE-149283b0d0455a43 rather than a second copy. That belongs in an LLD with its alternatives written down.
Out of scope and owned elsewhere: the ISSUE-anchored chain report story list and the producer of the sized route, which are ISSUE-149283b0d0455a43.

## Citations

- **[[c1]]** `code` `src/workflow/runners/tracker/context.ts:43` — "const epic = requireApprovedEpic(ctx.intent.repoPath, epicHash);"
- **[[c2]]** `code` `src/workflow/runners/tracker/context.ts:116` — "const epic = requireApprovedEpic(ctx.intent.repoPath, epicHash);"
- **[[c3]]** `code` `src/workflow/runners/tracker/context.ts:147` — "const epic = requireApprovedEpic(ctx.intent.repoPath, epicHash);"
- **[[c4]]** `code` `src/workflow/gates.ts:233` — "export function requireApprovedEpic(repoPath: string, epicHash: string): DefineArtifact {"
- **[[c5]]** `code` `src/workflow/chain.ts:233` — "if (define === undefined) return { pushed: false };"
- **[[c6]]** `code` `src/workflow/tracker/resolve.ts:209` — "export function readEpicDefinition(dir: string, epicHash: string): EpicDefinition | null"
- **[[c7]]** `code` `src/workflow/bugfix/advance.ts:62` — "const nextCall = nextAfterIssue(stamped, input.repo);"
- **[[c8]]** `prior-artifact` `ISSUE-149283b0d0455a43 — the approved companion defect whose LLD leaves the tracker next actions out of scope`
