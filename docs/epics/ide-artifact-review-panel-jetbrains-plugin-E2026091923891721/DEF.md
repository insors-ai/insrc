<!-- insrc:artifact DEF-238917216d8fd532 -->

# Epic: The insrc workflow produces an artifact at each stage that a human must review and approve before the next stage may proceed, and it also surfaces open questions the reviewer is expected to settle at that moment.

**Flavor:** enhancement

## Problem

The insrc workflow produces an artifact at each stage that a human must review and approve before the next stage may proceed, and it also surfaces open questions the reviewer is expected to settle at that moment. For a developer working inside a JetBrains IDE, none of that review-and-approve moment is reachable where they work. There is no in-IDE way to notice that an artifact is waiting for approval, to read it in a legible rendered form, to annotate specific parts of it with feedback, to record decisions against its open questions, or to give the approval that unlocks the next stage. To do any of this the developer must leave the IDE and drive the workflow from an external surface, breaking their flow at exactly the human-in-the-loop gate the workflow most depends on — so in practice the review either happens out-of-band or is skimmed. The feedback a reviewer forms while reading is not captured against the artifact in any structured way from the IDE, so it is not carried into the stage that consumes it, and the reviewer cannot even tell from inside the IDE which artifacts are currently pending. The cost lands squarely on the JetBrains developer population the in-IDE integration was built to serve, at the one step of the workflow that by design cannot be automated away.

## Non-goals

- **A general-purpose diff or pull-request review tool over arbitrary source files.** — The surface is scoped to workflow artifacts awaiting approval; code review is already a separate, distinct workflow stage.
- **Real-time push notification of newly-produced artifacts via a daemon event or subscription stream.** — Approval is a human, non-latency-critical action; a bounded pending-discovery mechanism suffices and avoids standing up new streaming infrastructure on both the daemon and plugin sides. Deferred to a possible later enhancement.
- **Moving approval or open-question-resolution logic into the plugin.** — The plugin must stay a thin orchestrator that owns no reasoning; the daemon remains the single owner of the approve gate and the resolution machinery [[c1]].
- **Editing or authoring the artifact body from within the review surface.** — Artifact content is produced by the workflow stages; the reviewer annotates and resolves questions, and a single artifact stays the single source of truth [[c5]].
- **A multi-user or collaborative review (multiple reviewers, cross-user comment threads, presence).** — This Epic targets the single developer reviewing in their own IDE; multi-party review is a separate concern.
- **Guaranteeing the rich review experience on IDE runtimes that lack the embedded-browser capability.** — Those setups get a graceful fallback rather than the rich surface; making them first-class would compromise the primary experience [[c6]].

## Assumptions

- `high` Reviewers approve artifacts as a deliberate human action that is not latency-critical, so a bounded pending-discovery mechanism (rather than instantaneous push) is acceptable. [[c7]]
- `high` The embedded-browser capability is present in the standard bundled runtime of all four target IDEs, with only a small fraction of setups (an alternative runtime) needing the fallback path. [[c6]]
- `high` The existing daemon approve and artifact-read contracts and the open-question resolution machinery are stable surfaces this Epic can build on without redesigning them. [[c3]]
- `high` The plugin's existing local-socket client is sufficient transport for the request/response calls this surface needs. [[c4]]
- `med` The artifacts a reviewer needs to act on are discoverable by their persisted approval state (approved vs pending vs rejected). [[c2]]

## Constraints

| ID | Type | Text | Source |
| :--- | :--- | :--- | :--- |
| `k1` | invariant | The plugin must remain a thin orchestrator that owns no reasoning: it may render and transport, but approval and open-question-resolution logic stay in the daemon. | [[c1]] |
| `k2` | contract | All daemon access from the plugin goes over the existing local Unix-domain-socket JSON-RPC channel; the plugin opens no cloud or REST path. | [[c4]] |
| `k3` | contract | Approval must flow through the existing approve path that stamps the artifact's approved state and honours the review block-verdict gate; the surface must not stamp approval by any other route. | [[c3]] |
| `k4` | contract | Reviewer feedback must be recorded through the existing open-question resolution machinery so the next stage's start-gate consumes it, not through a parallel side-channel comment store. | [[c5]] |
| `k5` | invariant | A single artifact remains the single source of truth; the surface renders the artifact's existing rendered content and never creates a divergent second copy of it. | [[c5]] |
| `k6` | convention | The one plugin artifact must continue to load and activate across all four target IDEs off the shared platform module, and the review surface must degrade gracefully wherever the embedded-browser capability is unavailable. | [[c6]] |
| `k7` | invariant | Pending-artifact discovery must impose no unbounded always-on background load; it must be a bounded, on-demand or polled read rather than a hot loop. | [[c7]] |

