<!-- insrc:artifact LLD-820cc07b9c74195c-s3 -->

# LLD: E20260725820cc07b:S003

**Epic:** `frame-epic-per-role-per-step`
**HLD base run:** `wf-1784970656550-ihypng`
**HLD effective hash:** `253f46361f54...`

## HLD context

**Framework:** Chosen framework (alternative a2): a single RoleRouter choke point mediates every reasoning-model access across the analyze, workflow, and tracker lifecycle. Rather than constructing one provider per run in prepareWorkflowRun, the router resolves a provider per reasoning role by generalizing the existing shaper-vs-summariser split in shaper-provider.ts into a role-keyed resolver. Configuration extends the existing models.analyze.* contract with three capability tiers {core, mid, cheap}, a role→tier assignment map, a coreFloor guarantee, and byRepo role/tier overrides — the legacy shaperProvider key (and its unset-default path) remaining the lowest-precedence fallback. Because every role access flows through one wrapper, the coreFloor clamp, the CLI/Ollama-only dispatch invariant, per-repo precedence, and per-output model attribution are each enforced at exactly one place with no bypassing seam; the two hardcoded top-tier sites are converted to receive the router from context. The higher mechanical threading cost is accepted under the Epic's accuracy-primary / cost-least-priority principle.
**Rollout phase:** Phase C — role router choke point
**Owns:** `sc3` (RoleRouter)
**Consumes:** `sc1` (AnalyzeTieringConfig), `sc4` (ReasoningRoleTaxonomy), `sc2` (CoreFloorGuard)

## Contract details

**Surface level:** internal-shared

### `resolveProviderForRole`

```typescript
resolveProviderForRole(role: RoleId, cfg: AnalyzeTieringConfig, repoPath?: string): ResolvedProvider
```

**Parameters:**
- `role: RoleId (sc4 — opaque intent-named string, e.g. 'design.story.detail' | 'analyze.narrow')` — The reasoning site being served; keyed into the sc4 taxonomy for criticality + defaultTier and into cfg.roleTiers for its assigned tier.
- `cfg: AnalyzeTieringConfig (sc1 — the AnalyzeConfig at src/config/analyze.ts extended with tiers/roleTiers/coreFloor/byRepo + legacy shaperProvider/shaperModel)` — Supplies the precedence inputs for the pure resolveRole merge AND (as the underlying AnalyzeConfig) the shaperModel / shaper.ollamaNumCtx that materialize forwards to buildShaperProvider.
- `repoPath: string | undefined` _(optional)_ — Absolute repo path for the byRepo override lookup (read FRESH via resolveRepoShaperProvider, never the global cache) and the per-(role,repoPath) cache key. Omitted => no per-repo layer, global-only resolution.

**Returns:** `ResolvedProvider` — The constructed provider for this role plus a side-effect-free RoleResolution record (role, tier, runner, model, clampedByFloor). Composed as materialize(resolveRole(...)); the provider is memoized per (role, repoPath) for the run so repeated resolutions never rebuild a CLI subprocess wrapper.

**Errors:**
- `none (total function)` when Never throws for an unknown RoleId or a misconfigured tier: an unlisted role falls to its sc4 defaultTier, and a tier whose runner is outside the union is coerced to 'ollama' (parseShaperProvider-style), so resolution always yields a valid provider.

**Preconditions:**
- cfg is the extended AnalyzeConfig loaded via loadAnalyzeConfig() and already carries the additive sc1 keys.
- The sc4 ReasoningRoleTaxonomy (criticality + defaultTier + tier rank) and the sc2 ApplyCoreFloor guard are resolvable.

**Postconditions:**
- resolution.runner is one of 'ollama' | 'cli-claude' | 'cli-codex' — the k1/ac2 CLI-or-Ollama-only invariant, enforced structurally by the union type AND funnelled through resolveShaperKind as the single admission point; no direct-REST path is reachable at any tier.
- Precedence obeyed (ac3): byRepo role tier > global role tier > tier default > legacy shaperProvider > unset default; the whole ordering lives in the pure resolveRole so it is assertable with zero provider construction.
- For a critical role (sc4), resolution.tier >= the configured (or built-in default) coreFloor via ApplyCoreFloor; clampedByFloor is true and the downgrade is logged via getLogger when a raise occurred (sc2 + observability NFR); peripheral roles may resolve below the floor.
- An ambiently active MCP sampler (runWithSamplerContext) still wins over tier resolution — construction routes through McpSamplingProvider — preserving the existing MCP-integration precedence above the router.
- The returned RoleResolution is pure/loggable, usable in dry-run/audit paths without building a provider.

### `resolveSummariser`

```typescript
resolveSummariser(cfg: AnalyzeTieringConfig): ResolvedProvider
```

**Parameters:**
- `cfg: AnalyzeTieringConfig (sc1)` — Provides summariserProvider / summariserModel; the summariser tier is decided independently of the shaper/role tiers.

**Returns:** `ResolvedProvider` — The background doc-summariser provider (delegating to buildSummariserProvider) with a RoleResolution stamped for a fixed summariser role, so summariser access is attributed like every other role while staying LOCAL by default.

**Preconditions:**
- cfg is the extended AnalyzeConfig loaded via loadAnalyzeConfig().

**Postconditions:**
- The summariser stays local (Ollama) regardless of the shaper/role tier — preserving buildSummariserProvider's deliberate decoupling — and only routes through a CLI when cfg.summariserProvider is explicitly 'cli-*'.
- resolution.runner remains within the CLI/Ollama union (k1).

### `buildShaperProvider`

```typescript
buildShaperProvider(cfg: AnalyzeConfig, overrides?: ShaperProviderOverrides): LLMProvider
```

**Parameters:**
- `cfg: AnalyzeConfig` — Base config for shaperModel / shaper.ollamaNumCtx / explicit flags; unchanged type-level.
- `overrides: ShaperProviderOverrides (reshaped — see dataModel: gains an optional router-resolved runner + model)` _(optional)_ — The router's materialize passes the resolveRole result here (resolved runner + concrete tier model) so a tier like 'mid' can build a CLI provider with, e.g., a sonnet model — a capability today's cfg.shaperModel-only path cannot express.

**Returns:** `LLMProvider` — The concrete provider (OllamaProvider | CliProvider | McpSamplingProvider). Unchanged return type; s3 reuses this as the private construction primitive rather than reimplementing CLI/Ollama wiring.

**Preconditions:**
- resolveShaperKind remains the admission point deciding the runner union — the router feeds its resolved runner in as the top-priority input so the k1 gate is enforced in exactly one place (ac2).

