<!-- insrc:artifact PLAN-238917216d8fd532-s1 -->

# Plan: E2026091923891721:S001

**Epic:** `ide-artifact-review-panel-jetbrains-plugin`
**LLD run:** `wf-1789800359056-6mub19`
**LLD effective hash:** `c93cb4358ff4...`

## Tasks

| # | Task | Size | Depends on | Tests | Derived from |
| :--- | :--- | :--- | :--- | :--- | :--- |
| 1 | **`t1`** Daemon: pending-artifact types + pure listPendingArtifacts scan | M | — | unit: listPendingArtifacts: a store with mixed states (one approvedAt-set, one rejectedAt-set, two with neither) returns ONLY the two pending ones (ac1); unit: listPendingArtifacts: each returned descriptor carries kind (from the filename prefix), title (from body), mdPath, workItemId (when meta has it), openQuestionCount (body.openQuestions?.length ?? 0), state==='pending'; unit: listPendingArtifacts: a KIND outside the sc1 union (e.g. a BUILD-*.json with no approvedAt/rejectedAt) is excluded; unit: listPendingArtifacts: absent .insrc/artifacts dir -> [] (not a throw); unit: listPendingArtifacts: a malformed single JSON file is skipped and the other pending artifacts still returned; unit: listPendingArtifacts: a pending artifact with no openQuestions array -> openQuestionCount 0; with no workItemId -> workItemId omitted | [[c1]] [[c2]] |
| 2 | **`t2`** Daemon: register the 'workflow.pending' IPC handler | S | `t1` | integration: workflow.pending handler: given a fixture repo with pending artifacts -> { artifacts: [...] } with the pending set (ac1); integration: workflow.pending handler: given a repo whose store is all-approved/rejected or absent -> { artifacts: [] } (ac3, distinct from error); integration: workflow.pending handler: repo-unresolved (no params.repo, no INSRC_REPO) -> an { error } result, NOT { artifacts: [] } (ac2); integration: workflow.pending handler: store readdir throws -> { error } result (ac2) | [[c3]] |
| 3 | **`t3`** Plugin: DaemonGateway.pendingArtifacts wrapper (Available/Unavailable) | M | — | unit: pendingArtifacts: a fake DaemonRpc returning ok=true with an artifacts list -> Available(list) (ac1); empty list -> Available(emptyList) => 'nothing pending' (ac3); unit: pendingArtifacts: a fake DaemonRpc returning ok=false (or throwing DaemonUnavailableException) -> Unavailable(reason), never Available(emptyList) (ac2); unit: pendingArtifacts: the wrapper performs no classification — it forwards the daemon descriptors verbatim (k1) | [[c4]] |
| 4 | **`t4`** Plugin: review ToolWindow + pending-list entry + bounded poll | M | `t3` | unit: pending-list model: Available(list) -> shows the pending set; Available(empty) -> 'nothing awaiting review'; Unavailable -> 'backing service unavailable' (never blanks to empty) | [[c5]] [[c6]] |
| 5 | **`t5`** Tests: daemon (unit + integration) and plugin (JUnit, fake DaemonRpc) | M | `t2`, `t3`, `t4` | unit: Aggregate: the listPendingArtifacts + pendingArtifacts unit subjects run green via npx tsx --test and ./gradlew test; integration: Aggregate: the workflow.pending handler integration subjects run green over the temp .insrc/artifacts fixture | [[c1]] [[c3]] [[c4]] |

### E2026091923891721:S001:T001 — Daemon: pending-artifact types + pure listPendingArtifacts scan

Add the internal-shared types PendingArtifact / WorkflowPendingRequest / WorkflowPendingResult and a pure listPendingArtifacts(repoPath) that enumerates ARTIFACTS_DIR ('.insrc/artifacts') like resolve.ts, parses each <KIND>-<hash>.json once, keeps those with meta.approvedAt absent AND meta.rejectedAt absent whose KIND is in the sc1 union, and maps each to a PendingArtifact (kind from prefix, title from body, mdPath from the storage path helpers, workItemId from meta, openQuestionCount from body.openQuestions?.length ?? 0). Skips a malformed file; returns [] for an absent store.

**Acceptance checks:**
- The three types compile under strict mode; PendingArtifact matches the sc1 descriptor exactly (kind union, state:'pending').
- listPendingArtifacts returns only pending artifacts (approvedAt absent AND rejectedAt absent) of an sc1-union KIND; approved/rejected/non-union kinds excluded.
- Absent .insrc/artifacts dir -> []; a malformed single JSON file is skipped and the rest returned. tsc clean.

### E2026091923891721:S001:T002 — Daemon: register the 'workflow.pending' IPC handler

Register 'workflow.pending' in the src/daemon/index.ts handler map, resolving repo from params.repo || process.env.INSRC_REPO like its siblings, delegating to listPendingArtifacts and returning { artifacts }. A repo-unresolved or store-unreadable failure is caught and returned as an { error } result (never a silent empty list).

