<!-- insrc:artifact LLD-761a43a6fa645815-s10 -->

# LLD: E20260805761a43a6:S010

**Epic:** `add-daemon-driven-code-review-stage`
**HLD base run:** `wf-1785741597494-lbzdo7`
**HLD effective hash:** `c348dfab1232...`

## HLD context

**Framework:** A hybrid code-review stage (winner a3): a code-review-specific orchestrator runs the four dimensions (adherence/conventions/coverage/quality) as an explicit SERIAL provider loop, reusing src/daemon/workflow-rpc.ts's proven machinery (buildShaperProvider resolution, synthesize-with-retry, writeAtomic, meta-stamping, optional boundary re-audit, the runStart StreamHandler shape) rather than cloning it, and mirroring the existing review vocabulary (ReviewVerdict / Severity / ReviewReport from src/workflow/review/types.ts) so the persisted CodeReviewArtifact carries a block/warn/pass verdict downstream approval already understands. The daemon-driven path and the controller-driven insrc_code_review_step (which mirrors insrc_review_step's start/emit/done/error/opaque-state envelope) share ONE orchestrator, differing only in who supplies each dimension's judgement. The stage runs after build, consumes the build record + approved LLD/PLAN as its fixed subject without re-deriving them, and never modifies the code it judges.
**Rollout phase:** <not in any phase>

## Contract details

**Surface level:** internal-shared

### `assembleDiffCodeReviewGrounding`

```typescript
(repoPath: string, deps?: DiffGroundingDeps) => Promise<{ grounding: CodeReviewGrounding; changedFiles: readonly string[] }>
```

**Parameters:**
- `repoPath: string` — Registered repo root the diff is read from.
- `deps: DiffGroundingDeps` _(optional)_ — Injectable git-diff seam (workingTreeDiff + lastCommitDiff) so the assembler is unit-tested without a real repo.

