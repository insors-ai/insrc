<!-- insrc:artifact LLD-870ed3dd246225f4-s4 -->

# LLD: E20260731870ed3dd:S004

**Epic:** `documentation-generation-framework-docgen-produces-self`
**HLD base run:** `wf-1785421889464-2ayzlc`
**HLD effective hash:** `cb5b27744db2...`

## HLD context

**Framework:** IR is the hard boundary between graph-derived and LLM-narrated content (structural derived/narrated partition); cross-cutting failure reporting is one shared outcome envelope; registry-enumeration gives automatic tool/IPC/MCP parity; renderers assemble into the identical single self-contained offline shell.
**Rollout phase:** Phase C — Narrative annotation & oversized-scope fallback
**Consumes:** `sc1` (DocumentIR), `sc2` (DocTypeRegistration), `sc3` (RenderedDocumentShell)

## Contract details

**Surface level:** internal

### `NarrativeGenerator`

```typescript
interface NarrativeGenerator { available(): boolean; generate(req: NarrationRequest): Promise<readonly RawNarrativeSection[]> }
```

**Parameters:**
- `available: () => boolean` — Gate: true only when the bound LLMProvider.capabilities.structuredOutput is true (else s4 returns the derived diagram alone rather than fabricating).
- `generate: (req: NarrationRequest) => Promise<readonly RawNarrativeSection[]>` — Produce raw narrated sections via the injected core-tier LLMProvider.completeStructured (k1-safe, ac2/ac4). Prod wraps buildShaperProvider(core); a fake returns canned output in tests.

**Returns:** `NarrativeGenerator` — The injected narrator seam — the ONLY LLM touch-point; keeps makeExtract provider-agnostic + daemon-owned (k2). Serial awaits only.

**Preconditions:**
- Bound to buildShaperProvider(core-tier) in production (ac4) or a fake in tests.

**Postconditions:**
- generate() calls completeStructured once per request; no cloud REST (k1).

### `buildAllowedEntitySet`

```typescript
function buildAllowedEntitySet(derived: DocumentIR): ReadonlySet<string>
```

**Parameters:**
- `derived: DocumentIR` — The base derived diagram whose graph-present entities bound what narration may name.

**Returns:** `ReadonlySet<string>` — The allowed vocabulary — derived node labels + node/edge citation entityIds (graph-backed), case/whitespace-normalized for matching.

**Preconditions:**
- derived is the ok base IR.

**Postconditions:**
- Pure + deterministic; no I/O.

### `groundSections`

```typescript
function groundSections(raw: readonly RawNarrativeSection[], allowed: ReadonlySet<string>): IrSection[]
```

**Parameters:**
- `raw: readonly RawNarrativeSection[]` — The narrator's raw sections {title, text, citedNames[]}.
- `allowed: ReadonlySet<string>` — The graph-present vocabulary from buildAllowedEntitySet.

**Returns:** `IrSection[]` — Validated narrated sections {id,title,narrativeText}: KEEP only when every citedName ∈ allowed; DROP a section with any ungrounded cited name (fidelity over completeness, ac1/ac4/k11). No sc1 type change.

**Preconditions:**
- Pure: no I/O; provenance is implied by placement under narrated.sections (k8).

**Postconditions:**
- Every surviving section's cited names are graph-present (ac1); ungrounded sections dropped, never rewritten.

### `buildNarrativeDocument`

```typescript
function buildNarrativeDocument(base: DocumentIR, sections: readonly IrSection[]): DocumentIR
```

**Parameters:**
- `base: DocumentIR` — The base derived diagram (from s2/s3) supplying derived.nodes/edges + generatedAtRevision.
- `sections: readonly IrSection[]` — The grounded narrated sections to attach.

**Returns:** `DocumentIR` — A narrative DocumentIR: derived = base.derived (unchanged, graph-backed), narrated.sections = grounded sections, docType='narrative', generatedAtRevision from base. Structural partition keeps provenance type-enforced (k8/ac3).

**Preconditions:**
- Pure: no I/O; base.derived carried through verbatim.

**Postconditions:**
- derived byte-identical to the base diagram; narration lives ONLY under narrated (k8).

### `makeExtract`

