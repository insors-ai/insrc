<!-- insrc:artifact DEF-670419c4ad8bea8e -->

# Epic: understand-changes-before-committing

## Summary

**Flavor:** new-capability

Before a commit, developers receive an understanding check proportionate to its contextual impact. They can learn through guided explanations, demonstrate understanding, and retain a personal record without changing the work item's completion status. High-impact exceptions are explicit and visible in the commit message. This is a proposed new capability: all functional requirements and story acceptance criteria below describe behavior to build, not claims of existing implementation. Story dependencies are the proposed delivery order. The mocks illustrate UX only.

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

Developers need to know whether they understand the behavior, decisions, and failure modes of changes they are about to commit. Work-item approval or completion alone does not demonstrate an individual's understanding. The initial bounded code and document searches did not identify a complete personal pre-commit assessment flow; this is a discovery limit, not proof that no related capability exists. Without a verified connection between a person, their demonstrated understanding or explicit exception, and the exact proposed change, uncertainty and misconceptions can remain invisible.

## 2. Functional requirements

- **E20261017670419c4:FR001** — Commit requirements vary with contextually classified impact and project policy.
- **E20261017670419c4:FR002** — The person receives evidence-backed assessments and guided help when unsure or incorrect.
- **E20261017670419c4:FR003** — Understanding history is attributable to a person and exact work version without altering delivery status.
- **E20261017670419c4:FR004** — Only matching current evidence and explicit user decisions can authorize the intended commit.

**s1:**

- **E20261017670419c4:S001:FR001** — Retain personal understanding history and resumable progress independently of delivery state.

**s2:**

- **E20261017670419c4:S002:FR001** — Classify staged change impact contextually and explain the resulting project requirement.

**s3:**

- **E20261017670419c4:S003:FR001** — Provide evidence-grounded questions and authoritative evaluation for the staged change.

**s4:**

- **E20261017670419c4:S004:FR001** — Provide immediate contextual guidance and fresh reassessment while preserving original and assisted outcomes.

**s5:**

- **E20261017670419c4:S005:FR001** — Expose the full check and recovery experience in a resumable VS Code editor pane.

**s6:**

- **E20261017670419c4:S006:FR001** — Authorize only the intended staged commit according to the current project requirement and valid evidence.

**s7:**

- **E20261017670419c4:S007:FR001** — Require explicit, snapshot-specific exceptions for failed or skipped High checks and preserve the exception in the final commit message.

## 3. Non-goals

- **Changing work-item approvals or completion status** — Individual understanding and delivery status are separate.
- **Standalone Grokcheck runtime, Python service, or external browser product** — The daemon owns the lifecycle; VS Code is the initial surface.
- **New agent adapters, additional IDEs, video courses, or spaced repetition** — Defer expansion until the core pre-commit flow works.

## 4. Assumptions

- `high` The specification supplies the requested behavior; implementation has not started. The mock is a UX prototype rather than a functioning extension or hook. [[c1]]
- `high` Existing CLI provider access is a foundation to integrate, not an existing assessment engine. Its current provider kinds are Claude and Codex; this epic does not promise a new OpenCode model-provider adapter. [[c2]]
- `high` Detailed grading, identity, privacy and commit coordination decisions remain open and must be settled in the design before the affected implementation. [[c3]]

## 5. Constraints

| ID | Type | Text | Source |
| :--- | :--- | :--- | :--- |
| `k1` | invariant | New requirement: the daemon owns canonical assessment state, keys, grading, guidance and commit eligibility; the editor communicates through IPC. | [[c4]] |
| `k2` | stakeholder | New requirement: impact is classified contextually by the daemon, not by line-count or filename rules. | [[c5]] |
| `k3` | contract | New requirement: Trivial skips; Low is optional; strict Medium requires completion regardless of result; enabled High requires a pass or explicit commit-recorded override. | [[c6]] |
| `k4` | invariant | New requirement: assessments and authorization bind to the intended staged snapshot and base; a changed snapshot or base cannot reuse authorization silently. | [[c7]] |
| `k5` | contract | New requirement: Unsure immediately starts guidance; incorrect submitted answers also start guidance; reading guidance alone is not a pass. | [[c8]] |
| `k6` | invariant | New requirement: retain original responses, confidence, guidance and assisted attempts; assessment outcomes must not alter work-item delivery state. | [[c9]] |
| `k7` | convention | Existing repository convention to preserve: LLM access uses the provider abstraction; cloud access uses CLI-backed providers, LLM calls are sequential, and context is structured rather than raw file dumps. | [[c10]] |
| `k8` | stakeholder | New requirement: copy/adapt selected pinned Grokcheck modules into daemon-managed functionality with attribution; no separate Grokcheck process or Python runtime. | [[c11]] |
| `k9` | contract | New requirement: assessments appear in a resumable VS Code editor pane; the daemon remains authoritative for commit eligibility, not UI scores. | [[c12]] |

## 6. Stories

### 6.1 E20261017670419c4:S001 — Keep a personal, resumable understanding record

**User value:** `size: L`

Required new behavior: I can resume my check and distinguish my understanding from delivery progress.

**Acceptance criteria:**

