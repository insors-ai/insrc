<!-- insrc:artifact DEF-820cc07b9c74195c -->

# Epic: Across the analyze, workflow, and tracker lifecycle, every reasoning operation in a given run is served by a single provider chosen once for the whole run, regardless of how much capability that particular operation actually needs.

**Flavor:** enhancement

## Problem

Across the analyze, workflow, and tracker lifecycle, every reasoning operation in a given run is served by a single provider chosen once for the whole run, regardless of how much capability that particular operation actually needs. High-stakes reasoning (alternative generation and judging, contract detailing, scope-boundary audits, review, build/implement, and the define-stage framing work) and low-stakes peripheral work (issue-body and summary rendering, indexer summarisation, and narrow context probes) are treated identically, so peripheral operations consume the most capable — and most expensive and slowest — model even where a weaker one would suffice, while there is simultaneously no guarantee that the operations that genuinely require high capability cannot be quietly served by a weaker one. Operators cannot express, per operation or per repository, which work deserves top capability and which can trade capability for cost and speed, and stamping a single model on the whole artifact hides which model actually produced each output.

## Non-goals

- **Reaching cheaper or alternative models through any direct cloud REST integration.** — All model access must continue to flow through the claude/codex CLI or local Ollama; a direct REST path is explicitly forbidden by the project's no-direct-cloud-REST principle.
- **Adding model-selection capability to the CLI subprocess wrapper itself.** — The wrapper already accepts a model option [[c4]]; only the role-aware routing that chooses which model is new, so no wrapper change is in scope.
- **Redesigning or re-sequencing the analyze, workflow, or tracker pipeline logic.** — The Epic concerns which model serves each existing step, not the steps' behaviour or ordering.
- **Adaptive or runtime model selection driven by live cost telemetry or output content.** — Selection is by declared role/step identity plus operator configuration, not by dynamic heuristics.
- **Applying capability differentiation to embedding generation.** — Embeddings are local-only by architecture and outside the reasoning-role surface this Epic addresses.

## Assumptions

- `high` The claude/codex CLI wrapper already accepts a model selection, so differentiating capability per operation requires no new subprocess or transport mechanism — only routing. [[c4]]
- `high` Today a single provider is constructed once, run-wide, at the workflow preparation site and reused for every step of that run. [[c3]]
- `high` Exactly one role-based provider split already exists (the summariser), proving the pattern but leaving it un-generalised across roles. [[c2]]
- `high` Two additional sites hardcode the top-capability CLI provider directly, bypassing the run-wide resolution, so any role-aware routing must reach them too. [[c10]]
- `high` The models.analyze.* catalog is the established configuration surface these concerns attach to and can be extended without a new config domain. [[c5]]
- `high` A per-repository provider override already exists as a distinct precedence layer above global settings. [[c6]]
- `high` The legacy single-provider configuration key is left unset by the installer and, when unset, currently governs all reasoning. [[c7]]
- `med` No existing Epic covers provider or model resolution, cost, or capability differentiation, so this work is greenfield within the workflow domain. [[c8]]

## Constraints

| ID | Type | Text | Source |
| :--- | :--- | :--- | :--- |
| `k1` | invariant | Every model access — for any role or capability level — must resolve through the claude/codex CLI or local Ollama; no direct cloud REST provider may be introduced. | [[c9]] |
| `k2` | invariant | The accuracy-primary / cost-least-priority principle continues to govern the critical reasoning roles: they must retain a guaranteed minimum capability and cannot be silently reduced below it, even though peripheral roles may trade capability for cost and speed. | [[c9]] |
| `k3` | contract | The legacy single-provider configuration, including the unset-default path, must remain a working fallback at the lowest precedence. | [[c7]] |
| `k4` | contract | New configuration must extend the existing models.analyze.* contract rather than replace it. | [[c5]] |
| `k5` | contract | Per-repository overrides must continue to take precedence over the corresponding global settings. | [[c6]] |

