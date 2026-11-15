<!-- insrc:artifact LLD-c5b49ff953a9a295-s1 -->

# LLD: STORY-c5b49ff953a9a295-s1 — Give every trivial change an ISSUE record

## Summary

**Epic:** `give-every-trivial-change-issue-record`
**HLD base run:** `wf-1794722626308-qelw3o`
**HLD effective hash:** `41010cddc063...`

A trivial change now starts with an ISSUE record, like a small bugfix. Triage routes trivial work to the issue stage; the ISSUE records that it is a change rather than a defect and is worded that way. Approving any ISSUE hands the next stage the ISSUE's own hash, and build refuses a no-design build without one, so no new work can end up without its ISSUE. The 16 existing trivial builds that have none get an ISSUE through a repair rule, and their Stories are then completed or held by the existing completion rule.

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

**Returns:** `TriageDone['nextCall']` — For 'trivial': insrc_workflow_step { phase:'start', workflow:'issue', focus, params: { standalone: true, storyTitle, storySpec: focus, sizeClass: 'trivial', magnitude: 'small', kind: 'change', triageRationale } }. A bugfix issue call carries kind: 'defect'. The '(standalone-trivial)' build call is no longer emitted.

**Postconditions:**
- The trivial nextCall starts the issue workflow, never insrc_build_step.

### 2.3 `finalizeIssue`

```typescript
finalizeIssue(intent: WorkflowIntent, ...): FinalizeResult
```

**Parameters:**
- `intent: WorkflowIntent` — The issue run; intent.params carries magnitude and now kind.

**Returns:** `FinalizeResult` — The stored ISSUE meta carries kind when params.kind is 'defect' or 'change', beside magnitude. Absent params.kind stores no kind (read as defect).

**Errors:**
- `schemaFailure` when params.kind present but neither 'defect' nor 'change': the ISSUE is not written.

**Postconditions:**
- A trivial-change ISSUE is stored with kind 'change' and magnitude 'small'.

### 2.4 `nextAfterIssue`

```typescript
nextAfterIssue(issue: IssueArtifact, repo: string): BugfixNextCall
```

**Parameters:**
- `issue: IssueArtifact` — The approved ISSUE.
- `repo: string` — Absolute repo path.

**Returns:** `BugfixNextCall` — magnitude 'small' (a small bugfix or a trivial change): insrc_build_step { phase:'implement', target:'(standalone-bugfix)', standalone: { standalone: true, sizeClass: 'trivial', epicHash: issue.meta.issueHash, focus: scope } }. magnitude 'sized': the design.story call with params.epicHash: issue.meta.issueHash added.

**Errors:**
- `Error` when magnitude neither 'small' nor 'sized' (unchanged).
- `Error` when issue.meta.issueHash missing or not 16 hex characters.

**Preconditions:**
- The ISSUE is approved.

**Postconditions:**
- Every emitted call names the ISSUE's hash as its work item.

### 2.5 `handleStandaloneImplement`

```typescript
handleStandaloneImplement(ctx: StandaloneContext, ...): Promise<BuildStepResult>
```

**Parameters:**
- `ctx: StandaloneContext` — standalone.{epicHash, storyId, focus, sizeClass, triageRationale}.

**Returns:** `Promise<BuildStepResult>` — Unchanged for a call whose epicHash names an approved head.

**Errors:**
- `BuildStepError 'no-identity'` when A no-LLD standalone call with no epicHash; the focus-derived hash is no longer minted.
- `BuildStepError 'no-head'` when A no-LLD standalone call whose epicHash has no approved ISSUE.

**Preconditions:**
- standalone.epicHash names an approved ISSUE (no-LLD) or an approved standalone LLD (small).

**Postconditions:**
- No standalone build is created without a head.

### 2.6 `renderIssueMarkdown`

```typescript
renderIssueMarkdown(artifact: IssueArtifact): string
```

**Parameters:**
- `artifact: IssueArtifact` — The ISSUE to render.

