<!-- insrc:artifact LLD-e4af63128c7cbec2-s1 -->

# LLD: STORY-e4af63128c7cbec2-s1 — Isolate each code and design review in its own worker thread

## Summary

**Epic:** `isolate-each-code-design-review-its`
**HLD base run:** `wf-1794200131196-25w3ft`
**HLD effective hash:** `47f82f0baf5b...`

Each code or design review runs in a dedicated daemon-owned worker, independent of chat-session threads and other reviews. Submission is durably acknowledged before expensive scope/subject admission, with progress and technical failures visible throughout. Existing review coordinators, judging policies, trusted controller ownership and human approval gates remain authoritative; this change relocates execution and adds the missing admission lifecycle.

## Contents

1. [HLD context](#1-hld-context)
2. [Contract details](#2-contract-details)
3. [Data model changes](#3-data-model-changes)
4. [Diagrams](#4-diagrams)
5. [Error paths](#5-error-paths)
6. [Test strategy](#6-test-strategy)
7. [Migration](#7-migration)
8. [Alternatives considered](#8-alternatives-considered)
9. [References](#9-references)

## 1. HLD context

**Framework:** Standalone feature — no parent HLD. Design directly against the repo, grounded on the s1 analyze passes. There are no HLD shared contracts to honour.
**Rollout phase:** standalone

## 2. Contract details

**Surface level:** internal-shared

### 2.1 `startTaskReview`

```typescript
startTaskReview(raw: unknown, trusted?: TrustedRpcContext, deps?: TaskReviewRpcDeps): Promise<unknown>
```

**Parameters:**
- `raw: unknown` — Existing code-review request; structurally validate bounded repo/reviewId/attempt/pinned packet before dispatch.
- `trusted: TrustedRpcContext` _(optional)_ — Host-supplied caller and controller lifetime authority; never accepted from request fields.
- `deps: TaskReviewRpcDeps` _(optional)_ — Existing test/provider seam; test workers use explicit serializable fixtures rather than cloning closures.

**Returns:** `Promise<unknown>` — Existing acknowledgment identity/path/reviewer fields with status pending once the worker has durably saved an admission-phase attempt; this acknowledges submission, not verified scope. Progress reports scope_preparation with task null until attribution is known. Admission failure is terminal technical feedback, never passed review.

**Errors:**
- `TaskReviewError` when Malformed/oversized request, unregistered/noncanonical repo, wrong owner, conflicting review identity or worker boot/persistence failure before durable acknowledgment.

**Preconditions:**
- Approved source route and author-party checks are preserved, with authority determined by host data rather than caller claims.
- Main registry reserves canonical repo + review family + reviewId; both review families also retain existing subject/cleanup exclusions.

**Postconditions:**
- Expensive committed-source reads/projection and all coordinator execution occur on the dedicated review worker.
- No model call is dispatched before full source/route admission succeeds.
- Daemon review remains live after submitter disconnect; controller-review owner disconnect retains existing explicit recovery requirements.

### 2.2 `designReviewStep`

```typescript
designReviewStep(raw: unknown, trusted?: TrustedRpcContext, deps?: DesignReviewRpcDeps): Promise<unknown>
```

**Parameters:**
- `raw: unknown` — Existing design start/recover/progress/controller exchange with unchanged artifact workflow requirements.
- `trusted: TrustedRpcContext` _(optional)_ — Host-only controller identity/lifetime and client model-selection context.
- `deps: DesignReviewRpcDeps` _(optional)_ — Preserved dependency injection boundary.

**Returns:** `Promise<unknown>` — Start/recover acknowledges a durable admission-phase submission before expensive subject/history checks. Progress and exchange requests route to that review worker; completed results remain read-only when the worker has exited.

**Errors:**
- `DesignReviewError` when Existing subject/owner/action conflict, malformed request, unavailable worker or admission persistence failure. Post-ack technical errors are stored and returned by progress.

**Preconditions:**
- Artifact subject resolves to registered repo and host-authorized path; design artifact lease remains process-wide despite moving coordinator state into workers.
- Main bridge validates connection identity and action envelope; workers cannot mint caller authority.

**Postconditions:**
- Planning, chunk execution, impact/recovery analysis and publication execute only in the owner worker.
- Existing latest-artifact monitoring, user-directed restart policy and bounded technical retries remain unchanged.
- Code and design review method routes cannot silently fall back to main/session execution, including when optional session threading is disabled.

## 3. Data model changes

### 3.1 `Per-review worker ownership registry` — new

Proposed src/daemon/threads/review-workers.ts and src/daemon/threads/review-worker.ts host one existing family coordinator per canonical (repo,family,reviewId). Reuse startWorker, workerScript, startDaemonWorker, HubClient, serveRequests, status-board and supervisor hooks. The registry owns 0..N active worker entries; each active entry owns exactly one worker and one review identity; a worker owns exactly one review, never a pool or a session. An attempt sequence reuses its live owner; after termination, explicit resume/recover/publication retry may spawn a replacement only after the prior worker is gone and its resources are reclaimed. Main registry entries hold threadId, worker incarnation, family, repo, reviewId, attempt, subject/cleanup scope, trusted owner bridge, last published bounded progress and reclaimed promise. These are process-lifetime routing facts, not a second durable review ledger. Use a worker incarnation tied to the registered MessagePort to reject stale exit/progress/result messages; clients cannot supply it. Do not use startClassWorker's singleton class target for per-review routing. Add a review role/identity to existing thread registry/status types where needed, and carry existing session attribution for diagnostics without attaching the worker lifetime to the chat worker. Relationship table (authoritative cardinalities): registry -> active worker entries 0..N; active worker -> review identity exactly 1; review identity -> active worker 0..1; review identity -> trusted controller owner 0..1; controller owner -> owned review identities 0..N; persisted review identity -> checkpoint attempts 1..N; attempt -> review identity exactly 1. Worker/owner references are optional for stored and daemon-reviewed identities; removing a runtime worker never deletes the durable identity. This explicit table replaces the ER companion because the current LinkML renderer cannot express the required inverse cardinalities faithfully.

**Call sites:**
- `src/daemon/threads/workers.ts`
- `src/daemon/threads/worker-entry.ts`
- `src/daemon/threads/channel.ts`
- `src/daemon/threads/router.ts`
- `src/daemon/threads/status-board.ts`
- `src/daemon/threads/supervisor.ts`

### 3.2 `Durable admission-phase checkpoint attempt` — field-add

Extend each family's checkpoint attempt contract with an explicit admission variant rather than creating sidecar packet files or a second authoritative store. Existing admitted attempts retain their current submitted/review-response form and immutable history; historical current-format checkpoints remain readable without rewriting their reviewed content. An admission variant contains the existing immutable submitted input once, attempt number/review identity, operation/action identity, acceptedAt, status pending|running|failed|interrupted, bounded progress, source-validation state unverified, and optional typed technical error. Task/chunk selection and source fingerprints are absent until actually established; absence is not empty successful scope. It cannot carry review findings, a passing verdict, accepted scope or an approval binding. Worker saves this variant atomically before acknowledgment, then qualifies route, pins, source history, subject and capacity using current checks. On success atomically replace the same current attempt with the ordinary admitted variant, transferring the same submitted input and retaining admission timing; only then permit provider work. On failure retain the admission variant and exact input with a bounded code/field/summary. Readers, recovery, capacity and cleanup must discriminate both variants before accessing task/chunk fields. The schema/version gate must advertise the new format; updated readers accept existing qualified history, while an older binary must refuse unsupported admission variants rather than misread them as successful review. Failed admission consumes its attempt identity: corrected inputs require the next explicit attempt; identical interrupted admission resumes only via existing explicit resume/recover semantics. No automatic inference retry and no same-attempt input replacement.

```
CheckpointAttempt = AdmissionAttempt | ExistingQualifiedAttempt; AdmissionAttempt.phase='admission'; validation='unverified'; submitted remains exact and bounded. Only ExistingQualifiedAttempt may own accepted task/chunk scope, finalScope identity or BUILD/artifact approval binding. Format capability/version must be updated in registered schema and readers.
```

**Call sites:**
- `src/workflow/code-review/task-review/coordinator.ts`
- `src/workflow/code-review/task-review/admission.ts`
- `src/workflow/code-review/task-review/checkpoint.ts`
- `src/workflow/code-review/task-review/contracts.ts`
- `src/workflow/review/design-review/checkpoint.ts`
- `src/workflow/review/design-review/contracts.ts`
- `src/workflow/review/design-review/coordinator.ts`

### 3.3 `Submission and acknowledgment ordering` — invariant-change

Sequence: caller -> main existing MCP/RPC adapter -> cheap canonical identity/size/trusted-owner validation and atomic in-memory review reservation -> start one registered worker -> worker structural validation and atomic admission-checkpoint save -> durable-submission acknowledgment -> worker expensive admission -> ordinary qualified checkpoint -> existing family execution -> publication -> bounded final progress -> worker drain/reclaim. Failure before durable save is returned synchronously and releases reservation after worker exit; no acknowledgment is claimed. Response loss after save is discoverable by progress and identical submission replay returns the existing acknowledgment without rerunning work; changed payload for the same pinned attempt is rejected. Observation by another session does not steal controller authority. Main can serve cached worker progress during expensive admission; cache is a bounded projection of durable state with freshness/time and must not fabricate progress. Existing startWorker has no readiness deadline. Add a parent-owned 30-second bootstrap deadline, starting before worker creation and ending only after worker-ready AND confirmed durable admission-save acknowledgment. It is a local startup/save bound, never a review/admission/model deadline. Expiry targets that worker only: mark its incarnation closing, deny new child requests, reject late readiness/save replies as acknowledgments, return review-worker-bootstrap-timeout promptly and initiate targeted stop/reclamation in the background. Keep that identity fenced until child disposal and lock/store reclamation are confirmed; only then release its reservation. If a late atomic save exists, retain it as an interrupted submission discoverable by progress; never overwrite it or silently replay. If cleanup cannot be proven, retain only that identity's resource fence and report recovery-required. No silent main-thread fallback. Reuse scope_preparation/task-null for code admission progress; map design admission to an explicit pre-plan state in its reader contract. Clients must display pending admission and distinguish it from completed empty scope. Progress DTO clarification: reuse code phase scope_preparation with task:null and numeric totalTasks:0 until qualified task inventory is established; zero here means not yet known while status is pending/running and admission.validation is unverified, never successful empty scope. Add optional admission:{state:pending|validating|failed|interrupted,stage,acceptedAt,error?:{code,field?,summary}} to both acknowledgment/progress readers. Design uses phase admission and totalChunks:0 before accepted plan, with the same explicit unverified state. After qualification, existing task/chunk progress applies and totals reflect actual inventory. IDE fixtures/renderers display 'Preparing review' rather than '0 tasks completed'; terminal admission failure is displayed as technical failure, not findings.

**Call sites:**
- `src/daemon/task-review-rpc.ts`
- `src/daemon/design-review-rpc.ts`
- `src/daemon/threads/router.ts`
- `src/daemon/threads/channel.ts`
- `src/workflow/code-review/task-review/progress.ts`
- `src/workflow/review/design-review/progress.ts`

### 3.4 `Trusted controller and tool context bridge` — invariant-change

Keep host connection authority and controller action validation in main-daemon entrypoints. AbortSignal, closures, providers and live sockets are not structured-cloned. Main creates an internal owner handle bound to authenticated connection identity and registered worker port; worker reconstructs a local AbortController from explicit owner-loss/cancellation notifications. Carry only bounded serializable client/model context and existing action/execution/sequence envelopes. Use existing nested routing for daemon-owned services, approved tool execution and permission requests; worker tools preserve existing checks, callbacks and source provenance. A review worker may receive only its own review's exchanges; verify repo/family/reviewId/attempt, worker incarnation and controller owner before forwarding. Untrusted fields cannot impersonate a controller or choose reviewer party. Controller disconnect interrupts only that review according to current protocol; daemon-authored/background reviewer execution survives observer disconnect. Main keeps durable subject/cleanup authority coherent across review workers; global design-artifact leases cannot remain worker-local module globals. Use existing review-state/host ownership services for cross-worker fencing, not new user trust keys.

**Call sites:**
- `src/daemon/task-review-rpc.ts`
- `src/daemon/design-review-rpc.ts`
- `src/daemon/threads/review-state-contract.ts`
- `src/daemon/threads/main-services.ts`
- `src/daemon/threads/worker-requests.ts`
- `src/daemon/threads/router.ts`

### 3.5 `Recovery, publication and approval readers` — invariant-change

Preserve existing task/chunk semantics and permanent CR/design report history. Technical admission failure is rendered as admission failure with no model/task/chunk verdict; add a bounded explicitly non-review admission-failure history section to the existing report contracts where needed so next attempts can retain it without manufacturing task results. Only admitted whole-story/current-artifact independent passing evidence can satisfy approval. Failed admission never binds BUILD or invalidates a prior approval as newly reviewed content. Progress/read-only history remain accessible after worker exit from atomic checkpoints/permanent reports; readers discriminate admission variants without rerunning Git qualification. Publication retries start a dedicated recovery worker if necessary, consume durable feedback only and do not redispatch models. Cleanup after successful approval first fences the specific existing story/artifact scope across workers, drains or refuses active admission/execution/publication, then uses existing evidence-preserving deletion rules in a dedicated worker; never broad-delete other review files. Historical retry/approval paths that currently requalify checkpoints synchronously must route the costly work to that worker too. An already-published review read should not spawn a provider. Add tests for failed admission -> successful next attempt -> permanent publication -> human approval cleanup -> post-cleanup read for BOTH families; technical diagnostics survive in permanent history without becoming review findings or changing earlier approval evidence. Publication retries after lost receipts/worker exit must assert zero provider calls through real routing.

**Call sites:**
- `src/workflow/code-review/task-review/admission.ts`
- `src/workflow/code-review/task-review/coordinator.ts`
- `src/workflow/code-review/task-review/progress-view.ts`
- `src/workflow/review/design-review/coordinator.ts`
- `src/workflow/review/design-review/checkpoint.ts`
- `src/workflow/review/design-review/publication.ts`
- `src/workflow/review/design-review/cleanup.ts`
- `src/daemon/threads/review-state-contract.ts`

### 3.6 `Worker exit and resource ownership` — invariant-change

Add a main-daemon-owned review child-process lease service alongside the worker registry (proposed src/daemon/threads/review-processes.ts); worker death must not own the only cancellation handle. Review computation, model routing, structured-output parsing, tool-output parsing and checkpoints stay in its review worker. Only native process creation, bounded byte transport and lifecycle disposal run in the main host. Reuse the subprocess lifecycle implementations in src/shared/process-group.ts (CliProvider) and src/daemon/tools/shell-helper.ts (Git/tools), with a narrowly scoped injectable bridge installed for review-worker execution. Route ALL worker-originated native commands through that bridge, including admission Git commands, CLI provider sessions, managed tool shell calls and streamed/raw-byte subprocess paths; test an inventory of review-reachable spawn sites and refuse any unbridged native spawn on a review worker. Other non-review callers retain their current execution paths. Do not repurpose src/native/process-broker, whose current command allowlist is daemon-only, or invent claims that StartedWorker.reclaimed disposes child processes.

Each command request is bound to canonical review key + registered worker incarnation/port + unique operationId. Main validates the authorized argv/cwd/tool context through existing permission/provenance checks, creates the lease and its host AbortController BEFORE invoking a spawn-capable helper, and keeps the spawn/registration transition synchronous with respect to worker-exit notifications (no await between lease creation and invoking the helper). If the worker/lease is already closing, refuse before spawn; if it exits during creation, the host-owned abort is already registered and owns disposal. A duplicate operationId with identical input observes that lease, never spawns again; conflicting replay is rejected. The worker receives only serializable output/exit events and local cancellation handles, never a ChildProcess object. Existing activity stream consumption receives bounded chunks with backpressure; parsing remains in the worker. Worker exit rejects outstanding output-consumption replies and aborts every lease for that incarnation, so a dead worker cannot keep the host waiting for output acknowledgment.

Host uses the existing managed process-group cleanup, extends its result to distinguish confirmed close/disposal from kill requested/settlement timeout/unknown, and retains cancellation and exit observation outside the worker. A helper's settlement timeout or a sent signal is NOT disposal evidence. Disposal completes only after owned child close/exit plus the helper's verified owned-group cleanup outcome; permission errors, unknown group state or unclosed descendants retain the targeted resource fence and explicit recovery-required error. Do not kill arbitrary PIDs or use the daemon-only native broker as a generic child terminator. No replacement review worker may dispatch a provider until the old incarnation's command leases are confirmed disposed AND StartedWorker.reclaimed confirms locks/stores. This closes crash-before-spawn, crash-during-spawn and crash-after-spawn registration races without a second review ledger or globally serializing reviews.

Normal terminal execution drains checkpoint/publication saves, host process leases, then worker exit/reclamation before registry release. Unexpected worker death marks only that review interrupted; exact atomic checkpoint and completed feedback remain. Explicit resume/recover creates one replacement after disposal/reclamation; no fabricated family results. Daemon shutdown aborts/drains host-owned leases before terminating workers; after a full daemon crash, unknown previous child disposal must remain an explicit targeted recovery fence until established, never guessed from PID absence alone. Required review workers operate even when optional session routing is disabled. Worker/resource failures are explicit; no global pool, activation flag or fallback engine.

**Call sites:**
- `src/daemon/threads/workers.ts`
- `src/daemon/threads/worker-entry.ts`
- `src/daemon/threads/supervisor.ts`
- `src/daemon/threads/main-services.ts`
- `src/workflow/code-review/task-review/coordinator.ts`
- `src/workflow/review/design-review/coordinator.ts`
- `src/shared/process-group.ts`
- `src/daemon/tools/shell-helper.ts`
- `src/agent/providers/cli-provider.ts`

### 3.7 `Files and scope boundaries` — invariant-change

Proposed new runtime files are src/daemon/threads/review-workers.ts (owner registry/dispatch) and src/daemon/threads/review-worker.ts (single-review worker entrypoint); add focused tests under src/daemon/threads/__tests__. Adapt existing main review RPC adapters, router/method classification/supervisor/status types, family checkpoint/admission/read/publication/cleanup contracts and MCP progress readers/schemas as required. Test families remain existing code/design modules, not a third engine. Live VS Code and JetBrains clients must tolerate/render admission progress and preserve IPC method names/payload identities if shared DTOs change; no deprecated insrc-ide work. No token-accounting code, review judgment algorithm changes, timeout expansion, projection budget increases/optimization, or automatic restarting of another session's reviews. The current TU1 S1 64MiB failure still requires a separately bounded valid scope/implementation correction; worker isolation makes it visible rather than fixing that limit. Correction-round QA evidence is kept only in /tmp: generated sequence/component companions render through headless Chrome using the local offline HTML paths; raw browser DOM and screenshots are available as /tmp/review-worker-sequence-dom.html, /tmp/review-worker-sequence.png, /tmp/review-worker-components-dom.html and /tmp/review-worker-components.png. The reviewer can inspect those independently and may rerun the local headless command; tool unavailability must remain an honest limitation rather than a finding. The obsolete ER companion is removed; the relationship table above is authoritative.

**Call sites:**
- `src/daemon/threads/router.ts`
- `src/daemon/threads/method-class.ts`
- `src/daemon/task-review-rpc.ts`
- `src/daemon/design-review-rpc.ts`

## 4. Diagrams

- [Sequence diagram](docs/standalone/isolate-each-code-design-review-its-E20261109e4af6312/S001/sequence-diagram.html)
- [Component dependencies](docs/standalone/isolate-each-code-design-review-its-E20261109e4af6312/S001/component-dependency.html)

## 5. Error paths

**Error cases**

- **Malformed, oversized, wrong-repository or forged-owner submission** (recoverable)
  - Detection: Existing schema/size guards plus canonical repo and trusted host identity checks fail before worker dispatch or worker durable save.
  - Response: Return existing typed refusal; do not claim durable acceptance, start a provider or create an approval binding. Reclaim any failed bootstrap worker before release.
  - User impact: Actionable refusal without hidden review work.
- **Worker cannot boot or admission checkpoint cannot be saved** (recoverable)
  - Detection: Worker startup error/exit, the parent-owned 30-second ready-plus-durable-save deadline, or rejected atomic checkpoint write before acknowledged persistence.
  - Response: Return worker-start/admission-storage/bootstrap-timeout promptly. Deny late readiness/save acknowledgments for the closing incarnation, retain any late durable input as interrupted and start targeted cleanup. Keep only that identity fenced until host child leases and worker locks/stores are reclaimed; never wait indefinitely on cleanup inside the request or fall back to main/session review execution.
  - User impact: Submission is not accepted; explicit retry is safe after cause is corrected.
- **Expensive admission rejects pins, source projection, subject or capacity after acknowledgment** (recoverable)
  - Detection: Existing family qualification checks throw; including current projection decoded-byte/operation limits.
  - Response: Persist terminal admission failure with exact immutable request and bounded diagnostic; no provider dispatch and no synthetic task/chunk result. Progress/read/report clearly identifies technical admission failure. A changed input needs a new explicit sequential attempt.
  - User impact: Failure remains discoverable after MCP return; scope is not silently weakened.
- **Duplicate start or acknowledgment lost** (recoverable)
  - Detection: Main reservation and saved attempt identity/digest distinguish identical replay, conflicting same-attempt input and genuinely active work.
  - Response: Identical acknowledged request returns existing submission identity without restarting work; conflicting payload is refused. Existing same-review exclusion remains, independently of other review IDs.
  - User impact: No duplicate model calls or accidental overwrite after reconnect.
- **Review worker crashes while admission, execution or publication is active** (recoverable)
  - Detection: Main-host registered worker exit/error plus incarnation check; every native command has a main-owned lease created before spawn, with host cancellation and verified disposal state independent of the worker.
  - Response: Report only that review interrupted from the main progress projection; preserve last checkpoint and published history. Require explicit resume/recover. Do not create replacement or dispatch models before old worker and children are fenced/reclaimed; never synthesize success. On worker loss, reject pending stream-consumer acknowledgments and abort host-owned command leases. A sent signal or helper settlement timeout is not proof of disposal; retain a targeted recovery fence on unknown cleanup.
  - User impact: Other reviews and chat sessions continue; completed feedback is retained.
- **Controller disconnect, forged exchange or stale worker message** (recoverable)
  - Detection: Main-owned connection lifecycle, owner-bound action envelope and registered worker port/incarnation mismatch.
  - Response: Forward loss only to the owning controller review under existing recovery rules; reject forged/stale messages before they mutate checkpoint/status. Daemon reviewer does not inherit observer-disconnect cancellation.
  - User impact: Authority and independent reviewer semantics survive the thread move.
- **Approval cleanup races review admission/execution/publication** (recoverable)
  - Detection: Main cross-worker story/artifact lease and existing evidence-preserving cleanup guard observe a live owner or unresolved worker reclamation.
  - Response: Return targeted busy/retained result; do not delete active checkpoint. Retry cleanup after target is inactive; unrelated workers do not receive cancellation.
  - User impact: No loss of current review evidence or interference with another session.
- **Unsupported admission format encountered by reader, recovery or older daemon** (recoverable)
  - Detection: Checkpoint variant/version capability gate cannot decode admission or qualified attempt safely.
  - Response: Return explicit unsupported-format error and preserve bytes; no blind downgrade, successful-empty interpretation or automatic history rewrite.
  - User impact: Operator can upgrade/recover without losing evidence.

**Edge cases**

| Input | Expected |
| :--- | :--- |
| Code/code, design/design or mixed code/design reviews in different sessions, including two from one session | Distinct valid review identities run on distinct worker threadIds, with independent admission/progress and provider lifetimes; existing same-artifact design exclusion still applies. |
| Optional session-worker routing is disabled | Reviews still require dedicated worker execution; initialize required safe worker services or return explicit unavailable, never execute heavy work on main. |
| Progress query during a deliberately blocked admission computation | Return pending scope preparation, task null, timestamps/freshness and no invented total; unrelated review and daemon status calls complete without waiting for admission. |
| Existing qualified checkpoint from before this change | Updated readers accept it unchanged; explicit recovery runs in a dedicated worker. Historical review inputs, findings and source pins remain immutable. |
| Worker exits after checkpoint save but before caller receives acknowledgment | Progress/retry discovers the durable admission; identical replay does not dispatch another inference. Recovery is explicit if owner died. |
| Publication fails after all task/chunk results were durably recorded | Retain pending publication and feedback; explicit publication retry runs in one recovery worker without models. |

**Invariants to preserve**

- Code-review final source pin and changed-block scope verification, checkpoint input immutability and independent party selection remain mandatory; admission status cannot satisfy BUILD approval. [[c1]]
- Design latest-subject monitoring, user-directed artifact-change restart, impact-aware corrections and bounded technical retry behavior remain in the existing coordinator. [[c2]]
- Workers are daemon-owned, join shared store/lock guards and reclaim resources on exit; IPC clients never directly open daemon stores. [[c3]]
- Controller identity comes from trusted host context and observing a review does not transfer ownership; only targeted controller loss changes its review lifecycle. [[c1]]
- Existing family progress/checkpoint recovery tests remain applicable; cross-worker movement must preserve saved partial feedback and explicit recovery. [[c4]]

## 6. Test strategy

**Test framework:** `node:test with node:assert/strict, executed by Node 22.22.1 and tsx; extend the existing daemon-thread and code/design-review test suites. Actual worker-thread fixtures with deterministic barriers and stubbed providers; no cloud calls for regression tests.`

**Test levels**

- **unit** — Prove exact review ownership, input pinning and schema discrimination without provider dispatch.
  - Subjects: `Proposed src/daemon/threads/__tests__/review-workers.test.ts: reserve one canonical repo/family/reviewId, distinct worker incarnations and correct subject/cleanup exclusions; reject stale-port and forged-owner exchanges.`, `Extend family checkpoint/admission/capacity tests: durable admission variant cannot be read as qualified scope, cannot pass approval, retains exact input, fails safely at unchanged projection bounds, and round-trips historical qualified checkpoints.`
  - Fixtures: `Small pinned review packets and design artifact subjects from existing fixtures.`, `Admission-phase, failed-admission, interrupted-admission and current qualified-history fixtures; no raw prompt transcripts.`
- **integration** — Demonstrate actual isolation and acknowledgment ordering using real worker threads, not only mocked callbacks.
  - Subjects: `Proposed src/daemon/threads/__tests__/review-worker-isolation.test.ts: block review A's expensive admission inside its worker after durable acknowledgment; before releasing its barrier, prove daemon status/progress and review B execute on different threadIds.`, `Run code/code, design/design and code/design permutations from different sessions and from the same session; same-subject exclusion is tested independently of valid parallel reviews.`, `Prove accepted response follows atomic admission save but precedes expensive source/subject work; progress has scope_preparation/task-null and does not claim total or passing verdict.`, `Exercise existing start/resume/recover/progress/controller-exchange/publication/cleanup entrypoints through real MCP-step/RPC routing; assert no old main-thread-only route remains and threads-disabled optional session mode never causes fallback.`, `Real-worker bootstrap fixture never sends ready, and another hangs before durable-save acknowledgment: parent returns named failure within the bootstrap bound, rejects late replies and keeps only the closing identity fenced until reclaimed.`
  - Fixtures: `Real compiled worker entrypoint, existing channel/store-guard/lock fixtures, isolated temporary repo/checkpoints.`, `Worker admission barrier/CPU-block probe and parent-side acknowledgment ordering assertions; generous outer test timeout used only as a test failure guard.`
- **integration** — Preserve failure, cancellation, cleanup, trusted authority and restart semantics across workers.
  - Subjects: `Proposed src/daemon/threads/__tests__/review-worker-recovery.test.ts: crash before durable save, after save before ack, during qualified task/chunk execution and during publication; prove targeted interruption, saved feedback retention and explicit replacement after reclamation.`, `Owner disconnect interrupts controller review only; daemon review survives observer disconnect; forged and delayed old-worker messages cannot mutate the replacement.`, `Same-input replay after lost ack never duplicates dispatch; changed input in pinned attempt is refused; failed admission proceeds only on explicit next attempt, interrupted identical admission on explicit recovery.`, `Prove provider/tool child release and lock/store reclamation before replacement dispatch; same-scope approval cleanup refuses active work while unrelated reviews stay alive.`, `Existing code/design ownership, checkpoint, progress, recovery, publication and completion-gate regressions continue to pass.`, `Crash a worker immediately before a native command request, during host spawn-registration and after child start: all paths have a main-host lease, no orphan provider is left and replacement provider count stays zero until confirmed disposal. Exercise CLI, Git/shell bytes, stream backpressure and late output replies; unbridged review-worker spawn must be refused.`, `Failed admission followed by successful next attempt, permanent publication, approval cleanup and post-cleanup read preserves technical diagnostics for both families without fabricating findings. Publication retry with lost receipt and after worker exit proves providerCalls===0.`
  - Fixtures: `Controlled worker crash points, fake native CLI child with observable termination, provider-call counters.`, `Two independent reviews with separate checkpoints; owner-abort and stale-incarnation messages.`
- **contract** — Keep all registered review surfaces and live IDE clients aligned with admission progress and historical evidence.
  - Subjects: `Schema/IPC fixtures prove code and design acknowledgments preserve identity and status meaning, admission-failure results are technical only, unknown/unsupported checkpoint formats are explicit and no unverified input grants approval.`, `Live vscode-plugin and jetbrains-plugin review DTO/renderer tests tolerate/display admission progress and do not convert pending null-task scope to complete or zero-work success.`, `Packaging build includes the new worker entrypoint and starts it from compiled out/ paths; existing workerScript source fallback remains development-only behavior.`, `Unknown pre-admission totals are numeric zero only with explicit pending/unverified admission and null task; design phase is admission, clients display Preparing review and never count it as empty success.`
  - Fixtures: `Existing shared review wire fixtures plus admission-progress and technical-failure variants.`
- **smoke** — Qualify deployed behavior without uncontrolled review rounds or model costs.
  - Subjects: `After update/restart, observe concurrent code/design reviews on distinct daemon worker threadIds, acknowledge promptly before a controlled long admission, and keep main/session progress responsive. Use stubbed or paused review fixtures for isolation, not repeated cloud reviews.`, `Resume TU1 S1 only after deployment and a separately valid bounded source-projection scope; do not claim this story removes the 64MiB failure.`
  - Fixtures: `Updated daemon with compiled review workers; retained checkpoints; no live review killed without targeted user-authorized action.`

**Acceptance mapping**

| Criterion | Proving tests |
| :--- | :--- |
| `ac1` | `One worker per review for both families: real code/code, design/design, mixed-family and same-session permutations; distinct runtime threadIds and no main/session fallback.` |
| `ac2` | `Durable ack precedes blocked expensive admission; main progress/status and second review complete while first worker is blocked; saved admission failure survives reconnect.` |
| `ac3` | `Trusted-owner bridge refuses forged/stale exchanges; controller disconnect and daemon-observer disconnect retain existing different semantics; no source/pin/approval bypass.` |
| `ac4` | `Crash/restart/recovery fixture retains task/chunk feedback and exact input, requires explicit recovery, and starts replacement only after worker/child/resource reclamation.` |
| `ac5` | `Duplicate input replay is idempotent, changed pinned input refused, subject/cleanup exclusion is shared across workers, and cancel/cleanup affect only target review.` |
| `ac6` | `Historical checkpoint and permanent report compatibility; worker compiled-package smoke; live IDE admission DTO fixtures; unchanged projection-bound refusal remains explicit.` |

## 7. Migration

**State before:** s1 discovery (c1–c4) locates both current main-owned review entrypoints and coordinators, existing worker lifecycle/status primitives, and checkpoint/recovery tests. Code-review start qualifies the committed packet before saving a checkpoint and acknowledging; expensive history projection can outlive MCP 300s. Existing current-format checkpoints contain qualified attempts only; per-review module state and design-subject fencing currently live with main-daemon coordinators.

**State after:** Every code/design review is owned by one dedicated worker from durable admission through execution/publication/recovery. Main host owns routing, trusted connection authority, cross-worker exclusions and progress projections. Existing family checkpoints support explicit unverified admission attempts and qualified history, and updated readers preserve old qualified attempts. Public method names/review identities remain stable; clients display pending admission without treating it as successful empty review. No inference, projection or approval bypass is introduced.

**Zero downtime:** no — **Data rewrite:** no

**Steps**

1. Build the family checkpoint/read/report schema extensions and worker infrastructure together with tests; validate historical qualified fixtures and unverified-admission approval refusal before enabling production routes. No production checkpoint rewrite or activation flag. — ↩ rollbackable
2. Complete mandatory independent code review and human BUILD approval; publish the unified daemon/MCP/schema and live client changes. Coordinate active reviews before restart: let them finish or explicitly interrupt the selected work with preserved checkpoints. Do not terminate another session's review implicitly. — ↩ rollbackable
3. Update/restart daemon and reconnect MCP discovery so all hosts read the new admission variant. Route all new and recovered reviews to dedicated workers immediately; optional session threading does not select a review fallback. Read-only completed records remain accessible without inference. — ✕ non-rollbackable
4. Run compiled-worker and concurrent isolation qualification, confirm targeted resource cleanup and durable admission failures, then resume blocked TU1 work only with separately valid scope. If operational rollback is necessary after new admission records exist, retain upgraded checkpoint readers and those files; do not blind-downgrade to a binary unable to decode them. — ✕ non-rollbackable

**Backward compat:** Preserve existing MCP/RPC method names, reviewId/attempt/action/execution/sequence identity and reviewer independence. Extend registered output/read schemas and client fixtures for admission visibility; code pending status/scope_preparation remain pending and unverified, not a passing verdict. Updated readers accept historical qualified checkpoints and permanent results unchanged. New admission variants are version/capability checked and unsupported readers refuse explicitly. Existing attempt bytes and input pins are not rewritten; only current lifecycle transitions use the new variant. Publication histories distinguish technical admission failures from real task/chunk assessments. A state-preserving rollback after first new-format write must keep compatible readers; there is no legacy-review fallback.

## 8. Alternatives considered

### 8.1 a1: One per-review worker host with family-specific adapters — **CHOSEN**

Use one worker entrypoint and supervisor registry; each worker owns exactly one code or design review and delegates to that family's existing coordinator.

Reuse src/daemon/threads/workers.ts startup/reclamation and hub transport. The main daemon maintains trusted ownership/routing and per-review reservations; a worker hosts one existing review-family coordinator and its admission/execution/publication. Extend each family's existing checkpoint with a bounded durable admission variant, not another canonical review ledger. Forward trusted controller exchanges to the owner worker through the main authority bridge. Preserve family-specific review schemas and recovery behavior; add only the shared execution-lifecycle envelope required for isolation.

### 8.2 a2: Separate code-review and design-review worker hosts

Use distinct worker entrypoints and adapter types for the two review families under the existing daemon worker infrastructure.

Main-daemon routing launches a code-only or design-only worker for each review identity. Both hosts independently implement durable admission dispatch, progress forwarding, trusted-controller bridging and worker-exit recovery, while reusing common thread/channel primitives. Existing review coordinators continue to own model/review semantics and persistent family histories.

**Rejected because:** Distinct family hosts meet isolation but duplicate admission, trusted ownership and worker-exit coordination.

## 9. References

- **[[c1]]** `code` `src/workflow/code-review/task-review/coordinator.ts` — "s1 code discovery: src/daemon/task-review-rpc.ts and src/workflow/code-review/task-review/coordinator.ts; verified committed-source admission, per-review reservation, background scheduling and trusted"
- **[[c2]]** `code` `src/workflow/review/design-review/coordinator.ts` — "s1 code discovery: src/daemon/design-review-rpc.ts and src/workflow/review/design-review; coordinator, checkpoint, recovery, subject and publication modules."
- **[[c3]]** `code` `src/daemon/threads/workers.ts` — "s1 worker reuse discovery: src/daemon/threads/workers.ts, src/daemon/threads/worker-entry.ts, src/daemon/threads/channel.ts, src/daemon/threads/status-board.ts, src/daemon/threads/router.ts, src/daemo"
- **[[c4]]** `code` `src/daemon/threads/__tests__/review-state-concurrency.test.ts` — "s1 test discovery plus direct source corroboration: existing code/design ownership, admission, checkpoint, progress and recovery suites and src/daemon/threads/__tests__/review-state-concurrency.test.t"
- **[[c5]]** `prior-artifact` `.insrc/artifacts/ISSUE-e4af63128c7cbec2.json`
- **[[c6]]** `stakeholder` `User requires a separate worker thread for every review, both code and design, rather than main-daemon or per-chat-thread execution.`
- **[[c7]]** `code` `src/shared/process-group.ts`
- **[[c8]]** `code` `src/daemon/tools/shell-helper.ts`
- **[[c9]]** `code` `src/agent/providers/cli-provider.ts`
