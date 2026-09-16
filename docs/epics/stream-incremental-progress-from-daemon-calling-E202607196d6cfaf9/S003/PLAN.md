<!-- insrc:artifact PLAN-6d6cfaf9a9b14bd4-s3 -->

# Plan: E202607206d6cfaf9:S003

**Epic:** `stream-incremental-progress-from-daemon-calling`
**LLD run:** `wf-1784546056508-oeza4l`
**LLD effective hash:** `2699deb16227...`

## Tasks

| # | Task | Size | Depends on | Tests | Derived from |
| :--- | :--- | :--- | :--- | :--- | :--- |
| 1 | **`t1`** Decide both pending HLD amendments before any surface is designed | S | — | smoke: amendment-decision-record: both release() and onError() amendments carry an explicit approved/rejected verdict with the resulting sc3 member set and error-branch shape stated; smoke: no-src-diff: `git diff --stat src/` is empty for this Task | [[c10]] [[c11]] [[c2]] |
| 2 | **`t2`** Profile src/cli/client.ts and pin the module path, attach seam and accessor decision | M | — | smoke: seam-map-record: reader module path, sibling __tests__/ dir, frame-receiving method(s) and attach call are each named concretely; smoke: close-signal-record: transport close/teardown signal named with symbol + file:line, or recorded absent with the errorCase 4 consequence stated; smoke: inherited-line-refs-reconfirmed: workflow-rpc.ts:61/:110-184/:218/:238 and shared/types.ts:732/:734-738 each confirmed or corrected against the current tree; smoke: no-src-diff: `git diff --stat src/` is empty for this Task | [[c9]] [[c6]] [[c3]] |
| 3 | **`t3`** Re-run an untruncated sweep for progress consumers and progress-frame producers | S | — | smoke: sweep-reproducibility: the recorded sweep command re-runs untruncated and reproduces the same consumer and producer file:line lists; smoke: exclusion-record: src/cli/services/index.ts:69 and src/cli/services/setup.ts:83-101 appear as explicitly excluded hits with a stated reason; smoke: no-src-diff: `git diff --stat src/` is empty for this Task | [[c9]] [[c4]] |
| 4 | **`t4`** Confirm the sc1 ProgressEvent types have landed from s1 | S | — | unit: sc1-types-importable: a type-only import of ProgressOperation / StageProgressEvent / TokenProgressEvent / ProgressEvent from src/shared/types.js type-checks clean under `npm run build`; unit: sc1-field-shapes-match-sketch: each sc1 type's fields are asserted against the published interfaceSketch — no field added, narrowed, or renamed; unit: ipc-stream-kind-unchanged: IpcStreamKind still contains 'progress' and 'delta' and has no added member; smoke: no-local-sc1-stub: a repo sweep finds no local re-declaration or structural copy of any sc1 type in this Story's code | [[c4]] [[c9]] |
| 5 | **`t5`** Declare the DaemonProgressReader and DaemonProgressSnapshot type surface | S | `t1`, `t2`, `t4` | unit: reader-surface-typechecks: the declared DaemonProgressReader and DaemonProgressSnapshot compile clean under `npm run build` with onStage/onToken/onComplete returning void; unit: member-set-matches-decisions: the exported member set equals exactly the t1-approved members plus the t2 accessor decision — no unapproved member present, no approved member missing; unit: snapshot-shape: DaemonProgressSnapshot exposes operation, nullable currentStage, tokensTotal and done with sketch types, no field renamed or narrowed; unit: no-workflow-progress-in-surface: WorkflowProgress appears in no exported type of the module, and sc1 types are imported rather than re-declared | [[c1]] [[c2]] [[c3]] [[c9]] |
| 6 | **`t6`** Add the private per-operation reader state | M | `t5` | unit: initial-snapshot: a freshly created reader reads `{ operation, currentStage: null, tokensTotal: 0, done: false }`; unit: snapshot-read-is-side-effect-free: repeated reads with no intervening frame return equal state and mutate nothing; unit: factory-not-class: the module exports a camelCase factory and no class; no internal state type or field is exported; unit: never-correlates-by-frame-id: no code path reads IpcStreamMessage.id, asserted by driving frames with varied ids including the producer's literal 0 | [[c5]] [[c3]] [[c1]] |
| 7 | **`t7`** Implement the frame decode, operation filter and kind dispatch path | M | `t6` | unit: stage-dispatch-verbatim: onStage receives stageId/stageLabel/index/total exactly as carried by the frame; unit: token-dispatch-with-nullable-stage: onToken receives tokensDelta/tokensTotal plus nullable owning stageId, including a token-before-first-stage frame; unit: tokens-total-from-frame-not-accumulated: snapshot tokensTotal tracks the frame value and is never derived by summing tokensDelta; unit: operation-filter: a reader bound to 'workflow.run' ignores 'analyze.run' frames — no handler runs, no state mutates; unit: kind-discrimination: routing is driven by the sc1 `kind` field, and no producer allowlist or emitter-identity check exists; unit: opaque-stage-id: a stage frame with a stageId outside the eight observed phases dispatches normally via its raw stageLabel; unit: snapshot-updated-before-dispatch: a handler reading the snapshot observes the event that triggered it | [[c1]] [[c4]] [[c5]] |
| 8 | **`t8`** Add the decode-miss, handler-isolation and envelope-containment resilience layer | M | `t7` | unit: decode-miss-drop: a raw-shaped 'progress' body (todos-rpc/tools-types style) is dropped, warn-logged, and the reader still processes the next valid frame; unit: handler-throw-isolation: a throwing handler is caught and warn-logged, sibling handlers for the same event still run, reader stays attached; unit: no-state-rollback-on-throw: the snapshot still reflects the received frame after a handler throws; unit: no-raw-envelope-leakage: no object bearing `stream`/`data` keys reaches any consumer callback; unit: logging-via-getlogger: a log spy over getLogger captures both warns and no console call exists in the module | [[c6]] [[c9]] [[c1]] |
| 9 | **`t9`** Implement terminal handling, detach, and the distinct error path | M | `t1`, `t8` | unit: complete-fires-once-then-detaches: onComplete fires exactly once on the terminal signal and the reader detaches; unit: post-terminal-suppression: subsequent stage/token/duplicate-done frames invoke no handler and mutate neither currentStage nor tokensTotal; unit: error-stream-branch: an 'error'-kind frame detaches and sets done true without firing onComplete, matching the t1-decided branch shape; unit: done-sticky-and-snapshot-readable: snapshot.done is true after every terminal path and the snapshot stays readable; unit: late-attach-inert: registering after detach returns void, never throws, and the handler is never invoked; unit: no-silence-timer: abnormal close is driven by the t2 transport lifecycle signal; no timer over frame gaps exists in the code | [[c2]] [[c6]] [[c9]] |
| 10 | **`t10`** Build the test fixture harness and the dispatch, filtering and resilience suite | M | `t2`, `t8` | unit: onStage dispatches a decoded StageProgressEvent with stageId/stageLabel/index/total verbatim; unit: onToken dispatches TokenProgressEvent with tokensDelta/tokensTotal and nullable owning stageId, including tokensDelta === 0 and token-before-first-stage; unit: tokensTotal is taken from the frame and never derived by accumulating tokensDelta; unit: snapshot pre-terminal lifecycle: currentStage null before the first stage frame, then tracks the most recent stage event; reads are side-effect free; unit: operation filtering: two concurrent readers bound to 'workflow.run' and 'analyze.run' each see only their own frames; unit: frame-id is never a correlator: varied ids including the producer's literal 0 change no routing; unit: decode-miss: a raw-shaped 'progress' body is dropped, warn-logged via the getLogger spy, reader stays attached; unit: opaque stageId outside the eight observed phases dispatches normally via its raw stageLabel; unit: non-monotonic synthesize-attempt/synthesize-retry indices both dispatch with no dedup; unit: handler isolation: a throwing handler is caught and warn-logged, siblings still run, snapshot is not rolled back; unit: multiple handlers per event fire in registration order and past events are not replayed to a late-registered handler; unit: no raw frame leakage: handlers receive only typed sc1 events, no `stream`/`data`-keyed object, and WorkflowProgress appears in no consumer-visible type | [[c7]] [[c6]] [[c1]] [[c3]] |
| 11 | **`t11`** Add the terminal, error-branch and late-attach unit suite | M | `t9`, `t10` | unit: onComplete fires exactly once on the terminal done-derived frame, then the reader detaches; unit: a duplicate terminal frame does not re-fire onComplete; unit: post-terminal stage/token/duplicate-done frames invoke no handler and mutate neither currentStage nor tokensTotal; unit: an 'error'-stream frame detaches and sets done true WITHOUT firing onComplete, matching the t1-decided branch shape; unit: snapshot.done is true after every terminal path, remains true, and the snapshot stays readable; unit: late attach after the terminal signal returns void, never throws, and the handler is never invoked; unit: abnormal transport close while not done detaches with done true and no onComplete, via the t2 fake-client close signal (or recorded deferred) | [[c7]] [[c2]] [[c6]] |
| 12 | **`t12`** Attach the reader to the RPC client behind a feature flag | M | `t2`, `t9` | unit: flag-on-attach: with insrc-progress-reader-enabled on, a caller driving 'workflow.run' obtains a bound reader and fake-client frames reach the decode path; unit: flag-off-inert: with the flag off, a decode-path spy records zero invocations and no reader object is constructed; smoke: no-daemon-or-wire-diff: `git diff` shows no change under src/daemon/ and no wire-type change in src/shared/types.ts; smoke: full-sweep-both-flag-states: `npx tsx --test 'src/**/__tests__/*.test.ts'` passes with the flag on and with it off | [[c9]] [[c4]] |
| 13 | **`t13`** Add the release() primitive to DaemonProgressReader | S | `t1`, `t9`, `t11` | unit: early-release-mid-operation: release() drops handlers and subsequent stage/token frames invoke nothing and mutate nothing; unit: double-release-is-noop: release() on an already-detached reader does not throw and does not fire onComplete; unit: release-reuses-terminal-detach-path: post-release suppression behaviour is identical to post-terminal suppression; unit: release-is-additive: no existing sc3 member signature changes, sc1 is untouched, no IpcStreamKind member or wire literal is added | [[c10]] [[c2]] [[c9]] |
| 14 | **`t14`** Add the onError() member and a named failure payload type | M | `t1`, `t9`, `t11` | unit: onError-fires-on-error-branch-only: an 'error'-stream frame dispatches the named failure payload and no other path fires onError; unit: onError-and-onComplete-mutually-exclusive: a failed run fires exactly one of the two and never both; unit: named-failure-type-exported: the `{ error: string; recoverable: boolean }` payload has a named exported type that type-checks clean; unit: onError-is-additive: no existing sc3 member signature changes, sc1 untouched, no IpcStreamKind member or wire literal added | [[c11]] [[c2]] [[c6]] |
| 15 | **`t15`** Add the daemon-driven integration test for the reader | M | `t11`, `t12` | integration: driven workflow.run through src/daemon/index.ts:1423 with a reader attached surfaces at least one stage event, ongoing token progress, and the terminal completion; no progress is surfaced after the terminal frame; integration: driven short analyze.run against src/daemon/analyze-rpc.ts:521 decodes stage and token events identically through the reader; integration: server-side frame-id override does not break correlation — the producer's literal `id: 0` is rewritten on write and routing still holds; integration: shared-socket noise: concurrent 'progress' frames from a non-uniform producer leave the bound reader's state and dispatch unaffected; integration: frame-collector comparison: collected raw IpcStreamMessages versus dispatched events show the reader consumed envelopes and the consumer saw only decoded sc1 events; integration: abnormal stream close mid-run: reader detaches, done becomes true, onComplete does NOT fire (or the subject is recorded deferred per the t2 finding); live: suite gates behind INSRC_LIVE_TESTS=1 and skips cleanly when unset, matching src/daemon/__tests__/analyze-rpc.live.test.ts | [[c8]] [[c6]] [[c9]] |
| 16 | **`t16`** Publish the final sc3 type surface for the IDE fork to mirror | S | `t1`, `t15` | smoke: full-sweep-green-before-publish: `npx tsx --test 'src/**/__tests__/*.test.ts'` passes, including t10, t11 and (INSRC_LIVE_TESTS=1) t15, before publication; unit: published-surface-matches-shipped-code: every member in the published record exists in the shipped types and no unapproved member appears; smoke: publication-record-completeness: accessor decision, t1 amendment outcomes, fork-ownership statement and residual open questions are all recorded; smoke: no-sc1-or-wire-change: `git diff` shows no sc1 type and no IpcStreamKind member changed by this Task | [[c9]] [[c3]] [[c1]] [[c10]] [[c11]] |

