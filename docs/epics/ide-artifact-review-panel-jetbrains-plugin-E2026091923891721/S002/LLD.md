<!-- insrc:artifact LLD-238917216d8fd532-s2 -->

# LLD: E2026091923891721:S002

**Epic:** `ide-artifact-review-panel-jetbrains-plugin`
**HLD base run:** `wf-1789799576767-kl7v1b`
**HLD effective hash:** `c93cb4358ff4...`

## HLD context

**Framework:** Thin three-layer review surface over existing daemon capability; reasoning stays daemon-side (k1), the plugin only renders and transports.
**Rollout phase:** Phase A — Discover, read, and approve (minimal review loop)
**Owns:** `sc2` (ArtifactReviewView)
**Consumes:** `sc1` (PendingArtifactList)

## Contract details

**Surface level:** internal-shared

### `workflow.artifactContent`

```typescript
'workflow.artifactContent': (params: { repo?: string; mdPath: string }) => Promise<ArtifactReviewView | { error: string }>
```

**Parameters:**
- `repo: string | undefined` _(optional)_ — Open project's absolute root; falls back to process.env.INSRC_REPO like the sibling workflow.pending / workflow.approve handlers.
- `mdPath: string` — The rendered .md path from the selected S001 PendingArtifact.mdPath; validated to resolve under the repo's docs/ tree (path-traversal guard) before reading.

**Returns:** `ArtifactReviewView | { error: string }` — On success the full sc2 review view (renderedMarkdown from the .md + openQuestions/approvable/blockReason from the sibling .json meta). On repo-unresolved / path-invalid / unreadable, a structured { error }, mirroring workflow.pending so the client maps it to Unavailable.

**Errors:**
- `{ error: string }` when repo cannot be resolved (no param, no INSRC_REPO), or mdPath is empty / does not resolve under the repo's docs/ tree / is not a recognized workflow artifact .md.
- `{ error: string }` when the .md is unreadable, or its sibling .insrc/artifacts/<KIND>-<hash>.json (via jsonPathForMd) is missing/malformed.

**Preconditions:**
- The selected artifact came from the S001 workflow.pending list (mdPath is a descriptor field), so it names a rendered workflow artifact under docs/.

**Postconditions:**
- No file is written or mutated (read-only).
- renderedMarkdown is the .md read verbatim — no transformation, no divergent second copy (k5/lc1/ac3).

### `handleArtifactContent`

```typescript
handleArtifactContent(params: { repo?: string; mdPath?: string }, repoEnv: string | undefined): ArtifactReviewView | { error: string }
```

**Parameters:**
- `params: { repo?: string; mdPath?: string }` — The IPC params; repo/mdPath resolution + validation live here (pure), mirroring S001's handleWorkflowPending so the contract is integration-testable without booting the daemon.
- `repoEnv: string | undefined` — The INSRC_REPO fallback the daemon handler passes (process.env['INSRC_REPO']).

**Returns:** `ArtifactReviewView | { error: string }` — The pure core the handler delegates to: resolve+validate repo/mdPath, read the .md + sibling .json, assemble the view, and map every failure to a structured { error }.

**Errors:**
- `{ error: string }` when same repo-unresolved / path-invalid / unreadable conditions; never throws for these — returns { error }.

**Postconditions:**
- Read-only; deterministic over the filesystem.

### `jsonPathForMd`

```typescript
jsonPathForMd(mdPath: string): string
```

**Parameters:**
- `mdPath: string` — The rendered artifact .md path; mapped to its hash-flat .insrc/artifacts/<KIND>-<hash>.json via the in-file insrc:artifact marker to read the meta.

**Returns:** `string` — The sibling .json path holding the artifact meta/body (existing helper, gates.ts:758 — consumed unchanged).

**Errors:**
- `Error` when the .md has no insrc:artifact marker or an unknown extension (existing throw; the handler catches it and returns { error }).

**Preconditions:**
- mdPath is a nested workflow artifact .md carrying the insrc:artifact marker.

**Postconditions:**
- Pure; no I/O beyond reading the marker.

### `DaemonGateway.artifactReviewView`

```typescript
fun artifactReviewView(projectRootPath: String, mdPath: String): ArtifactContentResult
```

**Parameters:**
- `projectRootPath: String` — The open project's root (the repo arg every gateway call carries, k3-scoping).
- `mdPath: String` — The selected PendingArtifactDto's mdPath, forwarded to the daemon.

**Returns:** `ArtifactContentResult` — Loaded(view) on ok; Unavailable(reason) on ok=false / DaemonUnavailableException / unexpected fault — mirroring S001's PendingQueryResult so a fetch error never renders as blank/empty content.

