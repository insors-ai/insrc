<!-- insrc:artifact PLAN-761a43a6fa645815-s6 -->

# Plan: E20260804761a43a6:S006

**Epic:** `add-daemon-driven-code-review-stage`
**LLD run:** `wf-1785825806747-x7hhbj`
**LLD effective hash:** `47535369867a...`

## Tasks

| # | Task | Size | Depends on | Tests | Derived from |
| :--- | :--- | :--- | :--- | :--- | :--- |
| 1 | **`t1`** sc4 record types (CodeReviewBody / CodeReviewArtifact / CodeReviewOutcome) | S | — | unit: sc4 types compile + shape assertion: a constructed CodeReviewArtifact literal type-checks (meta extends ArtifactMetaBase, body carries kind/verdict/counts/dimensions) — exercised indirectly by the runner tests that build the record | [[c1]] [[c2]] |
| 2 | **`t2`** Additive storage peers codeReviewArtifactId / codeReviewArtifactPaths | S | — | unit: codeReviewArtifactId returns 'CR-<epic>-<story>' (starts 'CR-', distinct from BUILD-/LLD-/PLAN-...); codeReviewArtifactPaths.json is join(repoPath, ARTIFACTS_DIR, id+'.json') — asserted in the runner test's ac3 | [[c3]] |
| 3 | **`t3`** The runner runCodeReview (serial loop + verdict fold + validate-then-write) | M | `t1`, `t2` | unit: runCodeReview serial for-of over the four injected judges in [adherence,conventions,coverage,quality] order (ac4, no overlap); unit: runCodeReview folds verdict (any HIGH=>block, else any MED=>warn, else pass) + counts over aggregated findings (ac2); unit: runCodeReview builds+validates in memory THEN writes both .json+.md at codeReviewArtifactPaths (ac1/ac3); unit: runCodeReview returns CodeReviewOutcome {ok:false} + writes nothing on throwing-judge / validation-failure / aborted-signal (ac5) | [[c4]] [[c1]] [[c3]] [[c5]] |
| 4 | **`t4`** Fake-provider unit tests for the runner | M | `t3` | unit: ac1: all-four-return-findings => ONE record with body.dimensions length 4 + folded verdict + counts; unit: ac2: verdict-fold table (HIGH=>block, MED-no-HIGH=>warn, only-LOW/empty=>pass) + counts totals; verdict∈{'pass','warn','block'}; unit: ac3: write spy json basename is codeReviewArtifactId(...) ('CR-' prefix) and body.kind==='code-review'; unit: ac4: the four judges ran serially in [adherence,conventions,coverage,quality] order with no overlap; unit: ac5: throwing 2nd judge => {ok:false}, write spy NEVER called, judges 3-4 not run; unit: ac5: in-memory validation failure => {ok:false} + no write; unit: ac5: pre-aborted opts.signal => {ok:false} + no write; unit: success writes BOTH .json and .md (two write-spy calls); live: runCodeReview with DEFAULT_DEPS against a real buildShaperProvider on a fixture Story writes a real CR-<epic>-<story> record (INSRC_LIVE_TESTS-gated, skips when unset) | [[c6]] [[c4]] |
| 5 | **`t5`** Thin daemon 'codeReview.run' StreamHandler | M | `t3` | unit: tsc typecheck: codeReviewRunStart wires buildShaperProvider + resolveCodeReviewSubject + runCodeReview and is registered under 'codeReview.run' (compile-verified; runtime IPC is live-gated); live: over-the-socket 'codeReview.run' against a fixture repo streams CodeReviewProgress and writes a CR- record; declines with an error frame when no approved contract/build (INSRC_LIVE_TESTS-gated) | [[c7]] [[c4]] |

### E20260804761a43a6:S006:T001 — sc4 record types (CodeReviewBody / CodeReviewArtifact / CodeReviewOutcome)

Add the sc4 record types to src/workflow/code-review/types.ts (beside sc1/sc2/sc3): CodeReviewBody { readonly kind: 'code-review'; readonly epicHash: string; readonly storyId: string; readonly subject: { readonly changedFiles: readonly string[] }; readonly dimensions: readonly DimensionResult[]; readonly verdict: ReviewVerdict; readonly counts: { readonly high: number; readonly med: number; readonly low: number } }; CodeReviewMeta extends ArtifactMetaBase; CodeReviewArtifact = { readonly meta: CodeReviewMeta; readonly body: CodeReviewBody }; CodeReviewOutcome = { readonly ok: true; readonly artifact: CodeReviewArtifact } | { readonly ok: false; readonly error: string }. Reuse ReviewVerdict/Severity from ../review/types.js and ArtifactMetaBase from the artifacts meta base via import type. Type-only — no runtime behaviour. .js import extensions; import type for type-only.

