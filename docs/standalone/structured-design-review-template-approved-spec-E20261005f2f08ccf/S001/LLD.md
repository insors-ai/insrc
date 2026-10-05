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
- The whole design review has ONE deadline: the time limit for the design's complexity, and never more than 10 minutes. The first session, the one validation repeat and any retry after a transient CLI error all run inside that same deadline; none of them gets a fresh limit. When the deadline passes the running session is stopped and the review fails.
- The reviewer session is not wrapped in the provider's three-attempt transient retry the way the edit session is. A transient CLI error is retried at most once, and only inside the time that remains.

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

Two templates held as data in the review module, one per intent. Each has an id, a premise threshold, and an ordered list of check items grouped under dimensions. PROPOSED CONTENT, to be confirmed by the user. ISSUE template, threshold 8: (1) Fix targets the defect: the change addresses the root cause the ISSUE states and leaves out nothing from its fix intent. (2) Current behaviour: what the design says the code does today is true. (3) Change sites: the functions and files to change exist and the list is complete (callers, writers). (4) Preserved behaviour: each invariant the design promises to keep is real and the change does not break it. (5) Tests: each acceptance criterion has a test that would fail without the fix. SPEC template, threshold 16: (1) Coverage of intent: every decision or acceptance criterion upstream is designed, and no non-goal is built. (2) Current behaviour. (3) New versus reuse: what is called new does not already exist; what is reused exists with the stated shape. (4) Contracts and change sites: signatures, callers and inventories are complete. (5) Data and compatibility: stored shapes, older records, migration. (6) Boundaries: nothing owned by another Story or shared contract is redesigned (HLD and Epic stories). (7) Error paths: each failure is detectable and its handling is stated. (8) Tests: each acceptance criterion maps to a test. The threshold is the most premises (concrete claims) the reviewer examines across all items. Every item must be answered, with at least one premise or with `not applicable` and a reason. Code validates the answer: every item answered, premises within the threshold, every outcome valid, every does-not-hold finding naming the file it rests on. Each review also has a time limit set by the design's complexity, PROPOSED VALUES: 4 minutes for a design that answers an ISSUE; 6 minutes for a standalone feature design (the SPEC template, no Epic); 8 minutes for a design under an Epic (a DEF exists for its epicHash: the HLD and each Story's LLD). These limits apply to the whole review, not to each attempt. No design review may run longer than 10 minutes: that hard cap is fixed in code and no template value or setting can raise it.

**Call sites:**
- `src/workflow/review/extract.ts`
- `src/workflow/review/review.ts`

### 3.2 `Reviewer session` — new

A new capability on the CLI provider, beside runEditSession: start the CLI in the repo with read-only tools (file read, search) and the insrc analyze tools allowed, no edit permission, the time limit for the design's complexity (never more than the 10 minute hard cap), and a structured final answer. The prompt gives the template, then the instructions, then the design at the end. The instructions tell the reviewer to check each item against the real code and docs; to use insrc analyze for drill-down (how a module is built, whether a capability exists, who calls a symbol, whether code follows a documented rule); to read as much of a file as a claim needs; and never to mark something wrong because it did not look. The exact CLI flags for claude and codex are confirmed with a live probe during the build. The controller reviewer needs no session: insrc_review_step hands it the same template prompt for a design stage and it answers with its own tools.

**Call sites:**
- `src/agent/providers/cli-provider.ts`
- `src/mcp/review-step/phases/start.ts`
- `src/mcp/review-step/schema.ts`

### 3.3 `Finding` — field-add

Two optional fields. `outcome`: 'holds' | 'does-not-hold' | 'could-not-verify'. `item`: the id of the template check item the finding answers. For a template finding, severity is set from the outcome so every existing reader keeps working: does-not-hold is HIGH or MED as the reviewer judges how much it breaks, and both block; holds and could-not-verify are LOW and never block. A could-not-verify finding must say what the reviewer tried and what was missing. Findings from the old pipeline carry neither field and are read exactly as today. A template finding carries fixability `manual` when it does not hold or could not be verified. A `holds` result is recorded for the count and the report but is not listed among the findings that need a human.

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

Today `start` always returns the extract prompt and the loop is start, claims, verdicts. For a design stage, `start` returns the template prompt with next `emit_findings`, and a new `findings` phase validates the answer with the same code as the session path and stamps the review. Other stages keep start, claims, verdicts. The phase list is declared in more places than the phase files, and all of them change: the tool registration and its input validation in src/mcp/server.ts (the `phases` list and the `phase` enum), the phase type in src/mcp/review-step/types.ts, and the dispatch in src/mcp/review-step/handler.ts.

