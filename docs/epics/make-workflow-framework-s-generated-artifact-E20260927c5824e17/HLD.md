<!-- insrc:artifact HLD-c5824e17eccf0c14 -->

# HLD: Adopt a1: the artifact JSON body is the single source of truth for the new content, the existing per-type renderers are enriched to generate human-readable, audience-aware markdown from that structured body, and the three new adherence checks (functional-coverage, diagram, UX) are added as code-review dimensions that ride the existing computeReviewVerdict / codeReview

## Framework summary

Adopt a1: the artifact JSON body is the single source of truth for the new content, the existing per-type renderers are enriched to generate human-readable, audience-aware markdown from that structured body, and the three new adherence checks (functional-coverage, diagram, UX) are added as code-review dimensions that ride the existing computeReviewVerdict / codeReview.enforce completion gate without forking the verdict reducer. Diagrams and UX mocks are content-gated companion artifacts referenced from — never inlined into — the core markdown, produced through the existing docgen generateDocument seam. The four forward-only Stories layer cleanly: S001 introduces the functional-definition record + its coverage dimension; S002 makes every document navigable, audience-aware, and de-duplicated; S003 adds content-gated diagram companions; S004 unifies the selectable adherence dimensions and the UX-acceptance check.

## Architecture shape

Three collaborating layers, all extensions of shipped seams. (1) A MODEL layer: the artifact body types gain a structured FunctionalDefinition record (stable `<epicId>:FRxxx` ids, doc-level + per-item) and a document-structure model (sections/TOC/summary/references + upstream shared-context references), so prose is always generated from structure (k2) and shared context is referenced, not copied. (2) A RENDER layer: the per-type renderers under src/workflow/artifacts/ consume that model to emit navigable, audience-aware markdown; a content-gated assessment decides per document whether a diagram helps and, if so, drives docgen generateDocument to produce a Mermaid/HTML companion referenced from the body (k1, k3, k5); the same companion-reference mechanism carries UX-mock references. (3) An ENFORCEMENT layer: functional-coverage, diagram-adherence, and UX-acceptance are each a new ReviewDimension sibling under src/workflow/code-review/dimensions/, folded by finalizeCodeReview into the existing ReviewVerdict and read by approveWorkflowTarget — one gate, no fork (k4). The whole change is additive and forward-only (k6).

## Shared contracts

### sc1: FunctionalDefinition record (artifact body)

**Owner Story:** `s1`
**Consumed by:** `s2`, `s3`, `s4`

**Purpose:** The structured functional-requirement data carried in every artifact JSON body: discrete requirements with stable sequence-numbered ids, doc-level and per-item, from which the human-readable prose is generated. It is the source of truth the whole functional thread rides (k2).

**Interface sketch (type-level):**

```
type FrId = string; // `${epicId}:FR${nnn}`, sequence-numbered like stories/tasks, stable once assigned
interface FunctionalRequirement {
  readonly id: FrId;
  readonly statement: string;      // outcome-terms, reviewer-facing
  readonly rationale?: string;
  readonly scope: 'doc' | 'item';  // document-level or bound to a specific story/task
  readonly itemRef?: string;       // when scope==='item', the story/task id it belongs to
}
interface FunctionalDefinition {
  readonly requirements: readonly FunctionalRequirement[];
}
// additive on the existing artifact body:
interface ArtifactBodyFnDefExt { readonly functionalDefinition?: FunctionalDefinition; }
```

**Assumptions cited:** [[c2]]

### sc2: functional-coverage review dimension

**Owner Story:** `s1`
**Consumed by:** `s4`

**Purpose:** A code-review dimension that judges whether each functional requirement was genuinely realized by the build and contributes its finding to the existing verdict fold, so inadequate coverage withholds completion via the existing gate (S001 ac3, k4).

**Interface sketch (type-level):**

```
// additive union member; reducer (computeReviewVerdict/effectiveReviewVerdict) NOT forked
type ReviewDimensionExt = 'functional-coverage';
interface FunctionalCoverageExpectation {
  readonly frId: FrId;            // the requirement being checked
}
interface FunctionalCoverageOutput {
  readonly dimension: 'functional-coverage';
  readonly findings: readonly { readonly expectationRef: FrId; readonly severity: 'HIGH' | 'MED' | 'LOW' }[];
}
```

**Assumptions cited:** [[c4]]

### sc3: Document-structure + shared-context reference model

**Owner Story:** `s2`
**Consumed by:** `s3`, `s4`

