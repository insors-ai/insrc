<!-- insrc:artifact HLD-753e0ed64921d937 -->

# HLD: A net-new `src/deploy/` subsystem that mirrors the workflow/analyze framework shape rather than extending either

## Framework summary

A net-new `src/deploy/` subsystem that mirrors the workflow/analyze framework shape rather than extending either. It exposes a single `deploy-step` MCP loop (phase/state, paralleling `analyze-step` and `workflow-step`) and a per-story `index.ts` registrar + `schemas.ts` contract idiom, wired through its own `chain.ts` (discover → reuse → topology → {security, scale-HA}). All deployment understanding is emitted as graph-grounded, structured entity/relation bundles (never raw file dumps), sourced through the daemon graph via an additive `deploy-rpc.ts` — existing socket path, IPC method names, and payload shapes stay untouched (k3). Infra reach for discovery/topology/security routes exclusively through the existing k8s/cloud/ssh/http built-in tool domains (k6), and any LLM step inherits the CliProvider boundary — no direct cloud REST (k5).

## Architecture shape

Six stage runners under `src/deploy/runners/<stage>/` each following the `{ index.ts registrar, schemas.ts contract }` idiom, orchestrated by `src/deploy/chain.ts` and surfaced through one `src/mcp/deploy-step/` server plus an additive `src/daemon/deploy-rpc.ts` handler. Data flows one direction as typed bundles: s1 defines the framework surface (step protocol + graph-grounded context bundle) that every stage speaks; s2 discovers current state; s3 classifies reuse-vs-new; s4 designs topology; s5 and s6 each layer onto the topology and terminate at the user. Storage access stays daemon-owned — runners read the graph only over `deploy-rpc`, never opening LMDB/Lance directly (k4). Serial `for...of` provider calls throughout (no Promise.all over LLM).

## Shared contracts

### sc1: DeployStepProtocol

**Owner Story:** `s1`
**Consumed by:** `s2`, `s3`, `s4`, `s5`, `s6`

**Purpose:** The multi-turn deploy-step MCP loop envelope (phase/next/state) that every stage runner is driven by, paralleling analyze-step/workflow-step so the capability feels native (s1/ac1).

**Interface sketch (type-level):**

```
export type DeployPhase = 'start' | 'discover' | 'reuse' | 'topology' | 'security' | 'scale' | 'done';
export interface DeployStepRequest {
  phase: DeployPhase;
  repo?: string;
  state?: string;
  focus?: string;
  payload?: unknown;
}
export interface DeployStepResponse {
  next: DeployPhase | 'emit_bundle' | 'done';
  guidance: string;
  prompt?: string;
  schema?: object;
  state: string;
  markdown?: string;
}
export interface DeployStageRegistrar {
  stage: DeployPhase;
  register(): void;
}
```

### sc2: DeploymentContextBundle

**Owner Story:** `s1`
**Consumed by:** `s2`, `s3`, `s4`, `s5`, `s6`

**Purpose:** The graph-grounded, structured entity/relation output shape all stages emit instead of raw file dumps, consistent with AnalyzeContextBundle (s1/ac2).

**Interface sketch (type-level):**

```
export interface DeploymentEntityRef {
  entityId: string;
  kind: string;
  name: string;
  path: string;
}
export interface DeploymentRelationRef {
  from: string;
  to: string;
  relation: string;
}
export interface DeploymentCitation {
  entityId?: string;
  path: string;
  note: string;
}
export interface DeploymentContextBundle {
  stage: string;
  summary: string;
  entities: DeploymentEntityRef[];
  relations: DeploymentRelationRef[];
  citations: DeploymentCitation[];
}
```

### sc3: CurrentDeploymentReport

**Owner Story:** `s2`
**Consumed by:** `s3`, `s4`

**Purpose:** The structured, evidence-backed discovery of how insrc runs today — single local daemon, embedded persistence, and the recorded absence of tiers/messaging/manifests (s2/ac1-ac3).

**Interface sketch (type-level):**

```
export interface PersistenceRecord {
  engine: 'LMDB' | 'LanceDB' | 'DuckDB';
  embeddedInDaemon: boolean;
  citation: DeploymentCitation;
}
export interface AbsenceRecord {
  category: 'service-tier' | 'messaging-broker' | 'multi-node' | 'container-manifest' | 'orchestration-manifest' | 'cloud-manifest';
  present: false;
  note: string;
}
export interface CurrentDeploymentReport {
  processModel: 'single-local-daemon';
  installMechanism: 'shell-script';
  persistence: PersistenceRecord[];
  absences: AbsenceRecord[];
  context: DeploymentContextBundle;
}
```

### sc4: ReuseInventory

**Owner Story:** `s3`
**Consumed by:** `s4`

**Purpose:** The reuse-versus-new classification of each target-deployment element plus the mapping of access surfaces onto existing k8s/cloud/ssh/http tool domains (s3/ac1-ac2).

**Interface sketch (type-level):**

```
export type ToolDomain = 'k8s' | 'cloud' | 'ssh' | 'http';
export interface ReuseItem {
  element: string;
  classification: 'reused' | 'new';
  grounding: DeploymentCitation;
}
export interface AccessSurface {
  purpose: 'discovery' | 'execution';
  domain: ToolDomain;
  rationale: string;
}
export interface ReuseInventory {
  items: ReuseItem[];
  accessSurfaces: AccessSurface[];
  context: DeploymentContextBundle;
}
```

### sc5: TopologyDesign

**Owner Story:** `s4`
**Consumed by:** `s5`, `s6`

**Purpose:** The topology-and-connectivity design for a chosen target, carrying the single-storage-owner assignment and the preserved-IPC-contract assertion downstream to security and scale-HA (s4/ac1-ac3).

**Interface sketch (type-level):**

```
export type DeploymentTarget = 'self-hosted-containers' | 'orchestration' | 'gcp' | 'aws';
export interface TopologyComponent {
  name: string;
  role: string;
  storageBearing: boolean;
}
export interface Connection {
  from: string;
  to: string;
  medium: 'ipc' | 'network';
}
export interface TopologyDesign {
  target: DeploymentTarget;
  components: TopologyComponent[];
  connections: Connection[];
  storageOwnerComponent: string;
  ipcContractPreserved: true;
  context: DeploymentContextBundle;
}
```

### sc6: SecurityDesign

**Owner Story:** `s5`

**Purpose:** The access-control and security-boundary design layered onto the topology, including who may reach the single storage owner and the CLI-only provider-auth boundary (s5/ac1-ac2).

**Interface sketch (type-level):**

```
export interface AccessRule {
  principal: string;
  resource: string;
  boundary: 'ipc' | 'network' | 'process';
  allowed: boolean;
}
export interface ProviderAuthBoundary {
  path: 'claude-cli-oauth' | 'codex-cli-oauth';
  directRestIntroduced: false;
}
export interface SecurityDesign {
  accessRules: AccessRule[];
  storageOwnerAccess: AccessRule[];
  providerAuth: ProviderAuthBoundary;
  context: DeploymentContextBundle;
}
```

### sc7: ScaleHADesign

