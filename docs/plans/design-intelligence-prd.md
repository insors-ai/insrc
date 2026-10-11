# insrc Design Intelligence PRD

Status: Draft for discussion. Not approved for implementation.

Date: 11 October 2026

## Product intent

Give people and AI agents a dependable design partner for web and mobile products. The user requests creation of design guidelines for a project and selects the UI types to cover: Web, Mobile-iOS, and Mobile-Android. insrc retrieves relevant design knowledge, helps select a coherent direction, and saves reusable guidelines for each requested UI type. Subsequent page and feature work consumes those guidelines without repeating the design exercise.

The core asset is a searchable corpus combining eligible open-source design foundations with insrc-authored style, layout, color, typography, and UX guidance. Recommendations should explain why a choice fits the task, which constraints it satisfies, and what tradeoffs it introduces. A project should acquire a consistent design language over time while retaining room for deliberate evolution.

## Confirmed scope and proposed decisions

The user has confirmed that the capability belongs in insrc, covers both web and mobile, includes a style/layout/color guidance corpus, and focuses on designing rather than React, Angular, or any other implementation framework. UI UX Pro Max is an inspiration and reference; its implementation and catalog will not be copied.

A project can have multiple guideline sets, one for each UI type: Web, Mobile-iOS, and Mobile-Android. The creation workflow operates at project and UI-type scope, not page scope. Users may create one set now and add another UI type later.

External material incorporated into the distributed corpus must be open source or explicitly open-licensed for its content type, including public-domain material. Public availability alone does not qualify a source. Project-private inputs may inform that project's design but must not enter the shared corpus automatically.

The first release includes lightweight palette, typography, component-state, and representative layout examples alongside written guidelines, as explicitly selected by the user on 11 October 2026. Other unconfirmed requirements remain proposed product decisions. This scope choice does not constitute workflow artifact approval.

## Problem and users

Agents can make individually plausible UI choices that do not form a coherent product. A palette may lack usable semantic roles, a layout may fail with real content, and a mobile screen may inherit desktop navigation without considering touch or constrained space. Generic style advice also loses previously agreed brand decisions between tasks.

The primary users are product builders and designers collaborating with an agent, and agents consuming insrc design context. A secondary user is a maintainer curating the guidance corpus. The product must work for a new idea with no repository, an existing design system, and an existing product whose design decisions are only partially documented.

## Goals and boundaries

The first release should help users select a coherent project design direction, establish reusable guidelines for each requested UI type, and apply those guidelines consistently across pages and features. It should preserve decision history and make sources and uncertainty inspectable.

Framework selection, production application generation, framework component libraries, deployment, and automated code modification are outside this capability's initial scope. So are a full canvas editor, automatic Figma synchronization, logo generation, and blanket accessibility certification. These may become integrations later without changing the design model.

Page-by-page design exercises and production screen or flow specification generation are outside this workflow. Representative layouts and component specimens may illustrate a guideline, but creating a new page must not create a new guideline set or restart direction selection.

Visual previews are proposed as aids to choosing and reviewing reusable guidelines. They do not make production UI generation part of this PRD.

## Main user journeys

1. **Create project guidelines.** A user asks, “Create design guidelines for Project Atlas for Web and Mobile-iOS.” insrc gathers a project brief, retrieves relevant corpus guidance, compares coherent directions, and drafts a separate guideline set for each requested UI type. Each set is reviewed and explicitly approved before becoming active.
2. **Add another UI type.** Later, the user requests Mobile-Android guidelines for Atlas. insrc reuses relevant brand decisions from the existing sets, identifies Android-specific choices, and creates the additional set without replacing Web or Mobile-iOS guidelines.
3. **Use guidelines for page work.** An agent working on a dashboard, settings page, or checkout retrieves the active guidelines for the project and UI type. It applies the same design rules across those pages without a new design exercise or approval of unchanged guidelines.
4. **Revise project guidelines.** A user explicitly asks to change a guideline set. insrc drafts a new version, explains the changes and affected design rules, and preserves the active version until the revision is reviewed and approved.
5. **Explore guidance or assess adherence.** A user can ask a focused design question or compare downstream work against an active guideline set. Findings may suggest a project-level revision but do not automatically create page-specific guidelines.

