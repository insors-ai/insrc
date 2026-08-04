<!-- insrc:artifact PLAN-761a43a6fa645815-s8 -->

# Plan: E20260804761a43a6:S008

**Epic:** `add-daemon-driven-code-review-stage`
**LLD run:** `wf-1785831998142-uua7qy`
**LLD effective hash:** `47535369867a...`

## Tasks

| # | Task | Size | Depends on | Tests | Derived from |
| :--- | :--- | :--- | :--- | :--- | :--- |
| 1 | **`t1`** fetchCodeReviewGrounding helper (unaryRpc over codeReview.grounding) | S | — | unit: fetchCodeReviewGrounding with an injected fake socket returns {ok:true,grounding} on a daemon {ok:true,grounding}, and maps {ok:false,reason}/{error}/socket-reject to {ok:false,reason} (never throws) — the sole graph access (ac4) | [[c5]] |
| 2 | **`t2`** s8 envelope types + opaque-token state-store (mirror review-step) | S | — | unit: state-store round-trip: saveState mints an opaque token, loadState returns the saved CodeReviewStepStatePayload (subject+grounding) unchanged, and an unknown token throws StateTokenNotFound (exercised via the handler resume + unknown-token tests in t4) | [[c1]] [[c2]] |
| 3 | **`t3`** handleCodeReviewStep handler + injectable deps + tool registration | M | `t1`, `t2` | unit: start => next:'emit_judgements' with the four build<Dim>Prompt payloads + a file:line-pinned DimensionResult[] schema + grounding + an opaque token (ac1); unit: judgements turn resumes from the saved token to next:'done' and drives the SAME runCodeReview (injected deps) => { verdict, counts, path, jsonPath } (ac2/ac3); unit: the handler applies the shared scope-drop so an out-of-changedFiles finding is dropped (persisted record matches the daemon path, ac3/k2); unit: start declines (no-subject) + grounding-unavailable => next:'error' with no state saved; the tool is registered under 'insrc_code_review_step' (compile-verified) | [[c1]] [[c3]] [[c4]] [[c5]] |
| 4 | **`t4`** Fake-stub handler unit tests | M | `t3` | unit: ac1: start => emit_judgements (four prompts + file:line-pinned DimensionResult[] schema + grounding + token); unit: ac2: the opaque token resumes the run from the saved subject+grounding => next:'done'; unit: ac3: the judgements turn's write spy json basename is codeReviewArtifactId(...) ('CR-' prefix) + body.kind==='code-review' + verdict∈{pass,warn,block}; unit: ac3 parity: an out-of-changedFiles finding is DROPPED so the controller record matches the daemon path; unit: ac4: fetchGrounding (injected) is the sole grounding source; the handler performs no direct store access; unit: ac5: bad input / unknown phase / missing state / unknown token / missing/empty judgements / wrong-dimension set / malformed finding / malformed file:line location => next:'error' with the write spy NEVER called; unit: ac5: a declined-subject start (no-subject) and a grounding-unavailable start => next:'error'; live: over-the-socket insrc_code_review_step against a fixture repo writes a real CR- record (INSRC_LIVE_TESTS-gated, skips when unset) | [[c6]] [[c4]] |

### E20260804761a43a6:S008:T001 — fetchCodeReviewGrounding helper (unaryRpc over codeReview.grounding)

Add an exported fetchCodeReviewGrounding(params: { repo: string; epicHash: string; storyId: string }, deps?: UnaryRpcDeps): Promise<{ ok:true; grounding: CodeReviewGrounding } | { ok:false; reason: string }> in src/mcp/daemon-stream.ts, wrapping the existing private unaryRpc('codeReview.grounding', params, deps). It maps the daemon response ({ok:true,grounding} | {ok:false,reason} | {error}) to the {ok:true,grounding}|{ok:false,reason} shape, and a socket reject ('daemon is not running') to {ok:false, reason}. Reuses the existing UnaryRpcDeps { connect? } seam so tests stub the socket. No existing helper edited; additive export. This is the ONLY graph access for the MCP tool (k5/k6, ac4).

**Acceptance checks:**
- src/mcp/daemon-stream.ts exports fetchCodeReviewGrounding wrapping unaryRpc('codeReview.grounding', {repo,epicHash,storyId}), returning {ok:true,grounding}|{ok:false,reason}
- a daemon {ok:false,reason}/{error} response and a socket reject both map to {ok:false, reason} (never throws out)
- the UnaryRpcDeps { connect? } seam is threaded so a test can inject a fake socket; no existing daemon-stream export changed
- tsc --noEmit clean; .js imports + import type

