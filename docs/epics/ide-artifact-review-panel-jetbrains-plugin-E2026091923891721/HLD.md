<!-- insrc:artifact HLD-238917216d8fd532 -->

# HLD: Chosen framework a1: a thin three-layer review surface bolted onto existing daemon capability

## Framework summary

Chosen framework a1: a thin three-layer review surface bolted onto existing daemon capability. The daemon gains two small typed request/reply handlers — a read that enumerates the open project's pending-approval artifacts and a write that records reviewer comments through the existing open-question resolution machinery — while approval and artifact-content reads reuse the existing workflow.approve and artifact.get handlers unchanged. The JetBrains plugin extends its existing one-shot Unix-socket DaemonGateway with thin call() wrappers for those methods and adds a JCEF tool-window panel that renders the artifact's own content as HTML with inline PR-style anchored comment threads, a Submit action that records comments as open-question resolutions, and an Approve action that calls the existing approve path. The panel is gated by JBCefApp.isSupported() with a read-only native-editor fallback, and pending-artifact discovery is a bounded poll of the read handler. Reasoning stays entirely daemon-side (k1); the plugin only renders and transports.

## Architecture shape

Three layers, boundary-clean. (1) Daemon (TypeScript, src/daemon): two net-new handlers in the existing IPC registry — a 'workflow.pending' read that scans the project's artifact store for artifacts whose approval state is pending (approvedAt absent, not rejected) and returns typed descriptors, and a 'workflow.resolveComment' write that maps submitted comments onto the existing recordResolution machinery (src/workflow/review/resolve.ts + questions.ts). Reads of an artifact's rendered content reuse artifact.get; approval reuses workflow.approve → approveWorkflowTarget with its block-verdict gate. No new streaming, no event emitter. (2) Plugin transport (Kotlin, jetbrains-plugin .../daemon): the existing DaemonGateway/UnixSocketDaemonRpc.call(method, params) gains thin typed wrappers for pending / get / resolveComment / approve — request/reply only, over the existing local socket (k2). (3) Plugin surface (Kotlin, new .../review package): a JCEF tool window renders the artifact's rendered markdown as HTML with inline anchored comment threads; a JBCefJSQuery bridge carries add/edit/remove-comment, Submit and Approve back to Kotlin, which forwards them through the gateway. JBCefApp.isSupported() gates the rich panel and a read-only native editor view is the fallback (k6). A bounded poll (project-open, IDE focus, coarse timer) of 'workflow.pending' drives discovery (k7). The reviewed content shown is always artifact.get's own output — no second copy (k5).

## Shared contracts

### sc1: PendingArtifactList

**Owner Story:** `s1`
**Consumed by:** `s2`, `s5`

**Purpose:** The typed descriptor of a pending-approval artifact plus the read contract that enumerates them for the open project. Produced by the discovery story; consumed by the stories that open an artifact and that approve it, so both address an artifact by the same identity.

**Interface sketch (type-level):**

```
// daemon IPC 'workflow.pending' (read)
interface WorkflowPendingRequest { readonly repo: string }
interface PendingArtifact {
  readonly artifactId: string;        // canonical file identity, e.g. 'LLD-<hash>-s5' / 'DEF-<hash>'
  readonly kind: 'SPEC' | 'DEF' | 'HLD' | 'LLD' | 'PLAN' | 'ISSUE' | 'CR';
  readonly title: string;
  readonly mdPath: string;            // rendered .md path under docs/
  readonly workItemId?: string;       // canonical E…:S…:T… when present
  readonly openQuestionCount: number;
  readonly state: 'pending';          // approvedAt absent AND not rejected
}
interface WorkflowPendingResult { readonly artifacts: readonly PendingArtifact[] }
```

**Assumptions cited:** [[c2]] [[c7]]

### sc2: ArtifactReviewView

**Owner Story:** `s2`
**Consumed by:** `s3`, `s4`, `s5`

**Purpose:** The read-only view a reviewer sees: the artifact's own rendered content, its open questions, and whether it is currently approvable. Produced by the open/read story; consumed by annotate, submit and approve.

