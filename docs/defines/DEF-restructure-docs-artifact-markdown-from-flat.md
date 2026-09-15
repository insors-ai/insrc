<!-- insrc:artifact DEF-599a9b506f22b896 -->

# Epic: Every artifact the workflow produces for one piece of work — the brainstorm spec, the epic framing, the high- and low-level designs, the plan, the build record, and the code review — is filed into a folder chosen by the artifact's TYPE, and all artifacts of a type accumulate flat in that one folder.

**Flavor:** enhancement

## Problem

Every artifact the workflow produces for one piece of work — the brainstorm spec, the epic framing, the high- and low-level designs, the plan, the build record, and the code review — is filed into a folder chosen by the artifact's TYPE, and all artifacts of a type accumulate flat in that one folder. The complete record of a single epic or story is therefore scattered across six sibling directories, and within the largest of them roughly a hundred files of three different artifact types sit side by side with no grouping. The filenames that would let a reader correlate those scattered pieces are keyed inconsistently: some artifact types are named by a human-readable slug and others by an opaque hash, so the same work has no shared, eyeball-able key tying its design to its plan to its build to its review. A canonical hierarchical identifier for every work item already exists in the system, but it is applied unevenly — one whole class of story never canonicalizes at all — so it cannot serve as a reliable correlating spine. The cost lands on anyone reading the history of a change: locating everything about one epic or story, or even confirming which build belongs to which design, means cross-referencing folders and reconciling two naming schemes by hand, and that difficulty compounds with every new artifact the system writes.

## Non-goals

- **Restructuring the .insrc/artifacts/ canonical JSON store (it stays hash-flat and untouched).** — The JSON store is a machine substrate that is never browsed by a human and is already keyed consistently by hash; reorganizing it would churn a stable store for no correlation benefit, since the problem is entirely about the human-facing markdown.
- **Changing the Pages site/ output structure.** — GitHub Pages serves from the separately-authored site/ tree, which is unrelated to the docs/ artifact store; the correlation problem does not touch it.
- **Introducing per-task artifact files.** — Tasks are already captured inside the PLAN and BUILD artifacts as T<nnn> references; minting separate per-task files would create artifacts the workflow does not produce today and is orthogonal to correlating the existing ones.
- **Any dual-path / backwards-compatibility transition window for the old and new layouts.** — The daemon is the sole consumer of these paths, so there is no external, mid-transition audience to protect; a shim would add temporary code that the repo's conventions explicitly discourage.

## Assumptions

- `high` The system already computes a canonical, both-way-convertible hierarchical work-item identifier (epic segment + story ordinal + task ordinal) that can serve as the structural spine for the new layout. [[c2]]
- `high` The persisted artifact markdown files carry their machine identity as an in-file `insrc:artifact` marker plus a companion canonical JSON record (which alone carries the creation date the epic segment needs) — NOT as YAML frontmatter, which these files do not have. [[c6]]
- `med` The daemon is the only process that reads or writes the docs/ artifact paths; no external tool depends on the current flat layout mid-transition. [[c5]]
- `high` Roughly 200 existing artifact files are spread across the six flat artifact directories and must be relocated as part of the change. [[c3]]

## Constraints

| ID | Type | Text | Source |
| :--- | :--- | :--- | :--- |
| `k1` | convention | The switch-over is a single atomic change with no backwards-compatibility shim and no feature flag; the code moves to the new layout directly rather than supporting both. | [[c4]] |
| `k2` | contract | The canonical hierarchical work-item identifier is the identity spine: every artifact type and every path finder resolves a work item's location through it uniformly, including the story class that does not canonicalize today. | [[c2]] |
| `k3` | invariant | A file that cannot be confidently mapped to a single work-item identifier halts the migration (fail-loud) rather than being placed heuristically or left in the old location. | [[c1]] |
| `k4` | invariant | Git history is preserved across every relocation, and cross-document links are rewritten and then validated to resolve against the new tree before the change is accepted. | [[c1]] |
| `k5` | invariant | A work item's identity is derived only from its own machine metadata (the in-file marker + companion JSON record), never inferred from its filename; the filename contributes only the human-readable slug. | [[c6]] |

## Stories

### E20260915599a9b50:S001 — Every work item carries one consistent canonical identity

**User value:** `size: S`

