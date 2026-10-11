<!-- insrc:artifact DEF-7e0ae92e8f3d3c3e -->

# Epic: di1-open-source-design-corpus-retrieval

## Summary

**Flavor:** new-capability

Provide reviewed, reusable design knowledge for web, iOS and Android. Each recommendation explains its fit and preserves its source, version and reuse terms. All story criteria below specify required future behavior, not claims of implemented APIs or stored records.

## Contents

1. [Problem](#1-problem)
2. [Functional requirements](#2-functional-requirements)
3. [Non-goals](#3-non-goals)
4. [Assumptions](#4-assumptions)
5. [Constraints](#5-constraints)
6. [Stories](#6-stories)
7. [References](#7-references)

## 1. Problem

Builders need a curated, traceable body of reusable guidance covering visual style, layout, color and interaction across web and native mobile. Unversioned and unattributed advice makes design decisions hard to reproduce or review. This epic specifies new corpus-domain behavior; it does not assert that generic retrieval, workflow or artifact infrastructure is absent. Existing infrastructure reuse remains an HLD investigation, bounded by the analyzer results recorded in the implementation plan. [[c3]]

## 2. Functional requirements

- **E202610117e0ae92e:FR001** — Users find reviewed guidance appropriate to their platform and constraints, with explicit gaps and source-linked rationale.
- **E202610117e0ae92e:FR002** — Published knowledge remains attributable and reproducible across corpus revisions.

**s1:**

- **E202610117e0ae92e:S001:FR001** — Inspect complete attributable design guidance

**s2:**

- **E202610117e0ae92e:S002:FR001** — Admit only eligible material from pinned sources

**s3:**

- **E202610117e0ae92e:S003:FR001** — Use reviewed guidance across web and native mobile

**s4:**

- **E202610117e0ae92e:S004:FR001** — Find applicable guidance with traceable reasons

**s5:**

- **E202610117e0ae92e:S005:FR001** — Update corpus releases without changing project decisions

## 3. Non-goals

- **Project guideline activation and generation** — DI2 owns project identity, persistence and activation; DI3 owns authoring and reuse workflows. [[c8]] [[c9]]
- **Page design and framework generation** — The product establishes reusable project guidelines.
- **Copy UI UX Pro Max catalogs** — It is inspiration only, as explicitly recorded in the PRD. [[c10]]

## 4. Assumptions

- `low` Candidate sources may support the seed corpus, but neither file-level eligibility nor sufficient cross-platform coverage is established. Story s2 must produce the eligibility inventory and s3 must prove reviewed coverage before publication; gaps require original authored guidance or additional eligible sources, never assumed completeness. [[c1]]

## 5. Constraints

| ID | Type | Text | Source |
| :--- | :--- | :--- | :--- |
| `k1` | invariant | Only eligible open-source/open-licensed material enters distributed corpus; retain exact provenance, notices and modifications. | [[c14]] |
| `k2` | stakeholder | Cover Web, Mobile-iOS and Mobile-Android without framework dependence; corpus updates never silently change approved project decisions. Historical evidence remains pinned. [[c13]] | [[c4]] |
| `k3` | invariant | Daemon owns persistence; embeddings local; cloud LLM access through CLI providers only; provider calls sequential and accuracy governs critical reasoning. These are inherited architectural requirements for the new capability. [[c5]] [[c6]] [[c7]] | [[c2]] |

## 6. Stories

### 6.1 E202610117e0ae92e:S001 — Inspect complete attributable design guidance

**User value:** `size: M`

Curators and agents can understand applicability and reuse conditions. This story introduces the corpus record contract from PRD entry requirements; exact schema and identity mechanics are HLD decisions. [[c11]]

**Acceptance criteria:**

- **ac1:** Given a proposed foundation, pattern or style recipe, when it is submitted for publication, then missing provenance, examples, applicability or review status prevents publication. _(operationalizes `k1`)_
- **ac2:** Given a reviewed record, when it is retrieved, then stable identity, version, relationships, rationale and source lineage are visible. _(operationalizes `k1`)_

### 6.2 E202610117e0ae92e:S002 — Admit only eligible material from pinned sources

**User value:** `size: M`

Maintainers can safely assemble reproducible releases.

**Depends on:** `s1`

**Acceptance criteria:**

- **ac1:** Given a source with eligible and unknown-license files, when material is imported, then only eligible files are admitted and their exact revisions, attribution and modifications are retained. _(operationalizes `k1`)_
- **ac2:** Given an exported release, when its notices are inspected, then all included third-party material has the required license and attribution records. _(operationalizes `k1`)_

### 6.3 E202610117e0ae92e:S003 — Use reviewed guidance across web and native mobile

**User value:** `size: M`

Builders can choose coherent styles for each supported UI type.

**Depends on:** `s2`

**Acceptance criteria:**

- **ac1:** Given the seed release, when coverage is reviewed, then a reviewed coverage inventory demonstrates guidance for each of Web, Mobile-iOS and Mobile-Android across the PRD domains: Visual style; Layout; Color; Typography; Navigation and flows; Components and states; Motion and feedback; Inclusive design; Platform adaptation; Content and trust. Interaction guidance includes navigation, components and motion; accessibility guidance is included in Inclusive design. [[c12]]. _(operationalizes `k1`, `k2`, `k3`)_
- **ac2:** Given a generated or inferred suggestion, when it has not received editorial review, then it is not presented as published source-authored guidance. _(operationalizes `k1`, `k2`, `k3`)_

### 6.4 E202610117e0ae92e:S004 — Find applicable guidance with traceable reasons

**User value:** `size: M`

Agents obtain relevant evidence without inventing matches. This story introduces daemon-routed corpus retrieval under the existing daemon-owns-DB rule; it does not claim an existing corpus IPC handler. [[c2]]

**Depends on:** `s3`

**Acceptance criteria:**

- **ac1:** Given a platform and constraints, when guidance is requested, then results state applicability, caveats, fit rationale and pinned evidence through the daemon. _(operationalizes `k1`, `k2`, `k3`)_
- **ac2:** Given no eligible matching guidance, when a request is made, then an explicit gap is returned instead of fabricated recommendations. _(operationalizes `k1`, `k2`, `k3`)_

### 6.5 E202610117e0ae92e:S005 — Update corpus releases without changing project decisions

**User value:** `size: M`

Maintainers can improve knowledge while preserving reproducibility.

**Depends on:** `s4`

**Acceptance criteria:**

- **ac1:** Given an upstream content or license change, when an update is staged, then eligibility and editorial review precede publication and affected records can be deprecated or withdrawn. _(operationalizes `k1`, `k2`, `k3`)_
- **ac2:** Given a consumer holding an immutable release ID and record-version references for corpus release N, when release N+1 is published, then resolving the pinned references still returns the same release-N evidence and never substitutes N+1; approved project decisions remain unchanged. DI1 supplies stable historical evidence; DI2 stores the guideline references and tests project activation isolation. Withdrawal is explicit and must not silently substitute content. [[c13]]. _(operationalizes `k1`, `k2`, `k3`)_

## 7. References

- **[[c1]]** `doc` `docs/plans/design-intelligence-prd.md:139` — "Repository licenses identify candidates; individual files and bundled assets must still pass the ingestion requirements before inclusion. No sources have been imported by this PRD."
- **[[c2]]** `convention` `AGENTS.md:135` — "Daemon owns all DB access — CLI, MCP, and the IDE workbench communicate via IPC only."
- **[[c3]]** `doc` `plans/design-intelligence-implementation.md:23` — "DI1 Open source design corpus and retrieval"
- **[[c4]]** `doc` `docs/plans/design-intelligence-prd.md:17` — "covers both web and mobile ... focuses on designing rather than React, Angular, or any other implementation framework"
- **[[c5]]** `convention` `AGENTS.md:11` — "Accuracy is primary; cost is the least priority."
- **[[c6]]** `convention` `AGENTS.md:122` — "Never Promise.all anything that reaches an LLM provider ... always serial for...of with sequential awaits."
- **[[c7]]** `convention` `AGENTS.md:136` — "embeddings are local-only ... Cloud LLM access goes through CliProvider"
- **[[c8]]** `doc` `plans/design-intelligence-implementation.md:37` — "DI2 Project guideline identity and versioned lifecycle"
- **[[c9]]** `doc` `plans/design-intelligence-implementation.md:53` — "DI3 Guideline creation revision and agent reuse"
- **[[c10]]** `doc` `docs/plans/design-intelligence-prd.md:17` — "UI UX Pro Max is an inspiration and reference; its implementation and catalog will not be copied."
- **[[c11]]** `doc` `docs/plans/design-intelligence-prd.md:100` — "Each published entry must have a stable identifier, version, title, domain, guidance type, applicability, and independently authored explanation."
- **[[c12]]** `doc` `docs/plans/design-intelligence-prd.md:83` — "Domain | Required guidance"
- **[[c13]]** `doc` `docs/plans/design-intelligence-prd.md:125` — "Existing project decisions remain tied to their original evidence; a new corpus release produces suggested revisions and never silently redesigns a project."
- **[[c14]]** `doc` `docs/plans/design-intelligence-prd.md:177` — "Unknown, absent, conflicting, or restrictive terms block distribution of the affected material until resolved."

<!-- insrc:review -->

## Review

### ⛔ Review `BLOCK` — define (define)

**0 HIGH · 6 MED · 15 LOW** · model `cli-claude:opus` · reviewed 2026-10-11T15:14:41.556Z

| Ref | Kind | Severity | Fixability | Premise | Evidence | Action |
| --- | --- | --- | --- | --- | --- | --- |
| c4 | citation | MED | auto | docs/plans/design-intelligence-prd.md:17 states the product covers both web and mobile and focuses on designing rather than React, Angular or any other implementation framework. | The quoted text is in the PRD, but on a different line. grep /rather than React, Angular/ matched docs/plans/design-intelligence-prd.md:15: "...covers both web and mobile, includes a style/layout/color guidance corpus, and focuses on designing rather than React, Angular, or any other implementation framework." The DEF also cites this as c4 at `docs/plans/design-intelligence-prd.md:15` (DEF.md:138). Line 17 of the PRD says something else: "A project can have multiple guideline sets, one for each UI type: Web, Mobile-iOS, and Mobile-Android. The creation workflow operates at project and UI-type scope, not page scope..." So the :17 anchor is off by two lines. The claim itself (web and mobile, focus on design rather than an implementation framework) is correct and lives in the same document. Fixing the line number does not change what gets built. | Change the c4 anchor from docs/plans/design-intelligence-prd.md:17 to docs/plans/design-intelligence-prd.md:15. That makes it match the line that actually holds the cited text and the DEF's own c4 citation. |
| c10 | citation | MED | assisted | docs/plans/design-intelligence-prd.md:17 states UI UX Pro Max is an inspiration and reference and its implementation and catalog will not be copied (same line as c4). | The quoted sentence exists, but on line 15, not line 17. grep /UI UX Pro Max is an inspiration/ finds it at `docs/plans/design-intelligence-prd.md:15`: "...UI UX Pro Max is an inspiration and reference; its implementation and catalog will not be copied." It also appears in the HTML rendering at `docs/plans/design-intelligence-prd.html:40`. The DEF's own citation list (`DEF.md:144`) already gives c10 as `docs/plans/design-intelligence-prd.md:15`. Reading the cited anchor `docs/plans/design-intelligence-prd.md:17` returns different content: "A project can have multiple guideline sets, one for each UI type: Web, Mobile-iOS, and Mobile-Android...", which is about guideline-set scope, not the UI UX Pro Max non-copy rule. The anchor is out of date but the concept it points to is right. Building against it changes nothing, because the non-copy constraint is stated correctly; only the line number is wrong. The note "(same line as c4)" suggests c4 has the same wrong :17 anchor. | Change c10's anchor from `docs/plans/design-intelligence-prd.md:17` to `docs/plans/design-intelligence-prd.md:15`, which matches the evidence and the DEF citation list (DEF.md:144). Check c4: if it cites the same non-copy sentence, change its anchor to :15 too. If c4 is meant to cite the UI-type guideline-set statement, leave it at :17 and remove the "(same line as c4)" note from c10. |
| c14 | citation | MED | auto | docs/plans/design-intelligence-prd.md:177 states unknown, absent, conflicting or restrictive terms block distribution of the affected material until resolved. | The quoted text is real, but it is on a different line. Searching for /Unknown, absent, conflicting, or restrictive terms block distribution/ finds it at docs/plans/design-intelligence-prd.md:157 ("Use an explicit source allowlist. … Unknown, absent, conflicting, or restrictive terms block distribution of the affected material until resolved. …"). It also appears in the rendered docs/plans/design-intelligence-prd.html:238, and the Epic's DEF.md:148 already cites it as `docs/plans/design-intelligence-prd.md:157`. Reading the cited anchor docs/plans/design-intelligence-prd.md:177 gives "### FR1 Capture a useful design brief", a different section that says nothing about blocking distribution. So the anchor is wrong by 20 lines and points at another part of the document. The meaning of the premise is correct: the PRD does block distribution when terms are unknown, absent, conflicting or restrictive. Anything built from this premise would still follow the right policy, so this is a wrong citation, not a defect that breaks the work. | Change the c14 anchor from docs/plans/design-intelligence-prd.md:177 to docs/plans/design-intelligence-prd.md:157, which is where the quote is and matches the Epic's DEF.md citation. |
| s3/ac1 | inventory | MED | assisted | The PRD domain table starting at docs/plans/design-intelligence-prd.md:83 lists exactly ten design domains, of which style, layout, color, typography, interaction and accessibility are a subset. | Reading docs/plans/design-intelligence-prd.md:83 found `\| Domain \| Required guidance \|`, so a domain table does start at the cited anchor. The grep for rows starting with `\| Style\|Layout\|Color\|Typography\|Interaction\|Accessibility` returned only 3 matches: line 86 `\| Layout \| Grids, content width, spacing…`, line 87 `\| Color \| Semantic roles, tonal relationships…` and line 88 `\| Typography \| Role hierarchy, scale, line length…`. No row starts with `\| Style`, `\| Interaction` or `\| Accessibility`. Those three domains are either missing from the table or listed under different names (for example a combined or reworded label). The evidence also does not count the table's rows, so the claim of 'exactly ten' domains cannot be checked. Half of the subset claim is confirmed (layout, color, typography). The other half and the total count cannot be checked. | Read the full table, from line 83 to the end of the table, and count its rows. Find the exact row labels for style, interaction and accessibility, or confirm they are absent. Then update s3/ac1 to use the PRD's real domain names and the real count. If those three domains are not in the table, change the acceptance criterion so it does not treat them as PRD domains. |
| stories | ordering | MED | assisted | Stories form a linear dependency chain s1 → s2 → s3 → s4 → s5 (record contract precedes eligibility import, which precedes coverage review, retrieval, and release updates). | The grep for /Depends on/ returned 50 matches and was cut off at the cap. Every match comes from unrelated epics: add-bugfix-triage-category (DEF.md:57/70/90/104 show s2/s3 depend on s1 and s4/s5 depend on s2 and s3, which is not linear), add-build-workflow-insrc-5th-stage (DEF.md:71/92/115/129 show s2→s1, s3→s2, s4→s3, s5→s3,s4), and add-daemon-driven-code-review-stage (DEF.md:79–195). None of the matches mention this artifact's stories (record contract, eligibility import, coverage review, retrieval, release updates). No `Depends on` line for s1–s5 of the artifact under review appears in the evidence, so the claimed chain s1 → s2 → s3 → s4 → s5 can be neither confirmed nor contradicted. The other epics also show that story graphs here are often not linear (fan-out and fan-in), so a strictly linear chain should not be assumed. | Re-run the probe scoped to this artifact's own DEF.md (for example, `rg -n 'Depends on' docs/epics/<this-epic>/DEF.md`) and check each story's `**Depends on:**` line. If s3, s4 and s5 each depend only on s2 rather than forming a chain, change the premise to describe the actual graph. A linear chain would wrongly serialize the coverage review, retrieval and release updates in the plan and build order. |
| k2 | semantic | MED | assisted | Constraint k2's source c4 (PRD:17) supports web+mobile and framework independence, while the 'updates never silently change approved project decisions' clause is supported by c13 (PRD:125), not c4. | Most of the premise holds. The part about c13 is confirmed. docs/plans/design-intelligence-prd.md:125 says "Existing project decisions remain tied to their original evidence; a new corpus release produces suggested revisions and never silently redesigns a project". So the "updates never silently change approved project decisions" clause comes from c13 (PRD:125), not c4. The web+mobile part is also confirmed: PRD:17 says "A project can have multiple guideline sets, one for each UI type: Web, Mobile-iOS, and Mobile-Android … Users may create one set now and add another UI type later." But PRD:17 says nothing about framework independence: no frameworks, no implementation tech, no independence from either. The premise says c4 supports framework independence, and the evidence does not show that. That part cannot be verified from what was gathered. None of this changes what gets built. The constraint itself is not wrong; only its citations are imprecise, so this is not HIGH. | Change k2's sources so that c13 (PRD:125) is cited for the clause "updates never silently change approved project decisions". Keep c4 (PRD:17) only for web + Mobile-iOS/Android support. Find the PRD line that actually states framework independence and cite that. If no line states it, mark framework independence as an inferred or unsourced part of k2 rather than crediting it to c4. |
| c1 | citation | LOW | manual | docs/plans/design-intelligence-prd.md:139 states that repository licenses identify candidates, individual files and bundled assets must still pass ingestion requirements, and no sources have been imported by the PRD. | The file docs/plans/design-intelligence-prd.md:139 contains: "The following repositories are the proposed starting collection, based on the source review on 11 October 2026. Repository licenses identify candidates; individual files and bundled assets must still pass the ingestion requirements before inclusion. No sources have been imported by this PRD." A grep for /No sources have been imported by this PRD/ returns this same line at md:139, the matching HTML render at docs/plans/design-intelligence-prd.html:181, and the DEF citation at DEF.md:135, which quotes the text word for word. All three parts of the premise are confirmed at the cited anchor: licenses identify candidates, individual files and bundled assets must still pass ingestion, and no sources have been imported. | none — verified sound |
| c2 | citation | LOW | manual | AGENTS.md:135 states 'Daemon owns all DB access — CLI, MCP, and the IDE workbench communicate via IPC only.' | read AGENTS.md:135 → FOUND: "1. **Daemon owns all DB access** — CLI, MCP, and the IDE workbench communicate via IPC only." The grep /Daemon owns all DB access/ also matches AGENTS.md:135 with the same text, and CLAUDE.md:135 has the same line. The cited anchor points to exactly the quoted rule. | none — verified sound |
| c3 | citation | LOW | manual | plans/design-intelligence-implementation.md:23 names 'DI1 Open source design corpus and retrieval'. | The read of plans/design-intelligence-implementation.md:23 returned FOUND: "### DI1 Open source design corpus and retrieval". The grep /DI1 Open source design corpus/ also matched that exact file:line (plus a status-table row at line 92 and the DEF's own citation line 137). The anchored line has exactly the title the premise gives. The read of docs/plans/design-intelligence-implementation.md:23 came back NOT FOUND, but the premise's anchor is plans/… at the repo root, not docs/plans/…, so that miss does not affect this premise. | none — verified sound |
| c5 | citation | LOW | manual | AGENTS.md:11 states 'Accuracy is primary; cost is the least priority.' | The read of AGENTS.md:11 returned FOUND: "- **Accuracy is primary; cost is the least priority.** When choosing between an accurate-but-expensive path ... choose accuracy." The grep for /Accuracy is primary; cost is the least priority/ also matched AGENTS.md:11 with the same text, and CLAUDE.md:11 has the same bullet. The quoted phrase is in the cited file at the cited line, word for word. | none — verified sound |
| c6 | citation | LOW | manual | AGENTS.md:122 states never Promise.all anything that reaches an LLM provider; always serial for...of with sequential awaits. | `read AGENTS.md:122` returned FOUND with this text: "- Never `Promise.all` anything that reaches an LLM provider (cloud or local Ollama embed / complete); always serial `for...of` with sequential awaits." The grep found the same sentence at CLAUDE.md:122. It also found it written into the code-review conventions catalogue at src/workflow/code-review/dimensions/conventions.ts:95, as rule 'no-promise-all-llm' tagged (k4). The quote and the line number in the premise both match the source. The premise drops the parenthetical "(cloud or local Ollama embed / complete)", but that does not change the rule. | None needed. The premise is confirmed by the source. |
| c7 | citation | LOW | manual | AGENTS.md:136 states embeddings are local-only and cloud LLM access goes through CliProvider. | read AGENTS.md:136 → FOUND: "2. **Local-first** — Ollama is always available (embeddings are local-only). Cloud LLM access goes through `CliProvider` (claude + codex CLI subprocesses); no direct REST." The grep for /embeddings are local-only/ also matches AGENTS.md:136 directly. The same line appears at CLAUDE.md:136, and README.md:75 and site/architecture.html:184 say the same thing. The cited anchor points to exactly the claim the premise makes: embeddings are local-only, and cloud LLM access goes through CliProvider. | none — verified sound |
| c8 | citation | LOW | manual | plans/design-intelligence-implementation.md:37 names 'DI2 Project guideline identity and versioned lifecycle'. | read plans/design-intelligence-implementation.md:37 → FOUND: "### DI2 Project guideline identity and versioned lifecycle". The grep for /DI2 Project guideline identity/ also matches the same file at line 37, and at line 93, which is the status table row. The anchor's path, line, and quoted text all resolve exactly. The NOT FOUND on docs/plans/... is a probe of a different path and does not affect this citation, because the artifact cites plans/..., not docs/plans/.... | none — verified sound |
| c9 | citation | LOW | manual | plans/design-intelligence-implementation.md:53 names 'DI3 Guideline creation revision and agent reuse'. | `read plans/design-intelligence-implementation.md:53` → FOUND: "### DI3 Guideline creation revision and agent reuse". The grep for /DI3 Guideline creation/ matches the same line (plans/design-intelligence-implementation.md:53), and the DI1 DEF.md:143 cites the same quote for [[c9]]. The file sits at the repo-root `plans/` path, not under `docs/plans/` (`read docs/plans/design-intelligence-implementation.md:53` → NOT FOUND). The citation uses the root-level path, so it resolves correctly. | None. The premise is confirmed by the evidence. |
| c11 | citation | LOW | manual | docs/plans/design-intelligence-prd.md:100 requires each published entry to have a stable identifier, version, title, domain, guidance type, applicability and independently authored explanation. | I read docs/plans/design-intelligence-prd.md:100, and it says: "Each published entry must have a stable identifier, version, title, domain, guidance type, applicability, and independently authored explanation. It must also include:". All seven attributes in the premise are there, in the same order. The grep for this sentence also found it in the HTML version (docs/plans/design-intelligence-prd.html:154) and in the DEF citation [[c11]] (DEF.md:145). The citation gives the correct line, and the premise states it accurately. One gap: line 100 ends with "It must also include:", so more required fields follow. The premise does not claim to list every field, so this does not make it wrong. | None: the premise matches the source. Optionally, check that downstream work also covers the extra fields that come after "It must also include:" on line 100. |
| c12 | citation | LOW | manual | docs/plans/design-intelligence-prd.md:83 is the header row of a 'Domain \| Required guidance' table. | read docs/plans/design-intelligence-prd.md:83 → FOUND: "\| Domain \| Required guidance \|". This is the header row of a markdown table with exactly the columns 'Domain' and 'Required guidance'. The grep /Domain \\\| Required guidance/ also matches docs/plans/design-intelligence-prd.md:83, and DEF.md:146 cites the same anchor ([[c12]]). The cited line therefore resolves to exactly the entity the premise names. | none — verified sound |
| c13 | citation | LOW | manual | docs/plans/design-intelligence-prd.md:125 states existing project decisions remain tied to their original evidence and a new corpus release never silently redesigns a project. | The read of docs/plans/design-intelligence-prd.md:125 returned FOUND: "Corpus releases are versioned. Existing project decisions remain tied to their original evidence; a new corpus release produces suggested revisions and never silently redesigns a project." The grep for /never silently redesigns a project/ matches that same line, and the line's text agrees with the premise. The other two matches are the DEF.md citation entry (DEF.md:147), which quotes the line word for word, and the mirrored HTML render (design-intelligence-prd.html:171). So the anchor resolves to the cited claim. | none — verified sound |
| non-goals | inventory | LOW | manual | The implementation plan defines DI1, DI2 and DI3 as separate work items, with DI2 owning project identity/persistence/activation and DI3 owning authoring and reuse workflows. | The grep /^#+ *DI[0-9]+ / found three separate work-item headings in plans/design-intelligence-implementation.md, at the lines the premise cites: line 23 "### DI1 Open source design corpus and retrieval", line 37 "### DI2 Project guideline identity and versioned lifecycle", and line 53 "### DI3 Guideline creation revision and agent reuse". The reads of lines 37 and 53 return the same headings. The DI2 heading matches the premise's claim about identity and lifecycle, which covers persistence and activation. The DI3 heading matches its claim about authoring (creation and revision) and agent reuse. The only other match, plans/design-intelligence-di1-review-resolution.md:1, is a separate review document and not a fourth work item. The headings do not mention "persistence" or "activation" word for word, but those terms fit inside "versioned lifecycle", and they do not change the boundary that the non-goals rely on. | None needed: the evidence confirms the premise. |
| s4 | semantic | LOW | manual | No existing daemon IPC handler for design corpus retrieval exists in src/; S004 introduces new daemon-routed corpus retrieval. | The premise says no daemon handler for design-corpus retrieval exists in src/. All three repo-wide probes support that. `grep /designCorpus/` found 0 matches. `grep /design[_.-]?corpus/` found 7 matches, and every one is in a doc or plan: docs/epics/di1-…/DEF.md:3, docs/epics/di3-…/DEF.md:158/175/190/192, plans/design-intelligence-di1-review-resolution.md:5 and plans/design-intelligence-implementation.md:92. None is under src/. `grep /corpus\\./` found 9 matches. Four are in docs/plans/design-intelligence-prd.{md,html}. The five in src/ are unrelated to design corpus retrieval: one is a BM25 comment at src/analyze/docs-retrieval.ts:253, and four are analyze prompt text in src/prompts/analyze/decompose.system.md:204, docs.aggregate.system.md:52 and docs.system.md:23/38. No match falls in src/daemon/index.ts or under src/daemon/, so no IPC method such as `corpus.*` or `designCorpus.*` is registered. One caveat: the evidence includes no direct read of the src/daemon/index.ts anchor. Absence is therefore inferred from the repo-wide greps, which would have caught handler names built from these terms. | None; the premise is verified. Optional: when S004 is built, check the src/daemon/index.ts handler registry for any guidance or retrieval handler under a name other than 'corpus', to confirm nothing overlaps. |
| k3 | cross-artifact | LOW | manual | The cited AGENTS.md lines (11, 122, 135, 136) carry the same rules as the project CLAUDE.md principles and key architectural rules that constraint k3 inherits. | All four cited AGENTS.md lines exist and contain the CLAUDE.md rules. `read AGENTS.md:11` returns the "Accuracy is primary; cost is the least priority" principle, including the coreFloor / model-tiering text. `read AGENTS.md:122` returns "Never `Promise.all` anything that reaches an LLM provider ... always serial `for...of` with sequential awaits." `read AGENTS.md:135` returns "1. **Daemon owns all DB access** — CLI, MCP, and the IDE workbench communicate via IPC only." `read AGENTS.md:136` returns "2. **Local-first** — Ollama is always available (embeddings are local-only). Cloud LLM access goes through `CliProvider` ...; no direct REST." The grep matches show the same text at the same line numbers in CLAUDE.md: `CLAUDE.md:135` matches "Daemon owns all DB access" and `CLAUDE.md:136` matches "Local-first". A prior DEF review (docs/epics/di3-.../DEF.md:202) also found that AGENTS.md's title line is "# CLAUDE.md — insrc backend" and that it matches CLAUDE.md line for line. Lines 11 and 122 of CLAUDE.md were not read directly in this evidence. The identical line numbers at 135 and 136, together with the copy relationship, support the same alignment there. | none — verified sound |
| k2 | closed-union | LOW | manual | The supported UI platforms are exactly Web, Mobile-iOS and Mobile-Android, per the PRD. | The read of docs/plans/design-intelligence-prd.md:17 confirms the anchor: "A project can have multiple guideline sets, one for each UI type: Web, Mobile-iOS, and Mobile-Android." Other PRD lines list the same three types and no others: line 9 ("selects the UI types to cover: Web, Mobile-iOS, and Mobile-Android"), lines 56–57 (the scope table rows for Mobile-iOS and Mobile-Android), line 213 ("Produce separate Web, Mobile-iOS, and Mobile-Android guideline sets"), line 264 ("each exercised for Web, Mobile-iOS, and Mobile-Android, yielding 24 guideline sets", which is 8 × 3) and line 282 (first release). The PRD also places edge cases inside these three types rather than adding new ones. Line 217 says "Responsive mobile web resolves to the Web set; phone and tablet adaptations remain within the appropriate mobile set," and line 213 puts tablet and larger mobile screens inside the mobile sets. plans/design-intelligence-implementation.md:9 and :31 repeat the same three. No matched line names a fourth type. Earlier reviews of di2 and di3 marked this claim unverifiable because they found 0 matches. This evidence contains a direct PRD anchor, so that gap is closed. | none — verified sound |

#### Proposed fixes

- **c4** (auto) — The grep shows the cited sentence at design-intelligence-prd.md:15. Line 17 holds different content (guideline sets per UI type). The DEF's c4 already uses :15, so this is only a line-number correction.
  - edit: `docs/plans/design-intelligence-prd.md:17` → `docs/plans/design-intelligence-prd.md:15`

- **c10** (assisted) — The quoted text is verified at prd.md:15, and line 17 holds unrelated guideline-set content. The `docs/plans/design-intelligence-prd.md:17` substring probably appears more than once (in c4 and c10), so a safe unique find/replace can't be guaranteed without seeing the artifact. Someone needs to confirm which citations to move.
  - option: Move both c10 and c4 to docs/plans/design-intelligence-prd.md:15, if both cite the UI UX Pro Max non-copy sentence.
  - option: Move only c10 to :15 and remove '(same line as c4)'. Keep c4 at :17 if it is meant to cite the per-UI-type guideline-set statement.
  - option: Merge c10 into c4 as one citation anchored at docs/plans/design-intelligence-prd.md:15.

- **c14** (auto) — The search puts the quoted sentence at docs/plans/design-intelligence-prd.md:157. Line 177 is the 'FR1 Capture a useful design brief' heading. DEF.md:148 already cites :157 for c14, so this edit makes the artifact match its source.
  - edit: `docs/plans/design-intelligence-prd.md:177` → `docs/plans/design-intelligence-prd.md:157`

- **s3/ac1** (assisted) — The anchor and three of the six named domains are confirmed. Style, interaction and accessibility have no matching table row under those names, and the total of ten is unverified. The right edit depends on the real row labels and count, which the evidence does not include, so no automatic edit is safe.
  - option: Read docs/plans/design-intelligence-prd.md from line 83 to the end of the table. Replace 'style', 'interaction' and 'accessibility' in the premise with the exact row labels the PRD uses, and correct 'exactly ten' to the real row count.
  - option: If the table has no style, interaction or accessibility rows, narrow the subset in s3/ac1 to the confirmed domains (layout, color, typography) and treat the other three as additions that need their own justification.
  - option: Remove the exact-count claim ('exactly ten') from the premise so the acceptance criterion depends only on the named domains being present.

- **stories** (assisted) — The evidence does not cover this artifact's stories, so no edit can be derived from it. A person needs to check the artifact's own Depends-on lines and pick the correct wording.
  - option: Keep the linear chain s1 → s2 → s3 → s4 → s5 once a scoped grep of this epic's DEF.md confirms each story depends only on the one before it.
  - option: Change it to a fan-out (s1 → s2, then s3/s4/s5 each depend on s2) if the DEF.md Depends-on lines show coverage review, retrieval and release updates are independent of each other.
  - option: Change it to a partial order (for example, s5 depends on s3 and s4) if release updates need both coverage review and retrieval to be finished.

- **k2** (assisted) — The evidence shows c13 (PRD:125) is the source of the 'never silently change' clause, and it shows c4 (PRD:17) covers web+mobile but not framework independence. The exact wording of k2 in the artifact was not provided, so no exact find/replace edit can be written safely.
  - option: Cite k2 as c4 (PRD:17) for web + mobile UI types, c13 (PRD:125) for 'never silently changes approved decisions', plus whichever PRD line states framework independence.
  - option: Split k2 into separate constraints: one for UI-type coverage (c4), one for safe updates (c13), one for framework independence (its own source).
  - option: If no PRD line states framework independence, drop it from k2 or label it as a design assumption with no PRD source.
