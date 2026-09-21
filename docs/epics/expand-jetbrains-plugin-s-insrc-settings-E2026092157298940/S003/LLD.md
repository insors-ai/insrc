<!-- insrc:artifact LLD-57298940cdc341bc-s3 -->

# LLD: E2026092157298940:S003

**Epic:** `expand-jetbrains-plugin-s-insrc-settings`
**HLD base run:** `wf-1789970136758-lvyg6v`
**HLD effective hash:** `7b17d6a14b2a...`

## HLD context

**Framework:** Chosen shape a1: three new child Settings pages (Daemon, Workflows, Debug) are registered declaratively as <applicationConfigurable parentId="ai.insors.insrc.settings"> nodes under the UNCHANGED parent insrc Configurable, each a thin Swing page built on a shared abstract page-shell base (the off-EDT-load + InsrcCollapsible/JBScrollPane idiom the settings page already established). Every page is a read/act surface over a plugin-side seam placed at its natural home — the DaemonGateway grows in-place sealed *Result IPC methods, a lifecycle-command runner reuses the existing ScriptDaemonProvisioner/script-locator to run daemon-ctl.sh subcommands, an OS-process seam (Java ProcessHandle) does the single guarded orphan-kill, a read-only chain reader projects .insrc/artifacts, and a first-of-its-kind log-editor seam (LightVirtualFile + FileEditorManager) hosts the tail. Nothing touches the shipped parent settings page or the daemon; everything is additive, plugin-only, and off-EDT.
**Rollout phase:** Phase B — Operational pages (Daemon, Workflows, Debug status+orphans)
**Consumes:** `sc1` (NestedSettingsNavScaffold + SharedPageShell)

**Adjacent scope (owned by other stories — do NOT implement here):**
- `s1`: PRIVATE to S001: the concrete registration wiring of the three child Configurable classes in plugin.xml, the abstract page-shell base implementation (its createComponent off-EDT/guarded-render mechanics), and the parse of the daemon.status payload into DaemonStatusDto. S001 delivers the empty-but-navigable pages + the shared status read; it does not implement any page's domain body — those are the consuming Stories'. — owns `sc1`, `sc2`
- `s2`: PRIVATE to S002: the Daemon page body (health readout rendered from sc2 + the six action controls), and the lifecycle-action backing used only here — the new DaemonGateway IPC methods for backup/compact/shutdown (sealed *Result) and a lifecycle-command runner that executes daemon-ctl.sh subcommands (start/stop/restart/update) via the existing ScriptDaemonProvisioner + DefaultDaemonScriptLocator, off the EDT with streamed progress and a backup-dir prompt. No other Story consumes these, so they stay S002-internal.
- `s4`: PRIVATE to S004: the Debug status card rendered from sc2 (plus locally-derived pid/version where the status payload lacks them), and the OS-process seam — a Java ProcessHandle enumerator that recommends stray daemon-entry processes (excluding the managed one) and a confirm-gated kill that acts solely on the explicit selection and degrades to 'unsupported' off a capable platform (the single mutation, k3). S004 also implements the DebugPageHost (sc3) and seeds its own status+orphan section. — owns `sc3`
- `s5`: PRIVATE to S005: the MCP diagnostic section it contributes to the Debug page host — a read-only view combining the plugin's existing host-detection (which MCP clients are registered/connected) with a new DaemonGateway debug-status read (daemon.debug-status → the sessions attached to the socket, with identity + connection time), degrading to a clear unavailable line when the daemon is unreachable. No mutating control (k3).
- `s6`: PRIVATE to S006: the log-editor seam — the plugin's first LightVirtualFile + FileEditorManager surface — that opens a chosen daemon/agent log (from the known LOG_DIR) as a read-only editor tab and streams appended lines off the EDT into it, with a level/module/text filter applied to the view. The 'open log' affordance attaches to the Debug page host (sc3). Nothing deletes/rotates/clears the underlying log (k5, read-only).

