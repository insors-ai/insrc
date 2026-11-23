<!-- insrc:artifact PLAN-0765b3a578e43eec-s1 -->

# Plan: STORY-0765b3a578e43eec-s1

## Summary

**Epic:** `add-dedicated-security-reviews`
**LLD run:** `wf-1795329813601-41klc0`
**LLD effective hash:** `60b05edbecc2...`

Building this Story means adding one new role entry, three new global config keys, a dedicated fail-closed parser and floor check, and two resolver functions (a pure synchronous selector and a bounded async availability probe) that together let an operator pin an independent security-reviewer model and guarantee it is either used exactly as configured or explicitly refused -- never silently substituted.

## Contents

1. [Tasks](#1-tasks)
2. [Test-strategy coverage](#2-test-strategy-coverage)
3. [References](#3-references)

## 1. Tasks

| # | Task | Size | Status | Depends on | Tests | Derived from |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| 1 | **`t1`** Register the 'security.review' role in role-taxonomy.ts | S | — | — | unit: role-taxonomy.ts ROLES: the 'security.review' entry is criticality:'critical' with defaultTier:'core' (mirrors role-taxonomy.test.ts:49's existing 'critical role must default to core' assertion); unit: roleDescriptor('security.review') returns the registered descriptor | [[c1]] |
| 2 | **`t2`** Add models.security.{runner,model,effort} global-only config-catalog rows | S | — | — | unit: CONFIG_CATALOG includes models.security.runner/model/effort as global-only rows with no byRepo variant | [[c2]] |
| 3 | **`t3`** Add AnalyzeConfig.tiering.security + the tri-state parseSecurityModelPin parser | M | — | `t2` | unit: parseSecurityModelPin: no models.security key at all -> { kind: 'absent' }; unit: parseSecurityModelPin: a complete, well-typed { runner, model } -> { kind: 'valid', ... }; unit: parseSecurityModelPin: runner set with no model -> { kind: 'malformed', detail }; unit: parseSecurityModelPin: runner is not a recognized FamilyId -> { kind: 'malformed', detail } | [[c3]] |
| 4 | **`t4`** Add securityPinMeetsFloor eligibility check | S | — | `t1` | unit: securityPinMeetsFloor: a pin matching its own family's tierDefaults at a tier at/above the floor -> true; unit: securityPinMeetsFloor: a pin matching a DIFFERENT family's tierDefaults at a tier at/above the floor -> true; unit: securityPinMeetsFloor: a pin matching a tierDefaults entry BELOW the floor rank -> false; unit: securityPinMeetsFloor: a pin matching no family's tierDefaults at any tier (unclassifiable) -> false | [[c4]] |
| 5 | **`t5`** Implement resolveSecurityModelCandidate (pure, synchronous selection) | M | — | `t1`, `t3`, `t4` | unit: resolveSecurityModelCandidate: a valid, floor-eligible pin -> status:'candidate' with that (runner, model); unit: resolveSecurityModelCandidate: a malformed pin -> status:'unavailable' immediately, never falling through to the tier-default model; unit: resolveSecurityModelCandidate: a valid but below-floor/unclassifiable pin -> status:'unavailable', never substituted; unit: resolveSecurityModelCandidate: an absent pin falls through to the 'security.review' role's tier-default model as a normal candidate; unit: resolveSecurityModelCandidate: an absent pin whose tier-default model is itself unlisted/below-floor -> status:'unavailable' | [[c5]] [[c6]] |
| 6 | **`t6`** Implement resolveSecurityModel (bounded async availability probe) | M | — | `t5` | unit: resolveSecurityModel: candidate already 'unavailable' -> resolves immediately, no probe attempted; unit: resolveSecurityModel: probe resolves successfully within the deadline -> status:'configured'; unit: resolveSecurityModel: probe rejects (simulated ENOENT/auth failure) -> status:'unavailable' with a backend-failure blockerReason; unit: resolveSecurityModel: probe neither resolves nor rejects before opts.deadlineMs -> status:'unavailable' with a timeout blockerReason; unit: resolveSecurityModel: opts.signal is aborted while the probe is outstanding -> status:'unavailable' with a cancellation blockerReason; live: resolveSecurityModel against a real CliProvider probe for a valid, floor-eligible pin whose backend is deliberately unreachable, asserting status:'unavailable' with a populated blockerReason within the configured deadline, rather than a hang or a silent substitute model | [[c7]] [[c6]] |

### 1.1 TASK-0765b3a578e43eec-s1-t1 — Register the 'security.review' role in role-taxonomy.ts

Add one new RoleDescriptor entry {id:'security.review', criticality:'critical', defaultTier:'core'} to the closed ROLES array in src/config/role-taxonomy.ts, so the role participates in coreFloor protection and is exposed by settings-catalog.ts like every other critical role. Pure data addition -- no accessor logic changes.

**Acceptance checks:**
- roleDescriptor('security.review') returns the registered descriptor with criticality:'critical' and defaultTier:'core'
- Every existing role-taxonomy.test.ts assertion (e.g. 'critical role must default to core') still passes for the new entry
- settings-catalog.ts's generic 'every critical role appears' assertion covers the new entry without any settings-catalog.ts code change

### 1.2 TASK-0765b3a578e43eec-s1-t2 — Add models.security.{runner,model,effort} global-only config-catalog rows

Add three new GLOBAL-ONLY scalar rows to config-catalog.ts, mirroring the existing models.tiers.<tier>.{runner,model,effort} row shape exactly (same {path, type, default, desc, enumValues?, group} shape as buildConfigCatalog's tierRows/effortRow pattern), under a new group label (e.g. 'Models -- security'). No byRepo variant -- per-repo config only ever picks a TIER for a role, never the model behind it.

**Acceptance checks:**
- config-catalog.ts exposes models.security.runner (enum of FamilyId), models.security.model (string), models.security.effort (enum, optional) as global-only rows
- No byRepo.* variant exists for these three keys
- settings-catalog.ts surfaces the new rows the same way it surfaces models.tiers.* rows, with no changes to how models.tiers.* itself is rendered

### 1.3 TASK-0765b3a578e43eec-s1-t3 — Add AnalyzeConfig.tiering.security + the tri-state parseSecurityModelPin parser

Add a required, always-present tiering.security: SecurityModelPinResult tri-state field to AnalyzeConfig (corrected per LLD-0765b3a578e43eec-s1 revision 3: an optional field cannot distinguish absent from malformed, which resolveSecurityModelCandidate's fixed (cfg, registry) signature needs), populated by a NEW, dedicated parseSecurityModelPin(models: Record<string, unknown>) function in analyze.ts -- NOT a reuse of parseTieringOverride's existing silently-drops-to-undefined convention. Returns a tri-state result distinguishing {kind:'absent'} from {kind:'valid', runner, model, effort?} from {kind:'malformed', detail}.

**Acceptance checks:**
- parseSecurityModelPin({}) -> {kind:'absent'}
- parseSecurityModelPin({security:{runner:'cli-claude', model:'x'}}) -> {kind:'valid', runner:'cli-claude', model:'x'}
- parseSecurityModelPin({security:{model:'x'}}) (runner missing) -> {kind:'malformed', detail}
- parseSecurityModelPin({security:{runner:'not-a-family', model:'x'}}) -> {kind:'malformed', detail}
- parseTieringOverride itself is untouched -- no shared logic or behavioral change to the existing tiers.* parsing path

### 1.4 TASK-0765b3a578e43eec-s1-t4 — Add securityPinMeetsFloor eligibility check

Add securityPinMeetsFloor(registry: ModelRegistry, familyId: FamilyId, modelId: string, floorTier: TierName): boolean -- holds iff some family's own FamilyDefinition.tierDefaults[tier].model (by id or alias) equals the pinned model AND that tier's rank is >= the floor tier's rank. A pin matching no family's tierDefaults at any tier is unclassifiable and treated as below-floor (false). This is the ONLY link between an arbitrary pinned pair and coreFloor's TierName ranking, since CoreFloorGuard.applyCoreFloor compares only TierName values and has no notion of an individual model's capability.

**Acceptance checks:**
- A pin matching its OWN family's tierDefaults at a tier at/above the floor -> true
- A pin matching a DIFFERENT family's tierDefaults at a tier at/above the floor -> true
- A pin matching a tierDefaults entry BELOW the floor rank -> false
- A pin matching no family's tierDefaults at any tier (unclassifiable) -> false

### 1.5 TASK-0765b3a578e43eec-s1-t5 — Implement resolveSecurityModelCandidate (pure, synchronous selection)

function resolveSecurityModelCandidate(cfg: AnalyzeConfig, registry: ModelRegistry): SecurityModelCandidate. Resolves tiering.security (via parseSecurityModelPin's result already on cfg) or, if absent, the 'security.review' role's tier-default model; rejects immediately (status:'unavailable', no substitution) if malformed, unlisted, or failing securityPinMeetsFloor. Zero I/O, zero subprocess work.

**Acceptance checks:**
- A valid, floor-eligible pin -> status:'candidate' with that (runner, model)
- A malformed pin -> status:'unavailable' immediately, never falling through to the tier-default model
- A valid but below-floor/unclassifiable pin -> status:'unavailable', never substituted
- An absent pin falls through to the 'security.review' role's tier-default model as a normal candidate
- An absent pin whose tier-default model is itself unlisted/below-floor -> status:'unavailable'

### 1.6 TASK-0765b3a578e43eec-s1-t6 — Implement resolveSecurityModel (bounded async availability probe)

function resolveSecurityModel(cfg, registry, opts: {deadlineMs, signal?}): Promise<SecurityModelSelection>. Calls resolveSecurityModelCandidate first; if already 'unavailable', returns immediately with no probe. Otherwise awaits exactly one bounded probe (a minimal CliProvider call) against the candidate, racing it against opts.deadlineMs and opts.signal; maps rejection/non-zero/ENOENT, timeout, and cancellation to distinct blockerReasons. Never rejects; always settles within opts.deadlineMs.

**Acceptance checks:**
- Candidate already 'unavailable' -> resolves immediately, no probe attempted
- Probe resolves successfully within the deadline -> status:'configured'
- Probe rejects (simulated ENOENT/auth failure) -> status:'unavailable' with a backend-failure blockerReason
- Probe neither resolves nor rejects before opts.deadlineMs -> status:'unavailable' with a timeout blockerReason
- opts.signal aborted while the probe is outstanding -> status:'unavailable' with a cancellation blockerReason
- Live (INSRC_LIVE_TESTS=1): a valid, listed, floor-eligible pin whose backend is deliberately unreachable resolves 'unavailable' with a populated blockerReason within the deadline, never a hang or silent substitution

## 2. Test-strategy coverage

| LLD strategy item | Covered by |
| :--- | :--- |
| parseSecurityModelPin: no models.security key at all -> { kind: 'absent' } | `t3` |
| parseSecurityModelPin: a complete, well-typed { runner, model } -> { kind: 'valid', ... } | `t3` |
| parseSecurityModelPin: runner set with no model -> { kind: 'malformed', detail } | `t3` |
| parseSecurityModelPin: runner is not a recognized FamilyId -> { kind: 'malformed', detail } | `t3` |
| securityPinMeetsFloor: a pin matching its own family's tierDefaults at a tier at/above the floor -> true | `t4` |
| securityPinMeetsFloor: a pin matching a DIFFERENT family's tierDefaults at a tier at/above the floor -> true | `t4` |
| securityPinMeetsFloor: a pin matching a tierDefaults entry BELOW the floor rank -> false | `t4` |
| securityPinMeetsFloor: a pin matching no family's tierDefaults at any tier (unclassifiable) -> false | `t4` |
| resolveSecurityModelCandidate: a valid, floor-eligible pin -> status:'candidate' with that (runner, model) | `t5` |
| resolveSecurityModelCandidate: a malformed pin -> status:'unavailable' immediately, never falling through to the tier-default model | `t5` |
| resolveSecurityModelCandidate: a valid but below-floor/unclassifiable pin -> status:'unavailable', never substituted | `t5` |
| resolveSecurityModelCandidate: an absent pin falls through to the 'security.review' role's tier-default model as a normal candidate | `t5` |
| resolveSecurityModelCandidate: an absent pin whose tier-default model is itself unlisted/below-floor -> status:'unavailable' | `t5` |
| resolveSecurityModel: candidate already 'unavailable' -> resolves immediately, no probe attempted | `t6` |
| resolveSecurityModel: probe resolves successfully within the deadline -> status:'configured' | `t6` |
| resolveSecurityModel: probe rejects (simulated ENOENT/auth failure) -> status:'unavailable' with a backend-failure blockerReason | `t6` |
| resolveSecurityModel: probe neither resolves nor rejects before opts.deadlineMs -> status:'unavailable' with a timeout blockerReason | `t6` |
| resolveSecurityModel: opts.signal is aborted while the probe is outstanding -> status:'unavailable' with a cancellation blockerReason | `t6` |
| role-taxonomy.ts ROLES: the 'security.review' entry is criticality:'critical' with defaultTier:'core' (mirrors role-taxonomy.test.ts:49's existing 'critical role must default to core' assertion) | `t1` |
| roleDescriptor('security.review') returns the registered descriptor | `t1` |
| resolveSecurityModel against a real CliProvider probe for a valid, floor-eligible pin whose backend is deliberately unreachable, asserting status:'unavailable' with a populated blockerReason within the configured deadline, rather than a hang or a silent substitute model | `t6` |

## 3. References

- **[[c1]]** `prior-artifact` `LLD s1 dataModelChanges: role-taxonomy.ts ROLES registry`
- **[[c2]]** `prior-artifact` `LLD s1 dataModelChanges: config-catalog.ts CONFIG_CATALOG rows (models.security.*)`
- **[[c3]]** `prior-artifact` `LLD s1 dataModelChanges: AnalyzeConfig.tiering.security + parseSecurityModelPin`
- **[[c4]]** `prior-artifact` `LLD s1 dataModelChanges: Security-pin floor-eligibility check`
- **[[c5]]** `prior-artifact` `LLD s1 contractDetails.api: resolveSecurityModelCandidate`
- **[[c6]]** `prior-artifact` `LLD s1 dataModelChanges: SecurityModelSelection (sc1)`
- **[[c7]]** `prior-artifact` `LLD s1 contractDetails.api: resolveSecurityModel`
