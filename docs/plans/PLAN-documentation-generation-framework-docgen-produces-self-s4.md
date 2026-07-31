<!-- insrc:artifact PLAN-870ed3dd246225f4-s4 -->

# Plan: E20260731870ed3dd:S004

**Epic:** `documentation-generation-framework-docgen-produces-self`
**LLD run:** `wf-1785488046682-skwg6k`
**LLD effective hash:** `cb5b27744db2...`

## Tasks

| # | Task | Size | Depends on | Tests | Derived from |
| :--- | :--- | :--- | :--- | :--- | :--- |
| 1 | **`t1`** Narrative pure core + grounding + orchestration + registration factory | M | — | unit: buildAllowedEntitySet: derives the allowed vocabulary from a derived IR's node labels + citation entityIds (case/whitespace-normalized); unit: groundSections: keeps a section whose citedNames are all ∈ allowed; DROPS a section with any ungrounded cited name (ac1/k11); unit: groundSections: all-ungrounded input -> [] (fidelity over completeness, ac4); unit: buildNarrativeDocument: derived = base.derived byte-identical, narrated.sections = grounded sections, docType='narrative' (k8 partition); unit: makeExtract with a grounded fake generator -> ok narrative doc: derived diagram + grounded narrated.sections; unit: makeExtract when generator.available()=false -> ok(base derived IR), narrated.sections=[] (graceful, no fabrication); unit: makeExtract when generator.generate() rejects -> ok(base derived IR), narrated.sections=[] (degrade, logged); unit: makeExtract propagates a base extractor's non-ok outcome verbatim; unit: makeExtract -> 'empty-scope' on missing repo/base/scope param; unit: makeExtract dispatches base='call-sequence' vs 'component-dependency' to the right base extractor | [[c1]] [[c2]] [[c3]] [[c4]] |
| 2 | **`t2`** Provider-backed NarrativeGenerator (core-tier, k1-safe) | S | `t1` | live: generateDocument('narrative', {repo, base:'component-dependency', path, question}) via buildShaperProvider(core) -> ok doc whose narrated names are all graph-present, self-contained offline HTML; live: the provider used is the local Ollama/CLI provider (no cloud REST egress) | [[c2]] [[c5]] |
| 3 | **`t3`** Extend the shell to render a distinct narrated region (offline) | S | `t1` | unit: assembleShell(narrative IR) HTML contains a distinct '#docgen-narrative' region with section titles + escaped narrativeText; unit: narrativeText with <, >, & is escaped (no markup injection); no <script src= (offline, ac5); unit: assembleShell(derived-only IR, narrated.sections=[]) emits NO narrated region -> byte-identical to the pre-s4 shell | [[c6]] |
| 4 | **`t4`** Register narrative as the 4th doc type (base wiring + generator) | S | `t1`, `t2`, `t3` | unit: makeExtract routes narration only through the injected NarrativeGenerator (fake in unit; buildShaperProvider core in live) — no cloud REST path exists | [[c4]] [[c7]] |
| 5 | **`t5`** Fake-generator unit suite + shell regression + live-gated path | M | `t1`, `t2`, `t3`, `t4` | unit: full narrative.test.ts suite green + full docgen suite (56 + new) green; derived-only byte-identical regression; live: INSRC_LIVE_TESTS-gated real-provider narrative round-trip (skips when unset) | [[c8]] |

### E20260731870ed3dd:S004:T001 — Narrative pure core + grounding + orchestration + registration factory

Create src/docgen/extract/narrative.ts: NARRATIVE_DOCTYPE='narrative'; the NarrativeGenerator interface + NarrationRequest {question,scopeDescription,derived} + RawNarrativeSection {title,text,citedNames[]} types; the THREE pure fns — buildAllowedEntitySet(derived)->ReadonlySet<string> (node labels + node/edge citation entityIds, case/whitespace-normalized), groundSections(raw,allowed)->IrSection[] (KEEP only when every citedName ∈ allowed, DROP any section with an ungrounded name — fidelity terminal), buildNarrativeDocument(base,sections)->DocumentIR (derived=base.derived verbatim, narrated.sections=grounded, docType='narrative'); parseScope + NARRATIVE_INPUT_SCHEMA {repo,base,symbol?/path?,question}; makeExtract(bases,generator) orchestration (run bases[base] extract, short-circuit non-ok; build allowed set; if generator.available() generate→ground→buildNarrativeDocument, wrapped in try/catch degrade; else ok(base derived IR)); narrativeRegistration(bases,generator). Consumes sc1/sc2/sc4; mirrors the s2/s3 pure-core + injected-seam pattern. The grounding + degrade logic is the accuracy-critical part — every degrade branch is proven in t5, not assumed.

