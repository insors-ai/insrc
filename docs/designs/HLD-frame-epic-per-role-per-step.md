<!-- insrc:artifact HLD-820cc07b9c74195c -->

# HLD: Chosen framework (alternative a2): a single RoleRouter choke point mediates every reasoning-model access across the analyze, workflow, and tracker lifecycle

## Framework summary

Chosen framework (alternative a2): a single RoleRouter choke point mediates every reasoning-model access across the analyze, workflow, and tracker lifecycle. Rather than constructing one provider per run in prepareWorkflowRun, the router resolves a provider per reasoning role by generalizing the existing shaper-vs-summariser split in shaper-provider.ts into a role-keyed resolver. Configuration extends the existing models.analyze.* contract with three capability tiers {core, mid, cheap}, a role→tier assignment map, a coreFloor guarantee, and byRepo role/tier overrides — the legacy shaperProvider key (and its unset-default path) remaining the lowest-precedence fallback. Because every role access flows through one wrapper, the coreFloor clamp, the CLI/Ollama-only dispatch invariant, per-repo precedence, and per-output model attribution are each enforced at exactly one place with no bypassing seam; the two hardcoded top-tier sites are converted to receive the router from context. The higher mechanical threading cost is accepted under the Epic's accuracy-primary / cost-least-priority principle.

## Architecture shape

Layered around one choke point. (1) Config layer (s1): the models.analyze.* schema gains tiers, roleTiers, coreFloor, and byRepo role overrides (sc1), plus a role/tier/criticality taxonomy keyed on step and runner names (sc4). (2) Guardrail layer (s2): a coreFloor clamp (sc2) reads the config and taxonomy and raises any critical role resolved below the configured minimum, leaving peripheral roles free to run cheaper. (3) Resolution layer (s3): the RoleRouter / resolveProviderForRole (sc3) is the single choke point — it applies precedence (byRepo role → global role → tier default → legacy shaperProvider → unset default), invokes the coreFloor clamp for critical roles, and returns a provider whose access is guaranteed to be CLI or Ollama. (4) Attribution layer (s4): each provider returned by the router is wrapped so every produced output is stamped with the model identity that generated it (sc5), superseding the single per-run meta.model. (5) Application layer (s5): prepareWorkflowRun and the two hardcoded top-tier sites (validate.ts, cli/services/workflow.ts) are re-routed to obtain their provider from the router via context (sc6), eliminating every direct bypass. (6) Docs (s6) describe tiers, precedence, and the floor. Data flows one direction: config+taxonomy → floor → router → {attribution, application}.

## Shared contracts

### sc1: AnalyzeTieringConfig

**Owner Story:** `s1`
**Consumed by:** `s2`, `s3`, `s6`

**Purpose:** Extends the existing models.analyze.* configuration surface with capability tiers, a role→tier assignment map, the coreFloor minimum, and per-repository role/tier overrides — without replacing any pre-existing key, and preserving the legacy single-provider path as lowest-precedence fallback.

**Interface sketch (type-level):**

```
type TierName = 'core' | 'mid' | 'cheap';

interface TierModel {
  // runner is which local/CLI backend serves the tier; model is the concrete id
  runner: 'ollama' | 'cli-claude' | 'cli-codex';
  model: string;
}

interface RoleTierAssignment {
  // keyed by RoleId (see sc4); value is the tier that serves that role
  [roleId: string]: TierName;
}

interface AnalyzeTieringConfig {
  // NEW keys, additive to models.analyze.*
  tiers?: Partial<Record<TierName, TierModel>> | undefined;
  roleTiers?: RoleTierAssignment | undefined;
  coreFloor?: TierName | undefined; // see sc2
  byRepo?: {
    [repoPath: string]: {
      tiers?: Partial<Record<TierName, TierModel>> | undefined;
      roleTiers?: RoleTierAssignment | undefined;
      coreFloor?: TierName | undefined;
      // legacy per-repo shaperProvider override remains honored
      shaperProvider?: string | undefined;
    };
  } | undefined;
  // LEGACY keys, unchanged, lowest precedence:
  shaperProvider?: string | undefined; // unset => built-in default path
  shaperModel?: string | undefined;
}
```

**Assumptions cited:** [[The additive tier/role/coreFloor/byRepo keys land on the existing models.analyze.* catalog in src/cli/config-catalog.ts (51–62) with the type home in src/config/analyze.ts, without introducing a new config domain (k4). UNVERIFIED at HLD: whether the config-catalog.ts → analyze.ts → shaper-provider.ts import direction admits the new keys cleanly — no import.graph pass was run (s1 backFlowNotes gap 1).]]