**Interface sketch (type-level):**

```
interface OpenQuestionRef {
  readonly id: string;
  readonly text: string;
  readonly status: 'open' | 'resolved' | 'ignored' | 'deferred';
}
interface ArtifactReviewView {
  readonly artifactId: string;
  readonly kind: string;
  readonly renderedMarkdown: string;   // artifact.get's own rendered content (k5) — never a second copy
  readonly openQuestions: readonly OpenQuestionRef[];
  readonly approvable: boolean;        // false when a review block-verdict stands
  readonly blockReason?: string | null;
}
```

**Assumptions cited:** [[c3]] [[c5]]

### sc3: ReviewComment

**Owner Story:** `s3`
**Consumed by:** `s4`

**Purpose:** The inline-anchored comment model a reviewer builds while reading, plus the write contract that records those comments as open-question resolutions. Defined by the annotate story; consumed by the submit story.

**Interface sketch (type-level):**

```
interface CommentAnchor {
  readonly sectionPath?: string;       // heading path into the rendered artifact, e.g. 'Contract > api'
  readonly quote?: string;             // anchoring text snippet within that section
  readonly openQuestionId?: string;    // set when the comment targets a specific open question
}
interface ReviewComment {
  readonly id: string;                 // client-generated until submitted
  readonly anchor: CommentAnchor;
  readonly body: string;
}
// daemon IPC 'workflow.resolveComment' (write) — records via the existing recordResolution machinery (k4)
interface ResolveCommentRequest {
  readonly repo: string;
  readonly artifactId: string;
  readonly comments: readonly ReviewComment[];
}
interface ResolveCommentResult {
  readonly recorded: number;
  readonly resolutions: ReadonlyArray<{ readonly openQuestionId?: string; readonly status: 'resolved' | 'ignored' | 'deferred' | 'note' }>;
}
```

**Assumptions cited:** [[c5]]

## Story boundaries

### Story E2026091923891721:S001

**Owns:** `sc1`

Private to s1: the daemon-side scan of the project's artifact store that classifies pending (approvedAt absent, not rejected) vs approved vs rejected; the plugin-side poll scheduler (project-open, IDE focus, coarse timer) and the tool-window list entry that renders the pending set, the empty 'nothing awaiting review' state, and the 'backing service unavailable' state. How often the poll fires and how the list is presented are s1's own concerns.

### Story E2026091923891721:S002

**Owns:** `sc2`
**Depends on:** `sc1`

Private to s2: the JCEF browser lifecycle, the JBCefApp.isSupported() gate, the HTML rendering of the artifact's renderedMarkdown, and the read-only native-editor fallback view when JCEF is unavailable. The mechanics of turning renderedMarkdown into displayed HTML stay inside s2.

### Story E2026091923891721:S003

**Owns:** `sc3`
**Depends on:** `sc2`

Private to s3: the inline-anchor UI mechanics (selecting a part of the rendered artifact, showing a thread there), the JBCefJSQuery add/edit/remove-comment bridge, and the un-submitted, presentation-only comment buffer held in the panel before Submit. No approval or resolution reasoning happens here (k1).

### Story E2026091923891721:S004

**Depends on:** `sc2`, `sc3`

Private to s4: the mapping from anchored ReviewComments onto recordResolution calls (which anchor targets which open question, and whether it becomes a resolve / ignore / defer / general note), invoked through the workflow.resolveComment write handler, plus the success/failure reporting so a failed submission is surfaced and never silently dropped.

### Story E2026091923891721:S005

**Depends on:** `sc1`, `sc2`

Private to s5: the Approve action wiring to the existing workflow.approve handler, explicit-override handling, block-reason display when a review verdict withholds approval, and the post-approve refresh so the just-approved artifact drops off the pending list. s5 adds no approval logic of its own — it calls the existing approve path.

## Non-functional targets

