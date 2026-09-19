<!-- insrc:artifact LLD-238917216d8fd532-s5 -->

# LLD: E2026091923891721:S005

**Epic:** `ide-artifact-review-panel-jetbrains-plugin`
**HLD base run:** `wf-1789799576767-kl7v1b`
**HLD effective hash:** `c93cb4358ff4...`

## HLD context

**Framework:** Chosen framework a1: a thin three-layer review surface bolted onto existing daemon capability. The daemon gains two small typed request/reply handlers — a read that enumerates the open project's pending-approval artifacts and a write that records reviewer comments through the existing open-question resolution machinery — while approval and artifact-content reads reuse the existing workflow.approve and artifact.get handlers unchanged. The JetBrains plugin extends its existing one-shot Unix-socket DaemonGateway with thin call() wrappers for those methods and adds a JCEF tool-window panel that renders the artifact's own content as HTML with inline PR-style anchored comment threads, a Submit action that records comments as open-question resolutions, and an Approve action that calls the existing approve path. The panel is gated by JBCefApp.isSupported() with a read-only native-editor fallback, and pending-artifact discovery is a bounded poll of the read handler. Reasoning stays entirely daemon-side (k1); the plugin only renders and transports.
**Rollout phase:** Phase A — Discover, read, and approve (minimal review loop)
**Consumes:** `sc1` (PendingArtifactList), `sc2` (ArtifactReviewView)

**Adjacent scope (owned by other stories — do NOT implement here):**
- `s1`: Private to s1: the daemon-side scan of the project's artifact store that classifies pending (approvedAt absent, not rejected) vs approved vs rejected; the plugin-side poll scheduler (project-open, IDE focus, coarse timer) and the tool-window list entry that renders the pending set, the empty 'nothing awaiting review' state, and the 'backing service unavailable' state. How often the poll fires and how the list is presented are s1's own concerns. — owns `sc1`
- `s2`: Private to s2: the JCEF browser lifecycle, the JBCefApp.isSupported() gate, the HTML rendering of the artifact's renderedMarkdown, and the read-only native-editor fallback view when JCEF is unavailable. The mechanics of turning renderedMarkdown into displayed HTML stay inside s2. — owns `sc2`
- `s3`: Private to s3: the inline-anchor UI mechanics (selecting a part of the rendered artifact, showing a thread there), the JBCefJSQuery add/edit/remove-comment bridge, and the un-submitted, presentation-only comment buffer held in the panel before Submit. No approval or resolution reasoning happens here (k1). — owns `sc3`
- `s4`: Private to s4: the mapping from anchored ReviewComments onto recordResolution calls (which anchor targets which open question, and whether it becomes a resolve / ignore / defer / general note), invoked through the workflow.resolveComment write handler, plus the success/failure reporting so a failed submission is surfaced and never silently dropped.

## Contract details

**Surface level:** internal

### `workflow.approve`

```typescript
// EXISTING daemon IPC, reused UNCHANGED (src/daemon/index.ts:555). params: { repo?: string; artifactPath?: string; epicHash?: string; overrideReview?: string } -> WorkflowApproveResult | { error }
```

**Parameters:**
- `repo: string | undefined` _(optional)_ — Only needed for an epicHash batch; unused for a single artifactPath approve (S005 always sends a single artifactPath).
- `artifactPath: string | undefined` _(optional)_ — The ABSOLUTE .md path of the artifact to approve (jsonPathForMd maps it to the sibling .json). S005 composes projectRootPath + '/' + the sc1 mdPath.
- `overrideReview: string | undefined` _(optional)_ — The explicit-override reason; when present the review block-verdict gate is bypassed (approve past a block). Absent for a normal approve.

**Returns:** `WorkflowApproveResult | { error: string }` — WorkflowApproveResult = { approved: {path, result}[]; skipped: {path, reason}[]; codeReview: [] } (gates.ts:584). For a single approve: approved has the artifact on success; a review-blocked artifact is in skipped[] with the gate reason (ok=true, NOT an error). A missing artifact THROWS -> the transport surfaces a top-level error (ok=false); a missing repo for a batch RETURNS { error }.

**Errors:**
- `top-level error (ok=false)` when ArtifactMissingError (the .md/.json not found) thrown by approveWorkflowTarget, or a { error } reply (missing repo for a batch) — both surfaced as ok=false by the transport.

**Preconditions:**
- S005 reuses this handler UNCHANGED (lc1/k3) — no daemon edit
- artifactPath is an absolute .md path that resolves to a persisted artifact json

