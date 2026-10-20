# insrc Domain Ontology Builder PRD

Status: Draft for discussion. Not approved for implementation.

Date: 20 October 2026

## Product intent

Help engineers and their AI assistants understand what a platform represents across fragmented services, schemas, APIs, events, and documentation. Build a persistent, evidence-backed domain model above insrc's code index, then use it to explain business concepts, investigate changes, and inform design and review.

The core asset is a versioned map connecting domain concepts to their concrete representations. A customer may appear as a CRM contact, identity principal, billing party, and warehouse dimension. These representations can overlap without being interchangeable. The product must preserve those distinctions and expose disagreement rather than forcing everything into one universal schema.

The user has confirmed that ontology construction must reuse insrc's existing data and schema analysis tools. The ontology layer orchestrates and interprets that evidence alongside the code and document index; it must not build a parallel data analyzer or connector stack. Release boundaries, framework choice, and success targets below remain proposals for discussion.

## Problem and users

Code indexes explain implementation structure. Complex platforms also require semantic understanding: which names refer to the same business concept, where meanings differ, how identities are mapped, and which rules apply in each context. That understanding is usually spread across code, database definitions, contracts, documents, and people's explanations.

Primary users are engineers investigating unfamiliar systems, architects planning changes across services, and domain owners reviewing proposed interpretations. AI assistants consume the same model when answering questions or driving insrc's engineering workflow.

The initial product should answer questions such as:

- Where is customer identity represented, and which identifiers connect those representations?
- Do billing and authorization mean the same thing by an active subscription?
- Which services, fields, events, and documented rules may be affected if orders become tenant-scoped?
- Which parts of this answer are confirmed, inferred, disputed, or no longer supported by current sources?

## Goals and boundaries

The first release should create and maintain a useful model of one business domain across two or three services. It should connect concepts to source evidence, support explicit review, preserve local terminology, and improve a small set of domain questions and change investigations.

It is not a replacement for the code graph, a master data management system, an operational data warehouse, or a mechanism for automatically merging customer records. Ontology describes meaning; lineage records movement and transformation. The product links the two but does not treat semantic similarity as evidence of data flow.

Full OWL reasoning, arbitrary user-authored inference programs, enterprise-wide automatic discovery, production record ingestion, and a separate collaborative ontology editor are outside the initial release. New general-purpose database connectors and complete support for every API or event schema format are also outside it.

## Main user journeys

1. **Build a domain map.** A user selects a business domain, registered repositories, and eligible registered data connections. insrc uses its existing data analysis tools to discover objects, describe schemas, and investigate candidate relationships, joins the results to code and document evidence, then presents proposed concepts and mappings with explicit coverage gaps.
2. **Review meaning.** A domain owner accepts, revises, rejects, or disputes individual definitions and mappings. The interface shows the evidence and the consequences of accepting an equivalence. Accepted assertions become available to normal analysis.
3. **Ask a domain question.** An engineer asks where an order or entitlement is represented. insrc returns concepts, context-specific definitions, concrete representations, and source references. It distinguishes confirmed knowledge from exploratory suggestions.
4. **Investigate a change.** An engineer proposes a business change. insrc combines accepted mappings with code dependencies and observed lineage to produce possible impact paths, including their evidence and gaps. It does not claim exhaustive impact from partial coverage.
5. **Refresh after source changes.** Changed code, contracts, documentation, or schema snapshots identify affected assertions. insrc proposes a revision and flags stale evidence without silently replacing reviewed meaning.

## Product model

### Three connected layers

| Layer | Contents | Authority |
| --- | --- | --- |
| Observed structures | Code symbols, document sections, schema objects, contract fields, endpoints, and observed producer or consumer relationships. | The identified source revision or metadata snapshot. |
| Domain concepts | Definitions, preferred names, aliases, contextual variants, business relationships, lifecycle states, and constraints. | Explicitly reviewed assertions within a declared domain and context. |
| Mappings and evidence | Assertions connecting concepts to representations or to other concepts, with supporting and opposing evidence. | The assertion's review state, provenance, and freshness. |

Ontology assertions must remain distinct from parser-produced code edges. An LLM proposal must never become indistinguishable from a deterministic observation.

### Concepts and context

Each concept has a stable identifier, domain namespace, definition, labels, bounded context, version history, and optional owner. A label change does not change its identity. Renames, merges, splits, and retirement preserve redirects or explicit historical relationships; they must not discard prior references.

