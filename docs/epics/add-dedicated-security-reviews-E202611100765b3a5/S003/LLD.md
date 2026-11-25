<!-- insrc:artifact LLD-0765b3a578e43eec-s3 -->

# LLD: STORY-0765b3a578e43eec-s3 — Run and report a security-only review

## Summary

**Epic:** `add-dedicated-security-reviews`
**HLD base run:** `wf-1795324517306-yi2irl`
**HLD effective hash:** `4da1f568aafd...`
**Tracker:** [insors-ai/insrc#228](https://github.com/insors-ai/insrc/issues/228)

This amendment restores the concrete capabilityPolicy design the user mandated after finding the codex gap: s3's security code pass must run only under a provider that can enforce a declared, fail-closed capability policy, never a silently weaker guarantee. It adds an optional capabilityPolicy field to the shared ReadOnlySessionOpts contract both CLI and Ollama providers implement, a qualification table naming which providers can enforce the strict policy today, and a new error that rejects an unqualified provider before any inference starts.

## Contents

1. [Epic impact analysis](#1-epic-impact-analysis)
2. [HLD context](#2-hld-context)
3. [Contract details](#3-contract-details)
4. [Data model changes](#4-data-model-changes)
5. [Interaction with shared contracts](#5-interaction-with-shared-contracts)
6. [Error paths](#6-error-paths)
7. [Test strategy](#7-test-strategy)
8. [Alternatives considered](#8-alternatives-considered)
9. [References](#9-references)

## 1. Epic impact analysis

**Stories covered:** `s1`, `s2`

Unchanged from prior amendments: s1's SecurityModelSelection resolution (src/config/role-taxonomy.ts) and s2's dependency-advisory collection (src/workflow/security-review/collect-dependency-advisories.ts) are both untouched by this amendment. This amendment only restores the concrete capabilityPolicy design that was lost from revision 6/7's contractDetails -- it adds no new consumption of s1's or s2's contracts beyond what the already-approved LLD already specifies (s1's SecurityModelSelection.provider field is read, unchanged, to know which qualification-table entry applies).

**Sources:**
- /home/subho/work/dev/insors/insrc/.insrc/artifacts/BUILD-0765b3a578e43eec-s1.json
- /home/subho/work/dev/insors/insrc/.insrc/artifacts/BUILD-0765b3a578e43eec-s2.json
- /home/subho/work/dev/insors/insrc/.insrc/artifacts/LLD-0765b3a578e43eec-s3.json
- /home/subho/work/dev/insors/insrc/.insrc/artifacts/AMD-0765b3a578e43eec-1.json

## 2. HLD context

> See **HLD-0765b3a578e43eec** § 2. Framework summary

**Rollout phase:** Phase B -- run and report the security-only review
**Owns:** `sc3` (SecurityReviewEntryPoint)
**Consumes:** `sc1` (SecurityModelSelection), `sc2` (SecurityAdvisoryEvidence)

**Adjacent scope (owned by other stories — do NOT implement here):**
- `s1`: Model-tier resolution (extending src/config/role-taxonomy.ts with a security role), availability/credential checks, and the no-silent-fallback blocker-reporting logic stay private to s1; only the resolved SecurityModelSelection crosses its boundary. s1 must also specify the configuration contract for an INDEPENDENTLY selectable security-model binding (distinct from core/mid/cheap) and its interaction with coreFloor enforcement and unavailable-model handling; this is s1's central, still-open design question. — owns `sc1`
- `s2`: pkg_audit's package-manager resolution; s2 runs with the SAME host access as the controller itself -- no network or filesystem sandboxing is attempted (explicit user direction: constraining the reviewer degrades review accuracy). s2 instead RECORDS, per manager, which destination was actually reached and what was disclosed (observability for the final report, not a basis for refusal); the documented per-manager input/mode mapping (npm/pnpm/yarn/cargo: manifest+lockfile scope; pip/pipenv/poetry: the repository's own resolved environment, never the ambient active environment pip-audit defaults to; go: the repository's own module source directly, since govulncheck performs source-level analysis, not a manifest read) is retained as a CORRECTNESS/targeting requirement, with an explicit coverage gap for any manager s2 cannot correctly target under that mapping; and the advisory-match collection that populates SecurityAdvisoryEvidence (stamped with the pinned contentIdentity, computed by hashing the complete required input set's actual bytes directly) stay private to s2. No model, tool-loop, or CLI session is involved in s2 at all. ac2's gap-reporting distinguishes a SUCCESSFUL audit that found vulnerabilities (a valid, parseable result regardless of exit code -- pkg_audit's own auditArgv already marks every supported manager nonZeroOk:true) from an EXECUTION GAP (spawn failure, unparseable output, an unsupported manager, or a manager s2's input/mode mapping cannot correctly target) -- these are never conflated. — owns `sc2`

## 3. Contract details

**Surface level:** internal-shared

### 3.1 `runSecurityReview`

```typescript
function runSecurityReview(request: SecurityReviewStepRequest): Promise<SecurityReviewStepResponse>
```

**Parameters:**
- `request: SecurityReviewStepRequest` — The insrc_security_review_step phase='start' request.

**Returns:** `Promise<SecurityReviewStepResponse>` — Either a confirm_wait pause or the terminal done response carrying the SecurityReviewReport.

**Errors:**
- `UnqualifiedCapabilityPolicyError` when s1's resolved provider is not on the qualification table for strict-read-analyze; propagates out of runSecurityReview unchanged, surfaced to the caller as the review's own failure rather than a silently weaker or substituted review.

**Preconditions:**
- s1's SecurityModelSelection and s2's SecurityAdvisoryEvidence are both available for the pinned contentIdentity.

**Postconditions:**
- The code-vulnerability pass is dispatched through CliProvider.runReadOnlySession with capabilityPolicy:'strict-read-analyze'; a qualified provider runs normally, an unqualified one never starts inference.

## 4. Data model changes

### 4.1 `ReadOnlySessionOpts` — field-add

Adds `readonly capabilityPolicy?: 'write-sandboxed' | 'strict-read-analyze'` to the shared interface both CliProvider and OllamaProvider implement. Omitted (undefined) is equivalent to 'write-sandboxed', the existing behavior every current caller keeps unchanged. 'strict-read-analyze' is the policy s3's security code pass requests on its one call site; no other caller in the codebase sets it today.

```
export interface ReadOnlySessionOpts {
  readonly mode?: 'bounded' | undefined;
  readonly connectionExecution?: ConnectionExecutionContext | undefined;
  readonly cwd: string;
  readonly deadlineMs: number;
  readonly internalRetry?: boolean | undefined;
  readonly stallMs?: number | undefined;
  readonly signal?: AbortSignal | undefined;
+ readonly capabilityPolicy?: 'write-sandboxed' | 'strict-read-analyze' | undefined;
}
```

**Call sites:**
- `src/shared/types.ts:244-259`
- `src/agent/providers/cli-provider.ts:715-752`
- `src/agent/providers/cli-provider.ts:760-843`
- `src/agent/providers/ollama.ts:783-823`
- `src/workflow/security-review/security-round-hooks.ts:51`

### 4.2 `UnqualifiedCapabilityPolicyError` — new

A new Error subclass thrown by a provider's runReadOnlySession BEFORE building session args or spawning any CLI subprocess, when opts.capabilityPolicy==='strict-read-analyze' is requested but the dispatched provider is not on the qualification table for that policy. The message names the provider (e.g. 'cli-codex') and the missing capability so the failure is actionable, not generic. It is never caught and silently downgraded to a weaker policy or a different provider/model than the one SecurityModelSelection pinned -- it propagates to the caller as the review's own failure. The existing unsafe-MCP-server retry loop inside CliProvider.readOnlySessionOnce must not retry past this error: the qualification check runs once, before the retry loop even starts, so no retry attempt can run with capabilityPolicy silently dropped.

**Call sites:**
- `src/agent/providers/cli-provider.ts:715-752`
- `src/agent/providers/cli-provider.ts:760-843`

### 4.3 `CapabilityQualificationTable` — new

A small, hardcoded lookup (new file src/agent/providers/capability-qualification.ts) mapping a provider kind to whether it is qualified for 'strict-read-analyze' today: 'cli-claude' is qualified (claudeReadOnlySessionArgs already builds a real --tools/--allowedTools declarative allowlist restricting native built-in tools, src/agent/providers/cli-provider.ts:126-129); 'cli-codex' is NOT qualified (codexReadOnlySessionArgs only sets --sandbox read-only plus per-MCP-server enable/disable, src/agent/providers/cli-provider.ts:267-280 -- no native built-in-tool restriction exists for codex at all, so it cannot enforce the strict policy); 'ollama' is qualified trivially (OllamaProvider.runReadOnlySession performs no native tool-calling in this mode at all, so there is no tool surface to restrict). The table is a static today-only allow/deny list, not a live capability probe -- qualifying codex by investigating its native-tool-disable flags and verifying them by real behavioral testing, tied to CLI version + effective config and requalified on upgrade, is explicitly deferred future work, not built by this amendment.

**Call sites:**
- `src/agent/providers/cli-provider.ts:715-752`
- `src/agent/providers/cli-provider.ts:126-129`
- `src/agent/providers/cli-provider.ts:267-280`

## 5. Interaction with shared contracts

| Contract | Role | How |
| :--- | :--- | :--- |
| `sc3` | implements | sc3's SecurityReviewEntryPoint shape is unchanged; runSecurityReview's new UnqualifiedCapabilityPolicyError path surfaces as the review's own failure, documented on the API entry above. |
| `sc1` | consumes | s3 reads SecurityModelSelection.provider (unchanged shape) to know which CapabilityQualificationTable entry governs the dispatch; s1's contract itself is not modified. |
| `sc2` | consumes | Unaffected by this amendment; s3 still consumes SecurityAdvisoryEvidence exactly as the approved LLD already specifies, with no interaction with the capabilityPolicy mechanism. |

## 6. Error paths

**Error cases**

- **s1's SecurityModelSelection pins provider:'cli-codex' and runSecurityCodePass requests capabilityPolicy:'strict-read-analyze'.** (terminal)
  - Detection: CliProvider.runReadOnlySession checks the CapabilityQualificationTable for the dispatched provider before building codexReadOnlySessionArgs or spawning any subprocess; 'cli-codex' is not on the qualified list for 'strict-read-analyze'.
  - Response: Throws UnqualifiedCapabilityPolicyError naming 'cli-codex' and 'strict-read-analyze' before any inference starts; no subprocess is spawned, no partial session args are built, no retry is attempted.
  - User impact: The security review fails with an actionable error identifying exactly which provider/policy combination is unqualified, instead of silently running an unenforced review or silently substituting a different provider/model than the one s1 pinned.
- **The unsafe-MCP-server retry loop inside CliProvider.readOnlySessionOnce would otherwise retry a transient failure after a strict-read-analyze session has already started.** (recoverable)
  - Detection: The qualification check happens once, before readOnlySessionOnce's retry loop is entered at all -- there is no code path inside the retry loop that re-evaluates or drops capabilityPolicy, since it is read once from the original opts and passed through unchanged on every attempt.
  - Response: Every retry attempt (if any) carries the identical capabilityPolicy value as the first attempt; a provider that was qualified on attempt 1 cannot become unqualified mid-retry, and an unqualified provider never reaches the retry loop in the first place.
  - User impact: No observable difference to the user from the retry mechanics already built under Epic a9ae072ce3b7b794 -- this amendment only guarantees the policy itself is never weakened across retries.

**Edge cases**

| Input | Expected |
| :--- | :--- |
| capabilityPolicy is omitted entirely (every existing caller: the generic build-validate judge, and any future caller that does not request the strict policy). | Treated exactly as 'write-sandboxed' -- today's existing behavior, completely unchanged. No qualification check runs at all when capabilityPolicy is undefined. |
| s1's SecurityModelSelection pins provider:'ollama' (a locally-run model, not a CLI) with capabilityPolicy:'strict-read-analyze' requested. | Qualified trivially -- OllamaProvider.runReadOnlySession performs no native tool-calling in this mode at all, so there is no tool surface the strict policy could be violated by; the qualification table marks 'ollama' qualified and dispatch proceeds normally. |
| A future second caller (outside s3) sets capabilityPolicy:'strict-read-analyze' against 'cli-claude'. | Qualified -- claudeReadOnlySessionArgs already builds the real --tools/--allowedTools allowlist; the shared check passes for any caller, not just s3, since the guarantee lives in the shared ReadOnlySessionOpts contract rather than s3's own call site (the explicit reason a1 was chosen over a3 at s3). |

## 7. Test strategy

**Test framework:** `vitest`

**Test levels**

- **unit** — Verify the fail-closed qualification gate rejects an unqualified provider before any inference, and that a qualified provider dispatches unchanged.
  - Subjects: `CapabilityQualificationTable lookup for 'cli-claude' (qualified), 'cli-codex' (not qualified), 'ollama' (qualified trivially)`, `CliProvider.runReadOnlySession throwing UnqualifiedCapabilityPolicyError for an unqualified provider + capabilityPolicy:'strict-read-analyze' before spawning any subprocess`, `CliProvider.runReadOnlySession dispatching normally for a qualified provider + capabilityPolicy:'strict-read-analyze'`, `ReadOnlySessionOpts with capabilityPolicy omitted behaving identically to today (no qualification check runs)`
- **unit** — Verify capabilityPolicy is never dropped or weakened across the existing unsafe-MCP-server retry loop.
  - Subjects: `CliProvider.readOnlySessionOnce's retry attempts all carrying the identical capabilityPolicy value as the original call`

**Acceptance mapping**

| Criterion | Proving tests |
| :--- | :--- |
| `ac3` | `unit: CapabilityQualificationTable + CliProvider.runReadOnlySession fail-closed rejection of an unqualified provider under capabilityPolicy:'strict-read-analyze' (this amendment's own concrete test, carrying ac3's existing proof that the report shape itself -- SecurityFinding/VerificationReceipt -- is unaffected).` |

## 8. Alternatives considered

### 8.1 a1: Shared optional capabilityPolicy field + hardcoded qualification table + fail-closed error class — **CHOSEN**

Add an additive, optional `capabilityPolicy` field to ReadOnlySessionOpts; qualify providers via a small hardcoded table; reject unqualified providers before inference with a new error type.

Add `capabilityPolicy?: 'write-sandboxed' | 'strict-read-analyze'` to the shared ReadOnlySessionOpts interface (src/shared/types.ts), consumed identically by CliProvider and OllamaProvider. Add a new `UnqualifiedCapabilityPolicyError` class. Add a small qualification table (new file src/agent/providers/capability-qualification.ts) mapping provider kind -> whether it is qualified for 'strict-read-analyze' today: cli-claude qualified (real --tools/--allowedTools allowlist already exists), cli-codex NOT qualified (no native-tool restriction flag exists), ollama qualified trivially (no tool-calling surface in this mode at all). CliProvider.runReadOnlySession checks the table BEFORE building session args or spawning the CLI subprocess when opts.capabilityPolicy==='strict-read-analyze'; an unqualified provider throws UnqualifiedCapabilityPolicyError naming the provider and the missing capability, instead of spawning anything. The existing unsafe-MCP-server retry loop in readOnlySessionOnce is unchanged in its retry mechanics but must carry opts (including capabilityPolicy) unchanged into every retry attempt -- no code path drops it. runSecurityCodePass passes capabilityPolicy:'strict-read-analyze' on its one call site; the generic build-validate judge passes no capabilityPolicy at all (undefined is treated as 'write-sandboxed', today's existing behavior, so every other caller of runReadOnlySession is unaffected).

### 8.2 a2: Per-provider capabilityPolicy parameter plus a live self-test probe

Instead of a hardcoded table, run a live behavioral self-test (attempt a forbidden operation) on every strict-read-analyze request to verify qualification dynamically.

Same capabilityPolicy field and fail-closed error, but instead of a static table, CliProvider would spawn a lightweight preflight CLI invocation attempting a forbidden operation (shell exec, file write) and verifying it is refused, before every strict-read-analyze session, caching the result keyed by CLI version + effective config.

**Rejected because:** Satisfies every constraint as well as a1, but at L cost for a live-probe capability the user explicitly deferred as future work -- unnecessary scope for what this amendment needs to restore today.

### 8.3 a3: No new shared field; branch on provider kind directly inside runSecurityCodePass

Skip the shared ReadOnlySessionOpts change; have s3's own runSecurityCodePass inspect modelSelection.provider and refuse codex itself, without touching the provider layer at all.

runSecurityCodePass checks `if (modelSelection.provider === 'cli-codex') throw new Error(...)` before calling runReadOnlySession, with no change to ReadOnlySessionOpts, CliProvider, or OllamaProvider.

**Rejected because:** Cheapest, but does not satisfy the user's explicit mandate that the guarantee live in the shared ReadOnlySessionOpts contract, not just in one call site.

## 9. References

- **[[c1]]** `code` `src/shared/types.ts:244-259`
- **[[c2]]** `code` `src/agent/providers/cli-provider.ts:126-129`
- **[[c3]]** `code` `src/agent/providers/cli-provider.ts:267-280`
- **[[c4]]** `code` `src/agent/providers/cli-provider.ts:715-752`
- **[[c5]]** `code` `src/agent/providers/cli-provider.ts:760-843`
- **[[c6]]** `code` `src/agent/providers/ollama.ts:783-823`
- **[[c7]]** `code` `src/workflow/security-review/security-round-hooks.ts:62`

## Citations

- **[[c1]]** `code` `src/shared/types.ts:244-259`
- **[[c2]]** `code` `src/agent/providers/cli-provider.ts:126-129`
- **[[c3]]** `code` `src/agent/providers/cli-provider.ts:267-280`
- **[[c4]]** `code` `src/agent/providers/cli-provider.ts:715-752`
- **[[c5]]** `code` `src/agent/providers/cli-provider.ts:760-843`
- **[[c6]]** `code` `src/agent/providers/ollama.ts:783-823`
- **[[c7]]** `code` `src/workflow/security-review/security-round-hooks.ts:62`
