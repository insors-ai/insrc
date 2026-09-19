<!-- insrc:artifact LLD-238917216d8fd532-s1 -->

# LLD: E2026091923891721:S001

**Epic:** `ide-artifact-review-panel-jetbrains-plugin`
**HLD base run:** `wf-1789799576767-kl7v1b`
**HLD effective hash:** `c93cb4358ff4...`

## HLD context

**Framework:** Chosen framework a1: a thin three-layer review surface bolted onto existing daemon capability. The daemon gains two small typed request/reply handlers — a read that enumerates the open project's pending-approval artifacts and a write that records reviewer comments through the existing open-question resolution machinery — while approval and artifact-content reads reuse the existing workflow.approve and artifact.get handlers unchanged. The JetBrains plugin extends its existing one-shot Unix-socket DaemonGateway with thin call() wrappers for those methods and adds a JCEF tool-window panel that renders the artifact's own content as HTML with inline PR-style anchored comment threads, a Submit action that records comments as open-question resolutions, and an Approve action that calls the existing approve path. The panel is gated by JBCefApp.isSupported() with a read-only native-editor fallback, and pending-artifact discovery is a bounded poll of the read handler. Reasoning stays entirely daemon-side (k1); the plugin only renders and transports.
**Rollout phase:** Phase A — Discover, read, and approve (minimal review loop)
**Owns:** `sc1` (PendingArtifactList)

**Adjacent scope (owned by other stories — do NOT implement here):**
- `s2`: Private to s2: the JCEF browser lifecycle, the JBCefApp.isSupported() gate, the HTML rendering of the artifact's renderedMarkdown, and the read-only native-editor fallback view when JCEF is unavailable. The mechanics of turning renderedMarkdown into displayed HTML stay inside s2. — owns `sc2`
- `s3`: Private to s3: the inline-anchor UI mechanics (selecting a part of the rendered artifact, showing a thread there), the JBCefJSQuery add/edit/remove-comment bridge, and the un-submitted, presentation-only comment buffer held in the panel before Submit. No approval or resolution reasoning happens here (k1). — owns `sc3`
- `s4`: Private to s4: the mapping from anchored ReviewComments onto recordResolution calls (which anchor targets which open question, and whether it becomes a resolve / ignore / defer / general note), invoked through the workflow.resolveComment write handler, plus the success/failure reporting so a failed submission is surfaced and never silently dropped.
- `s5`: Private to s5: the Approve action wiring to the existing workflow.approve handler, explicit-override handling, block-reason display when a review verdict withholds approval, and the post-approve refresh so the just-approved artifact drops off the pending list. s5 adds no approval logic of its own — it calls the existing approve path.

## Contract details

**Surface level:** internal-shared

### `workflow.pending`

```typescript
// src/daemon/index.ts handler-map entry (RpcHandler)
'workflow.pending': (params: WorkflowPendingRequest) => Promise<WorkflowPendingResult>
```

