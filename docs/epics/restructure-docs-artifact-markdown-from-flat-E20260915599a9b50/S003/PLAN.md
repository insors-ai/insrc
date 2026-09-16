<!-- insrc:artifact PLAN-599a9b506f22b896-s3 -->

# Plan: E20260916599a9b50:S003

**Epic:** `restructure-docs-artifact-markdown-from-flat`
**LLD run:** `wf-1789549723188-h2juk8`
**LLD effective hash:** `196ad617cc5c...`

## Tasks

| # | Task | Size | Depends on | Tests | Derived from |
| :--- | :--- | :--- | :--- | :--- | :--- |
| 1 | **`t1`** Pure planMigration core (enumerate + group + derive-identity + resolve + fail-loud) | M | — | unit: planMigration: epic with DEF/HLD + two stories resolves every member to the same docs/epics/<slug>-E<date><hash8>/ folder, story artifacts under S<nnn>/; unit: planMigration: BUILD/CR without epicSlug takes the slug from a slug-carrying sibling (its `to` matches the sibling's folder); unit: planMigration: anchor is the DEF's createdAt for EVERY member even when a member's own createdAt is a different UTC day (no split); unit: planMigration: standalone item (meta.standalone) resolves under docs/standalone/ with the standalone LLD's createdAt as anchor; unit: planMigration: an artifact already at its nested destination is SKIPPED; a second run yields empty moves[] (idempotent); unit: planMigration: no anchor/slug source, a missing md, or a duplicate-`to` collision → unmappable[] with reason (fail-loud); unit: planMigration: a hand-written non-artifact doc (no companion JSON) is never enumerated; unit: planMigration: both locate paths pinned — slug-named marker-located md AND hash-named markerless BUILD | [[c1]] [[c2]] |
| 2 | **`t2`** Thin applyMigration executor (git mv + link rewrite + post-move validation + chunks) | M | `t1` | integration: applyMigration: git mv relocates each md to its nested path and `git log --follow` still shows the pre-move history; integration: applyMigration: after the run no artifact md remains in the flat dirs; .insrc/artifacts byte-identical; integration: applyMigration: a plan with non-empty unmappable[] is REFUSED (throws, names files) before any git mv; integration: applyMigration: a git-mv failure in one epic chunk rolls that chunk back and leaves no partial mix | [[c3]] [[c4]] |
| 3 | **`t3`** bin/CLI entry (dry-run + apply) | S | `t1`, `t2` | integration: bin dry-run prints moves + unmappable and mutates nothing; --apply aborts non-zero on a non-empty unmappable set | [[c1]] [[c3]] |
| 4 | **`t4`** Unit + integration tests for the migration | M | `t1`, `t2` | integration: applyMigration: a cross-artifact link is rewritten + the post-move validation (listWorkItems/listArtifactMdPaths) passes; an unresolved link throws (naming it) + rolls back the chunk; unit: the migrate-docs-tree.test.ts fixture seeds both a slug-named marker md and a hash-named markerless BUILD + a hand-written non-artifact, exercising the full planMigration matrix | [[c5]] |
| 5 | **`t5`** Run the one-time migration on this repo (dry-run gated) + refresh stale layout docs | M | `t3`, `t4` | smoke: post-relocation: the full `npx tsx --test 'src/workflow/**/*.test.ts' 'src/mcp/**/*.test.ts'` sweep still passes and no artifact md remains under the flat docs dirs | [[c1]] [[c3]] [[c4]] |

### E20260916599a9b50:S003:T001 — Pure planMigration core (enumerate + group + derive-identity + resolve + fail-loud)

Add src/workflow/migrate-docs-tree.ts with the pure `planMigration(repoPath): MigrationPlan` + the MigrationPlan/MigrationMove/LinkRewrite/Unmappable types. Enumerate the authoritative artifact set from .insrc/artifacts/*.json (parse kind+epicHash+storyId from each id via the storage.ts *ArtifactId conventions); LOCATE each artifact's current flat md path by scanning the flat docs md for the insrc:artifact marker (ARTIFACT_ID_MARKER_RE) — slug-named DEF/HLD/LLD/PLAN/SPEC/EXT via marker, markerless BUILD/CR via their hash-named filename. GROUP by work item (epicHash + meta.standalone); per group derive ONE WorkItemIdentity from the anchor createdAt (DEF's, or standalone-LLD's) + a slug sourced from a slug-carrying member; compute each member's `to` via resolveArtifactMdPath. Record unmappable[] (missing anchor/slug/md, duplicate-`to` collision) and SKIP already-nested (idempotent). No disk writes, no git.

**Acceptance checks:**
- planMigration is pure (no fs mutation, no git) and returns { moves, linkRewrites, unmappable }
- Every member of a work item resolves to ONE folder via a single per-group WorkItemIdentity (shared anchor createdAt from the DEF/standalone-LLD + shared slug); story artifacts land under S<nnn>/
- Both LOCATE paths work: a slug-named marker-bearing md is found via its insrc:artifact marker, and a markerless BUILD/CR via its hash-named filename — identity comes only from companion-JSON metadata, the slug is only a label (k5)
- A group with no anchor/slug source, a missing md, or a duplicate destination is recorded in unmappable[] with a reason (fail-loud, ac2); an artifact already at its nested destination is skipped (idempotent)
- A hand-written non-artifact doc (no companion JSON) is never enumerated

### E20260916599a9b50:S003:T002 — Thin applyMigration executor (git mv + link rewrite + post-move validation + chunks)

Add `applyMigration(repoPath, plan): void` to the module: refuse if plan.unmappable is non-empty (fail-loud); require a clean git working tree; per work-item CHUNK, `git mv` each member md to its nested `to` (shell out to git; history preserved) then commit the chunk, rolling the chunk back on any git-mv failure; apply the flat→nested linkRewrites across moved md; run a post-move validation walking the nested tree via sc2 listWorkItems/listArtifactMdPaths and resolving every intra-artifact link, throwing (naming the link) + rolling back BEFORE acceptance if any fails. The .insrc/artifacts JSON store is never touched.

**Acceptance checks:**
- applyMigration refuses (throws, names files) when plan.unmappable is non-empty, before any git mv (ac2)
- Each move is a `git mv` preserving history; per-epic chunk commits; a failed chunk is rolled back leaving no partial mix (ac1/lc1)
- linkRewrites applied; the post-move validation resolves every intra-artifact link via listWorkItems/listArtifactMdPaths and throws (naming the link, rolling back) on any unresolved link (ac3/k4)
- The .insrc/artifacts JSON store is byte-unchanged (only md files move)

### E20260916599a9b50:S003:T003 — bin/CLI entry (dry-run + apply)

Add a bin entry that runs planMigration(repoPath) and prints the moves[]/linkRewrites[]/unmappable[] as a DRY-RUN by default, and applies (calls applyMigration) under an explicit --apply flag. Repo root defaults to cwd/$INSRC_REPO. Thin wrapper — all logic lives in the module.

**Acceptance checks:**
- The bin prints a readable dry-run (moves + unmappable) without mutating anything by default
- --apply invokes applyMigration; a non-empty unmappable set aborts with a non-zero exit and the named files
- tsc clean; the bin is registered the same way as existing bin entries

### E20260916599a9b50:S003:T004 — Unit + integration tests for the migration

Add src/workflow/__tests__/migrate-docs-tree.test.ts: UNIT over a mkdtemp fixture (seed BOTH a slug-named marker-bearing md AND a hash-named markerless BUILD + companion .insrc/artifacts JSON + a hand-written non-artifact) asserting planMigration's grouped `to` via resolveArtifactMdPath, both locate paths, shared-anchor no-split, sibling-sourced slug, idempotent skip, unmappable (missing anchor/slug/md + collision), non-artifact-never-enumerated; INTEGRATION over a `git init` tmp repo committed with the flat tree asserting git-mv history (`git log --follow`), no flat md remains, .insrc/artifacts byte-identical, unmappable-refusal, broken-link-reject + chunk-rollback. Mirror path-scheme.test.ts's mkdtemp/seed style.

**Acceptance checks:**
- Unit tests cover every ac1/ac2 planMigration subject from the LLD test strategy, including a slug-named marker-located md AND a hash-named markerless BUILD (both locate paths pinned)
- Integration tests cover the ac1/ac3 applyMigration subjects (git history, no-flat-remains, byte-identical json, unmappable-refusal, broken-link-reject, chunk-rollback)
- `npx tsx --test 'src/workflow/**/*.test.ts'` passes; tsc clean

### E20260916599a9b50:S003:T005 — Run the one-time migration on this repo (dry-run gated) + refresh stale layout docs

Execute the migration on the insrc repo itself — the only Task that mutates the real repo, so it is DRY-RUN GATED: run the dry-run FIRST, confirm unmappable[] is empty and human-review the move set before --apply; then apply per-epic chunks relocating this repo's ~223 flat artifacts into the nested tree with history (each chunk an individually-revertible commit); run the post-move validation. Refresh the JSDoc/help text still describing the flat layout (artifacts/{plan,hld,lld}.ts headers, runners/tracker help text). Decide keep-or-delete the one-shot module.

**Acceptance checks:**
- The dry-run is run and reviewed with unmappable[]==empty BEFORE any --apply mutation (real mutation, confirm before executing)
- After the run, docs/{defines,designs,plans,builds,specs,reviews} hold no artifact md; every artifact is under docs/{epics|standalone}/<slug>-E<date><hash8>/[S<nnn>/] with git history (ac1/lc1)
- The post-move validation passes (no unresolved intra-artifact link, ac3); the .insrc/artifacts JSON store is unchanged
- Stale flat-layout JSDoc/help text is refreshed to the nested reality; the full workflow+mcp test sweep still passes after the relocation

## Test-strategy coverage

| LLD strategy item | Covered by |
| :--- | :--- |
| planMigration: an epic with DEF/HLD + two stories (LLD/PLAN/BUILD) resolves every member to the SAME docs/epics/<slug>-E<date><hash8>/ folder (shared anchor from the DEF createdAt + shared slug), with story artifacts under S<nnn>/ | `t1`, `t4` |
| planMigration: a BUILD/CR whose companion JSON lacks epicSlug takes the slug from a slug-carrying sibling (its `to` matches the sibling's folder) | `t1`, `t4` |
| planMigration: the anchor is the DEF's createdAt for EVERY member even when a member's own companion createdAt is a different UTC day (no split) | `t1`, `t4` |
| planMigration: a standalone item (meta.standalone) resolves under docs/standalone/ with the standalone LLD's createdAt as the anchor | `t1`, `t4` |
| planMigration: an artifact already at its nested destination is SKIPPED (not a move); a second run yields empty moves[] (idempotent) | `t1`, `t4` |
| planMigration: a group with no anchor source, or no slug source, or a missing md file, is recorded in unmappable[] with its reason (fail-loud, ac2); a duplicate `to` collision is recorded too | `t1`, `t4` |
| planMigration: a hand-written non-artifact doc (no companion JSON) is never enumerated — absent from moves[] AND unmappable[] | `t1`, `t4` |
| applyMigration: git mv relocates each artifact md to its nested path and `git log --follow` still shows the pre-move history (ac1/k4) | `t2`, `t4` |
| applyMigration: after the run, no artifact md remains under the flat docs/{defines,designs,plans,builds,specs,reviews}/ dirs (lc1), and the .insrc/artifacts JSON store is byte-identical (only md moved) | `t2`, `t4` |
| applyMigration: a seeded cross-artifact md link is rewritten via the flat→nested table and the post-move validation (listWorkItems/listArtifactMdPaths) passes; a deliberately-unrewritable link makes applyMigration THROW naming the link, and the chunk is rolled back (ac3) | `t2`, `t4` |
| applyMigration: a plan with a non-empty unmappable[] is REFUSED (throws, names the files) before any git mv (ac2) | `t2`, `t4` |
| applyMigration: a git-mv failure in one epic chunk rolls that chunk back and leaves no partial mix (lc1) | `t2`, `t4` |

## Citations

- **[[c1]]** `prior-artifact` `LLD s3 s1 inventory bundle — the authoritative artifact set is .insrc/artifacts/*.json; ~225 flat md (198 marked, 22 markerless BUILD located by hash filename, 3 non-artifact audits excluded)` — "Authoritative artifact set = the hash-flat .insrc/artifacts/*.json store ... slug-named DEF/HLD/LLD/PLAN/SPEC/EXT via marker, markerless BUILD/CR via their hash-named filename ... a non-artifact ... i"
- **[[c2]]** `prior-artifact` `LLD s3 identity bundle + contract — one WorkItemIdentity per group (anchor = DEF/standalone-LLD createdAt), slug sibling-sourced, identity from metadata not filename (k5)` — "GROUP by work item ... derive ONE WorkItemIdentity from the anchor createdAt (DEF's, or standalone-LLD's) + a slug sourced from a slug-carrying member ... identity comes only from companion-JSON metad"
- **[[c3]]** `prior-artifact` `LLD s3 contractDetails — planMigration/applyMigration consume sc1 deriveWorkItemIdentity + sc2 resolveArtifactMdPath/listWorkItems/listArtifactMdPaths; JSON store untouched` — "Every move's `to` is computed by resolveArtifactMdPath ... the post-move validation walks the new tree via listWorkItems/listArtifactMdPaths ... The .insrc/artifacts JSON store is never touched."
- **[[c4]]** `prior-artifact` `LLD s3 errorPaths/migration — git mv history + per-epic chunk rollback + link-rewrite + post-move validation; fail-loud unmappable` — "git mv each move (history preserved, ac1) ... a post-move validation ... throws if any intra-artifact link fails to resolve (ac3) BEFORE the change is accepted; commits per-epic chunks."
- **[[c5]]** `prior-artifact` `LLD s3 testStrategy — node:test tmp-repo seeding (mirror path-scheme.test.ts); unit planMigration + integration applyMigration over a git-init repo` — "node:test + node:assert/strict via tsx ... a pure planMigration core (testable without touching git) separate from the git-mv/commit executor."

<!-- insrc:review -->

## Review

### ✅ Review `PASS` — plan (plan)

**0 HIGH · 0 MED · 5 LOW** · model `client` · reviewed 2026-09-16T09:51:06.677Z

| Ref | Kind | Severity | Fixability | Premise | Evidence | Action |
| --- | --- | --- | --- | --- | --- | --- |
| t1 | citation | LOW | auto | sc1 deriveWorkItemIdentity (id.ts) + sc2 resolveArtifactMdPath/listWorkItems/listArtifactMdPaths (path-scheme.ts) exist for the migration to consume. | id.ts:202 deriveWorkItemIdentity; path-scheme.ts:118/157/178 resolveArtifactMdPath/listWorkItems/listArtifactMdPaths — sc1+sc2 available. | None — accurate. |
| t1 | citation | LOW | auto | The insrc:artifact marker regex (ARTIFACT_ID_MARKER_RE) + artifactIdMarker + the 8 *ArtifactId helpers + artifactJsonPath + ARTIFACTS_DIR exist in storage.ts — the enumerate/locate surface. | storage.ts: ARTIFACT_ID_MARKER_RE present, 8 *ArtifactId helpers (:148+), artifactJsonPath:251, ARTIFACTS_DIR='.insrc/artifacts':53 — the enumerate/locate surface exists. | None — accurate. |
| t1 | inventory | LOW | auto | The authoritative artifact set is the .insrc/artifacts/*.json store; BUILD companion JSON is hash-named (BUILD-<hash>-<story>.json) and its md is markerless (located by hash filename), while other kinds are located via the insrc:artifact marker. | Direct on-disk verification during grounding: the artifact set is .insrc/artifacts/*.json; BUILD-*.json companions are hash-named and their md are markerless (located by hash filename), other kinds carry the insrc:artifact marker. The plan's enumerate/locate split holds. | None — accurate. |
| t4 | citation | LOW | auto | path-scheme.test.ts exists as the mkdtemp tmp-repo seeding pattern the migration tests mirror. | path-scheme.test.ts uses mkdtempSync (confirmed among the src matches) — the tmp-repo seeding pattern the migration tests mirror exists. | None — accurate. |
| tasks | ordering | LOW | auto | Task dependsOn is acyclic (t1[]; t2←t1; t3←t1,t2; t4←t1,t2; t5←t3,t4) with order 1..5 a valid topological order. | Task dependsOn: t1[], t2[t1], t3[t1,t2], t4[t1,t2], t5[t3,t4] — acyclic; order 1..5 is a valid topological order (no Task precedes a dependency). | None — ordering valid. |
