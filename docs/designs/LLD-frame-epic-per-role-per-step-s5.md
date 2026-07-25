<!-- insrc:artifact LLD-820cc07b9c74195c-s5 -->

# LLD: E20260725820cc07b:S005

**Epic:** `frame-epic-per-role-per-step`
**HLD base run:** `wf-1784970656550-ihypng`
**HLD effective hash:** `253f46361f54...`

## HLD context

**Framework:** Chosen framework (alternative a2): a single RoleRouter choke point mediates every reasoning-model access across the analyze, workflow, and tracker lifecycle. Rather than constructing one provider per run in prepareWorkflowRun, the router resolves a provider per reasoning role by generalizing the existing shaper-vs-summariser split in shaper-provider.ts into a role-keyed resolver. Configuration extends the existing models.analyze.* contract with three capability tiers {core, mid, cheap}, a role→tier assignment map, a coreFloor guarantee, and byRepo role/tier overrides — the legacy shaperProvider key (and its unset-default path) remaining the lowest-precedence fallback. Because every role access flows through one wrapper, the coreFloor clamp, the CLI/Ollama-only dispatch invariant, per-repo precedence, and per-output model attribution are each enforced at exactly one place with no bypassing seam; the two hardcoded top-tier sites are converted to receive the router from context. The higher mechanical threading cost is accepted under the Epic's accuracy-primary / cost-least-priority principle.
**Rollout phase:** Phase D — attribution, full-site rollout, and docs
**Owns:** `sc6` (RoutingSeamContext)
**Consumes:** `sc4` (ReasoningRoleTaxonomy), `sc3` (RoleRouter)

## Contract details

**Surface level:** internal-shared

### `resolveProviderForRole`

```typescript
resolveProviderForRole(role: RoleId, cfg: AnalyzeTieringConfig, repoPath?: string): ResolvedProvider
```

**Parameters:**
- `role: RoleId` — The reasoning role each converted site declares at its point of access (sc4). This is the access key S005 supplies from every site.
- `cfg: AnalyzeTieringConfig` — The tiering config read at the router choke point (byRepo role/tier → global role → tier default → legacy shaperProvider → unset default).
- `repoPath: string` _(optional)_ — Carried on the RoutingSeamContext so per-repo precedence (k5) is applied inside the single router call.

**Returns:** `ResolvedProvider` — sc3-owned { provider: LLMProvider; resolution: RoleResolution }; S005 uses provider for the site's structured-output call and never inspects resolution beyond logging.

**Preconditions:**
- A RoutingSeamContext is established (ambient) for the current run; ctx.router is non-null.
- role is a member of the closed sc4 RoleId set.

**Postconditions:**
- Returns a provider whose runner is constrained to 'ollama' | 'cli-claude' | 'cli-codex' (k1); no REST path.
- Critical roles are clamped to coreFloor by the router before return (k2).

### `resolveSummariser`

```typescript
resolveSummariser(cfg: AnalyzeTieringConfig): ResolvedProvider
```

**Parameters:**
- `cfg: AnalyzeTieringConfig` — Tiering config; summariser resolution stays decoupled from the shaper tier and keeps building strictly from cfg.summariser*.

**Returns:** `ResolvedProvider` — The locally-served summariser provider; preserves the existing shaper/summariser decoupling (buildSummariserProvider ignores the sampler + client-provider ambient contexts).

**Preconditions:**
- A RoutingSeamContext is established; ctx.router is non-null.

**Postconditions:**
- Background doc-summarisation sites resolve to their cheap locally-served model regardless of the shaper tier (ac2).

### `buildShaperProvider`

```typescript
buildShaperProvider(cfg: AnalyzeConfig, overrides?: ShaperProviderOverrides): LLMProvider
```

**Parameters:**
- `cfg: AnalyzeConfig` — Legacy factory input. Reached only on the unestablished-context fallthrough path.
- `overrides: ShaperProviderOverrides` _(optional)_ — Existing per-call overrides; unchanged by S005.

**Returns:** `LLMProvider` — The exact provider the site produces today. S005 does NOT modify this factory — it becomes the byte-for-byte legacy fallthrough invoked only when the ambient RoutingSeamContext reader returns undefined (k3).

**Preconditions:**
- No RoutingSeamContext is established for the current run (ambient reader returns undefined).

**Postconditions:**
- Output is identical to the pre-S005 provider for the same cfg/overrides — verified by a non-live unit assertion (established → per-role; unestablished → legacy unchanged), covering the live-gated runCodeShaper gap.

### `buildSummariserProvider`

```typescript
buildSummariserProvider(cfg: AnalyzeConfig): LLMProvider
```

**Parameters:**
- `cfg: AnalyzeConfig` — Summariser config; the one place a role-based provider split already exists.

**Returns:** `LLMProvider` — The local summariser provider. S005 leaves this factory in place as the concrete target router.resolveSummariser generalizes, so the existing decoupling survives.

**Postconditions:**
- Summariser stays local (default Ollama qwen3.6:35b-a3b) regardless of shaper tier.

### `runWithClientProviderContext`

```typescript
runWithClientProviderContext<T>(kind: AnalyzeShaperProviderKind, fn: () => Promise<T>): Promise<T>
```