## Contract details

**Surface level:** internal

### `WorkflowChainReader.readAll`

```typescript
class WorkflowChainReader(private val artifactsDirOf: (project: Project) -> Path? = { it.basePath?.let { p -> Path.of(p, ".insrc", "artifacts") } }) { fun readAll(): List<WorkflowChainDto> }
```

**Returns:** `List<WorkflowChainDto>` — One WorkflowChainDto per Epic (per DEF-*.json) found across the open projects' .insrc/artifacts dirs, projecting the read-only chain state ac1 requires; empty list when no open project has any DEF-*.json (drives the ac3 empty state).

**Errors:**
- `(none — never throws)` when A missing/unreadable artifacts dir, a malformed JSON file, or a project with no basePath is swallowed per-file and contributes nothing; the method returns whatever it could read (possibly empty), mirroring daemonStatus()'s never-throws contract so the off-EDT page render is safe.

**Preconditions:**
- Called off the EDT (from WorkflowsConfigurable.buildBody() on a pooled thread) — it does blocking local file I/O.

**Postconditions:**
- Performs only local reads under each open project's .insrc/artifacts; opens no socket and mutates nothing (k1, k6).
- Each returned WorkflowChainDto.stories staleness is computed with computeHldEffectiveHash over the same sha256(runId + '|'+id...) rule the CLI uses (gates.ts:293).

### `WorkflowChainReader.computeHldEffectiveHash`

```typescript
private fun computeHldEffectiveHash(hldRunId: String, approvedAmendmentIds: List<String>): String
```

**Parameters:**
- `hldRunId: String` — The HLD artifact's meta.runId — the base of the effective-hash chain.
- `approvedAmendmentIds: List<String>` — The ids of this Epic's APPROVED amendments (AMD-*.json with status=='approved'), in artifact order, folded into the hash exactly as artifacts/lld.ts:176 does.

**Returns:** `String` — sha256 hex of (hldRunId + concat('|'+id) over approvedAmendmentIds) — the plugin-side reproduction of computeHldEffectiveHash used to decide a story LLD's staleness by `!=` against lld.meta.hldEffectiveHash.

**Postconditions:**
- Uses java.security.MessageDigest("SHA-256"); pure, no I/O.
- With no approved amendments returns sha256(hldRunId) — matching the CLI's base case.

### `WorkflowsConfigurable.buildBody`

```typescript
override fun buildBody(): javax.swing.JComponent
```

**Returns:** `javax.swing.JComponent` — The read-only chain-status panel: an Epic selector + per-Epic collapsible chain card (define/HLD marks, per-story design/approved/stale, next-action hint, amendment counts) built from WorkflowChainReader.readAll(); or a clear empty-state label when readAll() is empty (ac3). Contains NO approve/reject/amend control (ac2/k6).

**Errors:**
- `(none propagated)` when Any failure inside buildBody() is rendered as the base InsrcOpsConfigurable JLabel error card rather than thrown — the sc1 base guarantees the render is disposed-guarded and off-EDT (k2).

**Preconditions:**
- Invoked by the sc1 base InsrcOpsConfigurable.createComponent() on a pooled thread (off the EDT).

**Postconditions:**
- Reads only local artifact files via WorkflowChainReader; touches neither the daemon nor the parent settings page (k1/k4).
- Exposes read-only status only — no mutating or approval affordance anywhere in the returned component (ac2/k6).

## Data model changes

### `WorkflowChainDto` — new

Plugin-owned read-only projection of the CLI ChainReport STATE subset S003 renders (a faithful subset, NOT a port of the mutating NextAction/tracker machine). Fields: epicHash:String, epicSlug:String?, define:StageMark, hld:StageMark, stories:List<StoryChainMark>, amendmentsPending:Int, amendmentsApproved:Int, nextActionHint:String. StageMark = { exists:Boolean, approved:Boolean, rejected:Boolean }. StoryChainMark = { id:String, title:String, hasLld:Boolean, approved:Boolean, stale:Boolean, staleReason:String? }. nextActionHint is a plain human string derived from the marks (e.g. 'Approve HLD', 'Design story s3', 'Refresh stale LLD for s2', 'Chain complete') — NOT the CLI's typed 11-case NextAction union and with NO push-tracker/sync-tracker cases (k6, no daemon).

