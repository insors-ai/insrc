<!-- insrc:artifact PLAN-6d6cfaf9a9b14bd4-s2 -->

# Plan: E202607206d6cfaf9:S002

**Epic:** `stream-incremental-progress-from-daemon-calling`
**LLD run:** `wf-1784545043599-qvqzrb`
**LLD effective hash:** `2699deb16227...`

## Tasks

| # | Task | Size | Depends on | Tests | Derived from |
| :--- | :--- | :--- | :--- | :--- | :--- |
| 1 | **`t1`** Re-resolve the unverified insertion points and invariants (read-only gate) | S | — | smoke: read-only gate: `npm run build` and the full existing test sweep stay green, confirming no source file was modified by the discovery pass | [[c4]] [[c5]] [[c7]] |
| 2 | **`t2`** Declare the net-new progress type surface (additive, no call sites) | S | — | unit: contract: McpProgressNotification pins method to the 'notifications/progress' literal with params.progressToken and params.progress required and total/message optional — a type-level assertion that fails if progress is made optional; unit: contract: LongRunningToolMeta { progressToken?: string \\| number } typechecks reproduced unchanged from the sc2 sketch under exactOptionalPropertyTypes; unit: contract: ProgressSink.report accepts a representative instance of each sc1 ProgressEvent variant verbatim and is declared returning void; smoke: additive-declarations build guard: `npm run build` succeeds with zero call sites and the existing sweep is unchanged | [[c1]] [[c4]] [[c6]] |
| 3 | **`t3`** Implement mcpProgressSink: the gate, the ProgressEvent mapping, and the non-blocking emit | M | `t2` | unit: mcpProgressSink gate: returns a token-bearing sink for a string token, a number token, 0 and '' — and NOOP_PROGRESS_SINK for undefined, null, boolean, array and object — asserted on WHICH sink is returned; unit: ProgressSink.report stage branch: params.message from stageLabel, params.progress from index, params.total present for total: number and omitted entirely for total: null; unit: ProgressSink.report token branch: params.progress derived from tokensTotal and params.message from tokensDelta against a synthetic TokenProgressEvent; unit: monotonic-progress derivation reached through report(): params.progress is non-decreasing across an interleaved stage/token sequence containing a regressing stage index; unit: unknown-kind default arm: no notification, one debug log, progress counter unchanged, no throw; unit: fire-and-forget emit: report() returns before a never-resolving notification promise settles, and a throwing/rejecting server double is swallowed with one warn log while subsequent frames are still attempted | [[c1]] [[c2]] [[c3]] [[c5]] |
| 4 | **`t4`** Close the LLD bookkeeping items surfaced by the sink implementation | S | `t3` | smoke: bookkeeping-only guard: `npm run build` succeeds and the full sweep stays green, proving neither correction changed sink behaviour; unit: if EmissionFault is declared as a concrete type, a type-level assertion pins it and confirms it is not exported into handler-visible surface | [[c1]] [[c5]] |
| 5 | **`t5`** Unit and contract tests for the sink, against synthetic sc1 events | M | `t3` | unit: mcpProgressSink gate matrix over string / number / 0 / '' / undefined / null / boolean / array / object, asserting the identity of the returned sink; unit: NOOP_PROGRESS_SINK emits nothing for the invocation lifetime across a full synthetic frame sequence on the fake McpServer; unit: verbatim token echo: every notification from a token-bearing sink carries params.progressToken strictly equal to the supplied string and number token; unit: ProgressSink.report branch coverage on event.kind: stage-branch construction, token-branch construction against synthetic TokenProgressEvents, and the unknown-kind default arm; unit: monotonic-progress derivation through report(): clamping across an interleaved sequence with a regressing stage index, plus total omission when sc1 total is null; unit: fire-and-forget property: with a never-resolving notification double, report() returns and a subsequent report() is still accepted — an awaiting implementation fails; unit: emission-fault swallow path asserted via the log spy: warn on throw/reject, debug on unknown kind, no throw out of report(); unit: contract type assertions: LongRunningToolMeta unchanged, McpProgressNotification with params.progress required, ProgressSink.report accepting both sc1 variants verbatim | [[c1]] [[c3]] [[c7]] |
| 6 | **`t6`** Add the additive _meta field to the three tool envelopes | S | `t2` | unit: contract: WorkflowStepMcpEnvelope / StepMcpEnvelope / BuildStepMcpEnvelope each accept _meta present-with-token, _meta absent, and `_meta: {}` fixtures under exactOptionalPropertyTypes; unit: contract: LongRunningToolMeta.progressToken is optional and _meta is optional on all three envelopes, so an existing no-_meta caller fixture compiles unchanged; smoke: additive-field regression guard: `npm run build` and the full sweep stay green with zero call-site updates | [[c1]] [[c3]] |
| 7 | **`t7`** Reader lifecycle helper, proven end to end on workflow-step | M | `t1`, `t3`, `t6` | integration: workflow-step handler registered by buildInsrcMcpServer constructs exactly one sink per request from _meta.progressToken before the stubbed daemon operation starts — asserted via a spy on the sink factory; integration: per-invocation frame reader lifecycle on workflow-step: attach, in-order dispatch of the scripted sc1 sequence, settled-flag discard of a late frame, and teardown on both the success path and the throw-mid-stream path with the daemon error propagating unmodified; integration: stream-end / socket-close mid-operation runs the same teardown and emits no error of its own; integration: token-less workflow-step request still attaches the reader — the NOOP sink consumes the scripted frames to completion rather than the attachment being skipped | [[c2]] [[c3]] [[c4]] |
| 8 | **`t8`** Apply the lifecycle helper to analyze-step and build-step | S | `t7` | integration: analyze-step and build-step handlers each construct exactly one sink per request from _meta before the stubbed daemon operation starts, asserted via the sink-factory spy; integration: both servers reuse the t7 lifecycle helper unchanged: the same attach / settled-flag / teardown assertions pass per server with no per-server reimplementation; unit: McpProgressNotification is absent from handler code — a source-level assertion that handlers hold only a ProgressSink and call report() | [[c2]] [[c3]] [[c4]] |
| 9 | **`t9`** Integration tests for the wiring, correlation, and teardown | M | `t7`, `t8` | integration: buildInsrcMcpServer tool-handler registration path: the sink-factory spy asserts WHICH sink was constructed for a token-bearing request — an always-NOOP wiring regression fails; integration: _meta acceptance matrix: no-_meta, `_meta: {}` with progressToken absent, and non-conforming-token requests each emit zero notifications with a tool result identical to the token-bearing run; integration: token-less path consumes the scripted frame sequence to completion — every stub frame read, proving the reader was attached rather than skipped; integration: concurrent-invocation correlation: two in-flight requests with different tokens receive strictly disjoint correctly-keyed streams despite the literal id: 0 on every frame; integration: two concurrent invocations supplying the SAME token are both honoured, token echoed verbatim, no deduplication; integration: teardown coverage: throw-mid-stream and stream-end fixtures each leave no reader attached; a token-bearing invocation settling before any frame produces zero notifications, a normal result, and clean teardown; integration: stage-only scripted run delivers more than one notification before the tool result and zero token notifications, without error | [[c3]] [[c7]] |
| 10 | **`t10`** Smoke guard for the unverified analyze.run binding | S | `t1`, `t8` | smoke: insrc_analyze_step driven with a progressToken over an analyze.run operation against a stubbed analyze.run frame source: the outcome is one of identical forwarding or zero notifications with a normal tool result, and never a partial, malformed, mis-keyed notification or a failed tool call | [[c1]] [[c4]] |
| 11 | **`t11`** End-to-end verification and dormant-token-branch record | S | `t9`, `t10` | live: real long-running run through the MCP server with a progressToken emits notifications/progress keyed to that token as it advances (gated on s1's sc1 ProgressEvent reshape); live: the same real operation run without a progressToken completes normally with zero notifications; live: two overlapping real invocations stay correctly keyed to their own tokens despite the id: 0 framing; smoke: observation-only guard: the full sweep stays green and no source file changed as part of the verification | [[c1]] [[c2]] [[c5]] |

### E202607206d6cfaf9:S002:T001 — Re-resolve the unverified insertion points and invariants (read-only gate)

Blocking discovery Task, no code changes. Resolve the real parameter lists of buildInsrcMcpServer and runInsrcMcpStdio with symbol.locate and record where the three long-running tools are registered — s1's module.profile returned exports: [] / entrypoints: [] for src/mcp/workflow-step and symbol.locate found no entity for insrc_workflow_step, so no downstream Task may assume a known registration file. Open src/daemon/workflow-rpc.ts firsthand and confirm the onProgress declaration (~line 75) and the transport binding (~line 238, send({ id: 0, stream: 'progress', data: f })) — the LLD asserts this seam from s1 but the discovery pass did not re-ground it. Run a targeted search.text over src/daemon/analyze-rpc.ts to establish whether analyze.run frames reach the wire through the same stream:'progress' binding; if they do not, record the deviation and narrow the t8 rollout to workflow.run only. Enumerate src/mcp/workflow-step/__tests__ — the directory exists per module.profile but its contents were never listed, so the 'no test file to extend' premise must be checked, not assumed. Finally, retire the LLD's own open question: five of nine invariantsToPreserve (2, 3, 4, 5, 8) are grounded only in HLD text and the alternative judgment, never in a bundle showing the invariant holds in code today — and those are exactly what t3 and t7 are checked against. Confirming them here, while src/mcp/ and src/daemon/workflow-rpc.ts are already open, is nearly free; discovering one is false at t7 is not. Trap: runWorkflow at src/cli/command.ts:126 is the CLI dispatcher, not the workflow runner entry — do not target it.

**Acceptance checks:**
- The actual signatures of buildInsrcMcpServer and runInsrcMcpStdio (and the shape of BuildInsrcMcpServerOpts) are recorded verbatim from source, replacing the LLD's 'UNVERIFIED SHAPE' placeholder.
- The file and line where each of the three long-running tools (workflow-step, analyze-step, build-step) is registered, and where its request envelope first becomes observable, is recorded.
- The onProgress declaration and the send({ id: 0, stream: 'progress', data: f }) binding in src/daemon/workflow-rpc.ts are confirmed present with their current line numbers, or the discrepancy is recorded.
- A written verdict on whether src/daemon/analyze-rpc.ts emits through the same stream:'progress' binding: confirmed / differs / absent — with the rollout narrowing decision for t8 stated explicitly.
- The contents of src/mcp/workflow-step/__tests__ are enumerated and the target location for the new test file is fixed (src/mcp/__tests__/ per the LLD, or a stated deviation).
- Each of invariantsToPreserve 2, 3, 4, 5 and 8 is either confirmed against current source or recorded as unverified with the affected downstream Task named explicitly.
- No source file is modified by this Task.

### E202607206d6cfaf9:S002:T002 — Declare the net-new progress type surface (additive, no call sites)

Add the sc2 type surface to src/mcp/ as free functions plus interfaces — confirmed net-new by a repo-wide grep for progressToken | notifications/progress | sendNotification that returned zero hits, so there is nothing to extend in place. Declare: interface ProgressSink { report(event: ProgressEvent): void }, declare const NOOP_PROGRESS_SINK: ProgressSink, the mcpProgressSink(server, progressToken) factory signature, interface LongRunningToolMeta { progressToken?: string | number }, and interface McpProgressNotification with params.progress kept REQUIRED (the a4 narrowing that made it optional was explicitly rejected). ProgressEvent is imported verbatim from sc1 — not redeclared, not widened, not narrowed. Purely additive declarations with no call sites; the build's behaviour is unchanged. Naming follows the module actually being edited: camelCase functions, PascalCase types, kebab-case filename (state-store.ts / questions-gate.ts are the attested siblings). Note the s1 correction: the 'class sample size 0' rationale does NOT hold for src/mcp/workflow-step, which has 32 unanimously-PascalCase classes — free functions remain the design choice, but do not justify it with that sample size.

**Acceptance checks:**
- ProgressSink, NOOP_PROGRESS_SINK, mcpProgressSink, LongRunningToolMeta, and McpProgressNotification are declared in src/mcp/ and compile under strict / exactOptionalPropertyTypes / noUncheckedIndexedAccess.
- McpProgressNotification.method is the 'notifications/progress' string literal; params.progressToken and params.progress are required; params.total and params.message are optional.
- ProgressSink.report takes the sc1 ProgressEvent union by import, with no field added, narrowed, or reinterpreted; sc1 is not redeclared locally.
- ProgressSink.report is declared as returning void — the signature admits no awaitable result.
- No class is introduced; every added symbol is a camelCase free function, a PascalCase type, or a SCREAMING_SNAKE const, and the new file name is kebab-case.
- The declarations have zero call sites — `npm run build` succeeds and no existing behaviour changes.

### E202607206d6cfaf9:S002:T003 — Implement mcpProgressSink: the gate, the ProgressEvent mapping, and the non-blocking emit

Implement the factory and the token-bearing sink behind the t2 declarations. The gate is a typeof check evaluated EXACTLY ONCE at construction: a string or number token yields a token-bearing sink closing over the live MCP server (following the makeSamplerFromMcpServer reach-back precedent — re-resolve src/mcp/sampling-bridge.ts first, it did not surface in the s1 discovery pass and its listing as a ProgressSink call site is a known LLD labelling error); anything else, including undefined, null, boolean, object, and array, yields NOOP_PROGRESS_SINK. Never truthiness: the number 0 and the empty string are PRESENT. report() is the single branch point on event.kind — 'stage' derives params.progress from index, params.total from total when non-null (OMITTED, never null or 0, when null) and params.message from stageLabel; 'token' derives params.progress from tokensTotal and params.message from tokensDelta, with params.progress populated on this variant too. params.progress is clamped non-decreasing across an invocation, including a regressing stage index. An unrecognised kind falls through to a default arm that emits nothing, logs once at debug, and does not advance the counter. report() is fire-and-forget: the notification call is NOT awaited, so a 30–40 minute run never inherits notification transport latency and a high-frequency token burst applies no backpressure to the daemon operation. Emission faults are caught on both paths (synchronous throw and promise rejection, the latter via a rejection handler attached to the un-awaited promise), logged once at warn via getLogger, and swallowed — report() returns void and never throws, and the sink is not torn down. Still no call sites.

**Acceptance checks:**
- mcpProgressSink returns a non-NOOP sink for a string token, a number token, the number 0, and the empty string; and returns NOOP_PROGRESS_SINK for undefined, null, booleans, arrays, and objects.
- Every notification a token-bearing sink emits carries params.progressToken strictly equal to the supplied token, echoed verbatim with no synthesis and no daemon-internal identifier mixed in.
- The stage branch omits params.total entirely when the sc1 total is null, and always populates params.progress.
- The token branch populates params.progress from tokensTotal and params.message from tokensDelta — params.progress is never omitted on the token variant.
- params.progress is non-decreasing across a mixed stage/token sequence that includes a regressing stage index.
- An event with an unrecognised kind produces no notification, logs at debug, leaves the progress counter unchanged, and does not throw.
- No `await` sits on the server notification call anywhere in the emission path; rejection is handled by an attached handler rather than by awaiting.
- A server notification call that throws or rejects is swallowed, logged once at warn, and does not prevent subsequent frames from being attempted; report() returns void in every case.
- The McpProgressNotification object literal is constructed inside mcpProgressSink's closure and the type is not exported from the module.
- The makeSamplerFromMcpServer precedent in src/mcp/sampling-bridge.ts is re-resolved and the closure shape matches it, or the deviation is recorded.

### E202607206d6cfaf9:S002:T004 — Close the LLD bookkeeping items surfaced by the sink implementation

Two small corrections to the design record, resolved at the point where the underlying code actually exists rather than deferred to the end of the plan. First: EmissionFault is referenced by the LLD but has no definition site — now that t3 has implemented the catch-and-swallow path, either declare it as a concrete type in src/mcp/ or restate it in the docs as a caught-and-swallowed condition rather than a named type, whichever matches what t3 actually built. Second: the ProgressSink.callSites entry listing src/mcp/sampling-bridge.ts is a labelling error — t3 established that file as a reach-back precedent for the closure shape, not as a call site — correct the entry. Neither item depends on the wiring, and holding them until after the integration tests would leave the design record wrong for the whole middle of the plan.

**Acceptance checks:**
- EmissionFault is either declared as a concrete type in src/mcp/ or restated in the docs as a caught-and-swallowed condition, and the chosen resolution matches what t3 implemented.
- The ProgressSink.callSites entry for src/mcp/sampling-bridge.ts is corrected to reflect its actual role as a reach-back precedent.
- `npm run build` succeeds and the full test sweep stays green — no behavioural change is introduced by either correction.

### E202607206d6cfaf9:S002:T005 — Unit and contract tests for the sink, against synthetic sc1 events

Add the new test file at the location fixed by t1 (src/mcp/__tests__/ per the LLD), following the analyze-step-handler.test.ts pattern: node:test with node:assert/strict, hand-written doubles, no external assertion or mocking library. Fixtures are all hand-built because there is no producer to record from: a fake McpServer recording method + params and switchable to throw, to reject, or to return a deliberately never-resolving promise; StageProgressEvent variants with total: number, total: null, and a regressing index; synthetic TokenProgressEvents (all eight daemon emission sites are stage-shaped, so this variant has no producer today); a malformed-kind event; and a log spy. Cover the whole t3 surface — gate resolution including the 0 / '' falsy-but-present cases and the non-conforming-type degradation, both mapping branches, monotonic clamping, total omission, verbatim token echo, the unknown-kind default arm, the swallow-and-log emission fault, and the fire-and-forget property that no other test can catch: an implementation that awaits the emit would satisfy every other check in this plan while coupling a 30–40 minute run to transport latency. Add the contract-level type assertions: LongRunningToolMeta reproduced unchanged, McpProgressNotification with progress required, ProgressSink.report accepting both sc1 variants verbatim. These tests pass against the not-yet-wired implementation.

**Acceptance checks:**
- A new test file exists at the t1-fixed location, uses node:test + node:assert/strict, and runs green under `npx tsx --test 'src/mcp/**/*.test.ts'`.
- Gate tests cover string, number, 0, '', undefined, null, boolean, array, and object tokens and assert WHICH sink was returned, not merely emission counts.
- NOOP_PROGRESS_SINK emits zero notifications across a full synthetic frame sequence.
- Stage-branch, token-branch, interleaved-sequence, total-null-omission, and regressing-index clamping cases each have an assertion.
- With a notification double that returns a never-resolving promise, report() returns before that promise settles and a subsequent report() call is still accepted — an awaiting implementation fails this test.
- The unknown-kind default arm and the emission-fault swallow path are asserted, including that the logged level is debug and warn respectively and that neither throws.
- Type-level contract assertions compile under the project's strict settings and would fail if params.progress were made optional or if ProgressSink.report narrowed the sc1 union.
- No external mocking or assertion library is added to package.json.

### E202607206d6cfaf9:S002:T006 — Add the additive _meta field to the three tool envelopes

Add `readonly _meta?: LongRunningToolMeta | undefined` to WorkflowStepMcpEnvelope (src/mcp/workflow-step/types.ts), StepMcpEnvelope (src/mcp/analyze-step/types.ts), and BuildStepMcpEnvelope (src/mcp/build-step/types.ts). Concept.resolve confirmed these are three structurally identical siblings, so this is one small change across three files, not three separate pieces of work. Additive only: no existing field is renamed, retyped, or made required, so every current caller — Claude Code and Codex included — keeps compiling and keeps behaving identically by taking the absent-token path. This is the field-add half of the a2 sharing argument: one opt-in shape inherited by all three servers rather than each growing its own.

**Acceptance checks:**
- All three envelope types carry the optional readonly _meta field typed as LongRunningToolMeta | undefined.
- No existing field on any of the three envelopes changes name, type, or optionality.
- `npm run build` succeeds and the full test sweep stays green with no call-site updates required.
- A request fixture omitting _meta, and one carrying `_meta: {}` with progressToken absent, both typecheck against all three envelopes under exactOptionalPropertyTypes.

### E202607206d6cfaf9:S002:T007 — Reader lifecycle helper, proven end to end on workflow-step

The subtle half of the wiring, done once on the one operation whose stream:'progress' binding t1 confirms. Build the per-invocation reader lifecycle mechanism — attach a frame reader to the daemon operation's stream:'progress' frames for the duration of the invocation, tear it down when the invocation settles on BOTH the success and the error path via a finally-equivalent so the absence of teardown is structurally unreachable rather than reactively detected, and set a settled flag that causes any late frame to be discarded without calling report(). Stream end / socket close mid-operation runs the same teardown and contributes no error of its own. Correlation is by per-invocation lexical closure, not from the wire: every frame carries a literal id: 0 and cannot be correlated from its contents, so the reader must close over its own request's sink. Then apply the helper to workflow-step only: read the token off request _meta and construct EXACTLY ONE sink via mcpProgressSink before the daemon operation starts. Per module.profile the wiring spans two files — the request entry (handleWorkflowStep in handler.ts) where _meta first becomes observable, and the per-phase dispatch point (handleStep in phases/step.ts). No daemon-side file is modified: the id: 0 framing and the line-238 binding stay exactly as they are. GATED ON s1: until the daemon's `data` payload is a sc1 ProgressEvent rather than WorkflowProgress, the reader has nothing conforming to consume.

**Acceptance checks:**
- The workflow-step handler constructs exactly one ProgressSink per request, before the daemon operation is invoked, from the token read off request _meta.
- The frame reader closes over its own invocation's sink; no shared or module-level sink, registry, or map is introduced.
- Subscription teardown runs on both the success and the error path via a structurally unavoidable finally-equivalent, and the daemon operation's own error propagates to the caller unmodified.
- A frame arriving after the invocation has settled is discarded without calling report() and without re-attaching the subscription.
- Stream end or socket close mid-operation runs the same teardown path and emits no error of its own.
- The reader is attached on the token-less path too — the NOOP sink receives the frames rather than the attachment being skipped.
- No file under src/daemon/ is modified; the send({ id: 0, stream: 'progress', data: f }) binding is byte-identical to before, and no new IpcStreamKind is added.
- This Task is not merged before s1's sc1 ProgressEvent reshape is merged.

### E202607206d6cfaf9:S002:T008 — Apply the lifecycle helper to analyze-step and build-step

Mechanical repetition of the t7 mechanism at the two remaining servers, kept separate so a per-server wiring omission is distinguishable in review from a lifecycle bug. At each of the analyze-step and build-step handlers registered inside buildInsrcMcpServer (at the sites established by t1), read the token off request _meta, construct exactly one sink via mcpProgressSink before the daemon operation starts, and attach the t7 reader helper — reusing it verbatim, not reimplementing the attach/settle/teardown logic per server. Same two-file shape per server: the request entry where _meta first becomes observable, and the per-phase dispatch point. Rollout narrows to workflow.run only — i.e. this Task drops the analyze-step half and records why — if t1 found analyze.run does not share the stream:'progress' binding. Handlers hold a ProgressSink and call report(); the notification type stays confined to the sink module.

**Acceptance checks:**
- The analyze-step and build-step handlers each construct exactly one ProgressSink per request from _meta, before the daemon operation is invoked.
- Both servers reuse the t7 lifecycle helper unchanged — no attach, settled-flag, or teardown logic is reimplemented per server.
- McpProgressNotification does not appear anywhere in handler code — handlers hold a ProgressSink and call report().
- No file under src/daemon/ is modified by this Task.
- If t1 found analyze.run does not share the stream:'progress' binding, the analyze-step wiring is narrowed accordingly and the deviation is recorded in the code.

### E202607206d6cfaf9:S002:T009 — Integration tests for the wiring, correlation, and teardown

Prove what the unit level structurally cannot: that the handler actually reads _meta.progressToken and constructs a token-bearing sink. A wiring mistake that always returns NOOP_PROGRESS_SINK would satisfy ac2 while silently failing ac1, and a report()-was-called assertion would not catch it — so the test must spy on the sink factory and assert WHICH sink was constructed for a token-bearing request. Equally, a wiring that skips attaching the reader entirely when the token is absent would pass every emission-count check while violating the NOOP_PROGRESS_SINK postcondition, so the token-less path must be asserted to consume the frame stream to completion. Fixtures: a stubbed daemon operation emitting a scripted sc1 ProgressEvent sequence then settling (plus a variant that throws mid-stream); a stubbed frame source standing in for the stream:'progress' / id: 0 binding, since s2 makes no daemon-side change and the seam is stubbed rather than driven (src/daemon/__tests__/workflow-rpc.test.ts is the reference for that surface); request envelopes with _meta present-with-token, absent entirely, present-but-progressToken-undefined (`_meta: {}`, a distinct optional-field read path under exactOptionalPropertyTypes), and carrying a non-conforming token; and a stream-end fixture. Cover the lifecycle assertions against t7 and the concurrency assertions against t8.

**Acceptance checks:**
- A test asserts on the sink object constructed for a token-bearing request — an always-NOOP wiring regression fails this test.
- A no-_meta request, a `_meta: {}` request with progressToken absent, and a malformed-token request each produce zero notifications and a tool result identical to the token-bearing run's result.
- On the token-less path the scripted frame sequence is asserted consumed to completion — every stub frame was read — rather than the reader being skipped.
- Two concurrent invocations with different tokens receive strictly disjoint, correctly-keyed notification streams despite every frame carrying id: 0.
- Two concurrent invocations supplying the same token are both honoured, with the token echoed verbatim and no deduplication.
- A daemon operation that throws mid-stream tears down its subscription and leaves no reader attached; a stream-end fixture does the same.
- A token-bearing invocation that settles before any frame arrives produces zero notifications, a normal result, and clean teardown.
- A stage-only scripted run delivers more than one notification before the tool result and zero token notifications, without error.
- The suite runs green under `npx tsx --test 'src/mcp/**/*.test.ts'` with hand-written doubles only.

### E202607206d6cfaf9:S002:T010 — Smoke guard for the unverified analyze.run binding

One guard test for the single assumption that survives t1 as a risk: sc1 declares ProgressOperation as 'workflow.run' | 'analyze.run', but whether src/daemon/analyze-rpc.ts frames reach the wire through the same stream:'progress' binding was unverified going in. Drive the insrc_analyze_step tool surface with a progressToken over an analyze.run operation using a stubbed frame source mirroring the workflow.run stub, and assert the outcome is one of exactly two acceptable states: identical forwarding, or zero notifications with a normal tool result. It must never misbehave — no partial, malformed, or mis-keyed notification, and no failed tool call. If t1 found the binding absent or different, this test documents the degradation explicitly rather than silently passing.

**Acceptance checks:**
- A test drives the analyze-step surface with a progressToken and asserts the outcome is either identical forwarding or zero notifications with an unchanged tool result.
- The test fails if the analyze.run path emits a malformed, partial, or mis-keyed notification, or if it causes the tool call to fail.
- The t1 verdict on the analyze-rpc.ts binding is recorded in the test as a comment, so the intended branch is unambiguous to a later reader.
- The test runs green in the standard sweep regardless of which of the two acceptable states holds.

### E202607206d6cfaf9:S002:T011 — End-to-end verification and dormant-token-branch record

Observation only, no code change — the design-record corrections that once rode along here now live in t4, so this Task is purely a real-run confirmation. Drive a real long-running run through the MCP server and confirm: notifications arrive keyed to the supplied token as the operation advances; a token-less invocation completes normally with zero notifications; and two overlapping invocations stay correctly keyed despite the id: 0 framing. Then record the ac3 split explicitly — the stage half is live on merge, while the token half is contract-complete and unit-tested against synthetic events but has no producer, since all eight daemon emission sites are stage-shaped today. No further s2 change is expected when s1 ships a token emitter; the branch is already implemented and covered, so the follow-up is re-verification, not rework. This Task inherits t7's s1 gate and is in fact strictly more dependent on it: observing real notifications is impossible until the daemon's `data` payload is a sc1 ProgressEvent. Attempted early, it will observe zero conforming notifications against WorkflowProgress-shaped frames and be misread as a wiring defect.

**Acceptance checks:**
- This Task is not executed before s1's sc1 ProgressEvent reshape is merged; running it against WorkflowProgress-shaped frames is explicitly out of scope and is not a t7/t8 defect.
- A real long-running run driven through the MCP server with a progressToken is observed emitting notifications/progress keyed to that token as it advances, and the observation is recorded.
- The same operation run without a progressToken is observed completing normally with zero notifications.
- Two overlapping real invocations are observed staying correctly keyed to their own tokens.
- A written record states that the stage half of ac3 is live and the token half is contract-complete, test-covered against synthetic events, and dormant pending s1's token emitter.
- No source file changes as part of the verification itself.

## Test-strategy coverage

| LLD strategy item | Covered by |
| :--- | :--- |
| mcpProgressSink — returns a token-bearing sink for a defined string\|number token and NOOP_PROGRESS_SINK otherwise | `t3`, `t5` |
| NOOP_PROGRESS_SINK — emits nothing for the invocation lifetime | `t5` |
| ProgressSink.report — the single branch point on event.kind === 'stage' \| 'token' and the notification construction it performs | `t3`, `t5` |
| the private monotonic-progress derivation reached through report() | `t3`, `t5` |
| buildInsrcMcpServer tool-handler registration path — sink construction per request | `t7`, `t8`, `t9` |
| WorkflowStepMcpEnvelope / StepMcpEnvelope / BuildStepMcpEnvelope _meta?: LongRunningToolMeta acceptance (additive field, absent _meta takes the ac2 path) | `t6`, `t9` |
| the per-invocation frame reader: attach, dispatch, settled-flag late-frame discard, teardown on success and on throw | `t7`, `t9` |
| concurrent-invocation correlation — two in-flight requests with different tokens, and two with the same token | `t9` |
| LongRunningToolMeta { progressToken?: string \| number } — reproduced unchanged from the sc2 sketch | `t2`, `t5`, `t6` |
| McpProgressNotification — method literal 'notifications/progress', params.progressToken and params.progress required, total/message optional | `t2`, `t5` |
| ProgressSink.report accepts the sc1 ProgressEvent union verbatim, with no field added, narrowed, or reinterpreted | `t2`, `t5` |
| the insrc_analyze_step tool surface driven with a progressToken, over an analyze.run operation | `t10` |

## Citations

- **[[c1]]** `prior-artifact` `LLD s2 componentsToBuild — sc2 progress type surface (ProgressSink, NOOP_PROGRESS_SINK, mcpProgressSink, LongRunningToolMeta, McpProgressNotification) plus the sc1 ProgressEvent union imported verbatim` — "ProgressSink.report(event: ProgressEvent): void; NOOP_PROGRESS_SINK; mcpProgressSink(server, progressToken); LongRunningToolMeta { progressToken?: string | number }; McpProgressNotification with param"
- **[[c2]]** `prior-artifact` `LLD s2 invariantsToPreserve — nine invariants including verbatim token echo, no daemon-side change to the send({ id: 0, stream: 'progress', data: f }) binding, fire-and-forget emission, and per-invocation closure correlation`
- **[[c3]]** `prior-artifact` `LLD s2 testStrategy — the twelve strategy items covering the sink, the envelopes, the reader lifecycle, and concurrent-invocation correlation with hand-written doubles under node:test`
- **[[c4]]** `prior-artifact` `LLD s2 openQuestions — the UNVERIFIED SHAPE placeholder for buildInsrcMcpServer / runInsrcMcpStdio, the unlisted tool registration sites, and the unverified analyze-rpc.ts stream:'progress' binding`
- **[[c5]]** `prior-artifact` `LLD s2 alternativesConsidered and bookkeeping — a2 (one shared opt-in shape across three servers), a4 (rejected optional params.progress), the undefined EmissionFault reference, and the mislabelled sampling-bridge.ts call site`
- **[[c6]]** `analyze-bundle` `s1 analyze bundle — src/mcp naming conventions (camelCase functions, PascalCase types, kebab-case filenames; state-store.ts / questions-gate.ts siblings) and the zero-hit repo-wide grep for progressToken | notifications/progress | sendNotification`
- **[[c7]]** `analyze-bundle` `s1 analyze bundle — module.profile of src/mcp/workflow-step (empty exports/entrypoints, unlisted __tests__ contents) and the analyze-step-handler.test.ts / src/daemon/__tests__/workflow-rpc.test.ts test conventions`
