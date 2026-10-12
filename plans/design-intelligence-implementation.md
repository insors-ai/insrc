# Design intelligence implementation plan

Status: Planning and epic definition. Implementation requires reviewed and explicitly approved workflow artifacts.

Date: 11 October 2026

## Outcome and scope

Implement the [Design Intelligence PRD](../docs/plans/design-intelligence-prd.md), also available as [HTML](../docs/plans/design-intelligence-prd.html). A user creates reusable design guidelines for a project, separately for Web, Mobile-iOS, and Mobile-Android. Downstream page work reads the applicable approved version; it never repeats the design exercise merely because a page changes.

The shared corpus combines eligible open-source foundations with independently authored patterns and style recipes. Preserve attribution, exact source revisions, licensing, applicability, and review status. UI UX Pro Max remains inspiration only.

## Architectural grounding

An insrc analyzer pass found partial reuse candidates in `src/workflow/artifacts`, `src/workflow`, and `src/workflow/runners`, plus related surfaces in `src/mcp/workflow-step`, `src/workflow/artifact-content.ts`, and `src/daemon/workflow-run-registry.ts`. These are extension candidates, not evidence that the guideline domain already exists. Retrieval was bounded and graph coverage is incomplete; caller counts were not established.

Direct inspection of `src/workflow/types.ts` confirms the workflow intent currently requires a registered repository path and enumerates supported workflow names. Supporting a project brief without a repository therefore needs an explicit project/scope contract rather than pretending a page, repository, or GitHub project is the design-project identity. Resolve this in the second epic's HLD and consume it in the third.

Preserve daemon-owned storage and IPC-only client access, local-only embeddings, cloud inference via CliProvider, sequential provider calls, and the high-capability floor for critical design/review roles. New domain schemas and API names are HLD decisions; this plan does not pre-approve implementation contracts.

## Epic sequence

### DI1 Open source design corpus and retrieval

Deliver a versioned, reviewed corpus that can be queried independently of a project guideline workflow.

Proposed stories:

1. Define foundation, pattern, and style-recipe contracts with applicability, stable IDs, versions, relationships, examples, provenance, and review state.
2. Build a source manifest and eligibility/import pipeline with pinned revisions, file-level exclusions, attribution, modification records, and reproducible release notices.
3. Curate a small but complete first release covering style, layout, color, typography, interaction, and accessibility for Web, Mobile-iOS, and Mobile-Android. Start with the PRD's source candidates; do not import whole repositories indiscriminately.
4. Implement daemon-owned retrieval with platform and constraint filters, source-linked fit explanations, explicit no-match results, and version-pinned evidence. Retrieval implementation must preserve accuracy; no arbitrary low-cost truncation.
5. Add release validation, update diffs, withdrawal/deprecation, and coverage evaluation. Corpus updates must not mutate approved guidelines.

Exit criteria: every published record has eligible provenance and reviewed examples; mixed-license fixtures exclude ineligible files; retrieval distinguishes platforms and reports gaps; releases include notices and remain reproducible.

### DI2 Project guideline identity and versioned lifecycle

Deliver project-scoped guideline records and safe activation independently of generation.

Proposed stories:

1. Define stable project identity, optional repository associations, and UI-type identity. Support a project before a repository exists without weakening repo.add's registry contract.
2. Define a complete guideline document and structured contract: foundations, reusable layout/interaction rules, component states, accessibility, exceptions, rationale, and pinned corpus evidence.
3. Implement daemon-owned draft/version persistence, history, listing, exact-version lookup, and active resolution. One active approved version per project/UI-type pair; multiple UI types coexist.
4. Integrate review/explicit approval with atomic activation, stale-review detection, idempotency, and concurrent-update conflict handling. Never activate an unreviewed or unapproved version.
5. Implement versioned export with provenance/notices, missing-guidelines results, project isolation, and restart/recovery behavior.

