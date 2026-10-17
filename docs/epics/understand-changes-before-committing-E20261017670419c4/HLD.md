<!-- insrc:artifact HLD-670419c4ad8bea8e -->

# HLD: understand-changes-before-committing

## Summary

The daemon keeps one durable understanding record for each learner and exact staged change. A VS Code editor pane delivers questions and guidance while Git adapters check the applicable requirement and any recorded exception. Inferred work associations enrich the assessment; explaining an unassociated change's intent and association is itself part of the test.

## Contents

1. [Problem context](#1-problem-context)
2. [Framework summary](#2-framework-summary)
3. [Architecture shape](#3-architecture-shape)
4. [Diagrams](#4-diagrams)
5. [Shared contracts](#5-shared-contracts)
6. [Story boundaries](#6-story-boundaries)
7. [Non-functional targets](#7-non-functional-targets)
8. [Rollout](#8-rollout)
9. [Alternatives considered](#9-alternatives-considered)
10. [References](#10-references)
11. [Open questions](#11-open-questions)

## 1. Problem context

> See **DEF-670419c4ad8bea8e** § 1. Problem

## 2. Framework summary

Choose a daemon-owned state machine with transactional current records and preserved attempt/audit history (a1). This is a proposed architecture: shared interfaces below are design contracts, not existing exported symbols. The daemon is the only authority for identity resolution, scope, questions, grading, guidance, policy and overrides. The seven stories retain the approved dependencies; common eligibility/override envelopes belong to foundational s1 so the editor does not depend on future s7. The separate DEF review timeout issue is not part of this implementation.

## 3. Architecture shape

Existing integration references: daemon entry and RPC transport in src/daemon/index.ts and src/daemon/server.ts; reasoning/context candidates in src/analyze/context; changed-entity grounding reference in src/workflow/code-review/grounding.ts; editor lifecycle/message/CSP reference in vscode-plugin/src/panels/webview-host.ts. Discovery is bounded. The existing webview host manages status/config panels, so the assessment gets its own editor-area panel using compatible lifecycle/message patterns rather than a new status tab. Existing diff grounding can mix staged/unstaged or fall back to committed changes; it must not supply authorization scope unchanged.

Introduce a daemon-internal understanding domain (new module placement to be finalized in LLD) using existing LLMProvider/role routing and daemon-owned durable local storage. Proposed persistence uses a versioned LMDB namespace managed by the daemon storage layer, separate from work-item artifacts and conversations; clients never open it. Atomically persist state revision plus attempt/audit entry before acknowledging a mutation. Duplicate request IDs return the original result; stale expectedRevision rejects and returns fresh state. Long reasoning is a persisted job with an interruption state, not a database transaction held over a model call. No LLM calls in parallel.

Scope capture reads the effective Git index (including GIT_INDEX_FILE), repository/worktree identity, base/parents and intended commit mode; initial commits have an explicit absent base. Worktree content and graph timestamps never substitute for staged objects. Build structured entity summaries and relations tied to this snapshot; permit only bounded attributable staged excerpts under a specified grounding contract. Unsupported binary/deletion/rename/language cases are explicit evidence limitations. A stale index or incomplete evidence cannot produce a false pass or Trivial classification. Evidence changes invalidate affected assessments; policy revision changes require fresh eligibility checks.

Resolve the local learner from available GitHub/GitLab/Jira account IDs, prefer Git identity when multiple IDs exist, then OS user identity as fallback, as approved. Namespace provider IDs by authority and OS IDs by host; record source/assurance and aliases. Git configuration is locally asserted rather than authenticated proof. Never infer identity from the agent or commit author of somebody else's code. Exact meaning and normalization of the preferred Git identity, missing-Git multi-provider ambiguity, retention duration and cross-user visibility must be finalized in s1 LLD; no automatic merge of uncertain identities and no silent adoption of the rejected random-per-repository proposal.

Associate available work IDs many-to-many with evidence provenance. Parent IDs can establish epic/story/task hierarchy without proving a code mapping. Unassociated changes get purpose and association questions, allowing a reasoned no-item explanation. Learner proposals remain distinct from verified associations; insufficient evidence yields unverifiable, not automatic incorrectness or pass. Work-item states and approvals are never mutated by assessments.

Classification is a sequential daemon reasoning operation returning exactly Trivial/Low/Medium/High or a separate Unknown/error state with reasons. Policy evaluation is deterministic after contextual classification. Default strict Medium completion and High pass-or-override are enabled. Trivial needs no assessment; Low is optional; Medium completes after all required concepts are addressed or explicitly recorded as gaps, with no outcome block; High requires all required rubric criteria independently verified or an explicit override. Unknown requires an explicit recorded override, not an invented impact. Proposed behavior for individually disabled Medium/High requirements is optional assessment, with visible policy status; this remains a design proposal pending HLD approval.

Start with evidence-backed explanation/change-impact and intent-association questions. Separate generated content from independent evidence-verification judgments using a fresh reviewer context through the existing provider abstraction. Answer rubrics stay daemon-only. Preserve first answer/confidence, partial or unverifiable judgments, all guidance and assisted attempts. Unsure opens guidance without needing an answer and is not itself a wrong answer. Incorrect submitted responses also open guidance. Allow an initial attempt plus two fresh retries per question/concept, carrying the same evidence and criterion versions; retries cannot be reset by reopening or requesting help. Reading guidance never passes; finishing with recorded gaps can complete Medium, but not satisfy High. Exact question count and rubric selection are LLD decisions.

Git integration is opt-in installation for the registered project, with required policy defaults effective once enabled. A thin local Git adapter talks IPC to the daemon; there is no Grokcheck process. Pre-commit captures the actual candidate scope and returns allowed or actionable pending/block. It never holds a Git command open while the person learns: the editor shows the assessment and the user retries the commit after completion. A successful matching test permits the next check automatically, not an unsolicited new commit. Background assessments may coexist; final authorization uses short per-worktree serialization and durable attempt IDs.

Coordinate pre-commit with commit-msg validation and post-commit observation. A receipt binds learner, full scope, policy, assessment revision and attempt; message validation rechecks scope and required override metadata before permitting completion. For explicit High or Unknown exceptions, daemon-recorded acknowledgment/reason must match the actual final message; handwritten trailers alone are insufficient. Preserve user message text; do not expose detailed learning answers in trailers. Normal commit messages do not invalidate a pass, but edits removing/changing required override records do. Cancellation revokes pending attempt receipts while retaining learning history. Retries reuse learning evidence only for identical inputs; expired receipts are reissued only after fresh checks.

Local hooks are not tamper-proof. Respect existing hooks/core.hooksPath and documented ordering; never overwrite hooks silently. Use the effective temporary index for partial-path commits and validate amended commit parents. Merge/unmerged-index or unsupported Git invocations must return an explicit unsupported/error outcome before authorization. Git/hook bypass, an external index mutation after the last check and later hooks rewriting content are declared limits; post-commit mismatch is audited and never falsely marked covered. LLD and integration tests must define the exact supported Git command set and race boundary before enforcement ships.

Adapt selected Grokcheck modules from revision 0d8fa1730f11fa3178bb132f30d42f2dea2d8a90 per docs/pre-commit-understanding-spec.md section 9: grading/validation/evidence and history patterns live in the daemon, useful presentation remains in the editor. Preserve MIT attribution and provenance. No upstream server, Python runtime, scope heuristics, browser-side authoritative keys, or Claude-specific lifecycle dependency. Upstream tests are behavioral references, not proof of insrc policy correctness.

Source Control readiness (s5): the VS Code Source Control surface must show Ready, Understanding check required, Override required, Stale or Unavailable from the current daemon projection, with an action to reveal the assessment editor. Refresh on state/revision events and on reconnect, staged/base changes, policy changes and learner changes. Until a fresh scope/eligibility response arrives, invalidate any old Ready indication. The display is informational and never replaces the Git gate. Existing status/config webviews are references only, not an implementation of this requirement. The concrete supported extension contribution is validated in s5 LLD.

Reasoning roles: s1 owns adding proposed RoleIds understanding.classify, understanding.generate, understanding.grade, understanding.verify and understanding.guide to the existing registry in src/config/role-taxonomy.ts before consumers ship. All five are critical with defaultTier core because their judgments can reduce required checks, produce grading criteria or teach the learner; use existing coreFloor enforcement and configured CLI providers. s2 consumes classify; s3 consumes generate, grade and verify; s4 consumes guide and verify. Independent verification uses a fresh context and evidence rather than trusting an author self-verdict. Fail initialization for an absent descriptor instead of allowing unknown-role mid fallback. Deterministic policy evaluation and copied pure grading helpers need no model. Calls remain sequential. Verify these mappings and floor behavior with role-routing contract tests.

Assessment persistence version boundary (s1): introduce assessmentSchemaVersion 1, independent of the existing graph-store schema version. A persisted envelope contains version, assessment ID, revision, learner identity/provenance, immutable scope, policy/evidence revisions, state, association provenance, questions/private rubric references, original and assisted attempt records, audit references, and receipt/override references. The exact storage keys and per-record field schemas are LLD work. Readers dispatch by this version; absent/malformed or unsupported newer versions yield an explicit recovery error and never authorize a commit. Do not invent a migration for hypothetical older assessment formats. Future supported upgrades must validate and atomically publish consistent current/history/receipt versions; interrupted migration leaves the prior version usable or explicitly unavailable, never partially authoritative. Migrations and deletion must invalidate affected receipts and apply the approved retention policy consistently to current and historical personal data. Tests cover fresh v1, corrupt/missing version, unsupported newer version, interrupted upgrades and deletion consistency. These are proposed assessment contracts, not claims that existing graph migrations already provide them.

Planned verification matrix: these are acceptance tests to implement, not test results. Every row is owned by the named story; integration tests may exercise previously delivered contracts.

| DEF criterion | Owner | Test level | Observable assertion |
| --- | --- | --- | --- |
| s1/ac1 | s1 | Daemon persistence integration | Save/reopen the same learner and scope; preserve answers, confidence, assisted history and associations. |
| s1/ac2 | s1 | Daemon integration | Fail, skip and resume assessments; snapshot linked work-item approvals/status before and after and assert no mutations. |
| s1/ac3 | s1 | Restart/recovery integration | Interrupt a job, restart daemon and reconnect editor; acknowledged progress survives and missing state never yields pass. |
| s2/ac1 | s2 | Classifier contract plus curated evaluation | Scope includes staged/base evidence; validated impact has rationale/evidence; semantically distinct equal-size diffs need not receive equal impact and no size rule substitutes for reasoning. |
| s2/ac2 | s2 | Policy table unit tests | All four impacts and setting combinations yield the documented none/optional/complete/pass-or-override requirement. |
| s2/ac3 | s2 | Failure integration | Missing evidence/provider failure remains Unknown with actionable recovery; only an explicit recorded exception permits the Unknown path. |
| s3/ac1 | s3 | Generation/verifier integration | Ground questions in versioned staged and linked evidence; contradictory claims rejected and missing evidence disclosed. |
| s3/ac2 | s3 | Daemon command/security tests | First answer/confidence immutable; altered client grade/pass fields cannot grant eligibility; disputed/pending verification never passes. |
| s3/ac3 | s3 | Provider/host contract | Manual/assistant-authored changes use the same assessment lifecycle through configured provider fakes; no Claude hook or Grokcheck process required. |
| s4/ac1 | s4 | Editor/daemon integration | Unsure before answer submission opens grounded guidance immediately and does not count as incorrect. |
| s4/ac2 | s4 | Evaluation/guidance integration | Incorrect submitted response opens contextual walkthrough with evidence and retained original response. |
| s4/ac3 | s4 | State-machine integration | Reading guidance does not pass; fresh question retains original history, marks assisted results and enforces initial attempt plus two retries across reconnects. |
| s5/ac1 | s5 | VS Code extension UI | Editor shows impact, rationale, requirement, scope, questions, confidence, guidance and results; Source Control readiness updates from daemon state. |
| s5/ac2 | s5 | UI/IPC recovery | Close/reload and reconnect; resume current daemon state without losing saved answers; stale UI cannot authorize a changed scope. |
| s5/ac3 | s5 | UI action integration | Optional decline and explicit exception have distinct labels, acknowledgment and commit consequences. |
| s6/ac1 | s6 | Real temporary Git repository | Trivial/Low/strict Medium/High policy produces correct Git exit behavior; strict Medium completion with gaps permits retry and High valid pass permits retry. |
| s6/ac2 | s6 | Real Git repository | Change staged tree, base, effective temporary index or amend parents; reject prior pass/override receipt while retaining history. |
| s6/ac3 | s6 | Git/IPC concurrency and failure | Daemon disconnect, concurrent attempts and cancellation never silently allow required checks; retry recovers idempotently. |
| s7/ac1 | s7 | Git gate integration | Failed/skipped High without explicit override remains blocked. |
| s7/ac2 | s7 | Real Git commit/message | Explicit exception reason and acknowledgment persist; actual resulting commit contains matching audit metadata while existing message is preserved. |
| s7/ac3 | s7 | Git message/scope tamper tests | Remove/change required metadata, type an unrecorded trailer or mutate staged scope; reject the exception authorization. |
| s7/ac4 | s7 | Git retry integration | Current verified High pass permits matching commit without exception metadata or override interaction. |

Additional agreed requirements:

| Requirement | Owner | Test level | Observable assertion |
| --- | --- | --- | --- |
| Spec section 13 check 1 | s3 | Association integration | One commit covers multiple inferred task IDs without forcing a primary; hierarchy IDs do not prove code mapping. |
| Spec section 13 check 2 | s3 | Question/evaluation integration | Unsupported links elicit purpose and association questions; evidence-supported explanation that no item applies is permitted. |
| Spec section 13 check 3 | s3 | Grading unit/integration | Selecting an ID alone cannot satisfy understanding or verify a link. |
| Spec section 13 check 4 | s1, s3 | Persistence/evaluation integration | Learner-proposed/inferred/verified/unresolved states stay distinct; absent evidence yields uncertainty rather than automatic wrong/pass. |
| Spec section 13 check 5 | s4 | Guided-learning integration | Unsure/incorrect association answer invokes guidance and fresh check; work-item status remains unchanged. |
| Spec section 11 check 13 | s3 | Upstream fixture parity | Adapt relevant pinned Grokcheck grading/normalization fixtures and validate TypeScript results; add insrc rubric, Unknown, retry and authority cases. No Python runtime required. |
| Git edge cases | s6, s7 | Real temporary repositories | Partial staging, GIT_INDEX_FILE, initial commit, amend, supported merge state, existing-hook composition, repeated attempts and post-commit mismatch follow the declared support boundary. |
| Model-role floor | s1-s4 | Routing contract | Every proposed role is registered, critical and core-floor protected; missing descriptors fail visibly and provider calls remain sequential. |
| Schema evolution/deletion | s1 | Storage fault injection | Version mismatch/corruption and interrupted migration cannot authorize; current/history deletion and receipt invalidation remain consistent. |


## 4. Diagrams

- [ER model](docs/epics/understand-changes-before-committing-E20261017670419c4/er-model.html)

## 5. Shared contracts

### 5.1 sc1: Learner and immutable assessment scope

**Owner Story:** `s1`
**Consumed by:** `s2`, `s3`, `s4`, `s5`, `s6`, `s7`

**Purpose:** Shared identity and version boundary for all stories; all fields are proposed contracts, not existing APIs.

**Interface sketch (type-level):**

```
type IdentitySource = 'github' | 'gitlab' | 'jira' | 'git' | 'os';
interface LearnerIdentity { key: string; source: IdentitySource; subject: string; authority: string; assurance: 'provider-confirmed' | 'local-config' | 'os-local'; aliases: readonly string[]; }
interface AssessmentScope { repoId: string; worktreeId: string; baseOid: string | null; stagedTreeOid: string; commitMode: 'normal' | 'amend' | 'merge'; parentOids: readonly string[]; learnerKey: string; policyRevision: string; evidenceRevision: string; }
interface WorkAssociation { itemId: string; parentIds: readonly string[]; state: 'inferred' | 'learner-proposed' | 'verified' | 'unresolved'; evidenceRefs: readonly string[]; confidence: 'supported' | 'tentative' | 'unknown'; explanation: string; }
```

### 5.2 sc2: Durable assessment commands and eligibility boundary

**Owner Story:** `s1`
**Consumed by:** `s2`, `s3`, `s4`, `s5`, `s6`, `s7`

**Purpose:** Canonical revisioned record and client commands; s1 owns common envelope so editor and final override implementation share an ancestor.

**Interface sketch (type-level):**

```
type AssessmentState = 'preparing' | 'ready' | 'answering' | 'guidance' | 'evaluating' | 'completed' | 'canceled' | 'stale' | 'error';
interface CommandEnvelope { requestId: string; assessmentId: string; expectedRevision: number; scope: AssessmentScope; }
interface OverrideIntent { reason: string; acknowledged: boolean; }
interface AssessmentView { id: string; revision: number; scope: AssessmentScope; state: AssessmentState; associations: readonly WorkAssociation[]; completion: 'incomplete' | 'complete'; outcome: 'unassessed' | 'pending' | 'pass' | 'gaps' | 'unverifiable'; eligibility: 'pending' | 'allowed' | 'override-required' | 'stale' | 'unavailable'; }
interface AuthorizationReceipt { id: string; assessmentId: string; scope: AssessmentScope; attemptId: string; revision: number; basis: 'trivial' | 'optional' | 'medium-complete' | 'pass' | 'override'; overrideRecordId?: string | undefined; expiresAt: string; }
interface AssessmentService { prepare(scope: AssessmentScope): Promise<AssessmentView>; resume(id: string): Promise<AssessmentView>; cancel(command: CommandEnvelope): Promise<AssessmentView>; requestOverride(command: CommandEnvelope, intent: OverrideIntent): Promise<AssessmentView>; }
interface AuditEntry { id: string; assessmentId: string; revision: number; kind: string; occurredAt: string; scope: AssessmentScope; }
```

### 5.3 sc3: Contextual impact and project policy

**Owner Story:** `s2`
**Consumed by:** `s3`, `s4`, `s5`, `s6`, `s7`

**Purpose:** A validated classifier output and deterministic policy mapping; Unknown is not a fifth assessed impact level.

**Interface sketch (type-level):**

```
type Impact = 'Trivial' | 'Low' | 'Medium' | 'High';
type Classification = { status: 'classified'; impact: Impact; rationale: string; evidenceRefs: readonly string[]; concepts: readonly string[]; } | { status: 'unknown'; reason: string; evidenceRefs: readonly string[]; };
interface UnderstandingPolicy { revision: string; mediumStrict: boolean; highRequired: boolean; enabled: boolean; }
interface Requirement { mode: 'none' | 'optional' | 'complete' | 'pass-or-override' | 'unknown-override'; rationale: string; }
interface ImpactService { classify(scope: AssessmentScope): Promise<Classification>; requirement(classification: Classification, policy: UnderstandingPolicy): Requirement; }
```

### 5.4 sc4: Verified assessment content and attempt evaluation

**Owner Story:** `s3`
**Consumed by:** `s4`, `s5`, `s6`, `s7`

**Purpose:** Daemon-only answer criteria and client-safe prompts, with independent evidence verification and immutable original attempts.

**Interface sketch (type-level):**

```
interface EvidenceRef { id: string; source: 'staged-code' | 'requirement' | 'design' | 'test' | 'review' | 'work-item'; version: string; scopeKey: string; locator: string; }
interface QuestionView { id: string; conceptId: string; kind: 'explanation' | 'change-impact' | 'intent-association'; prompt: string; evidenceRefs: readonly EvidenceRef[]; }
interface AnswerSubmission { questionId: string; response: string; confidence: 'unsure' | 'low' | 'medium' | 'high'; proposedAssociations: readonly WorkAssociation[]; }
interface Evaluation { attemptId: string; questionId: string; outcome: 'correct' | 'incorrect' | 'partial' | 'unverifiable'; assisted: boolean; verifierStatus: 'verified' | 'disputed' | 'pending'; evidenceRefs: readonly EvidenceRef[]; }
interface AssessmentEvaluator { answer(command: CommandEnvelope, submission: AnswerSubmission): Promise<AssessmentView>; finishWithGaps(command: CommandEnvelope): Promise<AssessmentView>; }
```

### 5.5 sc5: Guidance and bounded reassessment

**Owner Story:** `s4`
**Consumed by:** `s5`, `s6`, `s7`

**Purpose:** Automatic help on Unsure or incorrect responses without erasing first attempts or awarding pass for reading.

**Interface sketch (type-level):**

```
interface GuidanceView { questionId: string; trigger: 'unsure' | 'incorrect'; explanation: string; evidenceRefs: readonly EvidenceRef[]; remainingRetries: number; nextQuestion?: QuestionView | undefined; }
interface GuidanceService { requestHelp(command: CommandEnvelope, questionId: string): Promise<GuidanceView>; continueAfterGuidance(command: CommandEnvelope, questionId: string): Promise<AssessmentView>; }
```

### 5.6 sc6: Editor presentation boundary

**Owner Story:** `s5`
**Consumed by:** `s6`, `s7`

**Purpose:** Client-safe state and actions; no answer keys, model-provider credentials or authority to claim a pass.

**Interface sketch (type-level):**

```
interface AssessmentEditorRequest { repoId: string; assessmentId: string; reveal: boolean; }
interface AssessmentEditor { reveal(request: AssessmentEditorRequest): Promise<void>; }
interface EditorProjection { assessment: AssessmentView; classification: Classification; requirement: Requirement; questions: readonly QuestionView[]; guidance?: GuidanceView | undefined; error?: { code: string; message: string; retryable: boolean } | undefined; }
```

### 5.7 sc7: Git attempt and message authorization

**Owner Story:** `s6`
**Consumed by:** `s7`

**Purpose:** Snapshot-bound pre-commit and final message checks; override extension in s7 consumes this existing attempt boundary.

**Interface sketch (type-level):**

```
interface GitAttempt { id: string; scope: AssessmentScope; effectiveIndexPath: string; messageDigest?: string | undefined; }
type GateDecision = { status: 'allow'; receipt: AuthorizationReceipt } | { status: 'pending' | 'block' | 'stale' | 'unavailable'; assessmentId?: string | undefined; reason: string; };
interface CommitGate { check(attempt: GitAttempt): Promise<GateDecision>; validateMessage(attempt: GitAttempt, message: string, receiptId: string): Promise<GateDecision>; observeCommit(attemptId: string, commitOid: string): Promise<void>; }
interface OverrideRecord { id: string; assessmentId: string; learnerKey: string; scope: AssessmentScope; reason: string; acknowledgedAt: string; }
```

## 6. Story boundaries

### 6.1 Story E20261017670419c4:S001

**Owns:** `sc1`, `sc2`

Own identity normalization/alias policy, immutable scope value types, durable state revisions, audit/attempt retention, migrations, privacy and command validation. Shared eligibility and override shapes are defined here, but s6/s7 supply final policy enforcement and exception implementation; unimplemented commands return explicit unavailable. No claims of a current assessment engine. Own registration and validation of the new understanding reasoning-role descriptors and assessment schema-version boundary before consumer stories use them.

### 6.2 Story E20261017670419c4:S002

**Owns:** `sc3`
**Depends on:** `sc1`, `sc2`

Own context-driven impact prompts, evidence limitation reporting, configuration validation and deterministic requirement mapping. Do not grade understanding or allow a classifier error to become Trivial.

### 6.3 Story E20261017670419c4:S003

**Owns:** `sc4`
**Depends on:** `sc1`, `sc2`, `sc3`

Own question/rubric generation, independent verification, authoritative grading, first-response capture and purpose/association assessment. Own daemon-side upstream grading/validation adaptations and provenance. Do not publish answer keys or mutate delivery records.

### 6.4 Story E20261017670419c4:S004

**Owns:** `sc5`
**Depends on:** `sc1`, `sc2`, `sc3`, `sc4`

Own guided explanation and fresh reassessment selection, two-retry accounting and explicit gap completion. Preserve the initial answer and do not infer a pass from guidance consumption.

### 6.5 Story E20261017670419c4:S005

**Owns:** `sc6`
**Depends on:** `sc1`, `sc2`, `sc3`, `sc4`, `sc5`

Own the dedicated VS Code editor view, accessible question/guidance interactions, inferred association correction, source navigation, pending/error/Unknown display and resume. Adapt useful upstream renderer code only. Render override intents through the shared foundational contract; no UI score authority. Also own Source Control readiness presentation, derived solely from current daemon eligibility. Refresh after assessment/override results, staged/base changes, policy or learner changes and daemon reconnect; immediately mark stale/unavailable rather than showing cached Ready. Provide a reveal-assessment action in Source Control and an accessible status label. Concrete VS Code contribution APIs belong in s5 LLD; do not assume the existing status/config host supplies this integration.

### 6.6 Story E20261017670419c4:S006

**Owns:** `sc7`
**Depends on:** `sc1`, `sc2`, `sc3`, `sc4`, `sc5`, `sc6`

Own effective-index capture, hook integration, final scope recheck, receipt lifecycle, concurrency/cancellation/retry handling and post-commit association. Enforce default policy without mutating staged content. Before s7 ships, High/Unknown override requests remain unavailable rather than allowed.

### 6.7 Story E20261017670419c4:S007

**Depends on:** `sc1`, `sc2`, `sc3`, `sc4`, `sc5`, `sc6`, `sc7`

Implement explicit High and Unknown exception handling using shared override shapes, record acknowledgment/reason, preserve final message audit trailers and reject forged/missing/stale records. The feature is not released as complete until both automatic pass and explicit override paths are available.

## 7. Non-functional targets

- **Performance:** Cached eligibility checks avoid model calls when exact scope/evidence/policy match. No latency promise for generation; expose progress and actionable interruption. Proposed target: cached local decisions within one second under normal local load, measured in implementation; never sacrifice evidence correctness to meet it. Bound context and jobs with visible limitations, not silent truncation.
- **Security:** Treat source comments, IDs and learner text as untrusted data, not instructions. Validate IPC commands, repository membership and expected revisions; renderer uses escaped output/CSP and no answer keys. Local identities describe attribution, not enterprise authentication. Keep records local and unavailable to unrelated clients/users by default; explicit retention/deletion/sharing policy requires s1 design approval. Never store CLI OAuth secrets in assessment records.
- **Observability:** Correlate assessment/job/attempt IDs and scope fingerprints with classified impact, requirement, verifier status, stale/error/timeout reasons and explicit overrides. Do not log raw learner answers or tokens by default. Distinguish transport failure, pending reasoning, cancellation and completed gaps; unavailable state cannot be reported as pass.
- **Durability:** Versioned daemon-owned records persist acknowledged answers and audit events atomically. Restart marks interrupted jobs recoverable without granting eligibility. Revalidate scope, evidence, policy and learner before issuing short-lived attempt receipts. Record migrations and retention deletion consistently across current and history records; never revoke delivery approval as a side effect.

## 8. Rollout

**Phase A — durable scope**

**Stories:** `s1`
**Flag:** `understanding.enabled`

Establish shared identity, scope, record and command envelopes before all consumers.

**Backward compat:** No hook installation or changes to work-item state; migrations confined to new assessment storage.

**Phase B — impact policy**

**Stories:** `s2`
**Flag:** `understanding.enabled`

Define contextual classification and requirement mapping before questions and eligibility.

**Backward compat:** Existing project settings unchanged; new flag proposed off until explicitly enabled, with Medium/High defaults on inside enabled projects.

**Phase C — questions and guidance**

**Stories:** `s3`, `s4`
**Flag:** `understanding.enabled`

Land s3 before s4 within this phase; first-response verification precedes assisted reassessment.

**Backward compat:** No Grokcheck runtime dependency; notices and fixtures accompany copied modules. Existing review/workflow providers retain their contracts.

**Phase D — editor assessment**

**Stories:** `s5`
**Flag:** `understanding.enabled`

Expose the complete learning experience only after question/guidance boundaries are available.

**Backward compat:** Existing status/config panels remain unchanged; development preview cannot authorize real commits.

**Phase E — commit enforcement and exceptions**

**Stories:** `s6`, `s7`
**Flag:** `understanding.enabled`

Land s6 before s7; release enforcement only after final-message validation and explicit override paths pass integrated checks.

**Backward compat:** Preserve existing hooks and user messages; explicit project enablement installs documented integration. Disabling removes only insrc-owned integration and revokes pending receipts, not user hooks or learning history.

**Ordering rationale:** All story edges and shared-contract owners precede consumers. s1 owns cross-cutting eligibility/override envelopes; s2 precedes s3, s3 precedes s4, s2/s3/s4 precede s5, s2/s3/s5 precede s6, and s6 precedes s7. No release presents s6 alone as complete because required overrides are implemented by s7.

**Risky bits**

| Area | Why | Mitigation |
| :--- | :--- | :--- |
| Exact staged evidence and Git coordination | Partial staging, temporary indexes, amendments, concurrent external Git activity and later hooks can desynchronize evidence or final messages. | Use effective-index/base/parent/mode fingerprints, revisioned short-lived receipts and commit-msg rechecks; test supported Git variants with real temporary repos. Document bypass/race boundaries and audit post-commit mismatches. |
| Assessment correctness and inferred association | Generated rubrics or plausible learner answers can be mistaken for verified evidence; missing links are not proof of incorrectness. | Independent verifier context, attributable staged evidence, explicit unverifiable state, two bounded retries and immutable original/assisted attempts. Test intent-association questions with multiple tasks and no provable item. |
| Identity and durable personal history | Local Git identities are not authenticated, aliases can collide and history can expose sensitive details. | Namespace identities and retain provenance/assurance; resolve Git precedence semantics and privacy/retention in s1 LLD before persistence ships. Require exact learner matching for authorization; no automatic uncertain merges or raw-answer logging. |

## 9. Alternatives considered

### 9.1 a1: Daemon state machine with transactional records — **CHOSEN**

One daemon-owned assessment aggregate coordinates evidence, learning and commit eligibility; VS Code and Git are clients.

Persist a versioned assessment state machine in daemon-owned local storage, with an append-only attempt/audit history alongside the current projection. Scope every assessment and authorization to learner, repository/worktree, staged snapshot, base and policy revision. Existing context and provider facilities supply reasoning; a thin VS Code editor pane renders state and submits user actions.

Git hooks request decisions before a commit, then validate required override metadata at commit-message time. They do not run the learning UI inside a blocking Git process: an unfinished assessment returns an actionable pending result and the user retries the commit after completing it. Copied Grokcheck logic is adapted inside the daemon or editor renderer, never hosted in another service.

**Pros:**
- One authority determines completion, pass and commit eligibility; reconnects do not create competing client truth.
- Durable revisions and idempotent commands can resume attempts without replaying a complete event-sourcing system.
- A local hook adapter covers VS Code and ordinary Git invocations within declared hook boundaries.

**Cons:**
- Cross-hook consistency cannot prevent every external index mutation or hook bypass; the supported boundary must be explicit.
- Storage schema changes need migration and audit-history rules.
- Long-running reasoning needs cancellation and restart recovery separate from the Git invocation.

**Cost estimate:** L

### 9.2 a2: Daemon event sourcing with derived projections

Every assessment transition is an immutable event; eligibility and editor views are reconstructed projections.

Keep the daemon as sole owner but represent identity resolution, scope capture, classification, question verification, answers, guidance and overrides as a durable event log. Build separate projections for the editor, learning history and commit authorization. All reasoning uses the existing provider boundary.

Git adapters and the editor send commands with expected revisions. Projection freshness is required before authorizing the exact staged commit. Upstream grading and evidence-validation patterns are adapted to event-producing operations within the daemon, with no standalone runtime.

**Pros:**
- A complete ordered history supports detailed reconstruction of first answers, guidance and later associations.
- Projection rebuilds can recover read models from preserved events.

**Cons:**
- Projection lag introduces another correctness condition in the commit gate.
- Versioning event schemas and replaying older assessment policies adds effort beyond the seven user-facing stories.
- Sensitive answers become harder to delete consistently from append-only history and rebuilt projections.

**Cost estimate:** L

**Rejected because:** Projection consistency and deletion complexity without required replay benefit.

### 9.3 a3: Daemon assessment service with editor-coordinated commits

Daemon owns assessment truth while a VS Code command exclusively coordinates assessed commits.

Keep all classification, grading, history and authorization inside the daemon. The VS Code editor captures commit intent, runs the check and invokes Git only when the daemon permits the same snapshot. Runtime-neutral Grokcheck ports remain internal.

The editor holds the commit orchestration context and inserts override metadata before invoking Git. Commits from other editors, terminals or agents remain outside this initial gate unless a later hook adapter is added. A daemon restart can restore the assessment, but the editor must reconstruct the commit attempt.

**Pros:**
- One coordinator can prepare a consistent message and intended commit before invoking Git.
- Avoids cross-hook handoff for the initial VS Code command.

**Cons:**
- Ordinary Git commits in the same workspace can bypass assessment unintentionally, conflicting with the requested pre-commit trigger.
- Editor reload recovery must reconcile both persisted assessment and a lost commit orchestration session.
- Later agent/terminal support requires another integration layer rather than sharing the initial trigger.

**Cost estimate:** M

**Rejected because:** Editor-only commits only partially satisfy k3/k4.

## 10. References

- **[[c1]]** `analyze-bundle` `s1` — "Structural-map bundle: daemon entry/RPC, grounding exports, editor host, bounded import graph and conventions."
- **[[c2]]** `analyze-bundle` `s1` — "Capability discovery: adjacent daemon/context infrastructure; no complete assessment capability demonstrated in three candidates."
- **[[c3]]** `prior-artifact` `.insrc/artifacts/DEF-670419c4ad8bea8e.json`
- **[[c4]]** `doc` `docs/pre-commit-understanding-spec.md:229`
- **[[c5]]** `code` `src/workflow/code-review/grounding.ts:207`
- **[[c6]]** `code` `vscode-plugin/src/panels/webview-host.ts:9`
- **[[c7]]** `convention` `AGENTS.md:122`
- **[[c8]]** `convention` `AGENTS.md:135`
- **[[c9]]** `doc` `docs/pre-commit-understanding-spec.md:161`
- **[[c10]]** `doc` `docs/pre-commit-understanding-spec.md:185`
- **[[c11]]** `doc` `mocks/commit-understanding.md:3`
- **[[c12]]** `doc` `docs/pre-commit-understanding-spec.md:157`
- **[[c13]]** `code` `src/config/role-taxonomy.ts:58`
- **[[c14]]** `doc` `docs/pre-commit-understanding-spec.md:81`
- **[[c15]]** `doc` `docs/pre-commit-understanding-spec.md:213`

## 11. Open questions

- Before s1 implementation, settle preferred Git identity semantics, normalization and multi-provider/no-Git ambiguity; preserve user-approved provider/Git/OS precedence.
- Before s1 persistence ships, decide retention duration, visibility, deletion and sharing; no 30-day default was accepted.
- Confirm proposed project enablement and optional assessment behavior for individually disabled requirements; strict Medium and High remain default requirements.
- Before s6 enforcement ships, specify supported Git commands and hook ordering, temporary indexes, amend/merge handling and the exact race/bypass boundary.

## Resolved questions

- `qf33e3f27` — Before s1 implementation, settle preferred Git identity semantics, normalization and multi-provider/no-Git ambiguity; preserve user-approved provider/Git/OS precedence.
  - **resolved**: Use the active repository's configured Git email as Git ID. With one connected GitHub/GitLab/Jira identity, use that identity. With multiple connected identities, use the repository's Git email. If no usable identity is available, fall back to the OS user ID. Keep identities distinct unless explicitly linked. — User explicitly accepted this interpretation in chat. This preserves the approved provider/Git/OS precedence without automatically merging identities. _(2026-10-17T12:27:44.498Z)_
- `q0a8f7ef6` — Before s1 persistence ships, decide retention duration, visibility, deletion and sharing; no 30-day default was accepted.
  - **resolved**: Retain the learner's assessment history locally until that learner explicitly deletes it. History is private to the learner, sharing is disabled, and there is no automatic expiry. — User explicitly chose retention until learner deletion, private and local, with sharing disabled. _(2026-10-17T12:30:14.335Z)_
- `q2c98434d` — Confirm proposed project enablement and optional assessment behavior for individually disabled requirements; strict Medium and High remain default requirements.
  - **resolved**: Require explicit feature enablement per project. Within an enabled project, Medium completion and High pass-or-explicit-recorded-override are required by default. If either requirement is individually disabled, its assessment remains available voluntarily without blocking the commit. — User explicitly accepted project opt-in, strict Medium/High defaults within enabled projects, and voluntary tests for disabled requirements. _(2026-10-17T12:31:40.687Z)_
- `qed3cc567` — Before s6 enforcement ships, specify supported Git commands and hook ordering, temporary indexes, amend/merge handling and the exact race/bypass boundary.
  - **resolved**: Reuse and extend the framework's existing git_commit, git_amend, git_merge, git_diff, git_status, git_stage and runShell infrastructure. Add one shared daemon assessment eligibility check, invoked by insrc Git operations and hooks for commits initiated outside insrc; do not create a separate commit gateway. Support ordinary commits, amend and merge completion with the effective index (including partial staging and temporary indexes). Implement missing exact candidate snapshot/base binding, eligibility, and explicit commit-recorded overrides. Existing executor auto-approval and verifyHooks:false are not assessment overrides. Existing working-tree Git baseline may supply patterns but must not substitute unstaged content for the intended commit. Story s6 must specify/test hook ordering, actual message verification, cancellation and mismatch recovery; external hook bypass, plumbing and mutation after validation remain outside cooperative local enforcement. — User approved the revised approach after inspecting available framework tools and their gaps. Preserve existing Git capabilities and build only missing assessment coordination. _(2026-10-17T12:36:42.369Z)_

## Citations

- **[[c1]]** `analyze-bundle` `s1` — "Structural-map bundle: daemon entry/RPC, grounding exports, editor host, bounded import graph and conventions."
- **[[c2]]** `analyze-bundle` `s1` — "Capability discovery: adjacent daemon/context infrastructure; no complete assessment capability demonstrated in three candidates."
- **[[c3]]** `prior-artifact` `.insrc/artifacts/DEF-670419c4ad8bea8e.json`
- **[[c4]]** `doc` `docs/pre-commit-understanding-spec.md:229`
- **[[c5]]** `code` `src/workflow/code-review/grounding.ts:207`
- **[[c6]]** `code` `vscode-plugin/src/panels/webview-host.ts:9`
- **[[c7]]** `convention` `AGENTS.md:122`
- **[[c8]]** `convention` `AGENTS.md:135`
- **[[c9]]** `doc` `docs/pre-commit-understanding-spec.md:161`
- **[[c10]]** `doc` `docs/pre-commit-understanding-spec.md:185`
- **[[c11]]** `doc` `mocks/commit-understanding.md:3`
- **[[c12]]** `doc` `docs/pre-commit-understanding-spec.md:157`
- **[[c13]]** `code` `src/config/role-taxonomy.ts:58`
- **[[c14]]** `doc` `docs/pre-commit-understanding-spec.md:81`
- **[[c15]]** `doc` `docs/pre-commit-understanding-spec.md:213`