**Parameters:**
- `params: WorkflowPendingRequest` — Carries `repo` (the open project's absolute path); when absent the daemon falls back to process.env.INSRC_REPO, matching the existing handler convention.

**Returns:** `Promise<WorkflowPendingResult>` — { artifacts: PendingArtifact[] } — every artifact in the repo's store whose approval state is pending (approvedAt absent AND rejectedAt absent), each as the sc1 descriptor. An empty artifacts[] means nothing is pending (distinct from an error).

**Errors:**
- `repo-unresolved` when Neither params.repo nor INSRC_REPO yields a usable repo path — returned as an { error } result (the plugin renders the 'unavailable' state, ac2).
- `store-unreadable` when The .insrc/artifacts directory cannot be read — surfaced as an { error } result, never a silent empty list (ac2).

**Preconditions:**
- The repo is a registered insrc workspace with an .insrc/artifacts store (absent store = empty pending list, not an error).

**Postconditions:**
- Reasoning stays daemon-side (k1); the plugin only calls this handler.
- Every returned descriptor has state==='pending'; no approved or rejected artifact appears (ac1).

### `listPendingArtifacts`

```typescript
// new pure daemon helper composing the cited storage/types symbols
function listPendingArtifacts(repoPath: string): readonly PendingArtifact[]
```

**Parameters:**
- `repoPath: string` — Absolute repo path whose ARTIFACTS_DIR ('.insrc/artifacts') is scanned.

**Returns:** `readonly PendingArtifact[]` — The pending descriptors. Enumerates ARTIFACTS_DIR/*.json (the pattern resolve.ts already uses), parses each once, keeps those with meta.approvedAt absent AND meta.rejectedAt absent whose KIND (from the filename prefix) is in the sc1 kind union, and maps each to a PendingArtifact (kind from prefix, title from body, mdPath from the storage path helpers, workItemId from meta, openQuestionCount from body.openQuestions?.length ?? 0).

**Errors:**
- `throws-on-store-unreadable` when readdir/parse of the store fails — the handler above catches and maps to an { error } result.

**Preconditions:**
- Pure over the filesystem; no DB, no daemon state (rule 1: the daemon owns the read, but this helper is a plain fs scan).

**Postconditions:**
- Deterministic: identical store => identical list; no embedding/index dependency (k7).

### `DaemonGateway.pendingArtifacts`

```typescript
// jetbrains-plugin daemon/ — thin wrapper over the existing DaemonGateway.call
fun pendingArtifacts(projectRootPath: String): PendingQueryResult
// where PendingQueryResult = Available(items: List<PendingArtifactDto>) | Unavailable(reason: String)
```

**Parameters:**
- `projectRootPath: String` — The open project's root path, forwarded as the `repo` param of the workflow.pending call over the existing local Unix-domain socket (k2).

**Returns:** `PendingQueryResult` — Available(list) on a successful DaemonResult (empty list = 'nothing awaiting review', ac3); Unavailable(reason) when the DaemonResult is not ok or the socket is unreachable (ac2). The plugin performs NO classification — it forwards the daemon's descriptors verbatim (k1).

**Errors:**
- `DaemonUnavailableException` when The existing UnixSocketDaemonRpc raises it when the socket is unreachable; the wrapper maps it to Unavailable (ac2), never to an empty Available.

**Preconditions:**
- Invoked on the bounded poll cadence (project-open via InsrcProjectOpenActivity, IDE focus, coarse timer) — never a hot loop (k7/lc1).

**Postconditions:**
- Available vs Unavailable are distinct so the tool-window list entry can show 'nothing pending' (ac3) separately from 'backing service unavailable' (ac2).

## Data model changes

### `PendingArtifact / WorkflowPendingRequest / WorkflowPendingResult` — new

The sc1 descriptor + request/result types, declared as the typed contract of the workflow.pending handler. PendingArtifact = { artifactId, kind (the sc1 union), title, mdPath, workItemId?, openQuestionCount, state: 'pending' }. New internal-shared types; they add no field to any existing artifact type.

```
+interface PendingArtifact { readonly artifactId: string; readonly kind: 'SPEC'|'DEF'|'HLD'|'LLD'|'PLAN'|'ISSUE'|'CR'; readonly title: string; readonly mdPath: string; readonly workItemId?: string; readonly openQuestionCount: number; readonly state: 'pending'; }
+interface WorkflowPendingRequest { readonly repo: string }
+interface WorkflowPendingResult { readonly artifacts: readonly PendingArtifact[] }
```

**Call sites:**
- `src/daemon/index.ts (the new handler entry)`
- `src/workflow/storage.ts (ARTIFACTS_DIR + artifact-id helpers for mdPath)`
- `src/workflow/types.ts (ArtifactMetaBase.approvedAt/rejectedAt read to classify)`

### `ArtifactMetaBase.approvedAt / rejectedAt` — invariant-change

No schema change — these existing optional fields (types.ts:342/344) are READ (not written) to derive pending = approvedAt absent AND rejectedAt absent. s1 relies on them staying the authoritative approval-state markers (already true; approveWorkflowTarget stamps approvedAt).

**Call sites:**
- `src/workflow/types.ts:342`
- `src/workflow/types.ts:344`
- `src/workflow/gates.ts:617`

## Interaction with shared contracts

| Contract | Role | How |
| :--- | :--- | :--- |
| `sc1` | implements | s1 owns sc1 and realises it: the daemon workflow.pending handler returns exactly WorkflowPendingResult{ artifacts: PendingArtifact[] }, and the plugin's DaemonGateway.pendingArtifacts wrapper forwards those descriptors verbatim to the pending-list tool-window entry. s2 (open/read) and s5 (approve) later CONSUME this same descriptor to address an artifact by its artifactId — s1 defines the identity; it does not render the artifact body (s2/sc2) or approve it (s5). |

## Error paths

### Error cases

- **The daemon socket is unreachable when the plugin polls workflow.pending.** (recoverable)
  - Detection: UnixSocketDaemonRpc.call throws DaemonUnavailableException (or the DaemonResult comes back ok=false) — the wrapper inspects the result/exception, not the artifact list.
  - Response: DaemonGateway.pendingArtifacts returns Unavailable(reason); the tool-window list entry renders the 'backing service unavailable' state and does NOT clear or blank the last-known pending list into an empty one.
  - User impact: The reviewer sees an explicit 'insrc unavailable' indication instead of a misleading 'nothing to review' (ac2).
- **The .insrc/artifacts directory cannot be read on the daemon side (permissions, transient FS error).** (recoverable)
  - Detection: listPendingArtifacts' readdir/parse throws; the workflow.pending handler catches it and returns an { error } result rather than a partial list.
  - Response: The handler returns { error }, which the plugin maps to Unavailable (ac2) — an unreadable store is never reported as zero pending.
  - User impact: Same explicit-unavailable signal; the reviewer is not told 'nothing pending' when the store simply could not be read.
- **One artifact JSON file is malformed / unparseable while the rest are fine.** (recoverable)
  - Detection: JSON.parse of that single file throws inside the per-file loop of listPendingArtifacts.
  - Response: Skip the malformed file (log it via the daemon's standard workflow logging) and continue enumerating the others; one bad file does not fail the whole scan or drop the other pending artifacts.
  - User impact: The reviewer still sees every well-formed pending artifact; the corrupt one is omitted and logged rather than crashing the list.

### Edge cases

| Input | Expected |
| :--- | :--- |
| The .insrc/artifacts directory is absent (a repo that has run no workflow yet). | listPendingArtifacts returns [] and the handler returns { artifacts: [] } — the 'nothing awaiting review' state (ac3), NOT an error. |
| All artifacts are already approved or rejected (each has approvedAt or rejectedAt set). | Empty artifacts[] — the distinct 'nothing pending' state (ac3), separate from 'unavailable' (ac2). |
| An artifact JSON of a KIND outside the sc1 union (e.g. a BUILD record) that has no approvedAt/rejectedAt. | Excluded from the pending list — the handler keeps only KINDs in the sc1 union (SPEC/DEF/HLD/LLD/PLAN/ISSUE/CR), so non-reviewer-approvable kinds never appear (ac1). |
| A pending artifact whose body carries no openQuestions array. | openQuestionCount is 0 (body.openQuestions?.length ?? 0); the descriptor is still returned. |
| A pending artifact with no workItemId on its meta (e.g. a standalone SPEC/ISSUE). | workItemId is omitted (optional in sc1); artifactId still uniquely identifies it. |

### Invariants to preserve

- Pending is derived solely from the persisted approval-state markers meta.approvedAt (absent) AND meta.rejectedAt (absent) — the same fields the existing approve/reject path stamps — so the IDE's pending list can never disagree with real approval state. s1 READS these fields; it never writes approval/rejection (that stays with approveWorkflowTarget). [[c3]]
- Discovery imposes no unbounded always-on load: the daemon read is one bounded directory scan per call, invoked only on a bounded poll cadence (project-open / IDE focus / coarse timer), never a hot loop or a held-open subscription. [[c7]]
- All daemon access stays on the existing local Unix-domain-socket JSON-RPC channel via the existing DaemonGateway.call; the plugin opens no cloud/REST path and performs no approval/pending classification itself (thin orchestrator). [[c4]]

## Test strategy

**Test framework:** `Daemon/TypeScript: node:test via tsx (npx tsx --test 'src/**/__tests__/*.test.ts'), matching the existing src/daemon + src/workflow test layout with a temp-dir .insrc/artifacts fixture. Plugin/Kotlin: JUnit via Gradle (./gradlew test, JDK21) reusing the existing fake-DaemonRpc pattern from Sc2DaemonGatewayTest — no live socket. Per the avoid-GitHub-CI-credits rule both are verified LOCALLY, not on CI.`

### Test levels

- **unit** — Prove listPendingArtifacts classifies pending vs approved vs rejected correctly and maps every sc1 descriptor field, against a fabricated .insrc/artifacts fixture — no daemon, no socket.
  - Subjects: `listPendingArtifacts: a store with mixed states (one approvedAt-set, one rejectedAt-set, two with neither) returns ONLY the two pending ones (ac1)`, `listPendingArtifacts: each returned descriptor carries kind (from the filename prefix), title (from body), mdPath, workItemId (when meta has it), openQuestionCount (body.openQuestions?.length ?? 0), state==='pending'`, `listPendingArtifacts: a KIND outside the sc1 union (e.g. a BUILD-*.json with no approvedAt/rejectedAt) is excluded`, `listPendingArtifacts: absent .insrc/artifacts dir -> [] (not a throw)`, `listPendingArtifacts: a malformed single JSON file is skipped and the other pending artifacts still returned`, `listPendingArtifacts: a pending artifact with no openQuestions array -> openQuestionCount 0; with no workItemId -> workItemId omitted`
  - Fixtures: `A temp repo dir with a fabricated .insrc/artifacts holding <KIND>-<hash>.json files in approved / rejected / pending / non-union / malformed states`
- **integration** — Prove the workflow.pending daemon handler returns WorkflowPendingResult over the real handler path and errors (not empty lists) on an unreadable/unresolved store (ac2/ac3).
  - Subjects: `workflow.pending handler: given a fixture repo with pending artifacts -> { artifacts: [...] } with the pending set (ac1)`, `workflow.pending handler: given a repo whose store is all-approved/rejected or absent -> { artifacts: [] } (ac3, distinct from error)`, `workflow.pending handler: repo-unresolved (no params.repo, no INSRC_REPO) -> an { error } result, NOT { artifacts: [] } (ac2)`, `workflow.pending handler: store readdir throws -> { error } result (ac2)`
  - Fixtures: `The same fabricated .insrc/artifacts fixture wired through the handler map with params.repo set / unset`
- **unit** — Prove the plugin DaemonGateway.pendingArtifacts wrapper maps a successful vs failing DaemonResult to the distinct Available/Unavailable states, against a fake DaemonRpc (no real socket).
  - Subjects: `pendingArtifacts: a fake DaemonRpc returning ok=true with an artifacts list -> Available(list) (ac1); empty list -> Available(emptyList) => 'nothing pending' (ac3)`, `pendingArtifacts: a fake DaemonRpc returning ok=false (or throwing DaemonUnavailableException) -> Unavailable(reason), never Available(emptyList) (ac2)`, `pendingArtifacts: the wrapper performs no classification — it forwards the daemon descriptors verbatim (k1)`
  - Fixtures: `A fake DaemonRpc/DaemonGateway (the existing Sc2DaemonGatewayTest fake pattern) returning canned ok/error DaemonResults`

### Acceptance mapping

| Criterion | Proving tests |
| :--- | :--- |
| `ac1` | `listPendingArtifacts: mixed-state store returns ONLY the two pending ones`, `listPendingArtifacts: a KIND outside the sc1 union is excluded`, `workflow.pending handler: fixture repo with pending artifacts -> { artifacts: [...] }`, `pendingArtifacts: ok=true with a list -> Available(list)` |
| `ac2` | `workflow.pending handler: repo-unresolved -> { error }, NOT { artifacts: [] }`, `workflow.pending handler: store readdir throws -> { error }`, `pendingArtifacts: ok=false / DaemonUnavailableException -> Unavailable(reason), never Available(emptyList)` |
| `ac3` | `listPendingArtifacts: absent .insrc/artifacts dir -> []`, `workflow.pending handler: all-approved/rejected or absent store -> { artifacts: [] }`, `pendingArtifacts: ok=true empty list -> Available(emptyList) => 'nothing pending'` |

## Migration

**State before:** The daemon IPC registry (src/daemon/index.ts) exposes workflow.approve (:555) and artifact.get (:980) but NO list-pending enumeration — there is no way for a client to ask which artifacts are awaiting approval (capability-discovery bundle). Artifacts already persist as .insrc/artifacts/<KIND>-<hash>.json with meta.approvedAt/rejectedAt (types.ts:342/344) as the authoritative approval-state markers (how-does-it-work bundle), but nothing reads them as a pending set. On the plugin side there is NO ToolWindow and no pending-list surface (structural-map bundle); the plugin can reach the daemon only through the existing one-shot DaemonGateway.call.

**State after:** The daemon gains an additive 'workflow.pending' read handler (backed by a pure listPendingArtifacts fs scan) that returns WorkflowPendingResult{ artifacts: PendingArtifact[] } for the pending set, and errors (not empty lists) when the repo/store cannot be read. The plugin gains a review ToolWindow whose pending-list entry polls that handler on a bounded cadence via a new DaemonGateway.pendingArtifacts wrapper, rendering three distinct states: the pending list, 'nothing awaiting review', and 'backing service unavailable'. Everything is additive — no existing handler, artifact schema, or plugin behaviour changes.

**Zero downtime:** yes — **Data rewrite:** no

### Steps

1. Add the new internal-shared types (PendingArtifact, WorkflowPendingRequest, WorkflowPendingResult) and the pure listPendingArtifacts(repoPath) fs-scan helper. Purely additive type + function declarations; nothing else references them yet. — ↩ rollbackable
2. Register the 'workflow.pending' handler in the daemon IPC map (resolving repo from params.repo || INSRC_REPO like its siblings), delegating to listPendingArtifacts and mapping a store/repo failure to an { error } result. Additive new registry entry; touches no existing handler. — ↩ rollbackable
3. Add the plugin ToolWindow registration (plugin.xml toolWindow extension + a ToolWindowFactory) and the pending-list entry. Additive plugin surface; the existing project-open activity, notification group, and other extensions are unchanged. — ↩ rollbackable
4. Add the DaemonGateway.pendingArtifacts wrapper over the existing DaemonGateway.call and wire the bounded poll scheduler (project-open via the existing InsrcProjectOpenActivity, IDE focus, coarse timer) to refresh the pending-list entry, mapping ok/empty/error DaemonResults to the three list states. Additive. — ↩ rollbackable
5. Add the daemon unit/integration tests + the plugin JUnit tests (fake DaemonRpc); verify locally (npx tsx --test and ./gradlew test on JDK21). Test-only. — ↩ rollbackable

**Backward compat:** Fully backward compatible. Every change is additive: a new daemon handler name, new types, a new pure helper, and a new plugin ToolWindow + gateway wrapper. No existing daemon IPC (workflow.approve, artifact.get, artifact.search) changes signature or behaviour; no artifact JSON schema changes (meta.approvedAt/rejectedAt are READ only); the one plugin artifact still loads across all four IDEs off the shared platform module and its existing activation/notification behaviour is untouched. A daemon that predates this handler simply returns its standard 'unknown method' error, which the plugin already maps to the Unavailable state — so an older daemon degrades cleanly rather than breaking.

## Alternatives considered

### a1: Scan the canonical .insrc/artifacts JSON store — **CHOSEN**

The 'workflow.pending' handler enumerates ARTIFACTS_DIR/*.json, reads each artifact's meta, and returns a PendingArtifact for every one whose meta.approvedAt is absent AND meta.rejectedAt is absent.

The daemon read handler resolves the repo (params.repo || INSRC_REPO), lists the '.insrc/artifacts' directory (the same store resolve.ts already enumerates), and for each '<KIND>-<hash>.json' parses the JSON once. Pending is derived directly from the persisted fields the approve/reject paths stamp: meta.approvedAt absent AND meta.rejectedAt absent (ArtifactMetaBase, types.ts:342/344). The KIND is taken from the filename prefix (DEF/HLD/LLD/PLAN/BUILD/SPEC/ISSUE/CR); title from the artifact body (or a kind-appropriate fallback); mdPath from the storage path helpers keyed by artifactId; workItemId from meta when present; openQuestionCount from body.openQuestions.length. The result is the PendingArtifact[] the sc1 contract defines. Building/BUILD/CR kinds that carry no user-approval semantics are excluded by the same approvedAt/rejectedAt rule (they either never stamp those fields or are not reviewer-approvable) — the handler classifies purely on the two meta fields plus a small kind allow-list matching the sc1 kind union.

### a2: Enumerate via the work-item hierarchy (resolve.ts refs)

Walk the Epic/Story/Task work-item hierarchy through resolve.ts helpers and, for each level, resolve its artifact and include it when pending.

Instead of scanning files, the handler drives resolve.ts's work-item listing (listEpicHashes + the hierarchical resolvers) to enumerate every Epic/Story/Task, resolve each level's artifact id, load it, and classify pending on the same approvedAt/rejectedAt rule. The descriptor's workItemId comes naturally from the hierarchy walk.

**Rejected because:** Constraint-clean on transport/boundedness but PARTIAL on ac1 + sc1: the work-item hierarchy does not cover SPEC/ISSUE artifacts, so pending ones of those kinds are silently missed — a completeness gap a1 does not have.

### a3: Add an approval-state filter to the existing artifact.search

Extend the existing artifact.search IPC with a 'pending' filter instead of adding a new handler.

Rather than a new 'workflow.pending' handler, add an approval-state parameter to the existing artifact.search handler so a client can ask for pending artifacts through the same call.

**Rejected because:** Violates ac1, sc1 and k7: it repurposes a semantic vector search for a deterministic approval-state enumeration, contradicts the fixed sc1 contract, and pays an embedding round-trip per poll.

## Citations

- **[[c1]]** `prior-artifact` `docs epic 61d8c73edb68041a (integrate-insrc-framework-into-jetbrains-ide)` — "The JetBrains plugin is a thin config-orchestrator that owns no reasoning."
- **[[c2]]** `code` `src/daemon/index.ts:555,980,994` — "workflow.approve/artifact.get/artifact.search are registered daemon IPCs; there is no list-pending enumeration — workflow.pending is net-new."
- **[[c3]]** `code` `src/workflow/gates.ts:617 / src/workflow/types.ts:342,344` — "approveWorkflowTarget stamps meta.approvedAt; ArtifactMetaBase carries approvedAt?(:342) and rejectedAt?(:344) — pending = both absent."
- **[[c4]]** `code` `jetbrains-plugin/src/main/kotlin/ai/insors/insrc/jetbrains/daemon/UnixSocketDaemonRpc.kt:32` — "The plugin's one-shot UnixSocketDaemonRpc/DaemonGateway.call opens only the local Unix socket, never a cloud/REST path."
- **[[c5]]** `analyze-bundle` `capability-discovery: artifact review/approve channel` — "Read + approve are reusable server-side; list-pending is net-new; the plugin already has a socket client."
- **[[c7]]** `code` `src/workflow/storage.ts (ARTIFACTS_DIR) / src/workflow/tracker/resolve.ts:100 (artifactsDir/readdirSync)` — "Artifacts persist under .insrc/artifacts as <KIND>-<hash>.json; resolve.ts already enumerates that directory — a bounded scan, no event emitter."

<!-- insrc:review -->

## Review

### ✅ Review `PASS` — design.story (design.story)

**0 HIGH · 0 MED · 5 LOW** · model `client` · reviewed 2026-09-19T06:54:05.531Z

| Ref | Kind | Severity | Fixability | Premise | Evidence | Action |
| --- | --- | --- | --- | --- | --- | --- |
| c3 | citation | LOW | manual | ArtifactMetaBase carries approvedAt (types.ts:342) and rejectedAt (types.ts:344); pending is derived from both absent, and approveWorkflowTarget (gates.ts:617) stamps approvedAt. | src/workflow/types.ts carries approvedAt?/rejectedAt? and src/workflow/gates.ts defines approveWorkflowTarget (32 matches incl. the real source files); reads confirm types.ts:342/344. | none — verified sound |
| c7 | citation | LOW | manual | Artifacts persist under ARTIFACTS_DIR '.insrc/artifacts' as <KIND>-<hash>.json, and resolve.ts already enumerates that directory (artifactsDir + readdirSync) — the scan pattern listPendingArtifacts reuses. | ARTIFACTS_DIR = '.insrc/artifacts' at src/workflow/storage.ts:53 and artifactsDir/readdirSync enumeration in resolve.ts confirmed. | none — verified sound |
| c2 | closed-union | LOW | manual | The daemon has workflow.approve/artifact.get/artifact.search but NO workflow.pending handler — it is net-new and additive. | 'workflow.approve' handler at src/daemon/index.ts:555 confirmed; 'workflow.pending' appears only in this Epic's HLD/LLD docs, never under src/ — confirming it is net-new. | none — verified sound |
| c4 | citation | LOW | manual | The plugin's DaemonGateway.call(method, params) one-shot socket client exists and is the transport the new pendingArtifacts wrapper extends. | DaemonGateway.kt:69 `fun call(method,params)` and UnixSocketDaemonRpc.kt confirmed — the transport the new wrapper extends. | none — verified sound |
| c1 | cross-artifact | LOW | manual | s1 owns sc1 (PendingArtifactList) per the HLD, and implements the workflow.pending contract; s2/s5 consume it — consistent with the HLD story boundaries. | The Epic HLD lists sc1 (PendingArtifactList) ownedByStory=s1; the LLD implements it and s2/s5 consume it — the cross-artifact trace holds. | none — verified sound |
