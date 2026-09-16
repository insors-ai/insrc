<!-- insrc:artifact HLD-914cbf5ea9026b92 -->

# HLD: Pipeline-integrated external-service graph tracing

## Framework summary

Pipeline-integrated external-service graph tracing. The graph gains one new node kind (ExternalEndpoint, carrying a protocol + resolved/unresolved tag) and four typed boundary edge kinds (CALLS_HTTP, PUBLISHES_TO, SUBSCRIBES_TO, CALLS_RPC), added once to the graph vocabulary and gated by a graph-schema migration so existing indexes evolve without a full re-index. Per-language outbound and inbound detectors run as thin plugins inside the existing tree-sitter parse; a shared protocol-agnostic resolution engine turns indirect/configured targets into a concrete identity (or an explicit unresolved marker) from layered config sources with a fixed precedence. Cross-repo linking is a separate daemon-side matching pass, keyed off a per-repo service-identity registry, that forms a real dependency edge onto the target repo's actual handler entity and inserts it into the DEPENDS_ON closure; the same pass, re-fired on repo register/re-index events, is the out-of-order backfill.

## Architecture shape

Five cross-cutting contracts layer the capability. S001 owns the graph vocabulary (sc1): the ExternalEndpoint node model, the four boundary edge kinds, the per-repo deterministic dedup id, and the rule that these edges participate in the DEPENDS_ON closure. S002 owns the resolution engine (sc2): raw target expression -> concrete identity | unresolved, drawing on config entities + .env + k8s + docker with precedence; it is a pure resolver and does not itself write graph nodes (the outbound detectors S003/S004/S005 consume sc1 + sc2 to materialize endpoint nodes + edges, which is why S002 sits as an independent provider rather than depending on S001). S006 owns the inbound-handler contract (sc4): the handler-class marker on a real function/method entity plus the per-repo lookup of what a repo accepts. S007 owns the service-identity registry (sc3): each registered repo's declared identity (name + base URL/topic namespaces), auto-inferred with operator override, plus the enumeration matching keys off. S008 owns cross-repo matching (sc5): given an outbound endpoint, the service-identity registry, and inbound handlers, produce the single specificity-ranked best-match edge (or none, endpoint-only) terminating on the real handler entity and joining the closure. S009 re-invokes sc5 on registry/re-index events to backfill and revise cross-repo edges. Every contract is owned by a story that all of its consumers already (transitively) depend on.

## Shared contracts

### sc1: ExternalEndpoint graph vocabulary

**Owner Story:** `s1`
**Consumed by:** `s3`, `s4`, `s5`, `s8`, `s9`

**Purpose:** The first-class node kind + four typed boundary edge kinds for external-service dependencies, the per-repo deterministic endpoint id, and their participation in the DEPENDS_ON closure. Foundation every detector + the matcher writes into.

**Interface sketch (type-level):**

```
type ExternalProtocol = 'http' | 'messaging' | 'rpc';
// EntityKind gains 'externalEndpoint'; RelationKind gains the four boundary kinds below.
interface ExternalEndpointEntity {
  kind: 'externalEndpoint';
  repo: string;
  protocol: ExternalProtocol;
  resolved: boolean;              // false => could not be statically pinned
  target: string;                // resolved host+path | topic/queue | rpc service.method ; '' when unresolved
  rawExpression?: string;        // present only when resolved === false
  // deterministic per-repo id: SHA256(repo + '' + 'externalEndpoint' + protocol + ':' + (target || rawExpression)), hex-32
}
type ExternalBoundaryRelation = 'CALLS_HTTP' | 'PUBLISHES_TO' | 'SUBSCRIBES_TO' | 'CALLS_RPC';
// closure rule: an ExternalBoundaryRelation and any cross-repo edge built on it are treated as
// DEPENDS_ON-closure edges by the traversal, so closure queries reach them.
```

**Assumptions cited:** [[c1]]

### sc2: Target resolution engine

**Owner Story:** `s2`
**Consumed by:** `s3`, `s4`, `s5`