Dependencies: coordinate the evidence contract with DI1; lifecycle tests can use fixed corpus fixtures before DI1's curated release is complete.

Exit criteria: Web v2 activation preserves Web v1 and both mobile sets; drafts never resolve as active; missing Android never falls back to Web/iOS; simultaneous approvals cannot create two active versions; retrieval is read-only.

### DI3 Guideline creation revision and agent reuse

Deliver the user-facing multi-turn workflow and downstream retrieval behavior on DI1 and DI2.

Proposed stories:

1. Add project/UI-type request resolution, existing-set detection, and shared brief elicitation with platform-specific clarification only where needed.
2. Add corpus-grounded project-level direction comparison and generation of separate guideline drafts. Reuse existing brand choices when adding a platform, with explicit lineage.
3. Integrate guideline review, approval presentation, resumable state, explicit revisions, and independent activation of selected UI-type versions.
4. Expose MCP/IPC operations and steering for retrieving active or historical guidelines. Page/feature work records the consumed version and must not trigger generation or reapproval of unchanged guidelines.
5. Add human-readable exports and lightweight palette/type/component/layout specimens, explicitly selected by the user on 11 October 2026. Polished page mockups are not required.
6. Add end-to-end evaluation, documentation, and rollout checks across the PRD's eight project briefs and three UI types, including several page tasks consuming each set.

Dependencies: DI1 published retrieval/evidence contracts and DI2 identity/lifecycle contracts. Detailed workflow implementation starts after those HLD contracts are reviewed and approved.

Exit criteria: one request can draft Web and iOS sets, approve only one, and add Android later; multiple pages retrieve the same active set without creating artifacts; revisions preserve active versions until approval; interrupted sessions resume without duplicated drafts or activation.

## Validation and delivery

Use isolated temporary stores and fake providers for deterministic tests; never mutate live user stores. Cover source eligibility, schema validation, provenance export, project/UI-type isolation, stale and concurrent approvals, missing guidance, restart recovery, and read-only repeated retrieval. Use serial live provider tests only behind existing opt-in gates.

Run affected test subsets and the TypeScript build for each implementation story, then perform the required independent code review. The complete feature additionally needs corpus editorial review and cross-platform guideline evaluation; passing code tests alone does not establish design quality.

Deliver in order DI1 and DI2 foundations, then DI3 workflow and reuse. Keep any new client surfaces additive and update mirrored IPC contracts where they are actually consumed. Do not introduce a page-design workflow, framework generator, direct cloud REST provider, or blanket accessibility certification.

## Decisions to resolve during design

- Project identity and optional repository binding, including workflow support without a registered repository.
- Storage and atomic activation contract, artifact projection, and approval/review integration.
- Corpus release ownership and a concrete maintainer for editorial review.
- Lightweight examples are confirmed first-release scope; choose their concrete rendering approach during technical design.
- Exact MCP/IPC names and compatibility strategy after inspecting existing consumers.

## Tracking

This plan is the program-level roadmap. Use insrc triage and turn-by-turn `define` to create or extend tracked epics; respect scope assessment rather than forcing duplicate epics. Record returned artifact paths and states below. Review each definition before requesting explicit approval, then advance through HLD, story LLD, plan, build, and code review.

| Planned epic | Tracking status | Artifact |
| --- | --- | --- |
| DI1 Open source design corpus and retrieval | S001 BUILD approved with code-review WARN retained; S002 LLD approved; eight-task S002 PLAN ready for approval | [DEF E202610117e0ae92e](../docs/epics/di1-open-source-design-corpus-retrieval-E202610117e0ae92e/DEF.md) |
| DI2 Project guideline identity and versioned lifecycle | Defined with 5 stories; independent review blocked; not approved | [DEF E202610114abafc9d](../docs/epics/di2-project-guideline-identity-versioned-lifecycle-E202610114abafc9d/DEF.md) |
| DI3 Guideline creation revision and agent reuse | Defined with 6 stories; independent review blocked; not approved | [DEF E20261011b452bdbf](../docs/epics/di3-guideline-creation-revision-agent-reuse-E20261011b452bdbf/DEF.md) |

