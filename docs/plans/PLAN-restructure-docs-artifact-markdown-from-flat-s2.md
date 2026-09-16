<!-- insrc:artifact PLAN-599a9b506f22b896-s2 -->

# Plan: E20260916599a9b50:S002

**Epic:** `restructure-docs-artifact-markdown-from-flat`
**LLD run:** `wf-1789535029092-mupr13`
**LLD effective hash:** `196ad617cc5c...`

## Tasks

| # | Task | Size | Depends on | Tests | Derived from |
| :--- | :--- | :--- | :--- | :--- | :--- |
| 1 | **`t1`** New sc2 path-scheme module (resolveArtifactMdPath + listWorkItems + listArtifactMdPaths) | M | — | unit: resolveArtifactMdPath: SPEC/DEF/HLD at work-item root; LLD/PLAN/BUILD/CR/EXT under S<nnn>/; unit: resolveArtifactMdPath: bare <KIND>.md, folder key = fileSeg(slug)+'-'+epicSegment (identity supplies the key, not the filename); unit: resolveArtifactMdPath: workItemKind 'standalone' → docs/standalone/... vs 'epic' → docs/epics/..., same internal S<nnn> grouping; unit: resolveArtifactMdPath: throws when a story-scoped kind is given an epic-level identity (identity.story === undefined); unit: STORY_SCOPED set membership = {LLD,PLAN,BUILD,CR,EXT}; item-root = {SPEC,DEF,HLD}; unit: listWorkItems over a seeded docs/epics + docs/standalone tree returns one sorted, kind-tagged entry per work-item folder; unit: listWorkItems returns an empty list (no throw) when docs/epics or docs/standalone is absent; unit: listArtifactMdPaths returns every artifact md within one work item (item-root SPEC/DEF/HLD + each S<nnn>/ artifact) | [[c1]] [[c2]] |
| 2 | **`t2`** Widen the 9 *ArtifactPaths helpers + 6 *MdRel builders to delegate their md side to sc2 | M | `t1` | unit: lldArtifactPaths (representative) + spec/def/hld/plan/build/codeReview/extend/stub: .md is the nested resolver path; .json is unchanged ARTIFACTS_DIR/<hashId>.json; unit: epicSlug omitted → folder label falls back to fileSeg(epicHash), md still resolves, json unchanged; unit: *MdRel builders (defineMdRel/hldMdRel/lldMdRel/planMdRel/buildMdRel/specMdRel) produce the nested relative md path matching the absolute helper | [[c2]] [[c3]] |
| 3 | **`t3`** Re-thread all 14 non-test *ArtifactPaths caller sites with createdAtISO + workItemKind | L | `t2` | integration: Full workflow+mcp sweep compiles + passes with all 14 callers re-threaded (tsc-proven no caller on the old shape); unit: A standalone-routed caller path produces a docs/standalone/... md path (workItemKind correctly derived, guarding the wrong-top-level bug) | [[c2]] [[c4]] |
| 4 | **`t4`** Re-point the gates.ts docs-md finders to sc2 listing (gates.ts only) | M | `t3` | integration: gates.ts approval-by-md-path + artifact listing resolves against the nested tree via listWorkItems/listArtifactMdPaths (plan-gate.test.ts / gates.test.ts); integration: The BUILD-prefix finder (gates.ts:650) replaced by kind-typed listing still locates the BUILD artifact | [[c4]] [[c5]] |
| 5 | **`t5`** Retire the flat layout (delete DOCS_ARTIFACT_DIRS + plan/buildFilenamePrefix) | S | `t4` | integration: tsc clean with DOCS_ARTIFACT_DIRS + plan/buildFilenamePrefix removed (compiler proves no consumer left on the flat scheme) | [[c1]] [[c6]] |
| 6 | **`t6`** sc2 unit tests + update the existing gate suites for the nested layout | M | `t5` | unit: path-scheme.test.ts: full sc2 resolver + listing suite (fixtures via deriveWorkItemIdentity + a seeded 2-story epic + 1 standalone tree); integration: amendments / questions / tracker-resolve JSON-store suites still pass unchanged (hash-flat store + scanners not re-pointed) | [[c2]] [[c4]] [[c5]] |

### E20260916599a9b50:S002:T001 — New sc2 path-scheme module (resolveArtifactMdPath + listWorkItems + listArtifactMdPaths)

