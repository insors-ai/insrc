<!-- insrc:artifact LLD-85e6a58693579b6d-S001 -->

# LLD: E2026100185e6a586:S001

## Summary

**Epic:** `design-correction-issue-85e6a58693579b6d-ux-mock`
**HLD base run:** `wf-1790856039227-ub48xn`
**HLD effective hash:** `f3ad96925253...`

The experience mock stops being a diagram. Today the authored card is lowered into the same node-and-edge representation the ER and component diagrams use, and drawn by the shared Mermaid shell — so a reviewer who opens it sees boxes labelled with element type names rather than anything resembling an interface. This Story gives the UX companion its own terminal renderer: a pure function that walks the card and emits a self-contained HTML document in which each element appears as the thing it denotes — text as text, inputs as labelled controls, an action set as a row of buttons, a column set as side-by-side columns. Because the element union is closed at eight variants, total coverage becomes a compile-time property rather than a hope, and the companion sheds the inlined diagram runtimes it no longer needs.

## Contents

1. [HLD context](#1-hld-context)
2. [Contract details](#2-contract-details)
3. [Data model changes](#3-data-model-changes)
4. [Error paths](#4-error-paths)
5. [Test strategy](#5-test-strategy)
6. [Migration](#6-migration)
7. [Alternatives considered](#7-alternatives-considered)
8. [UX](#8-ux)
9. [References](#9-references)
10. [Open questions](#10-open-questions)

## 1. HLD context

**Framework:** Standalone bugfix — no parent HLD. Designed directly against the repo, grounded on the s1 analyze passes. There are no HLD shared contracts to honour and no adjacent story boundaries to stay clear of; the scope boundary that matters instead is src/docgen/render/shell.ts, which three other companions depend on and which this Story must not modify.
**Rollout phase:** standalone

## 2. Contract details

**Surface level:** internal

### 2.1 `renderUxCompanion`

```typescript
renderUxCompanion(uxDef: UxDefinition, title: string, destPath: string, opts?: RenderUxCompanionOpts): Promise<CompanionArtifactRef>
```

**Parameters:**
- `uxDef: UxDefinition` — The authored card — the source of truth for the mock. Unchanged by this Story.
- `title: string` — The companion's title, carried onto the returned ref and shown as the document heading.
- `destPath: string` — Absolute path the companion HTML is written to. Unchanged.
- `opts: RenderUxCompanionOpts` _(optional)_ — Existing options — repoPath, ofSectionId, sourceLink. Shape unchanged; sourceLink is now consumed by the new emitter rather than by withSourceLink.

**Returns:** `Promise<CompanionArtifactRef>` — The same ref shape as today, with the same kind:'ux-mock'. NOTHING about the returned value changes — the reason no consumer, including either IDE plugin and Epic bfe98ff7's S003/S004, is affected.

**Errors:**
- `(no error type is raised by the render path)` when The emitter is a pure string-building function with no runtime load, no subprocess and no oversize branch, so DiagramGenerationError becomes unreachable from this function. A filesystem failure from the write still propagates as today.

**Preconditions:**
- The card has already passed Adaptive Cards schema validation upstream; this function does not re-validate.

**Postconditions:**
- The file at destPath is a complete, self-contained HTML document that fetches nothing — no external stylesheet, no script, no remote image.
- The returned ref is byte-equivalent to what the current implementation returns for the same inputs.
- The emitted document no longer embeds the Mermaid or svg-pan-zoom runtimes, so it is expected to be smaller than the current ~3.37MB by orders of magnitude.
- Calling it twice with the same UxDefinition writes byte-identical files.

### 2.2 `uxDefinitionToIr`

```typescript
uxDefinitionToIr(uxDef: UxDefinition): DocumentIR
```

**Parameters:**
- `uxDef: UxDefinition` — The authored card.

**Returns:** `DocumentIR` — The structural element-tree graph, unchanged in shape.

**Postconditions:**
- This function is NO LONGER on the companion path — renderUxCompanion stops calling it. Retained because uxNarratedSections and the ['Purpose','Legend'] contract pinned at context-sections.test.ts:82 are reached through it.
- The new emitter is AUTHORITATIVE for what a reviewer sees; uxDefinitionToIr is authoritative for nothing user-facing after this Story. Stated explicitly so the two renderers cannot silently diverge in meaning.
- Its narrated-sections output continues to be produced and is consumed by the new emitter, so the prose contract survives without duplication.

## 3. Data model changes

### 3.1 `renderUxMockDocument` — new

NEW, and declared here rather than in contractDetails.api because that section admits only symbols already present in the analyze bundles — this one does not exist yet. The terminal renderer for the UX companion: a pure function from the authored card to a complete HTML document string. It walks the card with the SAME nesting rule childrenOf already encodes (items for Container and Column, columns for ColumnSet, nothing for the other five), so element order and nesting are preserved by construction rather than by a parallel traversal that could drift. It emits the rendered mock and the narrated prose sections together, the prose BESIDE the mock rather than instead of it. All styling is inlined; nothing is fetched.

```
+ export function renderUxMockDocument(uxDef: UxDefinition, title: string, opts?: { sourceLink?: CompanionSourceLink }): string
```

**Call sites:**
- `src/workflow/artifacts/companion/render.ts`
- `src/workflow/artifacts/companion/ux.ts`

### 3.2 `UxElement` — invariant-change

No field changes — the union keeps its eight variants (UxTextBlock, UxContainer, UxColumnSet, UxColumn, UxImage, UxInputText, UxInputChoiceSet, UxActionSet) at ux.ts:108-117. What changes is the INVARIANT: the union becomes exhaustively consumed by the emitter, so adding a ninth variant to the schema must fail the TypeScript build until it is given a rendering. This converts 'every element type renders as something' from an aspiration into a checked property.

```
(no shape change; the exhaustive-switch obligation is new)
```

**Call sites:**
- `src/workflow/artifacts/companion/ux.ts`
- `src/workflow/artifacts/companion/ux-schema.ts`

### 3.3 `UxAction` — invariant-change

Carried, not changed. Its two action types ('Action.Submit' and 'Action.OpenUrl') must render DISTINGUISHABLY, because a reviewer needs to tell a submit from a navigation. Today both collapse into one node label via labelFor's ActionSet arm (ux.ts:197), which joins only the titles.

**Call sites:**
- `src/workflow/artifacts/companion/ux.ts`

## 4. Error paths

**Error cases**

- **The card carries an element whose type is not one of the eight the union admits — reachable because the companion renders from the stored artifact body, which can predate a schema change or be hand-edited.** (recoverable)
  - Detection: The emitter's element switch reaches its DEFAULT arm. Nothing else notices — there is no re-validation step and the upstream ajv pass happened at authoring time, against whatever schema shipped then.
  - Response: Emit a VISIBLE placeholder in document flow carrying the unrecognised type string, styled so it reads as a gap in the mock rather than as content. Never skip the element, never throw, never substitute neighbouring content.
  - User impact: The reviewer sees that something was authored here which the renderer could not draw, and what type it was — strictly better than a silent omission (approving a design with an invisible hole) or a throw (one element making the whole document unopenable).
- **A container element carries children of an unexpected shape — a Container whose items is absent or not an array, which the types forbid but a stored JSON body can still contain.** (recoverable)
  - Detection: The recursion reads the container's child list and finds a non-array or absent value; the traversal guards the read rather than assuming the type assertion held.
  - Response: Render the container as an empty grouped region and continue with the rest of the card.
  - User impact: The reviewer still gets the whole surrounding mock; one region reads as empty, which is visible, rather than the document failing to open.
- **The destination path cannot be written — a read-only directory or permissions failure.** (terminal)
  - Detection: The writeFileSync call in renderUxCompanion throws, exactly as today.
  - Response: Propagate unchanged. This Story adds no handling the current implementation lacks.
  - User impact: Identical to today — no regression and no new behaviour.

**Edge cases**

| Input | Expected |
| :--- | :--- |
| A card with an EMPTY body array. | A valid, openable document carrying the title and the narrated prose sections, with an explicitly empty mock region — the case context-sections.test.ts:82 already pins at the IR level, which must not regress to a blank file. |
| Deeply nested containers — Container inside Column inside ColumnSet inside Container. | Nesting preserved to full depth with no truncation. Deliberately no depth limit: unlike the graph path with its oversized(ir) subprocess fallback, a nested-markup emitter has no reason to degrade with depth. |
| A ColumnSet whose columns array is empty. | An empty row that still reads as a row — usually an authoring mistake worth seeing, not a vanished element. |
| An Image whose url points at a remote host. | A labelled placeholder showing url and altText. The URL is NEVER fetched — the no-network invariant at its sharpest, since an image is the one element a renderer would naturally reach out for. |
| Element text containing HTML metacharacters — <script>, &, quotes — in a TextBlock or a choice title. | Rendered as literal text. Authored content is DATA, not markup: escaped on the way in, so a card can never inject structure into its own mock. Inputs, choice titles, action titles, image alt text and the document title all take the same treatment. |
| A very long unbroken string in a TextBlock. | It wraps or scrolls within its region rather than forcing the whole mock wide — a layout destroyed by one long token misrepresents the interface. |
| Two cards differing only in element ORDER. | Visibly different documents. Order is part of the authored design, preserved by construction rather than sorted or grouped by type. |

**Invariants to preserve**

- The returned CompanionArtifactRef keeps kind:'ux-mock' and the same relPath/title/ofSectionId shape — what makes this Story invisible to every consumer. [[c4]]
- The card JSON is NEVER inlined into the core markdown; the document links to its companion. Pinned at ux-integration.test.ts:75 and :124; both must keep passing untouched. [[c7]]
- The narrated prose sections survive, including for an empty card body — context-sections.test.ts:82 asserts exactly ['Purpose','Legend']. The prose moves BESIDE the mock; it must not be dropped. [[c7]]
- The companion stays a single self-contained offline file that fetches nothing — today by inlining runtimes, after the fix by needing none. The property is preserved while its cost is removed. [[c6]]
- src/docgen/render/shell.ts is NOT modified. Any build editing that file has left this Story's scope. [[c6]]
- Rendering stays deterministic and build-time — same definition, byte-identical output, no subprocess and nothing that varies by viewer. A build introducing a script-driven render has silently switched to the rejected alternative. [[c1]]
- uxDefinitionToIr continues to exist with the same DocumentIR return shape, because uxNarratedSections is reached through it. Removing or reshaping it is out of scope. [[c3]]

## 5. Test strategy

**Test framework:** `node:test via tsx (`npx tsx --test 'src/**/__tests__/*.test.ts'`), co-located under src/workflow/artifacts/companion/__tests__/ — the convention the five existing UX test files follow. Headless Chrome for the one visual check, matching the screenshot-and-read-back practice this repo adopted after string-asserting webview tests produced a tautological green for two releases.`

**Test levels**

- **unit** — Pin the element→markup mapping variant by variant — where total coverage is proved: eight variants, each asserted to produce the thing it denotes rather than a label naming itself.
  - Subjects: `a TextBlock renders its text as content, not as a 'TextBlock: "…"' caption`, `an Input.Text renders a labelled text control carrying its label and placeholder`, `an Input.ChoiceSet renders a labelled control listing every choice title`, `an ActionSet renders one button per action, with Action.Submit and Action.OpenUrl DISTINGUISHABLE`, `an Image renders a labelled placeholder carrying url and altText, with no fetch of that url`, `a Container renders a visibly grouped region containing its children`, `a ColumnSet renders its Columns side by side rather than stacked`, `a Column renders as a region inside its ColumnSet, preserving its width hint`, `source-scan: the element switch is EXHAUSTIVE over UxElement — a ninth variant would fail the build`
  - Fixtures: `The canonical all-eight-variants card authored as this LLD's own uxDefinition — it exists so the fixture and the design illustration are the same object`, `The existing cards at ux-render.test.ts:29-30 and ux-integration.test.ts:43-44, reused unchanged so the fix is proved against fixtures predating it`
- **unit** — Pin the error and edge behaviour — particularly degradation, the constraint that decided the design and so the one most firmly tested.
  - Subjects: `an element outside the union emits a VISIBLE placeholder naming that type, with surrounding elements still rendered`, `an unrecognised element never throws and never silently disappears`, `a Container whose items is malformed renders an empty group and the rest of the card survives`, `an empty card body yields an openable document with title and narrated prose, not a blank file`, `an empty ColumnSet renders a visible empty row`, `deep nesting is preserved to full depth with no truncation`, `text containing <script>, & and quotes renders as LITERAL TEXT`, `a long unbroken token wraps or scrolls within its region`, `two cards differing only in ORDER produce different documents`
- **integration** — Prove the companion still behaves as a companion — the artifact-level invariants.
  - Subjects: `the written document fetches NOTHING: no external stylesheet, script src, remote image or http(s) origin anywhere`, `renderUxCompanion returns a ref byte-equivalent to today's, still kind:'ux-mock'`, `the document no longer contains the mermaid or svg-pan-zoom runtimes and is dramatically smaller than ~3.37MB — asserted as a bound, not a fixed number`, `DETERMINISM: rendering the same definition twice produces byte-identical files`, `the narrated prose sections appear ALONGSIDE the mock, not instead of it`, `ux-integration's :75 and :124 assertions pass UNCHANGED`, `context-sections' empty-card ['Purpose','Legend'] assertion passes UNCHANGED`, `source-scan: src/docgen/render/shell.ts is absent from the Story's diff`
- **smoke** — Establish what no string assertion can: that the artifact READS as an interface. This level exists because the defect being fixed was invisible to a fully green suite — every unit test of the old renderer passed while it produced a node graph.
  - Subjects: `manual: render the canonical card through the real renderUxCompanion, screenshot headlessly and READ THE IMAGE BACK — text reads as text, columns sit side by side, inputs read as labelled controls, actions read as buttons, the image reads as a labelled placeholder, the container groups visibly`, `manual: regenerate Epic bfe98ff7's HLD ux-mock.html and read it back — the artifact whose appearance opened this issue is the honest before/after`, `the full daemon sweep passes, with any pre-existing unrelated failure named explicitly`

**Acceptance mapping**

| Criterion | Proving tests |
| :--- | :--- |
| `ac1` | `DERIVED CRITERION — the Story carries no formal acceptance criteria, so ac1-ac9 are taken from the approved ISSUE's fix intent and named here so each is provably mapped. ac1 = each element appears as the thing it denotes rather than as a labelled node.`, `the eight per-variant unit tests`, `manual: screenshot the canonical card and read it back` |
| `ac2` | `ac2 = nesting and element order are preserved.`, `deep nesting preserved to full depth`, `a ColumnSet renders side by side rather than stacked`, `two cards differing only in order produce different documents` |
| `ac3` | `ac3 = every element type the schema admits renders as something.`, `source-scan: the element switch is exhaustive over the eight variants`, `the eight per-variant unit tests` |
| `ac4` | `ac4 = an unrecognised element degrades VISIBLY rather than vanishing — the constraint that decided the design.`, `an element outside the union emits a visible placeholder naming its type`, `an unrecognised element never throws and its siblings still render`, `a malformed container renders an empty group and the rest survives` |
| `ac5` | `ac5 = one self-contained offline file that fetches nothing.`, `no external stylesheet, script src, remote image or http(s) origin in the document`, `a remote image url renders as a placeholder and is never fetched`, `the document no longer contains the mermaid or svg-pan-zoom runtimes` |
| `ac6` | `ac6 = deterministic output for a given definition.`, `rendering the same definition twice produces byte-identical files` |
| `ac7` | `ac7 = the link-not-inline companion ref contract is preserved.`, `the returned ref is byte-equivalent to today's, still kind:'ux-mock'`, `ux-integration's :75 and :124 assertions pass unchanged` |
| `ac8` | `ac8 = the narrated prose accompanies the mock rather than substituting for it.`, `the narrated sections appear alongside the mock in the rendered document`, `context-sections' empty-card assertion passes unchanged` |
| `ac9` | `ac9 = the three diagram companions are not put at risk — the blast-radius constraint that eliminated alternative a3.`, `source-scan: src/docgen/render/shell.ts is absent from the Story's diff`, `the full daemon sweep passes with no new failure` |

## 6. Migration

**State before:** renderUxCompanion (render.ts:131-156) calls withSourceLink(uxDefinitionToIr(uxDef), opts.sourceLink) and hands the DocumentIR to assembleShell (shell.ts:255). uxDefinitionToIr (ux.ts:275-303) populates derived:{nodes,edges} with one node per element labelled by labelFor (ux.ts:191-202, type-name strings) and a 'contains' edge per parent/child. assembleShell inlines the Mermaid and svg-pan-zoom runtimes and draws the graph, falling back to a graphviz subprocess when oversized(ir). The written file is a node diagram plus a prose inventory, ~3.37MB (ux-mock.html for Epic bfe98ff7 measured 3,371,391 bytes). The returned ref already carries kind:'ux-mock'. Generated ux-mock.html files from this path exist in the tree today.

**State after:** renderUxCompanion calls the new terminal emitter instead of assembleShell, writing a self-contained HTML document in which each of the eight variants appears as the thing it denotes, nesting and order preserved, narrated prose beside the mock. No Mermaid or svg-pan-zoom runtime is embedded, so the file shrinks by orders of magnitude. The returned ref is byte-identical to before. uxDefinitionToIr still exists and returns the same DocumentIR but is off the visual path. shell.ts is untouched, so the ER, sequence and component companions behave exactly as today.

**Zero downtime:** yes — **Data rewrite:** yes

**Steps**

1. Add the new emitter alongside the existing path without wiring it in. Nothing changes for any caller: the function exists and is unit-testable while renderUxCompanion still produces the old output. This ordering makes the step reversible by deletion rather than by revert. — ↩ rollbackable
2. Switch renderUxCompanion's body from the assembleShell pipeline to the new emitter — the single behavioural flip. Everything before is additive; everything after is verification or regeneration. — ↩ rollbackable
3. Migrate the existing UX tests to assert rendered OUTPUT rather than graph structure. The four files pinning current behaviour move with the change; the assertions that must NOT move are ux-integration's :75/:124 and context-sections' ['Purpose','Legend'], which are invariants rather than descriptions of the old renderer. — ↩ rollbackable
4. REGENERATE the stale generated artifacts. Every ux-mock.html already in the tree was produced by the diagram path and does not change by itself — a companion is only rewritten when its source document is re-rendered. Start with the one that opened this issue (Epic bfe98ff7's HLD). Recoverable from git rather than reversible as an in-place toggle. — ↩ rollbackable
5. Verify visually before declaring done: render the canonical card through the real path, screenshot headlessly and read the image back. Listed as a migration action rather than left to the suite because the defect being corrected was invisible to a fully green suite. — ↩ rollbackable
6. Rebuild and restart the installed daemon so the corrected renderer runs when the next document is approved. Until then the repository holds the fix while the running daemon keeps emitting node diagrams. — ↩ rollbackable

**Backward compat:** No consumer-visible contract changes — the central fact, and why this Story is safe to land independently. renderUxCompanion keeps its signature and returns a ref byte-equivalent to today's, still kind:'ux-mock' with the same relPath/title/ofSectionId, so both IDE plugins and Epic bfe98ff7's S003/S004 (all of which consume refs, not companion bodies) are unaffected. uxDefinitionToIr remains exported with an unchanged signature and return shape, and the narrated-sections contract reached through it is preserved. assembleShell is not modified, so the ER, sequence and component companions carry no risk. The ONE visible change is intended: the BODY of a ux-mock.html written after this Story differs from one written before. Previously-generated files are not migrated automatically — they are rewritten only when their source document is re-rendered — which is why regeneration is an explicit migration step. DiagramGenerationError becomes unreachable from this function; nothing catches it specifically today, so this narrows behaviour rather than changing an API.

## 7. Alternatives considered

### 7.1 a1: Dedicated layout emitter beside the IR lowering — **CHOSEN**

uxDefinitionToIr stops being the UX path: a new UX-owned function turns the card into a self-contained HTML document of nested laid-out elements, and renderUxCompanion calls it instead of assembleShell.

Treat a card as what it structurally is — a nested box layout — and give the UX companion its own terminal renderer rather than borrowing the graph one. Each of the eight UxElement variants maps to the markup that denotes it, with childrenOf's existing three container cases driving the recursion so nesting and order are preserved by construction. The narrated prose is emitted alongside the mock. renderUxCompanion's seam changes from assembleShell(uxDefinitionToIr(uxDef)) to the new emitter; its ref return is untouched.

WHY CHOSEN: a1 is the only alternative with no `partial` and no `violates` across all eight constraints; a2 violates i5 and a3 violates b1. Both losses are disqualifications rather than preferences. a2 moves rendering into a script that runs in the viewer, so the emitted file contains the card JSON and a bundle rather than the rendered elements — a script failure yields an empty page, and the issue's fix intent explicitly requires failure to degrade VISIBLY rather than vanish. a3 widens assembleShell, which the ER, sequence and component companions all depend on, risking three shipped companions to repair one. Where a1 does NOT win is recorded rather than glossed: a2 beats it on coverage in absolute terms (the full Adaptive Cards specification versus our eight-variant subset) and on fidelity (the real thing versus an approximation); a3 beats it on structural tidiness (the existing withSourceLink and narrated-sections plumbing apply without special-casing). a1 wins on i5 and b1 plus two clear advantages: it REMOVES weight — the diagram runtimes become unnecessary, so the artifact should shrink substantially from 3,371,391 bytes — and the closed UxElement union makes total coverage a compile-time property, so a future variant fails the build until mapped rather than silently falling through.

### 7.2 a2: Vendor the Adaptive Cards renderer

Inline Microsoft's own card renderer into the companion shell, feed it the card JSON, and let it draw the card exactly as the real surface would.

Keep the card as the unit and delegate rendering to the library that defines the format. The companion HTML embeds the vendored bundle plus the card JSON, and on load the renderer builds the card into the page — the way the chat surface already inlines a vendored markdown bundle. Element coverage comes free from the full specification. REJECTED on the degradation constraint: rendering moves from build time to viewer runtime, so a script failure shows an empty page rather than a visibly degraded one.

### 7.3 a3: Teach the shared docgen shell a layout document type

Extend DocumentIR and assembleShell with a layout docType so the shared shell can emit nested laid-out regions as well as graphs, and route the UX companion through it.

Keep every companion on one rendering spine and widen that spine rather than forking it. DocumentIR gains a representation for nested laid-out content, assembleShell gains a branch emitting it as positioned markup, and uxDefinitionToIr is rewritten to populate it. renderUxCompanion's body is unchanged apart from what the IR carries. REJECTED on blast radius: assembleShell is depended on by three other, working companions.

## 8. UX

- [UX mock](docs/standalone/design-correction-issue-85e6a58693579b6d-ux-mock-E2026100185e6a586/S001/ux-mock.html)

## 9. References

- **[[c1]]** `analyze-bundle` `insrc_analyze_step how-does-it-work over src/workflow/artifacts/companion (6 explorations, repoIndexedAt 2026-10-01T11:41:00Z)` — "The decisive fact is the RETURN TYPE of the first function: DocumentIR. That is the same intermediate representation the diagram mappers in this module produce"
- **[[c2]]** `code` `src/workflow/artifacts/companion/ux.ts:288` — "nodes.push({ id, label: labelFor(el), kind: el.type });"
- **[[c3]]** `code` `src/workflow/artifacts/companion/ux.ts:275` — "export function uxDefinitionToIr(uxDef: UxDefinition): DocumentIR {"
- **[[c4]]** `code` `src/workflow/artifacts/companion/render.ts:131` — "export async function renderUxCompanion("
- **[[c5]]** `code` `src/workflow/artifacts/companion/ux.ts:108` — "export type UxElement ="
- **[[c6]]** `code` `src/docgen/render/shell.ts:255` — "export async function assembleShell("
- **[[c7]]** `code` `src/workflow/artifacts/companion/__tests__/context-sections.test.ts:82` — "assert.deepEqual(titles(uxDefinitionToIr({ type: 'AdaptiveCard', body: [] }).narrated.sections), ['Purpose', 'Legend']);"
- **[[c8]]** `code` `src/workflow/artifacts/companion/ux.ts:181` — "function childrenOf(el: UxElement): readonly UxElement[] {"
- **[[c9]]** `prior-artifact` `docs/standalone/ux-mock-companion-does-not-produce-E2026100185e6a586/ISSUE.md — fix intent` — "an element the renderer does not understand must degrade visibly rather than vanish"

## 10. Open questions

- FIDELITY VS GUARANTEED VISIBILITY — the one decision a reviewer may legitimately want to reverse. a1 produces an APPROXIMATION of the interface; a2 (vendoring Microsoft's renderer) would produce the real thing. a2 was rejected because it moves rendering into a viewer-side script, so a script failure shows an empty page — the opposite of the issue's explicit 'degrade visibly rather than vanish' requirement. If pixel-accurate fidelity is later judged more important than a guaranteed-visible artifact, a2 is the alternative to revisit, and nothing in this design forecloses it.
- SELF-GRADED PARTIAL (cd3): renderUxCompanion's single errors entry carries a sentence where the schema wants a concrete error type, because the honest content is the ABSENCE of errors — DiagramGenerationError becomes unreachable once assembleShell leaves the path. The cleaner form would have been an empty errors array with the explanation in postconditions. The reader is not misled, but the shape is wrong and a reviewer is entitled to say so.
- SELF-GRADED PARTIAL (ep3): all seven invariantsToPreserve carry cN source ids matching the required pattern, and each invariant is genuinely drawn from a named s1 bundle — but the s1 bundles are keyed by KIND, not numbered c1..c7, so the mapping is positional rather than a formal link the engine can verify. Every invariant is real and traceable; a reader simply cannot resolve 'c6' to 'the assembleShell bundle' from the artifact alone.
- SELF-GRADED PARTIAL (alt2): the checklist asks that alternatives be scored against Story acceptance criteria, Epic constraints and HLD shared contracts — and all three arrays are EMPTY for this standalone bugfix. I scored against eight constraints derived from the approved issue's invariants plus a blast-radius constraint (b1) that is mine rather than the issue's. That is more useful than scoring against nothing, but it is a substitution, and it deserves attention precisely because b1 is what eliminated a3.
- CORRECTION TO THE APPROVED ISSUE, recorded rather than silently designed around: the issue's triage signal claimed renderUxCompanion 'currently stamps a diagram kind'. Reading render.ts:151 shows it already returns kind:'ux-mock'. The defect is strictly the HTML body, not the ref vocabulary — which NARROWS this Story: no consumer-visible ref contract changes, and the 'external-contract' blast radius the triage cited does not exist.

## Resolved questions

- `qf1b19e98` — FIDELITY VS GUARANTEED VISIBILITY — the one decision a reviewer may legitimately want to reverse. a1 produces an APPROXIMATION of the interface; a2 (vendoring Microsoft's renderer) would produce the real thing. a2 was rejected because it moves rendering into a viewer-side script, so a script failure shows an empty page — the opposite of the issue's explicit 'degrade visibly rather than vanish' requirement. If pixel-accurate fidelity is later judged more important than a guaranteed-visible artifact, a2 is the alternative to revisit, and nothing in this design forecloses it.
  - **resolved**: Hold a1 — server-rendered approximation only — Settled with the user in chat, not by default: they were shown the fidelity-vs-visibility trade-off with all three mechanisms and the cost of each, and approved the LLD that chose a1. The deciding argument is the issue's own words — 'degrade visibly rather than vanish' is an explicit requirement, and a1 is the only option that satisfies it unconditionally, because build-time emission means whatever the emitter produced is what the reader sees. a2 inverts exactly that: a script failure yields an empty page, so the whole mock can vanish, not merely an element. The hybrid (option 3) is the honest upgrade path if approximation later proves to mislead reviewers, and nothing in a1 forecloses it — but paying for two semantically-synced render paths now, on a standalone bugfix, buys fidelity nobody has yet asked for. The revisit condition is already recorded in the LLD's open questions, so option 4's bookkeeping would duplicate what the artifact carries. _(2026-10-01T12:19:38.974Z)_
- `qfaed73d6` — SELF-GRADED PARTIAL (cd3): renderUxCompanion's single errors entry carries a sentence where the schema wants a concrete error type, because the honest content is the ABSENCE of errors — DiagramGenerationError becomes unreachable once assembleShell leaves the path. The cleaner form would have been an empty errors array with the explanation in postconditions. The reader is not misled, but the shape is wrong and a reviewer is entitled to say so.
  - **resolved**: Empty errors array, explanation in postconditions — Taking the fix I flagged against myself rather than the cheap option. The honest content is an ABSENCE of errors, and an absence belongs in prose that asserts it, not in a field shaped to hold type names — writing a sentence where a type goes is how a schema stops meaning anything. Option 3 (accept the wart) ships an artifact I have already said a reviewer is entitled to block on, which is a strange thing to do voluntarily. Option 4 (widen the schema) is the right root-cause fix for a repeated problem but turns a standalone bugfix into a schema change with its own review, and this is the first time I have hit it. Option 2 is nearly identical to option 1 in effect, since re-deriving the real throw set yields none from the render path — writeFileSync's filesystem failure propagates from renderUxCompanion but is not raised by the emitter — so option 1 says the same thing without implying a list exists to be trimmed. _(2026-10-01T12:21:22.081Z)_
- `q72d6575e` — SELF-GRADED PARTIAL (ep3): all seven invariantsToPreserve carry cN source ids matching the required pattern, and each invariant is genuinely drawn from a named s1 bundle — but the s1 bundles are keyed by KIND, not numbered c1..c7, so the mapping is positional rather than a formal link the engine can verify. Every invariant is real and traceable; a reader simply cannot resolve 'c6' to 'the assembleShell bundle' from the artifact alone.
  - **resolved**: Name the bundle inside each invariant — The defect is precisely that a reader cannot resolve 'c6' from the artifact alone, so the fix belongs at the point of use. Naming the bundle inside each invariant's own text means the annotation travels with the line even when quoted in isolation — which is how invariants actually get read downstream, one at a time in a build prompt, not as a list beside a legend. Option 2's crosswalk closes the same gap but creates a second place that drifts: the next person to add an eighth invariant updates one list and not the other, and a stale crosswalk is worse than none. Option 3 is the real root-cause fix and I would take it if this recurred, but re-keying the s1 bundle contract to make the link engine-verifiable means moving the producer, the schema and the gate together, which is not something a standalone bugfix should drag along. Option 4 knowingly carries a partial I have already graded into a stage where a reviewer may block on it, having been told exactly where to look. _(2026-10-01T12:22:52.580Z)_
- `q8cf76923` — SELF-GRADED PARTIAL (alt2): the checklist asks that alternatives be scored against Story acceptance criteria, Epic constraints and HLD shared contracts — and all three arrays are EMPTY for this standalone bugfix. I scored against eight constraints derived from the approved issue's invariants plus a blast-radius constraint (b1) that is mine rather than the issue's. That is more useful than scoring against nothing, but it is a substitution, and it deserves attention precisely because b1 is what eliminated a3.
  - **resolved**: Disclose the substitution; mark b1 as author-introduced — Taking option 1, but only after running option 2's diagnostic — and it changes the premise of the question. The question (and my own open note) asserts 'b1 is what eliminated a3'. Re-scoring a3 against the EIGHT issue-derived constraints with b1 withheld: i2 deterministic satisfies, i3 link-not-inline satisfies, i4 every-element satisfies, i5 degrades-visibly satisfies, i6 prose-accompanies satisfies, i7 reads-as-interface satisfies — but i1 self-contained-offline is PARTIAL, because a3 routes through assembleShell and so keeps carrying the inlined mermaid and svg-pan-zoom runtimes the UX companion no longer needs, leaving the artifact at ~3.37MB where a1 sheds that weight entirely. So a3 scores 6 satisfies + 1 partial against a1's 7 satisfies on issue-grounded constraints ALONE. a3 still loses without b1; b1 made the elimination decisive, it did not create it. That dissolves the concern rather than merely labelling it, so option 3's upstream amendment and option 4's acceptance-criteria backfill would both be buying ratification for a constraint that turns out not to be load-bearing — real cost for no change in outcome on a standalone bugfix. What remains is the disclosure obligation, which is option 1: the plan marks the eight constraints as substituting for the three empty arrays, names b1 as author-introduced rather than issue-derived, and records this b1-withheld re-score so a reviewer can see the elimination does not rest on it. _(2026-10-01T12:24:08.813Z)_

## Citations

- **[[c1]]** `analyze-bundle` `insrc_analyze_step how-does-it-work over src/workflow/artifacts/companion (6 explorations, repoIndexedAt 2026-10-01T11:41:00Z)` — "The decisive fact is the RETURN TYPE of the first function: DocumentIR. That is the same intermediate representation the diagram mappers in this module produce"
- **[[c2]]** `code` `src/workflow/artifacts/companion/ux.ts:288` — "nodes.push({ id, label: labelFor(el), kind: el.type });"
- **[[c3]]** `code` `src/workflow/artifacts/companion/ux.ts:275` — "export function uxDefinitionToIr(uxDef: UxDefinition): DocumentIR {"
- **[[c4]]** `code` `src/workflow/artifacts/companion/render.ts:131` — "export async function renderUxCompanion("
- **[[c5]]** `code` `src/workflow/artifacts/companion/ux.ts:108` — "export type UxElement ="
- **[[c6]]** `code` `src/docgen/render/shell.ts:255` — "export async function assembleShell("
- **[[c7]]** `code` `src/workflow/artifacts/companion/__tests__/context-sections.test.ts:82` — "assert.deepEqual(titles(uxDefinitionToIr({ type: 'AdaptiveCard', body: [] }).narrated.sections), ['Purpose', 'Legend']);"
- **[[c8]]** `code` `src/workflow/artifacts/companion/ux.ts:181` — "function childrenOf(el: UxElement): readonly UxElement[] {"
- **[[c9]]** `prior-artifact` `docs/standalone/ux-mock-companion-does-not-produce-E2026100185e6a586/ISSUE.md — fix intent` — "an element the renderer does not understand must degrade visibly rather than vanish"