## Stories

### E2026091923891721:S001 — See which artifacts are waiting for approval, from inside the IDE

**User value:** `size: M`

A reviewer can tell at a glance, without leaving the IDE, which of the open project's workflow artifacts are currently awaiting their approval.

**Extends:** [[c5]]

**Acceptance criteria:**

- **ac1:** Given the open project has workflow artifacts in mixed states — some already approved, some awaiting approval, some rejected, when the reviewer asks the IDE what needs review, then only the artifacts that are awaiting approval (neither approved nor rejected) are listed, each identified by what it is. _(operationalizes `k7`)_
- **ac2:** Given the backing service cannot be reached, when the reviewer asks the IDE what needs review, then the IDE reports that the backing service is unavailable rather than presenting an empty list as though nothing were pending. _(operationalizes `k2`)_
- **ac3:** Given no artifact is awaiting approval, when the reviewer asks the IDE what needs review, then the IDE clearly indicates nothing is currently awaiting review. _(operationalizes `k7`)_

**Local constraints:**

- `lc1` (invariant) Determining what is pending must be a bounded, on-demand or periodic check, never a continuous hot loop that burdens the IDE or the backing service. [[c7]]

### E2026091923891721:S002 — Open a pending artifact and read it rendered legibly in the IDE

**User value:** `size: L`

A reviewer can read the full artifact in a legible, rendered form inside the IDE, instead of opening a terminal to see it.

**Depends on:** `s1`

**Extends:** [[c5]]

**Acceptance criteria:**

- **ac1:** Given an artifact awaiting approval, when the reviewer opens it in the IDE, then its content is shown in a rendered, legible form within the IDE. _(operationalizes `k5`)_
- **ac2:** Given an IDE runtime that lacks the rich in-IDE rendering capability, when the reviewer opens a pending artifact, then it still opens in a readable fallback view that carries the same review actions. _(operationalizes `k6`)_
- **ac3:** Given an artifact is displayed for review, when the reviewer reads it, then what is shown is exactly the artifact's own content, with no separately-maintained second copy that could diverge from it. _(operationalizes `k5`)_

**Local constraints:**

- `lc1` (invariant) The content presented for review is the artifact's own rendered form; the surface never authors or stores a divergent second copy of the artifact body. [[c5]]
- `lc2` (convention) Where the rich in-IDE renderer is unavailable, the surface degrades to a plain readable view rather than failing to open. [[c6]]

### E2026091923891721:S003 — Annotate specific parts of an artifact with inline comments

**User value:** `size: L`

A reviewer can attach feedback to the exact place in the artifact it concerns, the way they would in a code review, rather than describing it out of band.

**Depends on:** `s2`

**Acceptance criteria:**

- **ac1:** Given an artifact is open for review, when the reviewer selects a specific part of it and adds a comment, then the comment is shown anchored to that part. _(operationalizes `k1`)_
- **ac2:** Given several comments have been added to different parts of the artifact, when the reviewer looks over their annotations, then each comment is distinctly associated with the part it targets. _(operationalizes `k1`)_
- **ac3:** Given a comment has been added but not yet submitted, when the reviewer edits or removes it, then the change is reflected before anything is submitted. _(operationalizes `k1`)_

**Local constraints:**

- `lc1` (invariant) Un-submitted annotation state is presentation-only inside the IDE; the surface performs no approval or resolution reasoning of its own. [[c1]]

### E2026091923891721:S004 — Submit annotations so they are recorded against the artifact and carried into the next stage

**User value:** `size: M`

