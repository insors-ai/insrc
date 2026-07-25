<!-- insrc:artifact LLD-820cc07b9c74195c-s2 -->

# LLD: E20260725820cc07b:S002

**Epic:** `frame-epic-per-role-per-step`
**HLD base run:** `wf-1784970656550-ihypng`
**HLD effective hash:** `253f46361f54...`

## HLD context

**Framework:** Chosen framework (alternative a2): a single RoleRouter choke point mediates every reasoning-model access across the analyze, workflow, and tracker lifecycle. Rather than constructing one provider per run in prepareWorkflowRun, the router resolves a provider per reasoning role by generalizing the existing shaper-vs-summariser split in shaper-provider.ts into a role-keyed resolver. Configuration extends the existing models.analyze.* contract with three capability tiers {core, mid, cheap}, a role→tier assignment map, a coreFloor guarantee, and byRepo role/tier overrides — the legacy shaperProvider key (and its unset-default path) remaining the lowest-precedence fallback. Because every role access flows through one wrapper, the coreFloor clamp, the CLI/Ollama-only dispatch invariant, per-repo precedence, and per-output model attribution are each enforced at exactly one place with no bypassing seam; the two hardcoded top-tier sites are converted to receive the router from context. The higher mechanical threading cost is accepted under the Epic's accuracy-primary / cost-least-priority principle.
**Rollout phase:** Phase B — critical-role capability floor
**Owns:** `sc2` (CoreFloorGuard)
**Consumes:** `sc1` (AnalyzeTieringConfig), `sc4` (ReasoningRoleTaxonomy)

## Contract details

**Surface level:** internal-shared

### `ApplyCoreFloor`

```typescript
type ApplyCoreFloor = (input: FloorInput) => FloorOutcome;
```

**Parameters:**
- `input: FloorInput` — The role (sc4 RoleDescriptor), its resolved tier, and the already-merged configuredFloor (sc1). The per-repo/global floor precedence merge is done upstream by the s3 router; the guard receives a single resolved configuredFloor.

**Returns:** `FloorOutcome` — The effective tier after clamping (>= floor for critical roles), whether a clamp was applied, and — when clamped — the reason 'below-core-floor'. Pure transform; the built-in default floor and rankOf comparison stay module-private (boundary.internal).

**Preconditions:**
- input.role.criticality is read from sc4 (ReasoningRoleTaxonomy); the guard never redefines which roles are critical.
- input.configuredFloor is already resolved by the s3 router (global vs byRepo[repoPath].coreFloor precedence merged upstream); the guard does no precedence resolution.
- Tier ordering is the sc4 rankOf { cheap:0, mid:1, core:2 } imported from s1, not re-declared here.

**Postconditions:**
- For a critical role whose resolvedTier ranks below the effective floor, effectiveTier is raised to the floor, clamped=true, reason='below-core-floor' (ac1).
- When input.configuredFloor is absent, the module-private built-in default minimum is used as the floor (ac2).
- For a peripheral role, resolvedTier passes through unchanged, clamped=false, reason undefined — even when below the critical minimum (ac3).
- A clamp of a critical downgrade is logged via getLogger (no console.log); the log call site is private to the guard.

## Data model changes

### `FloorInput` — new

Input shape for the guard, adopted verbatim from the sc2 interfaceSketch. { role: RoleDescriptor (sc4); resolvedTier: 'core'|'mid'|'cheap'; configuredFloor?: 'core'|'mid'|'cheap'|undefined (sc1, absent => built-in default) }. role carries criticality read from sc4; configuredFloor originates from either the global coreFloor or byRepo[repoPath].coreFloor but arrives already merged.

```
interface FloorInput {
  role: RoleDescriptor;            // from sc4
  resolvedTier: 'core' | 'mid' | 'cheap';
  configuredFloor?: 'core' | 'mid' | 'cheap' | undefined; // from sc1; absent => built-in default
}
```

