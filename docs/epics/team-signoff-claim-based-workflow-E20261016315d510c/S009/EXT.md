<!-- insrc:artifact EXT-315d510cb28100e2-s9 -->

# Extend: team-signoff-claim-based-workflow — Keep tracker issues and status in step with the work without a manual step

> **Extends Epic `team-signoff-claim-based-workflow`** — this builds on existing docs + code; no new Epic was created.

**Scope:** M   ·   **New Story:** `s9`

Extends Epic `team-signoff-claim-based-workflow` (315d510cb28100e2), building on DEF-315d510cb28100e2 and HLD-315d510cb28100e2 and on code in src/workflow/tracker-auto.ts, src/workflow/tracker/ and src/cli/services/workflow.ts.

## Added Story

### s9: Keep tracker issues and status in step with the work without a manual step

**User value:** Issues exist and their status is current without anyone remembering to create or refresh them, in team and solo repos, whichever tracker is used.

**Acceptance criteria:**
- **ac1:** Given a team repo and a stage's draft is first written, when the draft is written, then the daemon creates the stage's issue with no manual step.
- **ac2:** Given a solo repo (no policy) with a tracker configured and a draft is first written, when the draft is written, then the daemon creates the issue itself, which is a deliberate change from today, where only the terminal approve creates it.
- **ac3:** Given a solo repo with no tracker configured, when a draft is first written, then nothing is created and nothing fails.
- **ac4:** Given an issue already exists for an artifact, when the terminal approve path is used manually, then it creates only the issues that do not yet exist and never a duplicate.
- **ac5:** Given an artifact with an issue in a tracker, when a git pull or push completes, then the tracker's status is refreshed into the artifact's tracker record, and the user can ask for the same refresh explicitly.
- **ac6:** Given the tracker is slow or fails during a git pull or push, when the refresh runs, then the git operation still completes and the failure is reported.
- **ac7:** Given an issue the daemon has created for an artifact, when the artifact is next shown, then it carries the issue key, the artifact id and a revision number that is separate from the schema version.
- **ac8:** Given a tracker other than GitHub is configured, when issues are created and status is synced, then the same create, write-back and sync steps apply as for GitHub.

## Building on

- `doc` docs/epics/team-signoff-claim-based-workflow-E20261016315d510c/DEF.md — Have an issue ready for every piece of work (s4)
- `doc` docs/epics/team-signoff-claim-based-workflow-E20261016315d510c/HLD.md — Syncing tracker status on git pull and push, and the issue-status read it needs, are deferred with the later-tracker work to a define extend
- `code` src/workflow/tracker-auto.ts:102-319
- `code` src/cli/services/workflow.ts:158-171
- `code` src/workflow/tracker/refs.ts:24-37

## Next

Proposed HLD amendment `AMD-315d510cb28100e2-1` (pending approval — it adds the new Story's boundary).

Approve the HLD amendment (`AMD-315d510cb28100e2-1`) and the updated Epic, then run `design.story` for the new Story `s9` to produce its LLD.

```
insrc_workflow_step phase=start workflow=design.story params={"epicHash":"315d510cb28100e2","storyId":"s9"}
```