**Errors:**
- `ArtifactContentResult.Unavailable` when daemon returns a structured error, the socket is unreachable, or the reply is malformed (no throw escapes).

**Preconditions:**
- Reaches the daemon only over the existing DaemonGateway.call('workflow.artifactContent', {repo, mdPath}) transport (k2).

**Postconditions:**
- Forwards the daemon's view verbatim (no client-side classification — k1).

### `JBCefApp.isSupported`

```typescript
JBCefApp.isSupported(): Boolean
```

**Returns:** `Boolean` — IntelliJ-Platform gate (external, consumed): true selects the JBCefBrowser HTML render; false selects the read-only native-editor fallback carrying the same review actions (ac2/lc2/k6).

**Preconditions:**
- Called on the EDT at content-view open time.

**Postconditions:**
- Pure query; no side effects.

## Data model changes

### `ArtifactReviewView` — new

The sc2 contract realized as an internal-shared type (TS in the daemon, mirrored as a Kotlin data class in the plugin): { artifactId; kind; renderedMarkdown; openQuestions: OpenQuestionRef[]; approvable; blockReason? }. renderedMarkdown is the .md read verbatim (k5/lc1); approvable/blockReason derive from the .json meta.review block-verdict. Produced only by s2; consumed by s3/s4/s5.

```
+ interface ArtifactReviewView { artifactId; kind; renderedMarkdown; openQuestions; approvable; blockReason? }
```

**Call sites:**
- `src/daemon/index.ts (the workflow.artifactContent handler, beside workflow.pending)`
- `jetbrains-plugin/.../review/ReviewToolWindow.kt (the content view renders it)`

### `OpenQuestionRef` — new

The sc2 open-question projection { id; text; status: 'open'|'resolved'|'ignored'|'deferred' }, read from the artifact .json body/openQuestions. S002 surfaces them read-only; recording resolutions is s4.

```
+ interface OpenQuestionRef { id; text; status }
```

**Call sites:**
- `src/daemon/index.ts (assembled inside workflow.artifactContent)`

### `ArtifactContentResult` — new

Plugin sealed result mirroring S001's PendingQueryResult: Loaded(view) | Unavailable(reason). Keeps a fetch error DISTINCT from an empty/blank view.

```
+ sealed interface ArtifactContentResult { Loaded(view) | Unavailable(reason) }
```

**Call sites:**
- `jetbrains-plugin/.../daemon/DaemonGateway.kt (artifactReviewView return)`
- `jetbrains-plugin/.../review/ReviewToolWindow.kt (content view state)`

## Interaction with shared contracts

| Contract | Role | How |
| :--- | :--- | :--- |
| `sc2` | implements | S002 owns sc2 and realizes it via the workflow.artifactContent handler (+ pure handleArtifactContent) that assembles ArtifactReviewView (renderedMarkdown from the .md, openQuestions + approvable/blockReason from the sibling .json via jsonPathForMd), mirrored as Kotlin types in the plugin. The sc2 interface is kept EXACTLY as sketched (renderedMarkdown unchanged) so s3/s4/s5 consume it unaltered — the artifact.get correction is realized by a new handler, not a contract change, so no HLD amendment is needed. |
| `sc1` | consumes | The content view opens from a selected S001 PendingArtifact; S002 keys the fetch off that descriptor's mdPath (and artifactId/kind for the header). It does NOT re-run or re-implement the pending scan (s1's boundary). |

## Error paths

### Error cases

- **The client-supplied mdPath escapes the repo ('..' traversal / absolute outside repo / not under docs/).** (recoverable)
  - Detection: handleArtifactContent normalizes mdPath to an absolute real path and checks containment within join(repo,'docs') before any read.
  - Response: Return { error } naming the invalid path; perform no read.
  - User impact: Content pane shows 'content unavailable'; nothing outside the workspace is read.
- **The artifact .md no longer exists or is unreadable (approved/rejected/moved between poll and open).** (recoverable)
  - Detection: readFileSync(mdPath) throws ENOENT/EACCES, caught in handleArtifactContent.
  - Response: Return { error } with the read failure reason.
  - User impact: Explicit 'content unavailable' (not a blank pane); resolves after the list refreshes.
- **The sibling meta .json is missing or malformed.** (recoverable)
  - Detection: jsonPathForMd throws (no marker/unknown extension) or JSON.parse of the resolved .json throws — both caught.
  - Response: Return { error } rather than a half-assembled view.
  - User impact: Told the metadata is unreadable instead of a misleading approvable state.