**Owner Story:** `s6`

**Purpose:** The scale-and-high-availability posture for the topology, reasoning about redundancy under the single-owner-of-storage reality (s6/ac1-ac2).

**Interface sketch (type-level):**

```
export interface ScaleDimension {
  axis: 'load' | 'node-count';
  approach: string;
}
export interface RedundancyPlan {
  component: string;
  replicable: boolean;
  storageOwnerConstraintNote: string;
}
export interface ScaleHADesign {
  scaling: ScaleDimension[];
  redundancy: RedundancyPlan[];
  sharedMultiWriterAssumed: false;
  context: DeploymentContextBundle;
}
```

## Story boundaries

### Story E20260721753e0ed6:S001

**Owns:** `sc1`, `sc2`

The `src/deploy/chain.ts` wiring order, the `src/mcp/deploy-step/` server transport, the additive `src/daemon/deploy-rpc.ts` handler registration, and the opaque `state`-token serialization format are private to s1. Downstream stages see only the DeployStepProtocol envelope and DeploymentContextBundle shape — never the chain internals, the RPC dispatch table, or how the graph queries are assembled behind deploy-rpc.

### Story E20260721753e0ed6:S002

**Owns:** `sc3`
**Depends on:** `sc1`, `sc2`

The specific graph queries and tool-surface probes s2 runs to detect embedded persistence and to confirm the absence of manifests (which entities/relations it walks, the manifests.locate reuse of the prior scope finding) stay private. Only the finished CurrentDeploymentReport is exposed; the discovery heuristics and evidence-gathering order are not consumed by any other story.

### Story E20260721753e0ed6:S003

**Owns:** `sc4`
**Depends on:** `sc1`, `sc2`, `sc3`

The reuse-classification logic — how s3 calls capability-reuse-check and tool-surface primitives and scores an element as reused-vs-new — is private. Downstream stories consume only the resolved ReuseInventory and its accessSurface-to-tool-domain map, not the matching rules that produced the classification.

### Story E20260721753e0ed6:S004

**Owns:** `sc5`
**Depends on:** `sc1`, `sc2`, `sc3`, `sc4`

The per-target placement reasoning, connectivity-derivation, and how s4 verifies the IPC-contract-preserved invariant against k3 stay private to s4. Security and scale-HA consume the finished TopologyDesign (components, connections, storageOwnerComponent) but not the target-specific placement algorithm or the internal verification of socket/method/payload immutability.

### Story E20260721753e0ed6:S005

**Owns:** `sc6`
**Depends on:** `sc1`, `sc2`, `sc5`

The threat-surface enumeration, how access rules are derived per connection, and how the CLI-OAuth provider boundary is validated are entirely private to s5. SecurityDesign is a terminal output consumed only by the end user — no other story reads its access rules or provider-auth reasoning.

### Story E20260721753e0ed6:S006

**Owns:** `sc7`
**Depends on:** `sc1`, `sc2`, `sc5`

The scaling-axis analysis and redundancy reasoning under the single-owner-of-storage constraint are private to s6. ScaleHADesign is a terminal output consumed only by the end user; no other story reads its scaling or redundancy plans.

## Non-functional targets

- **Performance:** Read-only, graph-grounded exploration only; any LLM/narrow step runs serial `for...of` with sequential awaits (never Promise.all over a provider). Accuracy is primary and cost is least priority — bigger context and more grounding passes are preferred over lossy shortcuts.
- **Security:** Cloud LLM access stays behind the claude/codex CLI OAuth sessions via CliProvider with no direct REST path (k5); the IPC surface stays additive-only (new deploy-rpc methods) with the existing socket path, method names, and payload shapes unchanged in lock-step with the IDE fork (k3); all infra reach routes through the k8s/cloud/ssh/http built-in tool domains rather than parallel access paths (k6).
- **Observability:** Every stage emits a DeploymentContextBundle whose claims carry DeploymentCitation entries grounded in real graph entities/paths (no hallucinated paths); stage runners log via getLogger('deploy-<stage>') — never console.log — consistent with the analyze/workflow frameworks.
- **Durability:** The deploy framework introduces no new persistent storage — all state lives in the opaque per-run step-loop `state` token and is derived from the daemon-owned graph via deploy-rpc; the single-owner-of-storage rule (k4) is preserved, and no runner opens LMDB/LanceDB/DuckDB directly.

## Rollout

### Phase A — Foundational framework contracts

**Stories:** `s1`
**Flag:** `INSRC_DEPLOY_ENABLED`

s1 owns the two contracts every other stage speaks — DeployStepProtocol (sc1) and DeploymentContextBundle (sc2) — plus the chain.ts wiring, the src/mcp/deploy-step/ server, and the additive src/daemon/deploy-rpc.ts handler. Nothing downstream can be built until the step-loop envelope and the graph-grounded bundle shape exist, and s1 has no dependsOn edges, so it lands first and alone.

**Backward compat:** Existing IPC surface must stay untouched: socket path (~/.insrc/daemon.sock), method names, and payload shapes remain in lock-step with the IDE fork (k3). deploy-rpc.ts adds only NEW methods; no existing handler signature or the out/daemon/index.js spawn contract changes.

### Phase B — Current-state discovery

**Stories:** `s2`
**Flag:** `INSRC_DEPLOY_ENABLED`

s2 depends on s1 (consumes sc1+sc2) and owns CurrentDeploymentReport (sc3), which both s3 and s4 consume. It must land before either can classify reuse or design topology, so it forms its own phase immediately after the framework surface.

**Backward compat:** Discovery is read-only over the daemon-owned graph via deploy-rpc; it opens no LMDB/Lance/DuckDB directly (k4) and adds no persistent state. No behavioral change to existing daemon reads.

### Phase C — Reuse-versus-new classification

**Stories:** `s3`
**Flag:** `INSRC_DEPLOY_ENABLED`

s3 depends on s2 (consumes sc3) and owns ReuseInventory (sc4), which s4 consumes. It sits between discovery and topology: it cannot start before the CurrentDeploymentReport exists and must finish before topology design can reason about what is reused versus stood up new.

**Backward compat:** AccessSurface mapping must target only the existing k8s/cloud/ssh/http built-in tool domains (k6) — no parallel infra-access paths introduced. Read-only; no IPC or storage-owner change.

### Phase D — Topology and connectivity design

**Stories:** `s4`
**Flag:** `INSRC_DEPLOY_ENABLED`

s4 is the convergence point: it depends on both s2 (sc3) and s3 (sc4) and owns TopologyDesign (sc5), the contract that both terminal stages (s5, s6) consume. It must land after discovery and reuse and before the security/scale layering, so it is its own phase.

**Backward compat:** The topology design must assert ipcContractPreserved: it may relocate where/how the daemon runs but must keep the socket path, method names, and payload shapes unchanged across both repos (k3), and must keep a single storageOwnerComponent with all other components reaching persistence only over IPC (k4).

### Phase E — Security and scale-HA layering (GA)

**Stories:** `s5`, `s6`

