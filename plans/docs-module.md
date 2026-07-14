# plans/docs-module.md

Docs analysis module for the analyze framework. Covers standalone
doc queries ("what did we decide about X?") + cross-cutting
implementation-adherence checks ("does this code match the design
constraint in `design/foo.md`?").

Status: **DRAFT** -- not yet approved for implementation.

## 1. Motivation

The indexer already handles non-code files ([indexer/parser/artifact.ts](../src/insrc/indexer/parser/artifact.ts)):

- `.md` / `.mdx` -> `document` + `section` entities (split on headings)
- `.yaml` / `.json` / `.toml` / Dockerfile / etc -> `config` entities
- `.sql` / `.proto` / `.graphql` -> `document` entities
- All flagged `artifact: true`
- Every entity is embedded into `entity_vec` alongside code

But the analyze framework barely uses them:

- No `target='docs'` in the classifier taxonomy (`code | data | infra | generic` only)
- No dedicated docs shaper prompt
- The `code.system.md` prompt mentions "README" only as a *negative* signal ("if scope contains only a README, reflect emptiness")
- The `code`/`data`/`infra` shapers steer toward code entities in their `artefacts` layer

Two workflows suffer from this gap:

1. **Doc-primary queries** land in `target='generic'` today, which surveys "surface kinds" but explicitly omits the `artefacts` layer -- so decisions recorded in prose never make it into the bundle.
2. **Implementation-adherence checks** have no home at all. A user asking "does this analyze framework follow the design in `design/analyze-context-builder.md`?" gets a code analysis with no doc grounding.

## 2. Two use cases, distinct in shape

### Use case A -- standalone docs analysis

User invokes `/docs how did we decide about X?` or `/docs summarise the analyze framework design`. Answer must come from prose (design docs, plans, requirements, ADRs, READMEs) with precise citations.

Shape: mirror the existing per-target shaper flow. Layered bundle -> planner emits doc-analysis tasks -> tasks call an LLM against selected doc sections -> aggregator stitches a report.

### Use case B -- adherence checks during code/data/infra analysis

User invokes `/code does this codebase follow the design in design/analyze-framework.md?` or the planner decides on its own that a design/spec is worth cross-referencing (e.g. code has a `plans/foo.md` in the closure).

Shape: **not** a new target -- a new *leaf template* in the code/data/infra families. Input: a set of doc section entities + a set of code entities. Output: an adherence report (matches, drifts, missing implementation, contradictions).

## 3. Recommended design

**Hybrid**: build a shared docs-retrieval primitive; then ONE new target family (`docs`) for use case A, and ONE new leaf template per existing family (`code.adherence.check` / `data.adherence.check` / `infra.adherence.check`) for use case B.

### 3.1 Shared primitive: docs retriever

New module `analyze/docs-retrieval.ts`:

```ts
export interface DocSectionResult {
    readonly entityId:  string;
    readonly file:      string;
    readonly heading:   string;
    readonly lineStart: number;
    readonly lineEnd:   number;
    readonly kind:      'document' | 'section' | 'config';
    readonly score:     number;       // hybrid rank
    readonly bodyPreview?: string;    // truncated preview for retrieval-time filtering
}

export interface DocsRetrievalArgs {
    readonly query:       string;                // natural-language question or code identifier
    readonly closureRepos:readonly string[];     // enforced repo closure (same as code queries)
    readonly maxResults?: number;                // default 20
    readonly minScore?:   number;                // hybrid-score floor
    readonly filenameHint?: string;              // optional path substring bias (e.g. 'design/', 'plans/')
}

export async function retrieveDocSections(args: DocsRetrievalArgs): Promise<DocSectionResult[]>;
```

Implementation:

1. **Vector pass** -- ANN over `entity_vec` filtered `kind IN ('document','section','config') AND artifact = true AND repo IN closure`. qwen3-embedding on the query. Top ~40.
2. **Keyword pass** -- `search_grep` over doc/config files in closure with terms extracted from the query (identifiers, key nouns). Top ~20.
3. **Hybrid rank** -- fuse: score = 0.6 * cosine + 0.4 * (bm25-lite). Boost when `filenameHint` matches path.
4. **Dedup** -- collapse duplicate `(file, headingPath)` pairs; prefer the more specific section.
5. **Cap + trim** -- return `maxResults` with preview truncated to ~500 chars per section.

This function is the ONLY doc-retrieval entrypoint. Everything else (shaper tool loop, adherence template, generic-mode enrichment) calls through it.

### 3.2 New target: `docs`

Additions to the taxonomy:

- `AnalyzeTarget` gains `'docs'` ([shared/analyze-types.ts](../src/insrc/shared/analyze-types.ts))
- `AnalyzeScopeRef.kind` compatible with docs: `workspace | repo | module | file | manifest-dir`
- Classifier prompt updated: `docs` = "questions about design docs, plans, requirements, ADRs, READMEs, changelogs, specifications, or 'why did we decide X' style prose retrieval"
- Scope-picker prompt updated: docs scope bands lean smaller (XS = single doc, S = one directory, M = repo docs dir, L = multi-repo docs, XL = workspace-wide)
- Slash command: `/docs` (already parsable via the existing regex)
- Aggregate report template: `docs.aggregate.report` (new prompt file)

### 3.3 New shaper: `DocsShaper`

New prompt `prompts/analyze/docs.system.md`. Bundle layer semantics adapted for docs:

| Layer | Docs semantics |
|---|---|
| `system` | Role intro (unchanged pattern) |
| `focus` | User's raw question |
| `summary` | Inventory: repos, doc families found (design/, plans/, docs/, README, ADR, changelog), doc count per family |
| `structure` | Table of contents: file -> top-level headings -> top-level sub-headings. Truncated tree for XL scopes |
| `surface` | List of the most likely relevant docs -- top ~20 by retriever hybrid score, one line each: `path :: heading :: 1-line preview` |
| `artefacts` | Section excerpts (raw body, 100-300 chars each) with citations `cite: { kind: 'section', entityId, file, heading, lineStart, lineEnd }` |
| `upstream` | Task-mode: prior task outputs |

The shaper's tool loop hits `retrieveDocSections` heavily. Also uses `file_read` for surgical excerpts once relevant sections are identified. No graph traversal is required in the common case -- docs don't have call/inherit graphs.

**Scope boundary HARD RULE** applies (per project convention): retrieval + reads confined to closure; no `..` traversal.

### 3.4 New docs templates

Per existing planner convention (see [runtimes/code/](../src/insrc/analyze/runtimes/code/)):

- `docs.discover` -- leaf. Discovery scan -- inventory doc families + counts. Produces `docs.inventory`.
- `docs.family.summarise` -- leaf. Per-family summary (design/, plans/, ADRs/, etc). Produces `docs.family.summary`.
- `docs.decision.trace` -- leaf. Given a topic in `params.topic`, retrieve + summarise the decisions recorded across relevant docs. Produces `docs.decision.trace`.
- `docs.constraint.enumerate` -- leaf. Given a subject in `params.subject`, list every explicit constraint/rule/requirement stated in the docs. Produces `docs.constraints`.
- `docs.aggregate.report` -- aggregator. Terminal task; produces the final report.
- `docs.subrun.deep-dive` -- planner-kind. For XL scopes; spawns a child plan per doc family.

### 3.5 New adherence templates (use case B)

Cross-cutting -- lives IN the existing code/data/infra target families:

- `code.adherence.check` -- leaf.
  - `params.constraints`: array of `{ constraintText: string; sourceCitation: DocCitation }` extracted from docs (either passed in from an upstream `docs.constraint.enumerate` task, or looked up by an in-runtime docs retrieval when `params.subject` is passed)
  - `params.codeSubject`: string identifier or entity path the check applies to
  - Runtime: hydrates the code subject via graph queries, retrieves the doc sections, runs an LLM that produces `{ matches: [...], drifts: [...], missingImpl: [...], contradictions: [...] }` per constraint
  - Produces `code.adherence.report`
- `data.adherence.check` + `infra.adherence.check`: same shape, different subject-hydration + different LLM prompt lens.

The planner will schedule these tasks when:
- The classified intent explicitly mentions adherence/design/constraint/rule/policy
- OR the code shaper's `run`-mode bundle surfaces doc entities in the closure and the plan includes a subrun.deep-dive that opts in

### 3.6 Cross-cutting shaper updates

Small additions to the existing shaper prompts (no schema change):

- **code.system.md** + **data.system.md** + **infra.system.md**: add a paragraph -- "if the scope contains design/plan/spec docs (`design/`, `plans/`, `docs/`, `ADR-*.md`, `SPEC-*.md`), sample the most relevant sections into `artefacts` with `cite: { kind: 'section', ... }` citations. Cap: no more than 5 sections; the goal is grounding claims, not summarising docs."
- **generic.system.md**: broaden inventory to name doc families found.
- The `artefacts` layer's contract in [contract.ts](../src/insrc/analyze/contract.ts) extends to permit `section` citations alongside `source` and `entity`.

## 4. Phased rollout

**Phase 1 -- Retriever primitive.** New `analyze/docs-retrieval.ts` + unit tests (against a seeded LMDB + Lance fixture). No user-visible change. Blocks nothing downstream, unblocks everything.

**Phase 2 -- Docs target + shaper.** Extend classifier taxonomy, add prompt files, wire boot-validator, add `DocsShaper` implementing `Shaper.buildRunBundle` + `Shaper.buildTaskBundle`. Update `/docs` slash-command wiring in chat panel. Update scope-picker for docs. `/docs help me understand the analyze framework` should work end-to-end.

**Phase 3 -- Docs templates + runtime.** Add the 5 leaf/aggregator templates + 1 planner-kind template. Ship the aggregator report prompt. First real user-visible payoff: `/docs` returns useful reports.

**Phase 4 -- Adherence templates.** Ship `code.adherence.check` first (highest-value target), then `data` + `infra`. Requires a new runtime per template that hydrates code entities + calls the retriever. The runtime output schema needs its own zod-style validation.

**Phase 5 -- Cross-cutting shaper enrichment.** Small prompt updates + citation contract extension. Non-breaking. Land last so we don't churn shaper behaviour while other phases stabilise.

Each phase is independently shippable + user-visible. Phases 1-3 close use case A completely. Phases 4-5 close use case B.

## 5. Design decisions locked in this plan

- **NEW target, not just a new shaper** -- keeps the taxonomy explicit; makes `/docs` first-class in the slash-command surface.
- **Adherence is a template, not a target** -- the check is inherently code/data/infra-scoped (you're checking THIS code against THAT design); a `target='adherence'` would be a bad fit because the classifier's scope-ref-kind rules don't compose.
- **Retrieval primitive is shared** -- one function, called from three places. Keeps the retrieval algorithm swap-out cheap if we later add BM25 tuning, learned reranking, or a docs-specific embedding.
- **No new bundle-schema fields** -- reuse the 7 layers with adapted semantics. Adding a `constraints` layer was tempting but the citation-carrying `artefacts` layer already does the job; less code to touch.
- **Docs corpus stays flagged with `artifact: true`** -- no new entity kinds. The kind catalog (`document | section | config`) is enough.
- **Adherence-check output is a structured discriminated union**, not free-form prose -- so downstream consumers (aggregator, UI, follow-up tasks) can render each verdict category separately.

## 6. Decisions locked

Recording answers to the review pass so this plan is executable end-to-end.

### 6.1 Doc-family detection: path-based V1, live summarisation V2

**Phase 3 (V1) uses path patterns only.** Family = the first pattern that matches:

- `design` — `**/design/**`
- `plans` — `**/plans/**`
- `docs` — `**/docs/**`
- `adr` — `**/adr/**`, `**/ADR-*.md`, `**/adr-*.md`
- `rfc` — `**/rfc/**`, `**/RFC-*.md`, `**/rfc-*.md`
- `spec` — `**/spec/**`, `**/SPEC-*.md`, `**/spec-*.md`
- `changelog` — `CHANGELOG.md`, `CHANGES.md`, `HISTORY.md`
- `readme` — any `README.md` (top-level or subdirectory)
- `other` — every other `.md` / `.mdx`

The LLM in the shaper CAN override in `summary` -- e.g. a `README.md` under `plans/` is best treated as a plans-index rather than a README. Overrides live in prose, not in the tool surface.

**A follow-on module builds live project context via post-indexing summarisation** -- see [Section 8](#8-followon-post-indexing-summarisation-for-live-project-context) below. Path-based classification is retained even when the summariser is live; the summariser adds a second, semantic axis rather than replacing the path axis.

### 6.2 Adherence output: write both, let the reader decide

The adherence-check template's output schema (per section 3.5) is:

```ts
interface AdherenceReport {
    matches:       ReadonlyArray<{ constraint: string; evidence: Citation; rationale: string }>;
    drifts:        ReadonlyArray<{ constraint: string; codeSubject: Citation; drift: string; rationale: string }>;
    missingImpl:   ReadonlyArray<{ constraint: string; whereExpected: string; rationale: string }>;
    contradictions: ReadonlyArray<{
        constraint:      string;
        docCitation:     Citation;
        codeCitation:    Citation;
        docPosition:     string;   // what the doc says
        codePosition:    string;   // what the code does
        rationale:       string;   // 1-2 sentences on the tension
    }>;
}
```

**No auto-resolution.** If a design and its implementation genuinely disagree, the aggregator surfaces BOTH -- doc citation with its stated position, code citation with its actual position -- and the reader (dev, PM, arch reviewer) decides which is right. Frameworks that guess "the doc must be stale" or "the code must be wrong" hide real signals from reviewers; this one doesn't.

The aggregator prompt is explicit: "do not adjudicate. Preserve both positions verbatim, let the reader decide."

### 6.3 Docs retrieval scope: current repo only (V1)

The docs retriever restricts to the CURRENT repo -- the repo owning `scopeRef.value`, or the workspace's single active repo when scope is workspace-level. No cross-repo doc lookup, even when the transitive `DEPENDS_ON` closure includes sibling repos. Rationale:

- The dominant use case is analysing THIS project's decisions -- the design docs relevant to the current work usually live under the current repo's `design/` or `plans/`.
- Cross-repo doc retrieval opens ranking-quality questions (a monorepo could swamp results with a shared library's docs) that we don't need to answer to ship V1.
- Follow-up plan (V2+) can extend the retriever's closure filter without touching the shaper prompts.

Concretely: the retriever's `closureRepos` argument is a single-element array containing the scope's owning repo path. The classifier / scope-picker enforces this by picking a scope ref whose kind is compatible (`repo | module | file`).

### 6.4 Retrieval index filters: add finer kind + repo filters

**Findings from the code review pass:**

- Lance `entity_vec` HAS a `kind` column and an `artifact` column ([db/lance/entity-vec.ts](../src/insrc/db/lance/entity-vec.ts)), but the public API's `filter` parameter is coarse: `'all' | 'code' | 'artifact'`. Kind-list filtering (`kind IN ('document', 'section', 'config')`) is NOT exposed.
- Lance does NOT have a `file` column -- path-prefix filtering (`file LIKE 'design/%'`) requires a schema migration OR a LMDB post-filter.
- LMDB `listEntitiesByKind` takes ONE kind at a time -- no kind-list API.

**V1 changes shipped in Phase 1:**

1. **Broaden `EntityVecFilter`** ([db/lance/entity-vec.ts:290](../src/insrc/db/lance/entity-vec.ts#L290)):
   ```ts
   export type EntityVecFilter =
     | 'all' | 'code' | 'artifact'
     | { readonly kinds: readonly EntityKind[] };
   ```
   When the object form is passed, the search adds `kind IN (...)` to the `where` clause. Backwards compatible.
2. **Add `listEntitiesByKinds`** to [db/entities.ts](../src/insrc/db/entities.ts) -- variadic version of `listEntitiesByKind` accepting a kind set. Single-scan; no per-kind loop cost.
3. **Path-prefix filter stays in LMDB** for V1 -- the retriever hydrates ANN hits then post-filters by `entity.file` against the family patterns. Docs are a small subset of the corpus (this workspace: ~thousands vs 253k total) so scan cost is <100ms.

**Deferred to V2 if warranted:** adding a `file` column to `entity_vec` for path-native filtering. Only worth it if V1 post-filtering becomes a bottleneck (empirically decide after V1 ships).

### 6.5 Docs planner-kind can spawn code subruns: YES

Docs-target planner templates (`docs.subrun.deep-dive`) MAY use `params.childIntent.target = 'code'` to spawn a child plan that analyses code entities cited from the docs. Concretely:

- Parent plan: `target='docs', scope='M'`, task `t04 = docs.decision.trace(topic='analyze framework classifier')`
- Task `t04` runs the docs decision-trace, produces a report citing specific code entities (`entityId: <sha>`, or a file+symbol pointer)
- Task `t05` is a `docs.subrun.deep-dive` planner-kind, `params.childIntent = { target: 'code', scope: 'S', focused: true, focus: 'classifier + scope-picker implementation', scopeRef: {kind: 'file', value: 'src/insrc/analyze/classifier/scope-picker.ts'} }`
- Child plan runs the code shaper against the cited entities, produces a `code.aggregate.report`
- Parent aggregator `docs.aggregate.report` consumes the child report + earlier docs findings, stitches the final answer

**Docs bundle propagation:** the child code plan does NOT automatically see the parent's docs bundle. Instead, the parent passes a compact `parent.docsSummary` object via `params.childIntent.upstreamContext` (a new optional field on `ClassifiedIntent`, populated by the planner-template task). The child shaper's system prompt is updated to read `upstreamContext` and surface it in the child bundle's `upstream` layer.

---

## 7. Not doing (scope discipline)

- **No new entity kinds.** The kind catalog already carries what we need.
- **No new embedding model.** Stick with qwen3-embedding.
- **No new persistence layer for retrieval.** Everything for the docs retriever lands in the existing LMDB + Lance schema. (The post-indexing summariser in Section 8 DOES add a small new sub-DB -- see there for the tradeoff.)
- **No new tools in the tool surface.** `search_grep`, `graph_query`, `file_read`, and the existing vector search are enough; the new `retrieveDocSections` is a wrapper on top, not a new tool.
- **No natural-language schema DSL.** Adherence-check output stays a fixed schema; free-form claims go in the `rationale` field.
- **No fine-grained "adherence status per code line"** -- the LLM verdict is per-constraint, not per-line. Line-level attribution is a follow-up.
- **No cross-domain constraint tracking.** If a design doc constraint says "code must NOT block on cloud REST from our process", the adherence check against a specific file works; but the framework doesn't build a persistent constraint database with per-run drift tracking.
- **No cross-repo doc retrieval in V1.** Retriever is repo-scoped even when closure spans multiple repos.

## 8. Follow-on: post-indexing summarisation for live project context

Path-based family classification (Section 6.1) is fast and deterministic but shallow -- it tells you `design/foo.md` is a "design" doc but not what design it captures. A follow-on module builds a live **project context view** by summarising docs at indexing time, so shapers + adherence checks can consult a pre-baked view instead of re-summarising every run.

### 8.1 Trigger + scope

**When it fires:**
- On indexer completion for a workspace repo (`repo.status` transitions to `ready`)
- On watcher-driven re-index of any doc/section/config entity (incremental refresh)

**What it summarises:** every entity with `artifact: true` AND `kind IN ('document', 'section', 'config')`. Code entities are NOT summarised by this module (their identity is already structural; the graph carries their semantics).

### 8.2 Summariser pipeline (per doc entity)

1. **Skip if unchanged** -- summary row keyed by `entityId`; if the LMDB `contentHash` hasn't changed since the last summary was written, skip.
2. **LLM summarise** -- Ollama call against `qwen3.6:35b-a3b` (same shaper model). Prompt at `prompts/analyze/doc-summariser.system.md`, output schema:
   ```ts
   interface DocSummary {
       readonly title:           string;                    // canonical title if extractable
       readonly family:          DocFamily;                 // path-inferred; the LLM can override
       readonly kind:            'design' | 'plan' | 'requirement' | 'reference' | 'changelog' | 'other';
       readonly subjects:        readonly string[];         // 1-6 short topic tags ("classifier", "scope-picker", "lmdb graph layer")
       readonly summary:         string;                    // 1-3 sentence gist
       readonly keyDecisions:    readonly string[];         // 0-8 named decisions ("cache invalidation by repoLastIndexedAt")
       readonly keyConstraints:  readonly string[];         // 0-8 named constraints ("no direct cloud REST from our process")
       readonly relatedEntities: readonly string[];         // code entity ids the doc mentions (best-effort identifier extraction)
       readonly status:          'current' | 'superseded' | 'draft' | 'unknown';   // extracted from prose signals
       readonly summarisedAt:    string;                    // ISO stamp
       readonly modelId:         string;
       readonly contentHash:     string;                    // hash of the summarised body; drives skip-if-unchanged
   }
   ```
3. **Extract related-entity mentions** -- regex over the body for `path/to/file.ts:linenum` and code-fence content; resolve each match against LMDB entity ids. Store hits in `relatedEntities`. Best-effort; unresolved mentions dropped.
4. **Persist to `doc_summary` sub-DB** (new; see 8.3).

**Rate-limiting**: summarisation runs serially (project's no-parallel-LLM rule) at background priority. Bulk backfill on first index of a large repo -- if there are 300 doc entities that's ~300 * 15s = ~75 minutes background work; user is never blocked because summaries are opt-in for the shaper.

**Failure modes:**
- LLM unavailable -> log warn, skip; next re-index cycle retries.
- Schema-unrecoverable after 3 retries -> write a `status: 'unknown'` placeholder so we don't retry every cycle on a doc that consistently breaks the schema.

### 8.3 Storage: new `doc_summary` LMDB sub-DB

Value = msgpack-encoded `DocSummary`. Key = `entityId` (32-hex). Small footprint even at 10k docs (~2 MB). Lives alongside the graph sub-DBs; no LanceDB involvement (these summaries are structural + short, not embedded).

Public API in `db/doc-summaries.ts`:
- `getDocSummary(entityId): Promise<DocSummary | null>`
- `getDocSummariesForRepo(repo, opts?): Promise<DocSummary[]>` -- with optional kind / family filter
- `getDocSummariesByFamily(repo, family): Promise<DocSummary[]>`
- `getDocSummariesBySubject(repo, subject): Promise<DocSummary[]>` -- exact-match tag lookup
- `writeDocSummary(entityId, summary): Promise<void>`
- `deleteDocSummary(entityId): Promise<void>` -- called on file delete cascade

### 8.4 Live project context assembly

New function `assembleLiveProjectContext(repo): Promise<LiveProjectContext>` in `analyze/context/live-project-context.ts`:

```ts
interface LiveProjectContext {
    readonly repo:            string;
    readonly generatedAt:     string;
    readonly totalDocs:       number;
    readonly totalCodeEntities: number;
    readonly familyBreakdown: Readonly<Record<DocFamily, number>>;
    readonly decisions:       ReadonlyArray<{ decision: string; sourceEntityId: string; family: DocFamily }>;
    readonly constraints:     ReadonlyArray<{ constraint: string; sourceEntityId: string; family: DocFamily }>;
    readonly topSubjects:     ReadonlyArray<{ subject: string; docCount: number }>;
    readonly recentActivity:  ReadonlyArray<{ entityId: string; file: string; kind: 'added' | 'updated'; when: string }>;
}
```

This is a cheap read: it fans out `getDocSummariesForRepo(repo)` and rolls up the fields. Cached in-process with a `repoLastIndexedAt` watermark; invalidated when the watermark advances.

### 8.5 Integration with the docs shaper + adherence checks

The docs shaper's `run`-mode bundle-building becomes cheaper + more grounded:

- `summary` layer -- pull directly from `LiveProjectContext` (family breakdown, top subjects, recent activity)
- `structure` layer -- table of contents built from the summaries' `title` fields, grouped by family
- `surface` layer -- when the user's question matches known subjects/decisions/constraints, list the matching docs first (before falling back to hybrid retrieval)
- `artefacts` layer -- retriever still hits full sections for excerpts, but the pre-summarised `keyDecisions` / `keyConstraints` can substitute for excerpts when the LLM only needs the decision, not the surrounding prose

The adherence-check template gets constraints from summaries directly instead of re-extracting from prose every run:

- `code.adherence.check` accepts `params.docCitations` OR `params.constraintIds` (referencing entries in a doc summary's `keyConstraints` array)
- Runtime: pulls constraints from `getDocSummariesForRepo` + filters by `subject`/`family`

**Escape hatch:** shapers can always bypass summaries and go direct to full-body retrieval when they need the surrounding context. Summaries are an optimisation, not an authority.

### 8.6 Rollout as a distinct plan phase

Ships AFTER the base docs module (Phase 5). Ordering:

- **Phase 6** -- summariser prompt + LLM call + persistence. Runs at index-time as a background job. Live-context assembly function ships alongside. No shaper integration yet.
- **Phase 7** -- docs shaper reads summaries in `run`-mode. Adherence check accepts `constraintIds`.
- **Phase 8** -- code/data/infra shapers optionally consult summaries when populating `artefacts` doc citations. Zero-work if summaries aren't available yet.

Each phase reversible: summariser can be turned off (feature flag on the indexer job, NOT on the docs module) with no shaper-side change; the retriever fallback path always works.

### 8.7 Considerations

- **First-index latency** -- 300 docs * 15s = 75 min background work on first index of a large repo. Mitigation: summariser runs at background priority + is opt-in per repo (a repo without summaries just gets slower shaper runs, not broken ones).
- **Model drift** -- if we later swap the summariser model, existing summaries become stale. `DocSummary.modelId` is stamped so we can bulk-invalidate on model change without conflating with content changes.
- **Stale summaries under active editing** -- watcher-driven re-index refreshes but there's a window where the summary lags the doc body. Acceptable: summaries are advisory; hybrid retrieval always has the current text.
- **Doc entities that aren't docs** -- `config` entities (YAML, JSON, Dockerfile) also fall under `artifact: true`. Summariser prompt gates: only run against `kind IN ('document', 'section')`, not `config`. The latter's structure is captured by the indexer's other passes.

## 9. Success criteria

**Phase 1**: `retrieveDocSections` returns >=3 relevant sections when called with any of these queries against the current insrc-ide workspace:
- "code knowledge graph substrate"
- "no direct cloud REST calls"
- "scope-boundary HARD RULE"

**Phase 2-3**: `/docs how does the analyze context builder work?` produces a report that cites `design/analyze-context-builder.md` sections, not just code.

**Phase 4**: `/code does the analyze framework's implementation follow the design in design/analyze-context-builder.md?` produces an adherence report naming at least one match, one drift, AND (where applicable) at least one contradiction with BOTH doc + code positions preserved verbatim.

**Phase 5**: A `/code` run that lands in a repo with a `design/` dir includes >=1 doc-section citation in the code bundle's `artefacts` layer, without a prompt-explicit request.

**Phase 6-8** (post-indexing summariser):

- Phase 6: `getDocSummariesForRepo(<current insrc-ide repo>)` returns >=10 summaries after a full re-index, each with populated `subjects`, `summary`, `keyDecisions`, `keyConstraints`.
- Phase 7: `/docs` runs against a summarised repo complete >=30% faster than against a non-summarised repo (the shaper skips redundant summarisation in-loop).
- Phase 8: `/code` runs in a summarised repo include a `constraints` citation block in `artefacts` when the code touches an area with known constraints.