**Acceptance checks:**
- buildAllowedEntitySet returns node labels + citation entityIds, case/whitespace-normalized
- groundSections keeps fully-grounded sections + DROPS any section with an ungrounded cited name; all-ungrounded -> []
- buildNarrativeDocument: derived === base.derived (byte-identical), narrated.sections=grounded, docType='narrative'
- makeExtract: grounded fake generator -> ok narrative doc; available()=false or generate() rejects -> ok(base derived IR) narrated.sections=[]; base non-ok short-circuits verbatim; missing repo/base/scope -> empty-scope
- npx tsc --noEmit clean

### E20260731870ed3dd:S004:T002 — Provider-backed NarrativeGenerator (core-tier, k1-safe)

Create src/docgen/extract/narrative-generator.ts implementing NarrativeGenerator against buildShaperProvider(loadAnalyzeConfig()) (core tier, k1-safe — Ollama-local/CLI-OAuth, never cloud REST): available() returns provider.capabilities.structuredOutput; generate(req) builds a prompt from req.derived (the graph-present vocabulary + diagram) + req.question and calls provider.completeStructured(messages, RAW_SECTIONS_SCHEMA) exactly ONCE (serial await, no Promise.all). The prompt instructs the model to name ONLY entities present in the provided derived diagram (grounding hint) and to list citedNames per section. Exports the constructed narrativeGenerator singleton for index wiring. The real prompt/schema round-trip is exercised live-gated (t5); the available()/serial contract is unit-checkable.

**Acceptance checks:**
- available() reflects provider.capabilities.structuredOutput
- generate() calls completeStructured exactly once (serial) and returns RawNarrativeSection[]
- the provider is buildShaperProvider(core) — no direct cloud REST import/path (k1)
- npx tsc --noEmit clean

### E20260731870ed3dd:S004:T003 — Extend the shell to render a distinct narrated region (offline)

Extend src/docgen/render/shell.ts: thread ir.narrated.sections through assembleShell -> buildHtml; when non-empty, append a distinct '#docgen-narrative' region below the diagram — per section a title + escapeHtml(narrativeText), with a small inline style so narrated content is visually separable from the derived diagram (ac3), all inlined (no external fetch, ac5). When narrated.sections is EMPTY, emit NOTHING new so derived-only output (s1/s2/s3) is byte-identical. escapeHtml/assembleShell reused. This is the ONE regression-risk touch on a shared s1/s2/s3 file; the byte-identical check below is the load-bearing guard.

**Acceptance checks:**
- assembleShell(narrative IR) HTML has a distinct '#docgen-narrative' region with section titles + escaped narrativeText
- narrativeText with <, >, & is escaped (no markup injection); still no <script src= (offline, ac5)
- assembleShell(derived-only IR, narrated.sections=[]) emits NO narrated region -> byte-identical to the pre-s4 shell — HARD GATE
- npx tsc --noEmit clean

### E20260731870ed3dd:S004:T004 — Register narrative as the 4th doc type (base wiring + generator)

In src/docgen/index.ts import narrativeRegistration + narrativeGenerator, build bases={'call-sequence': callSequenceRegistration(callGraphReader).extract, 'component-dependency': componentDependencyRegistration(componentGraphReader).extract} from the already-constructed s2/s3 registrations, and r.register(narrativeRegistration(bases, narrativeGenerator)) as the 4th doc type. No new tool/IPC code — docgen_generate + docgen.generate enumerate the registry, so k4 tool/IPC/MCP parity is inherited.