## Stories

### E20260725820cc07b:S001 — Declare capability tiers and assign reasoning roles to them

**User value:** `size: M`

An operator can declare, globally and per repository, which model serves each capability tier and which tier each reasoning role belongs to, so peripheral work no longer has to consume the most capable model.

**Acceptance criteria:**

- **ac1:** Given an operator has assigned a peripheral role to the cheap tier and left every other role at its default, when a run executes that role, then the role is served by the cheap tier's configured model rather than the most capable one. _(operationalizes `k1`, `k4`)_
- **ac2:** Given both a per-repository override and a global override exist for the same role, when that role runs inside that repository, then the per-repository assignment determines the tier that serves it. _(operationalizes `k5`)_
- **ac3:** Given no tier or role configuration is present at all, when any reasoning operation runs, then the legacy single-provider selection — including its unset-default path — governs the operation unchanged. _(operationalizes `k3`)_
- **ac4:** Given existing analyze model configuration is already present, when tier and role configuration is added alongside it, then the pre-existing configuration keys continue to be honored rather than replaced. _(operationalizes `k4`)_

**Local constraints:**

- `c1` (stakeholder) There are exactly three capability tiers — core (most capable), mid, and cheap — and the cheap tier is served locally by default. [[c9]]
- `c2` (contract) Tier and role configuration is added to the existing analyze model configuration surface, not to a new configuration domain. [[c6]]

### E20260725820cc07b:S002 — Guarantee a minimum capability floor for critical roles

**User value:** `size: S`

Operators are assured that critical reasoning roles can never be silently served below a configured minimum capability, preserving accuracy-first for the work that genuinely needs it while still letting peripheral roles run cheaper.

**Depends on:** `s1`

**Acceptance criteria:**

- **ac1:** Given a critical role has been overridden to a model weaker than the configured minimum, when that role is resolved for a run, then it is served at no less than the minimum capability and the attempted downgrade does not silently take effect. _(operationalizes `k2`)_
- **ac2:** Given no minimum capability is explicitly configured, when a critical role resolves, then the built-in default minimum applies to it. _(operationalizes `k2`)_
- **ac3:** Given a peripheral (non-critical) role configured below the critical minimum, when that role resolves, then it is permitted to run at the lower capability. _(operationalizes `k2`)_

**Local constraints:**

- `c1` (invariant) A configured minimum capability applies to critical (core) roles; when none is configured, a built-in default minimum applies. [[c9]]

### E20260725820cc07b:S003 — Match every reasoning operation to the model its role warrants

**User value:** `size: L`

Every reasoning operation across the analyze, workflow, and tracker lifecycle is served by the model configured for its own role, instead of one provider chosen once for the whole run.

**Depends on:** `s1`, `s2`

**Extends:** [[c2]]

**Acceptance criteria:**

- **ac1:** Given a run that contains both critical and peripheral operations, when each operation executes, then each is served by the model configured for its own role rather than by a single run-wide choice. _(operationalizes `k1`, `k2`)_
- **ac2:** Given a resolved role at any tier, including the cheap tier, when it accesses a model, then the access flows through the local runtime or the claude/codex CLI and never through a direct cloud REST path. _(operationalizes `k1`)_
- **ac3:** Given a role for which no override is configured, when it resolves, then it falls to its tier default, then to the legacy single-provider setting, in that order of precedence. _(operationalizes `k3`, `k5`)_

### E20260725820cc07b:S004 — Record the actual model that produced each output

**User value:** `size: M`

Each produced artifact records which model actually generated each of its outputs, so operators can audit where capability was spent rather than seeing one model attributed to the entire run.

**Depends on:** `s3`

**Acceptance criteria:**

- **ac1:** Given a run whose steps are served by different models, when artifacts are produced, then each output carries the identity of the model that produced it. _(operationalizes `k4`)_
- **ac2:** Given the previous single per-run model attribution, when per-output attribution is applied, then the whole-run attribution is superseded by the per-output record. _(operationalizes `k4`)_