**Call sites:**
- `src/daemon/workflow-rpc.ts:319-344 (prepareWorkflowRun — the per-run resolution the Epic replaces with per-role resolution; the s3 RoleRouter that supersedes this seam constructs FloorInput after a role's tier is resolved)`
- `src/analyze/context/shaper-provider.ts (buildShaperProvider / byRepo override — the existing role-based split the s3 router generalizes to feed the guard)`

### `FloorOutcome` — new

Result shape returned by ApplyCoreFloor, adopted verbatim from the sc2 interfaceSketch. { effectiveTier: 'core'|'mid'|'cheap' (>= floor for critical roles); clamped: boolean (true when a critical downgrade was raised); reason?: 'below-core-floor'|undefined }. Minimal surface — no provenance fields added — keeping s3/s6 with nothing to re-adapt (winner a1).

```
interface FloorOutcome {
  effectiveTier: 'core' | 'mid' | 'cheap'; // >= floor for critical roles
  clamped: boolean;                        // true when a critical downgrade was raised
  reason?: 'below-core-floor' | undefined;
}
```

**Call sites:**
- `src/daemon/workflow-rpc.ts:319-344 (via the s3 RoleRouter that consumes FloorOutcome.effectiveTier to pick the TierModel/provider — the guard's sole downstream consumer seam)`

## Interaction with shared contracts

| Contract | Role | How |
| :--- | :--- | :--- |
| `sc2` | implements | s2 is the owner of sc2 (CoreFloorGuard) in the HLD boundary. This Story materialises the ApplyCoreFloor signature plus the FloorInput/FloorOutcome shapes exactly as sketched (winner a1, zero divergence). The built-in default floor value, the rankOf tier-rank comparison arithmetic, the 'which roles count as critical' read, and the clamp-logging stay private (boundary.internal); only the two shapes and the ApplyCoreFloor type are exposed to the s3 router. |
| `sc1` | consumes | Consumes the coreFloor semantics of AnalyzeTieringConfig via FloorInput.configuredFloor?: TierName. The guard falls back to its module-private default when absent (ac2). It does not add catalog rows or resolve the global-vs-byRepo precedence — that merge is s3's responsibility at the single router choke point; the guard receives the already-resolved value, keeping precedence enforcement out of s2. |
| `sc4` | consumes | Consumes ReasoningRoleTaxonomy: FloorInput.role is a RoleDescriptor, and the guard reads role.criticality internally to decide whether to clamp (critical) or pass through (peripheral, ac3). The tier ordering comparison uses the sc4 rankOf { cheap:0, mid:1, core:2 }. Both criticality and rankOf are imported from s1, never redefined in s2 (honoring the sc2 centralization assumption). |

## Error paths

### Error cases

- **input.configuredFloor carries a value outside {core,mid,cheap} — e.g. a typo ('high') propagated from the models.analyze.coreFloor or byRepo[repoPath].coreFloor config key (sc1) that escaped catalog validation upstream.** (recoverable)
  - Detection: The guard looks the floor up in the sc4 rankOf map (rankOf[configuredFloor]) to compute the floor rank and gets undefined — there is no rank to compare a critical role's resolvedTier against.
  - Response: Throw InvalidTierError naming the offending value and that it originated from a coreFloor config key. The guard does NOT fall through to pass-through, because a critical role passing below an uninterpretable floor would silently violate ac1 (the exact failure this Story exists to prevent).
  - User impact: The run fails fast with an actionable message pointing at the coreFloor config, instead of a critical reasoning role being silently served below the intended minimum capability.
- **input.resolvedTier is an off-contract value (not 'core'|'mid'|'cheap') — the upstream s3 RoleRouter handed the guard a tier the sc4 taxonomy does not define.** (terminal)
  - Detection: rankOf[resolvedTier] returns undefined when the guard tries to rank the resolved tier against the floor for the comparison.
  - Response: Throw InvalidTierError; the guard cannot compare an unknown tier against the floor, so it refuses to emit a FloorOutcome rather than guess a rank.
  - User impact: A router/contract bug surfaces immediately at the guard boundary rather than producing a silently wrong effectiveTier that s3 would then hand to the provider constructor.