**Postconditions:**
- On success the artifact's meta.approvedAt is stamped by approveArtifactByJsonPath and it appears in approved[]
- A review-blocked artifact (no override) is NOT stamped and appears in skipped[] with the gate reason

### `DaemonGateway.approve`

```typescript
fun approve(projectRootPath: String, mdPath: String, overrideReason: String? = null): ApproveResult
```

**Parameters:**
- `projectRootPath: String` — The project base path; combined with mdPath to form the absolute artifactPath.
- `mdPath: String` — The selected artifact's sc1 mdPath (the pending descriptor / S002 view already holds it).
- `overrideReason: String?` _(optional)_ — When non-null, sent as overrideReview to approve past a review block (the 'Approve anyway' affordance).

**Returns:** `ApproveResult (Approved | Withheld | Unavailable)` — A pure three-state classification of the workflow.approve reply, mirroring S002's ArtifactContentResult: Approved when approved[] is non-empty; Withheld(reason) when skipped[] is non-empty (the block gate — NOT a success); Unavailable(reason) on ok=false / DaemonUnavailable / a malformed or empty reply. The plugin NEVER treats a skipped[] (withheld) or an ok=false as approved (k1/k3).

**Errors:**
- `ApproveResult.Unavailable` when DaemonUnavailable, a non-ok reply (missing artifact / {error}), or a malformed/empty reply — classified verbatim, no client approval reasoning (k1).

**Preconditions:**
- The one-shot UnixSocketDaemonRpc channel is used (k2); no cloud/REST path
- The panel only enables normal Approve when the S002 view.approvable is true; the override path is explicit

**Postconditions:**
- On Approved the panel notifies + triggers the existing ReviewPanel.refreshNow() so the artifact drops off the pending list (ac3/k7)
- On Withheld the blockReason is shown (ac2); on Unavailable the failure is surfaced

## Data model changes

### `ApproveResult` — new

A plugin-internal Kotlin sealed result (Approved | Withheld(reason: String) | Unavailable(reason: String)) that classifies the workflow.approve reply. Mirrors S002's ArtifactContentResult (Loaded|Unavailable) and S004's ResolveCommentResult (Recorded|Unavailable). No daemon data model change — workflow.approve + WorkflowApproveResult are reused unchanged.

**Call sites:**
- `jetbrains-plugin DaemonGateway.approve (classification)`
- `jetbrains-plugin ArtifactContentPane (Approve action -> Approved/Withheld/Unavailable handling)`

## Interaction with shared contracts

| Contract | Role | How |
| :--- | :--- | :--- |
| `sc1` | consumes | Consumes the pending descriptor's mdPath (owned by s1) to compose the absolute artifactPath for workflow.approve, and reuses the S001 ReviewPanel.refreshNow() poll to drop the just-approved artifact off the pending list — without re-designing the poll (s1's adjacent boundary). |
| `sc2` | consumes | Consumes the ArtifactReviewView's approvable + blockReason (owned by s2) to pre-disable normal Approve and show the block reason before any call, and to know the artifactId/mdPath of the open artifact. No redesign of the view. |

## Error paths

### Error cases

- **The daemon is unreachable when the reviewer clicks Approve.** (recoverable)
  - Detection: UnixSocketDaemonRpc.call() throws DaemonUnavailableException; DaemonGateway.approve catches it.
  - Response: Return ApproveResult.Unavailable(reason); the panel surfaces a failure notification via the 'insrc' group and leaves the artifact pending (no refresh).
  - User impact: The reviewer sees 'approve failed — daemon unavailable'; the artifact still appears pending to retry.
- **The artifact .md/.json is missing (e.g. moved/rejected since the view loaded).** (recoverable)
  - Detection: approveWorkflowTarget throws ArtifactMissingError; the daemon dispatch surfaces it as a top-level error, which UnixSocketDaemonRpc.parse maps to ok=false.
  - Response: DaemonGateway.approve maps ok=false to ApproveResult.Unavailable(reason); the panel surfaces it.
  - User impact: The reviewer sees the specific failure; nothing is approved.
- **A review-blocked artifact is approved WITHOUT an override.** (recoverable)
  - Detection: The reply is ok=true with skipped[] non-empty (approveWorkflowTarget routed it to skipped with the gate reason); approved[] is empty.
  - Response: DaemonGateway.approve returns ApproveResult.Withheld(skipped[0].reason) — the plugin does NOT treat ok=true as success; the panel shows the block reason and does not refresh/advance (ac2).
  - User impact: The reviewer sees 'approval withheld: <reason>' matching the workflow's own gate; the artifact stays pending.
