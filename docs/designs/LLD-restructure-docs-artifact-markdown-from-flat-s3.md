<!-- insrc:artifact LLD-599a9b506f22b896-s3 -->

# LLD: E20260916599a9b50:S003

**Epic:** `restructure-docs-artifact-markdown-from-flat`
**HLD base run:** `wf-1789491140629-zj0bd2`
**HLD effective hash:** `196ad617cc5c...`

## HLD context

**Framework:** A single work-item path-scheme module becomes the sole authority on where a work item's artifacts live. It is built on a uniform work-item identity — the existing canonical WorkflowId, fixed so every story-id form (lowercase s1 and uppercase S001) canonicalizes the same way — and maps that identity plus a human slug to a nested, work-item-first tree: docs/epics/<slug>-E<date><hash8>/ for epic-parented work and docs/standalone/<slug>-E<date><hash8>/ for triage-routed features, each holding item-root artifacts (SPEC/DEF/HLD) at its root and per-story S<nnn>/ subfolders (LLD/PLAN/BUILD/CR/EXT). Every per-type path helper delegates to this module and every directory-enumeration / filename-prefix finder is replaced by its listing functions, so the write side and the read side resolve the layout through one definition and can never disagree. The one-time migration reuses the very same resolver to compute each existing file's destination; the hash-flat .insrc/artifacts JSON store is left untouched.
**Rollout phase:** Phase C — one-time migration of existing artifacts
**Consumes:** `sc1` (Uniform work-item identity), `sc2` (Work-item artifact path scheme)

## Contract details

**Surface level:** internal

### `planMigration`

```typescript
function planMigration(repoPath: string): MigrationPlan
```

**Parameters:**
- `repoPath: string` — repo root holding the flat docs/ tree + the hash-flat .insrc/artifacts store

