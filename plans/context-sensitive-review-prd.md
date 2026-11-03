# Context Sensitive Design and Code Reviews

Status: Draft PRD  
Date: 26 October 2026

## Purpose

Extend insrc's existing design and code reviews with checks selected from the actual risks of a change. Reviewers should examine reliability, security, data dependencies, observability, and architectural decisions where relevant, explain why each check applies, and support their findings with evidence.

Establish explicit non-functional requirements (NFRs) during design authoring and carry them through Story ownership, implementation planning, and verification. Context-sensitive review must assess concrete design obligations as well as discover overlooked risks.

The feature strengthens review coverage within the existing workflow. It preserves independent authorship and review, evidence-based verdicts, human approval, and the three-round review limit. This PRD proposes product behavior; it does not authorize implementation or approve a workflow artifact.

## Problem

Generic review instructions can miss a change's most consequential failure modes. A queue change needs crash recovery and duplicate-execution checks. A connection change needs credential, authorization, and logging checks. A storage change needs compatibility and deletion checks. Applying every possible checklist to every change instead produces irrelevant findings and distracts from actual defects.

Insrc already has a strong review protocol and some conditional coverage. Its HLD and LLD templates distinguish issue and specification intent. Code review always covers adherence, conventions, coverage, and quality, with conditional functional-coverage, diagram, and UX dimensions. The opportunity is to make operational and architectural risk selection explicit and consistent across both review stages.

## Users and outcomes

- Authors see which risks their design must address before implementation.
- Reviewers receive a justified set of checks grounded in the change and its affected boundaries.
- Builders can trace a design obligation to code and meaningful verification.
- Approvers can distinguish demonstrated defects, unavailable evidence, and optional improvements without reading an undifferentiated checklist.

Success means fewer missed material failure modes without turning small, isolated changes into generic architecture audits.

## Existing foundation

The following sources establish the integration context:

- [Canonical steering and review guides](../src/prompts/steering-block.md): independent controller/daemon review, verdict semantics, presentation and approval, visual evidence, and bounded review cycles.
- [Design review templates](../src/workflow/review/template.ts): fixed issue/spec checklists, premise ceilings, and review deadlines.
- [Expected code review dimensions](../src/workflow/code-review/expected-dimensions.ts): the four base dimensions and content-derived or explicitly selected conditional dimensions.

These are source anchors, not an exhaustive implementation audit. The design stage must establish the exact persistence and IPC changes required.

### Current NFR gaps

NFR support exists but is incomplete across the authoring and review chain:

| Surface | Current support and gap | Source |
|---|---|---|
| Design steering | HLD/LLD guides do not explicitly require an NFR section, applicability assessment, or verification mapping. | [Steering](../src/prompts/steering-block.md) |
| HLD authoring schema | Requires a nonFunctional object but permits it to be empty. Performance, security, observability, and durability are optional strings without structured targets or verification. | [HLD schema](../src/workflow/runners/design-epic/schemas.ts) |
| HLD authoring checklist | Asks whether at least one non-functional property has a specific target; this does not establish coverage of all applicable concerns. | [HLD runner](../src/workflow/runners/design-epic/index.ts) |
| HLD presentation | Defines a Non-functional targets section, which the renderer omits when empty. | [Formats](../src/workflow/artifacts/format/formats.ts), [HLD renderer](../src/workflow/artifacts/hld.ts) |
| LLD authoring and presentation | Carries inherited NFR data in the HLD context slice, but has no dedicated NFR section or first-class Story NFR elaboration in its body. Standalone LLD context begins with an empty nonFunctional object. | [LLD artifact](../src/workflow/artifacts/lld.ts), [standalone context](../src/workflow/runners/design-story/standalone.ts), [formats](../src/workflow/artifacts/format/formats.ts) |
| Independent design review | Issue/spec checklists have general intent, invariant, error-path, and test checks, but no explicit NFR applicability, target quality, or verification check. | [Review templates](../src/workflow/review/template.ts) |

The feature must address these authoring gaps alongside review selection. Adding review questions alone would leave reviewers reconstructing missing requirements after the design is written.

## Scope

### Initial release

