<!-- insrc:artifact LLD-972bf31d13c81a2f-S001 -->

# LLD: S001

**Epic:** `auto-fall-back-diff-based-code`
**HLD base run:** `wf-1786019667617-bgx7iz`
**HLD effective hash:** `7757477a540a...`

## HLD context

**Framework:** Standalone feature — no parent HLD. Design directly against the repo, grounded on the s1 analyze passes. There are no HLD shared contracts to honour.
**Rollout phase:** standalone

## Contract details

**Surface level:** internal

### `handleStart`

```typescript
async function handleStart(step: CodeReviewStepInput & { phase: 'start' }, deps: CodeReviewStepDeps): Promise<CodeReviewStepOutput>
```

**Parameters:**
- `step: CodeReviewStepInput & { phase: 'start' }` — The start/resume input; a resume carries the opaque state token + proceed flag.
- `deps: CodeReviewStepDeps` — Injected seam (fetchFreshness / fetchGrounding / assembleDiffGrounding / resolveSubject / now / sleep / freshnessTimeoutMs) — unchanged.

**Returns:** `Promise<CodeReviewStepOutput>` — Two control-flow guards are ADDED inside handleStart; the signature + return type are unchanged. (1) In the proceed:true block-poll loop, the TIMEOUT branch (deps.now() >= deadline) now `return await beginDiffOnlyReview(repo, epicHash, storyId, subject, deps)` instead of `return confirmWaitResult(...)`. (2) On the fresh path, after a successful fetchGrounding, when `g.grounding.symbols.length === 0` it now `return await beginDiffOnlyReview(...)` instead of `emitJudgementsResult(subject, g.grounding, token)`. The initial (non-resuming) stale/processing confirm_wait prompt and the proceed:false decline branch are UNCHANGED.

**Errors:**
- `'grounding-unavailable' (recoverable)` when fetchGrounding !g.ok — unchanged (this is distinct from a fresh-but-empty grounding, which now routes to diff rather than erroring).
- `'diff-unavailable' (recoverable)` when The diff fallback's assembleDiffGrounding throws DiffUnavailableError — surfaced by beginDiffOnlyReview, unchanged. So a hollow-or-timed-out review with no readable diff is an explicit error, never a silent empty pass.

**Preconditions:**
- The token/subject are already resolved at both new call sites (timeout branch: subject from the resumed state; fresh-but-hollow branch: subject resolved earlier in handleStart) — beginDiffOnlyReview's args are all in scope.
- The confirm_wait state token is released before the diff fallback runs on the timeout branch (mirrors the fresh-break path that calls releaseState).

**Postconditions:**
- A proceed:true poll that reaches the deadline yields an emit_judgements frame over DIFF grounding (groundingMode:'degraded'), not a confirm_wait re-prompt.
- A fresh index whose grounding has zero changed-symbol summaries yields an emit_judgements frame over DIFF grounding (degraded), not a full-mode emit over an empty symbol set.
- The initial confirm_wait prompt (first stale/processing check) and the proceed:false decline→diff behavior are behaviorally identical to before.

### `beginDiffOnlyReview`

```typescript
async function beginDiffOnlyReview(repo: string, epicHash: string, storyId: string, subject: CodeReviewSubject, deps: CodeReviewStepDeps): Promise<CodeReviewStepOutput>
```

**Parameters:**
- `repo: string` — Repo path (in scope at both new call sites).
- `epicHash: string` — Epic hash (in scope).
- `storyId: string` — Story id (in scope).
- `subject: CodeReviewSubject` — The resolved code-review subject; beginDiffOnlyReview re-keys its changedFiles to the diff-derived set.
- `deps: CodeReviewStepDeps` — Injected seam — uses deps.assembleDiffGrounding(repo).

**Returns:** `Promise<CodeReviewStepOutput>` — The EXISTING degraded diff-only review path (handler.ts:308). Unchanged by this story — it assembles the diff grounding, re-keys the subject, saves state with groundingMode:'degraded', and returns emitJudgementsResult over the diff grounding. This story only adds two new callers of it (timeout + fresh-but-hollow); its body is not modified.

**Errors:**
- `'diff-unavailable' (recoverable)` when assembleDiffGrounding throws DiffUnavailableError — unchanged.

**Preconditions:**
- Called only after the subject is resolved.