s5 (SecurityDesign) and s6 (ScaleHADesign) both depend only on s4 and neither consumes the other's output — sc6 and sc7 are terminal contracts consumed by the end user alone. They are mutually independent, so they land together in the final phase, which completes the discover→reuse→topology→{security,scale-HA} chain and flips the capability to generally available.

**Backward compat:** s5 must keep cloud LLM access behind the claude/codex CLI OAuth sessions with no direct REST path (k5); s6 must respect single-owner-of-storage (sharedMultiWriterAssumed: false, k4). Both remain read-only over deploy-rpc with the IPC surface still additive-only.

**Ordering rationale:** Phase order follows the Story dependsOn DAG and shared-contract ownership, with owners always landing before consumers. s1 owns sc1+sc2 (consumed by every stage) and has no dependencies, so it is Phase A. s2 owns sc3 (consumed by s3 and s4) and depends only on s1 → Phase B. s3 owns sc4 (consumed by s4) and depends on s2 → Phase C. s4 owns sc5 (consumed by both terminal stages) and depends on s2+s3 → Phase D, the single convergence point. s5 and s6 each depend only on s4, own terminal contracts (sc6, sc7) consumed by no other Story, and do not depend on each other — so they are co-located in the final Phase E and can proceed in parallel. Every one of the six Stories appears in exactly one phase, and no phase precedes a phase containing one of its dependencies. The whole net-new subsystem stays behind INSRC_DEPLOY_ENABLED through Phases A–D so partially-wired stages are never user-reachable, and the flag is removed in Phase E once the full chain terminates at the user.

### Risky bits

| Area | Why | Mitigation |
| :--- | :--- | :--- |
| IPC contract drift with the IDE fork (k3) | The IDE fork clones this repo and spawns out/daemon/index.js, consuming the socket path, method names, and payload shapes as the only cross-repo surface. Adding deploy-rpc.ts and any topology that relocates the daemon (s4/ac3) risks silently altering that surface and breaking the fork in lock-step. | Keep deploy-rpc strictly additive — new methods only, no edits to existing handler signatures or the socket path — and mirror the new types across both repos; s4's TopologyDesign must carry ipcContractPreserved: true and verify socket/method/payload immutability before emitting. |
| Single-owner-of-storage violation (k4) | Six stage runners under src/deploy/ each need graph data; the tempting shortcut is to open LMDB/Lance/DuckDB directly, which breaks the daemon-owns-all-DB-access invariant and the topology's storageOwnerComponent guarantee. | Enforce that no file under src/deploy/ imports a DB handle — all graph reads route through deploy-rpc only; s4 assigns exactly one storageOwnerComponent with every other component reaching persistence over IPC, and s6 sets sharedMultiWriterAssumed: false. |
| Framework-shape divergence from analyze/workflow (k6, s1/ac1-ac2) | A net-new src/deploy/ subsystem that drifts from the analyze-step/workflow-step idiom would feel bolted-on and could emit raw file dumps instead of graph-grounded bundles, failing the consistency acceptance criteria that every later phase inherits. | Land sc1 (DeployStepProtocol) and sc2 (DeploymentContextBundle) in Phase A modeled directly on analyze-step/workflow-step and AnalyzeContextBundle before any stage runner exists, so all downstream stages are forced through the same envelope and citation-grounded output shape. |

## Alternatives considered

### a1: Distinct sibling subsystem (src/deploy/) mirroring the workflow framework — **CHOSEN**

A separately-scoped deploy framework rooted at src/deploy/ with its own chain, per-story registrar+schema runners, and its own *-step MCP server, structurally parallel to src/workflow.

Stand up deployment design as a net-new subsystem rooted at src/deploy/, a sibling to src/analyze and src/workflow rather than a tenant of either. It replicates the workflow framework's proven surface shape one-to-one: a chain.ts wiring the six stories in dependency order (discover → inventory → topology → security → scale/HA), an orchestrator + executor, and per-story stage runners each following the 'one index.ts register* function + one schemas.ts contract' idiom observed on design-epic. A dedicated src/mcp/deploy-step server plus a daemon deploy-rpc handler expose the multi-turn loop, exactly paralleling analyze-step/workflow-step, so the capability is reached through an interface users already recognize while staying its own separately-scoped subsystem.

The six stories share one contract spine defined in a deploy-level types.ts: a DeploymentContext bundle (discovery evidence, reuse/new inventory, chosen target, topology, security boundaries, scale/HA posture) that each stage reads and extends, so later stages are grounded in earlier stages' verified output rather than re-deriving state. Graph-grounded context comes by calling the existing analyze context builder (decomposer/synthesizer) as a library, and infra reach for discovery/execution routes through the existing cloud/http/ssh (and k8s) built-in tool domains under src/daemon/tools/builtins/ — no parallel infra-access path. Decompose/synthesize and any discovery execution inherit the LLMProvider boundary unchanged (CliProvider only for cloud, serial for...of).

**Pros:**
- Directly satisfies k6's 'distinct from but consistent with' requirement: a separate src/deploy/ root keeps deployment scoping isolated from analyze/workflow while copying their surface idioms verbatim.
- Blast radius is contained — changes land in a new subsystem tree and a new MCP server, so no edit touches the workflow chain.ts or analyze runner registries that other capabilities depend on.
- The six stories get one shared DeploymentContext contract that carries verified prior-stage evidence forward, so topology/security/scale each build on discovery output rather than re-running discovery.
- Consistent surface (deploy-step MCP loop mirroring analyze-step/workflow-step) means the IDE and CLI integrate it through the same IPC/MCP patterns already wired, no new integration idiom to learn.

**Cons:**
- Highest up-front cost: a full chain + orchestrator + executor + MCP server + rpc handler must be built new rather than extended, duplicating ~5 files of workflow scaffolding shape.
- Some machinery (orchestrator/executor loop mechanics) is copied from workflow rather than shared, creating two parallel implementations of the same stage-runner pattern that can drift.
- The framework anchors used as templates resolved below 0.5 confidence (design-epic 0.371), so mirroring the shape carries risk that the copied surface is not the canonical one and needs correction during LLD.
- Placement as a sibling root is convention-driven, not import-graph-grounded (import.graph was not run), so the module boundary is asserted rather than verified against existing import density.

**Cost estimate:** L

### a2: New deployment chain inside the existing workflow framework

Add the six deployment stages as new runners under src/workflow/runners/ and a new chain entry, reusing the workflow orchestrator/executor and the insrc_workflow_step MCP tool wholesale.

Rather than a new subsystem, extend the workflow framework in place: add a deployment chain to src/workflow/chain.ts and implement the six stories as new stage runners under src/workflow/runners/ (e.g. deploy-discover, deploy-inventory, deploy-topology, deploy-security, deploy-scale), each keeping the existing index.ts registrar + schemas.ts contract convention. The existing orchestrator.ts, executor.ts, gates, and amendments machinery are reused unchanged, and the capability is driven through the already-registered insrc_workflow_step MCP tool — no new MCP server or rpc handler is added.

