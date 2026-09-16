<!-- insrc:artifact LLD-599a9b506f22b896-s2 -->

# LLD: E20260916599a9b50:S002

**Epic:** `restructure-docs-artifact-markdown-from-flat`
**HLD base run:** `wf-1789491140629-zj0bd2`
**HLD effective hash:** `196ad617cc5c...`

## HLD context

**Framework:** A single work-item path-scheme module becomes the sole authority on where a work item's artifacts live. It is built on a uniform work-item identity — the existing canonical WorkflowId, fixed so every story-id form (lowercase s1 and uppercase S001) canonicalizes the same way — and maps that identity plus a human slug to a nested, work-item-first tree: docs/epics/<slug>-E<date><hash8>/ for epic-parented work and docs/standalone/<slug>-E<date><hash8>/ for triage-routed features, each holding item-root artifacts (SPEC/DEF/HLD) at its root and per-story S<nnn>/ subfolders (LLD/PLAN/BUILD/CR/EXT). Every per-type path helper delegates to this module and every directory-enumeration / filename-prefix finder is replaced by its listing functions, so the write side and the read side resolve the layout through one definition and can never disagree. The one-time migration reuses the very same resolver to compute each existing file's destination; the hash-flat .insrc/artifacts JSON store is left untouched.
**Rollout phase:** Phase B — path-scheme resolver + consumer cutover
**Owns:** `sc2` (Work-item artifact path scheme)
**Consumes:** `sc1` (Uniform work-item identity)

## Contract details

**Surface level:** internal-shared

### `resolveArtifactMdPath`

```typescript
function resolveArtifactMdPath(repoPath: string, identity: WorkItemIdentity, kind: ArtifactKind, workItemKind: WorkItemKind, slug: string): string
```

**Parameters:**
- `repoPath: string` — repo root the docs/ tree lives under
- `identity: WorkItemIdentity` — the sc1 identity (epicSegment supplies the folder key; story ordinal supplies the S<nnn> subfolder)
- `kind: ArtifactKind` — 'SPEC'|'DEF'|'HLD'|'LLD'|'PLAN'|'BUILD'|'CR'|'EXT' — selects the item-root vs story-subfolder placement and the bare <KIND>.md filename
- `workItemKind: WorkItemKind` — 'epic' | 'standalone' — selects the docs/epics vs docs/standalone top-level
- `slug: string` — the human-readable label; contributes only the folder's slug portion, never identity

**Returns:** `string` — absolute md path: join(repoPath, 'docs', workItemKind==='epic'?'epics':'standalone', `${fileSeg(slug)}-${identity.epicSegment}`, storyScoped ? `S${pad(identity.story)}` : '', `${kind}.md`). SPEC/DEF/HLD sit at the item root (no story segment); LLD/PLAN/BUILD/CR/EXT sit under S<nnn>/.

**Errors:**
- `Error` when kind is story-scoped (LLD/PLAN/BUILD/CR/EXT) but identity.story is undefined (an epic-level identity cannot locate a story artifact)

**Preconditions:**
- identity was produced by sc1's deriveWorkItemIdentity (so epicSegment is well-formed and story is the ordinal or undefined)

**Postconditions:**
- Pure path construction — no filesystem read; the story segment is present iff kind is story-scoped
- The companion JSON path is NOT produced here — the hash-flat .insrc/artifacts store is unchanged (out of scope)
- Filename is the bare <KIND>.md; identity never comes from the filename (lc1)

### `listWorkItems`

```typescript
function listWorkItems(repoPath: string): readonly WorkItemLocation[]
```

**Parameters:**
- `repoPath: string` — repo root

**Returns:** `readonly WorkItemLocation[]` — one entry per work-item folder found under docs/epics/ and docs/standalone/ (kind + root; storySeg omitted at this level) — replaces the readdir-over-DOCS_ARTIFACT_DIRS sweeps

**Postconditions:**
- Bounded walk of docs/epics + docs/standalone (two levels); missing dirs yield an empty list, not a throw
- Order is deterministic (sorted) to match the existing sorted readdir enumerations

### `listArtifactMdPaths`

```typescript
function listArtifactMdPaths(repoPath: string, location: WorkItemLocation): readonly string[]
```

**Parameters:**
- `repoPath: string` — repo root
- `location: WorkItemLocation` — a work-item folder from listWorkItems

**Returns:** `readonly string[]` — every artifact .md path within that work item (item-root SPEC/DEF/HLD + each S<nnn>/ story artifact) — replaces the basename.startsWith('BUILD-')-style prefix scans

**Postconditions:**
- Bounded walk of the one work-item folder; deterministic order

### `lldArtifactPaths`

```typescript
function lldArtifactPaths(repoPath: string, epicHash: string, storyId: string, createdAtISO: string, workItemKind: WorkItemKind, epicSlug?: string): { readonly md: string; readonly json: string }
```

