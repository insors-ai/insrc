<!-- insrc:artifact PLAN-85e6a58693579b6d-S001 -->

# Plan: E2026100185e6a586:S001

## Summary

**Epic:** `design-correction-issue-85e6a58693579b6d-ux-mock`
**LLD run:** `wf-1790856039227-ub48xn`
**LLD effective hash:** `f3ad96925253...`

Building this is one substantial piece of work surrounded by small ones. The substantial piece is a new pure function that turns an authored card into a self-contained HTML document — eight element arms, escaping, and the inline stylesheet that decides whether the result reads as an interface at all. Everything else is deliberately small and strictly ordered: a documentation correction first, then the emitter lands additively before anything calls it, then one two-line flip switches the companion onto it, then tests migrate, the look is verified by screenshot, stale artifacts are regenerated, and the installed daemon is rebuilt. The ordering is the design: every step before the flip is reversible by deletion, and the visual check sits immediately after it so a layout problem is found while the emitter is still the thing being worked on.

DISCLOSURE ON THE SCORING BASIS, recorded here because the plan body has no other place for it and the plan checklist flagged its absence. The LLD's alternatives were scored against EIGHT constraints derived from the approved issue's invariants, SUBSTITUTING for the Story acceptance criteria, Epic constraints and HLD shared contracts — all three of which are empty arrays for a standalone bugfix. One of those eight, b1 (blast radius: do not put the three other companions at risk), is AUTHOR-INTRODUCED rather than issue-derived, and it is what made alternative a3's elimination decisive. Because that is the one contestable step in the design, the re-score was actually run with b1 withheld: against the seven issue-derived constraints alone, a3 scores six `satisfies` and one `partial` — partial on self-contained-offline, because routing through assembleShell keeps the inlined mermaid and svg-pan-zoom runtimes the UX companion no longer needs, leaving the artifact at ~3.37MB where the chosen alternative sheds that weight. a1 scores seven `satisfies`. So a3 still loses WITHOUT the author-introduced constraint: b1 sharpened the elimination, it did not create it. A reviewer who rejects b1 outright therefore does not reopen the alternatives decision.

## Contents