- **input.role.criticality is undefined or an unrecognized value — a malformed sc4 RoleDescriptor (S001 taxonomy contract violation) reaches the guard.** (recoverable)
  - Detection: Reading role.criticality yields a value that matches neither the critical nor the peripheral branch of the guard's classification, so the clamp/pass-through decision cannot be made from the taxonomy read.
  - Response: Fail safe to the accuracy-preserving branch: treat the role as critical and clamp to the effective floor (a safe clamp target exists, unlike the invalid-tier cases), and log the unclassifiable-criticality anomaly via getLogger.
  - User impact: An unclassifiable role is never silently dropped below the floor; it is conservatively protected and the anomaly is logged for the operator to reconcile the taxonomy.

### Edge cases

| Input | Expected |
| :--- | :--- |
| Critical role; configuredFloor='core'; resolvedTier='core' (resolvedTier exactly equals the floor — boundary equality). | effectiveTier='core', clamped=false, reason=undefined — the guard raises only a strict below-floor tier, so an at-floor tier produces no spurious clamp. |
| Critical role; configuredFloor='mid'; resolvedTier='core' (resolvedTier ranks above the floor). | effectiveTier='core', clamped=false, reason=undefined — a tier already at or above the floor passes through unchanged. |
| Critical role; configuredFloor=undefined (no minimum configured); resolvedTier='cheap' (below the built-in default, ac2). | effectiveTier is raised to the module-private built-in default minimum, clamped=true, reason='below-core-floor' — the default floor applies exactly as a configured floor would. |
| Peripheral (non-critical) role; configuredFloor='core'; resolvedTier='cheap' (below the critical minimum, ac3). | effectiveTier='cheap', clamped=false, reason=undefined — the floor never applies to peripheral roles, so a cheaper tier is permitted. |
| Critical role; configuredFloor='cheap' (the lowest tier — a no-op floor); resolvedTier='cheap'. | effectiveTier='cheap', clamped=false, reason=undefined — when the floor is the bottom rank, no resolvedTier can rank below it, so a critical role is never clamped. |

### Invariants to preserve

- A configured minimum capability applies to critical (core) roles and, when none is configured, the module-private built-in default minimum applies; peripheral roles are never floored (ac1/ac2/ac3). This is the guard's whole reason to exist and must hold across every FloorOutcome it returns. [[c1]]
- The global-vs-byRepo[repoPath].coreFloor precedence merge stays OUT of the guard: FloorInput.configuredFloor arrives already resolved by the s3 router, so precedence stays enforced at the single router choke point. Per s1 search.text (config-catalog.ts models.analyze.* + byRepo override) and backFlowNote #3, the guard must not reintroduce precedence resolution. [[c9]]
- The legacy run-wide models.analyze.shaperProvider fallback (default 'ollama', deliberately left unset by the installer) must remain untouched. Per the s1 config.trace bundle, the guard's built-in default floor is a NEW module-private constant that governs only the clamp decision and must not alter the unset-shaperProvider path or the legacy single-provider resolution. [[c9]]

## Test strategy

**Test framework:** `node:test (node's built-in test runner, run via `npx tsx --test`), *.test.ts colocated files — the convention test.locate reported in s1 (role-taxonomy.test.ts / repo-shaper-override.test.ts under src/config/__tests__).`

### Test levels

- **unit** — Exercise the pure ApplyCoreFloor guard as a FloorInput -> FloorOutcome transform with no I/O — proving the clamp/pass-through decision for every criticality x tier x floor combination, including the built-in-default and boundary-equality cases. This is the primary (and near-total) coverage level because the guard is boundary.internal pure logic with no provider/DB seam of its own.
  - Subjects: `ApplyCoreFloor (src/analyze — net-new colocated *.test.ts beside the guard file, mirroring src/config/__tests__/role-taxonomy.test.ts)`, `FloorOutcome shape (effectiveTier / clamped / reason) returned for critical, peripheral, default-floor, and boundary-equality inputs`
  - Fixtures: `RoleDescriptor stubs: one critical role and one peripheral role (criticality read from the sc4 taxonomy contract; construct minimal literals, do not redefine the taxonomy)`, `rankOf { cheap:0, mid:1, core:2 } tier ordering imported from the sc1/sc4 contract (referenced, not re-declared)`, `FloorInput factory helper to vary resolvedTier ('core'|'mid'|'cheap') and configuredFloor ('core'|'mid'|'cheap'|undefined)`, `A captured/spied getLogger sink to assert the critical-downgrade clamp log fires without console.log`