### E202607206d6cfaf9:S003:T001 — Decide both pending HLD amendments before any surface is designed

Decision-only gate. Record the HLD decision on the two pending sharedContract.methodAdd amendments against sc3 — `release(): void` and `onError(handler)` plus a named type for the daemon's `{ error: string; recoverable: boolean }` failure payload. This Task exists because the amendments determine the reader's member set and its error semantics: with them approved, DaemonProgressReader has five members and the error branch fires a handler; without, it has three and the error branch detaches silently. Deciding after the surface, decode path and unit suite are written would force rework of all three. No code is written here; the output is a recorded approved/rejected decision for each amendment, with the rationale, carried forward into t5 (member set), t9 (error-branch shape) and t16 (published record).

**Acceptance checks:**
- The release() amendment is recorded as approved or rejected — never left ambiguous or pending.
- The onError() amendment, including the named failure-payload type, is recorded as approved or rejected.
- The recorded decision states the resulting DaemonProgressReader member set explicitly, so t5 declares it once rather than relaxing it later.
- The recorded decision states the resulting error-branch behaviour (silent detach vs onError dispatch), so t9 implements it once.
- No file under src/ is modified by this Task.

### E202607206d6cfaf9:S003:T002 — Profile src/cli/client.ts and pin the module path, attach seam and accessor decision

