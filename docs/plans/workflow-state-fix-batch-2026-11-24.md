# Workflow-state fix batch (2026-11-24)

The open issues we agreed to fix now, drawn from GitHub (`insors-ai/insrc`) and the local `.insrc/artifacts/` ledger. All of them concern workflow states, the approval gate, or ISSUE-anchored (sized bugfix) routing — the cluster left over after ISSUE-149283b0d0455a43 ("story-list readers recognise an ISSUE-anchored work item", s1 built and code-reviewed 2026-11-16, commits `c04acd560`..`072965b06`).

Context from that story: a sized bugfix keeps `issue.meta.issueHash` as its anchor with the single implied story `s1` (`IMPLIED_ISSUE_STORY_ID` in `src/workflow/storage.ts`); `LLD-<issueHash>-s1`, `PLAN`, `BUILD` and `TESTS` live under `docs/standalone/<slug>-E<date><issueHash>/S001/`. The items below are the follow-ups that story explicitly deferred or that sit on the same code paths.

## 1. CDM-4: the brainstorm workflow fails with draft-failed

- **GitHub:** [#94](https://github.com/insors-ai/insrc/issues/94) (bug), tracked in `docs/plans/core-data-model-issues.md`.
- **Problem:** the `elicit` step of `insrc_workflow_step` with `workflow: brainstorm` failed twice with `draft-failed` ("the draftProvider could not produce a valid next decision after retries — the run stays paused"); the workflow had to be skipped for the core-data-model epic. The draft role is `brainstorm.decision.draft` (mid tier, via the role router).
- **Fix direction:** debug that role (its tier and model, prompt and schema) and add a test that drives a brainstorm run to completion.

## 2. A sized bugfix's LLD and PLAN go in a different docs folder from its ISSUE

- **GitHub:** [#90](https://github.com/insors-ai/insrc/issues/90).
- **Observed (2026-10-16):** ISSUE-67124d9a509d2bfd was written to `docs/standalone/<slug>-E2026101667124d9a/ISSUE.md`. After approval the bugfix chain advanced, but `design.story` was started with `epicSlug`, `storyId` and `storyTitle` and no hash, so the standalone run minted a new work-item hash (`3c6a109dffcde0c1`) and wrote LLD/PLAN to `docs/standalone/<slug>-E202610163c6a109d/S001/` — one work item in two folders. The auto-advance after issue approval stamps only `parentRef: { slug }` on the issue, not a hash, so nothing carries the issue's identity into the next stage.
- **Expected:** a sized bugfix's ISSUE, LLD, PLAN, BUILD and test record share one folder.
- **Not the same as** the label-fork defect (`docs/standalone/artifact-docs-folders-fork-per-stage-E20261003e20235c1/ISSUE.md`): there the identity segment was identical and the label changed; here the identity itself differs.
- **Unverified:** whether passing the issue's hash as a start param to `design.story` would reuse the folder; how the sized-bugfix route is meant to hand the issue's identity to `design.story` (no `nextCall` came back for `design.story` after approval).
- **Workaround used:** moved `ISSUE.md` into the LLD/PLAN folder by hand and updated the two path references.
- **Note:** the t2 work of ISSUE-149283b0d0455a43 (`next-after-issue.ts` now emits `storyId: 's1'` beside `epicHash = issueHash`) addresses the producer side of exactly this; this item tracks verifying/closing the folder-split behaviour end to end.

## 3. Make the tracker push, sync and post stages handle an ISSUE-anchored work item

- **Local:** ISSUE-`5f9d4ab4c90c0b4c` (draft) — the item explicitly deferred from ISSUE-149283b0d0455a43 ("ok, leave that for now").
- **Reproduction:** take a bugfix work item whose definition is an ISSUE with no DEF (e.g. ISSUE-149283b0d0455a43). The chain report suggests push-tracker once every story LLD is approved. Starting `insrc_workflow_step` with `workflow: tracker.push|sync|post` and `params.epicHash` = the ISSUE hash **fails at the context read**: `requireApprovedEpic` looks only for a DEF and throws `ArtifactMissingError` ("Define artifact not found … run define first"). The chain's own `readTrackerMeta` returns `pushed:false` for the same item, so it keeps suggesting a stage that throws.
- **Root cause:** all three tracker context assemblers (`assemblePushContext`, `assembleSyncContext`, `assemblePostContext`) read their Epic through `requireApprovedEpic` → `readDefineArtifact`, which only knows DEF files, and then use DEF-only fields (`epic.body.stories`, `epic.meta.tracker.milestoneRef`). The tracker resolver (`readEpicDefinition`) already reads DEF then ISSUE, and the issue-approval path already creates a GitHub issue for an approved ISSUE — the tracker stages and chain report use neither.
- **Expected:** an ISSUE is equivalent to a define in the chain, so tracker stages accept an ISSUE-anchored work item and the chain's tracker next actions are reachable for it.

## 4. insrc_present cannot resolve a standalone Story's BUILD record (no CR sibling → pending-list gate filters it out)

- **Local:** ISSUE-`16b8d3d50f14fc1d` (same defect as the short list's "insrc_present can't resolve a standalone BUILD (pending-list gate) → approval stalls").
- **Reproduction:** build a standalone (triage-routed small/trivial) Story through `insrc_build_step` validate, which writes `.insrc/artifacts/BUILD-<hash>-<story>.json` and `docs/standalone/<slug>/<story>/BUILD.md`. Calling `insrc_present({ documents: ["BUILD-<hash>-<story>"] })` always returns `{"presented":[],"notPending":[...]}` (reproduced 2026-10-31 with BUILD-7b6a5fa936278e5d-S001), so the chat review pane never opens the BUILD and the summary must be relayed as plain chat text before approval.
- **Root cause:** `handleInsrcPresent` (`src/mcp/server.ts:1197-1227`) → `pendingWorkflow` → daemon `workflow.pending` → `listPendingArtifacts` (`src/workflow/pending.ts:108-141`). For `kind === 'BUILD'` there is an extra precondition no other pending kind has: `if (kind === 'BUILD' && !names.has('CR' + file.slice('BUILD'.length))) continue;` (`pending.ts:123`) — a BUILD is listed only if a sibling `CR-<hash>-<story>.json` exists. Standalone builds never write a CR artifact (the automated code-review path doesn't run for them), so the BUILD is filtered out before `toDescriptor`/`buildRecordMdPath`, never enters the `openable` set, and `insrc_present` reports `notPending`. LLD/DEF/HLD/SPEC/PLAN/ISSUE have no such precondition — which is why the same standalone Story's LLD presented fine but its BUILD did not.
- **Expected:** a standalone BUILD record is presentable the same way a tracked epic's BUILD record is, once its Story's code review (when one runs) is accounted for, so the user can review the actual document before approving.

## 5. Support ISSUE-anchored bugfix roots in automatic tracker readiness

- **Local:** ISSUE-`467db7a3ef5e87a1` (draft) — sibling of item 3.
- **Reproduction:** with GitHub tracking enabled, approve a standalone sized defect ISSUE and synthesize its Story LLD. Observed 2026-11-21 for ISSUE-175ab0d1d56838a9 / LLD-175ab0d1d56838a9-s1: LLD written, but the response reported `issueReadiness.status=not-ready, kind=rejected, unit=epic, reason='cannot read the Define: Define artifact not found … DEF-175ab0d1d56838a9.json'`. No GitHub issue was created by that tracker step.
- **Root cause:** the automatic draft-readiness path in `src/workflow/tracker/unit-issue.ts` (`ensureUnitIssueDetailed`) unconditionally calls `readDefineArtifact` before deriving issue content; the catch returns "cannot read the Define". `src/workflow/draft-issues.ts` dispatches readiness; `src/workflow/bugfix/tracker.ts` already has ISSUE-specific creation/reuse — the failure is an integration mismatch, not a missing transport. Full downstream parent/Task behaviour needs design before implementation.
- **Expected:** recognize the actual ISSUE root and ensure/link the tracker issue idempotently, without synthetic upstream documents.

## 6. Approve does nothing on a review-blocked document in the VS Code review pane

- **Local:** ISSUE-`525d36b5d84c68bb` (draft).
- **Reproduction:** open a pending DEF/HLD/LLD in the VS Code docs-review pane whose latest daemon review is a `block` (seen 2026-10-19 on HLD-8315a11f29fd2812). Click Approve: nothing happens, no decision recorded, no message to chat, button looks enabled; the only hint is the state line "pending review · blocked: it cannot be approved".
- **Root cause (two parts):** (1) the client maps the artifact-content result to `blocked = !res.approvable` (`vscode-plugin/src/chat/docs-review-client.ts:151`) and the webview sets `btn.approve.disabled` whenever blocked is set (`docs-review-panel.ts:2027`), so the click fires no event; (2) even enabled, there is no override path in the pane: decisions go through the daemon's `workflow.reviewDecision` call whose params are only `repo, mdPath, decision, comments` (`src/workflow/review-decision.ts:103`), so a review-blocked document can only be withheld; an override reason can be given only through the chat's `insrc_workflow_approve`.
- **Expected:** the pane says plainly that the review blocks approval and that approval needs an override reason, and either lets the reviewer approve with that reason or hands the decision to the chat.

## 7. Approving a BUILD record with uncommitted files replaces the Story's change log with those files

- **Local:** ISSUE-`9bf89afcc1bf58b1` (draft).
- **Reproduction:** build a Story whose BUILD record carries a change log (2026-10-05: BUILD-1716f77ba9ba017b-s1 listed 75 files), commit the work, leave any unrelated file uncommitted (that day: CLAUDE.md, AGENTS.md re-stamped by a daemon restart, plus the code-review json/md), then approve the BUILD via `approveWorkflowTarget`. Observed: the change log now lists only the 4 uncommitted files; the 75 entries are gone.
- **Root cause (two behaviours):** (1) the approval-time writer `ensureBuildRecordOnCompletion` always recomputes a change log; `changedFiles` returns the working-tree set whenever it is non-empty and only reads the Story's committed range (base..HEAD) when the tree is clean — so any dirty file shrinks the list to just those files; (2) `mergeWithPrior` spreads prior body then new body, so a new `changeLog` replaces the stored one outright (only `tasks` is union-merged).
- **Expected:** approval leaves the Story's change log as the build recorded it, or adds to it; it never drops entries.

## Ordering notes

- Items 3 + 5 are one fix area (ISSUE-anchored roots in tracker paths: the three stage context assemblers, `readTrackerMeta` in the chain, and `ensureUnitIssueDetailed` in unit-issue.ts) — the deferred follow-up of the just-finished story.
- Item 2 is the folder-split half of the same ISSUE-anchored route; verify against the t2 producer fix already on `v2`.
- Item 4 gates BUILD approval UX for standalone stories and blocked the present→approve flow we hit in this session's BUILD presentation.
- Items 6 + 7 are approval-gate defects in different surfaces (VS Code pane override path; approval-time change-log overwrite).
- Item 1 is independent (brainstorm draft role).