1. A versioned catalog of context-sensitive checks for the five risk areas below.
2. An explainable applicability assessment for HLD/LLD review and post-build Story code review.
3. Recorded selection, evidence, outcomes, and traceability in the existing review artifacts and readable reports.
4. Equivalent selection and validation rules for controller-reviewed and daemon-reviewed work.
5. Updated canonical steering explaining how to use the checks without adding approval stages.
6. Explicit NFR sections and applicability records in HLD and LLD authoring, schemas, validation, and rendering, including standalone LLDs.
7. Traceability from applicable NFRs to responsible Stories, design decisions, PLAN tasks, implementation evidence, and review results.

DEF continues through its existing claims/probes/verdicts process. It may supply context to later review selection, but this release does not replace its review template. ISSUE, SPEC, and PLAN do not acquire mandatory reviews. A standalone PRD does not acquire a new mandatory review gate.

### Non goals

- Replacing the existing review protocol or adopting another project's orchestration framework.
- Running a full security audit, penetration test, or production reliability certification.
- Mandating cloud infrastructure, distributed deployment, an ADR, or a diagram for every change.
- Adding automatic approval, new reviewer parties, or unlimited review loops.
- Introducing direct cloud LLM REST calls or parallel model invocations.
- Fetching or executing external GitHub prompts during reviews.
- Building a new IDE review interface in this backend release.

## Review experience

Before review, authors assess relevant quality concerns and write an explicit NFR section. An HLD records shared targets and allocates obligations to Stories. Each LLD identifies inherited obligations, elaborates the behavior and verification it owns, and records any additional Story-specific NFRs. A standalone LLD performs the same assessment without relying on a parent HLD. Applicable obligations cannot be replaced by an empty object or generic statements such as “secure” or “fast.”

At review start, insrc establishes the review subject, its upstream intent, applicable repository rules, and the available change and dependency evidence. It assesses applicability against all five risk areas, retaining the existing mandatory checks.

The reviewer sees a concise selection summary before evaluating the subject. Each selected check names its trigger, scope, expected evidence, and existing review dimension. An area found irrelevant includes a short reason. An area whose relevance cannot yet be established remains uncertain and requests targeted investigation; it is not silently skipped.

For design review, the question is whether the proposed behavior and verification are sufficiently specified and compatible with real code. For code review, the question is whether the resulting implementation satisfies those obligations and handles the relevant failure scenarios.

The final report separates blocking findings, other findings, unavailable evidence, and optional advice. It also shows which checks applied and any unfinished checks. Existing presentation and approval steps remain the user's decision points.

### Example

A Story changes retries for a daemon-owned database connection:

| Area | Applicability and review obligation |
|---|---|
| Reliability | Retry behavior changed: inspect deadlines, cancellation, bounded retries, and duplicate side effects. |
| Security | Connection configuration includes credentials: inspect authorization and secret handling. |
| Data dependencies | Retried writes may repeat: establish transaction and idempotency behavior. |
| Observability | New failure paths need actionable diagnostics that omit credentials. |
| Architectural decisions | Check consistency with daemon ownership and existing driver contracts; require alternatives only for material decisions. |

An isolated label correction would retain the base review and normally select none of these additional checks, with a compact applicability explanation.

## Risk catalog

Each area provides reusable questions. Selection narrows them to concrete obligations; it does not blindly expand every bullet into a finding.

| Area | Typical triggers | Design checks | Code review evidence |
|---|---|---|---|
| Reliability | Queues, subprocesses, retries, asynchronous state, resource lifecycle | Specify failure detection, timeouts, cancellation, retry safety, recovery, cleanup, and ordering where relevant. | Control flow, lifecycle handling, and tests for the selected failure scenarios, including partial completion or restart where applicable. |
| Security | External or untrusted input, tools, credentials, authentication, access boundaries | Define trust boundaries, authorization, input handling, secret lifecycle, and permitted actions. Treat model output and retrieved content as untrusted where applicable. | Validation and authorization at the actual boundary, credential handling, redacted diagnostics, and meaningful negative tests. |
| Data dependencies | Schema/relationship changes, multiple stores, caches, migrations, deletion, dependencies on other repositories | State ownership, direction/cardinality where relevant, consistency, ordering, compatibility, provenance, invalidation, deletion, and recovery obligations. | Actual readers/writers and affected callers, migration behavior, storage invariants, and consistency/deletion tests appropriate to the change. |
| Observability | Background work, multi-stage operations, new error paths, retries, fallback, degraded behavior | Specify which actionable states and failures are visible, where diagnostics appear, correlation needs, and sensitive-data exclusions. | Logs/progress/errors distinguish relevant states and identify failed operations without persisting secrets or raw prompts unnecessarily. |
| Architectural decisions | New dependencies, changed boundaries/contracts, new persistence or execution mechanisms | Explain material decisions, constraints, reuse, alternatives, compatibility, operational burden, and reversibility. | Implementation follows the chosen boundary and rationale; dependencies and contracts match the design; deviations are explained and assessed. |

