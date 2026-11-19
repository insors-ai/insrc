<!-- insrc:artifact PLAN-50cde239426d6e2a-s4 -->

# Plan: STORY-50cde239426d6e2a-s4

## Summary

**Epic:** `shared-reviewcontext-data-model`
**LLD run:** `wf-1795074401621-3ti5hc`
**LLD effective hash:** `720f2f3adc55...`

This Story adds CommentEntry and ReviewContextRound -- a flat, provenance-tagged freeform-context record and the root-level round field every review attempt stamps. The build is two Tasks: land the three types, then write the full named test suite proving CommentEntry's exact field set (no verdict/severity/dimension channel) and the absence of any cross-artifact scoping field.

## Contents

1. [Tasks](#1-tasks)
2. [Test-strategy coverage](#2-test-strategy-coverage)
3. [References](#3-references)

## 1. Tasks

| # | Task | Size | Status | Depends on | Tests | Derived from |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| 1 | **`t1`** Add CommentParty, CommentEntry and ReviewContextRound types | S | — | — | unit: CommentParty, CommentEntry and ReviewContextRound are exported with the exact documented field shapes | [[c1]] |
| 2 | **`t2`** Write unit tests for CommentParty, CommentEntry and ReviewContextRound | S | — | `t1` | unit: a ReviewContextRound built for attempt N carries round=N at the root level; unit: a CommentEntry carries round, party, timestamp and text as first-class fields; unit: CommentEntry's exported shape contains no verdict, severity or dimension field of any kind; unit: a CommentEntry.party value outside 'submitter'\\|'reviewer' is rejected at compile time (type-level check, not a runtime test); unit: CommentEntry's and ReviewContextRound's exported shapes contain no artifactId or other cross-artifact scoping field of any kind; unit: a ReviewContextRound with an empty comments array is structurally valid; unit: multiple CommentEntry values in the same round from different parties with identical timestamps are both recorded; unit: a CommentEntry.text that is an empty string is structurally valid | [[c1]] [[c2]] |

### 1.1 TASK-50cde239426d6e2a-s4-t1 — Add CommentParty, CommentEntry and ReviewContextRound types

Add type CommentParty = 'submitter' | 'reviewer', interface CommentEntry { readonly round, party, timestamp, text }, and interface ReviewContextRound { readonly round, comments: readonly CommentEntry[] } to src/workflow/artifact-core/types.ts, exactly sc5's interfaceSketch with zero additional fields, per the approved alternative a1.

**Acceptance checks:**
- CommentParty, CommentEntry and ReviewContextRound are exported from types.ts with exactly sc5's interfaceSketch field shapes
- CommentEntry carries no verdict, severity or dimension field of any kind
- CommentEntry and ReviewContextRound carry no artifactId or other cross-artifact scoping field of any kind
- tsc --noEmit passes with the new types in place

### 1.2 TASK-50cde239426d6e2a-s4-t2 — Write unit tests for CommentParty, CommentEntry and ReviewContextRound

Add a flat kebab-case *.test.ts file under src/workflow/artifact-core/__tests__/ covering: the root-level round field, CommentEntry's exact field set (no verdict/severity/dimension), the absence of any cross-artifact scoping field, and the documented empty/duplicate-timestamp/empty-text edge cases -- one test case per testStrategy.testLevels subject, matching ac1/ac2/ac3's acceptanceMapping verbatim.

**Acceptance checks:**
- Every subject named in the LLD's testStrategy.testLevels has a corresponding test case
- ac1, ac2 and ac3's provingTests from the LLD's acceptanceMapping all pass
- npx tsx --test for the new test file passes with zero failures

## 2. Test-strategy coverage

| LLD strategy item | Covered by |
| :--- | :--- |
| a ReviewContextRound built for attempt N carries round=N at the root level | `t2` |
| a CommentEntry carries round, party, timestamp and text as first-class fields | `t2` |
| CommentEntry's exported shape contains no verdict, severity or dimension field of any kind | `t2` |
| a CommentEntry.party value outside 'submitter'\|'reviewer' is rejected at compile time (type-level check, not a runtime test) | `t2` |
| CommentEntry's and ReviewContextRound's exported shapes contain no artifactId or other cross-artifact scoping field of any kind | `t2` |
| a ReviewContextRound with an empty comments array is structurally valid | `t2` |
| multiple CommentEntry values in the same round from different parties with identical timestamps are both recorded | `t2` |
| a CommentEntry.text that is an empty string is structurally valid | `t2` |

## 3. References

- **[[c1]]** `prior-artifact` `LLD s4 dataModelChanges (CommentParty, CommentEntry, ReviewContextRound)`
- **[[c2]]** `prior-artifact` `LLD s4 testStrategy (testLevels and acceptanceMapping)`