**Parameters:**
- `kind: AnalyzeShaperProviderKind` — The existing ambient establisher kind. Cited as the proven AsyncLocalStorage run-wrapper pattern (shaper-provider.ts:134-141) that the RoutingSeamContext establishment mirrors.
- `fn: () => Promise<T>` — The run body executed with ambient context set.

**Returns:** `Promise<T>` — Result of fn. This is the run-wrapper template S005 replicates so the RoutingSeamContext is established once (at prepareWorkflowRun) and read ambiently at every deep site — no router argument threaded through ~11 signatures.

**Postconditions:**
- Establishes ambient state deep call sites read back without a threaded argument (the exact seam shape S005 co-locates for the RoutingSeamContext).

### `currentSamplerContext`

```typescript
currentSamplerContext(): SamplerContext | undefined
```

**Returns:** `SamplerContext | undefined` — The existing ambient reader (shaper-provider.ts:132-134) cited as the reader template. S005's converted sites use the analogous ambient reader for the RoutingSeamContext: a value → resolve per role; undefined → fall through to buildShaperProvider(cfg) byte-for-byte (k3).

**Postconditions:**
- Returns established ambient context or undefined at a deep call site with no argument threaded through the signature.

## Data model changes

### `RoutingSeamContext` — new

sc6 owned by S005: the sole sanctioned handle every reasoning site uses to reach a model in place of a run-wide provider. Shape { router: RoleRouter (sc3); repoPath?: string } — matches the HLD interfaceSketch byte-for-byte (a1 winner). Established ONCE in prepareWorkflowRun via the module's existing AsyncLocalStorage run-wrapper pattern (mirroring runWithClientProviderContext/currentSamplerContext at shaper-provider.ts:134-141) and read ambiently at each converted site, which then calls ctx.router.resolveProviderForRole(role, cfg, ctx.repoPath). When unestablished, the ambient reader returns undefined and the site calls buildShaperProvider(cfg) unchanged (k3). Physical landing co-located in src/analyze/context/shaper-provider.ts (the module already owns the ambient pair); the router itself lands per sc3. The explicit-ctx-parameter form shown in the HLD ReasoningSiteEntry sketch is an illustrative alias only — the ambient-reader access mechanics stay internal to s5 per boundary.internal.

```
interface RoutingSeamContext { router: RoleRouter; repoPath?: string }
```

**Call sites:**
- `src/daemon/workflow-rpc.ts — prepareWorkflowRun: the SOLE non-test construction caller; reshaped to construct the RoleRouter and establish the RoutingSeamContext around the run (already the S003-converted run-wide seam).`
- `src/analyze/context/shaper-provider.ts — physical landing of the seam pair, mirroring runWithClientProviderContext/currentSamplerContext (134-141).`
- `Enumerated analyze-pipeline reader sites (s1 usage.example — NOT graph-located; pin file:line at build via direct-bypass audit): analyze.scope.pick, analyze.classify, analyze.plan, analyze.decompose, analyze.synthesize, analyze.adherence, analyze.aggregate, analyze.narrow (three probes), workflow.questions.`
- `Peripheral render/summarise reader sites (ac2 defaults → cheap tier): render.issueBody, render.summary, indexer.summarise.`
- `Hardcoded top-tier sites to re-route (HLD assumption / s1 gap 2 — not surfaced in s1 output; locate at build): validate.ts:45, src/cli/services/workflow.ts:231.`

## Interaction with shared contracts

| Contract | Role | How |
| :--- | :--- | :--- |
| `sc6` | implements | S005 owns and lands RoutingSeamContext (HLD sc6.ownedByStory = s5). It defines the { router, repoPath? } shape, establishes it once in prepareWorkflowRun using the module's proven AsyncLocalStorage run-wrapper pattern, and threads it into every reasoning site (the ~11 analyze-pipeline sites, the peripheral render/summarise sites, and the two hardcoded top-tier sites at validate.ts:45 / cli/services/workflow.ts:231) so no operation bypasses role-aware routing (ac1). Only the RoutingSeamContext shape is exposed; the per-site edits and each site's declared role name stay internal to s5. |
| `sc3` | consumes | Every converted site obtains its provider by calling ctx.router.resolveProviderForRole(role, cfg, ctx.repoPath) (sc3 published signature, unchanged — no wrapper or second entry point, so s4/s6 see the same choke point). Summariser sites call ctx.router.resolveSummariser(cfg), preserving the shaper/summariser decoupling. When no RoutingSeamContext is established, the ambient reader returns undefined and the site falls through to buildShaperProvider(cfg) byte-for-byte (k3). S005 does not construct providers directly at any site. |
| `sc4` | consumes | Each converted site names its own RoleId (sc4) at the point of access — e.g. analyze.plan, analyze.decompose, analyze.narrow, workflow.questions, render.issueBody, render.summary, indexer.summarise, plus the RoleId each hardcoded top-tier site declares (pinned at build, s1 gap 5). S005 supplies only the RoleId access key; the closed set, criticality, and defaultTier are owned by the sc4 taxonomy and applied inside the router. |

## Error paths

### Error cases