**Acceptance checks:**
- src/workflow/code-review/types.ts exports CodeReviewBody, CodeReviewArtifact, CodeReviewOutcome (+ CodeReviewMeta)
- CodeReviewBody carries kind:'code-review', epicHash, storyId, subject.changedFiles, dimensions: DimensionResult[], verdict: ReviewVerdict (imported from ../review/types.js), counts:{high,med,low}
- CodeReviewArtifact = {meta: CodeReviewMeta extends ArtifactMetaBase, body: CodeReviewBody}; CodeReviewOutcome is the {ok:true,artifact}|{ok:false,error} discriminated union
- tsc --noEmit is clean; imports carry .js extensions and type-only imports use import type

### E20260804761a43a6:S006:T002 — Additive storage peers codeReviewArtifactId / codeReviewArtifactPaths

Add to src/workflow/storage.ts, alongside buildArtifactId (:161) + buildArtifactPaths (:285): codeReviewArtifactId(epicHash, storyId): string => `CR-${epicHash}-${storyId}`, and codeReviewArtifactPaths(repoPath, epicHash, storyId, epicSlug?): {readonly md; readonly json} with json = join(repoPath, ARTIFACTS_DIR, `${codeReviewArtifactId(epicHash, storyId)}.json`) and md using the fileSeg(epicSlug ?? epicHash) convention buildArtifactPaths uses (choose the code-review docs dir or ARTIFACTS-adjacent per the sibling pattern). No existing storage function is edited; the CR- namespace is new.