**Parameters:**
- `repoPath: string` — repo root
- `epicHash: string` — epic hash (identity + json id)
- `storyId: string` — story id (either case, via sc1)
- `createdAtISO: string` — NEW — the artifact's meta.createdAt, supplies the E<date> folder segment
- `workItemKind: WorkItemKind` — NEW — 'epic' | 'standalone' for the top-level split
- `epicSlug: string` _(optional)_ — human slug for the folder label; trailing-optional so JSON-only callers keep working

**Returns:** `{ md: string; json: string }` — md now resolved via deriveWorkItemIdentity + resolveArtifactMdPath (nested tree); json unchanged (ARTIFACTS_DIR/<lldArtifactId>.json). Representative of the reshape applied uniformly to all 9 *ArtifactPaths helpers (define/spec/hld/lld/plan/build/codeReview/extend/stub) and the *MdRel builders.

**Errors:**
- `Error` when propagated from resolveArtifactMdPath/deriveWorkItemIdentity on a malformed id

**Preconditions:**
- createdAtISO + workItemKind supplied by the caller from the artifact's meta (meta.createdAt + the standalone flag)

**Postconditions:**
- md side delegates to sc2; json side byte-identical to before (hash-flat store untouched)
- Every one of the 14 non-test *ArtifactPaths caller sites passes the new createdAtISO + workItemKind (tsc enforces completeness)

## Data model changes

### `src/workflow/path-scheme.ts (new module — sc2)` — new

New module owning the layout: ArtifactKind + WorkItemKind + WorkItemLocation types, resolveArtifactMdPath, listWorkItems, listArtifactMdPaths, and the internal STORY_SCOPED set ({LLD,PLAN,BUILD,CR,EXT} story-scoped; {SPEC,DEF,HLD} item-root). Built on sc1 (deriveWorkItemIdentity). Pure construction + bounded directory walks; no companion-JSON reads.

**Call sites:**
- `src/workflow/storage.ts`
- `src/workflow/gates.ts`
- `src/cli/services/workflow.ts`

### `storage.ts *ArtifactPaths helpers (md side) + *MdRel builders` — invariant-change

All 9 *ArtifactPaths helpers gain createdAtISO + workItemKind params and delegate their md side to resolveArtifactMdPath (json side unchanged). The *MdRel builders (defineMdRel/hldMdRel/lldMdRel/planMdRel/buildMdRel/specMdRel), used by tracker/link for issue-body links, delegate to the same resolver so links target the new md paths. The 6 flat DOCS_ARTIFACT_DIRS consts + planFilenamePrefix/buildFilenamePrefix (md-side prefix finders) are retired (atomic cutover, no shim); STUB_DIR + ARTIFACTS_DIR + the hash-flat json ids stay.

**Call sites:**
- `src/workflow/storage.ts`
- `src/workflow/orchestrator.ts`
- `src/workflow/tracker/link.ts`
- `src/workflow/code-review/runner.ts`
- `src/mcp/code-review-step/handler.ts`
- `src/workflow/runners/build/standalone-record.ts`
- `src/workflow/tracker-auto.ts`
- `src/workflow/chain.ts`
- `src/workflow/code-review/gate.ts`
- `src/workflow/artifacts/lld-io.ts`
- `src/workflow/tracker/sync.ts`
- `src/workflow/runners/tracker/context.ts`
- `src/workflow/questions.ts`
- `src/cli/services/workflow.ts`

### `docs-md finders (read side) in gates.ts` — invariant-change

gates.ts readdir loops (:133, :593), the basename.startsWith('BUILD-') match (:650), and the two DOCS_ARTIFACT_DIRS sweeps (:789, :810) are replaced by sc2.listWorkItems/listArtifactMdPaths. gates.ts is the ONLY genuine docs-md finder: cli/services/workflow.ts:122 scans ARTIFACTS_DIR (the hash-flat JSON store — an out-of-scope scanner that stays unchanged), and cli/services/debug.ts:481 lists rotated log segments (unrelated), so neither is re-pointed. daemon/backup.ts:103 (recursive whole-tree walk) is layout-agnostic and keeps working. The JSON-store finders (amendments/store, amendments/staleness, questions.ts:523 over .insrc/artifacts, tracker/resolve.ts:114) are explicitly NOT touched.

**Call sites:**
- `src/workflow/gates.ts`

## Interaction with shared contracts

| Contract | Role | How |
| :--- | :--- | :--- |
| `sc2` | implements | S002 owns sc2 (HLD ownedByStory s2). It realizes the contract as a new path-scheme module (resolveArtifactMdPath + listWorkItems + listArtifactMdPaths) that every *ArtifactPaths writer md-side and every docs-md finder routes through, exactly matching the HLD interfaceSketch (identity-object typed, pure construction). |
| `sc1` | consumes | S002 consumes sc1: resolveArtifactMdPath keys the folder on a WorkItemIdentity produced by deriveWorkItemIdentity(epicHash, meta.createdAt, storyId?), using identity.epicSegment for the top folder and identity.story for the S<nnn> subfolder. s2 transitively dependsOn s1 in the Epic graph. |

## Error paths

### Error cases