Performance and resource exhaustion are assessed within applicable areas when the change exposes them. Cost alone must never justify reduced correctness. The catalog must permit future expansion without changing the meaning of historical reviews.

## Functional requirements

### Selection and grounding

**FR1 — Preserve the baseline.** Selection adds obligations to existing design checklist items and code review dimensions. It cannot remove base checks or existing functional, diagram, or UX obligations. The five risk areas are check families, not automatically five new top-level verdict dimensions.

**FR2 — Assess every area.** Record each area's applicability as applicable, not applicable, or uncertain, with a reason. Each selected check records the concrete trigger and the artifact, source, or change evidence establishing it. File-name matches may propose candidates but cannot alone establish absence of risk or justify a pass.

**FR3 — Inspect affected behavior.** Use upstream requirements, design content, actual changes, affected callers/readers/writers, repository constraints, and available graph evidence. Use insrc analysis for relationship questions and targeted source inspection for exact behavior. Missing graph edges do not establish that a dependency is absent.

**FR4 — Handle uncertainty explicitly.** Resolve uncertain applicability through targeted evidence gathering where feasible. If it remains unresolved, retain the uncertainty and evidence gap in the report. Never convert uncertainty into not applicable or a demonstrated defect merely to complete a checklist.

**FR5 — Allow justified additions.** Authors may identify risks; reviewers independently assess them and may add checks discovered during review. An author cannot suppress a materially applicable check. Any exclusion or correction must include its rationale and remain visible in the record.

**FR6 — Reassess the implementation.** Code review carries forward relevant design obligations and independently evaluates the actual change. New risks introduced by implementation must be selected even when omitted from the design. Material design deviations follow the existing amendment/approval process.

### Evaluation and findings

**FR7 — Separate the stages.** Design evidence establishes that the proposal addresses the risk and provides a credible verification approach; proposed tests are not claimed as executed. Code evidence establishes behavior in the reviewed revision and records which tests actually ran and their results.

**FR8 — Make findings actionable.** A material finding identifies the violated requirement or invariant, concrete trigger/failure scenario, affected scope, evidence, impact, severity, and corrective expectation. Hypotheses and preferences must not be presented as demonstrated failures. Valid bugs dependent on particular inputs or states remain reportable.

**FR9 — Preserve verdict semantics.** Design checks use the existing holds/does-not-hold/could-not-verify outcomes and severity policy. Unresolved MED/HIGH failures block; unavailable evidence alone is not a fabricated blocking defect. Code checks use the existing dimension and aggregate pass/warn/block semantics. Optional improvements remain advice and do not independently create warn/block outcomes.

**FR10 — Prevent false completion.** Every selected check must have an outcome or an explicit unfinished status. A review that exhausts time or premise capacity must use the existing incomplete/error mechanism and must not stamp successful completion or a pass that implies full coverage. Distinguish a completed assessment of unavailable evidence from a check never attempted. Design must specify this mapping before implementation.

**FR11 — Avoid duplicated findings.** One defect may relate to several areas; retain those associations while presenting one primary finding and counting it once under existing severity aggregation.

**FR12 — Maintain visual discipline.** Relationship changes document endpoints, direction, cardinality/ownership, and compatibility where relevant. Review actual generated companions and rendering when available. No blanket ERD rule; rendering limitations must be reported honestly.

### Records and compatibility