The feedback a reviewer captured is durably recorded where the next stage will act on it, instead of being lost in chat or a scratch note.

**Depends on:** `s3`

**Extends:** [[c5]]

**Acceptance criteria:**

- **ac1:** Given one or more annotations on an artifact awaiting approval, when the reviewer submits them, then they are recorded against that artifact through the workflow's own feedback mechanism so the next stage consumes them. _(operationalizes `k4`)_
- **ac2:** Given a submission of annotations, when it is recorded, then it is stored by the backing service, not in a separate side-channel maintained only by the IDE. _(operationalizes `k1`, `k4`)_
- **ac3:** Given the backing service cannot record a submission, when the reviewer submits, then the IDE reports the failure and the annotations are not silently dropped. _(operationalizes `k2`)_

**Local constraints:**

- `lc1` (contract) Reviewer feedback is recorded only through the workflow's existing open-question resolution mechanism, never a parallel comment store. [[c5]]

### E2026091923891721:S005 — Approve a pending artifact from the IDE, unlocking the next stage

**User value:** `size: M`

A reviewer can give the approval that advances the workflow without leaving the IDE.

**Depends on:** `s2`

**Extends:** [[c5]]

**Acceptance criteria:**

- **ac1:** Given an artifact awaiting approval is open in the IDE, when the reviewer approves it, then it is approved through the workflow's existing approve path and its state becomes approved. _(operationalizes `k3`)_
- **ac2:** Given an artifact whose review verdict blocks approval, when the reviewer approves it without an explicit override, then approval is withheld and the reason is shown, matching the workflow's own gate. _(operationalizes `k3`)_
- **ac3:** Given approval has just succeeded, when the reviewer returns to the list of what needs review, then the just-approved artifact no longer appears as pending. _(operationalizes `k3`, `k7`)_

**Local constraints:**

- `lc1` (contract) Approval is effected only through the existing approve path that stamps approval and honours the review block-verdict gate; the surface never marks an artifact approved by any other route. [[c3]]

## Citations

- **[[c1]]** `prior-artifact` `docs epic 61d8c73edb68041a (integrate-insrc-framework-into-jetbrains-ide)` — "The JetBrains plugin is a thin config-orchestrator that owns no reasoning; this Epic adds an in-IDE review/approve surface on top of it."
- **[[c2]]** `code` `src/daemon/index.ts:555,980,994` — "'workflow.approve' (:555), 'artifact.get' (:980), 'artifact.search' (:994) are the registered daemon IPCs; approve + read exist, but no list-pending or submit-comment method does."
- **[[c3]]** `code` `src/workflow/gates.ts:617` — "approveWorkflowTarget(req, opts?) stamps meta.approvedAt and honours the review block-verdict — the existing approve path."
- **[[c4]]** `code` `jetbrains-plugin/src/main/kotlin/ai/insors/insrc/jetbrains/daemon/UnixSocketDaemonRpc.kt:32` — "The plugin already has a one-shot local Unix-domain-socket JSON-RPC client (UnixSocketDaemonRpc/DaemonGateway) that opens only the local socket, never a cloud/REST path."
- **[[c5]]** `analyze-bundle` `capability-discovery: artifact review/approve channel` — "The open-question resolution machinery (recordResolution) and the single-source artifact renderers exist; there is no user-comment-submission IPC and no divergent second copy of an artifact body."
- **[[c6]]** `doc` `https://plugins.jetbrains.com/docs/intellij/embedded-browser-jcef.html` — "The embedded browser is core platform API bundled with the runtime across IntelliJ-Platform IDEs; check availability before use and provide a fallback when the IDE runs a runtime without it."
- **[[c7]]** `code` `src/indexer/watcher.ts:30 / src/daemon/server.ts:59` — "The only file watcher is the indexer's source watcher; the socket supports per-request streaming but there is no artifact/approval event emitter, so discovery is a bounded polled read."

<!-- insrc:review -->

## Review

### ✅ Review `PASS` — define (define)

**0 HIGH · 0 MED · 0 LOW** · model `client` · reviewed 2026-09-19T06:32:12.883Z

_No load-bearing premises were extracted._
