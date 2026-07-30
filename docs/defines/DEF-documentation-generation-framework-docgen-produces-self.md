<!-- insrc:artifact DEF-870ed3dd246225f4 -->

# Epic: The structural and behavioural knowledge this system already extracts from a codebase — which entities exist, how types relate to one another, which modules depend on which, and how control flows through a use case — is reachable today only by interrogating the running system one question at a time through interactive tooling.

**Flavor:** new-capability

## Problem

The structural and behavioural knowledge this system already extracts from a codebase — which entities exist, how types relate to one another, which modules depend on which, and how control flows through a use case — is reachable today only by interrogating the running system one question at a time through interactive tooling. There is no way to obtain a durable, shareable, visual account of a repository that a developer can open cold, hand to a reviewer, or keep next to the code. Anyone who needs to understand or explain a subsystem must therefore re-run exploration by hand, or fall back on prose documents that were written once and drift from the code they describe, so onboarding, design review, and architecture/deployment discussions all proceed without a current, evidence-backed picture of the system. The gap is total rather than partial: capability discovery over the indexed code found no module that produces developer documentation in any form, and the only near-neighbours in the whole retrieval are two low-level primitives whose concerns merely overlap.

## Non-goals

- **Replacing or deprecating the interactive analyze / graph-query surfaces as the way to answer ad-hoc questions about a codebase** — Those surfaces answer targeted questions on demand; this Epic covers durable published documentation. Both are needed, and folding one into the other would widen scope without serving either audience.
- **Hosting, serving, or publishing the generated documentation — no docs site, web server, CI publish step, or versioned docs portal** — The stakeholder ask is explicitly for self-contained offline output per document [[c6]]; distribution is a separate concern with its own infrastructure and access-control questions.
- **Authoring or maintaining the existing hand-written documents under design/ and docs/** — Those are human-authored narrative artifacts. Generated output must stand alongside them, and taking over their content would mix a generation problem with an editorial one.
- **Making deployment, HA, or security decisions about how the system should be deployed** — That problem is already owned by the approved deployment-design Epic, which would consume generated documentation rather than contain the capability [[c8]].
- **A user-facing diagram authoring surface — hand-written diagram sources, an editor, or round-tripping user edits back into generated output** — The value here is that content is derived from indexed code and stays true to it; accepting hand-authored input reintroduces exactly the drift the Epic exists to remove.
- **Raster image output or any rendering that depends on an external service at view time** — Ruled out by the stakeholder ask (scalable inline vector only, never embedded raster) and by the local-first / no-cloud-REST project rule [[c6]] [[c7]].
- **IDE-side presentation — sidebar panes, viewers, or workbench contributions for the generated documentation** — The IDE fork owns workbench contributions; this repo's contract stops at the exposed tool/IPC/MCP surface [[c10]].

## Assumptions

- `high` No existing module provides any part of this capability, so the work is net-new rather than an extension: the reuse-check evaluated five candidates and returned zero clear matches, with the two partials (src/mcp, src/mcp/build-step) being integration seams rather than reusable logic. [[c1]]
- `high` The highest-scoring partial candidate holds no docgen entry point at all — the diagnostic symbol-locate step could not anchor on any exported symbol in src/mcp because its module profile returned an empty exports array — so partial-match status rests on file-level evidence only. [[c12]]
- `med` The indexed graph already carries enough structure — entities with inheritance/composition relations, module-level DEPENDS_ON, and a CALLS graph — that class, component/dependency, and call-sequence content can be derived deterministically without an LLM. [[c9]]
- `med` Narrative content that is not recoverable from the graph alone (use-case sequences, deployment topology) requires an LLM pass, and the existing role-routing / prompt path is the intended route for it. [[c6]]
- `med` An existing Mermaid CDN metadata primitive can be reused or extended to supply the renderer runtime rather than writing new Mermaid plumbing from scratch. [[c3]]
- `med` An existing rendered-artifact HTML type already models a self-contained rendered artifact and should be inspected before new artifact-HTML plumbing is written, since its concerns overlap. [[c4]]
- `low` The existing artifact-render path in the build step emits output artifacts in a structurally consistent way and is an integration point for document emission, though it exports no diagram or docgen types today. [[c11]]
- `high` The work decomposes into at least five distinct slices — deterministic graph→DSL generation, LLM narrative generation, the self-contained document renderer, asset shipping, and tool+IPC+MCP exposure — which is why it is sized L rather than the M the analyze pass suggested. [[c5]]
- `med` There is at least one internal consumer already waiting: the approved deployment-design Epic needs deployment topology and connectivity rendered, and would consume this capability's output. [[c8]]
- `low` Some graphs will exceed what the primary renderer can lay out legibly, so a fallback rendering path is expected to be needed for large graphs rather than being speculative. [[c6]]

## Constraints

| ID | Type | Text | Source |
| :--- | :--- | :--- | :--- |
| `k1` | convention | No direct cloud REST calls from this process. Any LLM-derived documentation content must go through the local provider or the CLI-subprocess provider; direct REST providers must not be reintroduced. | [[c7]] |
| `k2` | invariant | The daemon owns all database access. Diagram content sourced from the graph or vector stores must be read inside the daemon; CLI, MCP, and the IDE reach it only over IPC. | [[c10]] |
| `k3` | convention | Accuracy is primary and cost is the least priority: where a cheaper generation path would make the documentation less faithful to the code, the accurate path wins. | [[c14]] |
| `k4` | contract | The capability must be exposed three ways — as a tool registered against the daemon tool registry, as an IPC method, and as an MCP tool — consistent with how existing capabilities are surfaced. | [[c6]] |
| `k5` | contract | Each generated document must be a single standalone offline file with its runtime inlined, with scalable vector output only and no embedded raster images and no view-time network dependency. | [[c6]] |
| `k6` | convention | Generated documents must match the existing self-contained design/*.html pattern already used in this repo rather than introducing a second document convention. | [[c13]] |
| `k7` | convention | Non-TypeScript runtime resources ship through copy-assets.mjs from src/assets; any inlined renderer runtime or template must be delivered that way. | [[c15]] |
| `k8` | invariant | Structural diagram content must be derived deterministically from the indexed graph — entity rows and edge properties via the graph codec, module DEPENDS_ON/import edges, and the CALLS graph — with the LLM confined to narrative content. | [[c9]] |
| `k9` | stakeholder | External diagram renderers (D2, Graphviz) are permitted only as spawned-subprocess fallbacks for graphs that outgrow the primary renderer; the self-contained inline-vector path stays the core. | [[c6]] |
| `k10` | convention | The two existing Mermaid/rendered-HTML primitives must be inspected and reused or extended before any new Mermaid-CDN or artifact-HTML plumbing is written — they are the only entities in the entire retrieval touching these concerns. | [[c2]] |
| `k11` | invariant | No raw file dumps: document content is built from structured entity summaries and relations drawn from the graph, so every path and symbol shown is graph-backed rather than hallucinated. | [[c10]] |

## Stories

### E20260730870ed3dd:S001 — Obtain a shareable type-structure document for a chosen part of the repository

**User value:** `size: L`

A developer can produce one file that shows how the types in a subsystem relate to each other, open it cold, and hand it to a reviewer — instead of re-running interactive exploration question by question.

**Extends:** [[c3]] [[c4]]

**Acceptance criteria:**

- **ac1:** Given a repository that is registered and has finished indexing, and a developer who has chosen a part of it to document, when the developer requests a type-structure document for that scope, then a document is produced whose diagram shows the types in that scope together with the inheritance and composition relationships between them, with every type and every relationship taken from the indexed code rather than restated prose. _(operationalizes `k8`, `k11`)_
- **ac2:** Given a produced type-structure document, when it is opened on a machine with no network access and nothing else installed, then the whole document renders on its own, showing scalable vector diagram content with no raster images and no request made off the machine at view time. _(operationalizes `k5`)_
- **ac3:** Given a diagram whose content is larger than the visible area, when the reader zooms in and pans around it, then the diagram stays sharp and readable at every zoom level, with labels legible rather than pixelated. _(operationalizes `k5`)_
- **ac4:** Given the repository's existing self-contained documents, when a generated type-structure document is placed alongside them, then it follows the same single-file document convention as those documents rather than establishing a second, parallel convention. _(operationalizes `k6`, `k10`)_
- **ac5:** Given a caller outside the daemon asking for a document whose content lives in the indexed stores, when the document is generated, then all reads of the indexed content happen inside the daemon and the caller receives only the finished document, never direct access to the stores. _(operationalizes `k2`)_
- **ac6:** Given a chosen scope that contains no types, when a type-structure document is requested for it, then the request reports that the scope is empty and why, rather than producing a document with a blank or misleading diagram. _(operationalizes `k11`)_

### E20260730870ed3dd:S002 — Obtain a component/dependency document showing how modules depend on one another

**User value:** `size: M`

Someone reviewing or onboarding onto the system can see, in one durable picture, which parts of the repository depend on which — the question that today requires repeated manual interrogation.

**Depends on:** `s1`

**Acceptance criteria:**

- **ac1:** Given an indexed repository and a chosen module or the repository as a whole, when a developer requests a component/dependency document, then the document's diagram shows the modules in scope and the direction of dependency between them, and every dependency drawn corresponds to a dependency relationship recorded in the indexed code. _(operationalizes `k8`, `k11`)_
- **ac2:** Given the same repository documented twice with no code change in between, when the two component/dependency documents are compared, then they show the same modules and the same dependency edges, because the content is derived from the indexed code rather than freshly narrated each time. _(operationalizes `k8`, `k3`)_
- **ac3:** Given a module that depends on nothing and is depended on by nothing, when it appears in the requested scope, then it is shown as an isolated participant rather than silently dropped from the picture. _(operationalizes `k11`)_
- **ac4:** Given a produced component/dependency document, when it is opened offline, then it renders as a single standalone file with scalable vector diagram content and zoom and pan available, matching the repository's existing document convention. _(operationalizes `k5`, `k6`)_

### E20260730870ed3dd:S003 — Obtain a call-sequence document tracing control flow from a chosen entry point

**User value:** `size: M`

A developer explaining or reviewing a use case can show how control actually moves through the code from a given starting symbol, evidenced by the indexed call relationships rather than recalled from memory.

**Depends on:** `s1`

**Acceptance criteria:**

- **ac1:** Given an indexed repository and a chosen entry-point symbol, when a developer requests a call-sequence document for it, then the document shows the ordered sequence of calls outward from that entry point, with each participant identified by its indexed location and name, and every step corresponding to a recorded call relationship. _(operationalizes `k8`, `k11`)_
- **ac2:** Given an entry point whose call relationships form a cycle or recursion, when the call-sequence document is generated, then generation terminates and the repetition is shown as such, rather than expanding without bound. _(operationalizes `k8`)_
- **ac3:** Given a call sequence that is cut short because it reached the requested depth, when the reader opens the document, then the point of truncation and the depth used are stated in the document, so the reader is not misled into thinking the flow ends there. _(operationalizes `k11`)_
- **ac4:** Given a chosen entry-point symbol that is not present in the indexed code, when a call-sequence document is requested for it, then the request reports that the symbol was not found, rather than producing a plausible-looking sequence that is not backed by the indexed code. _(operationalizes `k11`, `k8`)_

### E20260730870ed3dd:S004 — Obtain narrative documents for flows and topology that the indexed relationships alone cannot express

**User value:** `size: L`

Design reviews and architecture discussions get a current, evidence-backed picture of use-case flows and deployment topology — the parts of the story that are not recoverable from recorded structure alone — instead of stale hand-written prose.

**Depends on:** `s1`

**Acceptance criteria:**

- **ac1:** Given an indexed repository and a described use case or topology question, when a developer requests a narrative document for it, then a document is produced whose diagram tells that flow or topology, and every participant, component, and symbol it names corresponds to something present in the indexed code. _(operationalizes `k11`, `k8`)_
- **ac2:** Given a narrative document that needs content generated rather than derived, when that content is produced, then it is produced through the locally available provider or the local command-line provider, with no direct call to a cloud service made from this process. _(operationalizes `k1`)_
- **ac3:** Given a document that combines content derived from recorded relationships with content that was narrated, when a reader opens it, then the narrated sections are distinguishable from the derived ones, so the reader knows which parts are guaranteed to follow the code. _(operationalizes `k8`, `k11`)_
- **ac4:** Given a choice between a faster, cheaper generation path that produces a less faithful account and a slower one that stays truer to the code, when a narrative document is generated, then the more faithful account is produced, with speed and cost yielding to fidelity. _(operationalizes `k3`)_
- **ac5:** Given a produced narrative document, when it is opened offline, then it renders as a single standalone file with scalable vector diagram content and no view-time dependency on anything outside the file. _(operationalizes `k5`, `k6`)_

### E20260730870ed3dd:S005 — Keep documents readable when the subject is too large for the primary rendering path

**User value:** `size: M`

A developer documenting a big subsystem still gets a usable picture, instead of a document that silently degrades into an unreadable tangle at exactly the moment the diagram would be most valuable.

**Depends on:** `s2`

**Acceptance criteria:**

- **ac1:** Given a chosen scope whose diagram is too large for the primary rendering path to lay out legibly, when a document is requested for that scope, then a readable document is still produced, using the alternative rendering path reserved for graphs that outgrow the primary one. _(operationalizes `k9`)_
- **ac2:** Given a document produced through the alternative rendering path, when it is opened offline, then it is still a single standalone file with scalable vector diagram content, zoom and pan, and no view-time network dependency — indistinguishable in these respects from a primary-path document. _(operationalizes `k5`, `k9`, `k6`)_
- **ac3:** Given a machine where the alternative rendering path is unavailable, when a document is requested for an oversized scope, then the request states plainly that the fallback was unavailable and what would make it available, rather than emitting an illegible or truncated document without saying so. _(operationalizes `k9`, `k11`)_
- **ac4:** Given a scope small enough for the primary rendering path, when a document is requested, then the primary self-contained path is used, with the alternative reserved for the oversized case only. _(operationalizes `k9`)_

### E20260730870ed3dd:S006 — Request documentation from any of the surfaces this system already exposes capabilities through

**User value:** `size: M`

Whichever way a developer or an assisting agent already talks to this system, documentation generation is reachable there — including for the deployment-design work that is already waiting to consume it.

**Depends on:** `s1`

**Extends:** [[c1]]

**Acceptance criteria:**

- **ac1:** Given the same repository, scope, and document type, when a document is requested through each of the three ways capabilities are exposed here — the tool surface, the inter-process surface, and the assistant-facing surface, then each request yields an equivalent document, with no capability available on one surface but missing from another. _(operationalizes `k4`)_
- **ac2:** Given a caller that is not the daemon, when it requests a document over any of those surfaces, then the indexed content is read inside the daemon and the caller never reaches the stores directly. _(operationalizes `k2`)_
- **ac3:** Given a repository that is not registered, or has not finished indexing, when a document is requested for it, then the request fails with a reason the caller can act on, rather than producing an empty or partially populated document. _(operationalizes `k11`, `k2`)_
- **ac4:** Given a developer or agent discovering what this system can do, when they enumerate the available capabilities on any of the three surfaces, then documentation generation appears there described in terms of what it produces, alongside the existing capabilities. _(operationalizes `k4`)_

### E20260730870ed3dd:S007 — Generate working documents from an installed build, not just a development checkout

**User value:** `size: S`

The documents a developer generates from a normal installation open and render exactly as they do for whoever built the feature — the offline guarantee holds where the system actually runs.

**Depends on:** `s1`

**Extends:** [[c3]] [[c4]]

**Acceptance criteria:**

- **ac1:** Given an installed build of the system rather than a development checkout, when a developer generates any document type, then the document is produced complete, with everything it needs to render already inside it. _(operationalizes `k7`, `k5`)_
- **ac2:** Given the non-code resources a generated document needs in order to render itself, when the system is built and installed, then those resources are delivered through the same asset-shipping path the project already uses for non-code runtime resources, rather than a path invented for this feature. _(operationalizes `k7`)_
- **ac3:** Given the primitives this system already has for producing self-contained rendered documents, when generated documents are delivered, then they build on those existing primitives rather than standing up a second, parallel set of the same plumbing. _(operationalizes `k10`, `k6`)_
- **ac4:** Given a document generated from an installed build and moved to a different machine that has never had this system installed, when it is opened there with no network, then it renders fully, including zoom and pan. _(operationalizes `k5`)_

## Open questions

- Item a2: The Epic contains NO openQuestions block at all, yet carries two confidence:'low' assumptions: (1) 'the existing artifact-render path in the build step ... is an integration point for document emission, though it exports no diagram or docgen types today' (source c11 — and c12 records that symbol.locate on src/mcp failed with prerequisite-empty, so this is unverified); (2) 'some graphs will exceed what the primary renderer can lay out legibly, so a fallback rendering path is expected to be needed' (source c6 — the threshold is asserted, not established). Story s5 builds on assumption (2) as if settled. Fix: raise an openQuestion for each low-confidence assumption before approval.
- Item s1c: s1–s5 are clean vertical slices. s6 (surface exposure) and s7 (installed-build asset delivery) are cross-cutting rather than independent: s1/ac2 already requires a document that 'renders on its own … with no request made off the machine', which cannot hold without s7's asset-shipping work, and s1/ac5 already requires a non-daemon caller to receive a finished document, which presumes part of s6's surface. So s1 cannot be delivered and tested without absorbing slices of its own dependents (both s6 and s7 declare dependsOn s1, i.e. the reverse order). Either narrow s1's ac2/ac5, or fold the asset/surface minimum into s1 and re-scope s6/s7 to the remaining breadth.
- Item ac3: Six of seven map cleanly. s6's userValue ends '— including for the deployment-design work that is already waiting to consume it', and no criterion covers that consumer: ac1/ac2/ac3/ac4 cover surface parity, daemon-side reads, unregistered-repo failure, and discoverability, none of which tests or even mentions the waiting internal consumer. Either drop the clause or add a criterion grounded in c8.

## Resolved questions

- `q756f0dda` — Item s1c: s1–s5 are clean vertical slices. s6 (surface exposure) and s7 (installed-build asset delivery) are cross-cutting rather than independent: s1/ac2 already requires a document that 'renders on its own … with no request made off the machine', which cannot hold without s7's asset-shipping work, and s1/ac5 already requires a non-daemon caller to receive a finished document, which presumes part of s6's surface. So s1 cannot be delivered and tested without absorbing slices of its own dependents (both s6 and s7 declare dependsOn s1, i.e. the reverse order). Either narrow s1's ac2/ac5, or fold the asset/surface minimum into s1 and re-scope s6/s7 to the remaining breadth.
  - **resolved**: Fold the asset/surface minimum into s1; re-scope s6/s7 to breadth — User-selected walking-skeleton: S001 absorbs the minimum asset-ship + one non-daemon-caller/surface path needed to satisfy its own ac2 (offline self-render) and ac5 (finished document to a non-daemon caller), making it independently deliverable+testable. S006 keeps dependsOn s1 and covers full tool/IPC/MCP surface parity across all doc types; S007 covers the full installed-build asset-delivery breadth. _(2026-07-30T14:29:14.818Z)_
- `q4c24ee31` — Item a2: The Epic contains NO openQuestions block at all, yet carries two confidence:'low' assumptions: (1) 'the existing artifact-render path in the build step ... is an integration point for document emission, though it exports no diagram or docgen types today' (source c11 — and c12 records that symbol.locate on src/mcp failed with prerequisite-empty, so this is unverified); (2) 'some graphs will exceed what the primary renderer can lay out legibly, so a fallback rendering path is expected to be needed' (source c6 — the threshold is asserted, not established). Story s5 builds on assumption (2) as if settled. Fix: raise an openQuestion for each low-confidence assumption before approval.
  - **resolved**: One openQuestion for the story-blocking assumption only — Split by failure kind: assumption (2) — the primary-renderer legibility threshold — is a genuine unestablished design judgment that S005 presupposes, so raise it as the one Epic-level openQuestion that unblocks S005. Assumption (1) — whether build-step render.ts is the emission integration point — is a checkable fact about this codebase (c12 only failed on an empty-prerequisite grounding call); leave it a documented low-confidence assumption with a verification task inside the story that owns document emission, resolved at LLD time rather than gating the Epic. _(2026-07-30T14:30:36.637Z)_

## Citations

- **[[c1]]** `analyze-bundle` `capability-discovery (code) — reuse-check over src/mcp, src/mcp/build-step, src/db/graph, src/daemon/tools/builtins/graph, src/mcp/analyze-step` — "The reuse-check evaluated 5 candidates and returned 0 clear matches, 2 partial and 3 unrelated... Conclusion: the capability does not exist in any form; the two partials are integration points, not re"
- **[[c2]]** `analyze-bundle` `concept.resolve (semantic sweep) — Mermaid / rendered-HTML / diagram-generation entities across the indexed graph` — "Its top hits — loadMermaidCdnMeta in src/daemon/artifacts-rpc.ts and RenderedArtifactHtml in src/shared/artifacts.ts — are the ONLY entities in the whole retrieval touching Mermaid or rendered-HTML ar"
- **[[c3]]** `code` `src/daemon/artifacts-rpc.ts::loadMermaidCdnMeta` — "concept.resolve score 0.095 — one of only two entities in the entire retrieval touching Mermaid or rendered-HTML artifacts; did not rank into the reuse-check candidate set."
- **[[c4]]** `code` `src/shared/artifacts.ts::RenderedArtifactHtml` — "concept.resolve score 0.095 — existing rendered-artifact HTML type; worth inspecting before writing new artifact-HTML plumbing."
- **[[c5]]** `step-output` `define/s1 scope — decision=new, scope=L, flavor=new-capability` — "Sized L (the analyze pass suggested M; raised because deterministic graph→DSL generation, LLM narrative diagrams, the self-contained HTML renderer, asset shipping, and tool+IPC+MCP exposure are each a"
- **[[c6]]** `stakeholder` `Raw ask (docgen framework request)` — "Output is standalone offline HTML per doc: Mermaid JS inlined... Exposed as a docgen tool + IPC method + MCP tool registered against daemon/tools/registry.ts. Local-first, no cloud REST; D2/Graphviz s"
- **[[c7]]** `convention` `CLAUDE.md — Project principles` — "No direct cloud REST calls from our process. Cloud LLM access happens through the locally-installed claude and codex CLI binaries (via CliProvider)... Direct REST providers to Anthropic / OpenAI / Gem"
- **[[c8]]** `prior-artifact` `Epic catalog — 753e0ed64921d937 build-deployment-design-framework-project-analyze` — "Closest thematic Epic (its s4 designs 'deployment topology and connectivity'), but its problem is ungrounded deployment decisions and discovery of current deployment state — not producing HTML develop"
- **[[c9]]** `code` `src/db/graph (store, codec, traversal — EntityRow / EdgeProps, DEPENDS_ON, CALLS)` — "Implements the underlying graph store, codec, and traversal for entity storage, but does not contain documentation rendering or HTML generation logic."
- **[[c10]]** `convention` `CLAUDE.md — Key architectural rules 1 and 5` — "Daemon owns all DB access — CLI, MCP, and the IDE workbench communicate via IPC only... No raw file dumps — context is always structured entity summaries + relations from the graph."
- **[[c11]]** `code` `src/mcp/build-step/render.ts` — "render.ts is structurally consistent with generating output artifacts, but the module name and lack of explicit docgen/file-type exports make it an incomplete match for the full framework."
- **[[c12]]** `analyze-bundle` `symbol.locate (diagnostic) on src/mcp — step e5, errorCode prerequisite-empty` — "module.profile for src/mcp returned an empty exports array, so no anchor entities could be located inside the highest-scoring candidate. This is a negative signal reinforcing the reuse verdict."
- **[[c13]]** `convention` `design/*.html — existing self-contained document pattern (e.g. design/indexer.html)` — "matching the existing design/*.html self-contained pattern"
- **[[c14]]** `convention` `CLAUDE.md — Project principles` — "Accuracy is primary; cost is the least priority... Cost optimizations are valid only when they preserve accuracy; otherwise the cheap path is the wrong path."
- **[[c15]]** `convention` `CLAUDE.md — Project structure, src/assets` — "assets/  Non-TS runtime resources (shipped by copy-assets.mjs)"