**Purpose:** The per-type navigable document structure (overview/contents, summary, problem, references, per-item sections), audience tag, and the mechanism by which a document references shared upstream context instead of reproducing it verbatim — the readability + de-dup contract (S002, k1).

**Interface sketch (type-level):**

```
type Audience = 'business' | 'product' | 'technical';
interface SharedContextRef {
  readonly sourceArtifactId: string;  // upstream artifact whose section is referenced
  readonly sectionId: string;
}
interface DocumentSection {
  readonly id: string;
  readonly heading: string;
  readonly audience?: Audience;       // e.g. DEF summary tagged business/product
}
interface DocumentStructure {
  readonly toc: readonly DocumentSection[];
  readonly summary: DocumentSection;
  readonly problem?: DocumentSection;
  readonly references: readonly SharedContextRef[];
  readonly items: readonly DocumentSection[];
}
```

**Assumptions cited:** [[c2]]

### sc4: Companion-artifact reference

**Owner Story:** `s3`
**Consumed by:** `s4`

**Purpose:** The single contract for referencing an out-of-body companion file (a Mermaid/HTML diagram or a UX mock) from the core markdown, including its on-disk path scheme — so both diagrams (S003) and UX mocks (S004) attach the same way and stay out of the markdown body (k1).

**Interface sketch (type-level):**

```
type CompanionKind = 'diagram-mermaid' | 'diagram-html' | 'ux-mock';
interface CompanionArtifactRef {
  readonly kind: CompanionKind;
  readonly relPath: string;      // resolved via the existing path-scheme, sibling of the .md
  readonly title: string;
  readonly ofSectionId?: string; // the document section it illustrates
}
// the core markdown links these; a renderer never inlines their content
```

**Assumptions cited:** [[c8]]

## Story boundaries

### Story E20260927c5824e17:S001

**Owns:** `sc1`, `sc2`

Private to S001: the exact FR-id sequence-numbering/assignment scheme and its stability guarantee, the internal shape and validation of the FunctionalDefinition body extension, how the functional-definition prose is generated from the record, and the provider prompt/schema by which the functional-coverage dimension judges genuine realization. None of these internals are consumed by other Stories — they only see the sc1 record shape and the sc2 dimension result.

### Story E20260927c5824e17:S002

**Owns:** `sc3`
**Depends on:** `sc1`

Private to S002: the concrete per-type section layouts and renderer formatting that turn the structure into navigable markdown, the audience-tailoring rules that gear the DEF to a business/product reader, and the diffing/resolution that replaces verbatim upstream copy with a SharedContextRef. Other Stories consume only the DocumentStructure/section contract, not these formatting internals.

### Story E20260927c5824e17:S003

**Owns:** `sc4`
**Depends on:** `sc1`, `sc3`

Private to S003: the per-document assessment that decides whether a diagram materially aids understanding, the selection of docgen docType and the generateDocument invocation that produces the Mermaid/HTML companion, and the diagram-adherence dimension's check that a referenced diagram is present and consistent with the design. S004 consumes only the companion-reference contract (sc4), not the diagram-generation internals.

### Story E20260927c5824e17:S004

**Depends on:** `sc1`, `sc2`, `sc3`, `sc4`

Private to S004: the multiselect adherence enum (UX, Diagram:Sequence/ER/Component, FR-coverage) and its per-work-item recording, the uxAcceptance flag and when it is required, the UX review dimension's judgement of the built experience against the referenced mock, and how the recorded adherence set is read by the completion check. S004 is the terminal Story and exposes no contract others consume; it unifies the dimensions S001/S003 contribute and the structure/companion contracts from S002/S003.

## Non-functional targets

- **Performance:** Generation adds at most one extra provider call per document, and only when the content-gate assesses a diagram (or an audience rewrite) is warranted — documents needing neither pay nothing. All added LLM/generation calls are serial (never Promise.all over a provider), per the project convention.
- **Security:** No new external surface and no direct cloud REST: all content and diagram generation goes through the local CliProvider/Ollama and the existing docgen seams (k5). Companion files are written under the artifact's own directory via the existing path-scheme, introducing no new write locations outside the docs tree.
- **Observability:** The new adherence findings are recorded as DimensionFindings in the existing code-review record and surfaced through the existing review report; generation attribution (which model produced each output) rides the existing meta attribution stamping.
- **Durability:** Forward-only (k6): the change applies to newly generated artifacts and migrates nothing on disk. FR ids are stable once assigned so the functional thread stays traceable across regenerations, and companion artifacts are stored as sibling files referenced from the durable markdown, not embedded in it.

