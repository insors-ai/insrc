# Which daemon calls modify files in a user repository (audit for the repo gate)

Written by task t1 of Story `64703b708590bd68/s1` (ISSUE-64703b708590bd68). The data is `src/daemon/repo-call-audit.ts`; `src/daemon/__tests__/repo-call-audit.test.ts` checks that it lists exactly the methods registered in `src/daemon/handler-runtime.ts` and the phase files of each step. The gate (t2) is built from the `modifying` entries.

Counts (RPC modifying, read-only, daemon-store | step phases modifying, read-only): 26 47 66 | 10 7

Method of the audit: each handler was read from its source; a method is `modifying` when it writes artifacts, records, config files or branches inside a user repository; `read-only` when it only reads; `daemon-store` when it writes only the daemon's own stores under `~/.insrc` (graph, vectors, sessions, todos, config, keys, connections) or changes the registry/index queue without writing a repository file. The analyzer's call closure was not run for every handler: the entries of the `daemon-store` and `read-only` groups were classified by reading the handler registration and the module it delegates to (the group is named in the evidence). A wrong classification is caught by the gate tests when a handler is found writing under a repository.

## Scope decision (for the user)

The rule covers writes under a user repository. `config.*`, `keys.*`, `session.*`, `conversation.*`, `todos.*`, `db.*`, `docSummary.*`, `agent.*`, `repo.add|remove|reindex` and `index.file` write the daemon's own stores or its registry and queue, so they are **outside** the rule and get no repo requirement. `repo.add` is where a repository becomes registered; the gate's "registered" test depends on it. Tell the build if you want any of these inside the rule.

## Findings of the audit

- `artifact.feedback.append` takes **no repo at all**: it resolves `artifactPath` against the daemon's working directory (`resolve(artifactPath)`) and finds the repository by walking up (`repoOfArtifactPath`): the same defect as the approval. The gate adds a `repo` param for it.
- `team.*`, `tracker.sync`, `tracker.setup`, `workflow.reviewArtifact` and `workflow.resolveFinding` already **require** `repoPath` and have no fallback; they use the param name `repoPath`, not `repo`. The table records the name per method. `codeReview.task.*` already requires an absolute `repo`.
- `tracker.attach`, `tracker.syncComments`, `repo.convert`, `workflow.resolveComment`, `workflow.reviewDecision`, `artifact.feedback.add`, `workflow.approve`, `workflow.approvePipeline`, `workflow.run` and `workflow.run.start` fall back to the daemon's `INSRC_REPO`.
- `workflow.review` and `codeReview.run` still point at the removed review engines; they stay in the table so a restored engine is covered.
- The step phases of `workflow-step`, `build-step` resolve the repo from the caller's workspace (`resolveRepoPath`, the caller's cwd and `INSRC_REPO`), or continue a run by its state token. `review-step` has no phase files and `code-review-step` has none; `analyze-step` and `triage-step` write nothing under a repository (the analyze debug trace goes to `TRACE_PATH`).

## RPC methods that modify files