**Acceptance checks:**
- docgenRegistry.list() includes 'narrative' (4 doc types total)
- generateDocument('narrative', {repo, base, ...}) resolves through get->extract->assembleShell to an ok shell
- no edit to src/docgen/tool.ts or the daemon IPC handler is required for s4 to be exposed

### E20260731870ed3dd:S004:T005 — Fake-generator unit suite + shell regression + live-gated path

Create src/docgen/extract/__tests__/narrative.test.ts: pure buildAllowedEntitySet/groundSections/buildNarrativeDocument fixtures (grounded/partial/all-ungrounded/casing); makeExtract against a FAKE NarrativeGenerator covering the FULL degrade matrix (grounded ok, available()=false degrade, generate() rejects degrade, all-ungrounded, base non-ok short-circuit, empty-scope, base dispatch) + fake base extract fns; shell narrated-region render + HTML-escaping + the derived-only byte-identical regression (the t3 backstop); an INSRC_LIVE_TESTS-gated real-provider case (skips when unset). Then run the full docgen suite + npm run build.

**Acceptance checks:**
- the new narrative tests pass; full docgen suite green (56 + new cases)
- npm run build clean
- every makeExtract degrade branch (unavailable / throws / all-ungrounded / base-non-ok) is covered by the fake-generator matrix
- the live-provider case is gated behind INSRC_LIVE_TESTS and skips cleanly when unset; derived-only byte-identical regression holds (s1/s2/s3 unaffected)

## Test-strategy coverage

| LLD strategy item | Covered by |
| :--- | :--- |
| buildAllowedEntitySet: derives the allowed vocabulary from a derived IR's node labels + citation entityIds (case/whitespace-normalized) | `t1` |
| groundSections: keeps a section whose citedNames are all ∈ allowed; DROPS a section with any ungrounded cited name (ac1/k11) | `t1` |
| groundSections: all-ungrounded input -> [] (fidelity over completeness, ac4) | `t1` |
| buildNarrativeDocument: derived = base.derived byte-identical, narrated.sections = grounded sections, docType='narrative' (k8 partition) | `t1` |
| makeExtract with a grounded fake generator -> ok narrative doc: derived diagram + grounded narrated.sections | `t1` |
| makeExtract when generator.available()=false -> ok(base derived IR), narrated.sections=[] (graceful, no fabrication) | `t1` |
| makeExtract when generator.generate() rejects -> ok(base derived IR), narrated.sections=[] (degrade, logged) | `t1` |
| makeExtract propagates a base extractor's non-ok outcome verbatim | `t1` |
| makeExtract -> 'empty-scope' on missing repo/base/scope param | `t1` |
| makeExtract dispatches base='call-sequence' vs 'component-dependency' to the right base extractor | `t1` |
| assembleShell(narrative IR) HTML contains a distinct '#docgen-narrative' region with section titles + escaped narrativeText | `t3` |
| narrativeText with <, >, & is escaped (no markup injection); no <script src= (offline, ac5) | `t3` |
| assembleShell(derived-only IR, narrated.sections=[]) emits NO narrated region -> byte-identical to the pre-s4 shell | `t3` |
| generateDocument('narrative', {repo, base:'component-dependency', path, question}) via buildShaperProvider(core) -> ok doc whose narrated names are all graph-present, self-contained offline HTML | `t2`, `t5` |
| the provider used is the local Ollama/CLI provider (no cloud REST egress) | `t2`, `t5` |

## Citations