Shared contracts are expressed as new schemas in the workflow schema namespace, threaded through the workflow's existing step/gate state model so the deployment stages participate in the same run lifecycle (gates, back-flow, tracker) as design.epic/design.story. Graph-grounded context is obtained the same way the current runners obtain it — via the analyze context builder — and infra probing routes through the cloud/http/ssh/k8s built-in tool domains. The provider boundary is inherited for free because all workflow runners already go through LLMProvider/CliProvider.

**Pros:**
- Lowest incremental cost: reuses orchestrator.ts, executor.ts, gates, and the insrc_workflow_step MCP tool, so only six runners + chain wiring + schemas are net-new — no second MCP server or rpc handler.
- Deployment stages automatically inherit the workflow framework's gate, back-flow, and tracker mechanics, giving user-review and amendment handling without reimplementation.
- Single implementation of the stage-runner loop, so no drift risk between two parallel orchestrator/executor copies.
- One MCP surface (insrc_workflow_step) already wired into IDE/CLI carries deployment with zero new integration.

**Cons:**
- Directly conflicts with k6's 'distinct, separately-scoped subsystem' requirement — deployment becomes a tenant of the workflow framework rather than its own subsystem, blurring the boundary the Epic asks to preserve.
- Couples deployment's evolution to the workflow chain: schema or lifecycle changes for deployment risk regressing design.epic/design.story runs that share the same orchestrator state model.
- The workflow framework's gate/tracker model is oriented to HLD/LLD authoring, so deployment stages may inherit lifecycle assumptions (e.g. epic/story gating) that do not fit discovery/topology reasoning.
- Growth of src/workflow/runners/ to hold two unrelated chains raises the cognitive and blast-radius cost of every future workflow-framework change.

**Cost estimate:** M

**Rejected because:** Ranked last (winnerRank 4) and the only alternative that outright VIOLATES k6 (s3 verdict 'violates'): making deployment a tenant of src/workflow/runners/ breaks the distinctness half of k6 operationalized by the framing story s1, and couples deployment schema/lifecycle changes to the shared design.epic/design.story orchestrator state. Its lowest cost is irrelevant under the accuracy-over-cost principle when the decisive constraint is violated.

### a3: Deployment as a suite of analyze exploration recipes

Model the six stories as new analyze recipes atop src/analyze, driven through the existing insrc_analyze_step decompose/synthesize loop, producing graph-grounded context bundles per stage.

Treat deployment design as an extension of the analyze framework: each of the six stories becomes one or more new exploration recipes under src/analyze/explore/, composed by the existing decomposer/synthesizer and returned as AnalyzeContextBundle-shaped results through the existing insrc_analyze_step multi-turn loop. Discovery reuses manifests/tool-surface style explorations; the reuse-vs-new inventory leans directly on the existing capability-reuse-check.ts and tool-surface.ts primitives; topology/security/scale become recipes that synthesize over graph context plus infra probes.

The shared contract is the AnalyzeContextBundle itself, extended with deployment-specific layers, so every stage output is by construction graph-grounded structured entity/relation summaries (satisfying ac2 of s1 natively). Infra reach routes through the cloud/http/ssh/k8s tool domains invoked as recipe steps, and the provider boundary is inherited because analyze's narrow-LLM calls already route through the LLMProvider abstraction. No new chain or orchestrator is introduced; sequencing across the six stories is expressed as recipe composition and decompose planning rather than a dedicated stage machine.

**Pros:**
- Strongest native fit for s1-ac2: analyze recipes already emit graph-grounded structured entity/relation bundles, so 'no raw file dumps' is satisfied by construction, not by added discipline.
- Reuses the existing reuse-inventory primitives (capability-reuse-check.ts, tool-surface.ts) and decomposer/synthesizer directly, concentrating net-new work on deployment-specific recipe logic.
- No new orchestrator/executor/MCP server — deployment rides the already-wired insrc_analyze_step loop, keeping surface count flat.
- Recipe composition makes each story independently invokable and testable as an exploration, matching how analyze already scopes work.

**Cons:**
- Weakest fit for k6's 'distinct subsystem' and the design.epic-style stage/gate consistency — analyze recipes are read-only explorations, not a staged design chain, so the capability would feel like analyze rather than a peer framework with its own surface.
- The analyze loop is optimized for one-shot context retrieval, not multi-stage design where topology depends on a chosen target and security layers onto topology; encoding cross-stage dependency in recipe composition strains the model.
- Analyze anchors (decomposer.ts) resolved low-confidence (0.325), so treating its internals as an extensible recipe substrate for a new domain carries template risk.
- Deployment design produces prescriptive artifacts (a chosen topology, an access-control design), which sit awkwardly in the descriptive AnalyzeContextBundle shape and may force contract stretching.

**Cost estimate:** M

**Rejected because:** Ranked winnerRank 3 with a 'partial' k6 verdict: although it uniquely nails s1/ac2 graph-grounding by construction, it fails the distinctness half of k6 (becomes a tenant of analyze, not a peer subsystem) and its read-only one-shot exploration loop poorly encodes the cross-stage dependency (topology→security→scale) the Epic's story graph requires.

### a4: Thin orchestration layer over composed existing primitives

A minimal deploy driver that composes the analyze context builder and the infra tool domains directly per story, without replicating the full chain/orchestrator/executor machinery.

Build the lightest possible new surface: a small src/deploy/ driver plus one MCP entry that, for each of the six stories, makes a directed call composing (a) the analyze context builder for graph-grounded evidence and (b) the cloud/http/ssh/k8s tool domains for live infra probes, then a single synthesize step. It deliberately does not reproduce workflow's orchestrator.ts/executor.ts/gates; sequencing is plain driver code that passes a growing DeploymentContext object from stage to stage.

The shared contract is a single DeploymentContext type owned by the deploy driver, and consistency with the other frameworks is achieved at the MCP-surface level (a familiar step-shaped call) rather than by replicating internal machinery. The provider boundary is inherited by routing all synthesis through the LLMProvider/CliProvider abstraction, and no parallel infra-access path is introduced because probes go through the existing tool domains. This trades framework-internal consistency for minimal net-new code and fastest path to a working end-to-end discovery→scale pipeline.

**Pros:**
- Smallest net-new footprint: no orchestrator/executor/gate/tracker reimplementation — just a driver, a DeploymentContext type, and glue to existing analyze + tool primitives.
- Fastest path to an end-to-end discovery→scale/HA pipeline, since each story is a directed compose call rather than a registered runner in a stage machine.
- Avoids duplicating workflow's orchestrator machinery, so there is no second copy of the stage-runner loop to keep in sync.
- Provider boundary and infra reuse fall out for free by delegating to the existing LLMProvider abstraction and tool domains.

**Cons:**
- Weakest consistency with the analyze/workflow frameworks' internal surface — 'consistent interface' is only skin-deep at the MCP call, so k6's consistency intent is partially met at best.
- No shared gate/back-flow/tracker mechanics, so user-review, amendments, and revision handling must be either hand-rolled per story or forgone, unlike a1/a2 which inherit them.
- Bespoke driver sequencing is less discoverable and less testable than a declared chain, raising the cost of adding or reordering a seventh stage later.
- As deployment reasoning grows, the thin driver tends to accrete orchestrator-shaped logic ad hoc, risking a worse-structured re-derivation of the machinery a1/a2 already provide.