- **A story-scoped artifact kind (LLD/PLAN/BUILD/CR/EXT) is resolved with an epic-level identity (identity.story === undefined).** (recoverable)
  - Detection: resolveArtifactMdPath checks STORY_SCOPED.has(kind) && identity.story === undefined before building the path.
  - Response: Throw an Error naming the kind + that a story-scoped artifact needs a story identity; this is caller misuse (an epic-level id can't locate a story artifact), surfaced immediately rather than writing to a malformed path.
  - User impact: None in normal flow (writers always pass the matching identity); a wiring bug is caught loudly at the resolve call, not as a mis-placed file.
- **A consumer is left resolving the retired flat DOCS_ARTIFACT_DIRS after the atomic cutover.** (recoverable)
  - Detection: The flat dir consts + planFilenamePrefix/buildFilenamePrefix are removed, so any remaining reference fails tsc at compile time (no dual-path, per k1).
  - Response: The build fails loud on the stale reference; the site must be re-pointed to sc2 before it compiles — exhaustiveness is compiler-enforced, not discipline.
  - User impact: None at runtime — the gap cannot ship; it is a compile error during the cutover.
- **A JSON-store scanner (amendments/store, staleness, questions:523, tracker/resolve:114) is wrongly re-pointed to sc2's docs listing.** (recoverable)
  - Detection: Those scanners read the hash-flat .insrc/artifacts store; re-pointing them to docs/ would break the amendment/question/resolver test suites (they'd stop finding the hash-named JSON).
  - Response: Scope guard: S002 touches ONLY the md/docs side; the JSON-store scanners are left byte-unchanged. The existing suites act as the tripwire.
  - User impact: None when scoped correctly; the tests catch a mis-scoped edit before merge.

### Edge cases

| Input | Expected |
| :--- | :--- |
| An epic with multiple stories (S001, S002, ...) | One work-item root folder with SPEC/DEF/HLD at the root (singletons) and one S<nnn>/ subfolder per story, each holding its own LLD/PLAN/BUILD/CR — no collision, since the story segment disambiguates. |
| Two different work items whose human slug is identical | The `-E<date><hash8>` suffix on the folder name disambiguates them into distinct folders; the slug alone never determines the folder (lc1). |
| A triage-routed standalone work item (workItemKind 'standalone') | Artifacts land under docs/standalone/<slug>-E<date><hash8>/... while epic-parented ones land under docs/epics/... — the two kinds are distinguishable at the top level (ac3), same internal S<nnn> grouping. |
| listWorkItems when docs/epics or docs/standalone does not exist yet (fresh repo) | Returns an empty list (the missing dir is treated as no work items), never throws — matching today's tolerant readdir-guarded enumerations. |
| A *ArtifactPaths helper called with epicSlug omitted (JSON-only / legacy caller) | The folder label falls back to fileSeg(epicHash) exactly as the flat helpers did with fileSeg(epicSlug ?? epicHash); the md path still resolves (hash-labeled folder) and the json path is unchanged. |

### Invariants to preserve

- The { json } side of every *ArtifactPaths helper stays ARTIFACTS_DIR/<hash artifactId>.json — the hash-flat .insrc/artifacts machine store is the epic non-goal and is byte-unchanged. [[c2]]
- The JSON-store scanners (amendments/store.ts, amendments/staleness.ts, questions.ts:523 over .insrc/artifacts, tracker/resolve.ts:114) are NOT re-pointed to sc2 — they scan the hash-flat store and must keep working unchanged. [[c2]]
- The cutover is atomic (k1): the six flat DOCS_ARTIFACT_DIRS consts + the md-side *FilenamePrefix finders are removed outright, not dual-supported behind a shim/flag; every consumer moves to sc2 in the same change. [[c1]]
- An artifact's folder identity is derived only from sc1's deriveWorkItemIdentity (epicSegment + story ordinal), never inferred from its filename; the filename supplies only the slug label (lc1/k5). [[c5]]
- daemon/backup.ts's recursive whole-tree walk is layout-agnostic and stays unchanged — it continues to back up whatever docs/ paths exist, now the nested ones. [[c3]]

## Test strategy

**Test framework:** `node:test + node:assert/strict (run via `npx tsx --test`), the convention every existing src/workflow/__tests__/*.test.ts uses.`

### Test levels

- **unit** — Prove the sc2 resolver builds the correct nested md path for every ArtifactKind and both WorkItemKinds, and that its placement rules (item-root vs S<nnn>/) and error path hold — the pure-construction core of ac1/ac3.
  - Subjects: `resolveArtifactMdPath: SPEC/DEF/HLD land at the work-item root (docs/epics/<slug>-E<date><hash8>/<KIND>.md, no story segment)`, `resolveArtifactMdPath: LLD/PLAN/BUILD/CR/EXT land under S<nnn>/ (docs/epics/<slug>-E<date><hash8>/S001/<KIND>.md)`, `resolveArtifactMdPath: workItemKind 'standalone' routes to docs/standalone/... while 'epic' routes to docs/epics/... (top-level distinguishable, same internal S<nnn> grouping)`, `resolveArtifactMdPath: bare <KIND>.md filename; folder key = fileSeg(slug) + '-' + identity.epicSegment; identity (not filename) supplies the key`, `resolveArtifactMdPath: throws when a story-scoped kind is given an epic-level identity (identity.story === undefined)`, `path-scheme STORY_SCOPED set membership = {LLD,PLAN,BUILD,CR,EXT}; item-root = {SPEC,DEF,HLD}`
  - Fixtures: `a WorkItemIdentity from deriveWorkItemIdentity (epic-level + story-level), reusing the real sc1 export — no hand-built identities`
- **unit** — Prove listWorkItems + listArtifactMdPaths enumerate a seeded nested tree correctly and tolerate absent dirs — the read-side of ac2 that replaces the flat readdir/prefix finders.
  - Subjects: `listWorkItems over a seeded docs/epics + docs/standalone tree returns one entry per work-item folder, deterministic sorted order, kind-tagged`, `listWorkItems returns an empty list (no throw) when docs/epics or docs/standalone is absent (fresh repo)`, `listArtifactMdPaths returns every artifact md within one work item (item-root SPEC/DEF/HLD + each S<nnn>/ artifact)`
  - Fixtures: `a tmp repo dir with a hand-seeded nested docs tree (epic with 2 stories + one standalone item), created via the *ArtifactPaths helpers so the seeding itself exercises the writer side`
- **unit** — Prove each *ArtifactPaths helper's md side now delegates to the nested resolver (with the new createdAtISO + workItemKind params) while its json side stays byte-identical to the hash-flat store — the md/json boundary invariant, and that the *MdRel builders track the same paths (links stay correct).
  - Subjects: `lldArtifactPaths (representative) + spec/def/hld/plan/build/codeReview/extend/stub helpers: .md is the nested resolver path; .json is unchanged ARTIFACTS_DIR/<hashId>.json`, `epicSlug omitted → folder label falls back to fileSeg(epicHash), md still resolves, json unchanged`, `*MdRel builders (defineMdRel/hldMdRel/lldMdRel/planMdRel/buildMdRel/specMdRel) produce the nested relative md path matching the absolute helper`
  - Fixtures: `known epicHash + createdAtISO + storyId so both the E<date> segment and the hash json id are assertable`
- **integration** — Prove no consumer still expects the old flat layout after the atomic cutover — the existing gate/tracker/code-review suites exercise the *ArtifactPaths + docs-md finders end-to-end and must pass against the nested tree (ac2). Also confirms the JSON-store scanners were left untouched (their suites still pass).
  - Subjects: `gates.ts approval-by-md-path + artifact listing (the retired-DOCS_ARTIFACT_DIRS sweeps now via listWorkItems/listArtifactMdPaths): existing plan-gate.test.ts / gates.test.ts seeding through the helpers resolves against the nested tree`, `the BUILD-prefix finder (gates.ts:650) replaced by kind-typed listing still locates the BUILD artifact`, `amendments / questions / tracker-resolve JSON-store suites still pass unchanged (proves the hash-flat store + its scanners were not re-pointed)`
  - Fixtures: `the existing on-disk-seed pattern from plan-gate.test.ts (writes artifacts via the helpers, then drives the gate) — extended for the createdAtISO + workItemKind params`

### Acceptance mapping

| Criterion | Proving tests |
| :--- | :--- |
| `ac1` | `resolveArtifactMdPath: SPEC/DEF/HLD at work-item root`, `resolveArtifactMdPath: LLD/PLAN/BUILD/CR/EXT under S<nnn>/`, `resolveArtifactMdPath: bare <KIND>.md, folder key = fileSeg(slug)+'-'+epicSegment, identity supplies the key`, `lldArtifactPaths (representative) + others: .md is the nested resolver path; .json unchanged` |
| `ac2` | `listWorkItems over a seeded tree returns one entry per work-item folder`, `listArtifactMdPaths returns every artifact md within one work item`, `gates.ts approval + listing resolves against the nested tree via the existing gate suites`, `amendments/questions/tracker-resolve JSON-store suites still pass unchanged (no consumer left on flat dirs; JSON store untouched)` |
| `ac3` | `resolveArtifactMdPath: workItemKind 'standalone' → docs/standalone/... vs 'epic' → docs/epics/..., same internal S<nnn> grouping`, `listWorkItems tags each work-item folder with its kind (epic vs standalone) across both top-levels` |

## Migration

**State before:** The md-path authority is flat and split across two schemes (s1 storage.ts bundle): the 9 *ArtifactPaths helpers build md = join(repoPath, <TYPE>_DIR, `<TYPE>-${fileSeg(epicSlug ?? epicHash)}[-${storyId}].md`) into six flat per-type folders (DEFINES_DIR/DESIGNS_DIR/PLANS_DIR/BUILDS_DIR/SPECS_DIR/REVIEWS_DIR) + STUB_DIR, keyed inconsistently by slug-or-hash; the *MdRel builders repeat those same flat relative paths for issue-body links; the docs-md finders enumerate the flat dirs (s1 gates.ts bundle: readdirSync :133/:593, basename.startsWith('BUILD-') :650, the two DOCS_ARTIFACT_DIRS sweeps :789/:810) plus cli/services/workflow.ts:122 + debug.ts:481. The { json } side already points at the hash-flat .insrc/artifacts store and the JSON-store scanners (amendments/store, staleness, questions.ts:523, tracker/resolve.ts:114) key off it (s1 md-vs-JSON boundary bundle). sc1 (deriveWorkItemIdentity) already shipped in id.ts (s1 sc1 bundle) but nothing consumes it yet for path resolution.

**State after:** A single central resolver (new src/workflow/path-scheme.ts — sc2) is the md-path authority: resolveArtifactMdPath places SPEC/DEF/HLD at a work-item root folder `docs/{epics|standalone}/<slug>-E<date><hash8>/` and LLD/PLAN/BUILD/CR/EXT under its `S<nnn>/` subfolder, keyed via sc1's identity with the slug as label only; listWorkItems/listArtifactMdPaths enumerate that nested tree. All 9 *ArtifactPaths helpers (md side) + the *MdRel builders delegate to the resolver (gaining createdAtISO + workItemKind params); the docs-md finders call listWorkItems/listArtifactMdPaths. The six flat DOCS_ARTIFACT_DIRS consts + plan/buildFilenamePrefix are removed. The { json } side and every JSON-store scanner are byte-unchanged (the hash-flat .insrc/artifacts store is untouched). NOTE: relocating the artifacts already written under the flat layout is S003's one-time migration — S002 changes only the code path new artifacts resolve through.

**Zero downtime:** yes — **Data rewrite:** no

### Steps

1. Add the new central resolver module src/workflow/path-scheme.ts (ArtifactKind/WorkItemKind/WorkItemLocation types, STORY_SCOPED set, resolveArtifactMdPath, listWorkItems, listArtifactMdPaths) built on sc1. Purely additive — nothing consumes it yet, so the tree still compiles and behaves as before. — ↩ rollbackable
2. Widen each of the 9 *ArtifactPaths helper signatures to take createdAtISO + workItemKind and switch their md side to delegate to resolveArtifactMdPath; switch the *MdRel builders to the same resolver. This changes an internal-shared signature, so tsc will now flag every caller — that compile error set is the exhaustiveness checklist for the next step. — ↩ rollbackable
3. Update all 14 non-test *ArtifactPaths caller sites (orchestrator finalize writers, tracker/link, code-review/runner+gate, mcp/code-review-step/handler, runners/build/standalone-record, tracker-auto, chain, gates, artifacts/lld-io, tracker/sync, runners/tracker/context, questions, cli/services/workflow) to pass createdAtISO (from the artifact's meta.createdAt) + workItemKind (epic vs standalone, from the workflow/triage context). Driven to completion by the step-2 compile errors. — ↩ rollbackable
4. Replace the docs-md finders with the resolver's listing API: gates.ts readdir loops (:133/:593), the BUILD- prefix match (:650), and the two DOCS_ARTIFACT_DIRS sweeps (:789/:810) call listWorkItems/listArtifactMdPaths. gates.ts is the only docs-md finder; cli/services/workflow.ts:122 (scans ARTIFACTS_DIR, the JSON store) and debug.ts:481 (log-segment lister) are NOT re-pointed. Leave daemon/backup.ts:103 (layout-agnostic whole-tree walk) and every JSON-store scanner (amendments/store+staleness, questions.ts:523, tracker/resolve.ts:114) untouched. — ↩ rollbackable
5. Remove the now-unreferenced flat layout: delete the six DOCS_ARTIFACT_DIRS consts and plan/buildFilenamePrefix (the md-side prefix finders). Atomic cutover (k1) — any lingering reference is a compile error, so this deletion proves no consumer is left on the flat scheme; keep STUB_DIR + ARTIFACTS_DIR + the hash json ids. — ↩ rollbackable
6. Add sc2 unit tests (resolveArtifactMdPath per kind + epic/standalone, story-scoped-with-epic-identity throw, listWorkItems/listArtifactMdPaths over a seeded tree, empty-dir tolerance) and run the full workflow+mcp sweep so the existing gate/tracker/code-review suites confirm no consumer expects the flat dirs and the JSON-store suites confirm that side is unchanged. — ↩ rollbackable

**Backward compat:** The *ArtifactPaths helpers + *MdRel builders are an internal-shared surface (used only within this repo; no IDE/IPC contract touches docs md paths). Their signatures change additively (new createdAtISO + workItemKind params, epicSlug stays trailing-optional), and every in-repo caller is updated in the same atomic change (k1, no shim/flag) — tsc enforces that no caller is left on the old shape. The { json } side of every helper and the ARTIFACTS_DIR hash ids are byte-unchanged, so the machine store, its scanners, and the .insrc/artifacts consumers keep working with zero change. The one compatibility gap is intentional and out of scope for S002: artifacts already on disk under the flat layout are not readable through the new resolver until S003's one-time migration relocates them — called out here as the explicit hand-off, not silently left.

## Alternatives considered

### a1: Identity-object resolver; thread createdAt + kind through the helpers — **CHOSEN**

sc2 takes a pre-derived WorkItemIdentity + workItemKind + slug (the HLD sketch shape); each *ArtifactPaths helper gains a createdAtISO + workItemKind arg, derives the identity via sc1, and delegates.

A new module (e.g. src/workflow/path-scheme.ts) owns the layout: resolveArtifactMdPath(repoPath, identity: WorkItemIdentity, kind: ArtifactKind, workItemKind: 'epic'|'standalone', slug) builds docs/<epics|standalone>/<slug>-<epicSegment>/[S<nnn>/]<KIND>.md, plus listWorkItems + listArtifactMdPaths that walk that tree. Each existing *ArtifactPaths helper keeps returning { md, json } but its md side now calls deriveWorkItemIdentity(epicHash, createdAtISO, storyId?) then resolveArtifactMdPath; to do so the helper signatures gain a createdAtISO parameter and a workItemKind (derived by the caller from the artifact's standalone flag). The json side is unchanged. The gates/cli docs-md finders switch to listWorkItems/listArtifactMdPaths. tracker/link's *MdRel builders delegate to the same resolver.

The identity object is the currency: sc1 mints it, sc2 consumes it, and S003's migration reuses resolveArtifactMdPath with an identity derived from each file's companion JSON meta — so writer and migration compute identical destinations.

### a2: Raw-params resolver (sc2 derives the identity internally)

sc2.resolveArtifactMdPath(repoPath, epicHash, createdAtISO, storyId?, kind, workItemKind, slug) derives the WorkItemIdentity itself; helpers pass raw params through.

Same nested-tree layout and same listWorkItems/listArtifactMdPaths, but resolveArtifactMdPath takes the raw (epicHash, createdAtISO, storyId?) instead of a pre-built WorkItemIdentity and calls deriveWorkItemIdentity internally. The *ArtifactPaths helpers still gain createdAtISO + workItemKind and forward them, but never construct an identity object themselves.

Callers deal only in the primitives they already hold; the identity object stays an internal detail of the resolver.

**Rejected because:** Functionally equivalent on all three ACs and cost L, but partial on sc2 because it does not honour the contract's WorkItemIdentity-typed sketch, and it does not actually reduce the createdAt/kind threading a1 requires — a divergence with no offsetting saving.

### a3: Keep helper signatures unchanged; resolve createdAt + kind from companion JSON meta

Leave the *ArtifactPaths (repoPath, epicHash, storyId?, epicSlug?) signatures as-is; sc2 reads the companion .insrc/artifacts JSON meta to get createdAt + kind when building the md path.

resolveArtifactMdPath looks up the artifact's companion JSON (by hash id under ARTIFACTS_DIR) to read meta.createdAt + the standalone flag, deriving the identity from that, so no *ArtifactPaths signature changes and the 14 callers are untouched except where they enumerate.

The read side (finders) still moves to listWorkItems/listArtifactMdPaths.

**Rejected because:** Avoids signature churn but at real cost: partial on ac1 (write-order fragility), sc2 and sc1 (disk-lookup resolution breaks pure construction and the clean sc1 composition). The signature churn a1 accepts is mechanical and tsc-checked; a3 trades it for a correctness/perf hazard.

## Citations

- **[[c1]]** `step-output` `s1 LldContext analyzeBundles — storage.ts + gates.ts docs-md finders (atomic cutover surface)` — "The six flat DOCS_ARTIFACT_DIRS + plan/buildFilenamePrefix md-side finders; gates.ts readdir :133/:593, startsWith('BUILD-') :650, DOCS_ARTIFACT_DIRS sweeps :789/:810."
- **[[c2]]** `analyze-bundle` `s1 CRITICAL boundary bundle — md side (docs/, in scope) vs JSON side (.insrc/artifacts hash-flat, out of scope) + JSON-store scanners left alone` — "Only the { md } side moves; the { json } side keys off ARTIFACTS_DIR by hash id and is untouched; amendments/store+staleness, questions.ts:523, tracker/resolve.ts:114 scan the JSON store and must be L"
- **[[c3]]** `code` `src/daemon/backup.ts:103 — recursive whole-tree walk, layout-agnostic` — "daemon/backup.ts:103 is a recursive whole-tree walk — keeps working, just backs up the new nested paths."
- **[[c4]]** `step-output` `s5 error.paths — story-scoped-kind-with-epic-identity throw + stale-flat-dir compile failure + mis-scoped JSON-store scanner` — "resolveArtifactMdPath checks STORY_SCOPED.has(kind) && identity.story === undefined before building the path."
- **[[c5]]** `code` `src/workflow/id.ts (sc1) — deriveWorkItemIdentity/storyIdToOrdinal shipped in S001 (commit 91dee7f); identity from metadata, not filename (lc1/k5)` — "deriveWorkItemIdentity(epicHash, createdAtISO, storyId?): WorkItemIdentity ({canonical, slug, epicSegment, story?}); storyIdToOrdinal accepts s<n> and S<n>."
- **[[c6]]** `step-output` `s3 judge — winnerId a1, the only alternative satisfying ac1/ac2/ac3 + sc1/sc2` — "a1 is the only alternative satisfying every acceptance criterion and both shared contracts; a2 partial on sc2, a3 partial on ac1/sc1/sc2."

<!-- insrc:review -->

## Review

### ⛔ Review `BLOCK` — design.story (design.story)

**0 HIGH · 1 MED · 10 LOW** · model `client` · reviewed 2026-09-16T05:19:27.557Z

| Ref | Kind | Severity | Fixability | Premise | Evidence | Action |
| --- | --- | --- | --- | --- | --- | --- |
| cl7 | citation | MED | assisted | The cli/daemon docs-md finder sites cited exist: cli/services/workflow.ts (~:122), cli/services/debug.ts (~:481), and daemon/backup.ts (~:103) recursive whole-tree walk. | The LLD's 'docs-md finders (read side) in gates.ts + cli' entry (and migration step 4) lists cli/services/workflow.ts:122 and cli/services/debug.ts:481 as docs-md finders to replace with sc2.listWorkItems/listArtifactMdPaths. Direct verification refutes both: workflow.ts has exactly ONE readdirSync (:122) and it scans join(repoPath, ARTIFACTS_DIR) — the hash-flat .insrc/artifacts JSON store (listEpics over DEF_RE), which the LLD's OWN c2 invariant says must stay byte-unchanged; debug.ts has exactly ONE readdirSync (:481) and it lists rotated *.log segment files, unrelated to artifacts entirely. Only gates.ts is a genuine docs-md finder. Following the LLD literally would re-point an out-of-scope JSON-store scanner (a correctness regression contradicting its own invariant) and touch an unrelated log lister. | Scope the read-side (listWorkItems/listArtifactMdPaths) cutover to gates.ts ONLY. Drop cli/services/workflow.ts:122 and cli/services/debug.ts:481 from the docs-md finder set; confirm workflow.ts:122 (listEpics over ARTIFACTS_DIR) stays in the untouched JSON-store scanner set, and remove debug.ts entirely from this story's read-side scope. (workflow.ts remains a legitimate WRITE-side *ArtifactPaths caller per cl8 — that classification is unaffected.) |
| cl1 | inventory | LOW | auto | storage.ts defines exactly 9 *ArtifactPaths helpers (stub/define/spec/hld/lld/plan/build/codeReview/extend), each returning { md, json }. | grep over src/ (excl. tests) finds exactly 9 helper definitions in storage.ts:201-345 — stub/define/spec/hld/lld/plan/build/codeReview/extend — matching the LLD's inventory of 9 *ArtifactPaths. | None — inventory is accurate. |
| cl2 | inventory | LOW | auto | storage.ts declares the six flat per-type docs dirs (DEFINES_DIR/DESIGNS_DIR/PLANS_DIR/BUILDS_DIR/SPECS_DIR/REVIEWS_DIR) plus STUB_DIR and ARTIFACTS_DIR, and a DOCS_ARTIFACT_DIRS list. | storage.ts:50-69 declares ARTIFACTS_DIR, the six flat docs dirs (DEFINES/DESIGNS/PLANS/BUILDS/REVIEWS/SPECS_DIR), STUB_DIR, and DOCS_ARTIFACT_DIRS = [DEFINES,DESIGNS,PLANS,BUILDS,SPECS,REVIEWS] — exactly as the LLD states. | None — accurate. |
| cl3 | inventory | LOW | auto | storage.ts defines the *MdRel builders (defineMdRel/hldMdRel/lldMdRel/planMdRel/buildMdRel/specMdRel) and plan/buildFilenamePrefix used by md-side finders. | storage.ts:365-370 defines the six *MdRel builders (define/hld/lld/plan/build/spec); planFilenamePrefix:292 + buildFilenamePrefix:317 confirmed. (amendmentFilenamePrefix:389 + lldFilenamePrefix:394 also exist but serve the JSON store, correctly excluded from the md-side retirement.) | None — accurate. |
| cl4 | citation | LOW | auto | gates.ts contains the docs-md finders cited: readdirSync scans (~:133 and ~:593), a basename.startsWith('BUILD-') match (~:650), and two DOCS_ARTIFACT_DIRS sweeps (~:789/:810). | gates.ts confirmed verbatim: readdirSync at :133 and :593, basename(jsonPath).startsWith('BUILD-') at :650, [...DOCS_ARTIFACT_DIRS, STUB_DIR] sweep at :789, DOCS_ARTIFACT_DIRS sweep at :810. Every cited line resolves exactly. | None — citations exact. |
| cl5 | citation | LOW | auto | The JSON-store scanners that must NOT be re-pointed exist: amendments/store.ts + amendments/staleness.ts (amendmentFilenamePrefix over the .insrc/artifacts amendments root), questions.ts (~:523 lldFilenamePrefix over ARTIFACTS_DIR), tracker/resolve.ts (~:114 reads the .insrc/artifacts JSON dir). | JSON-store scanners confirmed: amendmentFilenamePrefix used at amendments/store.ts:66/197; questions.ts:523 iterates readdirSync(artifactsDir); tracker/resolve.ts:114 returns readdirSync(dir) over the .insrc/artifacts dir. All are the out-of-scope hash-flat scanners the LLD says to leave untouched. | None — accurate; correctly excluded. |
| cl6 | citation | LOW | auto | sc1 shipped in id.ts: deriveWorkItemIdentity(epicHash, createdAtISO, storyId?) is exported and storyIdToOrdinal accepts both s<n> and S<n> (regex /^[sS](\\d+)$/). | id.ts:202 exports deriveWorkItemIdentity; storyIdToOrdinal:119 uses /^[sS](\\d+)$/ (read confirmed in id.ts). sc1 is available as consumed. | None — accurate. |
| cl8 | inventory | LOW | auto | There are 14 non-test modules calling the *ArtifactPaths helpers (the write-side caller inventory to re-point): orchestrator, tracker/link, code-review/runner, code-review/gate, mcp/code-review-step/handler, runners/build/standalone-record, tracker-auto, chain, gates, artifacts/lld-io, tracker/sync, runners/tracker/context, questions, cli/services/workflow. | grep for *ArtifactPaths( callers in src/ (excl. tests + storage.ts) returns exactly 14 distinct modules, matching the LLD's list one-for-one (orchestrator, tracker/link, code-review/runner, code-review/gate, mcp/code-review-step/handler, runners/build/standalone-record, tracker-auto, chain, gates, artifacts/lld-io, tracker/sync, runners/tracker/context, questions, cli/services/workflow). | None — count and members exact. |
| cl9 | semantic | LOW | auto | The { json } side of the *ArtifactPaths helpers keys off ARTIFACTS_DIR by hash artifactId (join(repoPath, ARTIFACTS_DIR, `${...ArtifactId(...)}.json`)) — the hash-flat store that stays untouched. | storage.ts helpers build the json side as join(repoPath, ARTIFACTS_DIR, `${...ArtifactId(...)}.json`) keyed by hash id; ARTIFACTS_DIR='.insrc/artifacts' (:50). The md/json split the LLD preserves is real. | None — accurate. |
| cl10 | citation | LOW | auto | fileSeg is a real helper in storage.ts used to sanitize the slug/hash into the folder/filename segment. | storage.ts:152 defines function fileSeg(s: string): string — the sanitizer the LLD's returns-clause references for the folder/filename segment. | None — accurate. |
| cl11 | closed-union | LOW | auto | The story-scoped artifact kinds are exactly {LLD,PLAN,BUILD,CR,EXT} and the item-root kinds exactly {SPEC,DEF,HLD}; together these 8 are the complete ArtifactKind set the storage helpers cover. | The 9 helpers map to the 8 ArtifactKinds {SPEC,DEF,HLD,LLD,PLAN,BUILD,CR,EXT} (define/spec/hld/lld/plan/build/codeReview/extend) plus stub; the story-scoped {LLD,PLAN,BUILD,CR,EXT} vs item-root {SPEC,DEF,HLD} partition is consistent with the per-story vs per-epic filename shapes in storage.ts (storyId param present on lld/plan/build/codeReview/extend, absent on define/hld/spec). | None — the closed-union partition is consistent with the helper signatures. |

#### Proposed fixes

- **cl7** (assisted) — The two cli sites are misclassified: :122 is a JSON-store scanner (out of scope, must stay unchanged) and :481 is a log-segment lister (unrelated). Restrict the read-side finder cutover to gates.ts so the build does not touch the hash-flat store or an unrelated log path.
  - edit: `gates.ts readdir loops (:133, :593), the basename.startsWith('BUILD-') match (:650), and the two DOCS_ARTIFACT_DIRS sweeps (:789, :810) are replaced by sc2.listWorkItems/listArtifactMdPaths; cli/services/workflow.ts:122 + cli/services/debug.ts:481 docs listings likewise.` → `gates.ts readdir loops (:133, :593), the basename.startsWith('BUILD-') match (:650), and the two DOCS_ARTIFACT_DIRS sweeps (:789, :810) are replaced by sc2.listWorkItems/listArtifactMdPaths. gates.ts is the ONLY genuine docs-md finder: cli/services/workflow.ts:122 scans ARTIFACTS_DIR (the hash-flat JSON store — an out-of-scope scanner that stays unchanged), and cli/services/debug.ts:481 lists rotated log segments (unrelated), so neither is re-pointed.`
  - edit: `Replace the docs-md finders with the resolver's listing API: gates.ts readdir loops (:133/:593), the BUILD- prefix match (:650), and the two DOCS_ARTIFACT_DIRS sweeps (:789/:810) call listWorkItems/listArtifactMdPaths; cli/services/workflow.ts:122 + debug.ts:481 likewise.` → `Replace the docs-md finders with the resolver's listing API: gates.ts readdir loops (:133/:593), the BUILD- prefix match (:650), and the two DOCS_ARTIFACT_DIRS sweeps (:789/:810) call listWorkItems/listArtifactMdPaths. gates.ts is the only docs-md finder; cli/services/workflow.ts:122 (scans ARTIFACTS_DIR, the JSON store) and debug.ts:481 (log-segment lister) are NOT re-pointed.`