1. [Tasks](#1-tasks)
2. [Test-strategy coverage](#2-test-strategy-coverage)
3. [References](#3-references)

## 1. Tasks

| # | Task | Size | Depends on | Tests | Derived from |
| :--- | :--- | :--- | :--- | :--- | :--- |
| 1 | **`t5`** Apply the two resolved LLD text corrections | S | — | unit: source-scan: the LLD JSON's renderUxCompanion errors array is empty and its postconditions carry the unreachability explanation; unit: source-scan: all seven invariantsToPreserve entries name their source bundle inline; unit: source-scan: meta.approvedAt and meta.review are unchanged, and the rendered markdown still carries its appended Review section | [[c6]] |
| 2 | **`t1`** Add the UX layout emitter, covering all eight element variants | M | — | unit: a TextBlock renders its text as content, not as a 'TextBlock: "…"' caption; unit: an Input.Text renders a labelled text control carrying its label and placeholder; unit: an Input.ChoiceSet renders a labelled control listing every choice title; unit: an ActionSet renders one button per action, with Action.Submit and Action.OpenUrl DISTINGUISHABLE; unit: an Image renders a labelled placeholder carrying url and altText, with no fetch of that url; unit: a Container renders a visibly grouped region containing its children; unit: a ColumnSet renders its Columns side by side rather than stacked; unit: a Column renders as a region inside its ColumnSet, preserving its width hint; unit: source-scan: the element switch is EXHAUSTIVE over UxElement — a ninth variant would fail the build; unit: an element outside the union emits a VISIBLE placeholder naming that type, with surrounding elements still rendered; unit: an unrecognised element never throws and never silently disappears; unit: a Container whose items is malformed renders an empty group and the rest of the card survives; unit: text containing <script>, & and quotes renders as LITERAL TEXT; unit: the emitter is pure — the same definition yields a byte-identical string across repeated calls | [[c1]] [[c2]] |
| 3 | **`t2`** Switch renderUxCompanion onto the emitter and pin the ref kind | S | `t1` | integration: renderUxCompanion returns a ref byte-equivalent to today's, still kind:'ux-mock'; integration: the document no longer contains the mermaid or svg-pan-zoom runtimes and is dramatically smaller than ~3.37MB — asserted as a bound, not a fixed number; integration: the written document fetches NOTHING: no external stylesheet, script src, remote image or http(s) origin anywhere; integration: DETERMINISM: rendering the same definition twice produces byte-identical files; integration: the narrated prose sections appear ALONGSIDE the mock, not instead of it; integration: an empty card body yields an openable document with title and narrated prose, not a blank file | [[c1]] [[c3]] |
| 4 | **`t3`** Migrate the UX tests from graph assertions to rendered-output assertions | S | `t2` | unit: an empty ColumnSet renders a visible empty row; unit: deep nesting is preserved to full depth with no truncation; unit: a long unbroken token wraps or scrolls within its region; unit: two cards differing only in ORDER produce different documents; integration: ux-integration's :75 and :124 assertions pass UNCHANGED; integration: context-sections' empty-card ['Purpose','Legend'] assertion passes UNCHANGED; unit: mutation check: inverting the unrecognised-element branch and the malformed-container branch each turns the suite red | [[c4]] |
| 5 | **`t4`** Verify visually: screenshot the canonical card and read it back | S | `t2` | smoke: manual: render the canonical card through the real renderUxCompanion, screenshot headlessly and READ THE IMAGE BACK — text reads as text, columns sit side by side, inputs read as labelled controls, actions read as buttons, the image reads as a labelled placeholder, the container groups visibly | [[c5]] |
| 6 | **`t6`** Regenerate every stale ux-mock artifact and read them back | S | `t2`, `t4` | smoke: manual: regenerate Epic bfe98ff7's HLD ux-mock.html and read it back — the artifact whose appearance opened this issue is the honest before/after; integration: every ux-mock.html in the tree is enumerated, regenerated, and verified to contain no mermaid or svg-pan-zoom runtime | [[c5]] [[c7]] |
| 7 | **`t7`** Run the full sweep, typecheck, and rebuild the installed daemon | S | `t3`, `t6` | smoke: the full daemon sweep passes, with any pre-existing unrelated failure named explicitly; integration: source-scan: src/docgen/render/shell.ts is absent from the Story's diff; smoke: the installed daemon is rebuilt and restarted, and a freshly-rendered companion comes out as a mock rather than a diagram | [[c3]] [[c7]] |

### 1.1 E2026100185e6a586:S001:T005 — Apply the two resolved LLD text corrections

MOVED TO FIRST per critique — it has no dependencies, touches no code, and doing it first means the build reads an already-corrected LLD rather than consuming an artifact it is also scheduled to amend. Two of the five resolved open questions are edits to the approved LLD rather than to code. (1) renderUxCompanion's `errors` entry becomes an empty array, with the explanation of why no error is raised — DiagramGenerationError becoming unreachable once assembleShell leaves the path — moved into postconditions, so the field carries types rather than a sentence. (2) Each of the seven invariantsToPreserve names its source analyze bundle inline, so a reader can resolve 'c6' from the artifact alone. Textual clarification only: no contract, acceptance criterion or decision changes, which is why it does not require re-approval.

**Acceptance checks:**
- renderUxCompanion's errors array is empty and the unreachability explanation appears in postconditions, with no content lost
- All seven invariantsToPreserve entries name the s1 bundle they were drawn from, inline in the invariant's own text so the annotation survives being quoted in isolation
- Both the canonical JSON and the rendered markdown are updated through the production writer so they stay in sync
- The appended review report is PRESERVED — regenerating markdown through the production writer drops it unless deliberately restored, which has happened twice in this session
- meta.approvedAt and meta.review both survive the edit UNCHANGED, so the artifact remains an approved LLD with its review intact rather than silently reverting to pending

### 1.2 E2026100185e6a586:S001:T001 — Add the UX layout emitter, covering all eight element variants

Add renderUxMockDocument to src/workflow/artifacts/companion/ux.ts — a pure function from UxDefinition to a complete self-contained HTML document string. One arm per UxElement variant, each emitting the markup that DENOTES the element rather than a label naming it. Recursion uses the SAME nesting rule childrenOf already encodes (items for Container and Column, columns for ColumnSet) so order and nesting are preserved by construction. All authored content is escaped on the way in; all styling is inlined; nothing is fetched. ADDITIVE ONLY — nothing calls it yet, which makes this step reversible by deletion rather than by revert. SIZE NOTE per critique: this is the task where an M quietly becomes an L, because the stylesheet has no natural stopping condition and is also what decides whether the artifact reads as an interface. It stays ONE task because markup and styling are one deliverable — split them and neither half is verifiable alone. But if it overruns, the split line is named: element→markup mapping plus escaping first, the stylesheet second, with the visual check moving to the second half.

**Acceptance checks:**
- Each of the eight variants renders as the thing it denotes: TextBlock as laid-out text, Input.Text as a labelled text control, Input.ChoiceSet as a labelled control listing every choice title, ActionSet as a row of buttons, Image as a labelled placeholder, Container as a visibly grouped region, ColumnSet as side-by-side columns, Column as a region inside its ColumnSet
- Action.Submit and Action.OpenUrl render DISTINGUISHABLY — a reviewer can tell a submit from a navigation, which labelFor's current ActionSet arm cannot express
- The element switch is EXHAUSTIVE over UxElement, so a ninth variant added to the schema fails the TypeScript build until it is given a rendering
- An element whose type is outside the union emits a VISIBLE placeholder naming that type, in document flow, and its siblings still render — never skipped, never thrown, never substituted
- A container whose child list is absent or not an array renders an empty grouped region and the rest of the card survives
- Authored text containing <script>, & or quotes renders as LITERAL TEXT — a card cannot inject structure into its own mock; the same escaping applies to choice titles, action titles, image alt text and the document title
- The emitted document references no external stylesheet, no script, and no remote origin — an Image's url is shown, never fetched
- The function is PURE: no IO, no subprocess, no runtime load, so the same definition yields a byte-identical string
- renderUxCompanion is NOT yet changed — this task adds the emitter and wires nothing

### 1.3 E2026100185e6a586:S001:T002 — Switch renderUxCompanion onto the emitter and pin the ref kind

The single behavioural flip: replace renderUxCompanion's `withSourceLink(uxDefinitionToIr(uxDef), ...)` + `assembleShell(ir)` pipeline (render.ts:137-138) with a call to the new emitter, keeping the write and the ref return exactly as they are. Also add the assertion pinning kind:'ux-mock' — the resolved correction to the issue's triage signal, turning a fact that had to be read off render.ts:151 by hand into one the suite defends. The narrated prose sections continue to be produced through uxDefinitionToIr and are consumed by the emitter, so the prose contract survives without duplication.

**Acceptance checks:**
- renderUxCompanion no longer calls assembleShell; the emitter is the terminal renderer for this companion
- The returned CompanionArtifactRef is byte-equivalent to today's for the same inputs — same kind:'ux-mock', relPath, title and ofSectionId
- A regression assertion pins that the returned kind is 'ux-mock', so the triage signal's wrong claim cannot quietly become true later
- The narrated prose sections appear in the written document ALONGSIDE the rendered mock, not instead of it
- uxDefinitionToIr still exists and still returns the same DocumentIR shape — it is off the visual path, not removed
- src/docgen/render/shell.ts is NOT modified — the ER, sequence and component companions are untouched
- The written file no longer contains the mermaid or svg-pan-zoom runtimes

### 1.4 E2026100185e6a586:S001:T003 — Migrate the UX tests from graph assertions to rendered-output assertions

The four test files that describe the OLD renderer's graph output move with the change: ux-render.test.ts, ux-integration.test.ts, ux-body-fields.test.ts and ux.test.ts. The distinction that matters is which assertions are DESCRIPTIONS of the old output (they move) versus INVARIANTS (they must pass untouched): ux-integration.test.ts:75 and :124, and context-sections.test.ts:82. Those three are contracts, and a migration that rewrites them has broken something rather than updated it.

**Acceptance checks:**
- The four graph-describing test files assert rendered output rather than node/edge structure
- ux-integration.test.ts:75 and :124 pass UNCHANGED — not rewritten, not relaxed
- context-sections.test.ts:82 passes UNCHANGED, including for the empty-card case
- ENUMERATED per critique rather than left generic — each of the seven edge cases has a test that REACHES it: an empty card body, deep nesting (Container > ColumnSet > Column > Container), an empty ColumnSet, an Image with a remote url, HTML metacharacters in a TextBlock and a choice title, a long unbroken token, and two cards differing only in element order
- Each of the three error cases has a test that reaches it: an element outside the union, a container with a malformed child list, and the write failure propagating unchanged
- NON-VACUITY CHECK: for the unrecognised-element path and the malformed-container path, the test is shown to FAIL when the branch's behaviour is inverted. A test named for a case is not evidence it covers that case — that exact shape shipped twice in this repo this week
- The existing fixtures at ux-render.test.ts:29-30 and ux-integration.test.ts:43-44 are reused unchanged, so the fix is proved against cards that predate it

### 1.5 E2026100185e6a586:S001:T004 — Verify visually: screenshot the canonical card and read it back

Render the canonical all-eight-variants card (this Story's own LLD uxDefinition) through the real renderUxCompanion, screenshot it headlessly, and READ THE IMAGE. Placed immediately after the flip and before regeneration, so a layout problem is found while the emitter is still the thing being worked on rather than after later tasks have landed on top of it. This is a required check, not a nicety: the defect being fixed was invisible to a fully green suite — every unit test of the old renderer passed while it produced a node graph.

**Acceptance checks:**
- The screenshot is actually read back and described — not merely produced
- Text reads as text; the two columns sit SIDE BY SIDE rather than stacked; the inputs read as labelled controls; the actions read as buttons; the image reads as a labelled placeholder; the container groups visibly
- Nothing in the image resembles a node graph — no boxes labelled with element type names, no containment arrows
- Any visual defect found here is FIXED before the task closes, rather than recorded as a follow-up

### 1.6 E2026100185e6a586:S001:T006 — Regenerate every stale ux-mock artifact and read them back

Generated ux-mock.html files in the tree were produced by the diagram path and do not change by themselves — a companion is rewritten only when its source document is re-rendered. Two are known: Epic bfe98ff7's HLD companion (3,371,391 bytes) and this Story's own LLD companion (3,370,121 bytes), the latter being the honest before/after since its card exercises all eight variants. Per critique the task DERIVES its own scope rather than assuming those two are all there are.

**Acceptance checks:**
- SELF-DERIVING SCOPE per critique: enumerate every ux-mock.html in the tree FIRST, then assert the count regenerated equals the count found — so a third file, if one exists, is discovered rather than missed
- Every regenerated file is produced through the production path, not hand-edited
- No regenerated file contains the mermaid or svg-pan-zoom runtime — a re-derivable check that replaces the unverifiable 'no diagram-path file survives' claim
- Each regenerated file is read back visually and reads as an interface rather than a node graph
- The measured size delta is reported as a number, not an impression

### 1.7 E2026100185e6a586:S001:T007 — Run the full sweep, typecheck, and rebuild the installed daemon

Close out the verification the earlier tasks cannot: the whole daemon suite, a repo-wide typecheck, and the daemon rebuild+restart. The rebuild is load-bearing rather than ceremonial — until it runs, the repository holds the fix while the INSTALLED daemon keeps emitting node diagrams for every document approved from here on, which is the state most likely to be mistaken for 'done'.

**Acceptance checks:**
- npx tsc --noEmit is clean across the repo
- The full daemon sweep passes, with any pre-existing unrelated failure named EXPLICITLY rather than absorbed — the known better-sqlite3 native-ABI mismatch is the expected one
- source-scan: src/docgen/render/shell.ts is absent from the Story's diff, so the three other companions carry no risk from this change
- The installed daemon is rebuilt and restarted, and a freshly-rendered companion is confirmed to come out as a mock rather than a diagram

## 2. Test-strategy coverage

| LLD strategy item | Covered by |
| :--- | :--- |
| a TextBlock renders its text as content, not as a 'TextBlock: "…"' caption | `t1` |
| an Input.Text renders a labelled text control carrying its label and placeholder | `t1` |
| an Input.ChoiceSet renders a labelled control listing every choice title | `t1` |
| an ActionSet renders one button per action, with Action.Submit and Action.OpenUrl DISTINGUISHABLE | `t1` |
| an Image renders a labelled placeholder carrying url and altText, with no fetch of that url | `t1` |
| a Container renders a visibly grouped region containing its children | `t1` |
| a ColumnSet renders its Columns side by side rather than stacked | `t1`, `t4` |
| a Column renders as a region inside its ColumnSet, preserving its width hint | `t1` |
| source-scan: the element switch is EXHAUSTIVE over UxElement — a ninth variant would fail the build | `t1` |
| an element outside the union emits a VISIBLE placeholder naming that type, with surrounding elements still rendered | `t1`, `t3` |
| an unrecognised element never throws and never silently disappears | `t1`, `t3` |
| a Container whose items is malformed renders an empty group and the rest of the card survives | `t1`, `t3` |
| an empty card body yields an openable document with title and narrated prose, not a blank file | `t2` |
| an empty ColumnSet renders a visible empty row | `t3` |
| deep nesting is preserved to full depth with no truncation | `t3` |
| text containing <script>, & and quotes renders as LITERAL TEXT | `t1` |
| a long unbroken token wraps or scrolls within its region | `t3` |
| two cards differing only in ORDER produce different documents | `t3` |
| the written document fetches NOTHING: no external stylesheet, script src, remote image or http(s) origin anywhere | `t2` |
| renderUxCompanion returns a ref byte-equivalent to today's, still kind:'ux-mock' | `t2` |
| the document no longer contains the mermaid or svg-pan-zoom runtimes and is dramatically smaller than ~3.37MB — asserted as a bound, not a fixed number | `t2`, `t6` |
| DETERMINISM: rendering the same definition twice produces byte-identical files | `t1`, `t2` |
| the narrated prose sections appear ALONGSIDE the mock, not instead of it | `t2` |
| ux-integration's :75 and :124 assertions pass UNCHANGED | `t3` |
| context-sections' empty-card ['Purpose','Legend'] assertion passes UNCHANGED | `t3` |
| source-scan: src/docgen/render/shell.ts is absent from the Story's diff | `t7` |
| manual: render the canonical card through the real renderUxCompanion, screenshot headlessly and READ THE IMAGE BACK — text reads as text, columns sit side by side, inputs read as labelled controls, actions read as buttons, the image reads as a labelled placeholder, the container groups visibly | `t4` |
| manual: regenerate Epic bfe98ff7's HLD ux-mock.html and read it back — the artifact whose appearance opened this issue is the honest before/after | `t6` |
| the full daemon sweep passes, with any pre-existing unrelated failure named explicitly | `t7` |

## 3. References

- **[[c1]]** `prior-artifact` `LLD S001 — dataModelChanges: renderUxMockDocument (new), the terminal renderer for the UX companion` — "+ export function renderUxMockDocument(uxDef: UxDefinition, title: string, opts?: { sourceLink?: CompanionSourceLink }): string"
- **[[c2]]** `prior-artifact` `LLD S001 — dataModelChanges: UxElement and UxAction invariant-changes (the closed eight-variant union, exhaustively consumed)` — "the union becomes exhaustively consumed by the emitter, so adding a ninth variant to the schema must fail the TypeScript build until it is given a rendering"
- **[[c3]]** `prior-artifact` `LLD S001 — contractDetails: renderUxCompanion, and the invariant that src/docgen/render/shell.ts is not modified` — "The returned ref is byte-equivalent to what the current implementation returns for the same inputs."
- **[[c4]]** `prior-artifact` `LLD S001 — errorPaths and testStrategy: the three error cases, seven edge cases, and the invariants pinned by the existing UX tests` — "The card JSON is NEVER inlined into the core markdown; the document links to its companion. Pinned at ux-integration.test.ts:75 and :124; both must keep passing untouched."
- **[[c5]]** `prior-artifact` `LLD S001 — testStrategy smoke level: the screenshot-and-read-back check` — "This level exists because the defect being fixed was invisible to a fully green suite — every unit test of the old renderer passed while it produced a node graph."
- **[[c6]]** `prior-artifact` `LLD S001 — openQuestions: the two resolved self-graded partials requiring LLD text corrections (cd3 errors shape, ep3 bundle provenance)` — "The cleaner form would have been an empty errors array with the explanation in postconditions."
- **[[c7]]** `prior-artifact` `LLD S001 — migration: the six ordered steps, including regeneration of stale artifacts and the daemon rebuild` — "Every ux-mock.html already in the tree was produced by the diagram path and does not change by itself — a companion is only rewritten when its source document is re-rendered."

<!-- insrc:review -->

## Review

### ✅ Review `PASS` — plan (plan)

**0 HIGH · 0 MED · 9 LOW** · model `client` · reviewed 2026-10-01T12:34:05.974Z

| Ref | Kind | Severity | Fixability | Premise | Evidence | Action |
| --- | --- | --- | --- | --- | --- | --- |
| t1 | closed-union | LOW | auto | UxElement is a closed union of exactly EIGHT variants at ux.ts:108-116, so the plan's 'eight element arms' and its exhaustive-switch acceptance check are bounded and checkable rather than open-ended. | CONFIRMED exactly. ux.ts:108 declares the union and :109-:116 list eight members — UxTextBlock, UxContainer, UxColumnSet, UxColumn, UxImage, UxInputText, UxInputChoiceSet, UxActionSet — with :116 carrying the terminating semicolon. The plan's 'eight element arms' is therefore a bounded count re-derived from source, not an estimate. | No change. This is what makes t1's exhaustive-switch acceptance check a compile-time property rather than a hope. |
| t1 | closed-union | LOW | auto | childrenOf at ux.ts:181-188 encodes the nesting rule as exactly three container cases, which is the rule t1 must reuse so order and nesting are preserved by construction. | CONFIRMED verbatim. ux.ts:181 declares childrenOf; :183 'case Container: return el.items;', :184 'case Column: return el.items;', :185 'case ColumnSet: return el.columns;', :186 'default: return [];'. Exactly three container cases, as the plan states. | No change. t1 reusing this rule rather than re-deriving it is what keeps order and nesting correct by construction. |
| t2 | citation | LOW | auto | The two lines t2 replaces are render.ts:137 (withSourceLink(uxDefinitionToIr(...))) and render.ts:138 (await assembleShell(ir)), and the ref kind it pins is at render.ts:151. | CONFIRMED verbatim on all three anchors. render.ts:137 'const ir = withSourceLink(uxDefinitionToIr(uxDef), opts.sourceLink);', :138 'const outcome = await assembleShell(ir);', :151 "kind:    'ux-mock'," — and that kind literal appears exactly once in source. t2's 'two-line flip' is literally two lines. | No change. |
| t7 | inventory | LOW | auto | assembleShell is called from FOUR sites in the companion module's render.ts — one per companion — so removing the UX one leaves exactly three dependents, which is what the plan's shell.ts-untouched check protects. | CONFIRMED precisely. `await assembleShell(ir)` appears at render.ts:91, :138, :187 and :225 — four sites — matching the four exported render functions at :84 renderErCompanion, :131 renderUxCompanion, :180 renderSequenceCompanion, :218 renderComponentCompanion. Removing the UX one leaves exactly THREE dependents, so the plan's blast-radius framing and t7's shell.ts-untouched check are both exact. | No change. Worth noting the other 11 assembleShell matches are all in docgen's own tests, not additional production dependents — which strengthens the claim rather than complicating it. |
| t3 | citation | LOW | auto | The three assertions t3 must leave UNCHANGED are real and at the cited lines: ux-integration.test.ts:75 and :124 (card JSON never inlined) and context-sections.test.ts:82 (an empty card still yields ['Purpose','Legend']). | CONFIRMED verbatim on all three. ux-integration.test.ts:75 and :124 each read `assert.ok(!md.includes('"AdaptiveCard"'), 'the card JSON is never inlined into the core markdown');`, and context-sections.test.ts:82 asserts the empty-card narrated titles equal ['Purpose','Legend']. These are the three assertions t3 must leave untouched, and they exist exactly where the plan says. | No change. The distinction t3 draws — descriptions of the old output move, contracts do not — rests on these being real, and they are. |
| t3 | inventory | LOW | auto | Exactly FOUR test files describe the old renderer's output and must move — ux-render, ux-integration, ux-body-fields and ux — while context-sections.test.ts carries an invariant and must not. | CONFIRMED in substance, by a different route than the probe took. My grep pattern hit the 50-match cap and returned no usable source hits, so the file inventory is not established by the engine's evidence. It is established by the earlier s1 test.locate pass in the LLD chain, which enumerated exactly five UX-touching test files — ux-render, ux-integration, ux-body-fields, ux, and context-sections — and by the two reads here confirming ux-render.test.ts:29-30 carries the TextBlock + Input.Text fixture the plan cites. | No change to the plan. Recording that this premise's probe was weak rather than letting a capped grep read as confirmation — the four-plus-one split is right, but the engine did not prove it on this pass. |
| t1 | inventory | LOW | auto | The new symbol renderUxMockDocument does not exist in source today, so t1 is additive and collides with nothing. | CONFIRMED. renderUxMockDocument returns four matches, ALL in docs/ prose (the LLD, this plan, and their generated companions) and ZERO in source. The symbol is genuinely new, so t1 is purely additive and collides with nothing — which is what makes its 'reversible by deletion' property true. | No change. |
| summary | cross-artifact | LOW | auto | The plan's scoring-basis disclosure is internally consistent with the LLD it decomposes: the LLD scored three alternatives against eight constraints and chose a1, and the plan's b1-withheld re-score reports a3 at six satisfies plus one partial versus a1's seven satisfies. | CONFIRMED in the shape expected for a cross-artifact prose claim — the probe found the b1 reference once, in docs/ — and verified by direct comparison against the LLD: the LLD scores three alternatives (a1, a2, a3) against eight constraints and records chosenAlternative 'a1', which matches the plan's disclosure. The re-score arithmetic is mine rather than the engine's: withholding b1 leaves seven issue-derived constraints, on which a3 takes six `satisfies` and one `partial` (i1 self-contained-offline, because routing through assembleShell keeps the inlined runtimes) against a1's seven `satisfies`. | No change. The disclosure is the point — it names the one step a reviewer might contest and shows the decision survives without it, so a reader can check the reasoning rather than take the elimination on trust. |
| tasks | ordering | LOW | auto | The seven tasks form an acyclic graph whose `order` is a valid topological sort: every dependency has a strictly lower order than its dependent (t5@1, t1@2, t2@3 dep t1, t3@4 dep t2, t4@5 dep t2, t6@6 dep t2+t4, t7@7 dep t3+t6). | CONFIRMED by direct inspection rather than by the probe, which was a poor choice — 'Depends on' is a table header in the artifact's own prose and cannot re-derive a graph. Checked edge by edge against the task list: t5(order 1, deps none), t1(2, none), t2(3, deps t1@2), t3(4, deps t2@3), t4(5, deps t2@3), t6(6, deps t2@3 + t4@5), t7(7, deps t3@4 + t6@6). Every dependency has a strictly lower order than its dependent, so the graph is acyclic and the ordering is a valid topological sort. | No change. Noting the probe was unsuited to the premise rather than claiming the engine verified it. |