## Rollout

### Phase A — functional-definition spine

**Stories:** `s1`

S001 owns the foundational contracts sc1 (FunctionalDefinition body record) and sc2 (functional-coverage dimension) that every later Story consumes, so it must land first. It establishes the FR-id scheme and the structured body extension the render and enforcement layers build on.

**Backward compat:** The FunctionalDefinition body field is additive and optional; artifact types and existing generated documents that carry no functionalDefinition must render byte-identically to today, and the functional-coverage dimension must be absent-safe (no FR record => contributes nothing to the verdict).

### Phase B — readable, audience-aware, de-duplicated documents

**Stories:** `s2`

S002 depends on S001 (consumes sc1) and owns sc3 (the document-structure + shared-context reference model). It enriches the per-type renderers to emit navigable, audience-aware markdown and to reference upstream context instead of copying it.

**Backward compat:** Renderer output changes shape here; keep the change additive per artifact type and ensure a document with no shared-context references or audience tags still renders a complete, valid body. Existing on-disk artifacts are not migrated (k6).

### Phase C — content-gated design diagrams

**Stories:** `s3`

S003 depends on S002 (consumes sc3) and S001 (consumes sc1) and owns sc4 (the companion-artifact reference). It adds the per-document diagram-usefulness assessment, the docgen-driven companion generation, and the diagram-adherence dimension.

**Backward compat:** Diagram inclusion is content-gated and never mandatory (k3); a document the assessment judges needs no diagram must be unchanged from Phase B output. Companion files are new sibling files referenced from the body, never inlined (k1).

### Phase D — UX integration + unified adherence

**Stories:** `s4`

S004 is terminal: it depends on all prior contracts (sc1, sc2, sc3, sc4) and owns no contract others consume. It unifies the selectable adherence dimensions (UX, diagram kinds, FR-coverage), adds the UX review dimension and uxAcceptance, and references UX mocks through the sc4 companion mechanism.

**Backward compat:** The uxAcceptance check is required only when a work item is flagged as having a user-facing experience; work with no UX surface must complete exactly as before, and the adherence recording must default to empty/no-op so non-UX, non-diagram work is unaffected.

**Ordering rationale:** The phases follow the Epic's strictly linear dependency chain S001→S002→S003→S004 and the shared-contract ownership from the framework: sc1/sc2 (owned by S001) are consumed by every later Story so Phase A is first; sc3 (owned by S002) is consumed by S003 and S004 so Phase B precedes both; sc4 (owned by S003) is consumed by S004 so Phase C precedes Phase D; S004 owns nothing downstream and consumes all four contracts, so it lands last. No phase consumes a contract owned by a later phase.

### Risky bits

| Area | Why | Mitigation |
| :--- | :--- | :--- |
| Renderer regression across all artifact types (Phases A–B) | Enriching the per-type renderers and body types touches the largest surface (define/hld/lld/plan) and could change the rendered output of artifacts that carry no new FR/structure data. | Keep every body extension optional and additive, and add golden-output tests that assert an artifact with no functionalDefinition/structure/companion data renders identically to the pre-change baseline for each type before enriching it. |
| New adherence dimensions blocking legitimately-unrelated work (Phases A, C, D) | The existing code-review gate has a preserved contradiction about whether an absent record blocks completion; a mis-scoped new dimension could withhold completion for work with no FRs, no diagram, or no UX surface. | Make each new dimension strictly absent-safe and pin the exact withhold semantics against the real approveWorkflowTarget behaviour in each Story's LLD (per the s1 backFlowNotes), with tests for the no-FR / no-diagram / no-UX paths completing unchanged. |
| docgen reuse assumptions for diagrams (Phase C) | The docType enumeration was inferred from reader filenames under a low-confidence analyze anchor; the actual registered docTypes and the generateDocument contract were not verified directly. | The S003 LLD must verify the InMemoryDocTypeRegistry's registered docTypes and the generateDocument signature directly against source before designing the diagram-generation call, rather than relying on the inferred list. |

## Alternatives considered

### a1: Structured-body model + renderer enrichment + review dimensions — **CHOSEN**

Grow the artifact JSON body with the functional-definition record and adherence spec, enrich the existing per-type renderers to emit human-readable prose from that structure, and add the new checks as code-review dimensions.

