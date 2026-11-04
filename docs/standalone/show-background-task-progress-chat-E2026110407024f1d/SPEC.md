<!-- insrc:artifact SPEC-07024f1d3a47137a -->

# Spec: Show background task progress in chat.

**Category:** requirements

## Intent

Show background task progress in chat.

Provide trustworthy progress feedback for long-running work inside its originating conversation, so users can follow reviews and test sweeps without repeatedly asking whether they are still running. Support insrc VS Code chat and native Claude Code, Codex and Vibe chat through capability-specific delivery. Use task-specific delegates, a shared runtime progress coordinator, and separate client delivery adapters.

## Product requirements

R1 — Inline conversation ownership. Associate every observed task with its project/repository, conversation, originating tool invocation, task identity and execution attempt. VS Code renders one task message in the normal transcript, updating it in place while running and retaining a compact terminal result. Multiple concurrent tasks remain distinguishable. Progress continues on the associated message when subsequent conversation turns occur; switching conversations never routes an old task's progress into the newly active chat.

R2 — Delegate pattern. Supply separate DesignReviewDelegate, CodeReviewDelegate and TestDelegate implementations. Delegates attach to their existing executors or managed processes and translate execution events into a common progress contract. They supply task-specific phase, measured counters, meaningful milestones, health information and supported controls. The shared coordinator owns task identity, authoritative snapshots, bounded history, ordering, subscriptions and delivery cadence. Delivery adapters own presentation and transport; delegates contain no client-specific rendering or agent narration. Extending to another task type must not require rewriting existing delegates or client renderers.

R3 — Truthful progress. Distinguish execution state, observation connectivity, task progress and worker liveness. Model execution states include queued, running, waiting, paused, completed, failed, cancelled, interrupted and unknown where evidence requires them. A live heartbeat does not establish forward progress or reset the last-meaningful-progress timestamp. Unknown totals remain unknown. Display measured phase counts rather than an invented overall percentage, and show newly discovered follow-up work separately. No unsupported ETA, fabricated counter, success inferred from output silence, or completion inferred from a disconnected client is permitted.

R4 — Native delivery without agent tokens. Instrumented executors emit structured events directly to the coordinator. VS Code consumes events and updates its chat message without a model call. MCP delivery maps the same state to supported progress notifications and human-readable labels. Normal native progress must not enter model conversation context, trigger additional agent turns or require agent polling. Durable storage retains bounded snapshots and useful milestones rather than every heartbeat or output fragment.

R5 — Capability-specific CLI delivery. Treat MCP tool connectivity, progress-token use, user-visible message rendering, background lifetime and scheduled observation as separate capabilities. Select a delivery mode per client/version/session based on evidence. Do not present protocol connection as proof of rendering. Source inspection is dated evidence; native rendering requires a repeatable live qualification. MCP Tasks is optional and experimental, never the baseline requirement. A normal tool-call progress token is not reused after its valid request/task lifetime.

R6 — Optional agent polling fallback. Where native progress is not visibly supported, allow explicit opt-in to low-frequency agent status polling. Clearly state that this mode consumes agent tokens and can produce occasional ordinary chat messages. It must remain optional and must not be silently substituted for token-free native delivery. The runtime calculates not-before/next-poll guidance and returns a compact snapshot or meaningful delta; agents do not run tight polling loops or regenerate summaries from raw logs. Repeated unchanged snapshots produce no repeated user-facing narration. Heartbeats alone do not count as reportable progress. Authorized fallback status snapshots are the explicit exception to excluding progress from model context: each poll may consume input/output tokens and an agent decision turn even when nothing changed. The no-silence/waiting-call non-goal prohibits separate model calls just to narrate silence or implement a timer; it does not claim that an unchanged authorized poll is free. Runtime timers and native notification delivery require no model calls.

