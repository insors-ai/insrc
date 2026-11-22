<!-- insrc:artifact LLD-0765b3a578e43eec-s1 -->

# LLD: STORY-0765b3a578e43eec-s1 — Configure a dedicated security model

## Summary

**Epic:** `add-dedicated-security-reviews`
**HLD base run:** `wf-1795324517306-yi2irl`
**HLD effective hash:** `60b05edbecc2...`

This Story lets an operator pin an explicit security-reviewer model (CLI family + model id) via new, global-only `models.security.*` catalog options, independent of the core/mid/cheap tiers every other reasoning site uses. A pure, synchronous selection step picks that pin -- or, when none is configured, the 'security.review' role's own tier-default model -- and rejects outright, with no substitution, a pin that is malformed, unlisted, or does not meet the role's coreFloor-required capability. Only a selection that survives that check proceeds to a bounded, asynchronous availability check against the real CLI backend; a review then either starts with the resolved model and records its identity, or the resolver reports the specific blocker (a malformed/below-floor pin, an unreachable backend, or a timed-out/cancelled check) without ever substituting a different model.

## Contents

1. [HLD context](#1-hld-context)
2. [Contract details](#2-contract-details)
3. [Data model changes](#3-data-model-changes)
4. [Interaction with shared contracts](#4-interaction-with-shared-contracts)
5. [Error paths](#5-error-paths)
6. [Test strategy](#6-test-strategy)
7. [Alternatives considered](#7-alternatives-considered)
8. [References](#8-references)

## 1. HLD context

> See **HLD-0765b3a578e43eec** § 2. Framework summary

**Rollout phase:** Phase A -- foundational contracts (model selection and enforced advisory collection)
**Owns:** `sc1` (SecurityModelSelection)

**Adjacent scope (owned by other stories — do NOT implement here):**
- `s2`: pkg_audit's package-manager resolution; the ENFORCED (not merely recorded) per-manager network boundary -- blocking any request to an unapproved destination before it leaves the process, including redirects and a tool's own secondary requests, and refusing to run a manager's audit at all when that enforcement cannot be established; the documented per-manager input/mode mapping (npm/pnpm/yarn/cargo: manifest+lockfile scope; pip/pipenv/poetry: an isolated environment resolved from the pinned manifest, never the ambient active environment pip-audit defaults to; go: a confined copy of the pinned snapshot's module source, since govulncheck performs source-level analysis, not a manifest read) with an explicit coverage gap for any manager s2 cannot correctly scope under that mapping; and the advisory-match collection that populates SecurityAdvisoryEvidence (stamped with the pinned contentIdentity) stay private to s2. No model, tool-loop, or CLI session is involved in s2 at all. ac2's gap-reporting distinguishes a SUCCESSFUL audit that found vulnerabilities (a valid, parseable result regardless of exit code -- pkg_audit's own auditArgv already marks every supported manager nonZeroOk:true) from an EXECUTION GAP (spawn failure, unparseable output, an unsupported manager, or a manager s2's input/mode mapping cannot correctly scope) -- these are never conflated. — owns `sc2`
- `s3`: The RoundDriverHooks.security adapter function; the CliProvider.runReadOnlySession dispatch of the code-vulnerability pass against the SAME pinned contentIdentity s2 collected against (recomputed/verified by s3, refusing on a mismatch), using s1's resolved model, under a backend REQUIRED to deny credential-location reads, out-of-scope reads and unauthorized MCP operations -- verified per backend by an actual negative-access test (not merely confirming a restricting flag was passed), with s3 refusing to dispatch through a backend that cannot be so verified; the exact per-provider mechanism is an s3 LLD decision, the three denials and the refuse-if-unverifiable rule are fixed here. The call into runReviewRound and the separate ownership of everything runReviewRound itself does NOT do (sandbox/mutation checkpoint execution, round reconciliation, VerificationReceipt persistence, and checkpoint cleanup); the mapping from the review's pinned contentIdentity onto the epicHash/storyId identity persistVerificationReceipt requires; and the assembly of SecurityFinding/SecurityEvidence plus a supplemental report structure stay private to s3. It consumes s1's SecurityModelSelection and s2's SecurityAdvisoryEvidence to produce that report.

## 2. Contract details

**Surface level:** internal-shared

### 2.1 `resolveSecurityModelCandidate`

```typescript
function resolveSecurityModelCandidate(cfg: AnalyzeConfig, registry: ModelRegistry): SecurityModelCandidate
```

**Parameters:**
- `cfg: AnalyzeConfig` — Carries tiering.security (parsed from the new global-only models.security.* catalog keys) and the 'security.review' role's own tier assignment, used only when no pin is configured.
- `registry: ModelRegistry` — Supplies the family/model catalog (families(), via FamilyDefinition.tierDefaults) needed both to validate a pin is listed and to run the floor-eligibility check against the role's coreFloor.

**Returns:** `SecurityModelCandidate` — status:'candidate' with {runner, model, effort?} when a listed, floor-eligible model was selected (an explicit models.security pin, or the role's own tier-default when no pin is configured); status:'unavailable' with blockerReason when the configured pin is malformed, unlisted, or below the role's required capability floor -- decided purely from config + registry data, with no I/O and no substitution.

**Preconditions:**
- models.security.* has already been parsed by the dedicated tri-state parseSecurityModelPin function (absent / valid / malformed), never by reusing parseTieringOverride's existing malformed-value-dropped-to-undefined convention
- the 'security.review' RoleId is registered in role-taxonomy.ts's closed ROLES registry

**Postconditions:**
- performs no I/O or subprocess work of any kind
- a malformed or below-floor pin resolves to status:'unavailable' immediately and never falls through to the role's tier-default model
- an absent pin falls through to the 'security.review' role's own tier-default model, which is itself checked against the floor the same way a pin would be

### 2.2 `resolveSecurityModel`

```typescript
function resolveSecurityModel(cfg: AnalyzeConfig, registry: ModelRegistry, opts: { deadlineMs: number; signal?: AbortSignal }): Promise<SecurityModelSelection>
```

**Parameters:**
- `cfg: AnalyzeConfig` — Forwarded to resolveSecurityModelCandidate.
- `registry: ModelRegistry` — Forwarded to resolveSecurityModelCandidate.
- `opts: { deadlineMs: number; signal?: AbortSignal }` — deadlineMs bounds the live availability check so an unreachable CLI subprocess cannot hang a review start; signal lets the caller cancel the in-flight check (e.g. the review itself was aborted).

**Returns:** `Promise<SecurityModelSelection>` — Resolves 'configured' only after a bounded, real availability probe against resolveSecurityModelCandidate's selected (runner, model) succeeds. Resolves 'unavailable' immediately, with no probe attempted, when the candidate step itself rejected the pin; otherwise resolves 'unavailable' after the probe fails, times out (opts.deadlineMs), or is cancelled (opts.signal).

**Postconditions:**
- always resolves (never rejects); the promise settles within opts.deadlineMs of starting the availability probe
- calls resolveSecurityModelCandidate first; if it is already status:'unavailable', resolveSecurityModel returns that result without starting any process
- otherwise awaits exactly one bounded probe (a minimal CliProvider call) against the candidate; the probe's rejection, a non-zero/ENOENT failure, the deadline, or signal abort are each mapped to a distinct blockerReason

## 3. Data model changes

### 3.1 `role-taxonomy.ts ROLES registry` — new

Add one new RoleDescriptor entry { id: 'security.review', criticality: 'critical', defaultTier: 'core' } to the closed ROLES array, so the role participates in coreFloor protection and is exposed by settings-catalog.ts like every other critical role. This is a data addition only -- role-taxonomy.ts stays pure DATA + accessors per its own header comment; it still does not resolve providers.

**Call sites:**
- `src/config/role-taxonomy.ts:56-120`
- `src/config/settings-catalog.ts:86`

### 3.2 `config-catalog.ts CONFIG_CATALOG rows (models.security.*)` — new

Add three new GLOBAL-ONLY scalar catalog rows mirroring the existing models.tiers.<tier>.{runner,model,effort} rows exactly (buildConfigCatalog's tierRows/effortRow pattern): models.security.runner (enum, family ids), models.security.model (string), models.security.effort (enum, optional). No byRepo variant is added -- per-repo config only ever picks a TIER for a role, never the model behind a tier (role-router.ts's own doc comment: 'a repo picks a tier for a role, never the model behind it'); the security pin follows that identical global-only rule. This corrects revision 1, which wrongly introduced a byRepo-over-global precedence for a model identity that no existing catalog mechanism supports.

**Call sites:**
- `src/config/config-catalog.ts:94-99`
- `src/config/config-catalog.ts:133-135`

### 3.3 `AnalyzeConfig.tiering.security + parseSecurityModelPin` — new

Add an optional tiering.security?: { runner: FamilyId; model: string; effort?: EffortLevel } | undefined field, loaded by a NEW, dedicated parseSecurityModelPin(models: Record<string, unknown>) function -- NOT a reuse of parseTieringOverride/effortOf's existing convention of silently dropping a malformed value to undefined (analyze.ts:384-431), since that convention cannot distinguish a malformed pin from an absent one, and this Story's fail-closed requirement depends on telling them apart. parseSecurityModelPin returns a tri-state result: { kind: 'absent' } (no models.security key at all), { kind: 'valid', runner, model, effort? } (a well-typed, complete triple), or { kind: 'malformed', detail } (models.security is present but incomplete or mistyped -- e.g. runner set with no model, or runner not a recognized FamilyId). resolveSecurityModelCandidate treats 'malformed' as an immediate status:'unavailable', never as 'absent'.

**Call sites:**
- `src/config/analyze.ts:384-431`

### 3.4 `Security-pin floor-eligibility check` — new

A new helper, e.g. securityPinMeetsFloor(registry: ModelRegistry, familyId: FamilyId, modelId: string, floorTier: TierName): boolean, establishes the ONLY link between an arbitrary pinned (family, model) pair and the coreFloor's TierName ranking: it holds iff some family's own FamilyDefinition.tierDefaults[tier].model (by id or alias) equals the pinned model AND reasoningRoleTaxonomy().rankOf[tier] >= rankOf[floorTier]. A pin matching no family's tierDefaults at any tier is 'unclassifiable' and is treated as below-floor (rejected, not substituted). This is necessary because CoreFloorGuard.applyCoreFloor (core-floor-guard.ts:107-141) compares only TierName values via rankOf -- it has no notion of an individual model's capability, so registering 'security.review' as critical/core by itself establishes no eligibility rule for a pin that bypasses tier assignment entirely.

**Call sites:**
- `src/config/core-floor-guard.ts:107-141`
- `src/daemon/model-catalog.ts:72-86`
- `src/daemon/model-registry.ts:96-100`
- `src/config/role-taxonomy.ts:43-49`

### 3.5 `SecurityModelSelection (sc1)` — new

The HLD-defined output record this Story owns and produces via resolveSecurityModel: { status: 'configured' | 'unavailable'; modelId?: string; provider: 'cli-claude' | 'cli-codex' | 'cli-vibe'; blockerReason?: string }. Lives in the Epic's new standalone orchestration module (outside src/workflow/review-round/, per the HLD's chosen alternative), e.g. src/workflow/security-review/model-selection.ts, and crosses the s1->s3 boundary unchanged. Unchanged from revision 1 -- the shape already supports both an immediate (sync-known) rejection and an availability-check (async) failure with the same status/blockerReason fields.

## 4. Interaction with shared contracts

| Contract | Role | How |
| :--- | :--- | :--- |
| `sc1` | implements | resolveSecurityModel is the sole producer of SecurityModelSelection. It first calls resolveSecurityModelCandidate (pure, sync): resolve the models.security pin or, if absent, the 'security.review' role's tier-default model; reject immediately (status:'unavailable', no substitution) if the pin is malformed, unlisted, or fails the coreFloor-eligibility check. Only a surviving candidate proceeds to a bounded, awaited availability probe against the real CLI backend; a probe failure, timeout, or cancellation also resolves to status:'unavailable', each with a distinguishing blockerReason. s3 consumes the returned value as-is to dispatch its CliProvider.runReadOnlySession call and to record the effective model in the report. |

## 5. Error paths

**Error cases**

- **models.security.* is present but malformed -- e.g. models.security.model is set with no models.security.runner, or the runner value is not a recognized FamilyId.** (recoverable)
  - Detection: parseSecurityModelPin returns { kind: 'malformed', detail }, distinct from { kind: 'absent' }; resolveSecurityModelCandidate checks for this kind explicitly rather than treating a parse failure as if no pin were configured.
  - Response: resolveSecurityModelCandidate returns status:'unavailable' immediately with a blockerReason naming the malformed field; it does NOT fall through to the 'security.review' role's tier-default model the way an absent pin would.
  - User impact: An operator's broken configuration is reported as a specific, actionable blocker instead of silently running under a different model than they thought they configured.
- **models.security.* names a (runner, model) pair that IS a listed, valid model for that family, but does not match any of that family's own FamilyDefinition.tierDefaults entries at or above the 'security.review' role's effective coreFloor rank (or matches none of its tierDefaults at all -- unclassifiable).** (recoverable)
  - Detection: securityPinMeetsFloor(registry, runner, model, floorTier) returns false for every TierName; resolveSecurityModelCandidate checks this before accepting the pin as a candidate.
  - Response: Returns status:'unavailable' with a blockerReason stating the pin is below the required capability floor (or unclassifiable against any tier); the pin is rejected outright, never substituted with the tier-default model or a different pin.
  - User impact: A pin that would silently under-power the security review is refused rather than accepted and run anyway.
- **The selected candidate's CLI binary is not installed, or its OAuth session has expired, so the bounded availability probe's real subprocess invocation fails (ENOENT / auth rejection) -- a failure mode the earlier analyze bundle confirmed CliProvider has no pre-flight isAvailable()/healthcheck probe for; it can only be observed by actually attempting the call.** (recoverable)
  - Detection: resolveSecurityModel's awaited probe (a minimal CliProvider call against the candidate) rejects or reports a non-zero/ENOENT failure before opts.deadlineMs elapses; the rejection is caught, not propagated.
  - Response: Resolves status:'unavailable' with a blockerReason distinguishing a live backend failure from a config-time rejection (malformed/below-floor).
  - User impact: No review runs against a degraded or silently-substituted model; the operator is told the backend itself could not be reached.
- **The bounded availability probe neither resolves nor rejects before opts.deadlineMs elapses, or opts.signal is aborted while the probe is still outstanding (e.g. the review itself was cancelled).** (recoverable)
  - Detection: resolveSecurityModel races the probe against a deadline timer and the given AbortSignal; whichever settles first determines the outcome, and the probe's own eventual settlement (if any) is discarded.
  - Response: Resolves status:'unavailable' with a blockerReason naming 'timeout' or 'cancelled' respectively, distinct from a live backend failure.
  - User impact: A hung or cancelled availability check cannot stall review start indefinitely, and the operator can tell a timeout/cancellation apart from an actual backend rejection.
- **No models.security.* pin is configured (a genuine { kind: 'absent' }, distinct from malformed), AND the 'security.review' role's own tier-default model is also unlisted or fails the same floor-eligibility check.** (recoverable)
  - Detection: The fallthrough-to-tier-default path in resolveSecurityModelCandidate runs through the identical listed-model + floor-eligibility checks a pin would.
  - Response: Returns status:'unavailable' with a blockerReason; resolveSecurityModelCandidate does not fall through further to a different role, tier, or UNKNOWN_ROLE_TIER-style default the way RoleRouter's own resolveRoleInternal would.
  - User impact: No unannounced model substitution -- the blocker is explicit even when there was never an explicit pin to begin with.

**Edge cases**

| Input | Expected |
| :--- | :--- |
| models.security.* is wholly absent (no key at all) and the 'security.review' role's tier-default model is listed and floor-eligible. | resolveSecurityModelCandidate falls through cleanly to the tier-default model as a normal candidate (status:'candidate', not 'unavailable') -- an absent pin is expected, ordinary behavior, not itself a blocker; resolveSecurityModel then still runs the bounded availability probe against it before reporting 'configured'. |
| repoPath / per-repo config is irrelevant to the security pin: models.byRepo.<repo>.security does not exist as a catalog key. | resolveSecurityModelCandidate and resolveSecurityModel take no repoPath parameter and consult only the global models.security.* catalog keys -- unlike models.tasks (roleTiers) and models.coreFloor, which do have byRepo overrides for TIER ASSIGNMENT, the pinned model identity itself is global-only, mirroring models.tiers.<tier>.{runner,model} exactly. |
| models.security.* names a (runner, model) pair that matches a DIFFERENT family's own tierDefaults at a tier whose rank is at or above the floor (e.g. the pin is codex's own mid-tier default model, and the floor is 'mid'). | securityPinMeetsFloor returns true (the check is per-pin against ANY family's tierDefaults, not restricted to the 'security.review' role's own currently-assigned family/tier) -- the pin is accepted as a floor-eligible candidate. |
| The live-test's chosen backend: a VALID, listed, floor-eligible model is pinned, but the backend made unreachable for the test (e.g. CLI binary removed from PATH or auth revoked in the test environment) -- NOT an invalid/unlisted model id. | resolveSecurityModelCandidate accepts the pin as a candidate (the config-time checks pass); the failure surfaces only from resolveSecurityModel's awaited availability probe, exercising the genuinely asynchronous failure path rather than being rejected before availability is ever checked. |

## 6. Test strategy

**Test framework:** `node:test (node --test) with node:assert, per the existing src/config/__tests__/*.test.ts convention this Story's own role-taxonomy.ts change sits beside (e.g. role-taxonomy.test.ts's assert.equal(r.defaultTier, ...) pattern).`

**Test levels**

- **unit** — Prove parseSecurityModelPin's tri-state parsing in isolation -- absent vs valid vs malformed are never conflated.
  - Subjects: `parseSecurityModelPin: no models.security key at all -> { kind: 'absent' }`, `parseSecurityModelPin: a complete, well-typed { runner, model } -> { kind: 'valid', ... }`, `parseSecurityModelPin: runner set with no model -> { kind: 'malformed', detail }`, `parseSecurityModelPin: runner is not a recognized FamilyId -> { kind: 'malformed', detail }`
- **unit** — Prove securityPinMeetsFloor's eligibility rule against a fake registry's FamilyDefinition.tierDefaults.
  - Subjects: `securityPinMeetsFloor: a pin matching its own family's tierDefaults at a tier at/above the floor -> true`, `securityPinMeetsFloor: a pin matching a DIFFERENT family's tierDefaults at a tier at/above the floor -> true`, `securityPinMeetsFloor: a pin matching a tierDefaults entry BELOW the floor rank -> false`, `securityPinMeetsFloor: a pin matching no family's tierDefaults at any tier (unclassifiable) -> false`
  - Fixtures: `a fake ModelRegistry exposing FamilyDefinition entries with controlled tierDefaults, so at/above-floor, below-floor, and unclassifiable pins are each deterministic`
- **unit** — Prove resolveSecurityModelCandidate's precedence and fail-closed decisions in isolation -- no I/O, no CLI subprocess.
  - Subjects: `resolveSecurityModelCandidate: a valid, floor-eligible pin -> status:'candidate' with that (runner, model)`, `resolveSecurityModelCandidate: a malformed pin -> status:'unavailable' immediately, never falling through to the tier-default model`, `resolveSecurityModelCandidate: a valid but below-floor/unclassifiable pin -> status:'unavailable', never substituted`, `resolveSecurityModelCandidate: an absent pin falls through to the 'security.review' role's tier-default model as a normal candidate`, `resolveSecurityModelCandidate: an absent pin whose tier-default model is itself unlisted/below-floor -> status:'unavailable'`
  - Fixtures: `a fake ModelRegistry exposing a small, controlled family/model list with tierDefaults, so listed/unlisted and floor-eligible/ineligible pins are each deterministic`, `an AnalyzeConfig fixture with tiering.security variants (absent/valid/malformed) and a configured coreFloor`
- **unit** — Prove resolveSecurityModel's async composition -- bounded probe, timeout, and cancellation -- using a fake/controllable probe, not a real CLI subprocess.
  - Subjects: `resolveSecurityModel: candidate already 'unavailable' -> resolves immediately, no probe attempted`, `resolveSecurityModel: probe resolves successfully within the deadline -> status:'configured'`, `resolveSecurityModel: probe rejects (simulated ENOENT/auth failure) -> status:'unavailable' with a backend-failure blockerReason`, `resolveSecurityModel: probe neither resolves nor rejects before opts.deadlineMs -> status:'unavailable' with a timeout blockerReason`, `resolveSecurityModel: opts.signal is aborted while the probe is outstanding -> status:'unavailable' with a cancellation blockerReason`
  - Fixtures: `a fake/controllable probe function (resolves, rejects, or never settles on command) injected in place of the real CliProvider call`
- **unit** — Prove the new role-taxonomy.ts registration itself follows the same shape every other critical role already must, reusing role-taxonomy.test.ts's own existing assertions.
  - Subjects: `role-taxonomy.ts ROLES: the 'security.review' entry is criticality:'critical' with defaultTier:'core' (mirrors role-taxonomy.test.ts:49's existing 'critical role must default to core' assertion)`, `roleDescriptor('security.review') returns the registered descriptor`
- **live** — Prove resolveSecurityModel detects a genuinely unavailable CLI backend end-to-end against the real CliProvider path, using a VALID, listed, floor-eligible pin whose backend is made unreachable (binary removed from PATH or an unauthenticated session) -- NOT an invalid/unlisted model, which would be rejected before any availability check is ever attempted. Gated behind INSRC_LIVE_TESTS=1 per the project's existing live-service-test convention.
  - Subjects: `resolveSecurityModel against a real CliProvider probe for a valid, floor-eligible pin whose backend is deliberately unreachable, asserting status:'unavailable' with a populated blockerReason within the configured deadline, rather than a hang or a silent substitute model`
  - Fixtures: `an environment with a valid, listed, floor-eligible model pin whose backend is deliberately made unreachable (uninstalled binary or unauthenticated session), run only under INSRC_LIVE_TESTS=1`

**Acceptance mapping**

| Criterion | Proving tests |
| :--- | :--- |
| `ac1` | `resolveSecurityModelCandidate: a valid, floor-eligible pin -> status:'candidate' with that (runner, model)`, `resolveSecurityModelCandidate: a malformed pin -> status:'unavailable' immediately, never falling through to the tier-default model`, `resolveSecurityModelCandidate: a valid but below-floor/unclassifiable pin -> status:'unavailable', never substituted`, `resolveSecurityModelCandidate: an absent pin falls through to the 'security.review' role's tier-default model as a normal candidate`, `resolveSecurityModel: probe resolves successfully within the deadline -> status:'configured'`, `resolveSecurityModel: probe rejects (simulated ENOENT/auth failure) -> status:'unavailable' with a backend-failure blockerReason`, `resolveSecurityModel: probe neither resolves nor rejects before opts.deadlineMs -> status:'unavailable' with a timeout blockerReason`, `resolveSecurityModel against a real CliProvider probe for a valid, floor-eligible pin whose backend is deliberately unreachable, asserting status:'unavailable' with a populated blockerReason within the configured deadline, rather than a hang or a silent substitute model` |

## 7. Alternatives considered

### 7.1 a1: Wrap the existing RoleRouter unchanged

Add a 'security.review' RoleId to role-taxonomy.ts and resolve it through the existing RoleRouter/config-catalog tier machinery, then wrap the result in a thin fail-closed check.

Register a new critical RoleId ('security.review', defaultTier 'core') in src/config/role-taxonomy.ts, selectable only via the existing roleTiers/byRepo precedence RoleRouter already implements. A new, separate function (outside RoleRouter, since RoleRouter's resolveRole/materialize contract is explicitly total and must stay that way for every other caller) calls resolveProviderForRole for this role, attempts one lightweight construction/probe, and maps the outcome onto SecurityModelSelection: success -> {status:'configured', modelId, provider}; a thrown ModelNotSupportedError or a failed construction -> {status:'unavailable', blockerReason} instead of letting the tier's own silent mid-fallback happen.

**Rejected because:** Only partially met ac1/sc1/k2: the model stays tier-bound rather than independently selectable, and the fail-closed guarantee is bolted onto RoleRouter's explicitly permissive, never-throws contract rather than owned by a dedicated resolver.

### 7.2 a2: Fully standalone security-model config key

A brand-new config-catalog.ts field (e.g. security.model: {provider, modelId}) resolved by a dedicated function that never touches role-taxonomy.ts or RoleRouter.

Add a net-new config-catalog.ts entry (byRepo > global precedence, mirroring the existing merge pattern but implemented as its own small resolver, not a call into RoleRouter) that names an explicit CLI provider + model pin. A dedicated resolveSecurityModel(cfg, repoPath) function reads only that key, attempts construction, and returns SecurityModelSelection directly: unset or unresolvable -> {status:'unavailable', blockerReason}; set and constructible -> {status:'configured', modelId, provider}. No RoleId, no tier, no coreFloor interaction.

**Rejected because:** Fully satisfies ac1 and sc1 via the same dedicated fail-closed resolver pattern as a3, but leaves the HLD's own flagged open question unresolved -- it forgoes coreFloor participation and the settings-UI consistency every other critical role gets.

### 7.3 a3: Taxonomy entry for tier semantics + a dedicated override for the model pin — **CHOSEN**

Keep a 'security.review' RoleId (critical, coreFloor-protected) for tier semantics, but add a separate config field that can pin an explicit provider/model independent of the tier's registry-driven choice, with a dedicated fail-closed resolver.

Register 'security.review' in role-taxonomy.ts as critical/defaultTier 'core' so it inherits coreFloor protection and shows up in the settings UI like every other role (reusing RoleRouter's tier precedence for the FLOOR only). Add one new config-catalog.ts field (e.g. tiering.securityModel: {provider, modelId} | undefined, byRepo > global) that, when present, names the exact provider/model to use for this role instead of the tier's registry-driven default -- independent selection, but still coreFloor-checked. A dedicated resolveSecurityModel(cfg, repoPath) (not inside RoleRouter) composes: read the override if present, else fall through to the taxonomy tier's default model; attempt construction; unavailable/unsupported -> {status:'unavailable', blockerReason}, never a silent substitution; available -> {status:'configured', modelId, provider}.

(Revision 2 corrects this alternative's own global-only-vs-byRepo config shape and sync/async split per the review findings below -- see §2, §3.2-3.4, §5, §6 for the corrected design; the choice of a3 over a1/a2 stands unchanged.)

## 8. References

- **[[c1]]** `code` `src/config/role-taxonomy.ts:31`
- **[[c2]]** `code` `src/config/role-taxonomy.ts:56-120`
- **[[c3]]** `code` `src/config/settings-catalog.ts:86`
- **[[c4]]** `code` `src/analyze/context/role-router.ts:103-174`
- **[[c5]]** `code` `src/analyze/context/shaper-provider.ts:313-330`
- **[[c6]]** `code` `src/daemon/model-registry.ts:67`
- **[[c7]]** `code` `src/config/__tests__/role-taxonomy.test.ts:49`
- **[[c8]]** `code` `src/config/__tests__/core-floor-guard.test.ts:25`
- **[[c9]]** `artifact` `HLD-0765b3a578e43eec`
- **[[c10]]** `code` `src/config/config-catalog.ts:94-99`
- **[[c11]]** `code` `src/config/config-catalog.ts:133-135`
- **[[c12]]** `code` `src/config/analyze.ts:384-431`
- **[[c13]]** `code` `src/daemon/model-catalog.ts:72-86`
- **[[c14]]** `code` `src/daemon/model-registry.ts:96-100`
- **[[c15]]** `code` `src/config/core-floor-guard.ts:107-141`
- **[[c16]]** `code` `src/analyze/context/role-router.ts:25-29`
