<!-- insrc:artifact PLAN-57298940cdc341bc-s3 -->

# Plan: E2026092157298940:S003

**Epic:** `expand-jetbrains-plugin-s-insrc-settings`
**LLD run:** `wf-1789982225210-bo9ivm`
**LLD effective hash:** `7b17d6a14b2a...`

## Tasks

| # | Task | Size | Depends on | Tests | Derived from |
| :--- | :--- | :--- | :--- | :--- | :--- |
| 1 | **`t1`** Add the WorkflowChainDto/StageMark/StoryChainMark data classes + WorkflowChainReader skeleton | S | — | unit: WorkflowChainReaderTest: the three data classes carry the exact LLD field shapes and the ctor default artifactsDirOf resolves basePath/.insrc/artifacts (compile + shape smoke) | [[c1]] [[c2]] |
| 2 | **`t2`** Implement computeHldEffectiveHash (sha256 base + approved-amendment fold) | S | `t1` | unit: WorkflowChainReaderTest.computeHldEffectiveHash base case: (runId, []) == sha256(runId) hex; unit: WorkflowChainReaderTest.computeHldEffectiveHash fold: (runId, [a,b]) folds '\\|a\\|b' in order, matching the CLI rule (mirrors chain.test.ts hldEffectiveHash) | [[c3]] |
| 3 | **`t3`** Implement readAll(): scan .insrc/artifacts + project WorkflowChainDto per Epic | L | `t1`, `t2` | unit: WorkflowChainReaderTest.readAll projects a fully-populated Epic (DEF+HLD approved, approved LLD, stale LLD, absent LLD) into the right StageMarks + StoryChainMarks; unit: WorkflowChainReaderTest.readAll staleness: matching-hash LLD => stale=false, mismatching-hash LLD => stale=true with staleReason; unit: WorkflowChainReaderTest.readAll amendment tally: mixed-status AMD counts amendmentsPending/Approved by matching epicHash, rejected excluded; unit: WorkflowChainReaderTest.readAll never-throws: a malformed JSON file, a missing/unreadable dir, and a no-basePath project are each swallowed; unit: WorkflowChainReaderTest.readAll HLD-missing guard: LLDs present but no HLD/blank runId => stale=false/staleReason=null, no crash; unit: WorkflowChainReaderTest.readAll empty: an empty .insrc/artifacts dir (and a no-open-project resolver) yields an empty List<WorkflowChainDto> | [[c1]] [[c2]] [[c4]] |
| 4 | **`t4`** Derive nextActionHint from the projected chain facts | M | `t3` | unit: WorkflowChainReaderTest.nextActionHint precedence: each chain state (no-DEF, unapproved-DEF, pending-amendment, no-HLD, unapproved-HLD, stale-story) yields the expected single hint; unit: WorkflowChainReaderTest.nextActionHint terminal: fully-approved non-stale no-pending chain yields 'Chain complete'; a stale story yields 'Refresh stale LLD for <storyId>' | [[c1]] |
| 5 | **`t5`** Fill WorkflowsConfigurable.buildBody() to render the chain read-only via InsrcCollapsible | M | `t3`, `t4` | unit: WorkflowsPageTest source-scan: WorkflowsConfigurable extends InsrcOpsConfigurable, calls WorkflowChainReader, renders via InsrcCollapsible, and shows an empty-state label | [[c5]] [[c6]] |
| 6 | **`t6`** Add reader + page tests and scope the NestedOpsPagesTest placeholder guard | M | `t3`, `t4`, `t5` | unit: WorkflowsPageTest source-scan (k6/ac2): WorkflowsConfigurable contains no approve/reject/amend/JButton-action control and no gateway/daemon IPC call; unit: WorkflowsPageTest source-scan (k4): InsrcSettingsConfigurable is not repointed at WorkflowsConfigurable; parent page untouched; unit: NestedOpsPagesTest: the placeholder-only guard excludes WorkflowsConfigurable and still passes for the remaining placeholder page(s); smoke: Local gate: gradlew test buildPlugin green on JDK21 (--no-build-cache after the new data classes) | [[c7]] [[c5]] |

