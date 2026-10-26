# S003 t20 — cache and continuation boundaries

Session execution bypasses exploration and context cache getters and setters at the consumer and storage APIs. The narrow finalizer carries the explicit policy. Saved cache behavior remains unchanged.

Continuation state stays in a separate process-memory store, capped at 100 entries with monotonic one-hour idle expiry and cancellation/end cleanup. No Session payload enters the worker/hub state clone or opaque token. A random token grants no authority: owner/epoch/root/control-generation and the complete visible connection revision vector must match before payload access. Invocation windows capture only safe revision metadata, with a synchronous registry/overlay check immediately before reuse to close async lookup races. A completed request may resume through a fresh authenticated request; cancellation invalidates its analysis continuations.

Focused evidence: `private-cache.test.ts` runs three isolated child cases (all pass; zero fail/cancel/skip/TODO). Real SQLite owners share root/id but have different tables. Warm Saved LMDB cache is preserved; actual executor and step executor resolve each owner's source, with persistent LMDB getter/setter spies called zero times. A real narrow pause resumes only for the originating owner. Context cache reads/writes/invalidation bypass the persistent path and poisoned source getters entirely. A warm Saved context file remains byte-identical. Direct storage APIs also bypass poisoned inputs.

Continuation tests cover fresh-request reuse after completion, opaque token rotation, copied/untracked resume objects, wrong owner, absent authority, changed revisions, cancellation, end, bounded capacity and abort cleanup. Poisoned output getters remain untouched on denial; shared state mint/read/update/release spies remain zero.

Validation: 30 focused cache/executor/state cases pass; 31 context-cache/inventory cases pass; final bounded private-cache rerun passes (its three child cases pass). `npm run build` passes (see task20-build-output.txt). The two legacy context-cache suites now explicitly redirect PATHS.analyzeContext into private fixtures. No full sweep has run.

This task proves deterministic Session cache isolation. Admitted Session model calls remain deferred to t24/t25; no local-provider proof is claimed here. Gate remains ready:false with no enabled scopes. SQLServer live coverage and external workbench integration remain pending as previously recorded.


## Build-gate correction

The first build gate rejected the direct Session-resume-to-Saved downgrade and missing timed expiry test. `assertSessionContinuation` now checks existing Session provenance even for a genuinely unbound caller with explicit Saved authority; `rememberSessionContinuation` also refuses to relabel it under Saved policy. The new third isolated case runs the real Session owner with its monotonic clock port, advances past the actual 90-second lease, then verifies continuation/state/cache refusal before poisoned source getters. It also checks the unbound Saved path before and after expiry. End/cancel tests remain separate and are no longer used as expiry evidence. The build passes after this correction.
