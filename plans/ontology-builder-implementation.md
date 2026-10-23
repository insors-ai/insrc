# Ontology builder implementation plan

Status: Proposed epic scopes. No implementation or dependency adoption approved.

Date: 23 October 2026

## Outcome and planning boundary

Deliver the [Domain Ontology Builder PRD](../docs/ontology-builder-prd.md) ([HTML](../docs/ontology-builder-prd.html)) as a sequence of independently reviewable epics. The product connects business concepts to fragmented code, schemas, contracts, and documents while preserving context, evidence, human decisions, and freshness.

This is a program-level roadmap, not a story execution plan or a set of approved workflow artifacts. Epic identifiers below are planning labels. Each scope must enter tracked triage and definition before detailed design and build; scope assessment may extend an existing epic instead of creating a duplicate.

Automatic repository proposals are required: successful registration schedules construction after indexing; subsequent indexed updates schedule incremental proposals. Domain selection and datastore connections are optional enrichments, not prerequisites. Generation never activates assertions.

The first useful release is one reviewed domain map across two or three services, inspectable in the IDE and usable for evidence-backed domain questions. Incremental maintenance and engineering-workflow integration follow. All seven epics are included in the roadmap; richer reasoning, additional source formats, and free-form graph editing remain later expansion.

## Build decision — 23 October 2026

Build an insrc-owned ontology framework. Keep construction, assertion semantics, evidence, metadata, validation orchestration, lifecycle, change plans, refresh and retrieval in insrc. Qualify focused RDF/JS parsing/validation libraries without adopting Open Ontologies or another comprehensive runtime. The [Open Ontologies evaluation](../docs/evaluations/open-ontologies/README.md) remains evidence and design reference; its earlier adapter recommendation is superseded. No binary installation/distribution story is part of this plan.

## Shared boundaries

- The daemon owns ontology persistence and access. CLI, MCP, and IDE clients use IPC; mirrored contracts must remain compatible across the backend and IDE repositories.
- Use the existing LMDB graph as the proposed authoritative substrate. RDF/JS datasets are bounded validation and interchange projections, never a separately writable store. Final record/index layouts belong in design.
- Discovery, describe, shape inference, profiling, lineage probes, and supported drift checks reuse existing data tools and runtimes. Do not add an ontology connector stack, credential store, or SQL executor.
- Every source and query respects registered repository membership, dependency-closure scoping, and eligible selected data connections. A semantic edge cannot grant access to an excluded source.
- Separate observed facts, sampled or heuristic evidence, model proposals, and human decisions. Review state and freshness are independent dimensions.
- Use the existing LLM abstraction, CLI cloud providers, local embeddings, sequential provider calls, and accuracy-appropriate model roles. Models cannot approve their own proposals.
- Mermaid is a rendered view over structured records. Editing a diagram cannot bypass validation, semantic review, or explicit activation.
- The usage-accounting and APM discussions are separate initiatives; neither is a prerequisite for this roadmap. Existing provider/model attribution is required for model-produced ontology proposals.

## Epic map

| Epic | Outcome | Depends on | Primary PRD coverage |
| --- | --- | --- | --- |
| ONT1 — Semantic contracts and framework qualification | A tested domain/assertion model, validation profile, and pilot reference set | None | OB05, OB21, OB22; semantic foundations for OB02–OB11 |
| ONT2 — Evidence acquisition and captured entity models | Reproducible, scoped evidence from existing analysis capabilities | ONT1 evidence contract | OB01, OB12, OB13, OB14; capture portion of OB15 |
| ONT3 — Versioned ontology and review lifecycle | Durable drafts, review decisions, atomic activation, history, and safe interchange | ONT1 | OB04, OB05, OB09, OB10, OB23, OB24 |
| ONT4 — Evidence-backed domain construction | Resumable candidate generation and reviewed domain-map construction | ONT2, ONT3 | OB02, OB03, OB16, OB18; orchestration of OB01, OB12–OB14 |
| ONT5 — IDE viewer, full-model inspector, and editor | Branded graph/table exploration and structured review/editing | ONT3 contracts; ONT2 snapshots; ONT4 for live proposals | OB04, OB15, OB19, OB20, OB22–OB24; presentation of OB01–OB05 |
| ONT6 — Incremental refresh and evidence invalidation | Source changes make dependent knowledge visibly stale and safely refreshable | ONT2–ONT4; ONT5 for presentation | OB08, OB09, OB17, OB18; freshness for OB06–OB07 |
| ONT7 — Domain retrieval, impact, and workflow adoption | Accepted knowledge improves questions, change investigation, design, and review | ONT3–ONT4; ONT6 for maintained release | OB06, OB07, OB11, OB25–OB27; end-to-end evaluation |

