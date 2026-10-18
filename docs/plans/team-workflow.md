# Plan: Team-compatible workflow

Makes the insrc workflow usable by a team. Today it is single-user: one
in-chat "yes" approves an artifact, there is no notion of who owns an item, and
daemon state is per machine. This plan adds team signoff, claim-based
assignment and a policy/config split, without changing solo behavior.

Status: brainstorm converged in chat (2026-10-16); not yet triaged. This doc
is the input for `insrc_triage` (expected size: epic).

## Why this replaces the daemon's brainstorm spec

The brainstorm run (`insrc_workflow_step` workflow `brainstorm`) recorded the
14 decisions below, but its working-understanding text drifted from them (it
still describes a committed `.insrc/team.json`, one PR per artifact and
GitHub-specific PRs). That run is left unconfirmed; this doc is authoritative.

## Three layers, kept separate

| Layer | Who | Purpose | Record | Gates |
|---|---|---|---|---|
| Other-party review | daemon vs controller (models) | independence of the model check | `meta.review` (unchanged) | local approval |
| Local approval | current user + LLM | "ready to put forward" | `approvedAt` (unchanged) | opening the signoff request |
| Signoff | third-party humans, in the tracker | team agreement to advance | new (`signoffs[]`) | advancing to the next stage |

Signoff is never called a "review" in insrc terms and cannot satisfy or count
toward `meta.review`, nor the reverse. Order for a signoff-required stage:
other-party review, local approval, signoff request opened, completion.

## Decisions

1. **Tracker:** GitHub first. Identity, assignment and signoff sit behind a
   pluggable, capability-based tracker interface. GitLab and Jira adapters come
   later. Adapters are CLI-first and hardened (`gh`, `glab`; a thin REST client
   for Jira) with structured output and contract tests. No direct cloud REST
   for GitHub/GitLab. Enforcement lives in the daemon, never in host-agent MCP
   connectors (coverage differs between Claude Code and Codex).
2. **Capabilities:** claim/assign, issue create, signoff request, completion
   detection. An adapter missing a capability the policy needs is rejected at
   load (fail fast); no degraded operation.
3. **Signoff request, not "PR":** the PR concept is abstracted. GitHub = pull
   request, GitLab = merge request, Jira = approval. "Merge" below means the
   adapter's completion event. Jira approval support and how an approval
   references artifact content must be verified in design.
