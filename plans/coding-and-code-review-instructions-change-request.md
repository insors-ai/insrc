# Coding and Code Review Instructions

Status: Draft change request  
Date: 29 October 2026

## Purpose

Strengthen insrc's coding, validation, and code-review instructions so that implementation and review are grounded in actual behavior, respect the target repository's language and conventions, and consistently emphasize separation of concerns, encapsulation, appropriate object-oriented design, readability, and naming.

This records the prompt review findings and requested improvements. It does not implement a fix, approve a framework dependency, or approve a tracked workflow artifact. It complements the [context-sensitive review PRD](context-sensitive-review-prd.md), which covers risk selection and NFR authoring/verification.

## Review findings

The findings below come from source-level inspection of prompt builders and their evidence paths, not a live model benchmark.

### High priority Implementation evidence is insufficient

The [quality prompt](../src/workflow/code-review/dimensions/quality.ts) asks reviewers to assess correctness, complexity, duplication, and error paths while restricting them to supplied structured summaries. The full graph path's [grounding producer](../src/workflow/code-review/grounding.ts) supplies signatures and relationship names without the function bodies or changed logic. Adherence and conventions prompts apply similar evidence restrictions.

A reversed conditional, missing boundary validation, or incorrect calculation can leave signatures and graph relationships unchanged. The evidence cannot establish implementation correctness, yet an empty findings array can appear to be a clean review.

Required correction: supply structured, revision-bound implementation evidence and permit targeted read-only inspection through the supported review context path. Preserve the no-raw-file-dumps rule: use focused entity/change evidence rather than indiscriminate repository dumps. When evidence remains insufficient, explicitly record the limitation and prevent a false complete/pass assessment. Signature-only evidence is useful for navigation, not proof of behavior.

### High priority Missing coverage evidence becomes a confirmed defect

The [coverage prompt](../src/workflow/code-review/dimensions/coverage.ts) instructs the reviewer to emit HIGH with confidence breach for a symbol classified no-edge-no-tests. Missing graph edges and absent passing Story test records can instead mean incomplete indexing or execution that was not recorded. That conflicts with the steering rule against manufacturing HIGH findings from hollow grounding.

Required correction: distinguish a demonstrated missing test from missing evidence. Investigate through relevant source and execution records before asserting a coverage breach. Unknown coverage must remain explicitly unverified and follow the existing evidence-limit policy; it must not be converted into either a fabricated defect or a proven pass. Align evidence classification and result normalization with the corrected prompt so a wording change is not undone by downstream logic.

### Medium priority Passing files do not prove behavioral coverage

The [coverage instructions](../src/workflow/code-review/dimensions/coverage.ts) infer exercised behavior from a static test-file caller edge and a passing result for that file. An unused helper may call the symbol while unrelated tests pass. Even an executed call does not prove that assertions verify the changed behavior.

Required correction: treat static reachability as supporting evidence. Identify relevant cases and assertions, distinguish static reachability, observed execution, and behavioral coverage, and bind results to the reviewed revision. Require the strength of each coverage claim to match its evidence; do not require a new coverage-instrumentation framework simply to report a weaker claim honestly.

### High priority Instructions impose the backend stack on other targets

The [build renderer](../src/daemon/steps/build-step/render.ts) hard-codes TypeScript commands. The [implementation template](../src/prompts/build/implement-task.md) prescribes .test.ts mappings, and the [conventions reviewer](../src/workflow/code-review/dimensions/conventions.ts) supplies insrc-specific rules as the target repository baseline. This can misdirect Python, Go, JVM, JavaScript, and differently configured TypeScript work. The [validation check planner](../src/daemon/steps/build-step/validation-checks.ts) must be checked alongside prompt changes because execution and instructions must agree.

Required correction: resolve applicable commands, test adapters, and conventions from the actual target repository and changed component. Support mixed-language targets. When a verification route is unsupported, report that limitation; do not run an unrelated TypeScript command or claim the target was validated. Maintain alignment with vscode-plugin/ and jetbrains-plugin/ where affected. The deprecated insrc-ide fork is outside implementation and compatibility scope.

