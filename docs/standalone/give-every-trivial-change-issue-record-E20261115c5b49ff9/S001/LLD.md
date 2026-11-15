<!-- insrc:artifact LLD-c5b49ff953a9a295-s1 -->

# LLD: STORY-c5b49ff953a9a295-s1 — Design the fix for ISSUE-c5b49ff953a9a295: every trivial change gets an ISSUE record (triage routes trivial to the issue stage, approval advances to build), the ISSUE can describe a non-defect change, steering/guide text updated, approving a trivial BUILD completes its Story, and a deliberate decision for the 16 existing headless trivial builds.

## Summary

**Epic:** `give-every-trivial-change-issue-record`
**HLD base run:** `wf-1794721863217-7hrb97`
**HLD effective hash:** `2faaccb0cf13...`

A trivial change now starts with an ISSUE record, like a small bugfix. Triage routes trivial work to the issue stage; the ISSUE says it is a change rather than a defect and is worded that way. Approving it hands build the ISSUE's own hash, so the build, its review and its Story completion all hang off that record. Build no longer invents a new work item for a no-design build, so neither a trivial change nor a small bugfix can end up without its ISSUE.

## Contents

1. [HLD context](#1-hld-context)
2. [Contract details](#2-contract-details)
3. [Data model changes](#3-data-model-changes)
4. [Diagrams](#4-diagrams)
5. [Error paths](#5-error-paths)
6. [Test strategy](#6-test-strategy)
7. [Migration](#7-migration)
8. [Alternatives considered](#8-alternatives-considered)
9. [References](#9-references)
10. [Open questions](#10-open-questions)

## 1. HLD context

**Framework:** Standalone feature — no parent HLD. Design directly against the repo, grounded on the s1 analyze passes. There are no HLD shared contracts to honour.
**Rollout phase:** standalone

## 2. Contract details

**Surface level:** internal-shared

### 2.1 `routeForSizeClass`

```typescript
routeForSizeClass(sizeClass: SizeClass, magnitude?: BugfixMagnitude): TriageRoute
```

**Parameters:**
- `sizeClass: SizeClass` — The triage tier.
- `magnitude: BugfixMagnitude` _(optional)_ — Required for bugfix only; ignored otherwise, as today.

**Returns:** `TriageRoute` — For 'trivial': { startStage: 'issue', standalone: true, needsPlan: false, producesLld: false } (was startStage 'build'). Every other tier is unchanged.

**Errors:**
- `Error` when bugfix without a magnitude (unchanged).

**Postconditions:**
- No tier returns startStage 'build'; build is always reached from an approved head.

### 2.2 `buildNextCall`

```typescript
buildNextCall(result: TriageResult, focus: string, repo: string, specHash?: string): TriageDone['nextCall']
```

**Parameters:**
- `result: TriageResult` — The classified result.
- `focus: string` — The request text.
- `repo: string` — Absolute repo path.
- `specHash: string` _(optional)_ — Approved SPEC to seed from (unchanged).

**Returns:** `TriageDone['nextCall']` — For 'trivial': insrc_workflow_step { phase:'start', workflow:'issue', focus, params: { standalone: true, storyTitle, storySpec: focus, sizeClass: 'trivial', magnitude: 'small', kind: 'change', triageRationale } }. The '(standalone-trivial)' build call is no longer emitted.

**Postconditions:**
- The trivial nextCall starts the issue workflow, never insrc_build_step.

### 2.3 `nextAfterIssue`

```typescript
nextAfterIssue(issue: IssueArtifact, repo: string): BugfixNextCall
```

**Parameters:**
- `issue: IssueArtifact` — The approved ISSUE.
- `repo: string` — Absolute repo path.

**Returns:** `BugfixNextCall` — magnitude 'small' (a small bugfix, or a trivial change): insrc_build_step { phase:'implement', target:'(standalone-bugfix)', standalone: { standalone: true, sizeClass: 'trivial', epicHash: issue.meta.issueHash, focus: scope } }. magnitude 'sized': the design.story call with params.epicHash: issue.meta.issueHash added. The scope text is the ISSUE body, as today.

**Errors:**
- `Error` when magnitude neither 'small' nor 'sized' (unchanged).
- `Error` when issue.meta.issueHash missing or not 16 hex characters: refuse rather than emit a call without the work item.

**Preconditions:**
- The ISSUE is approved.

**Postconditions:**
- Every emitted call names the ISSUE's hash as its work item.

### 2.4 `handleStandaloneImplement`

```typescript
handleStandaloneImplement(ctx: StandaloneContext, ...): Promise<BuildStepResult>
```

**Parameters:**
- `ctx: StandaloneContext` — standalone.{epicHash, storyId, focus, sizeClass, triageRationale}.

**Returns:** `Promise<BuildStepResult>` — Unchanged for a call that carries epicHash.

**Errors:**
- `BuildStepError 'no-identity'` when A no-LLD (trivial) standalone call with no epicHash. Previously a hash was minted from the focus (standaloneEpicHashFromFocus); now the call is refused with a message naming the issue stage.
- `BuildStepError 'no-head'` when A no-LLD standalone call whose epicHash has no approved ISSUE head.

**Preconditions:**
- standalone.epicHash names an approved ISSUE (no-LLD) or an approved standalone LLD (small).

**Postconditions:**
- No standalone build is created without a head.

### 2.5 `renderIssueMarkdown`

```typescript
renderIssueMarkdown(artifact: IssueArtifact): string
```

**Parameters:**
- `artifact: IssueArtifact` — The ISSUE to render.

**Returns:** `string` — meta.kind 'change' renders the body under '## What was asked', '## Why' and '## Change'; absent or 'defect' renders '## Reproduction', '## Root cause', '## Fix intent' as today.

**Postconditions:**
- Existing ISSUE documents render byte-identically.

## 3. Data model changes

### 3.1 `IssueArtifact.meta` — field-add

Optional kind: 'defect' | 'change'. Absent means 'defect', so every stored ISSUE keeps its meaning and rendering. Set from the issue run's params.kind ('change' for a trivial triage result). The body fields (title, reproduction, rootCause, fixIntent) keep their names and validator; for a change they hold what was asked, why, and the change. magnitude stays 'small' | 'sized'; a trivial change carries 'small'.

```
meta.kind?: 'defect' | 'change'
```

**Call sites:**
- `src/workflow/artifacts/issue.ts:10-100`
- `src/workflow/runners/issue/index.ts:26-62`
- `src/workflow/bugfix/next-after-issue.ts:26-95`

### 3.2 `insrc_build_step standalone identity` — invariant-change

A no-LLD standalone build must carry epicHash naming an approved ISSUE. The focus-derived hash is no longer minted.

**Call sites:**
- `src/daemon/steps/build-step/phases/implement.ts:142-144`
- `src/workflow/runners/build/admission.ts:245-247`

## 4. Diagrams

- [Sequence diagram](docs/standalone/give-every-trivial-change-issue-record-E20261115c5b49ff9/S001/sequence-diagram.html)

## 5. Error paths

**Error cases**

- **An agent calls insrc_build_step for a no-LLD standalone build without epicHash (an old steering copy, a hand-written call, or a caller that dropped it).** (recoverable)
  - Detection: handleStandaloneImplement finds ctx.epicHash undefined for a sizeClass 'trivial' call, where it used to call standaloneEpicHashFromFocus.
  - Response: Return BuildStepError 'no-identity' naming the fix: run insrc_triage, approve the ISSUE, then build with its hash. Nothing is written.
  - User impact: The build does not start until an ISSUE exists; no headless record is created.
- **A no-LLD standalone build names an epicHash with no ISSUE, or with an ISSUE that is still pending.** (recoverable)
  - Detection: Admission reads the ISSUE head for the hash and finds it missing or its lifecycle not approved.
  - Response: Refuse with 'no-head' (missing) or the existing unapproved-upstream refusal (pending), naming the ISSUE id.
  - User impact: The user approves the ISSUE first; the build then proceeds under it.
- **An approved ISSUE reaches the advance without a usable issueHash.** (recoverable)
  - Detection: nextAfterIssue checks issue.meta.issueHash against /^[0-9a-f]{16}$/.
  - Response: Throw; the approval's followOn reports bugfix-advance ok:false with the message, as for an invalid magnitude today.
  - User impact: The ISSUE stays approved; the agent sees the failed advance instead of a call that would build headless.
- **An ISSUE written with kind 'change' is read by a client built before this change.** (recoverable)
  - Detection: The old renderer ignores meta.kind.
  - Response: It renders the defect headings over the change text; the record and routing stay correct.
  - User impact: Wording only, until the client updates.

**Edge cases**

| Input | Expected |
| :--- | :--- |
| An ISSUE stored before this change (no meta.kind). | Reads as kind 'defect'; renders byte-identically; routes by magnitude as today. |
| A trivial change whose ISSUE is approved with magnitude 'small' and kind 'change'. | The advance emits the build call with sizeClass 'trivial' and epicHash = the ISSUE hash; BUILD approval completes STORY and EPIC. |
| A small bugfix (kind 'defect', magnitude 'small') after this change. | Same build route as before, now with epicHash = the ISSUE hash; no headless build. |
| A sized bugfix ISSUE. | Advances to design.story as today, with params.epicHash = the ISSUE hash added. |
| One of the 16 existing headless trivial builds is re-approved or revalidated. | Unchanged until migration backfills it (see migration); no new failure is introduced for it. |
| Triage classifies a request 'trivial' that the user explicitly scoped as a one-liner. | Still routes to the issue stage; the steering text no longer offers a build-only path. |

**Invariants to preserve**

- routeForSizeClass stays the single route table: nextAfterIssue and buildNextCall derive their stage from it and never re-implement the size decision; the exhaustiveness check stays. [[c1]]
- A bugfix still requires a magnitude, and the advance still refuses anything other than 'small' | 'sized'. [[c3]]
- A small (LLD) standalone build still requires epicHash plus an approved standalone LLD, unchanged. [[c4]]
- Story completion keeps reading the Epic anchor only from the head; no BUILD-stamp fallback is added (the ISSUE is the head). [[c5]]
- IssueArtifact body field names and the four-field validator are unchanged; stored ISSUEs keep their rendering. [[c6]]

## 6. Test strategy

**Test framework:** `node:test run through tsx (npx tsx --test), as in src/workflow/triage/__tests__/classify.test.ts and src/daemon/steps/triage-step/__tests__/handler.test.ts`

**Test levels**

- **unit** — Pin the new routes, the advance's work-item hash and the ISSUE kind rendering.
  - Subjects: `routeForSizeClass: trivial routes to the issue stage with no LLD`, `routeForSizeClass: no tier starts at build`, `triage nextCall: trivial starts the issue workflow with sizeClass trivial, magnitude small and kind change`, `nextAfterIssue: a small ISSUE routes to build with the ISSUE hash as standalone.epicHash`, `nextAfterIssue: a sized ISSUE routes to design.story with params.epicHash set to the ISSUE hash`, `nextAfterIssue: an ISSUE without a 16-hex issueHash is refused`, `renderIssueMarkdown: kind change renders What was asked, Why and Change`, `renderIssueMarkdown: an ISSUE with no kind renders byte-identically to before`, `issue capture prompt: a change run asks what was asked and why, not for a defect`
  - Fixtures: `An approved IssueArtifact fixture with and without meta.kind`, `A golden rendering of a pre-change ISSUE document`
- **integration** — Prove the build refuses headless calls and that a trivial change completes its Story end to end.
  - Subjects: `build implement: a no-LLD standalone call without epicHash is refused with no-identity and writes nothing`, `build implement: a no-LLD standalone call whose epicHash has no approved ISSUE is refused`, `a trivial change: ISSUE approved, build under its hash, BUILD approved completes STORY and EPIC`, `the steering triage list and build guide route trivial work through the issue stage`
  - Fixtures: `Temp repository with the store and lifecycle (story-completion test kit)`

**Acceptance mapping**

| Criterion | Proving tests |
| :--- | :--- |
| `ac1` | `routeForSizeClass: trivial routes to the issue stage with no LLD`, `triage nextCall: trivial starts the issue workflow with sizeClass trivial, magnitude small and kind change`, `build implement: a no-LLD standalone call without epicHash is refused with no-identity and writes nothing`, `build implement: a no-LLD standalone call whose epicHash has no approved ISSUE is refused` |
| `ac2` | `renderIssueMarkdown: kind change renders What was asked, Why and Change`, `renderIssueMarkdown: an ISSUE with no kind renders byte-identically to before`, `issue capture prompt: a change run asks what was asked and why, not for a defect` |
| `ac3` | `the steering triage list and build guide route trivial work through the issue stage` |
| `ac4` | `a trivial change: ISSUE approved, build under its hash, BUILD approved completes STORY and EPIC`, `nextAfterIssue: a small ISSUE routes to build with the ISSUE hash as standalone.epicHash`, `nextAfterIssue: a sized ISSUE routes to design.story with params.epicHash set to the ISSUE hash`, `nextAfterIssue: an ISSUE without a 16-hex issueHash is refused` |
| `ac5` | `routeForSizeClass: no tier starts at build` |

## 7. Migration

**State before:** Triage routes trivial work straight to build (routeForSizeClass returns startStage 'build'; the triage nextCall is insrc_build_step '(standalone-trivial)' with no epicHash). Build mints a work-item hash from the focus text for a no-LLD call (standaloneEpicHashFromFocus). The small-bugfix advance also emits its build call without the ISSUE's hash. A headless trivial build cannot complete its Story because requireEpicAnchor reads only the head. The steering block tells agents a standalone BUILD record is a trivial change's ledger entry. 16 approved headless trivial BUILD records exist in this repository, none with a STORY record.

**State after:** Triage routes trivial work to the issue stage (sizeClass trivial, magnitude small, kind change). The ISSUE renders change wording when meta.kind is 'change'. Approving any small or sized ISSUE hands the next stage the ISSUE's hash. Build refuses a no-LLD call without an epicHash naming an approved ISSUE, so no new headless build can be made. Approving a trivial BUILD completes its Story under the ISSUE. The steering text says trivial work starts with an ISSUE. The 16 existing headless builds are handled as decided in the open question below.

**Zero downtime:** yes — **Data rewrite:** no

**Steps**

1. Add optional meta.kind ('defect' | 'change') to IssueArtifact; absent reads as 'defect'. Teach the renderer and the issue.capture prompt the change wording. Stored ISSUEs are untouched and render byte-identically. — ↩ rollbackable
2. Make nextAfterIssue put the ISSUE's hash into the emitted build call (standalone.epicHash) and design.story call (params.epicHash), refusing an ISSUE without a 16-hex issueHash. — ↩ rollbackable
3. Flip routeForSizeClass('trivial') to startStage 'issue' and change the triage nextCall to start the issue workflow with sizeClass trivial, magnitude small, kind change. Update the route tests. — ↩ rollbackable
4. Make the standalone no-LLD build refuse a call without epicHash (no-identity) or whose epicHash has no approved ISSUE (no-head), replacing the focus-derived hash. — ↩ rollbackable
5. Update the steering block (triage route list, build guide, code-review pinning rule, triage skip rule) so trivial work starts with an ISSUE and pins it in the code-review packet; refresh assets/steering-block.md through the plugin's sync-assets. — ↩ rollbackable
6. Existing headless trivial builds: apply the decision recorded for open question q1. Recommended: leave the 16 records as they are and record the decision in BUILD.md, because a backfilled ISSUE would be written by the system after the fact rather than reviewed by a person, which is the trace the rule asks for. The alternative is a one-off repair that writes an ISSUE (kind change) from each BUILD's focus and triage rationale under the BUILD's own hash, approved by the migration actor with the reason recorded, after which the existing completion walk completes each Story. — ✕ non-rollbackable

**Backward compat:** IssueArtifact gains an optional field; old ISSUEs read and render as before, and an old client renders a change ISSUE with defect headings (wording only). The triage nextCall for trivial changes shape (issue workflow instead of build); agents follow nextCall verbatim, and the steering text changes in the same release. insrc_build_step now refuses a no-LLD standalone call without epicHash: a caller relying on the minted hash (an old steering copy or a hand-written call) gets a no-identity error that names the issue stage, instead of a headless build. Small (LLD) standalone builds are unchanged.

## 8. Alternatives considered

### 8.1 a1: Issue stage first, with a change kind — **CHOSEN**

Triage routes trivial to the issue stage; the ISSUE records a change kind; approval advances to build carrying the ISSUE's hash; build refuses a headless trivial build.

routeForSizeClass('trivial') returns startStage 'issue' with producesLld false, and triage's nextCall starts the issue workflow (as for a small bugfix) with sizeClass 'trivial'. The IssueArtifact meta gains kind: 'defect' | 'change' (absent reads as defect, so every existing ISSUE is unchanged). For a change, the capture prompt asks what was asked and why, and the document renders 'What was asked' / 'Why' / 'Change' in place of Reproduction / Root cause / Fix intent; the body fields keep their names. The issue-approval advance (nextAfterIssue) routes a trivial ISSUE, and a small bugfix, to build and puts the ISSUE's hash in standalone.epicHash. The standalone no-LLD build stops minting a hash from the focus and refuses a call with no epicHash, so no new headless build can be made. Steering and guide text change to match. The 16 headless builds are handled by a repair step (see migration).

### 8.2 a2: Issue stage first, neutral wording, no kind

Same routing as a1, but the ISSUE is reworded to fit both defects and changes instead of carrying a kind.

Routing, the advance carrying the ISSUE's hash and the build refusing a headless trivial call are as in a1. Instead of a kind field, the capture prompt and the rendered headings become neutral for every ISSUE ('Problem or request', 'Cause or motivation', 'Intended change'). No meta field is added.

**Rejected because:** Same routing as a1 but fi2 is only partial: rewording every ISSUE degrades defect records to avoid one optional meta field.

### 8.3 a3: Build writes the ISSUE itself

Keep trivial routed to build, but build's implement phase writes an ISSUE head from the focus before it starts.

Triage keeps startStage 'build'. When a standalone trivial build has no head, implement writes an IssueArtifact (kind change) from the focus and triage rationale under the build's hash, approved by the system rather than a person, then builds. Completion then finds the ISSUE head.

**Rejected because:** Avoids the extra stop but violates the human-approval rule for heads and only partly meets fi1.

### 8.4 a4: Anchor fallback only

Leave routing as it is; let Story completion take the anchor from the BUILD record's stamp.

requireEpicAnchor (or the creation context) falls back to the work item's BUILD record epicCreatedAt when there is no head, as record path resolution already does. Trivial work stays headless; approving its BUILD now completes its Story.

**Rejected because:** Fixes only fi4; the trace stays lost, which is the user's actual requirement.

## 9. References

- **[[c1]]** `code` `src/workflow/triage/classify.ts:36-70`
- **[[c2]]** `code` `src/daemon/steps/triage-step/phases/classify.ts:55-85`
- **[[c3]]** `code` `src/workflow/bugfix/next-after-issue.ts:26-95`
- **[[c4]]** `code` `src/daemon/steps/build-step/phases/implement.ts:142-144`
- **[[c5]]** `code` `src/workflow/storage.ts:528-557`
- **[[c6]]** `code` `src/workflow/artifacts/issue.ts:10-100`
- **[[c7]]** `doc` `src/prompts/steering-block.md:231`
- **[[c8]]** `code` `src/workflow/artifact-core/codecs.ts:144-180`
- **[[c9]]** `prior-artifact` `ISSUE-c5b49ff953a9a295`

## 10. Open questions

- q1: The 16 existing headless trivial builds. Recommended: leave them and record the decision, because a backfilled ISSUE would be system-written after the fact, not a person-reviewed trace. Alternative: a one-off repair that writes a kind 'change' ISSUE from each BUILD's focus under its own hash, approved by the migration actor, then completes each Story.
- ts1: The Story carries no acceptance criteria of its own; ac1-ac5 are the five fix-intent points of ISSUE-c5b49ff953a9a295.

## Resolved questions

- `q7aeab4c0` — q1: The 16 existing headless trivial builds. Recommended: leave them and record the decision, because a backfilled ISSUE would be system-written after the fact, not a person-reviewed trace. Alternative: a one-off repair that writes a kind 'change' ISSUE from each BUILD's focus under its own hash, approved by the migration actor, then completes each Story.
  - **resolved**: Backfill: a one-off repair writes an ISSUE (kind 'change') for each of the 16 existing headless trivial builds from its BUILD's request text (focus and triage rationale), under the BUILD's own hash, approved by the migration actor with the reason recorded, then completes each Story through the existing completion walk. — User decision 2026-11-15: chose the backfill alternative over leaving the 16 builds headless. _(2026-11-15T06:02:16.513Z)_

## Citations

- **[[c1]]** `code` `src/workflow/triage/classify.ts:36-70`
- **[[c2]]** `code` `src/daemon/steps/triage-step/phases/classify.ts:55-85`
- **[[c3]]** `code` `src/workflow/bugfix/next-after-issue.ts:26-95`
- **[[c4]]** `code` `src/daemon/steps/build-step/phases/implement.ts:142-144`
- **[[c5]]** `code` `src/workflow/storage.ts:528-557`
- **[[c6]]** `code` `src/workflow/artifacts/issue.ts:10-100`
- **[[c7]]** `doc` `src/prompts/steering-block.md:231`
- **[[c8]]** `code` `src/workflow/artifact-core/codecs.ts:144-180`
- **[[c9]]** `prior-artifact` `ISSUE-c5b49ff953a9a295`
