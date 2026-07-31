<!-- insrc:artifact PLAN-870ed3dd246225f4-s3 -->

# Plan: E20260731870ed3dd:S003

**Epic:** `documentation-generation-framework-docgen-produces-self`
**LLD run:** `wf-1785474995815-k7r3n1`
**LLD effective hash:** `cb5b27744db2...`

## Tasks

| # | Task | Size | Depends on | Tests | Derived from |
| :--- | :--- | :--- | :--- | :--- | :--- |
| 1 | **`t1`** Call-sequence pure core + bounded DFS + read-seam + registration factory | M | — | unit: buildCallSequenceIR: frames -> 'call-frame' nodes + ordered 'calls' edges with entityId citations (ac1); unit: a repeat=true step kept as a marked 'calls' edge to the existing frame (ac2), never re-expanded; unit: a truncatedFrameId yields a derived 'truncation' marker node stating depthUsed (ac3); unit: repeated calls to the same callee preserve BOTH ordered steps (no dedupe); unit: same walk -> deep-equal IR (determinism); narrated.sections=[]; unit: makeExtract -> 'not-found' when resolveEntryPoint returns undefined (ac4); unit: makeExtract -> 'source-not-ready' / 'empty-scope'; unit: makeExtract over a CYCLIC fake reader terminates and marks the repeat step (ac2); unit: makeExtract over a deeper-than-maxDepth fake reader stops at the cap, records truncatedFrameIds + depthUsed, returns ok (ac3); unit: makeExtract drops a dangling callee but keeps the calling frame (k11) | [[c1]] [[c2]] [[c3]] [[c4]] |
| 2 | **`t2`** Graph-backed CallGraphReader | S | `t1` | smoke: generateDocument('call-sequence', {repo, symbol, maxDepth}) -> ok shell with a sequenceDiagram, entity-cited | [[c2]] [[c5]] |
| 3 | **`t3`** Add the sequenceDiagram dispatch branch to the shell renderer | S | `t1` | unit: documentIRToMermaid(call-sequence IR) starts with 'sequenceDiagram' + A->>B per ordered 'calls' edge; unit: cycle-repeat + truncation markers render as Note over the target; unit: type-structure (classDiagram) + component-dependency (flowchart) output stay byte-identical | [[c6]] |
| 4 | **`t4`** Register call-sequence as the 3rd doc type | S | `t1`, `t2`, `t3` | smoke: rendered HTML is a single self-contained file, no <script src=, states depth/truncation when the cap is hit | [[c4]] [[c7]] |
| 5 | **`t5`** Unit tests (traversal-specific) + end-to-end verification | S | `t1`, `t2`, `t3`, `t4` | unit: full call-sequence.test.ts suite green + full docgen suite (43 + new) green; smoke: live-graph call-sequence smoke on a real entry-point symbol: sequenceDiagram, entity-cited, offline HTML, truncation stated at the cap | [[c8]] |

### E20260731870ed3dd:S003:T001 — Call-sequence pure core + bounded DFS + read-seam + registration factory

Create src/docgen/extract/call-sequence.ts: CALL_SEQUENCE_DOCTYPE='call-sequence'; the read-seam interface CallGraphReader + types CallSequenceScope, CallFrameRef {entityId,name,file,startLine}, CallWalk {entry,frames,steps:{from,to,repeat}[],truncatedFrameIds,depthUsed}; the pure buildCallSequenceIR(walk,revision,scopeDescription) (frames->'call-frame' nodes with 'name (file:line)' label + entityId citation, ordered 'calls' edges, cycle-repeat steps kept as marked edges to the existing frame, 'truncation' marker nodes stating depthUsed; narrated.sections=[]); parseScope + CALL_SEQUENCE_INPUT_SCHEMA (repo + symbol + optional maxDepth); makeExtract (the bounded depth-limited DFS over reader.calleesOf with an on-path visited set for cycle termination + a maxDepth cap, materializing the CallWalk, routing to notFound/sourceNotReady/emptyScope/ok); callSequenceRegistration. The DFS + pure builder are tightly coupled (the DFS materializes the exact CallWalk the builder consumes) so they stay in one file, mirroring s2's single-file t1; DFS risk is contained by t5's cyclic/deep fake-reader tests. Consumes sc1/sc2/sc4 unchanged.