Add src/workflow/path-scheme.ts: ArtifactKind + WorkItemKind + WorkItemLocation types, the internal STORY_SCOPED set ({LLD,PLAN,BUILD,CR,EXT}; item-root {SPEC,DEF,HLD}), resolveArtifactMdPath (pure construction over a sc1 WorkItemIdentity — docs/{epics|standalone}/<fileSeg(slug)>-<epicSegment>/[S<nnn>/]<KIND>.md, throwing when a story-scoped kind gets an epic-level identity), and listWorkItems/listArtifactMdPaths (bounded, sorted, missing-dir-tolerant walks). Built on sc1's deriveWorkItemIdentity (id.ts) and reusing storage.ts fileSeg. Purely additive — no consumer yet, tree still compiles.

**Acceptance checks:**
- src/workflow/path-scheme.ts exports resolveArtifactMdPath, listWorkItems, listArtifactMdPaths + the ArtifactKind/WorkItemKind/WorkItemLocation types
- resolveArtifactMdPath places SPEC/DEF/HLD at the item root and LLD/PLAN/BUILD/CR/EXT under S<nnn>/, with bare <KIND>.md filenames keyed off identity.epicSegment (not the filename)
- resolveArtifactMdPath throws when kind is story-scoped but identity.story is undefined
- listWorkItems/listArtifactMdPaths return deterministic sorted results and an empty list (no throw) when docs/epics or docs/standalone is absent
- tsc clean; no existing consumer references the new module yet

### E20260916599a9b50:S002:T002 — Widen the 9 *ArtifactPaths helpers + 6 *MdRel builders to delegate their md side to sc2

In storage.ts, add createdAtISO + workItemKind params to all 9 *ArtifactPaths helpers (stub/define/spec/hld/lld/plan/build/codeReview/extend) and switch each md side to deriveWorkItemIdentity + resolveArtifactMdPath; keep the json side byte-identical (ARTIFACTS_DIR/<hashId>.json). Switch the 6 *MdRel builders (define/hld/lld/plan/build/spec) to the same resolver so tracker/link issue-body links target the nested paths. epicSlug stays trailing-optional (falls back to fileSeg(epicHash)). This widens an internal-shared signature, so tsc now flags every caller — that error set is t3's checklist.

**Acceptance checks:**
- All 9 *ArtifactPaths helpers accept createdAtISO + workItemKind and return md from resolveArtifactMdPath; json side unchanged
- The 6 *MdRel builders produce the nested relative md path matching the absolute helper
- epicSlug omitted still resolves (folder label falls back to fileSeg(epicHash)); json unchanged
- storage.ts compiles; the only tsc errors remaining are unmigrated call sites (handled in t3)

### E20260916599a9b50:S002:T003 — Re-thread all 14 non-test *ArtifactPaths caller sites with createdAtISO + workItemKind