### sc4: ReasoningRoleTaxonomy

**Owner Story:** `s1`
**Consumed by:** `s2`, `s3`, `s4`, `s5`

**Purpose:** The closed set of reasoning role identifiers (keyed on step/runner names across analyze, workflow, and tracker), each classified as critical or peripheral, plus the tier ordering used to compare capability. Referenced by config, floor, router, attribution, and application seams so they all agree on role identity.

**Interface sketch (type-level):**

```
// RoleId values are the intent-named reasoning sites, e.g.
// 'design.epic.alternatives' | 'design.epic.judge' | 'design.story.detail'
// | 'scope.audit' | 'review' | 'build' | 'define.frame'
// | 'render.issueBody' | 'render.summary' | 'indexer.summarise'
// | 'analyze.narrow'
type RoleId = string;

type Criticality = 'critical' | 'peripheral';

interface RoleDescriptor {
  id: RoleId;
  criticality: Criticality;
  defaultTier: 'core' | 'mid' | 'cheap';
}

// Tier capability ordering, cheap < mid < core, used by the floor clamp.
type TierRank = { cheap: 0; mid: 1; core: 2 };

interface RoleTaxonomy {
  roles: readonly RoleDescriptor[];
  rankOf: Record<'cheap' | 'mid' | 'core', number>;
}
```