- **A malformed or empty approve reply (ok=true but BOTH approved[] and skipped[] empty).** (recoverable)
  - Detection: DaemonGateway.approve finds neither an approved nor a skipped entry after classification.
  - Response: Return ApproveResult.Unavailable('no artifact approved or withheld') rather than silently reporting success — a defensive default so an unexpected shape is never read as Approved.
  - User impact: The reviewer sees a generic failure rather than a false 'approved'; the artifact stays pending.
- **The open artifact has no mdPath / the project has no repo path (cannot compose the artifactPath).** (recoverable)
  - Detection: The panel checks the selected mdPath / project.basePath before calling; both must be non-empty.
  - Response: The Approve action is disabled / no-ops with a one-line notice; workflow.approve is never called with an empty path.
  - User impact: Approve is unavailable for an artifact with no resolvable path; a clear notice explains why.

### Edge cases

| Input | Expected |
| :--- | :--- |
| The artifact was already approved (e.g. via the TUI) between load and the IDE Approve click. | approveArtifactByJsonPath is idempotent on an already-approved artifact — it returns in approved[] (approvedAt already set); the plugin treats it as Approved and refreshNow() drops it off the pending list. No error. |
| An overrideReview reason is supplied for an artifact that is NOT actually blocked. | workflow.approve approves normally; the override is harmless (it only bypasses a block that would otherwise route to skipped[]). Approved. |
| The panel is in the native (non-JCEF) fallback (JCEF unsupported). | Approve is a Swing action + a gateway call, NOT a JCEF feature, so it remains AVAILABLE in the native fallback (unlike S003/S004 annotation which is JCEF-only). The approvable/blockReason from the S002 view still gate it. |
| The approve reply carries a codeReview[] array. | The plugin ignores codeReview[] (no consumer); classification uses approved[]/skipped[] only. No divergent handling. |
| The reviewer clicks 'Approve anyway' and provides an empty override reason. | Treat an empty/blank override as no override (a normal approve) — the block gate still applies; the reviewer must give a non-empty reason to bypass a block, mirroring the daemon's overrideReview semantics. |

### Invariants to preserve

- Approval is effected ONLY through the existing workflow.approve -> approveWorkflowTarget path that stamps meta.approvedAt and honours the review block-verdict gate; the plugin never marks an artifact approved by any other route (lc1). [[c3]]
- A skipped[] entry in the approve reply is a WITHHELD approval (ok=true), NOT a success and NOT an error — the plugin classifies by approved[]/skipped[], never by ok alone, so a withheld approval can never be read as approved (the k3 gate fidelity). [[c3]]
- The plugin owns no approval reasoning: it composes the request, classifies the daemon's reply verbatim into Approved/Withheld/Unavailable, and transports — all gate logic stays daemon-side. [[c1]]
- The post-approve refresh reuses the existing bounded, generation-guarded ReviewPanel poll (refreshNow); S005 adds no new poll or hot loop and does not re-design the S001 discovery (adjacent boundary). [[c7]]

## Test strategy

**Test framework:** `JUnit5/Kotlin via `./gradlew test` on JDK21 (plugin) — no daemon change (workflow.approve reused unchanged), so no new daemon test`

### Test levels

- **unit** — Prove DaemonGatewayImpl.approve classifies the workflow.approve reply into Approved/Withheld/Unavailable verbatim, INCLUDING across the real transport framing boundary (the S001 lesson) — mirrors ArtifactContentTest/ResolveCommentTest.
  - Subjects: `approve over a fake DaemonRpc: ok with approved[] non-empty -> Approved; ok with skipped[] non-empty -> Withheld(skipped[0].reason) (NOT a success); ok=false -> Unavailable; DaemonUnavailable -> Unavailable; ok=true but approved+skipped both empty -> Unavailable (never a false Approved)`, `the request composes the ABSOLUTE artifactPath from projectRootPath + mdPath and sends method 'workflow.approve' with { repo, artifactPath }; overrideReason non-null -> overrideReview present; null/blank -> overrideReview absent`, `the REAL UnixSocketDaemonRpc.parse across the boundary: {result:{approved:[...],skipped:[]}} -> Approved; {result:{approved:[],skipped:[{reason}]}} -> Withheld(reason); {result:{error}} -> ok=false -> Unavailable`
  - Fixtures: `a FakeDaemonRpc returning canned DaemonResult values (asserting the method + params)`, `raw {result:{approved,skipped}} / {result:{error}} JSON strings to drive UnixSocketDaemonRpc.parse`