- **Performance:** Discovery is a bounded polled read (project-open, IDE focus, a coarse timer) — no hot loop, no held-open subscription (k7). Each poll is one request/reply over the local socket returning a small descriptor list; panel render cost is O(artifact size) inside JCEF. Approval and comment-recording are single request/reply calls.
- **Security:** All daemon access is over the existing local Unix-domain-socket JSON-RPC channel; the plugin opens no cloud or REST path and stores no credentials (k2). Approval flows only through the existing approve path with its block-verdict gate (k3).
- **Observability:** workflow.pending / workflow.resolveComment / approve outcomes are logged through the daemon's standard workflow logging; user-visible successes and failures (submit failed, approval withheld with reason) surface through the plugin's existing 'insrc' notification group.
- **Durability:** Recorded resolutions are persisted daemon-side by the existing recordResolution machinery and approvals by approveWorkflowTarget; un-submitted comments are presentation-only in the panel and are not durable until Submit. The artifact remains the single source of truth (k5).

## Rollout

### Phase A — Discover, read, and approve (minimal review loop)

**Stories:** `s1`, `s2`, `s5`

s1 owns sc1 (the pending list, the root contract everyone addresses artifacts by) and has no dependencies, so it lands first; s2 owns sc2 (the review view) and depends only on sc1; s5 depends only on s2's sc2 + s1's sc1 and reuses the existing approve path. Together these three deliver a complete, shippable in-IDE loop — see what's pending, read it rendered, approve it — without yet requiring the annotation machinery, so the Epic returns user value at the end of Phase A.

**Backward compat:** The existing plugin behaviour is untouched: the single artifact still loads across all four IDEs off the shared platform module, the existing tool windows / notification group / project-open activity are unchanged, and the two reused daemon IPCs (artifact.get, workflow.approve) keep their current contracts. The new 'workflow.pending' read handler is purely additive to the daemon registry.

### Phase B — Inline annotation + submit as open-question resolutions

**Stories:** `s3`, `s4`

s3 owns sc3 (the inline-anchored comment model) and depends on s2's sc2 view; s4 consumes sc2 + sc3 and records comments through the existing recordResolution machinery via the new 'workflow.resolveComment' write handler. These build on the Phase A panel, adding the annotate-and-submit half once the read/approve surface is proven.

**Backward compat:** Phase A's read/approve loop keeps working unchanged; annotation is additive to the panel and the new write handler is additive to the daemon registry. No existing resolution or approval behaviour changes — recordResolution and approveWorkflowTarget are reused as-is.

**Ordering rationale:** Phase order follows the Epic dependency graph and shared-contract ownership: s1 (owns sc1, no deps) → s2 (owns sc2, deps sc1) → s5 (deps sc1+sc2) all land in Phase A so every owner precedes its consumers; s3 (owns sc3, deps sc2) and s4 (deps sc2+sc3) land in Phase B after their upstream contracts exist. Grouping approve (s5) into Phase A rather than a trailing phase is deliberate — it makes Phase A a complete review-and-approve loop, while deferring the heavier JCEF inline-comment work (s3/s4) to Phase B keeps the first shippable increment small. No phase precedes a contract it consumes.

### Risky bits

| Area | Why | Mitigation |
| :--- | :--- | :--- |
| JCEF availability + rendering across the four IDEs and JBR variants (Phase A, s2) | The rich panel depends on the embedded browser, which is absent when an IDE runs a JCEF-less JDK, and rendering fidelity can vary across the bundled runtimes of IDEA/PyCharm/GoLand/WebStorm. | Gate every JCEF use behind JBCefApp.isSupported() (k6) with a read-only native-editor fallback that still carries the Approve action; exercise both the JCEF path and the fallback path in tests, and verify locally against the 2024.2 SDK before shipping. |
| Pending-state detection fidelity (Phase A, s1 / sc1) | If 'pending' is derived from the wrong fields it could list already-approved or rejected artifacts, or hide genuinely-pending ones — breaking ac1. | Derive pending strictly from the same persisted fields approveWorkflowTarget stamps (approvedAt absent AND not rejected), and unit-test the read handler against fixture artifacts in all three states (approved / pending / rejected). |
| Comment-anchor → open-question mapping (Phase B, s3/s4 / sc3) | An inline anchor into rendered HTML does not always correspond to a specific open question, so a naive mapping could mis-record feedback or drop it, violating k4. | Make the anchor model carry an explicit openQuestionId when the comment targets a question and otherwise record it as a general note; route every comment through the single recordResolution sink so nothing is stored in a side-channel, and report any record failure rather than dropping it. |