Two services may legitimately define different variants of Customer. A model can express a common broader concept while preserving the service-specific concepts. Domain membership does not grant access to additional repositories or data connections.

### Relationships and mappings

The initial vocabulary should distinguish:

- Concept relationships: broader, narrower, related, part of, and domain-specific relationships with explicit definitions.
- Concept mappings: close match, exact match within a declared scope, and explicit non-equivalence.
- Representation mappings: represented by, identifier field, state encoded by, and implements a constraint.
- Lineage relationships: derived from or transformed into, only when supported by an observed or reviewed transformation.

Concept-to-concept mappings and concept-to-code mappings have different semantics. Use SKOS mapping properties only for suitable concept mappings. Use an insrc vocabulary to link concepts to code symbols, tables, and contract fields. Do not equate a table or class with a business concept through `owl:sameAs`.

An exact concept match is stronger than a similar name or embedding match. It requires explicit review of definitions, identity scope, lifecycle, and known differences. The initial product must not automatically propagate exact matches through a chain of mappings. In particular, SKOS `exactMatch` is transitive; scoped or qualified insrc assertions must not be exported as unqualified SKOS triples that imply a broader equivalence. [SKOS reference](https://www.w3.org/TR/skos-reference/)

### Assertion provenance and state

An assertion records its subject, relationship, object, context, rationale, supporting and contradicting evidence, source revisions, extraction method, and reviewer history. Model-produced proposals also record the provider and model used. A retrieval score ranks candidates; it is not a calibrated probability that a mapping is true.

Review state and freshness are separate dimensions. Proposed, accepted, rejected, disputed, and superseded describe review state. Current, stale, missing-source, and unknown describe freshness. A source change can make an accepted assertion stale without erasing its history. Human-authored definitions may cite a recorded domain decision; they must not be described as observed code facts.

Use provenance concepts compatible with PROV-O for derivation and attribution, while retaining insrc-specific review metadata. Provenance describes how an assertion arose; it does not establish its truth. [PROV-O](https://www.w3.org/TR/prov-o/)

## Functional requirements

| ID | Requirement | Acceptance behavior |
| --- | --- | --- |
| OB01 | Select and inventory sources. | A run records repositories, source revisions, metadata snapshots, unsupported formats, exclusions, failures, and retrieval limits. |
| OB02 | Discover candidate concepts. | Proposals include definitions, bounded context, source references, alternatives, and reasons; names alone cannot establish equivalence. |
| OB03 | Map concrete representations. | A mapping identifies a specific source object and revision, its relationship to the concept, and known semantic differences. |
| OB04 | Review assertions. | Users can accept, revise, reject, dispute, and supersede assertions individually or in an explicit batch. No model can approve its own proposal. |
| OB05 | Validate the model. | Identity, reference, context, provenance, and supported shape constraints are checked before activation. Failure leaves the prior active version intact. |
| OB06 | Answer domain questions. | Default answers use accepted, current assertions and show evidence and coverage limits. Exploratory mode clearly separates proposals, disputes, and stale assertions. |
| OB07 | Explain possible impact. | Each reported path distinguishes semantic mapping, structural dependency, and lineage. Unsupported jumps and scope exclusions are visible. |
| OB08 | Refresh incrementally. | Changed or removed evidence identifies affected assertions and derived results. Refresh cannot reactivate rejected mappings or overwrite accepted meaning silently. |
| OB09 | Preserve history and recover. | Version comparison, rollback, merge and split history, and restart recovery preserve stable identities and review decisions. |
| OB10 | Exchange ontology data. | Export and import support a documented RDF profile and preserve assertion identity, provenance, state, and context. Unsupported constructs produce diagnostics rather than silent loss. |
| OB11 | Inform engineering work. | Analysis, design, and review can retrieve relevant accepted concepts and constraints with an ontology revision reference. Conflicts are surfaced rather than automatically resolved. |
| OB12 | Reuse the existing data analysis surface. | Discovery, schema inspection, profiling, lineage probes, and supported drift checks use the existing daemon tool or analysis runtime contracts. No ontology-specific connector, SQL executor, or alternative credential store duplicates them. |
| OB13 | Preserve tool evidence faithfully. | Each consumed result retains its tool or runtime identifier, run reference, connection and target, normalized inputs, capture time, source provenance, relevant revision or fingerprint, limits, sampling basis, and errors. |
| OB14 | Investigate structural candidates before semantic promotion. | A proposed identifier or relationship cites available PK/FK metadata and targeted existing profiling results, or states why those checks were unsupported or not run. Heuristic lineage and sampled shapes never become confirmed semantic facts automatically. |
| OB15 | Inspect the complete captured entity model. | Selecting an entity retains the summary inspector and offers a full-model view with all captured attributes, including non-key and nested fields, types, presence or nullability, defaults, constraints, relationships, and source provenance. Concept representations can be selected independently. Search reports visible versus captured counts; sampling, truncation, unsupported metadata, and freshness remain visible. |

Initial evidence inputs are indexed code and documents, selected repository contract files, and metadata from supported registered data connections. Contract extraction is a new capability where existing parsers do not provide the necessary detail. Unsupported sources must be declared, not filled in by model inference.

Start with schemas and metadata, then use targeted existing data analysis where a domain question needs more evidence. Profiling or shape inference can inspect values through the existing tools and access policies; the ontology does not become a store of production rows. Retain structural findings and aggregate results, and exclude unnecessary raw values from persisted ontology evidence and model context. A schema inferred by a driver remains marked inferred. Live schema snapshots record capture time and connection identity and do not pretend to be immutable repository revisions.

## Reuse of existing data and schema analysis

Ontology discovery must consume the existing tools' structured outputs and their failure and completeness information. Tools and planner runtimes are alternative existing entry points into the same capabilities, not layers that must both be invoked for every object. Choose the appropriate registered contract and reuse current daemon dispatch, driver capabilities, connection scoping, and access checks.

| Ontology construction step | Existing capability | Interpretation and limits |
| --- | --- | --- |
| Discover registered sources | `db_list_connections`; `data.discovery.connections` runtime | Enumerate the connections available within the selected repository scope. Registration does not imply every driver supports every probe. |
| Inventory representations | `db_sql_list_tables`, `db_kv_list_namespaces`, `db_file_list_files`; `data.discovery.objects` runtime | Seed tables, namespaces, collections, or file targets. Preserve enumeration limits and unsupported-family diagnostics. |
| Describe structure | `db_sql_describe`, `db_sql_list_indexes`, `db_kv_describe_namespace`, `db_file_describe`; `data.schema.table` runtime where supported | Extract columns or field paths, types, nullability, identifiers, and available PK/FK or index information. The table-schema runtime currently handles RDBMS and supported file drivers; KV uses its own tools. |
| Infer missing shape | `db_kv_sample_shape`, `db_file_sample_shape` | Reuse existing inference for sources without complete declared structure. Describe the sampling basis and retain field frequencies; absence from a sample is not proof that a field does not exist. Some namespace descriptions also sample values. |
| Investigate candidate relationships | `db_sql_anti_join`, `db_sql_functional_dependency`, and relevant `db_sql_aggregate`, `db_sql_distinct`, or file-family profiling tools | Investigate orphaned keys, determinants, state values, and cardinality hypotheses. Check per-driver support. The SQL anti-join is same-connection only; no new cross-source join engine is implied. Full-table results remain specific to their filter, time, and source consistency. |
| Connect data to code | `data_lineage` | Reuse candidate reader, writer, and ambiguous citations. Its current vector retrieval, literal-name filtering, and heuristic classification do not prove complete lineage or an exact transformation. |
| Detect supported drift | `data_schema-drift` | Reuse the existing Prisma expected-schema versus live RDBMS comparison. It does not cover arbitrary static schemas, KV, or file drift. For other sources, compare captured tool-result structure across runs and label the new ontology invalidation behavior separately. |
| Check applicable constraints | `data.adherence.check` runtime | Reuse checks against relevant documented constraints, retaining their evidence and qualifications. Ontology shape validation and semantic review remain separate responsibilities. |

These identifiers are grounded in the [database tool registry](../src/daemon/tools/builtins/db/index.ts), [data tools](../src/daemon/tools/builtins/data/index.ts), and [data analysis runtimes](../src/analyze/runtimes/data/index.ts). The PRD does not prescribe new tool argument shapes; orchestration must use their registered schemas at implementation time.

For example, a Customer domain run discovers a registered billing connection, lists its tables, describes `billing_party`, and records `party_id` and its declared relationships. It uses the existing lineage probe to find candidate code references and retrieves relevant domain documents. If an identity mapping remains ambiguous, it selects a targeted supported profile check. The ontology builder then proposes what those structures mean, with the exact evidence attached. An orphan count of zero supports referential coverage in that snapshot; it does not establish that two concepts are identical or share a lifecycle.

The new product work is evidence orchestration and normalization, domain concepts and contextual mappings, assertion review, versioned storage, invalidation, and retrieval. Schema introspection, database access, shape inference, and supported data probes remain owned by the existing data analysis system. No live database inspection is required merely to read or edit an already captured ontology version.

## Building and maintaining the model

The proposed flow is scope selection → existing data and schema analysis → code and document evidence correlation → candidate concepts and mappings → targeted existing probes for unresolved structural questions → assertion drafting → validation → human review → activation. Each probe must answer a specific evidence gap rather than exhaustively profiling every source. Deterministic metadata, sampled inference, and heuristic probes retain their separate evidence classifications; models suggest meaning and explain alternatives. Unsupported or conflicting mappings stay unresolved.

The initial interaction should run through the assistant and daemon, presenting a readable concept map and assertion list. Each concept should show its definition, context, concrete representations, sources, review state, and freshness. A user should be able to inspect a mapping without understanding RDF syntax. A dedicated graphical editor can follow once these interactions prove useful.

Refresh should reuse unchanged evidence and reviewed assertions. It should prioritize the domain being queried and yield to foreground code indexing. Provider calls remain sequential under the existing LLM abstraction. Explicitly record partial completion and allow cancellation and resumption.

## Graph visualization and VS Code interaction

Use Mermaid for the initial graph renderer. The repository already vendors Mermaid 10.9.1 and svg-pan-zoom 3.6.2 under `src/assets/docgen/`; the prototype reuses those local assets. Mermaid can render flowcharts as SVG from generated descriptions. Treat it as a view over ontology records, not the ontology store, validator, or editing model. [Mermaid usage](https://mermaid.js.org/config/usage.html)

Use flowcharts with labelled edges and context subgraphs to show concepts, technical representations, and mappings together. Shapes and text distinguish concepts from representations; badges and line styles distinguish review state from freshness. A focused neighborhood should be the default, with search, filters, selection, zoom, and a table alternative. Large graphs need explicit expansion or omission counts rather than an unreadable complete diagram. Class diagrams can later show type hierarchies and state diagrams can show lifecycle rules. [Flowchart syntax](https://mermaid.js.org/syntax/flowchart.html)

The proposed VS Code surface has an ontology explorer on the left, a graph or mapping table in the center, and an inspector on the right. Selecting a concept or mapping reveals its definition, bounded context, source evidence, originating data tool and snapshot when applicable, review state, and freshness. A source-analysis view explains which existing discovery, describe, profile, lineage, and drift steps produced the evidence and which were omitted. Editing changes structured fields in a draft; a semantic diff is reviewed before activation. Direct manipulation of Mermaid text or dragging an edge must not bypass assertion validation or review.

Keep Mermaid in strict security mode, escape source-derived labels, and use opaque generated node identifiers. Attach selection through controlled host event handlers after rendering, with an ID map and keyboard access; do not embed source-authored callbacks or URLs. The diagram's built-in click directives are restricted in strict mode. A VS Code implementation must also use local webview resource URIs and the extension's content security policy. Validate the vendored version before adopting newer Mermaid syntax. [Mermaid API](https://mermaid.js.org/config/setup/mermaid/interfaces/Mermaid.html)

The initial editor should support definition and context changes, mapping proposals, source inspection, review decisions, and explicit activation. It should preserve the active version while a draft is open. A graphical canvas with drag-to-connect editing, free positioning, or large-scale interactive graph exploration would require additional interaction and layout machinery; it is a later product decision.

The summary inspector must offer **View full entity model**. For a domain concept, the view includes its curated attributes and allows navigation to each mapped technical representation. For a field or representation node, it opens the containing model, not just the selected identifier. Show all captured fields with their metadata, relationships, constraints, and originating tool or source snapshot; provide attribute search and a structured source view. A full captured snapshot is not a claim of complete live-source coverage: inferred, sampled, truncated, missing, or stale metadata must remain explicit. Opening the view uses captured evidence and does not automatically query a database.

Review the [viewer mock](mocks/ontology-viewer.html) and [editor mock](mocks/ontology-editor.html). Both use fictional fixture data and local-only interactions. They demonstrate the proposed product behavior and do not connect to the daemon, validate with SHACL, or alter a repository ontology. The [HTML PRD](ontology-builder-prd.html) includes links to both.

### Example domain view

This fictional neighborhood illustrates the proposed rendering. The close-match assertion is a proposal, not an established equivalence.

```mermaid
flowchart LR
  C([Customer])
  subgraph Identity
    I([Identity principal])
    P[Principal.subjectId]
  end
  subgraph Billing
    B([Billing party])
    T[billing_party.party_id]
  end
  C -->|related| I
  C -->|related| B
  I -->|represented by| P
  B -->|represented by| T
  I -.->|close match proposed| B
```

## Open source framework recommendation

### Proposed initial stack

Use the **RDF/JS ecosystem**, starting with **N3.js** for RDF parsing and serialization and **Zazuko rdf-validate-shacl** for shape validation. RDF/JS provides interoperable interfaces; it is not an ontology builder by itself. insrc must own evidence extraction, candidate generation, contextual mapping, review, versioning, and maintenance.

| Component | Role and fit | Constraint |
| --- | --- | --- |
| [N3.js](https://github.com/rdfjs/N3.js) | MIT-licensed JavaScript RDF parser, writer, and in-memory store; supports Turtle, TriG, N-Triples, and N-Quads. Use for bounded interchange and validation projections. | It does not provide ontology discovery, governance, or an OWL reasoner. Its in-memory store is not the authoritative persistence layer. |
| [rdf-validate-shacl](https://github.com/zazuko/rdf-validate-shacl/tree/master/packages/shacl) | MIT-licensed JavaScript validator using RDF/JS datasets; fits the backend's ESM environment. | Its documentation explicitly excludes SHACL-SPARQL. Select and test the exact supported shape profile; do not promise complete SHACL coverage. |
| [SKOS](https://www.w3.org/TR/skos-reference/) | Standard vocabulary for concepts, labels, hierarchies, and concept mappings. | It does not express every business rule or insrc review policy. Qualified mappings need careful export semantics. |
| [PROV-O](https://www.w3.org/TR/prov-o/) | Standard vocabulary for provenance and attribution. | Assertion-level provenance and review lifecycle still need an insrc profile. |

SHACL validates graph conditions; passing validation does not prove that a proposed business interpretation is correct. Start with datatype, required-property, cardinality, and reference constraints in a tested profile. Unsupported constraints must fail explicitly. [SHACL specification](https://www.w3.org/TR/shacl/)

Licenses are recorded from the [N3.js license](https://github.com/rdfjs/N3.js/blob/main/LICENSE.md) and [validator package metadata](https://github.com/zazuko/rdf-validate-shacl/blob/master/packages/shacl/package.json). Final adoption requires checking the pinned packages and their transitive licenses, ESM and Node compatibility, test coverage, resource use, and maintenance status.

### Alternatives

| Option | What it offers | Proposed disposition |
| --- | --- | --- |
| [Apache Jena](https://jena.apache.org/about_jena/about.html) | A Java semantic-web framework with RDF, ontology APIs, rule-based inference, query capabilities, and storage options. Apache-licensed. | Best broader framework candidate if richer reasoning becomes a product requirement. A JVM and integration boundary add deployment work; it is not the initial default. |
| [OWLAPI](https://github.com/owlcs/owlapi) | Java APIs for OWL ontology manipulation, serialization, and integration with reasoners; Apache and LGPL licensing options. | Evaluate for formal OWL requirements. More specialized than the initial concept-mapping and evidence problem; a particular reasoner needs separate selection. |
| [Protégé Desktop](https://github.com/protegeproject/protege) | An existing ontology authoring application. | Useful as an optional expert authoring or inspection tool, not an embedded backend or substitute for insrc's evidence lifecycle. |
| [Comunica](https://github.com/comunica/comunica) | MIT-licensed JavaScript knowledge-graph query framework. | Defer. The initial product can use typed graph APIs and does not need a SPARQL engine. |

If a single comprehensive ontology framework is required, choose Jena for the evaluation. For insrc's initial Node-based product, prefer the smaller RDF/JS stack. Do not introduce Jena, OWLAPI, or Comunica solely because they are available; adopt them against a demonstrated requirement and representative evaluation.

## Architecture constraints

The daemon continues to own persistent graph, vector, and ontology access. Clients use IPC or MCP and never open the stores. Use the existing LMDB-backed graph as the proposed authoritative substrate, with ontology-specific records and indexes whose exact layout is a later design decision. RDF datasets are bounded projections for validation and interchange, not a second independently writable truth store.

Preserve dependency-closure scoping. Cross-service domains operate within the eligible registered repository closure and explicitly selected data connections. Ontology links cannot expand that closure; links outside it are reported as excluded or unresolved. Validate this boundary during lookup, inference, export, and refresh.

All LLM interaction uses `LLMProvider`; cloud access remains through `CliProvider`. Embeddings stay local. Critical semantic adjudication and validation use accuracy-appropriate model roles under the core floor; cheaper candidate retrieval cannot make equivalence decisions. No direct cloud REST provider is introduced.

Models receive structured evidence rather than raw repository dumps. Imports and linked vocabularies are treated as data, not instructions. Import must not execute embedded code or automatically fetch arbitrary remote resources; local, pinned dependencies keep validation reproducible.

Existing areas to inspect during design include [graph storage](../src/db/graph/store.ts), [typed traversal](../src/db/graph/traversal.ts), [document exploration](../src/analyze/explore/doc-mention.ts), and [data schema retrieval](../src/analyze/runtimes/data/schema-table.ts). The latter currently distinguishes driver families and schema provenance; it is not a universal metadata ingestion layer. These are integration candidates, not approved implementation contracts.

## Pilot and success criteria

Choose one domain across two or three services with an engineer and a domain owner who can establish a reference set. Include similar names with different meanings, different names with matching meanings, tenant-scoped identifiers, incompatible state models, and missing or conflicting documentation.

The following are proposed release gates, to be finalized against the pilot:

| Measure | Proposed gate |
| --- | --- |
| Accepted assertion provenance | Every accepted assertion has resolvable source evidence or an attributed human domain decision. |
| Exact equivalence | Every activated exact match has explicit human confirmation; no automatic equivalence chaining. |
| Suggested mapping precision | At least 95% precision on an independently reviewed set of at least 100 proposals; report relation-specific results and uncertainty. |
| Coverage | Report recall against the reference set and omissions by source family; high precision must not hide missing coverage. |
| Domain answers | At least 90% of 30 representative questions have correct supported conclusions or an appropriate explicit abstention; report coverage separately. |
| Freshness | All assertions dependent on changed or deleted evidence in controlled fixtures are marked for reconsideration before being served as current. |
| Isolation and recovery | No out-of-scope evidence appears in queries or exports; cancellation, restart, and rollback preserve accepted versions. |

Compare the same questions and impact investigations with the code index alone and with ontology context. Measure answer correctness, unsupported claims, important omissions, reviewer effort, and time to locate the relevant representations. Latency, memory, and refresh time must be measured on declared hardware and corpus sizes before setting performance targets. Accuracy takes precedence over a cheaper pipeline.

## Delivery sequence

1. **Validate the model and framework.** Establish the pilot reference set, assertion semantics, RDF export profile, supported SHACL constraints, and round-trip checks. Test scoped equivalence and provenance before committing to dependencies.
2. **Build a reviewed domain map.** Support source inventory, candidate concepts, representation mappings, explicit review, version activation, and basic retrieval.
3. **Maintain and apply the model.** Add evidence invalidation, incremental refresh, rollback, and use in domain questions, design, and code review.
4. **Expand after evaluation.** Add source formats, domain-specific constraints, richer lineage, and an editor where pilot results justify them. Revisit Jena or a reasoner only when the required semantics exceed the initial profile.

## Decisions still open

- Which real platform and business domain should provide the first reference set?
- Which registered connection families and existing data probes are required for the pilot, and which can use captured evidence instead of a fresh live inspection?
- Who may accept assertions: the current local user, named domain owners, or a later shared review model?
- Where should portable ontology definitions and review history live for team exchange, while keeping daemon projections disposable?
- Which domain relationships and constraint types are necessary for the first useful questions?
- Is formal logical reasoning required, or are contextual mappings, explicit constraints, and explainable traversals sufficient?
- Which subset of imported ontologies should be supported without losing context, review state, or provenance?

Implementation should enter insrc's tracked triage and design workflow after these product choices are sufficiently settled. This draft does not approve a framework dependency, storage migration, new tool contract, or build.