- **ac1:** Given a developer begins a check for a staged change, when the session is saved and later resumed, then the same person's answers, confidence, assisted attempts and progress remain associated with the original change and linked work items Requirement evidence: [[c13]], [[c14]], [[c15]], [[c16]].. _(operationalizes `k1`, `k4`, `k6`)_
- **ac2:** Given a linked epic, story, task or issue is completed, when a check is failed, skipped or resumed, then its delivery status and approvals remain unchanged Requirement evidence: [[c17]].. _(operationalizes `k6`)_
- **ac3:** Given the editor closes or the daemon restarts during a check, when the developer returns, then persisted progress is recoverable and missing or uncertain state cannot masquerade as a pass Requirement evidence: [[c12]], [[c18]].. _(operationalizes `k1`, `k9`)_

### 6.2 E20261017670419c4:S002 — Explain change impact and the applicable project requirement

**User value:** `size: L`

Required new behavior: I understand why this commit needs a check and what the project requires.

**Depends on:** `s1`

**Acceptance criteria:**

- **ac1:** Given an exact staged change and its base are available, when impact is assessed, then the daemon provides High, Medium, Low or Trivial with contextual reasons and relevant evidence rather than a filename or line-count rule Requirement evidence: [[c5]], [[c19]], [[c20]].. _(operationalizes `k2`, `k4`, `k7`)_
- **ac2:** Given a classification and current project settings exist, when requirements are shown, then Trivial bypasses assessment, Low offers a voluntary check, strict Medium requires completion without score blocking, and enabled High requires a pass or explicit override Requirement evidence: [[c21]], [[c22]], [[c23]], [[c6]].. _(operationalizes `k3`)_
- **ac3:** Given context or classification is unavailable or uncertain, when a commit check is requested, then the user sees the uncertainty and recovery options without silently treating it as Trivial or a pass Requirement evidence: [[c20]].. _(operationalizes `k1`, `k2`)_

### 6.3 E20261017670419c4:S003 — Demonstrate understanding with grounded questions

**User value:** `size: L`

Required new behavior: I can demonstrate understanding of the actual requirements, design and behavior I am committing.

**Depends on:** `s1`, `s2`

**Acceptance criteria:**

- **ac1:** Given linked requirements, design, implementation, tests and review evidence are available, when a check is prepared, then questions address the exact change and cite supporting evidence; unavailable evidence is disclosed rather than invented Requirement evidence: [[c24]], [[c25]], [[c26]].. _(operationalizes `k4`, `k7`)_
- **ac2:** Given a developer submits an answer and confidence, when the answer is evaluated, then the daemon records the first response and determines the outcome using validated criteria; the editor cannot declare itself passed Requirement evidence: [[c27]], [[c9]].. _(operationalizes `k1`, `k6`, `k9`)_
- **ac3:** Given a developer uses the VS Code assessment after code was authored manually or with an assistant, when questions and results are produced, then the new assessment flow does not depend on a Claude-specific hook or separate Grokcheck service; reasoning uses existing configured insrc providers. Requirement evidence: [[c28]].. _(operationalizes `k1`, `k7`, `k8`)_

### 6.4 E20261017670419c4:S004 — Learn through guidance after uncertainty or an incorrect answer

**User value:** `size: L`

Required new behavior: I can understand the concept I missed and demonstrate what I learned.

**Depends on:** `s3`

**Acceptance criteria:**

- **ac1:** Given a question is visible with no answer submitted, when the user selects Unsure, then guided understanding opens immediately with explanation and relevant evidence Requirement evidence: [[c29]].. _(operationalizes `k5`)_
- **ac2:** Given an answer has been submitted, when it is evaluated as incorrect, then the user receives a guided walkthrough of the concept and supporting evidence Requirement evidence: [[c30]].. _(operationalizes `k5`)_
- **ac3:** Given the user has read guidance, when the user continues, then a fresh grounded question assesses understanding; reading guidance alone never yields a pass and the original attempt remains visible separately from assisted outcomes Requirement evidence: [[c31]], [[c9]], [[c8]].. _(operationalizes `k5`, `k6`)_

### 6.5 E20261017670419c4:S005 — Complete and resume checks in a VS Code editor pane

**User value:** `size: L`

Required new behavior: I can manage the whole check alongside my code without leaving VS Code.

**Depends on:** `s2`, `s3`, `s4`

**Acceptance criteria:**

- **ac1:** Given a commit needs or offers a check, when the user opens it, then an editor pane shows impact, rationale, requirement, linked scope and progress with questions, confidence, guidance and results Requirement evidence: [[c32]], [[c33]].. _(operationalizes `k3`, `k9`)_
- **ac2:** Given the pane is closed or reloaded, when the user reopens it, then the daemon's current session and eligibility are shown without losing saved answers or granting permission from stale UI state Requirement evidence: [[c4]], [[c12]].. _(operationalizes `k1`, `k9`)_
- **ac3:** Given a check is offered voluntarily or requires an override, when the user chooses skip or override, then the pane clearly distinguishes voluntary decline from a recorded exception and explains the commit consequence Requirement evidence: [[c22]], [[c6]], [[c34]].. _(operationalizes `k3`, `k9`)_

### 6.6 E20261017670419c4:S006 — Apply proportional checks to the exact commit

**User value:** `size: XL`

Required new behavior: I can commit once the applicable requirement is satisfied, knowing the decision covers what is actually committed.

**Depends on:** `s2`, `s3`, `s5`

**Acceptance criteria:**

