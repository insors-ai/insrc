<!-- insrc:artifact LLD-761a43a6fa645815-s8 -->

# LLD: E20260804761a43a6:S008

**Epic:** `add-daemon-driven-code-review-stage`
**HLD base run:** `wf-1785741597494-lbzdo7`
**HLD effective hash:** `47535369867a...`

## HLD context

**Framework:** A hybrid code-review stage (winner a3): a code-review-specific orchestrator runs the four dimensions (adherence/conventions/coverage/quality) as an explicit SERIAL provider loop, reusing src/daemon/workflow-rpc.ts's proven machinery (buildShaperProvider resolution, synthesize-with-retry, writeAtomic, meta-stamping, optional boundary re-audit, the runStart StreamHandler shape) rather than cloning it, and mirroring the existing review vocabulary (ReviewVerdict / Severity / ReviewReport from src/workflow/review/types.ts) so the persisted CodeReviewArtifact carries a block/warn/pass verdict downstream approval already understands. The daemon-driven path and the controller-driven insrc_code_review_step (which mirrors insrc_review_step's start/emit/done/error/opaque-state envelope) share ONE orchestrator, differing only in who supplies each dimension's judgement. The stage runs after build, consumes the build record + approved LLD/PLAN as its fixed subject without re-deriving them, and never modifies the code it judges.
**Rollout phase:** Phase D — Completion gate + independent controller path
**Consumes:** `sc1` (CodeReviewSubject), `sc2` (CodeReviewGrounding), `sc4` (CodeReviewArtifact), `sc5` (CodeReviewRunner)

## Contract details

**Surface level:** internal

### `handleCodeReviewStep`

```typescript
export async function handleCodeReviewStep(input: unknown): Promise<CodeReviewStepMcpEnvelope>
```

**Parameters:**
- `input: unknown` — The raw MCP tool args for one turn: { phase:'start', epicHash, storyId, repo? } | { phase:'judgements', judgements: { judgements: DimensionResult[] }, state }. Parsed + validated inside; a non-object / missing phase / unknown phase yields a next:'error' frame (ac5).

**Returns:** `Promise<CodeReviewStepMcpEnvelope>` — The MCP envelope { content:[{type:'text', text: JSON.stringify(result)}], isError? } wrapping a CodeReviewStepOutput (emit_judgements | done | error), mirroring handleReviewStep's envelope verbatim.

**Errors:**
- `next:'error' frame (not a throw)` when Bad input / unknown phase / unknown-or-expired state token (StateTokenNotFound) / a declined subject ({ok:false,reason}) / missing or wrong-dimension judgements — each becomes a next:'error' { code, message, retryable } frame naming the fault, never a silently-accepted verdict (ac5).

**Preconditions:**
- The daemon is reachable for the codeReview.grounding IPC (grounding is served only over the socket, k5).
- INSRC_REPO or an explicit repo identifies a registered, indexed repo.

**Postconditions:**
- phase='start' resolves the sc1 subject in-process + fetches sc2 grounding over IPC, saves opaque state, and returns next:'emit_judgements' (the four build<Dim>Prompt payloads + a DimensionResult[] schema + the grounding + state).
- phase='judgements' folds the controller-supplied DimensionResult[] through runCodeReview (injected deps) and returns next:'done' { verdict, counts, path, jsonPath } once the CR record is persisted — OR next:'error' with nothing written (ac5).
- Read-only over the Story's source; the only write is the CR-<epic>-<story> record via writeAtomic (ac3).

### `resolveCodeReviewSubject`

```typescript
export async function resolveCodeReviewSubject(repoPath: string, epicHash: string, storyId: string, deps?: SubjectDeps): Promise<CodeReviewSubjectResult>
```