**Purpose:** Turn an indirect/configured outbound target expression into a concrete identity, or an explicit unresolved marker, using layered config sources with a fixed precedence. A pure resolver consumed by every outbound detector.

**Interface sketch (type-level):**

```
type ExternalProtocol = 'http' | 'messaging' | 'rpc';
type ResolvedTarget =
  | { resolved: true;  protocol: ExternalProtocol; identity: string }   // concrete host+path | topic | service.method
  | { resolved: false; rawExpression: string };
// precedence when several sources define the same key: deploy-time (k8s | docker) > env-file > local-config-default
type ConfigSourceLayer = 'k8s' | 'docker' | 'envFile' | 'localConfig';
interface TargetResolver {
  resolve(repo: string, protocol: ExternalProtocol, rawExpression: string): ResolvedTarget;
}
```

**Assumptions cited:** [[c2]]

### sc3: Per-repo service-identity registry

**Owner Story:** `s7`
**Consumed by:** `s8`, `s9`

**Purpose:** Each registered repo's declared service identity (name + base URL / topic namespaces), auto-inferred with operator override, plus the enumeration of registered identities that cross-repo matching + backfill key off.

**Interface sketch (type-level):**

```
interface ServiceIdentity {
  serviceName: string;
  baseUrls: readonly string[];        // host (+ optional path prefix) namespaces this repo serves
  topicNamespaces: readonly string[]; // topic/queue prefixes this repo owns
  source: 'inferred' | 'override';    // override wins over the auto-inferred default
}
interface ServiceIdentityRegistry {
  identityFor(repoId: number): ServiceIdentity | undefined;
  registeredIdentities(): readonly { repoId: number; identity: ServiceIdentity }[];
}
```

**Assumptions cited:** [[c4]]

### sc4: Inbound-handler marker + lookup

**Owner Story:** `s6`
**Consumed by:** `s8`, `s9`

**Purpose:** The handler-class marker recorded on a real function/method entity (the callee half of a cross-service link) and the per-repo lookup of what inbound targets a repo accepts.

**Interface sketch (type-level):**

```
type InboundHandlerClass = 'route' | 'consumer' | 'rpcMethod';
interface InboundHandlerMark {
  entityId: string;                 // id of the existing function/method entity that handles requests
  handlerClass: InboundHandlerClass;
  accepts: string;                  // route path | topic/queue | rpc service.method this handler serves
}
interface InboundHandlerIndex {
  handlersFor(repoId: number): readonly InboundHandlerMark[];
}
```

**Assumptions cited:** [[c2]]

### sc5: Cross-repo matcher + closure edge

**Owner Story:** `s8`
**Consumed by:** `s9`

**Purpose:** Given an outbound endpoint, the service-identity registry, and inbound handlers, produce the single specificity-ranked best-match cross-repo edge (or none, staying endpoint-only) that terminates on the target repo's real handler entity and participates in the DEPENDS_ON closure.

**Interface sketch (type-level):**

```
interface CrossRepoMatch {
  outboundEndpointId: string;
  targetRepoId: number;
  targetHandlerEntityId: string;    // the real function/method entity the cross-repo edge terminates on
}
interface CrossRepoMatcher {
  // single specificity-ranked best match; null on a genuine tie or no match (endpoint stays endpoint-only)
  match(endpoint: ExternalEndpointEntity, callerRepoId: number): CrossRepoMatch | null;
}
// applying a CrossRepoMatch inserts a DEPENDS_ON-closure-participating edge callerRepo -> targetHandlerEntity
```

**Assumptions cited:** [[c4]]

## Story boundaries

### Story E20260806914cbf5e:S001

**Owns:** `sc1`

The concrete LMDB codec encoding for the new node/edge kinds, the graph-schema migration that evolves already-stored indexes to carry them, and the exact traversal change that makes boundary/cross-repo edges count as DEPENDS_ON-closure edges are all internal to S001 — consumers see only the sc1 node/edge vocabulary + the closure guarantee, not how it is serialized or migrated.

### Story E20260806914cbf5e:S002