```typescript
function makeExtract(bases: Record<string, (input: Record<string, unknown>) => Promise<DocGenOutcome<DocumentIR>>>, generator: NarrativeGenerator): (input: Record<string, unknown>) => Promise<DocGenOutcome<DocumentIR>>
```

**Parameters:**
- `bases: Record<string, extract-fn>` — The reused base derived extractors keyed by docType ('call-sequence' flow, 'component-dependency' topology) — the shipped s2/s3 extract fns.
- `generator: NarrativeGenerator` — The injected narrator seam.

**Returns:** `(input) => Promise<DocGenOutcome<DocumentIR>>` — Parse {repo, base, symbol|path, question}; run the chosen base extractor (non-ok short-circuits, sc4); build the allowed set; if generator.available() run generate → groundSections → buildNarrativeDocument; else return the base derived IR alone. ok(DocumentIR).

**Errors:**
- `DocGenOutcome 'empty-scope'` when input lacks a non-empty 'repo', a valid 'base' docType, or the base's required scope param (symbol|path).
- `DocGenOutcome (base outcome)` when the base extractor's non-ok outcome is returned verbatim (sc4 short-circuit).

**Preconditions:**
- bases contains the requested base docType; generator bound to a core-tier provider or fake.

**Postconditions:**
- Narration is additive: an unavailable/failing generator still yields the grounded derived diagram (ac2 fidelity, no fabrication). Every narrated name is graph-present (ac1).

### `narrativeRegistration`

```typescript
function narrativeRegistration(bases: Record<string, extract-fn>, generator: NarrativeGenerator): DocTypeRegistration
```

**Parameters:**
- `bases: Record<string, extract-fn>` — The reused base derived extractors.
- `generator: NarrativeGenerator` — The narrator seam bound into extract().

**Returns:** `DocTypeRegistration` — The sc2 registration for docType 'narrative': capability + NARRATIVE_INPUT_SCHEMA (repo + base + symbol?/path? + question) + bound extract().

**Preconditions:**
- Registered once into docgenRegistry as the 4th doc type, alongside s1/s2/s3.

**Postconditions:**
- Enumerable via registry.list() -> automatic tool/IPC/MCP parity (k4).

### `assembleShell`

```typescript
function assembleShell(ir: DocumentIR): Promise<DocGenOutcome<RenderedDocumentShell>>
```

**Parameters:**
- `ir: DocumentIR` — The IR to render; when narrated.sections is non-empty the shell now renders them.

**Returns:** `Promise<DocGenOutcome<RenderedDocumentShell>>` — Existing assembler EXTENDED: buildHtml renders narrated.sections into a distinct '#docgen-narrative' region below the diagram (ac3), escaped + inlined offline (ac5). A derived-only IR produces byte-identical output to today (s1/s2/s3 unaffected). RenderedDocumentShell shape unchanged (sc3).

**Errors:**
- `DocGenOutcome 'fallback-unavailable'` when the offline runtime asset is missing (existing behaviour, unchanged).

**Preconditions:**
- Vendored runtime present (unchanged).

**Postconditions:**
- Narrated region visually distinct (ac3); no external fetch (ac5); derived-only output byte-identical.

## Data model changes

### `NarrationRequest / RawNarrativeSection (s4-internal narrator types)` — new

NarrationRequest = { question: string; scopeDescription: string; derived: DocumentIR }. RawNarrativeSection = { title: string; text: string; citedNames: readonly string[] } — the narrator's structured output BEFORE grounding (completeStructured schema shape). Private to s4; the grounded result is plain sc1 IrSection.

**Call sites:**
- `src/docgen/extract/narrative.ts (new)`
- `src/docgen/extract/narrative-generator.ts (new — wraps buildShaperProvider(core).completeStructured)`

### `DocumentIR (narrative instance)` — invariant-change

s4 is the FIRST story to populate sc1's narrated.sections: derived = the base s2/s3 diagram (unchanged, graph-backed), narrated.sections = grounded IrSection {id,title,narrativeText}, docType='narrative'. No change to the sc1 TYPE; grounding is a generation-time validation (groundSections), so NO sc1 amendment is proposed (a1). Provenance stays type-enforced by the structural partition (k8).

**Call sites:**
- `src/docgen/extract/narrative.ts`
- `src/docgen/types.ts (DocumentIR, owned by s1)`