**Cost estimate:** S

**Rejected because:** Ranked winnerRank 2 with a 'partial' k6 verdict: it satisfies the harder distinctness half of k6 and reuses the tool domains, tying a1 on k1–k5, but falls short of a1 on the consistency half — the framework-internal chain/registrar/stage surface is not replicated, so it feels like a bespoke driver rather than a peer framework and tends to accrete orchestrator-shaped logic ad hoc. Its lower S cost does not outweigh the fuller k6 fit under the accuracy-over-cost principle.

## Open questions

- f2 (partial, s6): The named net-new modules (src/deploy/runners/<stage>/, src/deploy/chain.ts, src/mcp/deploy-step/, src/daemon/deploy-rpc.ts) are grounded in the analyze-step/workflow-step/AnalyzeContextBundle idiom via story-flow markers but carry no explicit per-module analyze-bundle citation, because they are net-new proposals with no existing bundle to cite — the exact registrar/decompose signatures to mirror should be read directly when the LLD stage designs the stage runners.
- Back-flow note (s1): import.graph was NOT run — claims about where new deployment modules land relative to existing import density are unverified; the HLD states the placement decision as convention-driven (new subsystem root sibling to src/analyze and src/workflow) rather than degree-grounded. An import.graph pass on src/workflow/ + src/analyze/context/ would confirm the module boundary.
- Back-flow note (s1): Both framework template anchors resolved below the 0.5 confidence line (design-epic 0.371, decomposer.ts 0.325) — the workflow/analyze runners are directional templates for the framework surface, not canonical roots to copy verbatim; the copied surface may not be canonical and could need correction during LLD.
- Back-flow note (s1): No symbol.locate/source excerpts were captured, so the exact registrar/decompose signatures to mirror should be read directly when the LLD stage designs the stage runners.

## Citations

- **[[c1]]** `analyze-bundle` `s1.analyzeBundles[0] — structural-map: framework-surface templates` — "The workflow framework is the closest structural template: its design-epic runner (src/workflow/runners/design-epic/) is a tight surface — index.ts ... plus schemas.ts ... wired through chain.ts (defi"
- **[[c2]]** `analyze-bundle` `s1.analyzeBundles[0] — analyze context source (decomposer/synthesizer/AnalyzeContextBundle)` — "src/analyze/context/ holds decomposer.ts (prepareDecompose/decompose/finalizeDecompose), synthesizer.ts, types.ts (AnalyzeContextBundle), and driver.ts, exposed via src/mcp/analyze-step and src/daemon"
- **[[c3]]** `analyze-bundle` `s1.analyzeBundles[1] — capability-discovery: reuse-inventory primitives + infra tool domains` — "src/analyze/explore/capability-reuse-check.ts and src/analyze/context/tool-surface.ts are existing reuse-inventory primitives ... Infra reach ... maps onto existing built-in tool domains under src/dae"
- **[[c4]]** `analyze-bundle` `s1.analyzeBundles[2] — convention.detect: runner naming/structure idioms` — "the runner is function-registrar-based with no class hierarchy ... The deployment framework should mirror this 'one index.ts register* function + one schemas.ts contract per stage, no base-class idiom"
- **[[c5]]** `analyze-bundle` `s1.analyzeBundles[3] — doc-constraint: CliProvider provider boundary, no direct REST` — "CLAUDE.md Project principles and Key architectural rules both forbid direct cloud REST and require all cloud LLM access through the claude/codex CLI binaries via CliProvider ... provider calls are nev"

<!-- insrc:review -->

## Review

### ⛔ Review `BLOCK` — design.epic (design.epic)

**0 HIGH · 7 MED · 10 LOW** · model `claude` · reviewed 2026-07-21T15:43:04.780Z