## Project guideline workflow

### Project and UI type model

A project is the parent of independently versioned guideline sets. Each set has a stable identity, project identity, UI type, version, status, design rationale, and source provenance. One active approved version is resolved for each project and UI-type pair; drafts and superseded versions remain available as history. An existing active set makes a new request for the same pair an explicit revision, not a second competing default.

| Project | Guideline set | Applies to |
| --- | --- | --- |
| Project Atlas | Web | All web pages, including responsive mobile web. |
| Project Atlas | Mobile-iOS | All iOS screens, with relevant phone and tablet adaptations. |
| Project Atlas | Mobile-Android | All Android screens, with relevant phone and tablet adaptations. |

Only requested UI types need guideline sets. Shared brand decisions can be reused with an explicit source-version reference, while each set remains complete enough to consume independently. A change in one set never silently modifies another. Page names, routes, and feature identifiers are not guideline identities.

### Creation and revision lifecycle

1. **Request and resolve.** Identify the project and requested UI types. Check for active guidelines and drafts before starting creation or an explicit revision.
2. **Capture the project brief.** Establish audience, recurring tasks, brand, content density, accessibility, and desired character once. Clarify only meaningful differences for each UI type.
3. **Explore and choose.** Retrieve the corpus and compare project-level design directions. Existing approved brand choices constrain additions unless the user requests a change.
4. **Draft guideline sets.** Produce reusable style, color, typography, layout, navigation, component, state, motion, and accessibility rules for each requested UI type, with rationale and representative examples.
5. **Review and approve.** Review the sets and obtain explicit approval identifying the set and version. Approval can cover several named sets together; one set can remain a draft while another becomes active.
6. **Reuse.** Downstream work resolves the active set by project and UI type, records its version, and uses the applicable rules. This is retrieval and application, not a new creation workflow.
7. **Revise deliberately.** Missing reusable guidance or an explicit change request may lead to an amendment of the relevant set. Existing approved versions remain active until replacement is approved. Existing page work is not automatically rewritten.

### Missing guidance and exceptions

If no approved set exists, return a clear missing-guidelines result and offer the project guideline creation workflow. Do not generate a silent default or use a guideline from the wrong UI type. A draft may be inspected as a draft, but must not be returned as active approved guidance.

If a page exposes a gap, first apply the existing rules and reusable patterns. Surface any unresolved conflict; propose a project/UI-type amendment only when a reusable decision is needed. A scoped exception must reference the active guideline version and its rationale, and must not become a separate page guideline set.

## Guidance corpus

### Coverage

The corpus is a maintained product dataset with licensed foundations, independently written guidance, and original examples. Launch coverage is measured by supported design tasks and tested combinations, rather than a large advertised record count.

| Domain | Required guidance |
| --- | --- |
| Visual style | Hierarchy, whitespace, shape, borders, elevation, texture, imagery, visual character, compatible treatments, and conditions where a treatment becomes distracting or inaccessible. |
| Layout | Grids, content width, spacing, grouping, density, alignment, page composition, split views, list/detail, dashboards, forms, onboarding, search, discovery, and reading experiences. |
| Color | Semantic roles, tonal relationships, accent allocation, foreground/background pairs, status meaning, data visualization, light/dark modes, and brand adaptation. |
| Typography | Role hierarchy, scale, line length, line height, weight, readability, fallback behavior, script coverage, number formatting, and text expansion. |
| Navigation and flows | Information architecture, navigation depth, task sequence, progressive disclosure, search and filtering, back behavior, confirmation, and recovery. |
| Components and states | Design anatomy and behavior of controls, lists, cards, tables, dialogs, sheets, notifications, loading, empty, error, disabled, selected, and success states. |
| Motion and feedback | Purposeful transitions, continuity, progress feedback, interruption, reduced motion, and preservation of meaningful state. |
| Inclusive design | Contrast, focus visibility, keyboard and touch access, text scaling, semantic reading order, non-color cues, localization, and right-to-left considerations. |
| Platform adaptation | Responsive web, mobile web, iOS, and Android guidance with explicit platform applicability and units. |
| Content and trust | Labels, instructions, errors, consent, destructive actions, and avoidance of misleading or coercive interactions. |