### E2026092157298940:S003:T001 — Add the WorkflowChainDto/StageMark/StoryChainMark data classes + WorkflowChainReader skeleton

Create the new file jetbrains-plugin/src/main/kotlin/ai/insors/insrc/jetbrains/workflow/WorkflowChainReader.kt with the three read-only data classes (WorkflowChainDto{epicHash,epicSlug?,define:StageMark,hld:StageMark,stories:List<StoryChainMark>,amendmentsPending:Int,amendmentsApproved:Int,nextActionHint:String}, StageMark{exists,approved,rejected}, StoryChainMark{id,title,hasLld,approved,stale,staleReason?}) and the reader class shell: ctor-injected artifactsDirOf:(Project)->Path? defaulting to basePath/.insrc/artifacts, and the readAll():List<WorkflowChainDto> signature. No behavior yet beyond the never-throws scaffold.

**Acceptance checks:**
- The file compiles with the three data classes matching the LLD field shapes exactly
- WorkflowChainReader exposes the ctor artifactsDirOf param (default basePath/.insrc/artifacts) and a readAll():List<WorkflowChainDto>
- No daemon/socket reference and no mutating method — plugin-internal read-only types only (k1/k6)

### E2026092157298940:S003:T002 — Implement computeHldEffectiveHash (sha256 base + approved-amendment fold)

Add the private computeHldEffectiveHash(hldRunId:String, approvedAmendmentIds:List<String>):String using java.security.MessageDigest("SHA-256"), folding hldRunId + concat('|'+id) over approvedAmendmentIds — mirroring artifacts/lld.ts:176 / gates.ts:293; base case (no amendments) = sha256(hldRunId).

**Acceptance checks:**
- computeHldEffectiveHash(runId, []) returns sha256(runId) hex
- computeHldEffectiveHash(runId, [a,b]) folds '|a|b' onto runId in order, matching the CLI rule
- Pure, no I/O

### E2026092157298940:S003:T003 — Implement readAll(): scan .insrc/artifacts + project WorkflowChainDto per Epic

Fill readAll(): resolve each open project's artifacts dir via artifactsDirOf; for each, scan DEF-*.json (epicHash/epicSlug + body.stories[]{id,title} + define StageMark from meta.approvedAt/rejectedAt); read HLD-*.json (StageMark + meta.runId); per story read LLD-<hash>-<storyId>.json (hasLld, approved, stale = lld.meta.hldEffectiveHash != computeHldEffectiveHash(hld.runId, approvedAmendmentIds)); tally AMD-*.json by matching-epicHash status into amendmentsPending/Approved. Gson parse per file; never-throws (per-file JsonSyntaxException swallow + missing/unreadable dir + no-basePath skip). HLD-missing guard: stale=false/staleReason=null when hldRunId blank. NOTE (t3 critique): kept as one cohesive L; the s5 test-strategy names a separate proving test per failure mode (malformed-file swallow, missing-dir skip, HLD-missing guard, amendment tally) so the L stays verifiable in slices.

**Acceptance checks:**
- One WorkflowChainDto per DEF-*.json across all open projects' artifacts dirs; empty list when none
- define/hld StageMarks reflect exists + meta.approvedAt/rejectedAt; per-story hasLld/approved from the LLD file; stale from the hash mismatch
- amendmentsPending/Approved count only matching-epicHash AMD by status (rejected excluded)
- A malformed JSON file, a missing/unreadable dir, and a no-basePath project are each swallowed — readAll never throws
- HLD-missing (blank runId) yields stale=false/staleReason=null, not a crash

### E2026092157298940:S003:T004 — Derive nextActionHint from the projected chain facts

Add the private nextActionHint derivation over the projected marks with an ordered precedence (no DEF->run define; DEF unapproved->approve define; pending amendments->review amendments; no HLD->run HLD; HLD unapproved->approve HLD; a stale/unbuilt/unapproved story->its next step named with the storyId; else 'Chain complete'). A plain human String, NOT the CLI's typed 11-case NextAction; no push-tracker/sync-tracker cases (k6).

**Acceptance checks:**
- Every chain state yields exactly one hint string via the documented precedence
- A fully-approved, non-stale, no-pending-amendment chain yields 'Chain complete'
- A stale story yields a 'Refresh stale LLD for <storyId>' hint; no tracker push/sync case exists