- **unit** — Cover the guard's fail-loud and fail-safe error paths (s5) that protect the ac1 invariant: an uninterpretable configuredFloor or off-contract resolvedTier must throw InvalidTierError rather than silently pass a critical role below the floor, and a malformed role.criticality must fail safe to a clamp with an anomaly log.
  - Subjects: `ApplyCoreFloor InvalidTierError path (unrecognized configuredFloor value, e.g. 'high')`, `ApplyCoreFloor InvalidTierError path (off-contract resolvedTier)`, `ApplyCoreFloor fail-safe branch (undefined/unrecognized role.criticality -> treat as critical, clamp, log anomaly)`
  - Fixtures: `Malformed FloorInput literals with out-of-{core,mid,cheap} floor and tier values`, `RoleDescriptor stub with undefined/unrecognized criticality`, `getLogger spy to assert the unclassifiable-criticality anomaly is logged`

### Acceptance mapping

| Criterion | Proving tests |
| :--- | :--- |
| `ac1` | `critical role with resolvedTier ranking strictly below configuredFloor is raised to the floor: effectiveTier=floor, clamped=true, reason='below-core-floor'`, `the raised critical downgrade is logged via getLogger (no console.log)`, `critical role whose resolvedTier already equals the configuredFloor passes through: effectiveTier unchanged, clamped=false, reason=undefined (strict below-floor only)`, `critical role whose resolvedTier ranks above the configuredFloor passes through unchanged, clamped=false`, `critical role with configuredFloor='cheap' (bottom-rank no-op floor) is never clamped, clamped=false`, `off-contract configuredFloor (e.g. 'high') throws InvalidTierError rather than letting a critical role pass an uninterpretable floor`, `off-contract resolvedTier throws InvalidTierError rather than emitting a guessed effectiveTier` |
| `ac2` | `critical role with configuredFloor undefined and resolvedTier below the built-in default: effectiveTier raised to the module-private default minimum, clamped=true, reason='below-core-floor'`, `critical role with configuredFloor undefined and resolvedTier at/above the built-in default passes through unchanged, clamped=false` |
| `ac3` | `peripheral (non-critical) role with configuredFloor='core' and resolvedTier='cheap' is permitted: effectiveTier='cheap', clamped=false, reason=undefined`, `peripheral role with configuredFloor undefined is never floored by the built-in default: resolvedTier passes through, clamped=false` |

## Migration

**State before:** No core-floor clamp exists. Per s1 symbol.locate, searches for CoreFloorGuard, ApplyCoreFloor, FloorInput/FloorOutcome, rankOf, coreFloor, and roleTiers returned NO hits in the indexed graph — the guard entry point and its shapes are net-new and unmaterialised. The only indexed grounding is AnalyzeTiering (src/config/analyze.ts:123-125), a flat standalone config interface (class.hierarchy: extendsList/implementsList/subclasses/implementers all empty) carrying coreFloor/tiers/roleTiers. Provider capability is resolved run-wide, not per-role: s1 usage.example confirms buildShaperProvider has ~12 callers across the analyze/workflow pipeline; the run-wide seam prepareWorkflowRun (src/daemon/workflow-rpc.ts:319-344) builds one provider for the whole run with no minimum-capability enforcement — a critical role overridden to a weaker model is served as-configured with nothing raising it. The legacy models.analyze.shaperProvider key (default 'ollama', installer leaves it unset) is the lowest-precedence run-wide fallback (s1 config.trace). The analyze package root (src/analyze, 779 entities) has ZERO top-level re-exports — no barrel — so consumers import by concrete path.

