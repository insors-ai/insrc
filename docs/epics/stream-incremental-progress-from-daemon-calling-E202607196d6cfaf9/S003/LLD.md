<!-- insrc:artifact LLD-6d6cfaf9a9b14bd4-s3 -->

# LLD: E202607206d6cfaf9:S003

**Epic:** `stream-incremental-progress-from-daemon-calling`
**HLD base run:** `wf-1784476347429-dbnaq6`
**HLD effective hash:** `2699deb16227...`
**Tracker:** [insors-ai/insrc#44](https://github.com/insors-ai/insrc/issues/44)

## HLD context

**Framework:** Extend the daemon's existing per-operation progress emitters (WorkflowProgress in workflow-rpc.ts, eventToProgressData in analyze-rpc.ts) so both converge on one uniform ProgressEvent payload that rides the already-shipped IpcStreamMessage / IpcStreamKind 'progress' + 'delta' frame — no new wire format (k2, k5). The MCP tool surface gains a single progressToken-gated branch that maps inbound ProgressEvent frames to MCP notifications/progress notifications (k3). The IDE side is served purely by defining the daemon-emitted contract plus a thin reader-API shape the fork consumes (k4); the fork's actual render path is out of scope for this repo. This is the a1 alternative: extend-in-place over the two nearest existing emitters, one shared mapping, one forwarding branch, one thin reader, all on the single existing stream seam — no parallel progress subsystem.
**Rollout phase:** Phase B — caller-facing progress consumers
**Owns:** `sc3` (DaemonProgressReaderApi)
**Consumes:** `sc1` (ProgressEvent)

## Contract details

**Surface level:** public

### `DaemonProgressReader.onStage`

```typescript
onStage(handler: (event: StageProgressEvent) => void): void
```

**Parameters:**
- `handler: (event: StageProgressEvent) => void` — Invoked once per decoded sc1 stage-transition event for the operation this reader is bound to; receives stageId/stageLabel/index/total verbatim from the daemon frame.

**Returns:** `void` — Registration only. The HLD interfaceSketch returns void, so no unsubscribe handle is produced here (see hld.amendmentProposal for the release primitive that closes this gap).

**Errors:**
- `none-thrown` when Registering after the terminal signal is not an error: the reader has already detached and dropped its frames, so the handler is simply never invoked. Progress is best-effort and transient per the HLD durability clause, so a late attach must degrade silently rather than throw.

**Preconditions:**
- The reader is bound to exactly one in-flight ProgressOperation ('workflow.run' | 'analyze.run'). Correlation is solved inside the s3 boundary by operation + reader lifetime, never by IpcStreamMessage.id — the server overrides that id on write (asserted at src/daemon/__tests__/handoff-stream.test.ts:224).
- The attachment point is the RPC client entity `rpc` at src/cli/client.ts. Its method surface was NOT profiled by the s1 bundle (resolved 0.159, never profiled) — the exact attach call is an open integration seam carried forward from backFlowNotes item 1, deliberately not invented here.

**Postconditions:**
- stageId is treated as OPAQUE. It derives from WorkflowProgress.phase, declared as a bare `string` at src/daemon/workflow-rpc.ts:61, and s1 specifies an unknown-phase fallback (raw phase becomes both stageId and stageLabel, warn-logged, never dropped). The handler must therefore tolerate ids outside the eight observed phases (decompose/plan-ready/grounding/step-start/step-done/synthesize-attempt/synthesize-retry/done at :110-184) and must not switch exhaustively.
- Handlers receive only typed sc1 events; no raw IpcStreamMessage ever reaches the consumer (ac3).
- Frames are filtered by operation before dispatch: 'progress'-kind frames are also produced by non-uniform emitters at src/daemon/todos-rpc.ts:1146 and src/daemon/tools/types.ts:56, so not every progress frame on the socket decodes as a sc1 ProgressEvent.

### `DaemonProgressReader.onToken`

```typescript
onToken(handler: (event: TokenProgressEvent) => void): void
```

**Parameters:**
- `handler: (event: TokenProgressEvent) => void` — Invoked once per decoded sc1 token event; receives tokensDelta/tokensTotal plus the nullable owning stageId.

**Returns:** `void` — Registration only; mirrors onStage.

**Errors:**
- `none-thrown` when Same as onStage — post-terminal registration is silently inert, not an error.

**Preconditions:**
- Token frames arrive at the operation's natural token-batch cadence, not per token (HLD nonFunctional.performance), so the handler must be tolerant of irregular inter-event gaps and must not infer a heartbeat from them.

**Postconditions:**
- The reader does NOT re-validate monotonicity. s1 already suppresses regressing/NaN frames upstream via `Number.isFinite(delta) && delta >= 0 && total >= lastEmittedTotal`, so tokensTotal is trusted and recorded directly.
- tokensDelta is never accumulated by the consumer to derive a running total — tokensTotal is authoritative and is what DaemonProgressSnapshot.tokensTotal tracks.

### `DaemonProgressReader.onComplete`

```typescript
onComplete(handler: () => void): void
```

**Parameters:**
- `handler: () => void` — Invoked exactly once when the operation's final result arrives, signalling that no further progress will be reported (ac2).

**Returns:** `void` — Registration only.

**Errors:**
- `not-invoked-on-failure` when An operation that terminates via the error path does NOT fire onComplete. The daemon emits errors on a distinct stream — `send({ id: 0, stream: 'error', data: { error: …, recoverable: false } })` at src/daemon/workflow-rpc.ts:218 — and conflating that with clean completion would report success for a failed run. Error surfacing stays distinct from completion.

**Preconditions:**
- The terminal daemon signal for the workflow path is `opts.onProgress?.({ phase: 'done' })` at src/daemon/workflow-rpc.ts:184, mapped by s1 into the sc1 stream.

**Postconditions:**
- Fires at most once, then the reader detaches and drops all subsequent frames for the operation. 'Stops reporting further progress' is therefore a STRUCTURAL property of the reader, not caller discipline — this is the decisive property of the winning alternative a1 for ac2.
- After completion, DaemonProgressSnapshot.done is true and remains true; the snapshot stays readable so a late or re-rendering consumer can still observe the final state.

### `DaemonProgressSnapshot`

```typescript
interface DaemonProgressSnapshot { operation: ProgressOperation; currentStage: StageProgressEvent | null; tokensTotal: number; done: boolean; }
```

**Parameters:**
- `operation: ProgressOperation` — Which sc1 operation ('workflow.run' | 'analyze.run') this reader is bound to; the correlation key, standing in for the unusable frame id.
- `currentStage: StageProgressEvent | null` — The most recent sc1 stage event, or null before the first stage transition arrives. Directly renderable by the fork — carries stageLabel/index/total (ac1).
- `tokensTotal: number` — Cumulative tokens for the operation, tracked as the last-seen sc1 tokensTotal.
- `done: boolean` — Whether the terminal signal has been observed. Makes completion observable to a consumer that attached after onComplete already fired.

**Returns:** `DaemonProgressSnapshot` — Current-state read of the reader, published verbatim from the sc3 interfaceSketch. Reading it is side-effect free and never mutates reader state.

**Preconditions:**
- This type is published verbatim in the sc3 interfaceSketch that the IDE fork mirrors. It must not be renamed or have fields narrowed on this side — lock-step type mirroring across insrc / insrc-ide is the load-bearing invariant (per LLD-s1 constraint text; the fork's own code was never observed, see backFlowNotes).

**Postconditions:**
- Provides the state-read half of the contract that the three registration methods (event half) cannot express: a consumer re-rendering mid-operation reads current state instead of replaying events.
- The accessor exposing this on the reader is the one method the sketch leaves implicit — the formal addition is deliberately deferred until src/cli/client.ts is profiled (backFlowNotes item 1).

### `ProgressEvent`

```typescript
type ProgressEvent = StageProgressEvent | TokenProgressEvent
```

**Parameters:**
- `kind: 'stage' | 'token'` — Discriminant s3 switches on when decoding a filtered frame into a typed event before dispatch.

**Returns:** `ProgressEvent` — The sc1 payload carried in the body of an existing IpcStreamMessage (src/shared/types.ts:734-738) whose stream kind is 'progress' or 'delta' — both already members of IpcStreamKind at src/shared/types.ts:732.

**Errors:**
- `decode-miss` when A 'progress'-kind frame whose body does not match the sc1 union (e.g. one produced by src/daemon/todos-rpc.ts:1146 or src/daemon/tools/types.ts:56, which keep emitting raw-shaped frames) is dropped by the reader without dispatch. NOTE: the s1 producer inventory came from a search.text pass with truncated: true, so it is non-exhaustive — the reader must handle unrecognised bodies defensively rather than assuming a closed producer set.

**Preconditions:**
- s3 consumes sc1 with no field added, narrowed, or reinterpreted. s3 introduces NO new wire literal and NO new IpcStreamKind member — that is an explicit DEF non-goal (k2).
- WorkflowProgress (src/daemon/workflow-rpc.ts:61) is s1-internal driver vocabulary and MUST NOT be exposed through the sc3 reader surface.

**Postconditions:**
- Decoding raw IpcStreamMessage frames back into ProgressEvent objects stays private to s3 per the HLD boundary.internal clause; the consumer only ever sees the typed union.

## Data model changes

### `DaemonProgressSnapshot` — new

Net-new consumer-facing projection published by the sc3 interfaceSketch: { operation: ProgressOperation; currentStage: StageProgressEvent | null; tokensTotal: number; done: boolean }. Not persisted anywhere — HLD nonFunctional.durability defines progress as transient and best-effort, so this is in-memory reader state only, with no storage, no LMDB/Lance write, and no delivery guarantee.

```
+ interface DaemonProgressSnapshot {
+   operation: ProgressOperation;
+   currentStage: StageProgressEvent | null;
+   tokensTotal: number;
+   done: boolean;
+ }
```

**Call sites:**
- `No existing call site: the s1 usage.example bundle found NO client-side consumption of progress frames anywhere — the only client-side onProgress occurrences are an unrelated Ollama model-pull tick at src/cli/services/index.ts:69 and src/cli/services/setup.ts:83-101. The reader and this snapshot are net-new.`
- `Prospective attachment point: the RPC client entity `rpc` at src/cli/client.ts (f27cea44e1963ae4dbcccf2c5c185bfa) — resolved by the bundle but never profiled, so its actual surface is an explicit gap (backFlowNotes item 1).`

### `DaemonProgressReader (per-operation reader state)` — new

Private s3 state backing the reader: the bound ProgressOperation used as the correlation key, the registered stage/token/complete handlers, last-seen currentStage, last-seen tokensTotal, and a detached flag set by the terminal signal. Explicitly NOT correlated by IpcStreamMessage.id — the server overrides `id: 0` on write (src/daemon/workflow-rpc.ts:238 constructs it, src/daemon/__tests__/handoff-stream.test.ts:224 asserts the override; the sibling site src/daemon/analyze-rpc.ts:521 passes the same literal). Per HLD boundary.internal, this bookkeeping stays private to s3 on this repo's side.

**Call sites:**
- `src/daemon/workflow-rpc.ts:238 — `onProgress: (f) => send({ id: 0, stream: 'progress', data: f })`, the untouched transport binding this state sits opposite.`
- `src/daemon/index.ts:1423 — `'workflow.run': async (params, send, signal) => {`, the IPC registration producing the frames.`
- `src/daemon/analyze-rpc.ts:521 — sibling construction site for the 'analyze.run' operation.`

### `WorkflowProgress` — invariant-change

NO structural change by s3 — recorded here only to pin the invariant s3 inherits. Declared at src/daemon/workflow-rpc.ts:61 with `phase` as a bare `string` (not a closed union), plus optional stepId/runner/attempt/detail. Its eight observed phase values (decompose :110, plan-ready :112, grounding :123, step-start :131, step-done :134, synthesize-attempt :151, synthesize-retry :166, done :184) are declared unchanged by s1. The invariant s3 must honour: because phase is open, sc1 stageId is an open string and the reader must NOT switch exhaustively over the eight — unknown stageIds are rendered via their raw stageLabel, never dropped or thrown.

**Call sites:**
- `src/daemon/workflow-rpc.ts:61 — declaration site.`
- `src/daemon/workflow-rpc.ts:110-184 — all eight phase emission sites, confined to this file.`
- `src/daemon/workflow-rpc.ts:75 — `readonly onProgress?: ((f: WorkflowProgress) => void) | undefined;` on RunWorkflowOpts.`

### `IpcStreamMessage / IpcStreamKind` — invariant-change

Consumed strictly as-is; s3 adds nothing. IpcStreamKind at src/shared/types.ts:732 already contains both 'delta' and 'progress'; IpcStreamMessage at src/shared/types.ts:734-738 is `{ id: number; stream: IpcStreamKind; data: unknown }`. sc1's ProgressOperation / StageProgressEvent / TokenProgressEvent / ProgressEvent are added adjacent to :734 by s1 and consumed by s3 unchanged. Invariant: no new frame format and no new IpcStreamKind member (k2 non-goal) — load-bearing because the IDE fork mirrors these types and any structural change breaks lock-step across the two repos.

**Call sites:**
- `src/shared/types.ts:732 — IpcStreamKind union.`
- `src/shared/types.ts:734-738 — IpcStreamMessage shape; sc1 types land adjacent.`
- `src/daemon/workflow-rpc.ts:218 — `send({ id: 0, stream: 'error', data: { error: …, recoverable: false } })`, the error frame the reader must keep distinct from completion.`

## Interaction with shared contracts

| Contract | Role | How |
| :--- | :--- | :--- |
| `sc3` | implements | The HLD names s3 as ownedByStory for sc3 (DaemonProgressReaderApi), and its interfaceSketch was already published to a fork this repo cannot see. This contract therefore implements the sketch method-for-method — onStage / onToken / onComplete plus the DaemonProgressSnapshot type verbatim — which is precisely why alternative a1 won: renegotiating an already-published owned contract requires evidence the sketch is wrong, and the s1 bundle supplies none (src/cli/client.ts was never profiled, so every ergonomic argument for the losing alternatives is unverified). Type-level surface only: per the HLD purpose clause, the fork supplies the implementation and the render path, which is out of scope for this repo. The one gap the judgment flagged — no release primitive for an abandoned reader — is raised as an additive amendment rather than silently absorbed. |
| `sc1` | consumes | Consumes ProgressEvent (owned by s1) exactly as published: no field added, narrowed, or reinterpreted — this is what makes ac3 hold without qualification. Concretely: (a) the reader filters frames by the sc1 `operation` field, since IpcStreamMessage.id is server-overridden and unusable as a correlator (src/daemon/__tests__/handoff-stream.test.ts:224); (b) it discriminates on the `kind` field to route to onStage vs onToken; (c) it treats stageId as opaque because it derives from WorkflowProgress.phase, an open `string` (src/daemon/workflow-rpc.ts:61) with an s1-specified unknown-phase fallback; (d) it trusts tokensTotal without re-validation, since s1's monotonic guard already suppresses regressing/NaN frames upstream — duplicating that logic here would be a second source of truth. Decoding, per-operation buffering, and terminal detection stay private to s3 per HLD boundary.internal. |

## Error paths

### Error cases

- **The daemon terminates the operation via the error path instead of completing: workflow-rpc.ts:218 emits `send({ id: 0, stream: 'error', data: { error: …, recoverable: false } })` and no `{ phase: 'done' }` frame ever follows.** (terminal)
  - Detection: The reader's frame dispatcher branches on `IpcStreamMessage.stream` before decoding the body. A frame whose stream is 'error' takes the failure branch — it is never routed into the ProgressEvent decoder and never satisfies the terminal-signal predicate that sets `done = true`. The reader recognises the failure by the stream discriminant, not by the absence of later frames.
  - Response: The reader detaches (stops decoding for the operation, drops handlers) exactly as it would on completion, but does NOT invoke the onComplete handlers — completion and failure stay distinct per the s4 `not-invoked-on-failure` clause. `DaemonProgressSnapshot.done` is set true to mark the operation terminal and stop further dispatch, while the failure itself is surfaced on the separate error channel. Because the sc3 sketch has no member for this, an `onError` addition is proposed (see hld.amendmentProposal); absent it, the reader must still detach silently rather than fabricate an onComplete.
  - User impact: Without this branch the workbench would render a failed 30-40 minute run as successfully finished — reporting success for a run that errored is the single worst outcome in this slice. With it, progress simply stops and the failure is reported through the operation's own error path.
- **A 'progress'-kind frame arrives whose `data` body does not decode as a sc1 ProgressEvent — e.g. the raw-shaped frames still emitted by src/daemon/todos-rpc.ts:1146 and src/daemon/tools/types.ts:56, which are not being migrated to the sc1 shape.** (recoverable)
  - Detection: After filtering by the sc1 `operation` field, the reader validates the body against the ProgressEvent union by checking the `kind` discriminant is 'stage' or 'token' and that the required fields for that variant are present. A body that fails this check is a decode miss. The check is structural on the received body — the reader does not rely on a closed list of producers, because the s1 producer inventory came from a search.text pass that returned `truncated: true` and is explicitly non-exhaustive.
  - Response: The frame is dropped without dispatch. No handler is invoked, snapshot state is not mutated, and the reader stays attached and continues processing subsequent frames. A single warn-level log line is emitted (via getLogger, never console) so an unexpected producer is diagnosable, but the miss is never escalated to a throw.
  - User impact: None visible: unrelated daemon chatter on the shared socket cannot corrupt the rendered stage or token totals, and cannot tear down an in-flight reader. A silently-wrong render (foreign payload interpreted as a stage) is prevented.
- **A consumer-supplied handler throws — the workbench's onStage/onToken/onComplete callback raises (render exception, disposed view, null deref) while the reader is dispatching a frame.** (recoverable)
  - Detection: Each handler invocation is wrapped in try/catch at the dispatch site; the thrown value is caught at the boundary between reader-owned code and consumer-owned code. The reader notices because the exception propagates out of the synchronous handler call it made, not because the consumer reports anything.
  - Response: The throw is caught, warn-logged with the operation and event kind, and swallowed. Remaining handlers registered for the same event still run (one bad handler does not starve its siblings), the reader stays attached, and snapshot state — which is updated BEFORE handlers are invoked — is already consistent and is not rolled back.
  - User impact: A buggy or racing consumer callback degrades to a missed render tick rather than killing live progress for the rest of a 30-40 minute operation, and cannot propagate an exception back into the daemon RPC client's frame loop.
- **The operation ends without any terminal signal: the socket to the daemon drops, or the RPC client's stream for the operation closes, mid-run — no `{ phase: 'done' }` frame and no 'error' frame is ever delivered.** (terminal)
  - Detection: The reader subscribes to the transport/stream close signal exposed by the RPC client entity at src/cli/client.ts and treats close-while-not-done as an abnormal termination. It is detected by the transport lifecycle event, not by a timeout on frame silence — token frames arrive at the operation's natural batch cadence (HLD nonFunctional.performance) with irregular gaps, so silence is NOT evidence of failure and must never be used as the trigger.
  - Response: The reader detaches and stops decoding. onComplete is NOT fired (the operation did not complete). `done` is set true so the snapshot reports the operation as terminal and no handler can be added that would wait forever. NOTE: the exact close/teardown signal available depends on the src/cli/client.ts surface, which the s1 bundle never profiled (backFlowNotes item 1) — this response is contingent on that profiling and must be re-confirmed before implementation.
  - User impact: The workbench stops at the last observed stage instead of spinning indefinitely on a dead operation, and is not told the run succeeded.
- **A stage or token frame for the operation arrives AFTER the terminal signal has already been processed — a late or duplicated frame in flight when `{ phase: 'done' }` was handled, or a second 'done' frame.** (recoverable)
  - Detection: The reader checks its private `detached` flag (set by the terminal-signal handler) at the top of dispatch, before decoding or routing. Any frame seen while detached is recognised as post-terminal.
  - Response: The frame is discarded: no handler runs, `currentStage` and `tokensTotal` are not mutated, and a duplicate terminal frame does not re-fire onComplete — onComplete fires at most once, structurally, per the s4 postcondition. Nothing is thrown.
  - User impact: 'Stops reporting further progress' (ac2) holds as a property of the reader rather than as caller discipline: the workbench cannot see the stage regress or the completion callback double-fire after it has already torn down its progress UI.

### Edge cases

| Input | Expected |
| :--- | :--- |
| A stage frame whose stageId is outside the eight observed phases (decompose / plan-ready / grounding / step-start / step-done / synthesize-attempt / synthesize-retry / done), produced by s1's unknown-phase fallback because WorkflowProgress.phase is a bare `string` at src/daemon/workflow-rpc.ts:61. | Dispatched normally as a valid stage event. The reader treats stageId as opaque, does not switch exhaustively over the eight, and renders via the raw stageLabel (which the fallback sets equal to the raw phase). The event is never dropped and never throws — an unknown phase is valid-but-unusual input, not an error. |
| Snapshot is read before any frame for the operation has arrived (consumer attaches and renders immediately). | `{ operation, currentStage: null, tokensTotal: 0, done: false }` — currentStage is explicitly nullable for exactly this window. The read is side-effect free and does not mutate reader state. |
| A token frame arrives before the first stage frame, so its owning stageId is null. | Dispatched to onToken with the nullable stageId as-is; tokensTotal is recorded. The reader does not defer, buffer, or synthesise a stage to attach it to. |
| onStage/onToken/onComplete is called after the operation has already completed (late attach — the consumer subscribes to a reader whose terminal signal already fired). | Registration succeeds and returns void; the handler is simply never invoked, because the reader has detached and dropped its frames. No throw — progress is best-effort and transient per the HLD durability clause. The consumer observes the final state via `DaemonProgressSnapshot.done === true`, which is why `done` exists on the snapshot. |
| Multiple handlers registered for the same event, or a handler registered mid-operation after several frames have already been dispatched. | All registered handlers are invoked for subsequent events, in registration order. Past events are NOT replayed to a late handler — the snapshot is the state-read half of the contract for exactly that case (a consumer re-rendering mid-operation reads current state instead of replaying the event stream). |
| The synthesize-attempt / synthesize-retry pair (src/daemon/workflow-rpc.ts:151, :166) re-enters the same logical stage, so successive stage events carry a non-advancing or repeating index. | Each is dispatched as its own stage event and becomes currentStage. The reader asserts no monotonicity on stage index and does not deduplicate repeated stageIds — retry visibility is the point of those frames. |
| Two readers are live concurrently on the same RPC client — one bound to 'workflow.run', one to 'analyze.run' (sibling producer at src/daemon/analyze-rpc.ts:521). | Each dispatches only frames matching its own bound ProgressOperation. Correlation is by operation plus reader lifetime, never by IpcStreamMessage.id — the server overrides the literal `id: 0` on write, asserted at src/daemon/__tests__/handoff-stream.test.ts:224. |
| A token frame carrying tokensDelta === 0 (a batch that produced no new tokens). | Dispatched unchanged; tokensTotal is set from the frame's authoritative tokensTotal. The consumer never accumulates tokensDelta to derive a running total, and the reader never re-validates monotonicity — s1's `Number.isFinite(delta) && delta >= 0 && total >= lastEmittedTotal` guard already suppresses regressing/NaN frames upstream, and duplicating it here would create a second source of truth. |

### Invariants to preserve

- No new IpcStreamKind member and no new frame format. IpcStreamKind at src/shared/types.ts:732 already contains both 'delta' and 'progress', and IpcStreamMessage at :734-738 stays `{ id: number; stream: IpcStreamKind; data: unknown }`. s3 consumes both strictly as-is. Load-bearing because the IDE fork mirrors these types and any structural change breaks lock-step across the two repos (explicit DEF non-goal k2). [[c4]]
- IpcStreamMessage.id must never be used as an operation correlator. The producer constructs `send({ id: 0, stream: 'progress', data: f })` at src/daemon/workflow-rpc.ts:238 and the server overrides that id on write (asserted at src/daemon/__tests__/handoff-stream.test.ts:224); the sibling site src/daemon/analyze-rpc.ts:521 passes the same literal. Correlation is solved inside the s3 boundary by the sc1 `operation` field plus reader lifetime. [[c3]]
- stageId is an OPEN string and must be treated as opaque. It derives from WorkflowProgress.phase, declared as a bare `string` (not a closed union) at src/daemon/workflow-rpc.ts:61, and s1 specifies an unknown-phase fallback in which the raw phase becomes both stageId and stageLabel, warn-logged and never dropped. The reader must not switch exhaustively over the eight observed phases (:110-184). [[c2]]
- The reader must not re-validate token monotonicity. s1 already suppresses regressing and NaN frames upstream via `Number.isFinite(delta) && delta >= 0 && total >= lastEmittedTotal`, so DaemonProgressSnapshot.tokensTotal tracks the last-seen sc1 tokensTotal directly. Re-implementing the guard downstream would create a second source of truth. [[c2]]
- WorkflowProgress (src/daemon/workflow-rpc.ts:61) is s1-internal driver vocabulary and must NOT be exposed through the sc3 reader surface. The consumer sees only the typed sc1 ProgressEvent union; decoding raw IpcStreamMessage frames back into ProgressEvent stays private to s3 per the HLD boundary.internal clause (ac3). [[c1]]
- Not every 'progress'-kind frame on the socket decodes as a sc1 ProgressEvent. Uniformity is scoped to 'workflow.run' | 'analyze.run' only; src/daemon/todos-rpc.ts:1146 and src/daemon/tools/types.ts:56 keep emitting raw-shaped frames. The reader must filter by operation and validate structurally — and because this producer inventory came from a search.text pass that returned `truncated: true`, it must be treated as non-exhaustive and handled defensively rather than as a closed set. [[c4]]
- The daemon's error path (`send({ id: 0, stream: 'error', data: { error: …, recoverable: false } })` at src/daemon/workflow-rpc.ts:218) uses the same frame idiom as progress but a distinct stream kind. A failed operation must never be conflated with the terminal `opts.onProgress?.({ phase: 'done' })` at :184 — error surfacing stays distinct from completion. [[c3]]
- The ac2 completion test extends the established idiom rather than inventing one: collect frames, then `frames.filter(f => f.stream === 'progress')` and assert on the filtered set, per src/daemon/__tests__/analyze-rpc.live.test.ts:469-471, adding an assertion that no further progress is surfaced after the terminal frame. Naming follows src/daemon convention — *.test suffix, camelCase free functions, PascalCase types, no class introduced. The workflow-side progress test is net-new (convention.detect reports `testFiles: none` for workflow-rpc.ts). [[c5]]

## Test strategy

**Test framework:** `node:test (built-in Node test runner) executed via tsx — `npx tsx --test 'src/**/__tests__/*.test.ts'`, per the repo build-and-run convention; new tests land in src/daemon/__tests__/ with the *.test.ts suffix, camelCase free functions and PascalCase types, no class introduced (s1 test.locate / convention.detect). Live-service or daemon-driven suites gate behind the INSRC_LIVE_TESTS=1 env convention and skip cleanly when unset.`

### Test levels

- **unit** — Prove the DaemonProgressReader's frame-decoding, dispatch, filtering, and terminal-detection logic in isolation by feeding synthetic IpcStreamMessage frames straight into the reader — no daemon, no socket. This is where the bulk of ac1/ac2/ac3 is proven, because the reader is net-new (s1 test.locate found NO workflow-progress test and convention.detect reports `testFiles: none` for src/daemon/workflow-rpc.ts) and its behaviour is fully determined by the frames it is handed.
  - Subjects: `DaemonProgressReader.onStage — dispatches a decoded StageProgressEvent with stageId/stageLabel/index/total verbatim (ac1, ac3)`, `DaemonProgressReader.onToken — dispatches TokenProgressEvent with tokensDelta/tokensTotal plus nullable owning stageId; asserts tokensTotal is taken from the frame and never derived by accumulating tokensDelta (ac1)`, `DaemonProgressReader.onComplete — fires exactly once on the terminal `{ phase: 'done' }`-derived frame, then the reader detaches (ac2)`, `Post-terminal frame suppression — stage/token/duplicate-done frames delivered after detach mutate nothing and invoke no handler, proving 'stops reporting' is structural, not caller discipline (ac2)`, `DaemonProgressSnapshot reads — initial `{ currentStage: null, tokensTotal: 0, done: false }`; currentStage tracks last stage event; done stays true after terminal; read is side-effect free (ac1, ac2)`, `Operation filtering — a reader bound to 'workflow.run' ignores frames whose sc1 operation is 'analyze.run', and two concurrent readers on one client each see only their own (s5 edgeCase; invariant: never correlate by IpcStreamMessage.id)`, `Decode-miss handling — a 'progress'-kind frame whose body is not a sc1 ProgressEvent (raw-shaped, as still emitted by src/daemon/todos-rpc.ts:1146 and src/daemon/tools/types.ts:56) is dropped, warn-logged, reader stays attached (s5 errorCase 2)`, `Error-stream branch — an 'error'-kind frame detaches the reader and sets done WITHOUT firing onComplete (s5 errorCase 1; s4 not-invoked-on-failure)`, `Opaque stageId — a stage frame carrying a stageId outside the eight observed phases is dispatched normally and rendered via its raw stageLabel, never dropped or thrown (invariant c2)`, `Non-monotonic stage index — the synthesize-attempt/synthesize-retry pair (src/daemon/workflow-rpc.ts:151,:166) produces repeating/non-advancing indices; both dispatch, no dedup`, `Handler isolation — a throwing consumer handler is caught and warn-logged, sibling handlers for the same event still run, reader stays attached, snapshot already updated before dispatch is not rolled back (s5 errorCase 3)`, `Late attach — registering a handler after the terminal signal returns void, never throws, handler never invoked; consumer observes final state via snapshot.done === true`, `Multiple handlers per event fire in registration order; past events are NOT replayed to a late-registered handler`, `No raw frame leakage — assert handlers receive only typed sc1 events and that no IpcStreamMessage-shaped object (no `stream`/`data` keys) ever reaches a consumer callback (ac3)`
  - Fixtures: `A frame-builder helper producing well-formed IpcStreamMessage envelopes `{ id, stream, data }` for the 'progress' / 'delta' / 'error' kinds, with `id` deliberately varied (including the producer's literal 0) so no test can accidentally depend on it as a correlator`, `Canonical sc1 ProgressEvent payload fixtures: a StageProgressEvent per observed phase (decompose, plan-ready, grounding, step-start, step-done, synthesize-attempt, synthesize-retry, done), one unknown-phase fallback stage event, TokenProgressEvent samples including tokensDelta === 0 and a token-before-first-stage event with null stageId`, `A fake/stub RPC client stand-in exposing whatever minimal attach + close surface the reader needs, so the reader can be driven without a live socket. NOTE: its exact shape is contingent on profiling src/cli/client.ts (backFlowNotes item 1) — the fixture must be written after that profiling, not guessed`, `A captured-log spy (over getLogger, never console) to assert warn-on-decode-miss and warn-on-handler-throw without asserting exact message text`
- **integration** — Prove the reader decodes frames that the real daemon actually emits, end to end over the IPC stream, rather than only frames a test author hand-wrote. This is what stops the unit suite from passing against a fixture shape that has silently drifted from the producer at src/daemon/workflow-rpc.ts:238.
  - Subjects: `A driven 'workflow.run' through the daemon IPC registration at src/daemon/index.ts:1423, with a reader attached: assert at least one stage event and the terminal completion are observed, extending the established idiom from src/daemon/__tests__/analyze-rpc.live.test.ts:469-471 (collect frames, filter by `stream === 'progress'`, assert on the filtered set) and ADDING the assertion that no progress is surfaced after the terminal frame (ac1, ac2)`, `Server-side frame-id override does not break correlation — reader still routes correctly even though the producer's literal `id: 0` (src/daemon/workflow-rpc.ts:238) is rewritten on write, per the precedent at src/daemon/__tests__/handoff-stream.test.ts:224`, `Shared-socket noise — a reader bound to 'workflow.run' is unaffected by concurrent 'progress'-kind frames from a non-uniform producer, confirming the operation filter holds against real traffic rather than only synthetic frames`, `Abnormal stream close mid-run: reader detaches, done becomes true, onComplete does NOT fire (s5 errorCase 4). NOTE: contingent on the src/cli/client.ts close/teardown signal, unprofiled by s1 — must be re-confirmed before this subject is implementable`
  - Fixtures: `A daemon fixture/harness able to run a short workflow operation to completion; gated behind the repo's live-test env convention (INSRC_LIVE_TESTS=1) and skipping cleanly when unset, matching src/daemon/__tests__/analyze-rpc.live.test.ts`, `A frame-collector helper that records every IpcStreamMessage on the socket alongside every typed event the reader dispatched, so the two can be compared (proving the reader saw the raw frames and the consumer did not — ac3)`, `A deterministic short-running workflow input so the test does not depend on a 30-40 minute operation`

### Acceptance mapping

| Criterion | Proving tests |
| :--- | :--- |
| `ac1` | `unit: onStage dispatches a StageProgressEvent carrying stageId/stageLabel/index/total verbatim from the frame`, `unit: onToken dispatches TokenProgressEvent with tokensDelta/tokensTotal and nullable owning stageId`, `unit: tokensTotal in DaemonProgressSnapshot tracks last-seen frame tokensTotal and is never derived by accumulating tokensDelta`, `unit: snapshot exposes currentStage (null before the first stage frame, then the most recent stage event) so a mid-operation re-render reads current state`, `unit: an unknown/opaque stageId outside the eight observed phases is still surfaced, rendered via its raw stageLabel`, `integration: a driven workflow.run surfaces at least one stage event and ongoing token progress through the reader API` |
| `ac2` | `unit: onComplete fires exactly once on the terminal signal`, `unit: after the terminal signal the reader detaches — subsequent stage/token frames invoke no handler and mutate neither currentStage nor tokensTotal`, `unit: a duplicate terminal frame does not re-fire onComplete`, `unit: snapshot.done is true after the terminal signal and remains true`, `unit: an 'error'-stream termination detaches and sets done WITHOUT firing onComplete, so a failed run is never reported as completed`, `unit: late attach after completion registers without throwing and the handler is never invoked`, `integration: no progress frame is surfaced to the consumer after the terminal frame (extends the analyze-rpc.live.test.ts:469-471 filter idiom with an after-terminal assertion)` |
| `ac3` | `unit: handlers receive only typed sc1 ProgressEvent objects — no object bearing IpcStreamMessage's `stream`/`data` envelope keys ever reaches a consumer callback`, `unit: the reader discriminates on the sc1 `kind` field to route to onStage vs onToken, so the consumer never inspects the envelope`, `unit: a 'progress'-kind frame that does not decode as a sc1 ProgressEvent is dropped inside the reader and never handed to a consumer`, `unit: WorkflowProgress (the s1-internal driver vocabulary) is not exposed through any reader surface — consumers only ever see sc1 types`, `integration: comparing collected raw frames against dispatched events shows the reader consumed the raw envelopes and the consumer saw only decoded events` |

## Migration

**State before:** No client-side progress consumption exists. The daemon already produces progress frames — 'workflow.run' registered at src/daemon/index.ts:1423 binds `onProgress: (f) => send({ id: 0, stream: 'progress', data: f })` at src/daemon/workflow-rpc.ts:238, with eight phases emitted at :110-184 and the error path on a distinct stream at :218 (s1 usage.example bundle). The wire types are already in place: IpcStreamKind at src/shared/types.ts:732 already contains 'progress' and 'delta'; IpcStreamMessage at :734-738 is `{ id; stream; data: unknown }` (s1 symbol.locate + search.text bundles). On the consumer side the s1 usage.example bundle found NO reader, subscription, or frame-decoding hook anywhere — the only client-side `onProgress` occurrences are an unrelated Ollama model-pull tick at src/cli/services/index.ts:69 and src/cli/services/setup.ts:83-101. The RPC client entity `rpc` at src/cli/client.ts, the intended attachment point, resolved at 0.159 and was never profiled (s1 backFlowNotes item 1) — its surface is unmapped. There is also no workflow-progress test: s1 test.locate returned zero workflow-progress tests and convention.detect reports `testFiles: none` for workflow-rpc.ts. Caveat carried from s1: the search.text sweep returned `truncated: true`, so "no consumption code exists" is strong evidence, not proof.

**State after:** A typed DaemonProgressReader consumption API exists on the RPC client surface: onStage / onToken / onComplete registration plus the DaemonProgressSnapshot state-read type, implementing the already-published sc3 interfaceSketch method-for-method, with the additive `release()` primitive from the amendment proposal. The reader binds to one ProgressOperation ('workflow.run' | 'analyze.run'), filters incoming 'progress'/'delta' frames by that operation (never by IpcStreamMessage.id, which the server overrides on write per src/daemon/__tests__/handoff-stream.test.ts:224), decodes bodies into the sc1 ProgressEvent union, and dispatches typed events only — no raw IpcStreamMessage reaches a consumer (ac3). On the terminal signal it fires onComplete at most once, sets snapshot.done, detaches, and structurally drops all later frames (ac2). Error frames stay a distinct path from completion. The daemon side (WorkflowProgress, the eight phases, the transport binding, IpcStreamKind, IpcStreamMessage) is unchanged; no new wire literal and no new IpcStreamKind member (k2 non-goal).

**Zero downtime:** yes — **Data rewrite:** no

### Steps

1. Profile src/cli/client.ts (entity `rpc`, f27cea44e1963ae4dbcccf2c5c185bfa) to map its actual method and stream-dispatch surface before any code is added. Closes s1 backFlowNotes item 1 and fixes the attachment seam the contract deliberately left open; nothing is written in this step. — ↩ rollbackable
2. Re-run an untruncated text sweep for client-side progress-frame consumption and for 'progress'-kind frame producers, converting the s1 search.text finding (truncated: true) from evidence into verification. If any pre-existing consumer is found, treat the reader as an addition beside it rather than as net-new and revisit backwardCompat before proceeding. — ↩ rollbackable
3. Confirm the sc1 types (ProgressOperation, StageProgressEvent, TokenProgressEvent, ProgressEvent) have landed adjacent to src/shared/types.ts:734 from s1, since s3 dependsOn s1 and consumes them with no field added, narrowed, or reinterpreted. Do not proceed if absent — do not stub local copies, which would create a second source of truth. — ↩ rollbackable _(needs: `s1-sc1-types-landed`)_
4. Add the DaemonProgressSnapshot interface and the DaemonProgressReader interface (onStage, onToken, onComplete) as type-only declarations, verbatim from the published sc3 interfaceSketch — additive types only, no existing declaration touched, no runtime behaviour yet. — ↩ rollbackable
5. Add the private per-operation reader state named in the contract dataModel: bound operation as correlation key, registered handlers, last-seen currentStage, last-seen tokensTotal, and a detached flag. Keep this bookkeeping private to s3 per the HLD boundary.internal clause; do not export it. — ↩ rollbackable
6. Add the private frame-decode path: filter incoming frames by the sc1 operation field, discriminate on `kind` to route stage vs token, treat stageId as opaque (no exhaustive switch over the eight phases), trust tokensTotal without re-validating monotonicity (s1 guards it upstream), and drop unrecognised bodies without dispatch or throw. Decoding stays private — consumers never see IpcStreamMessage. — ↩ rollbackable
7. Add terminal handling: on the mapped terminal signal fire onComplete at most once, set snapshot.done true and keep the snapshot readable, then detach and drop all subsequent frames for that operation. Keep the error stream a distinct path that does NOT fire onComplete, so a failed run is never reported as clean completion. — ↩ rollbackable
8. Attach the reader to the RPC client at the seam identified in step 1, so a caller driving 'workflow.run' or 'analyze.run' obtains a reader bound to that operation. First step that changes observable client behaviour; keep it behind the feature flag so it can be turned off without reverting code. — ↩ rollbackable _(needs: `insrc-progress-reader-enabled`)_
9. Add the amended `release()` primitive to DaemonProgressReader: detach early, drop handlers, stop decoding for the operation. Additive and non-breaking — no existing member changes signature and sc3 has no other consuming Story — so the mirroring fork adopts it without changing any call it already makes. — ↩ rollbackable
10. Add the net-new progress test extending the idiom at src/daemon/__tests__/analyze-rpc.live.test.ts:469-471 (collect frames, filter by stream, assert at least one), plus the ac2 assertion that no further progress surfaces after the terminal frame, an assertion that an error-terminated run does not fire onComplete, and an unknown-phase case asserting the stageId passes through rather than being dropped. Follow the module's camelCase-functions / PascalCase-types convention, no class introduced. — ↩ rollbackable
11. Publish the final DaemonProgressReader + DaemonProgressSnapshot type surface for the IDE fork to mirror, recording that the fork supplies the implementation and render path (out of scope for this repo). Do this only after step 10 passes — once mirrored, renaming or narrowing these types breaks lock-step across insrc / insrc-ide and stops being cheaply rollbackable. — ✕ non-rollbackable

**Backward compat:** No existing public API changes behaviour. The daemon-side surface s3 sits opposite is untouched: WorkflowProgress (src/daemon/workflow-rpc.ts:61), its eight phase emission sites (:110-184), the transport binding at :238 including the literal `id: 0`, the error frame at :218, and the IpcStreamKind / IpcStreamMessage wire types (src/shared/types.ts:732, :734-738) all keep their current shapes. s3 introduces no new wire literal and no new IpcStreamKind member — an explicit DEF non-goal (k2), load-bearing because the IDE fork mirrors these types and any structural change breaks lock-step across the two repos. Non-uniform 'progress' producers (src/daemon/todos-rpc.ts:1146, src/daemon/tools/types.ts:56) keep emitting raw-shaped frames and are unaffected: the reader filters by operation and drops bodies it cannot decode, so it neither requires nor forces their conformance. The reader itself is purely additive — the s1 usage.example bundle found no existing client-side consumer to break, and every new type and method is a new name. The one added contract member, `release()`, is an addition to an interface s3 owns whose consumedByStories list is empty; no existing member changes signature, so the mirroring fork adopts it without changing any call it already makes. Callers that ignore progress entirely continue to work unchanged, since progress is best-effort and transient per the HLD durability clause and no caller is required to attach a reader.

## Alternatives considered

### a1: Handler-registration reader (HLD baseline) — **CHOSEN**

A per-operation DaemonProgressReader object exposing onStage / onToken / onComplete registration, exactly as sketched in sc3.

The RPC client exposes a factory (e.g. `attachProgressReader(operation: ProgressOperation): DaemonProgressReader`) returning a reader whose surface is the three registration methods from the HLD sketch plus a `snapshot(): DaemonProgressSnapshot` accessor. Internally — and entirely private to s3 — the reader filters inbound IpcStreamMessage frames by stream kind ('progress' | 'delta') and by the sc1 payload's `operation` field, discriminates StageProgressEvent from TokenProgressEvent on `kind`, and maintains currentStage / tokensTotal bookkeeping. Frames are never handed to handlers raw; the sc1 event objects pass through verbatim with no field added, narrowed, or reinterpreted. onComplete fires once when the terminal signal for that operation arrives (the daemon's `done` phase mapped by s1, or the final result), after which the reader detaches and drops all subsequent frames for that operation; an error frame is surfaced distinctly rather than conflated with completion. Because stageId derives from an open `phase: string`, the reader treats stageId as opaque and never switches exhaustively. Frame `id` is explicitly not a correlator (server-overridden per handoff-stream.test.ts:224); correlation is by `operation` plus reader lifetime.

### a2: Snapshot-store subscription

A single subscribe(listener) that pushes an immutable DaemonProgressSnapshot on every change, making the snapshot — not the event — the contract.

sc3 is shaped as a small observable store: `subscribeProgress(operation: ProgressOperation, listener: (snapshot: DaemonProgressSnapshot) => void): () => void`, returning an unsubscribe function. DaemonProgressSnapshot stays exactly as sketched in the HLD — operation, currentStage (last StageProgressEvent or null), tokensTotal, done — re-emitted as a fresh frozen object whenever an inbound sc1 event changes it. Stage frames replace currentStage; token frames advance tokensTotal taken directly from sc1's tokensTotal (already monotonicity-guarded by s1, so the reader does no re-validation); the terminal signal sets done: true and emits one final snapshot before the store stops emitting. Discrimination, filtering by operation, and drop-after-done live inside the s3 boundary as in a1. sc1 event types remain the internal vocabulary and are re-exported for typing, but the consumption path is snapshot-only — the fork never handles an individual event.

**Rejected because:** Strong on ac1 and ac2 — the frozen snapshot is directly renderable and `done` makes completion observable even to a late attacher, which a fire-once callback cannot express; the unsubscribe closure closes a1's release-path gap. But it is only partial on ac3: the criterion says the workbench 'consumes structured phase and token events', and a2's stated design is snapshot-only with the fork never handling an individual event. It is likewise partial on sc3 — DaemonProgressSnapshot is preserved verbatim, but the three registration methods that constitute the sketch's reader are replaced, forcing the HLD contract text to be re-read as illustrative rather than binding. That is a contract renegotiation with a fork this repo cannot see, traded for ergonomics this bundle did not verify the fork needs. Its genuine advantages — the unsubscribe closure and observable `done` for late attachers — are additive within a1's contract and were grafted on as the `release()` amendment instead.

### a3: Async-iterable progress stream

Consumption is a single progressStream(operation): AsyncIterable<ProgressEvent> that yields sc1 events and terminates on completion.

sc3 becomes one method returning an async iterable over the decoded sc1 union: `progressStream(operation: ProgressOperation): AsyncIterable<ProgressEvent>`. The consumer writes `for await (const e of ...)` and discriminates on `e.kind`. Completion is expressed by the iterator returning done — no separate callback — and loop exit IS the ac2 stop-reporting signal; an error frame rejects the iterator so the fork distinguishes failure from clean completion (the bundle's explicit warning against conflating error frames with onComplete). Internally s3 owns a bounded buffer between frame arrival and consumer pull, plus the same filter-by-operation and drop-after-terminal logic. Early consumer exit (break/return) invokes the iterator's return() and detaches, doubling as the unsubscribe primitive.

**Rejected because:** Technically elegant — one language-level protocol expresses completion, error, and cancellation, and loop exit is an unambiguous detach that both a1 and a2 need bespoke conventions for. It scores clean on ac2 and ac3. It ranks last on the two contract constraints and on risk. sc3 is violated furthest of the four: neither the registration methods nor DaemonProgressSnapshot survive, so a late or re-rendering consumer has no current-state read, and multiple observers of one operation require tee-ing. It also forces s3 to own a buffering policy (bound / drop-oldest / block) that the other three avoid entirely — real internal surface and a real semantic decision for what the HLD calls a best-effort transient signal. Most decisive: the bundle never profiled src/cli/client.ts, so betting the contract on async-iteration ergonomics inside an unmapped event-driven workbench render loop is the least-evidenced choice available.

### a4: Call-site progress options bag

No reader object: the client's long-operation methods take an optional onStage/onToken/onComplete bag, mirroring the daemon's own RunWorkflowOpts.onProgress idiom.

sc3 is defined not as a standalone reader but as an options type threaded into the existing client call: `runWorkflow(params, progress?: DaemonProgressHandlers)` where DaemonProgressHandlers is `{ onStage?, onToken?, onComplete? }` over the sc1 types. This mirrors the shape already established daemon-side at src/daemon/workflow-rpc.ts:75, where RunWorkflowOpts carries an optional onProgress callback. Correlation becomes trivial and airtight: handlers are scoped to exactly one in-flight call, so s3 never has to correlate frames to an operation by any daemon-supplied field — directly answering the constraint that frame `id` is server-overridden and unusable as a correlator. Lifetime is the call's lifetime; the promise settling is the completion boundary and handlers are dropped there. A caller passing no bag incurs zero progress overhead, satisfying the HLD's durability clause literally.

**Rejected because:** Best correlation story of the four and cheapest (S): handlers scoped to one in-flight call mean s3 never correlates frames at all, which directly sidesteps the unusable server-overridden frame id, and opt-in-by-omission literally satisfies the HLD's zero-overhead-when-unattached clause. It also mirrors RunWorkflowOpts.onProgress at src/daemon/workflow-rpc.ts:75, keeping one idiom across the socket. It scores well on ac1/ac2/ac3 for the initiating caller. It falls to third on contract fidelity: sc3 is named DaemonProgressReaderApi and sketched as a standalone reader plus snapshot; a4 delivers neither, redefining the owned contract as a handler bag, and an observer that did not initiate the call has no attachment point at all. It is also designed blind — src/cli/client.ts's method surface was never profiled, yet a4 threads a parameter through every long-operation method. a1 already avoids the frame-id trap by correlating on the sc1 `operation` field plus reader lifetime, so a4 buys its correlation win at the price of the contract itself.

## Open questions

- [s8 cd3 — partial] No concrete throwable type is named anywhere in the contract. Three of five api entries name behavioural outcomes rather than error types (`none-thrown`, `not-invoked-on-failure`, `decode-miss`), which is defensible for a type-level-only surface that genuinely throws nothing — but the error-stream path (s5 errorCase 1) carries a real failure payload `{ error: string; recoverable: boolean }` that is not pinned to a named type. If the proposed `onError` amendment lands, that payload must be given a named type before implementation.
- [s8 ep3 — partial] The `source` field on each of the eight invariantsToPreserve points at constraint ids (c1-c5) rather than naming the s1 analyze bundle that demonstrates the invariant. Every claim is traceable through the prose, but bundle attribution is implicit; a reader has to reconstruct which of the five bundles supplied each invariant. Worth tightening to explicit bundle references before this LLD is used as the implementation input.
- [s8 alt2 — partial] No Epic-level constraint id appears in any constraintScore: k4/k5 are covered only transitively via the ACs that operationalize them, and the four HLD nonFunctional constraints (performance, durability, observability, security) were never scored per alternative. a4's zero-overhead-when-unattached advantage and a3's buffering-policy cost were argued in prose only. The durability clause in particular discriminates between these alternatives and would have been worth an explicit scoring row.
- [s8 sbdry4 — note] `prerequisiteFlags` names `insrc-progress-reader-enabled` (migration step 8) and `s1-sc1-types-landed` (step 3), but no feature-flag mechanism was surfaced by any s1 bundle. These are gates to be created rather than references to existing code, so they are not invented references — but the flag infrastructure must be confirmed to exist before step 8 can depend on it.
- [s8 sbdry2 — note] Migration steps 4-10 read close to a build order ('Add the interface', 'Add the private state', 'Add the frame-decode path', …). They stay on the LLD side of the boundary because each carries design content (what stays private, what must not be exhaustively switched, what must not fire), but this is the pattern to watch if the section grows in a future amendment.
- [s1 backFlowNotes item 1 — unresolved grounding gap] src/cli/client.ts (entity `rpc`, f27cea44e1963ae4dbcccf2c5c185bfa) was resolved at 0.159 but never profiled, so the reader's attachment seam, the transport close/teardown signal (s5 errorCase 4 depends on it), and the unit-test stub fixture shape (s6) are all designed blind. Migration step 1 exists solely to close this and must complete before any code is written.
- [s1 backFlowNotes item 3 — unresolved grounding gap] The s1 search.text sweep returned `truncated: true`, so both 'no client-side progress consumption exists' and the producer inventory (todos-rpc.ts:1146, tools/types.ts:56) are strong evidence, not proof. Migration step 2 must re-run an untruncated sweep; if a pre-existing consumer surfaces, the reader becomes an addition beside it and backwardCompat must be revisited.
- [amendments awaiting HLD decision] Two additive sharedContract.methodAdd proposals against sc3 are pending: `release()` (from s4 — no exit path for a consumer abandoning a 30-40 minute operation) and `onError()` (from s5 — a failed run currently has no representable outcome, since onComplete must not fire). Both are argued non-breaking on the grounds that sc3's consumedByStories is empty and no existing member changes signature, but neither is approved yet; migration steps 7 and 9 assume they land.