**Call sites:**
- `src/mcp/review-step/phases/start.ts`
- `src/mcp/review-step/phases/claims.ts`
- `src/mcp/review-step/phases/verdicts.ts`
- `src/mcp/review-step/schema.ts`
- `src/mcp/server.ts`
- `src/mcp/review-step/types.ts`
- `src/mcp/review-step/handler.ts`

## 4. Error paths

**Error cases**

- **The reviewer session's answer does not satisfy the template: an item is unanswered, more premises than the threshold, an invalid outcome, or a does-not-hold finding that names no file.** (recoverable)
  - Detection: The answer is validated by code against the template before anything is stamped.
  - Response: The session is run once more with the validation errors added to the prompt. If the second answer also fails, the review fails with those errors.
  - User impact: No review is stamped. The user sees which template rule the answer broke and can retry.
- **The reviewer session fails, or the review passes its deadline.** (recoverable)
  - Detection: The CLI exits non-zero or returns an error envelope; or the review's single deadline, counted from the start of the first session, passes.
  - Response: The session is stopped. The review fails with the cause, and for a timeout the message gives the limit that applied (4, 6 or 8 minutes). Nothing is stamped and no partial findings are kept.
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
| A time limit above 10 minutes is configured or passed in. | It is reduced to 10 minutes. The hard cap cannot be raised. |

**Invariants to preserve**

- A DEF, an ISSUE and every other non-design artifact is reviewed by the existing extract, probe and verify pipeline, with its prompt and its limits unchanged. [[c1]]
- The approval gate blocks on the review's effective verdict and accepts per-finding resolutions and an override with a recorded reason. [[c2]]
- Review records written before this change stay readable and keep their verdict. [[c2]]
- One-shot calls on the CLI provider (complete, completeStructured) and the edit session behave as today. [[c3]]

## 5. Test strategy

**Test framework:** `node:test via `npx tsx --test` under Node 22`

**Test levels**

- **contract** — The Story lists no acceptance criteria, so they are defined here from the approved spec.
  - Subjects: `ac1: an HLD or LLD is reviewed against a fixed template chosen by intent; a design for an ISSUE gets the lower threshold and a design for a SPEC the higher one`, `ac2: the reviewer checks the items itself in one session with read access to the repo and insrc analyze; no pre-declared probes are run for a design review`, `ac3: every finding is identified as holds, does-not-hold or could-not-verify, and the two problem kinds are reported in separate labelled lists`, `ac4: only does-not-hold blocks approval; a review with only could-not-verify findings is approvable`, `ac5: a DEF and every non-design artifact is reviewed as today, and older review records read as today`
- **unit** — The templates and the validation of an answer.
  - Subjects: `T1 each template has an id, a threshold and its check items; the ISSUE threshold is lower than the SPEC threshold`, `T2 intent resolution: an ISSUE artifact for the design's epicHash gives `issue`; none gives `spec``, `T3 validation rejects an answer with an unanswered item, with more premises than the threshold, with an invalid outcome, or with a does-not-hold finding that names no file; it accepts `not applicable` with a reason and an answer under the threshold`, `T4 severity follows outcome: does-not-hold keeps HIGH or MED; holds and could-not-verify become LOW`, `T15 deadline by complexity: an ISSUE design gets 4 minutes, a standalone feature design 6, a design under an Epic 8; any requested limit above 10 minutes is reduced to 10`
- **unit** — The verdict, the report and the gate.
  - Subjects: `T5 computeReviewVerdict: a does-not-hold finding gives block; only could-not-verify findings give warn; only holds gives pass; findings with no outcome give today's verdict`, `T6 the rendered review section lists 'Does not hold' and 'Could not verify' separately and says which one blocks`, `T7 approval: a design whose review has only could-not-verify findings is approved; one with an unresolved does-not-hold finding is refused; a resolution or an override approves it`, `T8 a review record written before this change keeps its verdict and its gate result`, `T17 the findings that need a human are the does-not-hold and could-not-verify ones; a holds result is not among them`
  - Fixtures: `the existing gate and review-resolution test fixtures`