**Parameters:**
- `repoPath: string` — Absolute repo root; resolves the approved LLD/PLAN + git-derived changedFiles (file+git only, no LMDB) so it runs in-process in the MCP tool.
- `epicHash: string` — Epic hash keying the approved contract + the CR record.
- `storyId: string` — Story id keying the approved contract + the CR record.
- `deps: SubjectDeps` _(optional)_ — Injectable seams (default the real gate readers) so the handler tests stub resolution without live git/files.

**Returns:** `Promise<CodeReviewSubjectResult>` — { ok:true, subject } or { ok:false, reason:'no-approved-contract'|'no-build-record' } — a DECLINE, not a verdict. Existing S001 resolver, reused verbatim.

**Errors:**
- `UnregisteredRepoError` when Propagates for an unregistered repo (not swallowed); missing/unapproved contract or build become the {ok:false, reason} decline the handler relays as a next:'error' frame.

**Preconditions:**
- Existing S001 resolver (src/workflow/code-review/subject.ts:87); reads files + git, no DB access.

**Postconditions:**
- Enforces no-approved-contract→no-verdict; the handler DECLINES (error frame) rather than producing a verdict when {ok:false}.

### `runCodeReview`

```typescript
export async function runCodeReview(subject: CodeReviewSubject, provider: LLMProvider, opts: RunCodeReviewOpts, deps?: CodeReviewRunnerDeps): Promise<CodeReviewOutcome>
```

**Parameters:**
- `subject: CodeReviewSubject` — The resolved sc1 subject from the start turn (via state); its changedFiles scope + epicHash/storyId key the CR record.
- `provider: LLMProvider` — Unused on the controller path (the injected judges never call it); a dummy read-only provider whose capabilities.structuredOutput is true is passed to satisfy the signature + gate.
- `opts: RunCodeReviewOpts` — { runId, modelLabel:'client', signal?, onProgress? } — modelLabel 'client' marks the controller-supplied path in meta.
- `deps: CodeReviewRunnerDeps` _(optional)_ — INJECTED: judges = four slots whose judge fns return the matching controller-supplied DimensionResult (no provider call); assembleGrounding returns the state-saved grounding; write = writeAtomic. This is how the controller's judgement drives the SAME orchestrator.

**Returns:** `Promise<CodeReviewOutcome>` — { ok:true, artifact } after the sc4 record is validated + written, or { ok:false, error } with NO record written (ac5) — identical to the daemon-driven path (ac3). Existing S006 runner, reused verbatim.