**Acceptance checks:**
- buildCallSequenceIR yields 'call-frame' nodes (entityId-cited) + ordered 'calls' edges; narrated.sections=[]
- a repeat=true step is kept as a marked 'calls' edge to the existing frame, never re-expanded (ac2)
- a truncatedFrameId yields a derived 'truncation' marker node stating depthUsed (ac3)
- repeated calls to the same callee preserve BOTH ordered steps (sequence multiplicity, no dedupe)
- makeExtract's DFS terminates on a cyclic adjacency (ac2) and stops at maxDepth (ac3); routes not-found (ac4)/source-not-ready/empty-scope
- same walk -> deep-equal IR (determinism); npx tsc --noEmit clean

### E20260731870ed3dd:S003:T002 — Graph-backed CallGraphReader

Create src/docgen/extract/call-graph-reader.ts implementing CallGraphReader: revision via listRepos ('ready' -> lastIndexed ?? addedAt); resolveEntryPoint via findEntitiesByName filtered to 'function'/'method' with a deterministic pick (stable (file,startLine) order) for the multi-match case; calleesOf via entityU64ForId + outNeighbors(u64,{kindFilter:['CALLS']}) + entityIdsByU64s, resolved to {entityId,name,file,startLine}, dropping any callee whose u64 has no resolvable id (dangling edge). Serial per-frame loop (no Promise.all over graph reads). Reads inside the daemon (k2); direct analogue of s2's component-graph-reader.ts.

**Acceptance checks:**
- reader implements the t1 CallGraphReader interface exactly
- resolveEntryPoint returns undefined for an unindexed symbol (ac4) and a deterministic single frame for a multi-match name
- calleesOf resolves CALLS successors to CallFrameRef in edge order and drops dangling targets (k11)
- revision returns undefined for a repo not in 'ready' status; npx tsc --noEmit clean

### E20260731870ed3dd:S003:T003 — Add the sequenceDiagram dispatch branch to the shell renderer

Extend src/docgen/render/shell.ts documentIRToMermaid with a THIRD branch: docType 'call-sequence' -> a new toSequenceDiagram emitter ('sequenceDiagram', one participant per 'call-frame' alias, 'from ->> to' per ordered 'calls' edge, 'Note over <target>' for a cycle-repeat step and for each 'truncation' marker). Keep toClassDiagram (type-structure) + toFlowchart (component-dependency) byte-identical. assembleShell/buildHtml/escapeHtml/escapeLabel untouched (sc3 offline shell unchanged). This is the ONE regression-risk touch on a shared s1/s2 file; the byte-identical check below is the load-bearing guard.

**Acceptance checks:**
- documentIRToMermaid(call-sequence IR) starts with 'sequenceDiagram' and emits a message per ordered 'calls' edge
- cycle-repeat + 'truncation' markers render as 'Note over' the target
- type-structure classDiagram + component-dependency flowchart output stay byte-identical — HARD GATE
- assembleShell still returns the sc3 shell (offline, inlined runtimes, SVG, zoom/pan); npx tsc --noEmit clean

### E20260731870ed3dd:S003:T004 — Register call-sequence as the 3rd doc type

In src/docgen/index.ts import callSequenceRegistration + callGraphReader and r.register(callSequenceRegistration(callGraphReader)) alongside the s1 type-structure + s2 component-dependency registrations. No new tool/IPC code — docgen_generate + docgen.generate enumerate the registry, so k4 tool/IPC/MCP parity is inherited automatically.