**Assumptions cited:** [[The enumerated RoleId string set is an internal registry keyed on the intent-named reasoning sites; consumers see only the RoleId/Criticality/tier-rank shapes. The exact closed set (including the two hardcoded top-tier sites' role names) is pinned at LLD — those seams did not surface in any s1 search.text output (s1 backFlowNotes gap 3).]]

### sc2: CoreFloorGuard

**Owner Story:** `s2`
**Consumed by:** `s3`, `s6`

**Purpose:** The capability floor for critical roles: given a role's resolved tier, guarantees a critical role is never served below the configured (or built-in default) minimum, while permitting peripheral roles to resolve below it. Type-level result records whether a clamp was applied.

**Interface sketch (type-level):**

```
interface FloorInput {
  role: RoleDescriptor;            // from sc4
  resolvedTier: 'core' | 'mid' | 'cheap';
  configuredFloor?: 'core' | 'mid' | 'cheap' | undefined; // from sc1; absent => built-in default
}

interface FloorOutcome {
  effectiveTier: 'core' | 'mid' | 'cheap'; // >= floor for critical roles
  clamped: boolean;                        // true when a critical downgrade was raised
  reason?: 'below-core-floor' | undefined;
}

// Type of the guard entry point (signature only, no body):
type ApplyCoreFloor = (input: FloorInput) => FloorOutcome;
```

**Assumptions cited:** [[The built-in default floor value and the tier-rank comparison arithmetic stay private to s2; only the FloorInput/FloorOutcome shapes and the ApplyCoreFloor signature are exposed. The guard reads criticality from sc4 rather than redefining it.]]

### sc3: RoleRouter

**Owner Story:** `s3`
**Consumed by:** `s4`, `s5`, `s6`

**Purpose:** The single choke point for all reasoning-model access. Resolves a provider for a given role by applying precedence (byRepo role → global role → tier default → legacy shaperProvider → unset default), invoking the CoreFloorGuard for critical roles, and returning a provider whose access is guaranteed CLI/Ollama-only. Generalizes today's buildShaperProvider/buildSummariserProvider split.

**Interface sketch (type-level):**

```
import type { LLMProvider } from '../../shared/types.js';

interface RoleResolution {
  role: RoleId;                 // sc4
  tier: 'core' | 'mid' | 'cheap';
  runner: 'ollama' | 'cli-claude' | 'cli-codex'; // k1 invariant surface
  model: string;
  clampedByFloor: boolean;      // sc2 outcome
}

interface ResolvedProvider {
  provider: LLMProvider;        // wrapped for attribution (sc5)
  resolution: RoleResolution;
}

interface RoleRouter {
  // signatures only — no bodies
  resolveProviderForRole(role: RoleId, cfg: AnalyzeTieringConfig, repoPath?: string): ResolvedProvider;
  // summariser stays local regardless of shaper tier (preserves existing decoupling)
  resolveSummariser(cfg: AnalyzeTieringConfig): ResolvedProvider;
}
```

**Assumptions cited:** [[The router generalizes buildShaperProvider (shaper-provider.ts:183–241) / buildSummariserProvider (256–269) and constructs providers through the existing CliProvider (cli-provider.ts:88–345, already model-option-aware) and Ollama machinery — no new REST path. resolveProviderForRole is NOT present in the graph today, confirming the Epic introduces it. Physical landing (co-locate in shaper-provider.ts vs a new module) is UNVERIFIED — no import.graph pass (s1 backFlowNotes gap 1).]]

### sc5: PerOutputModelAttribution

**Owner Story:** `s4`

**Purpose:** Records the concrete model identity that produced each output, replacing the single per-run meta.model attribution. The RoleRouter wraps each resolved provider so every output it emits carries this record; artifacts aggregate per-output records instead of one whole-run model.

**Interface sketch (type-level):**

```
interface OutputModelStamp {
  role: RoleId;                 // sc4
  tier: 'core' | 'mid' | 'cheap';
  runner: 'ollama' | 'cli-claude' | 'cli-codex';
  model: string;
}

// Replaces the scalar meta.model on produced artifacts.
interface ArtifactModelAttribution {
  // per-output stamps, superseding a single run-wide model field
  outputs: OutputModelStamp[];
}
```

**Assumptions cited:** [[The outputs[] aggregate is strictly additive and back-compat with the legacy scalar meta.model; older single-model artifacts remain readable via a fallback that synthesizes a single-output record. The provider-wrapping/serialization mechanism stays private to s4.]]

### sc6: RoutingSeamContext

**Owner Story:** `s5`

**Purpose:** The context handle through which every reasoning site — including prepareWorkflowRun and the two hardcoded top-tier sites (validate.ts, cli/services/workflow.ts) — obtains its provider from the RoleRouter instead of constructing one directly, so no operation bypasses role-aware routing.

**Interface sketch (type-level):**

```
// Injected into every reasoning site in place of a run-wide provider.
interface RoutingSeamContext {
  router: RoleRouter;           // sc3
  repoPath?: string;
  // Each site names its own role at the point of access:
  // ctx.router.resolveProviderForRole(role, cfg, ctx.repoPath)
}

// The prior per-run provider handle is removed from these sites;
// the seam context is the only sanctioned way to reach a model.
type ReasoningSiteEntry = (ctx: RoutingSeamContext, role: RoleId) => void;
```

**Assumptions cited:** [[prepareWorkflowRun (workflow-rpc.ts:319–344) is the sole non-test construction caller that becomes a router injection point. The two hardcoded seams (validate.ts:45, cli/services/workflow.ts:231) did not surface in s1 search.text output — s5 must locate and re-route them (plus any additional bypass sites) at LLD time (s1 backFlowNotes gap 3).]]

## Story boundaries

### Story E20260725820cc07b:S001

**Owns:** `sc1`, `sc4`

The concrete default tier→model table (which model backs core/mid/cheap out of the box), the exact camelCase/kebab-case config-catalog.ts key names and their catalog descriptions, the parsing/validation of the byRepo map against registered repo paths, and the internal mapping between config-catalog.ts and config/analyze.ts stay private to s1. The enumerated RoleId string values are an internal registry; only the RoleId/Criticality/tier shapes and the RoleTaxonomy accessor are exposed. Consumers never read raw config keys directly — they see the AnalyzeTieringConfig and RoleTaxonomy shapes.

### Story E20260725820cc07b:S002

**Owns:** `sc2`
**Depends on:** `sc1`, `sc4`

The built-in default floor value, the tier-rank comparison arithmetic that decides whether a resolved tier is below the floor, the clamp-logging/telemetry emitted when a critical downgrade is raised, and the decision of which roles count as critical (read from sc4, not redefined) stay private to s2. Only the FloorInput/FloorOutcome shapes and the ApplyCoreFloor signature are exposed to the router.

### Story E20260725820cc07b:S003

**Owns:** `sc3`
**Depends on:** `sc1`, `sc2`, `sc4`

The full precedence-resolution algorithm (how byRepo role, global role, tier default, legacy shaperProvider, and the unset-default path are ordered and short-circuited), the reuse of buildShaperProvider/buildSummariserProvider/CliProvider internals to actually construct each provider, the CLI-vs-Ollama dispatch details, and any per-role provider caching within a run stay private to s3. Only the RoleRouter interface (resolveProviderForRole / resolveSummariser) and its RoleResolution/ResolvedProvider shapes are exposed.

### Story E20260725820cc07b:S004

**Owns:** `sc5`
**Depends on:** `sc3`, `sc4`

The provider-wrapping mechanism that intercepts each output to attach a stamp, the migration that replaces the scalar meta.model field on stored artifacts with the outputs[] aggregate, and the serialization/back-compat reading of older single-model artifacts stay private to s4. Only the OutputModelStamp and ArtifactModelAttribution shapes are exposed.

### Story E20260725820cc07b:S005

**Owns:** `sc6`
**Depends on:** `sc3`, `sc4`

The specific edits that thread the RoutingSeamContext into prepareWorkflowRun (src/daemon/workflow-rpc.ts) and convert the two hardcoded top-tier sites (validate.ts:45, cli/services/workflow.ts:231) plus the peripheral rendering/summarisation/narrow-probe callsites, the discovery of any additional bypass sites at LLD time, and the role name each site declares stay private to s5. Only the RoutingSeamContext shape is exposed.

### Story E20260725820cc07b:S006

**Depends on:** `sc1`, `sc2`, `sc3`

All prose — the tier/precedence/floor documentation pages, the wording that formalizes the accuracy-primary / cost-least-priority principle and where it is enforced versus where cost may be traded, and the choice of which docs files (daemon.md, installation.md, index.html, CLAUDE.md) carry each section — stays private to s6. It produces no shared contract; it reads the sc1/sc2/sc3 shapes only to describe them accurately.

## Non-functional targets

- **Performance:** Per-step resolution replaces one per-run provider construction; the router should cache resolved providers per (role, repo) within a run to avoid rebuilding CLI subprocess wrappers. Accuracy is primary and cost is least priority — the wider mechanical threading and any extra resolution overhead are acceptable per the Epic principle. LLM access stays serial (never Promise.all across provider calls).
- **Security:** The k1 invariant is enforced structurally at the single router choke point: every ResolvedProvider's runner is constrained to 'ollama' | 'cli-claude' | 'cli-codex', so no role at any tier can reach a direct cloud REST path. Cloud auth remains delegated to the CLI OAuth sessions; no API keys are introduced.
- **Observability:** Every role resolution surfaces its RoleResolution (role, tier, runner, model, clampedByFloor), and every coreFloor clamp of a critical downgrade is logged via getLogger so operators can audit where capability was spent and where a downgrade was raised. No console.log.
- **Durability:** Per-output model attribution (sc5) replaces the scalar meta.model on persisted artifacts; older single-model artifacts must remain readable, so the outputs[] aggregate is additive and back-compat with the legacy field. Config changes (sc1) are additive to models.analyze.* — the unset-default and legacy shaperProvider paths must survive upgrade untouched (k3).

## Rollout

### Phase A — foundational contracts

**Stories:** `s1`

s1 owns both sc1 (AnalyzeTieringConfig — the additive tiers/roleTiers/coreFloor/byRepo schema on models.analyze.*) and sc4 (ReasoningRoleTaxonomy — the closed RoleId/Criticality/tier-rank set). Every other Story (s2, s3, s4, s5, s6) consumes one or both, so this contract-owning Story has no dependencies and must land first and alone. Until the config surface and role taxonomy exist, nothing downstream can resolve, clamp, route, attribute, or document against them.

**Backward compat:** The new keys are strictly additive to models.analyze.*: the legacy shaperProvider/shaperModel keys and the unset-default path must keep working untouched (k3, k4, ac3/ac4). No pre-existing key is renamed or removed; absent tier/role config falls straight through to the legacy single-provider selection.

### Phase B — critical-role capability floor

**Stories:** `s2`

s2 owns sc2 (CoreFloorGuard) and depends on sc1 + sc4 from Phase A. The floor must exist before the router (s3) can invoke it for critical roles, so it lands second. It reads criticality from sc4 and the configured floor from sc1 — both now available — and exposes only the FloorInput/FloorOutcome shapes the router will call.

**Backward compat:** When no coreFloor is configured the built-in default minimum applies (ac2); peripheral roles remain free to resolve below the floor (ac3). The guard is additive and does not alter the legacy single-provider path when no tier/role config is present.

### Phase C — role router choke point

**Stories:** `s3`

s3 owns sc3 (RoleRouter / resolveProviderForRole) — the single choke point every remaining consumer routes through — and depends on sc1, sc2, sc4, all now landed. It is isolated in its own phase to prove out the full precedence chain (byRepo role → global role → tier default → legacy shaperProvider → unset default), the CoreFloorGuard invocation, and the CLI/Ollama-only k1 invariant at one seam before s4/s5/s6 build on it. Landing the router alone de-risks the highest-leverage contract before three consumers depend on it.

**Backward compat:** The router generalizes today's buildShaperProvider/buildSummariserProvider split without removing the legacy fallback: with no override configured a role falls to its tier default, then to the legacy shaperProvider, then to the unset default, in that order (ac3, k3, k5). resolveSummariser preserves the existing shaper/summariser decoupling. The k1 invariant is preserved structurally — every ResolvedProvider runner is constrained to ollama | cli-claude | cli-codex.

### Phase D — attribution, full-site rollout, and docs

**Stories:** `s4`, `s5`, `s6`

All three depend only on contracts landed in Phases A–C (s4: sc3+sc4; s5: sc3+sc4; s6: sc1+sc2+sc3) and touch disjoint surfaces — s4 wraps router output to stamp per-output model attribution (sc5) and migrates artifact serialization; s5 threads the RoutingSeamContext (sc6) into prepareWorkflowRun and eliminates the two hardcoded top-tier bypasses (validate.ts, cli/services/workflow.ts) plus the peripheral rendering/summarisation/narrow-probe sites; s6 writes the tier/precedence/floor docs. With no cross-dependencies among them, they land together and may proceed in parallel to close out the epic.

**Backward compat:** Per-output attribution (sc5) is additive: the outputs[] aggregate supersedes the scalar meta.model on new artifacts while older single-model artifacts stay readable. s5 must leave already-routed behavior intact — the two hardcoded sites resolve their prior top-tier capability through the router (protected by the s2 floor) so no critical role is silently downgraded (ac1). Docs (s6) are prose-only, no runtime compat concern.

**Ordering rationale:** Phases follow the strict data-flow chain config+taxonomy → floor → router → {attribution, application, docs} that both the Epic dependsOn edges and the s4 shared-contract ownership dictate. sc1/sc4 (owned by s1) are consumed by every downstream Story, so s1 must land first and alone. sc2 (s2) consumes sc1/sc4 and is itself consumed by the router, so it forms the second phase. sc3 (s3) is the single choke point every remaining Story routes through, so it is isolated as its own phase to de-risk the seam before consumers build on it. Once the router exists, s4 (attribution wrapper on router output), s5 (thread the router into every reasoning site incl. the two hardcoded top-tier sites), and s6 (docs describing sc1/sc2/sc3) all depend only on already-landed contracts and touch disjoint surfaces (artifact serialization, callsite threading, prose), so they land together in the final phase and can proceed in parallel.

### Risky bits

| Area | Why | Mitigation |
| :--- | :--- | :--- |
| The single RoleRouter choke point (sc3) becomes a whole-lifecycle single point of failure | Because every reasoning access across analyze, workflow, and tracker is re-routed through one wrapper, a defect in the precedence resolution or provider construction degrades or breaks every role at once — the blast radius is the entire system, not one callsite. | Isolate s3 in its own phase (Phase C) with no consumers landing alongside it; verify the full precedence chain and the legacy-fallback path (ac3) against fixtures before Phase D consumers build on it, and keep resolveSummariser's existing decoupling to limit behavioral change. |
| Silent capability regression when threading the two hardcoded top-tier sites (s5) | validate.ts and cli/services/workflow.ts today unconditionally use the most capable model; re-routing them through role-aware resolution risks a misconfigured or defaulted role serving a critical operation below its prior capability, violating k2 without any visible error. | Rely on the s2 CoreFloorGuard (landed in Phase B) to clamp these critical roles to at least the minimum, log every clamp via getLogger for audit, and assert in tests that the re-routed sites resolve at or above their pre-change tier (s5 ac1). |
| Artifact attribution migration from scalar meta.model to outputs[] (s4/sc5) | Replacing the single per-run model field with a per-output aggregate touches persisted artifact serialization; a non-additive change would make older single-model artifacts unreadable, breaking durability guarantees. | Keep outputs[] strictly additive and back-compat with the legacy meta.model field per the nonFunctional durability rule — read older artifacts through a fallback that synthesizes a single-output record from the legacy scalar, and cover both old-format and new-format reads with tests before removing any writer of the scalar field. |

## Alternatives considered

### a1: Stateless resolver function called lazily at each seam

Generalize buildShaperProvider into a pure resolveProviderForRole(role,cfg) that every reasoning site calls directly, with precedence and floor inline and stamping done per-site.

Generalize the existing buildShaperProvider(cfg, overrides?) (shaper-provider.ts:183–241) into a single stateless pure function resolveProviderForRole(role, cfg) co-located with its template in shaper-provider.ts. The function embeds the whole precedence chain inline — per-repo role override > global role override > tier default > legacy shaperProvider — and invokes the S002 coreFloor clamp before returning a provider. Every reasoning site, including the two hardcoded seams (validate.ts:45, workflow.ts:231), imports and calls it directly with a Role drawn from the C4 taxonomy; no run-wide provider is ever constructed, so prepareWorkflowRun stops building one provider for the whole run. buildSummariserProvider collapses into a role call (summariser → cheap-tier default), preserving its Ollama-local outcome as a config value rather than hardcoded logic.

The config schema (C1) and Role taxonomy (C4) are plain data the function reads; coreFloor (C2) is a small pure clamp the function calls; C3 is the one hub every seam depends on, keeping the contract graph flat and matching s3→{s4,s5}. Per-step model stamping (C5) is each call site's responsibility: after resolving, the site records the resolved provider+model onto that step's output metadata, superseding the single meta.model. Resolution and stamping thus live at the leaves, and the only shared machinery is the resolver plus the clamp.

**Pros:**
- Smallest new surface: one function subsumes buildShaperProvider and buildSummariserProvider, so beyond the ~6 seams the only construction point touched is the single non-test caller prepareWorkflowRun (workflow-rpc.ts:319–344).
- Pure-function resolution is unit-testable per role with only a cfg fixture — each precedence layer and the floor clamp asserts directly, reusing the existing repo-shaper-override.test.ts pattern with no run scaffolding.
- No lifecycle plumbing: sites already have cfg in scope at each seam, so no new object must be threaded through the analyze / workflow / tracker call stacks.

**Cons:**
- Provider construction repeats per invocation: a run touching N reasoning steps builds N providers even when many share one role, versus one build per distinct role.
- Stamping (C5) is duplicated at each of the ~6+ seams, so a single missed site silently retains whole-run attribution — the S004 contract is enforced by convention, not a choke point.
- Adding a future reasoning site is a two-part change (resolve + stamp) with no compiler guarantee the stamp happened, so attribution coverage degrades as sites are added.

**Cost estimate:** M

**Rejected because:** Winner-rank 3 (loser). Satisfies k1, k2, k3, k5 with the smallest surface, but its k4 fit is the weakest of the three: per-output stamping is the responsibility of each of the ~6+ seams with no choke point and no compiler guarantee, so the s4 per-output attribution contract holds only by convention and a single missed site silently retains whole-run attribution — degrading as future sites are added. a2 closes that k4 gap by construction, so a1 loses to it.

### a2: Run-scoped RoleRouter service injected through the run context — **CHOSEN**

Build one RoleRouter per run in prepareWorkflowRun, thread it through the existing run context, and have sites call router.forRole(role) with stamping enforced centrally in the router.

Construct a single RoleRouter object once in prepareWorkflowRun (workflow-rpc.ts:319–344, the current single construction site) from cfg, and thread it through the run context that already flows to the analyze / workflow / tracker sites. Sites call router.forRole(role) instead of building a provider; the router owns the C1 precedence chain and the C2 floor clamp internally and memoizes one provider per resolved role, so repeated same-role steps reuse one provider instance. The two hardcoded seams (validate.ts:45, workflow.ts:231) receive the router from the same context rather than constructing top-tier providers directly, eliminating the bypass.

Because every provider access flows through the router, per-step stamping (C5) is centralized: the router wraps each returned provider so the resolved model identity is recorded on the step output automatically, guaranteeing no seam can emit an output without attribution and closing S004 structurally. The Role taxonomy (C4) is the router's key space; the legacy shaperProvider path (k3) is the router's terminal fallback when no tier or role config resolves; per-repo precedence (k5) is applied inside the router before the floor.

**Pros:**
- One provider built per distinct role per run rather than per invocation: a run with M steps across R roles constructs at most R providers instead of M.
- Stamping is enforced at a single choke point (the router wrapper), so per-output attribution (C5) cannot be skipped by a forgetful seam — S004's contract holds by construction, not convention.
- New reasoning sites get correct routing and stamping for free: they receive the router and call forRole, with no separate stamp step to omit.

**Cons:**
- Requires threading the router through every analyze / workflow / tracker call path that currently lacks such a parameter, including the two hardcoded seams that bypass context entirely today — a wider mechanical change than a leaf import.
- Unit-testing a single role's resolution needs the router assembled from cfg rather than calling a pure function, adding fixture overhead over the existing pure-precedence tests.
- Memoized providers assume a role's model is stable for the run's duration; any future per-step variation within a role forces cache invalidation, coupling cache design to the config model.

**Cost estimate:** L

### a3: Layered precedence chain-of-responsibility with a terminal floor-clamp stage

Model resolution as an ordered chain of resolver stages (per-repo → global → tier-default → legacy) with the coreFloor as a distinct terminal clamp link, assembled from the config schema.

Model resolution as an ordered chain of resolver stages, each producing a candidate tier/provider selection or deferring to the next: per-repo role stage → global role stage → tier-default stage → legacy shaperProvider stage. The C2 coreFloor is a distinct terminal clamp stage appended after selection, so the guardrail is a named, independently-testable link rather than inline logic buried in a function body. resolveProviderForRole (C3) becomes a thin driver that runs a Role through the chain, and the chain composition itself is data assembled from the C1 config schema — the same schema keys map onto the same stages.

This isolates each precedence rule (k5 per-repo, k3 legacy, k4 extend) into its own stage with its own test, and makes the floor a first-class stage the resolver composes — rendering the s3-consumes-s2 dependency explicit in code shape, so S002 can ship and test its clamp against the chain interface before S003 wires it in. Per-step stamping (C5) reads the winning stage's provider+model. The chain is still called at each seam like Alt a1, with stamping at the leaves unless later paired with injection.

**Pros:**
- Each precedence rule is an isolated stage, so changing one layer (e.g. a new override source) touches one link and its test, not a monolithic function body.
- The coreFloor is a discrete named clamp stage, making the S003→S002 dependency visible in the code structure and letting S002 build and test its clamp against the chain interface independently.
- The chain gives a single point for a 'no stage resolved' diagnostic, surfacing misconfiguration as an explicit outcome rather than a silent fallthrough to legacy.

**Cons:**
- Introduces chain/stage machinery for a precedence order that is currently four fixed levels, adding indirection beyond what the fixed order strictly requires.
- More types and files than a single function, enlarging the S001–S003 review surface without changing the observable resolution outcome versus an inline chain.
- The stages must still be invoked at every seam like Alt a1, so on its own it does not remove the per-site stamping duplication — that only closes if combined with the a2 injection.

**Cost estimate:** L

**Rejected because:** Winner-rank 2 (loser). Ranks above a1 by satisfying k2, k3, k5 with stronger structural isolation — the coreFloor as a discrete terminal clamp stage and each precedence rule as its own tested link make the guardrails first-class and visible. But it shares a1's k4 weakness: stamping reads the winning stage at the leaves and, as the alternative itself notes, does not remove per-site stamping duplication unless combined with a2's injection, so per-output attribution (s4 ac1/ac2) is enforced only by convention. Its extra chain/stage machinery also enlarges the S001–S003 review surface without changing the observable resolution outcome. a2 closes the k4 gap entirely, so a3 loses to it.

## Open questions

- architectureShape citation grounding is partial (s6 f2 = partial): every module named in architectureShape (config-catalog.ts, config/analyze.ts, validate.ts, cli/services/workflow.ts, shaper-provider.ts) is grounded to line-level anchors from the s1 analyze pass, but architectureShape's inline '(s1)'..'(s6)' tags reference Stories, not s1 analyze bundles, and no explicit per-module s1-bundle citation is attached inline as f2 requires — the citations[] block below closes this at the artifact level; resolve whether inline per-module bundle tags are additionally required.

## Citations

- **[[c1]]** `analyze-bundle` `s1.analyzeBundles[structural-map] — src/analyze/context/shaper-provider.ts` — "exporting buildShaperProvider(cfg, overrides?) (lines 183–241) and the deliberately-decoupled buildSummariserProvider(cfg) (lines 256–269 ...), plus resolveShaperKind and the sampler/client ambient-co"
- **[[c2]]** `analyze-bundle` `s1.analyzeBundles[search.text] — src/cli/config-catalog.ts` — "src/cli/config-catalog.ts:51–62 holds the models.analyze.* catalog (shaperProvider, shaperModel, ...) that S001's tiers {core,mid,cheap}, role→tier map, coreFloor and byRepo role-override keys extend "
- **[[c3]]** `analyze-bundle` `s1.analyzeBundles[structural-map] — src/config/analyze.ts` — "the config type home in src/config/analyze.ts"
- **[[c4]]** `analyze-bundle` `s1.analyzeBundles[usage.example] — src/daemon/workflow-rpc.ts prepareWorkflowRun` — "buildShaperProvider has exactly ONE non-test caller: prepareWorkflowRun in src/daemon/workflow-rpc.ts (lines 319–344), which builds ONE provider for the whole run"
- **[[c5]]** `analyze-bundle` `s1.analyzeBundles[symbol.locate] — src/agent/providers/cli-provider.ts CliProvider` — "CliProvider (src/agent/providers/cli-provider.ts:88–345) is the claude/codex subprocess wrapper and ALREADY accepts a model option"
- **[[c6]]** `analyze-bundle` `s1.analyzeBundles[config.trace] — legacy models.analyze.shaperProvider` — "The legacy models.analyze.shaperProvider key (default 'ollama', alternatives cli-claude / cli-codex) ... the run-wide behavior the tiering replaces while keeping the unset-key path working as the lowe"
- **[[c7]]** `analyze-bundle` `s1.analyzeBundles[search.text] — src/config/__tests__/repo-shaper-override.test.ts byRepo precedence` — "the per-repo byRepo[repoPath].shaperProvider override (shaper-provider.ts:65) and its resolution (src/config/__tests__/repo-shaper-override.test.ts:34–82 ...) are the existing precedence layer the new"
- **[[c8]]** `analyze-bundle` `s1.analyzeBundles[concept.resolve] — intent-named dispatch callsites (build-step/validate, cli/services/workflow)` — "The intent-named dispatch callsites (workflow-rpc, build-step/validate, cli/services/workflow) were corroborated by the usage.example and config.trace passes, so the seam is trustworthy as the center "

<!-- insrc:review -->

## Review

### ⛔ Review `BLOCK` — design.epic (design.epic)

**0 HIGH · 1 MED · 4 LOW** · model `client` · reviewed 2026-07-25T09:29:43.252Z

| Ref | Kind | Severity | Fixability | Premise | Evidence | Action |
| --- | --- | --- | --- | --- | --- | --- |
| sc6 | citation | MED | manual | workflow-rpc.ts builds ONE buildShaperProvider(cfg) for the run — the single construction site the router injection replaces. | The premise (and the HLD's c4 citation + sc6 assumption + a1 pro) claim `buildShaperProvider` has 'exactly ONE non-test caller: prepareWorkflowRun'. The grep re-derives ~11 PRODUCTION callers: workflow-rpc.ts:341 PLUS the analyze pipeline — classifier/driver.ts:128, scope-picker.ts:125, decomposer.ts:159, synthesizer.ts:116, capability-reuse-check.ts:128, doc-constraint-enumerate.ts:112, doc-decision-trace.ts:119, planner/driver.ts:166, runtimes/shared/adherence.ts:213, aggregator.ts:75. workflow-rpc IS the single WORKFLOW construction site, but 'exactly one non-test caller of buildShaperProvider' is false. | S005 (apply routing at every site) and S003 (generalize buildShaperProvider) must account for ALL ~11 buildShaperProvider production callers — the analyze pipeline reasoning sites (decomposer/synthesizer/planner/explore/runtimes), not just prepareWorkflowRun + the 2 hardcoded sites. The router-generalization (a2) handles this cleanly (the router supersedes buildShaperProvider so every caller gets routed), but the HLD/LLD scope + role taxonomy (sc4) must enumerate these analyze roles. Not a build-break (buildShaperProvider stays functional via the legacy path); a completeness/scope correction for the S005/S003 LLDs. |
| sc3 | semantic | LOW | manual | resolveProviderForRole / a RoleRouter does NOT exist in the codebase today — the Epic introduces it (greenfield). | grep resolveProviderForRole → 0, RoleRouter → 0. The router is genuinely greenfield; the Epic introduces it. Confirmed. | none — verified sound |
| sc3 | citation | LOW | manual | buildShaperProvider (shaper-provider.ts:183) and buildSummariserProvider (shaper-provider.ts:256) are the split the router generalizes. | shaper-provider.ts:183 `export function buildShaperProvider(` and :256 `export function buildSummariserProvider(cfg: AnalyzeConfig): LLMProvider` — the split the router generalizes, at the cited lines. Confirmed. | none — verified sound |
| sc3 | citation | LOW | manual | The LLMProvider type sc3 imports from shared/types.js exists. | src/shared/types.ts:177 `export interface LLMProvider {` — the type sc3's interface sketch imports. Confirmed. | none — verified sound |
| sc6 | citation | LOW | manual | The two hardcoded top-tier sites are `new CliProvider({ kind: 'claude' })` at src/mcp/build-step/phases/validate.ts:45 and src/cli/services/workflow.ts:231 (the HLD abbreviates the first as validate.ts:45). | The two hardcoded top-tier sites are real: src/mcp/build-step/phases/validate.ts:45 `providerOverride ?? new CliProvider({ kind: 'claude' })` and src/cli/services/workflow.ts:231 `new CliProvider({ kind: 'claude' })` (the other 3 matches are live tests). Confirmed; S005's targets exist. | none — verified sound |

#### Proposed fixes

- **sc6** (manual) — Grounding count error propagated from the s1 usage.example pass; correct the scope at LLD time. The chosen router architecture already subsumes all callers, so no design change — only the enumerated site list + role taxonomy grow.
  - option: S003 makes buildShaperProvider a thin shim over the router's default role, so the ~11 analyze callers keep working unchanged and inherit routing transparently.
  - option: S005 explicitly reroutes each analyze-pipeline caller to name its role (decompose/synthesize/narrow/etc.) so they get tiered per the Epic intent.
  - option: Both: shim for back-compat now, reroute the analyze roles for tiering in S005.