Read-only discovery. Profile the RPC client entity `rpc` at src/cli/client.ts (f27cea44e1963ae4dbcccf2c5c185bfa) — never profiled by the s1 bundle (resolved 0.159) and returning zero hits from symbol.locate in the s3 grounding pass. Produce a written map of: (a) the method/stream-dispatch surface where inbound IpcStreamMessage frames are received, (b) the concrete attach point a per-operation reader would hook into, (c) the transport close/teardown signal available for abnormal-close detection (errorCase 4 is contingent on this), and (d) the minimal surface a unit-test stub must fake. This Task also settles two things the plan otherwise leaves contradictory: the file the reader module lands in (which fixes where its tests live), and whether the snapshot accessor is a published sc3 member or an s3-internal affordance — profiling src/cli/client.ts is the LLD's own stated trigger for that deferred decision. Re-confirm the line references the LLD inherited from the s1 bundle (workflow-rpc.ts:61 declaration, :110-184 phase sites, :218 error frame, :238 transport binding, shared/types.ts:732/:734-738) since the s3 grounding pass could resolve no entity line ranges. Write NO production code in this Task.

**Acceptance checks:**
- The reader module's file path is named concretely, and the sibling __tests__/ directory that follows from it is named — so t10/t11 place tests beside the code rather than by assumption.
- The snapshot accessor is recorded as either a published sc3 member or an s3-internal affordance, with the profiling finding as the stated reason.
- A written seam map names the concrete src/cli/client.ts method(s) that receive IpcStreamMessage frames and the exact call at which a per-operation reader would attach.
- The transport close/teardown signal is either named concretely (symbol + file:line) or explicitly recorded as absent, with the consequence for errorCase 4 stated.
- The minimal fake-client surface needed by unit tests is enumerated, so the t10 fixture is written against an observed shape rather than a guessed one.
- Each inherited line reference (workflow-rpc.ts:61/:110-184/:218/:238; shared/types.ts:732/:734-738) is confirmed or corrected against the current tree.
- No file under src/ is modified by this Task.

### E202607206d6cfaf9:S003:T003 — Re-run an untruncated sweep for progress consumers and progress-frame producers

Read-only verification converting the s1 search.text finding (`truncated: true`) from evidence into proof. Sweep exhaustively for (a) any existing client-side consumption of 'progress'/'delta' stream frames, and (b) the full set of producers emitting 'progress'-kind frames — the s1 inventory named src/daemon/todos-rpc.ts:1146 and src/daemon/tools/types.ts:56 but is explicitly non-exhaustive. Known-unrelated hits (the Ollama model-pull tick at src/cli/services/index.ts:69 and src/cli/services/setup.ts:83-101) are recorded and excluded. If any pre-existing consumer surfaces, the reader must be re-scoped as an addition beside it and the LLD's backwardCompat claim revisited before implementation proceeds. Note that this sweep does NOT gate the choice of structural decode validation — that requirement stands unconditionally in t7 precisely because an inventory of this kind can never be proven exhaustive. Write NO production code in this Task.

