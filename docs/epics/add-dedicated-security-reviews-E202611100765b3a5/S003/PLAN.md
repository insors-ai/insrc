<!-- insrc:artifact PLAN-0765b3a578e43eec-s3 -->

# Plan: STORY-0765b3a578e43eec-s3

## Summary

**Epic:** `add-dedicated-security-reviews`
**LLD run:** `wf-1795614445720-3htwai`
**LLD effective hash:** `4da1f568aafd...`

Re-planning s3 after the capabilityPolicy amendment widens only Task t2: the shared provider layer gains a fail-closed capability-policy gate (an additive ReadOnlySessionOpts field, a small qualification table, and a new error that rejects an unqualified provider before any inference starts), and s3's own security code-pass dispatch is updated to request the strict policy. Every other Task (t1, t3-t6) is unchanged from the already-built, already-passed prior plan.

## Contents

1. [Epic impact analysis](#1-epic-impact-analysis)
2. [Tasks](#2-tasks)
3. [Test-strategy coverage](#3-test-strategy-coverage)
4. [References](#4-references)

## 1. Epic impact analysis

**Stories covered:** `s1`, `s2`

Unchanged: s1's SecurityModelSelection and s2's dependency-advisory collection are untouched by this re-plan. The widened t2 only touches the shared provider layer (src/agent/providers/) and s3's own security-round-hooks.ts call site.

**Sources:**
- /home/subho/work/dev/insors/insrc/.insrc/artifacts/BUILD-0765b3a578e43eec-s1.json
- /home/subho/work/dev/insors/insrc/.insrc/artifacts/BUILD-0765b3a578e43eec-s2.json
- /home/subho/work/dev/insors/insrc/.insrc/artifacts/BUILD-0765b3a578e43eec-s3.json
- /home/subho/work/dev/insors/insrc/.insrc/artifacts/LLD-0765b3a578e43eec-s3.json

## 2. Tasks

| # | Task | Size | Status | Depends on | Tests | Derived from |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| 1 | **`t1`** Implement deriveReceiptIdentity, verifyContentIdentityMatch, and s3's new error/report types | S | approved r1 | — | unit: Already covered by the prior BUILD record's test run; no new test required by this re-plan. | [[c4]] |
| 2 | **`t2`** Implement the capabilityPolicy fail-closed gate, then buildSecurityRoundHooks and runSecurityCodePass | M | approved r1 | — | unit: CapabilityQualificationTable lookup for 'cli-claude' (qualified), 'cli-codex' (not qualified), 'ollama' (qualified trivially); unit: CliProvider.runReadOnlySession throwing UnqualifiedCapabilityPolicyError for an unqualified provider + capabilityPolicy:'strict-read-analyze' before spawning any subprocess; unit: CliProvider.runReadOnlySession dispatching normally for a qualified provider + capabilityPolicy:'strict-read-analyze'; unit: ReadOnlySessionOpts with capabilityPolicy omitted behaving identically to today (no qualification check runs); unit: CliProvider.readOnlySessionOnce's retry attempts all carrying the identical capabilityPolicy value as the original call | [[c1]] [[c2]] [[c3]] [[c5]] |
| 3 | **`t3`** Implement assembleSecurityReport | S | approved r1 | `t1`, `t2` | unit: Already covered by the prior BUILD record's test run; no new test required by this re-plan. | [[c4]] |
| 4 | **`t4`** Implement runSecurityReview | S | approved r1 | `t3` | unit: Already covered by the prior BUILD record's test run; no new test required by this re-plan. | [[c6]] |
| 5 | **`t5`** Implement handleSecurityReviewStep + SecurityReviewStepRequest/Response types | S | approved r1 | `t4` | unit: Already covered by the prior BUILD record's test run; no new test required by this re-plan. | [[c6]] |
| 6 | **`t6`** Register the insrc_security_review_step daemon IPC method + MCP tool (sc3) | S | approved r1 | `t5` | unit: Already covered by the prior BUILD record's test run; no new test required by this re-plan. | [[c6]] |

### 2.1 TASK-0765b3a578e43eec-s3-t1 — Implement deriveReceiptIdentity, verifyContentIdentityMatch, and s3's new error/report types

Unchanged from the prior plan (already built, passed:true in BUILD-0765b3a578e43eec-s3.json) -- carried forward as-is.

**Acceptance checks:**
- Already satisfied per the prior BUILD record; no change in this re-plan.

### 2.2 TASK-0765b3a578e43eec-s3-t2 — Implement the capabilityPolicy fail-closed gate, then buildSecurityRoundHooks and runSecurityCodePass

Widened by this amendment. Adds `capabilityPolicy?: 'write-sandboxed' | 'strict-read-analyze'` to the shared ReadOnlySessionOpts (src/shared/types.ts); adds a new CapabilityQualificationTable (new file src/agent/providers/capability-qualification.ts) marking cli-claude qualified, cli-codex not qualified, ollama qualified trivially for 'strict-read-analyze'; adds a new UnqualifiedCapabilityPolicyError thrown by CliProvider.runReadOnlySession/readOnlySessionOnce BEFORE building session args or spawning any subprocess when the dispatched provider is not qualified for the requested policy, with the existing retry loop carrying capabilityPolicy unchanged into every attempt; then implements runSecurityCodePass(repoPath, targets, modelSelection, round) dispatching via CliProvider.runReadOnlySession with capabilityPolicy:'strict-read-analyze' and READ_ONLY_SESSION_READ_TOOLS + READ_ONLY_SESSION_ANALYZE_TOOLS, returning structured SecurityFinding[]; and buildSecurityRoundHooks(repoPath, targets, modelSelection, reviewId) returning a RoundDriverHooks<SecurityFinding> with reviewKind:'code', checkpointGranularity:'round', ground:async()=>[] (a true no-op), and security bound to runSecurityCodePass.

**Acceptance checks:**
- ReadOnlySessionOpts carries an optional capabilityPolicy field; every existing caller that omits it keeps today's exact behavior (write-sandboxed).
- CapabilityQualificationTable correctly marks cli-claude qualified, cli-codex not qualified, ollama qualified, for 'strict-read-analyze'.
- CliProvider.runReadOnlySession throws UnqualifiedCapabilityPolicyError, naming the provider and the policy, BEFORE building session args or spawning any subprocess, for an unqualified provider requesting 'strict-read-analyze'.
- The existing unsafe-MCP-server retry loop in readOnlySessionOnce carries the identical capabilityPolicy value across every retry attempt -- no code path drops or widens it.
- buildSecurityRoundHooks's returned hooks.ground always resolves to [] without performing any I/O.
- buildSecurityRoundHooks's returned hooks.security delegates to runSecurityCodePass bound to the exact repoPath/targets/modelSelection/reviewId the factory was called with.
- runSecurityCodePass dispatches CliProvider.runReadOnlySession with capabilityPolicy:'strict-read-analyze', the pinned modelId from modelSelection, restricted to READ_ONLY_SESSION_READ_TOOLS + READ_ONLY_SESSION_ANALYZE_TOOLS.
- A ReadOnlySessionTimeoutError from runReadOnlySession propagates out of runSecurityCodePass unchanged, never internally retried.
- A pinned provider that fails qualification (e.g. cli-codex) causes runSecurityCodePass to propagate UnqualifiedCapabilityPolicyError unchanged, never silently substituting a different provider/model.

### 2.3 TASK-0765b3a578e43eec-s3-t3 — Implement assembleSecurityReport

Unchanged from the prior plan (already built, passed:true) -- carried forward as-is.

**Acceptance checks:**
- Already satisfied per the prior BUILD record; no change in this re-plan.

### 2.4 TASK-0765b3a578e43eec-s3-t4 — Implement runSecurityReview

Unchanged from the prior plan (already built, passed:true) -- carried forward as-is.

**Acceptance checks:**
- Already satisfied per the prior BUILD record; no change in this re-plan.

### 2.5 TASK-0765b3a578e43eec-s3-t5 — Implement handleSecurityReviewStep + SecurityReviewStepRequest/Response types

Unchanged from the prior plan (already built, passed:true) -- carried forward as-is.

**Acceptance checks:**
- Already satisfied per the prior BUILD record; no change in this re-plan.

### 2.6 TASK-0765b3a578e43eec-s3-t6 — Register the insrc_security_review_step daemon IPC method + MCP tool (sc3)

Unchanged from the prior plan (already built, passed:true) -- carried forward as-is.

**Acceptance checks:**
- Already satisfied per the prior BUILD record; no change in this re-plan.

## 3. Test-strategy coverage

| LLD strategy item | Covered by |
| :--- | :--- |
| CapabilityQualificationTable lookup for 'cli-claude' (qualified), 'cli-codex' (not qualified), 'ollama' (qualified trivially) | `t2` |
| CliProvider.runReadOnlySession throwing UnqualifiedCapabilityPolicyError for an unqualified provider + capabilityPolicy:'strict-read-analyze' before spawning any subprocess | `t2` |
| CliProvider.runReadOnlySession dispatching normally for a qualified provider + capabilityPolicy:'strict-read-analyze' | `t2` |
| ReadOnlySessionOpts with capabilityPolicy omitted behaving identically to today (no qualification check runs) | `t2` |
| CliProvider.readOnlySessionOnce's retry attempts all carrying the identical capabilityPolicy value as the original call | `t2` |

## 4. References

- **[[c1]]** `prior-artifact` `LLD s3 dataModelChanges: ReadOnlySessionOpts field-add capabilityPolicy`
- **[[c2]]** `prior-artifact` `LLD s3 dataModelChanges: UnqualifiedCapabilityPolicyError`
- **[[c3]]** `prior-artifact` `LLD s3 dataModelChanges: CapabilityQualificationTable`
- **[[c4]]** `prior-artifact` `LLD s3 contractDetails: runSecurityReview preconditions (unchanged, prior BUILD)`
- **[[c5]]** `prior-artifact` `LLD s3 contractDetails: runSecurityReview errors[UnqualifiedCapabilityPolicyError]`
- **[[c6]]** `prior-artifact` `LLD s3 interactionWithShared sc3 (unchanged, prior BUILD)`