## Required coding and review principles

### Separation of concerns and encapsulation

**P1 — Make responsibility and boundaries explicit.** Separation of concerns and encapsulation are key design and implementation criteria. Give modules/classes coherent responsibilities, keep mutable state and invariants with their owner, and expose intentional interfaces. Avoid leaking internal representations, bypassing ownership, or coupling unrelated concerns through shared state.

Coding instructions must ask the implementer to preserve or establish these boundaries within the approved scope. Review instructions must assess the actual boundaries and concrete consequences of violations. Do not demand a broad architectural rewrite for an isolated change; a material boundary problem outside scope must be raised for a design decision rather than silently expanded into the implementation.

### Object oriented design and framework approval

**P2 — Use object-oriented design.** Use the target language's object-oriented facilities and the project's established object model/framework for cohesive domain responsibilities, encapsulated state, and behavior. Prefer clear ownership and composition where appropriate. Avoid artificial inheritance hierarchies, empty wrapper classes, or abstractions that obscure the work merely to appear object-oriented.

**P3 — Suggest a framework when none is established.** For languages such as Python and JavaScript, inspect the project for an existing OOP framework or agreed conventions. If none is available, suggest suitable framework options during design, explaining their contribution to separation of concerns and encapsulation, fit with the existing code, added dependencies, maintenance, and migration implications. Native classes alone do not imply that an external framework is needed or approved. Research specific candidates when selecting them; this request does not endorse a particular package.

**P4 — Do not introduce an unapproved framework.** A framework recommendation is not approval. Introduce an OOP framework only after explicit user approval through the existing design/dependency decision process. If the user approves none, proceed with a design focused on separation of concerns and encapsulation using the language's native constructs and existing dependencies. A pending optional recommendation must not prevent useful design work along that fallback. Code review must not penalize the absence of an OOP framework or require one when none was approved; it must still assess responsibility boundaries and encapsulation.

### Readability

**P5 — Balance clarity and concision.** Readable code is an explicit quality requirement. Avoid both excessive verbosity and overly sparse or compressed code. Use enough structure, naming, and explanation to make intent, invariants, and failure handling apparent without redundant wrappers, repeated comments, cryptic abbreviations, clever one-liners, or unnecessary indirection.

Readability is contextual, not a line-count target. Comments should explain non-obvious intent or constraints rather than narrate obvious statements. Review findings must explain the concrete comprehension or maintenance problem; personal formatting preferences remain advice unless a documented rule is violated. Brevity must not remove necessary checks or error handling, and verbosity must not substitute for a clear design.

### Naming

**P6 — Infer and follow naming guidelines.** Read applicable repository instructions and infer naming conventions from multiple relevant examples in the touched module/component and language. Follow documented guidance first, then consistently established local conventions. Distinguish production APIs, domain entities, tests, constants, and generated/external names where their rules differ.

**P7 — Use language best practice when consistency is absent.** If no consistent applicable naming guideline can be inferred, state that limitation and use established best practice for the target language, with descriptive domain-oriented names. Do not impose insrc backend naming on unrelated targets or treat an isolated example as a repository-wide rule. Preserve public/serialized compatibility; a naming improvement must not silently break callers or stored/wire formats. Reviewers must distinguish a documented breach, a supported local-pattern departure, and a fallback naming recommendation.

## Application across stages

| Stage | Required instructions |
|---|---|
| Design | Establish responsibility/state ownership, applicable conventions, framework status, testable obligations, and verification strategy. Suggest framework options only where needed; record approval or the native-construct fallback. |
| Coding | Implement the approved task/contract using those boundaries and naming choices; balance readability and concision; run the target's actual required checks. Do not add unapproved frameworks or widen scope silently. |
| Build validation | Inspect actual implementation and meaningful assertions against acceptance checks; combine that assessment with daemon-executed results. Keep builder-reported smoke/live evidence labeled separately. |
| Code review | Verify behavior with sufficient evidence, then assess separation of concerns, encapsulation, approved object model/framework use, readability, and naming. Do not turn missing evidence or optional style advice into fabricated blocking findings. |

