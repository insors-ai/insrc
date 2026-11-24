<!-- insrc:artifact LLD-1b3caadf04023d33-s1 -->

# LLD: STORY-1b3caadf04023d33-s1 — Revise the LLD for ISSUE-1b3caadf04023d33 (Epic impact analysis as the first activity of every later Story stage). The user confirmed the previous LLD's choice (a2: text rule plus a daemon-built bounded built-state digest), constraints k1-k6, acceptance criteria ac1-ac5, the new names and the citation map, and decided that the BUILD must be CHECKED, not only prompted: a later Story's BUILD whose summary lacks the Epic impact paragraph must be withheld at approval. Add that check (a new skipped[] kind in approveWorkflowTarget in src/workflow/gates.ts, passable only with an explicit overrideReview) and a new acceptance criterion ac6 for it; keep everything else of the previous design.

## Summary

**Epic:** `steering-does-not-make-impact-analysis`
**HLD base run:** `wf-1795511637857-wm1qcn`
**HLD effective hash:** `85cae4635eea...`

For a Story that is not its Epic's first, the daemon builds a bounded, deterministic digest of what the Epic's other Stories have already built (their BUILD and TESTS records, the files their own commits changed, the contracts their LLDs name and the deviations their BUILD records disclose) and puts it at the top of the first prompt of design.story, plan and build, where the first action is an Epic impact analysis of that digest against the Story at hand. The steering says the same in the design.story, plan and build guide sections and in one line of the skeleton. The analysis is carried into the LLD and the PLAN as a required section, and into the BUILD summary as an 'Epic impact:' paragraph that the daemon checks: approving a later Story's BUILD without that paragraph, naming each Story the LLD's analysis covered, is refused into skipped[] unless an explicit override reason is given. A first or standalone Story gets no digest, no check and a one-line 'does not apply'.

## Contents