**Acceptance checks:**
- docgenRegistry.list() includes 'call-sequence' (3 doc types total)
- generateDocument('call-sequence', {repo, symbol, maxDepth}) resolves through get->extract->assembleShell to an ok shell
- no edit to src/docgen/tool.ts or the daemon IPC handler is required for s3 to be exposed

### E20260731870ed3dd:S003:T005 — Unit tests (traversal-specific) + end-to-end verification

Create src/docgen/extract/__tests__/call-sequence.test.ts: pure-core buildCallSequenceIR fixtures (linear chain, cycle, depth-truncated frame, leaf, double-call, determinism); makeExtract against a fake CallGraphReader with cyclic/deep/dangling adjacency exercising cycle-termination (ac2), depth-cap (ac3), not-found (ac4), source-not-ready/empty-scope; the sequenceDiagram render + a byte-identical s1/s2 regression assertion (the t3 backstop). Then run the full docgen suite + npm run build + a live-graph smoke on a real entry-point symbol.

**Acceptance checks:**
- the new call-sequence tests pass; full docgen suite green (43 + new cases)
- npm run build clean
- live smoke: generateDocument('call-sequence',{repo, symbol:<real fn>, maxDepth}) -> ok sequenceDiagram, entity-cited, single self-contained file (no <script src=), truncation stated when the cap is hit

## Test-strategy coverage

| LLD strategy item | Covered by |
| :--- | :--- |
| buildCallSequenceIR: frames -> 'call-frame' nodes + ordered 'calls' edges with entityId citations (ac1) | `t1` |
| a repeat=true step kept as a marked 'calls' edge to the existing frame (ac2), never re-expanded | `t1` |
| a truncatedFrameId yields a derived 'truncation' marker node stating depthUsed (ac3) | `t1` |
| repeated calls to the same callee preserve BOTH ordered steps (no dedupe) | `t1` |
| same walk -> deep-equal IR (determinism); narrated.sections=[] | `t1` |
| makeExtract -> 'not-found' when resolveEntryPoint returns undefined (ac4) | `t1` |
| makeExtract -> 'source-not-ready' / 'empty-scope' | `t1` |
| makeExtract over a CYCLIC fake reader terminates and marks the repeat step (ac2) | `t1` |
| makeExtract over a deeper-than-maxDepth fake reader stops at the cap, records truncatedFrameIds + depthUsed, returns ok (ac3) | `t1` |
| makeExtract drops a dangling callee but keeps the calling frame (k11) | `t1` |
| documentIRToMermaid(call-sequence IR) starts with 'sequenceDiagram' + A->>B per ordered 'calls' edge | `t3` |
| cycle-repeat + truncation markers render as Note over the target | `t3` |
| type-structure (classDiagram) + component-dependency (flowchart) output stay byte-identical | `t3` |
| generateDocument('call-sequence', {repo, symbol, maxDepth}) -> ok shell with a sequenceDiagram, entity-cited | `t2`, `t5` |
| rendered HTML is a single self-contained file, no <script src=, states depth/truncation when the cap is hit | `t4`, `t5` |

## Citations

- **[[c1]]** `prior-artifact` `LLD s3 contractDetails.api buildCallSequenceIR + dataModelChanges CallWalk/CallFrameRef — the pure core + IR shape`
- **[[c2]]** `prior-artifact` `LLD s3 contractDetails.api CallGraphReader + makeExtract — the read-seam + bounded-DFS extractor`
- **[[c3]]** `prior-artifact` `LLD s3 errorPaths — makeExtract outcome routing (not-found/source-not-ready/empty-scope) + edgeCases (cycle, depth, leaf, double-call, dangling)`
- **[[c4]]** `prior-artifact` `LLD s3 contractDetails.api callSequenceRegistration + interactionWithShared sc2/sc4 — registration + the in-IR-truncation (not terminal sc4 'truncated') decision`
- **[[c5]]** `prior-artifact` `LLD s3 citations c1/c2/c3 — the CALLS graph primitives (outNeighbors CALLS, findEntitiesByName, entityIdsByU64s, listRepos, Entity.startLine) the reader binds to`
- **[[c6]]** `prior-artifact` `LLD s3 contractDetails.api documentIRToMermaid + interactionWithShared sc3 — the third sequenceDiagram dispatch branch on the shared shell`
- **[[c7]]** `prior-artifact` `LLD s3 interactionWithShared sc2 — registry enumeration gives automatic docgen_generate tool + docgen.generate IPC parity (k4), no new surface`
- **[[c8]]** `prior-artifact` `LLD s3 testStrategy — the pure-core + fake-reader traversal unit suite + live-graph smoke closing the green-unit/broken-integration gap`

