<!-- insrc:artifact PLAN-870ed3dd246225f4-s2 -->

# Plan: E20260731870ed3dd:S002

**Epic:** `documentation-generation-framework-docgen-produces-self`
**LLD run:** `wf-1785473021567-2ki0qv`
**LLD effective hash:** `cb5b27744db2...`

## Tasks

| # | Task | Size | Depends on | Tests | Derived from |
| :--- | :--- | :--- | :--- | :--- | :--- |
| 1 | **`t1`** Component-dependency pure core + read-seam + registration factory | M | — | unit: componentKey (segment-under-scope logic, bare-file fallback); unit: buildComponentDependencyIR (cross-module edge, intra-component drop, out-of-scope drop, isolated-node, dedupe, determinism deep-equal); unit: makeExtract -> 'source-not-ready' when reader.revision is undefined; unit: makeExtract -> 'empty-scope' when filesInScope is empty; unit: makeExtract -> ok(DocumentIR) with the expected edge count on a populated fake reader | [[c1]] [[c2]] [[c3]] [[c4]] |
| 2 | **`t2`** Graph-backed ComponentGraphReader | S | `t1` | smoke: generateDocument('component-dependency', {repo, path:'src'}) -> ok shell with component nodes + depends-on edges | [[c2]] [[c5]] |
| 3 | **`t3`** Generalize the shell renderer to dispatch by docType | S | `t1` | unit: documentIRToMermaid (flowchart LR body, n<i>[label] boxes, from --> to arrows, no classDiagram) | [[c6]] |
| 4 | **`t4`** Register component-dependency as the 2nd doc type | S | `t1`, `t2`, `t3` | smoke: The rendered HTML contains the flowchart arrows (as escaped --&gt;, decoded by the browser) and no <script src= (offline) | [[c4]] [[c7]] |
| 5 | **`t5`** Unit tests + end-to-end verification | S | `t1`, `t2`, `t3`, `t4` | unit: full component-dependency.test.ts suite (9 cases) green + full docgen suite (43) green; smoke: live-graph generateDocument smoke: 15 components + 44 depends-on edges, offline HTML | [[c8]] |

### E20260731870ed3dd:S002:T001 — Component-dependency pure core + read-seam + registration factory

Create src/docgen/extract/component-dependency.ts: COMPONENT_DEPENDENCY_DOCTYPE; the read-seam interfaces FileEntityLite/FileImportEdge/ComponentScope/ComponentGraphReader; componentKey (first path segment under the scope base, bare-file fallback); buildComponentDependencyIR (pure aggregation: files->component nodes, cross-component imports->deduped depends-on edges, intra-component + out-of-scope dropped, isolated components kept, derived-only DocumentIR with generatedAtRevision); parseScope; COMPONENT_DEPENDENCY_INPUT_SCHEMA; makeExtract (outcome routing: empty-scope / source-not-ready / ok); componentDependencyRegistration (the DocTypeRegistration factory — wiring into the registry is t4). Consumes sc1/sc2 unchanged; mirrors s1's type-structure.ts.

**Acceptance checks:**
- buildComponentDependencyIR yields IrNode kind='component' + deduped IrEdge kind='depends-on', narrated.sections=[]
- intra-component (a===b) and out-of-scope imports produce no edge; isolated components still emitted as nodes
- same inputs -> deep-equal IR (determinism); generatedAtRevision carried from the revision arg
- makeExtract returns typed empty-scope / source-not-ready outcomes rather than throwing
- componentDependencyRegistration returns a DocTypeRegistration with capability + COMPONENT_DEPENDENCY_INPUT_SCHEMA + bound extract()
- npx tsc --noEmit clean

### E20260731870ed3dd:S002:T002 — Graph-backed ComponentGraphReader

Create src/docgen/extract/component-graph-reader.ts binding ComponentGraphReader to the daemon graph layer: filesInScope via listEntitiesByKinds(['file']) + underScope path filter; importEdges via per-file entityU64ForId + outNeighbors({kindFilter:['IMPORTS']}) + entityIdsByU64s (drop unresolved external stubs); revision via listRepos (status 'ready' -> lastIndexed ?? addedAt). Serial per-file loop (no Promise.all over graph reads). Reads happen inside the daemon (k2).