Style names are discovery aids. A recommendation must also describe controllable visual properties so a user can refine a direction without selecting a fashionable label. Industry or product-category tags are weak context signals, not rules such as “finance must be blue.”

### What every entry contains

Each published entry must have a stable identifier, version, title, domain, guidance type, applicability, and independently authored explanation. It must also include:

- The user need or design problem it addresses, suitable conditions, contraindications, and tradeoffs.
- Relationships to compatible, conflicting, prerequisite, and alternative guidance.
- At least one concrete example and one misuse example, with platform adaptations where relevant.
- Source repository and exact file paths, pinned commit or release, license identifier and license text location, required attribution and notices, authorship or derivation status, modifications, retrieval date, and review status. Original records identify their author and corpus release instead of inventing upstream provenance.
- A classification distinguishing an external requirement, platform convention, design heuristic, and subjective preference.
- Any measurable checks, required inputs, exceptions, and limits on what those checks establish.

Color entries contain usable semantic roles and explicit pairings, not just swatches. Layout entries describe content priority and adaptation rules, not just a fixed screenshot. Style entries include composition, typography, color, and interaction implications.

### Illustrative original entry

**Pattern: Overview with progressive detail.** Suitable when people need to scan many objects and inspect one without losing their place. An expansive layout may show a list and detail region together. A compact layout may use a separate detail destination with reliable back navigation and restored list position. Preserve the same labels and priority information across both.

The tradeoff is reduced simultaneous comparison on compact screens. Avoid choosing the pattern when the primary task requires comparing many full records side by side. Pair it with a clear selection treatment and explicit empty-selection behavior. Review whether navigation preserves filters, scroll position, and unsaved edits.

This example illustrates the required depth of an entry; it is not an imported corpus record or a universal prescription.

### Curation and extensions

The proposed model has a bundled core corpus and project-specific additions. Project additions can express brand rules, forbidden treatments, preferred patterns, and intentional exceptions. Broader organization packs are a later extension.

Core entries move through draft, reviewed, published, and deprecated states. A named maintainer owns each release. Validation checks metadata, broken relationships, contradictory constraints, missing examples, and claimed numeric properties. Editorial review checks context, accessibility implications, source attribution, and stereotype-driven recommendations.

Corpus releases are versioned. Existing project decisions remain tied to their original evidence; a new corpus release produces suggested revisions and never silently redesigns a project. External material informs original summaries, with attribution and reuse terms recorded before any excerpts or assets are distributed.

## Open source sourcing and ingestion

### Corpus layers

1. **Foundations:** eligible color scales, semantic palettes, spacing, typography, shape, and motion values from open-source projects. Preserve source identities and units when normalizing them.
2. **Patterns:** insrc-authored layout and interaction guidance informed by eligible examples, including list/detail, navigation, onboarding, forms, and dashboards. Document applicability, tradeoffs, states, and platform adaptations.
3. **Style recipes:** original combinations of foundations and patterns, such as editorial, restrained enterprise, expressive consumer, and dense analytical directions. Each recipe includes compatible choices, original specimens, misuse examples, and web/mobile adaptations.

The sources supply ingredients and examples. insrc's editorial work supplies the reasoning that makes a combination useful for a particular audience and task. Framework-specific source code can inform design records without becoming a framework dependency or appearing in the user-facing design specification.

### Initial source candidates

The following repositories are the proposed starting collection, based on the source review on 11 October 2026. Repository licenses identify candidates; individual files and bundled assets must still pass the ingestion requirements before inclusion. No sources have been imported by this PRD.