- **integration** — The review run, with the reviewer session faked.
  - Subjects: `T9 a design stage runs ONE reviewer session and makes no extract call, no probe and no per-premise call; the prompt carries the template for the resolved intent, the instruction to use insrc analyze for drill-down, and the design at the end`, `T10 an invalid first answer causes exactly one repeat carrying the validation errors; a second invalid answer fails the review and stamps nothing`, `T11 a session failure or timeout fails the review and stamps nothing; a provider with no session capability fails at once and the old pipeline is not run`, `T12 a DEF review and an ISSUE review still run extract, probe and verify and send the same extraction prompt as before this change, byte for byte`, `T13 insrc_review_step on a design stage returns the template prompt with next emit_findings, and its findings phase validates and stamps with the same rules; on a DEF it still returns the extract prompt; the registered tool accepts phase `findings` and its phase list names it`, `T16 one deadline for the whole review: a validation repeat and a transient-error retry are each started with only the time that remains, a transient error is retried at most once, and a review whose deadline passes fails with a message naming the limit and stamps nothing`
  - Fixtures: `a fake provider that records calls and returns a scripted session answer`
- **live** — The real CLI, gated behind INSRC_LIVE_TESTS.
  - Subjects: `T14 a reviewer session started in a fixture repo can read a file and call insrc analyze, cannot write a file, and returns an answer matching the schema`

**Acceptance mapping**

| Criterion | Proving tests |
| :--- | :--- |
| `ac1` | `T1`, `T2`, `T9`, `T15` |
| `ac2` | `T9`, `T10`, `T11`, `T14`, `T16` |
| `ac3` | `T3`, `T4`, `T6`, `T13`, `T17` |
| `ac4` | `T5`, `T7` |
| `ac5` | `T8`, `T12`, `T13` |

## 6. Migration

**State before:** Every artifact kind is reviewed by one pipeline: an open instruction extracts premises, a separate engine runs each premise's pre-declared greps and one-line reads, and one model call per premise judges it from that output alone. An unverifiable premise is rated medium, the same as a minor defect, and blocks approval.

**State after:** An HLD or LLD is reviewed in one reviewer session against a fixed template chosen by the design's intent. The reviewer reads the code and uses insrc analyze itself. Findings are identified as holds, does-not-hold or could-not-verify, and only does-not-hold blocks approval. Every other artifact kind, including a DEF and an ISSUE, is reviewed exactly as before: this Story does not touch that pipeline.

**Zero downtime:** yes — **Data rewrite:** no

**Steps**

1. Add the optional outcome and item fields to a finding, the template id and the unverified count to a report, and the rule that sets severity from outcome; make the verdict warn when only could-not-verify findings exist; render the two lists separately. — ↩ rollbackable
2. Add the two templates as data, the intent resolution and the answer validation. — ↩ rollbackable
3. Add the read-only reviewer session to the CLI provider and confirm its flags with a live probe. — ↩ rollbackable
4. Route design stages in the review run to the template session; leave every other stage on the existing pipeline, unchanged. — ↩ rollbackable
5. Give the controller review tool the template prompt and a findings phase for design stages. — ↩ rollbackable

**Backward compat:** No stored data is rewritten. The new fields are optional, so older review records read, resolve and gate as today, and reviews of a DEF, an ISSUE or any other non-design artifact are not changed in any way. What changes for users: (1) a design review is one session and returns findings in two labelled lists; (2) a design can be approved with could-not-verify findings outstanding, where before they blocked; (3) a design review no longer edits the design automatically and no longer runs a second pass; (4) a design review needs a CLI reviewer, and fails with a clear message on a provider that cannot run a session; (5) insrc_review_step on a design returns emit_findings instead of emit_claims, so the installed MCP server and daemon must be updated together.

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
- **[[c7]]** `stakeholder` `user, 2026-10-05` — "cap at rational values for ISSUES vs EPICS, should be dependent on the complexity. Hard cap at 10 mins"
- **[[c8]]** `stakeholder` `user, 2026-10-05` — "should not touch the DEF/ISSUE reviews"

## 9. Open questions

- Are the proposed check items and thresholds right? Proposed: 5 items and at most 8 premises for a design that answers an ISSUE; 8 items and at most 16 premises for a design that answers a SPEC. The spec left the numbers and items to this design, and they are the author's proposal, not yet confirmed by the user.
- Can the claude and codex CLIs return a schema-checked final answer from a run that also uses tools, with tools limited to reading and to the insrc analyze tools? This has not been tried; the build confirms it with a live probe before the session is relied on.
- Are the proposed time limits right: 4 minutes for an ISSUE design, 6 for a standalone feature design, 8 for a design under an Epic? The user fixed the hard cap at 10 minutes and asked for rational values by complexity; the three values are the author's proposal, and no reviewer session has been timed yet.

