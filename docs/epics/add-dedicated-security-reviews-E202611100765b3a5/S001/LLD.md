<!-- insrc:artifact LLD-0765b3a578e43eec-s1 -->

# LLD: STORY-0765b3a578e43eec-s1 — Configure a dedicated security model

## Summary

**Epic:** `add-dedicated-security-reviews`
**HLD base run:** `wf-1795324517306-yi2irl`
**HLD effective hash:** `60b05edbecc2...`
**Tracker:** [insors-ai/insrc#226](https://github.com/insors-ai/insrc/issues/226)

This Story lets an operator pin a dedicated security-review model, independent of the core/mid/cheap tiers every other reasoning site uses, and have that pin checked for availability before a security review runs -- a malformed or unreachable pin is reported as a specific blocker, never silently replaced with a different model. This revision corrects the LLD's own contract text: the configuration field that carries the pin must be a required, always-present three-way result (nothing configured / a valid pin / a malformed pin), not the optional field originally sketched, because only the three-way shape lets the selection logic refuse a malformed pin instead of treating it the same as nothing configured.

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

**Rollout phase:** Phase A -- foundational contracts (model selection and dependency-advisory collection)
**Owns:** `sc1` (SecurityModelSelection)

## 2. Contract details

**Surface level:** internal

### 2.1 `parseSecurityModelPin`

```typescript
function parseSecurityModelPin(models: Record<string, unknown>): SecurityModelPinResult
```

**Parameters:**
- `models: Record<string, unknown>` — The raw, already-parsed `models` object from config.json (or an equivalent in-memory config source) to read the `security` key from.

**Returns:** `SecurityModelPinResult` — A required, always-present tri-state: {kind:'absent'} when no models.security key is set, or it is set to the catalog's own '' runner+model unset sentinel; {kind:'valid', runner, model, effort?} when models.security validates to a listed CLI family + non-empty model; {kind:'malformed', detail} for anything else present (wrong shape entirely, or an incomplete/mistyped object).

**Preconditions:**
- models is the raw models.* config object, not yet validated

**Postconditions:**
- The result is one of exactly the three SecurityModelPinResult variants; never undefined.
- An absent key and a malformed value are never conflated: only {kind:'absent'} falls through to the role's tier-default model downstream.

### 2.2 `resolveSecurityModelCandidate`

```typescript
function resolveSecurityModelCandidate(cfg: AnalyzeConfig, registry: ModelRegistry, repoPath?: string): SecurityModelCandidate
```

**Parameters:**
- `cfg: AnalyzeConfig` — The loaded analyze config, carrying cfg.tiering.security (the SecurityModelPinResult) and cfg.tierResolutions.
- `registry: ModelRegistry` — The model registry used to check a pin's listedness and capability floor.
- `repoPath: string` _(optional)_ — Optional repo path, so a repo's own models.byRepo[repoPath].tasks['security.review'] / coreFloor override is honored when computing the fallback floor tier for an absent pin.

**Returns:** `SecurityModelCandidate` — status:'candidate' with the selected (runner, model, effort?) when a listed, floor-eligible model was found (either the explicit pin, or -- only for a genuinely absent pin -- the 'security.review' role's own tier-default model, resolved via the same byRepo->global->role-default precedence + coreFloor clamp every other role uses); status:'unavailable' with blockerReason otherwise. Takes cfg.tiering.security's kind directly: 'malformed' always resolves to 'unavailable' immediately, never falling through to a tier-default model.

**Preconditions:**
- cfg.tiering.security is the tri-state SecurityModelPinResult (never undefined).

**Postconditions:**
- A malformed pin, or a pin/tier-default model that is unlisted, below-floor, or whose tier resolution itself carries a silent-substitution fallback, never resolves to 'candidate'.

## 3. Data model changes

### 3.1 `AnalyzeTiering.security` — field-modify

Corrects this Story's own LLD contract text: AnalyzeTiering.security is `SecurityModelPinResult` (a required, always-present discriminated union: {kind:'absent'} | {kind:'valid', runner, model, effort?} | {kind:'malformed', detail}), not the originally-sketched optional `SecurityModelPin | undefined`. resolveSecurityModelCandidate(cfg, registry, repoPath?) has a fixed signature with no raw models.* access, so it can only tell a genuinely absent pin (which must fall through to the role's tier-default model) apart from a malformed one (which must refuse immediately, per ac1's no-silent-fallback requirement) if the field itself carries that distinction -- an optional field collapses both to undefined and makes the distinction unrecoverable downstream. No code changes result from this revision; the field is already built and tested this way.

```
- security?: SecurityModelPin | undefined
+ security: SecurityModelPinResult  // { kind: 'absent' } | ({ kind: 'valid' } & SecurityModelPin) | { kind: 'malformed'; detail: string }
```

**Call sites:**
- `src/config/analyze.ts:166-193`
- `src/config/analyze.ts:225-233`
- `src/config/analyze.ts:426-460`
- `src/config/analyze.ts:505-546`
- `src/config/__tests__/analyze-tiering.test.ts`

## 4. Interaction with shared contracts

| Contract | Role | How |
| :--- | :--- | :--- |
| `sc1` | consumes | sc1 (SecurityModelSelection) is not produced by the functions this revision documents -- resolveSecurityModel (src/config/analyze.ts:505-546) produces it, by calling resolveSecurityModelCandidate first. This revision only corrects the internal AnalyzeTiering.security field the candidate resolution reads; sc1's own shape (owned by s1, consumed by s3) is unaffected and is not re-specified here. |

## 5. Error paths

**Error cases**

- **models.security.runner is set but models.security.model is missing or empty (a genuine config mistake)** (recoverable)
  - Detection: parseSecurityModelPin checks runner and model independently; only both being absent or both being the catalog's '' unset sentinel reads as {kind:'absent'} -- one set without the other is {kind:'malformed'}.
  - Response: resolveSecurityModelCandidate returns status:'unavailable' with the parser's detail string as blockerReason immediately, never falling through to the role's tier-default model.
  - User impact: The security review reports the specific misconfiguration (e.g. 'models.security.model: expected a non-empty string') instead of silently reviewing with a different model.
- **models.security is present but the wrong shape entirely (null, a string, an array, a number)** (recoverable)
  - Detection: parseSecurityModelPin treats sec === undefined as the only absent case; any other non-object value is {kind:'malformed'}, distinct from a genuinely absent key.
  - Response: resolveSecurityModelCandidate refuses immediately with status:'unavailable', same as any other malformed pin.
  - User impact: A config author's typo (e.g. models.security: 'claude') is reported as a malformed configuration, not silently treated as unset.
- **No pin is configured, and the role's own fallback-tier model was itself silently substituted (unlisted/rejected) by the registry** (recoverable)
  - Detection: resolveSecurityModelCandidate checks cfg.tierResolutions[floorTier].fallback for the absent-pin fallthrough path.
  - Response: Refuses with status:'unavailable', naming the fallback.reason and fallback.requested, rather than silently using the registry's own substitute model.
  - User impact: The operator is told their configured tier model was rejected, instead of the security review silently running on an unrequested substitute.
- **The caller's opts.signal is already aborted before resolveSecurityModel is called, or is aborted while the probe is outstanding** (recoverable)
  - Detection: resolveSecurityModel checks opts.signal?.aborted at function entry before any dispatch; an abort while outstanding is caught by an 'abort' listener on the caller's signal.
  - Response: Resolves immediately (pre-aborted case) or as soon as the abort fires (in-flight case) with status:'unavailable' and a cancellation blockerReason; an internal AbortController is aborted in both cases and its signal is threaded into the underlying CliProvider.complete() call, which genuinely stops the CLI subprocess and bypasses its retry chain rather than leaving it running past the deadline.
  - User impact: A cancelled review stops promptly and does not leave a background CLI process retrying after the caller gave up.

**Edge cases**

| Input | Expected |
| :--- | :--- |
| models.security: {runner: '', model: ''} -- the catalog's own persisted 'unset' default, written by config reconciliation on every ordinary install | Reads identically to no models.security key at all: {kind:'absent'}, falling through to the role's tier-default model. |
| A valid pin with effort: '' (the catalog's documented 'use the CLI's own default' value) | The '' effort is stripped before the {kind:'valid'} result is returned; it is never forwarded as a literal --effort '' to the CLI. |

## 6. Test strategy

**Test framework:** `node:test (npx tsx --test), per the project's existing src/config/__tests__ convention`

**Test levels**

- **unit** — Exercise parseSecurityModelPin's tri-state classification and resolveSecurityModelCandidate's/resolveSecurityModel's selection logic directly against a fake ModelRegistry/AnalyzeConfig, with no real CLI subprocess.
  - Subjects: `parseSecurityModelPin`, `securityPinMeetsFloor`, `resolveSecurityModelCandidate`, `resolveSecurityModel`
  - Fixtures: `fakeRegistry(families)`, `fakeAnalyzeConfig(tiering)`, `_setSecurityProbeDepsForTests(deps) injectable probe seam`
- **live** — Confirm resolveSecurityModel reports a genuinely unreachable CLI backend (real ENOENT) within its deadline, never a hang or silent substitution, against the real default probe.
  - Subjects: `resolveSecurityModel`
  - Fixtures: `INSRC_LIVE_TESTS=1 gate`, `PATH overridden to a nonexistent directory for the subprocess spawn only`

**Acceptance mapping**

| Criterion | Proving tests |
| :--- | :--- |
| `ac1` | `parseSecurityModelPin: no models.security key at all -> { kind: 'absent' }`, `parseSecurityModelPin: a complete, well-typed { runner, model } -> { kind: 'valid', ... }`, `parseSecurityModelPin: runner set with no model -> { kind: 'malformed', detail }`, `parseSecurityModelPin: model set with no runner -> { kind: 'malformed', detail }`, `parseSecurityModelPin: the catalog's own persisted unset sentinel (runner:'', model:'') -> { kind: 'absent' }, not malformed`, `parseSecurityModelPin: a valid pin never carries a literal '' effort (the CLI's own default, not a flag value)`, `parseSecurityModelPin: models.security present but the wrong shape (null/string/array/number) -> malformed, not absent`, `resolveSecurityModelCandidate: a malformed pin -> status:'unavailable' immediately, never falling through to the tier-default model`, `resolveSecurityModelCandidate: an absent pin falls through to the 'security.review' role's tier-default model as a normal candidate`, `resolveSecurityModelCandidate: models.tasks['security.review'] (roleTiers) is honored for an absent pin, not just the role's bare defaultTier`, `resolveSecurityModelCandidate: a byRepo roleTiers override takes precedence over the global one, for the given repoPath`, `resolveSecurityModelCandidate: a critical role's tier is clamped up to coreFloor even when roleTiers assigns it lower`, `resolveSecurityModelCandidate: an absent pin refuses (never silently falls through) when the floor tier's own configured model was itself rejected/substituted`, `resolveSecurityModel: candidate already 'unavailable' -> resolves immediately, no probe attempted`, `resolveSecurityModel: probe resolves successfully within the deadline -> status:'configured'`, `resolveSecurityModel: probe rejects (simulated ENOENT/auth failure) -> status:'unavailable' with a backend-failure blockerReason`, `resolveSecurityModel: an opts.signal that is ALREADY aborted before the call short-circuits immediately, with no probe dispatched`, `resolveSecurityModel: a timeout aborts the internal signal threaded into the probe, so the underlying call is actually cancelled`, `resolveSecurityModel: the caller's own cancellation also aborts the internal signal threaded into the probe`, `live: resolveSecurityModel reports a genuinely unreachable CLI backend via ENOENT, within the deadline, never a hang or substitution` |

## 7. Alternatives considered

### 7.1 a1: Required, always-present tri-state SecurityModelPinResult (as built) — **CHOSEN**

AnalyzeTiering.security: SecurityModelPinResult, a discriminated union {kind:'absent'}|{kind:'valid',...SecurityModelPin}|{kind:'malformed',detail}, never undefined.

parseSecurityModelPin(models) always returns one of the three tagged variants; parseTiering wires it onto AnalyzeTiering.security unconditionally (never collapsed to undefined). resolveSecurityModelCandidate(cfg, registry, repoPath?) switches on cfg.tiering.security.kind: 'malformed' refuses immediately (status:'unavailable', never falls through to the role's tier-default model, satisfying ac1's 'reports the blocker without a silent fallback'); 'absent' falls through to the role's own tier-default model (resolved via the same byRepo->global->role-default precedence + coreFloor clamp every other role uses); 'valid' is checked against the listed-model + capability-floor requirements like any pin. This is the smallest shape that lets resolveSecurityModelCandidate's own fixed signature (cfg, registry) distinguish all three states without any raw models.* access.

### 7.2 a2: Optional SecurityModelPin | undefined (original sketch)

AnalyzeTiering.security?: {runner, model, effort?} | undefined -- absent and malformed both read as undefined.

parseSecurityModelPin returns a SecurityModelPin when models.security validates, or undefined otherwise (silently dropping a malformed entry, mirroring parseTieringOverride's existing tier-entry convention). resolveSecurityModelCandidate(cfg, registry) checks cfg.tiering.security !== undefined and falls through to the role's tier-default model whenever it is undefined.

**Rejected because:** Violates ac1 and k2: a malformed pin collapses to the same undefined as an absent one, so resolveSecurityModelCandidate(cfg, registry) silently falls through to the tier-default model instead of refusing -- the silent fallback both constraints forbid.

### 7.3 a3: Two separate optional fields (presence + error)

AnalyzeTiering.securityPin?: SecurityModelPin | undefined plus AnalyzeTiering.securityPinError?: string | undefined, read together.

parseSecurityModelPin populates securityPin when valid, or securityPinError (a detail string) when malformed; both undefined means absent. resolveSecurityModelCandidate checks securityPinError first (refuse if set), then securityPin (use if set), else falls through.

**Rejected because:** Functionally satisfies the same constraints as a1 today but with a non-exhaustive two-field convention that can silently regress to a2's failure mode if a future caller reads securityPin without checking securityPinError.

## 8. References

- **[[c1]]** `code` `src/config/analyze.ts:158-161` — "SecurityModelPinResult type"
- **[[c2]]** `code` `src/config/analyze.ts:166-193` — "parseSecurityModelPin(models: Record<string, unknown>): SecurityModelPinResult"
- **[[c3]]** `code` `src/config/analyze.ts:225-233` — "AnalyzeTiering interface"
- **[[c4]]** `code` `src/config/analyze.ts:426-460` — "resolveSecurityModelCandidate(cfg: AnalyzeConfig, registry: ModelRegistry, repoPath?: string): SecurityModelCandidate"
- **[[c5]]** `code` `src/config/analyze.ts:505-546` — "resolveSecurityModel(cfg: AnalyzeConfig, registry: ModelRegistry, opts): Promise<SecurityModelSelection>"
- **[[c6]]** `code` `src/config/__tests__/analyze-tiering.test.ts` — "42 passing tests covering parseSecurityModelPin, securityPinMeetsFloor, resolveSecurityModelCandidate, resolveSecurityModel"

## Citations

- **[[c1]]** `code` `src/config/analyze.ts:158-161` — "SecurityModelPinResult type"
- **[[c2]]** `code` `src/config/analyze.ts:166-193` — "parseSecurityModelPin(models: Record<string, unknown>): SecurityModelPinResult"
- **[[c3]]** `code` `src/config/analyze.ts:225-233` — "AnalyzeTiering interface"
- **[[c4]]** `code` `src/config/analyze.ts:426-460` — "resolveSecurityModelCandidate(cfg: AnalyzeConfig, registry: ModelRegistry, repoPath?: string): SecurityModelCandidate"
- **[[c5]]** `code` `src/config/analyze.ts:505-546` — "resolveSecurityModel(cfg: AnalyzeConfig, registry: ModelRegistry, opts): Promise<SecurityModelSelection>"
- **[[c6]]** `code` `src/config/__tests__/analyze-tiering.test.ts` — "42 passing tests covering parseSecurityModelPin, securityPinMeetsFloor, resolveSecurityModelCandidate, resolveSecurityModel"