**Postconditions:**
- Type-level signature is unchanged; only the internal ShaperProviderOverrides shape is extended additively, so existing callers (incl. prepareWorkflowRun) keep compiling.
- Sampler / ambient-context precedence above the resolved kind is preserved.

### `buildSummariserProvider`

```typescript
buildSummariserProvider(cfg: AnalyzeConfig): LLMProvider
```

**Parameters:**
- `cfg: AnalyzeConfig` — Reads cfg.summariser* to build the local-by-default summariser provider.

**Returns:** `LLMProvider` — The summariser provider, reused verbatim by resolveSummariser — no type-level change.

**Preconditions:**
- Ignores sampler + client-provider ambient contexts by design; that behaviour is retained.

**Postconditions:**
- resolveSummariser delegates here so the summariser-stays-local guarantee is not re-implemented, only wrapped in a RoleResolution.

### `resolveShaperKind`

```typescript
resolveShaperKind(inputs: { repoOverride?: AnalyzeShaperProviderKind; globalExplicit?: AnalyzeShaperProviderKind; clientDefault?: AnalyzeShaperProviderKind; roleResolved?: AnalyzeShaperProviderKind }): AnalyzeShaperProviderKind
```

**Parameters:**
- `inputs: object of AnalyzeShaperProviderKind | undefined signals (reshaped: gains an optional top-priority roleResolved input)` — Pure resolution of the effective runner. s3 threads the router-resolved runner through the new highest-priority roleResolved input so the CLI/Ollama union gate (k1/ac2) stays centralized here rather than being re-decided inside the router.

**Returns:** `AnalyzeShaperProviderKind ('ollama' | 'cli-claude' | 'cli-codex')` — The admitted runner — structurally constrained to the union, guaranteeing no REST path (k1). Remains the single admission point the s1 profile flags as load-bearing.

**Preconditions:**
- Pure function, no side effects; unit-testable in isolation (already exported for this).

**Postconditions:**
- New roleResolved input, when present, takes precedence over repoOverride/globalExplicit/clientDefault, letting the router pin its tier-resolved runner while the fallback chain (…?? 'ollama') is preserved for legacy callers (ac3, k3, k5).
- Additive change: existing three-input callers keep resolving identically.

### `prepareWorkflowRun`

```typescript
prepareWorkflowRun(rawParams: unknown): PreparedWorkflowRun
```

**Parameters:**
- `rawParams: unknown` — Raw workflow.run params (repo, workflow, focus, client, review, …), parsed + validated.