Triage routed each subsystem to `define`. Scope assessment compared the existing epic catalog and adjacent analyzer findings; these definitions have distinct domain ownership rather than extending unrelated artifact-rendering epics. DI3 explicitly cites the DI1 and DI2 definitions as dependencies. Review calls run sequentially to respect the provider-concurrency rule.

The user selected lightweight palette/type/component/layout examples alongside written guidelines on 11 October 2026. This decision is recorded through the insrc question-resolution surface for DI3. It resolves specimen scope, not approval of the epic definitions. No implementation completion has been recorded.

## Historical review follow-up

The entries below are chronological snapshots, superseded by the current status at the end of this document.

DI1 independent daemon review returned BLOCK with 13 MED and 1 LOW findings. Several findings reflect incomplete probe evidence rather than absent content: direct file checks confirm `docs/plans/design-intelligence-prd.md:127` contains the cited sourcing heading, `plans/design-intelligence-implementation.md:23` contains the DI1 heading, and `AGENTS.md:11`, `:12`, `:122`, and `:135` state the cited accuracy, CLI-only cloud, sequential-provider, and daemon-ownership rules. The review reports zero results for patterns containing inline case flags and some repository-wide probes; the exact probe failure cause has not been diagnosed.

Do not override the review automatically. Re-ground the findings using correctly scoped evidence, distinguish proposed requirements from existing implementation claims, and obtain a fresh independent verdict before approval. The saved analyzer result explicitly reported partial reuse and bounded coverage; it did not assert exhaustive absence of all design retrieval functionality.

DI2 independent review also returned BLOCK (11 MED, 2 LOW). Its findings include the same missing-heading probe behavior and checks that look for planned guideline activation/missing-result behavior in existing code. These are new capability requirements, not assertions that those functions already exist. Preserve the findings and re-ground them through the independent review process rather than self-stamping a pass.

DI3 independent review returned BLOCK (14 MED, 2 LOW), again including unresolved section probes and future-behavior premises. All three definitions are persisted and independently reviewed, but none is approved. Next action is to resolve the review evidence and obtain fresh independent verdicts before asking for artifact approval and starting HLD work.

Validation completed: all plan links resolve; 16 story records have valid dependency ordering and constraint references; HTML and Markdown PRD content are synchronized; whitespace checks pass. No application implementation or application test suite was run in this planning phase.

### DI1 resolution update

DI1 was revised and independently reviewed again. All blocking findings were resolved through the framework with scoped evidence; the effective verdict is PASS, with no override or deferral. The raw review remains preserved. See the [resolution record](design-intelligence-di1-review-resolution.md). DI1 awaits explicit definition approval before design.epic; DI2 and DI3 remain at their prior review states.

### DI1 high-level design

The user approved the revised DI1 definition on 11 October 2026. The six-step design.epic workflow produced the [HLD](../docs/epics/di1-open-source-design-corpus-retrieval-E202610117e0ae92e/HLD.md) and [component diagram](../docs/epics/di1-open-source-design-corpus-retrieval-E202610117e0ae92e/component-dependency.html). It selects immutable release packages with daemon-owned retrieval and disposable local indexes. Seven shared contracts cover record identity, release publication, source eligibility, editorial coverage, query/read APIs, maintenance and the single atomic catalog writer. Three independent review passes found schema, settings, IPC, verification and ownership gaps; all were corrected. The final two findings were resolved through the framework with source evidence; effective verdict PASS, without override. HLD approval and story design remain pending.

### DI1 S001 detailed design