**Postconditions:**
- Returns emit_judgements over the diff grounding with groundingMode:'degraded' on the persisted state (unchanged).

## Data model changes

### `handleStart control flow (src/mcp/code-review-step/handler.ts)` — invariant-change

Two return-branches change WHICH result they produce (no data shape changes): (1) the proceed:true block-poll TIMEOUT branch returns beginDiffOnlyReview(...) instead of confirmWaitResult(...) — release the confirm_wait token first; (2) the fresh path, on g.grounding.symbols.length === 0, returns beginDiffOnlyReview(...) instead of emitJudgementsResult(subject, g.grounding, token). All other branches (initial confirm_wait, proceed:false decline, fresh-with-nonempty-grounding, grounding-unavailable error) are unchanged. The invariant that changes: 'a proceed:true timeout re-prompts confirm_wait' and 'a fresh emit_judgements always uses full grounding' both become 'index-unavailable/hollow grounding auto-falls-back to the degraded diff review'.

```
handler.ts timeout branch: - return confirmWaitResult(f.staleFiles, f.isProcessing, step.state!) => + releaseState(step.state!); return await beginDiffOnlyReview(repo, epicHash, storyId, subject, deps)
handler.ts fresh branch: + if (g.grounding.symbols.length === 0) return await beginDiffOnlyReview(repo, epicHash, storyId, subject, deps) [the token for the full path is only saved when grounding is non-empty]
```

**Call sites:**
- `src/mcp/code-review-step/handler.ts`

### `CodeReviewGrounding (src/workflow/code-review/types.ts)` — invariant-change

No shape change. The story READS the existing `symbols: readonly ChangedSymbolSummary[]` field to detect the hollow condition (length === 0). groundingMode ('full' | 'degraded') on the persisted state is set by beginDiffOnlyReview unchanged; the record shape + verdict-presentation surface are untouched (degraded stays a persisted-record-only flag).

**Call sites:**
- `src/workflow/code-review/types.ts`
- `src/mcp/code-review-step/handler.ts`

## Error paths

### Error cases

- **The auto-diff fallback fires (timeout or fresh-but-hollow) but the working-tree/last-commit diff cannot be read.** (recoverable)
  - Detection: beginDiffOnlyReview's deps.assembleDiffGrounding(repo) throws DiffUnavailableError; beginDiffOnlyReview catches it (handler.ts:~322).
  - Response: Return a 'diff-unavailable' recoverable error frame — NOT a silent empty pass. The auto-trigger never manufactures a hollow verdict when even the diff is unreadable.
  - User impact: The operator sees an explicit 'could not read the changed-file diff' error and can retry/investigate, rather than a misleading PASS over nothing.
- **fetchGrounding itself fails on the fresh path (transport/daemon error), distinct from a fresh-but-EMPTY grounding.** (recoverable)
  - Detection: deps.fetchGrounding returns !g.ok (existing check at handler.ts:~284).
  - Response: Unchanged: return the existing 'grounding-unavailable' recoverable error. The new hollow guard runs only AFTER a successful fetch (g.ok) with an empty symbols[], so it never masks a real fetch failure.
  - User impact: A genuine grounding-service failure still surfaces as its own error, not silently downgraded to diff.

### Edge cases

| Input | Expected |
| :--- | :--- |
| proceed:true block-poll reaches the deadline while the index is still processing/stale. | Instead of re-prompting confirm_wait, the handler releases the confirm_wait token and returns emit_judgements over DIFF grounding (groundingMode:'degraded'). The operator is never stuck re-confirming a wait that will not resolve. |
| The index reports FRESH but the grounding comes back with symbols: [] (the S001 hollow condition). | Instead of emitting a full-mode review over an empty symbol set, the handler returns emit_judgements over DIFF grounding (degraded) — no hollow PASS. |
| The index reports FRESH and the grounding has >=1 changed-symbol summary. | Unchanged — full-mode emit_judgements over the graph grounding (groundingMode:'full'). The auto-diff fallback does NOT fire when real grounding exists. |
| The FIRST (non-resuming) freshness check is stale/processing. | Unchanged — the initial confirm_wait prompt is still shown (the operator can choose to wait). Auto-diff only kicks in on the proceed:true TIMEOUT, not on the first stale detection. |
| The operator declines the wait (proceed:false). | Unchanged — the existing decline→beginDiffOnlyReview branch fires exactly as before. All three unavailable-grounding conditions (decline, timeout, hollow) now converge on the same degraded review. |
| A proceed:true poll that becomes fresh with real grounding before the deadline. | Unchanged — breaks the loop, releases the token, and emits a full-mode review. The timeout auto-diff only triggers when the deadline is actually reached. |