These are delivery boundaries, not seven isolated subsystems. ONT1 publishes shared contracts, ONT2 owns evidence capture, ONT3 owns ontology state, ONT4 proposes meaning, ONT5 presents and edits it, ONT6 maintains freshness, and ONT7 consumes it.

## ONT1 — Semantic contracts and framework qualification

**Goal:** Establish the meaning of ontology records and the limits of validation before building discovery or persistence around them.

Proposed stories:

1. Select the pilot domain and establish an independently reviewed reference set across two or three services. Include conflicting names, aliases, tenant-scoped identity, incompatible lifecycle states, and incomplete documentation.
2. Define stable domain/module/category/tag identities, assignment provenance, multi-membership, unclassified values, taxonomy rename behavior, and manual-versus-inferred authority. Define stable concept, representation, assertion, evidence, and snapshot identities; domain namespaces and bounded contexts; review states; freshness states; and source-revision semantics. Specify human-authored decisions and opposing evidence.
3. Define the relationship vocabulary and safe equivalence rules. Distinguish concept matches, representation mappings, structural dependencies, and observed lineage. Preserve explicit non-equivalence and prevent automatic exact-match chaining.
4. Qualify pinned N3.js and rdf-validate-shacl packages for the supported Node/ESM environment, licenses, resource use, and required validation behavior. Record adoption or rejection with evidence; this roadmap does not adopt dependencies.
5. Define immutable evaluation manifests and explicit accepted/proposed/context/freshness projections. Define structured validation outcomes (pass/fail/unsupported/incomplete/not-checked), finding identity/path/evidence and activation policies. Add contamination fixtures proving proposed/historical data cannot satisfy accepted-current checks.
6. Define a bounded RDF interchange profile, assertion-level provenance compatible with PROV-O, appropriate SKOS use, and supported SHACL constraints. Specify diagnostics for unsupported constructs and prohibit remote dependency fetching during import/validation.

Deliverables: shared schemas and semantic decision record, validation fixtures, interchange fixtures, pilot reference set, and framework qualification results.

Exit criteria:

- Identical labels in different contexts remain distinct; renaming preserves identity.
- Scoped equivalence cannot become an unqualified transitive SKOS equivalence during export.
- Validation distinguishes structural validity from semantic correctness and rejects unsupported constraints explicitly.
- Round-trip fixtures preserve assertion identity, provenance, review state, context, and freshness, or report unsupported content before activation.

**Boundary:** No production persistence, automatic discovery, OWL reasoner, or universal business-rule engine.

## ONT2 — Evidence acquisition and captured entity models

**Goal:** Produce a faithful, reusable evidence inventory without duplicating the existing data-analysis system.

Proposed stories:

1. Integrate connection setup through the [connection-management PRD](../docs/connection-management-prd.html), reusing existing backend and IDE Data Sources capabilities. Expose absent, unreachable, and unsupported connections; code-only ontology construction must still proceed. Add domain-run source selection and scope checks for registered repositories and eligible connections. Record revisions, snapshot times, enumeration limits, exclusions, unsupported families, and failures.
2. Normalize existing discovery and describe outputs into evidence records. Reuse connection/object discovery, SQL/KV/file descriptions, indexes, and supported PK/FK metadata through their registered contracts. A tool and a runtime are alternative entry points, not mandatory duplicate probes.
3. Capture entity-model snapshots containing all returned attributes: nested paths, non-key fields, types, nullability/presence, defaults, constraints, relationships, and provenance. Preserve sampled frequencies, truncation, and unsupported metadata; captured completeness is distinct from live-source completeness.
4. Correlate indexed code and document references with source objects. Add bounded contract-file extraction only for the pilot formats missing from existing parsers, with explicit unsupported-format diagnostics.
5. Orchestrate targeted existing shape, anti-join, functional-dependency, aggregate, and lineage probes for specific evidence gaps. Respect driver capability limits, same-connection restrictions, sampling basis, and the heuristic nature of current lineage results.
6. Preserve tool/runtime identity, normalized inputs, run reference, source target, capture time, revision/fingerprint, limits, errors, and evidence classification. Persist structural findings and necessary aggregates rather than production rows or unnecessary raw values.