**Returns:** `string` — kind 'change' renders '## What was asked', '## Why', '## Change'; absent or 'defect' renders '## Reproduction', '## Root cause', '## Fix intent' as today.

**Postconditions:**
- Existing ISSUE documents render byte-identically.

### 2.7 `runRepair`

```typescript
runRepair(repo: string, mode: RepairMode, options?: RepairOptions): Promise<RepairReport>
```

**Parameters:**
- `repo: string` — Repository root.
- `mode: RepairMode` — 'repair-preview' or 'repair'.
- `options: RepairOptions` _(optional)_ — Test seams (unchanged).

**Returns:** `Promise<RepairReport>` — A new rule, 'backfill-issue', runs before units. The preview lists one change per standalone trivial BUILD with no DEF, ISSUE or LLD head. repair writes for each an ISSUE (kind 'change', magnitude 'small', body title and request from the BUILD's focus, why from its triage rationale or 'not recorded', change from its summary) under the BUILD's own hash, anchored at the BUILD's epicCreatedAt, approved by the migration actor with the reason 'backfilled for a trivial build approved before ISSUE-c5b49ff953a9a295'. The existing units and settle steps then create the units and complete or hold each Story by the completion rule; a BUILD that is not approved is not settled. Each write is reported under step 'backfill-issue'.

**Errors:**
- `ConversionRefused` when Unchanged: the plan lists files that cannot be repaired.

**Postconditions:**
- A second repair lists no backfill-issue change.
- No headless standalone trivial BUILD remains after repair.

## 3. Data model changes

### 3.1 `IssueArtifact.meta` — field-add

Optional kind: 'defect' | 'change'. Absent means 'defect', so every stored ISSUE keeps its meaning and rendering. Written by finalizeIssue from params.kind, and by the backfill as 'change'. Body field names and the four-field validator are unchanged.

```
meta.kind?: 'defect' | 'change'
```

**Call sites:**
- `src/workflow/orchestrator.ts:900-935`
- `src/workflow/artifacts/issue.ts:10-100`
- `src/workflow/runners/issue/index.ts:26-62`
- `src/workflow/bugfix/next-after-issue.ts:26-95`

### 3.2 `insrc_build_step standalone identity` — invariant-change

A no-LLD standalone build must carry epicHash naming an approved ISSUE; the focus-derived hash is no longer minted.

**Call sites:**
- `src/daemon/steps/build-step/phases/implement.ts:128-150`
- `src/workflow/runners/build/admission.ts:245-247`

### 3.3 `RepairStep / ConversionRule` — field-add

Repair gains the rule 'backfill-issue' and the step of the same name, ordered before 'units' so the new ISSUE heads anchor the units it creates.

**Call sites:**
- `src/workflow/convert/repair.ts:53-120`

## 4. Diagrams

- [Sequence diagram](docs/standalone/give-every-trivial-change-issue-record-E20261115c5b49ff9/S001/sequence-diagram.html)

## 5. Error paths

**Error cases**

- **An agent calls insrc_build_step for a no-LLD standalone build without epicHash (an old steering copy or a hand-written call).** (recoverable)
  - Detection: handleStandaloneImplement finds ctx.epicHash undefined for a no-LLD call, where it used to call standaloneEpicHashFromFocus.
  - Response: Return BuildStepError 'no-identity' naming the fix (triage, approve the ISSUE, build with its hash). Nothing is written.
  - User impact: The build waits for an ISSUE; no headless record is created.
- **A no-LLD standalone build names an epicHash with no ISSUE, or with a pending ISSUE.** (recoverable)
  - Detection: Admission reads the ISSUE head for the hash and finds it missing or not approved.
  - Response: Refuse with 'no-head' (missing) or the existing unapproved-upstream refusal (pending), naming the ISSUE id.
  - User impact: The ISSUE is approved first; the build then proceeds.
- **An approved ISSUE reaches the advance without a usable issueHash.** (recoverable)
  - Detection: nextAfterIssue checks issue.meta.issueHash against /^[0-9a-f]{16}$/.
  - Response: Throw; the approval's followOn reports bugfix-advance ok:false.
  - User impact: The ISSUE stays approved; the agent sees the failed advance instead of a call that would build headless.
- **An issue run is started with params.kind that is neither 'defect' nor 'change'.** (recoverable)
  - Detection: finalizeIssue validates params.kind before building the meta.
  - Response: Return a schemaFailure; no ISSUE is written.
  - User impact: The run is corrected and resynthesized.
- **The backfill fails part-way (a write error after some ISSUEs are committed).** (recoverable)
  - Detection: The repair step throws; the runner records stoppedAt as 'backfill-issue'.
  - Response: The report lists the ISSUEs already written and the remaining changes; later steps do not run. A second repair writes only the rest.
  - User impact: The user re-runs repair; no ISSUE is written twice.

**Edge cases**

| Input | Expected |
| :--- | :--- |
| An ISSUE stored before this change (no meta.kind). | Reads as defect; renders byte-identically; routes by magnitude as today. |
| A trivial change: ISSUE approved with magnitude 'small' and kind 'change'. | The advance emits the build call with sizeClass 'trivial' and epicHash = the ISSUE hash; BUILD approval completes STORY and EPIC. |
| A small bugfix after this change. | Same route, now with epicHash = the ISSUE hash. |
| A sized bugfix ISSUE. | Advances to design.story with params.epicHash = the ISSUE hash. |
| A headless trivial BUILD still in draft (6fb63e5090d2e35f). | repair writes its ISSUE; settle leaves its Story unsettled because the BUILD is not approved. |
| A headless BUILD approved before 2026-11-09T16:00Z with no attributed override. | repair writes its ISSUE; settle lists its Story in held with the reason; nothing is forced complete. |
| A headless BUILD approved with a stored override or a passing independent review. | repair writes its ISSUE and settle completes STORY and EPIC. |
| repair run a second time after a full backfill. | repair-preview lists no backfill-issue change. |

**Invariants to preserve**

- routeForSizeClass stays the single route table; nextAfterIssue and buildNextCall derive their stage from it; the exhaustiveness check stays. [[c1]]
- finalizeIssue still mints issueHash from the run id and copies magnitude only when it is 'small' or 'sized'. [[c3]]
- A bugfix still requires a magnitude, and the advance still refuses anything other than 'small' | 'sized'. [[c4]]
- A small (LLD) standalone build still requires epicHash plus an approved standalone LLD. [[c6]]
- Story completion keeps reading the Epic anchor only from the head; no BUILD-stamp fallback is added. [[c8]]
- IssueArtifact body field names and the four-field validator are unchanged; stored ISSUEs keep their rendering. [[c10]]
- Repair never completes a unit outside the completion rule: settle's cutoff and held/failed reporting are unchanged. [[c12]]

## 6. Test strategy

**Test framework:** `node:test run through tsx (npx tsx --test), as in src/workflow/triage/__tests__/classify.test.ts and src/workflow/convert/__tests__/repair-settle.test.ts`

**Test levels**

- **unit** — Pin the new routes, the advance's work-item hash, the stored kind and its rendering.
  - Subjects: `routeForSizeClass: trivial routes to the issue stage with no LLD`, `routeForSizeClass: no tier starts at build`, `triage nextCall: trivial starts the issue workflow with sizeClass trivial, magnitude small and kind change`, `finalizeIssue: params.kind change is stored on the ISSUE meta and an unknown kind is refused`, `nextAfterIssue: a small ISSUE routes to build with the ISSUE hash as standalone.epicHash`, `nextAfterIssue: a sized ISSUE routes to design.story with params.epicHash set to the ISSUE hash`, `nextAfterIssue: an ISSUE without a 16-hex issueHash is refused`, `renderIssueMarkdown: kind change renders What was asked, Why and Change`, `renderIssueMarkdown: an ISSUE with no kind renders byte-identically to before`, `issue capture prompt: a change run asks what was asked and why, not for a defect`
  - Fixtures: `An approved IssueArtifact fixture with and without meta.kind`, `A golden rendering of a pre-change ISSUE document`
- **integration** — Prove the build refuses headless calls, a trivial change completes end to end, the steering text, and the repair backfill.
  - Subjects: `build implement: a no-LLD standalone call without epicHash is refused with no-identity and writes nothing`, `build implement: a no-LLD standalone call whose epicHash has no approved ISSUE is refused`, `a trivial change: ISSUE approved, build under its hash, BUILD approved completes STORY and EPIC`, `the steering text routes trivial work through the issue stage and no longer calls a BUILD record a ledger entry`, `repair-preview lists one backfill-issue change per headless standalone trivial BUILD and writes nothing`, `repair writes a kind change ISSUE for each headless BUILD, approved by the migration actor, and a second repair lists none`, `repair settles a backfilled Story by the completion rule: one completes, one approved before the cutoff without an override is held, and a draft BUILD is not settled`, `a failure injected during the backfill lists the ISSUEs written and the next repair writes only the rest`
  - Fixtures: `Temp repository with the store and lifecycle (story-completion test kit)`, `repair-kit legacy repository with headless trivial BUILD records (approved with override, approved before the cutoff without override, draft)`

**Acceptance mapping**

| Criterion | Proving tests |
| :--- | :--- |
| `ac1` | `routeForSizeClass: trivial routes to the issue stage with no LLD`, `triage nextCall: trivial starts the issue workflow with sizeClass trivial, magnitude small and kind change`, `build implement: a no-LLD standalone call without epicHash is refused with no-identity and writes nothing`, `build implement: a no-LLD standalone call whose epicHash has no approved ISSUE is refused` |
| `ac2` | `finalizeIssue: params.kind change is stored on the ISSUE meta and an unknown kind is refused`, `renderIssueMarkdown: kind change renders What was asked, Why and Change`, `renderIssueMarkdown: an ISSUE with no kind renders byte-identically to before`, `issue capture prompt: a change run asks what was asked and why, not for a defect` |
| `ac3` | `the steering text routes trivial work through the issue stage and no longer calls a BUILD record a ledger entry` |
| `ac4` | `a trivial change: ISSUE approved, build under its hash, BUILD approved completes STORY and EPIC`, `nextAfterIssue: a small ISSUE routes to build with the ISSUE hash as standalone.epicHash`, `nextAfterIssue: a sized ISSUE routes to design.story with params.epicHash set to the ISSUE hash`, `nextAfterIssue: an ISSUE without a 16-hex issueHash is refused` |
| `ac5` | `routeForSizeClass: no tier starts at build` |
| `ac6` | `repair-preview lists one backfill-issue change per headless standalone trivial BUILD and writes nothing`, `repair writes a kind change ISSUE for each headless BUILD, approved by the migration actor, and a second repair lists none`, `repair settles a backfilled Story by the completion rule: one completes, one approved before the cutoff without an override is held, and a draft BUILD is not settled`, `a failure injected during the backfill lists the ISSUEs written and the next repair writes only the rest` |

## 7. Migration

**State before:** Triage routes trivial work straight to build (routeForSizeClass returns startStage 'build'; the triage nextCall is insrc_build_step '(standalone-trivial)' with no epicHash). Build mints a work-item hash from the focus for a no-LLD call. The issue-approval advance emits its build and design.story calls without the ISSUE's hash. finalizeIssue stores only magnitude from the run params. A headless trivial build cannot complete its Story because requireEpicAnchor reads only the head. The steering block calls a standalone BUILD record a trivial change's ledger entry (lines 231, 341-342, 463, 536, 557). 16 headless standalone trivial BUILD records exist (15 approved, 1 draft), none with a STORY record.

**State after:** Triage routes trivial work to the issue stage (sizeClass trivial, magnitude small, kind change). finalizeIssue stores kind; the ISSUE renders change wording for kind 'change'. Approving any ISSUE hands the next stage the ISSUE's hash. Build refuses a no-LLD call without an epicHash naming an approved ISSUE. Approving a trivial BUILD completes its Story under the ISSUE. The steering text says trivial work starts with an ISSUE. After one repair run, each of the 16 old BUILDs has a backfilled ISSUE, and its Story is completed, held or (for the draft) left unsettled by the completion rule.

**Zero downtime:** yes — **Data rewrite:** yes

**Steps**

1. Add optional meta.kind ('defect' | 'change') to IssueArtifact; absent reads as defect. finalizeIssue stores params.kind and refuses an unknown value; the renderer and the issue.capture prompt use change wording for 'change'. Stored ISSUEs are untouched. — ↩ rollbackable
2. Make nextAfterIssue put the ISSUE's hash into the emitted build call (standalone.epicHash) and design.story call (params.epicHash), refusing an ISSUE without a 16-hex issueHash. — ↩ rollbackable
3. Flip routeForSizeClass('trivial') to startStage 'issue' and change the triage nextCall to start the issue workflow with sizeClass trivial, magnitude small, kind change. — ↩ rollbackable
4. Make the standalone no-LLD build refuse a call without epicHash (no-identity) or whose epicHash has no approved ISSUE (no-head), replacing the focus-derived hash. — ↩ rollbackable
5. Update the steering block at lines 231, 341-342, 463, 536 and 557 so trivial work and a small bugfix start with an ISSUE and the code-review packet pins it; refresh assets/steering-block.md through the plugin's sync-assets. — ↩ rollbackable
6. Add the repair rule and step 'backfill-issue', ordered before 'units': repair-preview lists one change per headless standalone trivial BUILD; repair writes its ISSUE (kind 'change', magnitude 'small', from the BUILD's focus, triage rationale and summary, under the BUILD's hash, anchored at its epicCreatedAt) approved by the migration actor with the reason recorded. — ↩ rollbackable
7. After deployment, back up .insrc/artifacts, .insrc/journal and docs, run repo.convert repair-preview on this repository and check that it lists 16 backfill-issue changes, then run repair and read result.written, held and failed. Stories are completed or held by the completion rule; the draft BUILD's Story is not settled. — ✕ non-rollbackable

**Backward compat:** IssueArtifact gains an optional field; old ISSUEs read and render as before, and an old client renders a change ISSUE with defect headings (wording only). The triage nextCall for trivial changes shape (issue workflow instead of build); agents follow nextCall verbatim, and the steering text changes in the same release. insrc_build_step now refuses a no-LLD standalone call without epicHash: a caller relying on the minted hash gets a no-identity error naming the issue stage, instead of a headless build. Small (LLD) standalone builds are unchanged. RepairStep and the repair report gain 'backfill-issue' entries (additive). Step 7 writes records and cannot be undone except by restoring the backup.

## 8. Alternatives considered

### 8.1 a1: Issue stage first, with a change kind, and a repair backfill — **CHOSEN**

Triage routes trivial to the issue stage; the ISSUE records a change kind; approval advances to build carrying the ISSUE's hash; build refuses a headless trivial build; a repair rule backfills ISSUEs for the existing headless builds.

routeForSizeClass('trivial') returns startStage 'issue' (producesLld false) and buildNextCall starts the issue workflow with sizeClass 'trivial', magnitude 'small', kind 'change'. finalizeIssue stores meta.kind ('defect' | 'change'; absent reads as defect) beside magnitude. The renderer and the issue.capture prompt use change wording for kind 'change'. nextAfterIssue puts the ISSUE's hash in the build call (standalone.epicHash) and the design.story call (params.epicHash). The standalone no-LLD build refuses a call without epicHash or whose epicHash has no approved ISSUE, instead of minting a hash. For the existing records, repair gains a backfill-issue rule: repair-preview lists one change per headless standalone trivial BUILD; repair writes an ISSUE (kind 'change') from the BUILD's focus and triage rationale under the BUILD's hash, anchored at the BUILD's epicCreatedAt and approved by the migration actor with the reason recorded; the existing units and settle steps then complete or hold each Story by the completion rule. Steering and guide text change to match.

### 8.2 a2: Issue stage first, neutral wording, no kind

Same routing and backfill as a1, but every ISSUE is reworded to fit both defects and changes instead of carrying a kind.

Routing, the advance carrying the ISSUE's hash, the build refusal and the repair backfill are as in a1. Instead of a kind field, the capture prompt and the rendered headings become neutral for every ISSUE ('Problem or request', 'Cause or motivation', 'Intended change').

**Rejected because:** Partial on ac2: rewording every ISSUE degrades defect records to avoid one optional field.

### 8.3 a3: Build writes the ISSUE itself

Keep trivial routed to build; build's implement phase writes a system-approved ISSUE head from the focus before it starts.

Triage keeps startStage 'build'. When a standalone trivial build has no head, implement writes an IssueArtifact (kind change) from the focus and triage rationale under the build's hash, approved by the system, then builds. The existing headless builds are backfilled the same way as a1.

**Rejected because:** Violates ac5 and the person-approved trace rule for all future work.

### 8.4 a4: Anchor fallback only

Leave routing as it is; let Story completion take the anchor from the BUILD record's stamp.

requireEpicAnchor falls back to the work item's BUILD epicCreatedAt when there is no head. Trivial work stays headless; approving its BUILD completes its Story.

**Rejected because:** Only ac4 is met; the trace stays lost.

## 9. References

- **[[c1]]** `code` `src/workflow/triage/classify.ts:36-70`
- **[[c2]]** `code` `src/daemon/steps/triage-step/phases/classify.ts:41-100`
- **[[c3]]** `code` `src/workflow/orchestrator.ts:900-935`
- **[[c4]]** `code` `src/workflow/bugfix/advance.ts:28-62`
- **[[c5]]** `code` `src/workflow/bugfix/next-after-issue.ts:26-95`
- **[[c6]]** `code` `src/daemon/steps/build-step/phases/implement.ts:128-150`
- **[[c7]]** `code` `src/workflow/runners/build/admission.ts:245-247`
- **[[c8]]** `code` `src/workflow/artifact-core/codecs.ts:144-180`
- **[[c9]]** `code` `src/workflow/storage.ts:528-557`
- **[[c10]]** `code` `src/workflow/artifacts/issue.ts:10-100`
- **[[c11]]** `code` `src/workflow/runners/issue/index.ts:26-62`
- **[[c12]]** `code` `src/workflow/convert/repair.ts:53-120`
- **[[c13]]** `code` `src/workflow/convert/settle.ts:25-45`
- **[[c14]]** `prior-artifact` `.insrc/artifacts/BUILD-d6eb2fb5ac627b66-s1.json`
- **[[c15]]** `prior-artifact` `.insrc/artifacts/BUILD-6fb63e5090d2e35f-s1.json`
- **[[c16]]** `doc` `src/prompts/steering-block.md:231`
- **[[c17]]** `doc` `src/prompts/steering-block.md:341-342`
- **[[c18]]** `doc` `src/prompts/steering-block.md:463`
- **[[c19]]** `doc` `src/prompts/steering-block.md:536`
- **[[c20]]** `doc` `src/prompts/steering-block.md:557`
- **[[c21]]** `code` `src/workflow/triage/__tests__/classify.test.ts:41-97`
- **[[c22]]** `code` `src/daemon/steps/triage-step/__tests__/handler.test.ts:80-88`
- **[[c23]]** `code` `src/workflow/bugfix/__tests__/bugfix-mount.test.ts`
- **[[c24]]** `code` `src/workflow/convert/__tests__/repair-settle.test.ts`
- **[[c25]]** `code` `src/workflow/convert/__tests__/repair-kit.ts`