- **A RoutingSeamContext is established for the run but its `router` field is nullish (broken establishment in prepareWorkflowRun — e.g. RoleRouter construction returned undefined). A converted reasoning site reads the ambient context and finds it present but unusable.** (terminal)
  - Detection: The read choke-point that wraps the ambient reader checks `ctx.router` before dispatch: the reader returns a defined RoutingSeamContext object whose `.router` is nullish, so the guard throws a typed invariant error instead of silently falling through to buildShaperProvider (which would mask the misconfiguration by reverting the whole run to the legacy top model).
  - Response: Throw a typed establishment-invariant error at the read site; the run fails fast at the first reasoning call rather than proceeding with a half-established seam.
  - User impact: The operator gets an explicit misconfiguration failure instead of a run that silently ignores tiering and uses the top model everywhere — the failure is loud and traceable to establishment.
- **A production reasoning site is missed by the conversion (still calls buildShaperProvider(cfg) directly, or a hardcoded top-tier site at validate.ts:45 / cli/services/workflow.ts:231 constructs its provider directly), so it bypasses role-aware routing while a RoutingSeamContext is established (violates ac1).** (recoverable)
  - Detection: A non-live static bypass-audit test enumerates every production caller of buildShaperProvider and asserts exactly one sanctioned caller remains — the single ambient-fallthrough guard. Any additional production call edge (a residual direct site) fails the assertion at build/CI time. This closes the CALLS-graph blind spot from s1 (the ~11 sites do not surface as graph edges).
  - Response: The build/CI assertion fails; the missed site must be converted to the ambient-reader → ctx.router.resolveProviderForRole path before merge.
  - User impact: Prevents an operation from silently bypassing role-aware routing and always burning the top tier; guarantees ac1's 'no direct bypass remaining' at the point of merge.