<!-- insrc:review -->

## Review

### ✅ Review `PASS` — plan (plan)

**0 HIGH · 0 MED · 6 LOW** · model `client` · reviewed 2026-07-31T05:50:54.643Z

| Ref | Kind | Severity | Fixability | Premise | Evidence | Action |
| --- | --- | --- | --- | --- | --- | --- |
| pl1 | citation | LOW | manual | t3's target src/docgen/render/shell.ts has documentIRToMermaid with existing classDiagram + flowchart branches that t3 extends with a third; a call-sequence branch does NOT yet exist. | shell.ts has documentIRToMermaid with flowchart + classDiagram branches; grep -c 'sequenceDiagram' src/docgen/render/shell.ts = 0, so t3's third branch is genuinely new work that extends a real dispatch. | none — verified sound |
| pl2 | inventory | LOW | manual | src/docgen/index.ts currently registers exactly 2 doc types (type-structure s1 + component-dependency s2); t4 adds call-sequence as the 3rd. | grep -c 'r.register(' src/docgen/index.ts = 2 (typeStructureRegistration s1 + componentDependencyRegistration s2); t4 correctly adds call-sequence as the 3rd. callSequenceRegistration currently appears only in the LLD/PLAN docs, not src. | none — verified sound |
| pl3 | inventory | LOW | manual | t4's 'no new tool/IPC surface' premise holds: docgen_generate tool + docgen.generate IPC exist from s1 and enumerate the registry via listDocTypes. | docgen_generate, docgen.generate, listDocTypes, and generateDocument all resolve in src — the s1 tool + IPC exist and enumerate the registry, so t4's 'no new tool/IPC surface' premise holds. | none — verified sound |
| pl4 | citation | LOW | manual | The CALLS-graph primitives t1/t2 bind to all exist: outNeighbors (kindFilter CALLS), findEntitiesByName, entityIdsByU64s/entityU64ForId, listRepos. | outNeighbors, findEntitiesByName, entityIdsByU64s, and listRepos all exist as exported functions — the CALLS-graph primitives t1/t2 bind to are real. | none — verified sound |
| pl5 | citation | LOW | manual | The s2 extractor + reader files the plan mirrors exist (component-dependency.ts, component-graph-reader.ts); the new s3 files (call-sequence.ts, call-graph-reader.ts, call-sequence.test.ts) do NOT yet exist (they are this plan's build output). | The mirrored s2 files (component-dependency.ts buildComponentDependencyIR + componentGraphReader) exist; the new s3 files (call-sequence.ts, call-graph-reader.ts) do NOT exist (ls: No such file), correctly identifying them as this plan's build output. buildCallSequenceIR appears only in the design docs. | none — verified sound |
| pl6 | ordering | LOW | manual | The task DAG (t1<-{}, t2<-t1, t3<-t1, t4<-{t1,t2,t3}, t5<-{t1,t2,t3,t4}) is acyclic with order 1..5 a valid topological sort, respecting storyDependsOn=[s1]. | Task graph t1<-{}, t2<-t1, t3<-t1, t4<-{t1,t2,t3}, t5<-{t1,t2,t3,t4} is acyclic; order 1..5 is a valid topological sort; every task sits after s1 (storyDependsOn respected). | none — verified sound |
