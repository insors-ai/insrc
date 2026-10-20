# SPEC: Pre-commit understanding assessments

Date: 2026-10-17  
Status: Consolidated product specification from the agreed UX discussion; implementation not started.  
Initial surface: insrc VS Code plugin, with assessments in an editor pane.  
Mocks: [interactive preview](../mocks/commit-understanding.html), [editable source](../mocks/commit-understanding.fragment.html), [scenario notes](../mocks/commit-understanding.md).

## 1. Purpose

Track a person's understanding of what has been designed and built, using a contextual assessment before a commit. The assessment covers the staged changes and their linked epic, story, task, or issue: requirements, design decisions, implementation behavior, dependencies, tests, and review findings.

Understanding is an individual record. It is separate from delivery status: an assessment must never reopen an item, revoke approval, or change whether work is completed. Project policy may pause a commit until an assessment requirement is satisfied, but that is a commit decision, not a work-item status transition.

The pre-commit trigger supersedes the earlier proposal to trigger assessments when work items close. Finalized designs and completed reviews supply context; closure is not the trigger. Do not silently exclude commits merely because their linked item is still open or no link is available.

## 2. Scope and ownership

The daemon owns and manages the complete assessment lifecycle. Relevant Grokcheck code is copied and adapted into insrc, retaining attribution. There is no external Grokcheck installation, Python runtime, localhost Grokcheck server, or independent Grokcheck background process.

| Component | Responsibility |
| --- | --- |
| Daemon | Capture and identify staged scope; gather context; classify impact; generate and verify questions; grade; generate guidance; persist individual history; enforce assessment policy; issue commit decisions and override records. |
| VS Code plugin | Open the assessment as an editor tab; render daemon-provided content; collect answers, confidence, and explicit override actions; show commit eligibility and source references. |
| Git integration | Request the daemon's decision before committing; ensure it still applies to the intended commit; arrange verified override trailers in the commit message. |
| Existing LLM providers | Supply reasoning through the existing provider abstraction and CLI authentication. No direct cloud REST provider is introduced. |

The initial implementation targets VS Code only. Keep assessment contracts independent of the authoring agent, so future Claude Code, Codex, OpenCode, or other clients can use the same daemon-owned lifecycle. This version does not require implementing new agent adapters or a separate browser learning application.

The UI must not grade authoritatively, store the canonical assessment record, or decide whether a commit is permitted. It accesses daemon-owned state through IPC. Existing daemon ownership of storage and sequential LLM invocation conventions remain in force.

## 3. Pre-commit impact policy

The daemon classifies the proposed commit into exactly one impact level. The project setting then determines the assessment requirement.

| Impact | Requirement | Commit behavior |
| --- | --- | --- |
| Trivial | No assessment | Continue after classification. |
| Low | Offer an optional assessment | Declining or an unsuccessful outcome does not block. |
| Medium | Mandatory completion when project strict mode is enabled | Completion is required in strict mode; the outcome never blocks. |
| High | Mandatory passing assessment when the project's High-impact requirement is enabled | A pass unblocks automatically. A failed or skipped assessment requires an explicit override recorded in the commit message. |

**Proposed setting behavior:** Medium with strict mode disabled and High with the High-impact requirement disabled offer an optional assessment. The mock implements this behavior; setting defaults and exact configuration names remain design decisions.

“Completion” must distinguish finishing the assessment, including unresolved gaps, from abandoning it. Opening the pane or merely viewing guidance does not satisfy a completion requirement. Skipping a strict Medium assessment does not silently satisfy it. For High impact, skipping is only an allowed bypass through the explicit override flow.

### Contextual classification

Classification is performed by the daemon's reasoning pipeline, not fixed rules, changed-line counts, filename lists, or size thresholds. Deterministic extraction may collect facts; it does not substitute for contextual impact judgment.

The classification consumes:

- The exact staged changes, including additions, removals, renames, and partial-file staging.
- Available linked work-item requirements and accepted design decisions.
- Affected entities, callers/callees, dependencies, and relevant tests.
- Review findings and verification evidence applicable to this version of the work.

Return a validated impact value, a concise rationale, affected concepts to assess, evidence references, and any material context limitations. Unsupported or missing evidence must be visible; it must not be represented as proof of Trivial impact. Classifier unavailability needs an explicit project policy, not a silent fallback to a rule-based classifier.