**State after:** A pure, module-private CoreFloorGuard exists in the analyze package as a concrete-path import (no barrel). It exposes exactly the sc2 surface: the ApplyCoreFloor type plus the FloorInput and FloorOutcome shapes (verbatim from the contract sketch). Given a resolved role/tier and an already-merged configuredFloor, ApplyCoreFloor raises a critical role's effectiveTier to at least the floor (clamped=true, reason='below-core-floor'), applies a module-private built-in default minimum when configuredFloor is absent, and passes peripheral roles through unchanged (clamped=false, reason undefined). The built-in default floor value, the rankOf tier-rank comparison, the criticality read, and the clamp log call site stay private to the guard (boundary.internal). The guard resolves no providers and has no wired consumer yet — its sole downstream seam, the s3 RoleRouter feeding FloorOutcome.effectiveTier into provider construction, is out of s2 scope. Run-wide buildShaperProvider resolution and the unset legacy shaperProvider fallback are unchanged.

**Zero downtime:** yes — **Data rewrite:** no

### Steps

1. Add the new guard file under src/analyze using the module's kebab-case file-naming plurality (imported by concrete path since the package root has no barrel). Declare the two new data shapes verbatim from the sc2 sketch: FloorInput { role: RoleDescriptor; resolvedTier; configuredFloor? } and FloorOutcome { effectiveTier; clamped; reason? }. Additive net-new file with no consumers wired yet. — ↩ rollbackable
2. Import the sc4/sc1 contracts from S001 rather than redefining them: RoleDescriptor and role.criticality from ReasoningRoleTaxonomy, the rankOf { cheap:0, mid:1, core:2 } tier ordering, and the TierName union for configuredFloor. Confirm the exact S001 import path (likely src/config/analyze.ts or a taxonomy sibling under src/config) once S001 is built; do not re-declare criticality or rankOf. — ↩ rollbackable _(needs: `s1-built`)_
3. Add a module-private built-in default floor constant inside the guard (boundary.internal). Pick the default value at LLD — no existing constant to reuse. It must govern only the clamp decision and must NOT be surfaced beyond the guard nor alter the unset-shaperProvider fallback path. — ↩ rollbackable
4. Implement the ApplyCoreFloor pure transform: for a critical role whose resolvedTier ranks below the effective floor (configuredFloor, or the built-in default when absent), raise effectiveTier to the floor and set clamped=true, reason='below-core-floor' (ac1, ac2); for a peripheral role pass resolvedTier through unchanged with clamped=false, reason undefined even when below the critical minimum (ac3). No precedence resolution here — configuredFloor arrives already merged from s3. — ↩ rollbackable
5. Add a private getLogger('...') call site inside the guard that logs when a critical downgrade is clamped (no console.log). New log call site, private per boundary.internal. — ↩ rollbackable
6. Add a colocated *.test file beside the guard mirroring src/config/__tests__/role-taxonomy.test.ts, covering ac1 (critical below floor raised, clamped=true, reason='below-core-floor'), ac2 (absent configuredFloor => built-in default applies), and ac3 (peripheral below floor permitted, clamped=false). — ↩ rollbackable

**Backward compat:** No existing public API changes — surfaceLevel is internal-shared and every symbol (ApplyCoreFloor, FloorInput, FloorOutcome) is net-new with no current callers; the guard is consumed only by the future s3 RoleRouter, so nothing existing is broken or re-adapted. What must be preserved and is NOT touched by s2: (1) the run-wide buildShaperProvider resolution and its sole caller prepareWorkflowRun (src/daemon/workflow-rpc.ts:319-344) keep working unchanged until s3 supersedes that seam; (2) the legacy models.analyze.shaperProvider fallback (default 'ollama', deliberately left unset by the installer) stays the lowest-precedence path — the guard's built-in default floor is a module-private constant that governs only the clamp decision and must not alter the unset-shaperProvider path; (3) the guard does no global-vs-byRepo[repoPath].coreFloor precedence merge — it receives an already-resolved configuredFloor, keeping precedence enforcement at the single s3 router choke point. The FloorOutcome surface is kept minimal (no provenance fields) so s3/s6 have nothing to re-adapt.