**Call sites:**
- `jetbrains-plugin/src/main/kotlin/ai/insors/insrc/jetbrains/ops/WorkflowsConfigurable.kt (renders it)`
- `jetbrains-plugin/src/main/kotlin/ai/insors/insrc/jetbrains/workflow/WorkflowChainReader.kt (produces it)`

### `StageMark` — new

{ exists:Boolean, approved:Boolean, rejected:Boolean } — the define/HLD existence+approval projection read from DEF-*.json / HLD-*.json meta.approvedAt (non-empty => approved) and meta.rejectedAt (chain.ts:137-138,148-149).

**Call sites:**
- `jetbrains-plugin/src/main/kotlin/ai/insors/insrc/jetbrains/workflow/WorkflowChainReader.kt`

### `StoryChainMark` — new

{ id:String, title:String, hasLld:Boolean, approved:Boolean, stale:Boolean, staleReason:String? } — per-story chain state: hasLld from LLD-<hash>-<storyId>.json presence, approved from its meta.approvedAt, stale from lld.meta.hldEffectiveHash != computeHldEffectiveHash(hld.meta.runId, approvedAmendmentIds) (chain.ts:172-173, gates.ts:293). id/title from the DEF body.stories[] entry.

**Call sites:**
- `jetbrains-plugin/src/main/kotlin/ai/insors/insrc/jetbrains/workflow/WorkflowChainReader.kt`

## Interaction with shared contracts

| Contract | Role | How |
| :--- | :--- | :--- |
| `sc1` | consumes | WorkflowsConfigurable extends the S001 abstract InsrcOpsConfigurable base and fills ONLY pageTitle() + buildBody(); the base owns createComponent()'s off-EDT load + disposed-guarded invokeLater render + JBScrollPane/ScrollableColumn shell (k2). buildBody() calls the private WorkflowChainReader over the open projects' .insrc/artifacts and renders its WorkflowChainDto list read-only via ui/InsrcCollapsible.collapsiblePanel. The parent settings page and its plugin.xml <applicationConfigurable> element stay byte-unchanged (k4); the S001 placeholder JLabel body is replaced. |

## Error paths

### Error cases

- **An open project's .insrc/artifacts directory is absent or unreadable (no workflow ever run, or a permissions error on the dir).** (recoverable)
  - Detection: readAll() resolves the dir via artifactsDirOf(project) and, before listing, checks Files.isDirectory / catches the IOException from the directory stream; a project that yields no dir or throws on listing contributes nothing.
  - Response: Skip that project silently and continue with the others; if NO project yields any DEF-*.json the aggregate list is empty, which buildBody() renders as the ac3 empty state (not an error card).
  - User impact: The developer sees the empty state (or only the projects that do have artifacts), never a stack trace or a blank page.
- **A single artifact JSON file (DEF/HLD/LLD/AMD) is malformed or truncated (partial write, hand-edit).** (recoverable)
  - Detection: The per-file Gson parse throws JsonSyntaxException/JsonParseException, caught in the per-file read helper.
  - Response: That one file is dropped from the projection; the Epic still renders from the files that did parse (e.g. a broken LLD makes its story fall back to hasLld=false rather than aborting the whole card). readAll() never rethrows.
  - User impact: One story/stage may show as absent when its file is corrupt, but the rest of the chain status is intact and the page still loads.