### E20260804761a43a6:S008:T002 — s8 envelope types + opaque-token state-store (mirror review-step)

Add src/mcp/code-review-step/types.ts (mirroring src/mcp/review-step/types.ts): CodeReviewStepPhase = 'start' | 'judgements'; inputs CodeReviewStepInputStart { phase:'start', epicHash, storyId, repo? } + CodeReviewStepInputJudgements { phase:'judgements', judgements:{ judgements?: readonly DimensionResult[] }, state }; outputs CodeReviewStepEmitJudgements { next:'emit_judgements', guidance, prompts: LLMMessage[][], schema, grounding, state } + CodeReviewStepDone { next:'done', verdict: ReviewVerdict, counts, path, jsonPath } + CodeReviewStepError { next:'error', error:{code,message,retryable} } + the CodeReviewStepMcpEnvelope + CodeReviewStepStatePayload { runId, startedAtMs, repo, epicHash, storyId, subject: CodeReviewSubject, grounding: CodeReviewGrounding }. Add src/mcp/code-review-step/state-store.ts mirroring review-step/state-store.ts (saveState/loadState/updateState + StateTokenNotFound; 22-char token; LRU MAX_ENTRIES + TTL sweep). Type-only + an isolated store module; DimensionResult/ReviewVerdict/CodeReviewSubject/CodeReviewGrounding imported via import type.

**Acceptance checks:**
- src/mcp/code-review-step/types.ts exports the CodeReviewStepPhase union ('start'|'judgements') + the typed inputs/outputs (emit_judgements/done/error) + CodeReviewStepMcpEnvelope + CodeReviewStepStatePayload (holding subject+grounding)
- src/mcp/code-review-step/state-store.ts exports saveState/loadState (+ StateTokenNotFound) mirroring review-step/state-store.ts (opaque token; LRU+TTL); the state is server-side only — not round-tripped through the outer LLM
- tsc --noEmit clean; .js imports + import type; reuses ReviewVerdict/DimensionResult/CodeReviewSubject/CodeReviewGrounding (no redefinition)

### E20260804761a43a6:S008:T003 — handleCodeReviewStep handler + injectable deps + tool registration