**Acceptance checks:**
- The consumer sweep completes without truncation and its result is recorded as either 'no pre-existing client-side progress consumer' (now proven) or a concrete list of consumers found.
- The producer inventory is recorded with file:line for every hit, and the exact sweep command is recorded so a reviewer can re-run it and get the same list.
- Known-unrelated hits (src/cli/services/index.ts:69, src/cli/services/setup.ts:83-101) are listed as excluded with the reason, not silently dropped.
- If any pre-existing consumer is found, a written note states how the reader is re-scoped as an addition beside it and what in backwardCompat must change.
- No file under src/ is modified by this Task.

### E202607206d6cfaf9:S003:T004 — Confirm the sc1 ProgressEvent types have landed from s1

Hard gate matching storyDependsOn: ['s1']. Verify that ProgressOperation, StageProgressEvent, TokenProgressEvent and the ProgressEvent union exist adjacent to IpcStreamMessage in src/shared/types.ts (around :734), exported and importable, with field shapes matching the sc1 interfaceSketch exactly. Also verify IpcStreamKind (:732) still contains 'progress' and 'delta' and that no new member was added. If the types are absent, STOP — the LLD explicitly forbids stubbing local copies, which would create a second source of truth. This Task gates every subsequent type-adding Task and satisfies the `s1-sc1-types-landed` prerequisite flag from migration step 3.

**Acceptance checks:**
- ProgressOperation, StageProgressEvent, TokenProgressEvent and ProgressEvent are confirmed present, exported, and importable from src/shared/types.ts.
- Each field of each sc1 type matches the published interfaceSketch verbatim — no field added, narrowed, renamed, or reinterpreted on this side.
- IpcStreamKind is confirmed to still contain 'progress' and 'delta' with no member added by s1 or this Story.
- No local stub, re-declaration, or structural copy of any sc1 type exists anywhere in this Story's code.
- If any sc1 type is absent, the Story is halted with the gap recorded rather than proceeding with a stub.

### E202607206d6cfaf9:S003:T005 — Declare the DaemonProgressReader and DaemonProgressSnapshot type surface

Add type-only declarations in the module path pinned by t2, using the member set fixed by the t1 amendment decision: `DaemonProgressReader` with onStage / onToken / onComplete from the published sc3 interfaceSketch (all returning void — registration only), plus release() and/or onError() if and only if t1 approved them, plus the snapshot accessor if and only if t2 recorded it as a published member. `DaemonProgressSnapshot` is declared as `{ operation: ProgressOperation; currentStage: StageProgressEvent | null; tokensTotal: number; done: boolean }`. All handler parameter types are imported from the s1 sc1 types — nothing is re-declared locally. Additive only: no existing declaration is touched, no runtime behaviour is introduced, and WorkflowProgress (s1-internal driver vocabulary at src/daemon/workflow-rpc.ts:61) must not appear anywhere in this surface. Follows the module convention: PascalCase types, no class introduced.

**Acceptance checks:**
- DaemonProgressReader declares onStage, onToken and onComplete with the sketch's signatures, each returning void.
- The declared member set matches the t1 decision and the t2 accessor decision exactly — no unapproved member is present and no approved member is missing.
- DaemonProgressSnapshot declares operation, currentStage (nullable), tokensTotal and done with the sketch's types and no field renamed or narrowed.
- StageProgressEvent / TokenProgressEvent / ProgressOperation are imported from src/shared/types.ts; no local re-declaration exists.
- WorkflowProgress does not appear in any exported type of this surface.
- No class is introduced and no existing declaration is modified; `npm run build` type-checks clean.

### E202607206d6cfaf9:S003:T006 — Add the private per-operation reader state