## Alternatives considered

### a1: Typed daemon read/write IPC pair + JCEF review panel, polled discovery — **CHOSEN**

Two net-new typed daemon IPCs (list-pending read, record-comments-as-resolutions write) reusing the existing approve + artifact-read handlers, driven from the plugin's existing socket client into a JCEF tool-window panel; pending discovery is a bounded polled read.

The daemon gains two small typed request/reply handlers alongside the existing registry in src/daemon/index.ts: a read that enumerates the open project's pending-approval artifacts (kind, identity, path, openQuestions) by the persisted approval state on .insrc/artifacts, and a write that records submitted reviewer comments through the existing recordResolution open-question machinery. Reading an artifact's rendered content reuses artifact.get, and approval reuses workflow.approve/approveWorkflowTarget verbatim — so all reasoning stays daemon-side (k1) and approval keeps its block-verdict gate (k3). No push channel is added; the daemon stays a set of request/reply handlers.

On the plugin side, a new review package adds a JCEF tool window that renders the artifact's own rendered content as HTML with inline PR-style anchored comment threads, with a JBCefJSQuery bridge so the panel's add-comment / Submit / Approve actions call back into Kotlin, which forwards them through the existing DaemonGateway/UnixSocketDaemonRpc.call(method, params). JBCefApp.isSupported() gates the rich panel, falling back to a read-only native editor view carrying the same Approve action (k6). Discovery is a bounded poll (project-open, IDE focus, a coarse timer) of the list-pending read — no hot loop (k7) — and the existing one-shot socket client suffices (k2), needing no streaming support.

**Pros:**
- All four constraints k1/k3/k4/k5 fall out of the design: the plugin only renders + transports, approval routes through workflow.approve, feedback routes through recordResolution, and the body shown is artifact.get's own rendered content.
- No new transport: reuses the plugin's existing one-shot UnixSocketDaemonRpc.call and the daemon's existing request/reply registry — zero streaming infrastructure on either side.
- Typed IPCs (list-pending, record-comments) give the plugin a stable, testable contract rather than parsing on-disk layout.
- JCEF needs no new dependency (core platform) and the isSupported()-gated fallback preserves the single-artifact-across-four-IDEs guarantee (k6).