- **An HLD artifact is missing or has no meta.runId, yet story LLDs exist, so staleness cannot be computed.** (recoverable)
  - Detection: The reader finds hld.exists=false (or a blank runId) while assembling StoryChainMark; the staleness branch guards on a non-blank hldRunId before calling computeHldEffectiveHash.
  - Response: When the HLD base is unavailable, stale is reported false with staleReason=null (staleness is undefined without an HLD base) rather than throwing on a null runId; the story still shows hasLld/approved from its own file.
  - User impact: Staleness is shown as 'not stale' for a chain whose HLD is missing — a conservative, non-alarming default; the missing-HLD state is itself visible in the HLD StageMark.
- **The plugin's MessageDigest recomputation diverges from the daemon's computeHldEffectiveHash after a future CLI change to the hashing rule (lock-step drift, the known a1 risk).** (recoverable)
  - Detection: Not detectable at runtime by the plugin (both sides just produce hex strings); it surfaces only as a story wrongly flagged stale / not-stale versus what the CLI review surface shows.
  - Response: Contained by design: staleness is advisory read-only state (k6) and the authoritative gate stays in the daemon/review surface; the LLD checklist pins the hash rule to gates.ts:293 / artifacts/lld.ts:176 so a divergence is caught by the reader's fixture test (a matching + mismatching hldEffectiveHash case) when the rule is mirrored, and the memory note flags the mirror as a maintenance point.
  - User impact: In the worst case a stale badge is wrong until the mirror is updated; no action is gated on it here, so nothing breaks — the developer confirms in the review surface before acting.

### Edge cases

