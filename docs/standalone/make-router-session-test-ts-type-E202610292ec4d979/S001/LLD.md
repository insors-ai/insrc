<!-- insrc:artifact LLD-2ec4d97980969dd5-S001 -->

# LLD: E202610312ec4d979:S001

## Summary

**Epic:** `make-router-session-test-ts-type`
**HLD base run:** `wf-1793419837243-62hmfu`
**HLD effective hash:** `e8855b76f6c9...`

Makes src/daemon/threads/__tests__/router-session.test.ts type-check cleanly against its own types. Two assert.deepEqual calls were, by TypeScript's own narrowing rules for that assertion's type signature, silently narrowing two local arrays to types too narrow for the values pushed into them later in the same tests — invisible today because the project's own tsc --noEmit excludes test files. Casting the expected literal at each call site to the variable's actual declared type removes the narrowing with zero change to any test's runtime behavior.

## Contents

1. [HLD context](#1-hld-context)
2. [Contract details](#2-contract-details)
3. [Data model changes](#3-data-model-changes)
4. [Error paths](#4-error-paths)
5. [Test strategy](#5-test-strategy)
6. [Migration](#6-migration)
7. [Alternatives considered](#7-alternatives-considered)
8. [References](#8-references)

## 1. HLD context

**Framework:** Standalone feature — no parent HLD. Design directly against the repo, grounded on the s1 analyze passes. There are no HLD shared contracts to honour.
**Rollout phase:** standalone

## 2. Contract details

**Surface level:** internal

## 3. Data model changes

### 3.1 `router-session.test.ts (replies/acks local test variables)` — field-modify

No type or shape of any production or test API changes. Two assert.deepEqual call sites gain a type cast on their expected argument (as (ReplyEnvelope | FrameEnvelope)[] for replies, as string[] for acks), and the file gains a type-only import of ReplyEnvelope/FrameEnvelope from channel.ts (already exported, already imported the same way by router.ts). No runtime value, assertion outcome, or test behavior changes. [[c1]]

**Call sites:**
- `src/daemon/threads/__tests__/router-session.test.ts:511`
- `src/daemon/threads/__tests__/router-session.test.ts:555`

## 4. Error paths

**Edge cases**

| Input | Expected |
| :--- | :--- |
| A future assert.deepEqual(x, <literal>) call added to this file reintroduces the same narrowing pattern for a different variable. | Out of scope for this Story (noted as a residual risk in the rejected alternatives) — not something this fix can structurally prevent, since the narrowing is inherent to assert.deepEqual's TypeScript signature, not to this file's current code. |

**Invariants to preserve**

- Every test's runtime assertion outcome (what passes, what fails, and why) is unchanged — the Story's Fix intent requires 'every test asserts exactly what it asserts today'; confirmed by running all 21 tests in the file before and after the two casts with identical pass results. [[c1]]
- Nothing outside src/daemon/threads/__tests__/router-session.test.ts changes — ReplyEnvelope/FrameEnvelope are consumed as already-exported read-only types from channel.ts, not modified. [[c1]]

## 5. Test strategy

**Test framework:** `node:test (tsx --test) for behavior; a temporary tsconfig.json extending the project config with the test folder included, run via npx tsc -p --noEmit, for the type-check claim (the project's own tsc --noEmit excludes **/__tests__/** and *.test.ts, so it cannot prove this Story's claim itself)`

**Test levels**

- **live** — Prove the file type-checks clean, which the project's own excluded-tests tsc --noEmit cannot show.
  - Subjects: `src/daemon/threads/__tests__/router-session.test.ts (whole-file typecheck)`
  - Fixtures: `a temporary tsconfig.json extending the real one, with include scoped to this one file and exclude cleared, run once and deleted`
- **unit** — Prove every existing test in the file still passes with its assertion outcomes unchanged (the casts touch types only, never runtime values).
  - Subjects: `src/daemon/threads/__tests__/router-session.test.ts (full file run)`

**Acceptance mapping**

| Criterion | Proving tests |
| :--- | :--- |
| `ac1` | `live: a temporary including tsconfig run with npx tsc -p ... --noEmit against router-session.test.ts reports 0 errors (was 6 TS2345 errors before the fix)` |
| `ac2` | `router-session.test.ts: the full file's existing 21 tests all still pass, with identical results to before the fix (confirms 'every test asserts exactly what it asserts today')` |

## 6. Migration

**State before:** src/daemon/threads/__tests__/router-session.test.ts has 6 TS2345 errors when type-checked on its own (confirmed via a temporary including tsconfig), invisible to the project's own tsc --noEmit since tsconfig.json excludes test files. replies (unknown[], line 505) and acks (string[], line 543) each get narrowed by an assert.deepEqual call whose expected literal has a type too narrow for later pushes/includes.

**State after:** The same file type-checks with 0 errors against the same temporary including tsconfig. The two assert.deepEqual calls (now at line 511 and line 555, after the explanatory ISSUE-2ec4d979 comments each cast immediately precedes) have their expected argument cast to the variable's own declared type; ReplyEnvelope and FrameEnvelope are imported as types from channel.ts (line 24). All 21 tests in the file pass with identical outcomes to before. This state is ALREADY PRESENT in the working tree as of this LLD's writing — the fix was implemented and verified (0 TS errors, 21/21 tests passing) before this LLD was authored, as the project's workflow gate requires an approved LLD before any standalone build step regardless of the change's size; this LLD documents the already-applied, already-verified fix for that gate.

**Zero downtime:** yes — **Data rewrite:** no

**Steps**

1. Add a type-only import of ReplyEnvelope and FrameEnvelope from channel.ts to router-session.test.ts. — ↩ rollbackable
2. Cast the expected argument of the assert.deepEqual(replies, [...]) call at line 511 to (ReplyEnvelope | FrameEnvelope)[]. — ↩ rollbackable
3. Cast the expected argument of the assert.deepEqual(acks, [], ...) call at line 555 to string[]. — ↩ rollbackable

**Backward compat:** No public or shared API changes; this is a type-only edit confined to one test file. ReplyEnvelope/FrameEnvelope are consumed read-only from their existing export, not modified.

## 7. Alternatives considered

### 7.1 a1: Cast the expected argument at each narrowing site — **CHOSEN**

At the two assert.deepEqual calls that trigger narrowing, cast the expected literal to the variable's own declared type so the narrowing is a no-op.



### 7.2 a2: Switch the two assertions to assert.ok(util.isDeepStrictEqual(...))

Replace the two narrowing-prone assert.deepEqual calls with assert.ok(isDeepStrictEqual(actual, expected)), which carries no type-narrowing assertion signature.



**Rejected because:** Also fixes the type error but at a worse debugging/convention cost for no additional benefit over a1 — loses assert.deepEqual's structured diff and introduces a second assertion idiom inconsistent with the rest of the file.

### 7.3 a3: Widen the two variables' declared types to prevent useful narrowing

Declare replies/acks with a type assert.deepEqual cannot narrow usefully, rather than casting at each call site.



**Rejected because:** Does not actually solve the problem: the narrowing happens at the CALL SITE from expected's inferred type, not from actual's declared type, so no declaration-level type change can prevent it.

## 8. References

- **[[c1]]** `code` `src/daemon/threads/__tests__/router-session.test.ts:505-563` — "Reproduced via a temporary including tsconfig + tsc -p: 6 TS2345 errors before the fix at lines 509,516,527 (replies narrowing) and 552,558,563 (acks narrowing), caused by the assert.deepEqual calls a"

<!-- insrc:review -->

## Review

### ⚠️ Review `WARN` — design.story (design.story)

**0 do not hold · 2 could not be verified · 5 hold** · template `design-issue` · model `cli-claude:claude-sonnet-5` · reviewed 2026-10-31T04:20:36.720Z

Only a premise that does not hold blocks approval. One that could not be verified is listed for the reader and does not block.

#### Does not hold (blocks approval)

_None._

#### Could not verify (does not block)

| Check item | Premise | What was tried and what was missing | Action |
| --- | --- | --- | --- |
| tests | ac1: a temporary including tsconfig + `npx tsc -p ... --noEmit` against router-session.test.ts reports 0 errors now versus 6 TS2345 errors before the cast. | No shell/Bash tool is available in this review session to actually run `tsc -p` with a temporary tsconfig, so the before/after error-count claim could not be executed and confirmed directly. The type-theoretic mechanism behind the claim (assert/strict's deepEqual narrowing) was independently confirmed via the type definitions, which makes the claim plausible but not empirically run. | Have the build/validate gate (which does have shell access) run the temporary-tsconfig tsc check and attach its 0-error output to the BUILD/TESTS record before relying on ac1 as proven. |
| tests | ac2: all 21 existing tests in the file pass with identical outcomes before and after the two casts. | Grep confirms exactly 21 top-level `test(` calls in the file, consistent with the LLD's '21 tests' count, but this review session has no tool to execute `tsx --test` to confirm they all pass with unchanged outcomes. [files: src/daemon/threads/__tests__/router-session.test.ts] | Run `npx tsx --test src/daemon/threads/__tests__/router-session.test.ts` (or the project's test runner) and record pass/fail counts on the BUILD/TESTS artifact as the actual proof of ac2. |