- **unit** — Prove the pure panel-decision helpers (enable/override/refresh) headlessly — keep the load-bearing UI logic out of the Swing layer.
  - Subjects: `the Approve-enable decision: normal Approve enabled iff the S002 view.approvable is true; blocked -> disabled + blockReason shown`, `an empty/blank override reason is treated as NO override (a normal approve), a non-empty reason bypasses the block`, `the post-approve refresh decision: refresh (drop-off) triggered iff the result is Approved (not on Withheld/Unavailable)`
  - Fixtures: `ArtifactReviewViewDto fixtures with approvable true/false + a blockReason`, `ApproveResult fixtures (Approved/Withheld/Unavailable)`

### Acceptance mapping

| Criterion | Proving tests |
| :--- | :--- |
| `ac1` | `approve maps ok+approved[] -> Approved (unit)`, `the request sends method 'workflow.approve' with the composed absolute artifactPath (unit)`, `the real parse boundary: {result:{approved:[...]}} -> Approved (unit)` |
| `ac2` | `approve maps ok+skipped[] -> Withheld(skipped[0].reason), never Approved (unit)`, `the real parse boundary: {result:{skipped:[{reason}]}} -> Withheld(reason) (unit)`, `an empty override reason is treated as no override so the block gate still applies (unit)`, `the Approve-enable decision disables normal Approve + shows blockReason when view.approvable is false (unit)` |
| `ac3` | `the post-approve refresh decision triggers a list refresh ONLY on Approved (unit)`, `manual/backstopped: on Approved the panel invokes the existing ReviewPanel.refreshNow() so the artifact drops off the pending list (the Swing/JCEF wiring is the residual, recorded in the CR)` |

## Migration

**State before:** The daemon already exposes workflow.approve (index.ts:555) -> approveWorkflowTarget (gates.ts:617) which stamps meta.approvedAt and enforces the review block-verdict gate (blocked -> skipped[], overrideReview bypasses). The plugin's DaemonGateway wraps pendingArtifacts (S001) + artifactReviewView (S002, carrying approvable + blockReason) + resolveComment (S004); the ReviewPanel has a bounded generation-guarded poll with refreshNow() (ReviewToolWindow.kt:124) and an ArtifactContentPane content view. But there is NO Approve action in the panel — approval can only be given from the TUI/MCP.

**State after:** The plugin gains DaemonGateway.approve(projectRootPath, mdPath, overrideReason?) that composes the absolute artifactPath, calls the UNCHANGED workflow.approve, and classifies the reply into a plugin-internal ApproveResult (Approved | Withheld(reason) | Unavailable(reason)). The ArtifactContentPane gains an Approve action (available in both the JCEF and native views) enabled per the S002 approvable flag with the blockReason shown, an 'Approve anyway' override affordance, and on Approved it triggers the existing ReviewPanel.refreshNow() + notifies. The daemon, workflow.approve, approveWorkflowTarget, and the S001 poll are all unchanged.

**Zero downtime:** yes — **Data rewrite:** no

### Steps

1. Add the plugin-internal ApproveResult sealed type + DaemonGateway.approve wrapper (classification: approved[] -> Approved, skipped[] -> Withheld, ok=false/empty -> Unavailable) + the override doubles in the gateway test doubles. Purely additive to the DaemonGateway interface. — ↩ rollbackable
2. Wire the Approve action into ArtifactContentPane: an Approve button gated by the S002 view.approvable (blockReason shown when false), an 'Approve anyway' override prompt, an off-EDT gateway.approve call marshaled to the EDT, and outcome handling (notify + a refresh callback on Approved; show reason on Withheld; surface on Unavailable). — ↩ rollbackable
3. Provide the post-approve refresh: ReviewPanel passes an onApproved callback to the content pane that invokes the existing refreshNow() so the just-approved artifact drops off the pending list. No new poll machinery. — ↩ rollbackable
4. Verify locally: ./gradlew test JDK21 (plugin). No daemon change, so no daemon tsc/test needed beyond confirming workflow.approve is untouched. — ↩ rollbackable

**Backward compat:** Fully backward compatible: no daemon change — workflow.approve + approveWorkflowTarget + WorkflowApproveResult are reused UNCHANGED, so every existing approve caller (TUI, MCP insrc_workflow_approve) is unaffected. The plugin change only ADDS a method to the DaemonGateway interface (existing wrappers unchanged) + an Approve affordance to the panel. An older plugin simply never calls it; the daemon reply shape it reads (approved/skipped) has been stable since the code-review-gate epic. No existing public API signature changes; no persisted data shape changes.

## Alternatives considered

### a1: Three-state ApproveResult (Approved | Withheld | Unavailable), classified from approved/skipped, with an explicit override — **CHOSEN**