| Ref | Kind | Severity | Fixability | Premise | Evidence | Action |
| --- | --- | --- | --- | --- | --- | --- |
| architecture-shape | inventory | MED | manual | The deploy subsystem is composed of exactly six stage runners under src/deploy/runners/<stage>/, one per story s1..s6. | The gathered evidence never probes `src/deploy/runners/` — neither a path listing nor a read of that directory was handed to me — so the premise's core claim (exactly six stage runners under `src/deploy/runners/<stage>/`) is unsupported by the ground truth. What the evidence DOES show cuts against the premise's framing: (1) the `s1..s6` anchors resolve to *story workflow IDs* `S001..S006`, a workflow-framework construct, not deploy stages — see `src/workflow/id.ts:37` (`E20260717185807ba:S001:T003`), `src/workflow/__tests__/id-resolve.test.ts:48` (`storyWorkflowId(..., 's1')` → `E…:S001`), and `src/workflow/tracker/resolve.ts:16`; (2) the only runners actually appearing in evidence live under `src/workflow/runners/`, not `src/deploy/runners/` — `src/workflow/runners/design-epic/index.ts:326`. The `sc[1-7]:` hits are `sharedContract` identifiers (`src/workflow/runners/design-epic/index.ts:327`, `src/mcp/workflow-step/__tests__/design-epic-e2e.test.ts:241`), also unrelated to deploy stages. No match anywhere references a `src/deploy/` tree. | Re-run a probe that directly tests the premise: list `src/deploy/runners/` (or grep the path `src/deploy/runners`) to confirm whether the directory and its six stage runners actually exist. The current evidence cannot verify this. If the intent was the workflow runners, correct the anchor: runners live under `src/workflow/runners/` and `s1..s6` are story IDs `S001..S006`, not deploy stages — a `deploy` subsystem with per-story stage runners is not substantiated by any match handed over. |
| framework-summary | ordering | MED | assisted | The chain wiring order is discover → reuse → topology → {security, scale-HA}, mirroring the story dependency DAG. | The premise anchors `src/deploy/chain.ts`, but grep for `chain.ts` returned 0 matches and the only chain file actually read is `src/workflow/chain.ts:1` — which yields nothing but the license-header comment, so the claimed wiring order (discover → reuse → topology → {security, scale-HA}) is nowhere confirmed. The 50 `register\\w*(` matches all land in `src/analyze/**/__tests__/*` (registerBuiltinTools, registerTemplateRuntime, registerConnections, etc.) — none touch a deploy/chain wiring sequence or the tokens discover/reuse/topology/security/scale. The evidence neither confirms nor contradicts the ordering: it is UNVERIFIABLE. Separately, the anchor path `src/deploy/chain.ts` is stale — no such file surfaces; the real file is `src/workflow/chain.ts` (consistent with the repo having a `workflow/` module and no `deploy/` module) — but this still points at the right concept (chain.ts), so it does not alter what gets built. | Re-probe the ordering directly: read the registration/wiring body of `src/workflow/chain.ts` (not just line 1) to confirm the discover → reuse → topology → {security, scale-HA} sequence, and correct the anchor path from `src/deploy/chain.ts` to `src/workflow/chain.ts`. The ordering claim itself cannot be accepted or rejected on the gathered evidence. |
| c1 | citation | MED | assisted | The workflow design-epic runner at src/workflow/runners/design-epic/ consists of an index.ts registrar plus schemas.ts contract, wired through src/workflow/chain.ts. | All three anchor files resolve to real source: `read src/workflow/runners/design-epic/index.ts:1 → FOUND`, `read src/workflow/runners/design-epic/schemas.ts:1 → FOUND`, `read src/workflow/chain.ts:1 → FOUND`. The registrar is confirmed: `src/workflow/runners/design-epic/index.ts:377 export function registerDesignEpicRunners(): void`. So the "index.ts registrar + schemas.ts contract" half of the premise is verified sound. The wiring half is imprecise: the only match for `/runners/design-epic/` in the tree is `src/workflow/index.ts:13: import { registerDesignEpicRunners } from './runners/design-epic/index.js'` — i.e. the runner is registered through `src/workflow/index.ts` (whose `registerWorkflowRunners()` at line 23 is the aggregator), NOT through `chain.ts`. The grep produced a single, non-truncated match, so `chain.ts` contains no path reference to this runner. `chain.ts` exists and is a genuine part of the workflow chain, but the evidence does not support it being the wiring point for the design-epic runner's registration. | Reword the wiring clause to match the evidence: the design-epic runner is registered through `src/workflow/index.ts` (`registerDesignEpicRunners` / `registerWorkflowRunners`), not `src/workflow/chain.ts`. If `chain.ts` was intended as the sequencing/orchestration reference rather than the registration site, state that distinctly. This is a descriptive citation, not a prescriptive build step — the misattribution does not change what gets built, so it is non-blocking imprecision. |
| sc5 | semantic | MED | manual | The daemon owns all DB access; runners under src/deploy/ read the graph only over deploy-rpc and never open LMDB/LanceDB/DuckDB directly, and TopologyDesign carries exactly one storageOwnerComponent (k4). | The only probes the engine ran were `grep /storageOwnerComponent/ → 0 matches` and `grep /single-owner-of-storage/ → 0 matches`. Neither addresses the premise's load-bearing claims: nothing was gathered on `deploy-rpc` usage by runners under `src/deploy/`, on whether those runners open LMDB/LanceDB/DuckDB directly, or on the `k4` TopologyDesign structure. The two greps that did run both returned empty, and `storageOwnerComponent`'s 0-match is ambiguous — for a design artifact prescribing a new field it is the expected result (the field does not exist yet because it is being designed), not a contradiction. No cited `path:line` read was supplied to confirm or refute the daemon-owns-DB / single-storage-owner claim. | Re-run the engine with probes that actually target the premise: (1) grep `src/deploy/` for direct imports/opens of `lmdb`, `lancedb`/`@lancedb`, `duckdb` to confirm runners never open storage directly; (2) grep for `deploy-rpc` / the deploy RPC client to confirm runners read the graph over it; (3) locate the `TopologyDesign` type/schema and count `storageOwnerComponent` occurrences (or its actual field name) to verify the "exactly one" / k4 claim. Until such evidence exists, the premise is unverifiable from what was handed over. |
| ordering-rationale | cross-artifact | MED | manual | The story dependency DAG is: s1 (no deps), s2 depends on s1, s3 depends on s2, s4 depends on s2 and s3, s5 depends on s4, s6 depends on s4, with s5/s6 mutually independent terminal stories. | The premise asserts a specific 6-node story DAG (s1 no-deps; s2→s1; s3→s2; s4→s2,s3; s5→s4; s6→s4; s5/s6 independent terminals). None of the gathered evidence addresses this actual topology. The `/Depends on/` matches are all rendering/format machinery — `define.ts:149`, `hld.ts:160`, `plan.ts:112`, `tracker/conventions.ts:181` (each just emits a "**Depends on:**" line) plus two test assertions. The `/dependsOn/` matches are type definitions (`codec.ts:268`, `shared/types.ts:814`, `explore/types.ts:96`), decomposer/executor plumbing, and unrelated test fixtures (`e1/e2`, `s0/s1`, `t1/t2`). The only story-shaped fixtures are `hld-artifact.test.ts:137` (`s1 dependsOn []`, `s2 dependsOn ['s1']`) and `define-artifact.test.ts:159-160` (a deliberate s1↔s2 cycle test) — neither is the artifact under review, and none contains s3, s4, s5, or s6, nor the s4→{s2,s3} fan-in or s5/s6 fan-out the premise describes. Anchors sc1/sc7 do not appear in the evidence at all. The evidence neither confirms nor contradicts the claimed DAG. | Re-run the probe against the actual story artifact (the define/epic markdown holding s1–s6) and read each story's "**Depends on:**" line to confirm the edges: s2→s1, s3→s2, s4→{s2,s3}, s5→s4, s6→s4, and that s5/s6 are leaf nodes with no dependents. The current grep evidence targets the generic dependsOn code paths, not the artifact instance, so the claim cannot be adjudicated as handed. |
| sc4 | closed-union | MED | manual | All infra reach for discovery/topology/security routes exclusively through the existing k8s/cloud/ssh/http built-in tool domains — no parallel access path (k6). | Both re-run probes returned nothing: grep /builtins/(k8s\|cloud\|ssh\|http)/ → 0 matches and grep /ToolDomain/ → 0 matches. Nothing in the gathered evidence addresses whether the four domains exist or whether a parallel k6 path exists, so the closed-union premise is unverifiable from this evidence. | Re-run the probes against the real tool-registry location (`src/daemon/tools/`) to enumerate the actual built-in domains and confirm (a) that k8s/cloud/ssh/http are the discovery/topology/security access paths and (b) that no k6 or other parallel path exists. The current evidence cannot support or refute the closed-union premise, so do not treat it as verified until a probe that actually hits the source tree is supplied. |
| alternatives-considered | inventory | MED | manual | Exactly four alternatives were considered (a1 chosen sibling subsystem, a2 tenant of workflow, a3 analyze recipes, a4 thin driver), with a1 chosen. | The premise claims exactly four alternatives (a1–a4) with a1 chosen. The only gathered evidence is a grep for `/### a[1-4]:/` returning 2 matches, both inside a test file — `src/workflow/__tests__/hld-artifact.test.ts:90` (`assert.ok(md.includes('### a1:'))`) and `:92` (`### a2:`). No match resolves to the actual artifact/source, and a3, a4, the "exactly four" count, and the "a1 chosen" claim are nowhere addressed by the evidence. The two hits only prove that a test asserts a1 and a2 headings appear in some rendered markdown; they neither confirm nor contradict the four-member inventory or which alternative was chosen. | Unverifiable from the gathered evidence — the probe only reached a test fixture, not the alternatives inventory itself. Re-run the probe against the actual HLD artifact markdown (grep the produced/stored artifact, not `__tests__`) to enumerate the `### a1..aN` headings and confirm both the count of four and that a1 is marked chosen before relying on this premise. |
| c2 | citation | LOW | manual | src/analyze/context/decomposer.ts exports prepareDecompose, decompose, and finalizeDecompose. | All three exports are confirmed in src/analyze/context/decomposer.ts: `export async function decompose` (decomposer.ts:156), `export function prepareDecompose(intent: ClassifiedIntent)` (decomposer.ts:235), and `export function finalizeDecompose(raw: unknown)` (decomposer.ts:253). Note: the `prepareDecompose` grep also surfaces a distinct same-named export in src/workflow/orchestrator.ts:131, but the citation's anchored file resolves all three symbols correctly. | none — verified sound |
| c2 | inventory | LOW | manual | src/analyze/context/ holds decomposer.ts, synthesizer.ts, types.ts (defining AnalyzeContextBundle), and driver.ts. | All four named files exist in src/analyze/context/ per the gathered matches: decomposer.ts (src/analyze/context/decomposer.ts:21), synthesizer.ts (src/analyze/context/synthesizer.ts:20, also imported as ../context/synthesizer.js by mcp/analyze-step phases), driver.ts (src/analyze/context/driver.ts:372, imported widely as ../context/driver.js), and types.ts (read src/analyze/context/types.ts:1 → FOUND). AnalyzeContextBundle is defined in types.ts: the context/__tests__ files uniformly `import type { AnalyzeContextBundle } from '../types.js'` (e.g. bundle.test.ts:36, cache.test.ts:30, schema.test.ts:28) — where ../types.js resolves to src/analyze/context/types.ts — and it is consumed across the module (bundle.ts:35,87; cache.ts:45). Every clause of the inventory is confirmed by real evidence. | none — verified sound |
| c2 | citation | LOW | manual | The analyze context builder is exposed via the src/mcp/analyze-step MCP server, paralleled by the proposed src/mcp/deploy-step. | The anchor `src/mcp/analyze-step` resolves to a real MCP server module: `src/mcp/server.ts:45` imports `handleAnalyzeStep from './analyze-step/handler.js'`, and the directory contains the full step pipeline (`analyze-step/handler.ts:44`, `phases/plan.ts`, `phases/narrow.ts`, `phases/bundle.ts`, `phases/start.ts`, `state-store.ts`, `state.ts`), confirming it exposes the multi-phase analyze pipeline. The `workflow-step` sibling docstrings (`workflow-step/handler.ts:8`, `state-store.ts:9,15`, `state.ts:11`) confirm this is the established pattern a new step server parallels. The `src/mcp/analyze-step:1 → NOT FOUND` read is a directory being read as a file and carries no weight. The proposed `src/mcp/deploy-step` is future/not-yet-created, so its absence is expected and consistent with the premise's "proposed" framing. The citation's factual claim holds. | none — verified sound |
| c3 | citation | LOW | manual | src/analyze/explore/capability-reuse-check.ts and src/analyze/context/tool-surface.ts are existing reuse-inventory primitives. | Both cited paths resolve to real files. `read src/analyze/explore/capability-reuse-check.ts:1 → FOUND` and `read src/analyze/context/tool-surface.ts:1 → FOUND`. Both are live, imported modules, not dead paths: capability-reuse-check.ts is imported by executor.ts:36 and index.ts:50 (and tested in phase3-explorations-params.test.ts:12 via `runCapabilityReuseCheck`); tool-surface.ts is imported by driver.ts:82 (`getReadOnlyTools`) and covered by tool-surface.test.ts. The evidence supports that both exist and function as reuse/tool-inventory primitives, matching citation c3's claim. | none — verified sound |
| c4 | closed-union | LOW | manual | The workflow/analyze runners are function-registrar-based (one index.ts register* function + one schemas.ts contract per stage) with no base-class hierarchy. | The `no base-class hierarchy` half is directly confirmed: `grep /class \\w+Runner extends/ → 0 match(es)` — no runner extends any base class. The `function-registrar-based` half is confirmed by the `register*` matches on the workflow runner stages: `src/workflow/index.ts:23 registerWorkflowRunners`, `src/workflow/runners/define/index.ts:284 registerDefineRunners`, `src/workflow/runners/design-epic/index.ts:377 registerDesignEpicRunners`, `src/workflow/runners/design-story/index.ts:541 registerDesignStoryRunners`, with runners fed into the executor via `src/workflow/executor.ts:57 registerRunner`. Each stage lives under `src/workflow/runners/<stage>/index.ts` with a single `register*` function, exactly as the premise states. The analyze side mirrors this (`src/analyze/executor/registry.ts:39 registerTemplateRuntime`, `src/analyze/runtimes/bootstrap.ts:44 registerBuiltinRuntimes`). Evidence contradicts no part of the closed-union claim. | none — verified sound |
| c5 | external-contract | LOW | manual | CLAUDE.md forbids direct cloud REST and requires all cloud LLM access to route through the claude/codex CLI binaries via CliProvider. | The evidence confirms the premise. `src/agent/providers/cli-provider.ts:7` documents "CliProvider -- wraps the locally-installed `claude` and `codex` CLI" and `:88` declares `export class CliProvider implements LLMProvider`. The type is the real cloud-LLM entry point across the tree (47 matches): the shaper routes through it (`src/analyze/context/shaper-provider.ts:197` `return new CliProvider({...})`, logged as "shaper provider: routing through CliProvider" at :195), and it backs the workflow, validate, and CLI paths (`src/cli/services/workflow.ts:231`, `src/mcp/build-step/phases/validate.ts:45`, both `new CliProvider({ kind: 'claude' })`). The "no direct REST" rule is independently echoed in an implementation prompt at `src/prompts/build/implement-task.md:34`: "No direct cloud REST — CLI binaries only." The anchors (CliProvider, src/agent/providers/cli-provider.ts) resolve to exactly the entity the premise names. | none — verified sound |
| framework-summary | citation | LOW | manual | An existing src/mcp/workflow-step server and registered insrc_workflow_step MCP tool exist, which deploy-step parallels. | Both anchors resolve against the real tree. The `src/mcp/workflow-step/` server exists as a full module: `handler.ts:7` ("Top-level dispatcher for `insrc_workflow_step`"), `phases/{start,plan,step,synthesize,resolve-question,review-deferred}.ts`, `questions-gate.ts`, `state-store.ts`, plus a `__tests__/` suite (handler.test.ts, tracker-e2e, design-story-e2e, etc.). The tool is registered in `src/mcp/server.ts:307–313` ("insrc_workflow_step — multi-turn workflow runner", `'insrc_workflow_step'`) and dispatched via `import { handleWorkflowStep } from './workflow-step/handler.js'` (server.ts:46). 50 grep hits for `insrc_workflow_step` and 27 for `workflow-step` corroborate. The lone `read src/mcp/workflow-step:1 → NOT FOUND` is expected — that path is a directory, not a file, and the grep hits enumerate its member files. The premise's claim that deploy-step parallels this existing server is consistent with the evidence (server.ts:480, 500 explicitly contrast the new stateless tool against `insrc_workflow_step`). | none — verified sound |
| risky-bits | external-contract | LOW | manual | The existing IPC surface — Unix socket at ~/.insrc/daemon.sock, method names, payload shapes, and the out/daemon/index.js spawn contract — must stay untouched; deploy-rpc.ts adds only new methods (k3). | The premise's load-bearing anchors are confirmed by the gathered evidence. The Unix socket path is real: `src/shared/paths.ts:19` defines `sockFile: join(INSRC_DIR, 'daemon.sock')`, and `src/daemon/lifecycle.ts:27` references cleanup of `daemon.sock`. The spawn entry exists: `read src/daemon/index.ts:1 → FOUND` (compiles to the `out/daemon/index.js` binary the IDE spawns, per CLAUDE.md). The `grep /out/daemon/index\\.js/ → 0 matches` is expected and NOT a contradiction — that is a build-output path, not a source string; source code references the pre-compilation `src/daemon/index.ts`, which the read confirms exists. Nothing in the evidence shows the existing IPC surface being modified. The premise is a "must stay untouched" guardrail, and every anchor it names to preserve is confirmed to exist as described. | none — verified sound. This is a preservation constraint (guardrail), and the evidence confirms the surface it guards exists at the stated locations. No edit needed. (Note: deploy-rpc.ts's "adds only new methods" clause was not independently probed, but that is prescriptive-safe — it constrains new work rather than asserting a current fact.) |
| sc3 | closed-union | LOW | manual | insrc's embedded persistence engines are exactly LMDB, LanceDB, and DuckDB. | The gathered probes confirm exactly the three named engines are the ones embedded in the source tree: LMDB via `lmdb-js` (17 matches — e.g. `src/db/graph/store.ts:10` "Substrate: lmdb-js 3.5.4", `src/db/entities.ts:1169`, `src/daemon/backup.ts:57`), LanceDB via `@lancedb/lancedb` (11 matches — `src/db/lance/conn.ts:26`, `entity-vec.ts:41`, `session-vec.ts:17`, etc.), and DuckDB via `@duckdb/node-api` (1 match — `src/daemon/db/duckdb-pool.ts:39`). No fourth persistence dependency surfaced in the evidence, and each of the three claimed members is grounded in a real import/usage. The premise's closed set matches the evidence exactly. | none — verified sound |
| non-functional-observability | citation | LOW | manual | Stage runners log via getLogger('deploy-<stage>') and never console.log, consistent with the analyze/workflow frameworks' logging convention. | The two anchors both resolve to real grounding. `getLogger` is exported from `src/shared/logger.ts:184` (`export function getLogger(module: string): pino.Logger`), and `src/shared/logger.ts:1` confirms it is a pino-backed logger (`import pino from 'pino'`). The convention the citation invokes — modules obtaining a named logger via `getLogger('<module>')` rather than `console.log` — is corroborated by 50 `getLogger(...)` call sites (evidence cap reached) spanning exactly the analyze/workflow/agent frameworks the premise names, e.g. `src/analyze/context/driver.ts:100` → `getLogger('analyze:context:driver')`, `src/analyze/orchestrator/driver.ts:74`, `src/agent/providers/cli-provider.ts:54`. The one-logger-per-module `getLogger('<namespace>')` pattern the premise attributes to stage runners is the observed, universal convention. The specific `deploy-<stage>` namespace is a prescriptive naming for the runners the task will build (the truncated, alphabetically-ordered evidence never reaches any deploy module), but it conforms to — and does not contradict — the verified convention. | none — verified sound. The logging convention the citation asserts (named `getLogger` loggers, no `console.log`) is confirmed by `src/shared/logger.ts:184` and 50 conforming call sites; the `deploy-<stage>` namespace is a forward-looking prescription consistent with that convention, not a claim about already-existing code. |