### `RenderedDocumentShell (narrated rendering)` — invariant-change

assembleShell/buildHtml in src/docgen/render/shell.ts is extended to render narrated.sections into a distinct '#docgen-narrative' region; no change to the sc3 TYPE. A derived-only IR renders byte-identically to today (the region is only emitted when narrated.sections is non-empty).

**Call sites:**
- `src/docgen/render/shell.ts`

## Interaction with shared contracts

| Contract | Role | How |
| :--- | :--- | :--- |
| `sc1` | consumes | Populates narrated.sections with the built IrSection {id,title,narrativeText}; carries the base s2/s3 derived diagram through verbatim. Grounding is validation-time (groundSections) so NO sc1 type change is needed (the a2 IrSection.citations fieldAdd is a documented, deferred follow-up). Provenance type-enforced by the structural partition (k8). |
| `sc2` | consumes | narrativeRegistration -> DocTypeRegistration, registered as the 4th doc type in src/docgen/index.ts; enumerated by the single registry (k4). extractorInputSchema adds base + symbol?/path? + question. No change to sc2. |
| `sc3` | consumes | Extends assembleShell/buildHtml to render narrated.sections in a distinct offline region (ac3/ac5); the RenderedDocumentShell shape is unchanged and derived-only output stays byte-identical (s1/s2/s3 unaffected). |

## Error paths

### Error cases

- **The chosen base docType is unknown, or the base's required scope param is missing (no 'repo', bad 'base', no 'symbol'/'path').** (recoverable)
  - Detection: parseScope finds input['repo']/input['base'] invalid, or bases[base] is undefined, or the base extractor itself returns empty-scope; makeExtract checks the parsed scope + `bases[base] === undefined`.
  - Response: Return DocGenOutcome 'empty-scope' naming the missing piece; no base run, no narration.
  - User impact: The malformed request is reported rather than a blank or fabricated doc.
- **The base derived extractor fails (entry symbol not indexed, repo not ready, empty scope).** (recoverable)
  - Detection: The awaited base extract() returns a non-ok DocGenOutcome; makeExtract checks `if (baseOut.status !== 'ok')`.
  - Response: Return the base outcome VERBATIM (not-found / source-not-ready / empty-scope) via sc4 short-circuit; the narrator is never invoked.
  - User impact: The caller gets the exact underlying reason, consistent with s2/s3.
- **No structured-output-capable provider is available (capabilities.structuredOutput=false, e.g. a stub provider).** (recoverable)
  - Detection: generator.available() returns false (it checks the bound LLMProvider.capabilities.structuredOutput).
  - Response: Skip narration entirely and return ok(base derived IR) — the grounded diagram alone, narrated.sections=[]; log the skip.
  - User impact: The reader still gets a faithful graph-backed diagram with no narration, rather than fabricated or absent output (ac2 fidelity).
- **The narrator (completeStructured) throws or times out (model error, malformed JSON after retries).** (recoverable)
  - Detection: The awaited generator.generate() rejects; makeExtract wraps the call in try/catch.
  - Response: Log the provider error and return ok(base derived IR) with narrated.sections=[] — the derived diagram degrades gracefully.
  - User impact: A model hiccup never denies the developer the graph-backed diagram; narration is best-effort additive.
- **The narrator names entities NOT in the indexed code (hallucinated symbols).** (recoverable)
  - Detection: groundSections checks each RawNarrativeSection.citedNames ⊆ the buildAllowedEntitySet vocabulary; any name not in the set marks the section ungrounded.
  - Response: DROP the offending section (not rewritten or kept with a warning) — only fully-grounded sections survive into narrated.sections.
  - User impact: Every symbol the final narrative names is graph-present (ac1/k11); the reader never sees an invented reference.
- **The offline runtime asset is missing at shell-assembly time.** (recoverable)
  - Detection: assembleShell's loadRuntime throws on readFile; caught (existing behaviour shared with s1/s2/s3).
  - Response: Return DocGenOutcome 'fallback-unavailable' naming the copy-assets ship step; never a CDN fetch (k5).
  - User impact: Actionable build-config error; no view-time network dependency (ac5).

### Edge cases

