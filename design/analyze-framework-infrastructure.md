# Analyze framework — Infrastructure vertical

## Target definition

An **infrastructure target** is whatever's deployed, how, and where — as evidenced by **declared artefacts in the repo**. Concretely: Infrastructure-as-Code definitions, container manifests, orchestrator configurations, CI/CD workflows, deployment topology files, runtime configuration, and any sibling artefacts that declare the production posture (Makefiles, scripts under `bin/` / `scripts/`, dotfiles like `.dockerignore`).

The framework **detects** what kinds of infrastructure artefacts exist in the scope; it does not pre-enumerate a fixed taxonomy. The LLM (high-class for the discovery + aggregation steps) is the deep-knowledge provider: given the catalog of detected file families, it knows what Terraform/Helm/Argo/GitHub-Actions/k8s look like and how to interpret them. The framework's job is to:

- Detect the file families present
- Provide the right shaper bundle (file excerpts + structure + cross-references)
- Drive the templates that produce citation-backed claims
- Stitch a target-shape report

Per the user's direction: **"the LLM is expected to have the knowledge to dig deeper, we just need to define the scope and output format."**

## What's in scope

| Aspect | Tasks |
|---|---|
| **Inventory** | What kinds of infrastructure artefacts live in the repo, where, how many. |
| **Components** | Services / workloads / functions / queues / databases / caches / brokers / CDNs / load balancers — whatever the artefacts declare. |
| **Topology** | What connects to what. Networking (security groups, ingresses, service meshes), data (volumes, persistent claims), identity (IAM, RBAC). |
| **Lifecycle** | Build → test → deploy flow. CI/CD trigger graph. Environments. Promotion gates. |
| **Configuration** | Per-environment variance. Secret references (declared, not values). Feature flags / runtime knobs. |
| **Posture** | Non-functional declarations: replicas, resource limits, autoscaling rules, health checks, restart policies, retry budgets, SLO/SLA references. |
| **Security** | Declared identity (service accounts, IAM roles), declared network policies, declared encryption (TLS configs, KMS refs), declared secret handling. |
| **Observability** | Declared instrumentation (metrics scraping, log aggregation, tracing). |
| **External dependencies** | Cloud SDK calls / managed services referenced (declarative side only — what's promised, not what's running). |

## What's out of scope (Phase 1)