**Owns:** `sc2`

How each config source is parsed — the Docker parser (Dockerfile ENV / docker-compose environment/env_file / container env), the .env parser, the reuse of the k8s built-in tool namespace, and the reuse of already-indexed config entities — plus the precedence-merge logic and the expression-evaluation that decides whether a target is pinnable, all stay private to S002. Consumers see only resolve(...) -> ResolvedTarget.

### Story E20260806914cbf5e:S003

**Depends on:** `sc1`, `sc2`

The per-language (TS/Python/Go/Java/Scala) HTTP-client call-site recognition patterns — which client libraries and call shapes count as an outbound HTTP call, and how the URL argument expression is extracted for handing to the resolver — are entirely internal to S003; nothing else consumes S003's detector.

### Story E20260806914cbf5e:S004

**Depends on:** `sc1`, `sc2`

The per-language producer/consumer call-site recognition for messaging clients (which publish/subscribe APIs count, how the topic/queue argument is extracted, and how publish-vs-subscribe direction is decided) is private to S004.

### Story E20260806914cbf5e:S005

**Depends on:** `sc1`, `sc2`

The per-language typed-RPC stub-call recognition (which generated-client call shapes count as a gRPC/Thrift invocation and how the service+method target is extracted) is private to S005.

### Story E20260806914cbf5e:S006

**Owns:** `sc4`

The per-language framework-aware recognition of route registrations, message-consumer subscriptions, and RPC service implementations — the specific decorators/annotations/registration shapes per framework, and the graceful skip for unrecognized frameworks — is internal to S006; consumers see only the InboundHandlerMark records + the per-repo lookup.

### Story E20260806914cbf5e:S007

**Owns:** `sc3`

The auto-inference signals that produce a repo's default identity (the exact precedence among manifest package name, k8s Service name, and directory-name fallback — the detail the spec deferred to design) and the per-repo config surface that carries the operator override are internal to S007; consumers see only the resolved ServiceIdentity + the registered-identities enumeration.

### Story E20260806914cbf5e:S008

**Owns:** `sc5`
**Depends on:** `sc1`, `sc3`, `sc4`

The specificity-ranking algorithm that scores candidate identities (how an exact host+path prefix beats a bare-domain match, and how a genuine tie is detected), and the mechanics of writing the cross-repo edge onto the resolved handler entity + into the closure, are internal to S008; S009 consumes only the CrossRepoMatcher contract.

### Story E20260806914cbf5e:S009

**Depends on:** `sc1`, `sc3`, `sc4`, `sc5`

Which registry/re-index events trigger a re-match, how the set of affected outbound endpoints to re-evaluate is scoped (only those whose match could have changed), and how stale cross-repo edges are revised or removed on identity change/removal, are internal to S009.

## Non-functional targets

- **Performance:** Detection reuses the single existing tree-sitter parse per file — no second parse pass is added to indexing. The cross-repo matching pass is bounded per registry/re-index event (it re-evaluates only endpoints whose match could have changed), not a full-workspace rescan on every index.
- **Security:** Detection is static and at-rest — config, .env, k8s, and docker sources are read as text, never executed (k6). Resolution uses config/secret values only to derive a service IDENTITY (host/topic/service string) recorded as the endpoint target; raw secret contents beyond the resolved identity string are not persisted as graph data.
- **Observability:** Unresolved endpoints are first-class and queryable (they carry the raw expression), so coverage gaps are visible rather than silent; cross-repo edges vs endpoint-only outcomes are distinguishable so an operator can see where matching did and did not link.
- **Durability:** New nodes/edges use deterministic ids (repo + resolved target), and the vocabulary lands behind a graph-schema migration, so re-indexing is stable and idempotent and existing indexes evolve without a destructive full rebuild.

## Rollout

### Phase A — Graph foundation + resolution

**Stories:** `s1`, `s2`
**Flag:** `externalServiceGraph`

S001 lands the ExternalEndpoint node/edge vocabulary + closure participation (sc1) and S002 lands the target-resolution engine (sc2). Both are dependency roots and own the two contracts every outbound detector consumes, so nothing else can be built until they exist.