| Input | Expected |
| :--- | :--- |
| No project is open at all (Settings opened from the welcome screen) — ProjectManager.getInstance().openProjects is empty. | readAll() returns an empty list; buildBody() renders the ac3 empty state ('No insrc workflow artifacts in the open project'). |
| Multiple projects are open, each with its own .insrc/artifacts. | readAll() aggregates Epics across every open project (each project's DEF-*.json set), so the page lists all of them; an Epic is labeled with its epicSlug/epicHash to disambiguate. |
| An Epic has a DEF but zero LLDs yet (define done, no story designed). | define.exists=true, hld may or may not exist, every StoryChainMark has hasLld=false/approved=false/stale=false; nextActionHint reflects the earliest incomplete stage (e.g. 'Approve HLD' or 'Design story <first>'). |
| An Epic whose every stage is approved and no LLD is stale and no amendment is pending. | nextActionHint = 'Chain complete'; all StageMarks approved, all StoryChainMarks approved and not stale, amendmentsPending=0. |
| A story LLD carries an hldEffectiveHash that differs from the recomputed value (an approved amendment landed after the LLD, or the HLD was re-run). | StoryChainMark.stale=true with a staleReason; nextActionHint surfaces 'Refresh stale LLD for <storyId>'. |
| AMD-*.json files exist for the Epic with mixed statuses (some pending, some approved, some rejected). | amendmentsPending / amendmentsApproved count only the matching-epicHash amendments by status (rejected excluded from both), mirroring countAmendments (chain.ts:195). |

### Invariants to preserve

- The Workflows page and its chain reader remain strictly read-only — no approve/reject/amend/refresh control and no daemon IPC anywhere in the surface; approvals stay in the existing review surface (k6). c2 is the existing read-only artifact-review capability this status view sits beside without duplicating its mutating actions. [[c2]]

## Test strategy

**Test framework:** `JUnit5 (org.junit.jupiter) — the jetbrains-plugin test module, mirroring src/workflow/__tests__/chain.test.ts in Kotlin and the DaemonPageTest/NestedOpsPagesTest source-scan idiom.`

### Test levels

- **unit** — Prove the WorkflowChainReader projects the .insrc/artifacts JSON into the correct read-only WorkflowChainDto: existence/approval marks, per-story hasLld/approved/stale (matching + mismatching hldEffectiveHash), amendment counts by status, the derived nextActionHint, and the never-throws/empty behaviors.
  - Subjects: `WorkflowChainReader.readAll (over a temp .insrc/artifacts dir with injected artifactsDirOf)`, `WorkflowChainReader.computeHldEffectiveHash (sha256 base case + approved-amendment fold)`, `the nextActionHint derivation across chain states`
  - Fixtures: `A Files.createTempDirectory .insrc/artifacts populated with hand-written DEF-<hash>.json (body.stories[], meta.epicHash/epicSlug), HLD-<hash>.json (meta.runId, meta.approvedAt), LLD-<hash>-<storyId>.json (meta.approvedAt, meta.hldEffectiveHash), AMD-<id>.json (top-level epicHash/status/id)`, `a matching-hash LLD (not stale) and a mismatching-hash LLD (stale) fixture pair`, `an empty temp dir (no DEF) and a dir with mixed-status AMD files`, `a malformed/truncated JSON file to exercise the per-file swallow`
- **unit** — Source-scan guard the Workflows PAGE invariants that can't be asserted by booting the Settings dialog headlessly: it consumes sc1 (extends the base + fills buildBody), renders the chain model read-only, exposes NO approve/reject/amend control (ac2/k6), shows an empty state (ac3), and does not touch the parent settings page (k4).
  - Subjects: `WorkflowsConfigurable.kt source text (extends InsrcOpsConfigurable, calls WorkflowChainReader, renders via InsrcCollapsible, no approve/reject/amend tokens, replaces the S001 placeholder)`, `InsrcSettingsConfigurable.kt source text (not repointed at WorkflowsConfigurable)`
  - Fixtures: `read of src/main/kotlin/ai/insors/insrc/jetbrains/ops/WorkflowsConfigurable.kt`, `read of src/main/kotlin/ai/insors/insrc/jetbrains/settings/InsrcSettingsConfigurable.kt`

### Acceptance mapping

| Criterion | Proving tests |
| :--- | :--- |
| `ac1` | `unit(reader): a fully-populated Epic fixture (DEF+HLD approved, one approved LLD, one stale LLD, one absent LLD, pending+approved AMDs) projects define/hld StageMarks, per-story hasLld/approved/stale StoryChainMarks, amendmentsPending/Approved counts, and a nextActionHint`, `unit(reader): computeHldEffectiveHash matches the CLI rule so the matching-hash story is not stale and the mismatching-hash story is stale`, `source-scan(page): WorkflowsConfigurable reads WorkflowChainReader and renders the define/HLD/story/amendment fields read-only via InsrcCollapsible` |
| `ac2` | `source-scan(page): WorkflowsConfigurable source contains no approve/reject/amend/JButton action-listener control and no gateway/daemon IPC call — status readout only (k6)` |
| `ac3` | `unit(reader): an empty temp .insrc/artifacts dir (and a no-open-project resolver) yields an empty List<WorkflowChainDto>`, `source-scan(page): WorkflowsConfigurable renders a clear empty-state label when the chain list is empty rather than a blank/error panel` |

## Migration

**State before:** The Workflows child Settings page exists but is inert: S001 registered ops/WorkflowsConfigurable.kt as an <applicationConfigurable parentId="ai.insors.insrc.settings"> with a PLACEHOLDER JLabel body ('arrive in a later insrc update'), extending the InsrcOpsConfigurable base (convention.detect bundle). No plugin-side chain reader exists; the only chain-status computation lives in the daemon/CLI (src/workflow/chain.ts buildChainReport, data-model.trace bundle). NestedOpsPagesTest currently guards WorkflowsConfigurable as placeholder-only (JLabel body, no domain code), exactly as S002 hit for DaemonConfigurable.

**State after:** WorkflowsConfigurable.buildBody() is filled: it invokes a NEW plugin-internal WorkflowChainReader that scans the open projects' .insrc/artifacts (external-contract bundle) and projects a read-only WorkflowChainDto list, rendered read-only via InsrcCollapsible (define/HLD marks, per-story design/approved/stale, next-action hint, amendment counts) with an empty state when none is found (ac3), and NO approve/reject/amend control (ac2/k6). The parent settings page and every other page are byte-unchanged.

**Zero downtime:** yes — **Data rewrite:** no

### Steps

1. Add the new plugin-internal WorkflowChainReader (+ WorkflowChainDto/StageMark/StoryChainMark data classes) under jetbrains-plugin/.../workflow/ — a pure additive read-only reader over .insrc/artifacts; nothing consumes the daemon and no existing type changes. — ↩ rollbackable
2. Fill WorkflowsConfigurable.buildBody() to call WorkflowChainReader.readAll() and render the WorkflowChainDto list read-only via InsrcCollapsible, with an empty-state label; replace the S001 placeholder JLabel body. This is the only edit to an existing file's behavior and it is confined to the Workflows page body. — ↩ rollbackable
3. Update the NestedOpsPagesTest placeholder-only guard to exclude WorkflowsConfigurable (scope the assertion with `cls != "WorkflowsConfigurable"`, exactly as S002 did for DaemonConfigurable), since its body is no longer a placeholder; add the new WorkflowsPageTest (source-scan) + WorkflowChainReaderTest (temp-dir fixtures). — ↩ rollbackable

**Backward compat:** No public/plugin-external API changes: WorkflowChainReader and the DTOs are new plugin-internal types, and WorkflowsConfigurable's only external contract is its <applicationConfigurable> registration id (ai.insors.insrc.workflows), which is unchanged. The sc1 base (InsrcOpsConfigurable) is consumed unchanged — no override signature changes, so no fanout across the other pages. The daemon's chain.ts stays the authoritative source; the plugin reader is a read-only mirror that never writes and gates nothing, so a divergence degrades to a wrong advisory badge, never a broken contract.

## Alternatives considered

### a1: Lean plugin-side chain reader (state facts + a simple next-action hint), no tracker — **CHOSEN**

A pure plugin-side reader scans the open project's .insrc/artifacts and projects a read-only chain model — per-epic define/HLD existence+approval, per-story hasLld/approved/stale (staleness via sha256(hld.runId+amendments)), amendment counts, and a SIMPLE next-action hint derived from those facts; it omits the CLI's tracker push/sync half; the Workflows page renders it read-only (k6).

A new S003-internal WorkflowChainReader (a pure Kotlin function over a repo path + the .insrc/artifacts dir, no daemon) does the local reads and projects a plugin-owned WorkflowChainDto (a read-only SUBSET of the CLI ChainReport) plus a small derived nextActionHint computed from an ordered precedence over those facts; WorkflowsConfigurable.buildBody() consumes the sc1 base off the EDT, resolves the open project via ProjectManager.getInstance().openProjects, runs the reader, and renders an Epic picker + a read-only accordion/table chain view via ui/InsrcCollapsible with a clear empty state (ac3). No approve/reject/amend control (k6).

### a2: Full-fidelity ChainReport reproduction (11-case NextAction + tracker) plugin-side

Port the ENTIRE CLI ChainReport plugin-side — the same define/HLD/story reads PLUS the full 11-case NextAction state machine and the tracker push/sync state — so the Workflows page matches `insrc workflow chain` byte-for-byte.

Same local .insrc/artifacts reads as a1, but additionally reimplement computeNextAction's full 11-case precedence and readTrackerMeta (pushed/epicRef/lastSyncedAt from the define artifact's meta) in Kotlin, projecting the complete ChainReport shape verbatim; the page renders the exact next-action string + the tracker line.

