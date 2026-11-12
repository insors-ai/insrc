<!-- insrc:artifact PLAN-e4af63128c7cbec2-s1 -->

# Plan: STORY-e4af63128c7cbec2-s1

## Summary

**Epic:** `isolate-each-code-design-review-its`
**LLD run:** `wf-1794204515305-6q9wbt`
**LLD effective hash:** `ccc8515f61bd...`

Build one dedicated worker per code/design review, beginning with durable admission and host-owned native process contracts, then integrate both existing review coordinators, recovery, progress, supported clients and production routes. Before t14, each task proves its declared component through registered real-worker fixtures and the host-service contract available at that stage; t8 specifically proves canonical ownership, trusted private control dispatch and both CLI/shell adapters under required explicit host-policy bindings. Successful family execution/subject integration remains mandatory in t9/t10, actual shared cleanup consumers in t13, concrete production reviewer/permission bindings and coordinated route cutover in t14, and installed production end-to-end qualification in t15/t16. Component acceptance never claims release readiness: compiled qualification, one independent whole-story code review and human BUILD approval precede deployment and a controlled restarted-daemon smoke.

## Contents

1. [Tasks](#1-tasks)
2. [Test-strategy coverage](#2-test-strategy-coverage)
3. [References](#3-references)

## 1. Tasks

| # | Task | Size | Status | Depends on | Tests | Derived from |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| 1 | **`t1`** Add code-review admission and resource-guard contracts | L | approved r1 | — | unit: src/workflow/code-review/task-review/__tests__/admission-checkpoint.test.ts: unverified admission and resource guards preserve pinned code history and refuse approval; unit: src/shared/__tests__/review-resources.test.ts: bounded exact review lease and clearance receipt contracts reject invalid input | [[c1]] [[c2]] [[c3]] |
| 2 | **`t2`** Add design-review admission and resource-guard contracts | L | approved r1 | `t1` | unit: src/workflow/review/design-review/__tests__/admission-checkpoint.test.ts: historical design attempts and unverified admission retain separate semantics; unit: src/workflow/review/design-review/__tests__/checkpoint-progress.test.ts: serialized resource and progress updates cannot lose open intents | [[c1]] [[c2]] [[c3]] |
| 3 | **`t3`** Preserve admission failures in reports and approval readers | M | approved r1 | `t1`, `t2` | integration: src/workflow/code-review/task-review/__tests__/admission-history.test.ts: failed admission survives successful next attempt publication and post-cleanup reads; integration: src/workflow/review/design-review/__tests__/admission-history.test.ts: technical admission diagnostics remain non-review evidence across publication; unit: src/workflow/code-review/task-review/__tests__/resource-preservation.test.ts: guard-only updates preserve report identity while reviewed-input or result mutations do not | [[c1]] [[c2]] [[c3]] [[c6]] |
| 4 | **`t4`** Implement host-owned native process leases | L | approved r1 | `t1`, `t2` | integration: src/daemon/threads/__tests__/review-processes.test.ts: host leases precede spawn and enforce owner-bound replay and disposal; integration: src/daemon/threads/__tests__/review-processes.test.ts: worker loss and unknown child cleanup fence only the owning review | [[c1]] [[c2]] [[c4]] |
| 5 | **`t5`** Bridge native review CLI execution and binary resolution | L | draft r2 | `t4` | integration: src/agent/providers/__tests__/review-worker-process.test.ts: fake native review CLI streams and cancellation use host-owned leases; unit: src/agent/providers/__tests__/review-worker-process.test.ts: review binary lookup cannot spawn synchronously on the worker | [[c1]] [[c4]] |
| 6 | **`t6`** Bridge review tool, Git and raw-byte subprocess execution | L | draft r2 | `t4` | integration: src/daemon/tools/__tests__/review-worker-shell.test.ts: Git shell and raw-byte commands preserve output bounds and abort semantics through leases; unit: src/daemon/threads/__tests__/review-spawn-inventory.test.ts: all review-reachable native spawn and exec paths use the host bridge | [[c1]] [[c4]] |
| 7 | **`t7`** Build the dedicated review-worker runtime and bootstrap supervision | M | draft r2 | `t1`, `t2`, `t5`, `t6` | integration: src/daemon/threads/__tests__/review-worker-bootstrap.test.ts: real worker joins guards and starts from the registered entrypoint; integration: src/daemon/threads/__tests__/review-worker-bootstrap.test.ts: never-ready and pre-save-hung workers fail within the parent bound and reject late acknowledgments | [[c1]] [[c3]] [[c4]] |
| 8 | **`t8`** Add the main review-worker registry and trusted control bridge | L | draft r3 | `t4`, `t7` | unit: src/daemon/threads/__tests__/review-workers.test.ts: canonical identities own one incarnation and preserve subject and cleanup exclusions; integration: src/daemon/threads/__tests__/review-workers.test.ts: stale owner messages and targeted disconnects cannot mutate another review | [[c1]] [[c3]] [[c4]] [[c5]] |
| 9 | **`t9`** Adapt code review to durable background admission in its worker | L | draft r2 | `t1`, `t3`, `t5`, `t6`, `t8` | integration: src/workflow/code-review/task-review/__tests__/worker-admission.test.ts: durable acknowledgment precedes blocked source qualification and provider dispatch; integration: src/workflow/code-review/task-review/__tests__/worker-admission.test.ts: replay and controller admission-to-assignment retain one execution identity | [[c1]] [[c2]] [[c3]] [[c4]] [[c5]] |
| 10 | **`t10`** Adapt design review to durable background admission in its worker | L | draft r2 | `t2`, `t3`, `t5`, `t6`, `t8` | integration: src/workflow/review/design-review/__tests__/worker-admission.test.ts: durable admission and current workflow ancestry run in the owner worker; integration: src/workflow/review/design-review/__tests__/worker-admission.test.ts: subject invalidation explicit recovery and impact-selected chunks preserve saved feedback | [[c1]] [[c2]] [[c3]] [[c4]] [[c5]] |
| 11 | **`t11`** Implement targeted daemon-crash fences and local clearance | L | draft r3 | `t4`, `t8`, `t9`, `t10` | integration: src/daemon/threads/__tests__/review-worker-recovery.test.ts: disposable daemon crash reconstructs unresolved guards and leaves unrelated reviews usable; integration: src/daemon/threads/__tests__/review-worker-clearance.test.ts: existing local broker approval binds exact guards and requires a separate resume; integration: src/daemon/threads/__tests__/review-worker-clearance.test.ts: stale partial repeated or lost-response clearance preserves remaining fences and audit receipts | [[c1]] [[c2]] [[c3]] [[c4]] [[c6]] |
| 12 | **`t12`** Expose responsive admission progress across supported clients | M | approved r1 | `t8`, `t9`, `t10` | integration: src/daemon/threads/__tests__/review-worker-progress.test.ts: pending admission and cached progress stay responsive during blocked worker computation; unit: vscode-plugin/src/chat/__tests__/review-worker-progress.test.ts: admission DTOs render preparing or failure without empty success; unit: jetbrains-plugin/src/test/kotlin/ai/insors/insrc/jetbrains/review/ReviewWorkerProgressTest.kt: admission DTOs preserve unknown inventory and current review identity | [[c1]] [[c3]] [[c5]] |
| 13 | **`t13`** Route recovery, publication, cleanup and shutdown through the owner | L | draft r2 | `t3`, `t8`, `t9`, `t10`, `t11`, `t12` | integration: src/daemon/threads/__tests__/review-worker-publication.test.ts: publication retry after worker exit or lost receipt performs zero provider calls; integration: src/daemon/threads/__tests__/review-worker-cleanup.test.ts: approval cleanup retains active targets and preserves both-family permanent history; integration: src/daemon/threads/__tests__/review-worker-recovery.test.ts: shutdown drains host leases before worker reclamation and replacement | [[c1]] [[c2]] [[c3]] [[c4]] [[c6]] |
| 14 | **`t14`** Switch all supported review entrypoints to dedicated workers | M | draft r5 | `t9`, `t10`, `t11`, `t12`, `t13` | integration: src/daemon/__tests__/review-worker-routing.test.ts: every supported review method delegates heavy work to its dedicated owner; integration: src/daemon/__tests__/review-worker-routing.test.ts: optional session threading disabled cannot enable main or session review fallback | [[c1]] [[c3]] [[c5]] [[c6]] |
| 15 | **`t15`** Qualify real concurrent worker isolation and failure recovery | M | draft r5 | `t14` | integration: src/daemon/threads/__tests__/review-worker-isolation.test.ts: code code design design and mixed reviews use distinct real worker threads; integration: src/daemon/threads/__tests__/review-worker-isolation.test.ts: blocked admission permits progress daemon status and an unrelated review before release; integration: src/daemon/threads/__tests__/review-worker-recovery.test.ts: crash-boundary owner-loss and cleanup races retain targeted lifecycle guarantees | [[c1]] [[c3]] [[c4]] [[c5]] |
| 16 | **`t16`** Verify compiled packaging and document deployment/recovery | M | approved r1 | `t15` | integration: src/daemon/threads/__tests__/review-worker-package.test.ts: compiled worker entrypoints and both review families start from an isolated built package; integration: src/daemon/threads/__tests__/review-worker-package.test.ts: release instructions retain explicit recovery local trust and post-approval smoke ordering | [[c1]] [[c2]] [[c3]] [[c4]] [[c5]] [[c6]] |

### 1.1 TASK-e4af63128c7cbec2-s1-t1 — Add code-review admission and resource-guard contracts

Introduce the approved unverified admission variant and bounded shared resource-guard types (proposed src/shared/review-resources.ts), then update code-review checkpoint codecs/discriminating readers. Keep historical qualified records readable and current routes safe; production does not emit the new variant until worker cutover.

**Acceptance checks:**
- Code admission is a distinct unverified variant with exact immutable input and no invented selected tasks, accepted scope or approval binding.
- Code checkpoint readers round-trip historical qualified attempts and refuse unknown versions; changed pinned input is rejected and admission failures/interruption retain explicit attempt semantics.
- Shared resourceGuard/open-lease/clearance receipt shapes are bounded, exact-review scoped and ready for serialized family checkpoint writes; unresolved leases cannot be truncated.
- All affected code consumers compile and fail safely on unqualified admission; existing source-pin and completion checks remain mandatory.

### 1.2 TASK-e4af63128c7cbec2-s1-t2 — Add design-review admission and resource-guard contracts

Consume the shared resource types and extend design-review contracts/checkpoint codecs/discriminating readers with the approved admission variant. Preserve current qualified attempt/chunk histories, source-subject identities and explicit recovery rules; do not switch production routing yet.

**Acceptance checks:**
- Design admission preserves immutable input/action identity while subject/history qualification remains unverified; planning/chunk results are absent until actually established.
- Historical design checkpoints remain readable without rewriting accepted feedback; unknown formats and ambiguous attempted conversions refuse explicitly.
- Design resourceGuard updates use the single serialized checkpoint writer alongside progress/results, preventing lost open intents or premature lease closure.
- Existing artifact-change invalidation, explicit recovery and approval-evidence distinctions remain intact; unverified admission cannot approve an artifact.

### 1.3 TASK-e4af63128c7cbec2-s1-t3 — Preserve admission failures in reports and approval readers

Extend current code/design history, publication, completion and approval-preservation readers to represent technical admission failures without fabricated task/chunk assessments. Normalize mutable resourceGuard metadata consistently for publication preservation identity while retaining durable audit receipts and unchanged reviewed-content/approval bindings.

**Acceptance checks:**
- Technical admission failures remain visible across failed admission, next successful attempt, permanent publication and post-cleanup history reads for both families.
- Only independently passed, qualified current whole-story/artifact evidence permits approval; unverified admission or clearance cannot satisfy a gate.
- Resource-only lease/receipt changes do not invalidate published review identity or lose prior approval evidence; lost-publication-receipt replay is idempotent.
- No history reader replays models or silently drops unsupported records.
- Changing reviewed input/source/result fields still invalidates preservation identity; normalization excludes only explicitly mutable operational guard metadata while retaining its audit record.

### 1.4 TASK-e4af63128c7cbec2-s1-t4 — Implement host-owned native process leases

Add proposed src/daemon/threads/review-processes.ts for per-review/incarnation native-command reservations, owned cancellation, bounded output/backpressure and confirmed-disposal tracking. Reuse current process-group/shell lifecycle primitives; make unknown settlement distinct from verified disposal and keep lightweight host lifecycle work separate from worker-side review parsing.

**Acceptance checks:**
- Create each host lease/cancellation handle before spawn; reject closing incarnations and conflicting operation replay, and make identical operation replay non-spawning.
- No native command starts without a durable open-intent receipt for the same registered review/incarnation/lease; worker death during reservation/spawn cannot lose the owner handle.
- Owned abort, process exit, stream-consumer loss and child/group cleanup produce explicit confirmed/unknown outcomes; sent signals and settlement timers are not disposal proof.
- Unknown disposal retains only the target resource fence; other reviews remain usable and replacement provider dispatch stays blocked.
- Existing permission/provenance checks and process-group semantics remain in force; daemon-only native broker is not repurposed for arbitrary children.

### 1.5 TASK-e4af63128c7cbec2-s1-t5 — Bridge native review CLI execution and binary resolution

Integrate the review-worker bridge with src/shared/process-group.ts and src/agent/providers/cli-provider.ts. Route supported native CLI session spawn/output/cancellation through main-host leases while keeping model selection and structured-output parsing in the worker. Remove the review-worker resolveBin synchronous which spawn by host-supplied/asynchronously bridged resolution. Deliver and validate the CLI adapter with bound real-worker fixtures in this task; bootstrap installation, registered host-service connection and public-route activation are owned by t7, t8 and t14 respectively.

**Acceptance checks:**
- Within the CLI adapter exercised by a bound real review worker, no native CLI starts without a host lease and durable intent receipt; cancellation and actual worker termination leave disposal with the surviving host owner. An unbound review-role worker fails before binary lookup or local spawn. Production bootstrap/registry installation is verified in t7/t8 and all supported public routes cut over in t14.
- CLI stream bytes use bounded backpressure and owner-scoped cancellation; structured response and model/tool activity parsing remain in the review worker.
- Review binary lookup cannot execute execFileSync which in the worker; non-review callers keep current behavior and supported reviewer/provider selection is unchanged.
- Fake CLI fixtures cover spawn failure, observer failure, cancellation, late output and worker loss without cloud calls or direct REST access.

### 1.6 TASK-e4af63128c7cbec2-s1-t6 — Bridge review tool, Git and raw-byte subprocess execution

Integrate host leases with src/daemon/tools/shell-helper.ts and review-reachable tool subprocess paths, including runShell, runShellBytes, spawnManaged and streaming/direct spawn sites. Keep permission/provenance checks and output parsing semantics; assemble the complete review-native-spawn inventory with the CLI bridge. Deliver and validate tool/Git adapters with bound real-worker fixtures in this task; bootstrap installation, registered host-service connection and public-route activation are owned by t7, t8 and t14 respectively.

**Acceptance checks:**
- Within the tool/Git adapters exercised by bound real review workers, Git admission, shell/raw-byte/managed-tool commands record durable intent before host spawn and retain exact bytes, exit/error and truncation semantics. An unbound review-role worker refuses local native execution. Production bootstrap/registry installation is verified in t7/t8 and all supported public routes cut over in t14.
- Existing tool approval/provenance and effective abort signals survive the worker bridge; returned output is parsed in the worker.
- An executable inventory refuses every unbridged review-reachable spawn/exec path, including provider binary resolution from t5; other callers are unchanged.
- Real short-lived command fixtures exercise cancellation, byte bounds/backpressure, worker loss and unknown cleanup without affecting another review's leases.

### 1.7 TASK-e4af63128c7cbec2-s1-t7 — Build the dedicated review-worker runtime and bootstrap supervision

Add proposed src/daemon/threads/review-worker.ts using existing startWorker/startDaemonWorker, hub channels, maintenance/store guards and status infrastructure. Each instance hosts exactly one existing code or design family coordinator. Extend parent startup supervision for the approved ready-plus-durable-save bound; this is not a task/model deadline.

**Acceptance checks:**
- Worker startup works from source and compiled out paths and joins existing daemon model/tool/store/lock configuration.
- The worker is dedicated to one canonical review identity and rejects other identities/families or stale incarnation messages.
- Parent-owned 30-second bootstrap deadline starts before creation and ends after readiness plus durable admission-save acknowledgment; late messages cannot revive a closing instance.
- Never-ready and pre-save-hung workers return named failures promptly; resource/lock/store cleanup proceeds with a targeted fence rather than blocking the request indefinitely.
- Failure cannot silently fall back to a main/session worker or introduce an activation flag.
- Before invoking a family coordinator, the bootstrap establishes the immutable review worker role and installs both CLI and tool/Git native transport bindings; missing bindings fail closed. Prove bootstrap behavior with the injected host-service contract here; registered host-service connection belongs to t8 and public-route cutover to t14.

### 1.8 TASK-e4af63128c7cbec2-s1-t8 — Add the main review-worker registry and trusted control bridge

Add proposed src/daemon/threads/review-workers.ts to own per-review routing, registered incarnations, bounded progress cache, subject/cleanup exclusions and trusted owner lifecycle bridging. Reuse current thread/status/supervisor services and review-state host authority; serialize only data, not AbortSignals, providers or live socket objects. Component acceptance uses the registered real-worker host contract; it does not require the production installation, family execution transitions, or cleanup callers that depend on t9/t10/t13/t14.

**Acceptance checks:**
- Distinct valid review identities reserve distinct workers, including same-session and mixed-family submissions; no global review queue is added.
- The main registry requires a trusted-host scope/reviewer resolver, derives controller authority from server-owned connection context, and forwards action/execution/sequence envelopes only to the registered worker's installed family control handler. Tests prove wrong-owner/stale refusal and trusted dispatch reaching the family handler; admission-to-assignment execution is completed in t9/t10 and production resolver installation in t14.
- Worker loss/late messages cannot release another incarnation's reservation or mutate its progress; replacement waits for targeted process and store/lock reclamation.
- Main-owned registry APIs enforce cross-worker design-subject and story/artifact cleanup exclusions in real-worker fixtures. Family execution and cleanup consumers are wired to these APIs in t9/t10/t13, with all production paths verified at t14/t15; this component task must not claim those downstream consumers are already migrated.
- Daemon reviewer lifetime survives observer disconnect; controller-owner loss interrupts only its owned reviews under current recovery rules.
- Connect both installed CLI and shell/tool native adapters through the real worker registry's ReviewProcessLeases using registered worker/port/incarnation identity. Require host permission/provenance and binary-resolution callbacks with no permissive fallback, verify same-family serialized durable open-intent acknowledgments before native launch, and retain host cancellation/disposal proof and the exact review fence on worker loss. Exercise both adapters with explicit host-policy fixtures here; concrete production policy bindings and installed route enforcement are mandatory t14/t15 acceptance.

### 1.9 TASK-e4af63128c7cbec2-s1-t9 — Adapt code review to durable background admission in its worker

Integrate the existing TaskReviewCoordinator and code admission/execution/progress paths with the owner worker and resource-guard writer. Persist unverified input before the acknowledgment, then perform existing route/source/projection/capacity checks and review tasks in that worker. Exercise the adapter through the registry without switching production entrypoints yet.

**Acceptance checks:**
- The durable pending acknowledgment precedes deliberately blocked Git/source admission; no provider call occurs before qualified checkpoint persistence.
- Same-input submission replay after lost acknowledgment observes saved work; conflicting pinned input is refused and admission failure persists with actionable diagnostics.
- Task attribution, dependency ordering, committed after-block scope, explicit final revision and existing projection limits remain unchanged.
- Controller review transitions from pending admission to its first assignment without duplicate admission/execution identities; trusted exchanges and explicit recovery remain valid.
- Shared serialized checkpoint updates retain native open intents alongside task feedback/progress and correctly close only disposed leases.
- Connect code-family controller admission/execution and story-scope reservations to the main registry contract from t8; successful controller assignment/exchanges are exercised through the registered worker, with no worker-local authority replacing main ownership.

### 1.10 TASK-e4af63128c7cbec2-s1-t10 — Adapt design review to durable background admission in its worker

Integrate the existing DesignReviewCoordinator and design subject/admission/planning/chunk/impact paths with the same dedicated worker lifecycle and resource-guard writer. Preserve live artifact monitoring and the current family-specific recovery/technical retry protocol; test registry-backed execution without production cutover yet.

**Acceptance checks:**
- Start/recover acknowledges only after durable unverified input, before expensive subject/history checks; planning/providers cannot run before qualification.
- Epic, standalone and ISSUE-derived artifact routes retain their required ancestry and reviewer-author independence checks.
- Coherent chunks, completed-feedback persistence, impact-selected corrections, final consistency and bounded technical retry behavior are preserved.
- Subject changes invalidate under existing user-directed restart rules; unrelated external changes do not restart the review.
- Design subject claims, controller exchanges and resource intents remain coherent across worker failure/recovery and concurrent reviewers.
- Connect design-family subject claims and controller admission/execution/exchanges to the main registry contract from t8; concurrent worker subject exclusions and trusted successful exchanges are proven without relying on worker-local globals for cross-worker authority.

### 1.11 TASK-e4af63128c7cbec2-s1-t11 — Implement targeted daemon-crash fences and local clearance

Implement request-scoped resourceGuard discovery and exact local-broker clearance as a registered ReviewWorkers component, using a metadata-only recovery worker and the existing family checkpoint writers. Prove the component before production cutover; t13 integrates shared consumers, t14 installs clearance on production code resume/design recover routes, and t15 verifies full production-daemon crash recovery. Clearance alone never dispatches review work. After clearance, a resumable interrupted attempt requires a separate explicit resume/recover; a failed attempt instead requires a separate explicit new-attempt submission, which satisfies the post-clearance recovery requirement. Failed attempts and their pinned input/feedback remain unchanged.

**Acceptance checks:**
- Within the registered real-worker component, an unresolved previous-daemon lease or interrupted legacy active attempt with missing guard reconstructs only that review's fence before native work; PID absence cannot clear it. Installing this fence on every supported production route is mandatory t14 acceptance.
- Through the real existing local broker and socket/client contract, valid human-UI and automated local-client answers are equally accepted; caller-provided receipts and stale/wrong-review/lease-set approval are refused. Existing broker/client authentication is unchanged; production resume/recover route installation is mandatory t14 acceptance.
- No-client, decline, expiry, disconnect, lost pending broker request or changed guard state retains the fence. Re-read all unresolved retained-attempt guards before applying a decision.
- Persist exact bounded request/guard/lease approval receipt and authorized closure idempotently; metadata-only recovery cannot call native tools/providers or grant artifact approval.
- A disposable complete daemon-host process using the real registered ReviewWorkers/bootstrap/native-lease component is crashed while its owned native child survives. A replacement host keeps only that review fenced, allows unrelated reviews and permits work only after clearance plus a separate explicit recovery action (resume/recover for a resumable interrupted attempt, or a new-attempt submission for a failed attempt). This is component evidence, not installed production-daemon qualification; the full production-daemon route/crash test is mandatory t15 acceptance. Never crash the live user daemon.
- Partial clearance leaves remaining leases blocking; repeated clearances and response-loss replay preserve audit evidence without duplicate inference.
- Clearance alone never dispatches review work. After clearance, a resumable interrupted attempt requires a separate explicit resume/recover; a failed attempt instead requires a separate explicit new-attempt submission, which satisfies the post-clearance recovery requirement. Failed attempts and their pinned input/feedback remain unchanged. Ordinary same-attempt start replay after clearance remains refused; new-attempt submission does not silently retry or replace the failed attempt.

### 1.12 TASK-e4af63128c7cbec2-s1-t12 — Expose responsive admission progress across supported clients

Wire bounded per-review worker progress/status into current MCP/RPC readers, daemon thread status, CLI surfaces and live VS Code/JetBrains review DTOs/renderers. Preserve method names, identities and artifact-review behavior; add only the approved admission-phase/diagnostic fields and rendering semantics. Component acceptance in this task uses registered real review workers and the available host-service contract, actual MCP connection classes, daemon/artifact readers and supported client DTO/renderers. Production ReviewWorkers instantiation and atomic public-route activation are deliberately deferred to t14; installed production end-to-end qualification remains mandatory in t15/t16. Do not require production cutover to accept this component task.

**Acceptance checks:**
- Through registered real-worker component fixtures and the available host-service contract, blocked admission does not delay cached progress/status; readers report freshness, timestamps and explicit unverified state rather than fabricated completion. Production route installation is t14 acceptance.
- In the registered code/design worker component, code uses scope_preparation with task:null and unknown inventory represented by numeric zero plus explicit pending/unverified admission; design uses admission phase before its accepted plan.
- Actual supported client DTOs/renderers display Preparing review or technical admission failure from the component's progress projection, never successful empty scope; existing qualified/completed views still decode. Production delivery through the installed registry is verified in t14/t15.
- Registered-worker controller admission-to-assignment tests establish that cached observation preserves owner authority, does not restart admission and does not allocate another execution identity.
- Current vscode-plugin and jetbrains-plugin IPC field names remain aligned; deprecated insrc-ide is outside scope.

### 1.13 TASK-e4af63128c7cbec2-s1-t13 — Route recovery, publication, cleanup and shutdown through the owner

Complete worker-aware resume/recover/publication retry and approval-cleanup paths for both families, including cold worker creation, bounded read-only completed history and shutdown drain order. Preserve existing permanent evidence and execute heavy requalification/publication/cleanup in the target review worker rather than main/session threads.

**Acceptance checks:**
- Explicit recovery retains accepted task/chunk feedback and retry counters and cannot overlap old native work or stale worker ownership.
- Publication retry after worker exit or lost receipt consumes saved feedback only, with providerCalls===0; operational guard updates preserve publication identity.
- Approval cleanup fences the exact story/artifact across workers, refuses/retains active admission/execution/publication, and deletes only evidence-preserved inactive checkpoints.
- Completed reads remain model-free and available after worker exit/cleanup; failed-admission history and clearance receipts survive permanent publication.
- Normal daemon shutdown aborts/drains host native leases before worker termination/reclamation; unknown disposal remains targeted and explicit.
- Bind actual story/artifact approval-cleanup callers to the main registry's exclusion API, including unknown admission scope and active publication; worker-local coordinator maps cannot authorize cross-worker cleanup.

### 1.14 TASK-e4af63128c7cbec2-s1-t14 — Switch all supported review entrypoints to dedicated workers

Replace heavy main-owned coordinator execution in src/daemon/task-review-rpc.ts and src/daemon/design-review-rpc.ts with registry delegation, including normal MCP step routes and supported direct RPC/recovery/cleanup paths. Keep lightweight main-host authority/progress routing where required; remove heavy execution fallbacks rather than adding compatibility switches.

**Acceptance checks:**
- Every code and design review start, continued operation and recovery path reaches its dedicated owner worker; expensive admission/history/model orchestration never runs on main or the chat-session worker.
- Both families cut over together only after required lifecycle/recovery dependencies are ready; no activation flag or main/session fallback remains.
- Optional chat/session threading disabled still requires safe dedicated review workers or returns explicit unavailable.
- Existing retired review endpoints keep their current refusal behavior; no legacy engine is restored.
- The plan/deployment contract forbids installing an intermediate partial build before final qualification.
- Through every supported production review route, CLI and tool/Git native work uses the installed transport and registered host lease with verified durable intent; no review-worker local spawn/exec/binary-lookup bypass remains. This gate discharges the production integration deliberately deferred from component acceptance in t5/t6.
- Install the registry and concrete host-derived reviewer/scope resolution, controller authority, binary resolution, and native permission/provenance policies in daemon production construction. Every supported family/control/recovery/cleanup route consumes these bindings and the shared exclusions. Required callbacks and component fixtures from t8 alone are insufficient for this production gate.
- Install Task 11 resource discovery and exact existing-local-broker clearance on production code resume and design recover entrypoints. Re-read all retained attempts before work; unresolved previous-daemon or legacy uncertainty fences only its review. No caller-provided receipt, PID-absence inference, or clearance-triggered automatic resume is permitted. Clearance alone never dispatches review work. After clearance, a resumable interrupted attempt requires a separate explicit resume/recover; a failed attempt instead requires a separate explicit new-attempt submission, which satisfies the post-clearance recovery requirement. Failed attempts and their pinned input/feedback remain unchanged. This discharges Task 11's deliberately deferred production-route integration.

### 1.15 TASK-e4af63128c7cbec2-s1-t15 — Qualify real concurrent worker isolation and failure recovery

Compose the production entrypoints in real-worker integration fixtures covering code/code, design/design and mixed reviews from same/different sessions, plus targeted crash/cancellation/cleanup cases. Use deterministic barriers and fake native/provider fixtures, not repeated cloud reviews.

**Acceptance checks:**
- A durably acknowledged worker blocked in CPU/admission work cannot prevent daemon status, its own cached progress or an independent review from completing before the barrier is released.
- Valid reviews have distinct runtime threadIds; duplicate same-review start is non-spawning and stale/forged owner messages cannot alter another worker.
- Never-ready/pre-save-hung boot, worker death across native-spawn/save boundaries, controller disconnect, observer disconnect and daemon restart retain targeted semantics.
- Whole-history resource fences and clearance/publication/cleanup replay are exercised through real routing; unrelated review files and processes remain untouched.
- Run existing relevant ownership/admission/progress/checkpoint/recovery/publication/approval suites alongside these regressions with no live-cloud requirement.
- End-to-end fixtures through the actual worker registry and production review routes prove both code/design families use the CLI and tool/Git adapters with host-owned leases, durable intent, bounded byte backpressure and cleanup after real worker loss; unbound or bypassed native execution refuses.
- Through installed production construction, prove host-derived reviewer routing, trusted successful controller exchanges, permission-denied native operations causing zero spawn, and cross-worker design-subject/story-artifact cleanup exclusions for both families.
- Run a disposable full production-daemon crash/replacement test through installed public review routes: persist intent before spawn, crash only the fixture daemon with its native child surviving, retain the exact review fence before native work and allow unrelated review traffic. After the test owner verifies the child ended, use the unchanged normal local broker approval and durable exact-guard receipt; only a separate explicit resume/recover for resumable interrupted work, or a separate explicit new-attempt submission for failed work, permits review work. Failed attempts are never resumed or rewritten. Verify both review families and reject stale/wrong-review/lease-set requests. Never terminate the user's live daemon. This discharges Task 11's deferred installed full-daemon recovery qualification.

### 1.16 TASK-e4af63128c7cbec2-s1-t16 — Verify compiled packaging and document deployment/recovery

Run package and supported-client checks on the complete implementation, prove compiled review-worker startup and both family protocol paths in isolated fixtures, and update docs/daemon.md and docs/workflow.md with worker ownership, pending admission, targeted recovery/local clearance and release coordination.

**Acceptance checks:**
- npm run build produces working out/ worker entrypoints, native helpers and schemas; compiled fixture starts code/design review workers without a source tree dependency.
- Relevant backend/MCP/provider/process/thread regression suites, VS Code typecheck/tests and affected JetBrains DTO tests pass, or environmental/baseline limits are explicitly evidenced without claiming coverage not performed.
- Docs describe local-client broker trust accurately, retain explicit recovery and no new activation flags, and explain that the separate TU1 projection-limit failure is not solved by isolation.
- Create one committed whole-story review packet after all tasks, pin exactly the approved route documents/final source and include full test cases/results. Run the required independent code review before BUILD approval; do not add intermediate per-task independent review rounds.
- Produce release/recovery instructions that require publication/deployment only after independent whole-story review and human BUILD approval, coordinated handling of active reviews, MCP reconnect and a controlled deployed smoke after restart. Validate pre-deployment behavior with compiled fixtures; this Task does not require a deployment or post-deployment result before BUILD approval.

## 2. Test-strategy coverage

| LLD strategy item | Covered by |
| :--- | :--- |
| Proposed src/daemon/threads/__tests__/review-workers.test.ts: reserve one canonical repo/family/reviewId, distinct worker incarnations and correct subject/cleanup exclusions; reject stale-port and forged-owner exchanges. | `t8` |
| Extend family checkpoint/admission/capacity tests: durable admission variant cannot be read as qualified scope, cannot pass approval, retains exact input, fails safely at unchanged projection bounds, and round-trips historical qualified checkpoints. | `t1`, `t2`, `t3` |
| Native-spawn inventory includes CliProvider.resolveBin execFileSync('which', ...), runInProcessGroup, runShell/runShellBytes/spawnManaged and review-reachable direct spawn/exec sites; review workers cannot bypass the host bridge. | `t5`, `t6` |
| Proposed src/daemon/threads/__tests__/review-worker-isolation.test.ts: block review A's expensive admission inside its worker after durable acknowledgment; before releasing its barrier, prove daemon status/progress and review B execute on different threadIds. | `t7`, `t9`, `t10`, `t12`, `t15` |
| Run code/code, design/design and code/design permutations from different sessions and from the same session; same-subject exclusion is tested independently of valid parallel reviews. | `t15` |
| Prove accepted response follows atomic admission save but precedes expensive source/subject work; progress has scope_preparation/task-null and does not claim total or passing verdict. | `t9`, `t10`, `t12`, `t15` |
| Exercise existing start/resume/recover/progress/controller-exchange/publication/cleanup entrypoints through real MCP-step/RPC routing; assert no old main-thread-only route remains and threads-disabled optional session mode never causes fallback. | `t9`, `t10`, `t13`, `t14` |
| Real-worker bootstrap fixture never sends ready, and another hangs before durable-save acknowledgment: parent returns named failure within the bootstrap bound, rejects late replies and keeps only the closing identity fenced until reclaimed. | `t7`, `t15` |
| Proposed src/daemon/threads/__tests__/review-worker-recovery.test.ts: crash before durable save, after save before ack, during qualified task/chunk execution and during publication; prove targeted interruption, saved feedback retention and explicit replacement after reclamation. | `t7`, `t9`, `t10`, `t13`, `t15` |
| Owner disconnect interrupts controller review only; daemon review survives observer disconnect; forged and delayed old-worker messages cannot mutate the replacement. | `t8`, `t15` |
| Same-input replay after lost ack never duplicates dispatch; changed input in pinned attempt is refused; failed admission proceeds only on explicit next attempt, interrupted identical admission on explicit recovery. | `t1`, `t2`, `t9`, `t10` |
| Prove provider/tool child release and lock/store reclamation before replacement dispatch; same-scope approval cleanup refuses active work while unrelated reviews stay alive. | `t4`, `t8`, `t13`, `t15` |
| Existing code/design ownership, checkpoint, progress, recovery, publication and completion-gate regressions continue to pass. | `t9`, `t10`, `t13`, `t15` |
| Crash a worker immediately before a native command request, during host spawn-registration and after child start: all paths have a main-host lease, no orphan provider is left and replacement provider count stays zero until confirmed disposal. Exercise CLI, Git/shell bytes, stream backpressure and late output replies; unbridged review-worker spawn must be refused. | `t4`, `t5`, `t6`, `t15` |
| Failed admission followed by successful next attempt, permanent publication, approval cleanup and post-cleanup read preserves technical diagnostics for both families without fabricating findings. Publication retry with lost receipt and after worker exit proves providerCalls===0. | `t3`, `t13` |
| Real disposable daemon-crash fixture: persist intent before spawn, kill the fixture daemon while its child sentinel survives, start a replacement and request recovery. Prove target fence and providerCalls===0 while an unrelated review works. Reject fabricated receipts and stale/wrong-review/lease-set requests; after test owner observes old child exit, complete the existing normal broker approve path, persist the exact-guard receipt, and permit only a subsequent explicit resume. Test a valid automated local broker answer as supported, without adding human-only provenance. Never terminate the user's live daemon. | `t11`, `t15` |
| Crash at lease reservation, durable-intent save, host spawn, disposal and closure-save boundaries: no command starts without durable open intent; unresolved sets are never lost to simultaneous progress saves, capacity truncation or daemon restart. Metadata-only clearance cannot invoke native tools/providers. | `t1`, `t2`, `t4`, `t11`, `t15` |
| Resource clearance contract: normal local recovery authorization and unchanged broker behavior; accept valid human-UI and automated-local-client answers equally. Denied, expired, disconnected/no-client, unknown or replayed request IDs and concurrent guard changes do not clear. An unresolved guard on an earlier attempt still blocks next attempt, publication retry and cleanup; post-clearance replay cannot dispatch a provider. | `t11` |
| resourceGuard-only updates and clearance receipts preserve published review identity and prior approval evidence: normalize mutable operational fields consistently for preservation digests and lost-publication-receipt replay, retaining the durable audit record. | `t3`, `t11`, `t13` |
| Schema/IPC fixtures prove code and design acknowledgments preserve identity and status meaning, admission-failure results are technical only, unknown/unsupported checkpoint formats are explicit and no unverified input grants approval. | `t1`, `t2`, `t9`, `t10`, `t12` |
| Live vscode-plugin and jetbrains-plugin review DTO/renderer tests tolerate/display admission progress and do not convert pending null-task scope to complete or zero-work success. | `t12` |
| Packaging build includes the new worker entrypoint and starts it from compiled out/ paths; existing workerScript source fallback remains development-only behavior. | `t7`, `t16` |
| Unknown pre-admission totals are numeric zero only with explicit pending/unverified admission and null task; design phase is admission, clients display Preparing review and never count it as empty success. | `t12` |
| After update/restart, observe concurrent code/design reviews on distinct daemon worker threadIds, acknowledge promptly before a controlled long admission, and keep main/session progress responsive. Use stubbed or paused review fixtures for isolation, not repeated cloud reviews. | `t15`, `t16` |
| Resume TU1 S1 only after deployment and a separately valid bounded source-projection scope; do not claim this story removes the 64MiB failure. | `t16` |

## 3. References

- **[[c1]]** `prior-artifact` `.insrc/artifacts/LLD-e4af63128c7cbec2-s1.json` — "Approved contractDetails and dataModelChanges: one dedicated worker for every code/design review, preserving family coordinators and main-host authority."
- **[[c2]]** `prior-artifact` `.insrc/artifacts/LLD-e4af63128c7cbec2-s1.json` — "Approved admission/checkpoint/resourceGuard/history and approval-preservation contracts, including failed admission and historical compatibility."
- **[[c3]]** `prior-artifact` `.insrc/artifacts/LLD-e4af63128c7cbec2-s1.json` — "Approved errorPaths and trusted ownership/progress/recovery rules: explicit identity-scoped failure, no duplicate dispatch or main/session fallback."
- **[[c4]]** `prior-artifact` `.insrc/artifacts/LLD-e4af63128c7cbec2-s1.json` — "Approved worker/process lifecycle contract: host-owned native leases, durable intent before spawn, confirmed disposal, bootstrap bound and native-spawn inventory."
- **[[c5]]** `prior-artifact` `.insrc/artifacts/LLD-e4af63128c7cbec2-s1.json` — "Approved testStrategy and supported-client requirements: real concurrent workers, responsive progress, current IPC shapes and compiled package proof."
- **[[c6]]** `doc` `.insrc/artifacts/LLD-e4af63128c7cbec2-s1.feedback.jsonl` — "Governing entry user-decision-resource-clearance-local-trust-20261109: use existing local-client/operator approval trust with exact review/guard/lease receipts; no new human-only answering authenticat"