## Alternatives considered

### a1: Literal HLD shape — RoleDescriptor-in, pure ApplyCoreFloor — **CHOSEN**

Adopt the sc2 sketch verbatim: a pure ApplyCoreFloor(FloorInput)->FloorOutcome that takes the full RoleDescriptor and reads criticality itself.

The guard is a single exported pure function typed exactly as the HLD sc2 sketch: FloorInput { role: RoleDescriptor (sc4); resolvedTier; configuredFloor? }, FloorOutcome { effectiveTier; clamped; reason? }, type ApplyCoreFloor = (FloorInput) => FloorOutcome. The guard imports RoleDescriptor + rankOf from sc4 and reads role.criticality internally; the built-in default floor constant, the rankOf-based below-floor arithmetic, and the getLogger clamp log all stay module-private (boundary.internal). Colocated *.test.ts mirrors role-taxonomy.test.ts covering ac1/ac2/ac3.

### a2: Criticality-narrowed input — drop RoleDescriptor, pass the bit

FloorInput carries a plain criticality flag instead of the whole RoleDescriptor, so the guard depends on sc4 only for rankOf.

Keep FloorOutcome and the ApplyCoreFloor signature as sketched, but reshape FloorInput to { criticality: Criticality; resolvedTier; configuredFloor? } — the router (s3) extracts criticality from the RoleDescriptor and hands the guard only what it clamps against. The guard imports just rankOf from sc4 (the tier ordering) and never sees RoleDescriptor. Default floor, arithmetic, and clamp logging remain module-private. Tests feed criticality directly, removing any RoleDescriptor construction.

**Rejected because:** Cleanest dependency surface and test ergonomics, but it diverges from the HLD sc2 sketch and relocates the criticality read out of the guard, partially violating sc2's centralization assumption and diffusing the k2 invariant (single source of truth for 'which roles are critical' asserted at the call site rather than in the guard) — enough to rank below a1 and a3.

### a3: Provenance-rich FloorOutcome for attribution

Keep RoleDescriptor-in but widen FloorOutcome with requestedTier + floorSource so s6 attribution and logging read provenance without recomputation.

FloorInput stays as the sketch (role: RoleDescriptor). FloorOutcome is extended additively: { effectiveTier; clamped; reason?; requestedTier: 'core'|'mid'|'cheap'; floorSource: 'configured'|'default' }. requestedTier echoes the pre-clamp resolvedTier and floorSource records whether the applied floor came from configuredFloor or the built-in default (ac2). ApplyCoreFloor signature is unchanged in shape. The guard still keeps the default value + arithmetic private; the new fields are pure derivations already computed inside the clamp. Logging reads floorSource for the audit line.

**Rejected because:** Strongest for the s6 attribution consumer — feeds sc5 per-output provenance without recomputation — but the widened FloorOutcome (requestedTier + floorSource) partially compromises sc2's minimal-surface / boundary.internal assumption (floorSource leaks that a default path exists), so it ranks below the zero-divergence a1.

### a4: Guard factory with injected default floor + logger

Expose createCoreFloorGuard(deps) that returns an ApplyCoreFloor, injecting the built-in default floor and logger instead of module constants.

The public type stays ApplyCoreFloor = (FloorInput) => FloorOutcome with FloorInput/FloorOutcome exactly as sketched, but instead of exporting a bare function the guard exports a factory: createCoreFloorGuard({ defaultFloor?: TierName; logger? }) => ApplyCoreFloor. The default floor value and getLogger('...') are resolved once at construction (falling back to the private built-in default when omitted), and the returned closure performs the pure clamp. s3 constructs the guard once per run and threads the resulting ApplyCoreFloor; the built-in default still lives inside the module as the factory's fallback.

**Rejected because:** Best test-injection ergonomics, but adds an un-mandated createCoreFloorGuard construction seam (partial sc2) and an injectable defaultFloor that partially threatens the ac2 and k2 minimum-capability guarantees (a caller could override the built-in minimum unless the seam is locked internal) — the heaviest option for a guard whose logic is one rankOf comparison, so it ranks last.