- **repo unresolved (no param + no INSRC_REPO), or mdPath empty.** (recoverable)
  - Detection: handleArtifactContent non-empty guards at entry, mirroring handleWorkflowPending.
  - Response: Return { error }; never a partial success.
  - User impact: 'content unavailable'; an unresolvable list entry cannot be opened.
- **Daemon socket unreachable, or a structured error / malformed reply during the fetch.** (recoverable)
  - Detection: DaemonGateway.artifactReviewView catches DaemonUnavailableException + RuntimeException and maps a daemon ok=false via UnixSocketDaemonRpc.parse result.error framing.
  - Response: Return ArtifactContentResult.Unavailable(reason); no throw escapes onto the EDT/poll thread.
  - User impact: 'insrc backing service unavailable — <reason>', distinct from an empty artifact.

### Edge cases

| Input | Expected |
| :--- | :--- |
| JBCefApp.isSupported() returns false. | Not an error: degrade to the read-only native-editor fallback showing the same renderedMarkdown with the same review actions (ac2/lc2/k6). |
| The artifact was approved/rejected between list refresh and open. | The .md still renders read-only; approvable reflects the CURRENT meta (false once approved). |
| openQuestions empty. | View renders with no questions section — not an error. |
| A review block-verdict stands. | approvable=false + blockReason carried for s5; s2 renders content and surfaces the reason read-only. |
| renderedMarkdown very large. | JCEF renders it (O(size)); the fetch is a single on-open request/reply, not a poll (k7 unaffected). |

### Invariants to preserve

- The artifact's own .md is the single source of truth: renderedMarkdown is the file read verbatim, no divergent second copy (k5/lc1/ac3). [[c5]]
- The plugin stays a thin orchestrator: the daemon owns the read + view assembly; the plugin only renders + transports (k1). [[c1]]
- All daemon access stays over the existing local Unix-domain-socket JSON-RPC channel; the plugin never reads workflow files/DB directly (k2). [[c4]]
- The one plugin artifact loads across all four IDEs off the shared platform module and degrades gracefully where the embedded browser is unavailable (k6/lc2). [[c6]]

## Test strategy

**Test framework:** `Daemon: node:test via npx tsx --test (mirrors pending.test.ts). Plugin: JUnit5 + BasePlatformTestCase where an IDE fixture is needed, via ./gradlew test on JDK21 (mirrors ReviewPendingTest / UnixSocketDaemonRpcParseTest). No live socket, no GitHub CI.`

### Test levels

- **unit** — Daemon: pure handleArtifactContent over a temp docs/ + .insrc/artifacts fixture — view assembly + every failure mapping, no socket.
  - Subjects: `happy path: renderedMarkdown EQUALS the .md read verbatim (byte-for-byte), kind/artifactId from identity, openQuestions from .json, approvable=true when no block (ac1/ac3)`, `standing block-verdict -> approvable=false + blockReason`, `openQuestions absent -> empty list, not an error`, `mdPath escaping docs/ -> { error }, no read (path-traversal guard)`, `missing/unreadable .md -> { error }`, `missing/malformed sibling .json -> { error }`, `repo unresolved / empty mdPath -> { error }`, `read-only: no file created or mutated`
  - Fixtures: `temp repo with docs/epics/<slug>-<SEG>/S001/LLD.md (insrc:artifact marker) + .insrc/artifacts/LLD-<hash>-s1.json (with/without review block, with/without openQuestions)`
- **unit** — Plugin: DaemonGateway.artifactReviewView + real UnixSocketDaemonRpc.parse framing, via fake/canned-reply DaemonRpc.
  - Subjects: `ok=true view payload -> Loaded(view), fields verbatim (k1)`, `ok=false / DaemonUnavailableException / malformed -> Unavailable(reason), never Loaded-blank`, `real parse: {result:{view}} -> Loaded end-to-end; {result:{error}} -> Unavailable (framing boundary, the S001 lesson)`
  - Fixtures: `the S001 FakeDaemonRpc pattern + canned JSON replies`
- **unit** — Plugin: pure content-view-state + render/fallback-selection mappers (no JCEF, no IDE fixture).
  - Subjects: `ArtifactContentViews.of(Loaded) -> Rendered(renderedMarkdown); of(Unavailable) -> 'content unavailable'`, `renderModeFor(jcefSupported): JCEF_HTML when true, NATIVE_FALLBACK when false (ac2/lc2)`