Implement the private bookkeeping backing a reader instance, as a factory returning a typed object (matching the module's camelCase-functions / no-class convention): the bound ProgressOperation used as the sole correlation key, the registered stage/token/complete handler lists, last-seen currentStage, last-seen tokensTotal, and a `detached` flag. Per HLD boundary.internal this state is private to s3 and is not exported. Implement the state-read half as a side-effect-free snapshot accessor returning DaemonProgressSnapshot — exported or module-private per the t2 decision — with an initial read of `{ operation, currentStage: null, tokensTotal: 0, done: false }`. Correlation must be by the sc1 `operation` field plus reader lifetime and NEVER by IpcStreamMessage.id, which the server overrides on write (asserted at src/daemon/__tests__/handoff-stream.test.ts:224).

**Acceptance checks:**
- A factory (not a class) creates a reader bound to exactly one ProgressOperation and returns the t5-typed object.
- Reader state is module-private: no internal state type or field is exported from the module.
- The snapshot accessor is side-effect free — repeated reads with no intervening frame return equal state and mutate nothing.
- The accessor's exported-vs-private status matches the t2 decision.
- Initial snapshot reads `{ operation, currentStage: null, tokensTotal: 0, done: false }`.
- No code path reads IpcStreamMessage.id for correlation or any other purpose.

### E202607206d6cfaf9:S003:T007 — Implement the frame decode, operation filter and kind dispatch path

Add the happy-path half of the private decode pipeline: branch on `IpcStreamMessage.stream` first, filter by the payload's sc1 `operation` field against the reader's bound operation, then validate the body structurally against the ProgressEvent union (`kind` is 'stage' or 'token' plus that variant's required fields). Validation is structural, never a producer allowlist — the t3 inventory is by nature non-exhaustive, so an allowlist would silently drop valid frames from an unlisted producer. Discriminate on `kind` to route to onStage vs onToken handlers. Treat stageId as an opaque open string (no exhaustive switch over the eight observed phases); trust tokensTotal verbatim without re-validating monotonicity (s1 guards it upstream); never accumulate tokensDelta to derive a total. Snapshot state is updated BEFORE handlers are invoked, so a handler reading the snapshot sees the event it was called for. Resilience behaviour (drop-on-decode-miss, handler-throw isolation, logging) is deliberately deferred to t8.

**Acceptance checks:**
- Frames whose sc1 operation differs from the reader's bound operation are ignored entirely — no handler runs and no state mutates.
- Decoding validates the body structurally against the sc1 union; no producer allowlist, source check, or emitter-identity check exists in the code.
- A stage frame whose stageId lies outside the eight observed phases is dispatched normally; no exhaustive switch over phase values exists in the code.
- tokensTotal is taken verbatim from the frame; no accumulation of tokensDelta and no downstream monotonicity re-validation exists.
- Snapshot state is updated before handler dispatch — a handler reading the snapshot observes the event that triggered it.
- `npm run build` type-checks clean.

### E202607206d6cfaf9:S003:T008 — Add the decode-miss, handler-isolation and envelope-containment resilience layer

Harden the t7 pipeline so no single malformed frame or misbehaving consumer can take the reader down. A body that fails structural decode is dropped without dispatch, warn-logged via getLogger (never console), and leaves the reader attached and processing subsequent frames. Each handler invocation is wrapped in try/catch: a throwing consumer handler is caught, warn-logged, and swallowed; sibling handlers registered for the same event still run; and state is not rolled back, since the frame was legitimately received regardless of what the consumer did with it. Enforce envelope containment: no raw IpcStreamMessage — nothing carrying the `stream`/`data` envelope keys — ever reaches a consumer callback; consumers see only decoded sc1 event objects.

**Acceptance checks:**
- A 'progress'-kind frame with a non-conforming body is dropped, warn-logged, and the reader remains attached and processes the next valid frame normally.
- A throwing consumer handler is caught and warn-logged; sibling handlers for the same event still run and the reader stays attached.
- State is not rolled back when a handler throws — the snapshot reflects the received frame.
- No object carrying IpcStreamMessage's `stream`/`data` envelope keys is passed to any consumer callback.
- All logging goes through getLogger; no console call is introduced anywhere in the module.

### E202607206d6cfaf9:S003:T009 — Implement terminal handling, detach, and the distinct error path

Add terminal detection and teardown. On the terminal signal (the sc1 event mapped from the daemon's `{ phase: 'done' }` at src/daemon/workflow-rpc.ts:184), fire onComplete at most once, set snapshot.done true, then detach — drop handlers and structurally discard all subsequent frames for the operation, so 'stops reporting further progress' is a property of the reader rather than caller discipline. A frame whose stream is 'error' (the daemon's distinct path at :218) takes the failure branch: the reader detaches and sets done true but does NOT fire onComplete — a failed 30-40 minute run must never render as successfully finished. Whether that branch additionally fires onError is fixed by the t1 decision, not decided here: if onError was approved, the branch dispatches it (implemented in t14); if rejected, the failure detaches silently. Abnormal transport close while not done is treated the same way (detach, done true, onComplete not fired), detected via the transport lifecycle signal identified in t2 — never via a timeout on frame silence, since token batches arrive at irregular cadence. Late registration after detach returns void, never throws, and the handler is never invoked; the snapshot stays readable with done true.

**Acceptance checks:**
- onComplete fires exactly once on the terminal signal; a duplicate terminal frame does not re-fire it.
- After the terminal signal the reader is detached: subsequent stage, token, or terminal frames invoke no handler and mutate neither currentStage nor tokensTotal.
- An 'error'-stream frame detaches the reader and sets done true without firing onComplete, and its branch shape matches the t1 decision.
- Abnormal transport close while not done detaches and sets done true without firing onComplete, driven by the transport lifecycle signal from t2 and not by any silence timeout — no timer on frame gaps exists in the code.
- snapshot.done is true after any terminal path and remains true; the snapshot stays readable.
- Registering a handler after detach returns void without throwing, and that handler is never invoked.

### E202607206d6cfaf9:S003:T010 — Build the test fixture harness and the dispatch, filtering and resilience suite

Create the net-new unit test file in the __tests__/ directory beside the module path pinned by t2, with the *.test.ts suffix (convention.detect reports `testFiles: none` for this path, so this is file creation, not an edit), using node:test via tsx. Build the fixtures the LLD names, shared by this Task and t11: a frame-builder producing `{ id, stream, data }` envelopes for 'progress' / 'delta' / 'error' with `id` deliberately varied (including the producer's literal 0) so no test can accidentally depend on it as a correlator; canonical sc1 payload fixtures covering each of the eight observed phases plus an unknown-phase fallback; TokenProgressEvents including tokensDelta === 0 and a token-before-first-stage with null stageId; a fake RPC client stand-in shaped to the surface mapped in t2; and a log spy over getLogger. Cover the t6/t7/t8 subjects: verbatim stage/token dispatch (ac1), tokensTotal never derived by accumulation, snapshot reads across the pre-terminal lifecycle, operation filtering with two concurrent readers bound to 'workflow.run' and 'analyze.run', decode-miss drop, opaque stageId pass-through, non-monotonic synthesize-attempt/retry indices with no dedup, handler-throw isolation, multiple handlers in registration order with no replay, and no raw-envelope leakage to consumers (ac3).

**Acceptance checks:**
- A new test file exists in the __tests__/ directory beside the t2-pinned module path, with the *.test.ts suffix, using node:test and passing under `npx tsx --test`.
- The frame-builder varies IpcStreamMessage.id across cases (including 0) and at least one test would fail if the reader correlated by id.
- Fixtures cover all eight observed phases, an unknown-phase stage event, tokensDelta === 0, and a token event with null stageId arriving before any stage event.
- Tests assert dispatch of stageId/stageLabel/index/total verbatim and that tokensTotal comes from the frame rather than accumulated tokensDelta.
- Two concurrent readers bound to different ProgressOperations each see only their own frames.
- Tests assert the ac3 set: no object bearing `stream`/`data` envelope keys reaches a consumer callback, non-decoding 'progress' bodies are dropped inside the reader, and WorkflowProgress is absent from every consumer-visible type.
- The log spy asserts a warn on decode-miss and on handler-throw without asserting exact message text.
- Test file follows camelCase free functions / PascalCase types with no class introduced.

### E202607206d6cfaf9:S003:T011 — Add the terminal, error-branch and late-attach unit suite

Extend the t10 file with the suite proving t9's terminal semantics, reusing the t10 fixture harness rather than rebuilding it. Cover: onComplete fires exactly once on the terminal signal; a duplicate terminal frame does not re-fire it; post-terminal stage/token/terminal frames invoke nothing and mutate neither currentStage nor tokensTotal; the 'error'-stream branch sets done true without firing onComplete, matching the t1-decided branch shape; snapshot reads stay valid and done stays true after every terminal path; late registration after detach returns void, never throws, and the handler is never invoked. If t2 identified a usable transport close signal, also cover abnormal close while not done (detach, done true, no onComplete) with the fake client; otherwise record that subject as deferred with the t2 finding as the reason rather than silently omitting it.

**Acceptance checks:**
- Tests assert the ac2 set: onComplete fires exactly once, duplicate terminal does not re-fire, post-terminal frames mutate nothing and invoke nothing, error termination sets done without onComplete, late attach is inert.
- The error-branch assertions match the t1-decided branch shape rather than assuming silent detach.
- Snapshot reads after each terminal path return done true and remain readable.
- The abnormal-close subject is either covered with the fake client or explicitly recorded as deferred with the t2 finding as the reason.
- The suite reuses the t10 fixture harness — the frame-builder and fake client are not duplicated.
- The suite passes under `npx tsx --test` alongside t10's.

### E202607206d6cfaf9:S003:T012 — Attach the reader to the RPC client behind a feature flag

Wire the reader into the RPC client at the seam mapped in t2, so a caller driving 'workflow.run' or 'analyze.run' obtains a reader bound to that operation and inbound frames reach the decode path. This is the first Task that changes observable client behaviour. Gate it behind the `insrc-progress-reader-enabled` prerequisite flag so it can be turned off without reverting code — the LLD notes no flag mechanism was surfaced by any grounding bundle, so confirming or creating that mechanism is part of this Task, not an assumption. No daemon-side file is touched: WorkflowProgress, the eight phase sites, the transport binding at :238, the error frame at :218, and the IpcStreamKind / IpcStreamMessage wire types all keep their current shapes, and no new wire literal or IpcStreamKind member is introduced.

**Acceptance checks:**
- A caller driving 'workflow.run' or 'analyze.run' can obtain a reader bound to that operation, and inbound frames reach the decode path.
- With the flag off, a spy over the decode path records zero invocations across a driven operation and no reader object is constructed.
- The flag mechanism is confirmed to exist (or is created in this Task) rather than referenced as if pre-existing.
- No file under src/daemon/ and no wire type in src/shared/types.ts is modified — verified by diff.
- The full test sweep passes with the flag both on and off.

### E202607206d6cfaf9:S003:T013 — Add the release() primitive to DaemonProgressReader

CONTINGENT on t1: run only if the sharedContract.methodAdd amendment for `release()` was approved; if rejected, this Task does not run. Add `release(): void` to DaemonProgressReader: detach early, drop handlers, stop decoding for the bound operation. It closes the only structural weakness the judgment found in a1 — a consumer that abandons a 30-40 minute operation currently has no exit short of completion, which is a real leak at those durations. Additive and non-breaking: no existing member changes signature, sc1 is untouched, the wire format is untouched, and sc3's consumedByStories is empty, so the mirroring fork adopts it without changing any call it already makes. Reuses the same detach path as t9's terminal handling rather than introducing a second teardown route.

**Acceptance checks:**
- release() is added to DaemonProgressReader with the t1-approved signature and no existing member's signature changes.
- release() detaches via the same code path as terminal handling — handlers dropped, decoding stopped for the operation, subsequent frames mutate nothing.
- release() after the reader is already detached is a no-op and does not throw; onComplete is not fired by release().
- Unit tests cover early release mid-operation and double-release, reusing the t10 fixture harness.
- sc1 is untouched and no IpcStreamKind member or wire literal is added.

### E202607206d6cfaf9:S003:T014 — Add the onError() member and a named failure payload type

CONTINGENT on t1: run only if the sharedContract.methodAdd amendment for `onError()` was approved; if rejected, this Task does not run and t9's silent-detach behaviour stands. Add `onError(handler: (error: NamedFailureType) => void): void` and give the daemon's `{ error: string; recoverable: boolean }` payload a named exported type, closing the open question that no throwable/failure type is pinned anywhere in the contract. This makes a failed run representable: without it the reader must not fire onComplete on failure, leaving the consumer unable to distinguish failure from a stalled operation — and silence carries no signal, since token frames arrive at irregular batch cadence. Wire it to the existing error branch from t9 (which already detaches and sets done without firing onComplete); the 'error' stream kind already exists and is already produced, so no wire change is involved.

**Acceptance checks:**
- The `{ error: string; recoverable: boolean }` failure payload has a named exported type, satisfying the open question that no error type was pinned.
- onError fires on the 'error'-stream branch and on no other path; onComplete still does not fire for a failed run.
- onError and onComplete are mutually exclusive for a given operation — a unit test asserts a failed run fires exactly one and never both.
- No existing sc3 member changes signature, sc1 is untouched, and no IpcStreamKind member or wire literal is added.
- Tests reuse the t10 fixture harness rather than rebuilding the frame-builder.

### E202607206d6cfaf9:S003:T015 — Add the daemon-driven integration test for the reader

Prove the reader decodes frames the real daemon actually emits, not only hand-written fixtures — this is what stops the unit suite from passing against a fixture shape that has drifted from the producer at src/daemon/workflow-rpc.ts:238. Drive a short 'workflow.run' through the IPC registration at src/daemon/index.ts:1423 with a reader attached, extending the established idiom at src/daemon/__tests__/analyze-rpc.live.test.ts:469-471 (collect frames, filter by `stream === 'progress'`, assert on the filtered set) and ADDING the ac2 assertion that no progress surfaces after the terminal frame. Also drive a short 'analyze.run' against its sibling construction site at src/daemon/analyze-rpc.ts:521 and assert the reader decodes its frames identically — sc1 defines both operations, so leaving analyze.run to synthetic fixtures alone would let a shape drift on that side pass the whole plan; the analyze-rpc.live.test.ts idiom already sits on that path, so the harness cost is small. Also cover: correlation surviving the server-side id override (precedent at handoff-stream.test.ts:224), and shared-socket noise from a non-uniform 'progress' producer leaving a bound reader unaffected. The abnormal-close subject is included only if t2 identified a usable close signal; otherwise it is recorded as deferred with the reason. Gate behind INSRC_LIVE_TESTS=1 and skip cleanly when unset, matching analyze-rpc.live.test.ts.

**Acceptance checks:**
- A driven 'workflow.run' with a reader attached observes at least one stage event and the terminal completion through the reader API.
- A driven short 'analyze.run' with a reader attached decodes stage and token events identically, or analyze.run is explicitly recorded as deferred with the reason.
- The test asserts no progress is surfaced to the consumer after the terminal frame.
- Correlation is verified to survive the server-side rewrite of the producer's literal `id: 0`.
- A concurrent non-uniform 'progress' producer on the shared socket leaves the bound reader's state and dispatch unaffected.
- A frame-collector compares raw IpcStreamMessages on the socket against events dispatched to the consumer, showing the reader saw the envelopes and the consumer saw only decoded sc1 events.
- The suite gates behind INSRC_LIVE_TESTS=1 and skips cleanly when unset; both workflow inputs are short and deterministic, not 30-40 minute runs.
- The abnormal-close subject is either implemented or explicitly recorded as deferred with the t2 finding as the reason.

### E202607206d6cfaf9:S003:T016 — Publish the final sc3 type surface for the IDE fork to mirror

Final, deliberately non-rollbackable step. Publish the settled DaemonProgressReader + DaemonProgressSnapshot type surface — including whichever of release() and onError() t1 approved — as the contract the IDE fork mirrors, recording explicitly that the fork supplies the implementation and render path (out of scope for this repo). Do this only after the unit and integration suites pass: once mirrored, renaming or narrowing these types breaks lock-step across insrc / insrc-ide and stops being cheaply rollbackable. Record the t1 amendment outcomes, the t2 accessor decision, and the residual open questions (the flag-infrastructure note, and any subject deferred for want of a transport close signal or a live analyze.run) alongside the published surface so the fork inherits an accurate picture rather than a clean-looking one.

**Acceptance checks:**
- The full test sweep passes before publication; publication does not precede green t10, t11 and t15 suites.
- The published surface matches the shipped code exactly, including every t1-approved member and no unapproved member.
- The snapshot accessor is recorded as either a published sc3 member or an s3-internal affordance, with the t2 profiling finding as the stated reason.
- The published record states that the fork owns implementation and render, and that this repo owns only the type surface plus the sc1 wire contract.
- Amendment outcomes for release() and onError() are recorded as approved or rejected, not left ambiguous.
- Residual open questions — the unconfirmed feature-flag infrastructure and any deferred integration subject — are recorded with the published surface.
- No sc1 type and no IpcStreamKind member is changed by this Task.

## Test-strategy coverage

| LLD strategy item | Covered by |
| :--- | :--- |
| DaemonProgressReader.onStage — dispatches a decoded StageProgressEvent with stageId/stageLabel/index/total verbatim (ac1, ac3) | `t7`, `t10` |
| DaemonProgressReader.onToken — dispatches TokenProgressEvent with tokensDelta/tokensTotal plus nullable owning stageId; asserts tokensTotal is taken from the frame and never derived by accumulating tokensDelta (ac1) | `t7`, `t10` |
| DaemonProgressReader.onComplete — fires exactly once on the terminal `{ phase: 'done' }`-derived frame, then the reader detaches (ac2) | `t9`, `t11` |
| Post-terminal frame suppression — stage/token/duplicate-done frames delivered after detach mutate nothing and invoke no handler, proving 'stops reporting' is structural, not caller discipline (ac2) | `t9`, `t11` |
| DaemonProgressSnapshot reads — initial `{ currentStage: null, tokensTotal: 0, done: false }`; currentStage tracks last stage event; done stays true after terminal; read is side-effect free (ac1, ac2) | `t6`, `t10`, `t11` |
| Operation filtering — a reader bound to 'workflow.run' ignores frames whose sc1 operation is 'analyze.run', and two concurrent readers on one client each see only their own (s5 edgeCase; invariant: never correlate by IpcStreamMessage.id) | `t6`, `t7`, `t10` |
| Decode-miss handling — a 'progress'-kind frame whose body is not a sc1 ProgressEvent (raw-shaped, as still emitted by src/daemon/todos-rpc.ts:1146 and src/daemon/tools/types.ts:56) is dropped, warn-logged, reader stays attached (s5 errorCase 2) | `t8`, `t10` |
| Error-stream branch — an 'error'-kind frame detaches the reader and sets done WITHOUT firing onComplete (s5 errorCase 1; s4 not-invoked-on-failure) | `t9`, `t11`, `t14` |
| Opaque stageId — a stage frame carrying a stageId outside the eight observed phases is dispatched normally and rendered via its raw stageLabel, never dropped or thrown (invariant c2) | `t7`, `t10` |
| Non-monotonic stage index — the synthesize-attempt/synthesize-retry pair (src/daemon/workflow-rpc.ts:151,:166) produces repeating/non-advancing indices; both dispatch, no dedup | `t10` |
| Handler isolation — a throwing consumer handler is caught and warn-logged, sibling handlers for the same event still run, reader stays attached, snapshot already updated before dispatch is not rolled back (s5 errorCase 3) | `t8`, `t10` |
| Late attach — registering a handler after the terminal signal returns void, never throws, handler never invoked; consumer observes final state via snapshot.done === true | `t9`, `t11` |
| Multiple handlers per event fire in registration order; past events are NOT replayed to a late-registered handler | `t10` |
| No raw frame leakage — assert handlers receive only typed sc1 events and that no IpcStreamMessage-shaped object (no `stream`/`data` keys) ever reaches a consumer callback (ac3) | `t5`, `t8`, `t10` |
| A driven 'workflow.run' through the daemon IPC registration at src/daemon/index.ts:1423, with a reader attached: assert at least one stage event and the terminal completion are observed, extending the established idiom from src/daemon/__tests__/analyze-rpc.live.test.ts:469-471 (collect frames, filter by `stream === 'progress'`, assert on the filtered set) and ADDING the assertion that no progress is surfaced after the terminal frame (ac1, ac2) | `t15` |
| Server-side frame-id override does not break correlation — reader still routes correctly even though the producer's literal `id: 0` (src/daemon/workflow-rpc.ts:238) is rewritten on write, per the precedent at src/daemon/__tests__/handoff-stream.test.ts:224 | `t15` |
| Shared-socket noise — a reader bound to 'workflow.run' is unaffected by concurrent 'progress'-kind frames from a non-uniform producer, confirming the operation filter holds against real traffic rather than only synthetic frames | `t15` |
| Abnormal stream close mid-run: reader detaches, done becomes true, onComplete does NOT fire (s5 errorCase 4). NOTE: contingent on the src/cli/client.ts close/teardown signal, unprofiled by s1 — must be re-confirmed before this subject is implementable | `t2`, `t9`, `t11`, `t15` |

## Citations

- **[[c1]]** `prior-artifact` `LLD s3 sharedContract sc3 — DaemonProgressReader interfaceSketch (onStage / onToken / onComplete, all returning void; consumers see decoded sc1 events only)`
- **[[c2]]** `prior-artifact` `LLD s3 acceptanceCriteria ac2 — terminal semantics: onComplete fires exactly once then the reader stops reporting further progress; failure must not render as successful completion`
- **[[c3]]** `prior-artifact` `LLD s3 boundary.internal — per-operation reader state is private to s3; snapshot accessor exported-vs-internal deferred pending a src/cli/client.ts profile`
- **[[c4]]** `prior-artifact` `LLD s3 storyDependsOn ['s1'] + sharedContract sc1 — ProgressOperation / StageProgressEvent / TokenProgressEvent / ProgressEvent land in src/shared/types.ts beside IpcStreamKind; no local stubbing permitted`
- **[[c5]]** `prior-artifact` `LLD s3 invariants — correlate by the sc1 `operation` field plus reader lifetime, never by IpcStreamMessage.id (server overrides it on write, asserted at src/daemon/__tests__/handoff-stream.test.ts:224); tokensTotal taken verbatim, never accumulated from tokensDelta`
- **[[c6]]** `prior-artifact` `LLD s3 errorCases 1-4 — error-stream branch, decode-miss drop with warn log, handler-throw isolation, and abnormal transport close (contingent on an unprofiled close signal)`
- **[[c7]]** `prior-artifact` `LLD s3 testStrategy — net-new node:test unit suite in the sibling __tests__/ dir (convention.detect reports testFiles: none for this path) with a shared frame-builder, sc1 payload fixtures, fake client and getLogger spy`
- **[[c8]]** `prior-artifact` `LLD s3 testStrategy integration item — drive workflow.run through src/daemon/index.ts:1423 and analyze.run via src/daemon/analyze-rpc.ts:521, extending the src/daemon/__tests__/analyze-rpc.live.test.ts:469-471 idiom behind INSRC_LIVE_TESTS=1`
- **[[c9]]** `analyze-bundle` `s1 grounding bundle — src/cli/client.ts `rpc` unprofiled (resolved 0.159); workflow-rpc.ts:61/:110-184/:218/:238 producer sites; shared/types.ts:732/:734-738; truncated search.text consumer sweep; excluded hits at src/cli/services/index.ts:69 and setup.ts:83-101; no feature-flag mechanism surfaced`
- **[[c10]]** `prior-artifact` `LLD s3 amendments — pending sharedContract.methodAdd `release(): void` on sc3 (early detach for abandoned 30-40 minute operations)`
- **[[c11]]** `prior-artifact` `LLD s3 amendments — pending sharedContract.methodAdd `onError(handler)` on sc3 plus a named type for the daemon's `{ error: string; recoverable: boolean }` failure payload`