Deliverables: source inventory, normalized evidence/snapshot contracts, pilot source adapters over existing tools, and deterministic captured fixtures.

Exit criteria:

- A mixed-source inventory reports partial and failed coverage without inventing missing metadata.
- Candidate keys and relationships retain declared versus sampled versus heuristic classifications.
- Full entity snapshots include non-key and nested fields when returned by the source capability; omissions have explicit reasons.
- Reading a captured model requires no live database call. No out-of-scope evidence enters capture or correlation.

**Boundary:** Evidence describes structures; it does not establish semantic equivalence. New generic connectors, cross-source join engines, and arbitrary schema-format coverage are excluded.

## ONT3 — Versioned ontology and review lifecycle

**Goal:** Make reviewed ontology state durable, recoverable, and safe to consume.

Proposed stories:

1. Design and implement ontology-specific records/indexes under daemon ownership, isolated from parser-produced code edges. Establish additive IPC contracts for drafts, versions, assertions, evidence references, and selected projections.
2. Implement assertion transitions: propose, revise, accept, reject, dispute, and supersede. Preserve reviewer identity/history and explicit batch membership. Review authority must be resolved before production activation is enabled.
3. Produce a persisted semantic activation plan covering concepts, mappings, metadata, affected assertions/constraints and known downstream effects, with explicit missing analyses and explained risk. Bind approval to base/candidate/source-manifest/profile hashes; stale inputs require a fresh plan. Treat assertion patches as explicit operations, never full-replacement input. Validate and atomically activate a draft against its base revision. Detect concurrent or stale edits; validation failure preserves the prior active version. Define transaction, restart, and idempotency behavior.
4. Add explicit protection of reviewed definitions, mappings and metadata; automatic/interactive batch operations propose conflicts, and deliberate unprotection/revision is attributed and reviewed. Protection cannot suppress freshness or contradiction reporting. Implement version comparison, historical lookup, rollback, rename/merge/split/retirement history, and reference preservation. Rollback must not make stale or missing evidence current again.
5. Implement import/export against ONT1's profile, with loss diagnostics and scoped source checks. Imported assertions enter a draft and do not gain accepted status merely because the file labels them accepted; define authority-preserving restore separately.
6. Define portable team exchange versus disposable daemon projections. Resolve the PRD's storage/exchange question without assuming the separate usage-sharding proposal applies to ontology records.

Deliverables: persistence and lifecycle contracts, daemon service, client-facing operations, history/interchange support, and recovery tests.

Exit criteria:

- Activation preview reports effects and unperformed checks; changed base/candidate/evidence invalidates approval, and a fragment patch cannot remove omitted entities. Required failed/unsupported/incomplete checks block or require an explicitly permitted attributed exception.
- Protected values survive refresh/import/batch operations while stale evidence and conflicts remain visible.
- Drafts and proposals cannot appear as active accepted knowledge.
- Two concurrent activations cannot silently overwrite each other; interrupted operations recover without duplicate decisions.
- Human decisions remain attributable and source changes do not erase review history.
- Round-trip and rollback preserve identity; unauthorized or out-of-scope content cannot be activated or exported.

**Boundary:** This epic supplies lifecycle operations; candidate generation and the visual editor consume them in later epics.

## ONT4 — Evidence-backed domain construction

**Goal:** Turn captured evidence into explainable proposals and a first reviewed domain map.