| Source | Intended contribution | License and inclusion boundary |
| --- | --- | --- |
| [Open Props](https://github.com/argyleink/open-props) | Color, gradient, spacing, typography, shadow, border, aspect-ratio, and motion foundations. | [MIT](https://github.com/argyleink/open-props/blob/main/LICENSE); preserve notices for included material. |
| [Radix Colors](https://github.com/radix-ui/colors) | Color scales and palette foundations. | MIT repository; only import covered files. Color combinations still require validation in context. |
| [Material Color Utilities](https://github.com/material-foundation/material-color-utilities) | Palette generation and semantic color-scheme algorithms. | Apache-2.0 repository; retain applicable notices and modification records. This license does not establish reuse rights for the separate Material website. |
| [Carbon](https://github.com/carbon-design-system/carbon) | Grids, spacing, typography, color roles, themes, motion, and component examples. | Apache-2.0 repository; separately check any external documentation, fonts, or assets. |
| [US Web Design System](https://github.com/uswds/uswds) | Responsive layouts, forms, navigation, tokens, and accessible interface examples. | Primarily CC0, with third-party exceptions identified in its license file. Include only eligible portions. |
| [Fluent UI Apple](https://github.com/microsoft/fluentui-apple) and [Fluent UI Android](https://github.com/microsoft/fluentui-android) | Mobile component anatomy, color, typography, and interaction examples. | MIT repositories; referenced logos and icons have separate asset terms and are excluded unless independently eligible. |
| [daisyUI](https://github.com/saadeghi/daisyui) | Coordinated visual themes and component treatments. | MIT core repository; the listing does not authorize importing paid templates or separately distributed assets. |
| [Tabler](https://github.com/tabler/tabler) | Dashboard compositions, page layouts, forms, tables, and navigation examples. | MIT core; bundled dependencies retain their own licenses. Exclude ineligible dependencies, including chart assets not covered by an eligible license. |
| [Google Fonts](https://github.com/google/fonts) | Font families and metadata for typography specimens. | Per-family licenses, mostly SIL OFL, with Apache and Ubuntu Font License families also present. Verify each included family and any reserved-name conditions; write pairing guidance independently. |

Start with Open Props, Radix Colors, Carbon, USWDS, Material Color Utilities, and Fluent mobile for foundational coverage. Add daisyUI and Tabler for visual variety and composition examples, and selected eligible fonts for specimens. Source diversity must support design breadth without merging incompatible systems into an arbitrary universal style.

### Eligibility and attribution

Use an explicit source allowlist. The initial policy favors MIT, Apache-2.0, CC0, and eligible open font licenses, subject to the actual file terms. Unknown, absent, conflicting, or restrictive terms block distribution of the affected material until resolved. A new license category requires an explicit policy decision; repository visibility and an “open source” marketing label are insufficient.

Assess code, documentation, datasets, screenshots, fonts, icons, and other assets separately. Do not assume a repository's code license covers linked websites or third-party material. Preserve required license texts, copyright notices, attribution, and change notices alongside the distributed corpus and any exports that contain covered material. Rewriting or rendering an imported asset does not remove its provenance requirements.

External standards and public platform documentation may be cited as reference material. They do not enter the distributable corpus as copied text or assets without eligible reuse terms. Keep reference-only sources distinct from imported material in provenance records.

### Ingestion and update process

1. **Register a source.** Record repository, intended domains, supported platforms, owner, and an exact commit or release.
2. **Check eligibility.** Inventory candidate files and their licenses, exceptions, dependencies, and attribution requirements. Exclude ineligible files before extraction.
3. **Extract and normalize.** Convert eligible values and examples into framework-independent records while preserving semantic roles, units, source paths, and version lineage. Keep incompatible platform conventions explicit.
4. **Author guidance.** Add task fit, tradeoffs, compatible patterns, contraindications, states, and original specimens. Label inferred guidance and generated suggestions for review rather than presenting them as source-authored rules.
5. **Validate and review.** Check schema completeness, source links, relationships, measurable claims, and accessibility implications. A human curator reviews design quality and provenance before publication.
6. **Publish a versioned release.** Ship the corpus with a source manifest and required notices. Consumers can identify the release and source records behind each recommendation.
7. **Review upstream changes.** Compare pinned revisions, including license changes. Stage eligible updates for review, support rollback or withdrawal of affected records, and preserve historical attribution. Never silently change an approved project design system.

Acceptance: an unknown-license file is excluded; an eligible palette retains its source and notices through export; a source update does not overwrite approved design decisions; and imported material can be traced from a recommendation to its exact upstream revision.

## Functional requirements

### FR1 Capture a useful design brief

Resolve the project and requested UI types before gathering audience, recurring tasks, content types, brand constraints, desired character, accessibility needs, locales, and existing design assets. Support partial briefs and projects without an indexed repository. Do not require a page inventory or an implementation framework. Check for existing guideline sets before creating a draft.

Acceptance: “Create Web and Mobile-iOS guidelines for Atlas” produces two draft sets under Atlas from one shared brief, with only consequential platform differences clarified.

### FR2 Retrieve guidance with reasons

Support searches by task, style, layout, color role, platform, content density, and constraints. Filter inapplicable guidance before presenting recommendations. Return source identifiers, fit explanations, caveats, and useful alternatives. A gap in the corpus must be reported; a newly generated suggestion must be labeled as such and must not become a published corpus entry automatically.

Acceptance: the same task on desktop web and a compact mobile surface retrieves relevant shared guidance plus explicitly different platform guidance.

### FR3 Compose coherent design directions

Propose two or three meaningfully different project-level directions when creating guidelines or explicitly revising their direction. Routine page work retrieves approved guidelines and does not trigger this exploration. Each combines layout, hierarchy, type, color, imagery, shape, and interaction principles into one internally consistent proposal. Explain the effect on the user's task and the constraints that ruled out alternatives. Respect a request for one direction or for iteration on an existing choice.

Acceptance: alternatives differ in consequential design properties, not just accent color, and each traces its key decisions to brief constraints or corpus guidance.

### FR4 Persist guidelines by project and UI type

Persist one guideline identity per project and UI type, with independently versioned drafts, approved versions, and superseded history. Save semantic colors, typography roles, spacing, shape, elevation, imagery, motion, navigation, component rules, rationale, corpus versions, and documented exceptions. Keep one active approved version per pair.

When a preference conflicts with an applicable requirement, surface the conflict and propose a compatible alternative. Approved project choices take precedence over general corpus preferences, but do not erase accessibility findings. Shared decisions reused from another set retain their source version; updating one set must not change another silently.

Acceptance: Atlas can have active Web, Mobile-iOS, and Mobile-Android guidelines simultaneously. Approving Web version 2 preserves Web version 1 in history and leaves both mobile sets unchanged.

### FR5 Define reusable layout and interaction rules

Define layout families, content hierarchy, density, spacing, navigation conventions, component anatomy, and state behavior for recurring project needs. Include reusable rules for forms, lists, detail views, feedback, empty results, loading, validation, and recovery. Account for long content, localization, and interrupted tasks where relevant.

Representative examples illustrate how the rules work. Individual production pages and complete feature flows are not required outputs. The guidelines must support new pages without creating a page-specific design artifact in this workflow.

Acceptance: a dashboard, settings page, and checkout can all consume the same Web guideline version. No additional guideline creation, direction comparison, or approval is triggered solely because the page changes.

### FR6 Adapt across web and mobile

Produce separate Web, Mobile-iOS, and Mobile-Android guideline sets for the requested UI types. Reuse common brand and semantic foundations while specifying platform-appropriate rules in each set. Web coverage includes narrow and wide layouts, keyboard/pointer/touch input, focus order, and browser navigation. Mobile coverage includes iOS and Android distinctions, touch ergonomics, safe areas, software keyboard effects, back behavior, orientation, and text scaling. Tablet and other larger mobile windows must have explicit adaptation guidance.

Record platform-specific measurements with their units; do not treat CSS pixels, points, and density-independent pixels as interchangeable. Avoid inferring input method solely from viewport width. Mobile web remains a web surface even when its layout resembles a native app.

Acceptance: retrieving Atlas guidelines for Mobile-Android returns its Android rules and version, never a mobile-web or iOS substitute. Responsive mobile web resolves to the Web set; phone and tablet adaptations remain within the appropriate mobile set.

### FR7 Make designs inspectable

Initial outputs include lightweight palette and typography specimens, component-state examples, and representative layout wireframes for each guideline set. Use realistic sample content and relevant compact/expanded and light/dark variants. Link specimens to the guideline identity and version. They illustrate reusable rules and are not a commitment to design every production page.

Examples use lightweight specimen and wireframe fidelity; polished production-page mockups are outside the first-release scope. A preview must identify omitted interactions; a static image cannot establish keyboard behavior, assistive-technology support, or runtime responsiveness. The versioned guideline set remains the authoritative record.

### FR8 Review with evidence

Review draft guideline sets against the project brief, selected corpus guidance, existing approved decisions, and relevant platform guidance. Optional adherence checks compare downstream work against a named guideline version; they do not restart guideline creation. Each finding includes the affected element, evidence, severity or preference classification, suggested correction, and verification method.

Report results as verified, failed, needs inspection, or not applicable. Distinguish computed properties from visual observations and heuristic judgments. Calculate contrast for supplied color pairs; do not infer an exact ratio from an arbitrary screenshot. Do not assert complete accessibility conformance from a palette or image.

Acceptance: a seeded role-color conflict produces a traceable finding; an unobservable focus-order question remains “needs inspection.”

### FR9 Export and reuse design context

Resolve active guidelines by project and UI type and return a human-readable document plus a structured, framework-independent representation. Preserve guideline identity, version, approval status, source identifiers, semantic roles, platform rules, exceptions, and unresolved issues. Downstream work records the guideline version it used; an explicit historical-version request returns that version with its status.

Return a clear missing-guidelines result when no approved set exists. Never silently substitute another platform, promote a draft, or generate new guidelines for a page. Repeated retrieval is read-only and must not create drafts or approval requests.

Acceptance: three different Web pages retrieve the same active Atlas Web guideline identity and version. An Android request with no approved Android set reports the gap. The same guidelines can guide different implementation frameworks without changing their design meaning.

## Proposed guideline package

| Artifact | Contents |
| --- | --- |
| Project brief | Audience, recurring tasks, requested UI types, brand constraints, assumptions, and reference intent. |
| Direction comparison | Project-level alternatives, tradeoffs, supporting guidance, and selection rationale; produced during creation or explicit direction revision. |
| Guideline set for each UI type | Project and guideline identity, UI type, version, status, visual foundations, reusable layout and interaction rules, component principles, accessibility guidance, and exceptions. |
| Guideline specimens | Lightweight palette, typography, component-state, and representative layout examples tied to a guideline version. |
| Guideline review | Findings, evidence, corrections, and unresolved validation tasks for each set. |
| Decision and version history | Explicit approvals, accepted changes, rejected alternatives, source lineage, and superseded versions. |

Individual page designs and production flow specifications are downstream consumers of this package, not required artifacts of guideline creation.

## Relationship to insrc

Design intelligence should be available through insrc's agent-facing surface and participate in its tracked artifact lifecycle. Guideline creation and revision should support a project brief as well as optional structured project context. Routine downstream work only retrieves and applies the active guideline set for its project and UI type. Existing repository evidence may inform a design, but undocumented properties must remain inferences, and a missing repository must not block new-product design.

Implementation must preserve insrc's existing constraints: daemon-owned persistence accessed through IPC, local embeddings, cloud model access through the installed CLI providers, and high-capability reasoning for critical design and review decisions. This PRD does not select storage schemas, tool names, or module boundaries; those belong to subsequent technical design.

Design approval records an explicit user choice. A style preference response, generated specimen, or completed review must not be treated as approval of a guideline set. Approval identifies the exact set and version. Discovery and guideline retrieval remain lightweight; creating or revising guidelines uses the tracked lifecycle. Reading approved guidelines for another page does not require renewed approval.

## Quality and release acceptance

The proposed evaluation set contains eight independently authored project briefs, each exercised for Web, Mobile-iOS, and Mobile-Android, yielding 24 guideline sets. Each set is then applied to multiple representative page tasks covering discovery, search/list/detail, onboarding, booking, checkout, dashboard analysis, content reading, or settings. These tasks test guideline reuse; they are not separate creation workflows. Mobile web and tablet adaptation checks are included within the relevant sets. Fixtures include missing brand inputs, strict existing brand rules, long localized content, dark mode, large text, and conflicting preferences.

Release gates are proposed targets, not measured results:

- Every published corpus entry has provenance, applicability, examples, review status, and a valid version.
- Every incorporated external file has an eligible license and pinned revision; each corpus release includes its source manifest and required notices. Reference-only sources, ineligible dependencies, and project-private inputs are absent from the distributed corpus.
- Every required task/platform combination has relevant style, layout, color, and interaction guidance; coverage gaps are explicit.
- Every evaluated guideline package includes reusable rules, state coverage, and a traceable basis for its major decisions.
- Multiple pages for the same project and UI type resolve the same active guideline version without triggering creation or approval. Separate UI types resolve separate sets; missing sets are reported explicitly.
- Revising one set preserves prior versions, leaves other UI types unchanged, and never updates existing pages automatically.
- No evaluated recommendation has an unresolved known hard-constraint violation; corpus updates preserve approved project decisions.
- At least 80% of evaluated packages receive a human-review score of 4 or higher on a five-point rubric for task fit, coherence, clarity, and platform suitability. No package may average away a critical usability failure.
- Review detects all deliberately seeded measurable violations and makes no false claim of verification for behavior unavailable in its inputs.

Use a comparison against the same briefs with ordinary unguided prompting to assess whether the corpus improves consistency and reduces material redesign. Record review revisions and completion time as diagnostic measures. Human judgments should use a written rubric and adjudicate reviewer disagreements. Automatic scores alone do not establish aesthetic quality or usability.

## Delivery sequence

**First release:** a reviewed core corpus across all listed domains; project brief intake; UI-type selection; project-level direction comparison; creation, review, and approval of separate Web, Mobile-iOS, and Mobile-Android guideline sets; versioned retrieval for downstream work; explicit revision; and framework-independent export. Lightweight guideline specimens accompany the written guidelines.

Corpus delivery includes the source allowlist, eligibility checks, normalized foundations and patterns, original style recipes, provenance-preserving exports, release notices, and a reviewed update process. The source list is a starting collection, not a requirement to ingest every repository in full.

**Later expansion:** broader corpus coverage, organization packs, richer visual exploration, additional platforms, and optional design-tool integrations. Expansion must not delay web and mobile coverage into separate initial releases.

Before implementation, confirm the open product choices, complete the tracked specification and independent review, obtain explicit artifact approval, and route through insrc triage. No implementation estimate is committed by this PRD.

## Open product choices

1. **Project adaptation inputs.** Recommended: a brief and existing written design rules are sufficient; supplied screenshots are optional review/reference inputs. Deep extraction from design tools can follow later.
2. **Corpus ownership.** Recommended: insrc-maintained core plus project additions, with a named maintainer and release review. Confirm who will own editorial quality and future updates.

## References and guidance policy

[UI UX Pro Max](https://github.com/nextlevelbuilder/ui-ux-pro-max-skill) is the capability reference motivating this proposal. Its searchable design guidance and design-system generation inform the problem framing. This PRD does not adopt its code, datasets, taxonomy, or promotional coverage claims.

For accessibility rules, use versioned primary references and retain applicability and exceptions. For example, [W3C's explanation of contrast minimum](https://www.w3.org/WAI/WCAG22/Understanding/contrast-minimum.html) distinguishes normal and large text and identifies exceptions; a palette-level pass is insufficient to establish interface conformance. [W3C's explanation of target size minimum](https://www.w3.org/WAI/WCAG22/Understanding/target-size-minimum.html) should inform applicable web checks without being substituted indiscriminately for native platform guidance.

[Apple Human Interface Guidelines](https://developer.apple.com/design/human-interface-guidelines/) and [Material Design foundations](https://m3.material.io/foundations/) are reference-only sources unless specific content has verified eligible redistribution terms. The same eligibility check applies to copied standards text. Public readability does not establish an open-source license, and an open-source implementation does not license a separate documentation website. Referencing these sources does not require every product to adopt their visual styles. Source-linked guidance must preserve the distinction between an external requirement, platform convention, and an insrc-authored heuristic.
