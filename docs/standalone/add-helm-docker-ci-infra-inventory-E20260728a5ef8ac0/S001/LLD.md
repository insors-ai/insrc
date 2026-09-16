<!-- insrc:artifact LLD-a5ef8ac073911ace-S001 -->

# LLD: S001

**Epic:** `add-helm-docker-ci-infra-inventory`
**HLD base run:** `wf-1785251327637-a34n3k`
**HLD effective hash:** `a5ef8ac07391...`

## HLD context

**Framework:** Standalone feature — no parent HLD. Design directly against the repo, grounded on the s1 analyze passes. There are no HLD shared contracts to honour.
**Rollout phase:** standalone

## Contract details

**Surface level:** internal

### `infraInventoryHelmRuntime`

```typescript
const infraInventoryHelmRuntime: TemplateRuntime = { templateId: 'infra.inventory.helm'; execute(args: TemplateExecuteArgs): Promise<TemplateExecuteResult> }
```

**Parameters:**
- `args: TemplateExecuteArgs` — Executor-supplied args carrying task.params.scopeRef, runId, task.taskId (same shape inventory-terraform.execute receives).

**Returns:** `Promise<TemplateExecuteResult>` — Resolves to { outputs: Map(['helm-inventory', HelmInventory]) }. HelmInventory enumerates each Chart.yaml (name/version/appVersion/type/dependencies), its sibling templates/*.yaml count, and values.yaml top-level keys.

**Errors:**
- `Error` when scopeRef missing/wrong-shape (readScopeRef) or unsupported scopeRef.kind (resolveRepoPath) — same throw contract as inventory-terraform.

**Preconditions:**
- args.task.params.scopeRef present with kind ∈ {repo, manifest-dir, workspace}.

**Postconditions:**
- Deterministic: all lists sorted; per-Chart records ordered by path.
- A per-file YAML parse failure is swallowed (log.debug + continue), never thrown — a malformed Chart.yaml/values.yaml drops that file, not the run.
- walkFiles truncation is surfaced via a `truncated` flag in the output.

### `infraInventoryDockerRuntime`

```typescript
const infraInventoryDockerRuntime: TemplateRuntime = { templateId: 'infra.inventory.docker'; execute(args: TemplateExecuteArgs): Promise<TemplateExecuteResult> }
```

**Parameters:**
- `args: TemplateExecuteArgs` — Executor-supplied args (scopeRef/runId/taskId).

**Returns:** `Promise<TemplateExecuteResult>` — Resolves to { outputs: Map(['docker-inventory', DockerInventory]) } where DockerInventory = { dockerfiles: DockerfileRecord[], composeFiles: ComposeRecord[], truncated }. Dockerfiles regex-parsed (FROM image+stage aliases, EXPOSE ports); compose files js-yaml-parsed (services, per-service image + ports).

**Errors:**
- `Error` when scopeRef missing/wrong-shape or unsupported kind (same _shared throw contract).

**Preconditions:**
- args.task.params.scopeRef present with a supported kind.

**Postconditions:**
- Deterministic + sorted.
- Dockerfile parse is regex (not YAML); compose YAML parse failure is swallowed per-file (log.debug + continue).
- truncated flag surfaced.

### `infraInventoryCiRuntime`

```typescript
const infraInventoryCiRuntime: TemplateRuntime = { templateId: 'infra.inventory.ci'; execute(args: TemplateExecuteArgs): Promise<TemplateExecuteResult> }
```

**Parameters:**
- `args: TemplateExecuteArgs` — Executor-supplied args (scopeRef/runId/taskId).

**Returns:** `Promise<TemplateExecuteResult>` — Resolves to { outputs: Map(['ci-inventory', CiInventory]) } where CiInventory = { githubWorkflows: GhaWorkflowRecord[], gitlabCi: GitlabCiRecord[], truncated }. GHA workflows (under .github/workflows) js-yaml-parsed for name/triggers(on)/job ids/step `uses` actions; .gitlab-ci.yml parsed for stages + job ids.

**Errors:**
- `Error` when scopeRef missing/wrong-shape or unsupported kind (same _shared throw contract).

**Preconditions:**
- args.task.params.scopeRef present with a supported kind.

**Postconditions:**
- Deterministic + sorted.
- Per-file YAML parse failure swallowed (log.debug + continue).
- truncated flag surfaced.

### `registerInfraTemplates`

```typescript
function registerInfraTemplates(): void
```

**Returns:** `void` — Existing fn; now iterates the extended INFRA_TEMPLATES (adds infraInventoryHelm/Docker/Ci descriptors) and registers each via registerTemplate. Signature unchanged.

**Preconditions:**
- Called at runtime bootstrap (unchanged call site).

**Postconditions:**
- The three new templates are registered; each template.produces[0] === its runtime's output-Map key.

## Data model changes

### `HelmInventory (output of infra.inventory.helm)` — new

`{ charts: Array<{ path; name?; version?; appVersion?; type?; dependencies: Array<{name; version?; repository?}>; templateFileCount; valuesKeys: string[] }>; truncated: boolean }`. path = relPath of the Chart.yaml; templateFileCount = count of *.yaml under the chart's sibling templates/ dir; valuesKeys = top-level keys of the adjacent values.yaml.

```
+ interface HelmInventory { charts: HelmChartRecord[]; truncated: boolean }
```

**Call sites:**
- `src/analyze/runtimes/infra/inventory-helm.ts`

### `DockerInventory (output of infra.inventory.docker)` — new

`{ dockerfiles: Array<{ path; froms: Array<{image; stage?}>; exposedPorts: string[] }>; composeFiles: Array<{ path; services: Array<{name; image?; ports: string[]}> }>; truncated: boolean }`.

```
+ interface DockerInventory { dockerfiles: DockerfileRecord[]; composeFiles: ComposeRecord[]; truncated: boolean }
```

**Call sites:**
- `src/analyze/runtimes/infra/inventory-docker.ts`

### `CiInventory (output of infra.inventory.ci)` — new

`{ githubWorkflows: Array<{ path; name?; triggers: string[]; jobs: Array<{id; stepUses: string[]}> }>; gitlabCi: Array<{ path; stages: string[]; jobs: string[] }>; truncated: boolean }`.

```
+ interface CiInventory { githubWorkflows: GhaWorkflowRecord[]; gitlabCi: GitlabCiRecord[]; truncated: boolean }
```

**Call sites:**
- `src/analyze/runtimes/infra/inventory-ci.ts`

### `INFRA_RUNTIMES (src/analyze/runtimes/infra/index.ts)` — field-add

Append the 3 new runtimes to INFRA_RUNTIMES (5 → 8) + re-export lines.

```
INFRA_RUNTIMES: [...existing(5), helm, docker, ci]  // 8
```

**Call sites:**
- `src/analyze/runtimes/infra/index.ts`

### `INFRA_TEMPLATES + registerInfraTemplates (src/analyze/planner/templates/infra/index.ts)` — field-add

Add 3 AnalyzeTaskTemplate descriptors with matching produces-keys.

```
INFRA_TEMPLATES: [...existing(5), infraInventoryHelm, infraInventoryDocker, infraInventoryCi]  // 8
```

**Call sites:**
- `src/analyze/planner/templates/infra/index.ts`

### `infra.discovery.families.description (overpromise fix)` — field-modify

Trim ansible/pulumi/cloudformation from the description so it matches classifyFile reality.

```
- '...docker-compose, ansible, pulumi, cloudformation).'
+ '...docker-compose, dockerfile).'
```

**Call sites:**
- `src/analyze/planner/templates/infra/index.ts`

## Error paths

### Error cases

- **A Chart.yaml / values.yaml / compose file / workflow yaml is malformed and js-yaml throws.** (recoverable)
  - Detection: The per-file `load`/`loadAll` call is wrapped in try/catch (mirroring inventory-kubernetes.ts).
  - Response: log.debug('<runtime>: YAML parse failed -- skipping', {file}) and `continue` to the next file; the malformed file is omitted from the inventory, the run proceeds.
  - User impact: That one file is missing from the report; all sibling files still inventoried. No crash.
- **A matched file is unreadable (permissions / removed mid-walk).** (recoverable)
  - Detection: readFile rejects inside the try/catch.
  - Response: log.debug + continue (same as inventory-terraform's read-failure arm).
  - User impact: File dropped from inventory; run continues.
- **task.params.scopeRef is missing or has a non-string kind/value, or an unsupported kind (e.g. 'entity').** (recoverable)
  - Detection: readScopeRef throws on missing/wrong-shape; resolveRepoPath throws on an unsupported kind (default arm).
  - Response: The runtime rejects with the shared _shared.ts Error; the executor records the task as failed (same contract as every existing infra runtime).
  - User impact: That inventory task fails with a clear message; other tasks in the plan are unaffected.
- **A compose/workflow YAML parses but is not the expected shape (e.g. top-level is a string or array, or `services`/`jobs` is absent).** (recoverable)
  - Detection: After parse, the runtime type-guards the doc (typeof === 'object' && not null) and each expected sub-key before reading it.
  - Response: Non-conforming docs yield an empty sub-list for that file (e.g. services: []) rather than throwing; the file still appears in the summary.
  - User impact: The file is listed with zero extracted records instead of crashing the parse.

### Edge cases

| Input | Expected |
| :--- | :--- |
| Multi-stage Dockerfile: `FROM node:20 AS build` then `FROM nginx AS runtime`. | froms captures both {image:'node:20', stage:'build'} and {image:'nginx', stage:'runtime'} in order. |
| docker-compose service defined with `build:` and no `image:`. | The service is recorded with image undefined (omitted) + its ports; not dropped. |
| GitHub Actions `on:` expressed as a bare string ('push'), an array (['push','pull_request']), or a map ({push:{branches:[...]}}). | triggers normalizes all three to a sorted string[] of trigger names (['pull_request','push'] etc.). |
| .gitlab-ci.yml with reserved top-level keys (stages, variables, default, include) alongside job definitions. | stages read from the `stages` key; jobs = the remaining top-level object keys with reserved keys excluded. |
| A Helm chart with no `dependencies:` and no adjacent values.yaml. | dependencies: [], valuesKeys: [], templateFileCount from templates/ if present (else 0); the chart is still listed with its name/version. |
| Scope contains none of a family's files (e.g. no Dockerfiles). | The runtime returns an empty-but-well-formed inventory ({dockerfiles:[],composeFiles:[],truncated:false}); it does not error. |
| walkFiles hits the 5000-file DEFAULT_FILE_CAP. | truncated:true is surfaced in the output (and logged), matching inventory-terraform's behavior; inventory is partial but valid. |

### Invariants to preserve

- A template's `produces[0]` MUST equal its runtime's single output-Map key ('helm-inventory'/'docker-inventory'/'ci-inventory'), and every INFRA_TEMPLATES entry MUST have a matching INFRA_RUNTIMES entry (the planner validator requires template↔runtime parity). Cited s1 bundle: 'The two registration surfaces'. [[c5]]
- Each runtime's output is DETERMINISTIC: all lists sorted (by path, then stable secondary keys), so repeated runs over the same scope produce byte-identical output. Cited s1 bundle: 'The inventory-runtime pattern to mirror' (inventory-terraform sorts every list). [[c1]]
- A per-file parse/read failure is swallowed (log.debug + continue) and NEVER thrown — one bad file must not fail the whole inventory run. Cited s1 bundle: 'YAML parsing precedent' (inventory-kubernetes try/catch + continue). [[c2]]
- The new runtimes reuse readScopeRef/resolveRepoPath/walkFiles VERBATIM — no change to _shared.ts, no new supported scopeRef kind, no new file-walk behavior. Cited s1 bundle: 'Shared helpers (_shared.ts)'. [[c3]]
- The generic aggregate-report runtime is UNTOUCHED; new produces-keys flow into the report via runAggregator's generic consumption. Cited s1 bundle: 'Generic aggregator confirms no downstream change'. [[c7]]

## Test strategy

**Test framework:** `node:test (tsx --test) with tmp-filesystem fixtures + registerBuiltinRuntimes/getRuntime, matching src/analyze/runtimes/infra/__tests__/infra-runtimes.test.ts`

### Test levels

- **integration** — Exercise each new runtime's execute() against a tmp filesystem fixture and assert the produced output Map shape, mirroring the existing infra-runtimes.test.ts fixture pattern (no LMDB/Ollama).
  - Subjects: `infraInventoryHelmRuntime.execute over a Chart.yaml + templates/*.yaml + values.yaml fixture → helm-inventory (name/version/deps/templateFileCount/valuesKeys)`, `infraInventoryDockerRuntime.execute over a multi-stage Dockerfile + docker-compose.yaml fixture → docker-inventory (froms/stages/exposedPorts + services/images/ports)`, `infraInventoryCiRuntime.execute over a .github/workflows/ci.yml + .gitlab-ci.yml fixture → ci-inventory (triggers/jobs/stepUses + stages/jobs)`
  - Fixtures: `tmpdir tree via mkdtempSync/mkdirSync/writeFileSync (Chart.yaml+templates+values, Dockerfile+compose, GHA workflow+.gitlab-ci.yml), rm in teardown`
- **unit** — Prove the deterministic parse/normalize edge behaviors + the registration invariants in isolation.
  - Subjects: `GHA `on` normalization across string / array / map forms → sorted trigger names`, `GitLab reserved-key exclusion (stages/variables/default/include not counted as jobs)`, `Dockerfile multi-stage FROM + EXPOSE regex extraction; compose service with build-and-no-image`, `registration parity: all 3 templates register + each template.produces[0] === the runtime output-Map key; INFRA_RUNTIMES + INFRA_TEMPLATES both length 8`, `the trimmed infra.discovery.families description no longer mentions ansible/pulumi/cloudformation`

### Acceptance mapping

| Criterion | Proving tests |
| :--- | :--- |
| `ac1` | `integration: helm runtime over a fixture chart yields a helm-inventory with the chart's name/version/appVersion/dependencies, templateFileCount, and values top-level keys` |
| `ac2` | `integration: docker runtime over a multi-stage Dockerfile + compose yields docker-inventory with both FROM stages, EXPOSE ports, and compose services/images/ports`, `unit: multi-stage FROM ... AS <stage> + build-only compose service edge cases` |
| `ac3` | `integration: ci runtime over a GHA workflow + .gitlab-ci.yml yields ci-inventory with triggers/jobs/stepUses and gitlab stages/jobs`, `unit: `on` normalization (string/array/map) + gitlab reserved-key exclusion` |
| `ac4` | `unit: each of the 3 new templates registers, template.produces[0] === runtime output key, INFRA_RUNTIMES.length === INFRA_TEMPLATES.length === 8` |
| `ac5` | `integration: a malformed YAML fixture file is skipped (not thrown) and siblings still inventoried (parse-failure-swallowed invariant)`, `integration: an empty scope yields a well-formed empty inventory, not an error` |
| `ac6` | `unit: the infra.discovery.families description string no longer contains 'ansible'/'pulumi'/'cloudformation'` |

## Migration

**State before:** The infra runtime catalog has 5 runtimes (s1 'The two registration surfaces'): discovery-families, inventory-kubernetes, inventory-terraform, adherence-check, aggregate-report. Only Kubernetes + Terraform have deep inventory runtimes; discovery-families.ts already DETECTS helm/dockerfile/docker-compose/github-actions/gitlab-ci (s1 'Family detection') but those families dead-end — no inventory runtime consumes them. The infra.discovery.families template description (index.ts:29) advertises ansible/pulumi/cloudformation, which classifyFile does not implement.

**State after:** 8 infra runtimes: the 3 new inventory runtimes (helm/docker/ci) sit alongside k8s/terraform, each producing one deterministic inventory output ('helm-inventory'/'docker-inventory'/'ci-inventory') consumed generically by the untouched aggregate-report. All 5 advertised families now have per-resource inventory. The discovery-families description lists only families it actually detects.

**Zero downtime:** yes — **Data rewrite:** no

### Steps

1. Add three new runtime files (inventory-helm.ts, inventory-docker.ts, inventory-ci.ts), each an infraInventory<Family>Runtime mirroring inventory-terraform.ts (readScopeRef → resolveRepoPath → walkFiles → filter → parse via js-yaml/regex → sorted deterministic output → one produces-key). Purely additive; no existing file changes yet. — ↩ rollbackable
2. Add three AnalyzeTaskTemplate descriptors to INFRA_TEMPLATES (planner/templates/infra/index.ts) with matching produces-keys; registerInfraTemplates picks them up via its existing loop. Additive. — ↩ rollbackable
3. Append the three runtimes (+ their re-export lines) to INFRA_RUNTIMES (runtimes/infra/index.ts); registerBuiltinRuntimes registers them at bootstrap. This is the step that makes template↔runtime parity hold (all 8:8); apply it in the same commit as step 2 so the planner validator never sees a template without a runtime. — ↩ rollbackable
4. Trim ansible/pulumi/cloudformation from the infra.discovery.families description string (index.ts:29). Pure text; no behavior change. — ↩ rollbackable
5. Extend infra-runtimes.test.ts (or a sibling test file) with tmp-filesystem fixtures + assertions for the 3 new runtimes + the registration-parity + description-trim checks. Test-only. — ↩ rollbackable

**Backward compat:** Fully backward compatible — purely additive to the runtime + template catalogs. No existing runtime, template, the shared TemplateRuntime contract, the aggregate-report, or _shared.ts changes. The one existing-symbol touch is a DESCRIPTION string on infra.discovery.families (planner-facing prose, not an API/behavior) and registerInfraTemplates keeps its exact signature. Existing infra plans/tests continue to pass unchanged; new families simply become selectable by the planner when their files are present in scope.

## Alternatives considered

### a1: Three family-grouped runtimes (helm / docker / ci) — **CHOSEN**

One new TemplateRuntime per FAMILY — infra.inventory.helm, infra.inventory.docker, infra.inventory.ci — each producing a single output key, exactly mirroring inventory-terraform/kubernetes.



### a2: Five source-granular runtimes (one per discovery label)

One runtime per discovery source label: helm, dockerfile, docker-compose, github-actions, gitlab-ci — each single-kind.



**Rejected because:** Violates family-vocabulary-alignment (splits 'docker' and 'CI' into 4 source labels that don't match the advertised 5-family vocabulary the synthesizer speaks) and only partially meets blast-radius/planner-compat — ~66% more registry churn + two planner tasks per docker/CI question for the same result.

### a3: One generic multi-family inventory runtime

A single new runtime parameterized by a `family` param that dispatches to the right parser internally, with one template that takes the family as input.



**Rejected because:** Violates convention-fidelity + planner-validator-compat: a parameterised family + dynamic produces-key break the strict one-template-one-runtime-one-static-key convention all existing infra runtimes follow, complicate the generic aggregator's key consumption, and add planner param coupling the other runtimes don't require.

## Citations

- **[[c1]]** `analyze-bundle` `s1 usage.example — inventory-terraform.ts (the pattern to mirror)` — "readScopeRef → resolveRepoPath → walkFiles → filter → readFile in try/catch → sorted deterministic lists → return { outputs: new Map([['tf-inventory', inventory]]) }."
- **[[c2]]** `analyze-bundle` `s1 usage.example — inventory-kubernetes.ts (js-yaml precedent)` — "import { loadAll } from 'js-yaml' (^4.1.0 already a dep); parse per-file in try/catch, log.debug 'YAML parse failed -- skipping' + continue."
- **[[c3]]** `analyze-bundle` `s1 symbol.locate — _shared.ts helpers` — "readScopeRef, resolveRepoPath (kinds repo|manifest-dir|workspace), walkFiles(root, cap=5000) → {files, truncated}; skips SKIP_DIRS; WalkedFile = {absPath, relPath}."
- **[[c4]]** `analyze-bundle` `s1 search.text — discovery-families.ts detection patterns` — "classifyFile detects helm (Chart.yaml), dockerfile, docker-compose, github-actions (.github/workflows/), gitlab-ci (.gitlab-ci.yml) — the same patterns the new inventories filter by."
- **[[c5]]** `analyze-bundle` `s1 symbol.locate — the two registration surfaces (INFRA_RUNTIMES + INFRA_TEMPLATES)` — "INFRA_RUNTIMES (runtimes/infra/index.ts, 5 entries) + INFRA_TEMPLATES/registerInfraTemplates (planner/templates/infra/index.ts); a template's produces key must match the runtime's output Map key; over"
- **[[c6]]** `analyze-bundle` `s1 test.locate — infra-runtimes.test.ts harness` — "node:test + tmp fixtures (mkdtempSync/writeFileSync) + registerBuiltinRuntimes/_resetRuntimeBootstrapLatchForTests + getRuntime; builds a fixture tree and asserts each runtime's output Map."
- **[[c7]]** `analyze-bundle` `s1 usage.example — aggregate-report.ts generic consumption` — "infraAggregateReportRuntime delegates to runAggregator which consumes ALL upstream outputs generically — new produces-keys require no aggregator edit."

<!-- insrc:review -->

## Review

### ✅ Review `PASS` — design.story (design.story)

**0 HIGH · 0 MED · 9 LOW** · model `client` · reviewed 2026-07-28T15:21:23.074Z

| Ref | Kind | Severity | Fixability | Premise | Evidence | Action |
| --- | --- | --- | --- | --- | --- | --- |
| cl1 | citation | LOW | manual | src/analyze/runtimes/infra/inventory-terraform.ts is the pattern to mirror: an exported infraInventoryTerraformRuntime: TemplateRuntime with templateId 'infra.inventory.terraform' whose execute uses readScopeRef/resolveRepoPath/walkFiles and returns outputs Map(['tf-inventory', ...]). | inventory-terraform.ts:86 `export const infraInventoryTerraformRuntime: TemplateRuntime`, :90 readScopeRef, :93 walkFiles, :218 `outputs: new Map([['tf-inventory', inventory]])`; TEMPLATE_ID = 'infra.inventory.terraform' at :56. The pattern to mirror is exactly as described. | none — verified sound |
| cl2 | citation | LOW | manual | src/analyze/runtimes/infra/inventory-kubernetes.ts imports loadAll from js-yaml and parses per-file inside a try/catch that log.debug's and continues on failure. | inventory-kubernetes.ts:29 `import { loadAll } from 'js-yaml'`, :84 `docs = loadAll(text)`, :88 'inventory.kubernetes: YAML parse failed -- skipping' (try/catch + continue). The js-yaml precedent holds. | none — verified sound |
| cl3 | citation | LOW | manual | src/analyze/runtimes/infra/_shared.ts exports readScopeRef, resolveRepoPath (supporting kinds repo\|manifest-dir\|workspace, throwing otherwise), and walkFiles(root, cap=DEFAULT_FILE_CAP) returning {files, truncated}. | _shared.ts:28 readScopeRef, :47 resolveRepoPath, :50 case 'manifest-dir', :56 'Supported: repo, manifest-dir, workspace', :90 `DEFAULT_FILE_CAP = 5000`, :106 walkFiles. All shared helpers + kinds + cap confirmed. | none — verified sound |
| cl4 | citation | LOW | manual | src/analyze/runtimes/infra/discovery-families.ts classifyFile already detects helm (Chart.yaml), dockerfile, docker-compose, github-actions (.github/workflows/), and gitlab-ci (.gitlab-ci.yml) — the same patterns the new inventory runtimes reuse. | discovery-families.ts:129 HELM_CHART_RE, :126 DOCKERFILE_RE, :127 COMPOSE_RE, :157 '.github/workflows/' github-actions push, :128 GITLAB_CI_RE. All five family patterns the new inventories reuse are present. | none — verified sound |
| cl5 | inventory | LOW | manual | INFRA_RUNTIMES in src/analyze/runtimes/infra/index.ts currently lists exactly 5 runtimes (discovery, inv-k8s, inv-tf, adherence, aggregate); the new work makes it 8. | runtimes/infra/index.ts:32 INFRA_RUNTIMES with exactly 5 members (:33-37: discovery, inv-k8s, inv-tf, adherence, aggregate), each resolving to its own `export const ...: TemplateRuntime`. The 5→8 baseline is correct. | none — verified sound |
| cl6 | inventory | LOW | manual | src/analyze/planner/templates/infra/index.ts currently declares INFRA_TEMPLATES with 5 templates + registerInfraTemplates, and the infra.discovery.families description string advertises ansible/pulumi/cloudformation (the overpromise to trim). | planner/templates/infra/index.ts:142 INFRA_TEMPLATES, :150 registerInfraTemplates, :29 the 'ansible, pulumi, cloudformation' overpromise, :42/:60 the existing kubernetes/terraform template ids. The registration surface + the exact overpromise to trim are confirmed. | none — verified sound |
| cl7 | semantic | LOW | manual | src/analyze/runtimes/infra/aggregate-report.ts (infraAggregateReportRuntime) delegates to a shared runAggregator that consumes upstream outputs generically, so new produces-keys need no aggregator edit. | aggregate-report.ts:25 infraAggregateReportRuntime, :29 `await runAggregator({...})`; runAggregator is a shared base (runtimes/shared/aggregator.ts:71) all five families delegate to. Generic consumption — no aggregator edit needed for new produces-keys. | none — verified sound |
| cl8 | citation | LOW | manual | src/analyze/runtimes/infra/__tests__/infra-runtimes.test.ts uses node:test + tmp filesystem fixtures and imports registerBuiltinRuntimes/_resetRuntimeBootstrapLatchForTests from ../../bootstrap.js and getRuntime from ../../../executor/registry.js. | infra-runtimes.test.ts:42-46 imports _resetRuntimeBootstrapLatchForTests/registerBuiltinRuntimes (bootstrap.ts) + getRuntime (executor/registry.ts), :277 mkdtempSync fixture root. The tmp-fixture harness to extend is exactly as cited. | none — verified sound |
| cl9 | external-contract | LOW | manual | js-yaml is already a project dependency (^4.1.0), so the new Helm/CI/compose YAML parsing needs no new dependency. | package.json:52 `"js-yaml": "^4.1.0"` (+ package-lock.json:43). js-yaml is already a dependency; Helm/CI/compose YAML parsing needs no new dep. | none — verified sound |