**Backward compat:** The graph-schema migration that introduces the new node/edge kinds must be strictly additive: existing entities, edges, codecs, and closure traversals for repos with no external-service edges must behave byte-identically, and an index written before the migration must still read correctly.

### Phase B — Detection: outbound classes + inbound handlers + service identity

**Stories:** `s3`, `s4`, `s5`, `s6`, `s7`
**Flag:** `externalServiceGraph`

With the vocabulary + resolution in place, the three outbound detectors (S003 HTTP, S004 messaging, S005 RPC — each consuming sc1 + sc2), the inbound-handler recognizer (S006, owning sc4), and the service-identity registry (S007, owning sc3) are all independent slices that depend only on Phase A. They can be built in parallel; each produces facts the cross-repo matcher will later consume.

**Backward compat:** Detection must never fail indexing: an unrecognized framework or an unresolvable target degrades to an unmarked handler / an unresolved endpoint, so existing entity/relation extraction is unaffected for any repo.

### Phase C — Cross-repo linking

**Stories:** `s8`
**Flag:** `externalServiceGraph`

S008 (cross-repo matcher, owning sc5) consumes the outbound endpoints (sc1), the service-identity registry (sc3), and the inbound handlers (sc4) produced in Phase B, so it can only run once all of Phase B exists. It forms the specificity-ranked best-match edge onto the real handler entity and joins it to the closure.

**Backward compat:** Matching only ADDS cross-repo edges; intra-repo endpoints and edges from Phase B remain exactly as written, and a repo with no matchable targets is unchanged (endpoint-only).

### Phase D — Out-of-order backfill

**Stories:** `s9`
**Flag:** `externalServiceGraph`

S009 re-invokes the matcher (sc5) on repo register/re-index events to retroactively upgrade previously-unmatched endpoints and revise stale cross-repo edges, so it depends on S008 being complete. It closes the loop for a growing/changing workspace.

**Backward compat:** Backfill must be idempotent — re-running match on an already-matched endpoint yields the same edge — and must only revise cross-repo edges whose match actually changed, never touching intra-repo graph data.

**Ordering rationale:** Phases follow the Epic dependency graph and shared-contract ownership: Phase A owns the two foundational contracts (sc1 vocabulary, sc2 resolution) that every consumer needs; Phase B is the parallel detection layer (outbound S003/S004/S005 consume sc1+sc2; inbound S006 owns sc4; identity S007 owns sc3) — all depend only on Phase A; Phase C (S008) consumes every Phase-B output to form the cross-repo edge; Phase D (S009) depends on S008's matcher. A single feature flag gates the whole capability so partial phases never surface incomplete external-service edges to closure queries until the layer is complete.

### Risky bits

| Area | Why | Mitigation |
| :--- | :--- | :--- |
| Graph-schema migration for the new node/edge kinds (S001) | Adding a new EntityKind + four RelationKinds to the stored-graph codec + closure traversal risks corrupting or mis-reading already-indexed repos that predate the change. | Land the change through the existing migrations.ts seam as a strictly additive migration; keep the new kinds additive to the unions so existing codec/traversal paths for repos without external edges are untouched; cover the pre-migration-index read path with tests before enabling detection. |
| Per-language detector accuracy (5 languages × 3 protocols, S003/S004/S005/S006) | Framework-aware static detection across 15 language×protocol combinations plus inbound handlers will inevitably miss some frameworks and mis-shape some call-sites, risking false or missing endpoints. | Honour k5 — unresolved targets are never dropped (kept as unresolved endpoints) and unrecognized frameworks are silently skipped, so recall stays high and misses are visible rather than fatal; drive each detector with per-language fixture repos so accuracy is measured, not assumed. |
| Cross-repo over-linking polluting the DEPENDS_ON closure (S008) | A wrong or overly-broad identity match would insert a spurious cross-repo edge that widens every closure query from the caller — the accuracy failure k5 warns against. | Form at most one edge via specificity-ranked best-match, and on a genuine tie form none (endpoint-only); match only against declared per-repo service identities (never raw strings); keep the backfill re-match bounded to endpoints whose match could actually have changed so a bad identity edit cannot silently fan out. |