**FR13 — Persist review context.** Record catalog/selection version, subject identity and reviewed revision or artifact version, applicability decisions, selected stable check IDs, triggers, owning dimensions, evidence references, findings, limitations, and completion state. Detailed schema and hashing rules belong in the design.

**FR14 — Preserve useful history.** Unchanged subject, context, and catalog should yield a stable required selection floor. Evidence-driven additions remain permitted and explained. When a relevant input changes, reassess applicability and identify added or retired obligations; never silently reuse a stale review.

**FR15 — Support older records.** Historical reviews without selection metadata remain readable and are labeled as having no recorded context-sensitive assessment. Do not manufacture a retrospective pass or rewrite approval history. A new review under this feature must satisfy the new record requirements.

**FR16 — Keep paths equivalent.** Controller and daemon review paths must share the catalog, selection requirements, expected checks, and answer validation. Equivalent inputs must enforce the same obligations. Preserve opaque continuation state and established MCP contracts; any payload changes must be additive or explicitly versioned, including mirrored IDE contracts where affected.

### NFR authoring and propagation

**FR17 — Require an explicit disposition, not invented NFRs.** NFR requirements are optional when none are needed for the design's scope. In that case, the design must explicitly state “No non-functional requirements are needed for this design” in its Non-functional requirements section, with a brief scope-based reason. A concise statement is sufficient; authors need not populate an NFR table or invent targets to satisfy the template. Silence, an omitted section, or an empty object without this explicit disposition is insufficient. If inherited requirements or existing constraints still apply, distinguish “no additional NFRs” from “no applicable NFRs” and reference those obligations. Structured data and rendering must preserve this distinction. Historical artifacts remain readable without retrospective rewriting.

**FR18 — Assess quality concerns during authoring.** Assess reliability/recovery, security/privacy, data integrity/durability, observability, performance/resource limits, and compatibility/operability as relevant to the subject. Reuse the context-sensitive applicability mechanism; the quality concerns need not become new top-level review dimensions. Record not applicable decisions with a reason and uncertain decisions as open questions. Architectural decisions explain how applicable NFRs are met; a risk family is not itself a requirement. Known material uncertainty about required behavior must be resolved through author clarification and the existing approval process, rather than silently omitted or converted into an invented target.

**FR19 — Make obligations testable.** Each applicable NFR records a stable ID, category, requirement, rationale/source, scope, operating conditions, target or invariant, accountable owner, and verification method. Use numeric targets when meaningful, with units, workload/environment, and measurement conditions. Non-numeric invariants are valid when objectively verifiable, such as credentials never appearing in diagnostics. Never invent service levels or performance budgets without a grounded requirement or an explicitly identified proposal for user decision. Verification may use tests, measurement, fault injection, inspection, or another justified method; it must state observable success/failure criteria.

**FR20 — Allocate HLD obligations.** Each shared NFR identifies the responsible Story or Stories and one accountable owner for any cross-Story verification. Each obligation states whether a Story implements, preserves, or verifies it. An NFR may span multiple Stories; allocation must not leave the final cross-cutting result unowned. Parent targets remain authoritative until changed through the existing amendment and approval process.

**FR21 — Elaborate LLD obligations.** An LLD references applicable parent NFR IDs and specifies its own mechanism, failure/degraded behavior where relevant, affected boundaries, and proving evidence. It can add local obligations with stable IDs, but cannot silently weaken inherited targets. A parent obligation assessed as inapplicable to a Story requires a recorded scope reason consistent with the HLD allocation. Standalone feature and bugfix LLDs establish their own applicable NFRs and preservation obligations. Render enough local detail to assess the Story without duplicating the entire HLD.

**FR22 — Carry NFRs into planning and build.** PLAN tasks identify which applicable NFRs they implement or verify, with explicit coverage of cross-Story verification responsibilities. Build evidence references those IDs and distinguishes proposed checks, executed checks, results, and unavailable evidence. Every applicable NFR must have an accountable verification path; no requirement disappears because it is outside functional acceptance mapping. PLAN does not acquire an independent mandatory review stage.

