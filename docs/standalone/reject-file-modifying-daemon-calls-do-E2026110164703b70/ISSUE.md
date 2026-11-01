<!-- insrc:artifact ISSUE-64703b708590bd68 -->

# Reject file-modifying daemon calls that do not name their repo

## Reproduction

1. Call insrc_workflow_approve with a relative artifactPath (for example .insrc/artifacts/LLD-315d510cb28100e2-s9.json) and no repo from a session whose workspace is a development checkout. 2. The daemon resolves the path against its own checkout, ~/.insrc/daemon, and approves the daemon's copy: the approval, its log entry and any follow-on records are written there, and the approval can name a revision the development repo never had. 3. The call reports success, so nothing tells the caller that the wrong repository was changed. Observed on 2026-11-01 for the approvals of the tool-registry s9 BUILD and the team-signoff s9 LLD. Expected: the call is refused with an error saying a repo is required.

## Root cause

A call that names no repo falls back to the daemon process's own environment and working directory instead of the caller's. In the daemon's handler registry the file-modifying methods are registered with process.env['INSRC_REPO'] as the fallback repo (workflow.approve, the approve pipeline, repo convert, tracker attach, tracker comment sync, artifact feedback and others), and that variable belongs to the daemon process, not to the session that called. handleWorkflowApprove goes further: for a single artifact it ignores the request's repo and takes the repository from the artifact path itself (repoOfArtifactPath), so a relative path is resolved against the daemon's working directory. The same fallback to INSRC_REPO or the session workspace is repeated in about 28 daemon files, with a different message each, and no common rule says which calls modify files and therefore must name an absolute registered repo.

## Fix intent

Make an explicit repo mandatory for every daemon call that modifies files: the call is refused with an error naming the missing repo when it has none, and the daemon's own INSRC_REPO, the session workspace and the daemon's working directory are no longer a fallback for such calls. The repo must be an absolute path to a registered repository, and every artifact or file path in the call must resolve inside it; a relative artifact path is resolved against the named repo, never against the daemon's directory. The rule lives in one shared place that each file-modifying handler uses, so a new handler cannot skip it, and read-only calls are not affected. The MCP server and the terminal client always send the repo. The set of calls that modify files is listed in the design and covered by a test per call.

## Citations

- **[[c1]]** `code` `src/daemon/handler-runtime.ts:449`
- **[[c2]]** `code` `src/daemon/workflow-approve.ts:32-40`
- **[[c3]]** `code` `src/daemon/repo-schema-guard.ts:43`
- **[[c4]]** `code` `src/daemon/repo-convert.ts:37`
- **[[c5]]** `code` `src/daemon/tracker-attach.ts:34`
- **[[c6]]** `code` `src/daemon/tracker-sync-comments.ts:35`
- **[[c7]]** `code` `src/daemon/workflow-rpc.ts:418-420`
