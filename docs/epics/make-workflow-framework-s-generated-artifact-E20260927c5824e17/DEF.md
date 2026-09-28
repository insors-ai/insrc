<!-- insrc:artifact DEF-c5824e17eccf0c14 -->

# Epic: Every stage of the insrc workflow ends in a document a human must read, understand, and approve before the next stage may proceed — yet the documents the framework produces are shaped for machine and developer consumption rather than for the people who have to review them.

**Flavor:** enhancement

## Problem

Every stage of the insrc workflow ends in a document a human must read, understand, and approve before the next stage may proceed — yet the documents the framework produces are shaped for machine and developer consumption rather than for the people who have to review them. They are dense and structurally uniform in a way that is hard for any reader to navigate, and they are geared almost entirely toward implementation detail even though the earliest artifacts are the ones most likely to be reviewed by non-technical business and product stakeholders who need to see the functional intent — what is being built and why, in outcome terms — rather than its construction. That functional intent is captured only thinly and is not carried as a durable, checkable thread through the later stages, so there is no reliable way to confirm at the end that what was built actually realizes what was originally asked for. Content compounds the difficulty: the same material is repeated verbatim across documents (for example a design's summary copied into every lower-level design derived from it), inflating each document and burying the part that is actually specific to it. Where a design decision, a flow, a data shape, or a user-facing surface would be far clearer shown visually, the documents offer only prose, and the user-experience design that the recent chat-UI work showed is decisive to getting a feature right is not connected to the generated documents at all — a reviewer cannot see the intended experience or the mock it should match while reading the design that is supposed to honour it. Finally, none of these qualities is something the workflow can require or verify: readability, functional completeness, the presence of a useful diagram where one is warranted, and adherence to an agreed experience are left to chance at exactly the human-in-the-loop gates the workflow most depends on, so a document can pass review while being hard to read, functionally vague, redundant, and disconnected from the experience it designs.

## Non-goals

- **Reformatting or migrating the artifact documents that already exist on disk into any new structure.** — The improvement is forward-only by explicit stakeholder decision (c2) — it applies to documents generated after the change; retrofitting historical artifacts is out of scope and risks churn against records that are already approved and correlated.
- **Changing the on-disk folder layout, canonical identity, or naming of artifacts.** — That concern was already addressed by the separate `restructure-docs-artifact-markdown-from-flat` Epic (c6); this Epic is about the content and readability of the documents, not where they are filed.
- **Replacing the core artifact format with a non-markdown medium (HTML/PDF/rich docs) for the primary document body.** — Stakeholder decision (c2) is that the core documents stay well-structured markdown; only companion visual artifacts may be other media, referenced from the markdown.
- **Making design diagrams a mandatory element of every document.** — Stakeholder decision (c2): diagrams are included only where the document flow assesses one is genuinely useful; forcing a diagram onto every document would add noise, not readability.
- **Introducing any direct cloud REST provider for diagram/content generation.** — Project principle (c7) forbids direct cloud REST from our process; all LLM/diagram generation must go through the existing local CliProvider/Ollama and docgen seams.

## Assumptions

- `high` The functional intent can be represented as structured data in the artifact JSON with the human-readable prose generated from it, so the prose and the structured record cannot drift apart. [[c2]]
- `high` A blocking completion gate already exists that new adherence checks (functional-coverage, diagram, UX) can ride rather than inventing a separate enforcement mechanism. [[c4]]
- `high` The existing per-type markdown renderers, the synthesizer, the approval/validation gates, the path-scheme, and the template loader are the seams this work modifies, and all of them already exist. [[c5]]
- `med` Design-diagram generation can reuse the existing docgen capability rather than building diagram generation from scratch. [[c8]]
- `high` Verbatim content duplication across documents (e.g. an upper design's summary copied into every lower design) is present today and is a material driver of the readability problem. [[c3]]

## Constraints

| ID | Type | Text | Source |
| :--- | :--- | :--- | :--- |
| `k1` | stakeholder | The core document body of every artifact type must remain well-structured markdown; any visual (UML/Mermaid or UX/HTML) is a separate companion artifact referenced from the markdown, never inlined into the core body. | [[c2]] |
| `k2` | invariant | The functional-definition record is structured data in the artifact JSON and is the single source of truth; the document prose is generated from it (no functional requirement is authored in prose alone). | [[c2]] |
| `k3` | stakeholder | Diagram inclusion is content-gated — the document flow must assess per-document whether a diagram is genuinely useful and only then generate one; diagrams are never mandatory. | [[c2]] |
| `k4` | contract | New adherence checks (functional-coverage, diagram, UX) are enforced by riding the existing blocking code-review completion gate, not a new parallel gate. | [[c4]] |
| `k5` | convention | All content and diagram generation goes through the local CliProvider/Ollama and the existing docgen seams — no direct cloud REST from our process. | [[c7]] |
| `k6` | stakeholder | The change is forward-only: it applies to newly generated artifacts and does not migrate or rewrite artifacts already on disk. | [[c2]] |

## Stories

### E20260927c5824e17:S001 — Carry a functional-definition thread from the first document through to completion

**User value:** `size: L`

A reviewer — including a non-technical business or product stakeholder — can see what is being built and why in outcome terms, and at the end the team can confirm the implementation actually realizes what was asked for.

**Extends:** [[c5]]

**Acceptance criteria:**

- **ac1:** Given a new piece of work enters the workflow, when its first document is generated, then the document states its functional requirements as discrete, individually-identified outcomes — each carrying a stable identifier — that a non-technical reviewer can read and approve. _(operationalizes `k2`)_
- **ac2:** Given functional requirements are established in an upstream document, when a downstream document derived from it is generated, then it carries those same identified requirements forward unchanged in identity, so the functional thread is continuous and traceable across every stage. _(operationalizes `k2`)_
- **ac3:** Given the functional requirements for a piece of work and its completed build, when completion is assessed, then the workflow judges whether each functional requirement was genuinely realized and withholds completion when that coverage is inadequate, using the existing blocking completion gate. _(operationalizes `k4`)_

**Local constraints:**

- `lc1` (convention) Functional-requirement identifiers use the same sequence-based numbering used for tasks and stories, of the form `<epicId>:FRxxx`, and are stable once assigned. [[c2]]

### E20260927c5824e17:S002 — Make each document human-readable and audience-aware, without repeated content

**User value:** `size: M`

Any reviewer can navigate a document quickly and read only the parts specific to it; business and product reviewers get a framing document geared to them; and no document is padded with material copied verbatim from another.

**Depends on:** `s1`

**Extends:** [[c5]]

**Acceptance criteria:**

- **ac1:** Given a document of any workflow type is generated, when a reviewer opens it, then it presents a consistent, navigable structure appropriate to its type — an overview/contents, a summary, a problem statement, references, and clearly delineated per-item sections — shaped for human reading. _(operationalizes `k1`)_
- **ac2:** Given an upstream document already states context shared with the documents derived from it, when a later document is generated, then the later document references that shared context rather than reproducing it verbatim, so each document foregrounds what is specific to it. _(operationalizes `k1`)_
- **ac3:** Given the earliest framing document is generated, when a non-technical business or product reviewer reads it, then its content is expressed in functional and outcome terms suited to that audience rather than in implementation detail. _(operationalizes `k1`)_

### E20260927c5824e17:S003 — Include a design diagram only where a visual genuinely aids understanding

**User value:** `size: M`

A reviewer sees a diagram exactly when a flow, structure, or data shape is clearer shown than described, is not made to wade through diagrams that add nothing, and can trust that any diagram shown matches the design it depicts.

**Depends on:** `s2`

**Extends:** [[c5]] [[c8]]

**Acceptance criteria:**

- **ac1:** Given a document is being generated, when the flow assesses whether a visual would materially aid understanding of the document's content, then it includes a referenced diagram only when one is genuinely useful and omits any diagram otherwise. _(operationalizes `k3`)_
- **ac2:** Given a diagram is warranted for a document, when the diagram is produced, then it is a separate companion artifact referenced from the core markdown body, never inlined into that body. _(operationalizes `k1`)_
- **ac3:** Given a document references a diagram, when the work is assessed for completion, then the workflow checks that the referenced diagram is present and consistent with the design it depicts and withholds completion on a mismatch via the existing blocking gate. _(operationalizes `k4`)_
- **ac4:** Given a diagram must be generated, when generation runs, then it uses only the local and existing generation capabilities with no direct cloud REST call from our process. _(operationalizes `k5`)_

### E20260927c5824e17:S004 — Carry the intended user experience into the design and enforce adherence to it

**User value:** `size: M`

When a feature has a user-facing surface, a reviewer can see the intended experience and the mock it must match while reading the design, and the feature cannot be completed until the built experience adheres to that agreed design.

**Depends on:** `s3`

**Extends:** [[c5]]

**Acceptance criteria:**

- **ac1:** Given a piece of work has a user-facing experience, when its design document is generated, then the document references the agreed experience design (its mock) and describes the intended experience, so a reviewer can assess the design against what the user will actually see. _(operationalizes `k1`)_
- **ac2:** Given a work item is flagged as having a user-facing experience, when completion is assessed, then a user-experience acceptance check is required and a failing check withholds completion via the existing blocking gate. _(operationalizes `k4`)_
- **ac3:** Given a document's adherence expectations, when they are recorded for a work item, then they are expressed as an explicit, selectable set of adherence dimensions — for example user experience, the relevant diagram kinds, and functional-requirement coverage — that the completion check reads and enforces. _(operationalizes `k4`)_

## Citations

- **[[c1]]** `doc` `docs/artifact-document-template-review.md` — "the generated MD files are still very machine optimized and hence hard for a person to review, both in format and content; the current docs capture very little functional definition ... functional def"
- **[[c2]]** `prior-artifact` `.insrc/artifacts/SPEC-46b20c2f0459e807.json` — "Approved brainstorm SpecArtifact: one Epic, four forward-only Stories A→B→C→D; core documents stay well-structured MD, diagrams are referenced companion artifacts, FR source of truth is the JSON with "
- **[[c3]]** `code` `src/workflow/artifacts/lld.ts:282` — "renderLldMarkdown — the largest per-type renderer (227 lines); HLD-context content is duplicated verbatim into every LLD."
- **[[c4]]** `code` `src/config/config-catalog.ts:90` — "codeReview.enforce boolean default false — enforce a blocking code-review verdict at Story completion (off ⇒ advisory)."
- **[[c5]]** `analyze-bundle` `insrc_analyze: workflow artifact rendering + gates` — "Per-type renderers under artifacts/ (define.ts:86, hld.ts:105, lld.ts:282, plan.ts:97); gate approveArtifactByJsonPath in gates.ts; validateArtifact in code-review/runner.ts:266; resolveArtifactMdPath"
- **[[c6]]** `prior-artifact` `Epic restructure-docs-artifact-markdown-from-flat (599a9b506f22b896)` — "Reorganized artifact folder structure + canonical identity/naming — not document content or readability."
- **[[c7]]** `convention` `CLAUDE.md — project principles` — "No direct cloud REST calls from our process. Cloud LLM access happens through the locally-installed claude and codex CLI binaries (via CliProvider)."
- **[[c8]]** `code` `src/docgen/registry.ts` — "docgen registry generates self-contained HTML/Mermaid docs from the code graph — reusable diagram-generation seam."
- **[[c9]]** `doc` `docs/vscode-chat-ui-ux-retrospective.md` — "The mock (k5) was the source of truth but never an acceptance criterion ... UX design needs to be deeply integrated into the generated documents — the reason UX adherence must be a first-class, enforc"

<!-- insrc:review -->

## Review

### ✅ Review `PASS` — define (define)

**0 HIGH · 0 MED · 9 LOW** · model `client` · reviewed 2026-09-27T14:38:55.786Z

| Ref | Kind | Severity | Fixability | Premise | Evidence | Action |
| --- | --- | --- | --- | --- | --- | --- |
| c3 | citation | LOW | manual | renderLldMarkdown is defined in src/workflow/artifacts/lld.ts around line 282 and is the per-type LLD markdown renderer. | grep 'renderLldMarkdown' resolves in src (incl. src/workflow/artifacts/lld.ts and its test hld/lld-artifact suites); the analyze bundle placed the definition at lld.ts:282. Citation c3 holds. | No change — citation verified against source. |
| c4 | citation | LOW | manual | The config key codeReview.enforce is declared in src/config/config-catalog.ts around line 90 as a boolean defaulting to false that enforces a blocking code-review verdict at Story completion. | grep 'codeReview\\.enforce' resolves; the config row is declared in src/config/config-catalog.ts (line ~90) as the boolean completion-enforcement gate. Citation c4 holds. | No change — citation verified against source. |
| c5 | citation | LOW | manual | The per-type markdown renderers exist: renderDefineMarkdown (artifacts/define.ts), renderHldMarkdown (artifacts/hld.ts), renderLldMarkdown (artifacts/lld.ts), renderPlanMarkdown (artifacts/plan.ts). | grep confirms renderDefineMarkdown, renderHldMarkdown (hld-artifact.test.ts imports it from artifacts/hld.ts) and renderPlanMarkdown all resolve in src/workflow/artifacts. Citation c5's renderer inventory holds. | No change — citation verified against source. |
| c5 | citation | LOW | manual | The approval gate function approveArtifactByJsonPath exists in src/workflow/gates.ts. | grep 'approveArtifactByJsonPath' resolves (50 matches incl. gates.ts and downstream PLAN/HLD references). The approval-gate symbol exists. Citation c5 holds. | No change — citation verified against source. |
| c5 | citation | LOW | manual | The code-review artifact validator validateArtifact exists in src/workflow/code-review/runner.ts around line 266. | grep pins validateArtifact to src/workflow/code-review/runner.ts:266 (the function definition) with a caller at runner.ts:175 — exact line match to citation c5. | No change — citation verified against source. |
| c5 | citation | LOW | manual | The path-scheme resolver resolveArtifactMdPath exists in src/workflow/path-scheme.ts, and the daemon template loader loadTemplate exists in src/daemon/artifacts/template-loader.ts around line 156. | grep 'resolveArtifactMdPath' resolves (path-scheme); grep 'loadTemplate' pins the daemon loader to src/daemon/artifacts/template-loader.ts:156 — exact line match. Citation c5 holds. | No change — citation verified against source. |
| c8 | citation | LOW | manual | A reusable docgen diagram-generation seam exists at src/docgen/registry.ts. | The read of src/docgen/registry.ts:1 succeeded (file exists) and 'docgen' resolves widely; the reusable diagram-generation seam exists. Citation c8 holds. | No change — citation verified against source. |
| cl8 | closed-union | LOW | manual | The seams this Epic modifies (per-type renderers, synthesizer, approval/validation gates, path-scheme, template loader) all already exist in the tree, so the work is an enhancement of shipped code rather than a new subsystem. | The renderers resolve in src/workflow/artifacts and the read of src/workflow/synthesizer.ts:1 succeeded — the modified seams all pre-exist, supporting the enhancement flavor. | No change — closed-union (seams pre-exist) verified. |
| cl9 | ordering | LOW | manual | The Stories form an acyclic linear dependency chain: S002 depends on S001, S003 depends on S002, S004 depends on S003. | The DEF's Stories declare Depends on: S002→S001, S003→S002, S004→S003 — a strictly linear, acyclic chain. Ordering claim holds. | No change — dependency graph is acyclic. |
