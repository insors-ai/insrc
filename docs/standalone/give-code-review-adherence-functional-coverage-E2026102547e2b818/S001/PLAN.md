<!-- insrc:artifact PLAN-47e2b81827433589-s1 -->

# Plan: STORY-47e2b81827433589-s1

## Summary

**Epic:** `give-code-review-adherence-functional-coverage`
**LLD run:** `wf-1792923694985-ba40bw`
**LLD effective hash:** `3efd443b024f...`

Reuse the existing read-only reviewer sessions so adherence and functional-coverage judgments can inspect implementation. Update shared divided-review prompts and conservative evidence outcomes, then prove that real omissions remain findings and the four prior false HIGH findings disappear on the affected Story. Task validation covers implementation and regression evidence. The final current-BUILD independent review and human approval remain separate mandatory completion gates.

## Contents

1. [Tasks](#1-tasks)
2. [Test-strategy coverage](#2-test-strategy-coverage)
3. [References](#3-references)

## 1. Tasks

| # | Task | Size | Status | Depends on | Tests | Derived from |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| 1 | **`t1`** Add opt-in source-inspecting execution and divided prompts | M | approved r1 | — | integration: Source-inspection opt-in reaches single, chunk, obligation, relation and reduction calls with bounded read-only sessions; unchanged dimensions retain structured mode.; unit: Shared prompts preserve source citations and uncertainty; no summary-only/closed-evidence assumptions for opted-in calls. | [[c1]] [[c2]] |
| 2 | **`t2`** Ground both dimension verdicts in source evidence | M | approved r1 | `t1` | unit: Both dimension prompts/schema/results distinguish proven breach, LOW observation and legacy missing confidence while preserving filters.; integration: Both dimensions in single/divided pipeline: helper implementation missing from summaries passes, genuine omission remains HIGH, missing notes/unreadable source remain LOW. | [[c1]] [[c3]] |
| 3 | **`t3`** Validate regression evidence and prepare the final review | M | approved r1 | `t1`, `t2` | integration: Affected review-pipeline and dimension suites plus npm run build pass.; live: Updated-code b7a68147dcf72034 s4 re-review: all four prior false HIGH findings absent, with source-backed dispositions.; smoke: Build/regression evidence and successful BUILD/CR presentation are recorded; final review and approval remain mandatory downstream gates. | [[c3]] [[c4]] |

### 1.1 TASK-47e2b81827433589-s1-t1 — Add opt-in source-inspecting execution and divided prompts

Extend ModelDimensionSpec with source-inspection opt-in; use existing reviewer-session execution with code-review timeout/silence limits. Update shared chunk and gather builders for opt-in-aware source inspection in chunk, obligation, relation and reduction calls, preserving citations/uncertainty and other dimensions.

**Acceptance checks:**
- Opted-in single/chunk/gather/relation/reduction calls select reviewer-session mode, repo cwd and existing deadlines; no summary-only or closed-evidence instruction remains on those calls.
- Shared prompts allow read-only Read/Grep/Glob and Codex commands, prohibit writes/test execution, preserve source citations and uncertainty; absent opt-in retains current behavior.
- Regression tests cover execution roles, retry/deadline propagation and missing-session failure without fabricated pass.

### 1.2 TASK-47e2b81827433589-s1-t2 — Ground both dimension verdicts in source evidence

Opt adherence and functional coverage into source inspection; revise single/divided guidance, require confidence and normalize unverified or legacy confidence gaps LOW. Preserve source-proven omissions, scope/FR filters and no-contract behavior. Extend fixtures to read-only sessions.

**Acceptance checks:**
- Both dimensions check relevant source/helpers before breach; summaries and absent notes never prove missing implementation.
- HIGH/MED observations and legacy missing confidence normalize to LOW observation; explicit source-proven full or partial breaches retain appropriate severity and real code location.
- Tests for both dimensions and both paths distinguish helper-implemented behavior absent from summaries, genuinely omitted behavior, missing notes, unreadable source, out-of-scope locations and invalid FR ids.

### 1.3 TASK-47e2b81827433589-s1-t3 — Validate regression evidence and prepare the final review

Run affected suites and build; record the updated-code four-clause s4 re-review, source-backed dispositions and document presentation. Final current-BUILD independent code review and explicit human BUILD approval remain mandatory downstream framework gates; neither depends on t3 already having been approved.

**Acceptance checks:**
- Affected suites and npm run build pass; results recorded with commands and test counts.
- Updated-code s4 re-review provides source-backed dispositions for all four prior false HIGH findings and none recur; unavailable live verification leaves acceptance outstanding.
- Build/regression evidence and successful BUILD/CR presentation are recorded. Final current-BUILD independent code review and explicit human BUILD approval remain mandatory downstream completion gates; their final verdict/approval is not required to validate this task.

## 2. Test-strategy coverage

| LLD strategy item | Covered by |
| :--- | :--- |
| adherence prompt/schema/result tests | `t2` |
| functional-coverage prompt/schema/result tests | `t2` |
| modelDimensionAdapter | `t1`, `t2` |
| codeReviewGather | `t1`, `t2` |
| runReviewJob | `t1`, `t2` |
| Story s4 prior four HIGH findings | `t3` |
| Mandatory post-build code review for this Story | `t3` |

## 3. References

- **[[c1]]** `prior-artifact` `LLD s1 contractDetails`
- **[[c2]]** `prior-artifact` `LLD s1 dataModelChanges ModelDimensionSpec and shared prompt builders`
- **[[c3]]** `prior-artifact` `LLD s1 finding invariants, errorPaths and testStrategy`
- **[[c4]]** `prior-artifact` `LLD s1 migration and ac3 live regression`