- **ac1:** Given a commit is attempted under enabled policy, when the pre-commit check evaluates current evidence, then Trivial proceeds without a test, Low may decline, strict Medium proceeds after completion regardless of outcome, and enabled High passes automatically only after a successful test Requirement evidence: [[c21]], [[c22]], [[c23]], [[c6]], [[c35]].. _(operationalizes `k1`, `k3`, `k4`)_
- **ac2:** Given a previously checked snapshot or base changes, when commit eligibility is requested, then old passes and overrides no longer authorize the new commit while historical results are retained Requirement evidence: [[c7]].. _(operationalizes `k4`, `k6`)_
- **ac3:** Given the daemon is unavailable or concurrent attempts occur, when a required check cannot be confirmed, then the user receives actionable recovery and the commit is not silently authorized with an unknown result Requirement evidence: [[c20]], [[c12]], [[c36]].. _(operationalizes `k1`, `k3`, `k4`)_

### 6.7 E20261017670419c4:S007 — Explicitly override a High requirement with a durable commit record

**User value:** `size: L`

Required new behavior: I can make an accountable exception when I cannot pass or choose to skip a High check.

**Depends on:** `s6`

**Acceptance criteria:**

- **ac1:** Given an enabled High check is failed or skipped, when the developer does not explicitly override, then the commit remains blocked Requirement evidence: [[c37]].. _(operationalizes `k3`)_
- **ac2:** Given an enabled High check is failed or skipped, when the developer explicitly confirms an override for the current snapshot, then the exception and reason are recorded in the actual resulting commit message and understanding history Requirement evidence: [[c38]], [[c39]], [[c40]].. _(operationalizes `k1`, `k3`, `k4`, `k6`)_
- **ac3:** Given the required override record is missing from the final message or the staged content changes, when the commit is finalized, then the exception cannot authorize that commit Requirement evidence: [[c7]], [[c40]].. _(operationalizes `k3`, `k4`)_
- **ac4:** Given a valid High assessment succeeds, when the matching commit is retried, then it proceeds automatically without requiring an override Requirement evidence: [[c41]].. _(operationalizes `k3`, `k4`)_

## 7. References