The artifact JSON body becomes the single source of truth for the new content: a structured functional-definition record with stable FR ids, an adherence spec, and references to any companion diagram/mock. The existing per-type renderers are enriched to render that structure into a consistent, navigable, audience-aware markdown body and to reference rather than copy shared upstream context; prose is always generated from the structured record (k2). Diagrams are content-gated at generation time via docgen generateDocument, kept out of the core markdown (k1, k5). The three new adherence checks are each a code-review dimension folded by finalizeCodeReview, binding findings via DimensionFinding.expectationRef and riding the existing computeReviewVerdict / codeReview.enforce gate without forking the reducer (k4).

**Pros:**
- Honours k2 directly — the FR record lives in the artifact JSON and prose is generated from it, so there is one source of truth and no prose/JSON drift.
- Reuses every seam the analyze confirmed already exists (per-type renderers, docgen generateDocument, the dimension/orchestrator pattern, approveWorkflowTarget), so no new subsystem and no new gate.
- Each of the four Stories maps to a distinct, independently-testable surface, matching the forward-only S001→S004 chain.
- New checks inherit the existing block/warn/pass semantics and override path verbatim.

**Cons:**
- Touches all four per-type renderers plus the shared body types — the largest surface of the three.
- The generation-time diagram assessment adds one provider call per document that warrants a diagram.
- Requires care that enriching renderers does not regress existing output for artifact types carrying no FR/UX/diagram data.

**Cost estimate:** L

### a2: Post-generation transform + lint pipeline over rendered markdown

Leave the renderers largely as-is and add a post-processing pass that restructures/de-duplicates the rendered markdown, extracts functional requirements from prose, and lints adherence as a gate.

A post-generation stage rewrites the produced markdown: it injects a TOC/summary, diffs the body against upstream documents to strip verbatim duplication, and rephrases the framing document for a non-technical audience. Functional requirements are recovered by parsing the rendered prose into a derived index, and a separate assessor decides where a diagram would help. Adherence is enforced as a lint/gate step layered after rendering; the renderers and their body types stay mostly untouched.

**Pros:**
- Smallest change to the existing renderers, lowering regression risk on shipped output.
- One central transformation layer to evolve readability rules.
- Diagram generation and the lint gate are separable and testable in isolation.

**Cons:**
- Violates k2: functional requirements are recovered FROM prose, making the prose the de-facto source of truth.
- Parsing structure back out of rendered markdown is lossy and brittle.
- Audience-aware DEF content cannot be reliably reverse-engineered after rendering.
- Two representations (rendered prose + derived index) must be kept consistent.

**Cost estimate:** M

**Rejected because:** Violates the load-bearing invariant k2: recovering functional requirements by parsing rendered prose makes the prose the de-facto source of truth (exactly the drift k2 forbids), audience-aware framing cannot be reliably reverse-engineered after rendering, and its post-render lint risks a parallel gate (k4 partial). Rejected on the constraint that matters most.

### a3: Template-owned format + shared companion-artifact service + FR data model

Move document structure into per-type templates loaded by the repo-override-aware template loader, fill slots from a structured body incl. the FR record, and generate diagrams/UX companions through one shared companion-artifact service.

Format lives in per-type templates resolved by the existing repo-override-aware loadTemplate: each artifact type gets a template defining its layout, and the renderers become slot-fillers injecting structured body data (including the FR record and adherence spec). De-duplication is expressed by templates referencing shared upstream sections. A single shared companion-artifact service wraps docgen generateDocument for diagrams and carries UX-mock references; the adherence checks remain code-review dimensions reading expectations declared in template + body model.

**Pros:**
- Format changes become template edits, overridable per-repo through the existing loadTemplate seam.
- One companion service centralizes docgen reuse and the no-cloud-REST guarantee (k5).
- Cleanest 'templates own format, model owns content' split while keeping FR structured (k2).

**Cons:**
- Introduces a template layer for artifact types that render in code today — a larger render-path refactor than a1.
- Template + slot-filler must stay in lockstep; a mismatch is a new failure mode.
- Widens the daemon template loader's responsibility and blast radius.

**Cost estimate:** L

**Rejected because:** Meets every constraint as well as a1 but pays a larger up-front cost: it converts in-code renderers into a template-plus-slot-filler pair, widens the daemon template loader's responsibility, and introduces a template/model lockstep failure mode that a1 does not have. Strong runner-up — preferable only if per-repo format overrides become a first-class requirement later.

## Citations