The user approved the HLD on 11 October 2026. The design.story workflow produced [S001 LLD](../docs/epics/di1-open-source-design-corpus-retrieval-E202610117e0ae92e/S001/LLD.md) for sc1/sc2 foundational record/release contracts, deterministic hashing and pure validation. Its independent daemon review found two specification gaps: exact domain labels and field/interface precision. Both were corrected and resolved through the framework; effective verdict PASS, no override. S001 LLD approval is pending. Source import, curated releases, daemon retrieval and catalog mutations remain later stories. No code implementation or new artifact approval is implied.

### DI1 S001 implementation plan

The user approved the S001 LLD on 11 October 2026. The six-step plan workflow produced [S001 PLAN](../docs/epics/di1-open-source-design-corpus-retrieval-E202610117e0ae92e/S001/PLAN.md): six ordered tasks for schemas, canonical hashing, record validation, manifest validation, preflight composition, and strict build/side-effect verification. All 12 LLD test subjects map to tasks; dependencies and citations pass structural validation. The PLAN awaits explicit approval before build. No implementation has started.

### DI1 S001 implementation

The user approved PLAN on 11 October 2026. All six build tasks are implemented under `src/design/corpus/` and passed their insrc gates. The focused corpus suite now has 27 passing tests and the strict build passes. Independent code review and BUILD completion approval remain pending. See [build verification](design-intelligence-di1-s1-build.md) for scope, commits, isolation evidence and the two unrelated full-suite failures. No source import, curation, retrieval or guideline-creation story is complete yet.

### DI1 S001 design correction before completion

Independent code review exposed an omission in the approved candidate hash formula: manifest role/attribution changes can retain stale assessment bindings. Implementation findings were fixed, but the hash formula is intentionally awaiting approval of a revised LLD. The [amendment](design-intelligence-di1-s1-digest-amendment.md) defines the exact replacement and regression requirements. BUILD completion is withheld. After LLD approval, refresh PLAN, implement the new candidate identity, regenerate independent golden vectors, run gates and code review, then request BUILD approval.

The correction also requires HLD alignment: the old projection was normative there. A revised HLD has been authored through insrc, preserving shared shapes and ownership, and is under independent review. It defines missing/duplicate coverage membership as noncomputable candidate identity. Next approval is the corrected HLD, then the matching LLD/PLAN refresh and implementation.

The corrected HLD's two independent-review findings have now been fixed and resolved through the framework with evidence notes. Effective verdict PASS, no override or approval. It is ready for explicit approval. All 27 corpus tests pass under Node 22; the new candidate hash formula is still pending HLD/LLD/PLAN approval and implementation.


### Current status — 12 October 2026

The corrected HLD, S001 LLD and refreshed PLAN are approved. Candidate hashing and malformed coverage/preflight handling are implemented in `cb78619d`, `839b36d5` and `4f03c64e`; all affected insrc gates pass. Final corpus tests: 33 passed; strict build passed. The full suite has one known unrelated SQLite temporalTrend overflow failure.

The fresh Claude Opus daemon code review completed with WARN (0 HIGH, 4 MED, 4 LOW), using degraded diff grounding because the index stayed stale. Its three coverage MED findings concern missing evidence in the review context; daemon task-gate evidence remains recorded in BUILD/TESTS. Its stale-roadmap MED finding is corrected here. The user explicitly approved S001 BUILD completion on 12 October at 04:44:27 UTC, without review override; the WARN verdict remains recorded. S002's LLD was independently reviewed and corrected: both MED findings and the LOW path-grammar clarification are resolved through the framework, effective PASS with no override or deferral. The user approved it in the same turn. No artifacts were skipped.

The six-step insrc plan workflow produced [S002 PLAN](../docs/epics/di1-open-source-design-corpus-retrieval-E202610117e0ae92e/S002/PLAN.md): eight ordered tasks for schemas, reviewed eligibility, pinned Git acquisition, reader limits, lineage, notices, candidate assessment and acceptance/isolation verification. All 12 LLD test subjects map verbatim to tasks; dependency order and citation coverage were checked. PLAN approval is the next gate; no S002 code or real source import has started.