- **[[c1]]** `doc` `docs/pre-commit-understanding-spec.md:4` — "Status: Consolidated product specification from the agreed UX discussion; implementation not started."
- **[[c2]]** `code` `src/agent/providers/cli-provider.ts:64` — "export type CliKind = 'claude' | 'codex';"
- **[[c3]]** `doc` `docs/pre-commit-understanding-spec.md:218` — "- Passing criteria, question selection/length, partial outcomes, retry policy, and independent verifier configuration."
- **[[c4]]** `doc` `docs/pre-commit-understanding-spec.md:29` — "The UI must not grade authoritatively, store the canonical assessment record, or decide whether a commit is permitted. It accesses daemon-owned state through IPC. Existing daemon ownership of storage "
- **[[c5]]** `doc` `docs/pre-commit-understanding-spec.md:48` — "Classification is performed by the daemon's reasoning pipeline, not fixed rules, changed-line counts, filename lists, or size thresholds. Deterministic extraction may collect facts; it does not substi"
- **[[c6]]** `doc` `docs/pre-commit-understanding-spec.md:40` — "| High | Mandatory passing assessment when the project's High-impact requirement is enabled | A pass unblocks automatically. A failed or skipped assessment requires an explicit override recorded in th"
- **[[c7]]** `doc` `docs/pre-commit-understanding-spec.md:63` — "Recheck the identity before authorizing the commit. If the base or staged content changes, preserve the prior understanding history but reevaluate the new snapshot. Never silently reuse a pass or over"
- **[[c8]]** `doc` `docs/pre-commit-understanding-spec.md:115` — "Reading guidance does not count as demonstrated understanding. A successful reassessment may satisfy the concept requirement; an unresolved gap remains recorded. The mock offers **Continue with gap re"
- **[[c9]]** `doc` `docs/pre-commit-understanding-spec.md:113` — "Guidance must be more than a correct-answer reveal. It should help the user understand why the behavior or design follows from the evidence. Preserve original responses, confidence, guidance events, a"
- **[[c10]]** `convention` `AGENTS.md:12` — "- **No direct cloud REST calls from our process.** Cloud LLM access happens through the locally-installed `claude` and `codex` CLI binaries (via `CliProvider`). Auth + quota stay with the user's CLI O"
- **[[c11]]** `doc` `docs/pre-commit-understanding-spec.md:18` — "The daemon owns and manages the complete assessment lifecycle. Relevant Grokcheck code is copied and adapted into insrc, retaining attribution. There is no external Grokcheck installation, Python runt"
- **[[c12]]** `doc` `docs/pre-commit-understanding-spec.md:92` — "Answers and progress survive tab closure or UI reconnection because the daemon owns them. Closing the editor tab is not a pass or an override. Show a recoverable waiting/error state when the daemon is"
- **[[c13]]** `doc` `docs/pre-commit-understanding-spec.md:125` — "| Identity | Assessment ID, person identity, project/repository, linked work-item IDs when available. |"
- **[[c14]]** `doc` `docs/pre-commit-understanding-spec.md:126` — "| Version | Base revision, staged snapshot identity, evidence versions, assessment/schema version, applicable project policy. |"
- **[[c15]]** `doc` `docs/pre-commit-understanding-spec.md:129` — "| Attempts | Responses, confidence at the time of response, grades, timestamps, guidance shown, reassessment attempts. |"
- **[[c16]]** `doc` `docs/pre-commit-understanding-spec.md:130` — "| Understanding | Demonstrated concepts, unresolved gaps, confidence mismatches, assisted/unassisted outcomes, freshness. |"
- **[[c17]]** `doc` `docs/pre-commit-understanding-spec.md:12` — "Understanding is an individual record. It is separate from delivery status: an assessment must never reopen an item, revoke approval, or change whether work is completed. Project policy may pause a co"
- **[[c18]]** `doc` `docs/pre-commit-understanding-spec.md:121` — "The daemon persists an assessment separately from work-item delivery state. The logical record includes:"
- **[[c19]]** `doc` `docs/pre-commit-understanding-spec.md:52` — "- The exact staged changes, including additions, removals, renames, and partial-file staging."
- **[[c20]]** `doc` `docs/pre-commit-understanding-spec.md:57` — "Return a validated impact value, a concise rationale, affected concepts to assess, evidence references, and any material context limitations. Unsupported or missing evidence must be visible; it must n"
- **[[c21]]** `doc` `docs/pre-commit-understanding-spec.md:37` — "| Trivial | No assessment | Continue after classification. |"
- **[[c22]]** `doc` `docs/pre-commit-understanding-spec.md:38` — "| Low | Offer an optional assessment | Declining or an unsuccessful outcome does not block. |"
- **[[c23]]** `doc` `docs/pre-commit-understanding-spec.md:39` — "| Medium | Mandatory completion when project strict mode is enabled | Completion is required in strict mode; the outcome never blocks. |"
- **[[c24]]** `doc` `docs/pre-commit-understanding-spec.md:10` — "Track a person's understanding of what has been designed and built, using a contextual assessment before a commit. The assessment covers the staged changes and their linked epic, story, task, or issue"
- **[[c25]]** `doc` `docs/pre-commit-understanding-spec.md:61` — "Bind classification, generated questions, answers, evidence verification, passes, and overrides to an immutable description of the intended commit. At minimum, account for the base revision and staged"
- **[[c26]]** `doc` `docs/pre-commit-understanding-spec.md:73` — "Each question and explanatory claim needs attributable evidence. Separate facts derived from the code graph or source snapshot from generated interpretation. Independent verification should judge the "
- **[[c27]]** `doc` `docs/pre-commit-understanding-spec.md:77` — "Keep answer keys and grading authority in the daemon. An unresolved model judgment, pending rubric evaluation, or self-rating must not be treated as a successful High-impact assessment."
- **[[c28]]** `doc` `docs/pre-commit-understanding-spec.md:27` — "The initial implementation targets VS Code only. Keep assessment contracts independent of the authoring agent, so future Claude Code, Codex, OpenCode, or other clients can use the same daemon-owned li"
- **[[c29]]** `doc` `docs/pre-commit-understanding-spec.md:100` — "1. The user selects **Unsure**, even before submitting an answer."
- **[[c30]]** `doc` `docs/pre-commit-understanding-spec.md:101` — "2. The submitted answer is incorrect."
- **[[c31]]** `doc` `docs/pre-commit-understanding-spec.md:111` — "5. Offer a fresh question or example that checks the same concept after guidance."
- **[[c32]]** `doc` `docs/pre-commit-understanding-spec.md:81` — "An attempted commit opens or reveals an **Understanding check** editor tab when an assessment is relevant. Source Control shows whether the commit is ready or paused. The tab is a normal editor-area s"
- **[[c33]]** `doc` `docs/pre-commit-understanding-spec.md:90` — "Questions show the relevant prompt, supporting code/design reference, response controls, and confidence controls. Source references should navigate to the corresponding evidence without losing assessm"
- **[[c34]]** `doc` `docs/pre-commit-understanding-spec.md:88` — "- An action to begin the assessment, plus a skip/override action only where policy permits it."
- **[[c35]]** `doc` `docs/pre-commit-understanding-spec.md:44` — "“Completion” must distinguish finishing the assessment, including unresolved gaps, from abandoning it. Opening the pane or merely viewing guidance does not satisfy a completion requirement. Skipping a"
- **[[c36]]** `doc` `docs/pre-commit-understanding-spec.md:157` — "The logical trigger is pre-commit, but do not assume one Git hook can both enforce the gate and reliably modify the final message. Design the pre-commit/commit-message coordination explicitly, includi"
- **[[c37]]** `doc` `docs/pre-commit-understanding-spec.md:140` — "- Failing or skipping leaves the commit blocked until the user explicitly overrides."
- **[[c38]]** `doc` `docs/pre-commit-understanding-spec.md:142` — "- Bind the override to the person, assessment, policy, and intended snapshot."
- **[[c39]]** `doc` `docs/pre-commit-understanding-spec.md:145` — "The mock proposes a required reason, explicit acknowledgment, and these trailers. Names and encoding are not yet a finalized wire contract:"
- **[[c40]]** `doc` `docs/pre-commit-understanding-spec.md:155` — "A manually typed trailer must not by itself count as a daemon-recorded explicit override. The integration must ensure required metadata actually appears in the committed message and refers to the auth"
- **[[c41]]** `doc` `docs/pre-commit-understanding-spec.md:139` — "- Passing automatically authorizes the assessed snapshot without requiring an override."
- **[[c42]]** `convention` `AGENTS.md:120` — "- All LLM interaction goes through the `LLMProvider` interface in `shared/types.ts`"
- **[[c43]]** `convention` `AGENTS.md:122` — "- Never `Promise.all` anything that reaches an LLM provider (cloud or local Ollama embed / complete); always serial `for...of` with sequential awaits."
- **[[c44]]** `convention` `AGENTS.md:135` — "1. **Daemon owns all DB access** — CLI, MCP, and the IDE workbench communicate via IPC only."
- **[[c45]]** `convention` `AGENTS.md:139` — "5. **No raw file dumps** — context is always structured entity summaries + relations from the graph."
- **[[c46]]** `doc` `docs/pre-commit-understanding-spec.md:22` — "| Daemon | Capture and identify staged scope; gather context; classify impact; generate and verify questions; grade; generate guidance; persist individual history; enforce assessment policy; issue com"
- **[[c47]]** `doc` `docs/pre-commit-understanding-spec.md:23` — "| VS Code plugin | Open the assessment as an editor tab; render daemon-provided content; collect answers, confidence, and explicit override actions; show commit eligibility and source references. |"
- **[[c48]]** `doc` `docs/pre-commit-understanding-spec.md:24` — "| Git integration | Request the daemon's decision before committing; ensure it still applies to the intended commit; arrange verified override trailers in the commit message. |"
- **[[c49]]** `doc` `docs/pre-commit-understanding-spec.md:161` — "Source reviewed: [Tsadoq/grokcheck](https://github.com/Tsadoq/grokcheck), pinned to revision [`0d8fa1730f11fa3178bb132f30d42f2dea2d8a90`](https://github.com/Tsadoq/grokcheck/tree/0d8fa1730f11fa3178bb1"
- **[[c50]]** `doc` `docs/pre-commit-understanding-spec.md:167` — "| [`web/grading.js`](https://github.com/Tsadoq/grokcheck/blob/0d8fa1730f11fa3178bb132f30d42f2dea2d8a90/skills/grokcheck/web/grading.js) | Deterministic grading, normalization, partial outcomes, and co"
- **[[c51]]** `doc` `docs/pre-commit-understanding-spec.md:185` — "The inspected project uses the [MIT license](https://github.com/Tsadoq/grokcheck/blob/0d8fa1730f11fa3178bb132f30d42f2dea2d8a90/LICENSE), with copyright attributed to Matteo Villosio. Preserve the upst"
- **[[c52]]** `doc` `docs/pre-commit-understanding-spec.md:187` — "The source audit ran 44 JavaScript tests and 30 focused Python tests successfully, including grading, grounding, run history, and export/grading parity. This is evidence for reuse, not validation of t"
- **[[c53]]** `doc` `docs/pre-commit-understanding-spec.md:204` — "4. Assessments open in a VS Code editor pane and remain associated with the same person and snapshot across UI reconnections."
- **[[c54]]** `doc` `docs/pre-commit-understanding-spec.md:211` — "11. Canonical state and grading remain daemon-owned. The UI cannot unlock the commit by asserting a client-side score."
- **[[c55]]** `doc` `docs/pre-commit-understanding-spec.md:217` — "- Setting defaults, configuration names, and final behavior when a requirement is disabled."
- **[[c56]]** `doc` `docs/pre-commit-understanding-spec.md:219` — "- Person identity, record retention, visibility, and privacy controls."
- **[[c57]]** `doc` `docs/pre-commit-understanding-spec.md:220` — "- Hook/message coordination, partial commits, amend/merge handling, concurrent commits, cancellation, and unavailable daemon behavior."
- **[[c58]]** `doc` `docs/pre-commit-understanding-spec.md:221` — "- Work-item association when several items contribute to a commit or no item is linked."
- **[[c59]]** `doc` `docs/pre-commit-understanding-spec.md:222` — "- Staged-source grounding and graph-version reconciliation without violating structured-context conventions."
- **[[c60]]** `doc` `docs/pre-commit-understanding-spec.md:223` — "- Final IPC contracts, module paths, persisted schemas, and exact trailer names."
- **[[c61]]** `doc` `mocks/commit-understanding.md:3` — "Open [commit-understanding.html](commit-understanding.html) in a browser. The assessment occupies a VS Code editor tab next to the source file, with Source Control showing whether the pending commit c"
- **[[c62]]** `doc` `mocks/commit-understanding.md:39` — "- Trailer names and the required reason/acknowledgment interaction are proposed UI details. The intended requirement is an explicit override tracked in the commit message."
- **[[c63]]** `doc` `mocks/commit-understanding.md:41` — "- Controls and progress are local to the open preview and reset on reload. Real source navigation, agent integration, hooks, staged-content verification, and commit-message writes are not implemented."
- **[[c64]]** `code` `src/agent/providers/cli-provider.ts:142` — "export class CliProvider implements LLMProvider {"
- **[[c65]]** `code` `src/agent/providers/cli-provider.ts:177` — "async complete(messages: LLMMessage[], opts?: CompletionOpts): Promise<LLMResponse> {"
- **[[c66]]** `code` `src/agent/providers/cli-provider.ts:180` — "if (this.kind === 'claude') {"
- **[[c67]]** `code` `src/agent/providers/cli-provider.ts:188` — "const args = ['exec', '--json', ...this.modelArgs(opts)];"