**Cons:**
- Adds two net-new daemon handlers (still small, but net-new surface in src/daemon/index.ts).
- Polling means a newly-produced artifact appears in the panel only at the next poll tick, not instantly (acceptable per the Epic's non-latency-critical assumption).

**Cost estimate:** L

### a2: Plugin-only, filesystem-driven surface with no new daemon IPC

The plugin discovers pending artifacts and renders them by reading docs/ + .insrc/artifacts directly off disk, and effects submit/approve by driving existing surfaces, adding nothing to the daemon.

The plugin watches and reads the on-disk artifact files directly (the rendered .md under docs/ and the canonical JSON under .insrc/artifacts) to discover which are pending and to render them, using an IntelliJ VFS listener rather than any daemon call. The JCEF panel is identical to a1, but the whole backend interaction is replaced by direct file access plus, for the terminal actions, shelling the existing CLI/MCP surface or writing to the artifact store.

Because approval must stamp approved state through the block-verdict gate and feedback must go through the resolution machinery, a plugin-only design would have to either re-implement that logic client-side or write the artifact JSON itself — both of which move reasoning into the plugin. It keeps the daemon untouched at the cost of coupling the plugin to the private on-disk artifact layout and to logic that the Epic reserves for the daemon.

**Pros:**
- No daemon changes at all — the entire Epic lands in the plugin.
- Filesystem/VFS discovery is near-instant, with no poll latency.

**Cons:**
- Violates k1: effecting approval or recording resolutions from the plugin puts reasoning/logic into what must stay a thin orchestrator.
- Violates k3/k4: approval would not flow through approveWorkflowTarget's gate and feedback would not flow through recordResolution unless the plugin re-implements both.
- Couples the plugin to the private .insrc/artifacts on-disk schema, which is a daemon-internal contract that can change.
- Duplicates approval/resolution logic across daemon and plugin, the exact drift the single-owner constraint exists to prevent.

**Cost estimate:** M

**Rejected because:** Fails the four load-bearing contracts k1/k2/k3/k4 at once: it can only avoid daemon changes by pulling approval + resolution logic and the private artifact schema into the plugin — exactly what the Epic forbids.

### a3: Daemon push-stream subscription + streaming plugin client

A new streaming subscribe IPC pushes pending-artifact events to the plugin in real time, consumed by a new streaming-capable plugin client that opens the panel on the event; approve/submit still reuse the daemon handlers.

The daemon emits an event whenever an artifact is finalized/written and exposes a long-lived streaming subscribe handler (the socket server already supports per-request streaming) that pushes those events to a subscriber. Approval and comment-recording reuse the same daemon handlers as a1. The plugin gains a new streaming-capable socket client (its current UnixSocketDaemonRpc is one-shot and cannot consume a stream) that holds the subscription open and opens/refreshes the panel the moment an artifact becomes pending.

This is the most real-time shape: the reviewer sees a pending artifact appear with no poll delay. It costs the most net-new infrastructure — a daemon event emitter at the artifact write point, a streaming subscribe handler, and a brand-new long-lived streaming client with its own lifecycle/reconnect handling in the plugin — and the Epic explicitly deferred real-time push as a non-goal.

**Pros:**
- Instant, event-driven panel open — no poll latency at all.
- Reuses the socket server's existing per-request streaming mechanism for the subscribe handler.

**Cons:**
- Requires a net-new streaming client in the plugin plus subscription lifecycle/reconnect handling — far more than a1's reuse of the existing one-shot client (violates the spirit of k2's 'existing channel').
- Requires a net-new daemon artifact/approval event emitter, which does not exist today (only the indexer source Watcher does).
- Directly contradicts the Epic non-goal that defers real-time push, for a benefit (sub-poll latency) the non-latency-critical assumption says is not needed.
- More always-on load (a held-open subscription) sits in tension with k7's bounded-discovery intent.

**Cost estimate:** L

**Rejected because:** Constraint-clean on the approval/resolution/render axes but breaks k7 (a held-open subscription is the always-on load the constraint forbids) and only partially meets k2 (a net-new streaming client, not the existing one-shot channel), for a sub-poll-latency benefit the Epic's non-latency-critical assumption says is unnecessary — and it contradicts the deferred-push non-goal.

## Citations

- **[[c1]]** `prior-artifact` `docs epic 61d8c73edb68041a (integrate-insrc-framework-into-jetbrains-ide)` — "The JetBrains plugin is a thin config-orchestrator that owns no reasoning; this Epic adds an in-IDE review/approve surface on top of it."
- **[[c2]]** `code` `src/daemon/index.ts:555,980,994` — "'workflow.approve' (:555), 'artifact.get' (:980), 'artifact.search' (:994) are the registered daemon IPCs; approve + read exist, but no list-pending or submit-comment method does."
- **[[c3]]** `code` `src/workflow/gates.ts:617` — "approveWorkflowTarget(req, opts?) stamps meta.approvedAt and honours the review block-verdict — the existing approve path."
- **[[c4]]** `code` `jetbrains-plugin/src/main/kotlin/ai/insors/insrc/jetbrains/daemon/UnixSocketDaemonRpc.kt:32` — "The plugin already has a one-shot local Unix-domain-socket JSON-RPC client (UnixSocketDaemonRpc/DaemonGateway) that opens only the local socket, never a cloud/REST path."
- **[[c5]]** `analyze-bundle` `capability-discovery / how-does-it-work: open-question resolution machinery + single-source renderers` — "The open-question resolution machinery (recordResolution, src/workflow/review/resolve.ts + questions.ts) and the single-source artifact renderers exist; there is no user-comment-submission IPC and no "
- **[[c6]]** `doc` `https://plugins.jetbrains.com/docs/intellij/embedded-browser-jcef.html` — "The embedded browser (JCEF/JBCefBrowser) is core platform API bundled with the runtime across IntelliJ-Platform IDEs; check availability with JBCefApp.isSupported() before use and provide a fallback w"
- **[[c7]]** `code` `src/indexer/watcher.ts:30 / src/daemon/server.ts:59` — "The only file watcher is the indexer's source watcher; the socket supports per-request streaming but there is no artifact/approval event emitter, so discovery is a bounded polled read."

