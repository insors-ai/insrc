<!-- insrc:artifact DEF-b452bdbfc94c0a8f -->

# Epic: di3-guideline-creation-revision-agent-reuse

## Summary

**Flavor:** new-capability

Let users create and revise reusable guidelines for selected project UI types in a guided conversation. Agents then apply the approved guidelines across pages without repeating design exploration.

## Contents

1. [Problem](#1-problem)
2. [Functional requirements](#2-functional-requirements)
3. [Non-goals](#3-non-goals)
4. [Assumptions](#4-assumptions)
5. [Constraints](#5-constraints)
6. [Stories](#6-stories)
7. [References](#7-references)
8. [Open questions](#8-open-questions)

## 1. Problem

Users who want a consistent project design language must repeatedly restate their intent, compare disconnected choices and carry decisions between conversations themselves. Adding a mobile platform risks losing established brand choices, while routine page work can reopen settled design questions. There is no coherent user journey for creating, reviewing and deliberately revising reusable project guidelines while keeping ordinary consumption separate from authoring.

## 2. Functional requirements

- **E20261011b452bdbf:FR001** — Users create, resume and revise project guidelines for selected UI types through one guided conversation.
- **E20261011b452bdbf:FR002** — Agents apply approved guidelines repeatedly without generating new design artifacts or approval requests.

**s1:**

- **E20261011b452bdbf:S001:FR001** — Request project guidelines for selected UI types

**s2:**

- **E20261011b452bdbf:S002:FR001** — Compare directions and draft coherent reusable guidelines

**s3:**

- **E20261011b452bdbf:S003:FR001** — Review approve and resume guideline work deliberately

**s4:**

- **E20261011b452bdbf:S004:FR001** — Add platforms and revise guidelines without changing other sets

**s5:**

- **E20261011b452bdbf:S005:FR001** — Apply active guidelines to page work without restarting design

**s6:**

- **E20261011b452bdbf:S006:FR001** — Inspect guideline examples and verify cross-platform reuse

## 3. Non-goals

- **Per-page design exercises, production screen mockups or framework generation** — This workflow creates project guidelines, not individual page designs.
- **Reimplement corpus ingestion or project lifecycle** — DI1 and DI2 own those dependencies.

## 4. Assumptions

- `high` DI1 corpus and DI2 project lifecycle contracts will be reviewed and approved before dependent workflow implementation. [[c3]]
- `low` Lightweight guideline specimens are a proposed aid; exact fidelity remains to be confirmed before its story design. [[c1]]

## 5. Constraints

| ID | Type | Text | Source |
| :--- | :--- | :--- | :--- |
| `k1` | stakeholder | Create distinct guideline sets for requested Web/Mobile-iOS/Mobile-Android types from a shared project brief; page changes never trigger guideline authoring. | [[c1]] |
| `k2` | invariant | Review and explicit version-specific approval precede activation; revisions preserve current approved sets until replacement approval. | [[c1]] |
| `k3` | contract | Reuse DI1 corpus evidence and DI2 identity/lifecycle; preserve provenance and avoid silent cross-platform changes. | [[c3]] |
| `k4` | invariant | Daemon owns persistence, clients use IPC, cloud access uses CLI providers, provider calls are sequential and critical reasoning obeys the capability floor. | [[c2]] |

## 6. Stories

### 6.1 E20261011b452bdbf:S001 — Request project guidelines for selected UI types

**User value:** `size: M`

Users describe their project once and retain existing decisions.

**Acceptance criteria:**

- **ac1:** Given a request for Web and iOS project guidelines, when the conversation begins, then the project, requested types and existing sets are resolved and one shared brief is gathered. _(operationalizes `k1`, `k3`, `k4`)_
- **ac2:** Given an approved Web set already exists, when the same project/type is requested again, then existing guidance is surfaced and a revision requires explicit intent rather than a competing default. _(operationalizes `k1`, `k3`, `k4`)_

### 6.2 E20261011b452bdbf:S002 — Compare directions and draft coherent reusable guidelines

**User value:** `size: M`

Users make informed project-wide choices supported by source evidence.

**Depends on:** `s1`

**Acceptance criteria:**

- **ac1:** Given a sufficient project brief, when directions are explored, then distinct coherent alternatives explain task fit, tradeoffs and corpus evidence. _(operationalizes `k1`, `k3`, `k4`)_
- **ac2:** Given a selected direction and requested UI types, when drafting completes, then each requested type has reusable rules and source lineage, with corpus gaps explicit and no framework prerequisite. _(operationalizes `k1`, `k3`, `k4`)_

### 6.3 E20261011b452bdbf:S003 — Review approve and resume guideline work deliberately

**User value:** `size: M`

Users keep control of activation without losing progress.

**Depends on:** `s2`

**Acceptance criteria:**

- **ac1:** Given separate reviewed Web and iOS drafts, when the user approves only the exact Web version, then only Web activates while iOS remains a draft. _(operationalizes `k2`, `k3`, `k4`)_
- **ac2:** Given a conversation is interrupted, when it resumes, then the brief, choices and drafts are retained without duplicate activation. _(operationalizes `k2`, `k3`, `k4`)_
- **ac3:** Given review is stale or blocking, when approval is attempted, then activation is withheld with the reason visible. _(operationalizes `k2`, `k3`, `k4`)_

### 6.4 E20261011b452bdbf:S004 — Add platforms and revise guidelines without changing other sets

**User value:** `size: M`

Users evolve a project while preserving settled choices.

**Depends on:** `s3`

**Acceptance criteria:**

- **ac1:** Given approved Web and iOS guidelines, when the user requests Android, then brand choices are reused with source-version lineage and Android-specific decisions are explicit. _(operationalizes `k1`, `k3`, `k4`)_
- **ac2:** Given an explicit Web revision, when a new draft is prepared, then current Web and mobile versions remain unchanged until the exact revision is approved. _(operationalizes `k1`, `k3`, `k4`)_

### 6.5 E20261011b452bdbf:S005 — Apply active guidelines to page work without restarting design

**User value:** `size: M`

Agents use stable rules for every page.

**Depends on:** `s3`

**Acceptance criteria:**

- **ac1:** Given multiple page tasks with one project/UI type, when agents request design context, then the same active guideline version is returned and recorded without new drafts or reapproval. _(operationalizes `k1`, `k3`, `k4`)_
- **ac2:** Given no approved set for the requested type, when an agent requests context, then missing guidance is reported and creation is offered without silent generation or substitution. _(operationalizes `k1`, `k3`, `k4`)_

### 6.6 E20261011b452bdbf:S006 — Inspect guideline examples and verify cross-platform reuse

**User value:** `size: M`

Users can understand reusable rules and assess practical consistency.

**Depends on:** `s4`, `s5`

**Acceptance criteria:**

- **ac1:** Given a guideline version and agreed lightweight specimen scope, when examples are produced, then palette, type, component states and representative layouts illustrate that version without requiring production page designs. _(operationalizes `k1`, `k3`, `k4`)_
- **ac2:** Given eight project briefs across three UI types, when guidelines are evaluated on several representative pages each, then traceability, platform fit, consistency, read-only reuse and critical violations are reported against the PRD acceptance criteria. _(operationalizes `k1`, `k3`, `k4`)_

## 7. References

- **[[c1]]** `doc` `docs/plans/design-intelligence-prd.md#project-guideline-workflow`
- **[[c2]]** `convention` `AGENTS.md`
- **[[c3]]** `doc` `plans/design-intelligence-implementation.md#di3-guideline-creation-revision-and-agent-reuse`
- **[[c4]]** `prior-artifact` `/Users/subhagho/work/projects/insors/insrc/docs/epics/di1-open-source-design-corpus-retrieval-E202610117e0ae92e/DEF.md`
- **[[c5]]** `prior-artifact` `/Users/subhagho/work/projects/insors/insrc/docs/epics/di2-project-guideline-identity-versioned-lifecycle-E202610114abafc9d/DEF.md`

## 8. Open questions

- Item a2: Confirm whether the first release includes lightweight palette/type/component/layout specimens or written guidelines only before designing story s6.

## Resolved questions

- `q1d8128b2` — Item a2: Confirm whether the first release includes lightweight palette/type/component/layout specimens or written guidelines only before designing story s6.
  - **resolved**: Include lightweight palette, typography, component-state and representative layout examples alongside written project guidelines in the first release. — Explicit user selection in chat on 11 October 2026; examples illustrate reusable guidelines, not per-page designs. _(2026-10-11T14:52:34.995Z)_

## Citations

- **[[c1]]** `doc` `docs/plans/design-intelligence-prd.md#project-guideline-workflow`
- **[[c2]]** `convention` `AGENTS.md`
- **[[c3]]** `doc` `plans/design-intelligence-implementation.md#di3-guideline-creation-revision-and-agent-reuse`
- **[[c4]]** `prior-artifact` `/Users/subhagho/work/projects/insors/insrc/docs/epics/di1-open-source-design-corpus-retrieval-E202610117e0ae92e/DEF.md`
- **[[c5]]** `prior-artifact` `/Users/subhagho/work/projects/insors/insrc/docs/epics/di2-project-guideline-identity-versioned-lifecycle-E202610114abafc9d/DEF.md`

<!-- insrc:review -->

## Review

### ⛔ Review `BLOCK` — define (define)

**0 HIGH · 14 MED · 2 LOW** · model `cli-claude:opus` · reviewed 2026-10-11T14:58:28.727Z

| Ref | Kind | Severity | Fixability | Premise | Evidence | Action |
| --- | --- | --- | --- | --- | --- | --- |
| c1 | citation | MED | assisted | The PRD document docs/plans/design-intelligence-prd.md exists and contains a 'Project guideline workflow' section (anchor #project-guideline-workflow) that is the source for constraints k1 and k2. | The file exists. `read docs/plans/design-intelligence-prd.md:1` → FOUND: `# insrc Design Intelligence PRD`. The cited section was not found: case-insensitive `grep /(?i)project guideline workflow/` → 0 matches across the tree, PRD included. A heading such as "Project guideline workflow", which would produce the slug `#project-guideline-workflow`, would have matched that grep. The same unresolved anchor `docs/plans/design-intelligence-prd.md#project-guideline-workflow` also appears in di2 DEF.md:136 and di3 DEF.md:155 and :172. An earlier review already flagged it in di2 DEF.md:151 ("The section the anchor names was not found"). In the evidence, the only resolved PRD heading besides the title is the sourcing heading at PRD:127, which plans/design-intelligence-implementation.md:102 cites for DI1, not a guideline-workflow section. Nothing in the evidence shows the text of k1 or k2 in the PRD. The anchor is unresolved, so the premise cannot be verified. Still, the file is real, and nothing shows that building against k1/k2 would produce wrong code. That makes this a broken citation, not a failure that would break the build. | Open docs/plans/design-intelligence-prd.md and find the heading that actually states the project-guideline lifecycle constraints (k1/k2). Re-anchor c1 to that heading's real slug, or cite path:line, and quote the supporting lines for k1 and k2 in the artifact. If no PRD section states k1/k2, re-source the constraints or mark them as assumptions. |
| c3 | citation | MED | assisted | The implementation plan plans/design-intelligence-implementation.md (cited without a docs/ prefix) exists and has a 'DI3 Guideline creation, revision and agent reuse' section that is the source for constraint k3 and the high-confidence DI1/DI2 dependency assumption. | Only part of the premise is confirmed. The file location is right: `read plans/design-intelligence-implementation.md:1` → FOUND ("# Design intelligence implementation plan"), and `read docs/plans/design-intelligence-implementation.md:1` → NOT FOUND. So citing it without a docs/ prefix is correct. The section is not confirmed. The case-insensitive grep `/(?i)DI3.*guideline creation/` returned 0 matches across the tree, and it would have matched a heading such as "DI3 Guideline creation, revision and agent reuse". The 13 matches for `design-intelligence-implementation` are all citations of the file: DI3 DEF.md:157 and :174 (this same `#di3-guideline-creation-revision-and-agent-reuse` anchor), plus the DI1/DI2 DEF reviews, which had the same "file exists, section not found" result. The one line from inside the plan (`plans/design-intelligence-implementation.md:102`) mentions only a DI1 heading at `:23`. Nothing in the evidence shows a DI3 section, or any text supporting constraint k3 or the high-confidence DI1/DI2 dependency assumption. The anchor still names the right document, and nothing shows the claimed content is wrong. It is just unverified. So I can't name a concrete build failure, and this is MED rather than HIGH. | Open plans/design-intelligence-implementation.md and look for the real DI3 heading, if there is one. If it exists, change c3's anchor slug and the premise text to match it exactly. Then check that the section actually states the content behind k3 and the DI1/DI2 dependency assumption. If there is no DI3 section, cite the file without the section anchor and re-ground k3 and the dependency assumption on text that exists. If neither works, lower the confidence of the dependency assumption from high. |
| c4 | cross-artifact | MED | assisted | The prior DI1 Define artifact exists at /Users/subhagho/work/projects/insors/insrc/docs/epics/di1-open-source-design-corpus-retrieval-E202610117e0ae92e/DEF.md and owns corpus ingestion/retrieval, which this epic reuses rather than reimplements. | The artifact exists. A read of /Users/subhagho/work/projects/insors/insrc/docs/epics/di1-open-source-design-corpus-retrieval-E202610117e0ae92e/DEF.md:1 returned FOUND (`<!-- insrc:artifact DEF-7e0ae92e8f3d3c3e -->`), and DEF.md:3 reads `# Epic: di1-open-source-design-corpus-retrieval`. Its content supports the claim that it owns corpus ingestion and retrieval. DEF.md:36 lists S002 'Admit only eligible material from pinned sources' (ingestion). DEF.md:44 lists S004 'Find applicable guidance with traceable reasons' (retrieval). DEF.md:48 lists S005 'Update corpus releases without changing project decisions'. DEF.md:27-28 hold FR001/FR002, which cover attributable, reproducible guidance across corpus revisions. The di3 DEF cites it as `[[c4]] prior-artifact` at docs/epics/di3-guideline-creation-revision-agent-reuse-E20261011b452bdbf/DEF.md:158 and :175. However, plans/design-intelligence-implementation.md:92 records DI1 as 'Defined with 5 stories; independent review blocked; not approved'. So this epic reuses an upstream Define that has failed review and has not been approved, and its scope may still change. The premise does not say DI1 is approved, so it is not contradicted. But the claim that ingestion and retrieval are reused rather than reimplemented depends on an upstream that is not settled, and nothing in the evidence shows that the reuse boundary is fixed. | Keep the c4 reference, and state in the artifact that DI1 (E202610117e0ae92e) is not approved and its independent review is blocked. Make DI1 approval, or resolution of its blocking review findings, a prerequisite before this epic moves to design. Alternatively, record the DI1 story IDs this epic depends on (S002 ingestion, S004 retrieval) so it is visible if DI1's scope changes. |
| c5 | cross-artifact | MED | manual | The prior DI2 Define artifact exists at /Users/subhagho/work/projects/insors/insrc/docs/epics/di2-project-guideline-identity-versioned-lifecycle-E202610114abafc9d/DEF.md and owns project/guideline identity and versioned lifecycle, which this epic reuses. | The evidence confirms what the premise states. Reading /Users/subhagho/work/projects/insors/insrc/docs/epics/di2-project-guideline-identity-versioned-lifecycle-E202610114abafc9d/DEF.md:1 returns FOUND with the header `<!-- insrc:artifact DEF-4abafc9dec4c3a5c -->`. Line 3 reads `# Epic: di2-project-guideline-identity-versioned-lifecycle`.  The file also covers project/guideline identity and the versioned lifecycle, as claimed: - :27 FR001: "Users manage independent guideline history and approval for each project and UI type" - :28 FR002: "Agents receive the exact requested guideline version and status" - :32 S001: "Identify projects and their supported guideline sets" - :36 S002: "Save complete guideline drafts and retain history" - :40 S003: "Activate only the exact reviewed and approved revision" - :44 S004: "Resolve active and historical guidelines without changing them" - :48 S005: "Export traceable guidelines…"  The DI3 DEF cites this file as `[[c5]] prior-artifact` at :159 and :176, so the cross-reference resolves.  There is one concern the premise does not mention. plans/design-intelligence-implementation.md:93 records DI2 as "Defined with 5 stories; independent review blocked; not approved". DI2's own review table at DEF.md:157–158 still has open MED findings (p9, p10). This epic therefore builds on an upstream Define that has not been approved and is blocked in review. If DI2's stories, FRs or constraints change when that review is resolved, the identity and lifecycle contracts this epic depends on could change too. | The premise is verified as written: the file exists and it owns the identity and lifecycle scope. The open issue is that DI2 has not been approved and its review is blocked. Choose one of these: - Get DI2 approved first by resolving its blocking review findings. - Record in this epic that it depends on DI2 FR001/FR002 and S001–S005 while DI2 is still pending approval. - Re-check this epic's reuse claims once DI2 is approved. |
| p6 | cross-artifact | MED | assisted | The cited references c1–c5 resolve against the repository the epic targets; c4/c5 point into /Users/subhagho/work/projects/insors/insrc while the review runs in ~/.insrc/daemon, so the doc citations c1/c2/c3 must resolve in the same target repo as the prior artifacts. | The evidence supports only part of the premise. Two of the doc citations do resolve in the tree under review (~/.insrc/daemon):  - **c1:** `read docs/plans/design-intelligence-prd.md:1` → FOUND "# insrc Design Intelligence PRD". It is cited in the DI1 DEF as `docs/plans/design-intelligence-prd.md#open-source-sourcing-and-ingestion` (DEF.md:135). - **c3:** `plans/design-intelligence-implementation.md` exists in the same tree. The grep matched its lines 9 and 102, and it is cited in the DI1 DEF as `plans/design-intelligence-implementation.md#di1-open-source-design-corpus-and-retrieval` (DEF.md:137). - **AGENTS.md:** `read AGENTS.md:1` → FOUND. - **Section anchors:** plans/design-intelligence-implementation.md:102 records that direct file checks confirmed `docs/plans/design-intelligence-prd.md:127` holds the sourcing heading and `plans/design-intelligence-implementation.md:23` holds the DI1 heading. Earlier "section not found" results came from incomplete probes, not missing content.  Three parts of the premise have no evidence at all:  - **c2:** not shown in any match or read. - **c4/c5:** nothing is shown for either citation. No match or read contains the path `/Users/subhagho/work/projects/insors/insrc`. - **Cross-repo claim:** no evidence shows c4/c5 pointing outside the tree under review, or that the review tree and the epic's target repo are different repos.  So "c1/c3 resolve in the review tree" is verified, but "c4/c5 resolve in a different repo, so the citations disagree on their target" cannot be checked. I can't name a concrete failure in the build, so this is not HIGH. | Settle which repo the citations resolve against:  1. Confirm the epic's target repo. 2. If c4/c5 are absolute paths into /Users/subhagho/work/projects/insors/insrc, rewrite them as paths relative to the target repo, as c1/c3 already are, so that all of c1–c5 resolve in one tree. 3. Check that c2 resolves there too. 4. Re-run the probes against that single repo. |
| p8 | inventory | MED | assisted | There are exactly four constraints k1–k4 (stakeholder, invariant, contract, invariant), and every acceptance criterion operationalizes k3 and k4 plus either k1 or k2. | The grep for /operationalizes `k[12]`, `k3`, `k4`/ found 13 acceptance criteria in docs/epics/di3-guideline-creation-revision-agent-reuse-E20261011b452bdbf/DEF.md. They sit at lines 84, 85, 97, 98, 110, 111, 112, 124, 125, 137, 138, 150 and 151. Each one is tagged with k3 and k4 plus exactly one of k1 or k2. Ten use k1: lines 84, 85, 97, 98, 124, 125, 137, 138, 150 and 151. Three use k2: lines 110, 111 and 112 (the approval/activation story). So the mapping half of the premise holds for every criterion the grep found. The rest of the premise cannot be checked from this evidence. No constraint definitions were gathered, so nothing shows there are exactly four constraints or that their kinds are stakeholder, invariant, contract and invariant. The grep also only finds criteria that already carry this exact tag. It cannot show that no other criterion in DEF.md lacks the tag or uses a different pattern, so 'every acceptance criterion' is confirmed only for these 13. Nothing in the evidence contradicts the premise, and no build failure follows from it. | Read the constraints section of DEF.md. Confirm it defines exactly k1–k4, with no k5 or later, and that their kinds are stakeholder, invariant, contract and invariant in that order. Then list every '**acN:**' line in DEF.md and check that the total is 13, so no untagged or differently tagged criterion exists. If either check fails, correct the count or the kinds in the premise. |
| s6/ac2 | closed-union | MED | assisted | The supported UI types are exactly Web, Mobile-iOS and Mobile-Android (three UI types), consistent with S006 ac2's 'three UI types'. | The gathered evidence neither supports nor contradicts the premise. grep /(?i)mobile-?(ios\|android)/ found 0 matches, so neither 'Mobile-iOS' nor 'Mobile-Android' appears anywhere in the searched tree. grep /(?i)ui ?types?/ also found 0 matches, so no 'UI type(s)' list exists to show the set is closed at three. The only read, docs/plans/design-intelligence-prd.md:1, returned just the heading '# insrc Design Intelligence PRD' and lists no UI types. No evidence names the three members (Web, Mobile-iOS, Mobile-Android), shows a closed list, or ties the claim to S006 ac2's 'three UI types'. The premise is UNVERIFIABLE: nothing contradicts it, so it is not HIGH. | Ground the closed-union claim in a real source. Cite the exact PRD section or line that lists the supported UI types (for example a docs/plans/design-intelligence-prd.md:<line> where Web, Mobile-iOS and Mobile-Android are listed). Alternatively, cite the code type or enum that defines them. If neither exists, restate the premise as a design decision made by this artifact rather than a fact taken from an existing source. Also check S006 ac2's 'three UI types' against that same source so the count and the member names agree. |
| p10 | ordering | MED | assisted | Story dependency order is s1 → s2 → s3 → {s4, s5} → s6 (s6 depends on both s4 and s5), and the graph is acyclic. | The only probe is a repo-wide grep for /Depends on:/. It returned 50 matches and was cut off at the cap. The matches come from many unrelated epics' DEF.md/HLD.md files, and none of them is tied to the artifact that holds this premise. None of the fully visible DEF.md story graphs matches the claimed order s1 → s2 → s3 → {s4, s5} → s6: - add-daemon-driven-code-review-stage DEF.md:79–195: s2–s5 each depend on `s1`, s6 depends on `s2`,`s3`,`s4`,`s5` (fan-out from s1, not a chain), and two later stories depend on `s6`. - add-module-test-health-analyzer DEF.md:59–119: s2←`s1`, s3←`s2`, s4←`s3`, s5←`s2`, s6←`s2`,`s3`,`s5`. Here s6 does not depend on s4. - add-build-workflow DEF.md:71–129: s2←s1, s3←s2, s4←s3, s5←`s3`,`s4` (no s6 shown). - build-deployment-design-framework DEF.md:58,74: s2←`s1`, s3←`s2`. The output is truncated after this, so s4/s5/s6 for this epic (the likely subject) cannot be seen. The evidence does not identify which epic's DEF the premise describes, and it does not show the s4/s5/s6 dependency lines needed to confirm the fork-join at s6 or that the graph has no cycles. | Run the probe again, limited to this artifact's own epic DEF.md, for example `rg -n "Depends on:" docs/epics/<this-epic>/DEF.md`, with no truncation. Then confirm that s2←s1, s3←s2, s4←s3, s5←s3 and s6←{s4, s5}, and that no edge points back. If the real DEF differs, correct the ordering premise and any task sequencing built on it. |
| p11 | ordering | MED | assisted | Dependent workflow implementation is sequenced after the DI1 corpus and DI2 project lifecycle contracts are reviewed and approved. | The only file evidence is `plans/design-intelligence-implementation.md:1`, which shows the header "# Design intelligence implementation plan". That proves the plan document exists, but it does not show the DI1/DI2 contracts or any sequencing between them. The grep for `/(?i)approvedAt/` found 0 matches, so nothing shows that the DI1 corpus or DI2 project-lifecycle contracts have been approved. Nothing shows dependent workflow work being held until they are. The evidence neither confirms nor contradicts the ordering claim (anchors c3, c4, c5, k3), so the premise is unverifiable. | Give the ordering a checkable form. Point the premise at the specific section or line of `plans/design-intelligence-implementation.md` that sequences dependent workflow tasks after the DI1/DI2 contracts. Also state the gate that enforces it, for example the DI1/DI2 contract artifacts carrying `approvedAt`, or a task dependency edge in the plan. Then re-run the probes against those anchors. If no such gate exists, record it as a process precondition that the plan states but the code does not enforce. |
| s6/ac1 | semantic | MED | assisted | Internal consistency: open question a2 (specimens vs. written guidelines only) is listed as still open in §8 and as a 'low' assumption in §4, yet is recorded as resolved (q1d8128b2: include lightweight palette/typography/component-state/layout examples) — the resolved state must be the one reflected, and S006 ac1 matches the resolution. | The only gathered evidence is one grep match for `q1d8128b2`: docs/epics/di3-guideline-creation-revision-agent-reuse-E20261011b452bdbf/DEF.md:167 — "- `q1d8128b2` — Item a2: Confirm whether the first release includes lightweight palette/type/component/layout specimens or written guidelines only before designing story s6." That line shows the question still listed as open. Nothing in the evidence records it as resolved. No match or read shows a resolution record for q1d8128b2, the §4 Assumptions entry for a2 (marked 'low'), or the text of S006 ac1. So the evidence supports half of the premise: a2/q1d8128b2 is still listed as open. It does not support the other half: that a resolution exists ("include lightweight palette/typography/component-state/layout examples") and that S006 ac1 matches it. Since the inconsistency cannot be confirmed from the evidence, the premise is unverifiable. This is MED, not HIGH: the decision only affects whether S006 ac1 includes specimens, and no concrete build failure can be named from this evidence. | Check whether DEF.md actually records a resolution for q1d8128b2. If it does, remove a2/q1d8128b2 from §8 Open questions and from the 'low' entries in §4 Assumptions, record the decision (include lightweight palette/typography/component-state/layout specimens), and confirm S006 ac1 says the same. If no resolution exists, keep q1d8128b2 open and make sure S006 ac1 does not settle the question before the user decides, since DEF.md:167 says to confirm it "before designing story s6". |
| k2 | semantic | MED | assisted | Guideline versions carry an approval state such that approval is explicit and version-specific per UI type, activation is withheld when review is stale/blocking, and current approved sets remain active until a replacement version is approved (k2, S003, S004 ac2). | The gathered evidence does not support the premise. `grep /(?i)guideline.*version/` found 0 matches, so nothing in the source tree models a guideline version or an approval state per version. `grep /(?i)stale/` found 0 matches, so nothing models withholding activation when a review is stale or blocking. The only read was `docs/plans/design-intelligence-prd.md:1`, which returned just the heading "# insrc Design Intelligence PRD". It does not mention approval states, explicit approval per UI type, stale-review gating, or keeping the current approved set active until a replacement is approved. No match or read line confirms any of the three parts of the premise. The PRD exists, so the premise may come from requirements in its later sections, but those sections were not part of the evidence. The premise is therefore unverifiable, not contradicted. | Ground the premise before building on it. Cite the specific PRD sections (for k2, S003 ac1/ac3, S004 ac2) that set out: (a) explicit approval for each version and each UI type, (b) activation withheld when the review is stale or blocking, and (c) the current approved set staying active until a replacement version is approved. Then re-probe for those terms, such as "approv", "activation", "UI type" and "replacement", in docs/plans/design-intelligence-prd.md. If this is greenfield behaviour, state plainly in the artifact that no guideline-version or stale-review model exists in code yet and that the task must create it, rather than implying it is already there. |
| s5 | semantic | MED | assisted | Agent consumption of guidelines (S005) is read-only: requesting design context returns and records the active version without creating drafts, approval requests, or silently generating/substituting a missing set. | The gathered evidence does not cover this premise. `grep /(?i)active guideline/` found 0 matches in the source tree. The only read, `docs/plans/design-intelligence-prd.md:1`, returned just the document title (`# insrc Design Intelligence PRD`). It contains nothing about S005, FR002, s5/ac1 or s5/ac2, and nothing on read-only guideline consumption, recording the active version, or forbidding drafts, approval requests and silent generation or substitution of a missing set. No code path, handler or acceptance-criteria text was found to confirm or contradict the premise. The premise is therefore UNVERIFIABLE. The evidence does not contradict it, so no concrete build failure can be named and it is not HIGH. | Re-ground the premise. Cite the exact PRD section that defines S005, FR002 and s5/ac1–ac2, using a `path:line` beyond the title line. Re-probe with terms that match the PRD's own wording, for example `guideline`, `S005`, `FR002` or `design context`, instead of the literal phrase "active guideline". If the premise names an existing design-context handler or guideline store that must stay read-only, cite its `file:line` so a probe can confirm it has no write, draft or approval side effects. If neither exists yet (greenfield), mark the premise as a forward requirement taken from the PRD, not a claim about current code. |
| k4 | external-contract | MED | assisted | Cloud LLM reasoning for this workflow runs via the claude/codex CLI subprocess provider (CliProvider), with no direct cloud REST, and provider calls are issued serially. | The evidence backs the CliProvider part of the premise. `src/agent/providers/cli-provider.ts:131` declares `export class CliProvider implements LLMProvider`, and `read src/agent/providers/cli-provider.ts:1 → FOUND` shows the anchor file exists. The only other provider class found is `src/agent/providers/ollama.ts:150 export class OllamaProvider implements LLMProvider`, which is local. No cloud REST provider class appears in the matches. Earlier reviewed artifacts (DEF.md:152, HLD.md:462) cite CliProvider at :88, but the current source puts it at :131. The premise names only the file, not a line, so this drift does not affect it. Two parts of the premise are not covered by the evidence: (1) that provider calls are issued serially, and (2) that no direct cloud REST call exists anywhere. The probes only matched class declarations. Nothing was read or searched for `Promise.all` around provider calls, or for `fetch`/`undici` calls to anthropic/openai endpoints. So the serial-call guarantee cannot be verified from this evidence. | Keep the CliProvider part of the premise; the evidence confirms it. Add a probe for the serial-call claim, for example a search for `Promise.all` next to `.complete(`/`.embed(` calls in the workflow's code path. If no probe is added, mark the serial part as a project rule from CLAUDE.md that this evidence does not check. Optionally add a probe for direct cloud REST, such as a search for `api.anthropic.com\|api.openai.com` under src/, to back the "no direct cloud REST" part. Either way, what gets built does not change. |
| s6/ac2 | inventory | MED | assisted | S006 ac2's evaluation uses eight project briefs across three UI types with several representative pages each, reported against the PRD acceptance criteria — the PRD must define those criteria and counts. | Only the file's existence is confirmed: `read docs/plans/design-intelligence-prd.md:1` shows the heading "# insrc Design Intelligence PRD". Nothing confirms the claim about what the PRD contains: - `grep /(?i)eight (project )?briefs/` found 0 matches, so no "eight briefs" count was found. - `grep /(?i)acceptance criteria/` found 0 matches, so no section titled "acceptance criteria" was found. - No match supports "three UI types" or "several representative pages each".  The PRD exists, but none of the counts or the acceptance-criteria section that s6/ac2 relies on could be found. The evidence also doesn't rule out that the PRD covers this under other wording, such as "success criteria" or "evaluation", which was not grepped. Because of that I can't state a definite failure in the build, so this is rated unverifiable (MED), not contradicted (HIGH). Still, if the PRD really has no such criteria, the evaluation in s6/ac2 would have nothing to report against. | Search docs/plans/design-intelligence-prd.md for the evaluation section under other wording (success criteria, evaluation, briefs, UI types, pages). If you find it, change the s6/ac2 premise to name the real section heading or `path:line`, and the actual counts of briefs, UI types and pages. If the PRD has no such section, choose one of two fixes: (a) add the evaluation criteria and counts to the PRD (8 briefs, 3 UI types, N pages each) before S006 runs, or (b) restate s6/ac2 so it defines its own pass and fail criteria instead of pointing to PRD criteria that don't exist. |
| c2 | citation | LOW | manual | AGENTS.md exists at the repo root and states the conventions of k4: daemon owns persistence, clients use IPC, cloud access goes through CLI providers, provider calls are sequential, and critical reasoning obeys the capability (coreFloor) floor. | The file exists: `read AGENTS.md:1` returns FOUND. Its title line is "# CLAUDE.md — insrc backend", so it is a copy of CLAUDE.md, and the grep hits match CLAUDE.md line for line. Each convention in the premise has a match in AGENTS.md: - **Capability floor:** AGENTS.md:11 says per-role model tiering enforces accuracy. The grep for /coreFloor/ matched this line; the match falls in the truncated part, and the line matches CLAUDE.md:11, which states the coreFloor guarantee for critical roles. - **Cloud access through CLI providers:** AGENTS.md:12 says "Cloud LLM access happens through the locally-installed `claude` and `codex` CLI binaries (via `CliProvider`)". AGENTS.md:136 says "Cloud LLM access goes through `CliProvider` ... no direct REST". - **Sequential provider calls:** AGENTS.md:122 says "Never `Promise.all` anything that reaches an LLM provider ... always serial `for...of` with sequential awaits." - **Clients use IPC:** AGENTS.md:130 says "Daemon communicates via JSON-RPC over Unix socket at `~/.insrc/daemon.sock`". - **Daemon owns persistence:** no grep targeted the wording of this rule. It sits in the same "Key architectural rules" block as line 136 (rule 2), and in the mirrored CLAUDE.md that block's rule 1 reads "Daemon owns all DB access". This part is supported, but not quoted directly in the evidence. | none — verified sound |
| p7 | inventory | LOW | manual | The epic has exactly six stories (s1–s6), each with exactly one story-level FR (S001:FR001 … S006:FR001), and two epic-level FRs (FR001, FR002). | grep /E20261011b452bdbf:S00[1-6]:FR001/ returned exactly 6 matches in docs/epics/di3-guideline-creation-revision-agent-reuse-E20261011b452bdbf/DEF.md, one for each story: S001:FR001 at line 33 ("Request project guidelines for selected UI types"), S002:FR001 at :37, S003:FR001 at :41, S004:FR001 at :45, S005:FR001 at :49 and S006:FR001 at :53. That is six stories, each with an FR001. grep /E20261011b452bdbf:FR00[12]/ returned exactly 2 epic-level matches: FR001 at DEF.md:28 ("Users create, resume and revise project guidelines…") and FR002 at DEF.md:29 ("Agents apply approved guidelines repeatedly…"). Two limits on what was checked: the probes did not look for a story-level S00n:FR002 or later, nor for an epic-level FR003 or later. So the word "exactly" is supported by the evidence's pattern but not proven. Nothing in the evidence contradicts the premise. | None needed; the premise checks out. Optionally, to fully confirm "exactly", grep for /E20261011b452bdbf:(S00\\d:)?FR00[2-9]/ to rule out more story or epic FRs. |

#### Proposed fixes

- **c1** (assisted) — The PRD file exists but no 'project guideline workflow' text appears anywhere (0 grep matches), so the #project-guideline-workflow fragment does not resolve. The correct replacement heading cannot be derived from the evidence: only line 1 and the DI1 sourcing heading at :127 are known. A human has to choose the real anchor. No artifact edit is proposed because the anchor string appears in more than one place in the DI3 artifact and the replacement value is unknown.
  - option: Re-anchor c1 to the real PRD heading that states k1/k2. Look up the heading text in docs/plans/design-intelligence-prd.md and use its slug, or a path:line.
  - option: Drop the section fragment, cite docs/plans/design-intelligence-prd.md as a whole, and quote the exact supporting lines for k1 and k2 in the artifact.
  - option: If the PRD has no section that states k1/k2, amend the PRD to add a 'Project guideline workflow' section, or re-classify k1/k2 as unsourced assumptions.

- **c3** (assisted) — The file path is verified, but the DI3 section anchor and the content it supposedly supports (k3, the DI1/DI2 dependency assumption) are not in the gathered evidence. The fix depends on what the plan really contains, so a person has to read the file before choosing an option. No safe automatic edit can be derived.
  - option: Find the real DI3 heading in plans/design-intelligence-implementation.md and update c3's anchor slug and the premise wording to match it exactly
  - option: Cite only the file (plans/design-intelligence-implementation.md) and drop the #di3-guideline-creation-revision-and-agent-reuse anchor
  - option: If the plan has no DI3 section, ground k3 and the DI1/DI2 dependency assumption on another source that is confirmed, or lower the assumption's confidence from high

- **c4** (assisted) — Existence and ownership are verified, but the upstream Define is review-blocked and not approved (plans/design-intelligence-implementation.md:92). The reuse claim should show that dependency instead of treating DI1 as settled.
  - option: Add a dependency note: this epic's ingestion/retrieval reuse depends on DI1 (E202610117e0ae92e) being approved. DI1 is currently review-blocked, so it must be approved before design.epic.
  - option: Pin the reuse boundary to specific DI1 stories (E202610117e0ae92e:S002 ingestion, E202610117e0ae92e:S004 retrieval, E202610117e0ae92e:S005 corpus releases) so changes in DI1's scope can be traced.
  - option: Accept as-is with a note that DI1 approval status will be re-checked when this epic is approved.

- **c5** (manual) — The file path and the ownership claim are confirmed by the evidence. The remaining risk comes from DI2's approval status (review blocked, not approved), not from any wrong text in this premise. Handling it means deciding how this epic should depend on an upstream that is not yet approved.
  - option: Block approval of this epic until DI2 (E202610114abafc9d) has its review findings resolved and is approved.
  - option: Approve this epic with a recorded note that it depends on DI2's pending FR001/FR002 and S001–S005, and must be re-checked if DI2 changes.
  - option: Add a dependency-status note to c5 saying DI2 is 'review blocked; not approved' (per plans/design-intelligence-implementation.md:93).

- **p6** (assisted) — c1 and c3 resolve as relative paths in ~/.insrc/daemon. Nothing in the evidence covers c2, c4 or c5, or shows a split between two repos. Making all citations relative to one confirmed target repo needs a person to confirm that repo; the evidence gives no exact text to replace.
  - option: Treat ~/.insrc/daemon as the target repo and rewrite c4/c5 as paths relative to it (c1/c3 already resolve there).
  - option: Treat /Users/subhagho/work/projects/insors/insrc as the target repo, check that c1/c2/c3 also exist there, and re-run the review against that repo.
  - option: Keep the absolute paths for c4/c5, but state in the artifact that they point to an external repo, and add a note on which repo each citation resolves in.

- **p8** (assisted) — The mapping of criteria to constraints is confirmed for all 13 tagged criteria. The number of constraints, their kinds, and whether these 13 are all the criteria are not in the evidence. Settling that needs a read of the constraints section and a full count of criteria, not an edit made from this evidence.
  - option: Keep the premise as written once a read of DEF.md's constraints section confirms exactly k1–k4 with the stated kinds and a count shows 13 criteria in total.
  - option: Narrow the premise to what the evidence proves: 'All 13 tagged acceptance criteria operationalize k3 and k4 plus either k1 (10 criteria) or k2 (3 criteria, the approval/activation story).'
  - option: If DEF.md defines more than four constraints or different kinds, change the inventory to match what is actually defined.

- **s6/ac2** (assisted) — No evidence locates the three-member UI-type set. Fixing this means either finding the real source anchor or recasting the claim as a decision, and both need a human choice. No safe text edit can be derived from the evidence.
  - option: Add an exact anchor (a PRD path:line, or a code enum/type) that lists Web, Mobile-iOS and Mobile-Android as the closed set of UI types, and cite it in place of k1.
  - option: Restate the premise as a decision this artifact introduces: 'This design defines three UI types: Web, Mobile-iOS, Mobile-Android'. Drop the claim that an existing source confirms it.
  - option: If the PRD lists a different set or count of UI types, update both this premise and S006 ac2 to match the PRD.

- **p10** (assisted) — The repo-wide grep was truncated and does not cover the target epic's s4–s6 dependency lines, so the ordering premise can't be checked. None of the fully visible epics matches it. We need a probe limited to the epic, or a human check against the epic's DEF.md, before the premise can be confirmed or corrected.
  - option: Re-probe with the grep limited to this epic's DEF.md and confirm s1→s2→s3→{s4,s5}→s6 as written
  - option: If the scoped DEF shows a different graph (e.g., s5 depends on s2 rather than s3, or s6 omits s4), reword the premise to match the actual Depends-on lines
  - option: Mark the premise as unverified in the artifact until the epic-scoped evidence is gathered

- **p11** (assisted) — The ordering claim cannot be checked against the evidence. No approval stamps were found, and the only read line is the plan's title. Choosing how to ground the premise needs a human decision. Nothing in the evidence supports an automatic text edit.
  - option: Cite the exact `plans/design-intelligence-implementation.md:<line>` where dependent workflow tasks are listed after the DI1/DI2 contracts, and re-probe it.
  - option: Name the approval artifacts for the DI1 corpus and DI2 lifecycle contracts (paths of the DEF/HLD/LLD files), and make `approvedAt` on those artifacts the gate.
  - option: Reword the premise as a stated process precondition that the code does not enforce, which lowers its weight in the review.

- **s6/ac1** (assisted) — The evidence only shows q1d8128b2 still listed as open at DEF.md:167. The resolution text, the §4 entry and S006 ac1 were not in the evidence, so no find/replace can be built from it safely. A person needs to confirm which state is correct.
  - option: The question is resolved (specimens included): move q1d8128b2/a2 out of §8 Open questions and §4 Assumptions into a recorded decision, and keep S006 ac1 as it is.
  - option: The question is still open: keep q1d8128b2 in §8, and change S006 ac1 so it does not assume specimens until the question is answered.
  - option: The question is resolved as written guidelines only: record that decision and remove the specimen requirement from S006 ac1.

- **k2** (assisted) — The evidence has no matches for guideline versioning or stale-review gating, and only the PRD heading was read, so none of the premise's parts can be checked. The fix is to anchor the premise in the PRD text that supports it, or to mark it as new behaviour. Which applies needs a person to read the PRD sections, so no automatic edit is safe.
  - option: Add explicit PRD section and line citations for each part of k2 (version-specific approval per UI type, activation withheld on a stale or blocking review, current set kept until a replacement is approved), then re-run the review probes against those lines.
  - option: Rewrite the premise as a greenfield requirement, e.g. 'No guideline-version approval model exists today; S003/S004 introduce version-specific approval state per UI type, stale/blocking-review activation gating, and retain-until-replaced semantics', so the build task creates the model rather than extending one.
  - option: Split k2 into three separate premises (explicit approval per version and UI type, the stale/blocking activation gate, retain-until-replaced) so each can be grounded and checked on its own.

- **s5** (assisted) — The evidence neither confirms nor refutes the premise, so no edit can be derived from it. A human needs to supply or confirm the anchor that grounds S005/FR002.
  - option: Add a precise anchor: cite the `docs/plans/design-intelligence-prd.md` line range that defines S005 / FR002 / s5/ac1–ac2, and re-run the review with probes such as `S005|FR002|guideline`.
  - option: Re-label the premise as a forward PRD requirement (greenfield, with no existing code to verify against) so reviewers do not expect it to be grounded in source code.
  - option: If an existing design-context or guideline-read path is involved, add its `file:line` and a probe asserting it makes no draft or approval writes and does no fallback generation.

- **k4** (assisted) — The CliProvider routing is verified at cli-provider.ts:131. The serial-call and no-REST parts are not covered by the gathered evidence. They need either an added probe or a rewording that marks them as a project rule, not a verified fact. This is not a design gap: the build is the same either way.
  - option: Keep the premise text and add probes: rg `Promise\.all` near provider `.complete(`/`.embed(` calls, and rg `api\.anthropic\.com|api\.openai\.com` under src/
  - option: Reword so it marks which parts are verified: 'Cloud LLM reasoning runs via CliProvider (src/agent/providers/cli-provider.ts:131); serial provider calls and no direct cloud REST are project rules (CLAUDE.md) that the build must follow.'
  - option: Split into two premises: k4a (CliProvider routing, verified) and k4b (serial calls + no REST, project rule, needs its own probe)

- **s6/ac2** (assisted) — The evidence confirms the PRD exists but none of the cited content, so there is no evidence-backed value to put in an automatic edit. Someone needs to either find the PRD section under other wording or decide where the criteria should be defined.
  - option: Find the PRD's evaluation or success-criteria section under other wording, then rewrite the premise to cite its exact heading or path:line and the real counts.
  - option: Add an 'Evaluation acceptance criteria' section to docs/plans/design-intelligence-prd.md that sets 8 briefs, 3 UI types and N representative pages each, plus pass thresholds. Make that a prerequisite of S006.
  - option: Rewrite s6/ac2 to state its own measurable criteria (brief count, UI types, pages per type, thresholds) instead of deferring to the PRD.
