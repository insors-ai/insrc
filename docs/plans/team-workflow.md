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