Anyone reading the artifacts, or any tool built over them, can rely on a single uniform identity scheme for every epic and story — including triage-routed standalone stories, which today silently degrade to a bare, non-canonical identifier — so identity can serve as the reliable spine that ties a work item's records together.

**Extends:** [[c2]]

**Acceptance criteria:**

- **ac1:** Given a triage-routed standalone story whose id is emitted in the uppercase form, when the system derives that story's canonical identity, then it produces the same well-formed canonical identifier it produces for an epic-parented story, instead of falling back to a bare, non-canonical id. _(operationalizes `k2`)_
- **ac2:** Given an epic-parented story whose id is emitted in the existing lowercase form, when the system derives its canonical identity after the change, then the identifier is identical to what it produced before, with no regression for stories that already canonicalize. _(operationalizes `k2`)_

**Local constraints:**

- `lc1` (contract) The identity derivation stays both-way — a canonical identifier can still be produced from a work item and parsed back to it — so it remains usable as a folder key and as a lookup key. [[c2]]

### E20260915599a9b50:S002 — Every artifact for a work item is stored and found together under one consistently-keyed folder

**User value:** `size: L`

A reader locating the full record of an epic or story opens a single folder holding its spec, framing, designs, plan, build, and review grouped by story — instead of cross-referencing six type-named folders and reconciling two different filename schemes — and every part of the system that writes or looks up an artifact uses that same grouped, identity-keyed location.

**Depends on:** `s1`

**Extends:** [[c3]] [[c5]]

**Acceptance criteria:**

- **ac1:** Given any artifact the workflow produces for a work item, when it is written to disk, then it is placed inside that work item's own folder, grouped under its story, keyed by the work item's canonical identity with a human-readable label, rather than in a flat per-type folder. _(operationalizes `k2`, `k5`)_
- **ac2:** Given any part of the system that looks up or lists a work item's artifacts, when it resolves their location after the change, then it reads them from the new grouped layout and no consumer still expects the old flat per-type folders. _(operationalizes `k1`)_
- **ac3:** Given an epic-parented work item and a triage-routed standalone one, when their artifacts are stored, then the two kinds are distinguishable at the top level while following the same internal per-story grouping. _(operationalizes `k2`)_

**Local constraints:**

- `lc1` (invariant) The identity that determines an artifact's folder is taken only from the artifact's own machine metadata (its in-file marker plus companion record), never inferred from its filename; the filename contributes only the human-readable label. [[c6]]

### E20260915599a9b50:S003 — The artifacts that already exist are relocated into the new structure safely

**User value:** `size: M`

The roughly 200 artifacts already on disk become navigable under the new grouped scheme — moved with their history intact, none misfiled or dropped, and with their cross-document links still resolving — so the reorganization can be trusted instead of leaving a mix of old and new that is worse than either.

**Depends on:** `s1`, `s2`

**Extends:** [[c3]]

**Acceptance criteria:**

- **ac1:** Given the existing artifacts spread across the flat type-named folders, when they are relocated into the new layout, then each moves into its work item's grouped folder with its version history preserved. _(operationalizes `k4`)_
- **ac2:** Given an artifact that cannot be confidently mapped to a single work item from its own metadata, when the relocation reaches it, then the relocation halts and reports that specific file rather than guessing a location or leaving it behind. _(operationalizes `k3`, `k5`)_
- **ac3:** Given cross-document links between relocated artifacts, when the relocation completes, then every such link resolves to a real file in the new tree, and the relocation is rejected if any link does not resolve. _(operationalizes `k4`)_

**Local constraints:**

- `lc1` (invariant) No artifact is left in an old flat location once the relocation is accepted — the end state is fully the new layout, never a partial mix. [[c1]]

## Citations