Proposed stories:

1. Add a daemon-owned automatic repository builder, triggered by successful registration after relevant code/document indexing settles. Build proposed concepts and mappings from eligible repo entities without requiring a domain selection or datastore connection; report unclassified entities and evidence gaps. Add a resumable build-run orchestrator: select scope → inventory → correlate evidence → propose concepts/mappings → investigate gaps → validate → present for human review → explicitly activate.
2. Propose domain/module/category metadata from structured source evidence and reviewed classifications, retaining rationale and explicit alternatives. Avoid promoting path/name heuristics into business facts. Generate context-specific concept definitions, aliases, concrete representations, and relationship proposals using structured evidence. Include alternatives, rationale, known differences, and contradictory evidence; retrieval scores remain rankings rather than truth probabilities.
3. Select targeted ONT2 probes where structural uncertainty matters. Record checks not run or unsupported. An orphan-free identifier relationship cannot automatically establish concept identity or lifecycle compatibility.
4. Present assertion-level decisions through assistant/MCP/IPC surfaces backed by ONT3. Preserve rejection and dispute history across reruns; no model-generated transition can accept its own proposal.
5. Retain provenance and alternatives for inferred classifications and mappings. Generate explainable proposals without confusing LLM rationale with deterministic derivation or calibrated confidence.
6. Add durable queueing, bounded progress, cancellation, checkpoints, restart/resume, and evidence reuse. Deduplicate registration and indexing events by effective input manifest (including uncommitted content and extraction-profile versions), serialize per-repo publication, and coalesce newer input. Provider calls remain sequential and background work yields to foreground indexing.
7. Expose queued/waiting-for-index/building/proposed/partial/failed/canceled/up-to-date states, pending changes and retry/cancel actions. Handle partial or failed indexing explicitly, prevent stale results overwriting newer input or manual drafts, and cancel/prevent publication when registration or scope is removed.

Deliverables: domain construction workflow, proposal artifacts, review handoff, and a captured pilot domain map.

Exit criteria:

- Registration automatically creates a code-only proposal after indexing, with or without connections. Repeated unchanged registration/events produce no duplicate proposals; no automatic run accepts or activates assertions.
- Each proposal links to exact captured evidence and identifies its semantic context and unresolved gaps.
- Partial runs are visibly partial and resume without duplicating assertions or resetting human decisions.
- A domain owner can accept a subset while leaving other mappings proposed, disputed, or rejected.
- The resulting active map passes validation and the first independent pilot assessment.

**Boundary:** Construction proposes meaning; it does not merge production records or assert complete lineage.

## ONT5 — IDE viewer, full-model inspector, and editor

**Goal:** Let users inspect and review the model without requiring RDF knowledge.

Use the [viewer mock](../docs/mocks/ontology-viewer.html) and [editor mock](../docs/mocks/ontology-editor.html) as interaction references. They are fictional local prototypes, not implemented daemon integration. Follow insrc styling, including its icon placement and theme conventions.

Proposed stories:

1. Add a searchable entity directory with daemon-side indexed queries, bounded cursor pages, stable ordering and revision pinning. Search labels, aliases, IDs and paths; facet by repo/context/kind/review/freshness before returning counts. Lazy-load grouped navigation, disambiguate duplicate labels, cancel obsolete requests, and preserve selection/filters/scroll with breadcrumbs and back/forward history. Add focused graph/table views with explicit hop/node/edge budgets and on-demand neighbor expansion; never render the whole project graph.
2. Render structured records through the existing vendored Mermaid assets. Use strict mode, escaped labels, opaque IDs, controlled host selection handlers, local webview resources, and the IDE content security policy. Expose a usable table/failure state when graph rendering fails.
3. Add the summary inspector for concepts, representations, and mappings, showing context, evidence, review state, freshness, and originating tool/snapshot. Display source-analysis steps and omitted or unsupported checks.
4. Implement **View full entity model** alongside the summary. Include all captured fields and metadata, nested/non-key attributes, constraints, relationships, search with visible/captured counts, and structured source data. Paginate or virtualize attributes and relationships; search all captured fields across pages and support nested-path navigation. Let users switch a concept's representations; selecting a field opens its containing model. Keep coverage/freshness qualifications visible and do not trigger a live query merely by opening it.
5. Add manual domain/module/category/tag assignment and evidence-backed suggestion review (use/override/reject), with explicit draft activation and previewable batches over fixed selected sets. Add metadata facets/grouping/search without changing entity kind or scope. Add structured draft editing, mapping proposals, evidence inspection, review actions, semantic diff, and explicit activation using ONT3. Preserve the active version while editing; reject stale-base writes and validate host messages.
6. Present scoped validation summaries and per-entity/path corrections, activation consequence previews, protection indicators and conflict/unprotection actions. Never reduce skipped checks to a green badge.
7. Integrate the actual client owner(s) through additive mirrored IPC contracts. Confirm whether the initial surface ships in `vscode-plugin/`, the separate IDE fork, or both before committing implementation stories to a repository.