- **A converted site declares a RoleId string that is not a member of the closed sc4 role set (a typo or a role that was never registered in the taxonomy).** (recoverable)
  - Detection: RoleId is a closed TypeScript union; the site passes its role literal into resolveProviderForRole(role, cfg, repoPath). A literal outside the union fails `tsc` at build — the error surfaces at type-check, never reaching runtime (the router's contract lists no runtime error for unknown roles).
  - Response: Type-check fails at build; the site must use a valid sc4 RoleId (or the taxonomy must first add the role in s1/sc4 territory).
  - User impact: A mislabelled site cannot ship; every reasoning site is guaranteed to name a real role, so routing is total and deterministic.

### Edge cases

| Input | Expected |
| :--- | :--- |
| A reasoning site runs on a code path where no RoutingSeamContext was ever established (e.g. a direct analyze-CLI entry that never passed through prepareWorkflowRun). | The ambient reader returns undefined and the site calls buildShaperProvider(cfg) — byte-for-byte the pre-S005 provider (k3 legacy fallthrough). No tiering, no error. |
| A RoutingSeamContext is established and a tiering config exists, but there is no per-repo and no global override for this site's role. | resolveProviderForRole walks the precedence chain (byRepo role/tier → global role → tier default → legacy shaperProvider → unset default) and resolves to the tier default — the cheap locally-served model for peripheral roles (ac2). |
| A summariser site (render.summary / indexer.summarise via resolveSummariser) runs while the shaper tier is configured to the top model. | resolveSummariser ignores the shaper tier and resolves the local cheap summariser (default Ollama qwen3.6:35b-a3b), preserving the pre-existing shaper/summariser decoupling (ac2). |
| A critical role is configured (per-repo or global) below the coreFloor. | The router clamps the resolution up to coreFloor (k2) before returning; the site receives a provider at or above the floor, not the misconfigured cheaper tier. |
| The established RoutingSeamContext carries repoPath = undefined (a global/no-active-repo run). | The per-repo precedence layer (k5) is skipped inside the single router call; resolution proceeds on the global role/tier chain. No error from the missing repoPath (it is optional on the context). |
| A peripheral render/probe site (render.issueBody, the three analyze.narrow probes) runs at its default tier with a RoutingSeamContext established. | It resolves through role-aware routing to the cheap tier's locally-served model (ac2) — the same choke point as every core site, differing only by declared RoleId. |

### Invariants to preserve

- Unestablished-context fallthrough stays byte-for-byte legacy: when the ambient RoutingSeamContext reader returns undefined, the site calls buildShaperProvider(cfg) and produces the exact provider it produces today (k3). The reader/establisher seam pair is the same AsyncLocalStorage mechanism, not a reinvention. [[c2]]
- No new REST/cloud path is introduced: every resolved provider's runner is constrained to 'ollama' | 'cli-claude' | 'cli-codex', with mid/cheap tiers dispatching through the model-option-aware CliProvider (k1). buildShaperProvider itself is unmodified by S005. [[c3]]
- The existing shaper/summariser decoupling survives: buildSummariserProvider stays a separate local factory that ignores the sampler and client-provider ambient contexts, and resolveSummariser keeps the summariser on its cheap locally-served model regardless of shaper tier (ac2). [[c3]]
- The ambient-context seam is co-located in shaper-provider.ts mirroring the proven runWithClientProviderContext (establisher) / currentSamplerContext (reader) pair, using camelCase run-wrapper + reader vocabulary to match the module's own conventions — deep sites read state back without threading a router argument through ~11 signatures. [[c1]]
- prepareWorkflowRun (workflow-rpc.ts:402–431) remains the sole production establishment site — the already-S003-converted run-wide seam — and is the canonical byte-for-byte preservation reference for how a converted site behaves when no tiering is configured. [[c4]]
- The legacy models.analyze.shaperProvider key stays the lowest-precedence fallback and survives upgrade untouched (installer deliberately leaves it unset); the new tier/role/coreFloor keys extend the models.analyze.* catalog additively above it, and the router reads all of this at its single choke point, not per site (k3). [[c6]]

## Test strategy

**Test framework:** `node:test (Node built-in test runner, run via `npx tsx --test 'src/**/__tests__/*.test.ts'` per the s1 test.locate anchor code-shaper.live.test.ts; strict-assert)`

### Test levels

- **unit** — Prove the RoutingSeamContext ambient seam routes per-role when established and falls through byte-for-byte to buildShaperProvider(cfg) when unestablished (k3) — the non-live counterpart to the live-gated runCodeShaper anchor (s1 gap 4). Also cover coreFloor clamp (k2), peripheral tier defaults, summariser decoupling (ac2), and the typed nullish-router invariant (s5 error case 1).
  - Subjects: `src/analyze/context/__tests__/routing-seam-context.test.ts — establish a RoutingSeamContext via the co-located run-wrapper (mirroring runWithClientProviderContext) and assert a converted site reaches ctx.router.resolveProviderForRole(role, cfg, repoPath); assert an UNESTABLISHED context makes the ambient reader return undefined and the site produces the exact provider buildShaperProvider(cfg) returns (byte-for-byte, k3)`, `src/analyze/context/__tests__/routing-seam-context.test.ts — a critical role configured below coreFloor resolves clamped up to coreFloor (k2); a peripheral role with no per-repo/global override resolves to the tier default cheap locally-served model (ac2)`, `src/analyze/context/__tests__/routing-seam-context.test.ts — resolveSummariser(cfg) returns the local cheap summariser regardless of the configured shaper tier, preserving the shaper/summariser decoupling (ac2); repoPath=undefined skips the per-repo layer without error (k5 edge)`, `src/analyze/context/__tests__/routing-seam-context.test.ts — an established RoutingSeamContext whose .router is nullish throws the typed establishment-invariant error at the read choke-point instead of silently falling through to buildShaperProvider (s5 error case 1)`
  - Fixtures: `A fake RoleRouter test double exposing resolveProviderForRole / resolveSummariser with a scripted precedence table (byRepo role/tier → global role → tier default → legacy shaperProvider → unset default) and a coreFloor`, `A stub AnalyzeTieringConfig with per-repo, global-role, tier-default, and legacy-shaperProvider layers to exercise each precedence branch`, `A recognizable sentinel LLMProvider per tier so the resolved provider's identity/runner ('ollama' | 'cli-claude' | 'cli-codex') is assertable without a live model (k1)`, `The real buildShaperProvider(cfg) invoked with the same cfg to capture the legacy-path provider for the byte-for-byte fallthrough comparison`
- **unit** — Static bypass audit proving ac1's 'no direct bypass remaining': after S005 exactly one sanctioned production caller of buildShaperProvider survives (the single ambient-fallthrough guard). Closes the s1 CALLS-graph blind spot where the ~11 analyze-pipeline sites and the two hardcoded top-tier sites (validate.ts:45, cli/services/workflow.ts:231) do not surface as graph edges.
  - Subjects: `src/analyze/context/__tests__/provider-bypass-audit.test.ts — statically enumerate every PRODUCTION (non-__tests__, non-stub) call edge to buildShaperProvider across src/ and assert there is exactly one — the sanctioned ambient-fallthrough choke point; any residual direct site fails at build/CI`, `src/analyze/context/__tests__/provider-bypass-audit.test.ts — assert the two formerly-hardcoded top-tier sites (validate.ts:45, src/cli/services/workflow.ts:231) no longer construct a provider directly and instead route through ctx.router.resolveProviderForRole`
  - Fixtures: `A source-scan helper (Grep/glob over src/**, excluding **/__tests__/**) that lists production call sites of buildShaperProvider and of direct provider construction at the two hardcoded seams`, `An allowlist of the single sanctioned fallthrough site so the assertion pins the exact count and location`
- **unit** — Type-level guard: every converted site names a RoleId from the closed sc4 union, so an unknown/typo role fails tsc rather than reaching runtime (s5 error case 3). Enforced by the default build/type-check gate rather than a runtime assertion.
  - Subjects: `tsc build over src/analyze/** — a converted site passing a role literal outside the closed RoleId union fails type-check (compile-time totality of role→routing)`
  - Fixtures: `The closed RoleId union from sc4 as the type constraint on resolveProviderForRole's first parameter (already contract-owned; test relies on the existing `npm run build` / tsc gate)`
- **live** — End-to-end confirmation through a real provider that the established-context, no-tiering-configured path yields the same shaper behavior as today — the existing anchor, kept as the live counterpart to the new non-live unit assertion. Env-gated (INSRC_LIVE_TESTS) so it skips cleanly in the default sweep.
  - Subjects: `src/analyze/context/__tests__/code-shaper.live.test.ts:119 — runCodeShaper with a RoutingSeamContext established but no tier config resolves to the same provider buildShaperProvider(cfg) yields today (byte-for-byte preservation, k3), extending the existing live anchor rather than replacing it`
  - Fixtures: `INSRC_LIVE_TESTS=1 gate (skips when unset, per project convention)`, `A live Ollama shaper provider (default qwen3.6:35b-a3b) reachable for the run`

### Acceptance mapping

| Criterion | Proving tests |
| :--- | :--- |
| `ac1` | `src/analyze/context/__tests__/provider-bypass-audit.test.ts — exactly one sanctioned production caller of buildShaperProvider remains (no direct bypass; ~11 sites + validate.ts:45 + cli/services/workflow.ts:231 all route through ctx.router)`, `src/analyze/context/__tests__/routing-seam-context.test.ts — an established RoutingSeamContext makes a formerly-top-tier site obtain its provider via ctx.router.resolveProviderForRole(role, cfg, repoPath) like every other operation`, `src/analyze/context/__tests__/routing-seam-context.test.ts — a critical role configured below coreFloor is clamped up to coreFloor before return (k2)`, `tsc build over src/analyze/** — every converted site names a valid closed-union sc4 RoleId, so routing is total and no site can ship unrouted`, `src/analyze/context/__tests__/routing-seam-context.test.ts — unestablished context falls through to buildShaperProvider(cfg) byte-for-byte (k3), and a nullish-router established context throws the typed invariant instead of silently reverting to the top model` |
| `ac2` | `src/analyze/context/__tests__/routing-seam-context.test.ts — peripheral render/probe roles (render.issueBody, render.summary, indexer.summarise, the three analyze.narrow probes) at their defaults resolve through role-aware routing to the cheap tier's locally-served model`, `src/analyze/context/__tests__/routing-seam-context.test.ts — resolveSummariser(cfg) resolves the local cheap summariser (default Ollama qwen3.6:35b-a3b) regardless of the configured shaper tier, preserving the shaper/summariser decoupling`, `src/analyze/context/__tests__/routing-seam-context.test.ts — a peripheral role with no per-repo and no global override walks the precedence chain to the tier default cheap locally-served model, and every resolved provider's runner is constrained to 'ollama' | 'cli-claude' | 'cli-codex' (k1, no REST path)` |

## Migration

**State before:** Per s1 bundles, every reasoning site in the analyze/workflow pipeline acquires its model by calling buildShaperProvider(cfg) directly (shaper-provider.ts:207–271; symbol.locate bundle), and summariser sites call the separate buildSummariserProvider(cfg) (shaper-provider.ts:256–269). The module already owns an AsyncLocalStorage ambient-context seam pair — runWithClientProviderContext (establisher, 147–152) / currentSamplerContext (reader, 132–134) — but there is NO RoutingSeamContext and NO role-aware routing (module.profile + symbol.locate bundles). The CALLS graph surfaces only ONE production caller of buildShaperProvider — prepareWorkflowRun in workflow-rpc.ts:402–431 (usage.example bundle) — while the ~11 enumerated analyze-pipeline sites (analyze.scope.pick, analyze.classify, analyze.plan, analyze.decompose, analyze.synthesize, analyze.adherence, analyze.aggregate, three analyze.narrow probes, workflow.questions), the peripheral render/summarise sites (render.issueBody, render.summary, indexer.summarise), and two hardcoded top-tier sites (validate.ts:45, cli/services/workflow.ts:231) do NOT appear as graph edges and must be located by direct-bypass audit. Tiering config keys (models.analyze.*) exist as an additive catalog with a byRepo precedence layer and a legacy models.analyze.shaperProvider fallback (search.text bundle: config-catalog.ts:52–62, repo-shaper-override.test.ts:34–82). The only existing test anchor for the factory path is the live-gated runCodeShaper (code-shaper.live.test.ts:119; test.locate bundle) — no non-live unit assertion covers the ambient seam.

**State after:** A RoutingSeamContext { router: RoleRouter; repoPath? } (sc6) is established exactly once per run in prepareWorkflowRun using the module's proven AsyncLocalStorage run-wrapper pattern (mirroring runWithClientProviderContext/currentSamplerContext at shaper-provider.ts:132–152). Every reasoning site — the ~11 analyze-pipeline sites, the peripheral render/summarise sites, and the two formerly-hardcoded top-tier sites (validate.ts:45, cli/services/workflow.ts:231) — reads the ambient context and, when present, obtains its provider via ctx.router.resolveProviderForRole(role, cfg, ctx.repoPath) declaring its own RoleId; summariser sites call ctx.router.resolveSummariser(cfg), preserving the shaper/summariser decoupling. No operation bypasses role-aware routing (ac1); peripheral render/summarise/narrow-probe defaults resolve to the cheap tier's locally-served model (ac2); critical roles are clamped to coreFloor and all providers stay on ollama|cli-claude|cli-codex (k1/k2). When no RoutingSeamContext is established (ambient reader returns undefined), each site falls through to buildShaperProvider(cfg) byte-for-byte (k3), so buildShaperProvider/buildSummariserProvider signatures and outputs are unchanged. A new non-live unit test asserts both branches (established → per-role; unestablished → legacy unchanged), closing the live-gated runCodeShaper gap.

**Zero downtime:** yes — **Data rewrite:** no

### Steps

1. Co-locate the new RoutingSeamContext ambient seam pair (establisher run-wrapper + reader) in src/analyze/context/shaper-provider.ts, mirroring the existing runWithClientProviderContext/currentSamplerContext AsyncLocalStorage shape (132–152). Additive-only: no existing export is changed, so the legacy path is untouched. — ↩ rollbackable
2. Run a direct-bypass audit (grep for buildShaperProvider callers plus the two named hardcoded top-tier sites at validate.ts:45 and cli/services/workflow.ts:231) to enumerate and pin file:line for every reasoning site, since the CALLS graph under-reports them; assign each located site its RoleId per the sc4 taxonomy. Read-only inventory step, trivially reversible. — ↩ rollbackable
3. Reshape prepareWorkflowRun (workflow-rpc.ts:402–431) to construct the RoleRouter and establish the RoutingSeamContext around the run body via the new run-wrapper. Keep the existing run-wide seam behaviour so a run with no tiering config resolves identically to today. — ↩ rollbackable
4. Convert each enumerated analyze-pipeline site to read the ambient RoutingSeamContext and call ctx.router.resolveProviderForRole(role, cfg, ctx.repoPath) with its declared RoleId, falling through to buildShaperProvider(cfg) unchanged when the reader returns undefined. Convert site-by-site so each can be reverted independently. — ↩ rollbackable
5. Convert the peripheral render/summarise reader sites (render.issueBody, render.summary, indexer.summarise) the same way, with defaults mapping to the cheap tier (ac2); route summariser sites through ctx.router.resolveSummariser(cfg) so the existing shaper/summariser decoupling is preserved. — ↩ rollbackable
6. Re-route the two hardcoded top-tier sites (validate.ts:45, cli/services/workflow.ts:231) through role-aware routing with their pinned RoleId so no direct top-model bypass remains (ac1), keeping their effective tier at top via defaultTier/criticality rather than a hardcoded provider. — ↩ rollbackable
7. Add a non-live unit test asserting the two branches: an established RoutingSeamContext routes per-role, and an unestablished context falls through to buildShaperProvider(cfg) byte-for-byte — closing the live-gated runCodeShaper coverage gap. Test-only addition. — ↩ rollbackable

**Backward compat:** buildShaperProvider(cfg, overrides?) and buildSummariserProvider(cfg) keep their exact signatures and outputs — S005 does not modify either factory; they become the byte-for-byte legacy fallthrough invoked only when the ambient RoutingSeamContext reader returns undefined (k3), so any caller outside a router-established run behaves identically to pre-S005. The legacy models.analyze.shaperProvider config key remains the lowest-precedence fallback and survives upgrade untouched (k3); the installer leaving it unset is preserved. The new tier/role/coreFloor keys and the byRepo role/tier precedence layer are strictly additive above the existing catalog, so an existing on-disk config with no tiering keys resolves exactly as today. RoutingSeamContext and resolveProviderForRole/resolveSummariser are internal-shared (surfaceLevel), not an externally consumed API surface, and the per-site RoleId assignments stay internal to s5.

## Alternatives considered

### a1: Ambient run-wrapper + reader seam (mirror the existing AsyncLocalStorage pair) — **CHOSEN**

RoutingSeamContext is established by runWithRoutingContext(ctx, fn) and read by currentRoutingContext() at each deep site, exactly mirroring runWithClientProviderContext/currentSamplerContext already in shaper-provider.ts.

Co-locate the seam in src/analyze/context/shaper-provider.ts next to the existing ambient pair (132–152). Add a camelCase establisher runWithRoutingContext(ctx: RoutingSeamContext, fn) that sets an AsyncLocalStorage cell, and a reader currentRoutingContext(): RoutingSeamContext | undefined. RoutingSeamContext carries { router: RoleRouter; repoPath?: string } per the HLD sketch. Each of the ~11 enumerated sites (analyze.scope.pick/classify/plan/decompose/synthesize/adherence/aggregate, the three analyze.narrow probes, workflow.questions), prepareWorkflowRun, and the two hardcoded top-tier sites (validate.ts:45, cli/services/workflow.ts:231) names its own RoleId inline at the point of access: ctx.router.resolveProviderForRole(role, cfg, ctx.repoPath). When no context is established, the site falls through to today's buildShaperProvider(cfg) result byte-for-byte. prepareWorkflowRun becomes the top-level establisher wrapping the run; peripheral render/summarise sites resolve their cheap-tier role through the same reader. buildSummariserProvider stays local and is reached via router.resolveSummariser, preserving the existing shaper/summariser decoupling (ac2).

### a2: Explicit RoutingSeamContext parameter threaded through every reasoning site

RoutingSeamContext is passed as an explicit argument into every reasoning-site signature — no ambient storage — so each site's dependency on the router is visible in its type.

Model the seam purely as the HLD's ReasoningSiteEntry = (ctx: RoutingSeamContext, role: RoleId) => ... . Every enumerated site's function signature gains a leading ctx: RoutingSeamContext parameter (or a small { ctx } field on its existing options object), and callers thread it down from prepareWorkflowRun, which constructs the single RoutingSeamContext { router, repoPath } for the run. Sites resolve via ctx.router.resolveProviderForRole(role, cfg, ctx.repoPath). The two hardcoded top-tier sites (validate.ts:45, cli/services/workflow.ts:231) receive ctx the same way. Legacy behavior is preserved by making ctx optional (ctx?: RoutingSeamContext): when omitted, the site falls back to buildShaperProvider(cfg). No AsyncLocalStorage cell is introduced; the seam is a plain value on the call graph.

**Rejected because:** Second overall (winnerRank 2): it maximizes ac1 (compile-time bypass detection) and carries no AsyncLocalStorage propagation risk, but scores partial on sc6 (introduces a competing convention against the module's ambient pattern, and the optional-ctx form weakens the 'seam is the only sanctioned way' guarantee) and on k3 (optional-ctx doubles the legacy path at every site, widening the drift surface vs a1's single legacy path). It also carries the largest blast radius (cost L) — every ~11 deep signatures and their intermediate callers change. The Epic accepts the cost, but the contract-fidelity and legacy-drift partials keep it behind a1.

### a3: Narrowed resolver-closure seam (ambient delivery, router internals hidden)

The seam exposes only a bound resolveForRole(role): ResolvedProvider closure — not the raw router/cfg/repoPath — delivered ambiently, so sites can request a provider for a role but cannot reach router internals or precedence config.

Keep ambient delivery (runWithRoutingContext + currentRoutingContext) as in a1, but narrow the RoutingSeamContext surface: instead of exposing { router, repoPath } and letting each site call router.resolveProviderForRole(role, cfg, repoPath), the context exposes a single pre-bound method resolveForRole(role: RoleId): ResolvedProvider (and resolveSummariser(): ResolvedProvider). prepareWorkflowRun binds router, cfg, and repoPath into that closure once when it establishes the context; the per-(role, repo) provider cache (nonFunctional.performance) lives inside the closure. Deep sites call ctx.resolveForRole(role) and read resolution off the returned ResolvedProvider for attribution (sc5). Unestablished → the site falls through to buildShaperProvider(cfg) byte-for-byte.

**Rejected because:** Third overall (winnerRank 3): it keeps a1's low churn and clean k3 fallthrough and adds a natural home for the per-(role,repo) cache, but it is the weakest on contract fidelity — partial on sc6 (hides the { router, repoPath } surface the sketch mandates), partial on sc3 (adds a second resolveForRole entry point over resolveProviderForRole that s4/s6 sc3-consumers never see and that must not drift), and partial on sc4. It also still inherits a1's ambient silent-fallthrough risk without a2's compile-time compensation. The extra indirection over sc3 that s4/s6 do not see is a drift liability that outweighs its narrowness benefit.

## Open questions

- dataModelChanges callSites grounding (s8 dm1, partial): not every RoutingSeamContext callSite derives from an s1 analyze bundle — the peripheral render sites (render.issueBody, render.summary, indexer.summarise) come from HLD sc4 and the two hardcoded top-tier sites (validate.ts:45, cli/services/workflow.ts:231) come from HLD assumptions, and did not surface as CALLS-graph edges in s1. These file:line locations must be pinned at build via the direct-bypass audit (closing s1 backFlowNotes gap 2) rather than being confirmed at LLD time.
- Per-site RoleId assignment (s1 gap 5, deferred to build): each enumerated site has a natural RoleId per the sc4 taxonomy, but the exact string each site declares — plus each hardcoded top-tier site's RoleId, criticality, and defaultTier — is pinned when the site is located during the bypass audit, not from discovery output.
- Physical landing of the RoleRouter (s1 backFlowNotes gap 1, UNVERIFIED): co-locating the RoutingSeamContext seam in shaper-provider.ts is confirmed as the natural home (the module owns the ambient pair), but whether the RoleRouter (sc3) itself lands there vs. a new module was not confirmed by an import.graph pass and is decided in sc3 territory.

## Citations

- **[[c1]]** `step-output` `s1.analyzeBundles[0] module.profile — src/analyze/context/shaper-provider.ts` — "it already exports the AsyncLocalStorage ambient-context seam pair — runWithClientProviderContext (establisher, lines 147–152) / currentSamplerContext (reader, lines 132–134) plus runWithSamplerContex"
- **[[c2]]** `step-output` `s1.analyzeBundles[1] symbol.locate — shaper-provider.ts:147–152 / 132–134` — "This establisher/reader pair is the mechanism S005 replicates as a RoutingSeamContext run-wrapper + reader so the ~11 deep analyze-pipeline sites obtain the RoleRouter (or resolve a role) ambiently — "
- **[[c3]]** `step-output` `s1.analyzeBundles[2] symbol.locate — buildShaperProvider (shaper-provider.ts:207–271) / buildSummariserProvider (256–269)` — "buildShaperProvider(cfg: AnalyzeConfig, overrides?: ShaperProviderOverrides): LLMProvider ... is the single factory every S005 call site currently invokes directly and that resolveProviderForRole (sc3"
- **[[c4]]** `step-output` `s1.analyzeBundles[3] usage.example — prepareWorkflowRun (src/daemon/workflow-rpc.ts:402–431)` — "The CALLS graph on buildShaperProvider ... resolves exactly ONE production caller: prepareWorkflowRun in src/daemon/workflow-rpc.ts (lines 402–431) — the run-wide seam S003 already rerouted ... prepar"
- **[[c5]]** `step-output` `s1.analyzeBundles[4] test.locate — code-shaper.live.test.ts:119 (runCodeShaper)` — "runCodeShaper (src/analyze/context/__tests__/code-shaper.live.test.ts:119) ... is the natural anchor for the S005 no-tiering-configured invariant ... this is a .live test — likely env-gated (INSRC_LIV"
- **[[c6]]** `step-output` `s1.analyzeBundles[5] search.text — config-catalog.ts:52–62, repo-shaper-override.test.ts:34–82, installer scripts/insrc-daemon-install.sh:277` — "The legacy models.analyze.shaperProvider key ... installer scripts/insrc-daemon-install.sh:277 deliberately leaves it unset) is the lowest-precedence fallback that must survive upgrade untouched (k3)."
- **[[c7]]** `step-output` `s3.winnerId + winnerRationale` — "a1 wins because it is the only alternative that satisfies every scored constraint without introducing a divergence or a drift-prone second surface ... a1 wins on contract fidelity + lowest-risk legacy"
- **[[c8]]** `step-output` `s8.results[3] dm1 verdict=partial` — "the peripheral render sites (render.issueBody, render.summary, indexer.summarise) come from HLD sc4, and the two hardcoded sites (validate.ts:45, cli/services/workflow.ts:231) come from HLD assumption"

<!-- insrc:review -->

## Review

### ⛔ Review `BLOCK` — design.story (design.story)

**0 HIGH · 1 MED · 7 LOW** · model `client` · reviewed 2026-07-25T16:56:35.909Z

| Ref | Kind | Severity | Fixability | Premise | Evidence | Action |
| --- | --- | --- | --- | --- | --- | --- |
| dm1 | inventory | MED | manual | The peripheral render sites (tracker render.issueBody / render.summary) call buildShaperProvider so S005 can convert them to the cheap tier. | rg over src/workflow/tracker finds NO buildShaperProvider / new CliProvider / new OllamaProvider — tracker rendering constructs no provider directly. The render.issueBody / render.summary roles are served (if at all) through the workflow driver (S003), not a buildShaperProvider site. Separately, driver.ts:899 constructs `new OllamaProvider` for the tool-loop path, which is DELIBERATELY Ollama-only (CliProvider.supportsTools===false) and must NOT be converted. | Drop render.issueBody/render.summary from the S005 conversion list — they are not buildShaperProvider sites. The real conversion set is the 11 analyze sites + validate.ts:45 + cli/services/workflow.ts:231. The bypass audit must ALLOWLIST role-router.ts:168 (sanctioned materialize) AND driver.ts:899 (tool-loop OllamaProvider, intentionally unrouted), not assert 'exactly one provider construction'. |
| migration/state-before | inventory | LOW | manual | The analyze-pipeline sites that call buildShaperProvider directly are the ~11 named (scope.pick, classify, plan, decompose, synthesize, adherence, aggregate, 3 narrow probes, questions) plus prepareWorkflowRun. | Re-derivation confirms EXACTLY 11 analyze-pipeline buildShaperProvider sites to convert: scope-picker.ts:125, questions.ts:172, classifier/driver.ts:128, capability-reuse-check.ts:128, doc-decision-trace.ts:119, doc-constraint-enumerate.ts:112, adherence.ts:213, planner/driver.ts:166, aggregator.ts:75, decomposer.ts:159, synthesizer.ts:116. Plus workflow-rpc.ts:424 (prepareWorkflowRun, already S003-routed) and role-router.ts:168 (the sanctioned materialize — the ONE caller the bypass audit must allowlist). The ~11 inventory is accurate. | none — verified sound (11 analyze sites confirmed; the sanctioned survivor is role-router.ts:168 materialize) |
| dm1/step6 | citation | LOW | manual | There is a hardcoded top-tier provider-construction site at a validate.ts:45 that S005 must reroute. | src/mcp/build-step/phases/validate.ts:45 reads `const provider: ValidateProvider = providerOverride ?? new CliProvider({ kind: 'claude' })` — a real hardcoded top-tier CliProvider construction site, exactly as the HLD assumed. A legitimate reroute target (validation → a critical/core role). | none — verified sound |
| dm1/step6 | citation | LOW | manual | There is a hardcoded top-tier provider-construction site at src/cli/services/workflow.ts:231 that S005 must reroute. | src/cli/services/workflow.ts:231 reads `const provider = new CliProvider({ kind: 'claude' })` — a real hardcoded CliProvider site. NOTE for build: this is a CLI-side service; rerouting it requires that a RoutingSeamContext is established on that path (or it falls through unchanged), so treat with care. | none — verified sound (site exists; confirm establishment path at build) |
| c1/c2 | citation | LOW | manual | shaper-provider.ts already exports an AsyncLocalStorage ambient establisher runWithClientProviderContext and reader currentSamplerContext that S005 mirrors. | shaper-provider.ts exports runWithClientProviderContext (1) + currentSamplerContext (1) over AsyncLocalStorage (4 refs) — the proven ambient establisher/reader pair S005 mirrors for RoutingSeamContext. | none — verified sound |
| c3 | citation | LOW | manual | buildShaperProvider is at shaper-provider.ts:207-271 and buildSummariserProvider at 256-269. | read at shaper-provider.ts:207 = `export function buildShaperProvider(`; buildSummariserProvider export also present. The cited 207-271/256-269 are correct against the current (post-S003) tree. | none — verified sound |
| c4 | citation | LOW | manual | prepareWorkflowRun (the sole run-wide establisher) is at workflow-rpc.ts:402-431. | read at workflow-rpc.ts:402 = `export function prepareWorkflowRun(rawParams: unknown): PreparedWorkflowRun {` — the cited 402-431 is correct post-S003/S004. | none — verified sound |
| c5 | citation | LOW | manual | runCodeShaper is anchored at code-shaper.live.test.ts:119 as the live test for the shaper factory path. | code-shaper.live.test.ts:119 = `async function runCodeShaper(` — the live anchor exists as cited. | none — verified sound |
