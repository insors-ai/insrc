<!-- insrc:artifact PLAN-238917216d8fd532-s2 -->

# Plan: E2026091923891721:S002

**Epic:** `ide-artifact-review-panel-jetbrains-plugin`
**LLD run:** `wf-1789811176946-8zjp4x`
**LLD effective hash:** `c93cb4358ff4...`

## Tasks

| # | Task | Size | Depends on | Tests | Derived from |
| :--- | :--- | :--- | :--- | :--- | :--- |
| 1 | **`t1`** Daemon: ArtifactReviewView/OpenQuestionRef types + pure handleArtifactContent scan | M | — | unit: handleArtifactContent: happy path assembles ArtifactReviewView (renderedMarkdown byte-equal to the .md; kind/artifactId/openQuestions/approvable=true); unit: handleArtifactContent: standing block-verdict -> approvable=false + blockReason; openQuestions absent -> empty list; unit: handleArtifactContent: mdPath escaping docs/ / missing .md / missing-malformed .json / repo-unresolved / empty mdPath each -> { error }, no read on the escape case; unit: handleArtifactContent: read-only — no file created or mutated over the fixture | [[c1]] [[c2]] [[c3]] |
| 2 | **`t2`** Daemon: register the 'workflow.artifactContent' IPC handler | S | `t1` | integration: workflow.artifactContent handler: fixture repo + real pending .md -> ArtifactReviewView (delegates to handleArtifactContent with INSRC_REPO fallback); integration: workflow.artifactContent handler: repo-unresolved / path-invalid -> { error } result, never a partial view | [[c1]] |
| 3 | **`t3`** Plugin: ArtifactReviewView/OpenQuestionRef/ArtifactContentResult + DaemonGateway.artifactReviewView wrapper | M | `t1` | unit: artifactReviewView: fake DaemonRpc ok=true(view) -> Loaded with fields forwarded verbatim (k1); unit: artifactReviewView: ok=false / DaemonUnavailableException / malformed -> Unavailable(reason), never Loaded-blank; unit: UnixSocketDaemonRpc.parse (real): {result:{view}} -> Loaded end-to-end; {result:{error}} -> Unavailable (framing boundary) | [[c1]] [[c2]] [[c4]] |
| 4 | **`t4`** Plugin: bundle the vendored markdown->HTML JS renderer as a local resource | S | — | unit: bundled renderer: the vendored JS resource is present on the classpath / in the built resources and referenced by a local URL only (no http(s)/CDN string) | [[c6]] |
| 5 | **`t5`** Plugin: artifact content view in the ReviewToolWindow (JCEF render + native fallback) | L | `t3`, `t4` | unit: ArtifactContentViews.of(Loaded) -> Rendered(renderedMarkdown); of(Unavailable) -> 'content unavailable' (distinct from a blank/empty view); unit: renderModeFor(jcefSupported): JCEF_HTML when true, NATIVE_FALLBACK when false | [[c1]] [[c2]] [[c3]] |
| 6 | **`t6`** Tests: daemon (handleArtifactContent + handler) and plugin (gateway, real parse framing, view mappers) | M | `t1`, `t2`, `t3`, `t5` | unit: Aggregate: the daemon handleArtifactContent + plugin gateway/mapper unit subjects run green (npx tsx --test; ./gradlew test JDK21); integration: Aggregate: the workflow.artifactContent handler integration subjects run green over the temp docs/ + .insrc/artifacts fixture | [[c5]] [[c3]] |

### E2026091923891721:S002:T001 — Daemon: ArtifactReviewView/OpenQuestionRef types + pure handleArtifactContent scan

Add the internal-shared types ArtifactReviewView + OpenQuestionRef and a pure handleArtifactContent(params, repoEnv) that resolves+validates repo/mdPath (docs/ path-traversal containment guard), reads the .md verbatim into renderedMarkdown, resolves the sibling .json via jsonPathForMd and reads openQuestions + the review block-verdict into approvable/blockReason, and maps every failure (repo/mdPath unresolved, path-escape, unreadable .md, missing/malformed .json) to a structured { error }. Mirrors S001's src/workflow/pending.ts (handleWorkflowPending + the { error } convention). Read-only.