## Alternatives considered

### a1: Pipeline-integrated detection with a shared endpoint/resolution core + a separate event-driven matching pass — **CHOSEN**

Per-language outbound/inbound detectors are thin plugins on the existing tree-sitter parsing harness; a shared protocol-agnostic core owns the ExternalEndpoint node model + layered config resolution + per-repo dedup; cross-repo matching is a distinct daemon-side pass keyed off the service-identity registry and triggered event-driven on register/re-index.

The graph vocabulary (one ExternalEndpoint EntityKind + four RelationKinds) lands once in shared/types.ts and the graph codec, gated by a graph migration so existing indexes evolve without a full re-index. A single shared 'endpoint core' owns everything protocol-agnostic: the layered config-resolution engine (config entities + .env + k8s + docker with precedence), the per-repo deterministic dedup id (repo + resolved target), and the resolved/unresolved tagging. Each per-language outbound detector (HTTP, messaging, RPC) and the inbound-handler detector are thin plugins that run inside the existing per-language parse of the indexer, emitting call-site facts the shared core turns into endpoint nodes + typed boundary edges. This keeps detection where the AST already is and keeps the endpoint lifecycle in one place.

Cross-repo linking is deliberately decoupled from detection: outbound endpoints and inbound-handler marks are written at index time (intra-repo only), and a separate daemon-side matching pass — running against the per-repo service-identity registry — forms the cross-repo edge onto the target repo's real handler entity and inserts it into the DEPENDS_ON closure. Because matching is its own pass fired by repo register/re-index events, out-of-order registration is handled by simply re-running the pass (the backfill), and the service-identity registry (auto-inferred + config-overridable) is the single source both matching and backfill key off. The story slicing falls straight out of this shape: S001 vocab, S002 core resolution, S003–S005 outbound detector plugins, S006 inbound detector, S007 identity registry, S008 matching pass, S009 backfill trigger.

**Pros:**
- Detection reuses the existing per-language tree-sitter parse (one parse per file, no second read pass), so it adds no separate file-scanning stage to indexing.
- The shared endpoint core means the dedup id rule, resolution precedence, and unresolved-tagging are defined once and reused by all three outbound detectors + messaging/RPC — no per-protocol drift.
- Decoupling matching from detection lets cross-repo edges be (re)computed on registry events without re-indexing caller repos, which is exactly what S009's out-of-order backfill needs.
- The 9 stories map 1:1 onto the components (vocab / core / 3 detectors / inbound / identity / matching / backfill), so each is an independently buildable + testable slice with a clear owned contract.

**Cons:**
- Requires a graph-codec migration to introduce the new node/edge kinds into already-stored indexes — a schema-evolution step with its own backward-compat burden.
- The shared endpoint core is a cross-cutting contract consumed by six stories (S002–S007), so it must be designed right up front (owned by the early stories) or later detectors get blocked.

**Cost estimate:** L

### a2: Post-index analyzer pass (detection as a separate stage over the built graph + raw files)

Leave the indexer untouched; run external-service detection as a separate post-index analyzer stage that re-reads each repo's files, emits endpoint nodes/edges + inbound marks, then matches cross-repo — all outside the hot indexing path.

Rather than extending the per-language parsers, a new standalone analyzer stage runs after normal indexing completes for a repo. It re-reads the repo's source files (and config/env/k8s/docker sources), applies its own outbound/inbound pattern detection per language, and writes ExternalEndpoint nodes, boundary edges, and inbound-handler marks into the existing graph. Cross-repo matching + backfill run as later phases of the same stage, keyed off the service-identity registry.

This keeps the external-service capability wholly separable from the core indexer: it can be enabled/disabled as a unit and iterated without risk to the hot parse path. The story slices are similar (vocab, resolution, per-protocol detectors, inbound, identity, matching, backfill) but every detector runs in the analyzer stage rather than as a parse plugin.