A thin gateway.approve(repo, mdPath, overrideReason?) that calls workflow.approve and maps the reply to a pure three-state result: Approved (approved[] non-empty), Withheld(reason) (skipped[] non-empty — the block gate, NOT an error), or Unavailable (ok=false). The panel pre-disables Approve when the S002 approvable=false + shows blockReason, offers an 'Approve anyway' override, and on Approved refreshes the list.

DaemonGateway gains approve(projectRootPath, mdPath, overrideReason?): ApproveResult mirroring S002's ArtifactContentResult. It sends workflow.approve { repo, artifactPath: <projectRootPath + mdPath, absolute>, overrideReview?: overrideReason }. A PURE classifier maps the reply: ok=false / DaemonUnavailable / malformed -> Unavailable(reason); else approved.length>=1 -> Approved; else skipped.length>=1 -> Withheld(skipped[0].reason); else Unavailable('no artifact approved or skipped'). The content pane shows an Approve button enabled only when the S002 view.approvable is true (blockReason shown when false); an 'Approve anyway' affordance prompts for a one-line override reason and re-calls with overrideReview. On Approved the panel notifies + triggers the existing ReviewPanel.refreshNow() so the artifact drops off the pending list; Withheld shows the reason; Unavailable surfaces the failure. All classification is daemon-fed (k1); no client approval logic.

### a2: Client-gated Approve only (no override), enable strictly on approvable=true

The panel enables Approve ONLY when the S002 view.approvable is true and never sends overrideReview; a blocked artifact simply shows its blockReason with a disabled button, and Approve calls workflow.approve expecting success.

DaemonGateway.approve(projectRootPath, mdPath): ApproveResult with just Approved | Unavailable. The panel enables Approve iff view.approvable; when false it shows blockReason and the button stays disabled (so approve is never even attempted on a blocked artifact). On click it sends workflow.approve { repo, artifactPath } (no overrideReview) and treats approved[] non-empty as Approved, anything else as Unavailable. On Approved it calls refreshNow().

**Rejected because:** Simplest, and ac1/ac3 hold, but it drops the explicit-override the boundary requires and weakens ac2/k3 fidelity by trusting the client approvable flag instead of classifying the daemon's authoritative approve reply.

### a3: Raw pass-through: gateway forwards approved[]/skipped[], the panel classifies inline

The gateway returns the raw WorkflowApproveResult (approved[]/skipped[] DTOs) to the panel and the panel decides Approved/Withheld/failure inline, rather than a pre-classified result type.

DaemonGateway.approve(projectRootPath, mdPath, overrideReason?): a two-state Loaded(WorkflowApproveResultDto) | Unavailable. The panel reads result.approved / result.skipped directly and decides what to show. Override is still supported by forwarding overrideReview.

**Rejected because:** Faithful to the daemon shape but pushes the k3-critical approved-vs-skipped classification into the untestable panel — exactly the JCEF/Swing-layer logic the project's recurring lesson says to keep pure and tested; higher risk of a silent 'withheld read as approved' than a1.

## Citations

- **[[c1]]** `analyze-bundle` `s1 how-does-it-work bundle: workflow.approve (src/daemon/index.ts:555) + approveWorkflowTarget (src/workflow/gates.ts:617-685) request params, WorkflowApproveResult approved[]/skipped[] shape, the block-verdict gate + approvedAt stamp`
- **[[c2]]** `analyze-bundle` `s1 capability-discovery bundle: the S002 approvable/blockReason DTO + the S001 ReviewPanel.refreshNow() generation-guarded poll (ReviewToolWindow.kt:124) + the one-shot DaemonGateway pattern`
- **[[c3]]** `prior-artifact` `HLD shared contract sc2 ArtifactReviewView (approvable/blockReason, owned by s2, consumed by s5)`
- **[[c4]]** `prior-artifact` `HLD shared contract sc1 PendingArtifactList (mdPath identity + workflow.pending, owned by s1, consumed by s5)`
- **[[c5]]** `code` `src/workflow/gates.ts:584 (WorkflowApproveResult { approved:{path,result}[]; skipped:{path,reason}[]; codeReview:[] }) + :617-685 (approveWorkflowTarget: artifactPath->jsonPathForMd, block-verdict routes to skipped[], overrideReview bypass)`
- **[[c7]]** `analyze-bundle` `s1 capability-discovery bundle: the bounded generation-guarded ReviewPanel poll refreshNow() (ReviewToolWindow.kt:124) reused for the post-approve drop-off (k7); no new poll machinery`

<!-- insrc:review -->

## Review

### ✅ Review `PASS` — design.story (design.story)

**0 HIGH · 0 MED · 0 LOW** · model `client` · reviewed 2026-09-19T13:40:52.980Z

_No load-bearing premises were extracted._