### E2026092157298940:S003:T005 — Fill WorkflowsConfigurable.buildBody() to render the chain read-only via InsrcCollapsible

Replace the S001 placeholder body: resolve the open project(s) via ProjectManager.getInstance().openProjects, run WorkflowChainReader.readAll() (already off the EDT via the sc1 base), render an Epic picker + per-Epic collapsible chain card (define/HLD marks, per-story design/approved/stale, nextActionHint, amendment counts) via ui/InsrcCollapsible.collapsiblePanel following the DaemonConfigurable idiom, and a clear empty-state JLabel when the list is empty (ac3). NO approve/reject/amend control and no gateway/daemon call (ac2/k6). Parent settings page + plugin.xml element untouched (k4).

**Acceptance checks:**
- buildBody() calls WorkflowChainReader and renders define/HLD/story/amendment fields read-only via InsrcCollapsible
- Empty readAll() renders a clear empty-state label, not a blank/error panel (ac3)
- No approve/reject/amend/JButton-action control and no gateway/daemon IPC anywhere in the page (ac2/k6)
- Still `class WorkflowsConfigurable : InsrcOpsConfigurable()`; InsrcSettingsConfigurable + plugin.xml untouched (k4)

### E2026092157298940:S003:T006 — Add reader + page tests and scope the NestedOpsPagesTest placeholder guard

Add WorkflowChainReaderTest.kt (JUnit5 temp-dir fixtures: DEF/HLD/LLD/AMD JSON — existence/approval, matching vs mismatching hldEffectiveHash staleness, amendment counts, empty-dir empty, malformed-file swallow, HLD-missing) + WorkflowsPageTest.kt (source-scan: extends base, calls WorkflowChainReader, renders via InsrcCollapsible, no approve/reject/amend token, empty-state label, parent page untouched). Edit NestedOpsPagesTest to exclude WorkflowsConfigurable from the placeholder-only guard (`cls != "WorkflowsConfigurable"`, as S002 did for DaemonConfigurable). Verify locally: gradlew test buildPlugin (JDK21, --no-build-cache after the new data classes).

**Acceptance checks:**
- WorkflowChainReaderTest covers matching/mismatching staleness, amendment counts, empty-dir, malformed-file swallow, HLD-missing
- WorkflowsPageTest source-scan asserts sc1 consumption, InsrcCollapsible render, no approve/reject/amend control, empty state, parent untouched
- NestedOpsPagesTest placeholder guard excludes WorkflowsConfigurable and still passes for the remaining placeholder(s)
- Full jetbrains-plugin test + buildPlugin green locally on JDK21

## Test-strategy coverage

| LLD strategy item | Covered by |
| :--- | :--- |
| WorkflowChainReader.readAll (over a temp .insrc/artifacts dir with injected artifactsDirOf) | `t3`, `t6` |
| WorkflowChainReader.computeHldEffectiveHash (sha256 base case + approved-amendment fold) | `t2`, `t6` |
| the nextActionHint derivation across chain states | `t4`, `t6` |
| WorkflowsConfigurable.kt source text (extends InsrcOpsConfigurable, calls WorkflowChainReader, renders via InsrcCollapsible, no approve/reject/amend tokens, replaces the S001 placeholder) | `t5`, `t6` |
| InsrcSettingsConfigurable.kt source text (not repointed at WorkflowsConfigurable) | `t6` |

## Citations