| Input | Expected |
| :--- | :--- |
| The narrator returns valid sections but ALL cite an ungrounded name. | groundSections drops every section; narrated.sections=[]; the doc renders as the grounded diagram alone (fidelity over completeness, ac4). |
| The narrator returns zero sections. | narrated.sections=[]; ok(derived diagram); the narrated region is omitted from the HTML (no empty block), so a reader still gets the diagram (ac5). |
| A narrated section cites a name using different casing/whitespace than the derived label. | buildAllowedEntitySet is case/whitespace-normalized so an exact-entity reference in any reasonable casing is accepted; a genuinely different name is still rejected (identity, not fuzzy match). |
| base='component-dependency' (topology) vs base='call-sequence' (flow). | The same makeExtract serves both by dispatching to bases[base]; the derived diagram differs (flowchart vs sequenceDiagram) but narration + grounding + rendering are identical. |
| narrativeText contains HTML-hostile characters (<, >, &) from the model. | The shell's escapeHtml escapes the prose before inlining into '#docgen-narrative', so the single-file document stays well-formed offline (ac5) and cannot inject markup. |
| A derived-only doc (s1/s2/s3, narrated.sections=[]) rendered by the extended shell. | buildHtml emits NO narrated region; output is byte-identical to the pre-s4 shell — s1/s2/s3 regression-safe. |

### Invariants to preserve

- Structural diagram content stays graph-derived and the LLM is confined to narrated.sections — s4 carries the base derived diagram through verbatim and never lets narration into derived (k8, type-enforced by the sc1 partition). [[c9]]
- No direct cloud REST from this process: narration goes only through the injected LLMProvider (buildShaperProvider: Ollama-local / CLI-OAuth), with no fallback reaching a cloud endpoint (k1). [[c7]]
- Every symbol/participant/component named in the final document is graph-present — derived nodes are graph-cited and narrated names are validated ⊆ the derived entity set, ungrounded ones dropped (k11). [[c10]]
- Reads + generation happen inside the daemon via injected seams (graph reader, narrator); the pure builders perform no I/O, so callers reach the capability only over IPC (k2). [[c10]]

## Test strategy

**Test framework:** `node:test + node:assert/strict, run via npx tsx --test (the repo's existing convention; mirrors the s1/s2/s3 docgen tests). LLM-touching tests use an injected FAKE NarrativeGenerator; any real-provider path is gated behind INSRC_LIVE_TESTS and skips cleanly when unset.`

### Test levels

- **unit** — Prove the pure grounding + document-assembly core with hand-built fixtures — no model, no graph.
  - Subjects: `buildAllowedEntitySet: derives the allowed vocabulary from a derived IR's node labels + citation entityIds (case/whitespace-normalized)`, `groundSections: keeps a section whose citedNames are all ∈ allowed; DROPS a section with any ungrounded cited name (ac1/k11)`, `groundSections: all-ungrounded input -> [] (fidelity over completeness, ac4)`, `buildNarrativeDocument: derived = base.derived byte-identical, narrated.sections = grounded sections, docType='narrative' (k8 partition)`
  - Fixtures: `A hand-built base DocumentIR (small component-dependency or call-sequence IR with known node labels + citations)`, `RawNarrativeSection fixtures: fully-grounded, partially-ungrounded, all-ungrounded`
- **unit** — Prove makeExtract's orchestration + outcome routing against an injected FAKE NarrativeGenerator + fake base extractors — no real model (ac2 without a network call).
  - Subjects: `makeExtract with a grounded fake generator -> ok narrative doc: derived diagram + grounded narrated.sections`, `makeExtract when generator.available()=false -> ok(base derived IR), narrated.sections=[] (graceful, no fabrication)`, `makeExtract when generator.generate() rejects -> ok(base derived IR), narrated.sections=[] (degrade, logged)`, `makeExtract propagates a base extractor's non-ok outcome verbatim`, `makeExtract -> 'empty-scope' on missing repo/base/scope param`, `makeExtract dispatches base='call-sequence' vs 'component-dependency' to the right base extractor`
  - Fixtures: `A fake NarrativeGenerator (canned RawNarrativeSection[] + toggleable available())`, `Fake base extract fns returning a canned ok IR and canned non-ok outcomes`