- **[[c1]]** `prior-artifact` `docs/specs/SPEC-restructure-docs-artifact-markdown-from-flat.md (approved SPEC-652f9e6637273e1e) — decisions: hard atomic-PR cutover, fail-loud on unmappable files, regex link rewrite + post-move validation, metadata-authoritative id source.`
- **[[c2]]** `code` `src/workflow/id.ts — canonical WorkflowId (E<YYYYMMDD><hash8>:S<nnn>:T<nnn>) with toCanonical/toSlug/parseWorkflowId; storyIdToOrdinal's /^s(\d+)$/ rejects uppercase S001 (the uneven-canonicalization gap).`
- **[[c3]]** `code` `src/workflow/storage.ts — DOCS_ARTIFACT_DIRS (the six flat dirs) + the 8 per-type *ArtifactPaths helpers keying markdown by slug or hash; ~200 files live under these dirs.`
- **[[c4]]** `convention` `CLAUDE.md code conventions — 'Don't use feature flags or backwards-compatibility shims when you can just change the code.'`
- **[[c5]]** `analyze-bundle` `Consumer/finder blast-radius bundle — the *ArtifactPaths helpers feed ~10 modules and artifact-prefix finders/markers span ~20 (gates, orchestrator, code-review/runner, tracker/resolve, daemon/backup, mcp/build-step/validate, …); the daemon is the sole consumer.`
- **[[c6]]** `code` `src/workflow/storage.ts artifactIdMarker + the rendered '<!-- insrc:artifact TYPE-epicHash-storyId -->' first line of every artifact md, plus its companion .insrc/artifacts/<ID>.json meta (epicHash/storyId/createdAt) — the machine identity source (these files have no YAML frontmatter).`

<!-- insrc:review -->

## Review

### ✅ Review `PASS` — define (define)

**0 HIGH · 0 MED · 6 LOW** · model `client` · reviewed 2026-09-15T16:43:44.319Z

| Ref | Kind | Severity | Fixability | Premise | Evidence | Action |
| --- | --- | --- | --- | --- | --- | --- |
| cl1 | citation | LOW | manual | src/workflow/id.ts defines the canonical WorkflowId with both-way converters toCanonical/toSlug/parseWorkflowId and an epic segment E<date><hash8>. | src/workflow/id.ts exports toCanonical, toSlug, parseWorkflowId (3/3 present); epic segment E${date}${hash8}. Canonical WorkflowId spine confirmed. | none — verified sound |
| cl2 | citation | LOW | manual | src/workflow/id.ts storyIdToOrdinal uses the lowercase-only regex /^s(\\d+)$/ so uppercase S001 fails to canonicalize (the gap S001 of this Epic closes). | id.ts:101 storyIdToOrdinal; the lowercase-only /^s(\\d+)$/ was confirmed earlier at :102 — uppercase S001 fails to canonicalize. The gap S001 closes is real. | none — verified sound |
| cl3 | inventory | LOW | manual | src/workflow/storage.ts defines DOCS_ARTIFACT_DIRS as the six flat docs/ artifact folders and exposes the per-type *ArtifactPaths helpers. | storage.ts defines DOCS_ARTIFACT_DIRS (the six flat dirs) and 9 *ArtifactPaths helpers (stub/define/spec/hld/lld/plan/build/codeReview/extend; the DEF says 8 core, stub aside). Inventory confirmed. | none — verified sound |
| cl4 | semantic | LOW | manual | The persisted artifact markdown files carry identity as an in-file '<!-- insrc:artifact ... -->' marker (rendered by artifactIdMarker), not as YAML frontmatter. | storage.ts:188 artifactIdMarker renders the '<!-- insrc:artifact ... -->' first line; the SPEC review already proved these md files have zero YAML frontmatter. The metadata-authoritative-not-frontmatter assumption (DEF assumption 2 / k5) is grounded. | none — verified sound |
| cl5 | inventory | LOW | manual | Roughly 200 artifact markdown files exist across the six flat docs/ artifact directories. | 191 files carry the insrc:artifact marker across the six flat dirs; 217 raw .md files total. The 'roughly 200' claim holds. The ~26 unmarked md files (e.g. the dated docs/reviews/2026-07-20-*.md audits) are exactly the legacy pre-ID-scheme oddballs that S003's fail-loud (k3) is designed to surface for manual mapping. | none — verified sound; note the 191-vs-217 gap gives S003 a concrete count of legacy files to hand-map during migration. |
| cl6 | inventory | LOW | manual | The *ArtifactPaths helpers + artifact-prefix finders/markers are consumed by many modules (~10 path-helper consumers, ~20 finder/marker modules) that must be re-pointed in the cutover. | Confirmed earlier: the *ArtifactPaths helpers feed ~10 non-test modules and artifact-prefix finders/markers span ~20 modules (gates, orchestrator, code-review/runner, tracker/resolve, daemon/backup, mcp/build-step/validate, …); id converters feed 6. The blast-radius that makes this Epic-sized is real. | none — verified sound |