**Acceptance checks:**
- reader implements the t1 ComponentGraphReader interface exactly
- importEdges resolves file->file IMPORTS to {fromFileId,toFileId} and drops unresolved endpoints
- revision returns undefined for a repo not in 'ready' status
- npx tsc --noEmit clean

### E20260731870ed3dd:S002:T003 — Generalize the shell renderer to dispatch by docType

Refactor src/docgen/render/shell.ts documentIRToMermaid from a single classDiagram emitter into a docType dispatch: toClassDiagram (s1, unchanged) vs toFlowchart (new: 'flowchart LR' + n<i>[label] boxes + 'from --> to' arrows). assembleShell/buildHtml/escapeHtml/escapeLabel untouched so the sc3 RenderedDocumentShell (offline, inlined runtimes, SVG, zoom/pan) is unchanged. This is the one edit touching a shared s1 file — the byte-identical type-structure check below is the load-bearing regression guard.

**Acceptance checks:**
- documentIRToMermaid(component-dependency IR) starts with 'flowchart LR' and emits 'from --> to' arrows
- type-structure IR still renders the identical classDiagram output as before (byte-unchanged) — HARD GATE
- assembleShell still returns backend='primary-inline', diagramFormat='svg', supportsZoomPan=true with inlined runtimes
- npx tsc --noEmit clean

### E20260731870ed3dd:S002:T004 — Register component-dependency as the 2nd doc type

In src/docgen/index.ts import componentDependencyRegistration + componentGraphReader and r.register(componentDependencyRegistration(componentGraphReader)) alongside the s1 type-structure registration. No new tool/IPC code — docgen_generate + docgen.generate enumerate the registry, so k4 tool/IPC/MCP parity is inherited automatically.

**Acceptance checks:**
- docgenRegistry.list() includes 'component-dependency'
- generateDocument('component-dependency', {repo, path}) resolves through get->extract->assembleShell to an ok shell
- no edit to src/docgen/tool.ts or the daemon IPC handler is required for s2 to be exposed

### E20260731870ed3dd:S002:T005 — Unit tests + end-to-end verification