- **integration** — Daemon: the workflow.artifactContent handler wiring (repo resolution + delegation).
  - Subjects: `fixture repo + real pending .md -> ArtifactReviewView (delegates to handleArtifactContent with INSRC_REPO fallback)`, `repo-unresolved / path-invalid -> { error } result, never a partial view`
  - Fixtures: `the same temp docs/ + .insrc/artifacts fixture`

### Acceptance mapping

| Criterion | Proving tests |
| :--- | :--- |
| `ac1` | `handleArtifactContent happy path assembles renderedMarkdown from the .md`, `ArtifactContentViews.of(Loaded) -> Rendered carrying renderedMarkdown` |
| `ac2` | `renderModeFor(false) -> NATIVE_FALLBACK`, `artifactReviewView Unavailable is distinct from a blank view` |
| `ac3` | `renderedMarkdown EQUALS the .md read verbatim (byte-for-byte)`, `handleArtifactContent read-only: no file created or mutated` |

## Migration

**State before:** S001 (main fabe840) ships the review tool window with the pending LIST only: daemon workflow.pending (+ handleWorkflowPending) returns PendingArtifact incl. mdPath; plugin DaemonGateway.pendingArtifacts + PendingQueryResult over UnixSocketDaemonRpc (parse surfaces structured result.error as ok=false); ReviewToolWindow/ReviewPanel renders the list via ReviewListViews. No IPC serves a workflow .md (artifact.get resolves the LanceDB skill store); no content view. resolveArtifactMdPath/jsonPathForMd/artifactJsonPath already map identity<->.md/.json.

**State after:** Daemon adds workflow.artifactContent (+ handleArtifactContent) assembling the sc2 ArtifactReviewView, path-guarded under docs/. Plugin adds ArtifactReviewView/OpenQuestionRef types, ArtifactContentResult, a DaemonGateway.artifactReviewView wrapper, and a content view in the existing ReviewToolWindow (JCEF HTML when supported, else read-only native fallback). All S001 behaviour unchanged.

**Zero downtime:** yes — **Data rewrite:** no

### Steps

1. Add daemon types (ArtifactReviewView, OpenQuestionRef) + pure handleArtifactContent (docs/ containment guard, .md verbatim read, sibling .json via jsonPathForMd, failures -> { error }). Net-new module. — ↩ rollbackable
2. Register workflow.artifactContent in src/daemon/index.ts (beside workflow.pending), delegating to handleArtifactContent with INSRC_REPO fallback. Net-new method key. — ↩ rollbackable
3. Add plugin types (ArtifactReviewView/OpenQuestionRef data classes, ArtifactContentResult sealed) + DaemonGateway.artifactReviewView wrapper over call() (ok->Loaded, ok=false/DaemonUnavailable/RuntimeException->Unavailable), wired through DaemonGatewayService. Additive to the S001 interface. — ↩ rollbackable
4. Add the content view to ReviewToolWindow: a pending-list selection triggers a bounded on-demand fetch via artifactReviewView; render renderedMarkdown->HTML in JBCefBrowser when JBCefApp.isSupported(), else the native-editor fallback; distinct 'content unavailable' state on Unavailable. Extract pure ArtifactContentViews + renderModeFor(jcefSupported). — ↩ rollbackable
5. Add tests (daemon node:test for handleArtifactContent + the handler; plugin JUnit for artifactReviewView, real parse framing, ArtifactContentViews, renderModeFor). Verify locally. — ↩ rollbackable

**Backward compat:** Fully backward compatible: workflow.artifactContent is a NET-NEW IPC method key — no existing handler changes. The plugin change is additive; the S001 pending list is untouched. An older daemon without the handler returns a top-level 'unknown method' error, which the S001-hardened UnixSocketDaemonRpc.parse maps to ok=false -> the plugin shows 'content unavailable' (graceful degradation). No public/cross-repo IPC contract is broken.

## Alternatives considered

### a1: Daemon read handler returns the full ArtifactReviewView (markdown); plugin renders HTML client-side — **CHOSEN**

A thin new daemon read IPC assembles sc2 ArtifactReviewView (renderedMarkdown from the .md + openQuestions/approvable/blockReason from the .json meta); the plugin converts markdown->HTML inside JCEF, native-editor fallback shows the same markdown.

New thin daemon read handler keyed by the S001 pending identity (mdPath validated under docs/) returns the full sc2 view (renderedMarkdown verbatim + meta-derived fields via jsonPathForMd); the plugin adds a DaemonGateway wrapper + a content view that renders HTML in JBCefBrowser when JBCefApp.isSupported(), else a read-only native-editor fallback. No second copy is stored.