- **[[c1]]** `prior-artifact` `LLD s4 contractDetails.api buildAllowedEntitySet + groundSections + buildNarrativeDocument — the pure grounding + assembly core`
- **[[c2]]** `prior-artifact` `LLD s4 contractDetails.api NarrativeGenerator + makeExtract + dataModelChanges NarrationRequest/RawNarrativeSection — the narrator seam + orchestration`
- **[[c3]]** `prior-artifact` `LLD s4 errorPaths — makeExtract degrade matrix (no-provider/throws/all-ungrounded/base-non-ok/empty-scope) + the fidelity-over-completeness drop rule`
- **[[c4]]** `prior-artifact` `LLD s4 contractDetails.api narrativeRegistration + interactionWithShared sc1/sc2 — registration + the validation-grounding (no sc1 amendment) decision`
- **[[c5]]** `prior-artifact` `LLD s4 citations c1/c2 — LLMProvider.completeStructured + buildShaperProvider(core) the k1-safe provider the generator wraps`
- **[[c6]]** `prior-artifact` `LLD s4 contractDetails.api assembleShell + interactionWithShared sc3 — the distinct #docgen-narrative offline region (ac3/ac5), derived-only byte-identical`
- **[[c7]]** `prior-artifact` `LLD s4 interactionWithShared sc2 — registry enumeration gives automatic docgen_generate tool + docgen.generate IPC parity (k4), no new surface; reuse of s2/s3 base registrations`
- **[[c8]]** `prior-artifact` `LLD s4 testStrategy — the fake-NarrativeGenerator unit suite (grounding + degrade matrix + shell) + the INSRC_LIVE_TESTS-gated real-provider path`

<!-- insrc:review -->

## Review

### ✅ Review `PASS` — plan (plan)

**0 HIGH · 0 MED · 7 LOW** · model `client` · reviewed 2026-07-31T09:15:18.453Z

| Ref | Kind | Severity | Fixability | Premise | Evidence | Action |
| --- | --- | --- | --- | --- | --- | --- |
| pl1 | citation | LOW | manual | t2 wires the k1-safe provider: buildShaperProvider (shaper-provider.ts) + loadAnalyzeConfig (config/analyze.ts) both exist. | buildShaperProvider at shaper-provider.ts:277 and loadAnalyzeConfig at config/analyze.ts:261 both exist — t2's k1-safe provider wiring is real. | none — verified sound |
| pl2 | citation | LOW | manual | t3's target shell.ts has assembleShell + buildHtml + escapeHtml today and NO narrated region (no '#docgen-narrative') — t3 adds it. | shell.ts has assembleShell + buildHtml + escapeHtml; grep -c 'docgen-narrative' src/docgen/render/shell.ts = 0 — the narrated region is genuinely new work t3 adds. | none — verified sound |
| pl3 | inventory | LOW | manual | src/docgen/index.ts currently registers 3 doc types (s1/s2/s3); t4 wires the s2/s3 registrations as bases and adds 'narrative' as the 4th. | grep -c 'r.register(' src/docgen/index.ts = 3 (s1/s2/s3); callSequenceRegistration + componentDependencyRegistration present to reuse as bases; t4 adds 'narrative' as the 4th. narrativeRegistration only in docs. | none — verified sound |
| pl4 | inventory | LOW | manual | t4's 'no new tool/IPC surface' premise holds: docgen_generate tool + docgen.generate IPC exist and enumerate the registry. | DOCGEN_TOOL_ID='docgen_generate' (tool.ts:25) and the docgen.generate IPC handler (daemon/index.ts:1157) exist and use listDocTypes — t4's 'no new tool/IPC surface' premise holds. | none — verified sound |
| pl5 | citation | LOW | manual | The s2/s3 base registrations t4 reuses exist: callSequenceRegistration + componentDependencyRegistration (each returns a DocTypeRegistration with a bound extract). | callSequenceRegistration (call-sequence.ts:221) + componentDependencyRegistration both exist and return a DocTypeRegistration with a bound extract — the base extractors t4 wires are real. | none — verified sound |
| pl6 | citation | LOW | manual | The new s4 files (narrative.ts, narrative-generator.ts, narrative.test.ts) do NOT yet exist — they are this plan's build output. | buildNarrativeDocument = 0 in src (only in the design docs); narrative.ts does not exist (ls: No such file) — correctly identifying the new s4 files as this plan's build output. | none — verified sound |
| pl7 | ordering | LOW | manual | The task DAG (t1<-{}, t2<-t1, t3<-t1, t4<-{t1,t2,t3}, t5<-{t1,t2,t3,t4}) is acyclic with order 1..5 a valid topological sort, respecting storyDependsOn=[s1]. | Task graph t1<-{}, t2<-t1, t3<-t1, t4<-{t1,t2,t3}, t5<-{t1,t2,t3,t4} is acyclic; order 1..5 is a valid topological sort; every task sits after s1 (storyDependsOn respected). | none — verified sound |