Deliverables: integrated viewer/editor, full-model inspector, source-analysis presentation, and UI validation fixtures.

Exit criteria:

- Large-set fixtures cover duplicate names, deep paths, high-degree nodes, zero matches, stale search responses and page boundaries. Results/attributes mount bounded rows; search spans the full scoped corpus, counts respect access scope, and graph expansion obeys budgets. Measure performance on declared corpus sizes rather than treating synthetic mocks as a benchmark.
- Clicking a graph/table entity selects the same record and retains access to summary and full model.
- Every captured field is reachable; search and pagination do not imply omitted fields are absent from the source.
- Source-derived labels cannot execute script, callbacks, or arbitrary navigation.
- Review/edit actions use daemon validation and lifecycle rules; the diagram cannot bypass them.
- Graph failure, empty/partial evidence, missing sources, stale versions, and keyboard-only navigation have usable states.

**Boundary:** No drag-to-connect canvas, free positioning, or direct Mermaid-text editing as the domain authoring format.

## ONT6 — Incremental refresh and evidence invalidation

**Goal:** Keep accepted meaning distinguishable from evidence that has changed or disappeared.

Proposed stories:

1. Subscribe to indexed add/change/rename/delete and relevant connection/snapshot changes; debounce and coalesce incremental jobs using the durable ONT4 builder. Treat Git pulls and reindexing through effective indexed changes, not Git HEAD alone. Index assertion-to-evidence dependencies and invalidate affected assertions/derived results when indexed source revisions or captured schema fingerprints change, disappear, or become unavailable.
2. Reuse existing supported Prisma/live-RDBMS drift checks. Add ontology snapshot comparison for other captured structures as a separate capability; do not claim the existing drift tool covers all drivers or contract formats.
3. Re-enrich proposals when connections are added/updated or snapshots change, without making them a prerequisite for code-backed proposals. Connection removal invalidates affected evidence; there is no implied continuous live-schema watcher. Implement targeted refresh, checkpoint/resume, unchanged-evidence reuse, and scheduling that prioritizes queried domains and yields to foreground code work. Define freshness policy for live sources where no watcher exists.
4. Track derived-assertion premise dependencies as early-follow-up inference support is added; retracted premises invalidate derived results. Preserve explicit protection flags and surface conflicting evidence even for protected records. Preserve manually reviewed metadata, assignment history and rejected suggestions during refresh; propose conflicting classifications instead of overwriting them. Generate reviewable revisions while retaining accepted definitions and rejection history. Mark newly discovered evidence conflicts; never silently reactivate a rejected mapping or replace accepted meaning.
5. Present freshness/change diffs and affected mappings in assistant and IDE surfaces. Ensure rollback and historical queries retain the distinction between the selected ontology version and current source availability.

Deliverables: invalidation indexes, refresh orchestration, freshness policies, reviewable deltas, and source-change fixtures.

Exit criteria:

- Controlled changed/deleted evidence makes all dependent assertions unavailable as current before normal retrieval serves them, even while generation is queued. Updates automatically create incremental proposals and never activate them.
- Changes arriving during a run produce a successor or supersede obsolete work; obsolete input cannot publish over newer input. Restart resumes durable work, while repository removal prevents further publication.
- Unobserved live-source changes are represented through capture-time/expiry policy, not a promise of continuous detection.
- Cancellation and daemon restart preserve the active version and resume pending work safely.
- Accepted stale assertions remain auditable, and refresh cannot erase a rejection or promote a proposal automatically.

**Boundary:** General-purpose change-data capture and production row monitoring are excluded.

## ONT7 — Domain retrieval, impact, and workflow adoption

**Goal:** Demonstrate that maintained ontology improves engineering conclusions over the code index alone.

Proposed stories:

1. Add scoped typed retrieval for concepts, representations, constraints, and assertion neighborhoods. Default to accepted/current knowledge; explicit exploratory mode separates proposed, disputed, and stale records. Pin the consumed ontology revision.
2. Integrate domain questions with analysis and return supporting evidence, conflicting interpretations, coverage limits, and explicit abstention where evidence is insufficient.
3. Combine semantic mappings with code dependencies and supported lineage for possible-impact explanations. Label every edge's basis and show exclusions and unsupported jumps; avoid exhaustive-impact claims from partial coverage.
4. Supply relevant accepted definitions/constraints to design and review contexts through existing framework extension points. Record the consumed revision and surface conflicts without automatic adjudication.
5. Add versioned competency questions with human-reviewed expected claims/abstentions and evidence requirements. Before relevant activation, compare baseline/candidate outcomes and attach changed/lost-support results to ONT3 plans. Expectations cannot auto-update; define blocking/exception policy.
6. Add bounded deterministic derivation explanations with premise IDs, rule/profile versions and source revisions, separate from model suggestions. Report cycle/resource/completion limits and invalidate dependents when premises change.
7. Later, verify support preservation for structured claims in bounded retrieval projections; report supported/lost/unknown/not-checked and expand or abstain within scope and budgets. Do not claim general natural-language answer equivalence.
8. Run the PRD pilot comparison against the code-index-only baseline, publish measured accuracy/coverage/reviewer effort/resource use, and document operations, failure recovery, and supported limits.

Deliverables: retrieval and analysis integration, explainable impact paths, workflow context integration, evaluation report, and release documentation.

Exit criteria retain the PRD's proposed gates until pilot owners explicitly revise them:

- Every accepted assertion has resolvable evidence or an attributed human decision, and every activated exact match has explicit human confirmation.
- At least 95% mapping precision on at least 100 independently reviewed proposals, with relation-specific results, uncertainty, and recall reported separately.
- At least 90% of 30 representative domain questions produce supported conclusions or appropriate abstention; answer coverage is reported separately.
- Controlled freshness, scope isolation, cancellation, restart, and rollback checks pass. Correct answers cannot compensate for cross-scope leakage or lost review history.

**Boundary:** Formal OWL reasoning, arbitrary inference programs, enterprise-wide automatic discovery, and blanket guarantees of complete impact remain excluded.

## Enhancement release boundaries

- **First release (M0/M1):** scoped evaluation manifests and explainable validation (ONT1), semantic activation plans and protected definitions/metadata (ONT3), proposal provenance (ONT4), corresponding inspector/review presentation (ONT5). Consequence reporting states coverage and does not pretend competency checks or full reasoning already ran.
- **Early follow-up (M2/M3):** versioned competency-question regressions and deterministic inference explanations (ONT7), connected to ONT3 activation plans and ONT6 premise invalidation. Pilot reference questions are authored in M0; automated regression gating arrives here.
- **Later extension after M3:** consequence-aware retrieval (ONT7 follow-up stories) evaluated against explicit derivations. Independently checked reasoning certificates require a separately justified future design and are not a prerequisite for this roadmap.

## Delivery sequence and milestones

