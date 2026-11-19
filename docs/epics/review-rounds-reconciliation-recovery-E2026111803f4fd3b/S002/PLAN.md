<!-- insrc:artifact PLAN-03f4fd3b9102aab8-s2 -->

# Plan: STORY-03f4fd3b9102aab8-s2

## Summary

**Epic:** `review-rounds-reconciliation-recovery`
**LLD run:** `wf-1795095635590-gkstbp`
**LLD effective hash:** `6d57abfa68ac...`

Building s2 means adding one small new type module to src/workflow/review-round/: the fixed five-category taxonomy every review finding is classified under, the Finding shape itself (id, category, severity), and a documented HIGH/MED fallback severity scale. There's no new logic or runtime behavior -- just types, a compile-time fixture proving the shape is closed and exact, and a matching named test suite.

## Contents

1. [Tasks](#1-tasks)
2. [Test-strategy coverage](#2-test-strategy-coverage)
3. [References](#3-references)

## 1. Tasks

| # | Task | Size | Status | Depends on | Tests | Derived from |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| 1 | **`t1`** Add FindingCategory, Finding and DEFAULT_SEVERITY_SCALE | S | — | — | unit: Finding and FindingCategory are exported with the exact documented field shapes, including the id field | [[c1]] [[c2]] [[c3]] |
| 2 | **`t2`** Add the full named test suite for Finding/FindingCategory | M | — | `t1` | unit: FindingCategory accepts exactly the five fixed categories (correctness, functional-completeness, security, quality, maintainability) and rejects any other category value at compile time; unit: Finding.severity accepts any string value, including a review-type-specific custom severity scale outside HIGH/MED; unit: DEFAULT_SEVERITY_SCALE names HIGH and MED as the documented fallback scale for a review type that declares none; unit: Finding's exported shape contains exactly id, category and severity, and no other field of any kind; unit: two Finding values with identical category and severity but different id values are distinct findings | [[c4]] [[c5]] |

### 1.1 TASK-03f4fd3b9102aab8-s2-t1 — Add FindingCategory, Finding and DEFAULT_SEVERITY_SCALE

Add src/workflow/review-round/finding.ts exporting FindingCategory (fixed 5-member union), Finding {id, category, severity} (sc2's interfaceSketch as amended by HLD rev4), and DEFAULT_SEVERITY_SCALE = ['HIGH','MED'] as const, plus a compile-time typecheck fixture at __type-tests__/finding.typecheck.ts.

**Acceptance checks:**
- FindingCategory, Finding and DEFAULT_SEVERITY_SCALE are exported exactly as dataModelChanges specifies, with no extra or missing field
- the typecheck fixture rejects an invalid category literal and an added/removed Finding key via @ts-expect-error / Equal<keyof Finding,...>

### 1.2 TASK-03f4fd3b9102aab8-s2-t2 — Add the full named test suite for Finding/FindingCategory

One it() per testStrategy.testLevels subject (6 total) in __tests__/finding.test.ts, matching ac1/ac2's acceptanceMapping.provingTests verbatim, exercising the compile-time fixture from t1.

**Acceptance checks:**
- All 6 named test subjects from testStrategy.testLevels[0].subjects exist as individual it() cases with matching titles
- ac1 and ac2's acceptanceMapping.provingTests all pass
- npx tsx --test for the new test file passes with zero failures

## 2. Test-strategy coverage

| LLD strategy item | Covered by |
| :--- | :--- |
| Finding and FindingCategory are exported with the exact documented field shapes, including the id field | `t1` |
| FindingCategory accepts exactly the five fixed categories (correctness, functional-completeness, security, quality, maintainability) and rejects any other category value at compile time | `t2` |
| Finding.severity accepts any string value, including a review-type-specific custom severity scale outside HIGH/MED | `t2` |
| DEFAULT_SEVERITY_SCALE names HIGH and MED as the documented fallback scale for a review type that declares none | `t2` |
| Finding's exported shape contains exactly id, category and severity, and no other field of any kind | `t2` |
| two Finding values with identical category and severity but different id values are distinct findings | `t2` |

## 3. References

- **[[c1]]** `prior-artifact` `LLD s2 dataModelChanges: FindingCategory`
- **[[c2]]** `prior-artifact` `LLD s2 dataModelChanges: Finding`
- **[[c3]]** `prior-artifact` `LLD s2 dataModelChanges: DEFAULT_SEVERITY_SCALE`
- **[[c4]]** `prior-artifact` `LLD s2 testStrategy acceptanceMapping ac1`
- **[[c5]]** `prior-artifact` `LLD s2 testStrategy acceptanceMapping ac2`