**Acceptance checks:**
- src/workflow/storage.ts exports codeReviewArtifactId => 'CR-<epic>-<story>' and codeReviewArtifactPaths => {md, json}
- codeReviewArtifactPaths.json lands under ARTIFACTS_DIR ('.insrc/artifacts') as `${codeReviewArtifactId(...)}.json`, mirroring buildArtifactPaths
- the CR- prefix is distinct from every existing artifact id prefix (DEF/HLD/LLD/PLAN/BUILD/EXT/SPEC); no existing *ArtifactId/*ArtifactPaths edited
- tsc --noEmit is clean

### E20260804761a43a6:S006:T003 — The runner runCodeReview (serial loop + verdict fold + validate-then-write)

Add src/workflow/code-review/runner.ts exporting runCodeReview(subject: CodeReviewSubject, provider: LLMProvider, opts: RunCodeReviewOpts, deps = DEFAULT_DEPS): Promise<CodeReviewOutcome>, plus the sc5 types RunCodeReviewOpts {runId, modelLabel, signal?, onProgress?}, CodeReviewProgress {phase: 'grounding'|'dimension-start'|'dimension-done'|'finalize'|'done'|'error', dimension?, detail?}, and CodeReviewRunnerDeps {judges: readonly {dimension: ReviewDimension; judge: (s,g,p)=>Promise<DimensionResult>}[]; assembleGrounding; write}. DEFAULT_DEPS wires the four shipped judges in fixed order [adherence, conventions, coverage, quality], assembleCodeReviewGrounding (S001, grounding.ts:61), and writeAtomic (storage.ts:73). Flow, ALL inside one try/catch that converts throws to {ok:false, error} BEFORE any write: (1) emit 'grounding'; assembleGrounding(subject.repoPath, subject.changedFiles) — on throw return {ok:false}; (2) SERIAL for-of the judges (never Promise.all, k4): check opts.signal?.aborted at each iteration boundary (return {ok:false,'aborted'} if set), emit 'dimension-start', await judge(subject, grounding, provider) collecting DimensionResult[], emit 'dimension-done' — a throwing judge propagates to the catch => {ok:false} with NO write (ac5); (3) fold verdict: flatten all findings, count severities => counts:{high,med,low}, verdict = counts.high>0 ? 'block' : counts.med>0 ? 'warn' : 'pass'; (4) build the CodeReviewArtifact (meta stamped with runId/modelLabel/epicHash/storyId/kind; body{kind:'code-review', epicHash, storyId, subject:{changedFiles}, dimensions, verdict, counts}); (5) VALIDATE in memory (verdict ∈ {'pass','warn','block'}, counts consistent, dimensions length===judges.length) — on failure return {ok:false} WITHOUT writing; (6) emit 'finalize'; write BOTH files from codeReviewArtifactPaths — deps.write(paths.json, JSON.stringify(artifact,null,2)+'\n') and deps.write(paths.md, renderCodeReviewMd(artifact)) where renderCodeReviewMd is a private minimal markdown summary (the insrc:artifact marker + verdict + counts + per-dimension findings, like the sibling artifacts); emit 'done'; return {ok:true, artifact}. Read-only over source; imports .js + import type; getLogger not console.log; no Promise.all.

**Acceptance checks:**
- src/workflow/code-review/runner.ts exports runCodeReview + the sc5 types (RunCodeReviewOpts, CodeReviewProgress, CodeReviewRunnerDeps) + DEFAULT_DEPS wiring the four shipped judges (fixed order) + assembleCodeReviewGrounding + writeAtomic
- the four judges run in a SERIAL for-of loop (no Promise.all over the provider); opts.signal.aborted is checked at each iteration boundary
- verdict fold: any HIGH=>block, else any MED=>warn, else pass; counts:{high,med,low} are the true totals over all four dimensions' findings
- a throwing judge / grounding failure / in-memory validation failure / aborted signal returns {ok:false, error} and calls deps.write ZERO times (ac5 — no partial/pass record)
- on success exactly one CodeReviewArtifact is built + validated in memory THEN BOTH files written via deps.write at codeReviewArtifactPaths (.json = JSON.stringify(artifact,null,2)+newline; .md = private renderCodeReviewMd summary with the insrc:artifact marker); body.dimensions has all four, body.verdict+counts mirror ReviewReport
- tsc --noEmit clean; imports .js + import type; no console.log; no Promise.all

### E20260804761a43a6:S006:T004 — Fake-provider unit tests for the runner

Add src/workflow/code-review/__tests__/runner.test.ts: inject a fake CodeReviewRunnerDeps — judges = ordered stub fns that push their dimension to a shared call-order array (with an await tick + an in-flight flag to prove no overlap) and return scripted DimensionResults; assembleGrounding = stub returning a canned CodeReviewGrounding; write = a spy capturing (path, content). Plus a fake LLMProvider (cast as unknown) passed through, a subject(changedFiles, epicHash, storyId) factory, and RunCodeReviewOpts with an onProgress spy. Cover: (ac1) all-four-return-findings => ONE record with body.dimensions length 4 + folded verdict + counts; (ac2) verdict-fold table (any-HIGH=>block, any-MED-no-HIGH=>warn, only-LOW/empty=>pass) + counts totals; (ac3) the write spy's json basename is codeReviewArtifactId(...) (starts 'CR-') and body.kind==='code-review'; (ac4) the four judges ran serially in [adherence,conventions,coverage,quality] order, no overlap; (ac5) a throwing 2nd judge => {ok:false} + write spy NEVER called + judges 3-4 not run; an in-memory validation failure => {ok:false} + no write; a pre-aborted signal => {ok:false} + no write. Also assert BOTH .json and .md are written on success (two write-spy calls). No live model.

**Acceptance checks:**
- src/workflow/code-review/__tests__/runner.test.ts runs under `npx tsx --test` with node:test + node:assert/strict and injected fakes (no live daemon/Ollama)
- tests cover ac1-ac5: single-record aggregation, verdict-fold table + counts, CR- id + kind, serial order, and the three no-write-on-failure paths (throwing judge / validation failure / aborted signal); plus both .json+.md written on success
- the full `npx tsx --test 'src/workflow/code-review/**/*.test.ts'` sweep passes (S001-S006 green; any live test skips cleanly when INSRC_LIVE_TESTS unset)

### E20260804761a43a6:S006:T005 — Thin daemon 'codeReview.run' StreamHandler

Add the daemon-driven entrypoint completing sc5: a new src/daemon/code-review-rpc.ts exporting codeReviewRunStart(params, send, signal) that resolves the high-tier provider via buildShaperProvider (shaper-provider.ts:277), resolves the subject via resolveCodeReviewSubject from S001 and DECLINES (sends an error/decline frame, no run) when it returns {ok:false, reason}, otherwise builds RunCodeReviewOpts {runId, modelLabel, signal, onProgress: frame=>send(...)} streaming CodeReviewProgress, calls runCodeReview, and sends the terminal outcome + 'done'/'error' — mirroring workflow-rpc.ts's runStart + WorkflowProgress (:106). Register 'codeReview.run' in daemon/index.ts's stream-handlers map next to the existing 'codeReview.grounding' handler (index.ts:594). Thin wiring only; the load-bearing logic is t3's runCodeReview. Verified by tsc (+ optional live-gated smoke).