<!-- insrc:review -->

## Review

### ⛔ Review `BLOCK` — design.epic (design.epic)

**0 HIGH · 1 MED · 6 LOW** · model `client` · reviewed 2026-09-19T06:43:42.517Z

| Ref | Kind | Severity | Fixability | Premise | Evidence | Action |
| --- | --- | --- | --- | --- | --- | --- |
| sc2 | external-contract | MED | manual | JCEF/JBCefApp.isSupported() + JBCefBrowser is core IntelliJ-Platform API bundled with the runtime, gating the rich panel with a fallback — an external-platform contract, not verifiable from this repo. | No repo probe applies — this is an out-of-process IntelliJ-Platform contract (JBCefApp.isSupported()/JBCefBrowser bundled with the JBR). It was grounded this session against the official JetBrains SDK doc, but cannot be re-derived from src/. | Accept as a documented external-platform assumption; the design already mitigates it (isSupported()-gated rich panel + native-editor fallback per k6). No artifact change needed. |
| c2 | citation | LOW | manual | The daemon registers workflow.approve, artifact.get and artifact.search IPC handlers in src/daemon/index.ts (approve + read exist; the framework reuses them). | workflow.approve (src/daemon/index.ts:555), artifact.get (:980), artifact.search (:994) all resolve exactly as registered handlers. | none — verified sound |
| c3 | citation | LOW | manual | approveWorkflowTarget in src/workflow/gates.ts is the approve path that stamps approval and honours the review block-verdict (reused by s5). | export function approveWorkflowTarget confirmed at src/workflow/gates.ts:617. | none — verified sound |
| c4 | citation | LOW | manual | The plugin's DaemonGateway/UnixSocketDaemonRpc.call(method, params) one-shot local-socket client is the transport the new IPC wrappers extend. | class UnixSocketDaemonRpc (UnixSocketDaemonRpc.kt:32), fun call(method,params) on both DaemonGateway.kt:69 and the impl :40, interface DaemonGateway (DaemonGateway.kt:41) all confirmed. | none — verified sound |
| c5 | citation | LOW | manual | The open-question resolution machinery recordResolution exists (src/workflow/review/resolve.ts / questions.ts) and is the sink s4's workflow.resolveComment write reuses. | recordResolution is defined at src/workflow/questions.ts:383 and consumed by src/mcp/workflow-step/phases/resolve-question.ts:78 — the open-question resolution machinery exists as claimed (the canonical definition is questions.ts; resolve-question.ts is the MCP driver). | none — verified sound; the s4 handler reuses recordResolution from src/workflow/questions.ts |
| c2 | closed-union | LOW | manual | workflow.pending and workflow.resolveComment are net-new: no such daemon IPC handler is registered today. | 'workflow.pending' and 'workflow.resolveComment' appear ONLY in this Epic's HLD/DEF docs, with zero matches under src/ — confirming both are net-new, not already-registered handlers. | none — verified sound |
| c7 | citation | LOW | manual | The only file Watcher is the indexer's source watcher (src/indexer/watcher.ts); there is no artifact/approval event emitter, so discovery is a polled read. | export class Watcher confirmed at src/indexer/watcher.ts:30 — the only Watcher; no artifact/approval event emitter exists, so polled discovery is warranted. | none — verified sound |