**FR23 — Review authoring quality and implementation.** Independent design review explicitly checks NFR applicability, completeness, testability, ownership, inherited compatibility, and credible verification. Accept a justified explicit statement that no NFRs are needed; absence of NFR entries is not itself a defect when that disposition fits the scope. Code review checks actual behavior and evidence against each applicable obligation and independently investigates newly discovered risks. A demonstrable material design omission is evaluated under does-not-hold with existing severity rules; genuinely unavailable evidence retains could-not-verify treatment. A missing requirement and unavailable evidence about a specified requirement are different conditions. Suggestions for stronger targets beyond the approved need remain advice unless a grounded correctness or architectural obligation is violated.

**FR24 — Evolve the complete contract.** Update canonical steering, authoring prompts and schemas, artifact types, validators, renderers, context slicing, amendment handling, task mappings, and review prompts/answer validation together where affected. Replace the HLD's “at least one target” check with applicability and obligation coverage checks. Schema presence alone must not establish a well-formed NFR: validate stable IDs, references, required fields, and explicit disposition of applicable obligations. Preserve old records, reject silent weakening, and invalidate/reassess affected evidence when requirements or ownership change.

### Example NFR record

The following illustrates the intended information, not a new global product target:

| Field | Example |
|---|---|
| ID and category | NFR-SEC-01; security/privacy |
| Requirement and source | Diagnostic events from the changed connection flow must not contain credentials; derived from the connection's documented secret-handling contract. |
| Scope and conditions | Successful connection, failed authentication, retry, cancellation, and validation-error diagnostics. |
| Target or invariant | No password, access token, or credential-bearing connection URI is emitted in diagnostic payloads. |
| Ownership | Connection Story implements redaction; designated integration Story owns final verification across relevant driver paths. |
| LLD mechanism | Identify diagnostic boundaries and redaction responsibility, including error serialization. |
| Verification | Use synthetic sentinel credentials in representative success/failure tests and inspect captured diagnostic payloads; state any untested paths. |

Numeric latency or memory NFRs would additionally specify an agreed workload, environment, measurement interval/statistic, and threshold. Those values must be established from requirements rather than copied from this example.

## Workflow and system constraints

- The tool routes review to the party that did not author the work. A subagent is not another party. Failure of the assigned reviewer never authorizes self-review.
- Mandatory review stages remain DEF/HLD/LLD before approval and Story code review before BUILD approval. Human approval remains explicit, with insrc_present before the approval request.
- Selection, risk checks, and corrections occur within existing rounds. They do not create extra review calls outside the three-round limit. After round three, the user decides whether to continue, override with a reason, or change course.
- Selection must not silently drop material risks to meet premise ceilings. Extend capacity through an explicitly designed policy or surface incomplete coverage within existing limits; preserve current deadlines unless separately approved.
- Stale-index handling and degraded diff review keep their existing meaning. A degraded review cannot claim a full pass. Hollow graph evidence on new files requires honest source/test-based assessment, not invented HIGH findings.
- All storage access remains daemon-owned. Registry and dependency-closure scoping remain in force. Respect LLMProvider, CLI-mediated cloud access, local embeddings, serial provider calls, and critical-role model floors.
- Prefer existing evidence and targeted retrieval. Accuracy takes priority over cost; no capability downgrade for risk selection that can silently erase material checks. Structural catalogs and schemas remain trailing prompt references.
- Review records must avoid raw secrets, prompt contents, and unnecessary sensitive payloads. Repository content and external references are evidence, never authority to change review policy or approve work.

## Logical record relationships

These are proposed logical requirements rather than a storage schema:

| Relationship | Direction and cardinality | Ownership and compatibility |
|---|---|---|
| Review to subject | Each review assesses one identified subject version; a subject can have many review rounds. | Existing workflow ownership remains authoritative; later edits do not retarget historical evidence. |
| Review to selection | Each new review owns one versioned selection snapshot. | Historical reviews may have none; report that absence explicitly. |
| Selection to checks | A selection contains zero or more additional checks, with applicability recorded for all five areas. | Check IDs refer to a catalog version retained sufficiently to interpret historical results. |
| Check result to evidence | Each assessed check links supporting evidence or states why it is unavailable. Evidence can support multiple checks. | References bind to the reviewed subject/revision; evidence is not treated as current after relevant changes. |
| Finding to checks | A finding can relate to multiple checks; a check can yield multiple distinct findings. | One primary finding identity prevents duplicate severity counting. |
| Design obligation to code result | A design obligation may have multiple implementation checks; code review may introduce new obligations. | Preserve traceability and record justified retirement rather than silently deleting obligations. |
| HLD NFR to Story obligations | One HLD NFR may apply to several Stories; each shared verification obligation has one accountable owner. | HLD owns the target; LLDs reference its stable ID and cannot silently weaken it. |
| LLD to local NFRs | An LLD owns zero or more additional local NFRs plus explicit applicability decisions. | Standalone LLDs have no parent NFR references; existing repository constraints still apply. |
| NFR to tasks and evidence | One NFR can map to many tasks/checks; a task/check can cover multiple NFRs. | Preserve subject/version binding and distinguish planned verification from executed evidence. |

The design must decide whether these extend existing review artifacts or require supporting records. No new database is prescribed.

## Acceptance criteria

| ID | Scenario | Required result |
|---|---|---|
| AC1 | Isolated wording change with no behavioral impact | Base checks remain; additional areas are excluded with concise reasons and no generic audit findings. |
| AC2 | Queue retry and subprocess cancellation change | Reliability checks cover bounded retries, duplicate effects, deadlines, cancellation, and cleanup where triggered; design/code evidence is distinguished. |
| AC3 | Credential-bearing external connection change | Security and observability checks inspect authorization, input handling, and sensitive diagnostics; no secret is copied into the report. |
| AC4 | Stored relationship or schema change | Review identifies affected readers/writers, compatibility, migration/deletion obligations, and relevant relationship documentation. |
| AC5 | Missing graph edges for new files | The reviewer uses appropriate source/test evidence, reports limitations, and does not infer a defect or pass from missing edges. |
| AC6 | Author omits a material applicable risk | The reviewer adds it with evidence; author-provided exclusions cannot silently suppress it. |
| AC7 | Implementation introduces a risk absent from the approved design | Code review adds the obligation and assesses any material deviation under existing workflow rules. |
| AC8 | One bug affects reliability and data consistency | One finding is shown with both associations and is counted once. |
| AC9 | Deadline or premise ceiling prevents evaluation of a selected check | The report identifies unfinished coverage; no success/pass record implies the check was completed. |
| AC10 | Evidence is genuinely unavailable after assessment | The existing unavailable-evidence treatment is retained; no false blocking defect is invented. |
| AC11 | Equivalent subject reviewed by controller or daemon | Both enforce the same selection floor, check IDs, and required result fields. |
| AC12 | Subject or catalog changes between reviews | Applicability is reassessed and selection changes are visible; stale evidence is not silently reused. |
| AC13 | Old review record is opened | Existing verdict/history remains readable with an explicit absence of selection metadata. |
| AC14 | Optional improvement, third review round, or approval request | Advice does not change verdict; round limits and explicit human approval remain intact. |
| AC15 | Existing diagram, UX, or functional obligations apply | They remain required alongside the new checks. |
| AC16 | New HLD or LLD has no NFRs needed for its scope | Accept an explicit statement that none are needed, with a brief reason, without requiring populated NFR entries. Omitted/empty sections fail the explicit-disposition requirement; rendering must show the statement. Existing inherited obligations are referenced separately when there are no additional NFRs. |
| AC17 | HLD NFR spans several Stories | Each Story's responsibility is recorded, with one accountable owner for final shared verification and traceable references in relevant LLDs. |
| AC18 | Standalone feature or bugfix LLD has no parent HLD | It assesses applicable NFRs and preservation obligations itself; empty synthetic HLD context is not treated as absence of risk. |
| AC19 | Author supplies “fast,” “secure,” or an unsupported numeric service level | Review requests testable conditions and grounded targets; no invented budget or subjective preference becomes a mandatory threshold. |
| AC20 | Story implementation meets functional acceptance criteria but omits an applicable NFR | PLAN/build/review traceability exposes the omission; it cannot disappear from verification merely because functional tests pass. |
| AC21 | LLD changes an inherited target or verification owner | The conflict is surfaced and follows existing amendment/approval rules; prior evidence is not silently reused. |
| AC22 | NFR uses a non-numeric invariant or evidence cannot be obtained | Objective invariant verification is accepted; unavailable evidence and an absent required obligation receive their distinct existing verdict treatment. |
| AC23 | Old artifact lacks structured NFR data | It remains readable with no retroactive compliance claim; new or reauthored artifacts use the new contract, with legacy context gaps explicitly assessed. |