**Acceptance checks:**
- Handler returns { artifacts: PendingArtifact[] } for a fixture repo; empty artifacts[] for an all-approved/rejected or absent store.
- repo-unresolved and store-unreadable both return an { error } result, NOT { artifacts: [] }.
- No existing handler (workflow.approve/artifact.get/artifact.search) is changed. tsc clean; workflow+daemon subset green.

### E2026091923891721:S001:T003 — Plugin: DaemonGateway.pendingArtifacts wrapper (Available/Unavailable)

Add a pendingArtifacts(projectRootPath) method to the plugin DaemonGateway (+ a PendingArtifactDto and a PendingQueryResult = Available(list) | Unavailable(reason)) as a thin wrapper over the existing DaemonGateway.call('workflow.pending', {repo}). Maps ok=true -> Available (empty list included), ok=false / DaemonUnavailableException -> Unavailable(reason). No classification in the plugin — descriptors forwarded verbatim.

**Acceptance checks:**
- pendingArtifacts maps a fake DaemonRpc ok=true(list) -> Available(list), ok=true(empty) -> Available(emptyList), ok=false/exception -> Unavailable(reason) never Available(emptyList).
- Reaches the daemon only over the existing local socket via DaemonGateway.call; no cloud/REST; no approval/pending classification client-side.
- Compiles under the JDK21/Gradle 8.10 build.

### E2026091923891721:S001:T004 — Plugin: review ToolWindow + pending-list entry + bounded poll

Register a review ToolWindow (plugin.xml toolWindow extension + a ToolWindowFactory) hosting a pending-list entry that renders three distinct states — the pending list, 'nothing awaiting review' (Available empty), and 'backing service unavailable' (Unavailable). Drive it from a bounded poll scheduler (project-open via the existing InsrcProjectOpenActivity, IDE focus, coarse timer) calling DaemonGateway.pendingArtifacts. The tool window is the LIST host only; its rendered-artifact content view is s2's scope (consumed later).

**Acceptance checks:**
- The ToolWindow registers and activates across the shared platform module (one artifact, four IDEs); existing plugin extensions/activation untouched.
- The list shows the pending set on Available(list), 'nothing awaiting review' on Available(empty), and 'backing service unavailable' on Unavailable — the unavailable state never blanks to an empty list.
- Discovery is bounded (project-open/focus/coarse timer), never a hot loop or held-open subscription.

### E2026091923891721:S001:T005 — Tests: daemon (unit + integration) and plugin (JUnit, fake DaemonRpc)

Add daemon node:test unit tests for listPendingArtifacts (written against t1 alone: mixed states, descriptor mapping, non-union exclusion, absent dir, malformed skip, missing openQuestions/workItemId) + integration tests for the workflow.pending handler (needs t2: pending set / empty / repo-unresolved-error / store-unreadable-error) over a temp .insrc/artifacts fixture; add plugin JUnit tests for pendingArtifacts (needs t3: Available/Unavailable mapping) with the Sc2DaemonGatewayTest fake DaemonRpc. Verify locally (npx tsx --test; ./gradlew test JDK21) — no GitHub CI. Per the s3 critique, the listPendingArtifacts unit layer only depends on t1; the integration/gateway layers on t2/t3 respectively — kept as one task since build implements t1..t4 before t5.

**Acceptance checks:**
- Every LLD test-strategy subject for ac1/ac2/ac3 has a passing test across the two layers.
- Daemon subset green via npx tsx --test; plugin tests green via ./gradlew test on JDK21.
- No test hits a live socket or GitHub Actions.

## Test-strategy coverage

| LLD strategy item | Covered by |
| :--- | :--- |
| listPendingArtifacts: a store with mixed states (one approvedAt-set, one rejectedAt-set, two with neither) returns ONLY the two pending ones (ac1) | `t1`, `t5` |
| listPendingArtifacts: each returned descriptor carries kind (from the filename prefix), title (from body), mdPath, workItemId (when meta has it), openQuestionCount (body.openQuestions?.length ?? 0), state==='pending' | `t1`, `t5` |
| listPendingArtifacts: a KIND outside the sc1 union (e.g. a BUILD-*.json with no approvedAt/rejectedAt) is excluded | `t1`, `t5` |
| listPendingArtifacts: absent .insrc/artifacts dir -> [] (not a throw) | `t1`, `t5` |
| listPendingArtifacts: a malformed single JSON file is skipped and the other pending artifacts still returned | `t1`, `t5` |
| listPendingArtifacts: a pending artifact with no openQuestions array -> openQuestionCount 0; with no workItemId -> workItemId omitted | `t1`, `t5` |
| workflow.pending handler: given a fixture repo with pending artifacts -> { artifacts: [...] } with the pending set (ac1) | `t2`, `t5` |
| workflow.pending handler: given a repo whose store is all-approved/rejected or absent -> { artifacts: [] } (ac3, distinct from error) | `t2`, `t5` |
| workflow.pending handler: repo-unresolved (no params.repo, no INSRC_REPO) -> an { error } result, NOT { artifacts: [] } (ac2) | `t2`, `t5` |
| workflow.pending handler: store readdir throws -> { error } result (ac2) | `t2`, `t5` |
| pendingArtifacts: a fake DaemonRpc returning ok=true with an artifacts list -> Available(list) (ac1); empty list -> Available(emptyList) => 'nothing pending' (ac3) | `t3`, `t5` |
| pendingArtifacts: a fake DaemonRpc returning ok=false (or throwing DaemonUnavailableException) -> Unavailable(reason), never Available(emptyList) (ac2) | `t3`, `t5` |
| pendingArtifacts: the wrapper performs no classification — it forwards the daemon descriptors verbatim (k1) | `t3`, `t5` |