**Rejected because:** HIGH lock-step-divergence risk: the 11-case NextAction machine + tracker semantics are non-trivial evolving CLI logic that a Kotlin port silently drifts from whenever the TS changes; the tracker push/sync half is daemon/GitHub-adjacent state a read-only file-reader can only partially reconstruct; substantially more code + tests for state the k6 read-only page cannot act on, when ac1 only needs 'the next action' that a1's hint already provides.

### a3: New read-only daemon IPC (workflow.chain) the plugin calls

Add a daemon-side read-only IPC that returns the ChainReport (reusing the CLI's chain.ts) and make the Workflows page a thin caller — no plugin-side artifact logic.

The daemon grows a new read-only workflow.chain/workflow.listEpics IPC handler that runs buildChainReport server-side; DaemonGateway gains a read method and the Workflows page renders the returned report, mirroring how the Review tool window consumes workflow.pending.

**Rejected because:** VIOLATES k1 outright — the Epic is explicitly plugin-only with NO daemon or CI change in scope (this is precisely the HLD-level a3 the Epic already rejected); the chain is project-local files the same-machine plugin can read directly, so routing them through the daemon adds a dependency for data the plugin already has and fails when the daemon is down; it expands the blast radius to the daemon + the IDE-fork IPC lock-step.

## Citations

- **[[c1]]** `analyze-bundle` `s1 data-model.trace — src/workflow/chain.ts ChainReport shape` — "interface ChainReport { epicHash, epicSlug?, define, hld, stories[], amendments, tracker, nextAction }; S003 projects the STATE subset (define/hld/stories/amendments + a next-action hint), read-only, "
- **[[c2]]** `analyze-bundle` `s1 external-contract — .insrc/artifacts JSON layout + approval/staleness/amendment markers` — "Artifacts at <repo>/.insrc/artifacts/<ID>.json; DEF-/HLD-/LLD-<storyId>/AMD- ids; meta.approvedAt marks approved; staleness = lld.meta.hldEffectiveHash != sha256(hld.meta.runId + '|'+id per approved a"
- **[[c3]]** `analyze-bundle` `s1 convention.detect — sc1 consumption + app-level Configurable project resolution` — "WorkflowsConfigurable subclasses InsrcOpsConfigurable and fills buildBody() off-EDT; the app-level Settings page has no injected Project, so it resolves the open project via ProjectManager.getInstance"
- **[[c4]]** `analyze-bundle` `s1 test.locate — reader temp-dir fixtures + page source-scan idiom` — "The reader is a pure function over a temp .insrc/artifacts dir (chain.test.ts idiom in Kotlin/JUnit5); the page is source-scanned like NestedOpsPagesTest/DaemonPageTest."
- **[[c5]]** `prior-artifact` `HLD 57298940cdc341bc sharedContract sc1 (NestedSettingsNavScaffold + SharedPageShell), ownedByStory s1` — "sc1: the declarative parent-nesting pattern + shared abstract page-shell base; consumed by s2/s3/s4."
- **[[c6]]** `step-output` `s2 alternatives / s3 alternatives.judge — a1 chosen, a3 violates k1` — "a1 lean plugin-side reader chosen; a2 full-fidelity port ranked 2 (high divergence); a3 new daemon IPC ranked 3 (violates k1)."

<!-- insrc:review -->

## Review

### ✅ Review `PASS` — design.story (design.story)

**0 HIGH · 0 MED · 10 LOW** · model `client` · reviewed 2026-09-21T09:30:50.318Z

| Ref | Kind | Severity | Fixability | Premise | Evidence | Action |
| --- | --- | --- | --- | --- | --- | --- |
| HLD context / data model | citation | LOW | auto | src/workflow/chain.ts defines the ChainReport interface (define/hld/stories/amendments/tracker/nextAction) that the plugin's WorkflowChainDto projects a read-only subset of. | Confirmed: src/workflow/chain.ts:30 'export interface ChainReport {' resolves exactly; the DTO is correctly described as a read-only subset of it. | None — citation resolves. |
| contractDetails | citation | LOW | auto | The artifacts directory constant is '.insrc/artifacts' defined in src/workflow/storage.ts (~line 53), the layout the reader scans. | Partly confirmed: the '.insrc/artifacts'/ARTIFACTS_DIR grep returned 50 (capped) matches so the specific storage.ts:53 line was not isolated in the shown hits, but the layout is corroborated across the codebase and is not correctness-load-bearing beyond the well-known artifacts path. | None needed; the artifacts-dir path is a stable convention. Build step can confirm storage.ts:53 exactly. |
| computeHldEffectiveHash | citation | LOW | auto | computeHldEffectiveHash lives in src/workflow/artifacts/lld.ts (~line 176) and folds sha256(baseRunId + '\|'+id per approved amendment) — the rule the plugin mirrors. | Confirmed: computeHldEffectiveHash is exported from ../artifacts/lld.js (28 src hits incl. chain.test.ts and adjacent-scope-gate.test.ts imports); the plugin correctly mirrors this sha256(runId+'\|'+id) rule. | None — symbol resolves. |
| staleness rule | citation | LOW | auto | src/workflow/gates.ts (~line 293) compares lld.meta.hldEffectiveHash against the recomputed effective hash with a !== staleness check. | Supported: hldEffectiveHash has 34 src hits and computeHldEffectiveHash is the staleness comparator; the specific gates.ts:293 line was not isolated in the capped grep but the !== staleness comparison is well-grounded (workflow-design.md:676 'by hldEffectiveHash mismatch'). | None needed; line anchor is advisory for the mirror, verifiable at build. |
| amendments count | citation | LOW | auto | countAmendments in src/workflow/chain.ts (~line 195) tallies AMD artifacts by status (pending/approved/rejected) for the matching epicHash. | Confirmed exactly: src/workflow/chain.ts:195 'function countAmendments(repoPath, epicHash): ChainReport[amendments]' and chain.ts:88 calls it — the by-status tally the DTO mirrors. | None — citation resolves. |
| StageMark | semantic | LOW | auto | An artifact's approval is marked by a non-empty meta.approvedAt (and rejection by meta.rejectedAt), which chain.ts reads to decide define/HLD/LLD approved state. | Supported: approvedAt/rejectedAt are the approval markers across the workflow artifacts (rejectedAt 20 hits; approvedAt semantics confirmed in CLAUDE.md 'It stamps approvedAt'); chain.ts reads these for stage approval. | None — approval-marker semantics hold. |
| sc1 consumption | citation | LOW | auto | The consumed sc1 base InsrcOpsConfigurable exists in the plugin at ops/InsrcOpsConfigurable.kt with an abstract buildBody() the Workflows page fills. | Confirmed: jetbrains-plugin/.../ops/InsrcOpsConfigurable.kt:33 'abstract class InsrcOpsConfigurable : Configurable {' with an abstract buildBody — the sc1 base the page consumes. | None — base class resolves. |
| migration stateBefore | citation | LOW | auto | WorkflowsConfigurable.kt currently exists as a placeholder child page under ops/ that S003 will fill. | Confirmed: jetbrains-plugin/.../ops/WorkflowsConfigurable.kt:12 'class WorkflowsConfigurable : InsrcOpsConfigurable()' exists as the placeholder page S003 fills. | None — target class resolves. |
| interactionWithShared | cross-artifact | LOW | auto | The HLD assigns sc1 ownership to s1 and lists s3 among its consumers; S003 consumes sc1 and owns no shared contract. | Supported: ownedByStory is the HLD ownership field (22 doc hits); sc1 ownedByStory=s1 with s3 as a consumer is grounded in the HLD context slice, and S003 owns no shared contract (interactionWithShared role=consumes only). | None — cross-artifact ownership trace holds. |
| project resolution | external-contract | LOW | auto | ProjectManager.getInstance().openProjects is the IntelliJ platform API an app-level Configurable uses to reach open projects (no injected Project), as the review UI reads project.basePath. | External IntelliJ platform contract: ProjectManager.getInstance().openProjects is a stable public API (not yet referenced in plugin src, which is expected pre-build); basePath is already used by prior plugin LLDs. Correct approach for an app-level Configurable with no injected Project. | None — platform API is valid; build will introduce the reference. |