Update the 14 caller modules (orchestrator, tracker/link, code-review/runner, code-review/gate, mcp/code-review-step/handler, runners/build/standalone-record, tracker-auto, chain, gates, artifacts/lld-io, tracker/sync, runners/tracker/context, questions, cli/services/workflow) to pass createdAtISO (from the artifact's meta.createdAt) and workItemKind (epic vs standalone, from the workflow/triage context / standalone flag). Driven to completeness by the t2 compile-error set. Strictly scoped to the md write side — the JSON-store scanners (amendments/store+staleness, questions.ts:523, tracker/resolve.ts:114) are NOT touched. Kept as one L Task (splitting it would fragment the tsc-driven exhaustiveness that makes it safe).

**Acceptance checks:**
- Every one of the 14 caller sites passes createdAtISO + workItemKind derived from the artifact's own meta/context
- workItemKind is correctly 'standalone' for triage-routed items and 'epic' for epic-parented ones at each site (the one place a silent wrong-top-level bug could slip in — must be right per site)
- tsc clean across the whole tree — no caller left on the old helper shape
- No edit touches amendments/store.ts, amendments/staleness.ts, questions.ts:523, or tracker/resolve.ts:114 (JSON-store scanners stay byte-unchanged)

### E20260916599a9b50:S002:T004 — Re-point the gates.ts docs-md finders to sc2 listing (gates.ts only)

Replace the gates.ts read-side finders with sc2.listWorkItems/listArtifactMdPaths: the readdir loops (:133, :593), the basename.startsWith('BUILD-') match (:650), and the two DOCS_ARTIFACT_DIRS sweeps (:789, :810). HIGHEST-RISK scoping line of the story (the cl7 correction): gates.ts is the ONLY genuine docs-md finder — cli/services/workflow.ts:122 (scans ARTIFACTS_DIR, the JSON store) and cli/services/debug.ts:481 (log-segment lister) are explicitly NOT re-pointed; daemon/backup.ts:103 (layout-agnostic) stays unchanged. A broad grep-for-readdir cutover would regress this.

**Acceptance checks:**
- The gates.ts approval-by-md-path + artifact-listing paths resolve via listWorkItems/listArtifactMdPaths instead of readdir-over-DOCS_ARTIFACT_DIRS + BUILD- prefix scan
- cli/services/workflow.ts:122 and cli/services/debug.ts:481 are byte-unchanged (still scanning ARTIFACTS_DIR / log segments respectively) — the code review must re-verify this specific scope line
- daemon/backup.ts and all JSON-store scanners are unchanged
- tsc clean; the existing gate suites still compile against the new finder API

### E20260916599a9b50:S002:T005 — Retire the flat layout (delete DOCS_ARTIFACT_DIRS + plan/buildFilenamePrefix)

Remove the six flat DOCS_ARTIFACT_DIRS consts and the md-side planFilenamePrefix/buildFilenamePrefix from storage.ts (and the DOCS_ARTIFACT_DIRS import in gates.ts). Atomic cutover (k1): any lingering reference is now a compile error, so a clean tsc proves no consumer is left on the flat scheme. Keep STUB_DIR + ARTIFACTS_DIR + the hash json ids + the JSON-store-only amendment/lld FilenamePrefix helpers.

**Acceptance checks:**
- DOCS_ARTIFACT_DIRS + planFilenamePrefix + buildFilenamePrefix are deleted; STUB_DIR + ARTIFACTS_DIR + hash json ids retained
- The JSON-store-only amendmentFilenamePrefix + lldFilenamePrefix helpers are retained (they serve the hash-flat store)
- tsc clean across the whole tree with the flat consts gone — exhaustiveness compiler-proven (no shim/flag)

### E20260916599a9b50:S002:T006 — sc2 unit tests + update the existing gate suites for the nested layout

Add src/workflow/__tests__/path-scheme.test.ts (resolveArtifactMdPath per ArtifactKind + epic/standalone, story-scoped-with-epic-identity throw, identity-not-filename keying, listWorkItems/listArtifactMdPaths over a seeded 2-story epic + 1 standalone tree, empty-dir tolerance, *ArtifactPaths md-delegates/json-unchanged, *MdRel matches). Update plan-gate.test.ts / gates.test.ts seeding for the widened helper signatures so they exercise the nested tree end-to-end. Run the full workflow+mcp sweep; the amendments/questions/tracker-resolve JSON-store suites act as the untouched-store tripwire.

**Acceptance checks:**
- New path-scheme.test.ts covers every ac1/ac2/ac3 proving-test subject from the LLD test strategy
- At least one test asserts the standalone workItemKind path (docs/standalone/...) so a mis-derived kind from t3 is caught by a test, not only review
- plan-gate.test.ts + gates.test.ts pass against the nested layout with the widened helper signatures
- Full `npx tsx --test 'src/workflow/**/*.test.ts' 'src/mcp/**/*.test.ts'` sweep passes (JSON-store suites green — confirming that side untouched); tsc clean

## Test-strategy coverage

| LLD strategy item | Covered by |
| :--- | :--- |
| resolveArtifactMdPath: SPEC/DEF/HLD land at the work-item root (docs/epics/<slug>-E<date><hash8>/<KIND>.md, no story segment) | `t1`, `t6` |
| resolveArtifactMdPath: LLD/PLAN/BUILD/CR/EXT land under S<nnn>/ (docs/epics/<slug>-E<date><hash8>/S001/<KIND>.md) | `t1`, `t6` |
| resolveArtifactMdPath: workItemKind 'standalone' routes to docs/standalone/... while 'epic' routes to docs/epics/... (top-level distinguishable, same internal S<nnn> grouping) | `t1`, `t3`, `t6` |
| resolveArtifactMdPath: bare <KIND>.md filename; folder key = fileSeg(slug) + '-' + identity.epicSegment; identity (not filename) supplies the key | `t1`, `t6` |
| resolveArtifactMdPath: throws when a story-scoped kind is given an epic-level identity (identity.story === undefined) | `t1`, `t6` |
| path-scheme STORY_SCOPED set membership = {LLD,PLAN,BUILD,CR,EXT}; item-root = {SPEC,DEF,HLD} | `t1`, `t6` |
| listWorkItems over a seeded docs/epics + docs/standalone tree returns one entry per work-item folder, deterministic sorted order, kind-tagged | `t1`, `t6` |
| listWorkItems returns an empty list (no throw) when docs/epics or docs/standalone is absent (fresh repo) | `t1`, `t6` |
| listArtifactMdPaths returns every artifact md within one work item (item-root SPEC/DEF/HLD + each S<nnn>/ artifact) | `t1`, `t6` |
| lldArtifactPaths (representative) + spec/def/hld/plan/build/codeReview/extend/stub helpers: .md is the nested resolver path; .json is unchanged ARTIFACTS_DIR/<hashId>.json | `t2`, `t6` |
| epicSlug omitted → folder label falls back to fileSeg(epicHash), md still resolves, json unchanged | `t2`, `t6` |
| *MdRel builders (defineMdRel/hldMdRel/lldMdRel/planMdRel/buildMdRel/specMdRel) produce the nested relative md path matching the absolute helper | `t2`, `t6` |
| gates.ts approval-by-md-path + artifact listing (the retired-DOCS_ARTIFACT_DIRS sweeps now via listWorkItems/listArtifactMdPaths): existing plan-gate.test.ts / gates.test.ts seeding through the helpers resolves against the nested tree | `t4`, `t6` |
| the BUILD-prefix finder (gates.ts:650) replaced by kind-typed listing still locates the BUILD artifact | `t4`, `t6` |
| amendments / questions / tracker-resolve JSON-store suites still pass unchanged (proves the hash-flat store + its scanners were not re-pointed) | `t3`, `t6` |

## Citations

- **[[c1]]** `prior-artifact` `LLD s2 migration — atomic-cutover (k1): retire the six flat DOCS_ARTIFACT_DIRS + md-side *FilenamePrefix finders outright, no shim` — "The cutover is atomic (k1): the six flat DOCS_ARTIFACT_DIRS consts + the md-side *FilenamePrefix finders are removed outright, not dual-supported behind a shim/flag."
- **[[c2]]** `prior-artifact` `LLD s2 contractDetails/dataModelChanges — sc2 path-scheme module (resolveArtifactMdPath + listWorkItems + listArtifactMdPaths) + the md/json boundary (json side byte-unchanged)` — "New module owning the layout ... resolveArtifactMdPath, listWorkItems, listArtifactMdPaths ... md side delegates to sc2; json side byte-identical to before (hash-flat store untouched)."
- **[[c3]]** `prior-artifact` `LLD s2 dataModelChanges — the 9 *ArtifactPaths helpers gain createdAtISO + workItemKind and delegate their md side; the 6 *MdRel builders delegate to the same resolver` — "All 9 *ArtifactPaths helpers gain createdAtISO + workItemKind params and delegate their md side to resolveArtifactMdPath ... The *MdRel builders ... delegate to the same resolver so links target the n"
- **[[c4]]** `prior-artifact` `LLD s2 postconditions/errorPaths — the 14 non-test *ArtifactPaths caller sites re-threaded (tsc-enforced); JSON-store scanners NOT re-pointed` — "Every one of the 14 non-test *ArtifactPaths caller sites passes the new createdAtISO + workItemKind (tsc enforces completeness) ... the JSON-store scanners ... are NOT re-pointed to sc2."
- **[[c5]]** `prior-artifact` `LLD s2 dataModelChanges (cl7-corrected) — gates.ts is the only docs-md finder to re-point to listWorkItems/listArtifactMdPaths; workflow.ts:122 + debug.ts:481 NOT re-pointed` — "gates.ts is the ONLY genuine docs-md finder: cli/services/workflow.ts:122 scans ARTIFACTS_DIR (the hash-flat JSON store ...), and cli/services/debug.ts:481 lists rotated log segments (unrelated), so n"
- **[[c6]]** `prior-artifact` `LLD s2 chosenAlternative a1 (identity-object resolver) — the winner satisfying ac1/ac2/ac3 + sc1/sc2, keeping resolution pure` — "a1 is the only alternative satisfying every acceptance criterion and both shared contracts ... keeps path resolution pure (no disk read)."

<!-- insrc:review -->

## Review

### ✅ Review `PASS` — plan (plan)

**0 HIGH · 0 MED · 8 LOW** · model `client` · reviewed 2026-09-16T05:59:15.360Z

| Ref | Kind | Severity | Fixability | Premise | Evidence | Action |
| --- | --- | --- | --- | --- | --- | --- |
| t2 | inventory | LOW | auto | storage.ts defines exactly 9 *ArtifactPaths helpers to widen (stub/define/spec/hld/lld/plan/build/codeReview/extend). | storage.ts:201-345 defines exactly 9 *ArtifactPaths helpers (stub/define/spec/hld/lld/plan/build/codeReview/extend) — matches t2. | None — accurate. |
| t2 | inventory | LOW | auto | storage.ts defines exactly 6 *MdRel builders (defineMdRel/hldMdRel/lldMdRel/planMdRel/buildMdRel/specMdRel) plus planFilenamePrefix + buildFilenamePrefix (md-side, retired in t5). | storage.ts:365-370 defines the 6 *MdRel builders (define/hld/lld/plan/build/spec); planFilenamePrefix:292 + buildFilenamePrefix:317 present (md-side, retired in t5); amendment/lldFilenamePrefix retained for the JSON store. | None — accurate. |
| t3 | inventory | LOW | auto | Exactly 14 non-test modules call a *ArtifactPaths helper and must be re-threaded. | grep *ArtifactPaths( over src/ excl tests + storage.ts yields exactly 14 distinct modules, matching t3's list one-for-one. | None — count exact. |
| t4 | citation | LOW | auto | gates.ts holds the docs-md finders to re-point: readdirSync :133/:593, startsWith('BUILD-') :650, DOCS_ARTIFACT_DIRS sweeps :789/:810. | gates.ts confirmed: readdirSync :133/:593, basename(jsonPath).startsWith('BUILD-') :650, [...DOCS_ARTIFACT_DIRS,STUB_DIR] :789, DOCS_ARTIFACT_DIRS :810 — every t4 line cite resolves. | None — citations exact. |
| t4 | citation | LOW | auto | The two cli sites the plan says NOT to re-point are correctly out of scope: cli/services/workflow.ts:122 scans ARTIFACTS_DIR (JSON store) and cli/services/debug.ts:481 lists log segments. | cli/services/workflow.ts:122 has its only readdirSync over join(repoPath, ARTIFACTS_DIR) (listEpics); cli/services/debug.ts:481 has its only readdirSync over rotated *.log segments. Both correctly flagged out-of-scope (the cl7 correction), so the plan's scope guard is sound. | None — the not-re-pointed scope is correct. |
| t5 | citation | LOW | auto | storage.ts declares DOCS_ARTIFACT_DIRS (the 6 flat consts) to delete while keeping STUB_DIR + ARTIFACTS_DIR + the JSON-store-only amendment/lld FilenamePrefix helpers. | storage.ts:69 declares DOCS_ARTIFACT_DIRS = [DEFINES,DESIGNS,PLANS,BUILDS,SPECS,REVIEWS]; STUB_DIR:57 + ARTIFACTS_DIR:50 + amendmentFilenamePrefix:389 + lldFilenamePrefix:394 all present to retain — t5's delete/keep split is accurate. | None — accurate. |
| t1 | citation | LOW | auto | sc1 (deriveWorkItemIdentity) exists in id.ts as the dependency t1 builds on. | id.ts:202 exports deriveWorkItemIdentity (sc1) — the t1 dependency is available. | None — accurate. |
| tasks | ordering | LOW | auto | Task dependsOn is a linear acyclic chain t1←t2←t3←t4←t5←t6 with order 1..6 a valid topological order. | Task dependsOn: t1[], t2[t1], t3[t2], t4[t3], t5[t4], t6[t5] — a linear acyclic chain; order 1..6 is a valid topological order (no Task precedes one it depends on). | None — ordering valid. |