**Acceptance checks:**
- src/daemon/code-review-rpc.ts exports codeReviewRunStart (a StreamHandler peer of workflow-rpc's runStart) that resolves provider via buildShaperProvider, resolves the subject, streams CodeReviewProgress via send, calls runCodeReview, and returns the outcome
- when resolveCodeReviewSubject returns {ok:false, reason} the handler DECLINES (sends an error/decline frame; runCodeReview is NOT called)
- 'codeReview.run' is registered in daemon/index.ts's stream-handlers map (a NEW key beside 'codeReview.grounding'; no existing handler changed)
- tsc --noEmit is clean; the handler is thin wiring — no verdict/fold/persist logic duplicated from the runner; review remains read-only at the high tier (k10)

## Test-strategy coverage

| LLD strategy item | Covered by |
| :--- | :--- |
| runCodeReview (serial for-of over the four injected judges in order; fold verdict from aggregated severities; build sc4 record; validate-then-write; return CodeReviewOutcome) | `t3`, `t4` |
| verdict fold (any HIGH=>block, else any MED=>warn, else pass) over the aggregated DimensionFinding severities + counts | `t3`, `t4` |
| codeReviewArtifactId / codeReviewArtifactPaths ('CR-<epic>-<story>' id + {md,json} under ARTIFACTS_DIR) | `t2`, `t4` |
| the CodeReviewOutcome discriminated union (ok:true carries artifact; ok:false carries error and writes nothing) | `t1`, `t4` |
| runCodeReview with DEFAULT_DEPS (the four real judges + real assembler + writeAtomic) against a real buildShaperProvider-resolved provider | `t4`, `t5` |

## Citations

- **[[c1]]** `prior-artifact` `LLD s6 handoff — sc4 CodeReviewBody record contract (kind:'code-review', epicHash, storyId, subject.changedFiles, dimensions: DimensionResult[], verdict: ReviewVerdict, counts:{high,med,low})`
- **[[c2]]** `prior-artifact` `LLD s6 handoff — sc4 CodeReviewArtifact = {meta: CodeReviewMeta extends ArtifactMetaBase, body: CodeReviewBody} + CodeReviewOutcome {ok:true,artifact}|{ok:false,error} discriminated union`
- **[[c3]]** `prior-artifact` `LLD s6 handoff — storage namespace: codeReviewArtifactId 'CR-<epic>-<story>' + codeReviewArtifactPaths {md,json} under ARTIFACTS_DIR, additive peers of buildArtifactId:161/buildArtifactPaths:285`
- **[[c4]]** `prior-artifact` `LLD s6 handoff — sc5 CodeReviewRunner: runCodeReview(subject, provider, opts, deps=DEFAULT_DEPS) serial for-of over the four shipped judges + assembleCodeReviewGrounding + writeAtomic; RunCodeReviewOpts/CodeReviewProgress/CodeReviewRunnerDeps`
- **[[c5]]** `prior-artifact` `LLD s6 handoff — verdict-fold + no-pass-on-failure invariant (ac5): any HIGH=>block, else any MED=>warn, else pass; validate-in-memory THEN write; a throwing judge/grounding/validation/abort returns {ok:false} with ZERO writes`
- **[[c6]]** `prior-artifact` `LLD s6 handoff — fake-provider test discipline: injected CodeReviewRunnerDeps (ordered stub judges + assembleGrounding stub + write spy), node:test + node:assert/strict, no live model; mirrors the shipped dimension tests`
- **[[c7]]** `prior-artifact` `LLD s6 handoff — thin daemon 'codeReview.run' StreamHandler: codeReviewRunStart resolves buildShaperProvider + resolveCodeReviewSubject (declines on {ok:false,reason}) + runCodeReview, registered beside 'codeReview.grounding' (daemon/index.ts:594)`

<!-- insrc:review -->

## Review

### ✅ Review `PASS` — plan (plan)

**0 HIGH · 0 MED · 0 LOW** · model `client` · reviewed 2026-08-04T07:11:11.452Z

_No load-bearing premises were extracted._