1. [HLD context](#1-hld-context)
2. [Contract details](#2-contract-details)
3. [Data model changes](#3-data-model-changes)
4. [Error paths](#4-error-paths)
5. [Test strategy](#5-test-strategy)
6. [Migration](#6-migration)
7. [Alternatives considered](#7-alternatives-considered)
8. [References](#8-references)
9. [Open questions](#9-open-questions)

## 1. HLD context

**Framework:** Standalone feature — no parent HLD. Design directly against the repo, grounded on the s1 analyze passes. There are no HLD shared contracts to honour.
**Rollout phase:** standalone

## 2. Contract details

**Surface level:** internal

### 2.1 `buildEpicBuiltStateDigest`

```typescript
buildEpicBuiltStateDigest(repoPath: string, epicHash: string, storyId: string, opts?: EpicDigestOptions): EpicBuiltStateDigest | null
```

**Parameters:**
- `repoPath: string` — The registered repository the Epic lives in
- `epicHash: string` — The Epic's hash
- `storyId: string` — The Story whose stage is starting; it is left out of the digest
- `opts: EpicDigestOptions` _(optional)_ — { perStoryChars?: number; totalChars?: number; fullStories?: number; readBuild?, readTests?, changedFiles?, contractNames? } size caps and test seams for the four reads

**Returns:** `EpicBuiltStateDigest | null` — null when there is nothing to analyse (a standalone Story, an Epic with no other Story, or no other Story with an approved BUILD); otherwise the digest.

**Errors:**
- `never throws` when A Story whose record cannot be read, or whose commits cannot be listed, is listed with a note saying what was unreadable; the function does not throw and never returns a partial entry as if complete.

**Preconditions:**
- The Epic's Define is approved (an epic Story); a standalone Story has none and gets null.

**Postconditions:**
- Other Stories are listed in the Define's order, never the Story at hand.
- The newest `fullStories` Stories with an approved BUILD are in full; older ones are one summary line and the path of their records.
- The rendered size never exceeds `totalChars`; when something is dropped, `truncated` says how many Stories were reduced.
- Read-only: nothing is written and no ref, index or working tree changes.

### 2.2 `renderEpicBuiltStateDigest`

```typescript
renderEpicBuiltStateDigest(digest: EpicBuiltStateDigest | null): string
```

**Parameters:**
- `digest: EpicBuiltStateDigest | null` — The digest, or null

**Returns:** `string` — The markdown block placed at the top of a stage's first prompt; for null, one line saying the Epic impact analysis does not apply and why.

**Errors:**
- `never throws` when Pure function of its argument.

**Postconditions:**
- The same digest renders to the same text.

### 2.3 `EPIC_IMPACT_FIRST_ACTION`

```typescript
const EPIC_IMPACT_FIRST_ACTION: string
```

**Returns:** `string` — The one shared instruction placed first in the design.story and plan context.assemble prompts and the build implement prompt: analyse the digest against the Story at hand, open the cited records for anything needed in full, record the result, and (for build) open the BUILD summary with a paragraph labelled EPIC_IMPACT_LABEL naming each Story the analysis covered.

**Postconditions:**
- The three stages and the BUILD check use the same label, so the prompt and the check cannot drift apart.

### 2.4 `EPIC_IMPACT_LABEL`

```typescript
const EPIC_IMPACT_LABEL: 'Epic impact:'
```

**Returns:** `'Epic impact:'` — The label that starts the BUILD summary's impact paragraph, used by the implement prompt and by the approval check.

**Postconditions:**
- A single definition; the steering text quotes it.

### 2.5 `checkBuildEpicImpact`

```typescript
checkBuildEpicImpact(repoPath: string, buildJsonPath: string): EpicImpactCheck
```

**Parameters:**
- `repoPath: string` — The registered repository
- `buildJsonPath: string` — The BUILD artifact's JSON path, as approveOne has it

**Returns:** `EpicImpactCheck` — { ok: true } when the check does not apply or passes; { ok: false; reason: string; missing: 'paragraph' | 'stories'; stories: string[] } when the BUILD's summary has no 'Epic impact:' paragraph of at least the minimum length, or the paragraph does not name each Story the LLD's analysis covered.

**Errors:**
- `never throws` when An unreadable BUILD or LLD record makes the check not apply (ok: true) and is logged, so the refusal never replaces the existing approval errors.

**Postconditions:**
- Does not apply, and returns ok, for a Story with no approved LLD, whose LLD has no epicImpact, or whose epicImpact says applies:false (a first, standalone or pre-change Story).
- Reads only; nothing is written.

### 2.6 `approveWorkflowTarget (BUILD approval)`

```typescript
approveWorkflowTarget(req: WorkflowApproveRequest): Promise<WorkflowApproveResult>  // skipped[].kind gains 'epic-impact-missing'
```

**Parameters:**
- `req: WorkflowApproveRequest` — The existing request; req.overrideReview is the only bypass

**Returns:** `Promise<WorkflowApproveResult>` — A BUILD that fails checkBuildEpicImpact and carries no overrideReview goes to skipped[] before its record is created, with the reason and the kind 'epic-impact-missing' when req.skipKinds is set; every other target is unchanged.

**Errors:**
- `none new` when The refusal is a skipped[] entry, like the team refusal; it is not thrown.

**Postconditions:**
- With an explicit overrideReview the BUILD is approved as before and the override reason is recorded by the existing path.
- The check runs after the log-conflict refusal and before the BUILD record is created, beside the team refusal.

### 2.7 `contextAssemble (design-story)`

```typescript
contextAssemble: LlmPauseRunner<LldContext>
```

**Returns:** `LldContext` — Gains an optional epicImpact field the controller fills first.

**Postconditions:**
- For a later Story the user turn carries the rendered digest above the Story detail and EPIC_IMPACT_FIRST_ACTION leads the action list.
- A standalone or first Story's prompt is unchanged apart from the one-line 'does not apply'.

### 2.8 `contextAssemble (plan)`

```typescript
contextAssemble: LlmPauseRunner<PlanContext>
```

**Returns:** `PlanContext` — Gains an optional epicImpact field the controller fills first.

**Postconditions:**
- As the design-story step: digest above the LLD handoff, action first.

### 2.9 `implement prompt (build)`

```typescript
src/prompts/build/implement-task.md rendered by src/daemon/steps/build-step/render.ts with a new epicImpact placeholder
```

**Returns:** `string` — The implement prompt; for a later Story it begins its Process with the Epic impact analysis and the digest and tells the builder that its BUILD summary must open with a paragraph labelled EPIC_IMPACT_LABEL naming each Story the LLD's analysis covered, and that BUILD approval is refused without it.

**Postconditions:**
- A standalone or first Story's rendered prompt gains only the one-line 'does not apply'.

### 2.10 `steering sections`

```typescript
src/prompts/steering-block.md: the design.story, plan and build guide sections and one line of the skeleton's feature route
```

**Returns:** `string` — Text only.

**Postconditions:**
- Each of the three sections states the rule; the build section also states that the BUILD summary must carry the labelled paragraph and that BUILD approval is refused without it; the skeleton line points at all of it.

## 3. Data model changes

### 3.1 `EpicBuiltStateDigest` — new

{ epicHash; forStory; stories: { storyId; title; detail: 'full' | 'line'; buildPath?; buildSummary?; taskVerdicts?; testsPath?; testsResult?; changedFiles?; contractNames?; deviations?; note? }[]; truncated: { reducedStories: number } | null }. Built per prompt from existing records and git; never stored.

**Call sites:**
- `src/workflow/gates.ts:373-389`
- `src/workflow/runners/build/story-commits.ts`
- `src/workflow/storage.ts:406`

### 3.2 `EpicImpactAnalysis` — new

The controller's analysis: { applies: boolean; reason?: string; storiesCovered: string[]; findings: string; sources: string[] }. 'applies: false' with a reason for a first or standalone Story. Carried verbatim from the first step into the LLD and the PLAN; its storiesCovered is what the BUILD check requires the summary paragraph to name.

**Call sites:**
- `src/workflow/runners/design-story/schemas.ts:20-23`
- `src/workflow/runners/plan/schemas.ts:53-56`

### 3.3 `LldBody.epicImpact` — field-add

Optional EpicImpactAnalysis; rendered by the LLD markdown as an 'Epic impact analysis' section after the summary, omitted when absent so existing LLDs are unchanged.

**Call sites:**
- `src/workflow/artifacts/lld.ts:143`

### 3.4 `PlanBody.epicImpact` — field-add

Optional EpicImpactAnalysis, rendered as an 'Epic impact analysis' section of the PLAN; omitted when absent.

**Call sites:**
- `src/workflow/artifacts/plan.ts:88`

### 3.5 `WorkflowApproveResult.skipped[].kind` — field-modify

The kind union 'review-blocked' | 'team-refused' gains 'epic-impact-missing'; entries without a kind and callers that do not set skipKinds are unchanged.

**Call sites:**
- `src/workflow/gates.ts:882`
- `src/workflow/gates.ts:961`

### 3.6 `approveOne (BUILD pre-record refusals)` — invariant-change

The list of refusals made before a BUILD record is created (log conflict, team gate) gains the Epic impact check; the order and the existing refusals are unchanged, and an explicit overrideReview bypasses the new refusal as it does the review block.

**Call sites:**
- `src/workflow/gates.ts:965-969`
- `src/workflow/gates.ts:956-1060`

### 3.7 `design.story and plan synthesize rules` — invariant-change

The synthesizer's 'carried verbatim' list gains the s1 epicImpact; every existing verbatim rule is unchanged.

**Call sites:**
- `src/workflow/runners/design-story/index.ts:136-175`
- `src/workflow/runners/plan/index.ts:83-125`

## 4. Error paths

**Error cases**

- **A sibling Story's BUILD or TESTS record is missing, malformed or cannot be read.** (recoverable)
  - Detection: The per-Story read in buildEpicBuiltStateDigest is wrapped; a missing file, a JSON parse error or a record that fails the artifact shape is caught for that Story only.
  - Response: That Story is listed with a note naming what was unreadable and no invented content; the other Stories are digested as usual; the digest is never silently shorter.
  - User impact: The controller sees the gap and must open the record itself or say it could not; a corrupt record does not stop the stage.
- **The Story's own commits cannot be listed (git fails, or the Story predates the Insrc-Story trailer).** (recoverable)
  - Detection: The change-set read (storyChangeSet) throws or returns an empty list for a Story that has an approved BUILD.
  - Response: The Story's entry says the changed files are unknown and why; files are never guessed from a time range; the BUILD record's own task list stays as the evidence.
  - User impact: A Story built before the trailer has a thinner digest; the analysis says so rather than assuming it touched nothing.
- **The Epic's Define cannot be read or is not approved when a later Story's stage starts.** (recoverable)
  - Detection: requireApprovedEpic fails inside the digest builder.
  - Response: The builder returns null with the reason and the stage runs as it does today; the failure of the Define gate is the stage's own existing error, not a new one.
  - User impact: No new failure mode: a stage that could not start before still cannot.
- **The digest is larger than its cap (a large Epic with many Stories).** (recoverable)
  - Detection: The rendered length is measured against totalChars while the Stories are added newest first.
  - Response: Stories beyond the full-detail count are reduced to one summary line and the path of their records, then dropped with a count if the total is still over; truncated reports how many were reduced.
  - User impact: The prompt stays bounded; the controller is told exactly what it was not shown.
- **The controller skips the analysis or answers it with an empty or generic text in design.story or plan.** (recoverable)
  - Detection: At synthesize the runner requires epicImpact when the digest was non-null (applies: true, findings of non-zero length, at least one source).
  - Response: The synthesize call is rejected with the reason, like any schema violation; for a null digest epicImpact is optional.
  - User impact: A later Story's LLD or PLAN cannot be written without an analysis in it.
- **A later Story's BUILD is approved without an 'Epic impact:' paragraph, or with one that is too short or does not name every Story the LLD's analysis covered.** (recoverable)
  - Detection: approveOne calls checkBuildEpicImpact on the BUILD path before creating its record: the BUILD summary is split into paragraphs, the one starting with the label is measured against the minimum length, and each id in the LLD's epicImpact.storiesCovered is looked for in it.
  - Response: The BUILD goes to skipped[] with a reason that names what is missing and the Stories it must name (kind 'epic-impact-missing' when skipKinds is set); nothing is approved or written; a corrected summary is supplied by one more validate call and the approval is asked again; an explicit overrideReview approves it with the reason recorded.
  - User impact: The approval says exactly what to add; no BUILD of a later Story completes without its analysis unless a person gives a reason.
- **The BUILD or the LLD record cannot be read when the check runs.** (recoverable)
  - Detection: checkBuildEpicImpact's reads are wrapped; a missing file or a parse error is caught.
  - Response: The check does not apply and is logged, so the refusal never hides the approval's own errors for an unreadable record (the log-conflict and lifecycle errors still fire).
  - User impact: An unreadable record is reported by the existing paths, not by a second, confusing refusal.
- **A prompt build reads the Epic's records while another process writes them.** (recoverable)
  - Detection: A record read returns a partial file (a parse error) because a write was in progress.
  - Response: Treated as an unreadable record for that Story (first case), and the next prompt build reads it again.
  - User impact: At worst one Story is listed as unreadable once.

**Edge cases**

| Input | Expected |
| :--- | :--- |
| A standalone Story (no Epic) or the Epic's first Story. | buildEpicBuiltStateDigest returns null; the prompts carry one line saying the analysis does not apply and why; epicImpact is optional and, when given, is applies:false; the BUILD check does not apply. |
| An Epic whose earlier Stories are designed but not yet built (no approved BUILD). | Those Stories are not in the digest; if no other Story has an approved BUILD the digest is null with the reason 'no earlier Story has been built', and the stage and the BUILD check proceed without an analysis. |
| A Story whose LLD was approved before this change (no epicImpact) and is built after it. | The BUILD check does not apply: the requirement follows the LLD's analysis, so an in-flight Story is not stranded. |
| A BUILD whose summary has the label but only the label, or a paragraph under the minimum length. | Refused with the reason 'too short'; the minimum is a constant the build sets and documents. |
| A BUILD whose paragraph names a Story id only inside another word, or in a different paragraph. | Not counted: each id must appear as a whole token inside the labelled paragraph. |
| A BUILD summary written by several validate calls. | The last validate call's summary is the one checked, as it is the one stored; the implement prompt tells the builder to repeat the paragraph in its final call. |
| A BUILD approved a second time after a failed first attempt (a retry of the roll-up for an already completed BUILD). | A BUILD already completed and awaiting a roll-up retry is not re-checked; only a first approval is. |
| A later Story is re-run (a second design.story or plan run for the same Story). | The digest is rebuilt from the records as they are at that moment, so a Story built since the last run appears. |
| An Epic with one other built Story, or with fifty. | One is shown in full; fifty are shown as the newest few in full and the rest as a line and a path each, within the total cap. |
| A host agent that never reads insrc_guide. | The prompts of the three stages still carry the digest and the first action, and the BUILD check still refuses, because they come from the daemon; only the guide text is missed. |

**Invariants to preserve**

- The guide sections are cut by exact marker pair and a wording change inside a section does not change which section a name addresses; the new text goes inside the existing design.story, plan and build marker pairs and adds no marker. [[c1]]
- The design.story and plan stages stay controller-driven pause steps whose schema, step order and eight/six-step shape do not change; the digest and the first action only extend the first step's prompt and its context schema. [[c2]]
- The implement prompt keeps its Process list, the Insrc-Story trailer rule and the merge rule; a standalone or first Story's prompt gains only the one-line 'does not apply'. [[c2]]
- The digest is read-only: it uses the existing BUILD and TESTS records and storyChangeSet and writes nothing, creates no ref and changes no working tree. [[c3]]
- The BUILD summary stays an optional narrative that the last validate call sets; the check reads it and never writes or rewrites it. [[c3]]
- approveOne keeps its existing refusals and their order (test record, log conflict, team gate) and the mapping of approval errors to skipped[]; the new refusal is an added skipped[] entry that never throws, and an explicit overrideReview passes it. [[c4]]
- Other Stories' trailered commits stay foreign to this Story's own build review; the digest uses them only to describe what those Stories changed. [[c5]]
- The existing guide-section, steering-injection, implement-prompt and workflow-approval tests keep passing; the new text and the new refusal are additive. [[c6]]

## 5. Test strategy

**Test framework:** `node:test with node:assert/strict (the repo's runner, as in src/daemon/__tests__/guide-sections.test.ts and src/daemon/steps/build-step/__tests__/render.test.ts)`

**Test levels**

- **unit** — Prove the digest builder and its renderer, the BUILD check and the artifact and schema changes over temporary Epic records, with every read replaced by a seam.
  - Subjects: `epic-built-state-digest.test.ts: buildEpicBuiltStateDigest returns null for a standalone Story, for an Epic's first Story and for an Epic with no other Story that has an approved BUILD, and otherwise lists the other Stories in the Define's order without the Story at hand`, `epic-built-state-digest.test.ts: a Story whose BUILD or TESTS record is missing or malformed, or whose commits cannot be listed, is listed with a note naming what was unreadable, the other Stories are still digested, and the builder never throws`, `epic-built-state-digest.test.ts: the newest Stories are in full and older ones are a summary line and a path, the rendered text never exceeds the total cap, and truncated says how many Stories were reduced`, `epic-built-state-digest.test.ts: renderEpicBuiltStateDigest renders the same digest to the same text and a null digest to one line that says the analysis does not apply and why`, `epic-impact-artifacts.test.ts: an LLD and a PLAN with an epicImpact render an 'Epic impact analysis' section, one without it renders exactly as before, and a synthesize with a non-null digest and no analysis (or an empty one) is rejected with the reason`, `epic-impact-build-check.test.ts: checkBuildEpicImpact does not apply to a Story with no approved LLD, whose LLD has no epicImpact or whose epicImpact says it does not apply, and for a later Story refuses a BUILD summary with no 'Epic impact:' paragraph, one that is under the minimum length, or one that does not name each Story the LLD's analysis covered as a whole token inside that paragraph, and passes one that does, and never throws on an unreadable record`
  - Fixtures: `temporary repository with an Epic Define, BUILD and TESTS records for several Stories and trailered commits`, `seams for the BUILD, TESTS, changed-files and contract-name reads`, `BUILD and LLD records with and without an epicImpact and with summaries of each shape`
- **integration** — Prove that the three stages, the steering and the approval path carry and enforce the rule, with the real prompt builders, the shipped steering block and approveWorkflowTarget.
  - Subjects: `epic-impact-prompts.test.ts: the design.story and plan context.assemble prompts for a later Story of an Epic lead with EPIC_IMPACT_FIRST_ACTION and carry the rendered digest above the Story detail or the LLD handoff, and the prompts for a first or standalone Story carry only the one-line 'does not apply'`, `render.test.ts: the build implement prompt for a later Story begins its Process with the Epic impact analysis and the digest and tells the builder to open its BUILD summary with a paragraph labelled EPIC_IMPACT_LABEL naming each covered Story and that BUILD approval is refused without it, and for a first or standalone Story gains only the one-line 'does not apply'`, `epic-impact-build-check.test.ts: approveWorkflowTarget over a later Story's BUILD without the paragraph returns it in skipped[] with the reason and the kind 'epic-impact-missing' (when skipKinds is set) and creates no record, approves it with an explicit overrideReview, approves one with the paragraph, and leaves a first Story's BUILD, a test record and every existing refusal as they were`, `steering-epic-impact.test.ts: the design.story, plan and build guide sections of the shipped steering block each state the rule, the build section states that the BUILD summary must carry the labelled paragraph and that approval is refused without it, the skeleton's feature route points at it, no new marker pair was added, and the existing sections are still addressable by name`, `build-commands-doc.test.ts or a docs test: docs/workflow.md describes the Epic impact analysis, the digest and its caps and the BUILD approval check in line with the code`
  - Fixtures: `the shipped src/prompts/steering-block.md`, `a temporary Epic with a built first Story and a second Story at the start of each stage and at BUILD approval`

**Acceptance mapping**

| Criterion | Proving tests |
| :--- | :--- |
| `ac1` | `epic-impact-prompts.test.ts: the design.story and plan context.assemble prompts for a later Story of an Epic lead with EPIC_IMPACT_FIRST_ACTION and carry the rendered digest above the Story detail or the LLD handoff, and the prompts for a first or standalone Story carry only the one-line 'does not apply'`, `render.test.ts: the build implement prompt for a later Story begins its Process with the Epic impact analysis and the digest and tells the builder to open its BUILD summary with a paragraph labelled EPIC_IMPACT_LABEL naming each covered Story and that BUILD approval is refused without it, and for a first or standalone Story gains only the one-line 'does not apply'` |
| `ac2` | `epic-built-state-digest.test.ts: buildEpicBuiltStateDigest returns null for a standalone Story, for an Epic's first Story and for an Epic with no other Story that has an approved BUILD, and otherwise lists the other Stories in the Define's order without the Story at hand`, `epic-built-state-digest.test.ts: a Story whose BUILD or TESTS record is missing or malformed, or whose commits cannot be listed, is listed with a note naming what was unreadable, the other Stories are still digested, and the builder never throws`, `epic-built-state-digest.test.ts: the newest Stories are in full and older ones are a summary line and a path, the rendered text never exceeds the total cap, and truncated says how many Stories were reduced`, `epic-built-state-digest.test.ts: renderEpicBuiltStateDigest renders the same digest to the same text and a null digest to one line that says the analysis does not apply and why` |
| `ac3` | `epic-impact-artifacts.test.ts: an LLD and a PLAN with an epicImpact render an 'Epic impact analysis' section, one without it renders exactly as before, and a synthesize with a non-null digest and no analysis (or an empty one) is rejected with the reason` |
| `ac4` | `steering-epic-impact.test.ts: the design.story, plan and build guide sections of the shipped steering block each state the rule, the build section states that the BUILD summary must carry the labelled paragraph and that approval is refused without it, the skeleton's feature route points at it, no new marker pair was added, and the existing sections are still addressable by name` |
| `ac5` | `build-commands-doc.test.ts or a docs test: docs/workflow.md describes the Epic impact analysis, the digest and its caps and the BUILD approval check in line with the code` |
| `ac6` | `epic-impact-build-check.test.ts: checkBuildEpicImpact does not apply to a Story with no approved LLD, whose LLD has no epicImpact or whose epicImpact says it does not apply, and for a later Story refuses a BUILD summary with no 'Epic impact:' paragraph, one that is under the minimum length, or one that does not name each Story the LLD's analysis covered as a whole token inside that paragraph, and passes one that does, and never throws on an unreadable record`, `epic-impact-build-check.test.ts: approveWorkflowTarget over a later Story's BUILD without the paragraph returns it in skipped[] with the reason and the kind 'epic-impact-missing' (when skipKinds is set) and creates no record, approves it with an explicit overrideReview, approves one with the paragraph, and leaves a first Story's BUILD, a test record and every existing refusal as they were` |

## 6. Migration

**State before:** The steering is one canonical block (src/prompts/steering-block.md:294-353 for the design.story, plan and build sections), injected by src/daemon/steering-inject.ts and cut into guide sections by src/daemon/guide-sections.ts; none of it asks for an analysis of what an Epic's earlier Stories built. design.story's context.assemble (src/workflow/runners/design-story/index.ts:136-175) lists five discovery actions for the Story alone, plan's context.assemble (src/workflow/runners/plan/index.ts:83-125) reads the approved LLD handoff, and the build implement prompt (src/prompts/build/implement-task.md, rendered by src/daemon/steps/build-step/render.ts) starts from the Story's own LLD and HLD. The LLD and PLAN bodies (src/workflow/artifacts/lld.ts:143 and plan.ts:88) have no place for such an analysis, and approveWorkflowTarget (src/workflow/gates.ts:956-1060) approves a BUILD whatever its summary says: it refuses only a test record, a log conflict, a team-gate refusal and the errors of the approval itself. The built state of earlier Stories sits in their BUILD and TESTS records and trailered commits (src/workflow/runners/build/story-commits.ts) and is read by no stage.

**State after:** For a Story that is not its Epic's first, the first prompt of design.story, plan and build carries a bounded digest of what the Epic's other built Stories changed, with the Epic impact analysis as the first action; the analysis is recorded in the LLD and the PLAN as a required 'Epic impact analysis' section and in the BUILD summary as a labelled 'Epic impact:' paragraph; approving such a BUILD without that paragraph (long enough, naming each Story the LLD's analysis covered) is refused into skipped[] with the kind 'epic-impact-missing' unless an explicit override reason is given; the design.story, plan and build guide sections and one line of the skeleton state the rule. A first, standalone or pre-change Story gets a one-line 'does not apply' and no check. Nothing is stored apart from the analysis in the artifacts the stages already write.

**Zero downtime:** yes — **Data rewrite:** no

**Steps**

1. Add the optional EpicImpactAnalysis field to the LLD and PLAN bodies and to the design.story and plan first-step context schemas, and render an 'Epic impact analysis' section only when it is present, so every existing artifact and its markdown are unchanged. — ↩ rollbackable
2. Add the read-only digest builder and its renderer with the size caps and the unreadable-record notes, using the existing BUILD and TESTS records, the Epic's Define and storyChangeSet. — ↩ rollbackable
3. Add the shared label and first-action text and wire the digest and the first action into design.story's and plan's context.assemble and into the build implement prompt (a new placeholder), with the one-line 'does not apply' for a first or standalone Story; add the synthesize check that a later Story's LLD and PLAN carry a non-empty analysis. — ↩ rollbackable
4. Add the BUILD check and the new skipped kind: the check reads the BUILD summary and the LLD's analysis and applies only when the LLD carries an analysis that applies, and approveOne refuses a failing BUILD before its record is created unless an explicit override reason is given. — ↩ rollbackable
5. State the rule inside the existing design.story, plan and build guide sections (the build section also states the labelled paragraph and the approval refusal) and add one line to the skeleton's feature route in the canonical steering block; no marker pair is added or removed. — ↩ rollbackable
6. Document the Epic impact analysis, the digest and its caps and the BUILD approval check in docs/workflow.md; the next steering refresh (daemon boot) re-stamps the changed skeleton into each registered repository's agent instructions. — ↩ rollbackable

**Backward compat:** No public API changes: no RPC method is added or changed, the artifacts only gain an optional field that older readers ignore and older artifacts omit, the stage step order, schemas and gates are unchanged, and the approval result's skipped[] entry gains one more kind that only appears when a caller sets skipKinds and the check refuses. A host agent on an older steering does not see the new lines until the daemon's boot refresh re-stamps it; the daemon-built prompts and the approval check carry the rule regardless. A Story already in flight has no analysis in its LLD or PLAN; the synthesize requirement applies only to a run started after the change and the BUILD check follows the LLD's analysis, so an approved LLD or PLAN stays valid and its BUILD is not stranded. Clients that list skipped[] reasons (terminal, VS Code, JetBrains) show the new reason as text; a client that switches on the kind must tolerate an unknown one.

## 7. Alternatives considered

### 7.1 a1: Steering and prompt text only

State the rule in the steering and make the impact analysis the first action in each stage's first prompt; record the result in the artifact the stage already writes, with no daemon check.

Add the rule to the design.story, plan and build guide sections in src/prompts/steering-block.md and one line to the skeleton's feature route. Put 'Epic impact analysis' first in the action list of design.story's and plan's context.assemble prompts and first in the Process list of src/prompts/build/implement-task.md, telling the controller to use insrc_analyze_step and the earlier Stories' BUILD and TESTS records, commits and changed code. Carry the result into the LLD and PLAN as an 'Epic impact analysis' section and into the BUILD summary. Nothing in the daemon refuses a stage or a BUILD that skipped it. No new module, no new artifact kind.

**Rejected because:** Smallest, but violates k7 (no check on the build) and is partial on k2 and k4.

### 7.2 a2: Text rule, a daemon-built built-state digest, and a check at BUILD approval — **CHOSEN**

As a1, plus a bounded deterministic digest of what the Epic's other Stories built in each stage's first prompt, plus a refusal to approve a later Story's BUILD whose summary lacks the Epic impact paragraph.

Everything in a1, plus a pure module that, for a Story that is not the Epic's first, lists the Epic's other Stories from the approved Define and for each one with an approved BUILD reads its BUILD summary and per-Task verdicts, its TESTS record, the files its own commits changed (storyChangeSet over the Insrc-Story trailer) and the LLD's contract names, bounded by a per-Story and a total size cap (the newest Stories in full, older ones a line and a path). design.story's and plan's context.assemble user turns and the build implement prompt render the digest above the existing Story detail, with the Epic impact analysis as the first action. design.story and plan require a non-empty analysis in the LLD and PLAN when the digest is non-null. The build is CHECKED at approval: approveOne in approveWorkflowTarget (src/workflow/gates.ts) refuses, before the BUILD record is created, a later Story's BUILD whose summary has no 'Epic impact:' paragraph that names each Story the LLD's analysis covered, reporting it in skipped[] with its own kind; an explicit overrideReview passes it, as it does the other withheld cases. A Story whose LLD has no epicImpact (built before this change) or whose analysis says it does not apply is not checked.

### 7.3 a3: A recorded, gated Epic impact artifact

Make the analysis a new artifact that each later stage requires before it starts.

Add an EpicImpact artifact kind written by a new first step (epic.impact) that design.story, plan and build each run for a Story that is not the Epic's first; each stage's start refuses until an EpicImpact for that Story exists and is current (not older than the newest approved BUILD in the Epic); the LLD, PLAN and BUILD reference it. It is shown through insrc_present and approved or acknowledged like other records.

**Rejected because:** Strongest guarantee, but violates k6 and blocks work whenever the record is stale.

## 8. References

- **[[c1]]** `code` `src/prompts/steering-block.md:294-353` — "s1 bundle 1: the steering block and its design.story, plan and build guide sections (also src/daemon/guide-sections.ts and src/daemon/steering-inject.ts)"
- **[[c2]]** `code` `src/workflow/runners/design-story/index.ts:136-175` — "s1 bundle 2: the first steps of design.story and plan and the build implement prompt (also src/workflow/runners/plan/index.ts:83-125 and src/prompts/build/implement-task.md)"
- **[[c3]]** `code` `src/workflow/runners/build/story-commits.ts` — "s1 bundle 3: what records a built Story and where the BUILD summary is written (also src/workflow/storage.ts:406, src/workflow/gates.ts:373-389 and src/daemon/steps/build-step/phases/validate.ts:575-6"
- **[[c4]]** `code` `src/workflow/gates.ts:956-1060` — "s1 bundle 4: approveWorkflowTarget and approveOne, where a BUILD approval is withheld (also gates.ts:882 and gates.ts:965-969)"
- **[[c5]]** `code` `src/workflow/runners/design-story/index.ts:377` — "s1 bundle 5: the only sibling-related wording in the stages (adjacentBoundaries at index.ts:538 too)"
- **[[c6]]** `code` `src/daemon/__tests__/guide-sections.test.ts` — "s1 bundle 6: the tests the change would extend (also steering-inject.test.ts, build-step render.test.ts and the workflow approval tests)"

## 9. Open questions

- Confirm the BUILD check's form: it requires the last validate call's summary to contain a paragraph that starts with 'Epic impact:', is at least a minimum length (a constant the build sets and documents) and names each Story the LLD's analysis covered as a whole token; it checks presence and the named Stories, not the quality of the paragraph, and an explicit overrideReview passes it. A thin paragraph that names the Stories passes.
- Confirm the citation mapping, extended by one entry for the approval-path bundle: c1 is the steering-delivery bundle, c2 the first-step and implement-prompt bundle, c3 the built-state records bundle, c4 the approval-path bundle, c5 the sibling-read search bundle, c6 the tests bundle (invariant sources use these).