### Invariants to preserve

- The diff-only review machinery (beginDiffOnlyReview + deps.assembleDiffGrounding, groundingMode:'degraded', emitJudgementsResult over grounding.symbols) is REUSED verbatim from the two new call sites — its body, the assembleDiffGrounding seam, and the 'degraded' record flag are unmodified. This story only adds callers. [[c2]]
- The verdict-presentation surface + the persisted record SHAPE are unchanged — groundingMode stays a persisted-record-only flag ('full' | 'degraded'); a degraded review is not re-labeled in the verdict output. Only WHICH grounding a review runs over changes. [[c3]]
- A fetchGrounding transport failure (!g.ok) still yields the existing 'grounding-unavailable' error, and an unreadable diff still yields 'diff-unavailable' — the auto-fallback NEVER converts a real failure into a silent hollow PASS; the hollow guard runs only on a successful fetch whose symbols[] is empty. [[c1]]
- The initial (first-check) confirm_wait prompt and the proceed:false decline branch are behaviorally identical to before — the wait option is preserved; auto-diff is added only on the proceed:true TIMEOUT and the fresh-but-hollow paths. [[c1]]

## Test strategy

**Test framework:** `node:test via `npx tsx --test`, extending src/mcp/code-review-step/__tests__/handler.test.ts: the whole gate is driven through the injected CodeReviewStepDeps fakes (makeDeps) with scripted fetchFreshness/fetchGrounding/assembleDiffGrounding + a deterministic now()/freshnessTimeoutMs() — no real daemon, git, or wall-clock. New tests mirror the existing s10 decline->diff tests (assert next==='emit_judgements' + grounding===diffGrounding).`

### Test levels

- **unit** — Prove the two new auto-diff fallback triggers in handleStart + prove the preserved branches are unchanged — all via the injected CodeReviewStepDeps fakes (makeDeps), no real daemon/git.
  - Subjects: `proceed:true block-poll that never freshens before the deadline -> next:emit_judgements over DIFF grounding (declined.grounding === diffGrounding), NOT confirm_wait re-prompt (the s9 timeout re-prompt assertion flips)`, `fresh index whose fetchGrounding returns { symbols: [] } -> next:emit_judgements over DIFF grounding (over the diff, not the empty full grounding); the emit is NOT a full-mode hollow pass`, `fresh index whose fetchGrounding returns { symbols: [>=1] } -> next:emit_judgements over the FULL graph grounding (auto-diff does NOT fire) — regression guard`, `the auto-diff timeout branch releases the confirm_wait state token before returning the diff review (no leaked token)`, `auto-diff fires (timeout or hollow) but assembleDiffGrounding throws DiffUnavailableError -> next:error 'diff-unavailable' (recoverable), NOT a silent pass`, `fetchGrounding returns !g.ok on the fresh path -> next:error 'grounding-unavailable' (unchanged); the hollow guard does not mask a real fetch failure`, `the initial (non-resuming) stale/processing check still returns confirm_wait (the wait prompt is preserved); proceed:false decline still returns the diff review (unchanged)`
  - Fixtures: `The existing makeDeps() fake seam in handler.test.ts (fetchFreshness/fetchGrounding/assembleDiffGrounding/resolveSubject/now/sleep/freshnessTimeoutMs) with scripted freshness (never-fresh for timeout; fresh for hollow) + a canned diffGrounding`, `A fetchGrounding fake returning { ok:true, grounding:{ symbols:[] } } (hollow) and one returning >=1 symbol (full)`, `A now()/freshnessTimeoutMs() pair that makes the block-poll deadline reachable deterministically (no real wall-clock)`

### Acceptance mapping

| Criterion | Proving tests |
| :--- | :--- |
| `ac1` | `unit: proceed:true timeout -> emit_judgements over diff grounding (degraded), not confirm_wait re-prompt`, `unit: the timeout branch releases the confirm_wait token before the diff review` |
| `ac2` | `unit: fresh index with grounding.symbols:[] -> emit_judgements over diff grounding, not a hollow full emit`, `unit: fresh index with grounding.symbols>=1 -> full-mode emit (auto-diff does not fire) — regression guard` |
| `ac3` | `unit: initial stale/processing check still returns confirm_wait; proceed:false decline still returns the diff review (preserved)`, `unit: auto-diff with an unreadable diff -> 'diff-unavailable' error; fetchGrounding !g.ok -> 'grounding-unavailable' error (no silent hollow pass)` |