**Local constraints:**

- `c1` (contract) Each produced output records the model that generated it, superseding the single per-run model attribution. [[c9]]

### E20260725820cc07b:S005 — Apply role-aware routing at every reasoning site, including the hardcoded ones

**User value:** `size: L`

Operators get consistent tiering everywhere reasoning happens — issue and summary rendering, indexer summarisation, narrow context probes, and the sites that today always use the top model — with no operation bypassing role-aware routing.

**Depends on:** `s3`

**Extends:** [[c2]]

**Acceptance criteria:**

- **ac1:** Given the sites that today always use the most capable model directly, when they run after this change, then they obtain their model through role-aware routing like every other operation, with no direct bypass remaining. _(operationalizes `k1`, `k2`)_
- **ac2:** Given peripheral rendering, summarisation, and narrow-probe operations at their defaults, when they run, then they are served by the cheap tier's locally-served model. _(operationalizes `k1`)_

### E20260725820cc07b:S006 — Document tiering and formalize the accuracy principle

**User value:** `size: S`

Operators can learn how tiers, precedence, and the capability floor behave, and the project's accuracy-primary principle is formalized to state where it is enforced and where cost may be traded for capability.

**Depends on:** `s1`, `s2`, `s3`

**Acceptance criteria:**

- **ac1:** Given the documentation, when an operator reads it, then it describes the three capability tiers, the full resolution precedence order, and the critical-role capability floor. _(operationalizes `k3`)_
- **ac2:** Given the accuracy-primary / cost-least-priority principle, when it is documented, then it states that accuracy governs the critical roles — enforced by the floor — while peripheral roles may trade capability for cost and speed. _(operationalizes `k2`)_

## Citations

- **[[c1]]** `code` `src/analyze/context/shaper-provider.ts:183-241` — "buildShaperProvider(cfg, overrides?) — the single-provider-per-run builder"
- **[[c2]]** `code` `src/analyze/context/shaper-provider.ts:256-269` — "buildSummariserProvider(cfg) — the one existing role-based provider split"
- **[[c3]]** `code` `src/daemon/workflow-rpc.ts:319-344` — "prepareWorkflowRun builds ONE provider for the whole run"
- **[[c4]]** `code` `src/agent/providers/cli-provider.ts:88-345` — "CliProvider (claude/codex) already accepts a model option — the routing, not the mechanism, is new"
- **[[c5]]** `code` `src/cli/config-catalog.ts:52-62` — "models.analyze.* catalog the new keys extend"
- **[[c6]]** `code` `src/config/__tests__/repo-shaper-override.test.ts:34-82` — "existing byRepo[repoPath].shaperProvider precedence layer"
- **[[c7]]** `doc` `docs/installation.md:121 / docs/index.html:201` — "'Explicit shaperProvider → that provider is used for all reasoning'; the installer leaves the key unset"
- **[[c8]]** `prior-artifact` `epics-catalog: 185807ba9a6b35d3 / 1cd9a4c34f403a80 / 6d6cfaf9a9b14bd4 / 753e0ed64921d937` — "build stage, plan stage, progress streaming, deployment design — none cover provider/model resolution, cost, or tiering"
- **[[c9]]** `convention` `CLAUDE.md — Project principles` — "Accuracy is primary; cost is the least priority. No direct cloud REST calls from our process — cloud LLM access happens through the claude and codex CLI binaries."
- **[[c10]]** `code` `src/mcp/build-step/phases/validate.ts:45 / src/cli/services/workflow.ts:231` — "sites that hardcode new CliProvider({kind:'claude'}), bypassing run-wide resolution"

<!-- insrc:review -->

## Review

### ⛔ Review `BLOCK` — define (define)

**0 HIGH · 1 MED · 7 LOW** · model `client` · reviewed 2026-07-25T08:39:25.188Z

