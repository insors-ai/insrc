<!-- insrc:artifact HLD-599a9b506f22b896 -->

# HLD: A single work-item path-scheme module becomes the sole authority on where a work item's artifacts live

## Framework summary

A single work-item path-scheme module becomes the sole authority on where a work item's artifacts live. It is built on a uniform work-item identity — the existing canonical WorkflowId, fixed so every story-id form (lowercase s1 and uppercase S001) canonicalizes the same way — and maps that identity plus a human slug to a nested, work-item-first tree: docs/epics/<slug>-E<date><hash8>/ for epic-parented work and docs/standalone/<slug>-E<date><hash8>/ for triage-routed features, each holding item-root artifacts (SPEC/DEF/HLD) at its root and per-story S<nnn>/ subfolders (LLD/PLAN/BUILD/CR/EXT). Every per-type path helper delegates to this module and every directory-enumeration / filename-prefix finder is replaced by its listing functions, so the write side and the read side resolve the layout through one definition and can never disagree. The one-time migration reuses the very same resolver to compute each existing file's destination; the hash-flat .insrc/artifacts JSON store is left untouched.

## Architecture shape

Two layered shared contracts sit on the Epic's dependency spine. sc1 (uniform work-item identity) is foundational and owned by S001: it makes canonicalization total over story-id forms and stays both-way, so an identity can be produced from a work item and parsed back. sc2 (the path-scheme resolver) is owned by S002 and built ON sc1: given an identity + slug it produces the md path for any artifact kind and, in the reverse direction, enumerates work-item folders and a work item's artifacts — replacing today's readdir-over-DOCS_ARTIFACT_DIRS scans and startsWith('BUILD-')-style prefix finders. The per-type *ArtifactPaths helpers become thin delegates to sc2 (the JSON side of their return value is unchanged, since the hash-flat store is out of scope), and the ~20 finder/enumeration sites call sc2's listing functions. S003 owns no contract: it is the one-time migration that CONSUMES sc1 (to derive each file's identity from its insrc:artifact marker + companion JSON meta — never its filename) and sc2 (to compute the destination), performing git-mv relocation with history preserved, failing loud on any file that does not confidently map, and rewriting + then validating cross-document links against the new tree. The whole change lands as one atomic cutover — helpers, finders, and the migration all move to the new layout together, with no dual-path and no flag.

## Shared contracts

### sc1: Uniform work-item identity

**Owner Story:** `s1`
**Consumed by:** `s2`, `s3`

**Purpose:** One canonical, both-way identity for every work item and story — epic-parented or standalone — so identity can serve as the folder key and lookup key the whole layout hangs on. Closes the gap where an uppercase-form story id fails to canonicalize and falls back to a bare id.

**Interface sketch (type-level):**

```
// Total, both-way work-item identity built on the canonical WorkflowId.
// storyId accepts BOTH 's1' and 'S001'; ordinalToStoryId <-> storyIdToOrdinal round-trips.
interface WorkItemIdentity {
  readonly canonical: string;    // E<YYYYMMDD><hash8>:S<nnn>[:T<nnn>]
  readonly slug:      string;    // E<YYYYMMDD><hash8>-S<nnn>[-T<nnn>]
  readonly epicSegment: string;  // E<YYYYMMDD><hash8>
  readonly story?:    number;    // 1-based ordinal (s1 and S001 both -> 1); absent at epic level
}

// Type-level declarations only (no bodies):
declare function storyIdToOrdinal(storyId: string): number;               // accepts s\d+ AND S\d+
declare function ordinalToStoryId(ordinal: number): string;               // canonical S<nnn>
declare function deriveWorkItemIdentity(
  epicHash: string, createdAtISO: string, storyId?: string,
): WorkItemIdentity;
```

**Assumptions cited:** [[c2]]

### sc2: Work-item artifact path scheme

**Owner Story:** `s2`
**Consumed by:** `s3`

**Purpose:** The single authority mapping a work item's identity + human slug to its place in the nested tree, and enumerating the tree. Every artifact writer and every finder routes through it, so the write side and read side share one layout definition; the filename supplies only the human label, never identity.

**Interface sketch (type-level):**

```
type ArtifactKind = 'SPEC' | 'DEF' | 'HLD' | 'LLD' | 'PLAN' | 'BUILD' | 'CR' | 'EXT';
type WorkItemKind = 'epic' | 'standalone';

interface WorkItemLocation {
  readonly kind:     WorkItemKind;
  readonly root:     string;      // docs/<epics|standalone>/<slug>-E<date><hash8>/
  readonly storySeg?: string;     // 'S<nnn>' when the artifact is story-scoped; absent for SPEC/DEF/HLD at the item root
}

// Type-level declarations only (no bodies):
// md path for one artifact; the companion JSON path is unchanged (hash-flat store, out of scope).
declare function resolveArtifactMdPath(
  repoPath: string, identity: WorkItemIdentity, kind: ArtifactKind, workItemKind: WorkItemKind, slug: string,
): string;
// reverse: enumerate every work-item folder, and every artifact md within one — replaces readdir+prefix scans
declare function listWorkItems(repoPath: string): readonly WorkItemLocation[];
declare function listArtifactMdPaths(repoPath: string, location: WorkItemLocation): readonly string[];
```

**Assumptions cited:** [[c3]] [[c6]]

## Story boundaries

### Story E20260915599a9b50:S001

**Owns:** `sc1`

The concrete minter change is private to S001: how storyIdToOrdinal's story-id pattern is widened to accept both the lowercase (s1) and uppercase (S001) forms, how the ordinal round-trip and the existing epic/task segment builders are kept byte-identical for already-canonicalizing inputs, and the regression tests that pin no-change for lowercase inputs. None of that internal shape is consumed by other Stories — they see only the sc1 identity contract.

### Story E20260915599a9b50:S002

**Owns:** `sc2`
**Depends on:** `sc1`

Private to S002: the exact nested tree grammar (docs/epics vs docs/standalone top-level split, the item-root vs S<nnn>/ subfolder placement per artifact kind, and the bare LLD.md/PLAN.md/BUILD.md/CR.md naming inside a story folder), the rewrite of each per-type *ArtifactPaths helper into a delegate over sc2, and the replacement of every readdir-over-DOCS_ARTIFACT_DIRS enumeration and startsWith('BUILD-')/planFilenamePrefix-style finder with sc2's listing functions. Consumers see only the sc2 resolver surface, not which call sites were re-pointed.

### Story E20260915599a9b50:S003

**Depends on:** `sc1`, `sc2`

Private to S003: the one-time migration script itself — how it reads each file's identity from the insrc:artifact marker + companion .insrc/artifacts JSON meta, its two-direction git-mv relocation, the fail-loud stop-and-report on any file that does not confidently map, the cross-document link rewrite via the move's path-mapping table plus the post-move validation pass, and the per-epic chunked-commit execution (fix-or-rollback the chunk on failure) within the single atomic PR. It produces no contract others consume; it is a throwaway tool that leans on sc1 and sc2.

## Non-functional targets

- **Performance:** The resolver is pure path construction plus, for listing, a bounded walk of the nested tree — no measurable regression versus today's per-type readdir scans over a repo with ~200 artifacts.
- **Security:** No new surface: the artifact store is filesystem-local and the change adds no external input or network path; identity is read from files the daemon already owns.
- **Observability:** The migration fails loud — every unmappable file is reported by path + reason (k3), and the first cross-document link that does not resolve against the new tree aborts the run with that link named (k4).
- **Durability:** git mv preserves each artifact's version history (k4); the hash-flat .insrc/artifacts JSON store — the canonical machine record — is untouched, so no machine-readable state is at risk in the move.

## Rollout

### Phase A — foundational identity contract

**Stories:** `s1`

S001 makes canonicalization total over story-id forms (sc1). It owns no dependency and every other Story leans on it, so it lands first — the folder key the resolver needs does not exist reliably until this is done.

**Backward compat:** The story-id widening must be strictly additive: already-canonicalizing lowercase (s1) ids must produce byte-identical output, and the ordinal round-trip must be preserved.

### Phase B — path-scheme resolver + consumer cutover

**Stories:** `s2`

S002 builds the sc2 resolver on sc1 and re-points every *ArtifactPaths writer and every readdir/prefix finder to it. It must follow Phase A (it consumes sc1) and precede the migration (which consumes sc2).

**Backward compat:** No production compat window: until Phase C relocates the existing files, new-layout finders would not see the old flat files, so B and C are committed together in the single atomic PR and main never observes new-layout code against an old-layout tree. Within the PR, no consumer may keep resolving the old flat DOCS_ARTIFACT_DIRS.

### Phase C — one-time migration of existing artifacts

**Stories:** `s3`

S003 relocates the ~200 existing artifacts using sc1 (identity from marker + companion JSON) and sc2 (destination). It depends on both contracts, so it lands last, executed as per-epic chunked commits within the same atomic PR.

**Backward compat:** The atomic PR merges B+C together so the repo's main branch flips from fully-old to fully-new in one merge; git mv preserves each file's history and the hash-flat JSON store is untouched.

**Ordering rationale:** Phases follow the Epic dependency spine and shared-contract ownership: sc1 (owned by S001) has no dependency and is consumed by S002 and S003, so Phase A is first; sc2 (owned by S002) is built on sc1 and consumed by S003, so Phase B is second; S003 consumes both sc1 and sc2, so Phase C is last. This mirrors dependsOn s1 <- s2 <- s3 exactly. All three phases are committed inside the one atomic PR (k1) — the phase order is the intra-PR commit order (per-epic chunks), not a sequence of separate deploys.

### Risky bits

| Area | Why | Mitigation |
| :--- | :--- | :--- |
| Consumer-breadth completeness of the cutover (Phase B) | The layout boundary is read by ~20 finder/enumeration + prefix-scan sites in addition to the ~10 path-helper consumers; missing even one leaves a writer or finder resolving the old flat dirs, which under the atomic no-shim cutover means silently lost or misplaced artifacts. | Route every writer and finder through sc2, then prove exhaustiveness: grep for any remaining direct DOCS_ARTIFACT_DIRS / readdir-over-docs / startsWith('BUILD-'\|'CR-'\|'PLAN-') usage and drive it to zero, and lean on the full test suite which exercises approval/tracker/code-review paths that would fail if a consumer still expected flat dirs. |
| Identity minter regression (Phase A) | Widening storyIdToOrdinal to accept the uppercase form could accidentally change output for existing lowercase ids or break the ordinalToStoryId round-trip, which would silently re-key every already-canonicalizing work item. | Make the widening additive (accept s\d+ AND S\d+, normalize to the same ordinal) and pin it with a no-change regression test for lowercase inputs (ac2) plus a both-way round-trip test (lc1); tsc + the id.ts test suite gate the change. |
| Migration correctness on legacy / unmarked files (Phase C) | ~26 of the ~217 on-disk md files carry no insrc:artifact marker (older dated review audits), and the E<date> folder segment needs createdAt which only the companion JSON meta holds — a mis-read there would misfile a file or break a link. | Fail loud (k3) surfaces each unmappable file by path+reason for hand-mapping rather than guessing; the migration reads createdAt strictly from the companion JSON meta (never the filename), and the post-move link-validation pass (k4) rejects a chunk if any rewritten cross-doc link fails to resolve, so a bad move cannot be committed. |

## Alternatives considered

### a1: Centralized work-item path-scheme module — **CHOSEN**

One module owns the canonical-id + slug -> nested-tree mapping; every *ArtifactPaths writer and every finder routes through it.

Introduce a single path-scheme module that is the sole authority on the new layout. It exposes two directions built on the existing canonical WorkflowId: given a work item's identity (epic segment + story ordinal) and its human slug, produce the folder + file path for any artifact type; and given the tree, enumerate a work item's artifacts or list all work items. Every existing per-type *ArtifactPaths helper becomes a thin wrapper that delegates to this module, and every directory-enumeration / filename-prefix finder (the readdirSync-over-DOCS_ARTIFACT_DIRS scans and startsWith('BUILD-')-style prefix matches) is replaced by a call to the module's listing/resolve functions.

Because the layout rule lives in exactly one place, the canonical-id spine (k2) and the metadata-only identity rule (k5) are implemented once and inherited by all ~30 consumers, and the S001 minter fix plugs into the one resolver rather than each call site. The migration script (S003) reuses the same module to compute every file's destination, guaranteeing the relocation and the runtime writers agree by construction.

**Pros:**
- Single source of truth: the layout is defined in one module, so the ~30 writer/finder consumers cannot drift apart as the tree evolves.
- The canonical-id spine (k2) and metadata-only identity (k5) are implemented exactly once and reused, instead of re-derived at each of ~28 call sites.
- The S003 migration computes destinations with the very same function the runtime writers use, so a moved file and a freshly-written one land in identical places by construction.
- Finders become deterministic path construction plus one listing function, removing the scattered readdirSync/prefix-scan enumeration that is fragile to layout change.

**Cons:**
- Every consumer must be re-pointed to route through the new module, so the change still touches the full ~30-site breadth even though the logic is centralized.
- The resolver must model both the epic-parented and standalone top-level split and the item-root-vs-story-subfolder distinction, so its interface is broader than any single helper today.

**Cost estimate:** M

### a2: Distributed inline rewrite of each helper and finder

Change every *ArtifactPaths helper and every finder in place to compute the nested path directly, with no shared module.

Leave the code shape as-is and edit each site individually: every per-type *ArtifactPaths helper computes the new nested folder + filename inline, and every readdir/prefix finder is rewritten in place to walk the nested tree. There is no new abstraction; each of the eight helpers and the ~twenty finder sites gains its own copy of the path-construction and identity-derivation logic.

This keeps the module count unchanged and makes each individual diff local and easy to read, but the rule for 'where does a work item's artifact live' is expressed independently in every one of those places rather than stated once.

**Pros:**
- No new module or abstraction is introduced; each change is a localized edit a reviewer can read in isolation.
- Nothing has to model the whole layout at once, so no single interface has to cover every artifact type up front.

**Cons:**
- The nested-path rule is duplicated across the 8 helpers plus ~20 finders (~28 sites), so any later layout adjustment requires editing all of them and drift between writer and finder is likely.
- The metadata-only identity derivation (k5) and the epic-vs-standalone split are re-implemented per site, multiplying the surface where a subtle inconsistency can hide.
- The layout cannot be unit-tested as a single unit; correctness must be re-verified at every call site instead of once.

**Cost estimate:** M

**Rejected because:** Same atomic-cutover and cost profile (M) as a1 but degrades to partial on k2, k3, and k5 because it duplicates the canonical-id spine, the fail-loud identity derivation, and the metadata-only identity rule across ~28 writer/finder sites — precisely the uniformity k2 demands and the drift the Epic removes.

### a3: Generated manifest / index registry

Maintain an index mapping each work-item id to its artifact paths; finders consult the index rather than the directory tree.

Add a generated index (a manifest mapping every work item's canonical id to the paths of its artifacts). Writers update the index when they persist an artifact, and every finder reads the index instead of enumerating directories, so lookup is decoupled from the physical layout.

The filesystem tree becomes secondary to the index, which is the queryable source of record for 'what artifacts exist and where'. This trades a filesystem walk for an index read and could support richer queries than directory scanning.

**Pros:**
- Finding a work item's artifacts becomes a direct index lookup rather than a directory walk plus prefix match.
- The index could answer richer cross-cutting queries (all work items, all artifacts of a type) without re-scanning the tree.

**Cons:**
- It introduces a SECOND source of truth (index vs. the actual files) that must be kept consistent — reintroducing exactly the drift/staleness class of problem this Epic exists to remove.
- The atomic cutover (k1) and the fail-loud migration (k3) get harder: the index must be regenerated and validated against the tree as part of the move, adding a consistency step the other options don't need.
- The human-facing win — opening one folder and seeing everything grouped — comes from the directory tree itself; an index does nothing for a person browsing the repo, so it adds machinery orthogonal to the actual goal.

**Cost estimate:** L

**Rejected because:** Scores partial on k1, k3, and k4 because its index is a second source of truth that must be regenerated and kept consistent with the tree — reintroducing the drift/staleness class the Epic exists to remove — at the highest cost (L) and with no benefit to the human-facing goal of browsing one grouped folder.

## Citations

- **[[c1]]** `analyze-bundle` `s1 bundle 'docs/ artifact path contract in storage.ts' — storage.ts DOCS_ARTIFACT_DIRS (six flat dirs) + the per-type *ArtifactPaths helpers; the hash-flat .insrc/artifacts JSON store is out of scope.`
- **[[c2]]** `code` `s1 bundle 'canonical WorkflowId minter' — src/workflow/id.ts toCanonical/toSlug/parseWorkflowId + storyIdToOrdinal's lowercase-only /^s(\d+)$/ gap that sc1 (S001) closes.`
- **[[c3]]** `code` `s1 bundle 'path-helper return shape + filename encoding' — each *ArtifactPaths returns { md, json } with md = <TYPE>_DIR/<TYPE>-fileSeg(slug??hash)-storyId.md; the delegate surface sc2 re-points.`
- **[[c4]]** `analyze-bundle` `s1 bundle 'consumer/finder blast radius' — the *ArtifactPaths helpers feed ~10 modules and artifact-prefix finders/markers span ~20 (gates, orchestrator, code-review/runner, tracker/resolve, daemon/backup, mcp/build-step/validate).`
- **[[c5]]** `analyze-bundle` `s1 bundle 'artifact enumeration / finder surfaces' — gates.ts readdirSync over [...DOCS_ARTIFACT_DIRS,STUB_DIR] + basename.startsWith('BUILD-'); planFilenamePrefix 'PLAN-<epicHash>-'; tracker/resolve.ts + daemon/backup.ts readdir walks that sc2's listing functions replace.`
- **[[c6]]** `code` `src/workflow/storage.ts artifactIdMarker + the '<!-- insrc:artifact TYPE-epicHash-storyId -->' first line of every artifact md plus its companion .insrc/artifacts/<ID>.json meta (epicHash/storyId/createdAt) — the machine identity source (no YAML frontmatter).`

<!-- insrc:review -->

## Review

### ✅ Review `PASS` — design.epic (design.epic)

**0 HIGH · 0 MED · 5 LOW** · model `client` · reviewed 2026-09-15T17:00:04.957Z

| Ref | Kind | Severity | Fixability | Premise | Evidence | Action |
| --- | --- | --- | --- | --- | --- | --- |
| cl1 | citation | LOW | manual | src/workflow/id.ts provides the canonical WorkflowId converters (toCanonical/toSlug/parseWorkflowId) and storyIdToOrdinal, whose /^s(\\d+)$/ is the lowercase-only gap sc1 (S001) widens. | id.ts exports toCanonical, storyIdToOrdinal, ordinalToStoryId (3/3); the lowercase-only /^s(\\d+)$/ minter gap sc1 closes was confirmed at :102 in prior reviews. | none — verified sound |
| cl2 | citation | LOW | manual | src/workflow/storage.ts's per-type *ArtifactPaths helpers return { md, json } where md is built under a TYPE dir from fileSeg(slug or hash) + storyId — the delegate surface sc2 re-points. | storage.ts contains 26 matches for the md:join(repoPath...)/fileSeg(epicSlug...)/ARTIFACTS_DIR pattern — the { md, json } return shape with md = <TYPE>_DIR/<TYPE>-fileSeg(slug??hash)-storyId.md is confirmed; sc2 delegates this surface. | none — verified sound |
| cl3 | citation | LOW | manual | The read side enumerates via readdirSync over DOCS_ARTIFACT_DIRS + filename-prefix scans (startsWith('BUILD-'), planFilenamePrefix 'PLAN-<epicHash>-') — the finders sc2's listing functions replace. | gates.ts uses readdirSync (3 sites) and basename.startsWith('BUILD-') (1); storage.ts defines planFilenamePrefix ('PLAN-<epicHash>-', 1) — the readdir/prefix finder surface sc2's listing functions replace is confirmed. | none — verified sound |
| cl4 | citation | LOW | manual | src/workflow/storage.ts exports artifactIdMarker rendering the '<!-- insrc:artifact ... -->' first line; identity lives in that marker + companion JSON meta, not YAML frontmatter. | storage.ts exports artifactIdMarker (1); the '<!-- insrc:artifact ... -->' first line + companion JSON meta as the identity source (no YAML frontmatter) was proven in the SPEC/DEF reviews. | none — verified sound |
| cl5 | cross-artifact | LOW | manual | The HLD's shared-contract ownership fits the Epic story graph: sc1 (owner s1) is consumed by s2,s3 which both dependsOn s1; sc2 (owner s2) is consumed by s3 which dependsOn s2 — every consumer is transitively downstream of its owner. | The approved DEF story graph is S001 (no deps), S002 depends s1, S003 depends s1+s2. So sc1 (owner s1) is consumed by s2,s3 — both transitively downstream of s1; sc2 (owner s2) is consumed by s3 — downstream of s2. Every consumer is downstream of its owner; ownership fits the graph with no invented dependency. | none — verified sound; internal consistency holds |