**Acceptance checks:**
- handleArtifactContent happy path returns ArtifactReviewView with renderedMarkdown byte-equal to the .md read verbatim, kind/artifactId from the identity, openQuestions from the .json, approvable=true when no block.
- A standing review block-verdict -> approvable=false + blockReason; openQuestions absent -> empty list.
- mdPath escaping docs/ (traversal/absolute/outside) -> { error } with no read; missing .md, missing/malformed .json, repo-unresolved, empty mdPath each -> { error }.
- Read-only: no file created or mutated. tsc clean.

### E2026091923891721:S002:T002 — Daemon: register the 'workflow.artifactContent' IPC handler

Register 'workflow.artifactContent' in the src/daemon/index.ts handler map (beside 'workflow.pending'), delegating to handleArtifactContent with process.env.INSRC_REPO as the fallback. Net-new method key; no existing handler changed.

**Acceptance checks:**
- Handler returns the ArtifactReviewView for a fixture repo + real pending .md (repo from params.repo || INSRC_REPO).
- repo-unresolved / path-invalid -> an { error } result, never a partial view.
- No existing handler (workflow.pending/workflow.approve/artifact.get) is changed. tsc clean; daemon subset green.

### E2026091923891721:S002:T003 — Plugin: ArtifactReviewView/OpenQuestionRef/ArtifactContentResult + DaemonGateway.artifactReviewView wrapper

Add the Kotlin mirror types (ArtifactReviewView, OpenQuestionRef data classes; ArtifactContentResult sealed = Loaded(view)|Unavailable(reason)) and a DaemonGateway.artifactReviewView(projectRootPath, mdPath) wrapper over the existing call('workflow.artifactContent', {repo, mdPath}) transport, mapping ok->Loaded(view forwarded verbatim), ok=false/DaemonUnavailableException/RuntimeException->Unavailable(reason); wire it through DaemonGatewayService. Mirrors S001's DaemonGateway.pendingArtifacts + PendingQueryResult + parseArtifacts. Unit-tested against a fake/canned-reply DaemonRpc, so it does not require t2's live handler.

**Acceptance checks:**
- artifactReviewView maps a fake DaemonRpc ok=true(view) -> Loaded with fields forwarded verbatim (no client classification).
- ok=false / DaemonUnavailableException / malformed reply -> Unavailable(reason), never Loaded-blank.
- Reaches the daemon only over DaemonGateway.call (no file/DB/cloud access). Compiles under JDK21/Gradle 8.10.

### E2026091923891721:S002:T004 — Plugin: bundle the vendored markdown->HTML JS renderer as a local resource

Vendor a markdown->HTML renderer (e.g. marked/markdown-it, minified) under the plugin's resources and ensure it ships in the plugin jar (Gradle processResources / the existing bundleBackendAssets-style task), loadable into the JCEF page from a local URL — NO CDN / no network fetch, rendered read-only. This is the renderer the content view (t5) loads.

**Acceptance checks:**
- The vendored renderer file is present as a plugin resource and included in the built jar (verified via the Gradle resources output).
- It is referenced only by a local/classpath URL — no http(s)/CDN reference anywhere in the loaded page.
- License/version of the vendored bundle is recorded alongside it.

### E2026091923891721:S002:T005 — Plugin: artifact content view in the ReviewToolWindow (JCEF render + native fallback)

