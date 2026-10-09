<!-- insrc:artifact HLD-6a1315585c38c41c -->

# HLD: e2-delivery-board-vs-code-goal

## Summary

The delivery board is a read-only editor tab in the VS Code plugin. The extension side fetches the daemon's delivery snapshot, keeps the reader's filters and selection, and works out what each view shows; the tab itself only draws what it is sent and passes the reader's clicks and keys back. Records open in the existing review pane through one new open-this-record entry, or are shown read-only from the daemon when that pane cannot open them.

## Contents

1. [Problem context](#1-problem-context)
2. [Framework summary](#2-framework-summary)
3. [Architecture shape](#3-architecture-shape)
4. [Diagrams](#4-diagrams)
5. [Shared contracts](#5-shared-contracts)
6. [Story boundaries](#6-story-boundaries)
7. [Non-functional targets](#7-non-functional-targets)
8. [Rollout](#8-rollout)
9. [Alternatives considered](#9-alternatives-considered)
10. [References](#10-references)

## 1. Problem context

> See **DEF-6a1315585c38c41c** § 1. Problem

## 2. Framework summary

A host-side board model with a thin webview renderer (alternative a1). Inside the VS Code plugin, a delivery client wraps the daemon's workflow.delivery and workflow.deliveryEvidence methods over the shared IPC client. A board host, a vscode-free deps-injected factory like the existing panel hosts, owns the last successful snapshot, refresh sequencing, the load status and the reader's selection. Pure board-model functions turn snapshot plus selection into view models for the board, the epic rollup, the issue view and item details, using one display-label map for stages and signals. The webview is one CSP-locked inline script that renders those view models as text-only DOM and posts reader intents back in the plugin's versioned envelope. Evidence opens through a new additive open-by-artifact entry point on the existing review pane, or, for records the daemon marks evidence-read, as a read-only record the host reads through workflow.deliveryEvidence. A story's task dependencies and acceptance checks come from its PLAN, read through workflow.deliveryEvidence when its details open.

## 3. Architecture shape

Three layers inside vscode-plugin/src, plus one entry point on the review pane. (1) Data: a delivery client over createIpcClient().rpc, typed by the existing type mirror vscode-plugin/src/delivery/delivery-contract.ts (which s1 extends additively with the enum types the display labels need), exposing snapshot() and evidence(artifactId) for the open workspace's repo, bounding each call with a deadline, and turning the daemon's { error } arm and socket failures into typed load failures. (2) Host: a board host created by the extension entry point and registered behind a new 'open delivery board' command; it owns the load status (loading, ready, empty, unavailable, failed, each with the last successful snapshot when there is one), drops any response older than the latest request, keeps the selection (view, scope, search, attention filter, selected item, density) across refreshes, and builds view models through pure functions: board columns and counts, epic rollup, issue view and item details. Item details for a story with a PLAN evidence entry trigger one workflow.deliveryEvidence read of that PLAN, cached per snapshot. (3) View: a webview panel in an editor tab whose single nonce'd script renders the latest view model it receives and posts intents (refresh, set view, set scope, set search, toggle attention, select item, close details, open evidence, set density); it never receives raw records, only host-built strings and ids. Evidence opening goes host-side: a review-view entry is passed to the review pane's new openArtifact entry point; an evidence-read entry is fetched through workflow.deliveryEvidence and shown in the board's details as preformatted text. The daemon is unchanged, and E1's sc7 types are consumed as published.

## 4. Diagrams

- [Sequence diagram](docs/epics/e2-delivery-board-vs-code-goal-E202610086a131558/sequence-diagram.html)

## 5. Shared contracts

### 5.1 sc1: Delivery client

**Owner Story:** `s1`
**Consumed by:** `s2`, `s3`, `s4`, `s5`

**Purpose:** The board's only path to delivery data: the two daemon read methods for the open workspace's repo, each bounded by a deadline, with failures typed so the host can tell an unavailable daemon, a failed or timed-out read and a missing workspace apart.

**Interface sketch (type-level):**

```
import type { DeliverySnapshot, DeliveryEvidenceRecord } from './delivery-contract.js';

type DeliveryFailureKind = 'daemon-unavailable' | 'read-failed' | 'timed-out' | 'no-workspace';

interface DeliveryFailure {
  readonly kind: DeliveryFailureKind;
  /** The daemon's error text, or the socket error message. */
  readonly message: string;
}

type DeliveryResult<T> = { readonly ok: true; readonly value: T } | { readonly ok: false; readonly failure: DeliveryFailure };

/** The client sends `repo` (the open workspace's root) in every DeliverySnapshotRequest and DeliveryEvidenceRequest,
 *  so the board never falls back to the daemon's INSRC_REPO; with no workspace folder it returns 'no-workspace'
 *  without calling the daemon. Each call races a deadline (snapshot 30 s, evidence 15 s) and returns 'timed-out'
 *  when it passes, because the shared IPC client sets no timeout of its own. */
interface DeliveryClientDeps {
  readonly rpc: <T>(method: string, params?: unknown) => Promise<T>;
  /** The workspace root, or null when no folder is open. */
  readonly repo: string | null;
  readonly deadlinesMs: { readonly snapshot: number; readonly evidence: number };
}

interface DeliveryClient {
  snapshot(): Promise<DeliveryResult<DeliverySnapshot>>;
  evidence(artifactId: string): Promise<DeliveryResult<DeliveryEvidenceRecord>>;
}
```

**Assumptions cited:** [[c3]]

### 5.2 sc2: Board state: load status and selection

**Owner Story:** `s1`
**Consumed by:** `s2`, `s3`, `s4`, `s5`

**Purpose:** What the host knows at any moment: the latest applied snapshot, why the board looks the way it does, and what the reader has chosen, kept across refreshes.

**Interface sketch (type-level):**

```
import type { DeliverySnapshot } from './delivery-contract.js';

type LoadStatus =
  | { readonly state: 'loading'; readonly last: AppliedSnapshot | null }
  | { readonly state: 'ready'; readonly current: AppliedSnapshot }
  | { readonly state: 'empty'; readonly current: AppliedSnapshot }
  | { readonly state: 'unavailable'; readonly last: AppliedSnapshot | null; readonly message: string; readonly at: string }
  | { readonly state: 'failed'; readonly last: AppliedSnapshot | null; readonly message: string; readonly at: string };

interface AppliedSnapshot {
  readonly snapshot: DeliverySnapshot;
  /** Monotonic request number the snapshot answered; older responses are dropped. */
  readonly requestSeq: number;
  /** True when the snapshot reports unreadable records or store-level notices. */
  readonly partial: boolean;
}

type BoardView = 'board' | 'epics' | 'issues';
type BoardScope = { readonly kind: 'all' } | { readonly kind: 'epic'; readonly epicItemId: string } | { readonly kind: 'standalone' };
type Density = 'compact' | 'comfortable';

interface BoardSelection {
  readonly view: BoardView;
  readonly scope: BoardScope;
  readonly search: string;
  readonly needsAttentionOnly: boolean;
  readonly selectedItemId: string | null;
  readonly density: Density;
}

/** 'unavailable' covers daemon-unavailable and no-workspace; 'failed' covers read-failed and timed-out. A request that
 *  times out ends its 'loading' state like any other failure. */
interface BoardState {
  readonly status: LoadStatus;
  readonly selection: BoardSelection;
  /** Set when a refresh removed the selected item. */
  readonly selectionNotice: string | null;
}
```

**Assumptions cited:** [[c10]]

### 5.3 sc3: Board webview message protocol

**Owner Story:** `s1`
**Consumed by:** `s2`, `s3`, `s4`, `s5`

**Purpose:** The only traffic between the board's host and its webview: view models down, reader intents up, both in the plugin's versioned envelope.

**Interface sketch (type-level):**

```
interface Envelope<T> { readonly v: 1; readonly payload: T }

/** Host -> webview. Each message replaces what it names; nothing is merged. */
type BoardDownMessage =
  | { readonly type: 'status'; readonly status: StatusView }
  | { readonly type: 'board'; readonly model: BoardViewModel }
  | { readonly type: 'epics'; readonly model: EpicRollupViewModel }
  | { readonly type: 'issues'; readonly model: IssueViewModel }
  | { readonly type: 'details'; readonly model: ItemDetailsViewModel | null }
  | { readonly type: 'announce'; readonly text: string };

/** Webview -> host. Ids only; the host resolves them against the current snapshot. */
type BoardUpMessage =
  | { readonly type: 'ready' }
  | { readonly type: 'refresh' }
  | { readonly type: 'set-view'; readonly view: 'board' | 'epics' | 'issues' }
  | { readonly type: 'set-scope'; readonly scope: { readonly kind: 'all' } | { readonly kind: 'epic'; readonly epicItemId: string } | { readonly kind: 'standalone' } }
  | { readonly type: 'set-search'; readonly search: string }
  | { readonly type: 'set-attention'; readonly on: boolean }
  | { readonly type: 'select-item'; readonly itemId: string }
  | { readonly type: 'close-details' }
  | { readonly type: 'open-evidence'; readonly itemId: string; readonly artifactId: string }
  | { readonly type: 'set-density'; readonly density: 'compact' | 'comfortable' };

interface StatusView {
  readonly state: 'loading' | 'ready' | 'empty' | 'unavailable' | 'failed';
  readonly takenAt: string | null;
  readonly message: string | null;
  readonly partialNotice: string | null;
  readonly stale: boolean;
}

/** Declared by their owning stories: BoardViewModel (s2), EpicRollupViewModel and IssueViewModel (s3), ItemDetailsViewModel (s4). */
type BoardViewModel = unknown;
type EpicRollupViewModel = unknown;
type IssueViewModel = unknown;
type ItemDetailsViewModel = unknown;
```

### 5.4 sc4: Display labels

**Owner Story:** `s1`
**Consumed by:** `s2`, `s3`, `s4`, `s5`

**Purpose:** One text label for every stage id and every signal the daemon publishes, so colour is never the only carrier and every view uses the same words.

**Interface sketch (type-level):**

```
/** s1 extends the type mirror additively to re-export these six types from src/workflow/delivery/types.ts; tsconfig.delivery-contract.json keeps compiling them. */
import type { DeliveryStage, AttentionReason, NoticeCode, TaskResult, ApprovalState, ReviewVerdict } from './delivery-contract.js';

interface DisplayLabels {
  /** Exhaustive: a new stage id fails to compile. 'complete' -> 'Complete', 'ready-plan-approved' -> 'Ready · plan approved', ... */
  readonly stage: Readonly<Record<DeliveryStage, string>>;
  readonly attention: Readonly<Record<AttentionReason, string>>;
  readonly notice: Readonly<Record<NoticeCode, string>>;
  readonly taskResult: Readonly<Record<TaskResult, string>>;
  readonly approval: Readonly<Record<ApprovalState, string>>;
  readonly reviewVerdict: Readonly<Record<ReviewVerdict, string>>;
  readonly unplanned: string;
}
```

**Assumptions cited:** [[c11]]

### 5.5 sc5: Board view model

**Owner Story:** `s2`
**Consumed by:** `s3`, `s5`

**Purpose:** What the board view shows for a snapshot and selection: six columns in the daemon's order, the cards in each with their badges, and counts over the whole selection.

**Interface sketch (type-level):**

```
import type { DeliveryStage } from './delivery-contract.js';

interface BadgeView {
  readonly kind: 'approval' | 'review' | 'validation' | 'conflict' | 'attention' | 'notice';
  /** Text from sc4; always present. */
  readonly label: string;
  readonly tone: 'neutral' | 'warning' | 'danger' | 'success';
}

interface CardView {
  readonly itemId: string;
  readonly kind: 'story' | 'issue';
  readonly title: string;
  readonly standalone: boolean;
  readonly epicTitle: string | null;
  readonly badges: readonly BadgeView[];
  readonly needsAttention: boolean;
  /** One line naming every badge, for screen readers. */
  readonly accessibleLabel: string;
}

interface ColumnView {
  readonly stage: DeliveryStage;
  readonly label: string;
  /** Matches in the selection, including cards behind show-more. */
  readonly total: number;
  readonly cards: readonly CardView[];
  readonly hiddenCount: number;
}

interface BoardViewModel {
  readonly columns: readonly ColumnView[];
  readonly totals: { readonly items: number; readonly needsAttention: number };
  readonly scopeOptions: readonly { readonly epicItemId: string; readonly title: string }[];
  readonly emptySelection: boolean;
}
```

### 5.6 sc6: Item details view model and evidence opening

**Owner Story:** `s4`
**Consumed by:** `s5`

**Purpose:** What a selected item's details show, including tasks with dependencies, checks and results, the stage reason and its cited records, and how each evidence entry opens.

**Interface sketch (type-level):**

```
/**
 * Join rule: a PLAN task (PlanTask.id, e.g. 't1') belongs to the snapshot task item whose sourceIds contain that id;
 * a PLAN task with no such item is not shown as a task row. dependsOn ids are shown by the matched item's title,
 * or as the raw plan id when no item matches.
 * Opened-record text: renderedMarkdown when present, otherwise meta and body pretty-printed as JSON (two-space indent);
 * always inserted as textContent.
 */
interface TaskRowView {
  readonly taskItemId: string;
  readonly title: string | null;
  /** Result label from sc4, or the unplanned label. */
  readonly resultLabel: string;
  readonly planned: boolean;
  /** From the story's PLAN, read through workflow.deliveryEvidence; null when no PLAN or it could not be read. */
  readonly dependsOn: readonly string[] | null;
  readonly acceptanceChecks: readonly string[] | null;
}

interface EvidenceRowView {
  readonly artifactId: string;
  readonly kindLabel: string;
  readonly approvalLabel: string;
  readonly reviewLabel: string | null;
  readonly overrideLabel: string | null;
  readonly opensIn: 'review-pane' | 'read-only';
}

interface ItemDetailsViewModel {
  readonly itemId: string;
  readonly title: string;
  readonly stageLabel: string | null;
  readonly stageReason: { readonly text: string; readonly artifactIds: readonly string[] } | null;
  readonly tasks: readonly TaskRowView[];
  readonly taskCounts: { readonly passed: number; readonly failed: number; readonly unrecorded: number; readonly unplanned: number } | null;
  readonly conflict: string | null;
  readonly evidence: readonly EvidenceRowView[];
  readonly notices: readonly string[];
  readonly linked: readonly { readonly itemId: string; readonly title: string; readonly relation: 'parent' | 'child' | 'corrects' }[];
  readonly sourceIds: readonly string[];
  /** Set when the PLAN read failed; the rest of the details still render. */
  readonly planNotice: string | null;
  /** The read-only text of an evidence-read record the reader opened, rendered as preformatted text. */
  readonly openedRecord: { readonly artifactId: string; readonly text: string } | null;
}
```

**Assumptions cited:** [[c4]] [[c17]]

### 5.7 sc7: Review pane open-by-artifact entry point

**Owner Story:** `s4`

**Purpose:** The one additive entry point on the existing review pane (amended k10): open the pane on a given artifact, read-only when it is not pending.

**Interface sketch (type-level):**

```
/** Added to the existing DocsReviewHost (vscode-plugin/src/chat/docs-review-panel.ts); open() and dispose() are unchanged. */
interface DocsReviewHostOpenArtifact {
  /**
   * Open the pane on one artifact by id and its docs/ markdown path. When the artifact is not
   * in the pane's pending list, it is shown without approve or request-changes actions.
   */
  openArtifact(target: { readonly artifactId: string; readonly mdPath: string }): void;
}
```

**Assumptions cited:** [[c24]]

## 6. Story boundaries

### 6.1 Story E202610086a131558:S001

**Owns:** `sc1`, `sc2`, `sc3`, `sc4`

The open-board command and its entry in the plugin's command list, the webview panel creation in an editor tab with its CSP and nonce, the refresh sequencing (request numbers and dropping superseded responses), the mapping of client failures to load states, and the status bar of the board (taken-at time, stale and partial notices, the empty, unavailable and failed messages). s1 also records the editor-tab versus sidebar placement check. It renders a minimal list of item titles until s2 supplies columns. s1 also extends vscode-plugin/src/delivery/delivery-contract.ts additively with the stage, attention, notice, task-result, approval and review-verdict types sc4 needs. Its LLD maps every acceptance criterion to a named test, including ac4 (an earlier response arriving after a later one is dropped, with fake out-of-order responses) and ac6 (repeated open and refresh against a temporary git repository leave the store, docs and git untouched).

### 6.2 Story E202610086a131558:S002

**Owns:** `sc5`
**Depends on:** `sc1`, `sc2`, `sc3`, `sc4`

The pure functions that filter the snapshot by scope, search and attention, group the matches into the six columns in the daemon's order, count over the whole selection, page each column behind show-more, and build each card's badges and accessible label from the snapshot's published fields; and the board view's rendering in the webview script, text-only. Its LLD maps every acceptance criterion to a named test, including ac6 (a title and a notice containing markup and script render as literal text).

### 6.3 Story E202610086a131558:S003

**Depends on:** `sc1`, `sc2`, `sc3`, `sc4`, `sc5`

The epic rollup view model (per-epic completion counts that name their denominator, stories grouped by stage, a separate standalone group) and the issue view model (each issue with its fix stories as children and its parent relationship or unresolved-parent notice), both built from the same filtered selection as sc5, and their rendering. Its LLD maps every acceptance criterion to a named test.

### 6.4 Story E202610086a131558:S004

**Owns:** `sc6`, `sc7`
**Depends on:** `sc1`, `sc2`, `sc3`, `sc4`

Building item details from the snapshot item, reading the story's PLAN through the delivery client and caching it per snapshot, joining the plan's dependencies and acceptance checks to the snapshot's task results, fetching an evidence-read record and showing it as preformatted text, routing a review-view entry to the review pane's openArtifact, the change inside the review pane that implements openArtifact without altering its list, rendering or approval behaviour, and the details rendering. Its LLD maps every acceptance criterion to a named test, including ac5 for both paths: a review-view record opens through openArtifact, and when the review pane is unavailable or the record is evidence-read the record is shown read-only from workflow.deliveryEvidence; the review pane's existing tests run unchanged.

### 6.5 Story E202610086a131558:S005

**Depends on:** `sc1`, `sc2`, `sc3`, `sc4`, `sc5`, `sc6`

The narrow-pane layout (stage-grouped list), keyboard navigation and focus return, live-region announcements of selection and refresh results, the compact and comfortable density styles, and the 500-item performance fixture with its measured render and filter timings. Its LLD maps every acceptance criterion to a named test, with ac5 as the measured fixture.

## 7. Non-functional targets

- **Performance:** After a snapshot arrives, the first board view model is built and rendered within one second for the 1,000-record, 500-item fixture; each filter or search change rebuilds and posts the view model and re-renders within 150 ms, measured best of three on the reference environment. Item details add at most one workflow.deliveryEvidence read per story per snapshot.
- **Security:** The webview runs one nonce'd inline script under a restrictive Content-Security-Policy, as the plugin's other webviews do, and builds DOM with text nodes only; no artifact text is inserted as HTML. Up-messages carry only ids that the host resolves against the current snapshot, so a crafted message cannot name a path. The board calls only workflow.delivery and workflow.deliveryEvidence and has no route to any approval or write method; openArtifact shows non-pending artifacts without actions.
- **Observability:** The host takes the plugin's ChatPanelLogger (warn and error). It logs failed refreshes and failed or timed-out evidence and PLAN reads through error(), and superseded responses through warn(), each with the request number, the item count where known and the elapsed time; successful refreshes are not logged, because the plugin has no info channel.
- **Durability:** The board persists nothing to disk or workspace state; the selection lives for the life of the panel and is kept across refreshes, and the last successful snapshot is kept in memory until the panel closes.

## 8. Rollout

**Phase A — board shell and shared contracts**

**Stories:** `s1`

s1 owns sc1-sc4 (client, board state, message protocol, display labels) that every later story consumes, and gives a usable board with refresh and recovery states.

**Backward compat:** No existing command, panel or setting changes; the board adds one new command and one new webview view type.

**Phase B — board columns, and item details with evidence**

**Stories:** `s2`, `s4`

s2 and s4 each depend only on s1 and can be built in parallel; s2 owns the board view model (sc5) that s3 and s5 need, and s4 owns the details model (sc6) and the review pane entry point (sc7).

**Backward compat:** The review pane's open() command, pending list, rendering and approve or request-changes flow must behave exactly as before; openArtifact is additive and its tests must include the pane's existing ones unchanged.

**Phase C — epic rollup and issue view**

**Stories:** `s3`

s3 depends on s1 and s2 and builds its views from the same selection as sc5.

**Phase D — narrow pane, accessibility, density and performance**

**Stories:** `s5`

s5 depends on s2, s3 and s4 and applies across all three views, including the measured 500-item timings.

**Ordering rationale:** Owners land before consumers: s1 (sc1-sc4) first; s2 (sc5) and s4 (sc6, sc7) next because each needs only s1; s3 after s2 because it reuses sc5's selection; s5 last because it depends on s2, s3 and s4. This is exactly the Epic's dependsOn graph.

**Risky bits**

| Area | Why | Mitigation |
| :--- | :--- | :--- |
| Filter latency (k7) | Every filter or search change rebuilds the view model on the host and posts it to the webview; for 500 items this may exceed 150 ms if cards are rebuilt from scratch or the posted model is large. | s2 keeps column paging so only visible cards are serialized, and s5 measures best-of-three on the 500-item fixture; if the budget is missed, rebuild only changed columns before considering a webview-side model. |
| Review pane entry point (k10) | openArtifact lives inside a 109 KB panel owned by another epic, and the pane is only created when the chat feature is enabled, so the board may have no pane to open. | s4 adds openArtifact with the pane's existing tests kept unchanged and new tests for the read-only state; when the pane is unavailable the board shows the record read-only through workflow.deliveryEvidence instead. |
| PLAN shape coupling | Task dependencies and checks are read from the PLAN body, a shape outside the published delivery view, so a PLAN format change could silently drop them. | s4 reads only tasks[].id, dependsOn and acceptanceChecks defensively, shows a plan notice instead of failing when they are missing, and the HLD records the additive sc7 field (alternative a3) as the follow-up if the shape becomes unstable. |

## 9. Alternatives considered

### 9.1 a1: Host-side board model with a thin webview renderer — **CHOSEN**

The extension host owns the snapshot, refresh sequencing, filters, selection and counts as pure vscode-free functions; the webview only renders view models it is sent and posts user intents back.

A delivery client in the plugin wraps workflow.delivery and workflow.deliveryEvidence over the shared IPC client, the way docs-review-client.ts wraps the review methods. A board host, built like the existing deps-injected panel hosts, keeps the last good snapshot, sequences refreshes so a superseded response is dropped, and holds the reader's selection (view, epic or standalone scope, search, attention filter, selected item, density). A pure board model turns snapshot plus selection into a view model: visible cards per stage column in the daemon's order, counts over the whole selection, the epic rollup and the issue view, and the stage-id to label map. The host posts that view model to the webview in a versioned envelope, as the chat and review panels do.

The webview is one CSP-locked inline script that renders the view model as text-only DOM and posts intents (set filter, select item, open evidence, refresh, toggle density) back to the host. Item details are a second view model the host builds when an item is selected; for a story with a plan, the host reads the PLAN through workflow.deliveryEvidence once per selection to show task dependencies and acceptance checks next to the daemon's task results. Evidence opens through the review pane's new open-by-artifact entry point when the daemon marks it review-view, and otherwise as a read-only record the host fetches through workflow.deliveryEvidence.

**Pros:**
- All filtering, counting and selection logic is plain TypeScript tested with fakes under the plugin's existing tsx --test suite, the same way webview-host and docs-review-client are tested.
- The webview never sees raw artifact bodies it would have to interpret; it renders strings the host has already chosen, which keeps k2 and k4 easy to check.
- Snapshot sequencing lives in one place (the host), so k5's drop-the-superseded-response rule is a single testable function.
- No change to E1's published contract: the PLAN is read through the existing workflow.deliveryEvidence method.

**Cons:**
- Every filter change is a host-to-webview round trip; for 500 items the view model must be built and posted within the 150 ms budget of k7, which needs a measured fixture.
- Opening a story's details costs one extra IPC call to read its PLAN.
- The client reads one field of the PLAN body (tasks with dependsOn and acceptanceChecks), which couples the board to the PLAN record's shape outside the delivery view.

**Cost estimate:** L

### 9.2 a2: Webview-side board model

The host fetches the snapshot and posts it to the webview once; filtering, counting, selection and rendering all run inside the webview script.

The host keeps only the delivery client, refresh sequencing and the command that opens the board. After a successful refresh it posts the whole snapshot to the webview, which holds it in memory and computes columns, counts, the rollup, the issue view and item details locally as the reader filters and selects. Evidence requests and PLAN reads are posted back to the host, which calls the daemon and returns the result.

Because the plugin's webviews run one inline nonce'd script built from strings, the board's model and renderer would live in that script, or in a generated string module like the embedded marked library, and would be exercised mainly through webview-level tests.

**Pros:**
- A filter change never leaves the webview, so it avoids a host round trip per keystroke.
- The host stays very small.

**Cons:**
- The filtering and counting rules that must agree across views (k9) would live in string-built browser script, which the plugin today tests only through source-text assertions, so they would be far harder to test than host-side TypeScript.
- The whole snapshot, including record titles and notice text from artifacts, is handed to the webview, widening what the webview must render safely under k4.
- Selection and filters are lost whenever VS Code disposes and rebuilds the webview unless separately persisted, which works against keeping the selection across refreshes (s1 ac5).

**Cost estimate:** L

**Rejected because:** Strongest on k7, but k4, k5 and k9 are only partial because the rules that must agree and the snapshot handling move into string-built browser script the plugin can barely test, and the full snapshot is handed to the webview.

### 9.3 a3: Host-side board model plus additive task detail in the delivery view

As a1, but E1's delivery view gains optional per-task dependsOn and acceptanceChecks so the board never reads a PLAN body.

The board is built exactly as in a1: a delivery client, a board host with snapshot sequencing and selection, a pure board model and a thin renderer, with evidence opened through the review pane's new entry point. The difference is where task detail comes from. E1's sc7 gains optional fields on each task entry, its dependencies and acceptance checks, filled by the daemon's gate pass from the story's PLAN, allowed by E1's rule that only additive optional fields may change after approval.

Item details then come entirely from the snapshot already on the host, with no per-selection IPC call, and the board keeps a single data source. The cost moves to the daemon: E1's types, gate pass, contract mirrors and the JetBrains sample snapshot all change, which is an amendment to E1's approved HLD.

**Pros:**
- Details need no extra IPC call, so opening a story is bounded only by rendering.
- The board interprets no record body at all; every fact it shows comes from the delivery view, the strictest reading of k1 and k2.
- The JetBrains board (E3) gets task detail for free from the same snapshot.

**Cons:**
- Requires an amendment to E1's approved HLD and changes to daemon code, its contract test, the VS Code type mirror and the JetBrains sample, widening this Epic beyond the plugin.
- Every snapshot carries task detail for every story, growing the payload for a 500-item store even when no details are opened.

**Cost estimate:** L

**Rejected because:** Scores as well as a1 on every constraint and better on k7 for details, but it requires amending E1's approved HLD and changing daemon code, its contract test and both client mirrors, which this Epic's scope and E1's additive-change rule make a separate decision rather than a default.

## 10. References

- **[[c3]]** `prior-artifact` `docs/epics/e1-delivery-read-model-daemon-from-E202610072ff0dfda/HLD.md` — "Fix sc7 in this HLD, version it with schemaVersion, and allow only additive optional fields after approval; any breaking change goes through an HLD amendment before E2 consumes it."
- **[[c4]]** `code` `src/workflow/delivery/types.ts` — "readonly tasks:            readonly TaskValidation[];"
- **[[c9]]** `doc` `docs/insrc-delivery-board-prd.html` — "Placement: a dedicated editor tab is the leading candidate for a wide board; validate against a tool-window entry point."
- **[[c10]]** `doc` `docs/insrc-delivery-board-prd.html` — "Refresh strategy: manual refresh is sufficient for the first increment; confirm whether existing daemon events can support later automatic updates."
- **[[c11]]** `doc` `docs/plans/delivery-board-epics.md` — "| Completion wording | Keep "Complete"; test it in E2's usability session | E2 S2 |"
- **[[c17]]** `code` `src/workflow/delivery/types.ts` — "readonly openWith:       'review-view' | 'evidence-read';"
- **[[c24]]** `stakeholder` `Stakeholder decision in chat, 2026-10-09: option A, add an open-this-artifact entry to the review pane` — "go with A"
- **[[c25]]** `analyze-bundle` `insrc_analyze_step: vscode-plugin/src daemon IPC client, webview panel host and command registry` — "delivery/delivery-contract.ts types the two delivery methods (:40-41) but nothing calls them; a board adds a delivery client, a board panel and renderer, and an entry command."
- **[[c26]]** `analyze-bundle` `insrc_analyze_step: how the docs review panel is opened and how the plugin sends IPC and webview messages` — "no exported function or command opens it on a given artifact"
- **[[c27]]** `code` `vscode-plugin/src/chat/docs-review-panel.ts` — "export interface DocsReviewHost {
  open(): void;
  dispose(): void;
}"
- **[[c28]]** `code` `vscode-plugin/src/chat/docs-review-client.ts` — "export function createDocsReviewClient(client: IpcClient): DocsReviewClient {"
- **[[c29]]** `code` `src/shared/ipc-client.ts` — "export function createIpcClient(connect?: () => Socket): IpcClient {"
- **[[c30]]** `code` `vscode-plugin/src/delivery/delivery-contract.ts` — "readonly 'workflow.delivery':         { readonly request: DeliverySnapshotRequest; readonly response: DeliverySnapshotResponse };"
- **[[c31]]** `code` `vscode-plugin/src/panels/webview-host.ts` — "export function createWebviewPanelHost(deps: WebviewPanelHostDeps): WebviewPanelHost {"
- **[[c32]]** `code` `vscode-plugin/src/chat/protocol.ts` — "export interface Envelope<T> {"
- **[[c33]]** `code` `src/workflow/artifacts/plan.ts` — "readonly dependsOn:        readonly string[];    // other PlanTask ids in this Story"
- **[[c34]]** `code` `src/workflow/delivery/types.ts` — "export interface TaskValidation {"
- **[[c38]]** `code` `vscode-plugin/src/extension.ts` — "commands.register({ id: 'insrc.chat.docsReview', title: 'insrc: Review pending documents' }, async () => {"

<!-- insrc:review -->

## Review

### ⚠️ Review `WARN` — design.epic (design.epic)

**0 do not hold · 2 could not be verified · 12 hold** · template `design-spec` · model `cli-claude:opus` · reviewed 2026-10-08T18:56:24.018Z

Only a premise that does not hold blocks approval. One that could not be verified is listed for the reader and does not block.

#### Does not hold (blocks approval)

_None._

#### Could not verify (does not block)

| Check item | Premise | What was tried and what was missing | Action |
| --- | --- | --- | --- |
| change-sites | The board host takes the plugin's ChatPanelLogger and logs through error() and warn(), wired from extension.ts. | ChatPanelLogger has warn and error (docs-review-panel.ts:45 NOOP_LOGGER). The only shared logger instance in extension.ts is `const panelLog = { warn: ... }` (extension.ts:255), which has no error(). The docsReviewHost is created without a logger (:607-630). I did not open ChatPanelLogger's declaration to see whether error is optional, so I could not confirm that extension.ts can hand the board a ChatPanelLogger without a new adapter. [files: vscode-plugin/src/extension.ts] | s1's LLD should name the logger instance the board host receives in extension.ts. If ChatPanelLogger.error is required, it should add an error sink. |
| data-compatibility | The board handles snapshot versioning (schemaVersion 1) and the DEF's additive-only evolution of the delivery contract. | DeliverySnapshot.schemaVersion is the literal 1 (types.ts:311). The HLD never states what the client does if a response carries a different schemaVersion, or whether unknown additive fields are ignored. The type-level mirror pins compile-time drift (delivery-contract.ts:9-11), but runtime handling is not described anywhere in the HLD. | sc1 should state the runtime check: reject a schemaVersion other than 1 as 'read-failed' with a clear message, and ignore unknown fields. |
