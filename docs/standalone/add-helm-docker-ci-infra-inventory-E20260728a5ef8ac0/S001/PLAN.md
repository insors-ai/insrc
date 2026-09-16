<!-- insrc:artifact PLAN-a5ef8ac073911ace-S001 -->

# Plan: S001

**Epic:** `add-helm-docker-ci-infra-inventory`
**LLD run:** `wf-1785251327637-a34n3k`
**LLD effective hash:** `a5ef8ac07391...`

## Tasks

| # | Task | Size | Depends on | Tests | Derived from |
| :--- | :--- | :--- | :--- | :--- | :--- |
| 1 | **`t1`** inventory-helm.ts runtime | M | — | integration: helm runtime over a Chart.yaml + templates/*.yaml + values.yaml fixture yields helm-inventory with name/version/appVersion/dependencies + templateFileCount + valuesKeys; integration: a helm chart with no dependencies + no values.yaml is still listed (deps:[], valuesKeys:[], templateFileCount from templates/) | [[c1]] [[c2]] [[c3]] |
| 2 | **`t2`** inventory-docker.ts runtime | M | — | integration: docker runtime over a multi-stage Dockerfile + docker-compose.yaml yields docker-inventory (froms/stages/exposedPorts + services/images/ports); unit: Dockerfile multi-stage FROM ... AS <stage> + EXPOSE regex extraction; compose service with build-and-no-image keeps image undefined | [[c1]] [[c2]] [[c3]] |
| 3 | **`t3`** inventory-ci.ts runtime | M | — | integration: ci runtime over a .github/workflows/ci.yml + .gitlab-ci.yml yields ci-inventory (triggers/jobs/stepUses + stages/jobs); unit: GHA `on` normalization across string/array/map to sorted trigger names + GitLab reserved-key exclusion (stages/variables/default/include not counted as jobs) | [[c1]] [[c2]] [[c3]] [[c4]] |
| 4 | **`t4`** Register the 3 runtimes + templates + trim discovery overpromise | S | `t1`, `t2`, `t3` | unit: registration parity: all 3 templates register, each template.produces[0] === the runtime output-Map key, INFRA_RUNTIMES.length === INFRA_TEMPLATES.length === 8; unit: the trimmed infra.discovery.families description no longer mentions ansible/pulumi/cloudformation | [[c5]] [[c6]] |
| 5 | **`t5`** Tests: per-family fixtures + registration + edge cases | M | `t4` | integration: a malformed YAML fixture file is skipped (not thrown) and siblings still inventoried; an empty scope yields a well-formed empty inventory (not an error); unit: the assembled infra test file wires all new cases into the existing infra-runtimes.test.ts harness (registerBuiltinRuntimes/getRuntime) and the full sweep is green | [[c6]] [[c1]] |

### `t1` — inventory-helm.ts runtime

Create src/analyze/runtimes/infra/inventory-helm.ts: `infraInventoryHelmRuntime: TemplateRuntime` (templateId 'infra.inventory.helm') mirroring inventory-terraform.ts. execute() reuses readScopeRef/resolveRepoPath/walkFiles, filters Chart.yaml (HELM_CHART_RE), and for each chart parses name/version/appVersion/type/dependencies via js-yaml `load`, counts sibling templates/*.yaml, and reads adjacent values.yaml top-level keys — returns { outputs: Map(['helm-inventory', HelmInventory]) }. Sorted deterministic; per-file YAML parse failure swallowed (log.debug+continue); truncated flag surfaced.

**Acceptance checks:**
- inventory-helm.ts exports infraInventoryHelmRuntime with templateId 'infra.inventory.helm' and output key 'helm-inventory'
- each Chart.yaml yields name/version/appVersion/type/dependencies + templateFileCount + valuesKeys; lists sorted
- malformed Chart/values YAML is skipped (not thrown); truncated surfaced
- tsc passes

### `t2` — inventory-docker.ts runtime

Create src/analyze/runtimes/infra/inventory-docker.ts: `infraInventoryDockerRuntime` (templateId 'infra.inventory.docker'). Filters Dockerfiles (DOCKERFILE_RE) — regex-extract FROM image + optional `AS <stage>` + EXPOSE ports — and compose files (COMPOSE_RE) — js-yaml parse services→name/image/ports. Returns { outputs: Map(['docker-inventory', DockerInventory]) } = {dockerfiles[], composeFiles[], truncated}. Deterministic/sorted; compose YAML parse failure swallowed; non-conforming compose shape yields empty services list, not a throw.

**Acceptance checks:**
- inventory-docker.ts exports infraInventoryDockerRuntime with templateId 'infra.inventory.docker' and output key 'docker-inventory'
- multi-stage Dockerfile FROM+stage + EXPOSE ports extracted; compose service with build-and-no-image kept (image undefined)
- deterministic/sorted; parse failures swallowed
- tsc passes

### `t3` — inventory-ci.ts runtime

Create src/analyze/runtimes/infra/inventory-ci.ts: `infraInventoryCiRuntime` (templateId 'infra.inventory.ci'). Filters .github/workflows/*.yml (js-yaml parse name + normalized `on` triggers [string/array/map → sorted string[]] + job ids + step `uses`) and .gitlab-ci.yml (GITLAB_CI_RE; parse stages + job ids excluding reserved keys stages/variables/default/include). Returns { outputs: Map(['ci-inventory', CiInventory]) } = {githubWorkflows[], gitlabCi[], truncated}. Deterministic/sorted; per-file YAML parse failure swallowed.

**Acceptance checks:**
- inventory-ci.ts exports infraInventoryCiRuntime with templateId 'infra.inventory.ci' and output key 'ci-inventory'
- GHA `on` normalizes across string/array/map to sorted trigger names; job ids + step uses captured; GitLab reserved keys excluded from jobs
- deterministic/sorted; parse failures swallowed
- tsc passes

### `t4` — Register the 3 runtimes + templates + trim discovery overpromise

Wire everything: append infraInventoryHelm/Docker/Ci Runtime (+ re-export lines) to INFRA_RUNTIMES in src/analyze/runtimes/infra/index.ts (5→8); add 3 AnalyzeTaskTemplate descriptors (id 'infra.inventory.<family>', target 'infra', family 'inventory', kind 'leaf', revision 'r1', inputSchema {scopeRef: SCOPE_REF_SCHEMA}, produces ['<family>-inventory']) to INFRA_TEMPLATES in src/analyze/planner/templates/infra/index.ts (5→8); and trim ansible/pulumi/cloudformation from the infra.discovery.families description (index.ts:29). Land as one unit so template↔runtime parity never breaks.

**Acceptance checks:**
- INFRA_RUNTIMES and INFRA_TEMPLATES both length 8; each new template.produces[0] === its runtime output-Map key
- the infra.discovery.families description no longer mentions ansible/pulumi/cloudformation
- registerBuiltinRuntimes + registerInfraTemplates register all 3 with no validator error
- tsc + build pass

### `t5` — Tests: per-family fixtures + registration + edge cases

Extend src/analyze/runtimes/infra/__tests__/infra-runtimes.test.ts (or a sibling): tmp-fixture integration tests for each new runtime (Chart.yaml+templates+values; multi-stage Dockerfile+compose; GHA workflow+.gitlab-ci.yml) asserting output shapes; unit tests for GHA `on` normalization, GitLab reserved-key exclusion, Dockerfile multi-stage/build-only edge cases; registration-parity (INFRA_RUNTIMES/INFRA_TEMPLATES both 8 + produces-key match); description-trim assertion; parse-failure-swallowed + empty-scope cases.

**Acceptance checks:**
- integration tests cover helm/docker/ci output shapes over tmp fixtures
- unit tests cover on-normalization, gitlab reserved-key exclusion, dockerfile edges, registration parity, description trim, parse-failure-swallowed, empty scope
- full infra + analyze test sweep passes; tsc + build clean

## Test-strategy coverage

| LLD strategy item | Covered by |
| :--- | :--- |
| infraInventoryHelmRuntime.execute over a Chart.yaml + templates/*.yaml + values.yaml fixture → helm-inventory (name/version/deps/templateFileCount/valuesKeys) | `t1`, `t5` |
| infraInventoryDockerRuntime.execute over a multi-stage Dockerfile + docker-compose.yaml fixture → docker-inventory (froms/stages/exposedPorts + services/images/ports) | `t2`, `t5` |
| infraInventoryCiRuntime.execute over a .github/workflows/ci.yml + .gitlab-ci.yml fixture → ci-inventory (triggers/jobs/stepUses + stages/jobs) | `t3`, `t5` |
| GHA `on` normalization across string / array / map forms → sorted trigger names | `t3` |
| GitLab reserved-key exclusion (stages/variables/default/include not counted as jobs) | `t3` |
| Dockerfile multi-stage FROM + EXPOSE regex extraction; compose service with build-and-no-image | `t2` |
| registration parity: all 3 templates register + each template.produces[0] === the runtime output-Map key; INFRA_RUNTIMES + INFRA_TEMPLATES both length 8 | `t4` |
| the trimmed infra.discovery.families description no longer mentions ansible/pulumi/cloudformation | `t4` |

## Citations

- **[[c1]]** `prior-artifact` `LLD S001 contractDetails.api + the inventory-terraform.ts pattern to mirror` — "Each new runtime is an infraInventory<Family>Runtime: TemplateRuntime mirroring inventory-terraform.ts (readScopeRef→resolveRepoPath→walkFiles→filter→parse→sorted deterministic output→one produces-key"
- **[[c2]]** `analyze-bundle` `s1 usage.example — inventory-kubernetes.ts js-yaml precedent` — "import { loadAll } from 'js-yaml' (^4.1.0 already a dep); parse per-file in try/catch, log.debug + continue on failure."
- **[[c3]]** `analyze-bundle` `s1 symbol.locate — _shared.ts helpers` — "readScopeRef, resolveRepoPath (kinds repo|manifest-dir|workspace), walkFiles(cap=5000)→{files,truncated} — reused verbatim by the new runtimes."
- **[[c4]]** `analyze-bundle` `s1 search.text — discovery-families.ts detection patterns` — "HELM_CHART_RE / DOCKERFILE_RE / COMPOSE_RE / .github/workflows / GITLAB_CI_RE — the same patterns the new inventory runtimes filter by."
- **[[c5]]** `prior-artifact` `LLD S001 dataModel — INFRA_RUNTIMES + INFRA_TEMPLATES field-adds + discovery description fix` — "Append 3 runtimes to INFRA_RUNTIMES (5→8) + 3 templates to INFRA_TEMPLATES (5→8) with matching produces-keys; trim the ansible/pulumi/cloudformation overpromise."
- **[[c6]]** `analyze-bundle` `s1 test.locate — infra-runtimes.test.ts harness` — "node:test + tmp fixtures (mkdtempSync/writeFileSync) + registerBuiltinRuntimes/_resetRuntimeBootstrapLatchForTests + getRuntime; the harness the new tests extend."