| Ref | Kind | Severity | Fixability | Premise | Evidence | Action |
| --- | --- | --- | --- | --- | --- | --- |
| c10 | citation | MED | auto | The build-step validate file the DEF cites as src/workflow/build-step/validate.ts actually exists at that path (vs src/mcp/build-step/phases/validate.ts). | The DEF cites the build-step hardcode at `src/workflow/build-step/validate.ts:45`, which is ABSENT on disk. The real path is `src/mcp/build-step/phases/validate.ts:45` (verified: `const provider: ValidateProvider = providerOverride ?? new CliProvider({ kind: 'claude' });`). The premise is sound (the site exists and must be rewired); only the citation path is stale. | Correct the c10 citation path from src/workflow/build-step/validate.ts:45 to src/mcp/build-step/phases/validate.ts:45. The other site (cli/services/workflow.ts:231) is correct. S005's scope is unchanged. |
| c1 | citation | LOW | manual | buildShaperProvider — the single-provider-per-run builder — is defined in src/analyze/context/shaper-provider.ts (cited ~line 183). | shaper-provider.ts:183 `export function buildShaperProvider` — the single-provider builder exists at the cited line (DEF cited 183-241). Confirmed. | none — verified sound |
| c2 | citation | LOW | manual | buildSummariserProvider — the one existing role-based provider split — is defined in src/analyze/context/shaper-provider.ts (cited ~line 256). | shaper-provider.ts:256 `export function buildSummariserProvider` — the one existing role-based split, at the cited line (DEF cited 256-269). Confirmed. | none — verified sound |
| c3 | citation | LOW | manual | The workflow runner (src/daemon/workflow-rpc.ts) builds ONE buildShaperProvider(cfg) for the whole run. | workflow-rpc.ts:341 `const provider = buildShaperProvider(cfg, { repoOverride, clientDefault, ... })` — ONE provider built for the whole run, within the DEF's cited :319-344 region. Confirmed. | none — verified sound |
| c4 | citation | LOW | manual | CliProvider (claude/codex) already accepts a model option, so per-role model differentiation needs routing, not a new mechanism. | cli-provider.ts:88 `export class CliProvider implements LLMProvider` — the wrapper that already accepts a model option. Confirmed; the routing is what's new. | none — verified sound |
| c5 | citation | LOW | manual | The models.analyze.* configuration catalog the new tier/role keys extend lives in src/cli/config-catalog.ts. | src/cli/config-catalog.ts references `models.analyze.*` (the config catalog the new tier/role keys extend). Confirmed the surface exists. | none — verified sound |
| c6 | citation | LOW | manual | An existing byRepo[repoPath] shaperProvider precedence layer is covered by src/config/__tests__/repo-shaper-override.test.ts. | repo-shaper-override.test.ts:34 `resolveRepoShaperProvider returns the pinned kind for a byRepo entry` + :36 `models.analyze.byRepo[REPO].shaperProvider` — the per-repo precedence layer is real. Confirmed. | none — verified sound |
| c10 | citation | LOW | manual | Two sites hardcode `new CliProvider({ kind: 'claude' })`, bypassing run-wide resolution; the DEF cites them at src/workflow/build-step/validate.ts:45 and src/cli/services/workflow.ts:231. | Both hardcoded sites are real: `new CliProvider({ kind: 'claude' })` at src/mcp/build-step/phases/validate.ts:45 and src/cli/services/workflow.ts:231. The premise (two sites bypass run-wide resolution, S005 must rewire them) holds. | none for the premise — but the FIRST site's cited PATH is wrong (see c11). |

#### Proposed fixes

- **c10** (auto) — Evidence-derived path correction: the cited file does not exist; the real hardcode is at src/mcp/build-step/phases/validate.ts:45.
  - edit: `src/workflow/build-step/validate.ts:45 / src/cli/services/workflow.ts:231` → `src/mcp/build-step/phases/validate.ts:45 / src/cli/services/workflow.ts:231`