## Validation and rollout

Build a reviewed fixture set containing both risky and low-impact changes, spanning all five areas and both design intents. Establish expected applicability, material defects, and evidence gaps before evaluating the feature. Include counterexamples that should not trigger each area, prompt-injection content, duplicate findings, partial evidence, and exhausted review capacity.

Include NFR fixtures for epic and standalone designs, inherited and local obligations, shared ownership, measurable and invariant-based requirements, valid explicit no-NFR statements, invalid omitted/empty sections, unsupported thresholds, broken task/evidence references, and historical artifacts. Verify the authored JSON and rendered documents agree and that NFR obligations survive HLD context slicing, amendments, planning, and both review paths. Exercise meaningful functional-success/NFR-failure examples so functional coverage cannot mask the missing quality requirement.

Release gates are complete preservation of existing mandatory checks, parity across both reviewer paths, no silent omission of selected checks, no fabricated passes from unavailable evidence, and passing the acceptance scenarios above. Evaluate finding precision and missed material defects against the fixture judgments; do not use finding count as a quality target.

Track applicability agreement, missed material risks, duplicate/irrelevant findings, unfinished checks, review duration, and reviewer/user overrides. Added latency is measured rather than traded for correctness. Compare against the same fixtures using current review templates before enabling enforcement for new reviews.

Roll out through fixture validation and opt-in evaluation, then enable the new catalog for newly started reviews after gates pass. Existing in-flight reviews must either retain their recorded version or explicitly restart; never switch check requirements mid-round. A rollback preserves all recorded evidence and identifies reviews run with the disabled catalog rather than rewriting their history.

## Design decisions to resolve

1. Exact mapping of each catalog check to existing design items and code dimensions, avoiding duplicate evaluation.
2. How deterministic trigger rules and reviewer judgment combine into a stable selection floor, including uncertain applicability.
3. Persistence/versioning, subject freshness binding, and additive IPC/MCP report fields.
4. How selected checks fit premise ceilings and deadlines, with precise incomplete-review behavior on both paths.
5. Which fixture corpus and independently assessed baseline establish acceptable applicability and finding quality.
6. The shared NFR record shape, stable-ID namespace, applicability taxonomy, and compatibility strategy for existing nonFunctional strings.
7. How HLD obligations are allocated, referenced and elaborated in LLDs, amended, rendered, and mapped to PLAN/build evidence without duplicating requirements or weakening targets.

## External references and adaptation

References were consulted on 26 October 2026. Links track upstream branches and may change; implementation should pin the exact revisions of any borrowed material and verify its license and attribution requirements. The proposed requirements above are insrc-specific adaptations, not claims that these projects implement them.

### Primary inspiration

[GitHub awesome-copilot System Architecture Reviewer](https://github.com/github/awesome-copilot/blob/main/agents/se-system-architecture-reviewer.agent.md) assesses system context before choosing review concerns and includes reliability, security, data dependencies, observability, and decision rationale. Borrow the context-first selection approach. Do not import its fixed framework-area count, generic scale thresholds, cloud recommendations, automatic document creation, or tool permissions. Insrc selects every materially applicable risk under its own architecture and approval rules.

### Supporting review patterns

[Superpowers Code Reviewer](https://github.com/obra/superpowers/blob/main/skills/requesting-code-review/code-reviewer.md) supplies explicit requirements and revision scope and asks for located, severity-based, actionable findings. Borrow that input/output discipline while retaining insrc's own reviewer routing and verdict schemas.

[Anthropic Code Review command](https://github.com/anthropics/claude-code/blob/main/plugins/code-review/commands/code-review.md) emphasizes supported findings, repository-rule compliance, and avoiding duplicate or speculative comments. Borrow the evidence and noise-control principles. Do not adopt blanket exclusions of input-dependent defects, its orchestration choices, or automatic GitHub posting behavior.