## Migration

**State before:** In src/mcp/code-review-step/handler.ts (per s1 usage.example c1): when graph grounding is unavailable or hollow the code review does NOT auto-fall-back to the diff review. (1) In the proceed:true freshness block-poll loop, ON TIMEOUT (deps.now() >= deadline, ~line 258) the handler `return confirmWaitResult(f.staleFiles, f.isProcessing, step.state!)` — it re-prompts confirm_wait even though the index will not resolve. (2) On the fresh path (~line 282-296), after `const g = await deps.fetchGrounding(...)`, a successful fetch goes straight to `emitJudgementsResult(subject, g.grounding, token)` with NO check on g.grounding.symbols.length — an empty symbols[] emits a full-mode review over nothing (the S001 hollow-PASS). The diff-only path (beginDiffOnlyReview, groundingMode:'degraded') already EXISTS and is already wired to the proceed:false decline branch (c2), but nothing triggers it automatically on timeout or hollow grounding.

**State after:** handleStart auto-falls-back to the existing diff-only review on both unavailable-grounding conditions: (1) the proceed:true timeout branch releases the confirm_wait token and returns beginDiffOnlyReview(...) instead of re-prompting; (2) the fresh path, when g.grounding.symbols.length === 0, returns beginDiffOnlyReview(...) instead of the hollow full emit. Fresh-with-real-grounding still emits full mode; the initial confirm_wait prompt and the proceed:false decline branch are unchanged. beginDiffOnlyReview's body, the assembleDiffGrounding seam, groundingMode:'degraded', and the verdict-presentation surface are all unchanged (c2/c3) — the diff review is just now reached from two more call sites.

**Zero downtime:** yes — **Data rewrite:** no

### Steps

1. In the proceed:true block-poll TIMEOUT branch (handler.ts ~line 258), replace the confirm_wait re-prompt return with: release the confirm_wait state token first, then return the existing diff-only review (beginDiffOnlyReview with the already-in-scope repo/epicHash/storyId/subject/deps). Token release before the diff fallback mirrors the fresh-break path (invariant c1). — ↩ rollbackable
2. On the fresh path (handler.ts ~line 282-296), after the successful fetchGrounding (g.ok) and BEFORE the full emit, add a guard: when the grounding's changed-symbol set is empty (grounding.symbols.length === 0) return the existing diff-only review (beginDiffOnlyReview) instead of emitting judgements over the empty grounding. The full-mode emit stays as-is for a non-empty symbol set. — ↩ rollbackable
3. Add two handler unit tests mirroring the existing s10 decline→diff tests: (a) proceed:true that never freshens before the deadline → next:emit_judgements over the diff grounding (not confirm_wait); (b) fresh index whose fetchGrounding returns symbols:[] → next:emit_judgements over the diff grounding (not a hollow full emit). Flip the existing s9 timeout re-prompt assertion (handler.test.ts ~line 296) from confirm_wait to emit-over-diff. Keep the fresh-with-nonempty-grounding test asserting full mode as the regression guard. — ↩ rollbackable

**Backward compat:** handleStart's signature + return type are unchanged; beginDiffOnlyReview is unchanged. The only observable behavior change is which frame two internal branches emit: a proceed:true timeout now yields a degraded diff review instead of a confirm_wait re-prompt, and a fresh-but-hollow grounding now yields a degraded diff review instead of a full-mode emit over an empty symbol set. This is a strict improvement (no more hollow PASS / no more stuck re-prompt) with no change to the persisted record shape, the groundingMode flag semantics, or the verdict-presentation surface — downstream consumers of the emit_judgements / confirm_wait / error frames see the same shapes. No public MCP tool contract changes.

## Alternatives considered

### a1: Inline auto-diff at both hollow/timeout sites (reuse beginDiffOnlyReview verbatim) — **CHOSEN**

Add two guards in handleStart — the proceed:true timeout branch and the fresh-but-empty-grounding branch — that both `return await beginDiffOnlyReview(...)`, exactly as the existing proceed:false decline branch already does.