### a2: Daemon renders markdown->HTML server-side; plugin just loads the HTML

The new read handler returns pre-rendered HTML; the plugin loads it into JCEF, fallback shows raw markdown.

Same view assembly but the daemon converts .md->HTML and the sc2 view carries html; the plugin loads it directly.

**Rejected because:** Violates sc2 (re-shapes the shared contract s3/s4/s5 consume) and is partial on ac3/k5 (a server-rendered HTML copy can drift from the .md); adds a daemon rendering dependency for a purely presentational concern. Centralized rendering is not worth re-opening the owned contract.

### a3: Plugin reads the mdPath file directly (no new IPC)

The plugin opens the S001 descriptor's mdPath from disk itself and reads the sibling .json — zero daemon change.

Skip a new IPC: the plugin reads mdPath (and the sibling .json) from disk directly and renders in JCEF with the native fallback.

**Rejected because:** Breaks k1 and the daemon-owns-access rule (k2) by having the plugin open files + derive paths itself, and only partially satisfies sc1/sc2. The zero-daemon-change saving is not worth breaking the boundary the whole system rests on.

## Open questions

- The specific markdown->HTML rendering approach inside the JCEF view (a bundled JS renderer loaded into the browser vs a Kotlin markdown->HTML pass before load) is deferred to the plan/build; either keeps renderedMarkdown as the daemon-provided source of truth and authors no second copy.

## Resolved questions

- `qe66729e4` — The specific markdown->HTML rendering approach inside the JCEF view (a bundled JS renderer loaded into the browser vs a Kotlin markdown->HTML pass before load) is deferred to the plan/build; either keeps renderedMarkdown as the daemon-provided source of truth and authors no second copy.
  - **resolved**: Bundled JS renderer inside JCEF — User's explicit in-chat decision. Ship a vendored markdown renderer (marked/markdown-it) as a plugin resource, load it into the JCEF page, and pass the raw daemon-provided renderedMarkdown across the Kotlin->JS bridge for client-side rendering. renderedMarkdown remains the single source of truth (no second copy authored). Keeps rendering + the later inline-comment/anchor layer (s3) in one JS layer. CSP/offline note for the build: the renderer must be a bundled local resource (no CDN), rendered read-only. _(2026-09-19T10:18:17.946Z)_

## Citations

- **[[c1]]** `prior-artifact` `HLD E2026091923891721 framework a1 + k1 (thin orchestrator: plugin renders + transports, reasoning stays daemon-side)` — "Reasoning stays entirely daemon-side (k1); the plugin only renders and transports."
- **[[c2]]** `prior-artifact` `HLD sc1 PendingArtifactList assumption / S001 pending.ts PendingArtifact.mdPath` — "mdPath: rendered .md path under docs/"
- **[[c3]]** `prior-artifact` `HLD k3 (approval flows through the existing approve path with its block-verdict gate) — sc2 approvable/blockReason assumption` — "approvable: false when a review block-verdict stands"
- **[[c4]]** `prior-artifact` `HLD k2 (all daemon access over the existing local Unix-domain-socket JSON-RPC channel)` — "the plugin opens no cloud or REST path"
- **[[c5]]** `prior-artifact` `HLD k5 (a single artifact remains the single source of truth; render the artifact's existing rendered content, never a divergent second copy)` — "never creates a divergent second copy of it"
- **[[c6]]** `prior-artifact` `HLD k6 (one artifact loads across four IDEs off the shared platform module; the review surface degrades where the embedded-browser capability is unavailable)` — "must degrade gracefully wherever the embedded-browser capability is unavailable"
- **[[c7]]** `prior-artifact` `HLD k7 (pending-artifact discovery is a bounded, on-demand or polled read, not a hot loop)` — "bounded, on-demand or polled read rather than a hot loop"
- **[[c8]]** `analyze-bundle` `capability-discovery (s1): getArtifactById (src/db/lance/artifact-vec.ts:209) backs artifact.get (src/daemon/index.ts:992) = LanceDB skill store, NOT workflow .md; resolveArtifactMdPath (path-scheme.ts:119) + jsonPathForMd (gates.ts:758) map identity<->.md/.json` — "artifact.get does NOT serve workflow DEF/HLD/LLD/PLAN .md content"
- **[[c9]]** `prior-artifact` `S001 (main fabe840): DaemonGateway.call transport + PendingQueryResult + UnixSocketDaemonRpc.parse result.error framing + ReviewToolWindow/ReviewListViews` — "the one-shot Unix-socket transport S002 extends with a content-fetch wrapper"