## 8. Open questions

- Design decision: define passing criteria, completion with gaps, first-release question types, retry limits and independent verification while preserving strict Medium completion without score blocking and High pass-or-override. Evidence: docs/pre-commit-understanding-spec.md:44; docs/pre-commit-understanding-spec.md:71; docs/pre-commit-understanding-spec.md:117.
- Design decision: define stable learner identity, retention, visibility and privacy controls. Evidence: docs/pre-commit-understanding-spec.md:133.
- Design decision: define setting defaults and behavior for disabled requirements or unavailable classification; never silently classify missing evidence as Trivial. Evidence: docs/pre-commit-understanding-spec.md:42; docs/pre-commit-understanding-spec.md:57.
- Design decision: specify staged-evidence reconciliation and Git gate/message coordination, including partial commits, amendments, concurrency, retries, cancellation and bypass boundaries. Evidence: docs/pre-commit-understanding-spec.md:65; docs/pre-commit-understanding-spec.md:157; docs/pre-commit-understanding-spec.md:220.
- Design decision: define work-item association when multiple items or no item is linked. Evidence: docs/pre-commit-understanding-spec.md:14; docs/pre-commit-understanding-spec.md:221.

## Resolved questions

- `qa741fe5a` — Design decision: define passing criteria, completion with gaps, first-release question types, retry limits and independent verification while preserving strict Medium completion without score blocking and High pass-or-override. Evidence: docs/pre-commit-understanding-spec.md:44; docs/pre-commit-understanding-spec.md:71; docs/pre-commit-understanding-spec.md:117.
  - **resolved**: Bounded rubric gate: evidence-backed explanation and change-impact questions, with two retries per question. A pass requires every required criterion to be satisfied and independently verified. Strict Medium permits committing after assessment completion with recorded gaps; enabled High requires a pass or explicit override. — User explicitly accepted these assessment rules in chat. _(2026-10-17T09:55:34.071Z)_

