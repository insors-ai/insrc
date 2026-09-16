<!-- insrc:artifact PLAN-599a9b506f22b896-s1 -->

# Plan: E20260915599a9b50:S001

**Epic:** `restructure-docs-artifact-markdown-from-flat`
**LLD run:** `wf-1789494511550-fmc8pb`
**LLD effective hash:** `196ad617cc5c...`

## Tasks

| # | Task | Size | Depends on | Tests | Derived from |
| :--- | :--- | :--- | :--- | :--- | :--- |
| 1 | **`t1`** Widen storyIdToOrdinal + add the WorkItemIdentity/deriveWorkItemIdentity bundle | S | — | unit: storyIdToOrdinal('S001')===('S1')===('s1')===1 and canonicalizes to E<date><hash8>:S001 (ac1); bad id still throws the identical Error; unit: deriveWorkItemIdentity composes canonical/slug/epicSegment/story; story-level 's1'==='S001'; epic-level (storyId omitted) yields story:undefined + no :S segment | [[c1]] [[c2]] [[c3]] |
| 2 | **`t2`** Extend id-resolve.test.ts with case-equivalence + no-regression + round-trip tests | S | `t1` | unit: no-regression: lowercase 's10' byte-identical ordinal/canonical/slug before+after; ordinalToStoryId output unchanged (ac2); unit: both-way round-trip: parseWorkflowId(toCanonical(storyWorkflowId(...,'S001'))) yields story ordinal 1 (lc1) | [[c4]] |

### E20260915599a9b50:S001:T001 — Widen storyIdToOrdinal + add the WorkItemIdentity/deriveWorkItemIdentity bundle

In src/workflow/id.ts: (1) widen storyIdToOrdinal's regex (:102) from /^s(\d+)$/ to /^[sS](\d+)$/ so 's1', 'S1' and 'S001' all parse to the same ordinal — leave the throw message and reject-set otherwise identical, and do NOT touch ordinalToStoryId (:107, its lowercase output is consumed by tracker/resolve.ts:260) or toCanonical. (2) Add a new readonly WorkItemIdentity interface { canonical; slug; epicSegment; story? } and a deriveWorkItemIdentity(epicHash, createdAtISO, storyId?) function that composes the existing epicWorkflowId/storyWorkflowId + toCanonical + toSlug + the E<date><hash8> epic segment — no new parsing logic, delegating story-id parsing to the widened storyIdToOrdinal.

**Acceptance checks:**
- (widening, c1) storyIdToOrdinal('S001') === storyIdToOrdinal('S1') === storyIdToOrdinal('s1') === 1; a genuinely bad id (e.g. 'story-1', '') still throws the identical 'invalid storyId ... (expected s<n>)' Error
- (widening, c1) storyWorkflowId(hash, createdAt, 'S001') then toCanonical yields E<date><hash8>:S001, identical to the lowercase 's1' sibling (ac1)
- (no-regression, c3) ordinalToStoryId and toCanonical are unchanged — a lowercase 's10' produces byte-identical ordinal + canonical/slug before and after (ac2); tracker/resolve.ts:260 unaffected
- (identity bundle, c2) deriveWorkItemIdentity returns { epicSegment, canonical, slug, story } composed from the existing converters; story-level equals for 's1' vs 'S001'; epic-level (storyId omitted) yields story:undefined and no :S segment
- tsc clean; the change is one file (id.ts) and strictly additive

### E20260915599a9b50:S001:T002 — Extend id-resolve.test.ts with case-equivalence + no-regression + round-trip tests

Extend src/workflow/__tests__/id-resolve.test.ts (node:test + node:assert/strict) with: case-equivalence (s1/S1/S001 same ordinal + same canonical), no-regression (lowercase 's10' byte-stable ordinal/canonical/slug; ordinalToStoryId output unchanged; bad-id throw unchanged), the deriveWorkItemIdentity story-level equivalence + epic-level shape, and the both-way round-trip parseWorkflowId(toCanonical(storyWorkflowId(...,'S001'))) === ordinal 1. Reuse a fixed epicHash+createdAt fixture pair.

**Acceptance checks:**
- new + existing id-resolve.test.ts tests pass under node:test
- every LLD testStrategy subject is covered (case-equivalence, ac1 canonical-match, bad-id throw, ac2 no-regression, ordinalToStoryId unchanged, deriveWorkItemIdentity equivalence + epic-level, both-way round-trip)
- the full workflow test sweep stays green (no regression to id-resolve.test.ts or id-converter consumers)

## Test-strategy coverage

| LLD strategy item | Covered by |
| :--- | :--- |
| storyIdToOrdinal('S001') === storyIdToOrdinal('s1') === storyIdToOrdinal('S1') === 1 (case + padding inert) | `t1`, `t2` |
| storyWorkflowId(hash, createdAt, 'S001') toCanonical === storyWorkflowId(hash, createdAt, 's1') toCanonical === E<date><hash8>:S001 (ac1) | `t1`, `t2` |
| storyIdToOrdinal still throws the unchanged 'invalid storyId' Error on a genuinely bad id (e.g. 'story-1', '') | `t1`, `t2` |
| a lowercase 's10' produces byte-identical ordinal + canonical/slug before and after the change (ac2) | `t2` |
| ordinalToStoryId(n) still returns lowercase 's<n>' (unchanged) — tracker/resolve reconstruction unaffected | `t2` |
| deriveWorkItemIdentity(hash, createdAt, 'S001') === deriveWorkItemIdentity(hash, createdAt, 's1') for canonical/slug/epicSegment/story, and the epic-level (storyId omitted) yields story:undefined + no :S segment | `t1`, `t2` |
| both-way round-trip: parseWorkflowId(toCanonical(storyWorkflowId(...,'S001'))) yields story ordinal 1 (lc1) | `t2` |

## Citations

- **[[c1]]** `prior-artifact` `LLD S001 contractDetails.api storyIdToOrdinal + dataModelChanges 'storyIdToOrdinal story-id pattern' invariant-change — widen /^s(\d+)$/ to /^[sS](\d+)$/ at the single minter funnel (id.ts:102); ac1 standalone-canonicalizes.`
- **[[c2]]** `prior-artifact` `LLD S001 contractDetails.api deriveWorkItemIdentity + dataModelChanges 'WorkItemIdentity (interface)' new — the thin both-way identity bundle composing epicWorkflowId/storyWorkflowId + toCanonical/toSlug + the epic segment.`
- **[[c3]]** `prior-artifact` `LLD S001 errorPaths.invariantsToPreserve — ordinalToStoryId (id.ts:107) + toCanonical unchanged (tracker/resolve.ts:260 dependency); the widening is strictly additive with byte-stable lowercase behaviour (ac2).`
- **[[c4]]** `prior-artifact` `LLD S001 testStrategy — the unit test levels/subjects (case-equivalence, ac1 canonical-match, bad-id throw, ac2 no-regression, ordinalToStoryId unchanged, deriveWorkItemIdentity equivalence + epic-level, both-way round-trip) extending id-resolve.test.ts.`