<!-- insrc:review -->

## Review

### ✅ Review `PASS` — design.story (design.story)

**0 HIGH · 0 MED · 15 LOW** · model `client` · reviewed 2026-10-05T06:37:44.630Z

| Ref | Kind | Severity | Fixability | Premise | Evidence | Action |
| --- | --- | --- | --- | --- | --- | --- |
| item1-coverage | cross-artifact | LOW | manual | Each of the five decisions in SPEC-1bb064e8e2a1edd1 is designed: a fixed per-kind checklist with dimensions and threshold, kind chosen by the design's intent, the reviewer firing its own probes and using insrc analyze, findings identified as does-not-hold or could-not-verify with only the first blocking, and scope limited to the design review flow. | HOLDS. Read against SPEC-1bb064e8e2a1edd1 (SPEC.md:1 carries its marker): section 3.1 gives a fixed checklist per kind with dimensions and a threshold; 2.2 chooses the kind by intent; 3.2 has the reviewer check the items itself and names insrc analyze for drill-down; 3.3 and 3.4 identify findings by outcome and 2.4/2.5 let only does-not-hold block; 2.1 limits the template to design stages. | None. |
| item1-coverage | cross-artifact | LOW | manual | The design builds none of the spec's non-goals: a DEF review and an ISSUE review are not changed, and the extraction prompt in src/workflow/review/extract.ts is left as it is. | HOLDS. The design no longer changes the old pipeline: the 'Old pipeline' entry is gone, migration step 4 leaves every other stage unchanged, invariant c1 names DEF and ISSUE, and T12 requires the same extraction prompt byte for byte. In the source, grep MAX_PREMISES returns 0 matches and src/workflow/review/extract.ts:90 is no longer the cap constant, so the interim cap is out of the working tree as well. | None. |
| item2-current-behaviour | ordering | LOW | manual | runReview at src/workflow/review/review.ts:53 runs extractClaims, then gatherEvidence, then one verifyClaim call per claim, for every artifact stage. | HOLDS. src/workflow/review/review.ts:53 declares runReview; :63 calls extractClaims, :67 gatherEvidence, :75 `findings.push(await verifyClaim(claim, ev, provider, signal))`. | None. |
| item2-current-behaviour | semantic | LOW | manual | Today an unverifiable premise is rated MED (src/workflow/review/verify.ts:18) and the default block list is HIGH and MED (src/workflow/review/review.ts:47). | HOLDS. src/workflow/review/verify.ts:18 reads ' *   - MED  : unverifiable, a stale anchor, or non-material.' and src/workflow/review/review.ts:47 reads `const DEFAULT_BLOCK_ON: readonly Severity[] = ['HIGH', 'MED'];`. | None. |
| item2-current-behaviour | semantic | LOW | manual | effectiveReviewVerdict at src/workflow/review/resolve.ts:57 decides only from each finding's severity and its resolution. | HOLDS. src/workflow/review/resolve.ts:62 `const unresolvedBlocking = report.findings.some(f => BLOCKING.has(f.severity) && res[f.claimId] === undefined);` reads only severity and the resolutions. The function returns block or pass, never warn, so the new warn verdict shows on the stored report only. | None required. |
| item2-current-behaviour | citation | LOW | manual | runEditSession at src/agent/providers/cli-provider.ts:276 is an existing session that runs the CLI in the repo with edit permission and is wrapped in the provider's transient retry. | HOLDS. src/agent/providers/cli-provider.ts:276 declares runEditSession, :277 wraps it in `this.withTransientRetry('runEditSession', ...)`, and :280 passes `--permission-mode acceptEdits`. | None. |
| item2-current-behaviour | citation | LOW | manual | insrc_review_step's start phase returns the extract prompt with next emit_claims (src/mcp/review-step/phases/start.ts:63) for every stage. | HOLDS. src/mcp/review-step/phases/start.ts:59 `const prompt = buildExtractPrompt(markdown, stage);` and :63 `next: 'emit_claims',`. | None. |
| item3-new-vs-reuse | closed-union | LOW | manual | None of the things the design calls new exists today in the review module, the review-step tool or the CLI provider: no emit_findings step, no reviewer session and no could-not-verify outcome. | HOLDS. grep for emit_findings, runReviewSession and could-not-verify returned 14 matches, every one in this design's own LLD.md and none under src/. | None. |
| item4-change-sites | inventory | LOW | manual | The phase list of insrc_review_step is declared in src/mcp/server.ts (two sites), src/mcp/review-step/types.ts and src/mcp/review-step/handler.ts, and the design lists all of them as change sites for the findings phase. | HOLDS. The grep finds the phase list at src/mcp/server.ts:98 and :635, src/mcp/review-step/types.ts:25 and src/mcp/review-step/handler.ts:63, and section 3.5 now lists server.ts, types.ts and handler.ts. One more hit is a test that pins the list, src/mcp/__tests__/schema-registry.test.ts:48 (`insrc_review_step: ['start', 'claims', 'verdicts'],`); it is not a production change site but it will fail until it is updated. | When planning, include updating src/mcp/__tests__/schema-registry.test.ts:48 alongside T13. |
| item4-change-sites | inventory | LOW | manual | Setting a template finding's severity from its outcome keeps the existing readers of the review record working, and the one reader that selects by fixability (pendingUserFindings, src/workflow/review/apply.ts:86) is covered by the stated fixability rule. | HOLDS. src/workflow/review/report.ts:41 sorts by severity and src/workflow/artifact-content.ts:237 builds its head from counts.high and counts.med, so both work with could-not-verify and holds at LOW. src/workflow/review/apply.ts:89 selects `f.fixability === 'assisted' \|\| f.fixability === 'manual'`; section 3.3 now states the fixability of template findings and that a holds result is not listed as needing a human, with test T17. | None. |
| item5-data-compat | semantic | LOW | manual | Adding optional fields to Finding and to ReviewReport leaves stored review records readable. | HOLDS. src/workflow/review/types.ts:134 `export interface ReviewReport {` is a plain interface; the controller's earlier search of src/workflow found no validation of the stored record, which is read with a type cast. That search covered the fields in use, not every schema file. | None. |
| item7-error-paths | semantic | LOW | manual | One deadline of at most 10 minutes for the whole design review is achievable on the CLI provider: the subprocess runner takes a per-call time limit, and the design keeps the reviewer session out of the three-attempt transient retry. | HOLDS. The subprocess runner takes a per-call limit (src/agent/providers/cli-provider.ts:464 `timeoutMs: number,`, passed at :336), so each attempt can be started with the time that remains. The three-attempt retry (:153 `const maxAttempts = 3;`) is something the design now explicitly keeps the reviewer session out of, allowing one retry inside the remaining time. Section 2.1 states one deadline of at most 10 minutes for the whole review, and T16 tests it. The runner's own single re-spawn (lines 468-471, read by the controller) only fires when the spawn itself fails with ENOENT, so it adds no review time. | None. |
| item7-error-paths | citation | LOW | manual | A provider that cannot run a session can be told apart from one that can, as the build stage already does through a structural interface at src/mcp/build-step/phases/validate.ts:34. | HOLDS. src/mcp/build-step/phases/validate.ts:34 declares `runEditSession(prompt: string, opts: { cwd: string; timeoutMs?: number \| undefined }): Promise<{ text: string }>;` as a structural interface the build stage resolves a provider against. | None. |
| item7-error-paths | external-contract | LOW | manual | The claude and codex CLIs can run with tools limited to reading and the insrc analyze tools and still return a schema-checked final answer in the same run. | COULD NOT VERIFY. Tried: read the structured call (src/agent/providers/cli-provider.ts:209 completeStructuredOnce, :217 `'--print',`) and the edit session. The first returns schema-checked output with no tools; the second uses tools and returns free text. Nothing in the repo runs a CLI with tools AND a schema-checked answer, or limits tools to reading plus insrc analyze. Missing: a live run of each CLI with those flags. The design lists this as an open question with a build-time probe (T14). | Run the live probe first in the build. If a CLI cannot do both in one run, state the fallback (for example a fenced JSON answer that is parsed and validated) before building the rest on it. |
| item8-tests | inventory | LOW | manual | Every acceptance criterion ac1 to ac5 maps to at least one test, every cited test T1 to T17 is defined, and no defined test is unmapped. | HOLDS. Computed from the artifact json after the amendment: 17 tests defined (T1 to T17), none cited that is undefined, none defined that is unmapped; ac1 to ac5 each have at least two proving tests. The tool's read (LLD.md:1) only confirms the artifact marker. | None. |
