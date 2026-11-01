# Self-review of LLD-64703b708590bd68-s1 (reject file-modifying daemon calls that do not name their repo), by the controller

**Not a review by the other party.** The controller authored this LLD through `insrc_workflow_step`; the design-review engine is unavailable and the user decided on 2026-11-01 that the controller reviews designs itself until it works. Approval needs an `overrideReview` naming this file and the user's explicit yes, and an ABSOLUTE `artifactPath` with `repo` (a relative path approves into `~/.insrc/daemon`, the very defect this LLD fixes).

Date: 2026-11-02. Method: each claim checked against the tree (`src/daemon/handler-runtime.ts`, `workflow-approve.ts`, `lifecycle-registry.ts`, `src/mcp/server.ts`, `resolve-repo.ts`, `repo-schema-guard.ts`).

## Checked

- The mechanism is as the issue says. `handleWorkflowApprove` takes the repository of a single artifact from the path (`repoOfArtifactPath`, which walks up with `existsSync`), so a relative path resolves against the daemon's working directory. The MCP handler forwards `repo ?? ''` and the path as given, and refuses only an epicHash batch with no repo.
- The registry passes `process.env['INSRC_REPO']` (the daemon's own environment) to about twenty methods.

## Findings

- **MED-1.** The gate must run for the MCP-side path as well: `insrc_workflow_approve` must send an absolute `artifactPath` and refuse when it cannot resolve an absolute repo (migration step 2). If step 3 is released before step 2, every agent without an explicit repo is refused. The migration order in the LLD says so (prerequisite flag); the plan must keep it.
- **MED-2.** The step handlers resolve the repo from the caller's cwd and INSRC_REPO in the step context (`src/shared/step-context.ts`). The LLD says their modifying phases get the same gate and that a later phase takes the repo from its run token, but which phases modify files was not checked one by one (sbdry4 partial). The plan's first task must list them by reading the registry and the step handlers.
- **LOW-1.** The Story has no acceptance criteria; ac1 to ac4 in the test mapping stand for the four requirements of the issue.
- **LOW-2.** A registry failure refuses the call (stated). The gate needs the registered set per call; if `repo.list` is slow this adds latency to every modifying call; cache with a short life or read the in-process registry (plan decides).
- **LOW-3.** Migration step 5 (reset the daemon clone) was already done by hand on 2026-11-02 for the two known stray approvals.

## Verdict

warn. No HIGH finding. The design meets the four requirements of the issue; MED-1 and MED-2 are sequencing and completeness points for the plan.