In handleStart (handler.ts): (1) in the proceed:true block-poll loop, replace the timeout `return confirmWaitResult(...)` (line ~258-260) with `return await beginDiffOnlyReview(repo, epicHash, storyId, subject, deps)`; (2) on the fresh path after a successful fetchGrounding (line ~283-296), if `g.grounding.symbols.length === 0`, `return await beginDiffOnlyReview(...)` instead of `emitJudgementsResult(...)`. Both new call sites use the SAME signature the decline branch already uses, so beginDiffOnlyReview + assembleDiffGrounding + the 'degraded' record flag are unchanged. The initial confirm_wait prompt (stale/processing initial check) and the proceed:false decline are untouched. No type/record/verdict-surface change.

### a2: Single 'fall back to diff' helper wrapping the guard + call

Factor a tiny `return fallbackToDiff(reason)` helper that logs the reason (timeout | hollow | decline) and delegates to beginDiffOnlyReview; call it from all three sites.

Introduce a small internal helper (e.g. `fallbackToDiff(repo, epicHash, storyId, subject, deps, reason)`) that records the trigger reason (for observability) and returns beginDiffOnlyReview(...). Route the decline, timeout, and hollow branches through it. Behavior identical to a1; the only difference is a shared wrapper + a reason label.

**Rejected because:** Behaviorally identical to a1 but adds a wrapper + a dead 'reason' label (not surfaced per the record-only decision) and churns the working decline branch — more diff/test/review surface for no functional gain (rank 2).

### a3: Guard only the hollow case; leave timeout re-prompting

Add only the fresh-but-empty-grounding → diff fallback; keep the proceed:true timeout re-prompting confirm_wait as today.

In handleStart, add ONLY the `g.grounding.symbols.length === 0 → beginDiffOnlyReview` guard on the fresh path. The proceed:true timeout branch keeps re-prompting confirm_wait unchanged.

**Rejected because:** Disqualified — violates the decided timeout policy: a never-freshening proceed:true loops confirm_wait with no automatic diff escape, the exact index-wedged case the feature must rescue (rank 3).

## Citations

- **[[c1]]** `analyze-bundle` `s1 usage.example — src/mcp/code-review-step/handler.ts handleStart control flow` — "ON TIMEOUT (`deps.now() >= deadline`, line 258) currently `return confirmWaitResult(...)`; the FRESH path (line 282-296) ... `emitJudgementsResult(subject, g.grounding, token)` WITH NO CHECK on g.grou"
- **[[c2]]** `analyze-bundle` `s1 symbol.locate — beginDiffOnlyReview + CodeReviewStepDeps seam (src/mcp/code-review-step/handler.ts:308, src/workflow/code-review/grounding.ts)` — "beginDiffOnlyReview(repo, epicHash, storyId, subject, deps) ... `await deps.assembleDiffGrounding(repo)` ... saves state with `groundingMode:'degraded'` ... This story reuses beginDiffOnlyReview verba"
- **[[c3]]** `analyze-bundle` `s1 data-model.trace — CodeReviewGrounding.symbols (src/workflow/code-review/types.ts:79)` — "The hollow condition is `grounding.symbols.length === 0` ... `groundingMode` ... is `'full' | 'degraded'` ... this story does NOT change the record shape or the verdict-presentation surface — degraded"
- **[[c4]]** `analyze-bundle` `s1 test.locate — src/mcp/code-review-step/__tests__/handler.test.ts` — "the s10 decline tests ... asserting declined.next==='emit_judgements' + declined.grounding===diffGrounding; the s9 timeout re-prompt test (line 296) ... this assertion FLIPS to emit_judgements-over-di"

<!-- insrc:review -->

## Review

### ✅ Review `PASS` — design.story (design.story)

**0 HIGH · 0 MED · 11 LOW** · model `client` · reviewed 2026-08-06T12:41:01.454Z