- **unit** — Prove the shell renders a distinct narrated region offline without regressing s1/s2/s3.
  - Subjects: `assembleShell(narrative IR) HTML contains a distinct '#docgen-narrative' region with section titles + escaped narrativeText`, `narrativeText with <, >, & is escaped (no markup injection); no <script src= (offline, ac5)`, `assembleShell(derived-only IR, narrated.sections=[]) emits NO narrated region -> byte-identical to the pre-s4 shell`
  - Fixtures: `A narrative DocumentIR with a couple of grounded sections (one with HTML-hostile chars); a derived-only IR`
- **live** — Prove the real core-tier provider path end-to-end (ac2/ac4 with an actual local model), gated + skipped in CI.
  - Subjects: `generateDocument('narrative', {repo, base:'component-dependency', path, question}) via buildShaperProvider(core) -> ok doc whose narrated names are all graph-present, self-contained offline HTML`, `the provider used is the local Ollama/CLI provider (no cloud REST egress)`
  - Fixtures: `INSRC_LIVE_TESTS=1 + a ready-indexed repo + a configured core-tier provider (skips when unset)`

### Acceptance mapping

| Criterion | Proving tests |
| :--- | :--- |
| `ac1` | `groundSections keeps grounded / drops ungrounded sections`, `makeExtract with a grounded fake generator -> narrated names ⊆ the derived entity set; derived diagram nodes are graph-cited`, `live: generateDocument('narrative') -> every narrated name is graph-present` |
| `ac2` | `makeExtract routes narration only through the injected NarrativeGenerator (fake in unit; buildShaperProvider core in live) — no cloud REST path exists`, `live: the provider is the local Ollama/CLI provider` |
| `ac3` | `buildNarrativeDocument keeps derived byte-identical + narration under narrated (structural partition, k8)`, `assembleShell renders a distinct '#docgen-narrative' region separable from the diagram` |
| `ac4` | `groundSections drops ungrounded sections (fidelity over completeness)`, `makeExtract uses the core-tier generator (not the cheap summariser) and, when unavailable/failing, degrades to the faithful diagram rather than fabricating` |
| `ac5` | `assembleShell(narrative IR) HTML has no <script src=, inlined runtimes, SVG diagram + escaped narrated region in one file`, `assembleShell(derived-only IR) stays byte-identical (offline guarantee unbroken)` |

## Alternatives considered

### a1: Compose s2/s3 derived diagram + validation-grounded narration + core-tier provider (no contract change) — **CHOSEN**

A 'narrative' doc type that runs a chosen base derived extractor for the diagram, then generates narrated sections via the core-tier LLMProvider and validates every cited name against the derived entity set — dropping ungrounded claims; the shell gains a distinct narrated region.



### a2: Compose + sc1 IrSection.citations fieldAdd (amendment) for stored back-links

Same composition + validation as a1, but amend sc1's IrSection with a non-breaking citations field so each narrated section stores the entityIds it references.