R7 — Conservative fallback scheduling. Use a shared per-task polling budget across observers, retain a stable cursor, back off unchanged checks, and allow a bounded long status wait where client timeout and scheduling support permit. Proposed initial defaults, subject to spec approval and later qualification: first scheduled follow-up after 60 seconds; unchanged checks back off to 120 then 180 seconds; meaningful progress resets the next eligible interval to 60 seconds. Terminal/error/action-required updates are returned at the next eligible observation; no promise of immediate terminal delivery through sparse polling. Honor server retry-after and execution deadlines. Host code performs timer waiting when a suitable scheduler exists. An active agent may continue an authorized bounded observation loop using supported wait facilities, but native clients with no scheduler cannot be promised autonomous polls after a turn ends or the session exits. If observation cannot continue, show that limitation once rather than claiming a watcher exists.

R8 — Stop, suspend and cancellation semantics. End fallback polling at terminal execution status; suspend it on an observation pause, repeated transport errors or lost session capability. Retry transport in host/runtime code with bounded backoff where supported. An explicit user request to stop updates stops observation; it does not cancel the task. Task cancellation is a separate explicit action, exposed only where the delegate/executor supports it. A cancellation request remains pending until execution termination is confirmed. Client disconnect, polling pause and daemon restart never imply successful cancellation.

R9 — Delegate-specific measurements. Design reviews report the artifact and review stage, known check/chunk counts and meaningful milestones. Code reviews report dimension/stage, known initial chunks, active chunk, follow-up work and retries separately; progress instrumentation must not alter review findings, approval gates or execution scheduling. Tests report discovered/running/completed suites or tests, pass/fail/skip counts, elapsed time and the active suite when available through a supported reporter. Aggregate counters use a declared unit and prevent double counting suites, nested tests, retries and attempts. A reporter failure, aborted process, incomplete output or nonzero exit cannot become a completed successful sweep. Raw command output is available through a separate bounded details/log surface, not used as model narration input.

R10 — Reconnect and restart. Reopening or reattaching the same authorized chat restores the latest durable task snapshot and useful milestones, then resumes observation from a cursor. Duplicate/reordered events cannot move the UI backwards, duplicate messages or overwrite a newer attempt with an older result. A task may continue without observers. On daemon restart report interrupted or unknown until the execution owner verifies that work survived or was genuinely resumed; never automatically restart a review/test command merely because observation reconnects. Preserve completed/failed/cancelled outcomes across client reloads and distinguish observation failure from task failure.

R11 — Bounded and scoped delivery. Coalesce frequent progress updates and rate-limit subscribers while ensuring terminal outcomes are retained. Preserve the latest authoritative snapshot when a client falls behind; expose an explicit history-gap/resync condition instead of silently losing ordering. Scope reads, subscriptions, logs and controls to authorized task/conversation/project ownership. Sanitize task labels and reporter output for presentation; do not publish prompts, credentials, raw model responses or environment values as progress. Poll responses stay bounded and refer to detailed results rather than embedding full review reports or TAP logs.

R12 — Existing-system integration. Reuse or extend existing review progress producers, the MCP forwarding bridge and VS Code chat/tool surfaces where suitable. Keep the feature decoupled from repairs to the review engine occurring in another branch. Do not change configured model providers, approval requirements, runtime execution ownership or third-party CLI installations to enable progress. Polling/reporting cannot approve a workflow artifact, fabricate an independent review or automatically retry expensive work.

## Acceptance scenarios

A1: An instrumented long-running review updates its originating VS Code chat message during execution, including after the user sends another message. Updates require zero additional model calls. A completed review retains one compact terminal message with access to its result.

A2: Design and code review delegates report their respective stages/counts through the same coordinator and renderers. When follow-up work is discovered, the displayed progress remains truthful without an artificial overall completion percentage. A quiet model call displays elapsed/health evidence without pretending another chunk completed.

A3: A managed test run reports structured counts, its active suite when available, and a verified terminal result. Failures, retries, nested tests, malformed reporter output and process termination are represented accurately. Existing test commands retain their intended execution/exit behavior.

A4: A live-qualified native MCP client displays deterministic progress without extra model calls. Missing progress tokens, unsupported rendering, request completion and background transitions are tested as distinct cases. Unsupported clients do not receive a false native-support claim.