**Pros:**
- The core indexer parse path is never touched, so there is zero risk of regressing existing entity/relation extraction while the epic is built.
- The whole capability is a single toggleable stage, making it easy to run selectively or roll back as one unit.
- Detection logic is free to use whatever parsing/matching it wants without conforming to the per-language parser plugin shape.

**Cons:**
- Re-reads and re-parses every source file a second time (once for the indexer, once for this stage), roughly doubling per-repo file I/O + parse cost for indexed repos — directly at odds with reusing the existing single parse.
- Detection cannot reuse the indexer's already-resolved AST + symbol tables, so per-language call-site recognition must be re-implemented against raw parses, duplicating language handling the indexer already does.
- Two parse passes can diverge (a symbol the indexer resolved that the analyzer re-parse does not), risking endpoint edges that do not line up with the code entities the graph already holds.

**Cost estimate:** L

**Rejected because:** Satisfies five constraints but drops to partial on k5: a second independent parse can diverge from the indexer's resolved entities, so endpoint edges may not line up with the real code entities — an accuracy risk against the top stakeholder priority — and roughly doubles per-repo parse cost for no correctness gain over a1 (rank 2).

### a3: Monolithic cross-service resolver service (one module owns detection + resolution + matching + backfill)

A single daemon service owns the entire endpoint lifecycle — per-language extraction, resolution, dedup, cross-repo matching, and backfill — with thin per-language extractors feeding one central engine.

All external-service concerns live behind one service boundary: thin per-language extractors emit raw call-site/handler facts, and a single central engine does resolution, node/edge creation, per-repo dedup, service-identity matching, and backfill. The graph vocabulary is still added to shared/types.ts, but every behavioural rule (resolution precedence, dedup, matching, tie-break, closure insertion, backfill) is centralized in this one service.

The appeal is a single place to reason about the endpoint lifecycle end-to-end. The cost is that the 9 stories no longer map to separable components — they become internal phases of one module that must largely be built together, since detection, resolution, and matching are interwoven rather than layered.

**Pros:**
- One module owns the complete endpoint lifecycle, so there is a single place to trace how a call-site becomes a resolved endpoint and then a cross-repo edge.
- No cross-component contract to keep in sync — resolution, dedup, and matching share in-process state directly.

**Cons:**
- Detection, resolution, and matching are fused into one module, so the epic's 9 stories cannot be built or tested as independent slices — undermining incremental delivery and per-story review.
- Fusing index-time detection with the event-driven cross-repo matching pass forces matching to run in the hot index path or bolts an event loop onto a module that is also a parser consumer, coupling two concerns with very different trigger cadences.
- A single god-module concentrates the whole capability's blast radius, so any change (a new framework detector, a resolution-source tweak) risks the matching + backfill paths in the same unit.

**Cost estimate:** L

**Rejected because:** Satisfies the schema/closure/accuracy constraints but drops to partial on k4 (index-fused matching handles registry-driven out-of-order backfill poorly) and collapses the epic's nine independently-deliverable, independently-reviewable stories into one god-module — the worst fit for incremental delivery (rank 3).

## Citations

- **[[c1]]** `analyze-bundle` `s1 data-model.trace — EntityKind/RelationKind vocabulary + deterministic id (src/shared/types.ts)` — "EntityKind is code-only + RelationKind intra-code; no ExternalEndpoint/boundary kind exists; entity id = SHA256(repo+file+kind+name) hex-32 — the surface sc1 extends and the per-repo endpoint dedup id"
- **[[c2]]** `analyze-bundle` `s1 module.profile — tree-sitter indexer + package-manifest parsing (src/indexer, manifest.ts, parser/)` — "The per-language parse harness where the outbound (sc2 consumers) + inbound (sc4) detectors attach; manifest.ts parses only package deps, so the layered config/.env/k8s/docker resolver (sc2) is new co"
- **[[c3]]** `analyze-bundle` `s1 module.profile — LMDB graph layer codec/ids/traversal/migrations (src/db/graph)` — "codec.ts + ids.ts host the node/edge serialization + deterministic ids sc1 extends; traversal.ts hosts transitiveClosure the cross-repo edge (sc5) must join; migrations.ts is the additive-migration se"
- **[[c4]]** `analyze-bundle` `s1 module.profile + usage.example — repo registry (src/db/repos.ts) + indexing queue (src/daemon/queue.ts) + k8s builtin (src/daemon/tools/builtins/k8s)` — "db/repos.ts is where the per-repo service identity (sc3) attaches and what cross-repo matching/backfill key off; the daemon queue's register/re-index events trigger the S009 backfill; the k8s builtin "