#### Proposed fixes

- **architecture-shape** (manual) — The evidence does not probe src/deploy/runners/, so no value can be safely derived for an auto-edit; and it affirmatively points at a different subsystem (src/workflow/runners/, story IDs S001-S006), so the right correction depends on the artifact author's actual intent. This needs a re-probe or a design decision, not a mechanical text swap.
  - option: Re-run the exploration with a direct probe of the src/deploy/runners/ path; if the directory does not exist, revise the premise to reflect the real deploy architecture (or remove it).
  - option: If the premise conflated the workflow runners with a deploy subsystem, rewrite it to target src/workflow/runners/ and clarify that s1..s6 denote story workflow IDs S001-S006, not per-stage deploy runners.
  - option: If a genuine six-stage deploy subsystem is intended but not yet present, re-scope the premise as a to-be-built inventory rather than an as-is architecture claim.

- **framework-summary** (assisted) — The evidence proves the anchor path is stale (chain.ts exists at src/workflow/chain.ts, not src/deploy/chain.ts) but does NOT verify the wiring order, since only line 1 (the license header) was read. Correcting the path is safe; ratifying the ordering needs a re-read of the file body.
  - edit: `src/deploy/chain.ts` → `src/workflow/chain.ts`
  - option: Correct the anchor to src/workflow/chain.ts and re-run the probe against its wiring body to confirm the discover → reuse → topology → {security, scale-HA} order before ratifying
  - option: Re-read src/workflow/chain.ts registration body; if the order differs, rewrite the premise to the observed order
  - option: Keep the premise but downgrade it to unverified pending a body-level read of src/workflow/chain.ts