## Citations

- **[[c1]]** `doc` `docs/pre-commit-understanding-spec.md:4` — "Status: Consolidated product specification from the agreed UX discussion; implementation not started."
- **[[c2]]** `code` `src/agent/providers/cli-provider.ts:64` — "export type CliKind = 'claude' | 'codex';"
- **[[c3]]** `doc` `docs/pre-commit-understanding-spec.md:218` — "- Passing criteria, question selection/length, partial outcomes, retry policy, and independent verifier configuration."
- **[[c4]]** `doc` `docs/pre-commit-understanding-spec.md:29` — "The UI must not grade authoritatively, store the canonical assessment record, or decide whether a commit is permitted. It accesses daemon-owned state through IPC. Existing daemon ownership of storage "
- **[[c5]]** `doc` `docs/pre-commit-understanding-spec.md:48` — "Classification is performed by the daemon's reasoning pipeline, not fixed rules, changed-line counts, filename lists, or size thresholds. Deterministic extraction may collect facts; it does not substi"
- **[[c6]]** `doc` `docs/pre-commit-understanding-spec.md:40` — "| High | Mandatory passing assessment when the project's High-impact requirement is enabled | A pass unblocks automatically. A failed or skipped assessment requires an explicit override recorded in th"
- **[[c7]]** `doc` `docs/pre-commit-understanding-spec.md:63` — "Recheck the identity before authorizing the commit. If the base or staged content changes, preserve the prior understanding history but reevaluate the new snapshot. Never silently reuse a pass or over"
- **[[c8]]** `doc` `docs/pre-commit-understanding-spec.md:115` — "Reading guidance does not count as demonstrated understanding. A successful reassessment may satisfy the concept requirement; an unresolved gap remains recorded. The mock offers **Continue with gap re"
- **[[c9]]** `doc` `docs/pre-commit-understanding-spec.md:113` — "Guidance must be more than a correct-answer reveal. It should help the user understand why the behavior or design follows from the evidence. Preserve original responses, confidence, guidance events, a"
- **[[c10]]** `convention` `AGENTS.md:12` — "- **No direct cloud REST calls from our process.** Cloud LLM access happens through the locally-installed `claude` and `codex` CLI binaries (via `CliProvider`). Auth + quota stay with the user's CLI O"
- **[[c11]]** `doc` `docs/pre-commit-understanding-spec.md:18` — "The daemon owns and manages the complete assessment lifecycle. Relevant Grokcheck code is copied and adapted into insrc, retaining attribution. There is no external Grokcheck installation, Python runt"
- **[[c12]]** `doc` `docs/pre-commit-understanding-spec.md:92` — "Answers and progress survive tab closure or UI reconnection because the daemon owns them. Closing the editor tab is not a pass or an override. Show a recoverable waiting/error state when the daemon is"
- **[[c13]]** `doc` `docs/pre-commit-understanding-spec.md:125` — "| Identity | Assessment ID, person identity, project/repository, linked work-item IDs when available. |"
- **[[c14]]** `doc` `docs/pre-commit-understanding-spec.md:126` — "| Version | Base revision, staged snapshot identity, evidence versions, assessment/schema version, applicable project policy. |"
- **[[c15]]** `doc` `docs/pre-commit-understanding-spec.md:129` — "| Attempts | Responses, confidence at the time of response, grades, timestamps, guidance shown, reassessment attempts. |"
- **[[c16]]** `doc` `docs/pre-commit-understanding-spec.md:130` — "| Understanding | Demonstrated concepts, unresolved gaps, confidence mismatches, assisted/unassisted outcomes, freshness. |"
- **[[c17]]** `doc` `docs/pre-commit-understanding-spec.md:12` — "Understanding is an individual record. It is separate from delivery status: an assessment must never reopen an item, revoke approval, or change whether work is completed. Project policy may pause a co"
- **[[c18]]** `doc` `docs/pre-commit-understanding-spec.md:121` — "The daemon persists an assessment separately from work-item delivery state. The logical record includes:"
- **[[c19]]** `doc` `docs/pre-commit-understanding-spec.md:52` — "- The exact staged changes, including additions, removals, renames, and partial-file staging."
- **[[c20]]** `doc` `docs/pre-commit-understanding-spec.md:57` — "Return a validated impact value, a concise rationale, affected concepts to assess, evidence references, and any material context limitations. Unsupported or missing evidence must be visible; it must n"
- **[[c21]]** `doc` `docs/pre-commit-understanding-spec.md:37` — "| Trivial | No assessment | Continue after classification. |"
- **[[c22]]** `doc` `docs/pre-commit-understanding-spec.md:38` — "| Low | Offer an optional assessment | Declining or an unsuccessful outcome does not block. |"
- **[[c23]]** `doc` `docs/pre-commit-understanding-spec.md:39` — "| Medium | Mandatory completion when project strict mode is enabled | Completion is required in strict mode; the outcome never blocks. |"
- **[[c24]]** `doc` `docs/pre-commit-understanding-spec.md:10` — "Track a person's understanding of what has been designed and built, using a contextual assessment before a commit. The assessment covers the staged changes and their linked epic, story, task, or issue"
- **[[c25]]** `doc` `docs/pre-commit-understanding-spec.md:61` — "Bind classification, generated questions, answers, evidence verification, passes, and overrides to an immutable description of the intended commit. At minimum, account for the base revision and staged"
- **[[c26]]** `doc` `docs/pre-commit-understanding-spec.md:73` — "Each question and explanatory claim needs attributable evidence. Separate facts derived from the code graph or source snapshot from generated interpretation. Independent verification should judge the "
- **[[c27]]** `doc` `docs/pre-commit-understanding-spec.md:77` — "Keep answer keys and grading authority in the daemon. An unresolved model judgment, pending rubric evaluation, or self-rating must not be treated as a successful High-impact assessment."
- **[[c28]]** `doc` `docs/pre-commit-understanding-spec.md:27` — "The initial implementation targets VS Code only. Keep assessment contracts independent of the authoring agent, so future Claude Code, Codex, OpenCode, or other clients can use the same daemon-owned li"
- **[[c29]]** `doc` `docs/pre-commit-understanding-spec.md:100` — "1. The user selects **Unsure**, even before submitting an answer."
- **[[c30]]** `doc` `docs/pre-commit-understanding-spec.md:101` — "2. The submitted answer is incorrect."
- **[[c31]]** `doc` `docs/pre-commit-understanding-spec.md:111` — "5. Offer a fresh question or example that checks the same concept after guidance."
- **[[c32]]** `doc` `docs/pre-commit-understanding-spec.md:81` — "An attempted commit opens or reveals an **Understanding check** editor tab when an assessment is relevant. Source Control shows whether the commit is ready or paused. The tab is a normal editor-area s"
- **[[c33]]** `doc` `docs/pre-commit-understanding-spec.md:90` — "Questions show the relevant prompt, supporting code/design reference, response controls, and confidence controls. Source references should navigate to the corresponding evidence without losing assessm"
- **[[c34]]** `doc` `docs/pre-commit-understanding-spec.md:88` — "- An action to begin the assessment, plus a skip/override action only where policy permits it."
- **[[c35]]** `doc` `docs/pre-commit-understanding-spec.md:44` — "“Completion” must distinguish finishing the assessment, including unresolved gaps, from abandoning it. Opening the pane or merely viewing guidance does not satisfy a completion requirement. Skipping a"
- **[[c36]]** `doc` `docs/pre-commit-understanding-spec.md:157` — "The logical trigger is pre-commit, but do not assume one Git hook can both enforce the gate and reliably modify the final message. Design the pre-commit/commit-message coordination explicitly, includi"
- **[[c37]]** `doc` `docs/pre-commit-understanding-spec.md:140` — "- Failing or skipping leaves the commit blocked until the user explicitly overrides."
- **[[c38]]** `doc` `docs/pre-commit-understanding-spec.md:142` — "- Bind the override to the person, assessment, policy, and intended snapshot."
- **[[c39]]** `doc` `docs/pre-commit-understanding-spec.md:145` — "The mock proposes a required reason, explicit acknowledgment, and these trailers. Names and encoding are not yet a finalized wire contract:"
- **[[c40]]** `doc` `docs/pre-commit-understanding-spec.md:155` — "A manually typed trailer must not by itself count as a daemon-recorded explicit override. The integration must ensure required metadata actually appears in the committed message and refers to the auth"
- **[[c41]]** `doc` `docs/pre-commit-understanding-spec.md:139` — "- Passing automatically authorizes the assessed snapshot without requiring an override."
- **[[c42]]** `convention` `AGENTS.md:120` — "- All LLM interaction goes through the `LLMProvider` interface in `shared/types.ts`"
- **[[c43]]** `convention` `AGENTS.md:122` — "- Never `Promise.all` anything that reaches an LLM provider (cloud or local Ollama embed / complete); always serial `for...of` with sequential awaits."
- **[[c44]]** `convention` `AGENTS.md:135` — "1. **Daemon owns all DB access** — CLI, MCP, and the IDE workbench communicate via IPC only."
- **[[c45]]** `convention` `AGENTS.md:139` — "5. **No raw file dumps** — context is always structured entity summaries + relations from the graph."
- **[[c46]]** `doc` `docs/pre-commit-understanding-spec.md:22` — "| Daemon | Capture and identify staged scope; gather context; classify impact; generate and verify questions; grade; generate guidance; persist individual history; enforce assessment policy; issue com"
- **[[c47]]** `doc` `docs/pre-commit-understanding-spec.md:23` — "| VS Code plugin | Open the assessment as an editor tab; render daemon-provided content; collect answers, confidence, and explicit override actions; show commit eligibility and source references. |"
- **[[c48]]** `doc` `docs/pre-commit-understanding-spec.md:24` — "| Git integration | Request the daemon's decision before committing; ensure it still applies to the intended commit; arrange verified override trailers in the commit message. |"
- **[[c49]]** `doc` `docs/pre-commit-understanding-spec.md:161` — "Source reviewed: [Tsadoq/grokcheck](https://github.com/Tsadoq/grokcheck), pinned to revision [`0d8fa1730f11fa3178bb132f30d42f2dea2d8a90`](https://github.com/Tsadoq/grokcheck/tree/0d8fa1730f11fa3178bb1"
- **[[c50]]** `doc` `docs/pre-commit-understanding-spec.md:167` — "| [`web/grading.js`](https://github.com/Tsadoq/grokcheck/blob/0d8fa1730f11fa3178bb132f30d42f2dea2d8a90/skills/grokcheck/web/grading.js) | Deterministic grading, normalization, partial outcomes, and co"
- **[[c51]]** `doc` `docs/pre-commit-understanding-spec.md:185` — "The inspected project uses the [MIT license](https://github.com/Tsadoq/grokcheck/blob/0d8fa1730f11fa3178bb132f30d42f2dea2d8a90/LICENSE), with copyright attributed to Matteo Villosio. Preserve the upst"
- **[[c52]]** `doc` `docs/pre-commit-understanding-spec.md:187` — "The source audit ran 44 JavaScript tests and 30 focused Python tests successfully, including grading, grounding, run history, and export/grading parity. This is evidence for reuse, not validation of t"
- **[[c53]]** `doc` `docs/pre-commit-understanding-spec.md:204` — "4. Assessments open in a VS Code editor pane and remain associated with the same person and snapshot across UI reconnections."
- **[[c54]]** `doc` `docs/pre-commit-understanding-spec.md:211` — "11. Canonical state and grading remain daemon-owned. The UI cannot unlock the commit by asserting a client-side score."
- **[[c55]]** `doc` `docs/pre-commit-understanding-spec.md:217` — "- Setting defaults, configuration names, and final behavior when a requirement is disabled."
- **[[c56]]** `doc` `docs/pre-commit-understanding-spec.md:219` — "- Person identity, record retention, visibility, and privacy controls."
- **[[c57]]** `doc` `docs/pre-commit-understanding-spec.md:220` — "- Hook/message coordination, partial commits, amend/merge handling, concurrent commits, cancellation, and unavailable daemon behavior."
- **[[c58]]** `doc` `docs/pre-commit-understanding-spec.md:221` — "- Work-item association when several items contribute to a commit or no item is linked."
- **[[c59]]** `doc` `docs/pre-commit-understanding-spec.md:222` — "- Staged-source grounding and graph-version reconciliation without violating structured-context conventions."
- **[[c60]]** `doc` `docs/pre-commit-understanding-spec.md:223` — "- Final IPC contracts, module paths, persisted schemas, and exact trailer names."
- **[[c61]]** `doc` `mocks/commit-understanding.md:3` — "Open [commit-understanding.html](commit-understanding.html) in a browser. The assessment occupies a VS Code editor tab next to the source file, with Source Control showing whether the pending commit c"
- **[[c62]]** `doc` `mocks/commit-understanding.md:39` — "- Trailer names and the required reason/acknowledgment interaction are proposed UI details. The intended requirement is an explicit override tracked in the commit message."
- **[[c63]]** `doc` `mocks/commit-understanding.md:41` — "- Controls and progress are local to the open preview and reset on reload. Real source navigation, agent integration, hooks, staged-content verification, and commit-message writes are not implemented."
- **[[c64]]** `code` `src/agent/providers/cli-provider.ts:142` — "export class CliProvider implements LLMProvider {"
- **[[c65]]** `code` `src/agent/providers/cli-provider.ts:177` — "async complete(messages: LLMMessage[], opts?: CompletionOpts): Promise<LLMResponse> {"
- **[[c66]]** `code` `src/agent/providers/cli-provider.ts:180` — "if (this.kind === 'claude') {"
- **[[c67]]** `code` `src/agent/providers/cli-provider.ts:188` — "const args = ['exec', '--json', ...this.modelArgs(opts)];"