### Snapshot correctness

Bind classification, generated questions, answers, evidence verification, passes, and overrides to an immutable description of the intended commit. At minimum, account for the base revision and staged tree; exact fingerprint representation is a design decision. Evidence must describe staged content, not an unstaged working-tree revision of the same file.

Recheck the identity before authorizing the commit. If the base or staged content changes, preserve the prior understanding history but reevaluate the new snapshot. Never silently reuse a pass or override for different content. Repeated commit attempts against the same snapshot should resume applicable state instead of creating duplicate assessments.

Graph context must be checked for freshness and its relationship to the staged version. A fresh working-tree index alone does not establish that it represents partially staged content.

## 4. Assessment generation and evidence

Generate a bounded assessment about the meaningful changes and their rationale. Questions should examine behavior, design intent, invariants, dependencies, failure cases, and regression coverage rather than recall of arbitrary syntax.

Initial question types may be a focused subset of the reusable Grokcheck implementation: single/multiple choice, predict behavior, change impact, and explanation against a rubric. Exact first-release question types and length are design decisions. The three-question mock illustrates the flow; it does not establish a production question count or passing threshold.

Each question and explanatory claim needs attributable evidence. Separate facts derived from the code graph or source snapshot from generated interpretation. Independent verification should judge the claims against the evidence and reject or revise contradicted claims before presentation. An author marking its own claim “verified” is insufficient.

Use daemon-served structured context and existing grounding facilities. Any focused staged-source excerpts required for a question must have an explicit, bounded contract consistent with the repository's context policy; do not introduce raw repository-file dumps as the lesson context.

Keep answer keys and grading authority in the daemon. An unresolved model judgment, pending rubric evaluation, or self-rating must not be treated as a successful High-impact assessment.

## 5. VS Code experience

An attempted commit opens or reveals an **Understanding check** editor tab when an assessment is relevant. Source Control shows whether the commit is ready or paused. The tab is a normal editor-area surface, not a modal dialog, terminal quiz, or external browser.

The overview presents:

- The daemon's impact classification and its rationale.
- Linked work and the assessed staged snapshot.
- The applicable project requirement.
- An action to begin the assessment, plus a skip/override action only where policy permits it.

Questions show the relevant prompt, supporting code/design reference, response controls, and confidence controls. Source references should navigate to the corresponding evidence without losing assessment progress. The mock's source details are illustrative, not implemented navigation.

Answers and progress survive tab closure or UI reconnection because the daemon owns them. Closing the editor tab is not a pass or an override. Show a recoverable waiting/error state when the daemon is unavailable.

The user-facing result distinguishes demonstrated understanding from specific gaps and confidence mismatches. The work item remains in its original delivery status throughout.

## 6. Guided understanding

Guidance is automatic in either of these cases:

1. The user selects **Unsure**, even before submitting an answer.
2. The submitted answer is incorrect.

Selecting an answer alone does not grade it. Selecting Unsure is a request for help and is not itself an incorrect answer.

The same editor pane shows a focused walkthrough of the question at hand:

1. Keep the question and any prior response visible in context.
2. Explain the relevant concept or design guarantee.
3. Trace a concrete example using evidence from the assessed change.
4. Explain the misconception when an incorrect response reveals one.
5. Offer a fresh question or example that checks the same concept after guidance.

Guidance must be more than a correct-answer reveal. It should help the user understand why the behavior or design follows from the evidence. Preserve original responses, confidence, guidance events, and subsequent attempts. Distinguish understanding demonstrated without assistance from understanding demonstrated after guidance.

Reading guidance does not count as demonstrated understanding. A successful reassessment may satisfy the concept requirement; an unresolved gap remains recorded. The mock offers **Continue with gap recorded** after guidance: this permits assessment completion with gaps, not a pass. Medium remains non-blocking on outcome after completion; High still requires a passing assessment or an explicit override.

The exact retry limit, partial-answer handling, and grading rubric must be decided during design. No automatic retry loop may silently convert failure into success.

## 7. Individual understanding records

The daemon persists an assessment separately from work-item delivery state. The logical record includes:

| Record group | Required information |
| --- | --- |
| Identity | Assessment ID, person identity, project/repository, linked work-item IDs when available. |
| Version | Base revision, staged snapshot identity, evidence versions, assessment/schema version, applicable project policy. |
| Classification | Impact, rationale, evidence references, limitations. |
| Content | Concepts, questions, answer keys/rubrics, verified explanations, provenance. |
| Attempts | Responses, confidence at the time of response, grades, timestamps, guidance shown, reassessment attempts. |
| Understanding | Demonstrated concepts, unresolved gaps, confidence mismatches, assisted/unassisted outcomes, freshness. |
| Commit decision | Pending/allowed/override-required decision, reason, scope, explicit override record when applicable, resulting commit association when available. |

Person identity must be explicit and stable; do not assume an AI agent's identity or a mutable Git display name uniquely identifies the learner. Identity resolution, visibility to other project members, retention, and privacy controls remain design work. Keep detailed personal assessment results out of the commit message; only the required override audit belongs there.

## 8. Overrides and commit messages

For High impact with the requirement enabled:

- Passing automatically authorizes the assessed snapshot without requiring an override.
- Failing or skipping leaves the commit blocked until the user explicitly overrides.
- The override is a separate recorded action, never a successful assessment.
- Bind the override to the person, assessment, policy, and intended snapshot.
- Preserve the user's existing commit-message content when adding override metadata.

The mock proposes a required reason, explicit acknowledgment, and these trailers. Names and encoding are not yet a finalized wire contract:

```text
Insrc-Understanding: overridden
Insrc-Impact: High
Insrc-Assessment: <assessment-id>
Insrc-Snapshot: <snapshot-id>
Insrc-Override-Reason: <user-supplied reason>
```

A manually typed trailer must not by itself count as a daemon-recorded explicit override. The integration must ensure required metadata actually appears in the committed message and refers to the authorized snapshot.

The logical trigger is pre-commit, but do not assume one Git hook can both enforce the gate and reliably modify the final message. Design the pre-commit/commit-message coordination explicitly, including cancellation, retries, amended commits, and user edits to the message. Local enforcement is not a tamper-proof organizational policy; hook bypass and enforcement boundaries must be documented.

## 9. Grokcheck reuse plan

