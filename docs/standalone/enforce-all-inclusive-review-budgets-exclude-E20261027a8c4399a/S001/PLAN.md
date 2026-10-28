<!-- insrc:artifact PLAN-a8c4399a90185f7f-s1 -->

# Plan: STORY-a8c4399a90185f7f-s1

## Summary

**Epic:** `enforce-all-inclusive-review-budgets-exclude`
**LLD run:** `wf-1793077725711-mh0dn5`
**LLD effective hash:** `a8c4399a9018...`

Implement one inclusive estimated budget shared by review planning, provider serialization, runtime inspection and controller emissions, with explicit native/tool/output reserves. Replace evidence-dropping and unsafe retry paths, add atomic trusted-owner continuations and exact terminal coverage, and scale total time by current work chunks without resetting retries. Validate the complete system before the required code review; deployment and the live TU1 retry remain clearly marked post-completion-approval actions.

## Contents

1. [Tasks](#1-tasks)
2. [Test-strategy coverage](#2-test-strategy-coverage)
3. [References](#3-references)

## 1. Tasks

| # | Task | Size | Status | Depends on | Tests | Derived from |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| 1 | **`t1`** Exclude generated JSONL histories before review scoping | S | — | — | integration: src/workflow/runners/build/__tests__/changed-files.test.ts: generated flat JSONL exclusion preserves nested user files across staged unstaged and range changes; integration: src/workflow/code-review/__tests__/diff-attribution.test.ts: Story-attributed graph and diff subjects exclude generated sidecars before freshness | [[c1]] |
| 2 | **`t2`** Define the shared inclusive budget and typed failure contract | M | — | — | unit: src/workflow/review-pipeline/__tests__/budget.test.ts: complete-component boundaries rounding reserves qualification and retry-headroom ownership | [[c2]] |
| 3 | **`t3`** Prepare provider-qualified wire budget profiles | M | — | `t2` | integration: src/agent/providers/__tests__/cli-review-session.test.ts: provider profile and normalized enveloped wire schema agree before planning and dispatch without config writes; unit: src/agent/providers/__tests__/ollama-review-session.test.ts: explicit managed profile and unsupported native-hard qualification refusal | [[c3]] |
| 4 | **`t4`** Enforce inclusive admission across the shared planner | L | — | `t2`, `t3` | unit: src/workflow/review-pipeline/__tests__/pipeline-job.test.ts: inclusive single chunk retry admission and required-neighbour correction overflow retain all mandatory evidence; integration: src/workflow/review-pipeline/__tests__/code-review-gather.test.ts: gather reduction relation obligation and duplicate comparison use the shared budget; integration: src/workflow/review-pipeline/__tests__/entry-budget-profiles.test.ts: code grounded and template review resolve the selected profile before job construction | [[c4]] |
| 5 | **`t5`** Guard serial dispatch and record safe per-call outcomes | M | — | `t2`, `t3`, `t4` | integration: src/workflow/review-pipeline/__tests__/budget-execution.test.ts: dispatch refusals bypass retry and partial-result policies and emit paired safe lifecycle events; integration: src/agent/providers/__tests__/cli-review-session.test.ts: review-scoped provider and driver logs redact sentinel content on all failure paths | [[c5]] |
| 6 | **`t6`** Bound managed inspection growth and final-answer requests | M | — | `t2`, `t3`, `t5` | unit: src/agent/__tests__/read-only-tool-loop.test.ts: review-only admission rechecks accumulated tools and history before every model turn; integration: src/agent/providers/__tests__/ollama-review-session.test.ts: inspection growth and final structured answer cannot bypass the inclusive budget or truncate evidence | [[c5]] |
| 7 | **`t7`** Scale total deadlines by current logical review chunks | L | — | `t4`, `t5`, `t6` | unit: src/workflow/review-pipeline/__tests__/pipeline-job.test.ts: logical chunk counts control total deadlines without retry resets parent double-counting or expired-job revival; integration: src/workflow/review/__tests__/template-review.test.ts: role-specific attempt ceilings remain distinct from dynamic chunk-scaled total time; integration: src/workflow/review-pipeline/__tests__/budget-execution.test.ts: effective attempt timer remaining-time clamp and transport-ceiling diagnostics are enforced | [[c6]] |
| 8 | **`t8`** Add atomic review-state claims and recovery | M | — | `t2` | unit: src/daemon/threads/__tests__/step-state.test.ts: atomic review claim commit generation recovery receipt and pinned-capacity invariants; integration: src/daemon/threads/__tests__/review-state-concurrency.test.ts: two actual hub connections cannot consume or persist the same pending call twice | [[c7]] |
| 9 | **`t9`** Bind claims to trusted request and worker lifecycles | L | — | `t8` | integration: src/daemon/threads/__tests__/review-owner-lifecycle.test.ts: real worker connection request and exit cancellation hooks bind and invalidate trusted owners; integration: src/daemon/steps/__tests__/step-host.test.ts: single-thread owner registration cleanup and out-of-band trusted context preserve non-review behavior | [[c8]] |
| 10 | **`t10`** Route controller code reviews through admitted continuations | L | — | `t2`, `t4`, `t5`, `t7`, `t8`, `t9` | integration: src/daemon/steps/code-review-step/__tests__/handler.test.ts: full degraded and confirm-wait controller continuations use complete-frame admission and atomic call consumption; integration: src/mcp/__tests__/review-budget-schema.test.ts: registered code-review declaration envelope and schema lookup match runtime contracts | [[c9]] |
| 11 | **`t11`** Enforce exact terminal verdict and template coverage | M | — | `t2`, `t8`, `t9`, `t10` | integration: src/daemon/steps/review-step/__tests__/verdicts-lifecycle.test.ts: exact expected claim and assigned subset sets reject empty partial duplicate unknown and replayed verdicts before writes; integration: src/daemon/steps/review-step/__tests__/review-step-findings.test.ts: exact template-item coverage and atomic terminal recovery prevent premature or duplicate completion | [[c10]] |
| 12 | **`t12`** Complete budgeted controller design-review flows | L | — | `t2`, `t4`, `t5`, `t7`, `t9`, `t10`, `t11` | integration: src/daemon/steps/review-step/__tests__/budget-continuations.test.ts: template extraction evidence verification and finalization preserve every required claim through admitted controller turns; integration: src/mcp/__tests__/review-budget-schema.test.ts: registered design-review phases validate declarations envelopes stale states and host-reserve qualification | [[c11]] |
| 13 | **`t13`** Verify complete budgeting and prepare the daemon handoff | M | — | `t1`, `t3`, `t4`, `t5`, `t7`, `t9`, `t10`, `t11`, `t12` | integration: src/workflow/review-pipeline/__tests__/budget-handoff.test.ts: assembled code design provider and controller boundaries enforce the same inclusive budget evidence timing and safe telemetry; smoke: npm run build: production TypeScript native helpers model checks assets and packaged review-budget entry points | [[c12]] |

### 1.1 TASK-a8c4399a90185f7f-s1-t1 — Exclude generated JSONL histories before review scoping

Extend the existing flat ledger exclusion in src/workflow/runners/build/changed-files.ts to generated .jsonl sidecars. Verify real git staged/unstaged/range and Story-attributed selection, code-review subject and freshness inputs. Preserve nested user-authored templates/formats and every canonical history file.

**Acceptance checks:**
- Flat .insrc/artifacts/*.jsonl is excluded through the same shared seam as existing generated JSON; histories remain on disk and no source or approvals are rewritten.
- Nested templates/formats/user JSONL, source and config changes remain reviewable; both full/graph and degraded/diff subjects consume the filtered set before freshness.
- Real-git regression covers range, staged, unstaged and Story attribution, not only a string/glob assertion.

### 1.2 TASK-a8c4399a90185f7f-s1-t2 — Define the shared inclusive budget and typed failure contract

Add the approved immutable policy/breakdown and controller declaration types in the shared review contracts plus one pure accounting boundary (proposed src/workflow/review-pipeline/budget.ts). Preserve promptChars/ReviewCall.chars as text diagnostics. Specify estimator, full schema/tool costs, reserves, retry headroom consumption and qualification; budget errors carry safe metadata only.

**Acceptance checks:**
- Default total remains128000; all declared text/schema/tool components plus native16384, transport1024, completion8192 and reviewer-inspection24576 token reserves participate; planning retry headroom8000 chars is counted exactly once.
- Each component uses safe nonnegative values/ceil estimates; exact-cap succeeds, one-token excess refuses, missing/unqualified production profile never becomes zero overhead.
- Expose estimatedTotal/remaining and qualification managed-estimate, reserved-native or explicit controller-reserved; never report estimated/native reserve values as measured usage or a verified hard ceiling.
- ReviewBudgetError provides stable fail-closed codes without raw prompt/schema/tool/error text; optional non-review provider fields retain existing behavior.

### 1.3 TASK-a8c4399a90185f7f-s1-t3 — Prepare provider-qualified wire budget profiles

Implement the pure provider profile capability for CliProvider and OllamaProvider, including actual Codex strict/enveloped schema and Claude/Ollama JSON schema serialization. Propagate additive review budget options through src/shared/types.ts. Recheck final provider serialization against the same profile; no global config writes, API auth changes or invented native hard-bound claims.

**Acceptance checks:**
- Selected profile is available before planning, serializable/frozen and identifies provider/transport/version, schema dialect, declared tools and explicit native/output/inspection reserves.
- Planner and provider account the same final wire schema, including envelope and Codex strict transformation; unknown normalization/profile mismatch refuses before a model call.
- Provider review options carry the approved policy and call IDs; structured and reviewer-session paths preserve read-only permissions, OAuth, deadline and abort behavior.
- Fake CLI/provider contracts prove normalization, missing-profile rejection and qualification without live credentials or native-token claims.

### 1.4 TASK-a8c4399a90185f7f-s1-t4 — Enforce inclusive admission across the shared planner

Wire selected profiles before createReviewJob at code-review, grounded-review and template-review entries. Replace independent message-only checks in job, gather and duplicate adapters with the shared inclusive measurement. Correct required-neighbour and correction-dropping fallbacks; keep existing evidence-preserving split/gather protocol and envelope IDs.

**Acceptance checks:**
- Single, chunk, retry, gather/reduce, relation, obligation and comparison/pair candidates all fit the same inclusive cap; no unmeasured schema/shared context is appended after admission.
- All production entry points resolve provider/profile before job construction; test doubles supply explicit synthetic policies instead of production zero-cost defaults.
- Required usage-neighbour evidence is never dropped to fit. Supported lossless partitioning is used or required-context-over-budget is explicit; optional context remains separately optional.
- An oversized required correction is included in supported replanning or causes correction-budget-exceeded; the original uncorrected prompt is never silently reissued.
- Frozen job policy survives continuation/config changes; no source evidence, dimension, relation or obligation is silently omitted under smaller payload allowance.

### 1.5 TASK-a8c4399a90185f7f-s1-t5 — Guard serial dispatch and record safe per-call outcomes

Add shared execution-time preflight to runReviewJob, typed budget-error bypass and paired content-free lifecycle events. Sanitize existing review-scoped provider/driver failure logs, preserving non-review behavior. Managed tool-loop/final-answer guard propagation is a separate dependent task.

**Acceptance checks:**
- No provider call occurs after failed dispatch admission; final serialized prompt/schema/profile are revalidated against the frozen inclusive cap.
- ReviewBudgetError is handled before generic classification and never becomes transient retry, record-not-judged, record-observation or successful partial review.
- Every started call has one success/failure/cancel event with safe internal IDs, attempt, numeric budget, qualification and duration; refused admission makes zero provider calls.
- Existing review-scoped provider/driver logs, including stall/transient/correction paths, expose no source/schema/prompt/credential sentinel or raw error detail; non-review logging behavior is unchanged.
- Serial provider calls, read-only execution, cancellation and existing retry ownership remain intact; no provider internal retry bypasses the shared guard.

### 1.6 TASK-a8c4399a90185f7f-s1-t6 — Bound managed inspection growth and final-answer requests

Propagate the optional review budget through Ollama-managed source inspection, runReadOnlyToolLoop and emitStructuredAnswer. Recheck the complete accumulated conversation/tool/schema request before each model turn and final answer, using the shared execution/error/telemetry contract. Leave analyzer and other non-review callers unchanged.

**Acceptance checks:**
- Initial managed request, every tool-loop model turn and final structured answer include actual accumulated conversation, declared tools, closing instruction/schema, all profile reserves and output allowance.
- An initially fitting request whose tool history grows beyond the cap refuses before the next model call; it never truncates required evidence or returns a partial review.
- Supported provider output limits receive the reserved completion allowance; native/estimated values are never reported as measured hard bounds.
- Final-answer and provider correction paths have no budget exemption; typed refusals retain safe diagnostics and cancellation reaches loop/tool/provider work.
- Review budget propagation is opt-in and sentinel-safe; analyzer/non-review consumers without the new option keep their existing contract.

### 1.7 TASK-a8c4399a90185f7f-s1-t7 — Scale total deadlines by current logical review chunks

Implement the approved logical-work lineage and original-epoch time accounting across job/driver, source/structured/reviewer calls, downstream stages and template helpers. Preserve selected role-specific attempt ceilings and clamp by remaining total; update timeout messages and setting descriptions without changing stored user configuration.

**Acceptance checks:**
- Total budget=600000ms times current admitted logical work chunks; N1/2/5/7 yields10/20/50/70 minutes from one original execution start.
- Genuine subdivision replaces parent entitlement with child leaves; later required stage work counts once. Retries/corrections/new call IDs for the same work do not add time or reset clocks.
- Expired work cannot be revived by late answers/refusals/replanning. Driver enforces the remaining deadline with cancellation/race even if a provider ignores timeout options.
- Code-review10-minute and design12/18/24-minute role caps (upTo30-minute attempt maximum) are retained and clamped by remaining total; whole-job allocation is never mistakenly capped at30 minutes.
- Template helpers/settings and timeout callbacks report live derived totals; metadata distinguishes per-attempt, job, freshness and external MCP transport timeouts and explicitly flags shorter outer ceilings.

### 1.8 TASK-a8c4399a90185f7f-s1-t8 — Add atomic review-state claims and recovery

Extend LocalStepStateStore/SharedStepStateStore and hub proxy/bindings with review/code-review-scoped claim/commit/release/invalidate operations, generation/call matching and bounded completion receipts. Do not change analyze/workflow lifecycle or add a database. Owner validation consumes a trusted internal context supplied by the lifecycle task.

**Acceptance checks:**
- Atomic central claim permits one owner for a pending generation/call; cross-owner or stale commits/releases refuse. A non-consuming read never grants replay protection.
- Missing declaration or invalid reply before side effects leaves state reusable; final claim remains exclusive through persistence and commits only on success.
- Ambiguous persistence/cancel/owner loss invalidates rather than blindly regranting work; late owners are fenced; replay of a successful final call returns a bounded receipt without writing twice.
- Live claims are pinned against ordinary TTL/capacity eviction, count against existing bounds, and explicit capacity errors replace silent eviction when all entries are pinned.
- Local and real hub-worker tests exercise generation, duplicate requests, before/after-write failure, receipt bounds and unrelated-token independence.

### 1.9 TASK-a8c4399a90185f7f-s1-t9 — Bind claims to trusted request and worker lifecycles

Wire authenticated connection/request-owner context through channel/main-services/router/supervisor, worker entry/dispatch, trusted request/step context and single-thread host. Implement explicit invalidation on real owner loss and cancellation; do not trust owner IDs in MCP args or serialize connection capabilities.

**Acceptance checks:**
- Main-thread connection nonce/generation and active internal request-owner registry validate every review claim operation. Worker-supplied args cannot replace bound channel identity or commit/release another connection's claim.
- RequestEnvelope/wireRequest and worker dispatch carry only the trusted opaque owner nonce; existing session capability/credential wire exclusions remain.
- Worker exit/detach/replacement, disconnect, failed dispatch, explicit cancellation, lifetime completion and local host try/finally clean uncommitted owner claims through actual hooks.
- Normal committed receipts survive cleanup; legitimate uncancelled unary work retains its owner until actual completion. No abandoned pinned claim, timed lease regrant or late-owner advancement is permitted.
- Real two-connection/worker-exit/cancel and single-thread tests verify the hooks, not only direct store stubs; unrelated step kinds and maintenance behavior remain unchanged.

### 1.10 TASK-a8c4399a90185f7f-s1-t10 — Route controller code reviews through admitted continuations

Update actual code-review MCP registration, input/state schemas and full/degraded handler paths. Acquire explicit controller-reserved declarations, measure the entire response frame, and use atomic versioned pending-call continuations and shared pipeline splitting rather than unbudgeted four-prompt bundles.

**Acceptance checks:**
- src/mcp/server.ts and daemon types register the new declaration/envelope contract; missing, malformed, stale or unqualified controller input refuses before prompt exposure.
- Full and degraded responses include every prompt/schema/grounding/framing component in admission; four individually fitting prompts whose combined frame exceeds the cap split or explicitly refuse.
- One pending admitted call per turn carries correct IDs/material; no unmeasured whole grounding is appended. Matching replies advance state atomically and all dimensions/obligations complete before final persistence.
- Controller host context remains caller-declared/reserved, never server-measured; caller cannot increase the pinned cap and must refresh host reserve before each next emission.
- Initial/resume/confirm_wait/judgements, old-token/replay, concurrent-finalization, error recovery and chunk-scaled deadline cases are covered without weakening other-party or source/lifecycle checks.

### 1.11 TASK-a8c4399a90185f7f-s1-t11 — Enforce exact terminal verdict and template coverage

Add exact expected-set and assigned-subset validation to design-review final handlers/continuation aggregation before normalization or persistence. Cover empty, partial, duplicate, unknown and wrong-subset IDs explicitly; prepare the versioned terminal envelope/atomic-owner path for complete controller integration.

**Acceptance checks:**
- Every expected claim appears exactly once; each pending verification call returns exactly its assigned subset and final aggregation equals the immutable full set.
- Empty replies for nonempty expected claims, unknown IDs, duplicate IDs (even identical), missing IDs and wrong subsets produce safe typed errors and zero persistence, rather than silent dropping or partial findings.
- A legitimately empty expected set is accepted only after complete validated extraction; findings/template items retain exact expected coverage before completion.
- Terminal envelope IDs/version/profile/deadline are decoded and validated under the atomic owner before existing semantic/source/lifecycle checks; raw legacy final arrays cannot bypass the new path.
- Concurrent duplicate final replies cause at most one artifact write; validation failures before side effects preserve a correctable continuation.

### 1.12 TASK-a8c4399a90185f7f-s1-t12 — Complete budgeted controller design-review flows

Integrate review-step MCP registration, state/types/host dispatch, template/extract start, claims/evidence, findings and verdicts with admitted complete frames, existing pipeline adapters, exact-set terminal checks and atomic owner recovery. Keep existing outer phase names while versioning continuation payloads.

**Acceptance checks:**
- All actual controller emission sites (template, extraction, batched verification) use complete-frame inclusive admission and explicit controller-reserved profiles; no daemon-only implementation is advertised as all-review coverage.
- Existing adapters preserve all source/claims/obligations across one-call-per-turn continuations; evidence gathering occurs only after complete extraction and finalization only after all required work validates.
- Both terminal handlers decode callId/answer and enforce exact expected sets before persistence under the trusted atomic claim; missing declarations, stale tokens, replay and interrupted writes have the approved recovery behavior.
- New registered MCP schemas and returned inner schemas agree with handlers and schema lookup; old clients/tokens receive explicit incompatibility/refusal rather than a silent budget bypass.
- Template/grounded/full/degraded controller cases, dynamic host reserve and chunk time, cancellation, real two-worker duplicate submissions and cross-protocol resume mismatches are verified.

### 1.13 TASK-a8c4399a90185f7f-s1-t13 — Verify complete budgeting and prepare the daemon handoff

Run the assembled regression/compatibility matrix and production build with scripted providers; prepare release evidence and the independent Story code review. Document deployment and the live TU1 retry as post-BUILD-approval actions, with no premature smoke claim.

**Acceptance checks:**
- All focused planner/provider/managed-loop/time/state/owner/controller/real-git suites and production build pass; any unrelated backend baseline failures are identified with evidence, not silently waived or patched off-ledger.
- End-to-end fixtures cover original371253/225429-character inputs with full schemas/reserves, all review roles, final managed answer, whole controller frames, evidence retention and exactly-once terminal behavior.
- Packaged/runtime entry points consume the same profile/policy; no placeholder implementations, zero-cost fallback, missing controller registration, unsafe raw error logs or native hard-bound claims remain.
- Document unchanged user configuration, resolved estimated policy, new deadline semantics and controller compatibility; keep generated histories and approvals intact and review reports only in /tmp.
- Provide a concrete post-approval release checklist: audit scoped commits, push/update/restart the daemon, verify installed commit, then run one fresh TU1 review. Clearly mark deployment and its live smoke pending until code review and explicit BUILD completion approval; do not claim a pre-deployment live pass or make that later action a circular task gate.

## 2. Test-strategy coverage

| LLD strategy item | Covered by |
| :--- | :--- |
| Proposed src/workflow/review-pipeline/__tests__/budget.test.ts: exact total cap, one-token overflow, independent schema overhead, native/tool/output/inspection reserves and estimator qualification | `t2` |
| src/workflow/review-pipeline/__tests__/pipeline-job.test.ts: single/chunk admission, retry headroom consumed once, frozen policy and stale state rejection | `t4`, `t10`, `t12` |
| src/workflow/review-pipeline/__tests__/code-review-divided.test.ts: all source atoms/obligations remain represented after inclusive splitting | `t4`, `t13` |
| src/workflow/review-pipeline/__tests__/code-review-chunking.test.ts: neighbours, mandatory context and indivisible atoms use inclusive request measurement | `t4` |
| src/workflow/review-pipeline/__tests__/code-review-gather.test.ts and pipeline duplicate suites: reduction, obligation, relation and pair requests use same admission policy | `t4`, `t7` |
| src/workflow/review-pipeline/__tests__/code-review-source-inspection.test.ts: preflight, optional review execution budget and unchanged deadline/abort/retry contracts | `t5`, `t6`, `t7` |
| CLI provider fake-process review-session tests: account logical/strict schema and invocation overrides, reject missing profile, retain reserved-native qualification, no config writes | `t3`, `t5` |
| Ollama review-session and read-only tool-loop tests: large tool result, next-turn growth and final structured-answer guard; non-review callers unchanged | `t6` |
| Optional hard-native mode is unsupported unless an actual verified provider contract test is supplied; no flag-name-only proof | `t2`, `t3` |
| src/workflow/code-review/__tests__/diff-attribution.test.ts: flat JSONL excluded in real git range, staged and unstaged paths | `t1` |
| Existing changed-file/subject tests: nested templates/formats JSONL remains in subject; only generated flat ledgers skip freshness | `t1` |
| npm run build and focused review-pipeline/provider/changed-file regression suites | `t13` |
| After daemon update/restart, retry pending TU1 review once and inspect per-call start/end/failure breakdowns and absence of flat generated histories | `t13` |
| src/workflow/review-pipeline/__tests__/pipeline-job.test.ts: required-neighbour overflow refuses rather than retaining only summaries that fit; optional context remains separately optional | `t4` |
| src/workflow/review-pipeline/__tests__/pipeline-job.test.ts: oversized invalid-answer correction is never reissued without its correction | `t4` |
| src/workflow/review-pipeline/__tests__/code-review-source-inspection.test.ts: budget errors bypass transient retry, record-not-judged and record-observation policies | `t5` |
| src/agent/providers/__tests__/cli-review-session.test.ts: provider profile and exact normalized wire schema reach initial planning and dispatch with matching budget | `t3`, `t4` |
| Grounded and template design-review entry tests: selected provider profile resolved before createReviewJob; missing profile makes zero provider calls | `t4` |
| Code-review controller state tests: pre-version controller token rejected at actual resume boundary, not by fictional pipeline deserialization | `t10` |
| Capture provider and driver loggers together: no source/credential sentinel appears in any review-scoped failure log | `t5`, `t6` |
| src/daemon/steps/code-review-step/__tests__/handler.test.ts: full and degraded emitJudgementsResult admission; four individually fitting prompts whose combined frame exceeds cap must split or refuse | `t10` |
| src/daemon/steps/review-step phases start and claims tests: template, extraction and batched verification emissions use complete-frame admission | `t12` |
| Both controller state-store/type/schema tests: valid declaration, unknown/negative host reserve, pinned cap, fresh host declaration on each resume, pre-version token, missing/duplicate/mismatched callId and no premature artifact completion | `t10`, `t11`, `t12` |
| Controller multipart integration: every required dimension, claim and cross-chunk obligation reaches final aggregation; no truncated grounding or prompt body is exposed on refusal | `t10`, `t12`, `t13` |
| src/daemon/threads/__tests__/step-state.test.ts plus real hub/worker helper: two workers claim the same review/code-review token; one wins; generation/call mismatch refuses; unrelated tokens progress independently | `t8`, `t9` |
| Controller findings/verdicts/judgements handlers: concurrent duplicate final replies produce exactly one artifact write; malformed/missing budget declaration preserves usable state; stale/replayed/legacy envelopes never reach semantic validators or persistence | `t10`, `t11`, `t12` |
| State failure recovery: before-write failure releases unchanged; simulated success-before-response, ambiguous persistence, cancellation and worker loss never regrant old work; late claimant commit is fenced; active claims are not TTL/capacity-evicted | `t8`, `t9` |
| src/mcp/server.ts schema registration tests: both tools accept the new declaration/envelope shape and reject malformed values; both terminal design handlers decode callId/answer before existing validation | `t10`, `t12` |
| src/workflow/review-pipeline/__tests__/pipeline-job.test.ts: fake-clock N=1/2/5/7 budgets10/20/50/70 minutes; redivision grows total from original start; retries/corrections do not increase count or reset epoch | `t7` |
| Review-stage/gather/relation tests: new admitted work chunks count once, replaced parents are not double-counted, structured and source-inspecting calls share timing, deterministic-only review has zero model budget | `t7` |
| Driver/controller deadline tests: selected role-specific per-attempt cap clamped by remaining total, remaining-time clamp, no dispatch/finalization past deadline, explicit outer-ceiling incompatibility and distinct MCP client-timeout metadata | `t5`, `t7`, `t10`, `t12` |
| Expired-review fake-clock regressions: late size-refusal/subdivision or controller reply cannot revive expired work; provider ignoring timeout options is bounded by driver abort/race; outer client timeout remains distinct. | `t5`, `t7`, `t12` |
| Real hub/main-services tests: connection-bound owner identity cannot be spoofed in args; cross-connection claim commit/release is rejected | `t9` |
| Supervisor/router/host integration: worker exit, port disconnect, replacement generation, explicit cancel, failed dispatch and single-thread AbortSignal/finally invalidate uncommitted claims; legitimate uncancelled unary work is not falsely regranted | `t9`, `t10`, `t12` |
| Terminal controller tests: empty, partial, duplicate, unknown and wrong-assigned-subset verdict arrays make zero writes; all expected claims exactly once across chunks permits one completion | `t11`, `t12` |
| Late owner completion after invalidation is fenced; no abandoned pinned claim, lease regrant or duplicate finalization; successful committed receipt survives owner cleanup | `t8`, `t9` |
| Timing fake clocks: code-review10-minute and design12/18/24-minute attempt ceilings are clamped by remaining10×N total; whole-job budget is not clamped to30 minutes; template timeout messages reflect live total | `t7` |

## 3. References

- **[[c1]]** `prior-artifact` `LLD s1 generated flat JSONL exclusion and preserved histories` — "Approved LLD-a8c4399a90185f7f-s1: generated flat JSONL exclusion and preserved histories."
- **[[c2]]** `prior-artifact` `LLD s1 immutable inclusive budget policy breakdown and typed failure contract` — "Approved LLD-a8c4399a90185f7f-s1: immutable inclusive budget policy breakdown and typed failure contract."
- **[[c3]]** `prior-artifact` `LLD s1 provider-qualified final wire schema and profile contract` — "Approved LLD-a8c4399a90185f7f-s1: provider-qualified final wire schema and profile contract."
- **[[c4]]** `prior-artifact` `LLD s1 shared planning admission and required evidence correction retention` — "Approved LLD-a8c4399a90185f7f-s1: shared planning admission and required evidence correction retention."
- **[[c5]]** `prior-artifact` `LLD s1 serial execution preflight managed history and safe lifecycle telemetry` — "Approved LLD-a8c4399a90185f7f-s1: serial execution preflight managed history and safe lifecycle telemetry."
- **[[c6]]** `prior-artifact` `LLD s1 dynamic logical chunk deadlines and role-specific attempt ceilings` — "Approved LLD-a8c4399a90185f7f-s1: dynamic logical chunk deadlines and role-specific attempt ceilings."
- **[[c7]]** `prior-artifact` `LLD s1 atomic review-state claim commit recovery and receipts` — "Approved LLD-a8c4399a90185f7f-s1: atomic review-state claim commit recovery and receipts."
- **[[c8]]** `prior-artifact` `LLD s1 trusted request worker owner lifecycle integration` — "Approved LLD-a8c4399a90185f7f-s1: trusted request worker owner lifecycle integration."
- **[[c9]]** `prior-artifact` `LLD s1 complete code-review controller frame and continuation protocol` — "Approved LLD-a8c4399a90185f7f-s1: complete code-review controller frame and continuation protocol."
- **[[c10]]** `prior-artifact` `LLD s1 exact terminal claim subset and template coverage` — "Approved LLD-a8c4399a90185f7f-s1: exact terminal claim subset and template coverage."
- **[[c11]]** `prior-artifact` `LLD s1 complete design-review controller emissions and continuation protocol` — "Approved LLD-a8c4399a90185f7f-s1: complete design-review controller emissions and continuation protocol."
- **[[c12]]** `prior-artifact` `LLD s1 regression compatibility build and post-approval daemon handoff` — "Approved LLD-a8c4399a90185f7f-s1: regression compatibility build and post-approval daemon handoff."