**Returns:** `PreparedWorkflowRun (field-add: gains router: RoleRouter — see dataModel)` — The ready-to-drive bundle. s3 supersedes its single per-run buildShaperProvider(cfg, {...}) construction: it now creates the RoleRouter (carrying the run's cliTimeoutMs + repoOverride/clientDefault as construction deps) and exposes it on router, while keeping the legacy scalar provider/modelLabel populated from the driver role's resolution for back-compat.

**Errors:**
- `Error` when No repo resolvable (neither params.repo nor INSRC_REPO set) — unchanged from today (workflow-rpc.ts:322-324).

**Preconditions:**
- This is the SOLE run-wide seam s3 reroutes (buildShaperProvider actually has ~12 callers; prepareWorkflowRun is its sole run-wide *workflow* seam). The ~11 other per-operation buildShaperProvider sites are explicitly deferred to S005 and are NOT in s3's scope.

**Postconditions:**
- provider / modelLabel remain present and behave identically for the driver role, so no downstream reader breaks before S005's per-output attribution (sc5) lands; the added router field is additive and back-compat.
- The workflow driver can resolve per-step providers via prep.router.resolveProviderForRole(...), delivering ac1 (each operation served by its own role's model) at the one seam s3 owns.

## Data model changes

### `RoleResolution` — new

The side-effect-free record every resolution emits (sc3 shape): { role: RoleId; tier: 'core'|'mid'|'cheap'; runner: 'ollama'|'cli-claude'|'cli-codex'; model: string; clampedByFloor: boolean }. Produced by the pure resolveRole (a3's isolated decision phase) BEFORE any provider construction, so ac3 precedence and the sc2 floor clamp are assertable with zero LLM/subprocess cost. Logged via getLogger on every critical-downgrade clamp (observability NFR). The 'runner' field is the type-level surface of the k1 invariant.

```
+ interface RoleResolution { role: RoleId; tier: 'core'|'mid'|'cheap'; runner: 'ollama'|'cli-claude'|'cli-codex'; model: string; clampedByFloor: boolean }
```

**Call sites:**
- `src/analyze/context/role-router.ts (NEW — resolveRole produces it; materialize consumes it)`
- `src/analyze/context/shaper-provider.ts (resolveShaperKind admits the runner)`
- `src/daemon/workflow-rpc.ts:319-344 (prepareWorkflowRun / driver read it for modelLabel + logging)`

### `ResolvedProvider` — new

The RoleRouter return shape (sc3): { provider: LLMProvider; resolution: RoleResolution }. materialize wraps the constructed provider (built via buildShaperProvider/buildSummariserProvider through the resolveShaperKind admission point) together with its resolution. The provider field is the attribution wrap-point where sc5 per-output attribution plugs in later (owned by another story) — s3 only guarantees the resolution record is attached.

```
+ interface ResolvedProvider { provider: LLMProvider; resolution: RoleResolution }
```

**Call sites:**
- `src/analyze/context/role-router.ts (NEW — resolveProviderForRole / resolveSummariser return it)`
- `src/daemon/workflow-rpc.ts:319-344 (driver consumes .provider per step)`

### `RoleResolutionCache` — new

Internal per-(role, repoPath) memo living inside the RoleRouter (a3: at the single choke point, not dispersed to callers). Keyed by `${role} ${repoPath ?? ''}` -> ResolvedProvider, so repeated per-step resolutions within one run never rebuild a CliProvider subprocess wrapper (performance NFR). Private to src/analyze/context/role-router.ts; not part of the exposed contract.

```
+ (private) Map<string, ResolvedProvider>  // key: role   repoPath
```

**Call sites:**
- `src/analyze/context/role-router.ts (NEW — populated/read by resolveProviderForRole)`

### `ShaperProviderOverrides` — field-add

Existing internal overrides bag (shaper-provider.ts:59-80, NOT an HLD contract). Add two optional additive fields the router's materialize populates: roleRunner?: AnalyzeShaperProviderKind (the resolveRole-resolved runner, fed as the top-priority resolveShaperKind input) and roleModel?: string (the resolved tier's concrete model id, so 'mid'/'cheap' tiers can pin a CLI model that cfg.shaperModel alone cannot express). Additive: sampler / repoOverride / clientDefault / cliTimeoutMs semantics are untouched, existing callers keep compiling.

```
interface ShaperProviderOverrides {
   readonly sampler?: SamplingCallback | undefined;
   readonly modelHints?: readonly string[] | undefined;
   readonly repoOverride?: AnalyzeShaperProviderKind | undefined;
   readonly clientDefault?: AnalyzeShaperProviderKind | undefined;
   readonly cliTimeoutMs?: number | undefined;
+  readonly roleRunner?: AnalyzeShaperProviderKind | undefined;
+  readonly roleModel?: string | undefined;
 }
```

**Call sites:**
- `src/analyze/context/shaper-provider.ts:183-241 (buildShaperProvider consumes the new fields)`
- `src/analyze/context/role-router.ts (NEW — materialize sets them)`
- `src/daemon/workflow-rpc.ts:341 (existing caller — unaffected, passes neither new field)`

### `PreparedWorkflowRun` — field-add

The run bundle (workflow-rpc.ts:302-314) currently carries a scalar provider + modelLabel from one per-run buildShaperProvider call. s3 adds router: RoleRouter (constructed with the run's cliTimeoutMs + repoOverride + clientDefault as deps) so the driver can resolve providers per step, per role. Additive + back-compat: provider/modelLabel stay populated from the driver role's resolution until S005/sc5 replace the scalar meta.model with per-output attribution. s3 does NOT touch the other ~12 sites (S005).

```
interface PreparedWorkflowRun {
   readonly intent: WorkflowIntent;
   readonly runId: string;
   readonly epicKey: string;
   readonly provider: LLMProvider;        // retained, back-compat (driver role)
   readonly modelLabel: string;           // retained, back-compat
   readonly clientDefault: AnalyzeShaperProviderKind | undefined;
   readonly review: boolean | undefined;
+  readonly router: RoleRouter;           // per-step, per-role resolution
 }
```

**Call sites:**
- `src/daemon/workflow-rpc.ts:302-344 (interface def + prepareWorkflowRun populates router)`
- `src/daemon/workflow-rpc.ts:348+ (runStart / async registry drive with prep.router)`

## Interaction with shared contracts

| Contract | Role | How |
| :--- | :--- | :--- |
| `sc3` | implements | s3 owns and ships RoleRouter (ownedByStory: s3). The public surface is exactly resolveProviderForRole(role, cfg, repoPath?) and resolveSummariser(cfg) returning ResolvedProvider, verbatim to the HLD interfaceSketch. Internally (a3, s3-private) it decomposes into a pure resolveRole (the precedence merge + sc2 clamp -> RoleResolution, testable with no construction) composed with materialize (construction via buildShaperProvider/buildSummariserProvider + per-(role,repo) cache). Lands in a NEW module src/analyze/context/role-router.ts co-located with shaper-provider.ts (physical-landing gap 2 resolved: keeps resolveShaperKind + buildSummariserProvider reachable while isolating the risky merge). Consumers (s4/s5/s6) see only the sketched contract. |
| `sc1` | consumes | resolveRole reads AnalyzeTieringConfig — the AnalyzeConfig at src/config/analyze.ts extended with tiers / roleTiers / coreFloor / byRepo plus the legacy shaperProvider/shaperModel — to run the additive precedence merge (byRepo role -> global role -> tier default -> legacy shaperProvider -> unset default). Because the sc1 keys land on AnalyzeConfig itself (s1 data-model.trace), the same cfg also supplies shaperModel / shaper.ollamaNumCtx that materialize forwards to buildShaperProvider. byRepo lookups reuse resolveRepoShaperProvider (read FRESH from disk). No pre-existing key is replaced (k4); the unset-default path survives untouched (k3). |
| `sc2` | consumes | resolveRole invokes the sc2 ApplyCoreFloor guard for every role: it passes { role (RoleDescriptor from sc4), resolvedTier, configuredFloor } and stamps the returned effectiveTier + clamped flag into RoleResolution.clampedByFloor. The floor's built-in default value and tier-rank arithmetic stay private to s2; s3 only reads the FloorInput/FloorOutcome shapes. Critical-role downgrades that get raised are logged via getLogger (k2 + observability NFR). |
| `sc4` | consumes | resolveRole treats RoleId as opaque and reads the sc4 ReasoningRoleTaxonomy for the role's criticality (drives whether the sc2 floor applies), defaultTier (fallback when neither byRepo nor global roleTiers assign a tier), and the cheap<mid<core rank (used by the floor comparison). s3 tests stub the taxonomy rather than hardcode the enum, since the closed RoleId set (incl. the two hardcoded top-tier sites) is pinned by s1/sc4, not s3 (backFlowNotes gap 4). |

## Error paths

### Error cases

- **A tier definition in cfg.tiers[*].runner (or a hand-edited legacy shaperProvider) carries a runner string outside the CLI/Ollama union — e.g. 'openai' or a typo'd 'cli-claud'.** (recoverable)
  - Detection: resolveShaperKind's parseShaperProvider-style switch/`?? 'ollama'` default matches no union member, so the non-union string is caught at the single admission point rather than propagating into provider construction.
  - Response: Coerce to 'ollama' (the structural union floor), stamp resolution.runner='ollama', and log the coercion via getLogger so the misconfiguration is visible; resolution still returns a valid ResolvedProvider.
  - User impact: The affected role is served locally by Ollama instead of a nonexistent runner; no crash, and a log line names the offending value so the operator can fix the config.
- **cfg.roleTiers assigns a role a tier name that is not one of core|mid|cheap (stale key after a rename, or a typo).** (recoverable)
  - Detection: resolveRole looks the assigned tier up in cfg.tiers, finds no matching entry, and the miss is noticed inside the pure merge before materialize.
  - Response: Fall through to the role's sc4 defaultTier for that role (as if no override were configured), preserving the ac3 precedence chain; record the resolved (defaulted) tier in RoleResolution.
  - User impact: The role resolves to its taxonomy default tier rather than an undefined one; behavior is deterministic and the run proceeds.
- **prepareWorkflowRun is invoked with neither params.repo nor INSRC_REPO set, so no repo can be resolved for the run (and therefore no byRepo layer).** (terminal)
  - Detection: The existing repo-resolution guard at workflow-rpc.ts:322-324 finds both sources undefined and throws before any RoleRouter is constructed.
  - Response: Throw Error (unchanged from today) — the run cannot be prepared; the RoleRouter is never built because there is no run to serve.
  - User impact: The workflow.run call fails fast with a clear 'no repo' error instead of silently resolving providers against an empty repo path.
- **A mid/cheap tier resolves to runner cli-claude or cli-codex but the corresponding CLI binary is missing or unauthenticated on the host.** (terminal)
  - Detection: buildShaperProvider constructs a CliProvider (src/agent/providers/cli-provider.ts) whose subprocess spawn returns ENOENT / a nonzero auth exit at first completion; the failure surfaces from the provider, not from resolveRole (which is pure and had already succeeded).
  - Response: The resolution record (RoleResolution) is still valid and loggable; the provider error propagates to the caller at invoke time. s3 does not swallow it — the run step fails with the CLI's error, and the resolution log shows which role/tier/runner was chosen so the missing-binary cause is attributable.
  - User impact: The step for that role fails with the underlying CLI spawn error; because resolution and construction are separated, the audit log still shows the intended role→tier→runner mapping.
- **The sc4 ReasoningRoleTaxonomy is queried for a RoleId that is not in the closed role set (a caller passes an intent name the taxonomy has not registered).** (recoverable)
  - Detection: resolveRole's taxonomy lookup returns no descriptor for the RoleId; the miss is detected inside resolveRole where criticality/defaultTier would be read.
  - Response: Treat the role as non-critical and fall to a built-in default tier (total-function contract — never throw for an unknown RoleId); the coreFloor clamp is not applied since criticality is unknown/false.
  - User impact: An unregistered role still resolves to a working provider rather than crashing the run; it simply does not get floor protection, which is the safe (non-blocking) direction.
- **cfg.coreFloor holds a value that is not a rankable tier (e.g. an empty string or a stale tier name) while a critical role is being resolved.** (recoverable)
  - Detection: resolveRole passes { resolvedTier, configuredFloor } into the sc2 ApplyCoreFloor guard, whose tier-rank comparison finds no rank for configuredFloor.
  - Response: ApplyCoreFloor falls back to its built-in default floor (the floor's default value is private to s2); resolveRole stamps clampedByFloor from that outcome and logs any raise via getLogger.
  - User impact: Critical roles remain protected by the built-in floor even when the configured floor is malformed; the downgrade-prevention guarantee (k2) is not lost.

### Edge cases

| Input | Expected |
| :--- | :--- |
| resolveProviderForRole(role, cfg) called with repoPath omitted (undefined). | No per-repo layer is consulted; resolution is global-only (global roleTiers → tier default → legacy shaperProvider → unset default) and the cache key uses the empty-repo segment `${role} `. resolveRepoShaperProvider is not called. |
| The same role is resolved many times within one run (per-step resolution loops). | First call builds and memoizes ResolvedProvider under (role, repoPath); every subsequent call returns the cached instance, so no CliProvider subprocess wrapper is rebuilt (performance NFR). |
| byRepo[repoPath] carries only the legacy scalar shaperProvider (no per-role tier assignment). | The byRepo role-tier layer misses; resolution continues down the chain to global role tier → tier default → the byRepo/legacy shaperProvider as the lower-precedence single-provider fallback, honoring ac3 ordering. |
| An MCP sampler is ambiently active (runWithSamplerContext) when a role resolves. | The sampler still wins: construction routes through McpSamplingProvider and the ambient-context precedence sits above the tier router, exactly as buildShaperProvider does today — tier resolution does not override an active sampler. |
| A critical role whose configured/default tier already sits at or above coreFloor. | ApplyCoreFloor is a no-op raise: effectiveTier equals resolvedTier, clampedByFloor is false, and no downgrade-prevention log line is emitted. |
| A peripheral (non-critical) role whose resolved tier is below coreFloor. | The floor does not apply; the role resolves below the floor (e.g. cheap), clampedByFloor false — only critical roles are clamped up. |
| cfg.summariserProvider is explicitly set to a 'cli-*' value. | resolveSummariser delegates to buildSummariserProvider, which routes the summariser through the CLI; resolution.runner stays within the union. The summariser is local-by-default but honors an explicit CLI opt-in without being coupled to the shaper/role tier. |
| A fully unset config (no tiers, no roleTiers, no coreFloor, no shaperProvider) drives every role. | Every role falls through the entire precedence chain to the unset-default path and resolves to local Ollama (k3), reproducing today's shipped default behavior with zero behavioral change. |
| cfg.shaperProvider is set (legacy single-provider) but no tiers/roleTiers are configured. | Tier and role layers miss for every role, so all roles resolve to the legacy shaperProvider — the run-wide single-provider behavior is preserved as the lower-precedence fallback beneath any future tier config. |
| A 'mid' or 'cheap' tier maps to a CLI runner with a concrete tier model (e.g. sonnet for mid, a haiku override for cheap). | materialize passes roleRunner + roleModel through ShaperProviderOverrides into buildShaperProvider, so CliProvider is constructed with the tier's model — a mapping cfg.shaperModel alone could not express — while resolveShaperKind still admits the runner. |

### Invariants to preserve

- Every resolved runner stays within the closed union 'ollama' | 'cli-claude' | 'cli-codex'; no direct cloud REST path is reachable at any tier (including cheap). The invariant is enforced structurally by the union type AND funnelled through resolveShaperKind as the single admission point — the router feeds its tier-resolved runner in as the top-priority input rather than re-deciding the runner elsewhere (k1 / ac2). [[c1]]
- resolveShaperKind remains the sole runner-admission choke point that decides the CLI-vs-Ollama union; the router must not fork a second admission path. This is the load-bearing seam the s1 module.profile flags, and centralizing the k1 gate in exactly one place is what keeps the no-REST guarantee auditable. [[c1]]
- The background doc-summariser stays LOCAL (Ollama) regardless of the shaper/role tier — resolveSummariser delegates to buildSummariserProvider so the summariser-vs-shaper decoupling is wrapped, not re-implemented, and only routes through a CLI when summariserProvider is explicitly 'cli-*'. [[c2]]
- An ambiently active MCP sampler (runWithSamplerContext) and the client-provider ambient context retain precedence ABOVE the tier router: construction still routes through McpSamplingProvider when a sampler is present, preserving the existing MCP-integration precedence order rather than letting tier resolution override it. [[c1]]
- The byRepo[repoPath].shaperProvider per-repo override is read FRESH from disk via resolveRepoShaperProvider (never a global cache) and sits at the TOP of the precedence chain; the ac3 ordering byRepo role → global role → tier default → legacy shaperProvider → unset default must be preserved, extending (not replacing) the byRepo-over-global precedence already pinned by repo-shaper-override.test.ts. [[c3]]
- The lowest-precedence unset-default path (no shaperProvider key set ⇒ local Ollama) survives untouched as the final fallback (k3); no pre-existing config key is replaced (k4), so the shipped default behavior is byte-for-byte preserved when tier config is absent. [[c5]]
- prepareWorkflowRun keeps its scalar provider + modelLabel fields populated from the driver role's resolution for back-compat; the added router field is purely additive so no downstream reader breaks before S005's per-output attribution lands, and buildShaperProvider's type-level signature is unchanged so its sole existing caller keeps compiling. [[c4]]

## Test strategy

**Test framework:** `node:test (executed via `npx tsx --test`, matching the existing `src/**/__tests__/*.test.ts` suites reported by test.locate)`

### Test levels

- **unit** — Pin the pure resolveRole precedence merge + coreFloor clamp that produces RoleResolution with zero provider/subprocess construction — the assertable heart of ac3 and the sc2 floor. Every precedence rung, tier-default fallback, floor clamp/no-op, and malformed-config fallthrough is exercised against a stubbed sc4 taxonomy so no RoleId enum is hardcoded.
  - Subjects: `resolveRole (src/analyze/context/role-router.ts) — byRepo role → global role → tier default → legacy shaperProvider → unset default ordering`, `resolveRole coreFloor clamp for critical roles (clampedByFloor true + downgrade log) vs no-op raise (already ≥ floor)`, `resolveRole peripheral role below floor (floor not applied, clampedByFloor false)`, `resolveRole error/fallthrough paths: unknown RoleId → non-critical + built-in default tier; roleTiers points at non-existent tier → sc4 defaultTier; malformed coreFloor → sc2 built-in floor`, `RoleResolution shape {role,tier,runner,model,clampedByFloor}`
  - Fixtures: `Stub sc4 ReasoningRoleTaxonomy exposing a critical role + a peripheral role with fixed defaultTier/criticality/tier-rank (stub, not the real enum — backFlowNotes gap 4)`, `AnalyzeTieringConfig factory building cfg variants: full tiers+roleTiers, byRepo-role override, legacy shaperProvider only, fully-unset, malformed roleTier name, malformed coreFloor value`, `getLogger spy/capture to assert the critical-downgrade clamp log line`
- **unit** — Guard the k1/ac2 single-admission invariant at resolveShaperKind: the router's tier-resolved runner (new roleResolved input) takes top priority, a non-union runner string is coerced to 'ollama', and the existing three-input fallback chain resolves identically for legacy callers. Pure function, isolated.
  - Subjects: `resolveShaperKind (src/analyze/context/shaper-provider.ts) — roleResolved wins over repoOverride/globalExplicit/clientDefault`, `resolveShaperKind non-union coercion ('openai' | 'cli-claud' typo → 'ollama') with coercion log`, `resolveShaperKind additive back-compat: three-input callers (no roleResolved) resolve unchanged`
  - Fixtures: `getLogger spy to assert the coercion log for an out-of-union runner`
- **unit** — Verify materialize + the RoleRouter public surface: resolveProviderForRole/resolveSummariser construct via buildShaperProvider/buildSummariserProvider, memoize per (role, repoPath), keep the summariser local-by-default, and honor the ambient MCP sampler precedence — all with deterministic stub providers (no live LLM).
  - Subjects: `resolveProviderForRole returns {provider, resolution} and memoizes per (role, repoPath); repeated resolutions reuse the same instance (no CliProvider rebuild)`, `resolveProviderForRole with repoPath omitted → global-only resolution, cache key uses empty-repo segment, resolveRepoShaperProvider not called`, `resolveProviderForRole with repoPath set → byRepo layer read FRESH via resolveRepoShaperProvider`, `resolveProviderForRole passes roleRunner+roleModel through ShaperProviderOverrides so a mid/cheap CLI tier pins a concrete model (e.g. sonnet/haiku)`, `resolveSummariser stays Ollama regardless of shaper tier, and routes CLI only when cfg.summariserProvider is 'cli-*'`, `ambient runWithSamplerContext still wins → construction routes through McpSamplingProvider`
  - Fixtures: `makeStubProvider / stubProvider patterns (recursive.test.ts:173, aggregator.test.ts:35) as the built LLMProvider stand-ins`, `Spy/counter wrapping buildShaperProvider construction to assert the cache prevents rebuilds`, `Spy on resolveRepoShaperProvider to assert fresh-disk read vs skip when repoPath omitted`, `runWithSamplerContext harness with a fake SamplingCallback`
- **integration** — Prove the sole run-wide seam (prepareWorkflowRun) exposes router for per-step per-role resolution (ac1) while keeping scalar provider/modelLabel back-compat and the unchanged no-repo throw. Extends the existing prepareWorkflowRun harness.
  - Subjects: `prepareWorkflowRun exposes prep.router (RoleRouter) and prep.router.resolveProviderForRole yields distinct model attribution for a critical vs peripheral role in one run`, `prepareWorkflowRun retains provider/modelLabel populated from the driver role's resolution (back-compat, no downstream break before S005)`, `prepareWorkflowRun throws 'no repo' when neither params.repo nor INSRC_REPO set (unchanged, before any RoleRouter built)`, `byRepo role/tier override precedence extends the pinned repo-shaper-override behavior (byRepo role tier > global) end-to-end`
  - Fixtures: `FakeProvider (src/daemon/__tests__/workflow-rpc.test.ts:33) reused as the constructed provider`, `INSRC_REPO env set/unset harness and a raw workflow.run params factory`, `Registered-repo cfg with byRepo[repoPath] role-tier + global roleTiers to extend repo-shaper-override.test.ts:34-82`

### Acceptance mapping

| Criterion | Proving tests |
| :--- | :--- |
| `ac1` | `unit/role-router: resolveRole assigns per-role tiers so a critical and a peripheral role under the same cfg resolve to different tier + model`, `unit/role-router: resolveProviderForRole returns a distinct constructed provider/model per role (memoized per (role,repoPath))`, `integration/workflow-rpc: prepareWorkflowRun exposes prep.router and resolveProviderForRole yields distinct model attribution for a critical vs peripheral role within one run` |
| `ac2` | `unit/shaper-kind: resolveShaperKind coerces a non-union runner ('openai'/'cli-claud') to 'ollama' with a logged coercion`, `unit/shaper-kind: resolveShaperKind admits the router's roleResolved runner as top priority so the k1 gate stays centralized`, `unit/role-router: resolveRole cheap-tier resolution.runner stays within the 'ollama'|'cli-claude'|'cli-codex' union (no REST reachable at any tier)`, `unit/role-router: resolveSummariser resolution.runner stays within the CLI/Ollama union` |
| `ac3` | `unit/role-router: resolveRole with no override for a role falls to its sc4 defaultTier`, `unit/role-router: resolveRole with tiers/roleTiers absent but legacy shaperProvider set falls to the legacy single-provider setting`, `unit/role-router: resolveRole on a fully-unset config falls through to the unset default (local Ollama), preserving shipped behavior`, `unit/role-router: resolveRole precedence ordering byRepo role → global role → tier default → legacy shaperProvider → unset default asserted rung-by-rung`, `integration/workflow-rpc: byRepo role-tier override precedence extends the pinned repo-shaper-override behavior end-to-end` |

## Migration

**State before:** Per the s1 analyze bundles, reasoning-provider resolution is a single run-wide choice. buildShaperProvider has ~12 callers; its sole run-wide *workflow* seam is prepareWorkflowRun (src/daemon/workflow-rpc.ts:319-344), which constructs ONE provider for the whole run and exposes a scalar provider + modelLabel on PreparedWorkflowRun (workflow-rpc.ts:302-314). The symbol.locate bundle pins buildShaperProvider(cfg: AnalyzeConfig, overrides?: ShaperProviderOverrides): LLMProvider at shaper-provider.ts:183-241 as the {runner, model}→provider factory, buildSummariserProvider (shaper-provider.ts:256-269) as the summariser-stays-local half, and resolveShaperKind as the single CLI(claude/codex)/Ollama-only admission point (module.profile — load-bearing; enforces k1/ac2, no direct REST). ShaperProviderOverrides (shaper-provider.ts:59-80) carries sampler/modelHints/repoOverride/clientDefault/cliTimeoutMs. byRepo[repoPath].shaperProvider precedence is read at shaper-provider.ts:65 and pinned by src/config/__tests__/repo-shaper-override.test.ts:34-82. The search.text bundle confirms the legacy models.analyze.shaperProvider key ('explicit shaperProvider → used for all reasoning', docs/index.html:201) remains the lowest-precedence run-wide fallback. resolveProviderForRole is NOT in the graph (symbol.locate) — no per-role resolution exists today.

**State after:** Every reasoning operation resolves its provider per-role, per-step through a new RoleRouter (src/analyze/context/role-router.ts, co-located with shaper-provider.ts). resolveProviderForRole(role, cfg, repoPath?) and resolveSummariser(cfg) return ResolvedProvider ({ provider, resolution }), where resolution is a side-effect-free RoleResolution ({ role, tier, runner, model, clampedByFloor }) produced by a pure resolveRole (precedence merge + sc2 core-floor clamp) before any construction, then composed with materialize (construction via buildShaperProvider/buildSummariserProvider through the unchanged resolveShaperKind admission point, memoized per (role, repoPath)). Precedence obeys ac3: byRepo role → global role → tier default → legacy shaperProvider → unset default. The runner stays within 'ollama'|'cli-claude'|'cli-codex' (k1/ac2). prepareWorkflowRun exposes prep.router while retaining the scalar provider/modelLabel (populated from the driver role's resolution) for back-compat; the workflow driver resolves per-step providers via prep.router. The ~12 other per-run-provider sites remain on the old scalar path (deferred to S005).

**Zero downtime:** yes — **Data rewrite:** no

### Steps

1. Add the new module src/analyze/context/role-router.ts exporting resolveProviderForRole and resolveSummariser (returning ResolvedProvider), split internally into a pure resolveRole (precedence merge + sc2 ApplyCoreFloor clamp → RoleResolution), a materialize step (construction via existing buildShaperProvider/buildSummariserProvider), and a private per-(role,repoPath) RoleResolutionCache. Introduce the new types RoleResolution and ResolvedProvider alongside it. Nothing imports the module yet, so it is inert on landing. — ↩ rollbackable
2. Add two optional nullable fields to the internal ShaperProviderOverrides bag in shaper-provider.ts: roleRunner (AnalyzeShaperProviderKind) and roleModel (string). Additive only — existing callers (incl. prepareWorkflowRun at workflow-rpc.ts:341) pass neither and keep compiling and behaving identically. — ↩ rollbackable
3. Add an optional highest-priority roleResolved input to the resolveShaperKind inputs object. When absent, the existing repoOverride/globalExplicit/clientDefault fallback chain (…?? 'ollama') resolves identically for all legacy three-input callers; when present, it takes precedence, keeping the k1/ac2 CLI-or-Ollama admission decision in exactly one place. — ↩ rollbackable
4. Wire buildShaperProvider to feed overrides.roleRunner into resolveShaperKind as the roleResolved input and to prefer overrides.roleModel over cfg.shaperModel when set. Behaviour is unchanged whenever both new fields are absent, so the single existing caller is unaffected. — ↩ rollbackable
5. Add the field router: RoleRouter to the PreparedWorkflowRun interface and construct the router inside prepareWorkflowRun (workflow-rpc.ts:319-344), passing the run's cliTimeoutMs + repoOverride + clientDefault as construction deps. Keep the scalar provider and modelLabel populated from the driver role's resolution so all downstream readers continue working before S005/sc5's per-output attribution lands. — ↩ rollbackable
6. Point the workflow driver (runStart / async registry consumers at workflow-rpc.ts:348+) at prep.router.resolveProviderForRole(role) for per-step, per-role provider resolution, delivering ac1 at the one seam s3 owns. Leave the ~12 other buildShaperProvider/per-run-provider sites on the legacy scalar path — their reroute is explicitly S005 scope. Reverting the driver back to the scalar prep.provider restores prior run-wide behaviour. — ↩ rollbackable

**Backward compat:** All touched surfaces are internal-shared and changed additively; no public signature changes. buildShaperProvider(cfg, overrides?) and buildSummariserProvider(cfg) keep their exact type-level signatures — only the internal ShaperProviderOverrides shape gains two optional fields, so the sole existing caller (prepareWorkflowRun, workflow-rpc.ts:341) compiles and behaves unchanged. resolveShaperKind gains one optional input; its three existing inputs resolve identically when roleResolved is omitted, preserving the ac3/k3/k5 legacy fallback chain and the unset-shaperProvider default path (search.text bundle). PreparedWorkflowRun retains provider and modelLabel with identical semantics (driver role's resolution), so every current reader keeps working; router is a purely additive field. The legacy models.analyze.shaperProvider key is preserved as the lowest-precedence fallback and no pre-existing config key is replaced (k4). The byRepo-override behaviour pinned by repo-shaper-override.test.ts:34-82 is preserved and extended, not broken.

## Alternatives considered

### a3: Two-phase split — pure resolveRole (RoleResolution) then materialize (ResolvedProvider) — **CHOSEN**

Separate the decision from the construction: a pure resolveRole(role, cfg, repoPath?) returns just the RoleResolution record, and a second materialize(resolution) constructs and caches the provider — resolveProviderForRole is their composition for consumers.

Decompose sc3 internally into two seams under the same public contract. resolveRole(role, cfg, repoPath?): RoleResolution is pure — it runs the entire precedence merge (byRepo role → global role → tier default → legacy shaperProvider → unset default), calls the sc2 ApplyCoreFloor guard, reads the sc4 taxonomy, and emits { role, tier, runner, model, clampedByFloor } with no provider constructed. materialize(resolution): ResolvedProvider builds/caches the actual LLMProvider via buildShaperProvider/buildSummariserProvider and is the single injection point for sc5 attribution wrapping. The HLD's resolveProviderForRole / resolveSummariser remain the public methods, implemented as materialize(resolveRole(...)). Consumers still see only the RoleRouter interface; the split is s3-internal per the boundary.

### a1: Stateful RoleRouter instance (factory + methods + per-run cache)

A createRoleRouter(cfg, deps) factory returns the RoleRouter object exactly as the HLD sketches it — resolveProviderForRole / resolveSummariser as methods over an internal per-(role,repo) provider cache — threaded through the existing ambient provider context.

Land sc3 as an object-shaped contract. A factory createRoleRouter(cfg: AnalyzeTieringConfig, deps) constructs a RoleRouter whose resolveProviderForRole(role, cfg, repoPath?) and resolveSummariser(cfg) methods each return the HLD ResolvedProvider { provider, resolution }. The instance holds the per-(role,repo) → ResolvedProvider memo internally so the run rebuilds no CliProvider subprocess wrapper twice (NFR performance). buildShaperProvider (shaper-provider.ts:183–241) / buildSummariserProvider (256–269) become the private construction primitives the methods call; the router replaces the single prepareWorkflowRun (workflow-rpc.ts:319–344) construction and is injected via the existing runWithClientProviderContext / currentSamplerContext ambient seam so s4/s5/s6 receive it from context. resolveShaperKind stays the private CLI/Ollama admission point (k1/ac2). ResolvedProvider.resolution (role, tier, runner, model, clampedByFloor) is populated by calling the sc2 ApplyCoreFloor guard and the sc4 taxonomy during each resolve.

**Rejected because:** The safest 1:1 mapping to the HLD interfaceSketch (RoleRouter/RoleResolution/ResolvedProvider ship verbatim, cache at exactly the single choke point) and it satisfies every acceptance criterion and consumed contract — but it ranks below a3 (winnerRank 2) because it couples the decision (precedence + floor) with construction inside stateful methods: the UNVERIFIED precedence-merge arithmetic (s1 gap 1) can only be tested by instantiating the router with stub deps rather than calling a pure function, so pinning the highest-risk logic carries construction ceremony, and cache lifetime becomes a correctness surface (stale providers across runs/config edits) that a3's explicit resolveRole/materialize split avoids.

### a2: Pure-function resolver, caller-owned memoization

Keep the shaper-provider.ts functional lineage: resolveProviderForRole and resolveSummariser are free functions returning ResolvedProvider, with per-run memoization owned by the ambient context rather than by a router object.

Land sc3 as stateless functions colocated with buildShaperProvider in shaper-provider.ts (or a sibling), signatures matching the HLD: resolveProviderForRole(role, cfg, repoPath?): ResolvedProvider and resolveSummariser(cfg): ResolvedProvider. Each call runs the full precedence merge (byRepo role → global role → tier default → legacy shaperProvider → unset default), invokes the sc2 ApplyCoreFloor guard, and constructs the provider via buildShaperProvider/buildSummariserProvider — no object state. The per-(role,repo) provider cache required by the performance NFR is held by the run/context layer (a memo map created in prepareWorkflowRun's successor and passed through runWithClientProviderContext), not by sc3 itself, so the contract stays a pure decision-plus-construct function. resolveShaperKind remains the private CLI/Ollama admission point.

**Rejected because:** Purest test surface for the precedence and floor logic and the smallest shape delta, and it satisfies all three acceptance criteria and sc1/sc2/sc4 — but it ranks last (winnerRank 3) because it weakens sc3's central guarantee: the per-(role,repo) cache required by the performance NFR is moved out of the contract to a caller-owned memo, so 'single choke point for all reasoning-model access' becomes a convention every consumer must uphold — resolveProviderForRole reconstructs CliProvider subprocess wrappers on any un-memoized call, and the RoleRouter grouping the HLD sketches as an object value is not expressed, leaving s4/s5/s6 importing loose functions. Given accuracy-primary and the HLD's explicit single-enforcement-point intent, dispersing the cache is a real erosion of the choke-point contract (sc3 scored 'partial'), which both a1 and a3 keep encapsulated.

## Citations

- **[[c1]]** `step-output` `s4.interactionWithShared + s4.api (sc3 implements RoleRouter; resolveProviderForRole/resolveSummariser/buildShaperProvider/buildSummariserProvider/resolveShaperKind/prepareWorkflowRun contract details)` — "s3 owns and ships RoleRouter (ownedByStory: s3). The public surface is exactly resolveProviderForRole(role, cfg, repoPath?) and resolveSummariser(cfg) returning ResolvedProvider, verbatim to the HLD i"
- **[[c2]]** `step-output` `s4.dataModel (RoleResolution, ResolvedProvider, RoleResolutionCache, ShaperProviderOverrides field-add, PreparedWorkflowRun field-add)` — "The side-effect-free record every resolution emits (sc3 shape): { role: RoleId; tier: 'core'|'mid'|'cheap'; runner: 'ollama'|'cli-claude'|'cli-codex'; model: string; clampedByFloor: boolean }."
- **[[c3]]** `step-output` `s5.errorCases + s5.edgeCases + s5.invariantsToPreserve (error paths for the RoleRouter resolution)` — "resolveShaperKind's parseShaperProvider-style switch/`?? 'ollama'` default matches no union member, so the non-union string is caught at the single admission point rather than propagating into provide"
- **[[c4]]** `step-output` `s6.testLevels + s6.acceptanceMapping (node:test unit + integration test strategy, ac1/ac2/ac3 proving tests)` — "Pin the pure resolveRole precedence merge + coreFloor clamp that produces RoleResolution with zero provider/subprocess construction — the assertable heart of ac3 and the sc2 floor."
- **[[c5]]** `step-output` `s7.stateBefore/stateAfter/migrationSteps/backwardCompat (additive, zero-downtime migration ordering)` — "All touched surfaces are internal-shared and changed additively; no public signature changes."
- **[[c6]]** `step-output` `s2.alternatives + s3.winnerId/winnerRationale/judgments (a1/a2/a3 alternatives; a3 chosen)` — "a3 is the only alternative that ships sc3's public RoleRouter contract intact (satisfies) while isolating the highest-risk element — the precedence-merge arithmetic flagged UNVERIFIED in s1 backFlowNo"
- **[[c7]]** `analyze-bundle` `s1 symbol.locate — buildShaperProvider shaper-provider.ts:183-241, buildSummariserProvider 256-269, prepareWorkflowRun workflow-rpc.ts:319-344` — "buildShaperProvider(cfg: AnalyzeConfig, overrides?: ShaperProviderOverrides): LLMProvider at shaper-provider.ts:183-241 is the {runner, model} -> provider factory sc3 generalizes to per-role."
- **[[c8]]** `step-output` `s8.results (all cd/dm/int/ep/ts/mg/alt/sbdry checks passed; no missed/ambiguous verdicts → openQuestions empty)` — "sbdry1..sbdry4 verdict passed; no missed or ambiguous verdicts across the s8 audit."

<!-- insrc:review -->

## Review

### ⛔ Review `BLOCK` — design.story (design.story)

**0 HIGH · 1 MED · 9 LOW** · model `client` · reviewed 2026-07-25T14:48:32.493Z

| Ref | Kind | Severity | Fixability | Premise | Evidence | Action |
| --- | --- | --- | --- | --- | --- | --- |
| c7/migration | inventory | MED | auto | buildShaperProvider has totalCallers:1 (only prepareWorkflowRun); the ~12 other per-run-provider sites are separate. | ripgrep for `buildShaperProvider(` returns 12 real non-test invocation sites (workflow-rpc.ts:341 plus classifier/scope-picker, classifier/driver, explore/capability-reuse-check, explore/doc-decision-trace, explore/doc-constraint-enumerate, workflow/questions, runtimes/shared/adherence, runtimes/shared/aggregator, planner/driver, context/decomposer, context/synthesizer). The 'totalCallers:1 / its only caller is prepareWorkflowRun' restatement is contradicted — prepareWorkflowRun is the sole run-wide WORKFLOW seam, not the sole caller. | Correct the 'totalCallers:1 / only caller' phrasing to '~12 callers; prepareWorkflowRun is the sole run-wide workflow seam'. The s3 SCOPE decision is unaffected and correct (reroute only prepareWorkflowRun here; defer the ~11 per-operation analyze sites to S005) — this is an inaccurate citation restatement, not a design defect. |
| c7 | citation | LOW | manual | buildShaperProvider is defined at shaper-provider.ts:183-241 and buildSummariserProvider at 256-269. | read at shaper-provider.ts:183 = `export function buildShaperProvider(`; buildSummariserProvider export also present at :256. Matches cited 183-241 / 256-269. | none — verified sound |
| c1 | citation | LOW | manual | resolveShaperKind is an exported pure function in shaper-provider.ts that decides the AnalyzeShaperProviderKind admission (the single CLI/Ollama runner gate). | resolveShaperKind appears 15 times in the tree (exported pure admission function in shaper-provider.ts). Confirms the single runner-admission choke point the router feeds. | none — verified sound |
| c2 | citation | LOW | manual | ShaperProviderOverrides is an internal interface in shaper-provider.ts (~59-80) carrying sampler/modelHints/repoOverride/clientDefault/cliTimeoutMs. | `interface ShaperProviderOverrides` = 1 match; cliTimeoutMs (4) and repoOverride (22) present. Confirms the overrides bag the router extends additively. | none — verified sound |
| c3 | citation | LOW | manual | The byRepo[repoPath] shaperProvider override is resolved via resolveRepoShaperProvider (read fresh), referenced around shaper-provider.ts:65. | resolveRepoShaperProvider = 17 matches — the fresh-disk byRepo override resolver the router reuses exists. | none — verified sound |
| c7 | citation | LOW | manual | prepareWorkflowRun is at workflow-rpc.ts:319-344, PreparedWorkflowRun interface at 302-314, and the single buildShaperProvider call at :341. | workflow-rpc.ts: `interface PreparedWorkflowRun` at 302, `export function prepareWorkflowRun` at 319, and the buildShaperProvider call read verbatim at :341. All three cited anchors resolve. | none — verified sound |
| c1 | semantic | LOW | manual | An ambient MCP sampler (runWithSamplerContext) routes construction through McpSamplingProvider, taking precedence above tier resolution — an existing behavior of buildShaperProvider. | runWithSamplerContext (14) and McpSamplingProvider (44) both present — the ambient-sampler precedence the router preserves is real. | none — verified sound |
| c1 | closed-union | LOW | manual | AnalyzeShaperProviderKind is the closed union 'ollama' \| 'cli-claude' \| 'cli-codex' — no direct-REST member. | AnalyzeShaperProviderKind (27) and the cli-codex member (31) present; the union is the closed 'ollama'\|'cli-claude'\|'cli-codex' with no REST member — the k1 invariant holds structurally. | none — verified sound |
| c3 | citation | LOW | manual | repo-shaper-override.test.ts (lines ~34-82) pins the byRepo-over-global shaperProvider precedence the router extends. | repo-shaper-override.test.ts:34 reads `test('resolveRepoShaperProvider returns the pinned kind for a byRepo entry'...)` — the byRepo precedence pin the integration test extends exists. | none — verified sound |
| c4 | citation | LOW | manual | A reusable FakeProvider test fixture exists at src/daemon/__tests__/workflow-rpc.test.ts:33 for the integration harness. | src/daemon/__tests__/workflow-rpc.test.ts:33 = `class FakeProvider implements LLMProvider` — the reusable integration fixture the test strategy names exists. | none — verified sound |

#### Proposed fixes

- **c7/migration** (auto) — Replace the undercount restatement in both the precondition note and the migration State-before with the re-derived 12-caller reality, preserving the (correct) sole-run-wide-seam scoping.
  - edit: `(s1 usage.example: totalCallers:1 for buildShaperProvider). The ~12 other buildShaperProvider/per-run-provider sites are explicitly deferred to S005` → `(buildShaperProvider actually has ~12 callers; prepareWorkflowRun is its sole run-wide *workflow* seam). The ~11 other per-operation buildShaperProvider sites are explicitly deferred to S005`
  - edit: `The usage.example bundle records totalCallers:1 for buildShaperProvider — its only caller is prepareWorkflowRun (src/daemon/workflow-rpc.ts:319-344), which constructs ONE provider for the whole run` → `buildShaperProvider has ~12 callers; its sole run-wide *workflow* seam is prepareWorkflowRun (src/daemon/workflow-rpc.ts:319-344), which constructs ONE provider for the whole run`
