<!-- insrc:artifact PLAN-1b3caadf04023d33-s1 -->

# Plan: STORY-1b3caadf04023d33-s1

## Summary

**Epic:** `steering-does-not-make-impact-analysis`
**LLD run:** `wf-1795511637857-wm1qcn`
**LLD effective hash:** `85cae4635eea...`

The build is seven tasks in dependency order: the LLD and PLAN gain an optional Epic impact analysis (type, field, markdown section, first-step schema); a read-only digest of what the Epic's other Stories built is added with the shared label and first action; design.story's and plan's first prompts and synthesize check, and the build implement prompts, are wired to it; the BUILD approval refuses a later Story's BUILD whose summary lacks the labelled paragraph; then the steering text and docs/workflow.md say so. Existing artifacts, the approval refusals and every first or standalone Story are unchanged.

## Contents

1. [Tasks](#1-tasks)
2. [Test-strategy coverage](#2-test-strategy-coverage)
3. [References](#3-references)

## 1. Tasks

| # | Task | Size | Status | Depends on | Tests | Derived from |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| 1 | **`t1`** EpicImpactAnalysis on the LLD and PLAN: type, optional field, sections and first-step schemas | M | — | — | unit: epic-impact-artifacts.test.ts: an LLD and a PLAN with an epicImpact render an 'Epic impact analysis' section, one without it renders exactly as before, and a synthesize with a non-null digest and no analysis (or an empty one) is rejected with the reason | [[c1]] [[c2]] |
| 2 | **`t2`** The built-state digest, its renderer and the shared label and first action | M | — | `t1` | unit: epic-built-state-digest.test.ts: buildEpicBuiltStateDigest returns null for a standalone Story, for an Epic's first Story and for an Epic with no other Story that has an approved BUILD, and otherwise lists the other Stories in the Define's order without the Story at hand; unit: epic-built-state-digest.test.ts: a Story whose BUILD or TESTS record is missing or malformed, or whose commits cannot be listed, is listed with a note naming what was unreadable, the other Stories are still digested, and the builder never throws; unit: epic-built-state-digest.test.ts: the newest Stories are in full and older ones are a summary line and a path, the rendered text never exceeds the total cap, and truncated says how many Stories were reduced; unit: epic-built-state-digest.test.ts: renderEpicBuiltStateDigest renders the same digest to the same text and a null digest to one line that says the analysis does not apply and why | [[c3]] [[c5]] |
| 3 | **`t3`** The design.story and plan first prompts and the synthesize requirement | M | — | `t1`, `t2` | integration: epic-impact-prompts.test.ts: the design.story and plan context.assemble prompts for a later Story of an Epic lead with EPIC_IMPACT_FIRST_ACTION and carry the rendered digest above the Story detail or the LLD handoff, and the prompts for a first or standalone Story carry only the one-line 'does not apply'; unit: epic-impact-artifacts.test.ts: an LLD and a PLAN with an epicImpact render an 'Epic impact analysis' section, one without it renders exactly as before, and a synthesize with a non-null digest and no analysis (or an empty one) is rejected with the reason | [[c2]] [[c3]] |
| 4 | **`t4`** The build implement prompts | M | — | `t2` | integration: render.test.ts: the build implement prompt for a later Story begins its Process with the Epic impact analysis and the digest and tells the builder to open its BUILD summary with a paragraph labelled EPIC_IMPACT_LABEL naming each covered Story and that BUILD approval is refused without it, and for a first or standalone Story gains only the one-line 'does not apply' | [[c2]] [[c3]] |
| 5 | **`t5`** The BUILD approval check | M | — | `t1`, `t2` | unit: epic-impact-build-check.test.ts: checkBuildEpicImpact does not apply to a Story with no approved LLD, whose LLD has no epicImpact or whose epicImpact says it does not apply, and for a later Story refuses a BUILD summary with no 'Epic impact:' paragraph, one that is under the minimum length, or one that does not name each Story the LLD's analysis covered as a whole token inside that paragraph, and passes one that does, and never throws on an unreadable record; integration: epic-impact-build-check.test.ts: approveWorkflowTarget over a later Story's BUILD without the paragraph returns it in skipped[] with the reason and the kind 'epic-impact-missing' (when skipKinds is set) and creates no record, approves it with an explicit overrideReview, approves one with the paragraph, and leaves a first Story's BUILD, a test record and every existing refusal as they were | [[c4]] |
| 6 | **`t6`** The steering text | S | — | `t3`, `t4`, `t5` | integration: steering-epic-impact.test.ts: the design.story, plan and build guide sections of the shipped steering block each state the rule, the build section states that the BUILD summary must carry the labelled paragraph and that approval is refused without it, the skeleton's feature route points at it, no new marker pair was added, and the existing sections are still addressable by name | [[c1]] [[c6]] |
| 7 | **`t7`** docs/workflow.md and the documentation test | S | — | `t6` | integration: build-commands-doc.test.ts or a docs test: docs/workflow.md describes the Epic impact analysis, the digest and its caps and the BUILD approval check in line with the code | [[c3]] [[c4]] |

### 1.1 TASK-1b3caadf04023d33-s1-t1 — EpicImpactAnalysis on the LLD and PLAN: type, optional field, sections and first-step schemas

Add the EpicImpactAnalysis type ({ applies, reason?, storiesCovered, findings, sources }) and the optional epicImpact field to LldBody (src/workflow/artifacts/lld.ts) and PlanBody (src/workflow/artifacts/plan.ts), each with a section builder that renders an 'Epic impact analysis' section only when the field is present (so existing artifacts and their markdown are byte-for-byte unchanged); add the optional epicImpact to the design.story and plan first-step context schemas (src/workflow/runners/design-story/schemas.ts, src/workflow/runners/plan/schemas.ts). Refresh the module-state and session-source inventory fixtures only for the files this task changes. Tests in epic-impact-artifacts.test.ts (the render part).

**Acceptance checks:**
- an LLD and a PLAN with an epicImpact render an 'Epic impact analysis' section and one without it renders exactly as before (a golden comparison with an existing artifact)
- the first-step schemas accept an epicImpact and still accept a context without one
- no inventory test case fails beyond the four that already fail on a clean checkout

### 1.2 TASK-1b3caadf04023d33-s1-t2 — The built-state digest, its renderer and the shared label and first action

Add src/workflow/epic-built-state.ts with buildEpicBuiltStateDigest (reads the Epic's Define, each other Story's BUILD and TESTS records, storyChangeSet files and the LLD's contract names through four injectable reads; bounded by perStoryChars, totalChars and fullStories; null for a standalone or first Story or when no other Story has an approved BUILD; unreadable records noted, never thrown), renderEpicBuiltStateDigest (deterministic text; one line for null), EPIC_IMPACT_LABEL ('Epic impact:') and EPIC_IMPACT_FIRST_ACTION. Refresh inventory fixtures only for what this task adds. Tests in epic-built-state-digest.test.ts over temporary Epic records.

**Acceptance checks:**
- buildEpicBuiltStateDigest returns null for a standalone Story, for an Epic's first Story and for an Epic with no other Story that has an approved BUILD, and otherwise lists the other Stories in the Define's order without the Story at hand
- a Story whose BUILD or TESTS record is missing or malformed, or whose commits cannot be listed, is listed with a note naming what was unreadable, the other Stories are still digested, and the builder never throws
- the newest Stories are in full and older ones are a summary line and a path, the rendered text never exceeds the total cap, and truncated says how many Stories were reduced
- renderEpicBuiltStateDigest renders the same digest to the same text and a null digest to one line saying the analysis does not apply and why
- the module reads only and writes nothing, creates no ref and leaves the working tree unchanged
- no inventory test case fails beyond the four that already fail on a clean checkout

### 1.3 TASK-1b3caadf04023d33-s1-t3 — The design.story and plan first prompts and the synthesize requirement

Render the digest above the Story detail or the LLD handoff and make EPIC_IMPACT_FIRST_ACTION the first action in design.story's and plan's context.assemble prompts (src/workflow/runners/design-story/index.ts, src/workflow/runners/plan/index.ts); a first or standalone Story gets only the one-line 'does not apply'; at synthesize design.story and plan reject a later Story's LLD or PLAN without a non-empty analysis (applies:true, findings, at least one source) and carry epicImpact verbatim from the first step into the LLD and the PLAN. Refresh inventory fixtures only for what this task changes. Tests in epic-impact-prompts.test.ts and the synthesize check in epic-impact-artifacts.test.ts.

**Acceptance checks:**
- the design.story and plan context.assemble prompts for a later Story lead with EPIC_IMPACT_FIRST_ACTION and carry the rendered digest above the Story detail or the LLD handoff, and the prompts for a first or standalone Story carry only the one-line 'does not apply'
- a synthesize with a non-null digest and no analysis, or an empty one, is rejected with the reason, and one with an analysis carries it into the LLD and the PLAN
- the existing prompt and synthesize tests still pass and no inventory test case fails beyond the four that already fail on a clean checkout

### 1.4 TASK-1b3caadf04023d33-s1-t4 — The build implement prompts

Add the digest and the first action to both build implement renderers (renderImplementPrompt and renderStandaloneImplementPrompt in src/daemon/steps/build-step/render.ts) through a new placeholder in src/prompts/build/implement-task.md that begins the Process with the Epic impact analysis and tells the builder the BUILD summary must open with a paragraph labelled EPIC_IMPACT_LABEL naming each Story the LLD's analysis covered, repeated in its final validate call, and that BUILD approval is refused without it; a first or standalone Story gets only the one-line 'does not apply'. Refresh inventory fixtures only for what this task changes. Tests in render.test.ts.

**Acceptance checks:**
- the task implement prompt and the standalone implement prompt for a later Story begin their Process with the Epic impact analysis and the digest and tell the builder about the labelled paragraph, the final validate call and the approval refusal
- for a first or standalone Story the prompts gain only the one-line 'does not apply'
- the existing render tests still pass and no inventory test case fails beyond the four that already fail on a clean checkout

### 1.5 TASK-1b3caadf04023d33-s1-t5 — The BUILD approval check

Add checkBuildEpicImpact (a pure read in the workflow layer: the BUILD summary's 'Epic impact:' paragraph, the minimum length constant, each id in the LLD's epicImpact.storiesCovered as a whole token inside it; not applicable for a Story with no approved LLD, no epicImpact or applies:false; unreadable records make it not apply and are logged) and call it from approveOne in approveWorkflowTarget (src/workflow/gates.ts) after the log-conflict refusal and the roll-up retry shortcut and before approveArtifactByJsonPath, skipped when req.overrideReview is set; a refusal is a skipped[] entry with the reason and the new kind 'epic-impact-missing' (added to the kind union and set only when req.skipKinds is true). Refresh inventory fixtures only for what this task changes. Tests in epic-impact-build-check.test.ts.

**Acceptance checks:**
- checkBuildEpicImpact does not apply to a Story with no approved LLD, whose LLD has no epicImpact or whose epicImpact says it does not apply, and for a later Story refuses a summary with no 'Epic impact:' paragraph, one under the minimum length, or one that does not name each covered Story as a whole token inside that paragraph, passes one that does, and never throws on an unreadable record
- approveWorkflowTarget over a later Story's BUILD without the paragraph returns it in skipped[] with the reason and the kind 'epic-impact-missing' (when skipKinds is set) and creates no record, approves it with an explicit overrideReview, approves one with the paragraph, and leaves a first Story's BUILD, a standalone Story's BUILD whose LLD carries an applies:true analysis checked the same way, a test record, a BUILD awaiting a roll-up retry and every existing refusal as they were
- the existing approval tests still pass and no inventory test case fails beyond the four that already fail on a clean checkout

### 1.6 TASK-1b3caadf04023d33-s1-t6 — The steering text

State the rule inside the existing design.story, plan and build guide sections of src/prompts/steering-block.md (the build section also states the labelled paragraph, the check and that approval is refused without it) and add one line to the skeleton's 'Build / add / implement a feature' route; no marker pair is added or removed; the wording uses EPIC_IMPACT_LABEL. A steering test reads the shipped block (steering-epic-impact.test.ts) and the existing guide-section and injection tests still pass.

**Acceptance checks:**
- the design.story, plan and build guide sections each state the rule, the build section states the labelled paragraph and the approval refusal, and the skeleton's feature route points at it
- no new marker pair was added and the existing sections are still addressable by name
- the existing guide-section, steering-injection and boot-refresh tests still pass

### 1.7 TASK-1b3caadf04023d33-s1-t7 — docs/workflow.md and the documentation test

Describe the Epic impact analysis, the digest and its caps, the epicImpact section of the LLD and PLAN, the BUILD paragraph and the approval check (the refusal, the override, when it does not apply) in docs/workflow.md, and add a docs test that reads the label, the kind and the caps from the code and fails when the doc names a different one.

**Acceptance checks:**
- docs/workflow.md describes the Epic impact analysis, the digest and its caps and the BUILD approval check in line with the code
- the docs test passes and fails when the doc names a different label, kind or cap, or states a wrong rule

## 2. Test-strategy coverage

| LLD strategy item | Covered by |
| :--- | :--- |
| epic-built-state-digest.test.ts: buildEpicBuiltStateDigest returns null for a standalone Story, for an Epic's first Story and for an Epic with no other Story that has an approved BUILD, and otherwise lists the other Stories in the Define's order without the Story at hand | `t2` |
| epic-built-state-digest.test.ts: a Story whose BUILD or TESTS record is missing or malformed, or whose commits cannot be listed, is listed with a note naming what was unreadable, the other Stories are still digested, and the builder never throws | `t2` |
| epic-built-state-digest.test.ts: the newest Stories are in full and older ones are a summary line and a path, the rendered text never exceeds the total cap, and truncated says how many Stories were reduced | `t2` |
| epic-built-state-digest.test.ts: renderEpicBuiltStateDigest renders the same digest to the same text and a null digest to one line that says the analysis does not apply and why | `t2` |
| epic-impact-artifacts.test.ts: an LLD and a PLAN with an epicImpact render an 'Epic impact analysis' section, one without it renders exactly as before, and a synthesize with a non-null digest and no analysis (or an empty one) is rejected with the reason | `t1`, `t3` |
| epic-impact-build-check.test.ts: checkBuildEpicImpact does not apply to a Story with no approved LLD, whose LLD has no epicImpact or whose epicImpact says it does not apply, and for a later Story refuses a BUILD summary with no 'Epic impact:' paragraph, one that is under the minimum length, or one that does not name each Story the LLD's analysis covered as a whole token inside that paragraph, and passes one that does, and never throws on an unreadable record | `t5` |
| epic-impact-prompts.test.ts: the design.story and plan context.assemble prompts for a later Story of an Epic lead with EPIC_IMPACT_FIRST_ACTION and carry the rendered digest above the Story detail or the LLD handoff, and the prompts for a first or standalone Story carry only the one-line 'does not apply' | `t3` |
| render.test.ts: the build implement prompt for a later Story begins its Process with the Epic impact analysis and the digest and tells the builder to open its BUILD summary with a paragraph labelled EPIC_IMPACT_LABEL naming each covered Story and that BUILD approval is refused without it, and for a first or standalone Story gains only the one-line 'does not apply' | `t4` |
| epic-impact-build-check.test.ts: approveWorkflowTarget over a later Story's BUILD without the paragraph returns it in skipped[] with the reason and the kind 'epic-impact-missing' (when skipKinds is set) and creates no record, approves it with an explicit overrideReview, approves one with the paragraph, and leaves a first Story's BUILD, a test record and every existing refusal as they were | `t5` |
| steering-epic-impact.test.ts: the design.story, plan and build guide sections of the shipped steering block each state the rule, the build section states that the BUILD summary must carry the labelled paragraph and that approval is refused without it, the skeleton's feature route points at it, no new marker pair was added, and the existing sections are still addressable by name | `t6` |
| build-commands-doc.test.ts or a docs test: docs/workflow.md describes the Epic impact analysis, the digest and its caps and the BUILD approval check in line with the code | `t7` |

## 3. References

- **[[c1]]** `prior-artifact` `LLD-1b3caadf04023d33-s1 the steering block and its design.story, plan and build guide sections (src/prompts/steering-block.md:294-353)`
- **[[c2]]** `prior-artifact` `LLD-1b3caadf04023d33-s1 the first steps of design.story and plan and the build implement prompt (src/workflow/runners/design-story/index.ts:136-175)`
- **[[c3]]** `prior-artifact` `LLD-1b3caadf04023d33-s1 what records a built Story and where the BUILD summary is written (src/workflow/runners/build/story-commits.ts)`
- **[[c4]]** `prior-artifact` `LLD-1b3caadf04023d33-s1 approveWorkflowTarget and approveOne, where a BUILD approval is withheld (src/workflow/gates.ts:956-1060)`
- **[[c5]]** `prior-artifact` `LLD-1b3caadf04023d33-s1 the only sibling-related wording in the stages (src/workflow/runners/design-story/index.ts:377)`
- **[[c6]]** `prior-artifact` `LLD-1b3caadf04023d33-s1 the tests the change would extend (src/daemon/__tests__/guide-sections.test.ts)`