Add src/mcp/code-review-step/handler.ts exporting handleCodeReviewStep(input: unknown, deps?: CodeReviewStepDeps): Promise<CodeReviewStepMcpEnvelope>, mirroring handleReviewStep (a phase switch inside one try/catch; a non-object/missing/unknown phase => errorResult). CodeReviewStepDeps is an injectable seam { resolveSubject, fetchGrounding, runReview, write } defaulting to the real impls (resolveCodeReviewSubject, fetchCodeReviewGrounding, runCodeReview, writeAtomic) so tests stub without a live daemon. phase='start' { epicHash, storyId, repo? }: resolve repo (param>INSRC_REPO); resolveSubject in-process => a {ok:false,reason} DECLINE returns next:'error' (code:'no-subject'); fetchGrounding over IPC => a reject/{ok:false} returns next:'error' (code:'grounding-unavailable'); saveState({subject,grounding,...}); return next:'emit_judgements' with the four build<Dim>Prompt payloads + a judgements schema PINNED to the per-dimension finding shape the four <DIM>_FINDINGS_SCHEMA define (a DimensionResult[] whose finding items require severity ∈ {HIGH,MED,LOW} + a `file:line` location + message; optional expectationRef/counterpartRef/confidence) + the grounding + the opaque token (critique 1). phase='judgements' { judgements, state }: loadState (unknown/expired => StateTokenNotFound => next:'error' code:'state-not-found'); VALIDATE the DimensionResult[] covers exactly {adherence,conventions,coverage,quality} well-formed — each finding.location a `file:line` string (contains ':'), severity in the enum (missing/empty/duplicate/unknown/malformed-finding/malformed-location => next:'error' code:'bad-judgements', NO write) (critique 1); APPLY the shared scope-drop (reuse the dimension modules' fileOf + subject.changedFiles filter) to the supplied DimensionResults BEFORE building the injected judges, so an out-of-changedFiles finding is dropped exactly as the daemon path does (ac3 parity, critique 2); drive runCodeReview(subject, dummyProvider, { runId, modelLabel:'client', ... }, INJECTED deps: judges return the matching scope-dropped supplied DimensionResult, assembleGrounding => saved grounding, write=writeAtomic); on outcome.ok:false => next:'error' code:'fold-failed' (no record); on ok => next:'done' { verdict, counts, path:paths.md, jsonPath:paths.json }. Register the tool in src/mcp/server.ts: an additive server.registerTool('insrc_code_review_step', { title, description, annotations:{readOnlyHint:false}, inputSchema:{ phase: z.enum(['start','judgements']), epicHash?, storyId?, repo?, judgements?, state? } }, async r=>handleCodeReviewStep(r)), a peer of insrc_review_step; import handleCodeReviewStep. getLogger not console.log; no Promise.all over a provider (the runner loops serially); .js imports + import type.

**Acceptance checks:**
- src/mcp/code-review-step/handler.ts exports handleCodeReviewStep(input, deps?) dispatching start/judgements inside one try/catch; a non-object / missing phase / unknown phase => a next:'error' frame (never a throw)
- phase='start' resolves the subject in-process (decline => next:'error' code:'no-subject', no verdict) + fetches grounding over IPC (unavailable => next:'error' code:'grounding-unavailable') + saveState + returns next:'emit_judgements' with the four build<Dim>Prompt payloads + a judgements schema PINNED to the per-dimension finding shape (severity enum + `file:line` location + message; optional refs) + the grounding + the opaque token
- phase='judgements' loadState (unknown/expired => next:'error' code:'state-not-found'), validates the four-dimension DimensionResult[] with each finding.location a `file:line` string (missing/empty/duplicate/unknown/malformed-finding/malformed-location => next:'error' code:'bad-judgements', NO write — never a silent drop), then drives runCodeReview with injected deps; outcome.ok:false => next:'error' (no record); ok => next:'done' { verdict, counts, path, jsonPath }
- the handler applies the SAME scope-drop as the daemon path (reuse the dimension modules' fileOf + subject.changedFiles filter) to the supplied DimensionResults before folding, so an out-of-changedFiles finding is dropped and the persisted record matches the daemon-driven record byte-for-byte (ac3/k2)
- CodeReviewStepDeps is an injectable seam (resolveSubject/fetchGrounding/runReview/write) defaulting to the real impls so tests stub without a live daemon; the record is produced by the SAME runCodeReview (ac3/k2)
- an additive server.registerTool('insrc_code_review_step', { inputSchema: phase/epicHash/storyId/repo/judgements/state }, handleCodeReviewStep) is added to src/mcp/server.ts (peer of insrc_review_step; no existing tool changed)
- tsc --noEmit clean; getLogger not console.log; .js imports + import type; no Promise.all over the provider

### E20260804761a43a6:S008:T004 — Fake-stub handler unit tests

Add src/mcp/code-review-step/__tests__/handler.test.ts (node:test + node:assert/strict via npx tsx --test): call handleCodeReviewStep with INJECTED CodeReviewStepDeps stubs — resolveSubject => a canned {ok:true,subject} (+ an {ok:false,reason} variant), fetchGrounding => a canned CodeReviewGrounding (+ a {ok:false}/reject variant), write => a spy, runReview => the REAL runCodeReview with its own injected fake deps (or a stub returning a canned CodeReviewOutcome) + a dummy read-only LLMProvider. Assert: (ac1) start => next:'emit_judgements' with the four prompts + a DimensionResult[] schema (finding location pinned to `file:line`) + grounding + an opaque state token; (ac2) feeding that token unchanged into a judgements turn resumes to next:'done' from the saved subject+grounding; (ac3) the judgements turn's write spy json basename is codeReviewArtifactId(...) ('CR-' prefix) + body.kind==='code-review' + verdict∈{pass,warn,block}; PLUS an out-of-changedFiles finding is DROPPED so the persisted record matches the daemon path (critique 2); (ac4) fetchGrounding is the sole grounding source (no direct store access); (ac5) malformed turns => next:'error' with NO write: non-object input, unknown phase, missing state, unknown token, missing/empty judgements, wrong-dimension set (missing/duplicate/unknown), a malformed finding, a malformed `file:line` location (bad-judgements, NOT a silent drop — critique 1); plus a declined-subject start and a grounding-unavailable start => next:'error'. No live daemon/graph/model.

**Acceptance checks:**
- src/mcp/code-review-step/__tests__/handler.test.ts runs under `npx tsx --test` with injected CodeReviewStepDeps stubs + a dummy provider — no live daemon/graph/model
- tests cover ac1-ac5: emit_judgements envelope (four prompts + a file:line-pinned DimensionResult[] schema + grounding + token); opaque-token resume => done; done persists a CR- record (kind:'code-review', folded verdict) via the write spy; grounding only via the injected fetch; every malformed-turn error path (bad input / unknown phase / missing state / unknown token / bad-judgements incl. a malformed location / declined subject / grounding-unavailable) => next:'error' with the write spy NEVER called
- an edge test asserts an out-of-changedFiles finding is DROPPED (not persisted) so the controller record matches the daemon path (ac3 parity); and a malformed-location finding => bad-judgements (not a silent drop)
- the full `npx tsx --test 'src/mcp/**/*.test.ts'` + `'src/workflow/code-review/**/*.test.ts'` sweeps pass (existing suites stay green)

## Test-strategy coverage

| LLD strategy item | Covered by |
| :--- | :--- |
| handleCodeReviewStep(phase='start') returns next:'emit_judgements' with the four build<Dim>Prompt payloads + a DimensionResult[] schema + the grounding + an opaque state token (ac1) | `t3`, `t4` |
| handleCodeReviewStep(phase='judgements') carries the token back unchanged, loads the saved subject+grounding, and resumes to next:'done' (ac2) | `t3`, `t4` |
| the judgements turn drives runCodeReview (injected deps: judges return the supplied DimensionResults, assembleGrounding replays the fetched grounding, write=spy) and returns { verdict, counts, path, jsonPath } from the CodeReviewOutcome (ac3) | `t3`, `t4` |
| the persisted record equals a daemon-driven record for the same DimensionResults (same kind:'code-review', same block/warn/pass fold + counts) (ac3) | `t4` |
| fetchCodeReviewGrounding is the ONLY graph access — the handler opens no LMDB/Lance; a stubbed IPC seam feeds the grounding (ac4) | `t1`, `t4` |
| malformed-turn rejection => next:'error': non-object input / unknown phase / missing state / unknown token / missing/empty judgements / wrong-dimension set (missing, duplicate, unknown) / a malformed finding — each names the fault and writes NOTHING (ac5) | `t4` |
| a declined subject ({ok:false, reason}) at start => next:'error' (no emit_judgements, no verdict); a grounding-unavailable => next:'error' | `t3`, `t4` |
| driving runCodeReview once with injected controller judges and once with equivalent daemon-style judges yields the same body.dimensions + verdict + counts (the shared orchestrator, k2) | `t4` |
| handleCodeReviewStep(start) against a live daemon returns real grounding over the codeReview.grounding IPC; a judgements turn writes a real CR-<epic>-<story> record | `t4` |

## Citations

- **[[c1]]** `prior-artifact` `LLD s8 handoff — the insrc_review_step envelope the tool mirrors: src/mcp/review-step/ handler.ts (handleReviewStep, phase switch + McpEnvelope) + types.ts (phase union + typed inputs/outputs); registered via server.registerTool in server.ts`
- **[[c2]]** `prior-artifact` `LLD s8 handoff — the opaque-token state-store: src/mcp/review-step/state-store.ts saveState/loadState/StateTokenNotFound (opaque token; LRU+TTL; state never round-tripped through the outer LLM) the s8 store mirrors`
- **[[c3]]** `prior-artifact` `LLD s8 handoff — sc1 in-process subject resolution: resolveCodeReviewSubject (subject.ts:87, file+git only) declining {ok:false, reason} (no-approved-contract→no-verdict)`
- **[[c4]]** `prior-artifact` `LLD s8 handoff — the sc5 orchestrator: runCodeReview + CodeReviewRunnerDeps { judges, assembleGrounding, write } (runner.ts, S006) the judgements turn drives with injected deps so the record is byte-identical (ac3/k2)`
- **[[c5]]** `prior-artifact` `LLD s8 handoff — sc2 grounding over IPC: the 'codeReview.grounding' daemon handler (daemon/index.ts:594) + the private unaryRpc socket client (daemon-stream.ts) the new fetchCodeReviewGrounding wraps (graph only over the socket, k5/k6)`
- **[[c6]]** `prior-artifact` `LLD s8 handoff — the four build<Dim>Prompt + <DIM>_FINDINGS_SCHEMA + DimensionResult (code-review dimensions/types) the emit_judgements turn hands the controller + the fake-stub test harness (review-step __tests__ + code-review __tests__)`

<!-- insrc:review -->

## Review

### ✅ Review `PASS` — plan (plan)

**0 HIGH · 0 MED · 0 LOW** · model `client` · reviewed 2026-08-04T11:09:18.960Z

_No load-bearing premises were extracted._