4. **Signoff unit:** the signoff request. Approving it signs off every artifact
   it contains. The author chooses its contents (default: one design artifact
   per request; a Story's code with BUILD/TESTS/code-review records in one code
   request; bundling an Epic's design set is allowed). No partial signoff: split
   the request instead.
5. **Reviewer validity is external:** who may approve, how many, bots, stale
   dismissal and overrides are managed in GitHub/GitLab/Jira. insrc only asks
   "did the request complete?". No insrc-side reviewer rules.
6. **Advance trigger:** completion (merge) of the signoff request, checked on
   demand through the adapter. No polling or webhooks. The next stage cannot
   start until the artifact request has completed. There is no provisional mode
   (starting the next stage before signoff completes); every gated transition
   blocks, and no staleness tracking is needed.
7. **Feedback loop:** a revision requested on an open request is made on its
   branch, goes back through local approval, then is pushed.
8. **Claims:** the assignee of the stage unit's tracker issue is the lock.
   Self-claim by anyone the tracker lets assign (no insrc-side eligibility).
   Hard block on all mutating actions (authoring steps, build, local approve,
   opening the signoff request) for anyone but the assignee; read-only analyze
   and review stay open. Release is explicit only (assignee or an admin
   override); no stale-claim takeover. Auto-release when completion is detected.
   Assignment made directly in the tracker is honoured; the assignee is read
   live at each stage turn, never cached.
9. **Claim units** (policy): Epic stage = DEF + HLD on the Epic issue; Story
   design stage = LLD + PLAN on the Story issue; Build = one claim per Task on
   the Task issue. Task issues must therefore exist in team mode (the existing
   `pushTasks` option, default off, is forced on).
10. **Stage issue creation:** automatic when the stage's artifact is first
    drafted (required for Jira). The existing label-based find-or-create in
    `workflow/tracker-auto.ts` is the dedupe mechanism.
11. **Reassignment mid-stage:** the previous assignee's next turn is refused and
    offered a park step: commit the draft to a handoff branch and note it on the
    issue so the new assignee can resume. Constraint: in-flight workflow state
    must be reconstructable from committed files (today parts live only in the
    opaque `state` token and the local daemon).
12. **Runtime:** each developer keeps their own daemon and index. Repo files and
    the tracker are the shared truth. A shared team daemon is out of scope.

## Policy vs config

| | Policy | Config |
|---|---|---|
| Contents | team mode on/off, `signoffStages` (starter default: DEF, HLD, LLD, BUILD completion), claim enforcement, claim units | adapter and target override, `gh`/`glab` binary and auth, branch prefix, `commitArtifacts` |
| Where | a file in the repo (e.g. `.insrc/policy.json`) read from the **remote default branch ref**, never the working tree | per-repo entry in `~/.insrc/github.json` (extended), per-user items in the user config |
| Override | none locally; changed by a reviewed change under the tracker's own rules | by each developer, via the VS Code and TUI settings |
| Surface | edited as a file; `insrc team init` writes the starter profile | added to the daemon `CONFIG_CATALOG` (rendered via `config.catalog` in VS Code and the TUI Setup pane) |

Tracker target defaults to the git remote (existing `source: 'git-remote'`
resolution in `workflow/config/github.ts`); Jira declares site and project.
Repos without the policy file behave exactly as today (solo mode).

## Known limitations

- **Bootstrap (accepted 2026-10-17, s2 LLD override):** a repo with no
  sighting and nothing fetched has no local evidence of a policy and is treated
  as solo until `team refresh` has run once. This refines the offline rule
  (DEF ac9) and is consistent with k4; refusal applies once a repo is known to
  carry a policy (a sighting exists, or a fetched tracking ref carries the file
  while the default branch is unknown, in which case the user is asked to run
  `team refresh --branch <name>`).
- **s1 compatibility exceptions (accepted 2026-10-17, s1 LLD approval):** the
  tracker port's results are the same as before (DEF ac3, k4) except (1) a typed
  issue create is retried untyped only on a confirmed issue-type rejection, not
  after any failure (removes a duplicate-issue hazard), and (2) migrated
  operations, including setup label creation and the login read in
  `listMyOpenTasks`, are bounded by the 10 s timeout. Both reach solo callers.
  The unbuilt tracker-tool LLD-38436e90625a83a2-S001 is superseded by s1; its
  companion LLD-9a7bbe63297457c2-S001 needs its own decision.
- **s3 sign-in reading (accepted 2026-10-17, s3 LLD):** DEF ac10 and ac11 say a
  developer can "see and edit ... sign-in". insrc stores no secrets and sign-in
  stays with the tracker's CLI (HLD security), so sign-in is shown as a live
  read-only status (signed in as X, not signed in, gh not found, timed out) and
  the editable part is `ghHost`, the host `gh` signs in to. No client changes
  sign-in. `ghPath`, `ghHost` and `branchPattern` are stored and shown only;
  their consumers are an s1 follow-up (gh runner) and s6 (branch naming), and the
  rows say "saved; not used yet" until then.
- **s3 single writer of github.json (accepted 2026-10-17, s3 LLD revision 12):**
  the daemon is the only process that writes `~/.insrc/github.json`, through one
  in-process queue with a verify-before-rename check; there is no cross-process
  lock. This supersedes the earlier answer to question sg4 (tracker setup stays
  on a shared direct writer): the terminal `trackerSetup` becomes asynchronous
  and asks the daemon (`repo.trackerConfig.ensure`) through an `rpc` with an
  opt-in deadline, and the setup config step is reported failed if the daemon is
  not running. Edits by processes outside the daemon are detected only on a
  best-effort basis. s3 also consumes the tracker port (sc1) through s1's
  adapter to read the signed-in login; the HLD boundary for s3 lists sc2 only
  (no HLD amendment filed). The `branchPattern` grammar lives in the s3 field
  table: placeholders `{id}`, `{slug}`, `{type}` only; s6 reads that definition.
- **s3 LLD approval (2026-10-17):** approved with a review override. The one open
  finding was wording: the 15 s deadline bounds only the config call, not the
  whole tracker setup. The plan and build correct that wording and scope the
  timeout tests to the config call.
- **s3 BUILD approval (2026-10-17):** approved with a code-review override. The review
  blocked on 19 HIGH coverage findings that are empty-grounding gaps (the graph has no
  test-to-symbol edges for the new files, even after a reindex), not defects; every promised
  test exists and passes. The one real MED (the JetBrains policy DTO dropped the policy
  source) was fixed in round 2. `codeReview.enforce` is off, so the block was advisory.
  Follow-ups: why the index records no test edges for new files; the s1 gh-runner follow-up
  so `ghPath` and `ghHost` take effect; s6 consumes `branchPattern`. The JetBrains tests run
  under JDK 21 (`jetbrains-plugin/test-bridge/kotlin-suite.test.ts`; `INSRC_JDK21` or
  `~/.local/jdk21`).

- **s4 issue uniqueness (accepted 2026-10-18, owner decision on the s4 LLD):** DEF
  S004:FR001 ("the same stage unit never gets two issues, however often its draft is
  written") is read as: one author per unit never gets two issues from repeated or
  interrupted drafts; two simultaneous first drafts of the same unit by different
  authors converge to one issue (the lowest-numbered issue carrying the unit's label is
  kept and the other is closed as a duplicate) except in a narrow race, in which each
  daemon's duplicate check runs before the other's issue exists and two issues remain
  until a person closes one. GitHub gives no atomic uniqueness, so this cannot be
  closed from our side. The convergence needs an additive sc1 method,
  `findIssues(labels)` (every matching issue, open or closed, complete pagination,
  ascending numeric order), proposed to s1 as a `sharedContract.methodAdd` amendment
  and to be agreed before the s4 build.

- **s4 LLD approval (2026-10-18):** approved with a review override after three review
  cycles (nine rounds). The last round's findings are implementation-level and are binding
  build requirements for s4, to be checked by its code review:
  1. Legacy mode keeps every approve-time extra exactly as today, per entry point: the Epic
     review comment (`postReviewComment` on `autoPushEpicOnHld`) is posted even when the
     Epic was adopted, and the plan review comment in `autoPushTasksOnPlan` is posted
     before its loop on every push; only the design comment, the Epic task-list splice and
     the HLD summary comment are created-only. The unedited `tracker-auto.test.ts` is the
     proof.
  2. The readiness notice must reach the author on the daemon-side path: add
     `issueReadiness` and `notice` to `runWorkflowStreaming` and `RunWorkflowStreamResult`
     (`src/mcp/daemon-stream.ts`), the CLI service (`src/cli/services/workflow.ts`) and
     print it in the `run` handler (`src/cli/command.ts`), with a test of the printed output.
  3. The TESTS record rollback is best-effort: if both the document write and the json
     restore fail, the possibly inconsistent record state (and its newly minted revision)
     is reported to the caller, and a test covers both writes failing.
  4. The `TrackerMeta.adapter` widening from `'github'` to the port's `TrackerKind` (HLD
     §2, §4.3) is included, and `patchTrackerMeta` preserves the actual tracker kind.
  Also pending before the s4 build: the `findIssues` amendment agreed with s1 (see above).
  Build deviations from the approved LLD, found while building (2026-10-18): (a)
  `writeArtifact` keeps the revision when a content write changes nothing (the revision
  names the content, so rewriting identical content must not invalidate anything bound to
  it); (b) appending reviewer feedback (`provenance/writer.ts`) is a meta-only write, not a
  content write: feedback is human provenance and existing behaviour (`review-decision`
  "feedback changes no state") must hold, and a comment must not invalidate a signoff.

## Open items for design

- Offline rule for the policy file (last fetched policy, refuse if none; see
  the bootstrap limitation above).
- Migration: existing artifacts have `approvedAt` but no signoff; treat as
  grandfathered in team mode or require a one-time signoff.
- Epic-stage issue creation has no earlier approval to hook; decide the trigger.
- "My items" view in the TUI and VS Code (filter by assignee).
- Jira: approval semantics and mapping (see decision 3).
- Rendering `signoffs[]` and the completion event into the artifact meta, and
  gating `gates.ts` on it alongside the existing other-party review gate.
