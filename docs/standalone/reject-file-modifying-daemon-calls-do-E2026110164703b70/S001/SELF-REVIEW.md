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

---

# Self-review of the Story code (BUILD), by the controller

**Not a review by the other party.** The controller wrote this code through `insrc_build_step`; `insrc_code_review_step` throws `PENDING REVIEW RE-IMPLEMENTATION` and the user decided on 2026-11-01 that the controller reviews code itself until it works. Completing the BUILD needs `overrideReview` naming this file and the user's explicit yes, an ABSOLUTE `artifactPath` and `repo`.

Date: 2026-11-02. Subject: tasks t1 to t8 on `v2` (commits `91846d958` to `832d2c690`). Method: the daemon's gate of each task (typecheck, the named tests it ran, a read-only verdict session), one findings round on t5, the full sweep compared by test name with the tree before the fix (`docs/plans/repo-gate-outcome.md`), and my reading of the failures it found.

## Adherence

- Every requirement of the issue holds in the tests: a file-modifying call with no repo is refused before any handler runs (RPC, stream and step tools); the daemon never reads its `INSRC_REPO` or working directory for such a call; the repo must be absolute, a directory and registered; paths are joined to it and must stay inside it, symlinks included; a table built from the audit lists the calls, and a test fails when a registered method is in neither the table nor the reviewed list.
- The 2026-11-01 case has its own test on real stores (`approve-repo-gate.test.ts`).
- Deviations (all in the outcome document): a sixth code `repo-mismatch`, `artifact.feedback.append` takes a `repo`, the forwarder makes the repo explicit for the workflow and build step tools only, `mcp-process-e2e` registers the repo and compares the analyzer prompt without the size letter.

## Conventions

- ESM `.js` imports, `import type`, strict options: `tsc --noEmit` clean at every gate. No `console.log`. The gate returns results and does not throw, apart from the stream wrapper, which throws on purpose to produce the server's error frame.

## Coverage

- Unit and integration tests for the gate, the table, the approval family, every table method called without a repo, the step host, the clients and the documentation. The full sweep found no new failure and no new skip against the tree before the fix.
- Gap: the audit classified the read-only and daemon-store groups by reading each registration and its delegate, not with the analyzer's call closure for every handler (stated in the audit). A handler found writing under a repository would be misclassified until the table is fixed.
- Gap: no test runs a real MCP session against a real daemon for a refused call (the mcp-process-e2e test covers an accepted call with a registered repo).

## Quality

- **MED-1 (critical to act on).** The installed daemon at `~/.insrc/daemon` runs the old code until it is updated and restarted; the 2026-11-01 misrouting remains possible through it until then.
- **MED-2.** Clients outside this repository that call a gated method without `repo` (an editor plugin calling `artifact.feedback.append`; any script that relied on the daemon's `INSRC_REPO`) are refused now. This is the requested behaviour but breaks them.
- **LOW-1.** The registry is read once per gated call (a `listRepos` over the graph store); fine for these call rates, a short-lived cache is a later option.
- **LOW-2.** A step call whose state token cannot be decoded is passed to the step, which reports it and writes nothing; the gate does not refuse it.
- **LOW-3.** `insrc_present`, `insrc_docgen`, analyze and triage tool descriptions still say `repo` falls back to the session workspace or `INSRC_REPO`; correct for them (read-only), but a reader may be confused.

## Verdict

warn. No HIGH finding. MED-1 and MED-2 are about rollout, not the code.
