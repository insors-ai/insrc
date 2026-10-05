<!-- insrc:artifact LLD-f2f08ccf89f8ab25-S001 -->

# LLD: E20261005f2f08ccf:S001

## Summary

**Epic:** `structured-design-review-template-approved-spec`
**HLD base run:** `wf-1791180422005-29ykwt`
**HLD effective hash:** `f2f08ccf89f8...`

A design document (HLD or LLD) is reviewed against a fixed template instead of an open instruction. There are two templates, chosen by what the design answers: an ISSUE (a fix) or a SPEC (a feature or epic). Each names what to check and how many premises to examine. The reviewer checks the items itself, reading the code and using insrc analyze, in one session. Each finding says plainly whether the design is wrong or the reviewer could not verify it, and only the first blocks approval.

## Contents

1. [HLD context](#1-hld-context)
2. [Contract details](#2-contract-details)
3. [Data model changes](#3-data-model-changes)
4. [Error paths](#4-error-paths)
5. [Test strategy](#5-test-strategy)
6. [Migration](#6-migration)
7. [Alternatives considered](#7-alternatives-considered)
8. [References](#8-references)
9. [Open questions](#9-open-questions)

## 1. HLD context

**Framework:** Standalone feature — no parent HLD. Design directly against the repo, grounded on the s1 analyze passes. There are no HLD shared contracts to honour.
**Rollout phase:** standalone

## 2. Contract details

**Surface level:** internal

### 2.1 `runReview`

```typescript
runReview(artifactMarkdown: string, opts: RunReviewOpts): Promise<ReviewReport>
```

**Parameters:**
- `opts.intent: 'issue' | 'spec'` _(optional)_ — Which template to use. Given only for a design artifact; reviewArtifactFile resolves it.

**Returns:** `Promise<ReviewReport>` — For stage design.epic or design.story: the report from ONE reviewer session driven by the template. For every other stage: today's extract, probe and verify pipeline, unchanged.

**Errors:**
- `Error` when The stage is a design stage and the review provider cannot run a reviewer session (it is not a CLI provider). The message says a tool-capable reviewer is required. There is no fallback to the old pipeline.
- `Error` when The session's answer fails template validation twice (see Review template).

**Postconditions:**
- A design review makes one reviewer session, plus at most one repeat when the first answer fails validation.

### 2.2 `reviewArtifactFile`

```typescript
reviewArtifactFile(opts: ReviewArtifactOpts): Promise<ReviewArtifactResult>
```

**Returns:** `Promise<ReviewArtifactResult>` — Unchanged shape. For a design artifact it resolves the intent, runs the template review once and stamps meta.review. It applies no automatic edits to a design and runs no second pass; `applied` is empty. Other artifact kinds behave as today.

**Postconditions:**
- Intent is `issue` when an ISSUE artifact exists for the design's epicHash, otherwise `spec`.

### 2.3 `computeReviewVerdict`

```typescript
computeReviewVerdict(findings: readonly Finding[], blockOn?: readonly Severity[]): ReviewVerdict
```

**Returns:** `ReviewVerdict` — Unchanged rule for blocking: block when a finding's severity is in the block list. New: when nothing blocks and at least one finding's outcome is could-not-verify, the verdict is warn, not pass.

### 2.4 `effectiveReviewVerdict`

```typescript
effectiveReviewVerdict(review: ReviewReport, resolutions?: ReviewResolutions): ReviewVerdict
```

**Returns:** `ReviewVerdict` — Unchanged code. It keeps reading severity, and a template finding's severity is set from its outcome (see Finding), so only does-not-hold findings can block.

### 2.5 `approveArtifactByJsonPath`

```typescript
approveArtifactByJsonPath(jsonPath: string, opts?: { overrideReview?: string }): ApprovalResult
```

**Returns:** `ApprovalResult` — Unchanged code and behaviour. With the Finding rule below, a design whose review has only could-not-verify findings is approvable; one with a does-not-hold finding is refused until it is resolved or overridden.

### 2.6 `runEditSession`

```typescript
runEditSession(prompt: string, opts: EditSessionOpts): Promise<LLMResponse>
```

**Returns:** `Promise<LLMResponse>` — Unchanged. Named here as the precedent: the new reviewer session (see Reviewer session) is its read-only sibling on the same provider.

## 3. Data model changes

### 3.1 `Review template` — new

Two templates held as data in the review module, one per intent. Each has an id, a premise threshold, and an ordered list of check items grouped under dimensions. PROPOSED CONTENT, to be confirmed by the user. ISSUE template, threshold 8: (1) Fix targets the defect: the change addresses the root cause the ISSUE states and leaves out nothing from its fix intent. (2) Current behaviour: what the design says the code does today is true. (3) Change sites: the functions and files to change exist and the list is complete (callers, writers). (4) Preserved behaviour: each invariant the design promises to keep is real and the change does not break it. (5) Tests: each acceptance criterion has a test that would fail without the fix. SPEC template, threshold 16: (1) Coverage of intent: every decision or acceptance criterion upstream is designed, and no non-goal is built. (2) Current behaviour. (3) New versus reuse: what is called new does not already exist; what is reused exists with the stated shape. (4) Contracts and change sites: signatures, callers and inventories are complete. (5) Data and compatibility: stored shapes, older records, migration. (6) Boundaries: nothing owned by another Story or shared contract is redesigned (HLD and Epic stories). (7) Error paths: each failure is detectable and its handling is stated. (8) Tests: each acceptance criterion maps to a test. The threshold is the most premises (concrete claims) the reviewer examines across all items. Every item must be answered, with at least one premise or with `not applicable` and a reason. Code validates the answer: every item answered, premises within the threshold, every outcome valid, every does-not-hold finding naming the file it rests on.

**Call sites:**
- `src/workflow/review/extract.ts`
- `src/workflow/review/review.ts`

### 3.2 `Reviewer session` — new

A new capability on the CLI provider, beside runEditSession: start the CLI in the repo with read-only tools (file read, search) and the insrc analyze tools allowed, no edit permission, a wall-clock limit, and a structured final answer. The prompt gives the template, then the instructions, then the design at the end. The instructions tell the reviewer to check each item against the real code and docs; to use insrc analyze for drill-down (how a module is built, whether a capability exists, who calls a symbol, whether code follows a documented rule); to read as much of a file as a claim needs; and never to mark something wrong because it did not look. The exact CLI flags for claude and codex are confirmed with a live probe during the build. The controller reviewer needs no session: insrc_review_step hands it the same template prompt for a design stage and it answers with its own tools.

**Call sites:**
- `src/agent/providers/cli-provider.ts`
- `src/mcp/review-step/phases/start.ts`
- `src/mcp/review-step/schema.ts`

### 3.3 `Finding` — field-add

Two optional fields. `outcome`: 'holds' | 'does-not-hold' | 'could-not-verify'. `item`: the id of the template check item the finding answers. For a template finding, severity is set from the outcome so every existing reader keeps working: does-not-hold is HIGH or MED as the reviewer judges how much it breaks, and both block; holds and could-not-verify are LOW and never block. A could-not-verify finding must say what the reviewer tried and what was missing. Findings from the old pipeline carry neither field and are read exactly as today.

**Call sites:**
- `src/workflow/review/types.ts`
- `src/workflow/review/verify.ts`
- `src/workflow/review/resolve.ts`

### 3.4 `ReviewReport` — field-add

Optional `template` (the template id used) and `counts.unverified` (the number of could-not-verify findings). The rendered review section lists 'Does not hold' and 'Could not verify' as two separate lists, each labelled, and states that only the first blocks approval.

**Call sites:**
- `src/workflow/review/types.ts`
- `src/workflow/review/report.ts`
- `src/workflow/review/run-artifact.ts`

### 3.5 `Controller review surface (insrc_review_step)` — invariant-change

Today `start` always returns the extract prompt and the loop is start, claims, verdicts. For a design stage, `start` returns the template prompt with next `emit_findings`, and a new `findings` phase validates the answer with the same code as the session path and stamps the review. Other stages keep start, claims, verdicts.

**Call sites:**
- `src/mcp/review-step/phases/start.ts`
- `src/mcp/review-step/phases/claims.ts`
- `src/mcp/review-step/phases/verdicts.ts`
- `src/mcp/review-step/schema.ts`

### 3.6 `Old pipeline (non-design stages)` — invariant-change

Unchanged in behaviour for DEF and every other stage, except that the interim bound already in the working tree is kept and committed with this Story: at most 16 premises per review and no placeholder line anchors. This is what replaces the uncapped instruction for the kinds the template does not cover.

**Call sites:**
- `src/workflow/review/extract.ts`

## 4. Error paths

**Error cases**

- **The reviewer session's answer does not satisfy the template: an item is unanswered, more premises than the threshold, an invalid outcome, or a does-not-hold finding that names no file.** (recoverable)
  - Detection: The answer is validated by code against the template before anything is stamped.
  - Response: The session is run once more with the validation errors added to the prompt. If the second answer also fails, the review fails with those errors.
  - User impact: No review is stamped. The user sees which template rule the answer broke and can retry.
- **The reviewer session fails or runs past its time limit.** (recoverable)
  - Detection: The CLI exits non-zero, returns an error envelope, or the wall-clock limit kills it.
  - Response: The review fails with the cause. Nothing is stamped and no partial findings are kept.
  - User impact: The design has no review; the user retries.
- **The review provider cannot run a reviewer session (for example a local Ollama provider).** (recoverable)
  - Detection: The provider does not offer the session capability when a design stage is reviewed.
  - Response: The review fails at once with a message that a tool-capable reviewer is required. It does not fall back to the old pipeline.
  - User impact: The user points the review role at a CLI provider.
- **insrc analyze is not available inside the reviewer session (the insrc server is not registered with that CLI, or the daemon is down).** (recoverable)
  - Detection: The reviewer's tool call fails; the reviewer reports it in the affected findings.
  - Response: The review continues with file reads and search. A claim that needed analyze and could not be checked another way is reported as could-not-verify, with the reason.
  - User impact: The review completes; the user sees which findings were limited by the missing tool.

**Edge cases**

| Input | Expected |
| :--- | :--- |
| A design for which no ISSUE artifact exists (an Epic Story or a standalone feature). | The SPEC template is used. |
| A check item that does not apply to this design, such as Boundaries for a standalone Story. | The reviewer answers `not applicable` with a reason. That counts as answered and is not a finding. |
| A design with fewer checkable claims than the threshold. | The reviewer examines what there is. The threshold is a ceiling, not a quota. |
| A review with could-not-verify findings and no does-not-hold finding. | Verdict warn. The design is approvable, and the review section lists what could not be verified. |
| A review record written before this change, or a review of a DEF or any non-design artifact. | Findings carry no outcome. They are read, counted, resolved and gated exactly as today. |
| A does-not-hold finding the user resolves or overrides. | The existing per-finding resolution and the approval override work on it unchanged. |

**Invariants to preserve**

- A DEF and every other non-design artifact is reviewed by the existing extract, probe and verify pipeline. [[c1]]
- The approval gate blocks on the review's effective verdict and accepts per-finding resolutions and an override with a recorded reason. [[c2]]
- Review records written before this change stay readable and keep their verdict. [[c2]]
- One-shot calls on the CLI provider (complete, completeStructured) and the edit session behave as today. [[c3]]

## 5. Test strategy

**Test framework:** `node:test via `npx tsx --test` under Node 22`

**Test levels**

- **contract** — The Story lists no acceptance criteria, so they are defined here from the approved spec.
  - Subjects: `ac1: an HLD or LLD is reviewed against a fixed template chosen by intent; a design for an ISSUE gets the lower threshold and a design for a SPEC the higher one`, `ac2: the reviewer checks the items itself in one session with read access to the repo and insrc analyze; no pre-declared probes are run for a design review`, `ac3: every finding is identified as holds, does-not-hold or could-not-verify, and the two problem kinds are reported in separate labelled lists`, `ac4: only does-not-hold blocks approval; a review with only could-not-verify findings is approvable`, `ac5: a DEF and every non-design artifact is reviewed as today, and older review records read as today`
- **unit** — The templates and the validation of an answer.
  - Subjects: `T1 each template has an id, a threshold and its check items; the ISSUE threshold is lower than the SPEC threshold`, `T2 intent resolution: an ISSUE artifact for the design's epicHash gives `issue`; none gives `spec``, `T3 validation rejects an answer with an unanswered item, with more premises than the threshold, with an invalid outcome, or with a does-not-hold finding that names no file; it accepts `not applicable` with a reason and an answer under the threshold`, `T4 severity follows outcome: does-not-hold keeps HIGH or MED; holds and could-not-verify become LOW`
- **unit** — The verdict, the report and the gate.
  - Subjects: `T5 computeReviewVerdict: a does-not-hold finding gives block; only could-not-verify findings give warn; only holds gives pass; findings with no outcome give today's verdict`, `T6 the rendered review section lists 'Does not hold' and 'Could not verify' separately and says which one blocks`, `T7 approval: a design whose review has only could-not-verify findings is approved; one with an unresolved does-not-hold finding is refused; a resolution or an override approves it`, `T8 a review record written before this change keeps its verdict and its gate result`
  - Fixtures: `the existing gate and review-resolution test fixtures`
- **integration** — The review run, with the reviewer session faked.
  - Subjects: `T9 a design stage runs ONE reviewer session and makes no extract call, no probe and no per-premise call; the prompt carries the template for the resolved intent, the instruction to use insrc analyze for drill-down, and the design at the end`, `T10 an invalid first answer causes exactly one repeat carrying the validation errors; a second invalid answer fails the review and stamps nothing`, `T11 a session failure or timeout fails the review and stamps nothing; a provider with no session capability fails at once and the old pipeline is not run`, `T12 a DEF review still runs extract, probe and verify, bounded at 16 premises`, `T13 insrc_review_step on a design stage returns the template prompt with next emit_findings, and its findings phase validates and stamps with the same rules; on a DEF it still returns the extract prompt`
  - Fixtures: `a fake provider that records calls and returns a scripted session answer`
- **live** — The real CLI, gated behind INSRC_LIVE_TESTS.
  - Subjects: `T14 a reviewer session started in a fixture repo can read a file and call insrc analyze, cannot write a file, and returns an answer matching the schema`

**Acceptance mapping**

| Criterion | Proving tests |
| :--- | :--- |
| `ac1` | `T1`, `T2`, `T9` |
| `ac2` | `T9`, `T10`, `T11`, `T14` |
| `ac3` | `T3`, `T4`, `T6`, `T13` |
| `ac4` | `T5`, `T7` |
| `ac5` | `T8`, `T12`, `T13` |

## 6. Migration

**State before:** Every artifact kind is reviewed by one pipeline: an open instruction extracts premises, a separate engine runs each premise's pre-declared greps and one-line reads, and one model call per premise judges it from that output alone. An unverifiable premise is rated medium, the same as a minor defect, and blocks approval.

**State after:** An HLD or LLD is reviewed in one reviewer session against a fixed template chosen by the design's intent. The reviewer reads the code and uses insrc analyze itself. Findings are identified as holds, does-not-hold or could-not-verify, and only does-not-hold blocks approval. Every other artifact kind is reviewed by the old pipeline, now bounded at 16 premises.

**Zero downtime:** yes — **Data rewrite:** no

**Steps**

1. Add the optional outcome and item fields to a finding, the template id and the unverified count to a report, and the rule that sets severity from outcome; make the verdict warn when only could-not-verify findings exist; render the two lists separately. — ↩ rollbackable
2. Add the two templates as data, the intent resolution and the answer validation. — ↩ rollbackable
3. Add the read-only reviewer session to the CLI provider and confirm its flags with a live probe. — ↩ rollbackable
4. Route design stages in the review run to the template session; leave other stages on the old pipeline and keep the 16-premise bound there. — ↩ rollbackable
5. Give the controller review tool the template prompt and a findings phase for design stages. — ↩ rollbackable

**Backward compat:** No stored data is rewritten. The new fields are optional, so older review records and reviews of non-design artifacts read, resolve and gate as today. What changes for users: (1) a design review is one session and returns findings in two labelled lists; (2) a design can be approved with could-not-verify findings outstanding, where before they blocked; (3) a design review no longer edits the design automatically and no longer runs a second pass; (4) a design review needs a CLI reviewer, and fails with a clear message on a provider that cannot run a session; (5) insrc_review_step on a design returns emit_findings instead of emit_claims, so the installed MCP server and daemon must be updated together.

## 7. Alternatives considered

### 7.1 a1: One reviewer session per design, driven by a per-intent template — **CHOSEN**

For an HLD or LLD, the reviewer gets the template and the design, checks every item itself with file reads and insrc analyze, and returns all findings in one answer.

Two templates are defined as data: one for a design that answers an ISSUE, one for a design that answers a SPEC. Each lists its dimensions, its check items and its premise threshold. For design artifacts the three-stage pipeline (extract, pre-declared probes, one judge call per premise) is replaced by one reviewer session started in the repo with read-only tools and insrc analyze; the controller reviewer does the same in its own session. Each finding carries an outcome: holds, does not hold, or could not verify. Other artifact kinds keep today's pipeline.

### 7.2 a2: Keep the pipeline, make the template drive extraction and widen the probes

The template caps and shapes the premises; probes return a window of lines and search source only.

Keep extract, probe and judge. The template replaces the open extraction instruction, read probes return the cited line plus the following lines, greps skip docs, and the judge labels each finding as does not hold or could not verify.

**Rejected because:** Cheapest, but it keeps pre-declared probes run by a separate engine, which the spec lists as a non-goal.

### 7.3 a3: One reviewer session per check item

As a1, but each checklist item is checked in its own session.

The template is the same as in a1. Each check item starts a separate reviewer session with tools, and the findings are collected afterwards.

**Rejected because:** Meets the spec's decisions but restores the per-item model cost that the spec's background names as the first failure.

## 8. References

- **[[c1]]** `code` `src/workflow/review/review.ts:53` — "export async function runReview("
- **[[c2]]** `code` `src/workflow/gates.ts:562` — "export function approveArtifactByJsonPath(jsonPath: string, opts?: { readonly overrideReview?: string }): ApprovalResult {"
- **[[c3]]** `code` `src/agent/providers/cli-provider.ts:276` — "async runEditSession(prompt: string, opts: EditSessionOpts): Promise<LLMResponse> {"
- **[[c4]]** `prior-artifact` `SPEC-1bb064e8e2a1edd1`
- **[[c5]]** `code` `src/workflow/review/verify.ts:18` — " *   - MED  : unverifiable, a stale anchor, or non-material."
- **[[c6]]** `stakeholder` `user, 2026-10-05` — "the reviewer has access to the code base and all the relevant docs, should be able to fire their own probes"

## 9. Open questions

- Are the proposed check items and thresholds right? Proposed: 5 items and at most 8 premises for a design that answers an ISSUE; 8 items and at most 16 premises for a design that answers a SPEC. The spec left the numbers and items to this design, and they are the author's proposal, not yet confirmed by the user.
- Can the claude and codex CLIs return a schema-checked final answer from a run that also uses tools, with tools limited to reading and to the insrc analyze tools? This has not been tried; the build confirms it with a live probe before the session is relied on.
- What wall-clock limit should a reviewer session have? No such session has been timed.