| Milestone | Included scope | Release gate |
| --- | --- | --- |
| M0 — Qualified foundations | ONT1 | Pilot, semantics, evidence contract, focused-library qualification, scoped validation/interchange fixtures agreed |
| M1 — Reviewed domain map | ONT2–ONT4; ONT5 viewer, summary/full-model inspection and basic review | Registration automatically yields repo proposals without connections; duplicate events/restart are safe; one domain built across two or three services; evidence inspection, explicit acceptance, consequence preview, protected assignments, scoped validation, atomic activation, scoped retrieval and recovery demonstrated |
| M2 — Maintained authoring experience | Remaining ONT5 editing and ONT6 | Indexed updates and connection enrichment automatically yield incremental proposals; structured edits/diffs and source-change refresh preserve decisions, active versions, and freshness |
| M3 — Engineering adoption | ONT7 | Baseline comparison and all applicable pilot release gates pass; operational limits documented |

After ONT1 contracts are settled, ONT2 and ONT3 can progress independently against fixtures. ONT5 presentation can begin with captured fixtures once contracts stabilize; full integration waits for ONT3/ONT4. ONT7 retrieval can begin against fixed versions after M1, but production claims of maintained knowledge depend on ONT6. Pilot evaluation is established in M0 and repeated at each milestone rather than postponed to M3.

Do not assign calendar estimates until source families, client ownership, and story sizes are resolved. Keep individual epics releasable behind explicit feature enablement; partial delivery must not imply all PRD requirements are implemented.

## Design decisions and owners to establish

| Decision | Resolve by | Required output |
| --- | --- | --- |
| Pilot domain, reference questions, domain owner and independent reviewers | ONT1 definition | Named pilot owners and reference corpus |
| Supported source/contract formats, connection families and permitted probes | ONT2 design | Capability matrix and exclusions |
| Review authority, concurrent edits, portable history and team exchange | ONT3 design | Authority and storage/activation contracts |
| Supported relationship/constraint and RDF import profiles | ONT1 qualification | Tested profile and explicit unsupported semantics |
| IDE client repository, IPC contract ownership and compatible rollout | ONT5 definition | Backend/client delivery boundaries |
| Live snapshot freshness, refresh scheduling and missing-source behavior | ONT6 design | Observable policy and invalidation contract |
| Retrieval budgets and performance targets | ONT7 pilot evaluation | Measurements on declared hardware/corpus sizes |

## Enhancement validation gates

Test accepted/proposed contamination, incompatible context unions, skipped/unsupported validators, explicit waivers, stale plan hashes, patch-versus-replacement input, protected-but-stale assertions, batch protection conflicts, and rejection persistence. Follow-up tests must detect a reference answer losing its evidence, prevent automatic expectation edits, trace derived facts to versioned premises, invalidate derivations on deletion and distinguish LLM suggestions. Retrieval extension tests include a high-coverage projection missing the single critical premise. Formal certificate claims require independent checker execution; none is implied by unit tests or shape conformance.

## Validation and tracking

Use isolated temporary stores, captured tool fixtures, and fake providers for deterministic testing. Validate semantic edge cases, source-family limitations, scope isolation, lifecycle concurrency, hostile import/labels, failed activation, restart recovery, and rejected-mapping persistence. Cover registration without connections, duplicate registration/index events, partial indexing, rapid updates during a run, uncommitted source changes, provider outage/retry, connection enrichment/removal, repository removal, and proposal-only publication. Run affected test subsets and builds per implementation story. Live sources/providers require existing opt-in gates and sequential calls. UI work additionally needs rendered Mermaid, selection, full-model coverage, validation/consequence previews, protection/conflict states, theme, and accessibility checks in the target host.

Before each epic's build, drive triage and the routed definition/design workflow turn by turn. Review DEF/HLD/LLD artifacts before explicit user approval; complete each built story with independent code review. This roadmap grants no artifact approval and creates no GitHub issues.

| Planned epic | Tracking status | Formal artifact |
| --- | --- | --- |
| ONT1 | Proposed scope | Not created |
| ONT2 | Proposed scope | Not created |
| ONT3 | Proposed scope | Not created |
| ONT4 | Proposed scope | Not created |
| ONT5 | Proposed scope | Not created |
| ONT6 | Proposed scope | Not created |
| ONT7 | Proposed scope | Not created |

Update this table with actual returned artifact paths when tracked definitions are created. Do not treat planning labels as workflow IDs or approval records.