**Errors:**
- `CodeReviewOutcome {ok:false, error} (not thrown)` when An injected judge throwing (won't happen for well-formed supplied results), grounding-dep failure, or in-memory validation failure — the runner returns {ok:false} before any write (ac5).

**Preconditions:**
- Existing S006 runner (src/workflow/code-review/runner.ts); the four injected judges return well-formed DimensionResults (the handler validates the DimensionResult[] before driving).

**Postconditions:**
- Serial four-dimension fold + validate-then-write; the persisted record + block/warn/pass verdict are byte-identical to the daemon-driven codeReview.run path (ac3).

### `fetchCodeReviewGrounding`

```typescript
export function fetchCodeReviewGrounding(params: { repo: string; epicHash: string; storyId: string }, deps?: UnaryRpcDeps): Promise<{ ok: true; grounding: CodeReviewGrounding } | { ok: false; reason: string }>
```

**Parameters:**
- `params: { repo: string; epicHash: string; storyId: string }` — The codeReview.grounding IPC params; the daemon resolves the subject internally + returns structured symbol summaries (no raw file text).
- `deps: UnaryRpcDeps` _(optional)_ — Injectable { connect? } socket seam (as in daemon-stream.ts) so the handler tests stub the IPC without a live daemon.

**Returns:** `Promise<{ ok:true, grounding: CodeReviewGrounding } | { ok:false, reason: string }>` — The daemon-served grounding, or a decline/error reason the handler relays as a next:'error' frame. A NEW thin helper wrapping the existing private unaryRpc('codeReview.grounding', ...) so the MCP tool reaches the graph ONLY over IPC (k5/k6, ac4).

**Errors:**
- `rejects / {ok:false}` when Daemon unreachable ('daemon is not running'), or the IPC returns {ok:false, reason} (no-approved-contract / no-build-record) / {error} — surfaced to the handler which emits a next:'error' frame.

**Preconditions:**
- The existing 'codeReview.grounding' daemon handler (daemon/index.ts:594) + the unaryRpc socket client (src/mcp/daemon-stream.ts).

**Postconditions:**
- The MCP tool never opens LMDB/Lance directly — all graph access is over the socket (k5); grounding is structured summaries, never raw file dumps (k6).

## Data model changes

### `CodeReviewStepInput / Output / StatePayload / phase union` — new

The s8 envelope types (private to src/mcp/code-review-step/types.ts), mirroring src/mcp/review-step/types.ts: CodeReviewStepPhase = 'start' | 'judgements'; inputs + outputs (emit_judgements / done / error) + CodeReviewStepStatePayload holding subject+grounding between turns. In-memory + opaque-token only; no persisted schema. [[c1]] [[c2]]

```
+ type CodeReviewStepPhase = 'start' | 'judgements';
+ interface CodeReviewStepInputJudgements { phase:'judgements'; judgements:{ judgements?: readonly DimensionResult[] }; state:string }
+ interface CodeReviewStepEmitJudgements { next:'emit_judgements'; guidance; prompts; schema; grounding; state }
+ interface CodeReviewStepDone { next:'done'; verdict: ReviewVerdict; counts; path; jsonPath }
+ interface CodeReviewStepStatePayload { runId; startedAtMs; repo; epicHash; storyId; subject: CodeReviewSubject; grounding: CodeReviewGrounding }
```

**Call sites:**
- `src/mcp/code-review-step/types.ts (new)`
- `src/mcp/code-review-step/handler.ts (new)`
- `src/mcp/code-review-step/state-store.ts (new)`

### `insrc_code_review_step (MCP tool registration) + fetchCodeReviewGrounding helper` — new

An additive server.registerTool('insrc_code_review_step', ...) in server.ts (peer of insrc_review_step) + a new fetchCodeReviewGrounding export wrapping unaryRpc('codeReview.grounding') in daemon-stream.ts. No existing tool/helper changed. [[c1]] [[c5]]

```
+ server.registerTool('insrc_code_review_step', { inputSchema:{ phase, epicHash?, storyId?, repo?, judgements?, state? } }, handleCodeReviewStep)
+ export function fetchCodeReviewGrounding(params, deps?) => Promise<{ok:true,grounding}|{ok:false,reason}>
```

**Call sites:**
- `src/mcp/server.ts (registration)`
- `src/mcp/daemon-stream.ts (fetchCodeReviewGrounding, wrapping the existing unaryRpc)`

## Interaction with shared contracts

| Contract | Role | How |
| :--- | :--- | :--- |
| `sc1` | consumes | phase='start' calls resolveCodeReviewSubject in-process (file+git, no DB) to get the fixed subject; a {ok:false, reason} decline becomes a next:'error' frame (no verdict). The subject is stored in the opaque state for the judgements turn. [[c3]] |
| `sc2` | consumes | phase='start' fetches the sc2 grounding via fetchCodeReviewGrounding over the codeReview.grounding daemon IPC (k5/k6, ac4); runCodeReview's injected assembleGrounding replays it on the judgements turn. [[c5]] |
| `sc4` | consumes | The judgements turn re-produces the sc4 CodeReviewArtifact via runCodeReview and persists it at CR-<epic>-<story> — same kind + verdict vocabulary as the daemon-driven path (ac3). [[c4]] |
| `sc5` | consumes | Drives the sc5 runCodeReview orchestrator with injected CodeReviewRunnerDeps — ONE orchestrator shared with codeReview.run, differing only in who supplies each dimension's judgement (k2). [[c4]] |

## Error paths

### Error cases

- **The controller submits a phase='judgements' turn whose judgements array is missing, empty, or does not cover exactly the four dimensions (adherence/conventions/coverage/quality) — e.g. a duplicate dimension or a fifth unknown one.** (recoverable)
  - Detection: After loadState(token), the handler validates the DimensionResult[] BEFORE driving runCodeReview: it checks the set of dimension values equals the fixed four-member set, each entry is a well-formed DimensionResult (dimension + findings[], each finding severity ∈ {HIGH,MED,LOW} + a location + message).
  - Response: Returns a next:'error' { code:'bad-judgements', message naming the missing/duplicate/unknown dimension or the malformed finding, retryable:true }. runCodeReview is NOT driven, so NO CR record is written (ac5).
  - User impact: The controller sees exactly what was wrong and can re-emit the corrected judgements on the same token — never a silently-accepted or partial verdict.
- **The state token carried on the judgements turn is unknown or expired (server restarted, TTL swept, or the run already completed).** (recoverable)
  - Detection: loadState(token) throws StateTokenNotFound (the review-step state-store contract reused verbatim).
  - Response: Caught by the handler's try/catch and converted to a next:'error' { code:'state-not-found', message:'restart with phase=start', retryable:false }. Nothing is written.
  - User impact: The controller is told to restart the review from phase='start' rather than getting a stale or corrupt result.
- **phase='start' cannot resolve the subject: the Story has no approved LLD/PLAN or no build changes (resolveCodeReviewSubject returns {ok:false, reason}).** (recoverable)
  - Detection: The in-process resolveCodeReviewSubject call returns {ok:false, reason:'no-approved-contract'|'no-build-record'} — a decline, not a throw.
  - Response: The handler DECLINES with a next:'error' { code:'no-subject', message naming the reason, retryable:false } — it never fabricates a verdict for a Story with nothing to judge (the sc1 no-approved-contract→no-verdict rule). No emit_judgements frame + no record.
  - User impact: The controller is told the review cannot start and why (approve the contract / run the build first) rather than receiving an empty pass.
- **phase='start' cannot fetch grounding because the daemon is unreachable or the codeReview.grounding IPC returns {ok:false}/{error}.** (recoverable)
  - Detection: fetchCodeReviewGrounding rejects ('daemon is not running') or resolves {ok:false, reason}; the handler awaits it inside the try/catch.
  - Response: Returns a next:'error' { code:'grounding-unavailable', message, retryable:true }. No state is saved and no record written — the controller never proceeds to judge un-grounded code.
  - User impact: The controller sees a grounding/daemon error (start the daemon; re-index) instead of a review over missing context.
- **runCodeReview returns {ok:false, error} on the judgements turn (in-memory validation of the built record fails — e.g. a dimension mismatch slips past the handler validation).** (recoverable)
  - Detection: The handler inspects the CodeReviewOutcome discriminant: outcome.ok === false.
  - Response: Returns a next:'error' { code:'fold-failed', message: outcome.error, retryable:true } — the runner's validate-then-write guarantees NO CR record was written (S006 ac5), so no partial/pass record exists.
  - User impact: A record never lands on a failed fold; the controller re-runs rather than seeing a corrupt verdict.

### Edge cases

| Input | Expected |
| :--- | :--- |
| A Story whose changedFiles set is empty (the build changed no indexed files); grounding returns symbols:[] and the controller returns four empty DimensionResults. | runCodeReview folds verdict:'pass', counts:{0,0,0}; one sc4 record is written with four empty dimensions — a vacuous but valid PASS, identical to the daemon-driven vacuous case (ac3). |
| The controller's judgements include findings whose location file falls OUTSIDE the Story's changed set. | The four shipped judges already scope-drop out-of-changedFiles findings; on the controller path the injected judge returns the controller's DimensionResult as-is, so the handler applies the SAME scope-drop (reusing the shared filter) before/at fold so the persisted record only carries in-scope findings, matching the daemon path. |
| A phase='start' turn is submitted with a valid subject + grounding, and the controller then never sends the judgements turn. | The saved state simply expires under the state-store TTL (60 min) and is swept; no record is written and no resources leak — identical to an abandoned insrc_review_step run. |
| The controller resends the SAME judgements turn twice (same token) after a done. | The second call fails loadState (the token was consumed/expired on completion) => a next:'error' state-not-found; the CR record from the first completion is the single source (no double-write drift). |
| A well-formed judgements turn where every dimension has findings:[] except one HIGH. | verdict:'block' (any HIGH), counts reflect the single HIGH; the record is written — the verdict fold is the SAME as the daemon path (ac3). |

### Invariants to preserve

- The controller-driven path produces a record BYTE-IDENTICAL in kind + verdict vocabulary to the daemon-driven path because it drives the SAME sc5 runCodeReview (serial fold + validate-then-write), never a second fold implementation — differing only in who supplies each dimension's judgement. [[c4]]
- The MCP tool reaches the graph ONLY over the daemon socket (fetchCodeReviewGrounding wrapping the codeReview.grounding IPC) and never opens LMDB/Lance directly; grounding is structured symbol summaries, never raw file dumps (k5/k6). [[c5]]
- A malformed / incomplete / wrong-dimension turn returns a next:'error' frame naming the fault and writes NO record — the review never silently accepts bad judgement and produces a verdict (ac5); the multi-turn envelope (start/emit/done/error/opaque-state) matches insrc_review_step verbatim. [[c1]]
- The opaque state token is the ONLY thing round-tripped through the outer LLM between turns; the subject + grounding live server-side under the token (the review-step state-store contract), so the controller resumes exactly where it left off (ac2). [[c2]]
- The no-approved-contract→no-verdict rule holds on this path: a declined subject ({ok:false, reason}) yields an error frame, never a fabricated verdict, and the review stays read-only over the Story's source (only the CR record is written). [[c3]]

## Test strategy

**Test framework:** `node:test + node:assert/strict via `npx tsx --test` (matching src/mcp/review-step/__tests__ and src/workflow/code-review/__tests__)`

### Test levels

- **unit** — Prove the insrc_code_review_step envelope (start -> emit_judgements -> judgements -> done|error) + opaque-state resume + malformed-turn rejection by calling handleCodeReviewStep across turns with INJECTED stubs (resolveCodeReviewSubject, fetchCodeReviewGrounding, and the runner's write) — no live daemon/graph/model.
  - Subjects: `handleCodeReviewStep(phase='start') returns next:'emit_judgements' with the four build<Dim>Prompt payloads + a DimensionResult[] schema + the grounding + an opaque state token (ac1)`, `handleCodeReviewStep(phase='judgements') carries the token back unchanged, loads the saved subject+grounding, and resumes to next:'done' (ac2)`, `the judgements turn drives runCodeReview (injected deps: judges return the supplied DimensionResults, assembleGrounding replays the fetched grounding, write=spy) and returns { verdict, counts, path, jsonPath } from the CodeReviewOutcome (ac3)`, `the persisted record equals a daemon-driven record for the same DimensionResults (same kind:'code-review', same block/warn/pass fold + counts) (ac3)`, `fetchCodeReviewGrounding is the ONLY graph access — the handler opens no LMDB/Lance; a stubbed IPC seam feeds the grounding (ac4)`, `malformed-turn rejection => next:'error': non-object input / unknown phase / missing state / unknown token / missing/empty judgements / wrong-dimension set (missing, duplicate, unknown) / a malformed finding — each names the fault and writes NOTHING (ac5)`, `a declined subject ({ok:false, reason}) at start => next:'error' (no emit_judgements, no verdict); a grounding-unavailable => next:'error'`
  - Fixtures: `Injected stubs: resolveCodeReviewSubject -> a canned {ok:true, subject} (and an {ok:false,reason} variant); fetchCodeReviewGrounding -> a canned CodeReviewGrounding (and a reject/{ok:false} variant); the runner's write -> a spy capturing (path, content)`, `A dummy read-only LLMProvider (capabilities.structuredOutput:true, never called) passed to runCodeReview`, `A scripted DimensionResult[] (well-formed four-dimension set + malformed variants) + node:test + node:assert/strict; the src/mcp/review-step/__tests__ + src/workflow/code-review/__tests__ layout`
- **unit** — Prove the controller-path record is byte-identical to the daemon-driven runCodeReview output for the same DimensionResults (ac3 parity), reusing the S006 runner directly.
  - Subjects: `driving runCodeReview once with injected controller judges and once with equivalent daemon-style judges yields the same body.dimensions + verdict + counts (the shared orchestrator, k2)`
  - Fixtures: `The S006 runner + injected fake deps (as in runner.test.ts)`
- **live** — Optional end-to-end: drive insrc_code_review_step over a real socket against a registered+indexed fixture repo with an approved LLD/PLAN + a build, asserting a real CR record is written — gated behind INSRC_LIVE_TESTS.
  - Subjects: `handleCodeReviewStep(start) against a live daemon returns real grounding over the codeReview.grounding IPC; a judgements turn writes a real CR-<epic>-<story> record`
  - Fixtures: `A registered+indexed fixture repo with an approved LLD/PLAN + a build for the subject Story; a running daemon`, `INSRC_LIVE_TESTS=1 gate (skips cleanly when unset)`

### Acceptance mapping

| Criterion | Proving tests |
| :--- | :--- |
| `ac1` | `unit: 'start returns emit_judgements one turn at a time' — handleCodeReviewStep({phase:'start', epicHash, storyId}) returns next:'emit_judgements' with prompts + schema + grounding + state, matching the review-step turn-taking envelope` |
| `ac2` | `unit: 'the opaque token resumes the run' — feed the state token from start unchanged into a judgements turn; assert the saved subject+grounding are used and the run resumes to done (state never round-tripped through the outer LLM)` |
| `ac3` | `unit: 'the judgements turn persists a CR record via runCodeReview' — assert the write spy's json basename is codeReviewArtifactId(...) (CR- prefix) + body.kind==='code-review' + a folded verdict∈{pass,warn,block}`, `unit: 'parity with the daemon-driven path' — the same DimensionResults folded via runCodeReview yield the same body.dimensions+verdict+counts whether driven by the controller path or daemon-style judges` |
| `ac4` | `unit: 'grounding comes only over IPC' — a stubbed fetchCodeReviewGrounding is the sole grounding source; assert the handler performs no direct store access and surfaces the IPC-served CodeReviewGrounding in the emit_judgements frame` |
| `ac5` | `unit: 'malformed judgements => error, no write' — missing/empty judgements, a wrong-dimension set (missing/duplicate/unknown), or a malformed finding each return next:'error' naming the fault with the write spy NEVER called`, `unit: 'unknown phase / missing state / unknown token => error' — each returns a next:'error' frame; a declined subject at start returns next:'error' (no verdict)` |

## Migration

**State before:** S001-S007 shipped the whole code-review stage EXCEPT an external driver: S001 the sc1 subject resolver (src/workflow/code-review/subject.ts:87, file+git only) + the sc2 codeReview.grounding daemon IPC (daemon/index.ts:594); S002-S005 the four build<Dim>Prompt + <DIM>_FINDINGS_SCHEMA + judge<Dim> dimension modules; S006 the sc4 record + sc5 runCodeReview orchestrator (runner.ts) with its injectable CodeReviewRunnerDeps; S007 the completion gate. Reviews today are driven ONLY two ways: the DAEMON self-drives runCodeReview via codeReview.run (S006), OR the design-artifact review runs controller-driven via insrc_review_step (src/mcp/review-step/: handler.ts, types.ts, state-store.ts, registered in server.ts). There is NO controller-driven path for the CODE review. The MCP process already reaches the daemon via the unaryRpc socket client (src/mcp/daemon-stream.ts) for workflow.run.start/poll.

**State after:** A new src/mcp/code-review-step/ module (types.ts + state-store.ts + handler.ts) mirrors src/mcp/review-step/ verbatim, exposing handleCodeReviewStep with a start -> emit_judgements -> judgements -> done|error envelope + an opaque-token state-store; it is registered as a NEW insrc_code_review_step tool in server.ts (peer of insrc_review_step). phase='start' resolves the sc1 subject in-process (declining cleanly) + fetches the sc2 grounding via a NEW fetchCodeReviewGrounding helper wrapping the existing unaryRpc('codeReview.grounding'). phase='judgements' folds the controller-supplied DimensionResults through the SAME sc5 runCodeReview with injected deps, persisting the identical sc4 record. The four dimension modules, the S001 sc1/sc2 surfaces, runCodeReview, insrc_review_step, and every existing tool are untouched.

**Zero downtime:** yes — **Data rewrite:** no

### Steps

1. Add the s8 envelope types (src/mcp/code-review-step/types.ts): the CodeReviewStepPhase union + inputs/outputs + CodeReviewStepStatePayload, mirroring src/mcp/review-step/types.ts. Type-only; no runtime behaviour. — ↩ rollbackable
2. Add the opaque-token state-store (src/mcp/code-review-step/state-store.ts) mirroring review-step/state-store.ts: saveState/loadState/StateTokenNotFound with the LRU+TTL sweep. Isolated new module. — ↩ rollbackable
3. Add the fetchCodeReviewGrounding helper (in src/mcp/daemon-stream.ts or a small peer) wrapping unaryRpc('codeReview.grounding', {repo,epicHash,storyId}) with an injectable UnaryRpcDeps seam. Additive export; no existing helper edited. — ↩ rollbackable
4. Add the handler (src/mcp/code-review-step/handler.ts): handleCodeReviewStep dispatching start/judgements inside one try/catch; start resolves subject (decline => error frame) + fetches grounding (unavailable => error frame) + saves state + returns emit_judgements; judgements validates the four-dimension DimensionResult[] (malformed => error frame, no write) then drives runCodeReview with injected deps (controller judges + replayed grounding + writeAtomic) and returns done. New module; inert until registered. — ↩ rollbackable
5. Register the tool in src/mcp/server.ts: an additive server.registerTool('insrc_code_review_step', {inputSchema: phase/epicHash/storyId/repo/judgements/state}, handleCodeReviewStep), a peer of insrc_review_step. The one edit to an existing file — a new registration entry, no existing tool changed. — ↩ rollbackable
6. Add handler unit tests (src/mcp/code-review-step/__tests__/) with injected stubs (resolveCodeReviewSubject, fetchCodeReviewGrounding, the runner write-spy) + a dummy provider: the emit_judgements + opaque-resume + done + malformed-turn-error paths. Test-only. — ↩ rollbackable

**Backward compat:** Strictly additive to the MCP surface: a NEW insrc_code_review_step tool + a NEW src/mcp/code-review-step/ module + a NEW fetchCodeReviewGrounding export. No existing public API changes behaviour — insrc_review_step, the four dimension modules, resolveCodeReviewSubject, runCodeReview + CodeReviewRunnerDeps, and the codeReview.grounding IPC are all consumed UNCHANGED. The single edit to an existing file (server.ts) is an additive registerTool entry; the one guard is that the new tool name 'insrc_code_review_step' must not collide with an existing registered tool (it is distinct from insrc_review_step / insrc_workflow_step / insrc_build_step). An external client that never calls the new tool is unaffected. Reverting is clean: delete the new module + the fetch helper + the one registration entry.

## Alternatives considered

### a1: Single judgements turn, folded through the shared runCodeReview — **CHOSEN**

start -> emit_judgements (all four build<Dim>Prompt payloads + the grounding + one DimensionResult[] schema) -> judgements { DimensionResult[] } -> the server folds via runCodeReview with INJECTED deps -> done.



### a2: Per-dimension emit turns (four judgement turns)

start -> emit_judgement(adherence) -> judgement -> ... -> emit_judgement(quality) -> judgement -> done, one turn per dimension.



**Rejected because:** Functionally reaches the same record (ac3) but at 4x the round-trips + a stateful accumulator (which dimensions are done) that weakens ac2/ac5 resume+validation simplicity, and diverges from insrc_review_step's two-emit shape — more cost for no accuracy gain (the controller's four judgements are independent given the same grounding).

### a3: Fold in the handler (bypass runCodeReview)

The handler re-implements the verdict fold + record build + writeAtomic directly from the controller's DimensionResults, not calling runCodeReview.



**Rejected because:** Duplicates sc5's verdict fold + validate-then-write + no-write-on-failure in a second place that can DRIFT from the daemon-driven path — violates ac3's 'same kind of record + same verdict vocabulary' guarantee and the HLD's explicit 'share ONE orchestrator', the exact drift the shared-orchestrator rule exists to prevent.

## Citations

- **[[c1]]** `analyze-bundle` `s1 symbol.locate — the insrc_review_step envelope the new tool mirrors: src/mcp/review-step/handler.ts handleReviewStep (:32, phase-switch + McpEnvelope + errorResult) + types.ts (phase union, typed inputs/outputs start/emit/done/error)`
- **[[c2]]** `analyze-bundle` `s1 symbol.locate — the opaque-token state-store: src/mcp/review-step/state-store.ts saveState/loadState/StateTokenNotFound (22-char token, LRU MAX_ENTRIES=100 + 60-min TTL; state never round-tripped through the outer LLM)`
- **[[c3]]** `analyze-bundle` `s1 symbol.locate — sc1 in-process subject resolution: src/workflow/code-review/subject.ts:87 resolveCodeReviewSubject (file+git only, no LMDB) declining {ok:false, reason} (no-approved-contract→no-verdict)`
- **[[c4]]** `analyze-bundle` `s1 symbol.locate — the sc5 orchestrator: src/workflow/code-review/runner.ts runCodeReview + CodeReviewRunnerDeps { judges, assembleGrounding, write } (S006); the controller path drives it with injected deps so the record is byte-identical (ac3)`
- **[[c5]]** `analyze-bundle` `s1 symbol.locate — sc2 grounding over IPC: the 'codeReview.grounding' daemon handler (daemon/index.ts:594) + the private unaryRpc socket client (src/mcp/daemon-stream.ts) the new fetchCodeReviewGrounding wraps, so the graph is reached ONLY over the socket (k5/k6)`
- **[[c6]]** `analyze-bundle` `s1 symbol.locate — the per-dimension prompts + finding schema + DimensionResult: the four build<Dim>Prompt + <DIM>_FINDINGS_SCHEMA dimension modules + DimensionResult/DimensionFinding/ReviewDimension in src/workflow/code-review/types.ts`
- **[[c7]]** `analyze-bundle` `s1 test.locate — the handler test harness: src/mcp/review-step/__tests__ (phase-driven handler tests) + src/workflow/code-review/__tests__ (injected fake deps), node:test + node:assert/strict via npx tsx --test`
- **[[c8]]** `prior-artifact` `DEF/HLD 761a43a6fa645815 — k2: the controller-drivable path follows the start/emit/done/error/opaque-state envelope of the existing review-step tool; k1: the record carries the block/warn/pass ReviewVerdict vocabulary; the assumptions behind the s8 envelope + ac3 parity`

<!-- insrc:review -->

## Review

### ✅ Review `PASS` — design.story (design.story)

**0 HIGH · 0 MED · 0 LOW** · model `client` · reviewed 2026-08-04T08:35:57.857Z

_No load-bearing premises were extracted._