<!-- insrc:review -->

## Review

### ✅ Review `PASS` — design.epic (design.epic)

**0 HIGH · 0 MED · 7 LOW** · model `client` · reviewed 2026-08-06T16:05:52.003Z

| Ref | Kind | Severity | Fixability | Premise | Evidence | Action |
| --- | --- | --- | --- | --- | --- | --- |
| sc1/c1 | citation | LOW | auto | The graph vocabulary sc1 extends lives in src/shared/types.ts (EntityKind + RelationKind unions + deterministic entity id). | read src/shared/types.ts:515 -> FOUND `export type EntityKind =`; RelationKind also present — the vocabulary sc1 extends is real. | None — citation verified. |
| s1/c3 | citation | LOW | auto | The LMDB graph layer has a migrations seam (migrations.ts) and a closure traversal (transitiveClosure) that S001/S008 build on. | src/db/graph/migrations.ts + traversal.ts both resolve; transitiveClosure has 35 matches — the migration seam (S001) + closure traversal (S008) exist. | None — citation verified. |
| s1/c3 | citation | LOW | auto | The graph codec (codec.ts) + deterministic ids (ids.ts) are the surfaces the new node/edge kinds + endpoint dedup id extend. | src/db/graph/codec.ts + ids.ts both resolve — the node/edge serialization + deterministic-id surfaces sc1 extends are real. | None — citation verified. |
| sc3/c4 | citation | LOW | auto | The repo registry src/db/repos.ts is where the per-repo service identity (sc3) attaches and what cross-repo matching/backfill key off. | src/db/repos.ts resolves with repo/repoId references — the registry where sc3 attaches + matching/backfill key off is real. | None — citation verified. |
| sc2/c2 | citation | LOW | auto | The tree-sitter indexer (src/indexer, manifest.ts, parser/) is the per-language parse harness the detectors attach to; manifest.ts parses only package-dependency manifests, so the config/.env/k8s/docker resolver is new. | src/indexer/manifest.ts:19 -> FOUND `export function parseManifest(...)` — the package-only manifest parser; the config/.env/k8s/docker resolver (sc2) is genuinely new construction on the existing parse harness. | None — citation verified. |
| s1/c4 | citation | LOW | auto | A k8s built-in tool namespace exists (src/daemon/tools/builtins/k8s) that the resolution engine can reuse as a deploy-time config source. | src/daemon/tools/builtins/k8s/index.ts resolves — the k8s builtin the resolution engine reuses as a deploy-time source exists. | None — citation verified. |
| architecture/ownership | semantic | LOW | auto | Every shared contract is owned by a story that all its consumers transitively depend on (sc1@s1->s3/s4/s5/s8/s9; sc2@s2->s3/s4/s5; sc3@s7->s8/s9; sc4@s6->s8/s9; sc5@s8->s9), so the ownership graph is acyclic and consistent (cg1/cg2/cg3). | Design-internal consistency: the HLD finalized without a contract-dependency-graph error, meaning cg1 (acyclic) + cg2 (consumers downstream of owners) + cg3 (depends == inverse of consumedByStories) all hold for sc1@s1->s3/s4/s5/s8/s9, sc2@s2->s3/s4/s5, sc3@s7->s8/s9, sc4@s6->s8/s9, sc5@s8->s9. | None — ownership graph verified consistent + acyclic. |
