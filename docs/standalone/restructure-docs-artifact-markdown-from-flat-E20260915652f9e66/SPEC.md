<!-- insrc:artifact SPEC-652f9e6637273e1e -->

# Spec: Restructure the docs/ artifact markdown from flat, type-first folders (docs/designs, docs/plans, docs/builds, docs/reviews, docs/defines, docs/specs) into an ID-anchored, work-item-first tree so an epic/story's scattered artifacts are easy to correlate and locate: docs/epics/<slug>-E<date><hash8>/ for epic-parented work and docs/standalone/<slug>-E<date><hash8>/ for triage-routed standalone features.

**Category:** requirements

## Intent

Restructure the docs/ artifact markdown from flat, type-first folders (docs/designs, docs/plans, docs/builds, docs/reviews, docs/defines, docs/specs) into an ID-anchored, work-item-first tree so an epic/story's scattered artifacts are easy to correlate and locate: docs/epics/<slug>-E<date><hash8>/ for epic-parented work and docs/standalone/<slug>-E<date><hash8>/ for triage-routed standalone features. Each item root holds SPEC.md + DEF.md (+ HLD.md for epics); a per-story S<nnn>/ subfolder holds LLD.md, PLAN.md, BUILD.md, CR.md (and EXT.md for a story added later). The canonical WorkflowId (E<YYYYMMDD><hash8>:S<nnn>:T<nnn>, both-way sluggable) is the structural spine; story ids normalize to S<nnn>, and storyIdToOrdinal/the minter is fixed to accept uppercase S001 so standalone stories canonicalize uniformly. A one-time migration script moves the ~200 existing files (git mv + rename, history preserved, story ids normalized) and switches src/workflow/storage.ts path helpers, the DOCS_ARTIFACT_DIRS globs, and the artifact-prefix finders in approval/tracker logic to read the new layout. Each file's WorkflowId is derived exclusively from its own machine metadata (frontmatter workflowId/epicHash/storyId), with the old filename consulted only afterward to derive the human-readable slug; a file that does not confidently resolve to a single WorkflowId fails loud (aborts the run with the path + reason for manual fix); cross-doc markdown links between moved artifacts are rewritten via the move's path-mapping table and then a post-move validation pass resolves every rewritten link against the new tree, aborting if any fails to resolve.

## Scope boundary

The switch-over is a single atomic PR with no dual-path support and no feature flag — the daemon is the sole consumer of docs/ paths, so there is no external audience to stage a rollout for. The work restructures ONLY the human-facing docs/ markdown tree: the .insrc/artifacts/ JSON machine store stays hash-flat and untouched, the Pages site/ output structure is out of scope, and no per-task artifact files are introduced (tasks remain T<nnn> references inside PLAN/BUILD, not their own files). A file that cannot be confidently mapped halts the run rather than being best-effort placed into a holding folder or skipped in place; identity is never inferred from the filename; and links are never left for a manual post-move cleanup.

## Non-goals