**Rejected because:** sc1 'partial' — amending a shared contract owned by s1 adds coordination + re-review for a benefit ac3 does not require (a1's structural partition + distinct render region already satisfy 'distinguishable'). The citations fieldAdd is a clean deferred FOLLOW-UP if clickable provenance is later wanted.

### a3: Standalone narrative extractor with its own derived scaffold

s4 builds its OWN derived diagram instead of composing s2/s3, then narrates + validates over it.



**Rejected because:** Duplicates the shipped s2/s3 CALLS/IMPORTS + citation logic — violates k10 (reuse before re-plumbing) and the HLD's 'additive registration over IR extractors', adding a second graph-faithfulness surface for the riskiest story. ac1 only 'partial'; no AC it satisfies better than a1.

## Citations

- **[[c1]]** `code` `src/shared/types.ts:177 LLMProvider (complete + completeStructured<T> + capabilities.structuredOutput) — the narrator seam's provider interface`
- **[[c2]]** `code` `src/analyze/context/shaper-provider.ts:277 buildShaperProvider(core-tier, k1-safe Ollama/CLI) vs buildSummariserProvider(cheap) — ac2/ac4 provider selection`
- **[[c3]]** `code` `src/docgen/types.ts:51 IrSection {id,title,narrativeText} (no citation field) + DocumentIR derived/narrated partition — grounding is validation-time, no sc1 change`
- **[[c4]]** `code` `src/docgen/extract/call-sequence.ts + component-dependency.ts — the reused s2/s3 base derived extractors (the grounded diagram scaffold)`
- **[[c5]]** `code` `src/docgen/render/shell.ts assembleShell/buildHtml (line 184/208) — renders ONLY #docgen-diagram today; s4 adds the distinct #docgen-narrative region (ac3/ac5)`
- **[[c6]]** `code` `src/docgen/index.ts docgenRegistry + generateDocument — s4 registers 'narrative' as the 4th doc type; docgen_generate/docgen.generate inherited (k4)`
- **[[c7]]** `convention` `HLD assumption c7 (k1): no direct cloud REST; LLM content via the local/CLI provider only`
- **[[c9]]** `convention` `HLD assumption c9 (k8): structural diagram content graph-derived, LLM confined to narrative`
- **[[c10]]** `convention` `HLD assumption c10 (k2/k11): daemon owns access; every named symbol graph-present, no raw dumps`
- **[[c8]]** `step-output` `s8 checklist.verify — all 18 items passed (cd1-3, dm1-2, int1-2, ep1-3, ts1-2, mg1-2, alt1-2, sbdry1-4)`

<!-- insrc:review -->

## Review

### ✅ Review `PASS` — design.story (design.story)

**0 HIGH · 0 MED · 7 LOW** · model `client` · reviewed 2026-07-31T09:05:03.714Z

| Ref | Kind | Severity | Fixability | Premise | Evidence | Action |
| --- | --- | --- | --- | --- | --- | --- |
| cl1 | citation | LOW | manual | LLMProvider in src/shared/types.ts exposes completeStructured and a capabilities object with structuredOutput — the narrator seam's interface. | src/shared/types.ts:177 interface LLMProvider; :216 completeStructured<T>; :232 readonly structuredOutput:boolean — the narrator seam's provider interface exists as cited. | none — verified sound |
| cl2 | citation | LOW | manual | buildShaperProvider(cfg) exists in src/analyze/context/shaper-provider.ts and returns an LLMProvider (the core-tier, k1-safe provider s4 uses); buildSummariserProvider is the cheap tier. | buildShaperProvider at shaper-provider.ts:277 and buildSummariserProvider both exist — the core-tier (k1-safe) vs cheap-tier provider selection s4 leans on is real. | none — verified sound |
| cl3 | semantic | LOW | manual | The built sc1 IrSection is {id, title, narrativeText} with NO citation field, and DocumentIR uses a structural derived/narrated partition — so s4's grounding is validation-time with no sc1 type change. | types.ts:51 interface IrSection with :54 readonly narrativeText and no citation field; NarratedContent present — grounding-by-validation needs no sc1 change, as the design states. | none — verified sound |
| cl4 | citation | LOW | manual | The s2/s3 base derived extractors s4 composes exist: buildComponentDependencyIR (component-dependency.ts) and buildCallSequenceIR (call-sequence.ts). | buildComponentDependencyIR (component-dependency.ts) and buildCallSequenceIR (call-sequence.ts:97) both exist — the reused s2/s3 base extractors are real. | none — verified sound |
| cl5 | citation | LOW | manual | The shell's buildHtml today renders ONLY a #docgen-diagram region and has NO narrated/#docgen-narrative region — s4 must add it; assembleShell + escapeHtml exist. | shell.ts has buildHtml + docgen-diagram + escapeHtml + assembleShell; grep -c 'docgen-narrative' src/docgen/render/shell.ts = 0 — the narrated region is genuinely new work, confirming the design's premise. | none — verified sound |
| cl6 | inventory | LOW | manual | src/docgen/index.ts currently registers 3 doc types (s1/s2/s3) and s4 adds 'narrative' as the 4th; generateDocument is the single generation path. | grep -c 'r.register(' src/docgen/index.ts = 3 (s1/s2/s3); s4 adds 'narrative' as the 4th. generateDocument is the single path. narrativeRegistration currently only in the design docs. | none — verified sound |
| cl7 | semantic | LOW | manual | DocGenOutcome ok carries `value` and constructors ok/emptyScope exist — makeExtract returns ok(DocumentIR) / short-circuits the base non-ok outcome. | outcome.ts exports ok/emptyScope; DocGenOutcome ok carries `value: T` — makeExtract's ok(DocumentIR)/short-circuit contract holds. | none — verified sound |