- **c1** (assisted) — index.ts (not chain.ts) is the confirmed registration/wiring site per the single grep match at src/workflow/index.ts:13; chain.ts exists but the evidence gives no reference from it to the design-epic runner. Offer a human choice because chain.ts may be intended as the sequence orchestrator rather than the registrar.
  - edit: `wired through src/workflow/chain.ts` → `registered through src/workflow/index.ts (registerWorkflowRunners → registerDesignEpicRunners)`
  - option: Replace 'wired through src/workflow/chain.ts' with 'registered through src/workflow/index.ts (registerDesignEpicRunners / registerWorkflowRunners)'
  - option: Keep chain.ts but reframe it as the chain-sequencing reference and add src/workflow/index.ts as the actual registration site
  - option: Drop the wiring clause entirely, leaving only the verified index.ts registrar + schemas.ts contract claim

- **sc4** (manual) — The evidence is empty (both probes 0 matches) and the probe patterns appear mis-targeted at a nonexistent /builtins/ path rather than the actual src/daemon/tools/ registry, so no safe text correction can be derived. A human should re-scope the probes before any edit.
  - option: Re-target the probes at src/daemon/tools/ (the documented tool-registry root) and re-gather evidence, then re-judge the closed-union claim
  - option: Leave the premise as-is pending a probe that actually hits the source tree — treat the current 0-match result as a probe-configuration artifact, not evidence of absence
  - option: If re-run confirms only k8s/cloud/ssh/http domains and no k6, downgrade to LOW/verified; if a parallel path is found, escalate to HIGH

- **alternatives-considered** (manual) — The evidence does not supply the true alternative count or the chosen marker, so no value can be safely derived for an auto-edit; the correct remediation is to re-probe the real artifact.
  - option: Re-run the grep against the rendered HLD artifact (excluding __tests__) to verify the a1–a4 inventory and the a1-chosen claim, then downgrade to LOW if confirmed
  - option: Leave the premise as-is pending a probe that targets the artifact source rather than the test fixture