- The .insrc/artifacts JSON machine store — stays hash-flat, untouched
- The Pages site/ output structure
- Per-task artifact files
- Dual-read compat shim — finders/globs check both old and new paths for a transition window, torn out in a follow-up once verified.
- Feature-flagged cutover — new path resolution gated behind a config flag, flipped after a staged verification run.
- Best-effort placement — heuristically derive a path/date-based home and drop unmapped files into a temporary docs/_needs-review/ folder; migration completes in one pass
- Skip and leave in place in the old flat folder
- Regex-scan every moved markdown file for link targets under any of the six old flat folders, and rewrite each match through the same old-path→new-path table the mover already built for the move itself.
- Don't auto-rewrite at all; the script only flags files that still contain old-style paths, and a human fixes links by hand after the move.
- Filename regex only — parse the existing flat-folder filename convention for the embedded epic hash / story number; frontmatter is not consulted.
- Cross-validate both — require the frontmatter field and the filename-derived ID to agree; treat any disagreement, or either being absent, as ambiguous (routes straight into decision 2's fail-loud path).
- Frontmatter first, filename fallback — use frontmatter when present and well-formed; fall back to parsing the filename only when frontmatter is absent, before declaring the file ambiguous.

## Decisions

- **Hard cutover — one atomic PR: migration script runs, then storage.ts/globs/finders are updated to read the new layout only, in the same change. No dual-path support, no flag.** — CLAUDE.md's code conventions say: "Don't use feature flags or backwards-compatibility shims when you can just change the code" — and since the daemon is the sole consumer of docs/ paths (no external process reads them mid-transition), there's no forced-upgrade audience to stage a rollout for.
  - Ruled out: _Dual-read compat shim — finders/globs check both old and new paths for a transition window, torn out in a follow-up once verified._, _Feature-flagged cutover — new path resolution gated behind a config flag, flipped after a staged verification run._
- **Fail loud — abort the whole migration run at that file, print its path and the reason, require a manual fix (add/correct the ID) before retrying** — Since the cutover is atomic (no leftover flat-folder files can remain after the PR), what should the migration script do when it hits an artifact file it can't confidently map to a single WorkflowId — missing/ambiguous ID in the filename or frontmatter, or a legacy file that predates the ID scheme?
  - Ruled out: _Best-effort placement — heuristically derive a path/date-based home and drop unmapped files into a temporary docs/_needs-review/ folder; migration completes in one pass_, _Skip and leave in place in the old flat folder_
- **Same regex-scan and rewrite, plus a post-move validation pass that resolves every rewritten link against the new tree and aborts the whole run if any link doesn't resolve to a real file.** — Cross-doc markdown links between artifacts (e.g., a Story's PLAN.md linking back to its epic's HLD.md, or DEF.md linking to SPEC.md) will break once files move to the new paths. How should the migration script detect and rewrite these links?
  - Ruled out: _Regex-scan every moved markdown file for link targets under any of the six old flat folders, and rewrite each match through the same old-path→new-path table the mover already built for the move itself._, _Don't auto-rewrite at all; the script only flags files that still contain old-style paths, and a human fixes links by hand after the move._
- **Frontmatter field only — read each artifact's YAML frontmatter (workflowId / epicHash / storyId) exclusively; the old filename is only consulted afterward to help derive the new folder's human-readable slug, never for identity.** — Builds directly on decision 2 (fail-loud on files that can't be confidently mapped) — that check has no defined meaning until we pin what "confidently mapped" is measured against.
  - Ruled out: _Filename regex only — parse the existing flat-folder filename convention for the embedded epic hash / story number; frontmatter is not consulted._, _Cross-validate both — require the frontmatter field and the filename-derived ID to agree; treat any disagreement, or either being absent, as ambiguous (routes straight into decision 2's fail-loud path)._, _Frontmatter first, filename fallback — use frontmatter when present and well-formed; fall back to parsing the filename only when frontmatter is absent, before declaring the file ambiguous._

## Citations

- **[[c1]]** `step-output` `s1`
- **[[c2]]** `convention` `CLAUDE.md code conventions — 'Don't use feature flags or backwards-compatibility shims when you can just change the code' (grounds the hard-cutover decision)`
- **[[c3]]** `code` `src/workflow/id.ts — the canonical WorkflowId (E<YYYYMMDD><hash8>:S<nnn>:T<nnn>, toCanonical/toSlug/fromSlug) that becomes the structural spine; storyIdToOrdinal's lowercase-only regex is the minter gap the spec fixes`
- **[[c4]]** `code` `src/workflow/storage.ts — the *ArtifactPaths helpers + DOCS_ARTIFACT_DIRS the migration re-points to the new layout`

<!-- insrc:review -->

## Review

### ⛔ Review `BLOCK` — brainstorm (brainstorm)

**0 HIGH · 1 MED · 4 LOW** · model `client` · reviewed 2026-09-15T16:31:18.948Z

| Ref | Kind | Severity | Fixability | Premise | Evidence | Action |
| --- | --- | --- | --- | --- | --- | --- |
| cl5 | semantic | MED | assisted | The persisted artifact markdown files carry their identity as YAML frontmatter (workflowId/epicHash/storyId), as the spec's id-mapping-source decision assumes. | REFUTED. The id-mapping-source decision names 'YAML frontmatter (workflowId/epicHash/storyId)', but NO artifact markdown file carries YAML frontmatter: a first-line '^---$' scan over docs/designs+plans+builds returns 0, while 155 files carry an HTML marker `<!-- insrc:artifact TYPE-epicHash-storyId -->` (e.g. docs/epics/add-daemon-driven-code-review-stage-E20260803761a43a6/S001/LLD.md first line is `<!-- insrc:artifact LLD-761a43a6fa645815-s1 -->`). Furthermore that marker encodes only TYPE-epicHash-storyId — NOT the createdAt date the folder's E<YYYYMMDD> segment requires — so the authoritative source must include the companion .insrc/artifacts/<ID>.json meta (which carries epicHash/storyId/createdAt). | In the DEF/LLD, correct the id-mapping-source mechanism: the migration reads identity from the artifact's `insrc:artifact` marker AND its companion .insrc/artifacts/<TYPE>-<epicHash>-<storyId>.json meta (for createdAt + full epicHash), NOT YAML frontmatter (which does not exist on these files). The DECISION's intent (trust machine metadata, never the filename, fail loud when it doesn't resolve) is sound and unchanged — only the concrete source name is wrong. |
| cl1 | citation | LOW | manual | src/workflow/id.ts defines the canonical WorkflowId (epic segment E<YYYYMMDD><hash8>, story S<nnn>, task T<nnn>) with both-way converters toCanonical/toSlug/fromSlug. | src/workflow/id.ts:152 toCanonical, :169 toSlug (toCanonical(id).replaceAll(':','-')), :177 parseWorkflowId; epic segment `E${id.date}${id.hash8}`. Canonical WorkflowId spine confirmed. | none — verified sound |
| cl2 | citation | LOW | manual | src/workflow/id.ts's storyIdToOrdinal parses story ids with a lowercase-only regex (^s(\\d+)$), so an uppercase 'S001' does not canonicalize — the minter gap the spec fixes. | src/workflow/id.ts:101 storyIdToOrdinal; :102 `const m = /^s(\\d+)$/.exec(storyId)` — lowercase-only, so uppercase 'S001' fails to canonicalize. The minter gap the spec fixes is real. | none — verified sound; the DEF should fix storyIdToOrdinal (and ordinalToStoryId round-trip) to accept both s1 and S001 forms. |
| cl3 | inventory | LOW | manual | src/workflow/storage.ts defines DOCS_ARTIFACT_DIRS as the six flat docs/ artifact folders (defines, designs, plans, builds, specs, reviews). | src/workflow/storage.ts:69 DOCS_ARTIFACT_DIRS = [DEFINES_DIR, DESIGNS_DIR, PLANS_DIR, BUILDS_DIR, SPECS_DIR, REVIEWS_DIR]; the six flat docs/ dirs are defined at :53-61. Inventory confirmed. | none — verified sound |
| cl4 | citation | LOW | manual | src/workflow/storage.ts exposes the per-type artifact path helpers the migration must re-point (defineArtifactPaths/hldArtifactPaths/lldArtifactPaths/planArtifactPaths/buildArtifactPaths/codeReviewArtifactPaths/specArtifactPaths/extendArtifactPaths). | src/workflow/storage.ts exposes 8 *ArtifactPaths helpers (define/spec/hld/lld/plan/build/codeReview/extend) — all re-point targets confirmed present. | none — verified sound |

#### Proposed fixes

- **cl5** (assisted) — The chosen decision's spirit (metadata-authoritative, filename only for slug, fail-loud) is correct and the right call; only the literal 'YAML frontmatter' source is factually wrong for this repo. Left uncorrected, a migration script written to read YAML frontmatter would fail-loud on all 200 files. The companion JSON meta is also REQUIRED (not optional) because the E<YYYYMMDD> date lives only there.
  - edit: `Each file's WorkflowId is derived exclusively from its own machine metadata (frontmatter workflowId/epicHash/storyId), with the old filename consulted only afterward to derive the human-readable slug` → `Each file's WorkflowId is derived exclusively from its own machine metadata — the `<!-- insrc:artifact TYPE-epicHash-storyId -->` marker plus the companion .insrc/artifacts/<ID>.json meta (epicHash, storyId, createdAt; createdAt supplies the E<YYYYMMDD> date the marker lacks) — with the old filename consulted only afterward to derive the human-readable slug`