- **[[c2]]** `prior-artifact` `.insrc/artifacts/SPEC-46b20c2f0459e807.json` — "Approved brainstorm SpecArtifact: FR source of truth is structured JSON with prose generated from it; core documents stay well-structured MD; diagrams are content-gated referenced companion artifacts;"
- **[[c4]]** `code` `src/config/config-catalog.ts:90` — "codeReview.enforce boolean default false — enforce a blocking code-review verdict at Story completion (off ⇒ advisory); approveWorkflowTarget(req,{enforce}) at gates.ts:617-685 is the completion gate "
- **[[c5]]** `analyze-bundle` `insrc_analyze: per-type artifact renderers, gates, path-scheme, template-loader, code-review dimensions (s1)` — "Per-type renderers under src/workflow/artifacts/ (define.ts:86, hld.ts:105, lld.ts:282, plan.ts:97); approveArtifactByJsonPath in gates.ts; resolveArtifactMdPath in path-scheme.ts; loadTemplate in dae"
- **[[c8]]** `code` `src/docgen/registry.ts` — "docgen: InMemoryDocTypeRegistry (registry.ts), generateDocument (index.ts), DocumentIR (types.ts:76), extract/ readers, src/assets/docgen/mermaid.min.js — the reuse seam for content-gated companion di"

<!-- insrc:review -->

## Review

### ✅ Review `PASS` — design.epic (design.epic)

**0 HIGH · 0 MED · 7 LOW** · model `client` · reviewed 2026-09-27T14:58:24.287Z

| Ref | Kind | Severity | Fixability | Premise | Evidence | Action |
| --- | --- | --- | --- | --- | --- | --- |
| sc2 | citation | LOW | manual | The ReviewDimension union and a DimensionFinding type with an expectationRef field exist in src/workflow/code-review/types.ts — the seam a new adherence dimension extends. | grep resolves ReviewDimension and expectationRef in the code-review type surface — the extension seam a new adherence dimension plugs into exists. sc2 holds. | No change — verified against source. |
| architectureShape | citation | LOW | manual | A finalizeCodeReview fold exists that folds dimension findings into a review report. | grep 'finalizeCodeReview' resolves (4 hits) — the fold that assembles dimension findings into the review report exists. | No change — verified against source. |
| sc2 | citation | LOW | manual | The verdict reducer computeReviewVerdict (src/workflow/review/review.ts) and the gate-read effectiveReviewVerdict (src/workflow/review/resolve.ts) exist and are the block/warn/pass reduction that must not be forked. | grep resolves computeReviewVerdict (9) and effectiveReviewVerdict (16) — the block/warn/pass reducer and gate-read that the HLD says must not be forked both exist. | No change — verified against source. |
| sc4 | citation | LOW | manual | The docgen reuse seam exists: generateDocument (src/docgen/index.ts) and InMemoryDocTypeRegistry (src/docgen/registry.ts). | grep resolves generateDocument (50) and InMemoryDocTypeRegistry (13) — the docgen reuse seam for content-gated companion diagrams exists. sc4 holds. | No change — verified against source. |
| architectureShape | citation | LOW | manual | The completion gate approveWorkflowTarget exists in src/workflow/gates.ts and takes an enforce option — the gate the new dimensions ride. | grep 'approveWorkflowTarget' resolves (50 hits incl. gates.ts) — the additive completion gate the new dimensions ride exists. | No change — verified against source. |
| architectureShape | inventory | LOW | manual | The four per-type renderers exist under src/workflow/artifacts/: renderDefineMarkdown, renderHldMarkdown, renderLldMarkdown, renderPlanMarkdown. | grep resolves all four per-type renderers (renderDefineMarkdown, renderHldMarkdown, renderLldMarkdown, renderPlanMarkdown) under src/workflow/artifacts/ — the render surface the RENDER layer enriches exists. | No change — verified against source. |
| rolloutOverview | ordering | LOW | manual | The Story dependency chain and phase order are strictly linear and acyclic: S001→S002→S003→S004, with each shared contract owned by a Story that all its consumers transitively depend on. | The HLD's storyBoundaries declare depends s2→[sc1], s3→[sc1,sc3], s4→[sc1,sc2,sc3,sc4] with contract owners s1(sc1,sc2)/s2(sc3)/s3(sc4); every consumer is transitively downstream of its owner along the linear S001→S002→S003→S004 chain — acyclic, no forward reference. Ordering claim holds. | No change — dependency/ownership graph is acyclic and consistent. |