A5: With fallback disabled, no agent polling is introduced. With fallback explicitly enabled on an unsupported client, bounded status observations honor not-before/backoff guidance; only meaningful changes produce concise chat updates. Unchanged heartbeats do not reset backoff or cause narration. Token-consuming polling is visibly identified.

A6: A fallback host with no usable scheduler reports that automatic observation cannot continue after the current turn/session. Neither the task nor its execution state is changed by this limitation. No test may count a fake autonomous timer or agent busy-wait loop as supported progress delivery.

A7: Two observers or repeated tool retries do not multiply the per-task agent polling cadence, duplicate the task execution or emit duplicate final messages. Authorization and attempt correlation prevent cross-chat updates and stale-attempt finalization.

A8: Reload/reconnect restores the latest task state without replaying every tick or starting the task again. Daemon restart yields a truthful interrupted/unknown state unless continued/resumed execution is verified. Lost observations, gaps, duplicate events and terminal outcomes have deterministic recovery behavior.

A9: Stopping updates leaves execution running; explicit cancellation reports pending until termination is verified. A disconnected client, unsupported cancellation or stale task identity cannot be reported as successful cancellation.

A10: Instrumentation verifies bounded delivery/history, redacted labels/output, correct project/conversation isolation, and zero extra model invocations for native progress. The fallback is measured separately for poll frequency and payload size; no token-free claim applies to it.

## Proposed defaults and qualification

The 60/120/180-second polling cadence is a proposed tunable default, not a previously approved numeric requirement. A suggested native UI update cadence is at most once per second per running task, with retained terminal outcomes delivered promptly after receipt. Worker heartbeats may be emitted independently; a stale heartbeat changes observation/health messaging and must not authorize killing execution. Final heartbeat intervals, stale thresholds, quotas, retention duration, native transport wait bounds and storage representation are downstream design choices that must be explicit and bounded before implementation.

Native client evidence recorded during the brainstorm on 2026-11-04: Claude Code 2.1.310 is newer than the reported background-progress fix in 2.1.283; Codex 0.165.0's inspected handler logs progress without forwarding it to the chat renderer; Vibe 3.0.4's inspected MCP call path has no progress callback. None of these observations substitutes for a live end-to-end client acceptance test, and future versions require refreshed evidence. Native CLI limitations do not block implementing direct updates in insrc-owned VS Code chat or the optional polling fallback.

## Scope boundary

This is a requirements specification for progress observation and delivery inside regular chat, not authorization to implement the feature. Required first-release task delegates cover design reviews, code reviews and managed test runs. Proposed first-release test boundary: tests launched through an instrumented managed execution path; arbitrary existing processes, automatic PID discovery and process attachment are deferred and are not claimed as user-selected exclusions. Future delegates may extend the framework.

In scope are the shared progress contract and coordinator, client delivery adapters, inline VS Code chat presentation, native CLI MCP progress where verified, explicit optional sparse agent polling, truthful lifecycle/health/counter reporting, bounded state/history, scoped details, reattachment and observational restart behavior. Scheduling mechanisms, durable storage implementation, final bounded quotas and reporter adapters are downstream design choices.

Out of scope are insrc TUI changes, third-party CLI patches, repairing/rebuilding review execution, a general-purpose job scheduler, guaranteed automatic polling in unsupported hosts, arbitrary process discovery/attachment in the proposed initial release, automatic task restart on reconnect, fabricated progress or ETAs, and making experimental MCP Tasks a universal dependency. The user has accepted the token cost of optional fallback polling; native progress remains free of additional agent calls. Spec approval is still required before routing into implementation workflows.

## Non-goals

- Implementation in this request.
- Changes to the insrc TUI.
- Patching third-party CLIs or repairing review execution.
- Using MCP Tasks as a required baseline; it remains optional and experimental.
- Adding progress telemetry to model conversation context or making extra model calls for native progress delivery.
- Token-free claims for agent polling, model invocations solely for silence or waiting, agent busy-poll loops, or unsupported autonomous polling promises.
- Fabricated progress percentages or ETAs, automatic execution restart on reattach, or cancellation merely because observation stops.
- Claims of universal native CLI progress support based solely on MCP support or unvalidated source inspection.