- **[[c1]]** `prior-artifact` `LLD s3 dataModelChanges + contractDetails — WorkflowChainDto/StageMark/StoryChainMark + readAll projecting the CLI ChainReport STATE subset + nextActionHint (src/workflow/chain.ts:30)`
- **[[c2]]** `analyze-bundle` `s1 external-contract — .insrc/artifacts JSON layout (DEF/HLD/LLD/AMD ids; meta.approvedAt/rejectedAt; storage.ts:53 ARTIFACTS_DIR)`
- **[[c3]]** `prior-artifact` `LLD s3 contractDetails.WorkflowChainReader.computeHldEffectiveHash — sha256(hldRunId + '|'+id per approved amendment) mirroring artifacts/lld.ts:176`
- **[[c4]]** `analyze-bundle` `s1 external-contract — staleness comparison (gates.ts:293 hldEffectiveHash !==) + countAmendments by status (chain.ts:195)`
- **[[c5]]** `prior-artifact` `LLD s3 interactionWithShared sc1 + migration — WorkflowsConfigurable subclasses InsrcOpsConfigurable and fills buildBody(); parent page + plugin.xml untouched (k4)`
- **[[c6]]** `analyze-bundle` `s1 page-sizing — InsrcCollapsible.collapsiblePanel accordion/table render idiom + ProjectManager.getInstance().openProjects (DaemonConfigurable pattern)`
- **[[c7]]** `analyze-bundle` `s1 test-sizing — reader temp-dir JUnit5 fixtures (chain.test.ts idiom) + page source-scan (NestedOpsPagesTest/DaemonPageTest) + the placeholder-guard scoping`

<!-- insrc:review -->

## Review

### ✅ Review `PASS` — plan (plan)

**0 HIGH · 0 MED · 6 LOW** · model `client` · reviewed 2026-09-21T09:36:15.780Z

| Ref | Kind | Severity | Fixability | Premise | Evidence | Action |
| --- | --- | --- | --- | --- | --- | --- |
| tasks | ordering | LOW | auto | The plan's 6 tasks form an acyclic dependency graph with a valid topological order (t1<-t2<-t3<-t4<-t5<-t6), respecting storyDependsOn s1 (already shipped). | The dependsOn graph (t1:[], t2:[t1], t3:[t1,t2], t4:[t3], t5:[t3,t4], t6:[t3,t4,t5]) is acyclic and order 1..6 is a valid topological sort; s1 (sc1 base + placeholder page) is already shipped, so ordering respects storyDependsOn. | None — ordering is valid. |
| t2 | citation | LOW | auto | computeHldEffectiveHash exists in src/workflow/artifacts/lld.ts as the sha256(runId + amendments) rule the plugin mirrors (t2 target). | Confirmed: computeHldEffectiveHash is exported from src/workflow/artifacts/lld.js (18 src hits incl. plan-e2e.test.ts and adjacent-scope-gate.test.ts imports); t2 correctly mirrors this rule. | None — symbol resolves. |
| t3 | citation | LOW | auto | src/workflow/chain.ts:30 defines ChainReport and chain.ts:195 defines countAmendments — the CLI markers t3 mirrors. | Confirmed exactly: src/workflow/chain.ts:30 'export interface ChainReport {' and chain.ts:195 'function countAmendments(repoPath, epicHash): ChainReport[amendments]' — the markers t3 mirrors. | None — citations resolve. |
| t5 | citation | LOW | auto | The sc1 base ops/InsrcOpsConfigurable.kt and the placeholder ops/WorkflowsConfigurable.kt both exist in the plugin (t5 fills the latter, subclassing the former). | Confirmed: ops/InsrcOpsConfigurable.kt has 'abstract class InsrcOpsConfigurable' and ops/WorkflowsConfigurable.kt:12 'class WorkflowsConfigurable : InsrcOpsConfigurable()' — t5's fill target subclasses the base. | None — base + target class resolve. |
| t6 | citation | LOW | auto | The test idioms t6 extends exist: NestedOpsPagesTest.kt (placeholder guard) and the CLI chain.test.ts (hldEffectiveHash fixtures). | Confirmed: NestedOpsPagesTest.kt:17 'class NestedOpsPagesTest' exists (t6's guard-scope edit target) and hldEffectiveHash appears in the CLI chain fixtures (t6's reader-test idiom). | None — test idioms resolve. |
| coverage | cross-artifact | LOW | auto | Every task derivedFrom id (c1..c7) resolves to a plan citation, and all 5 LLD testStrategy subjects are covered by >=1 task in testStrategyCoverage. | All task derivedFrom ids c1..c7 are defined in the plan's citations block, and all 5 LLD testStrategy subjects appear in testStrategyCoverage each with >=1 covering task — no dead citation, no uncovered subject. | None — grounding + coverage complete. |
