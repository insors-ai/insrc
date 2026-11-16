<!-- insrc:artifact ISSUE-c5b49ff953a9a295 -->

# Give every trivial change an ISSUE record so its trace is kept and its Story completes

## Reproduction

1. Ask for a mechanical change that triage sizes as trivial. On 2026-11-14 this was raising the chat's per-repository turn limit from 2 to 6.
2. Triage routes it straight to build, with no ISSUE, design or plan record before it.
3. Build, review and approve the BUILD record (BUILD-d6eb2fb5ac627b66-s1).

Observed: the approval succeeds, but its Story-completion step fails with "no Epic anchor for d6eb2fb5ac627b66: its head (a Define, an Issue or a stamped standalone LLD) carries no creation time". No STORY or EPIC record is created. Nothing records what was asked or why, apart from the BUILD record's focus text. All 16 trivial builds in this repository that have no ISSUE, LLD or Define have no STORY record. Trivial builds that started from an ISSUE completed (f0da1b8b9cdb28b6, 3183af2a005db14f, 9d4523c7, de3ab236).

Expected: every trivial change has an ISSUE record that states what was asked and why. Its BUILD hangs off that record, and approving the BUILD completes its Story, as for a small bugfix.

## Root cause

Triage sends trivial work straight to build without creating any head record:

- `routeForSizeClass` returns `startStage: 'build'` for `trivial`.
- The triage `nextCall` is `insrc_build_step` with `target: '(standalone-trivial)'` and no work-item hash.
- The steering text tells agents the same: a standalone BUILD record is the trivial change's ledger entry.

Without a head, two things are lost:

- **The trace.** The ISSUE is the record of what was asked, why and how it was resolved, and becomes the GitHub issue. A trivial change has none.
- **Story completion.** Completing a Story creates its STORY and EPIC heads. Their creation context takes the Epic anchor from `requireEpicAnchor` for every kind that is not a root, and `requireEpicAnchor` reads it only from a Define, an ISSUE or a stamped standalone LLD. A headless trivial build has none, so completion stops with `MissingAnchorError`. The BUILD record's own stamped `epicCreatedAt` is not consulted.

A small bugfix does not hit this, because triage routes it to the `issue` stage first and approving the ISSUE advances it to build.

## Fix intent

- A trivial change gets an ISSUE record before it is built: triage routes `trivial` to the `issue` stage, and approving the ISSUE advances to build with the ISSUE's hash as the work item, as a small bugfix does.
- The ISSUE record can describe a non-defect change (what was asked and why) as well as a defect.
- The steering and guide text, and the triage nextCall it documents, say that trivial work starts with an ISSUE.
- Approving the BUILD of a trivial change completes its Story.
- The 16 existing headless trivial builds are handled deliberately: either given an ISSUE record and completed, or left as they are with the decision recorded.

## Citations

- **[[c1]]** `code` `src/workflow/triage/classify.ts:47-49` — "case 'trivial': // Mechanical, ~1 file, no design choices: straight to build, no LLD. return { startStage: 'build', standalone: true, needsPlan: false, producesLld: false };"
- **[[c2]]** `code` `src/daemon/steps/triage-step/phases/classify.ts:74-85` — "// Trivial → straight to build (no LLD), standalone. ... target: '(standalone-trivial)'"
- **[[c3]]** `code` `src/workflow/artifact-core/codecs.ts:161-164` — ": requireEpicAnchor(repoPath, key.epicHash);"
- **[[c4]]** `code` `src/workflow/storage.ts:550-557` — "no Epic anchor for ${epicHash}: its head (a Define, an Issue or a stamped standalone LLD) carries no creation time"
- **[[c5]]** `doc` `src/prompts/steering-block.md:231` — "**trivial** → `build` (no LLD; a standalone BUILD record is its ledger entry)"
- **[[c6]]** `prior-artifact` `.insrc/artifacts/BUILD-d6eb2fb5ac627b66-s1.json` — "story-completion followOn: no Epic anchor for d6eb2fb5ac627b66"
- **[[c7]]** `stakeholder` `user 2026-11-15` — "trivial builds should also have an ISSUE record. else the trace gets lost."