| Ref | Kind | Severity | Fixability | Premise | Evidence | Action |
| --- | --- | --- | --- | --- | --- | --- |
| contractDetails/handleStart | citation | LOW | auto | handleStart exists in src/mcp/code-review-step/handler.ts as an async function. | grep + read confirm `async function handleStart(` at src/mcp/code-review-step/handler.ts:192 exactly. | None — citation verified. |
| contractDetails/beginDiffOnlyReview | citation | LOW | auto | beginDiffOnlyReview exists in handler.ts and is the existing diff-only degraded review path. | read src/mcp/code-review-step/handler.ts:308 → FOUND `async function beginDiffOnlyReview(`. | None — citation verified. |
| migration/step1 | citation | LOW | auto | The proceed:true block-poll TIMEOUT branch currently returns confirmWaitResult(f.staleFiles, f.isProcessing, step.state!) at ~line 258-259 — the site to be replaced with beginDiffOnlyReview. | read handler.ts:259 → FOUND `return confirmWaitResult(f.staleFiles, f.isProcessing, step.state!);   // re-prompt (same token)` — the exact timeout site to replace. | None — the migration-step-1 target site is real. |
| migration/step2 | citation | LOW | auto | The fresh path fetches grounding via deps.fetchGrounding then returns emitJudgementsResult(subject, grounding, token) with no check on grounding.symbols.length — the hollow-PASS site to be guarded. | handler.ts:283 → `const g = await deps.fetchGrounding({ repo, epicHash, storyId })`; handler.ts:296 → `return emitJudgementsResult(subject, grounding, token)`. The fresh path has no symbols.length guard between them (296 immediately follows the save), confirming the hollow-PASS site. | None — the fresh-but-hollow guard target is real. |
| cl5 | semantic | LOW | auto | The fresh-break path already calls releaseState(step.state!) before saving the fresh emit state, which the new timeout-diff branch mirrors (release before diff fallback). | handler.ts:265 → `releaseState(step.state!);` on the fresh-break path (and :216 on decline) — the release-before-diff pattern the timeout branch mirrors exists. | None — semantic premise verified. |
| cl6 | semantic | LOW | auto | beginDiffOnlyReview saves state with groundingMode:'degraded' and returns emitJudgementsResult over the diff grounding — the record flag the story reuses unchanged. | handler.ts:336 → `groundingMode: 'degraded',` inside beginDiffOnlyReview's saveState; :339 → `return emitJudgementsResult(diffSubject, grounding, token)`. The reused degraded record flag is real and unmodified by this story. | None — semantic premise verified. |
| contractDetails/deps | citation | LOW | auto | CodeReviewStepDeps carries fetchGrounding and assembleDiffGrounding as injected seams (the fakes the tests drive). | handler.ts:63 `readonly fetchGrounding: typeof fetchCodeReviewGrounding;` + :66 `readonly assembleDiffGrounding: typeof assembleDiffCodeReviewGrounding;` — both injected seams present on CodeReviewStepDeps. | None — citation verified. |
| cl8 | semantic | LOW | auto | The fresh-path grounding failure returns a 'grounding-unavailable' recoverable error on !g.ok — distinct from the new fresh-but-empty (symbols.length===0) hollow guard. | handler.ts:285 → `return errorResult('grounding-unavailable', ...)` on the !g.ok branch — distinct from the new fresh-but-empty guard, so the hollow guard does not mask a fetch failure. | None — semantic premise verified. |
| dataModel/CodeReviewGrounding | citation | LOW | auto | CodeReviewGrounding declares a symbols field (readonly ChangedSymbolSummary[]) in src/workflow/code-review/types.ts — the hollow signal read as length === 0. | src/workflow/code-review/types.ts:79 `export interface CodeReviewGrounding {` + :80 `readonly symbols: readonly ChangedSymbolSummary[];` — the hollow-signal field exists as cited. | None — citation verified. |
| testStrategy | citation | LOW | auto | The handler test suite src/mcp/code-review-step/__tests__/handler.test.ts exists and drives the gate via injected fakes (makeDeps), the pattern the new timeout->diff and hollow->diff tests extend. | handler.test.ts and the assembleDiffGrounding/fetchGrounding fakes are heavily referenced (41 assembleDiffGrounding hits incl. the s10 decline tests); the injected-fakes pattern the new tests extend exists. | None — the test subject + pattern are real. |
| cl11 | citation | LOW | auto | DiffUnavailableError is the concrete error assembleDiffGrounding throws, caught inside beginDiffOnlyReview to surface a 'diff-unavailable' recoverable error. | DiffUnavailableError + the 'diff-unavailable' error path are consistent with beginDiffOnlyReview's catch (handler.ts:308-339 block); the degraded diff path surfaces an explicit error, not a silent pass. | None — error-path premise verified. |