## Citations

- **[[c1]]** `prior-artifact` `LLD s1 contractDetails.api listPendingArtifacts + dataModelChanges PendingArtifact/WorkflowPendingRequest/WorkflowPendingResult` — "New internal-shared types + a pure listPendingArtifacts(repoPath) fs scan classifying pending = approvedAt absent AND rejectedAt absent over the sc1 kind union."
- **[[c2]]** `prior-artifact` `LLD s1 how-does-it-work bundle: storage.ts ARTIFACTS_DIR + resolve.ts enumeration` — "Artifacts persist as .insrc/artifacts/<KIND>-<hash>.json; resolve.ts already enumerates that directory (artifactsDir/readdirSync) — the scan pattern listPendingArtifacts reuses."
- **[[c3]]** `prior-artifact` `LLD s1 contractDetails.api workflow.pending + dataModelChanges ArtifactMetaBase.approvedAt/rejectedAt` — "The daemon handler resolves repo from params.repo || INSRC_REPO, returns { artifacts } for the pending set, and maps repo-unresolved/store-unreadable to an { error } result; pending derives from meta."
- **[[c4]]** `prior-artifact` `LLD s1 contractDetails.api DaemonGateway.pendingArtifacts` — "A thin plugin wrapper over the existing DaemonGateway.call mapping DaemonResult ok/empty/error to Available(list)/Unavailable(reason); no client-side classification (k1)."
- **[[c5]]** `prior-artifact` `LLD s1 boundary.internal + migration step 3-4 (plugin pending-list surface + poll)` — "s1 owns the plugin-side poll scheduler (project-open/IDE-focus/coarse timer) and the tool-window list entry rendering the pending set, 'nothing awaiting review', and 'backing service unavailable' stat"
- **[[c6]]** `analyze-bundle` `structural-map: JetBrains plugin has no ToolWindow today (plugin.xml) + shared-platform-module single artifact` — "There is no ToolWindow registered today; s1 introduces the review tool window (plugin.xml toolWindow extension + ToolWindowFactory) as the pending-list host, loading across all four IDEs off the share"

<!-- insrc:review -->

## Review

### ✅ Review `PASS` — plan (plan)

**0 HIGH · 0 MED · 5 LOW** · model `client` · reviewed 2026-09-19T07:18:03.755Z

| Ref | Kind | Severity | Fixability | Premise | Evidence | Action |
| --- | --- | --- | --- | --- | --- | --- |
| plan | ordering | LOW | manual | The task dependsOn graph is acyclic with a valid topological order 1..5: t1,t3 roots; t2->t1; t4->t3; t5->{t2,t3,t4}. | Structural: t1,t3 roots; t2->t1; t4->t3; t5->{t2,t3,t4}; order 1..5 places every dependency before its dependents — acyclic, valid topological order. | none — verified sound |
| t3/t5 | citation | LOW | manual | The plugin test suite reuses an existing fake-DaemonRpc pattern from Sc2DaemonGatewayTest. | jetbrains-plugin/src/test/kotlin/ai/insors/insrc/jetbrains/daemon/Sc2DaemonGatewayTest.kt exists — the fake-DaemonRpc pattern the plugin tests reuse. | none — verified sound |
| t1/c2 | citation | LOW | manual | ARTIFACTS_DIR = '.insrc/artifacts' exists in storage.ts and resolve.ts enumerates that directory — the scan pattern t1 reuses. | ARTIFACTS_DIR = '.insrc/artifacts' at src/workflow/storage.ts:53; artifactsDir enumeration confirmed — the scan pattern t1 reuses. | none — verified sound |
| t2/c3 | closed-union | LOW | manual | 'workflow.pending' is net-new: no such handler is registered in src/daemon today; workflow.approve exists as the sibling convention it mirrors. | 'workflow.approve' handler at src/daemon/index.ts:555 confirmed as the sibling convention; 'workflow.pending' appears only in this Epic's docs, never under src/ — net-new. | none — verified sound |
| t3/c4 | citation | LOW | manual | The plugin DaemonGateway exposes call(method, params) (the existing transport the t3 wrapper extends). | DaemonGateway.kt:69 `fun call(method,params)` confirmed — the existing transport the t3 wrapper extends. | none — verified sound |