- Live cloud SDK introspection (running terraform plan, querying AWS / Azure / GCP for actual deployed state). Deferred to Phase 2.
- Security vulnerability scanning (image CVE, IaC misconfiguration scanning — that's the *scanner* domain, not understanding).
- Cost projection.
- Drift detection between declared and live (subset of Phase 2 live introspection).
- IaC linting / policy enforcement (OPA, Checkov, etc).

## Discovery strategy

The infra shaper's run-level pass is **structural** by intent. The shaper does cheap glob + extension + first-line heuristics; the LLM does the interpretation.

1. **Resolve scope target.** From `scopeRef.kind`:
   - `repo`             → entire repo
   - `module`           → a directory subtree
   - `manifest-dir`     → an explicit infrastructure root (e.g. `./infra/` or `./.github/workflows/`)
2. **File-family detection.** Walk the scope and bucket files by structural signal:
   - Path-prefix conventions (`.github/workflows/*.yml` → github-actions; `terraform/**/*.tf` → terraform; `helm/**/Chart.yaml` → helm)
   - Extension + first-line probes (`*.yaml` with `apiVersion:` + `kind:` → kubernetes manifest; `Dockerfile`* → docker; `Makefile` → make; `.gitlab-ci.yml` → gitlab)
   - Marker files (`Cargo.toml`, `pom.xml`, `package.json`) — included only when they declare scripts/build relevant to deployment
3. **Family declaration.** Each detected family is registered with: id, member files, dominant pattern hint (one-line for the LLM: "github-actions workflow files, push-triggered, deploying to two environments"). The hint is template-emitted, not pre-encoded.
4. **Cross-family reference walk.** Look for cross-references between families using simple textual patterns:
   - GitHub Actions referencing Terraform / Helm / kubectl invocations
   - Helm charts referencing image names that exist as Dockerfile targets
   - Terraform modules referencing config files

The detection layer is deliberately shallow. It does not parse `.tf` AST or k8s YAML schemas. The LLM interprets the per-file content via templates.

## Task template catalog

Templates live under `src/insrc/analyze/templates/infrastructure/`. Naming convention: `infra.<family>.<action>`.

The catalog is the most generic of the three verticals — templates take **file content + family hint** and produce typed claims with citations. The LLM applies its knowledge of the family.

### Discovery family

| Template | Input | Output |
|---|---|---|
| `infra.discovery.families` | `{ scopeRef }` | `{ families: Array<{ id, label, memberCount, sampleFiles, citations[] }> }` |
| `infra.discovery.cross-references` | `{ scopeRef, families }` | `{ edges: Array<{ from, to, kind, citations[] }> }` |
| `infra.discovery.environments` | `{ scopeRef }` | `{ environments: Array<{ name, evidence: citations[] }> }` |

### Inventory family

| Template | Input | Output |
|---|---|---|
| `infra.inventory.components` | `{ scopeRef, family }` | `{ components: Array<{ kind, name, family, sourceFiles, citations[] }> }` — per-family generic component listing (the LLM interprets what's a "component" within Terraform vs Helm vs k8s) |
| `infra.inventory.resources` | `{ scopeRef, family }` | `{ resources: Array<{ kind, name, attrs, citations[] }> }` — generic resource listing |
| `infra.inventory.services-map` | `{ scopeRef }` + every component output | `{ services: Array<{ name, owner-family, runtime, scale, exposes, depends-on, citations[] }> }` — cross-family service-level synthesis |

### Topology family

| Template | Input | Output |
|---|---|---|
| `infra.topology.network` | `{ scopeRef }` | `{ network: { ingresses, egress, internal-routing, citations[] } }` |
| `infra.topology.identity` | `{ scopeRef }` | `{ identity: { serviceAccounts, roles, bindings, citations[] } }` |
| `infra.topology.data` | `{ scopeRef }` | `{ data: { volumes, persistent-claims, declared-databases, declared-storage, citations[] } }` |
| `infra.topology.dependency` | `{ scopeRef }` + inventory outputs | `{ nodes, edges, citations[] }` |

### Lifecycle family

| Template | Input | Output |
|---|---|---|
| `infra.lifecycle.ci-cd` | `{ scopeRef }` | `{ pipelines: Array<{ name, family, triggers, jobs, citations[] }> }` |
| `infra.lifecycle.deployment-flow` | `{ scopeRef }` + ci-cd output | `{ flow: { stages, environments, promotion-gates, citations[] } }` |
| `infra.lifecycle.build` | `{ scopeRef }` | `{ build: { tools, steps, outputs, citations[] } }` |

### Configuration family

| Template | Input | Output |
|---|---|---|
| `infra.config.per-environment` | `{ scopeRef, environments }` | `{ variance: Array<{ component, key, byEnv, citations[] }> }` |
| `infra.config.secrets-references` | `{ scopeRef }` | `{ references: Array<{ component, key, source: { kind, identifier }, citations[] }> }` — never the secret value |
| `infra.config.feature-flags` | `{ scopeRef }` | `{ flags: Array<{ name, owner, defaultValue, citations[] }> }` |

### Posture family

| Template | Input | Output |
|---|---|---|
| `infra.posture.scale` | `{ scopeRef }` + inventory | `{ scale: Array<{ component, replicas, autoscale, citations[] }> }` |
| `infra.posture.resources` | `{ scopeRef }` + inventory | `{ resources: Array<{ component, requests, limits, citations[] }> }` |
| `infra.posture.health` | `{ scopeRef }` + inventory | `{ health: Array<{ component, probes, restart-policy, citations[] }> }` |
| `infra.posture.reliability` | `{ scopeRef }` + ci-cd output | `{ reliability: { retry-budgets, circuit-breakers, slo-refs, citations[] } }` |

### Security family

| Template | Input | Output |
|---|---|---|
| `infra.security.identity` | `{ scopeRef }` + topology.identity | `{ surface: Array<{ component, identity, capabilities, citations[] }> }` |
| `infra.security.network-policies` | `{ scopeRef }` + topology.network | `{ policies: Array<{ scope, rules, citations[] }> }` |
| `infra.security.encryption` | `{ scopeRef }` | `{ encryption: { in-transit, at-rest, key-management, citations[] } }` |
| `infra.security.secret-handling` | `{ scopeRef }` + config.secrets-references | `{ patterns: Array<{ kind, locations, citations[] }> }` — declared posture only |

### Observability family

| Template | Input | Output |
|---|---|---|
| `infra.observability.metrics` | `{ scopeRef }` | `{ wiring: Array<{ component, source, sink, citations[] }> }` |
| `infra.observability.logs` | `{ scopeRef }` | `{ wiring: Array<{ component, format, destination, citations[] }> }` |
| `infra.observability.tracing` | `{ scopeRef }` | `{ wiring: Array<{ component, protocol, citations[] }> }` |

### External dependencies family

| Template | Input | Output |
|---|---|---|
| `infra.external.managed-services` | `{ scopeRef }` | `{ services: Array<{ provider, service, usage, citations[] }> }` |
| `infra.external.third-party-platforms` | `{ scopeRef }` | `{ platforms: Array<{ name, integration-kind, citations[] }> }` — Slack / PagerDuty / Datadog SaaS / etc |

### Aggregator (terminal)

| Template | Input | Output |
|---|---|---|
| `infra.aggregate.report` | `{ scopeRef, scope, intent }` + every upstream output | `{ sections: Array<{ heading, body, citations[] }> }` |

## Citation primitives

Infrastructure citations are file-anchored; entity citations don't apply (the indexer's entity table doesn't track YAML / HCL nodes):

- `kind: 'source'` — almost universal. `file` is the manifest path, `lineStart` / `lineEnd` the relevant block. The aggregator validates by re-reading.
- `kind: 'doc'` — vendor reference docs. Heavily used in the infra vertical because component interpretation often relies on "this field means X per Terraform docs". Surfaced distinctly so the reader knows it's unverified-by-us.
- `kind: 'entity'` — only for cross-references into the **code** vertical (e.g. a CI/CD workflow citing a `Makefile` target → the Makefile target is an entity in the indexer's graph for makefile-aware language modes; same for `package.json` scripts).

A typical infrastructure claim:

```jsonc
{
  "component": "checkout-service",
  "family": "kubernetes",
  "kind": "deployment",
  "replicas": 3,
  "summary": "Three-replica deployment in the prod cluster, scaled by HPA between 3-12 based on CPU.",
  "citations": [
    { "kind": "source", "file": "k8s/prod/checkout-deployment.yaml",
      "lineStart": 1, "lineEnd": 48 },
    { "kind": "source", "file": "k8s/prod/checkout-hpa.yaml",
      "lineStart": 1, "lineEnd": 22 },
    { "kind": "doc", "url": "https://kubernetes.io/docs/tasks/run-application/horizontal-pod-autoscale/" }
  ]
}
```

## Report shape per scope bucket

### XS — single manifest / single workflow

```
## <file path>

### What it declares
- <typed claims with citations>

### Cross-references
- <upstream / downstream artefacts>

### Posture
- <scale / health / security as declared>

### External dependencies
- <managed services / third-party referenced>
```

### S — manifest dir / single CI/CD workflow set / single Helm chart

```
## <subsystem>

### Inventory
- <components grouped by sub-family>

### Topology
- <network / identity / data>

### Lifecycle
- <build / CI/CD / deploy>

### Per-environment configuration
- <variance map>

### Posture
- <scale / resources / health / reliability>

### Security
- <identity / network / encryption / secret handling>

### Observability
- <metrics / logs / tracing wiring>

### External dependencies
- <managed services / third-party>
```

### M — single stack (e.g. all of `./infra/`)

```
## <stack name>

### Overview
- 1-2 paragraph summary

### Family map
- <one summary line per detected family>

### Service map  (the synthesized inventory)
- <per-service: kind, runtime, scale, depends-on>

### Cross-family topology
- network / data / identity

### Lifecycle
- ...

### Configuration variance
- per-environment

### Posture
- scale, resources, health, reliability

### Security posture
- ...

### Observability posture
- ...

### External dependencies
- ...
```

### L — full repo / multi-stack

```
## <repo name>

### Architecture
- <high-level: services, environments, regions>

### Stack inventory
- <one summary line per detected stack>

### Cross-stack topology
- <how the stacks integrate>

### Per-stack summary  (one section per stack)
- ...

### Global posture themes
- <patterns common across stacks>

### Global security themes
- ...

### Global lifecycle / promotion topology
- ...

### External dependency map
- <aggregate managed services + third-party>
```

### XL — multi-repo / org-wide

```
## <org name>

### Top-level partition map
- <child Plans (one per repo or repo cluster) under tasks/<task-path>/>

### Cross-partition topology
- <how the deployments inter-depend>

### Org-wide patterns
- <recurring patterns across partitions>

### Aggregated external dependencies
- ...

### Child Plan reports
- <link per child Plan under tasks/<task-path>/>
```

## Worked example: M / generic

User: `insrc analyze --scope ./infra "give me a structural understanding of this infrastructure"`

Classifier:
```jsonc
{
  "target": "infrastructure",
  "scope": "M",
  "focused": false,
  "scopeRef": { "kind": "manifest-dir", "value": "./infra" }
}
```

Plan Builder emits (trimmed):
```jsonc
{
  "goal": "Structural understanding of the infra/ stack",
  "target": "infrastructure",
  "scope": "M",
  "tasks": [
    { "taskId": "t01", "template": "infra.discovery.families", "params": {...}, "produces": ["families"] },
    { "taskId": "t02", "template": "infra.discovery.environments", "params": {...}, "produces": ["envs"] },
    { "taskId": "t03", "template": "infra.discovery.cross-references", "params": {...}, "consumes": ["families"], "produces": ["xrefs"] },
    { "taskId": "t04", "template": "infra.inventory.components", "params": { "family": "terraform" }, "produces": ["tf-components"] },
    { "taskId": "t05", "template": "infra.inventory.components", "params": { "family": "kubernetes" }, "produces": ["k8s-components"] },
    { "taskId": "t06", "template": "infra.inventory.components", "params": { "family": "helm" }, "produces": ["helm-components"] },
    { "taskId": "t07", "template": "infra.inventory.services-map", "params": {...}, "consumes": ["tf-components","k8s-components","helm-components"], "produces": ["services"] },
    { "taskId": "t08", "template": "infra.topology.network", "params": {...}, "consumes": ["services"], "produces": ["network"] },
    { "taskId": "t09", "template": "infra.topology.identity", "params": {...}, "consumes": ["services"], "produces": ["identity"] },
    { "taskId": "t10", "template": "infra.topology.data", "params": {...}, "consumes": ["services"], "produces": ["data"] },
    { "taskId": "t11", "template": "infra.topology.dependency", "params": {...}, "consumes": ["services","network","identity","data"], "produces": ["deps"] },
    { "taskId": "t12", "template": "infra.lifecycle.ci-cd", "params": {...}, "produces": ["pipelines"] },
    { "taskId": "t13", "template": "infra.lifecycle.deployment-flow", "params": {...}, "consumes": ["pipelines","envs"], "produces": ["flow"] },
    { "taskId": "t14", "template": "infra.config.per-environment", "params": {...}, "consumes": ["envs","services"], "produces": ["variance"] },
    { "taskId": "t15", "template": "infra.posture.scale", "params": {...}, "consumes": ["services"], "produces": ["scale"] },
    { "taskId": "t16", "template": "infra.posture.resources", "params": {...}, "consumes": ["services"], "produces": ["resources"] },
    { "taskId": "t17", "template": "infra.posture.health", "params": {...}, "consumes": ["services"], "produces": ["health"] },
    { "taskId": "t18", "template": "infra.security.identity", "params": {...}, "consumes": ["identity"], "produces": ["sec-identity"] },
    { "taskId": "t19", "template": "infra.security.network-policies", "params": {...}, "consumes": ["network"], "produces": ["sec-network"] },
    { "taskId": "t20", "template": "infra.observability.metrics", "params": {...}, "consumes": ["services"], "produces": ["metrics"] },
    { "taskId": "t21", "template": "infra.external.managed-services", "params": {...}, "consumes": ["services"], "produces": ["managed"] },
    { "taskId": "t22", "template": "infra.aggregate.report", "params": {...},
      "consumes": ["services","deps","flow","variance","scale","resources","health","sec-identity","sec-network","metrics","managed"],
      "produces": ["report"] }
  ]
}
```

22 tasks. Discovery + cross-refs use low-tier; inventory tasks medium-tier; the services-map synthesis and the aggregator use high-tier. Wall-clock 10-15 minutes; cost dominated by the high-tier tasks (~ $1-2 on Sonnet/Haiku/Opus mix).

## Discovery heuristics — concrete family probes

Phase-1 detection probes the framework ships out of the box. Each is a path glob + first-line heuristic; the LLM interprets the bodies via templates.

| Family | Path glob | First-line heuristic |
|---|---|---|
| `terraform` | `**/*.{tf,tf.json}` | — |
| `pulumi` | `**/Pulumi.{yaml,yml}` + `**/index.ts` co-located | `name:` + `runtime:` |
| `cloudformation` | `**/*.{json,yaml,yml}` | `AWSTemplateFormatVersion:` |
| `crossplane` | `**/*.yaml` | `apiVersion: ` matches `*.crossplane.io` |
| `kubernetes` | `**/*.{yaml,yml}` | `apiVersion: ` + `kind: ` |
| `helm` | `**/Chart.yaml` | `apiVersion: v[12]` + `name:` + `version:` |
| `kustomize` | `**/kustomization.yaml` | `apiVersion: kustomize.config.k8s.io` |
| `docker` | `**/Dockerfile*` | `FROM ` as first non-comment |
| `docker-compose` | `**/docker-compose*.{yml,yaml}` | `services:` |
| `github-actions` | `.github/workflows/*.{yml,yaml}` | `on:` + `jobs:` |
| `gitlab-ci` | `.gitlab-ci.yml` | — |
| `circleci` | `.circleci/config.yml` | — |
| `buildkite` | `.buildkite/pipeline.yml` | — |
| `jenkins` | `Jenkinsfile*` | — |
| `argo-cd` | `**/argocd-application*.yaml`, `**/argocd/*.yaml` | `apiVersion: argoproj.io` |
| `argo-workflows` | `**/*.yaml` | `apiVersion: argoproj.io/v1alpha1` + `kind: Workflow` |
| `flux` | `**/*.yaml` | `apiVersion: source.toolkit.fluxcd.io` |
| `istio` | `**/*.yaml` | `apiVersion: ` matches `istio.io` |
| `linkerd` | `**/*.yaml` | annotations `linkerd.io/inject` |
| `prometheus` | `**/prometheus*.{yml,yaml}` | `scrape_configs:` |
| `opa-rego` | `**/*.rego` | `package ` |

Detection is **non-exhaustive by design**: if a file family isn't probed but the user's scope contains it, the LLM still gets the bundle's file listing and can identify it from content during the discovery task. The probe set is for fast common-case bucketing; the LLM is the fallback for everything else.

## Failure surface

| Failure | Cause | Recovery |
|---|---|---|
| `family-detection-empty` | No detected files in scope | Run continues; planner emits a single generic-discovery task that lets the LLM walk the scope directly |
| `cross-reference-overrun` | Discovery emitted > 200 cross-references | Per-family templates execute with closure-truncated input; aggregate stamps `truncated: true` |
| `file-too-large` | Manifest exceeds the per-task budget | The template's prompt builder summarizes to a structured outline; full file path is referenced via citation; raw content lands in the dropped/ folder |
| `binary-or-generated` | Glob caught a binary/generated artefact | Skipped at the shaper level; not surfaced as a citation candidate |
| `secret-leak-in-citation` | LLM emitted what looks like a secret value in a `source` excerpt | Validator rejects; retry with redaction reminder |

## Configuration

```jsonc
{
  "models": {
    "analyze": {
      "infrastructure": {
        "familyProbes": "default",                  // 'default' | { custom probe set }
        "maxFilesPerFamily":         200,
        "maxCrossReferences":        200,
        "secretValuePattern": "default",            // regex set for redact-on-citation
        "centralityFamilyTopN":      5,
        "perTemplateModelClass": {
          "infra.discovery.families":      "low",
          "infra.inventory.services-map":  "high",
          "infra.aggregate.report":        "high"
        }
      }
    }
  }
}
```

## See also

- `design/analyze-framework.md` — overall framework
- `design/analyze-context-builder.md` — the `infra-shaper`
- `design/analyze-plan-builder.md` — what produces the task list
- `design/analyze-framework-code.md` — the code vertical citations the infra vertical occasionally refers to (e.g. Makefile / npm script entity citations)
