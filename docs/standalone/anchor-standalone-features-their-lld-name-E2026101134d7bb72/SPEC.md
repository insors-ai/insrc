<!-- insrc:artifact SPEC-34d7bb72df47a5e5 -->

# Spec: Standalone features (triage → standalone design.story LLD → plan → build) can't be built task by task because the tracker resolver anchors an epic only on DEF or ISSUE, and each stage names its docs folder from its own focus text, splitting one story's docs across folders; the originating SPEC is never linked.

**Category:** design

## Intent

Standalone features (triage → standalone design.story LLD → plan → build) can't be built task by task because the tracker resolver anchors an epic only on DEF or ISSUE, and each stage names its docs folder from its own focus text, splitting one story's docs across folders; the originating SPEC is never linked. Converged: (1) the standalone LLD is the third identity anchor after DEF and ISSUE, no new artifact kind; (2) insrc_triage accepts and verifies an approved specHash and threads it into the design.story nextCall, stamping meta.seededFromSpec and showing 'Seeded from SPEC-...' in the LLD, with the SPEC keeping its own hash and folder; (3) the anchor LLD's slug comes from triage's storyTitle (fallback focus-derived) and PLAN/BUILD/TESTS/CR inherit epicSlug from the anchor; (4) the resolver accepts any LLD for a hash with no DEF/ISSUE (including legacy unflagged), and migrate-docs-tree.ts consolidates anchorless items' story-scoped files into the anchor LLD's folder (dry-run, then apply, no artifacts created); (5) a head artifact's synthesizer writes a short outcome-phrased `title` in the same pass (SPEC body gains `title`) and the folder slug derives from it, with no extra LLM call. One rule: a folder is named from its head artifact's title and everything downstream inherits it.

## Scope boundary

Only PLAN-bearing routes need an anchor (epic: DEF, bugfix sized: ISSUE, standalone feature: the LLD); small/trivial/bugfix-small are unaffected.

## Non-goals

- A new artifact kind (no FEAT artifact, no minimal one-story DEF)
- Promoting the SPEC to be the anchor, or epic hash = SPEC hash
- Moving the SPEC md into the feature folder
- Slug from SPEC intent text or a deterministic first-sentence slug
- A separate cheap-tier LLM call to produce a slug
- Read-compat only without consolidation of existing items
- Renaming historical folders to story titles
- Changes to the epic or bugfix routes beyond naming
- Anchors for small/trivial/bugfix-small routes

## Citations

- **[[c1]]** `step-output` `s1`
- **[[c2]]** `prior-artifact` `ISSUE-b2e05b043846451c`
- **[[c3]]** `code` `src/workflow/tracker/resolve.ts`
- **[[c4]]** `code` `src/workflow/slug.ts`
- **[[c5]]** `code` `src/workflow/migrate-docs-tree.ts`