Apply equivalent principles to planned, standalone feature, and bugfix paths and to controller and daemon review. Single-call and chunked review prompts must not diverge in evidence standards, scope, or severity treatment.

## Scope and safeguards

- Preserve approved-task scope, the smallest complete change rule, explicit acceptance checks, Story commit attribution, and meaningful named-test mapping.
- Preserve independent author/reviewer routing, serial provider calls, critical-role model floors, daemon-owned storage, and CLI-mediated cloud access.
- Preserve the separation between the coding agent, build validation judge, and post-build code reviewer. No new approval stage or self-review fallback is introduced.
- Keep code review read-only; tests or other evidence gathering must follow the existing stage's execution contract. Do not tell a validation judge to rerun checks that the daemon owns.
- Retain the three-round review limit and explicit user approval. Optional readability or architecture advice must not manufacture warn/block outcomes.
- Update canonical steering, prompt builders, supporting evidence/normalization code, and affected schemas together where required. These requirements are not fulfilled by adding prose that the execution path contradicts.

## Non functional requirements

| ID | Requirement | Verification |
|---|---|---|
| NFR1 | A clean review must not claim implementation or test coverage beyond the evidence available for the reviewed revision. | Contrast body-only defects, missing graph edges, missing run records, and unused test helpers with well-supported passing cases. |
| NFR2 | Equivalent evidence and approved instructions receive equivalent treatment across controller/daemon and single/chunked paths. | Run shared contract fixtures through prompt construction and result validation for each applicable path. |
| NFR3 | Review evidence remains scoped and structured without indiscriminate file dumps or leaked secrets. | Inspect evidence payloads and negative cases for excessive/unrelated source, credentials, and instruction-like document content. |
| NFR4 | Applying generic principles must not silently mutate approved APIs, add dependencies, or rewrite unrelated code. | Check framework approval, scope, and public/serialized naming compatibility scenarios. |

## Acceptance criteria

1. A body-only logic regression with unchanged signature/call graph cannot receive a complete correctness pass based solely on graph summaries. Obtain implementation evidence or explicitly report incomplete verification.
2. Missing indexing or test execution records produce an evidence limitation rather than an automatic HIGH coverage breach. A demonstrated missing promised test remains reportable with supported severity.
3. A passing test file containing an unused helper does not establish that the helper's target behavior was executed and asserted.
4. Python, JavaScript, TypeScript, Go, and JVM fixtures receive applicable conventions and verification routes, or an honest unsupported-route result. No target receives unrelated backend commands as mandatory checks.
5. A change that exposes mutable internals or mixes unrelated responsibilities is assessed against a concrete invariant/boundary and impact, not a class-count or method-count heuristic.
6. An existing approved OOP framework is reused appropriately. When none is established in a Python/JavaScript project, the design can suggest options and explain tradeoffs without installing one automatically.
7. With no user-approved OOP framework, design and coding proceed using native constructs and existing dependencies to maintain separation of concerns and encapsulation. Review does not manufacture a missing-framework defect.
8. Excessively repetitive and cryptically compressed examples both receive actionable readability feedback; concise clear code and necessary explicit checks are not penalized merely for length.
9. Consistent module naming is followed using multiple examples. With no consistent pattern, language-appropriate naming is used, uncertainty is disclosed, and public/serialized compatibility is preserved.
10. Optional taste advice, a framework recommendation, and unknown evidence cannot be silently escalated into a demonstrated blocking defect. Genuine violations retain appropriate severity.
11. Planned/standalone/bugfix prompts and single/chunked controller/daemon review paths apply the same principles and preserve existing approval safeguards.

## Follow through

Take implementation through the tracked insrc front door. Before changes, establish representative prompt/evidence fixtures and the applicable verification adapters. Cover these findings with meaningful regression cases and assess generated prompts as well as result classification; prompt substring checks alone cannot prove the behavior is corrected.

No live model benchmark or complete target-language validation was performed as part of this source-level review. Design must define how to validate evidence sufficiency and consistent outcomes before declaring the changes complete.