## Citations

- **[[c1]]** `step-output` `s3 judgments + Story acceptance ac1/ac2/ac3 — the core clamp behavior (critical roles floored to the configured-or-default minimum, peripheral roles never floored) that the guard exists to enforce; scored `satisfies` for winner a1 on ac1/ac2/ac3 and k2.`
- **[[c2]]** `analyze-bundle` `s1 symbol.locate — AnalyzeTiering resolved to src/config/analyze.ts:123-125 (coreFloor/tiers/roleTiers); CoreFloorGuard/ApplyCoreFloor/FloorInput/FloorOutcome/rankOf net-new, no graph hits.`
- **[[c3]]** `analyze-bundle` `s1 data-model.trace — class.hierarchy on AnalyzeTiering (entity 73e3480cbc825826f66c310bb5a498b9) is a flat standalone interface (extendsList/implementsList/subclasses/implementers empty); the guard consumes its fields, does not extend it.`
- **[[c4]]** `analyze-bundle` `s1 module.profile — src/analyze (779 entities) has zero top-level re-exports (no barrel); kebab-case file-naming plurality, *.test suffix, camelCase functions / PascalCase types.`
- **[[c5]]** `analyze-bundle` `s1 test.locate — src/config/__tests__/role-taxonomy.test.ts exercises the sc4 ReasoningRoleTaxonomy; the nearest sibling pattern the colocated guard unit tests mirror for ac1/ac2/ac3.`
- **[[c6]]** `analyze-bundle` `s1 usage.example — buildShaperProvider has ~12 callers; prepareWorkflowRun (src/daemon/workflow-rpc.ts:319-344) is the per-run resolution seam the Epic replaces with per-role resolution via the s3 RoleRouter that consumes FloorOutcome.effectiveTier.`
- **[[c7]]** `analyze-bundle` `s1 module.profile — shaper-provider.ts buildShaperProvider (183-241) / buildSummariserProvider (256-269) role split + byRepo[repoPath].shaperProvider override (line 65); CliProvider (src/agent/providers/cli-provider.ts:88-345) already accepts a model option.`
- **[[c8]]** `step-output` `s5 amendmentProposal — sharedContract.methodAdd of InvalidTierError to sc2 ApplyCoreFloor (sc4 lists errors:[]); fail-loud on unrecognized configuredFloor / off-contract resolvedTier to preserve the ac1 invariant.`
- **[[c9]]** `analyze-bundle` `s1 search.text + config.trace — src/cli/config-catalog.ts:52-62 models.analyze.* + byRepo[repoPath].coreFloor override (precedence merge stays in s3, per repo-shaper-override.test.ts:34-82) and the legacy models.analyze.shaperProvider fallback (default 'ollama', installer leaves unset) the guard must not disturb.`

<!-- insrc:review -->

## Review

### ⛔ Review `BLOCK` — design.story (design.story)

**0 HIGH · 1 MED · 8 LOW** · model `client` · reviewed 2026-07-25T13:38:48.953Z