| Method | Repo param | Path params | Repo from | Evidence |
| :--- | :--- | :--- | :--- | :--- |
| `artifact.feedback.add` | `repo` | — |  | feedback-handlers.ts:32-35 takes repo from the call or INSRC_REPO and records the entry through the repository's FeedbackService |
| `artifact.feedback.append` | `repo` | `artifactPath` |  | feedback-handlers.ts:88-92 takes no repo: it resolves artifactPath against the daemon's cwd (resolve) and finds the repository with repoOfArtifactPath; writes the entry into that repository |
| `codeReview.run` | `repo` | — |  | code-review-rpc.ts persists the CR record of a story; the engine is removed (PENDING REVIEW RE-IMPLEMENTATION), the contract is kept |
| `codeReview.task.activity` | `repo` | — |  | task-review-rpc.ts exchangeControllerTask* write controller activity into the review checkpoint of the repository |
| `codeReview.task.assignment` | `repo` | — |  | task-review-rpc.ts exchangeControllerTask* write the assignment into the review checkpoint of the repository |
| `codeReview.task.publish` | `repo` | — |  | task-review-rpc.ts publishStoredTaskReview publishes a stored review record of the repository |
| `codeReview.task.result` | `repo` | — |  | task-review-rpc.ts exchangeControllerTask* write the result into the review checkpoint of the repository |
| `codeReview.task.scope` | `repo` | — |  | task-review-rpc.ts exchangeControllerTask* write the scope into the review checkpoint of the repository |
| `codeReview.task.start` | `repo` | — |  | task-review-rpc.ts:24-45 requires an absolute repo, realpaths it and writes the review checkpoint under it |
| `repo.convert` | `repo` | — |  | repo-convert.ts:36-53 converts a repository's artifacts to the current schema in apply mode; repo falls back to INSRC_REPO |
| `team.claim` | `repoPath` | — |  | team-review-handlers.ts:64-66 claims a unit and records it in the repository's artifacts; repoPath is required |
| `team.refresh` | `repoPath` | — |  | team-review-handlers.ts:50-52 fetches the policy and writes the sighting record under the repository; repoPath is required (repoOf) |
| `team.release` | `repoPath` | — |  | team-review-handlers.ts:70-72 releases a unit and records it in the repository's artifacts; repoPath is required |
| `tracker.attach` | `repo` | — |  | tracker-attach.ts:33-44 attaches documents to the unit's issue and records the links in the artifacts; repo falls back to INSRC_REPO |
| `tracker.setup` | `repoPath` | — |  | tracker-setup-handlers.ts:35-52 writes github.json through repo.trackerConfig.ensure and runs the checklist; repoPath is required |
| `tracker.sync` | `repoPath` | — |  | tracker-setup-handlers.ts:15-19 -> syncTracker patches meta.tracker in the Define; repoPath is required |
| `tracker.syncComments` | `repo` | — |  | tracker-sync-comments.ts:34-51 reads issue comments into the repository's feedback store; repo falls back to INSRC_REPO |
| `workflow.approve` | `repo` | `artifactPath` |  | workflow-approve.ts:28-62 approves in the repository's lifecycle store; repo falls back to the daemon's INSRC_REPO and a single artifact takes its repository from the path |
| `workflow.approvePipeline` | `repo` | `artifactPath` |  | approve-pipeline.ts runs the approval, the task reconciliation and the follow-ons (publish, attach, check-in) in the repository; repo from handler-runtime.ts:456 falls back to INSRC_REPO |
| `workflow.resolveComment` | `repo` | — |  | resolve-comment.ts:134-165 records resolutions in the artifact JSON found by artifactJsonPath(repoPath, artifactId); repo falls back to INSRC_REPO |
| `workflow.resolveFinding` | `repoPath` | — |  | team-review-handlers.ts:87 resolves a review finding on an artifact; today it answers reviewUnavailable, the contract is kept |
| `workflow.review` | `repo` | `artifactPath` |  | workflow-review-rpc.ts reviews an existing design artifact and records the review in its lifecycle; the daemon review is unavailable today, the contract is kept |
| `workflow.reviewArtifact` | `repoPath` | `artifactPath` |  | team-review-handlers.ts:81-84 reviews and stamps an artifact; today it answers reviewUnavailable, the contract is kept |
| `workflow.reviewDecision` | `repo` | `mdPath` |  | review-decision.ts:65-70 records a decision and feedback entries through the repository's services; repo falls back to INSRC_REPO |
| `workflow.run` | `repo` | — |  | workflow-rpc.ts:376,418-420 runs a workflow end to end and writes its artifacts into the repository; repo falls back to INSRC_REPO |
| `workflow.run.start` | `repo` | — |  | handler-runtime.ts:1572 starts the same run asynchronously; repo falls back to INSRC_REPO (workflow-rpc.ts:418-420) |

## Step phases that modify files

| Phase | Repo param | Path params | Repo from | Evidence |
| :--- | :--- | :--- | :--- | :--- |
| `workflow-step.start` | `repo` | — |  | phases/start.ts:44 resolves the repo (explicit, then the caller's workspace or INSRC_REPO) and settles signoff, preflights questions and starts a run that writes run records |
| `workflow-step.plan` | `repo` | — | run token | phases/plan.ts continues a run by its state token; writes the run state |
| `workflow-step.step` | `repo` | — | run token | phases/step.ts continues a run by its state token (state.ts decodeState) |
| `workflow-step.synthesize` | `repo` | — | run token | phases/synthesize.ts writes the artifact (writeArtifact) and runs the draft-issue hook |
| `workflow-step.resolve_question` | `repo` | — |  | phases/resolve-question.ts patches the upstream artifact with the chosen resolution; resolves repo with resolveRepoPath |
| `workflow-step.park` | `repo` | — |  | phases/park.ts commits a unit's drafts and a checkpoint to a handoff branch |
| `workflow-step.resume` | `repo` | — |  | phases/resume.ts restores drafts from the handoff branch into the work tree |
| `workflow-step.settle` | `repo` | — |  | phases/settle.ts settles a signoff request and records the outcome in the artifact |
| `build-step.implement` | `repo` | — |  | phases/implement.ts:85,115 noteBuildStart writes .insrc/build-start/<epic>-<story>.json |
| `build-step.validate` | `repo` | — |  | phases/validate.ts writes the BUILD and TESTS records of the Story |