**Returns:** `Promise<{ grounding: CodeReviewGrounding; changedFiles: readonly string[] }>` — A CodeReviewGrounding whose symbols[] is ONE synthesized ChangedSymbolSummary per changed file (kind:'file', name:file, the file's unified-diff hunks carried in signature; callers/callees/testsReaching empty) — consumed UNCHANGED by the existing four dimension prompt builders. changedFiles is the same set (for the record subject).

**Errors:**
- `propagated` when a git failure in both the working-tree diff AND the HEAD^ fallback propagates (surfaced by the caller as a code-review-step error); an EMPTY result is a valid grounding with symbols:[] (nothing to review), not an error.

**Preconditions:**
- The repo is a git repository

**Postconditions:**
- Derives the changed set from the WORKING-TREE diff (gitDiffTool default ∪ staged); when that is EMPTY, falls back to the last commit via gitDiffTool { from: 'HEAD^' } (ac2). Read-only — git_diff never mutates. The hunk payload is size-bounded by git_diff's maxBytes (256KB default), never an unbounded raw dump.

### `runCodeReview`

```typescript
(subject: CodeReviewSubject, provider: LLMProvider, opts: RunCodeReviewOpts, deps?: CodeReviewRunnerDeps) => Promise<CodeReviewOutcome>
```

**Parameters:**
- `subject: CodeReviewSubject` — The review subject (unchanged).
- `provider: LLMProvider` — The tier-resolved provider (unchanged).
- `opts: RunCodeReviewOpts` — Gains optional groundingMode + capVerdictAtWarn (both default to today's behaviour).
- `deps: CodeReviewRunnerDeps` _(optional)_ — Injectable judges + assembleGrounding + write (unchanged).

**Returns:** `Promise<CodeReviewOutcome>` — {ok:true, artifact} on success (record stamped with opts.groundingMode; verdict capped at warn when opts.capVerdictAtWarn); {ok:false, error} before any write on failure — unchanged.

**Errors:**
- `CodeReviewOutcome ok:false` when throwing judge / grounding failure / in-memory validation failure / abort — unchanged (no partial write).

**Postconditions:**
- buildArtifact stamps body.groundingMode = opts.groundingMode ?? 'full'. foldVerdict, when opts.capVerdictAtWarn is true, maps a folded 'pass' up to 'warn' (block + warn are unchanged; the cap NEVER lowers a block/warn). Both opts default false/'full', so the daemon-driven + s9 graph paths are byte-identical (ac6). The serial four-judge loop (k4) is unchanged.

### `handleCodeReviewStep`

```typescript
(input: unknown, deps?: CodeReviewStepDeps) => Promise<CodeReviewStepMcpEnvelope>
```

**Parameters:**
- `input: unknown` — The start/judgements input; the start resume with proceed:false now triggers the diff-only fallback instead of an error.
- `deps: CodeReviewStepDeps` _(optional)_ — Gains an assembleDiffGrounding seam (peer of fetchGrounding) so the decline branch is testable without a real git repo.

**Returns:** `Promise<CodeReviewStepMcpEnvelope>` — On decline the start phase now returns next:'emit_judgements' over the diff grounding (with a degraded marker in the saved state) rather than next:'error' review-declined.

**Errors:**
- `CodeReviewStepError` when a git failure deriving the diff (both working-tree and HEAD^) surfaces as an error frame; the fresh-index + no-subject + state-not-found errors are unchanged.

**Preconditions:**
- A resume with a valid state token (the confirm_wait subject) and proceed:false (or a timeout re-prompt abort)

**Postconditions:**
- The decline branch: assembleDiffGrounding(repo) → saveState({subject, grounding, degraded:true}) → return emit_judgements (the four charges over the diff hunks). The judgements turn drives runCodeReview with groundingMode:'degraded' + capVerdictAtWarn:true, persisting a degraded record (ac1/ac3/ac4). The fresh path + proceed:true poll + graph judgements turn are byte-identical to s9 (ac6).

## Data model changes

### `CodeReviewBody.groundingMode` — field-modify

Widen the s9-added field from 'full' to the union 'full' | 'degraded'. 'full' = graph-grounded (s9); 'degraded' = the diff-only fallback (s10). The completion gate reads the verdict (not this field), so no gate edit is required; the field is the durable marker distinguishing the two review qualities on the record.

```
CodeReviewBody.groundingMode: 'full' -> 'full' | 'degraded'
```

**Call sites:**
- `src/workflow/code-review/types.ts`
- `src/workflow/code-review/runner.ts`

### `RunCodeReviewOpts` — field-add

Add optional groundingMode?: 'full' | 'degraded' (default 'full', threaded into buildArtifact) and capVerdictAtWarn?: boolean (default false; when true foldVerdict promotes a folded 'pass' to 'warn'). Both additive + default to today's behaviour so existing callers (daemon path, s9 fresh path) are unchanged.

```
RunCodeReviewOpts += groundingMode?: 'full'|'degraded'; += capVerdictAtWarn?: boolean
```

**Call sites:**
- `src/workflow/code-review/runner.ts`

### `CodeReviewStepDeps.assembleDiffGrounding` — field-add

Add an injectable seam (typeof assembleDiffCodeReviewGrounding) so the controller decline branch builds the diff grounding via a fake in tests. Additive to the existing resolveSubject/fetchGrounding/fetchFreshness/runReview/write/sleep/now/freshnessTimeoutMs seams.

```
CodeReviewStepDeps += assembleDiffGrounding: typeof assembleDiffCodeReviewGrounding
```

**Call sites:**
- `src/mcp/code-review-step/handler.ts`

### `CodeReviewStepStatePayload.groundingMode` — field-add

Add an optional groundingMode?: 'degraded' marker to the saved state so the judgements turn knows to drive runCodeReview with the degraded+cap options (the graph path omits it => 'full'/uncapped). Additive; the existing subject + optional grounding fields are unchanged.

```
CodeReviewStepStatePayload += groundingMode?: 'degraded'
```

**Call sites:**
- `src/mcp/code-review-step/types.ts`

### `ChangedSymbolSummary (diff pseudo-symbol reuse)` — invariant-change

No schema change: the diff-only grounding REUSES ChangedSymbolSummary as-is — one row per changed file with kind:'file', name:the file path, signature:the file's unified-diff hunks (bounded), and callers/callees/testsReaching empty. The invariant that a ChangedSymbolSummary always represents a graph ENTITY is relaxed for the degraded path (it may represent a file+hunks); this is why the record is marked groundingMode:'degraded'. The four prompt builders serialize the rows unchanged.

```
(no field change; ChangedSymbolSummary may carry a file+hunks row on the degraded path)
```

**Call sites:**
- `src/workflow/code-review/grounding.ts`
- `src/workflow/code-review/types.ts`

## Error paths

### Error cases

- **git diff fails for BOTH the working-tree read AND the HEAD^ fallback (not a git repo, or git errored).** (recoverable)
  - Detection: The gitDiffTool ToolResult.success is false (or throws) on the working-tree call and again on the { from:'HEAD^' } call.
  - Response: assembleDiffCodeReviewGrounding propagates; the controller decline branch maps it to a CodeReviewStepError (code 'diff-unavailable', retryable:true) and writes NO record — a diff that cannot be read must not silently produce an empty degraded pass.
  - User impact: The decline path fails with an actionable 'could not read the diff' message; the user reruns (or fixes the repo state).
- **HEAD^ does not exist — the repo has only a single (root) commit — while the working tree is clean.** (recoverable)
  - Detection: The gitDiffTool { from:'HEAD^' } call fails because HEAD has no parent.
  - Response: Fall back to the root commit's own contents (diff the empty tree against HEAD, e.g. git_diff against the empty-tree object) so the single commit is still reviewable; if even that yields nothing, produce a valid grounding with symbols:[] (an empty degraded review, never a crash).
  - User impact: A brand-new single-commit repo still gets a diff-only review of that commit rather than an error.
- **The controller supplies malformed four-dimension judgements on the degraded judgements turn.** (recoverable)
  - Detection: validateJudgements (unchanged) rejects a missing dimension / bad severity / non-file:line location.
  - Response: Return a bad-judgements error frame and write NO record (ac5 no-partial-write, identical to the graph path).
  - User impact: A malformed degraded judgement fails cleanly with the same message shape as a graph-path judgement; nothing is persisted.

### Edge cases

| Input | Expected |
| :--- | :--- |
| The decline arrives while the working tree is NON-empty (there are genuinely uncommitted changes). | The diff-only path uses the working-tree diff directly (no HEAD^ fallback needed) — the fallback fires ONLY when the working-tree diff is empty. |
| The last-commit diff is derived and, after the four judges, folds to a clean pass (no findings). | capVerdictAtWarn promotes the folded 'pass' to 'warn' — the degraded record is warn with zero findings (a degraded review can never register pass, ac4), so it still does not satisfy an enforce gate (ac5). |
| The diff exceeds git_diff's maxBytes (a very large changed set). | GitDiffData.truncated is true; the grounding carries the truncated hunks (bounded, not an unbounded dump) and the review proceeds over what was returned — a degraded review of a bounded slice, not an error. |
| A changed file is binary (no textual hunks). | The per-file pseudo-symbol is still emitted (kind:'file', name:the path) with a 'binary file changed' marker in place of hunks, so the judges see the file changed but have no text to reason over — consistent with the degraded framing. |
| The user declines to wait even though the index has since become fresh. | The decline is honoured — the diff-only degraded path runs (the user's explicit choice); freshness is NOT re-checked on decline, so a decline never silently upgrades to a full graph review. |

### Invariants to preserve

- The fresh graph path (grounding assembly + the four serial judges + groundingMode:'full' + an UNCAPPED verdict) must be byte-identical to s9 — the diff-only path is reached ONLY on the decline branch, and the two new runCodeReview run-opts default to today's behaviour (ac6). [[c3]]
- The persisted record keeps ONE verdict vocabulary (block/warn/pass, mirroring ReviewReport): the diff-only path reuses runCodeReview's fold/validate/writeAtomic unchanged — only the additive groundingMode stamp + the warn-cap differ, never the record shape. [[c4]]
- A groundingMode:'degraded' review can NEVER fold to 'pass' — the warn-cap promotes a would-be pass to warn (block/warn never lowered) — so a degraded record can never silently satisfy the codeReview.enforce completion gate (ac4/ac5). [[c4]]
- The diff read + the review remain strictly READ-ONLY: the diff comes from the git_diff builtin (which never mutates) and the judges reason via the LLMProvider (k3) — the code under review is byte-for-byte unchanged, exactly as the graph path. [[c1]]

## Test strategy

**Test framework:** `node:test via npx tsx --test`

### Test levels

- **unit** — Prove the controller decline branch runs the diff-only path (not review-declined) and drives runCodeReview with the degraded+cap options — via injected seams, no daemon/git.
  - Subjects: `decline (proceed:false + state) -> assembleDiffGrounding is called, next:'emit_judgements' is returned over the diff grounding, and NO 'review-declined' error`, `the degraded judgements turn drives runReview with groundingMode:'degraded' + capVerdictAtWarn:true (assert the runReview spy's opts) and persists a record`, `ac6 regression: a fresh index (no decline) still returns emit_judgements over graph grounding and the judgements turn drives runReview with the default opts (groundingMode:'full', no cap)`, `a diff-unavailable failure (assembleDiffGrounding rejects) -> next:'error' (diff-unavailable), no write`, `the abort path no longer returns 'review-declined' (the s9 test is replaced by the diff-only expectation)`
  - Fixtures: `makeDeps extended with an injectable assembleDiffGrounding (returns a canned diff CodeReviewGrounding + changedFiles) + a runReview spy that records opts`, `the existing fetchFreshness/sleep/now/freshnessTimeoutMs seams to reach the decline branch (stale -> confirm_wait -> proceed:false)`
- **unit** — Prove assembleDiffCodeReviewGrounding derives the changed set + hunks with the last-commit fallback, read-only.
  - Subjects: `working tree NON-empty -> grounding.symbols has one row per working-tree changed file (kind:'file', name:file, hunks in signature); the HEAD^ seam is NOT called`, `working tree EMPTY -> falls back to the { from:'HEAD^' } diff; grounding.symbols reflects the last commit's changed files (ac2)`, `a binary changed file -> a pseudo-symbol with a binary marker (no hunks), still present in changedFiles`, `both working-tree and HEAD^ empty -> a valid grounding with symbols:[] (no crash)`, `neither git call mutates (assert the injected git seam is read-only; no reindex/commit invoked)`
  - Fixtures: `A fake DiffGroundingDeps with scriptable workingTreeDiff (empty vs non-empty) + lastCommitDiff returning GitDiffData-shaped files + hunk text`, `GitDiffData/GitDiffFileStat fixtures incl. a binary change + a truncated diff`
- **unit** — Prove the runner's new options: groundingMode stamp + the warn-cap fold, with the defaults byte-identical to s9.
  - Subjects: `runCodeReview with opts.groundingMode:'degraded' -> the persisted record body.groundingMode === 'degraded'`, `runCodeReview with opts.capVerdictAtWarn:true + all-empty findings (would fold pass) -> verdict 'warn' (ac4)`, `capVerdictAtWarn:true + a HIGH finding -> verdict stays 'block' (the cap never lowers block/warn)`, `runCodeReview with NO groundingMode/cap opts -> body.groundingMode === 'full' and the verdict fold is unchanged (ac6 default parity)`
  - Fixtures: `The existing runner test harness (fake judges returning scripted findings + a write spy)`
- **unit** — Prove a degraded (warn) record does not satisfy the enforce completion gate.
  - Subjects: `the codeReview.enforce gate over a groundingMode:'degraded' record with verdict 'warn' withholds completion (requires an override), exactly as any non-pass verdict does (ac5)`
  - Fixtures: `The existing gate test harness (a CR record fixture with groundingMode:'degraded' + verdict warn + enforce on)`
- **integration** — Prove the last-commit fallback works against a real tiny git repo — gated like the existing daemon/git integration tests.
  - Subjects: `a clean-working-tree fixture repo with one commit -> assembleDiffCodeReviewGrounding (real gitDiffTool) returns the last commit's changed files + hunks via the HEAD^ fallback`
  - Fixtures: `A tiny real git fixture repo (one commit, clean tree)`, `The gated harness the existing git-builtin integration tests use`

### Acceptance mapping

| Criterion | Proving tests |
| :--- | :--- |
| `ac1` | `decline (proceed:false + state) -> assembleDiffGrounding is called, next:'emit_judgements' is returned over the diff grounding, and NO 'review-declined' error`, `the degraded judgements turn drives runReview with groundingMode:'degraded' + capVerdictAtWarn:true (assert the runReview spy's opts) and persists a record` |
| `ac2` | `working tree EMPTY -> falls back to the { from:'HEAD^' } diff; grounding.symbols reflects the last commit's changed files (ac2)`, `a clean-working-tree fixture repo with one commit -> assembleDiffCodeReviewGrounding (real gitDiffTool) returns the last commit's changed files + hunks via the HEAD^ fallback` |
| `ac3` | `runCodeReview with opts.groundingMode:'degraded' -> the persisted record body.groundingMode === 'degraded'`, `the degraded judgements turn drives runReview with groundingMode:'degraded' + capVerdictAtWarn:true (assert the runReview spy's opts) and persists a record` |
| `ac4` | `runCodeReview with opts.capVerdictAtWarn:true + all-empty findings (would fold pass) -> verdict 'warn' (ac4)`, `capVerdictAtWarn:true + a HIGH finding -> verdict stays 'block' (the cap never lowers block/warn)` |
| `ac5` | `the codeReview.enforce gate over a groundingMode:'degraded' record with verdict 'warn' withholds completion (requires an override), exactly as any non-pass verdict does (ac5)` |
| `ac6` | `ac6 regression: a fresh index (no decline) still returns emit_judgements over graph grounding and the judgements turn drives runReview with the default opts (groundingMode:'full', no cap)`, `runCodeReview with NO groundingMode/cap opts -> body.groundingMode === 'full' and the verdict fold is unchanged (ac6 default parity)` |

## Migration

**State before:** s9 shipped the freshness gate in handleCodeReviewStep's start phase (src/mcp/code-review-step/handler.ts): on a resume with proceed !== true it releaseState + returns errorResult('review-declined', ...) — a fail-closed dead-end. runCodeReview (src/workflow/code-review/runner.ts) hardcodes buildArtifact's groundingMode:'full' and foldVerdict has no cap. CodeReviewBody.groundingMode is the literal 'full' (src/workflow/code-review/types.ts). The changed set comes only from the working-tree diff (subject.ts realChangedFiles), which is empty after commit. The gitDiffTool builtin (src/daemon/tools/builtins/git/diff.ts) already supports commit ranges via { from, to }. The codeReview.enforce gate (src/workflow/code-review/gate.ts) is a verdict gate.

**State after:** The start-phase decline branch no longer returns review-declined: it calls a new assembleDiffCodeReviewGrounding (working-tree diff, else { from:'HEAD^' } last commit), saves an emit_judgements state marked groundingMode:'degraded', and returns emit_judgements over the diff hunks (carried inside the existing CodeReviewGrounding.symbols shape as one per-file pseudo-summary). The judgements turn drives runCodeReview with two new additive opts — groundingMode:'degraded' (stamped on the record) + capVerdictAtWarn:true (a folded 'pass' becomes 'warn'). CodeReviewBody.groundingMode widens to 'full' | 'degraded'. The fresh graph path + daemon path are byte-identical (opts default to 'full'/no-cap). A degraded warn record does not satisfy the enforce gate.

**Zero downtime:** yes — **Data rewrite:** no

### Steps

1. Widen CodeReviewBody.groundingMode from the literal 'full' to the union 'full' | 'degraded' (types.ts) — additive value, existing 'full' records unaffected. — ↩ rollbackable
2. Add the two optional run-opts to RunCodeReviewOpts (groundingMode default 'full', capVerdictAtWarn default false) and apply them in buildArtifact (stamp groundingMode) + foldVerdict (promote a would-be pass to warn when capped; never lower block/warn). Defaults keep every existing caller byte-identical. — ↩ rollbackable
3. Add assembleDiffCodeReviewGrounding (a peer of assembleCodeReviewGrounding) that derives the changed set from the working-tree diff, falls back to the { from:'HEAD^' } last-commit diff when clean, and emits a CodeReviewGrounding of per-file pseudo-symbols carrying the hunks; behind an injectable DiffGroundingDeps git seam. Additive module. — ↩ rollbackable
4. Add the optional groundingMode?:'degraded' marker to CodeReviewStepStatePayload + the assembleDiffGrounding seam to CodeReviewStepDeps (with a real default). Additive. — ↩ rollbackable
5. Replace handleCodeReviewStep's decline branch (currently review-declined) with the diff-only path: assembleDiffGrounding -> saveState(degraded) -> emit_judgements; and make the judgements turn pass groundingMode:'degraded' + capVerdictAtWarn:true to runCodeReview when the state is marked degraded (the graph path passes neither). The fresh path + proceed:true poll are untouched. — ↩ rollbackable
6. Add/adjust tests: replace the s9 'abort -> review-declined' handler test with the diff-only expectation; add the assembler last-commit-fallback unit + integration tests, the runner groundingMode/cap unit tests, and the enforce-gate degraded-warn test. Run the code-review + mcp suites green. — ↩ rollbackable

**Backward compat:** All changes are additive + default-preserving. runCodeReview's new opts default to groundingMode:'full' + no cap, so the daemon-driven path and s9's fresh graph path are byte-identical (ac6). CodeReviewBody.groundingMode widens 'full' -> 'full'|'degraded' — a superset, so every existing 'full' record still validates and every reader that only expected 'full' still sees 'full' on the graph path. The one BEHAVIOUR change is intentional + the whole point: insrc_code_review_step's decline (proceed:false) no longer returns a review-declined error — it now produces a degraded (warn-capped) record. A caller that specifically asserted the review-declined error must update, but that is a strict improvement (a real review signal instead of a dead-end); the s9 handler test that asserted review-declined is updated in this story. The new assembleDiffCodeReviewGrounding + CodeReviewStepDeps.assembleDiffGrounding + the state marker are new surfaces with no prior clients.

## Alternatives considered

### a1: Diff → pseudo-symbol grounding; reuse the four judges + runner with groundingMode + verdict-cap options — **CHOSEN**

The diff-only path derives its changed set (working-tree diff, else git show HEAD^ when clean), builds a CodeReviewGrounding whose symbols are ONE synthesized per-file summary carrying that file's hunks, and drives the SAME runCodeReview + four dimension judges — with two new run options: groundingMode:'full'|'degraded' (stamped on the record) and a verdictCap that folds a would-be pass down to warn. The controller decline branch replaces the review-declined error with this path.



### a2: Separate diff-only orchestrator + diff-tailored dimension charges

A distinct runDiffReview + diff-specific prompt builders that consume the raw diff blob, fold their own verdict (capped at warn), and stamp groundingMode:'degraded' — parallel to, not reusing, the graph-grounded judges.



**Rejected because:** Cleanest isolation (ac6 satisfies) but duplicates the judge/fold/validate/record machinery runCodeReview already provides (k1 partial: two orchestrators + two prompt sets to keep in lockstep — two drifting review vocabularies), abandons the story's 'reuse the four-dimension vocabulary' intent, and costs L for the same outcome a1 gets at M by reusing the runner.

### a3: Extend CodeReviewGrounding with an optional diff payload; branch the four prompt builders

Add an optional diff field to CodeReviewGrounding; the diff-only path sets { symbols: [], diff }, and each of the four dimension prompt builders branches to charge over the hunks when diff is present.



**Rejected because:** Functionally equal to a1 but scores partial on ac6 because it edits ALL FOUR dimension prompt builders (a symbols-vs-diff branch), enlarging the fresh-path regression surface that a1 avoids entirely, and every judge then carries a symbols-vs-diff conditional forever even though the diff branch is only hit on decline. The 'diff as a first-class field' cleanliness does not outweigh touching the graph charges.

## Citations

- **[[c1]]** `step-output` `s1 symbol.locate — handler.ts decline exit + fresh-path flow; src/mcp/code-review-step/handler.ts, src/mcp/code-review-step/types.ts` — "The resume branch: on a state token with step.proceed !== true it calls releaseState + returns errorResult('review-declined', ...) — the fail-closed exit s10 REPLACES with the diff-only fallback."
- **[[c2]]** `step-output` `s1 symbol.locate — changedFiles derivation + git_diff builtin; src/workflow/code-review/subject.ts, src/daemon/tools/builtins/git/diff.ts` — "The gitDiffTool ALSO supports commit ranges: { from, to } (from + omitted to => diff <from> to HEAD), so the last-commit diff is { from: 'HEAD^' }. Its ToolResult carries data.files (numstat) PLUS the"
- **[[c3]]** `step-output` `s1 symbol.locate — runner fold + groundingMode stamp + the four dimension charges; src/workflow/code-review/runner.ts, src/workflow/code-review/dimensions` — "runCodeReview folds counts→verdict via foldVerdict and buildArtifact stamps groundingMode:'full' (hardcoded, s9). For s10 the fold needs a WARN-CAP option and buildArtifact a groundingMode param. The "
- **[[c4]]** `step-output` `s1 data-model.trace — CodeReviewGrounding + CodeReviewBody.groundingMode + the completion gate; src/workflow/code-review/types.ts, src/workflow/code-review/gate.ts` — "CodeReviewBody.groundingMode is 'full' (s9); s10 widens to 'full' | 'degraded'. The codeReview.enforce gate is a VERDICT gate — a warn-capped degraded record already fails to satisfy an enforce gate e"
- **[[c5]]** `step-output` `s3 judge — winner a1 over a3 (rank 2) and a2 (rank 3)` — "a1 is the max-reuse shape: the diff rides inside the existing CodeReviewGrounding.symbols so the four dimension prompt builders + runCodeReview + the record + the enforce gate are all reused UNCHANGED"
- **[[c6]]** `prior-artifact` `Epic 761a43a6 HLD boundary — s10 owns/depends [] (private enhancement to the code-review decline path)` — "boundary.storyId s10; owns []; depends []; internal: Private implementation of s10: Fall back to a diff-only degraded review when the index cannot be made fresh."

<!-- insrc:review -->

## Review

### ✅ Review `PASS` — design.story (design.story)

**0 HIGH · 0 MED · 9 LOW** · model `client` · reviewed 2026-08-05T06:59:32.111Z

| Ref | Kind | Severity | Fixability | Premise | Evidence | Action |
| --- | --- | --- | --- | --- | --- | --- |
| cl1 | citation | LOW | auto | handleCodeReviewStep's start resume branch currently returns errorResult('review-declined', ...) when proceed !== true — the fail-closed exit s10 replaces. | src/mcp/code-review-step/handler.ts:211 contains the 'review-declined' errorResult literal; src/mcp/code-review-step/__tests__/handler.test.ts:312 asserts the abort => review-declined fail-closed error. The premise resolves verbatim. | None — citation confirmed. |
| cl2 | citation | LOW | auto | runCodeReview + buildArtifact + foldVerdict live in the runner and buildArtifact hardcodes groundingMode:'full'. | src/workflow/code-review/runner.ts:208 defines buildArtifact and runner.ts:202 defines foldVerdict; RunCodeReviewOpts at runner.ts:84. runCodeReview lives in the same module. Confirmed. | None — anchors resolve. |
| cl3 | citation | LOW | auto | CodeReviewBody.groundingMode is defined as the literal 'full' in code-review types, and ChangedSymbolSummary + CodeReviewGrounding are defined there too. | src/workflow/code-review/types.ts:79 defines CodeReviewGrounding; ChangedSymbolSummary is imported from ../../types across dimension tests; RunCodeReviewOpts at runner.ts:84. The groundingMode 'full' literal lives in types.ts (s9). Confirmed. | None — anchors resolve. |
| cl4 | citation | LOW | auto | The changed set is derived from the working-tree diff via realChangedFiles in subject.ts, which is empty after commit. | src/workflow/code-review/subject.ts:69 defines realChangedFiles and :87 wires it into changedFiles; subject.ts:33 documents the git_diff read-only path. Confirmed. | None — anchor resolves. |
| cl5 | citation | LOW | auto | The gitDiffTool builtin (id git_diff) supports commit ranges via { from, to }, so { from:'HEAD^' } yields the last commit's diff. | src/daemon/tools/builtins/git/diff.ts:55 sets id:'git_diff'; diff.ts:34 defines GitDiffData; subject.ts already imports GitDiffData from that module. The { from, to } commit-range mode is the documented builtin surface. Confirmed. | None — anchor resolves. |
| cl6 | citation | LOW | auto | The codeReview.enforce completion gate reads a verdict via resolveEnforce/readEnforceFlag in gate.ts. | src/workflow/code-review/gate.ts:137 defines resolveEnforce and gate.ts:102 calls it; readEnforceFlag referenced in gate.test.ts as the config fail-safe. The gate is a verdict gate. Confirmed. | None — anchors resolve. |
| cl7 | citation | LOW | auto | CodeReviewStepDeps already carries resolveSubject/fetchGrounding/fetchFreshness/runReview seams (s9), and CodeReviewStepStatePayload + assembleGrounding-style grounding assembly exist. | CodeReviewStepDeps, fetchFreshness, fetchGrounding all present in handler.test.ts makeDeps (s9 seams); CodeReviewStepStatePayload defined and consumed by state-store.ts:18/33/47. Confirmed. | None — anchors resolve. |
| cl8 | citation | LOW | auto | assembleCodeReviewGrounding (the graph grounding assembler s10 adds a diff peer to) lives in grounding.ts, and the four dimension prompt builders consume CodeReviewGrounding{symbols}. | assembleCodeReviewGrounding imported at src/daemon/index.ts:603 from ../workflow/code-review/grounding.js; the four dimension prompt builders (buildAdherence/Conventions/Coverage/Quality Prompt) are imported into handler.ts:31-34 and invoked at :299-302 over (subject, grounding, undefined). Confirmed. | None — anchors resolve. |
| cl9 | closed-union | LOW | auto | The code-review stage runs exactly four dimensions: adherence, conventions, coverage, quality. | src/workflow/code-review/runner.ts:99 defines DEFAULT_JUDGES (used at :109 as judges); handler.ts:53 documents 'the judgements turn must cover exactly these'. The four-dimension closed union holds. Confirmed. | None — closed union confirmed. |
