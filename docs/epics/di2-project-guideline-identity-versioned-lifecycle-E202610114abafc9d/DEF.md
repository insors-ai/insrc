<!-- insrc:artifact DEF-4abafc9dec4c3a5c -->

# Epic: di2-project-guideline-identity-versioned-lifecycle

## Summary

**Flavor:** new-capability

Give each project separate, durable web, iOS and Android guideline sets. Users can inspect history and activate reviewed revisions explicitly while agents retrieve the correct approved version.

## Contents

1. [Problem](#1-problem)
2. [Functional requirements](#2-functional-requirements)
3. [Non-goals](#3-non-goals)
4. [Assumptions](#4-assumptions)
5. [Constraints](#5-constraints)
6. [Stories](#6-stories)
7. [References](#7-references)

## 1. Problem

A project's approved design choices have no dependable identity and lifecycle across web, iOS and Android. Agents cannot reliably tell which version is active, distinguish a draft from an approved guideline, or retain prior choices while a revision is reviewed. Projects that begin before code exists also lack a clear design identity, and ambiguous platform selection or concurrent changes can cause inconsistent guidance across pages.

## 2. Functional requirements

- **E202610114abafc9d:FR001** — Users manage independent guideline history and approval for each project and UI type.
- **E202610114abafc9d:FR002** — Agents receive the exact requested guideline version and status without triggering authoring.

**s1:**

- **E202610114abafc9d:S001:FR001** — Identify projects and their supported guideline sets

**s2:**

- **E202610114abafc9d:S002:FR001** — Save complete guideline drafts and retain history

**s3:**

- **E202610114abafc9d:S003:FR001** — Activate only the exact reviewed and approved revision

**s4:**

- **E202610114abafc9d:S004:FR001** — Resolve active and historical guidelines without changing them

**s5:**

- **E202610114abafc9d:S005:FR001** — Export traceable guidelines while keeping projects and platforms isolated

## 3. Non-goals

- **Corpus ingestion or guideline generation** — DI1 supplies evidence and DI3 owns authoring.
- **Per-page guideline identities or implicit platform fallback** — Guidelines apply across pages for a project/UI-type pair.

## 4. Assumptions

- `high` Projects need guideline identity before a repository is available; the binding mechanism is a downstream design decision. [[c1]]

## 5. Constraints

| ID | Type | Text | Source |
| :--- | :--- | :--- | :--- |
| `k1` | invariant | One active reviewed and explicitly approved version per project/UI-type pair; drafts, prior versions and other UI types remain isolated. | [[c1]] |
| `k2` | contract | Retrieval is read-only and returns explicit missing guidance rather than a draft or wrong-platform substitute; exports preserve evidence and notices. | [[c1]] |
| `k3` | invariant | Daemon owns DB access through IPC; preserve repo.add registry contract and do not equate design-project creation with repository registration. | [[c2]] |

## 6. Stories

### 6.1 E202610114abafc9d:S001 — Identify projects and their supported guideline sets

**User value:** `size: M`

Users can organize design decisions before or after code exists.

**Acceptance criteria:**

- **ac1:** Given a project without a repository, when its guideline identity is established, then it can hold Web, Mobile-iOS and Mobile-Android sets without registering a fictional repository. _(operationalizes `k1`, `k3`)_
- **ac2:** Given two projects with similar names, when guidelines are resolved, then their records remain distinct. _(operationalizes `k1`, `k3`)_

### 6.2 E202610114abafc9d:S002 — Save complete guideline drafts and retain history

**User value:** `size: M`

Users can inspect reusable rules and the evidence behind every revision.

**Depends on:** `s1`

**Acceptance criteria:**

- **ac1:** Given a guideline draft, when it is saved, then foundations, reusable rules, states, exceptions, rationale and pinned evidence remain available with identity, version and draft status. _(operationalizes `k1`, `k2`, `k3`)_
- **ac2:** Given a revision is saved or the daemon restarts, when history is read, then prior versions remain intact and the draft has not become active. _(operationalizes `k1`, `k2`, `k3`)_

### 6.3 E202610114abafc9d:S003 — Activate only the exact reviewed and approved revision

**User value:** `size: M`

Users can trust the active rules even when revisions overlap.

**Depends on:** `s2`

**Acceptance criteria:**

- **ac1:** Given a reviewed unchanged revision and explicit approval, when activation completes, then exactly that version becomes active for its project and UI type while prior versions remain in history. _(operationalizes `k1`, `k3`)_
- **ac2:** Given stale review, absent approval or competing revision, when activation is attempted, then no unapproved or stale version activates and a conflict is reported without two active versions. _(operationalizes `k1`, `k3`)_
- **ac3:** Given an already completed approval request, when it is repeated, then the active version and history do not duplicate. _(operationalizes `k1`, `k3`)_

### 6.4 E202610114abafc9d:S004 — Resolve active and historical guidelines without changing them

**User value:** `size: M`

Agents reuse one dependable set across page tasks.

**Depends on:** `s3`

**Acceptance criteria:**

- **ac1:** Given three pages in one project and UI type, when each requests active guidelines, then all receive the same active version without new drafts or approval requests. _(operationalizes `k1`, `k2`, `k3`)_
- **ac2:** Given no approved Android set but Web and iOS exist, when Android is requested, then missing-guidelines is returned without substitution. _(operationalizes `k1`, `k2`, `k3`)_
- **ac3:** Given a historical version is requested, when it is read, then its exact contents and superseded status are returned. _(operationalizes `k1`, `k2`, `k3`)_

### 6.5 E202610114abafc9d:S005 — Export traceable guidelines while keeping projects and platforms isolated

**User value:** `size: M`

Users can share accurate guidelines and audit their lineage.

**Depends on:** `s4`

**Acceptance criteria:**

- **ac1:** Given a guideline containing third-party evidence, when it is exported, then human-readable and structured outputs retain identity, version, status, provenance and required notices. _(operationalizes `k1`, `k2`, `k3`)_
- **ac2:** Given Web v2 is approved, when mobile sets and another project are retrieved, then their active versions are unchanged. _(operationalizes `k1`, `k2`, `k3`)_

## 7. References

- **[[c1]]** `doc` `docs/plans/design-intelligence-prd.md#project-guideline-workflow`
- **[[c2]]** `convention` `AGENTS.md`
- **[[c3]]** `doc` `plans/design-intelligence-implementation.md#di2-project-guideline-identity-and-versioned-lifecycle`
- **[[c4]]** `code` `src/workflow/types.ts`

<!-- insrc:review -->

## Review

### ⛔ Review `BLOCK` — define (define)

**0 HIGH · 11 MED · 2 LOW** · model `cli-claude:opus` · reviewed 2026-10-11T14:54:54.682Z

| Ref | Kind | Severity | Fixability | Premise | Evidence | Action |
| --- | --- | --- | --- | --- | --- | --- |
| c1 | citation | MED | assisted | Reference c1 resolves: docs/plans/design-intelligence-prd.md exists and has a 'project-guideline-workflow' section that sources the assumption and constraints k1 and k2. | The file exists: `read docs/plans/design-intelligence-prd.md:1 → FOUND: # insrc Design Intelligence PRD`. The section the anchor names was not found: `grep /(?i)project guideline workflow/ → 0 match(es)`. A heading such as "Project Guideline Workflow", which would produce the slug `#project-guideline-workflow`, does not appear anywhere in the searched tree. `grep /(?i)design-intelligence-prd/ → 0 match(es)` only shows that nothing else in the tree cites the file; it says nothing about whether the file exists. The evidence therefore confirms the file half of the premise and does not support the section half. No line shown in the evidence sources k1 or k2. A citation that may not resolve is a provenance gap, not a build-breaking defect. Nothing in the evidence shows that the content of k1 or k2 is wrong, so building against them would not demonstrably produce wrong code. | Find the heading in docs/plans/design-intelligence-prd.md that actually states the assumption and constraints k1 and k2, and re-anchor c1 to that heading's slug. If no section in the PRD sources k1 or k2, change them to unsourced assumptions, or cite a document that does contain them. |
| c3 | citation | MED | assisted | Reference c3 resolves: plans/design-intelligence-implementation.md exists and has a section 'DI2 project guideline identity and versioned lifecycle'. | The file exists: the read of `plans/design-intelligence-implementation.md:1` found `# Design intelligence implementation plan`. The section does not show up, though. The grep `/(?i)DI2.*guideline identity/` returned 0 matches, so no heading or line matches "DI2 … guideline identity" in a form a case-insensitive grep would catch. The grep `/(?i)design-intelligence-implementation/` also returned 0 matches, so nothing in the searched tree links to this plan by name. Only line 1 was read, and none of the evidence shows a section called 'DI2 project guideline identity and versioned lifecycle'. The file half of the citation is confirmed. The section anchor `#di2-project-guideline-identity-and-versioned-lifecycle` cannot be verified and probably points at a heading that doesn't exist. The evidence gives no sign that a task builds on this section's content as a code target, so a broken anchor doesn't produce a build failure I can name. That makes it a stale or unresolved citation (MED), not a HIGH contradiction. | Open plans/design-intelligence-implementation.md and find the actual heading that covers DI2 (project guideline identity / versioned lifecycle). Then either correct citation c3's anchor to that heading's real slug, or, if the plan has no DI2 section, re-point c3 to the document that does define it, or drop the section anchor and cite the file only. |
| k3 | semantic | MED | manual | The repo.add registry contract holds in code: upserting an Entity whose repo is not registered fails with UnregisteredRepoError, so creating a design project must not register a fictional repository. | Confirmed in code: `src/db/repos.ts:329: export class UnregisteredRepoError extends Error {` (the class exists), and the `repo.add` IPC handler exists at `src/daemon/index.ts:483: 'repo.add': async (params) => {`. The CLI consumer at `src/cli/services/repo.ts:55` and the VS Code plugin at `vscode-plugin/src/workspace/registrar.ts:56` both call it. The rule itself ("an Entity whose repo path isn't registered fails the upsert with UnregisteredRepoError") appears verbatim in CLAUDE.md:140, AGENTS.md:140 and docs/daemon.md:259.  What the evidence does not show: no source line where an entity upsert actually throws UnregisteredRepoError. The 50-match grep was cut off at its cap, and every match it returned outside `src/db/repos.ts` is a doc or artifact. The only mention of throw sites is second-hand, in docs/epics/.../S001/PLAN.md:141 ("raised … at src/db/entities.ts:228/240/396 and src/indexer/index.ts:703/743"). That line also cites the class at `src/db/repos.ts:310`, but it is now at :329, so those line numbers are out of date and cannot be relied on.  Conclusion: the class and the registration route are confirmed. The claim that an upsert fails for an unregistered repo is documented but not shown in code here. Either way, the prescribed behaviour stays correct: creating a design project must not register a fictional repository through `repo.add`. So this is imprecise grounding, not a defect that would break the build. | Confirm the claim against code by reading the upsert path in src/db/entities.ts (and the indexer's repo resolution in src/indexer/index.ts) for the `throw new UnregisteredRepoError` sites, then cite those exact path:line anchors in the premise. Cite the class at src/db/repos.ts:329, not the out-of-date :310. Keep the design constraint unchanged: the design-project flow must not call `repo.add` or upsert entities for a repository path that doesn't exist. |
| s1/ac1 | inventory | MED | assisted | There are exactly three UI types for guideline sets per project: Web, Mobile-iOS and Mobile-Android. | Neither probe found anything in the source tree. grep /(?i)mobile-ios\|mobile-android/ returned 0 matches, and grep /(?i)uiType/ returned 0 matches. The code has no existing list of UI types and no uiType field or type, so nothing confirms or contradicts the claim that there are "exactly three" (Web, Mobile-iOS, Mobile-Android). The evidence does not cover this premise, so it is UNVERIFIABLE. The likely reason is that this is a new requirement the artifact defines, not an inventory of existing code. In that case the "exactly three" count comes from the requirements and should be marked as a decision, not presented as a fact about the code. | Reword s1/ac1 so the three UI types are clearly a requirement the story introduces, not a claim about existing code. Name the closed set explicitly (for example, a new `UiType` union or enum 'web' \| 'mobile-ios' \| 'mobile-android'), say where it will be defined, and state whether the set is closed (exhaustive) or may grow. If these UI types are meant to exist already, give the real file:line anchor; the probes found none. |
| k1 | closed-union | MED | assisted | Guideline revision statuses cover at least draft, active (approved) and superseded, and only one version per project/UI-type pair can be active. | Both probes came back empty: grep /(?i)superseded/ → 0 matches and grep /(?i)guideline.*status/ → 0 matches. Nothing in the source tree defines a guideline revision status type. No union, enum or literal set names draft, active/approved or superseded, and nothing enforces 'one active version per project/UI-type pair'. The premise is therefore UNVERIFIABLE from the evidence. It is not contradicted, because no conflicting definition exists either. The likeliest explanation is that this status model is new, introduced by the artifact rather than already in the code. Even so, the premise is worded as a 'closed-union' fact about existing code, and the evidence cannot support that. Its wording 'at least draft, active (approved) and superseded' is also open-ended ('at least'), so it is not actually a closed union. 'active (approved)' leaves it unclear whether these are one state or two. | Reword k1 to say the status set is new, and pin it down as an exact closed set rather than 'at least'. Name the canonical literals, for example 'draft' \| 'active' \| 'superseded', and decide whether 'approved' is the same as 'active' or a separate state. Also state where the one-active-per-(project, UI-type) rule is enforced: a store-level uniqueness check on activate, with the prior active version moved to superseded. s2/ac1, s3/ac1 and s4/ac3 need concrete literals and a defined enforcement point to test against. |
| p8 | ordering | MED | assisted | The stories form a linear dependency chain: s2 depends on s1, s3 on s2, s4 on s3 and s5 on s4. | The premise does not say which epic it comes from. The grep is truncated at 50 matches. Only three epics appear in the results, and none of them has exactly the stated chain: - add-build-workflow-insrc-5th-stage-E20260717185807ba/DEF.md is the closest. It has :71 `s1`, :92 `s2`, :115 `s3`, :129 `s3`, `s4`. This is linear for s2→s1, s3→s2 and s4→s3. But s5 depends on both s3 and s4, not only s4. The s3 edge is implied through s4, so the order is still a chain. - add-bugfix-triage-category-insrc-framework-E202609181703991c/DEF.md is not linear. It has :57 `s1`, :70 `s1`, :90 `s2`, `s3`, :104 `s2`, `s3`. Both s2 and s3 depend on s1, and both s4 and s5 depend on s2 and s3. - add-daemon-driven-code-review-stage-E20260803761a43a6/DEF.md has 7 stories and fans out from s1 (:79–:143 all `s1`; :158 `s2`, `s3`, `s4`, `s5`), so it is not linear. The artifact this premise belongs to may be past the truncation cap, so the evidence can neither confirm nor refute it. | Check the premise against the story dependency lines in the artifact's own DEF.md. Grep `**Depends on:**` only in that epic's DEF.md, so the results are not truncated across epics. If the artifact is the build-workflow epic, change the premise so s5 depends on s3 and s4. If it is the bugfix-triage epic, the premise is wrong: s2 and s3 run in parallel after s1, and s4 and s5 each depend on both s2 and s3. Any task that orders work as a strict chain would then serialize work that can run in parallel, or miss the s3 prerequisite for s4. |
| p9 | cross-artifact | MED | manual | Each story FR (S001–S005:FR001) maps one-to-one to stories s1–s5, and every acceptance criterion operationalizes only constraints that exist (k1, k2, k3). | The evidence backs only the first half of the premise. A grep for /E202610114abafc9d:S00[1-5]:FR001/ finds exactly 5 matches in docs/epics/di2-project-guideline-identity-versioned-lifecycle-E202610114abafc9d/DEF.md: S001:FR001 at line 32 ("Identify projects and their supported guideline sets"), S002:FR001 at line 36 ("Save complete guideline drafts and retain history"), S003:FR001 at line 40 ("Activate only the exact reviewed and approved revision"), S004:FR001 at line 44 ("Resolve active and historical guidelines without changing them") and S005:FR001 at line 48 ("Export traceable guidelines while keeping projects and platforms isolated"). There is exactly one FR per story ID S001–S005 and no duplicates, which is consistent with a one-to-one mapping to s1–s5. However, no evidence shows the s1–s5 story entries themselves, so the FR-to-story mapping is inferred only from the ID numbers. Nothing was gathered for the second half of the premise. No matches cover the acceptance criteria or the constraints k1, k2 and k3, and there is no evidence that k1–k3 exist, that no other constraint is defined, or that each acceptance criterion cites only those constraints. That part of the premise cannot be checked from the evidence. | Re-run probes for the half that has no evidence: (1) grep DEF.md for the definitions of k1/k2/k3 and for any other constraint IDs (for example /\\bk[0-9]+\\b/); (2) grep the acceptance-criterion lines under each S00x:FR001 block for constraint references, and confirm none cites a constraint that is not defined; (3) read the s1–s5 story entries to confirm each story's FR001 belongs to the matching story. If any acceptance criterion cites an undefined constraint, fix it by adding the constraint or removing the reference. |
| p10 | inventory | MED | manual | The epic has exactly five stories (s1–s5), two epic-level FRs (FR001, FR002) and three constraints (k1–k3). | The story count and FR count are confirmed. grep /### 6\\.[0-9] E202610114abafc9d:S00[0-9]/ returns exactly 5 matches in docs/epics/di2-project-guideline-identity-versioned-lifecycle-E202610114abafc9d/DEF.md: S001 at :69, S002 at :80, S003 at :93, S004 at :107 and S005 at :121. grep /E202610114abafc9d:FR00[0-9]/ returns exactly 2 matches: FR001 at DEF.md:27 ("Users manage independent guideline history and approval for each project and UI type") and FR002 at DEF.md:28 ("Agents receive the exact requested guideline version and status without triggering authoring"). No probe searched for the constraints k1–k3, so the evidence cannot confirm whether the epic has exactly three constraints. That part of the inventory claim is unverifiable. | Re-run the check with a probe for the constraint IDs, for example a grep for /E202610114abafc9d:k[0-9]/ or for the constraints section heading in DEF.md, to confirm there are exactly three (k1–k3). If the count differs, correct the premise. The story and FR parts (5 and 2) need no change. |
| p11 | cross-artifact | MED | manual | Non-goals hold: DI1 supplies corpus evidence and DI3 owns guideline authoring, so DI2 includes neither ingestion nor generation. | I couldn't check this premise from the evidence I was given. Both probes found nothing in the source tree: grep /(?i)\\bDI1\\b/ → 0 matches and grep /(?i)\\bDI3\\b/ → 0 matches. DI1, DI3 and c3 look like story or decision IDs from other workflow artifacts, not code symbols, so a search of the source could never find them. No reads (`path:line`) were returned either. Nothing in the evidence shows that DI1 provides corpus evidence, that DI3 owns guideline authoring, or that DI2 leaves out ingestion and generation. The premise is neither confirmed nor contradicted, and no concrete build failure can be named, so this is MED rather than HIGH. | Check the premise against the artifacts that define DI1 and DI3 (the parent Epic's Define or HLD story list), not against the source tree. Confirm that DI1's scope includes corpus ingestion and evidence, and that DI3's scope includes guideline generation. Then add those artifact paths and section anchors to the premise so later reviews can check it. If either sibling story doesn't own that work, DI2's non-goals leave ingestion or generation with no owner, and the scope needs to be decided again. |
| k2 | semantic | MED | assisted | Guideline retrieval is read-only. When there is no approved set for the requested project/UI type, it returns an explicit missing-guidelines result and never a draft or another platform's set. | The only probe was grep /(?i)missing-guidelines\|missingGuidelines/, and it returned 0 matches. No file:line reads were provided. Nothing in the evidence shows a guideline-retrieval function, a read-only contract, a check for an approved versus a draft set, or a rule against falling back to another platform's set. Zero matches neither confirms nor contradicts the premise: it may describe behaviour the task still has to build (a new result variant), or the existing code may use a different name. The evidence does not address the premise, so it is UNVERIFIABLE. No concrete build failure can be stated, so this is not HIGH. | Ground the premise. Either (a) state that the missing-guidelines result is new and will be introduced by this task (s4/ac2), and name the module or type where it will be added, or (b) if guideline retrieval already exists, cite its real file:line and the actual name of its missing or empty result. Also add probes for 'approved', 'draft' and the platform / UI-type filter, so the 'never a draft or another platform's set' guarantee can be checked against source. |
| s3 | semantic | MED | assisted | Activation is idempotent and only activates an unchanged reviewed revision with explicit approval. A stale review, missing approval or competing revision is reported as a conflict. | The only probe was grep /(?i)guideline.*(activate\|approve)/, and it returned 0 matches. Nothing in the gathered evidence covers the premise's claims about idempotent activation, the unchanged-reviewed-revision check, the explicit-approval requirement, or conflict reporting for a stale review, missing approval or competing revision (s3/ac1–ac3). Zero matches cannot confirm the premise and cannot contradict it either. The matching code may simply not exist yet if this story is still to be built, or the regex may have missed differently named symbols. Because nothing grounds the premise, it is UNVERIFIABLE. | Ground the premise in real anchors. If the activation path already exists, cite the files and lines of the activation handler, the revision and review freshness check, the approval gate and the conflict-reporting branch. Then re-probe with patterns that match the names actually used (e.g. activate, approvedAt, revision, stale, conflict) instead of a single 'guideline' regex. If this is new behavior, mark s3 as net-new. Also name the existing approval or revision code that it extends, so the premise has something to check against. |
| k3 | citation | LOW | manual | Reference c2 resolves: AGENTS.md states the daemon owns all DB access through IPC and that registry membership is set only through the repo.add IPC (the source of constraint k3). | Both cited anchors resolve to exactly the claimed rules. read AGENTS.md:135 → "1. **Daemon owns all DB access** — CLI, MCP, and the IDE workbench communicate via IPC only." read AGENTS.md:140 → "6. **Repo registry is the contract** — workspace registry membership is established exclusively via the `repo.add` IPC. The storage layer never auto-allocates registry rows; ..." The two greps agree: /Daemon owns all DB access/ matched AGENTS.md:135 (and the mirrored CLAUDE.md:135), and /repo\\.add/ matched AGENTS.md:140 (and CLAUDE.md:140). Reference c2 therefore resolves, and both parts of constraint k3 (the daemon owns all DB access through IPC, and registry membership is set only through repo.add) appear word for word at the cited lines. | none — verified sound |
| c4 | citation | LOW | manual | Reference c4 resolves: src/workflow/types.ts exists and is the code anchor for the workflow and artifact types this epic builds on. | The read of `src/workflow/types.ts:1` came back FOUND with a license-header line, so the cited file exists and the reference c4 resolves. The `/export (type\|interface) /` grep stopped at 50 matches, all in `design/` and `docs/epics/` markdown, so it shows none of the file's own exports. Indirect support comes from sibling artifacts that cite this file for artifact types. `docs/epics/add-bugfix-triage-category-insrc-framework-E202609181703991c/S002/LLD.md:126` names the shared generic base `WorkflowArtifact` = { meta, body, citations } at `types.ts:429`. `S002/LLD.md:154-155` shows the `ArtifactKind` union ('SPEC' \| 'DEF' \| 'HLD' \| 'LLD' \| 'PLAN' \| 'BUILD' \| 'CR' \| 'EXT') being extended. That fits the file being the anchor for workflow and artifact types. Nothing in the evidence contradicts the premise. | None needed: the citation is sound. If a direct confirmation is wanted, run the grep scoped to `src/workflow/types.ts` to list its exports (`WorkflowArtifact`, `ArtifactKind`), because the repo-wide grep hit its match limit before reaching that file. |

#### Proposed fixes

- **c1** (assisted) — The file exists, but no heading matching 'project guideline workflow' was found, so the anchor probably points to a section that isn't there. The right replacement heading can't be taken from the evidence, so a person has to choose it.
  - option: Re-anchor c1 to the real PRD heading that states k1/k2 (look up the heading text in docs/plans/design-intelligence-prd.md and use its slug).
  - option: Drop the section fragment and cite the file only: docs/plans/design-intelligence-prd.md, and quote the supporting lines for k1/k2 in the artifact.
  - option: If the PRD does not support k1/k2, change them to stated assumptions with no citation, or cite the document that actually defines the project-guideline workflow.

- **c3** (assisted) — The file exists, but the gathered evidence shows no line matching the cited DI2 section, so the anchor is unverified and probably stale. The right replacement slug can't be worked out from the evidence, so a person needs to pick the correct target before the artifact is edited.
  - option: Update c3's anchor to the real heading slug for the DI2 section in plans/design-intelligence-implementation.md, after checking that heading exists
  - option: Drop the section anchor and cite plans/design-intelligence-implementation.md as a whole file
  - option: Re-point c3 to the document that actually defines 'DI2 project guideline identity and versioned lifecycle', if it lives somewhere else
  - option: Remove c3 if no source defines the DI2 section, and reword any premise that depends on it

- **k3** (manual) — The constraint is correct and should stay. The only gap is that the throw-on-upsert half rests on documentation, not on a code line in the gathered evidence. The evidence has no verified throw-site path:line, so a safe find/replace edit can't be derived; a person needs to read src/db/entities.ts to pin the anchor.
  - option: Re-anchor the premise to code: cite src/db/repos.ts:329 (the class) and src/daemon/index.ts:483 (the repo.add handler), plus the confirmed throw site(s) in src/db/entities.ts once they have been read.
  - option: Reword the premise as a documented contract (CLAUDE.md:140 rule 6) and keep the code claim only for the class's existence at src/db/repos.ts:329.
  - option: Keep the premise as written and add a test in the design-project task that registering a fictional repo path is never attempted (no repo.add call), so the constraint is enforced whatever the storage layer does.

- **s1/ac1** (assisted) — Zero matches for both the type names and a uiType identifier means the inventory cannot be grounded in existing source. The premise is most likely a new requirement, not an existing inventory, but whether the set is closed and where it lives is a design choice for a person to confirm.
  - option: Mark it as a new requirement: s1 introduces a closed `UiType` union ('web' | 'mobile-ios' | 'mobile-android'), defined in a named new module, with exhaustive switch handling.
  - option: Mark it as a new requirement with an open set: start with the three types and allow more types to be added later without breaking changes.
  - option: If the types are supposed to exist already, add the real source anchor (file:line) for the existing definition and run the probe again with the actual identifier names.

- **k1** (assisted) — No existing code defines this status model, so the premise can't be checked against source; it should be restated as a new, exact definition. Choosing the literal set and where enforcement lives is a design decision that needs a human OK, so there are no automatic artifact edits.
  - option: Declare a NEW closed union GuidelineRevisionStatus = 'draft' | 'active' | 'superseded' ('approved' is the same as 'active'); activating a revision atomically moves the prior active revision for the same (project, uiType) to 'superseded'.
  - option: Declare a NEW closed union with four states, 'draft' | 'approved' | 'active' | 'superseded' (approval and activation are separate steps); the single-active rule applies only to 'active'.
  - option: Keep the set open ('at least …') but change the premise kind from closed-union to an invariant premise, and state the single-active-per-(project, uiType) invariant with its enforcement point.

- **p8** (assisted) — The evidence is truncated and does not show which epic the premise belongs to. The two 5-story candidates support different corrections, so a person has to pick the right one.
  - option: If the artifact is the build-workflow epic (E20260717185807ba): change the premise to 's2 depends on s1, s3 on s2, s4 on s3, and s5 on s3 and s4 (still a linear order)'.
  - option: If the artifact is the bugfix-triage epic (E202609181703991c): change the premise to 's2 and s3 both depend on s1; s4 and s5 each depend on s2 and s3 (a diamond, not a chain)'.
  - option: If the artifact is another epic past the grep cap: grep that epic's DEF.md alone and re-check the premise.

- **p9** (manual) — The FR inventory half is confirmed by evidence. The constraint half has no evidence, so only a re-probe or a person reading the file can settle it. There is no factual error to correct mechanically.
  - option: Re-run the review with probes that target the k1–k3 definitions and the acceptance-criterion lines in DEF.md, then judge again
  - option: Have a person check by reading DEF.md that every acceptance criterion cites only k1, k2 and k3, then mark the premise verified
  - option: Narrow the premise to the part the evidence verifies (S001–S005:FR001 are one FR per story) and treat constraint coverage as a separate premise

- **p10** (manual) — 5 stories and 2 FRs are verified. The constraint count (k1–k3) had no probe, so the evidence gives no basis for an automatic edit. If the count turns out wrong it changes only the inventory statement, not what gets built, so this is MED, not HIGH.
  - option: Add a probe for constraint IDs (e.g. /E202610114abafc9d:k[0-9]/) and re-judge the constraint count
  - option: Accept the premise with a note that k1–k3 was not checked by evidence
  - option: Narrow the premise to the verified parts: five stories (s1–s5) and two epic-level FRs (FR001, FR002)

- **p11** (manual) — The anchors are IDs from other artifacts that a source search can't reach. Fixing this means reading the sibling DI1 and DI3 artifacts and deciding whether the ownership boundaries hold. Nothing in the evidence supports an automatic text edit.
  - option: Check the scopes of DI1 and DI3 in the Epic's Define or HLD, then reword the premise to cite those artifacts (e.g. 'per DEF-… §DI1 / §DI3') so it can be checked
  - option: If DI1 doesn't cover corpus ingestion, or DI3 doesn't cover guideline generation, file an HLD amendment that assigns the missing work, or bring it into DI2's scope
  - option: Change the premise's kind or probes so the review checks it against artifacts instead of grepping the source code

- **k2** (assisted) — The probe found nothing, so no evidence-derived text edit is possible. A human has to say whether the missing-guidelines result is new work or an existing construct under another name.
  - option: Mark k2 as new behaviour introduced by s4: name the retrieval function and the new missing-guidelines result variant to be added, with no existing-code anchor claimed.
  - option: Re-anchor k2 to the existing guideline-retrieval code (real file:line) and use the actual name of its no-approved-set result instead of 'missing-guidelines'.
  - option: Split k2 into two checkable premises: (1) retrieval is read-only, and (2) it filters to status=approved and to the exact project/UI type, with an explicit empty result. Add a probe for each.

- **s3** (assisted) — The probe returned no matches, so there is nothing in the evidence to base an automatic edit on. A person needs to say whether s3 describes existing code, which then needs file:line anchors, or new behavior, which then needs to be marked as net-new.
  - option: Add file:line anchors for the current activation, approval-check and conflict-report code paths, then re-run the review
  - option: Mark s3 as net-new behavior and name the existing approval or revision code that it extends
  - option: Broaden the probe patterns to match the real symbol names (activate / approvedAt / revision / conflict) and re-verify