Add the content view to the existing ReviewToolWindow. LAND THE PURE MAPPERS FIRST — ArtifactContentViews.of(ArtifactContentResult) -> a content-view state and renderModeFor(jcefSupported) -> JCEF_HTML|NATIVE_FALLBACK (mirroring S001's ReviewListViews so the testable core exists before any JCEF/EDT wiring) — then wire the panel: a pending-list selection triggers a bounded on-demand fetch via DaemonGateway.artifactReviewView; when JBCefApp.isSupported() render renderedMarkdown->HTML inside a JBCefBrowser using the t4 bundled JS renderer (passing the raw renderedMarkdown across the Kotlin->JS bridge, read-only), else degrade to a read-only native-editor fallback showing the same renderedMarkdown with the same review actions; show a distinct 'content unavailable' state on Unavailable. Off-EDT fetch, EDT render. In scope: render + fallback selection only — no inline-comment bridge (s3), no submit (s4), no approve wiring (s5); approvable/blockReason are carried as read-only data.

**Acceptance checks:**
- The pure ArtifactContentViews.of + renderModeFor mappers are extracted first and are unit-testable headlessly (no JCEF/EDT).
- Selecting a pending artifact opens its content rendered legibly (JCEF HTML via the bundled JS renderer) within the tool window (ac1).
- renderModeFor(false) -> the read-only native-editor fallback carrying the same review actions; Unavailable shows 'content unavailable', never a blank/empty pane (ac2).
- The view shows exactly renderedMarkdown (the artifact's own content) with no second copy authored (ac3); the fetch is a single on-open request/reply, off the EDT with EDT render.
- No s3/s4/s5 scope is implemented. Loads across the four IDEs off the shared platform module.

### E2026091923891721:S002:T006 — Tests: daemon (handleArtifactContent + handler) and plugin (gateway, real parse framing, view mappers)

Add daemon node:test units for handleArtifactContent (happy path byte-equal, block-verdict, empty openQuestions, path-escape, missing .md, missing/malformed .json, repo/mdPath unresolved, read-only) + an integration test for the workflow.artifactContent handler over a temp docs/ + .insrc/artifacts fixture; plugin JUnit for artifactReviewView (Loaded/Unavailable mapping via fake DaemonRpc), the REAL UnixSocketDaemonRpc.parse framing ({result:{view}}->Loaded, {result:{error}}->Unavailable), and the pure ArtifactContentViews/renderModeFor mappers. Verify locally (npx tsx --test; ./gradlew test JDK21) — no live socket, no GitHub CI.

**Acceptance checks:**
- Every LLD test-strategy subject for ac1/ac2/ac3 has a passing test across the daemon + plugin layers.
- Daemon subset green via npx tsx --test; plugin tests green via ./gradlew test on JDK21.
- A real-parse test crosses the framing boundary (the S001 hollow-test lesson); no test hits a live socket or GitHub Actions.

## Test-strategy coverage

| LLD strategy item | Covered by |
| :--- | :--- |
| happy path: renderedMarkdown EQUALS the .md read verbatim (byte-for-byte), kind/artifactId from identity, openQuestions from .json, approvable=true when no block (ac1/ac3) | `t1`, `t6` |
| standing block-verdict -> approvable=false + blockReason | `t1`, `t6` |
| openQuestions absent -> empty list, not an error | `t1`, `t6` |
| mdPath escaping docs/ -> { error }, no read (path-traversal guard) | `t1`, `t6` |
| missing/unreadable .md -> { error } | `t1`, `t6` |
| missing/malformed sibling .json -> { error } | `t1`, `t6` |
| repo unresolved / empty mdPath -> { error } | `t1`, `t6` |
| read-only: no file created or mutated | `t1`, `t6` |
| ok=true view payload -> Loaded(view), fields verbatim (k1) | `t3`, `t6` |
| ok=false / DaemonUnavailableException / malformed -> Unavailable(reason), never Loaded-blank | `t3`, `t6` |
| real parse: {result:{view}} -> Loaded end-to-end; {result:{error}} -> Unavailable (framing boundary, the S001 lesson) | `t3`, `t6` |
| ArtifactContentViews.of(Loaded) -> Rendered(renderedMarkdown); of(Unavailable) -> 'content unavailable' | `t5`, `t6` |
| renderModeFor(jcefSupported): JCEF_HTML when true, NATIVE_FALLBACK when false (ac2/lc2) | `t5`, `t6` |
| fixture repo + real pending .md -> ArtifactReviewView (delegates to handleArtifactContent with INSRC_REPO fallback) | `t2`, `t6` |
| repo-unresolved / path-invalid -> { error } result, never a partial view | `t2`, `t6` |

## Citations

- **[[c1]]** `prior-artifact` `LLD s2 contractDetails.api workflow.artifactContent + handleArtifactContent + jsonPathForMd` — "'workflow.artifactContent': (params: { repo?: string; mdPath: string }) => Promise<ArtifactReviewView | { error: string }>"
- **[[c2]]** `prior-artifact` `LLD s2 dataModelChanges ArtifactReviewView / OpenQuestionRef / ArtifactContentResult` — "+ interface ArtifactReviewView { artifactId; kind; renderedMarkdown; openQuestions; approvable; blockReason? }"
- **[[c3]]** `prior-artifact` `LLD s2 errorPaths (path-traversal guard, missing .md/.json, repo/mdPath unresolved, socket-down -> { error }/Unavailable) + invariants` — "renderedMarkdown is the .md read verbatim — no transformation, no divergent second copy (k5/lc1/ac3)"
- **[[c4]]** `prior-artifact` `LLD s2 interactionWithShared sc2 (implements) / sc1 (consumes) + DaemonGateway.artifactReviewView` — "Forwards the daemon's view verbatim (no client-side classification — k1)"
- **[[c5]]** `prior-artifact` `LLD s2 testStrategy (daemon node:test + plugin JUnit incl. the real-parse framing test)` — "Daemon: node:test via npx tsx --test ... Plugin: JUnit5 + BasePlatformTestCase ... via ./gradlew test on JDK21"
- **[[c6]]** `prior-artifact` `LLD s2 migration + resolved open question qe66729e4 (bundled JS renderer inside JCEF, vendored/local/no-CDN, read-only)` — "render renderedMarkdown->HTML in JBCefBrowser when JBCefApp.isSupported(), else the native-editor fallback"

<!-- insrc:review -->

## Review

### ✅ Review `PASS` — plan (plan)

**0 HIGH · 0 MED · 6 LOW** · model `client` · reviewed 2026-09-19T10:24:21.301Z

| Ref | Kind | Severity | Fixability | Premise | Evidence | Action |
| --- | --- | --- | --- | --- | --- | --- |
| plan/ordering | ordering | LOW | manual | The task dependsOn graph is acyclic with a valid topological order 1..6: t1,t4 roots; t2->t1; t3->t1; t5->{t3,t4}; t6->{t1,t2,t3,t5} — every dependency precedes its dependents. | From the plan's own task table: roots t1,t4 (no deps); t2->t1; t3->t1; t5->{t3,t4}; t6->{t1,t2,t3,t5}. Order 1..6 places every dependency before its dependents — acyclic, valid topological order. | none — verified sound |
| t1 | citation | LOW | manual | t1 mirrors S001's handleWorkflowPending + PendingArtifact in src/workflow/pending.ts (the { error } convention it reuses). | handleWorkflowPending confirmed at src/workflow/pending.ts:67 and interface PendingArtifact at src/workflow/pending.ts:42 — the S001 seam t1 mirrors. | none — verified sound |
| t1 | citation | LOW | manual | t1's sibling-.json read reuses the existing jsonPathForMd helper in src/workflow/gates.ts. | jsonPathForMd confirmed at src/workflow/gates.ts:758 (read FOUND: 'export function jsonPathForMd(mdPath: string): string {'). | none — verified sound |
| t2 | closed-union | LOW | manual | 'workflow.artifactContent' is net-new — no handler by that name exists under src/ today; t2 registers it beside the existing 'workflow.pending'. | 'workflow.artifactContent' appears ONLY in this Epic's S002 LLD/PLAN docs — zero matches under src/ — while the sibling 'workflow.pending' is live at src/daemon/index.ts:579. Confirms t2's handler is net-new, registered beside an existing sibling. | none — verified sound |
| t3/t5 | cross-artifact | LOW | manual | t3/t5 extend the shipped S001 plugin seams (DaemonGateway.call + PendingQueryResult + ReviewToolWindow/ReviewListViews) rather than re-implementing them. | DaemonGateway.call at jetbrains-plugin/.../daemon/DaemonGateway.kt:111, sealed interface PendingQueryResult at :47, and ReviewToolWindowFactory at .../review/ReviewToolWindow.kt:41 all confirmed — the shipped S001 plugin seams t3/t5 extend. | none — verified sound |
| plan/coverage | cross-artifact | LOW | manual | Every LLD s2 test-strategy subject appears in the plan's test-strategy-coverage table mapped to >=1 task, and citations c1..c6 each map to an LLD s2 handoff section. | Verifiable from the artifact under review: its test-strategy-coverage table lists all 15 LLD s2 subjects, each mapped to >=1 task (t1/t2/t3/t5 + the t6 aggregate), and citations c1..c6 are each referenced by >=1 task's derivedFrom. (The external LLD.md read probe used a bare path with no line anchor, hence 'not found'; it does not contradict the claim.) | none — verified sound |