Create src/docgen/extract/__tests__/component-dependency.test.ts (9 node:test cases: componentKey, cross-module edge, intra-component drop, out-of-scope drop, isolated-node, dedupe, determinism deep-equal, flowchart render, makeExtract outcomes via injected fake reader). Run the full docgen suite (which includes s1's shell tests as the t3 regression backstop) + npm run build + a live-graph smoke to close the green-unit/broken-integration gap.

**Acceptance checks:**
- the 9 unit tests pass; full docgen suite green (43)
- npm run build clean
- live smoke: generateDocument('component-dependency',{repo,path:'src'}) yields 15 components + 44 depends-on edges and offline HTML (no <script src=)

## Test-strategy coverage

| LLD strategy item | Covered by |
| :--- | :--- |
| componentKey (segment-under-scope logic, bare-file fallback) | `t1` |
| buildComponentDependencyIR (cross-module edge, intra-component drop, out-of-scope drop, isolated-node, dedupe, determinism deep-equal) | `t1` |
| documentIRToMermaid (flowchart LR body, n<i>[label] boxes, from --> to arrows, no classDiagram) | `t3` |
| makeExtract -> 'source-not-ready' when reader.revision is undefined | `t1` |
| makeExtract -> 'empty-scope' when filesInScope is empty | `t1` |
| makeExtract -> ok(DocumentIR) with the expected edge count on a populated fake reader | `t1` |
| generateDocument('component-dependency', {repo, path:'src'}) -> ok shell with component nodes + depends-on edges | `t2`, `t5` |
| The rendered HTML contains the flowchart arrows (as escaped --&gt;, decoded by the browser) and no <script src= (offline) | `t4`, `t5` |

## Citations

- **[[c1]]** `prior-artifact` `LLD s2 contractDetails.api — componentKey + buildComponentDependencyIR signatures and postconditions`
- **[[c2]]** `prior-artifact` `LLD s2 contractDetails.api — makeExtract + ComponentGraphReader read-seam; dataModelChanges FileEntityLite/FileImportEdge/ComponentScope`
- **[[c3]]** `prior-artifact` `LLD s2 errorPaths — makeExtract outcome routing (empty-scope / source-not-ready) and edgeCases (dedupe, intra-component, isolated-node)`
- **[[c4]]** `prior-artifact` `LLD s2 contractDetails.api + interactionWithShared sc2 — componentDependencyRegistration -> DocTypeRegistration`
- **[[c5]]** `code` `src/docgen/extract/component-graph-reader.ts (commit 77f4296) — listEntitiesByKinds ['file'] + outNeighbors IMPORTS + entityIdsByU64s + listRepos revision`
- **[[c6]]** `prior-artifact` `LLD s2 contractDetails.api documentIRToMermaid + interactionWithShared sc3 — flowchart/classDiagram docType dispatch on the shared shell`
- **[[c7]]** `prior-artifact` `LLD s2 interactionWithShared sc2 — registry enumeration gives automatic docgen_generate tool + docgen.generate IPC parity (k4), no new surface`
- **[[c8]]** `prior-artifact` `LLD s2 testStrategy — the 9-case unit suite + live-graph smoke (15 components / 44 depends-on edges) closing the green-unit/broken-integration gap`

<!-- insrc:review -->

## Review

### ✅ Review `PASS` — plan (plan)

**0 HIGH · 0 MED · 7 LOW** · model `client` · reviewed 2026-07-31T05:10:46.673Z

| Ref | Kind | Severity | Fixability | Premise | Evidence | Action |
| --- | --- | --- | --- | --- | --- | --- |
| pl1 | inventory | LOW | manual | src/docgen/extract/__tests__/component-dependency.test.ts contains 9 top-level test() cases (the t5 '9 cases' count). | grep -c '^test(' on component-dependency.test.ts returns exactly 9 — matches the plan's t5 '9 cases' count. | none — verified sound |
| pl2 | citation | LOW | manual | t1's target file src/docgen/extract/component-dependency.ts exists and exports componentKey, buildComponentDependencyIR, makeExtract, componentDependencyRegistration. | component-dependency.ts exports componentKey, buildComponentDependencyIR, makeExtract, componentDependencyRegistration (each 1 match; makeExtract's 2nd match is the parallel type-structure.ts). t1's target file + surface exist as planned. | none — verified sound |
| pl3 | citation | LOW | manual | t2's target file src/docgen/extract/component-graph-reader.ts exists and implements the reader via listEntitiesByKinds + outNeighbors IMPORTS + entityIdsByU64s + listRepos. | component-graph-reader.ts binds componentGraphReader with kindFilter:['IMPORTS'] and listRepos for revision — t2 target exists as planned. | none — verified sound |
| pl4 | citation | LOW | manual | t3's target src/docgen/render/shell.ts documentIRToMermaid dispatches to a flowchart for component-dependency and classDiagram otherwise. | shell.ts contains 'flowchart LR', 'classDiagram', and the 'component-dependency' dispatch — t3's docType dispatch is present. | none — verified sound |
| pl5 | inventory | LOW | manual | t4's claim of 'no new tool/IPC surface' holds: the docgen tool + IPC exist from s1 (docgen_generate tool id and a docgen.generate IPC handler) and enumerate the registry. | DOCGEN_TOOL_ID='docgen_generate' (tool.ts:25) and the docgen.generate (daemon/index.ts:1157) + docgen.list (1165) IPC handlers exist from s1 and use listDocTypes — t4's 'no new tool/IPC surface' premise holds. | none — verified sound |
| pl6 | citation | LOW | manual | t4 registers component-dependency as the 2nd doc type in src/docgen/index.ts alongside the s1 type-structure registration. | index.ts registers componentDependencyRegistration(componentGraphReader) alongside typeStructureRegistration(graphTypeReader) — component-dependency is the 2nd registered doc type as t4 states. | none — verified sound |
| pl7 | ordering | LOW | manual | The task dependency graph (t1<-{}, t2<-t1, t3<-t1, t4<-{t1,t2,t3}, t5<-{t1,t2,t3,t4}) is acyclic with order 1..5 a valid topological sort, respecting storyDependsOn=[s1]. | Task graph t1<-{}, t2<-t1, t3<-t1, t4<-{t1,t2,t3}, t5<-{t1,t2,t3,t4} is acyclic; order 1..5 is a valid topological sort and every task sits after s1 (storyDependsOn respected). | none — verified sound |