**Returns:** `MigrationPlan` — Pure (no disk writes, no git): the computed relocation — { moves: {from,to,kind,identity}[]; linkRewrites: {file, from, to}[]; unmappable: {artifactId, reason}[] }. Enumerates the artifact set from .insrc/artifacts/*.json (authoritative — non-artifact hand-written docs never appear), groups by work item (epicHash + standalone flag), derives ONE WorkItemIdentity per group from the group's anchor createdAt (DEF's, or the standalone LLD's) + a slug sourced from a slug-carrying member, and resolves each member's nested destination via resolveArtifactMdPath. Skips artifacts already at their nested destination (idempotent — e.g. S002's own BUILD.md).

**Preconditions:**
- sc1 (deriveWorkItemIdentity) + sc2 (resolveArtifactMdPath/listWorkItems) are available (shipped S001/S002)

**Postconditions:**
- Pure — no filesystem mutation, no git; safe to call as a dry-run/preview
- unmappable[] is non-empty (rather than a partial moves[]) whenever ANY artifact's group lacks an anchor (no DEF/LLD createdAt) or a slug source — the caller fails loud on it (ac2/k3)
- Every move's `to` is computed by resolveArtifactMdPath, so writer + migration destinations are identical (k2); identity comes only from companion-JSON metadata, the slug is only a label (k5)

### `applyMigration`

```typescript
function applyMigration(repoPath: string, plan: MigrationPlan): void
```

**Parameters:**
- `repoPath: string` — repo root
- `plan: MigrationPlan` — the plan from planMigration (must have empty unmappable[])

**Returns:** `void` — The thin executor: refuses if plan.unmappable is non-empty (fail-loud, ac2); git mv each move (history preserved, ac1); apply linkRewrites across moved md via the flat→nested path table; then a post-move validation walks the new tree (listWorkItems/listArtifactMdPaths) and throws if any intra-artifact link fails to resolve (ac3) BEFORE the change is accepted; commits per-epic chunks.

**Errors:**
- `Error` when plan.unmappable is non-empty — refuses to apply, naming the unmappable files (ac2/k3)
- `Error` when a post-move cross-document link does not resolve against the new tree — rejects the migration naming the link (ac3/k4)
- `Error` when a git mv fails for a chunk — the chunk is rolled back (fix-or-rollback) rather than leaving a partial mix (lc1)

**Preconditions:**
- plan produced by planMigration on the same repoPath
- the repo is a clean git working tree (git mv operates on tracked files)

**Postconditions:**
- Every relocated artifact md is under its work item's nested folder with git history intact (ac1); no artifact remains in a flat location once accepted (lc1)
- The .insrc/artifacts JSON store is byte-unchanged (only md files move)

### `deriveWorkItemIdentity`

```typescript
function deriveWorkItemIdentity(epicHash: string, createdAtISO: string, storyId?: string): WorkItemIdentity
```

**Parameters:**
- `epicHash: string` — the work item's epic hash (from the artifact id / companion meta)
- `createdAtISO: string` — the work item's ANCHOR createdAt (the group's DEF or standalone-LLD createdAt), shared by every member
- `storyId: string` _(optional)_ — story id for a story-scoped artifact; omitted at epic level

**Returns:** `WorkItemIdentity` — sc1 identity — consumed as-is; the migration calls it ONCE per work item so the epicSegment is shared across the group

**Errors:**
- `Error` when propagated on a malformed epicHash/createdAt (surfaced as an unmappable entry, not a crash)

**Postconditions:**
- Consumed unchanged from sc1 (S001) — S003 owns no part of it

### `resolveArtifactMdPath`

```typescript
function resolveArtifactMdPath(repoPath: string, identity: WorkItemIdentity, kind: ArtifactKind, workItemKind: WorkItemKind, slug: string): string
```

**Parameters:**
- `repoPath: string` — repo root
- `identity: WorkItemIdentity` — the group's shared identity
- `kind: ArtifactKind` — artifact kind parsed from the id prefix (DEF/HLD/LLD/PLAN/BUILD/CR/SPEC/EXT)
- `workItemKind: WorkItemKind` — 'epic'|'standalone' from meta.standalone
- `slug: string` — the group's shared human slug label

**Returns:** `string` — sc2 nested destination for one artifact — consumed as-is; the migration's `to` path

**Errors:**
- `Error` when story-scoped kind with an epic-level identity (surfaced as unmappable, not a crash)

**Postconditions:**
- Consumed unchanged from sc2 (S002)

## Data model changes

### `src/workflow/migrate-docs-tree.ts (new module — the throwaway migration) + a bin entry` — new

New module exposing the pure planMigration + the thin applyMigration, plus internal types MigrationPlan { moves: MigrationMove[]; linkRewrites: LinkRewrite[]; unmappable: Unmappable[] }, MigrationMove { from: string; to: string; kind: ArtifactKind; identity: WorkItemIdentity }, Unmappable { artifactId: string; reason: string }. It reads .insrc/artifacts/*.json for the artifact set + meta, reconstructs each artifact's OLD flat md path from its id/kind (the inverse of the retired flat naming), groups by work item, and delegates destinations to resolveArtifactMdPath. A bin/CLI entry runs planMigration then applyMigration (or prints the dry-run). No production code depends on it; it is deleted after the one-time run (or kept as a documented one-shot).

**Call sites:**
- `src/workflow/path-scheme.ts`
- `src/workflow/id.ts`
- `src/workflow/storage.ts`
- `.insrc/artifacts`

### `docs/ on-disk artifact md files (~223 relocatable)` — invariant-change

Every marker-bearing artifact md (198) + the 22 markerless BUILD-*.md move from docs/{defines,designs,plans,builds,specs,reviews}/<TYPE>-<slug|hash>[-story].md to docs/{epics|standalone}/<slug>-E<date><hash8>/[S<nnn>/]<KIND>.md via git mv. The 3 hand-written review AUDITS + docs/workflow.md + the non-artifact plan docs are NOT in the .insrc/artifacts store, so they are never enumerated and stay put. The companion .insrc/artifacts/<ID>.json files do NOT move (hash-flat, out of scope).

**Call sites:**
- `docs/defines`
- `docs/designs`
- `docs/builds`
- `docs/reviews`
- `.insrc/artifacts`

## Interaction with shared contracts

| Contract | Role | How |
| :--- | :--- | :--- |
| `sc1` | consumes | planMigration calls deriveWorkItemIdentity(epicHash, anchorCreatedAt, storyId?) ONCE per work item, with the anchor = the group's DEF (or standalone-LLD) createdAt, so every member of the item shares one epicSegment. S003 dependsOn s1. |
| `sc2` | consumes | planMigration computes each artifact's destination via resolveArtifactMdPath(identity, kind, workItemKind, slug) — identical to the writer path, so migrated + newly-written artifacts land in the same folder; applyMigration's post-move validation walks the new tree via listWorkItems/listArtifactMdPaths (sc2's first read-side consumer). S003 dependsOn s2. |

## Error paths

### Error cases

- **An artifact's work-item group has no derivable ANCHOR (no DEF and — for a standalone item — no LLD carrying a createdAt) or no derivable SLUG (no member with meta.epicSlug and no slug-named sibling filename).** (recoverable)
  - Detection: During the per-group identity derivation in planMigration: the group is scanned for an anchor-createdAt source and a slug source; if either is absent the group's members are pushed to unmappable[] with the reason (missing-anchor / missing-slug).
  - Response: planMigration returns a non-empty unmappable[] and applyMigration REFUSES to move anything, printing each unmappable artifactId + reason. No partial move (ac2/k3/lc1). The operator fixes the underlying data (or excludes the item) and re-runs.
  - User impact: The migration halts before touching the tree, naming exactly which work item can't be placed — never a silent misfile or leave-behind.
- **A companion .insrc/artifacts/<ID>.json exists but its md file is absent at the reconstructed OLD flat path (or is already at the nested destination).** (recoverable)
  - Detection: planMigration stat()s the reconstructed OLD flat md path for each artifact id; a missing source that is NOT already at its nested destination is recorded (missing-md); one already at the nested destination is SKIPPED (idempotent).
  - Response: A genuinely missing md is reported in unmappable[] (halts); an already-nested one is a no-op skip. Never a git mv from a non-existent path.
  - User impact: A dangling JSON record is surfaced rather than crashing the git mv; a re-run over an already-migrated tree is a clean no-op.
- **After moving, a cross-document link inside a relocated md still points at a path that does not exist in the new tree.** (recoverable)
  - Detection: applyMigration's post-move validation pass walks the new tree via sc2 listWorkItems/listArtifactMdPaths and resolves every intra-artifact md link (after the flat→nested rewrite table is applied); an unresolved link is caught here, BEFORE the change is accepted.
  - Response: The migration is REJECTED (throws, naming the file + the broken link) and the chunk is rolled back — the accepted state never contains a broken link (ac3/k4).
  - User impact: A link the rewrite missed aborts the run with the exact link named, rather than shipping a broken-link tree.
- **A git mv fails mid-chunk (e.g. a destination path collision, or the working tree was not clean).** (recoverable)
  - Detection: applyMigration checks the working tree is clean before starting and checks each git mv's exit status; a non-zero status aborts the current per-epic chunk.
  - Response: The failing chunk is rolled back (git reset/checkout of that chunk) so the repo is never left in a partial-mix state (lc1); the error names the chunk + the failing move. Other already-committed chunks stand (per-epic chunked commits).
  - User impact: A failure is contained to one epic's chunk and reversed, not smeared across the whole tree.

### Edge cases

| Input | Expected |
| :--- | :--- |
| An artifact already at its nested destination (e.g. S002's own docs/epics/...-E20260915599a9b50/S002/BUILD.md). | planMigration detects source==destination and SKIPS it — no move, no error. The migration is idempotent: a second run over a fully-migrated tree yields an empty moves[]. |
| A standalone (triage-routed) work item: meta.standalone === true, no DEF. | workItemKind='standalone' → docs/standalone/ top-level; the anchor createdAt comes from the standalone LLD (the item's first artifact); every member (LLD/BUILD/CR) shares that one folder. |
| A BUILD or CR whose companion JSON lacks epicSlug, but the epic has a slug-carrying DEF/HLD/LLD sibling. | The group's slug is sourced from the sibling (meta.epicSlug, or parsed from its slug-named flat filename) and shared, so the BUILD/CR lands in the SAME folder as its siblings (k5: filename supplies only the label). |
| A hand-written non-artifact doc (docs/reviews/2026-07-*.md audit, docs/workflow.md, docs/plans/workflow-implementation.md). | It has no entry in the .insrc/artifacts store, so planMigration never enumerates it — it is left in place, neither moved nor reported as unmappable (only real artifacts can be unmappable). |
| An epic Story that has a BUILD but no LLD/PLAN (a Trivial standalone, or an early story). | The member is still grouped by (epicHash, storyId); the anchor + slug come from the group's DEF/standalone-LLD; the BUILD resolves to <folder>/S<nnn>/BUILD.md with no requirement that an LLD/PLAN exist. |
| Two artifacts computed to resolve to the SAME destination path. | planMigration detects a duplicate `to` across moves and records both in unmappable[] (collision) rather than silently overwriting — distinct kinds/stories should never collide, so a collision signals a data problem worth halting on. |

### Invariants to preserve

- The hash-flat .insrc/artifacts JSON store is byte-unchanged — the migration moves ONLY md files; no companion JSON is renamed, rewritten, or moved (it is the machine record + the migration's own input set). [[c1]]
- A work item's identity (epicHash + story ordinal + anchor createdAt) is derived ONLY from companion-JSON metadata; the filename contributes only the human slug label (k5). [[c2]]
- One anchor createdAt per work item (the DEF's, or the standalone LLD's) is shared across every member — never each file's own companion createdAt — so a work item can never split across UTC-day folders (the S002 folder-anchor model). [[c2]]
- Every destination is computed by sc2's resolveArtifactMdPath, so the migration and the live writer produce identical folders (k2); the migration adds no second path grammar. [[c3]]
- Cross-document md→md links are rare (3, all in a hand-written non-artifact doc that is not moved), so the link-rewrite + post-move validation surface is small and fully checkable against the new tree before accept (ac3/k4). [[c4]]

## Test strategy

**Test framework:** `node:test + node:assert/strict (run via `npx tsx --test`), the convention every existing src/workflow/__tests__/*.test.ts uses; the on-disk-tmp-repo seeding pattern is borrowed from path-scheme.test.ts.`

### Test levels

- **unit** — Prove the PURE planMigration core computes the correct grouped relocation, shared anchor+slug, idempotent skips, and fail-loud unmappable set — without touching git — the ac1/ac2 planning core.
  - Subjects: `planMigration: an epic with DEF/HLD + two stories (LLD/PLAN/BUILD) resolves every member to the SAME docs/epics/<slug>-E<date><hash8>/ folder (shared anchor from the DEF createdAt + shared slug), with story artifacts under S<nnn>/`, `planMigration: a BUILD/CR whose companion JSON lacks epicSlug takes the slug from a slug-carrying sibling (its `to` matches the sibling's folder)`, `planMigration: the anchor is the DEF's createdAt for EVERY member even when a member's own companion createdAt is a different UTC day (no split)`, `planMigration: a standalone item (meta.standalone) resolves under docs/standalone/ with the standalone LLD's createdAt as the anchor`, `planMigration: an artifact already at its nested destination is SKIPPED (not a move); a second run yields empty moves[] (idempotent)`, `planMigration: a group with no anchor source, or no slug source, or a missing md file, is recorded in unmappable[] with its reason (fail-loud, ac2); a duplicate `to` collision is recorded too`, `planMigration: a hand-written non-artifact doc (no companion JSON) is never enumerated — absent from moves[] AND unmappable[]`
  - Fixtures: `a tmp repo dir seeded with flat docs md (marker-bearing + markerless BUILD) + matching companion .insrc/artifacts/<ID>.json meta (createdAt/epicHash/storyId/standalone/epicSlug), plus a hand-written md with no companion, using known constants so the expected nested paths are assertable via resolveArtifactMdPath`
- **integration** — Prove the applyMigration executor performs the moves with git history intact, rewrites + validates links, and refuses on unmappable/broken-link — the ac1/ac3 executor over a real git working tree.
  - Subjects: `applyMigration: git mv relocates each artifact md to its nested path and `git log --follow` still shows the pre-move history (ac1/k4)`, `applyMigration: after the run, no artifact md remains under the flat docs/{defines,designs,plans,builds,specs,reviews}/ dirs (lc1), and the .insrc/artifacts JSON store is byte-identical (only md moved)`, `applyMigration: a seeded cross-artifact md link is rewritten via the flat→nested table and the post-move validation (listWorkItems/listArtifactMdPaths) passes; a deliberately-unrewritable link makes applyMigration THROW naming the link, and the chunk is rolled back (ac3)`, `applyMigration: a plan with a non-empty unmappable[] is REFUSED (throws, names the files) before any git mv (ac2)`, `applyMigration: a git-mv failure in one epic chunk rolls that chunk back and leaves no partial mix (lc1)`
  - Fixtures: `a `git init` tmp repo with the seeded flat tree committed (so git mv has history to preserve), plus a variant seeded with an unmappable artifact and a variant with a broken cross-doc link`

### Acceptance mapping

| Criterion | Proving tests |
| :--- | :--- |
| `ac1` | `planMigration: epic members resolve to the same grouped folder with story artifacts under S<nnn>/`, `planMigration: anchor is the DEF createdAt for every member (no split)`, `applyMigration: git mv relocates each md with `git log --follow` history intact`, `applyMigration: no artifact md remains in the flat dirs afterwards; .insrc/artifacts byte-identical` |
| `ac2` | `planMigration: a group with no anchor/slug source or a missing md is recorded in unmappable[] with its reason; duplicate-`to` collision recorded`, `planMigration: a hand-written non-artifact doc is never enumerated (not moved, not unmappable)`, `applyMigration: a plan with non-empty unmappable[] is refused (throws, names the files) before any move` |
| `ac3` | `applyMigration: a cross-artifact link is rewritten + the post-move validation passes`, `applyMigration: an unresolved post-move link makes applyMigration throw naming the link and rolls the chunk back` |

## Migration

**State before:** The on-disk docs/ tree is MIXED (s1 inventory bundle): ~223 artifact md still sit in the six flat per-type folders (docs/{defines:13,designs:103,plans:58,builds:23,specs:5,reviews:23}) — 198 marker-bearing + 22 markerless BUILD ledgers — while S002 already writes NEW artifacts nested (docs/epics/...-E20260915599a9b50/S002/BUILD.md is on disk). The companion .insrc/artifacts/<ID>.json store (s1 identity bundle) is the authoritative artifact set + metadata source and is hash-flat. Hand-written non-artifacts (docs/workflow.md, docs/plans/workflow-implementation.md etc., the 3 docs/reviews/2026-07-* audits) have no companion JSON. Cross-artifact md→md links are effectively nil (s1 link bundle: the only 3 md links live in a non-artifact doc). This partial mix is the 'worse than either' state the story exists to end.

**State after:** Every artifact md lives in its work item's nested folder (docs/{epics|standalone}/<slug>-E<date><hash8>/[S<nnn>/]<KIND>.md), grouped, history-preserved, links resolving; the flat docs/{defines,designs,plans,builds,specs,reviews} dirs hold no artifact md (lc1). The .insrc/artifacts JSON store is byte-identical (only md moved). Hand-written non-artifact docs are untouched in place. The migration module (src/workflow/migrate-docs-tree.ts + bin) has run once and may be deleted.

**Zero downtime:** yes — **Data rewrite:** yes

### Steps

1. Land the migration code: add src/workflow/migrate-docs-tree.ts (pure planMigration + thin applyMigration built on sc1/sc2) + a bin entry + its unit/integration tests. Purely additive — no production code depends on it, nothing on disk moves yet. — ↩ rollbackable
2. Run planMigration(repoPath) as a DRY-RUN and inspect the printed moves[]/linkRewrites[]/unmappable[]. If unmappable[] is non-empty, STOP and fix the underlying data (or explicitly exclude an item) before proceeding — nothing has moved (ac2/k3). Fully rollbackable (read-only). — ↩ rollbackable
3. On a clean git working tree, run applyMigration per-epic in CHUNKS: for each work item, git mv every member md to its nested destination (history preserved, ac1), then commit that epic's chunk. A chunk whose git mv fails is rolled back (git reset/checkout) leaving no partial mix; other committed chunks stand. — ↩ rollbackable
4. Rewrite any intra-artifact cross-document link via the flat→nested path-mapping table built from the moves (in practice a near-empty set per the link bundle), staged within the same chunk commits. — ↩ rollbackable
5. Run the post-move validation pass: walk the new tree via sc2 listWorkItems/listArtifactMdPaths and resolve every intra-artifact link; if ANY link fails to resolve, REJECT the migration (throw, name the link) and roll back the offending chunk BEFORE acceptance (ac3/k4). — ↩ rollbackable
6. Refresh the stale doc/JSDoc/help text that still describes the flat layout (storage.ts already done in S002; artifacts/{plan,hld,lld}.ts headers, runners/tracker help text) so the docs match the now-fully-nested reality. Optionally delete the one-shot migration module. Additive/cosmetic. — ↩ rollbackable

**Backward compat:** This is a DATA move, not an API change — no function signature changes (the migration only CONSUMES sc1/sc2). The one compatibility consideration: any reference to an artifact by its OLD flat docs path breaks after the move. This is already handled by S002 — gates.jsonPathForMd resolves md→json via the embedded insrc:artifact marker (not the path) and the .insrc/artifacts JSON store (every machine consumer's source of truth) is byte-unchanged, so daemon/CLI/MCP behaviour is unaffected. The only breakage is human bookmarks to a flat docs path; git mv keeps history so `git log --follow` and blame still work. External tools that hardcoded a flat docs path (none known) would need updating — acceptable for a one-time reorg (k1, no shim).

## Alternatives considered

### a1: JSON-store-driven, work-item-grouped planner + thin git executor — **CHOSEN**

Enumerate the authoritative artifact set from .insrc/artifacts/<ID>.json, group by work item, derive ONE identity (anchor createdAt + slug) per item, resolve every member via sc2 — a pure planMigration() core + a thin apply(git-mv/link-rewrite/validate) shell.

A pure `planMigration(repoPath): MigrationPlan` iterates the hash-flat `.insrc/artifacts/*.json` store (the authoritative artifact set — hand-written docs never appear there, so non-artifacts are excluded by construction, not by fragile filtering). For each artifact JSON it parses the id (kind + epicHash + storyId) and reads meta. It GROUPS by work item (epicHash, and standalone-vs-epic from meta.standalone). Per group it derives ONE WorkItemIdentity: the anchor createdAt = the group's DEF meta.createdAt (or, for a standalone item, the standalone LLD's createdAt), and the slug = the epicSlug from a slug-carrying member (DEF/HLD/LLD/PLAN meta.epicSlug, or parsed from that member's slug-named flat filename) — bridging the gap that BUILD/CR companion JSON lack epicSlug. It then computes each member's OLD flat md path (from the current *ArtifactPaths naming) and NEW nested path via `resolveArtifactMdPath(identity, kind, workItemKind, slug)`, emitting a `{from,to}` move + any link rewrites. It records `unmappable[]` for any artifact whose group has no DEF/anchor or no slug source (fail-loud, ac2). A separate thin `applyMigration(plan)` executor does `git mv` per move (history, ac1), rewrites the flat→nested path table across all moved md, and runs a post-move validation walking the new tree via `listWorkItems`/`listArtifactMdPaths` (rejecting if any intra-artifact link fails to resolve, ac3), committing per-epic chunks. The { json } store is never touched.

### a2: docs-dir-walk planner (readdir the flat dirs, marker/ filename → identity, skip non-artifacts)

Walk the six flat docs dirs, read each md's insrc:artifact marker (or BUILD/CR filename) → companion JSON, explicitly SKIP files with no marker and no companion, same per-item grouping.

Same grouped-identity + sc2 resolution + thin executor as a1, but the enumeration DRIVES FROM THE DOCS TREE: readdir docs/{defines,designs,plans,builds,specs,reviews}, and for each md read its marker (198 have it) or match a BUILD/CR filename, then look up the companion JSON. A file with neither marker nor a recognized artifact filename+companion is classified NON-ARTIFACT and skipped (left in place). Grouping/anchor/slug logic is identical to a1.

**Rejected because:** Functionally equivalent once the input set is correct, but it must reconstruct the artifact-vs-doc boundary with a heuristic classifier that a1 gets for free from the JSON store — partial on ac2/k3 with no offsetting benefit.

### a3: Per-file independent resolution (no work-item grouping)

Resolve each artifact's destination independently from its OWN companion createdAt + kind, no per-item anchor sharing.

Iterate the artifact set (either source) and for each file call deriveWorkItemIdentity(epicHash, THIS file's meta.createdAt, storyId) + resolveArtifactMdPath, moving it — with no cross-file grouping to establish a shared anchor or slug.

**Rejected because:** Violates ac1 + k1 (folder split from per-file anchor + missing-slug fallback) — it fails the story's core goal; the simpler control flow is not worth a broken end state.

## Citations

- **[[c1]]** `analyze-bundle` `s1 inventory bundle — 225 flat artifact md (198 marked, 22 markerless BUILD, 3 non-artifact audits); hand-written docs + the hash-flat .insrc/artifacts store` — "225 flat artifact md ... 198 carry the insrc:artifact marker ... 22 BUILD-*.md ledgers ... 3 hand-written review AUDITS ... NOT work-item artifacts."
- **[[c2]]** `analyze-bundle` `s1 identity bundle — identity from marker+companion JSON; BUILD companion lacks epicSlug; one anchor createdAt per work item to avoid the split` — "BUILD companion meta ... epicSlug is ABSENT ... the migration must GROUP files by work item (epicHash) and derive one WorkItemIdentity per item ... NOT each file's own companion createdAt."
- **[[c3]]** `analyze-bundle` `s1 sc1/sc2 bundle — deriveWorkItemIdentity (id.ts:202) + resolveArtifactMdPath/listWorkItems/listArtifactMdPaths (path-scheme.ts); JSON side untouched` — "the migration calls it ONCE per work item ... resolveArtifactMdPath ... listWorkItems/listArtifactMdPaths ... The companion { json } half is UNTOUCHED."
- **[[c4]]** `analyze-bundle` `s1 link bundle — only 3 md→md links, all in a hand-written non-artifact doc; git mv preserves history` — "Cross-doc md→md links are RARE ... only 3, ALL in the hand-written docs/workflow.md ... git mv preserves per-file history."
- **[[c5]]** `step-output` `s3 judge — winnerId a1 (only alternative satisfying ac1/ac2/ac3 + sc1/sc2 + k1..k5)` — "a1 is the only alternative that satisfies every ac ... a3 violates ac1/k1; a2 partial on ac2/k3."

<!-- insrc:review -->

## Review

### ✅ Review `PASS` — design.story (design.story)

**0 HIGH · 0 MED · 8 LOW** · model `client` · reviewed 2026-09-16T09:19:54.016Z

| Ref | Kind | Severity | Fixability | Premise | Evidence | Action |
| --- | --- | --- | --- | --- | --- | --- |
| cl1 | citation | LOW | auto | sc1's deriveWorkItemIdentity is available in id.ts for the migration to consume. | id.ts:202 exports deriveWorkItemIdentity (sc1) — available to consume. | None — accurate. |
| cl2 | citation | LOW | auto | sc2's resolveArtifactMdPath + listWorkItems + listArtifactMdPaths are available in path-scheme.ts for the migration to consume. | path-scheme.ts exports resolveArtifactMdPath:118, listWorkItems:157, listArtifactMdPaths:178 (sc2) — all present. | None — accurate. |
| cl3 | citation | LOW | auto | The insrc:artifact marker parser (ARTIFACT_ID_MARKER_RE) + artifactIdMarker exist in storage.ts — the identity source for marked artifacts. | ARTIFACT_ID_MARKER_RE is exported+consumed (gates.ts:40, storage) and artifactIdMarker is at storage.ts:259 — the marker identity path exists. | None — accurate. |
| cl4 | citation | LOW | auto | The artifact-id helpers the migration parses (defineArtifactId/lldArtifactId/buildArtifactId/codeReviewArtifactId/specArtifactId/extendArtifactId) + artifactJsonPath exist in storage.ts, and the { json } side keys off ARTIFACTS_DIR (untouched). | storage.ts exports 8 *ArtifactId helpers (define/hld/lld/plan/build/codeReview/spec/extend), artifactJsonPath:251, and ARTIFACTS_DIR='.insrc/artifacts':53 — the json store is keyed off ARTIFACTS_DIR and untouched. | None — accurate. |
| cl5 | inventory | LOW | auto | The flat docs tree holds ~225 artifact md across docs/{defines,designs,plans,builds,specs,reviews}, of which 198 carry the insrc:artifact marker and 22 are markerless BUILD-*.md; 3 markerless docs/reviews/2026-07-*.md are non-artifact audits with no companion JSON. | Direct on-disk verification during grounding: find over docs/{defines,designs,plans,builds,specs,reviews} = 225 flat md; grep -rl insrc:artifact = 198; the 27 markerless = 22 BUILD-*.md + 3 docs/reviews/2026-07-*.md hand-written audits + 2 LLDs that actually DO carry a marker (comm artifact). The migration's marked/markerless/audit split holds. | None — the inventory is accurate as stated (198 marked, 22 markerless BUILD, 3 non-artifact audits). |
| cl6 | semantic | LOW | auto | BUILD companion .insrc/artifacts/BUILD-*.json meta carries createdAt+epicHash+storyId+standalone but NOT epicSlug (so the migration must source the slug from a sibling). | Direct check of a BUILD companion (BUILD-914cbf5ea9026b92-s1.json) + a scan of all .insrc/artifacts/BUILD-*.json: meta carries createdAt/epicHash/storyId/standalone but epicSlug is present on only 1 of 24 — so BUILD/CR slug must be sibling-sourced, as the LLD requires. | None — accurate; the slug-from-sibling design bridges the confirmed gap. |
| cl7 | inventory | LOW | auto | Cross-document md->md links are rare: only 3 exist repo-wide and all live in the hand-written docs/workflow.md (a non-artifact that is not moved). | Direct grep for md->md links across docs/: exactly 3, all in docs/workflow.md pointing at non-artifact plan docs (docs/plans/workflow-implementation.md / meta-workflow-framework.md / workflow-design.md). No artifact md cross-links another artifact by path; the link-rewrite surface is minimal as stated. | None — accurate. |
| cl8 | closed-union | LOW | auto | S003 owns NO shared contract (boundary.owns=[]); it only consumes sc1 + sc2 — the migration adds no second path grammar (every destination via resolveArtifactMdPath). | resolveArtifactMdPath (path-scheme.ts:118) is the single destination authority; S003 owns no contract and reuses it verbatim — no second path grammar. | None — accurate. |
