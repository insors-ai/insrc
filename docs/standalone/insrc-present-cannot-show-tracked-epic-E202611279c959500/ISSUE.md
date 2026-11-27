<!-- insrc:artifact ISSUE-9c95950064e4b916 -->

# insrc_present cannot show a tracked-epic BUILD record (or any artifact its underlying pending-list rule excludes), blocking approval even when the artifact's real lifecycle status is a normal pre-approval draft

## Reproduction

Call insrc_present with the artifact id (e.g. BUILD-<hash>-s1) or either of its repo-relative/absolute doc paths for a tracked-epic Story's BUILD record whose lifecycle status is 'draft' (never approved or rejected). Expected: the name comes back in `presented`, since the document exists and names exactly one real artifact. Observed: it comes back in `notPending` for every such BUILD, with no way to open or present it — even though its lifecycle status alone would normally qualify it as pre-approval/presentable.

## Root cause

insrc_present's handler (src/mcp/server.ts:1105-1140) builds its entire openable set from `pending.artifacts` (src/mcp/server.ts:1131), which it reads via `pendingWorkflow` from the daemon's `workflow.pending` method, backed by `listPendingArtifacts` (src/workflow/pending.ts:116-157). That function's filter is not just a lifecycle check: beyond requiring the artifact's approval state to be 'pending' (src/workflow/pending.ts:143), it adds an orthogonal business rule at src/workflow/pending.ts:152 — a non-standalone (tracked-epic) BUILD is excluded unless a sibling `CR-<hash>-<story>.json` code-review record already exists alongside it. That CR sibling can only be created by the code-review workflow, and every codeReview.*/designReview.* IPC method now unconditionally returns a review-unavailable error (src/daemon/handler-runtime.ts:709-728), per the project's own current governance: automated review is disabled project-wide while it is being rewritten. With no CR sibling ever possible, every tracked-epic Story's BUILD record is permanently excluded from `pending.artifacts`, so insrc_present reports it as notPending regardless of its real lifecycle status. The deeper issue is a conflation: insrc_present's only job should be answering 'can I open/show this single, existing, unambiguous document' (a presentation concern), but it is wired directly to listPendingArtifacts, a function whose actual purpose (per its own module doc at src/workflow/pending.ts:6-20, written for the IDE plugins' review panel, Story E20261013dd277f9c:S001) is a different, narrower question: 'is this artifact awaiting an approval decision right now' (an actionability concern, further narrowed by the CR-sibling readiness rule). Because insrc_present has no lookup of its own, it inherits every one of listPendingArtifacts' business rules — including one (the CR-sibling check) that has become permanently unsatisfiable — as if they were presentation rules.

## Fix intent

Give insrc_present's openability check its own resolution path, independent of listPendingArtifacts' pending/CR-readiness business rules: a named document (by artifact id or by path) should be presentable whenever it resolves to exactly one real, existing artifact record on disk, regardless of that artifact's current lifecycle status or any CR-sibling precondition. listPendingArtifacts itself is NOT to be relaxed or have its CR-sibling rule removed — it must keep its current 'awaiting an approval decision' semantics intact for its other real consumer, the IDE plugins' review panel. Whether a presented document's approve/reject action is actually available stays a separate, already-correct concern, governed by the artifact's own lifecycle status and the normal insrc_workflow_approve gate — presenting it is purely a display action and carries no approval risk.

## Citations

- **[[c1]]** `code` `src/mcp/server.ts:1105-1140` — "const pending = await pendingWorkflow({ repo }, deps); ... const openable = pending.artifacts; ... const presented = names.filter((n) => openable.filter((a) => namesPending(n, a)).length === 1);"
- **[[c2]]** `code` `src/workflow/pending.ts:116-157` — "if (kind === 'BUILD' && meta['standalone'] !== true && !names.has(`CR${file.slice('BUILD'.length)}`)) continue;"
- **[[c3]]** `code` `src/workflow/pending.ts:6-20`
- **[[c4]]** `code` `src/workflow/pending.ts:37-45`
- **[[c5]]** `code` `src/daemon/handler-runtime.ts:709-728`