| Ref | Kind | Severity | Fixability | Premise | Evidence | Action |
| --- | --- | --- | --- | --- | --- | --- |
| c6 | inventory | MED | auto | buildShaperProvider has exactly ONE caller (prepareWorkflowRun) in the codebase. | ripgrep for `buildShaperProvider\\(` over src (excluding defs/imports/tests) returns 12 real call sites in distinct files: daemon/workflow-rpc.ts:341, analyze/classifier/scope-picker.ts:125, classifier/driver.ts:128, explore/capability-reuse-check.ts:128, explore/doc-decision-trace.ts:119, explore/doc-constraint-enumerate.ts:112, workflow/questions.ts:172, runtimes/shared/adherence.ts:213, runtimes/shared/aggregator.ts:75, planner/driver.ts:166, context/decomposer.ts:159, context/synthesizer.ts:116. The premise 'exactly ONE caller (prepareWorkflowRun)' is contradicted — prepareWorkflowRun is only the run-wide seam among ~12. | Correct the 'exactly ONE caller' restatement to '~12 callers'. S002's own build is unaffected (the guard is pure and never touches buildShaperProvider — it is consumed only by the s3 router), so this is non-blocking context imprecision carried from the HLD, but it must be fixed so S003/S005 do not under-scope the call-site conversion. |
| c2 | citation | LOW | manual | AnalyzeTiering is defined in src/config/analyze.ts around lines 123-125 carrying coreFloor/tiers/roleTiers. | `export interface AnalyzeTiering extends TieringOverride` resolves at src/config/analyze.ts:123; coreFloor/tiers/roleTiers fields present (via TieringOverride). Matches the cited 123-125. | none — verified sound |
| c7 | citation | LOW | manual | shaper-provider.ts defines buildShaperProvider (~183-241) and buildSummariserProvider (~256-269) with a byRepo shaperProvider override. | buildShaperProvider defined at shaper-provider.ts:183 and buildSummariserProvider at :256 — matching the cited ~183-241 / ~256-269 ranges. | none — verified sound |
| c6 | citation | LOW | manual | prepareWorkflowRun in src/daemon/workflow-rpc.ts builds one provider per run (around lines 319-344). | `export function prepareWorkflowRun` at src/daemon/workflow-rpc.ts:319 — matches the cited 319-344. | none — verified sound |
| c9 | citation | LOW | manual | config-catalog.ts carries models.analyze.* rows including a coreFloor override key. | models.analyze.coreFloor row present at src/cli/config-catalog.ts:64 (plus tiers.* rows following). The models.analyze.* block cited at 52-62 is the shaper section; the coreFloor/tiers rows sit just after at 64-70. Substantively correct. | none — verified sound |
| c5 | citation | LOW | manual | src/config/__tests__/role-taxonomy.test.ts exists and exercises the sc4 ReasoningRoleTaxonomy (the sibling the guard's tests mirror). | src/config/__tests__/role-taxonomy.test.ts exists and imports reasoningRoleTaxonomy — the sibling test the guard's tests mirror. | none — verified sound |
| c3 | semantic | LOW | manual | The sc4 tier ordering rankOf { cheap:0, mid:1, core:2 } that the guard imports is defined in the S001 role taxonomy, not re-declared in the guard. | RANK_OF = { cheap: 0, mid: 1, core: 2 } at src/config/role-taxonomy.ts:49, exposed as taxonomy.rankOf (:97). Matches the sc4 rankOf the guard imports; not re-declared. | none — verified sound |
| sc4 | semantic | LOW | manual | RoleDescriptor carries a criticality field (critical\|peripheral) the guard reads to decide clamp vs pass-through. | interface RoleDescriptor at role-taxonomy.ts:35 carries `readonly criticality: Criticality` (:37). The guard reads this to decide clamp vs pass-through. | none — verified sound |
| c9 | citation | LOW | manual | repo-shaper-override.test.ts exists (lines ~34-82) covering the byRepo shaperProvider precedence the guard must not re-implement. | repo-shaper-override.test.ts exists at src/config/__tests__/repo-shaper-override.test.ts and covers byRepo shaperProvider precedence. The LLD c9 cites the bare filename (no dir), so the citation is sound. | none — verified sound |

#### Proposed fixes

- **c6** (auto) — Replace the inaccurate ONE-caller count with the re-derived 12-caller count in both the migration State-before narrative and citation c6, without changing the surrounding scope claims.
  - edit: `buildShaperProvider has exactly ONE caller, prepareWorkflowRun (src/daemon/workflow-rpc.ts:319-344), which builds one provider for the whole run` → `buildShaperProvider has ~12 callers across the analyze/workflow pipeline; the run-wide seam prepareWorkflowRun (src/daemon/workflow-rpc.ts:319-344) builds one provider for the whole run`
  - edit: `buildShaperProvider has exactly ONE caller, prepareWorkflowRun (src/daemon/workflow-rpc.ts:319-344), the per-run resolution seam` → `buildShaperProvider has ~12 callers; prepareWorkflowRun (src/daemon/workflow-rpc.ts:319-344) is the per-run resolution seam`