Source reviewed: [Tsadoq/grokcheck](https://github.com/Tsadoq/grokcheck), pinned to revision [`0d8fa1730f11fa3178bb132f30d42f2dea2d8a90`](https://github.com/Tsadoq/grokcheck/tree/0d8fa1730f11fa3178bb132f30d42f2dea2d8a90).

Copy selected modules into insrc and maintain them locally. Do not invoke Grokcheck as a runtime dependency. Proposed ownership is a daemon-internal TypeScript assessment module plus presentation components in the VS Code plugin; final paths belong in the implementation design.

| Upstream code | Intended reuse | Required adaptation |
| --- | --- | --- |
| [`web/grading.js`](https://github.com/Tsadoq/grokcheck/blob/0d8fa1730f11fa3178bb132f30d42f2dea2d8a90/skills/grokcheck/web/grading.js) | Deterministic grading, normalization, partial outcomes, and confidence summaries. | Port to strict TypeScript; run authoritative grading inside the daemon; map outcomes to insrc assessment semantics. Do not confuse its numeric summary with commit policy. |
| [`web/questions.js`](https://github.com/Tsadoq/grokcheck/blob/0d8fa1730f11fa3178bb132f30d42f2dea2d8a90/skills/grokcheck/web/questions.js) | Selected question renderers and response collection. | Adapt for the VS Code webview, accessibility, styling, and typed message bridge; remove direct dependencies on Grokcheck's API/runtime. |
| [`web/codeview.js`](https://github.com/Tsadoq/grokcheck/blob/0d8fa1730f11fa3178bb132f30d42f2dea2d8a90/skills/grokcheck/web/codeview.js), [`web/diffview.js`](https://github.com/Tsadoq/grokcheck/blob/0d8fa1730f11fa3178bb132f30d42f2dea2d8a90/skills/grokcheck/web/diffview.js) | Code and annotated-diff presentation where useful. | Bind displayed content to staged evidence and VS Code navigation; use the editor's theme and webview content security policy. |
| [`schema/lesson.schema.json`](https://github.com/Tsadoq/grokcheck/blob/0d8fa1730f11fa3178bb132f30d42f2dea2d8a90/skills/grokcheck/schema/lesson.schema.json), [`grokcheck/lesson.py`](https://github.com/Tsadoq/grokcheck/blob/0d8fa1730f11fa3178bb132f30d42f2dea2d8a90/skills/grokcheck/grokcheck/lesson.py) | Question, evidence, and explanation contracts; validation and answer-key stripping patterns. | Extract an assessment-focused subset; add person/work-item/snapshot/attempt fields. Port semantic checks as well as JSON shape validation. |
| [`grokcheck/ground.py`](https://github.com/Tsadoq/grokcheck/blob/0d8fa1730f11fa3178bb132f30d42f2dea2d8a90/skills/grokcheck/grokcheck/ground.py) | Claim/evidence manifests, verification verdicts, and stale-verdict invalidation. | Port useful logic to TypeScript; obtain evidence through daemon-owned facilities. Its claim hash is not a substitute for the commit snapshot identity. |
| [`grokcheck/run.py`](https://github.com/Tsadoq/grokcheck/blob/0d8fa1730f11fa3178bb132f30d42f2dea2d8a90/skills/grokcheck/grokcheck/run.py) | Event-history and replay patterns for answers, confidence, questions, and replies. | Reimplement ownership and storage in the daemon; add explicit learner identity, assisted attempts, commit policy, and overrides. |
| [`tests/js`](https://github.com/Tsadoq/grokcheck/tree/0d8fa1730f11fa3178bb132f30d42f2dea2d8a90/tests/js), [`test_grading.py`](https://github.com/Tsadoq/grokcheck/blob/0d8fa1730f11fa3178bb132f30d42f2dea2d8a90/tests/python/test_grading.py), [`test_export_html.py`](https://github.com/Tsadoq/grokcheck/blob/0d8fa1730f11fa3178bb132f30d42f2dea2d8a90/tests/python/test_export_html.py) | Fixtures and behavioral regression cases, including JavaScript/Python grading parity. | Adapt relevant cases to insrc's test harness so the TypeScript port preserves behavior without requiring Python in production. |

### Parts not adopted as-is

- [`scope.py`](https://github.com/Tsadoq/grokcheck/blob/0d8fa1730f11fa3178bb132f30d42f2dea2d8a90/skills/grokcheck/grokcheck/scope.py) selects lesson subjects through rules. It is not the daemon's contextual impact classifier. Its last-change selection can include unstaged changes and is not sufficient for this gate.
- [`web/api.js`](https://github.com/Tsadoq/grokcheck/blob/0d8fa1730f11fa3178bb132f30d42f2dea2d8a90/skills/grokcheck/web/api.js), the Python HTTP server, CLI process lifecycle, and local-browser authentication are replaced by insrc IPC and daemon lifecycle management.
- [`web/app.js`](https://github.com/Tsadoq/grokcheck/blob/0d8fa1730f11fa3178bb132f30d42f2dea2d8a90/skills/grokcheck/web/app.js) is not adopted as the assessment controller. It records confidence and reveals checkpoint feedback but does not implement our automatic Unsure-triggered walkthrough and reassessment flow.
- The offline browser grading path embeds answer keys; it must not become the authority for commit eligibility.
- Claude-specific skill paths, background wait orchestration, optional media generation, and independent `.grokcheck` storage are not part of the runtime.

### Provenance and licensing

The inspected project uses the [MIT license](https://github.com/Tsadoq/grokcheck/blob/0d8fa1730f11fa3178bb132f30d42f2dea2d8a90/LICENSE), with copyright attributed to Matteo Villosio. Preserve the upstream notice for copied/adapted code and record the source revision, original paths, and local modifications. Bundled fonts and libraries carry separate notices; avoid copying unused assets and retain applicable notices for anything adopted.

The source audit ran 44 JavaScript tests and 30 focused Python tests successfully, including grading, grounding, run history, and export/grading parity. This is evidence for reuse, not validation of the future insrc integration. No upstream modules have been copied into production code yet.

## 10. Existing insrc foundations

Reuse existing infrastructure rather than duplicating it:

- [`CliProvider`](../src/agent/providers/cli-provider.ts) for existing Claude/Codex CLI model access.
- [`code-review/grounding.ts`](../src/workflow/code-review/grounding.ts) for structured changed-symbol and dependency context; adapt scope resolution for staged changes rather than assuming story scope equals commit scope.
- [`code-review/freshness.ts`](../src/workflow/code-review/freshness.ts) as a reference for checking index readiness; its working-tree freshness check does not establish staged-snapshot equivalence.
- [`docgen`](../src/docgen/README.md) for separation of derived structure from generated narrative.
- Existing [webview hosting](../vscode-plugin/src/panels/webview-host.ts) and IPC patterns as implementation references; the assessment needs an editor-pane surface, not an extra status-panel tab.

## 11. Acceptance criteria

1. A commit attempt invokes daemon contextual classification of its exact intended staged scope, with an impact rationale.
2. Trivial skips, Low offers, strict Medium requires completion without outcome blocking, and enabled High requires a pass or recorded explicit override.
3. A successful High assessment unblocks automatically; failed or skipped High does not silently proceed.
4. Assessments open in a VS Code editor pane and remain associated with the same person and snapshot across UI reconnections.
5. Selecting Unsure immediately starts relevant guidance; submitting an incorrect answer also starts guidance.
6. Guidance explains reasoning using evidence and offers a fresh check of the concept. Viewing guidance alone never produces a pass.
7. Original responses/confidence, guidance, and reassessment attempts remain distinguishable in the understanding record.
8. Work-item approval and completion status remain unchanged by every assessment outcome or override.
9. Changed staged content or base invalidates commit authorization until reevaluated; prior history remains available.
10. An explicit High override is recorded by the daemon and included in the actual commit message for the matching snapshot; manually inserted metadata cannot alone authorize it.
11. Canonical state and grading remain daemon-owned. The UI cannot unlock the commit by asserting a client-side score.
12. The feature runs without a Grokcheck process, Python runtime, or separate Grokcheck server; copied modules retain provenance and notices.
13. Ported grading behavior is validated against relevant upstream cases, with additional coverage for policy, staged-content identity, retries, guidance, overrides, and IPC recovery.

## 12. Remaining implementation decisions

- Setting defaults, configuration names, and final behavior when a requirement is disabled.
- Passing criteria, question selection/length, partial outcomes, retry policy, and independent verifier configuration.
- Person identity, record retention, visibility, and privacy controls.
- Hook/message coordination, partial commits, amend/merge handling, concurrent commits, cancellation, and unavailable daemon behavior.
- Work-item association when several items contribute to a commit or no item is linked.
- Staged-source grounding and graph-version reconciliation without violating structured-context conventions.
- Final IPC contracts, module paths, persisted schemas, and exact trailer names.

These decisions must preserve the agreed product policy. Video lessons, spaced repetition, general-purpose course authoring, external browser delivery, additional IDEs, and new agent-provider implementations are outside the initial scope.

## 13. Agreed approach: inferred associations and understanding intent

This decision resolves the work-item association question listed in section 12. Explicit code-to-work-item links are not currently available. Epic, story, and task relationships can be inferred from available IDs, but an ID alone does not establish which code changes implement an item. A staged commit may contain changes for several tasks; associations are many-to-many and do not require a single primary item.

The daemon uses available IDs and supporting evidence to propose associations. Show their basis and uncertainty, allow corrections, and distinguish inferred or user-proposed associations from evidence-verified associations. Do not silently turn a learner's answer into a verified code-to-item link or alter work-item delivery status.

When changes remain unassociated, assessing the learner's understanding of their intent and association is part of the knowledge test. Ask the learner to explain why the changes were made and identify the relevant work items, or explain why no existing item applies. A commit spanning several tasks may require explaining multiple purposes and associations. Do not require an item to be created or selected before the assessment can proceed.

Evaluate the explanation against the staged changes and available requirements, design, tests, and review evidence. Selecting an ID alone does not demonstrate understanding. Unsupported claims remain uncertain; a plausible answer must not automatically become verified evidence or a pass. Missing association evidence alone is not proof that the learner's explanation is incorrect. An unresolved evaluation follows the existing completion and pass/override policy.

If the learner selects Unsure or gives an incorrect explanation, provide the same grounded guidance and fresh reassessment used for other questions. Preserve the original explanation, confidence, proposed associations, verification results, and assisted attempts separately.

Acceptance checks:

1. A commit can be assessed against multiple inferred tasks without forcing one primary association.
2. Unassociated changes produce questions about purpose and relevant work-item association, including a reasoned explanation that no existing item applies.
3. An ID selection alone cannot satisfy the understanding requirement or establish a verified association.
4. Unsupported associations retain their uncertainty, and learner proposals remain distinguishable from verified links.
5. Unsure and incorrect responses trigger guidance without changing linked work-item approvals or completion status.
